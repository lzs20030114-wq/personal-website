/**
 * 项目二 · 圆筒环的「捏分」编制（Lab.10 第四编制；2026-08-30 立项为 Lab.13，2026-09-03 收纳进 Lab.10）
 * ——**一次循环 · 变高 · 居中 · 一圈等挑出**。纯数据 + 纯几何，零 DOM。
 *
 * ## 2026-09-03 用户「方形的没问题了，但是圆形的捏分，中间的空间还没做」
 *
 * 方形环的捏分（skin-square-split.ts）经三轮拍板已经是：台高钉死 16、缝从 0 张到 100、
 * 总高按等步从 132 降到 32、缝心一圈恒定（居中）。圆筒环这一档此前还停在 Lab.12 那十级
 * （台 12、缝最多 28），两片台之间没有那块空间。本轮把圆的对齐到方的：
 *
 * - **构造逐字复用方形那套**（`sqSplitStructure / sqSplitWrap / sqSplitBuild`：刻缝箱 + 面角键 +
 *   缝底限位 + 顶/底面排整齐 + 对称配平垫），时间表同一张（`SQSPLIT_PAIR_T`，总高等步）。
 * - **圆 = 方形去掉三个方位类**：方形按面/边/角三档深度把外缘凑成方；圆一圈只有一档，
 *   二十条带全按**面类**深度标定 ⇒ 俯视是圆（外缘半径 = 芯半径 + 同一个挑出）。
 *   面类在方形那边已有四个 t 的引擎（j0/j4/j5/j9），本轮把其余六个 t 也按面类标定，十条引擎
 *   挑出全部落在同一个目标 ±1px 内（`SPLIT_RING_REACH`）。
 * - **编制仍是镜像** `[0..9, 9..0]`（20 位配 10 级的精确解：每级恰两处、相邻恒差 ≤1、首尾闭合），
 *   再转 `SPLIT_RING_PHASE` 位把两个折返点从正前正后转开。对号 j0 = 双平台（t=1）、j9 = 整块（t=0）。
 * - **带长跟方形捏分同一份**（`SQSPLIT_BAND` 338，比环族其余三档的 202 长）：深缝要材料，
 *   与 Lab.11 平档 305 → 捏分 338 是同一笔账；台架换编制时枢轴与取景按带长跟着走。
 *   缝心离下缘 = 2(tail+ISO) + r(F_TOT−1)，与方形捏分逐位相同 ⇒ 两台的平台高度一致。
 *
 * ## 为什么不是把方形的十条直接摆到圆上
 *
 * 方形的十条引擎按方位类分三种深度（面 83 / 边 95 / 角 128），摆到圆上外缘会呈方形——
 * 圆的定义就是「一圈同一个挑出」，所以要的是**十个 t 全在面类深度上**的引擎，
 * 其中六条是本轮新标的。
 *
 * ## 旧版（Lab.12 十级直接上环）的两条结论仍然有效
 *
 * - 不做环族的 `RING_GROW` 放大：捏分族的成形机制全按节点下标手排，`growSeg` 只认单链扇形谱。
 * - 一圈里读得出「过渡」的前提是平台高度不随形态变——现在由对称配平垫的构造性质保证。
 */
import { RING } from './skin-ring';
import type { RingUnitDef } from './skin-ring';
import {
  SQSPLIT,
  SQSPLIT_BAND,
  SQSPLIT_PAIR_T,
  SQSPLIT_PAIRS,
  sqSplitBuild,
  type SqSplitTier,
} from './skin-square-split';

/** 一圈的位置数（= Lab.10 的 20） */
export const SPLIT_RING_COUNT = RING.COUNT;

/**
 * 相位：把两个折返点从正前/正后转开。
 * 纯外观量——默认轴测机位下，折返点落在正前正后会被自己挡住，看不出是个来回。
 * 取 5 = 转四分之一圈（与 Lab.10 渐变的 GRAD_PHASE 同款理由、同一个数）。
 */
export const SPLIT_RING_PHASE = 5;

/** 这一编制的带长（= 方形捏分那份，两台的平台高度才一致） */
export const SPLIT_RING_BAND = SQSPLIT_BAND;

/** 一圈共同的目标挑出（px）：面类深度，与方形捏分的面类同一档 */
export const SPLIT_RING_TARGET = 83.2;

/**
 * 十对位置的引擎（**冻结成表**，不是活扫掠），下标 = 对号 j（j0 双平台 t=1 … j9 整块 t=0）。
 * 标定法（2026-09-03，scratchpad calib.mjs，构造委托站上模块）：按十个 t 扫 boxD {74..80} × D = boxD + {3..6}，
 * 判据照方形守门（键全锁 · 打结每 10 步采 ≤6 · 顶底面水平度 <1.5 · |总高 − H(t)| <1.5 · 剪影Δ <6 ·
 * 缝角鼓出端面 <1.5 · t=1 裂到轴且两台净空 >80 · 中段缝深 >5）；**目标挑出不是拍脑袋定的**——
 * 在 80–88 上扫，取「十对各自最接近的候选的最大偏差」最小的那个 ⇒ 83.2，最大偏差 0.20px
 * （229 组里 180 组过判据；整块那一对沿用方形的 k48）。boxD 78 管到 j5，j6–j8 浅缝档要 80 才够到同一挑出。
 */
const tier = (pair: number, cfg: { D?: number; boxD?: number; k?: number }): SqSplitTier => ({
  name: `面 j${pair}`,
  en: `face j${pair}`,
  pair,
  cls: 0,
  t: SQSPLIT_PAIR_T[pair],
  ...cfg,
});
export const SPLIT_RING_TIERS: readonly SqSplitTier[] = [
  tier(0, { D: 82.5, boxD: 78 }),
  tier(1, { D: 82.0, boxD: 78 }),
  tier(2, { D: 82.0, boxD: 78 }),
  tier(3, { D: 82.5, boxD: 78 }),
  tier(4, { D: 83.0, boxD: 78 }),
  tier(5, { D: 83.0, boxD: 78 }),
  tier(6, { D: 83.5, boxD: 80 }),
  tier(7, { D: 83.0, boxD: 80 }),
  tier(8, { D: 83.0, boxD: 80 }),
  tier(9, { k: 48 }),
];

/** 实测终态挑出（px），下标同 SPLIT_RING_TIERS——守门逐位核对，且全部 ∈ 目标 ±1 */
export const SPLIT_RING_REACH: readonly number[] = [
  83.1, 83.3, 83.2, 83.2, 83.1, 83.0, 83.3, 83.1, 83.3, 83.4,
];

/**
 * 环上编制：位置 → 对号。镜像 `[0..9, 9..0]`，再整体绕轴转 `offset` 位。
 * 每对恰好两处 ⇒ 只解十条引擎、摆二十处（与 Lab.10 其余编制同一条省算路子）。
 */
export function buildSplitRingOrder(
  levels: number = SQSPLIT_PAIRS,
  count: number = SPLIT_RING_COUNT,
  offset: number = SPLIT_RING_PHASE,
): number[] {
  if (levels * 2 !== count) throw new Error(`镜像编制要求 2×级数 = 位置数（${levels}×2 ≠ ${count}）`);
  return Array.from({ length: count }, (_, i) => {
    const j = (i + offset) % count;
    return j < levels ? j : count - 1 - j;
  });
}

/** 十条引擎（解十条摆二十处） */
export function buildSplitRingUnits(tiers: readonly SqSplitTier[] = SPLIT_RING_TIERS): RingUnitDef[] {
  return tiers.map((t) => {
    const b = sqSplitBuild(t);
    return {
      key: `ringsplit-j${t.pair}`,
      zh: t.name,
      en: t.en,
      spec: b.spec,
      opts: b.opts,
      smooth: [3, 1] as const,
    };
  });
}

/** 一圈的平台外缘半径（俯视是圆：芯半径 + 同一个挑出） */
export function splitRingOuter(radius: number = RING.RADIUS_DEF): number {
  return radius + SPLIT_RING_TARGET;
}

/** 缝宽 / 总高沿圈：与方形捏分同一张表（供 HUD 与守门） */
export const SPLIT_RING_LOBE = SQSPLIT.LOBE;
export const SPLIT_RING_W_END = SQSPLIT.W_END;
export const splitRingT = (j: number): number => SQSPLIT_PAIR_T[j];
