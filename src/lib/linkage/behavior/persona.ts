/**
 * 四种人格 × 12 项参数（轮回机器_行为引擎spec.md §4）。
 *
 * 数值逐项取自 2026-04-03 的参数底表（轮回机器_工作日志表格附录.md T-0403-1，原文称之为
 * 「整个行为引擎的参数底表：同一套行为代码，换一组数就换一个人格」）。两处按 2026-10-06 拍板改过：
 * 第三套定名**好奇**（案例页曾写「亲密」，数值本就是好奇型的）；D 的死法为**节律紊乱后渐弱**。
 *
 * 表里只有「朝向偏向人的概率」，没说不朝人时朝哪；`otherwise` 取自案例页的定性行
 * （A 四处看 / B 偏离人 / C 强烈偏向人 / D 忽而朝人忽而背离）——这是读表的推断，spec §10 待拍板。
 */

import { type Rng, uniform } from './rng';

export type PersonaKey = 'A' | 'B' | 'C' | 'D';
export const PERSONA_KEYS: readonly PersonaKey[] = ['A', 'B', 'C', 'D'];

/** [lo, hi]；lo === hi 即单值 */
export type Range = readonly [number, number];

export type DeathKind = 'exhaust' | 'quiet' | 'turn' | 'arrhythmia';

export interface PersonaSpec {
  key: PersonaKey;
  zh: string;
  en: string;
  /** ① 呼吸周期（秒） */
  breathPeriod: Range;
  /** ② 呼吸幅度（行程分数 0–1） */
  breathAmp: Range;
  /** ③ 运动速度（cm/s） */
  speed: Range;
  /** ④ 响应延迟（秒） */
  latency: Range;
  /** ⑤ 响应强度（0.4 = +40%） */
  gain: Range;
  /** ⑤ 的「±」：D 的响应方向也随机，可能伸也可能缩 */
  gainSigned: boolean;
  /** ⑥ 自发运动间隔（秒） */
  spont: Range;
  /** ⑥ 人在时的自发运动间隔（C：8–12 s，人在时 5–8 s）；null = 不变 */
  spontPresent: Range | null;
  /** ⑦ 声音基频（Hz） */
  voiceFreq: Range;
  /** ⑧ 声音占空比 */
  voiceDuty: Range;
  /** ⑨ 朝向变化间隔（秒） */
  orient: Range;
  /** ⑩ 朝向偏向人的概率 */
  toward: number;
  /** ⑩ 不朝人时：random 随便看 / away 背向人 */
  otherwise: 'random' | 'away';
  /** ⑪ 惊吓阈值（刺激强度 I 超过它就是惊吓） */
  startle: Range;
  /** ⑫ 死亡方式与时长（秒） */
  death: { kind: DeathKind; dur: number; zh: string };
}

const one = (v: number): Range => [v, v];

export const PERSONAS: Readonly<Record<PersonaKey, PersonaSpec>> = {
  A: {
    key: 'A',
    zh: '活力',
    en: 'Vital',
    breathPeriod: one(2),
    breathAmp: one(0.8),
    speed: one(3),
    latency: one(0.2),
    gain: one(0.4),
    gainSigned: false,
    spont: [3, 5],
    spontPresent: null,
    voiceFreq: [800, 1200],
    voiceDuty: one(0.7),
    orient: [5, 8],
    toward: 0.4,
    otherwise: 'random',
    startle: one(0.8),
    death: { kind: 'exhaust', dur: 90, zh: '精力耗尽渐停' },
  },
  B: {
    key: 'B',
    zh: '沉静',
    en: 'Withdrawn',
    breathPeriod: one(6),
    breathAmp: one(0.3),
    speed: one(0.5),
    latency: one(2),
    gain: one(0.1),
    gainSigned: false,
    spont: [15, 25],
    spontPresent: null,
    voiceFreq: [200, 400],
    voiceDuty: one(0.2),
    orient: [30, 45],
    toward: 0.2,
    otherwise: 'away',
    startle: one(0.2),
    death: { kind: 'quiet', dur: 120, zh: '安静慢慢停下' },
  },
  C: {
    key: 'C',
    zh: '好奇',
    en: 'Curious',
    breathPeriod: one(4),
    breathAmp: one(0.5),
    speed: one(1.5),
    latency: one(0.5),
    gain: one(0.25),
    gainSigned: false,
    spont: [8, 12],
    spontPresent: [5, 8],
    voiceFreq: [400, 800],
    voiceDuty: one(0.5),
    orient: [10, 15],
    toward: 0.8,
    otherwise: 'random',
    startle: one(0.5),
    death: { kind: 'turn', dur: 90, zh: '最后朝向用户缓慢停止' },
  },
  D: {
    key: 'D',
    zh: '不稳定',
    en: 'Unstable',
    breathPeriod: [2, 8],
    breathAmp: [0.2, 0.9],
    speed: [0.5, 4],
    latency: [0.3, 3],
    gain: [0.1, 0.5],
    gainSigned: true,
    spont: [2, 30],
    spontPresent: null,
    voiceFreq: [200, 1200],
    voiceDuty: [0.1, 0.8],
    orient: [3, 40],
    toward: 0.5,
    otherwise: 'away',
    startle: [0.2, 0.9],
    death: { kind: 'arrhythmia', dur: 60, zh: '节律紊乱后渐弱' },
  },
};

/**
 * 变异性（盘点 §9.2 行为杠杆「同刺激每次略不同，参数加噪声」）：表里的单值当均值，
 * 每次取用时加这么大的均匀噪声。区间值（D 的各项、A 的 3–5 s 等）本身就是每次重抽，不再加。
 * 手感常量，待拍板。
 */
export const VARIABILITY = {
  /** 呼吸周期与幅度：每次呼吸 ±4% */
  breath: 0.04,
  /** 响应延迟与强度：每次响应 ±15% */
  response: 0.15,
} as const;

/** 从一项参数取一个值：区间均匀抽；单值加 ±jitter 相对噪声（jitter=0 时不耗随机数） */
export function sampleRange(r: Rng, range: Range, jitter = 0): number {
  const [lo, hi] = range;
  if (lo === hi) return jitter > 0 ? lo * (1 + uniform(r, -jitter, jitter)) : lo;
  return uniform(r, lo, hi);
}

/** 呈现顺序合法：恰好四个、A–D 各一次（09-09：四套固定、跨被试平衡顺序） */
export function isPersonaOrder(order: readonly unknown[]): order is readonly PersonaKey[] {
  if (order.length !== PERSONA_KEYS.length) return false;
  return PERSONA_KEYS.every((k) => order.filter((o) => o === k).length === 1);
}
