// 纯几何线稿：捏分过渡的目标形态系列（用户 2026-08-27：「先只做这两条线之间
// 过渡形态组，先把线是什么形态确认下来」）——不跑引擎，只画线。
//
// v2（用户当轮纠偏「谷口应该更宽——本质是上下两个台，而不是一个大台中间挖个坑」）：
// 参数化改成**两台分离**：单箱 = 两个 LOBE 高的台合在一起（总高 2·LOBE），
// 过渡 = 两台逐级拉开，缝宽 w(t) 领先于缝深 dv(t)（开口先张、膜后退——
// 中间级读作「鞍」，不是窄槽）；终态 = 两台 + 宽缝 G1，总高 = 2·LOBE + G1。
// 圆角 = 密采样折线 + 滑动平均（草图质感），触轴后钳制 x ≥ 0。
//
// v3（用户「上下两个台更薄一些」）：每台高 32 → 22（默认），副行改台高三档。
// 用法：npx vite-node scripts/skin-dual/line-draft.mjs <out.svg> [终态缝宽=28] [台高=22]
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'line-draft.svg';
const G1 = Number(process.argv[3] ?? 28); // 终态缝宽（两台之间）

const D = 40; // 台深
const LOBE = Number(process.argv[4] ?? 22); // 每台高（用户「更薄一些」：32 → 22）
const TAIL = 46; // 上下轴线延伸
const LEVELS = 10;

// 缝宽领先、缝深随后：w 张得快（t^0.7）、膜退得稳（t^1.2）
const wOf = (t, g1 = G1) => g1 * Math.pow(t, 0.7);
const dvOf = (t) => D * Math.pow(t, 1.2);

/** 尖角轮廓（x = 离轴，y = 向下；从上轴线到下轴线） */
function sharpProfile(t, g1 = G1, lobe = LOBE) {
  const w = wOf(t, g1);
  const dv = dvOf(t);
  const H = 2 * lobe + w;
  const yc = H / 2;
  const pts = [
    [0, -TAIL],
    [0, 0],
    [D, 0],
  ];
  if (w > 0.5) {
    pts.push([D, yc - w / 2]);
    pts.push([D - dv, yc - w / 2]);
    pts.push([D - dv, yc + w / 2]);
    pts.push([D, yc + w / 2]);
  }
  pts.push([D, H]);
  pts.push([0, H]);
  pts.push([0, H + TAIL]);
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

/** 滑动平均圆角（窗口 ~9px） */
function smooth(pts, w = 4, passes = 2) {
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

const levels = Array.from({ length: LEVELS }, (_, i) => i / (LEVELS - 1));
const shapes = levels.map((t) => smooth(densify(sharpProfile(t))));

// ── SVG：主行 = 10 级；副行 = 终态缝宽三档（各画中间级 + 终态，供拍板） ────
const CW = 150;
const SC = 2.0;
const PAD = 34;
const HMAX = 2 * LOBE + G1 + 2 * TAIL;
const OY = PAD + 26 + TAIL * SC;
const W = PAD * 2 + LEVELS * CW;
const ALT_L = [18, 22, 26]; // 台高三档（缝恒 G1）
const OY2 = OY + (2 * LOBE + G1 + TAIL) * SC + 76 + TAIL * SC;
const HGT = OY2 + (2 * 26 + G1 + TAIL) * SC + 40;
const path = (pts, ox, oy) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC).toFixed(2)},${(oy + y * SC).toFixed(2)}`).join('');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.ceil(HGT)}" viewBox="0 0 ${W} ${Math.ceil(HGT)}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${Math.ceil(HGT)}" fill="#f6f4ef"/>
<text x="${PAD}" y="${PAD - 10}" font-size="15" font-weight="700" fill="#1b1b1a">线稿 · 两台分离过渡 · 纯几何目标形态（每台高 ${LOBE} · 终态缝 ${G1}）</text>`;
shapes.forEach((pts, i) => {
  const ox = PAD + i * CW + 30;
  svg += `<text x="${ox - 20}" y="${PAD + 10}" font-size="12" font-weight="600" fill="#3a3a38">${i === 0 ? '单箱' : i === LEVELS - 1 ? '双台' : `${i}/9`}</text>`;
  svg += `<path d="${path(pts, ox, OY)}" fill="none" stroke="#1c3a2c" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
});
svg += `<text x="${PAD}" y="${OY2 - TAIL * SC - 24}" font-size="13" font-weight="700" fill="#1b1b1a">台高三档（缝恒 ${G1}，各画 5/9 级与终态）—— 供拍板</text>`;
ALT_L.forEach((lb, i) => {
  [5 / 9, 1].forEach((t, j) => {
    const ox = PAD + (i * 2 + j) * CW + 30;
    const pts = smooth(densify(sharpProfile(t, G1, lb)));
    svg += `<text x="${ox - 20}" y="${OY2 - TAIL * SC - 4}" font-size="12" font-weight="600" fill="#3a3a38">台高 ${lb} · ${t === 1 ? '终态' : '5/9'}</text>`;
    svg += `<path d="${path(pts, ox, OY2)}" fill="none" stroke="#1c3a2c" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
});
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`→ ${OUT} · ${LEVELS} 级 · 每台 ${LOBE} · 终态缝 ${G1}（副行台高 ${ALT_L.join('/')}）`);
