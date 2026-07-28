import fs from 'node:fs/promises';
import path from 'node:path';
import { LOG_IMAGE_DIR, LOG_JSON_PATH, type RepoFile } from './publish';

/**
 * Studio 的存储后端：**仓库本身**（2026-07-28 拍板）。
 * 发布 = 用 GitHub API 打一个 commit（entries.json + 新图片，一次一个 commit）→ Vercel 自动部署。
 *
 * 这么选的理由：内容池仍是唯一来源，构建期 zod 校验这道防线不动，每次修改都有 git 历史可回滚，
 * 不新增数据库或图床服务。代价是不即时——保存后约 1–2 分钟才上线，且每次发布算一次 Vercel 部署
 * （Hobby 100 次/天，见 CLAUDE.md 部署纪律），所以编辑器是「改多条 → 一次发布 = 一个 commit」。
 *
 * 没配 token 时（本地 `npm run dev`）自动退化成直接写本地文件：在电脑上写日志不必配任何东西，
 * 写完自己 commit 即可。
 */

export type RepoTarget = { repo: string; branch: string; token: string };

/**
 * 本地模式的绝对路径。turbopackIgnore 是必须的：仓库内相对路径来自变量，
 * 打包器追踪不到具体文件，就会把整个项目当依赖打进函数（构建期会明确警告）。
 * 本地模式只在没有 token 的开发环境走到，生产环境这条路径不执行。
 */
const localPath = (rel: string) => path.join(/* turbopackIgnore: true */ process.cwd(), rel);

const API = 'https://api.github.com';

/** 目标仓库/分支：默认取 Vercel 注入的仓库信息，分支默认 master（生产分支）。 */
export function repoTarget(): RepoTarget | null {
  const token = process.env.STUDIO_GITHUB_TOKEN;
  if (!token) return null;
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;
  const repo = process.env.STUDIO_REPO ?? (owner && slug ? `${owner}/${slug}` : undefined);
  if (!repo) return null;
  return { repo, branch: process.env.STUDIO_BRANCH ?? 'master', token };
}

export class StudioRepoError extends Error {
  constructor(
    message: string,
    readonly conflict = false,
  ) {
    super(message);
  }
}

async function gh<T>(target: RepoTarget, url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${url}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${target.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    const hint =
      res.status === 401 || res.status === 403
        ? 'STUDIO_GITHUB_TOKEN 无效或权限不足（需要该仓库 Contents 读写）'
        : res.status === 404
          ? '仓库 / 分支 / 文件路径不存在（检查 STUDIO_REPO 与 STUDIO_BRANCH）'
          : body.slice(0, 300);
    throw new StudioRepoError(`GitHub ${res.status}：${hint}`);
  }
  return (await res.json()) as T;
}

export type LoadedPool = {
  entries: unknown;
  /** entries.json 当前的 git blob sha；发布时带回来做并发检查。本地模式为 null。 */
  sha: string | null;
  source: 'github' | 'local';
  /** public/log/ 下已有的图片文件名——编辑器起新文件名时用来避免撞名。 */
  images: string[];
};

/**
 * 读取「将要被写回去的那一份」，而不是当前部署里烤进去的那一份。
 * 两者可能不同（比如刚发布还没重新部署完就又打开编辑器），直接编辑旧版会静默丢掉上一次的改动。
 */
export async function loadPool(): Promise<LoadedPool> {
  const target = repoTarget();
  if (target === null) {
    const [raw, images] = await Promise.all([
      fs.readFile(localPath(LOG_JSON_PATH), 'utf8'),
      listLocalImages(),
    ]);
    return { entries: JSON.parse(raw), sha: null, source: 'local', images };
  }

  const file = await gh<{ content: string; encoding: string; sha: string }>(
    target,
    `/repos/${target.repo}/contents/${LOG_JSON_PATH}?ref=${encodeURIComponent(target.branch)}`,
  );
  const text = Buffer.from(file.content, 'base64').toString('utf8');

  // 图片目录可能还不存在（第一次传图之前）——404 不是错误，就是「一张都没有」。
  let images: string[] = [];
  try {
    const dir = await gh<{ name: string; type: string }[]>(
      target,
      `/repos/${target.repo}/contents/${LOG_IMAGE_DIR}?ref=${encodeURIComponent(target.branch)}`,
    );
    images = dir.filter((f) => f.type === 'file').map((f) => f.name);
  } catch {
    images = [];
  }

  return { entries: JSON.parse(text), sha: file.sha, source: 'github', images };
}

async function listLocalImages(): Promise<string[]> {
  try {
    return await fs.readdir(localPath(LOG_IMAGE_DIR));
  } catch {
    return [];
  }
}

export type PublishResult = {
  mode: 'github' | 'local';
  /** GitHub 上这次 commit 的页面地址（本地模式为 null）。 */
  url: string | null;
  files: number;
  /**
   * 新的 entries.json blob sha——编辑器拿它更新自己的并发基准，
   * 这样连续发布第二次不会被并发检查拦住（否则每发一次都要刷新页面）。
   */
  entriesSha: string | null;
};

/** 本地模式：直接落盘，之后由作者自己 commit。 */
async function writeLocal(files: RepoFile[]): Promise<PublishResult> {
  for (const f of files) {
    const abs = localPath(f.path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(
      abs,
      f.encoding === 'base64' ? Buffer.from(f.content, 'base64') : f.content,
    );
  }
  return { mode: 'local', url: null, files: files.length, entriesSha: null };
}

/**
 * 一次提交写完所有文件（blob → tree → commit → 移动分支引用）。
 * 一个 commit 而不是每个文件一个：Vercel 只触发一次部署，git 历史里一次发布也就是一条。
 */
export async function publishFiles(
  files: RepoFile[],
  message: string,
  baseSha: string | null,
): Promise<PublishResult> {
  const target = repoTarget();
  if (target === null) return writeLocal(files);

  // 并发检查：编辑器载入时那份 entries.json 是否还是分支上的当前版本。
  // 不做的话，两个标签页各改一半，后发布的那个会把先发布的悄悄覆盖掉。
  const current = await gh<{ sha: string }>(
    target,
    `/repos/${target.repo}/contents/${LOG_JSON_PATH}?ref=${encodeURIComponent(target.branch)}`,
  );
  if (baseSha !== null && current.sha !== baseSha) {
    throw new StudioRepoError(
      '内容池在别处已被改过（另一个标签页发布过，或直接改了仓库）。刷新页面重新载入后再发布。',
      true,
    );
  }

  const ref = await gh<{ object: { sha: string } }>(
    target,
    `/repos/${target.repo}/git/ref/heads/${encodeURIComponent(target.branch)}`,
  );
  const head = ref.object.sha;
  const headCommit = await gh<{ tree: { sha: string } }>(
    target,
    `/repos/${target.repo}/git/commits/${head}`,
  );

  const blobs = await Promise.all(
    files.map((f) =>
      gh<{ sha: string }>(target, `/repos/${target.repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({
          content: f.content,
          encoding: f.encoding === 'base64' ? 'base64' : 'utf-8',
        }),
      }).then((blob) => ({ path: f.path, sha: blob.sha })),
    ),
  );

  const tree = await gh<{ sha: string }>(target, `/repos/${target.repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: headCommit.tree.sha,
      tree: blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    }),
  });

  const commit = await gh<{ sha: string; html_url: string }>(
    target,
    `/repos/${target.repo}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({ message, tree: tree.sha, parents: [head] }),
    },
  );

  await gh(target, `/repos/${target.repo}/git/refs/heads/${encodeURIComponent(target.branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return {
    mode: 'github',
    url: commit.html_url,
    files: files.length,
    entriesSha: blobs.find((b) => b.path === LOG_JSON_PATH)?.sha ?? null,
  };
}

/** 给编辑器页脚显示「发布到哪」——没配 token 时说清是本地文件模式。 */
export function describeTarget(): string {
  const target = repoTarget();
  return target === null
    ? '本地文件（未配置 STUDIO_GITHUB_TOKEN）'
    : `${target.repo} @ ${target.branch}`;
}
