// 纯几何线稿：捏分过渡的目标形态系列（用户 2026-08-27：「先只做这两条线之间
// 过渡形态组，先把线是什么形态确认下来」）——不跑引擎，只画线。
//
// v2（用户「谷口应该更宽——本质是上下两个台，而不是一个大台中间挖个坑」）：
// 参数化改成**两台分离**：单箱 = 两个 LOBE 高的台合在一起，过渡 = 两台逐级拉开，
// 终态 = 两台 + 宽缝 G1（总高 2·LOBE + G1 —— 台的尺寸全程不变，是「长开」不是切开）。
// v3（用户「上下两个台更薄一些」）：每台高 32 → 22。
// v4（用户「上下再薄一点，然后做好过渡」）：
//   ① 每台高 22 → 16（副行台高三档 12/16/20）；
//   ② **缝做成有锥度的裂口**：嘴宽 wm、尖宽 wt = wm·τ(t)，τ 从 0.4 爬到 1
//      ——早期是窄楔（材料刚被拉开），末期是平行缝（两台完全分离）；
//   ③ **节奏改按视觉差量等分**（弧长重参数化，不再手调幂函数）：
//      本形族的区域对每个 y 都是 [0, xmax(y)] 的横向凸集 ⇒ 剪影 xmax(y) 完整决定形状，
//      故可在形状空间里量相邻距离。做法 = 密采样 t、累积相邻剪影距离、按等距取级。
//      早期那几级（缝还没张开、肉眼几乎没差）会被自动跳过，步长比 ~1.0。
//
// 用法：npx vite-node scripts/skin-dual/line-draft.mjs <out.svg> [终态缝宽=28] [台高=16]
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'line-draft.svg';
const G1 = Number(process.argv[3] ?? 28); // 终态缝宽（两台之间）
const LOBE = Number(process.argv[4] ?? 16); // 每台高（用户两轮「更薄」：32 → 22 → 16）

const D = 40; // 台深
const TAIL = 46; // 上下轴线延伸
const LEVELS = 10;

// 路径形状（谁领先）：缝嘴张得快、缝深退得稳 —— 中间级读作「两台之间豁开一道口」，
// 不是「面上挖了个窄槽」。步长均匀性交给下面的弧长重参数化，不靠这两个指数调。
const wOf = (t, g1 = G1) => g1 * Math.pow(t, 0.7);
const dvOf = (t) => D * Math.pow(t, 1.2);
/** 缝尖宽 / 缝嘴宽：早期窄楔 → 末期平行缝 */
const tipOf = (t) => 0.4 + 0.6 * t;

/** 尖角轮廓（x = 离轴，y = 向下，**以缝心为原点**；从上轴线到下轴线） */
function sharpProfile(t, g1 = G1, lobe = LOBE) {
  const wm = wOf(t, g1);
  const dv = dvOf(t);
  const wt = wm * tipOf(t);
  const H = 2 * lobe + wm;
  const y0 = -H / 2;
  const pts = [
    [0, y0 - TAIL],
    [0, y0],
    [D, y0],
  ];
  if (wm > 0.4) {
    pts.push([D, -wm / 2]);
    pts.push([D - dv, -wt / 2]);
    pts.push([D - dv, wt / 2]);
    pts.push([D, wm / 2]);
  }
  pts.push([D, -y0]);
  pts.push([0, -y0]);
  pts.push([0, -y0 + TAIL]);
  return pts;
}

/** 折线按弧长密采样（步长 1px） */
function densify(pts) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const L = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(L));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** 滑动平均圆角（薄台上窗口收到 ±3，免得把浅缝抹平） */
function smooth(pts, w = 3, passes = 2) {
  let cur = pts;
  for (let p = 0; p < passes; p++)
    cur = cur.map((_, i) => {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let k = -w; k <= w; k++) {
        const j = Math.min(cur.length - 1, Math.max(0, i + k));
        sx += cur[j][0];
        sy += cur[j][1];
        n++;
      }
      return [sx / n, sy / n];
    });
  return cur.map(([x, y]) => [Math.max(0, x), y]);
}

const shapeAt = (t, g1 = G1, lobe = LOBE) => smooth(densify(sharpProfile(t, g1, lobe)));

// ── 形状距离：剪影 xmax(y)（本形族横向凸 ⇒ 剪影完整决定形状；
//    两形的 L1 积分 = 两个区域的对称差面积，光滑、无方向偏好） ────────────────
const DY = 0.1; // 0.5 太粗：形体上下缘随缝张开而移动，桶量化会造成几个单位的跳变噪声
const YMAX = LOBE + G1 / 2 + 4;
const NBIN = Math.ceil((2 * YMAX) / DY) + 1;
function silhouette(pts, lobe = LOBE) {
  const sil = new Float64Array(NBIN);
  const yLim = lobe + wOf(1) / 2 + 2;
  // **按线段光栅化**，不是按顶点打点：折线密采样步长 1px 而分箱 0.1px，
  // 逐点写只会写满十分之一的桶、其余留 0 ⇒ 剪影成「梳齿」，两形的梳齿错位
  // 会产生巨大伪距离（首版即此：t 0.423→0.441 这种微变被量成整程的量级）
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (Math.abs(y0) > yLim && Math.abs(y1) > yLim) continue; // 轴线尾巴不算形体
    const b0 = Math.round((Math.min(y0, y1) + YMAX) / DY);
    const b1 = Math.round((Math.max(y0, y1) + YMAX) / DY);
    for (let b = Math.max(0, b0); b <= Math.min(NBIN - 1, b1); b++) {
      const y = b * DY - YMAX;
      if (Math.abs(y) > yLim) continue;
      const f = Math.abs(y1 - y0) < 1e-9 ? 0 : (y - y0) / (y1 - y0);
      const x = x0 + (x1 - x0) * Math.min(1, Math.max(0, f));
      if (x > sil[b]) sil[b] = x;
    }
  }
  return sil;
}
const silDist = (A, B) => {
  let s = 0;
  for (let i = 0; i < NBIN; i++) s += Math.abs(A[i] - B[i]);
  return (s / NBIN) * ((2 * YMAX) / 40); // 归一到「平均离轴差」量级
};

/**
 * 视觉等距取级：让**相邻两级的直接形状距离**全部相等。
 *
 * 不能用弧长重参数化（首版即此，实测步长比 3.37×）——那累积的是路径长度，
 * 而这个形族在形状空间里是弯的：同一个 y 处的轮廓先被台占据（xmax 升到 D）、
 * 再被裂口吃掉（降到 D−dv），逐桶非单调 ⇒ 路径长 ≫ 直接距离，且各段弯度不同。
 *
 * 做法：对步长 S 二分。给定 S 从 t=0 贪心走 n−2 步（每步找直接距离恰为 S 的下一个 t），
 * 看剩余到 t=1 的距离比 S 大还是小 —— 单调，二分即可收敛到「全程等步」。
 */
function evenLevels(n, g1 = G1, lobe = LOBE) {
  const cache = new Map();
  const silOf = (t) => {
    const key = t.toFixed(5);
    let v = cache.get(key);
    if (!v) {
      v = silhouette(shapeAt(Number(key), g1, lobe), lobe);
      cache.set(key, v);
    }
    return v;
  };
  const d = (a, b) => silDist(silOf(a), silOf(b));
  // 起手：线性；随后松弛——相邻两步谁大就把中间那级往谁那边挪
  const ts = Array.from({ length: n }, (_, i) => i / (n - 1));
  for (let iter = 0; iter < 220; iter++) {
    const steps = ts.slice(1).map((t, i) => d(ts[i], t));
    let moved = 0;
    for (let i = 1; i < n - 1; i++) {
      const a = steps[i - 1];
      const b = steps[i];
      const bal = (a - b) / Math.max(1e-9, a + b); // >0 = 左边那步更大 ⇒ t_i 左移
      const room = (ts[i + 1] - ts[i - 1]) / 2;
      const shift = -bal * room * 0.35;
      const next = Math.min(ts[i + 1] - 1e-4, Math.max(ts[i - 1] + 1e-4, ts[i] + shift));
      moved = Math.max(moved, Math.abs(next - ts[i]));
      ts[i] = next;
    }
    if (moved < 1e-5) break;
  }
  return ts;
}

const levels = evenLevels(LEVELS);
const shapes = levels.map((t) => shapeAt(t));
const steps = shapes.slice(1).map((s, i) => silDist(silhouette(shapes[i]), silhouette(s)));
console.log(
  `级 t = ${levels.map((t) => t.toFixed(3)).join(' ')}\n` +
    `相邻形状距离 ${Math.min(...steps).toFixed(2)}–${Math.max(...steps).toFixed(2)}` +
    `（比值 ${(Math.max(...steps) / Math.min(...steps)).toFixed(2)}×）`,
);

// ── SVG：主行 = 等距 10 级（缝心对齐）；副行 = 台高三档 ─────────────────────
const CW = 150;
const SC = 2.2;
const PAD = 34;
const HALF = (2 * 20 + G1) / 2 + TAIL; // 按最厚一档留版面
const OY = PAD + 30 + HALF * SC;
const W = PAD * 2 + LEVELS * CW;
const ALT_L = [12, 16, 20];
const OY2 = OY + HALF * SC + 76 + HALF * SC;
const HGT = Math.ceil(OY2 + HALF * SC + 34);
const path = (pts, ox, oy) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC).toFixed(2)},${(oy + y * SC).toFixed(2)}`).join('');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HGT}" viewBox="0 0 ${W} ${HGT}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${HGT}" fill="#f6f4ef"/>
<text x="${PAD}" y="${PAD - 10}" font-size="15" font-weight="700" fill="#1b1b1a">线稿 · 两台分离过渡 · 纯几何目标形态（每台高 ${LOBE} · 终态缝 ${G1} · 视觉等距 ${LEVELS} 级）</text>`;
shapes.forEach((pts, i) => {
  const ox = PAD + i * CW + 30;
  svg += `<text x="${ox - 20}" y="${PAD + 12}" font-size="12" font-weight="600" fill="#3a3a38">${i === 0 ? '单箱' : i === LEVELS - 1 ? '双台' : `${i}/${LEVELS - 1}`}</text>`;
  svg += `<path d="${path(pts, ox, OY)}" fill="none" stroke="#1c3a2c" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
});
svg += `<text x="${PAD}" y="${OY2 - HALF * SC - 22}" font-size="13" font-weight="700" fill="#1b1b1a">台高三档（缝恒 ${G1}，各画中段与终态）—— 供拍板</text>`;
ALT_L.forEach((lb, i) => {
  const ts = evenLevels(LEVELS, G1, lb);
  [ts[4], 1].forEach((t, j) => {
    const ox = PAD + (i * 2 + j) * CW + 30;
    svg += `<text x="${ox - 20}" y="${OY2 - HALF * SC - 2}" font-size="12" font-weight="600" fill="#3a3a38">台高 ${lb} · ${j ? '终态' : '中段'}</text>`;
    svg += `<path d="${path(shapeAt(t, G1, lb), ox, OY2)}" fill="none" stroke="#1c3a2c" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
});
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`→ ${OUT} · 每台 ${LOBE} · 终态缝 ${G1}（副行台高 ${ALT_L.join('/')}）`);
