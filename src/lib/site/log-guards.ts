import type { LogEntry } from './log-schema';
import { PROJECT_GROUPS } from './log-facets';

/**
 * 内容池的守门规则——**zod 挡不住、但会让站点变坏的那些事**。
 * 纯函数、不碰 fs：
 *   ① 构建期 `src/lib/site/log.test.ts` 跑它（历史遗留条目也一并守住）；
 *   ② Studio 在浏览器里发布前跑同一份（发布不通过 = 根本不提交）。
 *
 * 这一份存在的意义就是「不可能因为在网页上写日志而把线上构建搞挂」：
 * 任何在这里报错的条目，都是提交后 `npm run build` 必然失败的条目。
 */

export type GuardIssue = {
  /** 出问题的条目下标（-1 = 整池级问题），便于编辑器直接把光标带到那条 */
  index: number;
  message: string;
};

const REGISTERED_BUCKETS = new Set(PROJECT_GROUPS.flatMap((g) => g.buckets));

/** 日历意义上的合法日期（正则挡不住 2026-13-45）。 */
function isRealDate(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}

export function checkLogEntries(entries: LogEntry[]): GuardIssue[] {
  const issues: GuardIssue[] = [];
  const seenEntry = new Set<string>();
  const tagDict = new Map<string, string>();

  entries.forEach((e, index) => {
    const at = (message: string) => issues.push({ index, message });

    if (!isRealDate(e.date)) at(`日期 ${e.date} 不是真实存在的日期`);

    // 标签预算（MAPPING §8.1）：outline = 项目桶，一条只属于一个项目；
    // neutral = 方面，至多一个（左栏按 150px 排版，超预算会把版式撑破）。
    const outline = e.tags.filter((t) => t.variant === 'outline');
    const neutral = e.tags.filter((t) => t.variant === 'neutral');
    if (outline.length !== 1) at(`必须恰好一个项目标签（outline），现在有 ${outline.length} 个`);
    if (neutral.length > 1) at(`方面标签（neutral）至多一个，现在有 ${neutral.length} 个`);

    // 未登记的 outline 标签 = 该条目从**所有**项目筛选视图里消失（只在总览态出现）。
    for (const t of outline) {
      if (!REGISTERED_BUCKETS.has(t.label.en)) {
        at(`项目标签「${t.label.en}」没有登记在 PROJECT_GROUPS 里，条目会从筛选中消失`);
      }
    }

    // 同一英文标签只能有一个中文译名，否则筛选项会分裂成两个同名桶。
    for (const t of e.tags) {
      const seen = tagDict.get(t.label.en);
      if (seen !== undefined && seen !== t.label.zh) {
        at(`标签 ${t.label.en} 的中文译名与别处不一致（「${seen}」vs「${t.label.zh}」）`);
      } else if (seen === undefined) {
        tagDict.set(t.label.en, t.label.zh);
      }
    }

    // 三份日志原稿汇一池，重复并入是最可能的事故——形状完全合法、日期也对。
    const key = `${e.date}｜${e.lead.en.trim().toLowerCase()}`;
    if (seenEntry.has(key)) at('与另一条同日同引句（重复条目）');
    seenEntry.add(key);

    // 表格：每行列数必须与表头一致，否则渲染出来是错位的网格。
    (e.blocks ?? []).forEach((b, bi) => {
      if (b.kind !== 'table') return;
      b.rows.forEach((row, ri) => {
        if (row.length !== b.head.length) {
          at(`第 ${bi + 1} 个块（表格）第 ${ri + 1} 行有 ${row.length} 格，表头是 ${b.head.length} 格`);
        }
      });
    });
  });

  return issues;
}
