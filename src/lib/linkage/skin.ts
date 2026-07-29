import type { Vec3 } from './solver3d';

/**
 * 环间织物蒙皮的纯几何件——Lab.04 五环与 Lab.05 整机共用。
 *
 * 2026-07-29 从 RingsBench 抽出（此前是组件内联）：两台台架要画同一种蒙皮，
 * 留两份副本必然漂。这里只放**纯函数**（无 GL、无 DOM、可单测）；
 * 颜色、透明度、绘制序等表现决定留在各自台架。
 *
 * 半透明的三条硬约束（07-29 五环定案，两台都适用，写在这里免得再踩）：
 * ① 深度只测不写——否则 α=0.2 的面照样挡光；
 * ② 于是绘制序必须「实体线稿先画、半透明最后画」；
 * ③ 半透明面之间没有 z 排序，带要**自己按视深从远到近**下单（见 bandsFarToNear）。
 */

/** 折线按弧长等距重采样到 n 点。 */
export function resample(pts: ReadonlyArray<Vec3>, n: number): Vec3[] {
  if (pts.length === 0 || n <= 0) return [];
  if (pts.length === 1 || n === 1) return [{ ...pts[0] }];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(
      cum[i - 1] +
        Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z),
    );
  }
  const total = cum[cum.length - 1] || 1;
  const out: Vec3[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * total;
    while (seg < pts.length - 2 && cum[seg + 1] < t) seg++;
    const span = cum[seg + 1] - cum[seg] || 1;
    const u = Math.min(1, Math.max(0, (t - cum[seg]) / span));
    out.push({
      x: pts[seg].x + (pts[seg + 1].x - pts[seg].x) * u,
      y: pts[seg].y + (pts[seg + 1].y - pts[seg].y) * u,
      z: pts[seg].z + (pts[seg + 1].z - pts[seg].z) * u,
    });
  }
  return out;
}

/**
 * 直纹带的三角索引：A 侧顶点 0..n−1、B 侧 n..2n−1，逐格两片。
 * 顶点缓冲按 [...A, ...B] 排布时可直接喂 bakeIndexed。
 */
export function bandTriIndex(n: number): Uint16Array {
  const idx: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    const a = k;
    const b = n + k;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return new Uint16Array(idx);
}

/** 两条等长折线打包成 [...A, ...B] 的顶点流（供 bakeIndexed + bandTriIndex 用）。 */
export function bandVerts(a: ReadonlyArray<Vec3>, b: ReadonlyArray<Vec3>): Float32Array {
  const out = new Float32Array((a.length + b.length) * 3);
  let k = 0;
  for (const p of [...a, ...b]) {
    out[k++] = p.x;
    out[k++] = p.y;
    out[k++] = p.z;
  }
  return out;
}

/**
 * 带序按视深从远到近排（半透明面之间没有 z 排序，只能靠下单顺序）。
 * depth(i) 由调用方给出：越大越近（= 视矩阵第三行 · (点 − 枢轴)）。
 */
export function bandsFarToNear(count: number, depth: (i: number) => number): number[] {
  return [...Array(Math.max(0, count)).keys()].sort((p, q) => depth(p) - depth(q));
}
