import { describe, expect, it } from 'vitest';
import { getLogEntries } from './log';
import { parseInline, parseMarkdown } from './md';

describe('受限 Markdown', () => {
  it('纯文字 = 一个段落，逐字不变', () => {
    expect(parseMarkdown('就是一句话。')).toEqual([
      { t: 'p', spans: [{ t: 'text', v: '就是一句话。' }] },
    ]);
  });

  it('池内条目正文全部分条（写作纪律 2026-07-31：分条列表，不堆成段）', () => {
    // 旧版本此处断言「正文是无记号的纯段落」——那是 07-28 引入解析器时的兼容性快照。
    // 2026-07-31 全池按新纪律重写成分条列表后，守的东西反过来：不许再出现成段散文。
    // 同一条规则也在 log-guards 里（studio 发布前与构建期同一份），这里从解析层再卡一道。
    for (const e of getLogEntries()) {
      for (const text of [e.body.en, e.body.zh]) {
        const blocks = parseMarkdown(text);
        expect(blocks.length, `${e.date} 正文为空`).toBeGreaterThan(0);
        expect(
          blocks.some((b) => b.t === 'p'),
          `${e.date} 正文有成段散文`,
        ).toBe(false);
        expect(
          blocks.some((b) => b.t === 'list'),
          `${e.date} 正文没有分条列表`,
        ).toBe(true);
      }
    }
  });

  it('段落内的换行留在文本里（渲染靠 white-space: pre-line）', () => {
    expect(parseMarkdown('一\n二')).toEqual([{ t: 'p', spans: [{ t: 'text', v: '一\n二' }] }]);
    // 空行才分段
    expect(parseMarkdown('一\n\n二')).toHaveLength(2);
  });

  it('小标题：1–3 个 # 当三级，4 个及以上当四级', () => {
    expect(parseMarkdown('# 标题')).toEqual([{ t: 'h', level: 3, spans: [{ t: 'text', v: '标题' }] }]);
    expect(parseMarkdown('#### 小标题')[0]).toMatchObject({ t: 'h', level: 4 });
    // 没有空格的 # 不是标题（比如 #1 这种编号）
    expect(parseMarkdown('#1 号件')[0]).toMatchObject({ t: 'p' });
  });

  it('列表：连续行归成一个列表，无序与有序不混', () => {
    expect(parseMarkdown('- 甲\n- 乙')).toEqual([
      {
        t: 'list',
        ordered: false,
        items: [[{ t: 'text', v: '甲' }], [{ t: 'text', v: '乙' }]],
      },
    ]);
    const mixed = parseMarkdown('- 甲\n1. 乙');
    expect(mixed).toHaveLength(2);
    expect(mixed[0]).toMatchObject({ ordered: false });
    expect(mixed[1]).toMatchObject({ ordered: true });
  });

  it('代码块内容逐字保留，里面的记号不当记号', () => {
    expect(parseMarkdown('```\n- 不是列表\n### 不是标题\n```')).toEqual([
      { t: 'pre', code: '- 不是列表\n### 不是标题' },
    ]);
  });

  it('没有闭合围栏时把剩下的都当代码（不崩、不吞内容）', () => {
    expect(parseMarkdown('```\nabc')).toEqual([{ t: 'pre', code: 'abc' }]);
  });

  it('行内：加粗 / 代码 / 链接', () => {
    expect(parseInline('前 **粗** 中 `码` 后 [站](/archive)')).toEqual([
      { t: 'text', v: '前 ' },
      { t: 'strong', v: '粗' },
      { t: 'text', v: ' 中 ' },
      { t: 'code', v: '码' },
      { t: 'text', v: ' 后 ' },
      { t: 'link', v: '站', href: '/archive' },
    ]);
  });

  it('不安全的链接降级成原文（javascript: 不会变成可点链接）', () => {
    expect(parseInline('[点我](javascript:alert(1))')).toEqual([
      { t: 'text', v: '[点我](javascript:alert(1))' },
    ]);
    // 协议相对 URL（//evil.com）同样不放行
    expect(parseInline('[x](//evil.com)')).toEqual([{ t: 'text', v: '[x](//evil.com)' }]);
  });

  it('未闭合的记号当普通文字，不吃掉后面的内容', () => {
    expect(parseInline('**没关掉')).toEqual([{ t: 'text', v: '**没关掉' }]);
    expect(parseInline('反引号 ` 一个')).toEqual([{ t: 'text', v: '反引号 ` 一个' }]);
  });
});
