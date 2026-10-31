import { z } from 'zod';

// 其他作品内容池（content/other/works.json）的形状。不碰 fs——home-model 与测试都能 import。
// 主页 02 Work 按组横向切换（MAPPING §58）：第一组是三个主项目，后面每一组是作者定的一种类别。
// 类别、作品、年份、背景都由作者给（2026-10-25 清单）；英文组名与英文标题按作者当日授权由站方翻译，
// 其余不代拟（CLAUDE.md「不自己造词」「模型不代写」）。例外：首页卡片的悬停介绍（intro）按用户 2026-10-28
// 「鼠标悬停弹出的介绍你也都好好写一下」由站方写，只概括各件详情页原文与日志里已有的事实（MAPPING §76）。

const Key = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'key 只许小写字母、数字和单个连字符');

/** 中英两份；详情页跟着全站的 EN / 中切换（site-lang） */
const Bi = z.object({ en: z.string().min(1), zh: z.string().min(1) }).strict();

const ImageSrc = z.string().regex(/^\/(other|log|home)\/[A-Za-z0-9._/-]+\.(webp|png|jpe?g)$/i, '图片路径要在 /other/、/log/ 或 /home/ 下');

/** 图只许放站内 public 下这几个目录：作品图进 /other/，已在日志或首页用过的图直接引用、不复制。 */
const ImageSchema = z
  .object({
    src: ImageSrc,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** 竖长的图（报告、手机截图）从顶上裁，默认居中裁 */
    position: z.enum(['center', 'top']).optional(),
    /** 详情页主图框下的图注 */
    caption: Bi.optional(),
  })
  .strict();

/** 首页 Work 卡片用的图：只要路径与像素；卡片按 cover 居中裁 */
const CardImageSchema = z
  .object({
    src: ImageSrc,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

/**
 * 首页 Work 卡片悬停介绍的字数上限：介绍浮在卡片里、超出部分被渐隐遮掉。
 * 按 1440 × 789（MacBook Air 高度，卡片最矮的常见窗口）实测能完整放下的长度定（MAPPING §76）。
 */
export const WORK_INTRO_MAX = 240;

const GroupSchema = z
  .object({
    key: Key,
    title: z.string().min(1).max(40),
    /** 详情页中文侧的组名；首页 Work 页只有英文 */
    zh: z.string().min(1).max(20).optional(),
  })
  .strict();

/**
 * 详情页（/work/<slug>，MAPPING §60）。2026-10-25 第二版改成按节叙事（用户「去研究真正的正文，
 * 为我设计每一个的叙事」）：每节一个站方小标题、若干段源文件原文、一组图。文字只有三种来源：
 * 源文件上的署名（没写就不写）、源文件里的原文（另一种语言是站方译文，页面上标明）、站方写的小标题与图注。
 * 正文不代写。逐张图的来源见根目录 其他作品_素材整理.md。
 */
const FigureSchema = z
  .object({
    src: ImageSrc,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    caption: Bi,
  })
  .strict();

const CreditSchema = z
  .object({
    role: Bi,
    names: z.array(Bi).min(1),
  })
  .strict();

/** 一段（或几段）原文。both = 中英两版都是作者自己写的（如论文摘要） */
const TextSchema = z
  .object({
    original: z.enum(['en', 'zh', 'both']),
    en: z.array(z.string().min(1)).min(1),
    zh: z.array(z.string().min(1)).min(1),
    /** 原文出自哪份文件的哪一处 */
    source: Bi,
  })
  .strict()
  .refine((t) => t.en.length === t.zh.length, { message: '中英段数要一致' });

const SectionSchema = z
  .object({
    heading: Bi,
    texts: z.array(TextSchema).optional(),
    figures: z.array(FigureSchema).optional(),
    /** pair = 图两两并排（照片、效果图）；默认一张一行 */
    layout: z.enum(['stack', 'pair']).optional(),
  })
  .strict()
  .refine((s) => (s.texts?.length ?? 0) + (s.figures?.length ?? 0) > 0, { message: '一节至少要有一段字或一张图' });

const PageSchema = z
  .object({
    credits: z.array(CreditSchema).optional(),
    /** 展览、入选一类的记录：只写作者确认过的 */
    recognition: z.array(Bi).optional(),
    sections: z.array(SectionSchema).min(1),
  })
  .strict();

const WorkSchema = z
  .object({
    title: z.string().min(1).max(60),
    group: Key,
    /** 年份，或一段年份（2019–23 / 2019–2023）。作者没给年份的可以不填（2026-10-30 绘画页：作者拍板「先不写年份」），题头、卡片与页脚就不出年份 */
    year: z.string().regex(/^\d{4}(–(\d{2}|\d{4}))?$/, '年份写成 2024 或 2019–23').optional(),
    /** 卡片标题下那一行：背景 · 媒介，按「 · 」分段，第一段进卡片题头 */
    context: z.string().min(1).max(80),
    /** 副标题：详情页标题下那一行，首屏方块场卡片的说明也用它 */
    line: z.string().min(1).max(160).optional(),
    /** 首页 Work 卡片悬停时浮出的介绍（两三句，英文；首页只有英文）。没有就退回 line，再没有就只出「Open ↗」 */
    intro: z.string().min(1).max(WORK_INTRO_MAX).optional(),
    image: ImageSchema.optional(),
    /** 首页 Work 卡片专用的裁切（图纸大片留白、长报告截图时用）；没有就用 image。详情页主图仍是 image */
    card: CardImageSchema.optional(),
    /** 中文侧的标题与背景（详情页用）；没有就沿用英文 */
    zh: z
      .object({ title: z.string().min(1).max(60), context: z.string().min(1).max(80), line: z.string().min(1).max(160).optional() })
      .strict()
      .optional(),
    /** 有详情页的作品：地址 /work/<slug>，与主项目同一条路由，slug 不许撞 */
    slug: Key.optional(),
    page: PageSchema.optional(),
    /** 没有详情页时点卡片去哪：站内路径或 https 外链 */
    href: z.string().regex(/^(\/\S*|https:\/\/\S+)$/, 'href 要么是站内路径，要么是 https 外链').optional(),
    /** 这件作品的过程记在日志的哪个项目组（log-facets 的 PROJECT_GROUPS key）：有就链到那一组最新一条，没有记录时退回 href */
    log: Key.optional(),
  })
  .strict()
  .superRefine((w, ctx) => {
    if (w.page && !w.slug) ctx.addIssue({ code: 'custom', path: ['slug'], message: `「${w.title}」有详情页就要有 slug` });
    if (w.page && !w.image) ctx.addIssue({ code: 'custom', path: ['image'], message: `「${w.title}」有详情页就要有封面图` });
    if (!w.page && !w.href) ctx.addIssue({ code: 'custom', path: ['href'], message: `「${w.title}」没有详情页就要给 href` });
  });

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
    const slugs = new Set<string>();
    v.works.forEach((w, i) => {
      if (!keys.has(w.group)) ctx.addIssue({ code: 'custom', path: ['works', i, 'group'], message: `作品「${w.title}」的组 ${w.group} 没有登记` });
      if (w.slug && slugs.has(w.slug)) ctx.addIssue({ code: 'custom', path: ['works', i, 'slug'], message: `slug ${w.slug} 重复` });
      if (w.slug) slugs.add(w.slug);
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
