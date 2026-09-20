/**
 * 项目二 · 单元组合（Lab 2-11）——纯数据 + 纯几何，零 DOM。
 *
 * ## 立项与纠偏
 *
 * 2026-09-17 用户草图三张立项「研究不同形状的单元组合来形成不同的效果，比如通道型、共同构造的平台型、
 * 密闭空间型」。首版把「不同形状」读成目录里的五种形态换槽位——**读错了**。2026-09-20 用户纠偏：
 * 「假如我们就用平台，然后选择做一圈起伏……那是不是有存在前后两个单元可以实现首尾相接一高一低的？」
 * ——**同一种平台在「一圈起伏」下的高低**，几个单元挨着放、接缝处接高接低；线稿五种接法后用户确认
 * 「这个思路是对的」，并交来三张图形 + 要求「包括方单元版本」。
 *
 * ## 单元（两族）
 *
 * - **圆环** = Lab 2-5 圆筒环（20 条 202 节带绕一根立杆）+ 一圈起伏编制；捏分单元 = Lab 2-5 捏分编制
 *   （338 节带，一圈从双平台到整块，镜像）。
 * - **方环** = Lab 2-6 方形环（305 节带，三档挑出凑成方，相位半格 9°）+ 它自己的起伏；捏分单元 = Lab 2-6
 *   捏分一次循环（338 节带，一条边双平台、对边整块，极点可给）。
 * 两族的起伏都是**纯平移**（各自守门过「形状逐点不变」）：走面 = 基准 + 2·(中心 lead − lead)。
 * 量程：圆环 lead 58–14（88 px = 0.35 m）· 方环 135–115（40 px = 0.16 m）。
 *
 * ## 每个单元
 *
 * - 起伏单元 `{kind:'wave', crest, lo, hi}`：`crest` = 峰落在哪条带（0 = 朝 +X，10 = 朝 −X）；`lo`/`hi` = 用量程的哪一段
 *   （0 = 谷底、1 = 峰顶，按族换算成 lead；lo = hi 就是平的）。
 * - 捏分单元 `{kind:'split', face}`：缝口（双平台那一侧）朝哪条带；对面是整块。
 *
 * ## 三张图形（用户 2026-09-20）
 *
 * ① 坡降：两个起伏环续坡下降，落到一个平台上（A 上半段 → B 下半段 → C 平在谷底）。
 * ② 升台：捏分环缝口朝右 → 起伏环从缝口的下板起坡 → 高处一个平台。
 * ③ 合腔：两个捏分环缝口相对，两个腔在接缝接通。
 * 另五种接法（台阶 / 续坡 / 三段坡 / 凹 / 拱）是线稿里用户看过的，一并留作预设。
 *
 * ## 接缝
 *
 * 一列沿 +X 排，接缝落在 A 朝向 B 的带（0）与 B 朝向 A 的带（10）上；两家在那里各是什么高度由各自的
 * 旋钮定（`comboJoints`）。起伏对起伏读走面；捏分对起伏读缝口的下板；捏分对捏分读腔接通。
 * 圆环 ②：捏分下板顶 78.4 与起伏谷底走面 77.2 只差 1.2 px ⇒ 接得平；方环 ②：方环起伏最低走面 98.7
 * 比捏分下板 78.5 高 20 px（8 cm）⇒ 那道接缝是一级台阶——方环的起伏量程只有 40 px，够不到。
 */
import {
  RING,
  RING_LEAD,
  RING_TAIL,
  RING_WAVE,
  buildRingUnits,
  palindromeOrder,
  type RingUnitDef,
} from './skin-ring';
import { buildSplitRingOrder, buildSplitRingUnits, SPLIT_RING_TIERS } from './skin-split-ring';
import {
  SQUARE,
  SQUARE_PHASE,
  SQUARE_TIERS,
  SQUARE_WAVE,
  buildSquareOrder,
  buildSquareUnits,
  squareCellGap,
  squareFreeTotal,
  squareLead,
  squareSpec,
  squareTightRadius,
} from './skin-square';
import { SQSPLIT_TIERS, buildSquareSplitOrder, buildSquareSplitUnits, sqSplitCellPitch } from './skin-square-split';
import {
  MM_PER_UNIT,
  RIG_ANCHOR_Y,
  RIG_SCALE,
  RING_GRID_FIT,
  ROOM,
  ringCellGap,
  roomSpan,
  sceneBySpan,
  viewFitBySpan,
  type RingGridView,
  type SceneMesh,
} from './skin-grid';
import type { SkinSpec } from './skin-unit';
import { UNIT_FORMS } from './unit-cluster';

// ── 两族 ─────────────────────────────────────────────────────────────────────────

export const COMBO_FAMILIES = [
  { key: 'round', zh: '圆环', en: 'round', label: '圆环' },
  { key: 'square', zh: '方环', en: 'square', label: '方环' },
] as const;
export type ComboFamilyKey = (typeof COMBO_FAMILIES)[number]['key'];

/** 圆环起伏单元可用的形态（目录四形态同一副环族构造）；默认直挑台（用户「假如我们就用平台」）。方环只有它自己的箱 */
export const COMBO_DEFAULT_FORM = 2;
export function comboForms(): RingUnitDef[] {
  return buildRingUnits();
}

/**
 * 走面基准（2D px，离下缘；引擎实测，守门逐一核对）：
 * 圆环四形态在 lead = RING_LEAD 时材料最高处（袋没有走面）；方环三档在 lead = squareLead() 时箱顶（三档同高）。
 */
export const COMBO_DECK: readonly (number | null)[] = [null, 82.3, 77.2, 101.5];
export const SQUARE_DECK = 118.7;

/** 捏分单元缝口那一侧（pair 0，t = 1）的下板顶 / 上板底 / 整块那一侧的顶（2D px，离下缘；引擎实测） */
export const SPLIT_SHELF = {
  round: { deck: 78.4, roof: 177.8, block: 144.9 },
  square: { deck: 78.5, roof: 177.9, block: 144.9 },
} as const;

interface Family {
  key: ComboFamilyKey;
  /** 环列相位偏移（方环半格 9°） */
  angleOffset: number;
  /**
   * 起伏的级数。圆环 11 = Lab 2-5 起伏编制；方环 6：方环每条带都是 305 节、且三个方位类各解各的引擎，
   * 11 级要 19–33 条引擎（实测 20 ms/步，一个核吃不下 80 步/s）；6 级（相邻两条带共一级，
   * 一级 8 px = 3 cm）把引擎数减到 12–22 条，形状与量程一个数不变。
   */
  levels: number;
  /** 起伏量程：LOW = 谷（lead 大）· HIGH = 峰 */
  LOW: number;
  HIGH: number;
  /** 走面基准所在的 lead */
  centerLead: number;
  deckBase: (formIdx: number) => number | null;
  /** 起伏单元朝邻居那一侧的半宽（2D px，芯心到外缘，按全程峰值） */
  waveHalf: (formIdx: number) => number;
  splitHalf: number;
  gap: (radius: number) => number;
  shelf: { deck: number; roof: number; block: number };
}

const FAMILY: Record<ComboFamilyKey, Family> = {
  round: {
    key: 'round',
    angleOffset: 0,
    levels: RING_WAVE.LEVELS,
    LOW: RING_WAVE.LOW,
    HIGH: RING_WAVE.HIGH,
    centerLead: RING_LEAD,
    deckBase: (f) => COMBO_DECK[f],
    waveHalf: (f) => RING.RADIUS_DEF + UNIT_FORMS[f].peakReach,
    // 捏分环：一圈同一个挑出（面类 83.2，峰值 84.3）
    splitHalf: RING.RADIUS_DEF + 84.3,
    gap: (r) => ringCellGap(r),
    shelf: SPLIT_SHELF.round,
  },
  square: {
    key: 'square',
    angleOffset: SQUARE_PHASE,
    levels: 6,
    LOW: SQUARE_WAVE.LOW,
    HIGH: SQUARE_WAVE.HIGH,
    centerLead: squareLead(),
    deckBase: () => SQUARE_DECK,
    // 方环：边对边，面类方位的最紧外缘（全程峰值）
    waveHalf: () => squareTightRadius(),
    splitHalf: sqSplitCellPitch(0) / 2,
    gap: () => squareCellGap(),
    shelf: SPLIT_SHELF.square,
  },
};
export function comboFamily(key: ComboFamilyKey): Family {
  return FAMILY[key];
}

// ── 单元：起伏 / 捏分 ─────────────────────────────────────────────────────────────

export interface WaveUnit {
  kind: 'wave';
  /** 峰落在哪条带（0–19；0 = 朝 +X，10 = 朝 −X） */
  crest: number;
  /** 高度段两端，占量程的比例（0 = 谷底、1 = 峰顶）；lo ≤ hi，相等 = 平 */
  lo: number;
  hi: number;
}
export interface SplitUnit {
  kind: 'split';
  /** 缝口（双平台那一侧）朝哪条带（0 = +X，10 = −X） */
  face: number;
}
export type ComboUnit = WaveUnit | SplitUnit;

/** 比例 → lead（族的量程内取整） */
export function leadOf(fam: ComboFamilyKey, frac: number): number {
  const F = FAMILY[fam];
  if (frac < 0 || frac > 1) throw new Error(`unit-combo: 高度比例 ${frac} 出了 [0, 1]`);
  return Math.round(F.LOW - frac * (F.LOW - F.HIGH));
}

/** 一段高度的各级 lead（圆环 11 级、方环 6 级）：在 [low, high] 之间按余弦（与 waveLeads 同一条公式）；low ≥ high */
export function segmentLeads(low: number, high: number, fam: ComboFamilyKey = 'round'): number[] {
  const F = FAMILY[fam];
  if (low < high || high < F.HIGH || low > F.LOW)
    throw new Error(`unit-combo: 高度段 [${low}, ${high}] 出了 ${fam} 的量程 [${F.LOW}, ${F.HIGH}]`);
  const L = F.levels;
  return Array.from({ length: L }, (_, l) =>
    Math.round(low - (low - high) * ((1 - Math.cos((Math.PI * l) / (L - 1))) / 2)),
  );
}

/** palindromeOrder 的 offset：级 10（峰）落在带 crest ⇔ (crest + offset) mod 20 = 10 */
export function crestOffset(crest: number, count: number = RING.COUNT): number {
  const half = count / 2;
  return (((half - crest) % count) + count) % count;
}

/** 起伏单元二十条带各自的 lead */
export function unitLeads(u: WaveUnit, fam: ComboFamilyKey = 'round', count: number = RING.COUNT): number[] {
  const lv = segmentLeads(leadOf(fam, u.lo), leadOf(fam, u.hi), fam);
  return palindromeOrder(count, FAMILY[fam].levels, crestOffset(u.crest, count)).map((l) => lv[l]);
}

/** 走面高度（2D px，离下缘）：起伏是纯平移，lead 每少一节形状上移 2 px */
export function deckAt(fam: ComboFamilyKey, formIdx: number, lead: number): number | null {
  const F = FAMILY[fam];
  const d = F.deckBase(formIdx);
  return d === null ? null : d + 2 * (F.centerLead - lead);
}

/** 捏分单元二十条带各用第几条捏分引擎（缝口朝 face） */
export function splitOrder(fam: ComboFamilyKey, face: number, count: number = RING.COUNT): number[] {
  if (fam === 'round') {
    // buildSplitRingOrder：pair 0 落在带 (−offset) 与 (19 − offset) ⇒ 缝口以带 face 与 face−1 为中心
    return buildSplitRingOrder(SPLIT_RING_TIERS.length, count, ((count - face) % count + count) % count);
  }
  // 方形：极点只能落在四条边上（0 = +X · 1 = +Z · 2 = −X · 3 = −Z）
  const pole = (((Math.round(face / (count / 4)) % 4) + 4) % 4);
  return buildSquareSplitOrder(count, pole);
}

// ── 组合：几个单元一列 ───────────────────────────────────────────────────────────────

export interface ComboPlan {
  key: string;
  zh: string;
  en: string;
  label: string;
  /** 一列沿 +X，接缝在相邻两个之间 */
  units: readonly ComboUnit[];
}

const wave = (crest: number, lo: number, hi: number): WaveUnit => ({ kind: 'wave', crest, lo, hi });
const split = (face: number): SplitUnit => ({ kind: 'split', face });

export const COMBO_PLANS: readonly ComboPlan[] = [
  // ① 两个起伏环续坡下降（峰朝左），落到谷底的一个平台上
  { key: 'descend', zh: '坡降', en: 'a descent', label: '① 坡降', units: [wave(10, 0.5, 1), wave(10, 0, 0.5), wave(0, 0, 0)] },
  // ② 捏分环缝口朝右 → 起伏环从缝口下板起坡（峰朝右）→ 高处一个平台
  { key: 'rise', zh: '升台', en: 'a rise', label: '② 升台', units: [split(0), wave(0, 0, 1), wave(0, 1, 1)] },
  // ③ 两个捏分环缝口相对
  { key: 'enclose', zh: '合腔', en: 'an enclosure', label: '③ 合腔', units: [split(0), split(10)] },
  { key: 'step', zh: '台阶', en: 'a step', label: '台阶', units: [wave(0, 0, 1), wave(0, 0, 1)] },
  { key: 'ramp', zh: '续坡', en: 'a ramp', label: '续坡', units: [wave(0, 0, 0.5), wave(0, 0.5, 1)] },
  { key: 'ramp3', zh: '三段续坡', en: 'a ramp in three', label: '三段坡', units: [wave(0, 0, 1 / 3), wave(0, 1 / 3, 2 / 3), wave(0, 2 / 3, 1)] },
  { key: 'valley', zh: '谷对谷', en: 'a hollow', label: '凹', units: [wave(10, 0, 1), wave(0, 0, 1)] },
  { key: 'arch', zh: '峰对峰', en: 'an arch', label: '拱', units: [wave(0, 0, 1), wave(10, 0, 1)] },
];
export type ComboPlanKey = (typeof COMBO_PLANS)[number]['key'];

export function comboPlan(key: string): ComboPlan {
  const p = COMBO_PLANS.find((q) => q.key === key);
  if (!p) throw new Error(`unit-combo: 没有这种组合 ${key}`);
  return p;
}

/** 距离两档：相切（边贴边——这台的题目是「接起来」）· 分离（各族自己的环间缝） */
export const COMBO_SPACINGS = [
  { key: 'touch', label: '相切', zh: '相切', en: 'touching' },
  { key: 'apart', label: '分离', zh: '分离', en: 'apart' },
] as const;
export type ComboSpacingKey = (typeof COMBO_SPACINGS)[number]['key'];

// ── 站位 ───────────────────────────────────────────────────────────────────────────

/** 单元朝邻居那一侧的半宽（2D px） */
export function unitHalf(fam: ComboFamilyKey, u: ComboUnit, formIdx: number): number {
  const F = FAMILY[fam];
  return u.kind === 'split' ? F.splitHalf : F.waveHalf(formIdx);
}

/** 每个单元的芯心 x（2D px，整列按外缘居中；z 恒 0）。相切 = 两边半宽相加；分离再加环间缝 */
export function comboPositions(plan: ComboPlan, fam: ComboFamilyKey, formIdx: number, radius: number, spacing: ComboSpacingKey): number[] {
  const F = FAMILY[fam];
  const half = plan.units.map((u) => unitHalf(fam, u, formIdx));
  const xs = [0];
  for (let i = 1; i < half.length; i++) xs.push(xs[i - 1] + half[i - 1] + half[i] + (spacing === 'apart' ? F.gap(radius) : 0));
  const left = xs[0] - half[0];
  const right = xs[xs.length - 1] + half[half.length - 1];
  const mid = (left + right) / 2;
  return xs.map((x) => x - mid);
}

/** 整列的占宽（2D px，外缘到外缘） */
export function comboExtent(plan: ComboPlan, fam: ComboFamilyKey, formIdx: number, radius: number, spacing: ComboSpacingKey): number {
  const xs = comboPositions(plan, fam, formIdx, radius, spacing);
  const half = plan.units.map((u) => unitHalf(fam, u, formIdx));
  return xs[xs.length - 1] - xs[0] + half[0] + half[half.length - 1];
}

/** 朝向某个方向（弧度，0 = +X，正向转向 +Z）的那条带（带 i 的方位 = angleOffset + i·18°） */
export function bandToward(dir: number, angleOffset = 0, count: number = RING.COUNT): number {
  const step = (Math.PI * 2) / count;
  return ((Math.round((dir - angleOffset) / step) % count) + count) % count;
}

export interface ComboJoint {
  a: number;
  b: number;
  bandA: number;
  bandB: number;
  /** 两家在接缝处的走面高度（2D px，离下缘）：起伏 = 走面；捏分缝口 = 下板顶；捏分整块 = 块顶；袋 = null */
  deckA: number | null;
  deckB: number | null;
  /** 落差（B − A；任一为 null 则 null） */
  step: number | null;
  /** 两家都是捏分缝口相对 ⇒ 腔接通 */
  cavity: boolean;
}

/** 某单元在某条带上的走面高度 */
export function unitDeck(fam: ComboFamilyKey, u: ComboUnit, band: number, formIdx: number): number | null {
  const F = FAMILY[fam];
  if (u.kind === 'wave') return deckAt(fam, formIdx, unitLeads(u, fam)[band]);
  const tier = splitOrder(fam, u.face)[band];
  const pair = fam === 'round' ? SPLIT_RING_TIERS[tier].pair : SQSPLIT_TIERS[tier].pair;
  if (pair === 0) return F.shelf.deck;
  if (pair === SPLIT_RING_TIERS.length - 1) return F.shelf.block;
  return null; // 中间级：两片台之间的缝在张开，走面没有单一读数
}

/** 每条接缝两家各是什么高度 */
export function comboJoints(plan: ComboPlan, fam: ComboFamilyKey, formIdx: number): ComboJoint[] {
  const F = FAMILY[fam];
  const bandA = bandToward(0, F.angleOffset);
  const bandB = bandToward(Math.PI, F.angleOffset);
  const out: ComboJoint[] = [];
  for (let i = 1; i < plan.units.length; i++) {
    const A = plan.units[i - 1];
    const B = plan.units[i];
    const deckA = unitDeck(fam, A, bandA, formIdx);
    const deckB = unitDeck(fam, B, bandB, formIdx);
    const faceA = A.kind === 'split' && splitPairAt(fam, A, bandA) === 0;
    const faceB = B.kind === 'split' && splitPairAt(fam, B, bandB) === 0;
    out.push({ a: i - 1, b: i, bandA, bandB, deckA, deckB, step: deckA === null || deckB === null ? null : deckB - deckA, cavity: faceA && faceB });
  }
  return out;
}
function splitPairAt(fam: ComboFamilyKey, u: SplitUnit, band: number): number {
  const tier = splitOrder(fam, u.face)[band];
  return fam === 'round' ? SPLIT_RING_TIERS[tier].pair : SQSPLIT_TIERS[tier].pair;
}

/** 接缝齐平的判据（2D px）：3 cm 以内脚感读作同一片 */
export const JOINT_LEVEL_TOL = 7.6;

// ── 解什么、摆到哪 ───────────────────────────────────────────────────────────────────

export interface ComboBuild {
  /** 去重后的引擎 */
  units: RingUnitDef[];
  /** 每份编制 = 二十条带各用第几条引擎（每个单元一份；完全相同的单元共用一份） */
  plans: number[][];
  cellPlan: number[];
  /** 每条引擎的键（守门与 unitsKey 用） */
  keys: string[];
}

/** 同一张键谱搬到某个 lead 上（lead + tail 恒定 ⇒ 筒的上下缘不动、形状纯平移——Lab 2-8 同一做法） */
export function unitAtLead(form: RingUnitDef, lead: number): RingUnitDef {
  const sum = RING_LEAD + RING_TAIL;
  return { ...form, key: `${form.key}-l${lead}`, spec: [['g', lead], form.spec[1], ['g', sum - lead]] as SkinSpec };
}

/**
 * 一种键谱 × 一个 lead 一条引擎（跨单元去重：续坡两段共用中间那个 lead；方环起伏按 (方位类, lead) 去重；
 * 捏分十条一族只解一次不论几个捏分单元）。
 */
export function comboBuild(plan: ComboPlan, fam: ComboFamilyKey, form: RingUnitDef, formIdx: number): ComboBuild {
  const keys: string[] = [];
  const units: RingUnitDef[] = [];
  const engine = (key: string, make: () => RingUnitDef): number => {
    let v = keys.indexOf(key);
    if (v < 0) {
      v = keys.length;
      keys.push(key);
      units.push(make());
    }
    return v;
  };
  const sqClass = fam === 'square' ? buildSquareOrder() : null;
  const sqFlat = fam === 'square' ? buildSquareUnits() : null;
  const sqF = fam === 'square' ? squareFreeTotal() : 0;
  let roundSplit: RingUnitDef[] | null = null;
  let squareSplit: RingUnitDef[] | null = null;
  const plans: number[][] = [];
  const sigs: string[] = [];
  const cellPlan = plan.units.map((u) => {
    let bands: number[];
    if (u.kind === 'wave') {
      const leads = unitLeads(u, fam);
      bands = leads.map((lead, i) => {
        if (fam === 'round') return engine(`w:${form.key}:${lead}`, () => unitAtLead(form, lead));
        const c = sqClass![i];
        return engine(`sw:${c}:${lead}`, () => ({
          key: `sq-c${c}-l${lead}`,
          zh: `${SQUARE_TIERS[c].name}档 lead ${lead}`,
          en: `${SQUARE_TIERS[c].en} lead ${lead}`,
          spec: squareSpec(SQUARE_TIERS[c].k, sqF, lead),
          opts: sqFlat![c].opts,
          smooth: [3, 1] as const,
        }));
      });
    } else {
      const order = splitOrder(fam, u.face);
      bands = order.map((tier) => {
        if (fam === 'round') {
          roundSplit ??= buildSplitRingUnits();
          return engine(`rs:${tier}`, () => roundSplit![tier]);
        }
        squareSplit ??= buildSquareSplitUnits();
        return engine(`ss:${tier}`, () => squareSplit![tier]);
      });
    }
    const sig = bands.join(',');
    let v = sigs.indexOf(sig);
    if (v < 0) {
      v = plans.length;
      plans.push(bands);
      sigs.push(sig);
    }
    return v;
  });
  void formIdx;
  return { units, plans, cellPlan, keys };
}

/** 一条谱的节点数 */
export function specNodes(spec: SkinSpec): number {
  return spec.reduce((a, seg) => a + (seg[1] as number), 0);
}

/**
 * 推进速率（步/s）：物理开销 ∝ 全场节点总量（引擎数 × 各自节数）。Lab 2-5 渐变（11 × 202 = 2222 节）与
 * Lab 2-6 捏分（10 × 338 = 3380）都跑 80；这台最重的一档（方环坡降 ≈ 6700 节）按 80 跑要一个核的一倍多，
 * 慢设备上每帧一步就掉帧。按节点量反比降速：≤ 4500 节仍 80，再往上等比降、下限 30
 * （1500 步 = 50 s 一轮）——慢是全场一起慢（定步、轨迹不变），不是抽搐。
 */
export const COMBO_RATE = { MAX: 80, MIN: 30, NODES_AT_MAX: 4500 } as const;
export function comboRate(units: readonly RingUnitDef[]): number {
  const nodes = units.reduce((a, u) => a + specNodes(u.spec), 0);
  return Math.max(COMBO_RATE.MIN, Math.min(COMBO_RATE.MAX, Math.round((COMBO_RATE.MAX * COMBO_RATE.NODES_AT_MAX) / Math.max(1, nodes))));
}

export interface ComboCell {
  x: number;
  z: number;
  plan: number;
}

/** 站位（世界单位）+ 每格用哪份编制。编制表只要下标，不要真引擎 */
export function comboCells(plan: ComboPlan, fam: ComboFamilyKey, formIdx: number, radius: number, spacing: ComboSpacingKey): ComboCell[] {
  const cp = comboCellPlan(plan, fam);
  return comboPositions(plan, fam, formIdx, radius, spacing).map((x, i) => ({ x: x * RIG_SCALE, z: 0, plan: cp[i] }));
}
/** 每个单元用第几份编制（相同的单元共用），不建引擎 */
export function comboCellPlan(plan: ComboPlan, fam: ComboFamilyKey): number[] {
  const sigs: string[] = [];
  return plan.units.map((u) => {
    const sig = u.kind === 'wave' ? `w:${unitLeads(u, fam).join(',')}` : `s:${splitOrder(fam, u.face).join(',')}`;
    let v = sigs.indexOf(sig);
    if (v < 0) {
      v = sigs.length;
      sigs.push(sig);
    }
    return v;
  });
}

/** 要糊缝的对：相切下的每条接缝（网从接缝那条带的外缘拉过去，落差大就是一道斜坡） */
export function comboBridges(plan: ComboPlan, spacing: ComboSpacingKey): (readonly [number, number])[] {
  if (spacing !== 'touch') return [];
  return Array.from({ length: plan.units.length - 1 }, (_, i) => [i, i + 1] as const);
}

// ── 摆进房间 ──────────────────────────────────────────────────────────────────────

/** 装置占宽（世界单位，见方取大边） */
export function comboFieldSpan(plan: ComboPlan, fam: ComboFamilyKey, formIdx: number, radius: number, spacing: ComboSpacingKey): number {
  const half = Math.max(...plan.units.map((u) => unitHalf(fam, u, formIdx)));
  return Math.max(comboExtent(plan, fam, formIdx, radius, spacing), 2 * half) * RIG_SCALE;
}

/** 布景：房间固定用 Lab 2-7 那一间（Lab 2-8 的拍板），小人站在整组近侧角外 */
export function comboScene(plan: ComboPlan, fam: ComboFamilyKey, formIdx: number, radius: number, spacing: ComboSpacingKey): SceneMesh[] {
  return sceneBySpan(comboFieldSpan(plan, fam, formIdx, radius, spacing), roomSpan(RING.RADIUS_DEF));
}

/** 取景：框整组 + 一圈留距（与 Lab 2-8 同一份解析式） */
export function comboCamScale(
  plan: ComboPlan,
  fam: ComboFamilyKey,
  formIdx: number,
  radius: number,
  spacing: ComboSpacingKey,
  view: string = 'axon',
): number {
  const v: RingGridView = view === 'front' || view === 'side' || view === 'top' ? view : 'axon';
  const span = comboFieldSpan(plan, fam, formIdx, radius, spacing) + 2 * ROOM.MARGIN;
  return viewFitBySpan(span, v) * RING_GRID_FIT;
}

/** 台架用：这一族的相位偏移与半径量程（方环按 30 标定、量程为零 ⇒ 台架不出滑块） */
export function comboFamilyRig(fam: ComboFamilyKey): { angleOffset: number; radius: { min: number; max: number; def: number } } {
  return fam === 'round'
    ? { angleOffset: 0, radius: { min: RING.RADIUS_MIN, max: RING.RADIUS_MAX, def: RING.RADIUS_DEF } }
    : { angleOffset: SQUARE_PHASE, radius: { min: SQUARE.RADIUS, max: SQUARE.RADIUS, def: SQUARE.RADIUS } };
}

// ── 读法 ───────────────────────────────────────────────────────────────────────────

const toM = (px2d: number): number => (px2d * RIG_SCALE * MM_PER_UNIT) / 1000;
/** 下缘离地（m） */
export const COMBO_FLOOR_M = toM((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / RIG_SCALE);

export interface ComboMetrics {
  joints: number;
  levelJoints: number;
  cavityJoints: number;
  maxStepM: number | null;
  /** 全组走面最低 / 最高离地，m */
  lowM: number | null;
  highM: number | null;
  /** 捏分腔净空，m（有捏分才有） */
  headroomM: number | null;
  /** 整列外缘到外缘，m */
  lengthM: number;
}

export function comboMetrics(plan: ComboPlan, fam: ComboFamilyKey, formIdx: number, radius: number, spacing: ComboSpacingKey): ComboMetrics {
  const F = FAMILY[fam];
  const joints = comboJoints(plan, fam, formIdx);
  let maxStep: number | null = null;
  let level = 0;
  let cav = 0;
  for (const j of joints) {
    if (j.cavity) {
      cav++;
      continue;
    }
    if (j.step === null) continue;
    const s = Math.abs(j.step);
    maxStep = maxStep === null ? s : Math.max(maxStep, s);
    if (s <= JOINT_LEVEL_TOL) level++;
  }
  let lo: number | null = null;
  let hi: number | null = null;
  const take = (d: number | null) => {
    if (d === null) return;
    lo = lo === null ? d : Math.min(lo, d);
    hi = hi === null ? d : Math.max(hi, d);
  };
  for (const u of plan.units) {
    if (u.kind === 'wave') for (const l of unitLeads(u, fam)) take(deckAt(fam, formIdx, l));
    else {
      take(F.shelf.deck);
      take(F.shelf.block);
    }
  }
  const hasSplit = plan.units.some((u) => u.kind === 'split');
  return {
    joints: joints.length,
    levelJoints: level,
    cavityJoints: cav,
    maxStepM: maxStep === null ? null : toM(maxStep),
    lowM: lo === null ? null : COMBO_FLOOR_M + toM(lo),
    highM: hi === null ? null : COMBO_FLOOR_M + toM(hi),
    headroomM: hasSplit ? toM(F.shelf.roof - F.shelf.deck) : null,
    lengthM: toM(comboExtent(plan, fam, formIdx, radius, spacing)),
  };
}

/** 一行给人读的结论（中 / 英）：由旋钮推出来，不按编制硬写 */
export function comboReading(plan: ComboPlan, fam: ComboFamilyKey, formIdx: number, radius: number, spacing: ComboSpacingKey, lang: 'zh' | 'en' = 'zh'): string {
  const m = comboMetrics(plan, fam, formIdx, radius, spacing);
  const en = lang === 'en';
  const parts: string[] = [];
  if (m.lowM === null) return en ? 'pockets — no walkable surface' : '袋——没有走面';
  const plain = m.joints - m.cavityJoints;
  if (plain) {
    if (m.levelJoints === plain) parts.push(en ? (plain === 1 ? 'seam level' : 'all seams level') : plain === 1 ? '接缝齐平' : '接缝全齐平');
    else parts.push(en ? `step of ${((m.maxStepM ?? 0) * 100).toFixed(0)} cm at the seam` : `接缝落差 ${((m.maxStepM ?? 0) * 100).toFixed(0)} cm`);
  }
  if (m.cavityJoints) parts.push(en ? `cavities join across the seam, ${(m.headroomM ?? 0).toFixed(2)} m headroom` : `两个腔在缝口接通，净空 ${(m.headroomM ?? 0).toFixed(2)} m`);
  else if (m.headroomM !== null) parts.push(en ? `one bay roofed, ${m.headroomM.toFixed(2)} m headroom` : `一格有顶，净空 ${m.headroomM.toFixed(2)} m`);
  parts.push(en ? `surface ${m.lowM.toFixed(2)}–${(m.highM as number).toFixed(2)} m above floor` : `走面离地 ${m.lowM.toFixed(2)}–${(m.highM as number).toFixed(2)} m`);
  if (spacing === 'apart') parts.push(en ? 'units stand apart' : '单元各自独立');
  return parts.join(' · ');
}
