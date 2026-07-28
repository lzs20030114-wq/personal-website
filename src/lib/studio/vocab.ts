import { PROJECT_GROUPS } from '../site/log-facets';
import type { LogEntry, LogTag } from '../site/log-schema';

/**
 * 标签词汇表：编辑器里的项目 / 方面下拉从**池里现有的标签**生成，而不是让作者自由输入。
 * 原因是守门规则（../site/log-guards）要求：同一英文标签只能有一个中文译名，
 * 且项目标签必须登记在 PROJECT_GROUPS 里——下拉选出来的，天然满足这两条。
 * 自定义方面仍然允许（词汇表会长），但要中英一起填，且不能与既有英文名撞成另一个译名。
 */

export type TagOption = { en: string; zh: string; count: number };

/** 英文标签 → 中文译名（先出现的为准；池已由守门测试保证一致）。 */
export function tagDictionary(entries: LogEntry[]): Map<string, string> {
  const dict = new Map<string, string>();
  for (const e of entries) {
    for (const t of e.tags) if (!dict.has(t.label.en)) dict.set(t.label.en, t.label.zh);
  }
  return dict;
}

function countBy(entries: LogEntry[], variant: LogTag['variant']): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of entries) {
    for (const t of e.tags) {
      if (t.variant !== variant) continue;
      counts.set(t.label.en, (counts.get(t.label.en) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * 项目标签（outline）：**只**列 PROJECT_GROUPS 登记过的，顺序按登记顺序（= 作品集编号）。
 * 中文名取池里的用法；池里还没用过的桶（新登记但没条目）用英文名兜底。
 * `project` = 该桶归属的项目名，下拉里显示出来——「Lab 属于项目一」这件事不写出来没人知道。
 */
export function bucketOptions(entries: LogEntry[]): (TagOption & { project: string })[] {
  const dict = tagDictionary(entries);
  const counts = countBy(entries, 'outline');
  return PROJECT_GROUPS.flatMap((g) =>
    g.buckets.map((en) => ({
      en,
      zh: dict.get(en) ?? en,
      count: counts.get(en) ?? 0,
      project: g.label.zh,
    })),
  );
}

/** 方面标签（neutral）：池里用过的，常用的在前。 */
export function aspectOptions(entries: LogEntry[]): TagOption[] {
  const dict = tagDictionary(entries);
  const counts = countBy(entries, 'neutral');
  return [...counts.entries()]
    .map(([en, count]) => ({ en, zh: dict.get(en) ?? en, count }))
    .sort((a, b) => b.count - a.count || (a.en < b.en ? -1 : 1));
}
