import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';

// SITE_SPEC §5 —— 内容池 schema，构建期 fail-fast。
const WorkEntrySchema = z.object({
  title: z.string(),
  slug: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}$/), // 只到月（SITE_SPEC §4：archive 无 last-updated）
  selected: z.boolean(),
  order: z.number().optional(),
  summary: z.string().max(160),
  cover: z.string().optional(),
  role: z.array(z.string()).min(1), // 跨校硬要求（ADMISSIONS_RESEARCH §三.1），必填
  credits: z.array(z.object({ name: z.string(), role: z.string() })).optional(),
  tools: z.array(z.string()).optional(),
  video: z.object({ src: z.string(), duration: z.number() }).optional(),
  status: z.enum(['draft', 'published']),
});

export type WorkEntry = z.infer<typeof WorkEntrySchema> & { body: string };

const WORK_DIR = path.join(process.cwd(), 'content', 'work');

export function getAllWork(): WorkEntry[] {
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
    return { ...parsed.data, body: content };
  });

  // SITE_SPEC §5：selected 恒等于 4（四个主项目）——防「第五个项目化」，机器强制。
  const selected = entries.filter((e) => e.selected);
  if (selected.length !== 4) {
    throw new Error(`selected: true 的条目必须恰为 4 个（当前 ${selected.length}）——见 SITE_SPEC §5`);
  }
  return entries.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
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
