/**
 * 项目二 · 一台单元的形态研究（2026-11-16，作者「每个单元的形态还是没有开发的足够……单单从这个方面展开想象力和组合的排列可能性」）。
 * 方案与发现 = 项目二_单元形态研究.md；线稿 = scripts/unit-forms/atlas.mjs（与本模块同一份实现）。
 *
 * 一台单元 = 一根芯 + 二十条布带。每条带是一张二维剖面，各自用站上同一份引擎解（带与带之间不相互作用，与 2-5 / 2-6 / 2-15 同）。
 * 这里给每条带编一段「程序」：这条带上有几块台、每块是什么剖面、各停在芯上多高；二十段程序合起来就是一台单元的形。
 *
 * 能编的东西都是量过的（2026-11-16，338 节带、站上平台的整形选项；守门 unit-forms.test.ts 现跑引擎核对）：
 * - **台的深度**：6.6 cm 台 k 14–62 键全锁、不打结、台厚到位，挑出 26.6–120.7 px。深度表 = UF_DEPTH。
 * - **台的厚度**：16 / 36 / 56 px（6.6 / 15 / 23 cm）。厚台要更深的 k 才折得起来（15 cm k 29–65、23 cm k 46–80），见 UF_DEPTH。
 * - **台在芯上的高度**：把贴芯的节从上面挪到下面，整块台沿芯平移，每节 2 px（≈ 8 mm），实测挪 240 节（约 2 m）形状偏差 ≤ 0.053 px。
 *   所以一条带上的台可以停在芯上任何一处，不止 2-15 形态方案 §4 说的 ±0.20 m。
 * - **一条带上几块台**：两块、三块都行（任意深度组合），四块要浅台（k ≤ 16 左右）；两块之间贴芯 ≥ 29 节逐位互不影响（2-3）。
 * - **目录形**：蘑菇挑台、直挑台、阶梯挑台（2-1 那几张键谱）也能当一条带的剖面；袋收到 0.66 就停，只能整台都是袋。
 * - **收**：一条带不成形、贴着芯（2-15 的让路，收到底平贴芯 0.0 px）。
 *
 * 一台单元的二十条带共用一根芯和上下两个夹环，所以每条带收缩后必须一样长：自由段总节数相同、贴芯总节数相同。
 * 做法与 2-15 一样，在最上面那块台上方补一段不扣键的「垫」（贴着芯），再隔一段 ISO 贴芯。`unitLayout` 管这件事。
 */
import { SKIN, type SkinSeg, type SkinSpec, type SkinUnitOpts } from './skin-unit';
import { SQUARE, squareAngle, squareSeg } from './skin-square';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import { UNIT_CUT, UNIT_TIERS, UNITS_PER_M } from './cohabit-solid';
import { RIG_SCALE } from './skin-grid';
import { SQUARE_SCALE } from './cohabit';
import { vignetteLayout } from './cohabit-vignette';

const ROOM = vignetteLayout(8);

export const UF = {
  /** 一台几条带 */
  COUNT: SQUARE.COUNT,
  /** 一条布预裁多长（与 2-15 同一个数） */
  CUT: UNIT_CUT,
  /** 带子贴芯处离芯轴（px）：挑出从这里量 */
  R0: SQUARE.RADIUS,
  LEAD_MIN: SQUARE.LEAD_MIN,
  TAIL_MIN: SQUARE.TAIL_MIN,
  ISO: SQUARE.ISO,
  /** 两块台之间贴芯的下限：2-3 量出的逐位解耦下限 */
  MID_MIN: 29,
  /** 贴芯一节沿芯多长（px，与收缩程度无关） */
  GLUE_PX: SKIN.SEG * 100,
  /** 一个引擎 px 在 2-15 那间房里是多少米（与 space-forms 守门同一个换算） */
  MPP: (((RIG_SCALE * ROOM.pitchM) / ROOM.pitch4) * SQUARE_SCALE) / UNITS_PER_M,
} as const;

/** 一节贴芯的布沿芯多少米 */
export const UF_NODE_M = UF.GLUE_PX * UF.MPP;

export type PlateH = 16 | 36 | 56;

/**
 * 平台深度表（scripts/unit-forms/measure.mjs 实测 2026-11-16，338 节带、结构贴底、尾 5 节、站上平台的整形选项）：
 * k → [终态挑出 px, 台面离钉住端 px, 台底离钉住端 px]。
 * 只收**连续一段**键全锁、不打结、台厚与目标差 ≤ 1 px 的 k：
 * - 6.6 cm（16）：k 14–62。k 10–13 键也锁，但台只有 8–11 px 厚（太浅，方箱立不起来）；k 63、67、68 起零星打结。
 * - 15 cm（36）：k 29–65。k 26–28 台厚只有 26–33 px；k 66 打结。
 * - 23 cm（56）：k 46–80。k 43–45 台厚不到 52 px；量到 80 为止（再深要更长的布）。
 */
export const UF_DEPTH: Record<PlateH, { klo: number; rows: readonly (readonly [number, number, number])[] }> = {
  16: {
    klo: 14,
    rows: [
      [26.6, 26.2, 10], [28.2, 27.7, 11.6], [30.9, 28.5, 12.3], [32.4, 29.4, 13.3], [34.5, 30.6, 14.6],
      [36.2, 31.5, 15.5], [38.4, 32.7, 16.7], [40.1, 33.2, 17.2], [41.9, 34, 18], [44.1, 35.3, 19.3],
      [45.8, 36, 20], [48.1, 37, 21], [49.8, 37.8, 21.7], [51.9, 39.7, 23.5], [53.9, 40.3, 24.1],
      [55.5, 40.9, 24.7], [57.5, 42, 25.9], [59.4, 42.7, 26.5], [61.5, 43.8, 27.7], [63.3, 44.4, 28.3],
      [65.4, 45.6, 29.4], [67.3, 46.2, 30], [69.5, 46.9, 30.8], [71.6, 48.1, 31.9], [73.4, 48.7, 32.5],
      [75.6, 49.8, 33.7], [77.4, 50.5, 34.3], [79.5, 51.6, 35.5], [81.3, 52.3, 36.1], [83.2, 52.9, 36.7],
      [85.3, 54, 37.9], [87.1, 54.6, 38.4], [89.2, 55.8, 39.7], [91.1, 56.4, 40.3], [93.2, 57.6, 41.5],
      [95, 58.2, 42.1], [96.8, 58.8, 42.7], [99, 60, 43.9], [101, 60.6, 44.4], [103, 61.8, 45.6],
      [104.8, 62.4, 46.2], [106.9, 63.6, 47.4], [108.8, 64.2, 48], [110.7, 64.8, 48.6], [112.7, 66, 49.8],
      [114.6, 66.6, 50.4], [116.7, 67.8, 51.6], [118.6, 68.4, 52.2], [120.7, 69.6, 53.4],
    ],
  },
  36: {
    klo: 29,
    rows: [
      [45, 45.3, 9.1], [46.1, 46.5, 10.2], [47.7, 47.3, 11], [50, 48, 11.8], [52, 48.9, 12.7],
      [53.6, 49.7, 13.4], [55.8, 50.7, 14.5], [57.6, 51.5, 15.3], [59.7, 52.5, 16.4], [61.5, 53.3, 17.1],
      [63.6, 54.7, 18.6], [65.4, 55.4, 19.3], [68, 56.2, 20.1], [70.3, 57.3, 21.2], [71.9, 58, 21.9],
      [74, 60, 23.8], [75.8, 60.6, 24.4], [77.9, 61.8, 25.6], [79.6, 62.3, 26.2], [81.4, 63, 26.8],
      [83.5, 64.1, 28], [85.2, 64.7, 28.6], [87.3, 65.9, 29.7], [89.1, 66.5, 30.3], [91.2, 67.7, 31.5],
      [93, 68.3, 32.1], [94.8, 68.9, 32.7], [96.9, 70, 33.9], [99, 70.7, 34.5], [101.1, 71.8, 35.7],
      [102.8, 72.4, 36.3], [105, 73.6, 37.4], [106.8, 74.2, 38.1], [108.6, 74.8, 38.7], [110.7, 76.1, 39.9],
      [112.5, 76.7, 40.5], [114.7, 77.9, 41.7],
    ],
  },
  56: {
    klo: 46,
    rows: [
      [68.9, 65.1, 8.8], [70.1, 66.5, 10.1], [71.7, 67.3, 10.9], [74.2, 68.2, 11.8], [75.9, 69, 12.6],
      [78.2, 70, 13.6], [79.9, 70.7, 14.4], [81.6, 71.5, 15.2], [83.9, 72.5, 16.2], [85.6, 73.3, 17],
      [87.7, 74.7, 18.4], [89.5, 75.4, 19.1], [91.7, 76.4, 20.2], [93.4, 77.1, 20.9], [95.2, 77.8, 21.6],
      [97.3, 79.9, 23.6], [99.3, 80.5, 24.2], [101.4, 81.6, 25.3], [103.1, 82.2, 26], [105.3, 83.4, 27.1],
      [107.1, 84, 27.7], [108.9, 84.6, 28.3], [110.9, 85.8, 29.5], [112.8, 86.4, 30.1], [115, 87.5, 31.3],
      [116.7, 88.1, 31.9], [118.8, 89.3, 33], [120.7, 89.9, 33.6], [122.5, 90.5, 34.2], [124.6, 91.7, 35.4],
      [126.4, 92.3, 36], [128.5, 93.5, 37.2], [130.4, 94.1, 37.8], [132.5, 95.3, 39.1], [134.3, 96, 39.7],
    ],
  },
};

function depthRow(k: number, h: PlateH): readonly [number, number, number] | null {
  const t = UF_DEPTH[h];
  const i = k - t.klo;
  return i >= 0 && i < t.rows.length ? t.rows[i] : null;
}
/** 这块台的终态挑出（px）；不在表里 = 这个深度做不出来 */
export function plateReach(k: number, h: PlateH = 16): number | null {
  return depthRow(k, h)?.[0] ?? null;
}
/** 这个厚度能用的深度范围 */
export function plateKRange(h: PlateH = 16): [number, number] {
  const t = UF_DEPTH[h];
  return [t.klo, t.klo + t.rows.length - 1];
}
/** 离芯轴多少米的外缘，用哪个 k 最接近（夹在可用范围里） */
export function kForRadius(radiusM: number, h: PlateH = 16): number {
  const want = radiusM / UF.MPP - UF.R0;
  const [lo, hi] = plateKRange(h);
  let best = lo;
  for (let k = lo; k <= hi; k++) if (Math.abs(plateReach(k, h)! - want) < Math.abs(plateReach(best, h)! - want)) best = k;
  return best;
}
/** 这个 k 的外缘离芯轴多少米 */
export function radiusOfK(k: number, h: PlateH = 16): number {
  const r = plateReach(k, h);
  if (r === null) throw new Error(`k=${k} 台厚 ${h} 不在深度表里`);
  return (UF.R0 + r) * UF.MPP;
}

// ── 剖面与带的程序 ───────────────────────────────────────────────────────────────

export type CatKey = 'bulb' | 'ledge' | 'stepped' | 'pocket';
export type Section = { kind: 'plate'; k: number; h: PlateH } | { kind: 'cat'; key: CatKey };

/** 一条带的程序：由下往上几块台；gaps[0] = 最下面那块下面贴芯几节（尾，≥ TAIL_MIN），gaps[i] = 第 i 块与第 i−1 块之间（≥ MID_MIN） */
export interface BandProgram {
  secs: readonly Section[];
  gaps: readonly number[];
}
/** null = 这条带收着（贴芯，不成形） */
export type BandSlot = BandProgram | null;

export interface UnitForm {
  key: string;
  zh: string;
  group: string;
  how: string;
  bands: readonly BandSlot[];
  /** 相邻带之间拉不拉膜（默认拉；收着的带两侧不拉，2-15 同） */
  skin?: boolean;
  /** 这几条带与下一条之间不拉膜（螺旋转回起点那一道：两边差一整圈的高度，膜会拉成一面竖墙） */
  cuts?: readonly number[];
}

const CAT = (key: CatKey) => SKIN_UNITS.find((d) => d.key === key)!;

/** 一块台的结构段（带键的那段自由段） */
export function sectionSeg(sec: Section): SkinSeg {
  if (sec.kind === 'plate') {
    if (plateReach(sec.k, sec.h) === null) throw new Error(`台 k=${sec.k} 厚 ${sec.h} 不在深度表里`);
    return squareSeg(sec.k, sec.h);
  }
  const seg = CAT(sec.key).spec.find((s) => s[0] === 'f');
  if (!seg) throw new Error(`目录形 ${sec.key} 没有结构段`);
  return seg;
}

/** 一条带的整形选项：台用站上平台那套；目录形用它自己那套；两种不能混在一条带上（整形会互相干扰） */
export function bandOpts(prog: BandProgram): SkinUnitOpts {
  const cats = prog.secs.filter((s) => s.kind === 'cat') as { kind: 'cat'; key: CatKey }[];
  if (cats.length === 0) return UNIT_TIERS[0].opts;
  if (cats.length !== prog.secs.length || new Set(cats.map((c) => c.key)).size > 1) throw new Error('一条带上台与目录形不能混用');
  return skinSiteOpts(CAT(cats[0].key));
}

export interface UnitLayout {
  /** 每条带自由段总节数（含垫） */
  F: number;
  /** 每条带贴芯总节数 */
  G: number;
  /** 每条带铺出去多少节（F + G，≤ CUT，余下卷在上夹环里） */
  B: number;
  /** 做不出来的原因（空 = 做得出） */
  errors: string[];
}

function freeOf(prog: BandProgram): number {
  return prog.secs.reduce((a, s) => a + sectionSeg(s)[1], 0);
}
function glueOf(prog: BandProgram): number {
  return prog.gaps.reduce((a, g) => a + g, 0) + UF.ISO + UF.LEAD_MIN;
}

/** 二十条带怎么排进同一根芯：自由段补到同一个总数、贴芯补到同一个总数，带长不超过预裁的那段布 */
export function unitLayout(form: UnitForm): UnitLayout {
  const errors: string[] = [];
  let F = 0;
  let G = 0;
  const pocket = form.bands.some((b) => b?.secs.some((s) => s.kind === 'cat' && s.key === 'pocket'));
  form.bands.forEach((b, j) => {
    if (!b) return;
    if (b.secs.length === 0 || b.gaps.length !== b.secs.length) errors.push(`带 ${j}：台与间距对不上`);
    if (b.gaps[0] < UF.TAIL_MIN) errors.push(`带 ${j}：最下面那块下面只有 ${b.gaps[0]} 节`);
    b.gaps.slice(1).forEach((g, i) => g < UF.MID_MIN && errors.push(`带 ${j}：第 ${i + 1}、${i + 2} 块之间只有 ${g} 节（< ${UF.MID_MIN}）`));
    try {
      bandOpts(b);
      F = Math.max(F, freeOf(b));
    } catch (e) {
      errors.push(`带 ${j}：${(e as Error).message}`);
    }
    G = Math.max(G, glueOf(b));
    if (pocket && b.secs.some((s) => !(s.kind === 'cat' && s.key === 'pocket'))) errors.push(`带 ${j}：袋收到 0.66 就停，整台都得是袋`);
  });
  if (pocket && form.bands.some((b) => !b)) errors.push('袋这一台不能有收着的带');
  const B = F + G;
  if (B > UF.CUT) errors.push(`带长 ${B} 节超过预裁的 ${UF.CUT} 节`);
  return { F, G, B, errors };
}

/** 一条带的引擎谱：[贴芯 lead | 垫 | 贴芯 ISO | 最上面那块 | 贴芯 | … | 最下面那块 | 尾]，自由段与贴芯都补到 layout 的总数 */
export function bandSpec(prog: BandProgram, layout: Pick<UnitLayout, 'F' | 'G'>): SkinSpec {
  const pad = layout.F - freeOf(prog);
  const lead = layout.G - UF.ISO - prog.gaps.reduce((a, g) => a + g, 0);
  if (pad < 0 || lead < UF.LEAD_MIN) throw new Error(`带排不下：垫 ${pad} lead ${lead}`);
  const out: SkinSeg[] = pad > 0 ? [['g', lead], ['f', pad, []], ['g', UF.ISO]] : [['g', lead + UF.ISO]];
  for (let i = prog.secs.length - 1; i >= 0; i--) {
    out.push(sectionSeg(prog.secs[i]));
    out.push(['g', prog.gaps[i]]);
  }
  return out;
}

/** 带的「结构配置」：几块台、各是什么、彼此隔多远（不含尾）。同一配置换尾只是整体平移，引擎只需跑一次 */
export function configKey(prog: BandProgram): string {
  return JSON.stringify({ s: prog.secs, m: prog.gaps.slice(1) });
}
/** 这个配置的标准跑法：尾 = TAIL_MIN、不补垫 */
export function configProgram(prog: BandProgram): BandProgram {
  return { secs: prog.secs, gaps: [UF.TAIL_MIN, ...prog.gaps.slice(1)] };
}

// ── 引擎结果 ────────────────────────────────────────────────────────────────────

/** 一块台成形后的剖面（px）：pts 由下往上沿布排；x 离贴芯处（挑出），y 离钉住端 */
export interface StructShape {
  pts: [number, number][];
  reach: number;
  top: number;
  bot: number;
}
export interface BandShape {
  structs: StructShape[];
  locked: number;
  bonds: number;
  knot: number;
}

/** 终态：从引擎节点读出每块台的剖面（spec 里结构段的下标与 bandSpec 的排法一致） */
export function readBand(spec: SkinSpec, px: ArrayLike<number>, py: ArrayLike<number>, n: number, locked: number): BandShape {
  const foot = py[n - 1] * 100;
  const structs: StructShape[] = [];
  let at = 0;
  let bonds = 0;
  for (const seg of spec) {
    if (seg[0] === 'f' && seg[2].length > 0) {
      bonds += seg[2].length;
      const pts: [number, number][] = [];
      for (let i = at + seg[1] - 1; i >= at; i--) pts.push([px[i] * 100, Math.abs(py[i] * 100 - foot)]);
      let reach = 0;
      for (const p of pts) reach = Math.max(reach, p[0]);
      const ys = pts.filter((p) => p[0] > 0.5 * reach).map((p) => p[1]);
      structs.unshift({ pts, reach, top: Math.max(...ys), bot: Math.min(...ys) });
    }
    at += seg[1];
  }
  // spec 由上往下排，逐个 unshift 后 structs[0] = 最下面那块
  return { structs, locked, bonds, knot: selfLoop(px, py, n) };
}

/** 最大自交环（节）：剖面折线自己和自己相交，两个交点之间隔多少节 */
export function selfLoop(px: ArrayLike<number>, py: ArrayLike<number>, n: number): number {
  let w = 0;
  for (let i = 0; i < n - 1; i++)
    for (let j = i + 2; j < n - 1; j++) {
      const ax = px[i], ay = py[i], bx = px[i + 1], by = py[i + 1], cx = px[j], cy = py[j], dx = px[j + 1], dy = py[j + 1];
      const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
      const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
      const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
      if (d1 * d2 < 0 && d3 * d4 < 0) w = Math.max(w, j - i);
    }
  return w;
}

/** 标准跑法（尾 = TAIL_MIN）的剖面挪到这条带实际的尾：整体上移 2 px/节 */
export function placeBand(shape: BandShape, prog: BandProgram): BandShape {
  const dy = (prog.gaps[0] - UF.TAIL_MIN) * UF.GLUE_PX;
  return {
    ...shape,
    structs: shape.structs.map((s) => ({ pts: s.pts.map(([x, y]) => [x, y + dy] as [number, number]), reach: s.reach, top: s.top + dy, bot: s.bot + dy })),
  };
}

// ── 读一台单元的形 ──────────────────────────────────────────────────────────────

export function bandAngle(j: number): number {
  return squareAngle(j, UF.COUNT);
}

export interface UnitReading {
  /** 成形的带 / 收着的带 */
  formed: number;
  stowed: number;
  /** 外缘离芯轴最远 / 最近（m，成形的带里） */
  rMax: number;
  rMin: number;
  /** 最外一圈连线围出的面积（m²，收着的带按芯半径算） */
  area: number;
  /** 台面高度层数（按 5 cm 归并） */
  levels: number;
  /** 台面最高 / 最低离钉住端（m） */
  topMax: number;
  topMin: number;
  /** 同一层相邻两条带台面高差的最大值（m），与按外缘弧长算的坡度（°） */
  stepMax: number;
  slopeMax: number;
  /** 相邻两条带同一块台的剖面形差最大（m，按沿布等分的 24 个点对齐比） */
  shapeDiff: number;
  /** 拉着膜、且形差超过 0.10 m 的接缝数（膜要裁成异形或拉得很开） */
  skinStrained: number;
  /** 拉膜的接缝数 */
  skinJoins: number;
  /** 转几下与自己重合（20 的约数；1 = 不重合） */
  rotOrder: number;
  /** 有没有镜像对称 */
  mirror: boolean;
  /** 一条带铺出去多少节、芯从钉住端到上夹环多少米 */
  band: number;
  coreM: number;
  /** 键锁 / 键总数、最大自交环 */
  locked: number;
  bonds: number;
  knot: number;
}

/** 剖面沿布等分取 m 个点 */
export function resample(pts: readonly [number, number][], m: number): [number, number][] {
  const L: number[] = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1] || 1;
  const out: [number, number][] = [];
  let i = 0;
  for (let q = 0; q < m; q++) {
    const s = (q / (m - 1)) * total;
    while (i < L.length - 2 && L[i + 1] < s) i++;
    const t = L[i + 1] > L[i] ? (s - L[i]) / (L[i + 1] - L[i]) : 0;
    out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
  }
  return out;
}

/** 相邻两条带拉不拉膜：两条都成形、都开着膜、同一块台都有 */
export function skinJoins(form: UnitForm, j: number): boolean[] {
  const a = form.bands[j];
  const b = form.bands[(j + 1) % UF.COUNT];
  if (form.skin === false || !a || !b || form.cuts?.includes(j)) return [];
  return Array.from({ length: Math.min(a.secs.length, b.secs.length) }, () => true);
}

/** 带子程序转 s 格后与自己相同吗（形的旋转对称） */
function sameRot(form: UnitForm, s: number): boolean {
  const key = (b: BandSlot) => (b ? JSON.stringify(b) : 'stow');
  for (let j = 0; j < UF.COUNT; j++) if (key(form.bands[j]) !== key(form.bands[(j + s) % UF.COUNT])) return false;
  return true;
}
function hasMirror(form: UnitForm): boolean {
  const key = (b: BandSlot) => (b ? JSON.stringify(b) : 'stow');
  // 二十条带的方位关于某条轴镜像：j ↔ c − 1 − j（相位为半格，轴落在带之间或带上都在这 20 种里）
  for (let c = 0; c < UF.COUNT; c++) {
    let ok = true;
    for (let j = 0; j < UF.COUNT && ok; j++) if (key(form.bands[j]) !== key(form.bands[(((c - 1 - j) % UF.COUNT) + UF.COUNT) % UF.COUNT])) ok = false;
    if (ok) return true;
  }
  return false;
}

export function readUnit(form: UnitForm, shapes: readonly (BandShape | null)[], layout: UnitLayout = unitLayout(form)): UnitReading {
  const M = UF.MPP;
  const n = UF.COUNT;
  let rMax = 0;
  let rMin = Infinity;
  const tops: number[] = [];
  let stepMax = 0;
  let slopeMax = 0;
  let shapeDiff = 0;
  let skinStrained = 0;
  let joins = 0;
  let locked = 0;
  let bonds = 0;
  let knot = 0;
  const outer: [number, number][] = [];
  for (let j = 0; j < n; j++) {
    const s = shapes[j];
    const th = bandAngle(j);
    let r: number = UF.R0;
    if (s) {
      locked += s.locked;
      bonds += s.bonds;
      knot = Math.max(knot, s.knot);
      for (const st of s.structs) {
        r = Math.max(r, UF.R0 + st.reach);
        tops.push(st.top * M);
      }
      const rr = r * M;
      rMax = Math.max(rMax, rr);
      rMin = Math.min(rMin, rr);
    }
    outer.push([r * M * Math.cos(th), r * M * Math.sin(th)]);
    // 相邻
    const t = shapes[(j + 1) % n];
    if (s && t) {
      const m = Math.min(s.structs.length, t.structs.length);
      const joinsHere = skinJoins(form, j);
      for (let q = 0; q < m; q++) {
        const dh = Math.abs(s.structs[q].top - t.structs[q].top) * M;
        stepMax = Math.max(stepMax, dh);
        const arc = ((UF.R0 + Math.min(s.structs[q].reach, t.structs[q].reach)) * M * 2 * Math.PI) / n;
        slopeMax = Math.max(slopeMax, (Math.atan2(dh, arc) * 180) / Math.PI);
        const A = resample(s.structs[q].pts, 24);
        const B = resample(t.structs[q].pts, 24);
        // 形差只比形：先把两块台的台面对齐到同一高度（高差另算在 stepMax 里）
        const off = t.structs[q].top - s.structs[q].top;
        let d = 0;
        for (let i = 0; i < 24; i++) d = Math.max(d, Math.hypot(A[i][0] - B[i][0], A[i][1] + off - B[i][1]));
        d *= M;
        shapeDiff = Math.max(shapeDiff, d);
        if (joinsHere[q]) {
          joins++;
          if (d > 0.1) skinStrained++;
        }
      }
    }
  }
  let area = 0;
  for (let j = 0; j < n; j++) {
    const [x1, y1] = outer[j];
    const [x2, y2] = outer[(j + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  const lv = new Set(tops.map((t) => Math.round(t / 0.05)));
  let rotOrder = 1;
  for (let s = 1; s < n; s++) if (n % s === 0 && sameRot(form, s)) { rotOrder = n / s; break; }
  const formed = form.bands.filter(Boolean).length;
  return {
    formed,
    stowed: n - formed,
    rMax,
    rMin: Number.isFinite(rMin) ? rMin : 0,
    area: Math.abs(area) / 2,
    levels: lv.size,
    topMax: tops.length ? Math.max(...tops) : 0,
    topMin: tops.length ? Math.min(...tops) : 0,
    stepMax,
    slopeMax,
    shapeDiff,
    skinStrained,
    skinJoins: joins,
    rotOrder,
    mirror: hasMirror(form),
    band: layout.B,
    coreM: (UF.GLUE_PX * layout.G + SKIN.SEG * 100 * SKIN.R1 * Math.max(0, layout.F - 1)) * M,
    locked,
    bonds,
    knot,
  };
}
