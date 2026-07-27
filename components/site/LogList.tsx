'use client';

import { useMemo, useState } from 'react';
import type { LogEntry, LogLang } from '../../src/lib/site/log';

/**
 * Work log 列表 + 中英切换（用户拍板 2026-07-27）。
 * 服务端只递数据（条目双语两份都在内容池里），语言状态留在客户端——
 * 切换不重取数据、不跳路由，SSR 首帧 = EN。
 *
 * 版式（同日拍板「不要全堆在一起」）：左栏 日期 + 标签，右栏 引句独占一行、正文另起，
 * 正文限宽 66ch；按月分组，月首插一条带标签的发丝线。
 */

const COPY: Record<LogLang, { title: string; kicker: string; foot: string; switchLabel: string }> =
  {
    en: {
      title: 'Work log',
      kicker: 'Continuous record · newest first',
      foot: 'The log grows over time. Entries link into case studies and lab benches as they land.',
      switchLabel: 'Language',
    },
    zh: {
      title: '工作日志',
      kicker: '持续记录 · 最新在前',
      foot: '日志持续增补。条目落地后会链入对应的案例页与实验台架。',
      switchLabel: '语言',
    },
  };

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** '2026-07' → 'July 2026' / '2026 年 7 月'（不用 Intl：SSR 与客户端 locale 必须一致）。 */
function monthLabel(key: string, lang: LogLang): string {
  const [year, month] = key.split('-');
  const i = Number(month) - 1;
  return lang === 'zh' ? `${year} 年 ${Number(month)} 月` : `${MONTHS_EN[i]} ${year}`;
}

type Group = { key: string; entries: LogEntry[] };

function groupByMonth(entries: LogEntry[]): Group[] {
  const groups: Group[] = [];
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(e);
    else groups.push({ key, entries: [e] });
  }
  return groups;
}

export function LogList({ entries }: { entries: LogEntry[] }) {
  const [lang, setLang] = useState<LogLang>('en');
  const groups = useMemo(() => groupByMonth(entries), [entries]);
  const copy = COPY[lang];

  return (
    <>
      <header
        className="flex flex-wrap items-baseline justify-between gap-3"
        style={{ padding: '64px 0 40px', borderBottom: 'var(--hair)' }}
      >
        <h1
          style={{
            fontSize: 'clamp(40px, 8vw, 72px)',
            fontWeight: 800,
            lineHeight: 0.98,
            letterSpacing: lang === 'zh' ? '0.01em' : '-0.02em',
            margin: 0,
            textTransform: lang === 'zh' ? 'none' : 'uppercase',
          }}
        >
          {copy.title}
        </h1>
        <div className="flex flex-wrap items-center gap-4">
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--n600)',
            }}
          >
            {copy.kicker}
          </span>
          <div className="lang-switch" role="group" aria-label={copy.switchLabel}>
            <span className="lang-switch__thumb" data-at={lang} aria-hidden />
            <button
              type="button"
              className="lang-switch__opt"
              aria-pressed={lang === 'en'}
              onClick={() => setLang('en')}
            >
              EN
            </button>
            <button
              type="button"
              className="lang-switch__opt"
              aria-pressed={lang === 'zh'}
              onClick={() => setLang('zh')}
            >
              中文
            </button>
          </div>
        </div>
      </header>

      <section lang={lang === 'zh' ? 'zh-Hans' : 'en'}>
        {groups.map((g) => (
          <div key={g.key}>
            <h2 className="log-month">{monthLabel(g.key, lang)}</h2>
            {g.entries.map((e, i) => (
              <article key={`${e.date}-${i}`} className="log-entry">
                <div className="log-entry__meta">
                  <span className="log-entry__date">{e.date.slice(5)}</span>
                  <span className="log-entry__tags">
                    {e.tags.map((t) => (
                      <span key={t.label} className={`tag tag-${t.variant}`}>
                        {t.label}
                      </span>
                    ))}
                  </span>
                </div>
                <div>
                  <p className="log-entry__lead">{e.lead[lang]}</p>
                  <p className="log-entry__body" data-lang={lang}>
                    {e.body[lang]}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ))}
        <p style={{ margin: '40px 0 64px', fontSize: 13, color: 'var(--n600)' }}>{copy.foot}</p>
      </section>
    </>
  );
}
