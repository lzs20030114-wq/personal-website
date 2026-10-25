import { describe, expect, it } from 'vitest';
import {
  IV,
  clampView,
  fitScale,
  isZoomed,
  maxScale,
  swipeStep,
  toggleZoom,
  wheelFactor,
  wrapIndex,
  zoomAt,
  zoomPercent,
} from './image-viewer';

const stage = { w: 1200, h: 800 };
const board = { w: 5000, h: 3000 };
const small = { w: 561, h: 582 };

describe('页内看图器的几何', () => {
  it('适配：大图缩进舞台留边，小图不放大', () => {
    const fit = fitScale(board, stage);
    expect(board.w * fit).toBeLessThanOrEqual(stage.w - IV.PAD * 2 + 1e-9);
    expect(board.h * fit).toBeLessThanOrEqual(stage.h - IV.PAD * 2 + 1e-9);
    expect(fitScale(small, stage)).toBe(1);
  });

  it('最大放大到原始像素的两倍，小图从原大起算', () => {
    expect(maxScale(fitScale(board, stage))).toBe(IV.MAX_NATIVE);
    expect(maxScale(1)).toBe(IV.MAX_NATIVE);
  });

  it('以光标为不动点缩放：光标下那一点缩放前后在同一位置', () => {
    const fit = fitScale(board, stage);
    const v0 = { s: fit, x: 0, y: 0 };
    const p = { x: 300, y: -150 };
    const v1 = zoomAt(v0, 3, p.x, p.y, board, stage, fit);
    // 光标下那一点在图片坐标里的位置
    const u0 = (p.x - v0.x) / v0.s;
    const u1 = (p.x - v1.x) / v1.s;
    expect(u1).toBeCloseTo(u0, 9);
    expect(v1.s).toBeCloseTo(fit * 3, 12);
  });

  it('缩放夹在适配与最大之间，比舞台小的方向居中，大的方向边缘不进舞台', () => {
    const fit = fitScale(board, stage);
    expect(clampView({ s: fit / 3, x: 50, y: 50 }, board, stage, fit)).toEqual({ s: fit, x: 0, y: 0 });
    const big = clampView({ s: 1, x: 99999, y: -99999 }, board, stage, fit);
    expect(big.x).toBe((board.w - stage.w) / 2);
    expect(big.y).toBe(-(board.h - stage.h) / 2);
    expect(clampView({ s: 100, x: 0, y: 0 }, board, stage, fit).s).toBe(maxScale(fit));
  });

  it('双击：适配时放大（至少到原始像素），放大时回适配', () => {
    const fit = fitScale(board, stage);
    const zoomed = toggleZoom({ s: fit, x: 0, y: 0 }, 0, 0, board, stage, fit);
    expect(zoomed.s).toBeCloseTo(Math.max(1, fit * IV.DOUBLE), 9);
    expect(isZoomed(zoomed, fit)).toBe(true);
    expect(toggleZoom(zoomed, 0, 0, board, stage, fit)).toEqual({ s: fit, x: 0, y: 0 });
    // 小图原大即适配，双击放大到两倍
    const sf = fitScale(small, stage);
    expect(toggleZoom({ s: sf, x: 0, y: 0 }, 0, 0, small, stage, sf).s).toBeCloseTo(IV.MAX_NATIVE, 9);
  });

  it('滚轮向上放大、向下缩小，一格的幅度有上限', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-100000)).toBe(wheelFactor(-240));
    expect(wheelFactor(-50) * wheelFactor(50)).toBeCloseTo(1, 12);
  });

  it('横向拖够远才翻页，向左拖是下一张，斜着拖不算', () => {
    expect(swipeStep(-IV.SWIPE - 1, 0)).toBe(1);
    expect(swipeStep(IV.SWIPE + 1, 0)).toBe(-1);
    expect(swipeStep(-IV.SWIPE + 1, 0)).toBe(0);
    expect(swipeStep(-100, 90)).toBe(0);
  });

  it('翻页首尾相接，读数以适配为 100%', () => {
    expect([wrapIndex(-1, 5), wrapIndex(5, 5), wrapIndex(2, 5)]).toEqual([4, 0, 2]);
    expect(zoomPercent({ s: 0.5, x: 0, y: 0 }, 0.25)).toBe(200);
  });
});
