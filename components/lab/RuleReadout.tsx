'use client';

import type { RuleRow } from '../../src/lib/space/cohabit-reasons';
import {
  READOUT_FLOW,
  READOUT_HIST,
  READOUT_PARTS,
  unitState,
  type ReadoutLang,
  type ReadoutPart,
  type ReadoutRowSnap,
  type ReadoutSnap,
  type UnitCard,
} from '../../src/lib/space/cohabit-readout';

/**
 * Lab 2-14 说明栏里的规则读数（2026-11-19，项目二_规则可视化方案.md §10）。数据全在 src/lib/space/cohabit-readout.ts，
 * 这里只画（Lab 1-6 实时输出面板同一种分工）。版式照原型第三版（scripts/rules-viz），按说明栏 260–400 px 的宽度收紧：
 *   一行一条：记号 · 判定 · 最近 90 s 的走势 · 此刻几条；成立时下面一行写谁对谁；
 *   点一行钉住、再点放开，钉住的那一行展开写感知、干预、全部的谁对谁与累计次数；悬停一行，画面只留这一行的标注；
 *   点画面里的一台单元，读数顶上出一张卡写它此刻为什么落、被什么拦着。
 * 颜色：第 4 节用项目二的紫（--lab-tone），三道检查用全站的莲粉，第 7 节读不到的关系用琥珀（--ld-amber，站上登记的意思是「还没好」），
 * 桌子与猫脚下用墨色。
 */

const COPY = {
  zh: {
    lit: (n: number) => `此刻成立 ${n} 条`,
    scene: '放一场 6 人 4 猫',
    sceneHint: '与 Lab 2-15 同一场，先跑 90 秒',
    legend: [
      ['rel', '3', '第 4 节'],
      ['base', '桌', '桌子'],
      ['check', '×', '被拦下'],
    ] as const,
    names: '数字 = 访客，字母 = 猫',
    pick: '点画面里的一台单元，看它为什么落',
    part: (p: ReadoutPart) => `第 ${p} 节`,
    on: (n: number, of: number) => `${n} / ${of} 成立`,
    more: (n: number) => `另 ${n} 条`,
    total: (n: number) => `累计 ${n} 次`,
    unit: (u: number) => `第 ${u + 1} 台`,
    none: '没有落下的理由',
    close: '关掉这张卡',
    trace: '这套读数只对「走 · 站 · 坐」规则。「痕迹（旧）」规则按地面痕迹落单元，规则文档第 4 节说的不是它。',
    still: '钉死、空房间两档的单元不按规则动，没有读数。切回「会动」就有。',
    spark: '最近 90 秒仿真时间里每秒成立几条',
  },
  en: {
    lit: (n: number) => `${n} holding now`,
    scene: 'Run 6 people, 4 cats',
    sceneHint: 'The Lab 2-15 scene, after 90 s',
    legend: [
      ['rel', '3', 'Section 4'],
      ['base', 'T', 'Table'],
      ['check', '×', 'Held back'],
    ] as const,
    names: 'Numbers are visitors, letters are cats',
    pick: 'Click a unit on the plan to see why it is down',
    part: (p: ReadoutPart) => `Section ${p}`,
    on: (n: number, of: number) => `${n} / ${of} holding`,
    more: (n: number) => `${n} more`,
    total: (n: number) => `held ${n}×`,
    unit: (u: number) => `Unit ${u + 1}`,
    none: 'No reason to be down',
    close: 'Close this card',
    trace: 'The readout covers the walk, stand, sit rule only. The earlier trace rule brings units down by floor traces, which section 4 of the rules document does not describe.',
    still: 'In the fixed and empty settings the units do not follow the rules, so there is nothing to read. Switch back to live units.',
    spark: 'How many held at each second over the last 90 s of simulated time',
  },
} as const;

/** 走势：每秒一根竖条，右端是此刻；纵向按这一行自己的最大值（至少 2）缩放 */
function sparkPath(data: readonly number[]): string {
  const max = Math.max(2, ...data);
  let d = '';
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!v) continue;
    const h = Math.max(1.6, (v / max) * 11);
    const x = READOUT_HIST - (data.length - i);
    d += `M${x} ${12 - h}h0.8v${h.toFixed(2)}h-0.8z`;
  }
  return d;
}

function Row({ r, lang, pinned, onHover, onPin }: { r: ReadoutRowSnap; lang: ReadoutLang; pinned: boolean; onHover: (row: RuleRow | null) => void; onPin: (row: RuleRow) => void }) {
  const t = COPY[lang];
  const def = r.def;
  const text = def[lang];
  const flow = READOUT_FLOW[lang];
  const gap = def.kind === 'gap';
  return (
    <button
      type="button"
      className="rr-row"
      data-kind={def.kind}
      data-on={r.now > 0 || undefined}
      aria-pressed={pinned}
      onMouseEnter={() => onHover(def.row)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(def.row)}
      onBlur={() => onHover(null)}
      onClick={() => onPin(def.row)}
    >
      <span className="rr-mark" aria-hidden>{def.mark[lang]}</span>
      <span className="rr-verdict">
        {text.verdict}
        {text.tag && <small>{text.tag}</small>}
      </span>
      <svg className="rr-spark" viewBox={`0 0 ${READOUT_HIST} 12`} preserveAspectRatio="none" aria-hidden>
        <rect x="0" y="11.6" width={READOUT_HIST} height="0.4" className="rr-spark__base" />
        <path d={sparkPath(r.hist)} />
      </svg>
      <b className="rr-now">{r.now}</b>
      {!pinned && r.who.length > 0 && (
        <span className="rr-who">
          {r.who[0]}
          {r.who.length > 1 && <i>{t.more(r.who.length - 1)}</i>}
        </span>
      )}
      {pinned && (
        <span className="rr-open">
          <span className="rr-flow">
            <span className="rr-k">{gap ? flow.gapSee : flow.see}</span>
            <span>{text.see}</span>
            <span className="rr-k">{gap ? flow.gapAct : flow.act}</span>
            <span>{text.act}</span>
          </span>
          {r.who.length > 0 && (
            <span className="rr-chips">
              {r.who.slice(0, 8).map((w, i) => (
                <span key={i} className="rr-chip">{w}</span>
              ))}
            </span>
          )}
          <span className="rr-total">{t.total(r.total)}</span>
        </span>
      )}
    </button>
  );
}

export function RuleReadout({
  lang,
  snap,
  status,
  pinned,
  card,
  onHover,
  onPin,
  onCloseCard,
  onScene,
}: {
  lang: ReadoutLang;
  snap: ReadoutSnap | null;
  /** ok = 有读数 · trace = 痕迹（旧）规则 · still = 钉死 / 空房间 */
  status: 'ok' | 'trace' | 'still';
  pinned: RuleRow | null;
  card: UnitCard | null;
  onHover: (row: RuleRow | null) => void;
  onPin: (row: RuleRow) => void;
  onCloseCard: () => void;
  onScene: () => void;
}) {
  const t = COPY[lang];
  const lit = snap ? snap.partOn[4] + snap.partOn[5] + snap.partOn[7] : 0;
  const parts: ReadoutPart[] = [4, 5, 7];
  return (
    <div className="rule-readout" lang={lang === 'zh' ? 'zh' : undefined}>
      <div className="rr-head">
        <span className="rr-lit">{status === 'ok' ? t.lit(lit) : ' '}</span>
        <button type="button" className="rr-scene" title={t.sceneHint} onClick={onScene}>{t.scene}</button>
      </div>
      {status !== 'ok' ? (
        <p className="rr-status">{status === 'trace' ? t.trace : t.still}</p>
      ) : (
        <>
          <p className="rr-legend">
            {t.legend.map(([kind, mark, name]) => (
              <span key={kind}><i className="rr-dot" data-kind={kind}>{mark}</i>{name}</span>
            ))}
            <span>{t.names}</span>
          </p>
          {card ? (
            <div className="rr-card" aria-live="polite">
              <div className="rr-card__head">
                <b>{t.unit(card.unit)}</b>
                <span className="rr-pill" data-state={card.degree >= 1 - 1e-9 ? 'full' : card.degree > 1e-6 ? 'part' : 'off'}>{unitState(card.degree, lang)}</span>
                <button type="button" aria-label={t.close} onClick={onCloseCard}>×</button>
              </div>
              <ul>
                {card.reasons.map((x, i) => (
                  <li key={`r${i}`} data-kind={x.kind}><i>{x.mark}</i><span>{x.name}</span><span className="rr-card__who">{x.who}</span></li>
                ))}
                {card.blocks.map((x, i) => (
                  <li key={`b${i}`} data-kind="check"><i>×</i><span>{x.see}</span><span className="rr-card__who">{x.act}</span></li>
                ))}
                {!card.reasons.length && !card.blocks.length && <li className="rr-card__none">{t.none}</li>}
              </ul>
            </div>
          ) : (
            <p className="rr-pick">{t.pick}</p>
          )}
          {snap && parts.map((p) => {
            const rows = snap.rows.filter((r) => r.def.part === p);
            return (
              <section key={p} className="rr-part" aria-label={`${t.part(p)} · ${READOUT_PARTS[p][lang]}`}>
                <h4>
                  <span>{t.part(p)}</span>
                  <b>{READOUT_PARTS[p][lang]}</b>
                  <em>{t.on(snap.partOn[p], rows.length)}</em>
                </h4>
                {rows.map((r) => (
                  <Row key={r.def.row} r={r} lang={lang} pinned={pinned === r.def.row} onHover={onHover} onPin={onPin} />
                ))}
              </section>
            );
          })}
          <p className="rr-foot" title={t.spark}>{t.spark}</p>
        </>
      )}
    </div>
  );
}

