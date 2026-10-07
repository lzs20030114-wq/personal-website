import { describe, expect, it } from 'vitest';
import {
  COHABIT,
  CohabitSim,
  aisleGraph,
  bandAngle,
  doorReach,
  edgeOpen,
  everyoneHasExit,
  nearestNode,
  runCohabit,
  shortestPath,
} from './cohabit';
import { PLAN, planLayout } from './unit-activation';

const B = COHABIT.FACES.BANDS;
const openBands = (sim: CohabitSim, u: number) => {
  let n = 0;
  for (let j = 0; j < B; j++) if (sim.bandOpen[u * B + j] >= 0.5) n++;
  return n;
};
const feed = (sim: CohabitSim, units: number[], dt: number) => {
  for (const u of units) sim.field.imprint(sim.layout.units[u].x, sim.layout.units[u].y, sim.layout.platR, dt);
};

/**
 * 人猫同台守门（Lab 2-14）：规则草案 §3 §4 §6 里写成代码的那几条，每条一项——
 * 通行代价（两档 = 墙）· R5（不困住人）· 停留代价（人对人 / 猫对人）· 四类事件 · 三档空间 · 可复现。
 */
describe('cohabit · 过道图与通行代价', () => {
  const l = planLayout(4);
  const g = aisleGraph(l);

  it('没有墙时每条边都能过，门接在外侧线上', () => {
    for (let k = 0; k < g.edges.length; k++) expect(edgeOpen(l, g, k, null)).toBe(true);
    expect(g.nodes).toHaveLength(25 + 2);
    expect(g.nodes[g.door[0]].x).toBeCloseTo(-l.roomM / 2);
  });

  it('两侧单元都落下的过道堵死；一侧落下的还能过；外侧线旁的单元落下则贴墙那条也堵', () => {
    const wall = new Uint8Array(16);
    // 单元 5 与 6（第 2 行中间两个）之间没有边；5 与 9（上下相邻）夹着水平线 y_2 的那段
    wall[5] = 1;
    const kOne = g.edges.findIndex((e) => (e.sideA === 5 && e.sideB === 9) || (e.sideA === 9 && e.sideB === 5));
    expect(kOne).toBeGreaterThanOrEqual(0);
    expect(edgeOpen(l, g, kOne, wall)).toBe(true);
    wall[9] = 1;
    expect(edgeOpen(l, g, kOne, wall)).toBe(false);
    // 单元 0 在角上：它上方那段外侧线夹在房间墙与平台之间——这间房（Lab 2-8）外侧留 0.85 m，
    // 平台落下仍剩 0.95 m ⇒ 过得去；两个相邻平台之间只剩 0.20 m 才是真堵（上面那条）
    const w0 = new Uint8Array(16);
    w0[0] = 1;
    const kOuter = g.edges.findIndex((e) => e.sideA === -1 && e.sideB === 0);
    expect(kOuter).toBeGreaterThanOrEqual(0);
    expect(l.roomM / 2 - (l.n / 2) * l.pitchM).toBeGreaterThan(0.8);
    expect(edgeOpen(l, g, kOuter, w0)).toBe(true);
    expect(l.pitchM - 2 * l.platR).toBeLessThan(2 * PLAN.BODY_R);
  });

  it('R5：把一个人围死的那组墙判不通，少一面就通', () => {
    // 人站在中心交叉点 (2,2)；中心四个单元 5 6 9 10 全落 ⇒ 四条出路全被两侧的平台夹死
    const centre = nearestNode(g, 0, 0);
    expect(g.nodes[centre]).toEqual({ x: 0, y: 0 });
    const wall = new Uint8Array(16);
    for (const u of [5, 6, 9, 10]) wall[u] = 1;
    const person = { x: 0, y: 0, present: true };
    expect(everyoneHasExit(l, g, [person], wall)).toBe(false);
    wall[10] = 0;
    expect(everyoneHasExit(l, g, [person], wall)).toBe(true);
    expect(shortestPath(l, g, centre, new Set(g.door), wall)).not.toBeNull();
  });
});

describe('cohabit · 仿真', () => {
  it('同一种子逐位复现；不同种子不同', () => {
    const a = runCohabit({ seed: 1, seconds: 90 });
    const b = runCohabit({ seed: 1, seconds: 90 });
    const c = runCohabit({ seed: 2, seconds: 90 });
    expect(a).toEqual(b);
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it('猫站着的单元钉住：跟随档下痕迹褪尽，脚下那台仍成形', () => {
    const sim = new CohabitSim({ seed: 3, opening: false, auto: false });
    const cat = sim.addCat(sim.layout.units[5])!;
    for (let i = 0; i < 300; i++) sim.step(1 / 30);
    expect(sim.act.degree[cat.unit!.i]).toBe(1);
    expect(sim.wall[cat.unit!.i]).toBe(1);
  });

  it('R5 在仿真里起作用：没人时单元不会因连通性被钉；有人在场时被钉的单元程度停在墙线以下', () => {
    const sim = new CohabitSim({ seed: 4, opening: false, auto: false, fade: null, threshold: 1 });
    // 人站在中心交叉点，让位关掉，让四周的单元都想落
    sim.clearance = null;
    const p = sim.addPerson(0, 0)!;
    p.mode = 'manual';
    sim.addCat(sim.layout.units[0]);
    for (let i = 0; i < 600; i++) {
      // 直接把人站的四周四格的痕迹喂满（绕过视野）
      for (const u of [5, 6, 9, 10]) sim.field.imprint(sim.layout.units[u].x, sim.layout.units[u].y, sim.layout.platR, 1 / 30);
      sim.step(1 / 30);
    }
    const centre = [5, 6, 9, 10];
    const walls = centre.filter((u) => sim.wall[u]).length;
    expect(walls).toBeLessThan(4);
    expect(centre.some((u) => sim.heldR5[u] === 1)).toBe(true);
    for (const u of centre) if (sim.heldR5[u]) expect(sim.act.degree[u]).toBeLessThan(COHABIT.WALL_AT);
    expect(everyoneHasExit(sim.layout, sim.graph, [p.walker], sim.wall)).toBe(true);
  });

  it('停留代价 · 猫对人：访客贴着猫站超过耐受秒数，猫退到离人更远的邻格并进入潜伏', () => {
    const sim = new CohabitSim({ seed: 5, opening: false, auto: true, clearance: null });
    const cat = sim.addCat(sim.layout.units[5])!;
    const u = cat.unit!;
    const p = sim.addPerson(u.x - 0.6, u.y)!;
    p.mode = 'manual';
    const start = u.i;
    let moved = false;
    for (let i = 0; i < 60 * 40 && !moved; i++) {
      sim.step(1 / 30);
      moved = cat.unit!.i !== start && !cat.transfer;
    }
    expect(moved).toBe(true);
    const d0 = Math.hypot(sim.layout.units[start].x - p.walker.x, sim.layout.units[start].y - p.walker.y);
    const d1 = Math.hypot(cat.unit!.x - p.walker.x, cat.unit!.y - p.walker.y);
    expect(d1).toBeGreaterThan(d0);
    expect(cat.latency).toBeGreaterThan(0);
  });

  it('停留代价 · 人对人：站着的访客被另一人贴到 1.35 m 以内，撑过 2 s 就走开', () => {
    const sim = new CohabitSim({ seed: 6, opening: false, auto: true });
    const a = sim.addPerson(0, 0)!;
    const b = sim.addPerson(0.8, 0)!;
    b.mode = 'manual';
    a.pause = 1000; // 本来打算站很久
    for (let i = 0; i < 30 * 4; i++) sim.step(1 / 30);
    const d = Math.hypot(a.walker.x - b.walker.x, a.walker.y - b.walker.y);
    expect(a.walker.state === 'walk' || d >= COHABIT.PERSON_D.stranger).toBe(true);
  });

  it('四类事件：贴身 = 共触；带内站着 ≥ 2 s = 共温；走着穿过带 = 交接；互相看着 ≥ 1 s = 共视', () => {
    const sim = new CohabitSim({ seed: 7, opening: false, auto: false, space: 'empty', look: false });
    const cat = sim.addCat({ x: 0, y: 0 })!;
    cat.mode = 'manual';
    const p = sim.addPerson(1.0, 0)!;
    p.mode = 'manual';
    // 面对面：人在 (1,0) 看向 −x，猫在原点朝 +x
    p.walker.heading = Math.PI;
    p.walker.gaze = Math.PI;
    cat.walker.heading = 0;
    for (let i = 0; i < 30 * 3; i++) sim.step(1 / 30);
    expect(sim.ledger.counts.warmth).toBe(1);
    expect(sim.ledger.counts.gaze).toBe(1);
    expect(sim.ledger.seconds.warmth).toBeGreaterThan(0.9);
    expect(sim.ledger.counts.touch).toBe(0);
    // 走过去贴着：交接 + 共触
    p.walker.pushTarget({ x: 0.3, y: 0 });
    for (let i = 0; i < 30 * 3; i++) sim.step(1 / 30);
    expect(sim.ledger.counts.pass).toBeGreaterThanOrEqual(1);
    expect(sim.ledger.counts.touch).toBe(1);
  });

  it('三档空间：钉死 = 偶数行全落且永不变；空房间 = 零成形、猫在地面', () => {
    const fixed = new CohabitSim({ seed: 8, space: 'fixed' });
    const before = Array.from(fixed.act.degree);
    expect(fixed.layout.units.filter((u) => u.row % 2 === 0).every((u) => before[u.i] === 1)).toBe(true);
    expect(fixed.layout.units.filter((u) => u.row % 2 === 1).every((u) => before[u.i] === 0)).toBe(true);
    for (let i = 0; i < 300; i++) fixed.step(1 / 30);
    expect(Array.from(fixed.act.degree)).toEqual(before);
    // 钉死的两行之间每条过道都还能过（基准不能自己把人堵死）
    for (let k = 0; k < fixed.graph.edges.length; k++) {
      const e = fixed.graph.edges[k];
      if (e.sideA >= 0 && e.sideB >= 0 && fixed.layout.units[e.sideA].row === fixed.layout.units[e.sideB].row) continue; // 同一行两格之间的竖线段
      expect(edgeOpen(fixed.layout, fixed.graph, k, fixed.wall)).toBe(true);
    }
    const empty = new CohabitSim({ seed: 8, space: 'empty' });
    for (let i = 0; i < 300; i++) empty.step(1 / 30);
    expect(empty.act.formed()).toHaveLength(0);
    expect(empty.cats[0].unit).toBeNull();
  });

  it('离线一场：读数有限、占比在 [0,1]，四类事件至少记到一次', () => {
    const s = runCohabit({ seed: 9, seconds: 240, people: 3, cats: 2 });
    expect(s.catFarShare).toBeGreaterThanOrEqual(0);
    expect(s.catFarShare).toBeLessThanOrEqual(1);
    expect(s.detourShare).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(s.catSettled)).toBe(true);
    const total = s.ledger.counts.gaze + s.ledger.counts.warmth + s.ledger.counts.touch + s.ledger.counts.pass;
    expect(total).toBeGreaterThan(0);
    expect(PLAN.BODY_R).toBe(0.22);
  });
});

/**
 * 按带让路（作者 2026-10-07「人穿过只收两单元相对的两个面」+「松键之后多余的布可以往上去」）：
 * 一台 20 条带，挡人的带各自收回；猫身下的不收；通行按带几何；R5 只认开不了的墙。模块默认关 ⇒ 上面的旧口径逐位不变。
 */
describe('cohabit · 按带让路', () => {
  it('模块默认关；开着时同种子逐位复现', () => {
    expect(new CohabitSim({ opening: false }).faces).toBe(false);
    const a = runCohabit({ seed: 11, seconds: 60, faces: true });
    const b = runCohabit({ seed: 11, seconds: 60, faces: true });
    expect(a).toEqual(b);
    expect(a.bandsOpen).toBeGreaterThanOrEqual(0);
  });

  it('钉死 / 空房间档里带不起作用：按带与整台同种子读数逐位相同（规划照旧认整台的墙，不会穿墙）', () => {
    for (const space of ['fixed', 'empty'] as const) {
      const a = runCohabit({ seed: 12, seconds: 120, space, faces: true });
      const b = runCohabit({ seed: 12, seconds: 120, space, faces: false });
      expect({ ...a, bandsOpen: 0 }).toEqual({ ...b, bandsOpen: 0 });
    }
  });

  it('人站在交叉点：四邻单元照落、各只收回朝人的那条带、R5 不钉；整台口径下四台全被闸住', () => {
    const sim = new CohabitSim({ seed: 1, opening: false, auto: false, faces: true, fade: null, threshold: 1 });
    const p = sim.addPerson(0, 0)!;
    p.mode = 'manual';
    for (let i = 0; i < 300; i++) {
      feed(sim, [5, 6, 9, 10], 1 / 30);
      sim.step(1 / 30);
    }
    for (const u of [5, 6, 9, 10]) {
      expect(sim.act.degree[u]).toBeCloseTo(1, 6);
      expect(openBands(sim, u)).toBe(1);
      // 收回的正是指向交叉点的那条（45° 一族）
      const j = [...Array(B).keys()].find((k) => sim.bandOpen[u * B + k] >= 0.5)!;
      const ox = sim.layout.units[u].x + Math.cos(bandAngle(j)) * sim.layout.platR;
      const oy = sim.layout.units[u].y + Math.sin(bandAngle(j)) * sim.layout.platR;
      expect(Math.hypot(ox, oy)).toBeLessThan(PLAN.BODY_R + PLAN.ATTENTION.clearance);
    }
    expect(sim.heldR5.reduce((a, b) => a + b, 0)).toBe(0);
    expect(sim.blocked.reduce((a, b) => a + b, 0)).toBe(0);
    const whole = new CohabitSim({ seed: 1, opening: false, auto: false, faces: false, fade: null, threshold: 1 });
    const q = whole.addPerson(0, 0)!;
    q.mode = 'manual';
    for (let i = 0; i < 300; i++) {
      feed(whole, [5, 6, 9, 10], 1 / 30);
      whole.step(1 / 30);
    }
    expect(whole.blocked.reduce((a, b) => a + b, 0)).toBe(4);
    for (const u of [5, 6, 9, 10]) expect(whole.act.degree[u]).toBe(0);
  });

  it('过道：两台都落下的边按此刻是堵、按「开得了的」能过；人沿路走门提前开、走完带落回', () => {
    const sim = new CohabitSim({ seed: 2, opening: false, auto: false, faces: true, fade: null, threshold: 1 });
    const { layout: l, graph: g } = sim;
    for (let i = 0; i < 120; i++) {
      feed(sim, [5, 9], 1 / 30);
      sim.step(1 / 30);
    }
    const k = g.edges.findIndex((e) => (e.sideA === 5 && e.sideB === 9) || (e.sideA === 9 && e.sideB === 5));
    expect(edgeOpen(l, g, k, sim.wall, sim.bandWall)).toBe(false);
    expect(edgeOpen(l, g, k, sim.wall, sim.bandHard)).toBe(true);
    const a = g.nodes[g.edges[k].a];
    const b = g.nodes[g.edges[k].b];
    const p = sim.addPerson(a.x, a.y)!;
    p.mode = 'manual';
    p.walker.pushTarget({ x: b.x, y: b.y });
    let t = 0;
    let passed = -1;
    let peak = 0;
    for (let i = 0; i < 30 * 20 && passed < 0; i++) {
      feed(sim, [5, 9], 1 / 30);
      sim.step(1 / 30);
      t += 1 / 30;
      peak = Math.max(peak, openBands(sim, 5), openBands(sim, 9));
      if (p.walker.state !== 'walk') passed = t;
    }
    const straight = Math.hypot(b.x - a.x, b.y - a.y) / COHABIT.VISITOR.speed;
    expect(passed).toBeGreaterThan(0);
    expect(passed).toBeLessThan(straight + 2.5);
    expect(peak).toBeGreaterThanOrEqual(3); // 走过时两侧朝过道的几条带是开着的
    for (let i = 0; i < 60; i++) sim.step(1 / 30);
    expect(openBands(sim, 5) + openBands(sim, 9)).toBeLessThanOrEqual(2); // 人站在端点，只剩指向它的那条
  });

  it('猫身下的带不收：猫坐在中心护住整台、邻台照收；猫到台边朝人只护那几条', () => {
    const sim = new CohabitSim({ seed: 3, opening: false, auto: false, faces: true, fade: null, threshold: 1 });
    const cat = sim.addCat(sim.layout.units[5])!;
    cat.mode = 'manual';
    const u5 = sim.layout.units[5];
    const u9 = sim.layout.units[9];
    const p = sim.addPerson((u5.x + u9.x) / 2 - 0.3, (u5.y + u9.y) / 2)!;
    p.mode = 'manual';
    for (let i = 0; i < 300; i++) {
      feed(sim, [5, 9], 1 / 30);
      sim.step(1 / 30);
    }
    expect(sim.bandHold.slice(5 * B, 6 * B).reduce((a, b) => a + b, 0)).toBe(B);
    expect(openBands(sim, 5)).toBe(0);
    expect(openBands(sim, 9)).toBeGreaterThanOrEqual(2);
    expect(sim.bandHard.reduce((a, b) => a + b, 0)).toBe(B);
    const d = Math.hypot(p.walker.x - u5.x, p.walker.y - u5.y);
    const r = sim.layout.platR - COHABIT.CAT.bodyR;
    cat.walker.place(u5.x + ((p.walker.x - u5.x) / d) * r, u5.y + ((p.walker.y - u5.y) / d) * r);
    for (let i = 0; i < 120; i++) {
      feed(sim, [5, 9], 1 / 30);
      sim.step(1 / 30);
    }
    const held = sim.bandHold.slice(5 * B, 6 * B).reduce((a, b) => a + b, 0);
    expect(held).toBeGreaterThanOrEqual(3);
    expect(held).toBeLessThanOrEqual(7);
    expect(openBands(sim, 5)).toBe(0);
  });

  it('R5 按带：只有猫身下的墙带算数——四台整台封死时不通，其中一台的带能开就通', () => {
    const l = planLayout(4);
    const g = aisleGraph(l);
    const wall = new Uint8Array(16);
    const hard = new Uint8Array(16 * B);
    for (const u of [5, 6, 9, 10]) {
      wall[u] = 1;
      hard.fill(1, u * B, (u + 1) * B);
    }
    const person = { x: 0, y: 0, present: true };
    expect(everyoneHasExit(l, g, [person], wall, hard)).toBe(false);
    hard.fill(0, 10 * B, 11 * B);
    expect(everyoneHasExit(l, g, [person], wall, hard)).toBe(true);
  });
});

/**
 * 座位三态（作者 2026-10-07：坐着的地方做据点，人分走 / 站 / 坐三态；8×8；座位摆在房间中间）。
 * 守的是几条写成代码的规则本身：家具上方没有单元 · 人到得了每个座位 · 走着不触发 · 坐着一步一步把猫引到会面台
 * · 站定只给一步 · 坐着也算共温 · 猫优先走递过来的那台 · 钉死档不圈死人 · 痕迹档（旧口径）不受影响。
 */
describe('cohabit · 座位三态', () => {
  const posture = (o: ConstructorParameters<typeof CohabitSim>[0] = {}) => new CohabitSim({ trigger: 'posture', opening: false, faces: true, ...o });
  const formedSet = (sim: CohabitSim) => new Set(sim.act.formed());

  it('模块默认仍是痕迹档（4×4、没有家具）；座位三态默认 8×8、标准布置四件家具六个座位，家具是独立一层（64 台单元都在）', () => {
    const old = new CohabitSim({ opening: false });
    expect(old.trigger).toBe('trace');
    expect(old.layout.n).toBe(COHABIT.GRID_DEF);
    expect(old.furn).toBeNull();
    expect(old.seats).toHaveLength(0);
    const sim = posture();
    expect(sim.layout.n).toBe(COHABIT.SEATS.GRID);
    expect(sim.furn!.rects).toHaveLength(4);
    expect(sim.seats).toHaveLength(6);
    // 家具上方的单元照样在：四邻表与没有家具时逐个相同
    const bare = new CohabitSim({ grid: 8, opening: false });
    for (const u of sim.layout.units) expect(sim.neighboursOf(u).map((v) => v.i)).toEqual(bare.neighboursOf(u).map((v) => v.i));
    // 标准布置不贴墙：离房间墙至少 1 m
    for (const r of sim.furn!.rects) expect(sim.layout.roomM / 2 - Math.max(-r.x0, r.x1, -r.y0, r.y1)).toBeGreaterThan(1);
  });

  it('没有墙时：每个能站的交叉点都走得到门，每个座位的入口也是；单元四邻连成一片（猫哪儿都去得了）', () => {
    const sim = posture();
    const reach = doorReach(sim.layout, sim.graph, null);
    for (let i = 0; i < sim.graph.door[0]; i++) if (!sim.furn!.nodeOff[i]) expect(reach[i]).toBe(1);
    for (const s of sim.seats) expect(reach[s.node]).toBe(1);
    for (const u of sim.layout.units) expect(sim.unitPath(0, u.i)).not.toBeNull();
  });

  it('空沙发上方的单元能落（猫可以住在沙发上方）；有人坐下，盖到他头顶的那几台不落、落着的也收回', () => {
    const sim = posture({ seed: 2 });
    const seat = sim.seats[0];
    const over = sim.layout.units.filter((u) => sim.overHead(u, seat.x, seat.y));
    expect(over.length).toBeGreaterThan(0);
    const cat = sim.addCat(over[0])!;
    cat.mode = 'manual';
    for (let t = 0; t < 2; t += 1 / 30) sim.step(1 / 30);
    expect(sim.act.degree[over[0].i]).toBe(1);
    // 猫挪开，有人坐下：头顶那台退回去，之后一直不落
    sim.hold('cat', cat.id, cat.walker.x, cat.walker.y);
    sim.drag('cat', cat.id, 2.1, 2.1);
    sim.release('cat', cat.id);
    cat.mode = 'manual';
    const p = sim.addPerson(seat.x, seat.y)!;
    p.mode = 'manual';
    expect(p.seated).toBe(true);
    for (let t = 0; t < 30; t += 1 / 30) {
      sim.step(1 / 30);
      if (t > 3) for (const u of over) expect(sim.act.degree[u.i]).toBeLessThan(COHABIT.WALL_AT);
    }
    // 猫占着的台盖在座位头顶时，这个座位不算空
    const sim2 = posture({ seed: 3 });
    sim2.addCat(over[0]);
    expect(sim2.seatFree(0)).toBe(false);
  });

  it('会面台离座位 1.0–1.5 m（猫在台面中心不付停留代价、又在共温带里），且不是入口四角那几台', () => {
    const sim = posture();
    for (const s of sim.seats) {
      const m = sim.layout.units[s.meet];
      const d = Math.hypot(m.x - s.x, m.y - s.y);
      expect(d).toBeGreaterThanOrEqual(COHABIT.CAT_NEAR);
      expect(d).toBeLessThan(COHABIT.BAND.far);
      const n = sim.graph.nodes[s.node];
      expect(Math.abs(m.x - n.x) < sim.layout.pitchM * 0.75 && Math.abs(m.y - n.y) < sim.layout.pitchM * 0.75).toBe(false);
      // 在坐着的人面前
      expect((m.x - s.x) * s.face[0] + (m.y - s.y) * s.face[1]).toBeGreaterThan(0);
    }
  });

  it('走着不触发：没有猫时访客漫步十分钟，地面不留痕迹、一台都不落', () => {
    const sim = posture({ seed: 21 });
    for (let i = 0; i < 3; i++) {
      const k = nearestNode(sim.graph, (i - 1) * 1.2, 0);
      sim.addPerson(sim.graph.nodes[k].x, sim.graph.nodes[k].y);
    }
    let maxFormed = 0;
    for (let t = 0; t < 600; t += 1 / 30) {
      sim.step(1 / 30);
      maxFormed = Math.max(maxFormed, sim.act.countAtLeast(1e-6));
    }
    expect(maxFormed).toBe(0);
    expect(sim.field.data.every((v) => v === 0)).toBe(true);
    expect(sim.summary().seatedTime).toBeGreaterThan(0); // 有人坐过（坐着但没有猫可引）
  });

  it('坐着 = 全力：空间从猫脚下一步一步铺到会面台，猫走到；途中落着的只有猫脚下与下一步', () => {
    for (const seed of [1, 2, 3]) {
      const sim = posture({ seed });
      const seat = sim.seats[4];
      const p = sim.addPerson(seat.x, seat.y)!;
      expect(p.seated).toBe(true);
      p.mode = 'manual';
      const cat = sim.addCat(sim.layout.units[0])!;
      let arrived = -1;
      for (let t = 0; t < 600 && arrived < 0; t += 1 / 30) {
        sim.step(1 / 30);
        const allowed = new Set(sim.supportOf(cat).map((u) => u.i));
        for (const g of sim.guides) if (g.path.length > 1) allowed.add(g.path[1]);
        for (const u of formedSet(sim)) expect(allowed.has(u)).toBe(true);
        expect(sim.guides.every((g) => g.kind === 'sit' && g.cat === cat.id)).toBe(true);
        if (cat.unit!.i === seat.meet) arrived = t;
      }
      expect(arrived).toBeGreaterThan(0);
      expect(sim.catArrivals).toBeGreaterThanOrEqual(1);
    }
  });

  it('猫优先走空间递过来的那一台：有人坐着时，猫的每一次挪窝都落在引路的下一步上（不在潜伏期、没被拿着）', () => {
    for (const seed of [4, 5, 6, 7]) {
      const sim = posture({ seed });
      const seat = sim.seats[0];
      const p = sim.addPerson(seat.x, seat.y)!;
      p.mode = 'manual';
      const cat = sim.addCat(sim.layout.units[63])!;
      let lastUnit = cat.unit!.i;
      let expected = sim.unitPath(lastUnit, seat.meet)![1];
      let moves = 0;
      for (let t = 0; t < 300; t += 1 / 30) {
        sim.step(1 / 30);
        if (cat.unit!.i !== lastUnit) {
          if (cat.latency <= 0 && cat.state !== 'retreat') expect(cat.unit!.i).toBe(expected);
          moves++;
          lastUnit = cat.unit!.i;
          const path = sim.unitPath(lastUnit, seat.meet)!;
          if (path.length < 2) break;
          expected = path[1];
        }
      }
      expect(moves).toBeGreaterThan(0);
    }
  });

  it('站定 = 部分：停住满 3 s 且看着一只猫，空间朝这个人只给一步；这次站定里猫挪过一次就不再给', () => {
    const sim = posture({ seed: 8 });
    const cat = sim.addCat(sim.layout.units[27])!; // (−0.30, −0.30)
    const k = nearestNode(sim.graph, 1.8, -0.3);
    const p = sim.addPerson(sim.graph.nodes[k].x, sim.graph.nodes[k].y)!;
    p.mode = 'manual';
    p.watching = cat.id;
    for (let t = 0; t < COHABIT.SEATS.STAND_S - 0.2; t += 1 / 30) sim.step(1 / 30);
    expect(sim.guides).toHaveLength(0);
    for (let t = 0; t < 0.5; t += 1 / 30) sim.step(1 / 30);
    expect(sim.guides).toHaveLength(1);
    const g = sim.guides[0];
    expect(g.kind).toBe('stand');
    const [from, to] = g.path;
    const w = p.walker;
    const d = (i: number) => Math.hypot(sim.layout.units[i].x - w.x, sim.layout.units[i].y - w.y);
    expect(d(to)).toBeLessThan(d(from));
    const offered = new Set<number>();
    let moved = false;
    let afterMove = 0;
    for (let t = 0; t < 120; t += 1 / 30) {
      sim.step(1 / 30);
      for (const x of sim.guides) offered.add(x.path[1]);
      if (cat.unit!.i !== from) moved = true;
      if (moved) afterMove += sim.guides.length;
    }
    expect(moved).toBe(true);
    expect(offered).toEqual(new Set([to]));
    expect(afterMove).toBe(0);
  });

  it('坐着也算共温：猫卧在会面台中心，坐着的人与它之间记一次共温、秒数一直涨', () => {
    const sim = posture({ seed: 9 });
    const seat = sim.seats[2];
    const p = sim.addPerson(seat.x, seat.y)!;
    p.mode = 'manual';
    const cat = sim.addCat(sim.layout.units[seat.meet])!;
    cat.mode = 'manual';
    for (let t = 0; t < 10; t += 1 / 30) sim.step(1 / 30);
    expect(p.seated).toBe(true);
    expect(sim.ledger.counts.warmth).toBe(1);
    expect(sim.ledger.seconds.warmth).toBeGreaterThan(7);
  });

  it('钉死档（座位三态）：偶数行逐台试落、圈死人的不落、盖到座位头顶的不落——每个能站的交叉点仍走得到门', () => {
    const sim = posture({ space: 'fixed' });
    const fixed = new Uint8Array(sim.layout.units.length);
    for (const u of sim.act.formed()) fixed[u] = 1;
    expect(sim.act.formed().length).toBeGreaterThan(8);
    for (const u of sim.act.formed()) {
      expect(sim.layout.units[u].row % 2).toBe(0);
      for (const q of sim.seats) expect(sim.overHead(sim.layout.units[u], q.x, q.y)).toBe(false);
    }
    const reach = doorReach(sim.layout, sim.graph, fixed);
    for (let i = 0; i < sim.graph.door[0]; i++) if (!sim.furn!.nodeOff[i]) expect(reach[i]).toBe(1);
  });

  it('同种子逐位复现；三档空间都摆同样的家具', () => {
    const a = runCohabit({ trigger: 'posture', seed: 31, seconds: 90, people: 3, cats: 1, faces: true });
    const b = runCohabit({ trigger: 'posture', seed: 31, seconds: 90, people: 3, cats: 1, faces: true });
    expect(a).toEqual(b);
    for (const space of ['live', 'fixed', 'empty'] as const) expect(posture({ space }).seats).toHaveLength(6);
  });
});

describe('cohabit · 按带让路 · 猫护住的交叉点', () => {
  it('8×8 下猫坐上去，平台外缘离四角交叉点只剩 0.17 m：人不再把那个点当路点，挨着它也走得开', () => {
    const sim = new CohabitSim({ grid: 8, seed: 5, opening: false, faces: true });
    const cat = sim.addCat(sim.layout.units[27])!;
    cat.mode = 'manual';
    const u = sim.layout.units[27];
    // 站在猫那台右下角交叉点往下 0.1 m（就是那个点最近）
    const p = sim.addPerson(u.x + sim.layout.pitchM / 2, u.y + sim.layout.pitchM / 2 + 0.1)!;
    p.pause = 0;
    for (let t = 0; t < 20; t += 1 / 30) sim.step(1 / 30);
    expect(p.walker.distance).toBeGreaterThan(1);
  });
});

describe('cohabit · 家具可加减、拖动（独立一层，标准布置随时回去）', () => {
  const posture = (o: ConstructorParameters<typeof CohabitSim>[0] = {}) => new CohabitSim({ trigger: 'posture', opening: false, faces: true, ...o });

  it('拖动：摆得下就挪、朝向自动朝房间中线，座位跟着重算；压到墙外 / 叠到别的家具上 / 把一块地面围死都不许', () => {
    const sim = posture();
    const f0 = sim.furniture[1];
    expect(sim.moveFurniture(1, f0.x, f0.y + 0.6)).toBe(true);
    expect(sim.furniture[1].y).toBeCloseTo(f0.y + 0.6);
    expect(sim.seats.filter((q) => q.furn === 1)).toHaveLength(1);
    // 拖过中线：朝向翻过来
    expect(sim.moveFurniture(1, f0.x, 1.2)).toBe(false); // 与右下沙发叠
    expect(sim.moveFurniture(1, 0, 0.7)).toBe(true);
    expect(sim.furniture[1].face).toEqual([0, -1]);
    // 墙外
    expect(sim.moveFurniture(1, sim.layout.roomM / 2, 0)).toBe(false);
    // 叠到左上沙发上
    expect(sim.moveFurniture(1, sim.furniture[0].x, sim.furniture[0].y)).toBe(false);
    // 每次成功挪完：能站的交叉点都走得到门
    const reach = doorReach(sim.layout, sim.graph, null);
    for (let i = 0; i < sim.graph.door[0]; i++) if (!sim.furn!.nodeOff[i]) expect(reach[i]).toBe(1);
  });

  it('坐在被挪那件上的人起身，坐在别的家具上的人不受影响；删掉一件后后面件上的人座位号对得回去', () => {
    const sim = posture();
    const a = sim.addPerson(sim.seats[0].x, sim.seats[0].y)!; // 左上沙发
    const b = sim.addPerson(sim.seats[5].x, sim.seats[5].y)!; // 左下椅子（第 3 件）
    expect(a.seated && b.seated).toBe(true);
    expect(sim.moveFurniture(0, sim.furniture[0].x + 0.3, sim.furniture[0].y)).toBe(true);
    expect(a.seated).toBe(false);
    expect(b.seated).toBe(true);
    expect(sim.seats[b.seat!].furn).toBe(3);
    sim.removeFurniture(1);
    expect(sim.furniture).toHaveLength(3);
    expect(b.seated).toBe(true);
    expect(sim.seats[b.seat!].furn).toBe(2);
    expect(Math.hypot(sim.seats[b.seat!].x - b.walker.x, sim.seats[b.seat!].y - b.walker.y)).toBeLessThan(1e-9);
  });

  it('加一件：找房间里第一个摆得下的位置；回到标准布置：四件、六个座位、所有人起身', () => {
    const sim = posture();
    const k = sim.addFurniture('chair');
    expect(k).toBe(4);
    expect(sim.seats).toHaveLength(7);
    const p = sim.addPerson(sim.seats[6].x, sim.seats[6].y)!;
    expect(p.seated).toBe(true);
    sim.resetFurniture();
    expect(sim.furniture).toHaveLength(4);
    expect(sim.seats).toHaveLength(6);
    expect(p.seated).toBe(false);
    expect(sim.furnitureFits(sim.furniture)).toBe(true);
  });
});

describe('cohabit · 引导方式（座位三态 · 会动的单元）', () => {
  const posture = (o: ConstructorParameters<typeof CohabitSim>[0] = {}) => new CohabitSim({ trigger: 'posture', opening: false, faces: true, ...o });

  it('身边台：平台不盖坐着的人头顶、比会面台近；标准布置下沙发座位的身边台够得着（猫走到台边离人 < 0.5 m = 共触带）', () => {
    const sim = posture();
    const rim = sim.layout.platR - COHABIT.CAT.bodyR;
    for (const s of sim.seats) {
      const u = sim.layout.units[s.side];
      const m = sim.layout.units[s.meet];
      expect(sim.overHead(u, s.x, s.y)).toBe(false);
      const d = Math.hypot(u.x - s.x, u.y - s.y);
      expect(d).toBeLessThan(Math.hypot(m.x - s.x, m.y - s.y));
      if (sim.furn!.rects[s.furn].kind === 'sofa') expect(d - rim).toBeLessThan(COHABIT.BAND.near);
    }
  });

  it('引到身边台：猫一路走到座位身边那台；先会面再身边：先到会面台、坐着的人看满 sideAfter 秒后再挪到身边台', () => {
    const run = (target: 'side' | 'meetThenSide') => {
      const sim = posture({ seed: 3, guide: { target } });
      const seat = sim.seats[0];
      const p = sim.addPerson(seat.x, seat.y)!;
      p.mode = 'manual';
      const cat = sim.addCat(sim.layout.units[60])!;
      const visits: number[] = [];
      for (let t = 0; t < 900; t += 1 / 30) {
        sim.step(1 / 30);
        const u = cat.unit!.i;
        if (visits[visits.length - 1] !== u) visits.push(u);
        if (u === seat.side) break;
      }
      return { seat, visits };
    };
    const a = run('side');
    expect(a.visits[a.visits.length - 1]).toBe(a.seat.side);
    const b = run('meetThenSide');
    expect(b.visits[b.visits.length - 1]).toBe(b.seat.side);
    expect(b.visits).toContain(b.seat.meet);
    expect(b.visits.indexOf(b.seat.meet)).toBeLessThan(b.visits.length - 1);
  });
});

describe('cohabit · 猫按 Mertens & Turner 1988 标定（COHABIT.CAT_MT）', () => {
  /** 场景复现与 scripts/cohabit/calibrate-mt.mjs 相同：空房间 · 一位陌生人坐着 · 一只猫在地面 · 600 s */
  const shares = (ignores: boolean) => {
    let far = 0;
    let near = 0;
    let T = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const sim = new CohabitSim({ trigger: 'posture', space: 'empty', seed, opening: false, cat: COHABIT.CAT_MT });
      const s = sim.seats[2];
      const p = sim.addPerson(s.x, s.y)!;
      p.mode = 'manual';
      p.ignores = ignores;
      const cat = sim.addCat({ x: 0, y: 1.5 })!;
      for (let t = 0; t < 600; t += 1 / 30) {
        sim.step(1 / 30);
        const d = Math.hypot(p.walker.x - cat.walker.x, p.walker.y - cat.walker.y);
        if (d > 1) far += 1 / 30;
        if (d < 0.5 && cat.walker.state !== 'walk') near += 1 / 30;
        T += 1 / 30;
      }
    }
    return { far: (far / T) * 100, near: (near / T) * 100 };
  };

  it('被动（看书不理猫）：> 1 m ≈ 78%、接触 ≈ 2%；主动（看着它）：> 1 m ≈ 34%、接触 ≈ 33%（容差 ±10 个百分点，4 种子）', () => {
    const p = shares(true);
    expect(Math.abs(p.far - 78)).toBeLessThan(10);
    expect(p.near).toBeLessThan(6);
    const a = shares(false);
    expect(Math.abs(a.far - 34)).toBeLessThan(10);
    expect(Math.abs(a.near - 33)).toBeLessThan(10);
  }, 120_000);

  it('两套常量各自生效：不传 cat 用演示值（痕迹档与旧守门不变），传 CAT_MT 只覆盖标定的那几项', () => {
    const sim = new CohabitSim({ opening: false });
    expect(sim.cat.tolerateAttended).toBe(COHABIT.CAT.tolerateAttended);
    const mt = new CohabitSim({ opening: false, cat: COHABIT.CAT_MT });
    expect(mt.cat.tolerateAttended).toBe(COHABIT.CAT_MT.tolerateAttended);
    expect(mt.cat.sit).toBe(COHABIT.CAT.sit);
  });
});

describe('cohabit · 台上靠近沿落着的台走过去（approachTravel，与地面「朝人走过去」同一条规则）', () => {
  // 钉死档：偶数行（座位三态下按 R5 剔掉几台）一直落着——猫在第 0 行，有人站在第 0 行另一头看着它
  const setup = (travel: number) => {
    // 自己的节奏（卧完换格 / 靠近完走开）关掉，只看「靠近」本身；人站在 3 m 内（够得上「盯着看」）
    const sim = new CohabitSim({ trigger: 'posture', space: 'fixed', seed: 7, opening: false, cat: { ...COHABIT.CAT_MT, approachTravel: travel, approachP: 1, approachMid: 0, roamAfterApproach: 0, roamP: 0, passiveP: 0 } });
    const row0 = sim.act.formed().filter((u) => sim.layout.units[u].row === 0).sort((a, b) => a - b);
    const cat = sim.addCat(sim.layout.units[row0[0]])!;
    const start = sim.layout.units[row0[0]];
    const far = row0.map((i) => sim.layout.units[i]).filter((u) => Math.hypot(u.x - start.x, u.y - start.y) < 2.4).pop()!;
    const p = sim.addPerson(far.x, far.y - sim.layout.pitchM / 2 - 0.3)!;
    p.mode = 'manual';
    p.watching = cat.id;
    return { sim, cat, p, start: row0[0], far: far.i };
  };

  it('approachTravel = 1：被看着的猫沿落着的台一台一台走到离那个人最近的那台', () => {
    const { sim, cat, start, far } = setup(1);
    const seen = new Set<number>();
    for (let t = 0; t < 40; t += 1 / 30) {
      sim.step(1 / 30);
      seen.add(cat.unit!.i);
    }
    expect(seen.size).toBeGreaterThan(2);
    expect(cat.unit!.i).not.toBe(start);
    expect(seen.has(far)).toBe(true);
    for (const u of seen) expect(sim.act.degree[u]).toBe(1); // 只走落着的台
  });

  it('approachTravel = 0（演示值的旧口径）：只挪到本台边缘，不过台', () => {
    const { sim, cat, start } = setup(0);
    for (let t = 0; t < 40; t += 1 / 30) sim.step(1 / 30);
    expect(cat.unit!.i).toBe(start);
  });

  it('整条路一次铺好：坐下后从猫脚下到目标一路都落，一次一步只落下一步', () => {
    const count = (whole: boolean) => {
      const sim = new CohabitSim({ trigger: 'posture', opening: false, faces: true, seed: 2, guide: { target: 'meet', whole }, cat: { ...COHABIT.CAT_MT, approachP: 0, passiveP: 0 } });
      const seat = sim.seats[4];
      const p = sim.addPerson(seat.x, seat.y)!;
      p.mode = 'manual';
      const cat = sim.addCat(sim.layout.units[0])!;
      cat.mode = 'manual';
      for (let t = 0; t < 4; t += 1 / 30) sim.step(1 / 30);
      return { formed: sim.act.formed().length, path: sim.guides[0].path.length };
    };
    const step = count(false);
    const whole = count(true);
    expect(step.formed).toBe(2); // 猫脚下 + 下一步
    expect(whole.formed).toBe(whole.path); // 整条路
    expect(whole.path).toBeGreaterThan(3);
  });
});
