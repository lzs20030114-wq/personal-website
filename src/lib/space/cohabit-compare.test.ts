import { describe, expect, it } from 'vitest';
import data from './cohabit-compare.data.json';

/**
 * 案例页对照图（FIG.06）的数据守门：文件由 scripts/cohabit/case-compare.mjs 真跑生成，
 * 图与数表都读它。最可能的事故是重跑时漏了一个场景或一种引导、或种子数变了而图注的字没变。
 */
describe('cohabit-compare.data.json', () => {
  const SPACES = ['live', 'fixed', 'empty'] as const;
  const METRICS = ['warmthS', 'touchS', 'settled', 'detour'] as const;

  it('三个场景 × 两种引导，场景按客流从少到多', () => {
    expect(data.scenes.map((s) => [s.people, s.cats])).toEqual([
      [3, 1],
      [6, 2],
      [12, 3],
    ]);
    for (const s of data.scenes) expect(s.guides.map((g) => g.key)).toEqual(['meet', 'sidew']);
  });

  it('每个读数三档空间各有 seeds 个样本，均值与样本一致', () => {
    for (const s of data.scenes)
      for (const g of s.guides)
        for (const mk of METRICS) {
          const st = g.metrics[mk];
          for (const sp of SPACES) {
            expect(st.v[sp]).toHaveLength(data.seeds);
            const mean = st.v[sp].reduce((a, b) => a + b, 0) / st.v[sp].length;
            expect(Math.abs(mean - st.mean[sp])).toBeLessThan(0.15);
            expect(st.sd[sp]).toBeGreaterThanOrEqual(0);
          }
          for (const t of [st.vsFixed, st.vsEmpty]) {
            expect(t.p).toBeGreaterThanOrEqual(0);
            expect(t.p).toBeLessThanOrEqual(1);
          }
        }
  });
});
