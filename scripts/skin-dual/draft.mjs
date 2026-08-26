// 线稿工具：双结构带（一条带上两个折叠结构）——真引擎终态剖面，只有线。
//
// 纪律（用户 2026-08-20 立）：先设计只有线的形态系列、确认后再上 3D。
// 用法： npx vite-node scripts/skin-dual/draft.mjs <out.svg> [模式]
//   模式 pairs（默认）= 单结构参照 + 同形双结构三种 + 混合一种
//        gap = 选定形态的中间贴合段间距系列（结构不变，只变两结构的间距）
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import {
  DUAL_FREE,
  DUAL_LEAD,
  DUAL_MID,
  DUAL_TAIL,
  buildDualBand,
  buildDualControl,
} from '../../src/lib/space/skin-dual.ts';

const OUT = process.argv[2] ?? 'dual-draft.svg';
const MODE = process.argv[3] ?? 'pairs';

const runToEnd = (spec, opts) => {
  const s = createSkinUnit(spec, opts);
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return s;
};
/** 整条带的终态折线（世界 px，x = 离轴、y = 向下） */
const bandProfile = (sim) => {
  const pts = [];
  for (let i = 0; i < sim.n; i++) pts.push([sim.px[i] * 100, -sim.py[i] * 100]);
  return pts;
};
/** 画图平滑（照台架 renderSmooth 口径，只为线稿好看，不改物理） */
const smooth = (pts, w = 3, passes = 1) => {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
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
  }
  return cur;
};

function seriesFor(mode) {
  if (mode === 'pairs') {
    const single = buildDualControl('ledge', 'ledge', 'B');
    return [
      { ...single, zh: '单结构 · 参照（左图）' },
      buildDualBand('ledge'),
      buildDualBand('stepped'),
      buildDualBand('bulb'),
      buildDualBand('bulb', 'ledge'),
    ];
  }
  if (mode === 'gap')
    return [16, 24, 40].map((mid) => ({
      ...buildDualBand('stepped', 'stepped', { mid }),
      zh: `双阶梯方箱 · mid=${mid}`,
    }));
  throw new Error(`未知模式 ${mode}`);
}

const series = seriesFor(MODE);
const runs = series.map((u) => {
  const sim = runToEnd(u.spec, u.opts);
  return { ...u, sim, draw: smooth(bandProfile(sim), u.smooth[0], u.smooth[1]) };
});

console.log(`模式 ${MODE} · ${runs.length} 条带（lead ${DUAL_LEAD} / free ${DUAL_FREE} / mid ${DUAL_MID} / tail ${DUAL_TAIL}）`);
for (const r of runs) {
  const perChain = r.sim.chains.map((ch) => {
    let locked = 0;
    for (const [i, j] of ch) if (r.sim.locked.some(([a, b]) => a === i && b === j)) locked++;
    return `${locked}/${ch.length}`;
  });
  let out = 0;
  for (let k = 0; k < r.sim.n; k++) out = Math.max(out, r.sim.px[k] * 100);
  console.log(
    `  ${r.zh.padEnd(18)} 节点 ${String(r.sim.n).padStart(3)}  离轴 ${out.toFixed(1).padStart(5)}px  锁定(链) ${perChain.join(' · ') || '—'}  总锁定 ${r.sim.locked.length}`,
  );
}

// 解耦实测：双结构带 vs 拿掉另一个结构的对照带，逐节点最大偏差（px）
if (MODE === 'pairs') {
  const dual = runs[1].sim;
  const ctrlB = runToEnd(...(() => { const c = buildDualControl('ledge', 'ledge', 'B'); return [c.spec, c.opts]; })());
  const ctrlA = runToEnd(...(() => { const c = buildDualControl('ledge', 'ledge', 'A'); return [c.spec, c.opts]; })());
  const segDev = (sim, ctrl, from, to) => {
    let d = 0;
    for (let i = from; i < to; i++)
      d = Math.max(d, Math.hypot(sim.px[i] - ctrl.px[i], sim.py[i] - ctrl.py[i]) * 100);
    return d;
  };
  const a0 = DUAL_LEAD;
  const b0 = DUAL_LEAD + DUAL_FREE + DUAL_MID;
  console.log(
    `解耦（双直挑台 vs 单结构对照）：上结构偏差 ${segDev(dual, ctrlB, a0, a0 + DUAL_FREE).toFixed(3)}px · 下结构偏差 ${segDev(dual, ctrlA, b0, b0 + DUAL_FREE).toFixed(3)}px`,
  );
}

// ── SVG：并排（公共包围盒等比，带轴虚线 + 锁定键橙线） ──────────────────────
const all = runs.flatMap((r) => r.draw);
const bb = all.reduce(
  (a, [x, y]) => ({ x0: Math.min(a.x0, x), x1: Math.max(a.x1, x), y0: Math.min(a.y0, y), y1: Math.max(a.y1, y) }),
  { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 },
);
const BW = bb.x1 - bb.x0;
const BH = bb.y1 - bb.y0;
const CW = 250;
const CH = 640;
const PAD = 30;
const SC = Math.min((CW - 60) / Math.max(BW, 1), (CH - 30) / Math.max(BH, 1));
const W = PAD * 2 + runs.length * CW;
const H = PAD * 2 + CH + 40;
const path = (pts, ox, oy) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC).toFixed(2)},${(oy + (y - bb.y0) * SC).toFixed(2)}`).join('');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${H}" fill="#f6f4ef"/>
<text x="${PAD}" y="${PAD - 8}" font-size="15" font-weight="700" fill="#1b1b1a">线稿 · 双结构带 · ${MODE} · 真引擎终态（整条带）</text>`;
runs.forEach((r, i) => {
  const ox = PAD + i * CW + 40;
  const oy = PAD + 34;
  svg += `<text x="${ox - 32}" y="${PAD + 12}" font-size="13" font-weight="600" fill="#3a3a38">${r.zh}</text>`;
  svg += `<line x1="${ox}" y1="${oy - 6}" x2="${ox}" y2="${oy + BH * SC + 6}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
  for (const [a, b] of r.sim.locked) {
    const x1 = ox + r.sim.px[a] * 100 * SC;
    const y1 = oy + (-r.sim.py[a] * 100 - bb.y0) * SC;
    const x2 = ox + r.sim.px[b] * 100 * SC;
    const y2 = oy + (-r.sim.py[b] * 100 - bb.y0) * SC;
    svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#D85A30" stroke-width="0.8" opacity="0.75"/>`;
  }
  svg += `<path d="${path(r.draw, ox, oy)}" fill="none" stroke="#1c3a2c" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
});
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`→ ${OUT}`);
