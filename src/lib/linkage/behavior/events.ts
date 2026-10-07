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
 */
export type SensorInput =
  | { kind: 'PRESENCE'; band: PresenceBand; bearing?: number }
  | { kind: 'FEELER_TOUCH'; feeler: 0 | 1; side: Side }
  | { kind: 'SHELL_STROKE'; half: Side; touch: ShellTouch }
  | { kind: 'SHELL_HOLD'; half: Side | 'both'; on: boolean }
  | { kind: 'LIFT'; lifted: boolean }
  | { kind: 'KNOCK'; intensity: number }
  | { kind: 'SOUND'; level: number }
  | { kind: 'ARM_TOUCH'; on: boolean }
  | { kind: 'RESISTANCE'; on: boolean };

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
      return e.on ? INTENSITY.arm : 0;
    case 'RESISTANCE':
      return 0;
  }
}

const isSide = (v: unknown): v is Side => v === 'L' || v === 'R';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
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
    case 'RESISTANCE':
      return isBool(e.on);
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
  'LIFE_BIRTH',
  'LIFE_GROW',
  'LIFE_AGE',
  'LIFE_DEATH_START',
  'LIFE_DEATH',
  'SESSION_END',
] as const;
export type EngineEvent = (typeof ENGINE_EVENTS)[number];

/**
 * 传感事件的去向（记在该条传感记录上）：
 * respond = 排进响应（RESPONSE 晚 τ 秒出现，to 指回本条）· startle = 惊吓 ·
 * busy = 响应位被占（已有待发 / 正在做的响应或惊吓）· muted = 此刻不响应（诞生头 20 s、死亡、空白）·
 * none = 不是刺激（强度 0：退远、松手、电平落下……只更新状态）
 */
export type Outcome = 'respond' | 'startle' | 'busy' | 'muted' | 'none';
