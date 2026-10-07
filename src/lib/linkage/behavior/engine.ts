/**
 * 行为引擎（轮回机器_行为引擎spec.md §2、§4–§7）。
 *
 * 传感事件 → 人格参数 × 生命阶段 × 内部状态 → 执行器指令，同一条事件流写成实验日志。
 * 零 DOM、零依赖（只用站内两件纯函数装备：motion.dampStep 与 fixed-step）；
 * 状态是一块纯数据（EngineState），可整块快照 / 恢复——跨路由交接与将来的固件对照都靠它。
 *
 * 时间只认仿真秒，定步 1/60 s。同种子 + 同事件序列 ⇒ 执行器指令逐位相同、日志逐字相同。
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
import { type Outcome, type PresenceBand, type SensorInput, type SensorKind, intensityOf, sensorPayload } from './events';
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
import { type Rng, chance, deriveSeed, makeRng, pick, uniform } from './rng';

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
  /** 臂：tone = 预张力 0–1（0 = 松弛无力），bend = 弯曲量（差动幅度分数）0–1，dir = 弯向（rad，腱系） */
  arm: { tone: number; bend: number; dir: number };
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
  /** 本段已过 / 本段总长（秒） */
  phaseElapsed: number;
  phaseLen: number;
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
  /** 抓住那一刻的弯曲（握物至少这么紧） */
  contact: number;
  chases: number;
  searches: number;
  reason: string;
}

/** 引擎的全部状态：纯数据，JSON 往返无损（快照 / 交接 / 固件对照） */
export interface EngineState {
  v: 1;
  seed: number;
  order: PersonaKey[];
  loop: boolean;
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
  phaseTick: number;
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
  vigor: number;
  done: boolean;
  inbox: SensorInput[];
}

export interface EngineOpts {
  seed: number;
  /** 人格呈现顺序（A–D 各一次）；默认 A → B → C → D（示意） */
  order?: readonly PersonaKey[];
  /** 四世之后是否从头再来（台架用）；默认 false = 第四世空白结束即会话结束 */
  loop?: boolean;
}

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
      this.s = JSON.parse(JSON.stringify(restore)) as EngineState;
      return;
    }
    const raw: readonly unknown[] = opts.order ?? PERSONA_KEYS;
    if (!isPersonaOrder(raw)) throw new Error(`人格顺序必须是 A–D 各一次：${raw.join(',')}`);
    const order = [...raw];
    const seed = opts.seed >>> 0;
    this.s = {
      v: 1,
      seed,
      order,
      loop: opts.loop ?? false,
      tick: 0,
      rem: 0,
      rng: makeRng(seed),
      sched: makeRng(deriveSeed(seed, 1)),
      ageLens: [],
      seq: 0,
      life: 1,
      phase: 'BIRTH',
      phaseTick: 0,
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
      vigor: 0,
      done: false,
      inbox: [],
    };
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
    return sessionHeader(this.s.seed, this.s.order, HZ);
  }

  /** 收一条传感事件；下一步开始时处理，时间戳 = 那一步的时刻 */
  push(input: SensorInput): void {
    this.s.inbox.push(input);
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
      phaseElapsed: (s.tick - s.phaseTick) / HZ,
      phaseLen: s.phaseLen / HZ,
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
    const breath = clamp01(s.center.x + 0.5 * s.amp.x * Math.cos(TAU * s.phi));
    const bend = Math.min(1, Math.hypot(s.armX.x, s.armY.x));
    const drive = (k: 0 | 1): FeelerDrive => {
      const r = s.reflex[k];
      return { base: s.feeler[k].x, startle: { t: r.t0 < 0 ? Infinity : t - r.t0, dir: r.dir, gain: r.gain } };
    };
    return {
      breath: { s: breath },
      arm: { tone: s.tone, bend, dir: bend > 1e-9 ? Math.atan2(s.armY.x, s.armX.x) : 0 },
      feelers: [drive(0), drive(1)],
      yaw: s.yaw.x,
      light: { level: s.vigor * (0.35 + 0.65 * (1 - breath)) },
      sound: { on: s.voiceOn, f: s.voiceF, duty: s.voiceDuty, level: s.vigor },
    };
  }

  /** 推进一个定步 */
  tick(): void {
    const s = this.s;
    if (s.done) return;
    const t = s.tick / HZ;
    if (s.tick - s.phaseTick >= s.phaseLen) this.advancePhase(t);
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
    s.tick++;
  }

  // ---------------------------------------------------------------- 生命阶段

  private context(): Ctx {
    const s = this.s;
    const p = PERSONAS[this.persona()];
    const el = (s.tick - s.phaseTick) / HZ;
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
    s.phaseTick = s.tick;
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
    s.pending = null;
    s.grasp = idleGrasp();
    s.reflex = [noReflex(), noReflex()];
    s.sighNext = false;
    s.sighNow = false;
    s.voiceUntil = -1;
    s.periodScale = 1;
    s.phi = 0;
    // 人此刻在不在是传感事实（保留）；人「曾经」在哪是上一世的记忆（清掉）
    if (s.band === 'gone') s.bearing = null;
    s.speedBase = sampleRange(s.rng, p.speed) / ENGINE.speedRef;
    s.restDir = uniform(s.rng, -Math.PI, Math.PI);
    s.nextSpont = t + LIFE.spontAt;
    s.nextOrient = t + LIFE.spontAt;
    this.newBreath(this.context());
    this.emit('LIFE_BIRTH', { zh: p.zh });
  }

  private onDeathStart(t: number): void {
    const s = this.s;
    const ctx = this.context();
    if (s.pending) {
      this.emit('RESPONSE_DROP', { to: s.pending.id, reason: 'death' });
      s.pending = null;
    }
    if (s.grasp.phase !== 'IDLE' && s.grasp.phase !== 'RELEASE') this.beginRelease(t, ctx, 'death');
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
        break;
      case 'RESISTANCE':
        s.tension = e.on;
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
        const th = sampleRange(s.rng, ctx.p.startle);
        if (I > th) {
          const g = s.gesture;
          out = g && g.kind === 'startle' && t < g.t0 + g.dur ? 'busy' : 'startle';
          if (out === 'startle') this.startle(e, rec.id, I, th, t, ctx);
        } else if (s.pending || (s.gesture && s.gesture.kind !== 'spont')) {
          out = 'busy';
        } else {
          const tau = sampleRange(s.rng, ctx.p.latency, VARIABILITY.response) * ctx.age.latency;
          s.pending = { due: t + tau, at: t, id: rec.id, kind: e.kind, bearing: this.stimulusBearing(e) };
          out = 'respond';
        }
      }
    }
    rec.out = out;
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
    const t0 = t + ENGINE.startleLatency;
    s.gesture = {
      kind: 'startle',
      action: 'flinch',
      t0,
      dur: MOTION.startle,
      dir: MOTION.down,
      dir2: MOTION.down,
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
  }

  private gestureDur(base: number): number {
    return clamp(base / Math.sqrt(this.s.speed), MOTION.durMin, MOTION.durMax);
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
    const arm = !grasp && s.grasp.phase === 'IDLE' && chance(s.rng, 0.75);
    const feeler = chance(s.rng, 0.6);
    let turn: 'toward' | 'away' | 'none' = 'none';
    if (pd.bearing !== null) {
      if (sign < 0) turn = 'away';
      else if (chance(s.rng, p.toward)) turn = 'toward';
    }
    if (turn !== 'none' && pd.bearing !== null) {
      const b = turn === 'toward' ? pd.bearing : wrapPi(pd.bearing + Math.PI);
      const d = clamp(wrapPi(b - s.yaw.x), -MOTION.turnMax, MOTION.turnMax);
      s.yawTarget = clampYaw(s.yaw.x + d);
    }
    const dir = (sign > 0 ? MOTION.up : MOTION.down) + uniform(s.rng, -MOTION.dirSpread, MOTION.dirSpread);
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
    switch (action) {
      case 'sigh':
        s.sighNext = true;
        break;
      case 'curl': {
        const dir = uniform(s.rng, -Math.PI, Math.PI);
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

  // ---------------------------------------------------------------- 抓握

  private graspBend(t: number, ctx: Ctx): number {
    const g = this.s.grasp;
    switch (g.phase) {
      case 'WRAP':
        return g.from + (GRASP.limit - g.from) * smooth((t - g.t0) / g.dur);
      case 'HOLD_HUMAN':
        return GRASP.human * ctx.grip;
      case 'HOLD_OBJECT':
        return Math.max(g.contact, GRASP.object) * ctx.grip;
      default:
        return g.from;
    }
  }

  private beginWrap(t: number, chase: boolean): void {
    const s = this.s;
    const bend = Math.hypot(s.armX.x, s.armY.x);
    s.grasp = {
      ...s.grasp,
      phase: 'WRAP',
      t0: t,
      dur: this.gestureDur(GRASP.wrap),
      dir: bend > 0.05 ? Math.atan2(s.armY.x, s.armX.x) : MOTION.up,
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
    if (!still) {
      const T = s.period * (1 - ENGINE.arousal.breath * s.arousal);
      s.phi += DT / T;
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
      aT = clamp01(aT);
      if (ctx.death) cT += (1 - cT) * ctx.death.sink;
      if (s.phase === 'BIRTH') cT = 1 - (1 - cT) * ctx.ramp;
      cT = clamp(cT, aT / 2, 1 - aT / 2);
    }
    dampStep(s.amp, aT, ENGINE.ampOmega, DT);
    dampStep(s.center, cT, ENGINE.centerOmega, DT);
  }

  private stepArm(t: number, ctx: Ctx): void {
    const s = this.s;
    s.restDir = wrapPi(s.restDir + MOTION.restDrift * s.speed * DT);
    const rest = MOTION.restBend * ctx.vigor;
    let bx = rest * Math.cos(s.restDir);
    let by = rest * Math.sin(s.restDir);
    const g = s.grasp;
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
    const fast = s.gesture && s.gesture.kind === 'startle' ? MOTION.yawRateStartle : 1;
    const step = MOTION.yawRate * k * fast * DT;
    s.yawGoal += clamp(s.yawTarget - s.yawGoal, -step, step);
    dampStep(s.yaw, s.yawGoal, MOTION.yawOmega * k, DT);
  }

  private stepFeelers(t: number, ctx: Ctx): void {
    const s = this.s;
    const k = Math.sqrt(s.speed);
    s.psi = (s.psi + TAU * MOTION.feelerFreq * k * DT) % TAU;
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
    src: 'sensor' | 'engine' = 'engine',
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
