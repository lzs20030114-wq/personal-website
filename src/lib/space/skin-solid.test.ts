import { describe, expect, it } from 'vitest';
import { SKIN, createSkinUnit } from './skin-unit';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import {
  SOLID,
  boxVerts,
  buildSolidTopology,
  fillSolidVerts,
  placePoint,
  railSpan,
  ringPlateVerts,
  rotateVertsY,
} from './skin-solid';

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

/**
 * 守门：环列落位（Lab.09 圆筒，2026-08-23）。ring 是加法式尾参——
 * 第一条卡的就是「不传 = 逐位不变」，Lab.07/08 的直排路径不许被它碰到。
 */
describe('skin-solid 环列落位', () => {
  const straight = (n: number): { px: Float64Array; py: Float64Array } => {
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = 0.1 + 0.004 * i; // 微微外张，法向不退化
      py[i] = -i * SKIN.SEG;
    }
    return { px, py };
  };

  it('ring 不传 / 传 null：与加它之前逐位相同（直排路径回归护栏）', () => {
    const n = 20;
    const { px, py } = straight(n);
    const a = fillSolidVerts(px, py, n, 50, SOLID.DEPTH, SOLID.THICK, SOLID.SCALE, undefined, -7, 3);
    const b = fillSolidVerts(px, py, n, 50, SOLID.DEPTH, SOLID.THICK, SOLID.SCALE, undefined, -7, 3, null);
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it('环上：离筒轴的半径 = 站位半径 + 剖面横坐标（±厚度一半），方位角照给', () => {
    const n = 16;
    const depth = 7.8;
    const thick = 3;
    const { px, py } = straight(n);
    const radius = 30;
    for (const angle of [0, Math.PI / 2, 2.3]) {
      const v = fillSolidVerts(px, py, n, 0, depth, thick, SOLID.SCALE, undefined, 0, 0, {
        radius,
        angle,
      });
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      // 投到径向 / 切向两个方向上分解（Float32 顶点 ⇒ 容差取 1e-3）
      const rad = (k: number): number => v[k * 3] * c + v[k * 3 + 2] * sn;
      const tan = (k: number): number => -v[k * 3] * sn + v[k * 3 + 2] * c;
      for (let i = 0; i < n; i++) {
        const wantRad = radius + px[i] * SOLID.SCALE;
        // 外/内两条棱环夹着剖面本身，间距恒 = 织物厚度（法向在「径向×竖直」平面里，
        // 剖面有坡度 ⇒ 只量径向分量会短一截，要量整个平面内的距离），
        // 中点 = 站位半径 + 剖面横坐标
        expect(
          Math.hypot(rad(i) - rad(2 * n + i), v[i * 3 + 1] - v[(2 * n + i) * 3 + 1]),
        ).toBeCloseTo(thick, 3);
        expect((rad(i) + rad(2 * n + i)) / 2).toBeCloseTo(wantRad, 3);
        // 前后棱环分居切向两侧 ⇒ 带的切向宽度恒 = depth
        expect(tan(i)).toBeCloseTo(depth / 2, 3);
        expect(tan(n + i)).toBeCloseTo(-depth / 2, 3);
        // 竖直方向不受环列影响（只差一个法向厚度偏移）
        expect(Math.abs(v[i * 3 + 1] - -py[i] * SOLID.SCALE)).toBeLessThan(thick);
      }
    }
  });

  it('placePoint / rotateVertsY：绕世界 Y 转，半径与高度不变；null 原样', () => {
    const p = placePoint(30, 12, 4, { radius: 0, angle: Math.PI / 2 });
    expect(p.x).toBeCloseTo(-4, 12);
    expect(p.y).toBe(12);
    expect(p.z).toBeCloseTo(30, 12);
    expect(placePoint(30, 12, 4, null)).toEqual({ x: 30, y: 12, z: 4 });

    const box = boxVerts(26, 100, 0, 2.4, 50, 2);
    const before = Array.from(box.verts);
    rotateVertsY(box.verts, null);
    expect(Array.from(box.verts)).toEqual(before);
    rotateVertsY(box.verts, { radius: 26, angle: 0.7 });
    for (let i = 0; i < 8; i++) {
      const r0 = Math.hypot(before[i * 3], before[i * 3 + 2]);
      const r1 = Math.hypot(box.verts[i * 3], box.verts[i * 3 + 2]);
      expect(r1).toBeCloseTo(r0, 3);
      expect(box.verts[i * 3 + 1]).toBe(before[i * 3 + 1]); // 高度不动
    }
  });

  it('railSpan：core 跟着芯缩、fixed 是天花到钉住点的固定立杆', () => {
    const offY = 12;
    const ceilY = -3;
    const foot = -3.38; // 注册端钉住 ⇒ 收缩期间恒定
    // core：上端随收缩下降、长度 = 芯长（Lab.06–08 的旧行为，逐位不变）
    for (const [coreTop, coreLen] of [[0, 3.38], [0.4, 2.6]] as [number, number][]) {
      const r = railSpan('core', { coreTop, coreLen, footY: foot }, offY, ceilY);
      expect(r.top).toBeCloseTo(offY - coreTop * SOLID.SCALE, 9);
      expect(r.bottom - r.top).toBeCloseTo(coreLen * SOLID.SCALE, 9);
    }
    // fixed：上端恒在天花、下端恒在钉住点 ⇒ 长度与芯长完全无关
    const a = railSpan('fixed', { coreTop: 0, coreLen: 3.38, footY: foot }, offY, ceilY);
    const b = railSpan('fixed', { coreTop: 0.4, coreLen: 2.6, footY: foot }, offY, ceilY);
    expect(a.top).toBe(ceilY);
    expect(b.top).toBe(ceilY);
    expect(a.bottom).toBeCloseTo(offY - foot * SOLID.SCALE, 9);
    expect(b.bottom).toBeCloseTo(a.bottom, 12);
    expect(b.bottom - b.top).toBeCloseTo(a.bottom - a.top, 12);
  });

  it('ringPlateVerts：矩形截面扫一圈——顶点只落在两个半径与两个高度上', () => {
    const segs = 24;
    const { verts, idx } = ringPlateVerts(16, 46, -3, 3, segs);
    expect(verts.length).toBe(segs * 4 * 3);
    expect(idx.length).toBe(segs * 4 * 6); // 每段四条 quad × 两三角 × 三索引
    for (const i of idx) expect(i).toBeLessThan(segs * 4);
    for (let i = 0; i < segs * 4; i++) {
      const r = Math.hypot(verts[i * 3], verts[i * 3 + 2]);
      expect(Math.min(Math.abs(r - 16), Math.abs(r - 46))).toBeLessThan(1e-4);
      expect(Math.min(Math.abs(verts[i * 3 + 1] + 6), Math.abs(verts[i * 3 + 1]))).toBeLessThan(1e-5);
    }
  });
});
