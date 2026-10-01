'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOptionalCaseLang } from './CaseLang';
import { LabHeader } from '../lab/LabShell';

/**
 * 共享导航（Home/Log/Case/About 复用）——Modernist 稿：brand + Work/Lab/Log/About。
 * 当前页 aria-current='page' → accent 高亮（.nav 规则处理配色）。
 * IA 映射见 MAPPING §3：Work=/#work · Lab=/#lab · Log=/archive · About=/about。
 */
export function SiteNav() {
  const pathname = usePathname() ?? '/';
  const zh = useOptionalCaseLang() === 'zh';
  const onHome = pathname === '/' || pathname.startsWith('/work');
  const onLog = pathname.startsWith('/archive');
  const onAbout = pathname.startsWith('/about');
  const current = (active: boolean) => (active ? { 'aria-current': 'page' as const } : {});
  // 深色内页（case / log）用深色 nav 变体（MAPPING §6.1：透明底 + 浅绿文字 + 发丝线）
  const dark =
    pathname.startsWith('/work') || pathname.startsWith('/archive') || pathname.startsWith('/lab');

  // /lab 用「09 Lab Page - Dark」稿自己的吸顶顶栏（含 EN / 中），其余页面不变
  if (pathname.startsWith('/lab')) return <LabHeader />;

  return (
    <nav className={dark ? 'nav nav-dark' : 'nav'}>
      <Link href="/" className="nav-brand">
        ZISHUO LI
      </Link>
      <Link href="/#work" {...current(onHome)}>
        {zh ? '作品' : 'Work'}
      </Link>
      <Link href="/lab" {...current(pathname.startsWith('/lab'))}>
        {zh ? '实验室' : 'Lab'}
      </Link>
      <Link href="/archive" {...current(onLog)}>
        {zh ? '日志' : 'Log'}
      </Link>
      <Link href="/about" {...current(onAbout)}>
        {zh ? '关于' : 'About'}
      </Link>
    </nav>
  );
}
