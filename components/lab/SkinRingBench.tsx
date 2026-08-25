'use client';

import { useMemo, useState } from 'react';
import {
  RING,
  RING_DEFAULT_FORM,
  RING_WAVE,
  buildRingOrder,
  buildRingUnits,
  buildWaveOrder,
  buildWaveUnits,
} from '../../src/lib/space/skin-ring';
import { GRAD_LEVELS, buildGradientOrder, buildRingGradient } from '../../src/lib/space/skin-ring-gradient';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.09 · 圆筒环列（用户 2026-08-23 立项：「把每一个单元再收窄 0.5 倍，
 * 然后把表皮向外偏移一点然后复制 20 个围成一圈，形成一个圆筒，
 * 这个圆筒收缩就可以形成一个环形平台」）。
 *
 * 三种编制，控制条上切：
 * - **一圈起伏**（默认，用户 2026-08-23「一圈的形状 从低到高再到低一圈下来」）=
 *   同一种键谱、每个位置一个不同的 lead（形状在带上的高度，2px/节）⇒ 环沿圆周升上去
 *   再回来，读成一段绕筒的螺旋台阶。形状一个数没变（实测偏差 0.000–0.026），
 *   变的只有高度；「形态」四按钮在这一档照样有效。见 skin-ring.ts 的 RING_WAVE。
 * - **整环同形** = 二十条同一种键谱、同一高度（用户纠偏：「我要选用一种形状形成一个
 *   连续的环形平台」）。只解一条引擎、摆二十处。
 * - **一圈渐变** = 蘑菇挑台 → 阶梯方箱 → 蘑菇挑台，一个来回在一圈里走完
 *   （线稿对照后定的端点与级数）。20 位回文 ⇒ 11 级键谱；见 skin-ring-gradient.ts。
 *
 * 台架整台复用 SkinSolidBench（引擎与摆放分开 + 环列 + 圆环板天花 + 半径滑块 +
 * 换键谱就地重建），零第二份实现。渐变要解十一条引擎，推进速率随之降到 80（同 Lab.08）。
 *
 * 机位：轴测俯角比另外两台大（−0.45），一圈才读得出是圈；顶视是这台的主视角。
 */
const FORMS = buildRingUnits();
const RING_ORDER = buildRingOrder();
const GRAD_ORDER = buildGradientOrder(RING.COUNT);
const GRAD_UNITS: readonly SolidUnitDef[] = buildRingGradient().map(({ spec, opts, smooth }) => ({
  spec,
  opts,
  smooth,
}));

const PLANS = [
  { key: 'wave', label: '一圈起伏' },
  { key: 'single', label: '整环同形' },
  { key: 'gradient', label: '一圈渐变' },
] as const;
const WAVE_ORDER = buildWaveOrder();
type PlanKey = (typeof PLANS)[number]['key'];

export function SkinRingBench({
  active = true,
  onLight = false,
  controls = true,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
}) {
  const [plan, setPlan] = useState<PlanKey>('wave');
  const [form, setForm] = useState(RING_DEFAULT_FORM);
  const def = FORMS[form];
  const grad = plan === 'gradient';
  const wave = plan === 'wave';
  const singleUnits = useMemo<readonly SolidUnitDef[]>(
    () => [{ spec: def.spec, opts: def.opts, smooth: def.smooth }],
    [def],
  );
  // 起伏：同一张键谱搬到 11 个不同的 lead 上（形状不变，只是高度不同）
  const waveUnits = useMemo<readonly SolidUnitDef[]>(
    () => buildWaveUnits(def).map(({ spec, opts, smooth }) => ({ spec, opts, smooth })),
    [def],
  );

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={grad ? GRAD_UNITS : wave ? waveUnits : singleUnits}
      order={grad ? GRAD_ORDER : wave ? WAVE_ORDER : RING_ORDER}
      unitsKey={grad ? 'gradient' : `${plan}:${def.key}`}
      rate={grad || wave ? 80 : 110}
      ring
      radius={{ min: RING.RADIUS_MIN, max: RING.RADIUS_MAX, def: RING.RADIUS_DEF }}
      depth={RING.DEPTH}
      thick={RING.THICK}
      ceiling="ring"
      // 灰立杆是房间的固定结构，不跟着外皮缩（用户 2026-08-23：起点始终和天花板
      // 在一起、尾端固定在现在固定的位置）——Lab.06–08 仍是「轨即芯」的旧读法
      rail="fixed"
      pivot={{ x: 0, y: 166, z: 0 }}
      camScale={0.95}
      axon={{ pitch: -0.45, yaw: -0.62 }}
      extraControls={
        <>
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
          <div className="grp" style={grad ? { opacity: 0.35 } : undefined}>
            <span className="k">形态</span>
            <span className="seg">
              {FORMS.map((f, i) => (
                <button
                  key={f.key}
                  type="button"
                  className={!grad && i === form ? 'active' : undefined}
                  disabled={grad}
                  title={grad ? '渐变编制下由 11 级键谱决定' : `${f.zh} · ${f.en}`}
                  onClick={() => setForm(i)}
                >
                  {f.zh}
                </button>
              ))}
            </span>
          </div>
        </>
      }
      hud={{
        kicker: 'Lab.09 / Project II',
        title: '圆筒环列 · 收缩成环形平台',
        sub: grad
          ? `${RING.COUNT} 条窄带 · 蘑菇挑台 → 阶梯方箱 → 蘑菇挑台 · ${GRAD_LEVELS} 级键谱`
          : wave
            ? `${RING.COUNT} 条窄带 · ${def.zh} · 高度沿圆周起伏 · ${RING_WAVE.LEVELS} 级`
            : `${RING.COUNT} 条窄带 · 同一键谱：${def.zh} · 同一收缩协议`,
        hint: '编制 / 形态 / 半径可调 · 顶视看环 · 拖拽旋转',
        aria: '圆筒环列：二十条窄织物带围成一圈，收缩后各自扣出挑台、连成绕筒一圈的环形平台；可切整环同形或一圈渐变，形态与半径可调，可拖拽旋转',
      }}
    />
  );
}
