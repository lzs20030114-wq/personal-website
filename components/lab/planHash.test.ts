import { describe, expect, it } from 'vitest';
import { legacyLabNo, normalizedLabHash } from './planHash';

describe('插入多层台后的 Lab 深链', () => {
  it('旧两位编号仍指向原台架，方形环及后续顺延', () => {
    expect(legacyLabNo('10')).toBe('2-5');
    expect(normalizedLabHash('#lab11-split')).toBe('#lab2-7-split');
    expect(normalizedLabHash('#lab15')).toBe('#lab2-11');
    expect(normalizedLabHash('#lab05')).toBe('#lab1-5');
  });
  it('组合预设旧链接顺延，猫预设保留', () => {
    expect(normalizedLabHash('#lab2-12-enclose')).toBe('#lab2-13-enclose');
    expect(normalizedLabHash('#lab2-12-ramp3')).toBe('#lab2-13-ramp3');
    expect(normalizedLabHash('#lab2-12-play')).toBe('#lab2-12-play');
  });
  it('新的项目编号与非台架哈希不改写', () => {
    for (const h of ['#lab2-6-join', '#lab2-5-double', '#lab2-12-play', '#lab2-13-enclose', '#about']) expect(normalizedLabHash(h)).toBe(h);
  });
});
