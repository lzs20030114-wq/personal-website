/**
 * 项目二 · 捏分环（Lab.13）——纯数据，零 DOM。
 *
 * 用户 2026-08-30：「现在做那种环形的，就和我之前做过的环形一样，20 个从形态 1
 * 到 2 再到 1。」——把 Lab.12 那十级捏分（单箱 → 两台）搬到 Lab.09 的圆筒环上：
 * 二十条窄带绕轴一圈，沿圆周从**单箱**过渡到**两台**再回到单箱。
 *
 * ## 编制：镜像而不是 palindromeOrder
 *
 * 环是周期的，一圈必须回到起点。Lab.09 的 `palindromeOrder(count, levels)` 是按
 * 「levels = count/2 + 1」（20 位 11 级）设计的，用它套 10 级会**四舍五入**出
 * 0,1,2,3,4,5,5,6,7,8,9,8,7,6,5,4,4,3,2,1——第 4/5 级各出现三次、级距不匀。
 * 而 20 位配 10 级本来就有一个精确解：**镜像** `[0..9, 9..0]`——
 * 每级恰好出现两次、相邻位恒差 ≤1、首尾相接闭合，没有任何取整。
 * 两个折返点（单箱那端、两台那端）各有一对同级邻居，那正是「转过去再转回来」的顶点。
 *
 * ## 形态一个数没改
 *
 * 十级直接取 `buildSplitLevels()`——**不做环族的 RING_GROW 放大**：
 * 捏分族的四件成形机制（缝区折痕 coreTetherRel / 缝壁排整齐 alignRuns /
 * 缝底限位 coreTether / 面角键）全是**按节点下标**逐级手工排的，而 `growSeg`
 * 只认目录那种「单链扇形」谱；放大会静默打乱这些下标，形态与成形过程一起崩。
 * 40px 的台深在半径 30 的环上已经是一圈像样的环形平台（外缘半径 70）。
 *
 * ## 平台为什么是平的
 *
 * 靠的是 Lab.12 的对位构造 v4（配平垫劈两半夹住结构 ⇒ 缝心 = 两贴合锚中点
 * = 138 + 114·r px，与级别、键谱、折叠状态全无关）。一圈二十条形态在变、
 * 缝心高度不变——这正是能把「过渡」摆上环的前提，与 Lab.09 渐变编制同一条道理。
 *
 * 带深/厚度/半径量程沿用环族常量（RING）：同一个家族，换的只是键谱。
 */
import { RING } from './skin-ring';
import { buildSplitLevels, type SkinSplitLevel } from './skin-split';

/** 一圈的位置数（= Lab.09 的 20） */
export const SPLIT_RING_COUNT = RING.COUNT;

/**
 * 相位：把两个折返点从正前/正后转开。
 * 纯外观量——默认轴测机位下，折返点落在正前正后会被自己挡住，看不出是个来回。
 * 取 5 = 转四分之一圈（与 Lab.09 渐变的 GRAD_PHASE 同款理由、同一个数）。
 */
export const SPLIT_RING_PHASE = 5;

/**
 * 环上编制：位置 → 级序。镜像 `[0..9, 9..0]`，再整体绕轴转 `offset` 位。
 * 每级恰好两处 ⇒ 只解十条引擎、摆二十处（与 Lab.09 同一条省算路子）。
 */
export function buildSplitRingOrder(
  levels: number,
  count: number = SPLIT_RING_COUNT,
  offset: number = SPLIT_RING_PHASE,
): number[] {
  if (levels * 2 !== count) throw new Error(`镜像编制要求 2×级数 = 位置数（${levels}×2 ≠ ${count}）`);
  return Array.from({ length: count }, (_, i) => {
    const j = (i + offset) % count;
    return j < levels ? j : count - 1 - j;
  });
}

/** 十级引擎（= Lab.12 的定案十级，逐字复用） */
export function buildSplitRingUnits(): SkinSplitLevel[] {
  return buildSplitLevels();
}
