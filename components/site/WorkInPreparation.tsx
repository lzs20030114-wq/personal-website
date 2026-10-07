import '../../app/(site)/work/[slug]/case-dark.css';
import Link from 'next/link';
import { MAIN_PROJECTS, type WorkEntry } from '../../src/lib/site/content';
import { getLogEntries } from '../../src/lib/site/log';
import { projectOf } from '../../src/lib/site/log-facets';
import { CaseFooter } from '../lab/LabShell';
import { Pick } from './CaseLang';
import { CaseReveal } from './case/CaseReveal';

/**
 * 「筹备中」详情页（用户拍板 2026-07-29：「主页进 1234 项目，2/3/4 也都进各自的详情页」）。
 *
 * 此前只有 01 是 published，主页另外几张卡片一律指 /archive——主项目在 IA 上地位同等
 * （CLAUDE.md 定位与边界），导航上却没有自己的地址，点下去还全落到同一页。
 * 现在每个主项目各有各的 /work/[slug]（2026-10-04 起主项目为三个），未发稿的落到这里。
 *
 * 页面本身**不含任何项目正文**：正文是作者的活（SITE_SPEC「模型不代写」），这里只有
 * 站方的框架字——它是什么状态、发稿后会长成什么样、现在能去哪看到相关记录。
 * 版式全部复用 case 页的 .cs-* 类（「10 Case 01」稿的壳：整屏首屏 + 元数据条 + 正文列），发稿时换的是内容不是模板。
 */

/** 中文侧的项目序号（英文侧直接用 frontmatter 的 title：Project II / III / IV）。 */
const ZH_ORDINAL = ['一', '二', '三', '四'];
/** 「案例 03 / 03」里的分母 = 主项目数（2026-10-04 起为 3）。 */
const TOTAL = String(MAIN_PROJECTS).padStart(2, '0');

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
  const year = entry.date.slice(0, 4);

  return (
    <>
      <div className="ground-plane ld-ground" aria-hidden />
      <CaseReveal />
      <div className="cs pg-dark" data-case-order={order}>
        <div className="cs-dots" aria-hidden style={{ top: -64 }} />
        <section className="cs-hero">
          <div className="cs-hero__screen">
            <div className="cs-hero__row1" data-rv>
              <Link href="/#work" className="cs-back">
                <Pick en="← All work" zh="← 全部作品" />
              </Link>
              <span className="cs-hero__meta">
                <span>
                  <Pick en={`Case study ${caseNo} / ${TOTAL}`} zh={`案例 ${caseNo} / ${TOTAL}`} />
                </span>
                <span className="cs-state">
                  <i />
                  <Pick en="In preparation" zh="筹备中" />
                </span>
              </span>
            </div>
            <div className="cs-hero__row2">
              <div className="cs-hero__lead">
                <h1 className="cs-title" data-rv>
                  <Pick en={entry.title} zh={zhTitle} />
                </h1>
                {/* 与 case 页同一条双线尺；发稿后整页换模板，这行不用改 */}
                <svg className="cs-rule" width="230" height="12" aria-hidden data-rv>
                  <line
                    data-dash
                    x1="0"
                    y1="4"
                    x2="230"
                    y2="4"
                    stroke="oklch(0.74 0.1 150)"
                    strokeWidth="1.5"
                    strokeDasharray="8 6"
                    style={{ animation: 'dashmove 2.6s linear infinite' }}
                  />
                  <line x1="0" y1="10" x2="150" y2="10" stroke="oklch(0.72 0.095 291)" strokeWidth="1.5" />
                </svg>
              </div>
              <p className="cs-lede" data-rv>
                <Pick
                  en="One of the three main projects. The case study has not been written yet — this page is its address, and the writing will land here."
                  zh="三个主项目之一。案例正文尚未写就——这一页是它的固定地址，写好后就落在这里。"
                />
              </p>
            </div>
            <figure className="cs-fig" data-rv>
              <div className="cs-stage">
                <div className="cs-stage__ph">
                  <Pick en="[in preparation] hero image · to shoot" zh="[筹备中] 主图 · 待拍摄" />
                </div>
                <div className="cs-stage__vignette" />
                <span className="cs-corner cs-corner--tl" />
                <span className="cs-corner cs-corner--tr" />
                <span className="cs-corner cs-corner--bl" />
                <span className="cs-corner cs-corner--br" />
              </div>
            </figure>
          </div>

          <dl className="cs-meta" data-rv>
            <div>
              <dt>
                <Pick en="Status" zh="状态" />
              </dt>
              <dd>
                <span className="cs-chip">
                  <i style={{ background: 'var(--cs-am)' }} />
                  <Pick en="In preparation" zh="筹备中" />
                </span>
              </dd>
            </div>
            {log && (
              <div>
                <dt>
                  <Pick en="Work log" zh="工作日志" />
                </dt>
                <dd>
                  <Pick
                    en={`${log.count} entries since ${log.since}`}
                    zh={`${log.since} 起共 ${log.count} 条`}
                  />
                </dd>
              </div>
            )}
          </dl>
        </section>

        <div className="cs-layout">
          <div className="cs-main">
            <div className="cs-body" style={{ paddingTop: 40 }}>
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
              <p style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <Link href="/archive" className="cs-cite" style={{ marginLeft: 0 }}>
                  <Pick en="Work log →" zh="工作日志 →" />
                </Link>
                <Link href="/work/reincarnation-machine" className="cs-cite" style={{ marginLeft: 0 }}>
                  <Pick en="Case 01 →" zh="案例 01 →" />
                </Link>
              </p>
            </div>
          </div>
        </div>

        <CaseFooter
          labelEn={`Case study ${caseNo} · ${entry.title} · ${year}`}
          labelZh={`案例 ${caseNo} · ${zhTitle} · ${year}`}
        />
      </div>
    </>
  );
}
