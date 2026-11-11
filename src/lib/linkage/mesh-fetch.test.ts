import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { fetchMeshBuffer, resetMeshCache } from './mesh-fetch';

const RAW = Uint8Array.from({ length: 4096 }, (_, i) => (i * 37) % 251);
const bytes = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf));
// 拷一份：gzipSync 给的 Buffer 可能是池里的一段，.buffer 会带上整块池
const ok = (body: Uint8Array) => new Response(Uint8Array.from(body), { status: 200 });
const missing = () => new Response(null, { status: 404 });

beforeEach(() => resetMeshCache());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('3D 网格载荷下载（MAPPING §87）', () => {
  it('先拉 gzip 版并在本地解开，得到与原文件逐字节相同的数据', async () => {
    const fetcher = vi.fn(async (url: string) => (url.endsWith('.gz') ? ok(gzipSync(RAW)) : ok(RAW)));
    vi.stubGlobal('fetch', fetcher);
    expect(bytes(await fetchMeshBuffer('/mesh/a.bin'))).toEqual(Array.from(RAW));
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual(['/mesh/a.bin.gz']);
  });

  it('同一份只下载一次：并发与先后的调用拿到同一个缓冲', async () => {
    const fetcher = vi.fn(async () => ok(gzipSync(RAW)));
    vi.stubGlobal('fetch', fetcher);
    const [a, b] = await Promise.all([fetchMeshBuffer('/mesh/a.bin'), fetchMeshBuffer('/mesh/a.bin')]);
    const c = await fetchMeshBuffer('/mesh/a.bin');
    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('.gz 取不到：退回原文件', async () => {
    const fetcher = vi.fn(async (url: string) => (url.endsWith('.gz') ? missing() : ok(RAW)));
    vi.stubGlobal('fetch', fetcher);
    expect(bytes(await fetchMeshBuffer('/mesh/a.bin'))).toEqual(Array.from(RAW));
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual(['/mesh/a.bin.gz', '/mesh/a.bin']);
  });

  it('中间一层已经替我们解过压（开头不是 gzip 魔数）：原样用，不再解', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok(RAW)));
    expect(bytes(await fetchMeshBuffer('/mesh/a.bin'))).toEqual(Array.from(RAW));
  });

  it('浏览器没有 DecompressionStream：直接拉原文件', async () => {
    vi.stubGlobal('DecompressionStream', undefined);
    const fetcher = vi.fn(async (_url: string) => ok(RAW));
    vi.stubGlobal('fetch', fetcher);
    expect(bytes(await fetchMeshBuffer('/mesh/a.bin'))).toEqual(Array.from(RAW));
    expect(fetcher.mock.calls.map((c) => c[0])).toEqual(['/mesh/a.bin']);
  });

  it('失败不缓存：下一次重新下载', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => missing()));
    await expect(fetchMeshBuffer('/mesh/a.bin')).rejects.toThrow('HTTP 404');
    const fetcher = vi.fn(async () => ok(gzipSync(RAW)));
    vi.stubGlobal('fetch', fetcher);
    expect(bytes(await fetchMeshBuffer('/mesh/a.bin'))).toEqual(Array.from(RAW));
  });
});

describe('网格地址只有一份口径', () => {
  it('预载用的地址与台架实际取的地址相同', async () => {
    const { MESH_URL } = await import('./mesh-fetch');
    const { MACHINE_MESH_URL } = await import('./machine-shape');
    const { TENTACLE_MESH_URL } = await import('./tentacle3d-render');
    expect(MESH_URL.machine).toBe(MACHINE_MESH_URL);
    expect(MESH_URL.tentacle).toBe(TENTACLE_MESH_URL);
  });
});

describe('数据不对时丢掉重下', () => {
  it('forgetMeshBuffer 之后下一次重新下载（截断的下载不留在共享缓存里）', async () => {
    const { fetchMeshBuffer: get, forgetMeshBuffer, resetMeshCache: reset } = await import('./mesh-fetch');
    reset();
    const fetcher = vi.fn(async (_url: string) => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await get('/mesh/t.bin');
    await get('/mesh/t.bin');
    expect(fetcher).toHaveBeenCalledTimes(1);
    forgetMeshBuffer('/mesh/t.bin');
    await get('/mesh/t.bin');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
