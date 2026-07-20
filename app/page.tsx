import Link from 'next/link';
import { LinkageFigure } from '../components/linkage/LinkageFigure';
import { getSelectedWork } from '../src/lib/site/content';

/**
 * 主页（版式 v2，SITE_SPEC §8；2026-07-20 Modernist 试点）：hero 分屏（文 + FIG.01
 * 左右分置）；四项目索引 = Modernist 表格语法（栏头 2px 强线 + 行级 1px 线）。
 * hero = 封面不 = 目录，文案不围绕连杆解说。IA 不动，只换皮肤。
 */
export default function Home() {
  const selected = getSelectedWork();
  return (
    <div className="sheet">
      {/* Hero 分屏：左文右图（<1024px 回落为上下） */}
      <section className="my-12 grid items-center gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="text-base leading-relaxed" style={{ color: 'var(--graphite)' }}>
            [一句定位 · 占位，作者撰写]
          </p>
        </div>
        <figure>
          {/* FIG.01：签名件是通往 case study 的门，不承担目录角色。 */}
          <div className="figframe" style={{ aspectRatio: '700/520' }}>
            <LinkageFigure />
          </div>
          <figcaption className="kicker mt-2 flex items-baseline justify-between gap-4">
            <span style={{ color: 'var(--graphite)' }}>
              FIG. 01 — structural study for Reincarnation Machine
            </span>
            <Link href="/work/reincarnation-machine" className="whitespace-nowrap no-underline" style={{ color: 'var(--accent-700)' }}>
              → case study
            </Link>
          </figcaption>
        </figure>
      </section>

      {/* 四项目索引：图纸清单（编号 / 标题 / 摘要 / 年月），结构地位同等 */}
      <section className="mt-20">
        <h2 className="kicker mb-3" style={{ color: 'var(--accent-700)' }}>
          SELECTED WORK
        </h2>
        <ul className="rule2-t m-0 list-none p-0">
          {selected.map((w, i) => {
            const no = String(i + 1).padStart(2, '0');
            const row = (
              <div className="grid items-baseline gap-6 py-4 md:grid-cols-[3.5rem_18rem_1fr_6rem]">
                <span className="kicker" style={{ color: 'var(--graphite)' }}>
                  {no}
                </span>
                <span
                  className="text-lg font-extrabold tracking-tight"
                  style={w.status !== 'published' ? { color: 'var(--graphite)' } : undefined}
                >
                  {w.title}
                </span>
                <span className="hidden text-sm md:block" style={{ color: 'var(--graphite)' }}>
                  {w.summary}
                </span>
                <span className="kicker text-right" style={{ color: 'var(--graphite)' }}>
                  {w.status === 'published' ? w.date : '待盘点'}
                </span>
              </div>
            );
            return (
              <li key={w.slug} className="hairline-b">
                {w.status === 'published' ? (
                  <Link href={`/work/${w.slug}`} className="row-hover block no-underline">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
