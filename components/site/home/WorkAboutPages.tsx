'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { HomeWorkGroup, HomeWorkTile } from '../../../src/lib/site/home-model';
import { WORK_PER_PANEL } from '../../../src/lib/site/home-model';
import { HOME_WORK_PANEL_KEY } from '../pageTransitionState';

const tileVars = (t: HomeWorkTile) => ({ '--c-ink': t.tone.ink, '--c-hi': t.tone.hi }) as CSSProperties;
const n2 = (i: number) => String(i).padStart(2, '0');
/** 其他作品的图走 Next 图片优化（作者给的原图可能很大）；主项目卡沿用稿内两张小图原样 */
const thumb = (src: string) => `/_next/image?url=${encodeURIComponent(src)}&w=828&q=75`;
/** 离开首页时停在第几屏由页面转场编排层记下（MAPPING §48「返回落回原处」）；太旧的不用 */
const PANEL_MEMORY_MS = 30 * 60 * 1000;
/** 触控板左右划：阈值与锁定时长同翻页引擎（36 / 900ms）；横向手势后 250ms 内的竖向余量一并吞掉，免得顺带翻页 */
const H_THRESHOLD = 36;
const H_LOCK_MS = 900;
const H_TAIL_MS = 250;

/* ───────────────────────── 02 Work ───────────────────────── */

function WorkCard({ t }: { t: HomeWorkTile }) {
  const body = (
    <>
      <span className="hs-card__kick" data-a="up" data-d="160">
        <span className="hs-card__kick-n">{t.kick}</span>
        <span className={`hs-card__status${t.wip ? ' hs-card__status--wip' : ''}`}>{t.status}</span>
      </span>
      <span className="hs-card__box" data-a="wipe" data-d="200">
        <span className={`hs-card__plate${t.img ? '' : ' hs-card__plate--wip'}`}>
          {t.img ? (
            <>
              <span
                className="hs-card__img"
                role="img"
                aria-label={t.title}
                style={{
                  backgroundImage: `url('${t.caseSlug ? t.img : thumb(t.img)}')`,
                  backgroundPosition: t.imgPos === 'top' ? 'center top' : undefined,
                }}
              />
              {t.caseSlug ? <span className="hs-card__stamp">stand-in · bench still</span> : null}
            </>
          ) : (
            <span className="hs-card__wip">
              <span className="hs-card__wip-badge">{t.caseSlug ? 'In progress' : 'Image to come'}</span>
              {t.caseSlug ? <span className="hs-card__wip-note">case study to come</span> : null}
            </span>
          )}
        </span>
        <span className="hs-card__veil" />
        <span className="hs-card__bar" />
        <span className="hs-card__head">
          <span className="hs-card__title" data-wt>
            {t.title}
            <span className="hs-card__ul" />
          </span>
          <span className="hs-card__role">{t.role}</span>
        </span>
        <span className="hs-card__thesis">
          <span className="hs-card__thesis-text">{t.thesis ?? ''}</span>
          <span className="hs-card__cta">{t.cta}</span>
        </span>
      </span>
    </>
  );
  if (/^https:\/\//.test(t.href)) {
    return (
      <a className="hs-card" href={t.href} target="_blank" rel="noopener noreferrer" data-card style={tileVars(t)}>
        {body}
      </a>
    );
  }
  return (
    <Link
      className="hs-card"
      href={t.href}
      data-card
      // 页面转场（MAPPING §48）：主项目卡 = 这张卡展开成它的案例页；从案例页回作品区 = 收回到这张卡
      data-pt={t.caseSlug ? 'card' : undefined}
      data-pt-card={t.caseSlug ?? undefined}
      style={tileVars(t)}
    >
      {body}
    </Link>
  );
}

/**
 * 02 Work 按组横向切换（MAPPING §58，用户拍板 2026-10-24；稿里没有，站方增补）：
 * 第一组是三个主项目，后面每组一种类别，一屏三张，一组超过三张就分几屏接着切。
 * 竖向滚动照旧归翻页引擎；左右只认组内切换——底部组名、右上箭头、← → 键、触控板左右划、触屏左右划。
 * 窄屏 / reduced-motion 回落文档流：各组上下依次排开，不做横向切换（CSS 同一条件）。
 */
export function WorkPage({ groups, active, flow }: { groups: HomeWorkGroup[]; active: boolean; flow: boolean }) {
  const panels = useMemo(
    () =>
      groups.flatMap((g, gi) => {
        const pages = Math.max(1, Math.ceil(g.tiles.length / WORK_PER_PANEL));
        return Array.from({ length: pages }, (_, pi) => ({
          gi,
          pi,
          pages,
          tiles: g.tiles.slice(pi * WORK_PER_PANEL, (pi + 1) * WORK_PER_PANEL),
        }));
      }),
    [groups],
  );
  const firstOf = useMemo(() => groups.map((_, gi) => panels.findIndex((p) => p.gi === gi)), [groups, panels]);
  const [cur, setCur] = useState(0);
  const [instant, setInstant] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; y: number; w: number } | null>(null);

  const p = panels[cur];
  const g = groups[p.gi];
  const step = useCallback(
    (d: number) => setCur((c) => Math.max(0, Math.min(panels.length - 1, c + d))),
    [panels.length],
  );

  // 从首页离开前在第几屏，回来就落在第几屏（只在深链 /#work 落地时用，且不放过渡）
  useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(HOME_WORK_PANEL_KEY);
      sessionStorage.removeItem(HOME_WORK_PANEL_KEY);
      const v = raw ? (JSON.parse(raw) as { i?: number; at?: number }) : null;
      if (window.location.hash !== '#work' || !v || typeof v.i !== 'number') return;
      if (Date.now() - (v.at ?? 0) > PANEL_MEMORY_MS || v.i <= 0 || v.i >= panels.length) return;
      setInstant(true);
      setCur(v.i);
    } catch {
      /* sessionStorage 不可用就从第一屏开始 */
    }
  }, [panels.length]);
  useEffect(() => {
    if (!instant) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
    return () => cancelAnimationFrame(r);
  }, [instant]);

  // 底部组名下那道 2px 滑到当前组；组名折行时也跟着换行
  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const place = () => {
      const el = tabs.querySelector<HTMLElement>(`[data-tab="${p.gi}"]`);
      if (el) setInd({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth });
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(tabs);
    return () => ro.disconnect();
  }, [p.gi]);

  // 换屏时把上一屏留下的悬停态清掉（悬停类名是翻页引擎加的，React 不管）
  useEffect(() => {
    const root = rootRef.current;
    root?.querySelectorAll('.hs-is-on[data-card]').forEach((c) => c.classList.remove('hs-is-on'));
    root?.querySelectorAll('.hs-has-on[data-cards]').forEach((c) => c.classList.remove('hs-has-on'));
  }, [cur]);

  // ← → 键：只在 Work 页是当前页时接
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable], [role="slider"]')) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, step]);

  // 触控板左右划 / 触屏左右划
  useEffect(() => {
    const root = rootRef.current;
    if (!root || flow) return;
    let acc = 0;
    let lock = 0;
    let lastH = 0;
    const onWheel = (e: WheelEvent) => {
      const now = performance.now();
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) {
        if (now - lastH < H_TAIL_MS) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      // 横向手势归这里：不让它冒泡到翻页引擎，也挡住浏览器的左右划后退
      e.preventDefault();
      e.stopPropagation();
      lastH = now;
      if (now - lock < H_LOCK_MS) return;
      acc += e.deltaX;
      if (Math.abs(acc) > H_THRESHOLD) {
        step(acc > 0 ? 1 : -1);
        acc = 0;
        lock = now;
      }
    };
    let tx: number | null = null;
    let ty = 0;
    const onStart = (e: TouchEvent) => {
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      if (tx == null) return;
      const dx = e.changedTouches[0].clientX - tx;
      const dy = e.changedTouches[0].clientY - ty;
      tx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchend', onEnd);
    };
  }, [flow, step]);

  const range =
    p.pages > 1 ? `${p.pi * WORK_PER_PANEL + 1}–${p.pi * WORK_PER_PANEL + p.tiles.length} of ${g.tiles.length}` : null;

  return (
    <>
      <div className={`hs-work hs-wg${instant ? ' hs-wg--instant' : ''}`} ref={rootRef}>
        <div className="hs-head">
          <div className="hs-wg__lead">
            <p className="hs-eyebrow" data-a="up" data-d="0">
              02 — Work
            </p>
            <div className="hs-mask hs-mask--sm hs-wg__mask">
              <div className="hs-wg__titles" data-a="rise" data-d="60">
                <h2 className="hs-h2 hs-wg__sizer">{g.title}</h2>
                {groups.map((gr, gi) => (
                  <span
                    key={gr.key}
                    className={`hs-h2 hs-wg__title${gi < p.gi ? ' hs-is-past' : gi > p.gi ? ' hs-is-next' : ''}`}
                    aria-hidden="true"
                  >
                    {gr.title}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="hs-wg__ctl" data-a="fade" data-d="200">
            {range ? <span className="hs-wg__range">{range}</span> : null}
            <span className="hs-wg__count" aria-live="polite">
              <b>{n2(p.gi + 1)}</b> / {n2(groups.length)}
            </span>
            <button type="button" className="hs-wg__arr" aria-label="Previous" disabled={cur === 0} onClick={() => step(-1)}>
              ←
            </button>
            <button
              type="button"
              className="hs-wg__arr"
              aria-label="Next"
              disabled={cur === panels.length - 1}
              onClick={() => step(1)}
            >
              →
            </button>
          </div>
        </div>

        <div className="hs-wg__stage">
          <div className="hs-wg__track" style={{ transform: `translateX(calc(${-cur} * (100% + var(--wg-gap))))` }}>
            {panels.map((pn, i) => {
              const gr = groups[pn.gi];
              const off = !flow && i !== cur;
              return (
                <div
                  key={`${gr.key}-${pn.pi}`}
                  className={`hs-wg__panel${i === cur ? ' hs-is-cur' : ''}${pn.pi > 0 ? ' hs-wg__panel--cont' : ''}`}
                  role="group"
                  aria-label={pn.pages > 1 ? `${gr.title}, ${pn.pi + 1} of ${pn.pages}` : gr.title}
                  aria-hidden={off || undefined}
                  inert={off}
                >
                  {pn.pi === 0 ? (
                    <div className="hs-wg__ghead">
                      <h3 className="hs-wg__gtitle">{gr.title}</h3>
                      <span className="hs-lbl">
                        {gr.n} · {gr.tiles.length} {gr.tiles.length === 1 ? 'work' : 'works'}
                      </span>
                    </div>
                  ) : null}
                  <div className="hs-cards" data-cards>
                    <span className="hs-rule" data-a="line" data-d="120" />
                    {pn.tiles.map((t) => (
                      <WorkCard key={t.key} t={t} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="hs-wg__tabs" role="tablist" aria-label="Work, by type" ref={tabsRef} data-a="up" data-d="520">
          {groups.map((gr, gi) => (
            <button
              key={gr.key}
              type="button"
              role="tab"
              aria-selected={gi === p.gi}
              className={`hs-wg__tab${gi === p.gi ? ' hs-is-on' : ''}`}
              data-tab={gi}
              onClick={() => setCur(firstOf[gi])}
            >
              <span className="hs-wg__tab-n">{gr.n}</span>
              <span className="hs-wg__tab-t">{gr.title}</span>
              <span className="hs-wg__tab-c">{gr.tiles.length}</span>
            </button>
          ))}
          {ind ? (
            <span
              className="hs-wg__ind"
              aria-hidden="true"
              style={{ width: ind.w, transform: `translate(${ind.x}px, ${ind.y}px)` }}
            />
          ) : null}
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
