/**
 * 动作程序（行为引擎「动作词汇 v2」，2026-10-08 研究原型；轮回机器_触手与转向研究.md §8）。
 *
 * 一个动作 = 一张分段表：每段给时长、缓动、臂在段末的姿态（极坐标：弯曲量 + 弯向 + 肌腱轴深卷），
 * 可选一个低频摆动，以及这段里身体其它通道的提示（呼吸、触须、声、光、转身）。解释器每个定步
 * 按表走，直接把臂的指令交给执行层——不再经过人格速度的跟随器（那一级把惊跳和回应磨成了同一个
 * 1–2 秒的鼓包，§8.1）。真正的低通只剩硬件：台架上是三根肌肉的临界阻尼 ω = 5。
 *
 * 纯数据、纯函数：表在动作开始时一次解算成数（人格、刺激方向、随机数都在那一刻定），之后只做
 * 插值——JSON 往返无损，固件照表执行即可。本文件不认识引擎；引擎负责选哪张表、填哪些数。
 */

const TAU = 2 * Math.PI;
const wrapPi = (a: number): number => a - TAU * Math.floor((a + Math.PI) / TAU);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** 缓动：hold 不动 · lin 匀速 · mj 最小急动（钟形速度，「刻意」的手）· out 先快后慢 · out4 更猛的先快 · in 先慢后快（「爬」） */
export type Ease = 'hold' | 'lin' | 'mj' | 'out' | 'out4' | 'in';

export function ease(e: Ease, u: number): number {
  const x = clamp01(u);
  switch (e) {
    case 'hold':
      return 0;
    case 'lin':
      return x;
    case 'mj':
      return x * x * x * (10 + x * (-15 + 6 * x));
    case 'out':
      return 1 - (1 - x) ** 3;
    case 'out4':
      return 1 - (1 - x) ** 4;
    case 'in':
      return x * x * x;
    default:
      return x;
  }
}

/** 臂姿态（极坐标）。bend = 差动幅度分数（与 ActuatorTargets.arm.bend 同义），dir = 弯向（0 上，左为正），deep = 肌腱轴深卷 0–1 */
export interface Pose {
  bend: number;
  dir: number;
  deep: number;
}

export type FeelerPose = 'free' | 'tuck' | 'point' | 'splay' | 'raise' | 'still';
export type VoiceCue = 'chirp' | 'mute' | 'purr' | 'query' | 'huff' | 'fall' | 'tsk';

/** 一段里身体其它通道的提示（都可省 = 照常） */
export interface Cues {
  /**
   * 呼吸：rate = 相位推进速率（1 照常、0 屏住）；push = 叠在输出上往收拢端推多少（行程分数，缩 / 忍）；
   * clench = 「猛收」的力度 0–1（输出朝 0.92 收拢：s + (0.92 − s)·clench，快升慢放）；amp / period = 幅度 /
   * 周期倍数；sigh = 下一口是叹气
   */
  breath?: { rate?: number; push?: number; clench?: number; amp?: number; period?: number; sigh?: boolean };
  /** 触须：姿势 + 指向哪一侧（−1 右 / 0 两侧 / +1 左）；quiver = 3 Hz 颤（rad）；antennate = 2 Hz 交替探（rad） */
  feel?: { pose: FeelerPose; side?: -1 | 0 | 1; quiver?: number; antennate?: number };
  voice?: VoiceCue;
  /** 灯：亮度倍数 */
  light?: number;
  /** 转身：进入这段时把偏航目标相对现在挪多少（rad；限速照旧） */
  yaw?: number;
}

/** 一段（已解算成数） */
export interface Phase extends Cues {
  /** 段名（日志与 HUD 用） */
  name: string;
  dur: number;
  ease: Ease;
  /** 段末臂姿态：具体姿态 / 'rest' = 段末回到此刻的静息姿态 / 'hold' = 保持段首姿态 */
  arm: Pose | 'rest' | 'hold';
  /**
   * 叠在弯曲量上的低频摆动：amp·e^(−decay·τ)·sin(2π·hz·τ)，τ = 段内时间；段末最后 min(0.4 s, 半段) 平滑收到 0
   * （否则段长不是整周期时，换段那一帧臂会跳一下）。臂的通带约 0.7 Hz，hz 一律 ≤ 0.6
   */
  osc?: { amp: number; hz: number; decay: number };
  /** 路径：polar（默认，弯向走弧——刻意的伸、扫）/ line（直线——猛缩、穿过中心的回头） */
  path?: 'polar' | 'line';
}

/** 一个正在执行的程序（纯数据，进引擎状态） */
export interface Program {
  /** 程序名（startle / respond.stroke / curl …） */
  name: string;
  t0: number;
  phases: Phase[];
  /** 当前段号与它开始的时刻 */
  idx: number;
  ts: number;
  /** 当前段的起点姿态（上一段末尾实际给出的姿态） */
  start: Pose;
  /** 上一帧给出的姿态 */
  out: Pose;
  /**
   * 当前段弧路径的弯向增量（进入这一段时按最短弧定下，之后连续展开）。段末是「静息」时静息方向一直在漂，
   * 若每帧重新取最短弧，夹角跨过 180° 那一帧弧会翻面、臂指令跳一下（2026-10-08 守门测试抓到：一帧 0.43）
   */
  dRef: number | null;
}

/** 臂通带上限（Hz）：再快的摆动到不了梢端（§8.2 探针：1.2 Hz 时只剩 6–10 mm） */
export const ARM_OSC_MAX_HZ = 0.6;

export function totalDur(p: { phases: readonly Phase[] }): number {
  return p.phases.reduce((s, ph) => s + ph.dur, 0);
}

export function startProgram(name: string, t0: number, phases: Phase[], from: Pose): Program {
  for (const ph of phases) {
    if (!(ph.dur >= 0)) throw new Error(`程序 ${name} 的段 ${ph.name} 时长非法：${ph.dur}`);
    if (ph.osc && ph.osc.hz > ARM_OSC_MAX_HZ) throw new Error(`程序 ${name} 的段 ${ph.name} 摆动 ${ph.osc.hz} Hz 超过臂的通带`);
  }
  return { name, t0, phases, idx: 0, ts: t0, start: { ...from }, out: { ...from }, dRef: null };
}

/** 两个姿态之间按直线插值（差动平面上走直线：可以穿过中心）；深卷线性 */
export function lerpPoseLine(a: Pose, b: Pose, u: number): Pose {
  const x = a.bend * Math.cos(a.dir) + (b.bend * Math.cos(b.dir) - a.bend * Math.cos(a.dir)) * u;
  const y = a.bend * Math.sin(a.dir) + (b.bend * Math.sin(b.dir) - a.bend * Math.sin(a.dir)) * u;
  const bend = Math.hypot(x, y);
  return { bend, dir: bend > 1e-6 ? Math.atan2(y, x) : u < 0.5 ? a.dir : b.dir, deep: a.deep + (b.deep - a.deep) * u };
}

/** 弧路径的弯向增量：最短弧；给了参考增量 ref 时取离 ref 最近的那一支（连续展开，不翻面） */
export function arcDelta(a: Pose, b: Pose, ref: number | null = null): number {
  const dirA = a.bend < 0.03 ? b.dir : a.dir;
  const dirB = b.bend < 0.03 ? dirA : b.dir;
  const raw = wrapPi(dirB - dirA);
  return ref === null ? raw : ref + wrapPi(raw - ref);
}

/** 两个姿态之间按缓动插值：弯曲与深卷线性，弯向走弧（默认最短弧；弯曲很小时直接取另一端的弯向，免得在原地打转） */
export function lerpPose(a: Pose, b: Pose, u: number, d: number = arcDelta(a, b)): Pose {
  const dirA = a.bend < 0.03 ? b.dir : a.dir;
  return {
    bend: a.bend + (b.bend - a.bend) * u,
    dir: wrapPi(dirA + d * u),
    deep: a.deep + (b.deep - a.deep) * u,
  };
}

/**
 * 推进到时刻 t，给出此刻的臂姿态与生效的那一段。rest = 此刻的静息姿态（引擎实时算）。
 * 程序走完返回 done = true（姿态停在最后一段的末尾，通常就是静息姿态）。会改写 p 的 idx / ts / start / out。
 */
export function stepProgram(p: Program, t: number, rest: Pose): { pose: Pose; phase: Phase | null; done: boolean; tau: number } {
  while (p.idx < p.phases.length && t >= p.ts + p.phases[p.idx].dur) {
    // 跨过段界：下一段从这一段的段末姿态起
    const ph = p.phases[p.idx];
    p.start = target(ph, p.start, rest);
    p.ts += ph.dur;
    p.idx++;
    p.dRef = null;
  }
  if (p.idx >= p.phases.length) {
    p.out = { ...p.start };
    return { pose: p.out, phase: null, done: true, tau: 0 };
  }
  const ph = p.phases[p.idx];
  const tau = t - p.ts;
  const u = ph.dur > 0 ? tau / ph.dur : 1;
  const to = target(ph, p.start, rest);
  let pose: Pose;
  if (ph.path === 'line') pose = lerpPoseLine(p.start, to, ease(ph.ease, u));
  else {
    p.dRef = arcDelta(p.start, to, p.dRef);
    pose = lerpPose(p.start, to, ease(ph.ease, u), p.dRef);
  }
  if (ph.osc && ph.osc.amp !== 0) {
    const fade = Math.min(0.4, ph.dur / 2);
    const left = (ph.dur - tau) / fade;
    const win = left >= 1 ? 1 : left <= 0 ? 0 : left * left * (3 - 2 * left);
    const w = win * ph.osc.amp * Math.exp(-ph.osc.decay * tau) * Math.sin(TAU * ph.osc.hz * tau);
    pose = { ...pose, bend: Math.max(0, pose.bend + w) };
  }
  p.out = pose;
  return { pose, phase: ph, done: false, tau };
}

function target(ph: Phase, start: Pose, rest: Pose): Pose {
  if (ph.arm === 'hold') return start;
  if (ph.arm === 'rest') return rest;
  return ph.arm;
}
