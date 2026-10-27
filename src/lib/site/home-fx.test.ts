import { describe, expect, it } from 'vitest';
import { FX, approach, splitDate, tiltAt, tiltCss, wedgeTarget } from './home-fx';

describe('方块场倾斜', () => {
  it('正对指针最大，越远越小，远到一定距离就不写样式', () => {
    const near = tiltAt(0, 0)!;
    const mid = tiltAt(FX.TILT_R * 0.8, 0)!;
    expect(near.rot).toBeCloseTo(FX.TILT_ROT);
    expect(Math.abs(mid.rot)).toBeLessThan(Math.abs(near.rot));
    expect(tiltAt(FX.TILT_R * 2.5, 0)).toBeNull();
    expect(tiltCss(null)).toBe('');
  });
  it('指针左右两侧的方块往相反方向转，拉斜与放大不分左右', () => {
    const l = tiltAt(-60, 10)!;
    const r = tiltAt(60, 10)!;
    expect(l.rot).toBeCloseTo(-r.rot);
    expect(l.skew).toBeCloseTo(r.skew);
    expect(l.scale).toBeCloseTo(r.scale);
  });
  it('指针微动时同一格的样式字符串不变（不必重写）', () => {
    expect(tiltCss(tiltAt(150, 40))).toBe(tiltCss(tiltAt(150.2, 40.1)));
  });
});

describe('Lab 楔形', () => {
  const plate = { top: 200, bottom: 600 };
  it('落点夹在预览框上下边以内', () => {
    expect(wedgeTarget({ top: 100, bottom: 160 }, plate).tip).toBe(200 + FX.WEDGE_INSET);
    expect(wedgeTarget({ top: 700, bottom: 760 }, plate).tip).toBe(600 - FX.WEDGE_INSET);
    expect(wedgeTarget({ top: 300, bottom: 360 }, plate).tip).toBe(330);
  });
  it('选中行离框太远就不画', () => {
    expect(wedgeTarget({ top: 300, bottom: 360 }, plate).visible).toBe(true);
    expect(wedgeTarget({ top: 0, bottom: 200 - FX.WEDGE_REACH - 1 }, plate).visible).toBe(false);
    expect(wedgeTarget({ top: 600 + FX.WEDGE_REACH + 1, bottom: 900 }, plate).visible).toBe(false);
  });
  it('逼近：一个 τ 走掉约 63%，τ ≤ 0 直接到位', () => {
    expect(approach(0, 100, FX.WEDGE_TAU_MS, FX.WEDGE_TAU_MS)).toBeCloseTo(100 * (1 - Math.exp(-1)));
    expect(approach(0, 100, 16, 0)).toBe(100);
    expect(approach(Number.NaN, 42, 16, 70)).toBe(42);
  });
});

describe('日志日期', () => {
  it('拆成「月·日」与年份，格式不对就原样返回', () => {
    expect(splitDate('2026-10-24')).toEqual({ md: '10·24', year: '2026' });
    expect(splitDate('soon')).toEqual({ md: 'soon', year: '' });
  });
});
