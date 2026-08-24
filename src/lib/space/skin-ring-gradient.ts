/**
 * 项目二 · 环上渐变（Lab.09 的第二种编制）——纯数据，零 DOM。
 *
 * 用户 2026-08-23 立项：「假如现在我想做一个渐变呢？就比如蘑菇转化成直台然后再
 * 转变回来，渐变的在一圈里完成。」线稿对照后拍板改端点：**蘑菇挑台 ↔ 阶梯方箱**
 * （用户点名的蘑菇↔直挑台实测形态距离只有 1.86px，11 级叠起来几乎是一条线；
 * 蘑菇↔方箱 8.85px，是它的 4.8 倍），一圈走**一个来回**。
 *
 * ## 闭合是这件事的全部约束
 *
 * 一圈是周期的：第 19 条与第 0 条是邻居。所以渐变必须回到起点——
 * 20 个位置做回文（0→10→0），**11 个不同的键谱**，位置 i 与 20−i 共用同一条引擎
 * ⇒ 只解 11 条不是 20 条。用户说的「再转变回来」就是这个闭合条件。
 *
 * ## 与 Lab.08 的关系
 *
 * 同一对端点、同一套杠杆（键长 rb / 端面找平 panel / 方化强度 boxSquare），
 * 但**时间表是按 11 级重排的**，不是把 Lab.08 的 12 格重采样——重采样会漏行，
 * 漏掉那一格的形变堆到下一步上（实测 Δ2.82，是其余步的 4 倍，就是 Lab.08 当初
 * 被否的那种断层）。两个端点的形态仍逐字取站上原谱（只搬到对位构造的自由段上）。
 *
 * ## 平台仍然是平的
 *
 * 对位构造（三段等长 LEAD/FREE/TAIL + 扇形正居中 ⇒ 嘴心 = 2·lead + (f−1)·r）
 * 与键长、与形态无关，所以一圈里形状在变、平台高度不变。这是能做环上渐变的前提。
 *
 * 边界申明：交接件明令「行为矩阵 → 键谱的翻译规则由使用者手写」。这里的序列
 * 与 Lab.08 一样只是两张既有键谱之间的形态学串联（演示编排），不是那套翻译规则。
 */
import { ARRAY_CENTER, ARRAY_FREE, placeOnBand } from './skin-array';
import { SKIN_SITE_BASE, SKIN_UNITS, fan, skinSiteOpts } from './skin-data';
import type { SkinSeg, SkinSpec, SkinUnitOpts } from './skin-unit';
import { RING_LEAD, RING_TAIL, type RingUnitDef } from './skin-ring';

/** 级数（= 回文的一半 + 1；20 位一个来回 ⇒ 11 级） */
export const GRAD_LEVELS = 11;

/**
 * 11 级时间表。三个杠杆照 Lab.08 定案，步长按 11 级重排：
 * - **rb 键长 0.10→0.32 等步**（0.022/格）——「变宽」的连续驱动；
 * - **panel 端面找平 0 → 全跨 ±8**：不到 ±8 端面投影根本不参与（半跨是假杠杆，
 *   Lab.08 已验证），所以它必然是一格跳变，只能挑地方放；
 * - **boxSquare 方化强度 0→1 渐入**——「变方」从第 2 格就开始渗，不在任何一格二值启用。
 * 两个离散跳变（panel 到位 / 梯挡数 kMax 24→26）的落位是扫出来的（16 种组合）。
 * 纯看等距，最优是 panel@3 + 梯挡@8（0.71–1.80，2.5×）；**定版取 6+6**
 * （0.71–2.04，2.9×），理由是等距指标读不出来的两件事：
 * ① panel 一到位，蘑菇的卷边就被端面找平拉直——它落在哪一格，「蘑菇」就只占到
 *    哪一格。放 3 的话一圈二十条里只有 5 条还是蘑菇，其余全是箱；放 6 则 11 条
 *    蘑菇 9 条箱，来回才读得出是来回。
 * ② panel@3 那版第 3 级有一颗键始终没锁上（9→8），环上会有两条带比邻居少一根梯挡。
 * 代价是 panel 到位那一格 2.04（Lab.08 定版最大 1.76）——它是硬跳变，压不掉：
 * 半跨渐入实测更差（2.21），把梯挡跳变挪开也只把它从 2.04 变成 2.07。
 */
const RB = [0.1, 0.122, 0.144, 0.166, 0.188, 0.21, 0.232, 0.254, 0.276, 0.298, 0.32];
const SQ = [0, 0, 0.06, 0.14, 0.24, 0.34, 0.45, 0.56, 0.68, 0.83, 1];
export const PW_FROM = 6; // 这一格起端面找平给全跨 ±8（之前一律不给）
export const KJUMP = 6; // 这一格起梯挡 24→26

/** 一级的键谱（端点两格由 buildRingGradient 换成站上原谱） */
function levelSeg(l: number, pwFrom: number, kJump: number): SkinSeg {
  let kMax = l >= kJump ? 26 : 24;
  while (ARRAY_CENTER - kMax < 4) kMax -= 2; // 键谱两端 ≥4 节缓冲（交接件纪律）
  const bonds = fan(ARRAY_CENTER, 8, kMax + 1, 2, RB[l]);
  return l >= pwFrom
    ? ['f', ARRAY_FREE, bonds, [[ARRAY_CENTER - 8, ARRAY_CENTER + 8]]]
    : ['f', ARRAY_FREE, bonds];
}

// 三段与整环同形那一编制同一副（lead 96 / tail 15）——切编制时环的高度不该跳
const band = (seg: SkinSeg): SkinSpec => [['g', RING_LEAD], seg, ['g', RING_TAIL]];

/** 渐变序列：11 级，0 = 蘑菇挑台原谱、10 = 阶梯方箱原谱 */
export function buildRingGradient(pwFrom: number = PW_FROM, kJump: number = KJUMP): RingUnitDef[] {
  const A = SKIN_UNITS.find((d) => d.key === 'bulb')!;
  const B = SKIN_UNITS.find((d) => d.key === 'stepped')!;
  const out: RingUnitDef[] = [];
  for (let l = 0; l < GRAD_LEVELS; l++) {
    if (l === 0 || l === GRAD_LEVELS - 1) {
      const d = l === 0 ? A : B;
      out.push({
        key: `g${l}`,
        zh: d.zh,
        en: d.en,
        spec: band(placeOnBand(d.spec[1])),
        opts: skinSiteOpts(d),
        smooth: l === 0 ? (A.smooth ?? [3, 1]) : [3, 1],
      });
      continue;
    }
    const opts: SkinUnitOpts = { ...SKIN_SITE_BASE };
    if (SQ[l] > 0) opts.boxSquare = SQ[l];
    out.push({
      key: `g${l}`,
      zh: `渐变 ${l}/${GRAD_LEVELS - 1}`,
      en: `blend ${l}/${GRAD_LEVELS - 1}`,
      spec: band(levelSeg(l, pwFrom, kJump)),
      opts,
      // 低强度段梯身微皱要 [5,2] 盖住；sq≥0.5 后箱体自带压平，回 [3,1]
      smooth: SQ[l] >= 0.5 ? [3, 1] : [5, 2],
    });
  }
  return out;
}

/**
 * 环上编制：20 位回文（0→10→0）。位置 i 与 20−i 是同一级 ⇒ 同一条引擎。
 * 首尾相邻（19 与 0）差一级，接缝与其余步长同量级——这就是「转变回来」的意义。
 *
 * offset = 把整条渐变绕轴转几位（默认 5 = 四分之一圈）：不转的话两个折返点
 * （纯蘑菇、纯方箱）分别落在正前与正后，默认轴测机位下正好被自己挡住，
 * 看到的只有蘑菇那半。转四分之一圈后正对镜头的是过渡中段，左右各是两个端点。
 * 纯外观量——形态、级数、闭合性都不受影响。
 */
export const GRAD_PHASE = 5;

export function buildGradientOrder(count = 20, offset: number = GRAD_PHASE): number[] {
  const half = GRAD_LEVELS - 1; // 10
  return Array.from({ length: count }, (_, i) => {
    const t = (((i + offset) % count) / count) * 2; // 0..2
    const l = Math.round(t * half);
    return l <= half ? l : 2 * half - l;
  });
}
