import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPool, publishFiles, StudioRepoError } from './repo';
import { LOG_JSON_PATH } from './publish';

/**
 * GitHub 提交这条路没法对着真仓库跑（要 token、且会真的写东西），
 * 所以把 fetch 打桩，钉住三件在真实环境里出错最贵的事：
 *   ① 请求序列与载荷形状（blob → tree → commit → 移动分支引用）；
 *   ② 并发检查真的会拒绝（否则两个标签页互相覆盖，丢的是已发布的日志）；
 *   ③ 401/404 给的是能照着修的中文报错，不是原始 JSON。
 */

type Call = { url: string; method: string; body: any };

function stubGitHub(overrides: { entriesSha?: string; images?: unknown } = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method, body });
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });

    if (url.includes(`/contents/${LOG_JSON_PATH}`)) {
      return json({
        sha: overrides.entriesSha ?? 'sha-entries',
        encoding: 'base64',
        content: Buffer.from('[]', 'utf8').toString('base64'),
      });
    }
    if (url.includes('/contents/public/log')) {
      return overrides.images === undefined
        ? new Response('nope', { status: 404 })
        : json(overrides.images);
    }
    if (url.includes('/git/ref/heads/')) return json({ object: { sha: 'head-commit' } });
    if (url.includes('/git/commits/head-commit')) return json({ tree: { sha: 'head-tree' } });
    if (url.endsWith('/git/blobs')) return json({ sha: `blob-${calls.length}` });
    if (url.endsWith('/git/trees')) return json({ sha: 'new-tree' });
    if (url.endsWith('/git/commits')) {
      return json({ sha: 'new-commit', html_url: 'https://github.com/o/r/commit/new-commit' });
    }
    if (url.includes('/git/refs/heads/')) return json({});
    throw new Error(`打桩没覆盖的请求：${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

const FILES = [
  { path: LOG_JSON_PATH, content: '[]\n', encoding: 'utf-8' as const },
  { path: 'public/log/a.webp', content: 'AAAA', encoding: 'base64' as const },
];

describe('GitHub 发布', () => {
  beforeEach(() => {
    process.env.STUDIO_GITHUB_TOKEN = 'token-for-test';
    process.env.STUDIO_REPO = 'o/r';
    process.env.STUDIO_BRANCH = 'main';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.STUDIO_GITHUB_TOKEN;
    delete process.env.STUDIO_REPO;
    delete process.env.STUDIO_BRANCH;
  });

  it('按 blob → tree → commit → 移动引用的顺序打一个 commit', async () => {
    const calls = stubGitHub();
    const res = await publishFiles(FILES, 'log: test', 'sha-entries');

    expect(res.mode).toBe('github');
    expect(res.url).toContain('/commit/new-commit');

    const seq = calls.map((c) => `${c.method} ${c.url.split('/repos/o/r')[1]}`);
    expect(seq[0]).toContain(`GET /contents/${LOG_JSON_PATH}`); // 并发检查
    expect(seq).toContain('GET /git/ref/heads/main');
    expect(seq).toContain('GET /git/commits/head-commit');
    expect(seq.filter((s) => s === 'POST /git/blobs')).toHaveLength(2);
    expect(seq[seq.length - 1]).toBe('PATCH /git/refs/heads/main');

    // 两个 blob 各自带对的编码（图片是 base64，JSON 是 utf-8）
    const blobs = calls.filter((c) => c.url.endsWith('/git/blobs')).map((c) => c.body);
    expect(blobs.map((b) => b.encoding).sort()).toEqual(['base64', 'utf-8']);

    // tree 接在原树上（base_tree），只列这次改的两个文件，普通文件模式
    const tree = calls.find((c) => c.url.endsWith('/git/trees'))!.body;
    expect(tree.base_tree).toBe('head-tree');
    expect(tree.tree.map((t: { path: string }) => t.path)).toEqual([
      LOG_JSON_PATH,
      'public/log/a.webp',
    ]);
    expect(new Set(tree.tree.map((t: { mode: string }) => t.mode))).toEqual(new Set(['100644']));

    // commit 挂在当前 HEAD 之后（不是孤儿 commit，不覆盖历史）
    const commit = calls.find((c) => c.url.endsWith('/git/commits'))!.body;
    expect(commit).toMatchObject({ tree: 'new-tree', parents: ['head-commit'], message: 'log: test' });
    // 引用移动不许 force
    expect(calls[calls.length - 1].body).toEqual({ sha: 'new-commit', force: false });
    // 编辑器要用它更新并发基准
    expect(res.entriesSha).toBeTypeOf('string');
  });

  it('内容池被别处改过 → 拒绝发布，且一个字都没写出去', async () => {
    const calls = stubGitHub({ entriesSha: 'someone-else-published' });
    await expect(publishFiles(FILES, 'log: test', 'sha-i-loaded')).rejects.toMatchObject({
      conflict: true,
    });
    expect(calls.some((c) => c.method !== 'GET')).toBe(false);
  });

  it('没带 baseSha（本地模式载入的草稿）不做并发检查，照常提交', async () => {
    stubGitHub({ entriesSha: 'whatever' });
    const res = await publishFiles(FILES, 'log: test', null);
    expect(res.mode).toBe('github');
  });

  it('token 无效 → 报错说的是「权限不足」而不是原始 JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Bad credentials"}', { status: 401 })));
    await expect(publishFiles(FILES, 'log: test', null)).rejects.toBeInstanceOf(StudioRepoError);
    await expect(publishFiles(FILES, 'log: test', null)).rejects.toThrow(/STUDIO_GITHUB_TOKEN/);
  });

  it('载入取的是目标分支上的当前版本，并带回 sha 与已有图片名单', async () => {
    stubGitHub({ images: [{ name: 'old.webp', type: 'file' }, { name: 'sub', type: 'dir' }] });
    const pool = await loadPool();
    expect(pool.source).toBe('github');
    expect(pool.sha).toBe('sha-entries');
    expect(pool.entries).toEqual([]);
    expect(pool.images).toEqual(['old.webp']); // 目录不算
  });

  it('public/log 还不存在（第一次传图之前）不是错误', async () => {
    stubGitHub(); // 该路径返回 404
    const pool = await loadPool();
    expect(pool.images).toEqual([]);
  });
});
