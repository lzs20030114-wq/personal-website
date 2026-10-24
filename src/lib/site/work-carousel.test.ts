import { describe, expect, it } from 'vitest';
import { WC, carouselNav, cascadeOrder, hintOf, nudgeSide, proximity, rangeLabel } from './work-carousel';

describe('02 Work 横向切换（MAPPING §59）', () => {
  it('首尾相接：最后一屏往右回到第一屏，第一屏往左到最后一屏，并标出绕回', () => {
    expect(carouselNav(0, 1, 3)).toEqual({ t: 1, wrap: false, d: 1 });
    expect(carouselNav(2, 1, 3)).toEqual({ t: 0, wrap: true, d: 1 });
    expect(carouselNav(0, -1, 3)).toEqual({ t: 2, wrap: true, d: -1 });
    expect(carouselNav(2, 1, 3, false)).toBeNull();
    // 只有一屏时没有可走的（箭头置灰、留白区不出标签）
    expect(carouselNav(0, 1, 1)).toBeNull();
  });

  it('卡片依次出发：往右切从左往右数，往左切从右往左数，最多错开 6 张', () => {
    // 0 → 1：第 1 屏的三张排 3、4、5；第 0 屏（正在离开）排 0、1、2
    expect([0, 1, 2].map((c) => cascadeOrder(1, c, 0, 1, 3))).toEqual([3, 4, 5]);
    expect([0, 1, 2].map((c) => cascadeOrder(0, c, 0, 1, 3))).toEqual([0, 1, 2]);
    // 1 → 0：最右那张先走
    expect([0, 1, 2].map((c) => cascadeOrder(1, c, 1, 0, 3))).toEqual([2, 1, 0]);
    expect([0, 1, 2].map((c) => cascadeOrder(0, c, 1, 0, 3))).toEqual([5, 4, 3]);
    // 远处的屏封顶，不会让最后一张拖到几秒之后
    expect(cascadeOrder(4, 2, 0, 4, 3)).toBe(WC.STAGGER_MAX);
  });

  it('靠近边缘：只在当前屏两侧 18%（最多 180px）的带子里起作用，按 0.1 取整', () => {
    const wp = 1000;
    expect(proximity(500, wp)).toEqual({ side: null, t: 0 });
    expect(proximity(1000, wp)).toEqual({ side: 'r', t: 1 });
    expect(proximity(910, wp)).toEqual({ side: 'r', t: 0.5 });
    expect(proximity(0, wp)).toEqual({ side: 'l', t: 1 });
    // 感应带上限 180px
    expect(proximity(1000 - 181, 2000 * 0.5)).toEqual({ side: null, t: 0 });
  });

  it('暗示往让出的那一侧探：悬停右侧留白区整排左移 44px，绕回时只探 35%', () => {
    expect(hintOf('zone', 'r', false)).toEqual({ x: -WC.LEAN, op: 0.9 });
    expect(hintOf('zone', 'l', false)).toEqual({ x: WC.LEAN, op: 0.9 });
    expect(hintOf('zone', 'r', true).x).toBe(-Math.round(WC.LEAN * 0.35));
    expect(hintOf('nudge', 'r', false)).toEqual({ x: -WC.NUDGE_X, op: 0.72 });
    expect(hintOf('prox', 'r', false, 0.5).x).toBe(-8);
    // 靠近边缘时，绕回那一侧不暗示
    expect(hintOf('prox', 'r', true, 1)).toEqual({ x: 0, op: 0 });
  });

  it('闲置探一下往有下一屏的那边；最后一屏往左；只有一屏不探', () => {
    expect(nudgeSide(0, 2)).toBe('r');
    expect(nudgeSide(1, 2)).toBe('l');
    expect(nudgeSide(0, 1)).toBeNull();
  });

  it('分屏计数', () => {
    expect(rangeLabel(0, 3, 5, 3)).toBe('1–3 of 5');
    expect(rangeLabel(1, 2, 5, 3)).toBe('4–5 of 5');
  });
});
