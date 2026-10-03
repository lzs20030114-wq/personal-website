'use client';

import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useCaseLangControl } from '../site/CaseLang';
import { LAB_BENCHES } from '../../src/lib/site/lab-index';
import { langAttr } from '../../src/lib/site/lang';

/**
 * Lab 页的吸顶顶栏与页脚（「09 Lab Page - Dark」稿，MAPPING §43）。
 * 单独成文件：SiteNav / SiteFooter 只在 /lab 渲染它们，且不依赖 Lab 的翻译表（体量大），
 * 这样其余页面的共享 bundle 不会被 Lab 文案拖重。
 */

/**
 * 吸顶顶栏。「09 Lab Page - Dark」与「10 Case 01」两张稿的顶栏是同一套（品牌 + 四项导航 + EN / 中），
 * 差别只有当前页高亮哪一项、案例页多一条阅读进度——所以抽成一个，/lab 与 /work/* 共用。
 * 阅读进度（稿 `data-readbar`）：顶栏下缘 1.5px 绿线，宽度 = 页面滚动进度；直接写 style，
 * 不进 React 状态（滚动期间每帧一次，走 state 会整栏重渲）。
 */
export function DarkHeader({ active, readbar = false }: { active: 'work' | 'lab'; readbar?: boolean }) {
  const { lang, setLang } = useCaseLangControl();
  const zh = lang === 'zh';
  const [scrolled, setScrolled] = useState(false);
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = 0;
      setScrolled(window.scrollY > 8);
      const el = bar.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.style.width = `${(max > 0 ? Math.min(1, window.scrollY / max) * 100 : 0).toFixed(2)}%`;
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
  }, []);
  const cur = (k: 'work' | 'lab') => (active === k ? { 'aria-current': 'page' as const } : {});
  return (
    <header className="ld-header" data-scrolled={scrolled || undefined}>
      <div className="ld-header__in">
        <Link href="/" className="ld-brand">Zishuo Li</Link>
        <div className="ld-header__right">
          <nav className="ld-nav" aria-label={zh ? '主导航' : 'Primary'}>
            <Link href="/#work" {...cur('work')}>{zh ? '作品' : 'Work'}</Link>
            <Link href="/about">{zh ? '关于' : 'About'}</Link>
            <Link href="/lab" {...cur('lab')}>{zh ? '实验室' : 'Lab'}</Link>
            <Link href="/archive">{zh ? '日志' : 'Log'}</Link>
          </nav>
          <div className="ld-lang" role="group" aria-label={zh ? '语言' : 'Language'}>
            {([['en', 'EN'], ['zh', '中']] as const).map(([code, label]) => (
              <button key={code} type="button" lang={langAttr(code)} aria-pressed={lang === code} onClick={() => setLang(code)}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      {readbar ? <span ref={bar} className="ld-readbar" aria-hidden /> : null}
    </header>
  );
}

export function LabHeader() {
  return <DarkHeader active="lab" />;
}

export function LabFooter() {
  const { lang } = useCaseLangControl();
  const zh = lang === 'zh';
  return (
    <footer className="ld-footer">
      <div className="ld-footer__in">
        <span>{zh ? `${LAB_BENCHES.length} 项实验 · 两个项目 · 均在浏览器中实时运行` : `${LAB_BENCHES.length} benches · two projects · all running live in the browser`}</span>
        <span className="ld-footer__links">
          <Link href="/#work">{zh ? '作品 ↗' : 'Work ↗'}</Link>
          <Link href="/archive">{zh ? '日志 ↗' : 'Log ↗'}</Link>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>{zh ? '顶部 ↑' : 'Top ↑'}</button>
        </span>
      </div>
    </footer>
  );
}


/** 案例页页脚（稿 footer：「案例 01 · 轮回机器 · 2026」+ 作品 / 实验室 / 回到顶部）。 */
export function CaseFooter({ labelEn, labelZh }: { labelEn: string; labelZh: string }) {
  const { lang } = useCaseLangControl();
  const zh = lang === 'zh';
  return (
    <footer className="ld-footer">
      <div className="ld-footer__in">
        <span>{zh ? labelZh : labelEn}</span>
        <span className="ld-footer__links">
          <Link href="/#work">{zh ? '作品 ↗' : 'Work ↗'}</Link>
          <Link href="/lab">{zh ? '实验室 ↗' : 'Lab ↗'}</Link>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>{zh ? '回到顶部 ↑' : 'Top ↑'}</button>
        </span>
      </div>
    </footer>
  );
}
