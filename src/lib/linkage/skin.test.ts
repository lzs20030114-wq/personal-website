import { describe, expect, it } from 'vitest';
import type { Vec3 } from './solver3d';
import { bandTriIndex, bandVerts, bandsFarToNear, resample } from './skin';

const P = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

describe('折线等距重采样', () => {
  it('端点保真、点数正确', () => {
    const line = [P(0, 0, 0), P(10, 0, 0), P(10, 10, 0)];
    const r = resample(line, 5);
    expect(r).toHaveLength(5);
    expect(r[0]).toEqual(P(0, 0, 0));
    expect(r[4].x).toBeCloseTo(10, 9);
    expect(r[4].y).toBeCloseTo(10, 9);
  });

  it('直线段上严格等距', () => {
    const r = resample([P(0, 0, 0), P(20, 0, 0)], 21);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].x - r[i - 1].x).toBeCloseTo(1, 9);
    }
  });

  it('折线按弧长等距（弦长在拐角处必然更短——按弧长量，不按弦长量）', () => {
    const line = [P(0, 0, 0), P(3, 0, 0), P(3, 4, 0), P(3, 4, 12)];
    const total = 3 + 4 + 12;
    const r = resample(line, 21);
    // 沿折线量每个采样点的弧长坐标：应恰好是 0, 0.95, 1.90, …
    const arcOf = (p: Vec3): number => {
      // 本例三段分别沿 +x / +y / +z，弧长可直接累加分量
      if (p.y === 0 && p.z === 0) return p.x;
      if (p.z === 0) return 3 + p.y;
      return 7 + p.z;
    };
    for (let i = 0; i < r.length; i++) {
      expect(arcOf(r[i])).toBeCloseTo((i / 20) * total, 6);
    }
    // 弦长 ≤ 弧长步长，且仅跨拐角的两段严格小于
    let shorter = 0;
    for (let i = 1; i < r.length; i++) {
      const c = Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y, r[i].z - r[i - 1].z);
      expect(c).toBeLessThanOrEqual(total / 20 + 1e-9);
      if (c < total / 20 - 1e-6) shorter++;
    }
    expect(shorter).toBe(2);
  });

  it('退化输入不炸：空 / 单点 / n=1', () => {
    expect(resample([], 5)).toEqual([]);
    expect(resample([P(1, 2, 3)], 5)).toEqual([P(1, 2, 3)]);
    expect(resample([P(1, 2, 3), P(4, 5, 6)], 1)).toEqual([P(1, 2, 3)]);
    // 零长折线（所有点重合）不该出 NaN
    const z = resample([P(0, 0, 0), P(0, 0, 0), P(0, 0, 0)], 4);
    for (const p of z) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isFinite(p.z)).toBe(true);
    }
  });
});

describe('直纹带三角索引', () => {
  it('n 点两侧 → 2(n−1) 片，索引全在界内', () => {
    const n = 7;
    const idx = bandTriIndex(n);
    expect(idx.length).toBe((n - 1) * 6);
    for (const v of idx) expect(v).toBeLessThan(2 * n);
  });

  it('每格两片正好铺满四边形（顶点集合 = 该格四角）', () => {
    const idx = bandTriIndex(3);
    // 第 0 格：A0 A1 B0 B1 = 0,1,3,4
    const first = new Set(Array.from(idx.slice(0, 6)));
    expect([...first].sort((a, b) => a - b)).toEqual([0, 1, 3, 4]);
  });

  it('n<2 时不出三角（空带不该产生退化面）', () => {
    expect(bandTriIndex(1).length).toBe(0);
    expect(bandTriIndex(0).length).toBe(0);
  });
});

describe('顶点打包', () => {
  it('[...A, ...B] 顺序与 bandTriIndex 的约定一致', () => {
    const a = [P(0, 0, 0), P(1, 0, 0)];
    const b = [P(0, 1, 0), P(1, 1, 0)];
    const v = bandVerts(a, b);
    expect(v.length).toBe(12);
    expect([...v.slice(0, 3)]).toEqual([0, 0, 0]);
    expect([...v.slice(6, 9)]).toEqual([0, 1, 0]); // B 侧从下标 2 开始
  });
});

describe('带序排序', () => {
  it('从远到近 = 按 depth 升序（depth 越大越近）', () => {
    const depth = (i: number) => [5, 1, 3, 2][i];
    expect(bandsFarToNear(4, depth)).toEqual([1, 3, 2, 0]);
  });

  it('数量为 0 或负数时返回空', () => {
    expect(bandsFarToNear(0, () => 0)).toEqual([]);
    expect(bandsFarToNear(-3, () => 0)).toEqual([]);
  });
});
