import { describe, expect, it } from 'vitest';
import {
  COHABIT,
  CohabitSim,
  aisleGraph,
  edgeOpen,
  everyoneHasExit,
  nearestNode,
  runCohabit,
  shortestPath,
} from './cohabit';
import { PLAN, planLayout } from './unit-activation';

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
