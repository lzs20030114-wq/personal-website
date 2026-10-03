import { PlanSim, nearestUnit, seededRng, type PlanSimOpts, type PlanUnit, type Waypoint } from './unit-activation';

/** Behaviour categories informed by research; timings are demonstration choices. */
export const CAT_BEHAVIOURS = [
  { key: 'pass', zh: '通行', en: 'Pass through' },
  { key: 'rest', zh: '停留观察', en: 'Pause & watch' },
  { key: 'play', zh: '玩耍', en: 'Play' },
  { key: 'free', zh: '自由', en: 'Free' },
] as const;
export type CatBehaviour = typeof CAT_BEHAVIOURS[number]['key'];
type Episode = Exclude<CatBehaviour, 'free'>;
export const CAT = { bodyR: 0.14, prepare: 1, speed: 0.55, seed: 20261003 } as const;
interface Leg { point: Waypoint; speed: number; unit: PlanUnit; }

/** Cats occupy the units. Human exclusion circles and aisle routes do not apply. */
export class CatPlanSim extends PlanSim {
  behaviour: CatBehaviour = 'free';
  episode: Episode = 'rest';
  auto = true;
  pace = 1;
  toy: { x: number; y: number } | null = null;
  private legs: Leg[] = [];
  private pending: Leg | null = null;
  private transfer: { from: PlanUnit; to: PlanUnit } | null = null;
  private prepared = 0;
  private random = seededRng(CAT.seed);
  private legSpeed: number = CAT.speed;

  constructor(opts: Pick<PlanSimOpts, 'grid' | 'threshold' | 'fade' | 'mode'> & { behaviour?: CatBehaviour } = {}) {
    super({ path: 'free', threshold: CAT.prepare, fade: 6, mode: 'follow', look: true, ...opts,
      bodyR: CAT.bodyR, reach: 0, reading: 'disk', fill: 1, clearance: null, lane: false });
    this.replay(opts.behaviour ?? 'free');
  }

  get currentUnit(): PlanUnit { return nearestUnit(this.layout, this.walker.x, this.walker.y); }
  get landingUnit(): PlanUnit | null { return this.pending?.unit ?? this.transfer?.to ?? null; }
  get supportUnits(): PlanUnit[] {
    if (!this.walker.present) return [];
    return this.transfer ? [this.transfer.from, this.transfer.to] : [this.currentUnit];
  }

  replay(behaviour = this.behaviour): void {
    super.reset();
    this.behaviour = behaviour;
    this.auto = true;
    this.random = seededRng(CAT.seed);
    const first = this.layout.units[Math.floor(this.layout.n / 2) * this.layout.n];
    this.walker.place(first.x, first.y);
    this.trail.splice(0, this.trail.length, first.x, first.y);
    this.legs = []; this.pending = null; this.transfer = null; this.prepared = 0;
    this.keepSupport();
    this.begin(behaviour === 'free' ? 'pass' : behaviour);
  }

  private keepSupport(): void {
    // Starting/dragged placement supplies a platform; automatic transfers wait
    // for the destination to finish forming before leaving the current unit.
    for (const u of this.supportUnits) {
      this.act.degree[u.i] = 1;
      this.act.input[u.i] = this.act.threshold;
    }
  }

  private add(x: number, y: number, dwell = 0, speed = CAT.speed as number): void {
    const end = nearestUnit(this.layout, x, y);
    let from = this.legs[this.legs.length - 1]?.unit ?? this.currentUnit;
    const push = (u: PlanUnit) => { this.legs.push({ point: { x: u.x, y: u.y }, speed, unit: u }); from = u; };
    // Adjacent unit centres form the route, with no diagonal cut through aisles.
    while (from.col !== end.col) push(this.layout.units[from.i + Math.sign(end.col - from.col)]);
    while (from.row !== end.row) push(this.layout.units[from.i + Math.sign(end.row - from.row) * this.layout.n]);
    if (!this.legs.length) push(end);
    this.legs[this.legs.length - 1].point.dwell = dwell;
  }

  private begin(episode: Episode): void {
    this.episode = episode;
    this.toy = null;
    const { units, n } = this.layout;
    const centre = this.behaviour === 'free' ? units[Math.floor(this.random() * units.length)] : units[Math.floor(n / 2) * n + Math.floor(n / 2)];
    if (episode === 'pass') {
      const target = this.behaviour === 'free' ? centre : units[centre.row * n + (this.currentUnit.col < n / 2 ? n - 1 : 0)];
      this.add(target.x, target.y, 3);
    } else if (episode === 'rest') {
      this.add(centre.x, centre.y, 14);
    } else {
      const next = units[centre.i + (centre.col === n - 1 ? -1 : 1)];
      this.toy = { x: next.x, y: next.y };
      this.add(centre.x, centre.y, 2, 0.35);
      for (let i = 0; i < 3; i++) {
        this.add(next.x, next.y, 0.8, 1.15);
        this.add(centre.x, centre.y, 1.5, 0.65);
      }
      this.add(centre.x, centre.y, 5);
    }
  }

  setAuto(on: boolean): void {
    this.auto = on;
    if (!on) {
      const u = this.currentUnit;
      this.walker.place(u.x, u.y);
      this.legs = []; this.pending = null; this.transfer = null; this.toy = null;
      this.keepSupport();
    }
  }

  override hold(x: number, y: number): void {
    this.behaviour = 'free'; this.setAuto(false); super.hold(x, y);
  }

  override drag(x: number, y: number): void {
    if (!this.held) return;
    const u = nearestUnit(this.layout, x, y);
    super.drag(u.x, u.y);
    this.keepSupport();
  }

  override pointerTarget(x: number, y: number): void {
    this.behaviour = 'free'; this.setAuto(false); this.episode = 'pass';
    this.add(x, y);
  }

  clearTraces(): void {
    this.field.clear(); this.act.reset(); this.trail.length = 0;
    this.prepared = 0;
    this.keepSupport();
  }

  protected override imprint(dt: number): void {
    for (const u of this.supportUnits) this.field.imprint(u.x, u.y, this.layout.platR, dt);
  }

  protected override activationInputs(): Float64Array {
    const inputs = super.activationInputs();
    // Occupancy maintains support; only the next planned landing gets an
    // anticipatory request. Past visits continue through shared trace decay.
    for (const u of this.supportUnits) inputs[u.i] = this.act.threshold;
    if (this.pending) inputs[this.pending.unit.i] = Math.max(inputs[this.pending.unit.i], Math.min(this.act.threshold, this.prepared));
    return inputs;
  }

  get state(): 'held' | 'prepare' | 'walk' | 'watch' | 'chase' | 'rest' {
    if (this.held) return 'held';
    if (this.pending) return 'prepare';
    if (this.walker.state === 'walk') return this.episode === 'play' ? 'chase' : 'walk';
    return this.episode === 'play' ? 'watch' : 'rest';
  }

  override step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let left = Math.min(dt, 1);
    while (left > 1e-9) {
      const h = Math.min(left, 1 / 60); left -= h;
      if (this.walker.state !== 'walk') this.transfer = null;
      if (!this.held && this.walker.present && this.walker.state === 'idle') {
        if (!this.pending) {
          if (!this.legs.length && this.auto) {
            const r = this.random();
            this.begin(this.behaviour === 'free' ? (r < 0.4 ? 'rest' : r < 0.7 ? 'pass' : 'play') : this.behaviour);
          }
          this.pending = this.legs.shift() ?? null;
          this.prepared = 0;
        }
        if (this.pending) {
          this.prepared += h;
          if (this.act.degree[this.pending.unit.i] >= 1 - 1e-9) {
            this.transfer = this.currentUnit.i === this.pending.unit.i ? null : { from: this.currentUnit, to: this.pending.unit };
            this.legSpeed = this.pending.speed;
            this.walker.pushTarget(this.pending.point);
            this.pending = null;
          }
        }
      }
      this.walker.speed = this.legSpeed * this.pace;
      super.step(h);
      if (this.trail.length > 1600) this.trail.splice(0, this.trail.length - 1600);
    }
  }
}
