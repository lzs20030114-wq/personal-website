import { describe, expect, it } from 'vitest';
import { LinkageSolver } from './solver';
import { LinkageController } from './controller';
import { TENTACLE, createTentacle } from './tentacle-data';
import { createCrankRocker } from './presets';

// 触手 spec §6：B（软约束）+ C（门控 Verlet）验收。容差单位 viewBox px。

const TIP = TENTACLE.segments; // 末端节点索引
const H = 1 / 60;

function makeCtl(solver: LinkageSolver, reducedMotion = false): LinkageController {
  // 无 driver：无曲柄机构（controller v0 限制：dynamics 与 driver 不组合）
  return new LinkageController(solver, { dragSweeps: TENTACLE.sweeps, spinSweeps: TENTACLE.sweeps, reducedMotion });
}

const finite = (s: LinkageSolver): boolean =>
  s.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y));

describe('B 级：Bar.stiffness 软约束', () => {
  it('缺省 stiffness = 1，四杆回归路径不受影响', () => {
    const s = createCrankRocker();
    s.bars.forEach((b) => expect(b.stiffness).toBe(1));
  });

  it('stiffness=0.5 单遍修正减半（两自由节点，10 → 8 而非 6）', () => {
    const s = new LinkageSolver({
      nodes: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      bars: [{ a: 0, b: 1, rest: 6, stiffness: 0.5 }],
    });
    s.iterate(1);
    const d = Math.hypot(s.nodes[1].x - s.nodes[0].x, s.nodes[1].y - s.nodes[0].y);
    expect(Math.abs(d - 8)).toBeLessThan(1e-9);
  });
});

describe('C 级：门控 Verlet（SPEC §3.6）', () => {
  it('未开启动力学时 step() 退化为 iterate()——旧机构零变化', () => {
    const a = createCrankRocker();
    const b = createCrankRocker();
    a.iterate(24);
    b.step(H, 24);
    a.nodes.forEach((n, i) => {
      expect(Object.is(n.x, b.nodes[i].x)).toBe(true);
      expect(Object.is(n.y, b.nodes[i].y)).toBe(true);
    });
  });

  it('自由落体：1 秒下落 ≈ ½gt²（±10%），轨迹单调加速', () => {
    const g = 100;
    const s = new LinkageSolver(
      { nodes: [{ x: 0, y: 0 }], bars: [] },
      { dynamics: { gravity: { x: 0, y: g }, damping: 1 } },
    );
    let prevY = 0;
    let prevStep = -1;
    for (let f = 0; f < 60; f++) {
      s.step(H, 1);
      const dy = s.nodes[0].y - prevY;
      expect(dy).toBeGreaterThanOrEqual(prevStep); // 加速下落
      prevStep = dy;
      prevY = s.nodes[0].y;
    }
    expect(prevY).toBeGreaterThan(45);
    expect(prevY).toBeLessThan(55.5); // ½·100·1² = 50
  });

  it('阻尼：无重力下拖出初速后逐步衰减到静止', () => {
    const s = new LinkageSolver(
      { nodes: [{ x: 0, y: 0 }], bars: [] },
      { dynamics: { gravity: { x: 0, y: 0 }, damping: 0.9 } },
    );
    // 拖 5 帧注入速度，然后松手
    s.beginDrag(0);
    for (let f = 0; f < 5; f++) {
      s.dragTo(200, 0);
      s.step(H, 4);
    }
    s.endDrag();
    let prev = Number.POSITIVE_INFINITY;
    let lastMove = 0;
    for (let f = 0; f < 60; f++) {
      const x0 = s.nodes[0].x;
      s.step(H, 4);
      lastMove = Math.abs(s.nodes[0].x - x0);
      expect(lastMove).toBeLessThanOrEqual(prev + 1e-9); // 单调衰减
      prev = lastMove;
    }
    expect(lastMove).toBeLessThan(0.05); // 基本静止
  });
});

describe('触手实例（悬垂/摆动/暴力甩）', () => {
  it('悬垂静息：2 秒后静止在基座正下方，残差 < 1px', () => {
    const s = createTentacle();
    for (let f = 0; f < 120; f++) s.step(H, TENTACLE.sweeps);
    expect(finite(s)).toBe(true);
    expect(s.maxError()).toBeLessThan(1);
    const tip = s.nodes[TIP];
    expect(Math.abs(tip.x - TENTACLE.base.x)).toBeLessThan(1); // 直垂
    const y0 = tip.y;
    s.step(H, TENTACLE.sweeps);
    expect(Math.abs(s.nodes[TIP].y - y0)).toBeLessThan(0.05); // 已静止
  });

  it('侧拉松手：摆过中线（钟摆）且振幅衰减', () => {
    const s = createTentacle();
    const ctl = makeCtl(s);
    for (let f = 0; f < 120; f++) ctl.frame(H); // 静息
    const tip = s.nodes[TIP];
    expect(ctl.pointerDown(1, tip.x, tip.y)).toBe(true);
    for (let f = 0; f < 40; f++) {
      ctl.pointerMove(1, TENTACLE.base.x + 160, TENTACLE.base.y + 160); // 拉向右侧
      ctl.frame(H);
    }
    ctl.pointerUp(1);
    expect(ctl.mode).toBe('idle'); // 无 driver：松手即撒手
    let crossed = false;
    let firstSwing = 0;
    let lateSwing = 0;
    // 摆动含甩鞭过冲（实测释放 160px 过冲至 ~178px），首 2s 与末 2s 对比才稳健
    for (let f = 0; f < 720; f++) {
      ctl.frame(H);
      const dx = s.nodes[TIP].x - TENTACLE.base.x;
      if (dx < 0) crossed = true; // 摆过中线
      if (f < 120) firstSwing = Math.max(firstSwing, Math.abs(dx));
      if (f >= 600) lateSwing = Math.max(lateSwing, Math.abs(dx));
    }
    expect(crossed).toBe(true);
    expect(lateSwing).toBeLessThan(firstSwing * 0.5); // 12s 实测衰减到 ~23%
    expect(finite(s)).toBe(true);
  });

  it('暴力甩不炸：目标 (10⁴, 380) 十帧 + 松手一秒，全程有限且被臂长约束', () => {
    const s = createTentacle();
    const ctl = makeCtl(s);
    const tip = s.nodes[TIP];
    expect(ctl.pointerDown(1, tip.x, tip.y)).toBe(true);
    for (let f = 0; f < 10; f++) {
      ctl.pointerMove(1, 1e4, 380);
      ctl.frame(H);
    }
    ctl.pointerUp(1);
    for (let f = 0; f < 60; f++) ctl.frame(H);
    expect(finite(s)).toBe(true);
    const arm = TENTACLE.segments * TENTACLE.segLen;
    s.nodes.forEach((n) => {
      const r = Math.hypot(n.x - TENTACLE.base.x, n.y - TENTACLE.base.y);
      expect(r).toBeLessThan(arm * 1.5); // 链在，没被甩散
    });
  });

  it('切后台：step(2s) 子步封顶，不瞬移不发散', () => {
    const s = createTentacle();
    for (let f = 0; f < 120; f++) s.step(H, TENTACLE.sweeps);
    const y0 = s.nodes[TIP].y;
    s.step(2, TENTACLE.sweeps); // 静息态下大 dt：位置几乎不变
    expect(finite(s)).toBe(true);
    expect(Math.abs(s.nodes[TIP].y - y0)).toBeLessThan(5);
    expect(s.maxError()).toBeLessThan(2);
  });

  it('确定性：同一脚本两次运行逐位一致', () => {
    const run = (): number[] => {
      const s = createTentacle();
      const ctl = makeCtl(s);
      for (let f = 0; f < 30; f++) ctl.frame(H);
      ctl.pointerDown(1, s.nodes[TIP].x, s.nodes[TIP].y);
      for (let f = 0; f < 10; f++) {
        ctl.pointerMove(1, 500, 300);
        ctl.frame(H);
      }
      ctl.pointerUp(1);
      for (let f = 0; f < 30; f++) ctl.frame(H);
      return s.nodes.flatMap((n) => [n.x, n.y]);
    };
    const a = run();
    const b = run();
    a.forEach((v, i) => expect(Object.is(v, b[i])).toBe(true));
  });
});
