/**
 * 3D 网格载荷（public/mesh/*.bin）的下载与共享（2026-11-08，MAPPING §87）。
 *
 * - **同一份只下载一次**：整机台架（Lab 1-5 / 1-6、案例页一主图、首页实验预览）与触手台架共用一个按 URL 记的 Promise。
 *   首页在空闲时预载（SitePreload）后，点进案例页时主图直接拿到这一份，不再等网络。失败不缓存，下次重取。
 * - **先拉 gzip 版**：Vercel 不压缩 application/octet-stream，原文件 2.6 MB 原样发；构建时另存的 `.bin.gz` 约小 40%，
 *   浏览器用 DecompressionStream 解开（Chrome 80 / Safari 16.4 / Firefox 113 起都有）。
 *   不支持、.gz 取不到、或者中间哪一层已经替我们解过压（开头不是 gzip 魔数）都照常用——最差退回原文件。
 *
 * 返回的 ArrayBuffer 是共享只读的：调用者只拿它建视图，不原地改。
 */

/**
 * 两份网格的地址。整机那份在生成文件 machine-shape.ts 里另有一份（MACHINE_MESH_URL，生成器会覆写那个文件），
 * 守门卡两边相同；首页预载只认这里，不必为了一个字符串把几何表打进全站代码。
 */
export const MESH_URL = {
  machine: '/mesh/machine-mesh.bin',
  tentacle: '/mesh/tentacle3d-mesh.bin',
} as const;

const cache = new Map<string, Promise<ArrayBuffer>>();

const isGzip = (buf: ArrayBuffer) => {
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  return b.length === 2 && b[0] === 0x1f && b[1] === 0x8b;
};

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function fetchRaw(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`3D mesh 请求失败（HTTP ${res.status}）`);
  return res.arrayBuffer();
}

async function download(url: string): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'function') {
    try {
      const res = await fetch(`${url}.gz`);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        return isGzip(buf) ? await gunzip(buf) : buf;
      }
    } catch {
      /* 落到原文件 */
    }
  }
  return fetchRaw(url);
}

/** 取一份网格载荷（同一 URL 只下载一次）。 */
export function fetchMeshBuffer(url: string): Promise<ArrayBuffer> {
  let p = cache.get(url);
  if (!p) {
    p = download(url).catch((error: unknown) => {
      cache.delete(url);
      throw error;
    });
    cache.set(url, p);
  }
  return p;
}

/**
 * 调用者发现数据不对（例如长度不够：下载被截断）时丢掉这一份，下一次重新下载。
 * 下载层只管「拿到了字节」，判不出内容完不完整。
 */
export function forgetMeshBuffer(url: string): void {
  cache.delete(url);
}

/** 只给测试用：清空缓存 */
export function resetMeshCache(): void {
  cache.clear();
}
