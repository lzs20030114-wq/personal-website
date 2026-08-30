// 捏分过渡的**过程**诊断台（用户 2026-08-30：「从中间抽取一个，把它的变化过程
// 抽取出来，单独做顺滑，再总结改法推广」）——终态图与检查点横排都看不出
// 「哪一步在猛动」，这里逐步量：
//
//   npx vite-node scripts/skin-dual/process.mjs <级> [out.svg]
//
// 输出：
//   1. 逐步位移表——每一步里结构段节点的最大位移（px）。基线 = 芯收缩本身
//      带来的匀速蠕动；尖峰 = 猛动。只打印超过基线 3 倍的步。
//   2. 锁定时间线——每颗键锁定在哪一步（链 / 链内序 / 跨度）。
//   3. 密集帧剪影 SVG——覆盖位移尖峰窗口，每帧标步数与当步最大位移。
//
// 方法纪律（项目二_皮肤单元lab.md §16）：数字表只用来找窗口，判断顺滑与否
// 必须看渲染出来的帧。
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { buildSplitLevel, splitSilhouetteDelta } from '../../src/lib/space/skin-split.ts';

const LV = Number(process.argv[2] ?? 5);
const OUT = process.argv[3] ?? `process-L${LV}.svg`;
const TUNE = process.env.TUNE ? JSON.parse(process.env.TUNE) : undefined;

const lv = buildSplitLevel(LV, TUNE);
if (process.env.GAP) lv.opts = { ...lv.opts, lockGap: Number(process.env.GAP), ...(process.env.GAPALL ? {} : { lockGapChains: [0] }) };
if (process.env.CLAMP) lv.opts = { ...lv.opts, stepClamp: Number(process.env.CLAMP) / 100 }; // px 计

const sim = createSkinUnit(lv.spec, lv.opts);
const s0 = lv.lead;
const s1 = lv.lead + lv.free; // 结构段（用户看的就是它）

const px0 = new Float64Array(sim.n);
const py0 = new Float64Array(sim.n);
const moves = []; // 每步：结构段最大位移 px
const lockLog = []; // {step, count, spans:[...]}
const frames = new Map(); // step -> {px,py,maxD}

let prevLocked = 0;
for (let k = 0; k < SKIN.STEPS; k++) {
  px0.set(sim.px);
  py0.set(sim.py);
  sim.advance();
  let maxD = 0;
  for (let i = s0; i < s1; i++) {
    const d = Math.hypot(sim.px[i] - px0[i], sim.py[i] - py0[i]) * 100;
    if (d > maxD) maxD = d;
  }
  moves.push(maxD);
  if (sim.locked.length > prevLocked) {
    const spans = sim.locked.slice(prevLocked).map(([i, j]) => j - i);
    lockLog.push({ step: k + 1, count: sim.locked.length - prevLocked, spans });
    prevLocked = sim.locked.length;
  }
  frames.set(k + 1, { px: Float64Array.from(sim.px), py: Float64Array.from(sim.py), maxD });
}

// ── 逐步位移表 ──────────────────────────────────────────────────────────────
// 基线取「无锁定事件的稳定收缩段」（step 100–400 通常无锁）的中位数
const quiet = moves.slice(100, 400).slice().sort((a, b) => a - b);
const base = quiet[quiet.length >> 1];
console.log(`L${LV} 结构段逐步位移：基线（step 100–400 中位）= ${base.toFixed(3)} px/步`);
let peak = 0;
let peakStep = 0;
for (let k = 0; k < moves.length; k++) {
  if (moves[k] > peak) {
    peak = moves[k];
    peakStep = k + 1;
  }
}
console.log(`全程峰值 = ${peak.toFixed(2)} px/步 @ step ${peakStep}（基线的 ${(peak / base).toFixed(0)} 倍）`);
console.log('\n超过基线 3 倍的步（连续段折叠成区间）：');
let runA = -1;
let runMax = 0;
const spikes = [];
for (let k = 0; k <= moves.length; k++) {
  const hot = k < moves.length && moves[k] > base * 3;
  if (hot && runA < 0) {
    runA = k + 1;
    runMax = 0;
  }
  if (hot) runMax = Math.max(runMax, moves[k]);
  if (!hot && runA >= 0) {
    spikes.push({ a: runA, b: k, max: runMax });
    console.log(`  step ${runA}–${k}  峰值 ${runMax.toFixed(2)} px/步`);
    runA = -1;
  }
}

console.log('\n锁定时间线（步 / 本步锁定数 / 跨度）：');
for (const e of lockLog) console.log(`  step ${e.step}  +${e.count}  跨度 [${e.spans.join(', ')}]`);

// 终态剪影Δ（改时序是路径改动，须重验终态——引擎 lockGap 注释即此）
{
  const cyv = -sim.py[lv.marks.center] * 100;
  const prof = [];
  for (let i = s0; i < s1; i++) prof.push([sim.px[i] * 100, -sim.py[i] * 100 - cyv]);
  console.log(`\n终态剪影Δ = ${splitSilhouetteDelta(prof, lv.t).toFixed(2)}  锁定 ${sim.locked.length}`);
}

// ── 密集帧剪影：覆盖最大尖峰窗口 ────────────────────────────────────────────
const big = spikes.slice().sort((x, y) => y.max - x.max)[0] ?? { a: 500, b: 800 };
const w0 = Math.max(1, big.a - 60);
const w1 = Math.min(SKIN.STEPS, big.b + 60);
const NF = 14;
const at = [];
for (let i = 0; i < NF; i++) at.push(Math.round(w0 + ((w1 - w0) * i) / (NF - 1)));

const SC = 2.6;
const CW = 150;
const PAD = 30;
const W = PAD * 2 + NF * CW;
const H = 620;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${H}" fill="#f6f4ef"/>
<text x="${PAD}" y="22" font-size="14" font-weight="700" fill="#1b1b1a">L${LV} 成形窗口 step ${w0}–${w1}（帧下标注当步最大位移 px/步；基线 ${base.toFixed(2)}）</text>`;
at.forEach((st, i) => {
  const fr = frames.get(st);
  const ox = PAD + i * CW + 16;
  const oy = 52;
  const pts = [];
  for (let k = s0; k < s1; k++) pts.push([fr.px[k] * 100, -fr.py[k] * 100]);
  let yMin = Infinity;
  for (const [, y] of pts) yMin = Math.min(yMin, y);
  const hot = fr.maxD > base * 3;
  svg += `<text x="${ox}" y="${oy - 8}" font-size="11" font-weight="600" fill="${hot ? '#b0322a' : '#3a3a38'}">s${st} · ${fr.maxD.toFixed(1)}</text>`;
  svg += `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy + 540}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
  svg += `<path d="${pts.map(([x, y], k) => `${k ? 'L' : 'M'}${(ox + x * SC).toFixed(1)},${(oy + (y - yMin) * SC).toFixed(1)}`).join('')}" fill="none" stroke="#1c3a2c" stroke-width="1.1" stroke-linejoin="round"/>`;
});
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`\n→ ${OUT}（尖峰窗口 ${NF} 帧）`);
