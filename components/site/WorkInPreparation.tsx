import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { WorkEntry } from '../../src/lib/site/content';
import { getLogEntries } from '../../src/lib/site/log';
import { projectOf } from '../../src/lib/site/log-facets';
import { BackTransition } from './BackTransition';
import { CaseLangRoot, CaseLangSwitch, Pick } from './CaseLang';
import { PageEnter } from './PageEnter';

/**
 * 「筹备中」详情页（用户拍板 2026-07-29：「主页进 1234 项目，2/3/4 也都进各自的详情页」）。
 *
 * 此前只有 01 是 published，主页另外三张卡片一律指 /archive——四个项目在 IA 上地位同等
 * （CLAUDE.md 定位与边界），导航上却三个没有自己的地址，点下去还全落到同一页。
 * 现在四个各有各的 /work/[slug]，未发稿的落到这里。
 *
 * 页面本身**不含任何项目正文**：正文是作者的活（SITE_SPEC「模型不代写」），这里只有
 * 站方的框架字——它是什么状态、发稿后会长成什么样、现在能去哪看到相关记录。
 * 版式全部复用 case 页的 .case-* 类，发稿时换的是内容不是模板。
 */

const RAIL_LABEL: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  marginBottom: 8,
};

const LINK: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  color: 'var(--accent)',
  borderBottom: '1px solid var(--g500)',
  paddingBottom: 2,
};

/** 中文侧的项目序号（英文侧直接用 frontmatter 的 title：Project II / III / IV）。 */
const ZH_ORDINAL = ['一', '二', '三', '四'];

/** 案例页正文里 log 的落点：项目组 key 与 work slug 同名的（现为 project-ii）才数得出来。 */
function logCountFor(slug: string): { count: number; since: string } | null {
  const mine = getLogEntries().filter((e) => projectOf(e) === slug);
  if (mine.length === 0) return null;
  // getLogEntries 按日期倒序，最后一条就是最早的
  return { count: mine.length, since: mine[mine.length - 1].date.slice(0, 7) };
}

export function WorkInPreparation({ entry }: { entry: WorkEntry }) {
  const order = entry.order ?? 1;
  const caseNo = String(order).padStart(2, '0');
  const zhTitle = entry.zh?.title ?? `项目${ZH_ORDINAL[order - 1] ?? order}`;
  const log = logCountFor(entry.slug);

  return (
    <>
      <div className="ground-plane" aria-hidden />
      <PageEnter />
      <BackTransition />
      <CaseLangRoot className="shell pg-dark" data-pt-content>
        <header className="case-head">
          <div className="case-head__top">
            <p className="case-kicker">
              <Pick en={`Case study ${caseNo} / 04`} zh={`案例 ${caseNo} / 04`} />
            </p>
            <CaseLangSwitch />
          </div>
          <h1 className="case-title">
            <Pick en={entry.title} zh={zhTitle} />
          </h1>
          {/* 与 case 页同一条双线尺；发稿后整页换模板，这行不用改 */}
          <svg className="case-rule" width="230" height="12" aria-hidden>
            <line
              data-dash
              x1="0"
              y1="4"
              x2="230"
              y2="4"
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeDasharray="8 6"
              style={{ animation: 'dashmove 2.6s linear infinite' }}
            />
            <line x1="0" y1="10" x2="150" y2="10" stroke="var(--accent-2)" strokeWidth="1.5" />
          </svg>
          <p className="case-lede">
            <Pick
              en="One of the four main projects. The case study has not been written yet — this page is its address, and the writing will land here."
              zh="四个主项目之一。案例正文尚未写就——这一页是它的固定地址，写好后就落在这里。"
            />
          </p>
        </header>

        <div className="case-layout">
          <aside className="case-rail">
            <div className="flex flex-col" style={{ gap: 24, fontSize: 14 }}>
              <div>
                <div style={RAIL_LABEL}>
                  <Pick en="Status" zh="状态" />
                </div>
                <span className="tag tag-outline">
                  <Pick en="In preparation" zh="筹备中" />
                </span>
              </div>
              {log && (
                <div>
                  <div style={RAIL_LABEL}>
                    <Pick en="Work log" zh="工作日志" />
                  </div>
                  <Pick
                    en={`${log.count} entries since ${log.since}`}
                    zh={`${log.since} 起共 ${log.count} 条`}
                  />
                </div>
              )}
            </div>
          </aside>

          <div className="case-content min-w-0 lg:pl-14">
            {/* 转场落点：主页卡片飞过来落在这一框上（无 data-pt-target 的路由会退回着陆平面路） */}
            <figure className="case-hero-fig">
              <div className="case-hero" data-pt-target>
                <div
                  className="om-dots"
                  style={{
                    opacity: 0.3,
                    WebkitMaskImage: 'linear-gradient(150deg,#000 0%,transparent 55%)',
                    maskImage: 'linear-gradient(150deg,#000 0%,transparent 55%)',
                  }}
                />
                <div className="om-grain" style={{ opacity: 0.13, mixBlendMode: 'overlay' }} />
                <span
                  style={{
                    position: 'relative',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'oklch(0.90 0.058 124)',
                    textAlign: 'center',
                    padding: '0 16px',
                  }}
                >
                  <Pick en="[in preparation] hero image · to shoot" zh="[筹备中] 主图 · 待拍摄" />
                </span>
              </div>
            </figure>

            <div className="case-body">
              <Pick
                en={
                  <>
                    <p>
                      When this case study is published it will follow the same structure as Case
                      01: research question, concepts, process, evidence, and where it stands —
                      written by the author, not generated here.
                    </p>
                    {log ? (
                      <p>
                        Until then, the build is documented as it happens: {log.count} work-log
                        entries from {log.since} onward, in English and Chinese.
                      </p>
                    ) : (
                      <p>
                        Until then there is nothing to read here. The work log carries whatever is
                        already public.
                      </p>
                    )}
                  </>
                }
                zh={
                  <>
                    <p>
                      正文发布后会与案例 01 同一套结构：研究问题、概念、过程、证据、进展——由作者本人撰写。
                    </p>
                    {log ? (
                      <p>
                        在此之前，进展记在工作日志里：{log.since} 起共 {log.count} 条，中英双语。
                      </p>
                    ) : (
                      <p>在此之前这一页没有可读的正文，已公开的部分都在工作日志里。</p>
                    )}
                  </>
                }
              />
              <div
                className="flex items-baseline"
                style={{ gap: 20, marginTop: 32, flexWrap: 'wrap' }}
              >
                {/* 不打 data-pt：那是主页引擎认的属性，案例页这边只有 BackTransition
                    接管「回主页」一类链接，其余链接原样走路由 */}
                <Link href="/archive" style={LINK}>
                  <Pick en="Work log →" zh="工作日志 →" />
                </Link>
                <Link href="/work/reincarnation-machine" style={LINK}>
                  <Pick en="Case 01 →" zh="案例 01 →" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </CaseLangRoot>
    </>
  );
}
