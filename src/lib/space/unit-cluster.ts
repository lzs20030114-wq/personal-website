/**
 * 项目二 · 单元关系（Lab.13，2026-09-03 用户立项：「我们先命名一个环形的压缩表皮形成平台的
 * 结构叫做一个单元，这个 lab 或者说接下来要做的一组 lab、就来研究几个单元比如两个或者三个
 * 四个九个单元之间可形成的关系」）——纯数据 + 纯几何，零 DOM。
 *
 * ## 一、什么是「一个单元」
 *
 * 一个单元 = Lab.10 那种**圆筒环**：二十条 202 节的窄带绕一根竖立杆排一圈（站位半径 R，
 * 默认 30），同一张键谱、同一收缩协议；收缩后每条带各自扣出一个挑台，二十个挑台连成绕
 * 筒一圈的**环形平台**。它有四个已经定好的旋钮，本模块一个数不改、只引用：
 *   形态（目录四键谱，`buildRingUnits`）· 半径（滑块 26–90）· 高度（`lead`，形状在带上的位置，
 *   2px/节，起伏编制验过的量程 LOW 58 → HIGH 14）· 蒙皮（环间膜 0–1）。
 * 装置在房间里按 RIG_SCALE 0.5 摆、下缘钉在离地 1.08 m（skin-grid 的定案），故这里所有
 * 「2D px」量到世界要 ×0.5，到米再 × MM_PER_UNIT。
 *
 * ## 二、几个单元之间能有什么关系——先把维度列全，再说哪些现成、哪些要新机制
 *
 * 引擎是**单剖面**的，单元之间不相互作用（Lab.09 起就写在局限里）。所以「关系」全部
 * 是**编排**：把已有的旋钮在几个单元之间**拉开差别**。逐维审计：
 *
 * | 维度 | 取值 | 靠什么 | 状态 |
 * |---|---|---|---|
 * | 距离 | 离 / 切 / 叠 / 嵌 | 站位间距 vs 平台外缘（见 §三） | 离·切·叠现成；**嵌不可**（平台伸进邻居的芯带，要碰撞） |
 * | 高度 | 齐平 / 错层 | `lead`（形状不变，只挪高度） | 现成（一圈起伏那套） |
 * | 形态 | 同形 / 异形 | 每单元一份编制 | 现成（Lab.12 每行一种） |
 * | 尺寸 | 等径 / 异径 | 每单元一个半径 | **要台架扩展**（半径烘进顶点，多半径 = 多份几何） |
 * | 时序 | 同步 / 错相 | 每单元一个起步延迟 | **要台架扩展**（现在整场一个时钟） |
 * | 连接 | 平台之间的膜 | 跨单元直纹带 | **要新几何**（现在的膜只在环内相邻两带之间） |
 *
 * 本模块先做**现成的三维**（距离 × 高度 × 形态）；后三行留给下一轮，写在
 * 项目二_单元关系lab.md 里等拍板。
 *
 * ## 三、距离的四态是量出来的，不是分的
 *
 * 两个单元的芯心距 d，平台外缘半径 ρ = R + 挑出，芯带在半径 R：
 *   - d ≥ 2ρ + 缝：**离**（Lab.12 那种独立，格距 = `ringCellPitch`）
 *   - d = 2ρ：**切**，两圈平台边贴边，读成一整片
 *   - 2R + 挑出 < d < 2ρ：**叠**，平台在平面上互相盖过去——只有两个单元**不在同一高度**
 *     时才成立（一个的平台从另一个的平台底下穿过去），高差 ≥ 折叠体竖向跨度 + 余量
 *   - d ≤ 2R + 挑出：**嵌**，平台伸进邻居的芯带里——引擎没有碰撞，做不了，范围外
 * 挑出按**全程峰值**取（Lab.12 的教训：只看终态会在成形期撞上）。
 */
import { RING, RING_LEAD, RING_TAIL, RING_WAVE, buildRingUnits, type RingUnitDef } from './skin-ring';
import {
  MM_PER_UNIT,
  RIG_SCALE,
  RING_GRID_FIT,
  ROOM,
  ringCellPitch,
  sceneBySpan,
  viewFitBySpan,
  type RingGridView,
  type SceneMesh,
} from './skin-grid';
import type { SkinSpec } from './skin-unit';

// ── 单元的实测量（2D px，装置自身坐标系；守门 unit-cluster.test 跑引擎逐一核对）────────

export interface UnitFormMetrics {
  key: string;
  /** 终态挑出（最大离轴距离） */
  reach: number;
  /** 全程挑出峰值（间距按它算——成形期不许撞上） */
  peakReach: number;
  /** 终态嘴心离下缘的高度（平台面大致在这里） */
  mouth: number;
  /** 终态折叠体竖向跨度（离轴 > 8px 的材料的 y 范围） */
  body: number;
  /** 全程折叠体竖向跨度峰值（交叠的高差按它算——阶梯方箱在 step 449 鼓到 77，终态才收回 68） */
  bodyPeak: number;
}

/** 目录序（袋 / 蘑菇挑台 / 直挑台 / 阶梯挑台方箱），与 `buildRingUnits()` 同序 */
export const UNIT_FORMS: readonly UnitFormMetrics[] = [
  { key: 'pocket', reach: 63.4, peakReach: 63.4, mouth: 113.9, body: 62.4, bodyPeak: 90.7 },
  { key: 'bulb', reach: 99.5, peakReach: 99.5, mouth: 67.5, body: 33.7, bodyPeak: 36.1 },
  { key: 'ledge', reach: 101.0, peakReach: 101.0, mouth: 67.6, body: 26.6, bodyPeak: 30.4 },
  { key: 'stepped', reach: 82.2, peakReach: 82.2, mouth: 67.5, body: 68.1, bodyPeak: 77.0 },
];

/** 默认形态 = 阶梯挑台方箱（与 Lab.10 / Lab.12 同：顶面找平过，连起来才读得出是平台） */
export const CLUSTER_DEFAULT_FORM = 3;

/** 高度旋钮的量程：起伏编制实测过「形状逐点不变」的 lead 区间（skin-ring.RING_WAVE） */
export const CLUSTER_LEAD = { LOW: RING_WAVE.LOW, HIGH: RING_WAVE.HIGH } as const;
/** 可用的最大高差（2D px）= 2px/节 × 节数 */
export const LEVEL_RANGE_PX = 2 * (CLUSTER_LEAD.LOW - CLUSTER_LEAD.HIGH);

/** 交叠时：平台外缘离邻居芯带的净距（2D px）；竖向：下层折叠体顶到上层折叠体底的净距 */
export const OVERLAP_CLEAR = { XY: 6, Y: 6 } as const;

// ── 编制：几个单元、怎么摆 ───────────────────────────────────────────────────────

export const CLUSTER_PLANS = [
  { key: 'pair', n: 2, label: '二 · 一对', zh: '一对', en: 'a pair' },
  { key: 'triad', n: 3, label: '三 · 三角', zh: '三角', en: 'a triad' },
  { key: 'quad', n: 4, label: '四 · 方阵', zh: '方阵', en: 'a two-by-two' },
  { key: 'nine', n: 9, label: '九 · 九宫', zh: '九宫', en: 'a three-by-three' },
] as const;
export type ClusterPlanKey = (typeof CLUSTER_PLANS)[number]['key'];

export type ClusterSpacing = 'apart' | 'touch' | 'overlap';
export type ClusterLevels = 'flat' | 'stepped' | 'parity';

/**
 * 关系五档 = 距离 × 高度里**物理上成立**的组合：
 * 叠必须错层（同高的两圈平台在平面上盖过去就是互穿），故没有「交叠 · 齐平」。
 */
export const CLUSTER_RELATIONS = [
  { key: 'apart', label: '分离 · 齐平', spacing: 'apart', levels: 'flat', zh: '分离', en: 'apart' },
  { key: 'touch', label: '相切 · 齐平', spacing: 'touch', levels: 'flat', zh: '相切', en: 'touching' },
  { key: 'apartStep', label: '分离 · 错层', spacing: 'apart', levels: 'stepped', zh: '分离错层', en: 'apart, stepped' },
  { key: 'touchStep', label: '相切 · 错层', spacing: 'touch', levels: 'stepped', zh: '相切错层', en: 'touching, stepped' },
  { key: 'overlap', label: '交叠 · 错层', spacing: 'overlap', levels: 'parity', zh: '交叠', en: 'interleaved' },
] as const;
export type ClusterRelationKey = (typeof CLUSTER_RELATIONS)[number]['key'];

export function clusterPlan(key: ClusterPlanKey) {
  return CLUSTER_PLANS.find((p) => p.key === key)!;
}
export function clusterRelation(key: ClusterRelationKey) {
  return CLUSTER_RELATIONS.find((r) => r.key === key)!;
}

/** 站位（以间距为单位、以簇心为原点；x 右、z 出屏）。相邻单元的距离恒为 1 */
export function clusterPositions(plan: ClusterPlanKey): readonly { x: number; z: number }[] {
  switch (plan) {
    case 'pair':
      return [
        { x: -0.5, z: 0 },
        { x: 0.5, z: 0 },
      ];
    case 'triad': {
      // 等边三角，边长 1；一个顶点朝后（−z）——错层时最高的那个放在后面，前面两个不挡它
      const r = 1 / Math.sqrt(3);
      const c = Math.cos(Math.PI / 6) * r;
      const s = Math.sin(Math.PI / 6) * r;
      return [
        { x: -c, z: s },
        { x: c, z: s },
        { x: 0, z: -r },
      ];
    }
    case 'quad':
      // 顺时针一圈（前左 → 后左 → 后右 → 前右）：错层时四级顺着绕，读作一段旋转的台阶
      return [
        { x: -0.5, z: 0.5 },
        { x: -0.5, z: -0.5 },
        { x: 0.5, z: -0.5 },
        { x: 0.5, z: 0.5 },
      ];
    case 'nine': {
      const out: { x: number; z: number }[] = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push({ x: c - 1, z: r - 1 });
      return out;
    }
  }
}

/**
 * 每个站位的高度级（0 = 最低）。
 * - 齐平：全 0；
 * - 错层：一对两级 / 三角三级 / 方阵四级顺着绕 / 九宫按离中心的圈数（角 0 · 边 1 · 心 2）
 *   ——中心最高，读成一座台地；
 * - 交叠（parity）：两级棋盘——任何一对相邻的单元都在不同高度，同高的只在对角 / 隔一格。
 *   三角不是二分图（三个两两相邻），只能三级，每级之间的高差随之只剩一半。
 */
export function clusterLevels(plan: ClusterPlanKey, relation: ClusterRelationKey): number[] {
  const n = clusterPlan(plan).n;
  const mode = clusterRelation(relation).levels;
  if (mode === 'flat') return new Array<number>(n).fill(0);
  if (mode === 'stepped') {
    if (plan === 'nine') return [0, 1, 0, 1, 2, 1, 0, 1, 0];
    return Array.from({ length: n }, (_, i) => i);
  }
  // parity
  switch (plan) {
    case 'pair':
      return [0, 1];
    case 'triad':
      return [0, 1, 2];
    case 'quad':
      return [0, 1, 0, 1];
    case 'nine':
      return [0, 1, 0, 1, 0, 1, 0, 1, 0];
  }
}

/** 级数 */
export function clusterLevelCount(plan: ClusterPlanKey, relation: ClusterRelationKey): number {
  return Math.max(...clusterLevels(plan, relation)) + 1;
}

/**
 * 每级的 lead：从 LOW（最低 = 环族当前落位）到 HIGH（起伏编制验过的上限）等分。
 * 一级时就是 RING_LEAD 本身 ⇒ 齐平的单元与 Lab.10 / Lab.12 的环逐位相同。
 */
export function clusterLeads(levels: number): number[] {
  const { LOW, HIGH } = CLUSTER_LEAD;
  if (levels <= 1) return [LOW];
  return Array.from({ length: levels }, (_, l) => Math.round(LOW - ((LOW - HIGH) * l) / (levels - 1)));
}

/**
 * 相邻两级的高差（2D px）——取**最小**的那一对：lead 是整数节点（2px/节），四级等分
 * 44 节会取整成 15/14/15，最小的那对才是交叠余量该按的数（保守），显示也按它说「每级 ≥」。
 */
export function clusterLevelStep(levels: number): number {
  if (levels <= 1) return 0;
  const leads = clusterLeads(levels);
  let step = Infinity;
  for (let l = 1; l < leads.length; l++) step = Math.min(step, 2 * (leads[l - 1] - leads[l]));
  return step;
}

/**
 * 每级一条引擎：同一张键谱搬到该级的 lead 上（lead + tail 恒定 ⇒ 筒的上下缘不动，
 * 形状逐点不变——skin-ring 起伏编制的守门就是卡这条）。
 */
export function clusterUnits(
  plan: ClusterPlanKey,
  relation: ClusterRelationKey,
  form: RingUnitDef,
): RingUnitDef[] {
  const sum = RING_LEAD + RING_TAIL;
  const free = form.spec[1];
  return clusterLeads(clusterLevelCount(plan, relation)).map((lead, l) => ({
    ...form,
    key: `${form.key}-L${l}`,
    spec: [['g', lead], free, ['g', sum - lead]] as SkinSpec,
  }));
}

/** 环编制表：第 l 份 = 二十条带全指第 l 条引擎（一环一种形态，Lab.09 的拍板在这里照样成立） */
export function clusterPlans(levels: number, count: number = RING.COUNT): number[][] {
  return Array.from({ length: levels }, (_, l) => new Array<number>(count).fill(l));
}

// ── 间距：由关系推出来 ───────────────────────────────────────────────────────────

/** 两个单元在这一关系下**必须**隔开多远（2D px，芯心距） */
function neededDistance(
  spacing: ClusterSpacing,
  sameLevel: boolean,
  radius: number,
  f: UnitFormMetrics,
): number {
  const rim = radius + f.peakReach;
  if (spacing === 'apart') return ringCellPitch(radius); // Lab.12 那种独立：外缘 + 缝
  if (spacing === 'touch') return 2 * rim; // 平台边贴边
  // overlap：不同高的两个可以盖过去，直到平台外缘顶到邻居的芯带；同高的仍然只能贴边
  return sameLevel ? 2 * rim : 2 * radius + f.peakReach + OVERLAP_CLEAR.XY;
}

/**
 * 间距（2D px）= 让**每一对**单元都满足各自的距离要求里最紧的那个。
 * 站位是按「相邻 = 1」归一的，故 p = max(需要的距离 / 归一距离)。
 * 分离与相切下相邻对就是最紧的 ⇒ p 分别是 ringCellPitch 与 2·外缘；
 * 交叠下要多看一眼**同高的对角对**（方阵 / 九宫棋盘的对角是同一级，归一距 √2）
 * ——它们只能贴边，这一条会把 p 从「顶到芯带」再推开一点。
 */
export function clusterPitch(
  plan: ClusterPlanKey,
  relation: ClusterRelationKey,
  formIdx: number,
  radius: number,
): number {
  const pos = clusterPositions(plan);
  const lv = clusterLevels(plan, relation);
  const sp = clusterRelation(relation).spacing;
  const f = UNIT_FORMS[formIdx];
  let p = 0;
  for (let i = 0; i < pos.length; i++)
    for (let j = i + 1; j < pos.length; j++) {
      const d = Math.hypot(pos[i].x - pos[j].x, pos[i].z - pos[j].z);
      p = Math.max(p, neededDistance(sp, lv[i] === lv[j], radius, f) / d);
    }
  return p;
}

/**
 * 交叠成不成立：相邻两级的高差要装得下折叠体的**全程**竖向跨度再留余量
 * （下层的平台从上层的平台底下穿过去，成形期最鼓的那一刻也不许碰）。
 * 三角只有三级 ⇒ 每级高差只有一对的一半，蘑菇/直挑台装得下、袋与方箱装不下；
 * 袋连两级都差一点（成形期跨度 90.7 > 88）。
 */
export function overlapFeasible(plan: ClusterPlanKey, formIdx: number): boolean {
  return overlapMargin(plan, formIdx) >= 0;
}
/** 交叠的竖向余量（2D px）：高差 − 折叠体全程跨度 − 净距；< 0 = 装不下 */
export function overlapMargin(plan: ClusterPlanKey, formIdx: number): number {
  const step = clusterLevelStep(clusterLevelCount(plan, 'overlap'));
  return step - UNIT_FORMS[formIdx].bodyPeak - OVERLAP_CLEAR.Y;
}

// ── 摆进房间 ──────────────────────────────────────────────────────────────────

export interface ClusterCell {
  x: number;
  z: number;
  /** 高度级 = 环编制表的下标 */
  plan: number;
}

/** 站位（世界单位；簇心在原点）+ 每格用哪一级 */
export function clusterCells(
  plan: ClusterPlanKey,
  relation: ClusterRelationKey,
  formIdx: number,
  radius: number,
): ClusterCell[] {
  const p = clusterPitch(plan, relation, formIdx, radius) * RIG_SCALE;
  const lv = clusterLevels(plan, relation);
  return clusterPositions(plan).map((q, i) => ({ x: q.x * p, z: q.z * p, plan: lv[i] }));
}

/** 装置占宽（世界单位，见方取大边）：最远站位 + 平台外缘 */
export function clusterFieldSpan(
  plan: ClusterPlanKey,
  relation: ClusterRelationKey,
  formIdx: number,
  radius: number,
): number {
  const p = clusterPitch(plan, relation, formIdx, radius);
  let far = 0;
  for (const q of clusterPositions(plan)) far = Math.max(far, Math.abs(q.x), Math.abs(q.z));
  return (2 * far * p + 2 * (radius + UNIT_FORMS[formIdx].peakReach)) * RIG_SCALE;
}

/** 布景（房间 + 比例小人）：与 Lab.12 同一套，只是占宽由关系给 */
export function clusterScene(
  plan: ClusterPlanKey,
  relation: ClusterRelationKey,
  formIdx: number,
  radius: number,
): SceneMesh[] {
  return sceneBySpan(clusterFieldSpan(plan, relation, formIdx, radius));
}

/** 取景：与 Lab.12 同一份包围盒解析式（框的是房间），逐视角逐半径现算 */
export function clusterCamScale(
  plan: ClusterPlanKey,
  relation: ClusterRelationKey,
  formIdx: number,
  radius: number,
  view: string = 'axon',
): number {
  const v: RingGridView = view === 'front' || view === 'side' || view === 'top' ? view : 'axon';
  const span = clusterFieldSpan(plan, relation, formIdx, radius) + 2 * ROOM.MARGIN;
  return viewFitBySpan(span, v) * RING_GRID_FIT;
}

// ── 给人读的量（HUD / 线稿）──────────────────────────────────────────────────────

const toM = (px2d: number): number => (px2d * RIG_SCALE * MM_PER_UNIT) / 1000;

export interface ClusterMetrics {
  /** 芯心距，m */
  pitchM: number;
  /** 平台外径（终态），m */
  platformM: number;
  /** 相邻两级高差，m（齐平 = 0） */
  stepM: number;
  /** 级数 */
  levels: number;
  /** 相邻两圈平台在平面上盖过去多宽（终态；离/切为 0 或负 = 空着），m */
  overlapM: number;
}

export function clusterMetrics(
  plan: ClusterPlanKey,
  relation: ClusterRelationKey,
  formIdx: number,
  radius: number,
): ClusterMetrics {
  const f = UNIT_FORMS[formIdx];
  const p = clusterPitch(plan, relation, formIdx, radius);
  const levels = clusterLevelCount(plan, relation);
  return {
    pitchM: toM(p),
    platformM: toM(2 * (radius + f.reach)),
    stepM: toM(clusterLevelStep(levels)),
    levels,
    overlapM: toM(2 * (radius + f.reach) - p),
  };
}

/** 单元的四种形态（与 Lab.10 / Lab.12 同一份构造） */
export function clusterForms(): RingUnitDef[] {
  return buildRingUnits();
}
