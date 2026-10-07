'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useCaseLangControl } from '../site/CaseLang';
import { LAB_BENCHES, LAB_INDEX, labAccent } from '../../src/lib/site/lab-index';
import { useLabText } from './LabLanguage';

/**
 * 「09 Lab Page - Dark」稿的页面外壳（design-ref/lab-page-dark，MAPPING §43）：
 * 顶栏 / 开头区（标题 + 三行用法 + 项目芯片）/ 页脚。台架本体与目录、说明栏仍在
 * LabWorkspace / LabPanel；这里只管稿里的「页面级」那一圈，数据全部来自 lab-index。
 */

const PROJECT_TITLE = ['Reincarnation Machine', 'Cross-species space'] as const;
const countOf = (n: number, zh: boolean) => (zh ? `${n} 项实验` : `${n} ${n === 1 ? 'bench' : 'benches'}`);

const benchCount = (g: (typeof LAB_INDEX)[number]) => g.segments.reduce((a, s) => a + s.benches.length, 0);

/** 项目锚点 id：芯片与分组头共用。 */
export const projectAnchor = (i: number) => `lab-project-${i + 1}`;

export function LabIntro() {
  const tx = useLabText();
  const { lang } = useCaseLangControl();
  const zh = lang === 'zh';
  const rows: [string, string][] = [
    ['scroll', 'Moves the page — never the model.'],
    ['drag', 'Works straight away: orbit, pull a joint, move a person.'],
    ['expand ↗', 'Gives one bench the screen. The wheel then zooms; Esc restores.'],
  ];
  const chips = [
    ...LAB_INDEX.map((g, i) => ({
      n: String(i + 1).padStart(2, '0'), kicker: g.label.split(' — ')[0], title: PROJECT_TITLE[i],
      ink: labAccent(i === 0 ? '2d' : '3d'), count: countOf(benchCount(g), zh), href: `#${projectAnchor(i)}`, dim: false,
    })),
    { n: '03', kicker: 'Project III', title: 'Benches to come', ink: 'oklch(0.74 0.06 235)', count: tx('in progress'), href: `#${projectAnchor(LAB_INDEX.length)}`, dim: true },
  ];
  return (
    <section className="ld-intro" aria-label={tx('The lab')}>
      <div className="ld-intro__top">
        <div className="ld-intro__lead">
          <p className="ld-meta"><span className="ld-live">{zh ? '实时' : 'Live'}</span>{zh ? `实验室 · ${LAB_BENCHES.length} 项交互实验` : `Lab · ${LAB_BENCHES.length} interactive benches`}</p>
          <h1 className="ld-h1">{tx('The lab')}{zh ? '' : <span className="ld-h1__dot">.</span>}</h1>
          <p className="ld-lede">{tx('Interactive studies of linkages, fabric structures and spatial behaviour. Drag the models and adjust their controls to compare how they move and form.')}</p>
        </div>
        <dl className="ld-howto">
          {rows.map(([k, v]) => <div key={k}><dt>{tx(k)}</dt><dd>{tx(v)}</dd></div>)}
        </dl>
      </div>
      <div className="ld-chips">
        {chips.map(c => (
          <a key={c.n} href={c.href} className="ld-chip" data-dim={c.dim || undefined} style={{ '--chip': c.ink } as CSSProperties}>
            <span className="ld-chip__row"><span className="ld-chip__k">{c.n} · {tx(c.kicker)}</span><span className="ld-chip__n">{c.count}</span></span>
            <span className="ld-chip__t">{tx(c.title)} <span className="ld-chip__arrow">↓</span></span>
          </a>
        ))}
      </div>
    </section>
  );
}

const PROJECT_SLUG = ['reincarnation-machine', 'project-ii'] as const;

/** 项目分组头（稿：2px 墨线 + 编号 + 标题 + 副题 ‖ 台数 + 案例链接）。 */
export function LabProjectRule({ i }: { i: 0 | 1 }) {
  const tx = useLabText();
  const { lang } = useCaseLangControl();
  const g = LAB_INDEX[i];
  const sub = g.sub.split(' · ').slice(1).join(' · ');
  return (
    <div className="ld-proj" id={projectAnchor(i)} style={{ '--proj': labAccent(i === 0 ? '2d' : '3d') } as CSSProperties}>
      <div className="ld-proj__head">
        <span className="ld-proj__id">
          <span className="ld-proj__n">{String(i + 1).padStart(2, '0')}</span>
          <span className="ld-proj__title">{tx(PROJECT_TITLE[i])}</span>
          <span className="ld-proj__sub">{tx(sub)}</span>
        </span>
        <span className="ld-proj__aside">
          {countOf(benchCount(g), lang === 'zh')}
          <Link href={`/work/${PROJECT_SLUG[i]}`}>{tx('Case study ↗')}</Link>
        </span>
      </div>
    </div>
  );
}

/** 尺度段头（项目二）：「Ⅰ · One band ───── 3 benches」。 */
export function LabScaleRule({ i }: { i: number }) {
  const tx = useLabText();
  const { lang } = useCaseLangControl();
  const s = LAB_INDEX[1].segments[i];
  return (
    <p className="ld-seg">
      <span>{s.n} · {tx(s.label)}</span>
      <span className="ld-seg__rule" />
      <span className="ld-seg__n">{countOf(s.benches.length, lang === 'zh')}</span>
    </p>
  );
}

/** 项目三：只有占位头，台架待建。 */
export function LabProjectEmpty() {
  const tx = useLabText();
  return (
    <div className="ld-proj ld-proj--empty" id={projectAnchor(LAB_INDEX.length)}>
      <div className="ld-proj__head">
        <span className="ld-proj__id">
          <span className="ld-proj__n">03</span>
          <span className="ld-proj__title">{tx('Project III')}</span>
        </span>
        <span className="ld-proj__aside">{tx('In progress')}</span>
      </div>
      <p className="ld-empty">{tx('No benches yet. They will appear here, in build order, as the project takes shape.')}</p>
    </div>
  );
}
