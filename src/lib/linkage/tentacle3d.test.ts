import { describe, expect, it } from 'vitest';
import { LinkageSolver3D } from './solver3d';
import {
  TENDON_DIRS,
  TENTACLE3D,
  TIP3,
  SPINE3,
  applyContraction3,
  createTentacle3,
  tendonVisual3,
} from './tentacle3d-data';
import { BALLS, TIES } from './tentacle3d-shape';

// 立体求解器 spec v0.1 / 3D-M1 验收。容差 px，阈值来自实测探针（probe3d，2026-07-10）。

const H = 1 / 60;
const SW = TENTACLE3D.sweeps;

const finite = (s: LinkageSolver3D): boolean =>
  s.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z));
const settle = (s: LinkageSolver3D, frames: number): void => {
  for (let f = 0; f < frames; f++) s.step(H, SW);
};

describe('solver3d 内核', () => {
  it('单杆 3D 投影一步精确（xyz 全分量）', () => {
    const s = new LinkageSolver3D({
      nodes: [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 3, z: 6 }, // |d| = 7
      ],
      bars: [{ a: 0, b: 1, rest: 3.5 }],
    });
    s.iterate(1);
    const A = s.nodes[0];
    const B = s.nodes[1];
    expect(Math.abs(Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z) - 3.5)).toBeLessThan(1e-9);
  });

  it('缆线（穿环滑索）：总长收敛到目标；松弛时零作用力（单边）', () => {
    const s = new LinkageSolver3D({
      nodes: [
        { x: 0, y: 0, z: 0, fixed: true },
        { x: 10, y: 0, z: 0 },
        { x: 20, y: 0, z: 0 },
        { x: 30, y: 0, z: 0 },
      ],
      bars: [],
      cables: [{ nodes: [0, 1, 2, 3] }], // 自然总长 30
    });
    s.setCableRest(0, 24); // 抽线 6
    s.iterate(40);
    expect(Math.abs(s.cableLength(0) - 24)).toBeLessThan(0.01);
    expect([s.nodes[0].x, s.nodes[0].y, s.nodes[0].z]).toEqual([0, 0, 0]); // 锚点不动
    // 单边：目标放长到 40（松弛）——绳不推，构型不再变化
    s.setCableRest(0, 40);
    const before = s.nodes.map((n) => [n.x, n.y, n.z]);
    s.iterate(20);
    s.nodes.forEach((n, i) => {
      expect(n.x).toBe(before[i][0]);
      expect(n.y).toBe(before[i][1]);
      expect(n.z).toBe(before[i][2]);
    });
  });

  it('锚点严格不动；setRest 后向新原长收敛', () => {
    const s = new LinkageSolver3D({
      nodes: [
        { x: 1, y: 2, z: 3, fixed: true },
        { x: 1, y: 22, z: 3 },
      ],
      bars: [{ a: 0, b: 1, rest: 20 }],
    });
    s.setRest(0, 8);
    s.iterate(4);
    expect([s.nodes[0].x, s.nodes[0].y, s.nodes[0].z]).toEqual([1, 2, 3]);
    const d = Math.hypot(s.nodes[1].x - 1, s.nodes[1].y - 2, s.nodes[1].z - 3);
    expect(Math.abs(d - 8)).toBeLessThan(1e-6);
  });

  it('自由落体 1 秒 ≈ ½gt²（±10%）；step 内置 dt clamp 子步封顶', () => {
    const s = new LinkageSolver3D(
      { nodes: [{ x: 0, y: 0, z: 0 }], bars: [] },
      { dynamics: { gravity: { x: 0, y: 100, z: 0 }, damping: 1 } },
    );
    for (let f = 0; f < 60; f++) s.step(H, 1);
    expect(s.nodes[0].y).toBeGreaterThan(45);
    expect(s.nodes[0].y).toBeLessThan(55.5);
    const y0 = s.nodes[0].y;
    s.step(5, 1); // 切后台级大 dt：钳到 0.05s（此刻 v≈100px/s → 位移 ≈5px，而非 5s 的 ~2500px）
    expect(s.nodes[0].y - y0).toBeLessThan(7);
    expect(finite(s)).toBe(true);
  });
});

describe('立体肌腱触手', () => {
  it('静息 = 真机静息几何：全约束天然满足（err 0.000），原地不动', () => {
    const { solver: s } = createTentacle3();
    settle(s, 120);
    const tip = s.nodes[SPINE3(TIP3)];
    expect(Math.abs(tip.x)).toBeLessThan(1);
    expect(Math.abs(tip.z)).toBeLessThan(2); // 真机中轴线本身有 ~1mm 摆动（大小盘交替）
    expect(tip.y).toBeCloseTo(357.8, 0); // 干净版真机臂长（7 站，11.3dm）
    expect(s.maxError()).toBeLessThan(0.5);
  });

  it.each([0, 1, 2])('肌腱 %i 收缩 c=0.5：弯向自身方位（v3 真实走线实测沿向 83–97）', (k) => {
    const { solver: s, tendons } = createTentacle3();
    settle(s, 60);
    applyContraction3(s, tendons[k], 0.5);
    settle(s, 400);
    const tip = s.nodes[SPINE3(TIP3)];
    const [dx, dz] = TENDON_DIRS[k];
    const along = dx * tip.x + dz * tip.z;
    const perp = -dz * tip.x + dx * tip.z;
    // 诚实走线（缩短全部来自跨缝段）同行程弯幅小于 v2 抄近道的假杠杆——真机量级
    expect(along).toBeGreaterThan(70);
    expect(Math.abs(perp)).toBeLessThan(30);
    expect(Math.abs(perp)).toBeLessThan(along * 0.25);
  });

  it('深抽 c=1：J 形卷曲——曲率向软梢递增、总卷曲物理量级、无死折', () => {
    const { solver: s, tendons } = createTentacle3();
    settle(s, 60);
    applyContraction3(s, tendons[0], 1);
    settle(s, 600);
    // 逐关节折角（含根部关节：静息臂向 +y 与首段的夹角——根关节自由后
    // 卷曲从根部就开始，用户纠偏 2026-07-11）
    const dir = (a: { x: number; y: number; z: number }, b: typeof a): number[] => [
      b.x - a.x, b.y - a.y, b.z - a.z,
    ];
    const segs: number[][] = [[0, 1, 0]];
    for (let j = 0; j < TENTACLE3D.segments; j++) {
      segs.push(dir(s.nodes[SPINE3(j)], s.nodes[SPINE3(j + 1)]));
    }
    const fold: number[] = [];
    for (let j = 1; j < segs.length; j++) {
      const [a, b] = [segs[j - 1], segs[j]];
      const dd =
        (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) /
        (Math.hypot(a[0], a[1], a[2]) * Math.hypot(b[0], b[1], b[2]));
      fold.push((Math.acos(Math.max(-1, Math.min(1, dd))) * 180) / Math.PI);
    }
    const total = fold.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(70); // 深卷成立（根活化后实测 ≈75–90°）
    expect(total).toBeLessThan(160);
    expect(fold[fold.length - 1]).toBeGreaterThan(fold[1]); // 曲率向软梢集中
    expect(Math.max(...fold)).toBeLessThan(55); // 无死折（真机盘面接触上限内）
  });

  it('放松 15s 回真机静息位（实测残留 ≈0.1）', () => {
    const { solver: s, tendons } = createTentacle3();
    settle(s, 60);
    applyContraction3(s, tendons[0], 0.75);
    settle(s, 300);
    applyContraction3(s, tendons[0], 0);
    settle(s, 900);
    const tip = s.nodes[SPINE3(TIP3)];
    expect(Math.abs(tip.x)).toBeLessThan(10);
    expect(Math.abs(tip.z)).toBeLessThan(10);
  });

  it('三腱全收：屈曲有界、结构完好（脊柱不可伸长）', () => {
    const { solver: s, tendons } = createTentacle3();
    settle(s, 180);
    tendons.forEach((t) => applyContraction3(s, t, 1));
    settle(s, 400);
    expect(finite(s)).toBe(true);
    const tip = s.nodes[SPINE3(TIP3)];
    expect(Math.hypot(tip.x, tip.y, tip.z)).toBeLessThan(380); // ≤ 臂长 357.8 + 软腱余量
  });

  it('视觉走线：绕点在本腱方位反向贴球背；梢节不穿中间、终点绑在自己的柱上', () => {
    const { solver: s } = createTentacle3();
    settle(s, 60);
    for (let k = 0; k < 3; k++) {
      const pts = tendonVisual3(s, k);
      expect(pts.length).toBe(1 + 6 * 3 + 2); // 盘孔入口 + 节 0..5 三点 + 梢节 [板孔, 绑柱]
      const [dx, dz] = TENDON_DIRS[k];
      // 入口 = 基座导线盘腱孔（固定锚侧，在本腱方位、盘面沿臂位置）
      expect(pts[0].y).toBeCloseTo(-23.79, 1);
      expect(pts[0].x * dx + pts[0].z * dz).toBeGreaterThan(0);
      for (let i = 0; i < 6; i++) {
        const w = pts[1 + i * 3 + 1]; // 每节中点 = 绕点
        const sp = s.nodes[SPINE3(i)];
        const rx = w.x - sp.x;
        const rz = w.z - sp.z;
        expect(rx * dx + rz * dz).toBeLessThan(0); // 越过轴线到背面
        expect(Math.hypot(rx, w.y - sp.y, rz)).toBeCloseTo(BALLS[i] + 1, 6);
      }
      // 梢节终点 = 真机绑线柱实测位（静息）且在本腱方位一侧（不越轴）
      const tie = pts[pts.length - 1];
      expect(tie.x).toBeCloseTo(TIES[k][0], 1);
      expect(tie.y).toBeCloseTo(TIES[k][1], 1);
      expect(tie.z).toBeCloseTo(TIES[k][2], 1);
      const sp6 = s.nodes[SPINE3(6)];
      expect((tie.x - sp6.x) * dx + (tie.z - sp6.z) * dz).toBeGreaterThan(0);
    }
  });

  it('确定性：同一收缩脚本两次运行逐位一致', () => {
    const run = (): number[] => {
      const { solver: s, tendons } = createTentacle3();
      settle(s, 60);
      applyContraction3(s, tendons[1], 0.7);
      settle(s, 90);
      applyContraction3(s, tendons[2], 0.4);
      settle(s, 90);
      return s.nodes.flatMap((n) => [n.x, n.y, n.z]);
    };
    const a = run();
    const b = run();
    a.forEach((v, i) => expect(Object.is(v, b[i])).toBe(true));
  });
});
