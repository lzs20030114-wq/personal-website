import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { getAllWork, getPublishedWorkBySlug } from '../../../../src/lib/site/content';
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
} from '../../../../components/site/slots';
import { DisclosureSlot, MetaRail } from '../../../../components/site/RoleBlock';
import { LinkageFigure } from '../../../../components/linkage/LinkageFigure';
import { RingsBench } from '../../../../components/lab/RingsBench';
import { PageEnter } from '../../../../components/site/PageEnter';
import { BackTransition } from '../../../../components/site/BackTransition';

export function generateStaticParams() {
  return getAllWork()
    .filter((w) => w.status === 'published')
    .map((w) => ({ slug: w.slug }));
}

/** 作品路由只允许构建期列出的 published slug；draft/未知 slug 不做按需渲染。 */
export const dynamicParams = false;

/** 去掉作者自留的方括号备注（如 "[summary 草案…]"），仅用于展示。 */
function cleanSummary(s: string): string {
  return s.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getPublishedWorkBySlug(slug);
  if (!entry) notFound();
  return { title: entry.title, description: cleanSummary(entry.summary) };
}

const mdxComponents = {
  FigSlot,
  FigPair,
  VideoSlot,
  InteractiveSlot,
  IntentNote,
  ProcessAside,
  ConceptCard,
  ConceptGrid,
  LinkageFigure,
};

/**
 * case study（Case-Modernist 稿）：全宽 header（kicker + 72px 标题 + summary）→
 * 左 300px sticky 元数据栏（2px 墨竖线）+ 右内容列（编号 section 由 .case-body CSS counter 生成）
 * → V.60 视频席位 → AI disclosure 席位。保持 frontmatter/内容池驱动，只换渲染模板。
 */
export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getPublishedWorkBySlug(slug);
  if (!entry) notFound();

  const caseNo = String(entry.order ?? 1).padStart(2, '0');
  // 主图暂用活台架顶替的项目（与主页预览位同一件；作者供图后删掉这一行即回占位块）
  const liveHero = slug === 'reincarnation-machine';

  return (
    <>
      {/* 深色底铺满视口 + 转场进入段（MAPPING §6.1） */}
      <div className="ground-plane" aria-hidden />
      <PageEnter />
      <BackTransition />
      <div className="shell pg-dark" data-pt-content>
      {/* 版式度量全部走 .case-* 类（globals.css）——首屏要按视口高度压一档，
          内联样式没法被媒体查询接管 */}
      <header className="case-head">
        <p className="case-kicker">Case study {caseNo} / 04</p>
        <h1 className="case-title">{entry.title}</h1>
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
        <p className="case-lede">{cleanSummary(entry.summary)}</p>
      </header>

      <div className="case-layout">
        <aside className="case-rail">
          <MetaRail entry={entry} />
        </aside>

        <div className="case-content min-w-0 lg:pl-14">
          {/* Fig.01 主图（稿：渐变媒体块 + 点阵 + 颗粒 + 框内标签，图注在框外）。
              这一件就是稿里的 Fig.01——MDX 里那条同名 FigSlot 已删，避免主图出现两次。
              同时是转场落点（data-pt-target）。首屏完整性由 .case-hero 的高度预算保证。 */}
          <figure className="case-hero-fig">
            {liveHero ? (
              // 项目 01 临时主图 = Lab.04 五环活件（用户拍板 2026-07-27：与主页预览位同一件，
              // 转场从卡片预览一路缩放落到这里）。作者供图后删掉本分支即回占位。
              // 控制条竖排在右侧（用户拍板 2026-07-28）：横排会把主图变高、撞首屏预算。
              // 转场落点也随之下移到画面盒（ptTarget），否则落点框着控制条那一列，
              // 主页飞过来的画面快照会被拉宽、交接那帧一跳。
              <div className="case-hero case-hero--live">
                <RingsBench sideControls ptTarget lang="en" />
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
                  machine hero photo · studio white sweep · B/W
                </span>
              </div>
            )}
            <FigCaption
              id="Fig. 01"
              desc={
                // 状态小签本身已经写着「待拍摄」，说明文字里不再重复一遍
                liveHero ? '[stand-in] Lab.04 five-ring shell · live' : 'The machine, full view'
              }
              status="待拍摄"
            />
          </figure>

          {/* 编号 section 01–06：CSS counter 作用于 .case-body h2（只换模板，MDX 不动） */}
          <div className="case-body">
            <MDXRemote source={entry.body} components={mdxComponents} />
          </div>

          {/* 视频席位（frontmatter 提供 src 前为斜纹占位框，不自动播放）；稿 margin:64px 0 0 */}
          <VideoSlot
            id="V.60"
            caption="Full cycle: birth → aging → death → rebirth"
            status={entry.video ? '可现产' : '待拍摄'}
            src={entry.video?.src}
            size="wide"
            style={{ margin: '64px 0 0' }}
          />

          <DisclosureSlot />
        </div>
      </div>
      </div>
    </>
  );
}
