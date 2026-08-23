'use client';

import { RING, buildRingOrder, buildRingUnits } from '../../src/lib/space/skin-ring';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.09 · 圆筒环列（用户 2026-08-23 立项：「把每一个单元再收窄 0.5 倍，
 * 然后把表皮向外偏移一点然后复制 20 个围成一圈，形成一个圆筒，
 * 这个圆筒收缩就可以形成一个环形平台」）。
 *
 * 台架整台复用 SkinSolidBench（本轮为它加了「引擎与摆放分开」+ 环列 + 圆环板
 * 天花 + 半径滑块），零第二份实现。编制与几何说明见 src/lib/space/skin-ring.ts：
 * - 只解四条引擎（圈上只有四种键谱），摆二十处 —— 物理开销与 Lab.07 相同；
 * - 半径是滑块（用户拍板现场调），天花随之重烘；
 * - 带间的缝随半径变宽，用户已拍板接受。
 *
 * 机位：轴测俯角比另外两台大（−0.45），一圈才读得出是圈；顶视是这台的主视角。
 */
const RING_UNITS: readonly SolidUnitDef[] = buildRingUnits().map(({ spec, opts, smooth }) => ({
  spec,
  opts,
  smooth,
}));
const RING_ORDER = buildRingOrder();

export function SkinRingBench({
  active = true,
  onLight = false,
  controls = true,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
}) {
  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={RING_UNITS}
      order={RING_ORDER}
      ring
      radius={{ min: RING.RADIUS_MIN, max: RING.RADIUS_MAX, def: RING.RADIUS_DEF }}
      depth={RING.DEPTH}
      thick={RING.THICK}
      ceiling="ring"
      pivot={{ x: 0, y: 166, z: 0 }}
      camScale={0.95}
      axon={{ pitch: -0.45, yaw: -0.62 }}
      hud={{
        kicker: 'Lab.09 / Project II',
        title: '圆筒环列 · 收缩成环形平台',
        sub: `${RING.COUNT} 条窄带 · 四种键谱各 ${RING.COUNT / 4} 份 · 同一收缩协议`,
        hint: '半径可调 · 顶视看环 · 拖拽旋转',
        aria: '圆筒环列：二十条窄织物带围成一圈，收缩后各自扣出挑台、连成绕筒一圈的环形平台，半径可调、可拖拽旋转',
      }}
    />
  );
}
