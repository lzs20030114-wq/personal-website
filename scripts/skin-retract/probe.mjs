// **回程松键探针**（a 路径，用户 2026-10-06 拍板「收回 = 松键，同一单元下次能成不同形态」）
//
//   npx vite-node scripts/skin-retract/probe.mjs [out.svg] [A=ledge] [B=stepped]
//
// 一个单元、一条带（环族 202 节：lead 58 / free 129 / tail 15，四种形态同一带长同一对位）：
//   ① 成形 A（正向协议 1500 步）
//   ② 回程松键回直（retractStep 1500 步：r 从 r₁ 回 R0，键按锁定时的 r 倒序解开）
//   ③ 把回直的布搬到谱 B 的新实例上再成形，与**全新跑 B** 逐节点比
//   ④ 再回程，再成形 A，与全新 A 比
// 量四件：回程每一帧（密帧、不平滑——§16.3）· 回直残差（对「无键布条在 R0 的自然形」）·
// 第二次成形与全新单元之差（节点位置 / 剪影Δ / 锁定集合 / 锁定时刻）· 回 A 能否复现。
// 方法纪律：项目二_皮肤单元lab.md §16——数字只做筛选，判断必须看渲染出来的帧。
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { buildRingUnits, RING_LEAD, RING_FREE } from '../../src/lib/space/skin-ring.ts';
import { silhouette } from '../../src/lib/space/skin-split.ts';

const OUT = process.argv[2] ?? 'retract-probe.svg';
const A_KEY = process.argv[3] ?? 'ledge';
const B_KEY = process.argv[4] ?? 'stepped';
const units = buildRingUnits();
const A = units.find((u) => u.key === A_KEY);
const B = units.find((u) => u.key === B_KEY);
if (!A || !B) throw new Error(`unknown form: ${A_KEY}/${B_KEY}`);
const F0 = RING_LEAD;
const F1 = RING_LEAD + RING_FREE; // 自由段 [F0, F1)
const PX = 100; // 引擎单位 → px

// ── 工具 ────────────────────────────────────────────────────────────────────
function seg2Hit(a, b, c, d) {
  const s1x = b[0] - a[0], s1y = b[1] - a[1], s2x = d[0] - c[0], s2y = d[1] - c[1];
  const den = -s2x * s1y + s1x * s2y;
  if (Math.abs(den) < 1e-12) return false;
  const q = (-s1y * (a[0] - c[0]) + s1x * (a[1] - c[1])) / den;
  const r = (s2x * (a[1] - c[1]) - s2y * (a[0] - c[0])) / den;
  return q > 0 && q < 1 && r > 0 && r < 1;
}
/** 自由段折线最大自交环（节数）——2–3 节是褶皱、几十节是死结（§15.10 的口径） */
function knotSpan(s) {
  const p = [];
  for (let i = F0; i < F1; i++) p.push([s.px[i], s.py[i]]);
  let sp = 0;
  for (let i = 0; i + 1 < p.length; i++)
    for (let j = i + 2; j + 1 < p.length; j++) if (j - i > sp && seg2Hit(p[i], p[i + 1], p[j], p[j + 1])) sp = j - i;
  return sp;
}
const snap = (s) => ({ px: Float64Array.from(s.px), py: Float64Array.from(s.py), locked: s.locked.map((b) => [...b]) });
function nodeDiff(a, b) {
  let max = 0, sum = 0;
  for (let i = 0; i < a.px.length; i++) {
    const d = Math.hypot(a.px[i] - b.px[i], a.py[i] - b.py[i]) * PX;
    if (d > max) max = d;
    sum += d * d;
  }
  return { max, rms: Math.sqrt(sum / a.px.length) };
}
const profile = (st) => { const p = []; for (let i = F0; i < F1; i++) p.push([st.px[i] * PX, -st.py[i] * PX]); return p; };
function silDelta(sa, sb) {
  const pa = profile(sa), pb = profile(sb);
  let lo = Infinity, hi = -Infinity;
  for (const [, y] of [...pa, ...pb]) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
  const A1 = silhouette(pa, lo, hi), B1 = silhouette(pb, lo, hi);
  let sum = 0;
  for (let i = 0; i < A1.length; i++) sum += Math.abs(A1[i] - B1[i]);
  return sum / A1.length;
}
const lockKey = (locked) => locked.map(([i, j]) => `${i}-${j}`).sort().join(' ');
const maxFreeX = (st) => { let m = 0; for (let i = F0; i < F1; i++) m = Math.max(m, st.px[i] * PX); return m; };

/** 正向成形；from = 搬运来的位置（applyTerminalState：锁定清空、step 0、r = R0） */
function contract(def, from) {
  const s = createSkinUnit(def.spec, def.opts);
  if (from) s.applyTerminalState({ px: Float64Array.from(from.px), py: Float64Array.from(from.py), locked: [], step: 0, r: SKIN.R0 });
  const lockSteps = [];
  let seen = 0, knot = 0, peak = 0, peakStep = 0;
  const q = new Float64Array(2 * s.n);
  for (let k = 0; k < SKIN.STEPS; k++) {
    q.set(s.px, 0); q.set(s.py, s.n);
    s.advance();
    let d = 0;
    for (let i = F0; i < F1; i++) d = Math.max(d, Math.hypot(s.px[i] - q[i], s.py[i] - q[s.n + i]) * PX);
    if (d > peak) { peak = d; peakStep = k + 1; }
    while (seen < s.locked.length) { lockSteps.push(k + 1); seen++; }
    if (k % 10 === 0) knot = Math.max(knot, knotSpan(s));
  }
  return { s, st: snap(s), lockSteps, knot, peak, peakStep };
}
/** 回程 1500 步：帧 / 解键时刻 / 自交 / 猛动 */
function retract(s, frameAt) {
  const frames = new Map();
  const relSteps = [];
  let seen = 0, knot = 0, peak = 0, peakStep = 0;
  const q = new Float64Array(2 * s.n);
  frames.set(0, snap(s));
  for (let k = 0; k < SKIN.STEPS; k++) {
    q.set(s.px, 0); q.set(s.py, s.n);
    s.retractStep();
    let d = 0;
    for (let i = F0; i < F1; i++) d = Math.max(d, Math.hypot(s.px[i] - q[i], s.py[i] - q[s.n + i]) * PX);
    if (d > peak) { peak = d; peakStep = k + 1; }
    while (seen < s.released.length) { relSteps.push(k + 1); seen++; }
    if (k % 10 === 0) knot = Math.max(knot, knotSpan(s));
    if (frameAt.includes(k + 1)) frames.set(k + 1, snap(s));
  }
  return { frames, relSteps, knot, peak, peakStep, st: snap(s), r: s.r };
}
/**
 * 参考 = 同一条带（键谱照旧，故 rootHug 只钉键跨之外的根部料）、从全新实例直接走回程物理
 * 1500 步（r 恒 R0、外压 0、不开拉链 ⇒ 不会锁键）= 这条布在 R0 下不带任何键时的自然形。
 * （曾试「把键谱删空」当参考：没有键跨 ⇒ 整段自由段都算根部料、被 rootHug 钉成直线 0 px，不公平。）
 */
function restRef(def) {
  const s = createSkinUnit(def.spec, def.opts);
  for (let k = 0; k < SKIN.STEPS; k++) s.retractStep();
  if (s.locked.length) throw new Error('rest reference locked bonds');
  return snap(s);
}

// ── 跑 ─────────────────────────────────────────────────────────────────────
const FR = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1200, 1500];
const DENSE = Array.from({ length: 19 }, (_, i) => (i + 1) * 50); // 50…950
const freshA = contract(A);
const retA = retract(freshA.s, [...new Set([...FR, ...DENSE])].sort((a, b) => a - b));
const rest = restRef(A);
const afterB = contract(B, retA.st);
const freshB = contract(B);
// 全程轨迹差（两条独立重跑，并行逐步比）：初始差多少、第几步收敛到 <0.1px
function trackDiff(def, from) {
  const s1 = createSkinUnit(def.spec, def.opts);
  s1.applyTerminalState({ px: Float64Array.from(from.px), py: Float64Array.from(from.py), locked: [], step: 0, r: SKIN.R0 });
  const s2 = createSkinUnit(def.spec, def.opts);
  const at = [0, 1, 5, 10, 20, 50, 100, 200, 400, 600, 800, 1000, 1500];
  const out = [];
  let last = 0; // 最后一次 ≥0.1px 的步（首次 <0.1 会被后面再分开骗过）
  let unit = 0; // 终态逐节点最大差（引擎单位，科学计数）
  for (let k = 0; k <= SKIN.STEPS; k++) {
    const d = nodeDiff(snap(s1), snap(s2)).max;
    if (at.includes(k)) out.push([k, d]);
    if (d >= 0.1) last = k;
    if (k === SKIN.STEPS) unit = d / PX;
    if (k < SKIN.STEPS) { s1.advance(); s2.advance(); }
  }
  return { out, last, unit };
}
const trB = trackDiff(B, retA.st);
const retB = retract(afterB.s, [...new Set([...FR, ...DENSE])].sort((a, b) => a - b));
const againA = contract(A, retB.st);

const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const line = (t) => console.log(t);
line(`探针：A=${A.zh}(${A.key}) → 回程 → B=${B.zh}(${B.key}) → 回程 → A，带 ${freshA.s.n} 节（lead ${F0} / free ${RING_FREE}）`);
line(`① 成形 A（全新）：锁 ${freshA.st.locked.length} 颗，首锁 step ${freshA.lockSteps[0]} 末锁 ${freshA.lockSteps.at(-1)}，猛动峰值 ${fmt(freshA.peak)} px/步 @${freshA.peakStep}，最大自交环 ${freshA.knot} 节`);
line(`② 回程（A→直）：解键 ${retA.relSteps.length} 颗，首解 step ${retA.relSteps[0]} 末解 ${retA.relSteps.at(-1)}；r 终 ${fmt(retA.r, 4)}；猛动峰值 ${fmt(retA.peak)} px/步 @${retA.peakStep}；最大自交环 ${retA.knot} 节`);
const resid = nodeDiff(retA.st, rest);
line(`   回直残差：自由段最大离轴 ${fmt(maxFreeX(retA.st))} px（R0 自然形参考 ${fmt(maxFreeX(rest))} px）；对参考逐节点 max ${fmt(resid.max)} / rms ${fmt(resid.rms)} px；剪影Δ ${fmt(silDelta(retA.st, rest))} px（精确：${(resid.max / PX).toExponential(2)} 引擎单位）`);
const dB = nodeDiff(afterB.st, freshB.st);
line(`③ 回程后成形 B vs 全新 B：锁 ${afterB.st.locked.length}/${freshB.st.locked.length}，锁定集合${lockKey(afterB.st.locked) === lockKey(freshB.st.locked) ? '逐位相同' : '不同'}；节点 max ${fmt(dB.max)} / rms ${fmt(dB.rms)} px；剪影Δ ${fmt(silDelta(afterB.st, freshB.st))} px；锁定时刻差 max ${Math.max(...afterB.lockSteps.map((v, i) => Math.abs(v - (freshB.lockSteps[i] ?? v))))} 步（首锁 ${afterB.lockSteps[0]} vs ${freshB.lockSteps[0]}）；B 成形最大自交环 ${afterB.knot}（全新 ${freshB.knot}）`);
line(`   B 全程轨迹差（回程后起步 vs 全新起步，节点 max px）：${trB.out.map(([k, d]) => `s${k}:${fmt(d, 2)}`).join(' ')}；最后一次 ≥0.1px 在 step ${trB.last}，终态差 ${trB.unit.toExponential(2)} 引擎单位`);
line(`④ 回程（B→直）：解键 ${retB.relSteps.length}，首解 ${retB.relSteps[0]} 末解 ${retB.relSteps.at(-1)}，猛动峰值 ${fmt(retB.peak)} px/步 @${retB.peakStep}，最大自交环 ${retB.knot}`);
const dA = nodeDiff(againA.st, freshA.st);
line(`   再成形 A vs 全新 A：锁 ${againA.st.locked.length}/${freshA.st.locked.length}，锁定集合${lockKey(againA.st.locked) === lockKey(freshA.st.locked) ? '逐位相同' : '不同'}；节点 max ${fmt(dA.max)} / rms ${fmt(dA.rms)} px；剪影Δ ${fmt(silDelta(againA.st, freshA.st))} px；锁定时刻差 max ${Math.max(...againA.lockSteps.map((v, i) => Math.abs(v - (freshA.lockSteps[i] ?? v))))} 步`);
line(`   回程 A 的解键时刻（前 12）：${retA.relSteps.slice(0, 12).join(' ')}${retA.relSteps.length > 12 ? ' …' : ''}`);
line(`   正向 A 的锁定时刻：${freshA.lockSteps.join(' ')}`);

// ── 画 ─────────────────────────────────────────────────────────────────────
const CW = 150, CH = 440, PAD = 24, LBL = 18;
const bandH = (freshA.s.n - 1) * SKIN.SEG * PX; // 402
function cell(st, ox, oy, label, opts = {}) {
  const sc = opts.scale ?? 1;
  const x = (i) => ox + 14 + st.px[i] * PX * sc;
  const y = (i) => oy + LBL + 6 + -st.py[i] * PX * sc; // 顶端在上（py=0），往下为负
  let out = `<text x="${ox + 4}" y="${oy + 12}" font-size="10" fill="#444">${label}</text>`;
  out += `<line x1="${ox + 14}" y1="${oy + LBL + 6}" x2="${ox + 14}" y2="${oy + LBL + 6 + bandH * sc}" stroke="#bbb" stroke-width="0.6"/>`;
  const pts = []; for (let i = 0; i < st.px.length; i++) pts.push(`${x(i).toFixed(1)},${y(i).toFixed(1)}`);
  out += `<polyline points="${pts.join(' ')}" fill="none" stroke="${opts.color ?? '#1c3a2c'}" stroke-width="${opts.width ?? 1.1}" stroke-linejoin="round"/>`;
  for (const [i, j] of st.locked) out += `<line x1="${x(i).toFixed(1)}" y1="${y(i).toFixed(1)}" x2="${x(j).toFixed(1)}" y2="${y(j).toFixed(1)}" stroke="#d9772b" stroke-width="0.8" opacity="0.9"/>`;
  if (opts.over) {
    const o = opts.over; const p2 = []; for (let i = 0; i < o.px.length; i++) p2.push(`${(ox + 14 + o.px[i] * PX * sc).toFixed(1)},${(oy + LBL + 6 - o.py[i] * PX * sc).toFixed(1)}`);
    out += `<polyline points="${p2.join(' ')}" fill="none" stroke="#8a5bd6" stroke-width="1.1" stroke-dasharray="3 2" opacity="0.9"/>`;
  }
  return out;
}
const row1 = [['① A 终态', freshA.st], ...FR.map((k) => [`回程 ${k}`, retA.frames.get(k)]), ['参考：R0 自然形', rest]];
const row2 = [
  ['③ B（回程后）实线 / 全新 B 虚线', afterB.st, { over: freshB.st }],
  ['全新 B', freshB.st],
  ['④ A 再成形 实线 / 全新 A 虚线', againA.st, { over: freshA.st }],
  ['回程 B 1500', retB.st],
];
const W = PAD * 2 + Math.max(row1.length, DENSE.length) * CW;
const denseScale = 0.6;
const H = PAD * 2 + CH * 2 + 40 + 2 * (CH * denseScale + 50) + 120;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,sans-serif"><rect width="100%" height="100%" fill="#fbfaf7"/>`;
svg += `<text x="${PAD}" y="16" font-size="12" fill="#222">回程松键探针 · A=${A.zh} → 回直 → B=${B.zh} → 回直 → A · 橙线 = 锁定键 · 不加绘图平滑</text>`;
row1.forEach(([l, st], i) => { svg += cell(st, PAD + i * CW, PAD + 10, l); });
row2.forEach(([l, st, o], i) => { svg += cell(st, PAD + i * CW * 1.6, PAD + 10 + CH + 20, l, o ?? {}); });
const yD = PAD + 10 + CH * 2 + 50;
svg += `<text x="${PAD}" y="${yD - 6}" font-size="11" fill="#444">② 回程密帧（每 50 步，0.6×）——看中间形态：有没有卷钩 / 锯齿 / 翻折</text>`;
DENSE.forEach((k, i) => { svg += cell(retA.frames.get(k), PAD + i * (CW * denseScale + 6), yD, `${k}`, { scale: denseScale }); });
const yD2 = yD + CH * denseScale + 50;
svg += `<text x="${PAD}" y="${yD2 - 6}" font-size="11" fill="#444">④ 回程 B（方箱 → 直）密帧（每 50 步，0.6×）</text>`;
DENSE.forEach((k, i) => { svg += cell(retB.frames.get(k), PAD + i * (CW * denseScale + 6), yD2, `${k}`, { scale: denseScale }); });
const yT = yD2 + CH * denseScale + 40;
const txt = [
  `① 全新 A：锁 ${freshA.st.locked.length}，锁定 step ${freshA.lockSteps[0]}–${freshA.lockSteps.at(-1)}`,
  `② 回程：解键 ${retA.relSteps.length}（step ${retA.relSteps[0]}–${retA.relSteps.at(-1)}），猛动峰值 ${fmt(retA.peak)} px/步 @${retA.peakStep}，最大自交环 ${retA.knot} 节；回直残差 vs R0 自然形 max ${fmt(resid.max)} / rms ${fmt(resid.rms)} px`,
  `③ B（回程后）vs 全新 B：节点 max ${fmt(dB.max)} / rms ${fmt(dB.rms)} px · 剪影Δ ${fmt(silDelta(afterB.st, freshB.st))} px · 锁定集合${lockKey(afterB.st.locked) === lockKey(freshB.st.locked) ? '相同' : '不同'}`,
  `④ A 再成形 vs 全新 A：节点 max ${fmt(dA.max)} / rms ${fmt(dA.rms)} px · 剪影Δ ${fmt(silDelta(againA.st, freshA.st))} px · 锁定集合${lockKey(againA.st.locked) === lockKey(freshA.st.locked) ? '相同' : '不同'}`,
];
txt.forEach((t, i) => { svg += `<text x="${PAD}" y="${yT + i * 16}" font-size="11" fill="#222">${t}</text>`; });
svg += '</svg>';
writeFileSync(OUT, svg);
line(`SVG → ${OUT}`);
