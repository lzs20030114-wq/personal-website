'use client';

import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCaseLangControl } from '../site/CaseLang';
import { LAB_BENCHES } from '../../src/lib/site/lab-index';
import { langAttr } from '../../src/lib/site/lang';

/**
 * Lab 页的吸顶顶栏与页脚（「09 Lab Page - Dark」稿，MAPPING §43）。
 * 单独成文件：SiteNav / SiteFooter 只在 /lab 渲染它们，且不依赖 Lab 的翻译表（体量大），
 * 这样其余页面的共享 bundle 不会被 Lab 文案拖重。
 */

export function LabHeader() {
  const { lang, setLang } = useCaseLangControl();
  const zh = lang === 'zh';
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className="ld-header" data-scrolled={scrolled || undefined}>
      <div className="ld-header__in">
        <Link href="/" className="ld-brand">Zishuo Li</Link>
        <div className="ld-header__right">
          <nav className="ld-nav" aria-label={zh ? '主导航' : 'Primary'}>
            <Link href="/#work">{zh ? '作品' : 'Work'}</Link>
            <Link href="/about">{zh ? '关于' : 'About'}</Link>
            <Link href="/lab" aria-current="page">{zh ? '实验室' : 'Lab'}</Link>
            <Link href="/archive">{zh ? '日志' : 'Log'}</Link>
          </nav>
          <div className="ld-lang" role="group" aria-label={zh ? '语言' : 'Language'}>
            {([['en', 'EN'], ['zh', '中']] as const).map(([code, label]) => (
              <button key={code} type="button" lang={langAttr(code)} aria-pressed={lang === code} onClick={() => setLang(code)}>{label}</button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
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

