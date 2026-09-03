/**
 * 项目二台架的差分清单（2026-09-03，用户拍板「收纳成七台四段」+「千万不要丢差分的可能性」）。
 *
 * 这是**单一来源**：各 wrapper 的编制／排布按钮从这里取键与标签，守门测试
 * （lab-variants.test.ts）把全部离散组合冻成一张 46 行的清单逐项比对——合并台架时
 * 最可能的事故是某一档被静默丢掉，而它形状合法、页面照样能跑，靠人眼核不住。
 *
 * 术语（与控制条两层一致）：
 * - **编制**（plan）：这台现在解的是哪一套单元／摆法，动了会重建引擎；
 * - **子选项**（sub）：只在某些编制下有意义的档（形态／轮廓），其余编制下留位变灰、不隐藏；
 * - **正交轴**（axis）：与编制无关、各编制都有的档（排布／间距）。
 *
 * 连续量（半径／蒙皮／速度滑块）不算差分——它们不是「档」。
 * 纯数据 + 纯函数，不 import 组件（组件文件带 WebGL 依赖，vitest 里不好直接 import）。
 */
import { SKIN_UNITS } from './skin-data';
import { DUAL_MID_OPTIONS } from './skin-dual';
import { SQUARE_GRID, SQUARE_MORPH } from './skin-square';
import { CLUSTER_PLANS, CLUSTER_RELATIONS } from './unit-cluster';

export interface VariantOption {
  key: string;
  label: string;
}
/** 编制下的子选项轴（形态／轮廓）：只在挂着它的编制下可选 */
export interface VariantSub {
  axis: string;
  options: readonly VariantOption[];
}
export interface VariantPlan extends VariantOption {
  sub?: VariantSub;
}
/** 与编制正交的轴（排布／间距）：每个编制下都可选 */
export interface VariantAxis {
  axis: string;
  options: readonly VariantOption[];
}
export interface BenchVariants {
  /** /lab 页序编号（Lab.NN），连续 */
  no: string;
  key: string;
  zh: string;
  en: string;
  /** 空 = 这台没有编制切换（一个组合） */
  plans: readonly VariantPlan[];
  axes: readonly VariantAxis[];
}

// ── 各台的编制／排布表（wrapper 从这里取；顺序 = 控制条上的顺序，首项 = 默认）────────

/** Lab.09 序列：Lab.08 目录渐变 + Lab.12 捏分十级（2026-09-03 合并） */
export const SERIES_PLANS = [
  { key: 'gradient', label: '目录渐变' },
  { key: 'split', label: '捏分' },
] as const;
export type SeriesPlanKey = (typeof SERIES_PLANS)[number]['key'];
/** 序列的两种排布（并拢 = 切片密排读剖面渐变；分列 = 拉开逐条读） */
export const SERIES_LAYOUTS = [
  { key: 'merged', label: '并拢' },
  { key: 'spread', label: '分列' },
] as const;

/** Lab.10 圆筒环：Lab.09 三种编制 + Lab.13 捏分环（2026-09-03 合并） */
export const RING_PLANS = [
  { key: 'wave', label: '一圈起伏' },
  { key: 'single', label: '整环同形' },
  { key: 'gradient', label: '一圈渐变' },
  { key: 'split', label: '捏分' },
] as const;
export type RingPlanKey = (typeof RING_PLANS)[number]['key'];

/** Lab.11 方形环（原 Lab.14）：三种编制 × 两种排布 × 轮廓五档 */
export const SQUARE_PLANS = [
  { key: 'flat', label: '整环平' },
  { key: 'wave', label: '一圈起伏' },
  { key: 'split', label: '捏分' },
] as const;
export type SquarePlanKey = (typeof SQUARE_PLANS)[number]['key'];
export const SQUARE_LAYOUTS = [
  { key: 'single', label: '单环' },
  { key: 'grid', label: `${SQUARE_GRID.COLS}×${SQUARE_GRID.ROWS}` },
] as const;
export type SquareLayoutKey = (typeof SQUARE_LAYOUTS)[number]['key'];

/** Lab.12 环阵列场地（原 Lab.10）：两种编制 */
export const GRID_PLANS = [
  { key: 'uniform', label: '整片同形' },
  { key: 'perRow', label: '每行一种' },
] as const;
export type GridPlanKey = (typeof GRID_PLANS)[number]['key'];

/** Lab.13 单元关系（2026-09-03 立项）：编制 = 几个单元怎么摆（2 / 3 / 4 / 9），关系五档为正交轴 */
export const CLUSTER_PLAN_OPTIONS = CLUSTER_PLANS.map((p) => ({ key: p.key, label: p.label }));
export const CLUSTER_RELATION_OPTIONS = CLUSTER_RELATIONS.map((r) => ({ key: r.key, label: r.label }));
const CLUSTER_RELATION_AXIS: VariantAxis = { axis: '关系', options: CLUSTER_RELATION_OPTIONS };

/** 目录四形态（袋 / 蘑菇挑台 / 直挑台 / 阶梯挑台方箱）——环族与场地的「形态」子选项 */
const FORM_OPTIONS: readonly VariantOption[] = SKIN_UNITS.map((d) => ({ key: d.key, label: d.zh }));
const FORM_SUB: VariantSub = { axis: '形态', options: FORM_OPTIONS };
/** 圆 ↔ 方五档（skin-square 的 SQUARE_MORPH.LABELS，2026-08-31 用户拍板的标签） */
const OUTLINE_SUB: VariantSub = {
  axis: '轮廓',
  options: SQUARE_MORPH.LABELS.map((label, i) => ({ key: `m${i}`, label })),
};
/** Lab.08 双结构带（原 Lab.11）：结构间距三档（skin-dual 的 DUAL_MID_OPTIONS） */
const DUAL_GAP_AXIS: VariantAxis = {
  axis: '间距',
  options: DUAL_MID_OPTIONS.map((m) => ({ key: String(m), label: String(m) })),
};

/** 八台五段（页序）：Ⅰ 单元 06–08 · Ⅱ 序列 09 · Ⅲ 环 10–11 · Ⅳ 场 12 · Ⅴ 单元之间 13 */
export const LAB_VARIANTS: readonly BenchVariants[] = [
  { no: '06', key: 'unit', zh: '二维皮肤单元', en: 'Contractile skin units', plans: [], axes: [] },
  { no: '07', key: 'solid', zh: '立体带', en: 'Skin units, solid', plans: [], axes: [] },
  { no: '08', key: 'dual', zh: '双结构带', en: 'Two structures, one band', plans: [], axes: [DUAL_GAP_AXIS] },
  {
    no: '09',
    key: 'series',
    zh: '序列',
    en: 'Series',
    plans: SERIES_PLANS,
    axes: [{ axis: '排布', options: SERIES_LAYOUTS }],
  },
  {
    no: '10',
    key: 'ring',
    zh: '圆筒环',
    en: 'Cylinder of units',
    plans: RING_PLANS.map((p) =>
      p.key === 'wave' || p.key === 'single' ? { ...p, sub: FORM_SUB } : { ...p },
    ),
    axes: [],
  },
  {
    no: '11',
    key: 'square',
    zh: '方形环',
    en: 'A square ring',
    plans: SQUARE_PLANS.map((p) => (p.key === 'split' ? { ...p } : { ...p, sub: OUTLINE_SUB })),
    axes: [{ axis: '排布', options: SQUARE_LAYOUTS }],
  },
  {
    no: '12',
    key: 'grid',
    zh: '环阵列场地',
    en: 'Four by four',
    plans: GRID_PLANS.map((p) => (p.key === 'uniform' ? { ...p, sub: FORM_SUB } : { ...p })),
    axes: [],
  },
  {
    no: '13',
    key: 'cluster',
    zh: '单元关系',
    en: 'Between units',
    // 交叠 × 三角 × {袋, 方箱} 与 交叠 × {一对, 方阵, 九宫} × 袋 在物理上装不下（unit-cluster.overlapFeasible），
    // 按钮变灰留位——档位仍在清单里，是「有这一档但这一档不成立」，不是丢了
    plans: CLUSTER_PLAN_OPTIONS.map((p) => ({ ...p, sub: FORM_SUB })),
    axes: [CLUSTER_RELATION_AXIS],
  },
];

/**
 * 一台的全部离散组合，写成可读的 id：`no:plan[.sub]:axis1:axis2…`。
 * 没有编制的台 = 一个组合（`no:-`），再与各正交轴做笛卡尔积。
 */
export function benchCombos(b: BenchVariants): string[] {
  const heads: string[] = b.plans.length
    ? b.plans.flatMap((p) => (p.sub ? p.sub.options.map((o) => `${p.key}.${o.key}`) : [p.key]))
    : ['-'];
  let out = heads.map((h) => `${b.no}:${h}`);
  for (const ax of b.axes) out = out.flatMap((id) => ax.options.map((o) => `${id}:${o.key}`));
  return out;
}

/** 全部台架的组合清单（守门冻结的对象） */
export function allCombos(vs: readonly BenchVariants[] = LAB_VARIANTS): string[] {
  return vs.flatMap(benchCombos);
}
