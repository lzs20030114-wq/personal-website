/**
 * 项目二 · 感知层画面的读数（Lab 2-17 台架用，纯逻辑零 DOM）。每一帧从仿真读人和猫的真实姿态，算出：
 *   方案 A：每个关键点被哪几台摄像头看见；两台以上 = 定得住（小误差），一台 = 只知道在那条视线上，没有 = 这一刻丢了；
 *   方案 B：每个身体一个标签点，量到几个固定点的距离，按能直视几个固定点给误差；读到的朝向是身体朝向。
 * 看得见与否每 0.1 s 判一次（与研究里的读数节奏相同），误差是一个慢慢变的偏移（不是逐帧乱跳），画面上读得出是「抖」而不是「闪」。
 * 遮挡、误差档、摄像头位置都取 cohabit-sense，与研究同一份。
 */
import { CAM, SENSE, SENSE_BODY, cameraLayout, furnitureScene, floorSurface, sceneOf, type Camera, type CamLayout, type OBox, type Scene } from './cohabit-sense';
import type { CohabitSim } from './cohabit';
import { TABLE_TOP, tableTopFor } from './cohabit-solid';
import { makeRng } from './crowd-plan';
import type { CatPose } from './figure';
import { catKeypoints, catTag, fixOf, personKeypoints, personTag, seenBy, tagRanges, PERSON_H, type Fix, type P3, type Seen } from './sense-view';

export type SenseView = 'camera' | 'tag';

export interface ObservedBody {
  kind: 'person' | 'cat';
  id: number;
  /** 画面上的名字：人 1 / 猫 1 */
  n: number;
  seated: boolean;
  onTop: boolean;
  /** 真实的关键点 */
  truth: P3[];
  /** 方案 A：估出来的关键点、每点定没定住、每点被哪几台看见 / 在框里却被挡 */
  est: P3[];
  fix: Fix[];
  seen: Seen;
  /** 一台看见的点：从那台摄像头指向它的单位向量（立体里画成沿视线的一小段） */
  ray: (P3 | null)[];
  /** 这一刻没看见的点，离上一次看见过了多久（s） */
  lostFor: number[];
  /** 方案 B：标签的真实位置、读到的位置、到各固定点的距离、是否直视、误差、读到的朝向 */
  tag: P3;
  tagEst: P3;
  ranges: number[];
  los: boolean[];
  sd: number;
  heading: number;
  headingEst: number;
}

/** 读数节奏与误差的慢偏移 */
export const OBSERVE = {
  /** 看见与否、标签距离多久判一次（s）：与研究里的 10 次/秒相同 */
  every: 0.1,
  /** 误差偏移的时间常数（s） */
  tau: 0.6,
  /** 两台以上看见的点的误差（米）：摄像头三角定位那一档 */
  triSd: SENSE.camera.multi,
  /** 一台看见：垂直视线方向的误差（沿视线的不确定画成一段，不加在点上） */
  raySd: SENSE.camera.ground,
  /** 没看见的点：丢了多久以内还画个淡影（s） */
  ghost: 1.5,
  /** 方案 B 读到的朝向：白噪声（与研究同一个数） */
  headingSd: SENSE.tag.headingSd,
} as const;

const PERSON_STRIDE = 0.82 * PERSON_H;

export class SenseObserver {
  bodies: ObservedBody[] = [];
  scene: Scene = { cyls: [], boxes: [] };
  cams: Camera[];
  readonly anchors: Camera[];
  private furn: OBox[] | null = null;
  private furnKey: unknown = null;
  private acc = Infinity;
  private readonly rng: () => number;
  /** 每个身体每个点的误差偏移（与关键点同序）+ 标签偏移 */
  private noise = new Map<string, { kp: P3[]; tag: P3; head: number }>();

  constructor(roomM: number, layout: CamLayout = 'corners4', seed = 20261119) {
    this.cams = cameraLayout(layout, roomM);
    this.anchors = cameraLayout('corners4', roomM);
    this.rng = makeRng(seed);
  }

  setLayout(layout: CamLayout, roomM: number): void {
    this.cams = cameraLayout(layout, roomM);
    this.acc = Infinity;
  }

  private gauss(): number {
    const u = Math.max(1e-12, this.rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rng());
  }

  /** 读一帧：真实姿态每帧更新；看得见与否、标签距离每 OBSERVE.every 秒判一次 */
  update(sim: CohabitSim, dt: number): void {
    if (this.furnKey !== sim.furn) {
      this.furn = furnitureScene(sim);
      this.furnKey = sim.furn;
    }
    const furn = this.furn!;
    const L = sim.layout;
    const rects = sim.furn?.rects ?? [];
    const topOf = (u: number) => {
      const f = sim.tableBy[u];
      return f >= 0 && rects[f] ? tableTopFor(rects[f]) : TABLE_TOP.stand;
    };
    // 真实姿态
    const next: ObservedBody[] = [];
    let pn = 0;
    for (const p of sim.people) {
      const w = p.walker;
      if (!w.present) continue;
      pn++;
      const walking = !p.seated && w.state === 'walk';
      const truth = personKeypoints({ x: w.x, y: w.y, heading: w.heading, gaze: w.gaze, pose: p.seated ? 'sit' : walking ? 'walk' : 'stand', phase: walking ? (w.distance / PERSON_STRIDE) % 1 : 0 });
      next.push(this.carry('person', p.id, pn, p.seated, false, truth, personTag({ x: w.x, y: w.y, heading: w.heading, seated: p.seated }), w.heading));
    }
    let cn = 0;
    for (const c of sim.cats) {
      const w = c.walker;
      if (!w.present) continue;
      cn++;
      let x = w.x;
      let y = w.y;
      let base = 0;
      if (c.unit) {
        // 台上的猫在立体里绕着芯坐：平面模型给台心，按朝向挪到芯外
        const r = L.mastR + SENSE_BODY.catR;
        if (Math.hypot(x - c.unit.x, y - c.unit.y) < r) {
          x = c.unit.x + Math.cos(w.heading) * r;
          y = c.unit.y + Math.sin(w.heading) * r;
        }
        base = topOf(c.unit.i);
      } else base = floorSurface(furn, x, y);
      const pose: CatPose = w.state === 'walk' ? 'walk' : c.state === 'lie' ? 'lie' : c.state === 'walk' ? 'walk' : 'sit';
      const truth = catKeypoints({ x, y, heading: w.heading, base, pose, phase: pose === 'walk' ? (w.distance / 0.2) % 1 : 0 });
      next.push(this.carry('cat', c.id, cn, false, !!c.unit, truth, catTag({ x, y, base }), w.heading));
    }
    this.bodies = next;

    // 慢偏移
    const a = Math.exp(-dt / OBSERVE.tau);
    const k = Math.sqrt(Math.max(0, 1 - a * a));
    this.acc += dt;
    const judge = this.acc >= OBSERVE.every;
    if (judge) {
      this.acc = 0;
      this.scene = sceneOf(sim, furn);
    }
    for (const b of this.bodies) {
      const key = `${b.kind}:${b.id}`;
      let nz = this.noise.get(key);
      if (!nz || nz.kp.length !== b.truth.length) {
        nz = { kp: b.truth.map(() => ({ x: 0, y: 0, z: 0 })), tag: { x: 0, y: 0, z: 0 }, head: 0 };
        this.noise.set(key, nz);
      }
      for (const o of nz.kp) {
        o.x = o.x * a + k * this.gauss();
        o.y = o.y * a + k * this.gauss();
        o.z = o.z * a + k * this.gauss();
      }
      nz.tag.x = nz.tag.x * a + k * this.gauss();
      nz.tag.y = nz.tag.y * a + k * this.gauss();
      nz.head = nz.head * a + k * this.gauss();
      if (judge) {
        const owner = b.kind === 'person' ? b.id : -1;
        b.seen = seenBy(this.scene, this.cams, b.truth, owner, b.kind === 'person' ? { nose: 1, head: 0, gaze: this.gazeOf(sim, b.id), half: CAM.FACE } : undefined);
        const tr = tagRanges(this.scene, this.anchors, b.tag);
        b.ranges = tr.ranges;
        b.los = tr.los;
        b.sd = tr.sd;
      }
      // 估计值
      b.fix = b.seen.by.map((v) => fixOf(v.length));
      b.est = b.truth.map((p, i) => {
        const f = b.fix[i];
        const sd = f === 'tri' ? OBSERVE.triSd : OBSERVE.raySd;
        const o = nz!.kp[i];
        return { x: p.x + o.x * sd, y: p.y + o.y * sd, z: p.z + o.z * sd };
      });
      b.ray = b.truth.map((p, i) => {
        if (b.fix[i] !== 'ray') return null;
        const c = this.cams[b.seen.by[i][0]];
        const d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) || 1;
        return { x: (p.x - c.x) / d, y: (p.y - c.y) / d, z: (p.z - c.z) / d };
      });
      b.lostFor = b.lostFor.map((t, i) => (b.fix[i] === 'none' ? t + dt : 0));
      b.tagEst = { x: b.tag.x + nz.tag.x * b.sd, y: b.tag.y + nz.tag.y * b.sd, z: b.tag.z };
      b.headingEst = b.heading + nz.head * OBSERVE.headingSd;
    }
  }

  private gazeOf(sim: CohabitSim, id: number): number {
    const p = sim.people.find((q) => q.id === id);
    return p ? p.walker.gaze : 0;
  }

  /** 新的一帧沿用上一帧的读数（看得见与否只在判的那一刻换） */
  private carry(kind: 'person' | 'cat', id: number, n: number, seated: boolean, onTop: boolean, truth: P3[], tag: P3, heading: number): ObservedBody {
    const prev = this.bodies.find((b) => b.kind === kind && b.id === id);
    const empty: Seen = { by: truth.map(() => []), blocked: truth.map(() => []) };
    return {
      kind,
      id,
      n,
      seated,
      onTop,
      truth,
      est: prev?.est ?? truth,
      fix: prev?.fix ?? truth.map(() => 'none' as Fix),
      seen: prev && prev.seen.by.length === truth.length ? prev.seen : empty,
      ray: prev?.ray ?? truth.map(() => null),
      lostFor: prev && prev.lostFor.length === truth.length ? prev.lostFor : truth.map(() => 0),
      tag,
      tagEst: prev?.tagEst ?? tag,
      ranges: prev?.ranges ?? this.anchors.map(() => 0),
      los: prev?.los ?? this.anchors.map(() => true),
      sd: prev?.sd ?? SENSE.tag.los3,
      heading,
      headingEst: prev?.headingEst ?? heading,
    };
  }

  /** HUD：站着 / 走着的人的关键点定得住的比例、至少一台看见的猫、能直视三个以上固定点的身体 */
  stats(): { standTri: number; standKp: number; catsSeen: number; cats: number; losOk: number; bodies: number } {
    let standTri = 0;
    let standKp = 0;
    let catsSeen = 0;
    let cats = 0;
    let losOk = 0;
    for (const b of this.bodies) {
      if (b.kind === 'person' && !b.seated) {
        standKp += b.fix.length;
        standTri += b.fix.filter((f) => f === 'tri').length;
      }
      if (b.kind === 'cat') {
        cats++;
        if (b.fix.some((f) => f !== 'none')) catsSeen++;
      }
      if (b.los.filter(Boolean).length >= 3) losOk++;
    }
    return { standTri, standKp, catsSeen, cats, losOk, bodies: this.bodies.length };
  }
}

