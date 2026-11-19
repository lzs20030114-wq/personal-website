/**
 * 项目二 · 感知层画面的读数（Lab 2-17 台架用，纯逻辑零 DOM）。每一帧从仿真读人和猫的真实姿态，再按传感器真的会给出的东西解回来：
 *   方案 A · 普通摄像头：每台看见的关键点给一条视线（带检测误差），两台以上求最近点定住，一台只知道在那条线上；
 *   方案 A · 深度相机：每台再给一个深度；两台以上看见仍按视线交点（角度比测距准），只有一台看见时用它量到的远近定住
 *   （超出测距退回成视线）；
 *   两种摄像头都从解出的关键点读人在做什么（站 / 走 / 坐、前倾、看着哪只猫）、猫在做什么（走 / 坐 / 趴、在哪个面上），
 *   并与仿真里的真实情况对照；
 *   方案 B：每个身体一个标签，量到四个固定点的距离（隔着身体读长），最小二乘解出位置与高度，四段对不上就标出来；
 *   人的标签另读身体朝向，按高度读坐 / 站、按速度读走。
 * 看得见与否每 0.1 s 判一次（与研究里的读数节奏相同）；误差是慢慢变的偏移，画面上读得出是「抖」而不是「闪」。
 * 遮挡、摄像头位置、标签高度都取 cohabit-sense，解算与读动作在 sense-solve。
 */
import { CAM, SENSE, SENSE_BODY, cameraLayout, furnitureScene, floorSurface, sceneOf, type Camera, type CamLayout, type OBox, type Scene } from './cohabit-sense';
import { COHABIT, type CohabitSim } from './cohabit';
import { TABLE_TOP, tableTopFor } from './cohabit-solid';
import { makeRng } from './crowd-plan';
import type { CatPose } from './figure';
import { alongRay, closestOnRay, rayTo, readCat, readPerson, SOLVE, SpeedWindow, triangulate, trilaterate, type CatPostureRead, type Posture, type Ray } from './sense-solve';
import { catKeypoints, catTag, DEPTH, depthCams, personKeypoints, personTag, seenBy, tagRanges, PERSON_H, TAG_NLOS_BIAS, type P3, type Seen } from './sense-view';

export type SenseView = 'camera' | 'tag';
export type CamKind = 'rgb' | 'depth';
/** 一个关键点在立体里定到什么程度：两台以上交出来 / 深度相机量到 / 只有一条视线 / 这一刻没有 */
export type PointFix = 'tri' | 'depth' | 'ray' | 'none';
export type Place = 'floor' | 'furniture' | 'unit' | 'unknown';

/** 读到的（或真实的）在做什么 */
export interface Doing {
  posture: Posture | CatPostureRead;
  /** 人：看着哪只猫；猫：null */
  watching: number | null;
  lean: boolean;
  /** 猫：在哪个面上 */
  place: Place;
}

export interface ObservedBody {
  kind: 'person' | 'cat';
  id: number;
  /** 画面上的名字：人 1 / 猫 1 */
  n: number;
  seated: boolean;
  onTop: boolean;
  /** 真实的关键点 */
  truth: P3[];
  /** 方案 A：解出来的关键点、每点定到什么程度、每点被哪几台看见 / 在框里却被挡 */
  est: P3[];
  fix: PointFix[];
  seen: Seen;
  /** 只有一条视线的点：那条视线（立体里画成沿视线的一小段） */
  ray: (Ray | null)[];
  /** 这一刻没解出来的点，离上一次解出来过了多久（s） */
  lostFor: number[];
  /** 读到的在做什么、真实的、两者对不对得上（null = 读不出） */
  read: Doing;
  real: Doing;
  readOk: boolean | null;
  /** 读到的视线从哪来：看得见脸 / 只看得见肩 */
  gazeFrom: 'face' | 'body' | null;
  gazeRead: number | null;
  /** 一直看着同一只猫多久了（s，读数） */
  watchFor: number;
  /** 方案 B：标签的真实位置、解出的位置、量到的距离、是否直视、残差、四段对不对得上 */
  tag: P3;
  tagEst: P3;
  ranges: number[];
  los: boolean[];
  resid: number[];
  consistent: boolean;
  /** 方案 B 按高度与速度读的坐 / 站 / 走，与真实对照 */
  tagRead: Doing;
  tagOk: boolean | null;
  /** 方案 B：只看解出的高度会读成坐（与座位压力对照用） */
  tagHeightSit: boolean;
  heading: number;
  headingEst: number;
}

/** 读数节奏与误差的慢偏移 */
export const OBSERVE = {
  /** 看得见与否多久判一次（s）：与研究里的 10 次/秒相同 */
  every: 0.1,
  /** 误差偏移的时间常数（s） */
  tau: 0.6,
  /** 没解出来的点：丢了多久以内还画个淡影（s） */
  ghost: 1.5,
  /** 方案 B 读到的身体朝向：白噪声（与研究同一个数） */
  headingSd: SENSE.tag.headingSd,
} as const;

const PERSON_STRIDE = 0.82 * PERSON_H;
const MAX_CAMS = 8;
const WATCH = { d: COHABIT.GAZE_D, half: COHABIT.GAZE_HALF.person };
const DEG = Math.PI / 180;
/** 方案 B 按标签高度分坐 / 站（胸口 1.3 / 坐着 1.0 的中间） */
const TAG_SIT_Z = (SENSE.tag.chest + SENSE.tag.seatChest) / 2;

interface Noise {
  /** 每个关键点 × 每台摄像头：画面横 / 纵两个角度偏差、深度偏差（都是单位方差的慢偏移，用时再乘误差） */
  ang: Float64Array;
  dep: Float64Array;
  range: Float64Array;
  head: number;
  face: number;
}

interface Track {
  speed: SpeedWindow;
  walk: boolean;
  gaze: number | null;
  watching: number | null;
  watchFor: number;
  tagSpeed: SpeedWindow;
  tagWalk: boolean;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a: P3, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export class SenseObserver {
  bodies: ObservedBody[] = [];
  scene: Scene = { cyls: [], boxes: [] };
  cams: Camera[];
  kind: CamKind = 'rgb';
  readonly anchors: Camera[];
  private layoutKey: CamLayout;
  private roomM: number;
  private furn: OBox[] | null = null;
  private furnKey: unknown = null;
  private acc = Infinity;
  private time = 0;
  private readonly rng: () => number;
  private noise = new Map<string, Noise>();
  private tracks = new Map<string, Track>();

  constructor(roomM: number, layout: CamLayout = 'corners4', seed = 20261119, kind: CamKind = 'rgb') {
    this.roomM = roomM;
    this.layoutKey = layout;
    this.kind = kind;
    this.cams = this.buildCams();
    this.anchors = cameraLayout('corners4', roomM);
    this.rng = makeRng(seed);
  }

  private buildCams(): Camera[] {
    const c = cameraLayout(this.layoutKey, this.roomM);
    return this.kind === 'depth' ? depthCams(c) : c;
  }

  setLayout(layout: CamLayout, roomM: number = this.roomM): void {
    this.layoutKey = layout;
    this.roomM = roomM;
    this.cams = this.buildCams();
    this.acc = Infinity;
  }

  setKind(kind: CamKind): void {
    this.kind = kind;
    this.cams = this.buildCams();
    this.acc = Infinity;
  }

  private gauss(): number {
    const u = Math.max(1e-12, this.rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rng());
  }

  /** 读一帧：真实姿态与解算每帧更新；看得见与否每 OBSERVE.every 秒判一次 */
  update(sim: CohabitSim, dt: number): void {
    this.time += dt;
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
      const lean = p.seated && p.watching !== null && !p.ignores;
      const truth = personKeypoints({ x: w.x, y: w.y, heading: w.heading, gaze: w.gaze, pose: p.seated ? 'sit' : walking ? 'walk' : 'stand', phase: walking ? (w.distance / PERSON_STRIDE) % 1 : 0, lean });
      const b = this.carry('person', p.id, pn, p.seated, false, truth, personTag({ x: w.x, y: w.y, heading: w.heading, seated: p.seated }), w.heading);
      b.real = { posture: p.seated ? 'sit' : walking ? 'walk' : 'stand', watching: null, lean, place: 'floor' };
      next.push(b);
    }
    let cn = 0;
    for (const c of sim.cats) {
      const w = c.walker;
      if (!w.present) continue;
      cn++;
      let x = w.x;
      let y = w.y;
      let base = 0;
      let place: Place = 'floor';
      if (c.unit) {
        // 台上的猫在立体里绕着芯坐：平面模型给台心，按朝向挪到芯外
        const r = L.mastR + SENSE_BODY.catR;
        if (Math.hypot(x - c.unit.x, y - c.unit.y) < r) {
          x = c.unit.x + Math.cos(w.heading) * r;
          y = c.unit.y + Math.sin(w.heading) * r;
        }
        base = topOf(c.unit.i);
        place = 'unit';
      } else {
        base = floorSurface(furn, x, y);
        place = base > 0.05 ? 'furniture' : 'floor';
      }
      const pose: CatPose = w.state === 'walk' ? 'walk' : c.state === 'lie' ? 'lie' : c.state === 'walk' ? 'walk' : 'sit';
      const truth = catKeypoints({ x, y, heading: w.heading, base, pose, phase: pose === 'walk' ? (w.distance / 0.2) % 1 : 0 });
      const b = this.carry('cat', c.id, cn, false, !!c.unit, truth, catTag({ x, y, base }), w.heading);
      b.real = { posture: pose === 'walk' ? 'walk' : pose === 'lie' ? 'lie' : 'sit', watching: null, lean: false, place };
      next.push(b);
    }
    // 人真实在看哪只猫：与读数同一个判据（3 m 以内、视线 ±25°、不在走），用真实的视线与猫的真实位置
    const catTruth = next.filter((b) => b.kind === 'cat').map((b) => ({ id: b.id, x: b.truth[2].x, y: b.truth[2].y }));
    for (const b of next) {
      if (b.kind !== 'person' || b.real.posture === 'walk') continue;
      const p = sim.people.find((q) => q.id === b.id)!;
      b.real.watching = pickCat(b.truth[0], p.walker.gaze, catTruth);
    }
    this.bodies = next;

    // 慢偏移
    const a = Math.exp(-dt / OBSERVE.tau);
    const k = Math.sqrt(Math.max(0, 1 - a * a));
    const ou = (v: number) => v * a + k * this.gauss();
    this.acc += dt;
    const judge = this.acc >= OBSERVE.every;
    if (judge) {
      this.acc = 0;
      this.scene = sceneOf(sim, furn);
    }
    const catsRead: { id: number; x: number; y: number }[] = [];
    // 先解猫（人读「看着哪只猫」要用读到的猫的位置）
    const order = [...this.bodies.filter((b) => b.kind === 'cat'), ...this.bodies.filter((b) => b.kind === 'person')];
    for (const b of order) {
      const key = `${b.kind}:${b.id}`;
      const nkp = b.truth.length;
      let nz = this.noise.get(key);
      if (!nz || nz.ang.length !== nkp * MAX_CAMS * 2) {
        nz = { ang: new Float64Array(nkp * MAX_CAMS * 2), dep: new Float64Array(nkp * MAX_CAMS), range: new Float64Array(4), head: 0, face: 0 };
        this.noise.set(key, nz);
      }
      for (let i = 0; i < nz.ang.length; i++) nz.ang[i] = ou(nz.ang[i]);
      for (let i = 0; i < nz.dep.length; i++) nz.dep[i] = ou(nz.dep[i]);
      for (let i = 0; i < 4; i++) nz.range[i] = ou(nz.range[i]);
      nz.head = ou(nz.head);
      nz.face = ou(nz.face);
      let tr = this.tracks.get(key);
      if (!tr) {
        tr = { speed: new SpeedWindow(), walk: false, gaze: null, watching: null, watchFor: 0, tagSpeed: new SpeedWindow(), tagWalk: false };
        this.tracks.set(key, tr);
      }
      if (judge) {
        const owner = b.kind === 'person' ? b.id : -1;
        const p = b.kind === 'person' ? sim.people.find((q) => q.id === b.id) : null;
        b.seen = seenBy(this.scene, this.cams, b.truth, owner, p ? { nose: 1, head: 0, gaze: p.walker.gaze, half: CAM.FACE } : undefined);
        const t = tagRanges(this.scene, this.anchors, b.tag);
        b.los = t.los;
      }
      this.solveCamera(b, nz, dt);
      this.readCamera(b, tr, nz, sim, catsRead, dt);
      if (b.kind === 'cat') {
        const ok = b.fix[2] !== 'none' || b.lostFor[2] < OBSERVE.ghost;
        if (ok) catsRead.push({ id: b.id, x: b.est[2].x, y: b.est[2].y });
      }
      this.solveTag(b, nz, tr);
    }
  }

  /** 方案 A：每个关键点按看见它的几台摄像头解出立体位置 */
  private solveCamera(b: ObservedBody, nz: Noise, dt: number): void {
    const prior = b.est;
    const est: P3[] = [];
    const fix: PointFix[] = [];
    const rays: (Ray | null)[] = [];
    b.truth.forEach((p, kp) => {
      const by = b.seen.by[kp] ?? [];
      const rs = by.map((ci) => rayTo(this.cams[ci], p, nz.ang[(kp * MAX_CAMS + ci) * 2] * SOLVE.rayAng, nz.ang[(kp * MAX_CAMS + ci) * 2 + 1] * SOLVE.rayAng));
      // 深度相机：两台以上看见仍按视线交点（角度比测距准），只有一台看见时才用它量到的远近
      if (this.kind === 'depth' && rs.length < 2) {
        const pts: P3[] = [];
        by.forEach((ci, j) => {
          const d = dist(p, this.cams[ci]);
          if (d < DEPTH.near || d > DEPTH.far) return;
          pts.push(alongRay(rs[j], d + nz.dep[kp * MAX_CAMS + ci] * (DEPTH.sd0 + DEPTH.sdK * d)));
        });
        if (pts.length) {
          est.push({ x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length, z: pts.reduce((s, q) => s + q.z, 0) / pts.length });
          fix.push('depth');
          rays.push(null);
          return;
        }
      }
      const tri = rs.length >= 2 ? triangulate(rs) : null;
      if (tri) {
        est.push(tri);
        fix.push('tri');
        rays.push(null);
      } else if (rs.length >= 1) {
        // 一条视线：按上一刻的位置（跟踪的预测）落在线上
        est.push(closestOnRay(rs[0], prior[kp] ?? p));
        fix.push('ray');
        rays.push(rs[0]);
      } else {
        est.push(prior[kp] ?? p);
        fix.push('none');
        rays.push(null);
      }
    });
    b.est = est;
    b.fix = fix;
    b.ray = rays;
    b.lostFor = b.lostFor.map((t, i) => (fix[i] === 'none' ? t + dt : 0));
  }

  /** 方案 A：从解出来的关键点读在做什么，与真实对照 */
  private readCamera(b: ObservedBody, tr: Track, nz: Noise, sim: CohabitSim, cats: { id: number; x: number; y: number }[], dt: number): void {
    const ok = b.fix.map((f) => f === 'tri' || f === 'depth');
    // 速度：躯干上定住的那几个点的平均
    const core = b.kind === 'person' ? [2, 3, 6, 9, 12] : [1, 2, 3];
    const pts = core.filter((i) => ok[i]).map((i) => b.est[i]);
    let speed = 0;
    if (pts.length) speed = tr.speed.push(this.time, pts.reduce((s, q) => s + q.x, 0) / pts.length, pts.reduce((s, q) => s + q.y, 0) / pts.length);
    if (b.kind === 'person') {
      const p = sim.people.find((q) => q.id === b.id)!;
      const faceSeen = (b.seen.by[1] ?? []).length > 0;
      const face = faceSeen ? p.walker.gaze + nz.face * SOLVE.faceSd * DEG : null;
      const moveDir = speed > SOLVE.still ? tr.speed.dir : null;
      const r = readPerson(b.est, ok, speed, { face, prev: tr.gaze, moveDir }, cats, tr.walk, WATCH);
      tr.walk = r.posture === 'walk';
      if (r.gaze !== null) tr.gaze = r.gaze;
      if (r.watching !== null && r.watching === tr.watching) tr.watchFor += dt;
      else tr.watchFor = r.watching !== null ? dt : 0;
      tr.watching = r.watching;
      b.read = { posture: r.posture, watching: r.watching, lean: r.lean, place: 'floor' };
      b.gazeFrom = r.gazeFrom;
      b.gazeRead = r.gaze;
      b.watchFor = tr.watchFor;
      b.readOk = r.posture === 'unknown' ? null : r.posture === b.real.posture && r.watching === b.real.watching;
    } else {
      const at = [2, 1, 3, 0].find((k) => ok[k]);
      const surf = at === undefined ? null : this.surfaceAt(sim, b.est[at], b.est[at].z - 0.17);
      const r = readCat(b.est, ok, speed, tr.walk, surf?.z);
      tr.walk = r.posture === 'walk';
      const place: Place = surf ? surf.place : 'unknown';
      b.read = { posture: r.posture, watching: null, lean: false, place };
      // 猫站着与走着在台上分不太开：真实「走」读成「站」不算错
      const postureOk = r.posture === b.real.posture || (b.real.posture === 'walk' && r.posture === 'stand');
      b.readOk = r.posture === 'unknown' || place === 'unknown' ? null : postureOk && place === b.real.place;
    }
  }

  /**
   * 猫站的面：读到的平面位置上能站的面有地面（或家具顶面，高度已知）与成形单元的台面（高度按单元此刻的状态），
   * 取离读到的高度（背的高度减去背离脚的那一截）最近的那个。
   */
  private surfaceAt(sim: CohabitSim, p: P3, zGuess: number): { z: number; place: Place } {
    const ground = floorSurface(this.furn ?? [], p.x, p.y);
    const cands: { z: number; place: Place }[] = [{ z: ground, place: ground > 0.05 ? 'furniture' : 'floor' }];
    const L = sim.layout;
    const R = (L.reachMax ?? L.platR) * 1.1;
    const rects = sim.furn?.rects ?? [];
    for (const u of L.units) {
      if (sim.act.degree[u.i] < 0.5 || Math.hypot(p.x - u.x, p.y - u.y) > R) continue;
      const f = sim.tableBy[u.i];
      cands.push({ z: f >= 0 && rects[f] ? tableTopFor(rects[f]) : TABLE_TOP.stand, place: 'unit' });
    }
    let best = cands[0];
    for (const c of cands) if (Math.abs(c.z - zGuess) < Math.abs(best.z - zGuess)) best = c;
    return best;
  }

  /** 方案 B：量四段距离、解位置；按高度与速度读坐 / 站 / 走 */
  private solveTag(b: ObservedBody, nz: Noise, tr: Track): void {
    const anchors = this.anchors.map((c) => ({ x: c.x, y: c.y, z: c.z }));
    b.ranges = anchors.map((a, i) => dist(b.tag, a) + (b.los[i] ? 0 : TAG_NLOS_BIAS) + nz.range[i] * SOLVE.rangeSd);
    const f = trilaterate(anchors, b.ranges, b.tagEst);
    b.tagEst = f.p;
    b.resid = f.resid;
    b.consistent = f.consistent;
    b.headingEst = b.heading + nz.head * OBSERVE.headingSd;
    const speed = tr.tagSpeed.push(this.time, f.p.x, f.p.y);
    const walk = speed > (tr.tagWalk ? SOLVE.still : SOLVE.walk);
    tr.tagWalk = walk;
    if (b.kind === 'person') {
      // 坐着由座位压力读（方案 B 本来就带座位压力片）；解出的高度只差 0.3 m，单靠它分坐站不稳
      const posture: Posture = b.seated ? 'sit' : walk ? 'walk' : 'stand';
      b.tagRead = { posture, watching: null, lean: false, place: 'floor' };
      b.tagOk = posture === b.real.posture;
      b.tagHeightSit = f.p.z < TAG_SIT_Z;
    } else {
      // 在哪一台上由单元称重读；不在台上时按项圈的高度分地上和家具上
      const base = f.p.z - SENSE.tag.collar;
      const place: Place = b.onTop ? 'unit' : base < 0.2 ? 'floor' : 'furniture';
      b.tagRead = { posture: walk ? 'walk' : 'unknown', watching: null, lean: false, place };
      b.tagOk = place === b.real.place;
    }
  }

  /** 新的一帧沿用上一帧的读数（看得见与否只在判的那一刻换） */
  private carry(kind: 'person' | 'cat', id: number, n: number, seated: boolean, onTop: boolean, truth: P3[], tag: P3, heading: number): ObservedBody {
    const prev = this.bodies.find((b) => b.kind === kind && b.id === id);
    const empty: Seen = { by: truth.map(() => []), blocked: truth.map(() => []) };
    const none: Doing = { posture: 'unknown', watching: null, lean: false, place: 'unknown' };
    return {
      kind,
      id,
      n,
      seated,
      onTop,
      truth,
      est: prev && prev.est.length === truth.length ? prev.est : truth,
      fix: prev?.fix ?? truth.map(() => 'none' as PointFix),
      seen: prev && prev.seen.by.length === truth.length ? prev.seen : empty,
      ray: prev?.ray ?? truth.map(() => null),
      lostFor: prev && prev.lostFor.length === truth.length ? prev.lostFor : truth.map(() => 0),
      read: prev?.read ?? none,
      real: none,
      readOk: prev?.readOk ?? null,
      gazeFrom: prev?.gazeFrom ?? null,
      gazeRead: prev?.gazeRead ?? null,
      watchFor: prev?.watchFor ?? 0,
      tag,
      tagEst: prev?.tagEst ?? { x: 0, y: 0, z: 1 },
      ranges: prev?.ranges ?? this.anchors.map(() => 0),
      los: prev?.los ?? this.anchors.map(() => true),
      resid: prev?.resid ?? this.anchors.map(() => 0),
      consistent: prev?.consistent ?? true,
      tagRead: prev?.tagRead ?? none,
      tagOk: prev?.tagOk ?? null,
      tagHeightSit: prev?.tagHeightSit ?? false,
      heading,
      headingEst: prev?.headingEst ?? heading,
    };
  }

  /** HUD 读数 */
  stats(): {
    standTri: number;
    standKp: number;
    catsSeen: number;
    cats: number;
    readRight: number;
    readKnown: number;
    bodies: number;
    losOk: number;
    flagged: number;
    tagErr: number;
    tagRight: number;
    tagKnown: number;
  } {
    let standTri = 0;
    let standKp = 0;
    let catsSeen = 0;
    let cats = 0;
    let readRight = 0;
    let readKnown = 0;
    let losOk = 0;
    let flagged = 0;
    let tagErr = 0;
    let tagRight = 0;
    let tagKnown = 0;
    for (const b of this.bodies) {
      if (b.kind === 'person' && !b.seated) {
        standKp += b.fix.length;
        standTri += b.fix.filter((f) => f === 'tri' || f === 'depth').length;
      }
      if (b.kind === 'cat') {
        cats++;
        if (b.fix.some((f) => f !== 'none')) catsSeen++;
      }
      if (b.readOk !== null) {
        readKnown++;
        if (b.readOk) readRight++;
      }
      if (b.los.filter(Boolean).length >= 3) losOk++;
      if (!b.consistent) flagged++;
      tagErr += dist(b.tagEst, b.tag);
      if (b.tagOk !== null) {
        tagKnown++;
        if (b.tagOk) tagRight++;
      }
    }
    const n = this.bodies.length;
    return { standTri, standKp, catsSeen, cats, readRight, readKnown, bodies: n, losOk, flagged, tagErr: n ? tagErr / n : 0, tagRight, tagKnown };
  }
}

/** 从 head 沿 gaze 看，3 m 以内、±25° 以内离视线最近的那只猫 */
function pickCat(head: P3, gaze: number, cats: readonly { id: number; x: number; y: number }[]): number | null {
  let best = Infinity;
  let id: number | null = null;
  for (const c of cats) {
    const d = Math.hypot(c.x - head.x, c.y - head.y);
    if (d > WATCH.d) continue;
    const off = Math.abs(wrap(Math.atan2(c.y - head.y, c.x - head.x) - gaze));
    if (off <= WATCH.half && off < best) {
      best = off;
      id = c.id;
    }
  }
  return id;
}
