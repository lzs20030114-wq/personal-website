import { describe, expect, it } from 'vitest';
import { LinkageSolver } from './solver';
import {
  CRANK,
  EXPECTED_LOOP_SIGN,
  EXPECTED_PLATE_SIGN,
  N,
  THETA0,
  createCrankRocker,
  loopSign,
  makeCrankRockerDef,
  plateSign,
} from './presets';
import { buildTracePath, traceCouplerCurve } from './trace';

/** 固定扰动方向表（SPEC §8.3：测试禁裸 Math.random）。近似单位向量，幅度由用例给。 */
const PERTURB = [
  { i: N.B, ux: 0.6, uy: -0.8 },
  { i: N.C, ux: -0.936, uy: 0.352 },
  { i: N.P, ux: 0.28, uy: 0.96 },
] as const;

function perturbed(mag: number): LinkageSolver {
  const s = createCrankRocker();
  for (const { i, ux, uy } of PERTURB) {
    s.setNode(i, s.nodes[i].x + ux * mag, s.nodes[i].y + uy * mag);
  }
  return s;
}

const coords = (s: LinkageSolver): number[] => s.nodes.flatMap((n) => [n.x, n.y]);

describe('初始化（SPEC §2.3）', () => {
  it('settle 后收敛，分支符号符合期望（第 7 步断言）', () => {
    const s = createCrankRocker();
    expect(s.maxError()).toBeLessThan(0.5);
    expect(loopSign(s)).toBe(EXPECTED_LOOP_SIGN);
    expect(plateSign(s)).toBe(EXPECTED_PLATE_SIGN);
  });
});

describe('杆长守恒与收敛（SPEC §3.2 / §8.2）', () => {
  it('30px 扰动 iterate(36) 后 maxError < 0.5', () => {
    const s = perturbed(30);
    s.iterate(36);
    expect(s.maxError()).toBeLessThan(0.5);
  });

  it('收敛预算：5/15/30px 扰动所需遍数 ≤ 36（实测数字回填 SPEC §3.2）', () => {
    for (const mag of [5, 15, 30]) {
      let needed = -1;
      for (let n = 1; n <= 36; n++) {
        const s = perturbed(mag);
        s.iterate(n);
        if (s.maxError() < 0.5) {
          needed = n;
          break;
        }
      }
      console.info(`扰动 ${mag}px → ${needed} 遍收敛到 <0.5px`);
      expect(needed).toBeGreaterThan(0);
      expect(needed).toBeLessThanOrEqual(36);
    }
  });
});

describe('锚点（SPEC §4.1 契约 1）', () => {
  it('任意操作序列后 A、D 严格不动（=== 级，非容差）', () => {
    const s = perturbed(30);
    s.beginDrag(N.P);
    s.dragTo(1e4, 380);
    s.iterate(36);
    s.endDrag();
    s.iterate(36);
    expect(s.nodes[N.A].x).toBe(250);
    expect(s.nodes[N.A].y).toBe(380);
    expect(s.nodes[N.D].x).toBe(470);
    expect(s.nodes[N.D].y).toBe(380);
  });

  it('beginDrag 作用于锚点是 no-op', () => {
    const s = createCrankRocker();
    const before = coords(s);
    s.beginDrag(N.A);
    s.dragTo(0, 0);
    s.iterate(36);
    expect(s.nodes[N.A].x).toBe(250);
    expect(s.nodes[N.A].y).toBe(380);
    coords(s).forEach((v, i) => expect(Math.abs(v - before[i])).toBeLessThan(0.5));
  });
});

describe('确定性（SPEC §4.1 契约 3）', () => {
  it('同一调用序列两次运行，全部坐标逐位一致', () => {
    const run = (): number[] => {
      const s = perturbed(15);
      s.beginDrag(N.C);
      s.dragTo(500, 200);
      s.iterate(36);
      s.endDrag();
      s.iterate(36);
      return coords(s);
    };
    const a = run();
    const b = run();
    a.forEach((v, i) => expect(Object.is(v, b[i])).toBe(true));
  });
});

describe('数值（SPEC §3.5）', () => {
  it('两点重合 + 杆：iterate 后坐标全部有限（防除零）', () => {
    const s = new LinkageSolver({
      nodes: [
        { x: 100, y: 100 },
        { x: 100, y: 100 },
      ],
      bars: [{ a: 0, b: 1, rest: 50 }],
    });
    s.iterate(1);
    expect(coords(s).every(Number.isFinite)).toBe(true);
  });
});

describe('拖拽（SPEC §3.3 / §5 条 5、10）', () => {
  it('极端不可达目标（10⁴px）：全程无 NaN，松手后数帧内恢复刚性', () => {
    // 被拉到全展开边界 ≈ 奇异构型附近（SPEC §3.4），单次 iterate(36) 不足以恢复，
    // 真实 UI 的恢复发生在连续多帧——测试按帧计。
    const s = createCrankRocker();
    s.beginDrag(N.P);
    s.dragTo(1e4, 380);
    for (let f = 0; f < 5; f++) s.iterate(36);
    expect(coords(s).every(Number.isFinite)).toBe(true);
    s.endDrag();
    let frames = 0;
    while (s.maxError() >= 0.5 && frames < 20) {
      s.iterate(36);
      frames++;
    }
    console.info(`极端拖拽松手后恢复用时 ${frames} 帧（36 遍/帧）`);
    expect(s.maxError()).toBeLessThan(0.5);
    expect(frames).toBeLessThanOrEqual(8); // 实测 4 帧，留一倍余量
    expect(loopSign(s)).not.toBe(0);
  });

  it('稳态残差实测：越界目标、指针静止后连续多帧再取样（数字回填 SPEC）', () => {
    // P 从 A 侧的可达上界 ≈ |AB|+|BP| = 198px；目标放 A 正上方向外 overshoot px。
    // 真实边界由 D 侧链条更早收紧，overshoot 表示目标越界量的量级。
    for (const overshoot of [50, 150, 400]) {
      const s = createCrankRocker();
      s.beginDrag(N.P);
      s.dragTo(250, 380 - (198 + overshoot));
      for (let f = 0; f < 10; f++) s.iterate(36); // 稳态帧
      const err = s.maxError();
      console.info(`目标越界≈${overshoot}px → 稳态 maxError = ${err.toFixed(3)}px`);
      expect(Number.isFinite(err)).toBe(true);
      expect(err).toBeLessThan(0.6 * overshoot); // 实测 ≈0.2–0.5×（50/150/400 → 26/36/89px）
      s.endDrag();
      s.iterate(36);
      expect(s.maxError()).toBeLessThan(0.5); // 松手恢复
    }
  });
});

describe('镜像翻转压制（SPEC §5 条 6b，选项 B：注入限步）', () => {
  /** 跨线按压目标：P 关于 BC 线的镜像方向再延伸。 */
  function beyondTarget(s: LinkageSolver): { x: number; y: number } {
    const b = s.nodes[N.B];
    const c = s.nodes[N.C];
    const p = s.nodes[N.P];
    const ux = c.x - b.x;
    const uy = c.y - b.y;
    const t = ((p.x - b.x) * ux + (p.y - b.y) * uy) / (ux * ux + uy * uy);
    const foot = { x: b.x + t * ux, y: b.y + t * uy };
    return { x: foot.x + 1.6 * (foot.x - p.x), y: foot.y + 1.6 * (foot.y - p.y) };
  }

  it('瞬态划过（手一抖）：跨线目标 2 帧后收回，不翻面且恢复刚性', () => {
    const s = createCrankRocker();
    const home = { x: s.nodes[N.P].x, y: s.nodes[N.P].y };
    const beyond = beyondTarget(s);
    s.beginDrag(N.P);
    s.dragTo(beyond.x, beyond.y);
    s.iterate(36);
    s.iterate(36); // 两帧误划
    s.dragTo(home.x, home.y);
    for (let f = 0; f < 5; f++) s.iterate(36);
    expect(plateSign(s)).toBe(EXPECTED_PLATE_SIGN);
    s.endDrag();
    s.iterate(36);
    expect(s.maxError()).toBeLessThan(0.5);
  });

  it('持续按压最终会翻面（接受行为）：翻后仍是合法构型，松手恢复刚性', () => {
    const s = createCrankRocker();
    const beyond = beyondTarget(s);
    s.beginDrag(N.P);
    s.dragTo(beyond.x, beyond.y);
    let flipFrame = -1;
    for (let f = 0; f < 120 && flipFrame < 0; f++) {
      s.iterate(36);
      if (plateSign(s) !== EXPECTED_PLATE_SIGN) flipFrame = f;
    }
    console.info(`持续按压 flipFrame=${flipFrame}（-1 = 120 帧内未翻）`);
    expect(flipFrame).not.toBe(0); // 至少不能第 0 帧就翻——瞬态防护的底线
    s.endDrag();
    s.iterate(36);
    expect(s.maxError()).toBeLessThan(0.5);
    expect(loopSign(s)).not.toBe(0);
  });

  it('限步不回归可达目标收敛：C 拖到摇杆圆上一点，精确贴住', () => {
    const s = createCrankRocker();
    const c = s.nodes[N.C];
    const ang = Math.atan2(c.y - 380, c.x - 470) - (18 * Math.PI) / 180;
    const target = { x: 470 + 127 * Math.cos(ang), y: 380 + 127 * Math.sin(ang) };
    s.beginDrag(N.C);
    s.dragTo(target.x, target.y);
    for (let f = 0; f < 10; f++) s.iterate(36);
    const dist = Math.hypot(s.nodes[N.C].x - target.x, s.nodes[N.C].y - target.y);
    expect(dist).toBeLessThan(0.1);
    expect(s.maxError()).toBeLessThan(0.5);
  });
});

describe('自转分支连续（SPEC §3.4 / §5 条 6、7）', () => {
  it('曲柄整周 144 步 warm start：两个符号恒定，P 连续，残差有界', () => {
    const s = createCrankRocker();
    s.setFixed(N.B, true);
    let prev = { x: s.nodes[N.P].x, y: s.nodes[N.P].y };
    let maxAdj = 0;
    let maxErr = 0;
    for (let k = 1; k <= 144; k++) {
      const th = THETA0 + (2 * Math.PI * k) / 144;
      s.setNode(N.B, CRANK.cx + CRANK.r * Math.cos(th), CRANK.cy + CRANK.r * Math.sin(th));
      s.iterate(24);
      expect(loopSign(s)).toBe(EXPECTED_LOOP_SIGN);
      expect(plateSign(s)).toBe(EXPECTED_PLATE_SIGN);
      const p = s.nodes[N.P];
      maxAdj = Math.max(maxAdj, Math.hypot(p.x - prev.x, p.y - prev.y));
      maxErr = Math.max(maxErr, s.maxError());
      prev = { x: p.x, y: p.y };
    }
    s.setFixed(N.B, false);
    console.info(
      `整周：P 相邻步最大间距 ${maxAdj.toFixed(2)}px，过程 maxError 峰值 ${maxErr.toFixed(4)}px`,
    );
    expect(maxAdj).toBeLessThan(34);
    expect(maxErr).toBeLessThan(2);
  });
});

describe('iterateWithHistory（SPEC §6.1）', () => {
  it('快照数 = n；残差窗口衰减且收敛；终态与 iterate(n) 逐位一致', () => {
    // 实测发现 maxError 逐遍并非严格单调——GS 重分配误差时峰值可短暂回升
    // （maxError 不是 Lyapunov 函数）。诚实的断言：W 遍窗口内必须下降 + 最终收敛。
    const a = perturbed(30);
    const b = perturbed(30);
    const hist = a.iterateWithHistory(36);
    b.iterate(36);
    expect(hist.length).toBe(36);
    console.info('残差序列: ' + hist.map((h) => h.maxError.toFixed(2)).join(' '));
    expect(hist[hist.length - 1].maxError).toBeLessThan(0.5);
    const W = 8;
    for (let i = W; i < hist.length; i++) {
      const ok = hist[i].maxError < hist[i - W].maxError || hist[i].maxError < 0.5;
      expect(ok).toBe(true);
    }
    const ca = coords(a);
    const cb = coords(b);
    ca.forEach((v, i) => expect(Object.is(v, cb[i])).toBe(true));
  });
});

describe('轨迹断笔（SPEC §5 条 2）', () => {
  it('>34px 跳变处重新 M 起笔', () => {
    const d = buildTracePath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 200, y: 0 }, // 跳变
      { x: 210, y: 0 },
    ]);
    expect(d.match(/M/g)?.length).toBe(2);
    expect(d.match(/L/g)?.length).toBe(3);
  });

  it('null 同样断笔', () => {
    const d = buildTracePath([{ x: 0, y: 0 }, { x: 1, y: 1 }, null, { x: 2, y: 2 }]);
    expect(d.match(/M/g)?.length).toBe(2);
  });
});

describe('耦合曲线（SPEC §4.1 trace / §6.2）', () => {
  it('规范实例：grashof=true，steps+1 个点，闭合且连续', () => {
    const { points, grashof } = traceCouplerCurve(makeCrankRockerDef(), { steps: 144 });
    expect(grashof).toBe(true);
    expect(points.length).toBe(145);
    const first = points[0];
    const last = points[points.length - 1];
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(1);
    for (let i = 1; i < points.length; i++) {
      const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      expect(d).toBeLessThan(34);
    }
  });
});
