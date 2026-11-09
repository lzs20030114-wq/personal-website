// Lab 2-15 图纸风：三种底子 × 四种图的对照表（2026-11-09）。
//
//   node scripts/unit-blender/cafe-sheet.mjs <标注后的图所在目录> <输出.png>
//
// 目录里的图按 `<风格>·<机位前缀>…png` 命名（cafe-board.mjs 的输出），风格 = line / clay / flat，机位 = H4 / P1 / S1 / H1。

import { createRequire } from 'node:module';
import { readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const [, , DIR, OUT] = process.argv;
const files = readdirSync(DIR).filter((f) => f.endsWith('.png'));
const pick = (style, cam) => files.find((f) => f.startsWith(`${style}·${cam}`));

const STYLES = [
  ['line', '线稿', '纸上只有线。单元一种紫、人和猫墨线、房间与家具细灰线'],
  ['clay', '白模', '白色体块 + 太阳方向的投影 + 凹角加暗，单元浅紫'],
  ['flat', '平涂', '无光照的几档灰 + 紫；人是浅灰剪影、猫是深色剪影'],
];
const VIEWS = [
  ['H4', '轴测剖切 · 整间房', 'ratio-43'],
  ['P1', '平面 · 1.9 m 剖切', 'ratio-43'],
  ['S1', '剖面 · 穿过一排落下的单元', 'ratio-169'],
  ['H1', '人眼高度的透视', 'ratio-169'],
];
const RULES = [
  ['取舍', '不画材质、木纹、玻璃、窗外、植物、灯光；不画螺钉、指示灯这类在图上看不清的小件。'],
  ['层级', '落下来的单元 > 人和猫 > 房间与家具。靠线的粗细与颜色分（1600 px 宽时 1.7 / 1.2 / 0.75 px）。'],
  ['颜色', '只有一种颜色：项目二的紫（站上「颜色只表示项目」那一份）。其余是纸色与几档灰。'],
  ['收着的单元', '从上往下看的图里只在地面标它落下来会占的格子；剖面与人眼透视里画在天花板下。'],
  ['剖切', '切到的墙、地、天花涂实；切到的单元画粗紫线（外皮与剖切面的交线，按仿真的几何算）。'],
  ['标注', '只写仿真给的数和关系：台面高度、给谁当桌子、谁在看哪只猫。字排在两侧栏里，引线拉回物体；透视图只画关系线。'],
];

const cell = (style, [cam, , ratio]) => {
  const f = pick(style, cam);
  return f ? `<div class="cell ${ratio}"><img src="${pathToFileURL(resolve(DIR, f))}"></div>` : `<div class="cell ${ratio} miss">（没渲）</div>`;
};
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family:'JBM'; src:url('${pathToFileURL(resolve('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'))}'); }
  body { margin:0; background:#F3F4ED; color:#0F2125; font-family:'JBM','WenQuanYi Zen Hei',sans-serif; }
  .page { width:2600px; padding:56px 64px 64px; box-sizing:border-box; }
  h1 { font-size:30px; margin:0 0 6px; font-weight:600; }
  .sub { color:#5E6966; font-size:16px; margin-bottom:28px; }
  .rules { display:grid; grid-template-columns:repeat(3,1fr); gap:10px 36px; margin-bottom:36px; font-size:15px; line-height:1.55; }
  .rules b { color:#46467D; margin-right:8px; }
  .grid { display:grid; grid-template-columns:150px repeat(4, 1fr); gap:14px 14px; align-items:start; }
  .head { font-size:16px; color:#46467D; font-weight:600; padding-bottom:4px; border-bottom:1px solid #A0A7A1; }
  .row { font-size:22px; font-weight:600; }
  .row small { display:block; font-size:13px; color:#5E6966; font-weight:400; margin-top:8px; line-height:1.5; }
  .cell { border:1px solid #C8CCC6; background:#fff; }
  .cell img { display:block; width:100%; }
  .miss { display:grid; place-items:center; color:#A0A7A1; height:300px; }
</style></head><body><div class="page">
  <h1>Letting Agent · Lab 2-15 · 图纸风的视觉语言（研究稿 · 2026-11-09）</h1>
  <div class="sub">同一刻（12 人 3 猫 · 种子 14 · 第 158 秒）、同一套几何，三种底子 × 四种图。规则六条对三种底子都一样，差别只在底子怎么上色。</div>
  <div class="rules">${RULES.map(([a, b]) => `<div><b>${a}</b>${b}</div>`).join('')}</div>
  <div class="grid">
    <div></div>${VIEWS.map(([, t]) => `<div class="head">${t}</div>`).join('')}
    ${STYLES.map(([s, name, note]) => `<div class="row">${name}<small>${note}</small></div>${VIEWS.map((v) => cell(s, v)).join('')}`).join('')}
  </div>
</div></body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'sheet-'));
const file = join(dir, 's.html');
writeFileSync(file, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2600, height: 1000 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(file).href);
await page.waitForTimeout(800);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log('SHEET', OUT);
