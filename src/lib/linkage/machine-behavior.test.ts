import { describe, expect, it } from 'vitest';
import { MACHINE_BASE_AXIS as YAW_AXIS } from './machine-base';
import { D_DEEP_SPAN, D_SPAN } from './behavior/vocab2';
import { ARM_BEND_MAX, HZ, runSession, type ScheduledInput } from './behavior/engine';
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
import type { GraspPhase } from './behavior/grasp';
import {
  ARM_CHORD,
  ARM_DRIVE,
  ARM_GEOM,
  CRANK,
  FACING,
  HAND_FAR,
  HAND_MM,
  HAND_UI,
  type ContactState,
  contactIdle,
  contactRadiusMm,
  contactStep,
  contactThresholds,
  pointerTrack,
  trackMark,
  trackMove,
  trackSpeed,
  trackTrim,
  R_FRONT,
  R_HULL,
  bendCommandDir,
  bendDirError,
  chordOfDrive,
  cssToLogical,
  driveOfChord,
  handReading,
  projectLogical,
  rayHitZ,
  tendonContractionsClip,
  unprojectAt,
  viewDepth,
  type ViewParams,
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
  it('原分解（对照）：与待机波形同一式（预张力 0.34 + 差动 0.34 按 120° 分配、负值截零）', () => {
    for (const t of [3, 7.3, 12, 20.5, 41]) {
      const curl = ARM_IDLE.floor + (1 - ARM_IDLE.floor) * (0.5 + 0.5 * Math.sin(ARM_IDLE.curl * t));
      const c = tendonContractionsClip({ tone: 1, bend: curl * idleEase(t), dir: idleSwayAngle(t) });
      for (let k = 0; k < 3; k++) expect(c[k]).toBeCloseTo(idleContraction(t, k), 12);
    }
    expect(tendonContractionsClip({ tone: 0, bend: 0, dir: 1 })).toEqual([0, 0, 0]);
    const full = tendonContractionsClip({ tone: 1, bend: 1, dir: 0 });
    expect(full[0]).toBeCloseTo(ARM_IDLE.base + ARM_IDLE.span, 12);
    expect(full[1]).toBeCloseTo(ARM_IDLE.base, 12); // cos(−120°) < 0：只剩预张力
  });

  it('三腱（2026-10-07 新分解）：不弯 = 预张力；「最紧 − 最松」在 D 与 2D/√3 之间；拮抗腱不掉进空行程；死了松垮；D 封顶', () => {
    expect(tendonContractions({ tone: 1, bend: 0, dir: 2 })).toEqual([ARM_IDLE.base, ARM_IDLE.base, ARM_IDLE.base]);
    expect(tendonContractions({ tone: 0, bend: 0, dir: 2 })).toEqual([0, 0, 0]);
    for (let deg = -180; deg < 180; deg += 15) {
      const dir = (deg * Math.PI) / 180;
      for (const bend of [0.3, 0.7, 1]) {
        const c = tendonContractions({ tone: 1, bend, dir });
        const spread = (Math.max(...c) - Math.min(...c)) / (ARM_DRIVE.span * bend);
        expect(spread).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(spread).toBeLessThanOrEqual(2 / Math.sqrt(3) + 1e-9);
        expect(Math.min(...c)).toBeGreaterThanOrEqual(ARM_DRIVE.floor - 1e-12);
        expect(Math.max(...c)).toBeLessThanOrEqual(1);
      }
      // 深缠：差动 = span + wrapSpan，再多也封顶 dMax
      const deep = tendonContractions({ tone: 1, bend: 1, dir, wrap: 1 });
      expect((Math.max(...deep) - Math.min(...deep)) / ARM_DRIVE.dMax).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(Math.max(...deep)).toBeLessThanOrEqual(1);
      const over = tendonContractions({ tone: 1, bend: 1, dir, wrap: 3 });
      expect(over).toEqual(deep);
    }
    // 松垮的臂（tone = 0）弯起来：只有主腱收紧，拮抗腱不会被抬到绷直点
    const limp = tendonContractions({ tone: 0, bend: 0.5, dir: 0 });
    expect(Math.min(...limp)).toBeCloseTo(0, 12);
    expect(ARM_DRIVE.dMax / ARM_DRIVE.span).toBeCloseTo(ARM_BEND_MAX, 2);
  });

  it('肌腱轴深卷（动作词汇 v2，默认关）：不给 deep 时开不开逐位相同；关着时 deep 只当普通差动、封顶 dMax；开着且正对腱轴（±12° 硬窗）主腱拉满、拮抗停在 floor；窗外照旧封顶', () => {
    for (let deg = -180; deg < 180; deg += 7) {
      const dir = (deg * Math.PI) / 180;
      for (const bend of [0, 0.4, 1]) {
        const arm = { tone: 1, bend, dir, wrap: 0.5 };
        expect(tendonContractions(arm, { deep: true })).toEqual(tendonContractions(arm));
        // 关着：deep 1 也只到 dMax
        const off = tendonContractions({ ...arm, deep: 1 });
        expect(Math.max(...off) - Math.min(...off)).toBeLessThanOrEqual((2 / Math.sqrt(3)) * ARM_DRIVE.dMax + 1e-9);
      }
    }
    const AX = (2 * Math.PI) / 3;
    for (const axis of [0, AX, -AX]) {
      for (const off of [0, 7.9, -7.9]) {
        const c = tendonContractions({ tone: 1, bend: 1, dir: axis + (off * Math.PI) / 180, deep: 1 }, { deep: true });
        expect(Math.max(...c)).toBeCloseTo(1, 9);
        expect(Math.min(...c)).toBeCloseTo(ARM_DRIVE.floor, 9);
      }
      // 窗外 12°：退回 dMax 封顶
      const out = tendonContractions({ tone: 1, bend: 1, dir: axis + (12 * Math.PI) / 180, deep: 1 }, { deep: true });
      expect(Math.max(...out) - Math.min(...out)).toBeLessThanOrEqual((2 / Math.sqrt(3)) * ARM_DRIVE.dMax + 1e-9);
    }
    // 连续：深卷满 / 一点点 / 收到 0，弯向从 −20° 扫到 +20°（穿过腱轴窗）；深卷从 0.2 收到 0 停在轴上——三腱每一小步都不跳
    for (const deep of [1, 0.3, 0.01]) {
      let prev = tendonContractions({ tone: 1, bend: 1, dir: (-20 * Math.PI) / 180, deep }, { deep: true });
      for (let i = 1; i <= 400; i++) {
        const c = tendonContractions({ tone: 1, bend: 1, dir: ((-20 + 0.1 * i) * Math.PI) / 180, deep }, { deep: true });
        expect(Math.max(...c.map((x, j) => Math.abs(x - prev[j])))).toBeLessThan(0.02);
        prev = c;
      }
    }
    let prev = tendonContractions({ tone: 1, bend: 1, dir: AX, deep: 0.2 }, { deep: true });
    for (let i = 1; i <= 200; i++) {
      const c = tendonContractions({ tone: 1, bend: 1, dir: AX, deep: 0.2 * (1 - i / 200) }, { deep: true });
      expect(Math.max(...c.map((x, j) => Math.abs(x - prev[j])))).toBeLessThan(0.02);
      prev = c;
    }
    expect(ARM_DRIVE.dDeep).toBeCloseTo(1 - ARM_DRIVE.floor, 12);
    // 动作程序（vocab2.ts）按同一个跨度把差动 D 换成 bend + deep：两边不一致 = 惊跳根本到不了设计的深度
    expect(D_SPAN).toBe(ARM_DRIVE.span);
    expect(D_DEEP_SPAN).toBeCloseTo(ARM_DRIVE.deepSpan, 4);
    expect(ARM_DRIVE.span + ARM_DRIVE.deepSpan).toBeCloseTo(ARM_DRIVE.dDeep, 12);
  });

  it('弯向补偿：三次迭代后「指令 + 偏差 ≈ 目标」（残差 < 1.2°）；朝上补得少、朝下补得多；差动为 0 不补', () => {
    for (let deg = -180; deg < 180; deg += 10) {
      const dir = (deg * Math.PI) / 180;
      const c = bendCommandDir(dir, 0.45);
      expect(Math.abs(c + bendDirError(c, 0.45) - dir)).toBeLessThan(0.02);
    }
    expect(Math.abs(bendCommandDir(0, 0.45))).toBeLessThan((8 * Math.PI) / 180);
    expect(Math.abs(bendCommandDir(Math.PI, 0.45) - Math.PI)).toBeGreaterThan((15 * Math.PI) / 180);
    expect(bendCommandDir(1.2, 0)).toBe(1.2);
  });

  it('弦角表：单调、互逆、两端封顶', () => {
    for (let d = 0; d <= ARM_DRIVE.dMax; d += 0.01) expect(driveOfChord(chordOfDrive(d))).toBeCloseTo(d, 9);
    for (let i = 1; i < ARM_CHORD.length; i++) expect(ARM_CHORD[i][1]).toBeGreaterThan(ARM_CHORD[i - 1][1]);
    expect(driveOfChord(90)).toBe(ARM_DRIVE.dMax);
    expect(chordOfDrive(-1)).toBe(0);
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
    expect(Math.hypot(p.x - YAW_AXIS.x, p.y - YAW_AXIS.y)).toBeCloseTo(Math.hypot(f.o.x - YAW_AXIS.x, f.o.y - YAW_AXIS.y), 12);
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

describe('手（指针）→ 传感', () => {
  type M3 = number[];
  const mul3 = (a: M3, b: M3): M3 => {
    const r = new Array<number>(9).fill(0);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return r;
  };
  const rx = (t: number): M3 => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
  const ry = (t: number): M3 => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];
  const rz = (t: number): M3 => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1];
  // 与 MachineBench 的 PRESET_VIEWS 同式
  const PRESET_AXON = mul3(rz(-1.053336), mul3(rx(0.735843), ry(0.867459)));
  const PRESET_TOP = rz(0);
  const PRESET_FRONT = rx(Math.PI / 2);
  const axon: ViewParams = { ...sweepFraming(PRESET_AXON), m: PRESET_AXON, pan: { x: 0, y: 0 }, persp: 0 };
  const top: ViewParams = { ...sweepFraming(PRESET_TOP), m: PRESET_TOP, pan: { x: 0, y: 0 }, persp: 0 };
  const front: ViewParams = { ...sweepFraming(PRESET_FRONT), m: PRESET_FRONT, pan: { x: 0, y: 0 }, persp: 0 };
  const persp: ViewParams = { ...axon, persp: 900, pan: { x: 12, y: -7 } };
  const deg = (r: number): number => (r * 180) / Math.PI;

  it('反投影是投影的逆（正交与透视、带平移）；画布 CSS 像素 ↔ 逻辑像素', () => {
    for (const v of [axon, top, front, persp]) {
      for (const p of [
        { x: -300, y: 120, z: -40 },
        { x: 210, y: -90, z: 150 },
        { x: 0, y: 0, z: 0 },
      ]) {
        const l = projectLogical(v, p);
        const back = unprojectAt(v, l, viewDepth(v, p));
        expect(Math.hypot(back.x - p.x, back.y - p.y, back.z - p.z)).toBeLessThan(1e-6);
      }
    }
    expect(cssToLogical(439, 326, 878, 652)).toEqual({ x: 0, y: 0 });
    const c = cssToLogical(878, 0, 878, 652);
    expect(c.x).toBeCloseTo(350, 9);
    expect(c.y).toBeCloseTo(-260, 9);
  });

  it('射线 ∩ 臂高水平面：轴测 / 俯视落在投影点上；平视返回 null（交点会飞到无穷远）', () => {
    const p = { x: -420, y: 260, z: ARM_GEOM.base.z };
    for (const v of [axon, top, persp]) {
      const hit = rayHitZ(v, projectLogical(v, p), p.z);
      expect(hit).not.toBeNull();
      expect(Math.hypot(hit!.x - p.x, hit!.y - p.y)).toBeLessThan(1e-6);
    }
    expect(rayHitZ(front, projectLogical(front, p), p.z)).toBeNull();
  });

  it('指针压在笔直的臂梢上：方位 = 臂梢的方位、臂不用弯；机身转了也一样', () => {
    for (const v of [axon, top, persp]) {
      for (const yaw of [0, 0.9, -2.4]) {
        const tip = yawPoint(ARM_GEOM.tip, yaw);
        const r = handReading(v, projectLogical(v, tip), yaw);
        expect(r.aimBend).toBeLessThan(1e-6);
        const want = Math.atan2(tip.y - YAW_AXIS.y, tip.x - YAW_AXIS.x) - FACING;
        expect(Math.abs(Math.atan2(Math.sin(r.bearing - want), Math.cos(r.bearing - want)))).toBeLessThan(1e-6);
        expect(r.dist).toBeCloseTo(Math.hypot(tip.x - YAW_AXIS.x, tip.y - YAW_AXIS.y), 6);
      }
    }
  });

  it('俯视：手在臂梢左边 → 弯向左（+90°）、右边 → −90°；离得越远弯得越多，够不着就封顶', () => {
    const tip = ARM_GEOM.tip;
    // 机身朝 −X 时左 = −Y
    const left = handReading(top, projectLogical(top, { x: tip.x, y: tip.y - 60, z: tip.z }), 0);
    const right = handReading(top, projectLogical(top, { x: tip.x, y: tip.y + 60, z: tip.z }), 0);
    expect(deg(left.aimDir)).toBeCloseTo(90, 6);
    expect(deg(right.aimDir)).toBeCloseTo(-90, 6);
    expect(left.aimBend).toBeGreaterThan(0.1);
    const far = handReading(top, projectLogical(top, { x: tip.x, y: tip.y - 200, z: tip.z }), 0);
    expect(far.aimBend).toBeGreaterThan(left.aimBend);
    const behind = handReading(top, projectLogical(top, { x: 300, y: 0, z: tip.z }), 0);
    expect(behind.aimBend).toBeCloseTo(ARM_DRIVE.dMax / ARM_DRIVE.span, 9);
    // 正视：手在臂梢上方 → 弯向上（0）
    const upF = handReading(front, projectLogical(front, { x: tip.x, y: tip.y, z: tip.z + 80 }), 0);
    expect(Math.abs(deg(upF.aimDir))).toBeLessThan(1e-6);
    expect(upF.aimBend).toBeGreaterThan(0.1);
  });

  it('平视（正视）：指针横扫过机器——在机身上读成摸壳（距离 = 外廓半径），方位平滑地变（不在 0° / 180° 之间跳）', () => {
    const c = projectLogical(front, { ...YAW_AXIS, z: ARM_GEOM.base.z });
    let prev: number | null = null;
    for (let dx = -40; dx <= 40; dx += 4) {
      const r = handReading(front, { x: c.x + dx, y: c.y }, 0);
      if (prev !== null) expect(Math.abs(Math.atan2(Math.sin(r.bearing - prev), Math.cos(r.bearing - prev)))).toBeLessThan((20 * Math.PI) / 180);
      prev = r.bearing;
      expect(r.onBody).toBe(true);
      expect(r.dist).toBe(R_HULL);
    }
    // 机身外侧：在朝相机的圆柱面上；更远处取射线离轴最近的点，距离继续变大
    const side = handReading(front, { x: c.x + 160, y: c.y }, 0);
    expect(side.onBody).toBe(false);
    expect(side.dist).toBeCloseTo(R_FRONT, 6);
    const far = handReading(front, { x: c.x + 340, y: c.y }, 0);
    expect(far.dist).toBeGreaterThan(R_FRONT);
  });

  it('轴测：指针在机身上方 → 摸壳，方位朝相机那一侧、挪 1 px 方位几乎不变（不在电机轴附近乱转）', () => {
    const apex = projectLogical(axon, { x: 0, y: 0, z: 157 });
    const r0 = handReading(axon, apex, 0);
    expect(r0.onBody).toBe(true);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const r = handReading(axon, { x: apex.x + dx, y: apex.y + dy }, 0, r0.bearing);
      expect(Math.abs(Math.atan2(Math.sin(r.bearing - r0.bearing), Math.cos(r.bearing - r0.bearing)))).toBeLessThan((5 * Math.PI) / 180);
    }
  });

  it('各视角 × 正交 / 透视：纵向扫过整个画面，方位与距离逐像素连续（机身边缘的进出不算）', () => {
    for (const m of [PRESET_AXON, PRESET_TOP, PRESET_FRONT]) {
      for (const persp of [0, 900]) {
        const v: ViewParams = { ...sweepFraming(m), m, pan: { x: 0, y: 0 }, persp };
        for (const lx of [-300, 0, 300]) {
          let prev: ReturnType<typeof handReading> | null = null;
          for (let ly = -259; ly <= 259; ly += 1) {
            const r = handReading(v, { x: lx, y: ly }, 0, prev?.bearing);
            if (prev && !prev.onBody && !r.onBody) {
              const dB = Math.abs(Math.atan2(Math.sin(r.bearing - prev.bearing), Math.cos(r.bearing - prev.bearing)));
              expect(dB, `${persp} ${lx} ${ly}`).toBeLessThan((10 * Math.PI) / 180);
              expect(Math.abs(r.dist - prev.dist), `${persp} ${lx} ${ly}`).toBeLessThan(80);
            }
            prev = r;
          }
        }
      }
    }
  });

  it('指针压在（笔直的）臂上或它的延长线上：臂不用弯（取射线上离臂轴最近的点，不是臂梢那个平面）', () => {
    for (const m of [PRESET_AXON, PRESET_TOP, PRESET_FRONT]) {
      for (const persp of [0, 900]) {
        const v: ViewParams = { ...sweepFraming(m), m, pan: { x: 0, y: 0 }, persp };
        for (const yaw of [0, 0.7]) {
          const B = yawPoint(ARM_GEOM.base, yaw);
          const T = yawPoint(ARM_GEOM.tip, yaw);
          for (const u of [0.25, 0.5, 0.75, 1, 1.3]) {
            const p = { x: B.x + (T.x - B.x) * u, y: B.y + (T.y - B.y) * u, z: B.z + (T.z - B.z) * u };
            expect(handReading(v, projectLogical(v, p), yaw).aimBend, `${persp} ${yaw} ${u}`).toBeLessThan(0.05);
          }
        }
      }
    }
  });

  it('臂不在机身中线上（偏右约 109 mm）：「迎」的朝向按臂线算——笔直臂梢的读数 face = 机身此刻朝向', () => {
    for (const yaw of [0, 0.8, -1.9]) {
      const r = handReading(top, projectLogical(top, yawPoint(ARM_GEOM.tip, yaw)), yaw);
      expect(Math.abs(Math.atan2(Math.sin(r.face - yaw), Math.cos(r.face - yaw)))).toBeLessThan(1e-3);
      expect(Math.abs(r.bearing - yaw)).toBeGreaterThan(0.15); // 中线方位与臂梢方位差约 11°
    }
  });

  it('读数带着离臂基座的距离与侧偏：指针压在臂梢上 → 离基座 = 臂长、侧偏 0', () => {
    const r = handReading(top, projectLogical(top, ARM_GEOM.tip), 0);
    expect(r.aimDist).toBeCloseTo(ARM_GEOM.length, 6);
    expect(r.side).toBeLessThan(1e-6);
  });

  it('指针在伸出机身外廓的那段臂旁边（轴测，机身朝着手转过去也一样）：不算摸壳', () => {
    for (const yaw of [0, -0.5, 0.9]) {
      const B = yawPoint(ARM_GEOM.base, yaw);
      const T = yawPoint(ARM_GEOM.tip, yaw);
      for (const u of [0.4, 0.6, 0.9]) {
        const p = { x: B.x + (T.x - B.x) * u, y: B.y + (T.y - B.y) * u, z: B.z + (T.z - B.z) * u + 30 };
        const r = handReading(axon, projectLogical(axon, p), yaw);
        expect(r.onBody, `${yaw} ${u}`).toBe(false);
        expect(r.dist, `${yaw} ${u}`).toBeGreaterThan(R_HULL);
      }
    }
  });

  it('手指第一下就按在机身顶上（没有上一个方位）：方位取机身朝向，不在电机轴附近乱跳', () => {
    const c = projectLogical(top, { x: 0, y: 0, z: 230 });
    for (const [dx, dy] of [[0, 0], [3, 0], [-3, 0], [0, 3]]) {
      const r = handReading(top, { x: c.x + dx, y: c.y + dy }, 0.7);
      expect(r.onBody).toBe(true);
      expect(r.bearing).toBeCloseTo(0.7, 9);
    }
  });

  it('手绕到臂基座附近：弯曲连续地渐隐（不会挪半个像素就从弯到底跳到不弯）', () => {
    for (const yaw of [0, 0.8]) {
      let prev: number | null = null;
      const B = projectLogical(axon, yawPoint(ARM_GEOM.base, yaw));
      for (let dx = -40; dx <= 40; dx += 0.5) {
        const r = handReading(axon, { x: B.x + dx, y: B.y + 3 }, yaw);
        if (prev !== null) expect(Math.abs(r.aimBend - prev), `${yaw} ${dx}`).toBeLessThan(0.25);
        prev = r.aimBend;
      }
    }
  });

  it('机身转动不改变同一个指针读出的方位与距离（两个平面都与机器姿态无关）', () => {
    for (const v of [axon, top, front]) {
      const l = { x: -120, y: 40 };
      const a = handReading(v, l, 0);
      const b = handReading(v, l, 1.7);
      expect(b.bearing).toBeCloseTo(a.bearing, 12);
      expect(b.dist).toBeCloseTo(a.dist, 12);
    }
    // 远处截住
    const sky = handReading(axon, { x: 0, y: -259 }, 0);
    expect(sky.dist).toBeLessThanOrEqual(HAND_FAR);
  });
});

// ------------------------------------------------------------------ 碰臂判定（contactStep，台架 syncHand ③ 搬来）

/**
 * 搬之前的台架（MachineBench 2026-10-07 版）碰臂那一段，逐字抄来当对照：syncHand ③ 与它依赖的指针事件
 * （pointermove 记轨迹、手指落下记一次挪动、按住 / 抬起大触手）。闭包变量收进一个对象，阈值写字面值
 * （顺带守着搬过去的 HAND_UI / HAND_MM 一个数没改）。cover 记下这段序列走过哪些分支——对照只有在
 * 分支都被走到时才说明问题。
 */
class RefContact {
  armHeld = false;
  pressAt = { x: 0, y: 0 };
  trail: { t: number; x: number; y: number }[] = [];
  nearSince = -1;
  enteredAt = -1;
  lastMoveAt = -Infinity;
  lastMovePos = { x: -1e9, y: -1e9 };
  hoverTouch = false;
  hoverBy: 'hand' | 'arm' = 'hand';
  hoverAt = { x: 0, y: 0 };
  cover = new Set<string>();

  move(tNow: number, px: number, py: number): void {
    this.trail.push({ t: tNow, x: px, y: py });
    if (this.trail.length > 64) this.trail.shift();
    if (Math.hypot(px - this.lastMovePos.x, py - this.lastMovePos.y) > 3) {
      this.lastMoveAt = tNow;
      this.lastMovePos = { x: px, y: py };
    }
  }

  fingerDown(t: number, px: number, py: number): void {
    this.lastMoveAt = t;
    this.lastMovePos = { x: px, y: py };
  }

  frame(now: number, px: number, py: number, d: number, pxPerMm: number, touch: boolean, frozen: boolean, gp: GraspPhase): void {
    const clampN = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
    const trail = this.trail;
    while (trail.length && now - trail[0].t > 0.3) trail.shift();
    if (frozen) {
      this.cover.add('frozen');
      return;
    }
    const touchPx = clampN(32 * pxPerMm, touch ? 20 : 8, touch ? 44 : 28);
    if (touchPx !== 32 * pxPerMm) this.cover.add(touch ? 'clamp-finger' : 'clamp-mouse');
    const releasePx = touchPx * (68 / 32);
    const anchorPx = touchPx * (80 / 32);
    const maxSpeed = 800 * pxPerMm;
    if (this.armHeld && d > releasePx && Math.hypot(px - this.pressAt.x, py - this.pressAt.y) > anchorPx) {
      this.armHeld = false;
      this.cover.add('drag-off');
    }
    const t0 = trail[0];
    const speed = t0 && now - t0.t > 0.02 ? Math.hypot(px - t0.x, py - t0.y) / (now - t0.t) : 0;
    if (!this.hoverTouch) {
      if (d <= touchPx) {
        if (this.enteredAt < 0) this.enteredAt = now;
      } else this.enteredAt = -1;
      if (d <= touchPx && speed <= maxSpeed) {
        if (this.nearSince < 0) this.nearSince = now;
        if (now - this.nearSince >= 0.12) {
          this.hoverTouch = true;
          this.hoverAt = { x: px, y: py };
          this.hoverBy = this.enteredAt - this.lastMoveAt >= 0.2 ? 'arm' : 'hand';
          this.cover.add(`touch-${this.hoverBy}`);
        }
      } else {
        if (d <= touchPx) this.cover.add('swipe');
        this.nearSince = -1;
      }
    } else {
      const coiled = gp === 'WRAP' || gp === 'HOLD_HUMAN' || gp === 'HOLD_OBJECT';
      const stay = coiled && Math.hypot(px - this.hoverAt.x, py - this.hoverAt.y) <= anchorPx;
      if (d > releasePx && stay) this.cover.add('stay');
      if (d > releasePx && !stay) {
        this.hoverTouch = false;
        this.nearSince = -1;
        this.enteredAt = -1;
        this.cover.add(coiled ? 'release-coiled' : 'release');
      }
    }
  }
}

interface CFrame {
  t: number;
  x: number;
  y: number;
  d: number;
  ppm: number;
  finger: boolean;
  gp: GraspPhase;
  frozen?: boolean;
  /** 本帧之前的指针事件 / 台架重置 */
  ev?: 'press' | 'lift' | 'fingerDown' | 'resetEngine' | 'gone';
}

/**
 * 一段写死的逐帧输入：帧间隔带抖动与偶尔的卡顿（台架帧不均匀）。几何是示意的：臂是一条水平线 y = armY，
 * 指针离臂 = |指针 y − armY|（contactStep 只认这个距离与指针位置，不认几何）。
 */
function contactScript(): CFrame[] {
  const frames: CFrame[] = [];
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let t = 10;
  const seg = (
    dur: number,
    f: (u: number) => { x: number; y: number; armY: number; gp?: GraspPhase; ppm?: number; finger?: boolean; frozen?: boolean },
    ev?: CFrame['ev'],
  ): void => {
    let u = 0;
    let first = true;
    while (u < dur) {
      const k = f(u);
      frames.push({
        t,
        x: k.x,
        y: k.y,
        d: Math.abs(k.y - k.armY),
        ppm: k.ppm ?? 0.6,
        finger: k.finger ?? false,
        gp: k.gp ?? 'IDLE',
        frozen: k.frozen,
        ev: first ? ev : undefined,
      });
      first = false;
      const dt = rnd() < 0.04 ? 0.05 : (1 / 60) * (0.7 + 0.6 * rnd());
      t += dt;
      u += dt;
    }
  };
  const lerp = (a: number, b: number, u: number): number => a + (b - a) * Math.min(1, Math.max(0, u));
  // 鼠标、桌面画幅（0.6 px/mm：碰到 19.2 · 松开 40.8 · 锚 48 px · 限速 480 px/s）
  // ① 手不动、臂伸过来碰到（by arm）→ 手往外抽走（没在缠：一出 release 就松）
  seg(1.6, (u) => ({ x: 200, y: 100, armY: lerp(160, 95, (u - 0.5) / 0.6) }));
  seg(0.6, (u) => ({ x: 200, y: lerp(100, 200, u / 0.3), armY: 95 }));
  // ② 手伸过去碰臂（进圈时还在动：by hand）→ 抽走
  seg(1.5, (u) => ({ x: 260, y: lerp(200, 100, u / 0.83), armY: 95 }));
  seg(0.5, (u) => ({ x: 260, y: lerp(100, 220, u / 0.2), armY: 95 }));
  // ③ 飞快划过（2500 px/s，超过限速：进了圈也不算碰到）
  seg(0.5, (u) => ({ x: 260, y: lerp(220, -30, u / 0.1), armY: 95 }));
  // ④ 不快但待不够 dwell（400 px/s 穿过 38 px 宽的圈）
  seg(0.8, (u) => ({ x: 260, y: lerp(-30, 260, u / 0.725), armY: 95 }));
  // ⑤ 碰到 → 缠 → 握着；臂在晃（离脊线最远约 55 px > 松开），手在锚点附近晃：一直算碰着；
  //    之后手慢慢拖开（30 px/s）出了锚圈、离脊线又超过松开 → 松开；臂随后放开
  seg(1.2, (u) => ({ x: 300, y: lerp(260, 100, u / 0.5), armY: 95 }));
  seg(6, (u) => {
    const gp: GraspPhase = u < 1.5 ? 'WRAP' : 'HOLD_HUMAN';
    const drag = Math.max(0, u - 3) * 30;
    return {
      x: 300 + 15 * Math.sin(2 * Math.PI * 1.3 * u) + drag,
      y: 100 + 10 * Math.cos(2 * Math.PI * 1.1 * u),
      armY: 95 + 50 * Math.sin(2 * Math.PI * 0.7 * u),
      gp,
    };
  });
  seg(1, (u) => ({ x: 390, y: 100, armY: 160, gp: u < 0.5 ? 'RELEASE' : 'IDLE' }));
  // ⑥ 按住大触手（手指在臂里）→ 拖开 30 px（锚圈以内，臂已挪开）照样按着 → 再拖到 70 px 外 = 抽手 → 抬起
  seg(0.3, () => ({ x: 400, y: 160, armY: 160 }), 'press');
  seg(1.2, (u) => ({ x: lerp(400, 430, u / 0.4), y: 160, armY: lerp(160, 225, u / 0.2) }));
  seg(1, (u) => ({ x: lerp(430, 470, u / 0.4), y: 160, armY: 225 }));
  seg(0.3, () => ({ x: 470, y: 160, armY: 225 }), 'lift');
  // ⑦ 按住后在锚圈内松开（抬起时还按着）
  seg(0.4, () => ({ x: 480, y: 225, armY: 225 }), 'press');
  seg(0.3, () => ({ x: 480, y: 225, armY: 300 }), 'lift');
  // ⑧ 触屏手指，小画幅（0.3 px/mm：碰到圈钳到 20 px）：手指落下 → 臂伸过来碰到 → 拖开
  seg(1.2, (u) => ({ x: 500, y: 60, armY: lerp(95, 70, (u - 0.2) / 0.4), ppm: 0.3, finger: true }), 'fingerDown');
  seg(0.8, (u) => ({ x: 500, y: lerp(60, 160, u / 0.5), armY: 70, ppm: 0.3, finger: true }));
  // ⑨ 触屏手指，大画幅（2 px/mm：碰到圈钳到 44 px、松开 93.5 px）：80 px 还碰着、100 px 松开
  seg(1, (u) => ({ x: 520, y: lerp(160, 90, u / 0.4), armY: 70, ppm: 2, finger: true }));
  seg(0.8, (u) => ({ x: 520, y: lerp(90, 150, u / 0.3), armY: 70, ppm: 2, finger: true }));
  seg(0.8, (u) => ({ x: 520, y: lerp(150, 175, u / 0.3), armY: 70, ppm: 2, finger: true }));
  // ⑩ 鼠标，大画幅（1.2 px/mm：碰到圈钳到 28 px）+ 透视里每帧在变的 px/mm；中途相机动过（冻住）
  seg(1.5, (u) => ({
    x: 560,
    y: lerp(200, 80, u / 0.6),
    armY: 70,
    ppm: 1.2 + 0.1 * Math.sin(5 * u),
    frozen: u > 0.55 && u < 0.75,
  }));
  // ⑪ 碰着的时候重开一场（台架只清 held / touching / nearSince，enteredAt 留着）→ 手还在圈里，又碰到
  seg(0.8, () => ({ x: 560, y: 80, armY: 70, ppm: 1.2 }), 'resetEngine');
  // ⑫ 手离开（handGone：清 touching / nearSince / enteredAt）→ 手回来、不动，臂再伸过来
  seg(0.5, () => ({ x: 560, y: 80, armY: 70, ppm: 1.2 }), 'gone');
  seg(1.2, (u) => ({ x: 600, y: 300, armY: lerp(200, 290, (u - 0.4) / 0.5) }));
  return frames;
}

/** 跑一遍：搬之前（ref）与搬之后（track + contactStep）逐帧并排，返回两份快照与 ref 的分支覆盖 */
function runContactScript(frames: CFrame[]) {
  const ref = new RefContact();
  const track = pointerTrack();
  let c: ContactState = contactIdle();
  let last: { x: number; y: number } | null = null;
  const want: unknown[] = [];
  const got: unknown[] = [];
  for (const f of frames) {
    // 指针事件（帧前 3 ms）：挪了才有 pointermove
    if (f.ev === 'fingerDown') {
      ref.fingerDown(f.t - 0.003, f.x, f.y);
      trackMark(track, f.t - 0.003, f.x, f.y);
    }
    if (!last || last.x !== f.x || last.y !== f.y) {
      ref.move(f.t - 0.003, f.x, f.y);
      trackMove(track, f.t - 0.003, f.x, f.y);
    }
    last = { x: f.x, y: f.y };
    if (f.ev === 'press') {
      ref.armHeld = true;
      ref.pressAt = { x: f.x, y: f.y };
      c.held = true;
      c.pressAt = { x: f.x, y: f.y };
    } else if (f.ev === 'lift') {
      ref.armHeld = false;
      c.held = false;
    } else if (f.ev === 'resetEngine') {
      ref.armHeld = false;
      ref.hoverTouch = false;
      ref.nearSince = -1;
      c.held = false;
      c.touching = false;
      c.nearSince = -1;
    } else if (f.ev === 'gone') {
      ref.hoverTouch = false;
      ref.nearSince = -1;
      ref.enteredAt = -1;
      c.touching = false;
      c.nearSince = -1;
      c.enteredAt = -1;
    }
    ref.frame(f.t, f.x, f.y, f.d, f.ppm, f.finger, !!f.frozen, f.gp);
    trackTrim(track, f.t);
    if (!f.frozen) {
      c = contactStep(c, {
        now: f.t,
        x: f.x,
        y: f.y,
        d: f.d,
        pxPerMm: f.ppm,
        finger: f.finger,
        speed: trackSpeed(track, f.t, f.x, f.y),
        lastMoveAt: track.lastMoveAt,
        grasp: f.gp,
      }).next;
    }
    want.push({
      touching: ref.hoverTouch,
      by: ref.hoverBy,
      at: ref.hoverAt,
      nearSince: ref.nearSince,
      enteredAt: ref.enteredAt,
      held: ref.armHeld,
      pressAt: ref.pressAt,
      lastMoveAt: ref.lastMoveAt,
      trail: ref.trail.length,
    });
    got.push({ ...c, lastMoveAt: track.lastMoveAt, trail: track.trail.length });
  }
  return { want, got, cover: ref.cover };
}

describe('碰臂判定（contactStep：台架 syncHand ③ 搬到纯函数）', () => {
  it('写死的逐帧序列：与搬之前的台架那一段逐帧逐位相同（碰着 / 谁碰谁 / 锚点 / 进圈与待够时刻 / 按住 / 轨迹）', () => {
    const frames = contactScript();
    const { want, got, cover } = runContactScript(frames);
    // 序列真的走过了各条分支
    for (const k of ['touch-arm', 'touch-hand', 'swipe', 'stay', 'release', 'release-coiled', 'drag-off', 'clamp-finger', 'clamp-mouse', 'frozen']) {
      expect(cover.has(k), k).toBe(true);
    }
    expect(frames.length).toBeGreaterThan(1000);
    const bad = want.findIndex((w, i) => JSON.stringify(w) !== JSON.stringify(got[i]));
    if (bad >= 0) expect({ i: bad, t: frames[bad].t, got: got[bad] }).toEqual({ i: bad, t: frames[bad].t, got: want[bad] });
    expect(bad).toBe(-1);
  });

  it('牵引（opts.traction，台架现在不传）：缠 / 握着时慢慢牵着走锚点跟手、不松开；臂没跟上时锚点冻住，再拉出锚圈才松', () => {
    const ppm = 0.6;
    const th = contactThresholds(ppm, false);
    const slow = 40 * ppm; // 40 mm/s（≤ 60）
    const fast = 100 * ppm; // 100 mm/s（> 60）
    const touched: ContactState = { ...contactIdle(), touching: true, by: 'arm', at: { x: 100, y: 100 } };
    /** 指针沿 x 以 v px/s 走 sec 秒（臂离指针 d），返回最后的状态 */
    const drag = (c0: ContactState, traction: boolean, grasp: GraspPhase, v: number, d: number, sec: number, x0: number, t0: number) => {
      let c = c0;
      let x = x0;
      let t = t0;
      for (let i = 0; i < sec * 60; i++) {
        t += 1 / 60;
        x += v / 60;
        c = contactStep(c, { now: t, x, y: 100, d, pxPerMm: ppm, finger: false, speed: v, lastMoveAt: t, grasp }, { traction }).next;
      }
      return { c, x, t };
    };
    // 牵 5 s（120 px，远超锚圈 48 px）、臂跟得上（离脊线 10 px）：两种都还碰着；只有牵引让锚点跟着走
    const on = drag(touched, true, 'HOLD_HUMAN', slow, 10, 5, 100, 0);
    const off = drag(touched, false, 'HOLD_HUMAN', slow, 10, 5, 100, 0);
    expect(on.c.touching && off.c.touching).toBe(true);
    expect(on.c.at.x).toBeCloseTo(on.x, 9);
    expect(off.c.at).toEqual({ x: 100, y: 100 });
    // 臂一下没跟上（离脊线 60 px > 松开 40.8）、手停着：不牵引 = 锚点在 120 px 外 → 松开；牵引 = 手就在锚点上 → 照样碰着
    const lag = (c: ContactState, traction: boolean, x: number, t: number) =>
      contactStep(c, { now: t + 1 / 60, x, y: 100, d: 60, pxPerMm: ppm, finger: false, speed: 0, lastMoveAt: t, grasp: 'HOLD_HUMAN' }, { traction }).next;
    expect(lag(off.c, false, off.x, off.t).touching).toBe(false);
    const held = lag(on.c, true, on.x, on.t);
    expect(held.touching).toBe(true);
    // 臂还是没跟上、手接着慢慢走：锚点冻住，走出锚圈（48 px）那一刻松开
    let c = held;
    let x = on.x;
    let t = on.t + 1 / 60;
    let releasedAt = NaN;
    for (let i = 0; i < 4 * 60 && Number.isNaN(releasedAt); i++) {
      t += 1 / 60;
      x += slow / 60;
      c = contactStep(c, { now: t, x, y: 100, d: 60, pxPerMm: ppm, finger: false, speed: slow, lastMoveAt: t, grasp: 'HOLD_HUMAN' }, { traction: true }).next;
      expect(c.at.x).toBeCloseTo(on.x, 9);
      if (!c.touching) releasedAt = x - on.x;
    }
    expect(releasedAt).toBeGreaterThan(th.anchorPx);
    expect(releasedAt).toBeLessThan(th.anchorPx + slow / 60 + 1e-9);
    // 拉得快（100 mm/s > 60）：锚点不跟，臂一跟不上就松（与不牵引相同）
    const quick = drag(touched, true, 'HOLD_HUMAN', fast, 10, 2, 100, 0);
    expect(quick.c.at).toEqual({ x: 100, y: 100 });
    expect(lag(quick.c, true, quick.x, quick.t).touching).toBe(false);
    // 没在缠 / 握：牵引不起作用（锚点不动；离脊线一超过松开就松）
    const idle = drag(touched, true, 'IDLE', slow, 10, 2, 100, 0);
    expect(idle.c.at).toEqual({ x: 100, y: 100 });
    // 牵引关着的整段与不传 opts 逐位相同
    const plain = (() => {
      let cc = touched;
      let xx = 100;
      for (let i = 0; i < 120; i++) {
        xx += slow / 60;
        cc = contactStep(cc, { now: i / 60, x: xx, y: 100, d: 10 + i, pxPerMm: ppm, finger: false, speed: slow, lastMoveAt: 0, grasp: 'WRAP' }).next;
      }
      return cc;
    })();
    const offAll = (() => {
      let cc = touched;
      let xx = 100;
      for (let i = 0; i < 120; i++) {
        xx += slow / 60;
        cc = contactStep(cc, { now: i / 60, x: xx, y: 100, d: 10 + i, pxPerMm: ppm, finger: false, speed: slow, lastMoveAt: 0, grasp: 'WRAP' }, { traction: false }).next;
      }
      return cc;
    })();
    expect(offAll).toEqual(plain);
    expect(HAND_MM.tractionSpeed).toBe(60);
  });

  it('有效碰到半径：桌面默认画幅 = 32 mm；像素钳位（鼠标 8–28 px、手指 20–44 px）让小画幅 / 手指时变大、大画幅时变小', () => {
    expect(contactRadiusMm(0.6, false)).toBeCloseTo(32, 9);
    expect(contactRadiusMm(0.1, false)).toBeCloseTo(80, 9); // 3.2 px → 钳到 8 px
    expect(contactRadiusMm(2, false)).toBeCloseTo(14, 9); // 64 px → 钳到 28 px
    expect(contactRadiusMm(0.3, true)).toBeCloseTo(20 / 0.3, 9); // 手指 9.6 px → 钳到 20 px（≈ 67 mm，手机上那种）
    expect(contactRadiusMm(0.8, true)).toBeCloseTo(32, 9); // 25.6 px 在钳位以内
    expect(contactRadiusMm(2, true)).toBeCloseTo(22, 9); // 64 px → 钳到 44 px
    // 松开 / 锚圈跟着碰到圈一起钳（比例 68 / 80 : 32 不变）；限速不钳
    for (const [ppm, finger] of [
      [0.1, false],
      [0.6, false],
      [2, false],
      [0.3, true],
      [2, true],
    ] as const) {
      const th = contactThresholds(ppm, finger);
      expect(th.releasePx / th.touchPx).toBeCloseTo(68 / 32, 12);
      expect(th.anchorPx / th.touchPx).toBeCloseTo(80 / 32, 12);
      expect(th.maxSpeed).toBeCloseTo(800 * ppm, 9);
    }
    // 画面越大（px/mm 越大）有效半径不增
    let prev = Infinity;
    for (let ppm = 0.05; ppm < 3; ppm += 0.05) {
      const r = contactRadiusMm(ppm, false);
      expect(r).toBeLessThanOrEqual(prev + 1e-9);
      prev = r;
    }
    // 搬过去的手感常量一个数没改
    expect(HAND_UI.dwell).toBe(0.12);
    expect(HAND_UI.stillFor).toBe(0.2);
    expect([HAND_MM.touch, HAND_MM.release, HAND_MM.anchor, HAND_MM.maxSpeed]).toEqual([32, 68, 80, 800]);
  });
});
