import type { LinkageSolver } from './solver';

export type Mode = 'spin' | 'drag' | 'release' | 'idle';

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

/**
 * release 阻尼（SPEC §4.2 / M3，手感即论点——THESIS_NOTES「呼吸/节律」）。
 * 松手瞬间继承拖拽末段的曲柄角速度估计，随后以指数律松弛到巡航 ω：
 * 甩得快则先快后缓地「泄劲」，静置松手则从 0 缓升——同一条规律覆盖两种手感。
 */
export interface ReleaseConfig {
  /** 松弛时间常数 τ，秒。0 = 硬切回 spin（生命感实验的「杀死」开关）。 */
  tau?: number;
  /** 松手初速估计的绝对上限 rad/s——暴力甩的封顶，防止视觉发疯 */
  omegaMax?: number;
  /** 拖拽中角速度估计的 EMA 混合系数（每帧），0–1 */
  smoothing?: number;
  /** 接回 spin 的判据：|ω − ω_cruise| ≤ snapEps·|ω_cruise| */
  snapEps?: number;
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
  release?: ReleaseConfig;
}

/** 角差回卷到 (−π, π]——跨 atan2 割线时不出现 ±2π 跳变。 */
function wrapAngle(d: number): number {
  return d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
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
  private readonly relTau: number;
  private readonly relOmegaMax: number;
  private readonly relSmoothing: number;
  private readonly relSnapEps: number;

  private _mode: Mode;
  private _theta: number;
  /** 活跃指针 id；拖拽期间其它指针的 down/move/up 一律忽略（SPEC §5 条 4b）。 */
  private activePointer = -1;
  /** 拖拽中曲柄角速度的 EMA 估计（rad/s），release 的初速来源。 */
  private omegaEst = 0;
  /** release 模式的当前角速度。 */
  private omegaRel = 0;

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
    this.relTau = opts.release?.tau ?? 0.55;
    this.relOmegaMax = opts.release?.omegaMax ?? 6;
    this.relSmoothing = opts.release?.smoothing ?? 0.5;
    this.relSnapEps = opts.release?.snapEps ?? 0.05;
    this._theta = opts.theta0 ?? -Math.PI / 3;
    this._mode = this.reducedMotion ? 'idle' : 'spin';
  }

  get mode(): Mode {
    return this._mode;
  }

  get theta(): number {
    return this._theta;
  }

  /** 当前有效角速度（HUD/调参用）：spin=巡航，release=松弛中，其余 0。 */
  get omegaNow(): number {
    if (this._mode === 'spin') return this.driver.omega;
    if (this._mode === 'release') return this.omegaRel;
    return 0;
  }

  private crankAngle(): number {
    const tip = this.solver.nodes[this.driver.tip];
    const anchor = this.solver.nodes[this.driver.anchor];
    return Math.atan2(tip.y - anchor.y, tip.x - anchor.x);
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
    this.omegaEst = 0;
    this._theta = this.crankAngle(); // 拖拽中 θ 跟踪当前姿态，供角速度估计差分
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
    // 从当前姿态接回，warm start 保证不瞬移
    this._theta = this.crankAngle();
    if (this.reducedMotion) {
      this._mode = 'idle';
      return;
    }
    if (this.relTau <= 0) {
      this._mode = 'spin'; // 硬切——实验开关（THESIS_NOTES「线性硬切」）
      return;
    }
    // 继承拖拽末速（封顶），进入阻尼松弛
    this.omegaRel = Math.max(-this.relOmegaMax, Math.min(this.relOmegaMax, this.omegaEst));
    this._mode = 'release';
  }

  /** 每帧驱动。dt 单位秒，内部 clamp——切后台回来不瞬移（SPEC §5 条 3、8）。 */
  frame(dt: number): void {
    const clamped = Math.min(dt, this.dtMax);
    if (this._mode === 'spin') {
      this.driveCrank(this.driver.omega * clamped);
    } else if (this._mode === 'drag') {
      this.solver.iterate(this.dragSweeps);
      // 曲柄角速度 EMA 估计（release 初速）。dt=0 的帧不产生瞬时速度，跳过
      if (clamped > 1e-6) {
        const theta = this.crankAngle();
        const inst = wrapAngle(theta - this._theta) / clamped;
        this.omegaEst += (inst - this.omegaEst) * this.relSmoothing;
        this._theta = theta;
      }
    } else if (this._mode === 'release') {
      this.driveCrank(this.omegaRel * clamped);
      // 指数松弛到巡航值：帧率无关（120Hz 与 60Hz 同手感）
      this.omegaRel += (this.driver.omega - this.omegaRel) * (1 - Math.exp(-clamped / this.relTau));
      if (Math.abs(this.omegaRel - this.driver.omega) <= this.relSnapEps * Math.abs(this.driver.omega)) {
        this._mode = 'spin';
      }
    }
    // idle：不驱动、不迭代——静止构型本来就是收敛解
  }

  /** 位置驱动一帧：θ 前进 dTheta，B 摆上曲柄圆并临时锚定，iterate，解锁（SPEC §4.2 spin）。 */
  private driveCrank(dTheta: number): void {
    this._theta += dTheta;
    const a = this.solver.nodes[this.driver.anchor];
    this.solver.setFixed(this.driver.tip, true);
    this.solver.setNode(
      this.driver.tip,
      a.x + this.driver.radius * Math.cos(this._theta),
      a.y + this.driver.radius * Math.sin(this._theta),
    );
    this.solver.iterate(this.spinSweeps);
    this.solver.setFixed(this.driver.tip, false);
  }
}
