/**
 * 项目二 · 单元组合（Lab 2-11）——纯数据 + 纯几何，零 DOM。
 *
 * ## 立项与纠偏
 *
 * 2026-09-17 用户草图三张立项「研究不同形状的单元组合来形成不同的效果，比如通道型、共同构造的平台型、
 * 密闭空间型」。首版把「不同形状」读成目录里的五种形态（袋 / 蘑菇 / 直挑台 / 方箱 / 捏分）换槽位——
 * **读错了**。2026-09-20 用户纠偏：「假如我们就用平台，然后选择做一圈起伏，你看是不是这种有高有低的平台，
 * 那是不是有存在前后两个单元可以实现首尾相接一高一低的？」——**同一种平台，在「一圈起伏」下的高低**，
 * 几个单元挨着放、接缝处接高接低，合起来读成一条坡 / 一个台阶 / 一个凹处 / 一道拱。用户确认「这个思路是对的」。
 *
 * ## 单元
 *
 * 一个单元 = Lab 2-5 那种圆筒环（二十条 202 节的带绕一根立杆一圈，本模块一个数不改）+ **一圈起伏编制**：
 * 同一张键谱，每个方位一个 lead（形状在带上的位置，2 px/节），平台沿圆周从谷升到峰再回来（余弦，11 级）。
 * 起伏是纯平移（skin-ring 起伏编制守门过「形状逐点不变」），所以走面高度 = 走面基准 + 2·(RING_LEAD − lead)。
 * 量程 lead 14–58 = 88 px = 0.35 m（带子 202 节钉死给的硬上限）。
 *
 * ## 每个单元两个旋钮
 *
 * - **相位** `crest`：峰落在哪条带（0–19，方位 = crest·18°，0 = +X）；谷在对面那条带。
 * - **高度段** `low` / `high`：这个单元用量程的哪一段（lead 数值：low 是谷、high 是峰，low ≥ high）。
 *   整段 [58, 14] 就是 Lab 2-5 那个环；两个单元各用半段（58→36、36→14）就能首尾接平、合起来爬完 0.35 m。
 *
 * ## 接缝
 *
 * 两个单元相切时，接缝落在 A 朝向 B 的那条带与 B 朝向 A 的那条带上；两家在那里各是什么高度，由各自的相位
 * 与高度段定：同相 ⇒ A 峰对 B 谷 = 一个 0.35 m 的台阶；A 用下半段、B 用上半段且同相 ⇒ 接缝齐平 = 续坡；
 * 谷对谷 ⇒ 凹处；峰对峰 ⇒ 拱。几种接法是**编排**（引擎单剖面、单元之间不相互作用），一种形态只解
 * 「用到的那些 lead」各一条引擎，摆到用它的每个方位与每个单元。
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

// ── 形态：目录四形态都能起伏（同一副环族构造）；默认直挑台（用户「假如我们就用平台」）───────

/** 走面基准（lead = RING_LEAD 时材料最高处离下缘的高度，2D px；引擎实测，守门逐一核对）。袋没有走面 */
export const COMBO_DECK: readonly (number | null)[] = [null, 82.3, 77.2, 101.5];
export const COMBO_DEFAULT_FORM = 2;

/** 四种形态（与 Lab 2-5 / 2-8 同一份构造） */
export function comboForms(): RingUnitDef[] {
  return buildRingUnits();
}

// ── 起伏：高度段 → 11 级 lead；相位 → 每条带的 lead ────────────────────────────────

/** lead 的合法区间（起伏编制验过「形状逐点不变」的量程） */
export const COMBO_LEAD = { LOW: RING_WAVE.LOW, HIGH: RING_WAVE.HIGH } as const;
/** 整个量程的高差（2D px）= 2 px/节 × 节数 */
export const COMBO_RANGE_PX = 2 * (COMBO_LEAD.LOW - COMBO_LEAD.HIGH);

/**
 * 一段高度的 11 级 lead：在 [low, high] 之间按余弦（与 skin-ring.waveLeads 同一条公式，只是量程可给；
 * 整段时逐位 = waveLeads()）。low ≥ high（lead 越小越高）。
 */
export function segmentLeads(low: number, high: number): number[] {
  if (low < high || high < COMBO_LEAD.HIGH || low > COMBO_LEAD.LOW)
    throw new Error(`unit-combo: 高度段 [${low}, ${high}] 出了量程 [${COMBO_LEAD.LOW}, ${COMBO_LEAD.HIGH}]`);
  const L = RING_WAVE.LEVELS;
  return Array.from({ length: L }, (_, l) =>
    Math.round(low - (low - high) * ((1 - Math.cos((Math.PI * l) / (L - 1))) / 2)),
  );
}

export interface ComboUnit {
  /** 峰落在哪条带（0–19；方位 = crest × 18°，0 = +X，正向绕世界 Y 转向 +Z） */
  crest: number;
  /** 谷的 lead（数值大 = 低） */
  low: number;
  /** 峰的 lead（数值小 = 高） */
  high: number;
}

/** palindromeOrder 的 offset：级 10（峰）落在带 crest ⇔ (crest + offset) mod 20 = 10 */
export function crestOffset(crest: number, count: number = RING.COUNT): number {
  const half = count / 2;
  return (((half - crest) % count) + count) % count;
}

/** 一个单元二十条带各自的 lead */
export function unitLeads(u: ComboUnit, count: number = RING.COUNT): number[] {
  const lv = segmentLeads(u.low, u.high);
  return palindromeOrder(count, RING_WAVE.LEVELS, crestOffset(u.crest, count)).map((l) => lv[l]);
}

/** 走面高度（2D px，离下缘）：起伏是纯平移，lead 每少一节形状上移 2 px */
export function deckAt(formIdx: number, lead: number): number | null {
  const d = COMBO_DECK[formIdx];
  return d === null ? null : d + 2 * (RING_LEAD - lead);
}

// ── 组合：几个单元、各自的相位与高度段、摆在哪 ────────────────────────────────────────

export interface ComboPlan {
  key: string;
  zh: string;
  en: string;
  label: string;
  /** 站位（以相切间距为单位；相邻 = 1）*/
  positions: readonly { x: number; z: number }[];
  units: readonly ComboUnit[];
}

const FULL = { low: COMBO_LEAD.LOW, high: COMBO_LEAD.HIGH } as const;
const MID = Math.round((COMBO_LEAD.LOW + COMBO_LEAD.HIGH) / 2); // 36
const T1 = Math.round(COMBO_LEAD.LOW - (COMBO_LEAD.LOW - COMBO_LEAD.HIGH) / 3); // 43
const T2 = Math.round(COMBO_LEAD.LOW - (2 * (COMBO_LEAD.LOW - COMBO_LEAD.HIGH)) / 3); // 29
const row = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, z: 0 }));

/**
 * 预设 = 线稿（scripts/unit-combo/wave-draft.mjs）里用户看过的五种接法；用户的图形到了按同一套字段追加。
 * 一列沿 +X 排，接缝在 A 的带 0（+X）与 B 的带 10（−X）上：crest 0 = 峰朝下一个单元。
 */
export const COMBO_PLANS: readonly ComboPlan[] = [
  {
    key: 'step',
    zh: '台阶',
    en: 'a step',
    label: '台阶',
    positions: row(2),
    units: [
      { crest: 0, ...FULL },
      { crest: 0, ...FULL },
    ],
  },
  {
    key: 'ramp',
    zh: '续坡',
    en: 'a ramp',
    label: '续坡',
    positions: row(2),
    units: [
      { crest: 0, low: COMBO_LEAD.LOW, high: MID },
      { crest: 0, low: MID, high: COMBO_LEAD.HIGH },
    ],
  },
  {
    key: 'ramp3',
    zh: '三段续坡',
    en: 'a ramp in three',
    label: '三段坡',
    positions: row(3),
    units: [
      { crest: 0, low: COMBO_LEAD.LOW, high: T1 },
      { crest: 0, low: T1, high: T2 },
      { crest: 0, low: T2, high: COMBO_LEAD.HIGH },
    ],
  },
  {
    key: 'valley',
    zh: '谷对谷',
    en: 'a hollow',
    label: '凹',
    positions: row(2),
    units: [
      { crest: 10, ...FULL },
      { crest: 0, ...FULL },
    ],
  },
  {
    key: 'arch',
    zh: '峰对峰',
    en: 'an arch',
    label: '拱',
    positions: row(2),
    units: [
      { crest: 0, ...FULL },
      { crest: 10, ...FULL },
    ],
  },
];
export type ComboPlanKey = (typeof COMBO_PLANS)[number]['key'];

export function comboPlan(key: string): ComboPlan {
  const p = COMBO_PLANS.find((q) => q.key === key);
  if (!p) throw new Error(`unit-combo: 没有这种组合 ${key}`);
  return p;
}

/** 距离两档：相切（平台边贴边——这台的题目是「接起来」）· 分离（Lab 2-7 的环间缝） */
export const COMBO_SPACINGS = [
  { key: 'touch', label: '相切', zh: '相切', en: 'touching' },
  { key: 'apart', label: '分离', zh: '分离', en: 'apart' },
] as const;
export type ComboSpacingKey = (typeof COMBO_SPACINGS)[number]['key'];

// ── 站位 ───────────────────────────────────────────────────────────────────────────

/** 相邻两个单元的芯心距（2D px）：相切 = 两个外缘（按挑出峰值）；分离再加 Lab 2-7 的环间缝 */
export function comboPitch(formIdx: number, radius: number, spacing: ComboSpacingKey): number {
  const d = 2 * (radius + UNIT_FORMS[formIdx].peakReach);
  return spacing === 'apart' ? d + ringCellGap(radius) : d;
}

/** 站位（2D px；整组按包围盒居中）*/
export function comboPositions(plan: ComboPlan, formIdx: number, radius: number, spacing: ComboSpacingKey): { x: number; z: number }[] {
  const p = comboPitch(formIdx, radius, spacing);
  const xs = plan.positions.map((q) => q.x);
  const zs = plan.positions.map((q) => q.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  return plan.positions.map((q) => ({ x: (q.x - cx) * p, z: (q.z - cz) * p }));
}

/** 相邻对（站位相距恰为 1）——接缝就在这些对上 */
export function comboAdjacent(plan: ComboPlan): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  const P = plan.positions;
  for (let i = 0; i < P.length; i++)
    for (let j = i + 1; j < P.length; j++)
      if (Math.abs(Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z) - 1) < 1e-9) out.push([i, j]);
  return out;
}

/** 朝向某个方向（弧度，0 = +X，正向转向 +Z）的那条带 */
export function bandToward(dir: number, count: number = RING.COUNT): number {
  const step = (Math.PI * 2) / count;
  return ((Math.round(dir / step) % count) + count) % count;
}

export interface ComboJoint {
  a: number;
  b: number;
  /** A 朝向 B 的带、B 朝向 A 的带 */
  bandA: number;
  bandB: number;
  /** 两家在接缝处的走面高度（2D px，离下缘；袋 = null） */
  deckA: number | null;
  deckB: number | null;
  /** 落差（2D px，B − A；袋 = null） */
  step: number | null;
}

/** 每条接缝两家各是什么高度 */
export function comboJoints(plan: ComboPlan, formIdx: number): ComboJoint[] {
  return comboAdjacent(plan).map(([a, b]) => {
    const dir = Math.atan2(plan.positions[b].z - plan.positions[a].z, plan.positions[b].x - plan.positions[a].x);
    const bandA = bandToward(dir);
    const bandB = bandToward(dir + Math.PI);
    const deckA = deckAt(formIdx, unitLeads(plan.units[a])[bandA]);
    const deckB = deckAt(formIdx, unitLeads(plan.units[b])[bandB]);
    return { a, b, bandA, bandB, deckA, deckB, step: deckA === null || deckB === null ? null : deckB - deckA };
  });
}

/** 接缝齐平的判据（2D px）：3 cm 以内脚感读作同一片 */
export const JOINT_LEVEL_TOL = 7.6;

// ── 解什么、摆到哪 ───────────────────────────────────────────────────────────────────

export interface ComboBuild {
  /** 用到的每个 lead 一条引擎（跨单元去重：续坡两段共用中间那个 lead） */
  units: RingUnitDef[];
  /** 每份编制 = 二十条带各用第几条引擎（每个单元一份；完全相同的单元共用一份） */
  plans: number[][];
  /** 每个站位用第几份编制 */
  cellPlan: number[];
  /** 每条引擎的 lead */
  leads: number[];
}

/** 同一张键谱搬到某个 lead 上（lead + tail 恒定 ⇒ 筒的上下缘不动、形状纯平移——Lab 2-8 同一做法） */
export function unitAtLead(form: RingUnitDef, lead: number): RingUnitDef {
  const sum = RING_LEAD + RING_TAIL;
  return { ...form, key: `${form.key}-l${lead}`, spec: [['g', lead], form.spec[1], ['g', sum - lead]] as SkinSpec };
}

export function comboBuild(plan: ComboPlan, form: RingUnitDef): ComboBuild {
  const leads: number[] = [];
  const engineOf = (lead: number): number => {
    let v = leads.indexOf(lead);
    if (v < 0) {
      v = leads.length;
      leads.push(lead);
    }
    return v;
  };
  const plans: number[][] = [];
  const sigs: string[] = [];
  const cellPlan = plan.units.map((u) => {
    const bands = unitLeads(u).map(engineOf);
    const sig = bands.join(',');
    let v = sigs.indexOf(sig);
    if (v < 0) {
      v = plans.length;
      plans.push(bands);
      sigs.push(sig);
    }
    return v;
  });
  return { units: leads.map((l) => unitAtLead(form, l)), plans, cellPlan, leads };
}

export interface ComboCell {
  x: number;
  z: number;
  plan: number;
}

/** 站位（世界单位）+ 每格用哪份编制 */
export function comboCells(plan: ComboPlan, formIdx: number, radius: number, spacing: ComboSpacingKey): ComboCell[] {
  const cp = comboBuild(plan, COMBO_STUB).cellPlan;
  return comboPositions(plan, formIdx, radius, spacing).map((q, i) => ({ x: q.x * RIG_SCALE, z: q.z * RIG_SCALE, plan: cp[i] }));
}
/** 站位只要编制表，不要真引擎 */
const COMBO_STUB: RingUnitDef = { key: 'stub', zh: '', en: '', spec: [['g', 0], ['g', 0], ['g', 0]] as unknown as SkinSpec, opts: {}, smooth: [3, 1] };

/** 要糊缝的对：相切下的每条接缝（网从接缝那条带的外缘拉过去，落差大就是一道斜坡） */
export function comboBridges(plan: ComboPlan, spacing: ComboSpacingKey): (readonly [number, number])[] {
  return spacing === 'touch' ? comboAdjacent(plan) : [];
}

// ── 摆进房间 ──────────────────────────────────────────────────────────────────────

/** 装置占宽（世界单位，见方取大边）：最远站位 + 平台外缘 */
export function comboFieldSpan(plan: ComboPlan, formIdx: number, radius: number, spacing: ComboSpacingKey): number {
  const pos = comboPositions(plan, formIdx, radius, spacing);
  let far = 0;
  for (const q of pos) far = Math.max(far, Math.abs(q.x), Math.abs(q.z));
  return (2 * far + 2 * (radius + UNIT_FORMS[formIdx].peakReach)) * RIG_SCALE;
}

/** 布景：房间固定用 Lab 2-7 那一间（Lab 2-8 的拍板），小人站在整组近侧角外 */
export function comboScene(plan: ComboPlan, formIdx: number, radius: number, spacing: ComboSpacingKey): SceneMesh[] {
  return sceneBySpan(comboFieldSpan(plan, formIdx, radius, spacing), roomSpan(radius));
}

/** 取景：框整组 + 一圈留距（与 Lab 2-8 同一份解析式） */
export function comboCamScale(
  plan: ComboPlan,
  formIdx: number,
  radius: number,
  spacing: ComboSpacingKey,
  view: string = 'axon',
): number {
  const v: RingGridView = view === 'front' || view === 'side' || view === 'top' ? view : 'axon';
  const span = comboFieldSpan(plan, formIdx, radius, spacing) + 2 * ROOM.MARGIN;
  return viewFitBySpan(span, v) * RING_GRID_FIT;
}

// ── 读法 ───────────────────────────────────────────────────────────────────────────

const toM = (px2d: number): number => (px2d * RIG_SCALE * MM_PER_UNIT) / 1000;
/** 下缘离地（m） */
export const COMBO_FLOOR_M = toM((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / RIG_SCALE);

export interface ComboMetrics {
  /** 接缝数 */
  joints: number;
  /** 齐平的接缝数 */
  levelJoints: number;
  /** 最大落差，m（袋 = null） */
  maxStepM: number | null;
  /** 全组走面最低 / 最高离地，m（袋 = null） */
  lowM: number | null;
  highM: number | null;
  /** 芯心距，m */
  pitchM: number;
}

export function comboMetrics(plan: ComboPlan, formIdx: number, radius: number, spacing: ComboSpacingKey): ComboMetrics {
  const joints = comboJoints(plan, formIdx);
  let maxStep: number | null = null;
  let level = 0;
  for (const j of joints) {
    if (j.step === null) continue;
    const s = Math.abs(j.step);
    maxStep = maxStep === null ? s : Math.max(maxStep, s);
    if (s <= JOINT_LEVEL_TOL) level++;
  }
  let lo: number | null = null;
  let hi: number | null = null;
  for (const u of plan.units)
    for (const l of unitLeads(u)) {
      const d = deckAt(formIdx, l);
      if (d === null) continue;
      lo = lo === null ? d : Math.min(lo, d);
      hi = hi === null ? d : Math.max(hi, d);
    }
  return {
    joints: joints.length,
    levelJoints: level,
    maxStepM: maxStep === null ? null : toM(maxStep),
    lowM: lo === null ? null : COMBO_FLOOR_M + toM(lo),
    highM: hi === null ? null : COMBO_FLOOR_M + toM(hi),
    pitchM: toM(comboPitch(formIdx, radius, spacing)),
  };
}

/** 一行给人读的结论（中 / 英）：由相位与高度段推出来，不按编制硬写 */
export function comboReading(plan: ComboPlan, formIdx: number, radius: number, spacing: ComboSpacingKey, lang: 'zh' | 'en' = 'zh'): string {
  const m = comboMetrics(plan, formIdx, radius, spacing);
  const en = lang === 'en';
  const parts: string[] = [];
  if (m.lowM === null) return en ? 'pockets — no walkable surface' : '袋——没有走面';
  if (m.joints) {
    if (m.levelJoints === m.joints)
      parts.push(en ? `${m.joints === 1 ? 'seam' : 'all seams'} level` : m.joints === 1 ? '接缝齐平' : '接缝全齐平');
    else parts.push(en ? `step of ${((m.maxStepM ?? 0) * 100).toFixed(0)} cm at the seam` : `接缝落差 ${((m.maxStepM ?? 0) * 100).toFixed(0)} cm`);
  }
  parts.push(en ? `surface ${m.lowM.toFixed(2)}–${(m.highM as number).toFixed(2)} m above floor` : `走面离地 ${m.lowM.toFixed(2)}–${(m.highM as number).toFixed(2)} m`);
  if (spacing === 'apart') parts.push(en ? 'units stand apart' : '单元各自独立');
  return parts.join(' · ');
}
