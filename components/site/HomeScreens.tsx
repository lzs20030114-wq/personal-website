'use client';

import type { CSSProperties } from 'react';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * 主页整屏分幕（design-ref/Home-Screens.dc.html 落地，MAPPING §6）。
 * 三幕：S0 枢纽（卡片组 + 预览舞台）/ S1 About / S2 Lab+Log+页脚。
 * 分页引擎 = 接管 wheel/touch 的阻力翻页；引擎与光标层仅桌面 + 非 reduced-motion 生效，
 * 其余回落常规文档流（幕 minHeight 100svh，原生滚动）。
 * Stage 默认位 = 空占位（用户拍板 2026-07-24：先空着，不自行填充）。
 */

// Tweaks 开关（设计稿 props → 构建期常量，MAPPING §6）
// staggerFx（翻幕到位后的幕内 stagger+边框闪）已删——用户真机否决 2026-07-24，转场另行安排。
const FX = {
  pagingFeel: true,
  hoverPeek: true,
  entrance: true,
  stageFx: true,
  cursorReadout: true,
  railFlip: true,
} as const;

// ---- 手感标定项（分页引擎参数，用户拍板对象——原样移植，不改数值）----
const COMMIT_DIST = 360;
const FLICK_V = 140;
const COMMIT_P = 0.5;
const PUSH_MS = 620;
const LOCK_TAIL = 160;
const SILENCE = 200;
const PAUSE_SNAP = 120;
const SPRING_MS = 280;
const MAX_PEEK = 0.1;
const TOUCH_COMMIT = 0.18;
const RETURN_DELAY = 300;
// ----------------------------------

const EASE = 'cubic-bezier(0.2,0.7,0.2,1)';
const MICRO = 180;
const STRUCT = 520;
const STAG = 50;

export interface HomeWork {
  title: string;
  slug: string;
  date: string;
  published: boolean;
}

// Lab 四卡（文案照搬 Home-Screens 稿；链接 = MAPPING §3 /demo 台架）
const LABS = [
  {
    kicker: 'Lab.01',
    title: 'Four-bar linkage',
    body: '2D PBD testbench — the kernel behind Fig. 01.',
    meta: '36 tests · SVG',
    href: '/demo/',
  },
  {
    kicker: 'Lab.02',
    title: 'Arch ring solver',
    body: 'Angulated scissor arch + crank-slider, from the S4 ring.',
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

// Work log 预览三条（Home 稿字面，MAPPING §5.2）
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

// 统计条（MAPPING §4：当前实测测试数，硬编码，发版时人工更新——2026-07-24 vitest 实测 103）
const STATS = [
  { n: '04', label: 'Projects', accent: false },
  { n: '103', label: 'Tests green', accent: true },
  { n: '02', label: 'Solver kernels', accent: false },
  { n: '05', label: 'Live demos', accent: false },
];

const UPPER_11: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--n600)',
};
const LINK_11: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  color: 'var(--accent)',
};
const SCREEN_H2: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
};
const CELL_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  marginBottom: 4,
};
const SECTION_BASE: CSSProperties = {
  minHeight: '100svh',
  background: 'var(--paper)',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
};
function StagePlaceholderPanel({ work, index }: { work: HomeWork; index: number }) {
  // 四项目舞台版式完全同等（红线）；正文位一律 [待作者供稿] 占位，不代写。
  const supplied = index === 0;
  return (
    <>
      <div
        style={{
          border: '2px dashed var(--n400)',
          padding: '9px 13px',
          fontSize: 12,
          color: 'var(--n700)',
        }}
      >
        <span style={{ fontWeight: 800, color: 'var(--accent)' }}>
          {supplied ? '[作者供稿]' : '[待作者供稿]'}
        </span>{' '}
        {supplied ? 'thesis 一句话 — 这台机器为何值得被哀悼。' : 'thesis 一句话。'}
      </div>
      <div className="hatch" style={{ flex: 1, minHeight: 0 }}>
        <span style={UPPER_11}>[待作者供稿] 主图 · duotone green</span>
      </div>
      <div className="grid grid-cols-2" style={{ borderTop: '2px solid var(--ink)' }}>
        <div style={{ padding: '9px 13px 0 0', borderRight: '2px solid var(--ink)' }}>
          <div style={{ ...CELL_LABEL, marginBottom: 3 }}>Role</div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--n700)' }}>
            {supplied ? 'Concept · mechanism · electronics · HRI study' : '[待作者供稿]'}
          </div>
        </div>
        <div style={{ padding: '9px 0 0 13px' }}>
          <div style={{ ...CELL_LABEL, marginBottom: 3 }}>Tools</div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--n700)' }}>
            {supplied ? 'Rhino / GH · SLS / FDM · ESP32 · ELAN' : '[待作者供稿]'}
          </div>
        </div>
      </div>
      {work.published ? (
        <Link
          className="btn btn-primary"
          href={`/work/${work.slug}`}
          style={{ alignSelf: 'flex-start' }}
        >
          Open case study
        </Link>
      ) : (
        <div className="flex items-baseline" style={{ gap: 14 }}>
          <span className="tag tag-neutral">In preparation</span>
          <Link href="/archive" style={LINK_11}>
            Work log →
          </Link>
        </div>
      )}
    </>
  );
}

export function HomeScreens({ works }: { works: HomeWork[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const offs: Array<() => void> = [];
    const on = (el: EventTarget, ev: string, fn: EventListener, opt?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn, opt);
      offs.push(() => el.removeEventListener(ev, fn, opt));
    };
    const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const fxEntrance = FX.entrance && !reduced;
    const fxStage = FX.stageFx && !reduced;
    const fxCursor = FX.cursorReadout && !reduced && window.matchMedia('(hover: hover)').matches;
    const fxRail = FX.railFlip && !reduced;
    const hoverPeek = FX.hoverPeek;
    const wantPaging = FX.pagingFeel && !reduced;

    const N = 2;
    const vp = $('vp');
    const track = $('track');
    const s2el = $('s2');
    const railEl = $('rail');
    const pFig = $('pFig');
    const chip = $('figChip');
    const lbl = $('stageLbl');
    const cardsBox = $('cards');
    const aboutLink = $('aboutLink');
    const secs = ['s0', 's1', 's2'].map((id) => $(id));
    if (!vp || !track || !s2el || !railEl || !pFig || !chip || !lbl || !cardsBox || !aboutLink) return;
    if (secs.some((s) => !s)) return;
    const sections = secs as HTMLElement[];
    const railItems = Array.from(railEl.querySelectorAll<HTMLElement>('[data-rail]'));
    const panels = [pFig, ...works.map((_, i) => $(`wp${i + 1}`))].filter(Boolean) as HTMLElement[];
    const cards = works.map((_, i) => $(`c${i + 1}`)).filter(Boolean) as HTMLElement[];
    const lblTxt = [
      'Stage — 默认展示位',
      ...works.map((w, i) => `Preview — ${String(i + 1).padStart(2, '0')} ${w.title}`),
    ];

    let engine = false;
    let cur = 0;
    let small = false;
    const H = () => vp.clientHeight;
    const W = () => vp.clientWidth;
    const setTrack = (y: number, ms: number) => {
      track.style.transition = ms ? `transform ${ms}ms ${EASE}` : 'none';
      track.style.transform = `translate3d(0,${y}px,0)`;
    };
    // S2 从右侧水平推入（s1↔s2 为横向转场，设计稿原样）
    const setS2 = (x: number, ms: number) => {
      s2el.style.transition = ms ? `transform ${ms}ms ${EASE}` : 'none';
      s2el.style.transform = `translate3d(${x}px,0,0)`;
    };
    const setRail = (n: number) =>
      railItems.forEach((it, i) => {
        const bar = it.querySelector<HTMLElement>('[data-rbar]');
        const num = it.querySelector<HTMLElement>('[data-rnum]');
        if (bar) bar.style.background = i === n ? 'var(--ink)' : 'transparent';
        if (num) {
          num.style.color = i === n ? 'var(--accent)' : 'var(--n500)';
          if (i === n && fxRail)
            num.animate(
              [
                { transform: 'translateY(60%)', opacity: 0 },
                { transform: 'translateY(0)', opacity: 1 },
              ],
              { duration: MICRO, easing: EASE },
            );
        }
      });
    // 翻幕到位后不再有幕内 stagger/闪帧（用户真机否决 2026-07-24）——入场编排仅 S0 首载一次。

    // ---------- 分页引擎（物理原样移植） ----------
    let acc = 0;
    let lockUntil = 0;
    let lockDir = 0;
    let needRearm = false;
    let lastInputT = 0;
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;
    const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
    const applyOffset = () => {
      const sign = Math.sign(acc) || 1;
      const pv = Math.min(Math.abs(acc) / COMMIT_DIST, 1);
      if (cur === 1 && sign > 0) {
        setS2(W() - MAX_PEEK * W() * easeOut(pv), 0);
        return;
      }
      if (cur === 2) {
        setS2(sign < 0 ? MAX_PEEK * W() * easeOut(pv) : -0.03 * W() * easeOut(pv), 0);
        return;
      }
      const end = cur === 0 && sign < 0;
      const off = (end ? 0.03 : MAX_PEEK) * H() * easeOut(pv) * sign;
      setTrack(-Math.min(cur, 1) * H() - off, 0);
    };
    const springBack = () => {
      acc = 0;
      setTrack(-Math.min(cur, 1) * H(), SPRING_MS);
      setS2(cur === 2 ? 0 : W(), SPRING_MS);
    };
    const commit = (n: number, sign: number) => {
      n = Math.max(0, Math.min(N, n));
      clearTimeout(pauseTimer);
      if (n === cur) {
        springBack();
        return;
      }
      lockDir = sign || Math.sign(n - cur);
      lockUntil = performance.now() + PUSH_MS + LOCK_TAIL;
      needRearm = true;
      acc = 0;
      cur = n;
      setTrack(-Math.min(n, 1) * H(), PUSH_MS);
      setS2(n === 2 ? 0 : W(), PUSH_MS);
      setRail(n);
    };
    const goScreen = (n: number) => {
      if (performance.now() < lockUntil) return;
      commit(n, Math.sign(n - cur) || 1);
    };
    on(
      vp,
      'wheel',
      (e) => {
        if (!engine) return;
        e.preventDefault();
        const we = e as WheelEvent;
        const now = performance.now();
        let dy = we.deltaY;
        if (we.deltaMode === 1) dy *= 16;
        const sign = Math.sign(dy) || 1;
        if (now < lockUntil) {
          if (sign === lockDir) {
            lastInputT = now;
            return;
          }
        }
        if (needRearm) {
          if (now >= lockUntil && (sign !== lockDir || now - lastInputT >= SILENCE)) needRearm = false;
          else {
            lastInputT = now;
            return;
          }
        }
        lastInputT = now;
        if (Math.sign(acc) !== sign) acc = 0;
        acc += dy;
        const p = Math.abs(acc) / COMMIT_DIST;
        applyOffset();
        clearTimeout(pauseTimer);
        if (p >= COMMIT_P || Math.abs(dy) >= FLICK_V) {
          commit(cur + sign, sign);
          return;
        }
        pauseTimer = setTimeout(springBack, PAUSE_SNAP);
      },
      { passive: false },
    );
    let tch: { y: number; t: number } | null = null;
    on(vp, 'pointerdown', (e) => {
      const pe = e as PointerEvent;
      if (!engine || pe.pointerType !== 'touch') return;
      const path = pe.composedPath ? pe.composedPath() : [pe.target];
      if (
        path.some(
          (t) =>
            t instanceof Element && /^(A|BUTTON|INPUT|TEXTAREA|SELECT)$/.test(t.tagName),
        )
      )
        return;
      tch = { y: pe.clientY, t: performance.now() };
    });
    on(vp, 'pointermove', (e) => {
      if (!engine || !tch) return;
      const pe = e as PointerEvent;
      const d = tch.y - pe.clientY;
      const sign = Math.sign(d) || 1;
      if (cur === 1 && sign > 0) {
        setS2(Math.max(W() - d, 0), 0);
        return;
      }
      if (cur === 2) {
        setS2(sign < 0 ? Math.min(-d, W()) : -d * 0.3, 0);
        return;
      }
      const end = cur === 0 && sign < 0;
      setTrack(-Math.min(cur, 1) * H() - (end ? d * 0.3 : d), 0);
    });
    const tup = (e: Event) => {
      if (!engine || !tch) return;
      const pe = e as PointerEvent;
      const d = tch.y - pe.clientY;
      const dt = performance.now() - tch.t;
      const v = Math.abs(d) / Math.max(dt, 1);
      tch = null;
      if (performance.now() < lockUntil) {
        springBack();
        return;
      }
      if (Math.abs(d) > H() * TOUCH_COMMIT || v > 0.5) commit(cur + Math.sign(d), Math.sign(d));
      else springBack();
    };
    on(vp, 'pointerup', tup);
    on(vp, 'pointercancel', tup);
    on(document, 'keydown', (e) => {
      if (!engine) return;
      const ke = e as KeyboardEvent;
      const t = (ke.target as HTMLElement | null)?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA') return;
      if (ke.key === 'PageDown' || ke.key === 'ArrowDown') {
        ke.preventDefault();
        goScreen(cur + 1);
      } else if (ke.key === 'PageUp' || ke.key === 'ArrowUp') {
        ke.preventDefault();
        goScreen(cur - 1);
      }
    });
    const railGo = (it: HTMLElement) => {
      const n = Number(it.getAttribute('data-rail'));
      if (engine) goScreen(n);
      else
        window.scrollTo({
          top: sections[n].getBoundingClientRect().top + window.scrollY,
          behavior: 'smooth',
        });
    };
    on(railEl, 'click', (e) => {
      const it = (e.target as HTMLElement).closest<HTMLElement>('[data-rail]');
      if (it) railGo(it);
    });
    on(aboutLink, 'click', (e) => {
      e.preventDefault();
      if (engine) goScreen(1);
      else
        window.scrollTo({
          top: sections[1].getBoundingClientRect().top + window.scrollY,
          behavior: 'smooth',
        });
    });

    // ---------- 舞台三态：偷看 / 回归 / 驻留 ----------
    let showing = 0;
    let pinned = 0;
    let hoverT: ReturnType<typeof setTimeout> | undefined;
    let swapT: ReturnType<typeof setTimeout> | undefined;
    let returnT: ReturnType<typeof setTimeout> | undefined;
    const showP = (el: HTMLElement, vis: boolean) => {
      el.style.visibility = vis ? 'visible' : 'hidden';
      el.style.opacity = vis ? '1' : '0';
    };
    const setCards = () =>
      cards.forEach((c, i) => {
        const num = c.querySelector<HTMLElement>('[data-cnum]');
        const active = pinned === i + 1 || showing === i + 1;
        if (num) num.style.color = active ? 'var(--accent)' : 'var(--n500)';
        c.style.background = pinned === i + 1 ? 'var(--surface)' : 'var(--paper)';
        c.style.borderColor = pinned === i + 1 ? 'var(--accent)' : 'var(--ink)';
      });
    const showStage = (n: number, slow?: boolean) => {
      if (n === showing) return;
      const old = panels[showing];
      const next = panels[n];
      showing = n;
      lbl.textContent = lblTxt[n];
      chip.style.visibility = n === 0 ? 'hidden' : 'visible';
      setCards();
      clearTimeout(swapT);
      const dur = slow ? STRUCT : MICRO;
      if (!fxStage) {
        panels.forEach((p, i) => showP(p, i === n));
        return;
      }
      old.animate(
        [
          { opacity: 1, transform: 'translateY(0)' },
          { opacity: 0, transform: 'translateY(8px)' },
        ],
        { duration: dur, easing: EASE },
      );
      swapT = setTimeout(() => {
        panels.forEach((p, i) => showP(p, i === n));
        next.animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: dur, easing: EASE },
        );
      }, Math.round(dur / 2));
    };
    cards.forEach((c, i) => {
      const n = i + 1;
      on(c, 'mouseenter', () => {
        clearTimeout(returnT);
        if (!hoverPeek) {
          pinned = n;
          showStage(n);
          return;
        }
        if (pinned) return;
        clearTimeout(hoverT);
        hoverT = setTimeout(() => {
          if (!pinned) showStage(n);
        }, 80);
      });
      on(c, 'mouseleave', () => clearTimeout(hoverT));
      on(c, 'click', () => {
        if (small) {
          const href = c.getAttribute('data-href');
          if (href) router.push(href);
          return;
        }
        if (pinned === n) {
          pinned = 0;
          showStage(0, true);
        } else {
          pinned = n;
          showStage(n);
        }
        setCards();
      });
    });
    on(cardsBox, 'mouseleave', () => {
      clearTimeout(hoverT);
      if (!hoverPeek || pinned) return;
      clearTimeout(returnT);
      returnT = setTimeout(() => {
        if (!pinned) showStage(0, true);
      }, RETURN_DELAY);
    });
    on(cardsBox, 'mouseenter', () => clearTimeout(returnT));
    on(chip, 'click', () => {
      pinned = 0;
      showStage(0, true);
      setCards();
    });

    // ---------- 光标读数（lerp 跟随，rAF） ----------
    let craf = 0;
    if (fxCursor) {
      const tag = $('cursorTag');
      if (tag) {
        let tx = 0;
        let ty = 0;
        let px: number | null = null;
        let py = 0;
        let txt = '';
        const tick = () => {
          if (px === null) {
            craf = 0;
            return;
          }
          px += (tx - px) * 0.15;
          py += (ty - py) * 0.15;
          tag.style.transform = `translate3d(${px}px,${py}px,0)`;
          if (Math.abs(tx - px) > 0.5 || Math.abs(ty - py) > 0.5) craf = requestAnimationFrame(tick);
          else craf = 0;
        };
        on(document, 'mousemove', (e) => {
          const me = e as MouseEvent;
          tx = me.clientX + 16;
          ty = me.clientY + 18;
          if (px === null) {
            px = tx;
            py = ty;
          }
          const z = (me.target as HTMLElement | null)?.closest?.('[data-cursor]');
          if (z) {
            const t = z.getAttribute('data-cursor') ?? '';
            if (t !== txt) {
              txt = t;
              tag.textContent = t;
            }
            tag.style.opacity = '1';
          } else tag.style.opacity = '0';
          if (!craf) craf = requestAnimationFrame(tick);
        });
      }
    }

    // ---------- 入场编排（只此一次） ----------
    if (fxEntrance) {
      sections[0].querySelectorAll<HTMLElement>('[data-row]').forEach((row, k) =>
        row.animate(
          [
            { opacity: 0, transform: 'translateY(12px)', clipPath: 'inset(0 0 100% 0)' },
            { opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0 0 -10% 0)' },
          ],
          { duration: STRUCT, delay: k * STAG, easing: EASE, fill: 'backwards' },
        ),
      );
      cards.forEach((c, i) =>
        c.animate(
          [
            { opacity: 0, transform: 'translateY(10px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: MICRO + 80, delay: 260 + i * STAG, easing: EASE, fill: 'backwards' },
        ),
      );
      const ff = $('figFrame');
      if (ff)
        ff.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], {
          duration: STRUCT,
          delay: 400,
          easing: 'linear',
        });
    }

    // ---------- 模式切换：引擎（桌面）↔ 文档流（<1024 / reduced-motion） ----------
    const mqS = window.matchMedia('(max-width: 1023px)');
    const applyMode = () => {
      small = mqS.matches;
      engine = wantPaging && !small;
      vp.style.height = engine ? '100svh' : 'auto';
      vp.style.overflow = engine ? 'hidden' : 'visible';
      track.style.transition = 'none';
      track.style.transform = engine ? `translate3d(0,${-Math.min(cur, 1) * H()}px,0)` : '';
      if (engine) {
        s2el.style.position = 'absolute';
        s2el.style.top = '100svh';
        s2el.style.left = '0';
        s2el.style.right = '0';
        s2el.style.transition = 'none';
        s2el.style.transform = cur === 2 ? 'translate3d(0,0,0)' : `translate3d(${W()}px,0,0)`;
      } else {
        s2el.style.position = 'relative';
        s2el.style.top = '';
        s2el.style.left = '';
        s2el.style.right = '';
        s2el.style.transition = 'none';
        s2el.style.transform = '';
      }
      sections.forEach((sec) => {
        sec.style.height = engine ? '100svh' : 'auto';
        sec.style.minHeight = engine ? '' : '100svh';
        sec.style.overflow = engine ? 'hidden' : 'visible';
      });
      railEl.style.display = engine ? 'flex' : 'none';
      acc = 0;
    };
    applyMode();
    on(mqS, 'change', applyMode);
    on(window, 'resize', () => {
      if (engine) {
        setTrack(-Math.min(cur, 1) * H(), 0);
        setS2(cur === 2 ? 0 : W(), 0);
      }
    });
    setCards();
    // 深链：/#lab（SiteNav 自内页链回）→ 引擎态直接落到 S2
    if (engine && window.location.hash === '#lab') {
      window.scrollTo(0, 0);
      cur = 2;
      setTrack(-H(), 0);
      setS2(0, 0);
      setRail(2);
    }

    return () => {
      offs.forEach((f) => f());
      if (craf) cancelAnimationFrame(craf);
      clearTimeout(pauseTimer);
      clearTimeout(hoverT);
      clearTimeout(swapT);
      clearTimeout(returnT);
    };
  }, [router, works]);

  return (
    <div ref={rootRef}>
      {/* 光标读数标签（hover:hover 门控在 effect 内） */}
      <div
        id="cursorTag"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 95,
          pointerEvents: 'none',
          opacity: 0,
          padding: '5px 10px',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          background: 'var(--ink)',
          color: 'var(--paper)',
          whiteSpace: 'nowrap',
          transition: 'opacity var(--dur-micro) var(--ease-site)',
        }}
      />

      {/* 右缘 rail（仅引擎态显示，applyMode 控制） */}
      <div
        id="rail"
        style={{
          position: 'fixed',
          right: 14,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 90,
          display: 'none',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {['S0', 'S1', 'S2'].map((s, i) => (
          <button key={s} type="button" className="rail-btn" data-rail={i} data-cursor={`Go ${s} →`}>
            <span
              data-rbar
              style={{
                display: 'inline-block',
                width: 14,
                height: 2,
                background: i === 0 ? 'var(--ink)' : 'transparent',
              }}
            />
            <span
              data-rnum
              className="mono"
              style={{
                display: 'inline-block',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: i === 0 ? 'var(--accent)' : 'var(--n500)',
              }}
            >
              {String(i).padStart(2, '0')}
            </span>
          </button>
        ))}
      </div>

      <main id="vp" style={{ position: 'relative' }}>
        <div id="track" style={{ willChange: 'transform' }}>
          {/* ——— S0 枢纽幕 ——— */}
          <section id="s0" style={SECTION_BASE}>
            <div
              className="hub-grid"
              style={{
                flex: 1,
                minHeight: 0,
                maxWidth: 1400,
                width: '100%',
                margin: '0 auto',
                padding: '28px 64px 32px 48px',
                boxSizing: 'border-box',
              }}
            >
              <div className="flex min-h-0 flex-col" style={{ gap: 16 }}>
                <p
                  data-row
                  className="flex justify-between"
                  style={{
                    margin: 0,
                    gap: 16,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--n600)',
                  }}
                >
                  <span>
                    <span style={{ color: 'var(--ink)', fontWeight: 800 }}>[Name]</span> — Portfolio
                    2026
                  </span>
                  <span style={{ color: 'var(--accent)' }}>The solver runs live</span>
                </p>
                <h1
                  data-row
                  style={{
                    fontSize: 'clamp(34px, 3.4vw, 52px)',
                    fontWeight: 800,
                    lineHeight: 0.98,
                    letterSpacing: '-0.02em',
                    margin: 0,
                    textTransform: 'uppercase',
                    maxWidth: '16ch',
                  }}
                >
                  Structures that move, <span style={{ color: 'var(--accent)' }}>machines that live.</span>
                </h1>
                <p data-row style={{ fontSize: 14, lineHeight: 1.5, margin: 0, maxWidth: '44ch' }}>
                  Mechanism design, custom physics solvers, and human–robot interaction research.
                  Four projects, built and measured.
                </p>
                <div id="cards" className="hub-cards">
                  {works.map((w, i) => (
                    <button
                      key={w.slug}
                      type="button"
                      id={`c${i + 1}`}
                      className="hub-card"
                      data-card={i + 1}
                      data-cursor={`View ${String(i + 1).padStart(2, '0')} →`}
                      data-href={w.published ? `/work/${w.slug}` : '/archive'}
                    >
                      <span className="flex items-baseline justify-between" style={{ gap: 10 }}>
                        <span
                          data-cnum
                          style={{
                            fontSize: 24,
                            fontWeight: 800,
                            color: 'var(--n500)',
                            transition: 'color var(--dur-micro) var(--ease-site)',
                          }}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: w.published ? 'var(--accent)' : 'var(--n600)',
                          }}
                        >
                          {w.published ? 'live' : 'in prep'}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          lineHeight: 1.25,
                        }}
                      >
                        {w.title}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.08em',
                          color: 'var(--n600)',
                        }}
                      >
                        {w.published ? w.date : 'TBD'}
                      </span>
                    </button>
                  ))}
                </div>
                <a data-row id="aboutLink" href="#about-preview" data-cursor="Go S1 →" style={LINK_11}>
                  About + contact ↓
                </a>
                <div
                  data-row
                  className="flex flex-wrap"
                  style={{
                    marginTop: 'auto',
                    borderTop: '2px solid var(--ink)',
                    paddingTop: 10,
                    gap: 24,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--n600)',
                  }}
                >
                  {STATS.map((s) => (
                    <span key={s.label}>
                      <b style={{ color: s.accent ? 'var(--accent)' : 'var(--ink)', fontWeight: 800 }}>
                        {s.n}
                      </b>{' '}
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* 预览舞台（默认位 = 空占位，用户拍板 2026-07-24：先空着） */}
              <div
                id="wstage"
                data-row
                className="hub-stage"
                style={{ border: '1px solid var(--n400)', minHeight: 0, flexDirection: 'column' }}
              >
                <div
                  className="flex items-center justify-between"
                  style={{ gap: 16, padding: '10px 16px', borderBottom: '1px solid var(--n400)' }}
                >
                  <span
                    id="stageLbl"
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Stage — 默认展示位
                  </span>
                  <button id="figChip" type="button" className="figchip" style={{ visibility: 'hidden' }}>
                    00 · Stage
                  </button>
                </div>
                <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                  <div
                    id="pFig"
                    data-cursor="Stage — 待定"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      padding: 20,
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
                      <div
                        id="figFrame"
                        style={{
                          position: 'absolute',
                          inset: -10,
                          border: '1px solid var(--accent)',
                          opacity: 0,
                          pointerEvents: 'none',
                        }}
                      />
                      <div
                        className="flex flex-col items-center justify-center text-center"
                        style={{
                          flex: 1,
                          border: '2px dashed var(--n400)',
                          gap: 10,
                          padding: 24,
                          boxSizing: 'border-box',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'var(--accent)',
                          }}
                        >
                          [待定] 默认展示位
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            lineHeight: 1.6,
                            color: 'var(--n600)',
                            maxWidth: '32ch',
                          }}
                        >
                          后续放置：动态图形 / 精选画面。
                          <br />
                          悬停左侧卡片即可预览各项目。
                        </span>
                      </div>
                    </div>
                    <div className="flex items-baseline justify-between" style={{ gap: 16 }}>
                      <span style={UPPER_11}>Stage 00 · placeholder</span>
                      <span className="tag tag-outline">tbd</span>
                    </div>
                  </div>
                  {works.map((w, i) => (
                    <div
                      key={w.slug}
                      id={`wp${i + 1}`}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        padding: 20,
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        visibility: 'hidden',
                        opacity: 0,
                      }}
                    >
                      <StagePlaceholderPanel work={w} index={i} />
                    </div>
                  ))}
                </div>
              </div>
            </div>          </section>

          {/* ——— S1 About 幕 ——— */}
          <section
            id="s1"
            style={{ ...SECTION_BASE, borderTop: '2px solid var(--ink)' }}
          >
            <span id="about-preview" />
            <div
              className="flex flex-col"
              style={{
                flex: 1,
                minHeight: 0,
                maxWidth: 1400,
                width: '100%',
                margin: '0 auto',
                padding: '24px 64px 32px 48px',
                boxSizing: 'border-box',
                gap: 16,
              }}
            >
              <div data-row className="flex items-baseline justify-between" style={{ minHeight: 24 }}>
                <h2 style={SCREEN_H2}>
                  <span style={{ color: 'var(--accent)' }}>S1</span> · About
                </h2>
                <Link href="/about" style={LINK_11}>
                  Full about →
                </Link>
              </div>
              <h2
                data-row
                style={{
                  fontSize: 'clamp(34px, 3.6vw, 54px)',
                  fontWeight: 800,
                  lineHeight: 0.98,
                  letterSpacing: '-0.02em',
                  margin: 0,
                  textTransform: 'uppercase',
                  maxWidth: '20ch',
                }}
              >
                Builder first, researcher by method.
              </h2>
              <div
                data-row
                className="grid items-stretch gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
                style={{ flex: 1, minHeight: 0 }}
              >
                <div className="flex flex-col" style={{ gap: 16 }}>
                  <div className="placeholder-note" style={{ padding: '12px 16px', maxWidth: '60ch' }}>
                    <span style={{ fontWeight: 800, color: 'var(--accent)' }}>[待作者供稿]</span> 摘要 —
                    两三句：背景、方向、申请目标。
                  </div>
                  <div className="grid grid-cols-2" style={{ borderTop: '2px solid var(--ink)' }}>
                    <div style={{ padding: '12px 16px 0 0', borderRight: '2px solid var(--ink)' }}>
                      <div style={CELL_LABEL}>Contact</div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--n700)' }}>
                        [email placeholder]
                        <br />
                        GitHub · plain URLs · no password
                      </div>
                    </div>
                    <div style={{ padding: '12px 0 0 16px' }}>
                      <div style={CELL_LABEL}>Currently</div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--n700)' }}>
                        <span style={{ color: 'var(--rose)' }}>●</span> [待作者供稿] 状态一行
                      </div>
                    </div>
                  </div>
                  <div
                    className="grid grid-cols-2"
                    style={{ marginTop: 'auto', borderTop: '2px solid var(--ink)' }}
                  >
                    <div style={{ padding: '12px 16px 0 0', borderRight: '2px solid var(--ink)' }}>
                      <div style={CELL_LABEL}>Role</div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--n700)' }}>
                        Concept &amp; research design · mechanism &amp; fabrication · electronics &amp;
                        behavior · HRI study
                      </div>
                    </div>
                    <div style={{ padding: '12px 0 0 16px' }}>
                      <div style={CELL_LABEL}>Tools</div>
                      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--n700)' }}>
                        Rhino / Grasshopper · SLS / FDM / resin · ESP32 · ELAN · TypeScript solvers
                      </div>
                    </div>
                  </div>
                </div>
                <figure className="flex min-h-0 flex-col" style={{ margin: 0, gap: 8 }}>
                  <div className="hatch" style={{ flex: 1, minHeight: 200 }}>
                    <span style={UPPER_11}>[待作者供稿] 人像 — duotone green</span>
                  </div>
                  <figcaption
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--n600)',
                    }}
                  >
                    Portrait · duotone green
                  </figcaption>
                </figure>
              </div>
            </div>          </section>

          {/* ——— S2 Lab + Log + 页脚幕 ——— */}
          <section
            id="s2"
            style={{ ...SECTION_BASE, borderTop: '2px solid var(--ink)' }}
          >
            <span id="lab" />
            <div
              className="flex flex-col"
              style={{
                flex: 1,
                minHeight: 0,
                maxWidth: 1400,
                width: '100%',
                margin: '0 auto',
                padding: '24px 64px 0 48px',
                boxSizing: 'border-box',
                gap: 14,
              }}
            >
              <div data-row className="flex items-baseline justify-between" style={{ minHeight: 24 }}>
                <h2 style={SCREEN_H2}>
                  <span style={{ color: 'var(--accent)' }}>S2</span> · The lab
                </h2>
                <span style={UPPER_11}>Solver testbenches · all live</span>
              </div>
              <div
                data-row
                className="grid grid-cols-2 lg:grid-cols-4"
                style={{ gap: 2, background: 'var(--ink)', border: '2px solid var(--ink)' }}
              >
                {LABS.map((lab) => (
                  <a key={lab.kicker} href={lab.href} className="card" style={{ gap: 6 }}>
                    <div className="card-kicker">{lab.kicker}</div>
                    <div className="card-title">{lab.title}</div>
                    <p className="card-body">{lab.body}</p>
                    <div className="card-meta">{lab.meta}</div>
                  </a>
                ))}
              </div>
              <div
                data-row
                className="flex items-baseline justify-between"
                style={{ marginTop: 6 }}
              >
                <h2 style={SCREEN_H2}>Work log</h2>
                <Link href="/archive" style={LINK_11}>
                  All entries →
                </Link>
              </div>
              <div data-row style={{ flex: 1, minHeight: 0 }}>
                {LOG_PREVIEW.map((e, i) => (
                  <div
                    key={e.date}
                    className="grid grid-cols-[110px_1fr]"
                    style={{
                      gap: 14,
                      padding: '11px 0',
                      borderTop: '2px solid var(--ink)',
                      ...(i === LOG_PREVIEW.length - 1
                        ? { borderBottom: '2px solid var(--ink)' }
                        : {}),
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800 }}>{e.date}</span>
                    <span style={{ fontSize: 13, color: 'var(--n700)' }}>{e.text}</span>
                  </div>
                ))}
                <p
                  style={{
                    margin: '8px 0 0',
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--n600)',
                  }}
                >
                  Colophon —{' '}
                  <span style={{ borderBottom: '2px dashed var(--n400)' }}>
                    [待作者供稿] 一句：这个站本身如何被构建
                  </span>
                </p>
              </div>
            </div>
            <footer style={{ background: 'var(--g900)', color: 'var(--g100)' }}>
              <div
                className="flex items-baseline justify-between"
                style={{
                  maxWidth: 1400,
                  margin: '0 auto',
                  padding: '24px 64px 24px 48px',
                  gap: 32,
                }}
              >
                <span
                  className="hub-footer-email"
                  style={{
                    fontSize: 'clamp(22px, 2.2vw, 32px)',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '-0.01em',
                  }}
                >
                  [email placeholder]
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--g400)',
                  }}
                >
                  GitHub · no password · plain URLs
                </span>
              </div>
            </footer>          </section>
        </div>
      </main>
    </div>
  );
}
