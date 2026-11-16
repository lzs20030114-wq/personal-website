/**
 * 一台单元的形态目录（2026-11-16，项目二_单元形态研究.md §4）。每一种 = 二十条带各编一段程序（unit-forms 的 BandSlot）。
 * 线稿 = scripts/unit-forms/atlas.mjs：每条带的剖面由站上引擎现跑，读数由 unit-forms.readUnit 现算。
 * 名字只用平白的描述或通行的几何 / 建筑叫法，不另起名。
 */
import { SKIN } from './skin-unit';
import { UF, UF_DEPTH, UF_NODE_M, bandAngle, kForRadius, sectionSeg, type BandProgram, type BandSlot, type PlateH, type Section, type UnitForm } from './unit-forms';

const N = UF.COUNT;
/** 线稿的机位（俯角与方位，弧度）——画图脚本与有朝向的形用同一个数，伸出的方向读得清 */
export const UF_VIEW = { az: (35 * Math.PI) / 180, el: (28 * Math.PI) / 180 } as const;
/**
 * 有朝向的形（舌、缺口、斜面的低处）朝哪：+X，在画面右前方，长度不被透视压短。
 * 取 0° 是因为它正落在两条带之间（带在 9° + 18°j），关于它左右镜像的带两两成对，有朝向的形才真是镜像对称。
 */
export const FRONT = 0;

export const UF_GROUPS = ['轮廓', '缺口', '高低', '剖面', '组合'] as const;

// ── 小工具 ──────────────────────────────────────────────────────────────────────
const TH = (j: number) => bandAngle(j);
/** 两个角之差，折到 (−π, π] */
const dA = (a: number, b: number) => {
  let d = (a - b) % (2 * Math.PI);
  if (d <= -Math.PI) d += 2 * Math.PI;
  if (d > Math.PI) d -= 2 * Math.PI;
  return d;
};
const nodes = (m: number) => Math.round(m / UF_NODE_M);
const plate = (k: number, h: PlateH = 16): Section => ({ kind: 'plate', k, h });
/** 一条带想要什么：程序（尾先按下限）+ 抬高多少 m（相对这台台面齐平时的位置） */
type Want = { prog: BandProgram; lift: number } | null;
/** 一块台：k、抬高 lift（m）、厚度 */
const one = (k: number, lift = 0, h: PlateH = 16): Want => ({ prog: { secs: [plate(k, h)], gaps: [UF.TAIL_MIN] }, lift });
/** 几块台叠在一条带上：ks 由下往上，mids = 相邻两块之间贴芯几节 */
const stack = (ks: readonly number[], mids: readonly number[], lift = 0, h: PlateH = 16): Want => ({
  prog: { secs: ks.map((k) => plate(k, h)), gaps: [UF.TAIL_MIN, ...mids] },
  lift,
});
const cat = (key: 'bulb' | 'ledge' | 'stepped' | 'pocket'): Want => ({ prog: { secs: [{ kind: 'cat', key }], gaps: [UF.TAIL_MIN] }, lift: 0 });

/** 这块台尾取下限时台面离钉住端（px，深度表第二列）；目录形不在表里 */
const top5 = (s: Section): number | null => (s.kind === 'plate' ? UF_DEPTH[s.h].rows[s.k - UF_DEPTH[s.h].klo][1] : null);
/**
 * 估一条带上每块台的台面离钉住端（px）：第一块 = 查表 + 尾多出来的节 × 2；往上每块 = 下一块结构段收缩后的长（每节 0.6 px）
 * + 中间贴芯 × 2 + 查表。量过三块 k22：估 34 / 128 / 222，引擎 34 / 129.8 / 224.4，差 2 px 以内（8 mm），够拿来找平。
 */
export function estTops(b: BandProgram): (number | null)[] {
  const out: (number | null)[] = [];
  let base = b.gaps[0] * UF.GLUE_PX;
  b.secs.forEach((s, q) => {
    if (q > 0) base += b.gaps[q] * UF.GLUE_PX;
    const t5 = top5(s);
    out.push(t5 === null ? null : base + t5 - UF.TAIL_MIN * UF.GLUE_PX);
    base += SKIN.R1 * UF.GLUE_PX * (sectionSeg(s)[1] - 1);
  });
  return out;
}
/**
 * 一台单元的二十条带：先把每一层台找平（深的台贴底时台面高，浅的低——全都按尾取下限会高低不齐，2-15 三档也是这么补的），
 * 再按各自的 lift 沿芯抬。找平只往上补：第一块补尾，往上每块补它下面那段贴芯。
 */
const bands = (f: (j: number, th: number) => Want, level = true): BandSlot[] => {
  const wants = Array.from({ length: N }, (_, j) => f(j, TH(j)));
  const progs = wants.map((w) => (w ? { secs: w.prog.secs, gaps: [...w.prog.gaps] } : null));
  if (level) {
    const levels = Math.max(0, ...progs.map((p) => (p ? p.secs.length : 0)));
    for (let q = 0; q < levels; q++) {
      const est = progs.map((p) => (p && q < p.secs.length ? estTops(p)[q] : null));
      const T = Math.max(...est.filter((v): v is number => v !== null));
      progs.forEach((p, j) => {
        const e = est[j];
        if (p && e !== null) p.gaps[q] += Math.round((T - e) / UF.GLUE_PX);
      });
    }
  }
  return progs.map((p, j) => (p ? { secs: p.secs, gaps: [p.gaps[0] + nodes(wants[j]!.lift), ...p.gaps.slice(1)] } : null));
};
const R = (r: number, h: PlateH = 16) => kForRadius(r, h);
/** 离某方向最近的那条带 */
const nearest = (ang: number) => {
  let best = 0;
  for (let j = 1; j < N; j++) if (Math.abs(dA(TH(j), ang)) < Math.abs(dA(TH(best), ang))) best = j;
  return best;
};
/** 以 FRONT 为起点按方位角走一圈的进度 0..1（螺旋用） */
const turn = (th: number) => (((th - FRONT) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI);
/** 螺旋转回起点的那一道接缝：这条带的进度比下一条大（跨过 FRONT） */
const WRAP: readonly number[] = Array.from({ length: N }, (_, j) => j).filter((j) => turn(TH(j)) > turn(TH((j + 1) % N)));
/** 这种高低有没有「转回起点」那一道（要断开膜） */
const WRAPS = new Set(['helix', 'terrace']);

// ── 平面轮廓：离芯轴的半径（m）随方位角怎么变 ───────────────────────────────────
export const OUTLINE: Record<string, { zh: string; r: (th: number) => number }> = {
  circle: { zh: '圆', r: () => 0.45 },
  square: { zh: '方', r: (th) => 0.4 / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th))) },
  rect: {
    zh: '长方 2:1',
    r: (th) => {
      const a = 0.52, b = 0.26;
      const c = Math.abs(Math.cos(th - FRONT)), s = Math.abs(Math.sin(th - FRONT));
      return Math.min(c > 1e-9 ? a / c : Infinity, s > 1e-9 ? b / s : Infinity);
    },
  },
  triangle: { zh: '三角', r: (th) => polygon(th, 3, 0.29) },
  hexagon: { zh: '六边', r: (th) => polygon(th, 6, 0.46) },
  star: { zh: '五角星', r: (th) => [0.6, 0.4, 0.26, 0.4][((nearest(th) % 4) + 4) % 4] },
  clover: { zh: '四瓣', r: (th) => 0.42 + 0.17 * Math.cos(4 * (th - FRONT)) },
  eccentric: {
    zh: '偏心圆',
    r: (th) => {
      const d = 0.16, Rr = 0.42, x = dA(th, FRONT);
      return d * Math.cos(x) + Math.sqrt(Rr * Rr - d * d * Math.sin(x) ** 2);
    },
  },
  tongue: { zh: '一侧伸出一条舌', r: (th) => 0.3 + 0.3 * bump(th, [0]) },
  bowtie: { zh: '两侧伸出', r: (th) => 0.28 + 0.32 * bump(th, [0, Math.PI]) },
  cross: { zh: '十字', r: (th) => 0.27 + 0.33 * bump(th, [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) },
  spiralPlan: { zh: '平面螺线', r: (th) => 0.25 + 0.35 * turn(th) },
  gear: { zh: '齿', r: (th) => (nearest(th) % 2 === 0 ? 0.56 : 0.34) },
};

/** 朝 FRONT + 这几个角各伸出一条舌（高斯形，宽约 ±18°） */
function bump(th: number, at: readonly number[]): number {
  return Math.max(...at.map((a) => Math.exp(-((dA(th, FRONT + a) / 0.32) ** 2))));
}

/** 正 n 边形（内切圆半径 rin，一条边的法线朝 FRONT）在方位角 th 处的半径 */
function polygon(th: number, n: number, rin: number): number {
  const seg = (2 * Math.PI) / n;
  const x = (((dA(th, FRONT) % seg) + seg) % seg) - seg / 2;
  return rin / Math.cos(x);
}

// ── 台面高低：每条带的台抬高多少（m）随方位角怎么变 ─────────────────────────────
export const HEIGHT: Record<string, { zh: string; lift: (th: number, j: number) => number }> = {
  flat: { zh: '平', lift: () => 0 },
  tilt: { zh: '斜面', lift: (th) => 0.2 * (1 - Math.cos(dA(th, FRONT))) },
  saddle: { zh: '马鞍面', lift: (th) => 0.15 * (1 - Math.cos(2 * dA(th, FRONT))) },
  wave3: { zh: '三起三伏', lift: (th) => 0.12 * (1 - Math.cos(3 * dA(th, FRONT))) },
  helix: { zh: '螺旋', lift: (th) => 0.8 * turn(th) },
  terrace: { zh: '四级台阶', lift: (th) => 0.15 * Math.floor(turn(th) * 4) },
  dip: { zh: '一段沉下', lift: (th) => (Math.abs(dA(th, FRONT)) < 0.6 ? 0 : 0.3) },
};

/** 轮廓 × 高低：一层 6.6 cm 台 */
function outlineForm(o: string, hgt: string): BandSlot[] {
  return bands((j, th) => one(R(OUTLINE[o].r(th)), HEIGHT[hgt].lift(th, j)));
}

// ── 取舍：哪几条带成形 ──────────────────────────────────────────────────────────
export const SELECT: Record<string, { zh: string; on: (th: number, j: number) => boolean; skin?: boolean }> = {
  all: { zh: '全部', on: () => true },
  cgap: { zh: '缺两条', on: (th) => Math.abs(dA(th, FRONT)) > 0.3 },
  half: { zh: '半圈', on: (th) => Math.abs(dA(th, FRONT + Math.PI)) <= Math.PI / 2 },
  alt: { zh: '隔一条', on: (_, j) => j % 2 === 0, skin: false },
};

/** 剖面：一条带上放什么（形各条相同，半径约 0.45 m） */
export const SECTION: Record<string, { zh: string; band: () => Want }> = {
  thin: { zh: '6.6 cm 台', band: () => one(R(0.45)) },
  thick15: { zh: '15 cm 厚台', band: () => one(R(0.45, 36), 0, 36) },
  two: { zh: '两块', band: () => stack([R(0.4), R(0.4)], [40]) },
  three: { zh: '三块', band: () => stack([22, 22, 22], [29, 29]) },
  bulb: { zh: '蘑菇挑台', band: () => cat('bulb') },
};

function selectForm(sec: string, sel: string): { bands: BandSlot[]; skin?: boolean } {
  return { bands: bands((j, th) => (SELECT[sel].on(th, j) ? SECTION[sec].band() : null)), skin: SELECT[sel].skin };
}


// ── 目录 ────────────────────────────────────────────────────────────────────────
export const UNIT_FORMS: UnitForm[] = [
  // 轮廓
  ...Object.entries(OUTLINE).map(([k, o]) => ({
    key: `outline-${k}`,
    zh: o.zh,
    group: '轮廓',
    how: '一层 6.6 cm 台，每条带按方位取不同深度',
    bands: outlineForm(k, 'flat'),
  })),
  // 缺口
  { key: 'gap-c', zh: 'C 形', group: '缺口', how: '圆台，前面两条带收着，留一个口', bands: selectForm('thin', 'cgap').bands },
  { key: 'gap-half', zh: '半圈', group: '缺口', how: '只成背后十条带，前半圈收着', bands: selectForm('thin', 'half').bands },
  { key: 'gap-fan', zh: '120° 扇', group: '缺口', how: '只成背后六条带', bands: bands((_, th) => (Math.abs(dA(th, FRONT + Math.PI)) <= Math.PI / 3 ? one(R(0.55)) : null)) },
  { key: 'gap-fins', zh: '隔一条（鳍）', group: '缺口', how: '隔一条成一条、深台，不拉膜：十片放射的鳍', bands: bands((j) => (j % 2 === 0 ? one(R(0.58)) : null)), skin: false },
  {
    key: 'gap-two', zh: '两个缺口', group: '缺口', how: '前后各收两条，台分成左右两片',
    bands: bands((_, th) => (Math.abs(dA(th, FRONT)) < 0.35 || Math.abs(dA(th, FRONT + Math.PI)) < 0.35 ? null : one(R(0.45)))),
  },
  // 高低
  ...['tilt', 'saddle', 'wave3', 'helix', 'terrace', 'dip'].map((h) => ({
    key: `height-${h}`,
    zh: HEIGHT[h].zh,
    group: '高低',
    how: h === 'helix' ? '圆台，每条带比前一条高 4 cm，一圈升 0.8 m，转回起点那道不拉膜' : '圆台，每条带的台沿芯上下挪（每节 8 mm，纯平移）',
    bands: outlineForm('circle', h),
    cuts: WRAPS.has(h) ? WRAP : undefined,
  })),
  // 剖面
  { key: 'sec-thick15', zh: '15 cm 厚台', group: '剖面', how: '台厚 36 px，k 取 0.45 m 那档', bands: bands(() => one(R(0.45, 36), 0, 36)) },
  { key: 'sec-thick23', zh: '23 cm 厚台', group: '剖面', how: '台厚 56 px（最薄要 k 46 才折得起来）', bands: bands(() => one(R(0.5, 56), 0, 56)) },
  { key: 'sec-bulb', zh: '蘑菇挑台一圈', group: '剖面', how: '2-1 的蘑菇挑台键谱，二十条一样', bands: bands(() => cat('bulb')) },
  { key: 'sec-ledge', zh: '直挑台一圈', group: '剖面', how: '2-1 的直挑台键谱', bands: bands(() => cat('ledge')) },
  { key: 'sec-stepped', zh: '阶梯挑台一圈', group: '剖面', how: '2-1 的阶梯挑台（方箱）键谱', bands: bands(() => cat('stepped')) },
  { key: 'sec-pocket', zh: '袋一圈', group: '剖面', how: '2-1 的袋，收到 0.66 就停，只能整台都是袋', bands: bands(() => cat('pocket')) },
  { key: 'sec-two', zh: '两块', group: '剖面', how: '一条带上两块台，中间贴芯 40 节', bands: bands(() => stack([R(0.4), R(0.4)], [40])) },
  { key: 'sec-three', zh: '三块', group: '剖面', how: '三块 k 22，中间各贴芯 29 节（逐位互不影响的下限）', bands: bands(() => stack([22, 22, 22], [29, 29])) },
  { key: 'sec-four', zh: '四块', group: '剖面', how: '四块 k 16（再深就排不下）', bands: bands(() => stack([16, 16, 16, 16], [29, 29, 29])) },
  { key: 'sec-pagoda', zh: '上小下大三块', group: '剖面', how: '由下往上 k 36 / 26 / 16', bands: bands(() => stack([36, 26, 16], [29, 29])) },
  { key: 'sec-inverted', zh: '上大下小三块', group: '剖面', how: '由下往上 k 16 / 26 / 36', bands: bands(() => stack([16, 26, 36], [29, 29])) },
  { key: 'sec-far', zh: '两块隔开', group: '剖面', how: '两块 k 29，中间贴芯 120 节', bands: bands(() => stack([29, 29], [120])) },
  // 组合
  {
    key: 'mix-shelter', zh: '半圈有顶', group: '组合', how: '背后半圈两块、前半圈只成下面一块（2-15 坐着的人旁边那台）',
    bands: bands((_, th) => (Math.abs(dA(th, FRONT + Math.PI)) <= Math.PI / 2 ? stack([R(0.42), R(0.42)], [40]) : one(R(0.42)))),
  },
  {
    key: 'mix-alt', zh: '上下交错', group: '组合', how: '单数带台在低处、双数带抬高 0.45 m，不拉膜',
    bands: bands((j) => one(R(0.5), j % 2 ? 0.45 : 0)), skin: false,
  },
  {
    key: 'mix-helix-fins', zh: '鳍螺旋', group: '组合', how: '螺旋那一台不拉膜：二十片鳍绕芯一圈升 1.2 m',
    bands: bands((_, th) => one(R(0.5), 1.2 * turn(th))), skin: false,
  },
  {
    key: 'mix-double-helix', zh: '双螺旋', group: '组合', how: '单数带一条螺旋、双数带错开半圈另一条，各升 1.0 m，不拉膜',
    bands: bands((j, th) => one(R(0.5), 1.0 * ((turn(th) + (j % 2) * 0.5) % 1))), skin: false,
  },
  {
    key: 'mix-slide', zh: '舌形斜坡', group: '组合', how: '一侧伸出的舌，越往舌尖越低',
    bands: bands((_, th) => one(R(OUTLINE.tongue.r(th)), 0.35 * (1 - Math.exp(-((dA(th, FRONT) / 0.6) ** 2))))),
  },
  {
    key: 'mix-star-helix', zh: '五角星螺旋', group: '组合', how: '五角星的轮廓沿芯升一圈 0.6 m',
    bands: bands((_, th) => one(R(OUTLINE.star.r(th)), 0.6 * turn(th))),
    cuts: WRAP,
  },
  {
    key: 'mix-square-circle', zh: '下方上圆', group: '组合', how: '下面一块方、上面一块小圆，中间贴芯 45 节',
    bands: bands((_, th) => stack([R(OUTLINE.square.r(th)), R(0.3)], [45])),
  },
  {
    key: 'mix-crenel', zh: '厚薄交替', group: '组合', how: '6.6 cm 与 15 cm 台一条隔一条，台底对齐（厚的往上凸）',
    bands: (() => {
      // 两种厚度贴底时台底离钉住端不一样高（UF_DEPTH 第三列），差多少就把低的那块沿芯抬多少（不按台面找平）
      const kt = R(0.45), kT = R(0.45, 36);
      const d = (UF_DEPTH[36].rows[kT - UF_DEPTH[36].klo][2] - UF_DEPTH[16].rows[kt - UF_DEPTH[16].klo][2]) * UF.MPP;
      return bands((j) => (j % 2 ? one(kt, Math.max(0, d)) : one(kT, Math.max(0, -d), 36)), false);
    })(),
  },
  {
    key: 'mix-nook', zh: '龛', group: '组合', how: 'C 形的下台，背后九条带再加一块顶（中间贴芯 50 节）',
    bands: bands((_, th) => {
      if (Math.abs(dA(th, FRONT)) <= 0.5) return null;
      return Math.abs(dA(th, FRONT + Math.PI)) <= 1.3 ? stack([R(0.48), R(0.4)], [50]) : one(R(0.48));
    }),
  },
  {
    key: 'mix-tilted-square', zh: '斜的方台', group: '组合', how: '方的轮廓加斜面',
    bands: bands((_, th) => one(R(OUTLINE.square.r(th)), HEIGHT.tilt.lift(th, 0))),
  },
];


/** 轮廓 × 高低 的组合格（一层 6.6 cm 台） */
export const MATRIX_OUTLINE_HEIGHT = {
  rows: ['circle', 'square', 'triangle', 'star', 'eccentric'],
  cols: ['flat', 'tilt', 'saddle', 'wave3', 'helix'],
  form: (o: string, h: string): UnitForm => ({ key: `m1-${o}-${h}`, zh: `${OUTLINE[o].zh} · ${HEIGHT[h].zh}`, group: '组合格', how: '', bands: outlineForm(o, h), cuts: WRAPS.has(h) ? WRAP : undefined }),
};
/** 剖面 × 取舍 的组合格 */
export const MATRIX_SECTION_SELECT = {
  rows: ['thin', 'thick15', 'two', 'three', 'bulb'],
  cols: ['all', 'cgap', 'half', 'alt'],
  form: (s: string, c: string): UnitForm => {
    const f = selectForm(s, c);
    return { key: `m2-${s}-${c}`, zh: `${SECTION[s].zh} · ${SELECT[c].zh}`, group: '组合格', how: '', bands: f.bands, skin: f.skin };
  },
};
