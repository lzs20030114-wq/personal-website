'use client';

import type { CSSProperties, MutableRefObject } from 'react';
import { labBench } from '../../../src/lib/site/lab-index';
import type { HomeCard } from '../../../src/lib/site/home-model';
import { HomeLabPreview } from '../HomeLabPreview';

/** 01 Hook 的两张轮播：稿内文案（作者稿，无内容池来源）+ 台架编号（标题取 lab-index）。 */
export interface HookSlide {
  n: string;
  name: string;
  ink: string;
  hi: string;
  bench: string;
  fig: string;
  verb: string;
  line: string;
  hint: string;
}

const COPY = [
  {
    bench: '1-5',
    verb: 'tap',
    line: 'Each life ends in stillness. It wakes in the same body and answers your touch in a new way.',
    hint: 'Simulation of the full machine · tap a small feeler',
  },
  {
    bench: '2-11',
    verb: 'drag',
    line: 'Linger somewhere and the room takes shape around you. Move on and it lets go.',
    hint: 'Simulation, people only · drag someone across the floor',
  },
] as const;

export function buildSlides(cards: HomeCard[]): HookSlide[] {
  return COPY.map((c, i) => ({
    n: String(i + 1).padStart(2, '0'),
    name: cards[i].title,
    ink: cards[i].tone.ink,
    hi: cards[i].tone.hi,
    bench: c.bench,
    fig: `Lab ${c.bench} · ${labBench(c.bench).title}`,
    verb: c.verb,
    line: c.line,
    hint: c.hint,
  }));
}

/** 舞台与轮播的共享可变状态（rAF 里读写，不进 React 渲染）。 */
export interface HookCtl {
  hoverStage: boolean;
  lastInteract: number;
  elapsed: number;
}

const inkVar = (ink: string) => ({ '--c-ink': ink }) as CSSProperties;

export function HookPage({
  slides,
  hk,
  held,
  active,
  mounted,
  ctl,
  onTab,
  rotateS,
}: {
  slides: HookSlide[];
  hk: number;
  held: boolean;
  /** 本页是当前页（台架只在当前页当前片上跑） */
  active: boolean;
  mounted: boolean[];
  ctl: MutableRefObject<HookCtl>;
  onTab: (i: number) => void;
  rotateS: number;
}) {
  const cs = slides[hk];
  const hookStyle = { '--cur-ink': cs.ink, '--cur-hi': cs.hi } as CSSProperties;
  return (
    <>
      <div className="hs-hook-grid" aria-hidden="true" />
      <div className="hs-hook" style={hookStyle}>
        <div className="hs-hook__text">
          <div className="hs-hook__intro">
            <p className="hs-hook__name" data-a="up" data-d="0">
              Zishuo Li
              <span className="hs-hook__name-rule" />
              <span className="hs-hook__name-tag">portfolio · 2026</span>
            </p>
            <div className="hs-mask">
              <h1 className="hs-hook__title" data-a="rise" data-d="80">
                I explore how people relate to{' '}
                <span className="hs-accent">objects and spaces that respond to them.</span>
              </h1>
            </div>
          </div>
          <div className="hs-hook__ctrl">
            <span className="hs-rule" data-a="line" data-d="300" />
            <div className="hs-hook__tabs" data-a="up" data-d="420">
              {slides.map((s, i) => (
                <button
                  key={s.n}
                  type="button"
                  className={`hs-tab${i === hk ? ' hs-is-on' : ''}`}
                  style={inkVar(s.ink)}
                  onClick={() => onTab(i)}
                >
                  <span className="hs-tab__label">
                    <span className="hs-tab__n">{s.n}</span>
                    <span className="hs-tab__name">{s.name}</span>
                  </span>
                  <span className="hs-tab__track">
                    <span className="hs-tab__bar" data-bar={i} />
                  </span>
                </button>
              ))}
            </div>
            <div className="hs-hook__copy" data-a="up" data-d="520">
              <p className="hs-hook__line" key={hk}>
                {cs.line.split(' ').map((w, i) => (
                  <span key={i}>
                    <span data-w>{w}</span>
                  </span>
                ))}
              </p>
              <p className="hs-hook__hint" data-hk-hint>
                <span className="hs-hook__sq" />
                <span>{cs.hint}</span>
              </p>
            </div>
            <p className="hs-hook__status" data-a="fade" data-d="700">
              <span className={`hs-hook__dot${held ? ' hs-is-held' : ''}`} />
              <span>
                {held
                  ? 'Held while you look · resumes 15 s after you stop'
                  : `Next project in ${rotateS} s · hover the figure to hold`}
              </span>
            </p>
          </div>
        </div>

        <div
          className="hs-stage"
          data-a="wipe"
          data-d="180"
          onMouseEnter={(e) => {
            ctl.current.hoverStage = true;
            e.currentTarget.querySelector('.hs-cursor')?.classList.add('hs-is-on');
          }}
          onMouseLeave={(e) => {
            ctl.current.hoverStage = false;
            e.currentTarget.querySelector('.hs-cursor')?.classList.remove('hs-is-on');
          }}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const c = e.currentTarget.querySelector<HTMLElement>('.hs-cursor');
            if (c) c.style.transform = `translate(${e.clientX - r.left}px,${e.clientY - r.top}px)`;
          }}
          onPointerDown={() => {
            ctl.current.lastInteract = performance.now();
          }}
        >
          <span className="hs-stage__top" />
          <div>
            {slides.map((s, i) => (
              <div key={s.n} className={`hs-slide${i === hk ? ' hs-is-on' : ''}`} data-slide={i}>
                {/* 活台架：同 /lab 的组件与内核（controls 收起、HUD 由舞台自己的题栏代替）。
                    非当前片 / 非当前页停跑——useBenchLoop 的 IO 只看几何，必须显式关。 */}
                <div className="hs-slide__img" data-kb={i} role="img" aria-label={s.fig}>
                  {mounted[i] ? <HomeLabPreview no={s.bench} active={active && i === hk} /> : null}
                </div>
              </div>
            ))}
          </div>
          <span className="hs-corner hs-corner--tl" />
          <span className="hs-corner hs-corner--tr" />
          <span className="hs-corner hs-corner--bl" />
          <span className="hs-corner hs-corner--br" />
          <div className="hs-stage__cap">
            <span className="hs-stage__fig">{`FIG. ${cs.n} — ${cs.fig}`}</span>
            <span className="hs-stage__sim">
              <span className="hs-stage__sim-dot" />
              simulation
            </span>
          </div>
          <div className="hs-stage__foot">
            <span>live solver · same kernels as the lab</span>
            <span>{held ? '❚❚ held' : ''}</span>
          </div>
          <div className="hs-cursor" aria-hidden="true">
            <span className="hs-cursor__ring">
              <span className="hs-cursor__pip" />
            </span>
            <span className="hs-cursor__verb">{cs.verb}</span>
          </div>
        </div>
      </div>
      <div className="hs-shade" />
    </>
  );
}
