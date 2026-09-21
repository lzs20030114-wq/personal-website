'use client';

import { useEffect, useMemo, useState } from 'react';
import { COMBO_FAMILY_OPTIONS, COMBO_PLAN_OPTIONS, COMBO_SPACING_OPTIONS } from '../../src/lib/space/lab-variants';
import { RING } from '../../src/lib/space/skin-ring';
import { RING_GRID_AXON, RING_GRID_PIVOT_Y, RIG_SCALE, RIG_Y } from '../../src/lib/space/skin-grid';
import {
  COMBO_DEFAULT_FORM,
  COMBO_FAMILIES,
  comboBridges,
  comboBuild,
  comboCamScale,
  comboCells,
  comboFamilyRig,
  comboForms,
  comboMetrics,
  comboPlan,
  comboRate,
  comboReading,
  comboScene,
  type ComboFamilyKey,
  type ComboPlanKey,
  type ComboSpacingKey,
} from '../../src/lib/space/unit-combo';
import { planFromHash } from './planHash';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab 2-11 · 单元组合（用户 2026-09-17 草图立项；2026-09-20 纠偏为「同一种平台一圈起伏，几个单元首尾相接、
 * 接缝处接高接低」，确认「这个思路是对的」，并交来三张图形 + 要求「包括方单元版本」）。
 *
 * 单元两族：圆环（Lab 2-5 圆筒环 + 一圈起伏；捏分 = Lab 2-5 捏分编制）/ 方环（Lab 2-6 方形环 + 它自己的起伏；
 * 捏分 = Lab 2-6 一次循环，极点按邻居方向给）。每个起伏单元两个旋钮（峰朝哪条带、用量程的哪一段），
 * 捏分单元一个（缝口朝哪条带）。三张图形 = ① 坡降 · ② 升台 · ③ 合腔；另五种接法留作预设。
 * 站位 / 接缝读数 / 引擎去重全在 src/lib/space/unit-combo.ts（线稿脚本与这里共用一份），这里只接线。
 *
 * 引擎与摆放分开：一种键谱一个 lead 一条引擎（捏分十条一族只解一次），每个单元一份编制；换图形 / 族 / 形态走
 * `unitsKey` 重建，换距离只重摆（`cellsKey`）。换族时相位偏移（方环 9° 半格）与半径量程一起换——
 * SkinSolidBench 本轮把 angleOffset 改 ref、半径量程变了就复位（两处加法式，别的台架逐位不变）。
 */
const FORMS = comboForms();
const DEFAULT_PLAN: ComboPlanKey = 'descend';
const DEFAULT_FAMILY: ComboFamilyKey = 'round';
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
  const [fam, setFam] = useState<ComboFamilyKey>(DEFAULT_FAMILY);
  const [spacing, setSpacing] = useState<ComboSpacingKey>(DEFAULT_SPACING);
  const [form, setForm] = useState(COMBO_DEFAULT_FORM);
  // `/lab#lab2-11-enclose` 直达某张图形
  useEffect(() => {
    const k = planFromHash(
      '2-11',
      COMBO_PLAN_OPTIONS.map((p) => p.key),
    );
    if (k) setPlan(k);
  }, []);

  const P = comboPlan(plan);
  const def = FORMS[form];
  const rig = comboFamilyRig(fam);
  const build = useMemo(() => comboBuild(P, fam, def, form), [P, fam, def, form]);
  const units = useMemo<readonly SolidUnitDef[]>(
    () => build.units.map(({ spec, opts, smooth, seam }) => ({ spec, opts, smooth, seam })),
    [build],
  );
  const cells = useMemo(() => (r: number) => comboCells(P, fam, form, r, spacing), [P, fam, form, spacing]);
  const scene = useMemo(() => (r: number) => comboScene(P, fam, form, r, spacing), [P, fam, form, spacing]);
  const bridges = useMemo(() => comboBridges(P, fam, spacing), [P, fam, spacing]);
  const met = comboMetrics(P, fam, form, rig.radius.def, spacing);
  const en = lang === 'en';
  const famDef = COMBO_FAMILIES.find((f) => f.key === fam)!;
  const sp = COMBO_SPACING_OPTIONS.find((s) => s.key === spacing)!;
  const reading = comboReading(P, fam, form, rig.radius.def, spacing, lang);
  const unitWord = fam === 'round' ? (en ? `${def.en} rings` : def.zh) : en ? 'square rings' : '方环';
  const relLine = en
    ? `${P.en} · ${P.units.length} ${unitWord} · ${spacing === 'touch' ? 'touching' : 'apart'} · ${met.lengthM.toFixed(2)} m end to end · ${reading}`
    : `${P.zh} · ${P.units.length} 个${unitWord} · ${sp.label} · 总长 ${met.lengthM.toFixed(2)} m · ${reading}`;
  const hasWave = P.units.some((u) => u.kind === 'wave');

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={units}
      ringPlans={build.plans}
      // 引擎只跟「族 + 用到哪些引擎」走：换距离不重解
      unitsKey={`${fam}:${build.keys.join('|')}`}
      // 站位跟图形 / 族 / 形态 / 距离走：只重摆
      cellsKey={`${plan}:${fam}:${def.key}:${spacing}`}
      ring
      angleOffset={rig.angleOffset}
      cells={cells}
      bridges={bridges}
      rig={{ scale: RIG_SCALE, y: RIG_Y }}
      scene={scene}
      camScaleFor={(r, v) => comboCamScale(P, fam, form, r, spacing, v)}
      radius={rig.radius}
      depth={RING.DEPTH}
      thick={RING.THICK}
      skin={{ def: 0.35 }}
      ceiling="ring"
      rail="fixed"
      rate={comboRate(build.units)}
      pivot={{ x: 0, y: RING_GRID_PIVOT_Y, z: 0 }}
      camScale={comboCamScale(comboPlan(DEFAULT_PLAN), DEFAULT_FAMILY, COMBO_DEFAULT_FORM, RING.RADIUS_DEF, DEFAULT_SPACING, 'axon')}
      axon={RING_GRID_AXON}
      extraControls={
        <>
          <div className="grp">
            <span className="k">图形</span>
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
            <span className="k">单元</span>
            <span className="seg">
              {COMBO_FAMILY_OPTIONS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={f.key === fam ? 'active' : undefined}
                  title={f.key === 'round' ? '圆筒环（Lab 2-5）· 起伏量程 0.35 m · 半径可调' : '方形环（Lab 2-6）· 起伏量程 0.16 m · 半径按 30 标定'}
                  onClick={() => setFam(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </span>
          </div>
          <div className="grp">
            <span className="k">形态</span>
            <span className="seg">
              {FORMS.map((f, i) => {
                const dead = fam !== 'round' || !hasWave;
                return (
                  <button
                    key={f.key}
                    type="button"
                    className={i === form ? 'active' : undefined}
                    disabled={dead}
                    title={dead ? (fam !== 'round' ? '方环只有它自己的箱' : '这张图形没有起伏单元') : `${f.zh} · ${f.en}（只管圆环的起伏单元）`}
                    onClick={() => setForm(i)}
                  >
                    {f.zh}
                  </button>
                );
              })}
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
                  title={s.key === 'touch' ? '边贴边（按挑出峰值）' : '再加各族自己的环间缝'}
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
              hint: 'Figure / unit family / form / spacing switchable · spacing re-places, no re-solve · drag to orbit',
              aria:
                'Joined platforms: two or three contracting-skin rings — round or square, undulating or split — hung edge to edge in a room so that the high side of one meets the low or high side of the next: a descent onto a landing, a rise from a split unit’s shelf, two split units enclosing one cavity, a step, a ramp, a hollow, an arch; a 1.7 m figure stands on the floor for scale.',
            }
          : {
              kicker: 'Lab 2-11 / Project II',
              title: `单元组合 · ${famDef.zh}首尾相接`,
              sub: relLine,
              hint: '图形 / 单元 / 形态 / 距离可切 · 换距离不重解 · 拖拽旋转',
              aria:
                '单元组合：两三个收缩张紧外皮环——圆环或方环、起伏或捏分——边贴边吊在一间房里，让一个的高处接上下一个的低处或高处：坡降落到平台、从捏分缝口起坡升到高台、两个捏分缝口合成一个腔，以及台阶、坡、凹、拱；地上站着一个 1.7 米高的人作比例参考；可切图形、单元族、形态与距离，可拖拽旋转',
            }
      }
    />
  );
}
