import type { WorkEntry } from '../../src/lib/site/content';

/**
 * 左侧粘性元数据栏（版式 v2，SITE_SPEC §8）：My Role 首屏可见的载体
 * （跨校硬要求，ADMISSIONS_RESEARCH §三.1），滚动时常驻。
 */
export function MetaRail({ entry }: { entry: WorkEntry }) {
  const label = (t: string) => (
    <div className="mono mb-1 mt-5 text-[10px] tracking-widest first:mt-0" style={{ color: 'var(--graphite)' }}>
      {t}
    </div>
  );
  return (
    <div className="text-sm">
      {label('MY ROLE')}
      <ul className="list-none space-y-0.5 p-0">
        {entry.role.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {label('DATE')}
      {entry.date}
      {entry.credits && entry.credits.length > 0 && (
        <>
          {label('CREDITS')}
          <ul className="list-none space-y-0.5 p-0">
            {entry.credits.map((c) => (
              <li key={c.name}>
                {c.name} — {c.role}
              </li>
            ))}
          </ul>
        </>
      )}
      {label('TOOLS')}
      <div style={{ color: 'var(--graphite)' }}>{entry.tools?.join(' · ') ?? '—'}</div>
    </div>
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
