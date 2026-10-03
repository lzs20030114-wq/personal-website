'use client';

import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { CaseLangRoot, CaseLangSwitch, useOptionalCaseLang } from '../site/CaseLang';
import type { SiteLang } from '../../src/lib/site/lang';
import { labUiText } from '../../src/lib/site/lab-ui-copy';
import { LAB_BENCHES } from '../../src/lib/site/lab-index';
import { labPageText } from '../../src/lib/site/lab-page-copy';

/**
 * Share the existing site preference, including navigation and footer on /lab.
 * /work/* 同理（2026-10-01）：案例页的顶栏在布局层、语言钮在顶栏里，所以语言状态必须由
 * 布局层这一个 provider 持有——页面里不能再嵌第二个 CaseLangRoot，否则顶栏切的是外层、
 * 正文读的是内层。
 */
export function LabLanguageRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  if (pathname === '/lab') return <CaseLangRoot className="lab-language-root">{children}</CaseLangRoot>;
  if (pathname.startsWith('/work')) return <CaseLangRoot className="case-language-root">{children}</CaseLangRoot>;
  return <>{children}</>;
}

export function useBenchLang(explicit?: SiteLang): SiteLang {
  const inherited = useOptionalCaseLang();
  return explicit ?? inherited ?? 'zh';
}

export function useLabText(explicit?: SiteLang) {
  const lang = useBenchLang(explicit);
  return useCallback((text: string) => labUiText(lang, labPageText(lang, text)), [lang]);
}

export function LabPageText({ text }: { text: string }) {
  const translate = useLabText();
  return <>{translate(text)}</>;
}

export function LabLanguageSwitch() {
  return <div className="lab-language-switch"><CaseLangSwitch /></div>;
}

export function LabPageCount({ footer = false }: { footer?: boolean }) {
  const lang = useBenchLang();
  return <>{lang === 'zh' ? (footer ? `${LAB_BENCHES.length} 项实验 · 3 种内核 · 可交互` : `S2 · 实验室 · ${LAB_BENCHES.length} 项交互实验`) : (footer ? `${LAB_BENCHES.length} studies · 03 kernels · interactive` : `S2 · The lab · ${LAB_BENCHES.length} interactive studies`)}</>;
}
