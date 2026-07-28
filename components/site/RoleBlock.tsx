import type { WorkEntry } from '../../src/lib/site/content';
import type { SlotLang } from './slots';

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
export function MetaRail({ entry, lang = 'en' }: { entry: WorkEntry; lang?: SlotLang }) {
  const label = (t: string) => <div style={RAIL_LABEL}>{t}</div>;
  const zh = lang === 'zh';
  // 中文侧的角色/工具取 frontmatter 的 zh 块；没有（draft 条目）就退回英文，不留空栏。
  const role = (zh && entry.zh?.role) || entry.role;
  const tools = (zh && entry.zh?.tools) || entry.tools;
  return (
    <div className="flex flex-col" style={{ gap: 24, fontSize: 14 }}>
      <div>
        {label(zh ? '我的角色' : 'My role')}
        <div className="flex flex-col" style={{ gap: 4 }}>
          {role.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </div>
      </div>
      <div>
        {label(zh ? '时间' : 'Date')}
        {entry.date}
      </div>
      {entry.credits && entry.credits.length > 0 && (
        <div>
          {label(zh ? '协作' : 'Credits')}
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
        {label(zh ? '工具' : 'Tools')}
        <div style={{ color: 'var(--n700)' }}>{tools?.join(' · ') ?? '—'}</div>
      </div>
    </div>
  );
}

/** AI 披露席位（SITE_SPEC §9：v1 留插槽，文字由作者按 AI_DISCLOSURE.md 流程撰写）。 */
export function DisclosureSlot({ lang = 'en' }: { lang?: SlotLang }) {
  return (
    <section
      style={{
        borderTop: 'var(--hair)',
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
        {lang === 'zh' ? 'AI 披露 — 席位' : 'AI disclosure — slot'}
      </span>{' '}
      — 披露声明由作者撰写（见 AI_DISCLOSURE.md 行动项），此处为固定席位。
    </section>
  );
}
