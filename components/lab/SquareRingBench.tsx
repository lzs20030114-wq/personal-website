'use client';

import { useMemo, useState } from 'react';
import {
  SQUARE,
  SQUARE_MORPH,
  SQUARE_PHASE,
  SQUARE_RUNGS,
  SQUARE_TIERS,
  SQUARE_GRID,
  SQUARE_WAVE,
  buildSquareOrder,
  buildSquareUnits,
  buildSquareWave,
  squareCellPitch,
  squareCornerRadius,
  squareGridCells,
  squareGridSpan,
  squareHalfSide,
  squareMorphExp,
  squareMorphReach,
  squareMorphTiers,
  type SquareTier,
} from '../../src/lib/space/skin-square';
import {
  SQSPLIT,
  buildSquareSplitOrder,
  buildSquareSplitUnits,
  sqSplitHalfSide,
} from '../../src/lib/space/skin-square-split';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.14 · 方形环（用户 2026-08-30 立项：「我想试试看能不能做出来正方形 长方形的，
 * 就是靠外延的长度来做形状」，拍板「只有向外扩展的横向维度被压缩，高度之类的都不变」）。
 *
 * 筒芯仍是圆的，靠每条带**挑出多远**把俯视外轮廓凑成正方形：相位转半格 ⇒ 四条带
 * 正落在四个角上 ⇒ 二十个平台外缘点全部落在方形的边上，而环间膜俯视是弦线，
 * 同一条边上两点之间的弦就是那条边本身。三档深度（面 8 / 边 8 / 角 4）+ 一圈恒定
 * 的箱高 36px：解三条引擎摆二十处，物理开销与 Lab.09 同量级。
 *
 * 键谱与几何全在 skin-square.ts（线稿脚本与站上共用一份）；台架整台复用
 * SkinSolidBench，本轮只给它加了一个相位偏移 prop（默认 0 ⇒ Lab.07–10 逐位不变）。
 *
 * 两处与 Lab.09 不同，都是这一族的定义带来的：
 * - **半径钉死**（不给滑块）：三档的目标深度是「方形极径 − 站位半径」的绝对量，
 *   R 一变方形就不成立，得整套重标。
 * - **顶视是主视角**：方形要俯视才读得出来，故默认机位就是顶视。
 */
const strip = (d: { spec: SolidUnitDef['spec']; opts: SolidUnitDef['opts']; smooth: SolidUnitDef['smooth'] }): SolidUnitDef => ({
  spec: d.spec,
  opts: d.opts,
  smooth: d.smooth,
});
const FLAT_ORDER = buildSquareOrder();

/**
 * 五个轮廓档各自的引擎（圆那一档三个方位类的深度相同 ⇒ 只解一条，order 重映射）。
 * 全是键谱数据，不跑仿真，模块加载期算完即可。
 */
const flatOf = (tiers: readonly SquareTier[]) => {
  const uniq: SquareTier[] = [];
  const idx = tiers.map((t) => {
    let i = uniq.findIndex((q) => q.k === t.k);
    if (i < 0) {
      i = uniq.length;
      uniq.push(t);
    }
    return i;
  });
  return { units: buildSquareUnits(uniq).map(strip), order: FLAT_ORDER.map((c) => idx[c]) };
};

const MORPH = Array.from({ length: SQUARE_MORPH.STEPS }, (_, s) => {
  const tiers = squareMorphTiers(s);
  const wave = buildSquareWave(tiers);
  return {
    tiers,
    reach: squareMorphReach(s),
    n: squareMorphExp(s),
    flat: flatOf(tiers),
    wave: { units: wave.units.map(strip), order: wave.order },
  };
});

/**
 * 捏分编制（用户 2026-09-01 拍板：收方形小一圈 · 缝 12 · 边档 t=0.5 · 角档实心箱）。
 * 一圈四个来回：… 边 面 面 边 │ 角 │ …，而俯视轮廓仍是方的（边长 152px）。
 * 谱与几何全在 skin-square-split.ts（线稿脚本与站上共用一份）；这里只取数据。
 */
const SPLIT = {
  units: buildSquareSplitUnits().map(strip),
  order: buildSquareSplitOrder(),
  side: Math.round(2 * sqSplitHalfSide()),
};

const PLANS = [
  { key: 'flat', label: '整环平' },
  { key: 'wave', label: '一圈起伏' },
  { key: 'split', label: '捏分' },
] as const;
type PlanKey = (typeof PLANS)[number]['key'];

const LAYOUTS = [
  { key: 'single', label: '单环' },
  { key: 'grid', label: `${SQUARE_GRID.COLS}×${SQUARE_GRID.ROWS}` },
] as const;
type LayoutKey = (typeof LAYOUTS)[number]['key'];

/** 阵列的格子（不随半径变——方形按固定半径标定，故这个函数忽略入参） */
const CELLS = squareGridCells();
const cellsOf = () => CELLS;
/** 单环时框角点直径，阵列时框整片占宽 ⇒ 取景按两者之比缩 */
const SINGLE_SCALE = 0.95;
const GRID_SCALE = (SINGLE_SCALE * (2 * squareCornerRadius())) / squareGridSpan();

/** HUD 双语：/lab 说中文（默认），案例页正文里的活件跟着页面的中英切换走 */
const HUD = {
  zh: {
    title: '方形环 · 靠挑出的长度做形状',
    circle: (d: number) => `圆 ⌀${d}px`,
    square: (side: number) => `方 · 边长 ${side}px`,
    round: (n: string, d: number) => `圆角方 n=${n} · 角点 ⌀${d}px`,
    grid: (c: number, r: number, pitch: string, outline: string, wave: boolean) =>
      `${c}×${r} 片平台 · 格距 ${pitch}px（边对边最紧）· ${outline}${wave ? ' · 一圈起伏' : ''}`,
    wave: (n: number, swing: number, levels: number, outline: string) =>
      `${n} 条窄带 · 三档深度不变 · 高度沿圆周起伏 ${swing}px · ${levels} 级 · ${outline}`,
    flat: (n: number, reach: string, h: number, outline: string) =>
      `${n} 条窄带 · 三档深度 ${reach}px · 箱高恒定 ${h}px · ${outline}`,
    split: (n: number, h: number, side: number) =>
      `${n} 条窄带 · 一圈四个来回：单箱 → 开缝 → 裂成两台 → 合拢 · 箱高仍恒定 ${h}px · 方 · 边长 ${side}px`,
    splitHint: (rungs: number) =>
      `面 8 裂开 · 边 8 开一半 · 角 4 实心箱 · 每条带 ${rungs} 挡 · 轴测看裂开 · 顶视看方形 · 拖拽旋转`,
    hint: (tiers: string, rungs: number, wave: boolean) =>
      `${tiers} · 每条带 ${rungs} 挡 · ${wave ? '俯视看轮廓 · 侧看起伏' : '顶视看轮廓'} · 拖拽旋转`,
    aria: '方形环：二十条窄织物带围成一圈，每条带按自己在方形里的位置挑出不同长度，收缩后二十个挑台连成一圈俯视为正方形的平台；箱高一圈恒定，可拖拽旋转',
  },
  en: {
    title: 'A square ring — the plan is made of reach',
    circle: (d: number) => `a circle, ⌀${d} px`,
    square: (side: number) => `a square, side ${side} px`,
    round: (n: string, d: number) => `a rounded square, n=${n} · corners ⌀${d} px`,
    grid: (c: number, r: number, pitch: string, outline: string, wave: boolean) =>
      `${c}×${r} platforms · pitch ${pitch} px, set edge to edge · ${outline}${wave ? ' · undulating' : ''}`,
    wave: (n: number, swing: number, levels: number, outline: string) =>
      `${n} narrow bands · depths unchanged · height swings ${swing} px once around · ${levels} levels · ${outline}`,
    flat: (n: number, reach: string, h: number, outline: string) =>
      `${n} narrow bands · three depths ${reach} px · box ${h} px high everywhere · ${outline}`,
    split: (n: number, h: number, side: number) =>
      `${n} narrow bands · four round trips: one box, a notch, two shelves, closed again · still ${h} px high everywhere · a square, side ${side} px`,
    splitHint: (rungs: number) =>
      `8 split · 8 half-open · 4 solid at the corners · ${rungs} rungs on every band · the split reads from the side, the plan from above · drag to orbit`,
    hint: (tiers: string, rungs: number, wave: boolean) =>
      `${tiers} · ${rungs} rungs on every band · ${wave ? 'plan from above, swing from the side' : 'read the plan from above'} · drag to orbit`,
    aria:
      'Twenty narrow fabric bands stand in a ring; each reaches out a different distance according to where it sits in the plan, so once contracted the twenty shelves join into one platform that reads as a square from above. The box is the same height the whole way round.',
  },
} as const;

export function SquareRingBench({
  active = true,
  onLight = false,
  controls = true,
  lang = 'zh',
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
  lang?: 'en' | 'zh';
}) {
  const T = HUD[lang];
  const side = useMemo(() => Math.round(2 * squareHalfSide()), []);
  const [plan, setPlan] = useState<PlanKey>('flat');
  const [layout, setLayout] = useState<LayoutKey>('single');
  const [shape, setShape] = useState<number>(SQUARE_MORPH.DEF);
  const wave = plan === 'wave';
  const split = plan === 'split';
  const grid = layout === 'grid';
  const m = MORPH[shape];
  const order = split ? SPLIT.order : wave ? m.wave.order : m.flat.order;
  /** 这一档的轮廓怎么念（圆 / 圆角方 / 方） */
  const outline =
    shape === 0
      ? T.circle(Math.round(2 * (SQUARE.RADIUS + m.reach[0])))
      : shape === SQUARE_MORPH.STEPS - 1
        ? T.square(side)
        : T.round(m.n.toFixed(1), Math.round(2 * (SQUARE.RADIUS + m.reach[2])));
  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={split ? SPLIT.units : wave ? m.wave.units : m.flat.units}
      order={order}
      unitsKey={`${plan}:${layout}:${split ? 'sq' : shape}`}
      // 捏分是**竖向**特征（两片台夹一道缝），顶视投影里根本不出现 ⇒ 换编制时换机位。
      // 走 view prop 而不是 layouts[].home：home 在主 effect（[]-deps）挂载时读取，
      // 换编制不会重取（§14.4 记过的闭包坑）
      view={split ? 'axon' : 'top'}
      // 膜：整环平要它把二十条糊成闭合的筒（0.35）；捏分要看见那道缝，故调低到 0.15
      // （Lab.13 捏分环同款理由与同款数）。**顶视的方形在捏分档读不出来**——环间膜按
      // 节点下标配对，而捏分档共享的那个下标是「缝底」（x=0）、平档那里是「箱尖」，
      // 于是角带的尖被连到邻带的缝底、膜整片往里凹成花瓣。调不透明度救不回来（实测），
      // 要改膜的配对规则（skin-solid 的几何），是单独一轮的活。故这一档看点在轴测/侧视。
      skinValue={split ? 0.15 : 0.35}
      // 起伏要解十一条引擎（平档只有三条）⇒ 推进速率随之降，同 Lab.08/09 渐变的做法。
      // **阵列不加负担**：十六格是同一份顶点摆十六处（gl3d 的摆放表），物理仍是那几条带
      rate={wave ? 80 : 110}
      cells={grid ? cellsOf : undefined}
      ringPlans={grid ? [order] : undefined}
      ring
      angleOffset={SQUARE_PHASE}
      // 量程为零 = 滑块不出（方形是按这个半径标定的）
      radius={{ min: SQUARE.RADIUS, max: SQUARE.RADIUS, def: SQUARE.RADIUS }}
      depth={SQUARE.DEPTH}
      thick={SQUARE.THICK}
      skin={{ def: 0.35 }}
      ceiling="ring"
      rail="fixed"
      // 单份排布（≥2 份才出「排列」切换）；默认机位取**顶视**——这一族的卖点就是
      // 俯视是方的，轴测的俯仰压缩会把方形读成菱形。home 是排布级的属性，故走 layouts
      layouts={[
        {
          key: 'square',
          label: '',
          gapX: 0,
          gapZ: 0,
          pivot: { x: 0, y: 166, z: 0 },
          camScale: grid ? GRID_SCALE : SINGLE_SCALE,
          home: 'top',
        },
      ]}
      camScaleFor={() => (grid ? GRID_SCALE : SINGLE_SCALE)}
      axon={{ pitch: -0.45, yaw: -0.62 }}
      extraControls={
        <>
          <div className="grp">
            <span className="k">轮廓</span>
            <span className="seg">
              {SQUARE_MORPH.LABELS.map((lb, i) => (
                <button
                  key={lb}
                  type="button"
                  className={!split && i === shape ? 'active' : undefined}
                  // 捏分下变灰：「缝只能在面档最深、角档为零」是**方形专有**的材料账推论，
                  // 而圆那一档三个方位类挑出相同、没有几何依据（Lab.09 渐变同款做法）
                  disabled={split}
                  onClick={() => setShape(i)}
                >
                  {lb}
                </button>
              ))}
            </span>
          </div>
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
          <div className="grp">
            <span className="k">排布</span>
            <span className="seg">
              {LAYOUTS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  className={l.key === layout ? 'active' : undefined}
                  onClick={() => setLayout(l.key)}
                >
                  {l.label}
                </button>
              ))}
            </span>
          </div>
        </>
      }
      hud={{
        kicker: 'Lab.14 / Project II',
        title: T.title,
        sub: split
          ? T.split(SQUARE.COUNT, SQSPLIT.H, SPLIT.side)
          : grid
            ? T.grid(SQUARE_GRID.COLS, SQUARE_GRID.ROWS, squareCellPitch().toFixed(0), outline, wave)
            : wave
              ? T.wave(SQUARE.COUNT, (SQUARE_WAVE.LOW - SQUARE_WAVE.HIGH) * 2, SQUARE_WAVE.LEVELS, outline)
              : T.flat(SQUARE.COUNT, m.reach.map((r) => r.toFixed(0)).join(' / '), SQUARE.H, outline),
        hint: split
          ? T.splitHint(SQUARE_RUNGS)
          : T.hint(
              SQUARE_TIERS.map((t, i) => `${lang === 'zh' ? t.name : t.en} ${t.count}·k${m.tiers[i].k}`).join(' · '),
              SQUARE_RUNGS,
              wave,
            ),
        aria: T.aria,
      }}
    />
  );
}
