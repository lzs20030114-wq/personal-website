/**
 * 项目二 · 单元形态与 2-15 之间的对应（2026-11-16，作者「我们之前做好了的这个多样化的单元形态，以及好几个单元之间，
 * 就是完成我们要做的目的的时候，需要的那些特定单元组合之间的联系……中间的联系是缺失的」）。方案 = 项目二_形态与组合的连接.md。
 *
 * 一台单元要落下时，先看它在 2-15 里此刻替谁做什么（平面模型已经给出：sim.tableBy、sim.guides、猫在哪），再按这件事定它的形。
 * 形用 2-6 那几样写（方台定死，只用 2-15 的尺寸能真做出来的）：
 *   - 下层台面多高（top）；
 *   - 台面怎么斜：进来那侧多高、出去那侧多高（2-6 的倾斜在 2-15 里是每条带各抬一点，一台从一侧到对侧最多 0.39 m，形态方案 §4）；
 *   - 上层盖哪半圈（2-6 的上层完整度；两层用 2-3 的一条带两个结构，两块之间 0.52 m，cohabit-solid DUAL）。
 * 几台合起来是一件事：坐下的人面前那台当桌子；猫从它那里沿一串台走到座位前方那台，路上每一台朝下一台斜，接缝两边一样高
 * （2-13 的续坡），座位前方那台上层盖住背向座位的半圈、下层 0.90 m（猫坐上去眼睛与坐着的人齐平）。
 *
 * 只定形，不改平面模型：哪台落、什么时候落、猫往哪走仍是 cohabit.ts 的规则，研究读数逐位不变；立体那一层与小样读这里的结果。
 * 纯函数，不碰 DOM，不碰引擎。
 */
import { COHABIT, bandAngle, type FurnRect, type Guide } from './cohabit';
import type { PlanLayout } from './unit-activation';
import { SHELTER, TABLE_TOP, furnitureBoxes, shelterBands, shelterClear, tableTopFor, type Box } from './cohabit-solid';
import { ROOM } from './skin-grid';

const BANDS = COHABIT.FACES.BANDS;

/**
 * 几个数：
 * - LOW：地面上的猫跳上来那一端最低落到多高（m）。取 2-15 已经在用的最低台面（沙发前的茶几 0.42 m），不另定一个数；
 * - RISE：一台从一侧到对侧台面最多差多少（m）。每条带配平偏移 ±0.20 m，正对邻台的那条带在 ±9°，形态方案 §4 量的 0.39 m；
 * - PLATE：台厚 6.5 cm（UNIT_SHAPE h16）；CLEAR：台底离下面的家具至少留多少（m）。
 */
export const DESIGN = { LOW: TABLE_TOP.sofaFront, RISE: 0.39, PLATE: 0.065, CLEAR: 0.02, UPPER: 0.58 } as const;
/*
 * UPPER：两层的上层台面比下层台面高多少（m）。2-15 的两层台下层 0.90、上层台面 1.48（人猫同台lab §14.24），差 0.58；
 * 小样的守门按烘好的轨迹现量核对（cohabit-vignette.test.ts）。
 */

/**
 * 一台此刻替谁做什么。前六种平面模型给得出（roleOf）；后四种是小样里演的几件事，2-15 的规则还没有它们（项目二_形态与组合的连接.md §5）：
 * counter = 站着的人面前那台当站桌、桌下给猫一层 · flush = 与邻台的上层齐平接上 · cavity = 两台的空连成一条腔 · stair = 一半低一半高 ·
 * aisle = 人从它旁边走过时只收挡路的带（2-14 平面模型有这条，这里只给它定形）。
 */
export type Role = 'table' | 'step' | 'meet' | 'offer' | 'rest' | 'retreat' | 'counter' | 'flush' | 'cavity' | 'stair' | 'aisle';

/**
 * 一台的形用上了之前哪一台研究的哪一样（小样的图例与台上的标签读它）。lab = 实验编号（/lab 现行页面号）。
 * 不起新名字，写的是那台研究做的事。
 */
export type Source = 'two' | 'layers' | 'tilt' | 'stair' | 'flush' | 'cavity' | 'table' | 'guide' | 'giveway' | 'square';
export const SOURCES: Record<Source, { lab: string; zh: string; en: string }> = {
  square: { lab: '2-7', zh: '方形环：面 / 边 / 角三档键谱拼成方台', en: 'square ring: face, edge and corner key sets make a square platform' },
  two: { lab: '2-3', zh: '一条带上下两个结构：两块台相隔 0.52 m', en: 'two structures on one band: two platforms 0.52 m apart' },
  layers: { lab: '2-6', zh: '上下层各自成几圈：一部分带两块都成，其余只成下层', en: 'each level formed round part of the ring: some bands form both platforms, the rest only the lower' },
  tilt: { lab: '2-6 · 2-13', zh: '台面朝一边斜（每条带各抬一点），与邻台接缝两边一样高', en: 'a sloped top (each band raised a little), level with the next unit at the seam' },
  stair: { lab: '2-6 · 2-13', zh: '一半低一半高：每条带各抬一点，抬成两档', en: 'half low, half high: bands raised in two steps' },
  flush: { lab: '2-9 · 2-13', zh: '与邻台的台面齐平接上', en: 'level with the next unit’s platform' },
  cavity: { lab: '2-13', zh: '两台的空连成一条腔', en: 'the gaps of two units join into one cavity' },
  table: { lab: '2-14 · 2-15', zh: '人一坐下，面前那台落下当桌子，高度按家具定', en: 'when someone sits, the unit in front drops as a table at the furniture’s height' },
  guide: { lab: '2-14 · 2-9', zh: '坐着的人引猫：一次落一步，一台接一台', en: 'a seated person draws a cat over: one step at a time, unit after unit' },
  giveway: { lab: '2-14 · 2-6', zh: '只收挡路的带，台面留下不完整的一圈', en: 'only the bands in the way retract, leaving part of the ring' },
};

export interface UnitDesign {
  role: Role;
  /** 台面最低处离地（m）；两层的是下层台面 */
  top: number;
  /** 台面怎么斜：朝 inDir（平面方位角）那侧高 from、朝 outDir 那侧高 to；平的为 null */
  slope: { inDir: number; from: number; outDir: number; to: number } | null;
  /** 两层：上层盖住背向 open 的那半圈（open = 敞开那半圈朝的方位角）；整圈两层为 NaN；只有一层为 null */
  open: number | null;
  /** 一半低一半高：朝 dir 那半圈台面 high、另一半 low（只有 stair 有） */
  stair?: { dir: number; low: number; high: number };
  /** 猫从多高走上这一台（m）：上一台朝这边的高度，地面 = 0 */
  come: number;
  /** 猫从上一台（或地面）走上这一台时，接缝两边差多少（m，正 = 往上）：0 = 齐平，不用跳 */
  jump: number;
  /** 给台架的：二十条带各取两个结构的哪一种（1 = 两块都成、0 = 只成下层）、敞开朝哪、平台各条带抬多少 */
  form: { bands: Uint8Array | null; toward: number | null; lift?: number[] };
  /** 用上了之前哪几台研究（SOURCES；方形环三档每台都用，不重复列） */
  uses: readonly Source[];
}

// ── 斜的台面 ───────────────────────────────────────────────────────────────────────
/**
 * 一台的斜面：进来那侧（单位向量 pe）高 from、出去那侧（px）高 to，台面取过这两点、坡度最小的那个面
 * h(p) = c + g·(p·v)，v = (px − pe)/|px − pe|。直走（进出相对）|px − pe| = 2，拐弯（相差 90°）= √2——拐弯那台同样的进出高差
 * 坡要陡 √2 倍，所以一台能消化的高差直走 RISE、拐弯 RISE/√2（守门核对）。
 */
function plane(s: NonNullable<UnitDesign['slope']>): (th: number) => number {
  const ex = Math.cos(s.inDir);
  const ey = Math.sin(s.inDir);
  const wx = Math.cos(s.outDir) - ex;
  const wy = Math.sin(s.outDir) - ey;
  const L = Math.hypot(wx, wy);
  const c = (s.from + s.to) / 2;
  if (L < 1e-9) return () => c;
  const g = (s.to - s.from) / L;
  return (th) => c + (g * (Math.cos(th) * wx + Math.sin(th) * wy)) / L;
}

/** 进出两个方向下，一台能消化的最大高差（m） */
export function riseLimit(inDir: number, outDir: number): number {
  const L = Math.hypot(Math.cos(outDir) - Math.cos(inDir), Math.sin(outDir) - Math.sin(inDir));
  return (DESIGN.RISE * L) / 2;
}

/** 每条带抬多少：按带的方位角给，再整体减掉最小的那条（一台里总有一条不抬，整台按它落位）。小样（cohabit-vignette）也用这一个 */
export function liftOf(fn: (angle: number) => number): number[] {
  const v = Array.from({ length: BANDS }, (_, j) => Math.max(0, fn(bandAngle(j))));
  const lo = Math.min(...v);
  return v.map((x) => x - lo);
}

/** 一台朝方位角 th 那一侧的台面多高（m）：接缝那里猫踩的高度。两层的按下层算（路接的是下层） */
export function heightToward(d: Pick<UnitDesign, 'top' | 'slope' | 'stair'>, th: number): number {
  if (d.stair) return Math.cos(th - d.stair.dir) > 0 ? d.stair.high : d.stair.low;
  return d.slope ? plane(d.slope)(th) : d.top;
}

/**
 * 这台最低能落多低（m）：台的方形（半边 platR，再留 FURN_GAP，与桌子规则 platformClear 同一口径）下面压着的家具，
 * 按块算（沙发的坐垫 0.43 / 扶手 0.62 / 靠背 0.80，餐椅的座板 0.45 / 靠背 0.85，cohabit-solid furnitureBoxes 的那几块），
 * 取压着的最高那块 + 台厚 + 留空；一块都不压 = LOW。按整件家具的最高处算会把只擦到坐垫前沿的台也抬到靠背以上。
 */
export function floorFor(l: Pick<PlanLayout, 'platR'>, u: { x: number; y: number }, rects: readonly FurnRect[]): number {
  let f: number = DESIGN.LOW;
  const h = l.platR + COHABIT.TABLE.FURN_GAP;
  for (const b of furnitureBoxes(rects, 1)) {
    if (!footOverlap(u, h, b)) continue;
    const top = ROOM.FLOOR_Y - b.cy + b.hy; // furnitureBoxes 按 1 单位/米：cy = FLOOR_Y − 块中心离地
    f = Math.max(f, top + DESIGN.PLATE + DESIGN.CLEAR);
  }
  return f;
}

/** 台的方形（中心 u、半边 h，轴对齐）与家具一块的平面占位（可能转过）有没有重叠：分离轴 */
function footOverlap(u: { x: number; y: number }, h: number, b: Box): boolean {
  const c = b.rot?.c ?? 1;
  const s = b.rot?.s ?? 0;
  // 块自身的两个轴在世界平面（x, z→y）里的方向：lx → (c, −s)、lz → (s, c)
  const ax: [number, number][] = [[1, 0], [0, 1], [c, -s], [s, c]];
  const dx = b.cx - u.x;
  const dy = b.cz - u.y;
  for (const [nx, ny] of ax) {
    const rU = h * (Math.abs(nx) + Math.abs(ny));
    const rB = b.hx * Math.abs(c * nx - s * ny) + b.hz * Math.abs(s * nx + c * ny);
    if (Math.abs(dx * nx + dy * ny) >= rU + rB) return false;
  }
  return true;
}

const flat = (role: Role, top: number, come = top, uses: readonly Source[] = []): UnitDesign => ({ role, top, slope: null, open: null, come, jump: top - come, form: { bands: null, toward: null }, uses });

/**
 * 路上的一步：从上一台（或地面）进来、朝下一台出去。
 * - 进来那侧 = 上一台此刻朝这边的高度（entryWant），地面上的猫跳上来那一台 = LOW；比这台能落的最低处还低就抬到最低处（猫多跳一点）；
 * - 出去那侧：离终点还有 remaining 台（含这台、不含终点），高差平摊，超过这台能消化的就截住（剩下的留到终点那道接缝）；
 * - 斜面最低处碰到下面的家具，整面抬上去。
 */
export function stepDesign(o: {
  at: { x: number; y: number };
  /** 猫从哪边进来：上一台的台心，或地面上的猫此刻的位置 */
  prev: { x: number; y: number };
  next: { x: number; y: number };
  /** 进来那侧想要多高（上一台朝这边的高度；地面上的猫 = LOW） */
  entryWant: number;
  /** 猫从多高走过来（上一台朝这边的高度；地面 = 0） */
  entryFrom: number;
  /** 终点的台面多高 */
  target: number;
  /** 离终点还有几台（含这台、不含终点），≥ 1 */
  remaining: number;
  /** 这台最低能落多低 */
  floor: number;
}): UnitDesign {
  const inDir = Math.atan2(o.prev.y - o.at.y, o.prev.x - o.at.x);
  const outDir = Math.atan2(o.next.y - o.at.y, o.next.x - o.at.x);
  const e = Math.max(o.entryWant, o.floor);
  const lim = riseLimit(inDir, outDir);
  const want = e + (o.target - e) / Math.max(1, o.remaining);
  const x = Math.max(e - lim, Math.min(e + lim, Math.max(want, o.floor)));
  let s = { inDir, from: e, outDir, to: x };
  let h = plane(s);
  const hs = Array.from({ length: BANDS }, (_, j) => h(bandAngle(j)));
  const lo = Math.min(...hs);
  if (lo < o.floor) {
    const up = o.floor - lo;
    s = { inDir, from: e + up, outDir, to: x + up };
    h = plane(s);
  }
  const lift = liftOf(h);
  const top = Math.min(...Array.from({ length: BANDS }, (_, j) => h(bandAngle(j))));
  return { role: 'step', top, slope: s, open: null, come: o.entryFrom, jump: s.from - o.entryFrom, form: { bands: null, toward: null, lift }, uses: ['tilt', 'guide'] };
}

/**
 * 座位前方那台（猫被引到这里陪坐着的人）：两层，敞开那半圈朝座位、上层盖背后那半圈，下层 0.90 m（SHELTER.lowerTop）——
 * 原来按 60% 的几率抽（UNIT_FORM_ODDS），这里改成只要下面放得下（shelterClear）就是它；放不下的仍是 1.05 m 的平台。
 */
export function meetDesign(
  l: Pick<PlanLayout, 'platR'>,
  u: { x: number; y: number },
  seat: { x: number; y: number },
  rects: readonly FurnRect[],
  entryFrom: number,
): UnitDesign {
  if (!shelterClear(l, u, rects)) return flat('meet', TABLE_TOP.stand, entryFrom, ['guide']);
  const open = Math.atan2(seat.y - u.y, seat.x - u.x);
  return { role: 'meet', top: SHELTER.lowerTop, slope: null, open, come: entryFrom, jump: SHELTER.lowerTop - entryFrom, form: { bands: shelterBands(open, BANDS), toward: open }, uses: ['two', 'layers', 'guide'] };
}

/** 终点那台会成多高（还没落下时先按它算路上的高度） */
export function meetTop(l: Pick<PlanLayout, 'platR'>, u: { x: number; y: number }, rects: readonly FurnRect[]): number {
  return shelterClear(l, u, rects) ? SHELTER.lowerTop : TABLE_TOP.stand;
}

// ── 从平面模型读这台此刻替谁做什么 ────────────────────────────────────────────────────
/** 平面模型里这一层要读的东西（CohabitSim 与小样的脚本都给得出） */
export interface DesignSim {
  readonly layout: Pick<PlanLayout, 'platR' | 'units'>;
  readonly tableBy: ArrayLike<number>;
  readonly furn: { readonly rects: readonly FurnRect[] } | null;
  readonly seats: readonly { x: number; y: number }[];
  readonly people: readonly { id: number; seated: boolean; seat: number | null }[];
  readonly cats: readonly { id: number; unit: { i: number } | null; pending?: { i: number } | null; state: string; walker: { x: number; y: number } }[];
  readonly guides: readonly Guide[];
}

export interface RoleOf {
  role: Role;
  /** 是哪一条路（坐着引猫 / 站着给一步）、这台在路上第几个 */
  guide?: Guide;
  k?: number;
}

/**
 * 这台此刻替谁做什么，按这个先后：某个座位的桌子 → 坐着的人引猫那条路的终点 / 路上的一步 → 站着的人给的一步 →
 * 退开的猫要去的那台 → 其余（猫脚下那台、猫要去的那台、地面上的猫要跳上的那台……都按「猫待着」）。
 */
export function roleOf(sim: DesignSim, u: number): RoleOf {
  if (sim.tableBy[u] >= 0) return { role: 'table' };
  for (const g of sim.guides) {
    if (g.kind !== 'sit') continue;
    const k = g.path.indexOf(u);
    if (k < 0) continue;
    const cat = sim.cats.find((c) => c.id === g.cat);
    const onUnit = !!cat?.unit;
    if (k === g.path.length - 1) return { role: 'meet', guide: g, k };
    if (k === 0 && onUnit) continue; // 猫脚下那台：早就落着、形不换
    return { role: 'step', guide: g, k };
  }
  for (const g of sim.guides) if (g.kind === 'stand' && g.path[g.path.length - 1] === u) return { role: 'offer', guide: g, k: g.path.length - 1 };
  if (sim.cats.some((c) => c.state === 'retreat' && ((c.pending && c.pending.i === u) || (c.unit && c.unit.i === u)))) return { role: 'retreat' };
  return { role: 'rest' };
}

/**
 * 一台开始落下时定它的形。formed = 已经落着的台各自的形（形一旦定了，收回之前不换——cohabit-solid unitFormPlan 那条照旧）。
 * 路上的一步按上一台此刻朝这边的高度接；上一台还没定形（不该发生）就按 1.05 m 的平台算。
 */
export function designUnit(sim: DesignSim, u: number, formed: readonly (UnitDesign | null)[]): UnitDesign {
  const l = sim.layout;
  const at = l.units[u];
  const rects = sim.furn?.rects ?? [];
  const r = roleOf(sim, u);
  if (r.role === 'table') return flat('table', sim.furn ? tableTopFor(rects[sim.tableBy[u]]) : TABLE_TOP.stand, undefined, ['table']);
  if (r.role === 'retreat') {
    // 退开的猫去的那台：整圈两层，猫可以钻到上层下面（Ellis 等 2013：看不见威胁时觉得安全）。平面模型不知道这一层，读数照旧
    if (!shelterClear(l, at, rects)) return flat('retreat', TABLE_TOP.stand);
    return { role: 'retreat', top: SHELTER.lowerTop, slope: null, open: Number.NaN, come: SHELTER.lowerTop, jump: 0, form: { bands: new Uint8Array(BANDS).fill(1), toward: null }, uses: ['two'] };
  }
  if (r.role !== 'step' && r.role !== 'meet') return flat(r.role, TABLE_TOP.stand);
  const g = r.guide!;
  const k = r.k!;
  const cat = sim.cats.find((c) => c.id === g.cat)!;
  // 猫从哪边、多高过来
  const prevU = k > 0 ? l.units[g.path[k - 1]] : null;
  const prevD = prevU ? formed[prevU.i] : null;
  const prevPos = prevU ?? cat.walker;
  const dirIn = Math.atan2(at.y - prevPos.y, at.x - prevPos.x);
  const fromH = prevU ? (prevD ? heightToward(prevD, dirIn) : TABLE_TOP.stand) : 0;
  const person = sim.people.find((p) => p.id === g.person);
  if (r.role === 'meet') {
    const seat = person && person.seat !== null ? sim.seats[person.seat] : at;
    return meetDesign(l, at, seat, rects, fromH);
  }
  const dest = l.units[g.path[g.path.length - 1]];
  return stepDesign({
    at,
    prev: prevPos,
    next: l.units[g.path[k + 1]],
    entryWant: prevU ? fromH : DESIGN.LOW,
    entryFrom: fromH,
    target: formed[dest.i]?.top ?? meetTop(l, dest, rects),
    remaining: g.path.length - 1 - k,
    floor: floorFor(l, at, rects),
  });
}

// ── 小样里演的几件事（2-15 的规则还没有它们，项目二_形态与组合的连接.md §5）──────────────────

/**
 * 沙发前的茶几那台，有猫要来时：朝沙发那半圈只成下层当茶几（0.42 m，2-14 的桌子规则），背后半圈两块都成，上层（1.00 m）给猫。
 * 与座位前方那台同一种形（上层盖背向座位的半圈），只是下层落到茶几的高度。face = 沙发的朝向（敞开那半圈朝沙发 = −face）。
 */
export function teaShelfDesign(face: readonly [number, number]): UnitDesign {
  const open = Math.atan2(-face[1], -face[0]);
  const top = TABLE_TOP.sofaFront;
  return { role: 'table', top, slope: null, open, come: top, jump: 0, form: { bands: shelterBands(open, BANDS), toward: open }, uses: ['table', 'two', 'layers'] };
}

/** 平台与邻台齐平接上（2-9 的齐平、2-13 的接高接低）：台面 = 邻台猫要踩的那一层（两层的接上层） */
export function flushDesign(next: Pick<UnitDesign, 'top' | 'open' | 'stair'>): UnitDesign {
  const top = next.stair ? next.stair.high : next.open !== null ? next.top + DESIGN.UPPER : next.top;
  return flat('flush', top, top, ['flush']);
}

/** 站着的人面前那台当站桌：整圈两层，上层台面 1.05 m（2-15 站着用的高度），下层 0.47 m 给猫趴着 */
export function counterDesign(): UnitDesign {
  const top = TABLE_TOP.stand - DESIGN.UPPER;
  return { role: 'counter', top, slope: null, open: Number.NaN, come: top, jump: 0, form: { bands: new Uint8Array(BANDS).fill(1), toward: null }, uses: ['two'] };
}

/** 两台的空连成一条腔（2-13 合腔）：相邻两台整圈两层、下层同高 0.90 m，两块之间的空接成一条 */
export function cavityDesign(): UnitDesign {
  const top = SHELTER.lowerTop;
  return { role: 'cavity', top, slope: null, open: Number.NaN, come: top, jump: 0, form: { bands: new Uint8Array(BANDS).fill(1), toward: null }, uses: ['two', 'cavity'] };
}

/** 一半低一半高：朝 dir 那半圈抬到 high、另一半 low（每条带各抬一点，抬成两档；高差不超过一台能抬的 RISE） */
export function stairDesign(dir: number, low: number, high: number, come = 0): UnitDesign {
  const rise = Math.min(high - low, DESIGN.RISE + 0.01);
  const lift = liftOf((a) => (Math.cos(a - dir) > 0 ? rise : 0));
  return { role: 'stair', top: low, slope: null, open: null, stair: { dir, low, high: low + rise }, come, jump: low - come, form: { bands: null, toward: null, lift }, uses: ['stair'] };
}

/** 人从旁边走过的台：站着用的高度 1.05 m 的平台，人走近时只收挡路的带（2-14 的让路，2-6 的不完整台面） */
export function aisleDesign(): UnitDesign {
  return flat('aisle', TABLE_TOP.stand, TABLE_TOP.stand, ['giveway']);
}

// ── 图例上的字 ───────────────────────────────────────────────────────────────────
const ROLE_NAME: Record<Role, [string, string]> = {
  table: ['桌子', 'Table'],
  step: ['路上的一步', 'A step on the way'],
  meet: ['座位前方那台', 'The unit by the seat'],
  offer: ['站着的人给的一步', 'A step offered to a standing visitor'],
  rest: ['猫待着的台', 'Where a cat rests'],
  retreat: ['猫退开去的台', 'Where a cat withdraws'],
  counter: ['站桌', 'Standing counter'],
  flush: ['接上邻台', 'Joining the next unit'],
  cavity: ['合成一条腔', 'Half of a joined cavity'],
  stair: ['先低后高', 'Low, then high'],
  aisle: ['让路的台', 'Giving way'],
};

/** 这台在做什么（图例的第一栏） */
export function roleName(d: Pick<UnitDesign, 'role' | 'open'>, lang: 'zh' | 'en'): string {
  if (d.role === 'table' && d.open !== null) return lang === 'zh' ? '茶几兼猫台' : 'Coffee table and cat shelf';
  return ROLE_NAME[d.role][lang === 'zh' ? 0 : 1];
}

const m2 = (v: number): string => v.toFixed(2);

/**
 * 这台成什么形，用 2-6 那几样写（图例的第二栏）。half = 方台半边长（m），只用来把斜面换算成角度：
 * 进出两侧接缝之间的平面距离 = |px − pe| × half。
 */
export function formText(d: UnitDesign, lang: 'zh' | 'en', half: number): string {
  const zh = lang === 'zh';
  if (d.stair) return zh ? `一半 ${m2(d.stair.low)} m · 一半 ${m2(d.stair.high)} m` : `half at ${m2(d.stair.low)} m · half at ${m2(d.stair.high)} m`;
  if (d.slope) {
    const s = d.slope;
    const L = Math.hypot(Math.cos(s.outDir) - Math.cos(s.inDir), Math.sin(s.outDir) - Math.sin(s.inDir)) * half;
    const deg = L > 1e-9 ? (Math.atan(Math.abs(s.to - s.from) / L) * 180) / Math.PI : 0;
    return zh ? `平台 · 台面 ${m2(s.from)} → ${m2(s.to)} m · 斜 ${deg.toFixed(0)}°` : `platform · ${m2(s.from)} → ${m2(s.to)} m · ${deg.toFixed(0)}° slope`;
  }
  if (d.open !== null) {
    const up = d.top + DESIGN.UPPER;
    if (Number.isNaN(d.open)) return zh ? `两层整圈 · 下层 ${m2(d.top)} m · 上层 ${m2(up)} m` : `two levels all round · lower ${m2(d.top)} m · upper ${m2(up)} m`;
    const n = d.form.bands ? d.form.bands.reduce((a, b) => a + b, 0) : 0;
    return zh ? `两层 · 下层 ${m2(d.top)} m 整圈 · 上层 ${m2(up)} m 只盖背后 ${n} 条带` : `two levels · lower ${m2(d.top)} m all round · upper ${m2(up)} m over the back ${n} bands`;
  }
  return zh ? `平台 · 台面 ${m2(d.top)} m` : `platform · ${m2(d.top)} m`;
}
