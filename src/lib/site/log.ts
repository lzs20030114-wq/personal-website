import fs from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import { LogEntriesSchema, sortEntries, type LogEntry } from './log-schema';

/**
 * Work log 内容池（MAPPING §4）——沿用现有池的 zod 构建期 fail-fast 纪律。
 * 数据 = content/log/entries.json：站建设条目源自 Log-Modernist 设计稿，
 * 项目主线条目源自各项目日志原稿（轮回机器_/项目二_/智能床_工作日志原稿.md）的结论式压缩，
 * 2026-07-28 起也可由 /studio 编辑器直接提交（形状仍走同一套 schema + 守门规则）。
 *
 * 形状定义已拆到 ./log-schema（不碰 fs，客户端与 Studio 共用）；
 * 本模块只负责「读文件 + 校验 + 排序」。
 */

/** 类型仍从这里再导出：站内多处 `import type { LogEntry } from '.../log'`，不必跟着改。 */
export type {
  Bilingual,
  LogBlock,
  LogCell,
  LogEntry,
  LogImageBlock,
  LogLang,
  LogTableBlock,
  LogTag,
} from './log-schema';

export const LOG_FILE_REL = 'content/log/entries.json';
const LOG_FILE = path.join(process.cwd(), 'content', 'log', 'entries.json');

const loadLog = cache((): LogEntry[] => {
  const raw = fs.readFileSync(LOG_FILE, 'utf8');
  const parsed = LogEntriesSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`content/log/entries.json 校验失败：${parsed.error.message}`);
  }
  // 最新在前（Log 稿 "newest first"）；同日 ties 保持 JSON 内顺序（Array.sort 稳定）。
  return sortEntries(parsed.data);
});

export function getLogEntries(): LogEntry[] {
  return loadLog();
}

/**
 * 筛选相关的派生（项目桶 / 方面 / 月份 / 热力图）全在 `./log-facets`——那边不碰 fs，
 * 客户端组件可直接 import；本模块因为要读文件，客户端碰不得。
 */
