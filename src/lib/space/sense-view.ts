/**
 * 项目二 · 感知层的画面模型（2026-11-19，作者「把它做立体的……旁边生成一个低保真的、用点抽象化的立体模型，告诉观众
 * 通过这些摄像头去观察其中的人和猫，抽象出一个立体模型，在里面看到它们真正的空间位置」）。
 *
 * 纯几何，台架 SenseBench（Lab 2-17）读它：
 *   - 关键点：人用 figure.ts 的骨架（Drillis & Contini 比例，与 2-15 的方块人同一份）取 15 个点，猫取 7 个点；
 *   - 每台摄像头的画面：针孔投影（视场与朝向取 cohabit-sense 的 Camera）；
 *   - 每个点被哪几台看见：遮挡用 cohabit-sense 的同一份场景与射线检测；
 *   - 方案 B（只讲原理）：身上一个标签，量到几个固定点的距离；被人体挡住的那一段量得偏长。
 * 坐标与 cohabit-sense 相同：平面坐标（米，房间中心为原点）+ z = 离地高度。
 */
import { camSees, segBlocked, SENSE, SENSE_BODY, type Camera, type Scene } from './cohabit-sense';
import { catSkeleton, defaultSeat, humanSkeleton, type CatPose } from './figure';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** 人的 15 个关键点（顺序固定，连线按下标） */
export const PERSON_KP = ['head', 'nose', 'neck', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR', 'hipL', 'knL', 'anL', 'hipR', 'knR', 'anR'] as const;
export const PERSON_LINKS: readonly (readonly [number, number])[] = [
  [0, 2], [0, 1], [2, 3], [3, 4], [4, 5], [2, 6], [6, 7], [7, 8],
  [3, 9], [6, 12], [9, 12], [9, 10], [10, 11], [12, 13], [13, 14],
];
/** 猫的 7 个关键点：头 · 颈 · 背 · 臀 · 尾中 · 尾梢 · 脚（前后脚并成一点，落在它站的面上） */
export const CAT_KP = ['head', 'neck', 'back', 'rump', 'tailMid', 'tailTip', 'feet'] as const;
export const CAT_LINKS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6],
];

/** 人的身高（米）：与站上比例模型同一个数 */
export const PERSON_H = 1.7;

type V3 = readonly [number, number, number];

/** 模型系（x 侧向、y 向上、z 朝前）→ 平面 + 高度：朝前 = heading 方向，侧向转 90° */
function place(x: number, y: number, base: number, heading: number, m: V3): P3 {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return { x: x + m[2] * c - m[0] * s, y: y + m[2] * s + m[0] * c, z: base + m[1] };
}

const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const addv = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sc = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

export interface PersonPose {
  x: number;
  y: number;
  /** 身体朝向与视线（弧度） */
  heading: number;
  gaze: number;
  pose: 'stand' | 'walk' | 'sit';
  /** 步态相位 0–1（只对 walk 有用） */
  phase?: number;
}

/** 人的 15 个关键点。坐着时把胯放在座位点上（平面模型里坐着的人在座位点 = 躯干那一处） */
export function personKeypoints(p: PersonPose, height: number = PERSON_H): P3[] {
  const sk = humanSkeleton(p.pose, { phase: p.phase ?? 0, seat: defaultSeat(1) });
  const [lL, lR] = sk.legs;
  const [aL, aR] = sk.arms;
  const shMid = mid(aL.shoulder, aR.shoulder);
  // 坐着：胯在模型系 z = 0.12H 往前，挪回到原点
  const shift: V3 = p.pose === 'sit' ? [0, 0, -mid(lL.hip, lR.hip)[2]] : [0, 0, 0];
  const neck = addv(shMid, [0, 0.045, 0]);
  const head = addv(shMid, [0, 0.13, 0.005]);
  // 鼻尖：头往视线方向 0.06H（视线相对身体最多转 ±75°）
  const rel = Math.max(-1.31, Math.min(1.31, Math.atan2(Math.sin(p.gaze - p.heading), Math.cos(p.gaze - p.heading))));
  // place() 把模型系 +x 放到朝向转 +90° 的那一侧，所以视线转过 rel 时鼻尖 = (sin rel, cos rel) × 0.06H
  const nose = addv(head, [Math.sin(rel) * 0.06, -0.012, Math.cos(rel) * 0.06]);
  const H = height;
  const pts: V3[] = [head, nose, neck, aL.shoulder, aL.elbow, aL.wrist, aR.shoulder, aR.elbow, aR.wrist, lL.hip, lL.knee, lL.ankle, lR.hip, lR.knee, lR.ankle];
  return pts.map((q) => place(p.x, p.y, 0, p.heading, sc(addv(q, shift), H)));
}

export interface CatPoseIn {
  x: number;
  y: number;
  heading: number;
  /** 它站的面离地多高（地面 0、家具顶面、台面） */
  base: number;
  pose: CatPose;
  phase?: number;
}

/** 猫的 7 个关键点（米，取 figure.ts 猫的骨架：颈端枢轴与尾巴折点） */
export function catKeypoints(c: CatPoseIn): P3[] {
  const sk = catSkeleton(c.pose, { phase: c.phase ?? 0 });
  const piv = sk.pivot as V3;
  const tail = sk.tail as V3[];
  const head: V3 = addv(piv, [0, 0.03, 0.06]);
  const rump: V3 = addv(tail[0], [0, -0.02, 0.04]);
  const back: V3 = addv(mid(piv, rump), [0, 0.0, 0]);
  const feet: V3 = [0, 0, back[2]];
  const pts: V3[] = [head, piv, back, rump, tail[2], tail[3], feet];
  return pts.map((q) => place(c.x, c.y, c.base, c.heading, q));
}

/** 摄像头的三根轴：朝前（向下俯 pitch）、画面右、画面上 */
function camAxes(cam: Camera): { f: V3; r: V3; u: V3 } {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const f: V3 = [cy * cp, sy * cp, -sp];
  const r: V3 = [-sy, cy, 0];
  // u = f × r（z 分量为正）
  const u: V3 = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
  return { f, r, u };
}

/**
 * 针孔投影到这台摄像头的画面：u、v ∈ [−1, 1] 是视场以内（u 向右、v 向上），front = 在镜头前面。
 * 视场按 tan 映射（直线投影），与 cohabit-sense 的 inView 用同一个水平 / 竖直半角；角上略有出入，台架只画在框里的点。
 */
export function camProject(cam: Camera, p: P3): { u: number; v: number; front: boolean; depth: number } {
  const { f, r, u } = camAxes(cam);
  const d: V3 = [p.x - cam.x, p.y - cam.y, p.z - cam.z];
  const df = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (df <= 1e-6) return { u: 0, v: 0, front: false, depth: df };
  const dr = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
  const du = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  return { u: dr / df / Math.tan(cam.hfov / 2), v: du / df / Math.tan(cam.vfov / 2), front: true, depth: df };
}

/** 看得见：在画面框里、视线没被挡（owner = 这个人自己的身体不算挡） */
export function camSeesPoint(scene: Scene, cam: Camera, p: P3, owner: number): boolean {
  const q = camProject(cam, p);
  if (!q.front || Math.abs(q.u) > 1 || Math.abs(q.v) > 1) return false;
  return camSees(scene, cam, p.x, p.y, p.z, owner);
}

/** 视线被挡在哪：最短的被挡前缀（二分，给画面画 ×） */
export function hitPoint(scene: Scene, cam: Camera, p: P3, owner: number): P3 {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 20; k++) {
    const t = (lo + hi) / 2;
    if (segBlocked(scene, cam.x, cam.y, cam.z, cam.x + (p.x - cam.x) * t, cam.y + (p.y - cam.y) * t, cam.z + (p.z - cam.z) * t, owner)) hi = t;
    else lo = t;
  }
  return { x: cam.x + (p.x - cam.x) * hi, y: cam.y + (p.y - cam.y) * hi, z: cam.z + (p.z - cam.z) * hi };
}

/** 鼻尖算看得见：除了没被挡，摄像头还要在人脸那一侧（视线两侧 CAM_FACE 以内，cohabit-sense 的同一个角） */
export function faceToward(cam: Camera, head: P3, gaze: number, half: number): boolean {
  const a = Math.atan2(cam.y - head.y, cam.x - head.x) - gaze;
  return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= half;
}

export interface Seen {
  /** 每个关键点被哪几台摄像头看见（下标） */
  by: number[][];
  /** 每个关键点：在画面框里但被挡住的那几台 */
  blocked: number[][];
}

/** 一组关键点逐台判看见 / 被挡；nose = 关键点里鼻尖的下标（只在摄像头朝着脸时算看见），head = 头的下标 */
export function seenBy(scene: Scene, cams: readonly Camera[], pts: readonly P3[], owner: number, face?: { nose: number; head: number; gaze: number; half: number }): Seen {
  const by: number[][] = pts.map(() => []);
  const blocked: number[][] = pts.map(() => []);
  cams.forEach((cam, ci) => {
    pts.forEach((p, k) => {
      const q = camProject(cam, p);
      if (!q.front || Math.abs(q.u) > 1 || Math.abs(q.v) > 1) return;
      if (face && k === face.nose && !faceToward(cam, pts[face.head], face.gaze, face.half)) return;
      if (camSees(scene, cam, p.x, p.y, p.z, owner)) by[k].push(ci);
      else blocked[k].push(ci);
    });
  });
  return { by, blocked };
}

/**
 * 方案 B 的读数：标签到每个固定点的距离（米）。被人体挡住的那一段多量一截（非视距的正偏差，演示值 0.35 m），
 * 误差圈按能直视几个固定点取 cohabit-sense 的三档。
 */
export const TAG_NLOS_BIAS = 0.35;
export function tagRanges(scene: Scene, anchors: readonly Camera[], tag: P3): { ranges: number[]; los: boolean[]; sd: number } {
  const los = anchors.map((a) => !segBlocked(scene, a.x, a.y, a.z, tag.x, tag.y, tag.z, -1, true));
  const ranges = anchors.map((a, i) => Math.hypot(tag.x - a.x, tag.y - a.y, tag.z - a.z) + (los[i] ? 0 : TAG_NLOS_BIAS));
  const n = los.filter(Boolean).length;
  const sd = n >= 3 ? SENSE.tag.los3 : n === 2 ? SENSE.tag.los2 : SENSE.tag.los1;
  return { ranges, los, sd };
}

/** 标签在哪：人戴在胸口、身体前表面外一点；猫戴在脖子上 */
export function personTag(p: { x: number; y: number; heading: number; seated: boolean }): P3 {
  return {
    x: p.x + Math.cos(p.heading) * SENSE.tag.badgeOffset,
    y: p.y + Math.sin(p.heading) * SENSE.tag.badgeOffset,
    z: p.seated ? SENSE.tag.seatChest : SENSE.tag.chest,
  };
}
export function catTag(c: { x: number; y: number; base: number }): P3 {
  return { x: c.x, y: c.y, z: c.base + SENSE.tag.collar };
}

/** 一个点被几台看见 ⇒ 在立体模型里怎么画：两台以上 = 定得住，一台 = 只知道在哪条视线上，没有 = 不画 */
export type Fix = 'tri' | 'ray' | 'none';
export const fixOf = (n: number): Fix => (n >= 2 ? 'tri' : n === 1 ? 'ray' : 'none');

/** 头、胸的高度先验（米）：只给 HUD 讲「一台时按身高落位」用 */
export const BODY_HEIGHTS = { standHead: SENSE_BODY.standPts[3], seatHead: SENSE_BODY.seatPts[2] } as const;
