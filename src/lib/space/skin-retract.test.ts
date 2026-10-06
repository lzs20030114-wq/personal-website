import { describe, expect, it } from 'vitest';
import { buildRingUnits } from './skin-ring';
import { SKIN, createSkinUnit, type SkinUnit } from './skin-unit';

/**
 * 守门：回程松键（a 路径，用户 2026-10-06 拍板「收回 = 松键」，有意重开交接件冻结决定 4）。
 * 默认路径（只调 advance）逐位不变由 skin-unit.test.ts 的 Python 对照守着；这里卡回程本身：
 * 键按锁定时的 r 倒序解开、r 回到 R0、回直终态 = 这条布在 R0 下的自然形、
 * 搬到新实例再成形与全新单元逐位相同（布没有「记忆」——探针 2026-10-06 实测的核心结论）。
 */
const units = buildRingUnits();
const A = units.find((u) => u.key === 'ledge')!;
const B = units.find((u) => u.key === 'stepped')!;

const contract = (def: typeof A, from?: SkinUnit) => {
  const s = createSkinUnit(def.spec, def.opts);
  if (from)
    s.applyTerminalState({ px: Float64Array.from(from.px), py: Float64Array.from(from.py), locked: [], step: 0, r: SKIN.R0 });
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return s;
};
const retract = (s: SkinUnit) => {
  for (let k = 0; k < SKIN.STEPS; k++) s.retractStep();
  return s;
};
const maxDiff = (a: SkinUnit, b: SkinUnit) => {
  let m = 0;
  for (let i = 0; i < a.n; i++) m = Math.max(m, Math.abs(a.px[i] - b.px[i]), Math.abs(a.py[i] - b.py[i]));
  return m;
};
const lockKey = (s: SkinUnit) => s.locked.map(([i, j]) => `${i}-${j}`).sort().join(' ');

describe('回程松键（retractStep）', () => {
  it('回程后：键全部解开、r 回到 R0、无 NaN、皮不穿芯', () => {
    const s = contract(A);
    const nLocked = s.locked.length;
    expect(nLocked).toBeGreaterThan(0);
    const lockOrder = s.locked.map(([i, j]) => `${i}-${j}`);
    retract(s);
    expect(s.retracting).toBe(true);
    expect(s.locked).toHaveLength(0);
    expect(s.released).toHaveLength(nLocked);
    expect(Math.abs(s.r - SKIN.R0)).toBeLessThan(1e-12);
    for (let i = 0; i < s.n; i++) {
      expect(Number.isNaN(s.px[i]) || Number.isNaN(s.py[i])).toBe(false);
      if (s.freeMask[i]) expect(s.px[i]).toBeGreaterThanOrEqual(0); // coreWall
    }
    // 解开序 = 锁定序倒过来（后锁先解）
    expect(s.released.map(([i, j]) => `${i}-${j}`)).toEqual(lockOrder.slice().reverse());
  });

  it('回直终态 = 这条布在 R0 下的自然形（全新实例直接走回程物理 1500 步），逐位相同', () => {
    const s = retract(contract(A));
    const rest = createSkinUnit(A.spec, A.opts);
    retract(rest);
    expect(rest.locked).toHaveLength(0); // 不开拉链 ⇒ 参考自己不会锁键
    expect(maxDiff(s, rest)).toBeLessThan(1e-9);
  });

  it('搬到另一张谱再成形 = 全新单元（锁定集合逐位相同、终态位置逐位相同）——布没有记忆', () => {
    const returned = retract(contract(A));
    const afterB = contract(B, returned);
    const freshB = contract(B);
    expect(afterB.locked.length).toBe(freshB.locked.length);
    expect(lockKey(afterB)).toBe(lockKey(freshB));
    expect(maxDiff(afterB, freshB)).toBeLessThan(1e-9);
    // 再回程、再成形 A：与全新 A 逐位相同
    const againA = contract(A, retract(afterB));
    const freshA = contract(A);
    expect(lockKey(againA)).toBe(lockKey(freshA));
    expect(maxDiff(againA, freshA)).toBeLessThan(1e-9);
  });

  it('回程不碰正向协议：retractStep 不推进 step、不新锁键；回程中途装回终态即退出回程', () => {
    const s = contract(A);
    const step = s.step;
    s.retractStep();
    expect(s.step).toBe(step);
    expect(s.retracting).toBe(true);
    const fresh = createSkinUnit(A.spec, A.opts);
    for (let k = 0; k < 300; k++) fresh.retractStep();
    expect(fresh.locked).toHaveLength(0);
    expect(Math.abs(fresh.r - SKIN.R0)).toBeLessThan(1e-12);
    const done = contract(A);
    s.applyTerminalState(done.terminalState());
    expect(s.retracting).toBe(false);
    expect(s.released).toHaveLength(0);
  });
});
