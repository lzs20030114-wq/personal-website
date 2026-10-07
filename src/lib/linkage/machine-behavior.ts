import type { ActuatorTargets, FeelerDrive } from './behavior/engine';
import type { CellFrame } from './gl3d';
import {
  MACHINE_DIR,
  MACHINE_DRIVE,
  MACHINE_THETA0,
  type Machine,
  clampTheta,
  stepMachine,
} from './machine';
import { ARM_IDLE } from './machine-arm';
import { clampSwing, startleSwing } from './machine-smallarm';
import type { Vec3 } from './solver3d';

/**
 * 行为引擎 → Lab 1-5 整机台架的适配层（轮回机器_行为引擎spec.md §6，M2）。纯函数、零 DOM。
 *
 * 引擎给的是与机构无关的抽象指令（行程分数 / 臂的张力弯曲弯向 / 触须基角与反射 / 偏航），
 * 这里把它们换成现有驱动的量：曲柄角、三腱收缩率、舵机角、整机刚体旋转。
 * 标定全部取站上现成的件（MACHINE_DRIVE、ARM_IDLE、startleSwing），不另写一份。
 */

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const clamp01 = (x: number): number => clamp(x, 0, 1);

// ------------------------------------------------------------------ 呼吸 → 曲柄

/**
 * 换算呼吸用的参考环：S3（中间那环）。§6.2 实测（2026-10-07）：五环仿真出的拱顶与各自的
 * 理想曲柄滑块差 ≤0.4 mm，各环的实际行程分数与 S3 理想值差 ≤0.006——一环代表全机足够。
 */
export const BREATH_REF_RING = 2;
const REF = MACHINE_DRIVE[BREATH_REF_RING];
const CR = REF.crankR;
const A0 = REF.apex0;
/** 连杆长 = 图纸姿态的拱顶高 − 曲柄半径（轮心在环局部原点、销在 (0, R)） */
const ROD = A0 - CR;

/**
 * 行程分数 s（0 全开 / 1 折叠，引擎的呼吸输出）→ 曲柄角 θ。理想曲柄滑块反解：
 * 拱顶高 h = A0 − 2R·s；销离伸展位转过 α 时 h = R cos α + √(L² − R² sin² α)，
 * 解得 cos α = (h² + R² − L²) / (2hR)。走 MACHINE_DIR 那一侧（与往复驱动同一侧）。
 */
export function strokeToTheta(s: number): number {
  // 两端直接给死点：acos 在 ±1 附近把浮点误差放大成 ~1e-8 rad，端点要精确
  if (s <= 0) return MACHINE_THETA0;
  if (s >= 1) return clampTheta(MACHINE_THETA0 + MACHINE_DIR * Math.PI);
  const h = A0 - 2 * CR * s;
  const c = clamp((h * h + CR * CR - ROD * ROD) / (2 * h * CR), -1, 1);
  return clampTheta(MACHINE_THETA0 + MACHINE_DIR * Math.acos(c));
}

/** 曲柄角 → 行程分数（上式的正算；HUD 与测试用） */
export function thetaToStroke(theta: number): number {
  const a = Math.abs(clampTheta(theta) - MACHINE_THETA0);
  const sx = CR * Math.sin(a);
  const h = CR * Math.cos(a) + Math.sqrt(ROD * ROD - sx * sx);
  return clamp01((A0 - h) / (2 * CR));
}

/**
 * 曲柄追随的限速（§6.2 速度探针，2026-10-07 实测五环整机）：
 * 每个求解子步转 ≤1° 时峰值残差 1.07 mm、折叠位形与慢扫参考差 0.25 mm（与默认 0.38°/步同一水平）；
 * 1.5° 起残差超过槽端标定的健康线 1.2 mm，2° 起折叠位形开始漂，4° 跳进别的解支。
 * 一个子步约 2 ms（五环、各 96 遍投影），所以每帧子步数也要封顶：慢设备上宁可跟慢一点，
 * 也不让一帧的解算拖垮下一帧。
 *
 * 表里的呼吸要多快（同日测，引擎轨迹 → 理想反解）：活力型成长段平均 2.85 rad/s、峰值约 5；
 * 沉静 / 好奇 / 不稳定平时都在 2.4 以下。上限取 4°/帧（60 帧 = 4.19 rad/s）：活力型兴奋时
 * 最快的几口气会被限速拖慢一点，其余全部跟得上。实物（齿条）是另一回事，见 spec §6.2。
 */
export const CRANK = {
  maxSubstep: Math.PI / 180,
  maxSpeed: ((4 * Math.PI) / 180) * 60,
  maxSubsteps: 6,
} as const;

export interface CrankPlan {
  /** 本帧走几个子步（0 = 已在目标上） */
  n: number;
  /** 每个子步的 dθ（|step| ≤ maxSubstep） */
  step: number;
}

/** 本帧曲柄怎么追目标：限速、限每帧子步数、每个子步 ≤1° */
export function crankPlan(theta: number, target: number, dt: number): CrankPlan {
  const lim = Math.min(CRANK.maxSpeed * Math.max(0, dt), CRANK.maxSubstep * CRANK.maxSubsteps);
  const total = clamp(clampTheta(target) - theta, -lim, lim);
  if (Math.abs(total) < 1e-9) return { n: 0, step: 0 };
  const n = Math.ceil(Math.abs(total) / CRANK.maxSubstep - 1e-9);
  return { n, step: total / n };
}

/** 一帧：曲柄朝呼吸目标追（用整机解算走子步）。返回走了几个子步 */
export function followBreath(m: Machine, s: number, dt: number): number {
  const plan = crankPlan(m.theta, strokeToTheta(s), dt);
  for (let i = 0; i < plan.n; i++) stepMachine(m, plan.step);
  return plan.n;
}

// ------------------------------------------------------------------ 臂与触须

/**
 * 臂的抽象指令 → 三腱收缩率。与待机波形同一式（machine-arm.ts 的 ARM_IDLE）：
 * 预张力 tone 吃掉肌腱的松弛量（实测 0.28 以下全是空行程），弯曲 bend 是叠在上面的差动，
 * 按 120° 相位分到三根腱上、负值截零（肌腱只能拉不能推）。dir = 0 是腱 0（臂梢朝上）。
 */
export function tendonContractions(arm: ActuatorTargets['arm']): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const share = Math.max(0, Math.cos(arm.dir - (2 * Math.PI * k) / 3));
    out[k] = clamp01(ARM_IDLE.base * arm.tone + ARM_IDLE.span * arm.bend * share);
  }
  return out;
}

/** 触须指令 → 小触手舵机角：基角 + 反射波形（波形仍是台架原有的 startleSwing），整体钳在 ±75° */
export function feelerAngle(f: FeelerDrive): number {
  const st = f.startle;
  return clampSwing(f.base + (st.gain === 0 ? 0 : st.gain * startleSwing(st.t, st.dir)));
}

/**
 * 触须被碰的一侧（引擎的 L / R）。约定：引擎「反射方向 +1 = 甩向 L 侧」对应小触手 +θ（甩向
 * 其摆平面的 +h），于是**碰在 +h 一侧 = L**——反射甩向 −h，正好是离开手的方向，
 * 与台架编排档原有的「甩开我」同向。alongH = 点击相对轴心在 +h 方向上的分量。
 */
export function feelerSide(alongH: number): 'L' | 'R' {
  return alongH > 0 ? 'L' : 'R';
}

// ------------------------------------------------------------------ 偏航（占位）

/**
 * 偏航占位（用户 2026-10-06：朝向由底部新加的旋转电机承担，模型稍后更新）：
 * 整机绕竖轴（世界 z）刚体旋转。轴心取环身中轴 (0, 0)——底盘落地框中心离它不到 6 mm。
 * 电机实际落位到了以后只换这里，引擎输出不动。
 */
export const YAW_AXIS = { x: 0, y: 0 } as const;

/**
 * 机身「正前方」= 世界 −X（大触手伸出的那一端）。不是随手定的：引擎里「触须 0 在左」
 * （它的方位按机身朝向 + 90° 算），而触须 0 装在 y < 0 一侧——面朝 −X 时左手边正是 −Y，
 * 两边自洽；面朝 +X 就左右颠倒了。新模型若改了朝向，这一条与触须编号要一起核。
 */
export const FACING = Math.PI;

/** 点：绕电机轴转 yaw（俯视逆时针为正，与引擎方位同号）。yaw = 0 原样返回同一个对象 */
export function yawPoint(p: Vec3, yaw: number): Vec3 {
  if (yaw === 0) return p;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const dx = p.x - YAW_AXIS.x;
  const dy = p.y - YAW_AXIS.y;
  return { x: YAW_AXIS.x + c * dx - s * dy, y: YAW_AXIS.y + s * dx + c * dy, z: p.z };
}

/** 刚架：原点绕电机轴转、三列方向向量只转不平移。yaw = 0 原样返回 */
export function yawFrame(f: CellFrame, yaw: number): CellFrame {
  if (yaw === 0) return f;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    o: yawPoint(f.o, yaw),
    ux: c * f.ux - s * f.uy, uy: s * f.ux + c * f.uy, uz: f.uz,
    ex: c * f.ex - s * f.ey, ey: s * f.ex + c * f.ey, ez: f.ez,
    fx: c * f.fx - s * f.fy, fy: s * f.fx + c * f.fy, fz: f.fz,
  };
}

/** 机身局部（未转）的一点落在壳体哪一半：机身左手边 = 朝向 + 90° */
export function shellHalf(p: { x: number; y: number }): 'L' | 'R' {
  const lx = -Math.sin(FACING);
  const ly = Math.cos(FACING);
  return (p.x - YAW_AXIS.x) * lx + (p.y - YAW_AXIS.y) * ly >= 0 ? 'L' : 'R';
}

/** 人在哪一侧（面板上的「拍 / 摸 / 戳」按钮碰离人近的那一半）；不知道人在哪 = 右半 */
export function halfTowardPerson(bearing: number | null, yaw: number): 'L' | 'R' {
  if (bearing === null) return 'R';
  const rel = Math.atan2(Math.sin(bearing - yaw), Math.cos(bearing - yaw));
  return rel > 0 ? 'L' : 'R';
}

// ------------------------------------------------------------------ 取景

/**
 * 行为档的取景：机身会绕竖轴转一整圈（偏航 ±π），大触手扫过半径约 600 mm 的圆
 * （基座离轴 236 mm + 臂长 358 mm + 梢端 6 mm），机架角点 281 mm。按「绕电机轴的圆柱」
 * 取景，任何朝向都在画内；高度范围含大触手上下弯的余量。
 */
export const SWEEP = { r: 615, z0: -210, z1: 230 } as const;

/** 逻辑视口半宽 / 半高（gl3d 的 700×520） */
const HALF_W = 350;
const HALF_H = 260;

/**
 * 给定视图矩阵（行主序，view = M·(p − pivot)），把扫掠圆柱整个装进视口的枢轴与缩放。
 * 圆柱在屏幕 x 上的半宽 = r·√(M00² + M01²) + |M02|·半高差（y 同理），枢轴取圆柱中心。
 */
export function sweepFraming(m: readonly number[], margin = 0.92): { pivot: Vec3; scale: number } {
  const dz = (SWEEP.z1 - SWEEP.z0) / 2;
  const ex = SWEEP.r * Math.hypot(m[0], m[1]) + Math.abs(m[2]) * dz;
  const ey = SWEEP.r * Math.hypot(m[3], m[4]) + Math.abs(m[5]) * dz;
  return {
    pivot: { x: YAW_AXIS.x, y: YAW_AXIS.y, z: (SWEEP.z0 + SWEEP.z1) / 2 },
    scale: margin * Math.min(HALF_W / ex, HALF_H / ey),
  };
}

// ------------------------------------------------------------------ 屏幕命中（CSS px 域）

export interface P2 {
  x: number;
  y: number;
}

/** 点到线段距离 */
export function segDist(p: P2, a: P2, b: P2): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const L2 = vx * vx + vy * vy || 1;
  const u = clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / L2, 0, 1);
  return Math.hypot(p.x - (a.x + u * vx), p.y - (a.y + u * vy));
}

/** 点到折线距离（空折线 = ∞） */
export function polylineDist(p: P2, pts: readonly P2[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(p, pts[i - 1], pts[i]));
  return best;
}

/** 点在三角形内（含边；朝向不限） */
export function inTri(p: P2, a: P2, b: P2, c: P2): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * 直纹带命中：A、B 是相邻两环外侧轮廓的同数重采样（已投到屏幕），带面 = 逐格四边形。
 * 命中返回格号（0…n−2），没中返回 −1。蒙皮透明度多少都算——摸到的是壳，不是那层颜色。
 */
export function hitBand(p: P2, A: readonly P2[], B: readonly P2[]): number {
  const n = Math.min(A.length, B.length);
  for (let i = 0; i + 1 < n; i++) {
    if (inTri(p, A[i], A[i + 1], B[i + 1]) || inTri(p, A[i], B[i + 1], B[i])) return i;
  }
  return -1;
}
