/**
 * 项目二 · 圆筒环列（Lab.09 的编制）——纯数据 + 纯几何，零 DOM。
 *
 * 用户 2026-08-23 立项：「把每一个单元再收窄 0.5 倍，然后把表皮向外偏移一点
 * 然后复制 20 个围成一圈，形成一个圆筒，这个圆筒收缩就可以形成一个环形平台。」
 * 拍板：接受带间的缝 · 半径做成滑块 · 天花改成圆环板、底下不加东西 ·
 * **一个环里二十条带用同一种键谱**（用户当轮纠偏：「我要选用一种形状形成一个
 * 连续的环形平台」——首版四种键谱轮流排开，一圈里四种形态混着，平台不连续）。
 * 四种键谱改为**选一种**：控制条上切，切换即整环重解。
 *
 * ## 这台在做什么
 *
 * 引擎一行没动：仍是 Lab.06 那套 2D 剖面模拟。变的只有**剖面往哪儿摆**——
 * 从「沿 X 排成一列」改成「绕一根竖轴排成一圈」：剖面的离轴 x 变成离筒轴的
 * 半径，挤出方向变成切向（几何见 skin-solid 的 RingPlace）。于是
 * 收缩前 20 条窄带贴着轴垂下来 ≈ 一个闭合的筒；收缩后每条各自扣出挑台，
 * 20 个挑台连成绕筒一圈的环形平台。
 *
 * 意外地，这个排布比「房间剖面里一排带子」更贴近引擎的原假设：v7 的
 * PRESS = 3.0 那一项，原注就是「3D 皮环向刚度的 2D 等效外撑」——皮本来
 * 就是绕轴一圈的。
 *
 * ## 三件要说清楚的
 *
 * 1. **只解一次，画二十份。** 一圈同一种键谱、引擎无随机、同谱同初值 ⇒
 *    20 次解算逐位相同。故解一条摆二十处（台架的 order 编制），
 *    物理开销是单条带——比 Lab.06 那一排四台还轻。
 * 2. **缝是几何必然。** 带宽恒定而圆周随半径长：芯上刚好排满时，到平台外缘
 *    每格的圆周节距已经涨到 (R+挑出)/R 倍，多出来的就是缝。用户已拍板接受
 *    （ringGap 给出任意半径处的净缝，守门用它卡住「不自穿」的半径下限）。
 * 3. **换形态 = 换整环。** 四种键谱的收缩终点与材料量各不相同（袋的 r₁=0.66 是
 *    用户 2026-08-18 拍板的，比另外三种浅 ⇒ 那一环整体更高、挑得更浅）。
 *    一圈只用一种，这些差别体现在「这一环长什么样」上，不再体现在环内部。
 *
 * ## 对位
 *
 * 四种键谱的原生带长各不相同（150/170/166/166 节）。一圈只用一种、环内不会参差，
 * 但四种之间仍要可比——切换形态时筒的上下缘、平台高度不该整体跳一截。
 * 故四条一律搬到 Lab.08 那副对位构造上（三段等长 LEAD/FREE/TAIL + 扇形正居中
 * ⇒ 嘴心 = 2·lead + (f−1)·r，与键长、与形态无关），形态逐位不动、只换它在带上
 * 的位置与两端缓冲长度。实测同一收缩终点的三种形态嘴心散布 0.078px。
 */
import { ARRAY_FREE, ARRAY_LEAD, ARRAY_TAIL, placeOnBand } from './skin-array';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import type { SkinSpec, SkinUnitOpts } from './skin-unit';

export const RING = {
  /** 圈上的单元数（用户拍板 20） */
  COUNT: 20,
  /** 带深 = Lab.08 窄带 15.6 的 0.5 倍（用户「再收窄 0.5 倍」） */
  DEPTH: 7.8,
  /** 织物厚度：Lab.07 的 5 在 7.8 宽的带子上截面近正方形（看着像方棍），收到 3 */
  THICK: 3,
  /** 半径滑块量程。下限 = 相邻带在芯上刚好不互穿（见 ringGap）后再留一点余量 */
  RADIUS_MIN: 26,
  RADIUS_MAX: 90,
  RADIUS_DEF: 30,
} as const;

/** 圈上第 i 位的方位角（0 = 指向 +X，正向 = 绕世界 Y） */
export function ringAngle(i: number, count: number = RING.COUNT): number {
  return (i / count) * Math.PI * 2;
}

/** 半径 ρ 处相邻两带中线的圆周节距 */
export function ringPitch(radius: number, count: number = RING.COUNT): number {
  return (2 * Math.PI * radius) / count;
}

/**
 * 半径 ρ 处相邻两带之间的净缝（节距 − 带深）。
 * < 0 = 两条带在该半径处互穿——半径下限就是靠它定的（芯轨还在 x=0 内侧，
 * 故实际要卡的最小半径比站位半径再小一点，见 RAIL_INSET）。
 */
export function ringGap(radius: number, count: number = RING.COUNT, depth: number = RING.DEPTH): number {
  return ringPitch(radius, count) - depth;
}

/** 芯轨中心相对站位圆的内偏（台架画轨用的常量，守门算最小间隙也用它） */
export const RAIL_INSET = 3.4;
/** 芯轨半宽（径向）与半厚（切向） */
export const RAIL_HALF = { r: 2.4, t: 2.4 } as const;

export interface RingUnitDef {
  key: string;
  zh: string;
  en: string;
  spec: SkinSpec;
  opts: SkinUnitOpts;
  smooth: readonly [number, number];
}

/**
 * 圈上用的四条带：目录四键谱搬到共同的三段构造上（形态逐位不动）。
 * 顺序 = v7 目录序（袋 / 蘑菇挑台 / 直挑台 / 阶梯挑台）。
 */
export function buildRingUnits(): RingUnitDef[] {
  return SKIN_UNITS.map((d) => ({
    key: d.key,
    zh: d.zh,
    en: d.en,
    spec: [['g', ARRAY_LEAD], placeOnBand(d.spec[1]), ['g', ARRAY_TAIL]] as SkinSpec,
    opts: skinSiteOpts(d),
    smooth: d.smooth ?? ([3, 1] as const),
  }));
}

/**
 * 圈上编制：全环同一种键谱（用户 2026-08-23 纠偏）——二十个位置都指向那一条引擎。
 * 「一圈里混四种」是首版，被否：一圈四种形态混着，平台不连续。
 */
export function buildRingOrder(count: number = RING.COUNT): number[] {
  return new Array<number>(count).fill(0);
}

/**
 * 默认形态 = 阶梯挑台方箱（SKIN_UNITS 第 4 个）：顶面是找平过的，
 * 一圈连起来才读得出是「能站人的平台」，而不是一圈卷边。
 */
export const RING_DEFAULT_FORM = 3;

/** 单元总节数（四条相同——对位构造的三段等长） */
export const RING_BAND_NODES = ARRAY_LEAD + ARRAY_FREE + ARRAY_TAIL;
