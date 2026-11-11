import { MESH_URL } from '../linkage/mesh-fetch';

/**
 * 详情页预载（2026-11-08，用户「这些东西可不可以提前加载」，MAPPING §87）。
 *
 * 读者在首页（或某个案例页）上停着的时候，浏览器多半闲着；趁这段时间把主项目详情页要的东西先拉下来，
 * 点进去时就不用再等：
 *
 * - 路由数据（Next 的 router.prefetch，几十 KB）；
 * - 这一页的脚本与样式文件：拉一份这页的 HTML（它本来就是静态的，压缩后约 70 KB，顺带进了缓存），
 *   从里面读出 `/_next/static/…` 的文件名，交给浏览器以最低优先级预取。**不用 import() 预热**：
 *   实测 Turbopack 会把同一个模块按「从哪一页加载」打进不同的文件，从首页 import() 下载的是另一份，
 *   点进去时案例页照样要下载自己那一份；只有页面 HTML 里写的才是它真正要的文件名。
 * - 3D 网格载荷（项目一主图的整机与大触手，gzip 版约 1.5 MB，进共享缓存 `fetchMeshBuffer`）。
 *
 * 只在载入页退场、首屏编排演完之后的空闲时间里做，一件一件来，不和首屏抢带宽；先把每一页的路由数据与脚本样式拉完，
 * 最后才拉 3D 网格（大件排后面，慢网下不挡后面那一页的小件）；
 * 读者开着「省流量」或网速是 2G 档时不做（Safari 没有 navigator.connection，照常做）。
 * 预载只是把东西放进缓存：没预载完就点进去，页面照常自己下载，什么都不会坏。
 */

export const SITE_PRELOAD = {
  /** 载入页退场后再等多久才开始（ms）：让首屏入场编排与后几屏的图先走 */
  START_DELAY_MS: 1500,
  /** 等浏览器空闲最多等多久（ms）：一直不空闲也慢慢往前推 */
  IDLE_TIMEOUT_MS: 3000,
} as const;

export interface PreloadTarget {
  /** 详情页路径 */
  path: string;
  /** 这一页主图要的 3D 网格 */
  meshes: readonly string[];
}

/** 按读者最可能点的先后排：首页 Work 第一屏从左到右 */
export const PRELOAD_TARGETS: readonly PreloadTarget[] = [
  { path: '/work/reincarnation-machine', meshes: [MESH_URL.machine, MESH_URL.tentacle] },
  { path: '/work/letting-agent', meshes: [] },
];

/** 网络条件允许预载吗（navigator.connection 的两个字段；没有就当允许） */
export function preloadAllowed(conn?: { saveData?: boolean; effectiveType?: string } | null): boolean {
  if (!conn) return true;
  if (conn.saveData) return false;
  return conn.effectiveType !== 'slow-2g' && conn.effectiveType !== '2g';
}

/** 在 pathname 这一页上要预载哪些（不预载自己；编辑后台什么都不做） */
export function preloadQueue(pathname: string): PreloadTarget[] {
  if (pathname.startsWith('/studio')) return [];
  return PRELOAD_TARGETS.filter((t) => t.path !== pathname);
}

/**
 * 从一页的 HTML 里读出它要的脚本与样式文件（`/_next/static/` 下的 .js / .css，含 Vercel 防版本错位加的查询串）。
 * 只认 src / href 属性里的同站路径；去重、保持出现顺序。
 */
export function pageAssetUrls(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+?\.(?:js|css)(?:\?[^"]*)?)"/g)) {
    out.add(m[1].replace(/&amp;/g, '&'));
  }
  return [...out];
}
