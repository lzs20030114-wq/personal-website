import { describe, expect, it } from 'vitest';
import { packTrajectories, unpackTrajectories } from './cohabit-bake-format';
import type { BandTrajectory } from './cohabit-solid';

/** 小的假轨迹：不跑引擎（真烘一组要几十秒），只验打包往返 */
function fake(n: number, seed: number): BandTrajectory {
  const frame = (k: number) => Float64Array.from({ length: 2 * n }, (_, i) => Math.sin(seed + k * 1.7 + i * 0.37) * 123.456789);
  const a = frame(0);
  const b = frame(1);
  const lock = Uint8Array.from([1, 0, 1]);
  return {
    n,
    frames: [a, b, b, b, frame(2)], // 停稳之后的帧共用同一个数组
    footY: 0.1 + seed,
    platformTopY: -1 / 3,
    reach: Math.PI,
    retractActive: 3,
    formActive: 2,
    doorActive: 0,
    bonds: Int32Array.from([0, 3, 1, 2, 4, 5]),
    sides: Int8Array.from([1, -1, 1]),
    locks: [null, lock, lock, Uint8Array.from([1, 1, 1]), null],
    mid: 4,
    midHalf: 2,
    ...(seed ? { upperMid: 7, upperHalf: 1 } : {}),
  };
}

describe('带子轨迹的预烘文件', () => {
  const trajs = [fake(6, 0), fake(6, 1), fake(9, 2)];
  const buf = packTrajectories('k#1', trajs);

  it('往返逐位相同，共用的帧解出来仍共用', () => {
    const back = unpackTrajectories(buf, 'k#1');
    expect(back).not.toBeNull();
    expect(back).toEqual(trajs);
    for (const t of back!) {
      expect(t.frames[1]).toBe(t.frames[2]);
      expect(t.frames[2]).toBe(t.frames[3]);
      expect(t.frames[0]).not.toBe(t.frames[1]);
      expect(t.locks[1]).toBe(t.locks[2]);
    }
    expect('upperMid' in back![0]).toBe(false);
    expect(back![1].upperMid).toBe(7);
  });

  it('键对不上、被截断、不是这种文件：都返回 null（台架退回现算）', () => {
    expect(unpackTrajectories(buf, 'k#2')).toBeNull();
    expect(unpackTrajectories(buf.slice(0, buf.byteLength - 8), 'k#1')).toBeNull();
    expect(unpackTrajectories(new ArrayBuffer(4), 'k#1')).toBeNull();
    expect(unpackTrajectories(new TextEncoder().encode('<!doctype html><html>404</html>').buffer as ArrayBuffer, 'k#1')).toBeNull();
  });
});
