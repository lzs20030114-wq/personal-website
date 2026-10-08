import { describe, expect, it } from 'vitest';
import { ARM_OSC_MAX_HZ, type Ease, type Phase, ease, lerpPose, lerpPoseLine, startProgram, stepProgram, totalDur } from './programs';

/**
 * 动作程序解释器（动作词汇 v2 研究原型）的守门：缓动端点、插值路径、跨段衔接不跳、JSON 往返无损。
 * 程序是要交给固件照表执行的，这几条坏了不报错，只会让动作在段界处顿一下或走错路。
 */
const rest = { bend: 0.25, dir: 0.3, deep: 0 };

describe('动作程序 programs.ts', () => {
  it('六种缓动：0 → 0、1 → 1（hold 恒 0）；最小急动关于中点对称', () => {
    for (const e of ['lin', 'mj', 'out', 'out4', 'in'] as Ease[]) {
      expect(ease(e, 0)).toBeCloseTo(0, 12);
      expect(ease(e, 1)).toBeCloseTo(1, 12);
    }
    expect(ease('hold', 0.7)).toBe(0);
    for (const u of [0.1, 0.25, 0.4]) expect(ease('mj', u) + ease('mj', 1 - u)).toBeCloseTo(1, 12);
    // 先快后慢：out4 在前 10% 就走了三成多
    expect(ease('out4', 0.1)).toBeGreaterThan(0.3);
  });

  it('弧路径走最短弧、弯曲小时不原地打转；直线路径穿过中心', () => {
    const a = { bend: 0.6, dir: 3, deep: 0 };
    const b = { bend: 0.6, dir: -3, deep: 0 };
    // 3 → −3 的最短弧经过 ±π，不经过 0
    expect(Math.abs(lerpPose(a, b, 0.5).dir)).toBeGreaterThan(3);
    // 相对的两个弯向：直线在中点穿过中心（弯曲 ≈ 0），弧路径保持弯曲
    const l = { bend: 0.5, dir: -2.09, deep: 0.4 };
    const r = { bend: 0.5, dir: 1.05, deep: 0 };
    expect(lerpPoseLine(l, r, 0.5).bend).toBeLessThan(0.02);
    expect(lerpPose(l, r, 0.5).bend).toBeCloseTo(0.5, 9);
    expect(lerpPoseLine(l, r, 0.5).deep).toBeCloseTo(0.2, 12);
  });

  it('时长非法、摆动超过臂的通带（0.6 Hz）一律拒收', () => {
    const p: Phase = { name: 'x', dur: -1, ease: 'mj', arm: 'rest' };
    expect(() => startProgram('bad', 0, [p], rest)).toThrow();
    const q: Phase = { name: 'y', dur: 1, ease: 'hold', arm: 'hold', osc: { amp: 0.1, hz: ARM_OSC_MAX_HZ + 0.1, decay: 0 } };
    expect(() => startProgram('bad', 0, [q], rest)).toThrow();
  });

  it('跨段衔接：下一段从上一段段末起，逐步不跳；走完停在静息、done', () => {
    const phases: Phase[] = [
      { name: 'go', dur: 0.5, ease: 'mj', arm: { bend: 0.9, dir: -2.09, deep: 0.3 }, path: 'line' },
      // 0.4 s × 0.5 Hz 不是整周期：段末的摆动要平滑收到 0，换段那一帧不跳
      { name: 'hold', dur: 0.4, ease: 'hold', arm: 'hold', osc: { amp: 0.1, hz: 0.5, decay: 1 } },
      { name: 'back', dur: 0.8, ease: 'mj', arm: 'rest' },
    ];
    const p = startProgram('t', 2, phases, { bend: 0.2, dir: 0.5, deep: 0 });
    expect(totalDur(p)).toBeCloseTo(1.7, 12);
    let prev = stepProgram(p, 2, rest).pose;
    let maxStep = 0;
    let done = false;
    for (let i = 1; i <= 130; i++) {
      const r = stepProgram(p, 2 + i / 60, rest);
      const dx = r.pose.bend * Math.cos(r.pose.dir) - prev.bend * Math.cos(prev.dir);
      const dy = r.pose.bend * Math.sin(r.pose.dir) - prev.bend * Math.sin(prev.dir);
      maxStep = Math.max(maxStep, Math.hypot(dx, dy), Math.abs(r.pose.deep - prev.deep));
      prev = r.pose;
      done = r.done;
    }
    // go 段：差动平面上约 1.1 的路程、0.5 s 最小急动，峰值每帧 ≈ 0.069；跳变会远大于此
    expect(maxStep).toBeLessThan(0.075);
    expect(done).toBe(true);
    expect(prev).toEqual(rest);
  });

  it('回到静息的那段：静息方向一直在漂、夹角跨过 180° 时，弧不翻面（逐帧连续）', () => {
    const p = startProgram('t', 0, [{ name: 'back', dur: 2, ease: 'mj', arm: 'rest' }], { bend: 0.6, dir: -1.6, deep: 0 });
    let prev = p.out;
    let maxStep = 0;
    for (let i = 0; i <= 120; i++) {
      // 静息方向从 +1.4 漂到 +1.7：相对起点的夹角从 3.0 跨过 π
      const r = stepProgram(p, i / 60, { bend: 0.25, dir: 1.4 + (0.3 * i) / 120, deep: 0 });
      const dx = r.pose.bend * Math.cos(r.pose.dir) - prev.bend * Math.cos(prev.dir);
      const dy = r.pose.bend * Math.sin(r.pose.dir) - prev.bend * Math.sin(prev.dir);
      maxStep = Math.max(maxStep, Math.hypot(dx, dy));
      prev = r.pose;
    }
    expect(maxStep).toBeLessThan(0.04);
  });

  it('执行到一半 → JSON 往返 → 接着走，与一口气走完逐位相同', () => {
    const phases: Phase[] = [
      { name: 'a', dur: 0.7, ease: 'out', arm: { bend: 0.7, dir: 1, deep: 0 } },
      { name: 'b', dur: 1.1, ease: 'hold', arm: 'hold', osc: { amp: 0.12, hz: 0.6, decay: 0.3 } },
      { name: 'c', dur: 0.9, ease: 'mj', arm: 'rest' },
    ];
    const a = startProgram('t', 0, phases, rest);
    const b = startProgram('t', 0, JSON.parse(JSON.stringify(phases)), rest);
    for (let i = 0; i < 60; i++) stepProgram(a, i / 60, rest), stepProgram(b, i / 60, rest);
    const b2 = JSON.parse(JSON.stringify(b));
    for (let i = 60; i < 170; i++) expect(stepProgram(b2, i / 60, rest).pose).toEqual(stepProgram(a, i / 60, rest).pose);
  });
});
