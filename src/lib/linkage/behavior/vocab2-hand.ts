/**
 * 迎手链的程序表（2026-10-08 第八批研究原型立、2026-10-17 随动作程序转为唯一的一套；轮回机器_触手与转向研究.md §9）。
 *
 * 用户问「除了惊跳，是不是还应该有顺应着人、往人手的方向凑、甚至缠绕的机制」。这条链把看见手以后的事
 * 重做成一串**节拍各不相同、每拍等臂真的停稳才进下一拍**的段落：眼（触须）先到 → 臂一跳一停地陪着 →
 * 手停下才凑过去 → 在手前停半拍（全链唯一「张开着」的全静）→ 热情型先蹲一下再扑、其余精确地伸过去轻轻
 * 落下 → 碰到即定住感觉 → 贴上、每口呼气收紧一级 → 握着时随呼吸一紧一松地哼 → 手被抽走按人格扑过去或放手
 * → 扑空在丢手的地方找。不朝人的那一路（回避型的 95%）是侧身警戒 + 偷看（越怕侧得越多，封顶 160°，不整个背过去）。
 *
 * 只管「一拍长什么样」：引擎（engine.ts 的迎手链）决定在什么时刻做哪一拍、带什么读数与人格参数，这里按表
 * 解算成分段程序（programs.ts 执行）。表在一拍开始时一次解算成数，手挪了就重建下一拍（不做活目标）——
 * 固件照表执行仍然成立。
 *
 * 四条臂的物理守则（研究笔记 §9.2，数字取自 Lab 1-3 求解器）：
 *   1. 快 = 大：0.5 s 以内的指令，梢端峰速 ≈ 1000 mm/s × 差动行程。扑的总行程（蹲 + 扑）封顶 0.22，是最浅
 *      惊跳 0.45 的一半——「一击追不上惊跳」是结构保证，不靠调时长。
 *   2. 臂会自己晃（周期 ≈ 1.45 s、阻尼比 ≈ 0.12，引擎的臂余振观测器同一组数）：每一步要么按档慢走、要么不短于一个周期；只有扑是快的一步。
 *   3. 形状由手定：目标一律写成「手那一点上的毫米」，用接触灵敏度 G(r, D) 换成差动（gainAt）。
 *   4. 重音按看得见的时刻：触须与呼吸可以先于臂；扑的重音挂在碰到那一刻。
 *
 * 人格表的读法均为推断（研究笔记 §9.5；按 temper 换结构）。方向约定同引擎：弯向 0 = 臂梢朝上，左为正。
 */
import { PRESENCE_EDGES } from './events';
import type { PersonaKey, Temper } from './persona';
import { type Cues, D_DEEP_SPAN, D_FLAT_MAX, D_MAX, D_SPAN, type FeelerPose, type Phase, type Pose, lerpPoseLine } from './programs';
import { type BuildCtx, PEAK, type Tier, V2, dropPhase, anticPose, byTau, dOf, govern, pathLen, ph, tierSpeed, unhook } from './vocab2';

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;
const wrapPi = (a: number): number => a - TAU * Math.floor((a + Math.PI) / TAU);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const lerpAngle = (a: number, b: number, u: number): number => wrapPi(a + wrapPi(b - a) * u);

/**
 * 停在碰到圈外这么多 mm（2026-10-19 第二轮审核第 6 条把三处并成一个：停半拍最快那一端 13.6、回避型先到的边 16、
 * 追到手旁 14——差 2 mm 看不出来）
 */
const NEAR_GAP = 14;

/** 手感常量（均待作者拍板；出处见研究笔记 §9.8） */
export const HC = {
  /** 臂长（mm，静息弦长；唯一出处——引擎直接读它，台架 ARM_GEOM.length 由守门测试核对） */
  armL: 357.5,
  /** 接触灵敏度 G(r, D) = k·clamp(r/L, 0.25, 1)^e·(1 − drop·min(D, 0.5))（mm / 差动） */
  gainK: 480,
  gainExp: 1.6,
  gainDrop: 0.75,
  /**
   * 按 τ 的等待 / 停顿（2026-10-17 一律写成 [最快, 最慢]，由 vocab2.ts 的 byTau 按迟钝度插值；端值 = 改之前热情 / 沉静的值）：
   * 看见 → 第一跳 take；跳完停多久 dwell（一跳一停的周期 ≥ 1.4 s，不超过臂的 0.7 Hz 通带）；手停稳多久才凑 still；
   * 停半拍的距离 hover（碰到半径之外再留 mm）与时长下限 hoverMin；缠前定住感觉 feel；决定躲那一下定住 avoidFreeze；
   * 乱序随机 ⑤ 抽到负时愣住 stall
   */
  take: [0.12, 0.35],
  dwell: [0.7, 1.5],
  still: [0.25, 1.4],
  hover: [NEAR_GAP, 28],
  hoverMin: [0.25, 0.7],
  feel: [0.16, 0.6],
  avoidFreeze: [0.32, 0.55],
  stall: [0.56, 1.25],
  /**
   * 回避型偷看看多久、凑之前第二次等多久（秒，定值）：2026-10-19 以前按 τ 插值 [0.64, 1.1] / [0.44, 0.9]，
   * 但只有回避型走得到、而它的 τ 0.3（衰老到头 0.6）只用到最快那一端，全程只差 0.09 s
   */
  peekLook: 0.7,
  wait2: 0.5,
  /** 停在碰到圈外多少 mm：回避型（迎的时候）先到的边、追到手旁（停半拍最快那一端同值） */
  nearGap: NEAR_GAP,
  /** 第一跳只伸到「刚好碰到」的 0.55（先转方向、后伸长）；臂一步至少 0.7 s（陪着的每一跳、缠的贴上都按它） */
  firstHop: 0.55,
  stepMin: 0.7,
  /** 跟的停距（mm）：碰到半径 + 20 + 0.6 s × 手速，封顶 130——跟的时候不蹭到手 */
  standGap: 20,
  standLag: 0.6,
  standCap: 130,
  /**
   * 跳的门：目标误差（差动）超过 eps 才跳；超过 jump（手猛挪）不等停稳就从此刻重跳。2026-10-17 收成一个值
   *（此前按性格四档 + τ 修正 + 封顶，最大差 0.03 差动 ≈ 臂梢 11 mm，看不出来）
   */
  eps: 0.04,
  jump: 0.12,
  /** 热情型冲在手前面：按读数速度往前看 0.4 s（封顶 0.05）；回避型每跳只走 65% */
  leadT: 0.4,
  leadMax: 0.05,
  bStep: 0.65,
  /** 停半拍最多等 1.5 s */
  hoverMax: 1.5,
  /** 回避型（迎的时候）：先到碰到圈外 nearGap，退到 64 mm，再回到停半拍位 */
  bRetreat: 64,
  /**
   * 蹲：clamp(0.14 − 剩余行程, 0.04, 0.08)·花样；停稳 ≥ 0.18 s（≤ 0.5）。落点 land：扑、精确伸、慢碰、追里的慢碰、
   * 缠的贴上都落在手上 +2 mm，收紧从这里一级级加（2026-10-19 以前扑落 +4：碰到半径 32 mm，圈里 2 mm 与 4 mm 读不出差别）
   */
  cockBase: 0.14,
  cockMin: 0.04,
  cockMax: 0.08,
  cockedMin: 0.18,
  cockedMax: 0.5,
  strikeMax: 0.22,
  land: 2,
  /** 乱序随机 ⑤ 抽到负：停在碰到圈外 40 mm、愣住、退到 110 mm 外 */
  balkNear: 40,
  balkFar: 110,
  /** 够得着：aimBend ≤ 1.41 且离基座 ≤ 0.98 臂长 */
  reachBend: 1.41,
  reachFar: 0.98,
  /** 推两下（每下 0.03）还没碰到 = 一次够不着 */
  nudge: 0.03,
  nudges: 2,
  /** 缠：定住感觉见 feel（手伸过来 ×1.5；已经等过 ④ 的、追里的一律 0.12）；贴上 ≥ max(stepMin, 0.6/k)；每级 +5 mm；窗口 −12…+24 mm */
  feelShort: 0.12,
  feelByHand: 1.5,
  seatK: 0.6,
  cinchStep: 5,
  winLo: -12,
  winHi: 24,
  /** 握：压过手 8 mm、挤压峰峰 14 + 16·②、指令提前 0.45 s、满足 fade = (1 − 0.45) + 0.45·e^(−n/3)（从 1 落到 0.55） */
  holdCenter: 8,
  holdAmp0: 14,
  holdAmp1: 16,
  holdLead: 0.45,
  fade1: 0.45,
  fadeN: 3,
  /** 握着跟手：差动按 τ 0.6 s 追、弯向 ≤ 0.3 rad/s；读数一步跳过 0.06 / 20° 视为被抽走、不跟 */
  followTau: 0.6,
  followRate: 0.3,
  jumpD: 0.06,
  jumpDir: 20 * DEG,
  /** 缠的程序走完交给握持控制器时的混合时长（s） */
  holdBlend: 1,
  /**
   * 手速四级（mm/s，2026-10-17 收成一套，交互机制参数表 §12.3 第 3 条；此前 8 个门槛）：
   * 静 < vStill 15 · 慢 vStill–vSlow 60 · 快 ≥ vFast 150 · 划过 > vSwipe 800（60–150 之间不单独起反应）。
   * 用到的地方——静：凑、偷看、重新武装要手静着，偷看时 / 凑的途中手动了就缩回 / 回到陪着，怕的时候手一动就躲开；
   * 慢：握着时的微动（反射一下）、被牵着走（< 60 且持续 0.5 s，= 台架 HAND_MM.tractionSpeed）、往外拉 ≥ 60 就让一让；
   * 快：抽手快 = 扑过去追，不怕的时候手快速逼近也躲开；划过：台架判碰到时划过去的不算（= HAND_MM.maxSpeed），躲开的份量到顶。
   * 手慢慢挪满 tractionT 秒算牵着走；握着时的攥 / 让见下面的 HOLD_BUMP
   */
  vStill: 15,
  vSlow: 60,
  vFast: 150,
  vSwipe: 800,
  tractionT: 0.5,
  /** 追：抽手快（≥ vFast）= 扑过去；慢 = 伸过去送一下；let 0.15 s（慢的 0.3）；身体晚 0.3 s 跟 */
  chaseLet: 0.15,
  chaseLetSlow: 0.3,
  chaseExtend: 0.8,
  yawLag: 0.3,
  /** 追的缠到限位的兜底（s）：拍走完时引擎会缩到 +0.5 s，这里只防拍序意外卡住（四拍最慢的 creep 档也远在其下） */
  chaseCap: 20,
  /** 躲：手留在身侧 ±105°；收的时候身体晚 0.4 s；手挪得此刻的臂离该有的躲姿差过 reshrinkPose（怕的时候更小）再收一次 */
  avoidSide: 105 * DEG,
  avoidLag: 0.4,
  reshrinkPose: 0.06,
  /**
   * 越怕（⑬ 的躲那一半 N，0–1；回避型手在近处 ≈ 1）躲得越明显（2026-10-15 用户：「可以不完全背过去，但要有明显的躲着手的
   * 表现，大触手也要明显回避」）：收得更紧（差动 +0.12·N·close）、弯向往下压 25°·N·close（往下藏）；姿态差 0.06 − 0.03·N 就再收
   *（2026-10-17 收成这一个门：方向、远近变了，姿态差自然变），收得快（1.2 → 0.7 s ÷ k，档位 deliberate → pursue）；
   * 偷看只转回 0.3·(1 − 0.7N)。N = 0 时与改前逐位相同
   */
  avoidTight: 0.12,
  avoidTuck: 25 * DEG,
  reshrinkPoseN: 0.03,
  shrinkFast: 0.5,
  peekLeanN: 0.7,
  /**
   * 躲开（2026-10-17 与「一缩」合成一个）：手在逼近（0.25 s 内朝臂过来——按此刻的臂姿估的臂—手距离变小，或朝机身过来——
   * 离电机轴变近）就触发。怕的时候（⑬ 的 N ≥ 0.2）手一动（≥ vStill）、臂—手距离 < 120 + 200·N mm 或手在近处（< DIST.near）
   * 就躲；不怕的时候只有手快（≥ vFast）且在近处才躲。份量 σ = max(N, 手速在 vSlow → vSwipe 之间的位置)：
   * 臂甩到背着手那边、比躲的姿态再紧 0.08·(0.6 + 0.4σ)（strike 档，与热情型扑手同一个最快档），定住 0.6 + 0.8σ s，
   * 环身往收拢端推 0.06 + 0.02σ；身体再侧开 25°·N（累加封顶 35°，之后按 4 s 慢慢回落）。两次之间至少 0.35 s
   */
  dodgeR0: 120,
  dodgeR1: 200,
  dodgeD: 0.08,
  dodgeTurn: 25 * DEG,
  dodgeTurnMax: 35 * DEG,
  dodgeTurnTau: 4,
  dodgeGap: 0.35,
  /**
   * 侧身角（2026-10-17 收成一条式子）：105° + 55°·N·(0.35 + 0.65·近)，再加躲开累加的那一截，封顶 160°——不整个背过去
   * （用户 2026-10-15：「可以不完全背过去」）。近 = bodyness（手离电机轴 0.6 → 0.32 m 从 0 到 1），按最后看见手时的距离算
   *（看不见就不知道它挪没挪）。N = 1 时：远处 124°、凑到机身边上 160°；N = 0 时 105°。躲手是唯一在手搭在机身上方时也转身的态度
   */
  avoidSideMax: 160 * DEG,
  avoidFarShare: 0.35,
  /** 怕的时候，手在臂够不着的地方（读数 aimBend 1.0 → 1.4 饱和）：背着它弯的方向渐变成「往下、背着手那一侧」 */
  awaySideFrom: 1,
  awaySideSpan: 0.4,
  /** 手走了（远于 DIST.far 持续 1 s，或离开画布）= 松一口气 */
  reliefT: 1,
  /** 放开后手不动：3 s 后再来一次（抓空后每 ⑨ 至多一次） */
  rearm: 3,
  /** 臂先身后：要转身时偏航目标晚 0.25/k s 才写 */
  armLead: 0.25,
  /** 够不着时：手挪 60 mm 才重新武装 */
  strainRearm: 60,
} as const;

/**
 * 手离机身（电机轴）的三档距离（mm，2026-10-17 收成一套，交互机制参数表 §12.2 第 2 条；此前六把尺）：
 * 摸壳 body 0.32 m（台架机身外廓 0.30 m：手在机身上方 = 在摸壳，不转身、不去够）· 近 near 0.6 m · 远 far 1.5 m。
 * 近 / 远与在场档的边界同一个数（events.ts PRESENCE_EDGES）
 */
export const DIST = { body: 320, near: PRESENCE_EDGES.near * 1000, far: PRESENCE_EDGES.far * 1000 } as const;
const smooth01 = (x: number): number => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};
/** 手有多近：远 → 近从 0 到 1（⑬ 按手的那一份、躲的收紧程度都读它——同一条曲线） */
export const nearness = (dist: number): number => 1 - smooth01((dist - DIST.near) / (DIST.far - DIST.near));
/** 手凑到机身边上：近 → 摸壳从 0 到 1（侧身角再侧开的那一截读它） */
export const bodyness = (dist: number): number => 1 - smooth01((dist - DIST.body) / (DIST.near - DIST.body));

// ------------------------------------------------------------------ 几何

/** 接触灵敏度：臂在手那一点上每多一个差动走多少 mm（方案 3 标定，handReading 公式在这些点上误差 ≤ 0.025 差动） */
// 非整数次方写成 exp(k·log x)，不用 `**`（理由见 vocab2.ts 的 powInt）
export function gainAt(r: number, D: number): number {
  return HC.gainK * Math.exp(HC.gainExp * Math.log(clamp(r / HC.armL, 0.25, 1))) * (1 - HC.gainDrop * Math.min(Math.max(D, 0), 0.5));
}

/** 离轴姿态：只用弯曲（超过 1 的部分由执行层的深缠行程给），封顶 0.48，不带深卷 */
export function flatH(D: number, dir: number): Pose {
  return { bend: clamp(D, 0, D_FLAT_MAX) / D_SPAN, dir: wrapPi(dir), deep: 0 };
}

/**
 * 规范表示（同一个差动，执行层给出同一组三腱）：0.48 以内只用平卷，超出 0.48 的那一截才记深卷。2026-10-17 起迎手链
 * 自己不用深卷，只剩惊跳留下的深卷会进到手链的程序里（收回途中）：0.48 以内一律记成平卷，执行层不再按它贴轴吸附
 */
export function canonDeep(p: Pose): Pose {
  if (p.deep <= 0) return p;
  const D = dOf(p);
  if (D <= D_FLAT_MAX) return { bend: D / D_SPAN, dir: p.dir, deep: 0 };
  return { bend: D_FLAT_MAX / D_SPAN, dir: p.dir, deep: (D - D_FLAT_MAX) / D_DEEP_SPAN };
}

/** 刚好穿过手的差动：min(D_MAX, D_SPAN·aimBend)（读数的 aimBend = 臂弯到穿过手要多少弯曲） */
export const handD = (aimBend: number): number => Math.min(D_MAX, D_SPAN * aimBend);

/** 迎手链看到的手：读数在建表那一刻的快照 */
export interface HandGeom {
  /** 刚好穿过手的差动 = handD(aimBend) */
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

/** 够得着（按求解器实测定的判据，比删掉的现行版 1.3 L 严：稍超出臂长的手不再「永远差一点」） */
export function reachable(aimBend: number, aimDist: number): boolean {
  return aimBend <= HC.reachBend && aimDist <= HC.reachFar * HC.armL;
}

// ------------------------------------------------------------------ 人格读法（均为推断）

const take = (c: BuildCtx): number => byTau(HC.take, c.tau);
export const dwellOf = (c: BuildCtx): number => byTau(HC.dwell, c.tau);
export const stillOf = (tau: number): number => byTau(HC.still, tau);
export const hoverGap = (g: HandGeom, tau: number): number => g.touch + byTau(HC.hover, tau);
export const hoverMinOf = (tau: number): number => byTau(HC.hoverMin, tau);
export const standOf = (g: HandGeom): number => Math.min(HC.standCap, g.touch + HC.standGap + HC.standLag * g.v);
/** 扑（玩扑）只给快的人格（√k_v ≥ 1.2：热情型、快的乱序随机），而且衰老过半就不扑了 */
export const pounces = (c: BuildCtx): boolean => c.k >= V2.springK && c.ageU < 0.5;
/** 够不着时再撑几次：floor(2.5·⑩)——越想要越会再撑（热情 2 · 乱序随机 1；沉静、回避不探身，引擎不调它） */
export const strainTries = (toward: number): number => Math.floor(2.5 * toward);
/** 握着的挤压峰峰（mm）：holdAmp0 + holdAmp1·②（热情 26.8 · 沉静 22 · 回避 18.8 · 乱序随机 17.2–28.4） */
export const squeezeAmp = (breathAmp: number): number => HC.holdAmp0 + HC.holdAmp1 * breathAmp;
/** 收紧几级：1 + [|g|/0.5 ≥ 0.4]（热情 2 · 回避 2 · 沉静 1 · 乱序随机 1–2） */
export const cinchCount = (gN: number): number => 1 + (gN >= 0.4 ? 1 : 0);

/** 跳与凑时触须的「交替探」幅度（rad）：热情 0.15 · 乱序随机 0.06 · 沉静 / 回避 0（乱序随机、回避另加颤 0.03） */
const antOf = (T: Temper): number => (T === 'warm' ? 0.15 : T === 'random' ? 0.06 : 0);
/** 指向手的触须提示：不写 side = 引擎按手的相对方位连续指（眼一直跟、臂一跳一停） */
const pointAt = (T: Temper, extra: { antennate?: number; quiver?: number } = {}): Cues['feel'] => ({
  pose: 'point',
  antennate: extra.antennate ?? antOf(T),
  quiver: extra.quiver ?? (T === 'random' || T === 'avoidant' ? 0.03 : undefined),
});
const feel = (pose: FeelerPose, extra: { antennate?: number; quiver?: number } = {}): Cues['feel'] => ({ pose, ...extra });

/** 按档把段拉长，再按段名改档；返回的段已就地改好 */
function gov(phases: Phase[], c: BuildCtx, tier: Tier, tiers?: Partial<Record<string, Tier>>): Phase[] {
  return govern(unhook(phases, c.cur, c.rest), c, tier, tiers);
}

// ------------------------------------------------------------------ 看见

/** 跳的一步：shift（≥ 0.7 s，按档）+ fixate（停：dwell 起，最多再等 1 s 让臂停稳） */
function hopPhases(c: BuildCtx, to: Pose, first = false): Phase[] {
  const P = c.temper;
  const breath: Cues['breath'] = { rate: 1, period: P === 'warm' ? 0.75 : 0.85, amp: 1.1 };
  const dw = dwellOf(c);
  const osc = dOf(to) <= 0.27 ? { amp: 0.015 / D_SPAN, hz: 0.35, decay: 0 } : undefined;
  const out: Phase[] = [];
  if (first) {
    // take：先「看」——吸一口、放慢、触须先指过去、一声上扬；臂还不动（0.1 + 0.1τ）
    out.push(ph('take', take(c), 'hold', 'hold', { breath: { rate: 0.4, amp: 1.15 }, feel: pointAt(P), voice: 'query', light: 1.15 }));
  }
  out.push(
    ph(first ? 'firstHop' : 'shift', HC.stepMin, P === 'random' ? 'lin' : 'mj', to, { breath, feel: pointAt(P), light: 1.1 }),
    ph('fixate', dw + 1, 'hold', 'hold', { breath, feel: pointAt(P), light: 1.1, osc }),
  );
  return gov(out, c, P === 'calm' || P === 'avoidant' ? 'deliberate' : 'pursue', { take: 'reflex', fixate: 'reflex' });
}

/** 跟的站位：停在离手「碰到半径 + 20 + 0.6 s × 手速」mm 处 */
export function standPose(g: HandGeom): Pose {
  return atMm(g, -standOf(g));
}

/**
 * 这一跳的目标（结构按性格，不只是快慢）：热情 = 往前看 0.4 s，冲在手前面；沉静 = 到位；回避 = 每次只走 65%，
 * 手停了再补；乱序随机 = 到位、匀速（生硬）。lead = 读数速度 × 0.4 s（差动平面，引擎给，已封顶 0.05）
 */
export function hopTarget(c: BuildCtx, g: HandGeom, lead: { x: number; y: number }): Pose {
  const st = standPose(g);
  if (c.temper === 'warm') {
    const x = dOf(st) * Math.cos(st.dir) + lead.x;
    const y = dOf(st) * Math.sin(st.dir) + lead.y;
    const D = Math.hypot(x, y);
    return flatH(D, D > 1e-9 ? Math.atan2(y, x) : st.dir);
  }
  if (c.temper === 'avoidant') return lerpPlane(c.cur, st, HC.bStep);
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
  | 'nudge'
  | 'balk'
  | 'stall'
  | 'drop';

/**
 * 凑的拍序（引擎照这个顺序一拍一拍起；每拍之间有门）：
 *   热情 / 快的乱序随机（扑得下）：transport → crouch → cocked → pounce
 *   沉静（以及扑不下的热情）：transport → hover → sight → reach
 *   回避（⑩ 只有 5%，迎的时候也是试探着）：edge → wait → retreat → wait2 → edge2 → hover → touch
 *   慢的乱序随机：transport → hover → touch
 *   乱序随机 ⑤ 抽到负：balk → stall → drop（撤掉）
 * 走完没碰到：nudge × 2。（2026-10-17 以前深卷门开着时最后一拍换成沿腱轴卷的 curl；闭环里一秒没用上，删掉）
 */
export function approachPlan(c: BuildCtx, g: HandGeom, opts: { negative: boolean }): ApproachBeat[] {
  if (opts.negative) return ['balk', 'stall', 'drop'];
  const P = c.temper;
  // 沉静、扑不下的热情（手太远、或衰老过半不扑了）精确地伸；回避、慢的乱序随机慢慢碰
  const last: ApproachBeat = P === 'calm' || P === 'warm' ? 'reach' : 'touch';
  if (P === 'avoidant') return ['edge', 'wait', 'retreat', 'wait2', 'edge2', 'hover', last];
  if ((P === 'warm' || P === 'random') && pounces(c) && pounceFits(c, g)) return ['transport', 'crouch', 'cocked', 'pounce'];
  if (P === 'calm' || P === 'warm') return ['transport', 'hover', 'sight', last];
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
export function buildApproachBeat(c: BuildCtx, g: HandGeom, beat: ApproachBeat): Phase[] {
  const P = c.temper;
  const k = c.k;
  const H = hoverGap(g, c.tau);
  const transportCue: Partial<Phase> = { breath: { rate: 1, period: 0.85, amp: 1.1 }, feel: pointAt(P), light: 1.1 };
  const shyCue: Partial<Phase> = { breath: { rate: 1, amp: 0.6 }, feel: pointAt(P, { quiver: 0.05 }), voice: 'mute' };
  const lin = P === 'random' ? 'lin' : 'mj';
  switch (beat) {
    case 'transport':
      return gov([ph('transport', 0.6 / k, lin, atMm(g, -H), { ...transportCue, voice: P === 'warm' ? 'query' : undefined })], c, 'pursue');
    case 'edge':
      return gov([ph('edge', 0.6 / k, 'mj', atMm(g, -(g.touch + HC.nearGap)), shyCue)], c, 'pursue');
    case 'wait':
      return [ph('wait', 0.6, 'hold', 'hold', { breath: { rate: 0.3, amp: 0.6 }, feel: pointAt(P, { quiver: 0.05 }), voice: 'mute' })];
    case 'retreat':
      return gov([ph('retreat', 0.6 / k, 'mj', atMm(g, -(g.touch + HC.bRetreat)), { feel: feel('tuck'), voice: 'mute' })], c, 'deliberate');
    case 'wait2':
      return [ph('wait2', HC.wait2, 'hold', 'hold', { breath: { rate: 0.3 }, voice: 'mute' })];
    case 'edge2':
      return gov([ph('edge2', 0.6 / k, 'mj', atMm(g, -H), shyCue)], c, 'deliberate');
    case 'hover':
      // 停半拍：屏气、触须定住指着手、不出声、灯亮、环身张开——惊跳的凝住是收紧 + 灯暗 + 触须收，两者相反
      return [ph('hover', HC.hoverMax, 'hold', 'hold', { breath: { rate: 0 }, feel: feel('still'), voice: 'mute', light: 1.15 })];
    case 'crouch': {
      // 蹲：往回收一点（看得见的预备 0.04–0.08），吸一口、张开，一声上扬——「玩扑」的信号，不读作捕猎
      const { cock } = pounceGeom(c, g);
      const to = anticPose(c.cur, atMm(g, HC.land), cock);
      return gov([ph('crouch', 0.35 / k, 'mj', to, { path: 'line', breath: { rate: 1, amp: 1.2, push: -0.03 }, feel: pointAt(P), voice: 'query' })], c, 'deliberate');
    }
    case 'cocked':
      return [ph('cocked', HC.cockedMax, 'hold', 'hold', { breath: { rate: 0 }, feel: feel('still'), voice: 'mute', light: 1.15 })];
    case 'pounce': {
      // 扑：直线落在手上 +land，屏住、不出声（重音在碰到那一刻）。总行程 ≤ 0.22：梢端 ≤ ~230 mm/s，到不了惊跳。
      // 落点按剩余余量收（pounceFits 的 S 没算落点那 land；余量不够时少落一点，再不够就沿直线截在 0.22）
      let to = atMm(g, HC.land);
      if (pathLen(c.cur, to, 'line') > HC.strikeMax) {
        let lo = 0;
        let hi: number = HC.land;
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
      return [ph('pounce', dur, P === 'random' ? 'lin' : 'out', to, { path: 'line', breath: { rate: 0 }, feel: pointAt(P, { antennate: 0 }), voice: 'mute', light: 1.15 })];
    }
    case 'sight':
      return [ph('sight', 0.25, 'hold', 'hold', { breath: { rate: 0.2 }, feel: feel('still'), voice: 'mute', light: 1.1 })];
    case 'reach':
      // 沉静型（以及扑不下的热情）：瞄准以后精确直伸、轻轻落下（亲和接触的末段是减速轻落）
      return gov([ph('reach', 0.8 / k, 'mj', atMm(g, HC.land), { breath: { rate: 0.5 }, feel: pointAt(P, { antennate: 0.08 }), voice: 'mute' })], c, 'deliberate');
    case 'touch':
      // 回避型（creep）/ 慢的乱序随机（生硬）慢慢碰
      return gov(
        [ph('touch', 0.8 / k, lin, atMm(g, HC.land), { breath: { rate: 1, amp: 0.7 }, feel: pointAt(P, { antennate: 0, quiver: 0.04 }), voice: 'mute' })],
        c,
        P === 'avoidant' ? 'creep' : 'deliberate',
      );
    case 'nudge':
      return gov([ph('nudge', 0.5 / k, 'mj', addD(c.cur, HC.nudge), { feel: pointAt(P), voice: 'mute' })], c, 'creep');
    case 'balk':
      return gov([ph('balk', 0.6 / k, 'lin', atMm(g, -(g.touch + HC.balkNear)), { ...transportCue, voice: 'mute' })], c, 'pursue');
    case 'stall':
      return [ph('stall', byTau(HC.stall, c.tau), 'hold', 'hold', { breath: { rate: 0 }, feel: pointAt(P, { quiver: 0.08 }), voice: 'mute' })];
    case 'drop':
      return gov([ph('drop', 0.5, 'lin', atMm(g, -(g.touch + HC.balkFar)), { path: 'line', breath: { rate: 1, sigh: true }, voice: 'fall', feel: feel('tuck') })], c, 'pursue');
  }
}

// ------------------------------------------------------------------ 够不着

/**
 * 够不着（先转身对准，仍够不着才做）：gather → stretch（伸长身子：环身张开）→ strain → pump × r → deflate（泄气、叹气）。
 * 之后引擎进「看着」：臂停在泄气后的姿态指着手。沉静、回避不探身（r = 0 且不做这一串，只看着）
 */
export function buildStrain(c: BuildCtx, g: HandGeom, tries: number): Phase[] {
  const k = c.k;
  const P = c.temper;
  // 摆动（撑 ±0.035、再撑 ±0.05）叠在伸长的姿态上：基姿态留出最大摆幅，波峰正好碰到 0.48、不被削顶
  const stretch = flatH(Math.min(D_FLAT_MAX - 0.05, g.Dh), g.dir);
  const out: Phase[] = [
    ph('gather', 0.3 / k, 'mj', addD(c.cur, -0.04), { breath: { rate: 1, amp: 1.2 }, feel: feel('raise') }),
    ph('stretch', 0.6 / k, 'mj', stretch, { breath: { rate: 1, push: -0.1, period: 0.8 }, voice: 'query', feel: pointAt(P, { antennate: 0.2 }), light: 1.2 }),
    ph('strain', 0.9 / k, 'hold', 'hold', { osc: { amp: 0.035 / D_SPAN, hz: 0.45, decay: 0.4 }, breath: { rate: 1, push: -0.1, period: 0.75 }, feel: pointAt(P, { antennate: 0.2 }) }),
  ];
  for (let i = 0; i < tries; i++) {
    out.push(ph(`pump${i + 1}`, 1.3, 'hold', 'hold', { osc: { amp: 0.05 / D_SPAN, hz: 0.5, decay: 0 }, breath: { rate: 1, push: -0.14 }, voice: 'query', feel: pointAt(P, { antennate: 0.2 }) }));
  }
  out.push(deflatePhase(k, stretch, g.dir));
  return gov(out, c, 'pursue', { strain: 'reflex', deflate: 'deliberate' });
}

/** 泄气、叹气：从 from 沿直线往下垂到它差动的六成，弯向从手那边往下偏 0.5 rad */
const deflatePhase = (k: number, from: Pose, handDir: number): Phase =>
  ph('deflate', 1.6 / k, 'out', flatH(0.6 * dOf(from), wrapPi(handDir + 0.5 * (Math.sign(wrapPi(Math.PI - handDir)) || 1))), {
    path: 'line',
    breath: { rate: 1, push: 0.05, sigh: true },
    voice: 'fall',
    feel: feel('tuck'),
    light: 0.75,
  });

/**
 * 凑完推两下还没碰到（算一次够不着）：只泄气，从此刻的臂起。2026-10-19 以前是造一整套探身再滤出这一段，
 * 终点与限速都按探身的终点（手那一点）算，而此刻的臂停在推过的地方
 */
export function buildDeflate(c: BuildCtx, g: HandGeom): Phase[] {
  return gov([deflatePhase(c.k, c.cur, g.dir)], c, 'deliberate');
}

/** 沉静、回避够不着：不探身，每 ⑥ 前倾一点（0.03） */
export function buildLeanIn(c: BuildCtx, g: HandGeom): Phase[] {
  return gov(
    [
      ph('leanIn', 1.2 / c.k, 'mj', addD(c.cur, HC.nudge), { feel: pointAt(c.temper), voice: 'mute', breath: { rate: 0.5 } }),
      ph('leanHold', 0.8, 'hold', 'hold', { feel: pointAt(c.temper), voice: 'mute' }),
      ph('leanBack', 1.2 / c.k, 'mj', standPose(g), { feel: pointAt(c.temper) }),
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
}

/**
 * 缠（抓握 WRAP）：[一缩] → 定住感觉 → 贴上 / 合拢 → 等呼气 → 收紧 × n（每口呼气 +5 mm）。返回各段与「贴上」那一段
 * 的下标——引擎在贴上做完且臂停稳的那一刻记 catchT（台架的张力开关此后才闭合 = 手指被卡住）
 */
export function buildWrap(c: BuildCtx, g: HandGeom, w: WrapIn): { phases: Phase[]; seat: number } {
  const P = c.temper;
  const k = c.k;
  const out: Phase[] = [];
  const at = (mm: number): Pose => {
    const m = clamp(mm, HC.winLo, HC.winHi);
    return atMm(g, m, w.Dref);
  };
  if (w.wince && !w.chase) {
    out.push(
      ph('latency', V2.startleLatency, 'hold', 'hold', { feel: feel('tuck') }),
      ph('wince', 0.25, 'mj', addD(c.cur, -0.02), { path: 'line', breath: { rate: 1, push: 0.04 }, voice: 'tsk', feel: feel('tuck') }),
    );
  }
  const feelT = w.chase || w.waited ? HC.feelShort : byTau(HC.feel, c.tau) * (w.byHand ? HC.feelByHand : 1);
  const accent: Partial<Phase> = w.pounced ? { voice: 'huff', light: 1.25 } : w.chase ? { voice: 'purr', light: 1.15 } : { breath: { rate: 0 }, light: 1.2 };
  out.push(ph('feel', feelT + Math.min(0.8, Math.max(0, w.settle)), 'hold', 'hold', { feel: pointAt(P, { antennate: 0 }), ...accent }));
  const seatName = w.byHand ? 'close' : 'seat';
  out.push(ph(seatName, Math.max(HC.stepMin, HC.seatK / k), 'mj', at(HC.land), { breath: { rate: 1, amp: 1.1 }, voice: 'purr', light: 1.15, feel: pointAt(P, { antennate: 0.06 }) }));
  const gv = gov(out, c, w.byHand ? 'deliberate' : 'creep', { latency: 'reflex', wince: 'pursue', feel: 'reflex' });
  const seat = gv.findIndex((p) => p.name === seatName);
  // 等到下一口呼气开始（φ = 0.5 起是呼气），收紧落在呼气上
  const T = holdPeriod(w.period);
  const before = gv.reduce((a, p) => a + p.dur, 0);
  const phiAt = (w.phi + before / T) % 1;
  const ready = (((0.5 - phiAt) % 1) + 1) % 1;
  const rest: Phase[] = [ph('ready', ready * T, 'hold', 'hold', { feel: pointAt(P, { antennate: 0.06 }) })];
  for (let i = 1; i <= w.n; i++) {
    rest.push(
      ph(`cinch${i}`, 0.4 * T, 'mj', at(HC.land + HC.cinchStep * i), { breath: { rate: 1, amp: 1.1 }, voice: 'purr', light: 1.15 }),
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
  /** 事件叠加（mm，攥 + / 让 −；小动作） */
  evMm: number;
}

/** 此刻挤压相位 0–1（1 = 最紧；指令提前 0.45 s，看得见的最紧落在呼气末） */
export function squeezePhase(phi: number, period: number): number {
  return (1 + Math.cos(TAU * (phi + HC.holdLead / holdPeriod(period)))) / 2;
}

/** 握持控制器：随呼吸一紧一松（满足了幅度慢慢减小）、压过手 8 mm、跟着手走。纯函数 */
export function holdDrive(o: HoldIn): Pose {
  const A = squeezeAmp(o.breathAmp);
  const half = Math.min(A / 2, HC.holdCenter - HC.winLo, HC.winHi - HC.holdCenter);
  const fade = 1 - HC.fade1 + HC.fade1 * Math.exp(-o.breaths / HC.fadeN);
  const sq = squeezePhase(o.phi, o.period);
  const mm = clamp(HC.holdCenter + 2 * half * fade * (sq - 0.5) + o.evMm, HC.winLo, HC.winHi);
  const D = (o.Dref + mm / gainAt(o.g.r, o.Dref)) * o.grip;
  return flatH(D, o.dirRef);
}

/** 握着时的提示（呼吸放慢一点、加深一点，呼气时哼，灯稳亮；触须按性格） */
export function holdCue(T: Temper): Cues {
  const f: Cues['feel'] =
    T === 'warm'
      ? pointAt(T, { antennate: 0.12 })
      : T === 'calm'
        ? feel('still')
        : T === 'avoidant'
          ? feel('still', { quiver: 0.03 })
          : pointAt(T, { antennate: 0, quiver: 0.03 });
  return { breath: { rate: 1, period: 1.15, amp: 1.1 }, voice: 'hum', light: 1.1, feel: f };
}

/**
 * 握着时手的小动静与 ⑥ 小动作：[起 s, 回 s, mm]，时长 = 起 + 回——攥一下（抓握反射）· 让（往外拉时，随时可拔出）·
 * 拽一下 · 松（想抽出来）。摩挲另算（一个呼吸周期里 ±2 mm 1.5 个波），屏气定住只停呼吸 0.5 s、不动臂
 */
const HOLD_BUMP = new Map<string, readonly [number, number, number]>([
  ['squeeze', [0.25, 0.8, 3]],
  ['give', [0.4, 1.2, -3]],
  ['tug', [0.25, 0.5, 2]],
  ['loosen', [0.5, 1, -2]],
]);
/** 握持里按呼吸换算的地方，周期不短于它（s） */
const HOLD_PERIOD_MIN = 0.5;
const holdPeriod = (period: number): number => Math.max(HOLD_PERIOD_MIN, period);

/** 叠在挤压上的毫米（τ = 事件开始以来的秒数；0 之外的时刻返回 0） */
export function holdEventMm(kind: string, tau: number, period: number): number {
  if (tau < 0) return 0;
  const b = HOLD_BUMP.get(kind);
  if (b) {
    const [up, down, mm] = b;
    if (tau < up) return mm * smoothstep(tau / up);
    if (tau < up + down) return mm * (1 - smoothstep((tau - up) / down));
    return 0;
  }
  if (kind !== 'palpate') return 0;
  const T = holdPeriod(period);
  const dur = 1.5 * T;
  if (tau > dur) return 0;
  const win = Math.sin((Math.PI * tau) / dur);
  return 2 * win * Math.sin((TAU * tau) / T);
}
/** 小动作的时长（s）：过了就把事件清掉 */
export function holdEventDur(kind: string, period: number): number {
  const b = HOLD_BUMP.get(kind);
  if (b) return b[0] + b[1];
  if (kind === 'palpate') return 1.5 * holdPeriod(period);
  return kind === 'freeze' ? 0.5 : 0;
}
const smoothstep = smooth01;

// ------------------------------------------------------------------ 脱手

export type ChaseBeat = 'let' | 'lunge' | 'creep' | 'grope' | 'letSlow' | 'extend' | 'linger' | 'sag';

/** 追的拍序：抽手快 = 扑过去（let → lunge → creep → grope）；慢 = 伸过去送一下（letSlow → extend → linger → sag） */
export const chasePlan = (fast: boolean): ChaseBeat[] => (fast ? ['let', 'lunge', 'creep', 'grope'] : ['letSlow', 'extend', 'linger', 'sag']);

/** 叹一口气、慢慢垂回静息（追没追上、搜寻搜完的收尾） */
const sagPhase = (k: number): Phase => ph('sag', 1.4 / k, 'mj', 'rest', { breath: { rate: 1, sigh: true }, voice: 'fall' });

/** 追里的一拍（拍开始时按手此刻的读数建表——「朝手此刻的读数」，不是脱手那一刻的旧位置） */
export function buildChaseBeat(c: BuildCtx, g: HandGeom, beat: ChaseBeat, canReach: boolean): Phase[] {
  const P = c.temper;
  const k = c.k;
  switch (beat) {
    case 'let':
      return [ph('let', HC.chaseLet, 'hold', 'hold', { breath: { rate: 0 }, feel: pointAt(P, { antennate: 0 }), voice: 'mute' })];
    case 'lunge': {
      const to = canReach ? atMm(g, -(g.touch + HC.nearGap)) : flatH(0.06, g.dir);
      return gov(
        [ph('lunge', 0.5 / k, 'mj', to, { path: 'line', breath: { rate: 1, period: 0.7, amp: 1.2 }, voice: 'query', feel: pointAt(P, { antennate: 0.15 }), light: 1.2 })],
        c,
        'pursue',
      );
    }
    case 'creep':
      return gov([ph('creep', 0.6 / k, 'mj', atMm(g, HC.land), { feel: pointAt(P), voice: 'mute' })], c, 'creep');
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
      return gov([sagPhase(k)], c, 'spont');
  }
}

/** 放弃：沉静、回避愣一下 → 松 → 收回自己一侧（回避之后侧身躲）；乱序随机生硬落回 */
export function buildGiveUp(c: BuildCtx, awayDir: number): Phase[] {
  const k = c.k;
  if (c.temper === 'calm' || c.temper === 'avoidant') {
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
  return gov([dropPhase()], c, 'pursue');
}

// ------------------------------------------------------------------ 抓空与搜寻

export type EmptyKind = 'regrab' | 'palpate' | 'open' | 'drop';

/** 抓空之前的一拍（按性格；乱序随机由引擎用表情子流抽）+ 放开回静息 */
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
      const amp = c.cur.deep > 0 ? 0.04 : Math.min(0.04, Math.max(0, D_FLAT_MAX - dOf(c.cur)));
      out.push(ph('palpate', 2, 'hold', 'hold', { osc: { amp: amp / D_SPAN, hz: 0.5, decay: 0 }, voice: 'query', feel: feel('point', { antennate: 0.2 }) }));
      break;
    }
    case 'open':
      out.push(ph('open', 2 / k, 'in', addD(c.cur, -0.4 * dOf(c.cur)), { breath: { rate: 1, sigh: true }, voice: 'mute' }));
      break;
    default:
      out.push(ph('drop', 0.5, 'lin', 'rest', { path: 'line', breath: { rate: 1, sigh: true } }));
      return gov(out, c, 'pursue');
  }
  out.push(ph('unfurl', 1.5 / k, 'mj', 'rest', { breath: { rate: 1 } }));
  return gov(out, c, 'deliberate', { regrab: 'pursue', palpate: 'reflex' });
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
      ph(`cast${i + 1}`, (0.9 + 0.3 * i) / k, 'mj', flatH(Math.min(D_FLAT_MAX - 0.04, last.D + legD[i]), last.dir + legA[i]), {
        breath: { rate: 1, period: 0.85 },
        feel: feel('free', { antennate: 0.15 }),
        voice: i === 0 ? 'query' : undefined,
      }),
      ph(`probe${i + 1}`, 0.5, 'hold', 'hold', { osc: { amp: 0.04 / D_SPAN, hz: 0.5, decay: 0 } }),
    );
  }
  out.push(sagPhase(k));
  return gov(out, c, 'deliberate', { sag: 'spont' });
}

// ------------------------------------------------------------------ 躲（侧身警戒）与偷看

/** 从 a 往 b 转，最多转 max（rad） */
const turnToward = (a: number, b: number, max: number): number => {
  const d = wrapPi(b - a);
  return wrapPi(a + Math.sign(d) * Math.min(Math.abs(d), max));
};

/**
 * 躲的姿态：背着手弯，越近越缩（0.12–0.31）。fear = ⑬ 的躲那一半 N：再紧 0.12·N·close（到 0.43）、弯向往下（腱轴 0 的
 * 反向，臂梢朝下）压 25°·N·close——往下藏。fear = 0 与改前逐位相同
 */
export const avoidPose = (close: number, awayDir: number, fear = 0): Pose => {
  const c = clamp(close, 0, 1);
  const f = clamp(fear, 0, 1);
  return flatH(0.12 + 0.19 * c + HC.avoidTight * f * c, f > 0 ? turnToward(awayDir, Math.PI, HC.avoidTuck * f * c) : awayDir);
};

/**
 * 手离臂多远（mm，粗估）：手在差动平面上的位置（读数）与臂此刻的姿态之差 × 手那一点上的接触灵敏度，再加上手超出臂长的那一截。
 * 只拿来比大小（在不在变近、近不近），不是几何真值
 */
export function handArmGap(aimBend: number, aimDir: number, aimDist: number, pose: Pose): number {
  const Dh = handD(Math.max(0, aimBend));
  const dp = pathLen(pose, { bend: Dh / D_SPAN, dir: aimDir, deep: 0 }, 'line');
  return Math.hypot(dp * gainAt(aimDist, Dh), Math.max(0, aimDist - HC.armL));
}

/**
 * 收到躲的姿态。first = 看见手、决定躲：定住（0.3 + 0.1τ）→ 慢慢收（身体侧过去由引擎转）；again = 手挪了、再收一次；
 * snap = 偷看时手动了、缩回去（2026-10-17 并进再收：同一个终点，只是快一档、带一声咂——观众学得会「别动它，它才敢看」）。
 * 怕得越厉害收得越快、越紧。只有回避与乱序随机会躲（不朝人时背过去的两型），收的时候触须都发抖
 */
export function buildShrink(c: BuildCtx, close: number, awayDir: number, mode: 'first' | 'again' | 'snap' = 'first', hold = 0): Phase[] {
  const f = clamp(c.fear ?? 0, 0, 1);
  const out: Phase[] = [];
  if (mode === 'first') out.push(ph('freeze', byTau(HC.avoidFreeze, c.tau), 'hold', 'hold', { breath: { rate: 0 }, feel: feel('tuck'), light: 0.9, voice: 'mute' }));
  const snap = mode === 'snap';
  out.push(
    ph(mode === 'first' ? 'shrink' : 'reshrink', snap ? 0.4 : (1.2 - HC.shrinkFast * f) / c.k, 'mj', avoidPose(close, awayDir, f), {
      path: 'line',
      breath: { rate: 1, amp: 0.6, push: 0.04 },
      feel: feel('tuck', { quiver: 0.04 }),
      voice: snap ? 'tsk' : 'mute',
      light: 0.9,
    }),
  );
  if (hold > 0) out.push(ph('hold', hold, 'hold', 'hold', { feel: feel('tuck'), voice: 'mute' }));
  return gov(out, c, snap || f > 0.5 ? 'pursue' : 'deliberate', { freeze: 'reflex', hold: 'reflex' });
}

/**
 * 躲开（手在逼近）：臂快速甩到背着手那边、比躲的姿态再紧一截，定住屏着气；身体同时再侧开一点（引擎转）。
 * 与热情型扑手用同一个最快档（strike），一个扑向手、一个从手边弹开。size = 份量 σ（0–1，见 HC.dodgeR0 注释）：
 * 2026-10-17 以前分成躲开（怕的时候，σ = N）与一缩（手快速逼近，+0.05、定 0.6 s），两者隔 0.3 s 交替触发、要靠「互不打断」打补丁
 */
export function buildDodge(c: BuildCtx, close: number, awayDir: number, size = clamp(c.fear ?? 0, 0, 1)): Phase[] {
  const f = clamp(c.fear ?? 0, 0, 1);
  const s = clamp(size, 0, 1);
  const to = flatH(dOf(avoidPose(close, awayDir, f)) + HC.dodgeD * (0.6 + 0.4 * s), awayDir);
  const breath = { rate: 1, push: 0.06 + 0.02 * s, amp: 0.5 - 0.1 * s };
  return gov(
    [
      ph('dodge', 0.25, 'mj', to, { path: 'line', breath, feel: feel('tuck', { quiver: 0.06 }), voice: 'mute', light: 0.9 }),
      ph('hold', 0.6 + 0.8 * s, 'hold', 'hold', { breath, feel: feel('tuck', { quiver: 0.04 }), voice: 'mute' }),
    ],
    c,
    'strike',
    { hold: 'reflex' },
  );
}

/** 偷看：触须先指过去 → 臂转回三成 → 看一会儿 → 收回。乱序随机突然瞥一眼（生硬） */
export function buildPeek(c: BuildCtx, g: HandGeom, close: number, awayDir: number): Phase[] {
  const f = clamp(c.fear ?? 0, 0, 1);
  const home = avoidPose(close, awayDir, f);
  const k = c.k;
  if (c.temper === 'random') {
    return gov(
      [
        ph('glance', 0.3, 'lin', flatH(dOf(home), lerpAngle(home.dir, g.dir, 0.4 * (1 - HC.peekLeanN * f))), { feel: pointAt('random', { antennate: 0 }), voice: 'mute' }),
        ph('look', 0.4, 'hold', 'hold', { feel: pointAt('random', { antennate: 0, quiver: 0.04 }) }),
        ph('snap', 0.4, 'lin', home, { path: 'line', feel: feel('tuck'), voice: 'tsk' }),
      ],
      c,
      'pursue',
    );
  }
  return gov(
    [
      ph('lean', 1.2 / k, 'mj', flatH(Math.max(0, dOf(home) - 0.05), lerpAngle(home.dir, g.dir, 0.3 * (1 - HC.peekLeanN * f))), { feel: pointAt(c.temper, { antennate: 0 }), breath: { rate: 0.3 }, voice: 'mute', light: 0.9 }),
      ph('look', HC.peekLook, 'hold', 'hold', { feel: pointAt(c.temper, { antennate: 0, quiver: 0.04 }), breath: { rate: 0.3 }, voice: 'mute' }),
      ph('back', 1.2 / k, 'mj', home, { feel: feel('tuck') }),
    ],
    c,
    'spont',
  );
}

/** 手走了：松一口气，回静息 */
export function buildRelief(c: BuildCtx): Phase[] {
  return gov([ph('relief', 1.5 / c.k, 'mj', 'rest', { breath: { rate: 1, sigh: true }, feel: feel('free') })], c, 'deliberate');
}

/**
 * 乱序随机被迎着的手碰到、⑤ 抽到负：往背着手那边缩回、定 0.5 s（之后侧身躲）。2026-10-19 起就是躲的「收」那一下
 *（snap，手就在臂上 close = 1）再定住——此前单写一段，只差呼吸推量与没传 fear，紧接着的躲又按 fear 收一次
 */
export const buildRecoil = (c: BuildCtx, awayDir: number): Phase[] => buildShrink(c, 1, awayDir, 'snap', 0.5);
