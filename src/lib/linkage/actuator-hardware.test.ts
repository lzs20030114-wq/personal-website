import { describe, expect, it } from 'vitest';
import { READOUT_CHANNELS, readoutValues } from './actuator-readout';
import { createHardwareSnapshot, HARDWARE_CHANNELS, type HardwareSnapshotInput } from './actuator-hardware';
import { phaseDeg } from './machine';
import { strokeToTheta } from './machine-behavior';

const sample = (): HardwareSnapshotInput => ({
  values: readoutValues({
    tendons: [0, 0.5, 1], tendonTargets: [0.2, 0.6, 1], servos: [Math.PI / 6, -Math.PI / 4],
    crankDeg: 90, crankTargetDeg: 120, yaw: Math.PI / 2, yawTarget: -Math.PI / 2,
    sound: { on: true, f: 440, level: 0.8 }, light: 0.4,
  }),
  targets: { tendon0: 8.8, tendon1: 26.4, tendon2: 44, crank: 120, yaw: -90 },
  breathTarget: 0.8, soundDuty: 0.3, voicing: true,
  timeS: 12.5, seed: 7, persona: 'A', phase: 'GROW', lifeRate: 10,
});

describe('行为输出的硬件对应记录', () => {
  it('9 个逻辑设备恰好覆盖 12 个读数一次，且每行保留双语对应依据', () => {
    expect(HARDWARE_CHANNELS).toHaveLength(9);
    expect(new Set(HARDWARE_CHANNELS.map((c) => c.id)).size).toBe(9);
    const keys = HARDWARE_CHANNELS.flatMap((c) => c.readoutKeys);
    expect(keys).toHaveLength(12);
    expect(new Set(keys).size).toBe(12);
    expect([...keys].sort()).toEqual(READOUT_CHANNELS.map((c) => c.key).sort());
    for (const c of HARDWARE_CHANNELS) {
      for (const field of [c.label, c.hardware, c.calibration, c.formula]) {
        expect(field.zh.length).toBeGreaterThan(0);
        expect(field.en.length).toBeGreaterThan(0);
      }
    }
  });

  it('呼吸由曲柄非线性还原行程；指令目标直接取引擎，不把角相位当齿条比例', () => {
    const input = sample();
    for (const stroke of [0, 0.2, 0.5, 0.8, 1]) {
      input.values.crank = phaseDeg(strokeToTheta(stroke));
      const breath = createHardwareSnapshot(input).rows.find((r) => r.id === 'breath')!;
      expect(breath.simulated.value).toBeCloseTo(stroke, 9);
      expect(breath.simulated.unit).toBe('fraction');
      expect(breath.target.value).toBe(0.8);
    }
    input.values.crank = 90;
    expect(createHardwareSnapshot(input).rows.find((r) => r.id === 'breath')!.simulated.value).not.toBeCloseTo(0.5, 3);
  });

  it('声音的音高、强度、呼吸发声比例分开记录，静音不输出强度也不伪造 PWM', () => {
    const input = sample();
    const sound = createHardwareSnapshot(input).rows.find((r) => r.id === 'sound')!;
    expect(sound.simulated).toEqual({ value: 80, unit: '%' });
    expect(sound.extra).toEqual({ frequencyHz: 440, on: true, cycleVoiceFraction: 0.3 });
    expect(sound.electrical).toBeNull();
    input.voicing = false;
    const muted = createHardwareSnapshot(input).rows.find((r) => r.id === 'sound')!;
    expect(muted.simulated.value).toBe(0);
    expect(muted.target.value).toBe(0);
    expect(muted.extra!.frequencyHz).toBe(440);
  });

  it('没有硬件标定和遥测时，电气指令与实测反馈逐行为空；原有输出单位不变', () => {
    const snap = createHardwareSnapshot(sample());
    expect(snap.source).toBe('simulation');
    expect(snap.rows.map((r) => r.id)).toEqual(HARDWARE_CHANNELS.map((c) => c.id));
    for (const r of snap.rows) {
      expect(r.electrical).toBeNull();
      expect(r.feedback).toBeNull();
    }
    expect(snap.rows.find((r) => r.id === 'tendon1')!.simulated).toEqual({ value: 22, unit: 'mm' });
    expect(snap.rows.find((r) => r.id === 'servo1')!.simulated).toEqual({ value: -45, unit: '°' });
    expect(snap.rows.find((r) => r.id === 'yaw')!.target.value).toBe(-90);
  });

  it('导出是一份独立样本，后续帧修改原读数不会改写它', () => {
    const input = sample();
    const snap = createHardwareSnapshot(input);
    const before = JSON.stringify(snap);
    input.values.tendon0 = 33;
    input.targets.tendon0 = 44;
    input.breathTarget = 0.1;
    input.soundDuty = 0.9;
    input.timeS = 100;
    expect(JSON.stringify(snap)).toBe(before);
    expect(snap.timeS).toBe(12.5);
    expect(snap.lifeRate).toBe(10);
  });
});
