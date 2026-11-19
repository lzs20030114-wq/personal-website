import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LabPage from '../../app/(site)/lab/page';
import { RuleReadout } from './RuleReadout';
import { ruleReadout } from '../../src/lib/space/cohabit-reasons';
import { READOUT_ROWS, ReadoutLabels, ReadoutTracker, readoutSnapshot, unitCard } from '../../src/lib/space/cohabit-readout';
import { standardSceneSim } from '../../src/lib/space/cohabit-solid';

const preference = vi.hoisted(() => ({ lang: 'en' as 'en' | 'zh' }));
vi.mock('../site/CaseLang', async original => ({
  ...await original<typeof import('../site/CaseLang')>(),
  useOptionalCaseLang: () => preference.lang,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/lab' }));

const count = (html: string, needle: string) => html.split(needle).length - 1;
const noop = () => {};

describe('Lab 2-14 说明栏的规则读数', () => {
  it('/lab 上只有 2-14 的说明栏有「读数 / 说明」两页，读数在前', () => {
    preference.lang = 'en';
    (globalThis as { __labOpenAll?: boolean }).__labOpenAll = true;
    let html: string;
    try {
      html = renderToStaticMarkup(createElement(LabPage));
    } finally {
      (globalThis as { __labOpenAll?: boolean }).__labOpenAll = false;
    }
    expect(count(html, 'lab-details-tabs')).toBe(1);
    expect(count(html, 'class="lab-readout-slot"')).toBe(1);
    const panel = html.slice(html.indexOf('data-lab-panel="2-14"'), html.indexOf('data-lab-panel="2-15"'));
    expect(panel).toContain('lab-details-tabs');
    expect(panel).toMatch(/aria-pressed="true"[^>]*>Rule readout/);
  });

  it('每一行都画出来，成立的亮起，钉住那一行展开感知与干预，单元卡写理由', { timeout: 30_000 }, () => {
    const sim = standardSceneSim('live');
    const L = new ReadoutLabels();
    const T = new ReadoutTracker(sim.t);
    for (let k = 0; k < 60 * 30; k++) {
      sim.step(1 / 30);
      if (k % 15 === 0) T.account(ruleReadout(sim), sim.t);
    }
    L.sync(sim);
    const hits = ruleReadout(sim);
    T.account(hits, sim.t);
    for (const lang of ['zh', 'en'] as const) {
      const snap = readoutSnapshot(hits, T, sim, L, lang);
      const lit = snap.rows.find((r) => r.now > 0)!;
      const u = sim.layout.units.findIndex((_, i) => sim.act.degree[i] > 0.5);
      const html = renderToStaticMarkup(
        <RuleReadout lang={lang} snap={snap} status="ok" pinned={lit.def.row} card={unitCard(sim, hits, u, L, lang)} onHover={noop} onPin={noop} onCloseCard={noop} onScene={noop} />,
      );
      expect(count(html, 'class="rr-row"')).toBe(READOUT_ROWS.length);
      expect(count(html, '<h4>')).toBe(3);
      expect(count(html, 'data-on="true"')).toBe(snap.rows.filter((r) => r.now > 0).length);
      expect(count(html, 'class="rr-open"')).toBe(1);
      expect(html).toContain(lit.def[lang].see);
      expect(html).toContain('class="rr-card"');
      expect(html).not.toMatch(/undefined|NaN/);
    }
  });

  it('痕迹（旧）规则、钉死与空房间：写一句说明，不画空表', () => {
    for (const status of ['trace', 'still'] as const) {
      const html = renderToStaticMarkup(<RuleReadout lang="zh" snap={null} status={status} pinned={null} card={null} onHover={noop} onPin={noop} onCloseCard={noop} onScene={noop} />);
      expect(count(html, 'class="rr-row"')).toBe(0);
      expect(html).toContain('class="rr-status"');
      expect(html).toContain('放一场 6 人 4 猫');
    }
  });
});
