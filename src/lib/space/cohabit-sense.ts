/**
 * 项目二 · 感知层（2026-11-18，作者「摄像头加座位压力、单元称重的方案是 OK 的，项圈和胸牌其实也可以，胸牌也能表现这个人
 * 此时面朝哪里……两个方案都做」）。
 *
 * 平面模型（cohabit.ts）里空间对人和猫一直是全知的。这一层把空间每一步读的东西换成传感器给得出的那一份：
 *   - 方案 A「摄像头」：房间四个上角各一台摄像头 + 每台单元吊杆上的称重 + 座位坐垫下的压力片；
 *   - 方案 B「胸牌 / 项圈」：访客胸牌与猫项圈里的 UWB 定位（四个上角各一个基站）+ 胸牌里的方向传感 + 单元称重 + 座位压力；
 *   - 「只读看得见的」：位置、朝向都按真值，只把读不到的四样（猫想跳上哪台、猫在台上想去哪台、猫的潜伏期、人还没走的路线）
 *     换成看得见的量。两个方案都先做了这一步——意图任何传感器都读不到。
 *
 * 人和猫自己的行为、四类事件记账仍按真值（真实实验里记账靠录像事后核对，不在实时回路里）。
 * 每一项的读法、数从哪来、哪些是建模假设 = 项目二_感知层.md。
 *
 * 坐标：平面坐标（米，房间中心为原点，与 PlanLayout 同一套）+ z = 离地高度（米）。
 */
import { COHABIT, type Cat, type CohabitSim, type SpaceSense, type Visitor } from './cohabit';
import { TABLE_TOP, UNITS_PER_M, furnitureBoxes, tableTopFor } from './cohabit-solid';
import { makeRng } from './crowd-plan';
import { ROOM } from './skin-grid';
import { PLAN, wrapAngle, type PlanLayout } from './unit-activation';

const DEG = Math.PI / 180;

/** 房间与单元的竖向尺寸（米）。单元那几个数是 Lab 2-15 的轨迹（UnitBaker 三档平台）在工位上量的，守门现量核对 */
export const SENSE_GEOM = {
  /** 天花板离地 */
  ceiling: ROOM.FLOOR_Y / UNITS_PER_M,
  /** 收在天花下时上夹环离天花（HOIST.ceilGap = 2 单位） */
  stowGap: 2 / UNITS_PER_M,
  /**
   * 站立工位（台面 TABLE_TOP.stand）上的三个高度：落到位、还没收缩时直垂那条带的顶（上夹环）、收缩成形后上夹环（注册在底端：
   * 钉住端不动，上夹环随芯收短往下走）、台面、钉住端
   */
  hangTop: 2.125,
  formedTop: 1.43,
  platTop: TABLE_TOP.stand,
  foot: 0.821,
  /** 收起时布束的长度系数（HOIST.stowed） */
  stowed: 0.15,
  /** 台面厚（6.5 cm）· 吊杆半径（露在天花下五节 Ø84 → 52 mm 取中） */
  slabT: 0.065,
  rodR: 0.035,
} as const;

/** 人与猫的身体（米）：挡视线的圆柱，与几个要看的点 */
export const SENSE_BODY = {
  r: 0.2,
  standH: 1.72,
  seatH: 1.3,
  /** 站着：脚 · 胯 · 胸 · 头；坐着：膝 · 胸 · 头（下标 0 = 最低那个） */
  standPts: [0.08, 0.9, 1.3, 1.58],
  seatPts: [0.5, 0.95, 1.2],
  /** 猫：身体中心与头离它所在面的高度；身体半宽 */
  catPts: [0.12, 0.22],
  catR: 0.12,
} as const;

// ───────────────────────────────────────────────────────────────── 摄像头

export interface Camera {
  x: number;
  y: number;
  z: number;
  /** 朝向（平面角）与俯角（向下为正） */
  yaw: number;
  pitch: number;
  hfov: number;
  vfov: number;
}

/** 摄像头：装在收起的单元下沿（3.53 m）以下，100° × 70° 广角，对准房间中心的地面 */
export const CAM = {
  H: 3.4,
  INSET: 0.05,
  HFOV: 100 * DEG,
  VFOV: 70 * DEG,
  /** 脸算看得见：摄像头在头朝向两侧这么多度以内 */
  FACE: 60 * DEG,
} as const;

export type CamLayout = 'adjacent2' | 'diagonal2' | 'corners4' | 'mid4' | 'corners4low' | 'all8';
export const CAM_LAYOUTS: readonly { key: CamLayout; zh: string; en: string }[] = [
  { key: 'adjacent2', zh: '同一面墙的两个上角', en: 'two corners on one wall' },
  { key: 'diagonal2', zh: '对角的两个上角', en: 'two opposite corners' },
  { key: 'corners4', zh: '四个上角', en: 'four corners' },
  { key: 'corners4low', zh: '四个角 · 装在 2.4 m', en: 'four corners at 2.4 m' },
  { key: 'mid4', zh: '四面墙的中点', en: 'four wall midpoints' },
  { key: 'all8', zh: '四角 + 四面墙中点', en: 'corners + midpoints' },
];

function aim(x: number, y: number, z: number, tx: number, ty: number, tz: number, hfov: number = CAM.HFOV, vfov: number = CAM.VFOV): Camera {
  const d = Math.hypot(tx - x, ty - y);
  return { x, y, z, yaw: Math.atan2(ty - y, tx - x), pitch: Math.atan2(z - tz, d), hfov, vfov };
}

/** 一种布置的摄像头（房间 roomM 见方，中心为原点） */
export function cameraLayout(key: CamLayout, roomM: number): Camera[] {
  const h = roomM / 2 - CAM.INSET;
  const corner = (sx: number, sy: number, z: number = CAM.H) => aim(sx * h, sy * h, z, 0, 0, 0);
  const mid = (sx: number, sy: number) => aim(sx * h, sy * h, CAM.H, 0, 0, 0);
  switch (key) {
    case 'adjacent2':
      return [corner(-1, -1), corner(1, -1)];
    case 'diagonal2':
      return [corner(-1, -1), corner(1, 1)];
    case 'corners4':
      return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    case 'corners4low':
      return [corner(-1, -1, 2.4), corner(1, -1, 2.4), corner(1, 1, 2.4), corner(-1, 1, 2.4)];
    case 'mid4':
      return [mid(0, -1), mid(1, 0), mid(0, 1), mid(-1, 0)];
    case 'all8':
      return [...cameraLayout('corners4', roomM), ...cameraLayout('mid4', roomM)];
  }
}

/** 点在不在这台摄像头的视场里（矩形视锥的近似） */
export function inView(cam: Camera, x: number, y: number, z: number): boolean {
  const dx = x - cam.x;
  const dy = y - cam.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return false;
  if (Math.abs(wrapAngle(Math.atan2(dy, dx) - cam.yaw)) > cam.hfov / 2) return false;
  return Math.abs(Math.atan2(cam.z - z, d) - cam.pitch) <= cam.vfov / 2;
}

// ───────────────────────────────────────────────────────────────── 挡视线的东西

/** 竖直圆柱（芯外那截布、吊杆、人） */
export interface Cyl {
  x: number;
  y: number;
  r: number;
  z0: number;
  z1: number;
  /** 属于哪个访客（看他自己的点时不算他自己挡）；−1 = 不属于任何人 */
  owner: number;
  /** 不透 UWB（人体）——布、铝杆、家具对 UWB 按透过算 */
  body: boolean;
}

/** 绕竖轴转过的长方体：自身 (lx, ly) → 平面 (cx + lx·c + ly·s, cy − lx·s + ly·c)（与 cohabit-solid Box.rot 同一个约定） */
export interface OBox {
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  z0: number;
  z1: number;
  c: number;
  s: number;
  /** 平面上的外接框（先筛） */
  bx0: number;
  bx1: number;
  by0: number;
  by1: number;
}

export interface Scene {
  cyls: Cyl[];
  boxes: OBox[];
}

function makeBox(cx: number, cy: number, hx: number, hy: number, z0: number, z1: number, c = 1, s = 0): OBox {
  const ex = Math.abs(hx * c) + Math.abs(hy * s);
  const ey = Math.abs(hx * s) + Math.abs(hy * c);
  return { cx, cy, hx, hy, z0, z1, c, s, bx0: cx - ex, bx1: cx + ex, by0: cy - ey, by1: cy + ey };
}

/** 家具（cohabit-solid furnitureBoxes 的那几块：座面、靠背、扶手）换成米 */
export function furnitureScene(sim: Pick<CohabitSim, 'furn'>): OBox[] {
  if (!sim.furn) return [];
  const U = UNITS_PER_M;
  return furnitureBoxes(sim.furn.rects).map((b) => {
    const zc = (ROOM.FLOOR_Y - b.cy) / U;
    return makeBox(b.cx / U, b.cz / U, b.hx / U, b.hz / U, zc - b.hy / U, zc + b.hy / U, b.rot?.c ?? 1, b.rot?.s ?? 0);
  });
}

/**
 * 地上的猫站在哪个面上：平面模型里地上的猫不避家具（会走到沙发、椅子占的位置上），那就是它上了家具——取盖住这一点的
 * 家具块里最高的顶面（座面 0.43–0.45 m、扶手 0.62、靠背 0.85）；不在家具上 = 地面 0。
 */
export function floorSurface(furn: readonly OBox[], x: number, y: number): number {
  let top = 0;
  for (const b of furn) {
    if (x < b.bx0 || x > b.bx1 || y < b.by0 || y > b.by1) continue;
    const dx = x - b.cx;
    const dy = y - b.cy;
    if (Math.abs(b.c * dx - b.s * dy) <= b.hx && Math.abs(b.s * dx + b.c * dy) <= b.hy) top = Math.max(top, b.z1);
  }
  return top;
}

/**
 * 一台单元此刻挡视线的部分（台面在 top 的那个工位）：
 *   程度 < 落下线 = 直垂的布束沿吊杆往下走（布束随落下按 HOIST 那条比例放长）；
 *   之后成形：钉住端不动，上夹环从直垂的顶降到成形后的位置，台面从芯外缘铺到整块方台（让路收回的带不扣，偏保守）。
 * 芯外那截布按芯半径画（布贴着芯），上夹环以上是吊杆。
 */
export function unitOccluders(l: PlanLayout, x: number, y: number, degree: number, top: number, cyls: Cyl[], boxes: OBox[]): void {
  if (degree <= 1e-3) return; // 收在天花下：比摄像头高，挡不着
  const G = SENSE_GEOM;
  const at = COHABIT.WALL_AT;
  const drop = Math.min(1, degree / at);
  const form = Math.max(0, Math.min(1, (degree - at) / (1 - at)));
  const shift = top - G.platTop;
  const stowTop = G.ceiling - G.stowGap;
  const len = G.hangTop - G.foot;
  let upper: number;
  let foot: number;
  if (form <= 0) {
    upper = stowTop + (G.hangTop + shift - stowTop) * drop;
    foot = upper - len * (G.stowed + (1 - G.stowed) * drop);
  } else {
    foot = G.foot + shift;
    upper = G.hangTop + shift + (G.formedTop - G.hangTop) * form;
  }
  cyls.push({ x, y, r: l.mastR, z0: foot, z1: upper, owner: -1, body: false });
  cyls.push({ x, y, r: G.rodR, z0: upper, z1: G.ceiling, owner: -1, body: false });
  if (form > 0) {
    const half = l.mastR + (l.platR - l.mastR) * form;
    boxes.push(makeBox(x, y, half, half, top - G.slabT, top));
  }
}

/** 此刻房间里挡视线的东西：单元（按程度与桌子高度）+ 家具 + 在场的访客。furn = 预先算好的家具块（家具不动时复用） */
export function sceneOf(sim: CohabitSim, furn: OBox[] = furnitureScene(sim)): Scene {
  const cyls: Cyl[] = [];
  const boxes: OBox[] = [...furn];
  const l = sim.layout;
  const rects = sim.furn?.rects ?? [];
  if (sim.space !== 'empty')
    for (const u of l.units) {
      const f = sim.tableBy[u.i];
      const top = f >= 0 && rects[f] ? tableTopFor(rects[f]) : TABLE_TOP.stand;
      unitOccluders(l, u.x, u.y, sim.act.degree[u.i], top, cyls, boxes);
    }
  for (const p of sim.people) {
    const w = p.walker;
    if (!w.present) continue;
    cyls.push({ x: w.x, y: w.y, r: SENSE_BODY.r, z0: 0, z1: p.seated ? SENSE_BODY.seatH : SENSE_BODY.standH, owner: p.id, body: true });
  }
  return { cyls, boxes };
}

const EPS = 1e-4;

/** 线段 a→b 有没有被挡（端点附近不算）。skipOwner = 不算这个访客自己的身体；bodiesOnly = 只算人体（UWB） */
export function segBlocked(scene: Scene, ax: number, ay: number, az: number, bx: number, by: number, bz: number, skipOwner = -1, bodiesOnly = false): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);
  const a2 = dx * dx + dy * dy;
  for (const c of scene.cyls) {
    if (c.owner === skipOwner && skipOwner >= 0) continue;
    if (bodiesOnly && !c.body) continue;
    if (c.x + c.r < minX || c.x - c.r > maxX || c.y + c.r < minY || c.y - c.r > maxY) continue;
    // 平面里与圆的交段
    const fx = ax - c.x;
    const fy = ay - c.y;
    let t0: number;
    let t1: number;
    const cc = fx * fx + fy * fy - c.r * c.r;
    if (a2 < 1e-12) {
      if (cc > 0) continue;
      t0 = 0;
      t1 = 1;
    } else {
      const b = 2 * (fx * dx + fy * dy);
      const disc = b * b - 4 * a2 * cc;
      if (disc < 0) continue;
      const sq = Math.sqrt(disc);
      t0 = (-b - sq) / (2 * a2);
      t1 = (-b + sq) / (2 * a2);
    }
    // 高度上的交段
    let z0: number;
    let z1: number;
    if (Math.abs(dz) < 1e-12) {
      if (az < c.z0 || az > c.z1) continue;
      z0 = -Infinity;
      z1 = Infinity;
    } else {
      const p = (c.z0 - az) / dz;
      const q = (c.z1 - az) / dz;
      z0 = Math.min(p, q);
      z1 = Math.max(p, q);
    }
    if (Math.max(t0, z0, EPS) < Math.min(t1, z1, 1 - EPS)) return true;
  }
  if (bodiesOnly) return false;
  for (const o of scene.boxes) {
    if (o.bx1 < minX || o.bx0 > maxX || o.by1 < minY || o.by0 > maxY) continue;
    const ox = ax - o.cx;
    const oy = ay - o.cy;
    const lox = o.c * ox - o.s * oy;
    const loy = o.s * ox + o.c * oy;
    const ldx = o.c * dx - o.s * dy;
    const ldy = o.s * dx + o.c * dy;
    let lo = EPS;
    let hi = 1 - EPS;
    const slab = (org: number, dir: number, mn: number, mx: number): boolean => {
      if (Math.abs(dir) < 1e-12) return org >= mn && org <= mx;
      let p = (mn - org) / dir;
      let q = (mx - org) / dir;
      if (p > q) [p, q] = [q, p];
      if (p > lo) lo = p;
      if (q < hi) hi = q;
      return lo < hi;
    };
    if (slab(lox, ldx, -o.hx, o.hx) && slab(loy, ldy, -o.hy, o.hy) && slab(az, dz, o.z0, o.z1)) return true;
  }
  return false;
}

/** 这台摄像头看不看得见 (x, y, z)：在视场里、视线没被挡 */
export function camSees(scene: Scene, cam: Camera, x: number, y: number, z: number, skipOwner = -1): boolean {
  return inView(cam, x, y, z) && !segBlocked(scene, cam.x, cam.y, cam.z, x, y, z, skipOwner);
}

/** 一个人在各台摄像头里：看见上半身（头或胸）的台数、看见脚的、看得见脸的（摄像头在头朝向 ±CAM.FACE 以内） */
export interface PersonView {
  upper: number;
  /** 看见上半身的那几台里第一台的下标（单台时估位置用）；−1 = 没有 */
  first: number;
  feet: boolean;
  face: number;
}

export function personView(scene: Scene, cams: readonly Camera[], x: number, y: number, seated: boolean, gaze: number, owner: number): PersonView {
  const pts = seated ? SENSE_BODY.seatPts : SENSE_BODY.standPts;
  const head = pts[pts.length - 1];
  const chest = pts[pts.length - 2];
  let upper = 0;
  let first = -1;
  let feet = false;
  let face = 0;
  for (let k = 0; k < cams.length; k++) {
    const cam = cams[k];
    const headIn = camSees(scene, cam, x, y, head, owner);
    const chestIn = headIn || camSees(scene, cam, x, y, chest, owner);
    if (!chestIn) continue;
    upper++;
    if (first < 0) {
      first = k;
      feet = !seated && camSees(scene, cam, x, y, pts[0], owner);
    }
    if (headIn && Math.abs(wrapAngle(Math.atan2(cam.y - y, cam.x - x) - gaze)) <= CAM.FACE) face++;
  }
  return { upper, first, feet, face };
}

/** 一只猫（离它所在面 base 高）在几台摄像头里看得见：身体中心或头任一点 */
export function catView(scene: Scene, cams: readonly Camera[], x: number, y: number, base: number): number {
  let n = 0;
  for (const cam of cams) if (SENSE_BODY.catPts.some((h) => camSees(scene, cam, x, y, base + h))) n++;
  return n;
}

// ───────────────────────────────────────────────────────────────── 传感器的误差（项目二_感知层.md §3 逐条出处）

export const SENSE = {
  /** 摄像头：两台以上看见 = 三角定位；一台看见脚 = 落到地面上；一台只看见头 = 按身高先验（σ）算，误差 = σ / tan(俯角)，封顶 */
  camera: {
    multi: 0.04,
    ground: 0.05,
    heightSd: 0.08,
    maxSd: 0.4,
    /** 看得见脸时头朝向的误差；看不见脸、只看见身体时按身体朝向估（误差大） */
    faceSd: 12 * DEG,
    bodySd: 25 * DEG,
    rate: 10,
  },
  /** UWB：四个上角各一个基站；人体挡住的基站算非视距。视距基站 ≥ 3 / 2 / ≤ 1 三档误差 */
  tag: {
    los3: 0.1,
    los2: 0.18,
    los1: 0.3,
    /** 胸牌离身体中心（在身体前表面外一点）、离地；坐着时胸牌离地；项圈离猫所在面 */
    badgeOffset: 0.21,
    chest: 1.3,
    seatChest: 1.0,
    collar: 0.2,
    /** 胸牌方向传感：白噪声 + 一个慢慢漂的偏差（室内磁场被 64 台电机与铝杆扰动，Ornstein–Uhlenbeck，σ 与时间常数） */
    headingSd: 8 * DEG,
    biasSd: 10 * DEG,
    biasTau: 60,
    turnTau: 10,
    rate: 10,
  },
  /**
   * 跟踪：α-β 滤波（摄像头噪声小、增益高；UWB 噪声大、增益低）；看不见时按最后的速度滑行、每次更新乘衰减。
   * 走没走 = 估计位置这一秒（window）挪了多远：人 > walk m/s 算在走，猫 < still m/s 算停住
   */
  track: { camera: { alpha: 0.5, beta: 0.15 }, tag: { alpha: 0.3, beta: 0.04 }, coastDecay: 0.7, window: 1.0, walk: 0.3, still: 0.15 },
  /**
   * 读不到的意图换成看得见的量：
   *   猫想跳上哪台 → 地上的猫在某台正下方（芯 climbR 以内）停住满 climbStill 秒 ⇒ 当它要上那台；
   *   猫在台上想去哪台 → 读不到，空间不为它先落下（只能走已经落着的台）；
   *   猫的潜伏期 → 看见它刚从一个人身边走开（retreatLook 秒前离人 < CAT_NEAR、现在远了 retreatGain 以上、挪了 retreatMove 以上）
   *     ⇒ 之后 cat.latency 秒不引它；
   *   人还没走的路线 → 沿此刻的速度往前直线外推 routeL（猫在台上外推 catRouteL）；
   *   人在一条没开的带前停下等 → 传感器只看得见「停住了」：刚停下（stopAsk 秒内）、正前方 askAt 处 askR 以内就是一条成墙的带
   *     ⇒ 当他要从那里过去（不加这一条，等着的人在方案 A、B 下会被关在带前几分钟）。
   */
  proxy: { climbR: 0.2, climbStill: 1.0, retreatLook: 2.0, retreatGain: 0.4, retreatMove: 0.3, routeL: 5, catRouteL: 0.3, stopAsk: 8, askAt: 0.45, askR: 0.25 },
} as const;

export type SenseScheme = 'observe' | 'camera' | 'tag';
export const SENSE_SCHEMES: readonly { key: SenseScheme; zh: string; en: string }[] = [
  { key: 'observe', zh: '只读看得见的（位置朝向按真值）', en: 'observables only (exact)' },
  { key: 'camera', zh: '方案 A · 摄像头 + 称重 + 座位压力', en: 'A · cameras + load + seat pressure' },
  { key: 'tag', zh: '方案 B · 胸牌 / 项圈 + 称重 + 座位压力', en: 'B · badges / collars + load + seat pressure' },
];

export interface SenseCfg {
  scheme: SenseScheme;
  /** 读不到的意图换成看得见的量（默认开；observe + 关 = 原样转一遍真值，只用来验管道） */
  proxies?: boolean;
  /** 摄像头布置（方案 A；方案 B 的基站固定在四个上角） */
  cams?: CamLayout;
  /** 噪声种子（与仿真的随机数分开，不扰动人和猫） */
  seed?: number;
  /** 方案 B 胸牌朝向的白噪声（弧度） */
  tagHeadingSd?: number;
  /**
   * 方案 B 敏感性：人看东西时头相对身体的偏转（弧度，慢慢变的偏差，时间常数 SENSE.tag.turnTau）。模型里的人看猫时身体整个
   * 转过去（胸牌朝向 = 视线），真人多半只转头；这一项把胸牌读到的朝向与视线拉开。默认 0
   */
  tagTurnSd?: number;
}

// ───────────────────────────────────────────────────────────────── 读数

interface SeenWalker {
  x: number;
  y: number;
  present: boolean;
  state: string;
  speed: number;
  heading: number;
  gaze: number;
  route: readonly { x: number; y: number }[];
}

interface Track {
  x: number;
  y: number;
  vx: number;
  vy: number;
  init: boolean;
  /** 最近一段的估计位置（按时间），算「这一秒挪了多远」：比滤波器的速度稳，UWB 那么大的噪声下也判得出停没停 */
  hist: { t: number; x: number; y: number }[];
}

function newTrack(x = 0, y = 0, init = false): Track {
  return { x, y, vx: 0, vy: 0, init, hist: [] };
}

interface PersonRec {
  truth: Visitor;
  over: { walker: SeenWalker; watching?: number | null; watchFor?: number; offer?: Visitor['offer']; offered?: boolean };
  proxy: Visitor;
  track: Track;
  gaze: number;
  bias: number;
  turn: number;
  wasPresent: boolean;
  /** 最后一次在走时的方向、停下多久了（s） */
  lastDir: number;
  stopT: number;
}

interface CatRec {
  truth: Cat;
  over: { walker: SeenWalker; pending?: Cat['pending']; climb?: Cat['climb']; latency?: number };
  proxy: Cat;
  track: Track;
  still: number;
  retreatAt: number;
  hist: { t: number; d: number; x: number; y: number }[];
  wasPresent: boolean;
}

/** 读数质量与代价（时间都按秒累加，误差按每次更新取样） */
export interface SenseStats {
  t: number;
  /** 带碰到站着 / 走着的人（人身体圈里伸进一条成墙的带）的人·秒 */
  contactS: number;
  /** 人在没开的门口等的人·秒 */
  waitS: number;
  /** 位置误差（米，均方根）：走 / 站着的人、猫 */
  personRmse: number;
  catRmse: number;
  /** 这一次更新没有任何测量（被挡、只能滑行）的比例：人、地上的猫、台上的猫 */
  personLost: number;
  floorCatLost: number;
  topCatLost: number;
  /** 站定或坐着时「看着哪只猫」：真值与读数的人·秒（对上 = 两边都在看且是同一只） */
  watchHit: number;
  watchFalse: number;
  watchMiss: number;
  /** 「猫要跳上这台」：真值与看得见的量的猫·秒 */
  climbHit: number;
  climbFalse: number;
  climbMiss: number;
}

function overlay<T extends object>(target: T, over: Record<string, unknown>): T {
  const own = (k: string | symbol) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(over, k);
  return new Proxy(target, {
    get: (t, k) => (own(k) ? over[k as string] : Reflect.get(t, k)),
    set: (t, k, v) => {
      if (own(k)) over[k as string] = v;
      else Reflect.set(t, k, v);
      return true;
    },
  });
}

function seenWalkerOf(w: Visitor['walker']): SeenWalker {
  return { x: w.x, y: w.y, present: w.present, state: w.state, speed: w.speed, heading: w.heading, gaze: w.gaze, route: [] };
}

/**
 * 感知层：接到 CohabitOpts.sense 上。空间每一步读 seenPeople / seenCats；空间写回的「这次站定递出的那一步」
 * 在方案 A、B 下落到读数这一侧（按读到的「站定看着猫」开始、结束），不碰真值。
 */
export class CohabitSense implements SpaceSense {
  readonly cfg: Required<Pick<SenseCfg, 'scheme' | 'proxies' | 'cams'>> & SenseCfg;
  private readonly rng: () => number;
  private people: PersonRec[] = [];
  private cats: CatRec[] = [];
  private seenP: Visitor[] = [];
  private seenC: Cat[] = [];
  private cams: Camera[] | null = null;
  private anchors: Camera[] | null = null;
  private furn: OBox[] | null = null;
  private furnKey: unknown = null;
  private acc = 0;
  private t = 0;
  private s = { contactS: 0, waitS: 0, pErr: 0, pN: 0, cErr: 0, cN: 0, pLost: 0, pTick: 0, fLost: 0, fTick: 0, tLost: 0, tTick: 0, wHit: 0, wFalse: 0, wMiss: 0, cHit: 0, cFalse: 0, cMiss: 0 };

  constructor(cfg: SenseCfg) {
    this.cfg = { proxies: true, cams: 'corners4', ...cfg };
    this.rng = makeRng(cfg.seed ?? 20261118);
  }

  seenPeople(): Visitor[] {
    return this.seenP;
  }
  seenCats(): Cat[] {
    return this.seenC;
  }

  get stats(): SenseStats {
    const s = this.s;
    const r = (n: number, d: number) => (d > 0 ? n / d : 0);
    return {
      t: this.t,
      contactS: s.contactS,
      waitS: s.waitS,
      personRmse: Math.sqrt(r(s.pErr, s.pN)),
      catRmse: Math.sqrt(r(s.cErr, s.cN)),
      personLost: r(s.pLost, s.pTick),
      floorCatLost: r(s.fLost, s.fTick),
      topCatLost: r(s.tLost, s.tTick),
      watchHit: s.wHit,
      watchFalse: s.wFalse,
      watchMiss: s.wMiss,
      climbHit: s.cHit,
      climbFalse: s.cFalse,
      climbMiss: s.cMiss,
    };
  }

  private gauss(): number {
    // Box–Muller（用自己那串随机数）
    const u = Math.max(1e-12, this.rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rng());
  }

  private sync(sim: CohabitSim): void {
    const exact = this.cfg.scheme === 'observe';
    while (this.people.length < sim.people.length) {
      const p = sim.people[this.people.length];
      const over: PersonRec['over'] = { walker: seenWalkerOf(p.walker) };
      if (!exact) {
        over.watching = null;
        over.watchFor = 0;
        over.offer = null;
        over.offered = false;
      }
      const rec: PersonRec = { truth: p, over, proxy: overlay(p, over), track: newTrack(), gaze: p.walker.gaze, bias: 0, turn: 0, wasPresent: false, lastDir: p.walker.heading, stopT: Infinity };
      this.people.push(rec);
    }
    while (this.cats.length < sim.cats.length) {
      const c = sim.cats[this.cats.length];
      const over: CatRec['over'] = { walker: seenWalkerOf(c.walker) };
      if (this.cfg.proxies) {
        over.pending = null;
        over.climb = null;
        over.latency = 0;
      }
      this.cats.push({ truth: c, over, proxy: overlay(c, over), track: newTrack(), still: 0, retreatAt: -Infinity, hist: [], wasPresent: false });
    }
    if (this.people.length > sim.people.length) this.people.length = sim.people.length;
    if (this.cats.length > sim.cats.length) this.cats.length = sim.cats.length;
    this.seenP = this.people.map((r) => r.proxy);
    this.seenC = this.cats.map((r) => r.proxy);
  }

  observe(sim: CohabitSim, dt: number): void {
    this.sync(sim);
    this.t += dt;
    this.measureCost(sim, dt);
    if (this.cfg.scheme === 'observe') {
      this.updateExact(sim, dt);
      return;
    }
    this.acc += dt;
    const rate = this.cfg.scheme === 'camera' ? SENSE.camera.rate : SENSE.tag.rate;
    if (this.acc + 1e-9 < 1 / rate) return;
    const T = this.acc;
    this.acc = 0;
    this.updateSensed(sim, T);
  }

  // ── 代价：带碰到人、门口等（按真值量，每一步） ──
  private measureCost(sim: CohabitSim, dt: number): void {
    for (const p of sim.people) {
      const w = p.walker;
      if (!w.present) continue;
      if (p.waitFor > 0) this.s.waitS += dt;
      if (!p.seated && sim.bandTouch(w.x, w.y, PLAN.BODY_R - 0.02)) this.s.contactS += dt;
    }
  }

  // ── 只读看得见的：位置朝向按真值 ──
  private updateExact(sim: CohabitSim, dt: number): void {
    const proxies = this.cfg.proxies;
    for (const r of this.people) {
      const w = r.truth.walker;
      const sw = r.over.walker;
      sw.x = w.x;
      sw.y = w.y;
      sw.present = w.present;
      sw.state = w.state;
      sw.speed = w.speed;
      sw.heading = w.heading;
      sw.gaze = w.gaze;
      if (!proxies) sw.route = w.route;
      else sw.route = w.state === 'walk' ? [{ x: w.x + Math.cos(w.heading) * SENSE.proxy.routeL, y: w.y + Math.sin(w.heading) * SENSE.proxy.routeL }] : [];
    }
    for (const r of this.cats) {
      const w = r.truth.walker;
      const sw = r.over.walker;
      sw.x = w.x;
      sw.y = w.y;
      sw.present = w.present;
      sw.state = w.state;
      sw.speed = w.speed;
      sw.heading = w.heading;
      sw.gaze = w.gaze;
      if (!proxies) sw.route = w.route;
      else sw.route = w.state === 'walk' ? [{ x: w.x + Math.cos(w.heading) * SENSE.proxy.catRouteL, y: w.y + Math.sin(w.heading) * SENSE.proxy.catRouteL }] : [];
      if (proxies) this.catProxies(sim, r, dt, w.state !== 'walk');
    }
    if (proxies) this.scoreIntent(sim, dt);
  }

  // ── 方案 A / B ──
  private updateSensed(sim: CohabitSim, T: number): void {
    const camera = this.cfg.scheme === 'camera';
    const l = sim.layout;
    if (camera && !this.cams) this.cams = cameraLayout(this.cfg.cams, l.roomM);
    if (!camera && !this.anchors) this.anchors = cameraLayout('corners4', l.roomM);
    if (this.furnKey !== sim.furn) {
      this.furn = furnitureScene(sim);
      this.furnKey = sim.furn;
    }
    const scene = sceneOf(sim, this.furn!);
    const tk = SENSE.track;
    // 人
    for (const r of this.people) {
      const p = r.truth;
      const w = p.walker;
      const sw = r.over.walker;
      sw.present = w.present;
      if (!w.present) {
        r.wasPresent = false;
        r.track.init = false;
        continue;
      }
      if (!r.wasPresent) {
        // 进门：门口那台摄像头 / 门口的基站看得见，按真值起一条轨迹
        r.track = newTrack(w.x, w.y, true);
        r.gaze = w.gaze;
        r.wasPresent = true;
      }
      if (p.seated && p.seat !== null) {
        // 座位压力：坐没坐、坐哪个座位不会错；位置 = 座位
        const s = sim.seats[p.seat];
        r.track = newTrack(s.x, s.y, true);
      }
      // 头 / 身体朝向（方案 B 先读朝向：胸牌位置要按它减回身体中心）
      r.gaze = camera ? this.cameraGaze(scene, p, r.gaze) : this.tagHeading(r, p, T);
      if (!(p.seated && p.seat !== null)) {
        const m = camera ? this.cameraPerson(scene, p) : this.tagPerson(scene, p, r.gaze);
        this.trackStep(r.track, m, T);
        this.s.pTick++;
        if (!m) this.s.pLost++;
        const ex = r.track.x - w.x;
        const ey = r.track.y - w.y;
        this.s.pErr += ex * ex + ey * ey;
        this.s.pN++;
      }
      const { vx, vy, v } = this.windowVel(r.track);
      const P = SENSE.proxy;
      const walking = !p.seated && v > tk.walk;
      if (walking) {
        r.lastDir = Math.atan2(vy, vx);
        r.stopT = 0;
      } else r.stopT += T;
      sw.x = r.track.x;
      sw.y = r.track.y;
      // 刚停下、正前方就是一条成墙的带：当他要过去
      const ask =
        this.cfg.proxies && !walking && !p.seated && r.stopT < P.stopAsk && sim.bandTouch(sw.x + Math.cos(r.lastDir) * P.askAt, sw.y + Math.sin(r.lastDir) * P.askAt, P.askR);
      sw.state = walking || ask ? 'walk' : 'idle';
      sw.speed = walking ? Math.min(1.6, Math.max(0.5, v)) : w.speed;
      sw.heading = walking || ask ? r.lastDir : r.gaze;
      sw.gaze = r.gaze;
      sw.route = (walking || ask) && this.cfg.proxies ? [{ x: sw.x + Math.cos(r.lastDir) * P.routeL, y: sw.y + Math.sin(r.lastDir) * P.routeL }] : [];
    }
    // 猫
    for (const r of this.cats) {
      const c = r.truth;
      const w = c.walker;
      const sw = r.over.walker;
      sw.present = w.present;
      if (!w.present) {
        r.wasPresent = false;
        r.track.init = false;
        continue;
      }
      if (!r.wasPresent) {
        r.track = newTrack(w.x, w.y, true);
        r.wasPresent = true;
      }
      const onTop = !!c.unit && !c.transfer;
      const m = camera ? this.cameraCat(scene, sim, c) : this.tagCat(scene, sim, c);
      if (camera) {
        if (onTop) {
          this.s.tTick++;
          if (!m) this.s.tLost++;
        } else if (!c.unit) {
          this.s.fTick++;
          if (!m) this.s.fLost++;
        }
      }
      if (!m && onTop) {
        // 称重：知道它在哪台上，看不见时位置取那台的中心（台上那几条带就整台护住）
        const u = c.unit!;
        if (Math.hypot(r.track.x - u.x, r.track.y - u.y) > l.platR) r.track = newTrack(u.x, u.y, true);
        else {
          r.track.vx = 0;
          r.track.vy = 0;
        }
      } else this.trackStep(r.track, m, T);
      const ex = r.track.x - w.x;
      const ey = r.track.y - w.y;
      this.s.cErr += ex * ex + ey * ey;
      this.s.cN++;
      const { vx, vy, v } = this.windowVel(r.track);
      const walking = v > tk.still;
      sw.x = r.track.x;
      sw.y = r.track.y;
      sw.state = walking ? 'walk' : 'sit';
      sw.heading = walking ? Math.atan2(vy, vx) : sw.heading;
      sw.gaze = sw.heading;
      sw.route = walking ? [{ x: sw.x + (vx / v) * SENSE.proxy.catRouteL, y: sw.y + (vy / v) * SENSE.proxy.catRouteL }] : [];
      if (this.cfg.proxies) this.catProxies(sim, r, T, !walking);
    }
    // 读到的「看着哪只猫」与「站定看着满几秒」
    for (const r of this.people) {
      const p = r.truth;
      if (!p.walker.present) continue;
      const sw = r.over.walker;
      let best: number | null = null;
      let bd: number = COHABIT.GAZE_D;
      for (const c of this.cats) {
        if (!c.truth.walker.present) continue;
        const cw = c.over.walker;
        const d = Math.hypot(cw.x - sw.x, cw.y - sw.y);
        if (d > bd) continue;
        if (Math.abs(wrapAngle(Math.atan2(cw.y - sw.y, cw.x - sw.x) - r.gaze)) > COHABIT.GAZE_HALF.person) continue;
        bd = d;
        best = c.truth.id;
      }
      const prev = r.over.watching ?? null;
      r.over.watching = best;
      const stillStanding = !p.seated && sw.state !== 'walk';
      if (stillStanding && best !== null && best === prev) r.over.watchFor = (r.over.watchFor ?? 0) + T;
      else if (stillStanding && best !== null) r.over.watchFor = T;
      else {
        r.over.watchFor = 0;
        r.over.offer = null;
        r.over.offered = false;
      }
    }
    this.scoreWatch(sim, T);
    if (this.cfg.proxies) this.scoreIntent(sim, T);
  }

  private trackStep(tr: Track, m: { x: number; y: number } | null, T: number): void {
    const tk = SENSE.track;
    const g = this.cfg.scheme === 'tag' ? tk.tag : tk.camera;
    if (!tr.init) {
      if (m) {
        tr.x = m.x;
        tr.y = m.y;
        tr.vx = 0;
        tr.vy = 0;
        tr.init = true;
      }
      return;
    }
    const px = tr.x + tr.vx * T;
    const py = tr.y + tr.vy * T;
    if (!m) {
      tr.x = px;
      tr.y = py;
      tr.vx *= tk.coastDecay;
      tr.vy *= tk.coastDecay;
      return;
    }
    const rx = m.x - px;
    const ry = m.y - py;
    tr.x = px + g.alpha * rx;
    tr.y = py + g.alpha * ry;
    tr.vx += (g.beta / T) * rx;
    tr.vy += (g.beta / T) * ry;
  }

  /** 估计位置这一秒的平均速度（不满一秒按滤波器的速度） */
  private windowVel(tr: Track): { vx: number; vy: number; v: number } {
    const W = SENSE.track.window;
    tr.hist.push({ t: this.t, x: tr.x, y: tr.y });
    while (tr.hist.length > 2 && tr.hist[1].t <= this.t - W) tr.hist.shift();
    const h = tr.hist[0];
    const span = this.t - h.t;
    if (span < W - 1e-6) return { vx: tr.vx, vy: tr.vy, v: Math.hypot(tr.vx, tr.vy) };
    const vx = (tr.x - h.x) / span;
    const vy = (tr.y - h.y) / span;
    return { vx, vy, v: Math.hypot(vx, vy) };
  }

  private noisy(x: number, y: number, sd: number): { x: number; y: number } {
    return { x: x + this.gauss() * sd, y: y + this.gauss() * sd };
  }

  private cameraPerson(scene: Scene, p: Visitor): { x: number; y: number } | null {
    const w = p.walker;
    const v = personView(scene, this.cams!, w.x, w.y, false, w.gaze, p.id);
    if (v.upper === 0) return null;
    const C = SENSE.camera;
    if (v.upper >= 2) return this.noisy(w.x, w.y, C.multi);
    if (v.feet) return this.noisy(w.x, w.y, C.ground);
    const cam = this.cams![v.first];
    const dep = Math.atan2(cam.z - SENSE_BODY.standPts[3], Math.hypot(w.x - cam.x, w.y - cam.y));
    return this.noisy(w.x, w.y, Math.min(C.maxSd, C.heightSd / Math.max(1e-3, Math.tan(dep))));
  }

  private cameraGaze(scene: Scene, p: Visitor, last: number): number {
    const w = p.walker;
    const v = personView(scene, this.cams!, w.x, w.y, p.seated, w.gaze, p.id);
    if (v.face > 0) return w.gaze + this.gauss() * SENSE.camera.faceSd;
    if (v.upper > 0) return w.heading + this.gauss() * SENSE.camera.bodySd;
    return last;
  }

  private cameraCat(scene: Scene, sim: CohabitSim, c: Cat): { x: number; y: number } | null {
    const w = c.walker;
    const base = this.catBase(sim, c);
    // 台上的猫在立体里绕着芯坐（cohabit-solid catPlacement），平面模型给的是台心：按它的朝向挪到芯外，免得算成被自己那台的芯挡住
    let x = w.x;
    let y = w.y;
    if (c.unit && Math.hypot(x - c.unit.x, y - c.unit.y) < sim.layout.mastR + SENSE_BODY.catR) {
      x = c.unit.x + Math.cos(w.heading) * (sim.layout.mastR + SENSE_BODY.catR);
      y = c.unit.y + Math.sin(w.heading) * (sim.layout.mastR + SENSE_BODY.catR);
    }
    const n = catView(scene, this.cams!, x, y, base);
    if (n === 0) return null;
    return this.noisy(w.x, w.y, n >= 2 ? SENSE.camera.multi : SENSE.camera.ground);
  }

  /** 猫此刻所在面的高度：地上 0、在家具上 = 家具顶面（floorSurface）；台上 = 那台的台面 */
  private catBase(sim: CohabitSim, c: Cat): number {
    if (!c.unit) return floorSurface(this.furn ?? [], c.walker.x, c.walker.y);
    const f = sim.tableBy[c.unit.i];
    const rects = sim.furn?.rects ?? [];
    return f >= 0 && rects[f] ? tableTopFor(rects[f]) : TABLE_TOP.stand;
  }

  /** 这一点能直视几个基站（只算人体挡：布、铝杆、家具对 UWB 按透过算） */
  private losCount(scene: Scene, x: number, y: number, z: number): number {
    let n = 0;
    for (const a of this.anchors!) if (!segBlocked(scene, a.x, a.y, a.z, x, y, z, -1, true)) n++;
    return n;
  }

  private tagSd(los: number): number {
    const B = SENSE.tag;
    return los >= 3 ? B.los3 : los === 2 ? B.los2 : B.los1;
  }

  /** 胸牌：戴在身体前表面外一点，背后的基站被自己的身体挡住；读到的胸牌位置按读到的朝向减回身体中心 */
  private tagPerson(scene: Scene, p: Visitor, heading: number): { x: number; y: number } {
    const w = p.walker;
    const B = SENSE.tag;
    const bx = w.x + Math.cos(w.heading) * B.badgeOffset;
    const by = w.y + Math.sin(w.heading) * B.badgeOffset;
    const m = this.noisy(bx, by, this.tagSd(this.losCount(scene, bx, by, p.seated ? B.seatChest : B.chest)));
    return { x: m.x - Math.cos(heading) * B.badgeOffset, y: m.y - Math.sin(heading) * B.badgeOffset };
  }

  private tagHeading(r: PersonRec, p: Visitor, T: number): number {
    const B = SENSE.tag;
    const a = Math.exp(-T / B.biasTau);
    r.bias = r.bias * a + B.biasSd * Math.sqrt(1 - a * a) * this.gauss();
    const turnSd = this.cfg.tagTurnSd ?? 0;
    if (turnSd > 0) {
      const b = Math.exp(-T / B.turnTau);
      r.turn = r.turn * b + turnSd * Math.sqrt(1 - b * b) * this.gauss();
    }
    // 胸牌读的是身体朝向（不是头）：模型里人看猫时身体跟着转，所以两者相同；人只转头时这里会偏，见 tagHeadingSd
    return p.walker.heading + r.bias + r.turn + this.gauss() * (this.cfg.tagHeadingSd ?? B.headingSd);
  }

  private tagCat(scene: Scene, sim: CohabitSim, c: Cat): { x: number; y: number } {
    const w = c.walker;
    const los = this.losCount(scene, w.x, w.y, this.catBase(sim, c) + SENSE.tag.collar);
    // 项圈离人腿近、离地近，非视距更多：误差按同样三档
    return this.noisy(w.x, w.y, this.tagSd(los));
  }

  // ── 读不到的意图换成看得见的量 ──
  private catProxies(sim: CohabitSim, r: CatRec, T: number, still: boolean): void {
    const c = r.truth;
    const sw = r.over.walker;
    const P = SENSE.proxy;
    // 想跳上哪台：地上的猫在某台正下方停住
    if (!c.unit && still) r.still += T;
    else r.still = 0;
    r.over.climb = null;
    if (!c.unit && r.still >= P.climbStill) {
      let best: (typeof sim.layout.units)[number] | null = null;
      let bd: number = P.climbR;
      for (const u of sim.layout.units) {
        const d = Math.hypot(u.x - sw.x, u.y - sw.y);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
      if (best) r.over.climb = { unit: best, need: 0, wait: 0 };
    }
    // 潜伏期：看见它刚从一个人身边走开
    let dn = Infinity;
    for (const q of this.people) {
      if (!q.truth.walker.present) continue;
      dn = Math.min(dn, Math.hypot(q.over.walker.x - sw.x, q.over.walker.y - sw.y));
    }
    r.hist.push({ t: this.t, d: dn, x: sw.x, y: sw.y });
    while (r.hist.length > 2 && r.hist[1].t <= this.t - P.retreatLook) r.hist.shift();
    const h0 = r.hist[0];
    if (h0 && this.t - h0.t >= P.retreatLook - 1e-6 && h0.d < COHABIT.CAT_NEAR && dn > h0.d + P.retreatGain && Math.hypot(sw.x - h0.x, sw.y - h0.y) > P.retreatMove) r.retreatAt = this.t;
    r.over.latency = Math.max(0, sim.cat.latency - (this.t - r.retreatAt));
    r.over.pending = null;
  }

  private scoreIntent(sim: CohabitSim, T: number): void {
    void sim;
    for (const r of this.cats) {
      if (!r.truth.walker.present) continue;
      const truth = r.truth.climb ? r.truth.climb.unit.i : -1;
      const seen = r.over.climb ? r.over.climb.unit.i : -1;
      if (truth >= 0 && seen === truth) this.s.cHit += T;
      else {
        if (seen >= 0) this.s.cFalse += T;
        if (truth >= 0) this.s.cMiss += T;
      }
    }
  }

  private scoreWatch(sim: CohabitSim, T: number): void {
    for (const r of this.people) {
      const p = r.truth;
      const w = p.walker;
      if (!w.present || (!p.seated && (w.state === 'walk' || p.moving))) continue;
      // 真值：在看的那只猫在 3 m 内、视线 ±25° 以内
      let truth: number | null = null;
      if (p.watching !== null) {
        const c = sim.cats.find((k) => k.id === p.watching);
        if (c && Math.hypot(c.walker.x - w.x, c.walker.y - w.y) <= COHABIT.GAZE_D && Math.abs(wrapAngle(Math.atan2(c.walker.y - w.y, c.walker.x - w.x) - w.gaze)) <= COHABIT.GAZE_HALF.person) truth = c.id;
      }
      const seen = r.over.watching ?? null;
      if (truth !== null && seen === truth) this.s.wHit += T;
      else {
        if (seen !== null) this.s.wFalse += T;
        if (truth !== null) this.s.wMiss += T;
      }
    }
  }
}

/** 一种读法的感知层（observe 的 rate 取每一步；方案 A / B 10 次/秒） */
export function makeSense(scheme: SenseScheme, opts: Omit<SenseCfg, 'scheme'> = {}): CohabitSense {
  return new CohabitSense({ scheme, ...opts });
}
