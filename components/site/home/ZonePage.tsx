'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import type { HomeLabGroup, HomeLogData } from '../../../src/lib/site/home-model';
import { HomeLabPreview } from '../HomeLabPreview';

const EO = 'cubic-bezier(.2,.7,.1,1)';
const HOVER_MS = 120; // 活台架切换要挂载 / 卸载 WebGL，指针划过目录时稍作停留再切（稿内是即时）

/* ───────────────────────── 04 Lab ───────────────────────── */

function LabGroup({
  g,
  gi,
  selected,
  onPick,
  active,
}: {
  g: HomeLabGroup;
  gi: number;
  selected: string | null;
  onPick: (gi: number, no: string, immediate: boolean) => void;
  active: boolean;
}) {
  const all = g.segs.flatMap((s) => s.benches);
  const cur = all.find((b) => b.no === selected) ?? all.find((b) => b.no === g.cover) ?? null;
  const rootRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [everNear, setEverNear] = useState(false);
  const first = useRef(true);
  const ptr = useRef('mouse');
  const hoverT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 预览只在本组进入视口后才建（避免三组同时占 WebGL 上下文），离开视口停跑。
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !cur) return;
    const io = new IntersectionObserver(
      (ents) => {
        const e = ents[ents.length - 1];
        setNear(e.isIntersecting);
      },
      { threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cur]);
  // 第四页还没翻到时 IO 也报「可见」（页只是被 transform 推在下面），所以要等本页轮到才建。
  useEffect(() => {
    if (active && near) setEverNear(true);
  }, [active, near]);
  useEffect(() => () => clearTimeout(hoverT.current), []);

  // 切换台架：稿内的 520ms 淡入 + 轻缩放
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    plateRef.current?.animate(
      [
        { opacity: 0.3, transform: 'scale(1.02)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 520, easing: EO },
    );
  }, [cur?.no]);

  return (
    <div className="hs-group" data-group={gi} ref={rootRef} style={{ '--c-ink': g.tone.ink } as CSSProperties}>
      <div className="hs-group__head">
        <div className="hs-group__row">
          <span className="hs-group__n">{g.n}</span>
          <span className="hs-group__titles">
            <span className="hs-group__title">{g.title}</span>
            <span className="hs-lbl">{g.sub}</span>
          </span>
          <span className={`hs-group__count${all.length ? '' : ' hs-group__count--wip'}`}>
            {all.length ? `${all.length} benches` : 'In progress'}
          </span>
        </div>
        <span className="hs-group__hair" />
        <span className="hs-group__prog" data-gprog />
      </div>
      <div className="hs-group__body">
        <div className="hs-group__list">
          {g.segs.map((s) => (
            <div className="hs-seg" key={s.n || 'solo'}>
              {s.label ? (
                <p className="hs-seg__label" data-rv>
                  {s.n} · {s.label}
                </p>
              ) : null}
              {s.benches.map((b) => (
                <Link
                  key={b.no}
                  className={`hs-bench${cur?.no === b.no ? ' hs-is-on' : ''}`}
                  href={`/lab#lab${b.no}`}
                  data-rv
                  data-bench={b.no}
                  // 鼠标 / 笔：悬停预览；触屏：第一下预览，第二下进入
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'touch') return;
                    clearTimeout(hoverT.current);
                    hoverT.current = setTimeout(() => onPick(gi, b.no, false), HOVER_MS);
                  }}
                  onPointerLeave={() => clearTimeout(hoverT.current)}
                  onFocus={(e) => {
                    if (e.currentTarget.matches(':focus-visible')) onPick(gi, b.no, true);
                  }}
                  onPointerDown={(e) => {
                    ptr.current = e.pointerType;
                  }}
                  onClick={(e) => {
                    if (ptr.current === 'touch' && cur?.no !== b.no) {
                      e.preventDefault();
                      onPick(gi, b.no, true);
                    }
                    ptr.current = 'mouse';
                  }}
                >
                  <span className="hs-bench__bar" />
                  <span className="hs-bench__no">{b.no}</span>
                  <span className="hs-bench__main">
                    <span className="hs-bench__title">{b.title}</span>
                    <span className="hs-bench__desc">{b.description}</span>
                  </span>
                  <span className="hs-bench__meta">
                    {b.meta}
                    <span className="hs-bench__open">open ↗</span>
                  </span>
                </Link>
              ))}
            </div>
          ))}
          {all.length ? null : (
            <p className="hs-group__empty" data-rv>
              No benches yet. They will be listed here, in build order, as the project takes shape.
            </p>
          )}
          <Link className="hs-group__case" href={`/work/${g.slug}`} data-rv>
            {g.cover ? 'Case study ↗' : 'Case study · to come'}
          </Link>
        </div>
        <div className="hs-pv">
          <div className={`hs-pv__plate${g.cover ? '' : ' hs-pv__plate--empty'}`} ref={plateRef}>
            <span className="hs-pv__bar" />
            {cur ? (
              <div className="hs-pv__live" aria-label={`Live preview · Lab ${cur.no}`}>
                {everNear ? <HomeLabPreview no={cur.no} active={active && near} /> : null}
              </div>
            ) : (
              <div className="hs-pv__ph">In progress</div>
            )}
          </div>
          <div className="hs-pv__cap">
            <span className="hs-pv__title">{cur ? `Lab ${cur.no} · ${cur.title}` : 'Project III'}</span>
            <span className="hs-pv__desc">{cur ? cur.meta : 'Benches to come'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── 05 Log ───────────────────────── */

const inkVar = (ink: string) => ({ '--c-ink': ink }) as CSSProperties;

export function ZonePage({
  groups,
  log,
  logRef,
  active,
  sel,
  onPick,
  ck,
  setCk,
  lh,
  setLh,
  onTop,
}: {
  groups: HomeLabGroup[];
  log: HomeLogData;
  logRef: MutableRefObject<HTMLDivElement | null>;
  active: boolean;
  sel: (string | null)[];
  onPick: (gi: number, no: string, immediate: boolean) => void;
  ck: number | null;
  setCk: (i: number | null) => void;
  lh: number | null;
  setLh: (i: number | null) => void;
  onTop: () => void;
}) {
  const benchCount = groups.reduce((a, g) => a + g.count, 0);
  const hot = ck != null ? ck : lh != null ? (log.latest[lh]?.i ?? null) : null;
  const tipEntry = ck != null ? log.tips[ck] : null;
  const [feat, ...rest] = log.latest;
  return (
    <>
      <div className="hs-zone">
        <div className="hs-head hs-head--lab">
          <div>
            <p className="hs-eyebrow" data-a="up" data-d="0">
              04 — Lab
            </p>
            <div className="hs-mask hs-mask--sm">
              <h2 className="hs-h2" data-a="rise" data-d="60">
                The lab<span className="hs-accent">.</span>
              </h2>
            </div>
          </div>
          <div className="hs-head__aside" data-a="fade" data-d="220">
            <span className="hs-lbl">
              <span className="hs-live">Live</span>
              {benchCount} benches · three projects
            </span>
            <Link className="hs-btn" href="/lab">
              Explore the lab ↗
            </Link>
          </div>
        </div>
        <div className="hs-rule-static" data-a="line" data-d="120" />
        <div>
          {groups.map((g, gi) => (
            <LabGroup key={g.slug} g={g} gi={gi} selected={sel[gi]} onPick={onPick} active={active} />
          ))}
        </div>

        <div className="hs-log" ref={logRef} data-log>
          <div className="hs-log__head">
            <div>
              <p className="hs-eyebrow" data-rv>
                05 — Log
              </p>
              <h2 className="hs-h2" data-rv>
                Work log<span className="hs-accent">.</span>
              </h2>
            </div>
            <div className="hs-head__aside hs-head__aside--log" data-rv>
              <span className="hs-lbl">{log.span}</span>
              <Link className="hs-link" href="/archive">
                All entries ↗
              </Link>
            </div>
          </div>
          <div className="hs-log__body">
            <div
              className={`hs-cad${hot != null ? ' hs-has-hot' : ''}`}
              data-rv
              data-cad
              onMouseLeave={() => setCk(null)}
            >
              <div>
                {log.lanes.map((ln) => (
                  <div className="hs-lane" key={ln.label} style={inkVar(ln.ink)}>
                    <span className="hs-lane__label">
                      <span className="hs-lane__sq" />
                      {ln.label}
                      <span className="hs-lane__n">{ln.count}</span>
                    </span>
                    <span className="hs-lane__track">
                      {ln.ticks.map((t) => (
                        <Link
                          key={t.i}
                          className={`hs-tick${hot === t.i ? ' hs-is-hot' : ''}`}
                          href={t.href}
                          data-tk={t.i}
                          data-f={t.f}
                          aria-label={t.label}
                          style={{ left: `calc(${(t.f * 100).toFixed(3)}% + ${t.off * 4}px)` }}
                          onMouseEnter={() => setCk(t.i)}
                          onFocus={() => setCk(t.i)}
                          onBlur={() => setCk(null)}
                        >
                          <span />
                        </Link>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
              <div className="hs-cad__axis">
                <span />
                <span className="hs-cad__months">
                  {log.months.map((m) => (
                    <span className="hs-cad__month" key={m.f} style={{ left: `${(m.f * 100).toFixed(3)}%` }}>
                      {m.label}
                    </span>
                  ))}
                  <span className="hs-cad__today">today</span>
                </span>
              </div>
              <span className="hs-cad__now" />
              <span
                className={`hs-cad__tip${tipEntry ? ' hs-is-on' : ''}`}
                style={
                  tipEntry
                    ? { left: `calc(168px + (100% - 168px) * ${tipEntry.f})`, top: `${tipEntry.lane * 28 - 2}px` }
                    : undefined
                }
              >
                {tipEntry?.text}
              </span>
            </div>
            <div className={`hs-latest${lh != null ? ' hs-has-on' : ''}`}>
              {feat ? (
                <Link
                  className="hs-feat"
                  href={feat.href}
                  data-rv
                  style={inkVar(feat.ink)}
                  onMouseEnter={() => setLh(0)}
                  onMouseLeave={() => setLh(null)}
                >
                  <span className="hs-entry__meta">
                    <span className="hs-entry__badge">Latest</span>
                    <span>{feat.date}</span>
                    <span className="hs-entry__tag">{feat.tag}</span>
                  </span>
                  <span className="hs-feat__text">{feat.text}</span>
                  {feat.img ? (
                    <span className="hs-feat__fig">
                      <span
                        className="hs-feat__img"
                        role="img"
                        aria-label={feat.img.caption}
                        style={{ backgroundImage: `url('${feat.img.src}')` }}
                      />
                    </span>
                  ) : null}
                  <span className="hs-feat__foot">
                    <span className="hs-feat__cap">{feat.img?.caption}</span>
                    <span className="hs-entry__cta">Read entry ↗</span>
                  </span>
                </Link>
              ) : null}
              <div className="hs-latest__rest">
                {rest.map((l, k) => (
                  <Link
                    key={l.href}
                    className={`hs-entry${lh === k + 1 ? ' hs-is-on' : ''}`}
                    href={l.href}
                    data-rv
                    style={inkVar(l.ink)}
                    onMouseEnter={() => setLh(k + 1)}
                    onMouseLeave={() => setLh(null)}
                  >
                    <span className="hs-entry__meta">
                      <span>{l.date}</span>
                      <span className="hs-entry__tag">{l.tag}</span>
                    </span>
                    <span className="hs-entry__row">
                      <span className="hs-entry__text">{l.text}</span>
                      {l.img ? (
                        <span
                          className="hs-entry__thumb"
                          role="img"
                          aria-label={l.img.alt}
                          style={{ backgroundImage: `url('${l.img.src}')` }}
                        />
                      ) : null}
                    </span>
                    <span className="hs-entry__cta">Read entry ↗</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <footer className="hs-foot">
        <div className="hs-foot__in">
          <div className="hs-foot__top" data-rv>
            <span className="hs-foot__name">Zishuo Li</span>
            <span className="hs-foot__line">I explore how people relate to objects and spaces that respond to them.</span>
          </div>
          <div className="hs-mask" data-rv>
            <a className="hs-mail" href="mailto:lzs20030114@gmail.com">
              lzs20030114@gmail.com
              <span className="hs-mail__ul" />
            </a>
          </div>
          <div className="hs-foot__base" data-rv>
            <span>GitHub · plain URLs, no password</span>
            <span>© 2026</span>
            <button type="button" className="hs-foot__top-btn" onClick={onTop}>
              Back to top ↑
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}
