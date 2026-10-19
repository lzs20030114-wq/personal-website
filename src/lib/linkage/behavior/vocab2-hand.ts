/**
 * 迎手链的程序表（2026-10-08 第八批研究原型立、2026-10-17 随动作程序转为唯一的一套；轮回机器_触手与转向研究.md §9）。
 *
 * 用户问「除了惊跳，是不是还应该有顺应着人、往人手的方向凑、甚至缠绕的机制」。看见手以后：眼（触须）先到 →
 * 臂陪着（热情型一路跟着手走，其余一跳一停）→ 手停下才凑过去（热情型蹲一下再扑，其余直接伸过去）→ 碰到就缠上 →
 * 握着时跟着手慢慢走 → 手被抽走：热情追一次，其余放开 → 抓空就放开、按人格在原处找几次。不朝人的那一路（回避型、
 * 乱序随机抽到躲的回合）是侧过身、臂藏起来，手逼近就甩开。
 *
 * 2026-10-19 交互机制整合（作者：「不造新机制和新词，删除不易察觉的冗余，精简只剩观察者比较可见的机制」）删掉了：
 * 按迟钝度插值的十种等待、停半拍 / 瞄准 / 进退再进 / 愣住撤开、推两下 / 探身撑 / 前倾、缠的定住感觉与逐级收紧、
 * 握着时随呼吸一紧一松与各种小动作、追的两种拍序、抓空那一拍、躲的随怕的程度变化的十一个式子、偷看、呼一口气。
 *
 * 只管「一拍长什么样」：引擎（engine.ts 的迎手链）决定在什么时刻做哪一拍，这里按表解算成分段程序（programs.ts 执行）。
 * 臂的物理守则（研究笔记 §9.2，数字取自 Lab 1-3 求解器）：快 = 大，扑的总行程封顶 0.22（最浅惊跳 0.45 的一半）；
 * 臂会自己晃（周期 ≈ 1.45 s），每一步要么按档慢走、要么不短于一个周期；目标一律写成「手那一点上的毫米」。
 * 方向约定同引擎：弯向 0 = 臂梢朝上，左为正。
 */
import { PRESENCE_EDGES } from './events';
import type { Temper } from './persona';
import { type Cues, D_DEEP_SPAN, D_FLAT_MAX, D_MAX, D_SPAN, type FeelerPose, type Phase, type Pose, lerpPoseLine } from './programs';
import { type BuildCtx, PEAK, type Tier, V2, anticPose, dOf, govern, pathLen, ph, tierSpeed, unhook } from './vocab2';

const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;
const wrapPi = (a: number): number => a - TAU * Math.floor((a + Math.PI) / TAU);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** 手感常量（均待作者拍板） */
export const HC = {
  /** 臂长（mm，静息弦长；唯一出处——引擎直接读它，台架 ARM_GEOM.length 由守门测试核对） */
  armL: 357.5,
  /** 接触灵敏度 G(r, D) = k·clamp(r/L, 0.25, 1)^e·(1 − drop·min(D, 0.5))（mm / 差动） */
  gainK: 480,
  gainExp: 1.6,
  gainDrop: 0.75,
  /** 决定迎的那一下：触须先指过去、吸一口、一声上扬（秒）。看见本身已经等过一个反应时间 τ */
  take: 0.2,
  /** 第一跳只伸到「刚好碰到」的 0.55（先转方向、后伸长）；臂一步至少 0.7 s，跳完也停 0.7 s（一跳一停的周期 ≥ 1.4 s） */
  firstHop: 0.55,
  stepMin: 0.7,
  /** 跟的停距（mm）：碰到半径 + 20 + 0.6 s × 手速，封顶 130——跟的时候不蹭到手 */
  standGap: 20,
  standLag: 0.6,
  standCap: 130,
  /** 跳的门：目标误差（差动）超过 eps 才跳；超过 jump（手猛挪）不等停稳就从此刻重跳 */
  eps: 0.04,
  jump: 0.12,
  /**
   * 热情型不一跳一停，每一帧跟着手走（2026-10-19 作者：「热情型就得热情，跟着手走」）：指令按临界阻尼 ω 4 rad/s
   * 追向手旁（停在碰到半径 + standGap 处，不随手速退后），按读数速度往前看 0.4 s（封顶 0.05）
   */
  trackOmega: 4,
  leadT: 0.4,
  leadMax: 0.05,
  /** 凑：先停到碰到圈外 nearGap mm，再伸过去（或蹲一下扑） */
  nearGap: 14,
  /** 蹲：clamp(0.14 − 剩余行程, 0.04, 0.08)·花样；停稳 ≥ 0.18 s（≤ 0.5）。扑、伸都落在手上 +2 mm */
  cockBase: 0.14,
  cockMin: 0.04,
  cockMax: 0.08,
  cockedMin: 0.18,
  cockedMax: 0.5,
  strikeMax: 0.22,
  land: 2,
  /** 够得着：aimBend ≤ 1.41 且离基座 ≤ 0.98 臂长 */
  reachBend: 1.41,
  reachFar: 0.98,
  /** 凑上去没碰到：放下，手挪 60 mm 才再凑 */
  rearmMm: 60,
  /** 缠：一下贴上并压过手 holdCenter mm，时长 ≥ max(stepMin, seatK/k) */
  seatK: 0.6,
  holdCenter: 8,
  /** 握着跟手：差动按 τ 0.6 s 追、弯向 ≤ 0.3 rad/s；读数一步跳过 0.06 / 20° 视为被抽走、不跟 */
  followTau: 0.6,
  followRate: 0.3,
  jumpD: 0.06,
  jumpDir: 20 * DEG,
  /** 缠的程序走完交给握持控制器时的混合时长（s） */
  holdBlend: 1,
  /**
   * 手速（mm/s）：静 < vStill 15（凑、重新武装要手静着；躲的时候手一动就算逼近）· 慢 < vSlow 60（握着时牵着走；
   * 正在动的手从臂上蹭过去不缠）· 划过 > vSwipe 800（台架判碰到时划过去的不算 = HAND_MM.maxSpeed）
   */
  vStill: 15,
  vSlow: 60,
  vSwipe: 800,
  /** 追的缠到限位的兜底（s）：拍走完时引擎会缩到 +0.5 s，这里只防拍序意外卡住 */
  chaseCap: 20,
  /**
   * 躲：侧过身，手留在身侧 115°（视野 ±120° 以内：看得见手，不整个背过去）；臂背着手弯、往下压 25°，差动 0.4。
   * 手挪得此刻的臂离躲姿差过 reshrinkPose 就再收一次
   */
  avoidSide: 115 * DEG,
  avoidD: 0.4,
  avoidTuck: 25 * DEG,
  reshrinkPose: 0.06,
  /**
   * 躲开：手在逼近（0.25 s 内朝臂或机身过来）、手离臂 < 320 mm 或在近处、手在动——臂甩开再紧 0.08、定 1 s；两次之间 ≥ 0.35 s。
   * 320 = 10-19 整合前那条式子 120 + 200·N 在最怕时（N = 1）的值：整合时改成固定 120，回避型要等手几乎贴到臂才躲，
   * 「伸手够臂」被够到 62% → 86%；同日反查后定在 320（够到 80%，指针 = 手认人格 91% → 94%）
   */
  dodgeR0: 320,
  dodgeD: 0.08,
  dodgeHold: 1,
  dodgeGap: 0.35,
  /** 手走了（远于 DIST.far 持续 1 s，或离开画布）= 不再躲 */
  reliefT: 1,
  /** 放开后手不动：3 s 后再来一次（抓空后每 ⑨ 至多一次） */
  rearm: 3,
} as const;

/**
 * 手离机身（电机轴）的三档距离（mm）：摸壳 body 0.32 m（手在机身上方 = 在摸壳，迎的时候不转身、不去够）· 近 near 0.6 m ·
 * 远 far 1.5 m。近 / 远与在场档的边界同一个数（events.ts PRESENCE_EDGES）
 */
export const DIST = { body: 320, near: PRESENCE_EDGES.near * 1000, far: PRESENCE_EDGES.far * 1000 } as const;
const smooth01 = (x: number): number => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};
/** 手有多近：远 → 近从 0 到 1（⑬ 按手的那一份读它） */
export const nearness = (dist: number): number => 1 - smooth01((dist - DIST.near) / (DIST.far - DIST.near));

// ------------------------------------------------------------------ 几何

/** 接触灵敏度：臂在手那一点上每多一个差动走多少 mm（方案 3 标定，handReading 公式在这些点上误差 ≤ 0.025 差动） */
// 非整数次方写成 exp(k·log x)，不用 `**`（理由见 engine.golden.test.ts 的源码守门）
export function gainAt(r: number, D: number): number {
  return HC.gainK * Math.exp(HC.gainExp * Math.log(clamp(r / HC.armL, 0.25, 1))) * (1 - HC.gainDrop * Math.min(Math.max(D, 0), 0.5));
}

/** 离轴姿态：只用弯曲（超过 1 的部分由执行层的深缠行程给），封顶 0.48，不带深卷 */
export function flatH(D: number, dir: number): Pose {
  return { bend: clamp(D, 0, D_FLAT_MAX) / D_SPAN, dir: wrapPi(dir), deep: 0 };
}

/**
 * 规范表示（同一个差动，执行层给出同一组三腱）：0.48 以内只用平卷，超出 0.48 的那一截才记深卷。迎手链自己不用深卷，
 * 只剩惊跳留下的深卷会进到手链的程序里（收回途中）：0.48 以内一律记成平卷，执行层不再按它贴轴吸附
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

/** 够得着（按求解器实测定的判据：稍超出臂长的手不再「永远差一点」） */
export function reachable(aimBend: number, aimDist: number): boolean {
  return aimBend <= HC.reachBend && aimDist <= HC.reachFar * HC.armL;
}

// ------------------------------------------------------------------ 人格读法（均为推断）

export const standOf = (g: HandGeom): number => Math.min(HC.standCap, g.touch + HC.standGap + HC.standLag * g.v);
/** 扑只给快的人格（√k_v ≥ 1.2：热情型、快的乱序随机），而且衰老过半就不扑了 */
export const pounces = (c: BuildCtx): boolean => c.k >= V2.springK && c.ageU < 0.5;

/** 跳与凑时触须的「交替探」幅度（rad）：热情 0.15 · 乱序随机 0.06 · 沉静 / 回避 0 */
const antOf = (T: Temper): number => (T === 'warm' ? 0.15 : T === 'random' ? 0.06 : 0);
/** 指向手的触须提示：不写 side = 引擎按手的相对方位连续指（眼一直跟） */
const pointAt = (T: Temper, antennate = antOf(T)): Cues['feel'] => ({ pose: 'point', antennate });
const feel = (pose: FeelerPose): Cues['feel'] => ({ pose });

/** 按档把段拉长，再按段名改档；返回的段已就地改好 */
function gov(phases: Phase[], c: BuildCtx, tier: Tier, tiers?: Partial<Record<string, Tier>>): Phase[] {
  return govern(unhook(phases, c.cur, c.rest), c, tier, tiers);
}

/** 叹一口气、慢慢垂回静息（凑上去没碰到、搜寻搜完的收尾） */
const sagPhase = (k: number): Phase => ph('sag', 1.4 / k, 'mj', 'rest', { breath: { rate: 1, sigh: true }, voice: 'fall' });

// ------------------------------------------------------------------ 看见 · 陪着

/** 跳的一步：shift（≥ 0.7 s，按档）+ fixate（停 0.7 s 起，最多再等 1 s 让臂停稳） */
function hopPhases(c: BuildCtx, to: Pose, first = false): Phase[] {
  const P = c.temper;
  const breath: Cues['breath'] = { rate: 1, period: P === 'warm' ? 0.75 : 0.85, amp: 1.1 };
  const osc = dOf(to) <= 0.27 ? { amp: 0.015 / D_SPAN, hz: 0.35, decay: 0 } : undefined;
  const out: Phase[] = [];
  if (first) {
    // 先「看」：吸一口、放慢、触须先指过去、一声上扬；臂还不动
    out.push(ph('take', HC.take, 'hold', 'hold', { breath: { rate: 0.4, amp: 1.15 }, feel: pointAt(P), voice: 'query', light: 1.15 }));
    if (P === 'warm') return gov(out, c, 'normal', { take: 'reflex' });
  }
  out.push(
    ph(first ? 'firstHop' : 'shift', HC.stepMin, P === 'random' ? 'lin' : 'mj', to, { breath, feel: pointAt(P), light: 1.1 }),
    ph('fixate', HC.stepMin + 1, 'hold', 'hold', { breath, feel: pointAt(P), light: 1.1, osc }),
  );
  return gov(out, c, 'normal', { take: 'reflex', fixate: 'reflex' });
}

/** 跟的站位：停在离手「碰到半径 + 20 + 0.6 s × 手速」mm 处 */
export function standPose(g: HandGeom): Pose {
  return atMm(g, -standOf(g));
}

/** 一跳一停的目标（热情型不跳，见 trackTarget） */
export const hopTarget = (g: HandGeom): Pose => standPose(g);

/**
 * 热情型每一帧追的目标：手旁碰到半径 + standGap 处（不随手速退后），再往手动的方向前看 lead
 *（= 读数速度 × leadT，差动平面，引擎给，已封顶 leadMax）。前看不超过这一点差动的一半：离手近、弯得浅时
 * 前看会盖过手的方向，臂甩过头（手晃 ±34° 时臂到 ±57°）
 */
export function trackTarget(g: HandGeom, lead: { x: number; y: number }): Pose {
  const st = atMm(g, -(g.touch + HC.standGap));
  const L = Math.hypot(lead.x, lead.y);
  const k = L > 1e-9 ? Math.min(1, (0.5 * dOf(st)) / L) : 0;
  const x = dOf(st) * Math.cos(st.dir) + lead.x * k;
  const y = dOf(st) * Math.sin(st.dir) + lead.y * k;
  const D = Math.hypot(x, y);
  return flatH(D, D > 1e-9 ? Math.atan2(y, x) : st.dir);
}

/** 看见手、决定迎：先看一眼 → 第一跳（先转方向：只伸到刚好碰到的 0.55）→ 停。热情型只有那一眼，之后由引擎每一帧跟 */
export function buildTake(c: BuildCtx, g: HandGeom): Phase[] {
  const st = standPose(g);
  return hopPhases(c, flatH(Math.min(dOf(st), HC.firstHop * g.Dh), g.dir), true);
}

/** 陪着手的一跳（热情型不用） */
export function buildHop(c: BuildCtx, g: HandGeom): Phase[] {
  return hopPhases(c, hopTarget(g));
}

// ------------------------------------------------------------------ 凑

export type ApproachBeat = 'transport' | 'crouch' | 'cocked' | 'pounce' | 'reach';

/**
 * 凑的拍序（引擎照这个顺序一拍一拍起；每拍之间有门）：热情 / 快的乱序随机（扑得下）= 靠近 → 蹲 → 蓄住 → 扑；
 * 其余（以及扑不下的）= 靠近 → 伸过去。走完没碰到就放下（引擎），手挪了才再凑
 */
export function approachPlan(c: BuildCtx, g: HandGeom): ApproachBeat[] {
  const P = c.temper;
  if ((P === 'warm' || P === 'random') && pounces(c) && pounceFits(c, g)) return ['transport', 'crouch', 'cocked', 'pounce'];
  return ['transport', 'reach'];
}

/** 剩余行程（靠近停下的位置到手）与蹲的大小；扑的总行程 = 两者之和，> 0.22 就不扑（臂根附近的手行程装不下） */
export function pounceGeom(c: BuildCtx, g: HandGeom): { gap: number; cock: number; S: number } {
  const gap = (g.touch + HC.nearGap) / gainAt(g.r, g.Dh);
  const cock = clamp(HC.cockBase - gap, HC.cockMin, HC.cockMax) * (1 - c.ageU);
  return { gap, cock, S: gap + cock };
}
export const pounceFits = (c: BuildCtx, g: HandGeom): boolean => pounceGeom(c, g).S <= HC.strikeMax;

/** 凑里的一拍。返回的段已按档定时长；cocked 的段长是「最多等多久」，引擎在门过了就提前进下一拍 */
export function buildApproachBeat(c: BuildCtx, g: HandGeom, beat: ApproachBeat): Phase[] {
  const P = c.temper;
  const k = c.k;
  const lin = P === 'random' ? 'lin' : 'mj';
  switch (beat) {
    case 'transport':
      return gov(
        [ph('transport', 0.6 / k, lin, atMm(g, -(g.touch + HC.nearGap)), { breath: { rate: 1, period: 0.85, amp: 1.1 }, feel: pointAt(P), light: 1.1, voice: P === 'warm' ? 'query' : undefined })],
        c,
        'normal',
      );
    case 'crouch': {
      // 蹲：往回收一点（看得见的预备 0.04–0.08），吸一口、张开，一声上扬——「玩扑」的信号，不读作捕猎
      const { cock } = pounceGeom(c, g);
      const to = anticPose(c.cur, atMm(g, HC.land), cock);
      return gov([ph('crouch', 0.35 / k, 'mj', to, { path: 'line', breath: { rate: 1, amp: 1.2, push: -0.03 }, feel: pointAt(P), voice: 'query' })], c, 'normal');
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
      const dur = Math.max(0.2, (PEAK.out * S) / tierSpeed('fast', k));
      return [ph('pounce', dur, P === 'random' ? 'lin' : 'out', to, { path: 'line', breath: { rate: 0 }, feel: pointAt(P, 0), voice: 'mute', light: 1.15 })];
    }
    case 'reach':
      // 直接伸过去、轻轻落下（亲和接触的末段是减速轻落）
      return gov([ph('reach', 0.8 / k, lin, atMm(g, HC.land), { breath: { rate: 0.5 }, feel: pointAt(P, 0.08), voice: 'mute' })], c, 'normal');
  }
}

/** 凑上去没碰到：叹一口气、放下 */
export function buildSag(c: BuildCtx): Phase[] {
  return gov([sagPhase(c.k)], c, 'slow');
}

// ------------------------------------------------------------------ 碰到 → 缠

export interface WrapIn {
  /** 手伸过来碰的（接）还是臂伸过去碰到的（抓） */
  byHand: boolean;
  /** 基准差动（读数饱和时取碰到那一刻的差动） */
  Dref: number;
}

/**
 * 缠（抓握 WRAP）：一下贴上并压过手 holdCenter mm。返回各段与「贴上」那一段的下标——引擎在贴上做完且臂停稳的那一刻
 * 记 catchT（台架的张力开关此后才闭合 = 手指被卡住）
 */
export function buildWrap(c: BuildCtx, g: HandGeom, w: WrapIn): { phases: Phase[]; seat: number } {
  const seatName = w.byHand ? 'close' : 'seat';
  const phases = gov(
    [ph(seatName, Math.max(HC.stepMin, HC.seatK / c.k), 'mj', atMm(g, HC.holdCenter, w.Dref), { breath: { rate: 1, amp: 1.1 }, voice: 'purr', light: 1.15, feel: pointAt(c.temper, 0.06) })],
    c,
    'normal',
  );
  return { phases, seat: phases.findIndex((p) => p.name === seatName) };
}

/** 一串段走完后的姿态（'rest' 按此刻的静息估） */
export function endPose(phases: readonly Phase[], c: BuildCtx): Pose {
  let at = c.cur;
  for (const p of phases) at = p.arm === 'hold' ? at : p.arm === 'rest' ? c.rest : p.arm;
  return at;
}

// ------------------------------------------------------------------ 握（控制器，不是表）

export interface HoldIn {
  g: HandGeom;
  /** 跟手的差动与弯向（引擎每步按读数更新） */
  Dref: number;
  dirRef: number;
  /** 握力（衰老 / 死亡） */
  grip: number;
}

/** 握持：压过手 holdCenter mm、跟着手走。纯函数 */
export function holdDrive(o: HoldIn): Pose {
  return flatH((o.Dref + HC.holdCenter / gainAt(o.g.r, o.Dref)) * o.grip, o.dirRef);
}

/** 握着时的提示：呼吸放慢一点、加深一点，呼气时哼，灯稳亮，触须定住 */
export const HOLD_CUE: Cues = { breath: { rate: 1, period: 1.15, amp: 1.1 }, voice: 'hum', light: 1.1, feel: { pose: 'still' } };

// ------------------------------------------------------------------ 脱手

export type ChaseBeat = 'lunge' | 'creep';

/** 追的拍序：扑过去 → 摸过去 */
export const CHASE_PLAN: readonly ChaseBeat[] = ['lunge', 'creep'];

/** 追里的一拍（拍开始时按手此刻的读数建表——朝手此刻在哪，不是脱手那一刻的旧位置） */
export function buildChaseBeat(c: BuildCtx, g: HandGeom, beat: ChaseBeat, canReach: boolean): Phase[] {
  const P = c.temper;
  const k = c.k;
  if (beat === 'lunge') {
    const to = canReach ? atMm(g, -(g.touch + HC.nearGap)) : flatH(0.06, g.dir);
    return gov(
      [ph('lunge', 0.5 / k, 'mj', to, { path: 'line', breath: { rate: 1, period: 0.7, amp: 1.2 }, voice: 'query', feel: pointAt(P, 0.15), light: 1.2 })],
      c,
      'fast',
    );
  }
  return gov([ph('creep', 0.6 / k, 'mj', atMm(g, HC.land), { feel: pointAt(P), voice: 'mute' })], c, 'normal');
}

/** 放开（脱手不追、抓空）：叹一口气，慢慢回静息 */
export function buildGiveUp(c: BuildCtx): Phase[] {
  return gov([ph('release', 1.5 / c.k, 'mj', 'rest', { breath: { rate: 1, sigh: true }, voice: 'fall' })], c, 'normal');
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
        feel: { pose: 'free', antennate: 0.15 },
        voice: i === 0 ? 'query' : undefined,
      }),
      ph(`probe${i + 1}`, 0.5, 'hold', 'hold', { osc: { amp: 0.04 / D_SPAN, hz: 0.5, decay: 0 } }),
    );
  }
  out.push(sagPhase(k));
  return gov(out, c, 'normal', { sag: 'slow' });
}

// ------------------------------------------------------------------ 躲

/** 从 a 往 b 转，最多转 max（rad） */
const turnToward = (a: number, b: number, max: number): number => {
  const d = wrapPi(b - a);
  return wrapPi(a + Math.sign(d) * Math.min(Math.abs(d), max));
};

/** 躲的姿态：背着手弯、往下压 25°（臂梢朝下藏），差动 0.4 */
export const avoidPose = (awayDir: number): Pose => flatH(HC.avoidD, turnToward(awayDir, Math.PI, HC.avoidTuck));

/**
 * 手离臂多远（mm，粗估）：手在差动平面上的位置（读数）与臂此刻的姿态之差 × 手那一点上的接触灵敏度，再加上手超出臂长的那一截。
 * 只拿来比大小（在不在变近、近不近），不是几何真值
 */
export function handArmGap(aimBend: number, aimDir: number, aimDist: number, pose: Pose): number {
  const Dh = handD(Math.max(0, aimBend));
  const dp = pathLen(pose, { bend: Dh / D_SPAN, dir: aimDir, deep: 0 }, 'line');
  return Math.hypot(dp * gainAt(aimDist, Dh), Math.max(0, aimDist - HC.armL));
}

/** 收到躲的姿态（看见手决定躲，或手挪了再收一次）：呼吸变浅、触须收起、不出声；身体侧过去由引擎转 */
export function buildShrink(c: BuildCtx, awayDir: number): Phase[] {
  return gov(
    [ph('shrink', 1.2 / c.k, 'mj', avoidPose(awayDir), { path: 'line', breath: { rate: 1, amp: 0.6, push: 0.04 }, feel: feel('tuck'), voice: 'mute', light: 0.9 })],
    c,
    'normal',
  );
}

/** 躲开（手在逼近）：臂快速甩到背着手那边、比躲的姿态再紧一截，定住屏着气。与热情型扑手同一个快档 */
export function buildDodge(c: BuildCtx, awayDir: number): Phase[] {
  const to = flatH(HC.avoidD + HC.dodgeD, awayDir);
  const breath = { rate: 1, push: 0.07, amp: 0.45 };
  return gov(
    [
      ph('dodge', 0.25, 'mj', to, { path: 'line', breath, feel: feel('tuck'), voice: 'mute', light: 0.9 }),
      ph('hold', HC.dodgeHold, 'hold', 'hold', { breath, feel: feel('tuck'), voice: 'mute' }),
    ],
    c,
    'fast',
    { hold: 'reflex' },
  );
}
