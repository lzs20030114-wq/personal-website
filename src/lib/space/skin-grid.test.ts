import { beforeAll, describe, expect, it } from 'vitest';
import {
  PEAK_REACH,
  RING_GRID_VIEW_K,
  ringGridViewFit,
  RING_GAP_RATIO,
  RING_GRID,
  RING_GRID_COUNT,
  RING_GRID_DEFAULT_FORM,
  ringCellGap,
  ringCellPitch,
  ringGridCamScale,
  ringGridCells,
  ringGridPlans,
  ringGridSpan,
  ringOuter,
} from './skin-grid';
import { RING, buildRingUnits, ringGap } from './skin-ring';
import { SKIN, createSkinUnit } from './skin-unit';

/**
 * 守门：Lab.10 4×4 环阵列（用户 2026-08-25 纠偏成「十六个环」，并拍板
 * 格距跟着半径滑块走 / 每个环各自独立 / 编制两档）。卡的就是这几条规则本身：
 * ① 格距真的按**全程**膨胀峰值算（只看终态会偏小）；
 * ② 环与环之间的空地明显大于环内带间缝——「每个环都独立」的硬约束，且全量程成立；
 * ③ 格距与取景确实随半径动；④ 站位与编制对得上；⑤ 环本身与 Lab.09 是同一份。
 */
const RADII = [RING.RADIUS_MIN, RING.RADIUS_DEF, 50, 70, RING.RADIUS_MAX];

let PEAKS: { key: string; peak: number; peakAt: number; final: number }[] = [];
beforeAll(() => {
  PEAKS = buildRingUnits().map((d) => {
    const s = createSkinUnit(d.spec, d.opts);
    let peak = 0;
    let peakAt = 0;
    for (let k = 0; k < SKIN.STEPS; k++) {
      s.advance();
      let m = 0;
      for (let i = 0; i < s.n; i++) m = Math.max(m, s.px[i]);
      if (m * 100 > peak) {
        peak = m * 100;
        peakAt = k;
      }
    }
    let final = 0;
    for (let i = 0; i < s.n; i++) final = Math.max(final, s.px[i]);
    return { key: d.key, peak, peakAt, final: final * 100 };
  });
}, 120_000);

describe('skin-grid 4×4 环阵列', () => {
  it('外缘按**全程**膨胀峰值定——只看终态会偏小（阶梯方箱中途鼓得比终态大）', () => {
    const worst = Math.max(...PEAKS.map((p) => p.peak));
    expect(worst).toBeCloseTo(PEAK_REACH, 0); // 常量没跟实测漂开
    // 「必须按全程量」不是空话：至少有一种形态的过程峰值明显大于终态
    const box = PEAKS.find((p) => p.key === 'stepped')!;
    expect(box.peak).toBeGreaterThan(box.final + 2);
    expect(box.peakAt).toBeLessThan(900); // 峰值出现在收缩途中，不在终点
    // 外缘 = 芯上半径 + 峰值：四种形态全程都不越出去
    for (const p of PEAKS) expect(ringOuter(30) - 30, p.key).toBeGreaterThanOrEqual(p.peak);
  });

  it('每个环各自独立：环间空地明显大于环内平台外缘的带间缝，且全量程成立', () => {
    for (const r of RADII) {
      const inner = ringGap(ringOuter(r)); // 环内相邻两带在平台外缘的净缝
      const between = ringCellGap(r);
      expect(inner, `R=${r}`).toBeGreaterThan(0); // 环自己先不能互穿
      expect(between, `R=${r}`).toBeGreaterThan(inner); // 读作两个环之间的空地，不是环内的又一道缝
      expect(between / inner).toBeCloseTo(RING_GAP_RATIO, 6);
      // 格距 = 两个环的外缘 + 那道缝：邻居全程不互穿
      expect(ringCellPitch(r) - 2 * ringOuter(r)).toBeCloseTo(between, 6);
    }
  });

  it('格距与取景跟着半径滑块走（用户 2026-08-25 拍板）', () => {
    const pitches = RADII.map(ringCellPitch);
    const scales = RADII.map((r) => ringGridCamScale(r));
    for (let i = 1; i < RADII.length; i++) {
      expect(pitches[i], `R=${RADII[i]}`).toBeGreaterThan(pitches[i - 1]); // 半径大 → 格距大
      expect(scales[i], `R=${RADII[i]}`).toBeLessThan(scales[i - 1]); // 阵列变大 → 相机退
    }
    // 取景恒按整片占宽算 ⇒ 屏上占比不随半径漂
    const onScreen = RADII.map((r) => ringGridSpan(r) * ringGridCamScale(r));
    for (const v of onScreen) expect(v).toBeCloseTo(onScreen[0], 6);
  });

  it('取景：四个视角各自算，全量程都不裁边（顶视最苛刻）', () => {
    const views = Object.keys(RING_GRID_VIEW_K) as (keyof typeof RING_GRID_VIEW_K)[];
    for (const r of RADII)
      for (const v of views) {
        const used = ringGridCamScale(r, v);
        const fit = ringGridViewFit(r, v);
        expect(used, `${v} R=${r} 裁边`).toBeLessThanOrEqual(fit);
        // 也不能白留：余量控制在 15% 以内，否则画框里全是空地
        expect(used / fit, `${v} R=${r} 太空`).toBeGreaterThan(0.85);
      }
    // 顶视看的是整片地面（span 见方投进 520 高的画框），是四档里最苛刻的那个；
    // 一个数管四个的话不是裁掉两行就是两侧空出一大片（首版即此）
    for (const r of RADII) {
      expect(ringGridViewFit(r, 'top')).toBeLessThan(ringGridViewFit(r, 'axon'));
      expect(RING_GRID_VIEW_K.top).toBeLessThan(RING_GRID_VIEW_K.axon);
    }
    // 未知视角退回轴测，不炸
    expect(ringGridCamScale(RING.RADIUS_DEF, 'nope')).toBe(ringGridCamScale(RING.RADIUS_DEF, 'axon'));
  });

  it('十六格：以原点居中、行列间距 = 格距', () => {
    for (const r of [RING.RADIUS_DEF, RING.RADIUS_MAX]) {
      const cells = ringGridCells(r, 'uniform');
      expect(cells.length).toBe(RING_GRID_COUNT);
      expect(RING_GRID_COUNT).toBe(RING_GRID.COLS * RING_GRID.ROWS);
      const pitch = ringCellPitch(r);
      // 居中：两个方向的重心都在原点（枢轴才不用随半径动）
      expect(cells.reduce((a, c) => a + c.x, 0) / cells.length).toBeCloseTo(0, 9);
      expect(cells.reduce((a, c) => a + c.z, 0) / cells.length).toBeCloseTo(0, 9);
      // 行优先编号：同一行内列走 X、跨行走 Z
      for (let row = 0; row < RING_GRID.ROWS; row++)
        for (let col = 1; col < RING_GRID.COLS; col++) {
          const a = cells[row * RING_GRID.COLS + col - 1];
          const b = cells[row * RING_GRID.COLS + col];
          expect(b.x - a.x).toBeCloseTo(pitch, 6);
          expect(b.z).toBeCloseTo(a.z, 9);
        }
      for (let row = 1; row < RING_GRID.ROWS; row++)
        expect(cells[row * RING_GRID.COLS].z - cells[(row - 1) * RING_GRID.COLS].z).toBeCloseTo(pitch, 6);
      // 占宽 = 首末格中心距 + 两端各半个环
      const xs = cells.map((c) => c.x);
      expect(Math.max(...xs) - Math.min(...xs) + 2 * ringOuter(r)).toBeCloseTo(ringGridSpan(r), 6);
    }
  });

  it('编制：整片同形全场一条引擎；每行一种 = 行号，每种四格；环内不混形态', () => {
    const uni = ringGridPlans('uniform');
    expect(uni.length).toBe(1);
    expect(uni[0].length).toBe(RING.COUNT);
    expect(new Set(uni[0]).size).toBe(1); // 一圈一种形状才连得成平台（2026-08-23 拍板）
    const rows = ringGridPlans('perRow');
    expect(rows.length).toBe(RING_GRID.ROWS);
    rows.forEach((p, v) => {
      expect(p.length).toBe(RING.COUNT);
      expect(new Set(p)).toEqual(new Set([v])); // 每份编制里只有一条引擎
    });
    // 格子指向的编制：整片同形全指第 0 份；每行一种按行号，每行四格
    const flat = ringGridCells(RING.RADIUS_DEF, 'uniform');
    expect(new Set(flat.map((c) => c.plan))).toEqual(new Set([0]));
    const byRow = ringGridCells(RING.RADIUS_DEF, 'perRow');
    for (let row = 0; row < RING_GRID.ROWS; row++) {
      const inRow = byRow.filter((c) => c.plan === row);
      expect(inRow.length).toBe(RING_GRID.COLS);
      for (const c of inRow) expect(c.z).toBeCloseTo(byRow[row * RING_GRID.COLS].z, 9);
    }
  });

  it('环本身与 Lab.09 逐字同源——阵列只是把它复制到十六处', () => {
    const forms = buildRingUnits();
    expect(forms.length).toBe(4);
    expect(RING_GRID_DEFAULT_FORM).toBeLessThan(forms.length);
    // 编制长度 = 环上单元数：阵列没有偷偷改环的疏密
    for (const p of [...ringGridPlans('uniform'), ...ringGridPlans('perRow')])
      expect(p.length).toBe(RING.COUNT);
    // 每份编制指到的引擎都在 forms 范围内（每行一种用满四条）
    expect(new Set(ringGridPlans('perRow').map((p) => p[0]))).toEqual(new Set([0, 1, 2, 3]));
  });
});
