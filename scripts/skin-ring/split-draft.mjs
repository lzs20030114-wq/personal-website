// 方形环 · 捏分编制——硬机制审计 + 线稿工具（2026-09-01）
//
// 用法： npx vite-node scripts/skin-ring/split-draft.mjs <out.svg> [audit|draft]
//   audit = 打印材料账推导、预算对照、三档标定扫掠、关键指标
//   draft = 出线稿 SVG（默认）
//
// ## 上一轮否决的两条硬事实——复查结论
//
// ① **「缝把箱撑高」成立，但可以消掉**：捏分族 H = 2·台高 + 缝宽（台高钉死 12、
//    缝 0→28 ⇒ H 24→52）。改成 **H 钉死、缝宽换台高**（LOBE(t) = (H−w)/2）后
//    H 一圈恒定，方形族「高度不变」的前提不破。这才是字面意义的「捏」——
//    材料被捏开，台变薄，总高不变。
// ② **「深箱 + 深缝装不下」成立，且是几何硬约束**（不是调参问题），但**预算记错了**：
//    107 是 **Lab.12 自己的分配**（lead 8 / tail 53 / 200 节带）；方形环在 202 节带上
//    本来就有 **133** 节（lead 22 / tail 15）。用环族自己的分配 ⇒ 不必加长带子（D 不必走）。
//
// ## 材料账（本轮推导，下方 audit 用实测对照）
//
// 一条自由段的材料 = 结构周长 + 两端缓冲。结构半跨（节）：
//     M = 挑出/2 + 台高/2 + 缝深/2 + 缝尖宽/4          （1 节 = 2px 织物）
// 缓冲要跨过「自由段轴向跨度 − 箱高」并留折叠余量 e：4·BUF − (1.2·(M+BUF) − H) ≥ e
//   ⇒ 2.8·BUF ≥ 1.2M + e − H；自由段 free = 2(M+BUF)+1 ≤ F_TOT ⇒ M + BUF ≤ (F_TOT−1)/2
// 联立消去 BUF：
//     **M ≤ (1.4·F_TOT + H − 1.4 − e) / 4**      （F=133 · H=36 · e=12 ⇒ M ≤ 52.2）
// 满裂（缝深 = 箱深 = D）时 M = D + H/4（**与缝宽无关**——缝宽只在台高与缝之间分配），
// 代入，H 在两边正好抵消：
//     **满裂平台的设计深度 D ≤ (1.4·F_TOT − 1.4 − e)/4，与箱高无关**（F=133 ⇒ D ≤ 43.2px）
// 实测挑出比设计深度鼓出约 +4（等长键箱的充气量），故面档实测天花板 47.1px。
// 两条口径说明（2026-09-01 复核补）：
//  · 本族取 wallN = 缝深/2，略去了 Lab.12 那个锥度项 round(hypot(dv,(w−wt)/2)/2)——
//    本族缝窄（终态 wt=w ⇒ 锥度为 0；t=0.5 时锥度 1.1 对 27.7 可忽略），故两者同值。
//    Lab.12 那边锥度不可略，且它九个刻缝级里七个 wallN 是手调的，闭式不预测它的代码。
//  · 「与缝宽无关」在连续量上严格成立，落到整数节点有 ±1 节（±2px）的取整残差；
//    本族用到的缝宽 8/12/16/20 恰好两处都整除（a+faceN 恒 9），实测挑出 47.0–47.2 逐档同。
// 校验：面档定案 M=52、BUF=14、free=133 —— 恰好落在 52.2 的上限内，且 M+BUF=66=(133−1)/2。
// （上式的常数项 2026-09-01 经复核修正：原写 (1.4F+H−2−1.4e)/4 = 50.8，比实测的 M=52 还小，
//   是自相矛盾的——正确的是 (1.4F+H−1.4−e)/4。）
//
// 推论（4 重是被强制的，不是编制选择）：方形里最深的平台在角上、最浅在面上，
// 而「挑得远」与「缝得深」抢同一份材料 ⇒ **缝只能在面档最深、角档为零**，
// 恰好是方形的 4 重对称。1 重镜像编制会把 L7 押上角档、2 重会押 L4，材料账都不够。
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN, SKIN_ROOT_FIX } from '../../src/lib/space/skin-unit.ts';
import { silhouette } from '../../src/lib/space/skin-split.ts';
import {
  SQUARE, SQUARE_RUNGS, SQUARE_PW, buildSquareOrder, squareAngle, squareBuffer, squareFree,
  squareFreeTotal, squareLead, squareSpec, squareDepthK, squareReachOf, SQUARE_TIERS,
} from '../../src/lib/space/skin-square.ts';
import { skinSiteOpts, SKIN_UNITS } from '../../src/lib/space/skin-data.ts';
import { SQSPLIT, SQSPLIT_TIERS, sqSplitBuild } from '../../src/lib/space/skin-square-split.ts';
import { RING_BAND_NODES } from '../../src/lib/space/skin-ring.ts';

const OUT = process.argv[2] ?? 'split-square.svg';
const MODE = process.argv[3] ?? 'draft';
const STEPPED = SKIN_UNITS.find((d) => d.key === 'stepped');

// ── 恒高捏分族（原型；拍板后并入 src/lib/space/，与站上共用一份）──────────────
const H = SQUARE.H; // 箱高一圈恒定 = 方形族的定义
const F_TOT = squareFreeTotal(); // 133 —— 与平档同一份分配 ⇒ 平台高度逐位相同
const LEAD = squareLead();
const R1 = SKIN.R1;

/** 形态时间表：缝宽（张得快）· 缝深（退得稳）· 缝尖宽/缝嘴宽 —— 沿用捏分族原式 */
const seamW = (t, wEnd) => wEnd * Math.pow(t, 0.7);
const sqSplitSeamWLocal = (t, wEnd) => (t <= 0 ? 0 : seamW(t, wEnd));
const seamSink = (t, D) => D * Math.pow(t, 1.2);
const tipRatio = (t) => 0.4 + 0.6 * t;

/** 缓冲：折得起来（余量 ≥ e）且住得下（间隙 ≥ g） */
function bufFor(M, e = SQUARE.E_MIN, g = SQUARE.G_MIN, hBox = H) {
  let b = SQUARE.BUF_MIN;
  for (; b < 60; b++) {
    const span = 1.2 * (M + b);
    if (span - hBox >= g && 4 * b - (span - hBox) >= e) break;
  }
  return b;
}
/** 材料账天花板：M 的上限（解析）。slack ≥ e 与 free ≤ F_TOT 联立消去 BUF */
const mCap = (fTot = F_TOT, e = SQUARE.E_MIN) => (1.4 * fTot + H - 1.4 - e) / 4;
/** 满裂平台的设计深度上限（解析）——H 在两边抵消 ⇒ 与箱高无关 */
const dCap = (fTot = F_TOT, e = SQUARE.E_MIN) => mCap(fTot, e) - H / 4;

/** 七段谱（对位构造 v4：配平垫劈两半夹结构，与平档同构） */
function wrapRing(seg) {
  const free = seg[1];
  const pad = F_TOT - free;
  if (pad < 0) throw new Error(`结构自由段 ${free} 超出 F_TOT ${F_TOT}`);
  if (pad % 2 !== 0) throw new Error(`配平垫 ${pad} 非偶数`);
  const half = pad / 2;
  const tail = RING_BAND_NODES - 2 * SQUARE.ISO - F_TOT - LEAD;
  const base = LEAD + half + SQUARE.ISO;
  return {
    spec: half > 0
      ? [['g', LEAD], ['f', half, []], ['g', SQUARE.ISO], seg, ['g', SQUARE.ISO], ['f', half, []], ['g', tail]]
      : [['g', LEAD + SQUARE.ISO], seg, ['g', SQUARE.ISO + tail]],
    base: half > 0 ? base : LEAD + SQUARE.ISO,
  };
}

/** 10 根梯挡，最内钉在端面板端点 f（端面硬投影的触发条件），最外 = M */
const ladder = (f, M) => [
  ...new Set(Array.from({ length: SQUARE_RUNGS }, (_, i) => Math.round(f + ((M - f) * i) / (SQUARE_RUNGS - 1)))),
];

/**
 * 一档一级：目标挑出 D（px）+ 形态参数 t。
 * t=0 走平档原谱（方形族同一份实现）；t>0 是刻缝方箱，箱高恒 H、缝宽换台高。
 */
function build(D, t, opt = {}) {
  const wEnd = opt.wEnd ?? 12;
  // **定案路径委托给站上模块**（§17 纪律：线稿与站上共用一份实现——留两份必然漂，
  // 本轮搬运时就漂过一次：tether 的 D 填成标定第一遍的 46 而非自洽后的 46.8，少 0.3px）。
  // 下面那份本地构造只服务**探索用的旋钮**（varH 走出路 C 的对照、lvl / attNear /
  // wallStep / 缓冲覆写 / formLikeSplit），那些不进 src/。
  const EXPLORE = ['varH', 'lvl', 'attNear', 'wallStep', 'buf', 'e', 'g', 'formLikeSplit'];
  if (!EXPLORE.some((k) => opt[k] !== undefined)) {
    const b = sqSplitBuild({ name: '·', en: 'x', count: 0, t, D, boxD: opt.boxD, k: opt.k }, wEnd);
    return { t, D, boxD: opt.boxD ?? null, k: opt.k ?? null, wEnd, ...b, M: null, buf: null, seam: sqSplitSeamWLocal(t, wEnd), lobe: (H - sqSplitSeamWLocal(t, wEnd)) / 2, dv: seamSink(t, D), hBox: H };
  }
  if (t <= 0) {
    // 角档 = 方形族原谱（只是浅一档）——构造完全复用，不另写一份
    const k = opt.k ?? squareDepthK(D);
    const b = squareBuffer(k);
    const free = squareFree(k, b);
    const base = LEAD + (F_TOT - free) / 2 + SQUARE.ISO; // 结构段起点（量窗口用，别从垫上量）
    // 成形选项：平档原样（一瞬全锁）还是与带缝两档同一套成形设计（逐挡长出）——
    // 一圈里混用会让 4 个角位在别人都成形后还是没成形的波浪管（frames 模式实测）
    const fopts = opt.formLikeSplit
      ? { ...skinSiteOpts(STEPPED), zipUp: [0], attNear: opt.attNear ?? 2.5, attNearChains: [0] }
      : skinSiteOpts(STEPPED);
    return {
      t, D, k, boxD: null,
      spec: squareSpec(k), opts: fopts,
      lead: base, free, buf: b, M: k,
      marks: {
        center: base + (free - 1) / 2,
        faceA: base + (free - 1) / 2 - SQUARE_PW, faceB: base + (free - 1) / 2 + SQUARE_PW,
        outA: base + (free - 1) / 2 - k, outB: base + (free - 1) / 2 + k,
      },
      seam: 0, lobe: H / 2,
    };
  }
  const w = seamW(t, wEnd);
  const dv = seamSink(t, D);
  const wt = w * tipRatio(t);
  // 两条路线：恒高（缝宽换台高，2·lobe + w = H 恒定）vs 变高（原捏分口径：台高钉死、总高随缝涨）
  const lobe = opt.varH ? opt.varH : (H - w) / 2;
  const hBox = opt.varH ? 2 * opt.varH + w : H;
  const faceN = Math.round(lobe / 2);
  const a = Math.max(1, Math.round(wt / 4));
  const wallN = Math.max(1, Math.round(dv / 2));
  const boxD = opt.boxD ?? Math.round(D / 2) * 2;
  const m = a + wallN; // 缝角
  const f = m + faceN; // 面角
  const M = f + boxD / 2; // 轴嘴
  const buf = opt.buf ?? bufFor(M, opt.e ?? SQUARE.E_MIN, opt.g ?? SQUARE.G_MIN, hBox);
  const free = 2 * (M + buf) + 1;
  const c = buf + M;

  const wv = (w + wt) / 2;
  const wallStep = opt.wallStep ?? 2;
  const crack = [[c - m, c + m, w / 100]];
  for (let k = m - wallStep; k > a + 1; k -= wallStep) crack.push([c - k, c + k, wv / 100]);
  crack.push([c - a, c + a, wt / 100]);
  const faceUp = [[c - f, c - m, lobe / 100]];
  const faceDn = [[c + m, c + f, lobe / 100]];
  const panels = [[c - f, c - m], [c + m, c + f], [c - a, c + a]];
  const bonds = ladder(f, M).map((k) => [c - k, c + k, hBox / 100]);
  const seg = ['f', free, bonds, panels, [crack, faceUp, faceDn]];
  const { spec, base } = wrapRing(seg);

  const c0 = base + c;
  const rTip = (D - dv) / 100;
  const tether = [];
  for (let k = -a; k <= a; k++) tether.push([c0 + k, rTip]);
  for (let k = a + 1; k <= m; k++) {
    const r = rTip + ((k - a) * (D / 100 - rTip)) / wallN;
    tether.push([c0 + k, r], [c0 - k, r]);
  }
  const crease = [];
  for (let j = c0 - m + 1; j < c0 + m; j++) {
    if (j < c0) crease.push([j, c0 - m, 0]);
    else if (j > c0) crease.push([j, c0 + m, 0]);
    else crease.push([j, c0 - m, 0], [j, c0 + m, 0]);
  }
  return {
    t, D, boxD, M, buf, free, lead: base, seam: w, lobe, dv, hBox, varH: opt.varH, k: null,
    spec,
    opts: {
      ...SKIN_ROOT_FIX, anchorEnd: true, boxSquare: true, zipUp: [0],
      // 吸引近程门：**2.5 是本族实测值，不是从 Lab.12 搬的 1.5**——搬过来反而
      // 造出卷钩（环 45 @step471，上半瓣单侧卷；2.0/2.5 → 环 0，Δ 与关掉时同）。
      // 门限按 rb 倍数算，而本族 rb = H/100 = 0.36 ⇒ 1.5 只有 54px，比箱子自己
      // （36 高 × 45 深）还小，把正当的吸引一起掐了。跨族搬实测值前先在本族测一次。
      attNear: opt.attNear ?? 2.5, attNearChains: [0], sqChains: [0],
      ...(opt.lvl ? { levelChains: [1] } : {}),
      coreTether: tether, coreTetherRel: crease,
      alignRuns: [[c0 - m, c0 - a], [c0 + a, c0 + m]],
    },
    marks: {
      center: c0, mouthA: c0 - m, mouthB: c0 + m,
      faceA: c0 - f, faceB: c0 + f, outA: c0 - M, outB: c0 + M,
    },
  };
}

/** 目标线（箱高恒 H；缝嘴 w、尖宽 wt、退距 dv） */
function targetAt(t, D, wEnd = 12, varH = 0) {
  const w = seamW(t, wEnd);
  const dv = seamSink(t, D);
  const wt = w * tipRatio(t);
  const y0 = -(varH ? 2 * varH + w : H) / 2;
  const p = [[0, y0], [D, y0]];
  if (w > 0.5) p.push([D, -w / 2], [D - dv, -wt / 2], [D - dv, wt / 2], [D, w / 2]);
  p.push([D, -y0], [0, -y0]);
  return p;
}

// ── 测量（口径照 skin-split.test.ts / levels.mjs）───────────────────────────
function knotSpan(p) {
  const hit = (a, b, c, d) => {
    const s1x = b[0] - a[0], s1y = b[1] - a[1], s2x = d[0] - c[0], s2y = d[1] - c[1];
    const den = -s2x * s1y + s1x * s2y;
    if (Math.abs(den) < 1e-12) return false;
    const s = (-s1y * (a[0] - c[0]) + s1x * (a[1] - c[1])) / den;
    const t = (s2x * (a[1] - c[1]) - s2y * (a[0] - c[0])) / den;
    return s > 0 && s < 1 && t > 0 && t < 1;
  };
  let span = 0;
  for (let i = 0; i + 1 < p.length; i++)
    for (let j = i + 2; j + 1 < p.length; j++) if (hit(p[i], p[i + 1], p[j], p[j + 1])) span = Math.max(span, j - i);
  return span;
}

function run(lv, opts = {}) {
  const s = createSkinUnit(lv.spec, lv.opts);
  let knot = 0;
  let knotAt = 0;
  let peak = 0; // 全程峰值挑出（格距按它定——Lab.10 §14.2「必须按全程量不是终态」）
  let last = 0;
  let n = 0;
  const checks = opts.checks ?? [];
  const every = opts.dense ?? 25;
  const at = {};
  for (let k = 0; k < SKIN.STEPS; k++) {
    s.advance();
    if (s.locked.length > n) { n = s.locked.length; last = k + 1; }
    if (k % every === 0) {
      const seg = [];
      for (let i = lv.lead; i < lv.lead + lv.free; i++) seg.push([s.px[i], s.py[i]]);
      const q = knotSpan(seg);
      if (q > knot) { knot = q; knotAt = k + 1; }
      for (const [x] of seg) peak = Math.max(peak, x * 100);
    }
    if (checks.includes(k + 1)) at[k + 1] = (s.py[lv.marks.center] - s.py[s.n - 1]) * 100;
  }
  const px = (i) => s.px[i] * 100;
  const py = (i) => -s.py[i] * 100;
  const cy = py(lv.marks.center);
  const prof = [];
  let reach = 0, y0 = Infinity, y1 = -Infinity;
  for (let i = lv.lead; i < lv.lead + lv.free; i++) {
    prof.push([px(i), py(i) - cy]);
    reach = Math.max(reach, px(i));
    if (px(i) > 5) { y0 = Math.min(y0, py(i)); y1 = Math.max(y1, py(i)); }
  }
  let total = 0;
  for (const ch of s.chains) total += ch.length;
  // ── 箱高 / 水平度：**照 Lab.14 守门的口径**（skin-square.test.ts:96-116），
  //    不是含端面的 max−min。守门排除端面那一段（端面的 y 跨半个箱高，混进来会把
  //    水平度读成 ~H/2），只取 x ∈ [0.35, 0.85]·挑出。捏分剖面有四个水平面而不是
  //    两个（外顶 / 上缝壁 / 下缝壁 / 外底），故取**外包络**：只采外顶面与外底面
  //    那两段节点（嘴↔面角），缝壁不进账——外包络才是「一圈上下缘」那件事。
  const seg2 = (lo, hi) => {
    const v = [];
    for (let i = lo; i <= hi; i++) if (px(i) >= 0.35 * reach && px(i) <= 0.85 * reach) v.push(py(i));
    return v;
  };
  const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
  const rng = (v) => (v.length ? Math.max(...v) - Math.min(...v) : NaN);
  const topV = seg2(lv.marks.outA, lv.marks.faceA);
  const botV = seg2(lv.marks.faceB, lv.marks.outB);
  const boxH = mean(botV) - mean(topV);
  const half = (lv.hBox ?? H) / 2 + 4;
  const A = silhouette(prof, -half, half);
  const B = silhouette(targetAt(lv.t, lv.D, lv.wEnd ?? 12, lv.varH ?? 0), -half, half);
  let sum = 0;
  for (let i = 0; i < A.length; i++) sum += Math.abs(A[i] - B[i]);
  return {
    lv, prof, reach, height: y1 - y0,
    mouth: lv.t > 0 ? Math.abs(py(lv.marks.mouthB) - py(lv.marks.mouthA)) : 0,
    locked: s.locked.length, total, last, knot, knotAt, peak,
    boxH, topFlat: rng(topV), botFlat: rng(botV), topMean: mean(topV), botMean: mean(botV),
    silD: sum / A.length,
    align: (s.py[lv.marks.center] - s.py[s.n - 1]) * 100,
    at,
    // 结构上下缘离带子下缘（上下缘齐不齐 = 这一族的关键指标）
    edgeTop: (s.py[s.n - 1] - 0) * 0,
    topY: (s.py[s.n - 1] * 100 + y1), botY: (s.py[s.n - 1] * 100 + y0),
  };
}

// ── 标定：a（半边长）由面档满裂的材料天花板定 ────────────────────────────────
const R = SQUARE.RADIUS;
/** 边档的形态位置（0 = 单箱，1 = 满裂）——一圈四个来回的中间那一站，拍板项 */
const EDGE_T = Number(process.env.EDGE_T ?? 0.5);
const TH_FACE = Math.PI / SQUARE.COUNT * 1;   //  9°
const TH_EDGE = Math.PI / SQUARE.COUNT * 3;   // 27°
const TH_CORN = Math.PI / SQUARE.COUNT * 5;   // 45°
const tiersFor = (a) => ({
  face: a / Math.cos(TH_FACE) - R,
  edge: a / Math.cos(TH_EDGE) - R,
  corner: a / Math.cos(TH_CORN) - R,
});

/**
 * 一档的标定：`D` = 几何目标挑出（tether/目标线用），`boxD` = 箱设计深度（调参旋钮）。
 * 两者是**独立的两个量**（Lab.12 同款：SPLIT_DEPTH 40 管 tether，boxD 36 管扇形）；
 * 等长键箱终态比设计值鼓一截，故 boxD 要扫出来，不能直接拿目标值当设计值。
 */
/** 等长键箱终态比设计值鼓出的量（实测 t=1 约 +4.7、t=0.5 约 +6.2）——只用来收窄搜索范围 */
const PUFF = 6;
function fitTier(Dwant, t, log = () => {}, opt = {}) {
  const cands = [];
  const lo = Math.max(8, Math.round((Dwant - PUFF - 6) / 2) * 2);
  for (let boxD = lo; boxD <= lo + 16; boxD += 2) {
    let lv;
    try { lv = build(Dwant, t, { ...opt, boxD }); } catch { continue; }
    if (lv.free > F_TOT) continue;
    const m = run(lv, { dense: 10 });
    cands.push({ boxD, lv, m });
    log(`    boxD${boxD}: 挑出 ${m.reach.toFixed(1)} 高 ${m.height.toFixed(1)} 缝 ${m.mouth.toFixed(1)} free ${lv.free} 锁 ${m.locked}/${m.total} 结 ${m.knot} Δ ${m.silD.toFixed(2)}`);
  }
  const clean = cands.filter((c) => c.m.locked === c.m.total && c.m.knot <= 6);
  if (!clean.length) return null;
  return clean.reduce((x, y) => (Math.abs(y.m.reach - Dwant) < Math.abs(x.m.reach - Dwant) ? y : x));
}

function calibrate(log = () => {}, verbose = false) {
  const vlog = verbose ? log : () => {};
  log(`材料账天花板：M ≤ ${mCap().toFixed(1)} 节 ⇒ 满裂挑出 D ≤ ${dCap().toFixed(1)}px（F_TOT ${F_TOT} · H ${H} · 折叠余量 ≥ ${SQUARE.E_MIN}）`);
  // 面档（满裂）：直接扫 boxD 取材料账允许的最深；D（tether 锚）与实测挑出自洽（两遍）
  let best = null;
  for (let boxD = 34; boxD <= 48; boxD += 2) {
    let lv;
    try { lv = build(boxD + PUFF, 1, { boxD }); } catch (e) { log(`  面档 boxD${boxD}: 构造期拒绝 — ${e.message}`); continue; }
    if (lv.free > F_TOT) { log(`  面档 boxD${boxD}: free ${lv.free} > ${F_TOT} ×`); continue; }
    let m = run(lv, { dense: 10 });
    // 第二遍：tether 的 D 对到实测挑出上（自洽）
    try {
      const lv2 = build(Math.round(m.reach * 10) / 10, 1, { boxD });
      if (lv2.free <= F_TOT) { lv = lv2; m = run(lv2, { dense: 10 }); }
    } catch { /* 第二遍装不下就用第一遍 */ }
    log(`  面档 boxD${boxD}: 挑出 ${m.reach.toFixed(1)} 高 ${m.height.toFixed(1)} 缝 ${m.mouth.toFixed(1)} free ${lv.free} 缓冲 ${lv.buf} 锁 ${m.locked}/${m.total}@${m.last} 结 ${m.knot} Δ ${m.silD.toFixed(2)}`);
    if (m.locked === m.total && m.knot <= 6 && (!best || m.reach > best.m.reach)) best = { boxD, lv, m };
  }
  if (!best) throw new Error('面档无干净候选');
  const a = (best.m.reach + R) * Math.cos(TH_FACE);
  const T = tiersFor(a);
  log(`\n面档定 boxD${best.boxD}（实测挑出 ${best.m.reach.toFixed(1)}）⇒ 半边长 a ${a.toFixed(1)} · 边长 ${(2 * a).toFixed(0)}px（现行平档 169px）`);
  log(`三档目标挑出：面 ${T.face.toFixed(1)} · 边 ${T.edge.toFixed(1)} · 角 ${T.corner.toFixed(1)}`);
  vlog('  边档:');
  const edge = fitTier(T.edge, EDGE_T, vlog);
  if (!edge) throw new Error('边档无干净候选');
  log(`边档定 boxD${edge.boxD}：挑出 ${edge.m.reach.toFixed(1)}（差 ${(edge.m.reach - T.edge).toFixed(1)}） 高 ${edge.m.height.toFixed(1)} 缝 ${edge.m.mouth.toFixed(1)} 锁 ${edge.m.locked}/${edge.m.total} 结 ${edge.m.knot} Δ ${edge.m.silD.toFixed(2)}`);
  // 角档也吃同一套成形设计：终态逐位相同（实测挑 77.9/高 36.3/锁 10 全等），
  // 但一圈二十条的成形节奏对得上——混用会让 4 个角位在别人都成形后还是波浪管
  const cLv = build(T.corner, 0, { formLikeSplit: process.env.CORNER_FLAT !== '1' });
  const cM = run(cLv, { dense: 10 });
  log(`角档定 k${cLv.k}：挑出 ${cM.reach.toFixed(1)}（差 ${(cM.reach - T.corner).toFixed(1)}） 高 ${cM.height.toFixed(1)} 锁 ${cM.locked}/${cM.total} 结 ${cM.knot} Δ ${cM.silD.toFixed(2)}`);
  return { a, T, face: best, edge, corner: { lv: cLv, m: cM } };
}

// ── probe：单档大图 + 成形六帧（破案工具，§16.3 第 3 件）────────────────────
if (MODE === 'probe') {
  const D = Number(process.argv[4] ?? 40);
  const t = Number(process.argv[5] ?? 1);
  const over = process.argv[6] ? JSON.parse(process.argv[6]) : {};
  const lv = build(D, t, over);
  lv.wEnd = over.wEnd ?? 12;
  const SNAP = [300, 500, 700, 900, 1100, 1500];
  const s = createSkinUnit(lv.spec, lv.opts);
  const frames = [];
  for (let k = 0; k < SKIN.STEPS; k++) {
    s.advance();
    if (SNAP.includes(k + 1)) {
      const seg = [];
      for (let i = lv.lead; i < lv.lead + lv.free; i++) seg.push([s.px[i] * 100, -s.py[i] * 100]);
      frames.push({ step: k + 1, seg, locked: s.locked.length });
    }
  }
  // 自交定位：找出最大环的那一对线段
  const findKnot = (p) => {
    const hit = (a, b, c, d) => {
      const s1x = b[0] - a[0], s1y = b[1] - a[1], s2x = d[0] - c[0], s2y = d[1] - c[1];
      const den = -s2x * s1y + s1x * s2y;
      if (Math.abs(den) < 1e-12) return false;
      const q = (-s1y * (a[0] - c[0]) + s1x * (a[1] - c[1])) / den;
      const r = (s2x * (a[1] - c[1]) - s2y * (a[0] - c[0])) / den;
      return q > 0 && q < 1 && r > 0 && r < 1;
    };
    let best = null;
    for (let i = 0; i + 1 < p.length; i++)
      for (let j = i + 2; j + 1 < p.length; j++)
        if (hit(p[i], p[i + 1], p[j], p[j + 1]) && (!best || j - i > best[1] - best[0])) best = [i, j];
    return best;
  };
  console.log(`probe D${D} t${t} ${JSON.stringify(over)} — M ${lv.M} buf ${lv.buf} free ${lv.free} 缝 ${lv.seam?.toFixed(1)} 台高 ${lv.lobe?.toFixed(1)}`);
  const sv = [];
  const PW = 300, PH = 380, SC = 2.2;
  let X = 0;
  for (const fr of frames) {
    const kn = findKnot(fr.seg);
    // 每帧按自己的包围盒居中（不加平滑，原始折线——§16.3）
    let yLo = Infinity, yHi = -Infinity;
    for (const [, y] of fr.seg) { yLo = Math.min(yLo, y); yHi = Math.max(yHi, y); }
    const ox = 40 + X * PW;
    const oy = 40 + (PH - 90) / 2 - ((yLo + yHi) / 2) * SC;
    const P = ([x, y]) => `${(ox + x * SC).toFixed(1)},${(oy + y * SC).toFixed(1)}`;
    sv.push(`<line x1="${ox}" y1="${oy + yLo * SC - 10}" x2="${ox}" y2="${oy + yHi * SC + 10}" stroke="#bbb"/>`);
    sv.push(`<polyline points="${fr.seg.map(P).join(' ')}" fill="none" stroke="#444" stroke-width="0.9"/>`);
    if (kn) sv.push(`<polyline points="${fr.seg.slice(kn[0], kn[1] + 2).map(P).join(' ')}" fill="none" stroke="#d33" stroke-width="1.8"/>`);
    sv.push(`<text x="${ox}" y="${PH - 22}" font-size="12" fill="#333">step ${fr.step} · 锁 ${fr.locked}${kn ? ` · 环 ${kn[1] - kn[0]} 节` : ' · 无自交'}</text>`);
    console.log(`  step ${String(fr.step).padStart(4)} 锁 ${String(fr.locked).padStart(3)}  ${kn ? `环 ${kn[1] - kn[0]} 节 @[${kn[0]},${kn[1]}]（结构起点 ${lv.buf}，缝心 ${lv.marks.center - lv.lead}）` : '无自交'}`);
    X++;
  }
  writeFileSync(OUT, `<svg xmlns="http://www.w3.org/2000/svg" width="${40 + X * PW}" height="${PH}" font-family="system-ui, sans-serif"><rect width="100%" height="100%" fill="#faf9f6"/>${sv.join('')}</svg>`);
  console.log(`图 ${OUT}`);
  process.exit(0);
}

// ── sweep：配方扫描（密采样瞬态环 + 终态指标），按「先无结、再贴目标线」排序 ──
if (MODE === 'sweep') {
  const D = Number(process.argv[4] ?? 40);
  const t = Number(process.argv[5] ?? 1);
  const combos = process.env.COMBOS
    ? JSON.parse(process.env.COMBOS)
    : [{}, { zip: false }, { attNear: 0 }, { attNear: 1.2 }, { attNear: 2.5 }, { wallStep: 3 }, { wallStep: 4 }];
  const rows = [];
  for (const cb of combos) {
    let lv;
    try { lv = build(D, t, cb); } catch (e) { console.log(`${JSON.stringify(cb)} 构造期拒绝 ${e.message}`); continue; }
    lv.wEnd = cb.wEnd ?? 12;
    if (cb.zip === false) lv.opts = { ...lv.opts, zipUp: undefined };
    if (cb.attNear !== undefined) lv.opts = { ...lv.opts, attNear: cb.attNear };
    if (cb.noCrease) lv.opts = { ...lv.opts, coreTetherRel: undefined };
    if (cb.noAlign) lv.opts = { ...lv.opts, alignRuns: undefined };
    const m = run(lv, { dense: 10 });
    rows.push({ cb, lv, m });
  }
  rows.sort((a, b) => a.m.knot - b.m.knot || a.m.silD - b.m.silD);
  for (const { cb, lv, m } of rows)
    console.log(
      `环 ${String(m.knot).padStart(3)} @${String(m.knotAt).padStart(4)}  Δ ${m.silD.toFixed(2).padStart(5)}  ` +
      `挑 ${m.reach.toFixed(1)} 高 ${m.height.toFixed(1)} 缝 ${m.mouth.toFixed(1)} 锁 ${m.locked}/${m.total}@${m.last}  ${JSON.stringify(cb)}`,
    );
  process.exit(0);
}

// ── frames：三档同一时间轴的成形对照（§15.11「一排里总有一段还是直带子」那条）──
if (MODE === 'frames') {
  const cal = calibrate((s) => console.log(s));
  const TS = [
    { nm: '角', col: '#3f6d3f', lv: cal.corner.lv },
    { nm: '边', col: '#8a6d1f', lv: cal.edge.lv },
    { nm: '面', col: '#c2571a', lv: cal.face.lv },
  ];
  const AT = [400, 550, 650, 750, 1000, 1500];
  const sims = TS.map((x) => ({ ...x, s: createSkinUnit(x.lv.spec, x.lv.opts), fr: [] }));
  for (let k = 0; k < SKIN.STEPS; k++) {
    for (const q of sims) {
      q.s.advance();
      if (AT.includes(k + 1)) {
        const seg = [];
        for (let i = q.lv.lead; i < q.lv.lead + q.lv.free; i++) seg.push([q.s.px[i] * 100, -q.s.py[i] * 100]);
        // 以带子下缘为公共 y 基准（§15.14 的坑：逐帧按 yMin 归零会把要验的东西归掉）
        const base = -q.s.py[q.s.n - 1] * 100;
        q.fr.push({ step: k + 1, seg: seg.map(([x, y]) => [x, y - base]), locked: q.s.locked.length });
      }
    }
  }
  const sv = [];
  const CW = 190, RH = 200, SC = 1.5;
  sv.push(`<text x="20" y="24" font-size="14" font-weight="600" fill="#111">三档同一时间轴的成形（公共 y 基准 = 带子下缘；原始折线，无绘图平滑）</text>`);
  for (let r = 0; r < sims.length; r++) {
    const q = sims[r];
    const oy = 60 + r * RH;
    sv.push(`<text x="20" y="${oy + 90}" font-size="12" fill="${q.col}" font-weight="600">${q.nm}档</text>`);
    for (let c = 0; c < q.fr.length; c++) {
      const f = q.fr[c];
      const ox = 80 + c * CW;
      const cy = oy + 90;
      const P = ([x, y]) => `${(ox + x * SC).toFixed(1)},${(cy + (y + 100) * SC).toFixed(1)}`;
      sv.push(`<line x1="${ox}" y1="${cy - 40}" x2="${ox}" y2="${cy + 40}" stroke="#ccc"/>`);
      sv.push(`<polyline points="${f.seg.map(P).join(' ')}" fill="none" stroke="${q.col}" stroke-width="0.9"/>`);
      if (r === 0) sv.push(`<text x="${ox}" y="46" font-size="11" fill="#666">step ${f.step}</text>`);
      sv.push(`<text x="${ox}" y="${oy + 175}" font-size="10" fill="#999">锁 ${f.locked}</text>`);
    }
  }
  writeFileSync(OUT, `<svg xmlns="http://www.w3.org/2000/svg" width="${80 + AT.length * CW}" height="${60 + 3 * RH}" font-family="system-ui, 'PingFang SC', sans-serif"><rect width="100%" height="100%" fill="#faf9f6"/>${sv.join('')}</svg>`);
  console.log(`帧图 ${OUT}`);
  process.exit(0);
}

// ── compare：恒高（本轮方案）vs 变高（出路 C，原捏分口径）的面档天花板与方形大小 ──
if (MODE === 'compare') {
  // 出路 C = **原捏分口径**：台高钉死 12、终态缝 28 ⇒ 总高 24→52（Lab.12/13 那个形状原样搬）
  for (const [varH, wEnd] of [[0, 12], [12, 28]]) {
    console.log(`\n══ ${varH ? `变高（出路 C = 原捏分口径：台高钉死 ${varH}、终态缝 ${wEnd} ⇒ 总高 24→${2 * varH + wEnd}）` : '恒高（本轮方案：总高钉死 36、缝宽换台高）'} ══`);
    let best = null;
    for (let boxD = 30; boxD <= 56; boxD += 2) {
      let lv;
      try { lv = build(boxD + PUFF, 1, { boxD, varH, wEnd }); } catch { continue; }
      if (lv.free > F_TOT) continue;
      lv.wEnd = wEnd;
      let m = run(lv, { dense: 10 });
      try {
        const lv2 = build(Math.round(m.reach * 10) / 10, 1, { boxD, varH, wEnd });
        if (lv2.free <= F_TOT) { lv2.wEnd = wEnd; lv = lv2; m = run(lv2, { dense: 10 }); }
      } catch { /* 装不下就用第一遍 */ }
      console.log(`  boxD${boxD}: 挑出 ${m.reach.toFixed(1)} 箱高 ${m.height.toFixed(1)}（设计 ${lv.hBox.toFixed(1)}） 缝 ${m.mouth.toFixed(1)} free ${lv.free} 锁 ${m.locked}/${m.total} 结 ${m.knot} Δ ${m.silD.toFixed(2)}`);
      if (m.locked === m.total && m.knot <= 6 && (!best || m.reach > best.m.reach)) best = { boxD, lv, m };
    }
    if (!best) { console.log('  无干净候选'); continue; }
    const a = (best.m.reach + R) * Math.cos(TH_FACE);
    const T = tiersFor(a);
    console.log(`  ⇒ 面档天花板 挑出 ${best.m.reach.toFixed(1)} · 半边长 ${a.toFixed(1)} · **边长 ${(2 * a).toFixed(0)}px**（现行平档 169）`);
    const hAt = (tt) => (varH ? 2 * varH + seamW(tt, wEnd) : H);
    console.log(`     一圈上下缘：${varH ? `角 ${hAt(0).toFixed(0)} / 边 ${hAt(EDGE_T).toFixed(0)} / 面 ${hAt(1).toFixed(0)} ⇒ **起伏 ±${((hAt(1) - hAt(0)) / 2).toFixed(0)}px**` : '三档恒 36 ⇒ **齐平**'}`);
    console.log(`     三档目标：面 ${T.face.toFixed(1)} · 边 ${T.edge.toFixed(1)} · 角 ${T.corner.toFixed(1)}`);
  }
  process.exit(0);
}

// ── mirror：1 重编制（一圈一个来回、10 级，Lab.13 同款读法）最大能做多大的方形 ──
// 复核提出的另一条出路：4 重只是「满足上界的一种指派」，不是唯一解。把方形做小 ⇒
// 角档的箱浅 ⇒ 它就吃得下较深的缝 ⇒ 1 重镜像也许装得下。这里实测它的天花板。
if (MODE === 'mirror') {
  const T10 = [0, 0.108, 0.254, 0.397, 0.523, 0.638, 0.741, 0.834, 0.92, 1]; // = SPLIT_T
  const mir = (i) => (i <= 9 ? i : 19 - i);
  const order = buildSquareOrder();
  // 相位扫描：让角位拿到的最高级尽可能低
  let bestOff = 0, bestMax = 99;
  for (let o = 0; o < 20; o++) {
    const mx = Math.max(...order.flatMap((cl, i) => (cl === 2 ? [mir((i + o) % 20)] : [])));
    if (mx < bestMax) { bestMax = mx; bestOff = o; }
  }
  const combos = [...new Set(order.map((cl, i) => `${cl}:${mir((i + bestOff) % 20)}`))].map((k) => k.split(':').map(Number));
  console.log(`1 重镜像：相位 ${bestOff} 时角位最高只到 L${bestMax}；共 ${combos.length} 条引擎（每条摆两处）`);
  console.log(`组合（档:级）= ${combos.map(([c, l]) => `${['面', '边', '角'][c]}L${l}`).join(' ')}`);
  // 二分半边长 a：全部组合都要构造得下 + 跑得干净
  const tierReach = (a) => [a / Math.cos(TH_FACE) - R, a / Math.cos(TH_EDGE) - R, a / Math.cos(TH_CORN) - R];
  const feasible = (a, verbose = false) => {
    const rs = tierReach(a);
    for (const [cl, l] of combos) {
      const Dw = rs[cl];
      if (Dw <= 8) return false;
      if (l === 0) continue; // 单箱：查深度表即可
      const f = fitTier(Dw, T10[l]);
      if (!f) { if (verbose) console.log(`    ${['面', '边', '角'][cl]}L${l}（目标 ${Dw.toFixed(1)}）× 装不下/跑不干净`); return false; }
      // 判据不能只看「跑得干净」——挑出打不中目标，方形就走样了（外缘点要落在方形边上）
      const miss = Math.abs(f.m.reach - Dw);
      if (verbose) console.log(`    ${['面', '边', '角'][cl]}L${l}: 目标 ${Dw.toFixed(1)} → boxD${f.boxD} 挑出 ${f.m.reach.toFixed(1)}（差 ${(f.m.reach - Dw).toFixed(1)}） 箱高 ${f.m.height.toFixed(1)} 缝 ${f.m.mouth.toFixed(1)} 结 ${f.m.knot} Δ ${f.m.silD.toFixed(2)}`);
      if (miss > 1.5) { if (verbose) console.log('      ↑ 挑出偏差 >1.5px，外缘点落不到方形上'); return false; }
    }
    return true;
  };
  if (process.env.AT) {
    console.log(`  逐组合诊断 @ 半边长 ${process.env.AT}（边长 ${(2 * Number(process.env.AT)).toFixed(0)}）：`);
    feasible(Number(process.env.AT), true);
    process.exit(0);
  }
  let lo = Number(process.env.LO ?? 30), hi = Number(process.env.HI ?? 76.2), ok = null;
  for (let it = 0; it < Number(process.env.IT ?? 5); it++) {
    const mid = Math.round(((lo + hi) / 2) * 10) / 10;
    console.log(`  试 半边长 ${mid}（边长 ${(2 * mid).toFixed(0)}）…`);
    if (feasible(mid)) { ok = mid; lo = mid; } else hi = mid;
  }
  if (ok === null) { console.log('  1 重镜像在 边长 60 以上都装不下'); process.exit(0); }
  console.log(`\n⇒ 1 重镜像的天花板：半边长 ${ok} · **边长 ${(2 * ok).toFixed(0)}px**（4 重是 152、现行平档 169）`);
  console.log('  逐组合实测：');
  feasible(ok, true);
  process.exit(0);
}

// ── corner：角档还能吃多深的缝？（= 拍板项④ 的量，也是「1 重/2 重编制不可行」的依据）──
if (MODE === 'corner') {
  const Dc = Number(process.argv[4] ?? 77.7);
  console.log(`角档（目标挑出 ${Dc}）逐级加缝，看材料账在哪一档拦下来：`);
  for (const t of [0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]) {
    const f = fitTier(Dc, t);
    if (!f) { console.log(`  t${t}: 无干净候选（构造期拒绝或跑不干净）`); continue; }
    console.log(`  t${t}: boxD${f.boxD} 挑出 ${f.m.reach.toFixed(1)} 箱高 ${f.m.height.toFixed(1)} 缝宽 ${f.m.mouth.toFixed(1)} 缝深 ${f.lv.dv.toFixed(1)}（切进 ${((f.lv.dv / f.lv.D) * 100).toFixed(0)}%） free ${f.lv.free} 锁 ${f.m.locked}/${f.m.total} 结 ${f.m.knot} Δ ${f.m.silD.toFixed(2)}`);
  }
  process.exit(0);
}

if (MODE === 'audit') {
  console.log('══ 预算对照 ══');
  console.log(`方形环（本编制）F_TOT ${F_TOT} · lead ${LEAD} · ISO ${SQUARE.ISO} · tail ${RING_BAND_NODES - 2 * SQUARE.ISO - F_TOT - LEAD} · 带 ${RING_BAND_NODES}`);
  console.log('Lab.12 捏分族  F_TOT 107 · lead 8 · ISO 16 · tail 53 · 带 200  ← 上一轮审计用的就是这个（+26 节的差在这里）');
  console.log(`\n══ 材料账 ══\nM = 挑出/2 + 台高/2 + 缝深/2 + 缝尖宽/4   ·   M ≤ (1.4·F + H − 1.4 − e)/4 = ${mCap().toFixed(1)}`);
  console.log(`满裂 ⇒ M = D + H/4 ⇒ 设计深度 D ≤ ${dCap().toFixed(1)}px（**与箱高无关**：H 在两边抵消；也与缝宽无关）`);
  console.log(`同口径下若只有 Lab.12 的 107 节：D ≤ ${dCap(107).toFixed(1)}px；若榨到 157（lead 8/tail 5）：D ≤ ${dCap(157).toFixed(1)}px`);
  console.log('注：Lab.12 自己不解缓冲（SPLIT_BUF 固定 4），它的账是 free = 2M+9 ≤ 107 ⇒ M ≤ 49；');
  console.log('    那套在 H=52 时缓冲仍有余量（slack 9.2），但换到 H=36 会变成 −11.6（缓冲被拉直，§17.3 坑②）⇒ 本族必须解缓冲。');
  console.log('\n══ 三档标定 ══');
  const cal = calibrate((s) => console.log(s), process.env.VERBOSE === '1');
  const CK = [400, 550, 650, 750, 1000, 1500];
  const out = [
    { nm: '角', ...cal.corner },
    { nm: '边', ...cal.edge },
    { nm: '面', ...cal.face },
  ];
  for (const r of out) r.m = run(r.lv, { dense: 10, checks: CK });
  console.log('\n（箱高/水平度 = Lab.14 守门口径：排除端面、x∈[0.35,0.85]·挑出、取外包络两面）');
  console.log('档   实测挑出   箱高   顶平  底平   缝宽   自由段  缓冲   锁定       结  Δ     缝心离下缘  上缘   下缘');
  for (const r of out) {
    const m = r.m;
    console.log(
      `${r.nm}档  ${m.reach.toFixed(1).padStart(7)}  ${m.boxH.toFixed(2).padStart(5)} ${m.topFlat.toFixed(2).padStart(5)} ${m.botFlat.toFixed(2).padStart(5)}  ${m.mouth.toFixed(1).padStart(5)}  ` +
      `${String(r.lv.free).padStart(5)}  ${String(r.lv.buf).padStart(4)}  ${(m.locked + '/' + m.total).padStart(8)}@${String(m.last).padStart(3)}  ` +
      `${String(m.knot).padStart(2)}  ${m.silD.toFixed(2).padStart(5)}  ${m.align.toFixed(1).padStart(8)}  ${m.topY.toFixed(1).padStart(5)}  ${m.botY.toFixed(1).padStart(5)}`,
    );
  }
  const sp = (f) => (Math.max(...out.map(f)) - Math.min(...out.map(f))).toFixed(2);
  console.log(`\n箱高散布 ${sp((r) => r.m.boxH)}px（目标 ${H}，守门线 <0.5）· 顶面位置散布 ${sp((r) => r.m.topMean)}px（守门线 <1.5）· 缝心散布 ${sp((r) => r.m.align)}px · 上缘散布 ${sp((r) => r.m.topY)}px · 下缘散布 ${sp((r) => r.m.botY)}px`);
  // 对齐要按**整个时间轴**验，不能只验终态（§8.8 / §17.8.1③ 的教训）
  console.log('\n全程对位（缝心离下缘，px）：');
  console.log('  step   ' + CK.map((c) => String(c).padStart(7)).join(''));
  for (const r of out) console.log(`  ${r.nm}档   ` + CK.map((c) => r.m.at[c].toFixed(1).padStart(7)).join(''));
  console.log('  散布   ' + CK.map((c) => (Math.max(...out.map((r) => r.m.at[c])) - Math.min(...out.map((r) => r.m.at[c]))).toFixed(1).padStart(7)).join(''));

  // 「与平档平台高度相同」——这条要实测，不能只凭「同一份分配」推断
  console.log('\n══ 与平档（现行 Lab.14 三档）的平台高度对照 ══');
  const flat = SQUARE_TIERS.map((ti) => {
    const lv = build(squareReachOf(ti.k), 0, { k: ti.k, formLikeSplit: false });
    return { nm: ti.name, k: ti.k, m: run(lv, { dense: 10, checks: CK }) };
  });
  for (const f of flat) console.log(`  平档 ${f.nm}档 k${f.k}: 挑出 ${f.m.reach.toFixed(1)} 箱高 ${f.m.boxH.toFixed(2)} 顶平 ${f.m.topFlat.toFixed(2)} 底平 ${f.m.botFlat.toFixed(2)} 缝心离下缘 ${f.m.align.toFixed(1)}`);
  console.log('  平档自己的全程对位（同一组检查点，作为守门线 2.5px 的参照）：');
  console.log('    step ' + CK.map((c) => String(c).padStart(7)).join(''));
  console.log('    散布 ' + CK.map((c) => (Math.max(...flat.map((f) => f.m.at[c])) - Math.min(...flat.map((f) => f.m.at[c]))).toFixed(1).padStart(7)).join(''));
  const allAl = [...flat.map((f) => f.m.align), ...out.map((r) => r.m.align)];
  console.log(`  平档 + 捏分档 六条一起看：缝心散布 ${(Math.max(...allAl) - Math.min(...allAl)).toFixed(2)}px ⇒ 切编制时平台不跳`);
  // 格距按**全程峰值**量（Lab.10 §14.2：只看终态会把间距定小、过程中就撞上）
  console.log('\n══ 全程峰值挑出（阵列格距按它定，不是终态）══');
  for (const r of out) console.log(`  ${r.nm}档 终态 ${r.m.reach.toFixed(1)} → 峰值 ${r.m.peak.toFixed(1)}（+${(r.m.peak - r.m.reach).toFixed(1)}）`);
  for (const f of flat) console.log(`  平档 ${f.nm}档 终态 ${f.m.reach.toFixed(1)} → 峰值 ${f.m.peak.toFixed(1)}`);
  const pk = Math.max(...out.map((r) => r.m.peak));
  const flatPk = Math.max(...flat.map((f) => f.m.peak));
  console.log(`  捏分编制峰值上限 ${pk.toFixed(1)} vs 平档 ${flatPk.toFixed(1)} ⇒ ${pk <= flatPk ? '现行格距/取景够用，阵列不用重排' : '**超出平档，格距要重算**'}`);
  console.log('\n══ 缝宽变体（面档满裂；缝宽与材料账无关 ⇒ 纯审美选择）══');
  for (const wEnd of [8, 12, 16, 20]) {
    let lv;
    try { lv = build(cal.face.lv.D, 1, { wEnd, boxD: cal.face.boxD }); }
    catch (e) { console.log(`  缝 ${wEnd}: 构造期拒绝 — ${e.message}`); continue; }
    lv.wEnd = wEnd;
    const m = run(lv, { dense: 10 });
    console.log(`  缝 ${wEnd}（台高 ${((H - wEnd) / 2).toFixed(0)}×2）: 挑出 ${m.reach.toFixed(1)} 高 ${m.height.toFixed(1)} 实测缝 ${m.mouth.toFixed(1)} 锁 ${m.locked}/${m.total} 结 ${m.knot} Δ ${m.silD.toFixed(2)}`);
  }
  console.log('\n══ 边档形态位置变体（t = 一圈来回的中间那一站）══');
  for (const te of [0.35, 0.5, 0.65]) {
    const f = fitTier(cal.T.edge, te);
    if (!f) { console.log(`  t${te}: 无干净候选`); continue; }
    console.log(`  t${te}: boxD${f.boxD} 挑出 ${f.m.reach.toFixed(1)} 高 ${f.m.height.toFixed(1)} 缝 ${f.m.mouth.toFixed(1)} 切进 ${((f.lv.dv / f.lv.D) * 100).toFixed(0)}% 结 ${f.m.knot} Δ ${f.m.silD.toFixed(2)}`);
  }
  process.exit(0);
}

// ── 线稿 SVG ───────────────────────────────────────────────────────────────
const log = [];
const cal = calibrate((s) => log.push(s));
const { a: HALF, T } = cal;
const W_END = Number(process.env.W_END ?? 12);
const RUNS = [
  { nm: '面', en: 'face', t: 1, count: 8, col: '#c2571a', D: T.face, ...cal.face },
  { nm: '边', en: 'edge', t: EDGE_T, count: 8, col: '#8a6d1f', D: T.edge, ...cal.edge },
  { nm: '角', en: 'corner', t: 0, count: 4, col: '#3f6d3f', D: T.corner, ...cal.corner },
];
console.log(log.join('\n'));

const svg = [];
let Y = 0;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const text = (x, y, s, size = 12, fill = '#333', anchor = 'start', bold = false) =>
  svg.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}" text-anchor="${anchor}"${bold ? ' font-weight="600"' : ''}>${esc(s)}</text>`);
const poly = (pts, stroke, sw = 1.4, dash = '', fill = 'none') =>
  svg.push(`<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linejoin="round"/>`);
const seg2 = (x1, y1, x2, y2, stroke, sw = 1, dash = '') =>
  svg.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
const smoothPts = (pts, w = 3) =>
  pts.map((_, i) => {
    let sx = 0, sy = 0, n = 0;
    for (let k = -w; k <= w; k++) {
      const j = Math.min(pts.length - 1, Math.max(0, i + k));
      sx += pts[j][0]; sy += pts[j][1]; n++;
    }
    return [sx / n, sy / n];
  });

const W = 1240;
Y = 30;
text(24, Y, '方形环 · 捏分编制 线稿（拍板用）', 17, '#111', 'start', true);
Y += 24;
for (const s of [
  '上一轮的两条否决理由复查后**都能消掉**：不必改族定义（出路 C 不用走）、不必加长带子（出路 D 不用走）。',
  '① 「缝把箱撑高」成立，但可以消掉 —— 原捏分是「台高钉死 12、缝 0→28」⇒ 总高 24→52。改成 **总高钉死 36、缝宽换台高**（台高 =（36−缝）/2）：',
  `   单箱 36 高，捏到最后是两片 12 高的台夹一道 12 的缝。**用 Lab.14 守门自己的尺子量**（排除端面、x∈[0.35,0.85]·挑出）：三档箱高 ${RUNS.map((r) => r.m.boxH.toFixed(2)).join(' / ')}，`,
  `   散布 0.00（守门线 <0.5）· 顶底面水平度 ${RUNS.map((r) => r.m.topFlat.toFixed(2)).join(' / ')}（守门线 <1.5，平档自己是 0.13–0.15）· 顶面位置散布 1.14（守门线 <1.5）—— **终态三条族守门全过**。`,
  '② 「深箱+深缝装不下」成立，且是几何硬约束（不是调参问题）—— 但预算记错了：107 是 **Lab.12 自己的分配**（lead 8 / tail 53 / 200 节带）；',
  '   方形环在 202 节带上本来就有 **133** 节（lead 22 / tail 15）。用环族自己这份分配，带子一节不用加长。',
  `材料账（推导 + 实测对上）：M = 挑出/2 + 台高/2 + 缝深/2 + 缝尖/4 ≤ (1.4F+H−1.4−e)/4 = ${mCap().toFixed(1)} 节 ⇒ **满裂平台的设计深度 ≤ ${dCap().toFixed(1)}px**（实测挑出再鼓出 +4 ⇒ 47.1）。`,
  '⇒ **4 重是被材料强制的，不是编制选择**：挑得远与缝得深抢同一份材料，故缝只能在面档最深、角档为零 —— 恰好就是方形的 4 重对称。',
  '   实测角档的缝只能吃到「切进 24%」（再深构造期直接拒绝）；1 重镜像编制在全部 20 个相位里都会把「切进 74%」押上角位、2 重最好也要 40% —— 都过界，所以「一圈一个来回」在这个形状上做不出来。',
  `实测对位：平档三档缝心离下缘全是 100.4，捏分三档 ${RUNS.slice().reverse().map((r) => r.m.align.toFixed(1)).join(' / ')} —— **六条一起散布 2.31px ⇒ 切编制时平台不跳**。`,
  '**唯一过不了族守门的一条（如实报）**：全程对位。同一组检查点下，平档三档的散布是 0.2/0.5/2.5/0.2/0.1/0.1px（守门线 2.5），',
  '   捏分三档是 9.2/14.9/11.6/7.2/2.3/2.3px —— 成形中段面档滞后，峰值 14.9 是守门线的 6 倍，到 step 1000 才收敛。终态那一格（2.3）是过的。',
  '   这属于**成形过程**的账（§16.4：Lab.12 当初也是先定终态形、再单独做一轮成形设计），不影响终态形，但它是这一编制上站前必须解决的一项。',
]) { text(24, Y, s, 12, '#444'); Y += 16.5; }

// A · 三档目标线
Y += 16;
text(24, Y, 'A · 三档目标线（虚线 = 缝心；灰框 = 恒定箱高 36 的上下缘）', 13, '#111', 'start', true);
Y += 10;
{
  const SC = 2.3, CY = Y + 78;
  let x0 = 60;
  for (const r of RUNS.slice().reverse()) {
    seg2(x0, CY - 60, x0, CY + 60, '#999', 1);
    seg2(x0 - 6, CY, x0 + r.D * SC + 20, CY, '#ccc', 0.8, '3 3');
    seg2(x0 - 6, CY - (H / 2) * SC, x0 + r.D * SC + 20, CY - (H / 2) * SC, '#ddd', 0.8);
    seg2(x0 - 6, CY + (H / 2) * SC, x0 + r.D * SC + 20, CY + (H / 2) * SC, '#ddd', 0.8);
    poly(targetAt(r.t, r.lv.D, W_END).map(([x, y]) => [x0 + x * SC, CY + y * SC]), r.col, 1.8);
    text(x0, CY + 80, `${r.nm}档 ×${r.count}`, 12, '#222', 'start', true);
    text(x0, CY + 95, `挑出 ${r.D.toFixed(1)} · 高 ${H} · 缝 ${r.m.mouth.toFixed(1)}`, 11, '#666');
    x0 += r.D * SC + 96;
  }
  const xo = x0 + 20;
  seg2(xo, CY - 60, xo, CY + 60, '#999', 1);
  seg2(xo - 6, CY, xo + 200, CY, '#ccc', 0.8, '3 3');
  for (const r of RUNS) poly(targetAt(r.t, r.lv.D, W_END).map(([x, y]) => [xo + x * SC, CY + y * SC]), r.col, 1.2);
  text(xo, CY + 80, '叠合：上下缘齐平', 12, '#222', 'start', true);
  text(xo, CY + 95, '挑出在变、总高不变', 11, '#666');
  Y = CY + 118;
}

// B · 20 位立面展开
text(24, Y, 'B · 一圈二十位立面展开（▲ = 角位；一圈四个来回：单箱 → 开缝 → 裂成两台 → 合拢）', 13, '#111', 'start', true);
Y += 10;
{
  const SC = 0.92, SLOT = 59, CY = Y + 60;
  const order = buildSquareOrder();
  const byClass = { 0: RUNS[0], 1: RUNS[1], 2: RUNS[2] };
  seg2(24, CY, 24 + 20 * SLOT + 20, CY, '#ccc', 0.8, '3 3');
  seg2(24, CY - (H / 2) * SC, 24 + 20 * SLOT + 20, CY - (H / 2) * SC, '#bbb', 1);
  seg2(24, CY + (H / 2) * SC, 24 + 20 * SLOT + 20, CY + (H / 2) * SC, '#bbb', 1);
  for (let i = 0; i < 20; i++) {
    const r = byClass[order[i]];
    const x0 = 34 + i * SLOT;
    seg2(x0, CY - 30, x0, CY + 30, '#e2e2e2', 0.7);
    poly(targetAt(r.t, r.lv.D, W_END).map(([x, y]) => [x0 + x * SC, CY + y * SC]), r.col, 1.4);
    if (order[i] === 2) text(x0 + 1, CY - 36, '▲', 10, '#3f6d3f');
    text(x0, CY + 48, r.nm, 9.5, '#888');
  }
  text(24, CY + 66, '上下两条灰线 = 恒定箱高的上下缘，一圈笔直——这正是上一轮判「族前提破了」的那一项，恒高构造下它不破。', 11, '#555');
  Y = CY + 84;
  // 对照条：出路 C（原捏分口径，台高钉死 12、缝 0→28）在同样三档挑出下的立面
  text(24, Y, '对照 · 若走出路 C（原捏分口径：台高钉死 12、终态缝 28）——同样二十位、同样三档挑出：', 11.5, '#666');
  Y += 8;
  const CY2 = Y + 52;
  const hC = (tt) => 24 + 28 * Math.pow(tt, 0.7);
  seg2(24, CY2 - (hC(1) / 2) * SC, 24 + 20 * SLOT + 20, CY2 - (hC(1) / 2) * SC, '#ddd', 1, '4 3');
  seg2(24, CY2 + (hC(1) / 2) * SC, 24 + 20 * SLOT + 20, CY2 + (hC(1) / 2) * SC, '#ddd', 1, '4 3');
  const envT = [];
  const envB = [];
  for (let i = 0; i < 20; i++) {
    const r = byClass[order[i]];
    const x0 = 34 + i * SLOT;
    poly(targetAt(r.t, r.lv.D, 28, 12).map(([x, y]) => [x0 + x * SC, CY2 + y * SC]), '#b09', 1.1);
    envT.push([x0, CY2 - (hC(r.t) / 2) * SC]);
    envB.push([x0, CY2 + (hC(r.t) / 2) * SC]);
  }
  poly(envT, '#b09', 0.9, '2 2');
  poly(envB, '#b09', 0.9, '2 2');
  text(24, CY2 + 52, '上下缘随形态起伏 ±14px（角 24 / 边 41 / 面 52）——而**换不来任何东西**：实测面档挑出天花板同样 47.1、方形同样 152px。', 11, '#666');
  text(24, CY2 + 67, '原因：材料账里箱高在两边同时出现（箱高涨 ⇒ 所需缓冲减，正好抵消）⇒ 天花板与箱高无关。这条是推导先给出、引擎再证实的。', 11, '#888');
  Y = CY2 + 86;
}

// C · 俯视
text(24, Y, 'C · 俯视（终态外缘点 + 膜弦；灰虚线 = 现行平档方形 169px）', 13, '#111', 'start', true);
Y += 8;
{
  const SC = 1.5, CX = 250, CY = Y + 160;
  const A0 = 84.3 * SC;
  poly([[-A0, -A0], [A0, -A0], [A0, A0], [-A0, A0], [-A0, -A0]].map(([x, y]) => [CX + x, CY + y]), '#c8c8c8', 0.9, '5 4');
  const A1 = HALF * SC;
  poly([[-A1, -A1], [A1, -A1], [A1, A1], [-A1, A1], [-A1, -A1]].map(([x, y]) => [CX + x, CY + y]), '#888', 1);
  svg.push(`<circle cx="${CX}" cy="${CY}" r="${(R * SC).toFixed(1)}" fill="none" stroke="#ccc" stroke-width="0.8"/>`);
  const order = buildSquareOrder();
  const rim = order.map((t, i) => {
    const th = squareAngle(i);
    const rr = R + RUNS[t].m.reach;
    return [CX + Math.cos(th) * rr * SC, CY + Math.sin(th) * rr * SC, t];
  });
  poly([...rim, rim[0]].map(([x, y]) => [x, y]), '#aaa', 0.9, '2 2');
  for (const [x, y, t] of rim) svg.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="${RUNS[t].col}"/>`);
  let ty = Y + 34;
  text(520, ty, `边长 ${(2 * HALF).toFixed(0)}px（现行平档 169px，小 ${(100 - (200 * HALF) / 169).toFixed(0)}%）`, 12.5, '#222', 'start', true);
  ty += 20;
  for (const s of [
    `为什么小：满裂那一档的设计深度被材料账封在 ${dCap().toFixed(1)}px（实测挑出 47.1），方形由它反推。`,
    '这是**这一编制的天花板**，不是标定粗糙——再调也只能到这里。',
    '（平台高度、格距、取景、角档谱一律与平档同——只有方形小一圈。）',
  ]) { text(520, ty, s, 11.5, '#555'); ty += 16; }
  ty += 8;
  text(520, ty, '外缘点对方形的偏差：', 12, '#444');
  ty += 16;
  for (const r of RUNS) {
    const want = { face: T.face, edge: T.edge, corner: T.corner }[r.en];
    text(532, ty, `${r.nm}档 ${(r.m.reach - want) >= 0 ? '+' : ''}${(r.m.reach - want).toFixed(1)}px`, 11.5, '#666');
    ty += 15;
  }
  Y = CY + 190;
}

// D · 引擎抽测
text(24, Y, 'D · 引擎抽测（细线 = 原始折线，粗线 = 台架平滑 [3,1]，虚线 = 目标线）', 13, '#111', 'start', true);
Y += 10;
{
  const SC = 2.2, CY = Y + 78;
  let x0 = 60;
  for (const r of RUNS.slice().reverse()) {
    seg2(x0, CY - 60, x0, CY + 60, '#999', 1);
    poly(targetAt(r.t, r.lv.D, W_END).map(([x, y]) => [x0 + x * SC, CY + y * SC]), '#c4c4c4', 1, '4 3');
    poly(r.m.prof.map(([x, y]) => [x0 + x * SC, CY + y * SC]), r.col, 0.5);
    poly(smoothPts(r.m.prof).map(([x, y]) => [x0 + x * SC, CY + y * SC]), r.col, 1.6);
    text(x0, CY + 80, `${r.nm}档`, 12, '#222', 'start', true);
    text(x0, CY + 95, `挑 ${r.m.reach.toFixed(1)} 高 ${r.m.height.toFixed(1)} 缝 ${r.m.mouth.toFixed(1)}`, 11, '#666');
    text(x0, CY + 109, `锁 ${r.m.locked}/${r.m.total} 结 ${r.m.knot} Δ ${r.m.silD.toFixed(2)}`, 10.5, '#888');
    x0 += Math.max(r.D * SC, 130) + 96;
  }
  Y = CY + 132;
}

text(24, Y, '拍板项', 13, '#111', 'start', true);
Y += 18;
for (const s of [
  `① **方形小一圈**：边长 ${(2 * HALF).toFixed(0)} vs 平档 169（小 10%）。这是这一编制的天花板，换来的是族定义不破 + 平台高度与平档一致。收不收？`,
  `② **终态缝宽**：现取 ${W_END}（两片 ${((H - W_END) / 2).toFixed(0)} 高的台夹 ${W_END} 的缝）。与材料账无关、纯审美，实测 8 / 12 / 16 / 20 都跑得干净（缝 8 = 两片 14 高，缝 20 = 两片 8 高）。`,
  '③ **边档的形态位置**：现取 t=0.5（缝开到一半、切进 44%，Δ1.82 最干净）。t=0.35 偏早（箱高失准到 40.4）、t=0.65 偏晚（Δ 崩到 16.7）—— 这一档的可用区间不宽。',
  '④ **角档要不要留一道浅折痕**：实测角档最多吃到切进 24%（再深构造期就拒绝），但**切进 6% 以上箱高就从 36 漂到 39.6**——恒高会破。故现取实心箱，只在很浅（切进 6%、缝 7px）时才不破。',
  '⑤ 一圈的读法：面档是**成对相邻**的（…边 面 面 边 角 边 面 面 边…），因为面档那一类在坐标轴两侧各 9°。裂得最开的地方会连着出现两条，不是一条。',
  '⑥ **「一圈只一个来回」（10 级，Lab.13 那种读法）实测否决**：它要求角上也带深缝 ⇒ 角档挑出被压到 ≤53 ⇒ 方形只能做到边长 118（小 30%），',
  '   而那时面档挑出只剩 29.5 —— 箱才 18px 深却要开 12–15px 的缝还切到底，**出来是个楔形不是两片台**（剪影Δ 11.5，本方案是 0.18–3.35）。',
  '   根子是方形自己的角/面挑出比 0.55：1 重要求把深缝押到最深那一档上，而「两片台」的读法需要挑出 ≥40。故 4 重不是我挑的，是这条比值挑的。',
]) { text(24, Y, s, 12, '#444'); Y += 17; }

writeFileSync(OUT, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${(Y + 20).toFixed(0)}" viewBox="0 0 ${W} ${(Y + 20).toFixed(0)}" font-family="system-ui, 'PingFang SC', 'Noto Sans CJK SC', sans-serif"><rect width="100%" height="100%" fill="#faf9f6"/>${svg.join('')}</svg>`);
console.log(`\n线稿已写 ${OUT}`);
