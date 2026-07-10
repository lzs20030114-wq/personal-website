import { describe, expect, it } from 'vitest';
import { LinkageSolver3D } from './solver3d';
import {
  TENDON_DIRS,
  TENTACLE3D,
  TIP3,
  SPINE3,
  applyContraction3,
  createTentacle3,
} from './tentacle3d-data';

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
    expect(tip.y).toBeCloseTo(249.5, 0); // 真机臂长
    expect(s.maxError()).toBeLessThan(0.5);
  });

  it.each([0, 1, 2])('肌腱 %i 收缩 c=0.5：弯向自身方位（真结构实测沿向 ≈147）', (k) => {
    const { solver: s, tendons } = createTentacle3();
    settle(s, 60);
    applyContraction3(s, tendons[k], 0.5);
    settle(s, 400);
    const tip = s.nodes[SPINE3(TIP3)];
    const [dx, dz] = TENDON_DIRS[k];
    const along = dx * tip.x + dz * tip.z;
    const perp = -dz * tip.x + dx * tip.z;
    expect(along).toBeGreaterThan(100);
    // 实测横向 1.5 / −16.7 / 30.5——真结构梢部小盘半径 2.7mm，抗扭力臂小，
    // 残余扭转比等截面模型大，方位主导性仍成立
    expect(Math.abs(perp)).toBeLessThan(40);
    expect(Math.abs(perp)).toBeLessThan(along * 0.3);
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
    expect(Math.hypot(tip.x, tip.y, tip.z)).toBeLessThan(300);
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
