'use client';

// 01 Field（稿 design-ref/home-field-hero/17 Home - Field Hero.dc.html，MAPPING §55）。
// 一张 28×14 的方块场：方块随机亮起又熄灭，指针划过或停留时留下一圈余光；
// 在亮着的方块上稍作停留，它就长成一张 6×4 的卡（周围方块让位），点卡进那件作品。
// 中央是标题区，场在它后面绕开。停留与余光规则见 MAPPING §57.1 / §57.3。
// 2026-10-27（MAPPING §64）：余光照旧，光标附近的方块另外按距离转角、拉斜（开卡时停）；
// 场里不亮方块的那块空地画四个角标，边界与「方块不亮」的格线对齐。
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { HomeField } from '../../../src/lib/site/home-model';
import { FIELD_KINDS, fieldColors, pickFieldIndex } from '../../../src/lib/site/field-visuals';
import { tiltAt, tiltCss } from '../../../src/lib/site/home-fx';

const COLS = 28;
const ROWS = 14;
/** 卡占几格 */
const CW = 6;
const CH = 4;
const GAP = 12;
/** 卡所在行列放大倍数（其余行列等比收窄让位） */
const K = 1.5;
/** 场里同时亮着的方块目标数 / 其中明亮图标的比例；其余图标低对比保持原稿的疏密。 */
const DENSITY = 250;
const THUMBS = 0.35;
const TICK_MS = 110;
const FADE_OUT_MS = 2200;
/** 快速掠过不触发：余光先响应，再确认开卡意图。 */
const WAKE_DWELL_MS = 50;
const WAKE_TRACK_MS = 110;
const OPEN_DWELL_MS = 160;
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

export function FieldPage({ field, active, onWork, onAbout }: { field: HomeField; active: boolean; onWork: () => void; onAbout: () => void }) {
  const { pool } = field;
  const fieldRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
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
    fading: new Map<number, number>(),
    zone: { r0: 4, r1: 9, c0: 7, c1: 20 } as Zone,
    lastCell: -1,
    pointer: null as { x: number; y: number } | null,
    /** 开卡时各行列的让位位移；倾斜与它合成同一个 transform */
    shift: null as { sx: number[]; sy: number[] } | null,
    /** 每格当前的倾斜（空串 = 不倾斜）与倾斜跟的指针 */
    tilts: [] as string[],
    tiltPtr: null as { x: number; y: number } | null,
    tiltRaf: 0,
    ghostTimers: new Map<number, ReturnType<typeof setTimeout>>(),
    heldGhosts: new Map<number, number>(),
    hoveredCell: -1,
    closing: false,
    wakeT: undefined as ReturnType<typeof setTimeout> | undefined,
    openT: undefined as ReturnType<typeof setTimeout> | undefined,
    closeT: undefined as ReturnType<typeof setTimeout> | undefined,
    txtT: undefined as ReturnType<typeof setTimeout> | undefined,
  });

  const motionOn = () => !window.matchMedia(FLOW_QUERY).matches;

  const cancelOpen = useCallback(() => {
    clearTimeout(m.current.openT);
    m.current.hoveredCell = -1;
  }, []);

  const fadeGhost = (i: number, amp: number) => {
    const g = m.current.ghosts[i];
    clearTimeout(m.current.ghostTimers.get(i));
    m.current.ghostTimers.delete(i);
    g.style.transition = `opacity ${(1.1 + amp).toFixed(2)}s ease,transform .7s cubic-bezier(.2,.7,.1,1)`;
    g.style.opacity = '0';
  };

  const cancelHover = useCallback(() => {
    cancelOpen();
    clearTimeout(m.current.wakeT);
    m.current.lastCell = -1;
    m.current.pointer = null;
    m.current.tiltPtr = null;
    scheduleTilt();
    for (const [i, amp] of m.current.heldGhosts) fadeGhost(i, amp);
    m.current.heldGhosts.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelOpen]);

  const isCenter = (i: number) => {
    const z = m.current.zone;
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    return r >= z.r0 && r <= z.r1 && c >= z.c0 && c <= z.c1;
  };

  /** 一格的 transform = 开卡让位（translate）+ 光标倾斜，两者各管各的、在这里合成 */
  const composeAt = (i: number) => {
    const { shift, tilts } = m.current;
    const s = shift ? `translate(${shift.sx[i % COLS].toFixed(1)}px,${shift.sy[Math.floor(i / COLS)].toFixed(1)}px)` : '';
    const t = tilts[i] ?? '';
    return s && t ? `${s} ${t}` : s || t;
  };

  const applyShift = (g: { sx: number[]; sy: number[] } | null) => {
    const { cells, ghosts } = m.current;
    m.current.shift = g;
    // 开卡时指针在卡上，周围方块回正，免得卡边一圈乱动
    if (g) m.current.tilts = [];
    for (let i = 0; i < cells.length; i++) {
      const t = composeAt(i);
      cells[i].style.transform = t;
      if (ghosts[i]) ghosts[i].style.transform = t;
    }
  };

  /** 光标附近的方块按距离转角、拉斜；方块中心按网格几何算，不逐格量框。开卡中、翻离首屏、文档流里一律回正。 */
  const applyTilt = () => {
    const st = m.current;
    const f = fieldRef.current;
    if (!f || !st.cells.length) return;
    const p = st.tiltPtr;
    const off = !p || !!openRef.current || !activeRef.current || !motionOn();
    const fr = f.getBoundingClientRect();
    const cw = (fr.width - GAP * (COLS - 1)) / COLS;
    const ch = (fr.height - GAP * (ROWS - 1)) / ROWS;
    for (let i = 0; i < st.cells.length; i++) {
      let next = '';
      // 标题底下那块地里的方块只亮不转：大字压在上面，转动的方块会把字底搅乱
      if (!off && !isCenter(i)) {
        const cx = fr.left + (i % COLS) * (cw + GAP) + cw / 2;
        const cy = fr.top + Math.floor(i / COLS) * (ch + GAP) + ch / 2;
        next = tiltCss(tiltAt(cx - p!.x, cy - p!.y));
      }
      if (next === (st.tilts[i] ?? '')) continue;
      st.tilts[i] = next;
      const t = composeAt(i);
      st.cells[i].style.transform = t;
      if (st.ghosts[i]) st.ghosts[i].style.transform = t;
    }
  };
  const scheduleTilt = () => {
    if (m.current.tiltRaf) return;
    m.current.tiltRaf = requestAnimationFrame(() => {
      m.current.tiltRaf = 0;
      applyTilt();
    });
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
    const rect = { x: X.lefts[c0], y: Y.lefts[r0], w: CW * X.u * K + (CW - 1) * GAP, h: CH * Y.u * K + (CH - 1) * GAP };
    const nextOpen = { i, pick, c0, r0, rect, n: (openRef.current?.n ?? 0) + 1 };
    // 同步把悬停占位交给展开卡，避免 React 提交前被心跳回收。
    openRef.current = nextOpen;
    // 开卡只接管内容悬停；指针余光在展开、收回和静止时继续响应。
    cancelOpen();
    applyShift({ sx: X.shift, sy: Y.shift });
    setOpened((n) => n + 1);
    setOpen(nextOpen);
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
      if (openRef.current !== o) return;
      m.current.closing = false;
      openRef.current = null;
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

  // 翻离首屏时取消等待，并把已经展开的卡收起。
  useEffect(() => {
    if (!active) {
      cancelHover();
      if (openRef.current) collapse();
    }
  }, [active, collapse, cancelHover]);

  // 场的心跳：亮起 / 熄灭（只在首屏是当前页、且不在窄屏 / reduced-motion 文档流时跑）
  useEffect(() => {
    const f = fieldRef.current!;
    const st = m.current;
    st.cells = Array.from(f.querySelectorAll<HTMLElement>('[data-cell]'));
    st.ghosts = Array.from(ghostRef.current!.querySelectorAll<HTMLElement>('[data-ghost]'));
    const els = st.cells;

    const startFade = (i: number, now: number) => {
      if (!st.lit.has(i)) return;
      st.lit.delete(i);
      st.fading.set(i, now + FADE_OUT_MS);
      const el = els[i];
      el.dataset.phase = 'fading';
      el.style.transitionDuration = `${FADE_OUT_MS}ms,.7s`;
      el.style.opacity = '0';
      // 淡出仍属于这一轮：保留 item / 图标 / 配色和悬停响应。
    };

    // 中央标题区底下不亮方块：量标题区盖住哪些行列
    const measure = () => {
      cancelHover();
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
      // 角标框落在「方块不亮」那几行几列的外缘格缝上
      const fx = frameRef.current;
      const pg = fx?.offsetParent as HTMLElement | null;
      if (fx && pg) {
        const pr = pg.getBoundingClientRect();
        const cw = (fr.width - GAP * (COLS - 1)) / COLS;
        const ch = (fr.height - GAP * (ROWS - 1)) / ROWS;
        const z = st.zone;
        const x0 = fr.left - pr.left + z.c0 * (cw + GAP) - GAP / 2;
        const x1 = fr.left - pr.left + (z.c1 + 1) * (cw + GAP) - GAP / 2;
        const y0 = fr.top - pr.top + z.r0 * (ch + GAP) - GAP / 2;
        const y1 = fr.top - pr.top + (z.r1 + 1) * (ch + GAP) - GAP / 2;
        Object.assign(fx.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
      }
      const now = performance.now();
      for (const i of new Set([...st.lit.keys(), ...st.fading.keys()])) {
        const covered = isCenter(i);
        if (covered) startFade(i, now);
        els[i].style.pointerEvents = covered ? 'none' : 'auto';
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(f);
    if (centerRef.current) ro.observe(centerRef.current);

    const timer = setInterval(() => {
      if (!activeRef.current || !motionOn()) return;
      const now = performance.now();
      const hv = openRef.current?.i;
      const retired = new Set<number>();
      for (const [i, end] of st.fading) {
        // 后台/暂停时墙钟可能先到，必须等画面真的淡完；悬停等待和展开卡继续占位。
        if (now < end || i === hv || i === st.hoveredCell || Number(getComputedStyle(els[i]).opacity) !== 0) continue;
        els[i].style.pointerEvents = 'none';
        els[i].dataset.phase = 'off';
        st.fading.delete(i);
        retired.add(i);
      }
      for (const [i, exp] of st.lit) {
        if (now > exp && i !== hv && i !== st.hoveredCell) startFade(i, now);
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
        // 淡出尚未结束的位置不能换内容；刚回收的格至少留一拍全黑再重亮。
        if (isCenter(i) || st.lit.has(i) || st.fading.has(i) || retired.has(i)) continue;
        const el = els[i];
        const im = el.firstElementChild as HTMLElement;
        el.style.transitionDuration = `${(1.2 + Math.random() * 1.2).toFixed(2)}s,.7s`;
        el.style.opacity = (0.45 + Math.random() * 0.55).toFixed(2);
        el.style.pointerEvents = 'auto';
        el.dataset.phase = 'lit';
        // 每个亮格从出现起固定绑定真实内容；不在悬停时随机换成另一张卡（MAPPING §55.1）。
        const p = pickFieldIndex(field.draws);
        const colors = fieldColors(pool[p].project, pool[p].kind);
        el.dataset.item = String(p);
        el.dataset.kind = pool[p].kind;
        el.dataset.project = pool[p].project;
        el.style.setProperty('--field-ink', colors.ink);
        el.style.setProperty('--field-surface', colors.surface);
        im.style.maskImage = `url(${pool[p].img})`;
        im.style.opacity = Math.random() < THUMBS ? '1' : '.18';
        st.lit.set(i, now + 2200 + Math.random() * 4000);
      }
    }, TICK_MS);

    return () => {
      clearInterval(timer);
      ro.disconnect();
      cancelAnimationFrame(st.tiltRaf);
      st.tiltRaf = 0;
      clearTimeout(st.closeT);
      clearTimeout(st.txtT);
      cancelHover();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 所在格与邻格保持余光；离开邻域后沿原曲线淡出，不参与内容开卡。 */
  const trigger = (i: number, amp: number, delay: number) => {
    const st = m.current;
    const g = st.ghosts[i];
    if (!g) return;
    clearTimeout(st.ghostTimers.get(i));
    st.heldGhosts.set(i, amp);
    st.ghostTimers.set(i, setTimeout(() => {
      st.ghostTimers.delete(i);
      if (!activeRef.current || !motionOn()) return;
      g.style.transition = 'opacity .09s,transform .7s cubic-bezier(.2,.7,.1,1)';
      g.style.opacity = String(amp);
    }, delay));
  };

  /** 行列让位动画中也按当前视觉中心找邻格；格缝同样响应周围余光。 */
  const pointerCell = () => {
    const f = fieldRef.current;
    const { pointer, ghosts } = m.current;
    if (!f || !pointer || !ghosts.length) return -1;
    const fr = f.getBoundingClientRect();
    if (pointer.x < fr.left || pointer.x >= fr.right || pointer.y < fr.top || pointer.y >= fr.bottom) return -1;
    // 同列 x / 同行 y 一致，只读 28 + 14 个框，不扫描整个场。
    let c = 0;
    let r = 0;
    let dx = Infinity;
    let dy = Infinity;
    for (let col = 0; col < COLS; col++) {
      const rect = ghosts[col].getBoundingClientRect();
      const d = Math.abs(pointer.x - rect.left - rect.width / 2);
      if (d < dx) { dx = d; c = col; }
    }
    for (let row = 0; row < ROWS; row++) {
      const rect = ghosts[row * COLS].getBoundingClientRect();
      const d = Math.abs(pointer.y - rect.top - rect.height / 2);
      if (d < dy) { dy = d; r = row; }
    }
    return r * COLS + c;
  };

  const wake = () => {
    if (!activeRef.current || !motionOn() || !m.current.pointer) {
      cancelHover();
      return;
    }
    const i = pointerCell();
    // 指针不动时也追踪让位/复位；同一个视觉邻域不重复抽签或重启渐亮。
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
    m.current.tiltPtr = m.current.pointer;
    scheduleTilt();
    const i = pointerCell();
    if (i === m.current.lastCell) return;
    clearTimeout(m.current.wakeT);
    for (const [j, amp] of m.current.heldGhosts) fadeGhost(j, amp);
    m.current.heldGhosts.clear();
    m.current.lastCell = i;
    if (i >= 0) m.current.wakeT = setTimeout(wake, WAKE_DWELL_MS);
  };

  const onCellEnter = (e: React.MouseEvent<HTMLSpanElement>) => {
    const el = e.currentTarget;
    const i = Number(el.dataset.cell);
    cancelOpen();
    if (!activeRef.current || !motionOn()) return;
    if (openRef.current?.i === i && !m.current.closing) return;
    const item = el.dataset.item;
    if (item == null || isCenter(i) || (!m.current.lit.has(i) && !m.current.fading.has(i))) return;
    // 已经完全透明、尚未轮到心跳回收的格子不接受新的悬停。
    if (m.current.fading.has(i) && Number(getComputedStyle(el).opacity) === 0) return;
    m.current.hoveredCell = i;
    m.current.openT = setTimeout(() => {
      if (!activeRef.current || !motionOn() || m.current.hoveredCell !== i || (!m.current.lit.has(i) && !m.current.fading.has(i)) || el.dataset.item !== item || !el.matches(':hover')) return;
      openAt(i, Number(item));
    }, OPEN_DWELL_MS);
  };

  const card = open ? pool[open.pick] : null;
  const colors = card ? fieldColors(card.project, card.kind) : null;
  const cardStyle: CSSProperties | undefined = open && colors
    ? { left: open.rect.x, top: open.rect.y, width: open.rect.w, height: open.rect.h, '--field-ink': colors.ink, '--field-surface': colors.surface } as CSSProperties
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
        onPointerEnter={onMove}
        onPointerMove={onMove}
        onPointerLeave={cancelHover}
      >
        {CELLS.map((i) => (
          <span key={i} className="hs-field__cell" data-cell={i} onMouseEnter={onCellEnter} onMouseLeave={() => {
            if (m.current.hoveredCell === i) cancelOpen();
          }} aria-hidden="true">
            <span className="hs-field__cimg" />
          </span>
        ))}
        {open && card ? (
          <Link
            ref={cardRef}
            href={card.href}
            className="hs-field__card"
            data-item={open.pick}
            data-kind={card.kind}
            data-project={card.project}
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
            <span className="hs-field__card-kind">{FIELD_KINDS[card.kind].label}</span>
            <span className="hs-field__card-img" role="img" aria-label={card.title} style={{ maskImage: `url(${card.img})` }} />
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
      <div className="hs-field__frame" ref={frameRef} aria-hidden="true" data-a="fade" data-d="700">
        <i />
        <i />
        <i />
        <i />
        <b>01 — Field</b>
      </div>
      <div className="hs-field__center" ref={centerRef}>
        <div className="hs-mask">
          {/* 2026-10-27 第二轮（MAPPING §64.1）：四行定死的断行，像海报一样压在下半屏左边；两个宽词各落一行的行尾 / 行首 */}
          <h1 className="hs-field__title" data-a="rise" data-d="80">
            <span className="hs-ln">I explore how people</span>{' '}
            <span className="hs-ln">
              relate to <span className="hs-accent--lime hs-w">objects</span>
            </span>{' '}
            <span className="hs-ln hs-accent--lime">
              and <span className="hs-w">spaces</span> that
            </span>{' '}
            <span className="hs-ln hs-accent--lime">respond to them.</span>
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
