'use client';

import { useEffect, useMemo, useState } from 'react';
import { COMBO_PLAN_OPTIONS, COMBO_SPACING_OPTIONS } from '../../src/lib/space/lab-variants';
import { RING } from '../../src/lib/space/skin-ring';
import { RING_GRID_AXON, RING_GRID_PIVOT_Y, RIG_SCALE, RIG_Y } from '../../src/lib/space/skin-grid';
import {
  COMBO_FORMS,
  COMBO_PLANS,
  comboBridges,
  comboBuild,
  comboCamScale,
  comboCells,
  comboFormDefs,
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
 * Lab 2-11 · 单元组合（用户 2026-09-17 草图立项：「研究不同形状的单元组合来形成不同的效果，
 * 比如通道型、共同构造的平台型、密闭空间型」）。
 *
 * Lab 2-8 把同一种单元摆成几种关系；这台把**不同形状**的单元摆在一列，问它们合起来读成什么。
 * 形态词汇五个：目录四形态 + 捏分（Lab 2-5 捏分编制的 j0，自带 338 节的带子）。三种组合按草图给
 * 默认形态（通道 = 直挑台·直挑台·捏分·直挑台 / 平台 = 直挑台·蘑菇 / 密闭 = 捏分·捏分），
 * **每个槽位的形态现场可换**——这台的仪器就是换形状看效果；间距 / 织物网 / 读法全在
 * src/lib/space/unit-combo.ts 推出来（线稿脚本与这里共用一份），这里只接线。
 *
 * 引擎与摆放分开（Lab 2-9 起的做法）：一种形态只解一条引擎、摆到用它的每个槽位；换形态走
 * `unitsKey` 重建，换距离只重摆（`cellsKey` → reflowCells，同一次收缩两种看法）。
 * 房间固定用 Lab 2-7 那一间（Lab 2-8 的拍板），取景按整列 + 一圈留距推进。
 */
const FORMS = comboFormDefs();
const DEFAULT_PLAN: ComboPlanKey = 'passage';
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
  const [slots, setSlots] = useState<readonly number[]>(comboPlan(DEFAULT_PLAN).slots);
  // `/lab#lab2-11-enclosure` 直达某个组合
  useEffect(() => {
    const k = planFromHash(
      '2-11',
      COMBO_PLAN_OPTIONS.map((p) => p.key),
    );
    if (k) {
      setPlan(k);
      setSlots(comboPlan(k).slots);
    }
  }, []);

  const choosePlan = (k: ComboPlanKey): void => {
    setPlan(k);
    setSlots(comboPlan(k).slots); // 换组合 = 回到草图给的默认形态
  };
  const setSlot = (i: number, f: number): void => setSlots((s) => s.map((v, j) => (j === i ? f : v)));

  const build = useMemo(() => comboBuild(slots, FORMS), [slots]);
  const units = useMemo<readonly SolidUnitDef[]>(
    () => build.units.map(({ spec, opts, smooth }) => ({ spec, opts, smooth })),
    [build],
  );
  const cells = useMemo(() => (r: number) => comboCells(slots, r, spacing), [slots, spacing]);
  const scene = useMemo(() => (r: number) => comboScene(slots, r, spacing), [slots, spacing]);
  const bridges = useMemo(() => comboBridges(slots, spacing), [slots, spacing]);
  const met = comboMetrics(slots, RING.RADIUS_DEF, spacing);
  const P = comboPlan(plan);
  const en = lang === 'en';
  const names = slots.map((f) => (en ? COMBO_FORMS[f].en : COMBO_FORMS[f].zh)).join(en ? ' · ' : '·');
  const sp = COMBO_SPACING_OPTIONS.find((s) => s.key === spacing)!;
  const reading = comboReading(slots, RING.RADIUS_DEF, spacing, lang);
  const relLine = en
    ? `${P.en}: ${names} · ${spacing === 'touch' ? 'touching' : 'apart'} · ${met.lengthM.toFixed(2)} m end to end${reading ? ` · ${reading}` : ''}`
    : `${P.zh}：${names} · ${sp.label} · 总长 ${met.lengthM.toFixed(2)} m${reading ? ` · ${reading}` : ''}`;

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={units}
      ringPlans={build.plans}
      // 引擎只跟「用到哪几种形态」走：四个直挑台 + 一个捏分 = 两条；换距离不重解
      unitsKey={build.planForm.map((f) => COMBO_FORMS[f].key).join('+')}
      // 站位跟槽位与距离走：只重摆（同一次收缩，相切 / 分离两种看法）
      cellsKey={`${plan}:${slots.join('')}:${spacing}`}
      ring
      cells={cells}
      bridges={bridges}
      rig={{ scale: RIG_SCALE, y: RIG_Y }}
      scene={scene}
      camScaleFor={(r, v) => comboCamScale(slots, r, spacing, v)}
      radius={{ min: RING.RADIUS_MIN, max: RING.RADIUS_MAX, def: RING.RADIUS_DEF }}
      depth={RING.DEPTH}
      thick={RING.THICK}
      skin={{ def: 0.25 }}
      ceiling="ring"
      rail="fixed"
      rate={units.length > 1 ? 80 : 110}
      pivot={{ x: 0, y: RING_GRID_PIVOT_Y, z: 0 }}
      camScale={comboCamScale(comboPlan(DEFAULT_PLAN).slots, RING.RADIUS_DEF, DEFAULT_SPACING, 'axon')}
      axon={RING_GRID_AXON}
      extraControls={
        <>
          <div className="grp">
            <span className="k">编制</span>
            <span className="seg">
              {COMBO_PLAN_OPTIONS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={p.key === plan ? 'active' : undefined}
                  title={`${COMBO_PLANS.find((q) => q.key === p.key)!.zh} · ${COMBO_PLANS.find((q) => q.key === p.key)!.en}（回到草图的默认形态）`}
                  onClick={() => choosePlan(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </span>
          </div>
          {slots.map((f, i) => (
            <div className="grp" key={`slot-${i}`}>
              <span className="k">槽 {i + 1}</span>
              <span className="seg">
                {COMBO_FORMS.map((F, j) => (
                  <button
                    key={F.key}
                    type="button"
                    className={j === f ? 'active' : undefined}
                    title={`${F.zh} · ${F.en}`}
                    onClick={() => setSlot(i, j)}
                  >
                    {F.short}
                  </button>
                ))}
              </span>
            </div>
          ))}
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
              title: 'Compositions',
              sub: relLine,
              hint: 'Composition / form per slot / spacing switchable · spacing re-places, no re-solve · radius drives the pitch · drag to orbit',
              aria:
                'Compositions: a row of two to four contracting-skin cylinder rings of different forms hung in a room — ledges, bulbs, stepped boxes, pockets and split units — placed edge to edge or apart, reading as a passage, a shared platform or an enclosure; a 1.7 m figure stands on the floor for scale.',
            }
          : {
              kicker: 'Lab 2-11 / Project II',
              title: '单元组合 · 不同形状合起来是什么',
              sub: relLine,
              hint: '编制 / 每槽形态 / 距离可切 · 换距离不重解 · 半径连间距一起变 · 拖拽旋转',
              aria:
                '单元组合：二到四个形态各异的收缩张紧外皮圆筒环排成一列吊在一间房里——直挑台、蘑菇挑台、阶梯方箱、袋与捏分，边贴边或分离摆放，读作通道、共用的平台或密闭的腔；地上站着一个 1.7 米高的人作比例参考；可切编制、每个槽位的形态、距离与半径，可拖拽旋转',
            }
      }
    />
  );
}
