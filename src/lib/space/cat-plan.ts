import { PlanSim, aisleLines, nearestCrossing, seededRng, type PlanSimOpts, type Waypoint } from './unit-activation';

/** Categories informed by the project research; all timing/geometry below is a demo choice. */
export const CAT_BEHAVIOURS = [
  { key: 'pass', zh: '通行', en: 'Pass through' },
  { key: 'rest', zh: '停留观察', en: 'Pause & watch' },
  { key: 'play', zh: '玩耍', en: 'Play' },
  { key: 'free', zh: '自由', en: 'Free' },
] as const;
export type CatBehaviour = typeof CAT_BEHAVIOURS[number]['key'];
type Episode = Exclude<CatBehaviour, 'free'>;
export const CAT = { bodyR: 0.14, reach: 1.1, clearance: 0.08, speed: 0.55, seed: 20261003 } as const;
interface Leg { point: Waypoint; speed: number; }

/** Cat-specific scheduling around the shared floor/activation simulation. No second trace engine. */
export class CatPlanSim extends PlanSim {
  behaviour: CatBehaviour = 'free';
  episode: Episode = 'rest';
  auto = true;
  pace = 1;
  toy: { x: number; y: number } | null = null;
  private legs: Leg[] = [];
  private random = seededRng(CAT.seed);
  private legSpeed: number = CAT.speed;

  constructor(opts: PlanSimOpts & { behaviour?: CatBehaviour } = {}) {
    super({ path: 'free', reach: CAT.reach, threshold: 2, fade: 6, mode: 'follow', fill: 0.5,
      clearance: CAT.clearance, look: true, ...opts, bodyR: CAT.bodyR, fov: Math.PI * 2, lane: false });
    this.replay(opts.behaviour ?? 'free');
  }

  replay(behaviour = this.behaviour): void {
    super.reset();
    this.behaviour = behaviour;
    this.auto = true;
    this.random = seededRng(CAT.seed);
    const a = aisleLines(this.layout);
    this.walker.place(a.x[0], a.y[Math.floor(a.y.length / 2)]);
    this.trail.splice(0, this.trail.length, this.walker.x, this.walker.y);
    this.legs = [];
    this.begin(behaviour === 'free' ? 'pass' : behaviour);
  }

  private add(x: number, y: number, dwell = 0, speed = CAT.speed as number): void {
    // Orthogonal aisle waypoints avoid the unit cores at every grid density.
    const end = nearestCrossing(this.layout, x, y);
    if (!this.legs.length) this.rejoinAisle(speed);
    const from = this.legs[this.legs.length - 1]?.point ?? this.walker;
    this.legs.push({ point: { x: end.x, y: from.y }, speed }, { point: { ...end, dwell }, speed });
  }

  private rejoinAisle(speed: number): void {
    const w = this.walker, c = nearestCrossing(this.layout, w.x, w.y);
    const first = Math.abs(c.x - w.x) < Math.abs(c.y - w.y) ? { x: c.x, y: w.y } : { x: w.x, y: c.y };
    this.legs.push({ point: first, speed }, { point: c, speed });
  }

  private begin(episode: Episode): void {
    this.episode = episode;
    this.toy = null;
    const a = aisleLines(this.layout);
    const centre = this.behaviour === 'free'
      ? { x: a.x[Math.floor(this.random() * a.x.length)], y: a.y[Math.floor(this.random() * a.y.length)] }
      : nearestCrossing(this.layout, 0, 0);
    const far = a.x[a.x.length - 1];
    if (episode === 'pass') {
      const target = this.behaviour === 'free' ? centre.x : this.walker.x < 0 ? far : a.x[0];
      this.add(target, centre.y, 3);
    } else if (episode === 'rest') {
      this.add(centre.x, centre.y, 14);
    } else {
      const centreIndex = a.x.indexOf(centre.x);
      const next = a.x[centreIndex === a.x.length - 1 ? centreIndex - 1 : centreIndex + 1];
      this.toy = { x: next, y: centre.y };
      this.add(centre.x, centre.y, 2, 0.35);
      for (let i = 0; i < 3; i++) {
        this.add(next, centre.y, 0.8, 1.15);
        this.add(centre.x, centre.y, 1.5, 0.65);
      }
      this.add(centre.x, centre.y, 5);
    }
  }

  setAuto(on: boolean): void {
    this.auto = on;
    if (!on) {
      this.walker.place(this.walker.x, this.walker.y);
      this.legs = [];
      this.toy = null;
    }
  }

  override hold(x: number, y: number): void {
    this.behaviour = 'free';
    this.setAuto(false);
    super.hold(x, y);
  }

  override drag(x: number, y: number): void {
    // Snap only out of solid cores; the pointer can otherwise place the cat anywhere.
    let nx = x, ny = y;
    for (const u of this.layout.units) {
      const r = this.layout.mastR + this.bodyR;
      const d = Math.hypot(nx - u.x, ny - u.y);
      if (d < r) {
        const angle = d < 1e-9 ? 0 : Math.atan2(ny - u.y, nx - u.x);
        nx = u.x + Math.cos(angle) * r;
        ny = u.y + Math.sin(angle) * r;
      }
    }
    super.drag(nx, ny);
  }

  override pointerTarget(x: number, y: number): void {
    this.behaviour = 'free';
    this.setAuto(false);
    this.episode = 'pass';
    // First reach the closest aisle via its nearer axis after a manual drag.
    this.add(x, y, 0);
  }

  clearTraces(): void { this.field.clear(); this.act.reset(); this.trail.length = 0; }

  get state(): 'held' | 'walk' | 'watch' | 'chase' | 'rest' {
    if (this.held) return 'held';
    if (this.walker.state === 'walk') return this.episode === 'play' ? 'chase' : 'walk';
    return this.episode === 'play' ? 'watch' : 'rest';
  }

  override step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let left = Math.min(dt, 1);
    while (left > 1e-9) {
      const h = Math.min(left, 1 / 60);
      left -= h;
      if (!this.held && this.walker.state === 'idle') {
        if (!this.legs.length && this.auto) {
          const r = this.random();
          const next = this.behaviour === 'free' ? (r < 0.4 ? 'rest' : r < 0.7 ? 'pass' : 'play') : this.behaviour;
          this.begin(next);
        }
        const leg = this.legs.shift();
        if (leg) {
          this.legSpeed = leg.speed;
          this.walker.pushTarget(leg.point);
        }
      }
      this.walker.speed = this.legSpeed * this.pace;
      super.step(h);
      // A free session has bounded drawing history.
      if (this.trail.length > 1600) this.trail.splice(0, this.trail.length - 1600);
    }
  }
}
