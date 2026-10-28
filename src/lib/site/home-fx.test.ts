import { describe, expect, it } from 'vitest';
import { FX, approach, splitDate, swellAt, swellAxes, swellFrom, tiltAt, tiltCss, wedgeTarget } from './home-fx';

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

describe('首屏字格鼓起', () => {
  it('指针正上方最鼓，横向比纵向传得远，远处为 0', () => {
    expect(swellAt(0, 0)).toBe(1);
    expect(swellAt(1, 0)).toBeGreaterThan(swellAt(0, 1));
    expect(swellAt(10, 0)).toBe(0);
    expect(swellAt(0, 4)).toBe(0);
  });
  it('平时是细窄那一端，最鼓是宽粗那一端；同一程度给出同一组整数', () => {
    expect(swellAxes(0)).toEqual({ wdth: FX.SWELL_WDTH[0], wght: FX.SWELL_WGHT[0] });
    expect(swellAxes(1)).toEqual({ wdth: FX.SWELL_WDTH[1], wght: FX.SWELL_WGHT[1] });
    const a = swellAxes(0.5);
    expect(Number.isInteger(a.wdth) && Number.isInteger(a.wght)).toBe(true);
  });
  it('About 宣言：细窄的字与宽粗的名词各从自己平时的样子起跳，鼓到同一个最宽最粗；名词只变粗不再变宽', () => {
    const peak = { wdth: FX.SWELL_WDTH[1], wght: FX.SWELL_WGHT[1] };
    expect(swellFrom(FX.SAY_PLAIN, 0)).toEqual(FX.SAY_PLAIN);
    expect(swellFrom(FX.SAY_WIDE, 0)).toEqual(FX.SAY_WIDE);
    expect(swellFrom(FX.SAY_PLAIN, 1)).toEqual(peak);
    expect(swellFrom(FX.SAY_WIDE, 1)).toEqual(peak);
    expect(swellFrom(FX.SAY_WIDE, 0.5).wdth).toBe(FX.SAY_WIDE.wdth);
    expect(swellFrom(FX.SAY_PLAIN, 0.5).wdth).toBeGreaterThan(FX.SAY_PLAIN.wdth);
  });
});
