'use client';

// 03 About 的宣言「From spaces to interactions.」（2026-10-28，MAPPING §74）：
// 鼠标停在标题上，附近的字变宽变粗，移开后慢慢收回——与首屏字格同一套曲线与时长（home-fx 的 swellAt / FX.SWELL_*）。
// 细窄的字从 76 / 300 起跳，本来就宽粗的两个名词从 125 / 640 起跳，鼓到同一个最宽最粗（125 / 900，§75）。
// 字心按平时（没鼓起时）的位置量一次存下来，按它算距离：鼓起的字会把后面的字往右推，按实时位置算会自己追着自己抖。
// 指针在整个 About 页上都算（与首屏一样按距离衰减），不必正好落在标题框里（§75）。
// 只在翻页版式里、允许动效、用鼠标时生效；窄屏文档流里标题会折行，鼓起会改折行，不做。
import { useEffect, useRef } from 'react';
import {
  FX,
  swellAt,
  swellFrom,
  swellRest,
  swellRetarget,
  swellSample,
  swellTweenDone,
  type Axes,
  type SwellTween,
} from '../../../src/lib/site/home-fx';
import { HOME_FLOW_QUERY, prefersReducedMotion } from '../../../src/lib/site/home-mode';

const css = (a: Axes) => `'wdth' ${a.wdth}, 'wght' ${a.wght}`;

interface Letter {
  el: HTMLElement;
  base: Axes;
  /** 鼓起程度的过渡（按帧推进、只取有限几档，见 home-fx swellRetarget；不交给 CSS 过渡——那样每帧重排整页） */
  tw: SwellTween;
  /** 上一次写进样式的字宽字重 */
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
    ptr: null as { x: number; y: number } | null,
    /** 指针动过：下一帧重新算每个字该鼓多少 */
    aim: false,
    raf: 0,
  });

  /** 所有字都回到平时样子了没有：之前量位置会把鼓起量进去 */
  const calm = (now: number) => st.current.letters.every((L) => L.tw.to === 0 && swellTweenDone(L.tw, now));

  const tick = (now: number) => {
    const h = ref.current;
    const s = st.current;
    s.raf = 0;
    if (!h) return;
    if (s.aim) {
      s.aim = false;
      const hr = h.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(h).fontSize) || 1;
      const cw = fs * FX.SAY_CELL_W;
      const ch = fs * FX.SAY_CELL_H;
      for (const L of s.letters) {
        const f = s.ptr ? swellAt((s.ptr.x - hr.left - L.x) / cw, (s.ptr.y - hr.top - L.y) / ch) : 0;
        L.tw = swellRetarget(L.tw, f, now);
      }
    }
    let moving = false;
    for (const L of s.letters) {
      const a = swellFrom(L.base, swellSample(L.tw, now), FX.SAY_PEAK);
      if (a.wdth !== L.cur.wdth || a.wght !== L.cur.wght) {
        L.cur = a;
        L.el.style.fontVariationSettings = css(a);
      }
      if (!swellTweenDone(L.tw, now)) moving = true;
    }
    if (moving) s.raf = requestAnimationFrame(tick);
  };

  const schedule = () => {
    const s = st.current;
    s.aim = true;
    if (!s.raf) s.raf = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const h = ref.current!;
    const s = st.current;
    s.letters = Array.from(h.querySelectorAll<HTMLElement>('[data-say]')).map((el) => {
      const base = el.dataset.say === 'w' ? FX.SAY_WIDE : FX.SAY_PLAIN;
      return { el, base, tw: swellRest(), cur: base, x: 0, y: 0 };
    });
    // 尺寸变了字心就不对了：立刻回到平时样子，下次指针进来时重新量
    const ro = new ResizeObserver(() => {
      s.ptr = null;
      s.measured = false;
      for (const L of s.letters) {
        L.tw = swellRest();
        L.cur = L.base;
        L.el.style.fontVariationSettings = css(L.base);
      }
    });
    ro.observe(h);

    // 指针在整个 About 页上都算：离标题远的字按距离衰减到 0，不必正好落在标题框里
    const host: HTMLElement = h.closest<HTMLElement>('.hs-about') ?? h;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || window.matchMedia(HOME_FLOW_QUERY).matches || prefersReducedMotion()) return;
      if (!s.measured) {
        if (!calm(performance.now())) return;
        const hr = h.getBoundingClientRect();
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
      s.ptr = null;
      schedule();
    };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    return () => {
      ro.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <h2 ref={ref} className="hs-h2 hs-h2--say" data-a="rise" data-d="60">
      <span className="hs-sr">From spaces to interactions.</span>
      <span aria-hidden="true">
        <Word text="From" /> <Word text="spaces" wide />{' '}
        <span className="hs-accent--lime">
          <Word text="to" />
          {/* 翻页版式里整句不折行、在这里断开（与原来自然折行的位置相同）：字鼓起变宽时不会把「to」挤到第二行（§75） */}
          <br className="hs-say__br" /> <Word text="interactions." wide />
        </span>
      </span>
    </h2>
  );
}
