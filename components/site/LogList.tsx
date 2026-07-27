'use client';

import { useEffect, useMemo, useState } from 'react';
// 只取类型：本模块是 'use client'，而 src/lib/site/log 会 import node:fs（服务端读内容池）。
import type { LogBucket, LogEntry, LogLang } from '../../src/lib/site/log';

/**
 * Work log 列表 + 中英切换（用户拍板 2026-07-27）。
 * 服务端只递数据（条目双语两份都在内容池里），语言状态留在客户端——
 * 切换不重取数据、不跳路由，SSR 首帧 = EN。
 *
 * 版式（同日拍板「不要全堆在一起」）：左栏 日期 + 标签，右栏 引句独占一行、正文另起，
 * 正文限宽 66ch；按月分组，月首插一条带标签的发丝线。
 *
 * 项目筛选（用户拍板 2026-07-27）：标头下一行筛选条，默认「全部」= 总览，
 * 点某个项目只看该项目。桶 = outline 标签（MAPPING §8.1），不新开字段。
 */

type Copy = {
  title: string;
  kicker: string;
  foot: string;
  switchLabel: string;
  filterLabel: string;
  all: string;
  showing: (shown: number, total: number) => string;
};

const COPY: Record<LogLang, Copy> = {
  en: {
    title: 'Work log',
    kicker: 'Continuous record · newest first',
    foot: 'The log grows over time. Entries link into case studies and lab benches as they land.',
    switchLabel: 'Language',
    filterLabel: 'Filter by project',
    all: 'All',
    showing: (shown, total) => `Showing ${shown} of ${total} entries`,
  },
  zh: {
    title: '工作日志',
    kicker: '持续记录 · 最新在前',
    foot: '日志持续增补。条目落地后会链入对应的案例页与实验台架。',
    switchLabel: '语言',
    filterLabel: '按项目筛选',
    all: '全部',
    showing: (shown, total) => `显示 ${total} 条中的 ${shown} 条`,
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

/** 条目 + 全池内稳定 id：id 必须与筛选无关，否则筛完之后展开态会串到别的条目上。 */
type Row = { entry: LogEntry; id: string; bucket: string | null };
type Group = { key: string; rows: Row[] };

function groupByMonth(rows: Row[]): Group[] {
  const groups: Group[] = [];
  for (const r of rows) {
    const key = r.entry.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, rows: [r] });
  }
  return groups;
}

const STORE_KEY = 'log-lang';

export function LogList({ entries, buckets }: { entries: LogEntry[]; buckets: LogBucket[] }) {
  // SSR 首帧恒为 EN（静态预渲染，服务端读不到偏好）；挂载后再按上次选择切。
  const [lang, setLang] = useState<LogLang>('en');
  // 项目筛选：null = 总览看全部。不记 localStorage——刷新即回总览，免得下次进来
  // 只看到一个项目还以为条目丢了（语言不同，那是长期偏好）。
  const [bucket, setBucket] = useState<string | null>(null);
  const rows = useMemo<Row[]>(
    () =>
      entries.map((entry, i) => ({
        entry,
        id: `${entry.date}-${i}`, // 下标取自全池，与筛选结果无关
        bucket: entry.tags.find((t) => t.variant === 'outline')?.label.en ?? null,
      })),
    [entries],
  );
  const shown = useMemo(
    () => (bucket === null ? rows : rows.filter((r) => r.bucket === bucket)),
    [rows, bucket],
  );
  const groups = useMemo(() => groupByMonth(shown), [shown]);
  const copy = COPY[lang];

  useEffect(() => {
    try {
      if (localStorage.getItem(STORE_KEY) === 'zh') setLang('zh');
    } catch {
      /* 隐私模式下 localStorage 抛异常——记不住语言不该让整页挂掉 */
    }
  }, []);

  // 展开的条目 id 集合；默认全收起——收起态一屏扫得完，要细节再点开。
  // id 取自全池下标，切筛选不重置（回到「全部」时刚才展开的那条仍是展开的）。
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function pick(next: LogLang) {
    setLang(next);
    try {
      localStorage.setItem(STORE_KEY, next);
    } catch {
      /* 同上 */
    }
  }

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
              onClick={() => pick('en')}
            >
              EN
            </button>
            <button
              type="button"
              className="lang-switch__opt"
              aria-pressed={lang === 'zh'}
              onClick={() => pick('zh')}
            >
              中文
            </button>
          </div>
        </div>
      </header>

      {/* 项目筛选条：全部 + 每个项目桶（桶名与条目左栏的 outline 标签同名同色，点谁看谁）。 */}
      <div
        className="log-filter"
        role="group"
        aria-label={copy.filterLabel}
        lang={lang === 'zh' ? 'zh-Hans' : 'en'}
      >
        <button
          type="button"
          className="log-filter__opt"
          aria-pressed={bucket === null}
          onClick={() => setBucket(null)}
        >
          {copy.all}
          <span className="log-filter__n">{entries.length}</span>
        </button>
        {buckets.map((b) => (
          <button
            key={b.key}
            type="button"
            className="log-filter__opt"
            aria-pressed={bucket === b.key}
            onClick={() => setBucket((prev) => (prev === b.key ? null : b.key))}
          >
            {b.label[lang]}
            <span className="log-filter__n">{b.count}</span>
          </button>
        ))}
        {/* 读数：筛完只剩几条时说明「不是漏了，是筛掉了」；总览态留空占位不出字。 */}
        <span className="log-filter__count" aria-live="polite">
          {bucket === null ? '' : copy.showing(shown.length, entries.length)}
        </span>
      </div>

      <section lang={lang === 'zh' ? 'zh-Hans' : 'en'}>
        {groups.map((g) => (
          <div key={g.key}>
            <h2 className="log-month">{monthLabel(g.key, lang)}</h2>
            {g.rows.map(({ entry: e, id }) => {
              const isOpen = open.has(id);
              return (
                <article key={id} className="log-entry" data-open={isOpen}>
                  <div className="log-entry__meta">
                    <span className="log-entry__date">{e.date.slice(5)}</span>
                    <span className="log-entry__tags">
                      {e.tags.map((t) => (
                        <span key={t.label.en} className={`tag tag-${t.variant}`}>
                          {t.label[lang]}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="log-entry__toggle"
                      aria-expanded={isOpen}
                      aria-controls={`log-panel-${id}`}
                      onClick={() => toggle(id)}
                    >
                      <span className="log-entry__lead">{e.lead[lang]}</span>
                      <span className="log-entry__chev" aria-hidden>
                        <svg viewBox="0 0 16 16" width="14" height="14">
                          <path
                            d="M3 6l5 5 5-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                          />
                        </svg>
                      </span>
                    </button>
                    {/* 详情面板：收起时用 grid 0fr 压扁（内容留在 DOM 里，可被搜索引擎读到）。
                        图 / 表格将来加在正文之后——内容池加可选 blocks 字段，在此按序渲染。 */}
                    <div
                      id={`log-panel-${id}`}
                      className="log-entry__panel"
                      data-open={isOpen}
                      role="region"
                    >
                      <div className="log-entry__panelInner">
                        <p className="log-entry__body" data-lang={lang}>
                          {e.body[lang]}
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ))}
        <p style={{ margin: '40px 0 64px', fontSize: 13, color: 'var(--n600)' }}>{copy.foot}</p>
      </section>
    </>
  );
}
