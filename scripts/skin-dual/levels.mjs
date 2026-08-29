// 捏分过渡的逐级设计台（用户 2026-08-27：「针对过程里的每一个结构单独做结构，
// 只是参考前后，不要从前后改出来」）——三种模式，共用站内模块的构造：
//
//   npx vite-node scripts/skin-dual/levels.mjs <out.svg>              十级并排叠目标线
//   npx vite-node scripts/skin-dual/levels.mjs <out.svg> <级>          单级大图
//   npx vite-node scripts/skin-dual/levels.mjs <out.svg> <级> snap     成形过程六帧（破案用）
//   COMBOS='[{...},…]' … <级> sweep                                    配方扫描，按剪影Δ排序
//
// **构造与旋钮全在 src/lib/space/skin-split.ts**（站上台架与守门用的是同一份；
// 留两份必然漂）。本脚本只做测量与画图。方法纪律见 项目二_皮肤单元lab.md §16：
// 数字会骗人（四项读数全对而形全错已发生四次），剪影Δ 是唯一有效分数，
// ±1 盲扫没方向时立刻换 snap 看成形过程。
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import {
  SPLIT_DEPTH,
  SPLIT_LOBE,
  SPLIT_T,
  buildSplitLevel,
  buildSplitLevels,
  splitSeamW,
  splitSink,
  splitSilhouetteDelta,
  splitTargetProfile,
} from '../../src/lib/space/skin-split.ts';

const OUT = process.argv[2] ?? 'levels.svg';
const ONLY = process.argv[3] !== undefined ? Number(process.argv[3]) : null;
const SNAP = process.argv[4] === 'snap';
const SWEEP = process.argv[4] === 'sweep';

const SNAP_AT = [250, 450, 600, 750, 900, 1500];
const runToEnd = (lv, snaps = null) => {
  const s = createSkinUnit(lv.spec, lv.opts);
  for (let k = 0; k < SKIN.STEPS; k++) {
    s.advance();
    if (snaps && SNAP_AT.includes(k + 1))
      snaps.push({
        step: k + 1,
        px: Float64Array.from(s.px),
        py: Float64Array.from(s.py),
        locked: s.locked.length,
      });
  }
  return s;
};

/** 自由段的终态剖面（世界 px，以缝心为 y 原点）+ 四项读数 */
function measure(lv, sim) {
  const px = (i) => sim.px[i] * 100;
  const py = (i) => -sim.py[i] * 100;
  const cy = py(lv.marks.center);
  const prof = [];
  let depth = 0;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = lv.lead; i < lv.lead + lv.free; i++) {
    prof.push([px(i), py(i) - cy]);
    depth = Math.max(depth, px(i));
    if (px(i) > 5) {
      y0 = Math.min(y0, py(i));
      y1 = Math.max(y1, py(i));
    }
  }
  let total = 0;
  for (const ch of sim.chains) total += ch.length;
  return {
    lv,
    sim,
    prof,
    depth,
    tipX: px(lv.marks.center),
    height: y1 - y0,
    mouth: Math.abs(py(lv.marks.mouthB) - py(lv.marks.mouthA)),
    silD: splitSilhouetteDelta(prof, lv.t),
    locked: sim.locked.length,
    total,
  };
}

const line = (r) =>
  `L${r.lv.i} t=${r.lv.t.toFixed(3)} 目标[尖 ${(SPLIT_DEPTH - splitSink(r.lv.t)).toFixed(1)} 深 ${SPLIT_DEPTH} ` +
  `缝 ${splitSeamW(r.lv.t).toFixed(1)} 高 ${(2 * SPLIT_LOBE + splitSeamW(r.lv.t)).toFixed(1)}]  ` +
  `实测[尖 ${r.tipX.toFixed(1)} 深 ${r.depth.toFixed(1)} 缝 ${r.mouth.toFixed(1)} 高 ${r.height.toFixed(1)}]  ` +
  `剪影Δ ${r.silD.toFixed(2)}  锁 ${r.locked}/${r.total}`;

// ── 配方扫描 ────────────────────────────────────────────────────────────────
if (SWEEP && ONLY !== null && ONLY >= 1) {
  let combos = [];
  for (const ramp of [true, false])
    for (const wallStep of [0, 2, 4]) for (const boxD of [40, 36]) combos.push({ ramp, wallStep, boxD });
  if (process.env.COMBOS) combos = JSON.parse(process.env.COMBOS);
  const rows = combos.map((tu) => {
    const lv = buildSplitLevel(ONLY, tu);
    return { tu, m: measure(lv, runToEnd(lv)) };
  });
  rows.sort((x, y) => x.m.silD - y.m.silD);
  for (const { tu, m } of rows)
    console.log(
      `L${ONLY} Δ ${m.silD.toFixed(2).padStart(6)}  尖 ${m.tipX.toFixed(1).padStart(5)} 深 ${m.depth.toFixed(1)} ` +
        `缝 ${m.mouth.toFixed(1)} 高 ${m.height.toFixed(1)} 锁 ${m.locked}/${m.total}  ${JSON.stringify(tu)}`,
    );
  process.exit(0);
}

const levels = ONLY !== null ? [buildSplitLevel(ONLY)] : buildSplitLevels();
const snapBag = SNAP ? [] : null;
const runs = levels.map((lv) => measure(lv, runToEnd(lv, snapBag)));
for (const r of runs) console.log(line(r));
if (runs.length > 1) {
  const ds = runs.map((r) => r.silD);
  console.log(`剪影Δ ${Math.min(...ds).toFixed(2)}–${Math.max(...ds).toFixed(2)}`);
  // 对位：十级的缝心离带子下缘应逐位齐平（skin-split 的解析构造，全员同 lead/free）
  const mouth = runs.map((r) => (r.sim.py[r.lv.marks.center] - r.sim.py[r.sim.n - 1]) * 100);
  console.log(`缝心离下缘 ${Math.min(...mouth).toFixed(2)}–${Math.max(...mouth).toFixed(2)}px（散布 ${(Math.max(...mouth) - Math.min(...mouth)).toFixed(3)}）`);
}

// ── SVG ────────────────────────────────────────────────────────────────────
const smoothPts = (pts, w) =>
  w <= 0
    ? pts
    : pts.map((_, i) => {
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (let k = -w; k <= w; k++) {
          const j = Math.min(pts.length - 1, Math.max(0, i + k));
          sx += pts[j][0];
          sy += pts[j][1];
          n++;
        }
        return [sx / n, sy / n];
      });

const big = ONLY !== null;
const CW = big ? 640 : 168;
const SC = big ? 7 : 2.4;
const PAD = 36;
const HALF = big ? 44 : 62;
const OY = PAD + 36 + HALF * SC;
const W = PAD * 2 + runs.length * CW;
const HGT = Math.ceil(OY + HALF * SC + 30);
const path = (pts, ox, oy) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC).toFixed(2)},${(oy + y * SC).toFixed(2)}`).join('');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HGT}" viewBox="0 0 ${W} ${HGT}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${HGT}" fill="#f6f4ef"/>
<text x="${PAD}" y="${PAD - 12}" font-size="16" font-weight="700" fill="#1b1b1a">捏分过渡 · 真引擎终态（实线）叠目标线（虚线）· 每台高 ${SPLIT_LOBE} · 台深 ${SPLIT_DEPTH}</text>`;
runs.forEach((r, i) => {
  const ox = PAD + i * CW + 24;
  svg += `<text x="${ox - 16}" y="${PAD + 12}" font-size="12" font-weight="600" fill="#3a3a38">L${r.lv.i} · t=${r.lv.t.toFixed(2)}</text>`;
  svg += `<line x1="${ox}" y1="${OY - HALF * SC}" x2="${ox}" y2="${OY + HALF * SC}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
  svg += `<path d="${path(splitTargetProfile(r.lv.t), ox, OY)}" fill="none" stroke="#a05a2c" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.9"/>`;
  // 台架同款绘图平滑（看到的就是站上会看到的形）
  svg += `<path d="${path(smoothPts(r.prof, r.lv.smooth[0]), ox, OY)}" fill="none" stroke="#1c3a2c" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
});
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`→ ${OUT}`);

// ── 成形过程六帧（终态图看不出「什么时候坏的」） ─────────────────────────────
if (snapBag?.length) {
  const r = runs[0];
  const SW = 280;
  const SSC = 2.2;
  const W2 = PAD * 2 + SNAP_AT.length * SW;
  const H2 = 760;
  let s2 = `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W2}" height="${H2}" fill="#f6f4ef"/>
<text x="${PAD}" y="24" font-size="15" font-weight="700" fill="#1b1b1a">L${r.lv.i} 成形过程（步数 / 锁定数；蓝 = 缝心，橙 = 缝角）</text>`;
  snapBag.forEach((sn, i) => {
    const ox = PAD + i * SW + 20;
    const oy = 48;
    const pts = [];
    for (let k = 0; k < r.lv.free; k++)
      pts.push([sn.px[r.lv.lead + k] * 100, -sn.py[r.lv.lead + k] * 100]);
    let yMin = Infinity;
    for (const [, y] of pts) yMin = Math.min(yMin, y);
    s2 += `<text x="${ox}" y="${oy - 6}" font-size="12" font-weight="600" fill="#3a3a38">step ${sn.step} · 锁 ${sn.locked}</text>`;
    s2 += `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy + 660}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
    s2 += `<path d="${pts.map(([x, y], k) => `${k ? 'L' : 'M'}${(ox + x * SSC).toFixed(1)},${(oy + (y - yMin) * SSC).toFixed(1)}`).join('')}" fill="none" stroke="#1c3a2c" stroke-width="1.1" stroke-linejoin="round"/>`;
    for (const [idx, col] of [
      [r.lv.marks.center, '#2255bb'],
      [r.lv.marks.mouthA, '#D85A30'],
      [r.lv.marks.mouthB, '#D85A30'],
    ])
      s2 += `<circle cx="${(ox + sn.px[idx] * 100 * SSC).toFixed(1)}" cy="${(oy + (-sn.py[idx] * 100 - yMin) * SSC).toFixed(1)}" r="3" fill="${col}"/>`;
  });
  s2 += '</svg>';
  const snapOut = OUT.replace(/\.svg$/, '-snap.svg');
  writeFileSync(snapOut, s2);
  console.log(`→ ${snapOut}（快照）`);
}
