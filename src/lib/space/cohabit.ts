/**
 * 项目二 · 人猫同台（Lab 2-14，2026-10-06 开工：待办第一步 1–3 + 第二步 4–5 —— 两种代价 · 五条规则 ·
 * 四类相遇事件 · 人与猫在同一间房、同一片单元）——纯模型零 DOM。
 *
 * 这台把此前分开的两台接到一起：2-11 的访客（地面走、视野留痕迹、让位）与 2-12 的住户猫（住在单元上、
 * 脚下钉住、下一落点先成形）共用**同一个痕迹读数与同一组单元**。机制一个数不改——痕迹 / 读法 / 响应 /
 * 行走 / 让位全部引用 unit-activation（同一份 TraceField / Catchment / Activation / Walker）。
 * 这里新写的是**规则层**（项目二_空间规则草案.md §3 §4 §6，作者 2026-10-04 / 10-06 拍板）：
 *
 *   通行代价（§3.1，两档）：程度 ≥ WALL_AT 的单元对人 = 墙，只能绕；对猫不是障碍（猫在单元上活动）。
 *     人沿过道图走（格线交叉点为节点），BFS 绕开墙。
 *   停留代价（§3.2）：人对人——站着时另一访客进到陌生人距离 1.35 m 以内就走（42 国调查，日志 2026-07-27）；
 *     猫对人——最近访客 < 1 m 算代价 1（Mertens & Turner 1988 的 1 m 档，日志 2026-07-28），能忍 TOLERATE 秒，
 *     超过就退到离人最远的邻格，之后 LATENCY 秒内不再选靠人的落点（C1/C6 潜伏期的演示值）；
 *     有人站着盯着它看（专注驻留）时，按 APPROACH_P 的几率走到台面边缘靠近那个人（1/3 取自
 *     M&T「人主动互动时接触占三分之一」——**是时间占比不是概率，这里当演示映射用，标推断**）。
 *   五条规则（§4）：R1 空间只写单元状态；R2 个体只读两个代价；R3 去向是个体自己选的；R4 目的只按
 *     四类事件评；R5 谁都不被困住——要成墙的单元若切断任一在场访客到任一门的路，就钉在墙线以下不落。
 *   空间的目的（§6 第 1 条，促成人猫相遇，**建议写法、待作者过目**）：对每只猫，它的四邻里人的痕迹读数
 *     最高的那一格由空间补满读数——把猫能走的路铺向人多的地方；去不去仍是猫的事（R3）。
 *   四类相遇事件（正文「交互事件的形式化定义」）：共视 = 双方互相看着对方（站方口径：各自视线对准对方
 *     ±GAZE_HALF，≤ GAZE_D，持续 ≥ 1 s）· 共温 = 一方在另一方 0.5–1.5 m 带内停留 ≥ 2 s 无接触 ·
 *     共触 = 距离 < 0.5 m（舒适带的内缘，升级态）· 交接 = 一方走着穿过另一方的 1.5 m 身体域。
 *     空事件要「招引」这个动作，人的行为预设里没有，**不记**。
 *
 * 三档「空间」给对照（待办第 6 条）：live 会动 · fixed 钉死（隔行落下，连通性不受影响）· empty 空房间
 *   （没有单元，猫在地面走）。基准钉哪个形态直接影响结论，这里写明：fixed = 偶数行全落。
 *
 * 演示装置不是行为规则：访客的漫步（随机目标 + 站 8–45 s + 一半几率去看猫）、猫的节奏（坐 3 s / 卧 18 s）
 * 与各个秒数常量都是演示值，带种子逐位可复现（守门用）。
 *
 * 触发两档（作者 2026-10-07：「以可以坐的地方作为据点，人有行走、站定、坐着的状态区别，行走不触发，坐着
 * 全力触发，站定按条件部分触发……引导的重心放在猫身上」+「先以 8×8 设计，座位不贴墙、摆在空间中间」）：
 *   trace 痕迹（旧口径，模块默认 ⇒ 守门与对照逐位不变）：视野留痕迹，单元跟痕迹，S2 把猫的路铺向人多处。
 *   posture 座位三态（台架默认）：房间里摆四件家具（COHABIT.SEATS），家具上方不放单元；人**走着不触发**、
 *     **站定**（停住满 3 s 且看着一只猫）空间朝他给猫铺**一步**、**坐着**空间从最近一只猫脚下一步一步铺到
 *     这个座位的会面台（离座位 1.0–1.5 m 的那台 = 猫不付停留代价、又在共温带里）。地面不再留痕迹。
 *     猫仍自己决定走不走（R3）：它优先走空间递过来的那一台（坐满 3 s 就可能挪过去），不走就照旧卧着。
 */
import { RING } from './skin-ring';
import {
  Activation,
  PLAN,
  TraceField,
  Walker,
  blockedUnits,
  buildCatchment,
  keepOut,
  nearestUnit,
  planLayout,
  unitInputs,
  wrapAngle,
  type Catchment,
  type PlanLayout,
  type PlanUnit,
  type Reading,
  type ResponseMode,
} from './unit-activation';
import { makeRng } from './crowd-plan';
import { CAT_DEMO } from './cat-rules';

export type SpaceMode = 'live' | 'fixed' | 'empty';
export const SPACE_MODES = [
  { key: 'live', zh: '会动的单元', en: 'Live units' },
  { key: 'fixed', zh: '单元钉死', en: 'Fixed units' },
  { key: 'empty', zh: '空房间', en: 'Empty room' },
] as const satisfies readonly { key: SpaceMode; zh: string; en: string }[];

/** 让路两档（台架控件与差分清单同源）：按带 = COHABIT.FACES；整台 = 2-11 的让位闸（旧口径） */
export type FaceMode = 'bands' | 'whole';
export const FACE_MODES = [
  { key: 'bands', zh: '按带', en: 'by band' },
  { key: 'whole', zh: '整台', en: 'whole unit' },
] as const satisfies readonly { key: FaceMode; zh: string; en: string }[];

/** 触发两档（台架「规则」开关与差分清单同源）：座位三态 = COHABIT.SEATS；痕迹 = 旧口径（模块默认） */
export type TriggerMode = 'posture' | 'trace';
export const TRIGGER_MODES = [
  { key: 'posture', zh: '座位三态', en: 'Seats, three postures' },
  { key: 'trace', zh: '痕迹（旧）', en: 'Trace (earlier)' },
] as const satisfies readonly { key: TriggerMode; zh: string; en: string }[];

export type EventKind = 'gaze' | 'warmth' | 'touch' | 'pass';
export const EVENT_KINDS = [
  { key: 'gaze', zh: '共视', en: 'Co-gaze' },
  { key: 'warmth', zh: '共温', en: 'Co-warmth' },
  { key: 'touch', zh: '共触', en: 'Contact' },
  { key: 'pass', zh: '交接', en: 'Crossing' },
] as const satisfies readonly { key: EventKind; zh: string; en: string }[];

export const COHABIT = {
  /** 2-8 那间、4×4 真实单元（待办第 4 条） */
  GRID_DEF: 4,
  MAX_PEOPLE: 6,
  MAX_CATS: 3,
  /** 人对人的三档距离（m）：42 国近体距离调查（日志 2026-07-27）；猫咖访客彼此是陌生人 ⇒ 用 stranger */
  PERSON_D: { stranger: 1.35, familiar: 0.92, close: 0.32 },
  /** 猫对人：Mertens & Turner 1988 的 1 m 档（日志 2026-07-28）；0.78 是「人不理猫时猫在 1 m 外的时间占比」，
   *  只当 HUD 的参照读数，**不进规则** */
  CAT_NEAR: 1.0,
  CAT_FAR_SHARE_REF: 0.78,
  /** 舒适带（正文「共温」0.5–1.5 m）；< near = 接触 */
  BAND: { near: 0.5, far: 1.5 },
  /** 共视口径（站方）：距离上限、人与猫各自视线对准对方的半角 */
  GAZE_D: 3.0,
  GAZE_HALF: { person: (25 * Math.PI) / 180, cat: (35 * Math.PI) / 180 },
  /** 事件最短持续（s）：共视 1、共温 2 */
  MIN_S: { gaze: 1, warmth: 2 },
  /** 单元程度 ≥ 这个值对人算墙（演示值；规则草案 §3.1 待定项，建议与成形同一阈值 ⇒ 这里取一半） */
  WALL_AT: 0.5,
  /** 猫（演示值，除 bodyR / 速度取 Lab 2-12 的既有数） */
  CAT: {
    bodyR: 0.14,
    speed: CAT_DEMO.walkSpeed,
    prepare: 1,
    /** 代价 1 能忍多久（s）：没人理 / 有人在看着它 */
    tolerate: 6,
    tolerateAttended: 14,
    /** 退开后多久不再选靠人的落点（s）——C1/C6 潜伏期的演示值 */
    latency: 15,
    /** 有人专注驻留时，猫靠过去的几率（M&T 1/3，推断） */
    approachP: 1 / 3,
    /** 坐 / 卧（Lab 2-12 演示值） */
    sit: CAT_DEMO.sitSeconds,
    lie: CAT_DEMO.lieSeconds,
    /** 卧完有多大几率换一格（演示值） */
    roamP: 0.5,
    /** 等落点成形最多等多久（s），空间不给就另选 */
    waitMax: 10,
  },
  /** 访客（演示值，步速与站立时长取 Lab 2-11） */
  VISITOR: {
    speed: 0.7,
    pause: { min: 8, max: 45 },
    /** 下一站有多大几率去看猫（猫咖访客是来看猫的） */
    toCatP: 0.5,
    /** 看猫站多久（s） */
    watch: { min: 10, max: 30 },
    /** 别人进到 1.35 m 以内要持续这么久才走（s；「上升的快慢」草案待定，演示值） */
    crowdS: 2,
  },
  /**
   * 按带让路（作者 2026-10-07「人从两个单元之间穿过，只收相对的两个面就够了」+「松键之后多余的布可以往上去，
   * 就像它还没成型之前那样」= 引擎的按带回程 `retractStep(1.0)`，布沿杆收直、挑出回到芯半径）：
   * 一个单元 BANDS 条带（与圆筒环同 20 条、18° 一条），**挡在人身边或人路上的带各自收回到芯上，其余照落**；
   * 猫身下的带不收。让位从「整台落不落」变成「这一条带落不落」，R5 从「不许落」变成「开一道门」。
   * 模块默认关（守门与对照的旧口径逐位不变），台架默认开。
   */
  FACES: {
    BANDS: 20,
    /** 收回 / 落回的速率（程度 / 秒）：与单元跟随档同一对数——收回 = 放、落回 = 收（回程快慢作者 10-06「不纠结」） */
    open: PLAN.RESPONSE.fall,
    close: PLAN.RESPONSE.rise,
    /** 沿路线提前开门：路程 = 步速 × 收回时长 + 这个余量（m）——人走到门口门正好开 */
    ahead: 0.5,
    /** 猫身周围再多护住的距离（m）：猫身下与它要去的那几条带不收 */
    catMargin: 0.1,
    /** 门没开就在门口等；等超过这么久（s）就另选路（猫可能在计划之后坐到了门上） */
    waitMax: 4,
  },
  /**
   * 座位三态（触发档 posture，作者 2026-10-07）。家具是**独立的一层**（作者同日纠正「不会因为座椅摆在那，那边的
   * 单元就被取消掉」）：单元照常挂在家具上方，家具只挡地面上的人走；有人坐下时，平台盖到他头顶的那几台不落
   * （平台底离地 1.08 m，低于坐着的头顶 ≈1.25 m）。家具可以加减、拖动；下面这套是**标准布置**——摆在房间中间、
   * 不贴墙，像真实猫咖的散座：四件分在四个象限、点对称，两扇门之间那条横向过道留空。座位三态只在 8×8 下用
   * （4×4 的一台平台 ⌀1.04 m，一张沙发底下就压着一整台）。
   */
  SEATS: {
    GRID: 8,
    /** 标准布置：at = 8×8 过道格距的倍数（房间中心为原点，y 向下），face = 坐着的人朝哪。
     *  进深方向多挪 0.1 格：前缘离前一排过道交叉点 0.27 m（≥ 身体半径 0.22），人能站到座位跟前再坐下 */
    FURNITURE: [
      { kind: 'sofa', at: [-2, -2.1], face: [0, 1] },
      { kind: 'chair', at: [2, -2.1], face: [0, 1] },
      { kind: 'sofa', at: [2, 2.1], face: [0, -1] },
      { kind: 'chair', at: [-2, 2.1], face: [0, -1] },
    ],
    /** 尺寸（m）：w 沿宽、d 进深；seats = 座位离中线的偏移；座位点 = 家具中心往前 SEAT_IN（坐着的人身体中心） */
    KINDS: {
      sofa: { w: 1.4, d: 0.8, seats: [-0.35, 0.35] },
      chair: { w: 0.75, d: 0.75, seats: [0] },
    },
    SEAT_IN: 0.1,
    /** 家具离墙、彼此之间至少留多远（m） */
    GAP: 0.05,
    /** 站定的部分触发：停住满这么久（s）、且看着一只猫（≤ GAZE_D、视线 ±GAZE_HALF.person）⇒ 空间朝这个人给猫铺一步 */
    STAND_S: 3,
    /** 漫步时选座的几率（有空座时；演示值） */
    SIT_P: 0.5,
    /** 坐多久（s；演示值） */
    SIT: { min: 90, max: 240 },
  },
  /** 一开场放谁（场地坐标按 pitch4 的倍数；猫按单元下标） */
  OPENING: { people: [{ x: 0, y: 1 }], cats: [0] },
} as const;

const BANDS = COHABIT.FACES.BANDS;
/** 第 j 条带的中心方位角（弧度，房间坐标）——与圆筒环的带序同向 */
export function bandAngle(j: number): number {
  return ((j + 0.5) * 2 * Math.PI) / BANDS;
}
/** 点到线段的距离 */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const L2 = vx * vx + vy * vy;
  const t = L2 > 1e-12 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** 每条边的通行条件：空余宽度 ≥ 一个身体直径 */
const BODY_W = PLAN.BODY_R * 2;
const MAX_SUB_DT = 0.05;

// ── 过道图：格线交叉点为节点，门为两个附加节点 ───────────────────────────────

// ── 家具（座位三态）──────────────────────────────────────────────────────────

export type FurnKind = keyof typeof COHABIT.SEATS.KINDS;

/** 一件家具：种类、中心（m，房间坐标）、坐着的人朝哪 */
export interface FurnSpec {
  kind: FurnKind;
  x: number;
  y: number;
  face: readonly [number, number];
}

export interface FurnRect {
  kind: FurnKind;
  cx: number;
  cy: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  face: readonly [number, number];
}

/** 房间里的家具：rects = 地面上的占位；nodeOff = 这个交叉点站不了人（在家具里）。家具上方的单元照常在（独立一层） */
export interface Furnishing {
  rects: FurnRect[];
  nodeOff: Uint8Array;
}

export interface Seat {
  i: number;
  /** 属于哪件家具、是它的第几个座位 */
  furn: number;
  slot: number;
  /** 座位点（坐着的人的身体中心） */
  x: number;
  y: number;
  face: readonly [number, number];
  /** 入口：座位跟前那个交叉点（坐下前站这儿、起身后从这儿走；R5 按它判） */
  node: number;
  /** 会面台：坐着的人面前、离座位 CAT_NEAR–BAND.far 的那台（猫在台面中心不付停留代价、又在共温带里） */
  meet: number;
}

/** 点到轴对齐矩形的距离 */
function rectDist(r: FurnRect, x: number, y: number): number {
  return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1));
}
/** 轴对齐线段（过道边）到矩形的距离 = 两个盒子之间的距离 */
function segRectDist(r: FurnRect, ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.max(0, r.x0 - Math.max(ax, bx), Math.min(ax, bx) - r.x1);
  const dy = Math.max(0, r.y0 - Math.max(ay, by), Math.min(ay, by) - r.y1);
  return Math.hypot(dx, dy);
}

/** 一件家具在地面上的占位 */
export function furnRect(f: FurnSpec): FurnRect {
  const k = COHABIT.SEATS.KINDS[f.kind];
  const alongX = f.face[0] === 0; // 面朝 ±y ⇒ 宽沿 x
  const hw = (alongX ? k.w : k.d) / 2;
  const hd = (alongX ? k.d : k.w) / 2;
  return { kind: f.kind, cx: f.x, cy: f.y, x0: f.x - hw, x1: f.x + hw, y0: f.y - hd, y1: f.y + hd, face: f.face };
}

/** 标准布置（COHABIT.SEATS.FURNITURE，位置按 8×8 格距的米数——换格数家具不跟着缩） */
export function standardFurniture(l: PlanLayout): FurnSpec[] {
  const p8 = l.fieldM / (COHABIT.SEATS.GRID - 1 + (2 * l.platR) / l.pitchM);
  return COHABIT.SEATS.FURNITURE.map((f) => ({ kind: f.kind, x: f.at[0] * p8, y: f.at[1] * p8, face: f.face }));
}

export function furnishRoom(l: PlanLayout, specs: readonly FurnSpec[] = standardFurniture(l)): Furnishing {
  const rects = specs.map(furnRect);
  const near = (x: number, y: number) => (rects.length ? Math.min(...rects.map((r) => rectDist(r, x, y))) : Infinity);
  const n = l.n;
  const nodeOff = new Uint8Array((n + 1) * (n + 1));
  for (let r = 0; r <= n; r++)
    for (let c = 0; c <= n; c++) nodeOff[r * (n + 1) + c] = near((c - n / 2) * l.pitchM, (r - n / 2) * l.pitchM) < PLAN.BODY_R ? 1 : 0;
  return { rects, nodeOff };
}

export interface AisleGraph {
  n: number;
  /** 交叉点坐标 (c,r) → 下标 r·(n+1)+c；门在最后两个 */
  nodes: { x: number; y: number }[];
  door: [number, number];
  /** 邻接：每条边 [a, b, 两侧单元下标（−1 = 房间墙）] */
  edges: { a: number; b: number; sideA: number; sideB: number }[];
  adj: number[][];
  /** 家具（座位三态；省略 = 空房间，旧口径逐位不变） */
  furn?: Furnishing;
}

export function aisleGraph(l: PlanLayout, furn?: Furnishing): AisleGraph {
  const n = l.n;
  const p = l.pitchM;
  const nodes: { x: number; y: number }[] = [];
  for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) nodes.push({ x: (c - n / 2) * p, y: (r - n / 2) * p });
  const id = (c: number, r: number) => r * (n + 1) + c;
  const unit = (c: number, r: number) => (c >= 0 && c < n && r >= 0 && r < n ? r * n + c : -1);
  const edges: AisleGraph['edges'] = [];
  for (let r = 0; r <= n; r++)
    for (let c = 0; c < n; c++) edges.push({ a: id(c, r), b: id(c + 1, r), sideA: unit(c, r - 1), sideB: unit(c, r) });
  for (let r = 0; r < n; r++)
    for (let c = 0; c <= n; c++) edges.push({ a: id(c, r), b: id(c, r + 1), sideA: unit(c - 1, r), sideB: unit(c, r) });
  // 门：左右墙正中，接到最靠近 y=0 的外侧交叉点；门道在外侧线之外，没有单元夹它
  const rMid = Math.round(n / 2);
  const left = nodes.length;
  nodes.push({ x: -l.roomM / 2, y: 0 });
  nodes.push({ x: l.roomM / 2, y: 0 });
  edges.push({ a: left, b: id(0, rMid), sideA: -1, sideB: -1 });
  edges.push({ a: left + 1, b: id(n, rMid), sideA: -1, sideB: -1 });
  const adj: number[][] = nodes.map(() => []);
  edges.forEach((e, k) => {
    adj[e.a].push(k);
    adj[e.b].push(k);
  });
  return furn ? { n, nodes, door: [left, left + 1], edges, adj, furn } : { n, nodes, door: [left, left + 1], edges, adj };
}

/**
 * 一条边两侧各留多少空：单元那一侧 = 半格距 − 障碍半径（墙 = 平台、没落 = 芯）；房间墙那一侧 = 外侧线到墙的距离。
 * 给了 `bandWall`（按带让路：每单元 BANDS 条带各自是不是墙）就按带算——朝这条边的每条墙带外缘点在边法向上的
 * 投影取最大（平台半径 × cos(带向 − 边法向)），没有墙带时只剩芯；收回的带不挡。
 */
function sideClear(l: PlanLayout, u: number, wall: Uint8Array | null, bandWall: Uint8Array | null, mx: number, my: number): number {
  if (u < 0) return l.roomM / 2 - (l.n / 2) * l.pitchM;
  if (!bandWall) {
    const r = wall && wall[u] ? l.platR : l.mastR;
    return l.pitchM / 2 - r;
  }
  const c = l.units[u];
  const phi = Math.atan2(my - c.y, mx - c.x);
  let r = l.mastR;
  for (let j = 0; j < BANDS; j++) {
    if (!bandWall[u * BANDS + j]) continue;
    const cs = Math.cos(bandAngle(j) - phi);
    if (cs > 0) r = Math.max(r, l.platR * cs);
  }
  return l.pitchM / 2 - r;
}

/** 这条边人能不能过：两侧空余之和 ≥ 身体直径。`bandWall` 给了就按带算（见 sideClear）。
 *  有家具时：端点站不了人的边不通；每件家具按它在边的哪一侧，把那一侧的空余封顶到「边到家具的距离」 */
export function edgeOpen(l: PlanLayout, g: AisleGraph, k: number, wall: Uint8Array | null, bandWall: Uint8Array | null = null): boolean {
  const e = g.edges[k];
  if (e.sideA === -1 && e.sideB === -1 && e.a >= g.door[0]) return true; // 门道
  const A = g.nodes[e.a];
  const B = g.nodes[e.b];
  const mx = (A.x + B.x) / 2;
  const my = (A.y + B.y) / 2;
  const f = g.furn;
  let ca = sideClear(l, e.sideA, wall, bandWall, mx, my);
  let cb = sideClear(l, e.sideB, wall, bandWall, mx, my);
  if (f) {
    if (f.nodeOff[e.a] || f.nodeOff[e.b]) return false;
    // A 侧 = 坐标小的一侧（横边 = 上方 −y、竖边 = 左方 −x）
    const alongX = Math.abs(B.x - A.x) > Math.abs(B.y - A.y);
    for (const r of f.rects) {
      const d = segRectDist(r, A.x, A.y, B.x, B.y);
      if ((alongX ? r.cy - my : r.cx - mx) < 0) ca = Math.min(ca, d);
      else cb = Math.min(cb, d);
    }
  }
  return ca + cb >= BODY_W - 1e-9;
}

/** 离 (x,y) 最近的交叉点（不含门；有家具时跳过站不了人的） */
export function nearestNode(g: AisleGraph, x: number, y: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < g.door[0]; i++) {
    if (g.furn && g.furn.nodeOff[i]) continue;
    const d = Math.hypot(g.nodes[i].x - x, g.nodes[i].y - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** BFS：从 from 到 goals 里任一节点的最短路（节点序列，含两端）；不通 = null。
 *  `avoid`（可省）：站不了人的交叉点（起点除外）——按带让路下被猫护住的带伸到交叉点身体半径以内 */
export function shortestPath(l: PlanLayout, g: AisleGraph, from: number, goals: ReadonlySet<number>, wall: Uint8Array | null, bandWall: Uint8Array | null = null, avoid: Uint8Array | null = null): number[] | null {
  if (goals.has(from)) return [from];
  const prev = new Int32Array(g.nodes.length).fill(-1);
  const seen = new Uint8Array(g.nodes.length);
  const q: number[] = [from];
  seen[from] = 1;
  for (let h = 0; h < q.length; h++) {
    const v = q[h];
    for (const k of g.adj[v]) {
      if (!edgeOpen(l, g, k, wall, bandWall)) continue;
      const e = g.edges[k];
      const w = e.a === v ? e.b : e.a;
      if (seen[w] || (avoid && avoid[w])) continue;
      seen[w] = 1;
      prev[w] = v;
      if (goals.has(w)) {
        const path = [w];
        let cur = w;
        while (cur !== from) {
          cur = prev[cur];
          path.push(cur);
        }
        return path.reverse();
      }
      q.push(w);
    }
  }
  return null;
}

/** R5：这组墙之下，每个在场访客都还有路到某扇门 */
export function everyoneHasExit(l: PlanLayout, g: AisleGraph, people: readonly { x: number; y: number; present: boolean }[], wall: Uint8Array, bandWall: Uint8Array | null = null): boolean {
  const doors = new Set(g.door);
  for (const p of people) {
    if (!p.present) continue;
    if (!shortestPath(l, g, nearestNode(g, p.x, p.y), doors, wall, bandWall)) return false;
  }
  return true;
}

/** 从门出发、这组墙之下能走到的交叉点 */
export function doorReach(l: PlanLayout, g: AisleGraph, wall: Uint8Array | null, bandWall: Uint8Array | null = null): Uint8Array {
  const seen = new Uint8Array(g.nodes.length);
  const q: number[] = [...g.door];
  for (const d of g.door) seen[d] = 1;
  for (let h = 0; h < q.length; h++) {
    const v = q[h];
    for (const k of g.adj[v]) {
      if (!edgeOpen(l, g, k, wall, bandWall)) continue;
      const e = g.edges[k];
      const w = e.a === v ? e.b : e.a;
      if (seen[w]) continue;
      seen[w] = 1;
      q.push(w);
    }
  }
  return seen;
}

/**
 * 座位：沙发两个、椅子一个。入口 = 门可达、能站人的交叉点里离「座位 + 朝向·0.6 m」最近的那个。
 * 会面台 = 坐着的人**面前**（朝向那一侧）、离座位 CAT_NEAR–BAND.far（1.0–1.5 m）最近的一台——猫卧在台面中心
 * 不付停留代价、又落在共温带里；不取入口四角那几台（整台让路下它一落就堵住坐着的人自己的出口）；等距取离
 * 房间中心近的；一台都没有就取面前最近的，再没有取最近的。
 */
export function placeSeats(l: PlanLayout, g: AisleGraph): Seat[] {
  const f = g.furn;
  if (!f) return [];
  const reach = doorReach(l, g, null);
  const S = COHABIT.SEATS;
  const seats: Seat[] = [];
  f.rects.forEach((r, fi) => {
    const tx = -r.face[1];
    const ty = r.face[0];
    S.KINDS[r.kind].seats.forEach((o, slot) => {
      const x = r.cx + tx * o + r.face[0] * S.SEAT_IN;
      const y = r.cy + ty * o + r.face[1] * S.SEAT_IN;
      const gx = x + r.face[0] * 0.6;
      const gy = y + r.face[1] * 0.6;
      let node = -1;
      let bd = Infinity;
      for (let i = 0; i < g.door[0]; i++) {
        if (f.nodeOff[i] || !reach[i]) continue;
        const d = Math.hypot(g.nodes[i].x - gx, g.nodes[i].y - gy);
        if (d < bd) {
          bd = d;
          node = i;
        }
      }
      const fn = g.nodes[node];
      const corner = (u: PlanUnit) => Math.abs(u.x - fn.x) < l.pitchM * 0.75 && Math.abs(u.y - fn.y) < l.pitchM * 0.75;
      const cand = l.units
        .map((u) => ({ u, d: Math.hypot(u.x - x, u.y - y), c: Math.hypot(u.x, u.y), front: (u.x - x) * r.face[0] + (u.y - y) * r.face[1] > 0 }))
        .sort((a, b) => Math.round(a.d * 1e6) - Math.round(b.d * 1e6) || a.c - b.c);
      const pick =
        cand.find((q) => q.front && q.d >= COHABIT.CAT_NEAR && q.d < COHABIT.BAND.far && !corner(q.u)) ??
        cand.find((q) => q.front && q.d >= COHABIT.CAT_NEAR) ??
        cand[0];
      seats.push({ i: seats.length, furn: fi, slot, x, y, face: r.face, node, meet: pick.u.i });
    });
  });
  return seats;
}

// ── 身体 ─────────────────────────────────────────────────────────────────────

export type BodyMode = 'auto' | 'held' | 'manual';

export interface Visitor {
  id: number;
  walker: Walker;
  mode: BodyMode;
  lastX: number;
  lastY: number;
  moving: boolean;
  /** 站着的倒计时（s） */
  pause: number;
  /** 正在看的猫（专注驻留）；null = 没在看 */
  watching: number | null;
  /** 这一程的起点与直线距离（算绕行用） */
  legFrom: { x: number; y: number } | null;
  legPath: number;
  /** 别人进到 1.35 m 以内持续了多久（s）——停留代价要撑过 CROWD_S 才算（演示值） */
  crowdedFor: number;
  /** 在还没开的门口等了多久（s，按带让路） */
  waitFor: number;
  /** 累计：走过的路程里，比直线多走的部分（m） */
  detour: number;
  straight: number;
  /** 座位三态：要去 / 正坐着的座位（null = 不坐）；是否已经坐下；累计坐了多久（s） */
  seat: number | null;
  seated: boolean;
  seatedTime: number;
  /** 站定看着一只猫持续了多久（s）——满 STAND_S 空间给一步 */
  watchFor: number;
  /** 这次站定空间递出的那一步（猫从 from 到 unit）；offered = 这次站定已经给过了（只给一次） */
  offer: { cat: number; from: number; unit: number } | null;
  offered: boolean;
}

/** 空间此刻为谁给哪只猫铺的路（画虚线用）：sit = 坐着（一路铺到会面台）、stand = 站定（只一步） */
export interface Guide {
  kind: 'sit' | 'stand';
  person: number;
  cat: number;
  /** 单元下标序列：猫脚下 → … → 目标 */
  path: number[];
}

export type CatState = 'sit' | 'lie' | 'walk' | 'approach' | 'retreat' | 'wait' | 'held';

export interface Cat {
  id: number;
  walker: Walker;
  mode: BodyMode;
  /** 脚下单元（空房间档为 null：猫在地面） */
  unit: PlanUnit | null;
  /** 下一落点（等它成形） */
  pending: PlanUnit | null;
  /** 转移中：起落两台都维持展开 */
  transfer: { from: PlanUnit; to: PlanUnit } | null;
  state: CatState;
  phaseTime: number;
  /** 代价 1 已经忍了多久（s） */
  tolerated: number;
  /** 退开后的潜伏倒计时（s） */
  latency: number;
  /** 等落点成形等了多久（s） */
  waited: number;
  /** 正在靠近的访客 */
  approaching: number | null;
  /** 统计：最近访客 > 1 m 的时长、在场时长、在一格上安稳待着的时长 */
  farTime: number;
  presentTime: number;
  settledTime: number;
  transfers: number;
}

export interface Ledger {
  counts: Record<EventKind, number>;
  seconds: Record<EventKind, number>;
}

interface PairState {
  active: Record<EventKind, boolean>;
  hold: Record<EventKind, number>;
}

export interface Link {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: EventKind;
}

function emptyLedger(): Ledger {
  return { counts: { gaze: 0, warmth: 0, touch: 0, pass: 0 }, seconds: { gaze: 0, warmth: 0, touch: 0, pass: 0 } };
}

export interface CohabitOpts {
  grid?: number;
  radius?: number;
  space?: SpaceMode;
  reading?: Reading;
  reach?: number;
  threshold?: number;
  fade?: number | null;
  decay?: number;
  mode?: ResponseMode;
  fov?: number;
  clearance?: number | null;
  lane?: boolean;
  look?: boolean;
  fill?: number;
  seed?: number;
  /** 一开场放不放人 / 猫（默认按 OPENING） */
  opening?: boolean;
  auto?: boolean;
  /** 空间的目的「促成相遇」规则开关（默认开；关 = 单元只跟痕迹） */
  goal?: boolean;
  /** 按带让路（COHABIT.FACES）；默认关 = 整台让位的旧口径 */
  faces?: boolean;
  /** 触发档（默认 trace = 旧口径；posture = 座位三态，格数默认随之取 COHABIT.SEATS.GRID） */
  trigger?: TriggerMode;
}

export class CohabitSim {
  readonly layout: PlanLayout;
  readonly graph: AisleGraph;
  /** 人的痕迹（视野内落地） */
  readonly field: TraceField;
  /** 猫的台面痕迹（脚下单元） */
  readonly catField: TraceField;
  readonly act: Activation;
  catchment: Catchment;
  catCatchment: Catchment;
  space: SpaceMode;
  people: Visitor[] = [];
  cats: Cat[] = [];
  ledger: Ledger = emptyLedger();
  /** 此刻各对之间正在发生的事件（画线用） */
  links: Link[] = [];
  reach: number;
  decay: number;
  fade: number | null;
  fov: number;
  clearance: number | null;
  lane: boolean;
  look: boolean;
  auto: boolean;
  goal: boolean;
  speed: number;
  readonly blocked: Uint8Array;
  /** 程度 ≥ WALL_AT：对人是墙 */
  readonly wall: Uint8Array;
  /** 被 R5 钉在墙线以下的单元（想落、落了会困住人） */
  readonly heldR5: Uint8Array;
  /** 按带让路（faces）：每单元 BANDS 条带各自的收回程度 0–1（1 = 收直到芯上）、本步被请求、猫身下不许收、此刻是墙、
   *  开不了的墙（猫身下 ⇒ 规划与 R5 只认这些） */
  faces: boolean;
  readonly bandOpen: Float32Array;
  readonly bandWant: Uint8Array;
  readonly bandHold: Uint8Array;
  readonly bandWall: Uint8Array;
  readonly bandHard: Uint8Array;
  /** 触发档；座位三态下的家具、座位，空间此刻铺的路，累计「猫到了坐着的人的会面台」次数 */
  readonly trigger: TriggerMode;
  /** 家具清单（可加减、拖动；座位三态默认 = 标准布置）与由它算出的占位 / 座位 */
  furniture: FurnSpec[];
  furn: Furnishing | null;
  seats: Seat[];
  guides: Guide[] = [];
  catArrivals = 0;
  t = 0;
  private nextId = 1;
  private readonly seed: number;
  private readonly rng: () => number;
  private readonly inputsBuf: Float64Array;
  private readonly catInputsBuf: Float64Array;
  private readonly pairs = new Map<string, PairState>();
  private readonly wallScratch: Uint8Array;

  constructor(opts: CohabitOpts = {}) {
    this.trigger = opts.trigger ?? 'trace';
    const posture = this.trigger === 'posture';
    this.layout = planLayout(opts.grid ?? (posture ? COHABIT.SEATS.GRID : COHABIT.GRID_DEF), opts.radius ?? RING.RADIUS_DEF);
    this.furniture = posture ? standardFurniture(this.layout) : [];
    this.furn = posture ? furnishRoom(this.layout, this.furniture) : null;
    this.graph = aisleGraph(this.layout, this.furn ?? undefined);
    this.seats = placeSeats(this.layout, this.graph);
    const threshold = opts.threshold ?? PLAN.DEMO.threshold;
    this.fade = opts.fade === undefined ? PLAN.DEMO.fade : opts.fade;
    const cap = this.fade === null ? Infinity : threshold;
    this.field = new TraceField(this.layout.roomM, PLAN.CELL, cap);
    this.catField = new TraceField(this.layout.roomM, PLAN.CELL, cap);
    this.act = new Activation(this.layout.units.length, threshold, opts.mode ?? 'follow', opts.fill ?? PLAN.FILL.def);
    const reading = opts.reading ?? 'nearest';
    this.catchment = buildCatchment(this.layout, this.field, reading);
    this.catCatchment = buildCatchment(this.layout, this.catField, reading);
    this.space = opts.space ?? 'live';
    this.reach = opts.reach ?? PLAN.ATTENTION.reach;
    this.decay = opts.decay ?? PLAN.DECAY;
    this.fov = opts.fov ?? PLAN.ATTENTION.fov;
    this.clearance = opts.clearance === undefined ? PLAN.ATTENTION.clearance : opts.clearance;
    this.lane = opts.lane ?? PLAN.ATTENTION.lane;
    this.look = opts.look ?? PLAN.ATTENTION.look;
    this.auto = opts.auto ?? true;
    this.goal = opts.goal ?? true;
    this.speed = COHABIT.VISITOR.speed;
    this.seed = opts.seed ?? 20261006;
    this.rng = makeRng(this.seed);
    const n = this.layout.units.length;
    this.inputsBuf = new Float64Array(n);
    this.catInputsBuf = new Float64Array(n);
    this.blocked = new Uint8Array(n);
    this.wall = new Uint8Array(n);
    this.heldR5 = new Uint8Array(n);
    this.wallScratch = new Uint8Array(n);
    this.faces = opts.faces ?? false;
    this.bandOpen = new Float32Array(n * BANDS);
    this.bandWant = new Uint8Array(n * BANDS);
    this.bandHold = new Uint8Array(n * BANDS);
    this.bandWall = new Uint8Array(n * BANDS);
    this.bandHard = new Uint8Array(n * BANDS);
    this.applySpace();
    if (opts.opening ?? true) {
      for (const o of COHABIT.OPENING.people) {
        const k = nearestNode(this.graph, o.x * this.layout.pitch4, o.y * this.layout.pitch4);
        this.addPerson(this.graph.nodes[k].x, this.graph.nodes[k].y);
      }
      for (const u of COHABIT.OPENING.cats) this.addCat(this.layout.units[Math.min(u, n - 1)]);
    }
  }

  /** 座位三态：第 u 台的平台会盖到坐在 (x,y) 的人头顶——平台外缘伸进身体圈（平台底 1.08 m < 坐着的头顶 ≈1.25 m） */
  overHead(u: PlanUnit, x: number, y: number): boolean {
    return Math.hypot(u.x - x, u.y - y) < this.layout.platR + PLAN.BODY_R;
  }

  /** 这个人在过道图上算在哪个交叉点：坐着 = 座位入口，否则离他最近的能站的那个 */
  nodeOf(p: Visitor): number {
    if (p.seated && p.seat !== null) return this.seats[p.seat].node;
    return nearestNode(this.graph, p.walker.x, p.walker.y);
  }

  /** R5：这组墙之下每个在场访客都还有路到门（座位三态按 nodeOf；痕迹档走 everyoneHasExit，逐位不变） */
  private exitOk(wall: Uint8Array, planWall: Uint8Array | null): boolean {
    if (!this.furn) return everyoneHasExit(this.layout, this.graph, this.people.map((p) => p.walker), wall, planWall);
    const doors = new Set(this.graph.door);
    for (const p of this.people) {
      if (!p.walker.present) continue;
      if (!shortestPath(this.layout, this.graph, this.nodeOf(p), doors, wall, planWall)) return false;
    }
    return true;
  }

  // ── 空间三档 ──────────────────────────────────────────────────────────────

  /** 换档：钉死 = 偶数行全落、永不更新；空房间 = 没有单元，猫下到地面 */
  setSpace(m: SpaceMode): void {
    this.space = m;
    this.applySpace();
  }

  private applySpace(): void {
    this.act.reset();
    this.heldR5.fill(0);
    this.resetBands();
    if (this.space === 'fixed') {
      if (!this.furn) {
        for (const u of this.layout.units) if (u.row % 2 === 0) this.act.degree[u.i] = 1;
      } else {
        // 座位三态（8×8）：一台落着就堵死四周四条过道，整行落下会把人圈死——偶数行逐台试落，
        // 落了让任一能站的交叉点走不到门的不落（R5 的静态版）；盖到座位头顶的不落（静态的设计不会把平台挂在座位上）
        const fixed = new Uint8Array(this.layout.units.length);
        for (const u of this.layout.units) {
          if (u.row % 2 || this.seats.some((q) => this.overHead(u, q.x, q.y))) continue;
          fixed[u.i] = 1;
          const reach = doorReach(this.layout, this.graph, fixed);
          for (let i = 0; i < this.graph.door[0]; i++)
            if (!this.furn.nodeOff[i] && !reach[i]) {
              fixed[u.i] = 0;
              break;
            }
        }
        for (let u = 0; u < fixed.length; u++) if (fixed[u]) this.act.degree[u] = 1;
      }
    }
    this.refreshWalls();
    for (const c of this.cats) {
      if (this.space === 'empty') c.unit = null;
      else if (!c.unit) c.unit = nearestUnit(this.layout, c.walker.x, c.walker.y);
      c.pending = null;
      c.transfer = null;
      if (c.unit && this.space === 'fixed' && this.act.degree[c.unit.i] < 1) {
        // 钉死档里猫只能住在落下的那几行：挪到最近的落下单元
        const f = this.layout.units.filter((u) => this.act.degree[u.i] >= 1);
        if (!f.length) continue;
        c.unit = f.reduce((b, u) => (Math.hypot(u.x - c.walker.x, u.y - c.walker.y) < Math.hypot(b.x - c.walker.x, b.y - c.walker.y) ? u : b), f[0]);
        c.walker.place(c.unit.x, c.unit.y);
      }
    }
  }

  private refreshWalls(): void {
    for (let u = 0; u < this.wall.length; u++) this.wall[u] = this.act.degree[u] >= COHABIT.WALL_AT ? 1 : 0;
  }

  // ── 放人放猫 ──────────────────────────────────────────────────────────────

  addPerson(x: number, y: number): Visitor | null {
    if (this.people.length >= COHABIT.MAX_PEOPLE) return null;
    const half = this.layout.roomM / 2 - PLAN.BODY_R;
    const px = Math.max(-half, Math.min(half, x));
    const py = Math.max(-half, Math.min(half, y));
    const id = this.nextId++;
    const walker = new Walker(this.speed, this.seed + id * 7919);
    walker.lookAround = this.look;
    walker.place(px, py);
    const v: Visitor = {
      id,
      walker,
      mode: this.auto ? 'auto' : 'manual',
      lastX: px,
      lastY: py,
      moving: false,
      pause: this.pick(COHABIT.VISITOR.pause),
      watching: null,
      legFrom: null,
      legPath: 0,
      crowdedFor: 0,
      waitFor: 0,
      detour: 0,
      straight: 0,
      seat: null,
      seated: false,
      seatedTime: 0,
      watchFor: 0,
      offer: null,
      offered: false,
    };
    this.people.push(v);
    // 座位三态：放在空座上 = 直接坐下
    const s = this.seatAt(px, py);
    if (s >= 0 && this.seatFree(s, v)) this.sitDown(v, s);
    return v;
  }

  // ── 座位 ──────────────────────────────────────────────────────────────────

  /** (x,y) 落在哪个座位上（座位点 0.3 m 以内）；没有 = −1 */
  seatAt(x: number, y: number): number {
    for (const s of this.seats) if (Math.hypot(s.x - x, s.y - y) < 0.3) return s.i;
    return -1;
  }

  /** 这个座位空着：没人坐、没人正走去坐，且 1.35 m 内没有别的访客坐着或要坐（猫咖访客彼此是陌生人） */
  seatFree(i: number, me?: Visitor): boolean {
    const s = this.seats[i];
    // 有猫占着的那台盖在这个座位头顶：坐不下（猫脚下的平台收不了）
    for (const c of this.cats) for (const u of this.supportOf(c)) if (this.overHead(u, s.x, s.y)) return false;
    for (const p of this.people) {
      if (p === me || p.seat === null) continue;
      if (p.seat === i) return false;
      const o = this.seats[p.seat];
      if (Math.hypot(o.x - s.x, o.y - s.y) < COHABIT.PERSON_D.stranger) return false;
    }
    return true;
  }

  private sitDown(p: Visitor, i: number): void {
    const s = this.seats[i];
    p.walker.place(s.x, s.y);
    p.walker.heading = Math.atan2(s.face[1], s.face[0]);
    p.walker.gaze = p.walker.heading;
    p.lastX = s.x;
    p.lastY = s.y;
    p.seat = i;
    p.seated = true;
    p.watching = null;
    p.watchFor = 0;
    p.offer = null;
    p.offered = false;
    p.legFrom = null;
    p.pause = this.pick(COHABIT.SEATS.SIT);
  }

  /** 起身：放开座位，返回入口交叉点（下一程从这儿出发） */
  private standUp(p: Visitor): number {
    const node = p.seat !== null ? this.seats[p.seat].node : nearestNode(this.graph, p.walker.x, p.walker.y);
    p.seat = null;
    p.seated = false;
    p.watching = null;
    return node;
  }

  // ── 家具（独立一层：可加减、拖动；标准布置随时能回去）─────────────────────

  /** (x,y) 落在哪件家具上；没有 = −1 */
  furnitureAt(x: number, y: number): number {
    if (!this.furn) return -1;
    return this.furn.rects.findIndex((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  }

  /**
   * 这套家具摆得下吗：都在房间里、彼此不重叠（各留 GAP），且每个能站人的交叉点都还走得到门——
   * 家具挡死一块地面就不许摆（R5 的静态版：家具不会自己动，摆的时候就不能把人困住）。
   */
  furnitureFits(specs: readonly FurnSpec[]): boolean {
    const G = COHABIT.SEATS.GAP;
    const half = this.layout.roomM / 2 - G;
    const rects = specs.map(furnRect);
    for (let a = 0; a < rects.length; a++) {
      const r = rects[a];
      if (r.x0 < -half || r.x1 > half || r.y0 < -half || r.y1 > half) return false;
      for (let b = 0; b < a; b++) {
        const q = rects[b];
        if (r.x0 < q.x1 + G && q.x0 < r.x1 + G && r.y0 < q.y1 + G && q.y0 < r.y1 + G) return false;
      }
    }
    const f = furnishRoom(this.layout, specs);
    const g: AisleGraph = { ...this.graph, furn: f };
    const reach = doorReach(this.layout, g, null);
    for (let i = 0; i < g.door[0]; i++) if (!f.nodeOff[i] && !reach[i]) return false;
    return true;
  }

  /** 换一套家具：重算占位、过道、座位。`moved` = 被搬动 / 删掉的那件（坐在上面、正走去坐的人起身）；
   *  删掉时后面的件号前移，其余人的座位按（件号, 第几座）对回去 */
  private refurnish(specs: FurnSpec[], moved: number, removed = false): void {
    const old = this.seats;
    this.furniture = specs;
    this.furn = furnishRoom(this.layout, specs);
    this.graph.furn = this.furn;
    this.seats = placeSeats(this.layout, this.graph);
    for (const p of this.people) {
      if (p.seat === null) continue;
      const o = old[p.seat];
      if (o.furn === moved) {
        // 坐在被搬动的那件上：起身站到最近能站的交叉点；正走去坐的：放弃这个座位
        if (p.seated) {
          p.seated = false;
          const k = nearestNode(this.graph, p.walker.x, p.walker.y);
          p.walker.place(this.graph.nodes[k].x, this.graph.nodes[k].y);
          p.lastX = p.walker.x;
          p.lastY = p.walker.y;
          p.pause = 0;
        }
        p.seat = null;
        continue;
      }
      const fi = removed && o.furn > moved ? o.furn - 1 : o.furn;
      const n = this.seats.find((q) => q.furn === fi && q.slot === o.slot);
      p.seat = n ? n.i : null;
      if (!n) p.seated = false;
    }
    // 站在新占位里的人挪到最近能站的交叉点
    for (const p of this.people) {
      if (p.seated || !this.furn.rects.some((r) => rectDist(r, p.walker.x, p.walker.y) < PLAN.BODY_R * 0.5)) continue;
      const k = nearestNode(this.graph, p.walker.x, p.walker.y);
      p.walker.place(this.graph.nodes[k].x, this.graph.nodes[k].y);
      p.lastX = p.walker.x;
      p.lastY = p.walker.y;
      p.legFrom = null;
    }
    if (this.space === 'fixed') this.applySpace();
  }

  /** 搬一件家具到 (x,y)（朝向自动朝房间中线：上半边朝下、下半边朝上——标准布置就是这个规矩）；摆不下 = false、原地不动 */
  moveFurniture(i: number, x: number, y: number): boolean {
    const f = this.furniture[i];
    if (!f) return false;
    const next = this.furniture.slice();
    next[i] = { ...f, x, y, face: y < 0 ? [0, 1] : [0, -1] };
    if (!this.furnitureFits(next)) return false;
    this.refurnish(next, i);
    return true;
  }

  /** 加一件：从房间中心往外按 0.3 m 网格找第一个摆得下的位置；一个都没有 = −1 */
  addFurniture(kind: FurnKind): number {
    if (!this.furn) return -1;
    const half = this.layout.roomM / 2;
    const spots: { x: number; y: number }[] = [];
    for (let x = -half; x <= half; x += 0.3) for (let y = -half; y <= half; y += 0.3) spots.push({ x, y });
    spots.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    for (const sp of spots) {
      const next = [...this.furniture, { kind, x: sp.x, y: sp.y, face: (sp.y < 0 ? [0, 1] : [0, -1]) as [number, number] }];
      if (!this.furnitureFits(next)) continue;
      this.refurnish(next, this.furniture.length);
      return this.furniture.length - 1;
    }
    return -1;
  }

  removeFurniture(i: number): void {
    if (!this.furniture[i]) return;
    const next = this.furniture.filter((_, k) => k !== i);
    this.refurnish(next, i, true);
  }

  /** 回到标准布置（所有人起身） */
  resetFurniture(): void {
    if (!this.furn) return;
    for (const p of this.people) if (p.seat !== null) {
      if (p.seated) {
        const k = this.seats[p.seat].node;
        p.walker.place(this.graph.nodes[k].x, this.graph.nodes[k].y);
        p.lastX = p.walker.x;
        p.lastY = p.walker.y;
        p.pause = 0;
      }
      p.seat = null;
      p.seated = false;
    }
    this.refurnish(standardFurniture(this.layout), -1);
  }

  addCat(at?: PlanUnit | { x: number; y: number }): Cat | null {
    if (this.cats.length >= COHABIT.MAX_CATS) return null;
    const id = this.nextId++;
    const walker = new Walker(COHABIT.CAT.speed, this.seed + id * 104729);
    walker.lookAround = false;
    let unit: PlanUnit | null = null;
    let x: number;
    let y: number;
    if (this.space === 'empty') {
      x = at?.x ?? 0;
      y = at?.y ?? 0;
    } else {
      unit = at && 'i' in at ? at : nearestUnit(this.layout, at?.x ?? 0, at?.y ?? 0);
      if (this.space === 'fixed' && this.act.degree[unit.i] < 1) {
        const f = this.layout.units.filter((u) => this.act.degree[u.i] >= 1);
        if (f.length) unit = f.reduce((b, u) => (Math.hypot(u.x - unit!.x, u.y - unit!.y) < Math.hypot(b.x - unit!.x, b.y - unit!.y) ? u : b), f[0]);
      }
      x = unit.x;
      y = unit.y;
    }
    walker.place(x, y);
    const c: Cat = {
      id,
      walker,
      mode: this.auto ? 'auto' : 'manual',
      unit,
      pending: null,
      transfer: null,
      state: 'sit',
      phaseTime: 0,
      tolerated: 0,
      latency: 0,
      waited: 0,
      approaching: null,
      farTime: 0,
      presentTime: 0,
      settledTime: 0,
      transfers: 0,
    };
    this.cats.push(c);
    if (unit) this.keepSupport(c);
    return c;
  }

  removeLastPerson(): void {
    this.people.pop();
  }
  removeLastCat(): void {
    this.cats.pop();
  }
  clearTraces(): void {
    this.field.clear();
    this.catField.clear();
    if (this.space === 'live') {
      this.act.reset();
      this.resetBands();
    }
    for (const c of this.cats) this.keepSupport(c);
    this.refreshWalls();
  }
  resetLedger(): void {
    this.ledger = emptyLedger();
    this.pairs.clear();
    this.catArrivals = 0;
    for (const v of this.people) {
      v.detour = 0;
      v.straight = 0;
      v.seatedTime = 0;
    }
    for (const c of this.cats) {
      c.farTime = 0;
      c.presentTime = 0;
      c.settledTime = 0;
      c.transfers = 0;
    }
    this.t = 0;
  }

  /** 脚下单元直接给支撑（Lab 2-12 D2） */
  private keepSupport(c: Cat): void {
    if (this.space !== 'live') return;
    for (const u of this.supportOf(c)) {
      this.act.degree[u.i] = 1;
      this.act.input[u.i] = this.act.threshold;
    }
  }

  supportOf(c: Cat): PlanUnit[] {
    if (!c.unit) return [];
    return c.transfer ? [c.transfer.from, c.transfer.to] : [c.unit];
  }

  // ── 指针 ──────────────────────────────────────────────────────────────────

  bodyAt(x: number, y: number): { kind: 'person' | 'cat'; id: number } | null {
    for (const c of this.cats) if (Math.hypot(c.walker.x - x, c.walker.y - y) < 0.4) return { kind: 'cat', id: c.id };
    for (const p of this.people) if (Math.hypot(p.walker.x - x, p.walker.y - y) < PLAN.BODY_R * 1.6) return { kind: 'person', id: p.id };
    return null;
  }

  hold(kind: 'person' | 'cat', id: number, x: number, y: number): void {
    if (kind === 'person') {
      const p = this.people.find((v) => v.id === id);
      if (!p) return;
      p.mode = 'held';
      p.watching = null;
      p.legFrom = null;
      p.seat = null;
      p.seated = false;
      p.watchFor = 0;
      p.offer = null;
      p.walker.place(x, y);
    } else {
      const c = this.cats.find((v) => v.id === id);
      if (!c) return;
      c.mode = 'held';
      c.state = 'held';
      c.pending = null;
      c.transfer = null;
      c.approaching = null;
    }
  }

  drag(kind: 'person' | 'cat', id: number, x: number, y: number): void {
    const half = this.layout.roomM / 2;
    const cx = Math.max(-half, Math.min(half, x));
    const cy = Math.max(-half, Math.min(half, y));
    if (kind === 'person') {
      const p = this.people.find((v) => v.id === id);
      if (!p || p.mode !== 'held') return;
      const dx = cx - p.walker.x;
      const dy = cy - p.walker.y;
      if (Math.hypot(dx, dy) > 1e-6) p.walker.heading = Math.atan2(dy, dx);
      p.walker.x = cx;
      p.walker.y = cy;
    } else {
      const c = this.cats.find((v) => v.id === id);
      if (!c || c.mode !== 'held') return;
      if (this.space === 'empty') {
        c.walker.x = cx;
        c.walker.y = cy;
      } else {
        // 拖到哪台就住哪台：拖放即时给支撑（Lab 2-12 的交互约定）
        const u = nearestUnit(this.layout, cx, cy);
        if (this.space === 'fixed' && this.act.degree[u.i] < 1) return;
        c.unit = u;
        c.walker.x = u.x;
        c.walker.y = u.y;
        this.keepSupport(c);
      }
    }
  }

  release(kind: 'person' | 'cat', id: number): void {
    if (kind === 'person') {
      const p = this.people.find((v) => v.id === id);
      if (!p) return;
      p.mode = this.auto ? 'auto' : 'manual';
      p.walker.place(p.walker.x, p.walker.y);
      p.lastX = p.walker.x;
      p.lastY = p.walker.y;
      p.pause = this.pick(COHABIT.VISITOR.pause);
      // 座位三态：放到空座上 = 坐下
      const s = this.seatAt(p.walker.x, p.walker.y);
      if (s >= 0 && this.seatFree(s, p)) this.sitDown(p, s);
    } else {
      const c = this.cats.find((v) => v.id === id);
      if (!c) return;
      c.mode = this.auto ? 'auto' : 'manual';
      c.state = 'sit';
      c.phaseTime = 0;
      c.walker.place(c.walker.x, c.walker.y);
    }
  }

  setAuto(on: boolean): void {
    this.auto = on;
    for (const p of this.people) if (p.mode !== 'held') p.mode = on ? 'auto' : 'manual';
    for (const c of this.cats) if (c.mode !== 'held') c.mode = on ? 'auto' : 'manual';
  }
  setMode(m: ResponseMode): void {
    this.act.mode = m;
  }
  setThreshold(v: number): void {
    this.act.threshold = v;
    if (this.fade !== null) {
      this.field.cap = v;
      this.catField.cap = v;
    }
  }
  setFade(v: number | null): void {
    this.fade = v;
    const cap = v === null ? Infinity : this.act.threshold;
    this.field.cap = cap;
    this.catField.cap = cap;
  }
  setLook(on: boolean): void {
    this.look = on;
    for (const p of this.people) p.walker.lookAround = on;
  }
  setSpeed(v: number): void {
    this.speed = v;
    for (const p of this.people) p.walker.speed = v;
  }
  /** 让位（m）；null = 关。走廊随让位开关 */
  setClearance(v: number | null): void {
    this.clearance = v;
    this.lane = v !== null;
  }
  /** 按带让路开关；关掉时带全部落回 */
  setFaces(on: boolean): void {
    this.faces = on;
    if (!on) this.resetBands();
  }
  private resetBands(): void {
    this.bandOpen.fill(0);
    this.bandWant.fill(0);
    this.bandHold.fill(0);
    this.bandWall.fill(0);
    this.bandHard.fill(0);
  }

  // ── 按带让路 ─────────────────────────────────────────────────────────────

  /** 带离身体至少留多远（m）= 身体 + 让位；让位关着时只剩身体 */
  get marginM(): number {
    return PLAN.BODY_R + (this.clearance ?? 0);
  }

  /** 第 u 台第 j 条带的径向段（芯外缘 → 平台外缘）。`full` = 按全落的长度（问「它落下来挡不挡人」），
   *  否则按它此刻的收回程度（问「它现在挡没挡着」）——请求必须按全长判，按现长判会越收越够不着人、刚收又落回 */
  private bandSeg(u: PlanUnit, j: number, full = false): [number, number, number, number] {
    const a = bandAngle(j);
    const cx = Math.cos(a);
    const cy = Math.sin(a);
    const r = full ? this.layout.platR : this.layout.mastR + (this.layout.platR - this.layout.mastR) * (1 - this.bandOpen[u.i * BANDS + j]);
    return [u.x + cx * this.layout.mastR, u.y + cy * this.layout.mastR, u.x + cx * r, u.y + cy * r];
  }

  /** 猫身下（与它正要走去的那一处）的带不许收；转移中起落两台整台护住 */
  private holdBands(): void {
    this.bandHold.fill(0);
    const R = COHABIT.CAT.bodyR + COHABIT.FACES.catMargin;
    for (const c of this.cats) {
      if (!c.unit) continue;
      if (c.transfer) {
        for (const u of this.supportOf(c)) this.bandHold.fill(1, u.i * BANDS, (u.i + 1) * BANDS);
        continue;
      }
      const spots: { x: number; y: number }[] = [{ x: c.walker.x, y: c.walker.y }];
      if (c.walker.state === 'walk' && c.walker.route.length) spots.push(c.walker.route[0]);
      const u = c.unit;
      for (const s of spots) {
        const dx = s.x - u.x;
        const dy = s.y - u.y;
        const d = Math.hypot(dx, dy);
        if (d < R) {
          this.bandHold.fill(1, u.i * BANDS, (u.i + 1) * BANDS);
          continue;
        }
        const ang = Math.atan2(dy, dx);
        const half = Math.asin(Math.min(1, R / d)) + Math.PI / BANDS;
        for (let j = 0; j < BANDS; j++) if (Math.abs(wrapAngle(bandAngle(j) - ang)) <= half) this.bandHold[u.i * BANDS + j] = 1;
      }
    }
  }

  /**
   * 谁的身边、谁的路上有带，就请求那条带收回：
   *   身边 = 带的径向段离身体中心 < 身体 + 让位；
   *   路上 = 沿还没走的路线往前 `步速 × 收回时长 + 余量` 的路程内，带外缘点落在这条走廊（半宽同上）里。
   * 只请求，收不收还要看猫（holdBands）。
   */
  private requestBands(): void {
    this.bandWant.fill(0);
    const l = this.layout;
    const margin = this.marginM;
    for (const p of this.people) {
      const w = p.walker;
      if (!w.present) continue;
      const ahead = w.state === 'walk' && p.mode !== 'held' ? w.speed / COHABIT.FACES.open + COHABIT.FACES.ahead : 0;
      // 路线折线（从当前位置起），截到 ahead 路程
      const path: { x: number; y: number }[] = [{ x: w.x, y: w.y }];
      if (ahead > 0) {
        let left = ahead;
        let px = w.x;
        let py = w.y;
        for (const wp of w.route) {
          const d = Math.hypot(wp.x - px, wp.y - py);
          if (d <= left) {
            path.push({ x: wp.x, y: wp.y });
            left -= d;
            px = wp.x;
            py = wp.y;
          } else {
            path.push({ x: px + ((wp.x - px) * left) / d, y: py + ((wp.y - py) * left) / d });
            break;
          }
        }
      }
      const near = l.platR + margin + ahead + 0.5;
      for (const u of l.units) {
        if (Math.hypot(u.x - w.x, u.y - w.y) > near) continue;
        for (let j = 0; j < BANDS; j++) {
          const [ax, ay, bx, by] = this.bandSeg(u, j, true);
          let hit = segDist(w.x, w.y, ax, ay, bx, by) < margin;
          // 带外缘点（全落的位置）离路线这一段 < 走廊半宽
          for (let k = 1; !hit && k < path.length; k++) hit = segDist(bx, by, path[k - 1].x, path[k - 1].y, path[k].x, path[k].y) < margin;
          if (hit) this.bandWant[u.i * BANDS + j] = 1;
        }
      }
    }
  }

  /** 带按速率收回 / 落回；算出此刻哪些带是墙、哪些是开不了的墙 */
  private advanceBands(dt: number): void {
    const up = COHABIT.FACES.open * dt;
    const down = COHABIT.FACES.close * dt;
    for (let i = 0; i < this.bandOpen.length; i++) {
      const target = this.bandWant[i] && !this.bandHold[i] ? 1 : 0;
      const o = this.bandOpen[i];
      this.bandOpen[i] = target > o ? Math.min(1, o + up) : Math.max(0, o - down);
      const u = (i / BANDS) | 0;
      const wall = this.act.degree[u] * (1 - this.bandOpen[i]) >= COHABIT.WALL_AT ? 1 : 0;
      this.bandWall[i] = wall;
      this.bandHard[i] = wall && this.bandHold[i] ? 1 : 0;
    }
  }

  /** 人正前方贴着一条还是墙的带（门没开）：这一步不往前走 */
  private aheadBlocked(p: Visitor): boolean {
    const w = p.walker;
    // 「前方」= 身体朝向；已经在等了就改按下一个路点的方向——等着时 speed = 0，walker 不更新朝向，
    // 另选的路若掉头，朝向还对着原来那道带，会一直判成被挡（8×8 下实测卡死）
    let hx = Math.cos(w.heading);
    let hy = Math.sin(w.heading);
    const next = w.route[0];
    if (p.waitFor > 0 && next) {
      const d = Math.hypot(next.x - w.x, next.y - w.y);
      if (d > 1e-9) {
        hx = (next.x - w.x) / d;
        hy = (next.y - w.y) / d;
      }
    }
    const lim = PLAN.BODY_R + 0.05;
    for (const u of this.layout.units) {
      if (Math.hypot(u.x - w.x, u.y - w.y) > this.layout.platR + lim) continue;
      for (let j = 0; j < BANDS; j++) {
        if (!this.bandWall[u.i * BANDS + j]) continue;
        const [ax, ay, bx, by] = this.bandSeg(u, j);
        if ((bx - w.x) * hx + (by - w.y) * hy <= 0) continue; // 在身后
        if (segDist(w.x, w.y, ax, ay, bx, by) < lim) return true;
      }
    }
    return false;
  }

  // ── 读数 ──────────────────────────────────────────────────────────────────

  private pick(r: { min: number; max: number }): number {
    return r.min + this.rng() * (r.max - r.min);
  }

  get keepOutM(): number {
    return this.clearance === null ? 0 : keepOut(this.layout, this.clearance);
  }

  /** 离 (x,y) 最近的在场访客距离；没人 = ∞ */
  nearestVisitor(x: number, y: number, exceptId = -1): { d: number; p: Visitor | null } {
    let best: Visitor | null = null;
    let bd = Infinity;
    for (const p of this.people) {
      if (p.id === exceptId || !p.walker.present) continue;
      const d = Math.hypot(p.walker.x - x, p.walker.y - y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return { d: bd, p: best };
  }

  /** 哪个访客站着盯着这只猫（专注驻留）：站着、≤ GAZE_D、视线对准 ±GAZE_HALF.person */
  attendingOf(c: Cat): Visitor | null {
    let best: Visitor | null = null;
    let bd = Infinity;
    for (const p of this.people) {
      const w = p.walker;
      if (!w.present || w.state === 'walk' || p.mode === 'held') continue;
      const dx = c.walker.x - w.x;
      const dy = c.walker.y - w.y;
      const d = Math.hypot(dx, dy);
      if (d > COHABIT.GAZE_D) continue;
      if (Math.abs(wrapAngle(Math.atan2(dy, dx) - w.gaze)) > COHABIT.GAZE_HALF.person) continue;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** 猫的四邻（同一排布里上下左右） */
  neighboursOf(u: PlanUnit): PlanUnit[] {
    const { n, units } = this.layout;
    const out: PlanUnit[] = [];
    if (u.col > 0) out.push(units[u.i - 1]);
    if (u.col < n - 1) out.push(units[u.i + 1]);
    if (u.row > 0) out.push(units[u.i - n]);
    if (u.row < n - 1) out.push(units[u.i + n]);
    return out;
  }

  /** 猫沿在场单元（四邻）从 from 到 to 的最短路（单元下标，含两端）；不通 = null */
  unitPath(from: number, to: number, avoid: Uint8Array | null = null): number[] | null {
    if (from === to) return [from];
    const units = this.layout.units;
    const prev = new Int32Array(units.length).fill(-1);
    const q = [from];
    prev[from] = from;
    for (let h = 0; h < q.length; h++) {
      for (const nb of this.neighboursOf(units[q[h]])) {
        if (prev[nb.i] !== -1 || (avoid && avoid[nb.i] && nb.i !== to)) continue;
        prev[nb.i] = q[h];
        if (nb.i === to) {
          const path = [to];
          while (path[path.length - 1] !== from) path.push(prev[path[path.length - 1]]);
          return path.reverse();
        }
        q.push(nb.i);
      }
    }
    return null;
  }

  // ── 推进 ──────────────────────────────────────────────────────────────────

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let left = Math.min(dt, 1);
    while (left > 1e-12) {
      const h = Math.min(MAX_SUB_DT, left);
      left -= h;
      for (const p of this.people) this.stepPerson(p, h);
      for (const c of this.cats) this.stepCat(c, h);
      this.account(h);
      this.t += h;
    }
    // 痕迹衰减与单元响应按整段一次
    if (this.fade !== null) {
      this.field.relax(dt, this.fade);
      this.catField.relax(dt, this.fade);
    } else {
      this.field.decay(dt, this.decay);
      this.catField.decay(dt, this.decay);
    }
    this.stepSpace(dt);
  }

  // ── 访客 ──────────────────────────────────────────────────────────────────

  private stepPerson(p: Visitor, dt: number): void {
    const w = p.walker;
    if (p.mode === 'held') {
      const d = Math.hypot(w.x - p.lastX, w.y - p.lastY);
      w.distance += d;
      w.presentTime += dt;
      w.look(dt, d > 1e-9);
    } else {
      if (p.mode === 'auto') this.wander(p, dt);
      // 坐着：看 3 m 内最近的那只猫（身子跟着转）；没有猫就面朝座位的朝向
      if (p.seated && p.seat !== null) {
        let best: Cat | null = null;
        let bd: number = COHABIT.GAZE_D;
        for (const c of this.cats) {
          const d = Math.hypot(c.walker.x - w.x, c.walker.y - w.y);
          if (d <= bd) {
            bd = d;
            best = c;
          }
        }
        p.watching = best ? best.id : null;
        if (!best) {
          const f = this.seats[p.seat].face;
          w.heading = Math.atan2(f[1], f[0]);
        }
      }
      // 看猫：站着时视线锁住那只猫（专注驻留，C4）
      if (p.watching !== null && w.state !== 'walk') {
        const c = this.cats.find((k) => k.id === p.watching);
        if (c) {
          const g = Math.atan2(c.walker.y - w.y, c.walker.x - w.x);
          w.lookAround = false;
          w.heading = g;
          w.gaze = g;
        } else p.watching = null;
      } else w.lookAround = this.look;
      // 按带让路：门还没开就在门口等（等太久另选路——猫可能在计划之后坐到了门上）
      if (this.faces && this.space === 'live' && w.state === 'walk' && this.aheadBlocked(p)) {
        p.waitFor += dt;
        if (p.waitFor > COHABIT.FACES.waitMax) {
          p.waitFor = 0;
          w.place(w.x, w.y);
          p.pause = 0;
        } else {
          const sp = w.speed;
          w.speed = 0;
          w.step(dt);
          w.speed = sp;
        }
      } else {
        p.waitFor = 0;
        w.step(dt);
      }
    }
    const moved = Math.hypot(w.x - p.lastX, w.y - p.lastY);
    p.moving = moved > 1e-9;
    p.lastX = w.x;
    p.lastY = w.y;
    if (w.present && this.trigger === 'trace') {
      // 按带让路下不挖洞、不开走廊：单元可以落在人身边，挡人的带自己收
      // （座位三态下地面不留痕迹：走着不触发，站定 / 坐着由 guide() 直接写单元）
      const hole = this.faces ? 0 : this.keepOutM;
      this.field.imprintShaped(w.x, w.y, this.reach, dt, w.heading, this.fov, hole, !this.faces && this.lane && p.moving ? hole : 0, w.gaze);
    }
    // 一程走完：记绕行
    if (p.legFrom && w.state !== 'walk') {
      const s = Math.hypot(w.x - p.legFrom.x, w.y - p.legFrom.y);
      p.straight += s;
      p.detour += Math.max(0, p.legPath - s);
      p.legFrom = null;
    }
    if (p.legFrom) p.legPath += moved;
    if (this.trigger === 'posture') this.stepPosture(p, dt);
  }

  /** 座位三态：走到座位点就坐下；坐着累计时长；站定看着一只猫累计时长（满 STAND_S 空间给一步） */
  private stepPosture(p: Visitor, dt: number): void {
    const w = p.walker;
    if (p.seat !== null && !p.seated && p.mode !== 'held' && w.state !== 'walk') {
      const s = this.seats[p.seat];
      if (Math.hypot(w.x - s.x, w.y - s.y) < 1e-6) this.sitDown(p, p.seat);
      else p.seat = null; // 没走到（门口等太久另选了路）：放弃这个座位
    }
    if (p.seated) p.seatedTime += dt;
    let ok = false;
    if (!p.seated && p.mode !== 'held' && !p.moving && w.state !== 'walk' && p.watching !== null) {
      const c = this.cats.find((k) => k.id === p.watching);
      if (c) {
        const dx = c.walker.x - w.x;
        const dy = c.walker.y - w.y;
        ok = Math.hypot(dx, dy) <= COHABIT.GAZE_D && Math.abs(wrapAngle(Math.atan2(dy, dx) - w.gaze)) <= COHABIT.GAZE_HALF.person;
      }
    }
    if (ok) p.watchFor += dt;
    else {
      p.watchFor = 0;
      p.offer = null;
      p.offered = false;
    }
  }

  /** 漫步（演示装置）：站够了就挑下一站——一半几率去看猫，否则随机一个交叉点；路线沿过道图绕开墙。
   *  停留代价：站着时另一访客进到 1.35 m 以内 ⇒ 这一站提前结束，去一个离别人远的点。 */
  private wander(p: Visitor, dt: number): void {
    const w = p.walker;
    if (w.state === 'walk') return;
    let crowded = false;
    let rising = false;
    let from: number;
    if (p.seated) {
      // 坐着：坐够了才起身（坐着的人占着座位，不因旁人靠近就走）
      p.pause -= dt;
      if (p.pause > 0) return;
      from = this.standUp(p);
      rising = true;
    } else {
      const other = this.nearestVisitor(w.x, w.y, p.id);
      p.crowdedFor = other.d < COHABIT.PERSON_D.stranger ? p.crowdedFor + dt : 0;
      crowded = p.crowdedFor >= COHABIT.VISITOR.crowdS;
      p.pause -= dt;
      if (p.pause > 0 && !crowded) return;
      from = nearestNode(this.graph, w.x, w.y);
    }
    p.crowdedFor = 0;
    const g = this.graph;
    let goal = -1;
    let watch: number | null = null;
    let seat: number | null = null;
    if (crowded) goal = this.farthestNode(from, p);
    else {
      // 座位三态：有空座时按几率去坐（起身的这一程不再坐回去）
      if (this.seats.length && !rising && this.rng() < COHABIT.SEATS.SIT_P) {
        const free = this.seats.filter((q) => this.seatFree(q.i, p));
        if (free.length) {
          const q = free[Math.floor(this.rng() * free.length)];
          seat = q.i;
          goal = q.node;
        }
      }
      if (goal < 0 && this.cats.length && this.rng() < COHABIT.VISITOR.toCatP) {
        const c = this.cats[Math.floor(this.rng() * this.cats.length)];
        goal = this.spotNear(c, w.x, w.y, from);
        watch = c.id;
      }
    }
    if (goal < 0) goal = this.randomNode(from);
    // 按带只在会动的单元上成立：钉死 / 空房间档没有带在动，规划照旧认整台的墙（否则人会规划穿过钉死的墙、没人等门）
    const planWall = this.faces && this.space === 'live' ? this.bandHard : null;
    const avoid = planWall ? this.hardNodes() : null;
    const path = shortestPath(this.layout, g, from, new Set([goal]), this.wall, planWall, avoid);
    if (!path || path.length < 2) {
      // 不通（或已在原地）：换一个随机点；仍不通就站着再等
      const alt = this.randomNode(from);
      const p2 = shortestPath(this.layout, g, from, new Set([alt]), this.wall, planWall, avoid);
      if (!p2 || p2.length < 2) {
        p.pause = this.pick({ min: 2, max: 6 });
        return;
      }
      this.follow(p, p2, null, null, avoid);
      return;
    }
    this.follow(p, path, watch, seat, avoid);
  }

  /** 按带让路：被猫护住（收不了）的墙带伸到交叉点 BODY_R + 0.05 以内 ⇒ 这个交叉点站不了人（与 aheadBlocked 同一个距离）。
   *  8×8 下平台外缘离相邻交叉点只有 0.17 m（6×6 0.23 m），猫一坐上去四个角就站不了；4×4 是 0.36 m，永远不会 */
  private hardNodes(): Uint8Array {
    const g = this.graph;
    const out = new Uint8Array(g.nodes.length);
    const lim = PLAN.BODY_R + 0.05;
    const l = this.layout;
    for (const c of this.cats) {
      for (const u of this.supportOf(c)) {
        for (let i = 0; i < g.door[0]; i++) {
          const q = g.nodes[i];
          if (out[i] || Math.hypot(q.x - u.x, q.y - u.y) > l.platR + lim) continue;
          for (let j = 0; j < BANDS; j++) {
            if (!this.bandHard[u.i * BANDS + j]) continue;
            const [ax, ay, bx, by] = this.bandSeg(u, j);
            if (segDist(q.x, q.y, ax, ay, bx, by) < lim) {
              out[i] = 1;
              break;
            }
          }
        }
      }
    }
    return out;
  }

  private follow(p: Visitor, path: number[], watch: number | null, seat: number | null = null, avoid: Uint8Array | null = null): void {
    const w = p.walker;
    const g = this.graph;
    p.legFrom = { x: w.x, y: w.y };
    p.legPath = 0;
    // 第一个点是离人最近的交叉点：人若不在格线上先走过去——那个点站不了人（被猫护住的带挡着）就直接奔下一个
    const start = avoid && path.length > 1 && avoid[path[0]] ? 1 : 0;
    for (let i = start; i < path.length; i++) w.pushTarget({ x: g.nodes[path[i]].x, y: g.nodes[path[i]].y }, i === start);
    p.watching = watch;
    p.seat = seat;
    if (seat !== null) {
      // 入口交叉点之后再走一小步坐进座位；坐多久到坐下那一刻再定（sitDown）
      w.pushTarget({ x: this.seats[seat].x, y: this.seats[seat].y }, false);
      p.pause = 0;
      return;
    }
    p.pause = watch === null ? this.pick(COHABIT.VISITOR.pause) : this.pick(COHABIT.VISITOR.watch);
  }

  /** 场地内的交叉点（不含外侧线与门；有家具时不含站不了人的）里随机挑一个 */
  private randomNode(not: number): number {
    const n = this.layout.n;
    const inner: number[] = [];
    for (let r = 1; r < n; r++) for (let c = 1; c < n; c++) inner.push(r * (n + 1) + c);
    const pool = inner.filter((i) => i !== not && !(this.furn && this.furn.nodeOff[i]));
    return pool[Math.floor(this.rng() * pool.length)];
  }

  /** 离其他访客最远的交叉点（停留代价高了往哪走：G5） */
  private farthestNode(not: number, me: Visitor): number {
    const n = this.layout.n;
    let best = -1;
    let bd = -1;
    for (let r = 1; r < n; r++)
      for (let c = 1; c < n; c++) {
        const i = r * (n + 1) + c;
        if (i === not || (this.furn && this.furn.nodeOff[i])) continue;
        const node = this.graph.nodes[i];
        const d = this.nearestVisitor(node.x, node.y, me.id).d;
        if (d > bd) {
          bd = d;
          best = i;
        }
      }
    return best;
  }

  /** 看猫的站位：猫脚下单元周围四个交叉点里离访客最近的一个（距猫 ≈ 0.7 格距，落在 0.5–1.5 m 带内） */
  private spotNear(c: Cat, x: number, y: number, not: number): number {
    const n = this.layout.n;
    const u = c.unit ?? nearestUnit(this.layout, c.walker.x, c.walker.y);
    const cands = [
      u.row * (n + 1) + u.col,
      u.row * (n + 1) + u.col + 1,
      (u.row + 1) * (n + 1) + u.col,
      (u.row + 1) * (n + 1) + u.col + 1,
    ].filter((i) => i !== not && !(this.furn && this.furn.nodeOff[i]));
    if (!cands.length) return -1;
    return cands.reduce((b, i) => {
      const a = this.graph.nodes[i];
      const bb = this.graph.nodes[b];
      return Math.hypot(a.x - x, a.y - y) < Math.hypot(bb.x - x, bb.y - y) ? i : b;
    }, cands[0]);
  }

  // ── 猫 ────────────────────────────────────────────────────────────────────

  private stepCat(c: Cat, dt: number): void {
    const w = c.walker;
    c.presentTime += dt;
    const near = this.nearestVisitor(w.x, w.y);
    const cost = near.d < COHABIT.CAT_NEAR ? 1 : 0;
    if (!cost) c.farTime += dt;
    if (c.mode === 'held') {
      w.presentTime += dt;
      return;
    }
    c.latency = Math.max(0, c.latency - dt);
    if (cost) c.tolerated += dt;
    else c.tolerated = Math.max(0, c.tolerated - dt);
    // 视线：有人在看就转过去看回去（猫的视线 = 朝向，walker 走着时自己管）
    const att = this.attendingOf(c);
    if (att && w.state !== 'walk') w.heading = Math.atan2(att.walker.y - w.y, att.walker.x - w.x);

    if (this.space === 'empty') {
      this.stepFloorCat(c, dt, cost, att);
      return;
    }
    // 转移：落点成形了才出发（Lab 2-12 D2）
    if (c.pending) {
      c.waited += dt;
      if (this.act.degree[c.pending.i] >= 1 - 1e-9 || this.space === 'fixed') {
        c.transfer = { from: c.unit!, to: c.pending };
        w.pushTarget({ x: c.pending.x, y: c.pending.y });
        c.state = 'walk';
        c.pending = null;
        c.waited = 0;
      } else if (c.waited > COHABIT.CAT.waitMax) {
        c.pending = null;
        c.waited = 0;
        c.state = 'sit';
        c.phaseTime = 0;
      }
    }
    w.step(dt);
    if (c.transfer && w.state !== 'walk') {
      c.unit = c.transfer.to;
      c.transfer = null;
      c.transfers++;
      c.state = 'sit';
      c.phaseTime = 0;
      this.keepSupport(c);
      // 座位三态：落到了某个正坐着人的座位的会面台
      const at = c.unit.i;
      if (this.seats.some((q) => q.meet === at && this.people.some((v) => v.seated && v.seat === q.i))) this.catArrivals++;
    }
    if (c.state === 'approach' && w.state !== 'walk' && c.approaching !== null) {
      // 到了台面边缘：这段靠近算安稳停留
      c.settledTime += dt;
    }
    if (w.state === 'walk' || c.pending) return;
    c.phaseTime += dt;
    if (c.state === 'sit' || c.state === 'lie') c.settledTime += dt;
    if (c.mode !== 'auto') return;

    const tol = att ? COHABIT.CAT.tolerateAttended : COHABIT.CAT.tolerate;
    // K2：忍够了就退到离人最远的邻格
    if (cost && c.tolerated > tol && c.state !== 'retreat') {
      const nb = this.neighboursOf(c.unit!);
      const cands = this.space === 'fixed' ? nb.filter((u) => this.act.degree[u.i] >= 1) : nb;
      if (cands.length) {
        const far = cands.reduce((b, u) => (this.nearestVisitor(u.x, u.y).d > this.nearestVisitor(b.x, b.y).d ? u : b), cands[0]);
        if (this.nearestVisitor(far.x, far.y).d > near.d) {
          c.pending = far;
          c.state = 'retreat';
          c.latency = COHABIT.CAT.latency;
          c.tolerated = 0;
          c.approaching = null;
          return;
        }
      }
      // 没有更远的格子：退到台面远端
      this.toRim(c, near.p ? Math.atan2(w.y - near.p.walker.y, w.x - near.p.walker.x) : w.heading);
      c.state = 'retreat';
      c.latency = COHABIT.CAT.latency;
      c.tolerated = 0;
      return;
    }
    // K3：有人站着看它、潜伏期过了 ⇒ 按几率靠到台面边缘
    if (att && c.latency <= 0 && c.state !== 'approach' && c.phaseTime >= 1) {
      if (this.rng() < COHABIT.CAT.approachP) {
        this.toRim(c, Math.atan2(att.walker.y - w.y, att.walker.x - w.x));
        c.state = 'approach';
        c.approaching = att.id;
        c.phaseTime = 0;
        return;
      }
      c.phaseTime = 0;
    }
    // 节奏：坐 → 卧 → （一半几率）换一格
    if (c.state === 'sit' && c.phaseTime >= COHABIT.CAT.sit) {
      // 座位三态：坐满了、旁边有一台空间刚递过来的（落着、没别的猫占着）⇒ 按同样的几率挪过去，不走才卧下（R3：走不走仍是猫的事）
      const offered = this.offeredNext(c);
      if (offered.length && this.rng() < COHABIT.CAT.roamP) {
        c.pending = offered[Math.floor(this.rng() * offered.length)];
        c.waited = 0;
        c.state = 'wait';
        return;
      }
      c.state = 'lie';
      c.phaseTime = 0;
    } else if ((c.state === 'lie' && c.phaseTime >= COHABIT.CAT.lie) || (c.state === 'retreat' && c.phaseTime >= COHABIT.CAT.sit) || (c.state === 'approach' && c.phaseTime >= COHABIT.CAT.sit * 2)) {
      c.approaching = null;
      if (this.rng() < COHABIT.CAT.roamP) {
        const nb = this.neighboursOf(c.unit!);
        const ok = nb.filter((u) => {
          if (this.space === 'fixed' && this.act.degree[u.i] < 1) return false;
          return c.latency > 0 ? this.nearestVisitor(u.x, u.y).d >= COHABIT.CAT_NEAR : true;
        });
        if (ok.length) {
          // 座位三态：优先走空间递过来的那一台
          const offered = this.offeredNext(c).filter((u) => ok.includes(u));
          const pool = offered.length ? offered : ok;
          c.pending = pool[Math.floor(this.rng() * pool.length)];
          c.waited = 0;
          c.state = 'wait';
          return;
        }
      }
      c.state = 'sit';
      c.phaseTime = 0;
    }
  }

  /** 座位三态 · 会动的单元：猫四邻里此刻落着、又没被别的猫占着 / 订下的那几台（= 空间递过来的路）。其他档恒空 */
  private offeredNext(c: Cat): PlanUnit[] {
    if (this.trigger !== 'posture' || this.space !== 'live' || !c.unit) return [];
    const taken = new Set<number>();
    for (const o of this.cats) {
      if (o === c) continue;
      for (const u of this.supportOf(o)) taken.add(u.i);
      if (o.pending) taken.add(o.pending.i);
    }
    return this.neighboursOf(c.unit).filter((u) => this.act.degree[u.i] >= 1 - 1e-9 && !taken.has(u.i));
  }

  /** 在台面上挪到朝某方向的边缘（不离开单元） */
  private toRim(c: Cat, ang: number): void {
    const u = c.unit!;
    const r = Math.max(0, this.layout.platR - COHABIT.CAT.bodyR);
    c.walker.pushTarget({ x: u.x + Math.cos(ang) * r, y: u.y + Math.sin(ang) * r });
  }

  /** 空房间档：猫在地面走——同一套代价，目标点不受单元约束 */
  private stepFloorCat(c: Cat, dt: number, cost: number, att: Visitor | null): void {
    const w = c.walker;
    w.step(dt);
    if (w.state === 'walk') return;
    c.phaseTime += dt;
    if (c.state === 'sit' || c.state === 'lie') c.settledTime += dt;
    if (c.mode !== 'auto') return;
    const half = this.layout.fieldM / 2;
    const tol = att ? COHABIT.CAT.tolerateAttended : COHABIT.CAT.tolerate;
    if (cost && c.tolerated > tol && c.state !== 'retreat') {
      let bx = w.x;
      let by = w.y;
      let bd = -1;
      for (let k = 0; k < 12; k++) {
        const x = (this.rng() * 2 - 1) * half;
        const y = (this.rng() * 2 - 1) * half;
        const d = this.nearestVisitor(x, y).d;
        if (d > bd) {
          bd = d;
          bx = x;
          by = y;
        }
      }
      w.pushTarget({ x: bx, y: by });
      c.state = 'retreat';
      c.latency = COHABIT.CAT.latency;
      c.tolerated = 0;
      c.phaseTime = 0;
      return;
    }
    if (att && c.latency <= 0 && c.state !== 'approach' && c.phaseTime >= 1) {
      if (this.rng() < COHABIT.CAT.approachP) {
        const ang = Math.atan2(att.walker.y - w.y, att.walker.x - w.x);
        const d = Math.hypot(att.walker.x - w.x, att.walker.y - w.y) - (PLAN.BODY_R + COHABIT.CAT.bodyR);
        w.pushTarget({ x: w.x + Math.cos(ang) * Math.max(0, d), y: w.y + Math.sin(ang) * Math.max(0, d) });
        c.state = 'approach';
        c.approaching = att.id;
        c.phaseTime = 0;
        return;
      }
      c.phaseTime = 0;
    }
    if (c.state === 'sit' && c.phaseTime >= COHABIT.CAT.sit) {
      c.state = 'lie';
      c.phaseTime = 0;
    } else if ((c.state === 'lie' && c.phaseTime >= COHABIT.CAT.lie) || (c.state !== 'lie' && c.state !== 'sit' && c.phaseTime >= COHABIT.CAT.sit * 2)) {
      c.approaching = null;
      if (this.rng() < COHABIT.CAT.roamP) {
        for (let k = 0; k < 8; k++) {
          const x = (this.rng() * 2 - 1) * half;
          const y = (this.rng() * 2 - 1) * half;
          if (c.latency > 0 && this.nearestVisitor(x, y).d < COHABIT.CAT_NEAR) continue;
          w.pushTarget({ x, y });
          c.state = 'walk';
          c.phaseTime = 0;
          return;
        }
      }
      c.state = 'sit';
      c.phaseTime = 0;
    } else if (c.state === 'walk') {
      c.state = 'sit';
      c.phaseTime = 0;
    }
  }

  // ── 空间层：R1 只写单元 · S2 促成相遇 · 让位 · R5 ─────────────────────────

  private stepSpace(dt: number): void {
    this.guides = [];
    if (this.space !== 'live') {
      this.refreshWalls();
      return;
    }
    // 让位：整台口径 = 平台下来会打到人的不落（已经落下的不算：它早就在那儿，人是走到它跟前的）；
    // 按带口径 = 不闸整台，挡人的带各自收回（下面）
    if (this.faces) this.blocked.fill(0);
    else {
      blockedUnits(this.layout, this.people.map((p) => p.walker), this.clearance, this.blocked);
      for (let u = 0; u < this.blocked.length; u++) if (this.wall[u]) this.blocked[u] = 0;
    }
    // 座位三态：坐着的人头顶那几台（平台伸进身体圈）不落、已经落下的也收回——两种让路口径都一样，
    // 不按「已经落下的不算」豁免：人坐下时头就在那儿，按带收也收不干净（芯还在）
    for (const p of this.people) {
      if (!p.seated) continue;
      for (const u of this.layout.units) if (this.overHead(u, p.walker.x, p.walker.y)) this.blocked[u.i] = 1;
    }
    const inputs = unitInputs(this.field, this.catchment, this.inputsBuf);
    const peopleIn = Float64Array.from(inputs);
    const catInputs = unitInputs(this.catField, this.catCatchment, this.catInputsBuf);
    for (let u = 0; u < inputs.length; u++) inputs[u] = Math.max(inputs[u], catInputs[u]);
    const thr = this.act.threshold;
    for (const c of this.cats) {
      if (!c.unit) continue;
      // 占用维持展开；下一落点按预备时长加请求（Lab 2-12）
      for (const u of this.supportOf(c)) inputs[u.i] = Math.max(inputs[u.i], thr);
      if (c.pending) inputs[c.pending.i] = Math.max(inputs[c.pending.i], Math.min(thr, c.waited / COHABIT.CAT.prepare * thr));
      // S2：猫的四邻里人的痕迹最高的那格补满——路铺向人多的地方（痕迹档；座位三态走 guide()）
      if (this.goal && this.trigger === 'trace') {
        let best: PlanUnit | null = null;
        let bv = 0.25 * thr;
        for (const nb of this.neighboursOf(c.unit)) {
          const v = peopleIn[nb.i]; // 人的那份
          if (v > bv) {
            bv = v;
            best = nb;
          }
        }
        if (best) inputs[best.i] = Math.max(inputs[best.i], thr);
      }
    }
    if (this.goal && this.trigger === 'posture') this.guide(inputs, thr);
    const before = Float64Array.from(this.act.degree);
    const gate = (this.clearance !== null && !this.faces) || this.people.some((p) => p.seated) ? this.blocked : null;
    this.act.update(inputs, this.act.mode === 'follow' ? dt : Infinity, gate);
    if (this.faces) {
      this.holdBands();
      this.requestBands();
      this.advanceBands(dt);
    }
    const planWall = this.faces ? this.bandHard : null;
    // R5：这一步要成墙的单元按读数从高到低逐个试加，加了会困住人的钉回墙线以下
    this.wallScratch.set(this.wall);
    const rising: number[] = [];
    for (let u = 0; u < before.length; u++) {
      if (this.act.degree[u] >= COHABIT.WALL_AT && before[u] < COHABIT.WALL_AT) rising.push(u);
      else if (this.act.degree[u] < COHABIT.WALL_AT) this.wallScratch[u] = 0;
    }
    rising.sort((a, b) => inputs[b] - inputs[a]);
    this.heldR5.fill(0);
    for (const u of rising) {
      this.wallScratch[u] = 1;
      if (!this.exitOk(this.wallScratch, planWall)) {
        this.wallScratch[u] = 0;
        this.act.degree[u] = COHABIT.WALL_AT - 1e-3;
        this.heldR5[u] = 1;
      }
    }
    // 猫的脚下不可能被收回（占用钉住），但跟随档下若读数被让位压过——这里再钉一次
    for (const c of this.cats) this.keepSupport(c);
    this.refreshWalls();
  }

  /**
   * 座位三态的空间目的（作者 2026-10-07「引导的重心放在猫身上，如何构建空间引导猫向人走去」）：
   *   坐着 = 全力：从最近一只能来的猫（不在潜伏期、没被别的坐着的人引着、没被拿着）脚下沿在场单元一路
   *     找到这个座位的会面台，**只落下一步**（猫到了下一台再落再下一步）——落着的始终只有猫脚下与下一步；
   *   站定 = 部分：停住满 STAND_S 且看着一只猫，朝这个人只给那只猫**一步**（每次站定只给一次；整台让路下
   *     落了会打到人的那台不给）；
   *   走着 = 不触发（地面不留痕迹）。
   * 落不落仍过 R5；走不走仍是猫的事（它优先走递过来的那台，见 offeredNext）。
   */
  private guide(inputs: Float64Array, thr: number): void {
    const S = COHABIT.SEATS;
    const taken = new Set<number>();
    const offer = (u: number) => {
      inputs[u] = Math.max(inputs[u], thr);
    };
    const free = (c: Cat) => !taken.has(c.id) && !!c.unit && c.mode !== 'held' && c.latency <= 0;
    for (const p of this.people) {
      if (!p.seated || p.seat === null) continue;
      const meet = this.seats[p.seat].meet;
      let best: { c: Cat; path: number[] } | null = null;
      for (const c of this.cats) {
        if (!free(c)) continue;
        // 绕开被闸住的单元（坐着的人头顶、整台口径下会打到人的）——落不下来的路不铺
        const path = this.unitPath((c.transfer ? c.transfer.to : c.unit!).i, meet, this.blocked);
        if (path && (!best || path.length < best.path.length)) best = { c, path };
      }
      if (!best) continue;
      taken.add(best.c.id);
      if (best.path.length > 1) offer(best.path[1]);
      this.guides.push({ kind: 'sit', person: p.id, cat: best.c.id, path: best.path });
    }
    for (const p of this.people) {
      if (p.seated) continue;
      if (p.offer) {
        const c = this.cats.find((k) => k.id === p.offer!.cat);
        // 猫挪走了（到了这一步或去了别处）、被坐着的人引走了：这一步就收回，这次站定不再给
        if (!c || !c.unit || c.unit.i !== p.offer.from || taken.has(c.id)) {
          p.offer = null;
          continue;
        }
        taken.add(c.id);
        offer(p.offer.unit);
        this.guides.push({ kind: 'stand', person: p.id, cat: c.id, path: [p.offer.from, p.offer.unit] });
        continue;
      }
      if (p.offered || p.watchFor < S.STAND_S || p.watching === null) continue;
      const c = this.cats.find((k) => k.id === p.watching);
      if (!c || !free(c) || c.transfer || c.pending) continue;
      const w = p.walker;
      let pick: PlanUnit | null = null;
      let pd = Math.hypot(c.unit!.x - w.x, c.unit!.y - w.y) - 1e-6;
      for (const nb of this.neighboursOf(c.unit!)) {
        if (this.blocked[nb.i]) continue;
        const d = Math.hypot(nb.x - w.x, nb.y - w.y);
        if (d < pd) {
          pd = d;
          pick = nb;
        }
      }
      if (!pick) continue; // 猫已经在离他最近的那台上：没有可给的一步
      p.offered = true;
      p.offer = { cat: c.id, from: c.unit!.i, unit: pick.i };
      taken.add(c.id);
      offer(pick.i);
      this.guides.push({ kind: 'stand', person: p.id, cat: c.id, path: [c.unit!.i, pick.i] });
    }
  }

  // ── 四类事件记账（R4：只按结果） ──────────────────────────────────────────

  private account(dt: number): void {
    this.links = [];
    const K = COHABIT;
    for (const p of this.people) {
      const w = p.walker;
      if (!w.present) continue;
      for (const c of this.cats) {
        const key = `${p.id}:${c.id}`;
        let st = this.pairs.get(key);
        if (!st) {
          st = { active: { gaze: false, warmth: false, touch: false, pass: false }, hold: { gaze: 0, warmth: 0, touch: 0, pass: 0 } };
          this.pairs.set(key, st);
        }
        const dx = c.walker.x - w.x;
        const dy = c.walker.y - w.y;
        const d = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const standing = w.state !== 'walk' && !p.moving;
        const mutual =
          d <= K.GAZE_D &&
          Math.abs(wrapAngle(ang - w.gaze)) <= K.GAZE_HALF.person &&
          Math.abs(wrapAngle(ang + Math.PI - c.walker.gaze)) <= K.GAZE_HALF.cat;
        const now: Record<EventKind, boolean> = {
          touch: d < K.BAND.near,
          warmth: d >= K.BAND.near && d < K.BAND.far && standing,
          pass: d < K.BAND.far && !standing && d >= K.BAND.near,
          gaze: mutual,
        };
        for (const kind of ['gaze', 'warmth', 'touch', 'pass'] as const) {
          if (now[kind]) {
            st.hold[kind] += dt;
            const min = kind === 'gaze' ? K.MIN_S.gaze : kind === 'warmth' ? K.MIN_S.warmth : 0;
            if (!st.active[kind] && st.hold[kind] >= min) {
              st.active[kind] = true;
              this.ledger.counts[kind]++;
            }
            if (st.active[kind]) {
              this.ledger.seconds[kind] += dt;
              this.links.push({ x1: w.x, y1: w.y, x2: c.walker.x, y2: c.walker.y, kind });
            }
          } else {
            st.hold[kind] = 0;
            st.active[kind] = false;
          }
        }
      }
    }
  }

  // ── 读数汇总 ──────────────────────────────────────────────────────────────

  summary(): CohabitSummary {
    let far = 0;
    let present = 0;
    let settled = 0;
    let transfers = 0;
    for (const c of this.cats) {
      far += c.farTime;
      present += c.presentTime;
      settled += c.settledTime;
      transfers += c.transfers;
    }
    let detour = 0;
    let straight = 0;
    let seatedTime = 0;
    let seated = 0;
    for (const p of this.people) {
      detour += p.detour;
      straight += p.straight;
      seatedTime += p.seatedTime;
      if (p.seated) seated++;
    }
    let held = 0;
    for (let u = 0; u < this.heldR5.length; u++) held += this.heldR5[u];
    let bandsOpen = 0;
    if (this.faces)
      for (let i = 0; i < this.bandOpen.length; i++) if (this.bandOpen[i] >= 0.5 && this.act.degree[(i / BANDS) | 0] >= COHABIT.WALL_AT) bandsOpen++;
    return {
      t: this.t,
      ledger: { counts: { ...this.ledger.counts }, seconds: { ...this.ledger.seconds } },
      catFarShare: present > 0 ? far / present : 1,
      catSettled: settled,
      catTransfers: transfers,
      detour,
      detourShare: straight + detour > 0 ? detour / (straight + detour) : 0,
      formed: this.act.formed().length,
      walls: this.wall.reduce((a, b) => a + b, 0),
      heldR5: held,
      bandsOpen,
      people: this.people.length,
      cats: this.cats.length,
      seated,
      seatedTime,
      catArrivals: this.catArrivals,
      guides: this.guides.length,
    };
  }
}

export interface CohabitSummary {
  t: number;
  ledger: Ledger;
  /** 猫与最近访客 > 1 m 的时间占比（M&T 的参照是 0.78） */
  catFarShare: number;
  /** 猫安稳待着（坐 / 卧 / 靠近到位）的秒数 */
  catSettled: number;
  catTransfers: number;
  /** 访客比直线多走的米数与占比 */
  detour: number;
  detourShare: number;
  formed: number;
  walls: number;
  heldR5: number;
  /** 按带让路：此刻收回着的带（在成了墙的单元上）有几条 */
  bandsOpen: number;
  people: number;
  cats: number;
  /** 座位三态：此刻坐着几人 · 累计坐了多少人·秒 · 猫落到正坐着人的会面台几次 · 此刻空间在铺几条路 */
  seated: number;
  seatedTime: number;
  catArrivals: number;
  guides: number;
}

export interface RunOpts extends CohabitOpts {
  seconds?: number;
  dt?: number;
  people?: number;
  cats?: number;
}

/** 离线跑一场（线稿 / 对照 / 守门用）：固定步长、带种子逐位可复现 */
export function runCohabit(opts: RunOpts = {}): CohabitSummary {
  const sim = new CohabitSim({ ...opts, opening: false });
  const half = sim.layout.fieldM / 2;
  const nP = opts.people ?? 2;
  const nC = opts.cats ?? 1;
  for (let i = 0; i < nP; i++) {
    const x = ((i % 2) * 2 - 1) * half * 0.6;
    const y = (Math.floor(i / 2) - 0.5) * half * 0.6;
    // 座位三态：从最近一个能站的交叉点起步（别把人放进家具里）
    const k = sim.furn ? nearestNode(sim.graph, x, y) : -1;
    if (k >= 0) sim.addPerson(sim.graph.nodes[k].x, sim.graph.nodes[k].y);
    else sim.addPerson(x, y);
  }
  for (let i = 0; i < nC; i++) sim.addCat(sim.layout.units[(i * 5) % sim.layout.units.length]);
  const dt = opts.dt ?? 1 / 30;
  const T = opts.seconds ?? 300;
  for (let t = 0; t < T; t += dt) sim.step(dt);
  return sim.summary();
}
