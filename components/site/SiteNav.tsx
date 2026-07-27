'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 共享导航（Home/Log/Case/About 复用）——Modernist 稿：brand + Work/Lab/Log/About。
 * 当前页 aria-current='page' → accent 高亮（.nav 规则处理配色）。
 * IA 映射见 MAPPING §3：Work=/#work · Lab=/#lab · Log=/archive · About=/about。
 */
export function SiteNav() {
  const pathname = usePathname() ?? '/';
  const onHome = pathname === '/' || pathname.startsWith('/work');
  const onLog = pathname.startsWith('/archive');
  const onAbout = pathname.startsWith('/about');
  const current = (active: boolean) => (active ? { 'aria-current': 'page' as const } : {});
  // 深色内页（case / log）用深色 nav 变体（MAPPING §6.1：透明底 + 浅绿文字 + 发丝线）
  const dark = pathname.startsWith('/work') || pathname.startsWith('/archive');

  return (
    <nav className={dark ? 'nav nav-dark' : 'nav'}>
      {/* brand 文案维持占位（MAPPING §3：作者定名前 [NAME·占位]） */}
      <Link href="/" className="nav-brand">
        [NAME·占位]
      </Link>
      <Link href="/#work" {...current(onHome)}>
        Work
      </Link>
      <Link href="/#lab">Lab</Link>
      <Link href="/archive" {...current(onLog)}>
        Log
      </Link>
      <Link href="/about" {...current(onAbout)}>
        About
      </Link>
    </nav>
  );
}
