import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LabPage from '../../app/(site)/lab/page';
import { MachineBench } from './MachineBench';
import { ActuatorPanel } from './ActuatorPanel';
import { READOUT_CHANNELS } from '../../src/lib/linkage/actuator-readout';

const preference = vi.hoisted(() => ({ lang: 'en' as 'en' | 'zh' }));
vi.mock('../site/CaseLang', async original => ({
  ...await original<typeof import('../site/CaseLang')>(),
  useOptionalCaseLang: () => preference.lang,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/lab' }));

const count = (html: string, cls: string) => html.split(`class="${cls}"`).length - 1;

describe('Lab 1-6 实时输出面板', () => {
  it('/lab 上只有 Lab 1-6 挂面板，每个通道一行', () => {
    preference.lang = 'en';
    const html = renderToStaticMarkup(createElement(LabPage));
    expect(count(html, 'mb-out')).toBe(1);
    expect(count(html, 'mb-out__row')).toBe(READOUT_CHANNELS.length);
    const at = html.indexOf('class="mb-out"');
    const panel = html.lastIndexOf('data-lab-panel="', at);
    expect(html.slice(panel, panel + 20)).toBe('data-lab-panel="1-6"');
  });

  it('编排档、主页预览（不出控制条）与案例页侧栏都不出面板，DOM 不多包一层', () => {
    for (const props of [{}, { behavior: true, controls: false }, { behavior: true, sideControls: true }]) {
      const html = renderToStaticMarkup(createElement(MachineBench, props));
      expect(html).not.toContain('mb-out');
      expect(html).not.toContain('mb-split');
    }
  });

  it('中英两份文案：英文版没有中文，中文版的组名是中文', () => {
    const en = renderToStaticMarkup(createElement(ActuatorPanel, { snap: null, lang: 'en' }));
    expect(en.match(/[一-鿿]+/g)).toBeNull();
    const zh = renderToStaticMarkup(createElement(ActuatorPanel, { snap: null, lang: 'zh' }));
    for (const s of ['大触手', '舵机', '中间轴', '转台', '声音', '灯']) expect(zh).toContain(s);
  });
});
