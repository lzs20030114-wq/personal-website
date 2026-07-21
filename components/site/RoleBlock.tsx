import type { WorkEntry } from '../../src/lib/site/content';

const RAIL_LABEL = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  marginBottom: 8,
};

/**
 * 左侧粘性元数据栏（Case-Modernist 稿）：My role / Date / Tools，右侧 2px 墨色竖线（.case-rail）。
 * My Role 首屏可见（跨校硬要求，ADMISSIONS_RESEARCH §三.1），滚动时常驻。
 */
export function MetaRail({ entry }: { entry: WorkEntry }) {
  const label = (t: string) => <div style={RAIL_LABEL}>{t}</div>;
  return (
    <div className="flex flex-col" style={{ gap: 24, fontSize: 14 }}>
      <div>
        {label('My role')}
        <div className="flex flex-col" style={{ gap: 4 }}>
          {entry.role.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </div>
      </div>
      <div>
        {label('Date')}
        {entry.date}
      </div>
      {entry.credits && entry.credits.length > 0 && (
        <div>
          {label('Credits')}
          <div className="flex flex-col" style={{ gap: 4 }}>
            {entry.credits.map((c) => (
              <span key={c.name}>
                {c.name} — {c.role}
              </span>
            ))}
          </div>
        </div>
      )}
      <div>
        {label('Tools')}
        <div style={{ color: 'var(--n700)' }}>{entry.tools?.join(' · ') ?? '—'}</div>
      </div>
    </div>
  );
}

/** AI 披露席位（SITE_SPEC §9：v1 留插槽，文字由作者按 AI_DISCLOSURE.md 流程撰写）。 */
export function DisclosureSlot() {
  return (
    <section
      style={{
        borderTop: '2px solid var(--ink)',
        marginTop: 64,
        padding: '16px 0 64px',
        fontSize: 13,
        color: 'var(--n700)',
        maxWidth: '62ch',
      }}
    >
      <span
        style={{
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
        }}
      >
        AI disclosure — slot
      </span>{' '}
      — 披露声明由作者撰写（见 AI_DISCLOSURE.md 行动项），此处为固定席位。
    </section>
  );
}
