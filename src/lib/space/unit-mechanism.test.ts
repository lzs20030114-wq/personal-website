import { describe, expect, it } from 'vitest';
import { CLAMP_SPAN, MECH, bandKeyMesh, bondSides, carriageMesh, clampRadii, footMesh, hangerMesh, unitMechMesh } from './unit-mechanism';
import { SQUARE } from './skin-square';

/**
 * 守门：单元机构件的几何（2026-10-30 网页模型细化）。错法是件与带子打架（夹圈压进布里、键座悬空）、件跑出该在的范围——
 * 都不报错，只是看着不对。坐标：装置自身系，x 径向、y 向下、z 切向。
 */
const R = SQUARE.RADIUS;
const T = SQUARE.THICK;
const radial = (v: Float32Array, k: number) => Math.hypot(v[k], v[k + 2]);
const range = (v: Float32Array, axis: number) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = axis; k < v.length; k += 3) {
    lo = Math.min(lo, v[k]);
    hi = Math.max(hi, v[k]);
  }
  return [lo, hi];
};

describe('夹环', () => {
  it('内外两圈夹住布：内圈在布里侧、外圈在布外侧，各留一道缝，不压进布', () => {
    const r = clampRadii(R, T);
    expect(r.innerOut).toBeLessThan(R - T / 2);
    expect(r.outerIn).toBeGreaterThan(R + T / 2);
    expect(r.innerIn).toBeGreaterThan(MECH.HUB_R); // 辐条有长度
  });

  it('上夹环：顶在第 0 节上方（压圈、法兰），夹圈往下套住前 CLAMP_N 节；没有东西伸到外圈以外', () => {
    const m = carriageMesh(R, T);
    const r = clampRadii(R, T);
    const [ya, yb] = range(m.alu.verts, 1);
    expect(ya).toBeCloseTo(-MECH.TOP, 6);
    expect(yb).toBeCloseTo(CLAMP_SPAN + MECH.LIP, 6);
    expect(range(m.dark.verts, 1)[0]).toBeCloseTo(-MECH.TOP - MECH.FLANGE_H, 6);
    for (let k = 0; k < m.alu.verts.length; k += 3) expect(radial(m.alu.verts, k)).toBeLessThan(r.outerOut + 1e-4);
    // 辐条伸进内圈壁里接住它，但不出内圈
    for (let k = 0; k < m.dark.verts.length; k += 3) expect(radial(m.dark.verts, k)).toBeLessThan(r.innerOut);
  });

  it('下夹环：套住末 CLAMP_N 节，底下是端盖与防撞圈', () => {
    const m = footMesh(R, T);
    const [ya, yb] = range(m.alu.verts, 1);
    expect(ya).toBeCloseTo(-(CLAMP_SPAN + MECH.LIP), 6);
    expect(yb).toBeCloseTo(MECH.FOOT_BASE, 6);
    expect(range(m.dark.verts, 1)[1]).toBeGreaterThan(MECH.FOOT_BASE);
  });

  it('一台的夹环与芯：芯从上夹环中心套底到下夹环中心套顶，四节逐节收细；两个夹环之间太短时不画芯', () => {
    const yc = 10;
    const yf = 200;
    const m = unitMechMesh(R, T, yc, yf);
    const [ya, yb] = range(m.dark.verts, 1);
    expect(ya).toBeCloseTo(yc - MECH.TOP - MECH.FLANGE_H, 6);
    expect(yb).toBeGreaterThan(yf + MECH.FOOT_BASE);
    for (let k = 1; k < MECH.CORE_R.length; k++) expect(MECH.CORE_R[k]).toBeLessThan(MECH.CORE_R[k - 1]);
    const short = unitMechMesh(R, T, 10, 10);
    expect(short.dark.idx.length).toBeLessThan(m.dark.idx.length);
  });
});

describe('吊杆', () => {
  it('竖向归一化（y 0 → 1，摆放时按长度拉伸），五节逐节收细，最细一节仍比芯粗', () => {
    const m = hangerMesh();
    const [ya, yb] = range(m.verts, 1);
    expect(ya).toBe(0);
    expect(yb).toBeCloseTo(1, 6);
    for (let k = 1; k < MECH.HANGER_R.length; k++) expect(MECH.HANGER_R[k]).toBeLessThan(MECH.HANGER_R[k - 1]);
    expect(MECH.HANGER_R[MECH.HANGER_R.length - 1]).toBeGreaterThan(MECH.CORE_R[0]);
  });
});

describe('键', () => {
  // 一条竖着的直带子（x = 0、y 往下）上两颗键：0 号扣着（两端都在布的 +x 一侧对面……这里用一个 U 形：布往外折回来）
  const n = 41;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  // U 形：0–15 往下，15–25 往外半圈，25–40 往上（外侧那一片）
  for (let i = 0; i < n; i++) {
    if (i <= 15) {
      px[i] = 0;
      py[i] = -i * 0.02;
    } else if (i < 25) {
      const a = ((i - 15) / 10) * Math.PI;
      px[i] = 0.1 - 0.1 * Math.cos(a);
      py[i] = -0.3 - 0.1 * Math.sin(a);
    } else {
      px[i] = 0.2;
      py[i] = -0.3 + (i - 25) * 0.02;
    }
  }
  const bonds = [10, 30, 5, 35];

  it('键座朝向对面：两颗键的键座都长在 U 形里侧', () => {
    const s = bondSides(px, py, n, bonds, R);
    const m = bandKeyMesh(px, py, n, bonds, s, [1, 1], R, T);
    // 里侧 = 两片布之间：x 在 R 与 R + 20 之间
    for (let k = 0; k < m.pad.verts.length; k += 3) {
      expect(m.pad.verts[k]).toBeGreaterThan(R - 1e-6);
      expect(m.pad.verts[k]).toBeLessThan(R + 20 + 1e-6);
    }
  });

  it('扣着的键有内杆，从一端键座顶伸到另一端键座顶；没扣的只有键座与一截外套', () => {
    const s = bondSides(px, py, n, bonds, R);
    const locked = bandKeyMesh(px, py, n, bonds, s, [1, 0], R, T);
    const free = bandKeyMesh(px, py, n, bonds, s, [0, 0], R, T);
    expect(locked.rod.idx.length).toBe(36); // 一根内杆 = 一个长方体 12 个三角形
    expect(free.rod.idx.length).toBe(0);
    expect(free.pad.idx.length).toBe(2 * 3 * 36); // 没扣：每颗键两个键座 + 一截外套
    expect(locked.pad.idx.length).toBe(2 * 36 + 3 * 36); // 扣着那颗只有两个键座（外套与内杆重叠，不画）
    // 内杆在两片布之间横过去：x 跨度接近 20（两片布相距 0.2 × 100）减去两边布厚与键座高
    const [xa, xb] = range(locked.rod.verts, 0);
    expect(xb - xa).toBeGreaterThan(20 - 2 * (T / 2 + MECH.PAD.H) - 2);
  });
});
