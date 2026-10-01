'use client';

import { useEffect, useRef, useState } from 'react';
import { STATS, tx, type Lang } from '../../../src/lib/site/case-reincarnation';
import { useReducedMotion } from './hooks';

const COUNT_MS = 1400;

/** 一格「划掉的旧值 → 新值」：第一次滚进视野时，新值从旧值数到位（稿 countUp，easeOutCubic 1.4s）。 */
function Cell({ k, from, to, dec, unit, note, reduced }: { k: string; from: number; to: number; dec: number; unit: string; note: string; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof IntersectionObserver === 'undefined') return;
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / COUNT_MS);
          setV(from + (to - from) * (1 - Math.pow(1 - p, 3)));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [from, to, reduced]);
  return (
    <div className="cs-cell cs-cell--stat" ref={ref}>
      <span className="cs-stat__k">{k}</span>
      <span className="cs-stat__v">
        <span className="cs-stat__from">{from.toFixed(dec)}</span>
        <span className="cs-stat__arrow">→</span>
        <span className="cs-stat__to">{v.toFixed(dec)}</span>
        <span className="cs-stat__unit">{unit}</span>
      </span>
      <span className="cs-stat__note">{note}</span>
    </div>
  );
}

/** 算过的，和算错的（稿 stats）：四格旧值 → 新值。 */
export function StatCompare({ lang = 'en' }: { lang?: Lang }) {
  const reduced = useReducedMotion();
  return (
    <div className="cs-cells cs-cells--stats">
      {STATS.map((s, i) => (
        <Cell key={i} k={tx(s.k, lang)} from={s.from} to={s.to} dec={s.dec} unit={s.unit} note={tx(s.note, lang)} reduced={reduced} />
      ))}
    </div>
  );
}
