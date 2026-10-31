'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOptionalCaseLang } from './CaseLang';
import { DarkHeader, LabHeader } from '../lab/LabShell';

/**
 * 共享导航。深色路由（/lab、/work/*、/archive、/about）用暗色外壳的吸顶顶栏（LabShell 的 DarkHeader）；
 * 剩下的浅色页（/privacy）仍是 Modernist 稿：brand + Work/Lab/Log/About，
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
  // /lab 用「09 Lab Page - Dark」稿自己的吸顶顶栏（含 EN / 中），其余页面不变
  if (pathname.startsWith('/lab')) return <LabHeader />;
  // /work/*（案例页与筹备页）用「10 Case 01」稿的同一套顶栏，另带阅读进度（MAPPING §45）
  if (pathname.startsWith('/work')) return <DarkHeader active="work" readbar />;
  // 日志页本来就是深色页，2026-10-25 起与 Lab / 案例页同一个顶栏（此前是旧 Modernist 导航的深色变体）
  if (pathname.startsWith('/archive')) return <DarkHeader active="log" />;
  // about 2026-10-31 按作者要求重做时换上同一套深色外壳（MAPPING §82）
  if (pathname.startsWith('/about')) return <DarkHeader active="about" />;

  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        ZISHUO LI
      </Link>
      <Link href="/#work" {...current(onHome)}>
        {zh ? '作品' : 'Work'}
      </Link>
      <Link href="/lab" prefetch={false} {...current(pathname.startsWith('/lab'))}>
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
