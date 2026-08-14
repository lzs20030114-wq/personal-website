import type { ComponentProps } from 'react';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { getRoutableWork, getRoutableWorkBySlug } from '../../../../src/lib/site/content';
import {
  ConceptCard,
  ConceptGrid,
  FigCaption,
  FigPair,
  FigSlot,
  IntentNote,
  InteractiveSlot,
  ProcessAside,
  VideoSlot,
  type SlotLang,
} from '../../../../components/site/slots';
import { CaseLangRoot, CaseLangSwitch, Pick } from '../../../../components/site/CaseLang';
import { DisclosureSlot, MetaRail } from '../../../../components/site/RoleBlock';
import { LinkageFigure } from '../../../../components/linkage/LinkageFigure';
import { CaseHeroLive } from '../../../../components/site/CaseHeroLive';
import { PageEnter } from '../../../../components/site/PageEnter';
import { BackTransition } from '../../../../components/site/BackTransition';
import { WorkInPreparation } from '../../../../components/site/WorkInPreparation';

export function generateStaticParams() {
  return getRoutableWork().map((w) => ({ slug: w.slug }));
}

/**
 * 作品路由只允许构建期列出的 slug（published + 四个主项目）；其余 draft/未知 slug
 * 不做按需渲染。四个主项目里未发稿的三个渲「筹备中」页（用户拍板 2026-07-29）。
 */
export const dynamicParams = false;

/** 去掉作者自留的方括号备注（如 "[summary 草案…]"），仅用于展示。 */
function cleanSummary(s: string): string {
  return s.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getRoutableWorkBySlug(slug);
  if (!entry) notFound();
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
 * MDX 组件表按语言绑定：图注的状态签、Process 标签、概念卡题都要跟着切。
 * 语言在服务端就定死在组件表里（两棵树各渲一次），插槽因此仍是服务端组件——
 * 不为了拿一个 lang 把整个插槽体系推成 client。
 */
const mdxComponents = (lang: SlotLang) => ({
  FigSlot: (p: ComponentProps<typeof FigSlot>) => <FigSlot {...p} lang={lang} />,
  FigPair,
  VideoSlot: (p: ComponentProps<typeof VideoSlot>) => <VideoSlot {...p} lang={lang} />,
  InteractiveSlot: (p: ComponentProps<typeof InteractiveSlot>) => (
    <InteractiveSlot {...p} lang={lang} />
  ),
  IntentNote,
  ProcessAside: (p: ComponentProps<typeof ProcessAside>) => <ProcessAside {...p} lang={lang} />,
  ConceptCard: (p: ComponentProps<typeof ConceptCard>) => <ConceptCard {...p} lang={lang} />,
  ConceptGrid,
  LinkageFigure,
});

const mdxOptions = { mdxOptions: { remarkPlugins: [remarkGfm] } };

/** 页面框架字（正文之外的固定词）；正文两侧各自成文，不在这里。 */
const COPY = {
  en: { kicker: (n: string) => `Case study ${n} / 04` },
  zh: { kicker: (n: string) => `案例 ${n} / 04` },
} as const;

/**
 * hero / V.60 席位的题注是项目相关的框架字，按 slug 取——此前硬编码成项目 01 专属
 * （V.60 写着「生命周期」），项目 02 发布（2026-08-14）后会串台。
 * heroLive 只有主图被活台架顶替的项目才有。
 */
type SlotCopy = { video: string; heroLabel: string; heroDesc: string; heroLive?: string };
const SLOT_COPY: Record<string, { en: SlotCopy; zh: SlotCopy }> = {
  'reincarnation-machine': {
    en: {
      video:
        'One full life cycle — birth, interaction, ageing, stop, blank — eight minutes compressed to ninety seconds',
      heroLabel: 'machine hero photo · studio white sweep · B/W',
      heroDesc: 'The machine, full view',
      heroLive: '[stand-in] Lab.05 full assembly · live',
    },
    zh: {
      video: '一个完整生命周期：诞生、互动、衰老、停止、空白——约 8 分钟压缩到 90 秒',
      heroLabel: '整机主照 · 影棚白弧扫 · 黑白',
      heroDesc: '整机全貌',
      heroLive: '[顶替] Lab.05 整机活件',
    },
  },
  'project-ii': {
    en: {
      video: 'Simulation video — the domestic human–cat scenario',
      heroLabel: 'hero image · to be supplied',
      heroDesc: 'Hero image',
    },
    zh: {
      video: '仿真演示视频——居家人猫场景',
      heroLabel: '主图 · 待供图',
      heroDesc: '主图',
    },
  },
};
/** 将来新发布的项目在补进 SLOT_COPY 前先落到中性兜底，不再借别的项目的题注。 */
const SLOT_COPY_FALLBACK: { en: SlotCopy; zh: SlotCopy } = {
  en: { video: 'Project video — to be supplied', heroLabel: 'hero image · to be supplied', heroDesc: 'Hero image' },
  zh: { video: '项目视频——待供', heroLabel: '主图 · 待供图', heroDesc: '主图' },
};

/**
 * case study（Case-Modernist 稿）：全宽 header（kicker + 72px 标题 + summary）→
 * 左 300px sticky 元数据栏（2px 墨竖线）+ 右内容列（编号 section 由 .case-body CSS counter 生成）
 * → V.60 视频席位 → AI disclosure 席位。保持 frontmatter/内容池驱动，只换渲染模板。
 */
export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getRoutableWorkBySlug(slug);
  if (!entry) notFound();
  // 四个主项目里还没发稿的：同一条路由、同一套版式，正文位换成「筹备中」框架字（不代写）
  if (entry.status !== 'published') return <WorkInPreparation entry={entry} />;

  const caseNo = String(entry.order ?? 1).padStart(2, '0');
  // 主图暂用活台架顶替的项目（与主页预览位同一件；作者供图后删掉这一行即回占位块）
  const liveHero = slug === 'reincarnation-machine';
  const sc = SLOT_COPY[slug] ?? SLOT_COPY_FALLBACK;

  return (
    <>
      {/* 深色底铺满视口 + 转场进入段（MAPPING §6.1） */}
      <div className="ground-plane" aria-hidden />
      <PageEnter />
      <BackTransition />
      <CaseLangRoot className="shell pg-dark" data-pt-content>
      {/* 版式度量全部走 .case-* 类（globals.css）——首屏要按视口高度压一档，
          内联样式没法被媒体查询接管 */}
      <header className="case-head">
        <div className="case-head__top">
          <p className="case-kicker">
            <Pick en={COPY.en.kicker(caseNo)} zh={COPY.zh.kicker(caseNo)} />
          </p>
          {/* 中英滑块（用户拍板 2026-07-28）：与 log 页同一套皮肤、同一个偏好键 */}
          <CaseLangSwitch />
        </div>
        <h1 className="case-title">
          <Pick en={entry.title} zh={entry.zh?.title ?? entry.title} />
        </h1>
        {/* 标题下的双线尺（稿）：上一条绿虚线行进（reduced-motion 停），下一条紫实线 150px */}
        <svg className="case-rule" width="230" height="12" aria-hidden>
          <line
            data-dash
            x1="0"
            y1="4"
            x2="230"
            y2="4"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray="8 6"
            style={{ animation: 'dashmove 2.6s linear infinite' }}
          />
          <line x1="0" y1="10" x2="150" y2="10" stroke="var(--accent-2)" strokeWidth="1.5" />
        </svg>
        <p className="case-lede">
          <Pick
            en={cleanSummary(entry.summary)}
            zh={cleanSummary(entry.zh?.summary ?? entry.summary)}
          />
        </p>
      </header>

      <div className="case-layout">
        <aside className="case-rail">
          <Pick en={<MetaRail entry={entry} lang="en" />} zh={<MetaRail entry={entry} lang="zh" />} />
        </aside>

        <div className="case-content min-w-0 lg:pl-14">
          {/* Fig.01 主图（稿：渐变媒体块 + 点阵 + 颗粒 + 框内标签，图注在框外）。
              这一件就是稿里的 Fig.01——MDX 里那条同名 FigSlot 已删，避免主图出现两次。
              同时是转场落点（data-pt-target）。首屏完整性由 .case-hero 的高度预算保证。 */}
          <figure className="case-hero-fig">
            {liveHero ? (
              // 项目 01 临时主图 = Lab.05 整机活件（用户拍板 2026-07-27 先用活件顶上、07-29 从
              // Lab.04 五环换成整机；与主页预览位同一件，
              // 转场从卡片预览一路缩放落到这里）。作者供图后删掉本分支即回占位。
              // 控制条竖排在右侧（用户拍板 2026-07-28）：横排会把主图变高、撞首屏预算。
              // 转场落点也随之下移到画面盒（ptTarget），否则落点框着控制条那一列，
              // 主页飞过来的画面快照会被拉宽、交接那帧一跳。
              <div className="case-hero case-hero--live">
                {/* HUD 语言跟页面走——主图只能有一份（两份 = 两个 WebGL 上下文），
                    所以它不进 Pick，改由一层客户端壳读语言上下文。 */}
                <CaseHeroLive />
              </div>
            ) : (
              <div className="case-hero" data-pt-target>
                <div
                  className="om-dots"
                  style={{
                    opacity: 0.3,
                    WebkitMaskImage: 'linear-gradient(150deg,#000 0%,transparent 55%)',
                    maskImage: 'linear-gradient(150deg,#000 0%,transparent 55%)',
                  }}
                />
                <div className="om-grain" style={{ opacity: 0.13, mixBlendMode: 'overlay' }} />
                <span
                  style={{
                    position: 'relative',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'oklch(0.90 0.058 124)',
                    textAlign: 'center',
                    padding: '0 16px',
                  }}
                >
                  <Pick en={sc.en.heroLabel} zh={sc.zh.heroLabel} />
                </span>
              </div>
            )}
            {/* 状态小签本身已经写着「待拍摄」，说明文字里不再重复一遍 */}
            <Pick
              en={
                <FigCaption
                  id="Fig. 01"
                  desc={(liveHero && sc.en.heroLive) || sc.en.heroDesc}
                  status="待拍摄"
                  lang="en"
                />
              }
              zh={
                <FigCaption
                  id="图 01"
                  desc={(liveHero && sc.zh.heroLive) || sc.zh.heroDesc}
                  status="待拍摄"
                  lang="zh"
                />
              }
            />
          </figure>

          {/* 编号 section（CSS counter 作用于 .case-body h2）——中英各一棵树，
              两棵都随 RSC 载荷发下来，只有当前语言那棵挂载。
              remark-gfm：正文里的规格表/人格参数表是 GFM 管道表，非 GFM 会原样吐出竖线。 */}
          <div className="case-body">
            <Pick
              en={
                <MDXRemote
                  source={entry.body}
                  components={mdxComponents('en')}
                  options={mdxOptions}
                />
              }
              zh={
                <MDXRemote
                  source={entry.bodyZh ?? entry.body}
                  components={mdxComponents('zh')}
                  options={mdxOptions}
                />
              }
            />
          </div>

          {/* 视频席位（frontmatter 提供 src 前为斜纹占位框，不自动播放）；稿 margin:64px 0 0 */}
          <Pick
            en={
              <VideoSlot
                id="V.60"
                caption={sc.en.video}
                status={entry.video ? '可现产' : '待拍摄'}
                src={entry.video?.src}
                size="wide"
                style={{ margin: '64px 0 0' }}
                lang="en"
              />
            }
            zh={
              <VideoSlot
                id="V.60"
                caption={sc.zh.video}
                status={entry.video ? '可现产' : '待拍摄'}
                src={entry.video?.src}
                size="wide"
                style={{ margin: '64px 0 0' }}
                lang="zh"
              />
            }
          />

          <Pick en={<DisclosureSlot lang="en" />} zh={<DisclosureSlot lang="zh" />} />
        </div>
      </div>
      </CaseLangRoot>
    </>
  );
}
