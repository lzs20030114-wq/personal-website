// 项目二 · Lab 2-15 整间房的一刻（2026-10-30，作者「出几张看整体房间的视角……单元全都从天花板上下来，错落有致的根据我们的算法来做，
// 也有别的猫……模拟一个空间，渲染图就可以」）：跑与台架同一套仿真，停在第 T 秒，把这一刻导出给 room_scene.py 在 Blender 里搭房间。
//
//   npx -y vite-node scripts/unit-blender/room-export.mjs <out.json> [访客数 6] [猫数 2] [种子 12] [秒 86]
//
// 台架（components/lab/CohabitSpaceBench.tsx）每一帧做的事这里逐条照做，只是不画：
//   仿真按 0.05 s 一段推（MAX_SIM_DT）；每台的台面高度朝「当谁的桌子」匀速走（TABLE_MOVE）；每条带按「成形程度 × (1 − 收回)」
//   与台架同一个取帧函数（pickUnitBands：让路的带走收直回程、多出来的布卷进上夹环）；人按走过的路程推步态、按平滑速度分走 / 站，
//   坐着的按座面解；猫按 catPlacement 摆。
// 带子的形状 = 三档轨迹的关键帧（UnitBaker，与台架同一份）；每一帧扣着哪几颗键另跑一遍同一条引擎、在同样的步数上记下（引擎无随机，逐位相同）。
// 坐标：Blender X = 平面 x、Y = 平面 y、Z = 离地高度（米）；带子的剖面在装置自身系里（x = 离站位圆的径向、z = 离装置原点的高度，向下为负）。
import { writeFileSync } from 'node:fs';
import { COHABIT, CohabitSim, PACE_DEMO, partySizes } from '../../src/lib/space/cohabit.ts';
import {
  DOOR_BASE, DOOR_STEPS, FRAMES, TABLE_MOVE, TABLE_TOP, UNITS_PER_M, UNIT_ORDER, UNIT_TIERS, UnitBaker,
  DOOR_EPS, bandCursors, bandPaths, bandTop, catPlacement, clipToReel, figureYaw, furnitureBoxes, membraneJoins, pickUnitBands,
  platformBand, rigFor, rigYForTop, seatSpecOf, tableTopFor, unitDrop, unitFootY, unitTopY,
} from '../../src/lib/space/cohabit-solid.ts';
import { SKIN, createSkinUnit, buildUnit } from '../../src/lib/space/skin-unit.ts';
import { SQUARE } from '../../src/lib/space/skin-square.ts';
import { FIGURE, ROOM } from '../../src/lib/space/skin-grid.ts';
import { CAT, CAT_HEAD_YAW_MAX, clampHeadYaw, figureParts, catParts, strideOf } from '../../src/lib/space/figure.ts';
import { COATS, OUTFITS, catColor, coatOf, dealLooks, outfitOf, personColor } from '../../components/lab/figurePalette.ts';

const [OUT = 'room.json', PEOPLE = '6', CATS = '2', SEED = '12', T_END = '86'] = process.argv.slice(2);
const N_PEOPLE = Number(PEOPLE), N_CATS = Number(CATS), SEED_N = Number(SEED), T = Number(T_END);
const MAX_SIM_DT = 0.05;
const MOVING = { person: 0.15, cat: 0.06 };
const SPEED_TAU = 0.25;
const BANDS = COHABIT.FACES.BANDS;
const R = (v, d = 5) => Math.round(v * 10 ** d) / 10 ** d;
const U = UNITS_PER_M;

// ---------------------------------------------------------------- 仿真（与台架 makeSim 同一份配置）
const sim = new CohabitSim({
  trigger: 'posture', grid: COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed: SEED_N,
  opening: false, auto: true, faces: true, social: true, catFloor: true,
  cat: { ...COHABIT.CAT_MT, ...COHABIT.CAT_LEVELS.mid }, guide: COHABIT.GUIDE, pace: PACE_DEMO,
});
{
  const half = sim.layout.fieldM / 2;
  const sizes = partySizes(N_PEOPLE);
  sizes.forEach((sz, i) => {
    const a = (i / sizes.length) * 2 * Math.PI + 0.3;
    sim.addParty(Math.cos(a) * half * 0.6, Math.sin(a) * half * 0.6, sz);
  });
  for (let i = 0; i < N_CATS; i++) sim.addCat(sim.layout.units[(i * 5) % sim.layout.units.length]);
}
const layout = sim.layout;
const NU = layout.units.length;

// ---------------------------------------------------------------- 三档轨迹（台架同一份）
const trajs = new UnitBaker().runAll();
const paths = trajs.map((t) => bandPaths(t));
const rig = rigFor(layout, trajs[0]);
const s = rig.s;

// 每一帧扣着哪几颗键：同一条引擎、同样的取帧步数（TrajectoryBaker：正向 FRAMES.form 帧、回程 FRAMES.retract 帧，首尾都取）
const spread = (k, total) => Array.from({ length: k }, (_, i) => Math.round((i / (k - 1)) * total));
const lockFrames = UNIT_TIERS.map((def) => {
  const u = createSkinUnit(def.spec, def.opts);
  const key = () => new Set(u.locked.map(([i, j]) => `${i}-${j}`));
  const out = [key()];
  const formAt = new Set(spread(FRAMES.form, SKIN.STEPS));
  for (let st = 1; st <= SKIN.STEPS; st++) {
    u.advance();
    if (formAt.has(st)) out.push(key());
  }
  out.push(key());
  const retAt = new Set(spread(FRAMES.retract, SKIN.STEPS));
  for (let st = 1; st <= SKIN.STEPS; st++) {
    u.retractStep();
    if (retAt.has(st)) out.push(key());
  }
  if (out.length !== FRAMES.form + FRAMES.retract) throw new Error(`键的取帧数 ${out.length} 对不上轨迹`);
  // 之后的升降帧与过渡帧没有扣着的键；让路段从成形态起按同样的取帧步数解键（fork 出来回程到 r = 1，与 TrajectoryBaker 同）
  return out;
});
const doorLocks = UNIT_TIERS.map((def) => {
  const u = createSkinUnit(def.spec, def.opts);
  for (let st = 0; st < SKIN.STEPS; st++) u.advance();
  const key = () => new Set(u.locked.map(([i, j]) => `${i}-${j}`));
  const out = [key()];
  const at = new Set(spread(FRAMES.door, DOOR_STEPS));
  for (let st = 1; st <= DOOR_STEPS; st++) {
    u.retractStep(1.0);
    if (at.has(st)) out.push(key());
  }
  return out;
});
const bondsOf = UNIT_TIERS.map((def) => {
  const seen = new Map();
  for (const ch of buildUnit(def.spec).chains) for (const [i, j, rb] of ch) if (!seen.has(`${i}-${j}`)) seen.set(`${i}-${j}`, { i, j, rb, programs: [0] });
  return [...seen.values()];
});

// ---------------------------------------------------------------- 跑到第 T 秒（台架每帧做的事按每段 0.05 s 做一遍）
const cursors = bandCursors(NU * BANDS);
const frameOf = new Int32Array(NU * BANDS);
const reelOf = new Int32Array(NU);
const tableTop = new Float64Array(NU).fill(TABLE_TOP.stand);
const motion = new Map();
const track = (who, x, y) => {
  const m = motion.get(who);
  if (!m) {
    const fresh = { x, y, t: sim.t, dist: 0, speed: 0 };
    motion.set(who, fresh);
    return fresh;
  }
  const dt = sim.t - m.t;
  if (dt > 0) {
    const d = Math.hypot(x - m.x, y - m.y);
    if (d < 1) {
      m.dist += d;
      m.speed += (d / dt - m.speed) * (1 - Math.exp(-dt / SPEED_TAU));
    }
    m.x = x; m.y = y; m.t = sim.t;
  }
  return m;
};
// 穿着与花色：台架每场洗一副牌、按出场顺序发；这里用固定种子洗，结果可复现
let rs = SEED_N * 2654435761 >>> 0;
const rand = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const dealP = dealLooks(OUTFITS.length, rand);
const dealC = dealLooks(COATS.length, rand);
const lookP = new Map();
const lookC = new Map();
const lookOf = (who, map, deal) => {
  if (!map.has(who)) map.set(who, deal());
  return map.get(who);
};

const update = (dtT) => {
  const want = new Float64Array(NU).fill(TABLE_TOP.stand);
  if (sim.furn) for (let u = 0; u < NU; u++) if (sim.tableBy[u] >= 0) want[u] = tableTopFor(sim.furn.rects[sim.tableBy[u]]);
  for (let u = 0; u < NU; u++) {
    const deg = sim.act.degree[u];
    if (unitDrop(deg) <= 1e-3) tableTop[u] = want[u];
    else {
      const d = want[u] - tableTop[u];
      tableTop[u] += Math.sign(d) * Math.min(Math.abs(d), TABLE_MOVE * dtT);
    }
    reelOf[u] = pickUnitBands(u, deg, sim.bandOpen, trajs, paths, cursors, frameOf);
  }
  for (const p of sim.people) {
    lookOf(p, lookP, dealP);
    const { x, y } = sim.drawPos(p);
    track(p, x, y);
  }
  for (const c of sim.cats) {
    lookOf(c, lookC, dealC);
    track(c, c.walker.x, c.walker.y);
  }
};
update(0);
while (sim.t < T - 1e-9) {
  sim.step(MAX_SIM_DT);
  update(MAX_SIM_DT);
}

// ---------------------------------------------------------------- 这一刻：单元
const usedShapes = new Map(); // `${tier}_${frame}` → 剖面
const shapeKey = (tier, k, reel) => {
  const n = trajs[tier].n;
  const clip = bandTop(trajs[tier], k) > bandTop(trajs[0], reel) + 1e-9;
  const key = clip ? `${tier}_${k}_${reel}` : `${tier}_${k}`;
  if (!usedShapes.has(key)) {
    const f = clip ? clipToReel(trajs[tier].frames[k], n, bandTop(trajs[0], reel)) : trajs[tier].frames[k];
    const locks = k < lockFrames[tier].length ? lockFrames[tier][k] : k >= DOOR_BASE ? doorLocks[tier][k - DOOR_BASE] : new Set();
    usedShapes.set(key, {
      tier, frame: k,
      x: Array.from(f.subarray(0, n), (v) => R((s * v * 100) / U)),
      z: Array.from(f.subarray(n, 2 * n), (v) => R((s * v * 100) / U)),
      L: bondsOf[tier].map((b) => locks.has(`${b.i}-${b.j}`)),
    });
  }
  return key;
};
const units = [];
let mixed = 0;
for (let u = 0; u < NU; u++) {
  const deg = sim.act.degree[u];
  const drop = unitDrop(deg);
  const workY = rigYForTop(rig, trajs[0], tableTop[u]);
  const top = unitTopY(rig, drop, workY);
  const topM = (ROOM.FLOOR_Y - top) / U;
  const footM = (ROOM.FLOOR_Y - unitFootY(rig, trajs[0].footY, drop, workY)) / U;
  const bands = [];
  for (let j = 0; j < BANDS; j++) bands.push(shapeKey(UNIT_ORDER[j], frameOf[u * BANDS + j], reelOf[u]));
  if (new Set(frameOf.subarray(u * BANDS, (u + 1) * BANDS)).size > 1) mixed++;
  const mem = [];
  for (let j = 0; j < BANDS; j++) {
    const j2 = (j + 1) % BANDS;
    mem.push(membraneJoins(frameOf[u * BANDS + j], frameOf[u * BANDS + j2], FRAMES, sim.bandOpen[u * BANDS + j] > DOOR_EPS, sim.bandOpen[u * BANDS + j2] > DOOR_EPS));
  }
  units.push({
    x: R(layout.units[u].x), y: R(layout.units[u].y), deg: R(deg, 3), drop: R(drop, 3), table: R(tableTop[u], 3),
    top: R(topM), foot: R(footM), carriage: R(topM + (s * bandTop(trajs[0], reelOf[u]) * 100) / U), bands, mem,
    role: sim.tableBy[u] >= 0 ? `table:${sim.furn.rects[sim.tableBy[u]].kind}` : '',
  });
}

// ---------------------------------------------------------------- 人、猫、家具（Blender 坐标、米）
const meshOut = (parts, colorOf) =>
  parts.map((p) => {
    const v = p.mesh.verts;
    const verts = [];
    for (let k = 0; k < v.length; k += 3) verts.push(R(v[k] / U, 4), R(v[k + 2] / U, 4), R((ROOM.FLOOR_Y - v[k + 1]) / U, 4));
    return { tone: p.tone, color: colorOf(p.tone)[1], verts, idx: Array.from(p.mesh.idx) };
  });
const STRIDE_M = strideOf(FIGURE.HEIGHT) / U;
const frac = (v) => v - Math.floor(v);
const people = sim.people.map((p) => {
  const variant = lookP.get(p);
  const style = outfitOf(variant).style;
  const mo = motion.get(p);
  const seat = p.seated && p.seat !== null ? sim.seats[p.seat] : null;
  const rect = seat && sim.furn ? sim.furn.rects[seat.furn] : null;
  let heading = p.walker.heading;
  let { x, y } = sim.drawPos(p);
  const spec = { height: FIGURE.HEIGHT, style, pose: 'stand' };
  let state = 'stand';
  if (seat && rect) {
    const sp = seatSpecOf(rect, seat);
    Object.assign(spec, { pose: 'sit', lean: p.watching !== null && !p.ignores, seat: { top: sp.top * U, front: sp.front * U, back: sp.back * U, thick: sp.thick * U, backTop: sp.backTop * U } });
    heading = Math.atan2(seat.face[1], seat.face[0]);
    x = seat.x;
    y = seat.y;
    state = 'sit';
  } else if (mo.speed > MOVING.person) {
    Object.assign(spec, { pose: 'walk', phase: frac(mo.dist / STRIDE_M) });
    state = 'walk';
  }
  const parts = figureParts({ ...spec, x: x * U, z: y * U, footY: ROOM.FLOOR_Y, yaw: figureYaw(heading), headYaw: clampHeadYaw(p.walker.gaze - heading) });
  return { state, outfit: OUTFITS[variant].name, parts: meshOut(parts, (tone) => personColor(tone, variant)) };
});
const band = platformBand(rig, trajs);
const cats = sim.cats.map((c) => {
  const look = coatOf(lookC.get(c));
  const mo = motion.get(c);
  const support = sim.supportOf(c);
  const formed = support.length > 0 && support.every((u) => sim.act.degree[u.i] >= 1 - 1e-3);
  const pl = catPlacement({ x: c.walker.x, y: c.walker.y, heading: c.walker.heading, state: c.state }, support, formed, mo.speed > MOVING.cat, layout, band);
  const under = support.length ? Math.max(...support.map((u) => tableTop[u.i])) : TABLE_TOP.stand;
  const footY = pl.onPlatform ? ROOM.FLOOR_Y - under * U - pl.lift * U : ROOM.FLOOR_Y;
  const parts = catParts({
    x: pl.x * U, z: pl.y * U, footY, unit: U, pose: pl.pose, tail: pl.tail, bend: pl.bend,
    phase: pl.pose === 'walk' ? frac(mo.dist / CAT.STRIDE) : 0, coat: look.coat,
    yaw: figureYaw(pl.heading), headYaw: clampHeadYaw(pl.headTurn, CAT_HEAD_YAW_MAX),
  });
  return { coat: look.name, pose: pl.pose, onPlatform: pl.onPlatform, parts: meshOut(parts, (tone) => catColor(tone, look)) };
});
const furniture = (sim.furn?.rects ?? []).flatMap((r) =>
  furnitureBoxes([r]).map((b) => ({ kind: r.kind, c: [R(b.cx / U), R(b.cz / U), R((ROOM.FLOOR_Y - b.cy) / U)], h: [R(b.hx / U), R(b.hz / U), R(b.hy / U)] })),
);

const out = {
  meta: {
    fps: 24, s: R(s, 6), unitsPerM: U,
    stationR: R((SQUARE.RADIUS * s) / U), segM: R((s * SKIN.SEG * 100) / U, 6), ceiling: R(ROOM.FLOOR_Y / U),
    bandWidth: R((SQUARE.DEPTH * s) / U), bandCount: BANDS, pitch: R(layout.pitchM), roomM: R(layout.roomM),
  },
  scene: { people: N_PEOPLE, cats: N_CATS, seed: SEED_N, t: R(sim.t, 2) },
  n: trajs[0].n,
  angle0: Math.PI / SQUARE.COUNT,
  order: UNIT_ORDER,
  tiers: UNIT_TIERS.map((d, t) => ({ name: d.en, mid: trajs[t].mid, midHalf: trajs[t].midHalf, bonds: bondsOf[t].map((b) => ({ i: b.i, j: b.j, rb: R((s * b.rb * 100) / U), programs: [0] })) })),
  shapes: Object.fromEntries(usedShapes),
  units,
  people,
  cats,
  furniture,
};
writeFileSync(OUT, JSON.stringify(out));
const down = units.filter((u) => u.drop > 0.99);
console.log(`t ${sim.t.toFixed(2)} s · 落下 ${down.length} 台（成形 ${units.filter((u) => u.deg > 0.99).length}）· 混合帧单元 ${mixed} · 当桌子 ${units.filter((u) => u.role).length} · 形状 ${usedShapes.size} 种`);
console.log('落下的：', down.map((u) => `(${u.x.toFixed(2)},${u.y.toFixed(2)}) 台面 ${u.table} ${u.role}`).join(' | '));
console.log('人：', people.map((p) => p.state).join(' '), ' 猫：', cats.map((c) => `${c.coat}·${c.pose}${c.onPlatform ? '·台上' : ''}`).join(' '));
