import { describe, expect, it } from 'vitest';
import { RING, ringGap } from './skin-ring';
import { buildSplitLevels } from './skin-split';
import {
  SPLIT_RING_COUNT,
  SPLIT_RING_PHASE,
  buildSplitRingOrder,
  buildSplitRingUnits,
} from './skin-split-ring';

/**
 * 守门：捏分环（Lab.13，用户 2026-08-30「20 个从形态 1 到 2 再到 1」）。
 * 卡三件：编制闭合且精确（镜像不取整）、形态逐字取自 Lab.12（不放大、不重排）、
 * 环几何在量程内不自穿。
 */
describe('skin-split-ring 捏分环', () => {
  const LV = buildSplitLevels();
  const order = buildSplitRingOrder(LV.length);

  it('编制闭合：二十位、每级恰好两处、相邻位恒差 ≤1（含首尾相接）', () => {
    expect(SPLIT_RING_COUNT).toBe(20);
    expect(order.length).toBe(SPLIT_RING_COUNT);
    // 每级恰好两处——镜像的精确性质（palindromeOrder 套 10 级会取整成 3 处）
    const tally = new Map<number, number>();
    for (const l of order) tally.set(l, (tally.get(l) ?? 0) + 1);
    expect([...tally.keys()].sort((a, b) => a - b)).toEqual(LV.map((d) => d.i));
    for (const [l, n] of tally) expect(n, `级 ${l} 出现次数`).toBe(2);
    // 相邻位（环上，含 19↔0）差 ≤1：一圈读下来是连续过渡，没有跳级
    for (let i = 0; i < order.length; i++) {
      const d = Math.abs(order[(i + 1) % order.length] - order[i]);
      expect(d, `位 ${i}→${(i + 1) % order.length}`).toBeLessThanOrEqual(1);
    }
    // 一个来回：两个端点各出现、且各自的两处相邻（折返点）
    for (const end of [0, LV.length - 1]) {
      const at = order.flatMap((l, i) => (l === end ? [i] : []));
      expect(at.length).toBe(2);
      const gap = Math.abs(at[0] - at[1]);
      expect(gap === 1 || gap === SPLIT_RING_COUNT - 1, `端点 ${end} 的两处应相邻`).toBe(true);
    }
    // 相位只是绕轴转位，不改多重集
    const zero = buildSplitRingOrder(LV.length, SPLIT_RING_COUNT, 0);
    expect([...order].sort((a, b) => a - b)).toEqual([...zero].sort((a, b) => a - b));
    expect(order[(SPLIT_RING_COUNT - SPLIT_RING_PHASE) % SPLIT_RING_COUNT]).toBe(zero[0]);
  });

  it('形态逐字取自 Lab.12：谱与选项同一份（不放大、不重排）', () => {
    const units = buildSplitRingUnits();
    expect(units.length).toBe(LV.length);
    units.forEach((u, i) => {
      // 段结构与节数逐位相同（RING_GROW 会打乱按下标排的四件成形机制，故不放大）
      expect(u.spec.map((s) => [s[0], s[1]])).toEqual(LV[i].spec.map((s) => [s[0], s[1]]));
      expect(u.marks).toEqual(LV[i].marks);
      // 四件套原样带过来（缝区折痕 / 缝壁排整齐 / 逐挡长出 / 近程门）
      expect(u.opts.coreTetherRel?.length ?? 0).toBe(LV[i].opts.coreTetherRel?.length ?? 0);
      expect(u.opts.alignRuns?.length ?? 0).toBe(LV[i].opts.alignRuns?.length ?? 0);
      expect(u.opts.zipUp).toEqual(LV[i].opts.zipUp);
    });
  });

  it('环几何：量程内二十条窄带不互穿', () => {
    for (const r of [RING.RADIUS_MIN, RING.RADIUS_DEF, RING.RADIUS_MAX])
      expect(ringGap(r, SPLIT_RING_COUNT, RING.DEPTH), `半径 ${r} 净缝`).toBeGreaterThan(0);
  });
});
