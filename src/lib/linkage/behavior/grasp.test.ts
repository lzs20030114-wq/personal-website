import { describe, expect, it } from 'vitest';
import { emptySearches, graspVerdict, lostReaction } from './grasp';
import { makeRng } from './rng';

describe('抓握真值表 T-0707-1', () => {
  it('张力 ✓ 电极 ✓ = 握人；张力 ✓ 电极 ✗ = 握物；到限位仍无张力 = 抓空；途中无张力 = 继续缠', () => {
    expect(graspVerdict({ tension: true, electrode: true, atLimit: false })).toBe('HOLD_HUMAN');
    expect(graspVerdict({ tension: true, electrode: false, atLimit: false })).toBe('HOLD_OBJECT');
    expect(graspVerdict({ tension: false, electrode: false, atLimit: true })).toBe('EMPTY');
    expect(graspVerdict({ tension: false, electrode: false, atLimit: false })).toBeNull();
    // 到限位时张力才到：仍算抓住（顺序无关）
    expect(graspVerdict({ tension: true, electrode: true, atLimit: true })).toBe('HOLD_HUMAN');
  });

  it('表外一格：手碰着臂但没被缠住（到限位、无张力、电极 ✓）按抓空处理', () => {
    expect(graspVerdict({ tension: false, electrode: true, atLimit: true })).toBe('EMPTY');
  });

  it('脱手：活力 / 好奇追，沉静放弃，不稳定两种都有', () => {
    const r = makeRng(5);
    expect(lostReaction('A', r)).toBe('chase');
    expect(lostReaction('C', r)).toBe('chase');
    expect(lostReaction('B', r)).toBe('giveUp');
    const seen = new Set(Array.from({ length: 40 }, () => lostReaction('D', r)));
    expect(seen).toEqual(new Set(['chase', 'giveUp']));
  });

  it('抓空后搜寻：好奇 2、活力 1、沉静 0、不稳定 0–2', () => {
    const r = makeRng(6);
    expect([emptySearches('A', r), emptySearches('B', r), emptySearches('C', r)]).toEqual([1, 0, 2]);
    const d = new Set(Array.from({ length: 60 }, () => emptySearches('D', r)));
    expect(d).toEqual(new Set([0, 1, 2]));
  });
});
