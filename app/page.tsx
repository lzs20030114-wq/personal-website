import type { CSSProperties } from 'react';
import Link from 'next/link';
import { LinkageFigure } from '../components/linkage/LinkageFigure';
import { getSelectedWork } from '../src/lib/site/content';

/**
 * 主页（Home-Modernist 稿）：kicker + 88px hero 标题 → 分屏（LinkageFigure + 简介/按钮/2×2 统计）
 * → Selected work 四行索引（01 可点入 case，02–04 灰置 TBD）→ The lab 四卡 → Work log 预览三条。
 * hero = 封面不 = 目录；FIG 入口 = 主 CTA 按钮（IA：hero 是通往项目的门）。
 */

// Lab 四卡（MAPPING §3 链接）——文案照搬设计稿，链入 /demo 台架（朴素 <a>）。
const LABS = [
  {
    kicker: 'Lab.01',
    title: 'Four-bar linkage',
    body: '2D PBD solver testbench — the kernel behind Fig. 01.',
    meta: '36 tests · SVG',
    href: '/demo/',
  },
  {
    kicker: 'Lab.02',
    title: 'Arch ring solver',
    body: 'Angulated scissor arch + crank-slider, from the physical S4 ring.',
    meta: 'Kernel untouched · SVG',
    href: '/demo/arch.html',
  },
  {
    kicker: 'Lab.03',
    title: 'Tendon tentacle',
    body: '16 vertebrae, three tendons at 120° — full 3D kernel.',
    meta: 'Orbit camera · WebGL',
    href: '/demo/tentacle3d.html',
  },
  {
    kicker: 'Lab.04',
    title: 'Five-ring shell',
    body: 'S1–S5 ring family choreography — a breathing body.',
    meta: 'Calibrated stops · WebGL',
    href: '/demo/shell3d.html',
  },
];

// 首页 Work log 预览（Home 稿字面三条，与 Log 页 8 条为不同拟稿——双稿各自照搬，MAPPING §5.2）。
const LOG_PREVIEW = [
  {
    date: '2026-07-17',
    text: 'Five-ring choreography v0.3 — stop-margin calibration per ring; whole family peaks under 0.42 mm.',
  },
  {
    date: '2026-07-13',
    text: 'Site scaffold S1–S3 — content pool, four routes, LinkageFigure live on the homepage.',
  },
  {
    date: '2026-07-10',
    text: 'Arch solver instance — real S4 ring as a solver preset, kernel untouched, 7 new tests green.',
  },
];

// 2×2 统计格（MAPPING §4：176 = 当前实测测试数，硬编码，发版时人工更新）。
const STATS = [
  { n: '04', label: 'Projects' },
  { n: '176', label: 'Tests green' },
  { n: '02', label: 'Solver kernels' },
  { n: '05', label: 'Live demos' },
];

const KICKER: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--n600)',
};
const SECTION_H2: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 800,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
};
const SECTION_NOTE: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--n600)',
};

/** 去掉作者自留的方括号备注（如 "[summary 草案…]"），仅用于列表展示。 */
function cleanSummary(s: string): string {
  return s.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

export default function Home() {
  const selected = getSelectedWork();

  return (
    <div className="shell">
      {/* Hero 标题 */}
      <section style={{ padding: '72px 0 48px', borderBottom: '2px solid var(--ink)' }}>
        <p style={{ ...KICKER, margin: '0 0 20px' }}>Portfolio — Application 2026</p>
        <h1
          style={{
            fontSize: 'clamp(40px, 7.5vw, 88px)',
            fontWeight: 800,
            lineHeight: 0.98,
            letterSpacing: '-0.02em',
            margin: 0,
            textTransform: 'uppercase',
            maxWidth: '14ch',
          }}
        >
          Structures that move, machines that live.
        </h1>
      </section>

      {/* 分屏：左 LinkageFigure + Fig.01 题栏，右 简介/按钮/统计 */}
      <section
        className="grid lg:grid-cols-[1.5fr_1fr]"
        style={{ borderBottom: '2px solid var(--ink)' }}
      >
        <figure
          className="m-0 lg:border-r-2 lg:pr-12"
          style={{ paddingTop: 32, paddingBottom: 32, borderRightColor: 'var(--ink)' }}
        >
          {/* MAPPING §5.1：LinkageFigure 封盘，包裹盒可改；aspect 盒保 CLS=0 */}
          <div style={{ aspectRatio: '700/520' }}>
            <LinkageFigure />
          </div>
          <figcaption
            style={{
              marginTop: 12,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--n600)',
            }}
          >
            Fig. 01 — structural study for Reincarnation Machine · drag any joint
          </figcaption>
        </figure>

        <div className="flex flex-col gap-6 lg:pl-12" style={{ paddingTop: 32, paddingBottom: 32 }}>
          <p style={{ fontSize: 19, lineHeight: 1.5, margin: 0, maxWidth: '36ch' }}>
            Mechanism design, custom physics solvers, and human–robot interaction research. Four
            projects, built and measured.
          </p>
          <div className="flex flex-col items-start gap-2.5">
            <Link
              className="btn btn-primary"
              href="/work/reincarnation-machine"
              style={{ minWidth: 'min(320px, 100%)' }}
            >
              Reincarnation Machine — case study
            </Link>
            <Link className="btn btn-secondary" href="#lab" style={{ minWidth: 'min(320px, 100%)' }}>
              Browse the lab
            </Link>
          </div>
          <div
            className="grid grid-cols-2"
            style={{ marginTop: 'auto', borderTop: '2px solid var(--ink)' }}
          >
            {STATS.map((s, i) => {
              const leftCol = i % 2 === 0;
              const bottomRow = i >= 2;
              return (
                <div
                  key={s.label}
                  style={{
                    padding: leftCol ? '16px 16px 0 0' : '16px 0 0 16px',
                    borderRight: leftCol ? '2px solid var(--ink)' : undefined,
                    borderTop: bottomRow ? '2px solid var(--ink)' : undefined,
                    marginTop: bottomRow ? 16 : undefined,
                  }}
                >
                  <div style={{ fontSize: 34, fontWeight: 800 }}>{s.n}</div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--n600)',
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Selected work 四行索引 */}
      <section id="work" style={{ paddingTop: 56 }}>
        <div className="mb-6 flex items-baseline justify-between">
          <h2 style={SECTION_H2}>Selected work</h2>
          <span style={SECTION_NOTE}>{selected.length} entries</span>
        </div>
        <ul className="m-0 list-none p-0">
          {selected.map((w, i) => {
            const published = w.status === 'published';
            const no = String(i + 1).padStart(2, '0');
            const summary = published ? cleanSummary(w.summary) : 'Case study in preparation.';
            const dateText = published ? w.date : 'TBD';
            const last = i === selected.length - 1;
            const row = (
              <div
                className={`grid items-baseline gap-x-6 gap-y-1 md:grid-cols-[88px_360px_1fr_96px] ${
                  published ? 'work-row' : ''
                }`}
                style={{ padding: '22px 0' }}
              >
                <span
                  style={{ fontSize: 26, fontWeight: 800, color: published ? 'var(--accent)' : 'var(--n400)' }}
                >
                  {no}
                </span>
                <span
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '-0.01em',
                    color: published ? undefined : 'var(--n500)',
                  }}
                >
                  {w.title}
                </span>
                <span
                  className="hidden md:block"
                  style={{ fontSize: 14, color: published ? 'var(--n700)' : 'var(--n500)' }}
                >
                  {summary}
                </span>
                <span
                  className="md:text-right"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    color: published ? 'var(--n600)' : 'var(--n500)',
                  }}
                >
                  {dateText}
                </span>
              </div>
            );
            return (
              <li
                key={w.slug}
                style={{
                  borderTop: '2px solid var(--ink)',
                  ...(last ? { borderBottom: '2px solid var(--ink)' } : {}),
                }}
              >
                {published ? (
                  <Link href={`/work/${w.slug}`} className="block no-underline">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* The lab 四卡 */}
      <section id="lab" style={{ paddingTop: 56 }}>
        <div className="mb-6 flex items-baseline justify-between">
          <h2 style={SECTION_H2}>The lab</h2>
          <span style={SECTION_NOTE}>Solver testbenches · live</span>
        </div>
        <div
          className="grid grid-cols-2 lg:grid-cols-4"
          style={{ gap: 2, background: 'var(--ink)', border: '2px solid var(--ink)' }}
        >
          {LABS.map((lab) => (
            <a key={lab.kicker} href={lab.href} className="card">
              <div className="card-kicker">{lab.kicker}</div>
              <div className="card-title">{lab.title}</div>
              <p className="card-body">{lab.body}</p>
              <div className="card-meta">{lab.meta}</div>
            </a>
          ))}
        </div>
      </section>

      {/* Work log 预览三条 + All entries → /archive */}
      <section style={{ padding: '56px 0 64px' }}>
        <div className="mb-6 flex items-baseline justify-between">
          <h2 style={SECTION_H2}>Work log</h2>
          <Link href="/archive" className="no-underline" style={{ ...SECTION_NOTE, color: 'var(--accent)' }}>
            All entries →
          </Link>
        </div>
        {LOG_PREVIEW.map((e, i) => (
          <div
            key={e.date + i}
            className="grid grid-cols-[120px_1fr] gap-4"
            style={{
              padding: '18px 0',
              borderTop: '2px solid var(--ink)',
              ...(i === LOG_PREVIEW.length - 1 ? { borderBottom: '2px solid var(--ink)' } : {}),
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800 }}>{e.date}</span>
            <span style={{ fontSize: 14, color: 'var(--n700)' }}>{e.text}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
