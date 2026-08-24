'use client';

import { useMemo, useState } from 'react';
import {
  RING,
  RING_DEFAULT_FORM,
  buildRingOrder,
  buildRingUnits,
} from '../../src/lib/space/skin-ring';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.09 · 圆筒环列（用户 2026-08-23 立项：「把每一个单元再收窄 0.5 倍，
 * 然后把表皮向外偏移一点然后复制 20 个围成一圈，形成一个圆筒，
 * 这个圆筒收缩就可以形成一个环形平台」）。
 *
 * **一个环 = 二十条同一种键谱的带子**（用户当轮纠偏：「我要选用一种形状形成一个
 * 连续的环形平台」）。四种键谱做成控制条上的**形态选择**——切换即整环重解，
 * 不是一圈里混着摆。默认阶梯挑台方箱：顶面找平过，一圈连起来才像能站人的平台。
 *
 * 台架整台复用 SkinSolidBench（本轮为它加了「引擎与摆放分开」+ 环列 + 圆环板
 * 天花 + 半径滑块 + 换键谱重建），零第二份实现。编制与几何见
 * src/lib/space/skin-ring.ts：只解一条引擎、摆二十处（同谱同初值的解算逐位相同），
 * 半径是滑块（用户拍板现场调），带间的缝随半径变宽、用户已拍板接受。
 *
 * 机位：轴测俯角比另外两台大（−0.45），一圈才读得出是圈；顶视是这台的主视角。
 */
const FORMS = buildRingUnits();
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
  const [form, setForm] = useState(RING_DEFAULT_FORM);
  const def = FORMS[form];
  const units = useMemo<readonly SolidUnitDef[]>(
    () => [{ spec: def.spec, opts: def.opts, smooth: def.smooth }],
    [def],
  );

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={units}
      order={RING_ORDER}
      unitsKey={def.key}
      ring
      radius={{ min: RING.RADIUS_MIN, max: RING.RADIUS_MAX, def: RING.RADIUS_DEF }}
      depth={RING.DEPTH}
      thick={RING.THICK}
      ceiling="ring"
      pivot={{ x: 0, y: 166, z: 0 }}
      camScale={0.95}
      axon={{ pitch: -0.45, yaw: -0.62 }}
      extraControls={
        <div className="grp">
          <span className="k">形态</span>
          <span className="seg">
            {FORMS.map((f, i) => (
              <button
                key={f.key}
                type="button"
                className={i === form ? 'active' : undefined}
                title={`${f.zh} · ${f.en}`}
                onClick={() => setForm(i)}
              >
                {f.zh}
              </button>
            ))}
          </span>
        </div>
      }
      hud={{
        kicker: 'Lab.09 / Project II',
        title: '圆筒环列 · 收缩成环形平台',
        sub: `${RING.COUNT} 条窄带 · 同一键谱：${def.zh} · 同一收缩协议`,
        hint: '形态与半径可调 · 顶视看环 · 拖拽旋转',
        aria: '圆筒环列：二十条同一键谱的窄织物带围成一圈，收缩后各自扣出挑台、连成绕筒一圈的环形平台；形态与半径可调，可拖拽旋转',
      }}
    />
  );
}
