/**
 * 项目二 · 2×2 / 3×3 小样（2026-11-09，方案 = 项目二_小样方案.md；作者「按你的说法先做几台……人和猫按脚本跑，不用仿真，摆成需要的形态就行」）。
 *
 * 一个小样 = 从 2-15 那间房里取一小块：**同一种方台、同一个格距**（`planLayout(8, …, 'room')` 的 0.83 m）、同一套轨迹与机构，
 * 只是场地缩到 2×2（1.66 m 见方）或 3×3（2.49 m）。哪一台什么时候落、成什么形、人和猫在哪、什么姿态，全按下面的脚本走，
 * **不跑 CohabitSim**：仿真的规则是按整间房写的，在两三格的场地里跑出来说明不了什么（方案 §7 第 5 条，作者同意）。
 * 所以小样是按脚本演的设计提案，不是仿真结果；研究读数仍只看 2-14 / 2-15。
 *
 * 对外给出的读数与 CohabitSim 同一个形状（`SpaceSimLike`）：每台的程度、每条带收回了几成、家具与座位、人、猫——
 * Lab 2-15 的台架（CohabitSpaceBench）照常读它画，带子轨迹、机构件、蒙皮、人和猫的方块模型一行不改。
 * 多出来的三样只有脚本给：每台成什么形（`formOf`）、台面落到多高（`topOf`）、猫此刻离地多高（`cat.h`，站上台的上层时用）。
 *
 * 2026-11-16 起每台的形由 cohabit-design 给（项目二_形态与组合的连接.md §5）：脚本说这台在这件事里做什么，函数按之前的研究给形、
 * 记下用上了哪几台研究，台架按它挂标签、列图例。六个小样（全部只用 2-15 已经烘好的两组轨迹：平台三档、两个结构六条）：
 *   guide   3×3 · 坐下，把地上的猫引过来：桌子 + 路上两步（朝下一台斜、接缝齐平）+ 座位前方那台（两层，上层盖背后半圈）——
 *           平面模型的读数原样交给 designUnit，与 2-15 立体以后要接的是同一个函数（2-3 · 2-6 · 2-9 · 2-13 · 2-14）
 *   tea     3×3 · 茶几兼猫台：朝沙发那半圈只成下层当茶几，背后半圈两块都成，邻台与上层齐平（2-3 · 2-6 · 2-9 · 2-14）
 *   cavity  2×2 · 两台整圈两层相邻，两块之间的空连成一条腔，两只猫各坐一头（2-3 · 2-13）
 *   counter 2×2 · 站桌：整圈两层，上层当站着用的台面、下层给猫，邻台与上层齐平（2-3 · 2-9）
 *   step    2×2 · 先低后高：一半低一半高，邻台与高的那半齐平（2-6 · 2-13）
 *   giveway 2×2 · 四台围着一个过道交叉点，人走过时只收挡路的带（2-6 · 2-14）
 */
import { PLAN, planLayout, type PlanLayout, type PlanUnit } from './unit-activation';
import { RING } from './skin-ring';
import { COHABIT, bandAngle, furnKind, furnRect, squarePlanLayout, tableFor, type FurnRect, type FurnSpec, type Link, type SpaceMode } from './cohabit';
import { RING_SIDE, TABLE_TOP } from './cohabit-solid';
import {
  DESIGN,
  aisleDesign,
  cavityDesign,
  counterDesign,
  designUnit,
  flushDesign,
  heightToward,
  liftOf,
  stairDesign,
  teaShelfDesign,
  type DesignSim,
  type UnitDesign,
} from './cohabit-design';

const BANDS = COHABIT.FACES.BANDS;

// ── 与 CohabitSim 同一个形状的读数（台架只读这些）────────────────────────────────────
export interface SimWalker {
  x: number;
  y: number;
  heading: number;
  gaze: number;
}
export interface SimPerson {
  walker: SimWalker;
  seated: boolean;
  seat: number | null;
  watching: number | null;
  ignores: boolean;
}
export interface SimCat {
  walker: { x: number; y: number; heading: number };
  state: string;
  /** 脚本给的离地高度（m）：站在两层台的上台上、或正在跳上跳下时用；省略 = 台架按脚下那台的台面算 */
  h?: number;
}
export interface SimSeat {
  x: number;
  y: number;
  face: readonly [number, number];
  furn: number;
  table: number;
}
/** 一台此刻成什么形：bands = 二十条带各取两个结构的哪一种（1 = 两块都成、0 = 只成下台），null = 平台；toward = 有顶的那台敞开那半圈朝哪 */
export interface UnitForm {
  bands: Uint8Array | null;
  toward: number | null;
  /** 平台三档、各条带的台面各抬多少（m，≥ 0，至少一条是 0）：续坡与「先低后高」（台架用 liftTrajectory 纯平移） */
  lift?: readonly number[];
}
export interface SpaceSimLike {
  readonly layout: PlanLayout;
  readonly space: SpaceMode;
  t: number;
  readonly act: { readonly degree: ArrayLike<number> };
  readonly bandOpen: ArrayLike<number>;
  readonly tableBy: ArrayLike<number>;
  readonly furn: { readonly rects: readonly FurnRect[] } | null;
  readonly seats: readonly SimSeat[];
  readonly people: readonly SimPerson[];
  readonly cats: readonly SimCat[];
  readonly links: readonly Link[];
  step(dt: number): void;
  supportOf(c: SimCat): PlanUnit[];
  drawPos(p: SimPerson): { x: number; y: number };
  summary(): { t: number; formed: number; ledger: { counts: { gaze: number; warmth: number; touch: number; pass: number } } };
  formOf?(u: number): UnitForm;
  topOf?(u: number): number;
}

// ── 尺寸 ─────────────────────────────────────────────────────────────────────────
/** 两个结构的带：上台台面比下台台面高多少（m）。数在 cohabit-design 的 DESIGN.UPPER（守门按烘好的轨迹现量核对） */
export const UPPER_ABOVE = DESIGN.UPPER;
/** 台面高度（m）：站着用的平台、沙发前的茶几、两层台的下台——都与 2-15 同一组数 */
export const TOPS = { stand: 1.05, tea: 0.42, lower: 0.9 } as const;
/** 茶几台边离沙发前缘（m）：COHABIT.TABLE.SOFA_GAP 0.30–0.46 取中 */
export const TEA_GAP = 0.38;
/** 单元落下（升降 + 成形）与收回各用几秒：升降 3 s、成形 5 s；收回反过来 */
export const RAMP = { drop: 3, form: 5, unform: 4, hoist: 3 } as const;
/** 让路：人身子半径加多少余量（m，2-14 的让位默认 0.15）、往前看几秒（收回 2 s + 1 s 余量） */
export const GIVE = { clear: 0.15, ahead: 3, open: COHABIT.FACES.open, close: COHABIT.FACES.close, catHalf: Math.PI / 3 } as const;

/** 台上坐在台心的猫在一圈的哪个方位（与 cohabit-solid catPlacement 同一条：离它看的方向绕回 RING_SIDE） */
export function catRingAngle(heading: number): number {
  return heading - RING_SIDE;
}

/** 小样的场地：从 2-15 那间房的 8×8 取格距、平台与芯的尺寸，场地缩到 n×n 格（房间 = n 个格距见方） */
export function vignetteLayout(n: number): PlanLayout {
  const room = squarePlanLayout(planLayout(COHABIT.SEATS.GRID, RING.RADIUS_DEF, 'room'));
  const p = room.pitchM;
  const units: PlanUnit[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) units.push({ i: r * n + c, row: r, col: c, x: (c - (n - 1) / 2) * p, y: (r - (n - 1) / 2) * p });
  return { ...room, n, roomM: n * p, fieldM: n * p, units, doors: [] };
}

// ── 脚本的小工具 ───────────────────────────────────────────────────────────────────
type Keys = readonly (readonly [number, number])[];
/** 分段线性插值（两端外延取端点值） */
export function keysAt(keys: Keys, t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return t1 <= t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return keys[keys.length - 1][1];
}
/** 一台的程度：t0 开始落（升降 → 成形），t1 开始收（成形退回 → 升回天花）；t1 省略 = 不收 */
export function unitRamp(t0: number, t1?: number): Keys {
  const k: [number, number][] = [
    [t0, 0],
    [t0 + RAMP.drop, COHABIT.WALL_AT],
    [t0 + RAMP.drop + RAMP.form, 1],
  ];
  if (t1 !== undefined) k.push([t1, 1], [t1 + RAMP.unform, COHABIT.WALL_AT], [t1 + RAMP.unform + RAMP.hoist, 0]);
  return k;
}
/** 一直落着的那台（猫的家）：开场就是成形态 */
const ALWAYS: Keys = [[0, 1]];

/** 路线：[时刻, x, y]；停着的段写两个同位置的点。朝向取所在那一段的方向，停着时沿用上一段 */
export type Path = readonly (readonly [number, number, number])[];
export function pathAt(path: Path, t: number): { x: number; y: number; heading: number; moving: boolean } {
  let heading = 0;
  // 朝向：最后一段走过的方向（停着时保持）
  const dir = (i: number): number | null => {
    const [, x0, y0] = path[i - 1];
    const [, x1, y1] = path[i];
    return Math.hypot(x1 - x0, y1 - y0) > 1e-6 ? Math.atan2(y1 - y0, x1 - x0) : null;
  };
  for (let i = 1; i < path.length; i++) {
    const d = dir(i);
    if (d !== null) {
      heading = d;
      break;
    }
  }
  if (t <= path[0][0]) return { x: path[0][1], y: path[0][2], heading, moving: false };
  for (let i = 1; i < path.length; i++) {
    const d = dir(i);
    const [t1, x1, y1] = path[i];
    if (t <= t1) {
      const [t0, x0, y0] = path[i - 1];
      const a = t1 <= t0 ? 1 : (t - t0) / (t1 - t0);
      return { x: x0 + (x1 - x0) * a, y: y0 + (y1 - y0) * a, heading: d ?? heading, moving: d !== null };
    }
    if (d !== null) heading = d;
  }
  const last = path[path.length - 1];
  return { x: last[1], y: last[2], heading, moving: false };
}

/** 一位访客的脚本：路线 + 坐在哪个座位上的那段时间 + 看谁 */
interface PersonScript {
  path: Path;
  /** [起, 止, 座位号] */
  sit?: readonly [number, number, number];
  /** 看着第几只猫的时间段 [起, 止, 猫号]：坐着时前倾，头转向猫 */
  watch?: readonly (readonly [number, number, number])[];
}
/** 一只猫的一段：时刻、平面位置（台上时 = 台心，朝向决定坐在一圈的哪里）、脚下的台（两台 = 正在跨台）、状态、离地高度 */
export interface CatBeat {
  t: number;
  x: number;
  y: number;
  heading: number;
  on: readonly number[];
  state: 'sit' | 'lie' | 'walk' | 'approach';
  /** 离地高度（m）：省略 = 按脚下那台的台面（台架算）；地面上省略 = 0 */
  h?: number;
}
/** 一句旁白：从这一刻起显示 */
export interface Beat {
  t: number;
  zh: string;
  en: string;
}
interface UnitScript {
  deg: Keys;
  /** 这台的形：一律由 cohabit-design 给（不在脚本里手写） */
  design: UnitDesign;
  /** 台上的标签（图例按它对上） */
  tag: string;
}
export interface VignetteScript {
  n: number;
  duration: number;
  furniture: readonly FurnSpec[];
  units: readonly (UnitScript | null)[];
  people: readonly PersonScript[];
  cats: readonly (readonly CatBeat[])[];
  beats: readonly Beat[];
  /** 让路：按人的路线现算哪些带收回（giveway 用） */
  giveWay?: boolean;
}

/** 座位点（与 cohabit placeSeats 同一个算法：沿家具宽偏 o、沿朝向缩进 seatIn） */
export function seatPoints(specs: readonly FurnSpec[]): SimSeat[] {
  const out: SimSeat[] = [];
  specs.forEach((f, fi) => {
    const r = furnRect(f);
    const kd = furnKind(r);
    const tx = -r.face[1];
    const ty = r.face[0];
    for (const o of kd.seats) out.push({ x: r.cx + tx * o + r.face[0] * kd.seatIn, y: r.cy + ty * o + r.face[1] * kd.seatIn, face: r.face, furn: fi, table: -1 });
  });
  return out;
}

// ── 六个小样 ───────────────────────────────────────────────────────────────────────
/*
 * 2026-11-16 起（作者「先把我们之前做的那么多工作，就是建立的那个联系，给它联系到那个小样里面去，让我这个小样里能看得出来
 * 是用上我这些之前做的那么多工作的」）：每台成什么形不再在脚本里手写，一律交给 cohabit-design——先说这台在这件事里做什么
 * （桌子 / 路上的一步 / 座位前方那台 / 站桌 / 接上邻台 / 合腔 / 先低后高 / 让路），再由它按之前的研究给形，并记下用上了哪几台研究
 * （design.uses），台架按它挂标签、列图例。脚本只管人、猫与时刻。
 */
export type VignetteKey = 'guide' | 'tea' | 'cavity' | 'counter' | 'step' | 'giveway' | 'stillguide';
export const VIGNETTES = [
  { key: 'guide', n: 3, zh: '坐下，把地上的猫引过来', en: 'Sitting down draws a cat up from the floor' },
  { key: 'tea', n: 3, zh: '茶几兼猫台', en: 'Coffee table and cat shelf' },
  { key: 'cavity', n: 2, zh: '两台连成一条腔', en: 'Two units, one cavity' },
  { key: 'counter', n: 2, zh: '站桌下给猫一层', en: 'A shelf under the standing counter' },
  { key: 'step', n: 2, zh: '先低后高', en: 'Low half, then high half' },
  { key: 'giveway', n: 2, zh: '交叉点让路', en: 'Giving way at a crossing' },
] as const satisfies readonly { key: VignetteKey; n: number; zh: string; en: string }[];
/**
 * 只用来出静帧线稿的场景（scripts/moments，2026-11-23）：不进 Lab 2-16 的按钮与差分清单，用 /lab#lab2-16-<键> 打开。
 * 与上面六个的差别是时刻照规则文档排（项目二_输入到输出的规则.md §4、§5），不为演示好看挪先后。
 */
export const STILL_SCENES = [
  { key: 'stillguide', n: 3, zh: '坐下那一刻桌子落下，同时给地上的猫落第一步', en: 'On sitting, the table comes down and the first step is laid for the cat' },
] as const satisfies readonly { key: VignetteKey; n: number; zh: string; en: string }[];

/** 3×3 / 2×2 的格心坐标（行优先，与 vignetteLayout 同序） */
function cell(n: number, p: number, r: number, c: number): { i: number; x: number; y: number } {
  return { i: r * n + c, x: (c - (n - 1) / 2) * p, y: (r - (n - 1) / 2) * p };
}
/** 一台的脚本：程度时间表 + 对应函数给的形 + 台上标签 */
function unitOf(deg: Keys, design: UnitDesign, tag: string): UnitScript {
  return { deg, design, tag };
}
/** 猫在一台上坐在环的方位角 th 那里：脚本的平面点（ringSpot）与离地高度（那一处的台面，斜台按位置取） */
function onRing(u: { i: number; x: number; y: number }, d: UnitDesign, th: number, t: number, state: CatBeat['state'], heading: number): CatBeat {
  const at = ringSpot(u, th);
  return { t, x: at.x, y: at.y, heading, on: [u.i], state, h: heightToward(d, th) };
}
const m2 = (v: number): string => v.toFixed(2);

/**
 * 坐下，把地上的猫引过来（3×3）。2-15 里最常见的一件事（坐下引猫的路 600 s 里 61–95 条，大半从地面上的猫开始），
 * 这里把它整件演一遍：平面模型此刻给出的读数（谁坐着、哪台是他的桌子、空间给哪只猫铺了哪条路）原样交给 designUnit，
 * 桌子、路上两步、座位前方那台各自的形都是它算的——与 2-15 立体以后要接的是同一个函数。
 * 路在房间中间、下面不压家具，所以第一步低的那一端能落到 0.42 m。
 */
function guideScript(l: PlanLayout, byRule = false): VignetteScript {
  const n = 3;
  const p = l.pitchM;
  const half = l.roomM / 2;
  const chair = furnKind({ kind: 'chair', ergo: true });
  const furniture: FurnSpec[] = [{ kind: 'chair', x: cell(n, p, 2, 2).x, y: half - chair.d / 2 - 0.08, face: [0, -1], ergo: true }];
  const rects = furniture.map(furnRect);
  const seats = seatPoints(furniture);
  const S = seats[0];
  // 桌子那台：2-14 / 2-15 的桌子规则按几何定（在人面前、台面盖住座位中线、不压家具……）
  const tIdx = tableFor(l, rects, seats, S);
  const T = l.units[tIdx >= 0 ? tIdx : cell(n, p, 1, 2).i];
  const A = cell(n, p, 2, 0); // 第一步（猫从它西边的地面跳上来）
  const B = cell(n, p, 2, 1); // 第二步，在这里拐向座位
  const M = cell(n, p, 1, 1); // 座位前方那台（离座位 1.0–1.5 m，守门核对）
  const catStart = { x: -half - 0.02, y: A.y };
  const path = [A.i, B.i, M.i];
  // 平面模型此刻的读数：访客坐着、桌子那台归他、猫在地上、空间给猫铺了这条路——2-15 的 CohabitSim 给的就是这几样
  const tableBy = new Array<number>(n * n).fill(-1);
  tableBy[T.i] = 0;
  const snap: DesignSim = {
    layout: l,
    tableBy,
    furn: { rects },
    seats,
    people: [{ id: 0, seated: true, seat: 0 }],
    cats: [{ id: 0, unit: null, state: 'walk', walker: catStart }],
    guides: [{ kind: 'sit', person: 0, cat: 0, path }],
  };
  const formed: (UnitDesign | null)[] = new Array(n * n).fill(null);
  for (const u of [T.i, ...path]) formed[u] = designUnit(snap, u, formed);
  const dT = formed[T.i]!;
  const dA = formed[A.i]!;
  const dB = formed[B.i]!;
  const dM = formed[M.i]!;
  // 时刻：桌子先落（2026-11-10 作者「桌子先落」），猫走到了再落下一步（2-14 一次只落一步），身后那台随即收回
  // byRule（静帧用）：桌子在坐下那一刻落（§5），猫的第一步也在坐下那一步落（§4 ③），猫等着的时候坐着
  const tT = byRule ? 6 : 2.5;
  const sit = byRule ? tT : tT + RAMP.drop + RAMP.form;
  const t1 = byRule ? sit : 13;
  const on1 = t1 + RAMP.drop + RAMP.form + 0.5; // 猫跳上第一步
  const t2 = on1 + 0.5;
  const x2 = t2 + RAMP.drop + RAMP.form + 3; // 走过第一道接缝（第二步成形以后才开始跨，跨 2.5 s）
  const t3 = x2 + 0.5;
  const x3 = t3 + RAMP.drop + RAMP.form + 3; // 走进座位前方那台
  const leave = x3 + 16;
  const units: (UnitScript | null)[] = Array.from({ length: n * n }, () => null);
  units[T.i] = unitOf(unitRamp(tT, leave + 0.5), dT, 'A');
  units[A.i] = unitOf(unitRamp(t1, x2 + 3), dA, 'B');
  units[B.i] = unitOf(unitRamp(t2, x3 + 3), dB, 'C');
  units[M.i] = unitOf(unitRamp(t3, leave + 5), dM, 'D');
  const enter: [number, number] = [half + 0.3, S.y - 0.5];
  const front: [number, number] = [S.x - 0.05, S.y - 0.4];
  const W = Math.PI;
  const E = 0;
  const N = -Math.PI / 2;
  const down: [number, number] = [M.x - l.platR - 0.12, M.y];
  const cat: CatBeat[] = [
    { t: 0, x: catStart.x, y: catStart.y, heading: byRule ? E : N, on: [], state: byRule ? 'sit' : 'lie', h: 0 },
    { t: on1 - 3, x: catStart.x, y: catStart.y, heading: E, on: [], state: 'sit', h: 0 },
    { t: on1 - 0.6, x: catStart.x, y: catStart.y, heading: E, on: [], state: 'walk', h: 0 },
    // 跳上第一步低的那一端（西边，0.42 m），沿环的南边走到东边高的那一端
    onRing(A, dA, W, on1, 'walk', N),
    onRing(A, dA, (3 * Math.PI) / 4, on1 + 0.7, 'walk', N),
    onRing(A, dA, Math.PI / 2, on1 + 1.4, 'walk', E),
    onRing(A, dA, Math.PI / 4, on1 + 2.1, 'walk', E),
    onRing(A, dA, E, on1 + 2.8, 'sit', E),
    onRing(A, dA, E, x2 - 2.6, 'sit', E),
    // 跨过第一道接缝：两边一样高
    { t: x2 - 2.5, x: A.x, y: A.y, heading: E, on: [A.i, B.i], state: 'walk', h: heightToward(dA, E) },
    { t: x2, x: B.x, y: B.y, heading: E, on: [A.i, B.i], state: 'walk', h: heightToward(dB, W) },
    onRing(B, dB, W, x2 + 0.1, 'walk', N),
    onRing(B, dB, (-3 * Math.PI) / 4, x2 + 0.8, 'walk', N),
    onRing(B, dB, N, x2 + 1.5, 'sit', N),
    onRing(B, dB, N, x3 - 2.6, 'sit', N),
    { t: x3 - 2.5, x: B.x, y: B.y, heading: N, on: [B.i, M.i], state: 'walk', h: heightToward(dB, N) },
    { t: x3, x: M.x, y: M.y, heading: N, on: [B.i, M.i], state: 'walk', h: dM.top },
    // 座位前方那台：坐进有顶那半边（台架按敞开那半圈的方向摆），下层 0.90 m
    { t: x3 + 0.1, x: M.x, y: M.y, heading: N, on: [M.i], state: 'sit', h: dM.top },
    { t: leave + 3.4, x: M.x, y: M.y, heading: N, on: [M.i], state: 'sit', h: dM.top },
    { t: leave + 3.8, x: down[0] + 0.12, y: down[1], heading: W, on: [], state: 'walk', h: dM.top },
    { t: leave + 4.2, x: down[0], y: down[1], heading: W, on: [], state: 'walk', h: 0 },
    { t: leave + 6.5, x: catStart.x, y: down[1], heading: W, on: [], state: 'walk', h: 0 },
    { t: leave + 7.5, x: catStart.x, y: catStart.y, heading: Math.PI / 2, on: [], state: 'walk', h: 0 },
    { t: leave + 7.6, x: catStart.x, y: catStart.y, heading: N, on: [], state: 'lie', h: 0 },
  ];
  const sA = dA.slope!;
  const sB = dB.slope!;
  return {
    n,
    duration: leave + 12,
    furniture,
    units,
    people: [
      {
        path: [
          [0, ...enter],
          [byRule ? 1.5 : tT - 0.5, ...enter],
          [sit - 1, ...front],
          [sit, ...front],
          [leave, ...front],
          [leave + 0.5, ...front],
          [leave + 3.5, ...enter],
          [leave + 12, ...enter],
        ],
        sit: [sit, leave, 0],
        watch: [[sit + 1, leave, 0]],
      },
    ],
    cats: [cat],
    beats: [
      { t: 0, zh: '猫在地上，房间西边。单元都收在天花板下', en: 'The cat is on the floor by the west wall; every unit is stowed at the ceiling' },
      ...(byRule
        ? [
            { t: 1.5, zh: '一位访客走进来，走向椅子。走着的时候没有单元落下', en: 'A visitor comes in and walks to the chair. Nothing comes down while the visitor is walking' },
            { t: sit, zh: `访客坐下。这一刻椅子前面那台落下当桌子（${m2(dT.top)} m），同时给地上的猫落第一步`, en: `The visitor sits. At that moment the unit in front of the chair comes down as a table (${m2(dT.top)} m) and the first step is laid for the cat on the floor` },
          ]
        : [
            { t: tT - 0.5, zh: `一位访客走进来。他要坐的椅子前面那台先落下当桌子（${m2(dT.top)} m）`, en: `A visitor comes in. The unit in front of the chair comes down first as a table (${m2(dT.top)} m)` },
            { t: sit, zh: '桌子落好了，访客坐下，看着地上的猫', en: 'With the table in place, the visitor sits and watches the cat on the floor' },
          ]),
      { t: t1 + (byRule ? 0.01 : 0), zh: `空间给猫铺第一步：靠猫那一侧低（${m2(sA.from)} m），朝下一台那侧高（${m2(sA.to)} m）`, en: `The room lays the first step: low on the cat’s side (${m2(sA.from)} m), high toward the next unit (${m2(sA.to)} m)` },
      { t: on1, zh: '猫跳上低的那一端，沿坡走上去', en: 'The cat hops onto the low end and walks up the slope' },
      { t: t2, zh: `第二步落下，在这一台拐向座位，从 ${m2(sB.from)} m 升到 ${m2(sB.to)} m。接缝两边一样高，猫不用跳`, en: `The second step comes down and turns toward the seat, rising from ${m2(sB.from)} to ${m2(sB.to)} m; the seams are level, so the cat need not jump` },
      { t: t3, zh: `最后一台落成两层：下层 ${m2(dM.top)} m，猫坐上去眼睛与坐着的人一样高；上层盖住背向座位的半圈`, en: `The last unit forms two levels: the lower at ${m2(dM.top)} m puts a sitting cat at the visitor’s eye height; the upper covers the half facing away from the seat` },
      { t: x3, zh: '猫走进有顶的那半边坐下，转头看着人。身后两台收回', en: 'The cat settles under the roof and turns to watch the visitor; the two units behind it retract' },
      { t: leave, zh: '人起身离开，桌子收回；猫跳下来回到地上，最后那台也收回', en: 'The visitor leaves and the table retracts; the cat jumps down and the last unit goes up too' },
    ],
  };
}

function teaScript(l: PlanLayout): VignetteScript {
  const n = 3;
  const p = l.pitchM;
  const T = cell(n, p, 2, 1); // 茶几那台（下中）
  const R = cell(n, p, 2, 2); // 猫的家（右下），一直落着，台面与上台同高
  const sofa = furnKind({ kind: 'sofa', ergo: true });
  // 沙发朝 +y、靠房间后半：前缘离茶几台边 TEA_GAP
  const sofaY = T.y - l.platR - TEA_GAP - sofa.d / 2;
  const face: readonly [number, number] = [0, 1];
  const furniture: FurnSpec[] = [{ kind: 'sofa', x: 0, y: sofaY, face, ergo: true }];
  const seats = seatPoints(furniture);
  const seat = 0; // 右边那个座位（离猫近）
  const S = seats[seat];
  const dT = teaShelfDesign(face);
  const dR = flushDesign(dT);
  const upper = dR.top;
  const units: (UnitScript | null)[] = Array.from({ length: n * n }, () => null);
  // 桌子先落（2026-11-10 作者「人坐在桌前，当桌子用的单元没有先降下来」）：访客一进门就开始落，落好了人才坐下
  units[T.i] = unitOf(unitRamp(2.5, 33), dT, 'A');
  units[R.i] = unitOf(ALWAYS, dR, 'B');
  const enter: [number, number] = [l.roomM / 2 + 0.25, sofaY + 0.15];
  const front: [number, number] = [S.x, S.y + 0.42];
  const toCat = Math.atan2(R.y - S.y, R.x - S.x);
  const toT = Math.PI; // 从 R 往茶几那台走（−x）
  return {
    n,
    duration: 46,
    furniture,
    units,
    people: [
      {
        path: [
          [0, ...enter],
          [2, ...enter],
          [9, ...front],
          [10.5, ...front],
          [28, ...front],
          [29, ...front],
          [33, ...enter],
          [46, ...enter],
        ],
        sit: [10.5, 28, seat],
        watch: [[17, 28, 0]],
      },
    ],
    cats: [
      [
        { t: 0, x: R.x, y: R.y, heading: toT, on: [R.i], state: 'lie', h: upper },
        { t: 16.5, x: R.x, y: R.y, heading: toT, on: [R.i], state: 'sit', h: upper },
        { t: 17, x: R.x, y: R.y, heading: toT, on: [R.i, T.i], state: 'walk', h: upper },
        { t: 19.5, x: T.x, y: T.y, heading: toT, on: [R.i, T.i], state: 'walk', h: upper },
        { t: 19.6, x: T.x, y: T.y, heading: toCat + Math.PI, on: [T.i], state: 'sit', h: upper },
        { t: 28.5, x: T.x, y: T.y, heading: toCat + Math.PI, on: [T.i], state: 'sit', h: upper },
        { t: 29, x: T.x, y: T.y, heading: 0, on: [T.i, R.i], state: 'walk', h: upper },
        { t: 31.5, x: R.x, y: R.y, heading: 0, on: [T.i, R.i], state: 'walk', h: upper },
        { t: 31.6, x: R.x, y: R.y, heading: toT, on: [R.i], state: 'sit', h: upper },
        { t: 38, x: R.x, y: R.y, heading: toT, on: [R.i], state: 'lie', h: upper },
      ],
    ],
    beats: [
      { t: 0, zh: `猫在右下那台上（台面 ${m2(upper)} m）。其余单元收在天花板下`, en: `The cat rests on the lower-right unit (top ${m2(upper)} m); the rest are stowed at the ceiling` },
      { t: 2, zh: `一位访客走进来，朝沙发走。沙发前那台先落下：朝沙发的半圈只成下层，当茶几（${m2(dT.top)} m）；背后的半圈上下两块都成`, en: `A visitor comes in and heads for the sofa. The unit in front of the sofa descends first: the half facing the sofa forms only the lower platform, a coffee table at ${m2(dT.top)} m; the back half forms both` },
      { t: 10.5, zh: '茶几落好了，访客坐到沙发上', en: 'With the table in place, the visitor sits on the sofa' },
      { t: 17, zh: `猫走到上层（${m2(upper)} m），坐下看着坐着的人。两边的台面齐平，猫走过去不用跳`, en: `The cat crosses onto the upper platform (${m2(upper)} m), level with its own, and sits facing the visitor` },
      { t: 28, zh: '人起身离开，猫回到原来那台', en: 'The visitor gets up and leaves; the cat goes back' },
      { t: 33, zh: '没人坐了，茶几那台收回天花板下', en: 'With no one seated, the table unit retracts to the ceiling' },
    ],
  };
}

function cavityScript(l: PlanLayout): VignetteScript {
  const n = 2;
  const p = l.pitchM;
  const A = cell(n, p, 0, 0); // 左后
  const B = cell(n, p, 0, 1); // 右后
  const chair = furnKind({ kind: 'chair', ergo: true });
  const half = l.roomM / 2;
  // 餐椅面朝两台（−y），椅背离房间前缘留 0.08 m
  const chairY = half - chair.d / 2 - 0.08;
  const furniture: FurnSpec[] = [{ kind: 'chair', x: 0, y: chairY, face: [0, -1], ergo: true }];
  const S = seatPoints(furniture)[0];
  const dA = cavityDesign();
  const dB = cavityDesign();
  const low = dA.top;
  const units: (UnitScript | null)[] = Array.from({ length: n * n }, () => null);
  units[A.i] = unitOf(unitRamp(8, 40), dA, 'A');
  units[B.i] = unitOf(unitRamp(8, 40), dB, 'B');
  const look = (u: { x: number; y: number }): number => Math.atan2(S.y - u.y, S.x - u.x);
  const enter: [number, number] = [half + 0.3, 0.1];
  const front: [number, number] = [S.x + 0.05, S.y - 0.35];
  // 猫从右边进来，走到右后那台前面跳上下层，穿过腔走到左后那台
  const edgeB: [number, number] = [B.x + 0.05, B.y + l.platR + 0.12];
  const edgeA: [number, number] = [A.x - 0.05, A.y + l.platR + 0.12];
  const cat1: CatBeat[] = [
    { t: 0, x: half + 0.6, y: edgeB[1], heading: Math.PI, on: [], state: 'walk', h: 0 },
    { t: 15, x: half + 0.6, y: edgeB[1], heading: Math.PI, on: [], state: 'walk', h: 0 },
    { t: 17.5, x: edgeB[0], y: edgeB[1], heading: Math.PI, on: [], state: 'walk', h: 0 },
    { t: 18, x: edgeB[0], y: edgeB[1], heading: -Math.PI / 2, on: [], state: 'sit', h: 0 },
    { t: 18.4, x: edgeB[0], y: edgeB[1] - 0.12, heading: -Math.PI / 2, on: [], state: 'walk', h: low },
    { t: 18.5, x: B.x, y: B.y, heading: Math.PI, on: [B.i], state: 'sit' },
    { t: 19, x: B.x, y: B.y, heading: Math.PI, on: [B.i, A.i], state: 'walk' },
    { t: 22, x: A.x, y: A.y, heading: Math.PI, on: [B.i, A.i], state: 'walk' },
    { t: 22.1, x: A.x, y: A.y, heading: look(A), on: [A.i], state: 'sit' },
    // 人 33–36 s 起身走出去，猫等人走出房间再下地，不和人走同一段路
    { t: 36.6, x: A.x, y: A.y, heading: look(A), on: [A.i], state: 'sit' },
    { t: 37, x: edgeA[0], y: edgeA[1] - 0.12, heading: Math.PI / 2, on: [], state: 'walk', h: low },
    { t: 37.4, x: edgeA[0], y: edgeA[1], heading: Math.PI / 2, on: [], state: 'walk', h: 0 },
    { t: 38.1, x: edgeA[0], y: edgeA[1] + 0.25, heading: 0, on: [], state: 'walk', h: 0 },
    { t: 41.6, x: half + 0.6, y: edgeA[1] + 0.25, heading: 0, on: [], state: 'walk', h: 0 },
  ];
  const cat2: CatBeat[] = [
    { t: 0, x: half + 0.6, y: edgeB[1] + 0.2, heading: Math.PI, on: [], state: 'walk', h: 0 },
    { t: 21, x: half + 0.6, y: edgeB[1] + 0.2, heading: Math.PI, on: [], state: 'walk', h: 0 },
    { t: 23, x: edgeB[0] + 0.1, y: edgeB[1], heading: Math.PI, on: [], state: 'walk', h: 0 },
    { t: 23.4, x: edgeB[0] + 0.1, y: edgeB[1], heading: -Math.PI / 2, on: [], state: 'sit', h: 0 },
    { t: 23.8, x: edgeB[0] + 0.1, y: edgeB[1] - 0.12, heading: -Math.PI / 2, on: [], state: 'walk', h: low },
    { t: 23.9, x: B.x, y: B.y, heading: look(B), on: [B.i], state: 'sit' },
    { t: 36.2, x: B.x, y: B.y, heading: look(B), on: [B.i], state: 'sit' },
    { t: 36.6, x: edgeB[0], y: edgeB[1] - 0.12, heading: Math.PI / 2, on: [], state: 'walk', h: low },
    { t: 37, x: edgeB[0], y: edgeB[1], heading: Math.PI / 2, on: [], state: 'walk', h: 0 },
    { t: 39.5, x: half + 0.6, y: edgeB[1] + 0.2, heading: 0, on: [], state: 'walk', h: 0 },
  ];
  return {
    n,
    duration: 48,
    furniture,
    units,
    people: [
      {
        path: [
          [0, ...enter],
          [3, ...enter],
          [6.5, ...front],
          [7, ...front],
          [33, ...front],
          [33.2, ...front],
          [36, ...enter],
          [48, ...enter],
        ],
        sit: [7, 33, 0],
        watch: [[22, 33, 0]],
      },
    ],
    cats: [cat1, cat2],
    beats: [
      { t: 0, zh: '两台收在天花板下', en: 'Both units are stowed at the ceiling' },
      { t: 3, zh: '一位访客坐到餐椅上，面朝里面那两台', en: 'A visitor sits on the chair, facing the two units' },
      { t: 8, zh: `两台落下，整圈上下两层：下层 ${m2(low)} m，上层 ${m2(low + DESIGN.UPPER)} m；两台之间的空接成一条腔，长约 ${m2(p)} m`, en: `Both units descend as two full levels: lower ${m2(low)} m, upper ${m2(low + DESIGN.UPPER)} m; the two gaps join into one cavity about ${m2(p)} m long` },
      { t: 17.5, zh: '一只猫跳上右边那台的下层，从腔里穿过去，坐到左边那台', en: 'A cat jumps onto the lower platform on the right, walks through the cavity and settles on the left' },
      { t: 23, zh: '第二只猫上到右边那台。两只猫各在一头，都朝着坐着的人', en: 'A second cat takes the right-hand unit; one cat at each end, both facing the visitor' },
      { t: 33, zh: '人起身离开，猫下地走开，两台收回', en: 'The visitor leaves, the cats jump down and go, the units retract' },
    ],
  };
}

function givewayScript(l: PlanLayout): VignetteScript {
  const n = 2;
  const p = l.pitchM;
  const half = l.roomM / 2;
  const tags = ['A', 'B', 'C', 'D'];
  const units: (UnitScript | null)[] = Array.from({ length: n * n }, (_, i) => unitOf(ALWAYS, aisleDesign(), tags[i]));
  const A = cell(n, p, 0, 0);
  // 猫坐在左后那台背向交叉点的那一侧（方位 225°），朝着交叉点那一角留给人让路
  const cat: CatBeat[] = [{ t: 0, x: A.x, y: A.y, heading: (225 * Math.PI) / 180 + RING_SIDE, on: [A.i], state: 'sit' }];
  return {
    n,
    duration: 26,
    furniture: [],
    units,
    people: [
      {
        // 从右边沿两台之间的缝走进来，站在中间的交叉点上，再从下边走出去
        path: [
          [0, half + 0.6, 0],
          [3, half + 0.6, 0],
          [7.5, 0, 0],
          [14, 0, 0],
          [18.5, 0, half + 0.6],
          [26, 0, half + 0.6],
        ],
        watch: [[8.5, 13.5, 0]],
      },
    ],
    cats: [cat],
    beats: [
      { t: 0, zh: `四台都落着，台面 ${m2(TABLE_TOP.stand)} m。中间是一个过道交叉点，方台的角离它只有 0.10 m`, en: `All four units are down at ${m2(TABLE_TOP.stand)} m. A corner of each square platform comes within 0.10 m of the crossing in the middle` },
      { t: 3, zh: '一位访客走过来。挡路的带提前收回、平贴在立杆上，开出一条过道', en: 'A visitor approaches. The bands in the way retract ahead of the visitor and lie flat on the posts, opening an aisle' },
      { t: 7.5, zh: '访客站在交叉点上看猫。四台各收回朝着访客的那一角，其余照旧落着', en: 'The visitor stands at the crossing watching the cat; each unit pulls back only the corner facing the visitor' },
      { t: 14, zh: '访客从另一边走出去，身后的带落回原位', en: 'The visitor walks out the other side; the bands behind come back down' },
    ],
    giveWay: true,
  };
}

/** 每条带抬多少：与 2-15 路上的一步同一个函数（cohabit-design） */
export { liftOf };
/** 猫坐在一台的一圈上方位角 th 那里：给 catPlacement 的平面点（离台心 0.15 m，方向 = th + RING_SIDE，见 cohabit-solid） */
export function ringSpot(u: { x: number; y: number }, th: number): { x: number; y: number } {
  const a = th + RING_SIDE;
  return { x: u.x + 0.15 * Math.cos(a), y: u.y + 0.15 * Math.sin(a) };
}

function counterScript(l: PlanLayout): VignetteScript {
  const n = 2;
  const p = l.pitchM;
  const half = l.roomM / 2;
  const T = cell(n, p, 0, 0); // 站桌（整圈两层）
  const B = cell(n, p, 0, 1); // 旁边一台平台，与上层同高
  const dT = counterDesign();
  const dB = flushDesign(dT);
  const low = dT.top;
  const units: (UnitScript | null)[] = Array.from({ length: n * n }, () => null);
  units[T.i] = unitOf(unitRamp(1.5, 36), dT, 'A'); // 台子先落，落好了人才走到台前
  units[B.i] = unitOf(unitRamp(1.5, 36), dB, 'B');
  // 人站在站桌左前方、面朝台子（轴测机位从右前方看，站在台子正前方会把台子挡住）
  const stand: [number, number] = [T.x - 0.18, T.y + l.platR + 0.33];
  const enter: [number, number] = [half + 0.3, stand[1] + 0.02];
  const onT = ringSpot(T, (110 * Math.PI) / 180);
  const toPerson = Math.atan2(stand[1] - T.y, stand[0] - T.x);
  const out: [number, number] = [half + 0.6, half - 0.2];
  const jumpFrom: [number, number] = [T.x + 0.2, T.y + l.platR + 0.12];
  const cat: CatBeat[] = [
    { t: 0, x: out[0], y: out[1], heading: Math.PI, on: [], state: 'walk', h: 0 },
    { t: 12, x: out[0], y: out[1], heading: Math.PI, on: [], state: 'walk', h: 0 },
    { t: 15, x: jumpFrom[0], y: half - 0.2, heading: Math.PI, on: [], state: 'walk', h: 0 },
    { t: 16, x: jumpFrom[0], y: jumpFrom[1], heading: -Math.PI / 2, on: [], state: 'sit', h: 0 },
    { t: 16.6, x: jumpFrom[0], y: jumpFrom[1], heading: -Math.PI / 2, on: [], state: 'walk', h: 0 },
    { t: 17, x: onT.x, y: onT.y, heading: toPerson, on: [], state: 'walk', h: low },
    { t: 17.1, x: onT.x, y: onT.y, heading: toPerson, on: [T.i], state: 'sit' },
    { t: 19, x: onT.x, y: onT.y, heading: toPerson, on: [T.i], state: 'lie' },
    { t: 32, x: onT.x, y: onT.y, heading: toPerson, on: [T.i], state: 'sit' },
    { t: 32.5, x: jumpFrom[0], y: jumpFrom[1] - 0.12, heading: Math.PI / 2, on: [], state: 'walk', h: low },
    { t: 32.9, x: jumpFrom[0], y: jumpFrom[1], heading: Math.PI / 2, on: [], state: 'walk', h: 0 },
    { t: 34, x: jumpFrom[0], y: half - 0.2, heading: Math.PI / 2, on: [], state: 'walk', h: 0 },
    { t: 37, x: out[0], y: out[1], heading: 0, on: [], state: 'walk', h: 0 },
  ];
  return {
    n,
    duration: 46,
    furniture: [],
    units,
    people: [
      {
        path: [
          [0, ...enter],
          [1, ...enter],
          [9.5, ...stand],
          [9.8, stand[0], stand[1] - 0.002],
          [30, stand[0], stand[1] - 0.002],
          [33.5, ...enter],
          [46, ...enter],
        ],
        watch: [[17, 30, 0]],
      },
    ],
    cats: [cat],
    beats: [
      { t: 0, zh: '两台收在天花板下', en: 'Both units are stowed at the ceiling' },
      { t: 1, zh: `一位访客走过来。他要去的那两台先落下：左边那台整圈两层，上层 ${m2(low + DESIGN.UPPER)} m 当站着用的台面，下层 ${m2(low)} m；右边那台平台，与上层同高`, en: `A visitor walks in. The two units ahead come down first: the left one forms two levels all round, the upper at ${m2(low + DESIGN.UPPER)} m as a standing counter and the lower at ${m2(low)} m; the right one is a platform level with the upper` },
      { t: 9.5, zh: '台面落好了，访客走到台前站住', en: 'With the counter in place, the visitor walks up and stops' },
      { t: 15, zh: '一只猫跳上下层，在台面底下趴着，正对着站着的人', en: 'A cat hops onto the lower level and lies under the counter, facing the visitor' },
      { t: 30, zh: '人走开，猫跳下来，两台收回', en: 'The visitor leaves, the cat jumps down, the units retract' },
    ],
  };
}

function stepScript(l: PlanLayout): VignetteScript {
  const n = 2;
  const p = l.pitchM;
  const half = l.roomM / 2;
  const A = cell(n, p, 0, 0); // 一半低一半高
  const B = cell(n, p, 0, 1); // 旁边一台，与高的那半同高
  const chair = furnKind({ kind: 'chair', ergo: true });
  // 椅子在右边那台前面（放在中间会挡住左边那台）
  const furniture: FurnSpec[] = [{ kind: 'chair', x: B.x, y: half - chair.d / 2 - 0.08, face: [0, -1], ergo: true }];
  const S = seatPoints(furniture)[0];
  // 高的那半朝邻台（+x）：与邻台齐平接上；低的那半 = 高的减去一台能抬的高差
  const dA = stairDesign(0, TABLE_TOP.stand - DESIGN.RISE - 0.01, TABLE_TOP.stand);
  const dB = flushDesign(dA);
  const units: (UnitScript | null)[] = Array.from({ length: n * n }, () => null);
  units[A.i] = unitOf(unitRamp(6, 38), dA, 'A');
  units[B.i] = unitOf(unitRamp(6, 38), dB, 'B');
  const enter: [number, number] = [half + 0.3, 0.1];
  const front: [number, number] = [S.x + 0.05, S.y - 0.35];
  const lowTh = (150 * Math.PI) / 180;
  const highTh = (60 * Math.PI) / 180;
  const lowSpot = ringSpot(A, lowTh);
  const highSpot = ringSpot(A, highTh);
  const onB = ringSpot(B, (110 * Math.PI) / 180);
  const look = Math.atan2(S.y - B.y, S.x - B.x);
  const home: [number, number] = [A.x - 0.15, half - 0.2];
  const jumpFrom: [number, number] = [A.x - 0.2, A.y + l.platR + 0.12];
  const hLow = heightToward(dA, lowTh);
  const hHigh = heightToward(dA, highTh);
  const cat: CatBeat[] = [
    { t: 0, x: home[0], y: home[1], heading: -Math.PI / 2, on: [], state: 'sit', h: 0 },
    { t: 14, x: home[0], y: home[1], heading: -Math.PI / 2, on: [], state: 'walk', h: 0 },
    { t: 16, x: jumpFrom[0], y: jumpFrom[1], heading: -Math.PI / 2, on: [], state: 'sit', h: 0 },
    { t: 16.6, x: jumpFrom[0], y: jumpFrom[1], heading: -Math.PI / 2, on: [], state: 'walk', h: 0 },
    { t: 17, x: lowSpot.x, y: lowSpot.y, heading: 0, on: [], state: 'walk', h: hLow },
    { t: 17.1, x: lowSpot.x, y: lowSpot.y, heading: 0, on: [A.i], state: 'sit', h: hLow },
    { t: 19.5, x: lowSpot.x, y: lowSpot.y, heading: 0, on: [A.i], state: 'walk', h: hLow },
    { t: 20.5, x: highSpot.x, y: highSpot.y, heading: 0, on: [A.i], state: 'sit', h: hHigh },
    { t: 22.5, x: A.x, y: A.y, heading: 0, on: [A.i, B.i], state: 'walk', h: hHigh },
    { t: 24.5, x: B.x, y: B.y, heading: 0, on: [A.i, B.i], state: 'walk', h: dB.top },
    { t: 24.6, x: onB.x, y: onB.y, heading: look, on: [B.i], state: 'sit' },
    { t: 35, x: onB.x, y: onB.y, heading: look, on: [B.i], state: 'sit' },
    { t: 35.4, x: B.x - 0.2, y: B.y + l.platR, heading: Math.PI / 2, on: [], state: 'walk', h: dB.top },
    { t: 35.9, x: B.x - 0.2, y: B.y + l.platR + 0.12, heading: Math.PI / 2, on: [], state: 'walk', h: 0 },
    { t: 40, x: home[0], y: home[1], heading: Math.PI, on: [], state: 'walk', h: 0 },
    { t: 40.1, x: home[0], y: home[1], heading: -Math.PI / 2, on: [], state: 'sit', h: 0 },
  ];
  return {
    n,
    duration: 48,
    furniture,
    units,
    people: [
      {
        path: [
          [0, ...enter],
          [1, ...enter],
          [4.5, ...front],
          [5, ...front],
          [34, ...front],
          [34.5, ...front],
          [37.5, ...enter],
          [48, ...enter],
        ],
        sit: [5, 34, 0],
        watch: [[17, 34, 0]],
      },
    ],
    cats: [cat],
    beats: [
      { t: 0, zh: '两台收在天花板下，猫在地上', en: 'Both units are stowed; the cat is on the floor' },
      { t: 1, zh: '一位访客坐到椅子上', en: 'A visitor sits on the chair' },
      { t: 6, zh: `左边那台落下，一半低（${m2(hLow)} m）一半高（${m2(hHigh)} m）；右边那台与高的那半齐平`, en: `The left unit comes down half low (${m2(hLow)} m) and half high (${m2(hHigh)} m); the right one is level with the high half` },
      { t: 16.5, zh: '猫先跳上低的那半，停一下', en: 'The cat first hops onto the low half and pauses' },
      { t: 19.5, zh: '再上到高的那半，走到右边那台坐下，朝着坐着的人', en: 'Then it steps up to the high half, crosses to the right-hand unit and settles facing the visitor' },
      { t: 34, zh: '人起身离开，猫跳下来，两台收回', en: 'The visitor leaves, the cat jumps down, the units retract' },
    ],
  };
}

export function vignetteScript(key: VignetteKey): VignetteScript {
  const n = [...VIGNETTES, ...STILL_SCENES].find((v) => v.key === key)!.n;
  const l = vignetteLayout(n);
  switch (key) {
    case 'guide':
      return guideScript(l);
    case 'tea':
      return teaScript(l);
    case 'cavity':
      return cavityScript(l);
    case 'counter':
      return counterScript(l);
    case 'step':
      return stepScript(l);
    case 'giveway':
      return givewayScript(l);
    case 'stillguide':
      return guideScript(l, true);
  }
}

/** 一只猫此刻的那一段（前一拍的位置 / 高度插值到后一拍；台与状态取前一拍） */
export function catAt(beats: readonly CatBeat[], t: number): { x: number; y: number; heading: number; on: readonly number[]; state: CatBeat['state']; h?: number } {
  let i = 0;
  while (i + 1 < beats.length && beats[i + 1].t <= t) i++;
  const a = beats[i];
  const b = beats[i + 1];
  if (!b || t <= a.t) return { x: a.x, y: a.y, heading: a.heading, on: a.on, state: a.state, h: a.h };
  const k = (t - a.t) / (b.t - a.t);
  // 跨台那段：两拍脚下的台相同（[A, B]），位置插值；跳上跳下那段：高度插值
  const h = a.h !== undefined && b.h !== undefined ? a.h + (b.h - a.h) * k : a.h;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, heading: a.heading, on: a.on, state: a.state, h };
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  const k = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - ax - k * dx, py - ay - k * dy);
}

// ── 脚本驱动的「仿真」──────────────────────────────────────────────────────────────
export class VignetteSim implements SpaceSimLike {
  readonly key: VignetteKey;
  readonly script: VignetteScript;
  readonly layout: PlanLayout;
  readonly space: SpaceMode = 'live';
  t = 0;
  readonly act: { degree: Float64Array };
  readonly bandOpen: Float32Array;
  readonly tableBy: Int16Array;
  readonly furn: { rects: FurnRect[] } | null;
  readonly seats: SimSeat[];
  readonly people: SimPerson[];
  readonly cats: SimCat[];
  readonly links: Link[] = [];
  /** 已经放完的轮数（循环播放） */
  loops = 0;

  constructor(key: VignetteKey) {
    this.key = key;
    this.script = vignetteScript(key);
    this.layout = vignetteLayout(this.script.n);
    const U = this.layout.units.length;
    this.act = { degree: new Float64Array(U) };
    this.bandOpen = new Float32Array(U * BANDS);
    this.tableBy = new Int16Array(U).fill(-1);
    this.furn = this.script.furniture.length ? { rects: this.script.furniture.map(furnRect) } : null;
    this.seats = seatPoints(this.script.furniture);
    this.people = this.script.people.map(() => ({ walker: { x: 0, y: 0, heading: 0, gaze: 0 }, seated: false, seat: null, watching: null, ignores: false }));
    this.cats = this.script.cats.map(() => ({ walker: { x: 0, y: 0, heading: 0 }, state: 'sit' }));
    this.apply(0);
  }

  /** 推进（循环播放）：到片尾回到 0，所有状态按脚本重摆 */
  step(dt: number): void {
    let t = this.t + dt;
    if (t >= this.script.duration) {
      t -= this.script.duration * Math.floor(t / this.script.duration);
      this.loops++;
      this.bandOpen.fill(0);
    }
    this.apply(t, dt);
  }

  /** 回到片头 */
  restart(): void {
    this.bandOpen.fill(0);
    this.apply(0);
  }

  private apply(t: number, dt = 0): void {
    this.t = t;
    const s = this.script;
    s.units.forEach((u, i) => (this.act.degree[i] = u ? keysAt(u.deg, t) : 0));
    s.people.forEach((ps, k) => {
      const p = this.people[k];
      const at = pathAt(ps.path, t);
      p.walker.x = at.x;
      p.walker.y = at.y;
      p.walker.heading = at.heading;
      p.seated = !!ps.sit && t >= ps.sit[0] && t < ps.sit[1];
      p.seat = p.seated && ps.sit ? ps.sit[2] : null;
      const w = ps.watch?.find(([a, b]) => t >= a && t < b);
      p.watching = w ? w[2] : null;
      if (p.seated && p.seat !== null) p.walker.heading = Math.atan2(this.seats[p.seat].face[1], this.seats[p.seat].face[0]);
      const c = w ? this.cats[w[2]] : null;
      p.walker.gaze = c ? Math.atan2(c.walker.y - p.walker.y, c.walker.x - p.walker.x) : p.walker.heading;
    });
    s.cats.forEach((beats, k) => {
      const c = this.cats[k];
      const a = catAt(beats, t);
      c.walker.x = a.x;
      c.walker.y = a.y;
      c.walker.heading = a.heading;
      c.state = a.state;
      c.h = a.h;
      this.catOn[k] = a.on;
    });
    // 人的视线随猫更新（猫在人之后摆，所以再算一遍）
    this.people.forEach((p) => {
      if (p.watching === null) return;
      const c = this.cats[p.watching];
      p.walker.gaze = Math.atan2(c.walker.y - p.walker.y, c.walker.x - p.walker.x);
    });
    if (s.giveWay) this.giveWay(t, dt);
  }

  private readonly catOn: (readonly number[])[] = [];

  /**
   * 让路（giveway）：一条带的径向段离人此刻或接下来 GIVE.ahead 秒里要走到的位置 < 身体半径 + 余量，就收回；
   * 收回 / 落回的速率与 2-14 同一对数（COHABIT.FACES）。dt = 0（开场、重来）时直接取目标。
   */
  private giveWay(t: number, dt: number): void {
    const l = this.layout;
    const reach = l.bandReach ?? l.units.map(() => l.platR);
    const lim = PLAN.BODY_R + GIVE.clear;
    const samples: { x: number; y: number }[] = [];
    for (const ps of this.script.people) for (let a = 0; a <= GIVE.ahead + 1e-9; a += 0.25) samples.push(pathAt(ps.path, Math.min(t + a, this.script.duration)));
    for (const u of l.units)
      for (let j = 0; j < BANDS; j++) {
        const ang = bandAngle(j);
        const cx = Math.cos(ang), cy = Math.sin(ang);
        const ax = u.x + cx * l.mastR, ay = u.y + cy * l.mastR;
        const bx = u.x + cx * reach[j], by = u.y + cy * reach[j];
        // 猫身下的带不收（与 2-14 同一条：COHABIT.FACES 护住猫身下那几条）
        const underCat = this.cats.some((c, k) => {
          const on = this.catOn[k];
          if (!on || on.length !== 1 || on[0] !== u.i) return false;
          const d = catRingAngle(c.walker.heading) - ang;
          return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < GIVE.catHalf;
        });
        const want = !underCat && samples.some((q) => segDist(q.x, q.y, ax, ay, bx, by) < lim) ? 1 : 0;
        const i = u.i * BANDS + j;
        const o = this.bandOpen[i];
        if (dt <= 0) this.bandOpen[i] = want;
        else this.bandOpen[i] = want > o ? Math.min(1, o + GIVE.open * dt) : want < o ? Math.max(0, o - GIVE.close * dt) : o;
      }
  }

  supportOf(c: SimCat): PlanUnit[] {
    const k = this.cats.indexOf(c);
    return (this.catOn[k] ?? []).map((i) => this.layout.units[i]);
  }

  drawPos(p: SimPerson): { x: number; y: number } {
    return { x: p.walker.x, y: p.walker.y };
  }

  summary(): { t: number; formed: number; ledger: { counts: { gaze: number; warmth: number; touch: number; pass: number } } } {
    let formed = 0;
    for (let u = 0; u < this.act.degree.length; u++) if (this.act.degree[u] >= 1 - 1e-4) formed++;
    return { t: this.t, formed, ledger: { counts: { gaze: 0, warmth: 0, touch: 0, pass: 0 } } };
  }

  formOf(u: number): UnitForm {
    return this.script.units[u]?.design.form ?? { bands: null, toward: null };
  }

  topOf(u: number): number {
    return this.script.units[u]?.design.top ?? TOPS.stand;
  }

  /** 每台的标签与形（台架挂标签、列图例；按标签排） */
  tags(): { u: number; tag: string; design: UnitDesign }[] {
    const out: { u: number; tag: string; design: UnitDesign }[] = [];
    this.script.units.forEach((s, u) => s && out.push({ u, tag: s.tag, design: s.design }));
    return out.sort((a, b) => a.tag.localeCompare(b.tag));
  }

  /** 此刻的旁白 */
  beat(): Beat {
    const b = this.script.beats;
    let i = 0;
    while (i + 1 < b.length && b[i + 1].t <= this.t) i++;
    return b[i];
  }
}
