import { describe, expect, it } from 'vitest';
import type { PersonaKey } from './persona';
import { ARM_OSC_MAX_HZ, type Phase, type Pose } from './programs';
import { type BuildCtx, D_DEEP_SPAN, D_SPAN, PEAK, STARTLE_PRE, buildStartle, dOf, pathLen, tierSpeed } from './vocab2';
import {
  type ApproachBeat,
  HC,
  type HandGeom,
  approachPlan,
  atMm,
  buildApproachBeat,
  buildChaseBeat,
  buildEmpty,
  buildGiveUp,
  buildHop,
  buildPeek,
  buildSearch,
  buildShrink,
  buildStrain,
  buildTake,
  buildWrap,
  chasePlan,
  endPose,
  flatH,
  gainAt,
  holdCue,
  holdDrive,
  holdEventMm,
  pounceGeom,
  squeezePhase,
} from './vocab2-hand';

/**
 * 迎手链程序表（vocab2-hand.ts，2026-10-08 第八批）的守门。这些表要交给固件照表执行，坏了不报错，只会让
 * 「迎」追上惊跳、在段界处顿一下、或者走进两腱之间失稳的区域。逐条卡：
 *   ① 一击追不上惊跳（行程 ≤ 0.22、速率 ≤ strike 档；其余段 ≤ pursue）；
 *   ② 不出臂的通带（摆动 ≤ 0.6 Hz、一跳一停的周期 ≥ 1.4 s）；
 *   ③ 深卷只在腱轴 0、只在 curl / 缠 / 握（门开着时）出现、≤ 0.62；离轴 ≤ 0.48；
 *   ④ 每段的身体通道都不是惊跳的（不猛收、不 chirp、触须不张开、灯不闪）；
 *   ⑤ 人格结构看得见（A 蹲 + 扑、B 进退、C 瞄准、D 生硬 / 撤掉）；
 *   ⑥ 握持控制器的窗口、满足、相位提前；表是纯数据（JSON 往返无损）。
 */
const K: Record<PersonaKey, number> = { A: Math.SQRT2, B: Math.sqrt(1 / 3), C: 1, D: 0.9 };
const TAU: Record<PersonaKey, number> = { A: 0.2, B: 2, C: 0.5, D: 1.2 };

function ctx(persona: PersonaKey, cur: Pose = { bend: 0.25, dir: 0.4, deep: 0 }, over: Partial<BuildCtx> = {}): BuildCtx {
  return {
    persona,
    k: K[persona],
    tau: TAU[persona],
    gAbs: 0.3,
    sign: 1,
    vigor: 1,
    ageU: 0,
    breathAmp: 0.5,
    period: 4,
    rest: { bend: 0.25, dir: 0.4, deep: 0 },
    cur,
    rnd: () => 0.5,
    ...over,
  };
}
const geom = (o: Partial<HandGeom> = {}): HandGeom => ({ Dh: 0.27, dir: 0.62, r: 280, touch: 32, v: 0, ...o });

/** 一串段的每一段：起点、终点、隐含的峰速（差动/秒） */
function walk(phases: readonly Phase[], c: BuildCtx): { p: Phase; from: Pose; to: Pose; v: number }[] {
  let at = c.cur;
  return phases.map((p) => {
    const to = p.arm === 'hold' ? at : p.arm === 'rest' ? c.rest : p.arm;
    const v = p.ease === 'hold' || p.dur <= 0 ? 0 : (PEAK[p.ease] * pathLen(at, to, p.path)) / p.dur;
    const r = { p, from: at, to, v };
    at = to;
    return r;
  });
}

const ALL_BEATS: ApproachBeat[] = ['transport', 'edge', 'wait', 'retreat', 'wait2', 'edge2', 'hover', 'crouch', 'cocked', 'pounce', 'sight', 'reach', 'touch', 'nudge', 'balk', 'stall', 'drop'];

/** 所有表（不含握持控制器），按人格 × 几个手位 */
function allTables(): { name: string; c: BuildCtx; phases: Phase[] }[] {
  const out: { name: string; c: BuildCtx; phases: Phase[] }[] = [];
  for (const P of ['A', 'B', 'C', 'D'] as PersonaKey[]) {
    for (const g of [geom(), geom({ Dh: 0.12, r: 330 }), geom({ Dh: 0.45, r: 180, dir: -2.5 }), geom({ v: 120 })]) {
      const c = ctx(P);
      out.push({ name: `${P} take`, c, phases: buildTake(c, g) });
      out.push({ name: `${P} hop`, c, phases: buildHop(c, g, { x: 0.02, y: -0.01 }) });
      for (const b of ALL_BEATS) {
        const cb = b === 'pounce' ? ctx(P, atMm(g, -40)) : c;
        out.push({ name: `${P} ${b}`, c: cb, phases: buildApproachBeat(cb, g, b) });
      }
      out.push({ name: `${P} strain`, c, phases: buildStrain(c, g, 2) });
      out.push({ name: `${P} wrap`, c, phases: buildWrap(c, g, { byHand: false, wince: true, chase: false, pounced: false, n: 2, phi: 0.3, period: 4, settle: 0.3, Dref: g.Dh, deep: false }).phases });
      for (const b of [...chasePlan(true), ...chasePlan(false)]) out.push({ name: `${P} chase ${b}`, c, phases: buildChaseBeat(c, g, b, true) });
      out.push({ name: `${P} giveUp`, c, phases: buildGiveUp(c, -2.5) });
      for (const k of ['regrab', 'palpate', 'open', 'drop'] as const) out.push({ name: `${P} empty ${k}`, c, phases: buildEmpty(c, k, g) });
      out.push({ name: `${P} search`, c, phases: buildSearch(c, { D: 0.25, dir: 0.6 }, 3) });
      out.push({ name: `${P} shrink`, c, phases: buildShrink(c, 0.6, -2.5) });
      out.push({ name: `${P} peek`, c, phases: buildPeek(c, g, 0.6, -2.5) });
    }
  }
  return out;
}

describe('迎手链程序表 vocab2-hand.ts', () => {
  it('接触灵敏度：离基座越远越灵、弯得越多越钝；手那一点上的毫米换算两头对得上', () => {
    expect(gainAt(357.5, 0.2)).toBeGreaterThan(gainAt(200, 0.2));
    expect(gainAt(200, 0.1)).toBeGreaterThan(gainAt(200, 0.4));
    expect(gainAt(10, 0.2)).toBeCloseTo(gainAt(357.5 * 0.25, 0.2), 9);
    const g = geom();
    expect(dOf(atMm(g, 0))).toBeCloseTo(g.Dh, 12);
    expect(dOf(atMm(g, -30))).toBeLessThan(g.Dh);
    expect(dOf(atMm(g, 10))).toBeGreaterThan(g.Dh);
    // 离轴封顶 0.48、不带深卷（超过 0.34 的部分是 bend > 1，执行层的深缠行程给）
    const big = flatH(0.9, 0.62);
    expect(dOf(big)).toBeCloseTo(HC.flatMax, 12);
    expect(big.deep).toBe(0);
    expect(big.bend).toBeGreaterThan(1);
  });

  it('一击追不上惊跳：扑的行程（蹲 + 扑）≤ 0.22、速率 ≤ strike 档；其余任何一段 ≤ pursue 档', () => {
    let pounces = 0;
    for (const { name, c, phases } of allTables()) {
      for (const w of walk(phases, c)) {
        if (w.p.name === 'pounce') {
          pounces++;
          expect(w.v, name).toBeLessThanOrEqual(tierSpeed('strike', c.k) + 1e-9);
          continue;
        }
        if (w.p.name === 'latency') continue;
        expect(w.v, `${name} · ${w.p.name}`).toBeLessThanOrEqual(tierSpeed('pursue', c.k) + 1e-9);
      }
    }
    expect(pounces).toBeGreaterThan(0);
    // 扑只在行程装得下时排进拍序；装得下的一律 ≤ 0.22
    for (const P of ['A', 'D'] as PersonaKey[]) {
      for (const g of [geom(), geom({ Dh: 0.1, r: 340 }), geom({ Dh: 0.45, r: 120 })]) {
        const c = ctx(P, undefined, { k: 1.5 });
        const plan = approachPlan(c, g, { negative: false, deep: false });
        const { S } = pounceGeom(c, g);
        expect(plan.includes('pounce'), `${P} ${g.r}`).toBe(S <= HC.strikeMax);
      }
    }
    // 与惊跳比：最浅的惊跳也有 0.45 的行程、0.15 s 屈曲（reflex 档，不限速）
    const st = buildStartle(ctx('A'), { I: 0.81, th: 0.8, side: 1, recoilYaw: 0, turnBack: 0, repeats: 3 });
    const flex = st.phases.find((p) => p.name === 'flex')!;
    expect(dOf(flex.arm as Pose)).toBeGreaterThanOrEqual(0.45 - 1e-9);
    expect(HC.strikeMax).toBeLessThanOrEqual(0.5 * 0.45);
  });

  it('不出臂的通带：摆动 ≤ 0.6 Hz、叠上去不超弯曲上限；一跳一停的周期 ≥ 1.4 s', () => {
    for (const { name, phases } of allTables()) {
      for (const p of phases) {
        if (!p.osc) continue;
        expect(p.osc.hz, name).toBeLessThanOrEqual(ARM_OSC_MAX_HZ);
        if (p.arm !== 'hold' && p.arm !== 'rest') expect(p.arm.bend + p.osc.amp, name).toBeLessThanOrEqual(1.47 + 1e-9);
      }
    }
    for (const P of ['A', 'B', 'C', 'D'] as PersonaKey[]) {
      const hop = buildHop(ctx(P), geom(), { x: 0, y: 0 });
      const shift = hop.find((p) => p.name === 'shift')!;
      const fix = hop.find((p) => p.name === 'fixate')!;
      expect(shift.dur).toBeGreaterThanOrEqual(HC.shiftMin - 1e-9);
      expect(shift.dur + fix.dur - 1).toBeGreaterThanOrEqual(1.4 - 1e-9);
      // 停的那段带摆动时差动 ≤ 0.27（大弯曲上再摆会被执行层削掉一截）
      if (fix.osc) expect(dOf(shift.arm as Pose)).toBeLessThanOrEqual(0.27 + 1e-9);
    }
  });

  it('深卷只在门开着的那几段、只在腱轴 0、≤ 0.62；其余一律离轴 ≤ 0.48', () => {
    for (const { name, phases } of allTables()) {
      for (const p of phases) {
        if (p.arm === 'hold' || p.arm === 'rest') continue;
        expect(p.arm.deep, `${name} · ${p.name}`).toBe(0);
        expect(dOf(p.arm), `${name} · ${p.name}`).toBeLessThanOrEqual(HC.flatMax + 1e-9);
      }
    }
    const g = geom({ Dh: 0.5, dir: 0, r: 250 });
    const c = ctx('A', { bend: 1.4, dir: 0, deep: 0 });
    const curl = buildApproachBeat(c, g, 'curl', 0.5);
    const wrap = buildWrap(c, g, { byHand: false, wince: false, chase: false, pounced: false, n: 2, phi: 0, period: 4, settle: 0, Dref: 0.5, deep: true }).phases;
    for (const p of [...curl, ...wrap]) {
      if (p.arm === 'hold' || p.arm === 'rest') continue;
      expect(Math.abs(p.arm.dir), p.name).toBeLessThan(1e-12);
      expect(dOf(p.arm), p.name).toBeLessThanOrEqual(HC.deepMax + 1e-9);
    }
    expect(Math.max(...wrap.map((p) => (typeof p.arm === 'object' ? p.arm.deep : 0)))).toBeGreaterThan(0);
    const hold = holdDrive({ persona: 'A', g, Dref: 0.5, dirRef: 0, phi: 0, period: 4, breathAmp: 0.8, breaths: 0, grip: 1, evMm: 0, deep: true });
    expect(hold.dir).toBe(0);
    expect(dOf(hold)).toBeLessThanOrEqual(HC.deepMax + 1e-9);
    expect(D_SPAN * 1 + D_DEEP_SPAN * 1).toBeGreaterThan(HC.deepMax);
  });

  it('身体通道不是惊跳的：迎手链没有一段猛收、chirp、触须张开或闪灯（> 1.25）', () => {
    for (const { name, phases } of allTables()) {
      for (const p of phases) {
        expect(p.breath?.clench ?? 0, `${name} · ${p.name}`).toBe(0);
        expect(p.voice, `${name} · ${p.name}`).not.toBe('chirp');
        expect(p.feel?.pose, `${name} · ${p.name}`).not.toBe('splay');
        expect(p.light ?? 1, `${name} · ${p.name}`).toBeLessThanOrEqual(1.25);
        expect(STARTLE_PRE.has(p.name) && p.name !== 'latency' ? p.name : '', name).not.toBe('flex');
      }
    }
    for (const P of ['A', 'B', 'C', 'D'] as PersonaKey[]) {
      const cue = holdCue(P);
      expect(cue.voice).toBe('hum');
      expect(cue.breath?.clench ?? 0).toBe(0);
    }
  });

  it('人格结构看得见：A 蹲 + 扑、B 进—停—退—停—再进、C 瞄准后伸（没有蹲）、D 生硬（匀速）或撤掉', () => {
    const g = geom();
    expect(approachPlan(ctx('A'), g, { negative: false, deep: false })).toEqual(['transport', 'crouch', 'cocked', 'pounce']);
    expect(approachPlan(ctx('B'), g, { negative: false, deep: false })).toEqual(['edge', 'wait', 'retreat', 'wait2', 'edge2', 'hover', 'touch']);
    expect(approachPlan(ctx('C'), g, { negative: false, deep: false })).toEqual(['transport', 'hover', 'sight', 'reach']);
    expect(approachPlan(ctx('D', undefined, { k: 0.7 }), g, { negative: false, deep: false })).toEqual(['transport', 'hover', 'touch']);
    expect(approachPlan(ctx('D', undefined, { k: 1.5, tau: 0.3 }), g, { negative: false, deep: false })).toContain('pounce');
    expect(approachPlan(ctx('D'), g, { negative: true, deep: false })).toEqual(['balk', 'stall', 'drop']);
    // 衰老过半不扑（先拿掉花样）
    expect(approachPlan(ctx('A', undefined, { ageU: 0.6 }), g, { negative: false, deep: false })).not.toContain('pounce');
    // D 的段是匀速（生硬），A / C 是最小急动
    expect(buildApproachBeat(ctx('D'), g, 'transport')[0].ease).toBe('lin');
    expect(buildApproachBeat(ctx('C'), g, 'transport')[0].ease).toBe('mj');
    // B 的退：梢端背离手（比进的那一步离手远）
    const edge = buildApproachBeat(ctx('B'), g, 'edge')[0].arm as Pose;
    const retreat = buildApproachBeat(ctx('B'), g, 'retreat')[0].arm as Pose;
    expect(dOf(retreat)).toBeLessThan(dOf(edge));
    // 停半拍：屏气、触须定住、不出声、灯亮
    const hover = buildApproachBeat(ctx('C'), g, 'hover')[0];
    expect(hover.breath?.rate).toBe(0);
    expect(hover.feel?.pose).toBe('still');
    expect(hover.voice).toBe('mute');
    expect(hover.light).toBeGreaterThan(1);
  });

  it('缠：贴上落在手上 +2 mm、每级 +5 mm；等到呼气开始才收紧；一缩是反射时钟', () => {
    const g = geom();
    const c = ctx('C');
    const { phases, seat } = buildWrap(c, g, { byHand: false, wince: true, chase: false, pounced: false, n: 2, phi: 0.2, period: 4, settle: 0.2, Dref: g.Dh, deep: false });
    expect(phases[seat].name).toBe('seat');
    expect(phases[0].name).toBe('latency');
    expect(phases[0].dur).toBeCloseTo(0.1, 12);
    const at = (mm: number): number => dOf(atMm(g, mm));
    expect(dOf(phases[seat].arm as Pose)).toBeCloseTo(at(2), 12);
    const c1 = phases.find((p) => p.name === 'cinch1')!;
    const c2 = phases.find((p) => p.name === 'cinch2')!;
    expect(dOf(c1.arm as Pose)).toBeCloseTo(at(7), 12);
    expect(dOf(c2.arm as Pose)).toBeCloseTo(at(12), 12);
    // 第一级收紧开始时呼吸相位正好到 0.5（呼气开始）
    const before = phases.slice(0, phases.indexOf(c1)).reduce((a, p) => a + p.dur, 0);
    expect(((0.2 + before / 4) % 1)).toBeCloseTo(0.5, 9);
    // 手伸过来（接）：合拢，定住 × 1.5；追里：定住 0.1、不一缩
    const recv = buildWrap(c, g, { byHand: true, wince: false, chase: false, pounced: false, n: 1, phi: 0, period: 4, settle: 0, Dref: g.Dh, deep: false });
    expect(recv.phases[recv.seat].name).toBe('close');
    const chase = buildWrap(c, g, { byHand: false, wince: true, chase: true, pounced: false, n: 1, phi: 0, period: 4, settle: 0, Dref: g.Dh, deep: false });
    expect(chase.phases[0].name).toBe('feel');
    expect(chase.phases[0].dur).toBeCloseTo(HC.feelChase, 12);
  });

  it('握持控制器：窗口 −12…+24 mm、满足了幅度变小、最紧落在呼气末（指令提前 0.45 s）、握力缩放', () => {
    const g = geom();
    const base = { persona: 'A' as PersonaKey, g, Dref: g.Dh, dirRef: g.dir, period: 4, breathAmp: 0.8, grip: 1, evMm: 0, deep: false };
    const mmOf = (p: Pose): number => (dOf(p) - g.Dh) * gainAt(g.r, g.Dh);
    const swing = (breaths: number): number => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < 200; i++) {
        const mm = mmOf(holdDrive({ ...base, phi: i / 200, breaths }));
        lo = Math.min(lo, mm);
        hi = Math.max(hi, mm);
        expect(mm).toBeGreaterThanOrEqual(HC.winLo - 1e-6);
        expect(mm).toBeLessThanOrEqual(HC.winHi + 1e-6);
      }
      return hi - lo;
    };
    expect(swing(0)).toBeGreaterThan(10);
    expect(swing(12)).toBeLessThan(swing(0) * 0.75);
    // 最紧的指令相位 = 呼气末（φ = 1）往前 0.45 s
    let best = 0;
    let bestPhi = 0;
    for (let i = 0; i < 400; i++) {
      const s = squeezePhase(i / 400, 4);
      if (s > best) {
        best = s;
        bestPhi = i / 400;
      }
    }
    expect(bestPhi).toBeCloseTo(1 - 0.45 / 4, 2);
    const weak = holdDrive({ ...base, phi: 0, breaths: 0, grip: 0.5 });
    expect(dOf(weak)).toBeLessThan(dOf(holdDrive({ ...base, phi: 0, breaths: 0 })));
    // 小动静：攥一下 +3、让 −3，过了时长回 0
    expect(holdEventMm('squeeze', 0.25, 4)).toBeCloseTo(3, 9);
    expect(holdEventMm('give', 0.4, 4)).toBeCloseTo(-3, 9);
    expect(holdEventMm('squeeze', 5, 4)).toBe(0);
  });

  it('表是纯数据：JSON 往返无损', () => {
    for (const { phases } of allTables()) expect(JSON.parse(JSON.stringify(phases))).toEqual(phases);
  });

  it('搜寻以最后碰到的那一点为中心；找的段与放手、躲都不超 deliberate', () => {
    const c = ctx('C');
    const sp = buildSearch(c, { D: 0.3, dir: 1 }, 2);
    const cast1 = sp.find((p) => p.name === 'cast1')!.arm as Pose;
    expect(Math.abs(cast1.dir - (1 + Math.PI / 6))).toBeLessThan(1e-9);
    for (const w of walk(sp, c)) expect(w.v, w.p.name).toBeLessThanOrEqual(tierSpeed('deliberate', c.k) + 1e-9);
    // 躲的终点背着手、越近缩得越多
    const sn = buildShrink(c, 1, -2.5);
    const near = sn[sn.length - 1].arm as Pose;
    const sf = buildShrink(c, 0, -2.5);
    const far = sf[sf.length - 1].arm as Pose;
    expect(dOf(near)).toBeGreaterThan(dOf(far));
    expect(endPose(sp, c)).toEqual(c.rest);
  });
});
