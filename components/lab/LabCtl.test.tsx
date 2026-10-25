import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LabFold, LabViewDock, LabViewDockSlot } from './LabCtl';
import { helpName } from './LabHelp';

describe('helpName：说明栏只列控件名，去掉跟在后面的读数', () => {
  it.each([
    ['影响半径 1.50 m', '影响半径'],
    ['reach 1.50 m', 'reach'],
    ['阈值 2 秒', '阈值'],
    ['clearance ±0.15', 'clearance'],
    ['时间  ×4', '时间'],
    ['视角', '视角'],
    ['Model settings', 'Model settings'],
  ])('%s → %s', (raw, name) => expect(helpName(raw)).toBe(name));
});

describe('LabViewDock：视角预设搬去面板底栏', () => {
  const dock = <LabViewDock><span className="seg">axon</span></LabViewDock>;
  it('不在面板里：原地照画', () => {
    expect(renderToStaticMarkup(dock)).toBe('<div class="grp"><span class="seg">axon</span></div>');
  });
  it('在面板里、底栏还没挂上：先不画（不在面板里闪一份）', () => {
    expect(renderToStaticMarkup(<LabViewDockSlot.Provider value={null}>{dock}</LabViewDockSlot.Provider>)).toBe('');
  });
  it('off：这台此刻不显示', () => {
    expect(renderToStaticMarkup(<LabViewDock off><span>x</span></LabViewDock>)).toBe('');
  });
});

describe('LabFold：默认收起的折叠组', () => {
  it('原生 details、不带 open，控件仍在页面里', () => {
    const html = renderToStaticMarkup(<LabFold label="模型参数"><button type="button">x</button></LabFold>);
    expect(html).toMatch(/^<details class="grp lab-fold">/);
    expect(html).not.toMatch(/\sopen/);
    expect(html).toContain('<summary>模型参数</summary>');
    expect(html).toContain('<button type="button">x</button>');
  });
});
