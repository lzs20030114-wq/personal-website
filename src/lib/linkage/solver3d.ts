// 立体求解器（轮回机器_立体求解器spec v0.1）。与 solver.ts 有意同构：
// 公式同源（SPEC §3.1 最小位移投影、§3.6 门控 Verlet），只是升到 3D。
// 2D 内核是封盘资产，本文件与其完全平行、互不引用数据类型。
// 零依赖：不得引用 React / DOM / window。

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Node3 extends Vec3 {
  fixed: boolean;
}

export interface Bar3 {
  a: number;
  b: number;
  rest: number;
  /** 投影乘子 0–1，缺省 1 = 刚性（语义同 2D Bar.stiffness，含遍数复合局限） */
  stiffness: number;
}

export interface Linkage3Def {
  nodes: { x: number; y: number; z: number; fixed?: boolean }[];
  bars: { a: number; b: number; rest?: number; stiffness?: number }[];
}

export interface Dynamics3Config {
  /** 重力加速度，px/s²（世界坐标 y 向下为正，与 2D 约定一致） */
  gravity: Vec3;
  /** 每子步速度保留系数 0–1 */
  damping: number;
}

const EPS = 1e-6;
/** Verlet 固定子步与单帧子步上限（同 SPEC §3.6） */
const SUBSTEP = 1 / 120;
const MAX_SUBSTEPS = 6;
/** step() 内置 dt clamp（3D 台架无 controller，钳位收进内核） */
const DT_MAX = 0.05;

export class LinkageSolver3D {
  private readonly ns: Node3[];
  private readonly bs: Bar3[];
  private readonly dyn?: Dynamics3Config;
  private readonly prevX: number[] = [];
  private readonly prevY: number[] = [];
  private readonly prevZ: number[] = [];

  constructor(def: Linkage3Def, opts?: { dynamics?: Dynamics3Config }) {
    this.ns = def.nodes.map((n) => ({ x: n.x, y: n.y, z: n.z, fixed: n.fixed ?? false }));
    this.bs = def.bars.map((b) => ({
      a: b.a,
      b: b.b,
      rest:
        b.rest ??
        Math.hypot(
          def.nodes[b.b].x - def.nodes[b.a].x,
          def.nodes[b.b].y - def.nodes[b.a].y,
          def.nodes[b.b].z - def.nodes[b.a].z,
        ),
      stiffness: b.stiffness ?? 1,
    }));
    this.dyn = opts?.dynamics;
    if (this.dyn) {
      this.prevX = this.ns.map((n) => n.x);
      this.prevY = this.ns.map((n) => n.y);
      this.prevZ = this.ns.map((n) => n.z);
    }
  }

  get nodes(): ReadonlyArray<Readonly<Node3>> {
    return this.ns;
  }

  get bars(): ReadonlyArray<Readonly<Bar3>> {
    return this.bs;
  }

  get dynamic(): boolean {
    return this.dyn !== undefined;
  }

  /** n 遍对称 Gauss-Seidel（正反向交替）：削减顺序偏差——2D 内核为封盘资产
   *  保持单向，3D 研究线实测单向扫描在深卷曲下累积可见扭转（v5 修订）。 */
  iterate(n: number): void {
    for (let s = 0; s < n; s++) this.sweepOnce(s % 2 === 1);
  }

  /** 残差 max |dᵢ − restᵢ|，px。 */
  maxError(): number {
    let m = 0;
    for (const { a, b, rest } of this.bs) {
      const A = this.ns[a];
      const B = this.ns[b];
      const e = Math.abs(Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z) - rest);
      if (e > m) m = e;
    }
    return m;
  }

  setFixed(nodeIndex: number, fixed: boolean): void {
    this.ns[nodeIndex].fixed = fixed;
  }

  setNode(nodeIndex: number, x: number, y: number, z: number): void {
    this.ns[nodeIndex].x = x;
    this.ns[nodeIndex].y = y;
    this.ns[nodeIndex].z = z;
  }

  /** 运行时改杆原长（肌腱收缩驱动），纯数据变更。 */
  setRest(barIndex: number, rest: number): void {
    this.bs[barIndex].rest = rest;
  }

  /** 动力学一帧：dt 钳位 → 固定子步 Verlet 积分 + 投影（SPEC §3.6 的 3D 版）。 */
  step(dt: number, sweeps: number): void {
    if (!this.dyn) {
      this.iterate(sweeps);
      return;
    }
    if (dt <= 0) return;
    const clamped = Math.min(dt, DT_MAX);
    const { gravity, damping } = this.dyn;
    const n = Math.max(1, Math.min(MAX_SUBSTEPS, Math.round(clamped / SUBSTEP)));
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < this.ns.length; i++) {
        const node = this.ns[i];
        if (node.fixed) {
          this.prevX[i] = node.x;
          this.prevY[i] = node.y;
          this.prevZ[i] = node.z;
          continue;
        }
        const vx = (node.x - this.prevX[i]) * damping;
        const vy = (node.y - this.prevY[i]) * damping;
        const vz = (node.z - this.prevZ[i]) * damping;
        this.prevX[i] = node.x;
        this.prevY[i] = node.y;
        this.prevZ[i] = node.z;
        node.x += vx + gravity.x * SUBSTEP * SUBSTEP;
        node.y += vy + gravity.y * SUBSTEP * SUBSTEP;
        node.z += vz + gravity.z * SUBSTEP * SUBSTEP;
      }
      this.iterate(sweeps);
    }
  }

  private sweepOnce(reverse: boolean): void {
    const m = this.bs.length;
    for (let idx = 0; idx < m; idx++) {
      const { a, b, rest, stiffness } = this.bs[reverse ? m - 1 - idx : idx];
      const A = this.ns[a];
      const B = this.ns[b];
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const dz = B.z - A.z;
      const d = Math.hypot(dx, dy, dz) || EPS;
      const k = ((d - rest) / d) * stiffness;
      const wa = A.fixed ? 0 : 1;
      const wb = B.fixed ? 0 : 1;
      const ws = wa + wb;
      if (!ws) continue;
      A.x += dx * k * (wa / ws);
      A.y += dy * k * (wa / ws);
      A.z += dz * k * (wa / ws);
      B.x -= dx * k * (wb / ws);
      B.y -= dy * k * (wb / ws);
      B.z -= dz * k * (wb / ws);
    }
  }
}
