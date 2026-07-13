import Link from 'next/link';
import { LinkageFigure } from '../components/linkage/LinkageFigure';
import { getSelectedWork } from '../src/lib/site/content';

/**
 * 主页（版式 v2，SITE_SPEC §8）：hero 分屏（文 + FIG.01 左右分置）；
 * 四项目索引 = 图纸清单式多列行。hero = 封面不 = 目录，文案不围绕连杆解说。
 */
export default function Home() {
  const selected = getSelectedWork();
  return (
    <div className="sheet">
      {/* Hero 分屏：左文右图（<1024px 回落为上下） */}
      <section className="my-12 grid items-center gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="mono text-sm leading-relaxed" style={{ color: 'var(--graphite)' }}>
            [一句定位 · 占位，作者撰写]
          </p>
        </div>
        <figure>
          {/* FIG.01：签名件是通往 case study 的门，不承担目录角色。 */}
          <div className="figframe" style={{ aspectRatio: '700/520' }}>
            <LinkageFigure />
          </div>
          <figcaption
            className="mono mt-2 flex items-baseline justify-between text-xs"
            style={{ color: 'var(--graphite)' }}
          >
            <span>FIG. 01 — structural study for Reincarnation Machine</span>
            <Link href="/work/reincarnation-machine" style={{ color: 'var(--trace-blue)' }}>
              → case study
            </Link>
          </figcaption>
        </figure>
      </section>

      {/* 四项目索引：图纸清单（编号 / 标题 / 摘要 / 年月），结构地位同等 */}
      <section className="mt-20">
        <h2 className="mono mb-3 text-[10px] tracking-widest" style={{ color: 'var(--graphite)' }}>
          SELECTED WORK
        </h2>
        <ul className="m-0 list-none p-0">
          {selected.map((w, i) => {
            const no = String(i + 1).padStart(2, '0');
            const row = (
              <div className="grid items-baseline gap-6 py-4 md:grid-cols-[3.5rem_18rem_1fr_6rem]">
                <span className="mono text-xs" style={{ color: 'var(--graphite)' }}>
                  {no}
                </span>
                <span className="text-lg" style={w.status !== 'published' ? { color: 'var(--graphite)' } : undefined}>
                  {w.title}
                </span>
                <span className="hidden text-sm md:block" style={{ color: 'var(--graphite)' }}>
                  {w.summary}
                </span>
                <span className="mono text-right text-xs" style={{ color: 'var(--graphite)' }}>
                  {w.status === 'published' ? w.date : '待盘点'}
                </span>
              </div>
            );
            return (
              <li key={w.slug} className="hairline-t">
                {w.status === 'published' ? (
                  <Link href={`/work/${w.slug}`} className="block no-underline">
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
