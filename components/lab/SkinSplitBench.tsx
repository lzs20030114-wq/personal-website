'use client';

import { useMemo } from 'react';
import { SPLIT_LOBE, SPLIT_SEAM, buildSplitLevels } from '../../src/lib/space/skin-split';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

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
      // 间距按 Lab.08 十二条带的口径：结构本身只 ~44px 深，密排才读得出逐级挪动；
      // 机位随之（十条带的行宽 720 世界单位 vs Lab.08 的 880）
      gapX={80}
      ceiling="span"
      rail="fixed"
      pivot={{ x: 382, y: 280, z: 0 }}
      camScale={0.60}
      hud={{
        kicker: 'Lab.12 / Project II',
        title: '捏分过渡 · 单箱裂成两台',
        sub: `10 级 · 每台高 ${SPLIT_LOBE}px · 终态缝 ${SPLIT_SEAM}px · 逐级独立设计的键谱`,
        hint: '左 = 单箱，右 = 两台 · 缝逐级豁开 · 拖拽旋转',
        aria: '捏分过渡：十条织物带从单个方箱逐级过渡到分开的两个平台，面上的缝一级比一级张得更开、最后裂到芯上；每一级是单独设计的键谱，可拖拽旋转',
      }}
    />
  );
}
