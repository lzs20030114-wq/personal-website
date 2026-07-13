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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getPublishedWorkBySlug(slug);
  if (!entry) notFound();
  return { title: entry.title, description: entry.summary };
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

/** case study 三区（版式 v2）：左粘性元数据栏 + 正文列（66ch flush-left）+ 边缘列。 */
export default async function WorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getPublishedWorkBySlug(slug);
  if (!entry) notFound();

  return (
    <div className="sheet">
      <article className="case-layout mt-10">
        <aside className="case-rail">
          <MetaRail entry={entry} />
        </aside>

        <div className="flow">
          <header>
            <h1 className="text-3xl leading-tight">{entry.title}</h1>
            <p className="mt-3 text-base" style={{ color: 'var(--graphite)' }}>
              {entry.summary}
            </p>
          </header>

          <MDXRemote source={entry.body} components={mdxComponents} />

          {/* 视频席位（frontmatter 提供 src 前为占位框，不自动播放） */}
          <VideoSlot
            id="V.60"
            caption="60s demonstration — 结构见 60s 视频骨架"
            status={entry.video ? '可现产' : '待拍摄'}
            src={entry.video?.src}
            size="wide"
          />

          <DisclosureSlot />
        </div>
      </article>
    </div>
  );
}
