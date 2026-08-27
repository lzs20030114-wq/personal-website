// 纯几何线稿：捏分过渡的目标形态系列（用户 2026-08-27：「先只做这两条线之间
// 过渡形态组，先把线是什么形态确认下来」）——不跑引擎，只画线。
// 形态确认后再定实现路径（三箱 / 皮-芯键 / 其它）。
//
// 参数化：外包络恒定（高 H、深 D 的圆角矩形），面中央挖一个圆角凹谷，
// 谷深 dv 逐级 0 → D（触轴 = 分成两瓣）；谷口宽 W 恒定。
// 圆角 = 密采样折线 + 滑动平均（草图质感），谷底触轴后钳制 x ≥ 0。
//
// 用法：npx vite-node scripts/skin-dual/line-draft.mjs <out.svg> [谷口宽=12]
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'line-draft.svg';
const WV = Number(process.argv[3] ?? 12); // 谷口宽

const D = 40; // 深
const H = 74; // 总高（= 两瓣 + 谷口，终态每瓣 (74−12)/2 = 31）
const TAIL = 46; // 上下轴线延伸
const LEVELS = 10;

/** 尖角轮廓（x = 离轴，y = 向下；从上轴线到下轴线） */
function sharpProfile(dv, w) {
  const yc = H / 2;
  const pts = [
    [0, -TAIL],
    [0, 0],
    [D, 0],
  ];
  if (dv > 0.5) {
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

/** 滑动平均圆角（窗口 ~9px），端点原样 */
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
  return cur.map(([x, y]) => [Math.max(0, x), y]); // 谷底触轴后不越过轴
}

const levels = Array.from({ length: LEVELS }, (_, i) => i / (LEVELS - 1));
const shapes = levels.map((t) => smooth(densify(sharpProfile(D * t, WV))));

// ── SVG：主行 = 10 级系列；副行 = t=0.5 的谷口宽三档（供拍板） ─────────────
const CW = 150;
const SC = 2.2;
const PAD = 34;
const OY = PAD + 26 + TAIL * SC;
const W = PAD * 2 + LEVELS * CW;
const ALT_W = [8, 12, 18];
const OY2 = OY + (H + TAIL) * SC + 70 + TAIL * SC;
const HGT = OY2 + (H + TAIL) * SC + 40;
const path = (pts, ox, oy) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC).toFixed(2)},${(oy + y * SC).toFixed(2)}`).join('');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HGT}" viewBox="0 0 ${W} ${HGT}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${HGT}" fill="#f6f4ef"/>
<text x="${PAD}" y="${PAD - 10}" font-size="15" font-weight="700" fill="#1b1b1a">线稿 · 捏分过渡 · 纯几何目标形态（谷口宽 ${WV}）</text>`;
shapes.forEach((pts, i) => {
  const ox = PAD + i * CW + 30;
  svg += `<text x="${ox - 20}" y="${PAD + 10}" font-size="12" font-weight="600" fill="#3a3a38">${i === 0 ? '单箱' : i === LEVELS - 1 ? '双箱' : `${i}/9`}</text>`;
  svg += `<path d="${path(pts, ox, OY)}" fill="none" stroke="#1c3a2c" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
});
svg += `<text x="${PAD}" y="${OY2 - TAIL * SC - 24}" font-size="13" font-weight="700" fill="#1b1b1a">中间级（5/9）的谷口宽三档 —— 供拍板</text>`;
ALT_W.forEach((w, i) => {
  const ox = PAD + i * CW + 30;
  const pts = smooth(densify(sharpProfile(D * (5 / 9), w)));
  svg += `<text x="${ox - 20}" y="${OY2 - TAIL * SC - 4}" font-size="12" font-weight="600" fill="#3a3a38">谷口 ${w}</text>`;
  svg += `<path d="${path(pts, ox, OY2)}" fill="none" stroke="#1c3a2c" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
});
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`→ ${OUT} · ${LEVELS} 级 · 谷深 0→${D} · 谷口 ${WV}（副行 ${ALT_W.join('/')}）`);
