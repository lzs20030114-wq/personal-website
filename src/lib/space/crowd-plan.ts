/**
 * 项目二 · 几个人在场（Lab.15，2026-09-04 用户立项：「做一个 lab 模拟，比如人是可动的，也可以放多人，
 * 然后直接演示这些单元的变化」）——纯模型零 DOM。
 *
 * Lab.14 是一个人按预设走一遍、看结果；这台是**现场**：房间里放几个人（最多 MAX_PEOPLE），每个人可以
 * 被拖着走、可以站着、可以自己漫步，地面实时记痕迹，单元实时长出来。机制一个数不改——痕迹 / 衰减 /
 * 阈值 / 读法 / 棘轮全部引用 unit-activation（同一份 TraceField / Catchment / Activation / Walker），
 * 这里新增的只有「多个人」与「人怎么动」：
 *   - **拖**：指针按住一个人拖着走，位置直接给（不经步速），走过的地面照样记痕迹；
 *   - **自走**：演示用的随机漫步——随机挑场地里一个点走过去，到了随机站 2–30 s，再挑下一个。
 *     **这是演示装置不是行为规则**（作者的人类层规则取自 Hall / Goffman / Whyte，这里不代拟）；
 *     用带种子的随机数，同一种子逐位可复现（守门用）。
 * 几个人的影响圈重叠时，重叠处每秒记几份（强度语义：每个人各记满）⇒ 两个人站在一起，中间的单元
 * 比一个人时早一倍成形——「一群人」比「一个人」更快更大地改变空间，这是这台要演示的东西。
 */
import { RING } from './skin-ring';
import {
  Activation,
  PLAN,
  TraceField,
  Walker,
  buildCatchment,
  planLayout,
  unitInputs,
  type Catchment,
  type PlanLayout,
  type Reading,
} from './unit-activation';

export const CROWD = {
  /** 最多几个人（画面与算力都够；再多读不清谁是谁） */
  MAX_PEOPLE: 8,
  /**
   * 自走的步速（m/s）：室内慢走，不是街上的 1.2——用户看真机「移动得太快太远，不像人缓慢步行、停留」。
   * Lab.14 的五条预设仍用 PLAN.SPEED.def（那些是「穿行」这类行为，按街上的步速走）。
   */
  SPEED_DEF: 0.7,
  /** 自走：到点后站多久（s）——偏长，站着才是常态；均匀随机 */
  PAUSE: { min: 8, max: 45 },
  /** 自走：一次挪多远（m）——大多是 0.5–2 m 的小挪动，偶尔（LONG_HOP_P）走一趟远的 */
  HOP: { min: 0.5, max: 2.0, long: 3.5 },
  LONG_HOP_P: 0.2,
  /** 自走：目标点落在场地外扩这么多（m）的方框里——不贴墙、不出门 */
  WANDER_MARGIN: 0.4,
  /** 一开场放几个人、放哪儿（场地坐标按 pitch4 的倍数） */
  OPENING: [
    { x: -0.5, y: -0.5 },
    { x: 0.9, y: 0.6 },
  ] as readonly { x: number; y: number }[],
} as const;

/** mulberry32：一个种子一条可复现的序列 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type PersonMode = 'auto' | 'held' | 'manual';

export interface Person {
  id: number;
  walker: Walker;
  /** auto = 自走 · held = 被指针按着 · manual = 放着不动（站） */
  mode: PersonMode;
  /** 拖动时上一帧的位置（算走过的路程用） */
  lastX: number;
  lastY: number;
}

export interface CrowdSimOpts {
  grid?: number;
  reading?: Reading;
  reach?: number;
  threshold?: number;
  decay?: number;
  speed?: number;
  radius?: number;
  seed?: number;
  /** 一开场放不放人（默认放 CROWD.OPENING 两个） */
  opening?: boolean;
  /** 一开场是否自走（默认开） */
  auto?: boolean;
}

const MAX_SUB_DT = 0.05;

export class CrowdSim {
  readonly layout: PlanLayout;
  readonly field: TraceField;
  readonly act: Activation;
  catchment: Catchment;
  people: Person[] = [];
  decay: number;
  reach: number;
  speed: number;
  /** 全体是否自走（held 的人不受影响；manual 的人在开自走时转回 auto） */
  auto: boolean;
  t = 0;
  private nextId = 1;
  private readonly rng: () => number;
  private readonly inputsBuf: Float64Array;
  /** 自走目标与站定倒计时（按 person.id） */
  private readonly plans = new Map<number, { tx: number; ty: number; pause: number }>();

  constructor(opts: CrowdSimOpts = {}) {
    this.layout = planLayout(opts.grid ?? PLAN.GRID_DEF, opts.radius ?? RING.RADIUS_DEF);
    this.field = new TraceField(this.layout.roomM);
    this.act = new Activation(this.layout.units.length, opts.threshold ?? PLAN.THRESHOLD);
    this.catchment = buildCatchment(this.layout, this.field, opts.reading ?? 'nearest');
    this.decay = opts.decay ?? PLAN.DECAY;
    this.reach = opts.reach ?? PLAN.REACH.def;
    this.speed = opts.speed ?? CROWD.SPEED_DEF;
    this.auto = opts.auto ?? true;
    this.rng = makeRng(opts.seed ?? 20260904);
    this.inputsBuf = new Float64Array(this.layout.units.length);
    if (opts.opening ?? true) for (const o of CROWD.OPENING) this.add(o.x * this.layout.pitch4, o.y * this.layout.pitch4);
  }

  /** 放一个人；满了返回 null。位置钳进房间 */
  add(x: number, y: number): Person | null {
    if (this.people.length >= CROWD.MAX_PEOPLE) return null;
    const h = this.layout.roomM / 2 - PLAN.BODY_R;
    const w = new Walker(this.speed);
    w.place(Math.max(-h, Math.min(h, x)), Math.max(-h, Math.min(h, y)));
    const p: Person = { id: this.nextId++, walker: w, mode: this.auto ? 'auto' : 'manual', lastX: w.x, lastY: w.y };
    this.people.push(p);
    return p;
  }

  remove(id: number): void {
    this.people = this.people.filter((p) => p.id !== id);
    this.plans.delete(id);
  }

  /** 撤掉最后放的那个 */
  removeLast(): void {
    const p = this.people[this.people.length - 1];
    if (p) this.remove(p.id);
  }

  clearPeople(): void {
    this.people = [];
    this.plans.clear();
  }

  /** 痕迹与成形全清（人留着） */
  clearTraces(): void {
    this.field.clear();
    this.act.reset();
    this.t = 0;
  }

  /** 指针按住：位置直接给（之后每帧 drag 更新），松手 release */
  hold(id: number, x: number, y: number): void {
    const p = this.byId(id);
    if (!p) return;
    p.mode = 'held';
    this.plans.delete(id);
    this.drag(id, x, y);
  }

  drag(id: number, x: number, y: number): void {
    const p = this.byId(id);
    if (!p || p.mode !== 'held') return;
    const h = this.layout.roomM / 2 - PLAN.BODY_R;
    const nx = Math.max(-h, Math.min(h, x));
    const ny = Math.max(-h, Math.min(h, y));
    const dx = nx - p.walker.x;
    const dy = ny - p.walker.y;
    if (Math.hypot(dx, dy) > 1e-6) p.walker.heading = Math.atan2(dy, dx);
    p.walker.x = nx;
    p.walker.y = ny;
  }

  release(id: number): void {
    const p = this.byId(id);
    if (!p || p.mode !== 'held') return;
    p.mode = this.auto ? 'auto' : 'manual';
    p.walker.state = 'idle';
    this.plans.delete(id);
  }

  setAuto(on: boolean): void {
    this.auto = on;
    for (const p of this.people) {
      if (p.mode === 'held') continue;
      p.mode = on ? 'auto' : 'manual';
      if (!on) {
        p.walker.pushTarget({ x: p.walker.x, y: p.walker.y });
        p.walker.state = 'idle';
        this.plans.delete(p.id);
      }
    }
  }

  setReading(reading: Reading): void {
    this.catchment = buildCatchment(this.layout, this.field, reading);
    this.act.update(unitInputs(this.field, this.catchment, this.inputsBuf));
  }
  setReach(v: number): void {
    this.reach = v;
  }
  setThreshold(v: number): void {
    this.act.threshold = v;
    this.act.update(unitInputs(this.field, this.catchment, this.inputsBuf));
  }
  setDecay(v: number): void {
    this.decay = v;
  }
  setSpeed(v: number): void {
    this.speed = v;
    for (const p of this.people) p.walker.speed = v;
  }

  byId(id: number): Person | undefined {
    return this.people.find((p) => p.id === id);
  }

  /** 离 (x,y) 最近、且在 r 以内的人（指针命中用） */
  personAt(x: number, y: number, r: number = PLAN.BODY_R * 1.6): Person | null {
    let best: Person | null = null;
    let bd = r;
    for (const p of this.people) {
      const d = Math.hypot(p.walker.x - x, p.walker.y - y);
      if (d <= bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /**
   * 自走：放下先站一会儿，再挑一个**不远的**点走过去，到了又站一会儿。
   * 首版是随机挑场地里任意一点 + 站 2–30 s，人在房间里窜来窜去；改成小挪动 + 长停留，
   * 大部分时间是站着的（步速 0.7、挪 1 m 走 1.5 s、站 8–45 s ⇒ 九成时间在站）。
   * 仍是演示装置：挪多远、站多久都是均匀随机，不是作者的行为规则。
   */
  private wander(p: Person, dt: number): void {
    const w = p.walker;
    let plan = this.plans.get(p.id);
    if (!plan) {
      // 刚放下 / 刚开自走：先站一会儿（不是一放下就走）
      plan = { tx: w.x, ty: w.y, pause: this.pausePick() };
      this.plans.set(p.id, plan);
    }
    if (w.state === 'idle') {
      plan.pause -= dt;
      if (plan.pause <= 0) {
        const next = this.pickTarget(w.x, w.y);
        this.plans.set(p.id, next);
        w.pushTarget({ x: next.tx, y: next.ty });
      }
    }
  }

  private pausePick(): number {
    return CROWD.PAUSE.min + this.rng() * (CROWD.PAUSE.max - CROWD.PAUSE.min);
  }

  /** 从 (x,y) 出发挑下一个点：随机方向、随机短距（偶尔远一次），钳进场地外扩的方框 */
  private pickTarget(x: number, y: number): { tx: number; ty: number; pause: number } {
    const half = this.layout.fieldM / 2 + CROWD.WANDER_MARGIN;
    const ang = this.rng() * Math.PI * 2;
    const far = this.rng() < CROWD.LONG_HOP_P;
    const hop = far ? CROWD.HOP.max + this.rng() * (CROWD.HOP.long - CROWD.HOP.max) : CROWD.HOP.min + this.rng() * (CROWD.HOP.max - CROWD.HOP.min);
    return {
      tx: Math.max(-half, Math.min(half, x + Math.cos(ang) * hop)),
      ty: Math.max(-half, Math.min(half, y + Math.sin(ang) * hop)),
      pause: this.pausePick(),
    };
  }

  /** 推进 dt 秒：人动 + 记痕迹按子步，衰减与读数按整段一次 */
  step(dt: number): void {
    if (dt <= 0) return;
    let left = dt;
    while (left > 1e-12) {
      const sdt = Math.min(MAX_SUB_DT, left);
      left -= sdt;
      for (const p of this.people) {
        if (p.mode === 'auto') this.wander(p, sdt);
        if (p.mode !== 'held') p.walker.step(sdt);
        else {
          // 被拖着：路程按位置差记
          p.walker.distance += Math.hypot(p.walker.x - p.lastX, p.walker.y - p.lastY);
          p.walker.presentTime += sdt;
        }
        p.lastX = p.walker.x;
        p.lastY = p.walker.y;
        if (p.walker.present) this.field.imprint(p.walker.x, p.walker.y, this.reach, sdt);
      }
    }
    this.field.decay(dt, this.decay);
    this.act.update(unitInputs(this.field, this.catchment, this.inputsBuf));
    this.t += dt;
  }

  /** 几个人在动 / 站 */
  counts(): { people: number; walking: number; standing: number; held: number } {
    let walking = 0;
    let standing = 0;
    let held = 0;
    for (const p of this.people) {
      if (p.mode === 'held') held++;
      else if (p.walker.state === 'walk') walking++;
      else standing++;
    }
    return { people: this.people.length, walking, standing, held };
  }
}
