import fs from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import { z } from 'zod';

/**
 * Work log 内容池（MAPPING §4）——沿用现有池的 zod 构建期 fail-fast 纪律；
 * 纯 log 条目形状与 WorkEntry 不同，故扩独立 schema（不绕过校验管线）。
 * 数据 = content/log/entries.json，条目文案照搬 Log-Modernist 设计稿。
 */
const LogTagSchema = z
  .object({
    label: z.string().min(1),
    variant: z.enum(['outline', 'neutral']),
  })
  .strict();

const LogEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Log 页显示 MM-DD，首页预览用整日期
    lead: z.string().min(1), // 加粗引句
    body: z.string().min(1), // 引句之后的正文
    tags: z.array(LogTagSchema),
  })
  .strict();

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
