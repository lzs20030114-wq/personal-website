import { describe, expect, it } from 'vitest';
import { COHABIT, CohabitSim, PACE_DEMO, populateCohabit, scatterCats, type SpaceSense } from './cohabit';
import { CAM, SENSE_GEOM, cameraLayout, inView, makeSense, sceneOf, segBlocked, unitOccluders, type Cyl, type OBox, type Scene } from './cohabit-sense';
import { FRAMES, TABLE_TOP, UNITS_PER_M, UnitBaker, rigFor, unitFootY } from './cohabit-solid';
import { ROOM } from './skin-grid';
import { SOLID } from './skin-solid';

function standard(sense?: SpaceSense, seed = 101): CohabitSim {
  const sim = new CohabitSim({
    trigger: 'posture', grid: COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed, opening: false, auto: true,
    faces: true, social: true, catFloor: true, cat: { ...COHABIT.CAT_MT, ...COHABIT.CAT_LEVELS.mid }, goal: true, guide: { target: 'meet' }, pace: PACE_DEMO,
    ...(sense ? { sense } : {}),
  });
  populateCohabit(sim, 6, 0);
  scatterCats(sim, 4, seed);
  return sim;
}

function run(sim: CohabitSim, seconds: number): CohabitSim {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 30) sim.step(1 / 30);
  return sim;
}

const box = (cx: number, cy: number, hx: number, hy: number, z0: number, z1: number, c = 1, s = 0): OBox => {
  const ex = Math.abs(hx * c) + Math.abs(hy * s);
  const ey = Math.abs(hx * s) + Math.abs(hy * c);
  return { cx, cy, hx, hy, z0, z1, c, s, bx0: cx - ex, bx1: cx + ex, by0: cy - ey, by1: cy + ey };
};

describe('感知层 · 管道', () => {
  it('只读看得见的 + 不换意图 = 原样转一遍真值：与不接感知层逐位相同', () => {
    const a = run(standard(), 90).summary();
    const b = run(standard(makeSense('observe', { proxies: false })), 90).summary();
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  }, 30000);

  it('方案 A、B 跑得动：位置误差在量级内，空间写回的那一步不落到真值上', () => {
    const cam = makeSense('camera');
    const simA = run(standard(cam), 120);
    expect(cam.stats.personRmse).toBeGreaterThan(0);
    expect(cam.stats.personRmse).toBeLessThan(0.1);
    const tag = makeSense('tag');
    run(standard(tag), 120);
    expect(tag.stats.personRmse).toBeGreaterThan(0.05);
    expect(tag.stats.personRmse).toBeLessThan(0.3);
    expect(tag.stats.personLost).toBe(0);
    // 站定递出的那一步记在读数这一侧：真值上的 offer 只由人自己的 stepPosture 清空，从不被空间写
    for (const p of simA.people) expect(p.offer).toBeNull();
  }, 60000);
});

describe('感知层 · 几何', () => {
  it('圆柱与转过的长方体挡视线；自己的身体不挡自己；UWB 只算人体', () => {
    const body: Cyl = { x: 0, y: 0, r: 0.2, z0: 0, z1: 1.7, owner: 3, body: true };
    const pole: Cyl = { x: 2, y: 0, r: 0.05, z0: 0, z1: 3, owner: -1, body: false };
    const scene: Scene = { cyls: [body, pole], boxes: [box(4, 0, 0.3, 0.3, 1.0, 1.065, Math.cos(0.5), Math.sin(0.5))] };
    expect(segBlocked(scene, -1, 0, 1, 1, 0, 1)).toBe(true); // 穿过人
    expect(segBlocked(scene, -1, 0, 1.9, 1, 0, 1.9)).toBe(false); // 从头顶上过
    expect(segBlocked(scene, -1, 0, 1, 0, 0, 1, 3)).toBe(false); // 看他自己身上的点
    expect(segBlocked(scene, 1.5, 0, 2, 2.5, 0, 2)).toBe(true); // 吊杆
    expect(segBlocked(scene, 1.5, 0, 2, 2.5, 0, 2, -1, true)).toBe(false); // UWB 穿过铝杆
    expect(segBlocked(scene, 4, 0, 3, 4, 0, 0.5)).toBe(true); // 从上往下穿过台面
    expect(segBlocked(scene, 4, 0, 3, 4, 0, 0.5, -1, true)).toBe(false);
    expect(segBlocked(scene, 4.6, 0.6, 3, 4.6, 0.6, 0.5)).toBe(false); // 台面外
  });

  it('四个上角的摄像头都看得见房间中心的地面，看不见自己脚下那一角', () => {
    const cams = cameraLayout('corners4', 6.64);
    expect(cams).toHaveLength(4);
    for (const c of cams) {
      expect(c.z).toBe(CAM.H);
      expect(inView(c, 0, 0, 0)).toBe(true);
      expect(inView(c, c.x * 0.97, c.y * 0.97, 0)).toBe(false);
    }
    expect(cameraLayout('adjacent2', 6.64)).toHaveLength(2);
    expect(cameraLayout('all8', 6.64)).toHaveLength(8);
  });

  it('单元：收着不挡（比摄像头高）；落成桌子时台面在桌子高度、芯与吊杆接到天花', () => {
    const l = standard().layout;
    const cyls: Cyl[] = [];
    const boxes: OBox[] = [];
    unitOccluders(l, 0, 0, 0, TABLE_TOP.stand, cyls, boxes);
    expect(cyls.length + boxes.length).toBe(0);
    unitOccluders(l, 0, 0, 1, TABLE_TOP.chair, cyls, boxes);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].z1).toBeCloseTo(TABLE_TOP.chair, 9);
    expect(boxes[0].hx).toBeCloseTo(l.platR, 9);
    const [col, rod] = cyls;
    expect(col.z1).toBeCloseTo(rod.z0, 9);
    expect(rod.z1).toBeCloseTo(SENSE_GEOM.ceiling, 9);
    expect(col.z0).toBeCloseTo(SENSE_GEOM.foot - (TABLE_TOP.stand - TABLE_TOP.chair), 9);
    // 收起的布束底在摄像头之上
    const stowBottom = SENSE_GEOM.ceiling - SENSE_GEOM.stowGap - (SENSE_GEOM.hangTop - SENSE_GEOM.foot) * SENSE_GEOM.stowed;
    expect(stowBottom).toBeGreaterThan(CAM.H);
    // 成形后上夹环在台面之上，直垂时更高
    expect(col.z1).toBeCloseTo(SENSE_GEOM.formedTop - (TABLE_TOP.stand - TABLE_TOP.chair), 9);
    const half: Cyl[] = [];
    unitOccluders(l, 0, 0, COHABIT.WALL_AT, TABLE_TOP.stand, half, []);
    expect(half[0].z1).toBeCloseTo(SENSE_GEOM.hangTop, 9);
    expect(half[0].z0).toBeCloseTo(SENSE_GEOM.foot, 9);
  });

  it('此刻的场景：每个在场的人一根身体圆柱', () => {
    const sim = run(standard(), 10);
    const scene = sceneOf(sim);
    expect(scene.cyls.filter((c) => c.body).length).toBe(sim.people.filter((p) => p.walker.present).length);
  }, 20000);

  it('单元的竖向尺寸与 Lab 2-15 的轨迹一致（工位上量的上夹环、台面、钉住端）', () => {
    const sim = standard();
    const trajs = new UnitBaker().runAll();
    const rig = rigFor(sim.layout, trajs[0]);
    const U = UNITS_PER_M;
    const K = SOLID.SCALE;
    // 关键帧 = [px…, py…]，高度 = −py·SCALE（装置自身系，世界 Y 向下）
    const h = (yDev: number) => (ROOM.FLOOR_Y - (rig.y + rig.s * yDev)) / U;
    for (const t of trajs) {
      const formed = t.frames[t.formActive];
      const straight = t.frames[FRAMES.form + FRAMES.retract - 1]; // 回程末帧 = 闲着的直带子（升降帧由它压成）
      expect(h(-formed[t.n] * K)).toBeCloseTo(SENSE_GEOM.formedTop, 2);
      expect(h(-straight[t.n] * K)).toBeCloseTo(SENSE_GEOM.hangTop, 2);
      expect(h(t.footY)).toBeCloseTo(SENSE_GEOM.foot, 2);
      expect(Math.abs(h(t.platformTopY) - SENSE_GEOM.platTop)).toBeLessThan(0.006);
    }
    const stowBottom = (ROOM.FLOOR_Y - unitFootY(rig, trajs[0].footY, 0)) / U;
    expect(stowBottom).toBeCloseTo(SENSE_GEOM.ceiling - SENSE_GEOM.stowGap - (SENSE_GEOM.hangTop - SENSE_GEOM.foot) * SENSE_GEOM.stowed, 2);
  }, 60000);
});
