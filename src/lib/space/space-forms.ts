/**
 * 项目二 · 空间形态研究（2026-11-16，作者「没有去探究形态本身能够展现出多少……能够展现出什么样的空间形态……接下来可以做这方面的研究」）。
 * 方案与读法 = 项目二_空间形态研究.md；线稿 = scripts/space-forms/atlas.mjs（与本模块同一份实现）。
 *
 * 不涉及人和猫的行为：一间房里 n×n 台单元各停在什么状态，这间房就成了什么空间。这里只有几何与读数，
 * 纯函数、零 DOM。尺寸全部取自 2-15 那间房（格距、方台、房高从站上的布局与缩放现取），单元的竖向尺寸是
 * 2026-11-16 用站上同一份引擎实测的（守门 space-forms.test.ts 现跑引擎核对）。
 */
import { ROOM } from './skin-grid';
import { UNITS_PER_M, HOIST } from './cohabit-solid';
import { UPPER_ABOVE, vignetteLayout } from './cohabit-vignette';

const ROOM_LAYOUT = vignetteLayout(8);

/** 单元与房间的尺寸（m） */
export const SF = {
  /** 格距 = 2-15 那间房 */
  PITCH: ROOM_LAYOUT.pitchM,
  /** 方台外缘半边（含芯） */
  PLAT_HALF: ROOM_LAYOUT.platR,
  /** 房高（地面到天花） */
  ROOM_H: ROOM.FLOOR_Y / UNITS_PER_M,
  /** 收起时布束离天花的净距 */
  CEIL_GAP: HOIST.ceilGap / UNITS_PER_M,
  /** 平台厚（台面到台底），实测 */
  PLATE: 0.066,
  /** 台面离钉住端（单元最下面那一点：下夹环与芯的末端），实测 */
  PIN_BELOW: 0.23,
  /** 一台平台成形后从钉住端到上夹环的高，实测（168 节） */
  SPAN_PLAT: 0.615,
  /** 上下两块成形后从钉住端到上夹环的高，实测（338 节全部铺出去） */
  SPAN_DUAL: 1.254,
  /** 上台台面比下台台面高多少 */
  UPPER_ABOVE,
  /** 一台之内台面沿一圈能升降多少（逐带配平偏移 ±0.20 m，2-15 形态方案 §4） */
  RISE_MAX: 0.39,
  /** 布不成形、直垂下来时的筒：半径（挂带线离立杆）与最长（338 节全部放下） */
  TUBE_R: 0.122,
  TUBE_LEN: 2.64,
  /** 读空间用的人体尺寸：身体半径（与 2-14 同）、人从下面走过要的净高（常见门洞净高） */
  BODY_R: 0.22,
  HEAD_CLEAR: 2.0,
} as const;

/** 平台台面能停的高度范围（钉住端贴地 ~ 上夹环贴天花） */
export const PLAT_TOP_MIN = SF.PIN_BELOW;
export const PLAT_TOP_MAX = SF.ROOM_H - SF.CEIL_GAP - (SF.SPAN_PLAT - SF.PIN_BELOW);
/** 上下两块的下台能停的范围 */
export const DUAL_LOWER_MAX = SF.ROOM_H - SF.CEIL_GAP - (SF.SPAN_DUAL - SF.PIN_BELOW);

/**
 * 一台单元的状态。
 *   stow   收在天花板下
 *   plat   平台，台面在 top；rise > 0 时台面沿 dir 方向升高 rise（一台之内的斜坡，逐带偏移，纯平移得来）
 *   dual   上下两块：下台台面 lower，上台 = lower + UPPER_ABOVE；roof 给了 = 只有背向 roof 方向的半圈有上台
 *   column 布不成形，直垂到地（一根 ⌀0.25 m 的布筒）
 * dir / roof 用 0 = +x、1 = +y、2 = −x、3 = −y 四个方向。
 */
export type UnitState =
  | { kind: 'stow' }
  | { kind: 'plat'; top: number; rise?: number; dir?: 0 | 1 | 2 | 3 }
  | { kind: 'dual'; lower: number; roof?: 0 | 1 | 2 | 3 }
  | { kind: 'column' };

export interface SpaceField {
  /** 每边几格（房间 = n × 格距） */
  n: number;
  /** 行优先，cells[r * n + c]；r 沿 +y、c 沿 +x */
  cells: UnitState[];
}

export const STOW: UnitState = { kind: 'stow' };
export const plat = (top: number, rise = 0, dir: 0 | 1 | 2 | 3 = 0): UnitState => ({ kind: 'plat', top, rise, dir });
export const dual = (lower: number, roof?: 0 | 1 | 2 | 3): UnitState => (roof === undefined ? { kind: 'dual', lower } : { kind: 'dual', lower, roof });
export const COLUMN: UnitState = { kind: 'column' };

/** 新开一片全收着的场地 */
export function emptyField(n = 8): SpaceField {
  return { n, cells: Array.from({ length: n * n }, () => STOW) };
}

/**
 * 按人体分的高度带（看台面在哪一带）：坐面 0.43 / 桌面 0.74 / 站着手肘 1.05 / 站着眼睛约 1.58 / 头顶约 1.70，
 * 从下面走过要 2.0 m 净高。台面下面最低的一点是台心那截布与下夹环（台面下 0.23 m），不是台底（台面下 0.066 m），
 * 所以人要从下面走过，台面至少 2.0 + 0.23 = 2.23 m。1.6–2.23 那一带台底或台心会碰头，房间里不该出现。
 */
export const BANDS = [
  { key: 'low', lo: 0, hi: 0.5, zh: '低台（膝下）', en: 'low (below the knee)' },
  { key: 'table', lo: 0.5, hi: 0.85, zh: '桌面', en: 'table height' },
  { key: 'waist', lo: 0.85, hi: 1.2, zh: '齐腰', en: 'waist height' },
  { key: 'shelf', lo: 1.2, hi: 1.6, zh: '胸到眼', en: 'chest to eye' },
  { key: 'head', lo: 1.6, hi: SF.HEAD_CLEAR + SF.PIN_BELOW, zh: '碰头', en: 'head height' },
  { key: 'canopy', lo: SF.HEAD_CLEAR + SF.PIN_BELOW, hi: 2.7, zh: '低顶', en: 'low ceiling' },
  { key: 'high', lo: 2.7, hi: 99, zh: '高顶', en: 'high ceiling' },
] as const;
export type BandKey = (typeof BANDS)[number]['key'];

export function bandOf(top: number): BandKey {
  for (const b of BANDS) if (top < b.hi) return b.key;
  return 'high';
}

/** 一台的各个台面高度（m）：平台一块（斜的给两端），两层给下台与上台；收着与布筒没有 */
export function surfacesOf(u: UnitState): number[] {
  if (u.kind === 'plat') return u.rise ? [u.top, u.top + u.rise] : [u.top];
  if (u.kind === 'dual') return [u.lower, u.lower + SF.UPPER_ABOVE];
  return [];
}

/** 台面下最低的一点（台心那截布与下夹环）；收着与布筒没有 */
export function lowestOf(u: UnitState): number | null {
  if (u.kind === 'plat') return u.top - SF.PIN_BELOW;
  if (u.kind === 'dual') return u.lower - SF.PIN_BELOW;
  return null;
}
/**
 * 这一台挡不挡人在格子里走：方台的台底落在 2.0 m 以下就挡（台宽 0.70，人绕不过去）；收着、布筒（人从筒边过）、
 * 台底在 2.0 m 以上不挡（台心那截布若还低于 2.0，算碰头，见 hitsHead）。
 */
export function blocksWalk(u: UnitState): boolean {
  if (u.kind === 'plat') return u.top - SF.PLATE < SF.HEAD_CLEAR;
  if (u.kind === 'dual') return u.lower - SF.PLATE < SF.HEAD_CLEAR;
  return false;
}
/** 人能不能站在这一格中央（布筒占着中央） */
export function standable(u: UnitState): boolean {
  return !blocksWalk(u) && u.kind !== 'column';
}
/** 这一格头顶有没有一块低顶：整台（含台心下夹环）都在 2.0 m 以上，台面在 2.7 m 以下 */
export function covers(u: UnitState): boolean {
  if (u.kind !== 'plat') return false;
  return u.top - SF.PIN_BELOW >= SF.HEAD_CLEAR && u.top < 2.7;
}
/** 会碰头：台底落在 1.6–2.0 m 之间；或者台底过了 2.0、台心那截布与下夹环还在 2.0 以下 */
export function hitsHead(u: UnitState): boolean {
  const lows = u.kind === 'plat' ? [u.top] : u.kind === 'dual' ? [u.lower, u.lower + SF.UPPER_ABOVE] : [];
  if (lows.some((t) => t - SF.PLATE >= 1.6 && t - SF.PLATE < SF.HEAD_CLEAR)) return true;
  const pin = lowestOf(u);
  return pin !== null && !blocksWalk(u) && pin < SF.HEAD_CLEAR;
}

/** 一台单元自己能不能这样停（高度在能停的范围里、斜坡不超过一台之内的升降量） */
export function stateValid(u: UnitState): boolean {
  if (u.kind === 'plat') return u.top >= PLAT_TOP_MIN - 1e-9 && u.top + (u.rise ?? 0) <= PLAT_TOP_MAX + 1e-9 && (u.rise ?? 0) >= 0 && (u.rise ?? 0) <= SF.RISE_MAX + 1e-9;
  if (u.kind === 'dual') return u.lower >= PLAT_TOP_MIN - 1e-9 && u.lower <= DUAL_LOWER_MAX + 1e-9;
  return true;
}

/**
 * 一台的台面，按「在哪几条边上、边上多高」记：edges[d] = 朝 d 方向那条边上的台面高度，null = 这块台不到那条边。
 * 斜坡按 dir 线性（低端 top、高端 top + rise、两侧边取中值）；两层的上台在 roof 那条边上没有（那半圈只成下台）。
 */
export interface SurfaceNode {
  edges: (number | null)[];
  low: number;
  high: number;
}
export function surfaceNodes(u: UnitState): SurfaceNode[] {
  if (u.kind === 'plat') {
    const rise = u.rise ?? 0, dir = u.dir ?? 0;
    const edges = [0, 1, 2, 3].map((d) => (d === dir ? u.top + rise : (d + 2) % 4 === dir ? u.top : u.top + rise / 2));
    return [{ edges: rise ? edges : [u.top, u.top, u.top, u.top], low: u.top, high: u.top + rise }];
  }
  if (u.kind === 'dual') {
    const up = u.lower + SF.UPPER_ABOVE;
    return [
      { edges: [u.lower, u.lower, u.lower, u.lower], low: u.lower, high: u.lower },
      { edges: [0, 1, 2, 3].map((d) => (d === u.roof ? null : up)), low: up, high: up },
    ];
  }
  return [];
}

const DIRS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const opp = (d: number) => (d + 2) % 4;

/**
 * 猫在台面之间怎么过：接缝齐平（≤ 6 cm，2-15 形态方案 §4 续坡相邻两条带最多差 6 cm）走过去；≤ 0.5 m 一小跳（演示值，
 * 读作「不用大跳」）；≤ 1.1 m 一跳（2-15 现行规则里猫能从地面直接跳上 1.05 的台）。
 */
export const CAT_STEP = { walk: 0.06, hop: 0.5, jump: 1.1 } as const;

export interface SpaceReading {
  /** 各状态台数 */
  counts: { stow: number; plat: number; dual: number; column: number };
  /** 不合法的台（高度超出能停的范围） */
  invalid: number[];
  /** 台面按高度带的个数（斜的按低端算，两层两块各算一个） */
  bands: Record<BandKey, number>;
  /** 人能站的格数与面积（m²，一格按格距见方算地面） */
  floorCells: number;
  floorM2: number;
  /** 从门走得到的地面格数（只数能站的，布筒那格不算）；走不到的地面分成几块、各几格（被围住的空地） */
  reachCells: number;
  pockets: number[];
  /** 头顶有低顶的地面格数 */
  coveredCells: number;
  /** 只能单格通过的格数（两侧被挡、前后通）：走廊的读法 */
  corridorCells: number;
  /** 从门走得到的那片地面的外沿：台围出来的有多长（m），占外沿（台 + 墙）多少 */
  unitEdgeM: number;
  enclosure: number;
  /** 会碰头的台数 */
  headHits: number;
  /** 台面的高度层数（按 5 cm 归并） */
  levels: number;
  /** 最大一片齐平相连的台面（接缝 ≤ 6 cm）有几台、台面合计多少 m² */
  largestSurfaceUnits: number;
  largestSurfaceM2: number;
  /** 猫从地面出发、每一步只用「走」和「小跳」能上到的最高台面；允许「一跳」时的最高台面（m） */
  catReachHop: number;
  catReachJump: number;
}

/** 门：左右两面墙正中（与 2-14 / 2-15 同），各接最靠近墙的那一两格 */
export function doorCells(n: number): number[] {
  const a = Math.floor((n - 1) / 2), b = Math.ceil((n - 1) / 2);
  const out: number[] = [];
  for (const r of a === b ? [a] : [a, b]) out.push(r * n, r * n + n - 1);
  return out;
}

export function readSpace(f: SpaceField): SpaceReading {
  const { n, cells } = f;
  const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n;
  const counts = { stow: 0, plat: 0, dual: 0, column: 0 };
  const bands = Object.fromEntries(BANDS.map((b) => [b.key, 0])) as Record<BandKey, number>;
  const invalid: number[] = [];
  let headHits = 0, coveredCells = 0;
  const lv = new Set<number>();
  cells.forEach((u, i) => {
    counts[u.kind]++;
    if (!stateValid(u)) invalid.push(i);
    if (hitsHead(u)) headHits++;
    if (covers(u)) coveredCells++;
    for (const s of surfaceNodes(u)) {
      bands[bandOf(s.low)]++;
      lv.add(Math.round(s.low / 0.05));
      lv.add(Math.round(s.high / 0.05));
    }
  });

  // ── 人：能走的格子按四邻连通（两格之间的接缝中点离旁边方台的台边 0.48 m，人过得去）
  const walk = cells.map((u) => !blocksWalk(u));
  const comp = new Int32Array(n * n).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < n * n; i++) {
    if (!walk[i] || comp[i] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const j = stack.pop()!;
      if (standable(cells[j])) size++; // 布筒那格过得去、站不了：连通算它，面积不算
      const r = Math.floor(j / n), c = j % n;
      for (const [dc, dr] of DIRS) {
        const rr = r + dr, cc = c + dc;
        if (!inside(rr, cc)) continue;
        const k = rr * n + cc;
        if (walk[k] && comp[k] < 0) { comp[k] = id; stack.push(k); }
      }
    }
    sizes.push(size);
  }
  const doorComps = new Set(doorCells(n).filter((i) => walk[i]).map((i) => comp[i]));
  let reachCells = 0;
  const pockets: number[] = [];
  sizes.forEach((s, id) => (doorComps.has(id) ? (reachCells += s) : s > 0 && pockets.push(s)));

  // 走廊格与外沿
  const shut = (r: number, c: number) => !inside(r, c) || !walk[r * n + c];
  let corridorCells = 0, unitEdges = 0, wallEdges = 0;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (!walk[i]) continue;
      if (standable(cells[i])) {
        const lr = shut(r, c - 1) && shut(r, c + 1) && (!shut(r - 1, c) || !shut(r + 1, c));
        const ud = shut(r - 1, c) && shut(r + 1, c) && (!shut(r, c - 1) || !shut(r, c + 1));
        if (lr || ud) corridorCells++;
      }
      if (!doorComps.has(comp[i])) continue;
      for (const [dc, dr] of DIRS) {
        const rr = r + dr, cc = c + dc;
        if (!inside(rr, cc)) wallEdges++;
        else if (!walk[rr * n + cc]) unitEdges++;
      }
    }

  // ── 台面：齐平相连的最大一片（接缝两侧有一对高度差 ≤ 6 cm 的台面就算连着）
  const touches = (a: number, b: number, d: number) => {
    const A = surfaceNodes(cells[a]), B = surfaceNodes(cells[b]);
    return A.some((x) => B.some((y) => x.edges[d] !== null && y.edges[opp(d)] !== null && Math.abs((x.edges[d] as number) - (y.edges[opp(d)] as number)) <= CAT_STEP.walk));
  };
  const seen = new Uint8Array(n * n);
  let bestUnits = 0;
  for (let i = 0; i < n * n; i++) {
    if (seen[i] || !surfaceNodes(cells[i]).length) continue;
    seen[i] = 1;
    const stack = [i];
    let count = 0;
    while (stack.length) {
      const j = stack.pop()!;
      count++;
      const r = Math.floor(j / n), c = j % n;
      DIRS.forEach(([dc, dr], d) => {
        const rr = r + dr, cc = c + dc;
        if (!inside(rr, cc)) return;
        const k = rr * n + cc;
        if (!seen[k] && touches(j, k, d)) { seen[k] = 1; stack.push(k); }
      });
    }
    bestUnits = Math.max(bestUnits, count);
  }

  return {
    counts,
    invalid,
    bands,
    floorCells: cells.filter(standable).length,
    floorM2: cells.filter(standable).length * SF.PITCH * SF.PITCH,
    reachCells,
    pockets,
    coveredCells,
    corridorCells,
    unitEdgeM: unitEdges * SF.PITCH,
    enclosure: unitEdges + wallEdges === 0 ? 0 : unitEdges / (unitEdges + wallEdges),
    headHits,
    levels: lv.size,
    largestSurfaceUnits: bestUnits,
    largestSurfaceM2: bestUnits * (2 * SF.PLAT_HALF) ** 2,
    catReachHop: catReach(f, CAT_STEP.hop),
    catReachJump: catReach(f, CAT_STEP.jump),
  };
}

/**
 * 猫从地面出发能上到多高。台面之间按接缝两侧的高度差：≤ 6 cm 走过去，≤ step 跳过去；地面到一块台按它的低端算；
 * 同一台上下两块之间（0.58 m）也按 step 算（从敞开那半圈跳）。返回能到的最高台面（斜坡算到高端，m），一台都上不去 = 0。
 */
export function catReach(f: SpaceField, step: number): number {
  const { n, cells } = f;
  const nodes: { cell: number; s: SurfaceNode }[] = [];
  const byCell: number[][] = cells.map(() => []);
  cells.forEach((u, i) => surfaceNodes(u).forEach((s) => { byCell[i].push(nodes.length); nodes.push({ cell: i, s }); }));
  const seen = new Uint8Array(nodes.length);
  const queue: number[] = [];
  nodes.forEach((nd, id) => { if (nd.s.low <= step) { seen[id] = 1; queue.push(id); } });
  let best = 0;
  while (queue.length) {
    const a = queue.shift()!;
    const A = nodes[a];
    best = Math.max(best, A.s.high);
    const r = Math.floor(A.cell / n), c = A.cell % n;
    const next: number[] = [];
    for (const b of byCell[A.cell]) if (b !== a && Math.abs(nodes[b].s.low - A.s.low) <= step) next.push(b);
    DIRS.forEach(([dc, dr], d) => {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) return;
      const ha = A.s.edges[d];
      if (ha === null) return;
      for (const b of byCell[rr * n + cc]) {
        const hb = nodes[b].s.edges[opp(d)];
        if (hb !== null && Math.abs(ha - hb) <= step) next.push(b);
      }
    });
    for (const b of next) if (!seen[b]) { seen[b] = 1; queue.push(b); }
  }
  return best;
}

/** 把一片区域（行列闭区间）都设成同一个状态 */
export function fill(f: SpaceField, r0: number, c0: number, r1: number, c1: number, u: UnitState | ((r: number, c: number) => UnitState)): SpaceField {
  for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++)
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) f.cells[r * f.n + c] = typeof u === 'function' ? u(r, c) : u;
  return f;
}
