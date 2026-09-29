import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LabPage from '../../app/(site)/lab/page';
import { LAB_BENCHES, LAB_INDEX } from '../../src/lib/site/lab-index';
import { labPageText } from '../../src/lib/site/lab-page-copy';
import { labUiText } from '../../src/lib/site/lab-ui-copy';
import { SkinLayersForming } from './SkinLayersForming';
import { layerBaseline } from '../../src/lib/space/skin-layers';

const preference = vi.hoisted(() => ({ lang: 'en' as 'en' | 'zh' }));
vi.mock('../site/CaseLang', async original => ({
  ...await original<typeof import('../site/CaseLang')>(),
  useOptionalCaseLang: () => preference.lang,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/lab' }));

describe('Lab language coverage', () => {
  it('translates every registered study and directory group into Chinese', () => {
    const translate = (text: string) => labUiText('zh', labPageText('zh', text));
    for (const bench of LAB_BENCHES) {
      expect(translate(bench.title), bench.no).not.toBe(bench.title);
      expect(translate(bench.description), bench.no).not.toBe(bench.description);
    }
    for (const group of LAB_INDEX) {
      expect(translate(group.label)).not.toBe(group.label);
      for (const segment of group.segments.filter(s => s.n)) {
        expect(translate(segment.label)).not.toBe(segment.label);
        expect(translate(segment.sub)).not.toBe(segment.sub);
      }
    }
  });

  it('renders all 17 English benches without Chinese text or accessible labels', () => {
    preference.lang = 'en';
    const html = renderToStaticMarkup(createElement(LabPage));
    expect(html.match(/data-lab-panel=/g)).toHaveLength(LAB_BENCHES.length);
    // The language selector is the one intentional Chinese label in English mode.
    expect(html.replace(/中文/g, '').match(/[\u4e00-\u9fff]+/g)).toBeNull();
  });

  it('also translates the lazily mounted forming view', () => {
    preference.lang = 'en';
    const html = renderToStaticMarkup(createElement(SkinLayersForming, {
      active: false, onLight: false, study: layerBaseline(),
    }));
    expect(html.match(/[\u4e00-\u9fff]+/g)).toBeNull();
    expect(html).toContain('Forming study');
  });

  it('keeps the Chinese directory, instructions and controls in Chinese', () => {
    preference.lang = 'zh';
    const html = renderToStaticMarkup(createElement(LabPage));
    expect(html).toContain('清空人数');
    expect(html).toContain('操作说明');
    expect(html).toContain('收起目录');
    expect(html).not.toContain('ABOUT THIS STUDY');
    expect(html).not.toContain('Project II');
    expect(html).not.toContain('How to use');
  });
});
