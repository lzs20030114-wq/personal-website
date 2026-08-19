/**
 * 项目二 · 皮肤单元立体化（Lab.07 的几何烘焙）——纯数学，零依赖，零 DOM。
 *
 * v7 引擎是 2D **剖面**模拟（交接件原文），这里把剖面挤出成有深度的带
 * （交接件通篇叫单元为「带子」，阵列阶段 = 房间剖面内多根带子），并给外表皮
 * 真实厚度（用户 2026-08-19 拍板「给这个外表皮一些厚度（立体的）」）：
 * 剖面折线沿其法向各偏移 thick/2 得外/内两条轮廓，再沿深度方向挤出——
 * 外表面 + 内表面 + 前后剖口（能看见织物厚度的切面）+ 两端封口。
 *
 * 拓扑只跟节点数走（buildSolidTopology 一次），顶点逐帧重填（fillSolidVerts）——
 * 配 gl3d.bakeIndexed + drawDynamicMesh 的既有动态网格路径，装备零改。
 * 条纹双色照 2D 目录（STRIPE 节一段交替），故索引分成 A/B 两组、各自一次绘制。
 */

/** 立体化常量（展示几何，不是物理量；物理仍全在 skin-unit） */
export const SOLID = {
  /** 带深（挤出方向 z 的总宽，世界单位 = 2D 的 px 尺度） */
  DEPTH: 80,
  /** 织物厚度（剖面法向） */
  THICK: 5,
  /** 2D 剖面 → 世界的放大（与 2D 台架的 ×100 同一尺度） */
  SCALE: 100,
} as const;

export interface SolidTopology {
  /** 条纹 A / B 两组三角索引（共用同一份顶点缓冲） */
  idxA: Uint32Array;
  idxB: Uint32Array;
  /** 顶点数 = 4n（外前/外后/内前/内后 各 n） */
  vertCount: number;
}

/**
 * 固定拓扑：n 个剖面节点 → 4 条棱环（外前 oF、外后 oB、内前 iF、内后 iB）。
 * 面片按剖面段 i（0..n-2）归入条纹组 (i/stripe)%2：
 * 外表面、内表面、前剖口、后剖口各一条 quad 带；两端（i=0 / i=n-1）封口归各自端的组。
 */
export function buildSolidTopology(n: number, stripe: number): SolidTopology {
  const oF = (i: number): number => i;
  const oB = (i: number): number => n + i;
  const iF = (i: number): number => 2 * n + i;
  const iB = (i: number): number => 3 * n + i;
  const a: number[] = [];
  const b: number[] = [];
  const quad = (dst: number[], p: number, q: number, r: number, s: number): void => {
    dst.push(p, q, r, p, r, s);
  };
  for (let i = 0; i < n - 1; i++) {
    const dst = Math.floor(i / stripe) % 2 === 0 ? a : b;
    quad(dst, oF(i), oB(i), oB(i + 1), oF(i + 1)); // 外表面
    quad(dst, iF(i), iF(i + 1), iB(i + 1), iB(i)); // 内表面
    quad(dst, oF(i), oF(i + 1), iF(i + 1), iF(i)); // 前剖口（看见厚度的切面）
    quad(dst, oB(i), iB(i), iB(i + 1), oB(i + 1)); // 后剖口
  }
  quad(a, oF(0), iF(0), iB(0), oB(0)); // 端封口（条带起点）
  const e = n - 1;
  const dstEnd = Math.floor((n - 2) / stripe) % 2 === 0 ? a : b;
  quad(dstEnd, oF(e), oB(e), iB(e), iF(e)); // 端封口（条带终点）
  return { idxA: Uint32Array.from(a), idxB: Uint32Array.from(b), vertCount: 4 * n };
}

/**
 * 逐帧填顶点：输入 2D 剖面（已做绘图平滑/帧间平滑的 x=离轴、y=沿轴向下为负），
 * 输出 xyz 平铺数组（长度 4n×3，布局 = 外前/外后/内前/内后）。
 * 世界系：X = offX + x·scale（离轴向右）、Y = −y·scale（0 在天花、向下增大，
 * 与屏幕 y 同向）、Z = ±depth/2（挤出）。法向取剖面折线的 2D 垂线（中央差分）。
 */
export function fillSolidVerts(
  px: ArrayLike<number>,
  py: ArrayLike<number>,
  n: number,
  offX: number,
  depth = SOLID.DEPTH,
  thick = SOLID.THICK,
  scale = SOLID.SCALE,
  out?: Float32Array,
): Float32Array {
  const verts = out && out.length === 4 * n * 3 ? out : new Float32Array(4 * n * 3);
  const hz = depth / 2;
  const ht = thick / 2;
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    let tx = (px[i1] as number) - (px[i0] as number);
    let ty = (py[i1] as number) - (py[i0] as number);
    const L = Math.sqrt(tx * tx + ty * ty);
    if (L > 1e-12) {
      tx /= L;
      ty /= L;
    } else {
      tx = 0;
      ty = 1;
    }
    // 剖面法向（世界系，Y 已翻转 ⇒ 用 (ny=-tx? ) —— 先算世界系切线再转 90°）
    const wx = offX + (px[i] as number) * scale;
    const wy = -(py[i] as number) * scale;
    const wtx = tx * scale;
    const wty = -ty * scale;
    const wl = Math.sqrt(wtx * wtx + wty * wty) || 1;
    const nx = -wty / wl;
    const ny = wtx / wl;
    const ox = wx + nx * ht;
    const oy = wy + ny * ht;
    const ix = wx - nx * ht;
    const iy = wy - ny * ht;
    // 外前 / 外后 / 内前 / 内后
    let k = i * 3;
    verts[k] = ox;
    verts[k + 1] = oy;
    verts[k + 2] = hz;
    k = (n + i) * 3;
    verts[k] = ox;
    verts[k + 1] = oy;
    verts[k + 2] = -hz;
    k = (2 * n + i) * 3;
    verts[k] = ix;
    verts[k + 1] = iy;
    verts[k + 2] = hz;
    k = (3 * n + i) * 3;
    verts[k] = ix;
    verts[k + 1] = iy;
    verts[k + 2] = -hz;
  }
  return verts;
}

/** 简易长方体（芯轨/天花板条用）：中心 c、半尺寸 h → xyz 平铺 36 顶点（12 三角） */
export function boxVerts(
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
): { verts: Float32Array; idx: Uint32Array } {
  const v = new Float32Array(8 * 3);
  let k = 0;
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        v[k++] = cx + sx * hx;
        v[k++] = cy + sy * hy;
        v[k++] = cz + sz * hz;
      }
  // 顶点序：(sx,sy,sz) 二进制 —— 0:---, 1:--+, 2:-+-, 3:-++, 4:+--, 5:+-+, 6:++-, 7:+++
  const idx = Uint32Array.from([
    0, 1, 3, 0, 3, 2, // x-
    4, 6, 7, 4, 7, 5, // x+
    0, 4, 5, 0, 5, 1, // y-
    2, 3, 7, 2, 7, 6, // y+
    0, 2, 6, 0, 6, 4, // z-
    1, 5, 7, 1, 7, 3, // z+
  ]);
  return { verts: v, idx };
}
