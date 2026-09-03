'use client';

import { useEffect, useMemo, useState } from 'react';
import { SERIES_LAYOUTS, SERIES_PLANS, type SeriesPlanKey } from '../../src/lib/space/lab-variants';
import { buildTransitionArray } from '../../src/lib/space/skin-array';
import { SPLIT_LOBE, SPLIT_SEAM, buildSplitLevels } from '../../src/lib/space/skin-split';
import { planFromHash } from './planHash';
import { SkinSolidBench, type SolidLayout, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.09 · 序列（2026-09-03 收纳：原 Lab.08 阵列过渡 + 原 Lab.12 捏分过渡合成一台——
 * 「一台 = 一种排布（沿一条线排开的过渡序列），编制 = 形态族」）。两套内容一字未动，
 * 变的只是它们住在同一个控制条下：
 *
 * - **目录渐变**（默认）= 原 Lab.08（用户 2026-08-19 立项：左 = 蘑菇挑台、右 = 阶梯方箱，
 *   中间十个窄单元逐级微变）。十二条带全是真引擎单元，过渡来自键谱逐级微变
 *   （skin-array.ts），不是形状插值；居中是物理对位不是渲染偏移（lead = 形状在带上的位置）。
 * - **捏分** = 原 Lab.12（用户 2026-08-27 草图立项、08-29 逐级定案、08-30 成形过程设计 v3、
 *   对位构造 v4）：十条带从单个方箱逐级过渡到分开的两个平台，每一级是自己单独设计的谱
 *   （skin-split.ts；用户否决了单参数生成器路线）。
 *
 * 两种排布两编制都有（用户 2026-08-19 / 08-29 分别拍板）：并拢 = 沿深度密排成切片序列、
 * 侧视读剖面渐变；分列 = 沿 X 拉开逐条读、轴测看 3D。切排布只改渲染偏移与机位，引擎不重建。
 *
 * 合并时保住的两处差别（都走 SkinSolidBench 同轮加的加法式钩子）：
 * - **立杆读法**：渐变是「轨即芯」（08-22 拍板：Lab.06–08 留旧读法，「那条缝就是往下收本身」），
 *   捏分是固定立杆（各级材料量不同、顶端下沉幅度不同）——`rail` 按编制切；
 * - **取景**：同一种排布下两编制的枢轴与 scale 不同（分列：12 条带 468/0.6 vs 10 条带
 *   400/0.76；捏分那组是 08-30 修掉绘图平滑放大 bug 后按真实包围盒重取的），
 *   `pivotFor`/`camScaleFor` 按编制 × 排布现读。
 * 切编制走 setUnits 就地重建（unitsKey），不重挂 WebGL 上下文。
 */
const RATE = 80; // 十条／十二条同推，成形期单帧物理量是 Lab.07 的三倍，照原两台的口径
/** 切片带深（0.6× 窄带）：并拢时片间留缝、剖面渐变连成一条连续体（原两台同值） */
const DEPTH = 15.6;

/** 排布几何（两编制共用）：并拢沿 Z 密排 16.5、分列沿 X 拉开 80 */
const GAP = { merged: { gapX: 0, gapZ: 16.5 }, spread: { gapX: 80, gapZ: 0 } } as const;
type LayoutKey = (typeof SERIES_LAYOUTS)[number]['key'];
/** 取景（编制 × 排布）：数字逐字取自原 Lab.08 / Lab.12 */
const CAM: Record<SeriesPlanKey, Record<LayoutKey, { pivot: { x: number; y: number; z: number }; scale: number }>> = {
  gradient: {
    merged: { pivot: { x: 45, y: 160, z: 0 }, scale: 1.1 },
    spread: { pivot: { x: 468, y: 168, z: 0 }, scale: 0.6 },
  },
  split: {
    merged: { pivot: { x: 45, y: 200, z: 0 }, scale: 1.0 },
    spread: { pivot: { x: 400, y: 205, z: 0 }, scale: 0.76 },
  },
};
/** 挂载时的排布表（枢轴取默认编制的；之后由 pivotFor/camScaleFor 按编制现读） */
const LAYOUTS: readonly SolidLayout[] = SERIES_LAYOUTS.map((L) => ({
  key: L.key,
  label: L.label,
  ...GAP[L.key],
  pivot: CAM.gradient[L.key].pivot,
  camScale: CAM.gradient[L.key].scale,
  // 并拢默认水平机位：片沿深度叠着，俯仰≠0 时远片会纵向偏移（视角错位，不是形状没对齐）；
  // 分列 gapZ=0 无深度展开，任何机位都不错位，用轴测看 3D
  home: L.key === 'merged' ? 'side' : 'axon',
}));

const GRAD_UNITS: readonly SolidUnitDef[] = buildTransitionArray().map(({ spec, opts, smooth }) => ({
  spec,
  opts,
  smooth,
}));
let splitCache: readonly SolidUnitDef[] | null = null;
const splitUnits = (): readonly SolidUnitDef[] =>
  (splitCache ??= buildSplitLevels().map(({ spec, opts, smooth }) => ({ spec, opts, smooth })));

/** HUD 双语：/lab 说中文（默认），案例页正文里的活件跟着页面的中英切换走 */
const HUD = {
  zh: {
    gradient: {
      kicker: 'Lab.09 / Project II',
      title: '序列 · 目录渐变 · 蘑菇挑台 → 阶梯方箱',
      sub: '12 条窄带 · 键长 0.10→0.32 逐级微变 · 同一收缩协议',
      hint: (ctl: boolean) =>
        `近端 = 蘑菇挑台 · 远端 = 阶梯方箱${ctl ? ' · 编制 / 排布可切' : ''} · 拖拽旋转`,
      aria: '序列·目录渐变：十二条窄织物带沿深度并拢成一个连续体，键谱逐级微变，从蘑菇挑台渐变为阶梯方箱，可切换为分列排布',
    },
    split: {
      kicker: 'Lab.09 / Project II',
      title: '序列 · 捏分 · 单箱裂成两台',
      sub: `10 级 · 每台高 ${SPLIT_LOBE}px · 终态缝 ${SPLIT_SEAM}px · 逐级独立设计的键谱`,
      hint: (ctl: boolean) =>
        `左 = 单箱，右 = 两台 · 缝逐级豁开${ctl ? ' · 编制 / 排布可切' : ''} · 拖拽旋转`,
      aria: '序列·捏分：十条织物带从单个方箱逐级过渡到分开的两个平台，面上的缝一级比一级张得更开、最后裂到芯上；每一级是单独设计的键谱',
    },
  },
  en: {
    gradient: {
      kicker: 'Lab.09 / Project II',
      title: 'Series — a graded array, bulb flange to stepped box',
      sub: 'Twelve narrow bands · bond length 0.10→0.32 in even steps · one protocol',
      hint: (ctl: boolean) =>
        `A bulb flange at one end, a stepped box at the other — every band a real solve, not an interpolation${ctl ? ' · plan and layout switchable' : ''}`,
      aria:
        'Twelve narrow fabric bands packed edge to edge into one continuous body; the bond map changes by a small step from band to band, so the form grades from a bulb flange to a stepped box.',
    },
    split: {
      kicker: 'Lab.09 / Project II',
      title: 'Series — pinched apart, one box into two platforms',
      sub: `Ten levels · platform ${SPLIT_LOBE} px · final seam ${SPLIT_SEAM} px · each level its own bond map`,
      hint: (ctl: boolean) =>
        `One box on the left, two platforms on the right — the seam opens level by level${ctl ? ' · plan and layout switchable' : ''}`,
      aria:
        'Ten fabric bands walking a single box until it is two platforms; the seam on the face opens a little more at every level until it reaches the mast. Every level is its own designed bond map.',
    },
  },
} as const;

export function SkinSeriesBench({
  active = true,
  onLight = false,
  controls = true,
  lang = 'zh',
  plan: plan0 = 'gradient',
  layout = 0,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
  lang?: 'en' | 'zh';
  /** 开场编制（正文里没有控制条，故那边指定） */
  plan?: SeriesPlanKey;
  /** 开场停在第几种排布（0 并拢 / 1 分列）。案例页正文取分列——侧视下十二条带互相遮挡 */
  layout?: number;
}) {
  const [plan, setPlan] = useState<SeriesPlanKey>(plan0);
  // `/lab#lab09-split` 直达捏分（合并进来的编制没有自己的卡片与锚点，这是它的 URL 入口）
  useEffect(() => {
    const k = planFromHash(
      '09',
      SERIES_PLANS.map((p) => p.key),
    );
    if (k) setPlan(k);
  }, []);
  const split = plan === 'split';
  const units = useMemo<readonly SolidUnitDef[]>(() => (split ? splitUnits() : GRAD_UNITS), [split]);
  const T = HUD[lang][plan];

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={units}
      unitsKey={plan}
      rate={RATE}
      depth={DEPTH}
      ceiling="span"
      layouts={LAYOUTS}
      layout0={layout}
      // 立杆读法按编制切（见文件头）；取景按编制 × 排布现读
      rail={split ? 'fixed' : 'core'}
      pivotFor={(k) => CAM[plan][k as LayoutKey].pivot}
      camScaleFor={(_r, _v, k) => CAM[plan][k as LayoutKey].scale}
      extraControls={
        <div className="grp">
          <span className="k">编制</span>
          <span className="seg">
            {SERIES_PLANS.map((p) => (
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
      hud={{ ...T, hint: T.hint(controls) }}
    />
  );
}
