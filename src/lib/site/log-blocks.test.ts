import { describe, expect, it } from 'vitest';
import { getLogEntries } from './log';
import { blockCounts, blockRefs, countsLabel } from './log-blocks';
import type { LogBlock } from './log-schema';

/**
 * 附件（图 / 表）索引的守门测试。条目行的角标与展开后右栏的清单是同一份计数——
 * 这里守的是「角标说有 3 张、点开只列出 2 张」这类对不上的事故，以及编号规则本身。
 */

const img = (n: number): LogBlock => ({
  kind: 'image',
  src: `/log/x${n}.webp`,
  alt: { en: `alt ${n}`, zh: `替代 ${n}` },
  width: 800,
  height: 600,
});
const tab = (cols: number, rows: number): LogBlock => ({
  kind: 'table',
  head: Array.from({ length: cols }, (_, i) => `H${i}`),
  rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => 'v')),
});

describe('附件索引', () => {
  it('编号按类各自数，不按数组下标', () => {
    // 中间插一张图不该把后面所有表的编号推一位
    const refs = blockRefs([tab(2, 3), img(1), tab(2, 3)]);
    expect(refs.map((r) => r.label.en)).toEqual(['Tab. 01', 'Fig. 01', 'Tab. 02']);
    expect(refs.map((r) => r.label.zh)).toEqual(['表 01', '图 01', '表 02']);
    // index 恒为数组下标（开合状态用它当键，编号不能拿来顶替）
    expect(refs.map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it('规格：图 = 像素尺寸，表 = 列 × 行（行不含表头）', () => {
    expect(blockRefs([img(1)])[0].meta).toBe('800 × 600');
    expect(blockRefs([tab(4, 7)])[0].meta).toBe('4 × 7');
  });

  it('计数与角标读法（英文单复数）', () => {
    expect(blockCounts([])).toEqual({ images: 0, tables: 0, total: 0 });
    expect(blockCounts(undefined)).toEqual({ images: 0, tables: 0, total: 0 });
    expect(blockCounts([img(1), tab(2, 2), tab(2, 2)])).toEqual({
      images: 1,
      tables: 2,
      total: 3,
    });
    expect(countsLabel(blockCounts([img(1)]))).toEqual({ en: '1 figure', zh: '1 图' });
    expect(countsLabel(blockCounts([tab(2, 2), tab(2, 2)]))).toEqual({
      en: '2 tables',
      zh: '2 表',
    });
    expect(countsLabel(blockCounts([img(1), tab(2, 2)])).en).toBe('1 figure · 1 table');
  });

  it('池内每条：角标计数 = 右栏清单条数，且每张都有编号与规格', () => {
    for (const e of getLogEntries()) {
      const refs = blockRefs(e.blocks);
      expect(refs.length, `${e.date}`).toBe(blockCounts(e.blocks).total);
      for (const r of refs) {
        expect(r.label.en.length, `${e.date} ${r.index}`).toBeGreaterThan(0);
        expect(r.label.zh.length, `${e.date} ${r.index}`).toBeGreaterThan(0);
        expect(r.meta, `${e.date} ${r.index}`).toMatch(/^\d+ × \d+$/);
      }
    }
  });
});
