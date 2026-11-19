/**
 * 项目二 · 感知层的解算（2026-11-19，作者「把这两个方案都做了：摄像头那个，拿深度相机的话甚至可以直接读到这个人在做什么；
 * 距离那个也就这么做」）。纯数学零 DOM，Lab 2-17 的 SenseObserver 每帧调它：
 *   - 普通摄像头：每台给一条视线（画面上的点 + 检测误差），两条以上求最近点（最小二乘），只有一条就只知道在这条线上；
 *   - 深度相机：每台给视线 + 一个深度，一台就定得出立体位置；超出测距退回成视线；
 *   - 量距离：四个固定点各量一段距离，最小二乘解出 (x, y, z)；四段对不上（残差过大）说明有一段隔着身体读长了；
 *   - 读动作：从解出来的关键点读人站 / 走 / 坐、坐着前倾、看着哪只猫，猫走 / 坐 / 趴、在地上还是台上。
 * 坐标与 cohabit-sense 相同（平面米 + z 离地高度）。误差档是建模假设，写在 SOLVE 里。
 */
import type { Camera } from './cohabit-sense';
import { camAxes, PERSON_H, type P3 } from './sense-view';

export const SOLVE = {
  /** 画面上关键点的检测误差（弧度）：约 1920 像素宽、100° 视场下 5 像素 */
  rayAng: 0.005,
  /** 量距离的随机误差（米，一段） */
  rangeSd: 0.08,
  /** 四段距离的残差平方和 / 误差² 超过它就算「四段对不上」（χ² 一个自由度 95%） */
  chi2: 3.84,
  /** 读走 / 站的速度门槛（米 / 秒，与研究的跟踪同一组数：走 0.3、停 0.15）与看速度的时间窗（秒） */
  walk: 0.3,
  still: 0.15,
  window: 1.0,
  /** 读坐：胯低于这个高度、或胯看不到时头低于这个高度（按 1.70 m 的人：站着胯 0.90 头 1.59，坐着胯 0.52 头 1.21） */
  sitHip: 0.71 * (PERSON_H / 1.7),
  sitHead: 1.4 * (PERSON_H / 1.7),
  /** 坐着前倾：颈相对胯往前倾过这个角 */
  leanDeg: 12,
  /** 读到的视线：看得见脸 ±12°、只看得见肩 ±25°（研究里摄像头那一档的同一组数） */
  faceSd: 12,
  bodySd: 25,
} as const;

const sub = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: P3, b: P3): P3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: P3, k: number): P3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: P3, b: P3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: P3): number => Math.sqrt(dot(a, a));
const unit = (a: P3): P3 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

export interface Ray {
  o: P3;
  /** 单位方向 */
  d: P3;
}

/** 从摄像头看 p 的视线，加画面横向 a、纵向 b 两个小角度偏差（弧度） */
export function rayTo(cam: Camera, p: P3, a = 0, b = 0): Ray {
  const o = { x: cam.x, y: cam.y, z: cam.z };
  const d0 = unit(sub(p, o));
  const { r, u } = camAxes(cam);
  const d = unit({ x: d0.x + a * r[0] + b * u[0], y: d0.y + a * r[1] + b * u[1], z: d0.z + a * r[2] + b * u[2] });
  return { o, d };
}

/** 3×3 线性方程（高斯消元，主元太小返回 null） */
function solve3(m: number[], v: number[]): [number, number, number] | null {
  const a = [m.slice(0, 3).concat(v[0]), m.slice(3, 6).concat(v[1]), m.slice(6, 9).concat(v[2])];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-9) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

/**
 * 几条视线的最近点（最小二乘：到每条线的垂距平方和最小）。至少两条、且不能几乎平行（夹角 < minAng 返回 null）。
 */
export function triangulate(rays: readonly Ray[], minAng = 0.02): P3 | null {
  if (rays.length < 2) return null;
  let maxSin = 0;
  for (let i = 0; i < rays.length; i++)
    for (let j = i + 1; j < rays.length; j++) {
      const c = rays[i].d;
      const e = rays[j].d;
      const cx = c.y * e.z - c.z * e.y;
      const cy = c.z * e.x - c.x * e.z;
      const cz = c.x * e.y - c.y * e.x;
      maxSin = Math.max(maxSin, Math.sqrt(cx * cx + cy * cy + cz * cz));
    }
  if (maxSin < Math.sin(minAng)) return null;
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const v = [0, 0, 0];
  for (const { o, d } of rays) {
    const dd = [d.x, d.y, d.z];
    const oo = [o.x, o.y, o.z];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const pij = (i === j ? 1 : 0) - dd[i] * dd[j];
        m[i * 3 + j] += pij;
        v[i] += pij * oo[j];
      }
  }
  const s = solve3(m, v);
  return s ? { x: s[0], y: s[1], z: s[2] } : null;
}

/** 视线上离 q 最近的点（一台看见时，按跟踪的预测落在这条线上），离镜头至少 tMin */
export function closestOnRay(ray: Ray, q: P3, tMin = 0.3): P3 {
  const t = Math.max(tMin, dot(sub(q, ray.o), ray.d));
  return add(ray.o, mul(ray.d, t));
}

/** 深度相机读到的点：沿视线走量到的距离 */
export function alongRay(ray: Ray, dist: number): P3 {
  return add(ray.o, mul(ray.d, dist));
}

export interface RangeFix {
  p: P3;
  /** 每段：量到的 − 按解出的位置算的（米）；隔着身体那段读长 ⇒ 多半是正的 */
  resid: number[];
  /** 残差平方和 / 误差²（一个冗余量，χ²₁） */
  chi2: number;
  /** 四段对得上 */
  consistent: boolean;
}

/**
 * 四个固定点的距离 → 位置（高斯—牛顿最小二乘，从 x0 起）。固定点都在同一高度时有一个关于那一层对称的镜像解，
 * 取在固定点下面的那个（房间里）。
 */
export function trilaterate(anchors: readonly P3[], ranges: readonly number[], x0: P3, sd: number = SOLVE.rangeSd): RangeFix {
  const zTop = Math.min(...anchors.map((a) => a.z));
  let p = { ...x0 };
  if (p.z >= zTop - 0.05) p.z = zTop - 1;
  for (let it = 0; it < 30; it++) {
    const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    const v = [0, 0, 0];
    anchors.forEach((a, i) => {
      const d = sub(p, a);
      const r = len(d) || 1e-6;
      const j = [d.x / r, d.y / r, d.z / r];
      const e = ranges[i] - r;
      for (let s = 0; s < 3; s++) {
        v[s] += j[s] * e;
        for (let t = 0; t < 3; t++) m[s * 3 + t] += j[s] * j[t];
      }
    });
    for (let s = 0; s < 3; s++) m[s * 4] += 1e-6;
    const dx = solve3(m, v);
    if (!dx) break;
    p = { x: p.x + dx[0], y: p.y + dx[1], z: p.z + dx[2] };
    if (p.z > zTop) p.z = 2 * zTop - p.z;
    if (Math.hypot(dx[0], dx[1], dx[2]) < 1e-7) break;
  }
  const resid = anchors.map((a, i) => ranges[i] - len(sub(p, a)));
  const chi2 = resid.reduce((s, e) => s + e * e, 0) / (sd * sd);
  return { p, resid, chi2, consistent: chi2 < SOLVE.chi2 };
}

// ───────────────────────────────────────────── 读动作

export type Posture = 'walk' | 'stand' | 'sit' | 'unknown';
export type GazeSource = 'face' | 'body' | null;

export interface PersonRead {
  posture: Posture;
  /** 坐着时往前倾（看猫的样子） */
  lean: boolean;
  /** 读到的视线（弧度），读不到为 null */
  gaze: number | null;
  gazeFrom: GazeSource;
  /** 看着哪只猫（猫的 id），没有为 null */
  watching: number | null;
}

/** 速度窗：最近 window 秒里第一次与最后一次的平面位移 / 时间 */
export class SpeedWindow {
  private pts: { t: number; x: number; y: number }[] = [];
  /** 最近一次读数的移动方向（弧度） */
  dir = 0;
  push(t: number, x: number, y: number, win: number = SOLVE.window): number {
    this.pts.push({ t, x, y });
    while (this.pts.length > 2 && t - this.pts[0].t > win) this.pts.shift();
    const a = this.pts[0];
    const dt = t - a.t;
    if (dt <= 0.2) return 0;
    this.dir = Math.atan2(y - a.y, x - a.x);
    return Math.hypot(x - a.x, y - a.y) / dt;
  }
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** 人的 15 个关键点下标（与 PERSON_KP 一致） */
const K = { head: 0, nose: 1, neck: 2, shL: 3, shR: 6, hipL: 9, hipR: 12 } as const;

/**
 * 从解出来的关键点读人在做什么。pts / ok = 关键点与它定没定住（立体位置可信）；speed = 速度窗读数；
 * gaze = 视线读数（看得见脸时由画面给出，否则按两肩推身体朝向，正反按 prevGaze 或走的方向定）；
 * cats = 读到的猫的位置（平面）；prevWalk = 上一次读成走（走 / 站之间留回差）。
 */
export function readPerson(
  pts: readonly P3[],
  ok: readonly boolean[],
  speed: number,
  gaze: { face: number | null; prev: number | null; moveDir: number | null },
  cats: readonly { id: number; x: number; y: number }[],
  prevWalk: boolean,
  watch: { d: number; half: number },
): PersonRead {
  const has = (k: number) => ok[k];
  let posture: Posture = 'unknown';
  const hipOk = has(K.hipL) && has(K.hipR);
  const hipZ = hipOk ? (pts[K.hipL].z + pts[K.hipR].z) / 2 : NaN;
  const headZ = has(K.head) ? pts[K.head].z : NaN;
  const sitting = hipOk ? hipZ < SOLVE.sitHip : Number.isFinite(headZ) ? headZ < SOLVE.sitHead : null;
  if (sitting === true) posture = 'sit';
  else if (sitting === false) posture = speed > (prevWalk ? SOLVE.still : SOLVE.walk) ? 'walk' : 'stand';
  let lean = false;
  if (posture === 'sit' && hipOk && has(K.neck)) {
    const hx = (pts[K.hipL].x + pts[K.hipR].x) / 2;
    const hy = (pts[K.hipL].y + pts[K.hipR].y) / 2;
    const fwd = gaze.face ?? gaze.prev;
    if (fwd !== null) {
      const ahead = (pts[K.neck].x - hx) * Math.cos(fwd) + (pts[K.neck].y - hy) * Math.sin(fwd);
      lean = Math.atan2(ahead, pts[K.neck].z - hipZ) > (SOLVE.leanDeg * Math.PI) / 180;
    }
  }
  let g: number | null = null;
  let from: GazeSource = null;
  if (gaze.face !== null) {
    g = gaze.face;
    from = 'face';
  } else if (has(K.shL) && has(K.shR)) {
    // 两肩连线的法向：两个方向里挑离走的方向（或上一次读数）近的那个
    const a = Math.atan2(pts[K.shR].y - pts[K.shL].y, pts[K.shR].x - pts[K.shL].x);
    const n1 = a + Math.PI / 2;
    const n2 = a - Math.PI / 2;
    const ref = gaze.moveDir ?? gaze.prev;
    g = ref === null ? n1 : Math.abs(wrap(n1 - ref)) <= Math.abs(wrap(n2 - ref)) ? n1 : n2;
    from = 'body';
  }
  let watching: number | null = null;
  if (g !== null && posture !== 'walk' && posture !== 'unknown') {
    const base = has(K.head) ? pts[K.head] : has(K.neck) ? pts[K.neck] : null;
    if (base) {
      let best = Infinity;
      for (const c of cats) {
        const d = Math.hypot(c.x - base.x, c.y - base.y);
        if (d > watch.d) continue;
        const off = Math.abs(wrap(Math.atan2(c.y - base.y, c.x - base.x) - g));
        if (off <= watch.half && off < best) {
          best = off;
          watching = c.id;
        }
      }
    }
  }
  return { posture, lean, gaze: g, gazeFrom: from, watching };
}

export type CatPostureRead = 'walk' | 'sit' | 'lie' | 'stand' | 'unknown';

/** 猫的 7 个关键点下标（与 CAT_KP 一致） */
const C = { head: 0, neck: 1, back: 2, rump: 3, feet: 6 } as const;

/**
 * 读猫：它站的面多高 = base（调用方按读到的位置在房间里找：地面、家具顶面、成形单元的台面，这些高度是已知的），
 * 再看臀、头、颈离这个面多高分站、坐还是趴（站上猫的骨架：站 / 走臀 0.18；坐头 0.25 颈 0.22；趴头 0.15 颈 0.12），速度分走。
 * base 不给时退回用脚那个点的高度（脚贴着面、最容易被挡，误差最大）。
 */
export function readCat(pts: readonly P3[], ok: readonly boolean[], speed: number, prevWalk: boolean, baseKnown?: number): { posture: CatPostureRead; base: number | null } {
  const base = baseKnown ?? (ok[C.feet] ? pts[C.feet].z : ok[C.back] ? pts[C.back].z - 0.17 : null);
  let posture: CatPostureRead = 'unknown';
  if (base !== null) {
    const rump = ok[C.rump] ? pts[C.rump].z - base : NaN;
    const hn = [C.head, C.neck].filter((k) => ok[k]).map((k) => pts[k].z - base);
    const back = ok[C.back] ? pts[C.back].z - base : NaN;
    if (Number.isFinite(rump) && rump > 0.1) posture = speed > (prevWalk ? 0.04 : 0.06) ? 'walk' : 'stand';
    else if (hn.length) posture = hn.reduce((a, b) => a + b, 0) / hn.length > 0.185 ? 'sit' : 'lie';
    else if (Number.isFinite(back)) posture = back > 0.085 ? 'sit' : 'lie';
  }
  return { posture, base };
}
