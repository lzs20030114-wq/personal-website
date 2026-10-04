import { PlanSim, nearestUnit, seededRng, type PlanSimOpts, type PlanUnit } from './unit-activation';
import { CAT_DEMO, CAT_PLAY, type CatEpisode, type CatPhase, type CatPose } from './cat-rules';

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
interface Action { phase: CatPhase; seconds?: number; speed?: number; unit?: PlanUnit; look?: PlanUnit; }
/** How the demonstration operator is moving the toy (or the viewer, `held`). */
export type ToyMode = 'twitch' | 'pause' | 'dart' | 'caught' | 'held' | 'dropped';
interface Operator { mode: ToyMode; t: number; dur: number; bx: number; by: number; tx: number; ty: number; speed: number;
  /** Seconds since the last dart, and the hesitation drawn once the cat came near (waiting modes only). */
  waited?: number; hesitate?: number; nearFor?: number; }

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
  readonly visited = new Set<number>();
  /** Play only. Interest drains while playing and with each catch; a new toy restores it (Hall et al. 2002). */
  interest = 1;
  /** Counts toys offered (start of a bout, swaps); the drawing changes the toy's colour with it. */
  toyKind = 0;
  catches = 0;
  private op: Operator | null = null;
  private toySpeed = 0;
  /** Two lagged copies of the toy position; their gap over `speedTau` is the smoothed speed. */
  private lagToy = { x: 0, y: 0 };
  private lagToy2 = { x: 0, y: 0 };
  /** Does the cat read the toy as travelling (with hysteresis — see CAT_PLAY.moveOn/moveOff)? */
  toyMoving = false;
  private quitTime = -1;
  /** Seconds since the last catch ended; the cat recovers before it can catch again (D1). */
  private sinceCatch = Infinity;
  private playSpeed: number = CAT.speed;
  private rng = seededRng(CAT_PLAY.seed);

  /** `threshold` = seconds of occupancy that fill a use trace; `gazeOpen` = seconds of fixation that open a unit. */
  constructor(opts: Pick<PlanSimOpts, 'grid' | 'threshold' | 'fade' | 'mode'> & { behaviour?: CatBehaviour; gazeOpen?: number } = {}) {
    super({ path: 'free', threshold: CAT.useFull, fade: 6, mode: 'follow', look: false, ...opts,
      bodyR: CAT.bodyR, reach: 0, reading: 'disk', fill: 1, clearance: null, lane: false });
    this.gazeTrace = new Float64Array(this.layout.units.length);
    this.gazeTouched = new Uint8Array(this.layout.units.length);
    this.gazeOpen = opts.gazeOpen ?? CAT.gazeOpen;
    this.replay(opts.behaviour ?? 'free');
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
    this.rng = seededRng(CAT_PLAY.seed); this.toyKind = 0; this.catches = 0; this.op = null; this.toy = null;
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

  private add(x: number, y: number, phase: CatPhase = 'walk', speed = CAT.speed as number): void {
    const end = nearestUnit(this.layout, x, y);
    let from = [...this.actions].reverse().find(a => a.unit)?.unit ?? this.currentUnit;
    const push = (u: PlanUnit) => { this.actions.push({ phase, speed, unit: u }); from = u; };
    // Adjacent unit centres form the route, with no diagonal cut through aisles.
    while (from.col !== end.col) push(this.layout.units[from.i + Math.sign(end.col - from.col)]);
    while (from.row !== end.row) push(this.layout.units[from.i + Math.sign(end.row - from.row) * this.layout.n]);
  }

  private begin(episode: CatEpisode): void {
    this.episode = episode;
    this.toy = null; this.op = null;
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
      // Play has no route: the cat reacts to the toy every step (playStep), the operator moves the toy.
      this.offerToy();
    }
  }

  private nextAction(): void {
    this.action = this.actions.shift() ?? null;
    this.phaseTime = 0;
    if (!this.action) return;
    this.phase = this.action.phase;
    this.pending = this.action.unit ?? null;
  }

  private setPhase(p: CatPhase): void {
    if (this.phase !== p) { this.phase = p; this.phaseTime = 0; }
  }

  // ── Play: the operator moves the toy; the cat reacts to it ─────────────────────────────────────────

  /** Toy bounds: over the unit array, so the cat can always get near it. */
  private clampToField(x: number, y: number): { x: number; y: number } {
    const m = this.layout.fieldM / 2 - 0.05;
    return { x: Math.max(-m, Math.min(m, x)), y: Math.max(-m, Math.min(m, y)) };
  }

  private between(a: number, b: number): number { return a + (b - a) * this.rng(); }

  /** The operator drops a toy near the cat (bout start, or a swap). A new toy restores interest. */
  private offerToy(): void {
    const a = this.rng() * Math.PI * 2, d = this.between(CAT_PLAY.appearMin, CAT_PLAY.appearMax);
    const p = this.clampToField(this.walker.x + Math.cos(a) * d, this.walker.y + Math.sin(a) * d);
    this.toy = p; this.toyKind++; this.interest = 1; this.quitTime = -1; this.toySpeed = 0;
    this.lagToy = { ...p }; this.lagToy2 = { ...p }; this.toyMoving = false;
    this.sinceCatch = Infinity;
    this.wait(0, 'twitch');
    this.actions = []; this.action = null; this.pending = null;
    this.setPhase('watch');
  }

  /** Swap in a contrasting toy (Hall et al. 2002: renews play after habituation). Play episodes only. */
  newToy(): void {
    if (this.episode !== 'play' || !this.auto || this.held) return;
    this.offerToy();
  }

  /** D1 operator: dart to a new spot (away from a close cat), then pause or twitch, then dart again. */
  private dart(escape: boolean): void {
    const t = this.toy!, cat = this.walker;
    const away = Math.atan2(t.y - cat.y, t.x - cat.x);
    const close = Math.hypot(t.x - cat.x, t.y - cat.y) < 0.8;
    let a = escape || close ? away + (this.rng() - 0.5) * (Math.PI * 2 / 3) : this.rng() * Math.PI * 2;
    const d = escape ? this.between(CAT_PLAY.escapeMin, CAT_PLAY.escapeMax) : this.between(CAT_PLAY.dartMin, CAT_PLAY.dartMax);
    let to = this.clampToField(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d);
    // A dart cut short by the wall turns back into the open room (otherwise the toy pins the cat to an edge).
    if (Math.hypot(to.x - t.x, to.y - t.y) < 0.6 * d) {
      a = Math.atan2(-t.y, -t.x) + (this.rng() - 0.5) * (Math.PI * 2 / 3);
      to = this.clampToField(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d);
    }
    this.op = { mode: 'dart', t: 0, dur: Infinity, bx: t.x, by: t.y, tx: to.x, ty: to.y, speed: escape ? CAT_PLAY.escapeSpeed : CAT_PLAY.dartSpeed };
  }

  private operate(h: number): void {
    const op = this.op, t = this.toy;
    if (!op || !t) return;
    op.t += h;
    if (op.mode === 'caught') {
      // Under the forepaws while caught; then the operator pulls it away (prey escape).
      const reach = CAT.bodyR * 1.05;
      t.x = this.walker.x + Math.cos(this.walker.heading) * reach; t.y = this.walker.y + Math.sin(this.walker.heading) * reach;
      if (op.t >= op.dur) this.dart(true);
    } else if (op.mode === 'dart') {
      const dx = op.tx - t.x, dy = op.ty - t.y, d = Math.hypot(dx, dy), step = op.speed * h;
      if (d <= step) { t.x = op.tx; t.y = op.ty; this.wait(0); }
      else { t.x += (dx / d) * step; t.y += (dy / d) * step; }
    } else if (op.mode === 'twitch' || op.mode === 'pause') {
      if (op.mode === 'twitch') {
        const w = 2 * Math.PI * CAT_PLAY.twitchHz * op.t, A = CAT_PLAY.twitchAmp;
        t.x = op.bx + Math.sin(w) * A; t.y = op.by + Math.sin(w * 0.7 + 1) * A * 0.6;
      }
      op.waited = (op.waited ?? 0) + h;
      const near = Math.hypot(this.walker.x - op.bx, this.walker.y - op.by) < CAT_PLAY.near;
      if (near) {
        // The cat is close: hesitate a moment (its chance to pounce), then escape.
        op.hesitate ??= this.between(CAT_PLAY.hesitateMin, CAT_PLAY.hesitateMax);
        op.nearFor = (op.nearFor ?? 0) + h;
        if (op.nearFor >= op.hesitate) { t.x = op.bx; t.y = op.by; this.dart(true); }
      } else if (op.t >= op.dur) {
        t.x = op.bx; t.y = op.by;
        if (op.waited >= CAT_PLAY.lureMax) this.dart(false);
        else this.wait(op.waited, op.mode === 'twitch' ? 'pause' : 'twitch');
      }
    }
    // Smoothed speed: the first lag filters the twitch out, the gap between the two lags is the travel.
    const k = 1 - Math.exp(-h / CAT_PLAY.speedTau);
    this.lagToy = { x: this.lagToy.x + (t.x - this.lagToy.x) * k, y: this.lagToy.y + (t.y - this.lagToy.y) * k };
    this.lagToy2 = { x: this.lagToy2.x + (this.lagToy.x - this.lagToy2.x) * k, y: this.lagToy2.y + (this.lagToy.y - this.lagToy2.y) * k };
    this.toySpeed = Math.hypot(this.lagToy.x - this.lagToy2.x, this.lagToy.y - this.lagToy2.y) / CAT_PLAY.speedTau;
    this.toyMoving = this.toyMoving ? this.toySpeed > CAT_PLAY.moveOff : this.toySpeed > CAT_PLAY.moveOn;
  }

  /** The toy waits where it is (twitching or still) to lure the cat; `waited` carries over between the two. */
  private wait(waited: number, mode?: 'twitch' | 'pause'): void {
    const t = this.toy!, m = mode ?? (this.rng() < 0.5 ? 'twitch' : 'pause');
    this.op = { mode: m, t: 0, bx: t.x, by: t.y, tx: t.x, ty: t.y, speed: 0, waited,
      dur: m === 'twitch' ? this.between(CAT_PLAY.twitchMin, CAT_PLAY.twitchMax) : this.between(CAT_PLAY.pauseMin, CAT_PLAY.pauseMax) };
  }

  /** Keep a point on a platform: within the disk, leaving room for the cat's body. */
  private onPlatform(u: PlanUnit, x: number, y: number): { x: number; y: number } {
    const lim = Math.max(0, this.layout.platR - CAT.bodyR * 0.5), dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy);
    return d <= lim ? { x, y } : { x: u.x + (dx / d) * lim, y: u.y + (dy / d) * lim };
  }

  /** Where on unit u the cat would get closest to the toy, and how close that is. */
  private reachFrom(u: PlanUnit): { p: { x: number; y: number }; d: number } {
    const t = this.toy!, p = this.onPlatform(u, t.x, t.y);
    return { p, d: Math.hypot(t.x - p.x, t.y - p.y) };
  }

  private quit(): void {
    this.quitTime = 0; this.pending = null;
    if (this.op) this.op = { ...this.op, mode: 'dropped', t: 0 };
    // Turns away from the toy (schematic); a quitting cat does not fixate it.
    if (this.toy) this.walker.heading = Math.atan2(this.walker.y - this.toy.y, this.walker.x - this.toy.x);
    this.setPhase('sit');
  }

  /**
   * One decision step of play. Rules are deterministic in the toy's state; variety comes from the toy.
   * - toy within paw reach → capture (the operator holds it under the paws, then pulls it away);
   * - interest below `stop` → quit: sit, then lie; a new toy is offered after `swapAfter`;
   * - toy moving and interest below `vigorous` → only watch;
   * - toy closest to the cat's own platform → move within the platform toward it;
   * - otherwise the neighbouring unit (8-way) from which the cat gets closest is the landing: the cat looks
   *   at it, the space opens it from that gaze, and the cat jumps once it is fully open — chasing a moving
   *   toy fast, stalking a still one slowly.
   */
  private playStep(h: number): void {
    const cat = this.walker;
    if (this.quitTime >= 0) {
      this.quitTime += h;
      this.setPhase(this.quitTime < CAT_PLAY.quitSit ? 'sit' : 'lie');
      if (this.behaviour === 'free' && this.quitTime >= CAT_PLAY.quitSit) {
        this.toy = null; this.op = null; this.quitTime = -1;
        this.begin(CAT_DEMO.tour[++this.tourIndex % CAT_DEMO.tour.length]);
        this.nextAction();
      } else if (this.quitTime >= CAT_PLAY.swapAfter) this.offerToy();
      return;
    }
    const toy = this.toy;
    if (!toy) return;
    if (this.transfer) return; // mid-jump: committed
    const d = Math.hypot(toy.x - cat.x, toy.y - cat.y);
    if (this.phase === 'capture') {
      if (this.op?.mode === 'caught') return;
      this.setPhase('watch'); this.sinceCatch = 0;
    }
    this.sinceCatch += h;
    if (d <= CAT_PLAY.pawReach && this.sinceCatch >= CAT_PLAY.recover) {
      if (cat.state === 'walk') cat.place(cat.x, cat.y);
      cat.heading = Math.atan2(toy.y - cat.y, toy.x - cat.x);
      this.pending = null; this.catches++;
      this.interest = Math.max(0, this.interest - CAT_PLAY.catchCost);
      this.setPhase('capture');
      this.op = { mode: 'caught', t: 0, dur: CAT_DEMO.captureSeconds, bx: toy.x, by: toy.y, tx: toy.x, ty: toy.y, speed: 0 };
      return;
    }
    if (this.interest <= CAT_PLAY.stop) { this.quit(); return; }
    const moving = this.toyMoving, vigorous = this.interest > CAT_PLAY.vigorous;
    if (moving && !vigorous) { this.pending = null; this.setPhase('watch'); return; }
    // A moving toy is chased. A still one is walked up to, stalked within `stalkFrom`, rushed within `pounce`.
    const phase: CatPhase = moving || d <= CAT_PLAY.pounce ? 'chase' : d <= CAT_PLAY.stalkFrom ? 'stalk' : 'walk';
    this.setPhase(phase);
    this.playSpeed = phase === 'chase' ? CAT_DEMO.chaseSpeed : phase === 'stalk' ? CAT_DEMO.stalkSpeed : CAT_DEMO.walkSpeed;
    const here = this.currentUnit, own = this.reachFrom(here);
    let best: PlanUnit | null = null, bestD = own.d - 1e-6;
    for (const u of this.layout.units) {
      if (u.i === here.i || Math.max(Math.abs(u.row - here.row), Math.abs(u.col - here.col)) > 1) continue;
      const r = this.reachFrom(u);
      if (r.d < bestD) { best = u; bestD = r.d; }
    }
    // Keep the landing already picked unless another is clearly better (a twitching toy must not flip it).
    const kept = this.pending;
    if (best && kept && kept.i !== best.i && Math.max(Math.abs(kept.row - here.row), Math.abs(kept.col - here.col)) <= 1
      && this.reachFrom(kept).d <= bestD + 0.08) best = kept;
    if (!best) {
      this.pending = null;
      if (Math.hypot(own.p.x - cat.x, own.p.y - cat.y) > 0.02 && cat.state !== 'walk') cat.pushTarget(own.p);
      return;
    }
    this.pending = best;
    if (cat.state === 'walk') cat.place(cat.x, cat.y);
    if (this.act.degree[best.i] >= 1 - 1e-9) {
      this.transfer = { from: here, to: best };
      cat.pushTarget(this.reachFrom(best).p);
      this.pending = null;
    }
  }

  setAuto(on: boolean): void {
    this.auto = on;
    if (!on) {
      const u = this.currentUnit;
      this.walker.place(u.x, u.y);
      this.actions = []; this.action = null; this.pending = null; this.transfer = null; this.toy = null; this.op = null;
      this.quitTime = -1;
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

  get toyMode(): ToyMode | null { return this.toy ? this.op?.mode ?? null : null; }

  /** The viewer takes the wand: the toy follows the pointer; the cat keeps reacting. */
  holdToy(x: number, y: number): boolean {
    if (!this.toy || !this.op || this.op.mode === 'caught') return false;
    this.op = { ...this.op, mode: 'held', t: 0 };
    this.dragToy(x, y);
    return true;
  }
  dragToy(x: number, y: number): void {
    if (this.op?.mode !== 'held' || !this.toy) return;
    const p = this.clampToField(x, y);
    this.toy.x = p.x; this.toy.y = p.y;
  }
  releaseToy(): void {
    if (this.op?.mode !== 'held' || !this.toy) return;
    this.wait(0, 'pause');
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
    // Lying, quitting, or pawing the toy under its feet: not looking out at any unit.
    if (this.held || !this.walker.present || this.phase === 'lie' || this.phase === 'capture' || this.quitTime >= 0) return null;
    // In play the cat looks at the landing it has picked, otherwise at the toy itself.
    if (this.episode === 'play' && this.pending) return this.pending;
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
    // Waiting for a landing: crouched when stalking or about to rush, standing otherwise.
    if (this.pending) return this.episode === 'play' && this.phase !== 'walk' ? 'crouch' : 'stand';
    return ({ scan: 'stand', walk: 'walk', sit: 'sit', lie: 'lie', watch: 'crouch', stalk: 'crouch', chase: 'chase', capture: 'paw' } as const)[this.phase];
  }

  override step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let left = Math.min(dt, 1);
    while (left > 1e-9) {
      const h = Math.min(left, 1 / 60); left -= h;
      if (this.walker.state !== 'walk') this.transfer = null;
      const playing = this.episode === 'play' && this.auto;
      if (playing) this.operate(h);
      if (!this.held && this.walker.present && playing) this.playStep(h);
      else if (!this.held && this.walker.present) {
        if (!this.action) {
          if (!this.actions.length && this.auto) this.begin(this.behaviour === 'free' ? CAT_DEMO.tour[++this.tourIndex % CAT_DEMO.tour.length] : this.behaviour);
          if (this.episode !== 'play') this.nextAction();
        }
        // Face what is being fixated (a glance target or the landing).
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
      this.walker.speed = (playing ? this.playSpeed : this.action?.speed ?? CAT.speed) * this.pace;
      // In play the cat faces what it is looking at while it stands (the landing it picked, else the toy).
      if (playing && this.quitTime < 0 && this.walker.state !== 'walk') {
        const f = this.pending ?? this.toy;
        if (f && Math.hypot(f.x - this.walker.x, f.y - this.walker.y) > 1e-6) this.walker.heading = Math.atan2(f.y - this.walker.y, f.x - this.walker.x);
      }
      super.step(h);
      this.phaseTime += h;
      this.visited.add(this.currentUnit.i);
      if (playing && this.quitTime < 0) this.interest = Math.max(0, this.interest - CAT_PLAY.drainPerSecond * h);
      if (!playing && this.action && !this.pending && this.walker.state === 'idle' && (this.action.unit || this.phaseTime >= (this.action.seconds ?? 0))) {
        this.action = null;
        if (!this.auto && !this.actions.length) { this.phase = 'sit'; this.phaseTime = 0; }
      }
      if (this.trail.length > 1600) this.trail.splice(0, this.trail.length - 1600);
    }
  }
}
