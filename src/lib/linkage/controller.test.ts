import { describe, expect, it } from 'vitest';
import { LinkageController } from './controller';
import { CRANK, N, THETA0, createCrankRocker } from './presets';
import type { LinkageSolver } from './solver';

function makeCtl(opts: Partial<ConstructorParameters<typeof LinkageController>[1]> = {}): {
  solver: LinkageSolver;
  ctl: LinkageController;
} {
  const solver = createCrankRocker();
  const ctl = new LinkageController(solver, {
    driver: { anchor: N.A, tip: N.B, radius: CRANK.r, omega: 0.9 },
    theta0: THETA0,
    ...opts,
  });
  return { solver, ctl };
}

const coords = (s: LinkageSolver): number[] => s.nodes.flatMap((n) => [n.x, n.y]);

describe('dt clamp（SPEC §5 条 3、8：切后台往返）', () => {
  it('dt=2s 时角增量 ≤ ω·0.05，曲柄端点不瞬移', () => {
    const { solver, ctl } = makeCtl();
    const t0 = ctl.theta;
    const bx = solver.nodes[N.B].x;
    const by = solver.nodes[N.B].y;
    ctl.frame(2); // 模拟切后台 2 秒后回来
    expect(ctl.theta - t0).toBeLessThanOrEqual(0.9 * 0.05 + 1e-12);
    const jump = Math.hypot(solver.nodes[N.B].x - bx, solver.nodes[N.B].y - by);
    expect(jump).toBeLessThan(5); // 66×0.9×0.05 ≈ 3px，远低于 34px 断笔阈值
  });
});

describe('命中测试（SPEC §4.3）', () => {
  it('24px 内最近的自由节点被抓取；锚点永不命中；空点击不进 drag', () => {
    const { solver, ctl } = makeCtl();
    // 锚点上按下 → 不命中
    expect(ctl.pointerDown(1, 250, 380)).toBe(false);
    expect(ctl.mode).not.toBe('drag');
    // 空白处按下 → 不命中
    expect(ctl.pointerDown(1, 50, 50)).toBe(false);
    // P 附近 20px 内按下 → 命中
    const p = solver.nodes[N.P];
    expect(ctl.pointerDown(1, p.x + 12, p.y - 12)).toBe(true);
    expect(ctl.mode).toBe('drag');
    ctl.pointerUp(1);
  });

  it('热区外 30px 不命中', () => {
    const { solver, ctl } = makeCtl();
    const p = solver.nodes[N.P];
    // P 上方 30px（且远离 B、C）
    expect(ctl.pointerDown(1, p.x, p.y - 30)).toBe(false);
  });
});

describe('多点触控防护（SPEC §5 条 4b）', () => {
  it('拖拽中第二指 down/move/up 全被忽略，第一指保持控制', () => {
    const { solver, ctl } = makeCtl();
    const c = solver.nodes[N.C];
    // 指 1 抓住 C，目标 = 摇杆圆上可达点
    const ang = Math.atan2(c.y - 380, c.x - 470) - (18 * Math.PI) / 180;
    const target = { x: 470 + 127 * Math.cos(ang), y: 380 + 127 * Math.sin(ang) };
    expect(ctl.pointerDown(1, c.x, c.y)).toBe(true);
    ctl.pointerMove(1, target.x, target.y);
    // 指 2 尝试抢 P → 拒绝
    const p = solver.nodes[N.P];
    expect(ctl.pointerDown(2, p.x, p.y)).toBe(false);
    // 指 2 的 move 不得篡改目标
    ctl.pointerMove(2, 100, 100);
    // 指 2 的 up 不得结束拖拽
    ctl.pointerUp(2);
    expect(ctl.mode).toBe('drag');
    // 收敛到指 1 的目标而非指 2 的
    for (let f = 0; f < 10; f++) ctl.frame(1 / 60);
    const dist = Math.hypot(solver.nodes[N.C].x - target.x, solver.nodes[N.C].y - target.y);
    expect(dist).toBeLessThan(0.1);
    // 指 1 松手才结束
    ctl.pointerUp(1);
    expect(ctl.mode).toBe('spin');
  });
});

describe('松手接回自转（SPEC §4.2 状态机）', () => {
  it('endDrag 后 θ 取自当前姿态，下一帧曲柄端点不跳', () => {
    const { solver, ctl } = makeCtl();
    const b = solver.nodes[N.B];
    // 抓住 B 拖到曲柄圆上另一处（可达）
    expect(ctl.pointerDown(1, b.x, b.y)).toBe(true);
    ctl.pointerMove(1, CRANK.cx + CRANK.r, CRANK.cy - 10);
    for (let f = 0; f < 10; f++) ctl.frame(1 / 60);
    ctl.pointerUp(1);
    expect(ctl.mode).toBe('spin');
    const bx = solver.nodes[N.B].x;
    const by = solver.nodes[N.B].y;
    ctl.frame(1 / 60);
    const jump = Math.hypot(solver.nodes[N.B].x - bx, solver.nodes[N.B].y - by);
    expect(jump).toBeLessThan(2); // 一帧正常自转位移 ≈ 66×0.9/60 ≈ 1px
  });
});

describe('reduced-motion（SPEC §4.2）', () => {
  it('初始 idle 且 frame 完全不动机构；拖拽可用；松手回 idle', () => {
    const { solver, ctl } = makeCtl({ reducedMotion: true });
    expect(ctl.mode).toBe('idle');
    const before = coords(solver);
    ctl.frame(1 / 60);
    const after = coords(solver);
    before.forEach((v, i) => expect(Object.is(v, after[i])).toBe(true));
    // 拖拽仍可用（用户主动发起的运动不属于「减少动画」）
    const p = solver.nodes[N.P];
    expect(ctl.pointerDown(1, p.x, p.y)).toBe(true);
    ctl.pointerUp(1);
    expect(ctl.mode).toBe('idle');
  });
});
