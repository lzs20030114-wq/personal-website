import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkHoles, lint, mask, parseMdx, rebuild, selectSegments, skipReason, unmask } from './segments.mjs';

const WORK = 'content/work';
const FILES = readdirSync(WORK).flatMap((slug) =>
  ['index.mdx', 'index.zh.mdx'].map((f) => join(WORK, slug, f)).filter((p) => existsSync(p)),
);

describe('copy-gemini 拆段', () => {
  for (const f of FILES) {
    const src = readFileSync(f, 'utf8');
    const p = parseMdx(src);

    it(`${f}：不改动时重建逐字节相同`, () => {
      expect(rebuild(p)).toBe(src);
    });

    it(`${f}：发出去的段里没有结构行`, () => {
      for (const b of selectSegments(p, { headings: true })) {
        const t = b.lines.join('\n').trim();
        expect(t.startsWith('<') || t.startsWith('|') || t.startsWith('{/*') || t.startsWith('---')).toBe(false);
        expect(b.containers).not.toContain('Todo');
        expect(b.containers).not.toContain('ResearchQuestion');
      }
    });

    it(`${f}：每段都改掉时，h2 数与组件行原样`, () => {
      const segs = selectSegments(p, { headings: false });
      const out = rebuild(p, new Map(segs.map((b) => [b.id, 'X'])));
      const h2 = (s) => s.split(/\r?\n/).filter((l) => /^## /.test(l));
      const tags = (s) => s.split(/\r?\n/).filter((l) => /^\s*<\/?[A-Za-z]/.test(l));
      expect(h2(out)).toEqual(h2(src));
      expect(tags(out)).toEqual(tags(src));
    });
  }

  it('CRLF 与 LF 都原样保留', () => {
    const lf = '# T\n\n段落一。\n\n- 条目\n';
    expect(rebuild(parseMdx(lf))).toBe(lf);
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(rebuild(parseMdx(crlf))).toBe(crlf);
    const p = parseMdx(crlf);
    const seg = selectSegments(p)[0];
    expect(rebuild(p, new Map([[seg.id, '新段落。']]))).toBe('# T\r\n\r\n新段落。\r\n\r\n- 条目\r\n');
  });

  it('frontmatter、多行属性的组件、容器里的段落', () => {
    const src = [
      '---',
      'title: x',
      '---',
      '',
      '<Lead>',
      '',
      '开篇一句。',
      '',
      '</Lead>',
      '',
      '<ConceptCard',
      '  title="a > b"',
      '  desc="不改"',
      '/>',
      '',
      '<Todo>',
      '',
      '待补的话。',
      '',
      '</Todo>',
      '',
      '## 参考文献',
      '',
      '- Hall, E. T. (1966).',
      '',
    ].join('\n');
    const p = parseMdx(src);
    const texts = selectSegments(p).map((b) => b.text);
    expect(texts).toEqual(['开篇一句。']);
    const todo = p.blocks.find((b) => b.type === 'text' && b.text === '待补的话。');
    expect(skipReason(todo, p.sections)).toMatch(/Todo/);
    const ref = p.blocks.find((b) => b.type === 'text' && b.kind === 'item');
    expect(skipReason(ref, p.sections)).toMatch(/参考文献/);
  });

  it('--section 只选那几节；标题默认不发', () => {
    const src = '开篇。\n\n## 一\n\n甲。\n\n## 二\n\n乙。\n';
    const p = parseMdx(src);
    expect(selectSegments(p, { sections: new Set([2]) }).map((b) => b.text)).toEqual(['乙。']);
    expect(selectSegments(p).map((b) => b.text)).toEqual(['开篇。', '甲。', '乙。']);
    expect(selectSegments(p, { headings: true }).map((b) => b.text)).toEqual(['开篇。', '一', '甲。', '二', '乙。']);
  });
});

describe('copy-gemini 段内保护', () => {
  const s = '**共温**：见[实验 2-14](/lab#lab2-14-trace)，`x` 与 <Pick en="a" /> 都不动。 [→ 日志 2026-10-07](/archive#log-2026-10-07-3)';

  it('链接、锚点、代码、标签、加粗都换成占位符并能还原', () => {
    const { masked, tokens } = mask(s);
    expect(tokens).toHaveLength(5);
    expect(masked).not.toMatch(/archive|lab#|Pick|\*\*/);
    expect(unmask(masked, tokens)).toBe(s);
  });

  it('占位符丢失、重复、多出都能查出来', () => {
    const { masked, tokens } = mask(s);
    expect(checkHoles(masked, tokens)).toEqual([]);
    expect(checkHoles(masked.replace('⟦1⟧', ''), tokens)).toHaveLength(1);
    expect(checkHoles(masked + '⟦0⟧', tokens)).toHaveLength(1);
    expect(checkHoles(masked + '⟦9⟧', tokens)).toHaveLength(1);
  });

  it('数字变化与写作规则的提醒（链接里的日期不算）', () => {
    expect(lint('三十二个种子里 9.6 次。', '三十二个种子里 9.6 次。', 'zh')).toEqual([]);
    expect(lint('9.6 次。', '10.2 次。', 'zh')[0]).toMatch(/数字/);
    expect(lint('a', '甲；乙', 'zh')).toContain('含分号');
    expect(lint('a', '不是甲而是乙', 'zh')).toContain('含「不是…而是」');
    expect(lint('[→ 日志 2026-10-07](/x)', '见 [→ 日志 2026-10-07](/x)', 'zh')).toEqual([]);
    expect(lint('a', 'x; y', 'en')).toContain('contains a semicolon');
  });
});
