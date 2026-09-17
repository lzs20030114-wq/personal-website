/**
 * 项目二 · 单元组合（Lab 2-11，2026-09-17 用户草图立项：「研究不同形状的单元组合来形成不同的
 * 效果，比如通道型、共同构造的平台型、密闭空间型」）——纯数据 + 纯几何，零 DOM。
 *
 * ## 一、这台在问什么
 *
 * Lab 2-8 把**同一种**单元摆成几种关系；这台把**不同形状**的单元摆在一起，问它们合起来读成什么
 * 空间：一条走道、一片共用的平台、一个能钻进去的腔。单元仍是 Lab 2-5 那种圆筒环（二十条带绕
 * 一根立杆一圈），本模块一个数不改、只引用；新加进这一族的是**捏分**那一档（Lab 2-5 捏分编制的
 * j0：两片台夹一道 100 px 的缝，t=1），它带的是自己的 338 节带子——形态词汇因此有五个：
 *
 *   袋 · 蘑菇挑台 · 直挑台 · 阶梯方箱 · 捏分（双平台）
 *
 * 五种的立面关键量（2D px，以钉住的下缘为 0、向上为正；守门 unit-combo.test 跑引擎逐一核对）
 * 才是这台的材料：三种挑台的**走面**（材料最高处）在 77–102 之间，捏分的**下板顶** 78.4 与直挑台
 * 的走面 77.2 只差 1.2 px（半厘米）——一条走道走进捏分那一格、头顶多出一片顶板，脚下几乎不变，
 * 这就是「通道型」的物理依据。
 *
 * ## 二、三种组合是草图给的，形状按槽位可换
 *
 * 用户草图三张：① 一列四个、剖面各异 ⇒ **通道**；② 两根立杆、两片台在中间接上 ⇒ **平台**；
 * ③ 两个 C 形剖面开口相对、合围出一个框 ⇒ **密闭**。每种组合是「几个槽位 + 每槽一个默认形态」，
 * 槽位上的形态现场可换——这台的仪器就是换形状看效果。
 *
 * ## 三、间距仍然是量出来的
 *
 * 相切 = 平台边贴边：相邻两个单元的芯心距 = (R + 挑出峰值ᵢ) + (R + 挑出峰值ⱼ)，逐对累加（形状
 * 不同挑出不同，所以不是等距）。分离 = 相切再加 Lab 2-7 的环间缝。捏分的挑出峰值 84.25 略大于
 * 终态 83.09，间距按峰值——成形期不许撞上（Lab 2-7 的教训）。
 *
 * ## 四、织物网只糊同一族的缝
 *
 * Lab 2-8 的织物网从两圈的外缘顶/底拉过去。捏分的外缘是整个 62–195 那一段（两片台连缝），把它
 * 和一片 27 px 厚的直挑台拉在一起就是一张 0.5 m 高的帆，不是缝。故网只搭在**同族**的相邻对上：
 * 三种挑台之间（顶面读作一片，厚薄差成一道斜坡）、捏分与捏分之间（两个腔在缝口接通、上下板各连成
 * 一片）、袋与袋之间。挑台与捏分之间不搭：走面本来就几乎齐平，靠得住的是脚下那条线。
 */
import { RING, buildRingUnits, type RingUnitDef } from './skin-ring';
import { buildSplitRingUnits, SPLIT_RING_TIERS } from './skin-split-ring';
import {
  MM_PER_UNIT,
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

// ── 形态词汇：五种单元的实测量 ───────────────────────────────────────────────────────

/** 单元在组合里能当什么：deck = 有走面的挑台 · split = 两片台夹一道缝 · bag = 挂着的袋 */
export type ComboFamily = 'deck' | 'split' | 'bag';

export interface ComboFormMetrics {
  key: string;
  zh: string;
  en: string;
  /** 控制条上的短标签 */
  short: string;
  family: ComboFamily;
  /** 带子节数（目录四形态 202；捏分 338） */
  band: number;
  /** 终态挑出 */
  reach: number;
  /** 全程挑出峰值（间距按它） */
  peakReach: number;
  /** 材料最高处（离轴 > 8 px 的节点）——挑台的走面就是它 */
  top: number;
  /** 材料最低处 */
  bot: number;
  /** 走面高度：挑台 = top；捏分 = 下板顶；袋 = 无 */
  deck: number | null;
  /** 顶板底面（只有捏分有）：腔的净空 = roof − deck */
  roof: number | null;
}

/**
 * 顺序 = 目录序 + 捏分（与 `comboFormDefs()` 同序）。数字是引擎实测（scratchpad measure 脚本，
 * 2026-09-17），守门逐一核对；捏分取 Lab 2-5 捏分编制的 j0（t=1，缝张到 100）。
 */
export const COMBO_FORMS: readonly ComboFormMetrics[] = [
  { key: 'pocket', zh: '袋', en: 'pocket', short: '袋', family: 'bag', band: 202, reach: 63.4, peakReach: 63.4, top: 144.5, bot: 82.2, deck: null, roof: null },
  { key: 'bulb', zh: '蘑菇挑台', en: 'bulb', short: '蘑菇', family: 'deck', band: 202, reach: 99.5, peakReach: 99.5, top: 82.3, bot: 48.6, deck: 82.3, roof: null },
  { key: 'ledge', zh: '直挑台', en: 'ledge', short: '直台', family: 'deck', band: 202, reach: 101.0, peakReach: 101.0, top: 77.2, bot: 50.5, deck: 77.2, roof: null },
  { key: 'stepped', zh: '阶梯方箱', en: 'stepped box', short: '方箱', family: 'deck', band: 202, reach: 82.2, peakReach: 82.2, top: 101.5, bot: 33.4, deck: 101.5, roof: null },
  { key: 'split', zh: '捏分', en: 'split', short: '捏分', family: 'split', band: 338, reach: 83.1, peakReach: 84.3, top: 194.7, bot: 62.4, deck: 78.4, roof: 177.8 },
];
export const COMBO_FORM_COUNT = COMBO_FORMS.length;
/** 捏分在词汇表里的下标（引擎表里它是 buildSplitRingUnits 的 j0） */
export const COMBO_SPLIT = 4;

export function comboFormIndex(key: string): number {
  const i = COMBO_FORMS.findIndex((f) => f.key === key);
  if (i < 0) throw new Error(`unit-combo: 没有这种形态 ${key}`);
  return i;
}

/** 五条引擎（与 Lab 2-5 / 2-8 同一份构造）：目录四形态 + 捏分 j0 */
export function comboFormDefs(): RingUnitDef[] {
  const split = buildSplitRingUnits([SPLIT_RING_TIERS[0]])[0];
  return [...buildRingUnits(), { ...split, key: 'split', zh: '捏分', en: 'split' }];
}

// ── 组合：草图三张 ─────────────────────────────────────────────────────────────────

export interface ComboPlan {
  key: string;
  zh: string;
  en: string;
  label: string;
  /** 槽位默认形态（词汇表下标）；槽数 = 长度 */
  slots: readonly number[];
}

export const COMBO_PLANS: readonly ComboPlan[] = [
  // ① 一列四个：三片走面夹一格有顶的——走进去、头顶多出一片板，脚下不变
  { key: 'passage', zh: '通道', en: 'a passage', label: '通道', slots: [2, 2, 4, 2] },
  // ② 两根立杆、两片台在中间接上：厚薄不同的两片合成一片
  { key: 'platform', zh: '平台', en: 'a shared platform', label: '平台', slots: [2, 1] },
  // ③ 两个 C 形开口相对：两个腔在缝口接通
  { key: 'enclosure', zh: '密闭', en: 'an enclosure', label: '密闭', slots: [4, 4] },
];
export type ComboPlanKey = (typeof COMBO_PLANS)[number]['key'];

export function comboPlan(key: string): ComboPlan {
  const p = COMBO_PLANS.find((q) => q.key === key);
  if (!p) throw new Error(`unit-combo: 没有这种组合 ${key}`);
  return p;
}

/** 距离两档：相切（平台边贴边——这台的题目是「合起来」）· 分离（Lab 2-7 的环间缝） */
export const COMBO_SPACINGS = [
  { key: 'touch', label: '相切', zh: '相切', en: 'touching' },
  { key: 'apart', label: '分离', zh: '分离', en: 'apart' },
] as const;
export type ComboSpacingKey = (typeof COMBO_SPACINGS)[number]['key'];

// ── 站位 ───────────────────────────────────────────────────────────────────────────

/** 相邻两个单元必须隔开多远（2D px，芯心距） */
export function comboPairDistance(a: number, b: number, radius: number, spacing: ComboSpacingKey): number {
  const d = 2 * radius + COMBO_FORMS[a].peakReach + COMBO_FORMS[b].peakReach;
  return spacing === 'apart' ? d + ringCellGap(radius) : d;
}

/** 每个槽位的芯心 x（2D px，整列以外缘为准居中；z 恒 0） */
export function comboPositions(forms: readonly number[], radius: number, spacing: ComboSpacingKey): number[] {
  const xs = [0];
  for (let i = 1; i < forms.length; i++) xs.push(xs[i - 1] + comboPairDistance(forms[i - 1], forms[i], radius, spacing));
  const left = xs[0] - (radius + COMBO_FORMS[forms[0]].peakReach);
  const right = xs[xs.length - 1] + radius + COMBO_FORMS[forms[forms.length - 1]].peakReach;
  const mid = (left + right) / 2;
  return xs.map((x) => x - mid);
}

/** 整列的占宽（2D px，外缘到外缘） */
export function comboExtent(forms: readonly number[], radius: number, spacing: ComboSpacingKey): number {
  const xs = comboPositions(forms, radius, spacing);
  return xs[xs.length - 1] - xs[0] + 2 * radius + COMBO_FORMS[forms[0]].peakReach + COMBO_FORMS[forms[forms.length - 1]].peakReach;
}

// ── 解什么、摆到哪 ───────────────────────────────────────────────────────────────────

export interface ComboBuild {
  /** 去重后的引擎（一种形态解一条，摆到用它的每个槽位） */
  units: RingUnitDef[];
  /** 环编制表：第 v 份 = 二十条带全指第 v 条引擎 */
  plans: number[][];
  /** 每个槽位用第几份编制 */
  cellPlan: number[];
  /** 每份编制对应的形态下标 */
  planForm: number[];
}

/** 一种形态只解一条：四个直挑台 + 一个捏分 = 两条引擎、五处摆放 */
export function comboBuild(forms: readonly number[], defs: readonly RingUnitDef[] = comboFormDefs()): ComboBuild {
  const planForm: number[] = [];
  const cellPlan = forms.map((f) => {
    let v = planForm.indexOf(f);
    if (v < 0) {
      v = planForm.length;
      planForm.push(f);
    }
    return v;
  });
  const units = planForm.map((f) => defs[f]);
  const plans = planForm.map((_, v) => new Array<number>(RING.COUNT).fill(v));
  return { units, plans, cellPlan, planForm };
}

export interface ComboCell {
  x: number;
  z: number;
  plan: number;
}

/** 站位（世界单位；整列居中在原点）+ 每格用哪份编制 */
export function comboCells(forms: readonly number[], radius: number, spacing: ComboSpacingKey): ComboCell[] {
  const xs = comboPositions(forms, radius, spacing);
  const { cellPlan } = comboBuild(forms, COMBO_DEF_STUB);
  return xs.map((x, i) => ({ x: x * RIG_SCALE, z: 0, plan: cellPlan[i] }));
}
/** comboBuild 只用 defs 的下标去重——站位不需要真引擎，给一份空壳免得每次重建五条谱 */
const COMBO_DEF_STUB: readonly RingUnitDef[] = COMBO_FORMS.map((f) => ({
  key: f.key,
  zh: f.zh,
  en: f.en,
  spec: [],
  opts: {},
  smooth: [3, 1] as const,
}));

/**
 * 要糊缝的相邻对：相切、且**同族**（见文件头 §四）。
 * 挑台 × 挑台 = 走面连成一片；捏分 × 捏分 = 两个腔接通；袋 × 袋 = 两个袋并成一个。
 */
export function comboBridges(forms: readonly number[], spacing: ComboSpacingKey): (readonly [number, number])[] {
  if (spacing !== 'touch') return [];
  const out: (readonly [number, number])[] = [];
  for (let i = 1; i < forms.length; i++)
    if (COMBO_FORMS[forms[i - 1]].family === COMBO_FORMS[forms[i]].family) out.push([i - 1, i]);
  return out;
}

// ── 摆进房间 ──────────────────────────────────────────────────────────────────────

/** 装置占宽（世界单位）：整列外缘到外缘 */
export function comboFieldSpan(forms: readonly number[], radius: number, spacing: ComboSpacingKey): number {
  return comboExtent(forms, radius, spacing) * RIG_SCALE;
}

/** 布景：房间固定用 Lab 2-7 那一间（Lab 2-8 的拍板：背景不该跟着主体呼吸），小人站在整列近侧角外 */
export function comboScene(forms: readonly number[], radius: number, spacing: ComboSpacingKey): SceneMesh[] {
  return sceneBySpan(comboFieldSpan(forms, radius, spacing), roomSpan(radius));
}

/** 取景：框整列 + 一圈留距（与 Lab 2-8 同一份解析式，逐视角逐半径现算） */
export function comboCamScale(
  forms: readonly number[],
  radius: number,
  spacing: ComboSpacingKey,
  view: string = 'axon',
): number {
  const v: RingGridView = view === 'front' || view === 'side' || view === 'top' ? view : 'axon';
  const span = comboFieldSpan(forms, radius, spacing) + 2 * ROOM.MARGIN;
  return viewFitBySpan(span, v) * RING_GRID_FIT;
}

// ── 读法：这一列合起来是什么 ────────────────────────────────────────────────────────

const toM = (px2d: number): number => (px2d * RIG_SCALE * MM_PER_UNIT) / 1000;

export interface ComboMetrics {
  /** 整列外缘到外缘，m */
  lengthM: number;
  /** 相邻两个单元的芯心距，m（逐对） */
  pitchesM: number[];
  /** 走面：相邻两个都有走面的对里，走面高差的最大值，m；没有这样的对 = null */
  deckStepM: number | null;
  /** 走面连续的相邻对数（高差 ≤ DECK_LEVEL_TOL） */
  levelPairs: number;
  /** 有走面的槽位数 */
  deckSlots: number;
  /** 有顶板的槽位数（捏分） */
  roofSlots: number;
  /** 捏分的腔净空，m（有捏分才有） */
  cavityM: number | null;
  /** 相邻两个捏分接通后的腔跨度（缝口到缝口，两个挑出），m；没有这样的对 = null */
  cavitySpanM: number | null;
  /** 袋的槽位数 */
  bagSlots: number;
}

/** 走面连续的判据（2D px）：3 cm 以内脚感读作同一片 */
export const DECK_LEVEL_TOL = 7.6;

export function comboMetrics(forms: readonly number[], radius: number, spacing: ComboSpacingKey): ComboMetrics {
  const xs = comboPositions(forms, radius, spacing);
  const pitchesM = xs.slice(1).map((x, i) => toM(x - xs[i]));
  let deckStep: number | null = null;
  let levelPairs = 0;
  let cavitySpan: number | null = null;
  for (let i = 1; i < forms.length; i++) {
    const a = COMBO_FORMS[forms[i - 1]];
    const b = COMBO_FORMS[forms[i]];
    // 捏分对捏分：两片下板本来就是同一张表上的同一个高度，「走面落差」没有信息，那一对只按腔读
    if (a.family === 'split' && b.family === 'split') {
      if (spacing === 'touch') cavitySpan = Math.max(cavitySpan ?? 0, a.reach + b.reach);
      continue;
    }
    if (a.deck !== null && b.deck !== null) {
      const d = Math.abs(a.deck - b.deck);
      deckStep = deckStep === null ? d : Math.max(deckStep, d);
      if (d <= DECK_LEVEL_TOL) levelPairs++;
    }
  }
  const split = COMBO_FORMS[COMBO_SPLIT];
  const roofSlots = forms.filter((f) => COMBO_FORMS[f].roof !== null).length;
  return {
    lengthM: toM(comboExtent(forms, radius, spacing)),
    pitchesM,
    deckStepM: deckStep === null ? null : toM(deckStep),
    levelPairs,
    deckSlots: forms.filter((f) => COMBO_FORMS[f].deck !== null).length,
    roofSlots,
    cavityM: roofSlots ? toM((split.roof as number) - (split.deck as number)) : null,
    cavitySpanM: cavitySpan === null ? null : toM(cavitySpan),
    bagSlots: forms.filter((f) => COMBO_FORMS[f].family === 'bag').length,
  };
}

/** 一行给人读的结论（中 / 英）：由槽位形态推出来，不是按编制硬写 */
export function comboReading(forms: readonly number[], radius: number, spacing: ComboSpacingKey, lang: 'zh' | 'en' = 'zh'): string {
  const m = comboMetrics(forms, radius, spacing);
  const en = lang === 'en';
  const parts: string[] = [];
  const deckPairs = forms
    .slice(1)
    .filter((f, i) => {
      const a = COMBO_FORMS[forms[i]];
      const b = COMBO_FORMS[f];
      return a.deck !== null && b.deck !== null && !(a.family === 'split' && b.family === 'split');
    }).length;
  if (deckPairs) {
    const cm = ((m.deckStepM ?? 0) * 100).toFixed(1);
    if (m.levelPairs === deckPairs)
      parts.push(en ? `walkable surface continuous (step ≤ ${cm} cm)` : `走面连续（落差 ≤ ${cm} cm）`);
    else parts.push(en ? `walkable surface steps ${cm} cm` : `走面有 ${cm} cm 的台阶`);
  }
  if (m.roofSlots)
    parts.push(
      en
        ? `${m.roofSlots} bay${m.roofSlots > 1 ? 's' : ''} roofed, ${(m.cavityM ?? 0).toFixed(2)} m headroom`
        : `${m.roofSlots} 格有顶，净空 ${(m.cavityM ?? 0).toFixed(2)} m`,
    );
  if (m.cavitySpanM !== null)
    parts.push(en ? `cavities join across the seam, ${m.cavitySpanM.toFixed(2)} m deep` : `两个腔在缝口接通，深 ${m.cavitySpanM.toFixed(2)} m`);
  if (m.bagSlots) parts.push(en ? `${m.bagSlots} hanging pocket${m.bagSlots > 1 ? 's' : ''}` : `${m.bagSlots} 个挂袋`);
  if (spacing === 'apart') parts.push(en ? 'units stand apart' : '单元各自独立');
  return parts.join(en ? ' · ' : ' · ');
}
