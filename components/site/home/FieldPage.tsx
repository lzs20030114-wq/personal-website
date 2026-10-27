'use client';

// 01 Field（2026-10-27 换成画布方案 H6b，MAPPING §65；此前为稿 17 Home · Field Hero，§55）。
// 一张 28×15 的细线格：标语一字一格（细窄），objects / spaces 每个字母占 2×2（宽粗），
// 名字、导航、按钮、提示都占整数个格子；其余格子各放一件站上的真实内容，贴着字留一圈有机的空白。
// 动效沿用 §55–§57：作品格成簇地亮起又暗回去，指针划过留一圈余光，光标附近的作品格转角拉斜，
// 在作品格上停 160ms 长成一张 6×4 的卡（所在行列放大、其余让位——字格也一起让位），点卡进那件作品。
// 新增：鼠标扫过字格时，附近的字变宽变粗，移开后慢慢收回。
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { HomeField } from '../../../src/lib/site/home-model';
import { FIELD_KINDS, FIELD_LIGHT } from '../../../src/lib/site/field-visuals';
import { FX, swellAt, swellAxes, tiltAt, tiltCss } from '../../../src/lib/site/home-fx';
import {
  CARD_H as CH,
  CARD_W as CW,
  FIELD_COLS as COLS,
  FIELD_ROWS as ROWS,
  FIELD_TEXT,
  cardOrigin,
  fieldSlots,
  initialPlacement,
} from '../../../src/lib/site/field-layout';

/** 卡所在行列放大倍数（其余行列等比收窄让位） */
const K = 1.5;
/** 同时亮着的作品格占比；亮格持续多久、暗回去用多久 */
const LIT_SHARE = 0.3;
const TICK_MS = 110;
const DIM_MS = 2200;
/** 快速掠过不触发：余光先响应，再确认开卡意图（§57.1 已确认的 50 / 160ms） */
const WAKE_DWELL_MS = 50;
const WAKE_TRACK_MS = 110;
const OPEN_DWELL_MS = 160;
const FLOW_QUERY = '(max-width: 1023px), (prefers-reduced-motion: reduce)';
const BASE_AXES = swellAxes(0);

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Open {
  cell: number;
  slot: number;
  pick: number;
  c0: number;
  r0: number;
  rect: Rect;
  n: number;
}

/** 卡所在行列放大 K 倍、其余等比收窄后，各行列的左缘（含最右一条边，共 n+1 条）与中心位移（格子之间无缝） */
function axis(n: number, span: number, start: number, total: number) {
  const cell = total / n;
  const u = (n * cell) / (n - span + span * K);
  const lefts: number[] = [];
  const shift: number[] = [];
  let x = 0;
  for (let k = 0; k < n; k++) {
    const w = k >= start && k < start + span ? u * K : u;
    lefts.push(x);
    shift.push(x + w / 2 - (k * cell + cell / 2));
    x += w;
  }
  return { lefts, edges: [...lefts, total], shift, u, cell };
}

/** 开卡让位：中心位移（单格的东西平移）+ 每条格线的新位置（格线、跨多格的框跟着移、改宽高） */
interface Shift {
  sx: number[];
  sy: number[];
  ex: number[];
  ey: number[];
  cw: number;
  ch: number;
}

/** 卡从被悬停的那一格展开：clip-path 的起点框（百分比 inset） */
function cellInset(cell: number, c0: number, r0: number) {
  const r = Math.floor(cell / COLS);
  const c = cell % COLS;
  const L = ((c - c0) / CW) * 100;
  const T = ((r - r0) / CH) * 100;
  return `inset(${T}% ${100 - L - 100 / CW}% ${100 - T - 100 / CH}% ${L}%)`;
}

const area = (c: number, r: number, w = 1, h = 1): CSSProperties => ({ gridColumn: `${c + 1} / span ${w}`, gridRow: `${r + 1} / span ${h}` });
const CELLS = Array.from({ length: COLS * ROWS }, (_, i) => i);
const VLINES = Array.from({ length: COLS + 1 }, (_, k) => k);
const HLINES = Array.from({ length: ROWS + 1 }, (_, k) => k);
/** 第 k 条格线的位置；最右 / 最下那条往里收 1px，免得画到格子外 */
const lineAt = (k: number, n: number) => (k === n ? 'calc(100% - 1px)' : `${(k * 100) / n}%`);
const axesCss = (a: { wdth: number; wght: number }) => `'wdth' ${a.wdth}, 'wght' ${a.wght}`;

export function FieldPage({
  field,
  active,
  onWork,
  onAbout,
  onGo,
}: {
  field: HomeField;
  active: boolean;
  onWork: () => void;
  onAbout: () => void;
  onGo: (page: number) => void;
}) {
  const { pool } = field;
  // 版面与初次落位都是确定的：服务端和浏览器得到同一张图
  const { slots } = useMemo(() => fieldSlots(pool.length), [pool.length]);
  const placement = useMemo(() => initialPlacement(pool.map((p) => p.kind), slots.length), [pool, slots.length]);

  const fieldRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const [open, setOpen] = useState<Open | null>(null);
  const [opened, setOpened] = useState(0);
  const openRef = useRef<Open | null>(null);
  openRef.current = open;

  const m = useRef({
    /** 所有占格子的东西（作品格、余光、字、框）及其位置，开卡让位时一起平移；跨多格的框还要改宽高 */
    placed: [] as { el: HTMLElement; c: number; r: number; w: number; h: number; slot: number }[],
    /** 格线：竖线 k 在第 k 列左缘，横线 k 在第 k 行上缘（k = 列数 / 行数 时是最右 / 最下一条） */
    vlines: [] as HTMLElement[],
    hlines: [] as HTMLElement[],
    slotEls: [] as HTMLElement[],
    ghosts: [] as HTMLElement[],
    letters: [] as { el: HTMLElement; c: number; r: number; key: string }[],
    slotOfCell: new Map<number, number>(),
    slotItem: [] as number[],
    queue: [] as number[],
    lit: new Map<number, number>(),
    swapAt: new Map<number, number>(),
    pointer: null as { x: number; y: number } | null,
    lastCell: -1,
    shift: null as Shift | null,
    sizeT: undefined as ReturnType<typeof setTimeout> | undefined,
    tilts: [] as string[],
    tiltRaf: 0,
    swellRaf: 0,
    ghostTimers: new Map<number, ReturnType<typeof setTimeout>>(),
    heldGhosts: new Map<number, number>(),
    hoveredSlot: -1,
    closing: false,
    wakeT: undefined as ReturnType<typeof setTimeout> | undefined,
    openT: undefined as ReturnType<typeof setTimeout> | undefined,
    closeT: undefined as ReturnType<typeof setTimeout> | undefined,
    txtT: undefined as ReturnType<typeof setTimeout> | undefined,
  });

  const motionOn = () => !window.matchMedia(FLOW_QUERY).matches;

  /** 当前视觉上的格子大小与各行列中心（开卡让位时按位移后的位置算） */
  const geom = () => {
    const f = fieldRef.current!;
    const fr = f.getBoundingClientRect();
    const cw = fr.width / COLS;
    const ch = fr.height / ROWS;
    const sh = m.current.shift;
    return {
      fr,
      cw,
      ch,
      cx: (c: number) => fr.left + (c + 0.5) * cw + (sh ? sh.sx[c] : 0),
      cy: (r: number) => fr.top + (r + 0.5) * ch + (sh ? sh.sy[r] : 0),
    };
  };

  const cancelOpen = useCallback(() => {
    clearTimeout(m.current.openT);
    m.current.hoveredSlot = -1;
  }, []);

  const fadeGhost = (i: number, amp: number) => {
    const g = m.current.ghosts[i];
    if (!g) return;
    clearTimeout(m.current.ghostTimers.get(i));
    m.current.ghostTimers.delete(i);
    g.style.transition = `opacity ${(1.1 + amp).toFixed(2)}s ease,transform .7s cubic-bezier(.2,.7,.1,1)`;
    g.style.opacity = '0';
  };

  /** 一个东西的 transform = 开卡让位 + 光标倾斜（只有作品格）。单格的东西按中心平移；跨多格的框按左上角那条格线平移（宽高另改） */
  const composeAt = (p: { c: number; r: number; w: number; h: number; slot: number }) => {
    const { shift, tilts } = m.current;
    let s = '';
    if (shift) {
      const span = p.w > 1 || p.h > 1;
      const dx = span ? shift.ex[p.c] - p.c * shift.cw : shift.sx[p.c];
      const dy = span ? shift.ey[p.r] - p.r * shift.ch : shift.sy[p.r];
      s = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
    }
    const t = p.slot >= 0 ? (tilts[p.slot] ?? '') : '';
    return s && t ? `${s} ${t}` : s || t;
  };

  const applyShift = (g: Shift | null) => {
    const st = m.current;
    st.shift = g;
    // 开卡时指针在卡上，周围方块回正，免得卡边一圈乱动
    if (g) st.tilts = [];
    clearTimeout(st.sizeT);
    // 跨多格的框（名字、导航、按钮、关键词）：宽高要从具体像素起跳才有过渡，先钉住当前尺寸
    const spans = st.placed.filter((p) => p.w > 1 || p.h > 1);
    const pinned = spans.filter((p) => !p.el.style.width);
    pinned.forEach((p) => {
      p.el.style.width = `${p.el.offsetWidth}px`;
      p.el.style.height = `${p.el.offsetHeight}px`;
    });
    if (pinned.length) void fieldRef.current?.offsetWidth;
    const f = fieldRef.current;
    const cw = g ? g.cw : (f?.clientWidth ?? 0) / COLS;
    const ch = g ? g.ch : (f?.clientHeight ?? 0) / ROWS;
    for (const p of spans) {
      p.el.style.width = `${(g ? g.ex[p.c + p.w] - g.ex[p.c] : p.w * cw).toFixed(1)}px`;
      p.el.style.height = `${(g ? g.ey[p.r + p.h] - g.ey[p.r] : p.h * ch).toFixed(1)}px`;
    }
    for (const p of st.placed) p.el.style.transform = composeAt(p);
    st.vlines.forEach((el, k) => (el.style.transform = g ? `translateX(${(g.ex[k] - k * g.cw).toFixed(1)}px)` : ''));
    st.hlines.forEach((el, k) => (el.style.transform = g ? `translateY(${(g.ey[k] - k * g.ch).toFixed(1)}px)` : ''));
    // 收回后把宽高交还给 grid（窗口再缩放时自己跟着走）
    if (!g)
      st.sizeT = setTimeout(() => {
        if (st.shift) return;
        spans.forEach((p) => {
          p.el.style.width = '';
          p.el.style.height = '';
        });
      }, 760);
  };

  /** 光标附近的作品格按距离转角、拉斜（字格不转：字靠宽窄变化回应） */
  const applyTilt = () => {
    const st = m.current;
    if (!fieldRef.current || !st.slotEls.length) return;
    const ptr = st.pointer;
    const off = !ptr || !!openRef.current || !activeRef.current || !motionOn();
    const { cx, cy } = geom();
    for (const p of st.placed) {
      if (p.slot < 0) continue;
      const next = off ? '' : tiltCss(tiltAt(cx(p.c) - ptr!.x, cy(p.r) - ptr!.y));
      if (next === (st.tilts[p.slot] ?? '')) continue;
      st.tilts[p.slot] = next;
      p.el.style.transform = composeAt(p);
    }
  };

  /** 鼠标附近的字变宽变粗；变宽快、收回慢（FX.SWELL_*） */
  const applySwell = () => {
    const st = m.current;
    if (!fieldRef.current || !st.letters.length) return;
    const ptr = st.pointer;
    const off = !ptr || !activeRef.current || !motionOn();
    const { cx, cy, cw, ch } = geom();
    for (const L of st.letters) {
      const f = off ? 0 : swellAt((cx(L.c) - ptr!.x) / cw, (cy(L.r) - ptr!.y) / ch);
      const a = swellAxes(f);
      const key = `${a.wdth}/${a.wght}`;
      if (key === L.key) continue;
      const rising = a.wdth > Number(L.key.split('/')[0] || BASE_AXES.wdth);
      L.key = key;
      // 只改字宽字重这一项的时长；transform 的 .7s 留给开卡让位
      L.el.style.transition = `font-variation-settings ${rising ? FX.SWELL_IN_MS : FX.SWELL_OUT_MS}ms cubic-bezier(.2,.7,.1,1), transform .7s cubic-bezier(.2,.7,.1,1)`;
      L.el.style.fontVariationSettings = axesCss(a);
    }
  };

  const schedulePointerFx = () => {
    const st = m.current;
    if (!st.tiltRaf)
      st.tiltRaf = requestAnimationFrame(() => {
        st.tiltRaf = 0;
        applyTilt();
      });
    if (!st.swellRaf)
      st.swellRaf = requestAnimationFrame(() => {
        st.swellRaf = 0;
        applySwell();
      });
  };

  const cancelHover = useCallback(() => {
    cancelOpen();
    clearTimeout(m.current.wakeT);
    m.current.lastCell = -1;
    m.current.pointer = null;
    schedulePointerFx();
    for (const [i, amp] of m.current.heldGhosts) fadeGhost(i, amp);
    m.current.heldGhosts.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelOpen]);

  /** 一个作品格亮起 / 暗回去 */
  const setLit = (k: number, on: boolean, ms: number) => {
    const el = m.current.slotEls[k];
    if (!el) return;
    el.style.setProperty('--fi-t', `${ms}ms`);
    el.dataset.lit = on ? '1' : '0';
  };

  /** 作品格换成另一件（作品比格子多时轮换上场，§55.2「全池可达」） */
  const showItem = (k: number, p: number) => {
    const el = m.current.slotEls[k];
    const item = pool[p];
    if (!el || !item) return;
    const c = FIELD_LIGHT[item.project];
    m.current.slotItem[k] = p;
    el.dataset.item = String(p);
    el.dataset.kind = item.kind;
    el.style.setProperty('--fi-ink', c.ink);
    el.style.setProperty('--fi-lit', c.lit);
    el.style.setProperty('--fi-dim', c.dim);
    const ico = el.querySelector<HTMLElement>('[data-ico]');
    if (ico) {
      ico.style.maskImage = `url(${item.img})`;
      ico.style.setProperty('-webkit-mask-image', `url(${item.img})`);
    }
  };

  const openAt = useCallback((slot: number, pick: number) => {
    const f = fieldRef.current;
    if (!f) return;
    const cell = slots[slot];
    const { c0, r0 } = cardOrigin(cell);
    clearTimeout(m.current.closeT);
    m.current.closing = false;
    const fr = f.getBoundingClientRect();
    const X = axis(COLS, CW, c0, fr.width);
    const Y = axis(ROWS, CH, r0, fr.height);
    const rect = { x: X.lefts[c0], y: Y.lefts[r0], w: CW * X.u * K, h: CH * Y.u * K };
    const nextOpen = { cell, slot, pick, c0, r0, rect, n: (openRef.current?.n ?? 0) + 1 };
    // 同步把悬停占位交给展开卡，避免 React 提交前被心跳暗回去
    openRef.current = nextOpen;
    cancelOpen();
    setLit(slot, true, 300);
    applyShift({ sx: X.shift, sy: Y.shift, ex: X.edges, ey: Y.edges, cw: X.cell, ch: Y.cell });
    setOpened((n) => n + 1);
    setOpen(nextOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const collapse = useCallback(() => {
    const cd = cardRef.current;
    const o = openRef.current;
    if (!cd || !o || m.current.closing) return;
    m.current.closing = true;
    const txt = cd.querySelector<HTMLElement>('[data-card-txt]');
    if (txt) txt.style.opacity = '0';
    clearTimeout(m.current.txtT);
    applyShift(null);
    const done = () => {
      if (openRef.current !== o) return;
      m.current.closing = false;
      openRef.current = null;
      setOpen(null);
    };
    if (!motionOn()) return done();
    const a = cd.animate(
      [
        { clipPath: 'inset(0 0 0 0)', opacity: 1 },
        { clipPath: cellInset(o.cell, o.c0, o.r0), opacity: 0 },
      ],
      { duration: 420, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'forwards' },
    );
    a.onfinish = done;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 卡展开：从被悬停那一格的框长到整张卡，字 300ms 后浮起
  useLayoutEffect(() => {
    const cd = cardRef.current;
    if (!open || !cd) return;
    cd.getAnimations().forEach((a) => a.cancel());
    const txt = cd.querySelector<HTMLElement>('[data-card-txt]');
    if (motionOn()) {
      cd.animate(
        [
          { clipPath: cellInset(open.cell, open.c0, open.r0), opacity: 0.6 },
          { clipPath: 'inset(0 0 0 0)', opacity: 1 },
        ],
        { duration: 650, easing: 'cubic-bezier(.22,.8,.2,1)' },
      );
    }
    if (txt) {
      txt.style.opacity = '0';
      txt.style.transform = 'translateY(8px)';
      clearTimeout(m.current.txtT);
      m.current.txtT = setTimeout(() => {
        txt.style.opacity = '1';
        txt.style.transform = 'none';
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.n]);

  // 翻离首屏时取消等待，把展开的卡收起，字回到平时的宽度
  useEffect(() => {
    if (!active) {
      cancelHover();
      if (openRef.current) collapse();
    }
  }, [active, collapse, cancelHover]);

  // 登记格子里的东西 + 场的心跳：作品格成簇地亮起，2–6 秒后暗回去（只在首屏是当前页、且不在文档流时跑）
  useEffect(() => {
    const f = fieldRef.current!;
    const st = m.current;
    st.placed = Array.from(f.querySelectorAll<HTMLElement>('[data-g]')).map((el) => ({
      el,
      c: Number(el.dataset.c),
      r: Number(el.dataset.r),
      w: Number(el.dataset.w ?? 1),
      h: Number(el.dataset.h ?? 1),
      slot: el.dataset.slot != null ? Number(el.dataset.slot) : -1,
    }));
    st.slotEls = [];
    st.placed.forEach((p) => p.slot >= 0 && (st.slotEls[p.slot] = p.el));
    st.vlines = [];
    st.hlines = [];
    f.querySelectorAll<HTMLElement>('[data-vl]').forEach((el) => (st.vlines[Number(el.dataset.vl)] = el));
    f.querySelectorAll<HTMLElement>('[data-hl]').forEach((el) => (st.hlines[Number(el.dataset.hl)] = el));
    st.ghosts = [];
    f.querySelectorAll<HTMLElement>('[data-ghost]').forEach((el) => (st.ghosts[Number(el.dataset.ghost)] = el));
    st.letters = Array.from(f.querySelectorAll<HTMLElement>('[data-letter]')).map((el) => ({
      el,
      c: Number(el.dataset.c),
      r: Number(el.dataset.r),
      key: `${BASE_AXES.wdth}/${BASE_AXES.wght}`,
    }));
    st.slotOfCell = new Map(slots.map((cell, k) => [cell, k]));
    st.slotItem = [...placement.shown];
    st.queue = [...placement.queue];

    const dim = (k: number, now: number) => {
      st.lit.delete(k);
      setLit(k, false, DIM_MS);
      // 作品比格子多时，暗下去以后换上一件还没露面的
      if (st.queue.length) st.swapAt.set(k, now + DIM_MS);
    };

    const timer = setInterval(() => {
      if (!activeRef.current || !motionOn()) return;
      const now = performance.now();
      const busy = (k: number) => k === openRef.current?.slot || k === st.hoveredSlot;
      for (const [k, exp] of st.lit) if (now > exp && !busy(k)) dim(k, now);
      for (const [k, at] of st.swapAt) {
        if (now < at || busy(k) || st.lit.has(k)) continue;
        st.swapAt.delete(k);
        const next = st.queue.shift();
        if (next == null) continue;
        st.queue.push(st.slotItem[k]);
        showItem(k, next);
      }
      const target = Math.round(slots.length * LIT_SHARE);
      const n = st.lit.size < target * 0.5 ? 6 : st.lit.size < target ? 3 : Math.random() < 0.5 ? 1 : 0;
      const litArr = Array.from(st.lit.keys());
      for (let t = 0; t < n; t++) {
        let k: number | undefined;
        if (litArr.length && Math.random() < 0.65) {
          // 多半长在已亮格子旁边：亮格成簇，不是均匀的雪花
          const cell = slots[litArr[Math.floor(Math.random() * litArr.length)]];
          const d = [1, -1, COLS, -COLS, COLS + 1, COLS - 1, -COLS + 1, -COLS - 1][Math.floor(Math.random() * 8)];
          const j = cell + d;
          if (j < 0 || j >= COLS * ROWS || Math.abs((j % COLS) - (cell % COLS)) > 1) continue;
          k = st.slotOfCell.get(j);
        } else k = Math.floor(Math.random() * slots.length);
        if (k == null || st.lit.has(k) || st.swapAt.has(k)) continue;
        setLit(k, true, Math.round(1200 + Math.random() * 1200));
        st.lit.set(k, now + 2200 + Math.random() * 4000);
      }
    }, TICK_MS);

    const ro = new ResizeObserver(() => cancelHover());
    ro.observe(f);

    return () => {
      clearInterval(timer);
      ro.disconnect();
      cancelAnimationFrame(st.tiltRaf);
      cancelAnimationFrame(st.swellRaf);
      st.tiltRaf = 0;
      st.swellRaf = 0;
      clearTimeout(st.closeT);
      clearTimeout(st.txtT);
      clearTimeout(st.sizeT);
      cancelHover();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, placement]);

  /** 所在格与邻格保持余光；离开邻域后沿原曲线淡出，不参与内容开卡（§57.3） */
  const trigger = (i: number, amp: number, delay: number) => {
    const st = m.current;
    const g = st.ghosts[i];
    if (!g) return;
    clearTimeout(st.ghostTimers.get(i));
    st.heldGhosts.set(i, amp);
    st.ghostTimers.set(
      i,
      setTimeout(() => {
        st.ghostTimers.delete(i);
        if (!activeRef.current || !motionOn()) return;
        g.style.transition = 'opacity .09s,transform .7s cubic-bezier(.2,.7,.1,1)';
        g.style.opacity = String(amp);
      }, delay),
    );
  };

  /** 指针落在哪一格：按让位后的视觉中心找最近的行列 */
  const pointerCell = () => {
    const f = fieldRef.current;
    const { pointer } = m.current;
    if (!f || !pointer) return -1;
    const { fr, cx, cy } = geom();
    if (pointer.x < fr.left || pointer.x >= fr.right || pointer.y < fr.top || pointer.y >= fr.bottom) return -1;
    let c = 0;
    let r = 0;
    let dx = Infinity;
    let dy = Infinity;
    for (let col = 0; col < COLS; col++) {
      const d = Math.abs(pointer.x - cx(col));
      if (d < dx) {
        dx = d;
        c = col;
      }
    }
    for (let row = 0; row < ROWS; row++) {
      const d = Math.abs(pointer.y - cy(row));
      if (d < dy) {
        dy = d;
        r = row;
      }
    }
    return r * COLS + c;
  };

  const wake = () => {
    if (!activeRef.current || !motionOn() || !m.current.pointer) {
      cancelHover();
      return;
    }
    const i = pointerCell();
    if (i >= 0 && m.current.heldGhosts.get(i) !== 1) {
      const next = new Map<number, { amp: number; delay: number }>();
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      next.set(i, { amp: 1, delay: 0 });
      const near = (dc: number, dr: number) => {
        const cc = c + dc;
        const rr = r + dr;
        return cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS ? rr * COLS + cc : -1;
      };
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
        const j = near(dc, dr);
        if (j >= 0) next.set(j, { amp: 0.45, delay: 70 });
      });
      [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([dc, dr]) => {
        const j = near(dc, dr);
        if (j >= 0 && Math.random() < 0.5) next.set(j, { amp: 0.2, delay: 140 });
      });
      for (const [j, amp] of m.current.heldGhosts) {
        if (!next.has(j)) {
          fadeGhost(j, amp);
          m.current.heldGhosts.delete(j);
        }
      }
      for (const [j, { amp, delay }] of next) trigger(j, amp, delay);
    }
    m.current.lastCell = i;
    m.current.wakeT = setTimeout(wake, WAKE_TRACK_MS);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!activeRef.current || !motionOn() || e.pointerType === 'touch') return;
    m.current.pointer = { x: e.clientX, y: e.clientY };
    schedulePointerFx();
    const i = pointerCell();
    if (i === m.current.lastCell) return;
    clearTimeout(m.current.wakeT);
    for (const [j, amp] of m.current.heldGhosts) fadeGhost(j, amp);
    m.current.heldGhosts.clear();
    m.current.lastCell = i;
    if (i >= 0) m.current.wakeT = setTimeout(wake, WAKE_DWELL_MS);
  };

  const onSlotEnter = (e: React.MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const k = Number(el.dataset.slot);
    cancelOpen();
    if (!activeRef.current || !motionOn()) return;
    if (openRef.current?.slot === k && !m.current.closing) return;
    const item = m.current.slotItem[k];
    if (item == null) return;
    m.current.hoveredSlot = k;
    m.current.openT = setTimeout(() => {
      if (!activeRef.current || !motionOn() || m.current.hoveredSlot !== k || m.current.slotItem[k] !== item || !el.matches(':hover')) return;
      openAt(k, item);
    }, OPEN_DWELL_MS);
  };

  const T = FIELD_TEXT;
  const card = open ? pool[open.pick] : null;
  const cardColors = card ? FIELD_LIGHT[card.project] : null;
  const cardStyle: CSSProperties | undefined =
    open && cardColors
      ? ({ left: open.rect.x, top: open.rect.y, width: open.rect.w, height: open.rect.h, '--fi-ink': cardColors.ink, '--fi-lit': cardColors.lit } as CSSProperties)
      : undefined;
  const baseAxes = axesCss(BASE_AXES);

  return (
    <>
      <h1 className="hs-sr">I explore how people relate to objects and spaces that respond to them.</h1>
      <div className="hs-fx" ref={fieldRef} onPointerEnter={onMove} onPointerMove={onMove} onPointerLeave={cancelHover}>
        {/* 格线是元素不是背景：开卡让位时跟着行列一起移 */}
        {VLINES.map((k) => (
          <i key={`v${k}`} className="hs-fx__vl" data-vl={k} style={{ left: lineAt(k, COLS) }} aria-hidden="true" />
        ))}
        {HLINES.map((k) => (
          <i key={`h${k}`} className="hs-fx__hl" data-hl={k} style={{ top: lineAt(k, ROWS) }} aria-hidden="true" />
        ))}
        {CELLS.map((i) => (
          <span
            key={`g${i}`}
            className="hs-fx__ghost"
            data-ghost={i}
            data-g
            data-c={i % COLS}
            data-r={Math.floor(i / COLS)}
            style={area(i % COLS, Math.floor(i / COLS))}
            aria-hidden="true"
          />
        ))}
        {slots.map((cell, k) => {
          const p = placement.shown[k];
          const item = pool[p];
          const c = FIELD_LIGHT[item.project];
          return (
            <span
              key={`s${cell}`}
              className="hs-fx__slot"
              data-g
              data-slot={k}
              data-c={cell % COLS}
              data-r={Math.floor(cell / COLS)}
              data-item={p}
              data-kind={item.kind}
              data-lit="0"
              data-a="fade"
              data-d={Math.round(((cell * 37) % 23) * 30)}
              style={{ ...area(cell % COLS, Math.floor(cell / COLS)), '--fi-ink': c.ink, '--fi-lit': c.lit, '--fi-dim': c.dim } as CSSProperties}
              onMouseEnter={onSlotEnter}
              onMouseLeave={() => {
                if (m.current.hoveredSlot === k) cancelOpen();
              }}
              aria-hidden="true"
            >
              <i className="hs-fx__tile">
                <i className="hs-fx__ico" data-ico style={{ maskImage: `url(${item.img})`, WebkitMaskImage: `url(${item.img})` }} />
              </i>
            </span>
          );
        })}
        {T.letters.map((L) => (
            <span
              key={`l${L.n}`}
              className="hs-fx__ch"
              data-letter
              aria-hidden="true"
              data-g
              data-c={L.c}
              data-r={L.r}
              data-a="up"
              data-d={60 + L.n * 12}
              style={{ ...area(L.c, L.r), fontVariationSettings: baseAxes }}
            >
              {L.ch}
            </span>
          ))}
        {T.keys.map((K2) => (
            <span
              key={`k${K2.n}`}
              className={`hs-fx__key hs-fx__key--${K2.word}`}
              aria-hidden="true"
              data-g
              data-c={K2.c}
              data-r={K2.r}
              data-w="2"
              data-h="2"
              data-a="wipe"
              data-d={120 + K2.n * 18}
              style={area(K2.c, K2.r, 2, 2)}
            >
              <i>{K2.ch}</i>
            </span>
          ))}
        <span
          className="hs-fx__box hs-fx__name"
          data-g
          data-c={T.name.c0}
          data-r={T.name.r}
          data-w={T.name.c1 - T.name.c0 + 1}
          data-a="fade"
          data-d="200"
          style={area(T.name.c0, T.name.r, T.name.c1 - T.name.c0 + 1)}
        >
          <b>Zishuo Li</b>
          <span>portfolio · 2026</span>
        </span>
        {T.nav.map((n) => (
          <button
            key={n.label}
            type="button"
            className="hs-fx__box hs-fx__nav"
            data-g
            data-c={n.c0}
            data-r={n.r}
            data-w={n.c1 - n.c0 + 1}
            data-a="fade"
            data-d={260 + n.page * 40}
            style={area(n.c0, n.r, n.c1 - n.c0 + 1)}
            onClick={() => onGo(n.page)}
          >
            {n.label}
          </button>
        ))}
        <button
          type="button"
          className="hs-fx__btn hs-fx__btn--solid"
          data-g
          data-c={T.work.c0}
          data-r={T.work.r}
          data-w={T.work.c1 - T.work.c0 + 1}
          data-a="up"
          data-d="720"
          style={area(T.work.c0, T.work.r, T.work.c1 - T.work.c0 + 1)}
          onClick={onWork}
        >
          The projects ↓
        </button>
        <Link
          href="/lab"
          className="hs-fx__btn hs-fx__btn--line"
          data-g
          data-c={T.lab.c0}
          data-r={T.lab.r}
          data-w={T.lab.c1 - T.lab.c0 + 1}
          data-a="up"
          data-d="780"
          style={area(T.lab.c0, T.lab.r, T.lab.c1 - T.lab.c0 + 1)}
        >
          Open the lab ↗
        </Link>
        <span
          className="hs-fx__hint"
          data-g
          data-c={T.hint.c0}
          data-r={T.hint.r}
          data-w={T.hint.c1 - T.hint.c0 + 1}
          data-a="fade"
          data-d="1000"
          style={area(T.hint.c0, T.hint.r, T.hint.c1 - T.hint.c0 + 1)}
        >
          {opened ? 'Each square is a piece of the work · move across the field' : 'Hover any square to open a piece of the work'}
        </span>
        {open && card ? (
          <Link
            ref={cardRef}
            href={card.href}
            className="hs-fx__card"
            data-item={open.pick}
            data-kind={card.kind}
            style={cardStyle}
            onClick={(e) => {
              if (card.kind === 'about' && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                onAbout();
              }
            }}
            onMouseEnter={() => clearTimeout(m.current.closeT)}
            onMouseLeave={() => {
              clearTimeout(m.current.closeT);
              m.current.closeT = setTimeout(collapse, 160);
            }}
            aria-label={`${card.title} — ${card.no} · ${card.cap}`}
          >
            <span className="hs-fx__card-kind">{FIELD_KINDS[card.kind].label}</span>
            <span className="hs-fx__card-img" role="img" aria-label={card.title} style={{ maskImage: `url(${card.img})`, WebkitMaskImage: `url(${card.img})` }} />
            <span className="hs-fx__card-txt" data-card-txt>
              <span className="hs-fx__card-meta">
                <span className="hs-fx__card-title">{card.title}</span>
                <span className="hs-fx__card-cap">
                  {card.no} · {card.cap}
                </span>
              </span>
              <span className="hs-fx__card-go">↗</span>
            </span>
          </Link>
        ) : null}
      </div>
      {/* 窄屏 / 减少动态效果：格子收起，标语按同一套宽窄对比排成普通文字（MAPPING §65） */}
      <div className="hs-fx-flow">
        <p className="hs-fx-flow__title" aria-hidden="true">
          I explore how people relate to <span className="hs-fx-flow__k1">objects</span> and <span className="hs-fx-flow__k2">spaces</span> that respond to them.
        </p>
        <div className="hs-fx-flow__ctas">
          <button type="button" className="hs-fx__btn hs-fx__btn--solid" onClick={onWork}>
            The projects ↓
          </button>
          <Link href="/lab" className="hs-fx__btn hs-fx__btn--line">
            Open the lab ↗
          </Link>
        </div>
      </div>
      <div className="hs-fx__foot" data-a="fade" data-d="1200" aria-hidden="true">
        <span className="hs-fx__foot-lead">Each square is one piece</span>
        <span className="hs-fx__mk hs-fx__mk--project">project</span>
        <span className="hs-fx__mk hs-fx__mk--lab">lab bench</span>
        <span className="hs-fx__mk hs-fx__mk--log">log entry</span>
        <span className="hs-fx__mk hs-fx__mk--other">other work</span>
        <span className="hs-fx__sw" style={{ '--sw': FIELD_LIGHT['project-i'].lit } as CSSProperties}>Project I</span>
        <span className="hs-fx__sw" style={{ '--sw': FIELD_LIGHT['project-ii'].lit } as CSSProperties}>Project II</span>
        <span className="hs-fx__sw" style={{ '--sw': FIELD_LIGHT['project-iii'].lit } as CSSProperties}>Project III</span>
        <span className="hs-fx__sw" style={{ '--sw': FIELD_LIGHT['other-work'].lit } as CSSProperties}>other · this site</span>
      </div>
      <div className="hs-shade" />
    </>
  );
}
