'use client';

import { useMemo } from 'react';
import { SPLIT_LOBE, SPLIT_SEAM, buildSplitLevels } from '../../src/lib/space/skin-split';
import { SkinSolidBench, type SolidLayout, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.12 · 捏分过渡（用户 2026-08-27 草图立项、2026-08-29 逐级定案）：
 * 十条带从**单个方箱**逐级过渡到**分开的两个平台**——面上的缝一级比一级张得开，
 * 最后裂到芯上。目标线形是用户拍板的定版（每台高 12px · 台深 40 · 终态缝 28）。
 *
 * 与 Lab.08 阵列过渡的分工：那台是两张既有目录键谱之间的形态学串联；这台的
 * 每一级是**自己单独设计的谱**（用户否决了单参数生成器路线：「针对过程里的
 * 每一个结构单独做结构，只是参考前后，不要从前后改出来」）。构造、逐级旋钮与
 * 定案数字全在 src/lib/space/skin-split.ts，守门 skin-split.test.ts 卡的是
 * 硬机制的触发条件、对位构造与剪影Δ。
 *
 * 引擎零新增：仍是 Lab.06 那套 2D 剖面引擎（站方修正全套 + 皮-芯键单侧限位）；
 * 台架整台复用 SkinSolidBench，与 Lab.07–08 同一种立体呈现。
 */
const RATE = 80; // 十条 200 节的带同推——成形期单帧物理量大，照 Lab.08 十二条带降速
/** 切片带深（Lab.08 并拢同款 0.6×）：并拢时片间留缝、剖面渐变连成一条连续体 */
const DEPTH = 15.6;

/**
 * 两种排布（用户 2026-08-29 看图指定「把它们平着排成一列」= Lab.08 的并拢）：
 * - **并拢**（默认）：十片沿深度密排成一条连续体，从侧面读剖面的渐变；
 * - 分列：拉开成一排，逐级单看。
 * 切排布只改渲染偏移与机位、**不重建引擎**（同一次收缩的两种看法）。
 */
// 机位在 2026-08-30 重定：此前的 pivot/camScale 是按**被放大 1.5 倍的带子**
// 框的（renderSmooth 偶数窗口 bug，见 skin-unit 该函数注释）——那时带子垂到
// 芯轨下缘之外，画面被撑满；修好后装置回到真尺寸（天花→钉住点 387 世界单位），
// 取景空出四成，故按真实包围盒重取。
const PLANS: readonly SolidLayout[] = [
  { key: 'merged', label: '并拢', gapX: 0, gapZ: 16.5, pivot: { x: 45, y: 200, z: 0 }, camScale: 1.0, home: 'side' },
  { key: 'spread', label: '分列', gapX: 80, gapZ: 0, pivot: { x: 400, y: 205, z: 0 }, camScale: 0.76, home: 'axon' },
];

export function SkinSplitBench({
  active = true,
  onLight = false,
  controls = true,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
}) {
  const units = useMemo<readonly SolidUnitDef[]>(
    () => buildSplitLevels().map(({ spec, opts, smooth }) => ({ spec, opts, smooth })),
    [],
  );

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={units}
      rate={RATE}
      depth={DEPTH}
      layouts={PLANS}
      ceiling="span"
      rail="fixed"
      hud={{
        kicker: 'Lab.12 / Project II',
        title: '捏分过渡 · 单箱裂成两台',
        sub: `10 级 · 每台高 ${SPLIT_LOBE}px · 终态缝 ${SPLIT_SEAM}px · 逐级独立设计的键谱`,
        hint: '左 = 单箱，右 = 两台 · 缝逐级豁开 · 并拢/分列可切 · 拖拽旋转',
        aria: '捏分过渡：十条织物带从单个方箱逐级过渡到分开的两个平台，面上的缝一级比一级张得更开、最后裂到芯上；每一级是单独设计的键谱，可拖拽旋转',
      }}
    />
  );
}
