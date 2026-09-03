import { describe, expect, it } from 'vitest';
import { SKIN, createSkinUnit } from './skin-unit';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import {
  SOLID,
  boxVerts,
  buildSolidTopology,
  fillSolidVerts,
  membranePanel,
  placePoint,
  railSpan,
  ringPlateVerts,
  rotateVertsY,
  bridgeWeb,
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

describe('membranePanel 环间织物膜', () => {
  const n = 24;
  const prof = (dx: number) => {
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      px[i] = 0.1 + dx + 0.2 * Math.sin((i / (n - 1)) * Math.PI);
      py[i] = -i * 0.02;
    }
    return { px, py, offY: 0 };
  };
  const R = 30;
  const D = 7.8;
  const S = 100;
  const dT = (2 * Math.PI) / 20;

  it('是一张直纹带：顶点 2n、三角 (n−1)×2', () => {
    const g = membranePanel(prof(0), prof(0), n, R, D, S, dT);
    expect(g.verts.length).toBe(2 * n * 3); // xyz 平铺：A 侧 n 点 + B 侧 n 点
    expect(g.idx.length).toBe((n - 1) * 6);
    for (const i of g.idx) expect(i).toBeLessThan(2 * n);
  });

  it('两条边正好搭在缝的两侧：A = 本条带的后剖口，B = 下一条带的前剖口', () => {
    const g = membranePanel(prof(0), prof(0), n, R, D, S, dT);
    const at = (k: number) => ({ x: g.verts[k * 3], y: g.verts[k * 3 + 1], z: g.verts[k * 3 + 2] });
    for (let i = 0; i < n; i++) {
      const a = at(i);
      const b = at(n + i);
      // A 边在方位角 0 上，切向 −depth/2
      expect(a.z).toBeCloseTo(-D / 2, 5); // Float32 精度
      // 两边离筒轴的距离相同（同一条剖面）⇒ 膜不歪
      expect(Math.hypot(b.x, b.z)).toBeCloseTo(Math.hypot(a.x, a.z), 4);
      // B 边转过一个角节距 ⇒ 两边的方位角差正好是那个角
      const angA = Math.atan2(a.z, a.x);
      const angB = Math.atan2(b.z, b.x);
      expect(angB - angA).toBeGreaterThan(0);
      expect(angB - angA).toBeLessThan(dT + 0.2); // 切向偏移让它略小于角节距
      expect(a.y).toBeCloseTo(b.y, 5);
    }
  });

  it('两侧剖面不同也能搭（一圈渐变编制）', () => {
    const g = membranePanel(prof(0), prof(0.15), n, R, D, S, dT);
    const at = (k: number) => ({ x: g.verts[k * 3], z: g.verts[k * 3 + 2] });
    // B 边整体更靠外（它那条带鼓得更远）
    for (let i = 1; i < n - 1; i++)
      expect(Math.hypot(at(n + i).x, at(n + i).z)).toBeGreaterThan(Math.hypot(at(i).x, at(i).z));
  });
});

describe('bridgeWeb 单元之间的织物网（Lab.13 连接）', () => {
  const rim = (x: number, z: number, rho = 60, yTop = 300, yBot = 334) => ({ x, z, rho, yTop, yBot });

  it('两圈相切：切点处零宽、外缘弦宽 = width、顶底两层加外端封板，点数与三角数对得上', () => {
    const S = 8;
    const W = 20;
    const g = bridgeWeb(rim(0, 0), rim(120, 0), W, 7, S);
    expect(g).not.toBeNull();
    const { verts, idx } = g!;
    expect(verts.length).toBe(2 * (S + 1) * 4 * 3);
    expect(idx.length).toBe(2 * (S * 12 + 6));
    // k=0：A 顶与 B 顶重合（切点）
    expect(Math.hypot(verts[0] - verts[3], verts[2] - verts[5])).toBeLessThan(1e-9);
    // k=S：A 顶到 B 顶的弦 = width（2ρ(1−cosΦ) = W 的定义）
    const kS = S * 4 * 3;
    expect(Math.hypot(verts[kS] - verts[kS + 3], verts[kS + 2] - verts[kS + 5])).toBeCloseTo(W, 6);
    // y 只有顶与底两个值
    const ys = new Set<number>();
    for (let k = 1; k < verts.length; k += 3) ys.add(verts[k]);
    expect([...ys].sort()).toEqual([300, 334]);
    // 每个索引都在范围内
    for (const i of idx) expect(i).toBeLessThan(verts.length / 3);
  });

  it('还没挨上（外缘差 > 门槛）不搭；差一点点搭且切点处的格就是那道缝；盖过去（交叠）也不搭', () => {
    expect(bridgeWeb(rim(0, 0), rim(140, 0), 20, 7)).toBeNull(); // 缝 20 > 7
    const g = bridgeWeb(rim(0, 0), rim(125, 0), 20, 7)!;
    expect(g).not.toBeNull();
    expect(Math.hypot(g.verts[0] - g.verts[3], g.verts[2] - g.verts[5])).toBeCloseTo(5, 6);
    expect(bridgeWeb(rim(0, 0), rim(100, 0), 20, 7)).toBeNull(); // 盖过去 20，不是缝
    expect(bridgeWeb(rim(0, 0), rim(0, 0), 20, 7)).toBeNull(); // 同一处
  });

  it('方向无关：两圈沿任意方向相切，网关于连心线中垂面对称', () => {
    const th = 0.7;
    const g = bridgeWeb(rim(0, 0), rim(120 * Math.cos(th), 120 * Math.sin(th)), 20, 7, 4)!;
    const mid = { x: 60 * Math.cos(th), z: 60 * Math.sin(th) };
    for (let k = 0; k <= 4; k++) {
      const a = k * 12;
      const dA = Math.hypot(g.verts[a] - mid.x, g.verts[a + 2] - mid.z);
      const dB = Math.hypot(g.verts[a + 3] - mid.x, g.verts[a + 5] - mid.z);
      expect(dA).toBeCloseTo(dB, 3); // 顶点是 Float32，只比到 1e-3
    }
  });
});

