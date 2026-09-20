import { beforeAll, describe, expect, it } from 'vitest';
import {
  COMBO_DECK,
  COMBO_DEFAULT_FORM,
  COMBO_LEAD,
  COMBO_PLANS,
  COMBO_RANGE_PX,
  COMBO_SPACINGS,
  JOINT_LEVEL_TOL,
  bandToward,
  comboAdjacent,
  comboBridges,
  comboBuild,
  comboCamScale,
  comboCells,
  comboFieldSpan,
  comboForms,
  comboJoints,
  comboMetrics,
  comboPitch,
  comboPlan,
  comboPositions,
  comboReading,
  comboScene,
  crestOffset,
  deckAt,
  segmentLeads,
  unitAtLead,
  unitLeads,
} from './unit-combo';
import { RING, RING_LEAD, RING_TAIL, RING_WAVE, buildWaveUnits, waveLeads } from './skin-ring';
import { UNIT_FORMS } from './unit-cluster';
import { MM_PER_UNIT, RIG_SCALE, ringCellGap, ringGridScene, roomSpan } from './skin-grid';
import { SKIN, createSkinUnit } from './skin-unit';
import { SOLID } from './skin-solid';

/**
 * 守门：Lab 2-11 单元组合（2026-09-20 用户纠偏后的读法：同一种平台一圈起伏，几个单元首尾相接）。
 * 卡的是这几条规则本身：
 * ① 走面基准与引擎对得上，且「起伏 = 纯平移」在这一族真成立（换个 lead 真跑一遍，走面高度 = 基准 + 2·Δlead）；
 * ② 高度段 = 整段时逐位就是 Lab 2-5 的起伏（不悄悄换单元）；相位把峰放在指定的带、谷在对面；
 * ③ 五种接法的接缝读数：台阶 = 整个量程 / 续坡与三段坡接缝齐平且合起来爬完量程 / 凹与拱接缝齐平且在最低 / 最高；
 * ④ 一个 lead 一条引擎（续坡两段共用中间那个）、编制表每条带指向它该指的 lead；
 * ⑤ 站位相切 / 分离、房间 = Lab 2-7 那一间、装得进房间、取景。
 */
const R = RING.RADIUS_DEF;
const FORMS = comboForms();
const LEDGE = 2;

let deckMeasured: (number | null)[] = [];
let ledgeShifted = 0;
beforeAll(() => {
  const top = (spec: typeof FORMS[number]) => {
    const s = createSkinUnit(spec.spec, spec.opts);
    for (let k = 0; k < SKIN.STEPS; k++) s.advance();
    const foot = s.py[s.n - 1];
    let t = -Infinity;
    for (let i = 0; i < s.n; i++) if (s.px[i] * SOLID.SCALE > 8) t = Math.max(t, (s.py[i] - foot) * SOLID.SCALE);
    return t;
  };
  deckMeasured = FORMS.map((f, i) => (i === 0 ? null : top(f)));
  ledgeShifted = top(unitAtLead(FORMS[LEDGE], 36));
}, 120_000);

describe('走面：基准与平移都是引擎量出来的', () => {
  it('四种形态的走面基准（lead = RING_LEAD）对得上（±0.15 px）；袋没有走面', () => {
    expect(COMBO_DECK[0]).toBeNull();
    for (let i = 1; i < 4; i++) expect(Math.abs((deckMeasured[i] as number) - (COMBO_DECK[i] as number))).toBeLessThan(0.15);
  });
  it('起伏 = 纯平移：直挑台搬到 lead 36 真跑一遍，走面 = 基准 + 2·(58−36)（±0.5 px）', () => {
    expect(Math.abs(ledgeShifted - (deckAt(LEDGE, 36) as number))).toBeLessThan(0.5);
    expect(deckAt(LEDGE, RING_LEAD)).toBe(COMBO_DECK[LEDGE]);
    expect(deckAt(0, 30)).toBeNull();
  });
  it('量程 = Lab 2-5 起伏编制那一段：88 px = 0.35 m', () => {
    expect(COMBO_LEAD).toEqual({ LOW: RING_WAVE.LOW, HIGH: RING_WAVE.HIGH });
    expect(COMBO_RANGE_PX).toBe(88);
    expect((COMBO_RANGE_PX * RIG_SCALE * MM_PER_UNIT) / 1000).toBeCloseTo(0.35, 2);
  });
});

describe('相位与高度段', () => {
  it('整段的 11 级 = waveLeads() 逐位；半段落在量程之内且单调；出量程即抛', () => {
    expect(segmentLeads(COMBO_LEAD.LOW, COMBO_LEAD.HIGH)).toEqual(waveLeads());
    const half = segmentLeads(58, 36);
    expect(half[0]).toBe(58);
    expect(half[10]).toBe(36);
    for (let l = 1; l < half.length; l++) expect(half[l]).toBeLessThanOrEqual(half[l - 1]);
    expect(() => segmentLeads(36, 58)).toThrow();
    expect(() => segmentLeads(60, 14)).toThrow();
    expect(() => segmentLeads(58, 10)).toThrow();
  });
  it('峰落在指定的带、谷在正对面；20 条带首尾闭合', () => {
    for (const crest of [0, 3, 10, 17]) {
      const ul = unitLeads({ crest, low: 58, high: 14 });
      expect(ul.length).toBe(RING.COUNT);
      expect(ul[crest]).toBe(14);
      expect(ul[(crest + 10) % 20]).toBe(58);
      expect(Math.min(...ul)).toBe(14);
      expect(Math.max(...ul)).toBe(58);
      // 邻带差 ≤ 1 级：闭合的一圈
      for (let i = 0; i < 20; i++) expect(Math.abs(ul[i] - ul[(i + 1) % 20])).toBeLessThanOrEqual(8);
    }
    expect(crestOffset(0)).toBe(10);
    expect(crestOffset(10)).toBe(0);
  });
  it('crest 0 且整段 = Lab 2-5 起伏编制那 11 条引擎（同一副构造）', () => {
    const wave = buildWaveUnits(FORMS[LEDGE]);
    const b = comboBuild({ key: 't', zh: '', en: '', label: '', positions: [{ x: 0, z: 0 }], units: [{ crest: 0, low: 58, high: 14 }] }, FORMS[LEDGE]);
    for (const u of b.units) {
      const w = wave.find((v) => v.spec[0][1] === u.spec[0][1]);
      expect(w).toBeDefined();
      expect(u.spec).toEqual(w!.spec);
    }
  });
  it('朝向 → 带：+X 是带 0、+Z 是带 5、−X 是带 10', () => {
    expect(bandToward(0)).toBe(0);
    expect(bandToward(Math.PI / 2)).toBe(5);
    expect(bandToward(Math.PI)).toBe(10);
    expect(bandToward(-Math.PI)).toBe(10);
  });
});

describe('五种接法：接缝读数', () => {
  const J = (key: string) => comboJoints(comboPlan(key), LEDGE);
  it('台阶：同相两个，接缝 A 峰对 B 谷，落差 = 整个量程', () => {
    const [j] = J('step');
    expect(j.bandA).toBe(0);
    expect(j.bandB).toBe(10);
    expect(j.deckA).toBeCloseTo(deckAt(LEDGE, 14) as number, 9);
    expect(j.deckB).toBeCloseTo(deckAt(LEDGE, 58) as number, 9);
    expect(Math.abs(j.step as number)).toBeCloseTo(COMBO_RANGE_PX, 9);
    expect(comboReading(comboPlan('step'), LEDGE, R, 'touch')).toContain('落差 35 cm');
  });
  it('续坡：接缝齐平，两段合起来爬完量程', () => {
    const [j] = J('ramp');
    expect(j.step).toBe(0);
    const m = comboMetrics(comboPlan('ramp'), LEDGE, R, 'touch');
    expect(m.levelJoints).toBe(1);
    expect(((m.highM as number) - (m.lowM as number)) * 1000).toBeCloseTo(COMBO_RANGE_PX * RIG_SCALE * MM_PER_UNIT, 6);
    expect(comboReading(comboPlan('ramp'), LEDGE, R, 'touch')).toContain('接缝齐平');
  });
  it('三段坡：两条接缝全齐平、总爬升仍是量程', () => {
    const js = J('ramp3');
    expect(js.length).toBe(2);
    for (const j of js) expect(Math.abs(j.step as number)).toBeLessThanOrEqual(JOINT_LEVEL_TOL);
    const m = comboMetrics(comboPlan('ramp3'), LEDGE, R, 'touch');
    expect(m.levelJoints).toBe(2);
    expect(((m.highM as number) - (m.lowM as number)) * 1000).toBeCloseTo(COMBO_RANGE_PX * RIG_SCALE * MM_PER_UNIT, 6);
  });
  it('凹：接缝齐平且是最低点；拱：接缝齐平且是最高点', () => {
    const [v] = J('valley');
    expect(v.step).toBe(0);
    expect(v.deckA).toBe(deckAt(LEDGE, COMBO_LEAD.LOW));
    const [a] = J('arch');
    expect(a.step).toBe(0);
    expect(a.deckA).toBe(deckAt(LEDGE, COMBO_LEAD.HIGH));
  });
  it('袋：没有走面，读法直说', () => {
    expect(comboJoints(comboPlan('step'), 0)[0].step).toBeNull();
    expect(comboReading(comboPlan('step'), 0, R, 'touch')).toContain('袋');
  });
});

describe('解什么、摆到哪', () => {
  it('一个 lead 一条引擎：台阶 11 条；续坡两段共用中间的 36 ⇒ 21 条；编制表每条带指向自己的 lead', () => {
    const step = comboBuild(comboPlan('step'), FORMS[LEDGE]);
    expect(step.units.length).toBe(11);
    expect(step.plans.length).toBe(1); // 两个单元完全相同 ⇒ 共用一份编制
    expect(step.cellPlan).toEqual([0, 0]);
    const ramp = comboBuild(comboPlan('ramp'), FORMS[LEDGE]);
    expect(ramp.units.length).toBe(21);
    expect(ramp.leads.filter((l) => l === 36).length).toBe(1);
    expect(ramp.plans.length).toBe(2);
    ramp.plans.forEach((bands, v) => {
      const want = unitLeads(comboPlan('ramp').units[v]);
      bands.forEach((e, i) => expect(ramp.leads[e]).toBe(want[i]));
    });
    for (const u of ramp.units) expect(u.spec[0][1] + u.spec[2][1]).toBe(RING_LEAD + RING_TAIL);
  });
  it('相切 = 两个外缘（按峰值）；分离再加 Lab 2-7 的环间缝；整组居中', () => {
    for (const sp of ['touch', 'apart'] as const) {
      const p = comboPitch(LEDGE, R, sp);
      expect(p).toBeCloseTo(2 * (R + UNIT_FORMS[LEDGE].peakReach) + (sp === 'apart' ? ringCellGap(R) : 0), 9);
      const pos = comboPositions(comboPlan('ramp3'), LEDGE, R, sp);
      expect(pos[1].x - pos[0].x).toBeCloseTo(p, 9);
      expect(pos[0].x + pos[2].x).toBeCloseTo(0, 9);
      const cells = comboCells(comboPlan('ramp3'), LEDGE, R, sp);
      cells.forEach((c, i) => expect(c.x).toBeCloseTo(pos[i].x * RIG_SCALE, 9));
      expect(cells.map((c) => c.plan)).toEqual([0, 1, 2]);
    }
    expect(comboAdjacent(comboPlan('ramp3'))).toEqual([[0, 1], [1, 2]]);
    expect(comboBridges(comboPlan('ramp3'), 'touch')).toEqual([[0, 1], [1, 2]]);
    expect(comboBridges(comboPlan('ramp3'), 'apart')).toEqual([]);
  });
  it('预设、距离两档登记齐全', () => {
    expect(COMBO_PLANS.map((p) => p.key)).toEqual(['step', 'ramp', 'ramp3', 'valley', 'arch']);
    expect(COMBO_SPACINGS.map((s) => s.key)).toEqual(['touch', 'apart']);
    expect(COMBO_DEFAULT_FORM).toBe(LEDGE);
    for (const P of COMBO_PLANS) {
      expect(P.units.length).toBe(P.positions.length);
      for (const u of P.units) expect(() => unitLeads(u)).not.toThrow();
    }
  });
});

describe('摆进房间', () => {
  it('房间 = Lab 2-7 那一间（同半径下地板与两面墙逐位相同）', () => {
    for (const P of COMBO_PLANS) {
      const sc = comboScene(P, LEDGE, R, 'touch');
      const ref = ringGridScene(R);
      for (let i = 0; i < 3; i++) expect(Array.from(sc[i].verts)).toEqual(Array.from(ref[i].verts));
      expect(sc[3].kind).toBe('figure');
    }
  });
  it('整组在两档距离、整个半径量程内都装得进房间；取景为正且长组不比短组取得更近（被房高卡住的视角两者相等）', () => {
    for (const P of COMBO_PLANS)
      for (const sp of ['touch', 'apart'] as const)
        for (const r of [RING.RADIUS_MIN, R, RING.RADIUS_MAX]) expect(comboFieldSpan(P, LEDGE, r, sp)).toBeLessThan(roomSpan(r));
    for (const v of ['axon', 'front', 'side', 'top']) {
      const long = comboCamScale(comboPlan('ramp3'), LEDGE, R, 'touch', v);
      const short = comboCamScale(comboPlan('ramp'), LEDGE, R, 'touch', v);
      expect(long).toBeGreaterThan(0);
      expect(short).toBeGreaterThanOrEqual(long);
    }
  });
});
