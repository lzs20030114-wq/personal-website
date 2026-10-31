import './case-dark.css';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { MAIN_PROJECTS, getRoutableWork, getRoutableWorkBySlug, type WorkEntry } from '../../../../src/lib/site/content';
import { OPENING_TITLE, extractChapterTitles } from '../../../../src/lib/site/case-headings';
import { BLOCK_UI } from '../../../../src/lib/site/case-reincarnation';
import {
  ConceptCard,
  ConceptGrid,
  FigPair,
  FigSlot,
  Fold,
  IntentNote,
  InteractiveSlot,
  ProcessAside,
  StatusSign,
  Todo,
  VideoSlot,
  type SlotLang,
} from '../../../../components/site/slots';
import { Pick } from '../../../../components/site/CaseLang';
import { CaseFooter } from '../../../../components/lab/LabShell';
import { Accent, Lead } from '../../../../components/site/case/CaseBlocks';
import { CaseIndex } from '../../../../components/site/case/CaseIndex';
import { CaseReveal } from '../../../../components/site/case/CaseReveal';
import { WorkInPreparation } from '../../../../components/site/WorkInPreparation';
import { OtherWorkPage } from '../../../../components/site/OtherWorkPage';
import { ImageViewer } from '../../../../components/site/ImageViewer';
import { getOtherWorkPage, getOtherWorkPages } from '../../../../src/lib/site/other-works';

export function generateStaticParams() {
  return [
    ...getRoutableWork().map((w) => ({ slug: w.slug })),
    // 其他作品的详情页（content/other/works.json 里带 page 的，MAPPING §60）
    ...getOtherWorkPages().map((p) => ({ slug: p.work.slug })),
  ];
}

/**
 * 作品路由只允许构建期列出的 slug（published + 主项目 + 有详情页的其他作品）；其余 draft/未知 slug
 * 不做按需渲染。主项目里未发稿的渲「筹备中」页（用户拍板 2026-07-29；主项目 2026-10-04 起为三个）。
 */
export const dynamicParams = false;

/** 去掉作者自留的方括号备注（如 "[summary 草案…]"），仅用于展示。 */
function cleanSummary(s: string): string {
  return s.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getRoutableWorkBySlug(slug);
  if (!entry) {
    const other = getOtherWorkPage(slug);
    if (!other) notFound();
    return { title: other.work.title, description: other.work.line ?? other.work.context };
  }
  // 筹备中的页面没有正文，summary 还是「待盘点」占位——别把占位字当描述发出去，也别让它进索引
  if (entry.status !== 'published') {
    return {
      title: entry.title,
      description: 'In preparation — the case study for this project has not been published yet.',
      robots: { index: false, follow: true },
    };
  }
  return { title: entry.title, description: cleanSummary(entry.summary) };
}

/**
 * MDX 组件表按语言绑定：图注的状态签、Process 标签、概念卡题、各构件的双语数据都要跟着切。
 * 语言在服务端就定死在组件表里（两棵树各渲一次），插槽因此仍是服务端组件——
 * 不为了拿一个 lang 把整个插槽体系推成 client。交互构件（'use client'）同样吃这个 lang prop，
 * 所以只有当前语言那棵会挂载。
 */
const mdxComponents = (lang: SlotLang) => ({
  FigSlot: (p: ComponentProps<typeof FigSlot>) => <FigSlot {...p} lang={lang} />,
  FigPair,
  VideoSlot: (p: ComponentProps<typeof VideoSlot>) => <VideoSlot {...p} lang={lang} />,
  InteractiveSlot: (p: ComponentProps<typeof InteractiveSlot>) => (
    <InteractiveSlot {...p} lang={lang} />
  ),
  Todo: (p: ComponentProps<typeof Todo>) => <Todo {...p} lang={lang} />,
  IntentNote: (p: ComponentProps<typeof IntentNote>) => <IntentNote {...p} lang={lang} />,
  ProcessAside: (p: ComponentProps<typeof ProcessAside>) => <ProcessAside {...p} lang={lang} />,
  Fold: (p: ComponentProps<typeof Fold>) => <Fold {...p} lang={lang} />,
  /**
   * 正文里的链接（2026-09-13）：指回 /archive 某一条日志的引用另给一个类，
   * 读作旁注不读作正文（.cs-cite）。锚点沿用 log-<日期>-<序号> 形状，由持久 id 固定到条目——不能用 LogList 内部那个带全池下标的 id，那个一发新日志就会指到别的条目上。
   */
  a: ({ href, children, ...rest }: ComponentProps<'a'>) => {
    const cite = typeof href === 'string' && href.startsWith('/archive#log-');
    return (
      <a href={href} className={cite ? 'cs-cite' : undefined} {...rest}>
        {children}
      </a>
    );
  },
  ConceptCard: (p: ComponentProps<typeof ConceptCard>) => <ConceptCard {...p} lang={lang} />,
  ConceptGrid,

  /* ── 「10 Case 01」稿的正文构件（MAPPING §45）：开场 / 研究问题 / 组成 / 闭合规则 /
     生命周期 / 人格示意台 / 五层 / 数字对比 / 衰老曲线 / 系统逻辑 / 自干扰 / 现状 / 预测 / 参数。
     数据在 src/lib/site/case-reincarnation.ts（人格表、预测表、参数表与线上原文逐字一致）。 */
  Lead,
  Accent,

});

const mdxOptions = { mdxOptions: { remarkPlugins: [remarkGfm] } };

/** 「案例 01 / 03」里的分母 = 主项目数（2026-10-04 起为 3）。 */
const TOTAL = String(MAIN_PROJECTS).padStart(2, '0');

/** 页面框架字（正文之外的固定词）；正文两侧各自成文，不在这里。 */
const COPY = {
  en: {
    back: '← All work',
    kicker: (n: string) => `Case study ${n} / ${TOTAL}`,
    mRole: 'My role',
    mTools: 'Tools',
    mTime: 'Date',
    mStatus: 'Status',
    mCredits: 'Credits',
    nextK: (n: string) => `Next case study · ${n} / ${TOTAL}`,
    footer: (n: string, t: string, y: string) => `Case study ${n} · ${t} · ${y}`,
    openLab: 'Open in the lab ↗',
  },
  zh: {
    back: '← 全部作品',
    kicker: (n: string) => `案例 ${n} / ${TOTAL}`,
    mRole: '我的角色',
    mTools: '工具',
    mTime: '时间',
    mStatus: '状态',
    mCredits: '协作',
    nextK: (n: string) => `下一个案例 · ${n} / ${TOTAL}`,
    footer: (n: string, t: string, y: string) => `案例 ${n} · ${t} · ${y}`,
    openLab: '在实验室中打开 ↗',
  },
} as const;

/**
 * hero / V.60 席位的题注是项目相关的框架字，按 slug 取——此前硬编码成项目 01 专属
 * （V.60 写着「生命周期」），项目 02 发布（2026-08-14）后会串台。
 * heroLive 只有主图被活台架顶替的项目才有；heroLab = 对应 /lab 台架编号（按钮直达）。
 */
type SlotCopy = {
  video: string;
  heroLabel: string;
  heroDesc: string;
  heroLive?: string;
  /** 主图的图号。默认 Fig. 01 / 图 01；项目 01 的图目录 2026-09-13 改为 N01–N20，故单独给。 */
  heroId?: string;
  /** 主图框里底部左侧的操作动词（活件没有控制条——「去实验室操作」才有）。 */
  heroVerb?: string;
  /** 主图图注的完整一句（稿 heroCap）。 */
  heroCap?: string;
};
const SLOT_COPY: Record<string, { lab?: string; en: SlotCopy; zh: SlotCopy }> = {
  'reincarnation-machine': {
    // 稿的动词写的是「拖动旋转」，但 Lab 1-5 整机台架按用户拍板（2026-07-29）**不挂拖拽、视角只由按钮控制**，
    // 主图位里更没有按钮——照稿写会说谎。改成这台实际上做的事 + 去哪操作。
    lab: '1-5',
    en: {
      video:
        'One full life cycle (birth, interaction, ageing, stop, blank), eight minutes compressed to ninety seconds. Does not autoplay.',
      heroLabel: 'machine hero photo · studio white sweep · B/W',
      heroDesc: 'The machine, full view',
      heroLive: '[stand-in] Lab 1-5 full assembly · live',
      heroId: 'N01',
      heroVerb: 'one shaft drives five rings · click a small arm · views and controls in the lab',
      heroCap: '[stand-in] Lab 1-5 full assembly · hero photo to shoot',
    },
    zh: {
      video: '一个完整生命周期（诞生、互动、衰老、停止、空白），约 8 分钟压缩到 90 秒。不自动播放。',
      heroLabel: '整机主照 · 影棚白弧扫 · 黑白',
      heroDesc: '整机全貌',
      heroLive: '[顶替] Lab 1-5 整机活件',
      heroId: 'N01',
      heroVerb: '一根中轴带动五个环 · 点一下小触手 · 视角与控制在实验室',
      heroCap: '[顶替] Lab 1-5 整机活件 · 整机主照待拍摄',
    },
  },
  'project-ii': {
    lab: '2-15',
    en: {
      video: 'Simulation video, the cat café scenario',
      heroLabel: 'hero image · to be supplied',
      heroDesc: 'Hero image',
      heroLive: '[stand-in] Lab 2-15 people and cats in the room · live',
      heroVerb: '64 units stowed under the ceiling come down by the rules · six visitors, two cats · controls in the lab',
      heroCap: '[stand-in] Lab 2-15 people and cats together, in 3D · hero image to be supplied',
    },
    zh: {
      video: '仿真演示视频，猫咖人猫场景',
      heroLabel: '主图 · 待供图',
      heroDesc: '主图',
      heroLive: '[顶替] Lab 2-15 人猫同台立体活件',
      heroVerb: '64 台单元收在天花板下，按规则落下 · 六位访客、两只猫 · 控制在实验室',
      heroCap: '[顶替] Lab 2-15 人猫同台立体活件 · 主图待供图',
    },
  },
};
/** 将来新发布的项目在补进 SLOT_COPY 前先落到中性兜底，不再借别的项目的题注。 */
const SLOT_COPY_FALLBACK: { lab?: string; en: SlotCopy; zh: SlotCopy } = {
  en: { video: 'Project video — to be supplied', heroLabel: 'hero image · to be supplied', heroDesc: 'Hero image' },
  zh: { video: '项目视频——待供', heroLabel: '主图 · 待供图', heroDesc: '主图' },
};

/** 「下一个案例」卡上的名字：项目 II 尚未定名，沿用主页卡片的描述名（home-model.ts 里同一处覆写，定名后一并删）。 */
const NEXT_TITLE: Record<string, { en: string; zh: string }> = {
  'project-ii': { en: 'Cross-species space', zh: '跨物种空间' },
};

/** 首屏元数据条（稿 dl）：我的角色 / 工具 / 时间 / 状态；状态一列只有写了 progress 的项目才有。 */
function HeroMeta({ entry, lang }: { entry: WorkEntry; lang: SlotLang }) {
  const c = COPY[lang];
  const zh = lang === 'zh';
  const role = (zh && entry.zh?.role) || entry.role;
  const tools = (zh && entry.zh?.tools) || entry.tools;
  const period = (zh && entry.zh?.period) || entry.period || entry.date.replace('-', '.');
  const progress = (zh && entry.zh?.progress) || entry.progress;
  const dots = ['var(--cs-am)', 'var(--cs-dim)', 'var(--cs-dim)'];
  return (
    <dl className="cs-meta" data-rv>
      <div>
        <dt>{c.mRole}</dt>
        <dd>
          {role.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </dd>
      </div>
      <div className="cs-meta__rest">
        <div>
          <dt>{c.mTools}</dt>
          <dd>
            {(tools ?? ['—']).map((r) => (
              <span key={r}>{r}</span>
            ))}
          </dd>
        </div>
        <div>
          <dt>{c.mTime}</dt>
          <dd>{period}</dd>
        </div>
        {entry.credits && entry.credits.length > 0 ? (
          <div>
            <dt>{c.mCredits}</dt>
            <dd>
              {entry.credits.map((x) => (
                <span key={x.name}>
                  {x.name} — {x.role}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {progress && progress.length > 0 ? (
          <div>
            <dt>{c.mStatus}</dt>
            <dd>
              {progress.map((x, i) => (
                <span className="cs-chip" key={x}>
                  <i style={{ background: dots[Math.min(i, dots.length - 1)] }} />
                  {x}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </div>
    </dl>
  );
}

/**
 * case study（「10 Case 01 - Reincarnation Machine」稿，design-ref/case-01-dark，MAPPING §45）：
 * 整屏首屏（返回/案例号/状态 → 标题 + 双线尺 + 一句话 → 主图框）→ 元数据四列 →
 * 左目录栏（可收）+ 右正文 → V.60 视频席位 → 下一个案例。
 * AI 披露席位 2026-10-31 按作者拍板删掉（不写披露声明，SITE_SPEC §9 修订）。
 * 仍由 frontmatter / 内容池 / MDX 驱动，只换渲染模板；顶栏（含中英切换与阅读进度）在布局层，页脚在本页。
 */
export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getRoutableWorkBySlug(slug);
  if (!entry) {
    // 不是主项目：其他作品的详情页（同一套外壳，不套案例页模板）
    const other = getOtherWorkPage(slug);
    if (!other) notFound();
    return <OtherWorkPage entry={other} />;
  }
  // 主项目里还没发稿的：同一条路由、同一套外壳，正文位换成「筹备中」框架字（不代写）
  if (entry.status !== 'published') return <WorkInPreparation entry={entry} />;

  // 先判断筹备页，再载入本项目的构件；动态客户端边界位于各项目的 *-dynamic.tsx。
  const project = slug === 'reincarnation-machine'
    ? await import('../../../../components/site/case/machine-components')
    : slug === 'project-ii'
      ? await import('../../../../components/site/case/space-components')
      : null;
  const Hero = project?.CaseHero;
  const componentsFor = (lang: SlotLang) => ({ ...mdxComponents(lang), ...project?.components(lang) });

  const caseNo = String(entry.order ?? 1).padStart(2, '0');
  // 主图暂用活台架顶替的项目（作者供图后删掉对应的一支即回占位块）：
  // 项目 01 = Lab 1-5 整机（与主页预览位同一件）· 项目 II = Lab 2-8 4×4 环阵列
  // （九台里只有它带真实尺度——房、人、十六片吊在天花下的平台）
  const liveHero = slug === 'reincarnation-machine' || slug === 'project-ii';
  const sc = SLOT_COPY[slug] ?? SLOT_COPY_FALLBACK;
  const heroId = (l: SlotLang) => sc[l].heroId ?? (l === 'zh' ? '图 01' : 'Fig. 01');
  const year = entry.date.slice(0, 4);
  const nextOrder = (entry.order ?? 0) + 1;
  const next = getRoutableWork().find((w) => w.order === nextOrder);
  const nextTitle = (l: SlotLang) =>
    next ? NEXT_TITLE[next.slug]?.[l] ?? (l === 'zh' ? next.zh?.title ?? next.title : next.title) : '';
  const progress0 = (l: SlotLang) => (l === 'zh' ? entry.zh?.progress?.[0] : undefined) ?? entry.progress?.[0];

  const indexEn = [OPENING_TITLE.en, ...extractChapterTitles(entry.body)];
  const indexZh = [OPENING_TITLE.zh, ...extractChapterTitles(entry.bodyZh ?? entry.body)];

  return (
    <>
      {/* 深色底铺满视口；顶栏 / 语言上下文在布局层（LabLanguageRoot 对 /work 生效）。
          页面转场在根布局（MAPPING §48）：data-case-order 供「下一个案例」判断左右 */}
      <div className="ground-plane ld-ground" aria-hidden />
      <CaseReveal />
      {/* 页内看图器（MAPPING §60.2）：正文里的分镜（FrameStrip）点开在这里看大图，没有分镜的页面它什么也不做 */}
      <ImageViewer />
      <div className="cs pg-dark" data-case-order={entry.order ?? undefined}>
        <div className="cs-dots" aria-hidden style={{ top: -64 }} />

        <section className="cs-hero" data-screen-label={`Case ${caseNo} · hero`}>
          <div className="cs-hero__screen">
            <div className="cs-hero__row1" data-rv>
              <Link href="/#work" className="cs-back">
                <Pick en={COPY.en.back} zh={COPY.zh.back} />
              </Link>
              <span className="cs-hero__meta">
                <span>
                  <Pick en={COPY.en.kicker(caseNo)} zh={COPY.zh.kicker(caseNo)} />
                </span>
                {progress0('en') ? (
                  <span className="cs-state">
                    <i />
                    <Pick en={progress0('en')} zh={progress0('zh')} />
                  </span>
                ) : null}
              </span>
            </div>
            <div className="cs-hero__row2">
              <div className="cs-hero__lead">
                <h1 className="cs-title" data-rv>
                  <Pick en={entry.title} zh={entry.zh?.title ?? entry.title} />
                </h1>
                {/* 标题下的双线尺（稿）：上一条绿虚线行进（reduced-motion 停），下一条紫实线 150px */}
                <svg className="cs-rule" width="230" height="12" aria-hidden data-rv>
                  <line
                    data-dash
                    x1="0"
                    y1="4"
                    x2="230"
                    y2="4"
                    stroke="oklch(0.74 0.1 150)"
                    strokeWidth="1.5"
                    strokeDasharray="8 6"
                    style={{ animation: 'dashmove 2.6s linear infinite' }}
                  />
                  <line x1="0" y1="10" x2="150" y2="10" stroke="oklch(0.72 0.095 291)" strokeWidth="1.5" />
                </svg>
              </div>
              <p className="cs-lede" data-rv>
                <Pick
                  en={cleanSummary(entry.summary)}
                  zh={cleanSummary(entry.zh?.summary ?? entry.summary)}
                />
              </p>
            </div>

            {/* 主图框（稿 hero figure）：渐变底 + 暗角 + 顶线 + 四角标 + 框内标签；图注在框外。
                页面转场里它是共享元素（data-pt-frame = 框里那台台架的编号：点「在实验室中打开」时
                这个框飞到实验室那一格，MAPPING §48）。主图只能有一份活台架（两份 = 两个 WebGL 上下文），
                所以它不进 Pick，由一层客户端壳读语言上下文。首屏完整性由 .cs-hero__screen 的高度预算保证。 */}
            <figure className="cs-fig" data-rv>
              <div className="cs-stage" data-pt-frame={liveHero && sc.lab ? sc.lab : undefined}>
                {liveHero ? (
                  <div className="cs-stage__bench">
                    {/* 项目 01 临时主图 = Lab 1-5 整机活件（用户拍板 2026-07-27 先用活件顶上、07-29 从五环换成整机；
                        与主页预览位同一件）。作者供图后删掉本分支即回占位。
                        控制条不出：稿的主图框里没有控件、只有「去实验室操作」——点那里去 /lab 才有视角与部件开关。 */}
                    {Hero ? <Hero /> : null}
                  </div>
                ) : (
                  <div className="cs-stage__ph">
                    <Pick en={sc.en.heroLabel} zh={sc.zh.heroLabel} />
                  </div>
                )}
                <div className="cs-stage__vignette" />
                <span className="cs-corner cs-corner--tl" />
                <span className="cs-corner cs-corner--tr" />
                <span className="cs-corner cs-corner--bl" />
                <span className="cs-corner cs-corner--br" />
                <div className="cs-stage__top">
                  <span className="cs-id">
                    <Pick en={heroId('en')} zh={heroId('zh')} />
                    {sc.lab ? ` · LAB ${sc.lab}` : ''}
                  </span>
                  {liveHero ? (
                    <span className="cs-live">
                      <i />
                      <Pick en={BLOCK_UI.en.live} zh={BLOCK_UI.zh.live} />
                    </span>
                  ) : (
                    <Pick en={<StatusSign status="待拍摄" lang="en" />} zh={<StatusSign status="待拍摄" lang="zh" />} />
                  )}
                </div>
                {liveHero && sc.lab ? (
                  <div className="cs-stage__bot">
                    <span className="cs-stage__verb">
                      <Pick en={sc.en.heroVerb ?? ''} zh={sc.zh.heroVerb ?? ''} />
                    </span>
                    <Link href={`/lab#lab${sc.lab}`} prefetch={false} className="cs-open" data-pt="frame">
                      <Pick en={COPY.en.openLab} zh={COPY.zh.openLab} />
                    </Link>
                  </div>
                ) : null}
              </div>
              <figcaption className="cs-figcap">
                <span>
                  <Pick en={heroId('en')} zh={heroId('zh')} />
                </span>
                <span>
                  <Pick
                    en={(liveHero && sc.en.heroCap) || sc.en.heroDesc}
                    zh={(liveHero && sc.zh.heroCap) || sc.zh.heroDesc}
                  />
                </span>
              </figcaption>
            </figure>
          </div>

          <Pick en={<HeroMeta entry={entry} lang="en" />} zh={<HeroMeta entry={entry} lang="zh" />} />
        </section>

        <div className="cs-layout">
          <CaseIndex en={indexEn} zh={indexZh} />

          <div className="cs-main">
            {/* 编号 section（CSS counter 作用于 .cs-body h2）——中英各一棵树，
                两棵都随 RSC 载荷发下来，只有当前语言那棵挂载。
                remark-gfm：正文里的表是 GFM 管道表，非 GFM 会原样吐出竖线。 */}
            <div className="cs-body">
              <Pick
                en={
                  <MDXRemote
                    source={entry.body}
                    components={componentsFor('en')}
                    options={mdxOptions}
                  />
                }
                zh={
                  <MDXRemote
                    source={entry.bodyZh ?? entry.body}
                    components={componentsFor('zh')}
                    options={mdxOptions}
                  />
                }
              />
            </div>

            <section className="cs-tail" data-screen-label={`Case ${caseNo} · tail`}>
              {/* 视频席位（frontmatter 提供 src 前为斜纹占位框，不自动播放） */}
              <Pick
                en={
                  <VideoSlot
                    id="V.60"
                    caption={sc.en.video}
                    status={entry.video ? '可现产' : '待拍摄'}
                    src={entry.video?.src}
                    lang="en"
                  />
                }
                zh={
                  <VideoSlot
                    id="V.60"
                    caption={sc.zh.video}
                    status={entry.video ? '可现产' : '待拍摄'}
                    src={entry.video?.src}
                    lang="zh"
                  />
                }
              />
              {next ? (
                <Link href={`/work/${next.slug}`} className="cs-next" data-pt="next">
                  <span>
                    <span className="cs-next__k">
                      <Pick
                        en={COPY.en.nextK(String(nextOrder).padStart(2, '0'))}
                        zh={COPY.zh.nextK(String(nextOrder).padStart(2, '0'))}
                      />
                    </span>
                    <span className="cs-next__t">
                      <Pick en={nextTitle('en')} zh={nextTitle('zh')} />
                    </span>
                  </span>
                  <span className="cs-next__arrow" aria-hidden>
                    →
                  </span>
                </Link>
              ) : null}
            </section>
          </div>
        </div>

        <CaseFooter
          labelEn={COPY.en.footer(caseNo, entry.title, year)}
          labelZh={COPY.zh.footer(caseNo, entry.zh?.title ?? entry.title, year)}
        />
      </div>
    </>
  );
}
