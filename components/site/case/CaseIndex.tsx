'use client';

import { useEffect, useRef, useState } from 'react';
import { useCaseLang } from '../CaseLang';
import { chapterNo } from '../../../src/lib/site/case-headings';

const INK = 'oklch(0.95 0.032 120)';
const MUTE = 'oklch(0.8 0.035 162)';

/**
 * 正文标题（h2）上方留的空：稿里每章是一个 `section`，padding-top 120 + flex gap——
 * 读位判定与滚动落点都是按「章的上沿」算的，而本站正文是一条平铺的 MDX 流，
 * 能量到的是 h2 自己，所以统一减掉这一截。
 */
const SECTION_LEAD = 120;

/**
 * 目录栏（稿 aside）：左侧吸顶，可收成 28px 的刻度竖条。
 * 读位：视口 40% 处以上最后一个章节标题就是当前章（稿 scrollTick），当前项出绿色竖标、标题右移 4px；
 * 点击 = 平滑滚到该章。
 *
 * 标题表是服务端从 MDX 抽好传下来的（SSR 首帧就有），而滚动 / 跳转用的 DOM 元素是挂载后按顺序量 `.cs-body h2`
 * ——两侧语言的 h2 数量由 content.test 保证一致，所以下标可以直接对上。第 0 项是开场（没有标题行），对应正文起点。
 */
export function CaseIndex({ en, zh }: { en: readonly string[]; zh: readonly string[] }) {
  const lang = useCaseLang();
  const items = lang === 'zh' ? zh : en;
  const [open, setOpen] = useState(true);
  const [act, setAct] = useState(0);
  const actRef = useRef(0);

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

  const go = (i: number) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = i === 0 ? document.querySelector<HTMLElement>('.cs-body') : document.querySelectorAll<HTMLElement>('.cs-body > h2')[i - 1];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - (i === 0 ? 90 : SECTION_LEAD + 40);
    window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  };

  const zhUi = lang === 'zh';
  const label = open ? (zhUi ? '收起目录' : 'Collapse contents') : zhUi ? '展开目录' : 'Expand contents';
  const fade = { opacity: open ? 1 : 0 };
  return (
    <aside className="cs-index" aria-label={zhUi ? '目录' : 'Contents'} style={{ width: open ? 212 : 28 }}>
      <div className="cs-index__head">
        <button type="button" className="cs-index__toggle" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen(!open)}>
          <b>{open ? '‹' : '›'}</b>
          <span className="cs-index__fade" style={fade}>
            {zhUi ? '目录 · 收起' : 'Contents · collapse'}
          </span>
        </button>
        <span className="cs-index__count cs-index__fade" style={fade}>
          {chapterNo(act)} / {chapterNo(items.length - 1)}
        </span>
      </div>
      <div className="cs-index__rail" style={{ display: open ? 'none' : 'flex' }}>
        {items.map((t, i) => (
          <button key={i} type="button" title={t} aria-label={t} onClick={() => go(i)}>
            <span style={{ width: i === act ? 22 : 10, background: i === act ? 'oklch(0.74 0.1 150)' : 'oklch(0.95 0.032 120 / .3)' }} />
          </button>
        ))}
      </div>
      <nav className="cs-index__list cs-index__fade" style={{ display: open ? 'flex' : 'none', opacity: open ? 1 : 0 }}>
        {items.map((t, i) => {
          const on = i === act;
          return (
            <button key={i} type="button" className="cs-index__item" style={{ color: on ? INK : MUTE }} aria-current={on ? 'true' : undefined} onClick={() => go(i)}>
              <span className="cs-index__bar" style={{ transform: `scaleY(${on ? 1 : 0})` }} />
              <span className="cs-index__n" style={{ color: on ? 'oklch(0.74 0.1 150)' : 'oklch(0.6 0.025 185)' }}>
                {chapterNo(i)}
              </span>
              <span className="cs-index__t" style={{ fontWeight: on ? 600 : 400, transform: `translateX(${on ? 4 : 0}px)` }}>
                {t}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
