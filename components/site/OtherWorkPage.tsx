import '../../app/(site)/work/[slug]/case-dark.css';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { getOtherWorkPages, type OtherWorkPage as Entry } from '../../src/lib/site/other-works';
import { CaseFooter } from '../lab/LabShell';
import { Pick } from './CaseLang';
import { CaseReveal } from './case/CaseReveal';

/**
 * 其他作品详情页（用户拍板 2026-10-25「先做详情页」；MAPPING §59）。
 *
 * 挂在 /work/<slug>，与主项目同一条路由、同一套深色外壳（「筹备中」页的做法：全部复用 .cs-* 类），
 * 所以首页卡片「展开成详情页 / 收回到卡片」的转场、顶栏的 EN / 中切换都不用另写。
 * 不套案例页模板（SITE_SPEC §4）：没有目录栏、视频席位、AI 披露席位，也不算进「案例 0N / 03」。
 *
 * 页面上的字只有三种：源文件上的署名、源文件里的说明原文（另一种语言是站方译文，页尾标明）、
 * 站方写的图注。数据全在 content/other/works.json。
 */

const COPY = {
  en: {
    back: '← All work',
    kicker: (g: string) => `Other work · ${g}`,
    year: 'Year',
    context: 'Context',
    recognition: 'Recognition',
    statement: 'Statement',
    images: 'Drawings and images',
    original: 'Original text',
    translated: 'Translated from the Chinese original',
    source: 'Source: ',
    open: 'Open full size ↗',
    fig: (n: number) => `Fig. ${String(n).padStart(2, '0')}`,
    next: (g: string) => `Next · ${g}`,
    footer: (t: string, y: string) => `Other work · ${t} · ${y}`,
  },
  zh: {
    back: '← 全部作品',
    kicker: (g: string) => `其他作品 · ${g}`,
    year: '时间',
    context: '背景',
    recognition: '记录',
    statement: '设计说明',
    images: '图纸与图像',
    original: '原文',
    translated: '站方译自英文原文',
    source: '出处：',
    open: '查看原图 ↗',
    fig: (n: number) => `图 ${String(n).padStart(2, '0')}`,
    next: (g: string) => `下一件 · ${g}`,
    footer: (t: string, y: string) => `其他作品 · ${t} · ${y}`,
  },
} as const;

type Lang = keyof typeof COPY;

/** 竖长的图不撑满整列：高度封在一屏以内，宽度随之按比例收（框比例 = 图比例，不留边） */
const figStyle = (w: number, h: number): CSSProperties => ({
  width: `min(100%, calc(84svh * ${(w / h).toFixed(4)}))`,
});

function Meta({ entry, lang }: { entry: Entry; lang: Lang }) {
  const { work } = entry;
  const c = COPY[lang];
  const zh = lang === 'zh';
  const context = (zh && work.zh?.context) || work.context;
  const credits = work.page.credits ?? [];
  const recognition = work.page.recognition ?? [];
  return (
    <dl className="cs-meta" data-rv>
      <div>
        <dt>{c.context}</dt>
        <dd>
          {context.split(' · ').map((s) => (
            <span key={s}>{s}</span>
          ))}
        </dd>
      </div>
      <div className="cs-meta__rest">
        <div>
          <dt>{c.year}</dt>
          <dd>{work.year}</dd>
        </div>
        {credits.map((cr) => (
          <div key={cr.role.en}>
            <dt>{cr.role[lang]}</dt>
            <dd>
              {cr.names.map((n) => (
                <span key={n.en}>{n[lang]}</span>
              ))}
            </dd>
          </div>
        ))}
        {recognition.length > 0 ? (
          <div>
            <dt>{c.recognition}</dt>
            <dd>
              {recognition.map((r) => (
                <span key={r.en}>{r[lang]}</span>
              ))}
            </dd>
          </div>
        ) : null}
      </div>
    </dl>
  );
}

function Body({ entry, lang }: { entry: Entry; lang: Lang }) {
  const { work } = entry;
  const c = COPY[lang];
  const st = work.page.statement;
  return (
    <>
      {st ? (
        <>
          <h2>{st.label?.[lang] ?? c.statement}</h2>
          {st[lang].map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="os-note">
            {st.original === lang ? c.original : c.translated}
            {' · '}
            {c.source}
            {st.source[lang]}
          </p>
        </>
      ) : null}
      <h2>{c.images}</h2>
      {work.page.figures.map((f, i) => (
        <figure key={`${f.src}-${i}`} className="cs-figure os-figure" style={figStyle(f.width, f.height)}>
          <a
            className="cs-figure__frame cs-figure__frame--shot os-zoom"
            style={{ aspectRatio: `${f.width} / ${f.height}` }}
            href={f.src}
            target="_blank"
            rel="noopener"
            aria-label={`${f.caption[lang]} · ${c.open}`}
          >
            <img
              className="cs-figure__img"
              src={f.src}
              alt={f.caption[lang]}
              width={f.width}
              height={f.height}
              loading="lazy"
              decoding="async"
            />
          </a>
          <figcaption>
            <span className="cs-cap__id">{c.fig(i + 2)}</span>
            <span className="cs-cap__t">
              <span className="cs-cap__cap">{f.caption[lang]}</span>
            </span>
          </figcaption>
        </figure>
      ))}
    </>
  );
}

export function OtherWorkPage({ entry }: { entry: Entry }) {
  const { work, group } = entry;
  const all = getOtherWorkPages();
  const next = all[all.findIndex((p) => p.work.slug === work.slug) + 1];
  const zhTitle = work.zh?.title ?? work.title;
  const groupZh = group.zh ?? group.title;
  const cover = work.image!;
  const lineEn = work.line;
  const lineZh = work.zh?.line ?? work.line;

  return (
    <>
      <div className="ground-plane ld-ground" aria-hidden />
      <CaseReveal />
      <div className="cs pg-dark">
        <div className="cs-dots" aria-hidden style={{ top: -64 }} />

        <section className="cs-hero">
          <div className="cs-hero__screen">
            <div className="cs-hero__row1" data-rv>
              <Link href="/#work" className="cs-back">
                <Pick en={COPY.en.back} zh={COPY.zh.back} />
              </Link>
              <span className="cs-hero__meta">
                <span>
                  <Pick en={COPY.en.kicker(group.title)} zh={COPY.zh.kicker(groupZh)} />
                </span>
                <span>{work.year}</span>
              </span>
            </div>
            <div className="cs-hero__row2">
              <div className="cs-hero__lead">
                <h1 className="cs-title os-title" data-rv>
                  <Pick en={work.title} zh={zhTitle} />
                </h1>
                {/* 与案例页同一条双线尺 */}
                <svg className="cs-rule" width="230" height="12" aria-hidden data-rv>
                  <line
                    data-dash
                    x1="0"
                    y1="4"
                    x2="230"
                    y2="4"
                    stroke="oklch(0.74 0.1 150)"
                    strokeWidth="1.5"
                    strokeDasharray="8 6"
                    style={{ animation: 'dashmove 2.6s linear infinite' }}
                  />
                  <line x1="0" y1="10" x2="150" y2="10" stroke="oklch(0.72 0.095 291)" strokeWidth="1.5" />
                </svg>
              </div>
              {lineEn ? (
                <p className="cs-lede" data-rv>
                  <Pick en={lineEn} zh={lineZh ?? lineEn} />
                </p>
              ) : null}
            </div>

            <figure className="cs-fig" data-rv>
              <div className="cs-stage">
                <img
                  className="os-stage__img"
                  src={cover.src}
                  alt={cover.caption?.en ?? work.title}
                  style={{ objectPosition: cover.position === 'top' ? 'center top' : 'center' }}
                  fetchPriority="high"
                  decoding="async"
                />
                <div className="cs-stage__vignette" />
                <span className="cs-corner cs-corner--tl" />
                <span className="cs-corner cs-corner--tr" />
                <span className="cs-corner cs-corner--bl" />
                <span className="cs-corner cs-corner--br" />
                <div className="cs-stage__bot">
                  <span />
                  <a className="cs-open" href={cover.src} target="_blank" rel="noopener">
                    <Pick en={COPY.en.open} zh={COPY.zh.open} />
                  </a>
                </div>
              </div>
              <figcaption className="cs-figcap">
                <span>
                  <Pick en={COPY.en.fig(1)} zh={COPY.zh.fig(1)} />
                </span>
                {cover.caption ? (
                  <span>
                    <Pick en={cover.caption.en} zh={cover.caption.zh} />
                  </span>
                ) : null}
              </figcaption>
            </figure>
          </div>

          <Pick en={<Meta entry={entry} lang="en" />} zh={<Meta entry={entry} lang="zh" />} />
        </section>

        <div className="cs-layout">
          <div className="cs-main">
            <div className="cs-body os-body">
              <Pick en={<Body entry={entry} lang="en" />} zh={<Body entry={entry} lang="zh" />} />
            </div>

            {next ? (
              <section className="cs-tail">
                <Link href={`/work/${next.work.slug}`} className="cs-next" data-pt="next">
                  <span>
                    <span className="cs-next__k">
                      <Pick
                        en={COPY.en.next(next.group.title)}
                        zh={COPY.zh.next(next.group.zh ?? next.group.title)}
                      />
                    </span>
                    <span className="cs-next__t">
                      <Pick en={next.work.title} zh={next.work.zh?.title ?? next.work.title} />
                    </span>
                  </span>
                  <span className="cs-next__arrow" aria-hidden>
                    →
                  </span>
                </Link>
              </section>
            ) : null}
          </div>
        </div>

        <CaseFooter
          labelEn={COPY.en.footer(work.title, work.year)}
          labelZh={COPY.zh.footer(zhTitle, work.year)}
        />
      </div>
    </>
  );
}
