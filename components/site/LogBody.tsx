import { cellText, type LogBlock, type LogLang } from '../../src/lib/site/log-schema';
import { parseMarkdown, type Inline } from '../../src/lib/site/md';

/**
 * 一条 log 的正文渲染：受限 Markdown 正文 + 之后按序排的图 / 表块。
 *
 * 站上（components/site/LogList）与 Studio 预览（components/studio/StudioEditor）**共用这一个**
 * 组件——预览与线上必须是同一段代码画出来的，否则预览就只是「看起来差不多」。
 * 全程用 React 元素拼，不碰 dangerouslySetInnerHTML：作者写进正文的东西没有变成脚本的路径。
 */

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

function Blocks({
  blocks,
  lang,
  resolve,
}: {
  blocks: LogBlock[];
  lang: LogLang;
  resolve: (src: string) => string;
}) {
  return (
    <>
      {blocks.map((b, i) =>
        b.kind === 'image' ? (
          <figure className="log-fig" key={i}>
            {/* 原生 img：图都在 public/log/ 下、尺寸随条目存好（写进属性防展开时把正文顶下去）。
                不走 next/image——静态导出的日志图不需要按尺寸重采样服务。 */}
            <img
              src={resolve(b.src)}
              alt={b.alt[lang]}
              width={b.width}
              height={b.height}
              loading="lazy"
              decoding="async"
            />
            {b.caption && <figcaption>{b.caption[lang]}</figcaption>}
          </figure>
        ) : (
          <figure className="log-table" key={i}>
            <div className="log-table__scroll">
              <table>
                <thead>
                  <tr>
                    {b.head.map((c, ci) => (
                      <th key={ci} scope="col">
                        {cellText(c, lang)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((c, ci) => (
                        <td key={ci}>{cellText(c, lang)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {b.caption && <figcaption>{b.caption[lang]}</figcaption>}
          </figure>
        ),
      )}
    </>
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
  return (
    <div className="log-entry__body" data-lang={lang}>
      {parsed.map((b, i) => {
        if (b.t === 'h' && b.level === 3) return <h3 key={i}><Spans spans={b.spans} /></h3>;
        if (b.t === 'h') return <h4 key={i}><Spans spans={b.spans} /></h4>;
        if (b.t === 'pre') return <pre key={i}><code>{b.code}</code></pre>;
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
      {blocks && blocks.length > 0 && <Blocks blocks={blocks} lang={lang} resolve={resolve} />}
    </div>
  );
}
