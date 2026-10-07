/**
 * 抓握状态机（轮回机器_行为引擎spec.md §3.5；真值表 = 2026-07-07 的 T-0707-1）。
 *
 * 欠驱动臂「机械开环执行缠绕，传感只回答何时开始 / 何时停 / 抓的是人还是物」：
 * 引擎决定什么时候开始缠（被人碰到臂、且这一刻愿意回应），张力开关与臂电极决定抓到了什么。
 *
 * | 张力开关 | 臂电极 | 判定 | 动作 |
 * |---|---|---|---|
 * | ✓ | ✓ | HOLD_HUMAN | 社交握持：极轻，随时可拔出 |
 * | ✓ | ✗ | HOLD_OBJECT | 保持握住 |
 * | 走到限位仍 ✗ | — | EMPTY | 松开，然后搜寻或表达困惑（按人格） |
 * | 握持中张力消失 | — | LOST | 追一下还是放弃（按人格） |
 *
 * 表里没写「走到限位、无张力、电极 ✓」（手碰着臂但没被缠住）：按没抓到处理（EMPTY）——
 * 没有张力就是什么也没握住。按人格的追 / 放弃与搜寻次数也是引擎的提案，spec §10 待拍板。
 */

import type { PersonaKey } from './persona';
import { type Rng, chance, rand } from './rng';

export type GraspPhase = 'IDLE' | 'WRAP' | 'HOLD_HUMAN' | 'HOLD_OBJECT' | 'RELEASE';

export interface GraspSense {
  /** 惰轮微动开关：收线遇阻 */
  tension: boolean;
  /** 臂电极：碰着的是人 */
  electrode: boolean;
  /** 缠绕已走到限位 */
  atLimit: boolean;
}

export type GraspVerdict = 'HOLD_HUMAN' | 'HOLD_OBJECT' | 'EMPTY' | null;

/** 真值表 T-0707-1。null = 还在缠，继续 */
export function graspVerdict(s: GraspSense): GraspVerdict {
  if (s.tension) return s.electrode ? 'HOLD_HUMAN' : 'HOLD_OBJECT';
  if (s.atLimit) return 'EMPTY';
  return null;
}

/** 抓握的手感常量（臂弯曲量是差动幅度的分数，见 engine 的 ActuatorTargets.arm） */
export const GRASP = {
  /** 从静息缠到限位的时长（秒，速度系数 k_v = 1 时；实际 ÷ √k_v） */
  wrap: 3,
  /** 松开回静息的时长（秒，同上） */
  release: 1.5,
  /** 死亡时松手慢这么多倍——「失控而非告别」 */
  deathRelease: 2,
  /** 限位处的弯曲 */
  limit: 0.95,
  /** 握人：极轻 */
  human: 0.35,
  /** 握物：至少这么紧 */
  object: 0.6,
  /** 脱手后最多追几次 */
  maxChases: 1,
} as const;

export type LostReaction = 'chase' | 'giveUp';

/** 握持中脱手：活力 / 好奇追，沉静放弃，不稳定随机 */
export function lostReaction(key: PersonaKey, r: Rng): LostReaction {
  if (key === 'A' || key === 'C') return 'chase';
  if (key === 'B') return 'giveUp';
  return chance(r, 0.5) ? 'chase' : 'giveUp';
}

/** 抓空后搜寻几次：好奇 2、活力 1、沉静 0、不稳定 0–2 */
export function emptySearches(key: PersonaKey, r: Rng): number {
  switch (key) {
    case 'A':
      return 1;
    case 'B':
      return 0;
    case 'C':
      return 2;
    case 'D':
      return Math.floor(rand(r) * 3);
  }
}
