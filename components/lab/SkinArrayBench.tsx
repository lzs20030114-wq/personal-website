'use client';

import { buildTransitionArray } from '../../src/lib/space/skin-array';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.08 · 阵列过渡（用户 2026-08-19 立项：左 = 蘑菇挑台、右 = 阶梯方箱，
 * 中间十个窄单元逐级微变，实现从 2 到 4 的过渡）。
 *
 * 台架整台复用 SkinSolidBench（参数化：单元序列 / 密排间距 / 窄带深 / 通长天花 /
 * 机位 / HUD），零第二份实现。十二条带全部是真引擎单元——过渡来自键谱逐级微变
 * （见 src/lib/space/skin-array.ts），不是形状插值。
 * RATE 降到 80：十二台同时推进，成形期单帧物理量是 Lab.07 的三倍。
 *
 * 两种排列（用户 2026-08-19 追加「把他们并一起看效果」）：
 * - **并拢**（默认）= 12 条带沿深度密排（间距 27.5 略大于带深 26——贴平会让相邻
 *   剖口共面 z-fight），共用一条轴线，读作一个剖面渐变的连续体；
 * - **分列** = 沿 X 排开（间距 80），逐条读键谱差异。
 * 切换只改渲染偏移与机位，引擎不重建——两种排列看的是同一次收缩。
 */
const ARRAY_UNITS: readonly SolidUnitDef[] = buildTransitionArray().map(
  ({ spec, opts, smooth }) => ({ spec, opts, smooth }),
);

const ARRAY_LAYOUTS = [
  { key: 'merged', label: '并拢', gapX: 0, gapZ: 27.5, pivot: { x: 45, y: 160, z: 0 }, camScale: 1.1 },
  { key: 'spread', label: '分列', gapX: 80, gapZ: 0, pivot: { x: 468, y: 168, z: 0 }, camScale: 0.6 },
] as const;

export function SkinArrayBench({
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
      units={ARRAY_UNITS}
      depth={26}
      ceiling="span"
      rate={80}
      layouts={ARRAY_LAYOUTS}
      hud={{
        kicker: 'Lab.08 / Project II',
        title: '阵列过渡 · 蘑菇挑台 → 阶梯方箱',
        sub: '12 条窄带 · 键长 0.10→0.32 逐级微变 · 同一收缩协议',
        hint: '近端 = 蘑菇挑台 · 远端 = 阶梯方箱 · 并拢/分列可切 · 拖拽旋转',
        aria: '阵列过渡：十二条窄织物带沿深度并拢成一个连续体，键谱逐级微变，从蘑菇挑台渐变为阶梯方箱，可切换为分列排布',
      }}
    />
  );
}
