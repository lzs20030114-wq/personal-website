import { describe, expect, it } from 'vitest';
import { arduinoPreview, clampActuatorCommand, commandFromSnapshot, commandValue, DEBUG_CHANNELS, type ActuatorCommand } from './actuator-debug';
import { createHardwareSnapshot, HARDWARE_CHANNELS } from './actuator-hardware';
import { TENDON_TAKEUP_MM, readoutValues } from './actuator-readout';
import { phaseDeg } from './machine';
import { strokeToTheta } from './machine-behavior';

const command = (): ActuatorCommand => ({
  tendonsMm: [4, 22, 40], feelersDeg: [25, -35], breathStroke: 0.65, yawDeg: -90,
  soundOn: true, soundHz: 440, soundLevel: 0.8, lightLevel: 0.4,
});

const snapshot = () => createHardwareSnapshot({
  values: readoutValues({
    tendons: [0, 0.5, 1], tendonTargets: [1, 1, 1], servos: [Math.PI / 6, -Math.PI / 4],
    crankDeg: phaseDeg(strokeToTheta(0.3)), crankTargetDeg: 180,
    yaw: Math.PI / 2, yawTarget: -Math.PI / 2,
    sound: { on: true, f: 640, level: 0.7 }, light: 0.35,
  }),
  targets: { tendon0: 44, tendon1: 44, tendon2: 44, crank: 180, yaw: -90 },
  breathTarget: 1, soundDuty: 0.2, voicing: true,
  timeS: 12.5, seed: 7, persona: 'A', phase: 'GROW', lifeRate: 1,
});

describe('执行器调试的物理量合同', () => {
  it('标记一一覆盖九个逻辑设备，缩写不重复且颜色可共用', () => {
    expect(DEBUG_CHANNELS.map((c) => c.id)).toEqual(HARDWARE_CHANNELS.map((c) => c.id));
    expect(DEBUG_CHANNELS.map((c) => c.short)).toEqual(['T1', 'T2', 'T3', 'F1', 'F2', 'B', 'Y', 'A', 'L']);
    expect(new Set(DEBUG_CHANNELS.map((c) => c.short)).size).toBe(9);
    for (const c of DEBUG_CHANNELS) expect(c.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('有限越界值夹在模型范围内，不把限位改成循环回绕', () => {
    const clamped = clampActuatorCommand({
      tendonsMm: [-1, 999, 12], feelersDeg: [-90, 90], breathStroke: 2, yawDeg: 270,
      soundOn: true, soundHz: 3000, soundLevel: 2, lightLevel: -1,
    });
    expect(clamped).toMatchObject({
      tendonsMm: [0, TENDON_TAKEUP_MM, 12], breathStroke: 1, yawDeg: 180,
      soundOn: true, soundHz: 2000, soundLevel: 1, lightLevel: 0,
    });
    expect(clamped.feelersDeg[0]).toBeCloseTo(-75, 10);
    expect(clamped.feelersDeg[1]).toBeCloseTo(75, 10);
    expect(clampActuatorCommand({ ...command(), breathStroke: -1, yawDeg: -270, soundHz: -30 }).yawDeg).toBe(-180);
    expect(clampActuatorCommand({ ...command(), breathStroke: -1, soundHz: -30 }).breathStroke).toBe(0);
    expect(clampActuatorCommand({ ...command(), soundHz: -30 }).soundHz).toBe(0);
  });

  it('每种非有限数都不会漏入绘图或需求预览', () => {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      const out = clampActuatorCommand({
        tendonsMm: [invalid, invalid, invalid], feelersDeg: [invalid, invalid],
        breathStroke: invalid, yawDeg: invalid, soundOn: false,
        soundHz: invalid, soundLevel: invalid, lightLevel: invalid,
      });
      expect(out).toEqual({
        tendonsMm: [0, 0, 0], feelersDeg: [0, 0], breathStroke: 0, yawDeg: 0,
        soundOn: false, soundHz: 0, soundLevel: 0, lightLevel: 0,
      });
      expect(arduinoPreview(out, 'manual')).not.toMatch(/NaN|Infinity/);
    }
  });

  it('接管读的是仿真当前值，不跳到未跟到的目标；声音与灯由百分比还原 0–1', () => {
    const out = commandFromSnapshot(snapshot());
    expect(out.tendonsMm).toEqual([0, 22, 44]);
    expect(out.feelersDeg[0]).toBeCloseTo(30, 10);
    expect(out.feelersDeg[1]).toBeCloseTo(-45, 10);
    expect(out.breathStroke).toBeCloseTo(0.3, 9);
    expect(out.yawDeg).toBe(90);
    expect(out.soundOn).toBe(true);
    expect(out.soundHz).toBe(640);
    expect(out.soundLevel).toBeCloseTo(0.7, 9);
    expect(out.lightLevel).toBeCloseTo(0.35, 9);
    // 呼吸发声窗口 0.2 不是声音电平或电气 PWM duty。
    expect(out.soundLevel).not.toBe(0.2);
  });

  it('每次转换生成独立副本，后续手动编辑不改快照或原命令', () => {
    const snap = snapshot();
    const before = JSON.stringify(snap);
    const out = commandFromSnapshot(snap);
    const copy = clampActuatorCommand(out);
    copy.tendonsMm[0] = 10;
    copy.feelersDeg[0] = 70;
    expect(out.tendonsMm[0]).toBe(0);
    expect(out.feelersDeg[0]).toBeCloseTo(30, 10);
    out.tendonsMm[1] = 3;
    expect(JSON.stringify(snap)).toBe(before);
  });

  it('主值保留单位：mm、度与百分比；静音与电平设定相互独立', () => {
    const c = { ...command(), soundOn: false };
    expect(DEBUG_CHANNELS.map(({ id }) => commandValue(c, id))).toEqual([4, 22, 40, 25, -35, 65, -90, 80, 40]);
  });

  it('Arduino 预览明确只是需求伪代码，保留单位和未知电气量', () => {
    const preview = arduinoPreview(command(), 'manual');
    expect(preview).toContain('not compilable, not for direct transmission');
    expect(preview).toContain('Source mode: manual');
    expect(preview).toContain('.tendon_takeup_mm = { 4, 22, 40 }');
    expect(preview).toContain('.feeler_angle_deg = { 25, -35 }');
    expect(preview).toContain('.breath_stroke_01 = 0.65');
    expect(preview).toContain('.sound_frequency_hz = 440');
    expect(preview).toContain('.sound_level_01 = 0.8');
    expect(preview).toContain('.light_level_01 = 0.4');
    expect(preview).toContain('not dB or electrical PWM duty');
    expect(preview).toContain('step_target = null');
    expect(preview).toContain('pulse_us = null');
    expect(preview).toContain('rack_position_mm = null');
    expect(preview).toContain('M1: NEMA17 + TMC2209');
    expect(preview).toContain('M7: HDB60XZ45B');
    expect(preview).toContain('M6 shared_shaft_deg = 218.4; motor_shaft_deg = 655.2;');
    expect(preview).toContain('M7 recorded 45:1: motor_shaft_deg = -4050; NOT accumulated turns.');
    expect(preview).toContain('M1–M3 motor angles unknown');
    expect(preview).not.toMatch(/pinMode|analogWrite|writeMicroseconds/);
    expect(arduinoPreview({ ...command(), soundOn: false }, 'behavior')).toContain('.sound_on = false');
  });
});
