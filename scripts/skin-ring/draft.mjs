// 线稿工具：把一串键谱的**真引擎终态剖面**画成只有线的形态系列。
//
// 纪律（用户 2026-08-20 立）：先设计只有线的形态系列、确认后再上 3D。
// 用法： npx vite-node scripts/skin-ring/draft.mjs <out.svg> [模式]
//   模式 catalog（默认）= 目录四形态并排 + 叠合对照
//        bulb-ledge / bulb-stepped = 该对端点的环上渐变系列（回文，20 位 = 11 级）
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { buildRingUnits } from '../../src/lib/space/skin-ring.ts';
import { ARRAY_CENTER, ARRAY_FREE, ARRAY_LEAD, ARRAY_TAIL } from '../../src/lib/space/skin-array.ts';
import { SKIN_SITE_BASE, fan } from '../../src/lib/space/skin-data.ts';

const OUT = process.argv[2] ?? 'draft.svg';
const MODE = process.argv[3] ?? 'catalog';
const M = 160; // 等弧长重采样点数

const runToEnd = (spec, opts) => {
  const s = createSkinUnit(spec, opts);
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return s;
};
/** 自由段终态剖面（世界 px，x = 离轴、y = 向下） */
const rawProfile = (sim) => {
  const pts = [];
  for (let i = ARRAY_LEAD; i < ARRAY_LEAD + ARRAY_FREE; i++)
    pts.push([sim.px[i] * 100, -sim.py[i] * 100]);
  return pts;
};
const resample = (pts) => {
  const L = [0];
  for (let i = 1; i < pts.length; i++)
    L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1];
  const out = [];
  let j = 0;
  for (let m = 0; m < M; m++) {
    const s = (m / (M - 1)) * total;
    while (j < L.length - 2 && L[j + 1] < s) j++;
    const f = (s - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
    out.push([pts[j][0] + f * (pts[j + 1][0] - pts[j][0]), pts[j][1] + f * (pts[j + 1][1] - pts[j][1])]);
  }
  return out;
};
const dist = (A, B) => {
  let s = 0;
  for (let i = 0; i < M; i++) s += Math.hypot(A[i][0] - B[i][0], A[i][1] - B[i][1]);
  return s / M;
};
/** 画图平滑（照台架的 renderSmooth 口径，只为线稿好看，不改物理） */
const smooth = (pts, w = 3, passes = 1) => {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const next = cur.map((_, i) => {
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
    cur = next;
  }
  return cur;
};

const band = (freeSeg) => [['g', ARRAY_LEAD], freeSeg, ['g', ARRAY_TAIL]];
const DEFS = buildRingUnits();
const byKey = Object.fromEntries(DEFS.map((d) => [d.key, d]));

/** 端点 A→B 的渐变系列：内侧键对按 rb 连续收紧（不是二值加键） */
function bulbLedgeSeries(levels) {
  // 蘑菇 = fan(30, 8..24, rb .10)；直挑台 = fan(30, 4..24, rb .09)
  // 差别只有内侧两对（k=4、6）。二值加键 = 一步跳完 = 断层（Lab.08 的教训），
  // 故内侧两对全程都在，rest 长度从「蘑菇终态下它们本来的间距」连续收到 .09。
  const OPEN = { 4: 0.182, 6: 0.24 }; // 蘑菇终态实测间距（px/100）
  const out = [];
  for (let l = 0; l < levels; l++) {
    const t = l / (levels - 1);
    const rbOuter = 0.1 + (0.09 - 0.1) * t;
    const bonds = [];
    for (const k of [4, 6]) {
      // 内侧两对错峰收紧：k=6 走前 70%，k=4 走后 70%（同时收会把尖端一次夹死）
      const tk = k === 6 ? Math.min(1, t / 0.7) : Math.max(0, (t - 0.3) / 0.7);
      bonds.push([ARRAY_CENTER - k, ARRAY_CENTER + k, OPEN[k] + (0.09 - OPEN[k]) * tk]);
    }
    for (let k = 8; k < 26; k += 2) bonds.push([ARRAY_CENTER - k, ARRAY_CENTER + k, rbOuter]);
    bonds.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
    out.push({ label: `t=${t.toFixed(2)}`, spec: band(['f', ARRAY_FREE, bonds]), opts: { ...SKIN_SITE_BASE }, smooth: [5, 2] });
  }
  return out;
}

function seriesFor(mode) {
  if (mode === 'catalog')
    return DEFS.map((d) => ({ label: `${d.zh} · ${d.en}`, spec: d.spec, opts: d.opts, smooth: d.smooth }));
  if (mode === 'bulb-ledge') return bulbLedgeSeries(11);
  if (mode === 'bulb-stepped') {
    // Lab.08 定版序列重采样到 11 级（回文用）
    const RB = [0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.22, 0.24, 0.26, 0.28, 0.3, 0.32];
    const PW = [0, 0, 0, 2, 4, 6, 8, 8, 8, 8, 8, 8];
    const SQ = [0, 0, 0.05, 0.12, 0.2, 0.3, 0.4, 0.51, 0.61, 0.7, 0.85, 1];
    const out = [];
    for (let l = 0; l < 11; l++) {
      const x = (l / 10) * 11; // 12 格重采样到 11 级
      const i = Math.round(x);
      let kMax = 24 + 2 * Math.round(l / 10);
      while (ARRAY_CENTER - kMax < 4) kMax -= 2;
      const bonds = fan(ARRAY_CENTER, 8, kMax + 1, 2, RB[i]);
      const seg = PW[i] > 0
        ? ['f', ARRAY_FREE, bonds, [[ARRAY_CENTER - PW[i], ARRAY_CENTER + PW[i]]]]
        : ['f', ARRAY_FREE, bonds];
      const opts = { ...SKIN_SITE_BASE };
      if (SQ[i] > 0) opts.boxSquare = SQ[i];
      out.push({ label: `t=${(l / 10).toFixed(2)}`, spec: band(seg), opts, smooth: SQ[i] >= 0.5 ? [3, 1] : [5, 2] });
    }
    return out;
  }
  throw new Error(`未知模式 ${mode}`);
}

const series = seriesFor(MODE);
const runs = series.map((u) => {
  const sim = runToEnd(u.spec, u.opts);
  const raw = rawProfile(sim);
  return { ...u, sim, raw, samp: resample(raw), draw: smooth(raw, u.smooth[0], u.smooth[1]) };
});

// 相邻形态距离
const gaps = runs.slice(1).map((r, i) => dist(runs[i].samp, r.samp));
console.log(`模式 ${MODE} · ${runs.length} 级`);
runs.forEach((r, i) => {
  let out = 0;
  for (let k = 0; k < r.sim.n; k++) out = Math.max(out, r.sim.px[k] * 100);
  console.log(`  ${String(i).padStart(2)} ${r.label.padEnd(22)} 离轴 ${out.toFixed(1).padStart(5)}  键 ${String(r.sim.locked.length).padStart(2)}` +
    (i ? `  ← 与上一级距离 ${gaps[i - 1].toFixed(2)}` : ''));
});
if (gaps.length)
  console.log(`相邻距离 ${Math.min(...gaps).toFixed(2)}–${Math.max(...gaps).toFixed(2)}（最大/最小 ${(Math.max(...gaps) / Math.min(...gaps)).toFixed(1)}×）`);

// ── SVG：并排 + 叠合（按全系列公共包围盒等比铺满，形态之间才可比） ──────────
const all = runs.flatMap((r) => r.draw);
const bb = all.reduce(
  (a, [x, y]) => ({ x0: Math.min(a.x0, x), x1: Math.max(a.x1, x), y0: Math.min(a.y0, y), y1: Math.max(a.y1, y) }),
  { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 },
);
const BW = bb.x1 - bb.x0;
const BH = bb.y1 - bb.y0;
const CW = 240;
const CH = 460;
const PAD = 30;
const SC = Math.min((CW - 40) / Math.max(BW, 1), (CH - 20) / Math.max(BH, 1));
const cols = runs.length;
const W = PAD * 2 + cols * CW;
const H = PAD * 2 + CH + 54 + CH + 40;
/** 世界 (x=离轴, y=向下) → 画布；轴（x=0）画成虚线 */
const path = (pts, ox, oy) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC).toFixed(2)},${(oy + (y - bb.y0) * SC).toFixed(2)}`).join('');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${H}" fill="#f6f4ef"/>
<text x="${PAD}" y="${PAD - 10}" font-size="15" font-weight="700" fill="#1b1b1a">线稿 · ${MODE} · 真引擎终态剖面（自由段，${runs.length} 级）</text>`;
runs.forEach((r, i) => {
  const ox = PAD + i * CW + 30;
  const oy = PAD + 16;
  svg += `<line x1="${ox}" y1="${oy - 6}" x2="${ox}" y2="${oy + BH * SC + 6}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
  svg += `<path d="${path(r.draw, ox, oy)}" fill="none" stroke="#1c3a2c" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
  svg += `<text x="${ox - 24}" y="${oy + CH - 26}" font-size="11" fill="#3a3a38">${r.label}</text>`;
  if (i) svg += `<text x="${ox - 24}" y="${oy + CH - 11}" font-size="11" font-weight="700" fill="#a05a2c">Δ ${gaps[i - 1].toFixed(2)}</text>`;
});
const oy2 = PAD + 16 + CH + 46;
svg += `<text x="${PAD}" y="${oy2 - 14}" font-size="13" font-weight="700" fill="#1b1b1a">全部叠合在同一条轴上（绿 → 紫 = 一级到末级）</text>`;
runs.forEach((r, i) => {
  const hue = 150 + (i / Math.max(1, runs.length - 1)) * 140;
  svg += `<path d="${path(r.draw, PAD + 120, oy2)}" fill="none" stroke="hsl(${hue} 48% 36%)" stroke-width="1.3" opacity="0.9" stroke-linejoin="round"/>`;
});
svg += `<line x1="${PAD + 120}" y1="${oy2 - 6}" x2="${PAD + 120}" y2="${oy2 + BH * SC + 6}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`→ ${OUT}`);
