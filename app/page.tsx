import Link from 'next/link';
import { getSelectedWork } from '../src/lib/site/content';

/**
 * 主页（CLAUDE.md 定位与边界）：hero 机构 = 封面不 = 目录；极简文字；
 * 四项目结构地位同等；文案不围绕连杆长篇解说。
 */
export default function Home() {
  const selected = getSelectedWork();
  return (
    <div className="prose-col">
      {/* 一句定位——占位，作者撰写 */}
      <p className="mono my-10 text-sm" style={{ color: 'var(--graphite)' }}>
        [一句定位 · 占位，作者撰写]
      </p>

      {/* FIG.01 hero：连杆签名件，M3 完成后由 LinkageFigure 挂入（SITE_SPEC §7）。
          题栏含入口链入轮回机器 case study——hero 是门，不是神龛。 */}
      <figure className="my-10">
        <div className="figframe flex items-center justify-center" style={{ aspectRatio: '700/520' }}>
          <span className="mono text-xs" style={{ color: 'var(--trace-blue)' }}>
            FIG. 01 · interactive linkage · M3 后挂入
          </span>
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

      {/* 四项目索引：结构地位同等 */}
      <section className="mt-16">
        <h2 className="mono mb-4 text-[10px] tracking-widest" style={{ color: 'var(--graphite)' }}>
          SELECTED WORK
        </h2>
        <ul className="m-0 list-none space-y-0 p-0">
          {selected.map((w) => (
            <li key={w.slug} className="hairline-t py-4">
              {w.status === 'published' ? (
                <Link href={`/work/${w.slug}`} className="group block no-underline">
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg">{w.title}</span>
                    <span className="mono text-xs" style={{ color: 'var(--graphite)' }}>
                      {w.date}
                    </span>
                  </div>
                  <p className="mt-1 text-sm" style={{ color: 'var(--graphite)' }}>
                    {w.summary}
                  </p>
                </Link>
              ) : (
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg" style={{ color: 'var(--graphite)' }}>
                      {w.title}
                    </span>
                    <span className="mono text-xs" style={{ color: 'var(--graphite)' }}>
                      待盘点
                    </span>
                  </div>
                  <p className="mt-1 text-sm" style={{ color: 'var(--graphite)' }}>
                    {w.summary}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
