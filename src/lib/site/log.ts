import fs from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import { z } from 'zod';

/**
 * Work log 内容池（MAPPING §4）——沿用现有池的 zod 构建期 fail-fast 纪律；
 * 纯 log 条目形状与 WorkEntry 不同，故扩独立 schema（不绕过校验管线）。
 * 数据 = content/log/entries.json：站建设条目源自 Log-Modernist 设计稿，
 * 项目主线条目源自各项目日志原稿（轮回机器_/项目二_工作日志原稿.md）的结论式压缩。
 */
/** 双语文本：两种语言都必填——缺一种就等于切换后半页空白，构建期即报错。 */
const BilingualSchema = z
  .object({
    en: z.string().min(1),
    zh: z.string().min(1),
  })
  .strict();

const LogTagSchema = z
  .object({
    label: BilingualSchema, // 标签同样双语——切中文后不留英文孤岛
    variant: z.enum(['outline', 'neutral']),
  })
  .strict();

const LogEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Log 页显示 MM-DD，首页预览用整日期
    lead: BilingualSchema, // 加粗引句
    body: BilingualSchema, // 引句之后的正文
    tags: z.array(LogTagSchema),
  })
  .strict();

/** Log 页语言切换的两个取值；也是 LogEntry.lead/body 的键。 */
export type LogLang = 'en' | 'zh';
export type LogTag = z.infer<typeof LogTagSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;

const LOG_FILE = path.join(process.cwd(), 'content', 'log', 'entries.json');

const loadLog = cache((): LogEntry[] => {
  const raw = fs.readFileSync(LOG_FILE, 'utf8');
  const parsed = z.array(LogEntrySchema).safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`content/log/entries.json 校验失败：${parsed.error.message}`);
  }
  // 最新在前（Log 稿 "newest first"）；同日 ties 保持 JSON 内顺序（Array.sort 稳定）。
  return [...parsed.data].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
});

export function getLogEntries(): LogEntry[] {
  return loadLog();
}

/**
 * 项目筛选桶（用户拍板 2026-07-27）。多项目共池后，读者要能只看某一个项目。
 * 不新开字段——沿用 MAPPING §8.1 既定约定：**outline 标签就是项目桶**
 * （Machine 机器 / Space 空间 / Lab 实验室 / Site 网站），每条恰好一个（守门测试保证）。
 */
export type LogBucket = { key: string; label: { en: string; zh: string }; count: number };

/** 条目所属项目桶的 key = outline 标签的英文名。客户端同款判定见 LogList（那边不能 import 本模块）。 */
export function logBucketKey(entry: LogEntry): string | null {
  return entry.tags.find((t) => t.variant === 'outline')?.label.en ?? null;
}

/** 池内出现过的项目桶，条数多的在前（同数按 key 字典序——SSR 与客户端必须排出同一顺序）。 */
export function getLogBuckets(): LogBucket[] {
  const byKey = new Map<string, LogBucket>();
  for (const e of getLogEntries()) {
    const tag = e.tags.find((t) => t.variant === 'outline');
    if (!tag) continue;
    const seen = byKey.get(tag.label.en);
    if (seen) seen.count += 1;
    else byKey.set(tag.label.en, { key: tag.label.en, label: tag.label, count: 1 });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1));
}
