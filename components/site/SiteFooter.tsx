'use client';

import { usePathname } from 'next/navigation';
import { useOptionalCaseLang } from './CaseLang';
import { LabFooter } from '../lab/LabShell';

/**
 * 共享页脚（Modernist 稿）——左侧联系邮箱、右侧链接说明。
 * 深色路由（case / log / lab）走稿里的 104° 渐变 + 点阵 + 颗粒版（.site-footer--deep）；
 * 浅色页（/about）仍是 G900 整版铺底（MAPPING §1）。判定与 SiteNav 同源。
 */
export function SiteFooter() {
  const pathname = usePathname() ?? '/';
  const zh = useOptionalCaseLang() === 'zh';
  const deep =
    pathname.startsWith('/work') || pathname.startsWith('/archive') || pathname.startsWith('/lab');

  if (pathname.startsWith('/lab')) return <LabFooter />;

  return (
    <footer className={deep ? 'site-footer site-footer--deep' : 'site-footer'}>
      <div className="shell flex flex-wrap items-baseline justify-between" style={{ paddingBlock: 40, gap: 24 }}>
        <a className="footer-email" href="mailto:lzs20030114@gmail.com" style={{ textTransform: 'none', overflowWrap: 'anywhere', fontSize: 'clamp(18px, 2.2vw, 28px)' }}>lzs20030114@gmail.com</a>
        <span className="footer-note">{zh ? 'GitHub · 无需密码 · 直接访问' : 'GitHub · no password · plain URLs'}</span>
      </div>
    </footer>
  );
}
