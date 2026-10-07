import { describe, expect, it } from 'vitest';
import { seededRng } from '../../space/unit-activation';
import { chance, deriveSeed, makeRng, pick, rand, uniform } from './rng';

describe('行为引擎的种子随机数', () => {
  it('与 unit-activation 的 seededRng 是同一个 mulberry32：同种子前 1000 个逐位相同', () => {
    for (const seed of [0, 1, 7, 20261007, 0xffffffff]) {
      const old = seededRng(seed);
      const r = makeRng(seed);
      for (let i = 0; i < 1000; i++) expect(rand(r)).toBe(old());
    }
  });

  it('状态是一个裸 uint32：拷一份接着抽，两边逐位相同（快照 / 交接靠这个）', () => {
    const a = makeRng(42);
    for (let i = 0; i < 37; i++) rand(a);
    const b = JSON.parse(JSON.stringify(a)) as typeof a;
    for (let i = 0; i < 200; i++) expect(rand(b)).toBe(rand(a));
  });

  it('uniform 落在区间内，pick 每一项都抽得到，chance 的频率对得上', () => {
    const r = makeRng(3);
    const seen = new Set<string>();
    let hits = 0;
    for (let i = 0; i < 4000; i++) {
      const u = uniform(r, -2, 5);
      expect(u).toBeGreaterThanOrEqual(-2);
      expect(u).toBeLessThan(5);
      seen.add(pick(r, ['a', 'b', 'c', 'd'] as const));
      if (chance(r, 0.25)) hits++;
    }
    expect(seen.size).toBe(4);
    expect(hits / 4000).toBeGreaterThan(0.22);
    expect(hits / 4000).toBeLessThan(0.28);
  });

  it('派生子流：确定、与主种子不同、不同 salt 不同', () => {
    expect(deriveSeed(7, 1)).toBe(deriveSeed(7, 1));
    expect(deriveSeed(7, 1)).not.toBe(7);
    expect(deriveSeed(7, 1)).not.toBe(deriveSeed(7, 2));
    expect(deriveSeed(7, 1)).not.toBe(deriveSeed(8, 1));
  });
});
