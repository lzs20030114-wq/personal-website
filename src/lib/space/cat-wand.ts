/**
 * Wand-toy play — PARKED for the human+cat lab (2026-10-04, 项目二_猫行为lab.md §7).
 *
 * Lab 2-12 is the cat alone. A wand toy needs someone holding it, so this play was taken out of that lab
 * and kept here, with its tests, for the next lab where a person is actually present. It is not mounted on
 * any page. When that lab is built, the seeded "operator" below should be replaced by the person's own
 * behaviour layer (Lab 2-9/2-10) and the rules for how a person plays with the cat are the author's.
 *
 * Contents are unchanged from the 2026-10-04 play revision (§6): the cat's responses are deterministic in
 * the toy's state; randomness is only on the operator's side.
 */
import { CAT, CatPlanSim, type CatBehaviour, type CatSimOpts } from './cat-plan';
import { CAT_DEMO, CAT_RULES, type CatEpisode, type CatPose, type CatRule } from './cat-rules';
import { seededRng, type PlanUnit } from './unit-activation';

export const WAND_RULES = {
  watch: { zh: '盯住玩具', en: 'Watch toy', source: 'ethogram', term: 'Watch' },
  stalk: { zh: '低伏靠近', en: 'Stalk', source: 'ethogram', term: 'Stalk' },
  chase: { zh: '追扑玩具', en: 'Chase & pounce', source: 'needs', term: 'Pillar 3 · moving prey-like toys' },
  capture: { zh: '前爪捕捉', en: 'Catch & paw', source: 'needs', term: 'Pillar 3 · capture / paw manipulation' },
} as const satisfies Record<string, CatRule>;
export type WandPhase = keyof typeof WAND_RULES;
/** Every action this simulation can show: the cat's own and the wand-play ones. */
export const WAND_ALL_RULES = { ...CAT_RULES, ...WAND_RULES };
export const WAND_SEQUENCE: readonly (keyof typeof WAND_ALL_RULES)[] = ['watch', 'walk', 'stalk', 'chase', 'capture'];
export const WAND_BEHAVIOURS = [
  { key: 'pass', zh: '通行', en: 'Pass through' },
  { key: 'rest', zh: '停留休息', en: 'Rest' },
  { key: 'play', zh: '玩耍', en: 'Play' },
  { key: 'free', zh: '自由', en: 'Free' },
] as const;

/**
 * Play: the cat's play reacts to a moving toy; nothing is a fixed route. The toy is moved by a
 * demonstration operator (a wand someone is holding) — seeded, so a replay is identical — or by the viewer
 * dragging it. Operator ranges, distances and rates are D1 settings.
 */
export const WAND_PLAY = {
  seed: 20261004,
  // Operator: a prey-like toy darts, then waits (pause or twitch) to lure the cat; movement elicits object
  // play (Hall 1995). When the cat comes within `near` the toy hesitates, then escapes — the hesitation is
  // the cat's chance to pounce. A toy left waiting `lureMax` without the cat coming darts somewhere else.
  dartSpeed: 1.6, escapeSpeed: 2.2,
  dartMin: 0.4, dartMax: 1.2, escapeMin: 0.8, escapeMax: 1.5,
  pauseMin: 0.6, pauseMax: 2.0, twitchMin: 1.0, twitchMax: 2.5, twitchAmp: 0.04, twitchHz: 6,
  near: 0.6, hesitateMin: 0.4, hesitateMax: 1.5, lureMax: 7,
  // The toy dropped near the cat at the start of a bout, and after a swap.
  appearMin: 1.0, appearMax: 1.8,
  // Cat side: within this centre distance the toy is under its paws. The toy reads as moving once its
  // smoothed speed passes `moveOn` and as still again below `moveOff`: a twitch in place stays still, only
  // a toy that travels reads as moving, and the reading does not flicker at the threshold.
  pawReach: 0.26, moveOn: 0.12, moveOff: 0.05, speedTau: 0.15,
  // A still toy: walked up to from afar, stalked within `stalkFrom`, rushed (pounce) within `pounce`.
  stalkFrom: 1.2, pounce: 0.7,
  // After letting go, seconds before the cat can catch again (the toy gets its chance to escape).
  recover: 0.8,
  // Interest (Hall, Bradshaw & Robinson 2002): drains while playing and with each catch; below `vigorous`
  // the cat only watches a moving toy, below `stop` it quits. A new toy restores it.
  drainPerSecond: 0.016, catchCost: 0.05, vigorous: 0.5, stop: 0.2,
  // Seconds the cat sits after quitting before lying down / before the operator offers a new toy.
  quitSit: 3, swapAfter: 10,
  // Free cycles through these.
  tour: ['pass', 'rest', 'play'] as readonly (CatEpisode | 'play')[],
} as const;

/** How the demonstration operator is moving the toy (or the viewer, `held`). */
export type ToyMode = 'twitch' | 'pause' | 'dart' | 'caught' | 'held' | 'dropped';
interface Operator { mode: ToyMode; t: number; dur: number; bx: number; by: number; tx: number; ty: number; speed: number;
  /** Seconds since the last dart, and the hesitation drawn once the cat came near (waiting modes only). */
  waited?: number; hesitate?: number; nearFor?: number; }

const WAND_POSES: Record<WandPhase, CatPose> = { watch: 'crouch', stalk: 'crouch', chase: 'chase', capture: 'paw' };

/** The cat of Lab 2-12 plus a `play` episode that follows a wand toy. Not mounted on any page. */
export class CatWandSim extends CatPlanSim<WandPhase, 'play'> {
  toy: { x: number; y: number } | null = null;
  /** Interest drains while playing and with each catch; a new toy restores it (Hall et al. 2002). */
  interest = 1;
  /** Counts toys offered (start of a bout, swaps); the drawing changes the toy's colour with it. */
  toyKind = 0;
  catches = 0;
  /** Does the cat read the toy as travelling (with hysteresis — see WAND_PLAY.moveOn/moveOff)? */
  toyMoving = false;
  private op: Operator | null = null;
  private toySpeed = 0;
  /** Two lagged copies of the toy position; their gap over `speedTau` is the smoothed speed. */
  private lagToy = { x: 0, y: 0 };
  private lagToy2 = { x: 0, y: 0 };
  private quitTime = -1;
  /** Seconds since the last catch ended; the cat recovers before it can catch again (D1). */
  private sinceCatch = Infinity;
  private playSpeed: number = CAT.speed;
  private rng = seededRng(WAND_PLAY.seed);

  constructor(opts: CatSimOpts & { behaviour?: CatBehaviour | 'play' } = {}) {
    super(opts);
    this.replay(opts.behaviour ?? 'play');
  }

  protected override get tour() { return WAND_PLAY.tour; }
  protected override startsCentral(b: CatBehaviour | 'play'): boolean { return b === 'play' || super.startsCentral(b); }
  protected override get reactive(): boolean { return this.episode === 'play' && this.auto; }

  override replay(behaviour: CatBehaviour | 'play' = this.behaviour): void {
    this.rng = seededRng(WAND_PLAY.seed); this.toyKind = 0; this.catches = 0; this.op = null; this.toy = null; this.quitTime = -1;
    super.replay(behaviour);
  }

  protected override begin(episode: CatEpisode | 'play'): void {
    this.toy = null; this.op = null;
    if (episode !== 'play') { super.begin(episode); return; }
    // Play has no route: the cat reacts to the toy every step (playStep), the operator moves the toy.
    this.episode = 'play';
    this.offerToy();
  }

  /** Toy bounds: over the unit array, so the cat can always get near it. */
  private clampToField(x: number, y: number): { x: number; y: number } {
    const m = this.layout.fieldM / 2 - 0.05;
    return { x: Math.max(-m, Math.min(m, x)), y: Math.max(-m, Math.min(m, y)) };
  }

  private between(a: number, b: number): number { return a + (b - a) * this.rng(); }

  /** The operator drops a toy near the cat (bout start, or a swap). A new toy restores interest. */
  private offerToy(): void {
    const a = this.rng() * Math.PI * 2, d = this.between(WAND_PLAY.appearMin, WAND_PLAY.appearMax);
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
    const d = escape ? this.between(WAND_PLAY.escapeMin, WAND_PLAY.escapeMax) : this.between(WAND_PLAY.dartMin, WAND_PLAY.dartMax);
    let to = this.clampToField(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d);
    // A dart cut short by the wall turns back into the open room (otherwise the toy pins the cat to an edge).
    if (Math.hypot(to.x - t.x, to.y - t.y) < 0.6 * d) {
      a = Math.atan2(-t.y, -t.x) + (this.rng() - 0.5) * (Math.PI * 2 / 3);
      to = this.clampToField(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d);
    }
    this.op = { mode: 'dart', t: 0, dur: Infinity, bx: t.x, by: t.y, tx: to.x, ty: to.y, speed: escape ? WAND_PLAY.escapeSpeed : WAND_PLAY.dartSpeed };
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
        const w = 2 * Math.PI * WAND_PLAY.twitchHz * op.t, A = WAND_PLAY.twitchAmp;
        t.x = op.bx + Math.sin(w) * A; t.y = op.by + Math.sin(w * 0.7 + 1) * A * 0.6;
      }
      op.waited = (op.waited ?? 0) + h;
      const near = Math.hypot(this.walker.x - op.bx, this.walker.y - op.by) < WAND_PLAY.near;
      if (near) {
        // The cat is close: hesitate a moment (its chance to pounce), then escape.
        op.hesitate ??= this.between(WAND_PLAY.hesitateMin, WAND_PLAY.hesitateMax);
        op.nearFor = (op.nearFor ?? 0) + h;
        if (op.nearFor >= op.hesitate) { t.x = op.bx; t.y = op.by; this.dart(true); }
      } else if (op.t >= op.dur) {
        t.x = op.bx; t.y = op.by;
        if (op.waited >= WAND_PLAY.lureMax) this.dart(false);
        else this.wait(op.waited, op.mode === 'twitch' ? 'pause' : 'twitch');
      }
    }
    // Smoothed speed: the first lag filters the twitch out, the gap between the two lags is the travel.
    const k = 1 - Math.exp(-h / WAND_PLAY.speedTau);
    this.lagToy = { x: this.lagToy.x + (t.x - this.lagToy.x) * k, y: this.lagToy.y + (t.y - this.lagToy.y) * k };
    this.lagToy2 = { x: this.lagToy2.x + (this.lagToy.x - this.lagToy2.x) * k, y: this.lagToy2.y + (this.lagToy.y - this.lagToy2.y) * k };
    this.toySpeed = Math.hypot(this.lagToy.x - this.lagToy2.x, this.lagToy.y - this.lagToy2.y) / WAND_PLAY.speedTau;
    this.toyMoving = this.toyMoving ? this.toySpeed > WAND_PLAY.moveOff : this.toySpeed > WAND_PLAY.moveOn;
  }

  /** The toy waits where it is (twitching or still) to lure the cat; `waited` carries over between the two. */
  private wait(waited: number, mode?: 'twitch' | 'pause'): void {
    const t = this.toy!, m = mode ?? (this.rng() < 0.5 ? 'twitch' : 'pause');
    this.op = { mode: m, t: 0, bx: t.x, by: t.y, tx: t.x, ty: t.y, speed: 0, waited,
      dur: m === 'twitch' ? this.between(WAND_PLAY.twitchMin, WAND_PLAY.twitchMax) : this.between(WAND_PLAY.pauseMin, WAND_PLAY.pauseMax) };
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
      this.setPhase(this.quitTime < WAND_PLAY.quitSit ? 'sit' : 'lie');
      if (this.behaviour === 'free' && this.quitTime >= WAND_PLAY.quitSit) {
        this.toy = null; this.op = null; this.quitTime = -1;
        this.begin(this.tour[++this.tourIndex % this.tour.length]);
        this.nextAction();
      } else if (this.quitTime >= WAND_PLAY.swapAfter) this.offerToy();
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
    if (d <= WAND_PLAY.pawReach && this.sinceCatch >= WAND_PLAY.recover) {
      if (cat.state === 'walk') cat.place(cat.x, cat.y);
      cat.heading = Math.atan2(toy.y - cat.y, toy.x - cat.x);
      this.pending = null; this.catches++;
      this.interest = Math.max(0, this.interest - WAND_PLAY.catchCost);
      this.setPhase('capture');
      this.op = { mode: 'caught', t: 0, dur: CAT_DEMO.captureSeconds, bx: toy.x, by: toy.y, tx: toy.x, ty: toy.y, speed: 0 };
      return;
    }
    if (this.interest <= WAND_PLAY.stop) { this.quit(); return; }
    const moving = this.toyMoving, vigorous = this.interest > WAND_PLAY.vigorous;
    if (moving && !vigorous) { this.pending = null; this.setPhase('watch'); return; }
    // A moving toy is chased. A still one is walked up to, stalked within `stalkFrom`, rushed within `pounce`.
    const phase = moving || d <= WAND_PLAY.pounce ? 'chase' : d <= WAND_PLAY.stalkFrom ? 'stalk' : 'walk';
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

  protected override react(h: number): void {
    this.operate(h);
    if (!this.held && this.walker.present) this.playStep(h);
    // In play the cat faces what it is looking at while it stands (the landing it picked, else the toy).
    if (this.quitTime < 0 && this.walker.state !== 'walk') {
      const f = this.pending ?? this.toy;
      if (f && Math.hypot(f.x - this.walker.x, f.y - this.walker.y) > 1e-6) this.walker.heading = Math.atan2(f.y - this.walker.y, f.x - this.walker.x);
    }
  }

  protected override moveSpeed(): number { return this.reactive ? this.playSpeed : super.moveSpeed(); }

  protected override afterStep(h: number): void {
    if (this.episode === 'play' && this.auto && this.quitTime < 0) this.interest = Math.max(0, this.interest - WAND_PLAY.drainPerSecond * h);
  }

  override setAuto(on: boolean): void {
    if (!on) { this.toy = null; this.op = null; this.quitTime = -1; }
    super.setAuto(on);
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

  /** In play the cat looks at the landing it has picked, otherwise at the toy itself. */
  protected override fixationPoint(): { x: number; y: number } | null {
    if (this.episode !== 'play') return super.fixationPoint();
    // Lying, quitting, or pawing the toy under its feet: not looking out at any unit.
    if (this.held || !this.walker.present || this.phase === 'lie' || this.phase === 'capture' || this.quitTime >= 0) return null;
    return this.pending ?? this.toy;
  }

  override get pose(): CatPose {
    if (this.episode !== 'play' || this.held) return super.pose;
    // Waiting for a landing: crouched when stalking or about to rush, standing otherwise.
    if (this.pending) return this.phase !== 'walk' ? 'crouch' : 'stand';
    return (WAND_POSES as Record<string, CatPose>)[this.phase] ?? super.pose;
  }
}
