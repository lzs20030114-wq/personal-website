/**
 * 行为引擎（轮回机器_行为引擎spec.md §2、§4–§7）。
 *
 * 传感事件 → 人格参数 × 生命阶段 × 内部状态 → 执行器指令，同一条事件流写成实验日志。
 * 零 DOM、零依赖（只用站内两件纯函数装备：motion.dampStep 与 fixed-step）；
 * 状态是一块纯数据（EngineState），可整块快照 / 恢复——跨路由交接与将来的固件对照都靠它。
 *
 * 时间只认仿真秒，定步 1/60 s。同种子 + 同事件序列 ⇒ 执行器指令逐位相同、日志逐字相同。
 *
 * 两只钟（spec §5.5，M2 定）：**动作钟**是仿真秒——呼吸、动作、自发与转向的节奏都按它走；
 * **生命钟**只管一世里各段的时长，可按 `lifeRate` 倍率加快（台架「生命时钟」档：×10 时一世
 * 约 50 秒，呼吸仍是真实节律）。倍率 1 = 实验口径，与 M1 逐位相同。不能用「把 dt 乘上倍数」
 * 去加速：那会让呼吸也快几十倍，曲柄与观众都跟不上。
 *
 * 分层（spec §6.1）：引擎给的是**抽象指令**，与具体机构无关——
 *   呼吸给「行程分数 s」（0 全开 / 1 折叠），曲柄台架把它换成曲柄角、齿条实物换成齿条位置；
 *   臂给「张力 / 弯曲量 / 弯向」，台架按肌腱标定（预张力 0.34、差动 0.34）换成三腱收缩率；
 *   触须给舵机基角，反射（受惊甩开）只给触发时刻与方向，波形住在执行层（startleSwing）。
 *
 * 不在本引擎里的东西（spec §1.2）：「交互加速死亡」——搁置，没有开关、没有字段；
 * 衰老曲线——占位斜坡（life.ts）；自干扰屏蔽——传感前端的事。
 */

import { consumeFixedSteps } from '../fixed-step';
import { type DampState, dampStep } from '../motion';
import { INTENSITY, type Outcome, type PresenceBand, type SensorInput, type SensorKind, intensityOf, sensorPayload } from './events';
import { GRASP, type GraspPhase, emptySearches, graspVerdict, lostReaction } from './grasp';
import { type AgeFactors, DEATH_ACTIVITY_MIN, type DeathFrame, LIFE, type Phase, ageing, deathFrame } from './life';
import { type LogHeader, type LogRecord, type LogValue, sessionHeader } from './log';
import {
  PERSONAS,
  PERSONA_KEYS,
  type PersonaKey,
  type PersonaSpec,
  VARIABILITY,
  isPersonaOrder,
  sampleRange,
} from './persona';
import { type Cues, type Phase as ProgPhase, type Pose, type Program, startProgram, stepProgram, totalDur } from './programs';
import { type Rng, chance, deriveSeed, makeRng, pick, uniform } from './rng';
import {
  type BuildCtx,
  D_DEEP_SPAN,
  type RegKind,
  type RespKind,
  STARTLE_PRE,
  type SpontKind,
  type Variant,
  V2,
  buildNotice,
  buildRegister,
  buildResponse,
  buildSettle,
  buildSpont,
  buildStartle,
  dOf,
  nearestAxisDir,
  tierSpeed,
} from './vocab2';
import {
  type ApproachBeat,
  type ChaseBeat,
  type EmptyKind,
  HC,
  type HandGeom,
  approachPlan,
  avoidPose,
  buildApproachBeat,
  buildChaseBeat,
  buildCringe,
  buildEmpty,
  buildGiveUp,
  buildHop,
  buildLeanIn,
  buildPeek,
  buildRecoil,
  buildRelief,
  buildSearch,
  buildShrink,
  buildSnap,
  buildStrain,
  buildTake,
  buildWrap,
  chasePlan,
  cinchCount,
  dwellOf,
  epsOf,
  flatH,
  gainAt,
  holdCue,
  holdDrive,
  holdEventDur,
  holdEventMm,
  hopTarget,
  hoverMinOf,
  poseDist,
  reachable,
  squeezePhase,
  standOf,
  stillOf,
  strainTries,
} from './vocab2-hand';

/** 定步频率 */
export const HZ = 60;
export const DT = 1 / HZ;
/** 「永不」：状态要能 JSON 化，不用 Infinity */
const NEVER = 1e9;
const TAU = 2 * Math.PI;

/** 内部状态与通道之间的手感常量（spec §4.2–§4.3，均待拍板） */
export const ENGINE = {
  /** 呼吸中心（行程分数，0 全开 / 1 折叠） */
  center: 0.5,
  /** 呼吸幅度、呼吸中心的跟随器角频率（rad/s）。中心要快：惊吓那一缩不能拖 */
  ampOmega: 2,
  centerOmega: 4,
  /**
   * 唤醒度（内部状态层「快速波动」，03-20）：每次刺激 += gain·I（封顶 1），按 tau 秒指数回落。
   * 作用三处：呼吸周期 ×(1 − breath·a)、自发间隔 ×(1 − spont·a)、触须扫幅 ×(1 + feeler·a)。
   */
  arousal: { gain: 0.5, tau: 15, breath: 0.3, spont: 0.4, feeler: 0.5 },
  /** 参考速度（cm/s，= 好奇型）：速度系数 k_v = v / 1.5 */
  speedRef: 1.5,
  /** 响应强度归一：|g| / 0.5（表里最大 50%）；下限让最弱的响应也看得见 */
  gainRef: 0.5,
  gainFloor: 0.15,
  /** 惊吓是反射：固定延迟，不吃人格的响应延迟 */
  startleLatency: 0.1,
} as const;

/** 动作的手感常量（待拍板）。时长按 k_v = 1 给，实际 ÷ √k_v（惊吓除外：反射不随性格） */
export const MOTION = {
  response: 2.5,
  startle: 2,
  curl: 3,
  sway: 4,
  flick: 1.5,
  /** 动作时长上下限（秒） */
  durMin: 0.6,
  durMax: 12,
  /** 响应一次最多转多少（rad）：手还搭在壳上时别把机身一下转走 */
  turnMax: 0.8,
  /** 臂的静息弯曲（差动幅度分数）与弯向漂移（rad/s × k_v）——「不要直挺挺地伸着」 */
  restBend: 0.25,
  restDrift: 0.06,
  /** 臂、偏航跟随器角频率（rad/s，× √k_v）；触须基角跟随器（只为接缝处不跳） */
  armOmega: 2.5,
  yawOmega: 1.2,
  /**
   * 偏航角速度上限（rad/s，× √k_v；惊吓时 ×3）。目标一次可能跳近一整圈，光靠跟随器
   * 峰值会到 ~4 rad/s，旋转平台转不了这么快；先让「目标」限速移动，跟随器再把它磨圆。
   */
  yawRate: 0.6,
  yawRateStartle: 3,
  feelerOmega: 20,
  /** 触须待机扫动（与编排档 SMALLARM_IDLE 同值起步）与动作抖动 */
  feelerAmp: 0.32,
  feelerFreq: 0.5,
  flickAmp: 0.35,
  flickFreq: 1.2,
  /** 触须基角上限（与 SMALLARM_STARTLE.max 同值：75°） */
  feelerMax: (75 * Math.PI) / 180,
  /** 反射不应期（秒）：同一条触须这么久内不重复触发 */
  reflexRefractory: 0.8,
  /** 叹气：下一次呼吸幅度 ×1.4、周期 ×1.3 */
  sighAmp: 1.4,
  sighPeriod: 1.3,
  /** 响应 / 惊吓时的短促发声（秒） */
  voiceBurst: 0.4,
  /** 惊吓：弯曲、呼吸中心往折叠端一缩（× I）、转开多少（rad） */
  flinchBend: 0.8,
  flinchPush: 0.3,
  flinchTurn: 0.5,
  /** 臂弯向：0 = 腱 0（臂梢朝上，伸 / 迎），π = 朝下（缩 / 垂） */
  up: 0,
  down: Math.PI,
  /** 响应 / 自发弯向的随机散布（rad） */
  dirSpread: 0.6,
} as const;

/**
 * 手（HAND，Lab 1-6 鼠标 = 人的手，2026-10-07）：看见、决定、跟踪的手感常量（均待拍板）。
 * 人格表里的数一个不改——看见要过 ④ 响应延迟，重新决定按 ⑨ 朝向间隔，迎 / 躲按 ⑩。
 * 距离一律 mm：dist = 离电机轴的水平距离，aimDist = 离臂基座的距离（臂长 L ≈ 358）。
 */
export const HAND = {
  /** 视野半角（rad）：手进了机身朝向 ±120° 才开始「看」；正在看 / 看见了以后放宽到 ±130°（边上不闪） */
  fov: (2 * Math.PI) / 3,
  fovKeep: (130 * Math.PI) / 180,
  /** 手出了视野（或离开画布）多久算丢（秒）；这段时间里回来接着原来的态度，不重新决定 */
  loseAfter: 3,
  /** 手在机身上方（离电机轴这么近，mm）：那是在摸壳，不转身、不去够 */
  bodyR: 320,
  /** 臂长（mm，静息弦长；与台架 ARM_GEOM.length 同值，守门里核） */
  armL: 357.5,
  /**
   * 分层转向（迎）：臂够得着（aimBend ≤ 1 且离基座 ≤ 1.3 L）就只动臂；够不着、或偏出 20° 又在臂长以外，
   * 才转身；转到偏差 4° 以内停。躲：偏出 20° 就转，4° 停。
   */
  turnAt: (20 * Math.PI) / 180,
  settle: (4 * Math.PI) / 180,
  reachBend: 1,
  reachFar: 1.3,
  /** 取近路：方位差超过 150° 时锁定转的方向（不因手抖来回掉头），回到 90° 以内解锁 */
  antipode: (150 * Math.PI) / 180,
  unlock: Math.PI / 2,
  /** ±π 行程：越限不到 60° 停在限位等，超过才绕回去（记一条 ORIENT unwind） */
  unwindAt: Math.PI / 3,
  /** 臂去够手的权重：离基座 ≤ 1.2 L 满、≥ 2.5 L 归零 */
  reachNear: 1.2,
  reachZero: 2.5,
  /** 够手的姿态上叠一点静息的晃动与随呼吸的起伏，不像炮塔 */
  wobble: 0.4,
  breathe: 0.04,
  /** 躲：背着手弯，离得越近弯得越多（bend 从 awayMin 到 awayMin + awaySpan；离电机轴 near → far 减弱）；
   *  手就在臂梢上（aimBend 很小，方向不准）时往下缩 */
  awayMin: 0.35,
  awaySpan: 0.55,
  awayNear: 500,
  awayFar: 1200,
  awayDirAt: 0.15,
  /** 看见那一下（秒 ÷ √k_v）：迎 = 先轻轻一伸，躲 = 往回一缩，看别处 = 瞥一眼 */
  notice: 0.9,
  noticeBend: 0.5,
  noticeBreath: 0.15,
  noticePush: 0.1,
  /** 看别处：相对当前朝向转 30–70°，转向背着手的那一侧 */
  lookMin: (30 * Math.PI) / 180,
  lookMax: (70 * Math.PI) / 180,
  /** 缠：弯向追着手转（rad/s × √k_v），缠过四成就定住 */
  wrapFollow: 1,
  wrapLock: 0.4,
  /** 握人时保住缠的形状（接触那一刻弯曲的这么多倍）——「极轻」是力小，不是松开；网页没有手指挡着，形状松了就读成放手 */
  holdKeep: 0.85,
  holdWrap: 0.5,
  /** 回应时朝手 / 背手的弯向散布（rad；没有手时是 MOTION.dirSpread） */
  dirSpread: 0.18,
  /** 迎的时候自发卷臂围着手的方向（± rad） */
  spontAround: 0.4,
} as const;

/**
 * 深缠的行程（执行器 arm.wrap = 1 时，差动在满差动之上再加的比例）：台架是 span 0.34 之上再加 0.16，
 * 差动封顶 0.5（再大两腱之间失稳，见 machine-behavior.ts 的 ARM_DRIVE）。引擎只在有手时用它：
 * 缠到底、握住时保住形状；没有手的会话 wrap 恒为 0，与改动前逐位相同。
 */
export const ARM_BEND_MAX = 1.47;

const AROUSAL_DECAY = Math.exp(-DT / ENGINE.arousal.tau);


// ------------------------------------------------------------------ 输出

export interface FeelerDrive {
  /** 舵机基角（rad）：待机扫动 + 动作抖动，已钳在 ±75° 内 */
  base: number;
  /**
   * 反射（受惊甩开）：t = 距触发的秒数（未触发 = Infinity；可为负 = 即将触发），
   * dir = 甩开方向（+1 朝 L 侧），gain = 强度系数。台架照旧合成
   * clampSwing(base + gain·startleSwing(t, dir))。
   */
  startle: { t: number; dir: 1 | -1; gain: number };
}

export interface ActuatorTargets {
  /** 呼吸：行程分数 s（0 全开 / 1 折叠），已是平滑轨迹 */
  breath: { s: number };
  /**
   * 臂：tone = 预张力 0–1（0 = 松弛无力），bend = 弯曲量（差动幅度分数）0–1，dir = 弯向（rad，腱系），
   * wrap = 满差动之上再卷深多少 0–1（抓握深缠、近处够手；执行层另给一段行程，见 ARM_BEND_MAX），
   * deep = 肌腱轴深卷 0–1（只有动作词汇 v2 给；弯向贴着腱轴时执行层才放开，见 machine-behavior.ts ARM_DRIVE.dDeep）
   */
  arm: { tone: number; bend: number; dir: number; wrap: number; deep?: number };
  feelers: [FeelerDrive, FeelerDrive];
  /** 机身朝向（世界系 rad，0 = 正前方），限在 ±π 内不缠线 */
  yaw: number;
  /** 灯（HUD 示意）：随呼吸张开变亮 */
  light: { level: number };
  /** 声音（HUD 示意）：呼气时发声，占空比与基频随人格 */
  sound: { on: boolean; f: number; duty: number; level: number };
}

export interface EngineStatus {
  t: number;
  life: number;
  persona: PersonaKey;
  phase: Phase;
  /** 本段已过 / 本段总长（生命秒；倍率 ≠ 1 时折成真实秒要 ÷ lifeRate） */
  phaseElapsed: number;
  phaseLen: number;
  lifeRate: number;
  arousal: number;
  vigor: number;
  grasp: GraspPhase;
  band: PresenceBand;
  done: boolean;
}

// ------------------------------------------------------------------ 状态

export type GestureAction = 'attend' | 'flinch' | 'curl' | 'sway' | 'flick' | 'search';

interface Gesture {
  kind: 'response' | 'startle' | 'spont';
  action: GestureAction;
  t0: number;
  dur: number;
  /** 臂弯向起止（sway / search 从 dir 扫到 dir2） */
  dir: number;
  dir2: number;
  /** 臂弯曲（0 = 不动臂） */
  bend: number;
  /** 触须抖动幅度 rad（0 = 不抖） */
  feeler: number;
  /** 呼吸幅度增量（+0.4 = 峰值处 ×1.4；负 = 收浅） */
  breath: number;
  /** 呼吸中心往折叠端推（惊吓） */
  push: number;
  /** 引起它的刺激 id（自发 = −1） */
  to: number;
}

interface Pending {
  due: number;
  at: number;
  id: number;
  kind: SensorKind;
  bearing: number | null;
  /** 动作词汇 v2 才记：刺激在哪一侧（+1 左 / −1 右 / 0）、什么摸法、强度与本次阈值（选回应的动词用） */
  side?: number;
  touch?: string;
  I?: number;
  th?: number;
  /** v2：潜伏期里已经「一缩」过（回应的日志里记一笔）；本次抽到的 τ（一缩会把 due 顺延，τ 不变） */
  wince?: boolean;
  tau?: number;
}

/**
 * 动作词汇 v2 的执行状态（2026-10-08 研究原型，轮回机器_触手与转向研究.md §8）。只有 vocab: 2 的会话有这一块；
 * v1 的状态里没有它，快照与改动前逐字相同。
 */
interface MotionV2 {
  /** 正在执行的动作程序（programs.ts）；null = 臂交回静息 / 手 / 抓握 */
  prog: Program | null;
  /**
   * 这个程序只放提示、不写臂：迎手链投入中起的回应 / 自发，或陪着 / 看着 / 躲时的触须抖。它照走时间线，
   * 起点却停在开始那一刻——手链一退出投入就接管臂会一帧跳过去，所以它到走完都不写臂（也不暂停手链）
   */
  progCue: boolean;
  /** 已经发过入口提示（叹气、转身、短促发声）的段号；−1 = 还没有 */
  seen: number;
  /** 肌腱轴深卷（直接交给执行层） */
  deep: number;
  /** 呼吸相位推进速率（1 照常、0 屏住）的跟随器 */
  rate: DampState;
  /** 两条触须的姿势偏移跟随器 */
  feel: [DampState, DampState];
  /** 短促发声的频率倍数（chirp 1.6、huff 0.8） */
  burstF: number;
  /**
   * 环身「猛收」0–1 的跟随器（快升 ω 10、慢放 ω 3）：输出 s → s + 猛收·(0.92 − s)。叠在呼吸输出上、不走呼吸中心——
   * 中心被「中心 ± 幅度/2 不出行程」夹着，活力型（幅度 0.8）原型里只收得动 +0.09
   */
  clench: DampState;
  /** 叠在输出上往收拢端推的量（行程分数；缩、忍、一缩）的跟随器 */
  push: DampState;
  /** 最近 12 s 内惊跳的时刻（再吓一次时深度递减、凝住减半；每世清零） */
  startles: number[];
  /** 惊跳「正忙」到何时：反射 + 凝住 + 恢复的第一段；之后的恢复里再超阈值 = 再缩一次，低于阈值 = 正忙 */
  startleBusy: number;
  /** 迎手链（2026-10-08 第八批，vocab2-hand.ts）：看见手以后的跟 · 凑 · 缠 · 握 · 脱手 · 躲。没有手时恒为 off */
  hc: HandChain;
  /** 臂余振观测器：差动平面 X / Y 各 [肌肉, 肌肉速度, 臂, 臂速度]，从自己的指令历史开环预测梢端停没停（固件同样能算） */
  obs: number[];
  /** 表情子流：只用于「怎么演」的抽样（τ、不稳定型的随机小动作），决策类抽样仍走主流——调表不改决策日志 */
  xr: Rng;
  /** 执行层放不放开肌腱轴深卷（台架 Lab 1-6 = true，与 tendonContractions(deep) 同口径；固件默认 false） */
  deepOk: boolean;
}

/** 迎手链的阶段 */
export type HcStage = 'off' | 'track' | 'approach' | 'strain' | 'watch' | 'wrap' | 'hold' | 'chase' | 'release' | 'avoid' | 'search';
/** 「投入中」：⑨ 顺延、自发动作只剩触须抖 / 叹气、别的回应只出提示不抢臂 */
const ENGAGED: ReadonlySet<HcStage> = new Set<HcStage>(['approach', 'strain', 'wrap', 'hold', 'chase', 'release', 'search']);

/** 迎手链的状态（纯数据；所有时刻是仿真秒，「永不」= NEVER） */
interface HandChain {
  stage: HcStage;
  /** 本阶段 / 本拍开始的时刻与拍名 */
  st0: number;
  beat: string;
  bt0: number;
  /** 凑 / 追里还没做的拍 */
  plan: string[];
  /** 手链自己的臂程序（与 m2.prog 分槽）与已发过入口提示的段号 */
  prog: Program | null;
  seen: number;
  /** 本回合抽到的 ④（表情子流）：take、停半拍、定住感觉等的长短 */
  tau: number;
  /** HAND 的 v2 字段：有效碰到半径 mm、指针开始静止的时刻、指针速度 mm/s 与最近一次读数的时刻 */
  touch: number;
  stillAt: number;
  v: number;
  vAt: number;
  /** 脱手前指针速度的近期峰值（0.3 s 内）与它的时刻 */
  pullV: number;
  pullT: number;
  /** 这一跳的目标（差动平面）：新目标离它超过 jump = 手猛挪，不等停稳就重跳 */
  tgtX: number;
  tgtY: number;
  /** 读数在差动平面上的位置、时刻与速度估计（活力型冲在手前面用） */
  ax: number;
  ay: number;
  at: number;
  vx: number;
  vy: number;
  /** 读数一步跳太大（被抽走）的时刻：握着时这一下不跟；手往外走的时刻 */
  jumpAt: number;
  outAt: number;
  /** 本回合的 ⑤（抽过没有 / 值） */
  gDrawn: boolean;
  g: number;
  /** 推过几下；这一拍程序走完的时刻（最后一拍走完要等臂落定才判「没碰到」） */
  nudges: number;
  beatEnd: number;
  /** 缠 / 握的基准：开缠那一刻的差动基准与当时的读数（握着跟手跟的是读数的变化，不是读数本身） */
  dBase: number;
  dhAt: number;
  /** 贴上那一段结束的时刻（catchT 的门） */
  seatEnd: number;
  /** 握：跟手的差动与弯向、握住以来的呼吸数、上一步的呼吸相位、控制器开始的时刻与起点姿态 */
  Dref: number;
  dirRef: number;
  breaths: number;
  lastPhi: number;
  holdT0: number;
  holdFrom: Pose | null;
  /** 握着时的小动静 / 小动作（squeeze / give / tug / loosen / palpate / freeze） */
  ev: { kind: string; t0: number } | null;
  /** 牵引开始的时刻（慢慢挪手）、微动反射的冷却 */
  tracT: number;
  reflexAt: number;
  /** 够不着：本手位武装了没有、武装参照（差动平面 + 离基座距离） */
  armed: boolean;
  refX: number;
  refY: number;
  refR: number;
  /** 最后碰到的那一点（搜寻中心） */
  lastD: number;
  lastDir: number;
  /** 抓空后还要搜几次 */
  searches: number;
  /** 躲：手在哪一侧（+1 = 手在机身左边）、当前收的姿态参照、离开多久 */
  side: number;
  close: number;
  awayDir: number;
  farSince: number;
  relieved: boolean;
  /** 放开后的重新武装：到这一刻可以再来；上一回合是不是抓空；本 ⑨ 用过没有 */
  rearmAt: number;
  emptyLast: boolean;
  rearmed: boolean;
  /** 臂先身后：偏航目标到这一刻才写 */
  turnAt: number;
  /** 握着被牵着走时转身慢一半 */
  yawSlow: boolean;
  /** 深卷：本轮累计秒数、冷却到何时、被预算收回的时刻（之后 1.3 s 平滑松到 0.48） */
  deepUsed: number;
  deepCool: number;
  deepOffAt: number;
  /** 握持控制器开始那一刻锁定的深卷模式（中途不再进深卷；离开窗口按预算用完处理） */
  holdDeep: boolean;
  /** 本阶段（追 / 握）记过绕回没有：只记一条 ORIENT unwind */
  unwindLogged: boolean;
}

const idleHand = (): HandChain => ({
  stage: 'off',
  st0: 0,
  beat: '',
  bt0: 0,
  plan: [],
  prog: null,
  seen: -1,
  tau: 0,
  touch: 32,
  stillAt: 0,
  v: 0,
  vAt: -1,
  pullV: 0,
  pullT: -1,
  tgtX: 0,
  tgtY: 0,
  ax: 0,
  ay: 0,
  at: -1,
  vx: 0,
  vy: 0,
  jumpAt: -1,
  outAt: -1,
  gDrawn: false,
  g: 0,
  nudges: 0,
  beatEnd: NEVER,
  dBase: 0,
  dhAt: 0,
  seatEnd: NEVER,
  Dref: 0,
  dirRef: 0,
  breaths: 0,
  lastPhi: 0,
  holdT0: NEVER,
  holdFrom: null,
  ev: null,
  tracT: NEVER,
  reflexAt: -NEVER,
  armed: true,
  refX: 0,
  refY: 0,
  refR: 0,
  lastD: 0,
  lastDir: 0,
  searches: 0,
  side: 1,
  close: 0,
  awayDir: 0,
  farSince: NEVER,
  relieved: false,
  rearmAt: NEVER,
  emptyLast: false,
  rearmed: false,
  turnAt: -NEVER,
  yawSlow: false,
  deepUsed: 0,
  deepCool: -NEVER,
  deepOffAt: NEVER,
  holdDeep: false,
  unwindLogged: false,
});

/**
 * 臂余振观测器的常数（研究笔记 §9.2；Lab 1-3 求解器上标的，真机要重标）：肌肉临界阻尼 ω 5，臂摆动模态
 * 周期 1.45 s、阻尼比 0.12（求解器阶跃响应拟合：过冲 26%、相邻同号峰比 0.45；综合方案原写 1.42 s / 0.15，
 * 预测停稳会早 0.6–1.8 s）。settled(ε) = 臂速度 < ε（差动/秒）且离指令 < 0.01
 */
export const OBS = { wm: 5, wa: (2 * Math.PI) / 1.45, za: 0.12, posTol: 0.01 } as const;

/** 观测器推进一步（指令 c = 差动平面上的 (x, y)） */
export function obsStep(o: number[], cx: number, cy: number, dt: number): void {
  const c = [cx, cy];
  for (let j = 0; j < 2; j++) {
    const i = 4 * j;
    o[i + 1] += (OBS.wm * OBS.wm * (c[j] - o[i]) - 2 * OBS.wm * o[i + 1]) * dt;
    o[i] += o[i + 1] * dt;
    o[i + 3] += (OBS.wa * OBS.wa * (o[i] - o[i + 2]) - 2 * OBS.za * OBS.wa * o[i + 3]) * dt;
    o[i + 2] += o[i + 3] * dt;
  }
}

/** 臂（按观测器）停稳了没有 */
export function obsSettled(o: readonly number[], cx: number, cy: number, ev: number): boolean {
  return Math.hypot(o[3], o[7]) < ev && Math.hypot(cx - o[2], cy - o[6]) < OBS.posTol;
}

/** 指令保持不变时，预计还要多久停稳（≤ max 秒；到 max 还没停就返回 max） */
export function obsForecast(o: readonly number[], cx: number, cy: number, ev: number, max = 1.5, dt = 1 / 60): number {
  const q = [...o];
  for (let t = 0; t < max; t += dt) {
    if (obsSettled(q, cx, cy, ev)) return t;
    obsStep(q, cx, cy, dt);
  }
  return max;
}

interface Reflex {
  /** 触发时刻（秒）；−1 = 没有 */
  t0: number;
  dir: 1 | -1;
  gain: number;
}

interface GraspMem {
  phase: GraspPhase;
  t0: number;
  dur: number;
  dir: number;
  /** 进入当前阶段时的弯曲（缠绕起点 / 松开起点） */
  from: number;
  /** 抓住那一刻的弯曲（握物至少这么紧）与深缠（有手时握住保住它） */
  contact: number;
  contactW: number;
  chases: number;
  searches: number;
  reason: string;
  /**
   * 「手指被卡住」的时刻（只有迎手链 v2 的缠写它：贴上做完、臂停稳的那一帧；初值永不）。台架此后才闭合张力开关；
   * 没有这个字段（现行）时照旧「缠到 60%」
   */
  catchT?: number;
}

/** 看见手以后的态度：迎 / 躲 / 看别处（⑩ 的「不朝人时随便看」） */
export type HandMode = 'toward' | 'away' | 'look';

interface HandMem {
  /** 最近一次传感读数（HAND 事件原样） */
  bearing: number;
  dist: number;
  aimDir: number;
  aimBend: number;
  aimDist: number;
  /** 要让臂对准手，机身该朝哪（世界系；「迎」转到这里） */
  face: number;
  /** 传感此刻读得到它（离开画布后留 loseAfter 秒的记忆，回来接着原来的态度） */
  present: boolean;
  goneAt: number;
  /** 看见了没有（没看见时机器不知道手在哪，只是传感层有读数） */
  seen: boolean;
  /** 看见以后的态度；没看见 = null */
  mode: HandMode | null;
  /** 什么时候「看见」（第一次进视野那一刻 + 响应延迟，只抽一次）；NEVER = 还没排 */
  noticeAt: number;
  /** 出视野的时刻（在视野里 = NEVER） */
  outSince: number;
  /** 最后一次在视野里时的方位：出了视野按它转，不偷看 */
  steer: number;
  /** 最后一次在视野里时「臂对准它」该有的朝向 */
  steerFace: number;
  /** 分层转向：正在转身对准（迎）/ 背过去（躲） */
  turning: boolean;
  /** 取近路：方位差过了 150° 以后锁定的转向（+1 / −1；0 = 没锁） */
  turnSign: number;
  /** 越过 ±π 限位那一侧，正在绕回去 */
  unwind: boolean;
}

/**
 * 状态格式版本（快照恢复时核对；v2 = M2 加生命钟；v3 = 手）。动作词汇 v2 的会话记 STATE_VERSION_V2（多一块 m2；
 * 4 → 5 = 迎手链：m2 多了 hc / obs / xr / deepOk，研究原型的 v4 快照不能恢复，台架接手失败会重开一场）
 */
export const STATE_VERSION = 3;
export const STATE_VERSION_V2 = 5;

/** 引擎的全部状态：纯数据，JSON 往返无损（快照 / 交接 / 固件对照） */
export interface EngineState {
  v: typeof STATE_VERSION | typeof STATE_VERSION_V2;
  seed: number;
  order: PersonaKey[];
  loop: boolean;
  /** 生命钟倍率（此刻）与开场时的倍率（会话头记它；中途改档另记 RATE 操作记录） */
  lifeRate: number;
  lifeRate0: number;
  tick: number;
  /** advance() 的余量 */
  rem: number;
  rng: Rng;
  /** 生命时间表专用子流：交互抽样再多也挪不动死亡时点 */
  sched: Rng;
  /** 本轮四世各自的衰老段长度（秒） */
  ageLens: number[];
  seq: number;
  life: number;
  phase: Phase;
  /** 本段已过的生命步数（每个定步 += lifeRate；倍率 1 时就是步数，与 M1 的 tick − phaseTick 逐位相同） */
  phaseLt: number;
  /** 本段总长（生命步数） */
  phaseLen: number;
  // 传感状态（电平）
  band: PresenceBand;
  /** 人的方位（世界系 rad）；null = 不知道 */
  bearing: number | null;
  electrode: boolean;
  tension: boolean;
  held: boolean;
  lifted: boolean;
  // 内部状态
  arousal: number;
  speedBase: number;
  speed: number;
  // 呼吸
  phi: number;
  period: number;
  ampBase: number;
  periodScale: number;
  sighNext: boolean;
  sighNow: boolean;
  amp: DampState;
  center: DampState;
  voiceF: number;
  voiceDuty: number;
  voiceUntil: number;
  voiceOn: boolean;
  // 臂
  armX: DampState;
  armY: DampState;
  restDir: number;
  tone: number;
  // 触须
  psi: number;
  feeler: [DampState, DampState];
  reflex: [Reflex, Reflex];
  // 偏航
  yaw: DampState;
  /** 限速后的中间目标（跟随器追它） */
  yawGoal: number;
  yawTarget: number;
  // 调度与动作
  nextSpont: number;
  nextOrient: number;
  gesture: Gesture | null;
  pending: Pending | null;
  grasp: GraspMem;
  /**
   * 手碰臂那一刻正忙、没被回应：记下那条触碰记录的 id，手还在、机器空下来时补认一次；−1 = 没有
   * （2026-10-07 拍板「忙完再认一次」，见 recheckContact）
   */
  armWaiting: number;
  /** 这次碰臂是谁动的（ARM_TOUCH by；不写 = 手）：补认时按同一个强度 */
  touchBy: 'hand' | 'arm';
  /** 手（HAND 传感）；null = 没有手（画布上没有指针 / 真机上没有近距读数） */
  hand: HandMem | null;
  /** 深缠（执行器 arm.wrap 的跟随器）：只在有手时动，没有手恒为 0 */
  wrap: DampState;
  vigor: number;
  done: boolean;
  inbox: SensorInput[];
  /** 动作词汇 v2（只有 vocab: 2 的会话有） */
  m2?: MotionV2;
}

export interface EngineOpts {
  seed: number;
  /** 人格呈现顺序（A–D 各一次）；默认 A → B → C → D（示意） */
  order?: readonly PersonaKey[];
  /** 四世之后是否从头再来（台架用）；默认 false = 第四世空白结束即会话结束 */
  loop?: boolean;
  /** 生命钟倍率（默认 1 = 实验口径）。只压缩一世各段的时长，呼吸与动作仍按真实秒 */
  lifeRate?: number;
  /**
   * 动作词汇（2026-10-08 研究原型）：1 = 现行（默认，逐位不变）；2 = 分段动作程序（惊跳是固定的反射 +
   * 凝住 + 按人格的恢复，回应按刺激种类分动词，自发动作变小；见 vocab2.ts）。待作者拍板。
   */
  vocab?: 1 | 2;
  /**
   * 执行层放不放开肌腱轴深卷（只对 vocab 2 的迎手链有意义；台架 Lab 1-6 传 true，与 tendonContractions 的 deep 同口径；
   * 固件 / 默认 false）。深卷只在腱轴 0、手在臂中段正上方平卷够不着时用，每轮 ≤ 4 s、冷却 45 s（研究笔记 §9.6）
   */
  deepOk?: boolean;
}

const isRate = (r: number): boolean => Number.isFinite(r) && r > 0;

interface Ctx {
  p: PersonaSpec;
  /** 本段已过秒数 */
  el: number;
  age: AgeFactors;
  death: DeathFrame | null;
  /** 诞生缓入 0→1（诞生段之后恒 1） */
  ramp: number;
  vigor: number;
  tone: number;
  grip: number;
  /** 活着（诞生 / 成长 / 衰老）：反射在 */
  alive: boolean;
  /** 对刺激有响应 */
  responsive: boolean;
  spontOk: boolean;
  orientOk: boolean;
  /** 自发动作频度系数（死亡时递减） */
  activity: number;
}

// ------------------------------------------------------------------ 小工具

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const clamp01 = (x: number): number => clamp(x, 0, 1);
const smooth = (x: number): number => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
/** 角度归到 [−π, π) */
export const wrapPi = (a: number): number => a - TAU * Math.floor((a + Math.PI) / TAU);
const lerpAngle = (a: number, b: number, u: number): number => a + wrapPi(b - a) * u;
/** 偏航限位（±π，不缠线；新加的旋转电机行程待用户更新模型后确认） */
const clampYaw = (a: number): number => clamp(a, -Math.PI, Math.PI);
/** 弯曲超过 1 的部分换成深缠行程（执行层：差动 = 0.34·bend + 0.16·wrap） */
const WRAP_PER_BEND = 0.34 / 0.16;
/** 两个臂姿态在差动平面上按直线混合（深卷线性） */
function blendPose(a: Pose, b: Pose, u: number): Pose {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const da = 0.34 * a.bend;
  const db = 0.34 * b.bend;
  const x = da * Math.cos(a.dir) + (db * Math.cos(b.dir) - da * Math.cos(a.dir)) * u;
  const y = da * Math.sin(a.dir) + (db * Math.sin(b.dir) - da * Math.sin(a.dir)) * u;
  const D = Math.hypot(x, y);
  return { bend: D / 0.34, dir: D > 1e-9 ? Math.atan2(y, x) : b.dir, deep: a.deep + (b.deep - a.deep) * u };
}

const idleGrasp = (): GraspMem => ({
  phase: 'IDLE',
  t0: 0,
  dur: 0,
  dir: MOTION.up,
  from: 0,
  contact: 0,
  contactW: 0,
  chases: 0,
  searches: 0,
  reason: '',
});
const noReflex = (): Reflex => ({ t0: -1, dir: 1, gain: 0 });

/** 动作包络：惊吓快起慢落，其余 sin²（两端零斜率） */
function envelope(g: Gesture, t: number): number {
  const x = (t - g.t0) / g.dur;
  if (!(x > 0 && x < 1)) return 0;
  if (g.kind === 'startle') return x < 0.15 ? smooth(x / 0.15) : 1 - smooth((x - 0.15) / 0.85);
  const s = Math.sin(Math.PI * x);
  return s * s;
}

// ------------------------------------------------------------------ 引擎

export class BehaviorEngine {
  private s: EngineState;
  private readonly buf: LogRecord[] = [];
  /** 这一条传感事件走了预期接触（handle 内部用完即清；不是状态，快照不带） */
  private expected = false;

  constructor(opts: EngineOpts, restore?: EngineState) {
    if (restore) {
      const ok = restore.v === STATE_VERSION ? !restore.m2 : restore.v === STATE_VERSION_V2 && !!restore.m2;
      if (!ok) throw new Error(`快照版本 ${String(restore.v)} 与引擎 v${STATE_VERSION} / v${STATE_VERSION_V2} 不符`);
      this.s = JSON.parse(JSON.stringify(restore)) as EngineState;
      return;
    }
    const raw: readonly unknown[] = opts.order ?? PERSONA_KEYS;
    if (!isPersonaOrder(raw)) throw new Error(`人格顺序必须是 A–D 各一次：${raw.join(',')}`);
    const order = [...raw];
    const seed = opts.seed >>> 0;
    const lifeRate = opts.lifeRate ?? 1;
    if (!isRate(lifeRate)) throw new Error(`生命钟倍率必须是正数：${lifeRate}`);
    this.s = {
      v: STATE_VERSION,
      seed,
      order,
      loop: opts.loop ?? false,
      lifeRate,
      lifeRate0: lifeRate,
      tick: 0,
      rem: 0,
      rng: makeRng(seed),
      sched: makeRng(deriveSeed(seed, 1)),
      ageLens: [],
      seq: 0,
      life: 1,
      phase: 'BIRTH',
      phaseLt: 0,
      phaseLen: 0,
      band: 'gone',
      bearing: null,
      electrode: false,
      tension: false,
      held: false,
      lifted: false,
      arousal: 0,
      speedBase: 1,
      speed: 1,
      phi: 0,
      period: 1,
      ampBase: 0,
      periodScale: 1,
      sighNext: false,
      sighNow: false,
      // 会话从折叠（「睡着」）开始：诞生 = 张开
      amp: { x: 0, v: 0 },
      center: { x: 1, v: 0 },
      voiceF: 0,
      voiceDuty: 0,
      voiceUntil: -1,
      voiceOn: false,
      armX: { x: 0, v: 0 },
      armY: { x: 0, v: 0 },
      restDir: 0,
      tone: 0,
      psi: 0,
      feeler: [
        { x: 0, v: 0 },
        { x: 0, v: 0 },
      ],
      reflex: [noReflex(), noReflex()],
      yaw: { x: 0, v: 0 },
      yawGoal: 0,
      yawTarget: 0,
      nextSpont: NEVER,
      nextOrient: NEVER,
      gesture: null,
      pending: null,
      grasp: idleGrasp(),
      armWaiting: -1,
      touchBy: 'hand',
      hand: null,
      wrap: { x: 0, v: 0 },
      vigor: 0,
      done: false,
      inbox: [],
    };
    if (opts.vocab === 2) {
      this.s.v = STATE_VERSION_V2;
      this.s.m2 = {
        prog: null,
        progCue: false,
        seen: -1,
        deep: 0,
        rate: { x: 1, v: 0 },
        feel: [
          { x: 0, v: 0 },
          { x: 0, v: 0 },
        ],
        burstF: 1,
        clench: { x: 0, v: 0 },
        push: { x: 0, v: 0 },
        startles: [],
        startleBusy: -1,
        hc: idleHand(),
        obs: [0, 0, 0, 0, 0, 0, 0, 0],
        xr: makeRng(deriveSeed(seed, 2)),
        deepOk: opts.deepOk ?? false,
      };
    }
    this.drawSchedule();
    this.beginLife(0);
  }

  /** 从快照恢复（快照是纯数据，可来自 handoff 或文件） */
  static restore(state: EngineState): BehaviorEngine {
    return new BehaviorEngine({ seed: state.seed }, state);
  }

  /** 整块状态的深拷贝（纯数据） */
  snapshot(): EngineState {
    return JSON.parse(JSON.stringify(this.s)) as EngineState;
  }

  get time(): number {
    return this.s.tick / HZ;
  }

  get ticks(): number {
    return this.s.tick;
  }

  get done(): boolean {
    return this.s.done;
  }

  /** 只读窥视（测试 / HUD）；要改状态请走 push / tick */
  get state(): Readonly<EngineState> {
    return this.s;
  }

  header(): LogHeader {
    return sessionHeader(this.s.seed, this.s.order, HZ, this.s.lifeRate0, this.vocab());
  }

  /**
   * 生命钟倍率（台架「生命时钟」档）。只压缩一世各段的时长，动作节奏不变；
   * 中途改档记一条操作记录（src = 'operator'），导出的日志看得出哪一段是加速跑的。
   */
  setLifeRate(rate: number): void {
    const s = this.s;
    if (!isRate(rate)) throw new Error(`生命钟倍率必须是正数：${rate}`);
    if (rate === s.lifeRate || s.done) return;
    s.lifeRate = rate;
    // 诞生段「40 s 起有自发与转向」是生命时间：还没到的那道门按新倍率改到正确的真实时刻
    if (s.phase === 'BIRTH') {
      const left = LIFE.spontAt - s.phaseLt / HZ;
      if (left > 0) {
        const due = s.tick / HZ + left / rate;
        s.nextSpont = due;
        s.nextOrient = due;
      }
    }
    this.emit('RATE', { rate }, 'operator');
  }

  /**
   * 跳到下一段（台架「下一段」）：本段视为已满，下一步照常换段、照常记生命事件。
   * 记一条操作记录。诞生段还没到自发那道门就被跳过时，把门一并放开。
   */
  skip(): void {
    const s = this.s;
    if (s.done) return;
    this.emit('SKIP', { from: s.phase }, 'operator');
    if (s.phase === 'BIRTH' && s.phaseLt / HZ < LIFE.spontAt) {
      const now = s.tick / HZ;
      s.nextSpont = Math.min(s.nextSpont, now);
      s.nextOrient = Math.min(s.nextOrient, now);
    }
    s.phaseLt = s.phaseLen;
  }

  /**
   * 收一条传感事件；下一步开始时处理，时间戳 = 那一步的时刻。连着的两条 HAND 只留后一条——同一步里
   * 处理时间戳一样，前一条只是被后一条覆盖（台架暂停时读数不会越积越多；日志记的就是引擎吃的那条，回放照样逐位一致）。
   */
  push(input: SensorInput): void {
    const box = this.s.inbox;
    if (input.kind === 'HAND' && box.length > 0 && box[box.length - 1].kind === 'HAND') box[box.length - 1] = input;
    else box.push(input);
  }

  /** 取走新产生的日志记录 */
  drain(): LogRecord[] {
    return this.buf.splice(0, this.buf.length);
  }

  /** 按真实流逝时间推进（台架用）：内部定步，余量留到下一帧 */
  advance(dt: number, maxSteps = 8): number {
    const { steps, remainder } = consumeFixedSteps(this.s.rem, dt, DT, maxSteps);
    this.s.rem = remainder;
    for (let i = 0; i < steps; i++) this.tick();
    return steps;
  }

  /** 动作词汇：1 = 现行、2 = 分段动作程序（研究原型） */
  vocab(): 1 | 2 {
    return this.s.m2 ? 2 : 1;
  }

  /** v2 正在执行的动作程序名与段名（台架 HUD 用；没有 = null） */
  motion(): { name: string; phase: string } | null {
    const m = this.s.m2;
    if (!m) return null;
    // 只放提示的程序（投入中起的回应 / 自发）不是臂在做的事：报手链的
    const cueOnly = !!m.prog && m.prog.name !== 'startle' && (m.progCue || ENGAGED.has(m.hc.stage));
    const p = cueOnly ? (m.hc.prog ?? m.prog) : (m.prog ?? m.hc.prog);
    if (!p) return null;
    const ph = p.phases[p.idx];
    return { name: p.name, phase: ph ? ph.name : '' };
  }

  persona(): PersonaKey {
    return this.s.order[(this.s.life - 1) % this.s.order.length];
  }

  status(): EngineStatus {
    const s = this.s;
    return {
      t: s.tick / HZ,
      life: s.life,
      persona: this.persona(),
      phase: s.phase,
      phaseElapsed: s.phaseLt / HZ,
      phaseLen: s.phaseLen / HZ,
      lifeRate: s.lifeRate,
      arousal: s.arousal,
      vigor: s.vigor,
      grasp: s.grasp.phase,
      band: s.band,
      done: s.done,
    };
  }

  /** 此刻的执行器指令（纯函数：只读状态） */
  targets(): ActuatorTargets {
    const s = this.s;
    const t = s.tick / HZ;
    let breath = clamp01(s.center.x + 0.5 * s.amp.x * Math.cos(TAU * s.phi));
    if (s.m2) {
      // v2：猛收朝 0.92 收拢（到收拢端就停在那儿——正是要的样子）、缩 / 忍往收拢端推一点
      const m = s.m2;
      breath = clamp01(breath + clamp01(m.clench.x) * Math.max(0, 0.92 - breath) + m.push.x);
    }
    const bend = Math.min(1, Math.hypot(s.armX.x, s.armY.x));
    const drive = (k: 0 | 1): FeelerDrive => {
      const r = s.reflex[k];
      return { base: s.feeler[k].x, startle: { t: r.t0 < 0 ? Infinity : t - r.t0, dir: r.dir, gain: r.gain } };
    };
    const out: ActuatorTargets = {
      breath: { s: breath },
      arm: {
        tone: s.tone,
        bend,
        dir: bend > 1e-9 ? Math.atan2(s.armY.x, s.armX.x) : 0,
        wrap: s.wrap.x,
      },
      feelers: [drive(0), drive(1)],
      yaw: s.yaw.x,
      light: { level: s.vigor * (0.35 + 0.65 * (1 - breath)) },
      sound: { on: s.voiceOn, f: s.voiceF, duty: s.voiceDuty, level: s.vigor },
    };
    if (s.m2) {
      // v2：深卷、按段的灯光倍数与发声音高（v1 不经过这里，输出逐位不变）
      out.arm.deep = s.m2.deep;
      out.light.level = Math.min(1, out.light.level * (this.cueNow(t)?.ph.light ?? 1));
      out.sound.f = s.voiceF * this.voiceMul(t);
    }
    return out;
  }

  /** 推进一个定步 */
  tick(): void {
    const s = this.s;
    if (s.done) return;
    const t = s.tick / HZ;
    if (s.phaseLt >= s.phaseLen) this.advancePhase(t);
    if (s.done) return;
    const ctx = this.context();
    for (const e of s.inbox) this.handle(e, t, ctx);
    s.inbox.length = 0;
    s.arousal *= AROUSAL_DECAY;
    // 空白段不再按将死的速度放慢：死前最后那点跟随余量（<1%）要在两三秒内收干净，
    // 否则「死后」还在一点点松（2026-10-07 守门测试抓到：臂的余弯拖了 6 秒）
    s.speed = ctx.alive || ctx.death ? s.speedBase * ctx.age.speed * (ctx.death ? Math.max(0.2, ctx.death.tone) : 1) : 1;
    if (s.pending && t >= s.pending.due) this.startResponse(t, ctx);
    if (s.gesture && t >= s.gesture.t0 + s.gesture.dur) s.gesture = null;
    if (s.armWaiting >= 0) this.recheckContact(t, ctx);
    if (s.hand) this.stepHand(t, ctx);
    if (s.m2 && (s.hand || s.m2.hc.stage !== 'off' || s.m2.hc.prog)) this.stepHandChain(t, ctx);
    this.stepGrasp(t, ctx);
    if (t >= s.nextSpont) this.spontaneous(t, ctx);
    if (t >= s.nextOrient) this.orient(t, ctx);
    this.stepBreath(t, ctx);
    this.stepArm(t, ctx);
    if (s.m2) {
      // 臂余振观测器跟着此刻给出的指令走（只是状态，不进执行器指令）
      const [cx, cy] = this.cmdXY();
      obsStep(s.m2.obs, cx, cy, DT);
    }
    this.stepFeelers(t, ctx);
    this.stepYaw();
    s.vigor = ctx.vigor;
    const exhale = (s.phi + 0.5) % 1 < s.voiceDuty;
    s.voiceOn = s.phase !== 'BLANK' && ctx.vigor > 0.05 && (t < s.voiceUntil || exhale);
    if (s.m2) {
      // v2：凝住 / 定向停顿时连呼气声也收住（短促的那一声照出）；呼噜、询问、下沉的那几段一直出声；握着时呼气的那半口一直哼
      const v = this.cueNow(t)?.ph.voice;
      if (v === 'mute' && !(t < s.voiceUntil)) s.voiceOn = false;
      else if ((v === 'purr' || v === 'query' || v === 'fall') && s.phase !== 'BLANK' && ctx.vigor > 0.05) s.voiceOn = true;
      else if (v === 'hum' && s.phase !== 'BLANK' && ctx.vigor > 0.05) s.voiceOn = t < s.voiceUntil || (s.phi + 0.5) % 1 < 0.5;
    }
    s.phaseLt += s.lifeRate;
    s.tick++;
  }

  // ---------------------------------------------------------------- 生命阶段

  private context(): Ctx {
    const s = this.s;
    const p = PERSONAS[this.persona()];
    const el = s.phaseLt / HZ;
    const len = s.phaseLen / HZ;
    const none = ageing(0);
    switch (s.phase) {
      case 'BIRTH': {
        const ramp = smooth(el / LIFE.breathRamp);
        const spont = el >= LIFE.spontAt;
        return {
          p, el, age: none, death: null, ramp, vigor: ramp, tone: ramp, grip: 1,
          alive: true, responsive: el >= LIFE.respondAt, spontOk: spont, orientOk: spont, activity: 1,
        };
      }
      case 'GROW':
        return {
          p, el, age: none, death: null, ramp: 1, vigor: 1, tone: 1, grip: 1,
          alive: true, responsive: true, spontOk: true, orientOk: true, activity: 1,
        };
      case 'AGE': {
        const age = ageing(len > 0 ? el / len : 1);
        return {
          p, el, age, death: null, ramp: 1, vigor: age.vigor, tone: 1, grip: age.grip,
          alive: true, responsive: true, spontOk: true, orientOk: true, activity: 1,
        };
      }
      case 'DEATH': {
        const age = ageing(1);
        const death = deathFrame(p.death.kind, len > 0 ? el / len : 1);
        return {
          p, el, age, death, ramp: 1, vigor: age.vigor * death.tone, tone: death.tone,
          grip: age.grip * death.tone, alive: false, responsive: false,
          spontOk: death.activity >= DEATH_ACTIVITY_MIN, orientOk: false, activity: death.activity,
        };
      }
      default:
        return {
          p, el, age: ageing(1), death: null, ramp: 1, vigor: 0, tone: 0, grip: 0,
          alive: false, responsive: false, spontOk: false, orientOk: false, activity: 0,
        };
    }
  }

  /** 抽本轮四世的衰老段长度（90 ± 30 s）——用独立子流，交互挪不动它 */
  private drawSchedule(): void {
    const s = this.s;
    s.ageLens = s.order.map(() => LIFE.age + uniform(s.sched, -LIFE.deathWindow, LIFE.deathWindow));
  }

  private enter(phase: Phase, seconds: number): void {
    const s = this.s;
    s.phase = phase;
    s.phaseLt = 0;
    s.phaseLen = Math.round(seconds * HZ);
  }

  private advancePhase(t: number): void {
    const s = this.s;
    const p = PERSONAS[this.persona()];
    switch (s.phase) {
      case 'BIRTH':
        this.enter('GROW', LIFE.grow);
        this.emit('LIFE_GROW');
        return;
      case 'GROW':
        this.enter('AGE', s.ageLens[(s.life - 1) % s.order.length]);
        this.emit('LIFE_AGE');
        return;
      case 'AGE':
        this.enter('DEATH', p.death.dur);
        this.emit('LIFE_DEATH_START', { kind: p.death.kind, dur: p.death.dur });
        this.onDeathStart(t);
        return;
      case 'DEATH':
        this.enter('BLANK', LIFE.blank);
        this.emit('LIFE_DEATH');
        s.gesture = null;
        if (s.m2) {
          s.m2.prog = null;
          this.hcReset(t, 'off');
        }
        s.pending = null;
        s.grasp = idleGrasp();
        s.nextSpont = NEVER;
        s.nextOrient = NEVER;
        return;
      case 'BLANK': {
        const lastOfRound = s.life % s.order.length === 0;
        if (lastOfRound && !s.loop) {
          this.enter('END', 0);
          s.done = true;
          this.emit('SESSION_END');
          return;
        }
        if (lastOfRound) this.drawSchedule();
        s.life++;
        this.beginLife(t);
        return;
      }
      default:
        return;
    }
  }

  /** 新的一世：人格换下一套，内部状态全部清零（覆写而非累积，03-20）。身体（姿态）延续 */
  private beginLife(t: number): void {
    const s = this.s;
    this.enter('BIRTH', LIFE.birth);
    const p = PERSONAS[this.persona()];
    s.arousal = 0;
    s.gesture = null;
    if (s.m2) {
      s.m2.prog = null;
      s.m2.startles = [];
      s.m2.startleBusy = -1;
      this.hcReset(t, 'off');
      s.m2.hc.rearmAt = NEVER;
    }
    s.pending = null;
    s.grasp = idleGrasp();
    s.armWaiting = -1;
    if (s.hand) this.forgetHand();
    s.reflex = [noReflex(), noReflex()];
    s.sighNext = false;
    s.sighNow = false;
    s.voiceUntil = -1;
    s.periodScale = 1;
    s.phi = 0;
    // 人此刻在不在是传感事实（保留）；人「曾经」在哪是上一世的记忆（清掉）
    if (s.band === 'gone' || s.hand) s.bearing = null;
    s.speedBase = sampleRange(s.rng, p.speed) / ENGINE.speedRef;
    s.restDir = uniform(s.rng, -Math.PI, Math.PI);
    // 「诞生 40 s 起」是生命时间，折成真实秒要 ÷ 倍率（倍率 1 时与 M1 逐位相同）
    s.nextSpont = t + LIFE.spontAt / s.lifeRate;
    s.nextOrient = t + LIFE.spontAt / s.lifeRate;
    this.newBreath(this.context());
    this.emit('LIFE_BIRTH', { zh: p.zh });
  }

  private onDeathStart(t: number): void {
    const s = this.s;
    // 注意力在死亡开始时清零——要在定「最后朝向人」之前清（清的时候会把绕回中的偏航目标就地停下）
    if (s.hand) this.forgetHand();
    const ctx = this.context();
    if (s.pending) {
      this.emit('RESPONSE_DROP', { to: s.pending.id, reason: 'death' });
      s.pending = null;
    }
    if (s.grasp.phase !== 'IDLE' && s.grasp.phase !== 'RELEASE') this.beginRelease(t, ctx, 'death');
    // v2：还在做的动作不演完（它的呼吸 / 声 / 光提示会盖掉死亡的脚本），平平地落回静息
    if (s.m2?.prog) this.run('settle', t, buildSettle(this.buildCtx(ctx, 0, 0)), 'spont', 'attend', -1);
    s.nextOrient = NEVER;
    if (ctx.p.death.kind === 'turn') {
      // 好奇型：最后朝向用户（最后已知的人位；从没测到过人就停在原处）
      const facing = s.bearing ?? s.yaw.x;
      s.yawTarget = clampYaw(facing);
      this.emit('ORIENT', { mode: 'final', to: s.yawTarget });
    }
  }

  // ---------------------------------------------------------------- 事件

  /** 刺激来自哪个方位（世界系）：壳体左右半、触须左右、带方位的在场；其余不知道 */
  private stimulusBearing(e: SensorInput): number | null {
    const s = this.s;
    const side = (lr: 'L' | 'R'): number => clampYaw(wrapPi(s.yaw.x + (lr === 'L' ? 1 : -1) * (Math.PI / 2)));
    switch (e.kind) {
      case 'PRESENCE':
        return s.bearing;
      case 'SHELL_STROKE':
        return side(e.half);
      case 'SHELL_HOLD':
        return e.half === 'both' ? null : side(e.half);
      case 'FEELER_TOUCH':
        return side(e.feeler === 0 ? 'L' : 'R');
      default:
        return null;
    }
  }

  private handle(e: SensorInput, t: number, ctx: Ctx): void {
    const s = this.s;
    const I = intensityOf(e, s.band);
    switch (e.kind) {
      case 'PRESENCE':
        s.band = e.band;
        if (e.bearing !== undefined) s.bearing = clampYaw(wrapPi(e.bearing));
        break;
      case 'SHELL_HOLD':
        s.held = e.on;
        break;
      case 'LIFT':
        s.lifted = e.lifted;
        break;
      case 'ARM_TOUCH':
        s.electrode = e.on;
        if (e.on) s.touchBy = e.by ?? 'hand';
        break;
      case 'RESISTANCE':
        s.tension = e.on;
        break;
      case 'HAND':
        this.handFact(e, t);
        break;
      default:
        break;
    }
    const rec = this.emit(e.kind, sensorPayload(e), 'sensor', I, 'none');
    // 触须的局部反射：活着就有，与人格无关、不经中枢（盘点 §6.3「单轴方向性反射响应」）
    if (e.kind === 'FEELER_TOUCH' && ctx.alive) this.reflex(e.feeler, e.side === 'L' ? -1 : 1, t, ctx.vigor, rec.id);
    let out: Outcome = 'none';
    if (I > 0) {
      if (!ctx.responsive) out = 'muted';
      else {
        s.arousal = Math.min(1, s.arousal + ENGINE.arousal.gain * I);
        out = this.evaluate(e, I, rec.id, t, ctx);
      }
    }
    rec.out = out;
    // 手碰臂时正忙：电极电平还在，就等机器空下来再认一次（recheckContact）；松手即作罢。预期接触不补认（迎手链自己重新武装）
    if (e.kind === 'ARM_TOUCH') s.armWaiting = e.on && out === 'busy' && !this.expected ? rec.id : -1;
    this.expected = false;
  }

  /** 一个刺激（已过静默期、唤醒已加）怎么处理：惊跳 / 正忙 / 排进响应。id = 它那条记录 */
  private evaluate(e: SensorInput, I: number, id: number, t: number, ctx: Ctx): Outcome {
    const s = this.s;
    if (s.m2) {
      // v2 迎手链：迎着、看得见的手碰臂 = 预期接触（不判惊跳、不排队、不再付 ④）
      if (e.kind === 'ARM_TOUCH' && e.on && this.expectedStage()) {
        this.expected = true;
        return this.expectedTouch(e, I, id, t, ctx);
      }
      // 看见手以后人走近：吸收（唤醒照加，不起程序、不抽 ⑩、不占「正忙」）。手已经在视野里、还没过 ④ 的也算——
      // 台架上手一出现就同时报一档在场，两者其实是同一个人（不然在场回应与「看见」同一步撞车）
      const hh = s.hand;
      if (e.kind === 'PRESENCE' && hh && hh.present && (hh.seen || Math.abs(wrapPi(hh.bearing - s.yaw.x)) <= HAND.fov)) {
        this.emit('RESPONSE', { to: id, latency: 0, motion: 'hand.absorb' });
        return 'respond';
      }
    }
    const th = sampleRange(s.rng, ctx.p.startle);
    if (I > th) {
      const g = s.gesture;
      // v2：惊跳「正忙」只到反射 + 凝住 + 恢复的第一段；之后的恢复里再超阈值 = 从此刻的姿态再缩一次
      if (g && g.kind === 'startle' && t < (s.m2 ? s.m2.startleBusy : g.t0 + g.dur)) return 'busy';
      this.startle(e, id, I, th, t, ctx);
      return 'startle';
    }
    if (s.pending || (s.gesture && s.gesture.kind !== 'spont')) return 'busy';
    const tau = sampleRange(s.rng, ctx.p.latency, VARIABILITY.response) * ctx.age.latency;
    s.pending = { due: t + tau, at: t, id, kind: e.kind, bearing: this.stimulusBearing(e) };
    if (s.m2) {
      s.pending.side = this.sideOf(e, s.pending.bearing);
      s.pending.I = I;
      s.pending.th = th;
      if (e.kind === 'SHELL_STROKE') s.pending.touch = e.touch;
      // 注意到：潜伏期里就停下手上的自发动作、定住、呼吸放慢或屏住、触须指过去（抓握中臂归抓握，不起程序）；
      // 接近阈值的触碰先「一缩」，回应顺延到一缩做完
      if ((!s.m2.prog || s.gesture?.kind === 'spont') && s.grasp.phase === 'IDLE') {
        const kind: RegKind = e.kind === 'KNOCK' || e.kind === 'LIFT' ? 'alert' : e.kind === 'SOUND' ? 'listen' : 'directed';
        const contact = e.kind === 'SHELL_STROKE' || e.kind === 'SHELL_HOLD' || e.kind === 'FEELER_TOUCH' || e.kind === 'PRESENCE';
        const wince = contact && th > 0 && I / th >= V2.nearThreshold;
        const phases = buildRegister(this.buildCtx(ctx, tau, 0), { dur: tau, side: s.pending.side, kind, wince });
        const dur = totalDur({ phases });
        if (dur > DT) {
          this.run('register', t, phases, 'spont', 'attend', -1);
          s.pending.tau = tau;
          s.pending.due = Math.max(s.pending.due, t + dur);
          if (wince) s.pending.wince = true;
        }
      }
    }
    return 'respond';
  }

  /**
   * 「忙完再认一次」（2026-10-07 拍板）：手碰臂那一刻正在做上一个回应，那次记 busy；电极电平一直在，
   * 等机器空下来（没有待发响应、没有回应 / 惊跳动作、臂没在抓握）就把这次持续接触当一次刺激再认——
   * **只认一次**。记一条引擎记录 CONTACT（带强度与去向，to 指回原来那条触碰），之后的回应链照常指回它；
   * 唤醒度不再加（那次触碰已经加过）。中途松手、死亡开始、新一世都作罢。
   */
  private recheckContact(t: number, ctx: Ctx): void {
    const s = this.s;
    if (!s.electrode || !ctx.responsive) {
      s.armWaiting = -1;
      return;
    }
    if (s.pending || (s.gesture && s.gesture.kind !== 'spont') || s.grasp.phase !== 'IDLE') return;
    const to = s.armWaiting;
    s.armWaiting = -1;
    const reach = s.touchBy === 'arm';
    const I = reach ? INTENSITY.armReach : INTENSITY.arm;
    const rec = this.emit('CONTACT', { to }, 'engine', I, 'none');
    rec.out = this.evaluate(reach ? { kind: 'ARM_TOUCH', on: true, by: 'arm' } : { kind: 'ARM_TOUCH', on: true }, I, rec.id, t, ctx);
    this.expected = false;
  }

  /** 触须反射：记下触发时刻；波形由执行层按 startleSwing 画 */
  private reflex(k: 0 | 1, dir: 1 | -1, at: number, gain: number, to: number): void {
    const r = this.s.reflex[k];
    if (r.t0 >= 0 && at - r.t0 < MOTION.reflexRefractory) return;
    this.s.reflex[k] = { t0: at, dir, gain };
    this.emit('REFLEX', { to, feeler: k, dir });
  }

  private startle(e: SensorInput, id: number, I: number, th: number, t: number, ctx: Ctx): void {
    const s = this.s;
    if (s.pending) {
      this.emit('RESPONSE_DROP', { to: s.pending.id, reason: 'startle' });
      s.pending = null;
    }
    if (s.grasp.phase !== 'IDLE' && s.grasp.phase !== 'RELEASE') this.beginRelease(t, ctx, 'startle');
    if (s.m2) {
      // v2：反射（0.1 s 后沿背离刺激的腱轴深卷、环身猛收屏气）→ 凝住（长短看 τ）→ 按人格的恢复。迎手链作废（惊跳之后从此刻重来）
      const hh = s.hand;
      this.hcReset(t, hh && hh.seen && hh.mode === 'toward' ? 'track' : hh && hh.seen && hh.mode === 'away' ? 'avoid' : 'off');
      this.resampleSpeed(ctx);
      const m = s.m2;
      const tau = sampleRange(s.rng, ctx.p.latency, VARIABILITY.response) * ctx.age.latency;
      const b = this.stimulusBearing(e);
      let side = this.sideOf(e, b);
      // 轴：有方向的刺激背离它；没有方向的——看见了手就背着手，知道人在哪就背着人，都不知道就往离此刻弯向远的那根下方轴
      let axis: number | undefined;
      let rule = side ? 'side' : 'far';
      if (!side && s.hand?.seen) {
        axis = nearestAxisDir(this.awayDir(s.hand));
        rule = 'hand';
      } else if (!side && s.bearing !== null && s.band !== 'gone') {
        const d = wrapPi(s.bearing - s.yaw.x);
        if (Math.abs(d) >= 0.15) {
          side = Math.sign(d);
          rule = 'person';
        }
      }
      // 安全规则：不知道哪边、人就在近处、方位读不出 → 就近缩，不往任何一边甩
      const retract = !side && axis === undefined && s.band === 'near' && s.bearing === null;
      if (retract) rule = 'retract';
      const rb = b ?? (s.band !== 'gone' ? s.bearing : null);
      const recoil = rb !== null ? (Math.sign(wrapPi(s.yaw.x - rb)) || 1) * V2.startleRecoil : 0;
      // 恢复里转回去看：活力、好奇按 ⑩ 抽（只在知道方向时；随机数只在那时抽）
      const P = this.persona();
      const turnBack = recoil && (P === 'A' || P === 'C') && chance(s.rng, ctx.p.toward) ? -recoil * (P === 'C' ? 1.6 : 1) : 0;
      m.startles = m.startles.filter((x) => t - x < V2.repeatWindow);
      const repeats = m.startles.length;
      m.startles.push(t);
      const { phases, busy } = buildStartle(this.buildCtx(ctx, tau, 0), { I, th, side, axis, retract, recoilYaw: recoil, turnBack, repeats });
      this.run('startle', t, phases, 'startle', 'flinch', id);
      m.startleBusy = t + busy;
      for (const k of [0, 1] as const) {
        if (e.kind === 'FEELER_TOUCH' && e.feeler === k) continue;
        this.reflex(k, 1, t + ENGINE.startleLatency, ctx.vigor, id);
      }
      this.emit('STARTLE', { to: id, I, th, motion: 'startle', rule, repeats });
      if (e.kind === 'ARM_TOUCH' && s.hand?.seen) this.decideHand(t, ctx, true, 'startle');
      return;
    }
    const t0 = t + ENGINE.startleLatency;
    // 缩：看见了手就背着手缩（手就在臂梢上、方向读不准时还是往下缩），否则往下缩
    const flinch = s.hand?.seen ? this.awayDir(s.hand) : MOTION.down;
    s.gesture = {
      kind: 'startle',
      action: 'flinch',
      t0,
      dur: MOTION.startle,
      dir: flinch,
      dir2: flinch,
      bend: MOTION.flinchBend * ctx.vigor,
      feeler: 0,
      breath: 0,
      push: MOTION.flinchPush * I,
      to: id,
    };
    // 两条触须一齐甩开（被摸的那条已经有局部反射，不重复）
    for (const k of [0, 1] as const) {
      if (e.kind === 'FEELER_TOUCH' && e.feeler === k) continue;
      this.reflex(k, 1, t0, ctx.vigor, id);
    }
    const b = this.stimulusBearing(e);
    if (b !== null) {
      const away = Math.sign(wrapPi(s.yaw.x - b)) || 1;
      s.yawTarget = clampYaw(s.yaw.x + away * MOTION.flinchTurn);
    }
    s.voiceUntil = t0 + MOTION.voiceBurst;
    this.emit('STARTLE', { to: id, I, th });
    // 被手吓到（碰臂惊跳）：这只手先不迎了，直到下一次 ⑨ 重新决定
    if (e.kind === 'ARM_TOUCH' && s.hand?.seen) this.decideHand(t, ctx, true, 'startle');
  }

  private gestureDur(base: number): number {
    return clamp(base / Math.sqrt(this.s.speed), MOTION.durMin, MOTION.durMax);
  }

  // ---------------------------------------------------------------- 动作词汇 v2（研究原型）

  /** 此刻给出的臂姿态（极坐标；v2 把深缠行程折回弯曲——迎手链的姿态可以超过 1，没有手的会话 wrap 恒为 0） */
  private curPose(): Pose {
    const s = this.s;
    const b = Math.hypot(s.armX.x, s.armY.x);
    const bend = b + (s.m2 ? s.wrap.x / WRAP_PER_BEND : 0);
    return { bend, dir: b > 1e-9 ? Math.atan2(s.armY.x, s.armX.x) : s.restDir, deep: s.m2?.deep ?? 0 };
  }

  /**
   * v2：把一个臂姿态直接写进指令（不经人格跟随器）。弯曲超过 1 的部分走深缠行程；速度按差分记下，之后交回跟随器不跳；
   * done = 走完那一帧不把速度交给跟随器（D 生硬的直线落回带着速度，交过去会冲过静息再弹回来）
   */
  private writePose(pose: Pose, done: boolean): void {
    const s = this.s;
    // 直线插值算出的 1 + 2e-16 不算深缠（没有手的会话要与改动前逐位相同）
    const flat = pose.bend <= 1 + 1e-9;
    const b = flat ? pose.bend : 1;
    const x = b * Math.cos(pose.dir);
    const y = b * Math.sin(pose.dir);
    const w = flat ? 0 : (pose.bend - 1) * WRAP_PER_BEND;
    s.armX.v = done ? 0 : (x - s.armX.x) / DT;
    s.armY.v = done ? 0 : (y - s.armY.x) / DT;
    s.wrap.v = done ? 0 : (w - s.wrap.x) / DT;
    s.armX.x = x;
    s.armY.x = y;
    s.wrap.x = w;
    s.m2!.deep = pose.deep;
  }

  /**
   * v2 此刻生效的提示段（呼吸 / 声 / 光 / 触须读它）与段内进度。优先级：惊跳 > 回应 / 注意到 > 手链的程序 >
   * 握人时的提示表 > 自发 / 看别处的程序。手链关着时就是 m2.prog 那一段（没有手的会话逐位不变）
   */
  private cueNow(t: number): { ph: Cues; u: number } | null {
    const s = this.s;
    const m = s.m2;
    if (!m) return null;
    const from = (p: Program | null): { ph: Cues; u: number } | null => {
      const ph = p ? p.phases[p.idx] : undefined;
      return p && ph ? { ph, u: ph.dur > 0 ? clamp01((t - p.ts) / ph.dur) : 1 } : null;
    };
    const hc = m.hc;
    if (hc.stage === 'off' && !hc.prog) return from(m.prog);
    const name = m.prog?.name ?? '';
    if (m.prog && (name === 'startle' || name === 'register' || name.startsWith('respond'))) {
      const r = from(m.prog);
      if (r) return r;
    }
    const hp = from(hc.prog);
    if (hp) return hp;
    if (hc.stage === 'hold' && s.grasp.phase === 'HOLD_HUMAN') return { ph: this.holdCueNow(), u: 0 };
    return from(m.prog);
  }

  /** 衰老进度 0–1（成长段 0，死亡 / 空白 1） */
  private ageU(ctx: Ctx): number {
    const s = this.s;
    if (s.phase === 'AGE') {
      const len = s.phaseLen / HZ;
      return len > 0 ? clamp01(ctx.el / len) : 1;
    }
    return s.phase === 'DEATH' || s.phase === 'BLANK' || s.phase === 'END' ? 1 : 0;
  }

  private buildCtx(ctx: Ctx, tau: number, g: number): BuildCtx {
    const s = this.s;
    return {
      persona: this.persona(),
      k: Math.sqrt(s.speed),
      tau,
      gAbs: Math.abs(g),
      sign: g >= 0 ? 1 : -1,
      vigor: ctx.vigor,
      ageU: this.ageU(ctx),
      breathAmp: s.ampBase,
      period: s.period,
      rest: { bend: MOTION.restBend * ctx.vigor, dir: s.restDir, deep: 0 },
      cur: this.curPose(),
      rnd: () => uniform(s.rng, 0, 1),
    };
  }

  /** v2：起一个动作程序。决策层另记一笔 gesture（kind / 时长 = 程序全长），忙闲判断与转身快慢照旧读它 */
  private run(name: string, t: number, phases: ProgPhase[], kind: Gesture['kind'], action: GestureAction, to: number): void {
    const s = this.s;
    const m = s.m2;
    if (!m) return;
    m.prog = startProgram(name, t, phases, this.curPose());
    m.progCue = name !== 'startle' && ENGAGED.has(m.hc.stage);
    m.seen = -1;
    s.gesture = { kind, action, t0: t, dur: Math.max(DT, totalDur(m.prog)), dir: 0, dir2: 0, bend: 0, feeler: 0, breath: 0, push: 0, to };
  }

  /** 进入新的一段：一次性的提示（下一口叹气、转身、短促发声） */
  private enterPhase(t: number, ph: ProgPhase): void {
    const s = this.s;
    const m = s.m2;
    if (!m) return;
    if (ph.breath?.sigh) s.sighNext = true;
    if (ph.yaw) s.yawTarget = clampYaw(s.yaw.x + ph.yaw);
    if (ph.voice === 'chirp' || ph.voice === 'huff' || ph.voice === 'tsk') {
      s.voiceUntil = t + (ph.voice === 'tsk' ? V2.tsk : V2.burst);
      m.burstF = ph.voice === 'chirp' ? 1.6 : ph.voice === 'tsk' ? 1.3 : 0.8;
    }
  }

  /** 刺激在哪一侧（相对机身朝向）：+1 左 / −1 右 / 0 不知道 */
  private sideOf(e: SensorInput, bearing: number | null): number {
    switch (e.kind) {
      case 'SHELL_STROKE':
        return e.half === 'L' ? 1 : -1;
      case 'SHELL_HOLD':
        return e.half === 'L' ? 1 : e.half === 'R' ? -1 : 0;
      case 'FEELER_TOUCH':
        return e.feeler === 0 ? 1 : -1;
      default:
        break;
    }
    if (bearing === null) return 0;
    const d = wrapPi(bearing - this.s.yaw.x);
    return Math.abs(d) < 0.15 ? 0 : Math.sign(d);
  }

  /** 回应的动词：看刺激的种类与摸法（接近阈值的「一缩」已经在潜伏期里做了，动词照常） */
  private respKind(pd: Pending): RespKind {
    switch (pd.kind) {
      case 'SHELL_STROKE':
        return pd.touch === 'poke' ? 'poke' : pd.touch === 'pat' ? 'pat' : 'stroke';
      case 'SHELL_HOLD':
        return 'hold';
      case 'FEELER_TOUCH':
        return 'feeler';
      case 'KNOCK':
        return 'knock';
      case 'LIFT':
        return 'lift';
      case 'SOUND':
        return 'sound';
      case 'PRESENCE':
        return 'approach';
      default:
        return 'other';
    }
  }

  /** v2 的回应：按刺激种类选动词，定向停顿看 τ；抓握照旧交给抓握状态机 */
  private startResponseV2(t: number, ctx: Ctx, pd: Pending, g: number, grasp: boolean): void {
    const s = this.s;
    const p = ctx.p;
    const sign = g >= 0 ? 1 : -1;
    let turn: 'toward' | 'away' | 'none' | 'hand' = 'none';
    let motion = 'grasp';
    let yaw = 0;
    let arm = !grasp;
    let feeler = true;
    const yawTo = (b: number): number => clamp(wrapPi(b - s.yaw.x), -MOTION.turnMax, MOTION.turnMax);
    if (!grasp) {
      const kind = this.respKind(pd);
      // ⑩ 一次决定变体：迎（概率 ⑩）/ 否则「不朝人就随便看」的人格（A、C）原地做、「不朝人就背过去」的（B、D）躲；
      // D 的负回应一律躲。没有方向的「震 / 声」不分变体
      const directed = kind !== 'knock' && kind !== 'lift' && kind !== 'sound';
      const variant: Variant = sign < 0 ? 'avoid' : chance(s.rng, p.toward) ? 'toward' : p.otherwise === 'away' ? 'avoid' : 'inplace';
      arm = chance(s.rng, 0.75);
      feeler = chance(s.rng, 0.6);
      if (s.hand?.seen) turn = 'hand';
      else if (pd.bearing !== null && directed) {
        if (variant === 'toward') turn = 'toward';
        else if (variant === 'avoid') turn = 'away';
      }
      if ((turn === 'toward' || turn === 'away') && pd.bearing !== null) yaw = yawTo(turn === 'toward' ? pd.bearing : wrapPi(pd.bearing + Math.PI));
      // 与 buildResponse 选「躲」的规则一致：没方向的「震 / 声」只有负回应才躲
      motion = `respond.${kind}${directed ? `.${variant}` : sign < 0 ? '.avoid' : ''}`;
      const c = this.buildCtx(ctx, pd.tau ?? pd.due - pd.at, g);
      const phases = buildResponse(c, { kind, side: pd.side ?? 0, variant, arm, feeler, turn: yaw });
      this.run(motion, t, phases, 'response', 'attend', pd.id);
    } else {
      s.gesture = { kind: 'response', action: 'attend', t0: t, dur: this.gestureDur(MOTION.response), dir: 0, dir2: 0, bend: 0, feeler: 0, breath: 0, push: 0, to: pd.id };
      if (s.m2) s.m2.prog = null;
    }
    const rec: Record<string, LogValue> = { to: pd.id, latency: t - pd.at, gain: g, arm, feeler, turn, grasp, motion };
    if (pd.wince) rec.wince = true;
    this.emit('RESPONSE', rec);
  }

  /** v2 的发声频率倍数：短促（chirp / huff）· 呼噜 0.7 · 询问 1.0→1.3 · 下沉 1.3→0.7 */
  private voiceMul(t: number): number {
    const s = this.s;
    const m = s.m2;
    if (!m) return 1;
    if (t < s.voiceUntil) return m.burstF;
    const c = this.cueNow(t);
    if (!c) return 1;
    const u = c.u;
    switch (c.ph.voice) {
      case 'purr':
        return 0.7;
      case 'query':
        return 1 + 0.3 * u;
      case 'fall':
        return 1.3 - 0.6 * u;
      case 'hum':
        return 0.75 + 0.1 * squeezePhase(s.phi, s.period * 1.15);
      default:
        return 1;
    }
  }

  /** D 的运动速度每个动作重抽；A/B/C 单值不耗随机数 */
  private resampleSpeed(ctx: Ctx): void {
    const s = this.s;
    s.speedBase = sampleRange(s.rng, ctx.p.speed) / ENGINE.speedRef;
    s.speed = s.speedBase * ctx.age.speed * (ctx.death ? Math.max(0.2, ctx.death.tone) : 1);
  }

  private startResponse(t: number, ctx: Ctx): void {
    const s = this.s;
    const pd = s.pending;
    if (!pd) return;
    s.pending = null;
    if (!ctx.responsive) {
      this.emit('RESPONSE_DROP', { to: pd.id, reason: 'phase' });
      return;
    }
    const p = ctx.p;
    let g = sampleRange(s.rng, p.gain, VARIABILITY.response) * ctx.age.gain;
    if (p.gainSigned && chance(s.rng, 0.5)) g = -g;
    this.resampleSpeed(ctx);
    const sign = g >= 0 ? 1 : -1;
    const amp = clamp(Math.abs(g) / ENGINE.gainRef, ENGINE.gainFloor, 1) * ctx.vigor;
    // 臂被人碰到、此刻愿意迎上去：缠（抓握状态机接手臂）
    let grasp = false;
    if (pd.kind === 'ARM_TOUCH' && sign > 0 && s.electrode && s.grasp.phase === 'IDLE') {
      if (s.m2 && s.hand && s.hand.seen && s.hand.present) {
        // v2 看见了手（没在迎它时碰的，④ 已经等过）：按迎手链缠，定住 0.12 s
        s.m2.hc.g = g;
        s.m2.hc.gDrawn = true;
        this.beginWrapV2(t, ctx, { byHand: s.touchBy !== 'arm', wince: false, chase: false, waited: true });
      } else this.beginWrap(t, false);
      grasp = true;
    }
    if (s.m2) {
      this.startResponseV2(t, ctx, pd, g, grasp);
      return;
    }
    const arm = !grasp && s.grasp.phase === 'IDLE' && chance(s.rng, 0.75);
    const feeler = chance(s.rng, 0.6);
    let turn: 'toward' | 'away' | 'none' | 'hand' = 'none';
    if (s.hand?.seen) turn = 'hand'; // 看见了手：朝向交给手的跟踪（不抽随机数）
    else if (pd.bearing !== null) {
      if (sign < 0) turn = 'away';
      else if (chance(s.rng, p.toward)) turn = 'toward';
    }
    if ((turn === 'toward' || turn === 'away') && pd.bearing !== null) {
      const b = turn === 'toward' ? pd.bearing : wrapPi(pd.bearing + Math.PI);
      const d = clamp(wrapPi(b - s.yaw.x), -MOTION.turnMax, MOTION.turnMax);
      s.yawTarget = clampYaw(s.yaw.x + d);
    }
    // 看见了手：迎 = 弯向手、缩 = 背着手（随机数照抽一次，没有手时与原来逐位相同）
    const h = s.hand?.seen ? s.hand : null;
    const lim = h ? HAND.dirSpread : MOTION.dirSpread;
    const dir =
      (h ? (sign > 0 ? h.aimDir : this.awayDir(h)) : sign > 0 ? MOTION.up : MOTION.down) + uniform(s.rng, -lim, lim);
    s.gesture = {
      kind: 'response',
      action: 'attend',
      t0: t,
      dur: this.gestureDur(MOTION.response),
      dir,
      dir2: dir,
      bend: arm ? amp : 0,
      feeler: feeler ? MOTION.flickAmp * amp : 0,
      breath: g,
      push: 0,
      to: pd.id,
    };
    s.voiceUntil = t + MOTION.voiceBurst;
    this.emit('RESPONSE', { to: pd.id, latency: t - pd.at, gain: g, arm, feeler, turn, grasp });
  }

  // ---------------------------------------------------------------- 自发与转向

  private spontaneous(t: number, ctx: Ctx): void {
    const s = this.s;
    if (!ctx.spontOk) {
      // 诞生头 40 s：稍后再看（别把整世的自发动作关掉）；死亡里频度跌破下限：不再有
      s.nextSpont = ctx.alive ? t + 0.5 : NEVER;
      return;
    }
    if (s.gesture || s.pending) {
      s.nextSpont = t + 0.5;
      return;
    }
    this.resampleSpeed(ctx);
    if (s.m2 && this.spontHand(t, ctx)) return;
    // v2 迎手链：投入中、侧身躲、看着的时候臂不做自发动作（只抖触须 / 叹气）；陪着手的时候只卷（围着手）
    const hst = s.m2 ? s.m2.hc.stage : 'off';
    const armFree = s.grasp.phase === 'IDLE' && !ENGAGED.has(hst) && hst !== 'avoid' && hst !== 'watch';
    let action: GestureAction | 'sigh';
    if (armFree && s.grasp.searches > 0) {
      action = 'search';
      s.grasp.searches--;
    } else {
      const choices: readonly (GestureAction | 'sigh')[] = !armFree ? ['flick', 'sigh'] : hst === 'track' ? ['curl', 'flick', 'sigh'] : ['curl', 'sway', 'flick', 'sigh'];
      action = pick(s.rng, choices);
    }
    const cur = Math.atan2(s.armY.x, s.armX.x);
    const base = {
      kind: 'spont' as const,
      t0: t,
      dir: cur,
      dir2: cur,
      bend: 0,
      feeler: 0,
      breath: 0,
      push: 0,
      to: -1,
    };
    if (s.m2 && action !== 'sigh') {
      // v2：自发动作是小而慢的程序（比任何回应都小）；迎着手的时候卷臂围着手的方向
      const hh = s.hand;
      const around = action === 'curl' && hh !== null && hh.seen && hh.present && hh.mode === 'toward' ? hh.aimDir : undefined;
      this.run(action, t, buildSpont(this.buildCtx(ctx, 0, 0), action as SpontKind, around), 'spont', action, -1);
      // 迎手链开着（陪着 / 看着 / 躲 / 投入中）：触须抖只出触须提示，不把臂拉回静息、不打断手链
      if (action === 'flick' && hst !== 'off') s.m2.progCue = true;
    } else switch (action) {
      case 'sigh':
        s.sighNext = true;
        break;
      case 'curl': {
        // 迎着手的时候，卷臂围着手的方向（像在手边摸索）；否则整圈随便卷
        const hh = s.hand;
        const around = hh !== null && hh.seen && hh.present && hh.mode === 'toward';
        const dir = around ? hh.aimDir + uniform(s.rng, -HAND.spontAround, HAND.spontAround) : uniform(s.rng, -Math.PI, Math.PI);
        const bend = uniform(s.rng, 0.3, 0.7) * ctx.vigor;
        s.gesture = { ...base, action, dur: this.gestureDur(MOTION.curl), dir, dir2: dir, bend };
        break;
      }
      case 'sway':
      case 'search': {
        const swing = uniform(s.rng, 0.8, 1.6) * (chance(s.rng, 0.5) ? 1 : -1);
        const bend = (action === 'search' ? 0.6 : 0.5) * ctx.vigor;
        s.gesture = { ...base, action, dur: this.gestureDur(MOTION.sway), dir2: cur + swing, bend };
        break;
      }
      case 'flick':
        s.gesture = { ...base, action, dur: this.gestureDur(MOTION.flick), feeler: MOTION.flickAmp * ctx.vigor };
        break;
      default:
        break;
    }
    this.emit('SPONTANEOUS', { action });
    const p = ctx.p;
    const range = s.band !== 'gone' && p.spontPresent ? p.spontPresent : p.spont;
    const gap =
      (sampleRange(s.rng, range) * ctx.age.spont * (1 - ENGINE.arousal.spont * s.arousal)) /
      Math.max(ctx.activity, 1e-3);
    s.nextSpont = t + gap;
  }

  /**
   * v2 迎手链里的 ⑥（返回 true = 已经处理、排好下一次）：握着人时不起程序，交给握持控制器演一个小动作（活力拽一下、
   * 好奇摩挲、沉静只叹气、不稳定随机）；侧身躲时偷看一眼；沉静型够不着时前倾一点
   */
  private spontHand(t: number, ctx: Ctx): boolean {
    const s = this.s;
    const m = s.m2!;
    const hc = m.hc;
    const h = s.hand;
    let action: string | null = null;
    if (hc.stage === 'hold' && s.grasp.phase === 'HOLD_HUMAN' && !hc.prog) {
      const P = this.persona();
      const kind = P === 'A' ? 'tug' : P === 'C' ? 'palpate' : P === 'B' ? 'sigh' : pick(m.xr, ['tug', 'loosen', 'sigh'] as const);
      if (kind === 'sigh') s.sighNext = true;
      else if (!hc.ev) hc.ev = { kind, t0: t };
      action = 'fidget';
      this.emit('SPONTANEOUS', { action, kind });
    } else if (hc.stage === 'avoid' && h && h.present && h.seen && !hc.prog && hc.v < HC.vMove && !this.foreignGrasp()) {
      this.hcSet(t, 'avoid', 'peek');
      this.hcRun(t, 'hand.peek', buildPeek(this.hcCtx(ctx), this.handGeom(h), hc.close, hc.awayDir));
      action = 'peek';
      this.emit('SPONTANEOUS', { action });
    } else if (hc.stage === 'watch' && this.persona() === 'B' && h && h.present && !hc.prog && !this.foreignGrasp()) {
      this.hcRun(t, 'hand.leanIn', buildLeanIn(this.hcCtx(ctx), this.handGeom(h)));
      action = 'lean';
      this.emit('SPONTANEOUS', { action });
    }
    if (action === null) return false;
    const p = ctx.p;
    const range = s.band !== 'gone' && p.spontPresent ? p.spontPresent : p.spont;
    s.nextSpont = t + (sampleRange(s.rng, range) * ctx.age.spont * (1 - ENGINE.arousal.spont * s.arousal)) / Math.max(ctx.activity, 1e-3);
    return true;
  }

  private orient(t: number, ctx: Ctx): void {
    const s = this.s;
    if (!ctx.orientOk) {
      s.nextOrient = ctx.alive ? t + 0.5 : NEVER;
      return;
    }
    if (s.gesture && s.gesture.kind !== 'spont') {
      s.nextOrient = t + 1;
      return;
    }
    // v2：潜伏期里「注意到」= 一切停住，这时不张望（不然身体在屏气、触须指着刺激的时候自己转开）
    if (s.m2 && s.pending) {
      s.nextOrient = t + 1;
      return;
    }
    // v2 迎手链投入中（凑 / 缠 / 握 / 追 / 放开 / 找）：⑨ 顺延——别在伸手的半路上改主意
    if (s.m2 && ENGAGED.has(s.m2.hc.stage)) {
      s.nextOrient = t + 1;
      return;
    }
    // 看见了手：⑨ 朝向间隔到点 = 对这只手重新决定一次（迎 / 躲 / 不理），不再在整圈里随便挑方向
    if (s.hand?.seen) {
      if (s.grasp.phase !== 'IDLE' && s.grasp.phase !== 'RELEASE') s.nextOrient = t + 1;
      else this.decideHand(t, ctx, true);
      return;
    }
    const p = ctx.p;
    let mode: 'toward' | 'away' | 'random';
    let to: number;
    if (s.bearing !== null && chance(s.rng, p.toward)) {
      mode = 'toward';
      to = s.bearing;
    } else if (p.otherwise === 'away' && s.bearing !== null) {
      mode = 'away';
      to = clampYaw(wrapPi(s.bearing + Math.PI + uniform(s.rng, -0.5, 0.5)));
    } else {
      mode = 'random';
      to = uniform(s.rng, -Math.PI, Math.PI);
    }
    s.yawTarget = to;
    this.emit('ORIENT', { mode, to });
    s.nextOrient = t + sampleRange(s.rng, p.orient);
  }

  // ---------------------------------------------------------------- 手（HAND）

  /**
   * HAND 传感事实（2026-10-07，Lab 1-6）。出现（之前没有手）：人在哪的旧方位作废——手就是这个人，
   * 看见手以后才知道人在哪。读数更新：看见着又在视野里就跟着更新人的方位。离开：没看见过的手直接作废；
   * 看见过的留 loseAfter 秒记忆（stepHand 到点记 HAND_LOST gone），这段时间里回来接着原来的态度。
   */
  private handFact(e: Extract<SensorInput, { kind: 'HAND' }>, t: number): void {
    const s = this.s;
    let h = s.hand;
    if (!e.on) {
      if (s.m2) s.m2.hc.v = 0;
      if (!h) return;
      if (!h.seen) s.hand = null;
      else if (h.present) {
        h.present = false;
        h.goneAt = t;
        h.turning = false;
      }
      return;
    }
    if (s.m2) this.handFactV2(e, t, h);
    if (!h) {
      h = {
        bearing: 0, dist: 0, aimDir: 0, aimBend: 0, aimDist: 0, face: 0,
        present: true, goneAt: NEVER, seen: false, mode: null, noticeAt: NEVER, outSince: NEVER,
        steer: 0, steerFace: 0, turning: false, turnSign: 0, unwind: false,
      };
      s.hand = h;
      s.bearing = null;
    }
    h.present = true;
    h.goneAt = NEVER;
    h.bearing = wrapPi(e.bearing);
    h.dist = e.dist;
    h.aimDir = wrapPi(e.aimDir);
    h.aimBend = clamp(e.aimBend, 0, ARM_BEND_MAX);
    h.aimDist = e.aimDist;
    h.face = wrapPi(e.face);
  }

  /**
   * v2 迎手链要的读数：有效碰到半径、指针静止多久、指针速度（台架带；没带时按读数变化估），读数在差动平面上的
   * 速度（活力型往前看），以及读数一步跳太大（被抽走）的时刻。在 h 被这条读数改写之前调
   */
  private handFactV2(e: Extract<SensorInput, { kind: 'HAND'; on: true }>, t: number, h: HandMem | null): void {
    const hc = this.s.m2!.hc;
    const D = Math.min(0.5, 0.34 * clamp(e.aimBend, 0, ARM_BEND_MAX));
    const x = D * Math.cos(e.aimDir);
    const y = D * Math.sin(e.aimDir);
    hc.touch = e.touch ?? 32;
    const moved = !h || Math.hypot(x - hc.ax, y - hc.ay) > 0.01 || Math.abs(e.dist - h.dist) > 15;
    if (e.still !== undefined) hc.stillAt = t - e.still;
    else if (moved) hc.stillAt = t;
    hc.v = e.v ?? (h && hc.at >= 0 && t > hc.at ? Math.min(2000, (Math.abs(e.dist - h.dist) + Math.hypot(x - hc.ax, y - hc.ay) * gainAt(e.aimDist, D)) / (t - hc.at)) : 0);
    hc.vAt = t;
    if (hc.v >= hc.pullV || t - hc.pullT > 0.3) {
      hc.pullV = hc.v;
      hc.pullT = t;
    }
    if (h && hc.at >= 0 && t - hc.at > 1e-6 && t - hc.at < 0.5) {
      const dt = t - hc.at;
      hc.vx = 0.5 * hc.vx + 0.5 * ((x - hc.ax) / dt);
      hc.vy = 0.5 * hc.vy + 0.5 * ((y - hc.ay) / dt);
      // 读数一步跳过 0.06 / 20° = 被抽走（握着时这一下不跟）；手往外走（差动变小 / 离基座变远）= 往外拉
      const Dp = Math.hypot(hc.ax, hc.ay);
      const dDir = Math.abs(wrapPi(Math.atan2(y, x) - Math.atan2(hc.ay, hc.ax)));
      if (Math.abs(D - Dp) > HC.jumpD || (D > 0.05 && Dp > 0.05 && dDir > HC.jumpDir)) hc.jumpAt = t;
      if (D < Dp - 0.01 || e.aimDist > h.aimDist + 8) hc.outAt = t;
    } else {
      hc.vx = 0;
      hc.vy = 0;
    }
    hc.ax = x;
    hc.ay = y;
    hc.at = t;
  }

  /** 背着手的弯向：手就在臂梢上（要弯得很少，弯向读不准）时渐变成往下缩 */
  private awayDir(h: HandMem): number {
    return lerpAngle(MOTION.down, h.aimDir + Math.PI, smooth(h.aimBend / HAND.awayDirAt));
  }

  /** 手在机身上方（在摸壳）：不转身、不去够 */
  private handOnBody(h: HandMem): boolean {
    return h.dist < HAND.bodyR;
  }

  /**
   * 手（2026-10-07，Lab 1-6）：看见 → 决定 → 跟踪。有手时每步调一次（tick 里固定位置：补认之后、抓握之前）。
   *
   * - **看见**：活着且有响应时，手第一次进视野（机身朝向 ±120°），或正碰着臂——抽一次响应延迟（人格 ④，
   *   随衰老变慢），到点还在视野里（放宽到 ±130°）就算看见。延迟没到手又出了视野：等着，出视野超过
   *   3 s 才作罢（不在视野边上反复抽随机数）。看见之前机器不知道手在哪。
   * - **决定**：看见那一刻，以及之后每个 ⑨ 朝向间隔（经 orient），按 ⑩ 抽：迎；否则沉静 / 不稳定躲、
   *   活力 / 好奇看别处。看见那一下有个动作（迎 = 轻轻一伸，躲 = 往回一缩，看别处 = 瞥一眼再转开）。
   * - **丢失**：看见以后手出了视野（或离开画布）3 s——回到没看见；再进视野再重新看、重新决定。
   *   出了视野按最后看见的方位转，不偷看。正在绕回限位时不算丢（转身途中手会暂时出视野）。
   * - **跟踪**：只在可以转向时（诞生 40 s 后）、没有惊跳正在做、臂没在缠 / 握时写偏航目标。
   */
  private stepHand(t: number, ctx: Ctx): void {
    const s = this.s;
    const h = s.hand;
    if (!h) return;
    if (!h.present && t - h.goneAt > HAND.loseAfter) {
      if (h.seen) this.emit('HAND_LOST', { reason: 'gone' });
      s.hand = null;
      return;
    }
    if (!ctx.responsive) {
      if (h.seen || h.noticeAt < NEVER) this.forgetHand();
      return;
    }
    const keep = h.seen || h.noticeAt < NEVER;
    const inView =
      h.present && (Math.abs(wrapPi(h.bearing - s.yaw.x)) <= (keep ? HAND.fovKeep : HAND.fov) || s.electrode);
    if (inView) {
      h.outSince = NEVER;
      h.steer = h.bearing;
      h.steerFace = h.face;
    } else if (h.outSince >= NEVER || (h.seen && (h.turning || h.unwind))) {
      // 正在朝它转（或绕回限位）时手暂时出视野不算丢：记忆从转完那一刻才开始倒数
      h.outSince = t;
    }
    if (!h.seen) {
      if (h.noticeAt >= NEVER) {
        if (inView) h.noticeAt = t + sampleRange(s.rng, ctx.p.latency, VARIABILITY.response) * ctx.age.latency;
        return;
      }
      if (!inView) {
        if (t - h.outSince > HAND.loseAfter) h.noticeAt = NEVER;
        return;
      }
      if (t < h.noticeAt) return;
      h.seen = true;
      s.bearing = h.bearing;
      this.decideHand(t, ctx, false);
      return;
    }
    if (!inView && t - h.outSince > HAND.loseAfter) {
      this.emit('HAND_LOST', { reason: 'unseen' });
      this.forgetHand();
      return;
    }
    if (inView) s.bearing = h.bearing;
    const g = s.gesture;
    const startled = g !== null && g.kind === 'startle' && t < g.t0 + g.dur;
    const free = s.grasp.phase === 'IDLE' || s.grasp.phase === 'RELEASE';
    // v2：凑、够不着（探身 / 撑）的时候身体不动——扑以「身体静止」为门；看着 / 陪着 / 躲照常转
    const hc = s.m2?.hc;
    const still = !!hc && (hc.stage === 'approach' || hc.stage === 'strain');
    if (h.mode === null || h.mode === 'look' || !h.present || !ctx.orientOk || startled || !free || this.handOnBody(h) || still) {
      h.turning = false;
      // 不跟了：正在绕回的长路作废、就地停下（惊跳那一下的转向留着）
      if (h.unwind) {
        h.unwind = false;
        if (!startled) s.yawTarget = s.yawGoal;
      }
      return;
    }
    // 迎：转到让臂线对准手的朝向（臂偏在机身中线右侧）；躲：机身中线背对手（v2：侧身，手留在 ±105°，不背对、不会忘掉手）
    let want = h.mode === 'toward' ? h.steerFace : hc ? wrapPi(h.steer - hc.side * HC.avoidSide) : wrapPi(h.steer + Math.PI);
    if (hc && h.mode === 'toward' && h.aimDist < HAND.armL) {
      // v2：手在臂长以内时不让笔直的臂线穿过手——机身转过去会把直臂整根扫向手，陪着的时候就碰上了。
      // 从对准的朝向往当前朝向退一个角度，直臂停在手旁边、隔一个停距，之后由臂去弯、去凑
      const a = Math.asin(Math.min(1, (standOf(this.handGeom(h)) + 20) / Math.max(1e-6, h.aimDist)));
      const d = wrapPi(h.steerFace - s.yaw.x);
      want = Math.abs(d) <= a ? s.yaw.x : wrapPi(h.steerFace - Math.sign(d) * a);
    }
    const off = Math.abs(wrapPi(want - s.yaw.x));
    if (!h.turning) {
      let need: boolean;
      if (hc && h.mode === 'toward') {
        // v2 够得着的判据更严（≤ 0.98 L、aimBend ≤ 1.41）：够不着、而且没对准才转身（对准了还够不着，转身也没用——
        // 交给够不着那一串）；臂先身后（偏航目标晚 0.25/k s 才写）
        need = !reachable(h.aimBend, h.aimDist) && off > HAND.turnAt;
        if (need) hc.turnAt = t + HC.armLead / Math.sqrt(s.speed);
      } else {
        const reach = h.aimBend <= HAND.reachBend && h.aimDist <= HAND.reachFar * HAND.armL;
        need = h.mode === 'away' ? off > HAND.turnAt : h.aimBend > HAND.reachBend || (off > HAND.turnAt && !reach);
      }
      if (need) h.turning = true;
    }
    // v2 迎：转身途中手已经够得着了——停转，剩下的交给臂
    if (h.turning && hc && h.mode === 'toward' && reachable(h.aimBend, h.aimDist)) {
      h.turning = false;
      h.unwind = false;
      s.yawTarget = s.yawGoal;
      return;
    }
    if (h.turning && hc && t < hc.turnAt) return;
    if (h.turning) {
      s.yawTarget = this.handYawGoal(want);
      // 转到了（或停在 ±π 限位上等着、已经到位）：不再转
      const parked = !h.unwind && Math.abs(s.yaw.x - s.yawTarget) < HAND.settle && Math.abs(s.yawGoal - s.yawTarget) < 1e-9;
      if (off < HAND.settle || parked) h.turning = false;
    }
  }

  /**
   * 转向 want（世界系方位）的偏航目标，参考点取限速后的 yawGoal（实际朝向有滞后，拿它算会提前掉头）：
   * - 取近路；方位差过了 150°（手几乎在正背后）就锁定转向，回到 90° 以内才解锁——躲开时手抖一下不来回掉头；
   *   刚锁时两个方向都在行程内，取往行程中间去的那个（不缠线）；
   * - 近路越过 ±π 限位不到 60°：停在限位等（臂还能补一点）；超过：绕回去（记一条 ORIENT unwind），
   *   一直绕到近路回到行程内为止。
   */
  private handYawGoal(want: number): number {
    const s = this.s;
    const h = s.hand;
    if (!h) return s.yawTarget;
    const ref = s.yawGoal;
    let d = wrapPi(want - ref);
    if (Math.abs(d) > HAND.antipode) {
      if (h.turnSign === 0) {
        const alt = d - Math.sign(d) * TAU;
        const okD = Math.abs(ref + d) <= Math.PI;
        const okA = Math.abs(ref + alt) <= Math.PI;
        const pickAlt = okA && (!okD || Math.abs(ref + alt) < Math.abs(ref + d));
        h.turnSign = Math.sign(pickAlt ? alt : d) || 1;
      }
      if (h.turnSign > 0 && d < 0) d += TAU;
      else if (h.turnSign < 0 && d > 0) d -= TAU;
    } else if (Math.abs(d) < HAND.unlock) h.turnSign = 0;
    const T = ref + d;
    if (Math.abs(T) <= Math.PI) {
      h.unwind = false;
      return T;
    }
    if (h.unwind || Math.abs(T) - Math.PI >= HAND.unwindAt) {
      const goal = T - Math.sign(T) * TAU;
      if (!h.unwind) {
        h.unwind = true;
        // 追 / 握着被牵着走：抓握中 stepHand 每帧清掉 unwind，这里每帧都会重判成新的绕回——一个阶段只记一条
        const hc = s.m2?.hc;
        const dedupe = !!hc && (hc.stage === 'chase' || hc.stage === 'hold');
        if (!dedupe || !hc.unwindLogged) this.emit('ORIENT', { mode: 'unwind', to: goal });
        if (dedupe) hc.unwindLogged = true;
      }
      return goal;
    }
    return Math.sign(T) * Math.PI;
  }

  /**
   * 看见手 / ⑨ 到点（经 orient）：迎、躲还是看别处（按 ⑩，抽一次随机数）。cause = 'startle'：被手吓到后
   * 不抽，直接换成 ⑩ 的「不朝人时」那一项（沉静 / 不稳定躲、活力 / 好奇看别处），免得「伸过去—碰到—惊跳—再伸」打转。
   */
  private decideHand(t: number, ctx: Ctx, again: boolean, cause?: 'startle'): void {
    const s = this.s;
    const h = s.hand;
    if (!h) return;
    const p = ctx.p;
    const other: HandMode = p.otherwise === 'away' ? 'away' : 'look';
    const mode: HandMode = cause ? other : chance(s.rng, p.toward) ? 'toward' : other;
    h.mode = mode;
    h.turning = false;
    h.turnSign = 0;
    // 重新决定打断了正在绕回的长路：就地停下（下面的「看别处」会另给目标）
    if (h.unwind) {
      h.unwind = false;
      if (!cause) s.yawTarget = s.yawGoal;
    }
    const free = s.grasp.phase === 'IDLE' || s.grasp.phase === 'RELEASE';
    const rec: Record<string, LogValue> = { mode, again };
    if (cause) rec.cause = cause;
    // 迎 / 躲：此前（没看见手时）定下的张望目标作废，朝向从此由手的跟踪接管（就地停住，要不要转由分层判）
    if (mode !== 'look' && !cause && ctx.orientOk && free) s.yawTarget = s.yawGoal;
    // 看别处：相对当前朝向转 30–70°，转向背着手的那一侧（不整圈乱转）
    if (mode === 'look' && !cause && ctx.orientOk && free) {
      const side = wrapPi(h.steer - s.yaw.x) >= 0 ? -1 : 1;
      s.yawTarget = clampYaw(s.yaw.x + side * uniform(s.rng, HAND.lookMin, HAND.lookMax));
      rec.look = s.yawTarget;
    }
    this.emit('HAND_SEEN', rec);
    if (!cause) s.nextOrient = t + sampleRange(s.rng, p.orient);
    if (s.m2) {
      // v2 第一次看见：还没发的在场回应作废（看见手以后在场档被吸收，不另起程序、不另抽 ⑩），在跑的「注意到」收掉
      if (!again) {
        if (s.pending && s.pending.kind === 'PRESENCE') {
          this.emit('RESPONSE_DROP', { to: s.pending.id, reason: 'hand' });
          s.pending = null;
          if (s.m2.prog && s.m2.prog.name === 'register') this.cutProg();
        }
      }
      this.hcDecide(t, ctx, mode, cause);
      if (!again && mode === 'look' && !s.gesture && !s.pending && s.grasp.phase === 'IDLE') this.noticeBeat(t, ctx, mode);
      return;
    }
    if (!again && !s.gesture && !s.pending && s.grasp.phase === 'IDLE') this.noticeBeat(t, ctx, mode);
  }

  /** 看见那一下：迎 = 朝手轻轻一伸（吸一口气、触须一抖、出一声）；躲 = 背着手一缩；看别处 = 朝手瞥一眼 */
  private noticeBeat(t: number, ctx: Ctx, mode: HandMode): void {
    const s = this.s;
    const h = s.hand;
    if (!h) return;
    if (s.m2) {
      this.run(`notice.${mode}`, t, buildNotice(this.buildCtx(ctx, 0, 0), mode, h.aimDir, h.aimBend, this.awayDir(h)), 'spont', 'attend', -1);
      return;
    }
    const toward = mode !== 'away';
    const dir = toward ? h.aimDir : h.aimDir + Math.PI;
    const bend = (toward ? Math.min(1, h.aimBend) * HAND.noticeBend + 0.15 : HAND.noticeBend + 0.15) * ctx.vigor;
    s.gesture = {
      kind: 'spont',
      action: 'attend',
      t0: t,
      dur: this.gestureDur(HAND.notice),
      dir,
      dir2: dir,
      bend,
      feeler: MOTION.flickAmp * 0.6 * ctx.vigor,
      breath: toward ? HAND.noticeBreath : 0,
      push: toward ? 0 : HAND.noticePush,
      to: -1,
    };
    s.voiceUntil = t + MOTION.voiceBurst;
  }

  /** 注意力清零（新一世、死亡、手丢了）：传感事实留着，看见与态度作废；正在绕回的转身就地停下 */
  private forgetHand(): void {
    const s = this.s;
    const h = s.hand;
    if (!h) return;
    if (s.m2) {
      const t = s.tick / HZ;
      // 手链的缠（追途中手丢了）：清手链之前把它的限位提前到 0.5 s 后——清掉以后没人再缩短它，
      // 会按 hcLost 的兜底时长一直缠下去（真值表照旧：到限位无张力 = 抓空）
      if (s.grasp.phase === 'WRAP' && this.hcGrasp()) s.grasp.dur = Math.min(s.grasp.dur, t - s.grasp.t0 + 0.5);
      this.hcReset(t, 'off');
    }
    if (h.unwind) s.yawTarget = s.yawGoal;
    h.seen = false;
    h.mode = null;
    h.noticeAt = NEVER;
    h.outSince = NEVER;
    h.turning = false;
    h.turnSign = 0;
    h.unwind = false;
  }


  // ---------------------------------------------------------------- 迎手链（动作词汇 v2，2026-10-08 第八批）

  /** 读数 → 建表用的手 */
  private handGeom(h: HandMem): HandGeom {
    const hc = this.s.m2!.hc;
    return { Dh: Math.min(0.5, 0.34 * h.aimBend), dir: h.aimDir, r: h.aimDist, touch: hc.touch, v: hc.v };
  }

  /** 换阶段 / 拍（变了才记 HAND_STAGE） */
  private hcSet(t: number, stage: HcStage, beat = ''): void {
    const hc = this.s.m2!.hc;
    if (hc.stage === stage && hc.beat === beat) return;
    if (hc.stage !== stage) {
      hc.stage = stage;
      hc.st0 = t;
      hc.unwindLogged = false;
    }
    hc.beat = beat;
    hc.bt0 = t;
    this.emit('HAND_STAGE', beat ? { stage, beat } : { stage });
  }

  /** 起手链的一个程序（起点 = 此刻给出的姿态） */
  private hcRun(t: number, name: string, phases: ProgPhase[]): void {
    const hc = this.s.m2!.hc;
    hc.prog = startProgram(name, t, phases, this.curPose());
    hc.seen = -1;
  }

  /** 迎手链清零：程序作废，回合的抽值作废，阶段回 to（off / track / avoid） */
  private hcReset(t: number, to: HcStage = 'off'): void {
    const m = this.s.m2;
    if (!m) return;
    const hc = m.hc;
    hc.prog = null;
    hc.plan = [];
    hc.ev = null;
    hc.holdFrom = null;
    hc.holdT0 = NEVER;
    hc.tracT = NEVER;
    hc.gDrawn = false;
    hc.nudges = 0;
    hc.seatEnd = NEVER;
    hc.searches = 0;
    hc.yawSlow = false;
    hc.unwindLogged = false;
    this.deepEnd(t);
    this.hcSet(t, to);
  }

  /** 迎手链的 BuildCtx：τ 用本回合抽到的那个 */
  private hcCtx(ctx: Ctx): BuildCtx {
    return this.buildCtx(ctx, this.s.m2!.hc.tau, 0);
  }

  /** 回合开始（看见手决定迎 / 躲）：用表情子流抽一个 ④，之后这一回合的 take、停半拍、定住感觉都按它 */
  private hcBout(ctx: Ctx): void {
    const s = this.s;
    const hc = s.m2!.hc;
    hc.tau = sampleRange(s.m2!.xr, ctx.p.latency, VARIABILITY.response) * ctx.age.latency;
    hc.gDrawn = false;
    hc.armed = true;
  }

  /** 本回合的 ⑤（主随机流；D 带符号）：凑 / 碰到时才抽，一回合一次 */
  private hcGain(ctx: Ctx): number {
    const s = this.s;
    const hc = s.m2!.hc;
    if (!hc.gDrawn) {
      let g = sampleRange(s.rng, ctx.p.gain, VARIABILITY.response) * ctx.age.gain;
      if (ctx.p.gainSigned && chance(s.rng, 0.5)) g = -g;
      hc.g = g;
      hc.gDrawn = true;
    }
    return hc.g;
  }

  /** 读数（差动平面）离武装参照多少 mm */
  private hcMovedMm(h: HandMem): number {
    const hc = this.s.m2!.hc;
    const D = Math.min(0.5, 0.34 * h.aimBend);
    const x = D * Math.cos(h.aimDir);
    const y = D * Math.sin(h.aimDir);
    return Math.hypot(Math.hypot(x - hc.refX, y - hc.refY) * gainAt(h.aimDist, D), h.aimDist - hc.refR);
  }

  private hcArmRef(h: HandMem): void {
    const hc = this.s.m2!.hc;
    const D = Math.min(0.5, 0.34 * h.aimBend);
    hc.refX = D * Math.cos(h.aimDir);
    hc.refY = D * Math.sin(h.aimDir);
    hc.refR = h.aimDist;
  }

  /** 躲的侧别：转得少的那边；差不多（10° 内）时选让手在左（臂在右，离手远） */
  private avoidSide(h: HandMem): number {
    const s = this.s;
    const left = wrapPi(h.steer - HC.avoidSide - s.yaw.x);
    const right = wrapPi(h.steer + HC.avoidSide - s.yaw.x);
    return Math.abs(left) <= Math.abs(right) + (10 * Math.PI) / 180 ? 1 : -1;
  }

  /** 躲的姿态参照：越近越缩、背着手 */
  private avoidRef(h: HandMem): void {
    const hc = this.s.m2!.hc;
    hc.close = 1 - smooth((h.dist - HAND.awayNear) / (HAND.awayFar - HAND.awayNear));
    hc.awayDir = this.awayDir(h);
  }

  /**
   * 深卷门（研究笔记 §9.6，「用，但不要用太多」）：执行层放开深卷、手的弯向在腱轴 0（臂梢朝上）±8°、读数饱和
   * （平卷 0.48 够不着）、离基座 ≤ 0.95 L、√k_v ≥ 0.8 且本回合 |⑤|/0.5 ≥ 0.4（沉静型永远不开）、本轮预算没用完、不在冷却
   */
  private deepGate(h: HandMem, t: number): boolean {
    const hc = this.s.m2!.hc;
    return this.deepGeom(h, t) && hc.gDrawn && Math.abs(hc.g) / 0.5 >= 0.4;
  }

  /** 深卷门里与本回合 ⑤ 无关的那几条（几何、√k_v、预算、冷却）：凑之前先看它，开着才去抽 ⑤ 判整道门 */
  private deepGeom(h: HandMem, t: number): boolean {
    const s = this.s;
    const m = s.m2!;
    const hc = m.hc;
    if (!m.deepOk) return false;
    if (Math.abs(wrapPi(h.aimDir)) > (8 * Math.PI) / 180) return false;
    if (h.aimBend < 1.45 || h.aimDist > 0.95 * HAND.armL) return false;
    if (Math.sqrt(s.speed) < 0.8) return false;
    return t >= hc.deepCool && hc.deepUsed < 4 && hc.deepOffAt >= NEVER;
  }

  /** 握着时还在不在深卷窗口里（比进门宽一点：±12°、aimBend ≥ 1.40、≤ 0.98 L——指针抖一像素不该把深卷松掉） */
  private deepWindow(h: HandMem): boolean {
    if (!this.s.m2!.deepOk) return false;
    return Math.abs(wrapPi(h.aimDir)) <= (12 * Math.PI) / 180 && h.aimBend >= 1.4 && h.aimDist <= 0.98 * HAND.armL;
  }

  /** 深卷用完 / 回合结束：开始冷却 45 s */
  private deepEnd(t: number): void {
    const hc = this.s.m2!.hc;
    if (hc.deepUsed > 0) {
      hc.deepCool = t + 45;
      hc.deepUsed = 0;
    }
    hc.deepOffAt = NEVER;
  }

  /**
   * 看见手以后的决定落到手链（decideHand 调；v2 才有）：迎 → 陪着（take + 第一跳）；躲 → 侧身（定住 → 收）；
   * 看别处 → 手链关（现行的 glance）。投入中（凑 / 缠 / 握……）不打断——⑨ 在投入中本来就顺延
   */
  private hcDecide(t: number, ctx: Ctx, mode: HandMode, cause?: string): void {
    const s = this.s;
    const m = s.m2!;
    const hc = m.hc;
    const h = s.hand!;
    if (ENGAGED.has(hc.stage) && !cause) return;
    const was = hc.stage;
    hc.rearmed = false;
    if (mode === 'toward') {
      if (was === 'track' && !cause) return;
      this.hcReset(t, 'track');
      this.hcBout(ctx);
      this.hcArmRef(h);
      // 看见那一下：先「看」（触须先指过去、吸一口、一声上扬），臂再第一跳（先转方向后伸长）。正在做别的动作就先等它
      if (!m.prog && h.present && !this.foreignGrasp()) {
        const ph = buildTake(this.hcCtx(ctx), this.handGeom(h));
        this.hcRun(t, 'hand.take', ph);
        const to = ph.find((p) => p.name === 'firstHop')?.arm;
        if (to && typeof to === 'object') this.hcTarget(to);
      }
      return;
    }
    if (mode === 'away') {
      this.hcReset(t, 'avoid');
      this.hcBout(ctx);
      hc.side = this.avoidSide(h);
      hc.turnAt = t + HC.avoidLag;
      hc.relieved = false;
      hc.farSince = NEVER;
      this.avoidRef(h);
      if (!m.prog && !this.foreignGrasp()) this.hcRun(t, 'hand.shrink', buildShrink(this.hcCtx(ctx), hc.close, hc.awayDir, was !== 'avoid'));
      return;
    }
    this.hcReset(t, 'off');
  }

  /** 预期接触：看见着、在视野里、态度是迎、手链在陪 / 凑 / 够 / 看 / 找（或追）的时候碰到臂 */
  private expectedStage(): boolean {
    const s = this.s;
    const m = s.m2;
    const h = s.hand;
    if (!m || !h || !h.seen || !h.present || h.mode !== 'toward') return false;
    // 惊跳正忙（反射 + 凝住 + 恢复的第一段）：照常记正忙、做完再补认，不当场起缠抢走惊跳的臂
    if (m.prog?.name === 'startle' && s.tick / HZ < m.startleBusy) return false;
    const st = m.hc.stage;
    if (st === 'chase') return s.grasp.phase === 'WRAP';
    if (st === 'wrap' || st === 'hold') return true;
    return (st === 'track' || st === 'approach' || st === 'strain' || st === 'watch' || st === 'search' || st === 'off') && s.grasp.phase === 'IDLE';
  }

  /**
   * 预期接触（取代乘法打折的显式规则，研究笔记 §9.3）：**不判惊跳、不排队、不再付一次 ④**。只抽 ⑪ 判要不要先一缩
   * （0.5·I/θ ≥ 0.65）；手伸过来碰（没在凑）时抽 ⑤，不稳定型抽到负就缩回去转躲；否则当帧起缠。返回传感记录的去向
   */
  private expectedTouch(e: Extract<SensorInput, { kind: 'ARM_TOUCH' }>, I: number, id: number, t: number, ctx: Ctx): Outcome {
    const s = this.s;
    const m = s.m2!;
    const hc = m.hc;
    const h = s.hand!;
    if (hc.stage === 'wrap' || hc.stage === 'hold') return 'busy';
    const th = sampleRange(s.rng, ctx.p.startle);
    const wince = th > 0 && (0.5 * I) / th >= V2.nearThreshold;
    const byHand = e.by !== 'arm';
    const by = byHand ? 'hand' : 'arm';
    if (hc.stage === 'chase') {
      this.beginWrapV2(t, ctx, { byHand, wince: false, chase: true });
      this.emit('RESPONSE', { to: id, latency: 0, gain: hc.g, arm: true, feeler: true, turn: 'hand', grasp: true, motion: 'grasp.wrap', expected: true, by });
      return 'respond';
    }
    // 一只正在动的手从臂上蹭过去（不是凑过去碰到的）：不缠，只是注意到；手若停在臂上，0.4 s 后再缠（重新武装）
    if (byHand && hc.v >= HC.vMicro && hc.stage !== 'approach') {
      hc.rearmAt = t + 0.4;
      hc.emptyLast = false;
      this.emit('RESPONSE', { to: id, latency: 0, motion: 'hand.brush', expected: true, by });
      return 'respond';
    }
    const g = this.hcGain(ctx);
    if (g < 0) {
      // 不稳定型 ⑤ 抽到负：缩回去，侧身躲到下一次 ⑨
      this.avoidRef(h);
      h.mode = 'away';
      this.hcReset(t, 'avoid');
      hc.side = this.avoidSide(h);
      hc.turnAt = t + HC.avoidLag;
      if (m.prog && m.prog.name !== 'startle') this.cutProg();
      this.hcRun(t, 'hand.recoil', buildRecoil(this.hcCtx(ctx), hc.awayDir));
      this.emit('RESPONSE', { to: id, latency: 0, gain: g, arm: true, feeler: false, turn: 'hand', grasp: false, motion: 'grasp.recoil', expected: true, by });
      this.emit('HAND_SEEN', { mode: 'away', again: true, cause: 'recoil' });
      return 'respond';
    }
    this.beginWrapV2(t, ctx, { byHand, wince, chase: false });
    const rec: Record<string, LogValue> = { to: id, latency: 0, gain: g, arm: true, feeler: true, turn: 'hand', grasp: true, motion: 'grasp.wrap', expected: true, by };
    if (wince) rec.wince = true;
    this.emit('RESPONSE', rec);
    return 'respond';
  }

  /** 收掉正在跑的非惊跳程序（进缠时；它的提示不再盖住缠） */
  private cutProg(): string | null {
    const s = this.s;
    const m = s.m2!;
    if (!m.prog || m.prog.name === 'startle') return null;
    const name = m.prog.name;
    m.prog = null;
    if (s.gesture && s.gesture.kind !== 'startle') s.gesture = null;
    return name;
  }

  /**
   * v2 的缠（看见了手）：[一缩] → 定住感觉 → 贴上 / 合拢 → 等呼气 → 收紧 × n。抓握状态机照旧（WRAP，真值表不变），
   * 到限位的时长 = 程序全长 + 0.5 s；catchT 初值「永不」，贴上做完且臂停稳时由 stepHandChain 写
   */
  private beginWrapV2(t: number, ctx: Ctx, o: { byHand: boolean; wince: boolean; chase: boolean; waited?: boolean }): void {
    const s = this.s;
    const m = s.m2!;
    const hc = m.hc;
    const h = s.hand!;
    const cut = this.cutProg();
    const gm = this.handGeom(h);
    const cur = this.curPose();
    const Dc = dOf(cur);
    const deep = this.deepGate(h, t);
    const sat = h.aimBend >= 1.45;
    // 基准：读数给的「刚好穿过手」与臂此刻（按观测器）实际所在的差动取大——碰到时臂常常已经越过读数估的那一点，
    // 拿读数当基准会让「贴上」先把臂往回拉离手（探针实测往回 36 mm，读作被碰一缩）
    const Darm = Math.hypot(m.obs[2], m.obs[6]);
    const Dref = sat || deep ? Dc : Math.min(HC.flatMax, Math.max(gm.Dh, Darm));
    const gN = Math.min(1, Math.abs(this.hcGain(ctx)) / 0.5);
    const [cx, cy] = this.cmdXY();
    const settle = obsForecast(m.obs, cx, cy, 0.05, 0.8);
    const T = s.period * (1 - ENGINE.arousal.breath * s.arousal);
    const pounced = hc.stage === 'approach' && hc.beat === 'pounce';
    const { phases, seat } = buildWrap(this.hcCtx(ctx), gm, {
      byHand: o.byHand,
      wince: o.wince,
      chase: o.chase,
      waited: o.waited ?? false,
      pounced,
      n: cinchCount(gN),
      phi: s.phi,
      period: T,
      settle,
      Dref,
      deep,
    });
    hc.plan = [];
    hc.Dref = Dref;
    hc.dBase = Dref;
    hc.dhAt = Math.min(gm.Dh, HC.flatMax);
    hc.dirRef = deep ? 0 : gm.dir;
    hc.lastD = Dref;
    hc.lastDir = gm.dir;
    this.hcSet(t, 'wrap', o.chase ? 'regrab' : o.byHand ? 'receive' : 'grab');
    this.hcRun(t, 'grasp.wrap', phases);
    hc.seatEnd = t + phases.slice(0, seat + 1).reduce((a, p) => a + p.dur, 0);
    const chases = o.chase ? s.grasp.chases : 0;
    // 到限位（真值表 EMPTY）= 贴上做完再等 1.5 s（臂停稳 ≤ 1 s 之后才会卡住；之后的收紧是握住以后的事，不必等它）
    s.grasp = {
      ...s.grasp,
      phase: 'WRAP',
      t0: t,
      dur: hc.seatEnd - t + 1.5,
      dir: gm.dir,
      from: Math.min(1, cur.bend),
      chases,
      catchT: NEVER,
    };
    const rec: Record<string, LogValue> = { chase: o.chase };
    if (cut) rec.cut = cut;
    this.emit('GRASP_START', rec);
  }

  /** 此刻给出的指令在差动平面上的位置（观测器的输入，与台架同一换算） */
  private cmdXY(): [number, number] {
    const s = this.s;
    const b = Math.min(1, Math.hypot(s.armX.x, s.armY.x));
    const dir = b > 1e-9 ? Math.atan2(s.armY.x, s.armX.x) : 0;
    const D = 0.34 * b + 0.16 * s.wrap.x + (s.m2 && s.m2.deepOk ? 0.3773 * s.m2.deep : 0);
    return [D * Math.cos(dir), D * Math.sin(dir)];
  }

  /** 观测器说臂停稳了没有 */
  private settled(ev: number): boolean {
    const [cx, cy] = this.cmdXY();
    return obsSettled(this.s.m2!.obs, cx, cy, ev);
  }

  /** 记下这一跳的目标（差动平面）：手猛挪 = 新目标离它超过 jump */
  private hcTarget(p: Pose): void {
    const hc = this.s.m2!.hc;
    hc.tgtX = dOf(p) * Math.cos(p.dir);
    hc.tgtY = dOf(p) * Math.sin(p.dir);
  }

  /** 凑：手停稳、够得着 → 抽 ⑤，按人格排拍序 */
  private beginApproach(t: number, ctx: Ctx, h: HandMem): void {
    const hc = this.s.m2!.hc;
    this.hcArmRef(h);
    const g = this.hcGain(ctx);
    const deep = this.deepGate(h, t);
    hc.plan = approachPlan(this.hcCtx(ctx), this.handGeom(h), { negative: g < 0, deep });
    hc.nudges = 0;
    this.nextApproachBeat(t, ctx, h);
  }

  private nextApproachBeat(t: number, ctx: Ctx, h: HandMem): void {
    const hc = this.s.m2!.hc;
    const beat = hc.plan.shift() as ApproachBeat | undefined;
    if (!beat) return;
    this.hcSet(t, 'approach', beat);
    const gm = this.handGeom(h);
    const Dref = this.deepGate(h, t) ? dOf(this.curPose()) : gm.Dh;
    this.hcRun(t, `hand.${beat}`, buildApproachBeat(this.hcCtx(ctx), gm, beat, Dref));
    hc.beatEnd = t + totalDur(hc.prog!);
  }

  /** 够不着：探身 · 撑 · 再撑 · 泄气 → 看着（沉静型不探身，直接看着） */
  private beginStrain(t: number, ctx: Ctx, h: HandMem): void {
    const hc = this.s.m2!.hc;
    hc.armed = false;
    this.hcArmRef(h);
    if (this.persona() === 'B') {
      this.hcSet(t, 'watch');
      hc.prog = null;
      return;
    }
    this.hcSet(t, 'strain', 'stretch');
    this.hcRun(t, 'hand.strain', buildStrain(this.hcCtx(ctx), this.handGeom(h), strainTries(ctx.p.toward)));
  }

  /** 凑走完没碰到：推两下 → 算一次够不着（泄气）→ 看着 */
  private approachFailed(t: number, ctx: Ctx, h: HandMem): void {
    const hc = this.s.m2!.hc;
    // 深卷的卷已经卷到上限：再推只会被离轴封顶拉回 0.48（读作缩手），直接算一次够不着
    if (hc.nudges < HC.nudges && hc.beat !== 'curl') {
      hc.nudges++;
      this.hcSet(t, 'approach', 'nudge');
      this.hcRun(t, 'hand.nudge', buildApproachBeat(this.hcCtx(ctx), this.handGeom(h), 'nudge'));
      hc.beatEnd = t + totalDur(hc.prog!);
      return;
    }
    hc.armed = false;
    this.hcArmRef(h);
    this.hcSet(t, 'watch', 'deflate');
    this.hcRun(t, 'hand.deflate', buildStrain(this.hcCtx(ctx), this.handGeom(h), 0).filter((p) => p.name === 'deflate'));
  }

  /** 握着时的提示：持续的哼 + 小动静（屏气一下）覆盖 */
  private holdCueNow(): Cues {
    const s = this.s;
    const hc = s.m2!.hc;
    const base = holdCue(this.persona());
    if (hc.ev && hc.ev.kind === 'freeze') return { ...base, breath: { rate: 0 }, feel: { pose: 'still' } };
    return base;
  }

  /**
   * 迎手链每步（tick 里紧接 stepHand 之后；只有 v2）：拍间推进、门、跟手、握持的小动静、躲与偷看、重新武装。
   * 臂由 stepArm 按优先级写（§9.3：惊跳 > 投入中的手链 > 其它程序 > 陪着 / 看着 / 躲的手链 > 静息）
   */
  private stepHandChain(t: number, ctx: Ctx): void {
    const s = this.s;
    const m = s.m2!;
    const hc = m.hc;
    const h = s.hand;
    hc.yawSlow = false;
    if (t - hc.vAt > 0.25) hc.v = 0;
    if (!ctx.responsive) {
      if (hc.stage !== 'off' || hc.prog) this.hcReset(t, 'off');
      return;
    }
    const grasping = s.grasp.phase !== 'IDLE';
    const seen = !!h && h.seen;
    // 手没看见了（丢了 / 新一世）：抓握还在走时让它走完（真值表管），放开与找也做完（在丢手的地方找）；否则手链关
    const st0 = hc.stage;
    const carryOn = st0 === 'search' || st0 === 'release' || (grasping && (st0 === 'wrap' || st0 === 'hold' || st0 === 'chase'));
    if (!seen && !carryOn && !(st0 === 'off' && hc.prog)) {
      if (hc.stage !== 'off' || hc.prog) this.hcReset(t, 'off');
      return;
    }
    // 旧路的抓握在走（不归手链管）：手链不起程序、不写臂。投入中的阶段（找 / 放开……）就地收掉，抓握走完再从此刻重来
    if (this.foreignGrasp()) {
      hc.prog = null;
      if (ENGAGED.has(hc.stage)) this.hcReset(t, seen && h!.mode === 'toward' ? 'track' : 'off');
      return;
    }
    // 别的程序（回应 / 注意到 / 看别处 / 自发 / 惊跳）在写臂时，陪着的跳暂停（程序作废，走完从此刻重跳）。
    // 只放提示的程序（投入中 / 陪着时起的触须抖、回应）不暂停手链
    if (m.prog && !m.progCue && !ENGAGED.has(hc.stage)) {
      hc.prog = null;
      return;
    }
    const stage = hc.stage;
    const gm = h ? this.handGeom(h) : null;
    const k = Math.sqrt(s.speed);
    switch (stage) {
      case 'off': {
        if (!h || !h.present) return;
        if (h.mode === 'toward') {
          this.hcSet(t, 'track');
          return;
        }
        if (h.mode === 'away' && hc.relieved && h.dist < HC.reliefR) {
          // 松了口气以后手又回来：重新侧身收起
          hc.relieved = false;
          this.hcSet(t, 'avoid');
          this.avoidRef(h);
          hc.side = this.avoidSide(h);
          hc.turnAt = t + HC.avoidLag;
          this.hcRun(t, 'hand.shrink', buildShrink(this.hcCtx(ctx), hc.close, hc.awayDir, true));
        }
        return;
      }
      case 'track': {
        if (!h || !gm || h.mode !== 'toward') return;
        if (!h.present) return;
        // 放开后手不动 / 蹭过去的手停在了臂上：到点再来一次（抓空后每 ⑨ 至多一次）。没排过的（惊跳、新一世、
        // 旧路松手以后手一直搭在臂上）从此刻排一次——不然这道门永远打不开
        if (s.electrode && !grasping && hc.rearmAt >= NEVER) hc.rearmAt = t + HC.rearm;
        if (s.electrode && !grasping && t >= hc.rearmAt && hc.v < HC.vMove && !(hc.emptyLast && hc.rearmed)) {
          hc.rearmAt = NEVER;
          if (hc.emptyLast) hc.rearmed = true;
          this.emit('CONTACT', { to: -1, rearm: true });
          this.beginWrapV2(t, ctx, { byHand: false, wince: false, chase: false });
          return;
        }
        const ph = hc.prog ? hc.prog.phases[hc.prog.idx] : null;
        const fixating = !hc.prog || (ph !== null && ph !== undefined && ph.name === 'fixate');
        const inFix = !hc.prog ? Infinity : ph && ph.name === 'fixate' ? t - hc.prog.ts : -1;
        const still = t - hc.stillAt;
        // 手已经搭在臂上（电极开着）：不凑、不撑——等上面的重新武装再缠
        if (fixating && !h.turning && !this.handOnBody(h) && !s.electrode && still >= stillOf(hc.tau) && hc.v < HC.vMove) {
          // 平卷够得着就凑；平卷够不着但深卷的几何对（手在臂中段正上方）：抽 ⑤，整道门开了才凑（沉静型永远开不了）
          if (reachable(h.aimBend, h.aimDist) || (this.deepGeom(h, t) && (this.hcGain(ctx), this.deepGate(h, t)))) {
            this.beginApproach(t, ctx, h);
            return;
          }
          if (hc.armed || this.hcMovedMm(h) > HC.strainRearm) {
            this.beginStrain(t, ctx, h);
            return;
          }
        }
        // 一跳一停：停够了、臂停稳了、目标挪开了才跳；手猛挪就不等
        const lead = { x: Math.max(-HC.leadMax, Math.min(HC.leadMax, hc.vx * HC.leadT)), y: Math.max(-HC.leadMax, Math.min(HC.leadMax, hc.vy * HC.leadT)) };
        const c = this.hcCtx(ctx);
        const target = hopTarget(c, gm, lead);
        const err = poseDist(this.curPose(), target);
        const moved = hc.prog ? Math.hypot(dOf(target) * Math.cos(target.dir) - hc.tgtX, dOf(target) * Math.sin(target.dir) - hc.tgtY) : 0;
        if (moved > HC.jump || (fixating && inFix >= dwellOf(c) && this.settled(0.05) && err > epsOf(this.persona(), hc.tau))) {
          this.hcRun(t, 'hand.hop', buildHop(c, gm, lead));
          this.hcTarget(target);
        }
        return;
      }
      case 'approach': {
        if (!h || !gm) return;
        const beat = hc.beat as ApproachBeat;
        // 手又动了（扑已经起了的除外）：回去陪着，从此刻跳
        const hx = gm.Dh * Math.cos(gm.dir) - hc.refX;
        const hy = gm.Dh * Math.sin(gm.dir) - hc.refY;
        if (beat !== 'pounce' && beat !== 'drop' && h.present && (hc.v > HC.vMove || Math.hypot(hx, hy) > 0.06)) {
          this.hcReset(t, 'track');
          hc.gDrawn = true;
          return;
        }
        const el = t - hc.bt0;
        let next = !hc.prog;
        if (beat === 'hover') {
          const ev = this.persona() === 'D' ? 0.06 : 0.03;
          next = next || (el >= hoverMinOf(hc.tau) && this.settled(ev) && t - hc.stillAt >= stillOf(hc.tau));
        } else if (beat === 'cocked') {
          next = next || (el >= HC.cockedMin && this.settled(this.persona() === 'A' ? 0.08 : 0.06) && !h.turning);
        }
        if (!next) return;
        if (hc.plan.length) {
          this.nextApproachBeat(t, ctx, h);
          return;
        }
        // 最后一拍的指令走完了，臂还在路上（肌肉 + 臂的滞后约半秒）：等它落定（或 1 s）再判「没碰到」
        if (beat !== 'drop' && !this.settled(0.05) && t - hc.beatEnd < 1) return;
        if (beat === 'drop') {
          // 撤掉：态度改躲，到下一次 ⑨
          h.mode = 'away';
          this.emit('HAND_SEEN', { mode: 'away', again: true, cause: 'balk' });
          this.hcReset(t, 'avoid');
          hc.side = this.avoidSide(h);
          hc.turnAt = t + HC.avoidLag;
          this.avoidRef(h);
          this.hcRun(t, 'hand.shrink', buildShrink(this.hcCtx(ctx), hc.close, hc.awayDir, false));
          return;
        }
        this.approachFailed(t, ctx, h);
        return;
      }
      case 'strain':
        if (!hc.prog) this.hcSet(t, 'watch');
        return;
      case 'watch': {
        if (!h || !gm || !h.present) return;
        if (hc.prog) return;
        if (h.mode !== 'toward') return;
        if (this.hcMovedMm(h) > HC.strainRearm) {
          hc.armed = true;
          this.hcSet(t, 'track');
        }
        return;
      }
      case 'wrap': {
        const g = s.grasp;
        if (g.phase === 'WRAP' && (g.catchT ?? NEVER) >= NEVER) {
          // 手在卡住之前就离开了臂：不必等到限位，马上判（真值表照旧：到限位无张力 = 抓空）
          if (!s.electrode && t - g.t0 > 0.3) g.dur = Math.min(g.dur, t - g.t0);
          else if (t >= hc.seatEnd && (this.settled(0.04) || t - hc.seatEnd >= 1)) g.catchT = t;
        }
        return;
      }
      case 'hold':
        this.stepHold(t, ctx, h);
        return;
      case 'chase': {
        const g = s.grasp;
        if (g.phase !== 'WRAP') return;
        // 身体晚 0.3 s 跟、常速
        if (h && h.present && t - hc.st0 >= HC.yawLag && ctx.orientOk && !reachable(h.aimBend, h.aimDist)) {
          if (Math.abs(wrapPi(h.steerFace - s.yaw.x)) > HAND.turnAt) s.yawTarget = this.handYawGoal(h.steerFace);
        }
        if (hc.prog) return;
        const beat = hc.plan.shift() as ChaseBeat | undefined;
        if (beat && gm) {
          this.hcSet(t, 'chase', beat);
          this.hcRun(t, `hand.${beat}`, buildChaseBeat(this.hcCtx(ctx), gm, beat, reachable(h!.aimBend, h!.aimDist)));
          return;
        }
        // 拍走完了还没碰到：到限位（真值表 EMPTY）
        if (g.dur > t - g.t0 + 0.5) g.dur = t - g.t0 + 0.5;
        return;
      }
      case 'release':
        return;
      case 'search': {
        if (!hc.prog) {
          this.hcSet(t, h && h.mode === 'toward' ? 'track' : 'off');
          return;
        }
        // 搜的途中手又停在够得着处、态度是迎：回去陪着
        if (h && h.present && h.mode === 'toward' && reachable(h.aimBend, h.aimDist) && t - hc.stillAt > 0.3 && t - hc.st0 > 1) {
          this.hcReset(t, 'track');
        }
        return;
      }
      case 'avoid':
        this.stepAvoid(t, ctx, h, k);
        return;
      default:
        return;
    }
  }

  /** 握（HOLD_HUMAN）：跟手、数呼吸、手的小动静（攥 / 屏气 / 让）、被牵着走、深卷预算 */
  private stepHold(t: number, ctx: Ctx, h: HandMem | null): void {
    const s = this.s;
    const m = s.m2!;
    const hc = m.hc;
    if (s.phi < hc.lastPhi) hc.breaths++;
    hc.lastPhi = s.phi;
    if (hc.ev && t - hc.ev.t0 > holdEventDur(hc.ev.kind, s.period)) hc.ev = null;
    if (!h || !h.present || s.grasp.phase !== 'HOLD_HUMAN') return;
    const gm = this.handGeom(h);
    // 跟手（读数一步跳太大 = 被抽走：这一下不跟；深卷时钉住）
    if (t - hc.jumpAt > 0.2 && hc.deepUsed <= 0) {
      // 跟的是读数的变化（手挪了多少），不是读数本身：基准从开缠那一刻的实际位置起
      const a = 1 - Math.exp(-DT / HC.followTau);
      const want = Math.min(HC.flatMax, Math.max(0, hc.dBase + Math.min(gm.Dh, HC.flatMax) - hc.dhAt));
      hc.Dref += (want - hc.Dref) * a;
      const d = wrapPi(gm.dir - hc.dirRef);
      const step = HC.followRate * DT;
      hc.dirRef = wrapPi(hc.dirRef + clamp(d, -step, step));
    }
    // 手怎么动
    const v = hc.v;
    if (v >= HC.vStill && v < HC.vMicro) {
      if (hc.tracT >= NEVER) hc.tracT = t;
    } else hc.tracT = NEVER;
    const outward = t - hc.outAt < 0.3;
    if (v >= HC.vMicro && outward && (!hc.ev || hc.ev.kind !== 'give')) hc.ev = { kind: 'give', t0: t };
    else if (v >= HC.vStill && v < HC.vMicro && !hc.ev && t - hc.reflexAt > 2 && t - hc.tracT < 0.5) {
      // 抓握反射：活力 / 好奇攥一下、沉静屏气定住、不稳定三者里抽（表情子流）
      const P = this.persona();
      const kind = P === 'A' || P === 'C' ? 'squeeze' : P === 'B' ? 'freeze' : pick(m.xr, ['squeeze', 'freeze', 'give'] as const);
      hc.ev = { kind, t0: t };
      hc.reflexAt = t;
    }
    // 被牵着走：慢慢挪手持续 0.5 s、臂线偏出 25° → 身体以一半的速度跟
    if (hc.tracT < NEVER && t - hc.tracT > HC.tractionT && ctx.orientOk && Math.abs(wrapPi(h.face - s.yaw.x)) > (25 * Math.PI) / 180) {
      s.yawTarget = this.handYawGoal(h.steerFace);
      hc.yawSlow = true;
    }
  }

  /** 躲（侧身警戒）：再收 / 逼近时一缩 / 手走了松一口气；偷看由 ⑥ 起（spontaneous） */
  private stepAvoid(t: number, ctx: Ctx, h: HandMem | null, k: number): void {
    const hc = this.s.m2!.hc;
    void k;
    if (!h) return;
    if (h.mode !== 'away') {
      if (h.mode === 'toward') this.hcSet(t, 'track');
      else this.hcReset(t, 'off');
      return;
    }
    // 手走了（离开画布或远于 1.2 m 持续 1 s）：松一口气（遗忘不算）
    if (!h.present || h.dist > HC.reliefR) {
      if (hc.farSince >= NEVER) hc.farSince = t;
      if (t - hc.farSince >= HC.reliefT || !h.present) {
        hc.farSince = NEVER;
        hc.relieved = true;
        this.hcSet(t, 'off', 'relief');
        this.hcRun(t, 'hand.relief', buildRelief(this.hcCtx(ctx)));
      }
      return;
    }
    hc.farSince = NEVER;
    const busy = hc.prog !== null;
    const ph = busy ? hc.prog!.phases[hc.prog!.idx] : null;
    // 偷看时手动了：缩回去
    if (ph && ph.name === 'look' && hc.v > HC.vMove) {
      this.hcRun(t, 'hand.snap', buildSnap(this.hcCtx(ctx), hc.close, hc.awayDir));
      this.hcSet(t, 'avoid', 'snap');
      return;
    }
    // 逼近：一缩
    if (hc.v > HC.cringeV && h.dist < HC.cringeR && hc.beat !== 'cringe') {
      this.avoidRef(h);
      this.hcSet(t, 'avoid', 'cringe');
      this.hcRun(t, 'hand.cringe', buildCringe(this.hcCtx(ctx), hc.close, hc.awayDir));
      return;
    }
    if (busy) return;
    // 手挪了：再收一次
    const close = 1 - smooth((h.dist - HAND.awayNear) / (HAND.awayFar - HAND.awayNear));
    const away = this.awayDir(h);
    if (Math.abs(close - hc.close) > HC.reshrinkClose || Math.abs(wrapPi(away - hc.awayDir)) > HC.reshrinkDir || poseDist(this.curPose(), avoidPose(close, away)) > 0.06) {
      hc.close = close;
      hc.awayDir = away;
      this.hcSet(t, 'avoid', 'reshrink');
      this.hcRun(t, 'hand.reshrink', buildShrink(this.hcCtx(ctx), close, away, false));
    }
  }

  /**
   * 手链写臂（stepArm 调）：有程序走程序；握人时握持控制器；握物 / 现行的松开交回旧的抓握代码（返回 false）；
   * 拍间保持此刻的姿态
   */
  private hcArm(t: number, ctx: Ctx, restPose: Pose): boolean {
    const s = this.s;
    const m = s.m2!;
    const hc = m.hc;
    const g = s.grasp;
    // 旧路的抓握：臂交回旧的抓握代码
    if (this.foreignGrasp()) return false;
    if (hc.prog) {
      const r = stepProgram(hc.prog, t, restPose);
      if (r.phase && hc.prog.idx !== hc.seen) {
        hc.seen = hc.prog.idx;
        this.enterPhase(t, r.phase);
      }
      if (r.done) hc.prog = null;
      let pose = r.pose;
      // 深卷预算在程序里用完（缠的贴上 / 收紧不看预算）：带深卷的段同样 1.3 s 平滑松到离轴；松完（冷却中）一律离轴
      if (pose.deep > 0 && (hc.deepOffAt < NEVER || t < hc.deepCool)) {
        const u = hc.deepOffAt < NEVER ? smooth((t - hc.deepOffAt) / 1.3) : 1;
        pose = blendPose(pose, flatH(dOf(pose), pose.dir), u);
      }
      this.writePose(pose, r.done);
      this.deepBook(t, pose);
      return true;
    }
    const h = s.hand;
    if (hc.stage === 'hold' && g.phase === 'HOLD_HUMAN' && h) {
      if (hc.holdT0 >= NEVER) {
        hc.holdT0 = t;
        hc.holdFrom = this.curPose();
        // 深卷模式在控制器开始那一刻锁定：中途不再进深卷（冷却到点、手被牵进窗口都不切——那是一帧翻上去的台阶）
        hc.holdDeep = hc.deepUsed > 0 || (this.deepGate(h, t) && h.aimBend >= 1.45);
      }
      // 锁着深卷、手离开了窗口（想要的已经不是深卷）：按预算用完处理，同一条 1.3 s 松开
      if (hc.holdDeep && hc.deepOffAt >= NEVER && t >= hc.deepCool && !this.deepWindow(h)) hc.deepOffAt = t;
      const ev = hc.ev ? holdEventMm(hc.ev.kind, t - hc.ev.t0, s.period) : 0;
      const T = s.period * (1 - ENGINE.arousal.breath * s.arousal) * 1.15;
      let pose = holdDrive({
        persona: this.persona(),
        g: this.handGeom(h),
        Dref: hc.Dref,
        dirRef: hc.dirRef,
        phi: s.phi,
        period: T,
        breathAmp: s.ampBase,
        breaths: hc.breaths,
        grip: ctx.grip,
        evMm: ev,
        // 松开的混合（下面）要两端不同：松开途中仍按深卷算，混合走完（deepEnd → 冷却）才换成离轴
        deep: hc.holdDeep && t >= hc.deepCool,
      });
      // 深卷预算用完：1.3 s 内平滑松到 0.48（仍是握着）
      if (hc.deepOffAt < NEVER) {
        const flat = flatH(dOf(pose), hc.dirRef);
        pose = blendPose(pose, flat, smooth((t - hc.deepOffAt) / 1.3));
      }
      if (hc.holdFrom) pose = blendPose(hc.holdFrom, pose, smooth((t - hc.holdT0) / HC.holdBlend));
      this.writePose(pose, false);
      this.deepBook(t, pose);
      return true;
    }
    if (g.phase === 'HOLD_OBJECT' || g.phase === 'HOLD_HUMAN' || (g.phase === 'RELEASE' && !ENGAGED.has(hc.stage))) return false;
    // 拍间：保持此刻的指令
    s.armX.v = 0;
    s.armY.v = 0;
    s.wrap.v = 0;
    return true;
  }

  /** 深卷记账：执行层真的放开深卷的帧（差动 > 0.48）才算；本轮满 4 s 收回、开始冷却 */
  private deepBook(t: number, pose: Pose): void {
    const m = this.s.m2!;
    const hc = m.hc;
    if (pose.deep > 0 && dOf(pose) > HC.flatMax) {
      hc.deepUsed += DT;
      if (hc.deepUsed >= 4 && hc.deepOffAt >= NEVER) hc.deepOffAt = t;
    } else if (hc.deepUsed > 0 && pose.deep <= 0 && (hc.deepOffAt >= NEVER || t - hc.deepOffAt >= 1.3)) this.deepEnd(t);
  }

  /** 此刻的挤压相位 0–1（台架标记圈随它缩放；不在握人时 = null） */
  handSqueeze(): number | null {
    const s = this.s;
    const m = s.m2;
    if (!m || m.hc.stage !== 'hold' || s.grasp.phase !== 'HOLD_HUMAN') return null;
    return squeezePhase(s.phi, s.period * 1.15);
  }

  /** 迎手链此刻的阶段与拍（台架 HUD；没有 = null） */
  handStage(): { stage: HcStage; beat: string } | null {
    const m = this.s.m2;
    if (!m || m.hc.stage === 'off') return null;
    return { stage: m.hc.stage, beat: m.hc.beat };
  }

  /** 此刻的抓握是不是迎手链在管（v2 + 它的缠写过 catchT + 手链投入中）；是的话返回手链状态 */
  private hcGrasp(): HandChain | null {
    const m = this.s.m2;
    if (!m || this.s.grasp.catchT === undefined) return null;
    const st = m.hc.stage;
    return st === 'wrap' || st === 'hold' || st === 'chase' ? m.hc : null;
  }

  /**
   * 此刻有抓握（缠 / 握人 / 握物），但不是迎手链在管：旧路的抓握（没看见手时碰臂起的缠），或者手链的抓握已经没人管了。
   * 这时手链不起程序、不写臂——臂归旧的抓握代码（否则台架显示「握着」的同时臂在蹲、扑、推）
   */
  private foreignGrasp(): boolean {
    const ph = this.s.grasp.phase;
    return ph !== 'IDLE' && ph !== 'RELEASE' && this.hcGrasp() === null;
  }

  /** 抓空（真值表 EMPTY）：先按人格做一拍（再抓一下 / 摸一摸 / 慢慢张开 / 生硬落回），放开；搜寻次数照 emptySearches */
  private hcEmpty(t: number, ctx: Ctx, searches: number): void {
    const s = this.s;
    const m = s.m2!;
    const hc = m.hc;
    const P = this.persona();
    const kind: EmptyKind = P === 'A' ? 'regrab' : P === 'C' ? 'palpate' : P === 'B' ? 'open' : pick(m.xr, ['regrab', 'palpate', 'open', 'drop'] as const);
    hc.searches = searches;
    hc.emptyLast = true;
    const cur = this.curPose();
    this.hcSet(t, 'release', kind);
    this.hcRun(t, `hand.empty.${kind}`, buildEmpty(this.hcCtx(ctx), kind, s.hand ? this.handGeom(s.hand) : null));
    s.grasp = { ...s.grasp, phase: 'RELEASE', t0: t, dur: totalDur(hc.prog!), from: Math.min(1, cur.bend), dir: cur.dir, reason: 'empty', searches: 0 };
  }

  /**
   * 握着时脱手（真值表 LOST，人格反应照 lostReaction）：追 = 按脱手前指针多快选扑过去（≥ 150 mm/s）或伸过去送一下，
   * 抓握回到 WRAP（追途中碰到 = 预期接触，再缠）；放弃 = 沉静型愣一下、收回自己一侧、改躲，不稳定型生硬落回
   */
  private hcLost(t: number, ctx: Ctx, reaction: 'chase' | 'giveUp'): void {
    const s = this.s;
    const m = s.m2!;
    const hc = m.hc;
    const h = s.hand;
    const g = s.grasp;
    const cur = this.curPose();
    hc.ev = null;
    hc.holdFrom = null;
    hc.holdT0 = NEVER;
    this.deepEnd(t);
    if (reaction === 'chase' && h) {
      g.chases++;
      // 衰老过了六成：扑过去换成伸过去送一下（先拿掉花样）
      const fast = t - hc.pullT <= 0.3 && hc.pullV >= HC.chaseFast && this.ageU(ctx) <= 0.6;
      hc.plan = chasePlan(fast);
      // 到限位的兜底：追的拍走完时 chase 分支会把它缩到 +0.5 s；这里只防拍序意外卡住
      s.grasp = { ...g, phase: 'WRAP', t0: t, dur: HC.chaseCap, from: Math.min(1, cur.bend), catchT: NEVER };
      this.emit('GRASP_START', { chase: true });
      const beat = hc.plan.shift() as ChaseBeat;
      this.hcSet(t, 'chase', beat);
      this.hcRun(t, `hand.${beat}`, buildChaseBeat(this.hcCtx(ctx), this.handGeom(h), beat, reachable(h.aimBend, h.aimDist)));
      return;
    }
    if (this.persona() === 'B' && h && h.seen) {
      h.mode = 'away';
      this.emit('HAND_SEEN', { mode: 'away', again: true, cause: 'giveUp' });
      hc.side = this.avoidSide(h);
      hc.turnAt = t + HC.avoidLag;
      this.avoidRef(h);
    }
    const away = h ? this.awayDir(h) : MOTION.down;
    this.hcSet(t, 'release', 'giveUp');
    this.hcRun(t, 'hand.giveUp', buildGiveUp(this.hcCtx(ctx), away));
    s.grasp = { ...s.grasp, phase: 'RELEASE', t0: t, dur: totalDur(hc.prog!), from: Math.min(1, cur.bend), dir: cur.dir, reason: 'lost' };
  }

  /** 放开做完：还要找就以最后碰到处为中心找；否则回陪着 / 侧身躲 / 关。放开以后 3 s 手还搭在臂上就再来一次 */
  private hcReleased(t: number, ctx: Ctx): void {
    const s = this.s;
    const hc = s.m2!.hc;
    const h = s.hand;
    hc.rearmAt = t + HC.rearm;
    if (hc.searches > 0) {
      const n = hc.searches;
      hc.searches = 0;
      this.hcSet(t, 'search', 'cast');
      this.hcRun(t, 'hand.search', buildSearch(this.hcCtx(ctx), { D: hc.lastD, dir: hc.lastDir }, n));
      return;
    }
    if (h && h.seen && h.mode === 'toward') this.hcSet(t, 'track');
    else if (h && h.seen && h.mode === 'away') {
      this.avoidRef(h);
      this.hcSet(t, 'avoid');
    } else this.hcReset(t, 'off');
  }

  // ---------------------------------------------------------------- 抓握

  private graspBend(t: number, ctx: Ctx): number {
    const g = this.s.grasp;
    switch (g.phase) {
      case 'WRAP':
        return g.from + (GRASP.limit - g.from) * smooth((t - g.t0) / g.dur);
      case 'HOLD_HUMAN':
        // 有手抓住的（记下了深缠）：保住缠住时的形状（力小不等于松开）；没有手抓的：照旧极轻
        return (g.contactW > 0.01 ? Math.max(GRASP.human, HAND.holdKeep * g.contact) : GRASP.human) * ctx.grip;
      case 'HOLD_OBJECT':
        return Math.max(g.contact, GRASP.object) * ctx.grip;
      default:
        return g.from;
    }
  }

  private beginWrap(t: number, chase: boolean): void {
    const s = this.s;
    const bend = Math.hypot(s.armX.x, s.armY.x);
    // 看见了手：朝手缠；否则顺着臂此刻的弯向缠
    const hh = s.hand;
    const dir = hh?.seen && hh.present ? hh.aimDir : bend > 0.05 ? Math.atan2(s.armY.x, s.armX.x) : MOTION.up;
    s.grasp = {
      ...s.grasp,
      phase: 'WRAP',
      t0: t,
      dur: this.gestureDur(GRASP.wrap),
      dir,
      from: bend,
      chases: chase ? s.grasp.chases : 0,
    };
    // v2 里没看见手的缠走这条旧路：上一回合迎手链留下的 catchT 不许带过来（台架会按它判张力）
    if (s.m2) delete s.grasp.catchT;
    this.emit('GRASP_START', { chase });
  }

  private beginRelease(t: number, ctx: Ctx, reason: string): void {
    const s = this.s;
    // 迎手链的缠（只有它写 catchT）：起点取此刻实际给出的姿态（它不是旧的缠绕公式算出来的）
    const hcGrasp = !!s.m2 && s.grasp.catchT !== undefined;
    const cur = hcGrasp ? this.curPose() : null;
    const from = cur ? Math.min(1, cur.bend) : this.graspBend(t, ctx);
    const slow = reason === 'death' ? GRASP.deathRelease : 1;
    s.grasp = { ...s.grasp, phase: 'RELEASE', t0: t, dur: this.gestureDur(GRASP.release) * slow, from, reason };
    if (cur) s.grasp.dir = cur.dir;
  }

  private stepGrasp(t: number, ctx: Ctx): void {
    const s = this.s;
    const g = s.grasp;
    switch (g.phase) {
      case 'WRAP': {
        const v = graspVerdict({ tension: s.tension, electrode: s.electrode, atLimit: t - g.t0 >= g.dur });
        const hc = this.hcGrasp();
        if (v === 'HOLD_HUMAN' || v === 'HOLD_OBJECT') {
          if (hc) {
            // 迎手链：握姿是此刻实际的姿态（由手定，不是旧的缠绕进度）；缠程序剩下的收紧照走，走完交给握持控制器
            const cur = this.curPose();
            g.contact = Math.min(1, cur.bend);
            g.dir = cur.dir;
            hc.breaths = 0;
            hc.lastPhi = s.phi;
            hc.holdT0 = NEVER;
            this.hcSet(t, 'hold');
          } else g.contact = this.graspBend(t, ctx);
          g.contactW = s.wrap.x;
          g.phase = v;
          this.emit(v === 'HOLD_HUMAN' ? 'GRASP_HOLD_HUMAN' : 'GRASP_HOLD_OBJECT');
        } else if (v === 'EMPTY') {
          const searches = emptySearches(this.persona(), s.rng);
          this.emit('GRASP_EMPTY', { searches });
          if (hc) this.hcEmpty(t, ctx, searches);
          else {
            this.beginRelease(t, ctx, 'empty');
            s.grasp.searches = searches;
          }
        }
        return;
      }
      case 'HOLD_HUMAN':
      case 'HOLD_OBJECT': {
        if (!s.tension) {
          const reaction = g.chases < GRASP.maxChases ? lostReaction(this.persona(), s.rng) : 'giveUp';
          this.emit('GRASP_LOST', { reaction });
          if (this.hcGrasp()) this.hcLost(t, ctx, reaction);
          else if (reaction === 'chase') {
            g.chases++;
            this.beginWrap(t, true);
          } else this.beginRelease(t, ctx, 'lost');
          return;
        }
        const want: GraspPhase = s.electrode ? 'HOLD_HUMAN' : 'HOLD_OBJECT';
        if (want !== g.phase) {
          g.phase = want;
          if (want === 'HOLD_HUMAN' && s.m2) s.m2.hc.holdT0 = NEVER;
          this.emit(want === 'HOLD_HUMAN' ? 'GRASP_HOLD_HUMAN' : 'GRASP_HOLD_OBJECT');
        }
        return;
      }
      case 'RELEASE':
        if (t - g.t0 >= g.dur) {
          this.emit('RELEASE_DONE', { after: g.reason });
          g.phase = 'IDLE';
          if (s.m2 && s.m2.hc.stage === 'release') this.hcReleased(t, ctx);
          // 抓空后的搜寻：尽快排上（自发调度见 spontaneous 的 search 分支）
          else if (g.searches > 0) s.nextSpont = Math.min(s.nextSpont, t + 0.3);
        }
        return;
      default:
        return;
    }
  }

  // ---------------------------------------------------------------- 通道

  /** 新一次呼吸：周期与幅度在这里抽（D 每次重抽；A/B/C 在表值上加 ±4% 噪声） */
  private newBreath(ctx: Ctx): void {
    const s = this.s;
    const p = ctx.p;
    s.sighNow = s.sighNext;
    s.sighNext = false;
    let T = sampleRange(s.rng, p.breathPeriod, VARIABILITY.breath) * ctx.age.period;
    let a = sampleRange(s.rng, p.breathAmp, VARIABILITY.breath);
    if (ctx.age.jitter > 0) T *= 1 + uniform(s.rng, -ctx.age.jitter, ctx.age.jitter);
    if (ctx.death) {
      if (ctx.death.irregular) {
        T *= uniform(s.rng, 0.5, 2);
        a *= uniform(s.rng, 0.3, 1);
      }
      s.periodScale *= ctx.death.periodGrowth;
      T *= s.periodScale;
    }
    if (s.sighNow) T *= MOTION.sighPeriod;
    s.period = T;
    s.ampBase = a;
    s.voiceF = sampleRange(s.rng, p.voiceFreq);
    s.voiceDuty = sampleRange(s.rng, p.voiceDuty);
  }

  /**
   * 呼吸：相位 φ 积分推进（周期变了位置也不跳），s = 中心 + 幅度/2 · cos(2πφ)。
   * φ = 0 在本次呼吸最收拢处、0.5 最张开处。幅度与中心各走一个临界阻尼跟随器，
   * 于是响应、叹气、衰老、死亡对它们的任何改动都是平滑的。
   *
   * 为什么呼吸的缓入缓出要由代码给（spec §4.2，2026-10-07 实现时查明）：人格幅度 < 100% 时，
   * 曲柄在行程**中途**换向，那里没有死点，匀速反转会顿一下；死点的天然缓动只在满行程时成立。
   */
  private stepBreath(t: number, ctx: Ctx): void {
    const s = this.s;
    const still = s.phase === 'BLANK' || s.phase === 'END';
    // v2：这一段对呼吸的提示（屏住 / 放慢 / 加深 / 猛收 / 往收拢端推）；死亡里一律不用（呼吸归死亡的脚本）。
    // v1 没有这一块，下面的算式逐位不变
    const br = s.m2 && !ctx.death ? this.cueNow(t)?.ph.breath : undefined;
    if (s.m2) dampStep(s.m2.rate, br?.rate ?? 1, V2.breathRateOmega, DT);
    if (!still) {
      const T = s.period * (1 - ENGINE.arousal.breath * s.arousal);
      if (s.m2) {
        // 曲柄限速：π·幅度/周期 ≤ 1.2 s⁻¹（加深、加快的提示叠起来也不超 4.19 rad/s）
        const Tc = Math.max(T * (br?.period ?? 1), (Math.PI * s.amp.x) / V2.breathRateCap);
        s.phi += (DT / Tc) * clamp01(s.m2.rate.x);
      } else s.phi += DT / T;
      if (s.phi >= 1) {
        s.phi -= 1;
        this.newBreath(ctx);
      }
    }
    let aT = 0;
    let cT = 1;
    if (!still) {
      aT = s.ampBase * ctx.age.amp * ctx.ramp * (s.sighNow ? MOTION.sighAmp : 1);
      if (ctx.death) aT *= ctx.death.amp;
      cT = ENGINE.center + ctx.age.center;
      const g = s.gesture;
      if (g) {
        const e = envelope(g, t);
        if (g.breath !== 0) aT *= 1 + g.breath * e;
        cT += g.push * e;
      }
      if (br && br.amp !== undefined) aT *= br.amp;
      aT = clamp01(aT);
      if (ctx.death) cT += (1 - cT) * ctx.death.sink;
      if (s.phase === 'BIRTH') cT = 1 - (1 - cT) * ctx.ramp;
      cT = clamp(cT, aT / 2, 1 - aT / 2);
    }
    dampStep(s.amp, aT, ENGINE.ampOmega, DT);
    dampStep(s.center, cT, ENGINE.centerOmega, DT);
    if (s.m2) {
      // v2 的「猛收」（快升 ω 10、慢放 ω 3）与「缩 / 忍」的推量叠在输出上；空白段、死亡里归零
      const m = s.m2;
      const cl = still ? 0 : br?.clench ?? 0;
      dampStep(m.clench, cl, cl >= m.clench.x ? V2.clenchUp : V2.clenchDown, DT);
      dampStep(m.push, still ? 0 : br?.push ?? 0, ENGINE.centerOmega, DT);
    }
  }

  private stepArm(t: number, ctx: Ctx): void {
    const s = this.s;
    s.restDir = wrapPi(s.restDir + MOTION.restDrift * s.speed * DT);
    const rest = MOTION.restBend * ctx.vigor;
    let bx = rest * Math.cos(s.restDir);
    let by = rest * Math.sin(s.restDir);
    // 看见了手（在、不在机身上方）：静息姿态换成「够手」（迎）或「背着手弯」（躲）。没有手时这段整个跳过；
    // v2 有手时不走这一段——迎手链按拍写臂（§9.3），不再是「够手静息 + 人格跟随器」
    const h = s.hand;
    if (!s.m2 && h && h.seen && h.present && ctx.responsive && !this.handOnBody(h) && (h.mode === 'toward' || h.mode === 'away')) {
      if (h.mode === 'toward') {
        const L = HAND.armL;
        const w = 1 - smooth((h.aimDist - HAND.reachNear * L) / ((HAND.reachZero - HAND.reachNear) * L));
        const amt = (Math.min(1, h.aimBend) + HAND.breathe * Math.cos(TAU * s.phi)) * ctx.vigor;
        bx = w * (amt * Math.cos(h.aimDir) + HAND.wobble * bx) + (1 - w) * bx;
        by = w * (amt * Math.sin(h.aimDir) + HAND.wobble * by) + (1 - w) * by;
      } else {
        const close = 1 - smooth((h.dist - HAND.awayNear) / (HAND.awayFar - HAND.awayNear));
        const amt = (HAND.awayMin + HAND.awaySpan * close) * ctx.vigor;
        const dir = this.awayDir(h);
        bx = amt * Math.cos(dir);
        by = amt * Math.sin(dir);
      }
    }
    if (s.m2) {
      const m = s.m2;
      // v2 静息：随呼吸微微鼓起（环身张开时臂多弯一点），身体读作一体；看见手时照旧是够手 / 背手的姿态
      if (!(h && h.seen && h.present)) {
        const r = Math.hypot(bx, by);
        if (r > 1e-9) {
          const f = 1 - (V2.restBreathe * ctx.vigor * Math.cos(TAU * s.phi)) / r;
          bx *= f;
          by *= f;
        }
      }
      const restPose: Pose = { bend: Math.hypot(bx, by), dir: Math.atan2(by, bx), deep: 0 };
      // 迎手链投入中（凑 / 缠 / 握 / 追 / 放开 / 找）：除了惊跳，别的程序只出提示、不抢臂
      const engaged = ENGAGED.has(m.hc.stage);
      if (m.prog) {
        // 动作程序直接给臂（不经人格跟随器）；速度按差分记下，程序走完跟随器接着走不跳。
        // 抓握握着（缠 / 握人 / 握物）时臂归抓握：程序照走，只放它的呼吸 / 声 / 光 / 触须 / 转身提示，不写臂；
        // 松开（RELEASE，惊跳会先叫它）时程序接管臂
        const progT0 = m.prog.t0;
        const startle = m.prog.name === 'startle';
        const r = stepProgram(m.prog, t, restPose);
        if (r.phase && m.prog.idx !== m.seen) {
          m.seen = m.prog.idx;
          this.enterPhase(t, r.phase);
        }
        if (r.done) m.prog = null;
        // 抓握握着时起的程序（比如触须抖）松手时不接管臂：它的起点是当时的抓握姿态，接管会让臂一帧跳过去；
        // 惊跳是先叫松开、同一帧起程序（t0 = 松开时刻），照样接管
        if ((s.grasp.phase === 'IDLE' || (s.grasp.phase === 'RELEASE' && progT0 >= s.grasp.t0)) && (startle || (!engaged && !m.progCue))) {
          this.writePose(r.pose, r.done);
          s.tone = ctx.tone;
          return;
        }
      }
      if ((m.hc.stage !== 'off' || m.hc.prog) && this.hcArm(t, ctx, restPose)) {
        s.tone = ctx.tone;
        return;
      }
      // 臂交回旧的抓握 / 跟随器代码（握物、手链被清掉：死亡、手丢了）：手链留下的深卷沿腱轴限速收回，
      // 不在交接那一帧清零（三腱会一帧跳 0.1–0.26）。没有手的会话走到这里时深卷恒为 0
      if (m.deep > 0) m.deep = Math.max(0, m.deep - (tierSpeed('deliberate', Math.sqrt(s.speed), ctx.vigor) / D_DEEP_SPAN) * DT);
    }
    const g = s.grasp;
    // 缠的头四成：弯向追着手转（脱手后再缠 = 伸手去追）；过了就定住，免得甩
    if (g.phase === 'WRAP' && h && h.seen && h.present && (t - g.t0) / g.dur < HAND.wrapLock) {
      const step = HAND.wrapFollow * Math.sqrt(s.speed) * DT;
      g.dir = wrapPi(g.dir + clamp(wrapPi(h.aimDir - g.dir), -step, step));
    }
    // 深缠：缠的时候只在有手时往深里卷；握住以后按抓住那一刻记下的深缠保形（没有手抓的恒为 0）——
    // 看的是抓握的记忆，不是此刻指针在不在（手移开画布、或握着时指针才进来，形状都不该变）
    let wT = 0;
    if (g.phase === 'WRAP') wT = h ? smooth((t - g.t0) / g.dur) : 0;
    else if (g.phase === 'HOLD_HUMAN') wT = HAND.holdWrap * g.contactW * ctx.grip;
    else if (g.phase === 'HOLD_OBJECT') wT = g.contactW * ctx.grip;
    dampStep(s.wrap, wT, MOTION.armOmega * Math.sqrt(s.speed), DT);
    if (g.phase !== 'IDLE') {
      const b = this.graspBend(t, ctx);
      let gx = b * Math.cos(g.dir);
      let gy = b * Math.sin(g.dir);
      if (g.phase === 'RELEASE') {
        const r = smooth((t - g.t0) / g.dur);
        gx = (1 - r) * gx + r * bx;
        gy = (1 - r) * gy + r * by;
      }
      bx = gx;
      by = gy;
    } else if (s.gesture && s.gesture.bend > 0) {
      const gs = s.gesture;
      const e = envelope(gs, t);
      const dir = gs.dir2 === gs.dir ? gs.dir : lerpAngle(gs.dir, gs.dir2, smooth((t - gs.t0) / gs.dur));
      bx = (1 - e) * bx + e * gs.bend * Math.cos(dir);
      by = (1 - e) * by + e * gs.bend * Math.sin(dir);
    }
    const w = MOTION.armOmega * Math.sqrt(s.speed);
    dampStep(s.armX, bx, w, DT);
    dampStep(s.armY, by, w, DT);
    s.tone = ctx.tone;
  }

  private stepYaw(): void {
    const s = this.s;
    const k = Math.sqrt(s.speed);
    // v2 的惊跳只在反射与凝住那几段快转（恢复里回头看是刻意的，照常速）
    const prog = s.m2?.prog ?? null;
    const reflexNow = !s.m2 || (prog !== null && prog.name === 'startle' && STARTLE_PRE.has(prog.phases[prog.idx]?.name ?? ''));
    const fast = s.gesture && s.gesture.kind === 'startle' && reflexNow ? MOTION.yawRateStartle : 1;
    // 握着被牵着走：身体以一半的速度跟（只有 v2 迎手链会置）
    const slow = s.m2?.hc.yawSlow ? 0.5 : 1;
    const step = MOTION.yawRate * k * fast * slow * DT;
    s.yawGoal += clamp(s.yawTarget - s.yawGoal, -step, step);
    dampStep(s.yaw, s.yawGoal, MOTION.yawOmega * k, DT);
  }

  private stepFeelers(t: number, ctx: Ctx): void {
    const s = this.s;
    const k = Math.sqrt(s.speed);
    s.psi = (s.psi + TAU * MOTION.feelerFreq * k * DT) % TAU;
    if (s.m2) {
      // v2：两条触须不再是双胞胎——姿势（收 / 指向一侧 / 张开 / 竖起 / 静止）+ 颤 + 交替探
      const m = s.m2;
      const f = this.cueNow(t)?.ph.feel;
      const pose = f?.pose ?? 'free';
      const sweep = pose === 'free' ? MOTION.feelerAmp * ctx.vigor * (1 + ENGINE.arousal.feeler * s.arousal) * Math.sin(s.psi) : 0;
      // 指向没写侧别、又看见了手：按手的相对方位连续指（迎手链：眼一直跟、臂一跳一停）
      const hh = s.hand;
      const side =
        f?.side ?? (pose === 'point' && f && hh && hh.seen && hh.present ? clamp(wrapPi(hh.bearing - s.yaw.x) / (Math.PI / 2), -1, 1) : 0);
      for (const j of [0, 1] as const) {
        const off = V2.feelerPose[pose][j] + (pose === 'point' ? V2.feelerPoint * side : 0);
        dampStep(m.feel[j], off * ctx.vigor, V2.feelerPoseOmega, DT);
        let b = sweep + m.feel[j].x;
        if (f?.quiver) b += f.quiver * ctx.vigor * Math.sin(TAU * 3 * t);
        if (f?.antennate) b += f.antennate * ctx.vigor * Math.sin(TAU * 2 * t) * (j === 0 ? 1 : -1);
        dampStep(s.feeler[j], clamp(b, -MOTION.feelerMax, MOTION.feelerMax), MOTION.feelerOmega, DT);
      }
      return;
    }
    let base = MOTION.feelerAmp * ctx.vigor * (1 + ENGINE.arousal.feeler * s.arousal) * Math.sin(s.psi);
    const g = s.gesture;
    if (g && g.feeler > 0) base += g.feeler * envelope(g, t) * Math.sin(TAU * MOTION.flickFreq * k * (t - g.t0));
    base = clamp(base, -MOTION.feelerMax, MOTION.feelerMax);
    dampStep(s.feeler[0], base, MOTION.feelerOmega, DT);
    dampStep(s.feeler[1], base, MOTION.feelerOmega, DT);
  }

  // ---------------------------------------------------------------- 日志

  private emit(
    ev: string,
    p?: Record<string, LogValue>,
    src: LogRecord['src'] = 'engine',
    I?: number,
    out?: Outcome,
  ): LogRecord {
    const s = this.s;
    const r: LogRecord = { id: s.seq++, t: s.tick / HZ, life: s.life, persona: this.persona(), phase: s.phase, src, ev };
    if (I !== undefined) r.I = I;
    if (out !== undefined) r.out = out;
    if (p !== undefined) r.p = p;
    this.buf.push(r);
    return r;
  }
}

// ------------------------------------------------------------------ 无头会话

export interface ScheduledInput {
  /** 仿真秒 */
  t: number;
  input: SensorInput;
}

export interface SessionFrame {
  t: number;
  life: number;
  persona: PersonaKey;
  phase: Phase;
  arousal: number;
  targets: ActuatorTargets;
}

export interface SessionOpts extends EngineOpts {
  /** 按时间排好的输入（不必预先排序） */
  inputs?: readonly ScheduledInput[];
  /** 跑到这一秒为止（默认：直到会话结束） */
  until?: number;
  /** 每隔多少秒采一帧执行器指令（默认不采） */
  frameEvery?: number;
}

export interface SessionResult {
  header: LogHeader;
  log: LogRecord[];
  frames: SessionFrame[];
  engine: BehaviorEngine;
}

/** 无头跑一场（默认四世到底）：测试、示例日志、将来的固件对照都用它 */
export function runSession(o: SessionOpts): SessionResult {
  const engine = new BehaviorEngine(o);
  const inputs = [...(o.inputs ?? [])].sort((a, b) => a.t - b.t);
  const every = o.frameEvery ? Math.max(1, Math.round(o.frameEvery * HZ)) : 0;
  const until = o.until ?? Infinity;
  const log: LogRecord[] = engine.drain();
  const frames: SessionFrame[] = [];
  let i = 0;
  while (!engine.done && engine.time < until) {
    while (i < inputs.length && inputs[i].t <= engine.time + 1e-9) engine.push(inputs[i++].input);
    engine.tick();
    for (const r of engine.drain()) log.push(r);
    if (every && engine.ticks % every === 0) {
      const st = engine.status();
      frames.push({
        t: st.t,
        life: st.life,
        persona: st.persona,
        phase: st.phase,
        arousal: st.arousal,
        targets: engine.targets(),
      });
    }
  }
  return { header: engine.header(), log, frames, engine };
}
