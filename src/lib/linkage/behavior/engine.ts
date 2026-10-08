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
import { type Phase as ProgPhase, type Pose, type Program, startProgram, stepProgram, totalDur } from './programs';
import { type Rng, chance, deriveSeed, makeRng, pick, uniform } from './rng';
import { type BuildCtx, type RegKind, type RespKind, type SpontKind, type Variant, V2, buildNotice, buildRegister, buildResponse, buildSettle, buildSpont, buildStartle, nearestAxisDir } from './vocab2';

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

/** 状态格式版本（快照恢复时核对；v2 = M2 加生命钟；v3 = 手）。动作词汇 v2 的会话记 STATE_VERSION_V2（多一块 m2） */
export const STATE_VERSION = 3;
export const STATE_VERSION_V2 = 4;

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
    return sessionHeader(this.s.seed, this.s.order, HZ, this.s.lifeRate0);
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
    if (!m || !m.prog) return null;
    const ph = m.prog.phases[m.prog.idx];
    return { name: m.prog.name, phase: ph ? ph.name : '' };
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
      out.light.level = Math.min(1, out.light.level * (this.progPhase()?.light ?? 1));
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
    this.stepGrasp(t, ctx);
    if (t >= s.nextSpont) this.spontaneous(t, ctx);
    if (t >= s.nextOrient) this.orient(t, ctx);
    this.stepBreath(t, ctx);
    this.stepArm(t, ctx);
    this.stepFeelers(t, ctx);
    this.stepYaw();
    s.vigor = ctx.vigor;
    const exhale = (s.phi + 0.5) % 1 < s.voiceDuty;
    s.voiceOn = s.phase !== 'BLANK' && ctx.vigor > 0.05 && (t < s.voiceUntil || exhale);
    if (s.m2) {
      // v2：凝住 / 定向停顿时连呼气声也收住（短促的那一声照出）；呼噜、询问、下沉的那几段一直出声
      const v = this.progPhase()?.voice;
      if (v === 'mute' && !(t < s.voiceUntil)) s.voiceOn = false;
      else if ((v === 'purr' || v === 'query' || v === 'fall') && s.phase !== 'BLANK' && ctx.vigor > 0.05) s.voiceOn = true;
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
        if (s.m2) s.m2.prog = null;
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
    // 手碰臂时正忙：电极电平还在，就等机器空下来再认一次（recheckContact）；松手即作罢
    if (e.kind === 'ARM_TOUCH') s.armWaiting = e.on && out === 'busy' ? rec.id : -1;
  }

  /** 一个刺激（已过静默期、唤醒已加）怎么处理：惊跳 / 正忙 / 排进响应。id = 它那条记录 */
  private evaluate(e: SensorInput, I: number, id: number, t: number, ctx: Ctx): Outcome {
    const s = this.s;
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
      // v2：反射（0.1 s 后沿背离刺激的腱轴深卷、环身猛收屏气）→ 凝住（长短看 τ）→ 按人格的恢复
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
      const rb = b ?? s.bearing;
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

  /** v2：此刻正在执行的那一段（没有程序 = null） */
  private progPhase(): ProgPhase | null {
    const m = this.s.m2;
    if (!m || !m.prog) return null;
    return m.prog.phases[m.prog.idx] ?? null;
  }

  /** 此刻给出的臂姿态（极坐标） */
  private curPose(): Pose {
    const s = this.s;
    const bend = Math.hypot(s.armX.x, s.armY.x);
    return { bend, dir: bend > 1e-9 ? Math.atan2(s.armY.x, s.armX.x) : s.restDir, deep: s.m2?.deep ?? 0 };
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
      motion = `respond.${kind}${directed ? `.${variant}` : ''}`;
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
    const m = this.s.m2;
    if (!m) return 1;
    if (t < this.s.voiceUntil) return m.burstF;
    const prog = m.prog;
    const ph = prog ? prog.phases[prog.idx] : undefined;
    if (!prog || !ph) return 1;
    const u = ph.dur > 0 ? clamp01((t - prog.ts) / ph.dur) : 1;
    switch (ph.voice) {
      case 'purr':
        return 0.7;
      case 'query':
        return 1 + 0.3 * u;
      case 'fall':
        return 1.3 - 0.6 * u;
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
      this.beginWrap(t, false);
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
    const armFree = s.grasp.phase === 'IDLE';
    let action: GestureAction | 'sigh';
    if (armFree && s.grasp.searches > 0) {
      action = 'search';
      s.grasp.searches--;
    } else {
      const choices: readonly (GestureAction | 'sigh')[] = armFree ? ['curl', 'sway', 'flick', 'sigh'] : ['flick', 'sigh'];
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
      if (!h) return;
      if (!h.seen) s.hand = null;
      else if (h.present) {
        h.present = false;
        h.goneAt = t;
        h.turning = false;
      }
      return;
    }
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
    if (h.mode === null || h.mode === 'look' || !h.present || !ctx.orientOk || startled || !free || this.handOnBody(h)) {
      h.turning = false;
      // 不跟了：正在绕回的长路作废、就地停下（惊跳那一下的转向留着）
      if (h.unwind) {
        h.unwind = false;
        if (!startled) s.yawTarget = s.yawGoal;
      }
      return;
    }
    // 迎：转到让臂线对准手的朝向（臂偏在机身中线右侧）；躲：机身中线背对手
    const want = h.mode === 'toward' ? h.steerFace : wrapPi(h.steer + Math.PI);
    const off = Math.abs(wrapPi(want - s.yaw.x));
    if (!h.turning) {
      const reach = h.aimBend <= HAND.reachBend && h.aimDist <= HAND.reachFar * HAND.armL;
      const need = h.mode === 'away' ? off > HAND.turnAt : h.aimBend > HAND.reachBend || (off > HAND.turnAt && !reach);
      if (need) h.turning = true;
    }
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
        this.emit('ORIENT', { mode: 'unwind', to: goal });
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
    if (h.unwind) s.yawTarget = s.yawGoal;
    h.seen = false;
    h.mode = null;
    h.noticeAt = NEVER;
    h.outSince = NEVER;
    h.turning = false;
    h.turnSign = 0;
    h.unwind = false;
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
    this.emit('GRASP_START', { chase });
  }

  private beginRelease(t: number, ctx: Ctx, reason: string): void {
    const s = this.s;
    const from = this.graspBend(t, ctx);
    const slow = reason === 'death' ? GRASP.deathRelease : 1;
    s.grasp = { ...s.grasp, phase: 'RELEASE', t0: t, dur: this.gestureDur(GRASP.release) * slow, from, reason };
  }

  private stepGrasp(t: number, ctx: Ctx): void {
    const s = this.s;
    const g = s.grasp;
    switch (g.phase) {
      case 'WRAP': {
        const v = graspVerdict({ tension: s.tension, electrode: s.electrode, atLimit: t - g.t0 >= g.dur });
        if (v === 'HOLD_HUMAN' || v === 'HOLD_OBJECT') {
          g.contact = this.graspBend(t, ctx);
          g.contactW = s.wrap.x;
          g.phase = v;
          this.emit(v === 'HOLD_HUMAN' ? 'GRASP_HOLD_HUMAN' : 'GRASP_HOLD_OBJECT');
        } else if (v === 'EMPTY') {
          const searches = emptySearches(this.persona(), s.rng);
          this.emit('GRASP_EMPTY', { searches });
          this.beginRelease(t, ctx, 'empty');
          s.grasp.searches = searches;
        }
        return;
      }
      case 'HOLD_HUMAN':
      case 'HOLD_OBJECT': {
        if (!s.tension) {
          const reaction = g.chases < GRASP.maxChases ? lostReaction(this.persona(), s.rng) : 'giveUp';
          this.emit('GRASP_LOST', { reaction });
          if (reaction === 'chase') {
            g.chases++;
            this.beginWrap(t, true);
          } else this.beginRelease(t, ctx, 'lost');
          return;
        }
        const want: GraspPhase = s.electrode ? 'HOLD_HUMAN' : 'HOLD_OBJECT';
        if (want !== g.phase) {
          g.phase = want;
          this.emit(want === 'HOLD_HUMAN' ? 'GRASP_HOLD_HUMAN' : 'GRASP_HOLD_OBJECT');
        }
        return;
      }
      case 'RELEASE':
        if (t - g.t0 >= g.dur) {
          this.emit('RELEASE_DONE', { after: g.reason });
          g.phase = 'IDLE';
          // 抓空后的搜寻：尽快排上（自发调度见 spontaneous 的 search 分支）
          if (g.searches > 0) s.nextSpont = Math.min(s.nextSpont, t + 0.3);
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
    const br = s.m2 && !ctx.death ? this.progPhase()?.breath : undefined;
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
    // 看见了手（在、不在机身上方）：静息姿态换成「够手」（迎）或「背着手弯」（躲）。没有手时这段整个跳过
    const h = s.hand;
    if (h && h.seen && h.present && ctx.responsive && !this.handOnBody(h) && (h.mode === 'toward' || h.mode === 'away')) {
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
      if (s.grasp.phase !== 'IDLE') m.prog = null;
      if (m.prog) {
        // 动作程序直接给臂（不经人格跟随器）；速度按差分记下，程序走完跟随器接着走不跳
        const restPose: Pose = { bend: Math.hypot(bx, by), dir: Math.atan2(by, bx), deep: 0 };
        const r = stepProgram(m.prog, t, restPose);
        if (r.phase && m.prog.idx !== m.seen) {
          m.seen = m.prog.idx;
          this.enterPhase(t, r.phase);
        }
        const x = r.pose.bend * Math.cos(r.pose.dir);
        const y = r.pose.bend * Math.sin(r.pose.dir);
        s.armX.v = (x - s.armX.x) / DT;
        s.armY.v = (y - s.armY.x) / DT;
        s.armX.x = x;
        s.armY.x = y;
        m.deep = r.pose.deep;
        if (r.done) m.prog = null;
        dampStep(s.wrap, 0, MOTION.armOmega * Math.sqrt(s.speed), DT);
        s.tone = ctx.tone;
        return;
      }
      m.deep = 0;
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
    const reflexNow = !s.m2 || (s.m2.prog !== null && s.m2.prog.name === 'startle' && s.m2.prog.idx <= 2);
    const fast = s.gesture && s.gesture.kind === 'startle' && reflexNow ? MOTION.yawRateStartle : 1;
    const step = MOTION.yawRate * k * fast * DT;
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
      const f = this.progPhase()?.feel;
      const pose = f?.pose ?? 'free';
      const sweep = pose === 'free' ? MOTION.feelerAmp * ctx.vigor * (1 + ENGINE.arousal.feeler * s.arousal) * Math.sin(s.psi) : 0;
      const side = f?.side ?? 0;
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
