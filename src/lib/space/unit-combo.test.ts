import { beforeAll, describe, expect, it } from 'vitest';
import {
  COMBO_FORMS,
  COMBO_PLANS,
  COMBO_SPACINGS,
  COMBO_SPLIT,
  DECK_LEVEL_TOL,
  comboBridges,
  comboBuild,
  comboCamScale,
  comboCells,
  comboExtent,
  comboFieldSpan,
  comboFormDefs,
  comboFormIndex,
  comboMetrics,
  comboPairDistance,
  comboPositions,
  comboReading,
  comboScene,
} from './unit-combo';
import { RING, buildRingUnits } from './skin-ring';
import { buildSplitRingUnits, SPLIT_RING_TIERS } from './skin-split-ring';
import { MM_PER_UNIT, RIG_SCALE, ringCellGap, ringGridScene, roomSpan } from './skin-grid';
import { SKIN, createSkinUnit } from './skin-unit';
import { SOLID } from './skin-solid';

/**
 * 守门：Lab 2-11 单元组合（用户 2026-09-17 草图立项「研究不同形状的单元组合来形成不同的效果」）。
 * 卡的是这几条规则本身：
 * ① 五种形态的立面量表（挑出 / 峰值 / 顶底 / 走面 / 顶板）与引擎逐一对得上——间距与「读法」都建在它上面；
 * ② 引擎就是 Lab 2-5 / 2-8 那份（目录四形态 + 捏分 j0），组合研究不悄悄换单元；
 * ③ 相切 = 平台边贴边（按峰值）、分离 = 再加 Lab 2-7 的环间缝，逐对累加、整列居中；
 * ④ 一种形态只解一条：编制表 / 站位表对得上，织物网只搭同族相邻对；
 * ⑤ 「通道」的物理依据要真：直挑台走面与捏分下板顶几乎齐平（引擎量、不是查表）；
 * ⑥ 房间 = Lab 2-7 那一间，整列装得进去。
 */
const R = RING.RADIUS_DEF;
const DEFS = comboFormDefs();
const idx = (k: string) => comboFormIndex(k);

let measured: { reach: number; peak: number; top: number; bot: number; deck: number | null; roof: number | null }[] = [];
beforeAll(() => {
  measured = DEFS.map((d) => {
    const s = createSkinUnit(d.spec, d.opts);
    let peak = 0;
    for (let k = 0; k < SKIN.STEPS; k++) {
      s.advance();
      for (let i = 0; i < s.n; i++) peak = Math.max(peak, s.px[i] * SOLID.SCALE);
    }
    const foot = s.py[s.n - 1];
    let mx = 0;
    const ys: number[] = [];
    for (let i = 0; i < s.n; i++) {
      const x = s.px[i] * SOLID.SCALE;
      mx = Math.max(mx, x);
      if (x > 8) ys.push((s.py[i] - foot) * SOLID.SCALE);
    }
    ys.sort((a, b) => a - b);
    // 腔 = 材料在 y 上最大的那道空隙（> 20 px 才算腔）
    let gap = 0;
    let lo = 0;
    let hi = 0;
    for (let i = 1; i < ys.length; i++) {
      const g = ys[i] - ys[i - 1];
      if (g > gap) {
        gap = g;
        lo = ys[i - 1];
        hi = ys[i];
      }
    }
    const split = gap > 20;
    const top = ys[ys.length - 1];
    return {
      reach: mx,
      peak,
      top,
      bot: ys[0],
      deck: split ? lo : d.key === 'pocket' ? null : top,
      roof: split ? hi : null,
    };
  });
}, 120_000);

describe('形态词汇：实测量表与引擎对得上', () => {
  it('五种形态 = 目录四形态 + 捏分 j0，顺序与引擎表一致', () => {
    expect(COMBO_FORMS.map((f) => f.key)).toEqual(['pocket', 'bulb', 'ledge', 'stepped', 'split']);
    expect(DEFS.map((d) => d.key)).toEqual(COMBO_FORMS.map((f) => f.key));
    const ring = buildRingUnits();
    for (let i = 0; i < 4; i++) expect(DEFS[i].spec).toEqual(ring[i].spec);
    expect(DEFS[COMBO_SPLIT].spec).toEqual(buildSplitRingUnits([SPLIT_RING_TIERS[0]])[0].spec);
    expect(SPLIT_RING_TIERS[0].t).toBe(1); // j0 = 缝张满的那一档
  });
  it('带子节数 202 / 338', () => {
    DEFS.forEach((d, i) => expect(createSkinUnit(d.spec, d.opts).n).toBe(COMBO_FORMS[i].band));
  });
  it('挑出 / 峰值 / 顶底 / 走面 / 顶板逐一对上（±0.15 px）', () => {
    COMBO_FORMS.forEach((f, i) => {
      const m = measured[i];
      expect(Math.abs(m.reach - f.reach)).toBeLessThan(0.15);
      expect(Math.abs(m.peak - f.peakReach)).toBeLessThan(0.15);
      expect(Math.abs(m.top - f.top)).toBeLessThan(0.15);
      expect(Math.abs(m.bot - f.bot)).toBeLessThan(0.15);
      if (f.deck === null) expect(m.deck).toBeNull();
      else expect(Math.abs((m.deck as number) - f.deck)).toBeLessThan(0.15);
      if (f.roof === null) expect(m.roof).toBeNull();
      else expect(Math.abs((m.roof as number) - f.roof)).toBeLessThan(0.15);
    });
  });
  it('「通道」的物理依据：直挑台走面与捏分下板顶几乎齐平（引擎量），方箱高出一级', () => {
    const ledge = measured[idx('ledge')].deck as number;
    const split = measured[idx('split')].deck as number;
    expect(Math.abs(ledge - split)).toBeLessThan(2); // 1.2 px ≈ 半厘米
    expect(measured[idx('stepped')].deck! - ledge).toBeGreaterThan(20); // 9.6 cm 的台阶
    // 腔净空 ≈ 100 px（缝张到 100 的那一档）
    const s = measured[idx('split')];
    expect(s.roof! - s.deck!).toBeGreaterThan(95);
    expect(s.roof! - s.deck!).toBeLessThan(105);
  });
});

describe('组合：草图三张', () => {
  it('三种组合、槽位默认形态、距离两档', () => {
    expect(COMBO_PLANS.map((p) => p.key)).toEqual(['passage', 'platform', 'enclosure']);
    expect(COMBO_PLANS.map((p) => p.slots.map((s) => COMBO_FORMS[s].key))).toEqual([
      ['ledge', 'ledge', 'split', 'ledge'],
      ['ledge', 'bulb'],
      ['split', 'split'],
    ]);
    expect(COMBO_SPACINGS.map((s) => s.key)).toEqual(['touch', 'apart']);
  });
  it('相切 = 平台边贴边（按峰值），分离 = 再加 Lab 2-7 的环间缝，逐对累加、整列居中', () => {
    for (const P of COMBO_PLANS) {
      for (const sp of ['touch', 'apart'] as const) {
        const xs = comboPositions(P.slots, R, sp);
        for (let i = 1; i < xs.length; i++) {
          const a = COMBO_FORMS[P.slots[i - 1]];
          const b = COMBO_FORMS[P.slots[i]];
          const need = 2 * R + a.peakReach + b.peakReach + (sp === 'apart' ? ringCellGap(R) : 0);
          expect(xs[i] - xs[i - 1]).toBeCloseTo(need, 9);
          expect(comboPairDistance(P.slots[i - 1], P.slots[i], R, sp)).toBeCloseTo(need, 9);
        }
        const left = xs[0] - R - COMBO_FORMS[P.slots[0]].peakReach;
        const right = xs[xs.length - 1] + R + COMBO_FORMS[P.slots[P.slots.length - 1]].peakReach;
        expect(left + right).toBeCloseTo(0, 9);
        expect(comboExtent(P.slots, R, sp)).toBeCloseTo(right - left, 9);
      }
    }
  });
  it('一种形态只解一条：编制表与站位表对得上', () => {
    const b = comboBuild([2, 2, 4, 2], DEFS);
    expect(b.units.map((u) => u.key)).toEqual(['ledge', 'split']);
    expect(b.planForm).toEqual([2, 4]);
    expect(b.cellPlan).toEqual([0, 0, 1, 0]);
    expect(b.plans).toEqual([new Array(RING.COUNT).fill(0), new Array(RING.COUNT).fill(1)]);
    const cells = comboCells([2, 2, 4, 2], R, 'touch');
    expect(cells.map((c) => c.plan)).toEqual([0, 0, 1, 0]);
    expect(cells.every((c) => c.z === 0)).toBe(true);
    const xs = comboPositions([2, 2, 4, 2], R, 'touch');
    cells.forEach((c, i) => expect(c.x).toBeCloseTo(xs[i] * RIG_SCALE, 9));
  });
  it('织物网只搭相切的同族相邻对', () => {
    expect(comboBridges([2, 2, 4, 2], 'touch')).toEqual([[0, 1]]);
    expect(comboBridges([2, 1], 'touch')).toEqual([[0, 1]]);
    expect(comboBridges([4, 4], 'touch')).toEqual([[0, 1]]);
    expect(comboBridges([0, 0, 3], 'touch')).toEqual([[0, 1]]);
    expect(comboBridges([0, 2], 'touch')).toEqual([]);
    expect(comboBridges([4, 4], 'apart')).toEqual([]);
  });
});

describe('读法：由槽位推出来', () => {
  it('通道：走面连续 + 一格有顶', () => {
    const m = comboMetrics([2, 2, 4, 2], R, 'touch');
    expect(m.deckSlots).toBe(4);
    expect(m.roofSlots).toBe(1);
    expect(m.levelPairs).toBe(3);
    expect((m.deckStepM as number) * 100).toBeLessThan(3);
    expect(m.cavityM as number).toBeCloseTo(((177.8 - 78.4) * RIG_SCALE * MM_PER_UNIT) / 1000, 3);
    expect(comboReading([2, 2, 4, 2], R, 'touch')).toContain('走面连续');
    expect(comboReading([2, 2, 4, 2], R, 'touch', 'en')).toContain('roofed');
  });
  it('平台：直挑台 + 蘑菇 落差 2 cm 连成一片；换方箱就是一个 9.6 cm 的台阶', () => {
    const m = comboMetrics([2, 1], R, 'touch');
    expect(m.levelPairs).toBe(1);
    expect((m.deckStepM as number) * 100).toBeGreaterThan(1.5);
    expect((m.deckStepM as number) * 100).toBeLessThan(2.5);
    const s = comboMetrics([2, 3], R, 'touch');
    expect(s.levelPairs).toBe(0);
    expect((s.deckStepM as number) * 100).toBeGreaterThan(9);
    expect(comboReading([2, 3], R, 'touch')).toContain('台阶');
    expect(DECK_LEVEL_TOL * RIG_SCALE * MM_PER_UNIT).toBeLessThan(31); // ≤ 3 cm
  });
  it('密闭：两个腔在缝口接通，深 = 两个挑出、净空 0.39 m；不按「走面落差」读', () => {
    const m = comboMetrics([4, 4], R, 'touch');
    expect(m.roofSlots).toBe(2);
    expect(m.cavitySpanM as number).toBeCloseTo(((83.1 + 83.1) * RIG_SCALE * MM_PER_UNIT) / 1000, 3);
    expect(m.deckStepM).toBeNull();
    const r = comboReading([4, 4], R, 'touch');
    expect(r).toContain('接通');
    expect(r).not.toContain('走面');
    expect(comboMetrics([4, 4], R, 'apart').cavitySpanM).toBeNull();
  });
  it('袋：只报挂袋，不报走面', () => {
    const m = comboMetrics([0, 0], R, 'touch');
    expect(m.bagSlots).toBe(2);
    expect(m.deckSlots).toBe(0);
    expect(comboReading([0, 0], R, 'touch')).toBe('2 个挂袋');
  });
});

describe('摆进房间', () => {
  it('房间 = Lab 2-7 那一间（同半径下地板与两面墙逐位相同），小人在整列近侧角外', () => {
    for (const P of COMBO_PLANS) {
      const sc = comboScene(P.slots, R, 'touch');
      const ref = ringGridScene(R);
      expect(sc.length).toBe(ref.length);
      for (let i = 0; i < 3; i++) {
        expect(sc[i].kind).toBe('room');
        expect(Array.from(sc[i].verts)).toEqual(Array.from(ref[i].verts));
      }
      expect(sc[3].kind).toBe('figure');
    }
  });
  it('整列在两档距离、整个半径量程内都装得进房间', () => {
    for (const P of COMBO_PLANS)
      for (const sp of ['touch', 'apart'] as const)
        for (const r of [RING.RADIUS_MIN, R, RING.RADIUS_MAX]) {
          const span = comboFieldSpan(P.slots, r, sp);
          expect(span).toBeCloseTo(comboExtent(P.slots, r, sp) * RIG_SCALE, 9);
          expect(span).toBeLessThan(roomSpan(r));
        }
  });
  it('取景随占宽退：四个视角都有正的 scale，长列比短列取得更远', () => {
    for (const v of ['axon', 'front', 'side', 'top']) {
      const long = comboCamScale([2, 2, 4, 2], R, 'touch', v);
      const short = comboCamScale([2, 1], R, 'touch', v);
      expect(long).toBeGreaterThan(0);
      expect(short).toBeGreaterThan(long);
    }
  });
});
