import Link from 'next/link';
import './(site)/dark-chrome.css';
import './not-found.css';
import { CaseLangRoot, Pick } from '../components/site/CaseLang';
import { CaseFooter, DarkHeader } from '../components/lab/LabShell';
import { NotFoundPath } from '../components/site/NotFoundPath';
import { LAB_BENCHES } from '../src/lib/site/lab-index';

export const metadata = { title: 'Not found' };

/**
 * 404（2026-11-08，MAPPING §88）。原先是根布局下一行「404 — back to work」，套的是 /privacy 那套浅色旧导航，
 * 而载入页按路径给的是夜色——一进来先黑后白闪一下。改成与 /about、/archive 同一套深色外壳：
 * 顶栏（不高亮任何一项）+ 夜色底 + 主青色面页脚；页头复用 .ld-meta / .ld-lede，大字用首页大标题那种细窄字。
 *
 * 404 渲染在根布局下、不进 (site) 组，所以语言上下文、顶栏、页脚、dark-chrome.css 都要自己带。
 * 三个去处（作品 / 实验室 / 日志）就是顶栏导航里的三项，说明文字与首页、/lab 页脚的说法一致。
 */
export default function NotFound() {
  const n = LAB_BENCHES.length;
  const go = [
    { href: '/#work', en: 'Work', zh: '作品', noteEn: 'Three main projects and other work', noteZh: '三个主项目与其他作品' },
    { href: '/lab', en: 'Lab', zh: '实验室', noteEn: `${n} studies running live in the browser`, noteZh: `${n} 项实验，在浏览器里实时运行`, lazy: true },
    { href: '/archive', en: 'Log', zh: '日志', noteEn: 'Dated work log across all projects', noteZh: '按日期记下的工作日志，全部项目' },
  ];
  return (
    <CaseLangRoot className="nf-language-root">
      <DarkHeader />
      <main>
        <div className="ground-plane" aria-hidden />
        <div className="shell pg-dark nf">
          <header className="nf-head">
            <p className="ld-meta">
              <Pick en="Error 404 · page not found" zh="错误 404 · 页面不存在" />
              <NotFoundPath />
            </p>
            <h1 className="nf-code">
              <span aria-hidden>404</span>
              <span className="nf-sr">
                <Pick en="Page not found" zh="页面不存在" />
              </span>
            </h1>
            <p className="ld-lede">
              <Pick
                en="There is no page at this address. It may have moved, or the link may have a typo."
                zh="这个地址上没有页面。可能是换了地址，也可能是链接打错了。"
              />
            </p>
          </header>
          <ul className="nf-go">
            {go.map((g, i) => (
              <li key={g.href}>
                <Link href={g.href} prefetch={g.lazy ? false : undefined}>
                  <span className="nf-go__i">0{i + 1}</span>
                  <span className="nf-go__t">
                    <Pick en={g.en} zh={g.zh} />
                    <span className="nf-go__arrow" aria-hidden>→</span>
                  </span>
                  <span className="nf-go__n">
                    <Pick en={g.noteEn} zh={g.noteZh} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <CaseFooter labelEn="Page not found" labelZh="页面不存在" />
    </CaseLangRoot>
  );
}
