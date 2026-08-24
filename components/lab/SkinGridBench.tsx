'use client';

import { useMemo, useState } from 'react';
import { GRID, buildGridOrder, buildGridUnits } from '../../src/lib/space/skin-grid';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.10 · 4×4 阵列（用户 2026-08-23 立项：「一个 4×4 的阵列，间距就是每个膨胀到
 * 最大的时候有一点点空隙就行」）。
 *
 * 前面几台把单元排成一列（Lab.08）或一圈（Lab.09），这台把十六个单元铺进房间的
 * 平面网格。**间距是量出来的**：全程最大膨胀 52.0px + 芯轨外伸 5.8 + 留缝 6 = 64；
 * 带深取 58 让深度方向的缝也是 6（推导见 src/lib/space/skin-grid.ts）。
 *
 * 两种编制：**整片同形**（默认，十六格同一种键谱 ⇒ 解一条引擎画十六份）/
 * **每行一种**（行 0–3 = 袋 / 蘑菇挑台 / 直挑台 / 阶梯挑台，四条引擎，
 * 把目录当成一片场地来读）。
 *
 * 芯轨用固定立杆（rail="fixed"）：上端埋进天花、下端在钉住点——与 Lab.09 同一读法。
 * 天花用**每列一根梁**而不是整块板：整块板会把顶视全挡住，而顶视正是读间距的角度；
 * 梁只罩住芯轨那一档，膨胀体在梁之间露出来（单元本来也就是这么吊的）。
 */
const FORMS = buildGridUnits();
const UNIFORM_ORDER = buildGridOrder('uniform');
const PER_ROW_ORDER = buildGridOrder('perRow');
const PER_ROW_UNITS: readonly SolidUnitDef[] = FORMS.map(({ spec, opts, smooth }) => ({
  spec,
  opts,
  smooth,
}));

const PLANS = [
  { key: 'uniform', label: '整片同形' },
  { key: 'perRow', label: '每行一种' },
] as const;
type PlanKey = (typeof PLANS)[number]['key'];
/** 默认形态 = 蘑菇挑台：它正好在最大膨胀那一档，「刚好不挤上」的间距才读得出来 */
const DEFAULT_FORM = 1;

export function SkinGridBench({
  active = true,
  onLight = false,
  controls = true,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
}) {
  const [plan, setPlan] = useState<PlanKey>('uniform');
  const [form, setForm] = useState(DEFAULT_FORM);
  const def = FORMS[form];
  const perRow = plan === 'perRow';
  const uniformUnits = useMemo<readonly SolidUnitDef[]>(
    () => [{ spec: def.spec, opts: def.opts, smooth: def.smooth }],
    [def],
  );

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={perRow ? PER_ROW_UNITS : uniformUnits}
      order={perRow ? PER_ROW_ORDER : UNIFORM_ORDER}
      unitsKey={perRow ? 'perRow' : `uniform:${def.key}`}
      grid={GRID.COLS}
      gapX={GRID.PITCH}
      gapZ={GRID.PITCH}
      depth={GRID.DEPTH}
      thick={GRID.THICK}
      ceiling="beams"
      rail="fixed"
      pivot={{ x: 119, y: 169, z: 0 }}
      camScale={0.88}
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
          <div className="grp" style={perRow ? { opacity: 0.35 } : undefined}>
            <span className="k">形态</span>
            <span className="seg">
              {FORMS.map((f, i) => (
                <button
                  key={f.key}
                  type="button"
                  className={!perRow && i === form ? 'active' : undefined}
                  disabled={perRow}
                  title={perRow ? '每行一种编制下由行号决定' : `${f.zh} · ${f.en}`}
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
        kicker: 'Lab.10 / Project II',
        title: '4×4 阵列 · 一片单元',
        sub: perRow
          ? `${GRID.COLS}×${GRID.ROWS} · 每行一种键谱 · 间距 ${GRID.PITCH}（膨胀峰值 + 一点点缝）`
          : `${GRID.COLS}×${GRID.ROWS} · 同一键谱：${def.zh} · 间距 ${GRID.PITCH}（膨胀峰值 + 一点点缝）`,
        hint: '编制 / 形态可切 · 顶视看排布 · 拖拽旋转',
        aria: '4×4 阵列：十六个收缩张紧外皮单元铺成平面网格，间距按膨胀峰值加一点点空隙定；可切整片同形或每行一种形态，可拖拽旋转',
      }}
    />
  );
}
