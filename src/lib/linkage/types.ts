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
}

export interface LinkageDef {
  nodes: { x: number; y: number; fixed?: boolean }[];
  /** rest 缺省 = 按初始坐标计算的距离 */
  bars: { a: number; b: number; rest?: number }[];
}
