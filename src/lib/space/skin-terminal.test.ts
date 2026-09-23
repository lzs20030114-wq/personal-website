import { describe, expect, it } from 'vitest';
import { createSkinUnit, type SkinSpec } from './skin-unit';
import { solveSkinTerminal } from './skin-terminal';

const SMALL: SkinSpec = [
  ['g', 3],
  ['f', 8, []],
  ['g', 3],
];

describe('skin terminal snapshots', () => {
  it('后台终态可装回新实例，位置、芯与完成状态逐位一致', () => {
    const result = solveSkinTerminal([{ spec: SMALL, opts: { anchorEnd: true } }]);
    const direct = createSkinUnit(SMALL, { anchorEnd: true });
    while (!direct.done) direct.advance();

    const restored = createSkinUnit(SMALL, { anchorEnd: true });
    restored.applyTerminalState(result.states[0]);
    expect(restored.done).toBe(true);
    expect(restored.step).toBe(direct.step);
    expect(restored.r).toBe(direct.r);
    expect(restored.coreLen).toBe(direct.coreLen);
    expect(restored.coreTop).toBe(direct.coreTop);
    expect(Array.from(restored.px)).toEqual(Array.from(direct.px));
    expect(Array.from(restored.py)).toEqual(Array.from(direct.py));
    expect(restored.locked).toEqual(direct.locked);
  });

  it('错相场景等到最后一条完成，延迟仍按全场 tick 生效', () => {
    const result = solveSkinTerminal([
      { spec: SMALL },
      { spec: SMALL, delay: 37 },
    ]);
    expect(result.tick).toBe(1537);
    expect(result.states.map((state) => state.step)).toEqual([1500, 1500]);
  });
});
