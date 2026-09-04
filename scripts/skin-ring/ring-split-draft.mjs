// 圆筒环 · 捏分（一次循环 · 变高 · 居中 · 一圈等挑出）的线稿（2026-09-03，用户「圆形的捏分中间的空间还没做」）
//
// 用法： npx vite-node scripts/skin-ring/ring-split-draft.mjs <out.svg>
//
// 定案数据与构造全部取自站上模块 `skin-split-ring.ts` / `skin-square-split.ts`（线稿与站上共用一份实现）。
// 做三件事：每条引擎跑到终态、按环上顺序把二十条剖面并排画出来、再画一张俯视外缘点对目标圆的图。
// 判据照守门；**没过的档画成红色并写明理由**。
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { silhouette } from '../../src/lib/space/skin-split.ts';
import { RING } from '../../src/lib/space/skin-ring.ts';
import { SQSPLIT, sqSplitBuild, sqSplitTarget } from '../../src/lib/space/skin-square-split.ts';
import {
  SPLIT_RING_BAND, SPLIT_RING_REACH, SPLIT_RING_TARGET, SPLIT_RING_TIERS, buildSplitRingOrder, splitRingOuter,
} from '../../src/lib/space/skin-split-ring.ts';

const OUT = process.argv[2] ?? 'ring-split.svg';

function seg2Hit(a, b, c, d) {
  const s1x = b[0] - a[0], s1y = b[1] - a[1], s2x = d[0] - c[0], s2y = d[1] - c[1];
  const den = -s2x * s1y + s1x * s2y;
  if (Math.abs(den) < 1e-12) return false;
  const q = (-s1y * (a[0] - c[0]) + s1x * (a[1] - c[1])) / den;
  const r = (s2x * (a[1] - c[1]) - s2y * (a[0] - c[0])) / den;
  return q > 0 && q < 1 && r > 0 && r < 1;
}
function measure(tier) {
  const b = sqSplitBuild(tier);
  const H = b.h;
  const s = createSkinUnit(b.spec, b.opts);
  let knot = 0;
  for (let k = 0; k < SKIN.STEPS; k++) {
    s.advance();
    if (k % 10 === 0) {
      const p = [];
      for (let i = b.lead; i < b.lead + b.free; i++) p.push([s.px[i], s.py[i]]);
      for (let i = 0; i + 1 < p.length; i++)
        for (let j = i + 2; j + 1 < p.length; j++) if (j - i > knot && seg2Hit(p[i], p[i + 1], p[j], p[j + 1])) knot = j - i;
    }
  }
  const px = (i) => s.px[i] * 100, py = (i) => (s.py[i] - s.py[s.n - 1]) * 100;
  let reach = 0;
  for (let i = b.lead; i < b.lead + b.free; i++) reach = Math.max(reach, px(i));
  const win = (lo, hi) => { const v = []; for (let i = lo; i <= hi; i++) if (px(i) >= 0.35 * reach && px(i) <= 0.85 * reach) v.push(py(i)); return v; };
  const mean = (v) => v.reduce((a, c) => a + c, 0) / v.length, rng = (v) => Math.max(...v) - Math.min(...v);
  const top = win(b.marks.outA, b.marks.faceA), bot = win(b.marks.faceB, b.marks.outB);
  let tot = 0; for (const ch of s.chains) tot += ch.length;
  const profile = [];
  for (let i = b.lead; i < b.lead + b.free; i++) profile.push([px(i), py(i)]);
  const cy = (mean(top) + mean(bot)) / 2;
  const half = H / 2 + 4;
  const A = silhouette(profile.map(([x, y]) => [x, y - cy]), -half, half);
  const B = silhouette(sqSplitTarget(tier.t, tier.t > 0 ? tier.D : reach, SQSPLIT.W_END, H), -half, half);
  let sum = 0; for (let i = 0; i < A.length; i++) sum += Math.abs(A[i] - B[i]);
  const silD = sum / A.length;
  let seamMin = Infinity; for (let i = b.marks.mouthA; i <= b.marks.mouthB; i++) seamMin = Math.min(seamMin, px(i));
  const fails = [];
  if (s.locked.length !== tot) fails.push(`锁 ${s.locked.length}/${tot}`);
  if (knot > 6) fails.push(`打结 ${knot}`);
  if (silD >= 6) fails.push(`Δ ${silD.toFixed(1)}`);
  if (rng(top) >= 1.5 || rng(bot) >= 1.5) fails.push(`面不平 ${rng(top).toFixed(1)}/${rng(bot).toFixed(1)}`);
  if (Math.abs(mean(top) - mean(bot) - H) >= 1.5) fails.push(`箱高 ${(mean(top) - mean(bot)).toFixed(1)}`);
  if (Math.abs(reach - SPLIT_RING_TARGET) >= 1.05) fails.push(`挑出偏 ${(reach - SPLIT_RING_TARGET).toFixed(2)}`);
  return { profile, reach, boxH: mean(top) - mean(bot), H, silD, knot, locked: s.locked.length, tot, seamMin, mouthY: py(b.marks.center), floorY: py(b.marks.outB), topY: py(b.marks.outA), fails };
}

const order = buildSplitRingOrder();
const M = SPLIT_RING_TIERS.map((t) => measure(t));
for (const [i, t] of SPLIT_RING_TIERS.entries()) {
  const m = M[i];
  console.log(`${t.en.padEnd(9)} t=${t.t.toFixed(3)}  挑出 ${m.reach.toFixed(1)}（表 ${SPLIT_RING_REACH[i]}） 总高 ${m.boxH.toFixed(2)}/${m.H.toFixed(1)} 锁 ${m.locked}/${m.tot} 结 ${m.knot} Δ ${m.silD.toFixed(2)} 缝底 ${m.seamMin.toFixed(1)} 缝心 ${m.mouthY.toFixed(1)} 下板底 ${m.floorY.toFixed(1)} 顶板顶 ${m.topY.toFixed(1)}${m.fails.length ? '  × ' + m.fails.join(' · ') : ''}`);
}

// ── SVG ────────────────────────────────────────────────────────────────────
const S = 1.2;
const maxR = Math.max(...M.map((m) => m.reach));
const cellW = maxR * S + 28, cellH = 260 * S;
const W = 20 * cellW + 80, PLAN = 380;
const svg = [];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${cellH + 90 + PLAN + 40}" font-family="ui-monospace, Menlo, monospace" font-size="10">`);
svg.push(`<rect width="100%" height="100%" fill="#fbfaf7"/>`);
svg.push(`<text x="20" y="22" font-size="14" font-weight="600">圆筒环 · 捏分 · 一次循环 · 变高 · 居中 · 一圈等挑出：台高 ${SQSPLIT.LOBE} · 缝张到 ${SQSPLIT.W_END} · 带 ${SPLIT_RING_BAND} · 目标挑出 ${SPLIT_RING_TARGET} · ${SPLIT_RING_TIERS.length} 条引擎</text>`);
svg.push(`<text x="20" y="38">从双平台那一对的中点顺时针数二十位：位置 · 对号 · t · 挑出。每条剖面 x = 挑出方向、y 以带子下缘为 0（同一基线 ⇒ 缝心/上下板高度可直接比）。红 = 没过守门判据。</text>`);
const start = order.indexOf(0);
const mouth = M.map((m) => m.mouthY);
const mouthMean = mouth.reduce((a, c) => a + c, 0) / mouth.length;
for (let q = 0; q < 20; q++) {
  const i = (start + q) % 20;
  const ti = order[i], t = SPLIT_RING_TIERS[ti], m = M[ti];
  const x0 = 40 + q * cellW, y0 = 60 + cellH;
  const bad = m.fails.length > 0;
  const col = bad ? '#c0392b' : '#2d6a4f';
  svg.push(`<line x1="${x0}" y1="${y0 - 260 * S}" x2="${x0}" y2="${y0}" stroke="#bbb" stroke-dasharray="2 3"/>`);
  // 缝心基线（居中对位：一圈恒定）
  svg.push(`<line x1="${x0 - 6}" y1="${(y0 - mouthMean * S).toFixed(1)}" x2="${x0 + cellW - 22}" y2="${(y0 - mouthMean * S).toFixed(1)}" stroke="#d9a441" stroke-width="0.8" stroke-dasharray="3 3"/>`);
  const pts = m.profile.map(([x, y]) => `${(x0 + x * S).toFixed(1)},${(y0 - y * S).toFixed(1)}`).join(' ');
  svg.push(`<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.4" stroke-linejoin="round"/>`);
  svg.push(`<text x="${x0}" y="${y0 + 14}" fill="${col}">${i} · j${t.pair}</text>`);
  svg.push(`<text x="${x0}" y="${y0 + 26}" fill="${col}">t ${t.t.toFixed(2)} · 高 ${m.boxH.toFixed(0)} · 挑出 ${m.reach.toFixed(1)}</text>`);
  if (bad) svg.push(`<text x="${x0}" y="${y0 + 38}" fill="${col}">× ${esc(m.fails.join(' '))}</text>`);
}
// 俯视：外缘点 vs 目标圆
const R0 = RING.RADIUS_DEF, Rout = splitRingOuter(R0), PS = 1.4, cx = 40 + Rout * PS + 110, cy = 60 + cellH + 60 + Rout * PS + 40;
svg.push(`<circle cx="${cx}" cy="${cy}" r="${Rout * PS}" fill="none" stroke="#999" stroke-dasharray="4 3"/>`);
svg.push(`<circle cx="${cx}" cy="${cy}" r="${R0 * PS}" fill="none" stroke="#bbb"/>`);
let maxDev = 0;
for (let i = 0; i < 20; i++) {
  const th = (i / 20) * Math.PI * 2, rr = R0 + M[order[i]].reach, dev = rr - Rout;
  maxDev = Math.max(maxDev, Math.abs(dev));
  svg.push(`<circle cx="${(cx + Math.cos(th) * rr * PS).toFixed(1)}" cy="${(cy + Math.sin(th) * rr * PS).toFixed(1)}" r="3" fill="#2d6a4f"/>`);
  svg.push(`<text x="${(cx + Math.cos(th) * rr * PS * 1.12).toFixed(1)}" y="${(cy + Math.sin(th) * rr * PS * 1.12 + 3).toFixed(1)}" fill="#2d6a4f" text-anchor="middle">${i}·j${SPLIT_RING_TIERS[order[i]].pair}</text>`);
}
svg.push(`<text x="${cx + Rout * PS + 30}" y="${cy - Rout * PS + 10}">俯视：二十个外缘点 vs 目标圆（虚线，半径 ${R0} + ${SPLIT_RING_TARGET}）· 最大偏差 ${maxDev.toFixed(2)}px</text>`);
svg.push(`<text x="${cx + Rout * PS + 30}" y="${cy - Rout * PS + 26}">十对位置的 t（双平台 → 整块，总高等步）：${SPLIT_RING_TIERS.map((t) => t.t.toFixed(2)).join(' ')}</text>`);
svg.push(`<text x="${cx + Rout * PS + 30}" y="${cy - Rout * PS + 42}">终态缝心离下缘：${Math.min(...mouth).toFixed(1)}–${Math.max(...mouth).toFixed(1)}px（散布 ${(Math.max(...mouth) - Math.min(...mouth)).toFixed(2)}，居中对位）· 总高 ${Math.min(...M.map((m) => m.boxH)).toFixed(1)}–${Math.max(...M.map((m) => m.boxH)).toFixed(1)}</text>`);
let yy = cy - Rout * PS + 62;
for (const [i, t] of SPLIT_RING_TIERS.entries()) {
  const m = M[i];
  svg.push(`<text x="${cx + Rout * PS + 30}" y="${yy}" fill="${m.fails.length ? '#c0392b' : '#333'}">j${t.pair} t=${t.t.toFixed(3)} ${t.k !== undefined ? 'k' + t.k : 'boxD' + t.boxD + '/D' + t.D}：挑出 ${m.reach.toFixed(1)} 总高 ${m.boxH.toFixed(1)} 锁 ${m.locked}/${m.tot} 结 ${m.knot} Δ ${m.silD.toFixed(2)} 缝底 ${m.seamMin.toFixed(1)} 缝心 ${m.mouthY.toFixed(1)}${m.fails.length ? ' × ' + esc(m.fails.join(' · ')) : ''}</text>`);
  yy += 14;
}
svg.push('</svg>');
writeFileSync(OUT, svg.join('\n'));
console.log(`写出 ${OUT}`);
