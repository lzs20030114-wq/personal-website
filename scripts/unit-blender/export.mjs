// **项目二单元 → Blender 的数据导出**（2026-10-29，作者「细化单元的建模，加入让它看起来合理的机械机构细节，
// 在 Blender 里建模，尽量给到收缩、运动、形成各种图形的动画」）
//
//   npx -y vite-node scripts/unit-blender/export.mjs <out.json>
//
// 带子每一帧的形状、每颗键什么时候扣上 / 松开，全部用站上那份引擎现算（skin-unit 的正向协议 advance 与
// 松键回程 retractStep），一个数不改；这里只做三件事：
//   1. 按镜头的时间表推进引擎、按视频帧取样（每 SUB 帧一样）；
//   2. 把引擎单位换成米（尺寸链与 Lab 2-15 相同：rigFor 的装置缩放 s、一米 = UNITS_PER_M 个世界单位）；
//   3. 补上引擎里没有的两段：从天花下落到工位（升降）与收回天花下（收起）。这两段是纯几何（演示值，
//      同 cohabit-solid 的 hoistProfile 一样没有物理依据）：布在上下两个夹环之间折成手风琴褶，夹环拉开时褶展开，
//      最后一段渐变到引擎第 0 步的形，接上成形。
//
// 输出：scenes[] —— 每个镜头一组单元；单元 = 几档带子（同档二十条带形状相同）+ 二十条带的档位编制 + 时间样本。
// 坐标：带子剖面在「带子自己的平面」里，r = 离芯轴的半径（米），z = 离下夹环（钉住端）的高度（米，向上为正）。
// 下夹环的离地高度单独给（footZ），Blender 里由它摆整台。
import { writeFileSync } from 'node:fs';
import { SKIN, createSkinUnit, renderSmooth, buildUnit } from '../../src/lib/space/skin-unit.ts';
import { UNIT_TIERS, UNIT_ORDER, UNITS_PER_M, rigFor, TrajectoryBaker, FRAMES, TABLE_TOP } from '../../src/lib/space/cohabit-solid.ts';
import { planLayout } from '../../src/lib/space/unit-activation.ts';
import { SQUARE } from '../../src/lib/space/skin-square.ts';
import { buildRingUnits, RING } from '../../src/lib/space/skin-ring.ts';
import { cycleShapes } from '../../src/lib/space/skin-cycle.ts';
import { ROOM } from '../../src/lib/space/skin-grid.ts';
import { figureParts, catParts, HUMAN_STYLE_DEFAULT } from '../../src/lib/space/figure.ts';
import { personColor, catColor, coatOf } from '../../components/lab/figurePalette.ts';

const OUT = process.argv[2] ?? 'unit-blender.json';
const FPS = 24;
/** 每隔几个视频帧取一个样（Blender 里样与样之间线性插值） */
const SUB = 2;
const DT = SUB / FPS;
const R = (v, d = 5) => Math.round(v * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------- 尺度（与 Lab 2-15 同一条链）
const layout = planLayout(8, RING.RADIUS_DEF, 'room');
const sqTraj = new TrajectoryBaker(UNIT_TIERS[0], FRAMES).runAll();
const rig = rigFor(layout, sqTraj);
const S = rig.s; // 装置缩放（≈0.516）
const M = (u) => u / UNITS_PER_M; // 世界单位 → 米
const PX = (px) => M(px * 100 * S); // 引擎单位 → 米
const ST_R = M(SQUARE.RADIUS * S); // 带子站位半径（剖面 x = 0 处）
const SEG_M = PX(SKIN.SEG); // 贴合段一节的长度
const CEIL = M(ROOM.FLOOR_Y); // 天花离地（3.74 m）
const meta = {
  fps: FPS,
  sub: SUB,
  s: S,
  unitsPerM: UNITS_PER_M,
  stationR: R(ST_R),
  segM: R(SEG_M, 6),
  ceiling: R(CEIL),
  bandWidth: R(M(SQUARE.DEPTH * S)),
  bandCount: SQUARE.COUNT,
  pitch: R(layout.pitchM),
  roomM: R(layout.roomM),
};

// ---------------------------------------------------------------- 一条带的引擎录像
/** 一张谱从 from（可为空 = 全新）开始：正向跑满协议、再回程跑满，逐步记下（平滑后的）剖面与锁定集合 */
function film(def, from = null) {
  const u = createSkinUnit(def.spec, def.opts);
  if (from) u.applyTerminalState({ px: Float64Array.from(from.px), py: Float64Array.from(from.py), locked: [], step: 0, r: SKIN.R0 });
  const [w, p] = def.smooth;
  const snap = () => {
    const sm = renderSmooth(u.px, u.py, w, p);
    return { x: Float64Array.from(sm.x), y: Float64Array.from(sm.y), locked: new Set(u.locked.map(([i, j]) => `${i}-${j}`)) };
  };
  const fwd = [snap()];
  for (let k = 0; k < SKIN.STEPS; k++) {
    u.advance();
    fwd.push(snap());
  }
  const ret = [snap()];
  for (let k = 0; k < SKIN.STEPS; k++) {
    u.retractStep();
    ret.push(snap());
  }
  const raw = { px: Float64Array.from(u.px), py: Float64Array.from(u.py) };
  // 形状还在动的最后一步（取样只映射到会动的那段，免得先动完再干等）
  const lastMove = (arr) => {
    for (let k = arr.length - 1; k > 0; k--) {
      let d = 0;
      for (let i = 0; i < u.n; i++) d = Math.max(d, Math.abs(arr[k].x[i] - arr[k - 1].x[i]), Math.abs(arr[k].y[i] - arr[k - 1].y[i]));
      if (PX(d) > 2e-4) return k;
    }
    return 1;
  };
  return { n: u.n, fwd, ret, fwdActive: lastMove(fwd), retActive: lastMove(ret), end: raw };
}

/** 引擎剖面（x 离轴、y 向下为负）→ 米（r 离轴、z 离钉住端向上） */
function toMeters(f, n) {
  const x = new Array(n);
  const z = new Array(n);
  const y0 = f.y[n - 1];
  for (let i = 0; i < n; i++) {
    x[i] = PX(f.x[i]);
    z[i] = PX(f.y[i] - y0);
  }
  return { x, z };
}

// ---------------------------------------------------------------- 升降段（纯几何，演示值）
/**
 * 布在上下夹环之间折成手风琴褶：上夹环夹住前 lead 节、下夹环夹住末 tail 节，中间 m 节按 P 个褶排开，
 * 竖向占 h（米）。弧长守恒：半个褶的斜边 = 中段弧长 / 2P ⇒ 褶的幅度 a = √(seg² − (h/2P)²)。
 * 褶只往外鼓（x ≥ 0），余弦形让褶尖是圆的。
 */
function pleat(n, lead, tail, h, P) {
  const m = n - lead - tail;
  const Lf = (m + 1) * SEG_M;
  const seg = Lf / (2 * P);
  const a = Math.sqrt(Math.max(0, seg * seg - (h / (2 * P)) ** 2));
  const x = new Array(n).fill(0);
  const z = new Array(n).fill(0);
  for (let i = 0; i < tail; i++) z[n - 1 - i] = i * SEG_M;
  const zMidBot = (tail - 1) * SEG_M;
  for (let k = 0; k < m; k++) {
    const t = (k + 1) / (m + 1); // 0..1 自下而上（下标从上往下数，这里倒过来）
    const i = n - tail - 1 - k;
    z[i] = zMidBot + t * (h + SEG_M);
    x[i] = (a * (1 - Math.cos(2 * Math.PI * P * t))) / 2;
  }
  const zTop = zMidBot + h + 2 * SEG_M;
  for (let i = 0; i < lead; i++) z[lead - 1 - i] = zTop + i * SEG_M;
  return { x, z };
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerpProf = (A, B, w) => ({ x: A.x.map((v, i) => v + (B.x[i] - v) * w), z: A.z.map((v, i) => v + (B.z[i] - v) * w) });
const topOf = (p) => p.z[0];

/** 升降的一帧：u = 0 收起（褶最密）→ 1 落到工位（引擎的起始形） */
function hoistFrame(n, lead, tail, target, u, hStow = 0.1, P = 6) {
  const hEnd = topOf(target) - (lead + tail) * SEG_M;
  const h = hStow + (hEnd - hStow) * u;
  const pl = pleat(n, lead, tail, h, P);
  const w = smooth(Math.min(1, Math.max(0, (u - 0.7) / 0.3)));
  return w > 0 ? lerpProf(pl, target, w) : pl;
}

// ---------------------------------------------------------------- 单元：几档带子 × 一张时间表
/**
 * tiers：[{ name, programs: [def, …] }]——每档在每个程序下用哪张谱（同一单元换程序 = 换键谱，布不换）。
 * order：二十条带各属哪一档。timeline：[{ kind, dur, program? , to? }]。
 */
function buildUnit_(spec) {
  const { name, tiers, order, angle0, timeline, footWork, place, lead: leadC, tail: tailC, label = null, programLabels = null } = spec;
  // 引擎录像：每档每个程序一份，程序之间接着上一个的回程末态（与 skin-cycle 的 deploy 同法）
  const films = tiers.map((t) => {
    const out = [];
    let from = null;
    for (const def of t.programs) {
      const f = film(def, from);
      out.push(f);
      from = f.end;
    }
    return out;
  });
  const n = films[0][0].n;
  for (const tf of films) for (const f of tf) if (f.n !== n) throw new Error(`${name}: 各档节点数不同`);
  // 键：每档取所有程序的键的并集（同一条布上预埋了所有程序要用到的扣件，这一次扣哪几对由程序定）
  const bonds = tiers.map((t) => {
    const seen = new Map();
    t.programs.forEach((def, pi) => {
      const b = buildUnit(def.spec);
      for (const ch of b.chains)
        for (const [i, j, rb] of ch) {
          const k = `${i}-${j}`;
          if (!seen.has(k)) seen.set(k, { i, j, rb: R(PX(rb)), programs: [] });
          seen.get(k).programs.push(pi);
        }
    });
    return [...seen.values()];
  });
  // 跨缝的键不画（作者 2026-09-21 对 Lab 2-4 / 2-5 / 2-6 捏分的拍板：只留各片台内部的）
  tiers.forEach((t, ti) => {
    t.programs.forEach((def, pi) => {
      if (def.seam === undefined) return;
      for (const b of bonds[ti]) if (b.programs.includes(pi) && b.i < def.seam && b.j > def.seam) b.hidden = (b.hidden ?? []).concat(pi);
    });
  });

  // 时间表 → 样本
  const samples = [];
  let t = 0;
  let foot = footWork;
  let state = { kind: 'stowed', program: 0 }; // 当前每档的「最后一个形」用来接下一段
  const ceilGap = 0.03; // 收起时上夹环顶离天花板底的净距
  const ringTop = 0.035; // 上夹环顶高出带子第 0 节的量（Blender 里同一个数）
  const profNow = (ti) => state.prof[ti];
  // 起始：收起态
  const stowProf = (ti, target) => hoistFrame(n, leadC, tailC, target, 0);
  const initTargets = films.map((tf) => toMeters(tf[0].fwd[0], n));
  state.prof = initTargets.map((tg, ti) => stowProf(ti, tg));
  const footStow = () => CEIL - 0.02 - ceilGap - ringTop - topOf(state.prof[0]);
  foot = footStow();
  const push = (tt, prof, locks, footZ, phase) =>
    samples.push({ t: R(tt, 4), foot: R(footZ), phase, p: state.program, tiers: prof.map((p, ti) => ({ x: p.x.map((v) => R(v)), z: p.z.map((v) => R(v)), L: locks[ti] })) });
  const noLocks = () => tiers.map((_, ti) => bonds[ti].map(() => 0));
  const lockFlags = (ti, set, pi) => bonds[ti].map((b) => (b.programs.includes(pi) && set.has(`${b.i}-${b.j}`) ? 1 : 0));

  for (const seg of timeline) {
    const steps = Math.max(1, Math.round(seg.dur / DT));
    for (let k = 0; k < steps; k++) {
      const u = (k + 1) / steps;
      const tt = t + u * seg.dur;
      if (seg.kind === 'hold') {
        push(tt, state.prof, state.locks ?? noLocks(), foot, state.kind);
      } else if (seg.kind === 'hoist') {
        const e = smooth(u);
        const targets = films.map((tf) => toMeters(tf[seg.program].fwd[0], n));
        const prof = targets.map((tg) => hoistFrame(n, leadC, tailC, tg, e));
        // 下夹环从收起位落到工位：上夹环跟着往下（布展开），两者都按同一条缓动
        const f0 = CEIL - 0.02 - ceilGap - ringTop - topOf(hoistFrame(n, leadC, tailC, targets[0], 0));
        const fz = f0 + (footWork - f0) * e;
        push(tt, prof, noLocks(), fz, 'hoist');
        if (k === steps - 1) {
          state = { kind: 'straight', program: seg.program, prof, locks: noLocks() };
          foot = footWork;
        }
      } else if (seg.kind === 'form' || seg.kind === 'retract') {
        const pi = seg.program ?? state.program;
        state.program = pi;
        const prof = [];
        const locks = [];
        films.forEach((tf, ti) => {
          const f = tf[pi];
          const arr = seg.kind === 'form' ? f.fwd : f.ret;
          const active = seg.kind === 'form' ? f.fwdActive : f.retActive;
          const span = seg.steps ?? active + 20;
          const step = Math.min(arr.length - 1, Math.round(smoothIn(u, seg.ease) * span));
          prof.push(toMeters(arr[step], n));
          locks.push(lockFlags(ti, arr[step].locked, pi));
        });
        push(tt, prof, locks, foot, seg.kind);
        if (k === steps - 1) state = { kind: seg.kind === 'form' ? 'formed' : 'straight', program: pi, prof, locks };
      } else if (seg.kind === 'lift') {
        const e = smooth(1 - u); // 1 → 0
        const from = state.prof;
        // 收起：从回程末态（r = R0 的自然松弛形）折回手风琴褶，夹环一起升回天花下
        const prof = from.map((p) => hoistFrame(n, leadC, tailC, p, e));
        const f0 = CEIL - 0.02 - ceilGap - ringTop - topOf(hoistFrame(n, leadC, tailC, from[0], 0));
        const fz = f0 + (footWork - f0) * e;
        push(tt, prof, noLocks(), fz, 'lift');
        if (k === steps - 1) {
          state = { kind: 'stowed', program: state.program, prof, locks: noLocks() };
          foot = fz;
        }
      } else throw new Error(`未知段 ${seg.kind}`);
    }
    t += seg.dur;
  }
  return {
    name,
    label,
    programLabels,
    place,
    angle0,
    n,
    lead: leadC,
    tail: tailC,
    order,
    footWork: R(footWork),
    tiers: tiers.map((tt, ti) => ({ name: tt.name, bonds: bonds[ti], programs: tt.programs.map((d) => d.key) })),
    samples,
  };
}

/** 成形 / 回程的取样节奏：线性，或先慢后快再慢（ease = 'io'） */
function smoothIn(u, ease) {
  if (ease === 'io') return smooth(u);
  return u;
}

/** 成形后平台顶面离钉住端的高度：离芯超过一半挑出的节点里最高的那个 */
function platformTopRel(f, n) {
  const p = toMeters(f, n);
  let reach = 0;
  for (const v of p.x) reach = Math.max(reach, v);
  let top = -Infinity;
  p.x.forEach((v, i) => {
    if (v > reach * 0.5) top = Math.max(top, p.z[i]);
  });
  return top;
}

const STD = (prog = 0) => [
  { kind: 'hold', dur: 1.0 },
  { kind: 'hoist', dur: 4.0, program: prog },
  { kind: 'hold', dur: 0.5 },
  { kind: 'form', dur: 9.0, program: prog },
  { kind: 'hold', dur: 3.5 },
  { kind: 'retract', dur: 6.5 },
  { kind: 'hold', dur: 0.5 },
  { kind: 'lift', dur: 4.0 },
  { kind: 'hold', dur: 1.0 },
];

// ---------------------------------------------------------------- 镜头 A：房间里的方台（Lab 2-15 那一台）
const sqTiers = UNIT_TIERS.map((d) => ({ name: d.en, programs: [d] }));
const sqFilm0 = film(UNIT_TIERS[0]);
const sqTop = platformTopRel(sqFilm0.fwd[sqFilm0.fwd.length - 1], sqFilm0.n);
const sqFoot = TABLE_TOP.stand - sqTop; // 台面落在站姿桌高 1.05 m
console.log('square: platform top rel foot', sqTop.toFixed(3), 'foot', sqFoot.toFixed(3));
const unitA = buildUnit_({
  name: 'square',
  label: { zh: '方台', en: 'square platform' },
  tiers: sqTiers,
  order: UNIT_ORDER,
  angle0: Math.PI / SQUARE.COUNT, // 半格相位：四条带正对四个角
  footWork: sqFoot,
  place: [0, 0],
  lead: 22,
  tail: 15,
  timeline: STD(0),
});

// ---------------------------------------------------------------- 镜头 B：四张目录键谱（同一条布、同一套机构）
const ringDefs = buildRingUnits();
const ringFoot = sqFoot; // 同一个吊挂高度，形不同 ⇒ 平台高低不同
const unitsB = ringDefs.map((d, k) =>
  buildUnit_({
    name: d.key,
    label: { zh: d.key === 'stepped' ? '阶梯方箱' : d.zh, en: d.key === 'stepped' ? 'stepped box' : d.en },
    tiers: [{ name: d.en, programs: [d] }],
    order: new Array(RING.COUNT).fill(0),
    angle0: 0,
    footWork: ringFoot,
    place: [(k - 1.5) * 1.45, 0],
    lead: 58,
    tail: 15,
    timeline: [
      { kind: 'hold', dur: 0.5 },
      { kind: 'hoist', dur: 3.5, program: 0 },
      { kind: 'hold', dur: 0.5 },
      { kind: 'form', dur: 8.5, program: 0 },
      { kind: 'hold', dur: 3.5 },
      { kind: 'retract', dur: 6.0 },
      { kind: 'hold', dur: 0.5 },
      { kind: 'lift', dur: 3.5 },
      { kind: 'hold', dur: 0.5 },
    ],
  }),
);

// ---------------------------------------------------------------- 镜头 C：同一条布换程序（平台 → 收回 → 通道）
const cyc = cycleShapes();
const cFilm = film(cyc[0]);
const cTop = platformTopRel(cFilm.fwd[cFilm.fwd.length - 1], cFilm.n);
const cFoot = 0.3;
console.log('cycle: platform top rel foot', cTop.toFixed(3), '→ platform at', (cFoot + cTop).toFixed(3));
const unitC = buildUnit_({
  name: 'cycle',
  label: { zh: '同一条布', en: 'one band' },
  programLabels: cyc.map((c, k) => ({ zh: `程序${k ? '二' : '一'} · ${c.zh}`, en: `program ${k + 1} · ${c.en}` })),
  tiers: [{ name: 'cycle', programs: cyc.map((s) => ({ key: s.key, spec: s.spec, opts: s.opts, smooth: s.smooth, seam: s.seam })) }],
  order: new Array(RING.COUNT).fill(0),
  angle0: 0,
  footWork: cFoot,
  place: [0, 0],
  lead: 8,
  tail: 5,
  timeline: [
    { kind: 'hold', dur: 0.8 },
    { kind: 'hoist', dur: 4.5, program: 0 },
    { kind: 'hold', dur: 0.4 },
    { kind: 'form', dur: 9.0, program: 0 },
    { kind: 'hold', dur: 2.5 },
    { kind: 'retract', dur: 6.5, program: 0 },
    { kind: 'hold', dur: 0.6 },
    { kind: 'form', dur: 9.5, program: 1 },
    { kind: 'hold', dur: 3.0 },
    { kind: 'retract', dur: 6.5, program: 1 },
    { kind: 'hold', dur: 0.4 },
    { kind: 'lift', dur: 4.5 },
    { kind: 'hold', dur: 0.8 },
  ],
});

// ---------------------------------------------------------------- 比例参考：一个站着的人、一只猫（与台架同一副模型）
const meshOut = (parts, colorOf) =>
  parts.map((p) => {
    const v = p.mesh.verts;
    const verts = [];
    // 世界（X 右、Y 向下、Z 向前，单位 = 世界单位，脚底在 footY）→ Blender（X 右、Y 向后、Z 向上，米）
    for (let k = 0; k < v.length; k += 3) verts.push(R(M(v[k]), 4), R(M(v[k + 2]), 4), R(M(ROOM.FLOOR_Y - v[k + 1]), 4));
    return { tone: p.tone, color: colorOf(p.tone)[1], verts, idx: Array.from(p.mesh.idx) };
  });
const human = meshOut(figureParts({ x: 0, z: 0, footY: ROOM.FLOOR_Y, height: 215, yaw: 0, pose: 'stand', style: HUMAN_STYLE_DEFAULT }), (t) => personColor(t, 0));
const coat = coatOf(1);
const catSit = meshOut(catParts({ x: 0, z: 0, footY: ROOM.FLOOR_Y, unit: UNITS_PER_M, pose: 'sit', coat: coat.coat, yaw: 0 }), (t) => catColor(t, coat));

const out = {
  meta,
  scenes: [
    { key: 'A_square_room', title: '方台 · 一个完整循环', units: [unitA] },
    { key: 'B_catalog', title: '四张键谱 · 同一套机构', units: unitsB },
    { key: 'C_reprogram', title: '同一条布换程序 · 平台 → 通道', units: [unitC] },
  ],
  figures: { human, catSit },
};
writeFileSync(OUT, JSON.stringify(out));
for (const sc of out.scenes)
  for (const u of sc.units) console.log(sc.key, u.name, 'n', u.n, 'samples', u.samples.length, 'bonds', u.tiers.map((t) => t.bonds.length).join('/'), 'dur', u.samples[u.samples.length - 1].t);
console.log('meta', meta);
