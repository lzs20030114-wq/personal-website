// 项目二 · Lab 2-15 效果图（2026-11-08，作者「依据 lab2-15 的场景具体化建模和渲染，要有成熟的竞赛效果图的完成度，
// 包括建模细节、构图角度、光影质感、人物互动和猫」）。跑与台架同一套仿真，停在第 T 秒，把这一刻导出给 cafe_scene.py。
//
//   npx -y vite-node scripts/unit-blender/cafe-export.mjs scan <out.json> [访客 6] [猫 2] [种子 11] [秒 240]
//   npx -y vite-node scripts/unit-blender/cafe-export.mjs export <out.json> [访客 6] [猫 2] [种子 11] [秒 86]
//
// 与 room-export.mjs（10-30 那次整间房的静帧）的差别：那时还没有两层的台、蒙皮与薄台面。这里照 CohabitSpaceBench 现在每一帧
// 做的事逐条照做（只是不画）：仿真按 0.05 s 一段推；台面朝「当谁的桌子」匀速走（两层的下台在 SHELTER.lowerTop）；
// 每台开始落下时按 unitFormPlan 抽形（平台 / 有顶的一台 / 整圈两层，两组轨迹一开始就烘好，相当于台架烘完之后的稳态）；
// 每条带按 pickUnitBands 取帧；蒙皮按台架同一套几何（shellCoverVerts / shellGoreVerts，静止态整台 bakeUnitShell 那一路）。
// 导出的蒙皮是世界坐标（Blender 系：X = 平面 x，Y = 平面 y，Z = 离地高度，米），一台一份网格。
// 人：导出骨架（humanSkeleton，按座面解出来的坐姿、步态相位、看猫时前倾）与头的枢轴、视线；Blender 那边按关节摆真实比例的人。
// 猫：导出 catPlacement 的摆法（位置、朝向、头转、姿态、尾巴、绕立杆弯的半径、脚下台面高度）。
import { writeFileSync } from 'node:fs';
import { COHABIT, CohabitSim, PACE_DEMO, bandAngle, partySizes } from '../../src/lib/space/cohabit.ts';
import {
  FRAMES, SHELTER, SHELL_END_LOW, STEADY, STOWED_STRIDE, TABLE_MOVE, TABLE_TOP, UNITS_PER_M, UNIT_DUAL_DEFS, UNIT_DUAL_OPTS, UNIT_ORDER, UNIT_TIERS,
  UnitBaker, DOOR_EPS, bandCursors, bandPaths, bandTop, bakeUnitShell, catPlacement, decimateTrajectory, figureYaw,
  pickUnitBands, platformBand, rigFor, rigYForTop, seatSpecOf, shellCoverVerts, shellGoreVerts, shellJoins, tableTopFor, unitDrop, unitFootY,
  unitFormPlan, unitTopY,
} from '../../src/lib/space/cohabit-solid.ts';
import { SQUARE } from '../../src/lib/space/skin-square.ts';
import { SKIN } from '../../src/lib/space/skin-unit.ts';
import { FIGURE, ROOM } from '../../src/lib/space/skin-grid.ts';
import { CAT, CAT_HEAD_YAW_MAX, catRig, clampHeadYaw, figureParts, humanRig, humanSkeleton, placeRigParts, strideOf } from '../../src/lib/space/figure.ts';
import { COATS, OUTFITS, catColor, dealLooks, personColor } from '../../components/lab/figurePalette.ts';

const [MODE = 'scan', OUT = 'cafe.json', PEOPLE = '6', CATS = '2', SEED = '11', T_ARG = '240'] = process.argv.slice(2);
const N_PEOPLE = Number(PEOPLE), N_CATS = Number(CATS), SEED_N = Number(SEED), T = Number(T_ARG);
const MAX_SIM_DT = 0.05;
const MOVING = { person: 0.15, cat: 0.06 };
const SPEED_TAU = 0.25;
const BANDS = COHABIT.FACES.BANDS;
const U = UNITS_PER_M;
const R = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

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

// ---------------------------------------------------------------- 两组轨迹（平台三档 + 两层六条），台架同一份
const t0 = Date.now();
const trajs = new UnitBaker().runAll();
const dual = new UnitBaker(UNIT_DUAL_DEFS, FRAMES, UNIT_DUAL_OPTS).runAll();
console.error(`轨迹烘完 ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const tracks = [...trajs, ...dual];
const paths = tracks.map((t) => bandPaths(t));
const DUAL_BOTH = 3, DUAL_LOWER = 6;
const rig = rigFor(layout, trajs[0]);
const s = rig.s;
const low = trajs.map((t) => decimateTrajectory(t, STOWED_STRIDE));

// ---------------------------------------------------------------- 状态（台架每帧做的事）
const cursors = bandCursors(NU * BANDS);
const frameOf = new Int32Array(NU * BANDS);
const reelOf = new Int32Array(NU);
const tableTop = new Float64Array(NU).fill(TABLE_TOP.stand);
const roofOn = new Uint8Array(NU), planSet = new Uint8Array(NU), dropSerial = new Int32Array(NU);
const roofToward = new Float64Array(NU).fill(NaN);
const roofForm = new Array(NU).fill('flat');
const orders = layout.units.map(() => UNIT_ORDER);
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
// 穿着与花色：固定种子洗牌、按出场顺序发（台架每场随机洗；这里要可复现）
let rs = (SEED_N * 2654435761) >>> 0;
const rand = () => ((rs = (rs * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const dealP = dealLooks(OUTFITS.length, rand);
const dealC = dealLooks(COATS.length, rand);
const lookP = new Map(), lookC = new Map();
const lookOf = (who, map, deal) => {
  if (!map.has(who)) map.set(who, deal());
  return map.get(who);
};

const update = (dtT) => {
  const want = new Float64Array(NU).fill(TABLE_TOP.stand);
  if (sim.furn) for (let u = 0; u < NU; u++) if (sim.tableBy[u] >= 0) want[u] = tableTopFor(sim.furn.rects[sim.tableBy[u]]);
  const seated = sim.people.filter((p) => p.seated && p.seat !== null).map((p) => sim.seats[p.seat]);
  for (let u = 0; u < NU; u++) {
    const deg = sim.act.degree[u];
    if (deg <= 1e-4) {
      planSet[u] = 0; roofOn[u] = 0; orders[u] = UNIT_ORDER; roofForm[u] = 'flat'; roofToward[u] = NaN;
    } else if (!planSet[u]) {
      planSet[u] = 1;
      const serial = dropSerial[u]++;
      const plan = sim.furn
        ? unitFormPlan({
            seed: SEED_N, unit: u, serial, layout, at: layout.units[u], seated, rects: sim.furn.rects,
            tableUnit: sim.tableBy[u] >= 0 || sim.seats.some((st) => st.table === u), count: BANDS,
          })
        : null;
      if (plan && plan.bands) {
        const bands = plan.bands;
        roofOn[u] = 1;
        roofForm[u] = plan.form;
        roofToward[u] = plan.toward ?? NaN;
        orders[u] = UNIT_ORDER.map((t, j) => (bands[j] ? DUAL_BOTH : DUAL_LOWER) + t);
      }
    }
    if (roofOn[u]) want[u] = SHELTER.lowerTop;
    const drop = unitDrop(deg);
    if (drop <= 1e-3) tableTop[u] = want[u];
    else {
      const d = want[u] - tableTop[u];
      tableTop[u] += Math.sign(d) * Math.min(Math.abs(d), TABLE_MOVE * dtT);
    }
    reelOf[u] = pickUnitBands(u, deg, sim.bandOpen, tracks, paths, cursors, frameOf, orders[u]);
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

const band = platformBand(rig, trajs);
const catNow = (c) => {
  const mo = motion.get(c);
  const support = sim.supportOf(c);
  const formed = support.length > 0 && support.every((u) => sim.act.degree[u.i] >= 1 - 1e-3);
  const roof = formed && support.length === 1 && roofOn[support[0].i] && !Number.isNaN(roofToward[support[0].i]) ? roofToward[support[0].i] : undefined;
  const pl = catPlacement({ x: c.walker.x, y: c.walker.y, heading: c.walker.heading, state: c.state }, support, formed, mo.speed > MOVING.cat, layout, band, roof);
  const under =
    support.length === 2 && pl.t !== undefined
      ? tableTop[support[0].i] + (tableTop[support[1].i] - tableTop[support[0].i]) * pl.t
      : support.length
        ? Math.max(...support.map((u) => tableTop[u.i]))
        : TABLE_TOP.stand;
  return { pl, support, formed, under, roof };
};

// ---------------------------------------------------------------- 扫一遍：每 0.5 s 记这一刻热不热闹
const scanRows = [];
const sample = () => {
  let down = 0, formed = 0, roofed = 0, tables = 0, doors = 0, moving = 0, roofCat = 0;
  for (let u = 0; u < NU; u++) {
    if (unitDrop(sim.act.degree[u]) > 0.99) down++;
    if (sim.act.degree[u] > 0.01 && sim.act.degree[u] < 0.995) moving++;
    if (sim.act.degree[u] > 0.999) formed++;
    if (roofOn[u] && sim.act.degree[u] > 0.999) roofed++;
    if (sim.tableBy[u] >= 0 && sim.act.degree[u] > 0.999) tables++;
    if (unitDrop(sim.act.degree[u]) > 0.99) for (let j = 0; j < BANDS; j++) if (sim.bandOpen[u * BANDS + j] > DOOR_EPS) { doors++; break; }
  }
  const seatedN = sim.people.filter((p) => p.seated).length;
  const walking = sim.people.filter((p) => !p.seated && motion.get(p).speed > MOVING.person).length;
  const catInfo = sim.cats.map((c) => {
    const { pl, support, roof } = catNow(c);
    // 有顶的台里、正对着一个坐着的人（1.6 m 内）
    let face = '';
    if (roof !== undefined) {
      for (const p of sim.people)
        if (p.seated && p.seat !== null) {
          const st = sim.seats[p.seat];
          if (Math.hypot(st.x - support[0].x, st.y - support[0].y) < 1.6) face = 'roof+seated';
        }
    }
    return `${pl.pose}${pl.onPlatform ? '@台' : '@地'}${roof !== undefined ? '·顶' : ''}${face ? '·对人' : ''}`;
  });
  const watching = sim.people.filter((p) => p.watching !== null && p.watching !== undefined && !p.ignores).length;
  scanRows.push({ t: R(sim.t, 2), down, formed, roofed, tables, doors, moving, seated: seatedN, walking, watching, cats: catInfo, events: { ...sim.ledger.counts } });
};

update(0);
let nextSample = 0;
while (sim.t < T - 1e-9) {
  sim.step(MAX_SIM_DT);
  update(MAX_SIM_DT);
  if (MODE === 'scan' && sim.t >= nextSample - 1e-9) {
    sample();
    nextSample += 0.5;
  }
}

if (MODE === 'scan') {
  writeFileSync(OUT, JSON.stringify(scanRows));
  // 打分：坐着的人、落成的桌子、有顶的台、台上的猫、对着人的猫、看猫的人；有门开着减一点（画面里一台缺几条带）
  const score = (r) =>
    r.seated * 1.0 + r.tables * 1.2 + r.roofed * 1.5 + r.walking * 0.4 + r.watching * 1.2 +
    r.cats.filter((c) => c.includes('@台')).length * 1.5 + r.cats.filter((c) => c.includes('对人')).length * 3 - r.doors * 0.3;
  const best = [...scanRows].sort((a, b) => score(b) - score(a)).slice(0, 20);
  for (const r of best) console.log(score(r).toFixed(1), JSON.stringify(r));
  process.exit(0);
}

// ---------------------------------------------------------------- 导出：坐标换算
// 台架世界：x = 平面 x·U、z = 平面 y·U、y 向下为正（地面在 ROOM.FLOOR_Y）；MeshPlace 先绕 Y 转 yaw（x' = x c − z s，z' = x s + z c）
// 再缩放 s、平移。Blender：X = x/U，Y = z/U，Z = (FLOOR − y)/U。
const toB = (x, y, z) => [R(x / U), R(z / U), R((ROOM.FLOOR_Y - y) / U)];
const place = (verts, yaw, sc, tx, ty, tz) => {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const out = new Array(verts.length);
  for (let k = 0; k < verts.length; k += 3) {
    const x = verts[k] * sc, y = verts[k + 1] * sc, z = verts[k + 2] * sc;
    const b = toB(x * c - z * sn + tx, y + ty, x * sn + z * c + tz);
    out[k] = b[0]; out[k + 1] = b[1]; out[k + 2] = b[2];
  }
  return out;
};

// ---------------------------------------------------------------- 单元
const units = [];
for (let u = 0; u < NU; u++) {
  const deg = sim.act.degree[u];
  const drop = unitDrop(deg);
  const order = orders[u];
  const lead = tracks[order[0]];
  const workY = rigYForTop(rig, lead, tableTop[u]);
  const top = unitTopY(rig, drop, workY);
  const reel = reelOf[u];
  const reelTop = bandTop(lead, reel);
  const c = rig.cells[u];
  const roof = roofOn[u] === 1;
  const ks = Array.from(frameOf.subarray(u * BANDS, (u + 1) * BANDS));
  const allStowed = ks.every((k) => k === STEADY.stowed);
  const allStraight = ks.every((k) => k === STEADY.straight);
  const allFormed = ks.every((k) => k === STEADY.formed);
  // 蒙皮：静止态整台（与台架同一路），其余逐条带 + 逐道接缝
  const cover = [], coverIdx = [], gore = [], goreIdx = [];
  const push = (dst, dstIdx, m, yaw) => {
    const base = dst.length / 3;
    dst.push(...place(m.verts, yaw, s, c.x, top, c.z));
    for (const i of m.idx) dstIdx.push(i + base);
  };
  let state;
  if (!roof && (allStowed || allStraight || allFormed)) {
    state = allStowed ? 'stowed' : allStraight ? 'straight' : 'formed';
    const src = allStowed ? low : trajs;
    const frame = allStowed ? STEADY.stowed : allStraight ? STEADY.straight : STEADY.formed;
    const end = allStowed ? SHELL_END_LOW : undefined;
    for (let j = 0; j < BANDS; j++) {
      push(cover, coverIdx, shellCoverVerts(src[UNIT_ORDER[j]], frame, undefined, end), bandAngle(j));
      const j2 = (j + 1) % BANDS;
      push(gore, goreIdx, shellGoreVerts(src[UNIT_ORDER[j]], frame, src[UNIT_ORDER[j2]], frame, BANDS, undefined, end), bandAngle(j));
    }
  } else {
    state = roof ? `roof-${roofForm[u]}` : 'mixed';
    for (let j = 0; j < BANDS; j++) {
      const fk = ks[j];
      const clip = bandTop(tracks[order[j]], fk) > reelTop + 1e-9;
      push(cover, coverIdx, shellCoverVerts(tracks[order[j]], fk, clip ? reelTop : undefined), bandAngle(j));
      const j2 = (j + 1) % BANDS;
      const kb = ks[j2];
      const doorA = sim.bandOpen[u * BANDS + j] > DOOR_EPS;
      const doorB = sim.bandOpen[u * BANDS + j2] > DOOR_EPS;
      if (!shellJoins(fk, kb, undefined, doorA, doorB)) continue;
      const clipB = bandTop(tracks[order[j2]], kb) > reelTop + 1e-9;
      const reelArg = fk === kb && !clip && !clipB ? undefined : reelTop;
      push(gore, goreIdx, shellGoreVerts(tracks[order[j]], fk, tracks[order[j2]], kb, BANDS, reelArg), bandAngle(j));
    }
  }
  const topM = (ROOM.FLOOR_Y - top) / U;
  const footM = (ROOM.FLOOR_Y - unitFootY(rig, lead.footY, drop, workY)) / U;
  let doors = 0;
  for (let j = 0; j < BANDS; j++) if (sim.bandOpen[u * BANDS + j] > DOOR_EPS) doors++;
  units.push({
    i: u, x: R(layout.units[u].x), y: R(layout.units[u].y), deg: R(deg, 3), drop: R(drop, 3), table: R(tableTop[u], 3), state, doors,
    role: sim.tableBy[u] >= 0 ? `table:${sim.furn.rects[sim.tableBy[u]].kind}` : roof ? `cat:${roofForm[u]}` : drop > 0.99 ? 'cat:flat' : '',
    toward: Number.isNaN(roofToward[u]) ? null : R(roofToward[u]),
    top: R(topM), foot: R(footM), carriage: R(topM + (s * reelTop * 100) / U),
    cover, coverIdx, gore, goreIdx,
  });
}

// ---------------------------------------------------------------- 人：骨架（真实比例的人按它摆）
const H = FIGURE.HEIGHT;
const STRIDE_M = strideOf(H) / U;
const frac = (v) => v - Math.floor(v);
const people = sim.people.map((p, k) => {
  const variant = lookP.get(p);
  const outfit = OUTFITS[variant];
  const mo = motion.get(p);
  const seat = p.seated && p.seat !== null ? sim.seats[p.seat] : null;
  const rect = seat && sim.furn ? sim.furn.rects[seat.furn] : null;
  let heading = p.walker.heading;
  let { x, y } = sim.drawPos(p);
  let pose = 'stand', phase = 0, seatSpec, lean = false, seatM = null;
  if (seat && rect) {
    pose = 'sit';
    const sp = seatSpecOf(rect, seat);
    seatM = sp;
    seatSpec = { top: sp.top / 1.7, front: sp.front / 1.7, back: sp.back / 1.7, thick: sp.thick / 1.7, backTop: sp.backTop / 1.7 };
    lean = p.watching !== null && p.watching !== undefined && !p.ignores;
    heading = Math.atan2(seat.face[1], seat.face[0]);
    x = seat.x; y = seat.y;
  } else if (mo.speed > MOVING.person) {
    pose = 'walk';
    phase = frac(mo.dist / STRIDE_M);
  }
  const sk = humanSkeleton(pose, { phase, seat: seatSpec, lean });
  const rigH = humanRig({ height: H, pose, phase, lean, seat: seatSpec && { top: seatSpec.top * H, front: seatSpec.front * H, back: seatSpec.back * H, thick: seatSpec.thick * H, backTop: seatSpec.backTop * H } });
  const yaw = figureYaw(heading);
  const P = (j) => place([j[0] * H, -j[1] * H, j[2] * H], yaw, 1, x * U, ROOM.FLOOR_Y, y * U);
  const pivot = place(rigH.pivot, yaw, 1, x * U, ROOM.FLOOR_Y, y * U);
  const headRel = clampHeadYaw(p.walker.gaze - heading);
  // 台架同一副方块人（figure.ts），按穿着表上色，世界坐标（Blender 系、米）：效果图里的人就画它
  const blocks = figureParts({
    height: H, style: outfit.style, pose, phase, lean,
    seat: seatSpec && { top: seatSpec.top * H, front: seatSpec.front * H, back: seatSpec.back * H, thick: seatSpec.thick * H, backTop: seatSpec.backTop * H },
    x: x * U, z: y * U, footY: ROOM.FLOOR_Y, yaw: figureYaw(heading), headYaw: headRel,
  }).map((pt) => {
    const v = pt.mesh.verts;
    const verts = [];
    for (let k = 0; k < v.length; k += 3) verts.push(R(v[k] / U), R(v[k + 2] / U), R((ROOM.FLOOR_Y - v[k + 1]) / U));
    return { tone: pt.tone, color: personColor(pt.tone, variant)[1], verts, idx: Array.from(pt.mesh.idx) };
  });
  // 视线（平面方位角）：身子朝向 + 头转（夹在 ±75°）；看着的猫在哪也给出来，Blender 那边让头对着它
  const gaze = heading + headRel;
  const watchCat = p.watching !== null && p.watching !== undefined ? sim.cats.findIndex((c) => c.id === p.watching) : -1;
  return {
    k, pose, phase: R(phase, 3), lean, x: R(x), y: R(y), heading: R(heading), gaze: R(gaze), watchCat,
    party: p.party ?? null, seated: !!seat, seatFurn: seat ? seat.furn : null, seatTable: seat ? seat.table ?? null : null,
    outfit: { name: outfit.name, style: outfit.style, colors: outfit.colors, variant },
    blocks,
    joints: {
      legs: sk.legs.map((l) => ({ hip: P(l.hip), knee: P(l.knee), ankle: P(l.ankle), pitch: R(l.pitch), out: R(l.out) })),
      arms: sk.arms.map((a) => ({ shoulder: P(a.shoulder), elbow: P(a.elbow), wrist: P(a.wrist) })),
      neck: pivot,
    },
    seat: seatM && Object.fromEntries(Object.entries(seatM).map(([kk, v]) => [kk, R(v)])),
  };
});

// ---------------------------------------------------------------- 猫：摆法
const cats = sim.cats.map((c, k) => {
  const look = COATS[lookC.get(c)];
  const { pl, support, under, roof } = catNow(c);
  const footZ = pl.onPlatform ? under + pl.lift : 0;
  // 台架同一副方块猫（figure.ts 的 catRig，与 CohabitSpaceBench 同一组参数），世界坐标（Blender 系、米）。
  // 每块标明挂在身子上还是头上，并给出头的枢轴：Blender 那边的逗猫棒要让头转向羽毛，只转头上的块
  const footY = ROOM.FLOOR_Y - footZ * U;
  const rig = catRig({ unit: U, pose: pl.pose, tail: pl.tail, bend: pl.bend, phase: pl.pose === 'walk' ? frac(motion.get(c).dist / CAT.STRIDE) : 0, coat: look.coat });
  const yaw = figureYaw(pl.heading);
  const toB = (x, y, z) => [R(x / U), R(z / U), R((ROOM.FLOOR_Y - y) / U)];
  const blocks = placeRigParts(rig, pl.x * U, footY, pl.y * U, yaw, clampHeadYaw(pl.headTurn, CAT_HEAD_YAW_MAX)).map((pt, i) => {
    const v = pt.mesh.verts;
    const verts = [];
    for (let k = 0; k < v.length; k += 3) verts.push(...toB(v[k], v[k + 1], v[k + 2]));
    return { tone: pt.tone, on: rig.parts[i].on, color: catColor(pt.tone, look)[1], verts, idx: Array.from(pt.mesh.idx) };
  });
  const pc = Math.cos(yaw), ps = Math.sin(yaw);
  const headPivot = toB(rig.pivot[0] * pc - rig.pivot[2] * ps + pl.x * U, rig.pivot[1] + footY, rig.pivot[0] * ps + rig.pivot[2] * pc + pl.y * U);
  return {
    blocks, headPivot, headYawMax: R(CAT_HEAD_YAW_MAX),
    k, coat: look.coat, coatName: look.name, colors: Object.fromEntries(Object.entries(look.colors).map(([kk, v]) => [kk, v[1]])), state: c.state, pose: pl.pose, tail: pl.tail, bend: R(pl.bend), onPlatform: pl.onPlatform,
    x: R(pl.x), y: R(pl.y), z: R(footZ), heading: R(pl.heading), headTurn: R(clampHeadYaw(pl.headTurn, CAT_HEAD_YAW_MAX)),
    support: support.map((u) => ({ i: u.i, x: R(u.x), y: R(u.y) })), roofToward: roof === undefined ? null : R(roof),
  };
});

// ---------------------------------------------------------------- 家具与房间
const furniture = (sim.furn?.rects ?? []).map((r, i) => ({
  i, kind: r.kind, x0: R(r.x0), x1: R(r.x1), y0: R(r.y0), y1: R(r.y1), cx: R(r.cx), cy: R(r.cy), face: r.face, ergo: !!r.ergo,
}));
const seats = sim.seats.map((st, i) => ({ i, x: R(st.x), y: R(st.y), face: st.face, furn: st.furn, table: st.table ?? null }));
const occupied = new Set(sim.people.filter((p) => p.seated && p.seat !== null).map((p) => p.seat));

const out = {
  meta: {
    fps: 24, s: R(s, 6), unitsPerM: U,
    stationR: R((SQUARE.RADIUS * s) / U), segM: R((s * SKIN.SEG * 100) / U, 6), ceiling: R(ROOM.FLOOR_Y / U),
    bandWidth: R((SQUARE.DEPTH * s) / U), bandCount: BANDS, pitch: R(layout.pitchM), roomM: R(layout.roomM),
    platformR: band, mastR: R(layout.mastR), shelter: SHELTER, tableTop: TABLE_TOP,
  },
  scene: { people: N_PEOPLE, cats: N_CATS, seed: SEED_N, t: R(sim.t, 2), counts: { ...sim.ledger.counts } },
  n: trajs[0].n,
  units,
  people,
  cats,
  furniture,
  seats: seats.map((st) => ({ ...st, occupied: occupied.has(st.i) })),
  doors: [[R(-layout.roomM / 2), 0], [R(layout.roomM / 2), 0]],
};
writeFileSync(OUT, JSON.stringify(out));
const down = units.filter((u) => u.drop > 0.99);
console.log(`t ${sim.t.toFixed(2)} s · 落下 ${down.length} 台 · 有门 ${units.filter((u) => u.doors).length}`);
console.log('落下的：', down.map((u) => `#${u.i}(${u.x.toFixed(2)},${u.y.toFixed(2)}) ${u.state} 台面 ${u.table} ${u.role}`).join('\n  '));
console.log('人：', people.map((p) => `${p.k}:${p.pose}${p.lean ? '·前倾' : ''}@(${p.x.toFixed(2)},${p.y.toFixed(2)}) ${p.outfit.name}`).join(' | '));
console.log('猫：', cats.map((c) => `${c.coatName}·${c.pose}${c.onPlatform ? '·台上' : ''}@(${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)})${c.roofToward !== null ? '·有顶' : ''}`).join(' | '));
