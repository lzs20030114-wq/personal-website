import { beforeAll, describe, expect, it } from 'vitest';
import { ARRAY_FREE, ARRAY_LEAD, ARRAY_TAIL } from './skin-array';
import { SKIN_UNITS } from './skin-data';
import {
  GRID,
  GRID_BAND_NODES,
  GRID_COUNT,
  GRID_GAP,
  PEAK_REACH,
  RAIL_OUT,
  buildGridOrder,
  buildGridUnits,
  gridGapX,
  gridGapZ,
} from './skin-grid';
import { SKIN, createSkinUnit, type SkinBond } from './skin-unit';

/**
 * 守门：Lab.10 4×4 阵列。用户只给了一条规则——「间距就是每个膨胀到最大的时候
 * 有一点点空隙就行」——所以这里卡的就是那条规则本身：
 * ① 间距真的是按**全程**膨胀峰值算的（只看终态会偏小）；
 * ② 两个方向的缝都是「一点点」且一样宽；③ 相邻单元全程不互穿。
 */
const UNITS = buildGridUnits();

let PEAKS: { key: string; peak: number; peakAt: number; final: number }[] = [];
beforeAll(() => {
  PEAKS = UNITS.map((d) => {
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
}, 60_000);

describe('skin-grid 4×4 阵列', () => {
  it('间距按**全程**膨胀峰值定——只看终态会偏小（阶梯方箱中途鼓得比终态大）', () => {
    const worst = Math.max(...PEAKS.map((p) => p.peak));
    expect(worst).toBeCloseTo(PEAK_REACH, 0); // 常量没跟实测漂开
    // 「必须按全程量」不是空话：至少有一种形态的过程峰值明显大于终态
    const overshoot = PEAKS.filter((p) => p.peak - p.final > 1);
    expect(overshoot.length).toBeGreaterThan(0);
    const box = PEAKS.find((p) => p.key === 'stepped')!;
    expect(box.peak).toBeGreaterThan(box.final + 2);
    expect(box.peakAt).toBeLessThan(900); // 峰值出现在收缩途中，不在终点
  });

  it('两个方向的缝都是「一点点」，而且一样宽', () => {
    const gx = gridGapX();
    const gz = gridGapZ();
    for (const g of [gx, gz]) {
      expect(g).toBeGreaterThanOrEqual(4);
      expect(g).toBeLessThanOrEqual(10);
    }
    expect(Math.abs(gx - gz)).toBeLessThanOrEqual(1);
    expect(GRID_GAP).toBeGreaterThan(0);
  });

  it('相邻单元全程不互穿：膨胀峰值 + 芯轨外伸仍小于间距', () => {
    const worst = Math.max(...PEAKS.map((p) => p.peak));
    expect(worst + RAIL_OUT).toBeLessThan(GRID.PITCH);
    expect(GRID.DEPTH).toBeLessThan(GRID.PITCH);
    // 间距按四种里最大的那个定 ⇒ 换形态不会重排，也不会撞上
    for (const p of PEAKS) expect(p.peak + RAIL_OUT, p.key).toBeLessThan(GRID.PITCH);
  });

  it('编制：整片同形 16 格同一条引擎；每行一种 = 行号，每种四格', () => {
    const u = buildGridOrder('uniform');
    expect(u.length).toBe(GRID_COUNT);
    expect(new Set(u).size).toBe(1);
    const r = buildGridOrder('perRow');
    expect(r.length).toBe(GRID_COUNT);
    for (let row = 0; row < GRID.ROWS; row++)
      for (let col = 0; col < GRID.COLS; col++) expect(r[row * GRID.COLS + col]).toBe(row);
    for (let k = 0; k < 4; k++) expect(r.filter((v) => v === k).length).toBe(GRID.COLS);
  });

  it('四条带与 Lab.08/09 同长，形态逐位取自站上原谱（只整体平移）', () => {
    expect(GRID_BAND_NODES).toBe(ARRAY_LEAD + ARRAY_FREE + ARRAY_TAIL);
    UNITS.forEach((d, i) => {
      expect(d.spec.reduce((s, seg) => s + seg[1], 0)).toBe(GRID_BAND_NODES);
      const src = SKIN_UNITS[i].spec[1];
      const dst = d.spec[1];
      if (src[0] !== 'f' || dst[0] !== 'f') throw new Error('自由段位置变了');
      const a: readonly SkinBond[] = src[2];
      const b: readonly SkinBond[] = dst[2];
      expect(b.length).toBe(a.length);
      const shift = b[0][0] - a[0][0];
      a.forEach(([x, y, rb], k) => {
        expect(b[k][0]).toBe(x + shift);
        expect(b[k][1]).toBe(y + shift);
        expect(b[k][2]).toBe(rb);
      });
    });
  });
});
