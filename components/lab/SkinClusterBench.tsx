'use client';

import { useEffect, useMemo, useState } from 'react';
import { CLUSTER_PLAN_OPTIONS, CLUSTER_RELATION_OPTIONS } from '../../src/lib/space/lab-variants';
import { RING } from '../../src/lib/space/skin-ring';
import { RING_GRID_AXON, RING_GRID_PIVOT_Y, RIG_SCALE, RIG_Y } from '../../src/lib/space/skin-grid';
import {
  CLUSTER_DEFAULT_FORM,
  clusterCamScale,
  clusterCells,
  clusterForms,
  clusterLevelCount,
  clusterMetrics,
  clusterPlan,
  clusterPlans,
  clusterRelation,
  clusterScene,
  clusterUnits,
  overlapFeasible,
  overlapMargin,
  type ClusterPlanKey,
  type ClusterRelationKey,
} from '../../src/lib/space/unit-cluster';
import { planFromHash } from './planHash';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.13 · 单元关系（用户 2026-09-03 立项：「我们先命名一个环形的压缩表皮形成平台的结构叫做
 * 一个单元……研究几个单元比如两个或者三个四个九个单元之间可形成的关系」）。
 *
 * 一个单元 = Lab.10 那种圆筒环（构造与 Lab.12 同一份 `buildRingUnits`，一个数不改）。
 * 这台把 2 / 3 / 4 / 9 个单元摆进 Lab.12 那间房，关系五档（距离 × 高度里物理上成立的组合）：
 *   分离·齐平（= Lab.12 那种独立）· 相切·齐平（平台边贴边，读成一整片）·
 *   分离·错层 · 相切·错层（高度用起伏编制验过的 lead 量程等分）·
 *   交叠·错层（平台在平面上盖过去，一个从另一个底下穿过——只有不同高时成立）。
 * 间距 / 高差 / 可行性全在 src/lib/space/unit-cluster.ts 推出来（线稿脚本与这里共用一份），
 * 这里只接线。
 *
 * 引擎与摆放分开（Lab.09 起的做法）：几级高度就解几条引擎（同一张键谱搬到不同 lead 上，
 * 形状逐点不变），每格指向自己那一级。**换关系只重摆不重解**（`cellsKey` → reflowCells）：
 * 同一次收缩，分离 / 相切 / 交叠三种看法之间切换不倒带；级数或形态变了才走 `unitsKey` 重建。
 *
 * 交叠有物理门槛（高差要装下折叠体成形期的竖向跨度）：装不下的组合按钮变灰、留位不隐藏，
 * 当前若正停在交叠上则退到「相切·错层」——它是同一组高度、只是不盖过去。
 */
const FORMS = clusterForms();
const DEFAULT_PLAN: ClusterPlanKey = 'pair';
const DEFAULT_REL: ClusterRelationKey = 'touch';

export function SkinClusterBench({
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
  const [plan, setPlan] = useState<ClusterPlanKey>(DEFAULT_PLAN);
  const [rel, setRel] = useState<ClusterRelationKey>(DEFAULT_REL);
  const [form, setForm] = useState(CLUSTER_DEFAULT_FORM);
  // `/lab#lab13-nine` 直达某个编制
  useEffect(() => {
    const k = planFromHash(
      '13',
      CLUSTER_PLAN_OPTIONS.map((p) => p.key),
    );
    if (k) setPlan(k);
  }, []);

  const feasible = overlapFeasible(plan, form);
  /** 交叠装不下时退到相切·错层：同一组高度，只是不盖过去 */
  const relEff: ClusterRelationKey = rel === 'overlap' && !feasible ? 'touchStep' : rel;
  const def = FORMS[form];
  const levels = clusterLevelCount(plan, relEff);
  const units = useMemo<readonly SolidUnitDef[]>(
    () => clusterUnits(plan, relEff, def).map(({ spec, opts, smooth }) => ({ spec, opts, smooth })),
    [plan, relEff, def],
  );
  const ringPlans = useMemo(() => clusterPlans(levels), [levels]);
  const cells = useMemo(() => (r: number) => clusterCells(plan, relEff, form, r), [plan, relEff, form]);
  const scene = useMemo(() => (r: number) => clusterScene(plan, relEff, form, r), [plan, relEff, form]);
  const met = clusterMetrics(plan, relEff, form, RING.RADIUS_DEF);
  const P = clusterPlan(plan);
  const Rl = clusterRelation(relEff);
  const en = lang === 'en';

  const relLine = en
    ? `${P.n} rings · ${Rl.en} · pitch ${met.pitchM.toFixed(2)} m · platform ⌀${met.platformM.toFixed(2)} m${met.levels > 1 ? ` · ${met.levels} levels, ≥ ${met.stepM.toFixed(2)} m apart` : ''}${met.overlapM > 1e-6 ? ` · platforms overlap ${met.overlapM.toFixed(2)} m` : met.overlapM < -1e-6 ? ` · clear ${(-met.overlapM).toFixed(2)} m` : ' · edge to edge'}`
    : `${P.n} 个单元 · ${Rl.label} · 芯心距 ${met.pitchM.toFixed(2)} m · 平台 ⌀${met.platformM.toFixed(2)} m${met.levels > 1 ? ` · ${met.levels} 级，每级高差 ≥ ${met.stepM.toFixed(2)} m` : ''}${met.overlapM > 1e-6 ? ` · 平台盖过去 ${met.overlapM.toFixed(2)} m` : met.overlapM < -1e-6 ? ` · 空地 ${(-met.overlapM).toFixed(2)} m` : ' · 边贴边'}`;

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={units}
      ringPlans={ringPlans}
      // 引擎只跟形态与级数走：一对错层与方阵交叠都是两级 ⇒ 同一组引擎，换过去不重解
      unitsKey={`${def.key}:L${levels}`}
      // 站位跟关系走：换关系只重摆（同一次收缩三种看法）
      cellsKey={`${plan}:${relEff}:${def.key}`}
      ring
      cells={cells}
      rig={{ scale: RIG_SCALE, y: RIG_Y }}
      scene={scene}
      camScaleFor={(r, v) => clusterCamScale(plan, relEff, form, r, v)}
      radius={{ min: RING.RADIUS_MIN, max: RING.RADIUS_MAX, def: RING.RADIUS_DEF }}
      depth={RING.DEPTH}
      thick={RING.THICK}
      skin={{ def: 0.35 }}
      ceiling="ring"
      rail="fixed"
      rate={levels > 1 ? 80 : 110}
      pivot={{ x: 0, y: RING_GRID_PIVOT_Y, z: 0 }}
      camScale={clusterCamScale(DEFAULT_PLAN, DEFAULT_REL, CLUSTER_DEFAULT_FORM, RING.RADIUS_DEF, 'axon')}
      axon={RING_GRID_AXON}
      extraControls={
        <>
          <div className="grp">
            <span className="k">编制</span>
            <span className="seg">
              {CLUSTER_PLAN_OPTIONS.map((p) => (
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
          <div className="grp">
            <span className="k">关系</span>
            <span className="seg">
              {CLUSTER_RELATION_OPTIONS.map((r) => {
                const dead = r.key === 'overlap' && !feasible;
                return (
                  <button
                    key={r.key}
                    type="button"
                    className={r.key === relEff ? 'active' : undefined}
                    disabled={dead}
                    title={
                      dead
                        ? `${def.zh}在${P.zh}里装不下交叠：相邻两级高差比折叠体成形期的竖向跨度还小 ${(-overlapMargin(plan, form)).toFixed(0)} px（下层的平台要从上层底下穿过去）`
                        : r.label
                    }
                    onClick={() => setRel(r.key)}
                  >
                    {r.label}
                  </button>
                );
              })}
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
        </>
      }
      hud={
        en
          ? {
              kicker: 'Lab.13 / Project II',
              title: 'Between units',
              sub: relLine,
              hint: 'Cluster / relation / form switchable · switching the relation re-places without re-solving · radius drives the pitch · drag to orbit',
              aria:
                'Between units: two, three, four or nine contracting-skin cylinder rings hung in a room, placed apart, touching, stepped in height, or interleaved at two heights; a 1.7 m figure stands on the floor for scale.',
            }
          : {
              kicker: 'Lab.13 / Project II',
              title: '单元关系 · 几个单元能是什么关系',
              sub: relLine,
              hint: '编制 / 关系 / 形态可切 · 换关系只重摆不重解 · 半径滑块连间距一起变 · 拖拽旋转',
              aria:
                '单元关系：二、三、四或九个收缩张紧外皮圆筒环吊在一间房里，可分离、相切、错层或交叠摆放；地上站着一个 1.7 米高的人作比例参考；可切编制、关系、形态与半径，可拖拽旋转',
            }
      }
    />
  );
}
