import type { Vec3 } from './solver3d';

// 轨道相机（立体求解器 spec：3D 台架的公共装备，对标 2D controller 的地位）。
// 零 DOM：指针坐标只用差值/比值，任何一致坐标系皆可；事件接线是台架页的事。
// 交互约定（用户拍板，2026-07-10）：单指拖 = 轨道（yaw/pitch）；双指捏合 = 缩放；
// wheel = 缩放；空闲自转在用户首次拖拽后**永久停止**（视角主权归用户）。

export interface OrbitCameraOpts {
  /** 投影屏幕中心（viewBox 坐标） */
  cx: number;
  cy: number;
  /** 世界枢轴：绕它旋转、以它为投影原点 */
  pivot: Vec3;
  /** 基础缩放（px/世界单位） */
  scale?: number;
  yaw0?: number;
  pitch0?: number;
  /** 俯仰钳位（rad），默认 ±1.5 ≈ ±86°——避开极点万向锁 */
  pitchMax?: number;
  zoomMin?: number;
  zoomMax?: number;
  /** 空闲自转角速度 rad/s（0 = 关；reduced-motion 由调用方传 0） */
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

export class OrbitCamera {
  private readonly o: Required<OrbitCameraOpts>;
  private _yaw: number;
  private _pitch: number;
  private _zoom = 1;
  /** 活跃指针（≤2 有意义：1 = 轨道，2 = 捏合） */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private userTookOver = false;
  private pinch0 = 1;
  private zoom0 = 1;

  constructor(opts: OrbitCameraOpts) {
    this.o = {
      scale: 1,
      yaw0: 0,
      pitch0: 0,
      pitchMax: 1.5,
      zoomMin: 0.5,
      zoomMax: 3,
      autoYaw: 0,
      yawPerPx: 0.008,
      pitchPerPx: 0.006,
      wheelRate: 0.0012,
      ...opts,
    };
    this._yaw = this.o.yaw0;
    this._pitch = this.o.pitch0;
  }

  get yaw(): number {
    return this._yaw;
  }

  get pitch(): number {
    return this._pitch;
  }

  get zoom(): number {
    return this._zoom;
  }

  /** 正交投影：世界 → 屏幕 + 视深。 */
  project(p: Vec3): Projected {
    const x = p.x - this.o.pivot.x;
    const y = p.y - this.o.pivot.y;
    const z = p.z - this.o.pivot.z;
    const cy = Math.cos(this._yaw);
    const sy = Math.sin(this._yaw);
    const qx = x * cy + z * sy;
    const qz = -x * sy + z * cy;
    const cp = Math.cos(this._pitch);
    const sp = Math.sin(this._pitch);
    const qy = y * cp - qz * sp;
    const depth = y * sp + qz * cp;
    const s = this.o.scale * this._zoom;
    return { x: this.o.cx + qx * s, y: this.o.cy + qy * s, depth };
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
    if (this.pointers.size === 1) {
      this._yaw += (x - p.x) * this.o.yawPerPx;
      this._pitch = this.clampPitch(this._pitch - (y - p.y) * this.o.pitchPerPx);
    }
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

  /** 每帧：空闲自转（用户接管后永不再动）。 */
  tick(dt: number): void {
    if (!this.userTookOver && this.pointers.size === 0) this._yaw += this.o.autoYaw * dt;
  }

  /** 视角归位（不恢复自转——主权已交出就不抢回）。 */
  reset(): void {
    this._yaw = this.o.yaw0;
    this._pitch = this.o.pitch0;
    this._zoom = 1;
  }

  private pinchDist(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private clampPitch(v: number): number {
    return Math.max(-this.o.pitchMax, Math.min(this.o.pitchMax, v));
  }

  private clampZoom(v: number): number {
    return Math.max(this.o.zoomMin, Math.min(this.o.zoomMax, v));
  }
}
