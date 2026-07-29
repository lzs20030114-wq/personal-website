import { describe, expect, it } from 'vitest';
import { bakeRuledPoints } from './gl3d';
import type { Vec3 } from './solver3d';

// gl3d 的纯几何部分（不碰 WebGL）。点阵蒙皮 2026-07-29 新增。

const line = (n: number, f: (t: number) => Vec3): Vec3[] =>
  Array.from({ length: n }, (_, i) => f(i / (n - 1)));

const P = (data: Float32Array, i: number) => ({
  x: data[i * 7],
  y: data[i * 7 + 1],
  z: data[i * 7 + 2],
  n: [data[i * 7 + 3], data[i * 7 + 4], data[i * 7 + 5]] as [number, number, number],
  t: data[i * 7 + 6],
});

describe('bakeRuledPoints（直纹带 → 点阵）', () => {
  const A = line(9, (t) => ({ x: 0, y: t * 80, z: 0 }));
  const B = line(9, (t) => ({ x: 85, y: t * 80, z: 0 }));

  it('点数 = nu × nv，步长 7 float', () => {
    const d = bakeRuledPoints(A, B, 4);
    expect(d.length).toBe(9 * 4 * 7);
  });

  it('取格心而非端点：t 落在 (0,1) 开区间且关于 0.5 对称——相邻两带才不会在共用环上叠双倍密度', () => {
    const d = bakeRuledPoints(A, B, 4);
    const ts = Array.from({ length: 4 }, (_, j) => P(d, j).t);
    expect(ts).toEqual([0.125, 0.375, 0.625, 0.875]);
    expect(Math.min(...ts)).toBeGreaterThan(0);
    expect(Math.max(...ts)).toBeLessThan(1);
  });

  it('位置 = 两侧折线按 t 线性插值', () => {
    const d = bakeRuledPoints(A, B, 2);
    const p = P(d, 0); // i=0, j=0 → t=0.25
    expect(p.x).toBeCloseTo(85 * 0.25, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it('法向为单位向量且垂直于带平面（此例带在 z=0 平面内 ⇒ 法向 ±ẑ）', () => {
    const d = bakeRuledPoints(A, B, 3);
    for (let i = 0; i < d.length / 7; i++) {
      const { n } = P(d, i);
      expect(Math.hypot(...n)).toBeCloseTo(1, 6);
      expect(Math.abs(n[2])).toBeCloseTo(1, 6);
    }
  });

  it('退化输入不抛：折线过短或 nv<1 返回空流；两线重合处法向留零', () => {
    expect(bakeRuledPoints([{ x: 0, y: 0, z: 0 }], B, 3).length).toBe(0);
    expect(bakeRuledPoints(A, B, 0).length).toBe(0);
    const d = bakeRuledPoints(A, A, 2); // B ≡ A ⇒ ∂/∂v = 0
    expect(d.length).toBe(9 * 2 * 7);
    expect(P(d, 0).n).toEqual([0, 0, 0]);
  });

  it('两侧折线不等长时按较短者裁齐（不越界读）', () => {
    const d = bakeRuledPoints(A, B.slice(0, 5), 2);
    expect(d.length).toBe(5 * 2 * 7);
  });
});
