import { getArchiveWork } from '../../src/lib/site/content';

export const metadata = { title: 'Archive' };

/** Archive：结构就绪、允许长期为空——申请季前不为凑数填内容（SITE_SPEC §4）。 */
export default function ArchivePage() {
  const entries = getArchiveWork();
  return (
    <div className="prose-col">
      <h1 className="mono mt-10 text-[10px] tracking-widest" style={{ color: 'var(--graphite)' }}>
        ARCHIVE
      </h1>
      {entries.length === 0 ? (
        <p className="mt-6 text-sm" style={{ color: 'var(--graphite)' }}>
          The archive grows over time.
        </p>
      ) : (
        <ul className="m-0 mt-6 list-none space-y-0 p-0">
          {entries.map((w) => (
            <li key={w.slug} className="hairline-t flex items-baseline justify-between py-3">
              <span>{w.title}</span>
              <span className="mono text-xs" style={{ color: 'var(--graphite)' }}>
                {w.date}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
