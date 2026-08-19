import { describe, expect, it } from 'vitest';
import { SKIN, createSkinUnit } from './skin-unit';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import { SOLID, boxVerts, buildSolidTopology, fillSolidVerts } from './skin-solid';

/**
 * 守门：Lab.07 立体化烘焙（纯几何，物理零涉及）。
 * 拓扑一次定死、顶点逐帧重填——这里卡拓扑账目、厚度偏移、翻 Y 约定与无 NaN。
 */
describe('skin-solid 立体化烘焙', () => {
  it('拓扑账目：quad 数 =(n−1)×4 面带 + 2 端封口，索引全部落在 4n 顶点内', () => {
    for (const n of [10, 166]) {
      const t = buildSolidTopology(n, SKIN.STRIPE);
      expect(t.vertCount).toBe(4 * n);
      const total = t.idxA.length + t.idxB.length;
      expect(total).toBe(((n - 1) * 4 + 2) * 6); // 每 quad 两三角六索引
      for (const arr of [t.idxA, t.idxB])
        for (const i of arr) expect(i).toBeLessThan(4 * n);
    }
  });

  it('条纹分组按 STRIPE 节交替：两组都非空且面数量按段数分摊', () => {
    const n = 166;
    const t = buildSolidTopology(n, SKIN.STRIPE);
    expect(t.idxA.length).toBeGreaterThan(0);
    expect(t.idxB.length).toBeGreaterThan(0);
    // 段 0..164：A 组段数 = 偶数条纹段的段数
    let segA = 0;
    for (let i = 0; i < n - 1; i++) if (Math.floor(i / SKIN.STRIPE) % 2 === 0) segA++;
    // A 组 = 段面 4 quad + 起点封口 1 quad（+ 末端封口若 (n-2)/stripe 为偶）
    const endInA = Math.floor((n - 2) / SKIN.STRIPE) % 2 === 0 ? 1 : 0;
    expect(t.idxA.length).toBe((segA * 4 + 1 + endInA) * 6);
  });

  it('厚度偏移：外/内环间距恒 = THICK，前后环 z = ±DEPTH/2，Y 翻转（向下为正）', () => {
    // 竖直剖面（贴轴段的形状）：x=0，y 从 0 递减
    const n = 12;
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    for (let i = 0; i < n; i++) py[i] = -i * SKIN.SEG;
    const v = fillSolidVerts(px, py, n, 50);
    for (let i = 0; i < n; i++) {
      const oF = [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
      const oB = [v[(n + i) * 3], v[(n + i) * 3 + 1], v[(n + i) * 3 + 2]];
      const iF = [v[(2 * n + i) * 3], v[(2 * n + i) * 3 + 1], v[(2 * n + i) * 3 + 2]];
      expect(oF[2]).toBeCloseTo(SOLID.DEPTH / 2, 9);
      expect(oB[2]).toBeCloseTo(-SOLID.DEPTH / 2, 9);
      expect(Math.hypot(oF[0] - iF[0], oF[1] - iF[1])).toBeCloseTo(SOLID.THICK, 9);
      expect(oF[1]).toBeCloseTo(i * SKIN.SEG * SOLID.SCALE, 6); // Y = −simY·scale ≥ 0
    }
  });

  it('真实终态剖面：全部顶点有限（重合节点的退化切线不产生 NaN）', () => {
    const def = SKIN_UNITS[3];
    const sim = createSkinUnit(def.spec, skinSiteOpts(def));
    for (let s = 0; s < SKIN.STEPS; s++) sim.advance();
    const v = fillSolidVerts(sim.px, sim.py, sim.n, 0);
    for (let i = 0; i < v.length; i++) expect(Number.isFinite(v[i]), `v[${i}]`).toBe(true);
    // 复用输出缓冲：同一引用返回
    const again = fillSolidVerts(sim.px, sim.py, sim.n, 0, SOLID.DEPTH, SOLID.THICK, SOLID.SCALE, v);
    expect(again).toBe(v);
  });

  it('offZ 深度错位（并拢排列用）：全部 z 平移 offZ、XY 逐位不变；默认 0 = 旧行为', () => {
    const n = 8;
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    for (let i = 0; i < n; i++) py[i] = -i * SKIN.SEG;
    const base = fillSolidVerts(px, py, n, 50);
    const off = fillSolidVerts(
      px, py, n, 50, SOLID.DEPTH, SOLID.THICK, SOLID.SCALE, undefined, -27.5,
    );
    for (let i = 0; i < 4 * n; i++) {
      expect(off[i * 3]).toBe(base[i * 3]);
      expect(off[i * 3 + 1]).toBe(base[i * 3 + 1]);
      expect(off[i * 3 + 2]).toBeCloseTo(base[i * 3 + 2] - 27.5, 9);
    }
  });

  it('boxVerts：8 顶点 36 索引，范围 = 中心 ± 半尺寸', () => {
    const { verts, idx } = boxVerts(10, -5, 2, 3, 4, 1);
    expect(verts.length).toBe(24);
    expect(idx.length).toBe(36);
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < 8; i++) {
      minX = Math.min(minX, verts[i * 3]);
      maxX = Math.max(maxX, verts[i * 3]);
    }
    expect(minX).toBe(7);
    expect(maxX).toBe(13);
    for (const i of idx) expect(i).toBeLessThan(8);
  });
});
