/**
 * 项目二 · 4×4 环阵列（Lab.10 的编制）——纯数据 + 纯几何，零 DOM。
 *
 * 用户 2026-08-25 纠偏：「我指的阵列是 4×4 的，每一个单元都是那个环形的，
 * 而不是 4×4 个小单元。」——首版（十六个**单条带**铺成平面网格）作废，
 * 换成**十六个 Lab.09 那种圆筒环**铺成平面网格：每格是一整个环（20 条带绕轴一圈、
 * 收缩后各自扣出挑台、连成绕筒一圈的环形平台），十六个环站成一片场地。
 *
 * 同轮拍板的另三条：**格距跟着半径滑块走** · **每个环各自独立**（不要挤成一片）·
 * 编制取「整片同形 / 每行一种」。
 *
 * ## 一、物理开销不随格数涨
 *
 * 一个环同一种键谱 ⇒ 引擎只解一条带、摆 20 处（Lab.09 的既有做法）。
 * 十六个同形环 = 仍然只解**一条带**，摆 320 处。整片同形只有一条引擎，
 * 每行一种也只有四条——阵列变大，仿真一点没变。
 *
 * 涨的是几何：每条带 172 节 → 1,372 三角，十六个环 = 439,040 三角。故渲染改走
 * 「上传一份、多处摆放」（gl3d 的 MeshPlace）：几何只有一份，320 处的差别全在
 * (方位角, 平移) 里。逐帧上传量因此**比 Lab.09 还小**（Lab.09 是二十条带各传一份）。
 *
 * ## 二、间距是推出来的，不是定出来的
 *
 * 环占的圆环带 = [R − 芯轨内偏, R + 全程最大膨胀]，故格距 = 2·(R + PEAK_REACH) + 缝。
 * 半径是滑块 ⇒ 格距跟着它算（用户拍板），拉滑块时整片阵列一起呼吸。
 *
 * 缝取多少由「每个环都独立」定：**环与环之间的空地必须明显大于环内相邻带之间的缝**，
 * 否则读作「环内的又一道缝」而不是两个环之间的空地。环内那道缝在平台外缘是
 * `ringGap(R + PEAK_REACH)`（R=30 时 18.0px），取 1.5 倍 ⇒ R=30 时 27.0px。
 * 这条比例是手感常量，待真机拍板；但「必须大于环内带间缝」是硬约束，守门卡它。
 *
 * 注意**芯轨不参与**环间净距：它在半径内侧（R − 5.8），被环身自己包着。
 */
import { RING, ringGap } from './skin-ring';

/** 全程最大膨胀（四种形态取最大：直挑台实测 52.02，向上取到 0.1 ⇒ 这个常量是**上界**）。
 *  必须按**全程**量而不是终态——阶梯方箱在 step 519 鼓到 43.5，终态反而收回 40.6；
 *  只看终态会把格距定小 3px，收缩过程中就撞上了。 */
export const PEAK_REACH = 52.1;

/** 环间缝 / 环内平台外缘带间缝 的比值（手感常量，待真机拍板；> 1 是硬约束） */
export const RING_GAP_RATIO = 1.5;

export const RING_GRID = {
  COLS: 4,
  ROWS: 4,
} as const;

/** 格数 */
export const RING_GRID_COUNT = RING_GRID.COLS * RING_GRID.ROWS;

/** 环的外缘半径（芯上半径 + 全程最大膨胀） */
export function ringOuter(radius: number): number {
  return radius + PEAK_REACH;
}

/** 环与环之间的净缝（用户「每个环都独立」⇒ 明显大于环内平台外缘的带间缝） */
export function ringCellGap(radius: number): number {
  return RING_GAP_RATIO * ringGap(ringOuter(radius));
}

/** 格距 = 两个环的外缘各占一半 + 中间那道缝；随半径滑块走 */
export function ringCellPitch(radius: number): number {
  return 2 * ringOuter(radius) + ringCellGap(radius);
}

/** 整片阵列在一个方向上的占宽（含两端环的外缘） */
export function ringGridSpan(radius: number, cols: number = RING_GRID.COLS): number {
  return (cols - 1) * ringCellPitch(radius) + 2 * ringOuter(radius);
}

/**
 * 视野：camScale = K / span——半径拉大时整片阵列一起变大，相机得跟着退，
 * 否则 R=90 时四角的环出画。
 *
 * **K 是逐视角的**，不是一个数管四个：一个环的时候四个预设差不多大，铺成 4×4
 * 之后差得很远。轴测下画面被**宽度**卡住，顶视下被**高度**卡住——而顶视看的正是
 * 738×738 的整片地面，投到 520 高的画框里，所需 scale 只有轴测的 0.77 倍。
 * 用一个数管四个的话：按轴测定则顶视裁掉两行（首版即此，CDP 截图实测），
 * 按顶视定则轴测两侧空出 150px。
 *
 * 每档 K = 该视角在滑块全量程内允许的最小 (scale × span)，再留 6% 余量。
 * 允许值由包络解析算出（阵列 bbox = ±span/2 见方 × 世界 y ∈ [−6, 336]，
 * 视口半宽高 350×260），四档实测：
 *   轴测 498 · 正 700 · 侧 629 · 顶 384（顶视随半径 384→418，取下限）。
 */
export const RING_GRID_VIEW_K = {
  axon: 468,
  front: 658,
  side: 591,
  top: 361,
} as const;

export type RingGridView = keyof typeof RING_GRID_VIEW_K;

export function ringGridCamScale(
  radius: number,
  view: string = 'axon',
  cols: number = RING_GRID.COLS,
): number {
  const k = RING_GRID_VIEW_K[view as RingGridView] ?? RING_GRID_VIEW_K.axon;
  return k / ringGridSpan(radius, cols);
}

/** 本台的轴测机位（台架从这里取，故取景推导与实际机位同源、不会各说各话） */
export const RING_GRID_AXON = { pitch: -0.45, yaw: -0.62 } as const;

/** 装置在世界 y 上的占高：天花板面到最低点（收缩全程的包络，实测 −6 ~ 336） */
export const RING_GRID_Y = { lo: -6, hi: 336 } as const;
/** 视口半宽高（FlatRenderer 的 logical 700×520） */
const HALF = { w: 350, h: 260 } as const;
/** 画面枢轴（阵列以原点居中 ⇒ 只有 y 不是 0） */
export const RING_GRID_PIVOT_Y = 166;

const mul3 = (a: readonly number[], b: readonly number[]): number[] => {
  const r = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
};
const rotX3 = (t: number): number[] => {
  const c = Math.cos(t);
  const sn = Math.sin(t);
  return [1, 0, 0, 0, c, -sn, 0, sn, c];
};
const rotY3 = (t: number): number[] => {
  const c = Math.cos(t);
  const sn = Math.sin(t);
  return [c, 0, sn, 0, 1, 0, -sn, 0, c];
};

/**
 * 四个视角的观察矩阵（行主序）。**与 SkinSolidBench 的 makePresets 同一套**——
 * 那三个非轴测预设是 Lab.07–09 共用的常量，改那边要回来改这里，否则本台的取景推导
 * 会与实际机位对不上（顶视重新开始裁）。轴测角从 RING_GRID_AXON 取，台架也取它。
 */
export function ringGridViewMatrix(view: RingGridView): number[] {
  switch (view) {
    case 'axon':
      return mul3(rotX3(RING_GRID_AXON.pitch), rotY3(RING_GRID_AXON.yaw));
    case 'side':
      return rotY3(-Math.PI / 2 + 0.12);
    case 'top':
      return mul3(rotX3(-Math.PI / 2 + 0.52), rotY3(-0.35));
    default:
      return [1, 0, 0, 0, 1, 0, 0, 0, 1]; // front
  }
}

/**
 * 某视角下**不裁边**所允许的最大 camScale：把阵列的包围盒（±span/2 见方 ×
 * RING_GRID_Y）投到该视角，取宽高两个约束里紧的那个。
 * RING_GRID_VIEW_K 就是按它标定的——守门卡「实际取景 ≤ 允许值」。
 */
export function ringGridViewFit(
  radius: number,
  view: RingGridView,
  cols: number = RING_GRID.COLS,
): number {
  const M = ringGridViewMatrix(view);
  const h = ringGridSpan(radius, cols) / 2;
  const hy = (RING_GRID_Y.hi - RING_GRID_Y.lo) / 2;
  const dy = (RING_GRID_Y.hi + RING_GRID_Y.lo) / 2 - RING_GRID_PIVOT_Y; // 盒心相对枢轴
  const ex = Math.abs(M[0]) * h + Math.abs(M[1]) * hy + Math.abs(M[2]) * h;
  const ey = Math.abs(M[3]) * h + Math.abs(M[4]) * hy + Math.abs(M[5]) * h;
  return Math.min(HALF.w / (Math.abs(M[1] * dy) + ex), HALF.h / (Math.abs(M[4] * dy) + ey));
}

/** 一格：站位（阵列中心在原点）+ 用哪一份环编制 */
export interface RingGridCell {
  x: number;
  z: number;
  /** ringGridPlans() 的下标 */
  plan: number;
}

export type RingGridMode = 'uniform' | 'perRow';

/**
 * 十六格的站位。行列都以原点居中 ⇒ 机位的枢轴不随半径动，只有 camScale 动。
 * 行优先编号：u = 行·列数 + 列；列走 X、行走 Z。
 */
export function ringGridCells(
  radius: number,
  mode: RingGridMode,
  cols: number = RING_GRID.COLS,
  rows: number = RING_GRID.ROWS,
): RingGridCell[] {
  const pitch = ringCellPitch(radius);
  const cells: RingGridCell[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      cells.push({
        x: (c - (cols - 1) / 2) * pitch,
        z: (r - (rows - 1) / 2) * pitch,
        plan: mode === 'uniform' ? 0 : r,
      });
  return cells;
}

/**
 * 环编制：每份是「环上第 i 条带用哪一条引擎」（长度 = 环上单元数）。
 * - `uniform` = 一份，二十条带全指同一条引擎（台架只把选中的那一种形态传进 units）；
 * - `perRow` = 四份，第 v 份全指引擎 v（行 0→3 = 袋 / 蘑菇挑台 / 直挑台 / 阶梯挑台）。
 *
 * 两种都是「一份编制里只有一条引擎」——**环内不混形态**（用户 2026-08-23 拍板
 * 「一圈用一种形状才连得成平台」，那条在阵列里照样成立）。
 */
export function ringGridPlans(mode: RingGridMode, count: number = RING.COUNT): number[][] {
  if (mode === 'uniform') return [new Array<number>(count).fill(0)];
  return Array.from({ length: RING_GRID.ROWS }, (_, v) => new Array<number>(count).fill(v));
}

/** 默认形态 = 阶梯挑台方箱（与 Lab.09 同）：顶面找平过，连起来才读得出是能站人的平台 */
export const RING_GRID_DEFAULT_FORM = 3;
