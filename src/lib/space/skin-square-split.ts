/**
 * 项目二 · 方形环的第三种编制「捏分」——**一次循环 · 变高 · 居中**（Lab.14）——纯数据 + 纯几何，零 DOM。
 *
 * 三轮拍板叠在一起（都是 2026-09-02）：
 * - 「一次循环优先，厚度让路」——一条边上是双平台，绕到对面变成整块，一圈一个来回
 *   （四次循环那版见 git caa8a77 之前；四次循环是方形三个方位类天然给的排法，一次循环要面类在
 *   同一个挑出上既做出整块又做出满裂）。
 * - 「把这个做好了的拉高，上下两个板之间有充足的空间」（草图：缝 ≈100px）⇒ **变高**：台高钉死、
 *   缝张开、总高随位置涨——Lab.12/13 原来的捏分读法；整块那边是两片台合成的薄块（32 高）。
 * - 看真机「后面一个板的边突然压缩了，而且是偏下的，我想要居中的、比较平顺的转变」⇒
 *   **对位改居中**（缝心一圈恒定，上板升、下板降各一半）+ **时间表按总高等步重排**
 *   （十对各自一个 t，总高从 132 到 32 每对差 11.1px；此前沿用捏分族那张十级 t 表，
 *   末尾三级 84→53→32 一步压掉 31、21px，就是那个「突然压缩」）。
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
 * 台高 16、缝 100 下角类的深缝档起初一个干净候选都没有：终态全对（锁定全满、剪影Δ 2、端面直），
 * 坏在 step 400 前后**顶面那片（轴嘴→面角）整片翻进缝区**打成几十节的环（实测 91 节），
 * 之后又自己解开——是瞬态。吸引近程门救不了（护栏本有 120px 的绝对上限 `D_ACT`，箱高 113 时
 * 2.5 倍门限早已超过它）；去折痕 / 限速也无效。**顶/底面排整齐**（`alignRuns` 加两段
 * [轴嘴, 面角]，与缝壁那两段同一治法——排布是位置机制不是形态机制）把环压到 0、锁定不变，
 * 成形帧从头到尾都是「一个逐挡长深的锯齿箱」。
 *
 * ## 对位：居中（缝心一圈恒定）
 *
 * 对称配平垫（Lab.12 v4 / 平档同一副）：`[贴合 lead | 垫 p | 隔离 ISO | 结构 | 隔离 ISO | 垫 p | 尾 tail]`，
 * 垫 + 结构 = F_TOT 恒定 ⇒ 缝心离下缘 = `2(tail + ISO) + r·(F_TOT − 1)`，与位置、键谱、折叠状态全无关，
 * 在每一个 r 上逐位相等。上板 = 缝心 + w/2 + 台高、下板 = 缝心 − w/2 − 台高，各自升降一半。
 * （上一版按草图做成下板齐平——八段不对称垫；用户看真机改要居中，那一版的账留在 §17.13。）
 *
 * ## 三条如实带着的账
 *
 * 1. **这一编制自己的带长**（`SQSPLIT_BAND`，平档/起伏仍是 `SQUARE.BAND`）：深缝档的自由段
 *    比平档长一倍多，塞不进 305；换编制时天花不动、平台落得更低，台架用 `pivotY` 跟着换枢轴。
 *    缝心离下缘 129.6（平档 101.6）——尾段已在下限，压不下去。
 * 2. **方形比平档大**：面类挑出 ≈83（平档 56）⇒ 边长 223（平档 169）；4×4 阵列的格距
 *    按平档定（207）装不下，这一编制的阵列用自己的格距。
 * 3. **外缘偏差 / 成形中段的对位散布**按实测钉住（见守门）。
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
   * 对称垫 ⇒ 自由段总量 = 最长的那条结构（角 j2：293，它的垫为 0）：奇数（结构恒奇、垫要整数）。
   */
  F_TOT: 293,
  LEAD: 8,
  /**
   * 尾段：与 F_TOT 一起定缝心离下缘 = 2(tail+ISO) + r(F_TOT−1)，终态 r=0.3 ⇒ 42 + 87.6 = **129.6**
   * （平档 101.6）。尾段已在下限 5，缝心压不下去——带长 = 8 + 32 + 293 + 5 = **338**。
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

/** 十对位置的方位类（从双平台边心往对边数）：面 边 角 边 面 │ 面 边 角 边 面 */
export const SQSPLIT_PAIR_CLASS: readonly (0 | 1 | 2)[] = [0, 1, 2, 1, 0, 0, 1, 2, 1, 0];
export const SQSPLIT_PAIRS = SQSPLIT_PAIR_CLASS.length;

/** 形态时间表：缝宽张得快 · 缝深退得稳 · 缝尖宽/缝嘴宽 */
export const sqSplitSeamW = (t: number, wEnd: number = SQSPLIT.W_END): number => wEnd * Math.pow(t, 0.7);
export const sqSplitSink = (t: number, D: number): number => D * Math.pow(t, 1.2);
export const sqSplitTip = (t: number): number => 0.4 + 0.6 * t;
/** **变高**：总高 = 2·台高 + 缝宽（台高钉死，缝张开） */
export const sqSplitH = (t: number, wEnd: number = SQSPLIT.W_END): number => 2 * SQSPLIT.LOBE + sqSplitSeamW(t, wEnd);

/**
 * 十对位置各自的形态位置 t（j=0 双平台边 … j=9 整块边）：**按总高等步**取——
 * 缝宽 w_j = W_END·(9−j)/9 线性 ⇒ t_j = ((9−j)/9)^(1/0.7)，总高 132 → 32 每对差 11.1px。
 * 不再用捏分族那张十级表：那张表的 t 在 0 附近堆得密（.108/.254/.397），w = 100·t^0.7 在
 * 那一头却陡，末尾三对总高 84 → 53 → 32，就是用户看真机指出的「突然压缩」。
 * 十对十个 t 全不同 ⇒ 十条引擎、每条摆两处（关于极点轴镜像）。
 */
export const SQSPLIT_PAIR_T: readonly number[] = Array.from({ length: SQSPLIT_PAIRS }, (_, j) =>
  j === SQSPLIT_PAIRS - 1 ? 0 : Math.pow((SQSPLIT_PAIRS - 1 - j) / (SQSPLIT_PAIRS - 1), 1 / 0.7),
);

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
  /** 第几对位置（0 = 双平台边，9 = 整块边） */
  pair: number;
  cls: 0 | 1 | 2;
  /** 形态位置（= SQSPLIT_PAIR_T[pair]） */
  t: number;
  D?: number;
  boxD?: number;
  k?: number;
}

const CLS_NAME = ['面', '边', '角'] as const;
const CLS_EN = ['face', 'edge', 'corner'] as const;
const tier = (pair: number, cfg: { D?: number; boxD?: number; k?: number }): SqSplitTier => ({
  name: `${CLS_NAME[SQSPLIT_PAIR_CLASS[pair]]} j${pair}`,
  en: `${CLS_EN[SQSPLIT_PAIR_CLASS[pair]]} j${pair}`,
  pair,
  cls: SQSPLIT_PAIR_CLASS[pair],
  t: SQSPLIT_PAIR_T[pair],
  ...cfg,
});

/**
 * ## 定案：十条引擎（真引擎标定，**冻结成表**——不是活扫掠），下标 = 对号 j
 *
 * 标定法：`split-thick.mjs` 的 LOOP 模式 + `VARH=16 FACEALIGN=1 TS=…`（十对各自的 t），按 方位类 × 对
 * 扫 (boxD × tether 深)，判据 = 键全锁 · 打结每 10 步采 ≤6 · 顶底面水平度 <1.5 · |总高 − H(t)| <0.5 ·
 * 剪影Δ <6 · 端面竖直度 ≤1.5 · E_MAX · 满裂真裂到轴；再在半边长 a 上扫，每对取最接近目标挑出的候选，
 * 按 2·最大外缘偏差 + max 剪影Δ 选优。
 *
 * a=111.7（目标 面 83.1 / 边 95.4 / 角 128.0）：
 *   j0 面 t=1      boxD78/D83.0   H 132.0  挑出 83.9（+0.81）  锁 34  结 0  Δ 0.31  缝底 0.0（真裂到轴）
 *   j1 边 t=.845   boxD90/D94.9   H 120.9  挑出 96.0（+0.63）  锁 32  结 0  Δ 1.59
 *   j2 角 t=.698   boxD122/D127.3 H 109.8  挑出 128.2（+0.26） 锁 33  结 0  Δ 1.18
 *   j3 边 t=.560   boxD90/D94.5   H 98.7   挑出 95.2（−0.14）  锁 25  结 0  Δ 2.17
 *   j4 面 t=.432   boxD78/D82.1   H 87.6   挑出 82.6（−0.53）  锁 20  结 0  Δ 1.66
 *   j5 面 t=.314   boxD78/D81.8   H 76.4   挑出 82.3（−0.82）  锁 18  结 0  Δ 0.36
 *   j6 边 t=.208   boxD92/D94.7   H 65.3   挑出 95.0（−0.41）  锁 16  结 0  Δ 1.65
 *   j7 角 t=.117   boxD124/D127.1 H 54.2   挑出 127.8（−0.21） 锁 15  结 0  Δ 0.34
 *   j8 边 t=.043   boxD92/D95.2   H 43.1   挑出 95.3（−0.05）  锁 14  结 0  Δ 1.93
 *   j9 面 t=0      k48            H 32.0   挑出 83.4（+0.32）  锁 10  结 0  Δ 0.00
 * 边长 **223px**（平档 169）· 外缘偏差 ≤0.82 · 十条锁定数之和 217 ⇒ 环上键 434。
 */
export const SQSPLIT_TIERS: readonly SqSplitTier[] = [
  tier(0, { D: 83.0, boxD: 78 }),
  tier(1, { D: 94.9, boxD: 90 }),
  tier(2, { D: 127.3, boxD: 122 }),
  tier(3, { D: 94.5, boxD: 90 }),
  tier(4, { D: 82.1, boxD: 78 }),
  tier(5, { D: 81.8, boxD: 78 }),
  tier(6, { D: 94.7, boxD: 92 }),
  tier(7, { D: 127.1, boxD: 124 }),
  tier(8, { D: 95.2, boxD: 92 }),
  tier(9, { k: 48 }),
];

/** 实测终态挑出（px），下标同 SQSPLIT_TIERS——守门逐位核对 */
export const SQSPLIT_REACH: readonly number[] = [83.9, 96.0, 128.2, 95.2, 82.6, 82.3, 95.0, 127.8, 95.3, 83.4];

/** 目标方形的半边长（与十条配置一起进的优化）：边长 223px */
export const SQSPLIT_HALF_SIDE = 111.7;
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

/**
 * 七段谱（对称配平垫 = 居中对位）：[贴合 lead | 垫 p | 隔离 ISO | 结构 | 隔离 ISO | 垫 p | 尾 tail]，
 * 垫 + 结构 = F_TOT 恒定 ⇒ 缝心 = 2(tail+ISO) + r(F_TOT−1) 与位置无关。
 * 与平档的 `squareWrap` 同构，只是带长/尾段用这一编制自己的（塞不进 305）。
 */
export function sqSplitWrap(seg: SkinSeg, fTotal: number = SQSPLIT.F_TOT, who = ''): { spec: SkinSpec; base: number } {
  const fs = seg[1];
  const p = (fTotal - fs) / 2;
  if (p < 0) throw new Error(`捏分档自由段超预算：${who} 结构 ${fs} > ${fTotal}`);
  if (p % 1 !== 0) throw new Error(`配平垫 ${p} 非整数（自由段应为奇数）：${who}`);
  const head: SkinSeg[] = p > 0 ? [['g', SQSPLIT.LEAD], ['f', p, []], ['g', SQUARE.ISO]] : [['g', SQSPLIT.LEAD + SQUARE.ISO]];
  const foot: SkinSeg[] = p > 0 ? [['g', SQUARE.ISO], ['f', p, []], ['g', SQSPLIT.TAIL]] : [['g', SQUARE.ISO + SQSPLIT.TAIL]];
  return { spec: [...head, seg, ...foot], base: SQSPLIT.LEAD + p + SQUARE.ISO };
}

/** 缝心离下缘（构造式）：2(tail+ISO) + r·(F_TOT−1)，与位置无关 */
export const sqSplitMouthY = (r = 0.3): number => 2 * (SQSPLIT.TAIL + SQUARE.ISO) + r * (SQSPLIT.F_TOT - 1);

/** 一档的谱 + 选项 + 关键节点下标 */
export function sqSplitBuild(tier: SqSplitTier, wEnd: number = SQSPLIT.W_END): {
  spec: SkinSpec;
  opts: SkinUnitOpts;
  lead: number;
  free: number;
  h: number;
  marks: { center: number; mouthA: number; mouthB: number; faceA: number; faceB: number; outA: number; outB: number };
} {
  const s = sqSplitStructure(tier, wEnd);
  const { spec, base } = sqSplitWrap(s.seg, SQSPLIT.F_TOT, tier.name);
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

/** 位置 i 用哪一条引擎（= 它那一对的引擎；方位类由几何核对） */
export function sqSplitTierAt(i: number, count: number = SQUARE.COUNT): number {
  const j = sqSplitPairOf(i, count);
  const idx = SQSPLIT_TIERS.findIndex((t) => t.pair === j);
  if (idx < 0 || SQSPLIT_TIERS[idx].cls !== squareClassOf(i, count))
    throw new Error(`捏分一次循环：位置 ${i}（第 ${j} 对）没有登记的引擎或方位类不符`);
  return idx;
}

/** 二十位编制：位置 → 引擎下标（一圈一个来回，关于极点轴镜像 ⇒ 每条引擎摆两处） */
export function buildSquareSplitOrder(count: number = SQUARE.COUNT): number[] {
  return Array.from({ length: count }, (_, i) => sqSplitTierAt(i, count));
}

/** 引擎定义（解十条摆二十处） */
export function buildSquareSplitUnits(tiers: readonly SqSplitTier[] = SQSPLIT_TIERS): RingUnitDef[] {
  return tiers.map((t) => {
    const b = sqSplitBuild(t);
    return {
      key: `sqsplit-${CLS_EN[t.cls]}-j${t.pair}`,
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
