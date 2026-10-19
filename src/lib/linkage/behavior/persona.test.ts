import { describe, expect, it } from 'vitest';
import { MOTION } from './engine';
import { GRASP } from './grasp';
import { AGEING_PLACEHOLDER } from './life';
import { PERSONAS, PERSONA_KEYS, VARIABILITY, isPersonaOrder, isRandom, sampleRange } from './persona';
import { makeRng } from './rng';

/**
 * 人格参数表逐项抄一遍当守门：表一改这里就红。
 * 2026-10-14 用户拍板重分类：A 热情 · B 沉静 · C 回避 · D 乱序随机（原 2026-04-03 底表 T-0403-1 的活力 / 沉静 / 好奇 / 不稳定见
 * spec §4.1 史料）。乱序随机的区间沿用原不稳定型的数，只是改成偏向两端抽。
 */
const TABLE = {
  A: { T: [2, 2], a: [0.8, 0.8], v: [3, 3], tau: [0.2, 0.2], g: [0.5, 0.5], spont: [3, 5], f: [800, 1200], duty: [0.7, 0.7], orient: [5, 8], toward: 0.9, otherwise: 'random', th: [0.8, 0.8], death: ['turn', 90], stance: [1, 1] },
  B: { T: [7, 7], a: [0.5, 0.5], v: [0.5, 0.5], tau: [2.5, 2.5], g: [0.1, 0.1], spont: [20, 30], f: [150, 300], duty: [0.25, 0.25], orient: [30, 45], toward: 0.4, otherwise: 'random', th: [0.95, 0.95], death: ['quiet', 120], stance: [0, 0] },
  C: { T: [3, 3], a: [0.3, 0.3], v: [2, 2], tau: [0.3, 0.3], g: [0.4, 0.4], spont: [10, 16], f: [1000, 1400], duty: [0.1, 0.1], orient: [8, 12], toward: 0.05, otherwise: 'away', th: [0.25, 0.25], death: ['withdraw', 90], stance: [-1, -1] },
  D: { T: [2, 8], a: [0.2, 0.9], v: [0.5, 4], tau: [0.3, 3], g: [0.1, 0.5], spont: [2, 30], f: [200, 1200], duty: [0.1, 0.8], orient: [3, 40], toward: 0.5, otherwise: 'away', th: [0.2, 0.9], death: ['arrhythmia', 60], stance: [0.4, 1] },
} as const;

describe('四种人格（2026-10-14 重分类：热情 / 沉静 / 回避 / 乱序随机）', () => {
  it('逐项与参数表一致', () => {
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
      expect(p.otherwise).toBe(t.otherwise);
      expect(p.startle).toEqual(t.th);
      expect([p.death.kind, p.death.dur]).toEqual(t.death);
      expect(p.stance).toEqual(t.stance);
    }
    expect(PERSONA_KEYS.filter((k) => isRandom(PERSONAS[k]))).toEqual(['D']);
  });

  it('抓握 / 松开 / 回应的时长按 ③ 换算后落在 0.6–12 s（2026-10-19 删掉引擎里那道钳位的依据：按现表它永远不起作用）', () => {
    // 能起缠、松手、回应的时候都还活着（死亡开始那一刻先松手，之后不再起），所以速度只乘衰老、不乘死亡的余力
    for (const k of PERSONA_KEYS) {
      const [lo, hi] = PERSONAS[k].speed;
      const vMin = lo * (1 - VARIABILITY.response) * (1 - AGEING_PLACEHOLDER.speed);
      const vMax = hi * (1 + VARIABILITY.response);
      for (const base of [GRASP.wrap, GRASP.release, MOTION.response]) {
        expect(base / Math.sqrt(vMin), `${k} ${base} 最慢`).toBeLessThan(12);
        expect(base / Math.sqrt(vMax), `${k} ${base} 最快`).toBeGreaterThan(0.6);
      }
    }
  });

  it('四个名字与性格一一对应（v2 动作程序按性格换结构，不读字母）', () => {
    expect(PERSONA_KEYS.map((k) => PERSONAS[k].zh)).toEqual(['热情', '沉静', '回避', '乱序随机']);
    expect(PERSONA_KEYS.map((k) => PERSONAS[k].temper)).toEqual(['warm', 'calm', 'avoidant', 'random']);
    expect(PERSONAS.D.death.zh).toBe('节律紊乱后渐弱');
  });

  it('对比拉开的方向：趋避两端是热情与回避；沉静最慢、最难吓；回避最容易吓', () => {
    const v = (k: keyof typeof PERSONAS) => PERSONAS[k];
    expect(v('A').stance[0]).toBe(1);
    expect(v('C').stance[0]).toBe(-1);
    expect(v('B').stance[0]).toBe(0);
    expect(v('A').toward).toBeGreaterThan(0.8);
    expect(v('C').toward).toBeLessThan(0.1);
    expect(v('B').speed[0]).toBeLessThan(Math.min(v('A').speed[0], v('C').speed[0]));
    expect(v('B').startle[0]).toBeGreaterThan(v('A').startle[0]);
    expect(v('C').startle[0]).toBeLessThanOrEqual(0.25);
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

  it('偏向两端抽（乱序随机）：落在区间里、两端各占的比例远多于均匀，耗的随机数与均匀一样多', () => {
    const r = makeRng(5);
    const u = makeRng(5);
    let ends = 0;
    let mid = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const x = sampleRange(r, [0, 1], 0, true);
      sampleRange(u, [0, 1]);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      if (x < 0.15 || x > 0.85) ends++;
      if (x > 0.4 && x < 0.6) mid++;
      expect(r.s).toBe(u.s);
    }
    // 均匀：两端 30%、中间 20%；sin² 分布：两端 ≈ 50%、中间 ≈ 13%
    expect(ends / N).toBeGreaterThan(0.45);
    expect(mid / N).toBeLessThan(0.16);
  });

  it('呈现顺序：A–D 各一次才合法', () => {
    expect(isPersonaOrder(['A', 'B', 'C', 'D'])).toBe(true);
    expect(isPersonaOrder(['D', 'B', 'A', 'C'])).toBe(true);
    expect(isPersonaOrder(['A', 'A', 'C', 'D'])).toBe(false);
    expect(isPersonaOrder(['A', 'B', 'C'])).toBe(false);
    expect(isPersonaOrder(['A', 'B', 'C', 'E'])).toBe(false);
  });
});
