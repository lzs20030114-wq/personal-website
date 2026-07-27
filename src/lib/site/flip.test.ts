import { describe, expect, it } from 'vitest';
import { coverRect, flipCss, flipTransform, type Rect } from './flip';

const R = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  width,
  height,
});

describe('coverRect', () => {
  it('等比放大到铺满视口并居中', () => {
    // 400×300 的盒进 1000×500 视口：横向更缺（1000/400 = 2.5 > 500/300），按它取比例
    const c = coverRect(R(100, 100, 400, 300), 1000, 500, 1);
    expect(c.width).toBeCloseTo(1000, 6);
    expect(c.height).toBeCloseTo(750, 6); // 覆盖视口高度还有富余 = cover 的应有之义
    expect(c.left + c.width / 2).toBeCloseTo(500, 6);
    expect(c.top + c.height / 2).toBeCloseTo(250, 6);
  });

  it('pad 余量只放大、不改中心', () => {
    const base = coverRect(R(0, 0, 400, 300), 1000, 500, 1);
    const padded = coverRect(R(0, 0, 400, 300), 1000, 500, 1.02);
    expect(padded.width).toBeCloseTo(base.width * 1.02, 6);
    expect(padded.left + padded.width / 2).toBeCloseTo(500, 6);
  });

  it('宽高比与原盒一致（不变形）', () => {
    const c = coverRect(R(12, 34, 560, 330), 1440, 900);
    expect(c.width / c.height).toBeCloseTo(560 / 330, 6);
  });

  it('零尺寸盒不产生 NaN/Infinity', () => {
    const c = coverRect(R(0, 0, 0, 0), 1000, 500);
    expect(Number.isFinite(c.width)).toBe(true);
    expect(Number.isFinite(c.height)).toBe(true);
  });
});

describe('flipTransform', () => {
  it('把版式盒变到目标盒：中心对齐 + 按宽等比', () => {
    const from = R(0, 0, 200, 100);
    const to = R(300, 400, 600, 300);
    const f = flipTransform(from, to);
    expect(f.scale).toBeCloseTo(3, 6);
    expect(f.tx).toBeCloseTo(500, 6); // 600 - 100
    expect(f.ty).toBeCloseTo(500, 6); // 550 - 50
  });

  it('同盒 → 恒等变换', () => {
    const f = flipTransform(R(10, 20, 300, 200), R(10, 20, 300, 200));
    expect(f.tx).toBeCloseTo(0, 6);
    expect(f.ty).toBeCloseTo(0, 6);
    expect(f.scale).toBeCloseTo(1, 6);
  });

  it('两个不同起点盒飞向同一终点盒 → 终态视觉矩形相同（两段转场能接上的前提）', () => {
    const target = R(240, 600, 780, 580);
    const visual = (from: Rect): Rect => {
      const f = flipTransform(from, target);
      const width = from.width * f.scale;
      const height = from.height * f.scale;
      const cx = from.left + from.width / 2 + f.tx;
      const cy = from.top + from.height / 2 + f.ty;
      return { left: cx - width / 2, top: cy - height / 2, width, height };
    };
    const a = visual(R(0, 0, 560, 330)); // 主页卡片媒体块（克隆）
    const b = visual(R(240, 600, 780, 580)); // 案例页 hero 自身
    expect(a.width).toBeCloseTo(b.width, 6);
    expect(a.left + a.width / 2).toBeCloseTo(b.left + b.width / 2, 6);
    expect(a.top + a.height / 2).toBeCloseTo(b.top + b.height / 2, 6);
  });

  it('宽度为 0 的盒不炸（除零钳制）', () => {
    const f = flipTransform(R(0, 0, 0, 0), R(0, 0, 100, 100));
    expect(Number.isFinite(f.scale)).toBe(true);
  });
});

describe('flipCss', () => {
  it('顺序固定：translate 在前、scale 在后', () => {
    expect(flipCss({ tx: 12.5, ty: -3, scale: 2 })).toBe('translate(12.5px,-3px) scale(2)');
  });
});
