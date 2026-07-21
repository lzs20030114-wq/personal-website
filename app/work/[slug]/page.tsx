import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { getAllWork, getPublishedWorkBySlug } from '../../../src/lib/site/content';
import {
  ConceptCard,
  ConceptGrid,
  FigSlot,
  IntentNote,
  InteractiveSlot,
  ProcessAside,
  VideoSlot,
} from '../../../components/site/slots';
import { DisclosureSlot, MetaRail } from '../../../components/site/RoleBlock';
import { LinkageFigure } from '../../../components/linkage/LinkageFigure';

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

  return (
    <div className="shell">
      <header style={{ padding: '64px 0 40px', borderBottom: '2px solid var(--ink)' }}>
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
        <aside className="case-rail">
          <MetaRail entry={entry} />
        </aside>

        <div className="min-w-0 lg:pl-14" style={{ paddingTop: 32 }}>
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
  );
}
