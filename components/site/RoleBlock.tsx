import type { SlotLang } from './slots';

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
