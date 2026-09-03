'use client';

import { useMemo, useState } from 'react';
import {
  DUAL_MID,
  DUAL_MID_EXACT,
  DUAL_MID_MIN,
  DUAL_MID_OPTIONS,
  buildDualDisplay,
} from '../../src/lib/space/skin-dual';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.08 · 双结构带（原 Lab.11，2026-09-03 收纳后编号 08：Ⅰ 单元 · 一条带。
 * 用户 2026-08-26 草图立项「条可以出现两个结构的」，
 * 线稿拍板后上 3D）。
 *
 * 引擎零新增：五条带全是 Lab.06 那套 2D 剖面引擎（站方修正全套），一条带 =
 * 五段谱 [贴合|自由A|贴合|自由B|贴合]，两条拉链各自独立（构造与解耦推导见
 * src/lib/space/skin-dual.ts）。台架整台复用 SkinSolidBench——五条带沿 X 排开、
 * 通长天花、剖口梯挡，与 Lab.07 同一种立体呈现。
 *
 * 结构间距（中间贴合段节数）是待拍板的手感量，照 Lab.05 转速滑块的先例做成
 * 控件而不是替用户定死：16 = 草图的紧凑 · 29 = 逐位解耦下限 · 48 = 拉开读。
 * 切换走 setUnits 就地重建（unitsKey），不重挂 WebGL 上下文。
 */
const RATE = 100; // 五条 194 节的带同推，比 Lab.07（四条短带）略降

const MID_TITLES: Record<number, string> = {
  [DUAL_MID_MIN]: '紧凑（草图间距；合法下限——无一条约束跨两个结构）',
  [DUAL_MID_EXACT]: '逐位解耦下限：拿掉一个结构，另一个逐位不变',
  48: '拉开读（两结构远隔）',
};

export function SkinDualBench({
  active = true,
  onLight = false,
  controls = true,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
}) {
  const [mid, setMid] = useState<number>(DUAL_MID);
  const units = useMemo<readonly SolidUnitDef[]>(
    () => buildDualDisplay({ mid }).map(({ spec, opts, smooth }) => ({ spec, opts, smooth })),
    [mid],
  );

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={units}
      unitsKey={`mid:${mid}`}
      rate={RATE}
      gapX={150}
      ceiling="span"
      // 机位按全程运动包络定（scripts/skin-dual/envelope.mjs）：三档间距的最长带
      // （mid=48，带长 218 节）也全程在画内，四边余量 ≥53px（轴测深度偏移 ≤32px）
      pivot={{ x: 315, y: 190, z: 0 }}
      camScale={0.88}
      extraControls={
        <div className="grp">
          <span className="k">间距</span>
          <span className="seg">
            {DUAL_MID_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                className={m === mid ? 'active' : undefined}
                title={MID_TITLES[m]}
                onClick={() => setMid(m)}
              >
                {m}
              </button>
            ))}
          </span>
        </div>
      }
      hud={{
        kicker: 'Lab.08 / Project II',
        title: '双结构带 · 一条带两个结构',
        sub: `5 条带 · 每条两个键谱、两条拉链各自独立 · 同一收缩协议`,
        hint: '四种同形对 + 一条混排 · 间距三档 · 拖拽旋转',
        aria: '双结构带：五条织物带各自带着上下两个键谱，一次收缩同时折出两个结构；四种同形对加一条蘑菇与直挑台的混排，结构间距三档可切，可拖拽旋转',
      }}
    />
  );
}
