import { beforeAll, describe, expect, it } from 'vitest';
import {
  COMBO_DECK,
  COMBO_DEFAULT_FORM,
  COMBO_FAMILIES,
  COMBO_PLANS,
  COMBO_SPACINGS,
  JOINT_LEVEL_TOL,
  SPLIT_SHELF,
  SQUARE_DECK,
  bandToward,
  comboBridges,
  comboBuild,
  comboCamScale,
  comboCellPlan,
  comboCells,
  comboExtent,
  comboFamily,
  comboFamilyRig,
  comboFieldSpan,
  comboForms,
  comboJoints,
  comboMetrics,
  comboPlan,
  comboPositions,
  comboRate,
  comboReading,
  comboScene,
  crestOffset,
  deckAt,
  leadOf,
  segmentLeads,
  specNodes,
  splitOrder,
  unitAtLead,
  unitHalf,
  unitLeads,
  type ComboFamilyKey,
  type WaveUnit,
} from './unit-combo';
import { RING, RING_LEAD, RING_TAIL, RING_WAVE, buildWaveUnits, waveLeads, type RingUnitDef } from './skin-ring';
import { SPLIT_RING_TIERS, buildSplitRingUnits } from './skin-split-ring';
import { SQUARE_PHASE, SQUARE_TIERS, SQUARE_WAVE, squareLead, squareSpec, squareWaveLeads, buildSquareUnits } from './skin-square';
import { SQSPLIT, SQSPLIT_TIERS, buildSquareSplitOrder, buildSquareSplitUnits, sqSplitPairOf } from './skin-square-split';
import { UNIT_FORMS } from './unit-cluster';
import { MM_PER_UNIT, RIG_SCALE, ringCellGap, ringGridScene, roomSpan } from './skin-grid';
import { SKIN, createSkinUnit } from './skin-unit';
import { SOLID } from './skin-solid';

/**
 * 守门：Lab 2-11 单元组合（2026-09-20 用户纠偏后的读法 + 三张图形 + 方单元版本）。卡的是这几条规则本身：
 * ① 走面基准 / 捏分缝口的下板顶与上板底都是引擎量出来的（两族各一遍），且「起伏 = 纯平移」两族真成立；
 * ② 高度段 = 整段时逐位就是各族自己的起伏编制；相位把峰放在指定的带、谷在对面；捏分缝口朝指定的带；
 * ③ 三张图形 + 五种接法的接缝读数：① 两条接缝齐平且从顶落到谷底 / ② 圆环缝口接坡齐平、方环差 8 cm、坡顶接平台齐平 /
 *    ③ 腔接通；台阶 = 整个量程；续坡齐平且爬完量程；凹在最低、拱在最高；
 * ④ 一种键谱一个 lead 一条引擎、捏分一族只解一次；编制表每条带指向它该指的引擎；
 * ⑤ 站位相切 = 半宽相加、分离加各族的环间缝；房间 = Lab 2-7 那一间；装得进房间；取景；
 * ⑥ 方形捏分的 `pole` 参数默认 = SQSPLIT.POLE（Lab 2-6 逐位不变）。
 */
const R = RING.RADIUS_DEF;
const FORMS = comboForms();
const LEDGE = COMBO_DEFAULT_FORM;
const FAMS: ComboFamilyKey[] = ['round', 'square'];

const topOf = (spec: { spec: RingUnitDef['spec']; opts: RingUnitDef['opts'] }) => {
  const s = createSkinUnit(spec.spec, spec.opts);
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  const foot = s.py[s.n - 1];
  const ys: number[] = [];
  for (let i = 0; i < s.n; i++) if (s.px[i] * SOLID.SCALE > 8) ys.push((s.py[i] - foot) * SOLID.SCALE);
  ys.sort((a, b) => a - b);
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
  return { top: ys[ys.length - 1], shelf: gap > 20 ? { deck: lo, roof: hi } : null };
};

let measured: {
  round: (number | null)[];
  roundShift: number;
  square: number;
  squareShift: number;
  splitRound: { deck: number; roof: number } | null;
  splitSquare: { deck: number; roof: number } | null;
  blockSquare: number;
};
beforeAll(() => {
  const sq = buildSquareUnits();
  const sqSplit = buildSquareSplitUnits();
  const j0 = SQSPLIT_TIERS.findIndex((t) => t.pair === 0 && t.cls === 0);
  const j9 = SQSPLIT_TIERS.findIndex((t) => t.pair === 9 && t.cls === 0);
  measured = {
    round: FORMS.map((f, i) => (i === 0 ? null : topOf(f).top)),
    roundShift: topOf(unitAtLead(FORMS[LEDGE], 36)).top,
    square: topOf(sq[0]).top,
    squareShift: topOf({ spec: squareSpec(SQUARE_TIERS[0].k, undefined, 115), opts: sq[0].opts }).top,
    splitRound: topOf(buildSplitRingUnits([SPLIT_RING_TIERS[0]])[0]).shelf,
    splitSquare: topOf(sqSplit[j0]).shelf,
    blockSquare: topOf(sqSplit[j9]).top,
  };
}, 240_000);

describe('走面与缝口：两族都是引擎量出来的', () => {
  it('圆环四形态走面基准（±0.15）；方环三档同高的箱顶 118.7（±0.15）', () => {
    expect(COMBO_DECK[0]).toBeNull();
    for (let i = 1; i < 4; i++) expect(Math.abs((measured.round[i] as number) - (COMBO_DECK[i] as number))).toBeLessThan(0.15);
    expect(Math.abs(measured.square - SQUARE_DECK)).toBeLessThan(0.15);
  });
  it('起伏 = 纯平移：圆环 lead 36 与方环 lead 115 各真跑一遍，走面 = 基准 + 2·Δlead（±0.5）', () => {
    expect(Math.abs(measured.roundShift - (deckAt('round', LEDGE, 36) as number))).toBeLessThan(0.5);
    expect(Math.abs(measured.squareShift - (deckAt('square', 0, 115) as number))).toBeLessThan(0.5);
    expect(deckAt('round', LEDGE, RING_LEAD)).toBe(COMBO_DECK[LEDGE]);
    expect(deckAt('square', 0, squareLead())).toBe(SQUARE_DECK);
    expect(deckAt('round', 0, 30)).toBeNull();
  });
  it('捏分缝口（pair 0）的下板顶 / 上板底与整块顶（±0.2）', () => {
    expect(measured.splitRound).not.toBeNull();
    expect(Math.abs(measured.splitRound!.deck - SPLIT_SHELF.round.deck)).toBeLessThan(0.2);
    expect(Math.abs(measured.splitRound!.roof - SPLIT_SHELF.round.roof)).toBeLessThan(0.2);
    expect(measured.splitSquare).not.toBeNull();
    expect(Math.abs(measured.splitSquare!.deck - SPLIT_SHELF.square.deck)).toBeLessThan(0.2);
    expect(Math.abs(measured.splitSquare!.roof - SPLIT_SHELF.square.roof)).toBeLessThan(0.2);
    expect(Math.abs(measured.blockSquare - SPLIT_SHELF.square.block)).toBeLessThan(0.2);
  });
  it('量程：圆环 88 px = 0.35 m · 方环 40 px = 0.16 m', () => {
    expect(comboFamily('round').LOW - comboFamily('round').HIGH).toBe(44);
    expect(comboFamily('square').LOW - comboFamily('square').HIGH).toBe(20);
    expect((88 * RIG_SCALE * MM_PER_UNIT) / 1000).toBeCloseTo(0.35, 2);
  });
});

describe('相位、高度段、缝口朝向', () => {
  it('整段 = 各族自己的起伏 11 级逐位；半段单调；出量程即抛', () => {
    expect(segmentLeads(RING_WAVE.LOW, RING_WAVE.HIGH, 'round')).toEqual(waveLeads());
    // 方环 6 级（引擎数减半），两端仍是它自己的起伏量程、余弦单调
    const sq = segmentLeads(SQUARE_WAVE.LOW, SQUARE_WAVE.HIGH, 'square');
    expect(sq.length).toBe(6);
    expect(sq[0]).toBe(squareWaveLeads()[0]);
    expect(sq[5]).toBe(squareWaveLeads()[10]);
    for (let l = 1; l < sq.length; l++) expect(sq[l]).toBeLessThanOrEqual(sq[l - 1]);
    const half = segmentLeads(58, 36, 'round');
    expect(half[0]).toBe(58);
    expect(half[10]).toBe(36);
    for (let l = 1; l < half.length; l++) expect(half[l]).toBeLessThanOrEqual(half[l - 1]);
    expect(() => segmentLeads(36, 58, 'round')).toThrow();
    expect(() => segmentLeads(58, 10, 'round')).toThrow();
    expect(() => segmentLeads(140, 115, 'square')).toThrow();
    expect(leadOf('round', 0)).toBe(58);
    expect(leadOf('round', 1)).toBe(14);
    expect(leadOf('round', 0.5)).toBe(36);
    expect(leadOf('square', 0)).toBe(135);
    expect(leadOf('square', 1)).toBe(115);
  });
  it('峰落在指定的带、谷在正对面；两族都是', () => {
    for (const fam of FAMS)
      for (const crest of [0, 3, 10, 17]) {
        const ul = unitLeads({ kind: 'wave', crest, lo: 0, hi: 1 }, fam);
        const F = comboFamily(fam);
        expect(ul[crest]).toBe(F.HIGH);
        expect(ul[(crest + 10) % 20]).toBe(F.LOW);
      }
    expect(crestOffset(0)).toBe(10);
    expect(unitLeads({ kind: 'wave', crest: 0, lo: 0, hi: 0 }, 'round').every((l) => l === 58)).toBe(true);
  });
  it('crest 0 且整段 = Lab 2-5 起伏编制那 11 条引擎（同一副构造）', () => {
    const wave = buildWaveUnits(FORMS[LEDGE]);
    const b = comboBuild({ key: 't', zh: '', en: '', label: '', units: [{ kind: 'wave', crest: 0, lo: 0, hi: 1 }] }, 'round', FORMS[LEDGE], LEDGE);
    expect(b.units.length).toBe(11);
    for (const u of b.units) {
      const w = wave.find((v) => v.spec[0][1] === u.spec[0][1]);
      expect(w).toBeDefined();
      expect(u.spec).toEqual(w!.spec);
    }
  });
  it('缝口朝向：圆环 face 0 ⇒ pair 0 在带 0 与 19、整块在 9/10；方环 face 0 ⇒ 极点 +X、face 10 ⇒ −X', () => {
    const r0 = splitOrder('round', 0).map((t) => SPLIT_RING_TIERS[t].pair);
    expect(r0[0]).toBe(0);
    expect(r0[19]).toBe(0);
    expect(r0[9]).toBe(9);
    expect(r0[10]).toBe(9);
    const r10 = splitOrder('round', 10).map((t) => SPLIT_RING_TIERS[t].pair);
    expect(r10[10]).toBe(0);
    expect(r10[0]).toBe(9);
    const s0 = splitOrder('square', 0).map((t) => SQSPLIT_TIERS[t].pair);
    expect(s0[0]).toBe(0);
    expect(s0[19]).toBe(0);
    expect(s0[9]).toBe(9);
    expect(s0[10]).toBe(9);
    const s10 = splitOrder('square', 10).map((t) => SQSPLIT_TIERS[t].pair);
    expect(s10[10]).toBe(0);
    expect(s10[0]).toBe(9);
  });
  it('方形捏分的 pole 参数默认 = SQSPLIT.POLE（Lab 2-6 逐位不变）', () => {
    expect(buildSquareSplitOrder()).toEqual(buildSquareSplitOrder(20, SQSPLIT.POLE));
    for (let i = 0; i < 20; i++) expect(sqSplitPairOf(i)).toBe(sqSplitPairOf(i, 20, SQSPLIT.POLE));
    expect(buildSquareSplitOrder(20, 0)).not.toEqual(buildSquareSplitOrder(20, 2));
  });
  it('朝向 → 带：圆环 +X 是带 0、−X 是带 10；方环（相位 9°）同样是 0 / 10', () => {
    expect(bandToward(0)).toBe(0);
    expect(bandToward(Math.PI)).toBe(10);
    expect(bandToward(0, SQUARE_PHASE)).toBe(0);
    expect(bandToward(Math.PI, SQUARE_PHASE)).toBe(10);
  });
});

describe('三张图形 + 五种接法：接缝读数', () => {
  const J = (key: string, fam: ComboFamilyKey) => comboJoints(comboPlan(key), fam, LEDGE);
  it('① 坡降：两条接缝齐平，从峰顶落到谷底再平（两族）', () => {
    for (const fam of FAMS) {
      const js = J('descend', fam);
      expect(js.length).toBe(2);
      for (const j of js) expect(Math.abs(j.step as number)).toBeLessThanOrEqual(JOINT_LEVEL_TOL);
      const F = comboFamily(fam);
      const m = comboMetrics(comboPlan('descend'), fam, LEDGE, R, 'touch');
      expect(((m.highM as number) - (m.lowM as number)) * 1000).toBeCloseTo(2 * (F.LOW - F.HIGH) * RIG_SCALE * MM_PER_UNIT, 6);
      expect(js[1].deckB).toBe(deckAt(fam, LEDGE, F.LOW)); // 落到谷底的平台
    }
  });
  it('② 升台：圆环缝口下板接坡谷齐平（1.2 px）、坡顶接平台齐平；方环缝口那道差 8 cm，坡顶接平台齐平', () => {
    const r = J('rise', 'round');
    expect(r[0].deckA).toBe(SPLIT_SHELF.round.deck);
    expect(Math.abs(r[0].step as number)).toBeLessThan(2);
    expect(r[1].step).toBe(0);
    expect(r[1].deckB).toBe(deckAt('round', LEDGE, RING_WAVE.HIGH));
    expect(comboReading(comboPlan('rise'), 'round', LEDGE, R, 'touch')).toContain('接缝全齐平');
    expect(comboReading(comboPlan('rise'), 'round', LEDGE, R, 'touch')).toContain('一格有顶');
    const s = J('rise', 'square');
    expect(s[0].deckA).toBe(SPLIT_SHELF.square.deck);
    expect((s[0].step as number) * RIG_SCALE * MM_PER_UNIT).toBeCloseTo(80, -1); // ≈ 8 cm
    expect(s[1].step).toBe(0);
    expect(comboReading(comboPlan('rise'), 'square', LEDGE, R, 'touch')).toContain('落差 8 cm');
  });
  it('③ 合腔：两个缝口相对，腔接通、净空 0.39 m（两族）', () => {
    for (const fam of FAMS) {
      const [j] = J('enclose', fam);
      expect(j.cavity).toBe(true);
      const m = comboMetrics(comboPlan('enclose'), fam, LEDGE, R, 'touch');
      expect(m.cavityJoints).toBe(1);
      expect(m.headroomM).toBeCloseTo(0.39, 2);
      expect(comboReading(comboPlan('enclose'), fam, LEDGE, R, 'touch')).toContain('接通');
    }
  });
  it('台阶 = 整个量程；续坡与三段坡齐平且爬完量程；凹在最低、拱在最高', () => {
    for (const fam of FAMS) {
      const F = comboFamily(fam);
      const range = 2 * (F.LOW - F.HIGH);
      expect(Math.abs(J('step', fam)[0].step as number)).toBeCloseTo(range, 9);
      expect(J('ramp', fam)[0].step).toBe(0);
      for (const j of J('ramp3', fam)) expect(Math.abs(j.step as number)).toBeLessThanOrEqual(JOINT_LEVEL_TOL);
      const m = comboMetrics(comboPlan('ramp'), fam, LEDGE, R, 'touch');
      expect(((m.highM as number) - (m.lowM as number)) * 1000).toBeCloseTo(range * RIG_SCALE * MM_PER_UNIT, 6);
      const [v] = J('valley', fam);
      expect(v.step).toBe(0);
      expect(v.deckA).toBe(deckAt(fam, LEDGE, F.LOW));
      const [a] = J('arch', fam);
      expect(a.step).toBe(0);
      expect(a.deckA).toBe(deckAt(fam, LEDGE, F.HIGH));
    }
    expect(comboReading(comboPlan('step'), 'round', LEDGE, R, 'touch')).toContain('落差 35 cm');
  });
  it('袋：圆环起伏单元没有走面，读法直说', () => {
    expect(comboJoints(comboPlan('step'), 'round', 0)[0].step).toBeNull();
    expect(comboReading(comboPlan('step'), 'round', 0, R, 'touch')).toContain('袋');
  });
});

describe('解什么、摆到哪', () => {
  it('圆环：一个 lead 一条引擎（台阶 11、续坡 21、坡降 21 + 平台共用）；捏分十条只解一次；编制表指向自己的 lead', () => {
    const step = comboBuild(comboPlan('step'), 'round', FORMS[LEDGE], LEDGE);
    expect(step.units.length).toBe(11);
    expect(step.plans.length).toBe(1);
    expect(step.cellPlan).toEqual([0, 0]);
    const ramp = comboBuild(comboPlan('ramp'), 'round', FORMS[LEDGE], LEDGE);
    expect(ramp.units.length).toBe(21);
    expect(ramp.plans.length).toBe(2);
    ramp.plans.forEach((bands, v) => {
      const want = unitLeads(comboPlan('ramp').units[v] as WaveUnit, 'round');
      bands.forEach((e, i) => expect(ramp.units[e].spec[0][1]).toBe(want[i]));
    });
    for (const u of ramp.units) expect(u.spec[0][1] + u.spec[2][1]).toBe(RING_LEAD + RING_TAIL);
    const desc = comboBuild(comboPlan('descend'), 'round', FORMS[LEDGE], LEDGE);
    expect(desc.units.length).toBe(21); // 平台的 lead 58 与下半段共用
    const enc = comboBuild(comboPlan('enclose'), 'round', FORMS[LEDGE], LEDGE);
    expect(enc.units.length).toBe(10);
    expect(enc.plans.length).toBe(2); // 两个朝向不同 ⇒ 两份编制、同十条引擎
    const rise = comboBuild(comboPlan('rise'), 'round', FORMS[LEDGE], LEDGE);
    expect(rise.units.length).toBe(10 + 11); // 平台的 lead 14 与坡共用
    expect(comboCellPlan(comboPlan('rise'), 'round')).toEqual(rise.cellPlan);
  });
  it('方环：起伏按 (方位类, lead) 去重（6 级 ⇒ 一个整段单元 ≤ 12 条）、捏分十条只解一次', () => {
    const step = comboBuild(comboPlan('step'), 'square', FORMS[LEDGE], LEDGE);
    expect(step.units.length).toBeLessThanOrEqual(12);
    expect(step.plans.length).toBe(1);
    for (const u of step.units) expect(createSkinUnit(u.spec, u.opts).n).toBe(305);
    const enc = comboBuild(comboPlan('enclose'), 'square', FORMS[LEDGE], LEDGE);
    expect(enc.units.length).toBe(10);
    expect(enc.plans.length).toBe(2);
    expect(enc.plans[0]).toEqual(buildSquareSplitOrder(20, 0));
    expect(enc.plans[1]).toEqual(buildSquareSplitOrder(20, 2));
  });
  it('相切 = 两边半宽相加；分离再加各族的环间缝；整列居中；起伏与捏分半宽各按各的', () => {
    expect(unitHalf('round', { kind: 'wave', crest: 0, lo: 0, hi: 1 }, LEDGE)).toBeCloseTo(R + UNIT_FORMS[LEDGE].peakReach, 9);
    expect(unitHalf('round', { kind: 'split', face: 0 }, LEDGE)).toBeCloseTo(R + 84.3, 9);
    for (const fam of FAMS)
      for (const sp of ['touch', 'apart'] as const) {
        const P = comboPlan('rise');
        const xs = comboPositions(P, fam, LEDGE, R, sp);
        const h = P.units.map((u) => unitHalf(fam, u, LEDGE));
        const gap = sp === 'apart' ? (fam === 'round' ? ringCellGap(R) : comboFamily('square').gap(R)) : 0;
        expect(xs[1] - xs[0]).toBeCloseTo(h[0] + h[1] + gap, 9);
        expect(xs[2] - xs[1]).toBeCloseTo(h[1] + h[2] + gap, 9);
        expect(xs[0] - h[0] + (xs[2] + h[2])).toBeCloseTo(0, 9);
        expect(comboExtent(P, fam, LEDGE, R, sp)).toBeCloseTo(xs[2] + h[2] - (xs[0] - h[0]), 9);
        const cells = comboCells(P, fam, LEDGE, R, sp);
        cells.forEach((c, i) => expect(c.x).toBeCloseTo(xs[i] * RIG_SCALE, 9));
        expect(cells.map((c) => c.plan)).toEqual([0, 1, 2]);
      }
    expect(comboBridges(comboPlan('ramp3'), 'round', 'touch')).toEqual([{ a: 0, b: 1 }, { a: 1, b: 2 }]);
    expect(comboBridges(comboPlan('ramp3'), 'round', 'apart')).toEqual([]);
    // 捏分缝口不当一片台：② 只有下板接坡；③ 上板接上板、下板接下板，腔留空（两族同）
    for (const fam of ['round', 'square'] as const) {
      expect(comboBridges(comboPlan('rise'), fam, 'touch')).toEqual([{ a: 0, b: 1, plateA: 'lower' }, { a: 1, b: 2 }]);
      expect(comboBridges(comboPlan('enclose'), fam, 'touch')).toEqual([
        { a: 0, b: 1, plateA: 'upper', plateB: 'upper' },
        { a: 0, b: 1, plateA: 'lower', plateB: 'lower' },
      ]);
    }
  });
  it('速率按节点量降：轻的 80、最重的一档不低于 30，且单调', () => {
    expect(comboRate(comboBuild(comboPlan('step'), 'round', FORMS[LEDGE], LEDGE).units)).toBe(80);
    let prev = Infinity;
    for (const [P, fam] of [['step', 'round'], ['rise', 'round'], ['descend', 'square']] as const) {
      const b = comboBuild(comboPlan(P), fam, FORMS[LEDGE], LEDGE);
      const nodes = b.units.reduce((a, u) => a + specNodes(u.spec), 0);
      const r = comboRate(b.units);
      expect(r).toBeGreaterThanOrEqual(30);
      expect(r).toBeLessThanOrEqual(80);
      expect(nodes * r).toBeLessThanOrEqual(80 * 4500 + nodes); // 节点 × 速率 ≈ 恒定上限（取整误差）
      expect(r).toBeLessThanOrEqual(prev);
      prev = r;
    }
  });
  it('预设、两族、距离两档登记齐全；每个预设两族都建得出', () => {
    expect(COMBO_PLANS.map((p) => p.key)).toEqual(['descend', 'rise', 'enclose', 'step', 'ramp', 'ramp3', 'valley', 'arch']);
    expect(COMBO_FAMILIES.map((f) => f.key)).toEqual(['round', 'square']);
    expect(COMBO_SPACINGS.map((s) => s.key)).toEqual(['touch', 'apart']);
    for (const P of COMBO_PLANS) for (const fam of FAMS) expect(() => comboBuild(P, fam, FORMS[LEDGE], LEDGE)).not.toThrow();
    expect(comboFamilyRig('square').radius.min).toBe(comboFamilyRig('square').radius.max);
    expect(comboFamilyRig('square').angleOffset).toBe(SQUARE_PHASE);
    expect(comboFamilyRig('round').angleOffset).toBe(0);
  });
});

describe('摆进房间', () => {
  it('房间 = Lab 2-7 那一间（同半径下地板与两面墙逐位相同）', () => {
    for (const P of COMBO_PLANS)
      for (const fam of FAMS) {
        const sc = comboScene(P, fam, LEDGE, R, 'touch');
        const ref = ringGridScene(R);
        for (let i = 0; i < 3; i++) expect(Array.from(sc[i].verts)).toEqual(Array.from(ref[i].verts));
        expect(sc[3].kind).toBe('figure');
      }
  });
  it('整列在两档距离、整个半径量程内都装得进房间；取景为正', () => {
    for (const P of COMBO_PLANS)
      for (const fam of FAMS)
        for (const sp of ['touch', 'apart'] as const)
          for (const r of [RING.RADIUS_MIN, R, RING.RADIUS_MAX]) {
            expect(comboFieldSpan(P, fam, LEDGE, r, sp)).toBeLessThan(roomSpan(r));
            for (const v of ['axon', 'front', 'side', 'top']) expect(comboCamScale(P, fam, LEDGE, r, sp, v)).toBeGreaterThan(0);
          }
  });
});
