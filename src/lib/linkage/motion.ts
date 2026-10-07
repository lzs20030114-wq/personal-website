// 临界阻尼二阶跟踪（立体求解器 spec：肌肉缓动的公共装备，2D/3D 通用）。
// 速度零起步、平滑加减速、无过冲——「平滑地从零开始收缩」（用户拍板 2026-07-10）。
// rest 直跳会冲击 Verlet 动量层（抽搐），恒速逼近起步有速度突跳，均已否决。

/**
 * 跟随器的纯数据状态（值 + 速度）。行为引擎要把整块状态序列化交接（handoff / 快照 /
 * 固件对照），类的私有字段做不到，故把算式抽成下面这个函数，类与引擎共用同一份
 * （2026-10-07 行为引擎 M1；抽出前后逐位相同，camera3d.test 的三项守门照跑）。
 */
export interface DampState {
  x: number;
  v: number;
}

/** 推进一步；返回值是否变化（false = 已静定）。到位判据与吸附阈值同类原版。 */
export function dampStep(s: DampState, target: number, omega: number, dt: number): boolean {
  if (s.x === target && s.v === 0) return false;
  const acc = (target - s.x) * omega * omega - 2 * omega * s.v;
  s.v += acc * dt;
  s.x += s.v * dt;
  if (Math.abs(target - s.x) < 1e-4 && Math.abs(s.v) < 1e-3) {
    s.x = target;
    s.v = 0;
  }
  return true;
}

export class CriticallyDamped {
  private readonly s: DampState;
  private _target: number;

  /** omega rad/s：到位时间 ≈ 4.7/omega（95%）。 */
  constructor(
    private readonly omega: number,
    initial = 0,
  ) {
    this.s = { x: initial, v: 0 };
    this._target = initial;
  }

  get value(): number {
    return this.s.x;
  }

  get target(): number {
    return this._target;
  }

  set target(v: number) {
    this._target = v;
  }

  /** 硬复位（归位用）：值与速度同时清。 */
  jumpTo(v: number): void {
    this.s.x = v;
    this.s.v = 0;
    this._target = v;
  }

  /** 推进一帧；返回 value 是否变化（false = 已静定，可跳过下游写入）。 */
  update(dt: number): boolean {
    return dampStep(this.s, this._target, this.omega, dt);
  }
}
