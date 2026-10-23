'use client';

// 01 Field（稿 design-ref/home-field-hero/17 Home - Field Hero.dc.html，MAPPING §55）。
// 一张 28×14 的方块场：方块随机亮起又熄灭（一部分带作品缩略图），指针划过留下一圈短暂的余光；
// 悬停一个亮着的方块，它就长成一张 6×4 的卡（周围方块让位），点卡进那件作品。
// 中央是标题区，场在它后面绕开。手感常量照稿原样，一个数没改。
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HomeField } from '../../../src/lib/site/home-model';

const COLS = 28;
const ROWS = 14;
/** 卡占几格 */
const CW = 6;
const CH = 4;
const GAP = 12;
/** 卡所在行列放大倍数（其余行列等比收窄让位） */
const K = 1.5;
/** 场里同时亮着的方块目标数 / 其中带缩略图的比例（稿 props fieldDensity / fieldThumbs 默认值） */
const DENSITY = 250;
const THUMBS = 0.35;
const TICK_MS = 110;
const FLOW_QUERY = '(max-width: 1023px), (prefers-reduced-motion: reduce)';

const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const TENS = ['', '', 'twenty', 'thirty', 'forty'];
function numWord(n: number): string {
  if (n <= 20) return NUM[n];
  if (n < 50) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${NUM[n % 10]}` : '');
  return String(n);
}
const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Zone {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Open {
  i: number;
  pick: number;
  c0: number;
  r0: number;
  rect: Rect;
  n: number;
}

/** 卡所在行列放大 K 倍、其余等比收窄后，各行列的左缘与中心位移（稿 geom 原式）。 */
function axis(n: number, span: number, start: number, total: number) {
  const cell = (total - GAP * (n - 1)) / n;
  const u = (n * cell) / (n - span + span * K);
  const lefts: number[] = [];
  const shift: number[] = [];
  let x = 0;
  for (let k = 0; k < n; k++) {
    const w = k >= start && k < start + span ? u * K : u;
    lefts.push(x);
    shift.push(x + w / 2 - (k * (cell + GAP) + cell / 2));
    x += w + GAP;
  }
  return { lefts, shift, u };
}

/** 卡从被悬停的那一格展开：clip-path 的起点框（百分比 inset） */
function cellInset(i: number, c0: number, r0: number) {
  const r = Math.floor(i / COLS);
  const c = i % COLS;
  const L = ((c - c0) / CW) * 100;
  const T = ((r - r0) / CH) * 100;
  return `inset(${T}% ${100 - L - 100 / CW}% ${100 - T - 100 / CH}% ${L}%)`;
}

const CELLS = Array.from({ length: COLS * ROWS }, (_, i) => i);

export function FieldPage({ field, active, onWork }: { field: HomeField; active: boolean; onWork: () => void }) {
  const { pool } = field;
  const fieldRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const [open, setOpen] = useState<Open | null>(null);
  const [opened, setOpened] = useState(0);
  const openRef = useRef<Open | null>(null);
  openRef.current = open;

  const m = useRef({
    cells: [] as HTMLElement[],
    ghosts: [] as HTMLElement[],
    lit: new Map<number, number>(),
    zone: { r0: 4, r1: 9, c0: 7, c1: 20 } as Zone,
    lastCell: -1,
    closing: false,
    closeT: undefined as ReturnType<typeof setTimeout> | undefined,
    txtT: undefined as ReturnType<typeof setTimeout> | undefined,
  });

  const motionOn = () => !window.matchMedia(FLOW_QUERY).matches;

  const isCenter = (i: number) => {
    const z = m.current.zone;
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    return r >= z.r0 && r <= z.r1 && c >= z.c0 && c <= z.c1;
  };

  const applyShift = (g: { sx: number[]; sy: number[] } | null) => {
    const { cells, ghosts } = m.current;
    for (let i = 0; i < cells.length; i++) {
      const t = g ? `translate(${g.sx[i % COLS].toFixed(1)}px,${g.sy[Math.floor(i / COLS)].toFixed(1)}px)` : '';
      cells[i].style.transform = t;
      if (ghosts[i]) ghosts[i].style.transform = t;
    }
  };

  const openAt = useCallback((i: number, pick: number) => {
    const f = fieldRef.current;
    if (!f) return;
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const c0 = Math.max(0, Math.min(COLS - CW, c - 3));
    const r0 = Math.max(0, Math.min(ROWS - CH, r - 2));
    clearTimeout(m.current.closeT);
    m.current.closing = false;
    const fr = f.getBoundingClientRect();
    const X = axis(COLS, CW, c0, fr.width);
    const Y = axis(ROWS, CH, r0, fr.height);
    applyShift({ sx: X.shift, sy: Y.shift });
    const rect = { x: X.lefts[c0], y: Y.lefts[r0], w: CW * X.u * K + (CW - 1) * GAP, h: CH * Y.u * K + (CH - 1) * GAP };
    setOpened((n) => n + 1);
    setOpen((o) => ({ i, pick, c0, r0, rect, n: (o?.n ?? 0) + 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      m.current.closing = false;
      setOpen(null);
    };
    if (!motionOn()) return done();
    const a = cd.animate(
      [
        { clipPath: 'inset(0 0 0 0)', opacity: 1 },
        { clipPath: cellInset(o.i, o.c0, o.r0), opacity: 0 },
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
          { clipPath: cellInset(open.i, open.c0, open.r0), opacity: 0.6 },
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

  // 翻离首屏时把卡收起
  useEffect(() => {
    if (!active && openRef.current) collapse();
  }, [active, collapse]);

  // 场的心跳：亮起 / 熄灭（只在首屏是当前页、且不在窄屏 / reduced-motion 文档流时跑）
  useEffect(() => {
    const f = fieldRef.current!;
    const st = m.current;
    st.cells = Array.from(f.querySelectorAll<HTMLElement>('[data-cell]'));
    st.ghosts = Array.from(ghostRef.current!.querySelectorAll<HTMLElement>('[data-ghost]'));
    const els = st.cells;

    // 中央标题区底下不亮方块：量标题区盖住哪些行列
    const measure = () => {
      const t = centerRef.current;
      if (!t) return;
      const fr = f.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      if (!fr.width || !fr.height) return;
      const pad = 10;
      st.zone = {
        c0: Math.max(0, Math.floor(((tr.left - pad - fr.left) / fr.width) * COLS)),
        c1: Math.min(COLS - 1, Math.ceil(((tr.right + pad - fr.left) / fr.width) * COLS) - 1),
        r0: Math.max(0, Math.floor(((tr.top - pad - fr.top) / fr.height) * ROWS)),
        r1: Math.min(ROWS - 1, Math.ceil(((tr.bottom + pad - fr.top) / fr.height) * ROWS) - 1),
      };
      for (const [i] of st.lit) {
        if (isCenter(i)) {
          els[i].style.opacity = '0';
          els[i].style.pointerEvents = 'none';
          st.lit.delete(i);
        }
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(f);

    const timer = setInterval(() => {
      if (!activeRef.current || !motionOn()) return;
      const now = performance.now();
      const hv = openRef.current?.i;
      for (const [i, exp] of st.lit) {
        if (now > exp && i !== hv) {
          const el = els[i];
          el.style.transitionDuration = '2.2s,.7s';
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          st.lit.delete(i);
        }
      }
      const n = st.lit.size < DENSITY * 0.5 ? 8 : st.lit.size < DENSITY ? 4 : Math.random() < 0.6 ? 1 : 0;
      const litArr = Array.from(st.lit.keys());
      for (let k = 0; k < n; k++) {
        let i: number;
        if (litArr.length && Math.random() < 0.65) {
          // 多半长在已亮方块旁边：亮块成簇，不是均匀的雪花
          const b = litArr[Math.floor(Math.random() * litArr.length)];
          const d = [1, -1, COLS, -COLS, COLS + 1, COLS - 1, -COLS + 1, -COLS - 1][Math.floor(Math.random() * 8)];
          i = b + d;
          if (i < 0 || i >= els.length || Math.abs((i % COLS) - (b % COLS)) > 1) continue;
        } else i = Math.floor(Math.random() * els.length);
        if (isCenter(i) || st.lit.has(i)) continue;
        const el = els[i];
        const im = el.firstElementChild as HTMLElement;
        el.style.transitionDuration = `${(1.2 + Math.random() * 1.2).toFixed(2)}s,.7s`;
        el.style.opacity = (0.45 + Math.random() * 0.55).toFixed(2);
        el.style.pointerEvents = 'auto';
        if (Math.random() < THUMBS) {
          const p = Math.floor(Math.random() * pool.length);
          el.dataset.img = String(p);
          im.style.backgroundImage = `url(${pool[p].img})`;
          im.style.opacity = '.85';
        } else {
          delete el.dataset.img;
          im.style.opacity = '0';
        }
        st.lit.set(i, now + 2200 + Math.random() * 4000);
      }
    }, TICK_MS);

    return () => {
      clearInterval(timer);
      ro.disconnect();
      clearTimeout(st.closeT);
      clearTimeout(st.txtT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 指针划过：所在格闪一下、四邻淡一点、对角随机更淡（余光，不开卡） */
  const trigger = (i: number, amp: number, delay: number) => {
    const g = m.current.ghosts[i];
    if (!g) return;
    setTimeout(() => {
      g.style.transition = 'opacity .09s,transform .7s cubic-bezier(.2,.7,.1,1)';
      g.style.opacity = String(amp);
      setTimeout(() => {
        g.style.transition = `opacity ${(1.1 + amp).toFixed(2)}s ease,transform .7s cubic-bezier(.2,.7,.1,1)`;
        g.style.opacity = '0';
      }, 130);
    }, delay);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!active || openRef.current || !motionOn()) return;
    const f = fieldRef.current;
    if (!f) return;
    const fr = f.getBoundingClientRect();
    const px = e.clientX - fr.left;
    const py = e.clientY - fr.top;
    const cw = (fr.width - GAP * (COLS - 1)) / COLS;
    const ch = (fr.height - GAP * (ROWS - 1)) / ROWS;
    const c = Math.floor(px / (cw + GAP));
    const r = Math.floor(py / (ch + GAP));
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    const i = r * COLS + c;
    if (i === m.current.lastCell) return;
    m.current.lastCell = i;
    trigger(i, 1, 0);
    const near = (dc: number, dr: number) => {
      const cc = c + dc;
      const rr = r + dr;
      return cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS ? rr * COLS + cc : -1;
    };
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
      const j = near(dc, dr);
      if (j >= 0) trigger(j, 0.45, 70);
    });
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([dc, dr]) => {
      const j = near(dc, dr);
      if (j >= 0 && Math.random() < 0.5) trigger(j, 0.2, 140);
    });
  };

  const onCellEnter = (e: React.MouseEvent<HTMLSpanElement>) => {
    const el = e.currentTarget;
    const i = Number(el.dataset.cell);
    if (openRef.current?.i === i && !m.current.closing) return;
    const pick = el.dataset.img != null ? Number(el.dataset.img) : Math.floor(Math.random() * pool.length);
    openAt(i, pick);
  };

  const card = open ? pool[open.pick] : null;
  const cardStyle: CSSProperties | undefined = open
    ? { left: open.rect.x, top: open.rect.y, width: open.rect.w, height: open.rect.h }
    : undefined;

  return (
    <>
      <div className="hs-field__glow" aria-hidden="true" />
      <div className="hs-field__grid hs-field__grid--ghost" ref={ghostRef} aria-hidden="true">
        {CELLS.map((i) => (
          <span key={i} className="hs-field__ghost" data-ghost />
        ))}
      </div>
      <div
        className="hs-field__grid"
        ref={fieldRef}
        onPointerMove={onMove}
        onPointerLeave={() => (m.current.lastCell = -1)}
      >
        {CELLS.map((i) => (
          <span key={i} className="hs-field__cell" data-cell={i} onMouseEnter={onCellEnter} aria-hidden="true">
            <span className="hs-field__cimg" />
          </span>
        ))}
        {open && card ? (
          <Link
            ref={cardRef}
            href={card.href}
            className="hs-field__card"
            style={cardStyle}
            onMouseEnter={() => clearTimeout(m.current.closeT)}
            onMouseLeave={() => {
              clearTimeout(m.current.closeT);
              m.current.closeT = setTimeout(collapse, 160);
            }}
            aria-label={`${card.title} — ${card.no} · ${card.cap}`}
          >
            <span className="hs-field__card-img" role="img" aria-label={card.title} style={{ backgroundImage: `url(${card.img})` }} />
            <span className="hs-field__card-txt" data-card-txt>
              <span className="hs-field__card-meta">
                <span className="hs-field__card-title">{card.title}</span>
                <span className="hs-field__card-cap">
                  {card.no} · {card.cap}
                </span>
              </span>
              <span className="hs-field__card-go">↗</span>
            </span>
          </Link>
        ) : null}
      </div>
      <div className="hs-field__center" ref={centerRef}>
        <p className="hs-field__name" data-a="up" data-d="0">
          Zishuo Li
          <span className="hs-field__name-rule" />
          <span className="hs-field__name-tag">portfolio · 2026</span>
        </p>
        <div className="hs-mask">
          <h1 className="hs-field__title" data-a="rise" data-d="80">
            I explore how people relate to <span className="hs-accent--lime">objects and spaces that respond to them.</span>
          </h1>
        </div>
        <p className="hs-field__lede" data-a="up" data-d="260">
          A machine that wakes with a new character. A room that reshapes itself around whoever is in it.{' '}
          {cap1(numWord(field.benches))} working benches behind them.
        </p>
        <div className="hs-field__ctas" data-a="up" data-d="380">
          <button type="button" className="hs-field__btn hs-field__btn--solid" onClick={onWork}>
            The projects ↓
          </button>
          <Link href="/lab" className="hs-field__btn hs-field__btn--line">
            Open the lab ↗
          </Link>
        </div>
        <p className="hs-field__hint" data-a="fade" data-d="900">
          {opened ? 'Each square is a piece of the work · move across the field' : 'Hover any square to open a piece of the work'}
        </p>
      </div>
      <div className="hs-field__foot" data-a="fade" data-d="1200">
        <span>
          {field.projects} projects · {field.benches} live benches · {field.entries} log entries
        </span>
        <span>Scroll ↓</span>
      </div>
      <div className="hs-shade" />
    </>
  );
}
