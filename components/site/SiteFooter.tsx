'use client';

import { usePathname } from 'next/navigation';

/**
 * 共享页脚（Modernist 稿）——左 email 占位、右链接卫生标语；文案照搬设计稿（不新写）。
 * 深色路由（case / log / lab）走稿里的 104° 渐变 + 点阵 + 颗粒版（.site-footer--deep）；
 * 浅色页（/about）仍是 G900 整版铺底（MAPPING §1）。判定与 SiteNav 同源。
 */
export function SiteFooter() {
  const pathname = usePathname() ?? '/';
  const deep =
    pathname.startsWith('/work') || pathname.startsWith('/archive') || pathname.startsWith('/lab');

  return (
    <footer className={deep ? 'site-footer site-footer--deep' : 'site-footer'}>
      <div className="shell flex items-baseline justify-between" style={{ paddingBlock: 40 }}>
        <span className="footer-email">[email placeholder]</span>
        <span className="footer-note">GitHub · no password · plain URLs</span>
      </div>
    </footer>
  );
}
