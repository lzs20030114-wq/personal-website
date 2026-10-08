/**
 * 事件词表（轮回机器_行为引擎spec.md §3）。九类传感事件按 spec 提案，用户 2026-10-07 拍板。
 *
 * 一类事件 = 一种对行为有独立意义的物理刺激，且能从六路输入里的某一路单独判出来。
 * 抓握四态与生命阶段是引擎自己产生的派生事件，不占九类名额（§3.3）。
 * 第六路「内部时钟」不产生传感事件——它驱动生命周期（life.ts）。
 *
 * 引擎只认事件：物理信号怎么洗成事件（四组自干扰的屏蔽）是传感前端 / 固件的事（§3.4）。
 */

export const SENSOR_KINDS = [
  'PRESENCE',
  'FEELER_TOUCH',
  'SHELL_STROKE',
  'SHELL_HOLD',
  'LIFT',
  'KNOCK',
  'SOUND',
  'ARM_TOUCH',
  'RESISTANCE',
  'HAND',
] as const;
export type SensorKind = (typeof SENSOR_KINDS)[number];

/** 在场档位：离场 / 远 / 中 / 近（超声测距） */
export type PresenceBand = 'gone' | 'far' | 'mid' | 'near';
export const PRESENCE_BANDS: readonly PresenceBand[] = ['gone', 'far', 'mid', 'near'];
/** 档位边界（米）：远 > 1.5 m，近 < 0.6 m，其间为中（spec §3.2） */
export const PRESENCE_EDGES = { far: 1.5, near: 0.6 } as const;

export type Side = 'L' | 'R';
export type ShellTouch = 'pat' | 'stroke' | 'poke';

/**
 * 一条传感事件。字段即载荷，日志原样记下（kind 除外）。
 *
 * - PRESENCE 的 bearing（世界系 rad，0 = 机器的正前方，逆时针为正）**可选**：
 *   HC-SR04 只测距、测不出方位；只有测距头装在偏航平台上随机身转时，前端才能把
 *   「测到人那一刻机身朝哪」当方位报上来。网页面板直接给。
 * - ARM_TOUCH / RESISTANCE 带 on：抓握真值表（T-0707-1）要的是电平，不是脉冲。
 * - HAND（第十类，**可选**，2026-10-07 Lab 1-6 加）：人的手在哪、臂要怎么弯才碰得到它。网页上是鼠标指针，
 *   真机对应臂端的近距传感（spec §3.2 P2-b 那一类）。不是刺激本身（强度 0；人走近仍是 PRESENCE），
 *   引擎拿它决定看不看见、迎上去还是躲开。几何由前端算好：bearing 世界系 rad、dist 离电机轴的水平距离 mm、
 *   face 要让臂对准手机身该朝哪（世界系 rad；臂不在机身中线上）、aimDir 臂要弯向哪（腱系，0 = 上、左为正）、
 *   aimBend 要弯多少（bend 单位，> 1 = 满差动也够不着）、aimDist 手离臂基座多远 mm。
 * - ARM_TOUCH 的 by（可选，2026-10-07 加）：'arm' = 是臂伸过来碰到了不动的手（手没动），强度按轻抚算
 *   （不至于每次自己碰到手就惊跳）；'hand' 或不写 = 手伸过来碰臂，强度照旧。
 */
export type SensorInput =
  | { kind: 'PRESENCE'; band: PresenceBand; bearing?: number }
  | { kind: 'FEELER_TOUCH'; feeler: 0 | 1; side: Side }
  | { kind: 'SHELL_STROKE'; half: Side; touch: ShellTouch }
  | { kind: 'SHELL_HOLD'; half: Side | 'both'; on: boolean }
  | { kind: 'LIFT'; lifted: boolean }
  | { kind: 'KNOCK'; intensity: number }
  | { kind: 'SOUND'; level: number }
  | { kind: 'ARM_TOUCH'; on: boolean; by?: 'hand' | 'arm' }
  | { kind: 'RESISTANCE'; on: boolean }
  | { kind: 'HAND'; on: false }
  | {
      kind: 'HAND';
      on: true;
      bearing: number;
      dist: number;
      face: number;
      aimDir: number;
      aimBend: number;
      aimDist: number;
      /** 以下三个只有动作词汇 v2 的台架才带（v1 日志一字不变）：此刻的有效碰到半径 mm、指针已静止多少秒（≤ 9.9）、指针速度 mm/s */
      touch?: number;
      still?: number;
      v?: number;
    };

/** 刺激强度 I ∈ [0,1]：与人格的惊吓阈值比（I > 阈值 = 惊吓，§4.2） */
export const INTENSITY = {
  /** 人走近一档 */
  approach: 0.2,
  feeler: 0.4,
  pat: 0.3,
  stroke: 0.1,
  poke: 0.6,
  hold: 0.2,
  lift: 0.7,
  arm: 0.4,
  /** 臂自己伸过去碰到不动的手（ARM_TOUCH by: 'arm'）：按轻抚算，低于所有人格的惊吓阈值（待拍板） */
  armReach: 0.1,
} as const;

const BAND_RANK: Record<PresenceBand, number> = { gone: 0, far: 1, mid: 2, near: 3 };

/** 米 → 档位（null = 没测到人） */
export function bandOf(dist: number | null): PresenceBand {
  if (dist === null || !Number.isFinite(dist)) return 'gone';
  if (dist < PRESENCE_EDGES.near) return 'near';
  if (dist > PRESENCE_EDGES.far) return 'far';
  return 'mid';
}

/** b 是否比 a 近（走近才算刺激；退远、离场只更新状态） */
export function isCloser(b: PresenceBand, a: PresenceBand): boolean {
  return BAND_RANK[b] > BAND_RANK[a];
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** 刺激强度。prevBand = 引擎记着的上一档（PRESENCE 只在走近时有强度） */
export function intensityOf(e: SensorInput, prevBand: PresenceBand): number {
  switch (e.kind) {
    case 'PRESENCE':
      return isCloser(e.band, prevBand) ? INTENSITY.approach : 0;
    case 'FEELER_TOUCH':
      return INTENSITY.feeler;
    case 'SHELL_STROKE':
      return INTENSITY[e.touch];
    case 'SHELL_HOLD':
      return e.on ? INTENSITY.hold : 0;
    case 'LIFT':
      return e.lifted ? INTENSITY.lift : 0;
    case 'KNOCK':
      return clamp01(e.intensity);
    case 'SOUND':
      return clamp01(e.level);
    case 'ARM_TOUCH':
      return e.on ? (e.by === 'arm' ? INTENSITY.armReach : INTENSITY.arm) : 0;
    case 'RESISTANCE':
    case 'HAND':
      return 0;
  }
}

const isSide = (v: unknown): v is Side => v === 'L' || v === 'R';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isUnit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** 外来事件（台架面板 / 日志回放 / 将来的串口）进引擎前的形状检查 */
export function isSensorInput(x: unknown): x is SensorInput {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  switch (e.kind) {
    case 'PRESENCE':
      return (
        PRESENCE_BANDS.includes(e.band as PresenceBand) &&
        (e.bearing === undefined || (typeof e.bearing === 'number' && Number.isFinite(e.bearing)))
      );
    case 'FEELER_TOUCH':
      return (e.feeler === 0 || e.feeler === 1) && isSide(e.side);
    case 'SHELL_STROKE':
      return isSide(e.half) && (e.touch === 'pat' || e.touch === 'stroke' || e.touch === 'poke');
    case 'SHELL_HOLD':
      return (isSide(e.half) || e.half === 'both') && isBool(e.on);
    case 'LIFT':
      return isBool(e.lifted);
    case 'KNOCK':
      return isUnit(e.intensity);
    case 'SOUND':
      return isUnit(e.level);
    case 'ARM_TOUCH':
      return isBool(e.on) && (e.by === undefined || e.by === 'hand' || e.by === 'arm');
    case 'RESISTANCE':
      return isBool(e.on);
    case 'HAND':
      if (e.on === false) return true;
      return (
        e.on === true &&
        [e.bearing, e.dist, e.face, e.aimDir, e.aimBend, e.aimDist].every(isFiniteNum) &&
        (e.dist as number) >= 0 &&
        (e.aimBend as number) >= 0 &&
        (e.aimDist as number) >= 0 &&
        [e.touch, e.still, e.v].every((x) => x === undefined || (isFiniteNum(x) && x >= 0))
      );
    default:
      return false;
  }
}

/** 事件载荷（日志用）：去掉 kind，其余字段按定义顺序原样保留 */
export function sensorPayload(e: SensorInput): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(e)) {
    if (k !== 'kind' && v !== undefined) out[k] = v as string | number | boolean;
  }
  return out;
}

/**
 * 04-03 触碰编码表（T-0403-7，人的八种触碰）→ 九类事件。spec §3.1 的覆盖核对：
 * 八种都落得进九类，没有漏项。T-post-mortem 不是另一种物理刺激，而是「死后的触碰」——
 * 同一类事件发生在 BLANK 段，由日志里的 phase 字段区分。
 */
export const TOUCH_CODES: Record<string, SensorInput> = {
  'T-stroke': { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' },
  'T-pat': { kind: 'SHELL_STROKE', half: 'L', touch: 'pat' },
  'T-poke': { kind: 'SHELL_STROKE', half: 'L', touch: 'poke' },
  'T-hold': { kind: 'SHELL_HOLD', half: 'both', on: true },
  'T-cradle': { kind: 'LIFT', lifted: true },
  'T-push': { kind: 'KNOCK', intensity: 0.6 },
  'T-restrain': { kind: 'SHELL_HOLD', half: 'both', on: true },
  'T-post-mortem': { kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' },
};

/** 引擎自己产生的事件（日志 src = 'engine'），与传感事件同一条流 */
export const ENGINE_EVENTS = [
  'RESPONSE',
  'RESPONSE_DROP',
  'STARTLE',
  'REFLEX',
  'SPONTANEOUS',
  'ORIENT',
  'GRASP_START',
  'GRASP_HOLD_HUMAN',
  'GRASP_HOLD_OBJECT',
  'GRASP_EMPTY',
  'GRASP_LOST',
  'RELEASE_DONE',
  /** 手碰臂时正忙，手一直没离开：机器空下来补认一次（带强度与去向，to 指回那次触碰） */
  'CONTACT',
  /** 看见手 / ⑨ 到点重新决定：mode = toward 迎 / away 躲 / look 看别处，again = 是不是重新决定，cause = startle：被手吓到后改的态度（不抽随机数） */
  'HAND_SEEN',
  /** 看见过的手不见了：reason = gone 离开 / unseen 出了视野太久 */
  'HAND_LOST',
  /**
   * 迎手链（动作词汇 v2 才有，2026-10-08）：stage = 阶段（track 陪着 · approach 凑 · strain 够不着 · watch 看着 ·
   * wrap 缠 · hold 握 · chase 追 · release 放开 · search 找 · avoid 侧身躲 · off），beat = 这一拍的名字（transport、
   * hover、pounce、seat、lunge、peek…）
   */
  'HAND_STAGE',
  'LIFE_BIRTH',
  'LIFE_GROW',
  'LIFE_AGE',
  'LIFE_DEATH_START',
  'LIFE_DEATH',
  'SESSION_END',
] as const;
export type EngineEvent = (typeof ENGINE_EVENTS)[number];

/**
 * 台架操作（日志 src = 'operator'，M2 加）：不是刺激、不进行为，只为让导出的日志看得出
 * 哪一段是加速跑的、哪一段是被跳过的。RATE {rate} = 改生命钟倍率；SKIP {from} = 跳到下一段。
 */
export const OPERATOR_EVENTS = ['RATE', 'SKIP'] as const;
export type OperatorEvent = (typeof OPERATOR_EVENTS)[number];

/**
 * 传感事件的去向（记在该条传感记录上）：
 * respond = 排进响应（RESPONSE 晚 τ 秒出现，to 指回本条）· startle = 惊吓 ·
 * busy = 响应位被占（已有待发 / 正在做的响应或惊吓）· muted = 此刻不响应（诞生头 20 s、死亡、空白）·
 * none = 不是刺激（强度 0：退远、松手、电平落下……只更新状态）
 */
export type Outcome = 'respond' | 'startle' | 'busy' | 'muted' | 'none';
