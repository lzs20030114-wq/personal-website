import { describe, expect, it } from 'vitest';
import {
  ActuatorReadout,
  type ActuatorFrame,
  READOUT_CHANNELS,
  READOUT_GROUPS,
  TENDON_TAKEUP_MM,
  readoutTargets,
  readoutValues,
} from './actuator-readout';
import { TENTACLE3D } from './tentacle3d-data';

const frame = (over: Partial<ActuatorFrame> = {}): ActuatorFrame => ({
  tendons: [0, 0, 0],
  tendonTargets: [0, 0, 0],
  servos: [0, 0],
  crankDeg: 0,
  crankTargetDeg: 0,
  yaw: 0,
  yawTarget: 0,
  sound: { on: false, f: 440, level: 1 },
  light: 0,
  ...over,
});

describe('实时输出面板的换算', () => {
  it('肌腱：收缩率 0–1 = 绞盘收进 0–44 mm（与 applyContraction3 同一条换算）', () => {
    expect(TENDON_TAKEUP_MM).toBe(TENTACLE3D.pullMax + TENTACLE3D.slack);
    const v = readoutValues(frame({ tendons: [0, 0.5, 1] }));
    expect(v.tendon0).toBe(0);
    expect(v.tendon1).toBeCloseTo(TENDON_TAKEUP_MM / 2, 9);
    expect(v.tendon2).toBeCloseTo(TENDON_TAKEUP_MM, 9);
  });

  it('舵机与偏航换成度；声音不发声时音量为 0；灯与音量是百分比', () => {
    const v = readoutValues(frame({ servos: [Math.PI / 6, -Math.PI / 4], yaw: -Math.PI / 2, light: 0.42 }));
    expect(v.servo0).toBeCloseTo(30, 9);
    expect(v.servo1).toBeCloseTo(-45, 9);
    expect(v.yaw).toBeCloseTo(-90, 9);
    expect(v.light).toBeCloseTo(42, 9);
    expect(v.voice).toBe(0);
    expect(readoutValues(frame({ sound: { on: true, f: 900, level: 0.8 } })).voice).toBeCloseTo(80, 9);
  });

  it('目标只给有目标可比的通道（肌腱、曲柄、偏航）', () => {
    const t = readoutTargets(frame({ tendonTargets: [1, 0, 0], crankTargetDeg: 90, yawTarget: Math.PI }));
    expect(Object.keys(t).sort()).toEqual(['crank', 'tendon0', 'tendon1', 'tendon2', 'yaw']);
    expect(t.tendon0).toBeCloseTo(TENDON_TAKEUP_MM, 9);
    expect(t.yaw).toBeCloseTo(180, 9);
  });

  it('每条通道都归在某一组里，量程有效', () => {
    for (const c of READOUT_CHANNELS) {
      expect(READOUT_GROUPS).toContain(c.group);
      expect(c.max).toBeGreaterThan(c.min);
      if (c.centered) expect(c.min).toBe(-c.max);
    }
    expect(new Set(READOUT_CHANNELS.map((c) => c.key)).size).toBe(READOUT_CHANNELS.length);
  });
});

describe('ActuatorReadout', () => {
  it('角速度：曲柄匀速走 60°/s，平滑后读数贴近 60；偏航跨 ±180° 不当成一整圈', () => {
    const r = new ActuatorReadout(10, 1 / 20);
    const dt = 1 / 60;
    for (let i = 0; i <= 120; i++) r.update(frame({ crankDeg: i * dt * 60 }), dt);
    expect(r.values!.crankRate).toBeCloseTo(60, 0);
    const y = new ActuatorReadout();
    // 从 179° 走到 −179°（经过 180°）：+2°/帧，不是 −358°
    const step = (2 * Math.PI) / 180;
    let a = (175 * Math.PI) / 180;
    for (let i = 0; i < 60; i++) {
      y.update(frame({ yaw: a > Math.PI ? a - 2 * Math.PI : a }), dt);
      a += step;
    }
    expect(y.values!.yawRate).toBeGreaterThan(100);
    expect(y.values!.yawRate).toBeLessThan(130);
  });

  it('按固定间隔记点、定长环形缓冲，series 旧 → 新', () => {
    const r = new ActuatorReadout(1, 0.1); // 10 个点
    for (let i = 0; i < 25; i++) r.update(frame({ light: i / 100 }), 0.1);
    expect(r.length).toBe(10);
    const s = r.series('light');
    expect(s.length).toBe(10);
    expect(s[0]).toBeCloseTo(15, 5);
    expect(s[9]).toBeCloseTo(24, 5);
    r.reset();
    expect(r.length).toBe(0);
    expect(r.values).toBeNull();
  });

  it('帧比记点间隔密：每 0.05 s 只记一个点', () => {
    const r = new ActuatorReadout(10, 1 / 20);
    for (let i = 0; i < 60; i++) r.update(frame(), 1 / 60);
    // 第一帧记一个，之后每三帧一个
    expect(r.length).toBeGreaterThanOrEqual(20);
    expect(r.length).toBeLessThanOrEqual(21);
  });
});
