import type { ActuatorTargets, FeelerDrive } from './behavior/engine';
import type { GraspPhase } from './behavior/grasp';
import type { CellFrame } from './gl3d';
import { MACHINE_BASE_AXIS as YAW_AXIS, MACHINE_PLINTH } from './machine-base';
import {
  MACHINE_DIR,
  MACHINE_DRIVE,
  MACHINE_THETA0,
  type Machine,
  clampTheta,
  stepMachine,
} from './machine';
import { ARM_IDLE, armPoint } from './machine-arm';
import { clampSwing, startleSwing } from './machine-smallarm';
import type { Vec3 } from './solver3d';
import { TENTACLE3D } from './tentacle3d-data';
import { STATIONS } from './tentacle3d-shape';

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
 * 三腱换算的标定（2026-10-07，Lab 1-6 手交互；数字出自 `scripts/behavior/arm-drive-calib.mjs`，
 * Lab 1-3 同一个求解器、稳态）。
 *
 * - span：标准满差动（引擎 bend = 1），与待机波形同值。
 * - wrapSpan：抓握深缠 / 近处够手时叠在 span 之上的额外差动（引擎 arm.wrap = 1）。
 * - dMax = span + wrapSpan：差动封顶。0.55 起两腱之间（60°）开始失稳（两根同时拉到 0.9 以上，
 *   臂沿轴被压、弯向乱跳），0.5 时各方向仍稳。
 * - floor：拮抗腱最多回松到缆刚绷直那一点再紧 0.01（再松就是空行程，弯向会抖）。
 */
/** 臂指令（引擎 ActuatorTargets.arm；wrap 可省 = 0） */
export type ArmCmd = Omit<ActuatorTargets['arm'], 'wrap'> & { wrap?: number };

export const ARM_DRIVE = {
  span: ARM_IDLE.span,
  wrapSpan: 0.16,
  dMax: ARM_IDLE.span + 0.16,
  floor: TENTACLE3D.slack / (TENTACLE3D.slack + TENTACLE3D.pullMax) + 0.01,
  /**
   * 肌腱轴深卷（动作词汇 v2，2026-10-08 研究原型；轮回机器_触手与转向研究.md §8）：弯向落在某根腱的轴上
   * 时，差动可以超过 dMax，一直到 dDeep——主腱拉满 1.0、两根拮抗腱停在 floor（2026-10-08 设计探针：轴上
   * 主腱 1.0、拮抗 0.283 稳定，梢端离静息约 365 mm）。±axisIn 以内全开，axisIn → axisTol 平滑退回 dMax，
   * 窗外与两腱之间永远 ≤ dMax（那里 0.55 起失稳）；整个过渡都在验过的 ±12° 以内（原型里 12°–20° 的过渡
   * 从没扫过，已删）。弯向同样平滑地从「补偿后的方向」过渡到「正对腱轴」，深卷越小越靠补偿方向——
   * 审查抓到：硬切时深卷从 0.0002 收到 0 的那一帧三腱跳 0.08。动作程序带深卷时弯向一律正对腱轴，离开前
   * 先在轴上把深卷收回（vocab2.ts 的 unhook）。
   *
   * 默认关（tendonContractions 的 opts.deep）：真机的缆与绞盘没验过主腱拉满，关着时 deep 只当普通差动、
   * 封顶 dMax。台架 Lab 1-6 开着。引擎不给 deep（v1）时两种都与原式逐位相同。
   */
  dDeep: 1 - (TENTACLE3D.slack / (TENTACLE3D.slack + TENTACLE3D.pullMax) + 0.01),
  // deep 从「只用弯曲的满幅」（span）一直加到 dDeep：deep = 1、bend = 1 时差动正好 = dDeep（主腱 1.0、拮抗 floor）。
  // 动作程序按「D = span·bend + deepSpan·deep」换算（vocab2.ts 的 poseOfD），两边同一个数
  deepSpan: 1 - (TENTACLE3D.slack / (TENTACLE3D.slack + TENTACLE3D.pullMax) + 0.01) - ARM_IDLE.span,
  axisTol: (12 * Math.PI) / 180,
  axisIn: (8 * Math.PI) / 180,
  /** 深卷到这么多（0–1）弯向才完全正对腱轴；更小时按比例靠向补偿后的方向 */
  deepSnap: 0.05,
} as const;

/** 弯向离最近一根腱轴（0 / ±120°）的角距（rad）与那根轴的方向 */
export function nearestAxis(dir: number): { axis: number; off: number } {
  const step = (2 * Math.PI) / 3;
  const k = Math.round(dir / step);
  const axis = k * step;
  return { axis: wrapPiLocal(axis), off: Math.abs(dir - axis) };
}

/**
 * 差动 D → 梢端弦角（基座 → 梢端连线偏离笔直臂轴的角，度）。标定各方向平均（新分解下
 * 各方向相差 ≤ 3°）；总卷曲约为弦角的 2 倍。分段线性。
 */
export const ARM_CHORD: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.1, 9],
  [0.2, 17],
  [0.34, 27.5],
  [0.45, 34.5],
  [0.5, 37.5],
];

/** 差动 → 弦角（度） */
export function chordOfDrive(d: number): number {
  const t = ARM_CHORD;
  if (d <= 0) return 0;
  for (let i = 1; i < t.length; i++) {
    if (d <= t[i][0]) return t[i - 1][1] + ((d - t[i - 1][0]) / (t[i][0] - t[i - 1][0])) * (t[i][1] - t[i - 1][1]);
  }
  return t[t.length - 1][1];
}

/** 弦角（度）→ 差动（上式的逆，超出表尾封顶在 dMax） */
export function driveOfChord(deg: number): number {
  const t = ARM_CHORD;
  if (deg <= 0) return 0;
  for (let i = 1; i < t.length; i++) {
    if (deg <= t[i][1]) return t[i - 1][0] + ((deg - t[i - 1][1]) / (t[i][1] - t[i - 1][1])) * (t[i][0] - t[i - 1][0]);
  }
  return t[t.length - 1][0];
}

/**
 * 弯向的系统偏差（度，实际 − 指令）：朝下半圈（±150°、180°）臂会往顺时针偏，差动越大偏得越多
 * （D 0.45 时 −16 ~ −25°）。12 个方向 × 3 档差动最小二乘拟合，残差 rms 1.7°。
 */
export function bendDirError(dir: number, d: number): number {
  return (
    d *
    (-16.9 + 17.9 * Math.cos(dir) - 0.4 * Math.sin(dir) - 11.5 * Math.cos(2 * dir) - 8.3 * Math.sin(2 * dir)) *
    (Math.PI / 180)
  );
}

/** 要弯向 dir 时该下的指令方向：三次不动点迭代抵掉上面的偏差（实测补偿后各方向误差 ≤ 7°，D ≤ 0.34 时 ≤ 2°） */
export function bendCommandDir(dir: number, d: number): number {
  let c = dir;
  for (let i = 0; i < 3; i++) c = dir - bendDirError(c, d);
  return c;
}

/**
 * 臂的抽象指令 → 三腱收缩率（2026-10-07 换分解，原式见 tendonContractionsClip）。
 *
 * 差动 D = span·bend + wrapSpan·wrap（封顶 dMax），按 (2/3)·cos(dir − 2πk/3) 分到三根腱上：
 * 弯向正对某根腱时主腱多拉 2D/3、两根拮抗腱各回松 D/3（「最紧 − 最松」= D）；夹在两腱之间时
 * 这个差在 D 与 2D/√3 之间——标定量的就是这个式子，弦角对 D 各方向一致（见 ARM_CHORD）。拮抗腱回松到
 * 低于 min(预张力, floor) 时三根一起往上抬（不让它掉进空行程）；tone = 0 时下限也是 0，死了照样松垮。
 * 指令方向先过 bendCommandDir 抵掉系统偏差。dir = 0 是腱 0（臂梢朝上），左为正。
 *
 * 为什么换：原式负份额截零，在两根腱之间（60°）只出一半弯曲——D 0.34 时腱向弦角 28°、
 * 两腱之间 15°；新式各方向 26–29°。要「伸向手」就得各方向一样准。
 */
export function tendonContractions(arm: ArmCmd, opts: { deep?: boolean } = {}): [number, number, number] {
  let d = Math.min(ARM_DRIVE.dMax, ARM_DRIVE.span * arm.bend + ARM_DRIVE.wrapSpan * (arm.wrap ?? 0));
  let axisDir: number | null = null;
  // 肌腱轴深卷（v2）：给了 deep 时先当普通差动（封顶 dMax）；开着深卷、且弯向在某根腱轴的窗里，才放开到 dDeep
  let snap = 0;
  if (arm.deep !== undefined && arm.deep > 0) {
    const raw = ARM_DRIVE.span * arm.bend + ARM_DRIVE.wrapSpan * (arm.wrap ?? 0) + ARM_DRIVE.deepSpan * arm.deep;
    d = Math.min(ARM_DRIVE.dMax, raw);
    const { axis, off } = nearestAxis(wrapPiLocal(arm.dir));
    if (opts.deep && off < ARM_DRIVE.axisTol) {
      const u = off <= ARM_DRIVE.axisIn ? 1 : (ARM_DRIVE.axisTol - off) / (ARM_DRIVE.axisTol - ARM_DRIVE.axisIn);
      const w = u * u * (3 - 2 * u);
      d = Math.min(ARM_DRIVE.dMax + (ARM_DRIVE.dDeep - ARM_DRIVE.dMax) * w, raw);
      // 贴轴时对准那根腱：弯向补偿的拟合只在 D ≤ 0.45 内成立
      axisDir = axis;
      snap = w * Math.min(1, arm.deep / ARM_DRIVE.deepSnap);
    }
  }
  const base = ARM_IDLE.base * arm.tone;
  const out: [number, number, number] = [base, base, base];
  if (d <= 0) return out;
  let dir = bendCommandDir(arm.dir, d);
  if (axisDir !== null && snap > 0) dir += snap * wrapPiLocal(axisDir - dir);
  for (let k = 0; k < 3; k++) out[k] = base + d * (2 / 3) * Math.cos(dir - (2 * Math.PI * k) / 3);
  const lo = Math.min(out[0], out[1], out[2]);
  const floor = Math.min(base, ARM_DRIVE.floor);
  if (lo < floor) for (let k = 0; k < 3; k++) out[k] += floor - lo;
  for (let k = 0; k < 3; k++) out[k] = clamp01(out[k]);
  return out;
}

/**
 * 原分解（M2–2026-10-06）：与待机波形同一式（machine-arm.ts 的 ARM_IDLE）——预张力 tone 吃掉肌腱的
 * 松弛量，弯曲 bend 是叠在上面的差动，按 120° 相位分到三根腱上、负值截零。留着作对照（探针与守门）。
 */
export function tendonContractionsClip(arm: ArmCmd): [number, number, number] {
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

// ------------------------------------------------------------------ 偏航

/**
 * 偏航占位（用户 2026-10-06：朝向由底部新加的旋转电机承担，模型稍后更新）：
 * 上部绕底座圆柱的竖轴（世界 z）旋转，落地底座固定。轴心取 815 原模型圆柱中心。
 * 新电机实际行程仍待更新，引擎输出不动。
 */
export { MACHINE_BASE_AXIS as YAW_AXIS } from './machine-base';

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
  const floorDz = (SWEEP.z0 + SWEEP.z1) / 2 - (MACHINE_PLINTH.top - MACHINE_PLINTH.depth);
  const ex = Math.max(
    SWEEP.r * Math.hypot(m[0], m[1]) + Math.abs(m[2]) * dz,
    MACHINE_PLINTH.half * (Math.abs(m[0]) + Math.abs(m[1])) + Math.abs(m[2]) * floorDz,
  );
  const ey = Math.max(
    SWEEP.r * Math.hypot(m[3], m[4]) + Math.abs(m[5]) * dz,
    MACHINE_PLINTH.half * (Math.abs(m[3]) + Math.abs(m[4])) + Math.abs(m[5]) * floorDz,
  );
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

// ------------------------------------------------------------------ 手（指针）→ 传感（Lab 1-6）

/**
 * 台架的视图参数（与 gl3d 顶点着色器同一投影）：view = M·(p − pivot)；q.z > 0 朝相机；
 * 逻辑像素 xl = q.x·scale/pw + pan.x（700×520、中心为 0），pw = persp > 0 ? 1 − q.z/persp : 1。
 */
export interface ViewParams {
  m: readonly number[];
  pivot: Vec3;
  scale: number;
  pan: P2;
  /** 透视焦距（台架 900）；0 = 正交 */
  persp: number;
}

/** 世界点的视深 q.z（朝相机为正） */
export function viewDepth(v: ViewParams, p: Vec3): number {
  const m = v.m;
  return m[6] * (p.x - v.pivot.x) + m[7] * (p.y - v.pivot.y) + m[8] * (p.z - v.pivot.z);
}

/** 世界点 → 逻辑像素（gl3d 同式；测试与反投影往返用） */
export function projectLogical(v: ViewParams, p: Vec3): P2 {
  const m = v.m;
  const dx = p.x - v.pivot.x;
  const dy = p.y - v.pivot.y;
  const dz = p.z - v.pivot.z;
  const qz = m[6] * dx + m[7] * dy + m[8] * dz;
  const pw = v.persp > 0 ? 1 - qz / v.persp : 1;
  return {
    x: ((m[0] * dx + m[1] * dy + m[2] * dz) * v.scale) / pw + v.pan.x,
    y: ((m[3] * dx + m[4] * dy + m[5] * dz) * v.scale) / pw + v.pan.y,
  };
}

/** 逻辑像素 (xl, yl) 在视深 qz 处的世界点（projectLogical 的逆；M 正交，逆 = 转置） */
export function unprojectAt(v: ViewParams, l: P2, qz: number): Vec3 {
  const m = v.m;
  const pw = v.persp > 0 ? 1 - qz / v.persp : 1;
  const qx = ((l.x - v.pan.x) * pw) / v.scale;
  const qy = ((l.y - v.pan.y) * pw) / v.scale;
  return {
    x: v.pivot.x + m[0] * qx + m[3] * qy + m[6] * qz,
    y: v.pivot.y + m[1] * qx + m[4] * qy + m[7] * qz,
    z: v.pivot.z + m[2] * qx + m[5] * qy + m[8] * qz,
  };
}

/**
 * 指针射线与水平面 z = z0 的交点。射线与水平面夹角小于 minAngle（正视 / 侧视那种平视）、
 * 或交点在相机背后时返回 null——交点会飞到无穷远，没意义。
 */
export function rayHitZ(v: ViewParams, l: P2, z0: number, minAngle = (15 * Math.PI) / 180): Vec3 | null {
  const a = unprojectAt(v, l, 0);
  const b = unprojectAt(v, l, 1);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  if (Math.abs(dz) < Math.sin(minAngle) * Math.hypot(dx, dy, dz)) return null;
  const qz = (z0 - a.z) / dz;
  if (v.persp > 0 && qz >= v.persp * 0.95) return null;
  return { x: a.x + dx * qz, y: a.y + dy * qz, z: z0 };
}

/** 手的传感读数（引擎 HAND 事件的载荷）：方位、距离、臂要怎么弯才碰得到它 */
export interface HandReading {
  /** 世界系 rad（0 = 机器初始正前方，逆时针为正），已归到 [−π, π) */
  bearing: number;
  /** 离电机轴的水平距离（mm）；手在机身上（摸壳）时 = R_HULL */
  dist: number;
  /**
   * 要让臂对准手，机身该朝哪（世界系 rad）。臂不在机身中线上（偏右约 109 mm），机身中线对准手时
   * 臂是偏的；这里按臂线算好，引擎「迎」就转到这里（引擎不认几何）。
   */
  face: number;
  /** 臂要弯向哪（腱系 rad：0 = 上，左为正，归到 [−π, π)） */
  aimDir: number;
  /** 要弯多少（引擎 bend 单位：1 = 标准满差动；> 1 = 满差动也够不着，封顶 dMax/span） */
  aimBend: number;
  /** 手离臂基座多远（mm） */
  aimDist: number;
  /** 手偏离臂轴的侧向距离（mm）：很小时 aimDir 读不准（手就在臂轴上，往哪边都差不多），台架据此留用上一个弯向 */
  side: number;
  /** 指针落在机身上（射线先碰到机身外廓）：那是在摸壳 */
  onBody: boolean;
}

/** 大触手的几何：基座（世界，未转）、笔直时的梢端、静息弦长 */
export const ARM_GEOM = (() => {
  const s0 = STATIONS[0];
  const s1 = STATIONS[STATIONS.length - 1];
  const base = armPoint({ x: s0[0], y: s0[1], z: s0[2] });
  const tip = armPoint({ x: s1[0], y: s1[1], z: s1[2] });
  return { base, tip, length: Math.hypot(tip.x - base.x, tip.y - base.y, tip.z - base.z) };
})();

/** 手离电机轴多远算远（mm）：再远方位还在，距离截住，不让射线把它甩到无穷远 */
export const HAND_FAR = 3000;

/**
 * 平视（正视 / 侧视）时手在哪：射线与水平面几乎平行，没法取地面交点。约定手在机器朝相机这一侧、
 * 离电机轴 R_FRONT（= 臂梢那一圈）的竖直圆柱面上——屏幕上左右移动，方位在朝相机的半圈里平滑地变；
 * 射线擦不到圆柱（指针在机器外侧更远处）时取射线离轴最近的那一点（相切处两种取法重合，不跳）。
 */
export const R_FRONT = 600;

/**
 * 机身外廓（竖直圆柱，绕电机轴）：半径 ≥ 机架角点 281 mm，高度含拱顶与底盘。指针射线先碰到它 =
 * 手放在机身上（摸壳），读数取外廓朝相机那一面上的点（距离恒为 R_HULL）；从顶上压下来（俯视正对机身）
 * 那一面上方位没意义，沿用上一个读数的方位。
 */
export const R_HULL = 300;
export const HULL_Z = [-160, 230] as const;
/** 射线离（伸出外廓的那段）臂轴不到这么远（mm）：指针在臂旁边，不算摸壳 */
export const ARM_NEAR = 50;
/** 手离臂基座不到这么远（mm）时「往哪弯」没意义：弯曲渐隐到 0 */
export const R_NEAR_BASE = 40;

/** 视线（相机轴）与水平面的夹角够大时用「臂高水平面」，否则用「朝相机的圆柱面」——按视图定，不按每根射线定 */
const PLANE_MIN = Math.sin((15 * Math.PI) / 180);

interface Ray {
  a: Vec3;
  d: Vec3;
}
function rayOf(v: ViewParams, l: P2): Ray {
  const a = unprojectAt(v, l, 0);
  const b = unprojectAt(v, l, 1);
  return { a, d: { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z } };
}
const at = (r: Ray, q: number): Vec3 => ({ x: r.a.x + r.d.x * q, y: r.a.y + r.d.y * q, z: r.a.z + r.d.z * q });
/** 射线与绕电机轴半径 R 的竖直圆柱的两个交点参数（q 大 = 朝相机那个在前）；擦不到返回 null */
function cylRoots(r: Ray, R: number): [number, number] | null {
  const ox = r.a.x - YAW_AXIS.x;
  const oy = r.a.y - YAW_AXIS.y;
  const A = r.d.x * r.d.x + r.d.y * r.d.y;
  if (A < 1e-12) return null;
  const B = 2 * (ox * r.d.x + oy * r.d.y);
  const C = ox * ox + oy * oy - R * R;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  return [(-B + sq) / (2 * A), (-B - sq) / (2 * A)];
}
/** 射线上离电机轴最近的点的参数 */
function closestToAxis(r: Ray): number {
  const A = r.d.x * r.d.x + r.d.y * r.d.y;
  if (A < 1e-12) return 0;
  return -((r.a.x - YAW_AXIS.x) * r.d.x + (r.a.y - YAW_AXIS.y) * r.d.y) / A;
}

function hitCylinder(v: ViewParams, l: P2): Vec3 {
  const r = rayOf(v, l);
  const roots = cylRoots(r, R_FRONT);
  // 擦不到：离轴最近的点；擦得到：朝相机那一侧
  return at(r, roots ? roots[0] : closestToAxis(r));
}

const wrapPiLocal = (a: number): number => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
const smoothstep = (e0: number, e1: number, x: number): number => {
  const u = clamp((x - e0) / (e1 - e0), 0, 1);
  return u * u * (3 - 2 * u);
};
const front = (v: ViewParams, q: number): boolean => v.persp <= 0 || q < v.persp * 0.95;

/**
 * 指针 → 手（Lab 1-6，2026-10-07）。鼠标只有两个自由度，第三个（视深）要约定，两件事用两个约定：
 *
 * - **方位 / 距离**（人在哪）：先看射线有没有先碰到机身外廓（R_HULL）——碰到 = 手在摸壳。否则按视图：
 *   俯视 / 轴测取射线 ∩ 臂所在的水平面（z = 臂高），屏幕越往上 = 越远，指针压在笔直的臂梢上 = 交点
 *   就是臂梢；交点太远（> HAND_FAR）或在相机背后时取射线穿出 HAND_FAR 圆柱的那一点（与平面交点在
 *   HAND_FAR 处接上，不跳）。平视（正视 / 侧视）取朝相机那一侧、离轴 R_FRONT 的竖直圆柱面。
 *   这些面都**与机器此刻的姿态无关**——否则机身一转，同一个指针的方位就跟着漂，「转向手」会变成追自己的尾巴。
 * - **臂怎么弯**（手离臂多远、在哪边）：取射线上离（此刻朝向下的）笔直臂轴最近的点——屏幕上指针压在臂上，
 *   这个点就在臂轴上（不用弯）；在臂旁边，它就在臂旁边（所见即所得）。顺着臂轴看（臂几乎正对相机）时
 *   这个点不稳，渐变到「过臂梢、垂直视线的平面」上的点。转到机身局部系，相对臂基座：偏离臂轴的角 off、
 *   弯向 aimDir。要碰到它，梢端弦角：手在臂长以外取 off；以内取过基座、与臂轴相切、经过手的那段圆弧在
 *   梢端的弦角 L·sin(off)/r（离得越近要卷得越深；两式在 r·off/sin(off) = L 处相等，换式不跳）。查标定表换成差动。
 * - hold：上一个读数的方位（台架传），手在机身顶上时沿用。
 */
export function handReading(v: ViewParams, l: P2, yaw: number, hold?: number): HandReading {
  const zArm = ARM_GEOM.base.z;
  const ray = rayOf(v, l);

  // —— 射线离（此刻朝向下的）笔直臂轴最近的点：既是「臂怎么弯」的依据，也用来判「指针在臂旁边」
  const B = yawPoint(ARM_GEOM.base, yaw);
  const T = yawPoint(ARM_GEOM.tip, yaw);
  const L = ARM_GEOM.length;
  const ex = (T.x - B.x) / L;
  const ey = (T.y - B.y) / L;
  const ez = (T.z - B.z) / L;
  const d = ray.d;
  const wx = ray.a.x - B.x;
  const wy = ray.a.y - B.y;
  const wz = ray.a.z - B.z;
  const A = d.x * d.x + d.y * d.y + d.z * d.z;
  const bb = d.x * ex + d.y * ey + d.z * ez;
  const D = d.x * wx + d.y * wy + d.z * wz;
  const E = ex * wx + ey * wy + ez * wz;
  const den = A - bb * bb;
  let hc: Vec3 | null = null;
  let k = 0;
  let nearArm = false;
  if (den > 1e-12 * A) {
    const u = clamp((A * E - bb * D) / den, 0, 2 * L);
    let q = (d.x * (B.x + u * ex - ray.a.x) + d.y * (B.y + u * ey - ray.a.y) + d.z * (B.z + u * ez - ray.a.z)) / A;
    if (v.persp > 0) q = Math.min(q, v.persp * 0.95);
    hc = at(ray, q);
    k = smoothstep(0.15, 0.35, Math.sqrt(den / A));
    // 指针就在伸出机身外廓的那段臂旁边：那是手在臂边上，不是在摸壳
    const qa = { x: B.x + u * ex, y: B.y + u * ey, z: B.z + u * ez };
    const gap = Math.hypot(hc.x - qa.x, hc.y - qa.y, hc.z - qa.z);
    nearArm = k > 0.5 && u <= 1.1 * L && gap < ARM_NEAR && Math.hypot(qa.x - YAW_AXIS.x, qa.y - YAW_AXIS.y) > 0.9 * R_HULL;
  }

  // —— 人在哪
  let hit: Vec3 | null = null;
  let holdBearing = false;
  // 臂高水平面的交点（俯视 / 轴测用；摸壳判定也要拿它比先后）
  const planeMode = Math.abs(v.m[8]) >= PLANE_MIN;
  let qPlane = -Infinity;
  let pPlane: Vec3 | null = null;
  if (planeMode && ray.d.z !== 0) {
    const q = (zArm - ray.a.z) / ray.d.z;
    const p = at(ray, q);
    if (front(v, q)) {
      qPlane = q;
      pPlane = p;
    }
  }
  if (!nearArm) {
    // 射线先碰到机身外廓的哪一面（侧面 / 顶面，取离相机近的那个 = q 大的）
    let qBody = -Infinity;
    const hull = cylRoots(ray, R_HULL);
    if (hull && front(v, hull[0])) {
      const p = at(ray, hull[0]);
      if (p.z >= HULL_Z[0] && p.z <= HULL_Z[1]) {
        hit = p;
        qBody = hull[0];
      }
    }
    if (ray.d.z !== 0) {
      const qTop = (HULL_Z[1] - ray.a.z) / ray.d.z;
      const pt = at(ray, qTop);
      if (qTop > qBody && front(v, qTop) && Math.hypot(pt.x - YAW_AXIS.x, pt.y - YAW_AXIS.y) <= R_HULL) {
        // 从顶上压在机身上：那一面上方位没意义（离电机轴太近），沿用上一个
        hit = pt;
        qBody = qTop;
        holdBearing = true;
      }
    }
    // 射线先落到外廓外面的臂高平面上（手在机身前面、比外廓那一面离相机近）：不算摸壳
    if (hit && pPlane && qPlane > qBody && Math.hypot(pPlane.x - YAW_AXIS.x, pPlane.y - YAW_AXIS.y) > R_HULL) {
      hit = null;
      holdBearing = false;
    }
  }
  const onBody = hit !== null;
  if (!hit) {
    if (planeMode) {
      if (pPlane && Math.hypot(pPlane.x - YAW_AXIS.x, pPlane.y - YAW_AXIS.y) <= HAND_FAR) hit = pPlane;
      else {
        const far = cylRoots(ray, HAND_FAR);
        hit = far ? at(ray, far[1]) : at(ray, closestToAxis(ray));
      }
    } else hit = hitCylinder(v, l);
  }
  const hx = hit.x - YAW_AXIS.x;
  const hy = hit.y - YAW_AXIS.y;
  const dist = onBody ? R_HULL : Math.min(HAND_FAR, Math.hypot(hx, hy));
  let bearing = wrapPiLocal(Math.atan2(hy, hx) - FACING);
  if (holdBearing) {
    // 压在机身顶上：沿用上一个读数的方位；没有上一个（手指第一下就按在顶上）时，离轴太近的点方位乱跳，取机身此刻的朝向
    if (hold !== undefined) bearing = hold;
    else if (Math.hypot(hx, hy) < 0.6 * R_HULL) bearing = wrapPiLocal(yaw);
  }
  // 臂线对准手：臂在机身中线右侧 e（右为正），机身要往左多转 asin(e / dist)
  const e = ARM_GEOM.base.y - YAW_AXIS.y;
  const face = dist >= 1.2 * Math.abs(e) ? wrapPiLocal(bearing + Math.asin(clamp(e / dist, -1, 1))) : bearing;

  // —— 臂怎么弯：射线上离臂轴最近的点；顺着臂轴看（臂几乎正对相机）时渐变到过臂梢、垂直视线的平面
  const hTip = unprojectAt(v, l, viewDepth(v, T));
  const h = hc ? { x: hTip.x + (hc.x - hTip.x) * k, y: hTip.y + (hc.y - hTip.y) * k, z: hTip.z + (hc.z - hTip.z) * k } : hTip;
  // 机身局部系（转回 yaw = 0）：前 = −X、左 = −Y、上 = +Z
  const c = Math.cos(-yaw);
  const sn = Math.sin(-yaw);
  const rx = h.x - B.x;
  const ry = h.y - B.y;
  const along = -(c * rx - sn * ry);
  const left = -(sn * rx + c * ry);
  const up = h.z - B.z;
  const side = Math.hypot(left, up);
  const r = Math.hypot(along, side);
  const off = Math.atan2(side, along);
  const aimDir = side > 1e-6 ? Math.atan2(left, up) : 0;
  const maxDeg = ARM_CHORD[ARM_CHORD.length - 1][1];
  // 梢端弦角。手在臂长以外取 off；以内取经过手的切弧在梢端的弦角 L·sin(off)/r（两式在 r·off/sin(off) = L 处相等）；
  // 手在基座后面取 off → π/2 那一端的值（同一式 sin = 1，接得上）。手离基座不到 R_NEAR_BASE 时方向没意义：
  // 半径下限钳住、再整体渐隐到 0（各段都连续，不会挪半个像素就从弯到底跳到不弯）
  const rr = Math.max(r, R_NEAR_BASE);
  const fade = smoothstep(0, R_NEAR_BASE, r);
  let need: number;
  if (off >= Math.PI / 2) need = Math.min(maxDeg, (L / rr) * (180 / Math.PI)) * fade;
  else if (off < 1e-9 || (r * off) / Math.sin(off) >= L) need = (off * 180) / Math.PI;
  else need = Math.min(maxDeg, ((L * Math.sin(off)) / rr) * (180 / Math.PI)) * fade;
  return { bearing, dist, face, aimDir, aimBend: driveOfChord(need) / ARM_DRIVE.span, aimDist: r, side, onBody };
}

/** 逻辑像素 ↔ 画布 CSS 像素（gl3d 的逻辑视口 700×520 铺满画布） */
export function cssToLogical(px: number, py: number, w: number, h: number): P2 {
  return { x: (px - w / 2) * (HALF_W / (w / 2)), y: (py - h / 2) * (HALF_H / (h / 2)) };
}

// ------------------------------------------------------------------ 碰臂判定（Lab 1-6，台架 syncHand ③ 搬来）

/**
 * 指针 = 手（2026-10-07）的台架手感常量（秒 / rad / mm，待拍板）：
 * 手离臂脊线 touch 以内算碰到；碰到以后，离臂超过 release 才算松开——缠着的时候臂会动，
 * 只要手还在碰到那一刻的位置附近（anchor 以内）就一直算碰着（距离见 HAND_MM）。HAND 读数每 send 秒
 * 最多报一次、变化超过阈值才报（日志不被逐帧刷爆）。
 * （2026-10-08 从 MachineBench 搬来：台架、vitest 闭环、hand-probe 共用一份；数值未改）
 */
export const HAND_UI = {
  /** 指针在 touch 以内待够这么久（秒）、且移动不快于 maxSpeed 才算碰到——划过去不算（距离阈值见 HAND_MM） */
  dwell: 0.12,
  /** 指针进到「碰到」圈里之前已经这么久（秒）没挪动（挪动 = 超过 3 px）：是臂伸过来碰到了不动的手（ARM_TOUCH by: 'arm'） */
  stillFor: 0.2,
  send: 0.1,
  dBearing: 0.02,
  dDist: 15,
  dAimDir: 0.05,
  dAimBend: 0.03,
  /** 手偏离臂轴不到这么多（mm）时弯向读不准，沿用上一个 */
  sideMin: 10,
  /** 在场档的滞回（mm）与驻留（秒）：手在档位边上晃，不反复报「走近」 */
  bandHys: 50,
  bandDwell: 0.4,
} as const;

/** 上一条发给引擎的 HAND（台架记着它判下一条发不发） */
export interface HandSent {
  bearing: number;
  dist: number;
  face: number;
  aimDir: number;
  aimBend: number;
  aimDist: number;
  /** 发的时刻（秒） */
  at: number;
}

/**
 * 台架这一帧要不要给引擎发一条 HAND（syncHand ①；探针与守门调同一个函数）。读数变化过阈值才发；迎手链 v2 下
 * 指针还在挪（读数变得慢，比如 40 mm/s 慢慢挪）也发——引擎按上一条 HAND 外推「静止多久」、0.25 s 没有新读数就当
 * 速度为 0，只看读数变化会让它把一直在动的手当成停稳了，去撑、去凑、去缠。都受 HAND_UI.send 节流；指针停下就不再补发。
 * aimDir = 这一帧要报的弯向（侧偏太小时沿用上一个）；lastMoveAt = 指针最后挪过（> 3 px）的时刻
 */
export function handSendDue(
  read: Pick<HandReading, 'bearing' | 'face' | 'dist' | 'aimBend'>,
  last: HandSent | null,
  aimDir: number,
  now: number,
  o: { v2: boolean; lastMoveAt: number },
): boolean {
  if (!last) return true;
  if (now - last.at < HAND_UI.send) return false;
  const ang = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  return (
    ang(read.bearing, last.bearing) > HAND_UI.dBearing ||
    ang(read.face, last.face) > HAND_UI.dBearing ||
    Math.abs(read.dist - last.dist) > HAND_UI.dDist ||
    Math.abs(read.aimBend - last.aimBend) > HAND_UI.dAimBend ||
    (read.aimBend > 0.05 && ang(aimDir, last.aimDir) > HAND_UI.dAimDir) ||
    (o.v2 && o.lastMoveAt > last.at)
  );
}

/**
 * 碰臂的距离阈值按世界毫米给，用的时候换成此刻画面上的像素（画布多宽、哪个视角，碰到的实际距离都一样）。
 * 数值让桌面默认画幅（约 712 px 宽、轴测）下与像素版手感相同；像素再钳一道（HAND_PX：鼠标 8–28 px，手指 20–44 px）。
 * tractionSpeed：牵引时锚点跟手的指针速度上限（mm/s，只在 contactStep 的 opts.traction 下用；迎手链 v2 §7.2 第 3 条）。
 */
export const HAND_MM = {
  touch: 32,
  release: 68,
  anchor: 80,
  maxSpeed: 800,
  tractionSpeed: 60,
} as const;

/** 碰到半径的像素钳位（CSS px）：鼠标 / 手指（手指粗、又挡着视线，下限放宽） */
export const HAND_PX = {
  mouse: [8, 28],
  finger: [20, 44],
} as const;

/** 此刻画面上的碰臂阈值（CSS px；maxSpeed 是 px/s） */
export interface ContactThresholds {
  touchPx: number;
  releasePx: number;
  anchorPx: number;
  maxSpeed: number;
}

/**
 * 毫米阈值 → 此刻的像素阈值。pxPerMm = 臂梢那一处画面上一毫米几个 CSS px（台架按视角 / 画幅 / 透视现算）；
 * finger = 触屏手指（钳位不同）。release / anchor 跟着 touch 的钳位一起缩放（比例不变）。
 */
export function contactThresholds(pxPerMm: number, finger: boolean): ContactThresholds {
  const [lo, hi] = finger ? HAND_PX.finger : HAND_PX.mouse;
  const touchPx = clamp(HAND_MM.touch * pxPerMm, lo, hi);
  return {
    touchPx,
    releasePx: touchPx * (HAND_MM.release / HAND_MM.touch),
    anchorPx: touchPx * (HAND_MM.anchor / HAND_MM.touch),
    maxSpeed: HAND_MM.maxSpeed * pxPerMm,
  };
}

/**
 * 此刻的有效碰到半径（世界 mm，含像素钳位）：画幅小 / 手指时比 HAND_MM.touch 大，画幅大时比它小。
 * 迎手链 v2 的 HAND.touch 字段就是它（引擎按它留停距，不让「停在手前」落进碰到圈）。
 */
export function contactRadiusMm(pxPerMm: number, finger: boolean): number {
  return contactThresholds(pxPerMm, finger).touchPx / pxPerMm;
}

/** 指针轨迹的常量：速度按最近 window 秒算；轨迹最多留 cap 个点；挪动超过 movePx（CSS px）才算真的动了 */
export const TRACK = {
  window: 0.3,
  cap: 64,
  movePx: 3,
} as const;

/**
 * 指针轨迹（指针事件更新，与帧无关）：最近 0.3 s 的位置（判速度），最后一次真的挪动的时刻与位置
 * （判「是谁碰的谁」）。下面四个函数就地改它（台架的 pointermove / pointerdown 与每帧的修剪各调一个）。
 */
export interface PointerTrack {
  trail: { t: number; x: number; y: number }[];
  lastMoveAt: number;
  lastMovePos: P2;
}

export function pointerTrack(): PointerTrack {
  return { trail: [], lastMoveAt: -Infinity, lastMovePos: { x: -1e9, y: -1e9 } };
}

/** 指针移动（pointermove）：记一个轨迹点；离上一次「真的挪动」超过 movePx 才更新挪动时刻 */
export function trackMove(tr: PointerTrack, t: number, x: number, y: number): void {
  tr.trail.push({ t, x, y });
  if (tr.trail.length > TRACK.cap) tr.trail.shift();
  if (Math.hypot(x - tr.lastMovePos.x, y - tr.lastMovePos.y) > TRACK.movePx) trackMark(tr, t, x, y);
}

/** 记一次「真的挪动」但不进轨迹（台架：手指落下就是手在动，不会被当成臂伸过来碰到它） */
export function trackMark(tr: PointerTrack, t: number, x: number, y: number): void {
  tr.lastMoveAt = t;
  tr.lastMovePos = { x, y };
}

/** 每帧：丢掉 window 秒以前的轨迹点 */
export function trackTrim(tr: PointerTrack, now: number): void {
  while (tr.trail.length && now - tr.trail[0].t > TRACK.window) tr.trail.shift();
}

/** 指针速度（CSS px/s）：此刻位置 ↔ 轨迹里最早那个点；轨迹不足 0.02 s 时记 0 */
export function trackSpeed(tr: PointerTrack, now: number, x: number, y: number): number {
  const t0 = tr.trail[0];
  return t0 && now - t0.t > 0.02 ? Math.hypot(x - t0.x, y - t0.y) / (now - t0.t) : 0;
}

/** 碰臂的状态（纯数据；台架每帧换成 contactStep 的输出，几处重置就地改字段） */
export interface ContactState {
  /** 悬停碰着（电极 = touching ∪ held） */
  touching: boolean;
  /** 碰到那一刻判的谁碰谁：'arm' = 臂伸过来碰到不动的手（ARM_TOUCH by: 'arm'） */
  by: 'hand' | 'arm';
  /** 锚点：碰到那一刻指针的位置（CSS px）；opts.traction 下牵引时跟着指针走 */
  at: P2;
  /** 指针进了 touch 圈、且不快的时刻（待够 dwell 才算碰到）；−1 = 不在 */
  nearSince: number;
  /** 指针第一次进到 touch 圈里的时刻（不管快慢）；−1 = 不在 */
  enteredAt: number;
  /** 按住大触手（手指在臂里；台架 pointerdown 置、抬起清） */
  held: boolean;
  /** 按下那一刻的位置（拖开够远 = 抽手） */
  pressAt: P2;
}

export function contactIdle(): ContactState {
  return { touching: false, by: 'hand', at: { x: 0, y: 0 }, nearSince: -1, enteredAt: -1, held: false, pressAt: { x: 0, y: 0 } };
}

/** 一帧的输入（全部 CSS px / 秒） */
export interface ContactSample {
  now: number;
  /** 指针此刻的位置 */
  x: number;
  y: number;
  /** 指针离大触手脊线（画面上）多远 */
  d: number;
  /** 臂梢那一处画面上一毫米几个 CSS px */
  pxPerMm: number;
  /** 触屏手指 */
  finger: boolean;
  /** 指针速度（trackSpeed） */
  speed: number;
  /** 指针最后一次真的挪动的时刻（PointerTrack.lastMoveAt） */
  lastMoveAt: number;
  /** 引擎此刻的抓握阶段（缠 / 握着时手没挪开锚点就一直算碰着） */
  grasp: GraspPhase;
}

/**
 * 碰臂（台架 syncHand ③，2026-10-08 原样搬来；台架、vitest 闭环、hand-probe 共用）。阈值按毫米给、换成此刻画面上的像素。
 *
 * - 按住大触手再拖开够远（离脊线 > release 且离按下处 > anchor）= 抽手（不必等松开鼠标）。
 * - 碰到：指针在 touch 以内待够 dwell、且不是飞快划过（≤ maxSpeed）。进圈那一刻指针已经静止了 stillFor 以上
 *   = 臂伸过来碰到了不动的手（by 'arm'）；进圈时还在动 = 手伸过去碰臂（by 'hand'）。
 * - 碰着以后：离脊线 > release 才松开；缠 / 握着（WRAP / HOLD_HUMAN / HOLD_OBJECT）的时候臂会动，
 *   手没挪开（离锚点 anchor 以内）就一直算碰着。
 * - opts.traction（迎手链 v2 §7.2 第 3 条，台架现在不传）：缠 / 握着时指针慢（≤ tractionSpeed mm/s）且离脊线
 *   ≤ release，锚点每帧跟到指针——慢慢牵着走不会判松开；离脊线 > release（臂没跟上）锚点冻住，再拉出 anchor 即松开。
 *
 * 不传 opts.traction 时逐帧输出与搬之前的台架逐位相同（machine-behavior.test.ts 拿原段落对照）。
 */
export function contactStep(
  prev: ContactState,
  s: ContactSample,
  opts: { traction?: boolean } = {},
): { next: ContactState; th: ContactThresholds } {
  const th = contactThresholds(s.pxPerMm, s.finger);
  const n: ContactState = { ...prev };
  const { now, x, y, d, speed } = s;
  if (n.held && d > th.releasePx && Math.hypot(x - n.pressAt.x, y - n.pressAt.y) > th.anchorPx) n.held = false;
  if (!n.touching) {
    if (d <= th.touchPx) {
      if (n.enteredAt < 0) n.enteredAt = now;
    } else n.enteredAt = -1;
    if (d <= th.touchPx && speed <= th.maxSpeed) {
      if (n.nearSince < 0) n.nearSince = now;
      if (now - n.nearSince >= HAND_UI.dwell) {
        n.touching = true;
        n.at = { x, y };
        n.by = n.enteredAt - s.lastMoveAt >= HAND_UI.stillFor ? 'arm' : 'hand';
      }
    } else n.nearSince = -1;
  } else {
    const gp = s.grasp;
    const coiled = gp === 'WRAP' || gp === 'HOLD_HUMAN' || gp === 'HOLD_OBJECT';
    // 牵引：臂跟得上（离脊线 ≤ release）且手慢——锚点跟着指针；臂没跟上时锚点冻住
    if (opts.traction && coiled && d <= th.releasePx && speed <= HAND_MM.tractionSpeed * s.pxPerMm) n.at = { x, y };
    const stay = coiled && Math.hypot(x - n.at.x, y - n.at.y) <= th.anchorPx;
    if (d > th.releasePx && !stay) {
      n.touching = false;
      n.nearSince = -1;
      n.enteredAt = -1;
    }
  }
  return { next: n, th };
}
