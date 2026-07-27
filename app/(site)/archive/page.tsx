import { getLogEntries } from '../../../src/lib/site/log';
import { PageEnter } from '../../../components/site/PageEnter';

export const metadata = { title: 'Work log' };

/**
 * Work log（Log-Modernist 稿）：72px 标头 + 说明；条目行（日期 / lead+正文 / tag 组）。
 * 数据接内容池（src/lib/site/log），条目文案照搬设计稿——路由名不改（仍 /archive）。
 */
export default function ArchivePage() {
  const entries = getLogEntries();
  return (
    <>
      <div className="ground-plane" aria-hidden />
      <PageEnter />
      <div className="shell pg-dark" data-pt-content>
      <header
        className="flex flex-wrap items-baseline justify-between gap-3"
        style={{ padding: '64px 0 40px', borderBottom: 'var(--hair)' }}
      >
        <h1
          style={{
            fontSize: 'clamp(40px, 8vw, 72px)',
            fontWeight: 800,
            lineHeight: 0.98,
            letterSpacing: '-0.02em',
            margin: 0,
            textTransform: 'uppercase',
          }}
        >
          Work log
        </h1>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--n600)',
          }}
        >
          Continuous record · newest first
        </span>
      </header>

      <section>
        {entries.map((e, i) => (
          <div
            key={`${e.date}-${i}`}
            className="grid items-baseline gap-4 md:grid-cols-[180px_1fr_auto] md:gap-8"
            style={{ padding: '24px 0', borderBottom: 'var(--hair)' }}
          >
            <span style={{ fontSize: 22, fontWeight: 800 }}>{e.date.slice(5)}</span>
            <span style={{ fontSize: 15, color: 'var(--n700)' }}>
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{e.lead}</span> {e.body}
            </span>
            <span className="flex gap-1.5">
              {e.tags.map((t) => (
                <span key={t.label} className={`tag tag-${t.variant}`}>
                  {t.label}
                </span>
              ))}
            </span>
          </div>
        ))}
        <p style={{ margin: '32px 0 64px', fontSize: 13, color: 'var(--n600)' }}>
          The log grows over time. Entries link into case studies and lab benches as they land.
        </p>
      </section>
      </div>
    </>
  );
}
