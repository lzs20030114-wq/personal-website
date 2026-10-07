import { describe, expect, it } from 'vitest';
import { HZ, runSession, type ScheduledInput } from './behavior/engine';
import type { PersonaKey } from './behavior/persona';
import { PERSONA_KEYS } from './behavior/persona';
import {
  MACHINE_DIR,
  MACHINE_DRIVE,
  MACHINE_THETA0,
  type Machine,
  apexHeight,
  createMachine,
  machineMaxError,
  rodLengthDrift,
  runMachine,
  stepMachine,
} from './machine';
import { ARM_IDLE, idleContraction, idleEase, idleSwayAngle } from './machine-arm';
import {
  CRANK,
  FACING,
  SWEEP,
  crankPlan,
  feelerAngle,
  feelerSide,
  followBreath,
  halfTowardPerson,
  hitBand,
  inTri,
  polylineDist,
  shellHalf,
  strokeToTheta,
  sweepFraming,
  tendonContractions,
  thetaToStroke,
  yawFrame,
  yawPoint,
} from './machine-behavior';
import { ARM_PLACEMENT, SMALLARM_PLACEMENTS } from './machine-shape';
import { SMALLARM_STARTLE, startleSwing } from './machine-smallarm';
import { BALLS, STATIONS } from './tentacle3d-shape';

/**
 * 行为引擎 → 整机台架适配层的守门（spec §6.2，M2）。三类事故各卡一道：
 * ① 换算错了（行程分数与曲柄角对不上、腱的分配与待机标定不是同一式）——不报错，只「演错」；
 * ② 速度超了解算能承受的步距——五环会悄悄漂进别的解支（07-17 的教训）；
 * ③ 朝向约定前后不一（机身正前方、壳体左右半、触须编号）——点哪一侧、往哪边甩全会反。
 */

const trisOk = (m: Machine): boolean =>
  m.rings.every((r) =>
    r.data.tris.every(([i, j, k], t) => {
      const a = r.solver.nodes[i];
      const b = r.solver.nodes[j];
      const c = r.solver.nodes[k];
      return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) === r.data.signs[t];
    }),
  );
/** 各环此刻的实际行程分数（拱顶相对图纸姿态下沉了多少 / 2R） */
const ringStrokes = (m: Machine): number[] =>
  MACHINE_DRIVE.map((d, ri) => (d.apex0 - apexHeight(m, ri)) / (2 * d.crankR));
/** 曲柄角不动、只让五环解算再收敛几轮（dθ = 0 的空步） */
const settle = (m: Machine): void => {
  for (let k = 0; k < 4; k++) stepMachine(m, 0);
};

describe('呼吸：行程分数 ↔ 曲柄角', () => {
  it('两端对上死点、单调、正反算互逆', () => {
    expect(strokeToTheta(0)).toBeCloseTo(MACHINE_THETA0, 12);
    expect(strokeToTheta(1)).toBeCloseTo(MACHINE_THETA0 + MACHINE_DIR * Math.PI, 12);
    let prev = -Infinity;
    for (let s = 0; s <= 1.0000001; s += 0.05) {
      const th = strokeToTheta(s);
      expect(thetaToStroke(th)).toBeCloseTo(s, 9);
      const u = (th - MACHINE_THETA0) * MACHINE_DIR; // 离伸展位转过的角，随 s 单调增
      expect(u).toBeGreaterThan(prev);
      prev = u;
    }
    expect(strokeToTheta(-0.3)).toBe(strokeToTheta(0));
    expect(strokeToTheta(1.4)).toBe(strokeToTheta(1));
  });

  /**
   * 两个量分开卡（2026-10-07 实测）：
   * - **走动中的滞后**：每子步 1° 时拱顶追不上曲柄，最多差 0.025 行程（≈1.8 mm），停下来就收；
   * - **环自己的回差**：静下来以后仍有 ≤0.016 行程（≈1–2 mm），而且下行偏低、上行偏高——
   *   拱的侧向松量（脚槽里的零刚度滑移）让同一个曲柄角对应的拱形随来路不同。这是环的性质，
   *   与反解无关：单向慢扫时各环与 S3 理想值只差 ≤0.006。
   * 两者在 50–98 mm 的行程上都看不出来；这里卡住上界，防将来改了解算或步距后悄悄变大。
   */
  it('反解对整机仿真成立：曲柄停在 strokeToTheta(s) 时，五环实际行程分数与 s 的差只剩滞后与回差（≤0.03 / ≤0.02）', () => {
    const m = createMachine();
    let lag = 0;
    let hyst = 0;
    for (const s of [0.1, 0.3, 0.5, 0.7, 0.9, 1, 0.5, 0.2, 0]) {
      for (let guard = 0; guard < 200 && followBreath(m, s, 1) > 0; guard++);
      expect(m.theta).toBeCloseTo(strokeToTheta(s), 12);
      lag = Math.max(lag, ...ringStrokes(m).map((v) => Math.abs(v - s)));
      settle(m);
      hyst = Math.max(hyst, ...ringStrokes(m).map((v) => Math.abs(v - s)));
    }
    expect(lag).toBeLessThan(0.03);
    expect(hyst).toBeLessThan(0.02);
    expect(machineMaxError(m)).toBeLessThan(1.2);
    expect(trisOk(m)).toBe(true);
  });
});

describe('曲柄追随：限速与子步', () => {
  const deg = Math.PI / 180;
  const th = MACHINE_THETA0 + MACHINE_DIR * 0.8;

  it('限速 4°/帧（60 帧 = 4.19 rad/s）、每帧最多 6 个子步、每个子步 ≤1°、到位即停', () => {
    expect(crankPlan(th, th, 1 / 60)).toEqual({ n: 0, step: 0 });
    const small = crankPlan(th, th + 0.5 * deg, 1 / 60);
    expect(small.n).toBe(1);
    expect(small.step).toBeCloseTo(0.5 * deg, 14);
    const far = crankPlan(th, th + MACHINE_DIR * 30 * deg, 1 / 60);
    expect(far.n).toBe(4);
    expect(far.n * far.step).toBeCloseTo(MACHINE_DIR * CRANK.maxSpeed / 60, 12);
    const slowFrame = crankPlan(th, th + MACHINE_DIR * 30 * deg, 0.5);
    expect(slowFrame.n).toBe(CRANK.maxSubsteps);
    expect(Math.abs(slowFrame.step)).toBeLessThanOrEqual(CRANK.maxSubstep + 1e-15);
    // 恰好 2°：不能因为浮点多走一步
    expect(crankPlan(th, th + 2 * deg, 1).n).toBe(2);
    // 目标出了往复区间就钳回端点
    const beyond = crankPlan(MACHINE_THETA0 - MACHINE_DIR * 0.001, MACHINE_THETA0 - MACHINE_DIR * 3, 1 / 60);
    expect(beyond.n * beyond.step).toBeCloseTo(MACHINE_DIR * 0.001, 12);
  });

  it('§6.2 速度验证：以上限（1°/子步）来回走两个满行程，五环残差 < 1.2 mm、杆长不漂、不翻面、两端对得上死点', () => {
    const m = createMachine();
    let dir = MACHINE_DIR;
    let peak = 0;
    let drift = 0;
    let signs = true;
    let turns = 0;
    for (let i = 0; i < 4 * 180 + 2; i++) {
      const before = dir;
      dir = runMachine(m, dir, CRANK.maxSubstep);
      peak = Math.max(peak, machineMaxError(m));
      drift = Math.max(drift, rodLengthDrift(m));
      signs &&= trisOk(m);
      if (dir !== before) {
        turns++;
        const folded = dir !== MACHINE_DIR;
        MACHINE_DRIVE.forEach((d, ri) => {
          const want = folded ? d.apex0 - 2 * d.crankR : d.apex0;
          expect(Math.abs(apexHeight(m, ri) - want)).toBeLessThan(1);
        });
      }
    }
    expect(turns).toBe(4);
    expect(peak).toBeLessThan(1.2);
    expect(drift).toBeLessThan(0.01);
    expect(signs).toBe(true);
  });

  /** 引擎的呼吸轨迹（60 帧/秒）喂给追随器：只推 θ（不跑解算），量跟随滞后与需求速度 */
  function track(k: PersonaKey, seed: number) {
    const order: PersonaKey[] = [k, ...PERSONA_KEYS.filter((x) => x !== k)];
    const inputs: ScheduledInput[] = [];
    for (let t = 64; t < 300; t += 3) inputs.push({ t, input: { kind: 'SHELL_STROKE', half: 'L', touch: 'pat' } });
    for (let t = 66; t < 300; t += 20) inputs.push({ t, input: { kind: 'SOUND', level: 0.8 } });
    const { frames } = runSession({ seed, order, inputs, until: 300, frameEvery: 1 / HZ });
    let theta = strokeToTheta(frames[0].targets.breath.s);
    let prevTarget = theta;
    const lag: number[] = [];
    let need = 0;
    let over = 0;
    for (const f of frames) {
      const s = f.targets.breath.s;
      const target = strokeToTheta(s);
      const p = crankPlan(theta, target, 1 / HZ);
      theta += p.n * p.step;
      if (f.phase === 'GROW') {
        const w = Math.abs(target - prevTarget) * HZ;
        need = Math.max(need, w);
        if (w > CRANK.maxSpeed) over++;
        lag.push(Math.abs(thetaToStroke(theta) - s));
      }
      prevTarget = target;
    }
    const n = lag.length;
    lag.sort((a, b) => a - b);
    return { p95: lag[Math.floor(n * 0.95)], max: lag[n - 1], need, over: over / n };
  }

  /**
   * 实测（2026-10-07，种子 7 / 11，成长段带轻拍与拍手）：活力型需求峰值 4.7 / 5.3 rad/s，
   * 1.2% / 1.3% 的帧超过上限，p95 滞后为 0、最大 0.04 / 0.12 行程（兴奋时死点附近最快那几口）；
   * 沉静 0.7、好奇 1.9、不稳定 2.7–3.3 rad/s，从不被限速。
   */
  it('引擎轨迹跟得上：沉静 / 好奇 / 不稳定从不被限速；活力型只在兴奋时最快的几口气上拖一点', () => {
    for (const seed of [7, 11]) {
      for (const k of ['B', 'C', 'D'] as const) {
        const r = track(k, seed);
        expect(r.need).toBeLessThan(CRANK.maxSpeed);
        expect(r.max).toBeLessThan(1e-9);
      }
      const a = track('A', seed);
      expect(a.need).toBeGreaterThan(CRANK.maxSpeed); // 如实：表里的节律在这里超过上限
      expect(a.over).toBeLessThan(0.03);
      expect(a.p95).toBeLessThan(0.01);
      expect(a.max).toBeLessThan(0.2);
    }
  });

  it('整机解算跟着引擎走 3 秒（活力型、带刺激）：残差健康、不翻面', () => {
    const order: PersonaKey[] = ['A', 'B', 'C', 'D'];
    const inputs: ScheduledInput[] = [
      { t: 62, input: { kind: 'SHELL_STROKE', half: 'L', touch: 'pat' } },
      { t: 63, input: { kind: 'SOUND', level: 0.8 } },
    ];
    const { frames } = runSession({ seed: 3, order, inputs, until: 65, frameEvery: 1 / HZ });
    const m = createMachine();
    for (let guard = 0; guard < 400 && followBreath(m, frames.find((f) => f.t >= 62)!.targets.breath.s, 1) > 0; guard++);
    let peak = 0;
    for (const f of frames) {
      if (f.t < 62) continue;
      followBreath(m, f.targets.breath.s, 1 / HZ);
      peak = Math.max(peak, machineMaxError(m));
    }
    expect(peak).toBeLessThan(1.2);
    expect(trisOk(m)).toBe(true);
  });
});

describe('臂与触须', () => {
  it('三腱：与待机波形同一式（预张力 0.34 + 差动 0.34 按 120° 分配、负值截零）', () => {
    for (const t of [3, 7.3, 12, 20.5, 41]) {
      const curl = ARM_IDLE.floor + (1 - ARM_IDLE.floor) * (0.5 + 0.5 * Math.sin(ARM_IDLE.curl * t));
      const c = tendonContractions({ tone: 1, bend: curl * idleEase(t), dir: idleSwayAngle(t) });
      for (let k = 0; k < 3; k++) expect(c[k]).toBeCloseTo(idleContraction(t, k), 12);
    }
    expect(tendonContractions({ tone: 0, bend: 0, dir: 1 })).toEqual([0, 0, 0]);
    const full = tendonContractions({ tone: 1, bend: 1, dir: 0 });
    expect(full[0]).toBeCloseTo(ARM_IDLE.base + ARM_IDLE.span, 12);
    expect(full[1]).toBeCloseTo(ARM_IDLE.base, 12); // cos(−120°) < 0：只剩预张力
  });

  it('触须：没有反射 = 基角；有反射 = 基角 + 增益 × 甩开波形；整体钳在 ±75°', () => {
    const none = { base: 0.2, startle: { t: Infinity, dir: 1 as const, gain: 1 } };
    expect(feelerAngle(none)).toBe(0.2);
    const st = { base: 0.1, startle: { t: 0.15, dir: -1 as const, gain: 0.6 } };
    expect(feelerAngle(st)).toBeCloseTo(0.1 + 0.6 * startleSwing(0.15, -1), 12);
    const huge = { base: 1.2, startle: { t: 0.18, dir: 1 as const, gain: 1 } };
    expect(feelerAngle(huge)).toBeLessThanOrEqual(SMALLARM_STARTLE.max);
    expect(feelerAngle({ base: 0.3, startle: { t: -0.05, dir: 1, gain: 1 } })).toBe(0.3); // 即将触发 = 还没动
  });
});

describe('偏航占位与朝向约定', () => {
  const f = {
    o: { x: 30, y: -40, z: 7 },
    ux: 1, uy: 0, uz: 0,
    ex: 0, ey: 0.6, ez: 0.8,
    fx: 0, fy: -0.8, fz: 0.6,
  };

  it('yaw = 0 原样返回（行为档关着时编排档逐位不变）；转动保长保高、三列仍正交、两次转动可叠加', () => {
    expect(yawPoint(f.o, 0)).toBe(f.o);
    expect(yawFrame(f, 0)).toBe(f);
    const p = yawPoint(f.o, 0.7);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.hypot(f.o.x, f.o.y), 12);
    expect(p.z).toBe(f.o.z);
    const g = yawFrame(f, 0.7);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const u = [g.ux, g.uy, g.uz];
    const e = [g.ex, g.ey, g.ez];
    const w = [g.fx, g.fy, g.fz];
    expect(dot(u, e)).toBeCloseTo(0, 12);
    expect(dot(e, w)).toBeCloseTo(0, 12);
    expect(dot(u, u)).toBeCloseTo(1, 12);
    const twice = yawFrame(yawFrame(f, 0.3), 0.4);
    expect(twice.o.x).toBeCloseTo(g.o.x, 12);
    expect(twice.ex).toBeCloseTo(g.ex, 12);
  });

  it('机身正前方 −X 与引擎「触须 0 在左」自洽：触须 0 装在左半、1 在右半；按钮碰离人近的那一半', () => {
    expect(FACING).toBe(Math.PI);
    const [s0, s1] = SMALLARM_PLACEMENTS;
    expect(shellHalf({ x: s0.o[0], y: s0.o[1] })).toBe('L');
    expect(shellHalf({ x: s1.o[0], y: s1.o[1] })).toBe('R');
    expect(halfTowardPerson(Math.PI / 2, 0)).toBe('L');
    expect(halfTowardPerson(-Math.PI / 2, 0)).toBe('R');
    expect(halfTowardPerson(0.2, 1.4)).toBe('R'); // 机身已转向左边，人落在它右手
    expect(halfTowardPerson(null, 0)).toBe('R');
    expect(feelerSide(3)).toBe('L');
    expect(feelerSide(-3)).toBe('R');
  });
});

describe('取景与命中', () => {
  type M3 = number[];
  const mul = (a: M3, b: M3): M3 => {
    const r = new Array<number>(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return r;
  };
  const rx = (t: number): M3 => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
  const ry = (t: number): M3 => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];
  const rz = (t: number): M3 => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1];
  // 与 MachineBench 的 PRESET_VIEWS 同式
  const VIEWS: Record<string, M3> = {
    axon: mul(rz(-1.053336), mul(rx(0.735843), ry(0.867459))),
    front: rx(Math.PI / 2),
    left: mul(rx(Math.PI / 2), rz(-Math.PI / 2)),
    right: mul(rx(Math.PI / 2), rz(Math.PI / 2)),
    top: rz(0),
  };

  it('大触手够不出扫掠半径；扫掠圆柱在五个预设视角里都整个装进视口', () => {
    const [ox, oy] = ARM_PLACEMENT.origin;
    expect(Math.hypot(ox, oy) + STATIONS[STATIONS.length - 1][1] + BALLS[BALLS.length - 1]).toBeLessThan(SWEEP.r);
    for (const [name, m] of Object.entries(VIEWS)) {
      const { pivot, scale } = sweepFraming(m);
      expect(scale, name).toBeGreaterThan(0.25);
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * 2 * Math.PI;
        for (const z of [SWEEP.z0, SWEEP.z1]) {
          const d = [SWEEP.r * Math.cos(a) - pivot.x, SWEEP.r * Math.sin(a) - pivot.y, z - pivot.z];
          expect(Math.abs((m[0] * d[0] + m[1] * d[1] + m[2] * d[2]) * scale), name).toBeLessThanOrEqual(350);
          expect(Math.abs((m[3] * d[0] + m[4] * d[1] + m[5] * d[2]) * scale), name).toBeLessThanOrEqual(260);
        }
      }
    }
  });

  it('命中：折线距离、三角形（含边、不论朝向）、直纹带格号', () => {
    expect(polylineDist({ x: 5, y: 3 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeCloseTo(3, 12);
    expect(polylineDist({ x: 5, y: 3 }, [])).toBe(Infinity);
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    const c = { x: 0, y: 10 };
    expect(inTri({ x: 2, y: 2 }, a, b, c)).toBe(true);
    expect(inTri({ x: 2, y: 2 }, a, c, b)).toBe(true);
    expect(inTri({ x: 9, y: 9 }, a, b, c)).toBe(false);
    expect(inTri({ x: 5, y: 0 }, a, b, c)).toBe(true);
    const A = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const B = [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 10 }];
    expect(hitBand({ x: 15, y: 5 }, A, B)).toBe(1);
    expect(hitBand({ x: 5, y: 5 }, A, B)).toBe(0);
    expect(hitBand({ x: 25, y: 5 }, A, B)).toBe(-1);
  });
});
