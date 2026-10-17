/**
 * 四种人格 × 参数表（轮回机器_行为引擎spec.md §4）。
 *
 * **2026-10-14 用户拍板重分类：热情 / 沉静 / 回避 / 乱序随机**，并要求「从参数的角度增大性格导致的行为对比」——
 * 原表（2026-04-03 的参数底表 T-0403-1：活力 / 沉静 / 好奇 / 不稳定，史料见 spec §4.1 与 轮回机器_工作日志表格附录.md）
 * 里，沉静型同时背着「慢」与「怕人」两件事，而它的反应延迟 2 s、速度 0.5 cm/s、转向间隔 30–45 s 让「躲」又慢又少又晚，
 * 探针实测有人站在近处时它平均仍是半朝着人（spec §4.4）。新表把这两件事拆开：沉静 = 慢、稳、不在乎；回避 = 怕人。
 * 字母仍是四个槽位（台架「首世」、日志、跨被试平衡顺序都按它）：A 热情 · B 沉静 · C 回避 · D 乱序随机。
 * 活力型的「精力足」与好奇型的「朝人」并进了热情。
 *
 * 新加的几行（12 项之外）：⑨′ 人在时的朝向间隔、⑬ 对人的趋避、⑭ 人走后多久恢复，以及乱序随机的「区间偏向两端抽」。
 * 动作程序与迎手链里「按性格换结构」的地方读 `temper`，不再读字母。数值全部是手感常量，待作者拍板。
 */

import { type Rng, rand, uniform } from './rng';

export type PersonaKey = 'A' | 'B' | 'C' | 'D';
export const PERSONA_KEYS: readonly PersonaKey[] = ['A', 'B', 'C', 'D'];

/** 四种性格（2026-10-14 用户定名）。v2 动作程序按它换结构（恢复、接近、握着时的小动作……） */
export type Temper = 'warm' | 'calm' | 'avoidant' | 'random';

/** [lo, hi]；lo === hi 即单值 */
export type Range = readonly [number, number];

/** 死法：turn 精力渐尽、最后朝向人停下 · quiet 安静慢慢停下 · withdraw 背过身慢慢停下 · arrhythmia 节律紊乱后渐弱 */
export type DeathKind = 'turn' | 'quiet' | 'withdraw' | 'arrhythmia';

export interface PersonaSpec {
  key: PersonaKey;
  temper: Temper;
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
  /** ⑤ 的「±」：响应方向也随机，可能伸也可能缩 */
  gainSigned: boolean;
  /** ⑥ 自发运动间隔（秒） */
  spont: Range;
  /** ⑥′ 人在时的自发运动间隔；null = 不变。热情人在时更密，回避人在时几乎不动（僵住） */
  spontPresent: Range | null;
  /** ⑦ 声音基频（Hz） */
  voiceFreq: Range;
  /** ⑧ 声音占空比 */
  voiceDuty: Range;
  /** ⑨ 朝向变化间隔（秒） */
  orient: Range;
  /** ⑨′ 人在时的朝向间隔（秒）；null = 同 ⑨。热情盯着人、回避一直提防：人在时隔两三秒就重新决定一次朝哪 */
  orientPresent: Range | null;
  /** ⑩ 朝向偏向人的概率 */
  toward: number;
  /** ⑩′ 不朝人时：random 随便看 / away 背向人 */
  otherwise: 'random' | 'away';
  /** ⑪ 惊吓阈值（刺激强度 I 超过它就是惊吓） */
  startle: Range;
  /** ⑫ 死亡方式与时长（秒） */
  death: { kind: DeathKind; dur: number; zh: string };
  /**
   * ⑬ 对人的趋避（−1…+1，乘人有多近）：+ = 人来了张开、臂朝人那边抬、出声多；− = 收拢、臂往下背着人缩、
   * 呼吸浅快、触须收起发抖、不出声、更容易受惊、转身快；0 = 不受影响。`stanceSigned` 时取 ±区间、每次重新决定朝向时重抽。
   */
  stance: Range;
  stanceSigned: boolean;
  /** ⑭ 人走后多久恢复（秒；趋避姿态回落的时间常数） */
  settle: Range;
  /** 区间值怎么抽：uniform 均匀；extremes 偏向两端（乱序随机：忽快忽慢、忽深忽浅，少有中间值） */
  spread: 'uniform' | 'extremes';
}

const one = (v: number): Range => [v, v];

export const PERSONAS: Readonly<Record<PersonaKey, PersonaSpec>> = {
  A: {
    key: 'A',
    temper: 'warm',
    zh: '热情',
    en: 'Warm',
    breathPeriod: one(2),
    breathAmp: one(0.8),
    speed: one(3),
    latency: one(0.2),
    gain: one(0.5),
    gainSigned: false,
    spont: [3, 5],
    spontPresent: [2, 4],
    voiceFreq: [800, 1200],
    voiceDuty: one(0.7),
    orient: [5, 8],
    orientPresent: [2, 4],
    toward: 0.9,
    otherwise: 'random',
    startle: one(0.8),
    death: { kind: 'turn', dur: 90, zh: '精力渐尽，最后朝向人停下' },
    stance: one(1),
    stanceSigned: false,
    settle: one(3),
    spread: 'uniform',
  },
  B: {
    key: 'B',
    temper: 'calm',
    zh: '沉静',
    en: 'Calm',
    breathPeriod: one(7),
    breathAmp: one(0.5),
    speed: one(0.5),
    latency: one(2.5),
    gain: one(0.1),
    gainSigned: false,
    spont: [20, 30],
    spontPresent: null,
    voiceFreq: [150, 300],
    voiceDuty: one(0.25),
    orient: [30, 45],
    orientPresent: null,
    toward: 0.4,
    otherwise: 'random',
    startle: one(0.95),
    death: { kind: 'quiet', dur: 120, zh: '安静慢慢停下' },
    stance: one(0),
    stanceSigned: false,
    settle: one(4),
    spread: 'uniform',
  },
  C: {
    key: 'C',
    temper: 'avoidant',
    zh: '回避',
    en: 'Avoidant',
    breathPeriod: one(3),
    breathAmp: one(0.3),
    speed: one(2),
    latency: one(0.3),
    gain: one(0.4),
    gainSigned: false,
    spont: [10, 16],
    spontPresent: [30, 45],
    voiceFreq: [1000, 1400],
    voiceDuty: one(0.1),
    orient: [8, 12],
    orientPresent: [1.5, 3],
    toward: 0.05,
    otherwise: 'away',
    startle: one(0.25),
    death: { kind: 'withdraw', dur: 90, zh: '背过身慢慢停下' },
    stance: one(-1),
    stanceSigned: false,
    settle: one(15),
    spread: 'uniform',
  },
  D: {
    key: 'D',
    temper: 'random',
    zh: '乱序随机',
    en: 'Random',
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
    orientPresent: null,
    toward: 0.5,
    otherwise: 'away',
    startle: [0.2, 0.9],
    death: { kind: 'arrhythmia', dur: 60, zh: '节律紊乱后渐弱' },
    stance: [0.4, 1],
    stanceSigned: true,
    settle: [2, 20],
    spread: 'extremes',
  },
};

/**
 * 变异性（盘点 §9.2 行为杠杆「同刺激每次略不同，参数加噪声」）：表里的单值当均值，
 * 每次取用时加这么大的均匀噪声。区间值本身就是每次重抽，不再加。手感常量，待拍板。
 */
export const VARIABILITY = {
  /** 呼吸周期与幅度：每次呼吸 ±4% */
  breath: 0.04,
  /** 响应延迟与强度：每次响应 ±15% */
  response: 0.15,
} as const;

/**
 * 从一项参数取一个值：区间抽一次（extremes = 偏向两端：u 均匀、x = lo + (hi−lo)·sin²(πu/2)，两端密、中间疏，
 * 耗的随机数与均匀一样多）；单值加 ±jitter 相对噪声（jitter=0 时不耗随机数）
 */
export function sampleRange(r: Rng, range: Range, jitter = 0, extremes = false): number {
  const [lo, hi] = range;
  if (lo === hi) return jitter > 0 ? lo * (1 + uniform(r, -jitter, jitter)) : lo;
  if (!extremes) return uniform(r, lo, hi);
  const s = Math.sin((Math.PI / 2) * rand(r));
  return lo + (hi - lo) * s * s;
}

/** 区间中值（不耗随机数；时间常数之类只要一个代表值的地方用） */
export const midOf = (range: Range): number => (range[0] + range[1]) / 2;

/** 呈现顺序合法：恰好四个、A–D 各一次（09-09：四套固定、跨被试平衡顺序） */
export function isPersonaOrder(order: readonly unknown[]): order is readonly PersonaKey[] {
  if (order.length !== PERSONA_KEYS.length) return false;
  return PERSONA_KEYS.every((k) => order.filter((o) => o === k).length === 1);
}
