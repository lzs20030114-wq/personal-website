// 决定性瞬间的线稿 · 第三步：把一条规则的几格排成一行，加编号、阶段与一句说明，出一张白底的图。
//
//   node scripts/moments/sheet.mjs <rows.json> <线稿目录> <out.png> [宽 2400]
//
// rows.json：[{ no, title, judge, panels: [{ img, stage, cap }] }]。字都在画面外面，作品集里可以按版式另排。
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const [rowsFile, dir, out, width = '2400'] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(rowsFile, 'utf8'));
const uri = (f) => 'data:image/png;base64,' + readFileSync(join(dir, f)).toString('base64');
const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#fff;color:#141414;font-family:"Noto Sans SC","Source Han Sans SC","PingFang SC","WenQuanYi Zen Hei",sans-serif;padding:44px 48px 40px;width:1200px;box-sizing:border-box}
  section{margin-bottom:44px} section:last-child{margin-bottom:0}
  .head{display:flex;align-items:baseline;gap:14px;border-top:1.5px solid #141414;padding-top:12px;margin-bottom:14px}
  .no{font:700 22px/1 ui-monospace,monospace;border:1.5px solid #141414;border-radius:50%;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;flex:none;transform:translateY(4px)}
  .ttl{font-size:21px;font-weight:700}
  .judge{margin-left:auto;font-size:13.5px;color:#555}
  .judge b{color:#141414;font-weight:700}
  .row{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:14px}
  figure{margin:0}
  .pic{position:relative;border:1px solid #141414}
  .pic img{display:block;width:100%;height:auto}
  .st{position:absolute;left:0;top:0;padding:5px 10px 4px;font-size:12.5px;letter-spacing:.08em;background:#fff;border-right:1px solid #141414;border-bottom:1px solid #141414}
  .st i{font-style:normal;font-family:ui-monospace,monospace;color:#777;margin-right:7px}
  figcaption{font-size:13.5px;line-height:1.6;margin-top:8px;color:#222}
</style>
${rows.map((r) => `<section><div class="head"><span class="no">${r.no}</span><span class="ttl">${r.title}</span><span class="judge">理解：<b>${r.judge}</b></span></div>
<div class="row" style="--n:${r.panels.length}">${r.panels.map((p, i) => `<figure><div class="pic"><img src="${uri(p.img)}"><div class="st"><i>${i + 1}</i>${p.stage}</div></div><figcaption>${p.cap}</figcaption></figure>`).join('')}</div></section>`).join('')}`;
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: Number(width) / 1200 });
await pg.setContent(html);
await pg.waitForTimeout(300);
writeFileSync(resolve(out), await (await pg.$('body')).screenshot());
await br.close();
console.log(out);
