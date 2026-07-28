import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { cache } from 'react';
import { z } from 'zod';

// SITE_SPEC §5 —— 内容池 schema，构建期 fail-fast。
const CreditSchema = z.object({ name: z.string(), role: z.string() }).strict();
const VideoSchema = z
  .object({ src: z.string().min(1), duration: z.number().positive() })
  .strict();
/**
 * 中文侧元数据（2026-07-28 用户拍板：案例页与 log 页一样可切中英，且「以后每个项目的详情页也都这样」）。
 * 只有元数据在这里；中文正文是同目录的 `index.zh.mdx`（无 frontmatter，纯正文）。
 * 中英各自成文、不是互译——与 log 池同一条纪律。
 */
const ZhMetaSchema = z
  .object({
    title: z.string(),
    summary: z.string().max(160),
    role: z.array(z.string()).min(1),
    tools: z.array(z.string()).optional(),
  })
  .strict();

const WorkEntrySchema = z.object({
  title: z.string(),
  slug: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}$/), // 只到月（SITE_SPEC §4：archive 无 last-updated）
  selected: z.boolean(),
  order: z.number().int().positive().optional(),
  summary: z.string().max(160),
  cover: z.string().optional(),
  role: z.array(z.string()).min(1), // 跨校硬要求（ADMISSIONS_RESEARCH §三.1），必填
  credits: z.array(CreditSchema).optional(),
  tools: z.array(z.string()).optional(),
  video: VideoSchema.optional(),
  zh: ZhMetaSchema.optional(), // published 条目必填，见 loadAllWork 的门禁
  status: z.enum(['draft', 'published']),
}).strict();

export type WorkEntry = z.infer<typeof WorkEntrySchema> & {
  body: string;
  /** 中文正文（index.zh.mdx）；draft 条目可以没有 */
  bodyZh?: string;
};

const WORK_DIR = path.join(process.cwd(), 'content', 'work');

const loadAllWork = cache((): WorkEntry[] => {
  const dirs = fs
    .readdirSync(WORK_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());
  const entries = dirs.map((d) => {
    const file = path.join(WORK_DIR, d.name, 'index.mdx');
    const raw = fs.readFileSync(file, 'utf8');
    const { data, content } = matter(raw);
    const parsed = WorkEntrySchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`content/work/${d.name}/index.mdx frontmatter 校验失败：${parsed.error.message}`);
    }
    if (parsed.data.slug !== d.name) {
      throw new Error(`content/work/${d.name}: slug 字段（${parsed.data.slug}）必须与目录名一致`);
    }
    const zhFile = path.join(WORK_DIR, d.name, 'index.zh.mdx');
    const bodyZh = fs.existsSync(zhFile) ? fs.readFileSync(zhFile, 'utf8') : undefined;
    // 双语门禁：case study 页面有语言切换，缺中文侧 = 切过去半页空白。
    // 只卡 published——draft 条目根本不出路由，逼它先写中文没有意义。
    if (parsed.data.status === 'published') {
      if (!parsed.data.zh) {
        throw new Error(`content/work/${d.name}: published 条目必须提供 frontmatter 的 zh 元数据（案例页有中英切换）`);
      }
      if (!bodyZh?.trim()) {
        throw new Error(`content/work/${d.name}: published 条目必须提供 index.zh.mdx 中文正文（案例页有中英切换）`);
      }
    }
    return { ...parsed.data, body: content, bodyZh };
  });

  // SITE_SPEC §5：selected 恒等于 4（四个主项目）——防「第五个项目化」，机器强制。
  const selected = entries.filter((e) => e.selected);
  if (selected.length !== 4) {
    throw new Error(`selected: true 的条目必须恰为 4 个（当前 ${selected.length}）——见 SITE_SPEC §5`);
  }
  const seenOrders = new Map<number, string>();
  for (const entry of entries) {
    if (entry.order === undefined) continue;
    const prior = seenOrders.get(entry.order);
    if (prior) {
      throw new Error(`order: ${entry.order} 同时被 ${prior} 与 ${entry.slug} 使用`);
    }
    seenOrders.set(entry.order, entry.slug);
  }
  return entries.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
});

export function getAllWork(): WorkEntry[] {
  return loadAllWork();
}

export function getSelectedWork(): WorkEntry[] {
  return getAllWork().filter((e) => e.selected);
}

export function getArchiveWork(): WorkEntry[] {
  return getAllWork().filter((e) => !e.selected && e.status === 'published');
}

export function getWorkBySlug(slug: string): WorkEntry | undefined {
  return getAllWork().find((e) => e.slug === slug);
}

export function getPublishedWorkBySlug(slug: string): WorkEntry | undefined {
  return getAllWork().find((e) => e.slug === slug && e.status === 'published');
}
