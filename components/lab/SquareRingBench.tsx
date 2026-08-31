'use client';

import { useMemo, useState } from 'react';
import {
  SQUARE,
  SQUARE_PHASE,
  SQUARE_REACH,
  SQUARE_RUNGS,
  SQUARE_TIERS,
  SQUARE_WAVE,
  buildSquareOrder,
  buildSquareUnits,
  buildSquareWave,
  squareHalfSide,
} from '../../src/lib/space/skin-square';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.14 · 方形环（用户 2026-08-30 立项：「我想试试看能不能做出来正方形 长方形的，
 * 就是靠外延的长度来做形状」，拍板「只有向外扩展的横向维度被压缩，高度之类的都不变」）。
 *
 * 筒芯仍是圆的，靠每条带**挑出多远**把俯视外轮廓凑成正方形：相位转半格 ⇒ 四条带
 * 正落在四个角上 ⇒ 二十个平台外缘点全部落在方形的边上，而环间膜俯视是弦线，
 * 同一条边上两点之间的弦就是那条边本身。三档深度（面 8 / 边 8 / 角 4）+ 一圈恒定
 * 的箱高 36px：解三条引擎摆二十处，物理开销与 Lab.09 同量级。
 *
 * 键谱与几何全在 skin-square.ts（线稿脚本与站上共用一份）；台架整台复用
 * SkinSolidBench，本轮只给它加了一个相位偏移 prop（默认 0 ⇒ Lab.07–10 逐位不变）。
 *
 * 两处与 Lab.09 不同，都是这一族的定义带来的：
 * - **半径钉死**（不给滑块）：三档的目标深度是「方形极径 − 站位半径」的绝对量，
 *   R 一变方形就不成立，得整套重标。
 * - **顶视是主视角**：方形要俯视才读得出来，故默认机位就是顶视。
 */
const strip = (d: { spec: SolidUnitDef['spec']; opts: SolidUnitDef['opts']; smooth: SolidUnitDef['smooth'] }): SolidUnitDef => ({
  spec: d.spec,
  opts: d.opts,
  smooth: d.smooth,
});
const FLAT_UNITS: readonly SolidUnitDef[] = buildSquareUnits().map(strip);
const FLAT_ORDER = buildSquareOrder();
const WAVE = buildSquareWave();
const WAVE_UNITS: readonly SolidUnitDef[] = WAVE.units.map(strip);

const PLANS = [
  { key: 'flat', label: '整环平' },
  { key: 'wave', label: '一圈起伏' },
] as const;
type PlanKey = (typeof PLANS)[number]['key'];

export function SquareRingBench({
  active = true,
  onLight = false,
  controls = true,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
}) {
  const side = useMemo(() => Math.round(2 * squareHalfSide()), []);
  const [plan, setPlan] = useState<PlanKey>('flat');
  const wave = plan === 'wave';
  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={wave ? WAVE_UNITS : FLAT_UNITS}
      order={wave ? WAVE.order : FLAT_ORDER}
      unitsKey={plan}
      // 起伏要解十一条引擎（平档只有三条）⇒ 推进速率随之降，同 Lab.08/09 渐变的做法
      rate={wave ? 80 : 110}
      ring
      angleOffset={SQUARE_PHASE}
      // 量程为零 = 滑块不出（方形是按这个半径标定的）
      radius={{ min: SQUARE.RADIUS, max: SQUARE.RADIUS, def: SQUARE.RADIUS }}
      depth={SQUARE.DEPTH}
      thick={SQUARE.THICK}
      skin={{ def: 0.35 }}
      ceiling="ring"
      rail="fixed"
      // 单份排布（≥2 份才出「排列」切换）；默认机位取**顶视**——这一族的卖点就是
      // 俯视是方的，轴测的俯仰压缩会把方形读成菱形。home 是排布级的属性，故走 layouts
      layouts={[
        { key: 'square', label: '', gapX: 0, gapZ: 0, pivot: { x: 0, y: 166, z: 0 }, camScale: 0.95, home: 'top' },
      ]}
      axon={{ pitch: -0.45, yaw: -0.62 }}
      extraControls={
        <div className="grp">
          <span className="k">编制</span>
          <span className="seg">
            {PLANS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={p.key === plan ? 'active' : undefined}
                onClick={() => setPlan(p.key)}
              >
                {p.label}
              </button>
            ))}
          </span>
        </div>
      }
      hud={{
        kicker: 'Lab.14 / Project II',
        title: '方形环 · 靠挑出的长度做形状',
        sub: wave
          ? `${SQUARE.COUNT} 条窄带 · 三档深度不变 · 高度沿圆周起伏 ${(SQUARE_WAVE.LOW - SQUARE_WAVE.HIGH) * 2}px · ${SQUARE_WAVE.LEVELS} 级`
          : `${SQUARE.COUNT} 条窄带 · 三档深度 ${SQUARE_REACH.map((r) => r.toFixed(0)).join(' / ')}px · 箱高恒定 ${SQUARE.H}px · 边长 ${side}px`,
        hint: `${SQUARE_TIERS.map((t) => `${t.name}${t.count}`).join(' · ')} · 每条带 ${SQUARE_RUNGS} 挡 · ${wave ? '俯视仍是方的 · 侧看起伏' : '顶视看方'} · 拖拽旋转`,
        aria:
          '方形环：二十条窄织物带围成一圈，每条带按自己在方形里的位置挑出不同长度，收缩后二十个挑台连成一圈俯视为正方形的平台；箱高一圈恒定，可拖拽旋转',
      }}
    />
  );
}
