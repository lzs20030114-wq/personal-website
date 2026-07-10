// SPEC §2.1 —— 全部纯数据，无方法。坐标系 = SVG viewBox，y 向下为正，单位 px。

export interface Point {
  x: number;
  y: number;
}

export interface NodeState extends Point {
  /** true = 锚点（固定铰），逆质量 w = 0（质量无穷大）。 */
  fixed: boolean;
}

export interface Bar {
  /** 节点索引 */
  a: number;
  b: number;
  /** 原长，px */
  rest: number;
  /**
   * 投影乘子 0–1，缺省 1 = 刚性（SPEC §2.1 修订，触手 spec B 级）。
   * per-sweep 乘子会随遍数复合：n 遍有效刚度 = 1−(1−k)ⁿ——迭代耦合是
   * 已知局限（XPBD 是正解，IDEAS 第二梯队挂着），软约束调参须连同遍数一起看。
   */
  stiffness: number;
}

export interface LinkageDef {
  nodes: { x: number; y: number; fixed?: boolean }[];
  /** rest 缺省 = 按初始坐标计算的距离；stiffness 缺省 1 = 刚性 */
  bars: { a: number; b: number; rest?: number; stiffness?: number }[];
}

/** 门控 Verlet 动力学（SPEC §3.6，触手 spec C 级）。不传 = 拟静力学，行为与 v1.2 逐字节一致。 */
export interface DynamicsConfig {
  /** 重力加速度，viewBox px/s²（y 向下为正） */
  gravity: Point;
  /** 每子步速度保留系数 0–1（子步固定 h=1/120 s，故帧率无关） */
  damping: number;
}
