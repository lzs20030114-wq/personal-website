/**
 * 迎手链的程序表（动作词汇 v2，2026-10-08 第八批研究原型；轮回机器_触手与转向研究.md §9，定义待作者拍板）。
 *
 * 用户问「除了惊跳，是不是还应该有顺应着人、往人手的方向凑、甚至缠绕的机制」。这条链把看见手以后的事
 * 重做成一串**节拍各不相同、每拍等臂真的停稳才进下一拍**的段落：眼（触须）先到 → 臂一跳一停地陪着 →
 * 手停下才凑过去 → 在手前停半拍（全链唯一「张开着」的全静）→ 活力型先蹲一下再扑、其余精确地伸过去轻轻
 * 落下 → 碰到即定住感觉 → 贴上、每口呼气收紧一级 → 握着时随呼吸一紧一松地哼 → 手被抽走按人格扑过去或放手
 * → 扑空在丢手的地方找。不朝人的那一路（沉静型的 80%）是侧身警戒 + 偷看。
 *
 * 只管「一拍长什么样」：引擎（engine.ts 的迎手链）决定在什么时刻做哪一拍、带什么读数与人格参数，这里按表
 * 解算成分段程序（programs.ts 执行）。表在一拍开始时一次解算成数，手挪了就重建下一拍（不做活目标）——
 * 固件照表执行仍然成立。
 *
 * 四条臂的物理守则（研究笔记 §9.2，数字取自 Lab 1-3 求解器）：
 *   1. 快 = 大：0.5 s 以内的指令，梢端峰速 ≈ 1000 mm/s × 差动行程。扑的总行程（蹲 + 扑）封顶 0.22，是最浅
 *      惊跳 0.45 的一半——「一击追不上惊跳」是结构保证，不靠调时长。
 *   2. 臂会自己晃（周期 ≈ 1.42 s、阻尼比 ≈ 0.15）：每一步要么按档慢走、要么不短于一个周期；只有扑是快的一步。
 *   3. 形状由手定：目标一律写成「手那一点上的毫米」，用接触灵敏度 G(r, D) 换成差动（gainAt）。
 *   4. 重音按看得见的时刻：触须与呼吸可以先于臂；扑的重音挂在碰到那一刻。
 *
 * 人格表 12 个数一个不改，读法均为推断（研究笔记 §9.5）。方向约定同引擎：弯向 0 = 臂梢朝上，左为正。
 */
import type { PersonaKey } from './persona';
import { type Cues, type FeelerPose, type Phase, type Pose, lerpPoseLine } from './programs';
import { type BuildCtx, D_DEEP_SPAN, D_SPAN, PEAK, type Tier, V2, anticPose, dOf, govern, pathLen, ph, poseOfD, tierSpeed, unhook } from './vocab2';

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;
const wrapPi = (a: number): number => a - TAU * Math.floor((a + Math.PI) / TAU);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const lerpAngle = (a: number, b: number, u: number): number => wrapPi(a + wrapPi(b - a) * u);

/** 手感常量（均待作者拍板；出处见研究笔记 §9.8） */
export const HC = {
  /** 臂长（mm，与 engine HAND.armL / 台架 ARM_GEOM.length 同值） */
  armL: 357.5,
  /**
   * 离轴的差动上限（迎手链比回应多用到 0.48：超过 0.34 的部分走执行层的深缠行程）。执行层 dMax 0.5 在验过的范围内，
   * 实测失稳在两腱之间 0.55；带摆动的段基姿态要让出摆幅，摆到波峰也 ≤ 0.48
   */
  flatMax: 0.48,
  /** 深卷（只在腱轴 0 上、门全部满足时）的差动上限：主腱约 0.9，不到惊跳的 0.717 那么满 */
  deepMax: 0.62,
  /** 接触灵敏度 G(r, D) = k·clamp(r/L, 0.25, 1)^e·(1 − drop·min(D, 0.5))（mm / 差动） */
  gainK: 480,
  gainExp: 1.6,
  gainDrop: 0.75,
  /** 看见 → 第一跳：take = 0.1 + 0.1τ；第一跳只伸到「刚好碰到」的 0.55（先转方向、后伸长） */
  take0: 0.1,
  take1: 0.1,
  firstHop: 0.55,
  /** 跳：一步至少 0.7 s、停 clamp(0.5 + 0.4τ, 0.7, 1.6)（一跳一停的周期 ≥ 1.4 s，不超过臂的 0.7 Hz 通带） */
  shiftMin: 0.7,
  dwell0: 0.5,
  dwell1: 0.4,
  dwellMin: 0.7,
  dwellMax: 1.6,
  /** 跟的停距（mm）：碰到半径 + 20 + 0.6 s × 手速，封顶 130——跟的时候不蹭到手 */
  standGap: 20,
  standLag: 0.6,
  standCap: 130,
  /** 跳的门：目标误差（差动）超过 eps 才跳；超过 jump（手猛挪）不等停稳就从此刻重跳 */
  eps: { A: 0.03, B: 0.06, C: 0.03, D: 0.03 } as Record<PersonaKey, number>,
  epsTau: 0.015,
  epsMax: 0.08,
  jump: 0.12,
  /** 活力型冲在手前面：按读数速度往前看 0.4 s（封顶 0.05）；沉静型每跳只走 65% */
  leadT: 0.4,
  leadMax: 0.05,
  bStep: 0.65,
  /** 手停稳多久才凑过去：clamp(0.15 + 0.5τ, 0.25, 1.5) */
  still0: 0.15,
  still1: 0.5,
  stillMin: 0.25,
  stillMax: 1.5,
  /** 停半拍距离 H = 碰到半径 + 12 + 8·min(τ, 2)（mm）；下限 clamp(0.2 + 0.2τ, 0.25, 0.7)，最多等 1.5 s */
  hover0: 12,
  hover1: 8,
  hoverMin0: 0.2,
  hoverMin1: 0.2,
  hoverMinLo: 0.25,
  hoverMinHi: 0.7,
  hoverMax: 1.5,
  /** 沉静型：先到碰到圈外 16 mm，退到 64 mm，再回到停半拍位 */
  bEdge: 16,
  bRetreat: 64,
  /** 蹲：clamp(0.14 − 剩余行程, 0.04, 0.08)·花样；停稳 ≥ 0.18 s（≤ 0.5）；扑落在手上 +4 mm；精确伸 / 慢碰落 +2 mm */
  cockBase: 0.14,
  cockMin: 0.04,
  cockMax: 0.08,
  cockedMin: 0.18,
  cockedMax: 0.5,
  strikeMax: 0.22,
  pounceLand: 4,
  reachLand: 2,
  /** 不稳定型 ⑤ 抽到负：停在碰到圈外 40 mm、愣住、退到 110 mm 外 */
  balkNear: 40,
  balkFar: 110,
  /** 够得着：aimBend ≤ 1.41 且离基座 ≤ 0.98 臂长 */
  reachBend: 1.41,
  reachFar: 0.98,
  /** 推两下（每下 0.03）还没碰到 = 一次够不着 */
  nudge: 0.03,
  nudges: 2,
  /** 缠：定住感觉 clamp(0.12 + 0.2τ, 0.15, 0.6)（手伸过来 ×1.5，追里 0.1）；贴上 ≥ max(0.7, 0.6/k)；每级 +5 mm；窗口 −12…+24 mm */
  feel0: 0.12,
  feel1: 0.2,
  feelMin: 0.15,
  feelMax: 0.6,
  feelByHand: 1.5,
  feelChase: 0.1,
  seatMin: 0.7,
  seatK: 0.6,
  cinchStep: 5,
  winLo: -12,
  winHi: 24,
  /** 握：压过手 8 mm、挤压峰峰 6 + 10·②、指令提前 0.45 s、满足 fade = 0.55 + 0.45·e^(−n/3) */
  holdCenter: 8,
  holdAmp0: 6,
  holdAmp1: 10,
  holdLead: 0.45,
  fade0: 0.55,
  fade1: 0.45,
  fadeN: 3,
  /** 握着跟手：差动按 τ 0.6 s 追、弯向 ≤ 0.3 rad/s；读数一步跳过 0.06 / 20° 视为被抽走、不跟 */
  followTau: 0.6,
  followRate: 0.3,
  jumpD: 0.06,
  jumpDir: 20 * DEG,
  /** 缠的程序走完交给握持控制器时的混合时长（s） */
  holdBlend: 1,
  /** 手怎么动（mm/s）：静 < 15 · 微动 15–60 · 牵引 < 60 且持续 0.5 s · 往外拉 ≥ 60；攥 +3 / 让 −3 mm */
  vStill: 15,
  vMicro: 60,
  tractionT: 0.5,
  squeeze: 3,
  give: 3,
  /** 追：抽手快（≥ 150 mm/s）= 扑过去；慢 = 伸过去送一下；let 0.15 s（慢的 0.3）；身体晚 0.3 s 跟 */
  chaseFast: 150,
  chaseLet: 0.15,
  chaseLetSlow: 0.3,
  chaseNear: 14,
  chaseExtend: 0.8,
  yawLag: 0.3,
  /** 追的缠到限位的兜底（s）：拍走完时引擎会缩到 +0.5 s，这里只防拍序意外卡住（四拍最慢的 creep 档也远在其下） */
  chaseCap: 20,
  /** 躲：手留在身侧 ±105°；收的时候身体晚 0.4 s；手挪得 close 变 0.15 或方向变 20° 再收一次 */
  avoidSide: 105 * DEG,
  avoidLag: 0.4,
  reshrinkClose: 0.15,
  reshrinkDir: 20 * DEG,
  /** 逼近（> 250 mm/s、距离在减小、< 0.6 m）= 一缩；手走了（> 1.2 m 持续 1 s 或离开画布）= 松一口气 */
  cringeV: 250,
  cringeR: 600,
  reliefR: 1200,
  reliefT: 1,
  /** 放开后手不动：3 s 后再来一次（抓空后每 ⑨ 至多一次） */
  rearm: 3,
  /** 臂先身后：要转身时偏航目标晚 0.25/k s 才写 */
  armLead: 0.25,
  /** 够不着时：手挪 60 mm 才重新武装 */
  strainRearm: 60,
  /** 偷看时手动了（> 30 mm/s）就缩回；凑的途中手动了（> 30 mm/s）回到陪着 */
  vMove: 30,
} as const;

// ------------------------------------------------------------------ 几何

/** 接触灵敏度：臂在手那一点上每多一个差动走多少 mm（方案 3 标定，handReading 公式在这些点上误差 ≤ 0.025 差动） */
export function gainAt(r: number, D: number): number {
  return HC.gainK * clamp(r / HC.armL, 0.25, 1) ** HC.gainExp * (1 - HC.gainDrop * Math.min(Math.max(D, 0), 0.5));
}

/** 离轴姿态：只用弯曲（超过 1 的部分由执行层的深缠行程给），封顶 0.48，不带深卷 */
export function flatH(D: number, dir: number): Pose {
  return { bend: clamp(D, 0, HC.flatMax) / D_SPAN, dir: wrapPi(dir), deep: 0 };
}

/** 腱轴 0（臂梢朝上）上的深卷姿态（深卷门开着时用；差动封顶 0.62） */
export function axisPose(D: number): Pose {
  return poseOfD(clamp(D, 0, HC.deepMax), 0);
}

/** 迎手链看到的手：读数在建表那一刻的快照 */
export interface HandGeom {
  /** 刚好穿过手的差动 = min(0.5, 0.34·aimBend) */
  Dh: number;
  /** 弯向（aimDir） */
  dir: number;
  /** 手离臂基座 mm（aimDist） */
  r: number;
  /** 此刻的有效碰到半径 mm（台架给；缺省 32） */
  touch: number;
  /** 指针速度 mm/s */
  v: number;
}

/** 手那一点上的毫米 → 姿态：负 = 停在手前这么多、正 = 压过手这么多 */
export function atMm(g: HandGeom, mm: number, Dref = g.Dh): Pose {
  return flatH(Dref + mm / gainAt(g.r, Dref), g.dir);
}

/** 同上，深卷门开着时走腱轴 0 */
export function atMmDeep(g: HandGeom, mm: number, Dref: number): Pose {
  return axisPose(Dref + mm / gainAt(g.r, Dref));
}

/** 两个姿态在差动平面上的距离 */
export function poseDist(a: Pose, b: Pose): number {
  const [ax, ay] = [dOf(a) * Math.cos(a.dir), dOf(a) * Math.sin(a.dir)];
  const [bx, by] = [dOf(b) * Math.cos(b.dir), dOf(b) * Math.sin(b.dir)];
  return Math.hypot(ax - bx, ay - by);
}

/** 差动平面上 a + u·(b − a) */
function lerpPlane(a: Pose, b: Pose, u: number): Pose {
  const [ax, ay] = [dOf(a) * Math.cos(a.dir), dOf(a) * Math.sin(a.dir)];
  const [bx, by] = [dOf(b) * Math.cos(b.dir), dOf(b) * Math.sin(b.dir)];
  const x = ax + (bx - ax) * u;
  const y = ay + (by - ay) * u;
  const D = Math.hypot(x, y);
  return flatH(D, D > 1e-9 ? Math.atan2(y, x) : a.dir);
}

/** 姿态 + 差动增量（沿此刻的弯向） */
function addD(p: Pose, dD: number): Pose {
  return flatH(dOf(p) + dD, p.dir);
}

/** 够得着（v2 判据，比现行的 1.3 L 严：稍超出臂长的手不再「永远差一点」） */
export function reachable(aimBend: number, aimDist: number): boolean {
  return aimBend <= HC.reachBend && aimDist <= HC.reachFar * HC.armL;
}

// ------------------------------------------------------------------ 人格读法（均为推断）

const take = (c: BuildCtx): number => HC.take0 + HC.take1 * c.tau;
export const dwellOf = (c: BuildCtx): number => clamp(HC.dwell0 + HC.dwell1 * c.tau, HC.dwellMin, HC.dwellMax);
export const stillOf = (tau: number): number => clamp(HC.still0 + HC.still1 * tau, HC.stillMin, HC.stillMax);
export const hoverGap = (g: HandGeom, tau: number): number => g.touch + HC.hover0 + HC.hover1 * Math.min(tau, 2);
export const hoverMinOf = (tau: number): number => clamp(HC.hoverMin0 + HC.hoverMin1 * tau, HC.hoverMinLo, HC.hoverMinHi);
export const standOf = (g: HandGeom): number => Math.min(HC.standCap, g.touch + HC.standGap + HC.standLag * g.v);
export const epsOf = (P: PersonaKey, tau: number): number => Math.min(HC.epsMax, HC.eps[P] + (P === 'D' ? HC.epsTau * tau : 0));
/** 扑（玩扑）只给快的人格（√k_v ≥ 1.2：活力型、快的不稳定型），而且衰老过半就不扑了 */
export const pounces = (c: BuildCtx): boolean => c.k >= V2.springK && c.ageU < 0.5;
/** 够不着时再撑几次：floor(2.5·⑩)——越想要越会再撑（A 1 · B 0 · C 2 · D 1） */
export const strainTries = (toward: number): number => Math.floor(2.5 * toward);
/** 握着的挤压峰峰（mm）：6 + 10·②（A 14 · C 11 · B 9 · D 8–15） */
export const squeezeAmp = (breathAmp: number): number => HC.holdAmp0 + HC.holdAmp1 * breathAmp;
/** 收紧几级：1 + [|g|/0.5 ≥ 0.4]（A 2 · C 2 · B 1 · D 1–2） */
export const cinchCount = (gN: number): number => 1 + (gN >= 0.4 ? 1 : 0);

/** 跳与凑时触须的「交替探」幅度（rad）：A 0.10 · C 0.15 · B 0 · D 0.06（另加颤 0.03） */
const antOf = (P: PersonaKey): number => (P === 'A' ? 0.1 : P === 'C' ? 0.15 : P === 'D' ? 0.06 : 0);
/** 指向手的触须提示：不写 side = 引擎按手的相对方位连续指（眼一直跟、臂一跳一停） */
const pointAt = (P: PersonaKey, extra: { antennate?: number; quiver?: number } = {}): Cues['feel'] => ({
  pose: 'point',
  antennate: extra.antennate ?? antOf(P),
  quiver: extra.quiver ?? (P === 'D' ? 0.03 : undefined),
});
const feel = (pose: FeelerPose, extra: { antennate?: number; quiver?: number } = {}): Cues['feel'] => ({ pose, ...extra });

/** 按档把段拉长，再按段名改档；返回的段已就地改好 */
function gov(phases: Phase[], c: BuildCtx, tier: Tier, tiers?: Partial<Record<string, Tier>>): Phase[] {
  return govern(unhook(phases, c.cur, c.rest), c, tier, tiers);
}

// ------------------------------------------------------------------ 看见

/** 跳的一步：shift（≥ 0.7 s，按档）+ fixate（停：dwell 起，最多再等 1 s 让臂停稳） */
function hopPhases(c: BuildCtx, to: Pose, first = false): Phase[] {
  const P = c.persona;
  const breath: Cues['breath'] = { rate: 1, period: P === 'A' ? 0.75 : 0.85, amp: 1.1 };
  const dw = dwellOf(c);
  const osc = dOf(to) <= 0.27 ? { amp: 0.015 / D_SPAN, hz: 0.35, decay: 0 } : undefined;
  const out: Phase[] = [];
  if (first) {
    // take：先「看」——吸一口、放慢、触须先指过去、一声上扬；臂还不动（0.1 + 0.1τ）
    out.push(ph('take', take(c), 'hold', 'hold', { breath: { rate: 0.4, amp: 1.15 }, feel: pointAt(P), voice: 'query', light: 1.15 }));
  }
  out.push(
    ph(first ? 'firstHop' : 'shift', HC.shiftMin, P === 'D' ? 'lin' : 'mj', to, { breath, feel: pointAt(P), light: 1.1 }),
    ph('fixate', dw + 1, 'hold', 'hold', { breath, feel: pointAt(P), light: 1.1, osc }),
  );
  return gov(out, c, P === 'B' ? 'deliberate' : 'pursue', { take: 'reflex', fixate: 'reflex' });
}

/** 跟的站位：停在离手「碰到半径 + 20 + 0.6 s × 手速」mm 处 */
export function standPose(g: HandGeom): Pose {
  return atMm(g, -standOf(g));
}

/**
 * 这一跳的目标（结构按人格，不只是快慢）：活力 = 往前看 0.4 s，冲在手前面；好奇 = 到位；沉静 = 每次只走 65%，
 * 手停了再补；不稳定 = 到位、匀速（生硬）。lead = 读数速度 × 0.4 s（差动平面，引擎给，已封顶 0.05）
 */
export function hopTarget(c: BuildCtx, g: HandGeom, lead: { x: number; y: number }): Pose {
  const st = standPose(g);
  if (c.persona === 'A') {
    const x = dOf(st) * Math.cos(st.dir) + lead.x;
    const y = dOf(st) * Math.sin(st.dir) + lead.y;
    const D = Math.hypot(x, y);
    return flatH(D, D > 1e-9 ? Math.atan2(y, x) : st.dir);
  }
  if (c.persona === 'B') return lerpPlane(c.cur, st, HC.bStep);
  return st;
}

/** 看见手、决定迎：take → 第一跳（先转方向：只伸到刚好碰到的 0.55）→ 停 */
export function buildTake(c: BuildCtx, g: HandGeom): Phase[] {
  const st = standPose(g);
  return hopPhases(c, flatH(Math.min(dOf(st), HC.firstHop * g.Dh), g.dir), true);
}

/** 陪着手的一跳 */
export function buildHop(c: BuildCtx, g: HandGeom, lead: { x: number; y: number }): Phase[] {
  return hopPhases(c, hopTarget(c, g, lead));
}

// ------------------------------------------------------------------ 凑

export type ApproachBeat =
  | 'transport'
  | 'edge'
  | 'wait'
  | 'retreat'
  | 'wait2'
  | 'edge2'
  | 'hover'
  | 'crouch'
  | 'cocked'
  | 'pounce'
  | 'sight'
  | 'reach'
  | 'touch'
  | 'curl'
  | 'nudge'
  | 'balk'
  | 'stall'
  | 'drop';

/**
 * 凑的拍序（引擎照这个顺序一拍一拍起；每拍之间有门）：
 *   活力 / 快的不稳定（扑得下）：transport → crouch → cocked → pounce
 *   好奇（以及扑不下的活力）：transport → hover → sight → reach
 *   沉静：edge → wait → retreat → wait2 → edge2 → hover → touch
 *   慢的不稳定：transport → hover → touch
 *   不稳定型 ⑤ 抽到负：balk → stall → drop（撤掉）
 * 深卷门开着时最后一拍（reach / touch）换成 curl。走完没碰到：nudge × 2。
 */
export function approachPlan(c: BuildCtx, g: HandGeom, opts: { negative: boolean; deep: boolean }): ApproachBeat[] {
  if (opts.negative) return ['balk', 'stall', 'drop'];
  const P = c.persona;
  const last: ApproachBeat = opts.deep ? 'curl' : P === 'C' || (P === 'A' && !pounceFits(c, g)) ? 'reach' : 'touch';
  if (P === 'B') return ['edge', 'wait', 'retreat', 'wait2', 'edge2', 'hover', last];
  if ((P === 'A' || P === 'D') && pounces(c) && pounceFits(c, g) && !opts.deep) return ['transport', 'crouch', 'cocked', 'pounce'];
  if (P === 'C' || P === 'A') return ['transport', 'hover', 'sight', last];
  return ['transport', 'hover', last];
}

/** 剩余行程（停半拍位到手）与蹲的大小；扑的总行程 = 两者之和，> 0.22 就不扑（臂根附近的手行程装不下） */
export function pounceGeom(c: BuildCtx, g: HandGeom): { gap: number; cock: number; S: number } {
  const gap = hoverGap(g, c.tau) / gainAt(g.r, g.Dh);
  const cock = clamp(HC.cockBase - gap, HC.cockMin, HC.cockMax) * (1 - c.ageU);
  return { gap, cock, S: gap + cock };
}
export const pounceFits = (c: BuildCtx, g: HandGeom): boolean => pounceGeom(c, g).S <= HC.strikeMax;

/** 凑里的一拍。返回的段已按档定时长；hover / cocked 的段长是「最多等多久」，引擎在门过了就提前进下一拍 */
export function buildApproachBeat(c: BuildCtx, g: HandGeom, beat: ApproachBeat, deepRef = 0): Phase[] {
  const P = c.persona;
  const k = c.k;
  const H = hoverGap(g, c.tau);
  const transportCue: Partial<Phase> = { breath: { rate: 1, period: 0.85, amp: 1.1 }, feel: pointAt(P), light: 1.1 };
  const shyCue: Partial<Phase> = { breath: { rate: 1, amp: 0.6 }, feel: pointAt(P, { quiver: 0.05 }), voice: 'mute' };
  const lin = P === 'D' ? 'lin' : 'mj';
  switch (beat) {
    case 'transport':
      return gov([ph('transport', 0.6 / k, lin, atMm(g, -H), { ...transportCue, voice: P === 'A' || P === 'C' ? 'query' : undefined })], c, 'pursue');
    case 'edge':
      return gov([ph('edge', 0.6 / k, 'mj', atMm(g, -(g.touch + HC.bEdge)), shyCue)], c, 'pursue');
    case 'wait':
      return [ph('wait', 0.6, 'hold', 'hold', { breath: { rate: 0.3, amp: 0.6 }, feel: pointAt(P, { quiver: 0.05 }), voice: 'mute' })];
    case 'retreat':
      return gov([ph('retreat', 0.6 / k, 'mj', atMm(g, -(g.touch + HC.bRetreat)), { feel: feel('tuck'), voice: 'mute' })], c, 'deliberate');
    case 'wait2':
      return [ph('wait2', 0.4 + 0.2 * c.tau, 'hold', 'hold', { breath: { rate: 0.3 }, voice: 'mute' })];
    case 'edge2':
      return gov([ph('edge2', 0.6 / k, 'mj', atMm(g, -H), shyCue)], c, 'deliberate');
    case 'hover':
      // 停半拍：屏气、触须定住指着手、不出声、灯亮、环身张开——惊跳的凝住是收紧 + 灯暗 + 触须收，两者相反
      return [ph('hover', HC.hoverMax, 'hold', 'hold', { breath: { rate: 0 }, feel: feel('still'), voice: 'mute', light: 1.15 })];
    case 'crouch': {
      // 蹲：往回收一点（看得见的预备 0.04–0.08），吸一口、张开，一声上扬——「玩扑」的信号，不读作捕猎
      const { cock } = pounceGeom(c, g);
      const to = anticPose(c.cur, atMm(g, HC.pounceLand), cock);
      return gov([ph('crouch', 0.35 / k, 'mj', to, { path: 'line', breath: { rate: 1, amp: 1.2, push: -0.03 }, feel: pointAt(P), voice: 'query' })], c, 'deliberate');
    }
    case 'cocked':
      return [ph('cocked', HC.cockedMax, 'hold', 'hold', { breath: { rate: 0 }, feel: feel('still'), voice: 'mute', light: 1.15 })];
    case 'pounce': {
      // 扑：直线落在手上 +4 mm，屏住、不出声（重音在碰到那一刻）。总行程 ≤ 0.22：梢端 ≤ ~230 mm/s，到不了惊跳。
      // 落点按剩余余量收（pounceFits 的 S 没算落点那 4 mm；余量不够时少落一点，再不够就沿直线截在 0.22）
      let to = atMm(g, HC.pounceLand);
      if (pathLen(c.cur, to, 'line') > HC.strikeMax) {
        let lo = 0;
        let hi: number = HC.pounceLand;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          if (pathLen(c.cur, atMm(g, mid), 'line') > HC.strikeMax) hi = mid;
          else lo = mid;
        }
        to = atMm(g, lo);
        const S0 = pathLen(c.cur, to, 'line');
        if (S0 > HC.strikeMax) to = lerpPoseLine(c.cur, to, HC.strikeMax / S0);
      }
      const S = pathLen(c.cur, to, 'line');
      const dur = Math.max(0.2, (PEAK.out * S) / tierSpeed('strike', k, c.vigor));
      return [ph('pounce', dur, P === 'D' ? 'lin' : 'out', to, { path: 'line', breath: { rate: 0 }, feel: pointAt(P, { antennate: 0 }), voice: 'mute', light: 1.15 })];
    }
    case 'sight':
      return [ph('sight', 0.25, 'hold', 'hold', { breath: { rate: 0.2 }, feel: feel('still'), voice: 'mute', light: 1.1 })];
    case 'reach':
      // 好奇型：瞄准以后精确直伸、轻轻落下（亲和接触的末段是减速轻落）
      return gov([ph('reach', 0.8 / k, 'mj', atMm(g, HC.reachLand), { breath: { rate: 0.5 }, feel: pointAt(P, { antennate: 0.08 }), voice: 'mute' })], c, 'deliberate');
    case 'touch':
      // 沉静型（creep）/ 慢的不稳定型（生硬）慢慢碰
      return gov(
        [ph('touch', 0.8 / k, lin, atMm(g, HC.reachLand), { breath: { rate: 1, amp: 0.7 }, feel: pointAt(P, { antennate: 0, quiver: 0.04 }), voice: 'mute' })],
        c,
        P === 'B' ? 'creep' : 'deliberate',
      );
    case 'curl':
      // 深卷门开着（手在臂中段正上方、平卷够不着）：读数已经饱和（看不出还差多少），沿腱轴 0 慢慢往 0.62 卷，碰到即停
      void deepRef;
      return gov([ph('curl', 1.2 / k, 'mj', axisPose(HC.deepMax), { breath: { rate: 0.5 }, feel: pointAt(P, { antennate: 0.06 }), voice: 'mute' })], c, 'creep');
    case 'nudge':
      return gov([ph('nudge', 0.5 / k, 'mj', addD(c.cur, HC.nudge), { feel: pointAt(P), voice: 'mute' })], c, 'creep');
    case 'balk':
      return gov([ph('balk', 0.6 / k, 'lin', atMm(g, -(g.touch + HC.balkNear)), { ...transportCue, voice: 'mute' })], c, 'pursue');
    case 'stall':
      return [ph('stall', 0.5 + 0.3 * c.tau, 'hold', 'hold', { breath: { rate: 0 }, feel: pointAt(P, { quiver: 0.08 }), voice: 'mute' })];
    case 'drop':
      return gov([ph('drop', 0.5, 'lin', atMm(g, -(g.touch + HC.balkFar)), { path: 'line', breath: { rate: 1, sigh: true }, voice: 'fall', feel: feel('tuck') })], c, 'urgent');
  }
}

// ------------------------------------------------------------------ 够不着

/**
 * 够不着（先转身对准，仍够不着才做）：gather → stretch（伸长身子：环身张开）→ strain → pump × r → deflate（泄气、叹气）。
 * 之后引擎进「看着」：臂停在泄气后的姿态指着手。沉静型不探身（r = 0 且不做这一串，只看着）
 */
export function buildStrain(c: BuildCtx, g: HandGeom, tries: number): Phase[] {
  const k = c.k;
  const P = c.persona;
  // 摆动（撑 ±0.035、再撑 ±0.05）叠在伸长的姿态上：基姿态留出最大摆幅，波峰正好碰到 0.48、不被削顶
  const stretch = flatH(Math.min(HC.flatMax - 0.05, g.Dh), g.dir);
  const down = wrapPi(g.dir + 0.5 * (Math.sign(wrapPi(Math.PI - g.dir)) || 1));
  const out: Phase[] = [
    ph('gather', 0.3 / k, 'mj', addD(c.cur, -0.04), { breath: { rate: 1, amp: 1.2 }, feel: feel('raise') }),
    ph('stretch', 0.6 / k, 'mj', stretch, { breath: { rate: 1, push: -0.1, period: 0.8 }, voice: 'query', feel: pointAt(P, { antennate: 0.2 }), light: 1.2 }),
    ph('strain', 0.9 / k, 'hold', 'hold', { osc: { amp: 0.035 / D_SPAN, hz: 0.45, decay: 0.4 }, breath: { rate: 1, push: -0.1, period: 0.75 }, feel: pointAt(P, { antennate: 0.2 }) }),
  ];
  for (let i = 0; i < tries; i++) {
    out.push(ph(`pump${i + 1}`, 1.3, 'hold', 'hold', { osc: { amp: 0.05 / D_SPAN, hz: 0.5, decay: 0 }, breath: { rate: 1, push: -0.14 }, voice: 'query', feel: pointAt(P, { antennate: 0.2 }) }));
  }
  out.push(
    ph('deflate', 1.6 / k, 'out', flatH(0.6 * dOf(stretch), down), {
      path: 'line',
      breath: { rate: 1, push: 0.05, sigh: true },
      voice: 'fall',
      feel: feel('tuck'),
      light: 0.75,
    }),
  );
  return gov(out, c, 'pursue', { strain: 'reflex', deflate: 'deliberate' });
}

/** 沉静型够不着：不探身，每 ⑥ 前倾一点（0.03） */
export function buildLeanIn(c: BuildCtx, g: HandGeom): Phase[] {
  return gov(
    [
      ph('leanIn', 1.2 / c.k, 'mj', addD(c.cur, HC.nudge), { feel: pointAt(c.persona), voice: 'mute', breath: { rate: 0.5 } }),
      ph('leanHold', 0.8, 'hold', 'hold', { feel: pointAt(c.persona), voice: 'mute' }),
      ph('leanBack', 1.2 / c.k, 'mj', standPose(g), { feel: pointAt(c.persona) }),
    ],
    c,
    'spont',
  );
}

// ------------------------------------------------------------------ 碰到 → 缠

export interface WrapIn {
  /** 手伸过来碰的（接：定住 ×1.5、合拢）还是臂伸过去碰到的（抓：贴上） */
  byHand: boolean;
  /** 0.5·I/θ ≥ 0.65：先一缩再接（反射时钟） */
  wince: boolean;
  /** 追途中碰到（定住 0.1 s、不一缩、只 purr） */
  chase: boolean;
  /** 不是迎着时碰的、已经等过一个 ④ 的回应才缠：定住只 0.12 s */
  waited?: boolean;
  /** 扑来的：入口一声 huff + 灯 1.25（重音挂在碰到那一刻） */
  pounced: boolean;
  /** 收紧几级 */
  n: number;
  /** 此刻呼吸相位 φ 与周期（ready 等到下一口呼气开始） */
  phi: number;
  period: number;
  /** 观测器预测的余振剩余（s，≤ 0.8；定住感觉加上它，等臂停稳） */
  settle: number;
  /** 收紧的基准差动（读数饱和时取碰到那一刻的差动） */
  Dref: number;
  /** 深卷门开着：贴上与收紧走腱轴 0 */
  deep: boolean;
}

/**
 * 缠（抓握 WRAP）：[一缩] → 定住感觉 → 贴上 / 合拢 → 等呼气 → 收紧 × n（每口呼气 +5 mm）。返回各段与「贴上」那一段
 * 的下标——引擎在贴上做完且臂停稳的那一刻记 catchT（台架的张力开关此后才闭合 = 手指被卡住）
 */
export function buildWrap(c: BuildCtx, g: HandGeom, w: WrapIn): { phases: Phase[]; seat: number } {
  const P = c.persona;
  const k = c.k;
  const out: Phase[] = [];
  const at = (mm: number): Pose => {
    const m = clamp(mm, HC.winLo, HC.winHi);
    return w.deep ? atMmDeep(g, m, w.Dref) : atMm(g, m, w.Dref);
  };
  if (w.wince && !w.chase) {
    out.push(
      ph('latency', V2.startleLatency, 'hold', 'hold', { feel: feel('tuck') }),
      ph('wince', 0.25, 'mj', addD(c.cur, -0.02), { path: 'line', breath: { rate: 1, push: 0.04 }, voice: 'tsk', feel: feel('tuck') }),
    );
  }
  const feelT = w.chase ? HC.feelChase : w.waited ? HC.feel0 : clamp(HC.feel0 + HC.feel1 * c.tau, HC.feelMin, HC.feelMax) * (w.byHand ? HC.feelByHand : 1);
  const accent: Partial<Phase> = w.pounced ? { voice: 'huff', light: 1.25 } : w.chase ? { voice: 'purr', light: 1.15 } : { breath: { rate: 0 }, light: 1.2 };
  out.push(ph('feel', feelT + Math.min(0.8, Math.max(0, w.settle)), 'hold', 'hold', { feel: pointAt(P, { antennate: 0 }), ...accent }));
  const seatName = w.byHand ? 'close' : 'seat';
  out.push(ph(seatName, Math.max(HC.seatMin, HC.seatK / k), 'mj', at(HC.reachLand), { breath: { rate: 1, amp: 1.1 }, voice: 'purr', light: 1.15, feel: pointAt(P, { antennate: 0.06 }) }));
  const gv = gov(out, c, w.byHand ? 'deliberate' : 'creep', { latency: 'reflex', wince: 'urgent', feel: 'reflex' });
  const seat = gv.findIndex((p) => p.name === seatName);
  // 等到下一口呼气开始（φ = 0.5 起是呼气），收紧落在呼气上
  const T = Math.max(0.5, w.period);
  const before = gv.reduce((a, p) => a + p.dur, 0);
  const phiAt = (w.phi + before / T) % 1;
  const ready = (((0.5 - phiAt) % 1) + 1) % 1;
  const rest: Phase[] = [ph('ready', ready * T, 'hold', 'hold', { feel: pointAt(P, { antennate: 0.06 }) })];
  for (let i = 1; i <= w.n; i++) {
    rest.push(
      ph(`cinch${i}`, 0.4 * T, 'mj', at(HC.reachLand + HC.cinchStep * i), { breath: { rate: 1, amp: 1.1 }, voice: 'purr', light: 1.15 }),
      ph(`set${i}`, 0.6 * T, 'hold', 'hold', { feel: pointAt(P, { antennate: 0.06 }), voice: 'purr' }),
    );
  }
  // 起点 = 贴上的段末
  const cGov = { ...c, cur: endPose(gv, c) };
  return { phases: [...gv, ...govern(rest, cGov, 'creep', { ready: 'reflex' })], seat };
}

/** 一串段走完后的姿态（'rest' 按此刻的静息估） */
export function endPose(phases: readonly Phase[], c: BuildCtx): Pose {
  let at = c.cur;
  for (const p of phases) at = p.arm === 'hold' ? at : p.arm === 'rest' ? c.rest : p.arm;
  return at;
}

// ------------------------------------------------------------------ 握（控制器，不是表）

export interface HoldIn {
  persona: PersonaKey;
  g: HandGeom;
  /** 跟手的差动与弯向（引擎每步按读数更新） */
  Dref: number;
  dirRef: number;
  /** 呼吸相位 φ（0 = 环身最收拢 = 呼气末）与周期 */
  phi: number;
  period: number;
  /** ② 呼吸幅度、握住以来的呼吸数、握力（衰老 / 死亡） */
  breathAmp: number;
  breaths: number;
  grip: number;
  /** 事件叠加（mm，攥 + / 让 −；小动作）与深卷 */
  evMm: number;
  deep: boolean;
}

/** 此刻挤压相位 0–1（1 = 最紧；指令提前 0.45 s，看得见的最紧落在呼气末） */
export function squeezePhase(phi: number, period: number): number {
  return (1 + Math.cos(TAU * (phi + HC.holdLead / Math.max(0.5, period)))) / 2;
}

/** 握持控制器：随呼吸一紧一松（满足了幅度慢慢减小）、压过手 8 mm、跟着手走。纯函数 */
export function holdDrive(o: HoldIn): Pose {
  const A = squeezeAmp(o.breathAmp);
  const half = Math.min(A / 2, HC.holdCenter - HC.winLo, HC.winHi - HC.holdCenter);
  const fade = HC.fade0 + HC.fade1 * Math.exp(-o.breaths / HC.fadeN);
  const sq = squeezePhase(o.phi, o.period);
  const mm = clamp(HC.holdCenter + 2 * half * fade * (sq - 0.5) + o.evMm, HC.winLo, HC.winHi);
  const D = (o.Dref + mm / gainAt(o.g.r, o.Dref)) * o.grip;
  return o.deep ? axisPose(D) : flatH(D, o.dirRef);
}

/** 握着时的提示（呼吸放慢一点、加深一点，呼气时哼，灯稳亮；触须按人格） */
export function holdCue(P: PersonaKey): Cues {
  const f: Cues['feel'] =
    P === 'A' ? pointAt(P, { antennate: 0.06 }) : P === 'B' ? feel('still') : P === 'C' ? pointAt(P, { antennate: 0.12 }) : pointAt(P, { antennate: 0, quiver: 0.03 });
  return { breath: { rate: 1, period: 1.15, amp: 1.1 }, voice: 'hum', light: 1.1, feel: f };
}

/**
 * 握着时手的小动静与 ⑥ 小动作，返回叠在挤压上的毫米（τ = 事件开始以来的秒数；0 之外的时刻返回 0）：
 *   squeeze 攥一下 +3（0.25 s 起、0.8 s 回）· give 让 −3（随时可拔出）· tug 拽一下 +2（0.5 s）·
 *   loosen 松 −2（1 s）· palpate 摩挲 ±2 mm（一个呼吸周期 1.5 个波）
 */
export function holdEventMm(kind: string, tau: number, period: number): number {
  if (tau < 0) return 0;
  const bump = (up: number, down: number, mm: number): number => {
    if (tau < up) return mm * smoothstep(tau / up);
    if (tau < up + down) return mm * (1 - smoothstep((tau - up) / down));
    return 0;
  };
  switch (kind) {
    case 'squeeze':
      return bump(0.25, 0.8, HC.squeeze);
    case 'give':
      return bump(0.4, 1.2, -HC.give);
    case 'tug':
      return bump(0.25, 0.5, 2);
    case 'loosen':
      return bump(0.5, 1, -2);
    case 'palpate': {
      const T = Math.max(0.5, period);
      const dur = 1.5 * T;
      if (tau > dur) return 0;
      const win = Math.sin((Math.PI * tau) / dur);
      return 2 * win * Math.sin((TAU * tau) / T);
    }
    default:
      return 0;
  }
}
/** 小动作的时长（s）：过了就把事件清掉 */
export function holdEventDur(kind: string, period: number): number {
  switch (kind) {
    case 'squeeze':
      return 1.05;
    case 'give':
      return 1.6;
    case 'tug':
      return 0.75;
    case 'loosen':
      return 1.5;
    case 'palpate':
      return 1.5 * Math.max(0.5, period);
    case 'freeze':
      // 屏气定住（沉静型的抓握反射）：不动臂，呼吸停 0.5 s
      return 0.5;
    default:
      return 0;
  }
}
const smoothstep = (x: number): number => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};

// ------------------------------------------------------------------ 脱手

export type ChaseBeat = 'let' | 'lunge' | 'creep' | 'grope' | 'letSlow' | 'extend' | 'linger' | 'sag';

/** 追的拍序：抽手快 = 扑过去（let → lunge → creep → grope）；慢 = 伸过去送一下（letSlow → extend → linger → sag） */
export const chasePlan = (fast: boolean): ChaseBeat[] => (fast ? ['let', 'lunge', 'creep', 'grope'] : ['letSlow', 'extend', 'linger', 'sag']);

/** 追里的一拍（拍开始时按手此刻的读数建表——「朝手此刻的读数」，不是脱手那一刻的旧位置） */
export function buildChaseBeat(c: BuildCtx, g: HandGeom, beat: ChaseBeat, canReach: boolean): Phase[] {
  const P = c.persona;
  const k = c.k;
  switch (beat) {
    case 'let':
      return [ph('let', HC.chaseLet, 'hold', 'hold', { breath: { rate: 0 }, feel: pointAt(P, { antennate: 0 }), voice: 'mute' })];
    case 'lunge': {
      const to = canReach ? atMm(g, -(g.touch + HC.chaseNear)) : flatH(0.06, g.dir);
      return gov(
        [ph('lunge', 0.5 / k, 'mj', to, { path: 'line', breath: { rate: 1, period: 0.7, amp: 1.2 }, voice: 'query', feel: pointAt(P, { antennate: 0.15 }), light: 1.2 })],
        c,
        'pursue',
      );
    }
    case 'creep':
      return gov([ph('creep', 0.6 / k, 'mj', atMm(g, HC.reachLand), { feel: pointAt(P), voice: 'mute' })], c, 'creep');
    case 'grope': {
      const osc = dOf(c.cur) <= 0.25 ? { amp: 0.04 / D_SPAN, hz: 0.5, decay: 0.6 } : undefined;
      return [ph('grope', 0.5, 'hold', 'hold', { osc, feel: pointAt(P, { antennate: 0.2 }) })];
    }
    case 'letSlow':
      return [ph('letSlow', HC.chaseLetSlow, 'hold', 'hold', { breath: { rate: 0 }, feel: pointAt(P, { antennate: 0 }), voice: 'mute' })];
    case 'extend':
      return gov([ph('extend', 1.0 / k, 'mj', flatH(HC.chaseExtend * g.Dh, g.dir), { path: 'line', voice: 'query', feel: pointAt(P) })], c, 'deliberate');
    case 'linger':
      return [ph('linger', 0.6, 'hold', 'hold', { voice: 'query', feel: pointAt(P) })];
    case 'sag':
      return gov([ph('sag', 1.4 / k, 'mj', 'rest', { breath: { rate: 1, sigh: true }, voice: 'fall' })], c, 'spont');
  }
}

/** 放弃：沉静型愣一下 → 松 → 收回自己一侧（之后侧身躲）；不稳定型生硬落回 */
export function buildGiveUp(c: BuildCtx, awayDir: number): Phase[] {
  const k = c.k;
  if (c.persona === 'B') {
    return gov(
      [
        ph('still', 0.6, 'hold', 'hold', { breath: { rate: 0 }, feel: feel('still'), voice: 'mute' }),
        ph('loosen', 1.0 / k, 'mj', addD(c.cur, -0.5 * dOf(c.cur)), { voice: 'fall' }),
        ph('withdraw', 1.8 / k, 'mj', flatH(0.12, awayDir), {
          path: 'line',
          breath: { rate: 1, amp: 0.6, push: 0.04, sigh: true },
          voice: 'mute',
          light: 0.85,
          feel: feel('tuck'),
        }),
      ],
      c,
      'deliberate',
      { still: 'reflex', withdraw: 'spont' },
    );
  }
  return gov([ph('drop', 0.5, 'lin', 'rest', { path: 'line', breath: { rate: 1, sigh: true }, feel: feel('free') })], c, 'urgent');
}

// ------------------------------------------------------------------ 抓空与搜寻

export type EmptyKind = 'regrab' | 'palpate' | 'open' | 'drop';

/** 抓空之前的一拍（按人格；不稳定型由引擎用表情子流抽）+ 放开回静息 */
export function buildEmpty(c: BuildCtx, kind: EmptyKind, g: HandGeom | null): Phase[] {
  const k = c.k;
  const out: Phase[] = [];
  switch (kind) {
    case 'regrab': {
      const Dc = dOf(c.cur);
      const r = g ? g.r : HC.armL;
      out.push(ph('regrab', 0.4, 'mj', flatH(Dc + 15 / gainAt(r, Dc), c.cur.dir), { breath: { rate: 1 }, voice: 'huff', feel: feel('point', { antennate: 0.1 }) }));
      break;
    }
    case 'palpate': {
      // 摸一摸叠在此刻的姿态上：离轴时摆幅让到 0.48 以内（深卷姿态的摆动由执行层的深卷窗口兜着）
      const amp = c.cur.deep > 0 ? 0.04 : Math.min(0.04, Math.max(0, HC.flatMax - dOf(c.cur)));
      out.push(ph('palpate', 2, 'hold', 'hold', { osc: { amp: amp / D_SPAN, hz: 0.5, decay: 0 }, voice: 'query', feel: feel('point', { antennate: 0.2 }) }));
      break;
    }
    case 'open':
      out.push(ph('open', 2 / k, 'in', addD(c.cur, -0.4 * dOf(c.cur)), { breath: { rate: 1, sigh: true }, voice: 'mute' }));
      break;
    default:
      out.push(ph('drop', 0.5, 'lin', 'rest', { path: 'line', breath: { rate: 1, sigh: true } }));
      return gov(out, c, 'urgent');
  }
  out.push(ph('unfurl', 1.5 / k, 'mj', 'rest', { breath: { rate: 1 } }));
  return gov(out, c, 'deliberate', { regrab: 'urgent', palpate: 'reflex' });
}

/** 搜寻：以最后碰到的那一点（差动、弯向）为中心，一边比一边宽地来回探，每到一头停一下 */
export function buildSearch(c: BuildCtx, last: { D: number; dir: number }, n: number): Phase[] {
  const k = c.k;
  const legD = [0.06, -0.04, 0.08];
  const legA = [30 * DEG, -30 * DEG, 45 * DEG];
  const out: Phase[] = [];
  for (let i = 0; i < Math.min(3, n); i++) {
    out.push(
      // 每一头的探（±0.04）叠在这里：落点让出摆幅
      ph(`cast${i + 1}`, (0.9 + 0.3 * i) / k, 'mj', flatH(Math.min(HC.flatMax - 0.04, last.D + legD[i]), last.dir + legA[i]), {
        breath: { rate: 1, period: 0.85 },
        feel: feel('free', { antennate: 0.15 }),
        voice: i === 0 ? 'query' : undefined,
      }),
      ph(`probe${i + 1}`, 0.5, 'hold', 'hold', { osc: { amp: 0.04 / D_SPAN, hz: 0.5, decay: 0 } }),
    );
  }
  out.push(ph('sag', 1.4 / k, 'mj', 'rest', { breath: { rate: 1, sigh: true }, voice: 'fall' }));
  return gov(out, c, 'deliberate', { sag: 'spont' });
}

// ------------------------------------------------------------------ 躲（侧身警戒）与偷看

/** 躲的姿态：背着手弯，越近越缩（0.12–0.31） */
export const avoidPose = (close: number, awayDir: number): Pose => flatH(0.12 + 0.19 * clamp(close, 0, 1), awayDir);

/** 看见手、决定躲：定住（0.3 + 0.1τ）→ 慢慢收（身体侧过去由引擎转） */
export function buildShrink(c: BuildCtx, close: number, awayDir: number, freeze = true): Phase[] {
  const P = c.persona;
  const out: Phase[] = [];
  if (freeze) out.push(ph('freeze', 0.3 + 0.1 * c.tau, 'hold', 'hold', { breath: { rate: 0 }, feel: feel('tuck'), light: 0.9, voice: 'mute' }));
  out.push(
    ph(freeze ? 'shrink' : 'reshrink', 1.2 / c.k, 'mj', avoidPose(close, awayDir), {
      path: 'line',
      breath: { rate: 1, amp: 0.6, push: 0.04 },
      feel: feel('tuck', { quiver: P === 'B' || P === 'D' ? 0.04 : undefined }),
      voice: 'mute',
      light: 0.9,
    }),
  );
  return gov(out, c, 'deliberate', { freeze: 'reflex' });
}

/** 偷看：触须先指过去 → 臂转回三成 → 看一会儿 → 收回。不稳定型突然瞥一眼（生硬） */
export function buildPeek(c: BuildCtx, g: HandGeom, close: number, awayDir: number): Phase[] {
  const home = avoidPose(close, awayDir);
  const k = c.k;
  if (c.persona === 'D') {
    return gov(
      [
        ph('glance', 0.3, 'lin', flatH(dOf(home), lerpAngle(awayDir, g.dir, 0.4)), { feel: pointAt('D', { antennate: 0 }), voice: 'mute' }),
        ph('look', 0.4, 'hold', 'hold', { feel: pointAt('D', { antennate: 0, quiver: 0.04 }) }),
        ph('snap', 0.4, 'lin', home, { path: 'line', feel: feel('tuck'), voice: 'tsk' }),
      ],
      c,
      'urgent',
    );
  }
  return gov(
    [
      ph('lean', 1.2 / k, 'mj', flatH(Math.max(0, dOf(home) - 0.05), lerpAngle(awayDir, g.dir, 0.3)), { feel: pointAt(c.persona, { antennate: 0 }), breath: { rate: 0.3 }, voice: 'mute', light: 0.9 }),
      ph('look', 0.6 + 0.2 * c.tau, 'hold', 'hold', { feel: pointAt(c.persona, { antennate: 0, quiver: 0.04 }), breath: { rate: 0.3 }, voice: 'mute' }),
      ph('back', 1.2 / k, 'mj', home, { feel: feel('tuck') }),
    ],
    c,
    'spont',
  );
}

/** 偷看时手动了：缩回去（urgent，一声 tsk）——观众学得会「别动它，它才敢看」 */
export function buildSnap(c: BuildCtx, close: number, awayDir: number): Phase[] {
  return gov([ph('snap', 0.4, 'mj', avoidPose(close, awayDir), { path: 'line', voice: 'tsk', feel: feel('tuck') })], c, 'urgent');
}

/** 手快速逼近：一缩（再背一点、环身往收拢端） */
export function buildCringe(c: BuildCtx, close: number, awayDir: number): Phase[] {
  const to = flatH(dOf(avoidPose(close, awayDir)) + 0.05, awayDir);
  return gov(
    [
      ph('cringe', 0.4, 'mj', to, { path: 'line', breath: { rate: 1, push: 0.06, amp: 0.5 }, feel: feel('tuck', { quiver: 0.05 }), voice: 'mute' }),
      ph('hold', 0.6, 'hold', 'hold', { breath: { rate: 1, push: 0.06, amp: 0.5 }, feel: feel('tuck'), voice: 'mute' }),
    ],
    c,
    'urgent',
    { hold: 'reflex' },
  );
}

/** 手走了：松一口气，回静息 */
export function buildRelief(c: BuildCtx): Phase[] {
  return gov([ph('relief', 1.5 / c.k, 'mj', 'rest', { breath: { rate: 1, sigh: true }, feel: feel('free') })], c, 'deliberate');
}

/** 不稳定型被迎着的手碰到、⑤ 抽到负：往背着手那边缩回（之后侧身躲） */
export function buildRecoil(c: BuildCtx, awayDir: number): Phase[] {
  return gov(
    [
      ph('recoil', 0.4, 'mj', avoidPose(1, awayDir), { path: 'line', breath: { rate: 1, push: 0.06 }, voice: 'tsk', feel: feel('tuck') }),
      ph('hold', 0.5, 'hold', 'hold', { feel: feel('tuck'), voice: 'mute' }),
    ],
    c,
    'urgent',
    { hold: 'reflex' },
  );
}

/** 深卷的差动换算（守门用：与执行层同一个数） */
export const DEEP_SPAN_CHECK = D_DEEP_SPAN;
