/**
 * Lab 1-6 的实时输出面板（2026-10-19 用户立项：「直接表现输出的传感器的实时数据」）：
 * 台架每帧的仿真驱动量，换成物理单位，并留最近一段的历史给面板画走势；不是真机回读。
 *
 * 零 DOM、零依赖：台架（MachineBench）每帧调 `update()`，面板只读 `values` / `targets` / `series()`。
 * 这里不算任何行为——数全是台架此刻已经算好、正要交给执行器的那个数，只换单位：
 *
 * - 大触手三根肌腱：收线长度 mm = 收缩率 × (抽线行程 32 + 静息余量 12)。与 applyContraction3 同一条换算：
 *   收缩率 0 时缆长 = 自然长 + 12，收缩率 1 时 = 自然长 − 32，绞盘一共收进 44 mm。
 *   读的是阻尼跟随后的仿真值，引擎要的那个值记作目标；44 mm 仍是模型设定。
 * - 两个小触手舵机（SG90）：驱动角，度，±75° 封顶（SMALLARM_STARTLE.max）；0 号在左、1 号在右。
 * - 中间轴（呼吸）：曲柄角 0–180°（0 = 伸展死点、180 = 折叠死点，phaseDeg 同口径）+ 角速度。
 * - 机身转台（偏航，占位）：朝向 ±180° + 角速度；引擎此刻要转去的朝向记作目标。
 * - 声音：此刻的音量（发声时 = 精力，不发声 = 0）与音高 Hz。
 * - 灯：亮度。
 */

import { CRANK } from './machine-behavior';
import { SMALLARM_STARTLE } from './machine-smallarm';
import { TENTACLE3D } from './tentacle3d-data';

const DEG = 180 / Math.PI;

export type ReadoutKey =
  | 'tendon0'
  | 'tendon1'
  | 'tendon2'
  | 'servo0'
  | 'servo1'
  | 'crank'
  | 'crankRate'
  | 'yaw'
  | 'yawRate'
  | 'voice'
  | 'pitch'
  | 'light';

export type ReadoutGroup = 'arm' | 'servo' | 'crank' | 'yaw' | 'sound';

export interface ReadoutChannel {
  key: ReadoutKey;
  group: ReadoutGroup;
  unit: string;
  /** 面板画走势的量程（超出的点贴边画） */
  min: number;
  max: number;
  /** 量程跨零：走势画一条零线 */
  centered: boolean;
  /** 显示几位小数 */
  digits: number;
}

/** 绞盘一共收进多少 mm（抽线行程 + 静息余量） */
export const TENDON_TAKEUP_MM = TENTACLE3D.pullMax + TENTACLE3D.slack;
const SERVO_MAX = SMALLARM_STARTLE.max * DEG;
const CRANK_RATE_MAX = CRANK.maxSpeed * DEG;

export const READOUT_CHANNELS: readonly ReadoutChannel[] = [
  { key: 'tendon0', group: 'arm', unit: 'mm', min: 0, max: TENDON_TAKEUP_MM, centered: false, digits: 1 },
  { key: 'tendon1', group: 'arm', unit: 'mm', min: 0, max: TENDON_TAKEUP_MM, centered: false, digits: 1 },
  { key: 'tendon2', group: 'arm', unit: 'mm', min: 0, max: TENDON_TAKEUP_MM, centered: false, digits: 1 },
  { key: 'servo0', group: 'servo', unit: '°', min: -SERVO_MAX, max: SERVO_MAX, centered: true, digits: 1 },
  { key: 'servo1', group: 'servo', unit: '°', min: -SERVO_MAX, max: SERVO_MAX, centered: true, digits: 1 },
  { key: 'crank', group: 'crank', unit: '°', min: 0, max: 180, centered: false, digits: 1 },
  { key: 'crankRate', group: 'crank', unit: '°/s', min: -CRANK_RATE_MAX, max: CRANK_RATE_MAX, centered: true, digits: 0 },
  { key: 'yaw', group: 'yaw', unit: '°', min: -180, max: 180, centered: true, digits: 1 },
  { key: 'yawRate', group: 'yaw', unit: '°/s', min: -180, max: 180, centered: true, digits: 0 },
  { key: 'voice', group: 'sound', unit: '%', min: 0, max: 100, centered: false, digits: 0 },
  { key: 'pitch', group: 'sound', unit: 'Hz', min: 0, max: 2000, centered: false, digits: 0 },
  { key: 'light', group: 'sound', unit: '%', min: 0, max: 100, centered: false, digits: 0 },
];

/** 声音与灯同在一组（都是 HUD 示意的「表达」输出，各只有一两行，分开排会多占一个组头） */
export const READOUT_GROUPS: readonly ReadoutGroup[] = ['arm', 'servo', 'crank', 'yaw', 'sound'];

/** 台架这一帧交给执行器的量（台架内部单位：收缩率、rad、0–1） */
export interface ActuatorFrame {
  /** 三腱：阻尼跟随后的仿真收缩率与引擎要的收缩率；无真实位置反馈 */
  tendons: readonly [number, number, number];
  tendonTargets: readonly [number, number, number];
  /** 两个小触手舵机的驱动角（rad） */
  servos: readonly [number, number];
  /** 曲柄相位（度，0–180）与呼吸要的相位 */
  crankDeg: number;
  crankTargetDeg: number;
  /** 机身朝向与引擎要转去的朝向（rad，世界系，±π） */
  yaw: number;
  yawTarget: number;
  sound: { on: boolean; f: number; level: number };
  light: number;
}

/** 一帧换算成面板单位；速度由 ActuatorReadout 按相邻两帧算，这里给 0 */
export function readoutValues(f: ActuatorFrame): Record<ReadoutKey, number> {
  return {
    tendon0: f.tendons[0] * TENDON_TAKEUP_MM,
    tendon1: f.tendons[1] * TENDON_TAKEUP_MM,
    tendon2: f.tendons[2] * TENDON_TAKEUP_MM,
    servo0: f.servos[0] * DEG,
    servo1: f.servos[1] * DEG,
    crank: f.crankDeg,
    crankRate: 0,
    yaw: f.yaw * DEG,
    yawRate: 0,
    voice: f.sound.on ? Math.min(1, Math.max(0, f.sound.level)) * 100 : 0,
    pitch: f.sound.f,
    light: Math.min(1, Math.max(0, f.light)) * 100,
  };
}

/** 有目标可比的通道：执行器还在追的那个数（其余通道没有目标，或目标就等于实际） */
export function readoutTargets(f: ActuatorFrame): Partial<Record<ReadoutKey, number>> {
  return {
    tendon0: f.tendonTargets[0] * TENDON_TAKEUP_MM,
    tendon1: f.tendonTargets[1] * TENDON_TAKEUP_MM,
    tendon2: f.tendonTargets[2] * TENDON_TAKEUP_MM,
    crank: f.crankTargetDeg,
    yaw: f.yawTarget * DEG,
  };
}

const wrapDeg = (a: number): number => {
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x <= -180) x += 360;
  return x;
};

/**
 * 面板的数据源：每帧 update 一次，按固定间隔记一个采样（定长环形缓冲，旧的挤掉）。
 * 角速度 = 相邻两帧之差 ÷ dt，再过一个时间常数 0.15 s 的一阶平滑（逐帧差分在 60 帧下抖得厉害）。
 * 暂停时台架不调 update，走势就停在那里。
 */
export class ActuatorReadout {
  readonly period: number;
  readonly capacity: number;
  values: Record<ReadoutKey, number> | null = null;
  targets: Partial<Record<ReadoutKey, number>> = {};
  private hist: Float32Array[];
  private head = 0;
  private count = 0;
  private acc = 0;
  private prevCrank: number | null = null;
  private prevYaw: number | null = null;
  private crankRate = 0;
  private yawRate = 0;

  /** window = 走势保留几秒；period = 多久记一个点 */
  constructor(window = 10, period = 1 / 20) {
    this.period = period;
    this.capacity = Math.max(2, Math.round(window / period));
    this.hist = READOUT_CHANNELS.map(() => new Float32Array(this.capacity));
  }

  update(f: ActuatorFrame, dt: number): void {
    const v = readoutValues(f);
    if (dt > 0) {
      const a = 1 - Math.exp(-dt / 0.15);
      if (this.prevCrank !== null) this.crankRate += ((v.crank - this.prevCrank) / dt - this.crankRate) * a;
      if (this.prevYaw !== null) this.yawRate += (wrapDeg(v.yaw - this.prevYaw) / dt - this.yawRate) * a;
    }
    this.prevCrank = v.crank;
    this.prevYaw = v.yaw;
    v.crankRate = this.crankRate;
    v.yawRate = this.yawRate;
    this.values = v;
    this.targets = readoutTargets(f);
    this.acc += dt;
    if (this.count === 0 || this.acc >= this.period) {
      this.acc = this.count === 0 ? 0 : this.acc % this.period;
      READOUT_CHANNELS.forEach((c, i) => {
        this.hist[i][this.head] = v[c.key];
      });
      this.head = (this.head + 1) % this.capacity;
      this.count = Math.min(this.capacity, this.count + 1);
    }
  }

  /** 新的一场（重来 / 交接）：历史清空，速度从零算起 */
  reset(): void {
    this.values = null;
    this.targets = {};
    this.head = 0;
    this.count = 0;
    this.acc = 0;
    this.prevCrank = null;
    this.prevYaw = null;
    this.crankRate = 0;
    this.yawRate = 0;
  }

  /** 已记的点数 */
  get length(): number {
    return this.count;
  }

  /** 一条通道的历史，旧 → 新 */
  series(key: ReadoutKey): number[] {
    const i = READOUT_CHANNELS.findIndex((c) => c.key === key);
    const h = this.hist[i];
    const out = new Array<number>(this.count);
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let k = 0; k < this.count; k++) out[k] = h[(start + k) % this.capacity];
    return out;
  }
}
