import { z } from 'zod';

/**
 * Work log 条目的形状定义——**不碰 fs、不碰 DOM**，服务端内容池（./log）、
 * 客户端组件、Studio 编辑器（/studio）三处共用同一份 schema。
 *
 * 为什么从 log.ts 里拆出来（2026-07-28）：Studio 要在浏览器里**发布前**跑一遍
 * 与构建期完全相同的校验，而 log.ts 会 import node:fs（Turbopack 里客户端碰不得）。
 * 校验规则只有这一份，编辑器过了 = 构建期一定过——不给「发布后线上构建 fail、
 * 站点直到修好为止都是旧版」留口子。
 */

/** 双语文本：两种语言都必填——缺一种就等于切换后半页空白，构建期即报错。 */
export const BilingualSchema = z
  .object({
    en: z.string().min(1),
    zh: z.string().min(1),
  })
  .strict();

export const LogTagSchema = z
  .object({
    label: BilingualSchema, // 标签同样双语——切中文后不留英文孤岛
    variant: z.enum(['outline', 'neutral']),
  })
  .strict();

/**
 * 表格单元格：双语对象，或**一个字符串 = 两种语言相同**。
 * 后者是有意开的口子（2026-07-28 拍板）——数字、单位、零件代号本身是语言中立的，
 * 逼作者把 `0.34 mm` 抄两遍只会制造抄错的机会；散文性单元格仍走双语对象。
 */
export const LogCellSchema = z.union([z.string().min(1), BilingualSchema]);

/**
 * 图片块：src 只允许 `/log/<文件名>`——即仓库 `public/log/` 下、随条目一同提交的文件。
 * 收紧到这个形状有两个作用：挡掉 `javascript:` 之类的注入 URL，也挡掉外站热链
 * （外站图会在若干年后静默变成裂图，而作品集是要长期能看的东西）。
 * width/height 必填：写进 <img> 才不会在展开面板时把下面的正文顶下去。
 */
export const LogImageBlockSchema = z
  .object({
    kind: z.literal('image'),
    src: z.string().regex(/^\/log\/[A-Za-z0-9][A-Za-z0-9._-]*\.(webp|jpg|jpeg|png|gif|svg)$/i),
    alt: BilingualSchema, // 替代文字必填：读屏与裂图时唯一的信息来源
    caption: BilingualSchema.optional(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export const LogTableBlockSchema = z
  .object({
    kind: z.literal('table'),
    caption: BilingualSchema.optional(),
    head: z.array(LogCellSchema).min(1),
    rows: z.array(z.array(LogCellSchema).min(1)).min(1),
  })
  .strict();

export const LogBlockSchema = z.discriminatedUnion('kind', [
  LogImageBlockSchema,
  LogTableBlockSchema,
]);

export const LogEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Log 页显示 MM-DD，首页预览用整日期
    lead: BilingualSchema, // 加粗引句
    body: BilingualSchema, // 引句之后的正文（受限 Markdown，见 ./md）
    tags: z.array(LogTagSchema),
    /** 图 / 表：正文之后按序渲染（MAPPING §8.5 预留的插槽，2026-07-28 落地）。 */
    blocks: z.array(LogBlockSchema).optional(),
  })
  .strict();

export const LogEntriesSchema = z.array(LogEntrySchema);

/** Log 页语言切换的两个取值；也是 LogEntry.lead/body 的键。 */
export type LogLang = 'en' | 'zh';
export type Bilingual = z.infer<typeof BilingualSchema>;
export type LogTag = z.infer<typeof LogTagSchema>;
export type LogCell = z.infer<typeof LogCellSchema>;
export type LogImageBlock = z.infer<typeof LogImageBlockSchema>;
export type LogTableBlock = z.infer<typeof LogTableBlockSchema>;
export type LogBlock = z.infer<typeof LogBlockSchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;

/** 单元格取文：字符串形式即「两种语言相同」。 */
export function cellText(cell: LogCell, lang: LogLang): string {
  return typeof cell === 'string' ? cell : cell[lang];
}

/** 最新在前；同日 ties 保持数组内既有顺序（Array.sort 稳定）。 */
export function sortEntries(entries: LogEntry[]): LogEntry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/* ── 落盘格式 ─────────────────────────────────────────────────────────────
   与手写时期的 entries.json **逐字一致**（守门测试 log.test.ts 里对着真文件比过），
   这样 /studio 提交的 diff 只包含真正改动的条目，而不是整文件重排一遍。
   JSON.stringify(x, null, 2) 做不到这件事：它会把 `{ "label": …, "variant": … }`
   这种短对象也拆成五行，一次发布就产生几百行无意义 diff。规则是「短就并一行」。 */

/** 一行能放得下的宽度上限（含缩进）。标签对象约 68 字符，散文一定超。 */
const MAX_INLINE = 100;
/**
 * 这几个键下的每一项并成一行：`tags` 的标签对象、表格的 `head` 与 `rows`。
 * 别的（lead / body / alt / caption 这些散文字段）一律逐字段换行——
 * 手写时期的格式如此，散文本来也该一句一行，改一个字的 diff 才只有一行。
 */
const INLINE_ITEMS = new Set(['tags', 'head', 'rows']);

function inline(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  const parts = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`);
  return parts.length === 0 ? '{}' : `{ ${parts.join(', ')} }`;
}

type Mode = 'block' | 'try-inline';

function format(value: unknown, indent: string, mode: Mode, key?: string): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (mode === 'try-inline') {
    const flat = inline(value);
    if (indent.length + flat.length <= MAX_INLINE) return flat;
  }
  const pad = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    // 数组元素是否并行：由数组自己的键决定（tags / head / rows 的元素并行）
    const itemMode: Mode = key !== undefined && INLINE_ITEMS.has(key) ? 'try-inline' : 'block';
    return `[\n${value.map((v) => pad + format(v, pad, itemMode)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '{}';
  const body = entries
    .map(([k, v]) => {
      const childMode: Mode = INLINE_ITEMS.has(k) ? 'try-inline' : 'block';
      return `${pad}${JSON.stringify(k)}: ${format(v, pad, childMode, k)}`;
    })
    .join(',\n');
  return `{\n${body}\n${indent}}`;
}

export function serializeEntries(entries: LogEntry[]): string {
  return `${format(sortEntries(entries), '', 'block')}\n`;
}
