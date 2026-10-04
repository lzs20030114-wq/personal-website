import { PlanSim, nearestUnit, wrapAngle, type PlanSimOpts, type PlanUnit } from './unit-activation';
import { CAT_DEMO, CAT_EXPLORE, type CatEpisode, type CatPhase, type CatPose } from './cat-rules';

/** Behaviour categories informed by research; timings are demonstration choices. */
export const CAT_BEHAVIOURS = [
  { key: 'pass', zh: '通行', en: 'Pass through' },
  { key: 'rest', zh: '停留休息', en: 'Rest' },
  { key: 'explore', zh: '探索', en: 'Explore' },
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
interface Action<P extends string> { phase: CatPhase | P; seconds?: number; speed?: number; unit?: PlanUnit; look?: PlanUnit; }
export type CatSimOpts = Pick<PlanSimOpts, 'grid' | 'threshold' | 'fade' | 'mode'> & { gazeOpen?: number };

const POSES: Record<CatPhase, CatPose> = { scan: 'stand', walk: 'walk', sit: 'sit', lie: 'lie', investigate: 'sniff' };

/**
 * Cats occupy the units. Human exclusion circles and aisle routes do not apply.
 *
 * Two observable channels reach the units, and nothing else does (case page, Method: traces are the only
 * channel between the layers): platform occupancy (`field`) and the cat's fixation (`gazeTrace`).
 * `activationInputs` never reads the planned route — the space anticipates from where the cat looks.
 *
 * `WP`/`WE` let a subclass add phases and an episode of its own: the wand-toy play parked for the
 * human+cat lab (cat-wand.ts) uses them. Lab 2-12 uses this class as is — the cat alone.
 */
export class CatPlanSim<WP extends string = never, WE extends string = never> extends PlanSim {
  behaviour: CatBehaviour | WE = 'free';
  episode: CatEpisode | WE = 'rest';
  phase: CatPhase | WP = 'sit';
  phaseTime = 0;
  auto = true;
  pace = 1;
  protected actions: Action<WP>[] = [];
  protected action: Action<WP> | null = null;
  protected pending: PlanUnit | null = null;
  protected transfer: { from: PlanUnit; to: PlanUnit } | null = null;
  protected tourIndex = 0;
  /** Seconds of fixation per unit, capped at `gazeOpen`; fades over `fade` like the use trace. */
  readonly gazeTrace: Float64Array;
  private readonly gazeTouched: Uint8Array;
  gazeOpen: number;
  /** The unit the cat's fixation reached in the latest sub-step (null = not fixating any unit). */
  gazeUnit: PlanUnit | null = null;
  readonly visited = new Set<number>();
  /** Explore: seconds spent on each platform, forgotten over time. The cat's memory — not a unit input. */
  readonly familiar: Float64Array;
  /** Explore: platforms left in this episode, and whether the one it is heading to is new to it. */
  private exploreLeft = 0;
  private arrivingNew = true;

  /** `threshold` = seconds of occupancy that fill a use trace; `gazeOpen` = seconds of fixation that open a unit. */
  constructor(opts: CatSimOpts & { behaviour?: CatBehaviour | NoInfer<WE> } = {}) {
    super({ path: 'free', threshold: CAT.useFull, fade: 6, mode: 'follow', look: false, ...opts,
      bodyR: CAT.bodyR, reach: 0, reading: 'disk', fill: 1, clearance: null, lane: false });
    this.gazeTrace = new Float64Array(this.layout.units.length);
    this.gazeTouched = new Uint8Array(this.layout.units.length);
    this.familiar = new Float64Array(this.layout.units.length);
    this.gazeOpen = opts.gazeOpen ?? CAT.gazeOpen;
    // A subclass replays from its own constructor, once its fields exist.
    if (new.target === CatPlanSim) this.replay(opts.behaviour ?? 'free');
  }

  /** The platform the cat is on; mid-jump, the nearer of the two it is jumping between (a diagonal jump's
   *  midpoint is nearest to a third, unopened unit, which is not where the cat is). */
  get currentUnit(): PlanUnit {
    const w = this.walker, tr = this.transfer;
    if (tr) return Math.hypot(w.x - tr.from.x, w.y - tr.from.y) <= Math.hypot(w.x - tr.to.x, w.y - tr.to.y) ? tr.from : tr.to;
    return nearestUnit(this.layout, w.x, w.y);
  }
  get landingUnit(): PlanUnit | null { return this.pending ?? this.transfer?.to ?? null; }
  get supportUnits(): PlanUnit[] {
    if (!this.walker.present) return [];
    return this.transfer ? [this.transfer.from, this.transfer.to] : [this.currentUnit];
  }

  /** Free mode cycles through these episodes. */
  protected get tour(): readonly (CatEpisode | WE)[] { return CAT_DEMO.tour; }
  /** Behaviours that start on the platform in the middle of the field rather than at a row's end. */
  protected startsCentral(behaviour: CatBehaviour | WE): boolean { return behaviour === 'rest' || behaviour === 'explore'; }

  replay(behaviour: CatBehaviour | WE = this.behaviour): void {
    super.reset();
    this.behaviour = behaviour;
    this.auto = true;
    this.tourIndex = 0;
    const { n, units } = this.layout;
    const first = units[Math.floor(n / 2) * n + (this.startsCentral(behaviour) ? Math.floor(n / 2) - 1 : 0)];
    this.walker.heading = 0;
    this.walker.place(first.x, first.y);
    this.trail.splice(0, this.trail.length, first.x, first.y);
    this.actions = []; this.action = null; this.pending = null; this.transfer = null;
    this.gazeTrace.fill(0); this.gazeTouched.fill(0); this.gazeUnit = null;
    this.familiar.fill(0); this.exploreLeft = 0; this.arrivingNew = true;
    this.visited.clear(); this.visited.add(first.i);
    this.keepSupport();
    this.begin(behaviour === 'free' ? this.tour[0] : behaviour);
    this.nextAction();
  }

  protected keepSupport(): void {
    // Starting/dragged placement supplies a platform; automatic transfers wait
    // for the destination to finish forming before leaving the current unit.
    for (const u of this.supportUnits) {
      this.act.degree[u.i] = 1;
      this.act.input[u.i] = this.act.threshold;
    }
  }

  private add(x: number, y: number, phase: CatPhase = 'walk', speed = CAT.speed as number): void {
    const end = nearestUnit(this.layout, x, y);
    let from = [...this.actions].reverse().find(a => a.unit)?.unit ?? this.currentUnit;
    const push = (u: PlanUnit) => { this.actions.push({ phase, speed, unit: u }); from = u; };
    // Adjacent unit centres form the route, with no diagonal cut through aisles.
    while (from.col !== end.col) push(this.layout.units[from.i + Math.sign(end.col - from.col)]);
    while (from.row !== end.row) push(this.layout.units[from.i + Math.sign(end.row - from.row) * this.layout.n]);
  }

  protected begin(episode: CatEpisode | WE): void {
    this.episode = episode;
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
    } else if (episode === 'explore') {
      this.exploreLeft = CAT_EXPLORE.bouts;
      this.arrivingNew = this.familiar[start.i] < CAT_EXPLORE.newBelow;
      this.planHop();
    }
  }

  /**
   * Explore, in short bouts (项目二_猫行为lab.md §7; all D1 except the category). On reaching a platform the
   * cat investigates it (longer if it is new), then glances toward the few least-explored parts of the room —
   * each glance falls on the first platform it would step onto that way — and sets off toward the least
   * explored, up to `boutHops` platforms, looking ahead as it goes. "Least explored" is a whole area, not the
   * next platform: a cat that only follows the edge of what it has seen ends up circling the room.
   */
  private planHop(): void {
    this.exploreLeft--;
    const here = this.currentUnit, targets = this.rankTargets(here);
    this.actions.push({ phase: 'investigate', seconds: this.arrivingNew ? CAT_EXPLORE.newSeconds : CAT_EXPLORE.knownSeconds });
    // One glance per direction: the first platform toward each of the best few targets.
    const options: PlanUnit[] = [];
    for (const t of targets) {
      const first = this.stepToward(here, t);
      if (!options.some(o => o.i === first.i)) options.push(first);
      if (options.length === CAT_EXPLORE.options) break;
    }
    const turn = (u: PlanUnit) => wrapAngle(Math.atan2(u.y - here.y, u.x - here.x) - this.walker.heading);
    // The head sweeps across the options from one side to the other.
    for (const o of [...options].sort((a, b) => turn(a) - turn(b))) this.actions.push({ phase: 'scan', seconds: CAT_DEMO.glanceSeconds, look: o });
    let at = here;
    for (let k = 0; k < CAT_EXPLORE.boutHops && at.i !== targets[0].i; k++) {
      at = this.stepToward(at, targets[0]);
      this.actions.push({ phase: 'walk', unit: at });
    }
    this.arrivingNew = this.familiar[at.i] < CAT_EXPLORE.newBelow;
  }

  /**
   * Platforms ranked as places to explore: how unfamiliar the area around each one is (Gaussian-weighted
   * mean over `areaSigma` grid pitches, a platform counting as unfamiliar by exp(−familiarity / knownAfter)).
   * Equally unfamiliar areas: the farther one first (so the cat crosses the room), then the one it faces.
   */
  private rankTargets(here: PlanUnit): PlanUnit[] {
    const { units, pitchM } = this.layout, s2 = 2 * (CAT_EXPLORE.areaSigma * pitchM) ** 2;
    const fresh = units.map(v => Math.exp(-this.familiar[v.i] / CAT_EXPLORE.knownAfter));
    const ranked = units.filter(u => u.i !== here.i).map(u => {
      let sw = 0, sf = 0;
      for (const v of units) { const w = Math.exp(-((v.x - u.x) ** 2 + (v.y - u.y) ** 2) / s2); sw += w; sf += w * fresh[v.i]; }
      return { u, area: sf / sw, far: Math.hypot(u.x - here.x, u.y - here.y), turn: Math.abs(wrapAngle(Math.atan2(u.y - here.y, u.x - here.x) - this.walker.heading)) };
    });
    ranked.sort((a, b) => Math.abs(a.area - b.area) > 1e-3 ? b.area - a.area
      : Math.abs(a.far - b.far) > 1e-9 ? b.far - a.far : a.turn !== b.turn ? a.turn - b.turn : a.u.i - b.u.i);
    return ranked.map(r => r.u);
  }

  /** The neighbouring platform (8-way) that gets closest to `to`; ties go to the one the cat faces. */
  private stepToward(from: PlanUnit, to: PlanUnit): PlanUnit {
    let best = from, bestD = Infinity, bestTurn = Infinity;
    for (const u of this.layout.units) {
      if (u.i === from.i || Math.max(Math.abs(u.row - from.row), Math.abs(u.col - from.col)) > 1) continue;
      const d = Math.hypot(u.x - to.x, u.y - to.y), turn = Math.abs(wrapAngle(Math.atan2(u.y - from.y, u.x - from.x) - this.walker.heading));
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && turn < bestTurn)) { best = u; bestD = d; bestTurn = turn; }
    }
    return best;
  }

  /** When the queued actions run out: the next platform while exploring, else the next episode. */
  protected refill(): void {
    if (this.episode === 'explore' && this.exploreLeft > 0) this.planHop();
    else this.begin(this.behaviour === 'free' ? this.tour[++this.tourIndex % this.tour.length] : this.behaviour as CatEpisode | WE);
  }

  protected nextAction(): void {
    this.action = this.actions.shift() ?? null;
    this.phaseTime = 0;
    if (!this.action) return;
    this.phase = this.action.phase;
    this.pending = this.action.unit ?? null;
  }

  protected setPhase(p: CatPhase | WP): void {
    if (this.phase !== p) { this.phase = p; this.phaseTime = 0; }
  }

  // ── Hooks for a subclass whose episode reacts every step instead of queuing actions (cat-wand.ts) ───

  /** True while such an episode is running; then `react` drives the cat instead of the action queue. */
  protected get reactive(): boolean { return false; }
  protected react(_h: number): void {}
  protected moveSpeed(): number { return this.action?.speed ?? CAT.speed; }
  protected afterStep(_h: number): void {}

  setAuto(on: boolean): void {
    this.auto = on;
    if (!on) {
      const u = this.currentUnit;
      this.walker.place(u.x, u.y);
      this.actions = []; this.action = null; this.pending = null; this.transfer = null;
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
   * What the cat is fixating, as a point: a glanced unit, the landing it is about to take, or — while
   * crossing — the landing after this one (looking ahead). Idle sitting, lying and investigating its own
   * platform (nose down) are not fixation, and a carried cat looks at nothing. The line of sight still has
   * to reach the unit (`fixatedUnit`), so a landing that requires a turn is only seen once the cat has
   * stopped and turned.
   */
  protected fixationPoint(): { x: number; y: number } | null {
    if (this.held || !this.walker.present || this.phase === 'lie' || this.phase === 'investigate') return null;
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
    // The cat's own memory of where it has been (explore prefers the less familiar); units never read it.
    const forget = Math.pow(0.5, dt / CAT_EXPLORE.forgetHalfLife);
    for (let i = 0; i < this.familiar.length; i++) this.familiar[i] *= forget;
    for (const u of this.supportUnits) this.familiar[u.i] += dt;
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

  get state(): CatPhase | WP | 'held' | 'prepare' {
    if (this.held) return 'held';
    if (this.pending) return 'prepare';
    return this.phase;
  }

  get pose(): CatPose {
    if (this.held || this.pending) return 'stand';
    return (POSES as Record<string, CatPose>)[this.phase] ?? 'stand';
  }

  override step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let left = Math.min(dt, 1);
    while (left > 1e-9) {
      const h = Math.min(left, 1 / 60); left -= h;
      if (this.walker.state !== 'walk') this.transfer = null;
      const reactive = this.reactive;
      if (reactive) this.react(h);
      else if (!this.held && this.walker.present) {
        if (!this.action) {
          if (!this.actions.length && this.auto) this.refill();
          if (!this.reactive) this.nextAction();
        }
        // Face what is being fixated (a glance target or the landing).
        const look = this.action?.look ?? this.pending;
        if (look && this.walker.state !== 'walk') this.walker.heading = Math.atan2(look.y - this.walker.y, look.x - this.walker.x);
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
      this.walker.speed = this.moveSpeed() * this.pace;
      super.step(h);
      this.phaseTime += h;
      this.visited.add(this.currentUnit.i);
      this.afterStep(h);
      if (!reactive && this.action && !this.pending && this.walker.state === 'idle' && (this.action.unit || this.phaseTime >= (this.action.seconds ?? 0))) {
        this.action = null;
        if (!this.auto && !this.actions.length) { this.phase = 'sit'; this.phaseTime = 0; }
      }
      if (this.trail.length > 1600) this.trail.splice(0, this.trail.length - 1600);
    }
  }
}
