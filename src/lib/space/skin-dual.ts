/**
 * 项目二 · 双结构带（一条带上出现两个折叠结构）——纯数据，零 DOM。
 *
 * 用户 2026-08-26 草图立项：左 = 现有单结构带，右 = 「条可以出现两个结构的」。
 *
 * ## 内核零改
 *
 * SkinSpec 本就是通用分段列表（v7 的四个单元只是恰好都只有一个自由段）：
 * buildUnit 对每个带键谱的自由段各建一条独立拉链，advance 里锁定/层直化/
 * 吸引全部按链循环。双结构 = **五段谱**
 *   [贴合 lead | 自由 f₁(键谱A) | 贴合 mid | 自由 f₂(键谱B) | 贴合 tail]
 * ——不是交接件暂缓的 tunnel 形态（那个要「皮-芯键新键型」，这里没有任何新键型）。
 *
 * ## 解耦的构造前提（两个下限，实测钉准）
 *
 * 中间贴合段每迭代两次钉回芯上，两个结构之间只隔着被钉死的材料。
 * - **mid ≥ 16（合法下限）**：全局约束里跨距最大的是 16（span-16 抗弯），
 *   不短于它就没有任何一条约束同时抓住两个自由段的节点。锁定键集合与单结构
 *   逐位相同；但一个迭代**内**的瞬时位移仍会经贴合段传导（钉回发生在迭代末），
 *   实测形态偏差 mid=16 时 0.40px（折叠体）/ 0.86px（贴轴缓冲）——肉眼不可见。
 * - **mid ≥ 29（逐位解耦）**：一个迭代内扰动经贴合段的最大传导距离 =
 *   16（span-16 的读窗）+ 13（前序 stretch/bend4/bend8 的累计写入 1+4+8）= 29 节；
 *   贴合段不短于它时「把另一个结构拿掉」的对照带与双结构带**逐位相同**
 *   （实测 mid=28 偏差 7e-2px、mid=29 起精确 0.000——守门卡的就是这一位）。
 *
 * ## 单收缩自由度
 *
 * 交接件语义是「每单元一个收缩自由度 ℓ」——双结构带仍是**一个单元**，两个结构
 * 同步收缩。r₁ 与 boxSquare 都是单元级选项，两个结构必须同值：袋（r₁=0.66）
 * 不能与全深形态混排，阶梯方箱（boxSquare 作用于全部链）不能与非方箱形态混排
 * ——buildDualBand 对不合法的搭配直接抛错，而不是悄悄用其中一边的值。
 */
import { placeOnBand } from './skin-array';
import { SKIN_UNITS, skinSiteOpts, type SkinUnitDef } from './skin-data';
import { SKIN, type SkinSeg, type SkinSpec, type SkinUnitOpts } from './skin-unit';

/** 每个结构自己的自由段长（= Lab.08 对位构造的 ARRAY_FREE，四种目录形态都放得下且缓冲 ≥4） */
export const DUAL_FREE = 61;
/** 扇形对位中心（正居中 ⇒ 上下缓冲等长，对位构造的 φ=1/2 对每个结构各自成立） */
export const DUAL_CENTER = (DUAL_FREE - 1) / 2;
/** 默认三段贴合：顶 / 中 / 尾。mid 默认取合法下限 16 = 线稿里最贴草图的紧凑间距 */
export const DUAL_LEAD = 24;
export const DUAL_MID = 16;
export const DUAL_TAIL = 24;
/** 合法下限：全局约束最大跨距 = 16（advance 里的 span-16 抗弯），无一条约束跨两段 */
export const DUAL_MID_MIN = 16;
/** 逐位解耦下限：迭代内扰动最大传导 16 + (1+4+8) = 29 节（推导见文件头，实测钉准） */
export const DUAL_MID_EXACT = 29;
/** 台架的间距三档（mid 是待拍板的手感量——照转速滑块的先例做成控件，不替用户定死）：
 *  紧凑 16 = 草图 · 29 = 逐位解耦下限 · 48 = 拉开读 */
export const DUAL_MID_OPTIONS = [DUAL_MID_MIN, DUAL_MID_EXACT, 48] as const;

export interface DualDims {
  lead?: number;
  mid?: number;
  tail?: number;
  free?: number;
}

/** 五段谱：两段既有键谱各搬到自己的自由段正中（形态逐位不动，placeOnBand 同一份） */
export function buildDualSpec(segA: SkinSeg, segB: SkinSeg, dims: DualDims = {}): SkinSpec {
  const lead = dims.lead ?? DUAL_LEAD;
  const mid = dims.mid ?? DUAL_MID;
  const tail = dims.tail ?? DUAL_TAIL;
  const free = dims.free ?? DUAL_FREE;
  const center = (free - 1) / 2;
  return [
    ['g', lead],
    placeOnBand(segA, free, center),
    ['g', mid],
    placeOnBand(segB, free, center),
    ['g', tail],
  ];
}

export interface DualBandDef {
  key: string;
  zh: string;
  en: string;
  spec: SkinSpec;
  opts: SkinUnitOpts;
  smooth: readonly [number, number];
}

const byKey = (k: string): SkinUnitDef => {
  const d = SKIN_UNITS.find((u) => u.key === k);
  if (!d) throw new Error(`未知形态 ${k}`);
  return d;
};

/**
 * 目录形态两两成带。keyB 省略 = 同形双结构（草图右侧那种）。
 * A 在上（靠注册前端）、B 在下（靠钉住端）。
 */
export function buildDualBand(keyA: string, keyB: string = keyA, dims?: DualDims): DualBandDef {
  const A = byKey(keyA);
  const B = byKey(keyB);
  // 单元级选项必须同值（单收缩自由度；boxSquare 作用于全部链）——不合法的搭配抛错
  if ((A.r1 ?? SKIN.R1) !== (B.r1 ?? SKIN.R1))
    throw new Error(`双结构带是一个单元、一个收缩自由度：${keyA}(r₁=${A.r1 ?? SKIN.R1}) 与 ${keyB}(r₁=${B.r1 ?? SKIN.R1}) 不能混排`);
  if (!!A.boxSquare !== !!B.boxSquare)
    throw new Error(`boxSquare 是单元级整形（作用于全部链）：${keyA} 与 ${keyB} 不能混排`);
  const sa = A.smooth ?? [3, 1];
  const sb = B.smooth ?? [3, 1];
  return {
    key: keyA === keyB ? `dual-${keyA}` : `dual-${keyA}-${keyB}`,
    zh: keyA === keyB ? `双${A.zh}` : `${A.zh}＋${B.zh}`,
    en: keyA === keyB ? `double ${A.en}` : `${A.en} + ${B.en}`,
    spec: buildDualSpec(A.spec[1], B.spec[1], dims),
    opts: skinSiteOpts(A),
    smooth: [Math.max(sa[0], sb[0]), Math.max(sa[1], sb[1])] as const,
  };
}

/**
 * Lab.11 台架的五条带：四种同形对（目录序，草图右侧那种）+ 一条混排
 * （蘑菇＋直挑台——两条拉链各自独立的直接演示）。五条各自独立引擎。
 */
export function buildDualDisplay(dims?: DualDims): DualBandDef[] {
  return [
    buildDualBand('pocket', 'pocket', dims),
    buildDualBand('bulb', 'bulb', dims),
    buildDualBand('ledge', 'ledge', dims),
    buildDualBand('stepped', 'stepped', dims),
    buildDualBand('bulb', 'ledge', dims),
  ];
}

/**
 * 解耦对照带：与双结构带同一条带（同长、同贴合分段、同收缩），只把其中一个
 * 结构的键谱拿掉（那个自由段留着、键清空）。守门用它证明「另一个结构在不在，
 * 这个结构的形态与锁定键逐位不变」。
 */
export function buildDualControl(
  keyA: string,
  keyB: string,
  drop: 'A' | 'B',
  dims?: DualDims,
): DualBandDef {
  const band = buildDualBand(keyA, keyB, dims);
  const free = dims?.free ?? DUAL_FREE;
  const empty: SkinSeg = ['f', free, []];
  const spec = band.spec.map((s, i) =>
    (drop === 'A' && i === 1) || (drop === 'B' && i === 3) ? empty : s,
  ) as unknown as SkinSpec;
  return { ...band, key: `${band.key}-ctrl-${drop}`, spec };
}
