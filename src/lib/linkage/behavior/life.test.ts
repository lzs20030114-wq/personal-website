import { describe, expect, it } from 'vitest';
import { AGEING_PLACEHOLDER, LIFE, ageing, deathFrame, nominalLifeSeconds } from './life';
import { PERSONAS, PERSONA_KEYS } from './persona';

describe('生命周期时长（档案口径）', () => {
  it('一世 = 诞生 1′ + 成长 4′ + 衰老 1.5′ + 死亡 + 空白 45″；四世一场名义 35 分钟，随死亡窗口落在 33–37 分钟', () => {
    expect([LIFE.birth, LIFE.grow, LIFE.age, LIFE.blank]).toEqual([60, 240, 90, 45]);
    const total = PERSONA_KEYS.reduce((sum, k) => sum + nominalLifeSeconds(PERSONAS[k].death.dur), 0);
    expect(total).toBe(2100);
    expect((total - 4 * LIFE.deathWindow) / 60).toBeGreaterThanOrEqual(33);
    expect((total + 4 * LIFE.deathWindow) / 60).toBeLessThanOrEqual(37);
  });

  it('诞生段时序：先有呼吸，再响应，最后才有自发动作', () => {
    expect(LIFE.respondAt).toBeLessThan(LIFE.spontAt);
    expect(LIFE.breathRamp).toBeLessThanOrEqual(LIFE.spontAt);
    expect(LIFE.spontAt).toBeLessThan(LIFE.birth);
  });
});

describe('衰老（占位斜坡，衰老曲线待讨论）', () => {
  it('u = 0 恒等，u = 1 走到占位终点，界外钳住', () => {
    expect(ageing(0)).toEqual({ period: 1, amp: 1, latency: 1, gain: 1, speed: 1, center: 0, jitter: 0, grip: 1, vigor: 1, spont: 1 });
    const end = ageing(1);
    expect(end.amp).toBeCloseTo(1 - AGEING_PLACEHOLDER.amp, 12);
    expect(end.latency).toBeCloseTo(1 + AGEING_PLACEHOLDER.latency, 12);
    expect(end.grip).toBeCloseTo(1 - AGEING_PLACEHOLDER.grip, 12);
    expect(ageing(-1)).toEqual(ageing(0));
    expect(ageing(2)).toEqual(end);
  });

  it('单调：变慢、变浅、变弱、迟疑——从不倒回去', () => {
    let prev = ageing(0);
    for (let i = 1; i <= 50; i++) {
      const a = ageing(i / 50);
      expect(a.period).toBeGreaterThanOrEqual(prev.period);
      expect(a.latency).toBeGreaterThanOrEqual(prev.latency);
      expect(a.amp).toBeLessThanOrEqual(prev.amp);
      expect(a.gain).toBeLessThanOrEqual(prev.gain);
      expect(a.speed).toBeLessThanOrEqual(prev.speed);
      expect(a.grip).toBeLessThanOrEqual(prev.grip);
      expect(a.center).toBeGreaterThanOrEqual(prev.center);
      prev = a;
    }
  });
});

describe('四种死法（死亡即安静：不做临终表演）', () => {
  it('终点一律：幅度 0、沉到折叠端、张力归零', () => {
    for (const k of PERSONA_KEYS) {
      const end = deathFrame(PERSONAS[k].death.kind, 1);
      expect(end.amp).toBeCloseTo(0, 12);
      expect(end.sink).toBeCloseTo(1, 12);
      expect(end.tone).toBeCloseTo(0, 12);
      expect(end.irregular).toBe(false);
    }
  });

  it('活力 / 好奇 / 沉静：幅度单调递减；沉静从一开始就没有自发动作、呼吸逐次拉长', () => {
    for (const kind of ['exhaust', 'turn', 'quiet'] as const) {
      let prev = deathFrame(kind, 0).amp;
      expect(prev).toBeCloseTo(1, 12);
      for (let i = 1; i <= 100; i++) {
        const a = deathFrame(kind, i / 100).amp;
        expect(a).toBeLessThanOrEqual(prev + 1e-12);
        prev = a;
      }
    }
    expect(deathFrame('quiet', 0).activity).toBe(0);
    expect(deathFrame('quiet', 0.5).periodGrowth).toBeGreaterThan(1);
  });

  it('不稳定：前 2/3 节律紊乱（幅度不减），后 1/3 渐弱至停', () => {
    expect(deathFrame('arrhythmia', 0.3)).toMatchObject({ irregular: true, amp: 1, tone: 1 });
    expect(deathFrame('arrhythmia', 0.66).irregular).toBe(true);
    const fade = deathFrame('arrhythmia', 5 / 6);
    expect(fade.irregular).toBe(false);
    expect(fade.amp).toBeCloseTo(0.5, 9);
    expect(fade.activity).toBe(0);
  });
});
