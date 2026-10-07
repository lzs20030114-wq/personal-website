import { describe, expect, it } from 'vitest';
import { BehaviorEngine, HAND, type EngineState } from './behavior/engine';
import type { LogRecord } from './behavior/log';
import { PERSONA_KEYS, type PersonaKey } from './behavior/persona';
import { ARM_GEOM, type ViewParams, handReading, projectLogical, sweepFraming, yawPoint } from './machine-behavior';

/**
 * 闭环（Lab 1-6，2026-10-07）：台架那一段原样走一遍——固定一个视角、一个不动的指针，每 0.1 s 用
 * 此刻的偏航重算读数（handReading，台架同一个函数）推给引擎。手写的 HAND 读数是开环的（机身一转，
 * 读数本该跟着变），这里才是真的「机器转了，手在它眼里的位置也变了」。
 */

type M3 = number[];
const mul3 = (a: M3, b: M3): M3 => {
  const r = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
};
const rx = (t: number): M3 => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
const ry = (t: number): M3 => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];
const rz = (t: number): M3 => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1];
const AXON = mul3(rz(-1.053336), mul3(rx(0.735843), ry(0.867459)));
const view: ViewParams = { ...sweepFraming(AXON), m: AXON, pan: { x: 0, y: 0 }, persp: 0 };

const order = (first: PersonaKey): PersonaKey[] => [first, ...PERSONA_KEYS.filter((k) => k !== first)];
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** 世界里一个点（臂高的水平面上）→ 画面上的指针 */
const pointerAt = (bearing: number, dist: number): { x: number; y: number } =>
  projectLogical(view, {
    x: -Math.cos(bearing) * dist, // FACING = π：方位 0 = 世界 −X
    y: -Math.sin(bearing) * dist,
    z: ARM_GEOM.base.z,
  });

/** 跑一场闭环：成长段开头起，指针钉在 p，sec 秒 */
function loop(first: PersonaKey, seed: number, p: { x: number; y: number }, sec: number) {
  const e = new BehaviorEngine({ seed, order: order(first), lifeRate: 1 });
  const log: LogRecord[] = e.drain();
  e.skip();
  const r3 = (x: number): number => Math.round(x * 1000) / 1000;
  let hold: number | undefined;
  for (let i = 0; i < sec * 60; i++) {
    if (i % 6 === 0) {
      const r = handReading(view, p, e.targets().yaw, hold);
      hold = r.bearing;
      e.push({
        kind: 'HAND',
        on: true,
        bearing: r3(r.bearing),
        dist: Math.round(r.dist),
        face: r3(r.face),
        aimDir: r3(r.aimDir),
        aimBend: r3(r.aimBend),
        aimDist: Math.round(r.aimDist),
      });
    }
    e.tick();
    log.push(...e.drain());
  }
  return { e, log };
}

/** 第一次看见手时抽到 mode 的种子 */
function seedFor(first: PersonaKey, mode: string, p: { x: number; y: number }): number {
  for (let seed = 1; seed < 300; seed++) {
    const { log } = loop(first, seed, p, 2.5);
    if (log.find((r) => r.ev === 'HAND_SEEN')?.p?.mode === mode) return seed;
  }
  throw new Error(`no seed ${first} ${mode}`);
}

describe('闭环：画面上不动的指针 → 机器怎么对它', () => {
  it('迎（好奇）：臂够不着的手 → 机身转过去，臂线对准手（不是机身中线）', () => {
    const p = pointerAt(1.3, 1100);
    const { e, log } = loop('C', seedFor('C', 'toward', p), p, 12);
    expect(log.filter((r) => r.ev === 'HAND_SEEN').every((r) => r.p?.mode === 'toward')).toBe(true);
    const r = handReading(view, p, e.targets().yaw);
    // 转完：此刻读出的 face（臂线对准手该有的朝向）就是机身朝向
    expect(Math.abs(wrap(r.face - e.targets().yaw))).toBeLessThan(HAND.turnAt);
    // 臂线（基座 → 笔直臂梢）的方向与「基座 → 手」的方向在水平面上差不到 20°
    const B = yawPoint(ARM_GEOM.base, e.targets().yaw);
    const T = yawPoint(ARM_GEOM.tip, e.targets().yaw);
    const H = { x: -Math.cos(1.3) * 1100, y: -Math.sin(1.3) * 1100 };
    const aArm = Math.atan2(T.y - B.y, T.x - B.x);
    const aHand = Math.atan2(H.y - B.y, H.x - B.x);
    expect(Math.abs(wrap(aArm - aHand))).toBeLessThan((20 * Math.PI) / 180);
  });

  it('躲（沉静）：机身背过去，手出了视野以后被忘掉', () => {
    const p = pointerAt(0.2, 900);
    const { e, log } = loop('B', seedFor('B', 'away', p), p, 30);
    expect(log.some((r) => r.ev === 'HAND_SEEN' && r.p?.mode === 'away')).toBe(true);
    expect(Math.abs(wrap(e.targets().yaw - (0.2 + Math.PI)))).toBeLessThan(Math.PI / 3);
    expect(log.some((r) => r.ev === 'HAND_LOST' && r.p?.reason === 'unseen')).toBe(true);
  });

  it('迎：手就在臂梢旁边 → 机身不转身对准（臂够得着），臂弯过去（指令弯向 ≈ 读数弯向）', () => {
    const tip = ARM_GEOM.tip;
    // 臂梢左边 60 mm、同高（俯视意义上的左 = 世界 −Y）
    const p = projectLogical(view, { x: tip.x + 30, y: tip.y - 60, z: tip.z });
    const { e, log } = loop('C', seedFor('C', 'toward', p), p, 6);
    // 看见以后没有为它转身（看见之前的张望可以有：成长段开头 ⑨ 正好到点）
    const seenAt = log.find((r) => r.ev === 'HAND_SEEN')!.t;
    expect(e.state.hand?.turning).toBe(false);
    expect(log.some((r) => r.ev === 'ORIENT' && r.t > seenAt)).toBe(false);
    const r = handReading(view, p, e.targets().yaw);
    const arm = e.targets().arm;
    expect(arm.bend).toBeGreaterThan(0.3);
    expect(Math.abs(wrap(arm.dir - r.aimDir))).toBeLessThan(0.35);
  });

  it('同一个闭环可以快照 / 恢复，接着跑逐位相同', () => {
    const p = pointerAt(-0.8, 1000);
    const seed = seedFor('A', 'toward', p);
    const a = loop('A', seed, p, 8);
    const st: EngineState = JSON.parse(JSON.stringify(a.e.snapshot()));
    const b = BehaviorEngine.restore(st);
    for (let i = 0; i < 120; i++) {
      a.e.tick();
      b.tick();
    }
    expect(b.targets()).toEqual(a.e.targets());
  });
});
