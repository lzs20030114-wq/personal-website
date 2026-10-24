import { z } from 'zod';

// 其他作品内容池（content/other/works.json）的形状。不碰 fs——home-model 与测试都能 import。
// 主页 02 Work 按组横向切换（MAPPING §58）：第一组是三个主项目，后面每一组是作者定的一种类别。
// 类别名、作品、年份、背景都由作者给，模型不代拟（CLAUDE.md「不自己造词」「模型不代写」）。

const Key = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'key 只许小写字母、数字和单个连字符');

/** 图只许放站内 public 下这几个目录：作品图进 /other/，已在日志或首页用过的图直接引用、不复制。 */
const ImageSchema = z
  .object({
    src: z.string().regex(/^\/(other|log|home)\/[A-Za-z0-9._/-]+\.(webp|png|jpe?g)$/i, '图片路径要在 /other/、/log/ 或 /home/ 下'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** 竖长的图（报告、手机截图）从顶上裁，默认居中裁 */
    position: z.enum(['center', 'top']).optional(),
  })
  .strict();

const GroupSchema = z
  .object({
    key: Key,
    title: z.string().min(1).max(40),
  })
  .strict();

const WorkSchema = z
  .object({
    title: z.string().min(1).max(60),
    group: Key,
    /** 年份，或一段年份（2019–23 / 2019–2023） */
    year: z.string().regex(/^\d{4}(–(\d{2}|\d{4}))?$/, '年份写成 2024 或 2019–23'),
    /** 卡片标题下那一行：背景 · 媒介，按「 · 」分段，第一段进卡片题头 */
    context: z.string().min(1).max(80),
    /** 悬停时浮出的一句话；没有就只出「Open ↗」 */
    line: z.string().min(1).max(160).optional(),
    image: ImageSchema.optional(),
    /** 点卡片去哪：站内路径或 https 外链 */
    href: z.string().regex(/^(\/\S*|https:\/\/\S+)$/, 'href 要么是站内路径，要么是 https 外链'),
    /** 这件作品的过程记在日志的哪个项目组（log-facets 的 PROJECT_GROUPS key）：有就链到那一组最新一条，没有记录时退回 href */
    log: Key.optional(),
  })
  .strict();

export const OtherWorksSchema = z
  .object({
    groups: z.array(GroupSchema),
    works: z.array(WorkSchema),
  })
  .strict()
  .superRefine((v, ctx) => {
    const keys = new Set<string>();
    v.groups.forEach((g, i) => {
      if (keys.has(g.key)) ctx.addIssue({ code: 'custom', path: ['groups', i, 'key'], message: `组 ${g.key} 重复` });
      keys.add(g.key);
    });
    v.works.forEach((w, i) => {
      if (!keys.has(w.group)) ctx.addIssue({ code: 'custom', path: ['works', i, 'group'], message: `作品「${w.title}」的组 ${w.group} 没有登记` });
    });
    // 空组会在主页上切出一屏空白，不许出现
    v.groups.forEach((g, i) => {
      if (!v.works.some((w) => w.group === g.key)) {
        ctx.addIssue({ code: 'custom', path: ['groups', i], message: `组 ${g.key} 里没有作品` });
      }
    });
  });

export type OtherWorks = z.infer<typeof OtherWorksSchema>;
export type OtherWork = OtherWorks['works'][number];
export type OtherGroup = OtherWorks['groups'][number];
