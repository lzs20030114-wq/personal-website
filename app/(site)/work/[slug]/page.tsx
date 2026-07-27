import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { getAllWork, getPublishedWorkBySlug } from '../../../../src/lib/site/content';
import {
  ConceptCard,
  ConceptGrid,
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
      <div className="shell pg-dark" data-pt-content>
      <header style={{ padding: '64px 0 40px', borderBottom: 'var(--hair)' }}>
        <p
          style={{
            margin: '0 0 16px',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--n600)',
          }}
        >
          Case study {caseNo} / 04
        </p>
        <h1
          style={{
            fontSize: 'clamp(36px, 6vw, 72px)',
            fontWeight: 800,
            lineHeight: 0.98,
            letterSpacing: '-0.02em',
            margin: 0,
            textTransform: 'uppercase',
            maxWidth: '16ch',
          }}
        >
          {entry.title}
        </h1>
        <p style={{ fontSize: 19, lineHeight: 1.5, margin: '24px 0 0', maxWidth: '56ch', color: 'var(--n700)' }}>
          {cleanSummary(entry.summary)}
        </p>
      </header>

      <div className="case-layout">
        <aside className="case-rail" style={{ borderRightColor: 'var(--hairline)' }}>
          <MetaRail entry={entry} />
        </aside>

        <div className="min-w-0 lg:pl-14" style={{ paddingTop: 32 }}>
          {/* hero 着陆媒体块（转场落点 data-pt-target；占位待拍摄，MAPPING §5.2 不代写） */}
          {liveHero ? (
            // 项目 01 临时主图 = Lab.04 五环活件（用户拍板 2026-07-27：与主页预览位同一件，
            // 转场从卡片预览一路缩放落到这里）。作者供图后删掉本分支即回占位。
            <figure style={{ margin: '0 0 40px' }}>
              <div className="case-hero case-hero--live" data-pt-target>
                <RingsBench controls={false} />
              </div>
              <figcaption
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--n700)',
                }}
              >
                Fig. 01 — [临时顶替] Lab.04 five-ring shell · live · machine hero 待拍摄
              </figcaption>
            </figure>
          ) : (
            <figure className="case-hero" data-pt-target style={{ margin: '0 0 40px' }}>
              <div
                className="om-dots"
                style={{
                  opacity: 0.3,
                  WebkitMaskImage: 'linear-gradient(150deg,#000 0%,transparent 55%)',
                  maskImage: 'linear-gradient(150deg,#000 0%,transparent 55%)',
                }}
              />
              <div className="om-grain" style={{ opacity: 0.14, mixBlendMode: 'overlay' }} />
              <figcaption
                style={{
                  position: 'relative',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--n700)',
                }}
              >
                Fig. 01 — [待拍摄] machine hero · studio white sweep
              </figcaption>
            </figure>
          )}

          {/* 编号 section 01–06：CSS counter 作用于 .case-body h2（只换模板，MDX 不动） */}
          <div className="case-body">
            <MDXRemote source={entry.body} components={mdxComponents} />
          </div>

          {/* 视频席位（frontmatter 提供 src 前为斜纹占位框，不自动播放） */}
          <VideoSlot
            id="V.60"
            caption="Full cycle: birth → aging → death → rebirth"
            status={entry.video ? '可现产' : '待拍摄'}
            src={entry.video?.src}
            size="wide"
          />

          <DisclosureSlot />
        </div>
      </div>
      </div>
    </>
  );
}
