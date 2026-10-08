/**
 * 动作词汇 v2 的程序表（2026-10-08 研究原型；轮回机器_触手与转向研究.md §8，定义待作者拍板）。
 *
 * 只管「一个反应长什么样」：引擎决定做哪种反应、在什么时刻、带什么人格参数，这里按表解算成分段
 * 程序（programs.ts 执行）。人格表的 12 个数一个不改，只改读法（§8.4，均为推断、待拍板）：
 *   - 三种时钟：反射（惊跳的潜伏与屈曲、一缩）用固定秒，四种人格一样；凝住与「听 / 定住」的长短从
 *     ④ 响应延迟 τ 来；刻意的段落 ÷ √k_v（③ 运动速度）；
 *   - 五档限速（差动 D 每秒，随 √k_v 走、各有上下限）：惊跳永远比任何刻意动作快一大截；
 *   - 幅度预算：惊跳 D 0.45–0.72 > 回应 D_r（⑤ 响应强度给）> 自发 E_s（② 呼吸幅度给）> 静息；
 *   - ⑩ 朝人概率决定一次回应是「迎 / 原地 / 躲」；
 *   - 人格的差别在恢复的结构里（A 弹回、B 一步一步探出来、C 回头去查看、D 余震或生硬地落回），不只是快慢。
 *
 * 方向约定同引擎：弯向 0 = 臂梢朝上，左为正；肌腱轴在 0、±120°。惊跳沿「背离刺激」的那根下方腱轴：
 * 左边来的（side = +1）→ −120°，右边来的 → +120°。
 */
import type { PersonaKey } from './persona';
import { type Cues, type Phase, type Pose, arcDelta } from './programs';

const TAU = 2 * Math.PI;
const AXIS = (2 * Math.PI) / 3;
const DEG = Math.PI / 180;
const wrapPi = (a: number): number => a - TAU * Math.floor((a + Math.PI) / TAU);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** 台架换算里的差动跨度（= ARM_DRIVE.span 与 ARM_DRIVE.deepSpan，守门测试核对；这里只用来把「差动 D」换成 bend + deep） */
export const D_SPAN = 0.34;
export const D_DEEP_SPAN = 0.3773;
const SPAN = D_SPAN;
const DEEP_SPAN = D_DEEP_SPAN;

/** 手感常量（均待作者拍板） */
export const V2 = {
  /** 惊跳：反射潜伏、屈曲时长（固定秒，不随人格、不随衰老） */
  startleLatency: 0.1,
  startleFlex: 0.15,
  /** 惊跳深度（差动 D）：0.45 → 0.717 按超出阈值的程度分级，× (0.75 + 0.25·活力)，下限 0.45；上限 = 执行层的 ARM_DRIVE.dDeep（主腱拉满）；深卷关着时执行层封顶 0.5 */
  startleDMin: 0.45,
  startleDMax: 0.717,
  /** 12 s 内再吓一次：深度 × 0.8ⁿ（下限照旧）、凝住减半——反射生理的不应期，不是记忆，每世清零 */
  repeatWindow: 12,
  repeatDecay: 0.8,
  /** 凝住 F = (a + τ)·(0.6 + 0.4·m)·(1 + 0.5·衰老)，封顶 cap：A ≈ 0.3–0.5 · C 0.5–0.8 · B 1.4–2.3 · D 0.4–3 */
  freezeA: 0.3,
  freezeCap: 3.0,
  /** 慢的人格（√k_v < 0.8）分两步缩（零振动整形：第二步隔臂摆动的半周期 0.78 s，钩落定不晃）；快的（≥ 1.2）在 +0.55 s 回弹到 0.88 */
  zvSlow: 0.8,
  zvFirst: 0.6,
  zvDelay: 0.78,
  springK: 1.2,
  recoilAt: 0.55,
  recoilTo: 0.88,
  /** 惊跳的环身猛收力度：0.45 + 0.4·m（输出朝 0.92 收拢的比例） */
  clench0: 0.45,
  clench1: 0.4,
  /** 回应幅度 D_r = (0.10 + 0.30·clamp(|g|/0.5)) × 活力：A 0.34 · C 0.25 · B 0.16（表里 4:1 压成 2.1:1） */
  respD0: 0.1,
  respD1: 0.3,
  /** 自发 E_s = (0.06 + 0.09·clamp((② − 0.2)/0.7)) × 活力：A 0.137 · C 0.099 · B 0.073；D 封顶 0.08 */
  spontE0: 0.06,
  spontE1: 0.09,
  spontDMax: 0.08,
  /** 静息姿态随呼吸起伏（弯曲 ±） */
  restBreathe: 0.03,
  /** 惊跳时知道人在哪：机身往反方向避开多少（rad） */
  startleRecoil: 0.25,
  /** 短促发声的长度（秒）：chirp / huff 0.15、tsk 0.08 */
  burst: 0.15,
  tsk: 0.08,
  /** 一缩（接近阈值的触碰，0.65 ≤ I/θ ≤ 1）：差动 0.12，沿背离的腱轴，不凝住、不屏气、不闪灯 */
  nearThreshold: 0.65,
  winceD: 0.12,
  /** 呼吸相位速率的跟随器（屏住 / 放开在 ~0.1 s 内完成，曲柄不顿）；猛收快升（ω 10）慢放（ω 3） */
  breathRateOmega: 12,
  clenchUp: 10,
  clenchDown: 3,
  /** 呼吸提示的曲柄限速：π·幅度/周期 ≤ 1.2 s⁻¹（曲柄 ≤ 4.19 rad/s） */
  breathRateCap: 1.2,
  /**
   * 触须姿势偏移（rad，[触须 0, 触须 1]；正 = 反射约定里的「甩向 L 侧」）。tuck 收、splay 张开、raise 竖起、
   * still 停在中位不扫；point 另加 feelerPoint × 侧别（两条一起指向刺激那边）。真机的装配方向待核。
   */
  feelerPose: {
    free: [0, 0],
    still: [0, 0],
    tuck: [-0.45, 0.45],
    splay: [0.45, -0.45],
    raise: [0.3, 0.3],
    point: [0, 0],
  } as Record<'free' | 'still' | 'tuck' | 'splay' | 'raise' | 'point', readonly [number, number]>,
  feelerPoint: 0.35,
  feelerPoseOmega: 16,
} as const;

/** 解算一个程序需要的现场数（引擎在动作开始那一刻填） */
export interface BuildCtx {
  persona: PersonaKey;
  /** √k_v（含衰老与 D 的每次重抽）：刻意段落 ÷ 它，限速档随它走 */
  k: number;
  /** 本次抽到的响应延迟 τ（秒，已含噪声与衰老） */
  tau: number;
  /** 本次的响应强度 |g| 与符号（D 可能为负 = 缩而不迎） */
  gAbs: number;
  sign: 1 | -1;
  /** 活力（衰老 / 诞生时 < 1） */
  vigor: number;
  /** 衰老进度 0–1：先拿掉花样（预备、弹回、探头），再拿掉反射 */
  ageU: number;
  /** 这一世的呼吸幅度 ②（行程分数）与此刻的呼吸周期（秒） */
  breathAmp: number;
  period: number;
  /** 此刻的静息姿态与此刻给出的姿态 */
  rest: Pose;
  cur: Pose;
  /** 均匀随机数 [0, 1)（引擎的种子流；调用次数确定，可复现） */
  rnd: () => number;
}

// ------------------------------------------------------------------ 几何与限速

/** 姿态 → 差动 D（含深卷） */
export const dOf = (p: Pose): number => SPAN * p.bend + DEEP_SPAN * p.deep;

/** 不在腱轴上的姿态的差动上限：只用弯曲、且给摆动（osc ≤ 0.14）留出余量，弯曲不会被执行层削到 1 */
export const OFF_AXIS_DMAX = SPAN * 0.86;

/** 弯向是否正对某根腱轴（深卷只给这种姿态） */
export const onAxis = (dir: number): boolean => Math.abs(wrapPi(dir - Math.round(dir / AXIS) * AXIS)) < 1e-9;

/**
 * 差动 D → 姿态。正对腱轴时 D > 0.34 的部分走肌腱轴深卷（执行层只在硬窗里放开）；不在轴上时只用弯曲、
 * 封顶 OFF_AXIS_DMAX——两腱之间带着深卷，弧路径一扫过某根腱的硬窗，三腱指令就会跳（审查实测 0.13 / 帧）
 */
export function poseOfD(D: number, dir: number): Pose {
  const d = Math.max(0, D);
  if (!onAxis(dir)) return { bend: Math.min(d, OFF_AXIS_DMAX) / SPAN, dir: wrapPi(dir), deep: 0 };
  const bend = Math.min(1, d / SPAN);
  const deep = d > SPAN ? clamp((d - SPAN) / DEEP_SPAN, 0, 1) : 0;
  return { bend, dir: wrapPi(dir), deep };
}

/** 背离刺激的那根下方腱轴：side +1（左）→ −120°，−1（右）→ +120°；不知道哪边 → 离此刻弯向远的那根下方轴 */
export function awayAxis(side: number, cur: Pose): number {
  if (side > 0) return -AXIS;
  if (side < 0) return AXIS;
  const opp = wrapPi(cur.dir + Math.PI);
  return Math.abs(wrapPi(opp - AXIS)) < Math.abs(wrapPi(opp + AXIS)) ? AXIS : -AXIS;
}

/** 离给定方向最近的腱轴（0 / ±120°） */
export function nearestAxisDir(dir: number): number {
  return wrapPi(Math.round(dir / AXIS) * AXIS);
}

/** 朝刺激那一侧、偏上：side·deg（side = 0 时就是正上） */
const toward = (side: number, deg: number): number => side * deg * DEG;
const side3 = (s: number): -1 | 0 | 1 => (s > 0 ? 1 : s < 0 ? -1 : 0);

/**
 * 速度分档（指令空间，差动 D 每秒；随 √k_v 走，各有上下限——A 永远比 B 快，但 A 的刻意动作也到不了惊跳的一半）：
 *   reflex 不限（屈曲固定 0.15 s）· recover clamp(0.9k, 0.45, 1.2)×(0.5 + 0.5·活力) · urgent clamp(0.35k, 0.22, 0.45)
 *   · deliberate clamp(0.20k, 0.15, 0.26) · spont clamp(0.11k, 0.07, 0.15)
 * 每段的时长至少要让「缓动的峰值速度 ≤ 档位」。
 */
export type Tier = 'reflex' | 'recover' | 'urgent' | 'deliberate' | 'spont';
export function tierSpeed(tier: Tier, k: number, vigor = 1): number {
  switch (tier) {
    case 'reflex':
      return Infinity;
    case 'recover':
      return clamp(0.9 * k, 0.45, 1.2) * (0.5 + 0.5 * vigor);
    case 'urgent':
      return clamp(0.35 * k, 0.22, 0.45);
    case 'deliberate':
      return clamp(0.2 * k, 0.15, 0.26);
    default:
      return clamp(0.11 * k, 0.07, 0.15);
  }
}
/** 各缓动的「峰值速度 / 平均速度」 */
const PEAK: Record<Phase['ease'], number> = { hold: 0, lin: 1, mj: 1.875, out: 3, out4: 4, in: 3 };

/** 两个姿态之间走过的差动路程：直线路径 = 弦长；弧路径 ≈ √(ΔD² + (D̄·Δθ)²) */
export function pathLen(a: Pose, b: Pose, path: Phase['path'] = 'polar'): number {
  const ra = dOf(a);
  const rb = dOf(b);
  if (path === 'line') {
    const dx = ra * Math.cos(a.dir) - rb * Math.cos(b.dir);
    const dy = ra * Math.sin(a.dir) - rb * Math.sin(b.dir);
    return Math.hypot(dx, dy);
  }
  const dth = a.bend < 0.03 || b.bend < 0.03 ? 0 : Math.abs(wrapPi(b.dir - a.dir));
  return Math.hypot(rb - ra, ((ra + rb) / 2) * dth);
}

/** 段末姿态（'rest' 按此刻的静息姿态估） */
const endOf = (p: Phase, at: Pose, rest: Pose): Pose => (p.arm === 'hold' ? at : p.arm === 'rest' ? rest : p.arm);

/**
 * 深卷的「解钩」：带深卷（弯向正对腱轴）的姿态要换弯向之前，先在轴上把深卷收回（0.2 s 起，限速 recover），
 * 执行层的深卷窗口是硬的，不收回就离轴会让差动一下子从 0.7 掉到 0.5。就地插段。
 */
export function unhook(phases: Phase[], from: Pose, rest: Pose): Phase[] {
  const out: Phase[] = [];
  let at = from;
  for (const p of phases) {
    const to = endOf(p, at, rest);
    if (at.deep > 1e-6 && (p.arm === 'rest' || Math.abs(wrapPi(to.dir - at.dir)) > 1e-6)) {
      out.push({ name: 'unhook', dur: 0.2, ease: 'mj', path: 'line', arm: { bend: at.bend, dir: at.dir, deep: 0 }, breath: p.breath, feel: p.feel, light: p.light });
      at = { bend: at.bend, dir: at.dir, deep: 0 };
    }
    out.push(p);
    at = to;
  }
  return out;
}

/** 按档位拉长太快的段（就地改 dur）；tiers 按段名覆盖默认档。没指定路径、弧要转过 90° 以上的段改走直线（穿过中心，不绕到另一侧去） */
export function govern(phases: Phase[], c: BuildCtx, tier: Tier, tiers?: Partial<Record<string, Tier>>): Phase[] {
  let at = c.cur;
  for (const p of phases) {
    if (p.path === undefined && p.ease !== 'hold') {
      const to0 = endOf(p, at, c.rest);
      if (Math.abs(arcDelta(at, to0)) > Math.PI / 2) p.path = 'line';
    }
    const tr = tiers?.[p.name] ?? (p.name === 'unhook' ? 'recover' : tier);
    const to = endOf(p, at, c.rest);
    const v = tierSpeed(tr, c.k, c.vigor);
    if (Number.isFinite(v) && p.ease !== 'hold') p.dur = Math.max(p.dur, (PEAK[p.ease] * pathLen(at, to, p.path)) / v);
    // 摆动的峰速 2π·hz·amp·span 也不超档（慢的人格点头、嗅探收小）
    if (Number.isFinite(v) && p.osc) p.osc = { ...p.osc, amp: Math.min(p.osc.amp, v / (TAU * p.osc.hz * SPAN)) };
    at = to;
  }
  return phases;
}

/**
 * 预备：从此刻的姿态往「与将要的运动相反」的方向挪 amount（差动），只是一个小的反向——不是把臂甩到另一侧
 * （审查抓到：原来瞄的是 dir + π 的绝对姿态，下一段就成了绕半圈的大弧）
 */
export function anticPose(cur: Pose, to: Pose, amount: number): Pose {
  const [cx, cy] = [dOf(cur) * Math.cos(cur.dir), dOf(cur) * Math.sin(cur.dir)];
  const [tx, ty] = [dOf(to) * Math.cos(to.dir), dOf(to) * Math.sin(to.dir)];
  const L = Math.hypot(tx - cx, ty - cy);
  if (L < 1e-9) return { ...cur, deep: 0 };
  const x = cx - (amount * (tx - cx)) / L;
  const y = cy - (amount * (ty - cy)) / L;
  const D = Math.hypot(x, y);
  return { bend: Math.min(D, OFF_AXIS_DMAX) / SPAN, dir: D > 1e-9 ? Math.atan2(y, x) : cur.dir, deep: 0 };
}

const ph = (name: string, dur: number, ease: Phase['ease'], arm: Phase['arm'], extra: Partial<Phase> = {}): Phase => ({
  name,
  dur: Math.max(0, dur),
  ease,
  arm,
  ...extra,
});

/** 把目标往外推，直到离此刻的姿态至少 minD（差动）：臂已经朝那边时，动作也不会凭空消失 */
function atLeast(target: Pose, cur: Pose, minD: number): Pose {
  const cap = target.deep > 0 ? 1 : OFF_AXIS_DMAX / SPAN;
  let t = target;
  for (let i = 0; i < 60 && pathLen(cur, t, 'line') < minD && t.bend < cap; i++) t = { ...t, bend: Math.min(cap, t.bend + 0.02) };
  return t;
}

// ------------------------------------------------------------------ 惊跳

export interface StartleIn {
  I: number;
  th: number;
  /** 刺激在哪一侧（+1 左 / −1 右 / 0 不知道） */
  side: number;
  /** 引擎定好的轴（看见手 / 知道人在哪时）；不给 = 按 side 取背离的下方腱轴 */
  axis?: number;
  /** 安全规则：不知道哪边、人在近处、方位不明 → 就近缩（深度 0.45、离此刻最近的轴、不甩向一边） */
  retract?: boolean;
  /** 知道人在哪时，机身往反方向避开多少（rad，带符号；0 = 不转） */
  recoilYaw: number;
  /** 恢复里转回去看那个方向（rad，带符号；0 = 不转）——A、C 按 ⑩ 抽 */
  turnBack: number;
  /** 12 s 内已经吓过几次 */
  repeats: number;
}

/** 反射与凝住那几段的段名（之后第一段起就是恢复）：引擎据此定「惊跳正忙」的窗口 */
export const STARTLE_PRE = new Set(['latency', 'flex', 'zvHold', 'zv2', 'recoilHold', 'recoil', 'freeze']);

/**
 * 惊跳 = 反射（四种人格的起动时刻与方向逐位相同）+ 凝住（长短看 τ）+ 恢复（结构看人格）。
 * 反射：0.1 s 后 0.15 s 内沿背离刺激的腱轴直线深卷；环身猛收、屏住呼吸；一声短促的叫、灯一闪随即暗下；
 * 触须甩开再收起。返回程序与「正忙」窗口（反射 + 凝住 + 恢复的第一段）。
 */
export function buildStartle(c: BuildCtx, s: StartleIn): { phases: Phase[]; busy: number } {
  const m = clamp((s.I - s.th) / Math.max(1e-6, 1 - s.th), 0, 1);
  let D = clamp(V2.startleDMin + (V2.startleDMax - V2.startleDMin) * m, V2.startleDMin, V2.startleDMax) * (0.75 + 0.25 * c.vigor);
  D = s.retract ? V2.startleDMin : Math.max(V2.startleDMin, D * V2.repeatDecay ** s.repeats);
  const axis = s.retract ? nearestAxisDir(c.cur.dir) : s.axis ?? awayAxis(s.side, c.cur);
  // 臂已经沿这根轴卷着（再吓一次、恢复途中）：惊跳只会卷得更深，不会把臂打开（审查抓到：递减后的目标比此刻还浅）
  const along = dOf(c.cur) * Math.cos(wrapPi(c.cur.dir - axis));
  D = Math.max(D, Math.min(V2.startleDMax, along + 0.05));
  const at = (f: number): Pose => poseOfD(D * f, axis);
  const hook = at(1);
  const first = poseOfD(Math.max(D * V2.zvFirst, along), axis);
  const clench = V2.clench0 + V2.clench1 * m;
  const F = Math.min(V2.freezeCap, (V2.freezeA + c.tau) * (0.6 + 0.4 * m) * (1 + 0.5 * c.ageU)) * (s.repeats > 0 ? 0.5 : 1);
  const quiver = c.persona === 'B' || c.persona === 'D' ? 0.06 + 0.03 * c.ageU : 0.03 * c.ageU;
  const flourish = 1 - c.ageU;
  const flexCue: Partial<Phase> = { path: 'line', breath: { rate: 0, clench }, voice: 'chirp', light: 1.4, feel: { pose: 'splay' }, yaw: s.recoilYaw || undefined };
  const held: Partial<Phase> = { breath: { rate: 0, clench }, voice: 'mute', light: 0.45, feel: { pose: 'tuck', quiver } };
  const out: Phase[] = [ph('latency', V2.startleLatency, 'hold', 'hold')];
  if (c.k < V2.zvSlow) {
    // 慢的人格：两步缩（零振动整形），钩落定不晃——B 的「缩」是收紧，不是甩
    out.push(
      ph('flex', V2.startleFlex, 'out4', first, flexCue),
      ph('zvHold', V2.zvDelay - V2.startleFlex, 'hold', 'hold', { ...held, feel: { pose: 'splay' } }),
      ph('zv2', V2.startleFlex, 'out4', hook, { ...held, path: 'line' }),
      ph('freeze', Math.max(0.2, F - V2.zvDelay), 'hold', 'hold', held),
    );
  } else if (c.k >= V2.springK) {
    // 快的人格：缩到底后在 +0.55 s 回弹到 0.88——弹性是指令给的，不是借求解器的余振
    out.push(
      ph('flex', V2.startleFlex, 'out4', hook, flexCue),
      ph('recoilHold', 0.15, 'hold', 'hold', held),
      ph('recoil', V2.recoilAt - 0.3, 'mj', at(V2.recoilTo), { ...held, path: 'line' }),
      ph('freeze', Math.max(0.1, F - (V2.recoilAt - V2.startleFlex)), 'hold', 'hold', held),
    );
  } else {
    out.push(ph('flex', V2.startleFlex, 'out4', hook, flexCue), ph('freeze', F, 'hold', 'hold', held));
  }
  // 恢复：触须先探（臂动前 0.3 s），呼吸回来、第一口是叹气，猛收慢慢松开；臂离轴前先解钩（unhook）
  const k = c.k;
  const breathBack: Cues['breath'] = { rate: 1, sigh: true };
  const sd = side3(s.side);
  const rec: Phase[] = [];
  const tiers: Partial<Record<string, Tier>> = { latency: 'reflex', flex: 'reflex', zv2: 'reflex', recoil: 'reflex', aftershock: 'reflex', reflinch: 'urgent', drop: 'urgent' };
  switch (c.persona) {
    case 'A': // 弹回：抬起来看一眼（顶点一声 huff），再落回静息
      rec.push(
        ph('probe', 0.3, 'hold', 'hold', { breath: breathBack, feel: { pose: 'free' }, light: 0.7 }),
        ph('rebound', 1.0 / k, 'mj', poseOfD(0.05 + 0.15 * flourish, 0), { path: 'line', breath: { rate: 1 }, light: 1, yaw: s.turnBack || undefined }),
        ph('look', 0.3 / k, 'hold', 'hold', { voice: 'huff' }),
        ph('settle', 1.0 / k, 'mj', 'rest'),
      );
      break;
    case 'B': {
      // 一步一步探出来：伸一点、停、又缩回一点、停、再展开——一直贴着那根轴，呼吸浅、不出声
      const shallow: Cues['breath'] = { rate: 1, amp: 0.6, period: 0.8 };
      rec.push(
        ph('probe', 0.3, 'hold', 'hold', { breath: { ...shallow, sigh: true }, voice: 'mute', feel: { pose: 'free', quiver }, light: 0.7 }),
        ph('peek', 1.0 / k, 'in', at(0.55), { breath: shallow, voice: 'mute', feel: { pose: 'tuck', quiver }, light: 0.7 }),
        ph('pause', 0.5, 'hold', 'hold', { breath: shallow, voice: 'mute', light: 0.75 }),
        ph('reflinch', 0.3, 'mj', at(0.7), { breath: shallow, voice: 'mute', light: 0.75, feel: { pose: 'tuck' } }),
        ph('pause', 0.4, 'hold', 'hold', { breath: shallow, voice: 'mute', light: 0.85 }),
        ph('unfurl', 1.3 / k, 'mj', 'rest', { breath: shallow, voice: 'mute', feel: { pose: 'free' } }),
      );
      break;
    }
    case 'C': // 回头去查看：直线穿过中心朝刺激那边、探两下、再回来
      rec.push(
        ph('probe', 0.3, 'hold', 'hold', { breath: breathBack, feel: { pose: 'point', side: sd }, light: 0.8 }),
        ph('orient', 1.4 / k, 'mj', poseOfD(0.19, toward(sd, 60)), { path: 'line', breath: { rate: 1 }, voice: 'query', feel: { pose: 'point', side: sd, antennate: 0.15 }, light: 1, yaw: s.turnBack || undefined }),
        ph('inspect', 3.3, 'hold', 'hold', { osc: { amp: 0.12 * flourish, hz: 0.6, decay: 0 }, breath: { rate: 1, period: 0.8 }, feel: { pose: 'point', side: sd, antennate: 0.15 } }),
        ph('return', 1.5 / k, 'mj', 'rest'),
      );
      break;
    default: {
      // D 自己的不稳：先松一半，然后 35% 余震（再猛缩一次）、65% 停一会儿发抖——都以生硬的直线落回收尾
      rec.push(ph('loosen', 0.4 / k, 'mj', at(0.5), { breath: { rate: 1, clench: clench * 0.5 }, feel: { pose: 'splay', quiver: 0.08 }, light: 0.6 }));
      if (c.rnd() < 0.35) {
        rec.push(
          ph('aftershock', V2.startleFlex, 'out4', at(0.85), { path: 'line', breath: { rate: 0, clench }, voice: 'chirp', light: 1.3, feel: { pose: 'splay' } }),
          ph('hold2', 0.5, 'hold', 'hold', { breath: { rate: 0, clench }, voice: 'mute', light: 0.5, feel: { pose: 'tuck', quiver: 0.08 } }),
        );
      } else {
        rec.push(ph('hold2', 0.3 + 1.2 * c.rnd(), 'hold', 'hold', { breath: { rate: 1 }, voice: 'mute', light: 0.6, feel: { pose: 'tuck', quiver: 0.08 } }));
      }
      rec.push(ph('drop', 0.5, 'lin', 'rest', { path: 'line', breath: breathBack, feel: { pose: 'free' } }));
      break;
    }
  }
  // 解钩只管恢复：反射段从此刻（哪怕还卷在另一根轴上）直线猛缩过去，0.1 s 起动不许被推迟
  const phases = govern([...out, ...unhook(rec, hook, c.rest)], c, 'recover', tiers);
  let busy = 0;
  let i = 0;
  for (; i < phases.length && STARTLE_PRE.has(phases[i].name); i++) busy += phases[i].dur;
  if (i < phases.length) busy += phases[i].dur;
  return { phases, busy };
}

// ------------------------------------------------------------------ 注意到（潜伏期）

export type RegKind = 'directed' | 'alert' | 'listen';

/**
 * 注意到：刺激一进来（还在人格的响应延迟里）就有看得见的变化——正在做的自发动作停下、臂定住、
 * 呼吸放慢（τ ≥ 1 s 时先屏住，最多 2 s）、触须指向那一侧、灯稍亮、呼气声收住。沉静型 τ = 2 s，此前这两秒
 * 什么都不发生，读作「没反应」；现在读作「迟疑」。
 *   alert（震）= 一切同时停住、触须张开不动；listen（声）= 屏气、触须竖起不动。
 * 接近阈值的触碰（wince）先「一缩」：0.1 s 后差动 0.12 的小缩（限速 urgent），呼吸照走只往收拢端推一点、
 * 一声 tsk，停 0.3 s——惊跳的第一拍缩小版，没有它的后果。返回各段；引擎按全长推迟回应。
 */
export function buildRegister(c: BuildCtx, o: { dur: number; side: number; kind: RegKind; wince?: boolean }): Phase[] {
  const sd = side3(o.side);
  const feel: Cues['feel'] =
    o.kind === 'alert' ? { pose: 'splay' } : o.kind === 'listen' ? { pose: 'raise' } : sd ? { pose: 'point', side: sd } : { pose: 'raise' };
  const cue = (rate: number): Partial<Phase> => ({ breath: { rate }, voice: 'mute', light: 1.15, feel });
  const out: Phase[] = [];
  let left = o.dur;
  if (o.wince) {
    const ax = awayAxis(o.side, c.cur);
    const w = poseOfD(Math.max(V2.winceD, dOf(c.cur) * 0.5), ax);
    out.push(
      ph('latency', V2.startleLatency, 'hold', 'hold', { feel }),
      ph('wince', 0.25, 'mj', atLeast(w, c.cur, V2.winceD), { path: 'line', breath: { rate: 1, push: 0.06 }, voice: 'tsk', feel: { pose: 'tuck' } }),
      ph('catch', 0.3, 'hold', 'hold', { breath: { rate: 1, push: 0.06 }, voice: 'mute', feel }),
    );
    const gov = govern(unhook(out, c.cur, c.rest), c, 'urgent', { latency: 'reflex' });
    out.splice(0, out.length, ...gov);
    left -= out.reduce((a, p) => a + p.dur, 0);
  }
  if (left > 0) {
    if (o.kind !== 'directed') out.push(ph('register', left, 'hold', 'hold', cue(0)));
    else if (c.tau >= 1) {
      const held = Math.min(left, 2);
      out.push(ph('register', held, 'hold', 'hold', cue(0)));
      if (left > held) out.push(ph('register', left - held, 'hold', 'hold', cue(0.3)));
    } else out.push(ph('register', left, 'hold', 'hold', cue(0.3)));
  }
  return out;
}

// ------------------------------------------------------------------ 回应（按刺激的种类分动词）

export type RespKind = 'stroke' | 'hold' | 'pat' | 'poke' | 'feeler' | 'knock' | 'sound' | 'approach' | 'lift' | 'other';
/** 一次回应的变体（⑩ 抽）：迎（朝刺激）· 原地（同一个动作朝正上、0.8 倍）· 躲（往另一侧平着让开、慢、呼吸浅、不出声） */
export type Variant = 'toward' | 'inplace' | 'avoid';

export interface RespIn {
  kind: RespKind;
  side: number;
  variant: Variant;
  /** 75% 的「臂动」硬币：没抽中 = 同一个形状 × 0.6 */
  arm: boolean;
  /** 60% 的「触须」硬币：没抽中 = 触须只有潜伏期里那一下指向，动作里不再指 */
  feeler: boolean;
  /** 回应时转身多少（rad，带符号；0 = 不转），放在臂的主要那一段里（头先于身） */
  turn: number;
}

/** 回应幅度 D_r（差动） */
export const respD = (c: BuildCtx): number => (V2.respD0 + V2.respD1 * clamp(c.gAbs / 0.5, 0, 1)) * c.vigor;

/** 回应 = （潜伏期里已经注意到了）→ 按刺激种类的一个动词 → 停留 → 回来。限速 deliberate，刻意段落 ÷ √k_v。D 的负回应 = 躲 */
export function buildResponse(c: BuildCtx, r: RespIn): Phase[] {
  let phases = responsePhases(c, r);
  if (!r.feeler) phases = phases.map((p) => (p.feel && p.feel.pose === 'point' ? { ...p, feel: undefined } : p));
  return govern(unhook(phases, c.cur, c.rest), c, 'deliberate', { perk: 'urgent' });
}

/**
 * 回应 / 自发 / 看见手用的姿态：只用弯曲、封顶 OFF_AXIS_DMAX，正对腱轴也一样——深卷只给惊跳。不然朝正上
 * （「原地」变体、两侧一起按住）时弯曲顶到 1，后面的点头 / 蹭被削掉上半截（审查复核实测：活力型两侧按住 26/60 次）
 */
const flat = (D: number, dir: number): Pose => ({ bend: Math.min(Math.max(0, D), OFF_AXIS_DMAX) / SPAN, dir: wrapPi(dir), deep: 0 });

function responsePhases(c: BuildCtx, r: RespIn): Phase[] {
  const poseOfD = flat;
  const k = c.k;
  const s3 = side3(r.side);
  const flourish = 1 - c.ageU;
  const scale = r.arm ? 1 : 0.6;
  const Dr = respD(c) * scale;
  const minEx = Math.max(0.7 * Dr, 0.12 * scale);
  const springy = c.k >= V2.springK;
  const anticipates = c.persona === 'A' || c.persona === 'C' || (c.persona === 'D' && springy);
  const creep = c.k < V2.zvSlow;
  const turnCue = r.turn ? { yaw: r.turn } : {};
  /**
   * 动作的方向：迎 = 朝刺激那侧的 deg；原地 = 正上。要转身时扣掉转身的角度——身体转过去以后，臂指的还是
   * 原来那个方向（不然转完身臂又多偏出去一截）
   */
  const dirOf = (deg: number): number => (r.variant === 'inplace' ? 0 : clamp(wrapPi(toward(s3, deg) - r.turn), -Math.PI, Math.PI));
  const reach = (deg: number, D: number): Pose => atLeast(poseOfD(r.variant === 'inplace' ? 0.8 * D : D, dirOf(deg)), c.cur, minEx);
  /** 预备：反方向先缩一点（活泼的、好奇的人格有，沉静的没有） */
  const antic = (to: Pose): Phase[] => (anticipates && flourish > 0.2 ? [ph('antic', 0.25 / k, 'mj', anticPose(c.cur, to, 0.04 * flourish), { path: 'line' })] : []);
  // 躲：往另一侧平着让开、慢、呼吸浅、往收拢端缩一点、触须收起、不出声、灯暗一点——等手走
  const avoid = (holdT: number, leaveT = 2.5): Phase[] => {
    const dir = s3 ? wrapPi(toward(-s3, 90) - r.turn) : c.cur.dir;
    const D = Math.max(respD(c), 0.16) * scale;
    const shy: Partial<Phase> = { breath: { rate: 1, amp: 0.6, push: 0.06 }, voice: 'mute', feel: { pose: 'tuck' }, light: 0.85 };
    return [
      ph('shrink', 1.4 / k, 'in', atLeast(poseOfD(D, dir), c.cur, minEx), { ...shy, ...turnCue }),
      ph('endure', holdT / k, 'hold', 'hold', { ...shy, feel: { pose: 'tuck', quiver: 0.04 } }),
      ph('return', leaveT / k, 'mj', 'rest', { breath: { rate: 1, amp: 0.85 } }),
    ];
  };
  if (c.sign < 0 || (r.variant === 'avoid' && r.kind !== 'knock' && r.kind !== 'lift' && r.kind !== 'sound')) {
    return avoid(r.kind === 'hold' ? 2.2 : 1.5);
  }
  switch (r.kind) {
    case 'stroke':
    case 'hold': {
      // 被抚摸：慢慢倚过去、贴着呼吸蹭、呼噜——唯一没有尖角的回应
      const to = reach(70, Dr);
      const breath: Cues['breath'] = { rate: 1, amp: 1 + 0.5 * c.gAbs, period: 1.25 };
      const hz = Math.min(0.5, 1 / (c.period * 1.25));
      return [
        ...antic(to),
        ph('lean', 1.6 / k, creep ? 'in' : 'mj', to, { breath, voice: 'purr', feel: { pose: 'point', side: s3 }, light: 1.15, ...turnCue }),
        ph('nuzzle', (r.kind === 'hold' ? 3.0 : 1.6) / k, 'hold', 'hold', { osc: { amp: 0.12 * scale, hz, decay: 0 }, breath, voice: 'purr', light: 1.15 }),
        ph('return', 2.0 / k, 'mj', 'rest', { breath: { rate: 1, period: 1.1 } }),
      ];
    }
    case 'pat': {
      // 被轻拍：抬起来朝那边，再在臂的共振频率（≈ 0.6 Hz）上点头，一下比一下小（衰减，免得共振越点越大）；活泼的点三下
      const n = springy ? 3 : 2;
      return [
        ph('lift', 0.8 / k, 'mj', reach(40, Dr), { breath: { rate: 1 }, feel: { pose: 'point', side: s3 }, ...turnCue }),
        ph('bob', n / 0.6, 'hold', 'hold', { osc: { amp: 0.14 * scale * (0.5 + 0.5 * flourish), hz: 0.6, decay: 0.8 }, voice: 'chirp', light: 1.2, feel: { pose: 'point', side: s3, antennate: 0.15 } }),
        ph('return', 1.2 / k, 'mj', 'rest'),
      ];
    }
    case 'poke':
      // 戳：（潜伏期里已经一缩）回头看那个地方、探一下
      return [
        ph('lookback', 0.9 / k, 'mj', reach(45, 0.8 * Dr), { breath: { rate: 1 }, voice: 'query', feel: { pose: 'point', side: s3 }, ...turnCue }),
        ph('hover', 1.0 / k, 'hold', 'hold', { osc: { amp: 0.1 * flourish * scale, hz: 0.5, decay: 0.3 }, feel: { pose: 'point', side: s3, antennate: 0.15 } }),
        ph('return', 1.5 / k, 'mj', 'rest'),
      ];
    case 'feeler': {
      // 碰了触须：臂平着摆到那一侧，屏气盯住，再探两下（呼吸短浅）；好奇的探三下
      const probes = c.persona === 'C' ? 3 : 2;
      return [
        ph('orient', 1.0 / k, 'mj', reach(95, 0.8 * Dr), { breath: { rate: 1 }, voice: 'query', feel: { pose: 'point', side: s3 }, ...turnCue }),
        ph('stare', 0.6 / k, 'hold', 'hold', { breath: { rate: 0 }, voice: 'mute', feel: { pose: 'still' } }),
        ph('sniff', probes / 0.6, 'hold', 'hold', { osc: { amp: 0.12 * flourish * scale, hz: 0.6, decay: 0.3 }, breath: { rate: 1, period: 0.5, amp: 0.4 }, feel: { pose: 'point', side: s3, antennate: 0.15 } }),
        ph('return', 1.4 / k, 'mj', 'rest', { breath: { rate: 1 } }),
      ];
    }
    case 'knock':
    case 'lift': {
      // 震了一下（没有方向）：潜伏期里一切已经停住；臂竖直挺起、静止不动（触须张开、沉静与不稳定的发抖），再叹一口气放开
      const hold = Math.min(2.4, 0.8 + 0.8 * c.tau);
      const still: Partial<Phase> = { breath: { rate: 0 }, voice: 'mute', feel: { pose: 'splay', quiver: c.persona === 'B' || c.persona === 'D' ? 0.05 : 0 }, light: 1.15 };
      return [
        ph('perk', 0.4, 'mj', atLeast(poseOfD(r.kind === 'lift' && c.persona === 'A' ? 0.3 : 0.2, 0), c.cur, 0.12), still),
        ph('brace', r.kind === 'lift' ? hold + 1 : hold, 'hold', 'hold', still),
        ph('release', 1.5 / k, 'mj', 'rest', { breath: { rate: 1, amp: 1.2, sigh: true } }),
      ];
    }
    case 'sound': {
      // 听见了、找不到来源：屏气、触须竖起来听，臂慢慢竖起（「抬头」），然后在正前方慢慢扫一遍；好奇的扫回来
      const w = (c.persona === 'A' ? 60 : c.persona === 'B' ? 30 : c.persona === 'C' ? 50 : 45) * DEG;
      const sgn = c.rnd() < 0.5 ? 1 : -1;
      const D = 0.16;
      const listen: Partial<Phase> = { breath: { rate: 0 }, voice: 'mute', feel: { pose: 'raise' } };
      const out: Phase[] = [
        ph('lift', 0.8 / k, 'mj', atLeast(poseOfD(D, 0), c.cur, 0.12), listen),
        ph('listen', 0.4 + 0.3 * c.tau, 'hold', 'hold', listen),
        ph('scanTo', 0.6 / k, 'mj', poseOfD(D, -sgn * w), { breath: { rate: 1, period: 0.9 }, feel: { pose: 'raise' } }),
        ph('scan', 2.4 / k, 'mj', poseOfD(D, sgn * w), { breath: { rate: 1, period: 0.9 }, voice: 'query' }),
      ];
      if (c.persona === 'C') out.push(ph('scanBack', 2.4 / k, 'mj', poseOfD(D, -sgn * w), { breath: { rate: 1, period: 0.9 } }));
      out.push(ph('return', 1.5 / k, 'mj', 'rest'));
      return out;
    }
    case 'approach': {
      if (r.variant === 'toward') {
        // 有人走近、迎：臂抬起来朝那边伸，呼吸加快、一声上扬，身体跟在臂后面转
        const to = atLeast(poseOfD(Math.max(0.8 * Dr, dOf(c.rest) + 0.12 * scale), s3 ? dirOf(45) : 0), c.cur, minEx);
        return [
          ph('reach', 1.0 / k, 'mj', to, { breath: { rate: 1, period: 0.8, amp: 1 + 0.5 * c.gAbs }, voice: 'query', feel: { pose: 'point', side: s3 }, light: 1.1, ...turnCue }),
          ph('gaze', 1.5 / k, 'hold', 'hold', { osc: { amp: 0.05, hz: 0.3, decay: 0 }, breath: { rate: 1, period: 0.8 } }),
          ph('return', 2.0 / k, 'mj', 'rest'),
        ];
      }
      // 原地（活力 / 好奇「不朝人就随便看」）：朝别处慢慢扫一眼——漫不经心
      const away = s3 ? toward(-s3, 35) : 0.6 * (c.rnd() < 0.5 ? 1 : -1);
      return [
        ph('glance', 0.8 / k, 'mj', atLeast(poseOfD(0.8 * Dr, wrapPi(away - 0.3 * (s3 || 1))), c.cur, minEx), { breath: { rate: 1 }, feel: { pose: 'free' } }),
        ph('pan', 2.4 / k, 'mj', poseOfD(0.8 * Dr, wrapPi(away + 0.3 * (s3 || 1))), { feel: { pose: 'free', antennate: 0.1 } }),
        ph('return', 1.2 / k, 'mj', 'rest'),
      ];
    }
    default: {
      // 其它（没有专门动词的）：朝刺激那边抬起、停一下、回来
      const to = reach(40, Dr);
      return [
        ...antic(to),
        ph('lift', 1.0 / k, 'mj', to, { breath: { rate: 1, amp: 1 + 0.5 * c.gAbs }, feel: { pose: 'point', side: s3 }, ...turnCue }),
        ph('hold', 1.0 / k, 'hold', 'hold'),
        ph('return', 1.5 / k, 'mj', 'rest'),
      ];
    }
  }
}

// ------------------------------------------------------------------ 自发

export type SpontKind = 'curl' | 'sway' | 'search' | 'flick';

/** 自发动作的幅度 E_s（差动）：由 ② 呼吸幅度给，比任何回应都小 */
export const spontE = (c: BuildCtx): number => {
  const e = (V2.spontE0 + V2.spontE1 * clamp((c.breathAmp - 0.2) / 0.7, 0, 1)) * c.vigor;
  return c.persona === 'D' ? Math.min(e, V2.spontDMax) : e;
};

/** 自发动作：小、慢、只在自己身边、不朝任何人（限速 spont） */
export function buildSpont(c: BuildCtx, kind: SpontKind, around?: number): Phase[] {
  return govern(unhook(spontPhases(c, kind, around), c.cur, c.rest), c, 'spont');
}

function spontPhases(c: BuildCtx, kind: SpontKind, around?: number): Phase[] {
  const poseOfD = flat;
  const k = c.k;
  const E = spontE(c);
  const rD = dOf(c.rest);
  const base = c.rest.dir;
  switch (kind) {
    case 'curl': {
      // 自己卷一下：几乎沿径向（只偏 0–0.3 rad），停、展开——和「扫」分得开；迎着手时围着手的方向
      const off = 0.3 * c.rnd() * (c.rnd() < 0.5 ? 1 : -1);
      const dir = around !== undefined ? around + 0.4 * (c.rnd() * 2 - 1) : base + off;
      return [
        ph('coil', 1.2 / k, 'mj', poseOfD(rD + E, wrapPi(dir)), { feel: { pose: 'free' } }),
        ph('hold', 0.6 / k, 'hold', 'hold', { osc: { amp: 0.04, hz: 0.3, decay: 0 } }),
        ph('uncoil', 1.5 / k, 'mj', 'rest'),
      ];
    }
    case 'sway': {
      // 环顾：抬一点，弯曲不变、弯向慢慢扫过去（A 1.0 rad · C、D 0.7 · B 0.5）——最慢的臂动作
      const w = (c.persona === 'A' ? 1.0 : c.persona === 'B' ? 0.5 : 0.7) * (c.rnd() < 0.5 ? 1 : -1);
      const D = rD + 0.4 * E;
      return [
        ph('set', 0.8 / k, 'mj', poseOfD(D, wrapPi(base - w / 2))),
        ph('pan', 3.2 / k, 'mj', poseOfD(D, wrapPi(base + w / 2))),
        ph('settle', 1.0 / k, 'mj', 'rest'),
      ];
    }
    case 'search': {
      // 抓空之后：一边比一边宽地来回探，每到一头停一下（跟在抓空后面，是自发里唯一大一点的）
      const D = Math.max(rD + E, 0.16) * c.vigor;
      const legs = [-40, 55, -70];
      const out: Phase[] = [];
      legs.forEach((d, i) => {
        out.push(ph(`cast${i + 1}`, (1.2 + 0.4 * i) / k, 'mj', poseOfD(D, d * DEG), { breath: { rate: 1, period: 0.85 }, feel: { pose: 'free', antennate: 0.15 }, voice: i === 0 ? 'query' : undefined }));
        out.push(ph(`probe${i + 1}`, 0.5, 'hold', 'hold', { osc: { amp: 0.06, hz: 0.5, decay: 0 } }));
      });
      out.push(ph('return', 1.5 / k, 'mj', 'rest'));
      return out;
    }
    default: // 触须抖：臂不动（照常跟着静息走）
      return [ph('flick', 1.5 / k, 'lin', 'rest', { feel: { pose: 'free', antennate: 0.3 } })];
  }
}

// ------------------------------------------------------------------ 看见手

export type NoticeMode = 'toward' | 'away' | 'look';

/** 看见手那一下（v2）：迎 = 先往回收一点再伸过去；躲 = 往背着手的腱轴一缩；看别处 = 瞥一眼。都限速，追不上惊跳 */
export function buildNotice(c: BuildCtx, mode: NoticeMode, aimDir: number, aimBend: number, awayDir: number): Phase[] {
  return govern(unhook(noticePhases(c, mode, aimDir, aimBend, awayDir), c.cur, c.rest), c, mode === 'away' ? 'urgent' : 'deliberate');
}

function noticePhases(c: BuildCtx, mode: NoticeMode, aimDir: number, aimBend: number, awayDir: number): Phase[] {
  const k = c.k;
  if (mode === 'toward') {
    return [
      ph('antic', 0.2 / k, 'mj', anticPose(c.cur, { bend: (Math.min(1, aimBend) * 0.5 + 0.15) * c.vigor, dir: aimDir, deep: 0 }, 0.04), { path: 'line' }),
      ph('reach', 0.9 / k, 'mj', { bend: (Math.min(1, aimBend) * 0.5 + 0.15) * c.vigor, dir: aimDir, deep: 0 }, { breath: { rate: 1, amp: 1.15 }, voice: 'query', feel: { pose: 'point', side: 0 } }),
      ph('handoff', 0.8 / k, 'mj', 'rest'),
    ];
  }
  if (mode === 'away') {
    return [
      ph('flinch', 0.3, 'mj', poseOfD(0.22 * c.vigor, nearestAxisDir(awayDir)), { path: 'line', breath: { rate: 1, push: 0.08 }, voice: 'mute', feel: { pose: 'tuck' } }),
      ph('hold', 0.4, 'hold', 'hold', { voice: 'mute', breath: { rate: 1, push: 0.08 } }),
      ph('handoff', 1.0 / k, 'mj', 'rest'),
    ];
  }
  return [
    ph('glance', 0.5 / k, 'mj', poseOfD(0.1 * c.vigor + dOf(c.rest) * 0.5, aimDir), { feel: { pose: 'point', side: 0, antennate: 0.1 } }),
    ph('hold', 0.3, 'hold', 'hold'),
    ph('back', 0.8 / k, 'mj', 'rest'),
  ];
}

// ------------------------------------------------------------------ 收场

/** 收场：死亡开始时还在做的动作不演完，平平地落回静息（限速 spont，0.6–1.2 s），所有提示交还给死亡的脚本 */
export function buildSettle(c: BuildCtx): Phase[] {
  const p = govern(unhook([ph('settle', 0.6, 'mj', 'rest')], c.cur, c.rest), c, 'spont', { unhook: 'recover' });
  const last = p[p.length - 1];
  last.dur = clamp(last.dur, 0.6, 1.2);
  return p;
}
