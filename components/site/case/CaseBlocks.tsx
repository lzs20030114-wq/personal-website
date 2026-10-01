import type { ReactNode } from 'react';
import {
  CLOSURE,
  INTERFERENCE,
  PARTS,
  STATUS_ROWS,
  SYS_COLS,
  SYS_OUT,
  TONE_COLOR,
  BLOCK_UI,
  tx,
  type Lang,
} from '../../../src/lib/site/case-reincarnation';

/**
 * 案例页里不带交互的构件（服务端组件）：开场 lead / accent、研究问题、组成、闭合规则、
 * 系统逻辑、自干扰、现状。数据在 src/lib/site/case-reincarnation.ts，样式在 case-dark.css。
 * `id` 只是给 content.test 的「中英两侧插槽编号一致」守门用的，视觉上用的是各块自己的编号。
 */

export function Lead({ children }: { children: ReactNode }) {
  return <div className="cs-lead">{children}</div>;
}

export function Accent({ children }: { children: ReactNode }) {
  return <div className="cs-accent">{children}</div>;
}

/** 研究问题（稿 q）：紫色小签 + 大字问句；日志引用写在问句末尾的 markdown 链接里。 */
export function ResearchQuestion({ children, lang = 'en' }: { children: ReactNode; lang?: Lang }) {
  return (
    <div className="cs-rq">
      <span className="cs-rq__k">{lang === 'zh' ? '研究问题' : 'Research question'}</span>
      {children}
    </div>
  );
}

/** 它由什么组成（稿 parts）：大数字 + 名 + 一句话。 */
export function PartGrid({ lang = 'en' }: { lang?: Lang }) {
  return (
    <div className="cs-parts">
      {PARTS.map((p, i) => (
        <div className="cs-part" key={i}>
          <span className="cs-part__h">
            <span className="cs-part__n">{p.n}</span>
            <span className="cs-part__name">{tx(p.name, lang)}</span>
          </span>
          <p>{tx(p.x, lang)}</p>
        </div>
      ))}
    </div>
  );
}

/** 闭合规则 + 自由度（稿 closure，即 N08 / N09）：公式当主角。 */
export function ClosureCards({ lang = 'en' }: { id?: string; lang?: Lang }) {
  return (
    <div className="cs-cells cs-cells--closure">
      {CLOSURE.map((c) => (
        <div className="cs-cell cs-cell--closure" key={c.id}>
          <span className="cs-cell__row">
            <span>{c.id}</span>
            <span>{tx(c.k, lang)}</span>
          </span>
          <span className="cs-formula">{c.f}</span>
          <span className="cs-cell__x">{tx(c.x, lang)}</span>
        </div>
      ))}
    </div>
  );
}

/** 系统逻辑（稿 system，N18）：四列清单 + 一粒从左流到右的光点 + 两条去向。 */
export function SystemLogic({ id = 'N18', lang = 'en' }: { id?: string; lang?: Lang }) {
  const ui = BLOCK_UI[lang];
  return (
    <figure className="cs-sys">
      <span className="cs-panel__row">
        <span className="cs-id">
          {id} · {ui.sysTitle}
        </span>
        <span className="cs-dim">{ui.sysSub}</span>
      </span>
      <div className="cs-sys__flow" aria-hidden>
        <i />
      </div>
      <div className="cs-sys__cols">
        {SYS_COLS.map((c, i) => (
          <div className="cs-sys__col" key={i}>
            <span>
              <b>{tx(c.h, lang)}</b>
              <i>{c.n}</i>
            </span>
            <span className="cs-sys__items">
              {c.items.map((it, j) => (
                <span key={j} data-pend={it.pend ? '' : undefined}>
                  {tx(it.x, lang)}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="cs-sys__out">
        <span>
          <i>→</i>
          {tx(SYS_OUT.a, lang)}
        </span>
        <span>
          <i>→</i>
          {tx(SYS_OUT.b, lang)}
        </span>
      </div>
    </figure>
  );
}

/** 四组自干扰（稿 interf）：甲 → 乙。 */
export function Interference({ lang = 'en' }: { lang?: Lang }) {
  return (
    <div className="cs-interf">
      {INTERFERENCE.map((x, i) => (
        <div key={i}>
          <span className="cs-interf__n">{String(i + 1).padStart(2, '0')}</span>
          <span className="cs-interf__ab">
            <span>{tx(x.a, lang)}</span>
            <i>→</i>
            <span>{tx(x.b, lang)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** 现状四行（稿 status）：圆点 + 项 | 状态签 + 说明。 */
export function StatusList({ lang = 'en' }: { lang?: Lang }) {
  return (
    <dl className="cs-status">
      {STATUS_ROWS.map((s, i) => {
        const c = TONE_COLOR[s.tone];
        return (
          <div key={i}>
            <dt>
              <i style={{ background: c }} />
              {tx(s.k, lang)}
            </dt>
            <dd>
              <span style={{ color: c }}>{tx(s.tag, lang)}</span>
              <span>
                {tx(s.x, lang)}
                {s.cite ? (
                  <a className="cs-cite" href={`/archive#${s.cite.anchor}`}>
                    {lang === 'zh' ? '→ 日志 ' : '→ log '}
                    {s.cite.date}
                  </a>
                ) : null}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
