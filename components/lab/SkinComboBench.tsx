'use client';

import { useEffect, useMemo, useState } from 'react';
import { COMBO_PLAN_OPTIONS, COMBO_SPACING_OPTIONS } from '../../src/lib/space/lab-variants';
import { RING } from '../../src/lib/space/skin-ring';
import { RING_GRID_AXON, RING_GRID_PIVOT_Y, RIG_SCALE, RIG_Y } from '../../src/lib/space/skin-grid';
import {
  COMBO_DEFAULT_FORM,
  comboBridges,
  comboBuild,
  comboCamScale,
  comboCells,
  comboForms,
  comboMetrics,
  comboPlan,
  comboReading,
  comboScene,
  type ComboPlanKey,
  type ComboSpacingKey,
} from '../../src/lib/space/unit-combo';
import { planFromHash } from './planHash';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab 2-11 · 单元组合（用户 2026-09-17 草图立项；2026-09-20 纠偏为「同一种平台一圈起伏，几个单元首尾相接、
 * 接缝处接高接低」，并确认「这个思路是对的」）。
 *
 * 一个单元 = Lab 2-5 那种圆筒环 + 一圈起伏编制（同一张键谱、每条带一个 lead）。每个单元两个旋钮：
 * 相位（峰朝哪条带）与高度段（用量程的哪一段）；几个单元相切，接缝处两家各是什么高度就是「接高接低」。
 * 预设 = 线稿里用户看过的五种接法：台阶（同相）· 续坡（下半段接上半段）· 三段坡 · 凹（谷对谷）· 拱（峰对峰）；
 * 用户的图形到了按同一套字段追加进 unit-combo.ts 的 COMBO_PLANS。
 *
 * 引擎与摆放分开：用到的每个 lead 一条引擎（续坡两段共用中间那个），每个单元一份编制（二十条带各指自己的 lead）；
 * 换接法 / 形态走 `unitsKey` 重建，换距离只重摆（`cellsKey`）。接缝织物网从「朝向对方的那条带」的外缘拉过去
 * （SkinSolidBench 本轮加的读法，同谱环逐位不变），落差大的接缝网就是一道斜坡。
 */
const FORMS = comboForms();
const DEFAULT_PLAN: ComboPlanKey = 'ramp';
const DEFAULT_SPACING: ComboSpacingKey = 'touch';

export function SkinComboBench({
  active = true,
  onLight = false,
  controls = true,
  lang = 'zh',
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
  lang?: 'zh' | 'en';
}) {
  const [plan, setPlan] = useState<ComboPlanKey>(DEFAULT_PLAN);
  const [spacing, setSpacing] = useState<ComboSpacingKey>(DEFAULT_SPACING);
  const [form, setForm] = useState(COMBO_DEFAULT_FORM);
  // `/lab#lab2-11-valley` 直达某种接法
  useEffect(() => {
    const k = planFromHash(
      '2-11',
      COMBO_PLAN_OPTIONS.map((p) => p.key),
    );
    if (k) setPlan(k);
  }, []);

  const P = comboPlan(plan);
  const def = FORMS[form];
  const build = useMemo(() => comboBuild(P, def), [P, def]);
  const units = useMemo<readonly SolidUnitDef[]>(
    () => build.units.map(({ spec, opts, smooth }) => ({ spec, opts, smooth })),
    [build],
  );
  const cells = useMemo(() => (r: number) => comboCells(P, form, r, spacing), [P, form, spacing]);
  const scene = useMemo(() => (r: number) => comboScene(P, form, r, spacing), [P, form, spacing]);
  const bridges = useMemo(() => comboBridges(P, spacing), [P, spacing]);
  const met = comboMetrics(P, form, RING.RADIUS_DEF, spacing);
  const en = lang === 'en';
  const sp = COMBO_SPACING_OPTIONS.find((s) => s.key === spacing)!;
  const reading = comboReading(P, form, RING.RADIUS_DEF, spacing, lang);
  const relLine = en
    ? `${P.en} · ${P.units.length} units of ${def.en} · ${spacing === 'touch' ? 'touching' : 'apart'} · pitch ${met.pitchM.toFixed(2)} m · ${reading}`
    : `${P.zh} · ${P.units.length} 个${def.zh} · ${sp.label} · 芯心距 ${met.pitchM.toFixed(2)} m · ${reading}`;

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={units}
      ringPlans={build.plans}
      // 引擎只跟「形态 + 用到哪些 lead」走：换距离不重解
      unitsKey={`${def.key}:${build.leads.join(',')}:${build.plans.length}`}
      // 站位跟接法 / 形态 / 距离走：只重摆（同一次收缩，相切 / 分离两种看法）
      cellsKey={`${plan}:${def.key}:${spacing}`}
      ring
      cells={cells}
      bridges={bridges}
      rig={{ scale: RIG_SCALE, y: RIG_Y }}
      scene={scene}
      camScaleFor={(r, v) => comboCamScale(P, form, r, spacing, v)}
      radius={{ min: RING.RADIUS_MIN, max: RING.RADIUS_MAX, def: RING.RADIUS_DEF }}
      depth={RING.DEPTH}
      thick={RING.THICK}
      skin={{ def: 0.35 }}
      ceiling="ring"
      rail="fixed"
      rate={80}
      pivot={{ x: 0, y: RING_GRID_PIVOT_Y, z: 0 }}
      camScale={comboCamScale(comboPlan(DEFAULT_PLAN), COMBO_DEFAULT_FORM, RING.RADIUS_DEF, DEFAULT_SPACING, 'axon')}
      axon={RING_GRID_AXON}
      extraControls={
        <>
          <div className="grp">
            <span className="k">接法</span>
            <span className="seg">
              {COMBO_PLAN_OPTIONS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={p.key === plan ? 'active' : undefined}
                  title={`${comboPlan(p.key).zh} · ${comboPlan(p.key).en}`}
                  onClick={() => setPlan(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </span>
          </div>
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
          <div className="grp">
            <span className="k">距离</span>
            <span className="seg">
              {COMBO_SPACING_OPTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={s.key === spacing ? 'active' : undefined}
                  title={s.key === 'touch' ? '平台边贴边（按挑出峰值）' : '再加 Lab 2-7 的环间缝'}
                  onClick={() => setSpacing(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </span>
          </div>
        </>
      }
      hud={
        en
          ? {
              kicker: 'Lab 2-11 / Project II',
              title: 'Joined platforms',
              sub: relLine,
              hint: 'Join / form / spacing switchable · spacing re-places, no re-solve · radius drives the pitch · drag to orbit',
              aria:
                'Joined platforms: two or three contracting-skin cylinder rings with undulating platforms hung in a room, placed edge to edge so that the high side of one meets the low or high side of the next — a step, a ramp, a hollow or an arch; a 1.7 m figure stands on the floor for scale.',
            }
          : {
              kicker: 'Lab 2-11 / Project II',
              title: '单元组合 · 起伏平台首尾相接',
              sub: relLine,
              hint: '接法 / 形态 / 距离可切 · 换距离不重解 · 半径连间距一起变 · 拖拽旋转',
              aria:
                '单元组合：两三个带起伏平台的收缩张紧外皮圆筒环吊在一间房里，边贴边摆放，让一个的高处接上下一个的低处或高处——读作台阶、坡、凹处或拱；地上站着一个 1.7 米高的人作比例参考；可切接法、形态、距离与半径，可拖拽旋转',
            }
      }
    />
  );
}
