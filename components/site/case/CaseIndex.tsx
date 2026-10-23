'use client';

import { useEffect, useRef, useState } from 'react';
import { useCaseLang } from '../CaseLang';
import { chapterNo } from '../../../src/lib/site/case-headings';
import { CASE_JUMP_EVENT } from './CaseReveal';

const INK = 'oklch(0.95 0.032 120)';
const MUTE = 'oklch(0.8 0.035 162)';

/**
 * 正文标题（h2）上方留的空：稿里每章是一个 `section`，padding-top 120 + flex gap——
 * 读位判定与滚动落点都是按「章的上沿」算的，而本站正文是一条平铺的 MDX 流，
 * 能量到的是 h2 自己，所以统一减掉这一截。
 */
const SECTION_LEAD = 120;

/**
 * 目录栏（稿 aside，12a「TOC Rail」）：平时只是左侧吸顶的 28px 刻度竖条，悬停（或键盘聚焦）才展开出章节标题——
 * 标题逐项错开 22ms 淡入右移，背后衬一层底色渐变把正文压下去；离开留 120ms 余量，掠过缝隙不闪合。
 * 读位：视口 40% 处以上最后一个章节标题就是当前章（稿 scrollTick），当前项刻度加长、调亮，编号转绿；
 * 点击 = 平滑滚到该章。
 *
 * 标题表是服务端从 MDX 抽好传下来的（SSR 首帧就有），而滚动 / 跳转用的 DOM 元素是挂载后按顺序量 `.cs-body h2`
 * ——两侧语言的 h2 数量由 content.test 保证一致，所以下标可以直接对上。第 0 项是开场（没有标题行），对应正文起点。
 */
export function CaseIndex({ en, zh }: { en: readonly string[]; zh: readonly string[] }) {
  const lang = useCaseLang();
  const items = lang === 'zh' ? zh : en;
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(0);
  const actRef = useRef(0);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = 0;
      const lim = window.innerHeight * 0.4;
      let a = 0;
      document.querySelectorAll<HTMLElement>('.cs-body > h2').forEach((h, i) => {
        if (h.getBoundingClientRect().top - SECTION_LEAD < lim) a = i + 1;
      });
      if (a !== actRef.current) {
        actRef.current = a;
        setAct(a);
      }
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [lang]);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const go = (i: number) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = i === 0 ? document.querySelector<HTMLElement>('.cs-body') : document.querySelectorAll<HTMLElement>('.cs-body > h2')[i - 1];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - (i === 0 ? 90 : SECTION_LEAD + 40);
    // 先告诉滚动显现这是一次跳章：沿途的块不逐个起动画，落地那一批短淡入（CaseReveal）
    window.dispatchEvent(new CustomEvent(CASE_JUMP_EVENT, { detail: { top } }));
    window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  };

  const enter = () => {
    clearTimeout(leaveTimer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <aside
      className="cs-index"
      data-open={open || undefined}
      aria-label={lang === 'zh' ? '目录' : 'Contents'}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
    >
      <div className="cs-index__hit" />
      <div className="cs-index__veil" aria-hidden />
      <div className="cs-index__list">
        {items.map((t, i) => {
          const on = i === act;
          return (
            <button
              key={i}
              type="button"
              className="cs-index__item"
              title={t}
              style={{ color: on ? INK : MUTE }}
              aria-current={on ? 'true' : undefined}
              onClick={() => go(i)}
            >
              <span className="cs-index__tick">
                <span style={{ width: on ? 22 : 10, opacity: on ? 1 : 0.55 }} />
              </span>
              <span className="cs-index__label" style={{ transitionDelay: `${i * 22}ms` }}>
                <span className="cs-index__n" style={{ color: on ? 'oklch(0.74 0.1 150)' : 'oklch(0.6 0.025 185)' }}>
                  {chapterNo(i)}
                </span>
                <span className="cs-index__t" style={{ fontWeight: on ? 600 : 400 }}>
                  {t}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <span className="cs-index__count">
        {chapterNo(act)} / {chapterNo(items.length - 1)}
      </span>
    </aside>
  );
}
