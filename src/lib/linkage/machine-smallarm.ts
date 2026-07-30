import type { CellFrame } from './gl3d';
import { SMALLARM_PLACEMENTS, SMALLARM_SHAPE, type SmallArmPlacement } from './machine-shape';
import { LinkageSolver } from './solver';
import type { Vec3 } from './solver3d';

/**
 * 小触手（Lab.05 §3.5，用户 2026-07-30 给出机构说明后由静件转正）。
 *
 * 机构：底座固定在机架上；**大的一节由 SG90 舵机驱动，绕后端圆形轴心甩动**；
 * 一根细软杆（软性结构）连到下面的小块；小块**没有任何驱动**，靠软杆传力 +
 * 重力 + 惯性跟着甩——受迫大摆 + 柔性连接的被动小摆。
 *
 * 建模（内核零改，2D 实例）：摆轴水平且两实例块 ẑ 均指向世界竖直（生成期闸门），
 * 故整条链的运动躺在一个竖直平面里——**用 2D 内核在 (h, z) 平面解**，
 * h = 摆平面内的水平方向（SMALLARM_PLACEMENTS.h）、z = 世界竖直。
 *
 * 链（单位 mm，原点 = 轴心）：
 *   A2、A     大节上的两个驱动点（fixed，逐帧按 θ 摆位——大节完全是运动学件，
 *             它的「甩」是舵机给的输入，不是解出来的）
 *   c1、c2    软杆内部节点（软杆分 3 段）
 *   B         下关节块中心（小块顶端）
 *   T         小块梢端
 * 杆：链向 A–c1–c2–B（长度约束）+ B–T（小块刚体）+ 低刚度**直化杆**——
 * 软杆两端是**插进关节块夹紧的**（不是铰接），弯矩传得过去；PBD 里夹紧 =
 * 跨节点的次邻杆：A2–c1 把大节的朝向传进软杆，c2–T 把软杆末端朝向传给小块，
 * c1–B / A–c2 给杆身弯曲刚度。刚度低于 1 = 软；甩起来小块滞后、回弹，
 * 就是用户要的「按照真实的物理规律一起甩动」。
 *
 * 重力真单位（9810 mm/s²）：链长 ~110mm 的摆自然频率 ≈1.5Hz，驱动默认 0.5Hz
 * 在其下，甩尾读得出来。所有手感常量集中在 SMALLARM_IDLE，待用户真机拍板。
 */

export const SMALLARM = {
  /** 轴心 → 上关节块（大节有效摆长） */
  L1: SMALLARM_SHAPE.L1,
  /** 软杆（上关节 → 下关节） */
  LS: SMALLARM_SHAPE.LS,
  /** 下关节 → 小块梢端 */
  L2: SMALLARM_SHAPE.L2,
  /** 软杆分段数 */
  segs: 3,
  /** 第二驱动点 A2 距 A 的沿臂距离（夹紧方向的力臂） */
  clamp: 8,
  /** 直化杆刚度（软杆的弯曲刚度，1 = 刚性直杆） */
  kBend: 0.12,
  dynamics: { gravity: { x: 0, y: -9810 }, damping: 0.996 },
  sweeps: 14,
} as const;

/** 待机甩动波形（手感常量，待拍板）。幅度/频率可被台架滑块覆盖。 */
export const SMALLARM_IDLE = {
  /** 摆幅 rad（±18°；首版 0.6≈34° 用户 2026-07-30「甩小一点」调至此） */
  amp: 0.32,
  /** 频率 Hz（链的自然频率 ≈1.5Hz，取其下——要看到甩尾滞后不是共振） */
  freq: 0.5,
  /** 起步缓入（秒）：避免 t=0 从垂位直接进入满幅正弦的「一下子」 */
  easeIn: 2,
  /**
   * 两实例的相位差（rad）。0 = 同 θ——两条镜像安装，同 θ 在世界系里正好
   * **反相**（一前一后），读作游动步态；要同向就把第二个改成 π。
   */
  phase: [0, 0],
} as const;

/**
 * 受惊反应（用户 2026-07-30：「鼠标点击它，它会给一个比较大的反应，比如甩开我」）。
 * 点击命中后叠加在待机波形上的一段**衰减震荡**：dir·amp·e^(−t/decay)·sin(2πf·t)——
 * t=0 时值为零、斜率朝 dir（甩开方向），即第一下就是猛地甩离点击那一侧；
 * 频率取在链自然频率（≈1.5Hz）附近，被动小块会被甩出明显的鞭梢；
 * 随后指数衰减、自然回到待机的小幅摆。全是手感常量，待真机拍板。
 */
export const SMALLARM_STARTLE = {
  /** 峰值幅度 rad（首峰 ≈ amp·e^(−1/(4f·decay)) ≈ 0.94 rad ≈ 54°，远大于待机 18°） */
  amp: 1.15,
  /** 震荡频率 Hz */
  freq: 1.4,
  /** 衰减时间常数（秒） */
  decay: 0.9,
  /** 波形寿命（秒）：此后贡献 <4% 峰值，掐掉（也让暂停态的驱动覆盖能结束） */
  duration: 3.5,
  /** 合成驱动角上限 rad（≈75°——SG90 行程内，也别把臂甩进底盘） */
  max: (75 * Math.PI) / 180,
} as const;

/** 受惊贡献：t = 距点击的秒数，dir = 甩开方向（±1）。界外恒 0。 */
export function startleSwing(t: number, dir: 1 | -1): number {
  if (!(t >= 0) || t >= SMALLARM_STARTLE.duration) return 0;
  const { amp, freq, decay } = SMALLARM_STARTLE;
  return dir * amp * Math.exp(-t / decay) * Math.sin(2 * Math.PI * freq * t);
}

/** 合成驱动角钳制（待机 + 受惊 可能短暂越界） */
export function clampSwing(theta: number): number {
  return Math.max(-SMALLARM_STARTLE.max, Math.min(SMALLARM_STARTLE.max, theta));
}

export interface SmallArm {
  solver: LinkageSolver;
  /** 当前驱动角（驱动是运动学量，解算器里没有它，得自己记） */
  theta: number;
}

/** 节点序：A2, A, c1, c2, B, T */
export const SA_A2 = 0;
export const SA_A = 1;
export const SA_B = 2 + SMALLARM.segs - 1;
export const SA_T = SA_B + 1;

const restY = (): number[] => {
  const { L1, LS, L2, segs, clamp } = SMALLARM;
  const ys = [-(L1 - clamp), -L1];
  for (let k = 1; k < segs; k++) ys.push(-L1 - (LS * k) / segs);
  ys.push(-L1 - LS, -L1 - LS - L2);
  return ys;
};

export function createSmallArm(): SmallArm {
  const { segs, kBend, clamp, LS, L2 } = SMALLARM;
  const ys = restY();
  const seg = LS / segs;
  const nodes = ys.map((y, i) => ({ x: 0, y, fixed: i <= SA_A }));
  const bars: { a: number; b: number; rest?: number; stiffness?: number }[] = [];
  // 链向长度约束（刚性——软的是弯曲，不是长度）
  for (let i = SA_A; i < SA_T; i++) bars.push({ a: i, b: i + 1 });
  // 直化杆 = 弯曲刚度（两端夹紧 + 杆身），rest 取直位距离
  bars.push({ a: SA_A2, b: SA_A + 1, rest: clamp + seg, stiffness: kBend });
  bars.push({ a: SA_A, b: SA_A + 2, rest: 2 * seg, stiffness: kBend });
  bars.push({ a: SA_A + 1, b: SA_B, rest: 2 * seg, stiffness: kBend });
  bars.push({ a: SA_B - 1, b: SA_T, rest: seg + L2, stiffness: kBend });
  return {
    solver: new LinkageSolver({ nodes, bars }, { dynamics: SMALLARM.dynamics }),
    theta: 0,
  };
}

/** 舵机驱动：把大节摆到角 θ（0 = 垂直悬垂，+θ 摆向 +h）。 */
export function driveSmallArm(sa: SmallArm, theta: number): void {
  sa.theta = theta;
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const { L1, clamp } = SMALLARM;
  sa.solver.setNode(SA_A2, (L1 - clamp) * s, -(L1 - clamp) * c);
  sa.solver.setNode(SA_A, L1 * s, -L1 * c);
}

export function stepSmallArm(sa: SmallArm, dt: number): void {
  sa.solver.step(dt, SMALLARM.sweeps);
}

const smoothstep = (x: number): number => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};

/** 待机波形：第 k 条在时刻 t 的驱动角。amp/freq 可被滑块覆盖。 */
export function idleSwing(
  t: number,
  k: number,
  amp: number = SMALLARM_IDLE.amp,
  freq: number = SMALLARM_IDLE.freq,
): number {
  const ease = smoothstep(t / SMALLARM_IDLE.easeIn);
  return amp * ease * Math.sin(2 * Math.PI * freq * t + SMALLARM_IDLE.phase[k % 2]);
}

// ------------------------------------------------------------------ 世界系标架

const crossV = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** 2D 平面点 → 世界（h 分量沿 placement.h，y 分量沿世界竖直） */
export function saPoint(p: SmallArmPlacement, h: number, y: number): Vec3 {
  return {
    x: p.o[0] + p.h[0] * h,
    y: p.o[1] + p.h[1] * h,
    z: p.o[2] + p.h[2] * h + y,
  };
}

/**
 * 组标架：原点 o2d（2D 平面坐标）、局部 x̂ = 链向 d2d（2D 单位向量，悬垂位 = (0,−1)）。
 * 与烘焙约定（gen_machine.py smallarm_articulate）配对：ŷ_l = 摆轴 × x̂_l、
 * ẑ_l = x̂_l × ŷ_l——生成期零位复原闸门核过，这里照抄公式即可。
 */
export function saFrame(
  p: SmallArmPlacement,
  o2d: readonly [number, number],
  d2d: readonly [number, number],
): CellFrame {
  const u: Vec3 = {
    x: p.h[0] * d2d[0],
    y: p.h[1] * d2d[0],
    z: p.h[2] * d2d[0] + d2d[1],
  };
  const axis: Vec3 = { x: p.axis[0], y: p.axis[1], z: p.axis[2] };
  const e = crossV(axis, u);
  const f = crossV(u, e);
  return {
    o: saPoint(p, o2d[0], o2d[1]),
    ux: u.x, uy: u.y, uz: u.z,
    ex: e.x, ey: e.y, ez: e.z,
    fx: f.x, fy: f.y, fz: f.z,
  };
}

/**
 * 链的世界折线（台架点击命中检测用）：轴心 → A → 软杆内点 → B → 梢端。
 * 只有骨架线，命中半径由调用方给（屏幕像素域）。
 */
export function saChainWorld(sa: SmallArm, pi: number): Vec3[] {
  const p = SMALLARM_PLACEMENTS[pi];
  const pts: Vec3[] = [saPoint(p, 0, 0)];
  for (let i = SA_A; i <= SA_T; i++) {
    const n = sa.solver.nodes[i];
    pts.push(saPoint(p, n.x, n.y));
  }
  return pts;
}

export interface SmallArmPose {
  mount: CellFrame;
  seg1: CellFrame;
  /** [frA, frB, dy]——sa_soft 的双骨蒙皮参数 */
  soft: [CellFrame, CellFrame, number];
  seg2: CellFrame;
}

/** 由解算器当前位形算四组标架（pi = 实例序号）。 */
export function smallArmPose(sa: SmallArm, pi: number): SmallArmPose {
  const p = SMALLARM_PLACEMENTS[pi];
  const n = sa.solver.nodes;
  const A = n[SA_A];
  const B = n[SA_B];
  const T = n[SA_T];
  const d1: [number, number] = [Math.sin(sa.theta), -Math.cos(sa.theta)];
  const lBT = Math.hypot(T.x - B.x, T.y - B.y) || 1;
  const d2: [number, number] = [(T.x - B.x) / lBT, (T.y - B.y) / lBT];
  const frA = saFrame(p, [A.x, A.y], d1); // 软杆上端夹在大节里：朝向跟大节
  const frB = saFrame(p, [B.x, B.y], d2);
  return {
    mount: saFrame(p, [0, 0], [0, -1]),
    seg1: saFrame(p, [0, 0], d1),
    soft: [frA, frB, SMALLARM.LS],
    seg2: frB,
  };
}
