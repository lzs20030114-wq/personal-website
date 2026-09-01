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

import { createSkinUnit, SKIN, SKIN_ROOT_FIX } from '../../src/lib/space/skin-unit.ts';
import { SQUARE, SQUARE_RUNGS, squareFreeTotal, squareLead } from '../../src/lib/space/skin-square.ts';
import { RING_BAND_NODES } from '../../src/lib/space/skin-ring.ts';

const F_TOT = squareFreeTotal(), LEAD = squareLead(F_TOT);
const seamW = (t, w) => w * Math.pow(t, 0.7);
const sink = (t, D) => D * Math.pow(t, 1.2);
const tip = (t) => 0.4 + 0.6 * t;

/** 参数化：箱高 H、缝宽 wEnd、目标深度 D、箱设计深度 boxD、形态 t */
function build(H, wEnd, D, boxD, t) {
  const w = seamW(t, wEnd), dv = sink(t, D), wt = w * tip(t);
  const lobe = (H - w) / 2, faceN = Math.round(lobe / 2);
  const a = Math.max(1, Math.round(wt / 4)), wallN = Math.max(1, Math.round(dv / 2));
  const m = a + wallN, f = m + faceN, M = f + boxD / 2;
  let buf = SQUARE.BUF_MIN;
  for (; buf < 60; buf++) { const sp = 1.2 * (M + buf); if (sp - H >= SQUARE.G_MIN && 4 * buf - (sp - H) >= SQUARE.E_MIN) break; }
  const free = 2 * (M + buf) + 1;
  if (free > F_TOT) return { over: free };
  const c = buf + M, wv = (w + wt) / 2;
  const crack = [[c - m, c + m, w / 100]];
  for (let k = m - 2; k > a + 1; k -= 2) crack.push([c - k, c + k, wv / 100]);
  crack.push([c - a, c + a, wt / 100]);
  const bonds = [...new Set(Array.from({ length: SQUARE_RUNGS }, (_, i) => Math.round(f + ((M - f) * i) / (SQUARE_RUNGS - 1))))].map((k) => [c - k, c + k, H / 100]);
  const seg = ['f', free, bonds, [[c - f, c - m], [c + m, c + f], [c - a, c + a]], [crack, [[c - f, c - m, lobe / 100]], [[c + m, c + f, lobe / 100]]]];
  const pad = F_TOT - free, half = pad / 2, tail = RING_BAND_NODES - 2 * SQUARE.ISO - F_TOT - LEAD;
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
function run(b) {
  const s = createSkinUnit(b.spec, b.opts);
  let knot = 0;
  for (let k = 0; k < SKIN.STEPS; k++) {
    s.advance();
    if (k % 25 === 0) {
      const p = []; for (let i = b.lead; i < b.lead + b.free; i++) p.push([s.px[i], s.py[i]]);
      let sp = 0;
      for (let i = 0; i + 1 < p.length; i++) for (let j = i + 2; j + 1 < p.length; j++) {
        const A = p[i], B = p[i + 1], C = p[j], D2 = p[j + 1];
        const s1x = B[0] - A[0], s1y = B[1] - A[1], s2x = D2[0] - C[0], s2y = D2[1] - C[1];
        const den = -s2x * s1y + s1x * s2y; if (Math.abs(den) < 1e-12) continue;
        const q = (-s1y * (A[0] - C[0]) + s1x * (A[1] - C[1])) / den, r = (s2x * (A[1] - C[1]) - s2y * (A[0] - C[0])) / den;
        if (q > 0 && q < 1 && r > 0 && r < 1) sp = Math.max(sp, j - i);
      }
      knot = Math.max(knot, sp);
    }
  }
  const px = (i) => s.px[i] * 100, py = (i) => -s.py[i] * 100;
  let reach = 0; for (let i = b.lead; i < b.lead + b.free; i++) reach = Math.max(reach, px(i));
  const win = (lo, hi) => { const v = []; for (let i = lo; i <= hi; i++) if (px(i) >= 0.35 * reach && px(i) <= 0.85 * reach) v.push(py(i)); return v; };
  const mean = (v) => v.reduce((a, c) => a + c, 0) / v.length, rng = (v) => Math.max(...v) - Math.min(...v);
  const top = win(b.marks.outA, b.marks.faceA), bot = win(b.marks.faceB, b.marks.outB);
  let seamMin = Infinity; for (let i = b.marks.mouthA; i <= b.marks.mouthB; i++) seamMin = Math.min(seamMin, px(i));
  let tot = 0; for (const ch of s.chains) tot += ch.length;
  const cy = (mean(top) + mean(bot)) / 2;
  const profile = [];
  for (let i = b.lead; i < b.lead + b.free; i++) profile.push([px(i), py(i) - cy]);
  return { reach, boxH: mean(bot) - mean(top), topFlat: rng(top), botFlat: rng(bot), locked: s.locked.length, tot, knot, seamMin, profile };
}

/** 角档（实心箱）在任意箱高下的谱——平档 squareSpec 把 SQUARE.H 写死了，这里参数化 */
function buildSolid(H, k) {
  const PW = Math.round(H / 4);
  let buf = SQUARE.BUF_MIN;
  for (; buf < 60; buf++) { const sp = 1.2 * (k + buf); if (sp - H >= SQUARE.G_MIN && 4 * buf - (sp - H) >= SQUARE.E_MIN) break; }
  const free = 2 * (k + buf) + 1;
  if (free > F_TOT) return { over: free };
  const c = (free - 1) / 2;
  const ks = [...new Set(Array.from({ length: SQUARE_RUNGS }, (_, i) => Math.round(PW + ((k - PW) * i) / (SQUARE_RUNGS - 1))))];
  const seg = ['f', free, ks.map((q) => [c - q, c + q, H / 100]), [[c - PW, c + PW]]];
  const pad = F_TOT - free, half = pad / 2, tail = RING_BAND_NODES - 2 * SQUARE.ISO - F_TOT - LEAD;
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
  const okm = (m) => m.locked === m.tot && m.knot <= 6 && m.topFlat < 1.5 && m.botFlat < 1.5;
  const feasible = (a, verbose) => {
    const rs = [a / Math.cos(TH(1)) - R, a / Math.cos(TH(3)) - R, a / Math.cos(TH(5)) - R];
    const rows = [];
    for (const [c, l] of combos) {
      const want = rs[c];
      if (want <= 8) return null;
      if (l === 0) { // 单箱：扫 k
        let best = null;
        for (let k = Math.round(H / 4) + 9; k <= 62; k++) { const b = buildSolid(H, k); if (b.over || b.odd !== undefined) continue; const m = run(b); if (!okm(m)) continue; if (!best || Math.abs(m.reach - want) < Math.abs(best.m.reach - want)) best = { m }; }
        if (!best || Math.abs(best.m.reach - want) > 2.5) { if (verbose) console.log(`   ${['面','边','角'][c]}L${l} 目标 ${want.toFixed(1)}: ${best ? '差 ' + (best.m.reach - want).toFixed(1) : '无干净候选'} ×`); return null; }
        rows.push([c, l, want, best.m]); continue;
      }
      let best = null;
      for (const dOff of [0, 3, 6]) for (let boxD = Math.max(6, Math.round((want - 20) / 2) * 2); boxD <= want + 12; boxD += 2) {
        const b = build(H, W, want + dOff, boxD, T10[l]); if (b.over || b.odd !== undefined) continue;
        const m = run(b); if (!okm(m)) continue;
        if (!best || Math.abs(m.reach - want) < Math.abs(best.m.reach - want)) best = { boxD, m };
      }
      if (!best || Math.abs(best.m.reach - want) > 2.5) { if (verbose) console.log(`   ${['面','边','角'][c]}L${l} 目标 ${want.toFixed(1)}: ${best ? '差 ' + (best.m.reach - want).toFixed(1) : '无干净候选'} ×`); return null; }
      rows.push([c, l, want, best.m]);
    }
    if (verbose) for (const [c, l, want, m] of rows) console.log(`   ${['面','边','角'][c]}L${l}: 目标 ${want.toFixed(1)} 挑出 ${m.reach.toFixed(1)}（差 ${(m.reach - want).toFixed(1)}） 箱高 ${m.boxH.toFixed(2)} 顶平 ${m.topFlat.toFixed(2)} 结 ${m.knot} 缝底x ${m.seamMin.toFixed(1)}`);
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
    if (b.over || b.odd !== undefined) { console.log(` 面 boxD${boxD}: ${b.over ? '自由段 ' + b.over + ' ×' : '垫非偶'}`); continue; }
    let m = run(b);
    const D2 = Math.round(m.reach * 10) / 10, b2 = build(H, W, D2, boxD, 1); // 第二遍自洽
    if (!b2.over && b2.odd === undefined) { const m2 = run(b2); if (ok(m2)) { b = b2; m = m2; D = D2; } }
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
    if (b.over || b.odd !== undefined) continue;
    const m = run(b);
    if (!ok(m)) continue;
    if (!edge || Math.abs(m.reach - tEdge) < Math.abs(edge.m.reach - tEdge)) edge = { boxD, D, b, m };
  }
  if (edge) console.log(` 边 boxD${edge.boxD} D${edge.D.toFixed(1)}: 挑出 ${edge.m.reach.toFixed(1)}（差 ${(edge.m.reach - tEdge).toFixed(1)}） 箱高 ${edge.m.boxH.toFixed(2)} 顶平 ${edge.m.topFlat.toFixed(2)} 自由段 ${edge.b.free} 锁 ${edge.m.locked}/${edge.m.tot} 结 ${edge.m.knot} 缝底x ${edge.m.seamMin.toFixed(1)}`);
  console.log('角档（实心箱，扫 k）：');
  let corner = null;
  for (let k = 44; k <= 60; k += 1) {
    const b = buildSolid(H, k);
    if (b.over || b.odd !== undefined) continue;
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
    if (b.over || b.odd !== undefined) { console.log(` ${String(w).padStart(2)}  ${b.over ? '自由段 ' + b.over + ' ×' : '垫非偶'}`); continue; }
    const m = run(b);
    console.log(` ${String(w).padStart(2)}  ${((H - w) / 2).toFixed(1).padStart(5)}   ${String(b.free).padStart(5)}  ${String(b.buf).padStart(3)}  ${m.reach.toFixed(1).padStart(6)}  ${m.boxH.toFixed(2).padStart(6)}  ${m.topFlat.toFixed(2)}  ${(m.locked + '/' + m.tot).padStart(7)}  ${String(m.knot).padStart(2)}`);
  }
  const W = Number(process.env.W ?? 27);
  console.log(`\n══ H=${H} 缝=${W}：边档深度扫描（目标挑出 55.5）══`);
  for (let boxD = 46; boxD <= 62; boxD += 2) {
    const b = build(H, W, 55.5, boxD, 0.5);
    if (b.over || b.odd !== undefined) { console.log(` boxD${boxD}: ${b.over ? '自由段 ' + b.over + ' ×' : '垫非偶'}`); continue; }
    const m = run(b);
    console.log(` boxD${String(boxD).padStart(2)}: 自由段 ${String(b.free).padStart(3)} 挑出 ${m.reach.toFixed(1).padStart(5)}（差 ${(m.reach - 55.5).toFixed(1).padStart(5)}） 箱高 ${m.boxH.toFixed(2)} 顶平 ${m.topFlat.toFixed(2)} 锁 ${m.locked}/${m.tot} 结 ${String(m.knot).padStart(2)} 缝底x ${m.seamMin.toFixed(1)}`);
  }
  console.log(`\n══ H=${H}：角档深度扫描（目标挑出 77.7）══`);
  for (let k = 48; k <= 62; k += 2) {
    const b = buildSolid(H, k);
    if (b.over || b.odd !== undefined) { console.log(` k${k}: ${b.over ? '自由段 ' + b.over + ' ×' : '垫非偶'}`); continue; }
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
