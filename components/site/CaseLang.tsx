'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { langAttr, readStoredLang, storeLang, type SiteLang } from '../../src/lib/site/lang';

/**
 * case study 页的中英切换（用户拍板 2026-07-28：「和 log 页面同样的中英文切换滑块，
 * 以后每个项目的详情页也都这样」）。
 *
 * 机制与 log 页同构、但换了个装法：log 页的双语数据是 JSON 字段，组件自己按 lang 取；
 * 案例页两侧是两棵**已经在服务端渲染好的树**（英文 index.mdx / 中文 index.zh.mdx），
 * 所以这里只做「选哪一棵」——两棵都随 RSC 载荷发下来，切换不重取、不跳路由。
 *
 * 为什么不是「整页渲两遍、用 CSS 藏一半」：主图那台五环活件在页面上只能有一份，
 * 渲两遍等于挂两个 WebGL 上下文。故切换点打散成若干个 `<Pick>`，主图留在 Pick 之外。
 *
 * SSR 首帧恒 EN（静态预渲染读不到偏好），挂载后按 localStorage 切——与 log 页共用一个键。
 */

type Ctx = { lang: SiteLang; setLang: (l: SiteLang) => void };
const LangCtx = createContext<Ctx>({ lang: 'en', setLang: () => {} });

export function useCaseLang(): SiteLang {
  return useContext(LangCtx).lang;
}

/** 包住整页：提供语言状态 + 把 lang 属性挂到内容根上（CJK 字体回退与断行看它）。 */
export function CaseLangRoot({
  children,
  ...rest
}: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  const [lang, setLangState] = useState<SiteLang>('en');

  useEffect(() => {
    const stored = readStoredLang();
    if (stored) setLangState(stored);
  }, []);

  function setLang(next: SiteLang) {
    setLangState(next);
    storeLang(next);
  }

  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <div {...rest} lang={langAttr(lang)} data-lang={lang}>
        {children}
      </div>
    </LangCtx.Provider>
  );
}

/** 滑块本体——与 log 页同一套 .lang-switch 皮肤（globals.css，样式零改）。 */
export function CaseLangSwitch() {
  const { lang, setLang } = useContext(LangCtx);
  return (
    <div className="lang-switch" role="group" aria-label={lang === 'zh' ? '语言' : 'Language'}>
      <span className="lang-switch__thumb" data-at={lang} aria-hidden />
      <button
        type="button"
        className="lang-switch__opt"
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
      >
        EN
      </button>
      <button
        type="button"
        className="lang-switch__opt"
        aria-pressed={lang === 'zh'}
        onClick={() => setLang('zh')}
      >
        中文
      </button>
    </div>
  );
}

/**
 * 二选一：两侧都可以是服务端渲染好的节点（RSC children-as-props），
 * 只有选中的那棵会挂载——所以中文侧的 `<LinkageFigure/>` 在看英文时不会跑。
 */
export function Pick({ en, zh }: { en: ReactNode; zh: ReactNode }) {
  return <>{useCaseLang() === 'zh' ? zh : en}</>;
}
