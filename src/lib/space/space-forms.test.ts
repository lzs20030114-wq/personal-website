import { describe, expect, it } from 'vitest';
import { createSkinUnit, SKIN } from './skin-unit';
import { UNIT_DUAL_DEFS, UNIT_TIERS, UNITS_PER_M } from './cohabit-solid';
import { SQUARE_SCALE } from './cohabit';
import { RIG_SCALE } from './skin-grid';
import { vignetteLayout } from './cohabit-vignette';
import { COLUMN, PLAT_TOP_MAX, SF, STOW, blocksWalk, catReach, dual, emptyField, fill, plat, readSpace, standable } from './space-forms';

/** 跑完正向协议，量竖向尺寸（m，离钉住端） */
function measure(def: { spec: Parameters<typeof createSkinUnit>[0]; opts: Parameters<typeof createSkinUnit>[1] }) {
  const l = vignetteLayout(8);
  const mpp = (((RIG_SCALE * l.pitchM) / l.pitch4) * SQUARE_SCALE) / UNITS_PER_M;
  const u = createSkinUnit(def.spec, def.opts);
  const straight = Math.abs(u.py[0] - u.py[u.n - 1]) * 100 * mpp;
  for (let k = 0; k < SKIN.STEPS; k++) u.advance();
  const foot = u.py[u.n - 1];
  const h = (i: number) => Math.abs(u.py[i] - foot) * 100 * mpp;
  let reach = 0;
  for (let i = 0; i < u.n; i++) reach = Math.max(reach, u.px[i]);
  const outer: number[] = [];
  for (let i = 0; i < u.n; i++) if (u.px[i] > 0.5 * reach) outer.push(h(i));
  return { straight, span: h(0), top: Math.max(...outer), bottom: Math.min(...outer) };
}

describe('空间形态 · 单元的竖向尺寸（与引擎实测对得上）', () => {
  it('平台三档：台厚、台面离钉住端、成形后的高与 SF 对得上（三档台面差 5 mm 以内）', () => {
    for (const def of UNIT_TIERS) {
      const m = measure(def);
      expect(Math.abs(m.top - SF.PIN_BELOW)).toBeLessThan(0.005);
      expect(Math.abs(m.top - m.bottom - SF.PLATE)).toBeLessThan(0.002);
      expect(Math.abs(m.span - SF.SPAN_PLAT)).toBeLessThan(0.002);
    }
  }, 30_000);
  it('上下两块：成形后的高、布全部放下来的长度与 SF 对得上', () => {
    const m = measure(UNIT_DUAL_DEFS[0]);
    expect(Math.abs(m.span - SF.SPAN_DUAL)).toBeLessThan(0.002);
    expect(Math.abs(m.straight - SF.TUBE_LEN)).toBeLessThan(0.01);
    expect(Math.abs(m.top - SF.PIN_BELOW - SF.UPPER_ABOVE)).toBeLessThan(0.01);
  }, 30_000);
  it('台面能停的范围：0.23 到约 3.34 m', () => {
    expect(PLAT_TOP_MAX).toBeGreaterThan(3.3);
    expect(PLAT_TOP_MAX).toBeLessThan(3.4);
  });
});

describe('空间形态 · 读法', () => {
  it('全收着的空房间：64 格都能走、都从门走得到、没有台面', () => {
    const r = readSpace(emptyField(8));
    expect(r.floorCells).toBe(64);
    expect(r.reachCells).toBe(64);
    expect(r.pockets).toEqual([]);
    expect(r.enclosure).toBe(0);
    expect(r.levels).toBe(0);
    expect(r.catReachJump).toBe(0);
  });
  it('一圈齐腰的台围出一块走不到的空地', () => {
    const f = fill(emptyField(8), 1, 1, 4, 4, plat(1.05));
    fill(f, 2, 2, 3, 3, STOW);
    const r = readSpace(f);
    expect(r.pockets).toEqual([4]);
    expect(r.reachCells).toBe(64 - 16);
    expect(r.enclosure).toBeGreaterThan(0);
  });
  it('布筒不挡人从旁边过，但站不到它那一格中央；整台在 2 m 以上的低顶不挡人', () => {
    expect(blocksWalk(COLUMN)).toBe(false);
    expect(standable(COLUMN)).toBe(false);
    expect(blocksWalk(plat(2.25))).toBe(false);
    expect(blocksWalk(plat(1.9))).toBe(true);
    const r = readSpace(fill(emptyField(8), 2, 2, 4, 4, plat(2.25)));
    expect(r.coveredCells).toBe(9);
    expect(r.headHits).toBe(0);
    // 台面 2.20：台底 2.13 过了，台心下夹环 1.97 没过 = 碰头，不算低顶
    const low = readSpace(fill(emptyField(8), 2, 2, 2, 2, plat(2.2)));
    expect(low.coveredCells).toBe(0);
    expect(low.headHits).toBe(1);
    expect(readSpace(fill(emptyField(8), 0, 0, 0, 0, plat(2.0))).headHits).toBe(1);
    // 一排布筒：人从两边都走得到，但布筒那几格不算地面
    const col = readSpace(fill(emptyField(8), 0, 3, 7, 3, COLUMN));
    expect(col.floorCells).toBe(56);
    expect(col.reachCells).toBe(56);
    expect(col.pockets).toEqual([]);
  });
  it('一排斜坡首尾接齐：猫不用大跳就能一路走上去，连成一片', () => {
    const f = emptyField(8);
    [0.3, 0.69, 1.08].forEach((top, c) => (f.cells[3 * 8 + c] = plat(top, 0.39, 0)));
    const r = readSpace(f);
    expect(r.largestSurfaceUnits).toBe(3);
    expect(r.catReachHop).toBeCloseTo(1.47, 6);
  });
  it('上下两块之间 0.58 m：小跳上不去，一跳上得去', () => {
    const f = fill(emptyField(8), 3, 3, 3, 3, dual(0.42));
    expect(catReach(f, 0.5)).toBeCloseTo(0.42, 6);
    expect(catReach(f, 1.1)).toBeCloseTo(1.0, 6);
  });
});
