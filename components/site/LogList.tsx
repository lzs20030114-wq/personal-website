'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// 只取类型：本模块是 'use client'，而 src/lib/site/log 会 import node:fs（服务端读内容池）。
import type { LogEntry, LogLang } from '../../src/lib/site/log';
import { readStoredLang, storeLang } from '../../src/lib/site/lang';
import {
  aspectFacets,
  aspectOf,
  buildHeatmap,
  heatLevel,
  monthFacets,
  monthLabel,
  monthOf,
  projectFacets,
  projectGroupOf,
  projectOf,
  type Facet,
} from '../../src/lib/site/log-facets';
import { blockCounts, countsLabel } from '../../src/lib/site/log-blocks';
import { LogBody } from './LogBody';

/**
 * Work log 列表 + 中英切换（用户拍板 2026-07-27）。
 * 服务端只递数据（条目双语两份都在内容池里），语言状态留在客户端——
 * 切换不重取数据、不跳路由，SSR 首帧 = EN。
 *
 * 版式（同日拍板「不要全堆在一起」）：左栏 日期 + 标签，右栏 引句独占一行、正文另起，
 * 正文限宽 66ch；按月分组，月首插一条带标签的发丝线。
 *
 * 三级筛选 + 热力图（用户拍板 2026-07-27）：项目 → 方面 → 月份三行下钻，
 * 右侧 GitHub 式日历热力图，点某天跳到那天的条目。三级都从内容池现算
 * （src/lib/site/log-facets，纯函数），不新开字段、不加路由。
 */

type Copy = {
  title: string;
  kicker: string;
  foot: string;
  switchLabel: string;
  filterLabel: string;
  levels: { project: string; aspect: string; month: string };
  all: string;
  showing: (shown: number, total: number) => string;
  clear: string;
  heat: string;
  heatLess: string;
  heatMore: string;
  day: (date: string, n: number) => string;
};

const COPY: Record<LogLang, Copy> = {
  en: {
    title: 'Work log',
    kicker: 'Continuous record · newest first',
    foot: 'The log grows over time. Entries link into case studies and lab benches as they land.',
    switchLabel: 'Language',
    filterLabel: 'Filter entries',
    levels: { project: 'Project', aspect: 'Aspect', month: 'Month' },
    all: 'All',
    showing: (shown, total) => `Showing ${shown} of ${total} entries`,
    clear: 'Clear',
    heat: 'Activity',
    heatLess: 'Less',
    heatMore: 'More',
    day: (date, n) => `${date} — ${n} ${n === 1 ? 'entry' : 'entries'}`,
  },
  zh: {
    title: '工作日志',
    kicker: '持续记录 · 最新在前',
    foot: '日志持续增补。条目落地后会链入对应的案例页与实验台架。',
    switchLabel: '语言',
    filterLabel: '筛选条目',
    levels: { project: '项目', aspect: '方面', month: '时间' },
    all: '全部',
    showing: (shown, total) => `显示 ${total} 条中的 ${shown} 条`,
    clear: '清除',
    heat: '活跃度',
    heatLess: '少',
    heatMore: '多',
    day: (date, n) => `${date} — ${n} 条`,
  },
};

/** 条目 + 全池内稳定 id：id 必须与筛选无关，否则筛完之后展开态会串到别的条目上。 */
type Row = { entry: LogEntry; id: string };
type Group = { key: string; rows: Row[] };

function groupByMonth(rows: Row[]): Group[] {
  const groups: Group[] = [];
  for (const r of rows) {
    const key = monthOf(r.entry);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, rows: [r] });
  }
  return groups;
}

/* 语言偏好与案例页共用一个键（src/lib/site/lang.ts）——对读者来说「我要看中文」
   是一个偏好而不是两个：在这里切了中文，点进案例页不该又变回英文。 */

/**
 * 一行筛选：左侧级别名 + 「全部」+ 各选项（点已选中的 = 取消回该级全部）。
 * `scroll` = 选项装进横向滚轴（月份专用：这一级会随时间无限增长，
 * 平铺换行迟早把整个筛选带撑成一堵墙；「全部」留在轨道外，永远够得着）。
 */
function FacetRow({
  level,
  facets,
  value,
  onPick,
  allLabel,
  allCount,
  lang,
  scroll = false,
}: {
  level: string;
  facets: Facet[];
  value: string | null;
  onPick: (next: string | null) => void;
  allLabel: string;
  allCount: number;
  lang: LogLang;
  scroll?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);

  // 选中项滚进视野（热力图跳转会替你改月份，选中的那格可能在轨道外）。
  // 手动改 scrollLeft，不用 scrollIntoView——后者会连带把整页竖着滚一下。
  // 位置用 getBoundingClientRect 相减，不用 offsetLeft：offsetLeft 是相对
  // 最近的定位祖先算的，轨道自己没定位时会量到外层容器上去。
  useEffect(() => {
    const el = track.current;
    if (!el || value === null) return;
    const chip = el.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!chip) return;
    const box = el.getBoundingClientRect();
    const at = chip.getBoundingClientRect();
    el.scrollLeft += at.left - box.left - (box.width - at.width) / 2;
  }, [value]);

  const opts = facets.map((f) => (
    <button
      key={f.key}
      type="button"
      className="log-filter__opt"
      aria-pressed={value === f.key}
      // 该项在当前上层筛选下为空：留在原位但不可点，免得整行随下钻跳来跳去
      disabled={f.count === 0 && value !== f.key}
      onClick={() => onPick(value === f.key ? null : f.key)}
    >
      {(scroll ? (f.short ?? f.label) : f.label)[lang]}
      <span className="log-filter__n">{f.count}</span>
    </button>
  ));

  return (
    <div className="log-facet" role="group" aria-label={level}>
      <span className="log-facet__level">{level}</span>
      <div className="log-facet__opts" data-scroll={scroll}>
        <button
          type="button"
          className="log-filter__opt"
          aria-pressed={value === null}
          onClick={() => onPick(null)}
        >
          {allLabel}
          <span className="log-filter__n">{allCount}</span>
        </button>
        {scroll ? (
          <div className="log-facet__track" ref={track} tabIndex={-1}>
            {opts}
          </div>
        ) : (
          opts
        )}
      </div>
    </div>
  );
}

/**
 * 条目行右端的附件角标（2026-07-29）：这条挂了几张图、几张表，收起态就看得见。
 * 数字与展开后右栏列出来的是同一份计数（src/lib/site/log-blocks）。
 * 整块是条目按钮的一部分——点它 = 展开这条，不另做一个交互对象。
 */
function Marks({ blocks, lang }: { blocks?: LogEntry['blocks']; lang: LogLang }) {
  const counts = blockCounts(blocks);
  if (counts.total === 0) return null;
  const label = countsLabel(counts)[lang];
  return (
    <span className="log-marks" role="img" aria-label={label} title={label}>
      {counts.images > 0 && (
        <span className="log-mark">
          <svg viewBox="0 0 16 12" width="16" height="12" aria-hidden focusable="false">
            <rect x="0.5" y="0.5" width="15" height="11" fill="none" stroke="currentColor" />
            <path d="M0.5 9L5 5l3.5 3L11 6l4.5 4" fill="none" stroke="currentColor" />
            <circle cx="11" cy="3.4" r="1.3" fill="currentColor" />
          </svg>
          {counts.images}
        </span>
      )}
      {counts.tables > 0 && (
        <span className="log-mark">
          <svg viewBox="0 0 16 12" width="16" height="12" aria-hidden focusable="false">
            <rect x="0.5" y="0.5" width="15" height="11" fill="none" stroke="currentColor" />
            <path
              d="M0.5 4h15M0.5 8h15M5.5 0.5v11M10.5 0.5v11"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.6"
            />
            <rect x="0.5" y="0.5" width="15" height="3.5" fill="currentColor" fillOpacity="0.2" />
          </svg>
          {counts.tables}
        </span>
      )}
    </span>
  );
}

export function LogList({ entries }: { entries: LogEntry[] }) {
  // SSR 首帧恒为 EN（静态预渲染，服务端读不到偏好）；挂载后再按上次选择切。
  const [lang, setLang] = useState<LogLang>('en');
  // 三级筛选，null = 该级不限。都不记 localStorage——刷新即回总览，免得下次进来
  // 只看到一小撮条目还以为丢了（语言不同，那是长期偏好）。
  const [project, setProject] = useState<string | null>(null);
  const [aspect, setAspect] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const copy = COPY[lang];

  const rows = useMemo<Row[]>(
    // 下标取自全池，与筛选结果无关
    () => entries.map((entry, i) => ({ entry, id: `${entry.date}-${i}` })),
    [entries],
  );

  const match = useCallback(
    (e: LogEntry, p: string | null, a: string | null, m: string | null) =>
      (p === null || projectOf(e) === p) &&
      (a === null || aspectOf(e) === a) &&
      (m === null || monthOf(e) === m),
    [],
  );

  const shown = useMemo(
    () => rows.filter((r) => match(r.entry, project, aspect, month)),
    [rows, match, project, aspect, month],
  );
  const groups = useMemo(() => groupByMonth(shown), [shown]);

  // 每级的选项按「另外两级已选」现算（faceted search 惯例）：数字就是点下去会剩几条。
  const facets = useMemo(() => {
    const forLevel = (skip: 'p' | 'a' | 'm') =>
      entries.filter((e) =>
        match(e, skip === 'p' ? null : project, skip === 'a' ? null : aspect, skip === 'm' ? null : month),
      );
    const p = forLevel('p');
    const a = forLevel('a');
    const m = forLevel('m');
    // 全集决定「有哪些项」（选项不随下钻消失，只是计数归零变灰），当前子集决定计数
    const merge = (all: Facet[], sub: Facet[]) => {
      const counts = new Map(sub.map((f) => [f.key, f.count]));
      return all.map((f) => ({ ...f, count: counts.get(f.key) ?? 0 }));
    };
    return {
      projects: merge(projectFacets(entries), projectFacets(p)),
      aspects: merge(aspectFacets(entries), aspectFacets(a)),
      months: merge(monthFacets(entries), monthFacets(m)),
      counts: { p: p.length, a: a.length, m: m.length },
    };
  }, [entries, match, project, aspect, month]);

  // 热力图按「项目 + 方面」算（月份那一维正是热力图自己在表达，不该再拿它裁自己）；
  // 值域恒为全池，筛选只改格子深浅——网格不缩，右侧版面不跳。
  const heat = useMemo(
    () => buildHeatmap(entries.filter((e) => match(e, project, aspect, null)), entries),
    [entries, match, project, aspect],
  );

  useEffect(() => {
    const stored = readStoredLang();
    if (stored) setLang(stored);
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
    storeLang(next);
  }

  /* 热力图跳转：点某天 → 滚到那天的第一条并闪一下。
     热力图本身已按项目+方面筛过，所以唯一可能挡住目标的是月份那一级——
     把月份切到目标所在月即可，不粗暴清空用户的其余选择。 */
  /* 带序号：只存日期的话，连点同一格第二次 setState 值没变 → 不重渲染 → 下面的
     effect 不重跑 → 既不滚也不闪（要等 1.6s 归零后才又能点）。同一格点两下是很自然的
     动作，所以每次跳转自增一个序号，保证状态必变。 */
  const [flash, setFlash] = useState<{ date: string; seq: number } | null>(null);
  const listRef = useRef<HTMLElement>(null);

  function jumpTo(date: string) {
    if (month !== null && month !== date.slice(0, 7)) setMonth(date.slice(0, 7));
    setFlash((prev) => ({ date, seq: (prev?.seq ?? 0) + 1 }));
  }

  useEffect(() => {
    if (flash === null) return;
    const el = listRef.current?.querySelector(`[data-date="${flash.date}"]`);
    if (el) {
      const reduce =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
    const t = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const filtered = project !== null || aspect !== null || month !== null;

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

      {/* 筛选带：左三行下钻（项目 → 方面 → 月份），右热力图。<1100px 热力图落到下面。 */}
      <div className="log-band" lang={lang === 'zh' ? 'zh-Hans' : 'en'}>
        <div className="log-band__filters" role="group" aria-label={copy.filterLabel}>
          <FacetRow
            level={copy.levels.project}
            facets={facets.projects}
            value={project}
            onPick={setProject}
            allLabel={copy.all}
            allCount={facets.counts.p}
            lang={lang}
          />
          <FacetRow
            level={copy.levels.aspect}
            facets={facets.aspects}
            value={aspect}
            onPick={setAspect}
            allLabel={copy.all}
            allCount={facets.counts.a}
            lang={lang}
          />
          <FacetRow
            level={copy.levels.month}
            facets={facets.months}
            value={month}
            onPick={setMonth}
            allLabel={copy.all}
            allCount={facets.counts.m}
            lang={lang}
            scroll
          />
          {/* 读数：筛完只剩几条时说明「不是漏了，是筛掉了」；总览态留空占位不出字。 */}
          <div className="log-band__readout">
            <span aria-live="polite">
              {filtered ? copy.showing(shown.length, entries.length) : ''}
            </span>
            {filtered && (
              <button
                type="button"
                className="log-band__clear"
                onClick={() => {
                  setProject(null);
                  setAspect(null);
                  setMonth(null);
                }}
              >
                {copy.clear}
              </button>
            )}
          </div>
        </div>

        {/* 日历热力图（列 = 周，行 = 周日→周六）。值域 = 首条到末条，不铺满一年。 */}
        <figure className="log-heat">
          <figcaption className="log-heat__title">{copy.heat}</figcaption>
          <div className="log-heat__scroll">
            <div className="log-heat__months" aria-hidden>
              {heat.months.map((m) => (
                <span key={m.index} style={{ gridColumn: m.index + 1 }}>
                  {m.label[lang]}
                </span>
              ))}
            </div>
            <div className="log-heat__grid">
              {heat.weeks.map((week, wi) => (
                <div className="log-heat__week" key={wi}>
                  {week.map((day, di) =>
                    day === null ? (
                      <span key={di} className="log-heat__cell" data-level="void" aria-hidden />
                    ) : day.count === 0 ? (
                      <span
                        key={di}
                        className="log-heat__cell"
                        data-level={0}
                        title={copy.day(day.date, 0)}
                      />
                    ) : (
                      <button
                        key={di}
                        type="button"
                        className="log-heat__cell"
                        data-level={heatLevel(day.count, heat.max)}
                        data-dim={month !== null && month !== day.date.slice(0, 7)}
                        title={copy.day(day.date, day.count)}
                        aria-label={copy.day(day.date, day.count)}
                        onClick={() => jumpTo(day.date)}
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="log-heat__legend" aria-hidden>
            <span>{copy.heatLess}</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className="log-heat__cell" data-level={l} />
            ))}
            <span>{copy.heatMore}</span>
          </div>
        </figure>
      </div>

      <section lang={lang === 'zh' ? 'zh-Hans' : 'en'} ref={listRef}>
        {groups.map((g) => (
          <div key={g.key}>
            <h2 className="log-month">{monthLabel(g.key)[lang]}</h2>
            {g.rows.map(({ entry: e, id }) => {
              const isOpen = open.has(id);
              const group = projectGroupOf(e);
              return (
                <article
                  key={id}
                  className="log-entry"
                  data-open={isOpen}
                  data-date={e.date}
                  data-flash={flash?.date === e.date}
                >
                  <div className="log-entry__meta">
                    {/* 项目标记（用户拍板 2026-07-29「每一条都要标注属于哪个项目」）：
                        标签说的是「哪一类工作」（Machine / Lab…），项目说的是「哪个项目」，
                        两者不同名（log-facets §PROJECT_GROUPS）——所以项目要自己写出来。
                        点它 = 只看这个项目，与上面筛选条的一级是同一个状态。 */}
                    {group && (
                      <button
                        type="button"
                        className="log-entry__project"
                        aria-pressed={project === group.key}
                        title={group.label[lang]}
                        onClick={() => setProject(project === group.key ? null : group.key)}
                      >
                        {group.short[lang]}
                      </button>
                    )}
                    <span className="log-entry__date">{e.date.slice(5)}</span>
                    <span className="log-entry__tags">
                      {e.tags.map((t) => (
                        <span key={t.label.en} className={`tag tag-${t.variant}`}>
                          {t.label[lang]}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="log-entry__main">
                    <button
                      type="button"
                      className="log-entry__toggle"
                      aria-expanded={isOpen}
                      aria-controls={`log-panel-${id}`}
                      onClick={() => toggle(id)}
                    >
                      <span className="log-entry__lead">{e.lead[lang]}</span>
                      <Marks blocks={e.blocks} lang={lang} />
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
                        正文（受限 Markdown）+ 图 / 表块都由 LogBody 渲染——与 /studio 预览同一段代码。 */}
                    <div
                      id={`log-panel-${id}`}
                      className="log-entry__panel"
                      data-open={isOpen}
                      role="region"
                    >
                      <div className="log-entry__panelInner">
                        <LogBody body={e.body[lang]} blocks={e.blocks} lang={lang} />
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
