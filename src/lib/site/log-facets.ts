// 纯派生逻辑：不碰 fs、不碰 DOM，服务端与客户端组件都能 import。
// （内容池 src/lib/site/log.ts 会 import node:fs，'use client' 组件不能碰它——
//  多层筛选的桶/方面/月份三级都要在客户端现算，所以派生逻辑下沉到这里。）
import type { LogEntry } from './log';

export type Bilingual = { en: string; zh: string };
/**
 * 一个筛选项：key = 判定用的稳定标识，label = 显示名，count = 该项下的条数。
 * short = 紧凑写法，只有月份用（月份是唯一会无限增长的一级，放在滚轴里，越短越多看见几个）。
 */
export type Facet = { key: string; label: Bilingual; count: number; short?: Bilingual };

/** 没有 neutral 标签的条目落这个方面——保证「各方面之和 = 总览」，不让条目掉出下钻路径。 */
export const OTHER_ASPECT = '~other';
const OTHER_LABEL: Bilingual = { en: 'Other', zh: '其他' };

/** 项目（一级）= outline 标签，MAPPING §8.1 既定约定；每条恰好一个（守门测试保证）。 */
export function bucketOf(entry: LogEntry): string | null {
  return entry.tags.find((t) => t.variant === 'outline')?.label.en ?? null;
}

/** 方面（二级）= neutral 标签；没有就归 Other。 */
export function aspectOf(entry: LogEntry): string {
  return entry.tags.find((t) => t.variant === 'neutral')?.label.en ?? OTHER_ASPECT;
}

/** 月份（三级）= 'YYYY-MM'。 */
export function monthOf(entry: LogEntry): string {
  return entry.date.slice(0, 7);
}

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** 'YYYY-MM' → 'July 2026' / '2026 年 7 月'（不用 Intl：SSR 与客户端 locale 必须一致）。 */
export function monthLabel(key: string): Bilingual {
  const [year, month] = key.split('-');
  const i = Number(month) - 1;
  return { en: `${MONTHS_EN[i]} ${year}`, zh: `${year} 年 ${Number(month)} 月` };
}

/** 短月名，给热力图列标用（'Jul' / '7 月'）。 */
function shortMonthLabel(key: string): Bilingual {
  const month = Number(key.split('-')[1]);
  return { en: MONTHS_EN[month - 1].slice(0, 3), zh: `${month} 月` };
}

/** 月份的紧凑写法，给筛选滚轴用（'Jul 2026' / '2026.07'）。 */
export function monthChip(key: string): Bilingual {
  const [year, month] = key.split('-');
  return { en: `${MONTHS_EN[Number(month) - 1].slice(0, 3)} ${year}`, zh: `${year}.${month}` };
}

function tally(
  entries: LogEntry[],
  keyOf: (e: LogEntry) => string | null,
  labelOf: (e: LogEntry, key: string) => Bilingual,
): Facet[] {
  const byKey = new Map<string, Facet>();
  for (const e of entries) {
    const key = keyOf(e);
    if (key === null) continue;
    const seen = byKey.get(key);
    if (seen) seen.count += 1;
    else byKey.set(key, { key, label: labelOf(e, key), count: 1 });
  }
  return [...byKey.values()];
}

/** 条数多的在前，同数按 key 字典序——顺序必须确定，否则 SSR 首帧与客户端 hydration 对不上。 */
function byCountThenKey(a: Facet, b: Facet): number {
  return b.count - a.count || (a.key < b.key ? -1 : 1);
}

export function projectFacets(entries: LogEntry[]): Facet[] {
  const tag = (e: LogEntry) => e.tags.find((t) => t.variant === 'outline')!.label;
  return tally(entries, bucketOf, (e) => tag(e)).sort(byCountThenKey);
}

/** 方面：同样条数优先，但 Other 恒在最后（它不是一个主题，是「没打主题标签」）。 */
export function aspectFacets(entries: LogEntry[]): Facet[] {
  const labelOf = (e: LogEntry, key: string): Bilingual =>
    key === OTHER_ASPECT
      ? OTHER_LABEL
      : (e.tags.find((t) => t.variant === 'neutral')?.label ?? OTHER_LABEL);
  return tally(entries, aspectOf, labelOf).sort((a, b) => {
    if (a.key === OTHER_ASPECT) return 1;
    if (b.key === OTHER_ASPECT) return -1;
    return byCountThenKey(a, b);
  });
}

/** 月份：按时间倒序，与条目列表同序（最新在前）。 */
export function monthFacets(entries: LogEntry[]): Facet[] {
  return tally(entries, monthOf, (_e, key) => monthLabel(key))
    .map((f) => ({ ...f, short: monthChip(f.key) }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}

/* ── 热力图（GitHub 式：列 = 周，行 = 周日→周六） ─────────────────────────── */

export type HeatDay = { date: string; count: number };
export type Heatmap = {
  /** 每列一周，每周恒 7 格；范围外的补位格为 null（首末周的留白）。 */
  weeks: (HeatDay | null)[][];
  /** 月份列标：index = 周下标（该月第一次出现的那一列）。 */
  months: { index: number; label: Bilingual }[];
  /** 单日最大条数——分级着色的分母。 */
  max: number;
};

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → UTC 毫秒（全程 UTC：本地时区不该改变格子落在星期几）。 */
function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * 值域 = 池内首条到末条（不是「过去一年」——本站日志才几个月，铺满一年会是一片空网格）。
 * 首周补到周日、末周补到周六，保证每列都是 7 格。
 *
 * `range` 单独给：筛选时格子的**深浅**变（只数筛后的条目），**网格本身不缩**——
 * 否则切一次项目整张图就换个宽度，右侧版面跟着跳，也没法横向比较两个项目的活跃期。
 */
export function buildHeatmap(entries: LogEntry[], range: LogEntry[] = entries): Heatmap {
  if (range.length === 0) return { weeks: [], months: [], max: 0 };

  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.date, (counts.get(e.date) ?? 0) + 1);
  const span = range.map((e) => e.date).sort();

  const first = toUtc(span[0]);
  const last = toUtc(span[span.length - 1]);
  const start = first - new Date(first).getUTCDay() * DAY_MS;
  const end = last + (6 - new Date(last).getUTCDay()) * DAY_MS;

  const weeks: (HeatDay | null)[][] = [];
  const months: { index: number; label: Bilingual }[] = [];
  let seenMonth = '';
  for (let ms = start; ms <= end; ms += 7 * DAY_MS) {
    const week: (HeatDay | null)[] = [];
    for (let i = 0; i < 7; i += 1) {
      const at = ms + i * DAY_MS;
      const date = fromUtc(at);
      week.push(at < first || at > last ? null : { date, count: counts.get(date) ?? 0 });
    }
    // 列标记在该月出现的第一列；末列不标，避免标签被截断。
    const month = fromUtc(ms).slice(0, 7);
    if (month !== seenMonth) {
      seenMonth = month;
      months.push({ index: weeks.length, label: shortMonthLabel(month) });
    }
    weeks.push(week);
  }
  if (months.length > 1 && months[months.length - 1].index >= weeks.length - 1) months.pop();

  return { weeks, months, max: Math.max(0, ...counts.values()) };
}

/** 单日条数 → 0–4 级（0 = 无）。分级而非连续：格子太小，连续渐变分辨不出来。 */
export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (max <= 1) return 4;
  const step = Math.ceil((count / max) * 4);
  return Math.min(4, Math.max(1, step)) as 1 | 2 | 3 | 4;
}
