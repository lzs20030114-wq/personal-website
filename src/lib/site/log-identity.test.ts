import { describe, expect, it, vi } from 'vitest';
import { createLogEntryId, ensureLogEntryIds, restoreLogEntryIds } from './log-identity';
import { withAnchors, parseAnchor } from './log-facets';
import { LogEntriesSchema, sortEntries, type LogEntry } from './log-schema';
import { checkLogEntries } from './log-guards';

const entry = (name: string, date = '2026-07-27'): LogEntry => ({
  date,
  lead: { en: name, zh: `${name} 引句` },
  body: { en: `- ${name} details`, zh: `- ${name} 正文` },
  tags: [{ variant: 'outline', label: { en: 'Space', zh: '空间' } }],
});

describe('日志永久身份与旧格式迁移', () => {
  it('完整旧池迁移保留原公开地址与内容、顺序，再次读取不改变身份', () => {
    const legacy = [entry('first'), entry('second'), entry('earlier', '2026-07-26')];
    const migrated = ensureLogEntryIds(legacy);
    expect(migrated.map((e) => e.id)).toEqual(['log-2026-07-27-1', 'log-2026-07-27-2', 'log-2026-07-26-1']);
    expect(migrated.map(({ id: _id, ...rest }) => rest)).toEqual(legacy);
    expect(ensureLogEntryIds(migrated)).toEqual(migrated);
    expect(LogEntriesSchema.safeParse(legacy).success).toBe(true);
    expect(LogEntriesSchema.safeParse(migrated).success).toBe(true);
  });

  it('删除前序条目、改日期和插入同日日志后，存活记录仍保留原链接', () => {
    const baseline = ensureLogEntryIds([entry('first'), entry('second'), entry('third')]);
    const edited = sortEntries([
      { ...entry('new'), id: createLogEntryId('2026-07-27', baseline.map((e) => e.id)) },
      { ...baseline[1], date: '2026-08-01' },
      baseline[2],
    ]);
    const links = new Map(withAnchors(edited).map(({ entry: e, anchor }) => [anchor, e.lead.en]));
    expect(links.get('log-2026-07-27-2')).toBe('second');
    expect(links.get('log-2026-07-27-3')).toBe('third');
    expect(links.has('log-2026-07-27-1')).toBe(false);
    expect(checkLogEntries(edited)).toEqual([]);
  });

  it('旧草稿的日期、正文编辑不靠数组位置认身份，新插入不会抢占旧地址', () => {
    const baseline = ensureLogEntryIds([entry('first'), entry('second'), entry('third')]);
    const legacyDraft = [
      entry('new'),
      { ...entry('second', '2026-08-01'), body: { en: '- revised', zh: '- 改过的正文' } },
      { ...entry('third'), lead: { en: 'new lead', zh: '新引句' } },
      entry('first'),
    ];
    const restored = restoreLogEntryIds(legacyDraft, baseline);
    expect(restored[1].id).toBe(baseline[1].id);
    expect(restored[2].id).toBe(baseline[2].id);
    expect(baseline.map((e) => e.id)).not.toContain(restored[0].id);
    expect(parseAnchor(restored[0].id)?.seq).toBeGreaterThanOrEqual(1_000_000_000);
    expect(restored.map(({ id: _id, ...rest }) => rest)).toEqual(legacyDraft);
  });

  it('无id草稿完全改写旧条目或同时删除并新增时无法识别，保留草稿而不分配新身份', () => {
    const baseline = ensureLogEntryIds([entry('first'), entry('second')]);
    const rewritten = [entry('rewritten'), entry('second')];
    const before = JSON.stringify(rewritten);
    expect(() => restoreLogEntryIds(rewritten, baseline)).toThrow('无法区分新增、删除与重写');
    expect(JSON.stringify(rewritten)).toBe(before);
    // 仅删除仍能确定所有存活条目的身份，不阻断这种旧格式恢复。
    expect(restoreLogEntryIds([entry('second')], baseline).map((e) => e.id)).toEqual([baseline[1].id]);
  });

  it('旧池未写入id时也可恢复旧草稿，已带id的草稿不因内容改写重新分配', () => {
    const legacy = [entry('first'), entry('second')];
    expect(restoreLogEntryIds([legacy[1]], legacy)[0].id).toBe('log-2026-07-27-2');
    const migrated = ensureLogEntryIds(legacy);
    const edited = { ...entry('rewritten', '2026-09-01'), id: migrated[1].id };
    expect(restoreLogEntryIds([edited], migrated)).toEqual([edited]);
  });

  it('有歧义或重复认领时拒绝恢复且不修改草稿', () => {
    const baseline = ensureLogEntryIds([entry('shared', '2026-07-01'), entry('shared', '2026-07-02')]);
    const draft = [entry('shared', '2026-08-01')];
    const before = JSON.stringify(draft);
    expect(() => restoreLogEntryIds(draft, baseline)).toThrow('无法唯一对应');
    expect(JSON.stringify(draft)).toBe(before);
    expect(() => restoreLogEntryIds([baseline[0], baseline[0]], baseline)).toThrow('身份');
    expect(checkLogEntries([baseline[0], { ...entry('other'), id: baseline[0].id }]).some((i) => i.message.includes('身份'))).toBe(true);
  });

  it('随机身份碰撞会重试，且生成的链接可被现有页面解析', () => {
    const random = vi.spyOn(globalThis.crypto, 'getRandomValues');
    random.mockImplementationOnce((words) => { (words as Uint32Array).set([0, 0]); return words; });
    random.mockImplementationOnce((words) => { (words as Uint32Array).set([0, 1]); return words; });
    try {
      const id = createLogEntryId('2026-10-23', ['log-2026-10-23-1000000000']);
      expect(id).toBe('log-2026-10-23-1000000001');
      expect(parseAnchor(id)).toEqual({ date: '2026-10-23', seq: 1_000_000_001 });
    } finally {
      random.mockRestore();
    }
  });
});
