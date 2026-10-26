'use client';

import { usePathname } from 'next/navigation';
import { useOptionalCaseLang } from './CaseLang';
import { CaseFooter, LabFooter } from '../lab/LabShell';

/**
 * 共享页脚。深色路由（/lab、/work/*、/archive）用暗色外壳的主青色面页脚（LabShell）；
 * 剩下的浅色页（/about、/privacy）仍是 Modernist 稿的 G900 整版铺底 + 联系邮箱（MAPPING §1）。
 * 判定与 SiteNav 同源。
 */
export function SiteFooter() {
  const pathname = usePathname() ?? '/';
  const zh = useOptionalCaseLang() === 'zh';
  if (pathname.startsWith('/lab')) return <LabFooter />;
  // /work/* 的页脚由页面自己渲染（要带案例序号与标题，布局层拿不到）
  if (pathname.startsWith('/work')) return null;
  // 日志页与 Lab / 案例页同一个主青色面页脚（2026-10-25）
  if (pathname.startsWith('/archive')) return <CaseFooter labelEn="Work log · all projects" labelZh="工作日志 · 全部项目" />;

  return (
    <footer className="site-footer">
      <div className="shell flex flex-wrap items-baseline justify-between" style={{ paddingBlock: 40, gap: 24 }}>
        <a className="footer-email" href="mailto:lzs20030114@gmail.com" style={{ textTransform: 'none', overflowWrap: 'anywhere', fontSize: 'clamp(18px, 2.2vw, 28px)' }}>lzs20030114@gmail.com</a>
        <span className="footer-note">{zh ? 'GitHub · 无需密码 · 直接访问' : 'GitHub · no password · plain URLs'}</span>
        <a className="footer-note" href="/privacy">{zh ? '访客隐私' : 'Visitor privacy'}</a>
      </div>
    </footer>
  );
}
