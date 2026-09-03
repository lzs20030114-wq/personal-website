/**
 * 项目二 · 方形环的第三种编制「捏分」——**一次循环 · 变高**（Lab.14）——纯数据 + 纯几何，零 DOM。
 *
 * 两轮拍板叠在一起：
 * - 2026-09-02 上午「一次循环优先，厚度让路」——一条边上是双平台，绕到对面变成整块，一圈一个来回
 *   （四次循环那版见 git caa8a77 之前；四次循环是方形三个方位类天然给的排法，一次循环要面类在
 *   同一个挑出上既做出整块又做出满裂）。
 * - 2026-09-02 下午「把这个做好了的拉高，上下两个板之间有充足的空间」（草图：缝 ≈100px）
 *   ⇒ 用户拍板**变高**：台高钉死、缝张开、总高随级别涨——Lab.12/13 原来的捏分读法；
 *   整块那边是两片台合成的薄块（32 高），上板沿一圈从贴着下板升到缝顶。
 *
 * ## 为什么恒高做不到这么高的缝（探针实测，缝 100）
 *
 * 恒高读法整圈箱高 = 2·台高 + 缝 = 132，整块那条边是同样高的实心箱；而实心箱必须
 * 「深 ≥ 1.17 × 高」（`SQUARE.E_MAX`：箱高一大、缓冲富余就超上限、折叠体浮起来）⇒ 面类挑出
 * ≥ 151 ⇒ 边长 ≈358px（平档 169）、带子 ≥ 480 节。变高读法整块那边只有 32 高，
 * 挑出 72 起就干净；双平台那条边（两种读法相同）在挑出 78 起干净。
 *
 * ## 深缝档在高箱上成形期翻折——顶/底面排整齐
 *
 * 台高 16、缝 100 下角类的 L4–L9 起初一个干净候选都没有：终态全对（锁定全满、剪影Δ 2、端面直），
 * 坏在 step 400 前后**顶面那片（轴嘴→面角）整片翻进缝区**打成几十节的环（角 L6 实测 91 节），
 * 之后又自己解开——是瞬态。吸引近程门救不了（护栏本有 120px 的绝对上限 `D_ACT`，箱高 113 时
 * 2.5 倍门限早已超过它）；去折痕 / 限速也无效。**顶/底面排整齐**（`alignRuns` 加两段
 * [轴嘴, 面角]，与缝壁那两段同一治法——排布是位置机制不是形态机制）把环压到 0、锁定不变，
 * 成形帧从头到尾都是「一个逐挡长深的锯齿箱」。
 *
 * ## 对位：下板齐平（不是缝心齐平）
 *
 * 草图画的是下板留在原位、上板拉高。下板底面离下缘 = `2(tail + ISO) + 0.6·下垫 + 下侧间隙`，
 * 下侧间隙 = (自由段芯跨 − 结构高)/2 由缓冲料撑着、逐级不同（3–45px），故把配平垫改成
 * **不对称**：下垫补齐到全员最大间隙，其余全放顶端 ⇒ 终态下板底面全员同高（一阶；成形中段
 * 各级芯跨随 r 各自缩，不齐，终态才并回来）。缝心/顶板则随级别升：顶板 = 下板 + 2·台高 + w(t)。
 *
 * ## 三条如实带着的账
 *
 * 1. **这一编制自己的带长**（`SQSPLIT_BAND`，平档/起伏仍是 `SQUARE.BAND`）：深缝档的自由段
 *    比平档长一倍多，塞不进 305；换编制时天花不动、平台落得更低，台架用 `pivotY` 跟着换枢轴。
 * 2. **方形比平档大**：面类挑出 ≈88（平档 56）⇒ 边长 ≈235（平档 169）；4×4 阵列的格距
 *    按平档定（207）装不下，这一编制的阵列用自己的格距。
 * 3. **外缘偏差 / 对位散布**按实测钉住（见守门）。
 */
import { SKIN_ROOT_FIX, type SkinBond, type SkinPanel, type SkinSeg, type SkinSpec, type SkinUnitOpts } from './skin-unit';
import { skinSiteOpts, SKIN_UNITS } from './skin-data';
import {
  SQUARE, SQUARE_RUNGS, squareAngle, squareBuffer, squareClassOf,
  squareFree, squareLadder, squarePw,
} from './skin-square';
import type { RingUnitDef } from './skin-ring';

const STEPPED = SKIN_UNITS.find((d) => d.key === 'stepped')!;

export const SQSPLIT = {
  /** 台高（两片台各 16）：整块那一级 = 2·台高 = 32；端面板半跨 = 8 节精确整数 */
  LOBE: 16,
  /** 终态缝宽（草图量下来 ≈100） */
  W_END: 100,
  /**
   * **这一编制自己的带子分配**（平档 F_TOT 133 / lead 70 / tail 15 在 305 节上）。
   * 自由段总量 = 顶垫 + 结构 + 下垫，要装得下最长的深缝结构 + 它的下垫：
   * 角 L8 的结构 361 节（它的下侧间隙 44.9 是全员最大 ⇒ 下垫 0）⇒ **361**（奇数：结构恒奇、垫要整数）。
   */
  F_TOT: 361,
  LEAD: 8,
  /**
   * 尾段：定下板离下缘的高度——下板底面 = 2(tail+ISO) + 下侧间隙最大值（见 SQSPLIT_FLOOR）。
   * 角 L8 的下侧间隙 44.9 是全员最大（深箱、缓冲 26），它下面塞不进垫；尾段只能退到下限 5，
   * 下板底面 = 42 + 44.9 ≈ 87，比平档平台的底面（83.6）高 3px。带长 = 8 + 32 + 361 + 5 = **406**。
   */
  TAIL: 5,
  /** 吸引近程门（本族实测 2.5；箱高 > 48 后被 D_ACT 封顶、实际不起作用，留着不改口径） */
  ATT_NEAR: 2.5,
  /** 缝壁键的节距 */
  WALL_STEP: 2,
  /** 双平台那条边：边的序号，边心方位角 = POLE·90° */
  POLE: 1,
} as const;

/** 这一编制自己的带长（节） */
export const SQSPLIT_BAND = SQSPLIT.LEAD + 2 * SQUARE.ISO + SQSPLIT.F_TOT + SQSPLIT.TAIL;

/** 十级形态位置（捏分族原式） */
export const SQSPLIT_T: readonly number[] = [0, 0.108, 0.254, 0.397, 0.523, 0.638, 0.741, 0.834, 0.92, 1];

/** 十对位置的方位类（从双平台边心往对边数）：面 边 角 边 面 │ 面 边 角 边 面 */
export const SQSPLIT_PAIR_CLASS: readonly number[] = [0, 1, 2, 1, 0, 0, 1, 2, 1, 0];

/**
 * 十对位置的级（j=0 双平台边 … j=9 整块边）：9 9 │ 8 │ 7 6 5 4 │ 3 │ 1 0。
 * 顶/底面排整齐之后三类九级全部做得出（L2 除外，三类候选全零），十个槽位放九级：
 * 多出的那格给了双平台那条边旁边的两条边（j=1 也是 L9）——用户的原话是「一条边上是双平台」，
 * 四条全裂读得更像一条边；整块那边两条实心 + 相邻一颗只有 6px 的小凹（L1）。
 * 唯一的跳级 L3→L1 是 L2 不可用给的。
 */
export const SQSPLIT_SCHEDULE: readonly number[] = [9, 9, 8, 7, 6, 5, 4, 3, 1, 0];

/** 形态时间表：缝宽张得快 · 缝深退得稳 · 缝尖宽/缝嘴宽 */
export const sqSplitSeamW = (t: number, wEnd: number = SQSPLIT.W_END): number => wEnd * Math.pow(t, 0.7);
export const sqSplitSink = (t: number, D: number): number => D * Math.pow(t, 1.2);
export const sqSplitTip = (t: number): number => 0.4 + 0.6 * t;
/** **变高**：总高 = 2·台高 + 缝宽（台高钉死，缝张开） */
export const sqSplitH = (t: number, wEnd: number = SQSPLIT.W_END): number => 2 * SQSPLIT.LOBE + sqSplitSeamW(t, wEnd);

/** 目标线（剪影Δ 的对照，以箱的中线为 y 原点） */
export function sqSplitTarget(t: number, D: number, wEnd: number = SQSPLIT.W_END, h: number = sqSplitH(t, wEnd)): [number, number][] {
  const w = sqSplitSeamW(t, wEnd);
  const dv = sqSplitSink(t, D);
  const wt = w * sqSplitTip(t);
  const y0 = -h / 2;
  const p: [number, number][] = [[0, y0], [D, y0]];
  if (w > 0.5) p.push([D, -w / 2], [D - dv, -wt / 2], [D - dv, wt / 2], [D, w / 2]);
  p.push([D, -y0], [0, -y0]);
  return p;
}

/** 缓冲：折得起来（余量 ≥ E_MIN）且住得下（间隙 ≥ G_MIN）；富余超 E_MAX 构造期抛错 */
export function sqSplitBuffer(M: number, h: number): number {
  for (let b = SQUARE.BUF_MIN; b < 60; b++) {
    const span = 1.2 * (M + b);
    const slack = 4 * b - (span - h);
    if (span - h < SQUARE.G_MIN || slack < SQUARE.E_MIN) continue;
    if (slack > SQUARE.E_MAX)
      throw new Error(`捏分档缓冲富余 ${slack.toFixed(1)} 超上限 ${SQUARE.E_MAX}（M=${M} H=${h}）：折叠体会沿轴浮起来`);
    return b;
  }
  throw new Error(`捏分档缓冲解不出来：M=${M} H=${h}`);
}

/** 梯挡：10 根，最内钉在端面板端点 f，最外 = M */
export function sqSplitLadder(f: number, M: number): number[] {
  return [...new Set(Array.from({ length: SQUARE_RUNGS }, (_, i) => Math.round(f + ((M - f) * i) / (SQUARE_RUNGS - 1))))];
}

/** 成形过程设计：逐挡长出 / 吸引近程门（与 Lab.12 定案同一套，门限按本族） */
const FORM: Pick<SkinUnitOpts, 'zipUp' | 'attNear' | 'attNearChains'> = {
  zipUp: [0],
  attNear: SQSPLIT.ATT_NEAR,
  attNearChains: [0],
};

export interface SqSplitTier {
  name: string;
  en: string;
  cls: 0 | 1 | 2;
  level: number;
  t: number;
  D?: number;
  boxD?: number;
  k?: number;
}

const CLS_NAME = ['面', '边', '角'] as const;
const CLS_EN = ['face', 'edge', 'corner'] as const;
const tier = (cls: 0 | 1 | 2, level: number, cfg: { D?: number; boxD?: number; k?: number }): SqSplitTier => ({
  name: `${CLS_NAME[cls]} L${level}`,
  en: `${CLS_EN[cls]} L${level}`,
  cls,
  level,
  t: SQSPLIT_T[level],
  ...cfg,
});

/**
 * ## 定案：十条引擎（真引擎标定，**冻结成表**——不是活扫掠）
 *
 * 标定法：`split-thick.mjs` 的 LOOP 模式 + `VARH=16 FACEALIGN=1`，按 方位类 × 级 扫 (boxD × tether 深)，
 * 判据 = 键全锁 · 打结每 10 步采 ≤6 · 顶底面水平度 <1.5 · |总高 − H(t)| <0.5 · 剪影Δ <6 ·
 * 端面竖直度 ≤1.5 · E_MAX · 满裂真裂到轴；再对时间表在半边长 a 上扫，每个 (类, 级) 取最接近目标
 * 挑出的候选，按 2·最大外缘偏差 + max 剪影Δ 选优（对位不进评分：下板齐平由不对称垫构造给）。
 *
 * a=115.8（目标 面 87.3 / 边 100.0 / 角 133.8）：
 *   面 L9  boxD82/D87.0   H 132.0  挑出 87.9（+0.65）  锁 35  结 0  Δ 0.31  缝底 0.0（真裂到轴）
 *   边 L9  boxD94/D99.1   H 132.0  挑出 100.0（+0.03） 锁 38  结 0  Δ 0.37  缝底 0.0
 *   角 L8  boxD128/D133.5 H 126.3  挑出 134.6（+0.87） 锁 43  结 0  Δ 2.60
 *   边 L7  boxD94/D99.0   H 120.1  挑出 100.1（+0.14） 锁 33  结 5  Δ 1.34
 *   面 L6  boxD82/D86.8   H 113.1  挑出 87.6（+0.37）  锁 28  结 0  Δ 1.09
 *   面 L5  boxD82/D86.6   H 105.0  挑出 87.2（−0.03）  锁 25  结 0  Δ 1.46
 *   边 L4  boxD94/D98.5   H 95.5   挑出 99.2（−0.78）  锁 24  结 0  Δ 2.53
 *   角 L3  boxD128/D132.8 H 84.4   挑出 133.4（−0.37） 锁 24  结 0  Δ 2.33
 *   边 L1  boxD98/D101.0  H 53.1   挑出 100.7（+0.72） 锁 14  结 0  Δ 1.90
 *   面 L0  k50            H 32.0   挑出 87.2（−0.04）  锁 10  结 0  Δ 0.01
 * 边长 **232px**（平档 169）· 外缘偏差 ≤0.87 · 十条锁定数之和 274 ⇒ 环上键 548。
 */
export const SQSPLIT_TIERS: readonly SqSplitTier[] = [
  tier(0, 9, { D: 87.0, boxD: 82 }),
  tier(1, 9, { D: 99.1, boxD: 94 }),
  tier(2, 8, { D: 133.5, boxD: 128 }),
  tier(1, 7, { D: 99.0, boxD: 94 }),
  tier(0, 6, { D: 86.8, boxD: 82 }),
  tier(0, 5, { D: 86.6, boxD: 82 }),
  tier(1, 4, { D: 98.5, boxD: 94 }),
  tier(2, 3, { D: 132.8, boxD: 128 }),
  tier(1, 1, { D: 101.0, boxD: 98 }),
  tier(0, 0, { k: 50 }),
];

/** 实测终态挑出（px），下标同 SQSPLIT_TIERS——守门逐位核对 */
export const SQSPLIT_REACH: readonly number[] = [87.9, 100.0, 134.6, 100.1, 87.6, 87.2, 99.2, 133.4, 100.7, 87.2];

/** 目标方形的半边长（与十条配置一起进的优化）：边长 232px */
export const SQSPLIT_HALF_SIDE = 115.8;
export function sqSplitHalfSide(): number {
  return SQSPLIT_HALF_SIDE;
}

export interface SqSplitStructure {
  seg: SkinSeg;
  /** 该级总高 */
  h: number;
  buf: number;
  M: number;
  /** 关键节点（相对结构段起点） */
  rel: { center: number; mouthA: number; mouthB: number; faceA: number; faceB: number; outA: number; outB: number };
  /** 需要绝对下标的选项，按结构段起点 base 生成 */
  optsAt: (base: number) => SkinUnitOpts;
}

/** 一档的结构段（不含两端分配）：t=0 走平档原谱那套梯子（只是箱矮），t>0 是刻缝箱 */
export function sqSplitStructure(tier: SqSplitTier, wEnd: number = SQSPLIT.W_END): SqSplitStructure {
  const h = sqSplitH(tier.t, wEnd);
  if (tier.t <= 0) {
    const k = tier.k!;
    const b = squareBuffer(k, h);
    const fs = squareFree(k, b);
    const c = (fs - 1) / 2;
    const pw = squarePw(h);
    const bonds: SkinBond[] = squareLadder(k, pw).map((q) => [c - q, c + q, h / 100]);
    return {
      seg: ['f', fs, bonds, [[c - pw, c + pw]]],
      h,
      buf: b,
      M: k,
      rel: { center: c, mouthA: c, mouthB: c, faceA: c - pw, faceB: c + pw, outA: c - k, outB: c + k },
      optsAt: () => ({ ...skinSiteOpts(STEPPED), ...FORM }),
    };
  }
  const w = sqSplitSeamW(tier.t, wEnd);
  const D = tier.D!;
  const dv = sqSplitSink(tier.t, D);
  const wt = w * sqSplitTip(tier.t);
  const lobe = SQSPLIT.LOBE; // = (h − w)/2，变高读法下恒等于台高
  const faceN = Math.round(lobe / 2);
  const a = Math.max(1, Math.round(wt / 4));
  const wallN = Math.max(1, Math.round(dv / 2));
  const boxD = tier.boxD ?? Math.round(D / 2) * 2;
  const m = a + wallN; // 缝角
  const f = m + faceN; // 面角
  const M = f + boxD / 2; // 轴嘴
  const buf = sqSplitBuffer(M, h);
  const fs = 2 * (M + buf) + 1;
  const c = buf + M;
  const wv = (w + wt) / 2;
  const crack: SkinBond[] = [[c - m, c + m, w / 100]];
  for (let k = m - SQSPLIT.WALL_STEP; k > a + 1; k -= SQSPLIT.WALL_STEP) crack.push([c - k, c + k, wv / 100]);
  crack.push([c - a, c + a, wt / 100]);
  const faceUp: SkinBond[] = [[c - f, c - m, lobe / 100]];
  const faceDn: SkinBond[] = [[c + m, c + f, lobe / 100]];
  const panels: SkinPanel[] = [[c - f, c - m], [c + m, c + f], [c - a, c + a]];
  const bonds: SkinBond[] = sqSplitLadder(f, M).map((k) => [c - k, c + k, h / 100]);
  const seg: SkinSeg = ['f', fs, bonds, panels, [crack, faceUp, faceDn]];
  const rTip = (D - dv) / 100;
  return {
    seg,
    h,
    buf,
    M,
    rel: { center: c, mouthA: c - m, mouthB: c + m, faceA: c - f, faceB: c + f, outA: c - M, outB: c + M },
    optsAt: (base: number): SkinUnitOpts => {
      const c0 = base + c;
      const tether: [number, number][] = [];
      for (let k = -a; k <= a; k++) tether.push([c0 + k, rTip]);
      for (let k = a + 1; k <= m; k++) {
        const r = rTip + ((k - a) * (D / 100 - rTip)) / wallN;
        tether.push([c0 + k, r], [c0 - k, r]);
      }
      const crease: [number, number, number][] = [];
      for (let j = c0 - m + 1; j < c0 + m; j++) {
        if (j < c0) crease.push([j, c0 - m, 0]);
        else if (j > c0) crease.push([j, c0 + m, 0]);
        else crease.push([j, c0 - m, 0], [j, c0 + m, 0]);
      }
      return {
        ...SKIN_ROOT_FIX,
        anchorEnd: true,
        boxSquare: true,
        ...FORM,
        sqChains: [0],
        coreTether: tether,
        coreTetherRel: crease,
        // 缝壁排整齐 + **顶/底面排整齐**（高箱成形期顶面翻折的对策，见文件头）
        alignRuns: [[c0 - m, c0 - a], [c0 + a, c0 + m], [c0 - M, c0 - f], [c0 + f, c0 + M]],
      };
    },
  };
}

const STRUCTS: readonly SqSplitStructure[] = SQSPLIT_TIERS.map((t) => sqSplitStructure(t));
/**
 * 结构与下侧 ISO 之间的轴向间隙（px，终态 r=0.3）：自由段的芯跨 0.6·(fs−1) 减去结构自己占的 h，
 * 对半分给上下两侧。缓冲料撑的就是这道缝——它**不是**像垫那样贴着芯折叠（0.6px/节），
 * 第一版按缓冲节数配垫，下板散布 30px，就是把这两件事混为一谈。
 */
export const sqSplitGapLower = (s: SqSplitStructure): number => (0.6 * (s.seg[1] - 1) - s.h) / 2;
/** 全员最大下侧间隙（角 L8）——它那一档下垫为 0，其余按差额补垫 */
export const SQSPLIT_GAP_MAX = Math.max(...STRUCTS.map(sqSplitGapLower));
/** 下板底面离下缘（构造式，终态）：2(tail+ISO) + 最大下侧间隙 */
export const SQSPLIT_FLOOR = 2 * (SQSPLIT.TAIL + SQUARE.ISO) + SQSPLIT_GAP_MAX;
/** 该级的下垫（节）：补齐到全员最大下侧间隙，垫贴芯折叠 0.6px/节 */
export const sqSplitPadB = (s: SqSplitStructure): number => Math.max(0, Math.round((SQSPLIT_GAP_MAX - sqSplitGapLower(s)) / 0.6));

/**
 * 八段谱（不对称配平垫）：[贴合 lead | 顶垫 | 隔离 ISO | 结构 | 隔离 ISO | 下垫 | 尾 tail]。
 * 下垫补齐各级下侧间隙的差额（下板齐平），顶垫吃掉其余；两段 ISO 隔离保住结构的动力学不受分配影响。
 */
export function sqSplitWrap(seg: SkinSeg, padB: number, fTotal: number = SQSPLIT.F_TOT, who = ''): { spec: SkinSpec; base: number } {
  const fs = seg[1];
  const padT = fTotal - fs - padB;
  if (padT < 0 || padB < 0) throw new Error(`捏分档自由段超预算：${who} 结构 ${fs} + 下垫 ${padB} > ${fTotal}`);
  const head: SkinSeg[] = padT > 0 ? [['g', SQSPLIT.LEAD], ['f', padT, []], ['g', SQUARE.ISO]] : [['g', SQSPLIT.LEAD + SQUARE.ISO]];
  const foot: SkinSeg[] = padB > 0 ? [['g', SQUARE.ISO], ['f', padB, []], ['g', SQSPLIT.TAIL]] : [['g', SQUARE.ISO + SQSPLIT.TAIL]];
  const spec: SkinSpec = [...head, seg, ...foot];
  return { spec, base: SQSPLIT.LEAD + padT + SQUARE.ISO };
}

/** 一档的谱 + 选项 + 关键节点下标 */
export function sqSplitBuild(tier: SqSplitTier, wEnd: number = SQSPLIT.W_END): {
  spec: SkinSpec;
  opts: SkinUnitOpts;
  lead: number;
  free: number;
  h: number;
  marks: { center: number; mouthA: number; mouthB: number; faceA: number; faceB: number; outA: number; outB: number };
} {
  const s = SQSPLIT_TIERS.includes(tier) ? STRUCTS[SQSPLIT_TIERS.indexOf(tier)] : sqSplitStructure(tier, wEnd);
  const padB = sqSplitPadB(s);
  const { spec, base } = sqSplitWrap(s.seg, padB, SQSPLIT.F_TOT, tier.name);
  const r = s.rel;
  return {
    spec,
    opts: s.optsAt(base),
    lead: base,
    free: s.seg[1],
    h: s.h,
    marks: {
      center: base + r.center, mouthA: base + r.mouthA, mouthB: base + r.mouthB,
      faceA: base + r.faceA, faceB: base + r.faceB, outA: base + r.outA, outB: base + r.outB,
    },
  };
}

/** 位置 i 属于哪一对（0 = 双平台那条边上的两条，9 = 整块那条边上的两条） */
export function sqSplitPairOf(i: number, count: number = SQUARE.COUNT): number {
  const pole = (SQSPLIT.POLE * Math.PI) / 2;
  let d = Math.abs(squareAngle(i, count) - pole) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return Math.round((d - Math.PI / count) / ((2 * Math.PI) / count));
}

/** 位置 i 用哪一条引擎（按 (方位类, 级) 查表） */
export function sqSplitTierAt(i: number, count: number = SQUARE.COUNT): number {
  const cls = squareClassOf(i, count);
  const level = SQSPLIT_SCHEDULE[sqSplitPairOf(i, count)];
  const idx = SQSPLIT_TIERS.findIndex((t) => t.cls === cls && t.level === level);
  if (idx < 0) throw new Error(`捏分一次循环：位置 ${i}（${CLS_NAME[cls]} L${level}）没有登记的引擎`);
  return idx;
}

/** 二十位编制：位置 → 引擎下标（一圈一个来回，关于极点轴镜像） */
export function buildSquareSplitOrder(count: number = SQUARE.COUNT): number[] {
  return Array.from({ length: count }, (_, i) => sqSplitTierAt(i, count));
}

/** 引擎定义（解 N 条摆二十处） */
export function buildSquareSplitUnits(tiers: readonly SqSplitTier[] = SQSPLIT_TIERS): RingUnitDef[] {
  return tiers.map((t) => {
    const b = sqSplitBuild(t);
    return {
      key: `sqsplit-${CLS_EN[t.cls]}-${t.level}`,
      zh: t.name,
      en: t.en,
      spec: b.spec,
      opts: b.opts,
      smooth: [3, 1] as const,
    };
  });
}

/** 二十个平台外缘点（俯视，世界 XZ）+ 对目标方形的偏差——守门用 */
export function sqSplitRim(
  reach: readonly number[] = SQSPLIT_REACH,
  count: number = SQUARE.COUNT,
): { x: number; z: number; dev: number }[] {
  const a = sqSplitHalfSide();
  return buildSquareSplitOrder(count).map((t, i) => {
    const th = squareAngle(i, count);
    const rr = SQUARE.RADIUS + reach[t];
    return { x: Math.cos(th) * rr, z: Math.sin(th) * rr, dev: rr - a / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th))) };
  });
}

/**
 * 这一编制的 4×4 格距：方形比平档大，平档那份（207）装不下。
 * 与 `squareCellPitch` 同一条规则：2 × 最紧外缘（面类方位）+ 缝。
 */
export function sqSplitCellPitch(gap: number): number {
  const tight = SQUARE.RADIUS + Math.max(...SQSPLIT_TIERS.map((t, i) => (t.cls === 0 ? SQSPLIT_REACH[i] : 0)));
  return 2 * tight + gap;
}
