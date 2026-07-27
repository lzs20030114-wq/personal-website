import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getLogEntries } from './log';

/**
 * Work log 内容池的守门测试。zod 已在构建期挡住形状错误，这里守的是
 * schema 挡不住的三件：排序、同日 tie 的稳定性、以及双语是否真的补全
 * （少一种语言 = 切到中文后出现英文孤岛，构建照样通过）。
 */
const RAW: unknown[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'content', 'log', 'entries.json'), 'utf8'),
);

describe('log 内容池', () => {
  it('非空，且条数与源文件一致', () => {
    const entries = getLogEntries();
    expect(entries.length).toBe(RAW.length);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('最新在前', () => {
    const dates = getLogEntries().map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('同日条目保持源文件内顺序（Array.sort 稳定性）', () => {
    const raw = RAW as { date: string; lead: { en: string } }[];
    const byDate = new Map<string, string[]>();
    for (const e of raw) {
      const list = byDate.get(e.date) ?? [];
      list.push(e.lead.en);
      byDate.set(e.date, list);
    }
    const loaded = new Map<string, string[]>();
    for (const e of getLogEntries()) {
      const list = loaded.get(e.date) ?? [];
      list.push(e.lead.en);
      loaded.set(e.date, list);
    }
    for (const [date, leads] of byDate) expect(loaded.get(date)).toEqual(leads);
  });

  it('每条 lead / body / 标签都有中英两份', () => {
    for (const e of getLogEntries()) {
      for (const field of [e.lead, e.body, ...e.tags.map((t) => t.label)]) {
        expect(field.en.trim().length, `${e.date} 缺英文`).toBeGreaterThan(0);
        expect(field.zh.trim().length, `${e.date} 缺中文`).toBeGreaterThan(0);
      }
    }
  });

  it('同一英文标签只对应一个中文译名', () => {
    const dict = new Map<string, string>();
    for (const e of getLogEntries()) {
      for (const t of e.tags) {
        const seen = dict.get(t.label.en);
        if (seen) expect(seen, `标签 ${t.label.en} 译名不一致`).toBe(t.label.zh);
        else dict.set(t.label.en, t.label.zh);
      }
    }
  });
});
