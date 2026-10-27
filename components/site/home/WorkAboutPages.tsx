'use client';

import Link from 'next/link';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type SyntheticEvent,
} from 'react';
import type { HomeWorkGroup, HomeWorkTile } from '../../../src/lib/site/home-model';
import { WORK_PER_PANEL as PER } from '../../../src/lib/site/home-model';
import {
  WC,
  carouselNav,
  cascadeOrder,
  hintOf,
  nudgeSide,
  proximity,
  rangeLabel,
  type Side,
} from '../../../src/lib/site/work-carousel';
import { HOME_WORK_PANEL_KEY } from '../pageTransitionState';

const n2 = (i: number) => String(i).padStart(2, '0');
/** 其他作品的图走 Next 图片优化（作者给的原图可能很大）；主项目卡沿用稿内两张小图原样 */
const thumb = (src: string) => `/_next/image?url=${encodeURIComponent(src)}&w=828&q=75`;
/** 离开首页时停在第几屏由页面转场编排层记下（MAPPING §48「返回落回原处」）；太旧的不用 */
const PANEL_MEMORY_MS = 30 * 60 * 1000;
/** 触控板左右划：阈值与锁定时长同翻页引擎（36 / 900ms）；横向手势后 250ms 内的竖向余量一并吞掉，免得顺带翻页 */
const H_THRESHOLD = 36;
const H_LOCK_MS = 900;
const H_TAIL_MS = 250;
/** 翻到 Work 页时入场编排的起点比稿晚 360ms（翻页引擎 480 对稿 120），闲置第一次探一下跟着晚 */
const ENTER_SHIFT_MS = 360;
const EO = 'cubic-bezier(.2,.7,.1,1)';
const EIO = 'cubic-bezier(.76,0,.24,1)';

/* ───────────────────────── 02 Work ───────────────────────── */

interface CardProps {
  t: HomeWorkTile;
  /** 卡在这一屏里排第几（入场错峰用） */
  c: number;
  /** 在当前屏：只有当前屏的卡参与入场编排、可聚焦 */
  cur: boolean;
  on: boolean;
  focusable: boolean;
  vars: CSSProperties;
  onEnter: (e: SyntheticEvent<HTMLElement>) => void;
}

function WorkCard({ t, c, cur, on, focusable, vars, onEnter }: CardProps) {
  const body = (
    <>
      <span
        className={`hs-card__kick${t.caseSlug ? ' hs-card__kick--big' : ''}`}
        data-a={cur ? 'up' : undefined}
        data-d={160 + c * 90}
      >
        {t.caseSlug ? (
          // 主项目：编号放大成宽体粗字、下半截压进图版；还没发稿的（项目三）用空心编号，已发稿的实心（MAPPING §64 / §64.1）
          <span className="hs-card__kick-n hs-card__kick-n--big">
            <span className={`hs-card__num${t.wip ? ' hs-card__num--wip' : ''}`}>{t.kickN}</span>
            <span className="hs-card__kick-l">{t.kickLabel}</span>
          </span>
        ) : (
          <span className="hs-card__kick-n">{t.kick}</span>
        )}
        <span className={`hs-card__status${t.wip ? ' hs-card__status--wip' : ''}`}>{t.status}</span>
      </span>
      <span className="hs-card__box" data-a={cur ? 'wipe' : undefined} data-d={200 + c * 90}>
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
              <span className="hs-card__wip-in">
                <span className="hs-card__wip-badge">{t.caseSlug ? 'In progress' : 'Image to come'}</span>
                {t.caseSlug ? <span className="hs-card__wip-note">case study to come</span> : null}
              </span>
            </span>
          )}
        </span>
        <span className="hs-card__veil" />
        <span className="hs-card__bar" data-bar={t.key} />
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
  const common = {
    className: `hs-card${on ? ' hs-is-on' : ''}`,
    style: { '--c-ink': t.tone.ink, '--c-hi': t.tone.hi, ...vars } as CSSProperties,
    tabIndex: focusable ? undefined : -1,
    onMouseEnter: onEnter,
    onFocus: onEnter,
  };
  if (/^https:\/\//.test(t.href)) {
    return (
      <a {...common} href={t.href} target="_blank" rel="noopener noreferrer">
        {body}
      </a>
    );
  }
  return (
    <Link
      {...common}
      href={t.href}
      // 页面转场（MAPPING §48）：这张卡展开成它的详情页（主项目的案例页 / 其他作品的详情页，§60）；
      // 从详情页回作品区 = 收回到这张卡
      data-pt={t.ptSlug ? 'card' : undefined}
      data-pt-card={t.ptSlug ?? undefined}
    >
      {body}
    </Link>
  );
}

interface WState {
  cur: number;
  from: number;
  /** 正在切换（WC.MOVING_MS 内）：不出续接暗示、光标标签 */
  moving: boolean;
  /** 指针停在哪一侧的留白区 */
  zone: Side | null;
  press: boolean;
  /** 悬停的卡（key） */
  wh: string | null;
  /** 悬停时标题上移多少、正文从多高开始 */
  wm: { ty: number; top: number };
  /** 舞台宽、舞台左右离页面边缘多远（量出来的） */
  W: number;
  L: number;
  Rg: number;
  /** 刻度盘指针累计转了几格（绕回时继续往同一个方向转） */
  turn: number;
  tabHover: number | null;
  /** 闲置探一下 */
  nudge: Side | null;
  prox: { side: Side | null; t: number };
  ind: { x: number; y: number; w: number } | null;
  indReady: boolean;
  /** 返回落回原屏：这一帧不放过渡 */
  instant: boolean;
}

const NO_PROX = { side: null, t: 0 } as const;
const INIT: WState = {
  cur: 0,
  from: 0,
  moving: false,
  zone: null,
  press: false,
  wh: null,
  wm: { ty: 0, top: 70 },
  W: 1216,
  L: 96,
  Rg: 128,
  turn: 0,
  tabHover: null,
  nudge: null,
  prox: NO_PROX,
  ind: null,
  indReady: false,
  instant: false,
};

interface Badge {
  arrow: string;
  k1: string;
  k2: string;
  side: Side;
}

/**
 * 02 Work 按组横向切换（稿「18 Home · Work Carousel」，MAPPING §59；分组规则见 §58）：
 * 第一组是三个主项目，后面每组一种类别，一屏三张，一组超过三张就分几屏接着切，最后一屏接回第一屏。
 * 当前屏占舞台 85%，旁边那一屏露出一截；左右留白区悬停有跟着光标的标签，点一下就切。
 * 竖向滚动照旧归翻页引擎；左右只认组内切换——底部组名、右上箭头、← → 键、触控板左右划、触屏左右划、留白区。
 * 窄屏 / reduced-motion 回落文档流：各组上下依次排开，不做横向切换（CSS 同一条件）。
 */
export function WorkPage({ groups, active, flow }: { groups: HomeWorkGroup[]; active: boolean; flow: boolean }) {
  const panels = useMemo(
    () =>
      groups.flatMap((g, gi) => {
        const pages = Math.max(1, Math.ceil(g.tiles.length / PER));
        return Array.from({ length: pages }, (_, pi) => ({
          gi,
          pi,
          pages,
          tiles: g.tiles.slice(pi * PER, (pi + 1) * PER),
        }));
      }),
    [groups],
  );
  const P = panels.length;
  const firstOf = useMemo(() => groups.map((_, gi) => panels.findIndex((p) => p.gi === gi)), [groups, panels]);

  const [s, setS] = useState<WState>(INIT);
  const sRef = useRef(s);
  sRef.current = s;
  const set = (p: Partial<WState>) => setS((o) => ({ ...o, ...p }));

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const timers = useRef<{ mv?: ReturnType<typeof setTimeout>; nudge?: ReturnType<typeof setTimeout>; nudge2?: ReturnType<typeof setTimeout> }>({});
  const nudges = useRef(0);
  const live = useRef(false);
  live.current = active && !flow;
  const follow = useRef({ bx: 0, by: 0, tx: 0, ty: 0, raf: 0 });
  const lastBadge = useRef<Badge | null>(null);
  const prevCur = useRef(0);

  /* 命令：事件监听与计时器经 api.current 调用，读到的总是最新一次渲染的闭包 */
  const go = (t: number, td?: number) => {
    const T = timers.current;
    if (t === sRef.current.cur) return;
    clearTimeout(T.mv);
    clearTimeout(T.nudge2);
    setS((o) =>
      o.cur === t
        ? o
        : { ...o, from: o.cur, cur: t, moving: true, wh: null, nudge: null, turn: o.turn + (td ?? t - o.cur) },
    );
    T.mv = setTimeout(() => set({ moving: false }), WC.MOVING_MS);
    armIdle(WC.NUDGE_AFTER_GO_MS);
  };
  const step = (d: number) => {
    const n = carouselNav(sRef.current.cur, d, P);
    if (!n) return;
    go(n.t, d);
    // 光标标签里那枚箭头：往前推一下；绕回时转一圈
    const a = arrowRef.current;
    if (a && sRef.current.zone) {
      a.animate(
        n.wrap
          ? [{ transform: 'rotate(0)' }, { transform: `rotate(${d > 0 ? -360 : 360}deg)` }]
          : [{ transform: 'none' }, { transform: `translateX(${d * 9}px)` }, { transform: 'none' }],
        { duration: n.wrap ? 900 : 520, easing: n.wrap ? EIO : EO },
      );
    }
  };
  // 闲置时整排往有内容的一侧探一下，最多 4 次；悬停、切换、靠边、看卡时不探，过一会儿再试
  const armIdle = (ms: number) => {
    const T = timers.current;
    clearTimeout(T.nudge);
    if (!live.current || nudges.current >= WC.NUDGE_MAX) return;
    T.nudge = setTimeout(() => api.current.fireNudge(), ms);
  };
  const fireNudge = () => {
    const st = sRef.current;
    if (!live.current) return;
    if (st.zone || st.moving || st.prox.side || st.wh) return armIdle(WC.NUDGE_RETRY_MS);
    const side = nudgeSide(st.cur, P);
    if (!side) return;
    nudges.current++;
    set({ nudge: side });
    timers.current.nudge2 = setTimeout(() => {
      set({ nudge: null });
      armIdle(WC.NUDGE_AFTER_MS);
    }, WC.NUDGE_HOLD_MS);
  };
  const api = useRef({ step, fireNudge });
  api.current = { step, fireNudge };

  /* 光标标签：跟着指针走，每帧追一半 */
  const tick = () => {
    const f = follow.current;
    f.bx += (f.tx - f.bx) * 0.5;
    f.by += (f.ty - f.by) * 0.5;
    const b = badgeRef.current;
    if (b) b.style.transform = `translate(${f.bx.toFixed(1)}px, ${f.by.toFixed(1)}px)`;
    f.raf = Math.abs(f.tx - f.bx) > 0.3 || Math.abs(f.ty - f.by) > 0.3 ? requestAnimationFrame(tick) : 0;
  };
  const aim = (e: MouseEvent, snap = false) => {
    const r = rootRef.current;
    if (!r) return;
    const rr = r.getBoundingClientRect();
    const f = follow.current;
    f.tx = e.clientX - rr.left;
    f.ty = e.clientY - rr.top;
    if (snap) {
      f.bx = f.tx;
      f.by = f.ty;
    }
    if (!f.raf) f.raf = requestAnimationFrame(tick);
  };

  // 从首页离开前在第几屏，回来就落在第几屏（只在深链 /#work 落地时用，且不放过渡）
  useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(HOME_WORK_PANEL_KEY);
      sessionStorage.removeItem(HOME_WORK_PANEL_KEY);
      const v = raw ? (JSON.parse(raw) as { i?: number; at?: number }) : null;
      if (window.location.hash !== '#work' || !v || typeof v.i !== 'number') return;
      if (Date.now() - (v.at ?? 0) > PANEL_MEMORY_MS || v.i <= 0 || v.i >= P) return;
      prevCur.current = v.i;
      setS((o) => ({ ...o, instant: true, cur: v.i!, from: v.i!, turn: v.i! }));
    } catch {
      /* sessionStorage 不可用就从第一屏开始 */
    }
  }, [P]);
  useEffect(() => {
    if (!s.instant) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => set({ instant: false })));
    return () => cancelAnimationFrame(r);
  }, [s.instant]);

  // 舞台宽与左右留白：露边宽度、留白区宽度、裁切都按它算
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const sec = rootRef.current?.parentElement;
    if (!stage || !sec) return;
    const measure = () => {
      const rr = sec.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      const W = Math.round(sr.width);
      const L = Math.round(sr.left - rr.left);
      const Rg = Math.round(rr.right - sr.right);
      setS((o) => (o.W === W && o.L === L && o.Rg === Rg ? o : { ...o, W, L, Rg }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sec);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // 底部组名下那道 2px 滑到当前组；组名折行时也跟着换行；第一次落位不放过渡
  const curGi = panels[Math.min(s.cur, P - 1)].gi;
  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const place = () => {
      const el = tabs.querySelector<HTMLElement>(`[data-tab="${curGi}"]`);
      if (!el) return;
      const v = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth };
      setS((o) => (o.ind && o.ind.x === v.x && o.ind.y === v.y && o.ind.w === v.w ? o : { ...o, ind: v }));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(tabs);
    return () => ro.disconnect();
  }, [curGi]);
  useEffect(() => {
    if (!s.ind || s.indReady) return;
    const r = requestAnimationFrame(() => set({ indReady: true }));
    return () => cancelAnimationFrame(r);
  }, [s.ind, s.indReady]);

  // 落到新屏：那几张卡顶上的色条按滑动方向依次长出来
  useEffect(() => {
    if (prevCur.current === s.cur) return;
    prevCur.current = s.cur;
    const stage = stageRef.current;
    if (s.instant || flow || !stage) return;
    const fwd = s.cur > s.from;
    panels[s.cur].tiles.forEach((t, c) => {
      const el = stage.querySelector<HTMLElement>(`[data-bar="${t.key}"]`);
      if (!el) return;
      el.style.transformOrigin = fwd ? '0 50%' : '100% 50%';
      el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
        duration: 820,
        delay: cascadeOrder(s.cur, c, s.from, s.cur, PER) * WC.STAGGER_MS + WC.BAR_DELAY_MS,
        easing: EO,
        fill: 'backwards',
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.cur]);

  // 翻到 Work 页才开始闲置探一下；翻走就收起一切悬停态
  useEffect(() => {
    if (active && !flow) {
      armIdle(WC.NUDGE_FIRST_MS + ENTER_SHIFT_MS);
      return;
    }
    const T = timers.current;
    clearTimeout(T.nudge);
    clearTimeout(T.nudge2);
    setS((o) =>
      !o.zone && !o.press && !o.nudge && !o.prox.side && !o.wh && o.tabHover == null
        ? o
        : { ...o, zone: null, press: false, nudge: null, prox: NO_PROX, wh: null, tabHover: null },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, flow]);

  useEffect(
    () => () => {
      const T = timers.current;
      [T.mv, T.nudge, T.nudge2].forEach(clearTimeout);
      cancelAnimationFrame(follow.current.raf);
    },
    [],
  );

  // ← → 键：只在 Work 页是当前页时接
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      if ((e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable], [role="slider"]')) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        api.current.step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        api.current.step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

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
        api.current.step(acc > 0 ? 1 : -1);
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
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) api.current.step(dx < 0 ? 1 : -1);
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchend', onEnd);
    };
  }, [flow]);

  /* ───── 这一帧的样子（稿 renderVals 的移植） ───── */
  const st = s;
  const cp = panels[Math.min(st.cur, P - 1)];
  const cg = groups[cp.gi];
  const zn = st.zone ? carouselNav(st.cur, st.zone === 'r' ? 1 : -1, P) : null;
  const prox = !st.zone && !st.moving && !st.nudge ? st.prox : NO_PROX;
  // 暗示来源优先级：悬停留白区 > 闲置探一下 > 靠近边缘
  const effZone: Side | null = st.zone || st.nudge || prox.side;
  const en = effZone ? carouselNav(st.cur, effZone === 'r' ? 1 : -1, P) : null;
  const hint =
    !st.moving && en && effZone ? hintOf(st.zone ? 'zone' : st.nudge ? 'nudge' : 'prox', effZone, en.wrap, prox.t) : { x: 0, op: 0 };
  const Wp = Math.round(st.W * (1 - WC.PEEK));
  // 组名放大后按最长那个定字号，切到哪组都不顶到右边的刻度盘（MAPPING §64.1）
  const tlen = groups.reduce((m, gr) => Math.max(m, gr.title.length), 0);
  const tgtGi = zn ? panels[zn.t].gi : null;
  const onPanel = st.wh ? panels.findIndex((pn) => pn.tiles.some((t) => t.key === st.wh)) : -1;

  const cardVars = (p: number, c: number, last: number, key: string): CSSProperties => {
    const rel = p - st.cur;
    const isCur = rel === 0;
    const delay = st.moving ? cascadeOrder(p, c, st.from, st.cur, PER) * WC.STAGGER_MS : 0;
    const hinted = !st.moving && !!en && !en.wrap && p === en.t && (effZone === 'r' ? c === 0 : c === last);
    const moveTr = `transform ${WC.MOVE_MS}ms ${EIO} ${delay}ms`;
    return {
      '--x': `${rel * (Wp + WC.GAP) + hint.x}px`,
      '--op': isCur ? (st.wh && st.wh !== key ? 0.42 : 1) : hinted ? Math.max(WC.REST_OP, hint.op) : WC.REST_OP,
      '--tr': st.instant ? 'none' : st.moving ? `${moveTr}, opacity 700ms ease ${delay}ms` : `transform 700ms ${EO}, opacity 450ms ease`,
      '--img-tr': st.instant ? 'none' : st.moving ? moveTr : `transform 1.2s ${EO}`,
      '--par': `${Math.max(-1, Math.min(1, rel)) * -7}%`,
      '--txt-op': isCur || (rel === 1 && c === 0) ? 1 : 0,
      '--head-op': isCur ? 1 : 0,
      '--txt-d': isCur && st.moving ? `${delay + 250}ms` : '0ms',
      ...(st.wh === key ? { '--ty': `${st.wm.ty}px`, '--th-top': `${st.wm.top}px` } : null),
    } as CSSProperties;
  };
  const enterCard = (key: string, isCur: boolean) => (e: SyntheticEvent<HTMLElement>) => {
    if (!isCur && !flow) return;
    const el = e.currentTarget.querySelector<HTMLElement>('[data-wt]');
    const top = el ? el.offsetTop + (el.offsetParent as HTMLElement).offsetTop : 0;
    // 主项目卡的大编号压在图版上沿：展开时标题落在编号下面，不和它叠（MAPPING §64.1）
    const kick = e.currentTarget.querySelector<HTMLElement>('.hs-card__kick--big');
    const box = e.currentTarget.querySelector<HTMLElement>('.hs-card__box');
    const pad = 20 + (kick && box ? Math.max(0, kick.getBoundingClientRect().bottom - box.getBoundingClientRect().top) : 0);
    setS((o) => ({ ...o, wh: key, wm: { ty: pad - top, top: pad + (el ? el.offsetHeight : 30) + 14 } }));
  };

  // 光标标签：离开留白区时内容留着，只淡出
  if (zn) {
    const tp = panels[zn.t];
    const tg = groups[tp.gi];
    lastBadge.current = {
      arrow: zn.wrap ? '↺' : zn.d > 0 ? '→' : '←',
      k1: `${zn.wrap ? (zn.d > 0 ? 'Back to start' : 'Last group') : zn.d > 0 ? 'Next' : 'Prev'} ${tg.n}/${n2(groups.length)}`,
      k2: tg.title + (tp.pages > 1 ? ` · ${rangeLabel(tp.pi, tp.tiles.length, tg.tiles.length, PER)}` : ''),
      side: st.zone!,
    };
  }
  const lb = lastBadge.current;
  const badgeOn = !!zn && !st.moving;

  const pv = carouselNav(st.cur, -1, P);
  const nx = carouselNav(st.cur, 1, P);
  // 顶线上的续接标注：当前屏实线 → 下一屏虚线 + 组名，像图纸上的续图标记
  const rTp = nx ? panels[nx.t] : null;
  const rProx = prox.side === 'r' ? prox.t : 0;
  const rNud = st.nudge === 'r';
  const cont = {
    show: !!nx && !st.moving,
    warm: rProx > 0.45 || rNud || st.zone === 'r',
    text: nx && rTp ? (nx.wrap ? `Back to start · ${groups[0].n} ${groups[0].title}` : `Next · ${groups[rTp.gi].n} ${groups[rTp.gi].title}`) : '',
    arrow: nx && nx.wrap ? '↺' : '→',
    ax: rNud || st.zone === 'r' ? 5 : 0,
    mx: effZone === 'r' ? hint.x : 0,
  };
  const ang = (st.turn * 360) / Math.max(1, P);
  const range = cp.pages > 1 ? rangeLabel(cp.pi, cp.tiles.length, cg.tiles.length, PER) : null;

  const zoneProps = (side: Side) => {
    const n = side === 'r' ? nx : pv;
    return {
      'aria-hidden': true,
      onMouseEnter: (e: MouseEvent) => {
        aim(e, true);
        clearTimeout(timers.current.nudge);
        set({ zone: side, nudge: null });
      },
      onMouseMove: (e: MouseEvent) => aim(e),
      onMouseLeave: () => {
        set({ zone: null, press: false });
        armIdle(WC.NUDGE_AFTER_MS);
      },
      onMouseDown: () => set({ press: true }),
      onMouseUp: () => set({ press: false }),
      onClick: () => step(side === 'r' ? 1 : -1),
      style: {
        cursor: n ? 'crosshair' : 'default',
        ...(side === 'r' ? { left: Wp + WC.GAP / 2, width: st.W - Wp - WC.GAP / 2 + st.Rg } : { width: st.L }),
      } as CSSProperties,
    };
  };
  const arrowBtn = (n: ReturnType<typeof carouselNav>, side: Side) =>
    `hs-wg__arr${st.zone === side && zn ? ' hs-is-lit' : ''}${n ? '' : ' hs-is-off'}`;

  return (
    <>
      <div
        className={`hs-work hs-wg${st.instant ? ' hs-wg--instant' : ''}`}
        ref={rootRef}
        style={{ '--wp': `${Wp}px`, '--wg-l': `${st.L}px`, '--wg-tlen': tlen } as CSSProperties}
      >
        <div className="hs-head">
          <div className="hs-wg__lead">
            <p className="hs-eyebrow" data-a="up" data-d="0">
              02 — Work
            </p>
            <div className="hs-mask hs-mask--sm hs-wg__mask">
              <div className="hs-wg__titles" data-a="rise" data-d="60">
                <h2 className="hs-h2 hs-wg__sizer">{cg.title}</h2>
                {groups.map((gr, gi) => (
                  <span
                    key={gr.key}
                    className={`hs-h2 hs-wg__title${gi < cp.gi ? ' hs-is-past' : gi > cp.gi ? ' hs-is-next' : ' hs-is-here'}`}
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
            <span className="hs-wg__dial" aria-hidden="true">
              {panels.map((_, i) => (
                <span
                  key={i}
                  className={`hs-wg__dial-tick${i === st.cur ? ' hs-is-on' : ''}`}
                  style={{ transform: `rotate(${(i * 360) / P}deg) translateY(-10px)` }}
                />
              ))}
              <span className="hs-wg__dial-hand" style={{ transform: `rotate(${ang}deg)` }} />
              <span className="hs-wg__dial-hub" />
            </span>
            <span className="hs-wg__count">
              <span className="hs-wg__sr" aria-live="polite">
                {`${cg.title}, group ${cg.n} of ${n2(groups.length)}`}
              </span>
              <span className="hs-wg__odo" aria-hidden="true">
                <span className="hs-wg__odo-col" style={{ transform: `translateY(${-cp.gi * 12}px)` }}>
                  {groups.map((gr) => (
                    <span key={gr.key}>{gr.n}</span>
                  ))}
                </span>
              </span>
              <span aria-hidden="true">/</span>
              <span aria-hidden="true">{n2(groups.length)}</span>
            </span>
            <div className="hs-wg__arrs">
              <button type="button" className={arrowBtn(pv, 'l')} aria-label="Previous group" disabled={!pv} onClick={() => step(-1)}>
                {pv && pv.wrap ? '↺' : '←'}
              </button>
              <button type="button" className={arrowBtn(nx, 'r')} aria-label="Next group" disabled={!nx} onClick={() => step(1)}>
                {nx && nx.wrap ? '↺' : '→'}
              </button>
            </div>
          </div>
        </div>

        <div className="hs-wg__stage" ref={stageRef}>
          <span className="hs-rule hs-wg__rule" data-a="line" data-d="120" />
          <span className="hs-wg__cont" aria-hidden="true" data-a="fade" data-d="700" style={{ opacity: cont.show ? 1 : 0 }}>
            <span className="hs-wg__cont-dash" />
            <span className="hs-wg__cont-fill" style={{ transform: `scaleX(${cont.warm ? 1 : 0})` }} />
          </span>
          <span className="hs-wg__cont-lbl" aria-hidden="true" data-a="fade" data-d="760">
            <span
              className={`hs-wg__cont-in${cont.warm ? ' hs-is-warm' : ''}`}
              style={{ opacity: cont.show ? 1 : 0, transform: `translateX(${cont.mx}px)` }}
            >
              <span>{cont.text}</span>
              <span className="hs-wg__cont-arr" style={{ transform: `translateX(${cont.ax}px)` }}>
                {cont.arrow}
              </span>
            </span>
          </span>
          <div
            className="hs-wg__grid"
            onMouseLeave={() => set({ wh: null, prox: NO_PROX })}
            onMouseMove={(e) => {
              if (flow) return;
              const r = e.currentTarget.getBoundingClientRect();
              const v = proximity(e.clientX - r.left, Wp);
              const o = sRef.current.prox;
              if (o.side !== v.side || o.t !== v.t) set({ prox: v });
            }}
            onBlur={(e: FocusEvent<HTMLDivElement>) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) set({ wh: null });
            }}
          >
            {panels.map((pn, i) => {
              const gr = groups[pn.gi];
              const off = !flow && i !== st.cur;
              return (
                <div
                  key={`${gr.key}-${pn.pi}`}
                  className={`hs-wg__panel${i === st.cur ? ' hs-is-cur' : ''}${pn.pi > 0 ? ' hs-wg__panel--cont' : ''}`}
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
                  <div className={`hs-cards${onPanel === i ? ' hs-has-on' : ''}`}>
                    <span className="hs-rule hs-wg__prule" />
                    {pn.tiles.map((t, c) => (
                      <WorkCard
                        key={t.key}
                        t={t}
                        c={c}
                        cur={i === st.cur}
                        on={st.wh === t.key}
                        focusable={flow || i === st.cur}
                        vars={cardVars(i, c, pn.tiles.length - 1, t.key)}
                        onEnter={enterCard(t.key, i === st.cur)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {/* 左右留白区：悬停出光标标签、整排往反方向探，点一下就切 */}
          <div className="hs-wg__zone hs-wg__zone--l" {...zoneProps('l')} />
          <div className="hs-wg__zone hs-wg__zone--r" {...zoneProps('r')} />
        </div>

        <div className="hs-wg__tabs" role="tablist" aria-label="Work, by type" ref={tabsRef} data-a="up" data-d="520">
          {groups.map((gr, gi) => {
            const on = gi === cp.gi;
            const prevw = !on && (tgtGi === gi || st.tabHover === gi);
            const gp = panels.flatMap((pn, i) => (pn.gi === gi ? [i] : []));
            return (
              <button
                key={gr.key}
                type="button"
                role="tab"
                aria-selected={on}
                className={`hs-wg__tab${on ? ' hs-is-on' : ''}${prevw ? ' hs-is-prev' : ''}`}
                data-tab={gi}
                onClick={() => go(firstOf[gi])}
                onMouseEnter={() => set({ tabHover: gi })}
                onMouseLeave={() => set({ tabHover: null })}
              >
                {/* 悬停组名（或留白区指向的那一组）时，组名顶上先描出一道细线：预告要切去哪 */}
                <span className="hs-wg__tab-ghost" style={{ transformOrigin: gi > cp.gi ? '0 50%' : '100% 50%' }} />
                <span className="hs-wg__tab-n">{gr.n}</span>
                <span className="hs-wg__tab-t">{gr.title}</span>
                <span className="hs-wg__tab-c">{gr.tiles.length}</span>
                {gp.length > 1 ? (
                  <span className="hs-wg__pips" aria-hidden="true">
                    {gp.map((i) => (
                      <span key={i} className={i === st.cur ? 'hs-is-on' : undefined} />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
          {st.ind ? (
            <span
              className={`hs-wg__ind${st.indReady ? '' : ' hs-wg__ind--still'}`}
              aria-hidden="true"
              style={{ width: st.ind.w, transform: `translate(${st.ind.x}px, ${st.ind.y}px)` }}
            />
          ) : null}
        </div>

        <div className="hs-wg__badge" ref={badgeRef} aria-hidden="true">
          <span
            className={`hs-wg__tag hs-wg__tag--${lb?.side ?? 'r'}${st.press ? ' hs-is-press' : ''}`}
            style={{
              opacity: badgeOn ? 1 : 0,
              transform: `translateY(${badgeOn ? 0 : 6}px) scale(${st.press ? 0.96 : 1})`,
            }}
          >
            <span className="hs-wg__tag-a" ref={arrowRef}>
              {lb?.arrow ?? '→'}
            </span>
            <span className="hs-wg__tag-k1">{lb?.k1}</span>
            <span className="hs-wg__tag-k2">{lb?.k2}</span>
          </span>
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
        {/* 2026-10-27（MAPPING §64）：四组信息装进细线格子——竖边随整组淡入，横线照旧逐条画出（第一条就是格子的上边） */}
        <dl className="hs-facts" data-a="fade" data-d="100">
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
            <h2 className="hs-h2 hs-h2--say" data-a="rise" data-d="60">
              From <span className="hs-w">spaces</span>{' '}
              <span className="hs-accent--lime">
                to <span className="hs-w">interactions.</span>
              </span>
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
          {/* 肖像框的边上走字（参考 海花岛艺术：字沿着色面的边排）：上沿比例、右沿竖排一行身份，框里仍是占位 */}
          <div className="hs-portrait__wrap">
            <span className="hs-portrait__cap" data-a="fade" data-d="420">
              Portrait · 3 : 4
            </span>
            <div className="hs-portrait__plate" data-a="wipe" data-d="160">
              <span>portrait · to be supplied</span>
            </div>
            <span className="hs-portrait__edge" data-a="fade" data-d="520">
              Zishuo Li · Tsinghua University
            </span>
          </div>
        </figure>
      </div>
      <div className="hs-shade" />
    </>
  );
}
