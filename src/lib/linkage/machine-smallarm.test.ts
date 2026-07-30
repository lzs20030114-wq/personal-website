import { describe, expect, it } from 'vitest';
import {
  SA_A,
  SA_A2,
  SA_B,
  SA_T,
  SMALLARM,
  SMALLARM_IDLE,
  createSmallArm,
  driveSmallArm,
  idleSwing,
  saFrame,
  smallArmPose,
  stepSmallArm,
} from './machine-smallarm';
import { SMALLARM_PLACEMENTS, SMALLARM_SHAPE } from './machine-shape';

/**
 * 小触手守门测试。三类事故各卡一道：
 * ① 几何与图纸脱钩（链长与提取数据不符——改了模型忘了重跑脚本）；
 * ② 物理不成立（垂悬不收敛 / 驱动方向反 / 甩不出滞后——这些不报错，只画错）；
 * ③ 标架不正交（渲染时零件被剪切拉花）。
 */

const settle = (sa: ReturnType<typeof createSmallArm>, secs: number): void => {
  for (let i = 0; i < secs * 120; i++) stepSmallArm(sa, 1 / 120);
};

describe('小触手：链几何', () => {
  it('节点静置位与图纸链长一致', () => {
    const sa = createSmallArm();
    const n = sa.solver.nodes;
    expect(n[SA_A].y).toBeCloseTo(-SMALLARM.L1, 6);
    expect(n[SA_B].y).toBeCloseTo(-SMALLARM.L1 - SMALLARM.LS, 6);
    expect(n[SA_T].y).toBeCloseTo(-SMALLARM.L1 - SMALLARM.LS - SMALLARM.L2, 6);
    expect(SMALLARM.L1).toBe(SMALLARM_SHAPE.L1);
  });

  it('驱动点按 θ 摆位：θ=90° 时 A 水平', () => {
    const sa = createSmallArm();
    driveSmallArm(sa, Math.PI / 2);
    const A = sa.solver.nodes[SA_A];
    expect(A.x).toBeCloseTo(SMALLARM.L1, 6);
    expect(A.y).toBeCloseTo(0, 6);
    const A2 = sa.solver.nodes[SA_A2];
    expect(Math.hypot(A.x - A2.x, A.y - A2.y)).toBeCloseTo(SMALLARM.clamp, 6);
  });
});

describe('小触手：物理', () => {
  it('垂悬收敛：θ=0 静置后整条链竖直、残差可忽略', () => {
    const sa = createSmallArm();
    driveSmallArm(sa, 0);
    settle(sa, 4);
    expect(Math.abs(sa.solver.nodes[SA_T].x)).toBeLessThan(0.5);
    expect(sa.solver.maxError()).toBeLessThan(0.05);
  });

  it('驱动方向：θ>0 保持后小块稳态偏向 +h 一侧', () => {
    const sa = createSmallArm();
    driveSmallArm(sa, 0.6);
    settle(sa, 4);
    expect(sa.solver.nodes[SA_T].x).toBeGreaterThan(10);
  });

  it('甩尾：正弦驱动下小块梢端跟着甩、且不与大节完全同步（软杆在起作用）', () => {
    const sa = createSmallArm();
    let minX = 1e9;
    let maxX = -1e9;
    let desync = 0;
    for (let i = 0; i < 12 * 120; i++) {
      const t = i / 120;
      driveSmallArm(sa, idleSwing(t, 0));
      stepSmallArm(sa, 1 / 120);
      if (t > 4) {
        const T = sa.solver.nodes[SA_T];
        minX = Math.min(minX, T.x);
        maxX = Math.max(maxX, T.x);
        // 大节梢端角 vs 小块方位角的瞬时差——恒为零说明整条链被解成了刚体
        const B = sa.solver.nodes[SA_B];
        const angSeg2 = Math.atan2(T.x - B.x, -(T.y - B.y));
        desync = Math.max(desync, Math.abs(angSeg2 - sa.theta));
      }
    }
    // 摆幅传到了梢端（不是只有大节在动）
    expect(maxX - minX).toBeGreaterThan(40);
    // 小块与驱动角之间存在明显相位/角度差（刚性链才会恒等于驱动角）
    expect(desync).toBeGreaterThan(0.1);
  });

  it('定步一致：同样的驱动序列两次运行逐位相同', () => {
    const run = (): number[] => {
      const sa = createSmallArm();
      for (let i = 0; i < 600; i++) {
        driveSmallArm(sa, idleSwing(i / 120, 0));
        stepSmallArm(sa, 1 / 120);
      }
      return sa.solver.nodes.flatMap((n) => [n.x, n.y]);
    };
    expect(run()).toEqual(run());
  });

  it('缓入：开场驱动角从零平滑拉起，不是第一帧就满幅', () => {
    expect(Math.abs(idleSwing(0.05, 0))).toBeLessThan(0.02);
    const late = Math.max(
      ...[...Array(200)].map((_, i) => Math.abs(idleSwing(10 + i / 20, 0))),
    );
    expect(late).toBeGreaterThan(SMALLARM_IDLE.amp * 0.95);
  });
});

describe('小触手：世界系标架', () => {
  it('两实例位姿轴系正交、行列式 +1（镜像装配靠旋转不靠反射）', () => {
    for (const p of SMALLARM_PLACEMENTS) {
      const fr = saFrame(p, [0, 0], [0, -1]);
      const cols = [
        [fr.ux, fr.uy, fr.uz],
        [fr.ex, fr.ey, fr.ez],
        [fr.fx, fr.fy, fr.fz],
      ];
      for (const c of cols) expect(Math.hypot(...c)).toBeCloseTo(1, 6);
      const det =
        cols[0][0] * (cols[1][1] * cols[2][2] - cols[1][2] * cols[2][1]) -
        cols[1][0] * (cols[0][1] * cols[2][2] - cols[0][2] * cols[2][1]) +
        cols[2][0] * (cols[0][1] * cols[1][2] - cols[0][2] * cols[1][1]);
      expect(det).toBeCloseTo(1, 6);
    }
  });

  it('悬垂位标架：局部 x̂ 指向世界 −z（烘焙约定），原点在轴心', () => {
    const fr = saFrame(SMALLARM_PLACEMENTS[0], [0, 0], [0, -1]);
    // 逐分量 toBeCloseTo：toEqual 会把 −0 与 +0 判不等（machine-arm 同款坑）
    expect(fr.ux).toBeCloseTo(0, 9);
    expect(fr.uy).toBeCloseTo(0, 9);
    expect(fr.uz).toBeCloseTo(-1, 9);
    expect(fr.o.z).toBeCloseTo(SMALLARM_PLACEMENTS[0].o[2], 6);
  });

  it('姿态整套可算：驱动后四组标架均有限、软杆 dy = LS', () => {
    const sa = createSmallArm();
    driveSmallArm(sa, 0.4);
    settle(sa, 1);
    for (const pi of [0, 1]) {
      const pose = smallArmPose(sa, pi);
      expect(pose.soft[2]).toBe(SMALLARM.LS);
      for (const fr of [pose.mount, pose.seg1, pose.soft[0], pose.soft[1], pose.seg2]) {
        for (const v of [fr.o.x, fr.o.y, fr.o.z, fr.ux, fr.ex, fr.fx]) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });

  it('镜像对称：同 θ 下两实例的大节标架在世界系反向摆（一前一后）', () => {
    const sa = createSmallArm();
    driveSmallArm(sa, 0.5);
    const a = smallArmPose(sa, 0).seg1;
    const b = smallArmPose(sa, 1).seg1;
    // 摆平面内的水平分量（世界 x = 体轴）应符号相反
    expect(Math.sign(a.ux)).toBe(-Math.sign(b.ux));
    expect(a.uz).toBeCloseTo(b.uz, 6);
  });
});
