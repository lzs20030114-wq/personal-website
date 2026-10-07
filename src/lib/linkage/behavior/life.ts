/**
 * 生命周期（轮回机器_行为引擎spec.md §5）：诞生 → 成长 → 衰老 → 死亡 → 空白 → 以下一套人格轮回。
 *
 * 时长出自档案：一世 = 诞生 1′ + 成长 4′ + 衰老 1.5′ + 死亡（按人格 60–120 s）+ 空白 45″，
 * 四世一场（档案口径「约 37 分钟」；本表名义值合计 35 分钟，随死亡窗口 ±2 分钟）。
 * 死亡时点收在 ±30 s 窗口内（2026-07-07 实验方案复审）：实现为衰老段长度 90 ± 30 s，
 * 死法本身的时长不动——死亡的「样子」由人格定，只有它何时开始不可预测。
 *
 * 衰老曲线用户拍板「后续讨论」（2026-10-06），这里的 ageing() 是**占位线性斜坡**，
 * 只为让引擎跑得通；HUD 与案例页不得引用它的数值。
 */

import type { DeathKind } from './persona';

export type Phase = 'BIRTH' | 'GROW' | 'AGE' | 'DEATH' | 'BLANK' | 'END';

export const LIFE = {
  /** 各段名义时长（秒） */
  birth: 60,
  grow: 240,
  age: 90,
  blank: 45,
  /** 死亡时点窗口 ±（秒） */
  deathWindow: 30,
  /**
   * 诞生段内部时序（秒，从这一世诞生起算）：先有呼吸（0→30 s 缓入，从折叠端张开），
   * 20 s 起对刺激有响应，40 s 起有自发动作与转向。手感常量，待拍板。
   */
  breathRamp: 30,
  respondAt: 20,
  spontAt: 40,
} as const;

/** 一世的名义长度（死亡窗口取中） */
export function nominalLifeSeconds(deathDur: number): number {
  return LIFE.birth + LIFE.grow + LIFE.age + deathDur + LIFE.blank;
}

/** 衰老对各量的修正（乘数，center 是加量）。u = 衰老进度 0→1 */
export interface AgeFactors {
  /** 呼吸周期 × */
  period: number;
  /** 呼吸幅度 × */
  amp: number;
  /** 响应延迟 × */
  latency: number;
  /** 响应强度 × */
  gain: number;
  /** 运动速度 × */
  speed: number;
  /** 呼吸中心 +（往折叠端沉） */
  center: number;
  /** 节律抖动：每次呼吸周期再乘 1 ± jitter */
  jitter: number;
  /** 握力 × */
  grip: number;
  /** 触须待机扫动 / 灯 / 声的整体活力 × */
  vigor: number;
  /** 自发动作间隔 × */
  spont: number;
}

/** 占位斜坡的终点量（u = 1 时）。衰老曲线讨论要定的就是这张表的形状与数字。 */
export const AGEING_PLACEHOLDER = {
  period: 0.5,
  amp: 0.6,
  latency: 1,
  gain: 0.5,
  speed: 0.5,
  center: 0.15,
  jitter: 0.15,
  grip: 0.5,
  vigor: 0.4,
  spont: 0.5,
} as const;

/** 衰老修正（占位：线性）。u ≤ 0 = 未衰老（恒等），u ≥ 1 = 衰老走完 */
export function ageing(u: number): AgeFactors {
  const k = Math.min(1, Math.max(0, u));
  const P = AGEING_PLACEHOLDER;
  return {
    period: 1 + P.period * k,
    amp: 1 - P.amp * k,
    latency: 1 + P.latency * k,
    gain: 1 - P.gain * k,
    speed: 1 - P.speed * k,
    center: P.center * k,
    jitter: P.jitter * k,
    grip: 1 - P.grip * k,
    vigor: 1 - P.vigor * k,
    spont: 1 + P.spont * k,
  };
}

/** 死亡脚本在某一刻的形状（x = 死亡进度 0→1） */
export interface DeathFrame {
  /** 呼吸幅度系数 1 → 0 */
  amp: number;
  /** 呼吸中心沉向折叠端的进度 0 → 1（死 = 收缩，盘点 §6.1） */
  sink: number;
  /** 自发动作频度系数；低于 DEATH_ACTIVITY_MIN 不再有自发动作 */
  activity: number;
  /** 肌张力（臂预张力、动作幅度）1 → 0 */
  tone: number;
  /** 节律紊乱段（D 的前 2/3）：每次呼吸的周期与幅度乱抽 */
  irregular: boolean;
  /** 每次呼吸周期再乘的系数（B 的「慢慢停下」：1.08） */
  periodGrowth: number;
}

/** 自发动作的最低频度：低于它就不再有自发动作 */
export const DEATH_ACTIVITY_MIN = 0.1;

const E3 = Math.exp(-3);

/**
 * 四种死法（参数表第 12 行；D 按 2026-10-06 拍板）。共同点：终点幅度 0、中心沉到折叠端、
 * 张力归零——「死亡即安静」，不做临终表演。
 * - exhaust（A 精力耗尽渐停）：指数衰减 e^(−3x)，归一到 x=1 恰为 0；
 * - quiet（B 安静慢慢停下）：幅度线性归零，每次呼吸周期 ×1.08，从一开始就没有自发动作；
 * - turn（C 最后朝向用户缓慢停止）：形状同 exhaust，朝向由引擎在死亡开始时锁定；
 * - arrhythmia（D 节律紊乱后渐弱）：前 2/3 节律紊乱、后 1/3 线性渐弱。**不做抽搐骤停**。
 */
export function deathFrame(kind: DeathKind, x: number): DeathFrame {
  const p = Math.min(1, Math.max(0, x));
  switch (kind) {
    case 'exhaust':
    case 'turn': {
      const L = (Math.exp(-3 * p) - E3) / (1 - E3);
      return { amp: L, sink: 1 - L, activity: L, tone: L, irregular: false, periodGrowth: 1 };
    }
    case 'quiet':
      return { amp: 1 - p, sink: p, activity: 0, tone: 1 - p, irregular: false, periodGrowth: 1.08 };
    case 'arrhythmia': {
      if (p < 2 / 3) return { amp: 1, sink: 0, activity: 1, tone: 1, irregular: true, periodGrowth: 1 };
      const y = Math.min(1, (p - 2 / 3) * 3);
      return { amp: 1 - y, sink: y, activity: 0, tone: 1 - y, irregular: false, periodGrowth: 1 };
    }
  }
}
