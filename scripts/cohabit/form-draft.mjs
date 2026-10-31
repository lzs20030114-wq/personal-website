/**
 * Lab 2-15 形态方案（第二轮）的线稿与量数：项目二_2-15单元形态方案.md 的图与数从这里出。
 *
 * 量的是：同一条 338 节的布（捏分那副七段谱，F_TOT 293，收缩到 r1 = 0.30）上，按 2-15 方台的大小
 * （面 / 边 / 角三档挑出 = Lab 2-7 平档那只方台）能成哪些截面，每种截面在带上能挪多远（配平偏移 ⇒ 台面高度），
 * 挪的时候形状变不变。截面全是真引擎终态，按 2-15 的缩放（与 cohabit-solid 的 rigFor 同式）换成米。
 *   node scripts/cohabit/form-draft.mjs <outDir>
 * 输出：outDir/form-sections.svg、outDir/form-room.svg、outDir/form-uses.svg（第三轮：一条带两个结构 + 按用途定形；有 playwright 时另出同名 PNG）+ 控制台量数表。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

const OUT = process.argv[2] ?? 'form-draft-out';
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });

/** 线段相交（自交检查用） */
function segHit(a, b, c, d) {
  const s1x = b[0] - a[0], s1y = b[1] - a[1], s2x = d[0] - c[0], s2y = d[1] - c[1];
  const den = -s2x * s1y + s1x * s2y;
  if (Math.abs(den) < 1e-12) return false;
  const q = (-s1y * (a[0] - c[0]) + s1x * (a[1] - c[1])) / den;
  const r = (s2x * (a[1] - c[1]) - s2y * (a[0] - c[0])) / den;
  return q > 0 && q < 1 && r > 0 && r < 1;
}
/** 结构段里最大的自交环（节点数）；与皮肤单元lab §16 的打结判据同口径 */
function maxLoop(px, py, i0, i1) {
  let m = 0;
  for (let i = i0; i < i1 - 1; i++) for (let j = i + 2; j < i1 - 1; j++)
    if (j - i > m && segHit([px[i], py[i]], [px[i + 1], py[i + 1]], [px[j], py[j]], [px[j + 1], py[j + 1]])) m = j - i;
  return m;
}

let M; // 量数，交给绘图
try {
  const U = await server.ssrLoadModule('/src/lib/space/skin-unit.ts');
  const sq = await server.ssrLoadModule('/src/lib/space/skin-square.ts');
  const sqs = await server.ssrLoadModule('/src/lib/space/skin-square-split.ts');
  const ring = await server.ssrLoadModule('/src/lib/space/skin-ring.ts');
  const ua = await server.ssrLoadModule('/src/lib/space/unit-activation.ts');
  const co = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const cs = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
  const grid = await server.ssrLoadModule('/src/lib/space/skin-grid.ts');
  const sdata = await server.ssrLoadModule('/src/lib/space/skin-data.ts');
  const sarr = await server.ssrLoadModule('/src/lib/space/skin-array.ts');

  const layout = co.squarePlanLayout(ua.planLayout(co.COHABIT.SEATS.GRID, ring.RING.RADIUS_DEF, 'room'));
  const s = ((grid.RIG_SCALE * layout.pitchM) / layout.pitch4) * co.SQUARE_SCALE; // 与 rigFor 同式
  const mpp = s / cs.UNITS_PER_M; // 米 / 引擎 px（px = 引擎坐标 × 100）
  const coreR = sq.SQUARE.RADIUS * mpp; // 挂带线离立杆中心
  const F = sqs.SQSPLIT.F_TOT;
  const flatOpts = sq.buildSquareUnits(undefined, 202)[0].opts;
  const target = sq.SQUARE_REACH; // 方台三档挑出（Lab 2-7 平档，px）
  const mm = (px) => px * mpp;
  const f3 = (v) => v.toFixed(3);

  /** 跑完正向协议。h(i) = 节点离钉住端（m，向上为正）；pts = 结构段 [离挂带线 m, 离钉住端 m] */
  function run(spec, opts, s0, s1, seam = null) {
    const u = U.createSkinUnit(spec, opts);
    let knot = 0;
    for (let k = 0; k < U.SKIN.STEPS; k++) {
      u.advance();
      if (k % 10 === 0) knot = Math.max(knot, maxLoop(u.px, u.py, s0, s1));
    }
    const foot = u.py[u.n - 1];
    const h = (i) => mm(Math.abs(u.py[i] - foot) * 100);
    const pts = [];
    for (let i = s0; i < s1; i++) pts.push([mm(u.px[i] * 100), h(i)]);
    let reach = 0, pad = 0;
    for (let i = 0; i < u.n; i++) {
      const x = u.px[i] * 100;
      if (i >= s0 && i < s1) reach = Math.max(reach, x); else pad = Math.max(pad, x);
    }
    const keys = u.locked.filter(([i, j]) => i >= s0 && j < s1 && (seam === null || (i - seam) * (j - seam) >= 0)).map(([i, j]) => [i - s0, j - s0]);
    return { u, h, pts, keys, knot, reachPx: reach, reach: mm(reach), pad: mm(pad), locked: u.locked.length, s0 };
  }
  /** 方箱（平台 / 厚台）一档的结构段 */
  function boxSeg(k, h) {
    const b = sq.squareBuffer(k, h), n = sq.squareFree(k, b), c = (n - 1) / 2, pw = sq.squarePw(h);
    const lad = sq.squareLadder(k, pw);
    return { seg: ['f', n, lad.map((q) => [c - q, c + q, h / 100]), [[c - pw, c + pw]]], n, nKeys: lad.length };
  }
  /** 方箱放进 338 节七段谱：外侧 35–90% 的点量台面顶 / 底 */
  function box338(k, h, shift = 0) {
    const { seg, n, nKeys } = boxSeg(k, h);
    const { spec, base } = sqs.sqSplitWrap(seg, F, `k${k}h${h}`, shift);
    const r = run(spec, flatOpts, base, base + n);
    let top = 0, bot = 1e9;
    for (const [x, y] of r.pts) if (x > r.reach * 0.35 && x < r.reach * 0.9) { top = Math.max(top, y); bot = Math.min(bot, y); }
    return { ...r, top, bot, ok: r.locked === nKeys, nKeys, pmax: (F - n) / 2 };
  }
  /** 双层（捏分 t = 1，缝开到底）放进 338 节七段谱：上下两片板各自的底 / 顶 */
  function dbl338(cls, D, boxD, w, shift = 0) {
    const st = sqs.sqSplitStructure({ name: '', en: '', pair: 0, cls, t: 1, D, boxD }, w);
    const { spec, base } = sqs.sqSplitWrap(st.seg, F, `dbl${cls}w${w}`, shift);
    const seam = base + st.rel.center;
    const r = run(spec, st.optsAt(base), base, base + st.seg[1], seam);
    const plate = (a, b) => { let lo = 1e9, hi = 0; for (let i = base + a; i <= base + b; i++) if (r.u.px[i] * 100 > 6) { lo = Math.min(lo, r.h(i)); hi = Math.max(hi, r.h(i)); } return [lo, hi]; };
    const nKeys = st.seg[2].length + st.seg[4].reduce((a, c) => a + c.length, 0);
    return { ...r, upper: plate(st.rel.outA, st.rel.mouthA), lower: plate(st.rel.mouthB, st.rel.outB), slit: mm(r.u.px[seam] * 100), ok: r.locked === nKeys, nKeys, pmax: (F - st.seg[1]) / 2, seam: st.rel.center };
  }

  console.log(`2-15 缩放 s = ${s.toFixed(4)} · 1 引擎 px = ${(mpp * 1000).toFixed(2)} mm · 格距 ${f3(layout.pitchM)} m · 挂带线离立杆中心 ${f3(coreR)} m`);
  console.log(`方台目标挑出（Lab 2-7 平档三档）面 / 边 / 角 = ${target.map((t) => f3(mm(t))).join(' / ')} m，外缘半边 ${f3(coreR + mm(target[0]))} m，台缝 ${f3(layout.pitchM - 2 * (coreR + mm(target[0])))} m`);

  // ── 原来的平台（202 节，台厚 0.15；2-15 在 2026-10-29 换成 6.5 cm 以前用的）
  const cur = sq.buildSquareUnits(undefined, 202).map((d) => {
    const fseg = d.spec.findIndex((g) => g[0] === 'f' && g[2] && g[2].length);
    const base = d.spec.slice(0, fseg).reduce((a, g) => a + g[1], 0);
    const r = run(d.spec, d.opts, base, base + d.spec[fseg][1]);
    let top = 0, bot = 1e9; for (const [x, y] of r.pts) if (x > r.reach * 0.35 && x < r.reach * 0.9) { top = Math.max(top, y); bot = Math.min(bot, y); }
    return { ...r, top, bot };
  });
  console.log(`\n① 原来的平台（202 节，箱高 36）：台厚 ${f3(cur[0].top - cur[0].bot)} · 台面离钉住端 ${f3(cur[0].top)} · 挑出 ${cur.map((r) => f3(r.reach)).join(' / ')}`);

  // ── 同一条 338 节布上的平台：台厚 0.15（H36）与 6.5 cm（H16）
  const THIN = { h: 16, k: cs.UNIT_SHAPE.k }; // 与 2-15 现行平台同一组键（按方形标定，cohabit-solid UNIT_SHAPE）
  const thin = THIN.k.map((k) => box338(k, THIN.h, 0));
  const tp = Math.min(...thin.map((r) => r.pmax));
  const thinLo = box338(THIN.k[0], THIN.h, tp), thinHi = box338(THIN.k[0], THIN.h, -tp);
  const h36 = box338(35, 36, 0), h36p = h36.pmax, h36Lo = box338(35, 36, h36p), h36Hi = box338(35, 36, -h36p);
  console.log(`\n② 338 节布上的平台（三档 k、挑出、键 / 结）· 台面离钉住端（偏移 0）· 配平偏移范围 → 台面高度范围`);
  console.log(`  台厚 ${f3(thin[0].top - thin[0].bot)}（H${THIN.h}）：k ${THIN.k.join('/')} · 挑出 ${thin.map((r) => f3(r.reach)).join(' / ')}（目标 ${target.map((t) => f3(mm(t))).join(' / ')}）· 键 ${thin.map((r) => `${r.locked}/${r.nKeys}`).join(' ')} · 结 ≤${Math.max(...thin.map((r) => r.knot))} · ${f3(thin[0].top)} · ±${tp} 节 → ${f3(thinLo.top)}–${f3(thinHi.top)} · 垫离芯 ≤${f3(Math.max(thin[0].pad, thinLo.pad, thinHi.pad))}`);
  console.log(`  台厚 ${f3(h36.top - h36.bot)}（H36）：k 35 · 面档 ${f3(h36.top)} · ±${h36p} 节 → ${f3(h36Lo.top)}–${f3(h36Hi.top)}`);

  // ── 挪动是不是纯平移：成形途中几个时刻比形状
  {
    const steps = [300, 700, 1100, 1499];
    const snap = (shift) => {
      const { seg, n } = boxSeg(THIN.k[0], THIN.h);
      const { spec, base } = sqs.sqSplitWrap(seg, F, 't', shift);
      const u = U.createSkinUnit(spec, flatOpts); const out = {};
      for (let k = 0; k < U.SKIN.STEPS; k++) { u.advance(); if (steps.includes(k)) out[k] = { px: Float64Array.from(u.px), py: Float64Array.from(u.py), foot: u.py[u.n - 1] }; }
      return { out, base, n };
    };
    const A = snap(0), B = snap(-60);
    const row = steps.map((k) => {
      const a = A.out[k], b = B.out[k], dy = b.py[B.base] - a.py[A.base];
      let d = 0; for (let i = 0; i < A.n; i++) d = Math.max(d, Math.hypot(a.px[A.base + i] - b.px[B.base + i], a.py[A.base + i] - (b.py[B.base + i] - dy)) * 100);
      return `第 ${k} 步 形状差 ${d.toFixed(3)} px、高差 ${f3(mm(Math.abs((b.foot - b.py[B.base]) - (a.foot - a.py[A.base])) * 100))} m`;
    });
    console.log(`  偏移 −60 对 0（面档 6.5 cm 平台）：${row.join(' · ')}`);
  }

  // ── 双层：缝 0.12 / 0.18 / 0.24，三档按方台大小（D / boxD 是 dbl 探针扫出来的）
  const DBL_T = [[0, 56, 50], [1, 64, 58], [2, 89, 82]];
  const GAPS = [30, 45, 60];
  const dbl = {};
  console.log(`\n③ 338 节布上的双层（缝开到底）：三档挑出 · 键 · 结 · 缝底离挂带线 · 下板 / 上板（离钉住端）· 配平偏移范围`);
  for (const w of GAPS) {
    const row = DBL_T.map(([cls, D, boxD]) => dbl338(cls, D, boxD, w));
    const p = Math.min(...row.map((r) => r.pmax));
    dbl[w] = { row, p };
    const f = row[0];
    console.log(`  缝 ${f3(mm(w))}（${w} px）：挑出 ${row.map((r) => f3(r.reach)).join(' / ')} · 键 ${row.map((r) => `${r.locked}/${r.nKeys}`).join(' ')} · 结 ≤${Math.max(...row.map((r) => r.knot))} · 缝底 ${f3(Math.max(...row.map((r) => r.slit)))} · 下板 ${f3(f.lower[0])}–${f3(f.lower[1])} · 上板 ${f3(f.upper[0])}–${f3(f.upper[1])} · ±${p} 节 = ±${f3(mm(2 * 0.3 * p))} m`);
  }

  // ── 厚台（上下连通）：箱高到多少还能小到方台大小
  const SOLID = [[56, 43, 0], [56, 44, 1], [76, 60, 2]];
  const solid = SOLID.map(([h, k]) => box338(k, h, 0));
  console.log(`\n④ 338 节布上的厚台：`);
  SOLID.forEach(([h, k, cls], i) => console.log(`  箱高 ${f3(mm(h))}（${h}）${['面', '边', '角'][cls]}档 k${k}：挑出 ${f3(solid[i].reach)}（目标 ${f3(mm(target[cls]))}）· 键 ${solid[i].locked}/${solid[i].nKeys} · 结 ${solid[i].knot} · 台 ${f3(solid[i].bot)}–${f3(solid[i].top)} · 可挪 ±${solid[i].pmax} 节`));
  console.log('  （箱高 60 起面档最小挑出 0.245 m、比方台大 1.6 cm；76 起只有角档放得下；92 连角档也放不下。E_MAX：箱越高，最浅的键越深）');

  // ── 一条带两个结构（2-3 的做法）：338 节布全部铺出去，上下各一块 6.5 cm 方台（键与 2-15 现行平台同一组）
  //   2026-10-31 起结构贴底：[贴合 lead | 垫 | ISO | 上台 | ISO | 垫 | 贴合 mid−ISO | 下台 | 尾]（角档没有垫），下台与平台一样贴底，
  //   多出的自由段一半在上台上方、一半在两块之间，三档上下台各自同高；中间贴合 ≥ 29 时上下逐位解耦（皮肤单元lab §15.5）。
  //   （10-30 那版是每块台在自己的 131 节里居中，下台底下挂着一截布筒；三张线稿 png 是那一版出的，没重出）
  // 谱与 2-15 台架同一份（cohabit-solid 的 dualUnitSpec），这里只量
  const DUAL_MID = cs.DUAL.mid;
  function dual338(k, a, b, mid = DUAL_MID) {
    const { spec, a0, b0, fs } = cs.dualUnitSpec(k, a, b, mid);
    const nk = sq.squareLadder(k, sq.squarePw(THIN.h)).length;
    const A = { n: fs, nKeys: a ? nk : 0 }, B = { n: fs, nKeys: b ? nk : 0 };
    const r = run(spec, flatOpts, a0, a0 + A.n);
    const knotB = maxLoop(r.u.px, r.u.py, b0, b0 + B.n);
    const plate = (s0, n) => {
      const pts = []; let reach = 0;
      for (let i = s0; i < s0 + n; i++) { pts.push([mm(r.u.px[i] * 100), r.h(i)]); reach = Math.max(reach, mm(r.u.px[i] * 100)); }
      let top = 0, bot = 1e9;
      for (const [x, y] of pts) if (x > reach * 0.35 && x < reach * 0.9) { top = Math.max(top, y); bot = Math.min(bot, y); }
      const keys = r.u.locked.filter(([i, j]) => i >= s0 && j < s0 + n).map(([i, j]) => [i - s0, j - s0]);
      return { pts, keys, top, bot, reach };
    };
    return { r, upper: plate(a0, A.n), lower: plate(b0, B.n), a0, b0, n: A.n, ok: r.locked === A.nKeys + B.nKeys, locked: r.locked, nKeys: A.nKeys + B.nKeys, knot: Math.max(r.knot, knotB), bandTop: r.h(0) };
  }
  // 2-15 现行平台（176 节铺出去、余下收在顶端）的台面离钉住端，拿来和下台比
  const now215 = (() => {
    const d = cs.UNIT_TIERS[0], fseg = d.spec.findIndex((q) => q[0] === 'f' && q[2] && q[2].length);
    const base = d.spec.slice(0, fseg).reduce((a, q) => a + q[1], 0);
    const r = run(d.spec, d.opts, base, base + d.spec[fseg][1]);
    let top = 0; for (const [x, y] of r.pts) if (x > r.reach * 0.35 && x < r.reach * 0.9) top = Math.max(top, y);
    return top;
  })();
  const dualBoth = THIN.k.map((k) => dual338(k, true, true));
  const dualUp = dual338(THIN.k[0], true, false), dualLo = dual338(THIN.k[0], false, true);
  const nodeDev = (x, y, s0, n) => { let d = 0; const fx = x.r.u.py[x.r.u.n - 1], fy = y.r.u.py[y.r.u.n - 1]; for (let i = s0; i < s0 + n; i++) d = Math.max(d, Math.hypot(x.r.u.px[i] - y.r.u.px[i], (x.r.u.py[i] - fx) - (y.r.u.py[i] - fy)) * 100); return d; };
  const d0 = dualBoth[0];
  console.log(`\n⑤ 一条带两个结构（338 节全部铺出去，中间贴合 ${DUAL_MID} 节）：三档挑出 · 键 · 结 · 下台 / 上台（离钉住端）· 两台之间`);
  console.log(`  挑出 ${dualBoth.map((r) => `${f3(r.upper.reach)}/${f3(r.lower.reach)}`).join(' · ')}（上/下；方台 ${target.map((t) => f3(mm(t))).join(' / ')}）· 键 ${dualBoth.map((r) => `${r.locked}/${r.nKeys}`).join(' ')} · 结 ≤${Math.max(...dualBoth.map((r) => r.knot))}`);
  console.log(`  下台 ${f3(d0.lower.bot)}–${f3(d0.lower.top)} · 上台 ${f3(d0.upper.bot)}–${f3(d0.upper.top)} · 两台之间空 ${f3(d0.upper.bot - d0.lower.top)} · 带顶离钉住端 ${f3(d0.bandTop)}`);
  console.log(`  只成上台：上台形状与两台都成相差 ${nodeDev(d0, dualUp, d0.a0, d0.n).toFixed(4)} px；只成下台：下台相差 ${nodeDev(d0, dualLo, d0.b0, d0.n).toFixed(4)} px（下台顶 ${f3(d0.lower.top)}，2-15 现行平台 ${f3(now215)}）`);
  for (const mid of [24, 16]) { const r = dual338(THIN.k[0], true, true, mid); console.log(`  中间贴合 ${mid} 节（多出的让给顶端）：两台之间 ${f3(r.upper.bot - r.lower.top)} · 上台厚 ${f3(r.upper.top - r.upper.bot)} · 键 ${r.locked}/${r.nKeys}`); }

  // ── 圆 ↔ 方（2-7）在 6.5 cm 台上：挑出随 k 的表，五档轮廓按 2-7 的取法（内切半边长不变，角按极径线性推）反查
  const DK = []; for (let k = 24; k <= THIN.k[2]; k++) { const r = box338(k, THIN.h, 0); DK.push({ k, reach: r.reachPx, ok: r.ok }); }
  const kOf = (want) => DK.reduce((b, d) => (Math.abs(d.reach - want) < Math.abs(b.reach - want) ? d : b)).k;
  const aHalf = (sq.SQUARE.RADIUS + DK[DK.length - 1].reach) / Math.SQRT2;
  const CLS_ANG = [9, 27, 45].map((d) => (d * Math.PI) / 180);
  const morph = [0, 1, 2, 3, 4].map((st) => CLS_ANG.map((th) => kOf(sq.squareMorphRadiusAt(th, st, aHalf) - sq.SQUARE.RADIUS)));
  console.log(`\n⑥ 6.5 cm 台的挑出（k ${DK[0].k}–${DK[DK.length - 1].k}）：${DK.map((d) => `${d.k}:${f3(mm(d.reach))}${d.ok ? '' : '✗'}`).join(' ')}`);
  console.log(`  圆 ↔ 方五档（面 / 边 / 角的 k）：${morph.map((t, i) => `${sq.SQUARE_MORPH.LABELS[i]} ${t.join('/')}`).join(' · ')}`);
  const reachK = (k) => mm(DK.find((d) => d.k === k).reach);
  const nodeGap = (cls) => layout.pitchM / Math.SQRT2 - (coreR + reachK(morph[cls][2]));
  console.log(`  台角到相邻过道交叉点（站人的地方）：方 ${f3(nodeGap(4))} m · 圆 ${f3(nodeGap(0))} m（人的身体半径 ${ua.PLAN.BODY_R}）`);

  // ── 目录里另外三形（2-1）：按放大倍数放到 2-15 的布（176 节，自由段 129）与收缩深度 0.30 上，挑出 / 台面平不平 / 键
  console.log(`\n⑦ 目录三形放到 2-15 的布上（收缩到 0.30；格距一半 ${f3(layout.pitchM / 2)}，挑出超过 ${f3(layout.pitchM / 2 - coreR)} 就碰邻台）：`);
  for (const key of ['bulb', 'ledge', 'pocket']) {
    const d = sdata.SKIN_UNITS.find((q) => q.key === key), FREE = 129, LEAD0 = cs.UNIT_BAND - FREE - cs.UNIT_SHAPE.tail;
    const row = [1, 1.3, 1.6, 2.1].map((gr) => {
      const seg = sarr.placeOnBand(ring.growSeg(d.spec[1], gr), FREE, (FREE - 1) / 2);
      const r = run([['g', LEAD0], seg, ['g', cs.UNIT_SHAPE.tail]], { ...sdata.skinSiteOpts(d), r1: U.SKIN.R1 }, LEAD0, LEAD0 + FREE);
      const bins = new Map();
      for (const [x, y] of r.pts) if (x > r.reach * 0.35 && x < r.reach * 0.9) { const b = Math.round(x / 0.008); bins.set(b, Math.max(bins.get(b) ?? 0, y)); }
      const tops = [...bins.values()];
      return `×${gr} 挑出 ${f3(r.reach)} · 台面起伏 ${((Math.max(...tops) - Math.min(...tops)) * 100).toFixed(1)} cm · 键 ${r.locked}/${seg[2].length}`;
    });
    console.log(`  ${d.zh}：${row.join(' ｜ ')}`);
  }

  M = {
    mpp, coreR, pitch: layout.pitchM, roomM: layout.roomM, units: layout.units.map((u) => [u.x, u.y]),
    target: target.map(mm),
    cur: cur.map((r) => ({ pts: r.pts, keys: r.keys, top: r.top, bot: r.bot, reach: r.reach })),
    thin: thin.map((r) => ({ pts: r.pts, keys: r.keys, top: r.top, bot: r.bot, reach: r.reach })), thinRange: [thinLo.top, thinHi.top], thinShift: tp,
    h36: { pts: h36.pts, keys: h36.keys, top: h36.top, bot: h36.bot, range: [h36Lo.top, h36Hi.top] },
    dbl: Object.fromEntries(GAPS.map((w) => [w, { p: dbl[w].p, row: dbl[w].row.map((r) => ({ pts: r.pts, keys: r.keys, upper: r.upper, lower: r.lower, reach: r.reach })) }])),
    solid: solid.map((r) => ({ pts: r.pts, keys: r.keys, top: r.top, bot: r.bot, reach: r.reach })),
    dual: { upper: d0.upper, lower: d0.lower, bandTop: d0.bandTop, mid: DUAL_MID }, now215,
    morph: morph.map((t) => t.map(reachK)), morphK: morph, aHalf: mm(aHalf), bodyR: ua.PLAN.BODY_R,
    pinchHalf: mm(sqs.SQSPLIT_HALF_SIDE),
  };
  const sim = new co.CohabitSim({ grid: co.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', trigger: 'posture', seed: 1 });
  M.rects = sim.furn.rects; M.seats = sim.seats.map((st) => ({ x: st.x, y: st.y, furn: st.furn }));
} finally {
  await server.close();
}

// ════════════════════════ 绘图（纯字符串拼 SVG）════════════════════════
const INK = '#2b2a27', MUTE = '#8a877f', FAINT = '#cfcabe', KEY = '#d9782d', CAT = '#56684a', PERSON = '#7d6f86', PAPER = '#f6f3ec', NEW = '#2f7486', SOFA = '#e6dfd2';
const FILL = { flat: '#ddd6c8', dbl: '#2f7486', solid: '#4a4844' };
const font = `font-family="Noto Sans CJK SC, sans-serif"`;
const f1 = (v) => v.toFixed(1);
const m2 = (v) => v.toFixed(2);

function canvas(W, H) {
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`, `<rect width="${W}" height="${H}" fill="${PAPER}"/>`];
  const g = {
    svg, W, H,
    txt: (x, y, s, size = 12, fill = INK, anchor = 'start', weight = 400) => svg.push(`<text x="${f1(x)}" y="${f1(y)}" ${font} font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${s}</text>`),
    line: (x1, y1, x2, y2, stroke = INK, w = 1, dash = '') => svg.push(`<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`),
    rect: (x, y, w, h, fill = 'none', stroke = INK, sw = 1, op = 1, dash = '') => svg.push(`<rect x="${f1(Math.min(x, x + w))}" y="${f1(Math.min(y, y + h))}" width="${f1(Math.abs(w))}" height="${f1(Math.abs(h))}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`),
    poly: (pts, stroke = INK, w = 1.4, fill = 'none', closed = false, extra = '') => svg.push(`<${closed ? 'polygon' : 'polyline'} points="${pts.map((p) => p.map(f1).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" ${extra}/>`),
  };
  g.arrow = (pts, color) => {
    g.poly(pts, color, 1.4, 'none', false, 'stroke-dasharray="5 3"');
    const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    g.poly([[b[0] - 8 * Math.cos(ang - 0.4), b[1] - 8 * Math.sin(ang - 0.4)], b, [b[0] - 8 * Math.cos(ang + 0.4), b[1] - 8 * Math.sin(ang + 0.4)]], color, 1.4);
  };
  return g;
}
/** 立面：u = 水平（米），h = 高（米） */
const view = (ox, oy, k) => ({ X: (u) => ox + u * k, Y: (h) => oy - h * k, k });
/** 截面（结构段）画在 (cx) 处：side = ±1 朝哪边伸，dh = 竖向平移（离钉住端 → 离地或离参照） */
function section(g, v, prof, cx, dh, side, color = INK, w = 1.5) {
  const P = prof.pts.map(([x, y]) => [v.X(cx + side * (M.coreR + x)), v.Y(dh + y)]);
  g.poly(P, color, w);
  for (const [i, j] of prof.keys) g.line(P[i][0], P[i][1], P[j][0], P[j][1], color === FAINT ? FAINT : KEY, 0.7);
  return P;
}
/** 带子贴芯那一截 + 立杆 */
function core(g, v, cx, h0, h1, side = 0) {
  if (side) g.line(v.X(cx + side * M.coreR), v.Y(h0), v.X(cx + side * M.coreR), v.Y(h1), INK, 1.2);
  else for (const s of [-1, 1]) g.line(v.X(cx + s * M.coreR), v.Y(h0), v.X(cx + s * M.coreR), v.Y(h1), INK, 1.2);
  g.line(v.X(cx), v.Y(h0), v.X(cx), v.Y(h1), MUTE, 1, '5 3');
}
function floor(g, v, u0, u1) {
  g.line(v.X(u0), v.Y(0), v.X(u1), v.Y(0), INK, 1.2);
  for (let u = u0 + 0.05; u < u1; u += 0.1) g.line(v.X(u), v.Y(0), v.X(u - 0.05), v.Y(-0.05), FAINT, 0.8);
}
function ruler(g, v, u, h0, h1, step = 0.1, label = (h) => h.toFixed(1)) {
  g.line(v.X(u), v.Y(h0), v.X(u), v.Y(h1), MUTE, 0.8);
  for (let h = Math.ceil(h0 / step - 1e-9) * step; h <= h1 + 1e-9; h += step) { g.line(v.X(u) - 4, v.Y(h), v.X(u), v.Y(h), MUTE, 0.8); g.txt(v.X(u) - 7, v.Y(h) + 4, label(h), 10, MUTE, 'end'); }
}
const tag = (g, v, u, h, s, color = MUTE, dir = 1, len = 0.06) => { g.line(v.X(u), v.Y(h), v.X(u + dir * len), v.Y(h), color, 0.8, '2 2'); g.txt(v.X(u + dir * (len + 0.015)), v.Y(h) + 4, s, 11, color, dir > 0 ? 'start' : 'end'); };
/** 方块猫（侧视）：家猫比例（figure.ts：鼻到臀约 0.42、背高约 0.22） */
function cat(g, v, u, h, pose, dir = 1) {
  const b = (bx, by, bw, bh) => { const x0 = dir > 0 ? u + bx : u - bx - bw; g.rect(v.X(x0), v.Y(h + by + bh), bw * v.k, bh * v.k, CAT, 'none', 0); };
  if (pose === 'lie') { b(-0.17, 0, 0.32, 0.1); b(0.12, 0.03, 0.09, 0.085); b(0.13, 0.115, 0.022, 0.03); b(0.185, 0.115, 0.022, 0.03); b(-0.26, 0, 0.1, 0.03); }
  else { b(-0.08, 0, 0.16, 0.19); b(0.0, 0.17, 0.1, 0.085); b(0.01, 0.255, 0.022, 0.032); b(0.07, 0.255, 0.022, 0.032); b(-0.15, 0, 0.08, 0.03); }
}
/** 沙发 + 坐着的人（侧视）：front = 沙发前缘，dir = 人面朝的方向 */
function sofa(g, v, front, dir, op = 1) {
  const R = (a, b, h0, h1, fill, stroke = 'none') => g.rect(v.X(front + dir * a), v.Y(h1), dir * (b - a) * v.k, (h1 - h0) * v.k, fill, stroke, stroke === 'none' ? 0 : 1, op);
  R(-0.8, 0, 0, 0.43, SOFA, MUTE); R(-0.8, -0.6, 0, 0.85, SOFA, MUTE);
  R(-0.55, -0.02, 0.43, 0.57, PERSON); R(-0.06, 0.06, 0.06, 0.45, PERSON); R(-0.06, 0.14, 0, 0.06, PERSON);
  R(-0.6, -0.36, 0.55, 1.05, PERSON); R(-0.58, -0.37, 1.07, 1.29, PERSON); R(-0.42, -0.12, 0.62, 0.7, PERSON);
}
/** 餐椅 + 坐着的人（侧视）：座位后缘 back，dir = 面朝 */
function chair(g, v, back, dir, op = 1) {
  const R = (a, b, h0, h1, fill, stroke = 'none') => g.rect(v.X(back + dir * a), v.Y(h1), dir * (b - a) * v.k, (h1 - h0) * v.k, fill, stroke, stroke === 'none' ? 0 : 1, op);
  R(0, 0.5, 0.4, 0.45, SOFA, MUTE); R(-0.04, 0, 0, 0.85, SOFA, MUTE); R(0.46, 0.5, 0, 0.4, SOFA, MUTE);
  R(0.03, 0.5, 0.45, 0.6, PERSON); R(0.46, 0.56, 0.06, 0.45, PERSON); R(0.46, 0.64, 0, 0.06, PERSON);
  R(0.04, 0.28, 0.58, 1.08, PERSON); R(0.06, 0.27, 1.1, 1.32, PERSON); R(0.2, 0.52, 0.66, 0.74, PERSON);
}

// ── 平面里的一台：二十条带，每条一个扇区（挂带线 → 方形外缘）
const BAND_ANG = Array.from({ length: 20 }, (_, i) => Math.PI / 20 + (i / 20) * 2 * Math.PI); // squareAngle
const CLASS = BAND_ANG.map((a) => { const q = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); return Math.round(Math.min(q, Math.PI / 2 - q) / (Math.PI / 10) - 0.5); });
const halfSide = () => M.coreR + M.target[0];
const rimR = (a) => halfSide() / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
/**
 * kinds[i] ∈ 'flat' | 'dbl' | 'solid' | 'lower' | 'upper' | null（不落）。
 * 平面 y 轴朝下画（与 2-15 平面一致：+y = 画面下方）。
 */
function unitPlan(g, cx, cy, k, kinds, opt = {}) {
  const ri = M.coreR * k;
  for (let i = 0; i < 20; i++) {
    const a = BAND_ANG[i], h = Math.PI / 20 - 0.012, kind = kinds[i];
    const a0 = a - h, a1 = a + h, r0 = rimR(a0) * k, r1 = rimR(a1) * k;
    const pts = [[cx + ri * Math.cos(a0), cy + ri * Math.sin(a0)], [cx + r0 * Math.cos(a0), cy + r0 * Math.sin(a0)], [cx + r1 * Math.cos(a1), cy + r1 * Math.sin(a1)], [cx + ri * Math.cos(a1), cy + ri * Math.sin(a1)]];
    if (!kind) { g.poly(pts, FAINT, 0.8, 'none', true, 'stroke-dasharray="2 2"'); continue; }
    const fill = kind === 'dbl' ? FILL.dbl : kind === 'solid' ? FILL.solid : FILL.flat;
    const op = kind === 'dbl' ? 0.42 : kind === 'solid' ? 0.85 : 1;
    g.poly(pts, kind === 'dbl' ? NEW : MUTE, 0.7, fill, true, `fill-opacity="${op}"`);
    if (kind === 'lower' || kind === 'upper') { const rm = (ri + (r0 + r1) / 2) / 2 + 6; g.txt(cx + rm * Math.cos(a), cy + rm * Math.sin(a) + 4, kind === 'lower' ? '下' : '上', 10, INK, 'middle'); }
    if (opt.labels && opt.labels[i] != null) { const rr = (r0 + r1) / 2 + 13; g.txt(cx + rr * Math.cos(a), cy + rr * Math.sin(a) + 4, opt.labels[i], 10, opt.labelColor ?? MUTE, 'middle'); }
  }
  g.svg.push(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(ri)}" fill="${PAPER}" stroke="${MUTE}" stroke-width="0.8"/>`);
  g.svg.push(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="2.5" fill="${MUTE}"/>`);
}

// ════════════════ 第一张：截面与一个单元里的组合 ════════════════
function sheetSections() {
  const g = canvas(1600, 1022);
  g.txt(36, 42, '同一条布能成的截面，以及一个单元里怎么逐带组合（第二轮线稿 · 2026-10-29）', 20, INK, 'start', 600);
  g.txt(36, 66, '截面是真引擎终态：同一条 338 节的布（捏分那副七段谱，收缩到 r1 = 0.30），三档挑出都调到方台的大小（边长 0.70 m），按 2-15 的缩放换成米（1 引擎 px = 4.08 mm）。', 12, MUTE);
  g.txt(36, 84, '橙线 = 锁定键（上下两片板之间的键不画，与台架同口径）。竖虚线 = 立杆，竖实线 = 带子贴芯那一截。黑 = 2-15 原来就有的；蓝 = 第二轮建议加入的（其中 6.5 cm 的平台 10-29 已接进 2-15）。', 12, MUTE);

  // ── A 行：截面（面档，从立杆往外）
  g.txt(36, 120, 'A　截面（面档剖面，从立杆往外看半边；高度从钉住端量起）', 14, INK, 'start', 600);
  const kA = 330, H0 = 0.22, H1 = 0.92, yA = 180 + H1 * kA;
  const panels = [
    { t: ['A1　平台 · 台厚 0.15', '（原来，202 节）'], prof: M.cur[0], top: M.cur[0].top, c: INK, foot: true },
    { t: ['A2　平台 · 台厚 6.5 cm', '（338 节）'], prof: M.thin[0], c: NEW, ghost: M.thinRange },
    { t: ['A3　双层 · 缝 0.12', '（338 节）'], prof: M.dbl[30].row[0], c: NEW },
    { t: ['A4　双层 · 缝 0.24', '（338 节）'], prof: M.dbl[60].row[0], c: NEW },
    { t: ['A5　厚台 · 0.23 m', '（面、边档放得下）'], prof: M.solid[0], c: NEW },
    { t: ['A6　厚台 · 0.31 m', '（只有角档放得下）'], prof: M.solid[2], c: NEW },
    { t: ['A7　不落', '（让路、缺口）'], prof: null, c: MUTE },
  ];
  const notes = [
    ['台面离钉住端 ' + m2(M.cur[0].top), '202 节布上位置固定', '茶几最低 0.49'],
    [`台面离钉住端 ${m2(M.thinRange[0])}–${m2(M.thinRange[1])}`, '同一条布上能上下挪 0.40 m', '挪的时候形状不变'],
    [`下板 ${m2(M.dbl[30].row[0].lower[0])}–${m2(M.dbl[30].row[0].lower[1])}`, `上板 ${m2(M.dbl[30].row[0].upper[0])}–${m2(M.dbl[30].row[0].upper[1])}`, '板厚 6.4 cm，能挪 ±4 cm'],
    [`下板 ${m2(M.dbl[60].row[0].lower[0])}–${m2(M.dbl[60].row[0].lower[1])}`, `上板 ${m2(M.dbl[60].row[0].upper[0])}–${m2(M.dbl[60].row[0].upper[1])}`, '缝 0.18 也成形（未画）'],
    [`台 ${m2(M.solid[0].bot)}–${m2(M.solid[0].top)}`, '上下连成一块', '再厚面档就比方台大'],
    [`台 ${m2(M.solid[2].bot)}–${m2(M.solid[2].top)}`, '与缝 0.18 的双层同高', '面、边档做不出'],
    ['整条带贴着立杆', '2-15 让路就是这样', '缺口由不落的带组成'],
  ];
  panels.forEach((p, i) => {
    const x0 = 40 + i * 222;
    const v = view(x0 + 36, yA, kA);
    g.txt(x0, 148, p.t[0], 13, p.c === INK ? INK : NEW, 'start', 600); g.txt(x0, 164, p.t[1], 11, MUTE);
    if (i === 0) ruler(g, v, -0.03, H0, H1, 0.1);
    g.line(v.X(0), v.Y(H0), v.X(0), v.Y(H1), MUTE, 1, '5 3');
    if (!p.prof) { g.line(v.X(M.coreR), v.Y(H0), v.X(M.coreR), v.Y(H1), INK, 1.4); }
    else {
      // 结构段 + 贴芯的带子（结构段以外的带子都贴着芯：垫离芯实测 0）
      const ys = p.prof.pts.map((q) => q[1]);
      const lo = Math.min(...ys), hi = Math.max(...ys);
      g.line(v.X(M.coreR), v.Y(H0), v.X(M.coreR), v.Y(lo), INK, 1.2); g.line(v.X(M.coreR), v.Y(hi), v.X(M.coreR), v.Y(H1), INK, 1.2);
      if (p.ghost) for (const tTop of p.ghost) section(g, v, p.prof, 0, tTop - p.prof.top, 1, FAINT, 1.1);
      section(g, v, p.prof, 0, 0, 1, p.c);
      if (p.ghost) { g.txt(v.X(M.coreR + 0.24), v.Y(p.ghost[1]) + 4, `偏移 −${M.thinShift}`, 10, MUTE); g.txt(v.X(M.coreR + 0.24), v.Y(p.ghost[0]) + 4, `偏移 +${M.thinShift}`, 10, MUTE); }
    }
    notes[i].forEach((s, j) => g.txt(x0, v.Y(H0) + 22 + j * 15, s, 11, j ? MUTE : (p.c === INK ? INK : NEW)));
  });
  g.txt(40, yA - H0 * kA + 82, '挑出：A1–A4 三档都等于方台（面 0.23 · 边 0.26 · 角 0.36 m，加上挂带线离立杆 0.12 m）。键全锁；成形途中最大自交环 ≤ 5 节；两头的配平垫全程贴芯（离芯 0 m）。', 11, MUTE);
  g.txt(40, yA - H0 * kA + 98, '配平偏移只在上下两段垫之间挪布：成形途中第 300、700、1100、1499 步比过，截面形状差 ≤ 0.02 px，只有整体高低不同。所以同一条轨迹可以画在不同高度。', 11, MUTE);

  // ── B 行：一个单元里逐带组合（俯视）
  const yB = 560;
  g.txt(36, yB, 'B　一个单元里逐带组合（2-6 的做法放进 2-15）· 俯视，每个扇区 = 一条带（18°）', 14, INK, 'start', 600);
  const kB = 220, cyB = yB + 160;
  const half = (pred) => BAND_ANG.map((a) => pred(Math.cos(a), Math.sin(a), a));
  const plans = [
    { t: 'B1　半台', kinds: half((c) => (c > 0 ? 'flat' : null)), n: ['十条带成平台，另外十条不落', '2-6 的半圆；2-15 让路已经这样做'] },
    { t: 'B2　分开的两块', kinds: half((c, s) => (Math.abs(c) > 0.75 ? 'flat' : null)), n: ['相对两边各四条带', '2-6 的分离双扇区'] },
    { t: 'B3　上板只盖半圈', kinds: half((c) => (c < 0 ? 'dbl' : 'lower')), n: ['左半：双层（有顶）', '右半：只有下板（台面与下板齐）'] },
    { t: 'B4　四角连通', kinds: half((c, s, a) => (CLASS[BAND_ANG.indexOf(a)] === 2 ? 'solid' : 'dbl')), n: ['双层一圈（缝 0.18），四个角各一条带', '成 0.31 m 厚台，把上下板连起来'] },
    { t: 'B5　台面一圈有高有低', kinds: half(() => 'flat'), labels: BAND_ANG.map((a, i) => (i % 5 === 0 ? (Math.cos(a) >= 0 ? '+' : '−') + Math.abs(Math.cos(a) * 0.2).toFixed(2) : null)), n: ['每条带配平偏移不同', '右高左低，差 0.40 m（相对单元中心 ±0.20）'] },
    { t: 'B6　层间距沿一圈变', kinds: half(() => 'dbl'), labels: BAND_ANG.map((a, i) => (i % 5 === 0 ? (Math.cos(a) > 0.5 ? '24' : Math.cos(a) > -0.5 ? '18' : '12') : null)), n: ['双层，缝按带取 0.24 / 0.18 / 0.12', '数字 = 缝（cm）；口高、里面低'] },
  ];
  plans.forEach((p, i) => {
    const cx = 140 + i * 258;
    g.txt(cx - 110, yB + 30, p.t, 13, NEW, 'start', 600);
    unitPlan(g, cx, cyB, kB, p.kinds, { labels: p.labels, labelColor: NEW });
    p.n.forEach((s, j) => g.txt(cx - 110, cyB + 135 + j * 15, s, 11, j ? MUTE : INK));
  });
  // 图例
  { const ly = cyB + 190; let lx = 40;
    const sw = (fill, op, label, stroke = MUTE, dash = '') => { g.rect(lx, ly - 10, 16, 12, fill, stroke, 0.8, 1, dash); g.svg[g.svg.length - 1] = g.svg[g.svg.length - 1].replace('opacity="1"', `fill-opacity="${op}"`); g.txt(lx + 22, ly, label, 11, MUTE); lx += 22 + label.length * 11 + 24; };
    sw(FILL.flat, 1, '平台（单层）'); sw(FILL.dbl, 0.42, '双层（上下两片板，中间是腔）', NEW); sw(FILL.solid, 0.85, '厚台（上下连通）'); sw('none', 1, '不落', FAINT, '2 2');
    g.txt(lx, ly, '「下」= 只有下板（台面与旁边双层的下板齐）', 11, MUTE); }
  // 说明：哪些是真成形
  { const ny = cyB + 222; const L = [
      '每条带各自是一条真引擎的截面（A 行那几种），B1–B6 只是把它们按方位排开；带与带之间不相互作用（引擎是单剖面的，与 2-5 起的环列同一种分工）。',
      'B5 的「有高有低」是每条带各自水平、整条带上下挪，读起来是台面沿一圈升降（2-7 一圈起伏同一类），不是一块斜平面。2-6 的斜平面仍是装配映射，没有物理解。',
      'B4 的厚台只有角档那条带放得下 0.31 m（面、边档最多 0.23 m）；要整边连通，缝就只能到 0.10 m，猫进不去。',
      '同一个单元里所有带共用一条 338 节的布、一个钉住端和同一个收缩协议；缺口与 2-15 现在的让路一样，靠不落的带（顶端按带收放，10-07 加的结构假设）。',
    ]; L.forEach((s, j) => g.txt(40, ny + j * 16, s, 11, j ? MUTE : INK)); }
  g.svg.push('</svg>');
  return g.svg.join('\n');
}

// ════════════════ 第二张：放进 2-15 的房间 ════════════════
function sheetRoom() {
  const g = canvas(1600, 1220);
  g.txt(36, 42, '放进 2-15 的房间：一张沙发旁边的一种排法，以及 2-13 的几种接法（第二轮线稿 · 2026-10-29）', 20, INK, 'start', 600);
  g.txt(36, 66, '位置取 2-15 标准布置的真实坐标（左上那张沙发、它的茶几、左边那把餐椅）。高度由每台的钉住端（整台升降，2-15 已有）加每条带的配平偏移（逐带，A2 的 ±0.20 m）合成。', 12, MUTE);
  g.txt(36, 84, '排法只是示意，用来看尺寸对不对得上；哪一台成什么由规则定（见文档 §6）。人、猫、家具只作比例参考。', 12, MUTE);

  // 量数
  const C = M.coreR, half = halfSide();
  const thinTop0 = M.thin[0].top; // 偏移 0 时台面离钉住端
  const AMP = (M.thinRange[1] - M.thinRange[0]) / 2; // 逐带偏移能给的半幅
  const SEAM = Math.cos(Math.PI / 20); // 正对邻台的那两条带在 ±9°
  const d60 = M.dbl[60].row[0];
  const stay = { lowerTop: 0.72 }; stay.foot = stay.lowerTop - d60.lower[1]; stay.roofBot = stay.foot + d60.upper[0]; stay.roofTop = stay.foot + d60.upper[1]; stay.lowerBot = stay.foot + d60.lower[0];
  const ramp = { hi: 1.05, lo: stay.lowerTop }; ramp.h0 = (ramp.hi + ramp.lo) / 2; ramp.A = (ramp.hi - ramp.lo) / 2 / SEAM; ramp.foot = ramp.h0 - thinTop0;
  const plat = { top: 1.05 }, coffee = { top: 0.42 }, dining = { top: 0.74 };
  const d45 = M.dbl[45].row[0];
  console.log(`\n房间里的示意排法：逐带偏移半幅 ${AMP.toFixed(3)} m（正对邻台那条带 ×cos9° = ${(AMP * SEAM).toFixed(3)}）`);
  console.log(`  续坡那台：两侧接缝 ${ramp.hi} / ${ramp.lo.toFixed(2)}，用了半幅 ${ramp.A.toFixed(3)}，钉住端离地 ${ramp.foot.toFixed(2)}`);
  console.log(`  有顶的那台（缝 0.24）：下板 ${stay.lowerBot.toFixed(3)}–${stay.lowerTop.toFixed(2)}，上板 ${stay.roofBot.toFixed(3)}–${stay.roofTop.toFixed(3)}，钉住端离地 ${stay.foot.toFixed(2)}；扶手 0.62`);
  console.log(`  餐桌 6.5 cm 台面 0.74：台底 ${(0.74 - (M.thin[0].top - M.thin[0].bot)).toFixed(3)}，比餐椅座面 0.45 高 ${(0.74 - (M.thin[0].top - M.thin[0].bot) - 0.45).toFixed(3)}（原来 0.15 厚：${(0.74 - (M.cur[0].top - M.cur[0].bot) - 0.45).toFixed(3)}）`);

  // ── C1 平面
  const kP = 160, x0 = 60, y0 = 120; // 看 x∈[-3.32,0.95] y∈[-3.32,0.25]
  const P = (x, y) => [x0 + (x + 3.32) * kP, y0 + (y + 3.32) * kP];
  g.txt(36, 110, 'C1　平面（左上角是墙角）', 14, INK, 'start', 600);
  g.line(...P(-3.32, -3.32), ...P(0.95, -3.32), INK, 2); g.line(...P(-3.32, -3.32), ...P(-3.32, 0.25), INK, 2);
  for (const r of M.rects) { const x1 = Math.min(r.x1, 0.95), y1 = Math.min(r.y1, 0.25); if (x1 <= r.x0 || y1 <= r.y0) continue; const a = P(r.x0, r.y0); g.rect(a[0], a[1], (x1 - r.x0) * kP, (y1 - r.y0) * kP, SOFA, MUTE, 1); }
  { const a = P(-1.94, -2.72); g.txt(a[0] + 6, a[1] + 14, '沙发（座面 0.43 · 扶手 0.62）', 10, MUTE); const c = P(-0.66, -1.48); g.txt(c[0] + 2, c[1] - 5, '餐椅', 10, MUTE); }
  for (const st of M.seats) { if (st.x > 0.8 || st.y > 0.25) continue; const [x, y] = P(st.x, st.y); g.rect(x - 0.13 * kP, y - 0.11 * kP, 0.26 * kP, 0.22 * kP, PERSON, 'none', 0); }
  // 其余单元：淡虚线（收在天花下）
  const used = new Map([['-2.07,-0.41', 'plat'], ['-2.07,-1.24', 'ramp'], ['-2.07,-2.07', 'stay'], ['-1.24,-1.24', 'coffee'], ['0.41,-1.24', 'dining']]);
  const key = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`;
  for (const [ux, uy] of M.units) {
    if (ux > 0.95 || uy > 0.25) continue;
    const k = used.get(key(ux, uy));
    if (!k) { const a = P(ux - half, uy - half); g.rect(a[0], a[1], 2 * half * kP, 2 * half * kP, 'none', FAINT, 0.8, 1, '3 3'); continue; }
    const cx = P(ux, uy);
    if (k === 'plat' || k === 'coffee' || k === 'dining') unitPlan(g, cx[0], cx[1], kP, BAND_ANG.map(() => 'flat'));
    if (k === 'ramp') unitPlan(g, cx[0], cx[1], kP, BAND_ANG.map(() => 'flat'), { labels: BAND_ANG.map((a, i) => (i === 4 || i === 14 || i === 0 || i === 9 ? (ramp.h0 + ramp.A * Math.sin(a)).toFixed(2) : null)), labelColor: NEW });
    if (k === 'stay') unitPlan(g, cx[0], cx[1], kP, BAND_ANG.map((a) => (Math.cos(a) < 0 ? 'dbl' : 'lower')));
  }
  const lab = (x, y, lines, c = INK, dx = 0, dy = 0) => { const [px, py] = P(x, y); lines.forEach((s, i) => g.txt(px + dx, py + dy + i * 14, s, 11, i ? MUTE : c, 'start', i ? 400 : 600)); };
  lab(-2.075, -0.415, ['平台 1.05', '猫原来待的台'], INK, 62, -30);
  lab(-2.075, -1.245, ['续坡', `1.05 → ${ramp.lo.toFixed(2)}`, '逐带偏移'], NEW, -150, -14);
  lab(-2.075, -2.075, ['有顶的一台', `下板 ${stay.lowerTop.toFixed(2)}`, `顶 ${stay.roofTop.toFixed(2)}`, '左半有顶'], NEW, -150, -20);
  lab(-1.245, -1.245, ['茶几 0.42', '6.5 cm 台面'], NEW, -40, 70);
  lab(0.41, -1.24, ['餐桌 0.74', '6.5 cm 台面'], NEW, -42, 70);
  // 猫的路线
  { const a = P(-2.075 + 0.2, -0.415), b = P(-2.075 + 0.25, -1.245), c = P(-2.075 + 0.2, -1.245 - 0.42), d = P(-2.075 - 0.1, -2.075 + 0.05), e = P(-2.075 + 0.22, -2.075 + 0.0);
    g.arrow([a, [a[0] + 6, (a[1] + b[1]) / 2], b, c], CAT); g.arrow([c, [d[0] + 8, c[1] + 12], d], CAT); g.arrow([d, [d[0] + 20, d[1] + 10], e], CAT); }
  // 视线：左座 → 有顶那台的敞开半边
  { const s1 = M.seats[1]; const a = P(s1.x, s1.y), b = P(-2.075 + 0.2, -2.075); g.line(a[0], a[1], b[0], b[1], PERSON, 1.1, '4 3'); }
  // 剖切线
  { const a = P(-2.13, -3.32), b = P(-2.13, 0.2); g.line(a[0], a[1], b[0], b[1], INK, 0.8, '12 3 2 3'); g.txt(a[0] - 14, a[1] + 14, 'S', 12, INK, 'start', 600); g.txt(b[0] - 14, b[1], 'S', 12, INK, 'start', 600);
    const c = P(-0.9, -1.30), d = P(0.95, -1.30); g.line(c[0], c[1], d[0], d[1], INK, 0.8, '12 3 2 3'); g.txt(c[0] - 14, c[1] + 4, 'T', 12, INK, 'start', 600); g.txt(d[0] + 4, d[1] + 4, 'T', 12, INK, 'start', 600); }
  { const ly = y0 + 3.62 * kP + 16; g.line(60, ly, 90, ly, CAT, 1.4, '5 3'); g.txt(96, ly + 4, '猫的路线：1.05 的台 → 沿续坡绕立杆走下来 → 从背后进有顶的那半 → 出到敞开的那半，朝着坐着的人', 11, CAT);
    g.line(60, ly + 18, 90, ly + 18, PERSON, 1.1, '4 3'); g.txt(96, ly + 22, '左座看过去（离有顶那台中心 0.63 m，右座 1.17 m）', 11, PERSON);
    g.rect(64, ly + 30, 16, 12, 'none', FAINT, 0.8, 1, '3 3'); g.txt(96, ly + 40, '没落的单元（收在天花板下）', 11, MUTE); }

  // ── C2 剖面 S–S：沿 x = −2.13（立杆偏向有顶那半），横轴 = 平面 y
  { const k = 172, v = view(860 + 3.32 * k, 520, k);
    g.txt(860, 110, 'C2　S–S 剖面（从墙那侧往房间里看；左 = 沙发那头的墙，右 = 房间中间）', 14, INK, 'start', 600);
    floor(g, v, -3.32, 0.25); ruler(g, v, -3.36, 0, 1.6, 0.2);
    g.line(v.X(-3.32), v.Y(0), v.X(-3.32), v.Y(1.6), INK, 2);
    // 沙发在剖切线后（+x），淡色
    sofa(g, v, -1.92, 1, 0.22);
    // 平台（−0.415）
    { const cy = -0.415, dh = plat.top - M.thin[0].top; core(g, v, cy, dh, 1.6); for (const sd of [-1, 1]) section(g, v, M.thin[0], cy, dh, sd, INK); tag(g, v, cy + half + 0.02, plat.top, '1.05'); cat(g, v, cy + 0.12, plat.top, 'sit', -1); }
    // 续坡（−1.245）：+y 侧高、−y 侧低
    { const cy = -1.245; core(g, v, cy, ramp.foot, 1.6);
      section(g, v, M.thin[0], cy, ramp.foot + ramp.A * SEAM, 1, NEW); section(g, v, M.thin[0], cy, ramp.foot - ramp.A * SEAM, -1, NEW);
      tag(g, v, cy + half + 0.02, ramp.hi, ramp.hi.toFixed(2), NEW); tag(g, v, cy - half - 0.02, ramp.lo, ramp.lo.toFixed(2), NEW, -1); }
    // 有顶的那台（−2.075）：这条剖切线落在有顶的那半，两侧都剖到双层
    { const cy = -2.075; core(g, v, cy, stay.foot, 1.6); for (const sd of [-1, 1]) section(g, v, d60, cy, stay.foot, sd, NEW);
      tag(g, v, cy - half - 0.02, stay.roofTop, stay.roofTop.toFixed(2), NEW, -1); tag(g, v, cy - half - 0.02, stay.lowerTop, stay.lowerTop.toFixed(2), NEW, -1);
      g.line(v.X(cy + half + 0.03), v.Y(stay.lowerTop), v.X(cy + half + 0.03), v.Y(stay.roofBot), NEW, 0.8); g.txt(v.X(cy + half + 0.05), v.Y((stay.lowerTop + stay.roofBot) / 2) + 4, '腔 0.24', 11, NEW);
      cat(g, v, cy + 0.2, stay.lowerTop, 'lie', -1); }
    g.arrow([[v.X(-0.5), v.Y(1.13)], [v.X(-1.0), v.Y(1.0)], [v.X(-1.6), v.Y(0.8)], [v.X(-1.75), v.Y(0.75)]], CAT);
    g.txt(v.X(-3.2), v.Y(-0.18), `续坡那台钉住端离地 ${ramp.foot.toFixed(2)}，有顶那台 ${stay.foot.toFixed(2)}。下板底 ${stay.lowerBot.toFixed(2)} 高过沙发扶手 0.62。`, 11, MUTE);
    g.txt(v.X(-3.2), v.Y(-0.18) + 15, '沙发在剖切线后 0.2 m 起，左座的人在 0.6 m 处（淡色）。续坡只剖到正对 ±y 的两条带，猫绕着立杆从侧面走下来（见 D 行）。', 11, MUTE);
  }

  // ── C3–C5 剖面 T–T：餐椅 + 餐桌（沿 x，横轴原点 = 桌的立杆；椅背在 x = −0.66，离立杆 1.07 m）
  { const k = 128, back = -0.66 - 0.41;
    const shelfFoot = dining.top - d45.upper[1]; // 远半圈双层：上板顶 = 0.74
    const nearTop = dining.top - shelfFoot; // 近半圈只有上板：同一钉住端，台面离钉住端要这么高
    console.log(`  桌下给猫一层：钉住端 ${shelfFoot.toFixed(3)}，远半圈下板顶 ${(shelfFoot + d45.lower[1]).toFixed(3)}；近半圈 6.5 cm 台面要离钉住端 ${nearTop.toFixed(3)}（同一条布能给 ${M.thinRange[0].toFixed(3)}–${M.thinRange[1].toFixed(3)}）`);
    const draw = (ox, title, kind) => {
      const v = view(ox, 822, k);
      g.txt(ox - 1.12 * k, 590, title[0], 13, kind ? NEW : INK, 'start', 600); g.txt(ox - 1.12 * k, 606, title[1], 11, MUTE);
      floor(g, v, -1.12, 0.42); chair(g, v, back, 1, 0.55);
      if (!kind) {
        const dh = dining.top - M.cur[0].top, under = dining.top - (M.cur[0].top - M.cur[0].bot);
        core(g, v, 0, dh, 1.25); for (const sd of [-1, 1]) section(g, v, M.cur[0], 0, dh, sd, INK);
        tag(g, v, -half - 0.02, under, under.toFixed(2), INK, -1, 0.04);
      } else if (kind === 'thin') {
        const dh = dining.top - M.thin[0].top, under = dining.top - (M.thin[0].top - M.thin[0].bot);
        core(g, v, 0, dh, 1.25); for (const sd of [-1, 1]) section(g, v, M.thin[0], 0, dh, sd, NEW);
        tag(g, v, -half - 0.02, under, under.toFixed(2), NEW, -1, 0.04);
      } else {
        core(g, v, 0, shelfFoot, 1.25); section(g, v, d45, 0, shelfFoot, 1, NEW); section(g, v, M.thin[0], 0, shelfFoot + nearTop - M.thin[0].top, -1, NEW);
        tag(g, v, half + 0.02, shelfFoot + d45.lower[1], (shelfFoot + d45.lower[1]).toFixed(2), NEW, 1, 0.04); cat(g, v, 0.24, shelfFoot + d45.lower[1], 'lie', -1);
      }
      tag(g, v, (kind === 'shelf' ? -1 : 1) * (half + 0.02), dining.top, '0.74', kind ? NEW : INK, kind === 'shelf' ? -1 : 1, 0.04);
      return v;
    };
    draw(860 + 1.12 * k, ['C3　餐桌 · 原来（台厚 0.15）', '台底比座面 0.45 只高 0.14，腿伸不进'], null);
    draw(860 + 1.12 * k + 1.6 * k + 18, ['C4　餐桌 · 6.5 cm 台面', '台底比座面高 0.22，椅子能往桌下挪'], 'thin');
    draw(860 + 1.12 * k + 3.2 * k + 36, ['C5　餐桌下给猫一层', '远离座位的半圈成双层（缝 0.18）'], 'shelf');
  }

  // ── D 行：2-13 的接法放进 2-15 的格子（立面）
  const yD = 870;
  g.txt(36, yD, 'D　2-13 的接法放进 2-15 的格子（立面 · 格距 0.83 · 台缝 0.13 · 每台 = 钉住端升降 + 逐带偏移）', 14, INK, 'start', 600);
  g.txt(36, yD + 18, '每台画的是朝观者那半圈的十条带：每条带水平、各在自己的高度，台面沿一圈升降。虚线 = 猫贴着这半圈、绕过立杆走的那条线（离立杆 0.24 m）。数字 = 接缝两侧的台面高（m）。', 11, MUTE);
  const kD = 92;
  /** 一台：高度 h(θ) = h0 + a·cos(θ − crest)；kind 'dbl' 时画上下两片板 */
  function elevUnit(v, ux, h0, a, crest, kind = 'flat', gapI = 60) {
    const r = M.dbl[gapI].row[0];
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 20; i++) {
      const th = BAND_ANG[i], near = Math.sin(th) < 0; if ((pass === 0) === near) continue; // 先画远的半圈
      const h = h0 + a * Math.cos(th - crest), r0 = C * Math.cos(th), r1 = rimR(th) * Math.cos(th);
      const col = near ? (kind === 'dbl' ? NEW : INK) : FAINT;
      const bar = (top, thick) => g.rect(v.X(ux + Math.min(r0, r1)), v.Y(top), Math.abs(r1 - r0) * v.k, thick * v.k, near ? (kind === 'dbl' ? '#dfeaec' : FILL.flat) : 'none', col, near ? 0.9 : 0.6);
      if (kind === 'dbl') { bar(h + (r.upper[1] - r.lower[1]), r.upper[1] - r.upper[0]); bar(h, r.lower[1] - r.lower[0]); }
      else bar(h, M.thin[0].top - M.thin[0].bot);
    }
    g.line(v.X(ux), v.Y(0), v.X(ux), v.Y(h0 + 0.6), MUTE, 0.8, '4 3');
    // 猫贴着近半圈走的线
    const pts = []; for (let t = 0; t <= 40; t++) { const th = Math.PI + (t / 40) * Math.PI; pts.push([v.X(ux + 0.24 * Math.cos(th)), v.Y(h0 + a * Math.cos(th - crest) + 0.01)]); }
    g.poly(pts, CAT, 1.2, 'none', false, 'stroke-dasharray="4 3"');
  }
  const combos = [
    { t: '续坡（两台）', units: [[0.30 + AMP * SEAM, AMP, 0], [0.30 + 3 * AMP * SEAM, AMP, 0]], seams: true },
    { t: '三段坡', units: [[0.525, 0.106, 0], [0.735, 0.106, 0], [0.945, 0.106, 0]], seams: true },
    { t: '台阶（2-15 现在的三个高度）', units: [[0.42, 0, 0], [0.74, 0, 0], [1.05, 0, 0]], seams: true },
    { t: '升台', units: [[0.43, 0, 0, 'dbl'], [0.43 + AMP * SEAM, AMP, 0], [0.43 + 2 * AMP * SEAM, 0, 0]], seams: true },
    { t: '合腔', units: [[0.43, 0, 0, 'dbl'], [0.43, 0, 0, 'dbl']], seams: false },
    { t: '凹', units: [[0.70, AMP, Math.PI], [0.70, AMP, 0]], seams: true },
    { t: '拱', units: [[0.70, AMP, 0], [0.70, AMP, Math.PI]], seams: true },
  ];
  let ox = 60;
  combos.forEach((cb) => {
    const n = cb.units.length, wM = (n - 1) * M.pitch + 2 * half;
    const v = view(ox + half * kD, yD + 230, kD);
    g.txt(ox, yD + 48, cb.t, 13, NEW, 'start', 600);
    floor(g, v, -half - 0.05, wM - half + 0.05);
    cb.units.forEach(([h0, a, crest, kind], i) => elevUnit(v, i * M.pitch, h0, a, crest, kind));
    // 接缝读数
    const hs = cb.units.map(([h0, a, crest]) => [h0 + a * Math.cos(Math.PI - crest) * SEAM, h0 + a * Math.cos(-crest) * SEAM]);
    cb.units.forEach(([, , , kind], i) => {
      const [lo, hi] = hs[i];
      if (i === 0) g.txt(v.X(-half), v.Y(Math.max(lo, hi) + 0.38), m2(kind === 'dbl' ? cb.units[0][0] : lo), 10, NEW, 'start');
      if (i < n - 1) g.txt(v.X(i * M.pitch + M.pitch / 2), v.Y(Math.max(hi, hs[i + 1][0]) + 0.38), `${m2(hi)}|${m2(hs[i + 1][0])}`, 10, NEW, 'middle');
      if (i === n - 1) g.txt(v.X(i * M.pitch + half), v.Y(Math.max(lo, hi) + 0.38), m2(hi), 10, NEW, 'end');
    });
    ox += wM * kD + 44;
  });
  { const ny = yD + 262; const L = [
      `续坡、三段坡、凹、拱：每台的半幅取逐带偏移能给的 ±${AMP.toFixed(2)} m 以内（三段坡每台只用 ±0.11）；接缝两侧齐平，走面在台缝处断开 0.13 m，猫跨过去。`,
      `升台：双层的下板（缝 0.24）接坡，坡从 0.43 升到 0.82，再接一块平台；2-13 方环做这一接法时差 8 cm 台阶，这里接得齐（一台之内能升 0.39 m，2-13 方环起伏只有 0.16 m）。`,
      '合腔：两台双层相邻，腔在台缝处接通，长 0.83 m（立杆到立杆）、高 0.24 m，台缝在腔的底和顶各留一道 0.13 m 的缝。三个外侧都敞着，入口不止一个。',
      '台阶：2-15 现在就能做（整台升降）。凹、拱：数都对得上，猫咖里给它们派什么用场还没想好，先留着。',
    ]; L.forEach((s, j) => g.txt(40, ny + j * 16, s, 11, MUTE)); }
  g.svg.push('</svg>');
  return g.svg.join('\n');
}

// ════════════════ 第三张：按用途定形（第三轮） ════════════════
function sheetUses() {
  const g = canvas(1600, 1180);
  const D = M.dual, C = M.coreR, half = halfSide();
  g.txt(36, 42, '按用途定形：前面做过的形在 2-15 里各管什么（第三轮线稿 · 2026-10-30）', 20, INK, 'start', 600);
  g.txt(36, 66, '截面是真引擎终态，按 2-15 的缩放换成米（1 引擎 px = 4.08 mm）。E 行是这一轮新量的：2-3 的「一条带两个结构」放进 2-15 的布和方台。F 行是几种用途的侧视与俯视，人、猫、家具只作比例参考。', 12, MUTE);
  g.txt(36, 84, '每台的高度由钉住端（整台升降，2-15 已有）定；同一条带上两块台的高差是布上定死的。蓝 = 这一轮建议加入的，黑 = 2-15 现有的。橙线 = 锁定键。', 12, MUTE);

  // ── E 行：一条带两个结构
  g.txt(36, 122, `E　一条带两个结构（2-3 的做法放进 2-15）· 338 节布全部铺出去，上下两块台各占 131 节，中间贴合 ${D.mid} 节`, 14, INK, 'start', 600);
  const kE = 300, H0 = 0.2, H1 = 1.05, oyE = 170 + H1 * kE;
  const gapM = D.upper.bot - D.lower.top;
  const eP = [
    { t: ['E1　两块都成', '（面档剖面）'], up: true, lo: true, n: [`下台 ${m2(D.lower.bot)}–${m2(D.lower.top)} · 上台 ${m2(D.upper.bot)}–${m2(D.upper.top)}`, `两块台之间空 ${m2(gapM)} m`, '离钉住端量；三档俯视都是那只方台'] },
    { t: ['E2　只成上台', '（下台那段不扣键，贴着立杆）'], up: true, lo: false, n: [`上台 ${m2(D.upper.bot)}–${m2(D.upper.top)}，与 E1 逐点相同`, '中间贴合 ≥ 29 节时上下互不影响', '（皮肤单元lab §15.5，实测相差 0 px）'] },
    { t: ['E3　只成下台', '（上台那段贴着立杆）'], up: false, lo: true, n: [`下台 ${m2(D.lower.bot)}–${m2(D.lower.top)}，与 E1 逐点相同`, `也和 2-15 现行平台同高（${m2(M.now215)}）`, '一台里每条带可以各选 E1 / E2 / E3 / 不落'] },
  ];
  eP.forEach((p, i) => {
    const x0 = 40 + i * 330, v = view(x0 + 44, oyE, kE);
    g.txt(x0, 148, p.t[0], 13, NEW, 'start', 600); g.txt(x0 + 120, 148, p.t[1], 11, MUTE);
    if (i === 0) ruler(g, v, -0.03, H0, H1, 0.1);
    g.line(v.X(0), v.Y(H0), v.X(0), v.Y(H1), MUTE, 1, '5 3');
    g.line(v.X(C), v.Y(H0), v.X(C), v.Y(H1), INK, 1.2);
    if (p.lo) section(g, v, D.lower, 0, 0, 1, NEW);
    if (p.up) section(g, v, D.upper, 0, 0, 1, NEW);
    if (i === 0) { const xg = v.X(C + D.lower.reach + 0.03); g.line(xg, v.Y(D.lower.top), xg, v.Y(D.upper.bot), NEW, 0.8); g.txt(xg + 5, v.Y((D.lower.top + D.upper.bot) / 2) + 4, m2(gapM), 11, NEW); }
    if (!p.lo) g.txt(v.X(C + 0.02), v.Y((D.lower.top + D.lower.bot) / 2) + 4, '这段布贴着立杆', 10, MUTE);
    if (!p.up) g.txt(v.X(C + 0.02), v.Y((D.upper.top + D.upper.bot) / 2) + 4, '这段布贴着立杆', 10, MUTE);
    p.n.forEach((s, j) => g.txt(x0, v.Y(H0) + 22 + j * 15, s, 11, j ? MUTE : NEW));
  });
  // E4：腔高对比（以下台顶面为 0）
  {
    const x0 = 1030, kC = 250, base = 400;
    const items0 = 40; // 左边留给腔高读数
    g.txt(x0, 148, 'E4　有顶的地方，三种做法的腔高', 13, NEW, 'start', 600);
    const items = [
      { w: half, gap: M.dbl[60].row[0].upper[0] - M.dbl[60].row[0].lower[1], t: ['双层 · 缝 0.245', '方台大小 · 猫趴得下'], pose: 'lie', c: MUTE },
      { w: M.pinchHalf, gap: 0.41, t: ['大捏分 · 腔 0.41', `外缘半边 ${m2(M.pinchHalf)}，比方台大`], pose: 'sit', c: MUTE },
      { w: half, gap: gapM, t: [`两个结构 · ${m2(gapM)}`, '方台大小 · 猫坐得起来'], pose: 'sit', c: NEW },
    ];
    let ux = x0 + items0;
    for (const it of items) {
      const v = view(ux, base, kC), th = 0.065;
      g.line(v.X(0), v.Y(-0.12), v.X(0), v.Y(0.62), MUTE, 1, '5 3');
      g.rect(v.X(0.03), v.Y(0), (it.w - 0.03) * kC, th * kC, it.c === NEW ? '#dfeaec' : FILL.flat, it.c === NEW ? NEW : MUTE, 0.9);
      g.rect(v.X(0.03), v.Y(it.gap + th), (it.w - 0.03) * kC, th * kC, it.c === NEW ? '#dfeaec' : FILL.flat, it.c === NEW ? NEW : MUTE, 0.9);
      cat(g, v, it.pose === 'lie' ? 0.27 : 0.17, 0, it.pose, 1);
      g.line(v.X(-0.03), v.Y(0), v.X(-0.03), v.Y(it.gap), it.c, 0.8);
      g.txt(v.X(-0.045), v.Y(it.gap / 2) + 4, m2(it.gap), 10, it.c, 'end');
      it.t.forEach((s, j) => g.txt(v.X(0), base + th * kC + 18 + j * 14, s, 11, j ? MUTE : it.c, 'start', j ? 400 : 600));
      ux += (it.w + 0.26) * kC;
    }
    g.txt(x0, base + 80, '腔的两侧都是敞着的（带与带之间只有膜），上台挡的是头顶。大捏分的 0.41 量在腔口中线处，往里变矮。', 11, MUTE);
    g.txt(x0, base + 95, '猫的比例取站上的方块猫（背高约 0.22、坐着耳尖约 0.29）。', 11, MUTE);
    g.txt(x0, base + 110, '台面进深只有 0.23–0.36 m，趴着的猫实际是沿一圈横着趴。', 11, MUTE);
  }

  // ── F 行：用途
  const yF = 540;
  g.txt(36, yF, 'F　几种用途（侧视为过立杆的剖面，俯视小图里蓝 = 两块都成、「下」= 只成下台）', 14, INK, 'start', 600);
  const kF = 190, floorY = 870;
  const eyeSit = 1.16; // 站上比例模型（figure.ts）坐在 0.43 的沙发上，头枢轴 1.074 m，眼睛约高 0.09
  /** 一台两个结构：near = 朝沙发那半圈只成下台，far = 两块都成 */
  const dualUnit = (v, cx, foot) => {
    const top = Math.min(1.45, foot + D.bandTop);
    g.line(v.X(cx), v.Y(foot), v.X(cx), v.Y(1.45), MUTE, 1, '5 3');
    for (const s of [-1, 1]) g.line(v.X(cx + s * C), v.Y(foot), v.X(cx + s * C), v.Y(top), INK, 1.2);
    section(g, v, D.lower, cx, foot, -1, NEW); section(g, v, D.lower, cx, foot, 1, NEW); section(g, v, D.upper, cx, foot, 1, NEW);
  };
  const inset = (ox, oy, k, kinds, cats, seat) => {
    unitPlan(g, ox, oy, k, kinds);
    if (seat) g.rect(ox + seat[0] * k - 0.13 * k, oy - 0.11 * k, 0.26 * k, 0.22 * k, PERSON, 'none', 0);
    for (const [r, a] of cats) { const x = ox + r * k * Math.cos(a), y = oy + r * k * Math.sin(a); g.rect(x - 0.06 * k, y - 0.06 * k, 0.12 * k, 0.12 * k, CAT, 'none', 0); if (seat) g.line(ox + seat[0] * k, oy, x, y, PERSON, 0.9, '4 3'); }
  };
  const nearKinds = BAND_ANG.map((a) => (Math.cos(a) < -0.55 ? 'lower' : 'dbl'));

  // F1 茶几 + 猫的高台
  {
    const x0 = 40, v = view(x0 + 0.85 * kF, floorY, kF);
    g.txt(x0, yF + 30, 'F1　茶几 + 猫的高台（一台两用）', 13, NEW, 'start', 600);
    floor(g, v, -0.85, 1.25); ruler(g, v, -0.87, 0, 1.4, 0.2);
    sofa(g, v, 0, 1);
    const cx = 0.38 + half, foot = 0.42 - D.lower.top, upTop = foot + D.upper.top;
    dualUnit(v, cx, foot);
    g.rect(v.X(cx - C - 0.17), v.Y(0.42 + 0.09), 0.07 * kF, 0.09 * kF, 'none', INK, 1);
    const catX = cx + C + 0.1; cat(g, v, catX, upTop, 'sit', -1);
    g.txt(v.X(cx - C - 0.11), v.Y(0.42) + 30, '茶几 0.42', 11, NEW, 'middle');
    tag(g, v, cx + half + 0.02, upTop, `猫的台 ${m2(upTop)}`, NEW, 1, 0.04);
    g.line(v.X(-0.4), v.Y(eyeSit), v.X(catX - 0.08), v.Y(upTop + 0.21), PERSON, 1, '4 3');
    console.log(`\n用途线稿 F1：钉住端 ${m2(foot)}，上台顶 ${m2(upTop)}，猫眼约 ${m2(upTop + 0.21)}，坐着的人眼约 ${eyeSit}，两者水平相距 ${m2(catX - 0.08 + 0.4)} m`);
    inset(260, yF + 70, 60, nearKinds, [[C + 0.15, -1.0], [C + 0.15, 1.0]], [-(cx + 0.3), 0]);
    g.txt(300, yF + 50, '俯视', 10, MUTE);
    const L = ['靠沙发的六条带只成下台，当茶几。其余两块都成，上台给猫。', `猫坐在上台，眼睛约 ${m2(upTop + 0.21)} m，与坐着的人眼睛（约 ${eyeSit}）同高，`, '隔着茶几相距约 1.3 m。茶几那几条带头顶没有台，杯子照放。', '剖面上猫画在立杆后面只为看高度，实际坐在两侧（俯视小图）。'];
    L.forEach((s, j) => g.txt(x0, floorY + 24 + j * 15, s, 11, j ? MUTE : INK));
  }
  // F2 有顶的一台
  {
    const x0 = 540, v = view(x0 + 0.85 * kF, floorY, kF);
    g.txt(x0, yF + 30, 'F2　有顶的一台（引路的终点：猫陪坐着的人）', 13, NEW, 'start', 600);
    floor(g, v, -0.85, 1.5);
    sofa(g, v, 0, 1, 0.55);
    const cx = 0.85, lowTop = 0.72, foot = lowTop - D.lower.top, upTop = foot + D.upper.top;
    dualUnit(v, cx, foot);
    cat(g, v, cx + C + 0.1, lowTop, 'sit', -1);
    tag(g, v, cx - half - 0.02, lowTop, m2(lowTop), NEW, -1, 0.04); tag(g, v, cx + half + 0.02, upTop, m2(upTop), NEW, 1, 0.04);
    inset(740, yF + 70, 60, nearKinds, [[C + 0.13, 0.9]], [-(cx + 0.3), 0]);
    g.txt(780, yF + 50, '俯视', 10, MUTE);
    const L = ['朝座位那半圈只成下台（敞开），背后那半圈两块都成（有顶）。', '猫从背后进有顶的那半，出来就朝着坐着的人，入口不止一个。', `上台顶 ${m2(upTop)} 也能趴（Ellis 等 2013：箱顶再放一层可趴的台）。`, `高度是示意：钉住端整台升降，下台可取 ${m2(D.lower.top)} 以上，上台总在它上面 ${m2(D.upper.top - D.lower.top)}。`];
    L.forEach((s, j) => g.txt(x0, floorY + 24 + j * 15, s, 11, j ? MUTE : INK));
  }
  // F3 靠过道的台角变圆（俯视）
  {
    const x0 = 1060, k = 150, cy = yF + 180;
    g.txt(x0, yF + 30, 'F3　人常站的过道交叉点旁边，台角变圆（俯视）', 13, NEW, 'start', 600);
    const P = M.pitch / 2;
    const draw = (ox, reach, label, color) => {
      g.txt(ox - (P + half) * k, yF + 60, label, 12, color, 'start', 600);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const ux = ox + sx * P * k, uy = cy + sy * P * k;
        const tips = BAND_ANG.map((a, i) => { const r = (C + reach[CLASS[i]]) * k; return [ux + r * Math.cos(a), uy + r * Math.sin(a)]; });
        g.poly(tips, MUTE, 0.9, color === NEW ? '#dfeaec' : FILL.flat, true);
        for (let i = 0; i < 20; i++) g.line(ux + C * k * Math.cos(BAND_ANG[i]), uy + C * k * Math.sin(BAND_ANG[i]), tips[i][0], tips[i][1], MUTE, 0.5);
        g.svg.push(`<circle cx="${f1(ux)}" cy="${f1(uy)}" r="${f1(C * k)}" fill="${PAPER}" stroke="${MUTE}" stroke-width="0.8"/>`);
      }
      g.svg.push(`<circle cx="${f1(ox)}" cy="${f1(cy)}" r="${f1(M.bodyR * k)}" fill="${PERSON}" fill-opacity="0.35" stroke="${PERSON}" stroke-width="1"/>`);
      const gap = M.pitch / Math.SQRT2 - (C + reach[2]);
      g.txt(ox, cy + P * k + 0.42 * k, `台角到交叉点 ${m2(gap)} m`, 11, color, 'middle');
      return gap;
    };
    const gs = draw(x0 + 125, M.morph[4], '方（现行）', INK);
    const gr = draw(x0 + 125 + 2 * (P + half) * k + 20, M.morph[0], '圆（2-7 圆↔方的一端）', NEW);
    const L = [`圆圈 = 站着的人（身体半径 ${M.bodyR} m）。方台四个角正对交叉点，`, `角离交叉点 ${m2(gs)} m，人一站就顶到，2-15 现在是把那条带收回去。`, `四个角改小（角档 k ${M.morphK[4][2]} → ${M.morphK[0][2]}）就是 ${m2(gr)} m，站得下。`, '代价：这几台俯视不再是方的（作者 10-25 定房间里用方台）。', '中间三档（微方 / 半方 / 近方）也都能做，6.5 cm 台 k 24–46 全部成形。'];
    L.forEach((s, j) => g.txt(x0, floorY + 24 + j * 15, s, 11, j ? MUTE : INK));
  }

  // ── G：去向表
  const yG = 990;
  g.txt(36, yG, 'G　前面每一台研究在 2-15 里的去向（详见方案稿 §11）', 14, INK, 'start', 600);
  const G = [
    ['2-1 / 2-2 目录四形', '阶梯方箱 = 现在的平台。袋要另一个收缩深度（0.66，一台只有一个），不进。蘑菇挑台、直挑台在 2-15 尺寸能成，但顶面是弧的或斜的，桌子和猫的台方台都做得更好，留在案例页讲成形。'],
    ['2-3 一条带两个结构', 'E 行：两层台。猫的高台（F1）、有顶的一台（F2）、上下各给一只猫。'],
    ['2-4 / 2-5 渐变与捏分', '十级捏分 = 双层的层间距（0.12–0.24，第二轮）。渐变本身留在案例页讲成形过程。'],
    ['2-5 / 2-7 一圈起伏', '逐带配平偏移：一台之内台面沿一圈升降 0.40 m，用于续坡、台面有高有低（第二轮）。'],
    ['2-6 多层台', '双层、厚台、半台、三分之一、仅上层 / 仅下层、层间距（第二轮已在 2-15 尺寸量过，仅上 / 仅下现在可以用 E2 / E3 做得严丝合缝）。'],
    ['2-7 方形环', '方台 = 现在的平台。圆 ↔ 方 = F3。一次循环的大捏分 = 腔 0.41 的那种有顶（E4）。'],
    ['2-8 / 2-9', '2-8 是 2-15 房间与尺度的来处。2-9 的错层 = 台阶，错相 = 引路一次落一步（已在规则里），相切、交叠在固定格子里做不出（台缝 0.13 m）。'],
    ['2-10 / 2-11 / 2-12 / 2-14', '判断「为什么落」的那一层，已在用。'],
    ['2-13 单元组合', '续坡、三段坡、台阶、升台、合腔、凹、拱（第二轮 D 行）。'],
  ];
  G.forEach(([a, b], j) => { g.txt(40, yG + 24 + j * 18, a, 11, INK, 'start', 600); g.txt(220, yG + 24 + j * 18, b, 11, MUTE); });
  g.svg.push('</svg>');
  return g.svg.join('\n');
}

const sheets = [['form-sections', sheetSections()], ['form-room', sheetRoom()], ['form-uses', sheetUses()]];
for (const [name, text] of sheets) writeFileSync(join(OUT, `${name}.svg`), text);
try {
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  for (const [name, text] of sheets) {
    const w = +text.match(/width="(\d+)"/)[1], h = +text.match(/height="(\d+)"/)[1];
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1.5 });
    await p.setContent(text);
    await p.screenshot({ path: join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: w, height: h } });
  }
  await b.close();
} catch (e) {
  console.log('（没装 playwright，只出 SVG；要 PNG 用浏览器打开 SVG 截图）');
}
console.log(`\n→ ${sheets.map(([n]) => join(OUT, `${n}.svg`)).join(' · ')}`);
