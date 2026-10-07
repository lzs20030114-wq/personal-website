import { describe, expect, it } from 'vitest';
import {
  ENGINE_EVENTS,
  INTENSITY,
  SENSOR_KINDS,
  TOUCH_CODES,
  bandOf,
  intensityOf,
  isSensorInput,
  sensorPayload,
  type SensorInput,
} from './events';

describe('九类事件词表（spec §3.2，2026-10-07 拍板）', () => {
  it('恰好九类，名字与 spec 一致', () => {
    expect([...SENSOR_KINDS]).toEqual([
      'PRESENCE',
      'FEELER_TOUCH',
      'SHELL_STROKE',
      'SHELL_HOLD',
      'LIFT',
      'KNOCK',
      'SOUND',
      'ARM_TOUCH',
      'RESISTANCE',
    ]);
    // 派生事件不占九类名额，也不与之重名
    for (const e of ENGINE_EVENTS) expect(SENSOR_KINDS as readonly string[]).not.toContain(e);
  });

  it('刺激强度表：轻抚最弱、戳最强、拿起最大；落下的电平不算刺激', () => {
    const I = (e: SensorInput): number => intensityOf(e, 'gone');
    expect(I({ kind: 'SHELL_STROKE', half: 'L', touch: 'stroke' })).toBe(0.1);
    expect(I({ kind: 'SHELL_STROKE', half: 'R', touch: 'pat' })).toBe(0.3);
    expect(I({ kind: 'SHELL_STROKE', half: 'L', touch: 'poke' })).toBe(0.6);
    expect(I({ kind: 'FEELER_TOUCH', feeler: 1, side: 'R' })).toBe(0.4);
    expect(I({ kind: 'SHELL_HOLD', half: 'both', on: true })).toBe(0.2);
    expect(I({ kind: 'SHELL_HOLD', half: 'both', on: false })).toBe(0);
    expect(I({ kind: 'LIFT', lifted: true })).toBe(0.7);
    expect(I({ kind: 'LIFT', lifted: false })).toBe(0);
    expect(I({ kind: 'ARM_TOUCH', on: true })).toBe(INTENSITY.arm);
    expect(I({ kind: 'ARM_TOUCH', on: false })).toBe(0);
    expect(I({ kind: 'RESISTANCE', on: true })).toBe(0);
    expect(I({ kind: 'KNOCK', intensity: 0.9 })).toBe(0.9);
    expect(I({ kind: 'SOUND', level: 0.3 })).toBe(0.3);
  });

  it('在场：走近一档才算刺激，退远与离场只改状态', () => {
    const p = (band: 'gone' | 'far' | 'mid' | 'near'): SensorInput => ({ kind: 'PRESENCE', band });
    expect(intensityOf(p('far'), 'gone')).toBe(INTENSITY.approach);
    expect(intensityOf(p('near'), 'mid')).toBe(INTENSITY.approach);
    expect(intensityOf(p('mid'), 'near')).toBe(0);
    expect(intensityOf(p('gone'), 'far')).toBe(0);
    expect(intensityOf(p('mid'), 'mid')).toBe(0);
  });

  it('距离档位：远 > 1.5 m、近 < 0.6 m，测不到 = 离场', () => {
    expect(bandOf(null)).toBe('gone');
    expect(bandOf(2)).toBe('far');
    expect(bandOf(1.5)).toBe('mid');
    expect(bandOf(0.6)).toBe('mid');
    expect(bandOf(0.59)).toBe('near');
  });

  it('04-03 触碰编码表（T-0403-7）的八种人类触碰，每一种都落得进九类（提案没有漏项）', () => {
    expect(Object.keys(TOUCH_CODES).sort()).toEqual(
      ['T-cradle', 'T-hold', 'T-pat', 'T-poke', 'T-post-mortem', 'T-push', 'T-restrain', 'T-stroke'].sort(),
    );
    for (const e of Object.values(TOUCH_CODES)) {
      expect(isSensorInput(e)).toBe(true);
      expect(intensityOf(e, 'gone')).toBeGreaterThan(0);
    }
  });

  it('外来事件的形状检查：认得九类，拒收缺字段 / 越界 / 不认识的', () => {
    expect(isSensorInput({ kind: 'PRESENCE', band: 'near', bearing: 0.3 })).toBe(true);
    expect(isSensorInput({ kind: 'PRESENCE', band: 'close' })).toBe(false);
    expect(isSensorInput({ kind: 'FEELER_TOUCH', feeler: 2, side: 'L' })).toBe(false);
    expect(isSensorInput({ kind: 'KNOCK', intensity: 1.2 })).toBe(false);
    expect(isSensorInput({ kind: 'SOUND', level: Number.NaN })).toBe(false);
    expect(isSensorInput({ kind: 'ARM_TOUCH' })).toBe(false);
    expect(isSensorInput({ kind: 'DEATH_NOW' })).toBe(false);
    expect(isSensorInput(null)).toBe(false);
  });

  it('日志载荷：去掉 kind，其余原样', () => {
    expect(sensorPayload({ kind: 'SHELL_STROKE', half: 'R', touch: 'pat' })).toEqual({ half: 'R', touch: 'pat' });
    expect(sensorPayload({ kind: 'PRESENCE', band: 'far' })).toEqual({ band: 'far' });
  });
});
