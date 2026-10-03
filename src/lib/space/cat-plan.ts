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
/**
 * Trigger settings (2026-10-04 revision, see 项目二_猫行为lab.md §5). Demo values, not measurements.
 * - `gazeOpen`: seconds of fixation that fully open a unit (the landing is opened by gaze, not by the plan).
 * - `useFull`: seconds of occupancy that fill a platform's use trace; longer stays retract later.
 * - `gazeReach`: fixation only reaches units one transfer away (in grid pitches).
 */
export const CAT = { bodyR: 0.14, gazeOpen: 1, useFull: 4, gazeReach: 1.5, speed: CAT_DEMO.walkSpeed } as const;
/** `look`: a unit fixated without moving (a glance at one possible landing). */
interface Action { phase: CatPhase; seconds?: number; speed?: number; unit?: PlanUnit; toy?: PlanUnit; look?: PlanUnit; }

/**
 * Cats occupy the units. Human exclusion circles and aisle routes do not apply.
 *
 * Two observable channels reach the units, and nothing else does (case page, Method: traces are the only
 * channel between the layers): platform occupancy (`field`) and the cat's fixation (`gazeTrace`).
 * `activationInputs` never reads the planned route — the space anticipates from where the cat looks.
 */
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
  private tourIndex = 0;
  /** Seconds of fixation per unit, capped at `gazeOpen`; fades over `fade` like the use trace. */
  readonly gazeTrace: Float64Array;
  private readonly gazeTouched: Uint8Array;
  gazeOpen: number;
  /** The unit the cat's fixation reached in the latest sub-step (null = not fixating any unit). */
  gazeUnit: PlanUnit | null = null;
  private toyFrom = { x: 0, y: 0 };
  private toyElapsed = 0;
  readonly visited = new Set<number>();

  /** `threshold` = seconds of occupancy that fill a use trace; `gazeOpen` = seconds of fixation that open a unit. */
  constructor(opts: Pick<PlanSimOpts, 'grid' | 'threshold' | 'fade' | 'mode'> & { behaviour?: CatBehaviour; gazeOpen?: number } = {}) {
    super({ path: 'free', threshold: CAT.useFull, fade: 6, mode: 'follow', look: false, ...opts,
      bodyR: CAT.bodyR, reach: 0, reading: 'disk', fill: 1, clearance: null, lane: false });
    this.gazeTrace = new Float64Array(this.layout.units.length);
    this.gazeTouched = new Uint8Array(this.layout.units.length);
    this.gazeOpen = opts.gazeOpen ?? CAT.gazeOpen;
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
    this.actions = []; this.action = null; this.pending = null; this.transfer = null;
    this.gazeTrace.fill(0); this.gazeTouched.fill(0); this.gazeUnit = null;
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
      // D1: before choosing a direction the cat glances at the other neighbouring units. Each glance
      // part-opens that unit (a possible landing the space anticipates); the unchosen ones retract.
      const way = Math.sign(target.col - start.col);
      for (const [dc, dr] of [[0, -1], [0, 1], [-way, 0]]) {
        const c = start.col + dc, r = start.row + dr;
        if (c >= 0 && r >= 0 && c < n && r < n) this.actions.push({ phase: 'scan', seconds: CAT_DEMO.glanceSeconds, look: units[r * n + c] });
      }
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
    this.phaseTime = 0; this.toyElapsed = 0;
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
      this.episode = 'rest'; this.phase = 'sit'; this.phaseTime = 0; this.gazeUnit = null;
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
    this.gazeTrace.fill(0); this.gazeTouched.fill(0);
    this.keepSupport();
  }

  /** Seconds of fixation that fully open a unit. Independent of the use-trace threshold. */
  setGazeOpen(v: number): void {
    this.gazeOpen = v;
    for (let i = 0; i < this.gazeTrace.length; i++) this.gazeTrace[i] = Math.min(v, this.gazeTrace[i]);
  }

  /**
   * What the cat is fixating, as a point: the toy, a glanced unit, the landing it is about to take, or —
   * while crossing — the landing after this one (looking ahead). Idle sitting and lying are not fixation,
   * and a carried cat looks at nothing. The line of sight still has to reach the unit (`fixatedUnit`),
   * so a landing that requires a turn is only seen once the cat has stopped and turned.
   */
  private fixationPoint(): { x: number; y: number } | null {
    if (this.held || !this.walker.present || this.phase === 'lie') return null;
    if (this.toy) return this.toy;
    const target = this.action?.look ?? this.pending ?? (this.transfer ? this.actions[0]?.unit : undefined);
    return target ? { x: target.x, y: target.y } : null;
  }

  /**
   * The first unit (other than the supports) that the line of sight enters before reaching the fixation
   * point, within one transfer's reach. Uses the observable gaze direction and the fixated point only.
   */
  private fixatedUnit(): PlanUnit | null {
    const p = this.fixationPoint();
    if (!p) return null;
    const { x, y } = this.walker, g = this.walker.gaze;
    const dx = Math.cos(g), dy = Math.sin(g), R = this.layout.platR;
    const limit = Math.min(Math.hypot(p.x - x, p.y - y), CAT.gazeReach * this.layout.pitchM);
    const supports = new Set(this.supportUnits.map(u => u.i));
    let best: PlanUnit | null = null, bestEntry = Infinity;
    for (const u of this.layout.units) {
      if (supports.has(u.i)) continue;
      const ux = u.x - x, uy = u.y - y, t = ux * dx + uy * dy, perp = Math.abs(ux * dy - uy * dx);
      if (t <= 0 || perp > R) continue;
      const entry = t - Math.sqrt(R * R - perp * perp);
      if (entry <= limit + 1e-9 && entry < bestEntry) { best = u; bestEntry = entry; }
    }
    return best;
  }

  protected override imprint(dt: number): void {
    // Standing on a unit settles its anticipation: the gaze trace there is consumed, and what remains
    // is the use trace — so a unit only crossed retracts sooner than one used for longer.
    for (const u of this.supportUnits) {
      this.field.imprint(u.x, u.y, this.layout.platR, dt);
      this.gazeTrace[u.i] = 0;
    }
    // Fixation trace, same shape as the use trace: capped, and linear fade over `fade` when not fixated.
    const hit = this.fixatedUnit();
    this.gazeUnit = hit;
    if (hit) {
      this.gazeTrace[hit.i] = Math.min(this.gazeOpen, this.gazeTrace[hit.i] + dt);
      this.gazeTouched[hit.i] = 1;
    }
    const fall = this.fade === null ? 0 : (this.gazeOpen * dt) / this.fade;
    const keep = this.fade === null ? Math.pow(1 - this.decay, dt) : 1;
    for (let i = 0; i < this.gazeTrace.length; i++) {
      if (this.gazeTouched[i]) { this.gazeTouched[i] = 0; continue; }
      const v = this.fade === null ? this.gazeTrace[i] * keep : this.gazeTrace[i] - fall;
      this.gazeTrace[i] = v > 1e-6 ? v : 0;
    }
  }

  protected override activationInputs(): Float64Array {
    const inputs = super.activationInputs();
    // Occupied platforms stay open (author's rule, 2026-10-04). Every other unit reads its traces only:
    // past use, and how long the cat has fixated it. The planned route is not an input.
    const scale = this.act.threshold / this.gazeOpen;
    for (let i = 0; i < inputs.length; i++) inputs[i] = Math.max(inputs[i], this.gazeTrace[i] * scale);
    for (const u of this.supportUnits) inputs[u.i] = this.act.threshold;
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
    return ({ scan: 'stand', walk: 'walk', sit: 'sit', lie: 'lie', watch: 'crouch', stalk: 'crouch', chase: 'chase', capture: 'paw' } as const)[this.phase];
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
        // Face what is being fixated (a glance target or the landing); the toy steers gaze in updateToy.
        const look = this.action?.look ?? this.pending;
        if (look && !this.toy && this.walker.state !== 'walk') this.walker.heading = Math.atan2(look.y - this.walker.y, look.x - this.walker.x);
        if (this.pending) {
          // The cat checks the structure: it leaves only once the fixated landing has fully opened.
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
