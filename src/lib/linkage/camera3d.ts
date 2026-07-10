import type { Vec3 } from './solver3d';

// 自由旋转球相机（立体求解器 spec：3D 台架公共装备，对标 2D controller 的地位）。
// v2（用户拍板 2026-07-10「左右也要能看」）：turntable（世界竖直轴 yaw + 俯仰钳位）
// 改为 **trackball**——拖拽永远绕屏幕轴旋转（横拖=屏幕竖轴，竖拖=屏幕横轴），
// 姿态存 3×3 旋转矩阵，无万向锁、无俯仰限制，可翻顶翻底任意滚转。
// v1 的问题：绕世界竖直轴旋转轴对称机构（静息触手）画面几乎不变，读作「左右转不动」。
// 零 DOM：指针坐标只用差值/比值；事件接线是台架页的事。
// 交互约定：单指拖 = 旋转；双指捏合 / wheel = 缩放；空闲自转在用户首次接管后永久停止。

export interface OrbitCameraOpts {
  /** 投影屏幕中心（viewBox 坐标） */
  cx: number;
  cy: number;
  /** 世界枢轴：绕它旋转、以它为投影原点 */
  pivot: Vec3;
  /** 基础缩放（px/世界单位） */
  scale?: number;
  /** 初始姿态（等价于旧 turntable 的 yaw/pitch 起始机位） */
  yaw0?: number;
  pitch0?: number;
  /** 初始滚转（绕屏幕法向，最后施加）：把机构「放倒」用——臂轴机构默认横躺
   *  时传 −π/2（世界 +y → 屏幕 +x）。拖拽旋转不受影响（trackball 屏幕轴） */
  roll0?: number;
  zoomMin?: number;
  zoomMax?: number;
  /** 空闲自转角速度 rad/s（绕**世界 y 轴**=机构对称轴，姿态不漂移——roll0 横躺
   *  机位下依然横躺，只有椎节自旋；0 = 关；reduced-motion 由调用方传 0） */
  autoYaw?: number;
  /** 拖拽灵敏度：rad / 指针 px */
  yawPerPx?: number;
  pitchPerPx?: number;
  /** wheel 缩放速率（/deltaY px） */
  wheelRate?: number;
}

export interface Projected {
  x: number;
  y: number;
  /** 视深：越大越近（画家排序：升序 = 远 → 近） */
  depth: number;
}

type Mat3 = [number, number, number, number, number, number, number, number, number];

const mul = (a: Mat3, b: Mat3): Mat3 => {
  const r = new Array(9) as Mat3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
};
const rotX = (t: number): Mat3 => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const rotY = (t: number): Mat3 => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const rotZ = (t: number): Mat3 => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

export class OrbitCamera {
  private readonly o: Required<OrbitCameraOpts>;
  /** 姿态矩阵：世界 → 视空间（屏幕 x 右、y 下、z 近） */
  private m: Mat3;
  private readonly m0: Mat3;
  private _zoom = 1;
  /** 活跃指针（≤2 有意义：1 = 旋转，2 = 捏合） */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private userTookOver = false;
  private pinch0 = 1;
  private zoom0 = 1;

  constructor(opts: OrbitCameraOpts) {
    this.o = {
      scale: 1,
      yaw0: 0,
      pitch0: 0,
      roll0: 0,
      zoomMin: 0.5,
      zoomMax: 3,
      autoYaw: 0,
      yawPerPx: 0.008,
      pitchPerPx: 0.006,
      wheelRate: 0.0012,
      ...opts,
    };
    this.m0 = mul(rotZ(this.o.roll0), mul(rotX(this.o.pitch0), rotY(this.o.yaw0)));
    this.m = this.m0;
  }

  get zoom(): number {
    return this._zoom;
  }

  /** 视图旋转矩阵（行主序 3×3）：view = M·(p − pivot)。WebGL 渲染层用（2026-07-10 解锁）。 */
  get matrix(): readonly number[] {
    return this.m;
  }

  get pivotPoint(): Vec3 {
    return this.o.pivot;
  }

  /** 世界单位 → 屏幕逻辑 px 的总缩放 */
  get viewScale(): number {
    return this.o.scale * this._zoom;
  }

  /** 正交投影：世界 → 屏幕 + 视深。 */
  project(p: Vec3): Projected {
    const x = p.x - this.o.pivot.x;
    const y = p.y - this.o.pivot.y;
    const z = p.z - this.o.pivot.z;
    const m = this.m;
    const s = this.o.scale * this._zoom;
    return {
      x: this.o.cx + (m[0] * x + m[1] * y + m[2] * z) * s,
      y: this.o.cy + (m[3] * x + m[4] * y + m[5] * z) * s,
      depth: m[6] * x + m[7] * y + m[8] * z,
    };
  }

  /** 屏幕轴旋转（trackball 核心）：横 = 绕屏幕竖轴，竖 = 绕屏幕横轴。 */
  rotate(dxPx: number, dyPx: number): void {
    if (dxPx) this.m = mul(rotY(dxPx * this.o.yawPerPx), this.m);
    if (dyPx) this.m = mul(rotX(-dyPx * this.o.pitchPerPx), this.m);
  }

  pointerDown(id: number, x: number, y: number): void {
    this.pointers.set(id, { x, y });
    this.userTookOver = true;
    if (this.pointers.size === 2) {
      this.pinch0 = this.pinchDist() || 1;
      this.zoom0 = this._zoom;
    }
  }

  pointerMove(id: number, x: number, y: number): void {
    const p = this.pointers.get(id);
    if (!p) return;
    if (this.pointers.size === 1) this.rotate(x - p.x, y - p.y);
    p.x = x;
    p.y = y;
    if (this.pointers.size === 2) {
      this._zoom = this.clampZoom((this.zoom0 * this.pinchDist()) / this.pinch0);
    }
  }

  /** pointerup 与 pointercancel 同路。 */
  pointerUp(id: number): void {
    this.pointers.delete(id);
  }

  wheel(deltaY: number): void {
    this.userTookOver = true;
    this._zoom = this.clampZoom(this._zoom * Math.exp(-deltaY * this.o.wheelRate));
  }

  /** 每帧：空闲自转（**后乘 = 绕世界 y 轴**，turntable 语义——机位姿态不漂移；
   *  拖拽旋转是前乘屏幕轴，两者不同域。用户接管后永不再动）。 */
  tick(dt: number): void {
    if (!this.userTookOver && this.pointers.size === 0) {
      this.m = mul(this.m, rotY(this.o.autoYaw * dt));
    }
  }

  /** 视角归位（不恢复自转——主权已交出就不抢回）。 */
  reset(): void {
    this.m = this.m0;
    this._zoom = 1;
  }

  private pinchDist(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private clampZoom(v: number): number {
    return Math.max(this.o.zoomMin, Math.min(this.o.zoomMax, v));
  }
}
