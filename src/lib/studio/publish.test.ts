import { describe, expect, it } from 'vitest';
import { getLogEntries } from '../site/log';
import type { LogEntry } from '../site/log-schema';
import { serializeEntries } from '../site/log-schema';
import { buildCommitFiles, imageFileName, LOG_JSON_PATH, validateEntries } from './publish';

/**
 * 发布前校验是「网页上写日志不会把线上构建搞挂」的那道闸门——
 * 这里要证明它真的会拦下会让构建失败的东西，且不会拦下合法的东西。
 */

function entry(over: Partial<LogEntry> = {}): LogEntry {
  return {
    date: '2026-07-28',
    lead: { en: 'A lead.', zh: '一句概括。' },
    body: { en: 'Body.', zh: '正文。' },
    tags: [{ label: { en: 'Machine', zh: '机器' }, variant: 'outline' }],
    ...over,
  };
}

const PNG = 'iVBORw0KGgo=';

describe('图片文件名', () => {
  it('日期 + 原名 slug + 扩展名', () => {
    expect(imageFileName('2026-07-28', 'Ring Sweep.PNG', 'webp')).toBe('2026-07-28-ring-sweep.webp');
  });

  it('撞名自动加序号', () => {
    const taken = ['2026-07-28-a.webp', '2026-07-28-a-2.webp'];
    expect(imageFileName('2026-07-28', 'a.png', 'webp', taken)).toBe('2026-07-28-a-3.webp');
  });

  it('全中文文件名退回 image（文件名只走 ASCII，避免仓库里出现编码问题）', () => {
    expect(imageFileName('2026-07-28', '五环扫掠.png', 'webp')).toBe('2026-07-28-image.webp');
  });
});

describe('发布前校验', () => {
  it('池现状通过（与构建期同一套规则）', () => {
    const res = validateEntries(getLogEntries());
    expect(res.ok).toBe(true);
  });

  it('缺一种语言 = 拦下，且报错点到具体条目与栏位', () => {
    const res = validateEntries([entry({ body: { en: 'Body.', zh: '' } })]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.join()).toContain('2026-07-28');
      expect(res.errors.join()).toContain('正文');
    }
  });

  it('未登记的项目标签被拦下（否则条目会从所有筛选视图里消失）', () => {
    const res = validateEntries([
      entry({ tags: [{ label: { en: 'Nonesuch', zh: '不存在' }, variant: 'outline' }] }),
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toContain('PROJECT_GROUPS');
  });

  it('没有项目标签 / 两个项目标签都被拦下', () => {
    expect(validateEntries([entry({ tags: [] })].map((e) => e)).ok).toBe(false);
    expect(
      validateEntries([
        entry({
          tags: [
            { label: { en: 'Machine', zh: '机器' }, variant: 'outline' },
            { label: { en: 'Space', zh: '空间' }, variant: 'outline' },
          ],
        }),
      ]).ok,
    ).toBe(false);
  });

  it('同日同引句的重复条目被拦下', () => {
    expect(validateEntries([entry(), entry()]).ok).toBe(false);
  });

  it('不存在的日期被拦下', () => {
    expect(validateEntries([entry({ date: '2026-02-30' })]).ok).toBe(false);
  });

  it('空池被拦下（发布空池等于把 /archive 清空）', () => {
    expect(validateEntries([]).ok).toBe(false);
  });

  it('表格行列数不齐被拦下', () => {
    const res = validateEntries([
      entry({
        blocks: [{ kind: 'table', head: ['A', 'B'], rows: [['1']] }],
      }),
    ]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join()).toContain('表头');
  });

  it('图片 src 只接受 /log/ 下的文件（挡掉外链与 javascript:）', () => {
    for (const src of ['https://example.com/a.png', 'javascript:alert(1)', '/etc/passwd']) {
      const res = validateEntries([
        entry({
          blocks: [{ kind: 'image', src, alt: { en: 'a', zh: '甲' }, width: 10, height: 10 }],
        }),
      ]);
      expect(res.ok, src).toBe(false);
    }
  });
});

describe('提交文件清单', () => {
  it('总是写 entries.json，内容 = 内容池的落盘格式', () => {
    const entries = [entry()];
    const out = buildCommitFiles({ entries });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.files).toHaveLength(1);
      expect(out.files[0]).toEqual({
        path: LOG_JSON_PATH,
        content: serializeEntries(entries),
        encoding: 'utf-8',
      });
    }
  });

  it('被引用的新图一同提交，没被引用的不提交（加了图块又删掉不留垃圾）', () => {
    const out = buildCommitFiles({
      entries: [
        entry({
          blocks: [
            {
              kind: 'image',
              src: '/log/2026-07-28-a.png',
              alt: { en: 'a', zh: '甲' },
              width: 8,
              height: 8,
            },
          ],
        }),
      ],
      images: [
        { name: '2026-07-28-a.png', dataBase64: PNG },
        { name: '2026-07-28-unused.png', dataBase64: PNG },
      ],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.files.map((f) => f.path)).toEqual([LOG_JSON_PATH, 'public/log/2026-07-28-a.png']);
      expect(out.unusedImages).toEqual(['2026-07-28-unused.png']);
    }
  });

  it('引用了一张两边都没有的图 = 拦下（否则线上是个裂图，构建还照样通过）', () => {
    const out = buildCommitFiles({
      entries: [
        entry({
          blocks: [
            {
              kind: 'image',
              src: '/log/missing.png',
              alt: { en: 'a', zh: '甲' },
              width: 8,
              height: 8,
            },
          ],
        }),
      ],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.errors.join()).toContain('missing.png');
  });

  it('仓库里已有的图不必重传', () => {
    const out = buildCommitFiles({
      entries: [
        entry({
          blocks: [
            {
              kind: 'image',
              src: '/log/old.png',
              alt: { en: 'a', zh: '甲' },
              width: 8,
              height: 8,
            },
          ],
        }),
      ],
      existingImages: ['old.png'],
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.files).toHaveLength(1);
  });

  it('文件名或内容不合法的图被拦下', () => {
    const bad = buildCommitFiles({
      entries: [entry()],
      images: [{ name: '../../evil.png', dataBase64: PNG }],
    });
    expect(bad.ok).toBe(false);
    const dirty = buildCommitFiles({
      entries: [entry()],
      images: [{ name: 'a.png', dataBase64: 'not base64!!' }],
    });
    expect(dirty.ok).toBe(false);
  });

  it('落盘内容按日期倒序排好（编辑器里的顺序不影响文件）', () => {
    const out = buildCommitFiles({
      entries: [
        entry({ date: '2026-01-01', lead: { en: 'old', zh: '旧' } }),
        entry({ date: '2026-07-01', lead: { en: 'new', zh: '新' } }),
      ],
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.entries.map((e) => e.date)).toEqual(['2026-07-01', '2026-01-01']);
      expect(out.files[0].content.indexOf('2026-07-01')).toBeLessThan(
        out.files[0].content.indexOf('2026-01-01'),
      );
    }
  });
});
