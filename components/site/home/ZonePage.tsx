'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react';
import type { HomeLabGroup, HomeLogData } from '../../../src/lib/site/home-model';
import { HomeLabPreview, preloadLabPreview } from '../HomeLabPreview';

const HOVER_MS = 120; // 活台架切换要挂载 / 卸载 WebGL，指针划过目录时稍作停留再切（稿内是即时）
const FADE_MS = 460; // 交叉淡化时长，与 home.css .hs-pv__layer 的 transition 对齐
const READY_MAX_MS = 900; // 新台架迟迟不出图（首访拉代码块）时，最多让旧画面再撑这么久
const MESH_MAX_MS = 2500; // 台架声明在载网格（data-bench-loading）时的兜底：首访拉 + 烘焙十万级三角

/* ───────────────────────── 04 Lab ───────────────────────── */

// 预览层：in = 已挂载、还没出首帧（透明，压在旧画面上不露面）；on = 显示中；out = 淡出中，淡完卸载。
// 旧台架一直留到新台架真正画出来才开始交叉淡化——切换过程中预览框不会出现空板。
type PvPhase = 'in' | 'on' | 'out';
type PvLayer = { no: string; phase: PvPhase };

function PreviewLayer({
  no,
  phase,
  active,
  onReady,
}: {
  no: string;
  phase: PvPhase;
  active: boolean;
  onReady: (no: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  // 「出图」判据：dynamic 的 loading 占位换成了台架的 svg / canvas，再等三帧让 rAF 循环画上第一笔。
  // 异步载网格的台架（触手、整机）canvas 先在、模型后到：它们在 canvas 上挂 data-bench-loading，
  // 载完摘掉——三帧后若还挂着就接着等，否则会淡入一块空 canvas、模型再「啪」地冒出来。
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let done = false;
    let raf = 0;
    let t: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      if (done) return;
      done = true;
      readyRef.current(no);
    };
    const arm = (ms: number) => {
      clearTimeout(t);
      t = setTimeout(fire, ms);
    };
    const drawn = () => el.querySelector('svg, canvas') != null;
    const loading = () => el.querySelector('[data-bench-loading]') != null;
    const settle = () => {
      if (raf || done) return; // 台架自己的 DOM 每帧都可能变，已在数帧就不重来
      let n = 3;
      const step = () => {
        if (--n > 0) {
          raf = requestAnimationFrame(step);
          return;
        }
        raf = 0;
        if (loading()) arm(MESH_MAX_MS); // 摘标记时 MutationObserver 再叫 settle
        else fire();
      };
      raf = requestAnimationFrame(step);
    };
    const mo = new MutationObserver(() => {
      if (drawn() && !loading()) settle();
    });
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-bench-loading'] });
    if (drawn()) settle();
    arm(READY_MAX_MS);
    return () => {
      done = true;
      mo.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [no]);

  return (
    <div className={`hs-pv__layer hs-pv__layer--${phase}`} ref={ref} aria-hidden={phase !== 'on' || undefined}>
      <HomeLabPreview no={no} active={active} />
    </div>
  );
}

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
  const [near, setNear] = useState(false);
  const [everNear, setEverNear] = useState(false);
  const [layers, setLayers] = useState<PvLayer[]>(() => (cur ? [{ no: cur.no, phase: 'in' }] : []));
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

  // 切换台架：新层先在底下静默挂载，出图后再与旧层交叉淡化（取代稿内整块 plate 0.3→1 的闪）
  const curNo = cur?.no;
  useEffect(() => {
    if (!curNo) return;
    setLayers((ls) => {
      const pending = ls.filter((l) => l.phase !== 'in'); // 还没露面的半路新层直接撤，不排队
      const hit = pending.find((l) => l.no === curNo);
      if (hit?.phase === 'on') return pending;
      if (hit?.phase === 'out') {
        // 指针折回刚离开的那台：从当前透明度原路淡回，不重建
        return pending.map((l) =>
          l.no === curNo ? { ...l, phase: 'on' } : l.phase === 'on' ? { ...l, phase: 'out' } : l,
        );
      }
      return [...pending, { no: curNo, phase: 'in' }];
    });
  }, [curNo]);
  const onReady = useCallback((no: string) => {
    setLayers((ls) => {
      if (ls.find((l) => l.no === no)?.phase !== 'in') return ls;
      const next = ls.map((l): PvLayer =>
        l.no === no ? { ...l, phase: 'on' } : l.phase === 'on' ? { ...l, phase: 'out' } : l,
      );
      // 连续快划时淡出层最多留两张（各占一份 WebGL context），更早的那张此时已近全透明
      const outs = next.filter((l) => l.phase === 'out');
      return outs.length > 2 ? next.filter((l) => !outs.slice(0, -2).includes(l)) : next;
    });
  }, []);
  // 淡出层淡完即卸（同时释放其 WebGL context，见 HomeLabPreview）
  useEffect(() => {
    if (!layers.some((l) => l.phase === 'out')) return;
    const t = setTimeout(() => setLayers((ls) => ls.filter((l) => l.phase !== 'out')), FADE_MS + 60);
    return () => clearTimeout(t);
  }, [layers]);

  return (
    // data-pt-scope / data-pt-frame：点目录里正在预览的那一台，预览框飞到实验室里它那一格（MAPPING §48）
    <div className="hs-group" data-group={gi} data-pt-scope ref={rootRef} style={{ '--c-ink': g.tone.ink } as CSSProperties}>
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
                  data-pt="frame"
                  // 鼠标 / 笔：悬停预览；触屏：第一下预览，第二下进入
                  onPointerEnter={(e) => {
                    if (e.pointerType === 'touch') return;
                    preloadLabPreview(b.no);
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
          <div
            className={`hs-pv__plate${g.cover ? '' : ' hs-pv__plate--empty'}`}
            data-pt-frame={cur ? cur.no : undefined}
          >
            <span className="hs-pv__bar" />
            {cur ? (
              <div className="hs-pv__live" aria-label={`Live preview · Lab ${cur.no}`}>
                {everNear
                  ? layers.map((l) => (
                      <PreviewLayer key={l.no} no={l.no} phase={l.phase} active={active && near} onReady={onReady} />
                    ))
                  : null}
              </div>
            ) : (
              <div className="hs-pv__ph">In progress</div>
            )}
          </div>
          <div className="hs-pv__cap" key={cur?.no}>
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
            <Link href="/privacy">Visitor privacy</Link>
            <button type="button" className="hs-foot__top-btn" onClick={onTop}>
              Back to top ↑
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}
