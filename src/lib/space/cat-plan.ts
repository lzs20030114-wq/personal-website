import { PlanSim, nearestUnit, type PlanSimOpts, type PlanUnit } from './unit-activation';
import { CAT_DEMO, type CatEpisode, type CatPhase, type CatPose } from './cat-rules';

/** Behaviour categories informed by research; timings are demonstration choices. */
export const CAT_BEHAVIOURS = [
  { key: 'pass', zh: '通行', en: 'Pass through' },
  { key: 'rest', zh: '停留休息', en: 'Rest' },
  { key: 'play', zh: '玩耍', en: 'Play' },
  { key: 'free', zh: '自由', en: 'Free' },
] as const;
export type CatBehaviour = typeof CAT_BEHAVIOURS[number]['key'];
export const CAT = { bodyR: 0.14, prepare: 1, speed: CAT_DEMO.walkSpeed } as const;
interface Action { phase: CatPhase; seconds?: number; speed?: number; unit?: PlanUnit; toy?: PlanUnit; }

/** Cats occupy the units. Human exclusion circles and aisle routes do not apply. */
export class CatPlanSim extends PlanSim {
  behaviour: CatBehaviour = 'free';
  episode: CatEpisode = 'rest';
  phase: CatPhase = 'sit';
  phaseTime = 0;
  auto = true;
  pace = 1;
  toy: { x: number; y: number } | null = null;
  private actions: Action[] = [];
  private action: Action | null = null;
  private pending: PlanUnit | null = null;
  private transfer: { from: PlanUnit; to: PlanUnit } | null = null;
  private prepared = 0;
  private tourIndex = 0;
  private toyFrom = { x: 0, y: 0 };
  private toyElapsed = 0;
  readonly visited = new Set<number>();

  constructor(opts: Pick<PlanSimOpts, 'grid' | 'threshold' | 'fade' | 'mode'> & { behaviour?: CatBehaviour } = {}) {
    super({ path: 'free', threshold: CAT.prepare, fade: 6, mode: 'follow', look: false, ...opts,
      bodyR: CAT.bodyR, reach: 0, reading: 'disk', fill: 1, clearance: null, lane: false });
    this.replay(opts.behaviour ?? 'free');
  }

  get currentUnit(): PlanUnit { return nearestUnit(this.layout, this.walker.x, this.walker.y); }
  get landingUnit(): PlanUnit | null { return this.pending ?? this.transfer?.to ?? null; }
  get supportUnits(): PlanUnit[] {
    if (!this.walker.present) return [];
    return this.transfer ? [this.transfer.from, this.transfer.to] : [this.currentUnit];
  }

  replay(behaviour = this.behaviour): void {
    super.reset();
    this.behaviour = behaviour;
    this.auto = true;
    this.tourIndex = 0;
    const { n, units } = this.layout;
    const first = units[Math.floor(n / 2) * n + (behaviour === 'rest' || behaviour === 'play' ? Math.floor(n / 2) - 1 : 0)];
    this.walker.heading = 0;
    this.walker.place(first.x, first.y);
    this.trail.splice(0, this.trail.length, first.x, first.y);
    this.actions = []; this.action = null; this.pending = null; this.transfer = null; this.prepared = 0;
    this.visited.clear(); this.visited.add(first.i);
    this.keepSupport();
    this.begin(behaviour === 'free' ? 'pass' : behaviour);
    this.nextAction();
  }

  private keepSupport(): void {
    // Starting/dragged placement supplies a platform; automatic transfers wait
    // for the destination to finish forming before leaving the current unit.
    for (const u of this.supportUnits) {
      this.act.degree[u.i] = 1;
      this.act.input[u.i] = this.act.threshold;
    }
  }

  private add(x: number, y: number, phase: CatPhase = 'walk', speed = CAT.speed as number, toy?: PlanUnit): void {
    const end = nearestUnit(this.layout, x, y);
    let from = [...this.actions].reverse().find(a => a.unit)?.unit ?? this.currentUnit;
    const push = (u: PlanUnit) => { this.actions.push({ phase, speed, unit: u, toy }); from = u; };
    // Adjacent unit centres form the route, with no diagonal cut through aisles.
    while (from.col !== end.col) push(this.layout.units[from.i + Math.sign(end.col - from.col)]);
    while (from.row !== end.row) push(this.layout.units[from.i + Math.sign(end.row - from.row) * this.layout.n]);
  }

  private begin(episode: CatEpisode): void {
    this.episode = episode;
    this.toy = null;
    const { units, n } = this.layout;
    const start = this.currentUnit;
    if (episode === 'pass') {
      const target = units[start.row * n + (start.col < n / 2 ? n - 1 : 0)];
      this.add(target.x, target.y);
      this.actions.push({ phase: 'sit', seconds: CAT_DEMO.arrivalSeconds });
    } else if (episode === 'rest') {
      this.actions.push({ phase: 'sit', seconds: CAT_DEMO.sitSeconds }, { phase: 'lie', seconds: CAT_DEMO.lieSeconds });
    } else {
      // D1: a four-unit demonstration arena, not an observed feline route.
      const dx = start.col === n - 1 ? -1 : 1, dy = start.row === n - 1 ? -n : n;
      const corners = [start, units[start.i + dx], units[start.i + dx + dy], units[start.i + dy], start];
      for (let i = 0; i < 4; i += 2) {
        const near = corners[i + 1], far = corners[i + 2];
        this.actions.push({ phase: 'watch', seconds: CAT_DEMO.watchSeconds, toy: near });
        this.add(near.x, near.y, 'stalk', CAT_DEMO.stalkSpeed, near);
        this.add(far.x, far.y, 'chase', CAT_DEMO.chaseSpeed, far);
        this.actions.push({ phase: 'capture', seconds: CAT_DEMO.captureSeconds, toy: far });
      }
    }
  }

  private nextAction(): void {
    this.action = this.actions.shift() ?? null;
    this.prepared = 0; this.phaseTime = 0; this.toyElapsed = 0;
    if (!this.action) return;
    this.phase = this.action.phase;
    this.pending = this.action.unit ?? null;
    this.toyFrom = this.toy ? { ...this.toy } : { x: this.walker.x, y: this.walker.y };
    this.updateToy(0);
  }

  private updateToy(dt: number): void {
    const target = this.action?.toy;
    if (!target) { this.toy = null; return; }
    this.toyElapsed += dt;
    if (this.phase === 'capture') {
      // Place the caught object beneath the forepaws, within the occupied platform.
      const reach = CAT.bodyR * 1.05;
      this.toy = { x: this.walker.x + Math.cos(this.walker.heading) * reach, y: this.walker.y + Math.sin(this.walker.heading) * reach };
    } else {
      // D1: the toy is moved by the demonstration, not by another simulated animal.
      const f = Math.min(1, this.toyElapsed / CAT_DEMO.toyMoveSeconds);
      this.toy = { x: this.toyFrom.x + (target.x - this.toyFrom.x) * f, y: this.toyFrom.y + (target.y - this.toyFrom.y) * f };
    }
    if (this.toy && this.phase !== 'capture') {
      this.walker.gaze = Math.atan2(this.toy.y - this.walker.y, this.toy.x - this.walker.x);
      if (this.walker.state !== 'walk') this.walker.heading = this.walker.gaze;
    }
  }

  setAuto(on: boolean): void {
    this.auto = on;
    if (!on) {
      const u = this.currentUnit;
      this.walker.place(u.x, u.y);
      this.actions = []; this.action = null; this.pending = null; this.transfer = null; this.toy = null;
      this.episode = 'rest'; this.phase = 'sit'; this.phaseTime = 0;
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
    this.visited.add(u.i);
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
    if (this.pending) inputs[this.pending.i] = Math.max(inputs[this.pending.i], Math.min(this.act.threshold, this.prepared));
    return inputs;
  }

  get state(): CatPhase | 'held' | 'prepare' {
    if (this.held) return 'held';
    if (this.pending) return 'prepare';
    return this.phase;
  }

  get pose(): CatPose {
    if (this.held) return 'stand';
    if (this.pending) return this.episode === 'play' ? 'crouch' : 'stand';
    return ({ walk: 'walk', sit: 'sit', lie: 'lie', watch: 'crouch', stalk: 'crouch', chase: 'chase', capture: 'paw' } as const)[this.phase];
  }

  override step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let left = Math.min(dt, 1);
    while (left > 1e-9) {
      const h = Math.min(left, 1 / 60); left -= h;
      if (this.walker.state !== 'walk') this.transfer = null;
      if (!this.held && this.walker.present) {
        if (!this.action) {
          if (!this.actions.length && this.auto) this.begin(this.behaviour === 'free' ? CAT_DEMO.tour[++this.tourIndex % CAT_DEMO.tour.length] : this.behaviour);
          this.nextAction();
        }
        if (this.pending) {
          this.prepared += h;
          if (this.act.degree[this.pending.i] >= 1 - 1e-9) {
            this.transfer = { from: this.currentUnit, to: this.pending };
            this.walker.pushTarget({ x: this.pending.x, y: this.pending.y });
            this.pending = null;
            this.phaseTime = 0;
          }
        }
      }
      this.walker.speed = (this.action?.speed ?? CAT.speed) * this.pace;
      super.step(h);
      this.phaseTime += h;
      this.updateToy(h);
      this.visited.add(this.currentUnit.i);
      if (this.action && !this.pending && this.walker.state === 'idle' && (this.action.unit || this.phaseTime >= (this.action.seconds ?? 0))) {
        this.action = null;
        if (!this.auto && !this.actions.length) { this.phase = 'sit'; this.phaseTime = 0; }
      }
      if (this.trail.length > 1600) this.trail.splice(0, this.trail.length - 1600);
    }
  }
}
