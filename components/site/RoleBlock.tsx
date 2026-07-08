import type { WorkEntry } from '../../src/lib/site/content';

/** My Role 块——跨校硬要求，首屏可见（SITE_SPEC §9 / ADMISSIONS_RESEARCH §三.1）。 */
export function RoleBlock({ entry }: { entry: WorkEntry }) {
  return (
    <section className="hairline-t mt-6 pt-4">
      <div className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <div className="mono mb-1 text-[10px] tracking-widest" style={{ color: 'var(--graphite)' }}>
            MY ROLE
          </div>
          <ul className="list-none space-y-0.5 p-0">
            {entry.role.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mono mb-1 text-[10px] tracking-widest" style={{ color: 'var(--graphite)' }}>
            DATE
          </div>
          {entry.date}
          {entry.credits && entry.credits.length > 0 && (
            <>
              <div
                className="mono mt-3 mb-1 text-[10px] tracking-widest"
                style={{ color: 'var(--graphite)' }}
              >
                CREDITS
              </div>
              <ul className="list-none space-y-0.5 p-0">
                {entry.credits.map((c) => (
                  <li key={c.name}>
                    {c.name} — {c.role}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div>
          <div className="mono mb-1 text-[10px] tracking-widest" style={{ color: 'var(--graphite)' }}>
            TOOLS
          </div>
          {entry.tools?.join(' · ') ?? '—'}
        </div>
      </div>
    </section>
  );
}

/** AI 披露席位（SITE_SPEC §9：v1 留插槽，文字由作者按 AI_DISCLOSURE.md 流程撰写）。 */
export function DisclosureSlot() {
  return (
    <section className="hairline-t mono mt-16 pt-4 text-xs" style={{ color: 'var(--graphite)' }}>
      <span style={{ color: 'var(--trace-blue)' }}>AI DISCLOSURE · 席位</span> —
      披露声明由作者撰写（见 AI_DISCLOSURE.md 行动项），此处为固定席位。
    </section>
  );
}
