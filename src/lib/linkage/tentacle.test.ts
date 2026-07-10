import { describe, expect, it } from 'vitest';
import { LinkageSolver } from './solver';
import { LinkageController } from './controller';
import { TENTACLE, TIP, SPINE, applyContraction, createTentacle } from './tentacle-data';
import { createCrankRocker } from './presets';

// 触手 spec v0.5：肌腱驱动平面版（机制提取自 触手模拟1.ghx）。容差 = viewBox px，
// 阈值全部来自实测探针（scratchpad tendon-probe，2026-07-10）。

const H = 1 / 60;
const SW = TENTACLE.sweeps;

const tipDx = (s: LinkageSolver): number => s.nodes[SPINE(TIP)].x - TENTACLE.base.x;
const finite = (s: LinkageSolver): boolean =>
  s.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
const settle = (s: LinkageSolver, frames: number): void => {
  for (let f = 0; f < frames; f++) s.step(H, SW);
};

describe('内核：B 级软约束 + C 级门控 Verlet（回归与单元）', () => {
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
      expect(dy).toBeGreaterThanOrEqual(prevStep);
      prevStep = dy;
      prevY = s.nodes[0].y;
    }
    expect(prevY).toBeGreaterThan(45);
    expect(prevY).toBeLessThan(55.5);
  });

  it('setRest：运行时改原长，投影向新 rest 收敛（收缩驱动的内核依据）', () => {
    const s = new LinkageSolver({
      nodes: [
        { x: 0, y: 0, fixed: true },
        { x: 20, y: 0 },
      ],
      bars: [{ a: 0, b: 1, rest: 20 }],
    });
    s.setRest(0, 12);
    s.iterate(4);
    const d = Math.hypot(s.nodes[1].x, s.nodes[1].y);
    expect(Math.abs(d - 12)).toBeLessThan(1e-6);
  });
});

describe('肌腱驱动触手（GH 机制平面版）', () => {
  it('静息：竖直悬垂，梢部在基座正下方，残差 < 1px', () => {
    const { solver: s } = createTentacle();
    settle(s, 180);
    expect(finite(s)).toBe(true);
    expect(s.maxError()).toBeLessThan(1);
    expect(Math.abs(tipDx(s))).toBeLessThan(1);
  });

  it('左肌腱收缩 c=0.5：向左弯曲（实测 dx ≈ −85）；释放后回到近直立', () => {
    const { solver: s, left } = createTentacle();
    settle(s, 180);
    applyContraction(s, left, 0.5);
    settle(s, 240);
    expect(tipDx(s)).toBeLessThan(-60);
    applyContraction(s, left, 0);
    settle(s, 900);
    expect(Math.abs(tipDx(s))).toBeLessThan(40); // GS 顺序偏差留 ~14px 残留，已知局限
    expect(finite(s)).toBe(true);
  });

  it('右肌腱收缩 c=0.5：向右弯曲（镜像）', () => {
    const { solver: s, right } = createTentacle();
    settle(s, 180);
    applyContraction(s, right, 0.5);
    settle(s, 240);
    expect(tipDx(s)).toBeGreaterThan(50);
  });

  it('满收缩 c=1：深度卷曲（梢部大幅上抬）且结构完好', () => {
    const { solver: s, left } = createTentacle();
    settle(s, 180);
    applyContraction(s, left, 1);
    settle(s, 300);
    const tip = s.nodes[SPINE(TIP)];
    expect(tip.y - TENTACLE.base.y).toBeLessThan(200); // 悬垂 280 → 卷起后 <200（实测 ≈142）
    expect(tipDx(s)).toBeLessThan(-100);
    expect(finite(s)).toBe(true);
  });

  it('双侧同收 c=0.7：屈曲侧倾属真物理（欧拉失稳），但有界、不散架', () => {
    const { solver: s, left, right } = createTentacle();
    settle(s, 180);
    applyContraction(s, left, 0.7);
    applyContraction(s, right, 0.7);
    settle(s, 400);
    expect(finite(s)).toBe(true);
    expect(Math.abs(tipDx(s))).toBeLessThan(120); // 实测 ≈55，屈曲方向由数值扰动决定
    const tip = s.nodes[SPINE(TIP)];
    const r = Math.hypot(tip.x - TENTACLE.base.x, tip.y - TENTACLE.base.y);
    expect(r).toBeLessThan(300); // 脊柱不可伸长
  });

  it('暴力甩 + 满收缩：全程有限、链被臂长约束', () => {
    const { solver: s, left } = createTentacle();
    const ctl = new LinkageController(s, { dragSweeps: SW, spinSweeps: SW });
    applyContraction(s, left, 1);
    const tip = s.nodes[SPINE(TIP)];
    expect(ctl.pointerDown(1, tip.x, tip.y)).toBe(true);
    for (let f = 0; f < 10; f++) {
      ctl.pointerMove(1, 1e4, 380);
      ctl.frame(H);
    }
    ctl.pointerUp(1);
    expect(ctl.mode).toBe('idle');
    for (let f = 0; f < 60; f++) ctl.frame(H);
    expect(finite(s)).toBe(true);
    const arm = TENTACLE.segments * TENTACLE.segLen;
    s.nodes.forEach((n) => {
      const r = Math.hypot(n.x - TENTACLE.base.x, n.y - TENTACLE.base.y);
      expect(r).toBeLessThan(arm * 1.5);
    });
  });

  it('切后台：step(2s) 子步封顶，不瞬移不发散', () => {
    const { solver: s } = createTentacle();
    settle(s, 180);
    const y0 = s.nodes[SPINE(TIP)].y;
    s.step(2, SW);
    expect(finite(s)).toBe(true);
    expect(Math.abs(s.nodes[SPINE(TIP)].y - y0)).toBeLessThan(5);
  });

  it('确定性：同一收缩/拖拽脚本两次运行逐位一致', () => {
    const run = (): number[] => {
      const { solver: s, left, right } = createTentacle();
      const ctl = new LinkageController(s, { dragSweeps: SW, spinSweeps: SW });
      settle(s, 60);
      applyContraction(s, left, 0.6);
      for (let f = 0; f < 60; f++) ctl.frame(H);
      applyContraction(s, right, 0.3);
      ctl.pointerDown(1, s.nodes[SPINE(TIP)].x, s.nodes[SPINE(TIP)].y);
      for (let f = 0; f < 20; f++) {
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
