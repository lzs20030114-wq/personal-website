import { type HardwareId, type HardwareSnapshot } from './actuator-hardware';
import { TENDON_TAKEUP_MM } from './actuator-readout';
import { SMALLARM_STARTLE } from './machine-smallarm';

/** 台架执行层的物理量需求；不是硬件回读或可直接发送的电气指令。 */
export interface ActuatorCommand {
  tendonsMm: [number, number, number];
  feelersDeg: [number, number];
  breathStroke: number;
  yawDeg: number;
  soundOn: boolean;
  soundHz: number;
  soundLevel: number;
  lightLevel: number;
}

export type ActuatorMode = 'behavior' | 'manual';

/** 同一编号和颜色供面板、曲线与模型标注共用；颜色不参与动作算法。 */
export const DEBUG_CHANNELS: readonly { id: HardwareId; short: string; color: string }[] = [
  { id: 'tendon0', short: 'T1', color: '#80c59b' },
  { id: 'tendon1', short: 'T2', color: '#e2ad72' },
  { id: 'tendon2', short: 'T3', color: '#77b3dc' },
  { id: 'servo0', short: 'F1', color: '#d78daf' },
  { id: 'servo1', short: 'F2', color: '#c8ca74' },
  { id: 'breath', short: 'B', color: '#d4d3c9' },
  { id: 'yaw', short: 'Y', color: '#ad9bde' },
  { id: 'sound', short: 'A', color: '#71c8c5' },
  { id: 'light', short: 'L', color: '#ebce80' },
];

const FEELER_MAX_DEG = SMALLARM_STARTLE.max * 180 / Math.PI;
const bounded = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;

/** 模型边界护栏，不代表真机的安全限位；非有限输入统一回落到 0。 */
export function clampActuatorCommand(command: ActuatorCommand): ActuatorCommand {
  return {
    tendonsMm: [
      bounded(command.tendonsMm[0], 0, TENDON_TAKEUP_MM),
      bounded(command.tendonsMm[1], 0, TENDON_TAKEUP_MM),
      bounded(command.tendonsMm[2], 0, TENDON_TAKEUP_MM),
    ],
    feelersDeg: [
      bounded(command.feelersDeg[0], -FEELER_MAX_DEG, FEELER_MAX_DEG),
      bounded(command.feelersDeg[1], -FEELER_MAX_DEG, FEELER_MAX_DEG),
    ],
    breathStroke: bounded(command.breathStroke, 0, 1),
    yawDeg: bounded(command.yawDeg, -180, 180),
    soundOn: command.soundOn === true,
    soundHz: bounded(command.soundHz, 0, 2000),
    soundLevel: bounded(command.soundLevel, 0, 1),
    lightLevel: bounded(command.lightLevel, 0, 1),
  };
}

/** 从传入样本的仿真位置接管；模式切换传入即时机构采样，避免追赶尚未到达的行为目标。 */
export function commandFromSnapshot(snapshot: HardwareSnapshot): ActuatorCommand {
  const get = (id: HardwareId) => snapshot.rows.find((row) => row.id === id);
  const value = (id: HardwareId): number => get(id)?.simulated.value ?? 0;
  const sound = get('sound');
  return clampActuatorCommand({
    tendonsMm: [value('tendon0'), value('tendon1'), value('tendon2')],
    feelersDeg: [value('servo0'), value('servo1')],
    breathStroke: value('breath'),
    yawDeg: value('yaw'),
    soundOn: sound?.extra?.on === true,
    soundHz: sound?.extra?.frequencyHz ?? 0,
    soundLevel: value('sound') / 100,
    lightLevel: value('light') / 100,
  });
}

/** 面板主值：线长 mm、角度 °，呼吸/声/灯用百分比。声音开关另显示，不丢掉静音时的电平设定。 */
export function commandValue(command: ActuatorCommand, id: HardwareId): number {
  const c = clampActuatorCommand(command);
  switch (id) {
    case 'tendon0': return c.tendonsMm[0];
    case 'tendon1': return c.tendonsMm[1];
    case 'tendon2': return c.tendonsMm[2];
    case 'servo0': return c.feelersDeg[0];
    case 'servo1': return c.feelersDeg[1];
    case 'breath': return c.breathStroke * 100;
    case 'yaw': return c.yawDeg;
    case 'sound': return c.soundLevel * 100;
    case 'light': return c.lightLevel * 100;
  }
}

/** C++ 风格的需求预览；null 有意保留，使缺失标定不会伪装成可执行的数。 */
export function arduinoPreview(command: ActuatorCommand, mode: ActuatorMode): string {
  const c = clampActuatorCommand(command);
  const n = (value: number): string => Number(value.toFixed(4)).toString();
  return [
    '// Arduino / ESP32 · 物理量需求预览 / physical-demand preview',
    '// 伪代码：不可编译、不可直接下发。不是实测反馈。',
    '// Pseudocode: not compilable, not for direct transmission; not measured feedback.',
    `// Source mode: ${mode === 'manual' ? 'manual' : 'behavior'}`,
    'ActuatorDemand demand = {',
    `  .tendon_takeup_mm = { ${c.tendonsMm.map(n).join(', ')} }, // T1, T2, T3; model cable take-up`,
    `  .feeler_angle_deg = { ${c.feelersDeg.map(n).join(', ')} }, // F1, F2; model-centred angles`,
    `  .breath_stroke_01 = ${n(c.breathStroke)}, // B: 0 open, 1 folded; rack position requires calibrated f(s)`,
    `  .body_yaw_deg = ${n(c.yawDeg)}, // Y: zero, direction and mechanical limits need calibration`,
    `  .sound_on = ${c.soundOn}, // A: final on/off gate`,
    `  .sound_frequency_hz = ${n(c.soundHz)},`,
    `  .sound_level_01 = ${n(c.soundLevel)}, // normalized level; not dB or electrical PWM duty`,
    `  .light_level_01 = ${n(c.lightLevel)} // L: requires colour/brightness mapping to WS2812B data`,
    '};',
    '',
    '// 待标定 / uncalibrated: no GPIO, pulse endpoints or step counts assumed.',
    'step_target = null; // motor step angle, microsteps, gearing, travel and zero are unconfirmed',
    'pulse_us = null; // per-servo direction, centre and pulse-to-angle calibration are missing',
    'rack_position_mm = null; // calibrated rack f(breath_stroke_01) is missing',
    'audio_samples = null; // audio source, gain and waveform are unconfirmed',
    'led_rgb_frame = null; // colour, brightness transfer and power budget are unconfirmed',
  ].join('\n');
}
