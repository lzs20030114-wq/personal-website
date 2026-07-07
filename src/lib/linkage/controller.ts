import type { LinkageSolver } from './solver';

export type Mode = 'spin' | 'drag' | 'idle';

/** 驱动配置（SPEC §4.2）：随 preset 给出，不许硬编码进渲染层——机构画廊的前提。 */
export interface DriverConfig {
  /** 曲柄圆心节点（须为 fixed 锚点） */
  anchor: number;
  /** 被驱动的曲柄端点 */
  tip: number;
  radius: number;
  /** 自转角速度 rad/s */
  omega: number;
}

export interface ControllerOpts {
  driver: DriverConfig;
  theta0?: number;
  /** 命中热区半径，viewBox px（触屏友好：视觉圆圈可以小，热区必须大） */
  hitRadius?: number;
  /** SPEC §3.5 坑 3：dt clamp，秒 */
  dtMax?: number;
  dragSweeps?: number;
  spinSweeps?: number;
  /** prefers-reduced-motion：初始静止、松手回静止；拖拽仍可用 */
  reducedMotion?: boolean;
}

/**
 * 交互状态机（SPEC §4.2）：spin ⇄ drag（⇄ idle）。
 * 框架无关、零 DOM——坐标一律为 viewBox 坐标，CTM 变换是调用方的事。
 * vanilla 验收页与将来的 React 封装共用本类：规则只写一遍、测一遍。
 */
export class LinkageController {
  private readonly driver: DriverConfig;
  private readonly hitRadius: number;
  private readonly dtMax: number;
  private readonly dragSweeps: number;
  private readonly spinSweeps: number;
  private readonly reducedMotion: boolean;

  private _mode: Mode;
  private _theta: number;
  /** 活跃指针 id；拖拽期间其它指针的 down/move/up 一律忽略（SPEC §5 条 4b）。 */
  private activePointer = -1;

  constructor(
    private readonly solver: LinkageSolver,
    opts: ControllerOpts,
  ) {
    this.driver = opts.driver;
    this.hitRadius = opts.hitRadius ?? 24;
    this.dtMax = opts.dtMax ?? 0.05;
    this.dragSweeps = opts.dragSweeps ?? 36;
    this.spinSweeps = opts.spinSweeps ?? 24;
    this.reducedMotion = opts.reducedMotion ?? false;
    this._theta = opts.theta0 ?? -Math.PI / 3;
    this._mode = this.reducedMotion ? 'idle' : 'spin';
  }

  get mode(): Mode {
    return this._mode;
  }

  get theta(): number {
    return this._theta;
  }

  /** 命中则开始拖拽并返回 true（调用方随后 setPointerCapture）。 */
  pointerDown(pointerId: number, x: number, y: number): boolean {
    if (this._mode === 'drag') return false; // 多点触控防护：第一根手指独占
    let best = -1;
    let bestD = this.hitRadius;
    this.solver.nodes.forEach((n, i) => {
      if (n.fixed) return; // 锚点永不可抓
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return false;
    this.activePointer = pointerId;
    this.solver.beginDrag(best);
    this.solver.dragTo(x, y);
    this._mode = 'drag';
    return true;
  }

  pointerMove(pointerId: number, x: number, y: number): void {
    if (this._mode !== 'drag' || pointerId !== this.activePointer) return;
    this.solver.dragTo(x, y);
  }

  /** pointerup 与 pointercancel 同路调用本方法（SPEC §5 条 4）。 */
  pointerUp(pointerId: number): void {
    if (this._mode !== 'drag' || pointerId !== this.activePointer) return;
    this.solver.endDrag();
    this.activePointer = -1;
    // 曲柄端点恒在曲柄圆上（tip-anchor 杆刚性 + anchor 锚定），θ 总有定义——
    // 从当前姿态接回自转，warm start 保证不瞬移
    const tip = this.solver.nodes[this.driver.tip];
    const anchor = this.solver.nodes[this.driver.anchor];
    this._theta = Math.atan2(tip.y - anchor.y, tip.x - anchor.x);
    this._mode = this.reducedMotion ? 'idle' : 'spin';
  }

  /** 每帧驱动。dt 单位秒，内部 clamp——切后台回来不瞬移（SPEC §5 条 3、8）。 */
  frame(dt: number): void {
    const clamped = Math.min(dt, this.dtMax);
    if (this._mode === 'spin') {
      this._theta += this.driver.omega * clamped;
      const a = this.solver.nodes[this.driver.anchor];
      this.solver.setFixed(this.driver.tip, true);
      this.solver.setNode(
        this.driver.tip,
        a.x + this.driver.radius * Math.cos(this._theta),
        a.y + this.driver.radius * Math.sin(this._theta),
      );
      this.solver.iterate(this.spinSweeps);
      this.solver.setFixed(this.driver.tip, false);
    } else if (this._mode === 'drag') {
      this.solver.iterate(this.dragSweeps);
    }
    // idle：不驱动、不迭代——静止构型本来就是收敛解
  }
}
