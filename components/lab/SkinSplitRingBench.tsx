'use client';

import { useMemo } from 'react';
import { RING } from '../../src/lib/space/skin-ring';
import { SPLIT_LOBE, SPLIT_SEAM } from '../../src/lib/space/skin-split';
import {
  SPLIT_RING_COUNT,
  buildSplitRingOrder,
  buildSplitRingUnits,
} from '../../src/lib/space/skin-split-ring';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.13 · 捏分环（用户 2026-08-30：「现在做那种环形的，就和我之前做过的环形一样，
 * 20 个从形态 1 到 2 再到 1」）——Lab.12 的十级捏分搬上 Lab.09 的圆筒环：
 * 二十条窄带绕轴一圈，沿圆周单箱 → 两台 → 单箱走一个来回。
 *
 * 零新机制：引擎、键谱、四件成形机制、对位构造全部逐字取自 Lab.12；台架整台复用
 * SkinSolidBench 的环列路径（半径滑块 / 圆环板天花 / 固定立杆 / 一条引擎摆多处）。
 * 新的只有编制——20 位镜像（见 skin-split-ring.ts：10 级配 20 位有精确解，
 * 不必走 Lab.09 那个按 11 级设计的 palindromeOrder）。
 *
 * 环上能读出「过渡」的前提是平台高度不随形态变——那正是 Lab.12 对位构造 v4
 * （缝心 = 138 + 114r，与级别无关）挣来的：一圈里形状在变、缝心齐平。
 */
const UNITS = buildSplitRingUnits();
const ORDER = buildSplitRingOrder(UNITS.length);

export function SkinSplitRingBench({
  active = true,
  onLight = false,
  controls = true,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
}) {
  const units = useMemo<readonly SolidUnitDef[]>(
    () => UNITS.map(({ spec, opts, smooth }) => ({ spec, opts, smooth })),
    [],
  );

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={units}
      order={ORDER}
      rate={80} // 十条引擎同推——照 Lab.09 渐变编制的口径
      ring
      radius={{ min: RING.RADIUS_MIN, max: RING.RADIUS_MAX, def: RING.RADIUS_DEF }}
      depth={RING.DEPTH}
      thick={RING.THICK}
      // 蒙皮默认比 Lab.09 的 0.35 薄：那台一圈同形、膜把二十条糊成一个闭合的筒是
      // 目的；这台的看点是**沿圆周的过渡**，膜太厚会把二十条各自的形糊掉
      skin={{ def: 0.15 }}
      ceiling="ring"
      rail="fixed"
      // 机位实测重取：捏分族的台深 40 比环族（RING_GROW 2.1）小一半多，
      // 照搬 Lab.09 的 0.95 只填到七成、且整体偏低 40px
      pivot={{ x: 0, y: 184, z: 0 }}
      camScale={1.06}
      axon={{ pitch: -0.45, yaw: -0.62 }}
      hud={{
        kicker: 'Lab.13 / Project II',
        title: '捏分环 · 一圈里裂开再合上',
        sub: `${SPLIT_RING_COUNT} 条窄带 · 单箱 → 两台 → 单箱 · 10 级键谱镜像成一圈`,
        hint: `每台高 ${SPLIT_LOBE}px · 终态缝 ${SPLIT_SEAM}px · 半径可调 · 顶视看环 · 拖拽旋转`,
        aria: '捏分环：二十条织物带围成一圈，沿圆周从单个方箱逐级裂成上下两个平台再合回单箱；十级键谱镜像铺满一圈，半径可调，可拖拽旋转',
      }}
    />
  );
}
