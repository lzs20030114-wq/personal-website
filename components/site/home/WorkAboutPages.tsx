'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { HomeCard } from '../../../src/lib/site/home-model';
import { OTHER_WORKS } from '../../../src/lib/site/home-model';

const cardVars = (c: HomeCard) => ({ '--c-ink': c.tone.ink, '--c-hi': c.tone.hi }) as CSSProperties;

/* ───────────────────────── 02 Work ───────────────────────── */

export function WorkPage({ cards }: { cards: HomeCard[] }) {
  return (
    <>
      <div className="hs-work">
        <div className="hs-head">
          <div>
            <p className="hs-eyebrow" data-a="up" data-d="0">
              02 — Work
            </p>
            <div className="hs-mask hs-mask--sm">
              <h2 className="hs-h2" data-a="rise" data-d="60">
                Selected work
              </h2>
            </div>
          </div>
          <p className="hs-lbl" data-a="fade" data-d="200">
            Three projects · other works below
          </p>
        </div>
        <div className="hs-cards" data-cards>
          <span className="hs-rule" data-a="line" data-d="120" />
          {cards.map((w, i) => (
            <Link
              key={w.slug}
              className="hs-card"
              href={`/work/${w.slug}`}
              data-card={i}
              // 页面转场（MAPPING §48）：点卡片 = 这张卡展开成它的案例页；从案例页回作品区 = 收回到这张卡
              data-pt="card"
              data-pt-card={w.slug}
              style={cardVars(w)}
            >
              <span className="hs-card__kick" data-a="up" data-d={160 + i * 90}>
                <span className="hs-card__kick-n">{`${w.n} · ${w.kicker}`}</span>
                <span className={`hs-card__status${w.wip ? ' hs-card__status--wip' : ''}`}>{w.status}</span>
              </span>
              <span className="hs-card__box" data-a="wipe" data-d={200 + i * 90}>
                <span className={`hs-card__plate${w.img ? '' : ' hs-card__plate--wip'}`}>
                  {w.img ? (
                    <>
                      <span
                        className="hs-card__img"
                        role="img"
                        aria-label={w.title}
                        style={{ backgroundImage: `url('${w.img}')` }}
                      />
                      <span className="hs-card__stamp">stand-in · bench still</span>
                    </>
                  ) : (
                    <span className="hs-card__wip">
                      <span className="hs-card__wip-badge">In progress</span>
                      <span className="hs-card__wip-note">case study to come</span>
                    </span>
                  )}
                </span>
                <span className="hs-card__veil" />
                <span className="hs-card__bar" />
                <span className="hs-card__head">
                  <span className="hs-card__title" data-wt>
                    {w.title}
                    <span className="hs-card__ul" />
                  </span>
                  <span className="hs-card__role">{w.role}</span>
                </span>
                <span className="hs-card__thesis">
                  <span className="hs-card__thesis-text">{w.thesis}</span>
                  <span className="hs-card__cta">{w.img ? 'Read the case study ↗' : 'Preview ↗'}</span>
                </span>
              </span>
            </Link>
          ))}
        </div>
        <div className="hs-others" data-a="up" data-d="520">
          {OTHER_WORKS.map((o) => (
            <Link key={o.title} className="hs-other" href={o.href}>
              <span className="hs-lbl">Other works</span>
              <span className="hs-other__main">
                <span className="hs-other__title">{o.title}</span>
                <span className="hs-other__line">{o.line}</span>
              </span>
              <span className="hs-lbl">{o.year}</span>
              <span className="hs-other__arrow">↗</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="hs-shade" />
    </>
  );
}

/* ───────────────────────── 03 About ───────────────────────── */

// 作者 2026-09-29 授权的首页自我介绍（MAPPING §6.1.1），与稿内三段同文；邮箱 / Currently 等事实栏同源。
const FACTS = [
  { k: 'Contact', v: 'lzs20030114@gmail.com' },
  { k: 'Currently', v: 'Computational design & human–computer interaction' },
  { k: 'Approach', v: 'Research through design · parametric modeling · physical prototyping' },
  { k: 'Tools', v: 'Rhino / Grasshopper · Python · 3D printing' },
];

export function AboutPage() {
  return (
    <>
      <div className="hs-about-dots" aria-hidden="true" />
      <div className="hs-about">
        <dl className="hs-facts">
          {FACTS.map((f, i) => (
            <div className="hs-fact" key={f.k}>
              <span className="hs-fact__rule" data-a="line" data-d={140 + i * 90} />
              <dt data-a="up" data-d={220 + i * 90}>
                {f.k}
              </dt>
              <dd data-a="up" data-d={220 + i * 90}>
                {f.v}
              </dd>
            </div>
          ))}
        </dl>
        <div className="hs-about__body">
          <p className="hs-eyebrow hs-eyebrow--lime" data-a="up" data-d="0">
            03 — About
          </p>
          <div className="hs-mask">
            <h2 className="hs-h2" data-a="rise" data-d="60">
              From spaces <span className="hs-accent--lime">to interactions.</span>
            </h2>
          </div>
          <div className="hs-about__text">
            <p data-a="up" data-d="200">
              I’m Zishuo Li, an environmental design graduate of Tsinghua University’s Academy of Arts &amp; Design.
            </p>
            <p data-a="up" data-d="280">
              My projects include Reincarnation Machine, a mechanical installation exploring how behavior gives a
              machine its character, and spatial simulations of environments that change through use. I work between
              parametric models and physical prototypes to develop these ideas.
            </p>
            <p data-a="up" data-d="360">
              During my design research internship at Tsinghua’s Future Lab, I contributed literature and competitor
              research, survey design, and interview planning to the 2030 Sleep Foresight Study with DeRucci.
            </p>
          </div>
          <Link className="hs-about__more" href="/about" data-a="fade" data-d="520">
            Full about →
          </Link>
        </div>
        <figure className="hs-portrait">
          <div className="hs-portrait__plate" data-a="wipe" data-d="160">
            <span>portrait · to be supplied</span>
          </div>
        </figure>
      </div>
      <div className="hs-shade" />
    </>
  );
}
