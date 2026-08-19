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
 */
const ARRAY_UNITS: readonly SolidUnitDef[] = buildTransitionArray().map(
  ({ spec, opts, smooth }) => ({ spec, opts, smooth }),
);

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
      gapX={80}
      depth={26}
      pivot={{ x: 468, y: 168, z: 0 }}
      camScale={0.6}
      ceiling="span"
      rate={80}
      hud={{
        kicker: 'Lab.08 / Project II',
        title: '阵列过渡 · 蘑菇挑台 → 阶梯方箱',
        sub: '12 条窄带 · 键长 0.10→0.32 逐级微变 · 同一收缩协议',
        hint: '左端 = 蘑菇挑台 · 右端 = 阶梯方箱 · 拖拽旋转',
        aria: '阵列过渡：十二条窄织物带，键谱逐级微变，从蘑菇挑台渐变为阶梯方箱',
      }}
    />
  );
}
