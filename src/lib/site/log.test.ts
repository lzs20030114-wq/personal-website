import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getLogBuckets, getLogEntries, logBucketKey } from './log';

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

  it('每条恰好 1 个 outline（项目桶）+ 至多 1 个 neutral（主题）', () => {
    // MAPPING §8.1 的标签预算：outline = 项目桶，一条只能属于一个项目。
    // 「恰好一个」是项目筛选的前提——没有 outline 的条目会从所有筛选视图里消失，
    // 只在总览态出现；超预算则撑宽 /archive 左栏（版式按 150px 定的）。
    for (const e of getLogEntries()) {
      const outline = e.tags.filter((t) => t.variant === 'outline');
      const neutral = e.tags.filter((t) => t.variant === 'neutral');
      expect(outline.length, `${e.date} 必须恰好一个项目桶（outline）`).toBe(1);
      expect(neutral.length, `${e.date} neutral 标签超预算`).toBeLessThanOrEqual(1);
    }
  });

  it('项目桶：覆盖全池、条数守恒、顺序确定', () => {
    const entries = getLogEntries();
    const buckets = getLogBuckets();
    expect(buckets.length).toBeGreaterThan(1); // 只剩一个桶就没有筛选的意义
    // 各筛选视图之和 = 总览：没有条目掉在筛选之外
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(entries.length);
    for (const b of buckets) {
      const actual = entries.filter((e) => logBucketKey(e) === b.key);
      expect(actual.length, `桶 ${b.key} 计数不符`).toBe(b.count);
    }
    // 条数多的在前，同数按 key 字典序——SSR 首帧与客户端必须排出同一个顺序
    const order = buckets.map((b) => [b.count, b.key] as const);
    const sorted = [...order].sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : 1));
    expect(order).toEqual(sorted);
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
