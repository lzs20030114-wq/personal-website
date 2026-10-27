import { describe, expect, it } from 'vitest';
import { motorEstimate, motorMotion, MOTOR_ASSIGNMENTS, MOTOR_TRANSMISSION } from './actuator-motors';
import { createHardwareSnapshot, HARDWARE_CHANNELS } from './actuator-hardware';
import { readoutValues } from './actuator-readout';

describe('电机位与档案条件演算', () => {
  it('七个运动轴唯一对应 M1–M7，声光没有电机编号', () => {
    const assigned = HARDWARE_CHANNELS.filter((channel) => channel.motor);
    expect(assigned.map((channel) => channel.motor!.id)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']);
    expect(new Set(assigned.map((channel) => channel.motor!.id)).size).toBe(7);
    for (const channel of assigned) expect(channel.motor).toBe(MOTOR_ASSIGNMENTS[channel.id]);
    expect(HARDWARE_CHANNELS.find((channel) => channel.id === 'sound')!.motor).toBeUndefined();
    expect(HARDWARE_CHANNELS.find((channel) => channel.id === 'light')!.motor).toBeUndefined();
  });

  it('三腱保持分配提案，触须为历史角色，呼吸和转台为档案方案，不升级成实装确认', () => {
    expect(['tendon0', 'tendon1', 'tendon2'].map((id) => MOTOR_ASSIGNMENTS[id as 'tendon0']!.status)).toEqual(['proposed', 'proposed', 'proposed']);
    expect(MOTOR_ASSIGNMENTS.servo0!.status).toBe('historical-role');
    expect(MOTOR_ASSIGNMENTS.servo1!.status).toBe('historical-role');
    expect(MOTOR_ASSIGNMENTS.breath!.status).toBe('recorded-plan');
    expect(MOTOR_ASSIGNMENTS.yaw!.status).toBe('recorded-plan');
    expect(MOTOR_ASSIGNMENTS.yaw!.model).toContain('HDB60XZ45B');
    expect(MOTOR_ASSIGNMENTS.yaw!.model).not.toMatch(/1704HS20D5|SM1705/);
    expect(MOTOR_ASSIGNMENTS.breath!.shaftNote.zh).toContain('演算假设');
  });

  it('呼吸 s=1 对应中轴 336°、按3:1假设电机1008°，32齿齿条约93.83mm而非整圈100.5mm', () => {
    const estimate = motorEstimate('breath', 1);
    expect(estimate.outputDeg).toBe(336);
    expect(estimate.shaftDeg).toBe(1008);
    expect(estimate.rackMm).toHaveLength(5);
    expect(estimate.rackMm![0]).toBeCloseTo(93.83, 2);
    expect(estimate.rackMm![0]).not.toBeCloseTo(100.5, 1);
    expect(estimate.rackMm).toEqual(MOTOR_TRANSMISSION.breath.teeth.map((z) => Math.PI * z * 336 / 360));
    const half = motorEstimate('breath', 0.5);
    expect(half.outputDeg).toBe(168);
    expect(half.shaftDeg).toBe(504);
    expect(half.rackMm![0]).toBeCloseTo(estimate.rackMm![0] / 2, 10);
    expect(motorEstimate('breath', 0).rackMm).toEqual([0, 0, 0, 0, 0]);
  });

  it('呼吸只收0–1行程，不把百分数或台架曲柄度混作齿条输入', () => {
    expect(motorEstimate('breath', 50).shaftDeg).toBeNull();
    expect(motorEstimate('breath', 180).shaftDeg).toBeNull();
    expect(motorEstimate('breath', -0.1).shaftDeg).toBeNull();
    expect(motorEstimate('breath', NaN).shaftDeg).toBeNull();
  });

  it('转台45°按记录45:1得到2025°即5.625转，保留相对零位角语义', () => {
    const estimate = motorEstimate('yaw', 45);
    expect(estimate.outputDeg).toBe(45);
    expect(estimate.shaftDeg).toBe(2025);
    expect(estimate.shaftDeg! / 360).toBe(5.625);
    expect(motorEstimate('yaw', -45).shaftDeg).toBe(-2025);
    expect(estimate.note.zh).toContain('相对零位');
  });

  it('舵机仅显示模型相对角，未知卷径的腱电机不生成角度，所有电气反馈仍空', () => {
    expect(motorEstimate('servo0', -30).shaftDeg).toBe(-30);
    expect(motorEstimate('servo1', 45).shaftDeg).toBe(45);
    expect(motorEstimate('servo0', -30).note.zh).toContain('模型相对中位角');
    expect(motorEstimate('tendon0', 22).shaftDeg).toBeNull();
    expect(motorEstimate('tendon1', 44).shaftDeg).toBeNull();
    expect(motorEstimate('tendon2', 0).shaftDeg).toBeNull();
    expect(motorEstimate('sound', 50).shaftDeg).toBeNull();
    expect(motorEstimate('light', 50).shaftDeg).toBeNull();
    const snapshot = createHardwareSnapshot({
      values: readoutValues({
        tendons: [0, 0, 0], tendonTargets: [0, 0, 0], servos: [0, 0], crankDeg: 0, crankTargetDeg: 0,
        yaw: 0, yawTarget: 0, sound: { on: false, f: 440, level: 0 }, light: 0,
      }),
      targets: {}, breathTarget: 0, soundDuty: 0, voicing: false, timeS: 0, seed: 7, persona: 'A', phase: 'BIRTH', lifeRate: 1,
    });
    expect(snapshot.rows.map((row) => row.motorId)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', undefined, undefined]);
    for (const row of snapshot.rows) {
      expect(row.electrical).toBeNull();
      expect(row.feedback).toBeNull();
    }
  });
});

describe('电机运动方向的解释', () => {
  it('方向取决于变化而非当前位置正负，左右两轴不假定机械顺逆时针', () => {
    expect(motorMotion('servo0', -40, 2, false, 'zh')).toBe('向正角摆动');
    expect(motorMotion('servo1', 40, -2, false, 'zh')).toBe('向负角摆动');
    expect(motorMotion('yaw', -90, 3, false, 'zh')).toBe('转台向正角方向');
    expect(motorMotion('yaw', 90, -3, false, 'en')).toBe('Turntable toward negative angle');
  });

  it('三腱的增量为收线、减量为放线；静止值不代表主动收紧', () => {
    expect(motorMotion('tendon0', 20, 1, false, 'zh')).toBe('收线');
    expect(motorMotion('tendon1', 20, -1, false, 'zh')).toBe('放线');
    expect(motorMotion('tendon2', 20, 0, false, 'zh')).toBe('保持');
  });

  it('呼吸说明归一化行程的开合意图，不将其当曲柄角或推断电机方向', () => {
    expect(motorMotion('breath', 0.8, -0.01, false, 'zh')).toBe('齿条向展开方向');
    expect(motorMotion('breath', 0.2, 0.01, false, 'zh')).toBe('齿条向折叠方向');
    expect(motorMotion('breath', 20, 1, false, 'en')).toBe('Rack toward folding');
  });

  it('暂停与缺样本不能误显示正在运动，声光不冒充电机', () => {
    expect(motorMotion('tendon0', 20, 1, true, 'zh')).toBe('已暂停');
    expect(motorMotion('tendon0', 20, undefined, false, 'zh')).toBe('等待相邻采样');
    expect(motorMotion('tendon0', NaN, 1, false, 'zh')).toBe('等待仿真样本');
    expect(motorMotion('yaw', 30, Infinity, false, 'en')).toBe('Awaiting adjacent sample');
    expect(motorMotion('sound', 20, 1, false, 'zh')).toBe('非电机输出');
    expect(motorMotion('light', 20, 1, false, 'en')).toBe('Not a motor output');
  });
});
