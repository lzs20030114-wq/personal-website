import { checkLogEntries } from '../site/log-guards';
import { LogEntriesSchema, serializeEntries, sortEntries, type LogEntry } from '../site/log-schema';

/**
 * 「发布」这一步的**纯**逻辑：校验 → 起图片文件名 → 拼出一次提交要写的文件清单。
 * 不碰网络、不碰 fs——所以浏览器里（发布按钮点下去之前）和服务端（真的提交之前）
 * 跑的是同一份代码，两边给出的报错逐字相同。
 */

export const LOG_JSON_PATH = 'content/log/entries.json';
export const LOG_IMAGE_DIR = 'public/log';
/** 图片在站上的引用前缀（public/log/x.webp → /log/x.webp）。 */
export const LOG_IMAGE_URL = '/log/';

/**
 * 一次发布的图片总量上限。Vercel 的函数请求体上限约 4.5MB，留出余量：
 * 撞线时报「分两次发」，而不是让请求在网关上被砍掉、前端只看到一个语焉不详的失败。
 */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const IMAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(webp|jpg|jpeg|png|gif|svg)$/i;

/** 待提交的新图：name = 最终文件名（不含目录），dataBase64 = 文件内容。 */
export type PendingImage = { name: string; dataBase64: string };

export type RepoFile = { path: string; content: string; encoding: 'utf-8' | 'base64' };

export type Prepared =
  | { ok: true; files: RepoFile[]; entries: LogEntry[]; unusedImages: string[] }
  | { ok: false; errors: string[] };

/**
 * 图片文件名：`YYYY-MM-DD-<原名 slug>.<ext>`，与已占用的名字去重。
 * 用日期开头是为了 public/log/ 里按时间自然排序；保留原名的可读部分，
 * 免得半年后回来看是一堆哈希值。
 */
export function imageFileName(
  date: string,
  originalName: string,
  ext: string,
  taken: Iterable<string> = [],
): string {
  const base = originalName.replace(/\.[^./\\]*$/, '');
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '') || 'image';
  const clean = ext.replace(/^\./, '').toLowerCase();
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  let name = `${date}-${slug}.${clean}`;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    name = `${date}-${slug}-${n}.${clean}`;
    n += 1;
  }
  return name;
}

/** zod 的字段路径翻成人话——报错要能直接对应到编辑器里的那一栏。 */
const FIELD_NAMES: Record<string, string> = {
  date: '日期',
  lead: '引句',
  body: '正文',
  tags: '标签',
  label: '标签名',
  blocks: '图 / 表块',
  alt: '替代文字',
  caption: '说明',
  head: '表头',
  rows: '表格行',
  src: '图片文件',
  width: '宽',
  height: '高',
  en: '英文',
  zh: '中文',
};

function describePath(path: readonly PropertyKey[], input: unknown): string {
  const [first, ...rest] = path;
  const date =
    typeof first === 'number' && Array.isArray(input)
      ? ((input[first] as { date?: unknown } | undefined)?.date ?? `第 ${first + 1} 条`)
      : null;
  const tail = rest
    .map((p) => (typeof p === 'number' ? `#${p + 1}` : (FIELD_NAMES[String(p)] ?? String(p))))
    .join(' ');
  if (date === null) return path.length > 0 ? path.join('.') : '（整体）';
  return `${String(date)}${tail ? ` ${tail}` : ''}`;
}

/** zod（形状）+ 守门规则（zod 挡不住但会让站点变坏的事）——构建期用的是同两道。 */
export function validateEntries(
  input: unknown,
): { ok: true; entries: LogEntry[] } | { ok: false; errors: string[] } {
  const parsed = LogEntriesSchema.safeParse(input);
  if (!parsed.success) {
    const seen = new Set<string>();
    const errors: string[] = [];
    for (const issue of parsed.error.issues) {
      const line = `${describePath(issue.path, input)}：${
        issue.code === 'too_small' ? '不能留空' : issue.message
      }`;
      if (seen.has(line)) continue;
      seen.add(line);
      errors.push(line);
      if (errors.length >= 12) break;
    }
    return { ok: false, errors };
  }
  if (parsed.data.length === 0) {
    return { ok: false, errors: ['日志一条都不剩了——发布空池会让 /archive 变成空页面'] };
  }
  const issues = checkLogEntries(parsed.data);
  if (issues.length > 0) {
    return {
      ok: false,
      errors: issues.map((i) => {
        const e = parsed.data[i.index];
        return i.index >= 0 && e ? `${e.date}：${i.message}` : i.message;
      }),
    };
  }
  return { ok: true, entries: parsed.data };
}

/** base64 字符串对应的字节数（不解码，够用来卡上限）。 */
export function base64Bytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

/**
 * 拼出这次提交要写的文件：entries.json 一定写，加上**被条目真正引用**的新图片。
 * 引用了但两边（新上传 / 仓库里已有）都找不到的图 = 直接报错拦下：
 * 那种条目提交上去，线上就是一个裂图，而且构建不会为此失败（没人会发现）。
 */
export function buildCommitFiles({
  entries,
  images = [],
  existingImages = [],
}: {
  entries: unknown;
  images?: PendingImage[];
  existingImages?: string[];
}): Prepared {
  const checked = validateEntries(entries);
  if (!checked.ok) return checked;

  const errors: string[] = [];
  const byName = new Map<string, PendingImage>();
  for (const img of images) {
    if (!IMAGE_NAME.test(img.name)) {
      errors.push(`图片文件名不合法：${img.name}`);
      continue;
    }
    // 内容必须是干净的 base64：脏数据在 GitHub API 那一层才报错的话，前端只会看到一个 422
    if (typeof img.dataBase64 !== 'string' || !/^[A-Za-z0-9+/\s]+={0,2}$/.test(img.dataBase64)) {
      errors.push(`图片内容不是合法的 base64：${img.name}`);
      continue;
    }
    byName.set(img.name, img);
  }

  const have = new Set([...byName.keys(), ...existingImages]);
  const referenced = new Set<string>();
  for (const e of checked.entries) {
    for (const b of e.blocks ?? []) {
      if (b.kind !== 'image') continue;
      const name = b.src.slice(LOG_IMAGE_URL.length);
      referenced.add(name);
      if (!have.has(name)) errors.push(`${e.date}：引用的图片 ${b.src} 不存在（上传丢了？）`);
    }
  }

  const used = [...byName.values()].filter((img) => referenced.has(img.name));
  const total = used.reduce((sum, img) => sum + base64Bytes(img.dataBase64), 0);
  if (total > MAX_IMAGE_BYTES) {
    errors.push(
      `这次要传的图片共 ${(total / 1024 / 1024).toFixed(1)}MB，超过单次 ${(
        MAX_IMAGE_BYTES /
        1024 /
        1024
      ).toFixed(0)}MB 上限——分两次发布`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    entries: sortEntries(checked.entries),
    files: [
      { path: LOG_JSON_PATH, content: serializeEntries(checked.entries), encoding: 'utf-8' },
      ...used.map((img) => ({
        path: `${LOG_IMAGE_DIR}/${img.name}`,
        content: img.dataBase64,
        encoding: 'base64' as const,
      })),
    ],
    // 上传了又没用上的图（加了图块又删掉）不提交——不往仓库里留垃圾
    unusedImages: [...byName.keys()].filter((n) => !referenced.has(n)),
  };
}

/** 提交信息：一行说清改了什么，git log 里可读。 */
export function commitMessage(entries: LogEntry[], imageCount: number): string {
  const bits = [`log: ${entries.length} entries`];
  if (imageCount > 0) bits.push(`${imageCount} image${imageCount === 1 ? '' : 's'}`);
  return `${bits.join(' + ')} (via studio)`;
}
