// 方形环 · 捏分「一次循环」的线稿（2026-09-02，用户拍板「一次循环优先，厚度让路」）
//
// 用法： npx vite-node scripts/skin-ring/loop-draft.mjs <out.svg>
//
// **定案数据与构造全部取自站上模块 `skin-square-split.ts`**（§17 纪律：线稿与站上共用一份实现，
// 留两份必然漂）。这里只做三件事：把每条引擎跑到终态、按环上的顺序把二十条剖面并排画出来、
// 再画一张俯视外缘点对目标方形的图。判据照守门（键全锁 · 打结每 10 步采 ≤6 · 剪影Δ <6 ·
// 顶底面水平度 <1.5）；**没过的档画成红色并写明理由**（§17.10.5 的教训：只打在控制台，
// 一个坏形照样被画成提案）。
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { silhouette } from '../../src/lib/space/skin-split.ts';
import { SQUARE } from '../../src/lib/space/skin-square.ts';
import {
  SQSPLIT, SQSPLIT_BAND, SQSPLIT_T, SQSPLIT_TIERS, SQSPLIT_REACH, SQSPLIT_SCHEDULE,
  buildSquareSplitOrder, sqSplitBuild, sqSplitHalfSide, sqSplitPairOf, sqSplitRim, sqSplitTarget,
} from '../../src/lib/space/skin-square-split.ts';

const OUT = process.argv[2] ?? 'loop-square.svg';

/** 两段是否相交（自交检测用，与守门同式） */
function seg2Hit(a, b, c, d) {
  const s1x = b[0] - a[0], s1y = b[1] - a[1], s2x = d[0] - c[0], s2y = d[1] - c[1];
  const den = -s2x * s1y + s1x * s2y;
  if (Math.abs(den) < 1e-12) return false;
  const q = (-s1y * (a[0] - c[0]) + s1x * (a[1] - c[1])) / den;
  const r = (s2x * (a[1] - c[1]) - s2y * (a[0] - c[0])) / den;
  return q > 0 && q < 1 && r > 0 && r < 1;
}

/** 跑一条引擎到终态：剖面（px，y 以带子下缘为 0、向上为正）+ 守门口径的读数 */
function measure(tier) {
  const b = sqSplitBuild(tier);
  const H = b.h; // 变高：每级自己的总高
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
  // 离下缘的高度：引擎的 y 向上为正、末节点钉在下缘（守门里「缝心离下缘」= py[center] − py[n−1]）
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
  // 剪影Δ：终态 vs 目标线（同一 y 网格的平均横向差）
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
  // 下板底面离下缘（变高读法的对位量）；顶板顶面 = 下板底面 + H
  const floorY = py(b.marks.outB);
  return { profile, reach, boxH: mean(top) - mean(bot), H, silD, knot, locked: s.locked.length, tot, seamMin, mouthY: py(b.marks.center), floorY, fails };
}

const cls = ['面', '边', '角'];
const order = buildSquareSplitOrder();
const M = SQSPLIT_TIERS.map((t) => measure(t));
for (const [i, t] of SQSPLIT_TIERS.entries()) {
  const m = M[i];
  console.log(`${t.en.padEnd(10)} L${t.level} t=${t.t}  挑出 ${m.reach.toFixed(1)}（表 ${SQSPLIT_REACH[i]}） 总高 ${m.boxH.toFixed(2)}/${m.H.toFixed(1)} 锁 ${m.locked}/${m.tot} 结 ${m.knot} Δ ${m.silD.toFixed(2)} 缝底 ${m.seamMin.toFixed(1)} 下板底 ${m.floorY.toFixed(1)} 缝心 ${m.mouthY.toFixed(1)}${m.fails.length ? '  × ' + m.fails.join(' · ') : ''}`);
}

// ── SVG ─────────────────────────────────────────────────────────────────────
const S = 1.2; // 剖面放大
const maxR = Math.max(...M.map((m) => m.reach));
const cellW = maxR * S + 28, cellH = 260 * S;
const W = 20 * cellW + 80, PLAN = 380;
const svg = [];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${cellH + 90 + PLAN + 40}" font-family="ui-monospace, Menlo, monospace" font-size="10">`);
svg.push(`<rect width="100%" height="100%" fill="#fbfaf7"/>`);
svg.push(`<text x="20" y="22" font-size="14" font-weight="600">方形环 · 捏分 · 一次循环 · 变高（面极）：台高 ${SQSPLIT.LOBE} · 缝张到 ${SQSPLIT.W_END} · 带 ${SQSPLIT_BAND} · 边长 ${(2 * sqSplitHalfSide()).toFixed(0)}px · ${SQSPLIT_TIERS.length} 条引擎</text>`);
svg.push(`<text x="20" y="38">从双平台那条边的中点顺时针数二十位：位置 · 方位类 · 级 t · 挑出。每条剖面 x = 挑出方向、y 以带子下缘为 0（同一基线 ⇒ 缝心/平台高度可直接比）。红 = 没过守门判据。</text>`);
// 从极点起绕一圈：找到 j=0 的第一个位置
const start = order.findIndex((_, i) => sqSplitPairOf(i) === 0);
for (let q = 0; q < 20; q++) {
  const i = (start + q) % 20;
  const ti = order[i], t = SQSPLIT_TIERS[ti], m = M[ti];
  const x0 = 40 + q * cellW, y0 = 60 + cellH;
  const bad = m.fails.length > 0;
  const col = bad ? '#c0392b' : ['#2d6a4f', '#3a5a9c', '#7b3fa0'][t.cls];
  // 芯轴
  svg.push(`<line x1="${x0}" y1="${y0 - 260 * S}" x2="${x0}" y2="${y0}" stroke="#bbb" stroke-dasharray="2 3"/>`);
  const pts = m.profile.map(([x, y]) => `${(x0 + x * S).toFixed(1)},${(y0 - y * S).toFixed(1)}`).join(' ');
  svg.push(`<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.4" stroke-linejoin="round"/>`);
  svg.push(`<text x="${x0}" y="${y0 + 14}" fill="${col}">${i} · ${cls[t.cls]} · L${t.level}</text>`);
  svg.push(`<text x="${x0}" y="${y0 + 26}" fill="${col}">t ${t.t} · 挑出 ${m.reach.toFixed(1)}</text>`);
  if (bad) svg.push(`<text x="${x0}" y="${y0 + 38}" fill="${col}">× ${esc(m.fails.join(' '))}</text>`);
}
// 俯视：外缘点 vs 目标方形
const a = sqSplitHalfSide(), PS = 1.4, cx = 40 + a * PS + 110, cy = 60 + cellH + 60 + a * PS + 40;
svg.push(`<rect x="${cx - a * PS}" y="${cy - a * PS}" width="${2 * a * PS}" height="${2 * a * PS}" fill="none" stroke="#999" stroke-dasharray="4 3"/>`);
svg.push(`<circle cx="${cx}" cy="${cy}" r="${SQUARE.RADIUS * PS}" fill="none" stroke="#bbb"/>`);
const rim = sqSplitRim();
for (const [i, p] of rim.entries()) {
  const ti = order[i], t = SQSPLIT_TIERS[ti];
  const col = ['#2d6a4f', '#3a5a9c', '#7b3fa0'][t.cls];
  svg.push(`<circle cx="${(cx + p.x * PS).toFixed(1)}" cy="${(cy + p.z * PS).toFixed(1)}" r="3" fill="${col}"/>`);
  svg.push(`<text x="${(cx + p.x * PS * 1.12).toFixed(1)}" y="${(cy + p.z * PS * 1.12 + 3).toFixed(1)}" fill="${col}" text-anchor="middle">${i}·L${t.level}</text>`);
}
const devs = rim.map((p) => Math.abs(p.dev));
svg.push(`<text x="${cx + a * PS + 30}" y="${cy - a * PS + 10}">俯视：二十个外缘点 vs 目标方形（虚线）· 最大偏差 ${Math.max(...devs).toFixed(2)}px · 半边长 ${a.toFixed(1)}</text>`);
svg.push(`<text x="${cx + a * PS + 30}" y="${cy - a * PS + 26}">十对位置的级（从双平台边到整块边）：${SQSPLIT_SCHEDULE.join(' ')}  · t = ${SQSPLIT_SCHEDULE.map((l) => SQSPLIT_T[l]).join(' ')}</text>`);
const my = M.map((m) => m.floorY);
svg.push(`<text x="${cx + a * PS + 30}" y="${cy - a * PS + 42}">终态下板底面离下缘：${Math.min(...my).toFixed(1)}–${Math.max(...my).toFixed(1)}px（散布 ${(Math.max(...my) - Math.min(...my)).toFixed(2)}）· 总高 ${Math.min(...M.map((m) => m.boxH)).toFixed(1)}–${Math.max(...M.map((m) => m.boxH)).toFixed(1)}</text>`);
let yy = cy - a * PS + 62;
for (const [i, t] of SQSPLIT_TIERS.entries()) {
  const m = M[i];
  svg.push(`<text x="${cx + a * PS + 30}" y="${yy}" fill="${m.fails.length ? '#c0392b' : '#333'}">${cls[t.cls]} L${t.level} t=${t.t} ${t.k !== undefined ? 'k' + t.k : 'boxD' + t.boxD + '/D' + t.D}：挑出 ${m.reach.toFixed(1)} 总高 ${m.boxH.toFixed(1)} 锁 ${m.locked}/${m.tot} 结 ${m.knot} Δ ${m.silD.toFixed(2)} 缝底 ${m.seamMin.toFixed(1)} 下板底 ${m.floorY.toFixed(1)}${m.fails.length ? ' × ' + esc(m.fails.join(' · ')) : ''}</text>`);
  yy += 14;
}
svg.push('</svg>');
writeFileSync(OUT, svg.join('\n'));
console.log(`写出 ${OUT}`);
