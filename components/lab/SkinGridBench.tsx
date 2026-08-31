'use client';

import { useMemo, useState } from 'react';
import { RING, buildRingUnits } from '../../src/lib/space/skin-ring';
import {
  FIGURE,
  MM_PER_UNIT,
  RING_GRID,
  RING_GRID_AXON,
  RING_GRID_DEFAULT_FORM,
  RING_GRID_PIVOT_Y,
  RIG_SCALE,
  RIG_Y,
  ROOM,
  ringOuter,
  ringGridCamScale,
  ringGridCells,
  ringGridPlans,
  ringGridScene,
  type RingGridMode,
} from '../../src/lib/space/skin-grid';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.10 · 4×4 环阵列。
 *
 * 用户 2026-08-25 纠偏：「我指的阵列是 4×4 的，每一个单元都是那个环形的，
 * 而不是 4×4 个小单元。」——首版（十六个单条带铺成平面网格）已作废，这里是
 * **十六个 Lab.09 那种圆筒环**站成一片场地：每格一个环，收缩后各自扣出一圈环形平台。
 *
 * 同轮拍板：格距跟着半径滑块走 · 每个环各自独立（不挤成一片）· 编制两档。
 * 间距与视野的推导全在 src/lib/space/skin-grid.ts，这里只接线。
 *
 * 环本身一个数没改——`buildRingUnits()` 与 Lab.09 同一份（RING_LEAD 96 的三段构造、
 * 20 条带、带深 7.8、厚度 3）。变的只有「这个环被复制到哪些站位」。
 *
 * 机位：枢轴与 Lab.09 同（阵列以原点居中 ⇒ 枢轴不随半径动），camScale 由
 * ringGridCamScale 随半径算——半径拉大时整片阵列一起变大，相机得跟着退。
 */
const FORMS = buildRingUnits();
const FORM_UNITS: readonly SolidUnitDef[] = FORMS.map(({ spec, opts, smooth }) => ({
  spec,
  opts,
  smooth,
}));

const PLANS = [
  { key: 'uniform', label: '整片同形' },
  { key: 'perRow', label: '每行一种' },
] as const;

export function SkinGridBench({
  active = true,
  onLight = false,
  controls = true,
  ptTarget = false,
  lang = 'zh',
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
  /** 案例页主图位：转场落点 */
  ptTarget?: boolean;
  /** HUD 语言——案例页有中英切换，主图只能有一份，故由外层壳读语言再传进来 */
  lang?: 'zh' | 'en';
}) {
  const [mode, setMode] = useState<RingGridMode>('uniform');
  const [form, setForm] = useState(RING_GRID_DEFAULT_FORM);
  const perRow = mode === 'perRow';
  const def = FORMS[form];

  // 整片同形只把选中的那一种传进去 ⇒ 全场一条引擎；每行一种传四条
  const units = useMemo<readonly SolidUnitDef[]>(
    () => (perRow ? FORM_UNITS : [{ spec: def.spec, opts: def.opts, smooth: def.smooth }]),
    [perRow, def],
  );
  const plans = useMemo(() => ringGridPlans(mode), [mode]);
  const cells = useMemo(() => (r: number) => ringGridCells(r, mode), [mode]);

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={units}
      ringPlans={plans}
      unitsKey={perRow ? 'perRow' : `uniform:${def.key}`}
      ring
      cells={cells}
      rig={{ scale: RIG_SCALE, y: RIG_Y }}
      scene={ringGridScene}
      camScaleFor={ringGridCamScale}
      radius={{ min: RING.RADIUS_MIN, max: RING.RADIUS_MAX, def: RING.RADIUS_DEF }}
      depth={RING.DEPTH}
      thick={RING.THICK}
      skin={{ def: 0.35 }}
      ceiling="ring"
      rail="fixed"
      rate={perRow ? 80 : 110}
      pivot={{ x: 0, y: RING_GRID_PIVOT_Y, z: 0 }}
      camScale={ringGridCamScale(RING.RADIUS_DEF, 'axon')}
      axon={RING_GRID_AXON}
      extraControls={
        <>
          <div className="grp">
            <span className="k">编制</span>
            <span className="seg">
              {PLANS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={p.key === mode ? 'active' : undefined}
                  onClick={() => setMode(p.key)}
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
      ptTarget={ptTarget}
      hud={
        lang === 'en'
          ? {
              kicker: 'Lab.10 / Project II',
              title: 'Sixteen rings, one floor',
              sub: `${RING_GRID.COLS}×${RING_GRID.ROWS} rings · ${perRow ? 'one bond map per row' : `one bond map: ${def.en}`} · platform ⌀${((2 * ringOuter(RING.RADIUS_DEF) * RIG_SCALE * MM_PER_UNIT) / 1000).toFixed(2)} m · room ${((ROOM.FLOOR_Y * MM_PER_UNIT) / 1000).toFixed(2)} m high`,
              hint: `Plan / form switchable · radius drives the pitch · top view reads the grid · drag to orbit · figure ${(FIGURE.MM / 1000).toFixed(2)} m for scale`,
              aria:
                'Sixteen contracting-skin cylinder rings hung in a room on a square grid; each contracts into a ring platform. A 1.7 m figure stands on the floor for scale. Pitch follows the radius slider; the plan can be switched and the view orbited.',
            }
          : {
              kicker: 'Lab.10 / Project II',
              title: '4×4 环阵列 · 一片场地',
              sub: `${RING_GRID.COLS}×${RING_GRID.ROWS} 个环 · ${perRow ? '每行一种键谱' : `同一键谱：${def.zh}`} · 平台 ⌀${((2 * ringOuter(RING.RADIUS_DEF) * RIG_SCALE * MM_PER_UNIT) / 1000).toFixed(2)} m · 房高 ${((ROOM.FLOOR_Y * MM_PER_UNIT) / 1000).toFixed(2)} m`,
              hint: `编制 / 形态可切 · 半径滑块连格距一起变 · 顶视看排布 · 拖拽旋转 · 人 ${(FIGURE.MM / 1000).toFixed(2)} m 作比例`,
              aria:
                '4×4 环阵列：十六个收缩张紧外皮圆筒环吊在一间房里铺成平面网格，每个环收缩后扣出一圈环形平台；地上站着一个 1.7 米高的人作比例参考；格距随半径滑块算，可切整片同形或每行一种形态，可拖拽旋转',
            }
      }
    />
  );
}
