'use client';

// 03 About 的宣言「From spaces to interactions.」（2026-10-28，MAPPING §74）：
// 鼠标停在标题上，附近的字变宽变粗，移开后慢慢收回——与首屏字格同一套曲线与时长（home-fx 的 swellAt / FX.SWELL_*）。
// 细窄的字从 76 / 300 起跳，本来就宽粗的两个名词从 125 / 640 起跳，鼓到同一个最宽最粗。
// 字心按平时（没鼓起时）的位置量一次存下来，按它算距离：鼓起的字会把后面的字往右推，按实时位置算会自己追着自己抖。
// 只在翻页版式里、允许动效、用鼠标时生效；窄屏文档流里标题会折行，鼓起会改折行，不做。
import { useEffect, useRef } from 'react';
import { FX, swellAt, swellFrom, type Axes } from '../../../src/lib/site/home-fx';
import { HOME_FLOW_QUERY, prefersReducedMotion } from '../../../src/lib/site/home-mode';

const css = (a: Axes) => `'wdth' ${a.wdth}, 'wght' ${a.wght}`;
const EASE = 'cubic-bezier(.2,.7,.1,1)';

interface Letter {
  el: HTMLElement;
  base: Axes;
  cur: Axes;
  /** 平时的字心，相对标题左上角（px） */
  x: number;
  y: number;
}

function Word({ text, wide }: { text: string; wide?: boolean }) {
  const base = wide ? FX.SAY_WIDE : FX.SAY_PLAIN;
  return (
    <span className={wide ? 'hs-w hs-say__w' : 'hs-say__w'}>
      {Array.from(text).map((ch, i) => (
        <span key={i} data-say={wide ? 'w' : 'p'} style={{ fontVariationSettings: css(base) }}>
          {ch}
        </span>
      ))}
    </span>
  );
}

export function AboutSay() {
  const ref = useRef<HTMLHeadingElement>(null);
  const st = useRef({
    letters: [] as Letter[],
    measured: false,
    /** 最后一个字收回平时样子的时刻；之前量位置会把鼓起量进去 */
    calmAt: 0,
    ptr: null as { x: number; y: number } | null,
    raf: 0,
  });

  const apply = () => {
    const h = ref.current;
    const s = st.current;
    if (!h) return;
    const hr = h.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(h).fontSize) || 1;
    const cw = fs * FX.SAY_CELL_W;
    const ch = fs * FX.SAY_CELL_H;
    const now = performance.now();
    for (const L of s.letters) {
      const f = s.ptr ? swellAt((s.ptr.x - hr.left - L.x) / cw, (s.ptr.y - hr.top - L.y) / ch) : 0;
      const a = swellFrom(L.base, f);
      if (a.wdth === L.cur.wdth && a.wght === L.cur.wght) continue;
      const ms = a.wght > L.cur.wght ? FX.SWELL_IN_MS : FX.SWELL_OUT_MS;
      L.cur = a;
      L.el.style.transition = `font-variation-settings ${ms}ms ${EASE}`;
      L.el.style.fontVariationSettings = css(a);
      s.calmAt = Math.max(s.calmAt, now + ms);
    }
  };

  const schedule = () => {
    const s = st.current;
    if (!s.raf)
      s.raf = requestAnimationFrame(() => {
        s.raf = 0;
        apply();
      });
  };

  useEffect(() => {
    const h = ref.current!;
    const s = st.current;
    s.letters = Array.from(h.querySelectorAll<HTMLElement>('[data-say]')).map((el) => {
      const base = el.dataset.say === 'w' ? FX.SAY_WIDE : FX.SAY_PLAIN;
      return { el, base, cur: base, x: 0, y: 0 };
    });
    // 尺寸变了字心就不对了：立刻回到平时样子，下次指针进来时重新量
    const ro = new ResizeObserver(() => {
      s.ptr = null;
      s.measured = false;
      s.calmAt = 0;
      for (const L of s.letters) {
        L.cur = L.base;
        L.el.style.transition = 'none';
        L.el.style.fontVariationSettings = css(L.base);
      }
    });
    ro.observe(h);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, []);

  const onMove = (e: React.PointerEvent<HTMLHeadingElement>) => {
    if (e.pointerType === 'touch' || window.matchMedia(HOME_FLOW_QUERY).matches || prefersReducedMotion()) return;
    const s = st.current;
    if (!s.measured) {
      if (performance.now() < s.calmAt) return;
      const hr = e.currentTarget.getBoundingClientRect();
      for (const L of s.letters) {
        const r = L.el.getBoundingClientRect();
        L.x = r.left + r.width / 2 - hr.left;
        L.y = r.top + r.height / 2 - hr.top;
      }
      s.measured = true;
    }
    s.ptr = { x: e.clientX, y: e.clientY };
    schedule();
  };

  const onLeave = () => {
    st.current.ptr = null;
    schedule();
  };

  return (
    <h2 ref={ref} className="hs-h2 hs-h2--say" data-a="rise" data-d="60" onPointerMove={onMove} onPointerLeave={onLeave}>
      <span className="hs-sr">From spaces to interactions.</span>
      <span aria-hidden="true">
        <Word text="From" /> <Word text="spaces" wide />{' '}
        <span className="hs-accent--lime">
          <Word text="to" /> <Word text="interactions." wide />
        </span>
      </span>
    </h2>
  );
}
