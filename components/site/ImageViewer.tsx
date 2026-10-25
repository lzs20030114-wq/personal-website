'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as RKeyboardEvent,
  type MouseEvent as RMouseEvent,
  type PointerEvent as RPointerEvent,
} from 'react';
import {
  IV,
  clampView,
  fitScale,
  isZoomed,
  swipeStep,
  toggleZoom,
  wheelFactor,
  wrapIndex,
  zoomAt,
  zoomPercent,
  type Box,
  type ViewState,
} from '../../src/lib/site/image-viewer';
import { useCaseLang } from './CaseLang';

/**
 * 页内看图器（用户 2026-10-25「点开放大之后跳转进另一个窗口，体验特别差」）。
 *
 * 页面上的图仍是普通链接（`<a data-viewer href=原图 target=_blank>`，没有脚本时照旧新窗口打开），
 * 这里在 document 上接住点击，改为在页内打开：滚轮 / 双指 / 双击 / 按钮缩放，放大后拖动平移，
 * ← → / 左右划 / 两侧按钮翻页（同一页里所有带 data-viewer 的图按页面顺序排）。
 * 用原生 <dialog> 的 showModal：背景自动不可交互、Esc 关闭、焦点不跑出去。
 * 几何全在 src/lib/site/image-viewer.ts（纯函数，有守门）。
 */

const SELECTOR = 'a[data-viewer]';

const COPY = {
  en: {
    dialog: 'Image viewer',
    close: 'Close',
    prev: 'Previous image',
    next: 'Next image',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Fit',
    fig: (n: string) => `Fig. ${n}`,
    hint: 'Scroll or pinch to zoom · double-click · drag to move · ← → to browse',
  },
  zh: {
    dialog: '看图',
    close: '关闭',
    prev: '上一张',
    next: '下一张',
    zoomIn: '放大',
    zoomOut: '缩小',
    fit: '适配',
    fig: (n: string) => `图 ${n}`,
    hint: '滚轮或双指缩放 · 双击放大 · 拖动平移 · ← → 翻页',
  },
} as const;

type Item = { src: string; w: number; h: number; n: string; cap: { en: string; zh: string }; el: HTMLElement };

function readItems(): Item[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>(SELECTOR)).map((a) => ({
    src: a.getAttribute('href') ?? '',
    w: Number(a.dataset.w) || 1,
    h: Number(a.dataset.h) || 1,
    n: a.dataset.n ?? '',
    cap: { en: a.dataset.capEn ?? '', zh: a.dataset.capZh ?? '' },
    el: a,
  }));
}

const EASE = 'transform 0.28s cubic-bezier(.2,.7,.1,1)';

export function ImageViewer() {
  const lang = useCaseLang();
  const c = COPY[lang];
  const dialog = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Box>({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState>({ s: 1, x: 0, y: 0 });
  const [smooth, setSmooth] = useState(false);
  const [dragging, setDragging] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const item = items ? items[index] : null;
  // 关闭时回到正在看的那张（翻页后不回到起点那张）
  const current = useRef<HTMLElement | null>(null);
  current.current = item?.el ?? null;
  const img: Box = item ? { w: item.w, h: item.h } : { w: 1, h: 1 };
  const fit = stage.w > 0 ? fitScale(img, stage) : 1;

  // 状态的最新值给事件回调用（滚轮监听只挂一次）
  const live = useRef({ view, fit, img, stage });
  live.current = { view, fit, img, stage };

  const open = useCallback((list: Item[], i: number, from: HTMLElement) => {
    opener.current = from;
    setItems(list);
    setIndex(i);
    setSmooth(false);
  }, []);

  // 收尾（恢复页面滚动、焦点回到页面上那张图）在这里同步做，不等 close 事件：
  // 那个事件要等浏览器画下一帧才派发；close 事件仍挂着，接系统发起的关闭（如安卓返回手势）。
  const finish = useRef<() => void>(() => {});
  const close = useCallback(() => {
    dialog.current?.close();
    finish.current();
  }, []);

  // 接住页面上的看图链接
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const t = e.target as Element | null;
      // data-viewer-proxy：一块只给鼠标 / 触屏点的大目标，打开同一个 figure 里的那张图
      const a =
        t?.closest?.<HTMLAnchorElement>(SELECTOR) ??
        t?.closest?.('[data-viewer-proxy]')?.closest('figure')?.querySelector<HTMLAnchorElement>(SELECTOR);
      if (!a) return;
      e.preventDefault();
      const list = readItems();
      open(list, Math.max(0, list.findIndex((x) => x.el === a)), a);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);

  // 打开 / 关闭：showModal + 锁住页面滚动；关闭后焦点回到点开的那个链接
  useLayoutEffect(() => {
    const d = dialog.current;
    if (!d || !items) return;
    if (!d.open) d.showModal();
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = 'hidden';
    let done = false;
    const onClose = () => {
      // 上一次关闭的 close 事件可能晚到（等下一帧才派发），这时已经重新打开了：认 d.open，不认事件
      if (done || d.open) return;
      done = true;
      root.style.overflow = prev;
      setItems(null);
      const el = current.current?.isConnected ? current.current : opener.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) el.scrollIntoView({ block: 'center' });
    };
    finish.current = onClose;
    d.addEventListener('close', onClose);
    return () => {
      d.removeEventListener('close', onClose);
      root.style.overflow = prev;
    };
  }, [items]);

  // 舞台尺寸
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el || !items) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items]);

  // 换图：回到适配；预取前后两张
  useLayoutEffect(() => {
    if (!items || stage.w === 0) return;
    setView({ s: fitScale({ w: items[index].w, h: items[index].h }, stage), x: 0, y: 0 });
    for (const d of [-1, 1]) {
      const it = items[wrapIndex(index + d, items.length)];
      if (it) new Image().src = it.src;
    }
    // 只在换图时重置；舞台变了走下面那条
  }, [items, index]); // eslint-disable-line react-hooks/exhaustive-deps

  // 舞台变了：适配着就跟着新的适配，放大着就夹回范围内
  const lastFit = useRef(fit);
  useLayoutEffect(() => {
    if (!items || stage.w === 0) return;
    // 更新函数是下一次渲染时才跑的，旧的适配值要先取出来（否则比的是新值）
    const prevFit = lastFit.current;
    setView((v) => (isZoomed(v, prevFit) ? clampView(v, img, stage, fit) : { s: fit, x: 0, y: 0 }));
    lastFit.current = fit;
  }, [stage.w, stage.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback(
    (d: number) => {
      if (!items || items.length < 2) return;
      setSmooth(false);
      setIndex((i) => wrapIndex(i + d, items.length));
    },
    [items],
  );

  const zoomBy = useCallback((factor: number) => {
    const { view: v, fit: f, img: im, stage: st } = live.current;
    setSmooth(true);
    setView(zoomAt(v, factor, 0, 0, im, st, f));
  }, []);

  const reset = useCallback(() => {
    setSmooth(true);
    setView({ s: live.current.fit, x: 0, y: 0 });
  }, []);

  // 舞台坐标：相对舞台中心
  const local = (clientX: number, clientY: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };
  // 这一点落在图上没有（按几何算：指针捕获后事件目标都是舞台，不能看 target）
  const onImageAt = (clientX: number, clientY: number) => {
    const p = local(clientX, clientY);
    const { view: v, img: im } = live.current;
    return Math.abs(p.x - v.x) <= (im.w * v.s) / 2 && Math.abs(p.y - v.y) <= (im.h * v.s) / 2;
  };

  // 滚轮缩放（要 passive: false 才能拦住页面）
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !items) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { view: v, fit: f, img: im, stage: st } = live.current;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? st.h : 1);
      const p = local(e.clientX, e.clientY);
      setSmooth(false);
      setView(zoomAt(v, wheelFactor(dy), p.x, p.y, im, st, f));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [items]);

  // 拖动 / 双指 / 点按
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    kind: 'pan' | 'pinch';
    start: { x: number; y: number };
    view: ViewState;
    dist?: number;
    moved: boolean;
  } | null>(null);
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);

  const beginGesture = () => {
    const pts = [...pointers.current.values()];
    const v = live.current.view;
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.current = {
        kind: 'pinch',
        start: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view: v,
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        moved: true,
      };
    } else if (pts.length === 1) {
      gesture.current = { kind: 'pan', start: { ...pts[0] }, view: v, moved: false };
    } else gesture.current = null;
  };

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 指针已经抬起等情况下捕获会失败，拖动照样按 move 事件走
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    beginGesture();
    setSmooth(false);
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const { fit: f, img: im, stage: st } = live.current;
    if (g.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const p0 = local(g.start.x, g.start.y);
      const z = zoomAt(g.view, Math.hypot(a.x - b.x, a.y - b.y) / g.dist!, p0.x, p0.y, im, st, f);
      setView(clampView({ s: z.s, x: z.x + mid.x - g.start.x, y: z.y + mid.y - g.start.y }, im, st, f));
      return;
    }
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (Math.hypot(dx, dy) > 4) g.moved = true;
    if (isZoomed(g.view, f)) {
      setDragging(true);
      setView(clampView({ s: g.view.s, x: g.view.x + dx, y: g.view.y + dy }, im, st, f));
    } else if (e.pointerType !== 'mouse') {
      // 适配状态下手指拖：图跟着手横移一点，松手判翻页
      setView({ s: g.view.s, x: dx * 0.6, y: 0 });
    }
  };

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    setDragging(false);
    if (g?.kind === 'pinch') {
      beginGesture(); // 剩下一根手指接着拖
      return;
    }
    gesture.current = null;
    if (!g) return;
    const { fit: f } = live.current;
    const dx = e.clientX - g.start.x;
    const dy = e.clientY - g.start.y;
    if (!isZoomed(g.view, f) && g.moved) {
      const step = e.pointerType === 'mouse' ? 0 : swipeStep(dx, dy);
      if (step) go(step);
      else {
        setSmooth(true);
        setView({ s: f, x: 0, y: 0 });
      }
      return;
    }
    if (g.moved || e.type === 'pointercancel') return;
    // 点按：点在图外关闭；手指在图上连点两下放大 / 回适配（鼠标走 dblclick）
    if (!onImageAt(e.clientX, e.clientY)) {
      close();
      return;
    }
    if (e.pointerType !== 'mouse') {
      const now = performance.now();
      const t = lastTap.current;
      if (t && now - t.t < 320 && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 30) {
        lastTap.current = null;
        const p = local(e.clientX, e.clientY);
        const { view: v, img: im, stage: st } = live.current;
        setSmooth(true);
        setView(toggleZoom(v, p.x, p.y, im, st, f));
      } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };

  const onDoubleClick = (e: RMouseEvent) => {
    if (!onImageAt(e.clientX, e.clientY)) return;
    const p = local(e.clientX, e.clientY);
    const { view: v, fit: f, img: im, stage: st } = live.current;
    setSmooth(true);
    setView(toggleZoom(v, p.x, p.y, im, st, f));
  };

  const onKeyDown = (e: RKeyboardEvent) => {
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === '+' || e.key === '=') zoomBy(IV.STEP);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / IV.STEP);
    else if (e.key === '0') reset();
    else return;
    e.preventDefault();
  };

  const zoomed = isZoomed(view, fit);
  const many = (items?.length ?? 0) > 1;

  return (
    <dialog
      ref={dialog}
      className="iv"
      aria-label={c.dialog}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={onKeyDown}
    >
      {item && items ? (
        <>
          <div className="iv__bar iv__bar--top">
            <span className="iv__count">
              {String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
            </span>
            <div className="iv__tools">
              <button type="button" className="iv__btn" aria-label={c.zoomOut} onClick={() => zoomBy(1 / IV.STEP)} disabled={!zoomed}>
                −
              </button>
              <output className="iv__pct" aria-live="polite">
                {zoomPercent(view, fit)}%
              </output>
              <button type="button" className="iv__btn" aria-label={c.zoomIn} onClick={() => zoomBy(IV.STEP)}>
                +
              </button>
              <button type="button" className="iv__btn iv__btn--text" onClick={reset} disabled={!zoomed}>
                {c.fit}
              </button>
              <button type="button" className="iv__btn iv__btn--close" aria-label={c.close} onClick={close} autoFocus>
                ×
              </button>
            </div>
          </div>
          <div
            ref={stageRef}
            className="iv__stage"
            data-zoomed={zoomed || undefined}
            data-dragging={dragging || undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
          >
            {stage.w > 0 ? (
              <img
                key={item.src}
                className="iv__img"
                src={item.src}
                alt={item.cap[lang]}
                draggable={false}
                style={{
                  width: item.w,
                  height: item.h,
                  marginLeft: -item.w / 2,
                  marginTop: -item.h / 2,
                  transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
                  transition: smooth ? EASE : 'none',
                }}
              />
            ) : null}
            {many ? (
              <>
                <button type="button" className="iv__nav iv__nav--prev" aria-label={c.prev} onClick={() => go(-1)}>
                  ←
                </button>
                <button type="button" className="iv__nav iv__nav--next" aria-label={c.next} onClick={() => go(1)}>
                  →
                </button>
              </>
            ) : null}
          </div>
          <div className="iv__bar iv__bar--bottom">
            <span className="iv__label">{item.n ? c.fig(item.n) : null}</span>
            <span className="iv__cap">{item.cap[lang]}</span>
            <span className="iv__hint">{c.hint}</span>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
