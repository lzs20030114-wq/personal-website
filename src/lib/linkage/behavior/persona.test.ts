import { describe, expect, it } from 'vitest';
import { PERSONAS, PERSONA_KEYS, VARIABILITY, isPersonaOrder, sampleRange } from './persona';
import { makeRng } from './rng';

/**
 * 参数底表 T-0403-1（2026-04-03）逐项抄一遍当守门：表一改这里就红。
 * 两处按 2026-10-06 拍板：第三套定名「好奇」；D 死于「节律紊乱后渐弱」。
 */
const TABLE = {
  A: { T: [2, 2], a: [0.8, 0.8], v: [3, 3], tau: [0.2, 0.2], g: [0.4, 0.4], spont: [3, 5], f: [800, 1200], duty: [0.7, 0.7], orient: [5, 8], toward: 0.4, th: [0.8, 0.8], death: ['exhaust', 90] },
  B: { T: [6, 6], a: [0.3, 0.3], v: [0.5, 0.5], tau: [2, 2], g: [0.1, 0.1], spont: [15, 25], f: [200, 400], duty: [0.2, 0.2], orient: [30, 45], toward: 0.2, th: [0.2, 0.2], death: ['quiet', 120] },
  C: { T: [4, 4], a: [0.5, 0.5], v: [1.5, 1.5], tau: [0.5, 0.5], g: [0.25, 0.25], spont: [8, 12], f: [400, 800], duty: [0.5, 0.5], orient: [10, 15], toward: 0.8, th: [0.5, 0.5], death: ['turn', 90] },
  D: { T: [2, 8], a: [0.2, 0.9], v: [0.5, 4], tau: [0.3, 3], g: [0.1, 0.5], spont: [2, 30], f: [200, 1200], duty: [0.1, 0.8], orient: [3, 40], toward: 0.5, th: [0.2, 0.9], death: ['arrhythmia', 60] },
} as const;

describe('四种人格 × 12 项参数（T-0403-1）', () => {
  it('逐项与参数底表一致', () => {
    for (const k of PERSONA_KEYS) {
      const p = PERSONAS[k];
      const t = TABLE[k];
      expect(p.breathPeriod).toEqual(t.T);
      expect(p.breathAmp).toEqual(t.a);
      expect(p.speed).toEqual(t.v);
      expect(p.latency).toEqual(t.tau);
      expect(p.gain).toEqual(t.g);
      expect(p.spont).toEqual(t.spont);
      expect(p.voiceFreq).toEqual(t.f);
      expect(p.voiceDuty).toEqual(t.duty);
      expect(p.orient).toEqual(t.orient);
      expect(p.toward).toBe(t.toward);
      expect(p.startle).toEqual(t.th);
      expect([p.death.kind, p.death.dur]).toEqual(t.death);
    }
    expect(PERSONAS.C.spontPresent).toEqual([5, 8]);
    expect(PERSONAS.D.gainSigned).toBe(true);
  });

  it('拍板的两处：C 叫好奇；D 节律紊乱后渐弱，不是抽搐骤停', () => {
    expect(PERSONAS.C.zh).toBe('好奇');
    expect(PERSONAS.C.en).toBe('Curious');
    expect(PERSONAS.D.death.zh).toBe('节律紊乱后渐弱');
    expect(PERSONAS.D.death.kind).toBe('arrhythmia');
  });

  it('取值：单值不加噪声时原样且不耗随机数；加噪声落在 ±jitter 内；区间均匀落在区间内', () => {
    const r = makeRng(9);
    const before = r.s;
    expect(sampleRange(r, [2, 2])).toBe(2);
    expect(r.s).toBe(before);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 3000; i++) {
      const v = sampleRange(r, [4, 4], VARIABILITY.breath);
      expect(Math.abs(v / 4 - 1)).toBeLessThanOrEqual(VARIABILITY.breath + 1e-12);
      const d = sampleRange(r, [2, 8]);
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThan(8);
    }
    expect(lo).toBeLessThan(2.05);
    expect(hi).toBeGreaterThan(7.95);
  });

  it('呈现顺序：A–D 各一次才合法', () => {
    expect(isPersonaOrder(['A', 'B', 'C', 'D'])).toBe(true);
    expect(isPersonaOrder(['D', 'B', 'A', 'C'])).toBe(true);
    expect(isPersonaOrder(['A', 'A', 'C', 'D'])).toBe(false);
    expect(isPersonaOrder(['A', 'B', 'C'])).toBe(false);
    expect(isPersonaOrder(['A', 'B', 'C', 'E'])).toBe(false);
  });
});
