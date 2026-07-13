import type { Bar, DynamicsConfig, LinkageDef, NodeState, Point } from './types';
import { consumeFixedSteps } from './fixed-step';

export interface IterationSnapshot {
  positions: Point[];
  maxError: number;
}

/** 软拖拽刚度 α（SPEC §3.3）。合理区间 0.2–0.6；α=1 等于硬设置、会与约束打架，禁止。 */
const DRAG_ALPHA = 0.4;

/**
 * 软拖拽单帧可达半径，px（SPEC §5 条 6b，选项 B）：每次 iterate() 调用（= 渲染帧）
 * 求解所用的有效目标被限制在距拖拽节点当前位置 MAX_DRAG_REACH 之内。
 * 预算必须按帧定而非按遍定——一帧 36 遍、板压扁时投影的垂直恢复力趋零，
 * 按遍限步挡不住单帧内的数值隧穿（实测第 0 帧即翻）。
 * 40px/帧 × 60fps = 2400px/s，跟手性无感；但单帧压不穿三角板（板高 ≈73px），
 * 瞬时划过不再误翻。持续按压仍会逐帧下沉并最终翻面（接受行为，见 SPEC §3.4）。
 * 副作用（有益）：越界拖拽的稳态弹性伸长被此值封顶，不随越界距离增长。
 */
const MAX_DRAG_REACH = 40;

/** 防除零（SPEC §3.5）：两点瞬间重合时避免 NaN 传染全部节点。 */
const EPS = 1e-6;

/** Verlet 固定子步（SPEC §3.6）：1/120 s——60/120Hz 屏同手感，动力学参数与帧率解耦。 */
const SUBSTEP = 1 / 120;
/** 单次 step 子步上限：dt clamp（0.05s）÷ SUBSTEP = 6，切后台回来不补几百步。 */
const MAX_SUBSTEPS = 6;

/**
 * 平面连杆机构的 PBD 求解器（SPEC §3、§4.1）。
 * 内核只有三样东西：距离约束（刚性杆）、锚点（fixed，逆质量 0）、软拖拽目标。
 * 零依赖：本文件不得引用 React / DOM / window。
 */
export class LinkageSolver {
  private readonly ns: NodeState[];
  private readonly bs: Bar[];
  private dragIndex = -1;
  private dragX = 0;
  private dragY = 0;
  /** 本次 iterate 调用的有效目标（原始目标向节点方向收进 MAX_DRAG_REACH 内）。 */
  private effX = 0;
  private effY = 0;
  /** 门控动力学（SPEC §3.6）。undefined = 拟静力学，一切照旧。 */
  private readonly dyn?: DynamicsConfig;
  /** Verlet 上一子步位置（仅动力学开启时存在）。 */
  private readonly prevX: number[] = [];
  private readonly prevY: number[] = [];
  /** 固定步余时：跨渲染帧保留，避免 90/144Hz 下物理时钟变快或变慢。 */
  private timeRemainder = 0;

  constructor(def: LinkageDef, opts?: { dynamics?: DynamicsConfig }) {
    this.ns = def.nodes.map((n) => ({ x: n.x, y: n.y, fixed: n.fixed ?? false }));
    this.bs = def.bars.map((b) => ({
      a: b.a,
      b: b.b,
      rest:
        b.rest ??
        Math.hypot(def.nodes[b.b].x - def.nodes[b.a].x, def.nodes[b.b].y - def.nodes[b.a].y),
      stiffness: b.stiffness ?? 1,
    }));
    this.dyn = opts?.dynamics;
    if (this.dyn) {
      this.prevX = this.ns.map((n) => n.x);
      this.prevY = this.ns.map((n) => n.y);
    }
  }

  /** 动力学是否开启（controller 据此选驱动路径）。 */
  get dynamic(): boolean {
    return this.dyn !== undefined;
  }

  get nodes(): ReadonlyArray<Readonly<NodeState>> {
    return this.ns;
  }

  get bars(): ReadonlyArray<Readonly<Bar>> {
    return this.bs;
  }

  /** n 遍 Gauss-Seidel 扫描（SPEC §3.2）。有效拖拽目标每调用重算一次（= 每帧预算）。 */
  iterate(n: number): void {
    this.clampDragTarget();
    for (let i = 0; i < n; i++) this.sweepOnce();
  }

  /**
   * 动力学一帧（SPEC §3.6）：dt 切成固定子步（h=1/120，上限 6），每子步
   * Verlet 积分（v=(x−px)·damping；px←x；x+=v+g·h²）后照常投影 iterate(sweeps)。
   * 速度隐式含投影位移（PBD 标准形态，Müller 2007）——拖拽注入的位移下一子步
   * 自动变成速度，甩得动、摔得响。动力学未开启时退化为纯 iterate(sweeps)。
   */
  step(dt: number, sweeps: number): void {
    if (!this.dyn) {
      this.iterate(sweeps);
      return;
    }
    if (dt <= 0) return;
    const clock = consumeFixedSteps(this.timeRemainder, dt, SUBSTEP, MAX_SUBSTEPS);
    this.timeRemainder = clock.remainder;
    if (clock.steps === 0) return;
    const { gravity, damping } = this.dyn;
    // MAX_DRAG_REACH 是渲染帧预算：一帧只钳一次，不能在每个物理子步重新向前滚动。
    this.clampDragTarget();
    for (let s = 0; s < clock.steps; s++) {
      for (let i = 0; i < this.ns.length; i++) {
        const node = this.ns[i];
        if (node.fixed) {
          this.prevX[i] = node.x;
          this.prevY[i] = node.y;
          continue;
        }
        const vx = (node.x - this.prevX[i]) * damping;
        const vy = (node.y - this.prevY[i]) * damping;
        this.prevX[i] = node.x;
        this.prevY[i] = node.y;
        node.x += vx + gravity.x * SUBSTEP * SUBSTEP;
        node.y += vy + gravity.y * SUBSTEP * SUBSTEP;
      }
      for (let i = 0; i < sweeps; i++) this.sweepOnce();
    }
  }

  /**
   * 教学模式 A（SPEC §6.1）：逐遍快照。
   * 与 iterate 共用 sweepOnce——教学展示的必须是真算法本身，不许分叉出演示版。
   */
  iterateWithHistory(n: number): IterationSnapshot[] {
    this.clampDragTarget();
    const out: IterationSnapshot[] = [];
    for (let i = 0; i < n; i++) {
      this.sweepOnce();
      out.push({
        positions: this.ns.map((p) => ({ x: p.x, y: p.y })),
        maxError: this.maxError(),
      });
    }
    return out;
  }

  /** 残差 max |dᵢ − restᵢ|，px（SPEC §3.2）。 */
  maxError(): number {
    let m = 0;
    for (const { a, b, rest } of this.bs) {
      const e = Math.abs(
        Math.hypot(this.ns[b].x - this.ns[a].x, this.ns[b].y - this.ns[a].y) - rest,
      );
      if (e > m) m = e;
    }
    return m;
  }

  /** fixed 节点上调用是 no-op（SPEC §4.1 契约，测试锁定）。 */
  beginDrag(nodeIndex: number): void {
    const n = this.ns[nodeIndex];
    if (n.fixed) return;
    this.dragIndex = nodeIndex;
    this.dragX = n.x;
    this.dragY = n.y;
    this.effX = n.x;
    this.effY = n.y;
  }

  /** 只更新软目标，不直接动节点——拉力必须和投影逐遍交错（SPEC §3.3）。 */
  dragTo(x: number, y: number): void {
    this.dragX = x;
    this.dragY = y;
  }

  endDrag(): void {
    this.dragIndex = -1;
  }

  setFixed(nodeIndex: number, fixed: boolean): void {
    this.ns[nodeIndex].fixed = fixed;
  }

  /**
   * 运行时改杆原长（SPEC §4.1 修订，触手肌腱收缩驱动）：纯数据变更，
   * 投影算法不感知——下一遍扫描自然向新 rest 收敛（Kangaroo Spring 的
   * target_length 对应物）。
   */
  setRest(barIndex: number, rest: number): void {
    this.bs[barIndex].rest = rest;
  }

  setNode(nodeIndex: number, x: number, y: number): void {
    this.ns[nodeIndex].x = x;
    this.ns[nodeIndex].y = y;
  }

  /** 有效目标 = 原始目标收进以节点当前位置为心、MAX_DRAG_REACH 为半径的圆内。 */
  private clampDragTarget(): void {
    if (this.dragIndex < 0) return;
    const d = this.ns[this.dragIndex];
    let tx = this.dragX - d.x;
    let ty = this.dragY - d.y;
    const dist = Math.hypot(tx, ty);
    if (dist > MAX_DRAG_REACH) {
      tx *= MAX_DRAG_REACH / dist;
      ty *= MAX_DRAG_REACH / dist;
    }
    this.effX = d.x + tx;
    this.effY = d.y + ty;
  }

  /** 一遍扫描：软拖拽注入 → 顺序投影全部杆。iterate / iterateWithHistory 的唯一实现体。 */
  private sweepOnce(): void {
    if (this.dragIndex >= 0) {
      const d = this.ns[this.dragIndex];
      if (!d.fixed) {
        d.x += (this.effX - d.x) * DRAG_ALPHA;
        d.y += (this.effY - d.y) * DRAG_ALPHA;
      }
    }
    for (const { a, b, rest, stiffness } of this.bs) {
      const A = this.ns[a];
      const B = this.ns[b];
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const d = Math.hypot(dx, dy) || EPS;
      const k = ((d - rest) / d) * stiffness; // stiffness=1 时与 v1.2 算术逐位一致
      const wa = A.fixed ? 0 : 1;
      const wb = B.fixed ? 0 : 1;
      const ws = wa + wb;
      if (!ws) continue;
      // 最小位移投影（SPEC §3.1）：修正沿杆轴，按逆质量份额分配，单杆一步精确。
      A.x += dx * k * (wa / ws);
      A.y += dy * k * (wa / ws);
      B.x -= dx * k * (wb / ws);
      B.y -= dy * k * (wb / ws);
    }
  }
}
