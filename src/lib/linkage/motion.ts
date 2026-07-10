// 临界阻尼二阶跟踪（立体求解器 spec：肌肉缓动的公共装备，2D/3D 通用）。
// 速度零起步、平滑加减速、无过冲——「平滑地从零开始收缩」（用户拍板 2026-07-10）。
// rest 直跳会冲击 Verlet 动量层（抽搐），恒速逼近起步有速度突跳，均已否决。

export class CriticallyDamped {
  private _value = 0;
  private _vel = 0;
  private _target = 0;

  /** omega rad/s：到位时间 ≈ 4.7/omega（95%）。 */
  constructor(
    private readonly omega: number,
    initial = 0,
  ) {
    this._value = initial;
    this._target = initial;
  }

  get value(): number {
    return this._value;
  }

  get target(): number {
    return this._target;
  }

  set target(v: number) {
    this._target = v;
  }

  /** 硬复位（归位用）：值与速度同时清。 */
  jumpTo(v: number): void {
    this._value = v;
    this._target = v;
    this._vel = 0;
  }

  /** 推进一帧；返回 value 是否变化（false = 已静定，可跳过下游写入）。 */
  update(dt: number): boolean {
    if (this._value === this._target && this._vel === 0) return false;
    const acc = (this._target - this._value) * this.omega * this.omega - 2 * this.omega * this._vel;
    this._vel += acc * dt;
    this._value += this._vel * dt;
    if (Math.abs(this._target - this._value) < 1e-4 && Math.abs(this._vel) < 1e-3) {
      this._value = this._target;
      this._vel = 0;
    }
    return true;
  }
}
