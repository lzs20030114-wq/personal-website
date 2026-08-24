import { describe, expect, it } from 'vitest';
import { ARRAY_CENTER, ARRAY_FREE, ARRAY_LEAD, ARRAY_TAIL } from './skin-array';
import { SKIN_UNITS } from './skin-data';
import { SOLID } from './skin-solid';
import {
  RAIL_HALF,
  RAIL_INSET,
  RING,
  RING_BAND_NODES,
  RING_DEFAULT_FORM,
  buildRingOrder,
  buildRingUnits,
  ringAngle,
  ringGap,
  ringPitch,
} from './skin-ring';
import { SKIN, createSkinUnit, type SkinBond } from './skin-unit';

/**
 * 守门：Lab.09 圆筒环列的编制（键谱层 + 环上几何）。物理零涉及——
 * 引擎与 Lab.06 逐字同一份，这里卡的是「一种键谱围成的筒读不读得出来」：
 * 一圈同一种（用户 2026-08-23 纠偏，混着摆的首版被否）、四种可互换而不跳台阶、
 * 形态未被搬动、半径下限不互穿。
 */

const DEFS = buildRingUnits();

/** 跑完一轮收缩（四条带，约 2s）——多个用例共用，别重复跑 */
let RUN: ReturnType<typeof runAll> | null = null;
function runAll() {
  const sims = DEFS.map((d) => createSkinUnit(d.spec, d.opts));
  for (const s of sims) for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return DEFS.map((d, i) => {
    const s = sims[i];
    const bonds = (d.spec[1] as readonly [string, number, readonly SkinBond[]])[2];
    let widest = bonds[0];
    for (const b of bonds) if (b[1] - b[0] > widest[1] - widest[0]) widest = b;
    const off = (d.spec[0] as readonly [string, number])[1];
    const foot = s.py[s.n - 1];
    let outX = 0;
    let minX = 0;
    for (let k = 0; k < s.n; k++) {
      outX = Math.max(outX, s.px[k]);
      minX = Math.min(minX, s.px[k]);
    }
    return {
      key: d.key,
      sim: s,
      /** 嘴心（最外键对中点）距下缘的高度，px */
      mouth: ((s.py[off + widest[0]] + s.py[off + widest[1]]) / 2 - foot) * SOLID.SCALE,
      /** 带顶距下缘 = 收缩后的筒高，px */
      top: (s.py[0] - foot) * SOLID.SCALE,
      /** 挑出的最大离轴距离，px */
      outX: outX * SOLID.SCALE,
      minX: minX * SOLID.SCALE,
    };
  });
}
const run = (): ReturnType<typeof runAll> => (RUN ??= runAll());

describe('skin-ring 圆筒环列', () => {
  it('编制：一圈 20 位全指同一条引擎（用户拍板：一个环只用一种形状）', () => {
    const order = buildRingOrder();
    expect(order.length).toBe(RING.COUNT);
    expect(new Set(order).size).toBe(1); // 混四种的首版被否：平台不连续
    expect(order.every((v) => v === 0)).toBe(true);
    // 四种键谱仍全部备着，是「选哪一种」的选项
    expect(DEFS.length).toBe(4);
    expect(DEFS[RING_DEFAULT_FORM].key).toBe('stepped'); // 默认方箱：顶面找平过
    // 方位角均分整圈
    expect(ringAngle(0)).toBe(0);
    expect(ringAngle(RING.COUNT)).toBeCloseTo(Math.PI * 2, 12);
  });

  it('四条带三段等长——嘴心对位构造的前提', () => {
    expect(RING_BAND_NODES).toBe(ARRAY_LEAD + ARRAY_FREE + ARRAY_TAIL);
    for (const d of DEFS) {
      const total = d.spec.reduce((s, seg) => s + seg[1], 0);
      expect(total).toBe(RING_BAND_NODES);
      expect(d.spec.map((seg) => seg[0])).toEqual(['g', 'f', 'g']);
      expect(d.spec[1][1]).toBe(ARRAY_FREE);
    }
  });

  it('形态未被搬动：只是整体平移——跨度集/键长/面板跨度逐位不动', () => {
    DEFS.forEach((d, i) => {
      const src = SKIN_UNITS[i].spec[1];
      const dst = d.spec[1];
      expect(src[0]).toBe('f');
      expect(dst[0]).toBe('f');
      if (src[0] !== 'f' || dst[0] !== 'f') return;
      const a = src[2];
      const b = dst[2];
      expect(b.length).toBe(a.length);
      const shift = b[0][0] - a[0][0];
      a.forEach(([i0, j0, rb], k) => {
        expect(b[k][0]).toBe(i0 + shift); // 同一个平移量
        expect(b[k][1]).toBe(j0 + shift);
        expect(b[k][2]).toBe(rb); // 键长逐位不动
        expect(b[k][1] - b[k][0]).toBe(j0 - i0); // 跨度逐位不动
      });
      const pa = src.length === 4 ? src[3] : undefined;
      const pb = dst.length === 4 ? dst[3] : undefined;
      expect(!!pb).toBe(!!pa);
      if (pa && pb) pa.forEach(([x, y], k) => expect(pb[k]).toEqual([x + shift, y + shift]));
    });
  });

  it('键谱两端各留 ≥4 节缓冲（交接件纪律），扇形正居中在自由段上', () => {
    for (const d of DEFS) {
      const bonds = (d.spec[1] as readonly [string, number, readonly SkinBond[]])[2];
      let lo = Number.POSITIVE_INFINITY;
      let hi = -1;
      for (const [i, j] of bonds) {
        lo = Math.min(lo, i);
        hi = Math.max(hi, j);
      }
      expect(lo).toBeGreaterThanOrEqual(4);
      expect(ARRAY_FREE - 1 - hi).toBeGreaterThanOrEqual(4);
      // 正居中 ⇒ 上下缓冲等长 ⇒ 嘴心与键长无关（skin-array 文件头的构造）
      expect((lo + hi) / 2).toBeCloseTo(ARRAY_CENTER, 12);
    }
  });

  it('真跑：四条带各自锁定成形、皮不穿芯、终态无 NaN', () => {
    for (const r of run()) {
      expect(r.sim.locked.length, r.key).toBeGreaterThan(0);
      expect(r.outX, r.key).toBeGreaterThan(20); // 确实挑出来了
      expect(r.minX, r.key).toBeGreaterThanOrEqual(-1e-9); // coreWall：不穿到轴的另一侧
      for (let i = 0; i < r.sim.n; i++) {
        expect(Number.isFinite(r.sim.px[i])).toBe(true);
        expect(Number.isFinite(r.sim.py[i])).toBe(true);
      }
    }
  });

  it('四种形态可互换：同一收缩终点的三种，嘴心与筒高逐位齐平（实测散布 0.08px）', () => {
    const m = run()
      .filter((r) => r.key !== 'pocket')
      .map((r) => r.mouth);
    expect(m.length).toBe(3);
    expect(Math.max(...m) - Math.min(...m)).toBeLessThan(0.5);
    // 上缘也齐：三条同 r₁ ⇒ 收缩后筒高逐位相同
    const t = run()
      .filter((r) => r.key !== 'pocket')
      .map((r) => r.top);
    expect(Math.max(...t) - Math.min(...t)).toBeLessThan(0.01);
  });

  it('换成袋那一环整体更高更浅：它的 ℓ 是另一个（系统语义，不是没对齐）', () => {
    const rows = run();
    const pocket = rows.find((r) => r.key === 'pocket')!;
    const flat = rows.find((r) => r.key === 'stepped')!;
    expect(pocket.sim.r).toBeCloseTo(0.66, 6);
    expect(flat.sim.r).toBeCloseTo(SKIN.R1, 6);
    expect(pocket.mouth - flat.mouth).toBeGreaterThan(15); // 嘴心高约 22px
    expect(pocket.top - flat.top).toBeGreaterThan(30); // 带顶高约 44px
  });

  it('半径下限卡在「相邻带刚好不互穿」上——芯轨那一圈也不穿', () => {
    expect(ringGap(RING.RADIUS_MIN)).toBeGreaterThan(0);
    expect(ringGap(RING.RADIUS_MIN - 2)).toBeLessThan(0); // 下限是紧的，不是随手取的
    expect(RING.RADIUS_DEF).toBeGreaterThanOrEqual(RING.RADIUS_MIN);
    expect(RING.RADIUS_DEF).toBeLessThanOrEqual(RING.RADIUS_MAX);
    // 芯轨比站位圆再靠内，那一圈的间隙才是最小的
    const railGap = ringPitch(RING.RADIUS_MIN - RAIL_INSET) - 2 * RAIL_HALF.t;
    expect(railGap).toBeGreaterThan(0);
  });

  it('缝随半径长：平台外缘的缝远宽于芯上的缝（用户 2026-08-23 拍板接受）', () => {
    const reach = Math.max(...run().map((r) => r.outX));
    const inner = ringGap(RING.RADIUS_DEF);
    const outer = ringGap(RING.RADIUS_DEF + reach);
    expect(outer).toBeGreaterThan(inner + 8);
    // 缝正比于半径：外缘节距 / 芯上节距 = 半径之比
    expect(ringPitch(RING.RADIUS_DEF + reach) / ringPitch(RING.RADIUS_DEF)).toBeCloseTo(
      (RING.RADIUS_DEF + reach) / RING.RADIUS_DEF,
      12,
    );
  });

  it('带深是 Lab.08 窄带的一半，厚度随之收窄（否则截面近正方形，读成方棍）', () => {
    expect(RING.DEPTH).toBeCloseTo(15.6 * 0.5, 12);
    expect(RING.THICK).toBeLessThan(SOLID.THICK);
    expect(RING.THICK).toBeLessThan(RING.DEPTH / 2);
  });
});
