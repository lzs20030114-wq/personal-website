// **单元循环探针**（总框架 §12.10 第 8 条；2026-10-06 作者四项拍板：0/1 触发 · 布条按最长预裁 ·
// 先定形再落下 · 词汇表最小 = 平台 + 通道）
//
//   npx -y vite-node scripts/skin-cycle/probe.mjs [out.svg]
//
// 一条 338 节的布走完整个循环：直带子 → 判断「平台」→ 成形 → 判断「不激活」→ 回程松键 → 直带子
// → 判断「通道」→ 成形 → 换形 ⇒ 先收回 → 直带子 → 平台。每一步都与**全新单元**对照。
// 画出来的是过程帧（不加绘图平滑，§16.3），橙线 = 锁定键；数字只做筛选，判断看图。
import { writeFileSync } from 'node:fs';
import { SKIN, createSkinUnit } from '../../src/lib/space/skin-unit.ts';
import { SkinCycleUnit, cycleShapes, CYCLE_BAND } from '../../src/lib/space/skin-cycle.ts';

const OUT = process.argv[2] ?? 'cycle-probe.svg';
const PX = 100;
const shapes = cycleShapes();
const byKey = Object.fromEntries(shapes.map((s) => [s.key, s]));

const snap = (s, label) => ({ px: Float64Array.from(s.px), py: Float64Array.from(s.py), locked: s.locked.map((b) => [...b]), label });
const solve = (def) => { const s = createSkinUnit(def.spec, def.opts); for (let k = 0; k < SKIN.STEPS; k++) s.advance(); return s; };
const nodeMax = (a, b) => { let m = 0; for (let i = 0; i < a.px.length; i++) m = Math.max(m, Math.hypot(a.px[i] - b.px[i], a.py[i] - b.py[i])); return m; };
const lockKey = (l) => l.map(([i, j]) => `${i}-${j}`).sort().join(' ');
function seg2Hit(a, b, c, d) {
  const s1x = b[0] - a[0], s1y = b[1] - a[1], s2x = d[0] - c[0], s2y = d[1] - c[1];
  const den = -s2x * s1y + s1x * s2y;
  if (Math.abs(den) < 1e-12) return false;
  const q = (-s1y * (a[0] - c[0]) + s1x * (a[1] - c[1])) / den;
  const r = (s2x * (a[1] - c[1]) - s2y * (a[0] - c[0])) / den;
  return q > 0 && q < 1 && r > 0 && r < 1;
}
/** 结构段折线最大自交环（节数）——2–3 节是褶皱、几十节是死结 */
function knotSpan(s, [f0, f1]) {
  const p = []; for (let i = f0; i < f1; i++) p.push([s.px[i], s.py[i]]);
  let sp = 0;
  for (let i = 0; i + 1 < p.length; i++) for (let j = i + 2; j + 1 < p.length; j++) if (j - i > sp && seg2Hit(p[i], p[i + 1], p[j], p[j + 1])) sp = j - i;
  return sp;
}

// ── 跑 ─────────────────────────────────────────────────────────────────────
const u = new SkinCycleUnit(shapes);
const frames = [];
const log = [];
const FORM_AT = [300, 600, 900, 1500];
const RET_AT = [50, 100, 200, 300, 500, 900, 1500];
frames.push(snap(u.unit, '起点 · 直带子'));
/** 走一段过渡，按步号取帧、每 10 步量一次自交，记锁/解键时刻 */
function transition(name, at) {
  const def = u.shapeDef;
  let k = 0, knot = 0, peak = 0, peakAt = 0, firstLock = null, lastLock = null, firstRel = null, lastRel = null, nLockPrev = u.unit.locked.length, nRelPrev = u.unit.released.length;
  const q = new Float64Array(2 * u.unit.n);
  while (!u.resting) {
    q.set(u.unit.px, 0); q.set(u.unit.py, u.unit.n);
    u.tick(); k++;
    let d = 0; for (let i = 0; i < u.unit.n; i++) d = Math.max(d, Math.hypot(u.unit.px[i] - q[i], u.unit.py[i] - q[u.unit.n + i]) * PX);
    if (d > peak) { peak = d; peakAt = k; }
    if (u.unit.locked.length > nLockPrev) { firstLock ??= k; lastLock = k; }
    if (u.unit.released.length > nRelPrev) { firstRel ??= k; lastRel = k; }
    nLockPrev = u.unit.locked.length; nRelPrev = u.unit.released.length;
    if (k % 10 === 0 && def) knot = Math.max(knot, knotSpan(u.unit, def.structure));
    if (at.includes(k)) frames.push(snap(u.unit, `${name} ${k}`));
  }
  return { k, knot, peak, peakAt, firstLock, lastLock, firstRel, lastRel };
}
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

const freshPlat = solve(byKey.platform), freshChan = solve(byKey.channel);

u.apply({ active: true, shape: 'platform' });
let t = transition('平台成形', FORM_AT);
log.push(`① 判断「平台」→ 成形 ${t.k} 步：锁 ${u.unit.locked.length} 颗（step ${t.firstLock}–${t.lastLock}），猛动峰值 ${fmt(t.peak)} px/步 @${t.peakAt}，最大自交环 ${t.knot} 节；vs 全新平台 节点 max ${(nodeMax(u.unit, freshPlat) * PX).toExponential(2)} px，锁定集合${lockKey(u.unit.locked) === lockKey(freshPlat.locked) ? '相同' : '不同'}`);
u.apply({ active: false });
t = transition('回程', RET_AT);
log.push(`② 判断「不激活」→ 回程 ${t.k} 步：解键 step ${t.firstRel}–${t.lastRel}，猛动峰值 ${fmt(t.peak)} px/步 @${t.peakAt}，最大自交环 ${t.knot} 节；回到 idle：键 ${u.unit.locked.length}，r=${u.unit.r}`);
const idle1 = snap(u.unit, 'idle ①');
u.apply({ active: true, shape: 'channel' });
t = transition('通道成形', FORM_AT);
log.push(`③ 判断「通道」→ 成形 ${t.k} 步：锁 ${u.unit.locked.length} 颗（step ${t.firstLock}–${t.lastLock}），猛动峰值 ${fmt(t.peak)} px/步 @${t.peakAt}，最大自交环 ${t.knot} 节；vs 全新通道 节点 max ${(nodeMax(u.unit, freshChan) * PX).toExponential(2)} px，锁定集合${lockKey(u.unit.locked) === lockKey(freshChan.locked) ? '相同' : '不同'}`);
const chanDone = snap(u.unit, '通道终态');
u.apply({ active: true, shape: 'platform' }); // 换形 ⇒ 先收回
t = transition('回程', RET_AT);
log.push(`④ 判断「平台」(换形) → 先回程 ${t.k} 步：解键 step ${t.firstRel}–${t.lastRel}（含 step 0 预锁的缝链键，在回到 R0 那步解开），猛动峰值 ${fmt(t.peak)} px/步 @${t.peakAt}，最大自交环 ${t.knot} 节；idle：键 ${u.unit.locked.length}，r=${u.unit.r}`);
const idle2 = snap(u.unit, 'idle ②');
u.apply({ active: true, shape: 'platform' });
t = transition('平台成形', [1500]);
log.push(`⑤ 再判断「平台」→ 成形：vs 全新平台 节点 max ${(nodeMax(u.unit, freshPlat) * PX).toExponential(2)} px，锁定集合${lockKey(u.unit.locked) === lockKey(freshPlat.locked) ? '相同' : '不同'}；两次 idle 之差 ${(nodeMax(idle1, idle2) * PX).toExponential(2)} px；循环数 ${u.cycles}`);
const top = (s) => (s.py[0] - s.py[s.px.length - 1]) * PX;
log.push(`带 ${CYCLE_BAND} 节 · 终态顶端离钉住点：平台 ${fmt(top(freshPlat), 1)} px / 通道 ${fmt(top(freshChan), 1)} px（同一套贴合、同样的自由总量 ⇒ 相同）· 平台中心 ${fmt((freshPlat.py[(byKey.platform.structure[0] + byKey.platform.structure[1] - 1) / 2] - freshPlat.py[freshPlat.n - 1]) * PX, 1)} px / 通道缝心 ${fmt((freshChan.py[byKey.channel.seam] - freshChan.py[freshChan.n - 1]) * PX, 1)} px`);
for (const l of log) console.log(l);

// ── 画 ─────────────────────────────────────────────────────────────────────
const SC = 0.5, CW = 118, PAD = 24, LBL = 16;
const bandH = (CYCLE_BAND - 1) * SKIN.SEG * PX * SC;
const CH = bandH + LBL + 30;
function cell(st, ox, oy, opts = {}) {
  const x = (i) => ox + 12 + st.px[i] * PX * SC;
  const y = (i) => oy + LBL + 6 - st.py[i] * PX * SC;
  let out = `<text x="${ox + 2}" y="${oy + 11}" font-size="9.5" fill="#444">${st.label}</text>`;
  out += `<line x1="${ox + 12}" y1="${oy + LBL + 6}" x2="${ox + 12}" y2="${oy + LBL + 6 + bandH}" stroke="#bbb" stroke-width="0.6"/>`;
  const pts = []; for (let i = 0; i < st.px.length; i++) pts.push(`${x(i).toFixed(1)},${y(i).toFixed(1)}`);
  out += `<polyline points="${pts.join(' ')}" fill="none" stroke="${opts.color ?? '#1c3a2c'}" stroke-width="1" stroke-linejoin="round"/>`;
  for (const [i, j] of st.locked) out += `<line x1="${x(i).toFixed(1)}" y1="${y(i).toFixed(1)}" x2="${x(j).toFixed(1)}" y2="${y(j).toFixed(1)}" stroke="#d9772b" stroke-width="0.8" opacity="0.9"/>`;
  if (opts.over) {
    const o = opts.over; const p2 = []; for (let i = 0; i < o.px.length; i++) p2.push(`${(ox + 12 + o.px[i] * PX * SC).toFixed(1)},${(oy + LBL + 6 - o.py[i] * PX * SC).toFixed(1)}`);
    out += `<polyline points="${p2.join(' ')}" fill="none" stroke="#8a5bd6" stroke-width="1" stroke-dasharray="3 2" opacity="0.9"/>`;
  }
  return out;
}
const row2 = [
  { ...snap(u.unit, '⑤ 平台再成形 实线 / 全新平台 虚线'), over: snap(freshPlat) },
  { ...chanDone, label: '③ 通道（回程后）实线 / 全新通道 虚线', over: snap(freshChan) },
  { ...idle1, label: 'idle ① 实线 / idle ② 虚线', over: idle2 },
];
const W = PAD * 2 + frames.length * CW;
const H = PAD * 2 + CH * 2 + 30 + log.length * 15 + 30;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,sans-serif"><rect width="100%" height="100%" fill="#fbfaf7"/>`;
svg += `<text x="${PAD}" y="16" font-size="12" fill="#222">单元循环探针 · 一条 ${CYCLE_BAND} 节的布：直带子 → 平台 → 回程 → 通道 → 回程 → 平台 · 橙线 = 锁定键 · 0.5× · 不加绘图平滑</text>`;
frames.forEach((st, i) => { svg += cell(st, PAD + i * CW, PAD + 8); });
row2.forEach((st, i) => { svg += cell(st, PAD + i * CW * 2.2, PAD + 8 + CH + 10, { over: st.over }); });
const yT = PAD + 8 + CH * 2 + 30;
log.forEach((l, i) => { svg += `<text x="${PAD}" y="${yT + i * 15}" font-size="10.5" fill="#222">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`; });
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`SVG → ${OUT}`);
