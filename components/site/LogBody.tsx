'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cellText, type LogBlock, type LogLang } from '../../src/lib/site/log-schema';
import { blockRefs, type BlockRef } from '../../src/lib/site/log-blocks';
import { parseMarkdown, type Inline } from '../../src/lib/site/md';

/**
 * 一条 log 的正文渲染：正文（受限 Markdown）在左，图 / 表退到右栏（2026-07-29 用户要求）。
 *
 * 为什么图表不再顺着正文往下铺：一条日志挂十张表时，正文被整段整段的表格切断，
 * 读者既读不完文字也看不清表。改成 **右栏索引 + 点开看大图**——
 * 右栏列出这条有哪些图表（编号 + 说明 + 规格），点一张才展开；展开的那张占满整幅宽度
 * （表要宽度才读得动，硬塞进 300px 的右栏等于没给），一次看一张。
 * 收起态条目行右端的角标（components/site/LogList）用的是同一份 blockRefs 计数。
 *
 * 站上（components/site/LogList）与 Studio 预览（components/studio/EntryForm）**共用这一个**
 * 组件——预览与线上必须是同一段代码画出来的，否则预览就只是「看起来差不多」。
 * 左右分栏用 container query 而不是视口宽度：Studio 的预览面板窄，同一段代码在那里
 * 自己塌成单栏，不用给预览开分支。
 * 全程用 React 元素拼，不碰 dangerouslySetInnerHTML：作者写进正文的东西没有变成脚本的路径。
 */

const COPY: Record<LogLang, { rail: string; close: string; open: string }> = {
  en: { rail: 'Figures & tables', close: 'Close', open: 'Open' },
  zh: { rail: '图与表', close: '收起', open: '展开' },
};

function Spans({ spans }: { spans: Inline[] }) {
  return (
    <>
      {spans.map((s, i) => {
        if (s.t === 'strong') return <strong key={i}>{s.v}</strong>;
        if (s.t === 'code') return <code key={i}>{s.v}</code>;
        if (s.t === 'link')
          return (
            <a key={i} href={s.href} rel="noreferrer">
              {s.v}
            </a>
          );
        return <span key={i}>{s.v}</span>;
      })}
    </>
  );
}

/** 表格图标：右栏卡片上「这是一张表」的标志（图片卡用缩略图本身当标志）。 */
function TableGlyph() {
  return (
    <svg viewBox="0 0 24 18" width="30" height="22" aria-hidden focusable="false">
      <rect x="0.5" y="0.5" width="23" height="17" fill="none" stroke="currentColor" />
      <path
        d="M0.5 5.5h23M0.5 11.5h23M8.5 0.5v17M16.5 0.5v17"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.55"
      />
      <rect x="0.5" y="0.5" width="23" height="5" fill="currentColor" fillOpacity="0.18" />
    </svg>
  );
}

/** 展开后的那一张：沿用既有的 .log-fig / .log-table 版式（表窄屏自己横滚）。 */
function Figure({
  block,
  lang,
  resolve,
}: {
  block: LogBlock;
  lang: LogLang;
  resolve: (src: string) => string;
}) {
  if (block.kind === 'image') {
    return (
      <figure className="log-fig">
        {/* 原生 img：图都在 public/log/ 下、尺寸随条目存好（写进属性防展开时把正文顶下去）。
            不走 next/image——静态导出的日志图不需要按尺寸重采样服务。 */}
        <img
          src={resolve(block.src)}
          alt={block.alt[lang]}
          width={block.width}
          height={block.height}
          loading="lazy"
          decoding="async"
        />
        {block.caption && <figcaption>{block.caption[lang]}</figcaption>}
      </figure>
    );
  }
  return (
    <figure className="log-table">
      <div className="log-table__scroll">
        <table>
          <thead>
            <tr>
              {block.head.map((c, ci) => (
                <th key={ci} scope="col">
                  {cellText(c, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) => (
                  <td key={ci}>{cellText(c, lang)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.caption && <figcaption>{block.caption[lang]}</figcaption>}
    </figure>
  );
}

/** 右栏一张卡：编号 + 说明 + 规格；选中的那张标出来（= 下方正在展开的那张）。 */
function RailCard({
  block,
  ref_,
  lang,
  open,
  viewId,
  onToggle,
  resolve,
}: {
  block: LogBlock;
  ref_: BlockRef;
  lang: LogLang;
  open: boolean;
  viewId: string;
  onToggle: () => void;
  resolve: (src: string) => string;
}) {
  return (
    <li>
      <button
        type="button"
        className="log-card"
        aria-expanded={open}
        aria-controls={viewId}
        onClick={onToggle}
      >
        <span className="log-card__mark" aria-hidden>
          {block.kind === 'image' ? (
            <img src={resolve(block.src)} alt="" loading="lazy" decoding="async" />
          ) : (
            <TableGlyph />
          )}
        </span>
        <span className="log-card__label">
          {ref_.label[lang]}
          <span className="log-card__meta">{ref_.meta}</span>
        </span>
        {ref_.caption && <span className="log-card__cap">{ref_.caption[lang]}</span>}
      </button>
    </li>
  );
}

export function LogBody({
  body,
  blocks,
  lang,
  resolve = (src) => src,
}: {
  /** 已选好语言的正文原文（受限 Markdown） */
  body: string;
  blocks?: LogBlock[];
  lang: LogLang;
  /**
   * 图片 src 的改写钩子——只有 /studio 预览用得上：尚未提交的图在 `/log/...` 下还取不到，
   * 编辑器把它换成本地 data URL。站上不传这个参数，src 原样使用。
   */
  resolve?: (src: string) => string;
}) {
  const parsed = parseMarkdown(body);
  const refs = blockRefs(blocks);
  const copy = COPY[lang];
  // 展开哪一张（下标取自 blocks 数组）；null = 都收着。一次只开一张：
  // 右栏卡片就是这张视图的标题栏，同时开好几张就分不出「现在看的是哪一张」。
  const [openAt, setOpenAt] = useState<number | null>(null);
  const viewId = `${useId()}-view`;
  const open = openAt !== null && blocks ? (blocks[openAt] ?? null) : null;
  const openRef = openAt !== null ? refs.find((r) => r.index === openAt) : undefined;

  // 正文长的条目里，右栏卡片在顶上、展开的表在正文下面——不带一下的话点了像没反应。
  // block:'nearest'：已经看得见就不动，别把页面无谓地拽一下。
  const viewEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openAt === null || !viewEl.current) return;
    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    viewEl.current.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [openAt]);

  return (
    <div className="log-doc">
      <div className="log-doc__split">
        <div className="log-entry__body" data-lang={lang}>
          {parsed.map((b, i) => {
            if (b.t === 'h' && b.level === 3)
              return (
                <h3 key={i}>
                  <Spans spans={b.spans} />
                </h3>
              );
            if (b.t === 'h')
              return (
                <h4 key={i}>
                  <Spans spans={b.spans} />
                </h4>
              );
            if (b.t === 'pre')
              return (
                <pre key={i}>
                  <code>{b.code}</code>
                </pre>
              );
            if (b.t === 'list') {
              const items = b.items.map((spans, ii) => (
                <li key={ii}>
                  <Spans spans={spans} />
                </li>
              ));
              return b.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
            }
            return (
              <p key={i}>
                <Spans spans={b.spans} />
              </p>
            );
          })}
        </div>

        {blocks && refs.length > 0 && (
          <aside className="log-rail" aria-label={copy.rail}>
            <h4 className="log-rail__title">
              {copy.rail}
              <span className="log-rail__n">{refs.length}</span>
            </h4>
            <ul className="log-rail__list">
              {refs.map((r) => (
                <RailCard
                  key={r.index}
                  block={blocks[r.index]}
                  ref_={r}
                  lang={lang}
                  open={openAt === r.index}
                  viewId={viewId}
                  onToggle={() => setOpenAt(openAt === r.index ? null : r.index)}
                  resolve={resolve}
                />
              ))}
            </ul>
          </aside>
        )}
      </div>

      {/* 展开的那一张占满整幅宽度——表格塞进右栏读不动，图也看不清细节。
          容器恒在（aria-controls 指着它），空的时候不占高度。 */}
      {refs.length > 0 && (
        <div id={viewId} ref={viewEl} className="log-view" data-open={open !== null} role="region">
          {open && openRef && (
            <>
              <div className="log-view__bar">
                <span className="log-view__label">{openRef.label[lang]}</span>
                <span className="log-view__meta">{openRef.meta}</span>
                <button type="button" className="log-view__close" onClick={() => setOpenAt(null)}>
                  {copy.close}
                </button>
              </div>
              <Figure block={open} lang={lang} resolve={resolve} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
