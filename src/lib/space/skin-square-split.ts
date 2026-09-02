/**
 * 项目二 · 方形环的第三种编制「捏分」——**一次循环**（Lab.14）——纯数据 + 纯几何，零 DOM。
 *
 * 用户 2026-09-02 拍板：「一次循环优先，厚度让路」——一条边上是双平台，绕到对面变成整块，
 * 一圈一个来回。此前三轮加厚（36→68→76→92、带子 202→250，见 git b251a2b 及其前三条）
 * 做的都是**四次循环**：面 边 角 边 面 一个象限一个来回，那是方形三个方位类天然给的排法。
 *
 * ## 为什么四次循环是方形唯一「天然」的排法，而一次循环要付代价
 *
 * 二十条带绕一圈，方形的方位类图案是 [面 边 角 边 面]，**周期 5**；「一圈 N 个来回」的
 * 级别图案周期是 20/N。N=4 时周期恰好也是 5 ⇒ 每个方位类只承担一个级（面=满裂 / 边=半开 /
 * 角=实心箱），三档各自在自己的挑出上做自己那一级。N=1 时周期 20：相隔 10 位的两条带
 * 方位相同（10 是 5 的倍数）却处在来回的两端 ⇒ **同一个方位类要在同一个挑出上既做出整块、
 * 又做出满裂**。整块（L0）的挑出有下限（缓冲富余上限 `SQUARE.E_MAX`：挑得太浅缓冲会浮）、
 * 满裂（L9）的挑出有上限（材料账封顶），两者在同一箱高上要有交集才配得出来——
 * 实测**甜点在 H≈44**（H=52 时 L0 下限 60.6、H=40 时 L2/L3 的可行区间塌掉），
 * 且带子要 305 节（250 上任何箱高都配不出来）。
 *
 * ## 排法：极点放在边上（面极），不是角上
 *
 * 「一条边上是双平台，绕到对面变成整块」⇒ 镜像轴穿过两条对边的中点，二十位折成十对
 * `[面 边 角 边 面 │ 面 边 角 边 面]`（j = 0 是双平台那条边、j = 9 是整块那条边），每对一个级。
 * 面类承担两个极点（L9 与 L0）+ 两条侧边的中段；角类与边类接中间的过渡。
 * 上一轮曾按**角极**（极点落在对角的两个角位上）核算，三类的可行半边长区间差 2.4 才有交集
 * （a≈68、边长 136）；面极的交集本来就有，边长更大、余量也更大，且它才是字面的那句话。
 *
 * ## 时间表：为什么中间有跳级
 *
 * 十级 t（捏分族原式）里 **L2（t=.254）在挑出 > 47 的位置上做不出来**（浅而窄的槽：缝 5.7px
 * 宽却要切进 19% 的深度，成形失败——加长带子也救不了它，H=40/44/52 三个箱高上都一样），
 * 而三类的挑出都在 48 以上 ⇒ L2 一律不可用（本轮三类候选全零）。深缝那一端：角类挑出 ≈87
 * 只有 L6 的材料上限（87.3）够得着、L7/L8 候选零个；边类倒是 L8/L9 都做得出（上限 64.3/64.8）。
 * 所以时间表 9 8 │ 6 │ 5 5 4 │ 3 │ 1 1 0 的两个跳级都落在角位（L8→L6、L3→L1），
 * 见 `SQSPLIT_SCHEDULE`——这是这一族材料账给的，不是漏排。
 *
 * ## 三条如实带着的账
 *
 * 1. **平台比平档高约 20px**：这一编制自己的分配 F_TOT 259（平档 133），缝心离下缘
 *    `2(tail+ISO) + r(F−1)`，r 那一项随 F 长。四次循环那版只差 1.6。退回 205 试过：
 *    角 L6 的上限塌到 82.0、配不出来（见 SQSPLIT_TIERS 注）。
 * 2. **外缘偏差**：十条引擎里每条的挑出都是离散旋钮（角档一格 k ≈ 2px、缝档 boxD 一格 2px），
 *    三类要同时对上一个方形，实测最大 1.00px（四次循环那版 0.91）。
 * 3. **成形中段的对位散布**：级别越多、成形先后越参差；守门按实测钉住，不放宽族的线。
 */
import { SKIN_ROOT_FIX, type SkinBond, type SkinPanel, type SkinSeg, type SkinSpec, type SkinUnitOpts } from './skin-unit';
import { skinSiteOpts, SKIN_UNITS } from './skin-data';
import {
  SQUARE, SQUARE_RUNGS, squareAngle, squareBuffer, squareClassOf,
  squareFree, squarePw, squareSpec, squareWrap,
} from './skin-square';
import type { RingUnitDef } from './skin-ring';

const STEPPED = SKIN_UNITS.find((d) => d.key === 'stepped')!;

export const SQSPLIT = {
  /**
   * **箱高 44**（缝 15 · 两片台各 14.5）。四次循环那版是 92。
   * 一次循环把箱高压到这里的是「面类既要整块又要满裂」：整块的挑出下限随箱高涨
   * （H52 60.6 / H44 50.9 / H40 47.0），满裂的挑出上限随箱高降，两头对着走，
   * 交集在 H≈44 最宽；H=40 时中间那几级（L2/L3）的可行区间反而塌掉。
   */
  H: 44,
  /** 终态缝宽 = round(H/3)。缝宽换台高（`lobe = (H − w)/2`）⇒ 总高一圈恒定 */
  W_END: 15,
  /**
   * **这一编制自己的带子分配**：带 305 上取 F_TOT 259 / lead 8（贴合段下限）/ tail 6。
   * 代价：平台比平档高 ≈20px（`2(tail+ISO) + r(F−1)`，F 259 vs 133）。
   */
  F_TOT: 259,
  LEAD: 8,
  /** 吸引近程门。2.5 是本族实测值（Lab.12 的 1.5 会造出卷钩），见 §17.9.5 */
  ATT_NEAR: 2.5,
  /** 缝壁键的节距（0 = 只留嘴键与底键） */
  WALL_STEP: 2,
  /**
   * 双平台那条边：边的序号，边心方位角 = POLE·90°（0 = +X 侧，1 = +Z 侧 …）。
   * 纯外观量：默认轴测机位（yaw −0.62）下让裂开的那条边朝着相机。
   */
  POLE: 1,
} as const;

/** 十级形态位置（捏分族原式，与 Lab.12/13 同一张表） */
export const SQSPLIT_T: readonly number[] = [0, 0.108, 0.254, 0.397, 0.523, 0.638, 0.741, 0.834, 0.92, 1];

/**
 * 十对位置的方位类（从双平台边心往对边数）：面 边 角 边 面 │ 面 边 角 边 面。
 * 由几何直接给（`sqSplitPairOf` + `squareClassOf`），这里列出来是给时间表对照的。
 */
export const SQSPLIT_PAIR_CLASS: readonly number[] = [0, 1, 2, 1, 0, 0, 1, 2, 1, 0];

/**
 * 十对位置的级（j=0 双平台边 … j=9 整块边）：9 8 │ 6 │ 5 5 4 │ 3 │ 1 1 0。
 * 两个跳级都在角位：L8→L6（角类只到 L6——挑出 ≈87 时 L7/L8 的材料上限够不着，候选零个）
 * 与 L3→L1（L2 在挑出 > 47 的位置上成形失败，三类候选全零）。
 * 侧边那四条（边 面 面 边）取 5 5 4 3 而不是 5 4 4 3：t 的步距只剩两处为零（5 5 与 1 1），
 * 代价是多解一条引擎（10 条 vs 9 条）；两种时间表的外缘偏差与对位散布实测相差 0.1 级。
 */
export const SQSPLIT_SCHEDULE: readonly number[] = [9, 8, 6, 5, 5, 4, 3, 1, 1, 0];

/** 形态时间表（沿用捏分族原式）：缝宽张得快 · 缝深退得稳 · 缝尖宽/缝嘴宽 */
export const sqSplitSeamW = (t: number, wEnd: number = SQSPLIT.W_END): number => wEnd * Math.pow(t, 0.7);
export const sqSplitSink = (t: number, D: number): number => D * Math.pow(t, 1.2);
export const sqSplitTip = (t: number): number => 0.4 + 0.6 * t;
/** 缝宽换台高 ⇒ 2·台高 + 缝 = H 恒定 */
export const sqSplitLobe = (t: number, wEnd: number = SQSPLIT.W_END): number => (SQSPLIT.H - sqSplitSeamW(t, wEnd)) / 2;

/**
 * 目标线（剪影Δ 的对照，以箱的中线为 y 原点）：外顶面 → 端面 → 缝（嘴宽 w、尖宽 wt、退到 D−dv）
 * → 外底面。与线稿脚本 split-thick.mjs 的 `targetAt` 同一条——**定案后以这里为准**。
 */
export function sqSplitTarget(t: number, D: number, wEnd: number = SQSPLIT.W_END, h: number = SQSPLIT.H): [number, number][] {
  const w = sqSplitSeamW(t, wEnd);
  const dv = sqSplitSink(t, D);
  const wt = w * sqSplitTip(t);
  const y0 = -h / 2;
  const p: [number, number][] = [[0, y0], [D, y0]];
  if (w > 0.5) p.push([D, -w / 2], [D - dv, -wt / 2], [D - dv, wt / 2], [D, w / 2]);
  p.push([D, -y0], [0, -y0]);
  return p;
}

/**
 * 缓冲：折得起来（余量 ≥ E_MIN）且住得下（间隙 ≥ G_MIN）；富余超 E_MAX 构造期抛错。
 * 与 `squareBuffer` 是同一条规则，只是那边按 kMax 解、这边按结构半跨 M 解。
 */
export function sqSplitBuffer(M: number): number {
  for (let b = SQUARE.BUF_MIN; b < 60; b++) {
    const span = 1.2 * (M + b);
    const slack = 4 * b - (span - SQSPLIT.H);
    if (span - SQSPLIT.H < SQUARE.G_MIN || slack < SQUARE.E_MIN) continue;
    // 富余上限（SQUARE.E_MAX）：超了折叠体会沿轴浮起来，一圈的平台就不平了
    if (slack > SQUARE.E_MAX)
      throw new Error(`捏分档缓冲富余 ${slack.toFixed(1)} 超上限 ${SQUARE.E_MAX}（M=${M}）：折叠体会沿轴浮起来`);
    return b;
  }
  throw new Error(`捏分档缓冲解不出来：M=${M}`);
}

/** 材料账天花板：结构半跨 M 的上限（解析；slack ≥ e 与 free ≤ F 联立消去 BUF） */
export const sqSplitMCap = (fTotal: number = SQSPLIT.F_TOT, e: number = SQUARE.E_MIN): number =>
  (1.4 * fTotal + SQSPLIT.H - 1.4 - e) / 4;
/** 满裂平台的设计深度上限（解析）——H 在两边抵消 ⇒ **与箱高无关**（长高不能换来更深） */
export const sqSplitDCap = (fTotal: number = SQSPLIT.F_TOT, e: number = SQUARE.E_MIN): number =>
  sqSplitMCap(fTotal, e) - SQSPLIT.H / 4;

/** 梯挡：10 根，最内钉在端面板端点 f（端面硬投影的触发条件，§17.3 坑①），最外 = M */
export function sqSplitLadder(f: number, M: number): number[] {
  return [...new Set(Array.from({ length: SQUARE_RUNGS }, (_, i) => Math.round(f + ((M - f) * i) / (SQUARE_RUNGS - 1))))];
}

/**
 * 成形过程设计：与 Lab.12 定案同一套四件（逐挡长出 / 吸引近程门 / 缝区折痕待命 /
 * 缝壁排整齐），只有近程门的门限按本族重标（见 SQSPLIT.ATT_NEAR）。
 * **实心箱那几档也吃这一套**——混用会让它们在别人都成形后还是没成形的波浪管。
 */
const FORM: Pick<SkinUnitOpts, 'zipUp' | 'attNear' | 'attNearChains'> = {
  zipUp: [0],
  attNear: SQSPLIT.ATT_NEAR,
  attNearChains: [0],
};

export interface SqSplitTier {
  name: string;
  en: string;
  /** 方位类（面 0 / 边 1 / 角 2）——这一条引擎的挑出由它在方形里的位置定 */
  cls: 0 | 1 | 2;
  /** 级（下标进 SQSPLIT_T） */
  level: number;
  /** 形态位置（0 = 单箱，1 = 满裂） */
  t: number;
  /** tether 的绝对深度锚（px；斜坡上限按它给）。单箱那一档没有缝、不需要它 */
  D?: number;
  /** 箱设计深度（px；等长键箱终态比它鼓出约 +4，故要标定、不能直接拿目标值当设计值） */
  boxD?: number;
  /** 单箱那一档：直接走平档原谱的 kMax */
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
 * 标定法（scripts/skin-ring/split-thick.mjs 的 LOOP 模式）：按 方位类 × 级 扫 (boxD × tether 深)
 * / k，判据 = 键全锁 · **打结每 10 步采 ≤6（守门口径，直接并进候选池）** · 顶底面水平度 <1.5 ·
 * |箱高 − 44| < 0.5 · 剪影Δ <6 · 端面竖直度 ≤1.5 · 缓冲富余 ≤ E_MAX · 满裂真裂到轴；
 * 再对时间表在半边长 a 上扫，每个 (类, 级) 取最接近目标挑出的候选，按
 * 2·最大外缘偏差 + 终态对位散布 + 0.3·全程散布 + max 剪影Δ 选优。
 *
 * 同一方位类的引擎挑出各自相同，那是**方形**给的（不是巧合）：面类四级（L9/L5/L4/L0）
 * 都在 ≈54、边类四级（L8/L5/L3/L1）都在 ≈63、角类两级（L6/L1）都在 ≈87.5。
 *
 * 实测（Lab.14 守门口径；a=82.9 ⇒ 目标 面 53.9 / 边 63.0 / 角 87.2）：
 *   面 L9  boxD46/D54.0  挑出 54.4（偏 +0.46） 锁 26  结 0  Δ 2.38  缝底 x 0.0（真裂到轴）
 *   边 L8  boxD56/D61.2  挑出 62.0（偏 −1.00） 锁 27  结 0  Δ 3.19  缝底 x 0.0
 *   角 L6  boxD82/D86.6  挑出 87.3（偏 +0.01） 锁 28  结 0  Δ 1.68
 *   边 L5  boxD58/D63.2  挑出 63.7（偏 +0.63） 锁 22  结 0  Δ 3.06
 *   面 L5  boxD48/D53.7  挑出 54.1（偏 +0.17） 锁 21  结 2  Δ 2.74
 *   面 L4  boxD48/D53.3  挑出 53.5（偏 −0.39） 锁 19  结 2  Δ 2.52
 *   边 L3  boxD54/D62.0  挑出 62.8（偏 −0.24） 锁 18  结 0  Δ 2.73
 *   角 L1  boxD84/D87.0  挑出 87.8（偏 +0.53） 锁 14  结 6  Δ 1.86
 *   边 L1  boxD58/D62.0  挑出 63.0（偏 −0.02） 锁 14  结 2  Δ 0.51
 *   面 L0  k35           挑出 54.0（偏 +0.07） 锁 10  结 2  Δ 0.06
 * 箱高十条全 44.00 · 顶底面水平度 ≤0.72 · 边长 **166px**（平档 169、四次循环那版 197）。
 *
 * **F_TOT 259 不是随手给的**：把 F_TOT 退回 205（tail 加长到 60）对照，面 L9 / 边 L7 的干净
 * 区间一个数不变，**角 L6 的上限从 87.3 塌到 82.0**（候选 8 → 2）⇒ 角类够不着 a≥79.9 的
 * 下限（面 L0 的 E_MAX 地板给的）。所以「平台比平档高 20px」这笔账是角 L6 的材料账逼出来的。
 */
export const SQSPLIT_TIERS: readonly SqSplitTier[] = [
  tier(0, 9, { D: 54.0, boxD: 46 }),
  tier(1, 8, { D: 61.2, boxD: 56 }),
  tier(2, 6, { D: 86.6, boxD: 82 }),
  tier(1, 5, { D: 63.2, boxD: 58 }),
  tier(0, 5, { D: 53.7, boxD: 48 }),
  tier(0, 4, { D: 53.3, boxD: 48 }),
  tier(1, 3, { D: 62.0, boxD: 54 }),
  tier(2, 1, { D: 87.0, boxD: 84 }),
  tier(1, 1, { D: 62.0, boxD: 58 }),
  tier(0, 0, { k: 35 }),
];

/** 十条引擎的实测终态挑出（px），下标同 SQSPLIT_TIERS——守门逐位核对 */
export const SQSPLIT_REACH: readonly number[] = [54.4, 62.0, 87.3, 63.7, 54.1, 53.5, 62.8, 87.8, 63.0, 54.0];

/** 目标方形的半边长（与十条配置一起进的优化，不是从某一档反推的）：边长 166px */
export const SQSPLIT_HALF_SIDE = 82.9;

/** 目标方形的半边长 */
export function sqSplitHalfSide(): number {
  return SQSPLIT_HALF_SIDE;
}

/**
 * 位置 i 属于哪一对（0 = 双平台那条边上的两条，9 = 整块那条边上的两条）：
 * 按到极点边心的角距折算，与 `squareClassOf` 同一种「按方位现算」的做法。
 */
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

/**
 * 二十位编制：位置 → 引擎下标。一圈一个来回——从双平台那条边起级别单调降到整块那条边、
 * 再单调升回来，关于极点轴镜像 ⇒ 每条引擎摆两处或四处。
 */
export function buildSquareSplitOrder(count: number = SQUARE.COUNT): number[] {
  return Array.from({ length: count }, (_, i) => sqSplitTierAt(i, count));
}

/** 一档的谱 + 选项 + 关键节点下标 */
export function sqSplitBuild(tier: SqSplitTier, wEnd: number = SQSPLIT.W_END): {
  spec: SkinSpec;
  opts: SkinUnitOpts;
  lead: number;
  free: number;
  marks: { center: number; mouthA: number; mouthB: number; faceA: number; faceB: number; outA: number; outB: number };
} {
  const fTotal = SQSPLIT.F_TOT;
  if (tier.t <= 0) {
    // 单箱 = 平档原谱（只是箱高不同）——构造完全复用 squareSpec，不另写一份
    const k = tier.k!;
    const b = squareBuffer(k, SQSPLIT.H);
    const free = squareFree(k, b);
    const base = SQSPLIT.LEAD + (fTotal - free) / 2 + SQUARE.ISO;
    const c = base + (free - 1) / 2;
    const pw = squarePw(SQSPLIT.H);
    return {
      spec: squareSpec(k, fTotal, SQSPLIT.LEAD, SQSPLIT.H),
      opts: { ...skinSiteOpts(STEPPED), ...FORM },
      lead: base,
      free,
      marks: { center: c, mouthA: c, mouthB: c, faceA: c - pw, faceB: c + pw, outA: c - k, outB: c + k },
    };
  }
  const w = sqSplitSeamW(tier.t, wEnd);
  const D = tier.D!;
  const dv = sqSplitSink(tier.t, D);
  const wt = w * sqSplitTip(tier.t);
  const lobe = (SQSPLIT.H - w) / 2;
  const faceN = Math.round(lobe / 2);
  const a = Math.max(1, Math.round(wt / 4));
  const wallN = Math.max(1, Math.round(dv / 2));
  const boxD = tier.boxD ?? Math.round(D / 2) * 2;
  const m = a + wallN; // 缝角
  const f = m + faceN; // 面角
  const M = f + boxD / 2; // 轴嘴
  const buf = sqSplitBuffer(M);
  const free = 2 * (M + buf) + 1;
  const c = buf + M;

  // 缝链：嘴键 → 等长壁键 → 底键（跨度降序 = 拉链从嘴合到底）
  const wv = (w + wt) / 2;
  const crack: SkinBond[] = [[c - m, c + m, w / 100]];
  for (let k = m - SQSPLIT.WALL_STEP; k > a + 1; k -= SQSPLIT.WALL_STEP) crack.push([c - k, c + k, wv / 100]);
  crack.push([c - a, c + a, wt / 100]);
  // 面角同侧键：一根键同时激活垂直化 + 端面硬投影 + 面板锁定键（§16.1 推论一）
  const faceUp: SkinBond[] = [[c - f, c - m, lobe / 100]];
  const faceDn: SkinBond[] = [[c + m, c + f, lobe / 100]];
  const panels: SkinPanel[] = [[c - f, c - m], [c + m, c + f], [c - a, c + a]];
  const bonds: SkinBond[] = sqSplitLadder(f, M).map((k) => [c - k, c + k, SQSPLIT.H / 100]);
  const seg: SkinSeg = ['f', free, bonds, panels, [crack, faceUp, faceDn]];
  const { spec, base } = squareWrap(seg, fTotal, SQSPLIT.LEAD, `${tier.name} t=${tier.t}`);

  const c0 = base + c;
  const rTip = (D - dv) / 100;
  const tether: [number, number][] = [];
  for (let k = -a; k <= a; k++) tether.push([c0 + k, rTip]);
  for (let k = a + 1; k <= m; k++) {
    const r = rTip + ((k - a) * (D / 100 - rTip)) / wallN;
    tether.push([c0 + k, r], [c0 - k, r]);
  }
  // 缝区折痕待命（同侧规则：缝壁贴同侧缝角、缝心贴双角。跨侧耦合会把形拖塌）
  const crease: [number, number, number][] = [];
  for (let j = c0 - m + 1; j < c0 + m; j++) {
    if (j < c0) crease.push([j, c0 - m, 0]);
    else if (j > c0) crease.push([j, c0 + m, 0]);
    else crease.push([j, c0 - m, 0], [j, c0 + m, 0]);
  }
  return {
    spec,
    opts: {
      ...SKIN_ROOT_FIX,
      anchorEnd: true,
      boxSquare: true,
      ...FORM,
      sqChains: [0], // 方箱整形只作用于外箱梯，碰不到缝区
      coreTether: tether,
      coreTetherRel: crease,
      alignRuns: [[c0 - m, c0 - a], [c0 + a, c0 + m]], // 缝壁排整齐（抹掉锯齿）
    },
    lead: base,
    free,
    marks: { center: c0, mouthA: c0 - m, mouthB: c0 + m, faceA: c0 - f, faceB: c0 + f, outA: c0 - M, outB: c0 + M },
  };
}

/** 十条引擎的定义（解十条摆二十处） */
export function buildSquareSplitUnits(tiers: readonly SqSplitTier[] = SQSPLIT_TIERS): RingUnitDef[] {
  return tiers.map((t) => {
    const b = sqSplitBuild(t);
    return {
      key: `sqsplit-${CLS_EN[t.cls]}-${t.level}`,
      zh: t.name,
      en: t.en,
      spec: b.spec,
      opts: b.opts,
      // 与全站同窗口且为奇数（§15.15：偶数窗会把 renderSmooth 的归一化撞出放大）
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
