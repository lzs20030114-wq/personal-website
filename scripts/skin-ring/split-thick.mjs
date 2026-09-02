// 方形环 · 捏分：**表外参数的探索工具**（2026-09-01「整体厚一些 / 一次循环」那轮）
//
// 定案三档在 src/lib/space/skin-square-split.ts 里冻结成表，站上与线稿都走它（§17 纪律）。
// 这里这份是**参数化**的同一套构造，只服务表外的问题：换箱高会怎样、等比放大到哪一步爆
// 预算、1 重编制的天花板在哪。它不进 src/，也不是第二份实现——定案一旦改，以模块为准。
//
// 模式（环境变量）：
//   FINE=1 H=68     箱高 × 缝宽扫描（找打结的坏点）
//   TIERS=1         三档在候选箱高上的实测
//   CAL2=1 H=68 W=24  完整重标（面档天花板定方形 → 反推边/角）
//   MIRROR=1 H=68 W=24 [AT=58]  1 重编制（一圈一个来回）的天花板 / 逐组合诊断
//   ALLOC=1 [FTOT= LEAD= BAND=] HS=…  换带子分配 / 加长带子能把缝做到多深
//   JOINT=1 H=92 [BAND= FTOT= LEAD=]  联合标定：三档候选集 + 半边长 a 一起优化
//
// **两段式标定（2026-09-02 加，别退回一段式）**：扫掠为了跑得动，自交检测是**每 25 步**
// 采一次；而守门是每 10 步。死结是瞬态，稀采样会整段漏掉——评分最高那组曾「打结 0」而
// 守门当场报 52 节。故 JOINT 出候选后**按分数排队、逐组用守门那个密度复核**，取第一组干净的。

import { createSkinUnit, SKIN, SKIN_ROOT_FIX } from '../../src/lib/space/skin-unit.ts';
import { SQUARE, SQUARE_RUNGS, squareFreeTotal, squareLead } from '../../src/lib/space/skin-square.ts';
import { RING_BAND_NODES } from '../../src/lib/space/skin-ring.ts';
import { silhouette } from '../../src/lib/space/skin-split.ts';

const F_TOT = squareFreeTotal(), LEAD = squareLead(F_TOT);
// 分配（自由段总量 / 贴合段）——默认 = 平档那份；ALLOC 模式扫「把带子重新分配能换到多深的缝」
const A_F = Number(process.env.FTOT ?? F_TOT), A_LEAD = Number(process.env.LEAD ?? (A_F === F_TOT ? LEAD : SQUARE.LEAD_MIN));
// 带子总长：默认 = 环族那个钉死的 202；BAND=… 用来探「加长带子能换到多深的缝」
const A_BAND = Number(process.env.BAND ?? RING_BAND_NODES);
const SQUARE_EDGE_T = Number(process.env.ET ?? 0.5);
/** 缝角鼓出端面的上限（px）。1.5 与这一族其它「形对不对」的线同级；
 *  历史上用户拍板过的那版实测 0.56，故不能定在 0.5。 */
const VERT_MAX = Number(process.env.VERT ?? 1.5);
const seamW = (t, w) => w * Math.pow(t, 0.7);
const sink = (t, D) => D * Math.pow(t, 1.2);
const tip = (t) => 0.4 + 0.6 * t;

/**
 * 目标线（与 split-draft.mjs 的 `targetAt` 同一条，只是把箱高也参数化）：
 * 外顶面 → 端面 → 缝（嘴宽 w、尖宽 wt、退到 D−dv） → 外底面。
 */
function targetAt(t, D, wEnd, H) {
  const w = seamW(t, wEnd), dv = sink(t, D), wt = w * tip(t), y0 = -H / 2;
  const p = [[0, y0], [D, y0]];
  if (w > 0.5) p.push([D, -w / 2], [D - dv, -wt / 2], [D - dv, wt / 2], [D, w / 2]);
  p.push([D, -y0], [0, -y0]);
  return p;
}

/** 两段是否相交（自交检测用） */
function seg2Hit(a, b, c, d) {
  const s1x = b[0] - a[0], s1y = b[1] - a[1], s2x = d[0] - c[0], s2y = d[1] - c[1];
  const den = -s2x * s1y + s1x * s2y;
  if (Math.abs(den) < 1e-12) return false;
  const q = (-s1y * (a[0] - c[0]) + s1x * (a[1] - c[1])) / den;
  const r = (s2x * (a[1] - c[1]) - s2y * (a[0] - c[0])) / den;
  return q > 0 && q < 1 && r > 0 && r < 1;
}

/** 参数化：箱高 H、缝宽 wEnd、目标深度 D、箱设计深度 boxD、形态 t */
function build(H, wEnd, D, boxD, t, F_TOT = A_F, LEAD = A_LEAD) {
  const w = seamW(t, wEnd), dv = sink(t, D), wt = w * tip(t);
  const lobe = (H - w) / 2, faceN = Math.round(lobe / 2);
  const a = Math.max(1, Math.round(wt / 4)), wallN = Math.max(1, Math.round(dv / 2));
  const m = a + wallN, f = m + faceN, M = f + boxD / 2;
  let buf = SQUARE.BUF_MIN;
  for (; buf < 60; buf++) { const sp = 1.2 * (M + buf); if (sp - H >= SQUARE.G_MIN && 4 * buf - (sp - H) >= SQUARE.E_MIN) break; }
  // 富余上限（SQUARE.E_MAX）：超了折叠体会沿轴浮起来 —— 读数全绿而平台不平
  if (4 * buf - (1.2 * (M + buf) - H) > SQUARE.E_MAX) return { floats: buf };
  const free = 2 * (M + buf) + 1;
  if (free > F_TOT) return { over: free };
  const c = buf + M, wv = (w + wt) / 2;
  const crack = [[c - m, c + m, w / 100]];
  for (let k = m - 2; k > a + 1; k -= 2) crack.push([c - k, c + k, wv / 100]);
  crack.push([c - a, c + a, wt / 100]);
  const bonds = [...new Set(Array.from({ length: SQUARE_RUNGS }, (_, i) => Math.round(f + ((M - f) * i) / (SQUARE_RUNGS - 1))))].map((k) => [c - k, c + k, H / 100]);
  const seg = ['f', free, bonds, [[c - f, c - m], [c + m, c + f], [c - a, c + a]], [crack, [[c - f, c - m, lobe / 100]], [[c + m, c + f, lobe / 100]]]];
  const pad = F_TOT - free, half = pad / 2, tail = A_BAND - 2 * SQUARE.ISO - F_TOT - LEAD;
  if (pad % 2) return { odd: pad };
  const spec = half > 0
    ? [['g', LEAD], ['f', half, []], ['g', SQUARE.ISO], seg, ['g', SQUARE.ISO], ['f', half, []], ['g', tail]]
    : [['g', LEAD + SQUARE.ISO], seg, ['g', SQUARE.ISO + tail]];
  const base = half > 0 ? LEAD + half + SQUARE.ISO : LEAD + SQUARE.ISO;
  const c0 = base + c, rTip = (D - dv) / 100;
  const tether = []; for (let k = -a; k <= a; k++) tether.push([c0 + k, rTip]);
  for (let k = a + 1; k <= m; k++) { const r = rTip + ((k - a) * (D / 100 - rTip)) / wallN; tether.push([c0 + k, r], [c0 - k, r]); }
  const crease = []; for (let j = c0 - m + 1; j < c0 + m; j++) { if (j < c0) crease.push([j, c0 - m, 0]); else if (j > c0) crease.push([j, c0 + m, 0]); else crease.push([j, c0 - m, 0], [j, c0 + m, 0]); }
  return {
    spec, free, buf, M, lead: base,
    marks: { center: c0, mouthA: c0 - m, mouthB: c0 + m, faceA: c0 - f, faceB: c0 + f, outA: c0 - M, outB: c0 + M },
    opts: { ...SKIN_ROOT_FIX, anchorEnd: true, boxSquare: true, zipUp: [0], attNear: 2.5, attNearChains: [0], sqChains: [0], coreTether: tether, coreTetherRel: crease, alignRuns: [[c0 - m, c0 - a], [c0 + a, c0 + m]] },
  };
}
const CK = [400, 550, 650, 750, 1000, 1500];
/**
 * `knotEvery`：自交检测的采样步距。默认 25 是旧扫掠为跑得动的稀采样；**守门是每 10 步**，
 * 死结是瞬态、稀采样会整段漏掉（2026-09-02 一天坑了两次）。LOOP 模式直接按 10 采——
 * 密采样并进候选池，而不是事后复核。
 */
function run(b, tgt, knotEvery = 25) {
  const s = createSkinUnit(b.spec, b.opts);
  let knot = 0;
  const align = [];
  for (let k = 0; k < SKIN.STEPS; k++) {
    s.advance();
    // 缝心离带子下缘（对位）——**必须逐检查点记全程**，只看终态会挑到中段最偏的那个配置
    if (CK.includes(k + 1)) align.push((s.py[b.marks.center] - s.py[s.n - 1]) * 100);
    if (k % knotEvery === 0) {
      const p = []; for (let i = b.lead; i < b.lead + b.free; i++) p.push([s.px[i], s.py[i]]);
      let sp = 0;
      for (let i = 0; i + 1 < p.length; i++) for (let j = i + 2; j + 1 < p.length; j++)
        if (j - i > sp && seg2Hit(p[i], p[i + 1], p[j], p[j + 1])) sp = j - i;
      knot = Math.max(knot, sp);
    }
  }
  const px = (i) => s.px[i] * 100, py = (i) => -s.py[i] * 100;
  let reach = 0; for (let i = b.lead; i < b.lead + b.free; i++) reach = Math.max(reach, px(i));
  const win = (lo, hi) => { const v = []; for (let i = lo; i <= hi; i++) if (px(i) >= 0.35 * reach && px(i) <= 0.85 * reach) v.push(py(i)); return v; };
  const mean = (v) => v.reduce((a, c) => a + c, 0) / v.length, rng = (v) => Math.max(...v) - Math.min(...v);
  const top = win(b.marks.outA, b.marks.faceA), bot = win(b.marks.faceB, b.marks.outB);
  let seamMin = Infinity; for (let i = b.marks.mouthA; i <= b.marks.mouthB; i++) seamMin = Math.min(seamMin, px(i));
  // **缝角不许鼓出端面**：正值 = 缝角比面角还靠外，此时「挑出」量到的是缝角而不是台面外缘
  // ——方形就建在了错的特征上（2026-09-01 加深缝那轮撞到，端面竖直度从 0.24 掉到 4.08）。
  const faceX = (px(b.marks.faceA) + px(b.marks.faceB)) / 2;
  const vert = b.marks.mouthA === b.marks.mouthB ? 0
    : Math.max(px(b.marks.mouthA) - px(b.marks.faceA), px(b.marks.mouthB) - px(b.marks.faceB));
  let tot = 0; for (const ch of s.chains) tot += ch.length;
  const cy = (mean(top) + mean(bot)) / 2;
  const profile = [];
  for (let i = b.lead; i < b.lead + b.free; i++) profile.push([px(i), py(i) - cy]);
  // **剪影Δ 是唯一的形态判据**（§16.3）：锁定/打结/水平度全绿而形是楔形的情况真出现过
  // ——1 重编制那版就是这么混过验收的（用户 2026-09-01 从线稿里一眼看出「形状崩坏」）。
  let silD = NaN;
  if (tgt) {
    const half = tgt.H / 2 + 4;
    const A = silhouette(profile, -half, half);
    const B = silhouette(targetAt(tgt.t, tgt.D, tgt.wEnd, tgt.H), -half, half);
    let sum = 0;
    for (let i = 0; i < A.length; i++) sum += Math.abs(A[i] - B[i]);
    silD = sum / A.length;
  }
  return { reach, boxH: mean(bot) - mean(top), topFlat: rng(top), botFlat: rng(bot), locked: s.locked.length, tot, knot, seamMin, silD, align, vert, faceX, profile };
}

/** 角档（实心箱）在任意箱高下的谱——平档 squareSpec 把 SQUARE.H 写死了，这里参数化 */
function buildSolid(H, k, F_TOT = A_F, LEAD = A_LEAD) {
  const PW = Math.round(H / 4);
  let buf = SQUARE.BUF_MIN;
  for (; buf < 60; buf++) { const sp = 1.2 * (k + buf); if (sp - H >= SQUARE.G_MIN && 4 * buf - (sp - H) >= SQUARE.E_MIN) break; }
  if (4 * buf - (1.2 * (k + buf) - H) > SQUARE.E_MAX) return { floats: buf };
  const free = 2 * (k + buf) + 1;
  if (free > F_TOT) return { over: free };
  const c = (free - 1) / 2;
  const ks = [...new Set(Array.from({ length: SQUARE_RUNGS }, (_, i) => Math.round(PW + ((k - PW) * i) / (SQUARE_RUNGS - 1))))];
  const seg = ['f', free, ks.map((q) => [c - q, c + q, H / 100]), [[c - PW, c + PW]]];
  const pad = F_TOT - free, half = pad / 2, tail = A_BAND - 2 * SQUARE.ISO - F_TOT - LEAD;
  if (pad % 2) return { odd: pad };
  const spec = half > 0
    ? [['g', LEAD], ['f', half, []], ['g', SQUARE.ISO], seg, ['g', SQUARE.ISO], ['f', half, []], ['g', tail]]
    : [['g', LEAD + SQUARE.ISO], seg, ['g', SQUARE.ISO + tail]];
  const base = half > 0 ? LEAD + half + SQUARE.ISO : LEAD + SQUARE.ISO, c0 = base + c;
  return {
    spec, free, buf, M: k, lead: base,
    marks: { center: c0, mouthA: c0, mouthB: c0, faceA: c0 - PW, faceB: c0 + PW, outA: c0 - k, outB: c0 + k },
    opts: { ...SKIN_ROOT_FIX, anchorEnd: true, boxSquare: true, zipUp: [0], attNear: 2.5, attNearChains: [0] },
  };
}











if (process.env.MIRROR) {
  // 1 重编制（一圈一个来回）在给定箱高下的天花板：一条边裂开、对边整块
  const H = Number(process.env.H ?? 68), W = Number(process.env.W ?? 24);
  const T10 = [0, 0.108, 0.254, 0.397, 0.523, 0.638, 0.741, 0.834, 0.92, 1];
  const R = SQUARE.RADIUS, TH = (n) => (Math.PI / SQUARE.COUNT) * n;
  const cls = (i) => { const q = ((TH(1) + (i / 20) * Math.PI * 2) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2); return Math.round(Math.min(q, Math.PI / 2 - q) / ((Math.PI * 2) / 20) - 0.5); };
  const mir = (i) => (i <= 9 ? i : 19 - i);
  const order = Array.from({ length: 20 }, (_, i) => cls(i));
  let bestOff = 0, bestMax = 99;
  for (let o = 0; o < 20; o++) { const mx = Math.max(...order.flatMap((c, i) => (c === 2 ? [mir((i + o) % 20)] : []))); if (mx < bestMax) { bestMax = mx; bestOff = o; } }
  const combos = [...new Set(order.map((c, i) => `${c}:${mir((i + bestOff) % 20)}`))].map((k) => k.split(':').map(Number));
  console.log(`H=${H} 缝=${W}：1 重镜像 相位 ${bestOff} ⇒ 角位最高到 L${bestMax}；${combos.length} 条引擎`);
  // 判据里**必须有剪影Δ**：只看锁定/打结/水平度会放过楔形（2026-09-01 用户从线稿里
  // 一眼看出「形状崩坏」的那一版就是这么过的验收）。6.0 = 定案三档最差那档 3.35 的两倍。
  const okm = (m) => m.locked === m.tot && m.knot <= 6 && m.topFlat < 1.5 && m.botFlat < 1.5 && m.silD < 6 && m.vert <= VERT_MAX;
  const feasible = (a, verbose) => {
    const rs = [a / Math.cos(TH(1)) - R, a / Math.cos(TH(3)) - R, a / Math.cos(TH(5)) - R];
    const rows = [];
    for (const [c, l] of combos) {
      const want = rs[c];
      if (want <= 8) return null;
      if (l === 0) { // 单箱：扫 k
        let best = null;
        for (let k = Math.round(H / 4) + 9; k <= 62; k++) { const b = buildSolid(H, k); if (b.over || b.odd !== undefined || b.floats) continue; const m = run(b, { t: 0, D: want, wEnd: W, H }); if (!okm(m)) continue; if (!best || Math.abs(m.reach - want) < Math.abs(best.m.reach - want)) best = { m }; }
        if (!best || Math.abs(best.m.reach - want) > 2.5) { if (verbose) console.log(`   ${['面','边','角'][c]}L${l} 目标 ${want.toFixed(1)}: ${best ? '差 ' + (best.m.reach - want).toFixed(1) : '无干净候选'} ×`); return null; }
        rows.push([c, l, want, best.m]); continue;
      }
      let best = null;
      for (const dOff of [0, 3, 6]) for (let boxD = Math.max(6, Math.round((want - 20) / 2) * 2); boxD <= want + 12; boxD += 2) {
        const b = build(H, W, want + dOff, boxD, T10[l]); if (b.over || b.odd !== undefined || b.floats) continue;
        const m = run(b, { t: T10[l], D: want + dOff, wEnd: W, H }); if (!okm(m)) continue;
        if (!best || Math.abs(m.reach - want) < Math.abs(best.m.reach - want)) best = { boxD, m };
      }
      if (!best || Math.abs(best.m.reach - want) > 2.5) { if (verbose) console.log(`   ${['面','边','角'][c]}L${l} 目标 ${want.toFixed(1)}: ${best ? '差 ' + (best.m.reach - want).toFixed(1) : '无干净候选'} ×`); return null; }
      rows.push([c, l, want, best.m]);
    }
    if (verbose) for (const [c, l, want, m] of rows) console.log(`   ${['面','边','角'][c]}L${l}: 目标 ${want.toFixed(1)} 挑出 ${m.reach.toFixed(1)}（差 ${(m.reach - want).toFixed(1)}） 箱高 ${m.boxH.toFixed(2)} 顶平 ${m.topFlat.toFixed(2)} 结 ${m.knot} Δ ${m.silD.toFixed(2)} 缝底x ${m.seamMin.toFixed(1)}`);
    return rows;
  };
  if (process.env.AT) { console.log(`\n逐组合诊断 @ 半边长 ${process.env.AT}（边长 ${(2 * Number(process.env.AT)).toFixed(0)}）：`); feasible(Number(process.env.AT), true); process.exit(0); }
  let lo = 40, hi = 80, okA = null;
  for (let it = 0; it < 5; it++) { const mid = Math.round((lo + hi) / 2 * 10) / 10; process.stdout.write(` 试 半边长 ${mid}（边长 ${(2 * mid).toFixed(0)}）… `); const r = feasible(mid, false); console.log(r ? '✓' : '×'); if (r) { okA = mid; lo = mid; } else hi = mid; }
  if (!okA) { console.log('1 重在 边长 80 以上都装不下'); process.exit(0); }
  console.log(`\n⇒ 1 重天花板：半边长 ${okA} · **边长 ${(2 * okA).toFixed(0)}px**（4 重在同高度是 150）`);
  feasible(okA, true);
  process.exit(0);
}

if (process.env.LOOP) {
  // **一次循环 · 面极排法的候选池**（2026-09-02，用户拍板「一次循环优先，厚度让路」）。
  // 「一条边上是双平台，绕到对面变成整块」⇒ 镜像轴穿过两条对边的中点，二十位折成十对
  // [面 边 角 边 面 面 边 角 边 面]，每对一个级。面类要在**同一个挑出**上既做出整块（L0）
  // 又做出满裂（L9）：L0 的 E_MAX 下限与 L9 的材料上限一起夹出面类的窗口，角/边由方形
  // 的 1/cos 比值反推。这里**不定时间表**，只按 方位类 × 级别 扫各自的干净候选（挑出落在
  // 半边长区间 [A0, A1] 反推的窗口里），落盘给挑选阶段换时间表反复用；
  // **打结每 10 步采（守门口径）直接进候选池**，不再事后复核。
  //   LOOP=1 H=44 BAND=305 FTOT=259 LEAD=8 CLS=F [LV=0,4,5,9] [A0=79 A1=84] [DOFF=0,2,4,6] DUMP=out.json
  const H = Number(process.env.H ?? 44), W = Number(process.env.W ?? Math.round(H / 3));
  const A0 = Number(process.env.A0 ?? 79), A1 = Number(process.env.A1 ?? 84);
  const CLS = (process.env.CLS ?? 'F,E,C').split(',');
  const LV = (process.env.LV ?? '0,1,2,3,4,5,6,7,8,9').split(',').map(Number);
  const DOFF = (process.env.DOFF ?? '0,2,4,6').split(',').map(Number);
  const T10 = [0, 0.108, 0.254, 0.397, 0.523, 0.638, 0.741, 0.834, 0.92, 1];
  const R = SQUARE.RADIUS, TH = (n) => (Math.PI / SQUARE.COUNT) * n;
  const COS = { F: Math.cos(TH(1)), E: Math.cos(TH(3)), C: Math.cos(TH(5)) };
  const ok = (m) => m.locked === m.tot && m.knot <= 6 && m.topFlat < 1.5 && m.botFlat < 1.5 && Math.abs(m.boxH - H) < 0.5 && m.silD < 6 && m.vert <= VERT_MAX;
  const keep = (m) => ({ boxH: m.boxH, topFlat: m.topFlat, botFlat: m.botFlat, knot: m.knot, seamMin: m.seamMin, silD: m.silD, align: m.align, vert: m.vert, faceX: m.faceX, locked: m.locked, tot: m.tot });
  // 实心箱的剪影Δ：目标线取「实测挑出的矩形」，从返回的剖面直接算，不用再跑第二遍
  const silRect = (m) => {
    const half = H / 2 + 4, A = silhouette(m.profile, -half, half), B = silhouette(targetAt(0, m.reach, W, H), -half, half);
    let sum = 0; for (let i = 0; i < A.length; i++) sum += Math.abs(A[i] - B[i]);
    return sum / A.length;
  };
  const out = [], t0 = Date.now();
  let runs = 0;
  console.log(`══ 一次循环候选池 H=${H} 缝=${W} · 带 ${A_BAND} F_TOT=${A_F} lead=${A_LEAD} tail=${A_BAND - 2 * SQUARE.ISO - A_F - A_LEAD} · 半边长 ${A0}–${A1} ══`);
  for (const c of CLS) {
    const lo = A0 / COS[c] - R - 2, hi = A1 / COS[c] - R + 2;
    console.log(`${c}：挑出窗口 ${lo.toFixed(1)}–${hi.toFixed(1)}`);
    for (const l of LV) {
      const t = T10[l];
      const rows = [];
      if (t === 0) {
        // 实心箱：扫 k（平档深度表 挑出 ≈ 44.2 + 1.875·(k−28)，窗口两侧各放 3 格）
        const k0 = Math.floor((lo - 44.2) / 1.875 + 28) - 3, k1 = Math.ceil((hi - 44.2) / 1.875 + 28) + 3;
        for (let k = Math.max(12, k0); k <= k1; k++) {
          const b = buildSolid(H, k);
          if (b.over || b.odd !== undefined || b.floats) continue;
          const m = run(b, { t: 0, D: k * 2 * SKIN.R1, wEnd: W, H }, 10); runs++;
          m.silD = silRect(m);
          if (!ok(m) || m.reach < lo || m.reach > hi) continue;
          rows.push({ c, l, t, k, reach: m.reach, free: b.free, buf: b.buf, ...keep(m) });
        }
      } else {
        const bd0 = Math.floor((lo - 10) / 2) * 2, bd1 = Math.ceil((hi - 2) / 2) * 2;
        for (let boxD = Math.max(6, bd0); boxD <= bd1; boxD += 2) for (const dOff of DOFF) {
          let D = boxD + 6 + dOff, b = build(H, W, D, boxD, t);
          if (b.over || b.odd !== undefined || b.floats) continue;
          let m = run(b, { t, D, wEnd: W, H }, 10); runs++;
          // 自洽第二遍：目标取**面角 x**（§17.10 的教训：取 max 挑出会被鼓出的缝角污染成正反馈）
          const D2 = Math.round((m.faceX + dOff) * 10) / 10, b2 = build(H, W, D2, boxD, t);
          if (!b2.over && b2.odd === undefined && !b2.floats) { const m2 = run(b2, { t, D: D2, wEnd: W, H }, 10); runs++; if (ok(m2)) { m = m2; D = D2; b = b2; } }
          if (!ok(m)) continue;
          if (l === 9 && m.seamMin > 0.5) continue; // 满裂必须真裂到轴
          if (m.reach < lo || m.reach > hi) continue;
          rows.push({ c, l, t, boxD, D, dOff, reach: m.reach, free: b.free, buf: b.buf, ...keep(m) });
        }
      }
      out.push(...rows);
      const rs = rows.map((r) => r.reach);
      console.log(`  L${l} t=${t}: 干净候选 ${rows.length} 个${rows.length ? ` · 挑出 ${Math.min(...rs).toFixed(1)}–${Math.max(...rs).toFixed(1)}` : ''}  （${runs} 跑 / ${((Date.now() - t0) / 60000).toFixed(1)} min）`);
    }
  }
  if (process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(out));
  console.log(`共 ${out.length} 个干净候选，${runs} 跑，${((Date.now() - t0) / 60000).toFixed(1)} min`);
  process.exit(0);
}

if (process.env.CAL2) {
  // 标定顺序：**面档满裂的天花板定方形**（材料账 boxD + tether深 ≤ 86.4，与箱高无关），
  // 再由方形反推边/角的目标挑出，各自扫（boxD, tether深）二维
  const H = Number(process.env.H ?? 68), W = Number(process.env.W ?? 24);
  const R = SQUARE.RADIUS, TH = (n) => (Math.PI / SQUARE.COUNT) * n;
  const ok = (m) => m.locked === m.tot && m.knot <= 6 && m.topFlat < 1.5 && m.botFlat < 1.5;
  console.log(`══ H=${H} 缝=${W}（终态两片台各 ${((H - W) / 2).toFixed(1)}）══\n面档天花板：`);
  let face = null;
  for (let boxD = 34; boxD <= 46; boxD += 2) {
    let D = boxD + 7, b = build(H, W, D, boxD, 1);
    if (b.over || b.odd !== undefined || b.floats) { console.log(` 面 boxD${boxD}: ${b.over ? '自由段 ' + b.over + ' ×' : '垫非偶'}`); continue; }
    let m = run(b);
    const D2 = Math.round(m.reach * 10) / 10, b2 = build(H, W, D2, boxD, 1); // 第二遍自洽
    if (!b2.over && b2.odd === undefined && !b2.floats) { const m2 = run(b2); if (ok(m2)) { b = b2; m = m2; D = D2; } }
    console.log(` 面 boxD${boxD} D${D.toFixed(1)}: 挑出 ${m.reach.toFixed(1).padStart(5)} 箱高 ${m.boxH.toFixed(2)} 顶平 ${m.topFlat.toFixed(2)} 自由段 ${String(b.free).padStart(3)} 锁 ${m.locked}/${m.tot} 结 ${String(m.knot).padStart(2)} 缝底x ${m.seamMin.toFixed(2)}${ok(m) ? '' : '  ×'}`);
    if (ok(m) && m.seamMin < 0.5 && (!face || m.reach > face.m.reach)) face = { boxD, D, b, m };
  }
  if (!face) { console.log('面档无干净候选'); process.exit(1); }
  const a = (face.m.reach + R) * Math.cos(TH(1));
  const tEdge = a / Math.cos(TH(3)) - R, tCorner = a / Math.cos(TH(5)) - R;
  console.log(`\n面档定 boxD${face.boxD}/D${face.D}（挑出 ${face.m.reach.toFixed(1)}）⇒ 半边长 ${a.toFixed(1)} · **边长 ${(2 * a).toFixed(0)}px**`);
  console.log(`目标：边 ${tEdge.toFixed(1)} · 角 ${tCorner.toFixed(1)}\n边档（扫 boxD × tether深）：`);
  let edge = null;
  for (const dOff of [0, 3, 6]) for (let boxD = 44; boxD <= 60; boxD += 2) {
    const D = tEdge + dOff, b = build(H, W, D, boxD, 0.5);
    if (b.over || b.odd !== undefined || b.floats) continue;
    const m = run(b);
    if (!ok(m)) continue;
    if (!edge || Math.abs(m.reach - tEdge) < Math.abs(edge.m.reach - tEdge)) edge = { boxD, D, b, m };
  }
  if (edge) console.log(` 边 boxD${edge.boxD} D${edge.D.toFixed(1)}: 挑出 ${edge.m.reach.toFixed(1)}（差 ${(edge.m.reach - tEdge).toFixed(1)}） 箱高 ${edge.m.boxH.toFixed(2)} 顶平 ${edge.m.topFlat.toFixed(2)} 自由段 ${edge.b.free} 锁 ${edge.m.locked}/${edge.m.tot} 结 ${edge.m.knot} 缝底x ${edge.m.seamMin.toFixed(1)}`);
  console.log('角档（实心箱，扫 k）：');
  let corner = null;
  for (let k = 44; k <= 60; k += 1) {
    const b = buildSolid(H, k);
    if (b.over || b.odd !== undefined || b.floats) continue;
    const m = run(b);
    if (!ok(m)) continue;
    if (!corner || Math.abs(m.reach - tCorner) < Math.abs(corner.m.reach - tCorner)) corner = { k, b, m };
  }
  if (corner) console.log(` 角 k${corner.k}: 挑出 ${corner.m.reach.toFixed(1)}（差 ${(corner.m.reach - tCorner).toFixed(1)}） 箱高 ${corner.m.boxH.toFixed(2)} 顶平 ${corner.m.topFlat.toFixed(2)} 自由段 ${corner.b.free} 锁 ${corner.m.locked}/${corner.m.tot} 结 ${corner.m.knot}`);
  if (face && edge && corner) {
    const hs = [face.m.boxH, edge.m.boxH, corner.m.boxH];
    console.log(`\n⇒ 定案 H${H} 缝${W}：面 boxD${face.boxD}/D${face.D} ${face.m.reach.toFixed(1)} · 边 boxD${edge.boxD}/D${edge.D.toFixed(1)} ${edge.m.reach.toFixed(1)} · 角 k${corner.k} ${corner.m.reach.toFixed(1)}`);
    console.log(`   边长 ${(2 * a).toFixed(0)}px · 外缘偏差 面 0.0 / 边 ${(edge.m.reach - tEdge).toFixed(1)} / 角 ${(corner.m.reach - tCorner).toFixed(1)}`);
    console.log(`   箱高 ${hs.map((x) => x.toFixed(2)).join(' / ')}（散布 ${(Math.max(...hs) - Math.min(...hs)).toFixed(2)}，守门 <0.5）· 顶平 ${[face, edge, corner].map((x) => x.m.topFlat.toFixed(2)).join(' / ')}（守门 <1.5）`);
  }
  process.exit(0);
}

if (process.env.CAL) {
  const H = Number(process.env.H ?? 68);
  console.log(`══ H=${H}：面档缝宽扫描（深度不动 D46.8/boxD40）══`);
  console.log(' 缝  台高×2  自由段 缓冲   挑出   箱高   顶平  锁定    结');
  for (let w = 18; w <= 30; w += 1) {
    const b = build(H, w, 46.8, 40, 1);
    if (b.over || b.odd !== undefined || b.floats) { console.log(` ${String(w).padStart(2)}  ${b.over ? '自由段 ' + b.over + ' ×' : '垫非偶'}`); continue; }
    const m = run(b);
    console.log(` ${String(w).padStart(2)}  ${((H - w) / 2).toFixed(1).padStart(5)}   ${String(b.free).padStart(5)}  ${String(b.buf).padStart(3)}  ${m.reach.toFixed(1).padStart(6)}  ${m.boxH.toFixed(2).padStart(6)}  ${m.topFlat.toFixed(2)}  ${(m.locked + '/' + m.tot).padStart(7)}  ${String(m.knot).padStart(2)}`);
  }
  const W = Number(process.env.W ?? 27);
  console.log(`\n══ H=${H} 缝=${W}：边档深度扫描（目标挑出 55.5）══`);
  for (let boxD = 46; boxD <= 62; boxD += 2) {
    const b = build(H, W, 55.5, boxD, 0.5);
    if (b.over || b.odd !== undefined || b.floats) { console.log(` boxD${boxD}: ${b.over ? '自由段 ' + b.over + ' ×' : '垫非偶'}`); continue; }
    const m = run(b);
    console.log(` boxD${String(boxD).padStart(2)}: 自由段 ${String(b.free).padStart(3)} 挑出 ${m.reach.toFixed(1).padStart(5)}（差 ${(m.reach - 55.5).toFixed(1).padStart(5)}） 箱高 ${m.boxH.toFixed(2)} 顶平 ${m.topFlat.toFixed(2)} 锁 ${m.locked}/${m.tot} 结 ${String(m.knot).padStart(2)} 缝底x ${m.seamMin.toFixed(1)}`);
  }
  console.log(`\n══ H=${H}：角档深度扫描（目标挑出 77.7）══`);
  for (let k = 48; k <= 62; k += 2) {
    const b = buildSolid(H, k);
    if (b.over || b.odd !== undefined || b.floats) { console.log(` k${k}: ${b.over ? '自由段 ' + b.over + ' ×' : '垫非偶'}`); continue; }
    const m = run(b);
    console.log(` k${String(k).padStart(2)}: 自由段 ${String(b.free).padStart(3)} 挑出 ${m.reach.toFixed(1).padStart(5)}（差 ${(m.reach - 77.7).toFixed(1).padStart(5)}） 箱高 ${m.boxH.toFixed(2)} 顶平 ${m.topFlat.toFixed(2)} 锁 ${m.locked}/${m.tot} 结 ${String(m.knot).padStart(2)}`);
  }
  process.exit(0);
}

if (process.env.TIERS) {
  console.log('══ 三档在候选箱高上的实测（深度不动：面 D46.8/boxD40 · 边 D55.5/boxD46 · 角 k46）══');
  console.log(' H   缝   档   自由段 缓冲   挑出   箱高   顶平  底平   锁定    结  缝底x');
  for (const [H, w] of [[36, 12], [60, 20], [64, 16], [68, 27]]) {
    const rows = [
      ['面', build(H, w, 46.8, 40, 1)],
      ['边', build(H, w, 55.5, 46, 0.5)],
      ['角', buildSolid(H, 46)],
    ];
    for (const [nm, b] of rows) {
      if (b.over) { console.log(`${String(H).padStart(3)}  ${String(w).padStart(3)}  ${nm}   自由段 ${b.over} > ${F_TOT} ×`); continue; }
      if (b.odd !== undefined) { console.log(`${String(H).padStart(3)}  ${String(w).padStart(3)}  ${nm}   垫 ${b.odd} 非偶 ×`); continue; }
      const m = run(b);
      console.log(`${String(H).padStart(3)}  ${String(w).padStart(3)}  ${nm}   ${String(b.free).padStart(5)}  ${String(b.buf).padStart(3)}  ${m.reach.toFixed(1).padStart(6)}  ${m.boxH.toFixed(2).padStart(6)}  ${m.topFlat.toFixed(2)}  ${m.botFlat.toFixed(2)}  ${(m.locked + '/' + m.tot).padStart(7)}  ${String(m.knot).padStart(2)}  ${m.seamMin.toFixed(2)}`);
    }
    console.log('');
  }
  process.exit(0);
}

if (process.env.FINE) {
  console.log('══ 细扫：H × 缝宽 × 缓冲下限（面档满裂，深度不动）══');
  console.log(' H   缝  自由段 缓冲   挑出   箱高   顶平  锁定    结');
  for (const H of [52, 56, 60, 64, 68]) {
    for (const div of [2.5, 3, 4]) {
      const w = Math.round(H / div);
      const b = build(H, w, 46.8, 40, 1);
      if (b.over) { console.log(`${String(H).padStart(3)}  ${String(w).padStart(3)}  自由段 ${b.over} ×`); continue; }
      if (b.odd !== undefined) continue;
      const m = run(b);
      console.log(`${String(H).padStart(3)}  ${String(w).padStart(3)}  ${String(b.free).padStart(5)}  ${String(b.buf).padStart(3)}  ${m.reach.toFixed(1).padStart(6)}  ${m.boxH.toFixed(2).padStart(6)}  ${m.topFlat.toFixed(2)}  ${(m.locked + '/' + m.tot).padStart(7)}  ${String(m.knot).padStart(2)}`);
    }
  }
  process.exit(0);
}

export { build, buildSolid, run, F_TOT };

if (process.env.ALLOC) {
  // 「缝再加高」那轮：把带子重新分配（FTOT/LEAD）能把缝做到多深。
  // 两片台高度钉死 22 ⇒ 缝 w = H − 44。面档（满裂 t=1）是最吃材料的一档，天花板由它定。
  const tail = A_BAND - 2 * SQUARE.ISO - A_F - A_LEAD;
  const mouthY = 2 * (tail + SQUARE.ISO) + SKIN.R1 * 2 * (A_F - 1) / 2;
  console.log(`分配 F_TOT=${A_F} lead=${A_LEAD} tail=${tail} · 平台高度基准 ${mouthY.toFixed(1)}px（平档 101.6）`);
  console.log(`箱高上限（自由段跨度 − G_MIN）= ${(0.6 * (A_F - 1) - SQUARE.G_MIN).toFixed(1)}`);
  console.log('  H   缝   boxD    挑出   箱高   顶平  底平   锁    结   缝底x');
  for (const H of (process.env.HS ?? '68,72,74,76,78,80,82').split(',').map(Number)) {
    const W = H - 44;
    let best = null;
    for (let boxD = 60; boxD >= 20; boxD -= 2) {
      let D = boxD + 6;
      for (let pass = 0; pass < 3; pass++) {
        const b = build(H, W, D, boxD, 1);
        if (b.over || b.odd || b.floats) { D = -1; break; }
        const r = run(b);
        D = r.reach;
        if (pass === 2) best = { boxD, D, r };
      }
      if (best) break;
    }
    if (!best) { console.log(`${String(H).padStart(3)}  ${String(W).padStart(3)}   —— 装不下`); continue; }
    const { boxD, D, r } = best;
    console.log(`${String(H).padStart(3)}  ${String(W).padStart(3)}  ${String(boxD).padStart(4)}  ${r.reach.toFixed(1).padStart(6)}  ${r.boxH.toFixed(2).padStart(6)}  ${r.topFlat.toFixed(2).padStart(5)} ${r.botFlat.toFixed(2).padStart(5)}  ${String(r.locked).padStart(2)}/${r.tot}  ${String(r.knot).padStart(3)}  ${r.seamMin.toFixed(2).padStart(5)}   D=${D.toFixed(1)}`);
  }
}

if (process.env.JOINT) {
  // 联合标定：先枚举三档各自的**干净候选集**（连同实测挑出），再把半边长 a 也放进优化
  // ——在可达集合上扫 a，取三档最大外缘偏差最小的那个（§17.9 变厚那轮定的做法）。
  const H = Number(process.env.H ?? 82), W = Number(process.env.W ?? (H - 44));
  const R = SQUARE.RADIUS, TH = (n) => (Math.PI / SQUARE.COUNT) * n;
  // 判据含**剪影Δ**（§16.3：只认剪影Δ）——锁定/打结/水平度全绿而形是楔形的情况真出现过
  const ok = (m) => m.locked === m.tot && m.knot <= 6 && m.topFlat < 1.5 && m.botFlat < 1.5 && Math.abs(m.boxH - H) < 0.5 && m.silD < 6 && m.vert <= VERT_MAX;
  console.log(`══ 联合标定 H=${H} 缝=${W}（两片台各 ${((H - W) / 2).toFixed(1)}）· 分配 F_TOT=${A_F} lead=${A_LEAD} ══`);
  const cand = [[], [], []];
  const BD0 = Number(process.env.BD0 ?? 28), BD1 = Number(process.env.BD1 ?? 70);
  for (let boxD = BD0; boxD <= BD1; boxD += 2) {
    for (const dOff of [0, 2, 4, 6, 8]) {
      for (const [ti, t] of [[0, 1], [1, SQUARE_EDGE_T]]) {
        let D = boxD + 6 + dOff, b = build(H, W, D, boxD, t);
        if (b.over || b.odd !== undefined || b.floats) continue;
        let m = run(b, { t, D, wEnd: W, H });
        // 自洽目标取**面角 x**（台面外缘）而不是 max 挑出：后者在缝角鼓出时会被污染，
        // D 越设越大、缝角越鼓 —— 正反馈（2026-09-01 端面竖直度掉到 4.08 的根因）
        const D2 = Math.round((m.faceX + dOff) * 10) / 10, b2 = build(H, W, D2, boxD, t);
        if (!b2.over && b2.odd === undefined && !b2.floats) { const m2 = run(b2, { t, D: D2, wEnd: W, H }); if (ok(m2)) { m = m2; D = D2; } }
        if (!ok(m)) continue;
        if (ti === 0 && m.seamMin > 0.5) continue; // 面档必须真裂到轴
        cand[ti].push({ boxD, D, reach: m.reach, m });
      }
    }
  }
  for (let k = Number(process.env.K0 ?? 40); k <= Number(process.env.K1 ?? 72); k++) {
    const b = buildSolid(H, k);
    if (b.over || b.odd !== undefined || b.floats) continue;
    const m = run(b, { t: 0, D: k * 2 * SKIN.R1 * 1.0, wEnd: W, H });
    // 单箱的目标线取「实测挑出的矩形」——这一档没有缝，Δ 只用来挡跑型
    const m2 = run(b, { t: 0, D: m.reach, wEnd: W, H });
    if (ok(m2)) cand[2].push({ k, reach: m2.reach, m: m2 });
  }
  const names = ['面', '边', '角'], cosT = [Math.cos(TH(1)), Math.cos(TH(3)), Math.cos(TH(5))];
  // 候选集要跑十分钟，落盘给 `pick.mjs` 反复换目标函数用（不再重跑引擎）
  if (process.env.DUMP)
    (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(cand.map((cs) => cs.map(({ boxD, D, k, reach, m }) =>
      ({ boxD, D, k, reach, boxH: m.boxH, topFlat: m.topFlat, botFlat: m.botFlat, knot: m.knot, seamMin: m.seamMin, silD: m.silD, align: m.align, vert: m.vert })))));
  for (let i = 0; i < 3; i++)
    console.log(`${names[i]}档干净候选 ${cand[i].length} 个 · 挑出 ${cand[i].length ? Math.min(...cand[i].map((c) => c.reach)).toFixed(1) + '–' + Math.max(...cand[i].map((c) => c.reach)).toFixed(1) : '——'}`);
  if (cand.some((c) => !c.length)) process.exit(1);
  // 第一段：在可达集合上扫 a，外缘偏差 · 剪影Δ · 全程对位一起进目标函数
  const spAll = (rows) => Math.max(...rows[0].align.map((_, i) => { const v = rows.map((x) => x.align[i]); return Math.max(...v) - Math.min(...v); }));
  const spEnd = (rows) => { const v = rows.map((x) => x.align[x.align.length - 1]); return Math.max(...v) - Math.min(...v); };
  const ranked = [];
  for (let a = 60; a <= 110; a += 0.1) {
    const near = cosT.map((cs, i) => { const want = a / cs - R; return cand[i].filter((c) => Math.abs(c.reach - want) <= 1.5); });
    if (near.some((n) => !n.length)) continue;
    for (const x of near[0]) for (const y of near[1]) for (const z of near[2]) {
      const pick = [x, y, z];
      const dev = pick.map((p, i) => p.reach - (a / cosT[i] - R));
      const mx = Math.max(...dev.map(Math.abs));
      const sil = Math.max(...pick.map((p) => p.silD));
      ranked.push({ a, pick, dev, mx, score: 2 * mx + spEnd(pick) + 0.3 * spAll(pick) + sil });
    }
  }
  if (!ranked.length) { console.log('三档的可达区间没有交集'); process.exit(1); }
  // **第二段：按分数排队，逐组用守门那个采样密度复核打结**（见文件头「两段式标定」）
  const dense = new Map();
  const knotDense = (ti, cd) => {
    const key = `${ti}:${cd.k ?? cd.boxD + '/' + cd.D}`;
    if (dense.has(key)) return dense.get(key);
    const b = ti === 2 ? buildSolid(H, cd.k) : build(H, W, cd.D, cd.boxD, ti === 0 ? 1 : SQUARE_EDGE_T);
    const sim = createSkinUnit(b.spec, b.opts);
    let kn = 0;
    for (let q = 0; q < SKIN.STEPS; q++) {
      sim.advance();
      if (q % 10) continue;
      const p2 = []; for (let i = b.lead; i < b.lead + b.free; i++) p2.push([sim.px[i], sim.py[i]]);
      for (let i = 0; i + 1 < p2.length; i++) for (let j = i + 2; j + 1 < p2.length; j++)
        if (j - i > kn && seg2Hit(p2[i], p2[i + 1], p2[j], p2[j + 1])) kn = j - i;
    }
    dense.set(key, kn);
    return kn;
  };
  ranked.sort((p, q) => p.score - q.score);
  let best = null, tried = 0;
  for (const r of ranked) {
    const ks = r.pick.map((c, i) => knotDense(i, c));
    tried++;
    if (Math.max(...ks) <= 6) { best = { ...r, ks, tried }; break; }
    if (tried <= 6) console.log(`  跳过 a=${r.a.toFixed(1)} 密采样打结 ${ks.join('/')}`);
  }
  if (!best) { console.log('候选集里没有密采样也干净的组合'); process.exit(1); }
  const { a, pick, dev, mx } = best;
  console.log(`\n⇒ 半边长 ${a.toFixed(1)} · **边长 ${(2 * a).toFixed(0)}px** · 最大外缘偏差 ${mx.toFixed(2)}px · 密采样打结 ${best.ks.join('/')}（试了 ${best.tried} 组）`);
  for (let i = 0; i < 3; i++) {
    const p = pick[i], m = p.m;
    console.log(` ${names[i]} ${p.k !== undefined ? 'k' + p.k : 'boxD' + p.boxD + '/D' + p.D.toFixed(1)}: 挑出 ${m.reach.toFixed(1)}（偏 ${dev[i].toFixed(2)}） 箱高 ${m.boxH.toFixed(2)} 顶平 ${m.topFlat.toFixed(2)} 底平 ${m.botFlat.toFixed(2)} 锁 ${m.locked}/${m.tot} 结 ${m.knot} Δ ${m.silD.toFixed(2)} 端面 ${m.vert.toFixed(2)} 缝底x ${m.seamMin.toFixed(2)}`);
  }
}
