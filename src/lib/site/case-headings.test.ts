import { describe, expect, it } from 'vitest';
import { chapterNo, extractChapterTitles } from './case-headings';
import { getAllWork } from './content';

describe('extractChapterTitles', () => {
  it('只抽行首的 ## 标题，不抽 ###', () => {
    expect(extractChapterTitles('a\n## One\ntext\n### Sub\n## Two  \n')).toEqual(['One', 'Two']);
  });

  it('跳过围栏代码块与 MDX 注释里的 ##', () => {
    const src = '```\n## not\n```\n{/* a\n## also not\n*/}\n## yes\n{/* one-line ## no */}\n';
    expect(extractChapterTitles(src)).toEqual(['yes']);
  });

  it('行内的 ## 不算（必须在行首）', () => {
    expect(extractChapterTitles('x ## y')).toEqual([]);
  });

  it('编号补零', () => {
    expect(chapterNo(0)).toBe('00');
    expect(chapterNo(10)).toBe('10');
  });

  // 目录用下标把「标题表」对上页面里的 h2 元素——两侧必须一样多，否则切语言目录会错位
  for (const w of getAllWork().filter((e) => e.status === 'published')) {
    it(`${w.slug}：中英两侧章节标题数一致`, () => {
      expect(extractChapterTitles(w.bodyZh ?? '')).toHaveLength(extractChapterTitles(w.body).length);
    });
  }

  it('项目 01：十章（01–10），与稿的目录 00–10 十一项对得上', () => {
    const w = getAllWork().find((e) => e.slug === 'reincarnation-machine')!;
    expect(extractChapterTitles(w.body)).toHaveLength(10);
  });
});
