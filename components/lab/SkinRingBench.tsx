'use client';

import { useEffect, useMemo, useState } from 'react';
import { RING_PLANS, type RingPlanKey } from '../../src/lib/space/lab-variants';
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
import { RING_BAND_NODES } from '../../src/lib/space/skin-ring';
import {
  SPLIT_RING_BAND,
  SPLIT_RING_COUNT,
  SPLIT_RING_LOBE,
  SPLIT_RING_TARGET,
  SPLIT_RING_W_END,
  buildSplitRingOrder,
  buildSplitRingUnits,
} from '../../src/lib/space/skin-split-ring';
import { planFromHash } from './planHash';
import { SkinSolidBench, type SolidUnitDef } from './SkinSolidBench';

/**
 * Lab.10 · 圆筒环（原 Lab.09，2026-08-23 用户立项：「把每一个单元再收窄 0.5 倍，
 * 然后把表皮向外偏移一点然后复制 20 个围成一圈，形成一个圆筒，
 * 这个圆筒收缩就可以形成一个环形平台」）。
 *
 * 四种编制，控制条第一层上切（2026-09-03 收纳：原 Lab.13 捏分环并入为第四种——
 * 两台参数几乎同一份：同半径量程、圆环板天花、固定立杆、同带深与厚度、同轴测机位）：
 * - **一圈起伏**（默认，用户 2026-08-23「一圈的形状 从低到高再到低一圈下来」）=
 *   同一种键谱、每个位置一个不同的 lead（形状在带上的高度，2px/节）⇒ 环沿圆周升上去
 *   再回来，读成一段绕筒的螺旋台阶。形状一个数没变（实测偏差 0.000–0.026），
 *   变的只有高度；「形态」四按钮在这一档照样有效。见 skin-ring.ts 的 RING_WAVE。
 * - **整环同形** = 二十条同一种键谱、同一高度（用户纠偏：「我要选用一种形状形成一个
 *   连续的环形平台」）。只解一条引擎、摆二十处。
 * - **一圈渐变** = 蘑菇挑台 → 阶梯方箱 → 蘑菇挑台，一个来回在一圈里走完
 *   （线稿对照后定的端点与级数）。20 位回文 ⇒ 11 级键谱；见 skin-ring-gradient.ts。
 * - **捏分** = 原 Lab.13（用户 2026-08-30「做那种环形的，20 个从形态 1 到 2 再到 1」；
 *   2026-09-03 用户「圆形的捏分中间的空间还没做」后对齐到方形捏分的三轮拍板）：
 *   一次循环 · 变高（台高钉死 16、缝从 0 张到 100、总高等步 132 → 32）· 居中（缝心一圈恒定）·
 *   一圈等挑出（十条引擎全按面类深度标定 ⇒ 俯视是圆）。构造逐字复用 skin-square-split，
 *   编制是 20 位镜像（skin-split-ring.ts：10 对配 20 位有精确解）。
 *
 * 台架整台复用 SkinSolidBench（引擎与摆放分开 + 环列 + 圆环板天花 + 半径滑块 +
 * 换键谱就地重建），零第二份实现。多引擎的编制（渐变 11 条、起伏 11 条、捏分 10 条）
 * 推进速率降到 80。
 *
 * 捏分与另三档的三处差别全走 SkinSolidBench 既有的响应式钩子（Lab.14 先例）：
 * 蒙皮默认 0.35 → 0.15（一圈同形时膜把二十条糊成闭合的筒是目的；捏分的看点是沿圆周
 * 的过渡，膜太厚会把二十条各自的形糊掉）· 枢轴 y 与取景按带长等比（捏分的带子 338 比
 * 环族的 202 长——深缝要材料，与 Lab.11 平档 305 → 捏分 338 同一笔账；装置更高、
 * 天花不动、平台落得更低，枢轴按带长跟着走，取景按带长缩一次）。
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
const WAVE_ORDER = buildWaveOrder();
let splitCache: { units: readonly SolidUnitDef[]; order: readonly number[] } | null = null;
const splitRing = () =>
  (splitCache ??= (() => {
    const levels = buildSplitRingUnits();
    return {
      units: levels.map(({ spec, opts, smooth }) => ({ spec, opts, smooth })),
      order: buildSplitRingOrder(levels.length),
    };
  })());

/** 取景（编制级）：捏分按带长等比（SquareRingBench 同一做法：装置在画面里占的地方不变，不是重新构图） */
const PIVOT_Y = 166;
const CAM_SCALE = 0.95;
const TALL = SPLIT_RING_BAND / RING_BAND_NODES;
const PIVOT_Y_SPLIT = Math.round(PIVOT_Y * TALL);
const CAM_SCALE_SPLIT = CAM_SCALE / TALL;

export function SkinRingBench({
  active = true,
  onLight = false,
  controls = true,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
}) {
  const [plan, setPlan] = useState<RingPlanKey>('wave');
  const [form, setForm] = useState(RING_DEFAULT_FORM);
  // `/lab#lab10-split` 直达捏分（合并进来的编制没有自己的卡片与锚点，这是它的 URL 入口）
  useEffect(() => {
    const k = planFromHash(
      '10',
      RING_PLANS.map((p) => p.key),
    );
    if (k) setPlan(k);
  }, []);
  const def = FORMS[form];
  const grad = plan === 'gradient';
  const wave = plan === 'wave';
  const split = plan === 'split';
  /** 形态按钮只在同形／起伏下有意义；渐变与捏分由各自的级表决定，留位变灰不隐藏 */
  const formLocked = grad || split;
  const singleUnits = useMemo<readonly SolidUnitDef[]>(
    () => [{ spec: def.spec, opts: def.opts, smooth: def.smooth }],
    [def],
  );
  // 起伏：同一张键谱搬到 11 个不同的 lead 上（形状不变，只是高度不同）
  const waveUnits = useMemo<readonly SolidUnitDef[]>(
    () => buildWaveUnits(def).map(({ spec, opts, smooth }) => ({ spec, opts, smooth })),
    [def],
  );
  const units = split ? splitRing().units : grad ? GRAD_UNITS : wave ? waveUnits : singleUnits;
  const order = split ? splitRing().order : grad ? GRAD_ORDER : wave ? WAVE_ORDER : RING_ORDER;

  return (
    <SkinSolidBench
      active={active}
      onLight={onLight}
      controls={controls}
      units={units}
      order={order}
      unitsKey={split ? 'split' : grad ? 'gradient' : `${plan}:${def.key}`}
      rate={plan === 'single' ? 110 : 80}
      ring
      radius={{ min: RING.RADIUS_MIN, max: RING.RADIUS_MAX, def: RING.RADIUS_DEF }}
      depth={RING.DEPTH}
      thick={RING.THICK}
      skin={{ def: 0.35 }}
      skinValue={split ? 0.15 : 0.35}
      pivotY={split ? PIVOT_Y_SPLIT : PIVOT_Y}
      camScaleFor={() => (split ? CAM_SCALE_SPLIT : CAM_SCALE)}
      ceiling="ring"
      // 灰立杆是房间的固定结构，不跟着外皮缩（用户 2026-08-23：起点始终和天花板
      // 在一起、尾端固定在现在固定的位置）——Lab.06–08 仍是「轨即芯」的旧读法
      rail="fixed"
      pivot={{ x: 0, y: PIVOT_Y, z: 0 }}
      camScale={CAM_SCALE}
      axon={{ pitch: -0.45, yaw: -0.62 }}
      extraControls={
        <>
          <div className="grp">
            <span className="k">编制</span>
            <span className="seg">
              {RING_PLANS.map((p) => (
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
          <div className="grp" style={formLocked ? { opacity: 0.35 } : undefined}>
            <span className="k">形态</span>
            <span className="seg">
              {FORMS.map((f, i) => (
                <button
                  key={f.key}
                  type="button"
                  className={!formLocked && i === form ? 'active' : undefined}
                  disabled={formLocked}
                  title={
                    grad
                      ? '渐变编制下由 11 级键谱决定'
                      : split
                        ? '捏分编制下由 10 级键谱决定'
                        : `${f.zh} · ${f.en}`
                  }
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
        title: split ? '圆筒环 · 捏分 · 一圈里裂开再合上' : '圆筒环 · 收缩成环形平台',
        sub: split
          ? `${SPLIT_RING_COUNT} 条窄带 · 一圈一个来回：一侧两片台隔 ${SPLIT_RING_W_END}px → 对面合成一块 · 台高钉死 ${SPLIT_RING_LOBE}px · 挑出 ${SPLIT_RING_TARGET}`
          : grad
            ? `${RING.COUNT} 条窄带 · 蘑菇挑台 → 阶梯方箱 → 蘑菇挑台 · ${GRAD_LEVELS} 级键谱`
            : wave
              ? `${RING.COUNT} 条窄带 · ${def.zh} · 高度沿圆周起伏 · ${RING_WAVE.LEVELS} 级`
              : `${RING.COUNT} 条窄带 · 同一键谱：${def.zh} · 同一收缩协议`,
        hint: split
          ? `缝心一圈恒定、两台各升降一半 · 10 条引擎摆二十处 · 侧看两台分开 · 编制 / 半径可调 · 拖拽旋转`
          : '编制 / 形态 / 半径可调 · 顶视看环 · 拖拽旋转',
        aria: '圆筒环：二十条窄织物带围成一圈，收缩后各自扣出挑台、连成绕筒一圈的环形平台；可切一圈起伏、整环同形、一圈渐变或捏分，形态与半径可调，可拖拽旋转',
      }}
    />
  );
}
