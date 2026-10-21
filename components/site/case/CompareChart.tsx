'use client';

import { useState, type ReactNode } from 'react';
import data from '../../../src/lib/space/cohabit-compare.data.json';
import type { Lang } from '../../../src/lib/site/case-reincarnation';

/**
 * 项目二「对照结果」那张图（FIG.05）：Lab 2-14 最终配置下三档空间的读数。
 *
 * 数据 = `src/lib/space/cohabit-compare.data.json`，由 `scripts/cohabit/case-compare.mjs` 真跑出来
 * （三个场景 × 两种引导 × 三档空间 × 32 个种子，每场 300 s），图与数表读的是同一份文件。
 *
 * 画法按 dataviz 的规矩：每个场景一组小多图，一个读数一格，格内三条横条（会动的单元 / 单元钉死 / 空房间），
 * 条 = 均值、须 = ±1 标准差、点 = 单个种子；一格一把尺子（不同场景的人数不同，秒数不能跨场景比，
 * 要比的是同一场景里三档空间的差）。只有会动的单元用站内绿，两个基准是灰——这张图的话是
 * 「会动的单元比基准多多少」，基准是陪衬；三行都写字（左栏短标 + 右栏数值），身份不靠颜色。
 * 星号落在基准那一行的末尾：会动的单元对这个基准的双侧置换检验。悬停 / 聚焦任一行出读数；数表在图下折叠。
 */

type SpaceKey = 'live' | 'fixed' | 'empty';
type GuideKey = 'meet' | 'sidew';
type MetricKey = 'warmthS' | 'touchS' | 'settled' | 'detour';
type Stat = {
  mean: Record<SpaceKey, number>;
  sd: Record<SpaceKey, number>;
  v: Record<SpaceKey, number[]>;
  vsFixed: { p: number; d: number };
  vsEmpty: { p: number; d: number };
};

const SPACES: SpaceKey[] = ['live', 'fixed', 'empty'];
const METRICS: MetricKey[] = ['warmthS', 'touchS', 'settled', 'detour'];
const GUIDES: GuideKey[] = ['meet', 'sidew'];

const UI = {
  zh: {
    kicker: '对照 · 人猫同台（实验 2-14）',
    title: '三档空间，三种客流',
    pick: '引导方式',
    guide: { meet: '座位前方那台', sidew: '座位旁边那台 · 整条路一次落' } as Record<GuideKey, string>,
    space: { live: '会动的单元', fixed: '单元钉死', empty: '空房间' } as Record<SpaceKey, string>,
    short: { live: '会动', fixed: '钉死', empty: '空房' } as Record<SpaceKey, string>,
    metric: {
      warmthS: ['共温', '秒 · 人在猫 0.5–1.5 m 内停着'],
      touchS: ['共触', '秒 · 距离小于 0.5 m'],
      settled: ['猫安稳停留', '秒'],
      detour: ['访客绕行', '米'],
    } as Record<MetricKey, [string, string]>,
    scene: (p: number, c: number) => `${p} 位访客 · ${c} 只猫`,
    vs: '会动的单元对它',
    n: (n: number) => `${n} 个种子`,
    table: '数表',
    note: (s: number, n: number) =>
      `每场 ${s} 秒，${n} 个种子取均值；8×8，走 · 站 · 坐，只收挡路的带。条 = 均值，须 = ±1 标准差，点 = 单个种子。基准行末的星号 = 会动的单元对它的双侧置换检验（*** p<.001 · ** <.01 · * <.05）。数字只在这套规则下成立。`,
    th: { metric: '读数', scene: '场景' },
  },
  en: {
    kicker: 'Comparison · people and cats together (Lab 2-14)',
    title: 'Three spaces, three crowd levels',
    pick: 'Guidance',
    guide: { meet: 'Unit in front of the seat', sidew: 'Unit beside the seat · whole path at once' } as Record<GuideKey, string>,
    space: { live: 'Live units', fixed: 'Fixed units', empty: 'Empty room' } as Record<SpaceKey, string>,
    short: { live: 'live', fixed: 'fixed', empty: 'empty' } as Record<SpaceKey, string>,
    metric: {
      warmthS: ['Co-warmth', 's · a person stays within 0.5–1.5 m of a cat'],
      touchS: ['Co-touch', 's · closer than 0.5 m'],
      settled: ['Cat settled', 's'],
      detour: ['Visitor detour', 'm'],
    } as Record<MetricKey, [string, string]>,
    scene: (p: number, c: number) => `${p} visitors · ${c} ${c === 1 ? 'cat' : 'cats'}`,
    vs: 'live units against it',
    n: (n: number) => `${n} seeds`,
    table: 'Table',
    note: (s: number, n: number) =>
      `${s} s per run, mean of ${n} seeds; 8×8, walk · stand · sit, only the strips in the way retract. Bar = mean, whisker = ±1 SD, dot = one seed. The stars at the end of a baseline row are the two-sided permutation test of live units against that baseline (*** p<.001 · ** <.01 · * <.05). The numbers hold only under this rule set.`,
    th: { metric: 'Reading', scene: 'Scene' },
  },
} as const;

const stars = (p: number) => (p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : '');
const fmtP = (p: number) => (p < 0.001 ? 'p < .001' : `p = ${p.toFixed(3).replace(/^0/, '')}`);

/* 几何（viewBox 单位 = px） */
const W = 320;
const ROW = 24;
const PAD_T = 6;
const X0 = 44; // 左栏短标到条的起点
const X1 = W - 52; // 条的最远端（右栏留给数值）
const BAR = 10;

function Cell({ lang, stat, metric, scene, seeds, color }: { lang: Lang; stat: Stat; metric: MetricKey; scene: string; seeds: number; color: Record<SpaceKey, string> }) {
  const ui = UI[lang];
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null);
  const [name, unit] = ui.metric[metric];
  const top = Math.max(...SPACES.flatMap((s) => [stat.mean[s] + stat.sd[s], ...stat.v[s]]), 1);
  const x = (v: number) => X0 + (Math.max(0, v) / (top * 1.04)) * (X1 - X0);
  const h = PAD_T * 2 + ROW * 3;
  const tipFor = (s: SpaceKey): ReactNode => {
    const test = s === 'fixed' ? stat.vsFixed : s === 'empty' ? stat.vsEmpty : null;
    return (
      <>
        <strong>
          {stat.mean[s].toFixed(0)} ± {stat.sd[s].toFixed(0)}
        </strong>
        {` ${name}（${ui.space[s]} · ${scene} · ${ui.n(seeds)}）`.replace(/（/g, lang === 'en' ? ' (' : '（').replace(/）/g, lang === 'en' ? ')' : '）')}
        {test ? `\n${ui.vs}: ${fmtP(test.p)}, d = ${test.d.toFixed(2)}` : ''}
      </>
    );
  };
  return (
    <div className="cs-cmp__cell">
      <div className="cs-cmp__t">
        {name}
        <span>{unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={`${name} · ${scene}`}>
        <line x1={X0} y1={PAD_T} x2={X0} y2={h - PAD_T} stroke="oklch(0.95 0.032 120 / 0.14)" />
        {SPACES.map((s, i) => {
          const cy = PAD_T + ROW * i + ROW / 2;
          const m = stat.mean[s];
          const xe = x(m);
          const live = s === 'live';
          const test = s === 'fixed' ? stat.vsFixed : s === 'empty' ? stat.vsEmpty : null;
          const bar = `M${X0} ${cy - BAR / 2}H${Math.max(xe - 4, X0)}a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H${X0}Z`;
          return (
            <g key={s}>
              <text x={X0 - 6} y={cy + 4} textAnchor="end" fontSize="10.5" fontWeight={live ? 600 : 400} fill="var(--cs-dim)" style={{ fontFamily: 'var(--cs-mono)' }}>
                {ui.short[s]}
              </text>
              <path d={bar} fill={color[s]} />
              <line x1={x(m - stat.sd[s])} y1={cy} x2={x(m + stat.sd[s])} y2={cy} stroke="var(--cs-ink)" strokeWidth="1" strokeOpacity={0.8} />
              {stat.v[s].map((v, j) => (
                <circle key={j} cx={x(v)} cy={cy + ((j % 5) - 2) * 2.2} r="1.6" fill={color[s]} stroke="var(--cs-paper)" strokeWidth="1" opacity={0.9} />
              ))}
              <text x={X1 + 6} y={cy + 4} fontSize="11" fill={live ? 'var(--cs-ink)' : 'var(--cs-dim)'} fontWeight={live ? 600 : 400} style={{ fontFamily: 'var(--cs-mono)', fontVariantNumeric: 'tabular-nums' }}>
                {m.toFixed(0)}
                {test ? (
                  <tspan fill="var(--cs-gh)" dx="4">
                    {stars(test.p)}
                  </tspan>
                ) : null}
              </text>
              <rect
                x={0}
                y={cy - ROW / 2}
                width={W}
                height={ROW}
                fill="transparent"
                tabIndex={0}
                aria-label={`${ui.space[s]} ${m.toFixed(0)} ± ${stat.sd[s].toFixed(0)}`}
                onPointerMove={(e) => {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setTip({ x: e.clientX - r.left, y: e.clientY - r.top, body: tipFor(s) });
                }}
                onPointerLeave={() => setTip(null)}
                onFocus={() => setTip({ x: X0, y: (cy / h) * 100, body: tipFor(s) })}
                onBlur={() => setTip(null)}
              />
            </g>
          );
        })}
      </svg>
      {tip ? (
        <div className="cs-cmp__tip" style={{ left: Math.min(tip.x + 12, 200), top: tip.y + 28 }}>
          {tip.body}
        </div>
      ) : null}
    </div>
  );
}

export function CompareChart({ id = 'FIG.05', lang = 'en' }: { id?: string; lang?: Lang }) {
  const ui = UI[lang];
  const [guide, setGuide] = useState<GuideKey>('meet');
  const color: Record<SpaceKey, string> = { live: 'var(--cs-g)', fixed: 'oklch(0.66 0.016 150)', empty: 'oklch(0.5 0.016 150)' };
  const scenes = data.scenes as Array<{ people: number; cats: number; guides: Array<{ key: string; metrics: Record<MetricKey, Stat> }> }>;
  return (
    <figure className="cs-cmp">
      <div className="cs-pz__head">
        <span className="cs-pz__kick">
          <span>
            {id} · {ui.kicker}
          </span>
          <span>{ui.title}</span>
        </span>
        <span className="cs-seg" role="group" aria-label={ui.pick}>
          {GUIDES.map((g) => (
            <button key={g} type="button" aria-pressed={g === guide} onClick={() => setGuide(g)}>
              {ui.guide[g]}
            </button>
          ))}
        </span>
      </div>
      <div className="cs-cmp__legend" aria-hidden>
        {SPACES.map((s) => (
          <span key={s}>
            <i style={{ background: color[s] }} />
            {ui.space[s]}
          </span>
        ))}
      </div>
      {scenes.map((sc) => {
        const g = sc.guides.find((x) => x.key === guide) ?? sc.guides[0];
        const scene = ui.scene(sc.people, sc.cats);
        return (
          <div className="cs-cmp__scene" key={`${sc.people}-${sc.cats}`}>
            <div className="cs-cmp__scene-head">
              <span>{scene}</span>
            </div>
            {METRICS.map((mk) => (
              <Cell key={mk} lang={lang} stat={g.metrics[mk]} metric={mk} scene={scene} seeds={data.seeds} color={color} />
            ))}
          </div>
        );
      })}
      <details className="cs-cmp__table">
        <summary>{ui.table}</summary>
        <table>
          <thead>
            <tr>
              <th>{ui.th.scene}</th>
              <th>{ui.th.metric}</th>
              {SPACES.map((s) => (
                <th key={s}>{ui.space[s]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenes.flatMap((sc) => {
              const g = sc.guides.find((x) => x.key === guide) ?? sc.guides[0];
              return METRICS.map((mk) => {
                const st = g.metrics[mk];
                return (
                  <tr key={`${sc.people}-${mk}`}>
                    <td>{ui.scene(sc.people, sc.cats)}</td>
                    <td>{ui.metric[mk][0]}</td>
                    {SPACES.map((s) => {
                      const test = s === 'fixed' ? st.vsFixed : s === 'empty' ? st.vsEmpty : null;
                      return (
                        <td key={s}>
                          {st.mean[s].toFixed(0)} ± {st.sd[s].toFixed(0)}
                          {test ? ` ${stars(test.p) || 'n.s.'}` : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </details>
      <figcaption className="cs-note cs-pz__note">{ui.note(data.seconds, data.seeds)}</figcaption>
    </figure>
  );
}
