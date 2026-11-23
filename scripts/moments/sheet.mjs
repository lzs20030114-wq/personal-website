// 决定性瞬间的线稿 · 第三步：把一条规则的几格排成一行，出一张白底的图版。
//
//   node scripts/moments/sheet.mjs <rows.json> <线稿目录> <out.png> [宽 2400]
//
// rows.json：[{ no, title, judge, panels: [{ img, stage, cap }] }]。
// 版式（2026-11-23 作者「学术一点、像竞赛图版、清新一些」）：每行上面一条写规则，下面几格线稿不加框，
// 每格左上角一张平面小图（哪一格落着、哪一格被调动、人和猫在哪，数据取 line.py 写的同名 .json），格下一行说明。
// 字都在画面外面，作品集里可以按版式另排。
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const [rowsFile, dir, out, width = '2400'] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(rowsFile, 'utf8'));
const uri = (f) => 'data:image/png;base64,' + readFileSync(join(dir, f)).toString('base64');
const side = (f) => JSON.parse(readFileSync(join(dir, f.replace(/\.png$/, '.json')), 'utf8'));
const INK = '#181818', MID = '#929292', PALE = '#c9c9c9', TONE = '#e5e5e5';

/** 平面小图：行 0 在上。世界单位（一格 = pitch），人和猫的 c = [x, −z] */
function keyplan(d) {
  const { n, pitch: p } = d;
  const R = (n / 2) * p + p * 0.14;
  const has = (list, r, c) => list.some((u) => u[0] === r && u[1] === c);
  const at = (r, c) => [(c - (n - 1) / 2) * p, (r - (n - 1) / 2) * p];
  let s = `<rect x="${-R}" y="${-R}" width="${2 * R}" height="${2 * R}" fill="none" stroke="${MID}" stroke-width="2.4"/>`;
  for (const f of d.furn) s += `<rect x="${f[0]}" y="${-f[3]}" width="${f[2] - f[0]}" height="${f[3] - f[1]}" fill="none" stroke="${PALE}" stroke-width="2.4"/>`;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const [x, y] = at(r, c);
      const h = p * 0.4;
      const box = (extra) => `<rect x="${x - h}" y="${y - h}" width="${2 * h}" height="${2 * h}" ${extra}/>`;
      if (has(d.marked, r, c) && !d.bands) s += box(`fill="${TONE}" stroke="${INK}" stroke-width="5"`);
      else if (has(d.down, r, c)) s += box(`fill="none" stroke="${MID}" stroke-width="2.4"`);
      else if (has(d.ghosts, r, c)) s += box(`fill="none" stroke="${INK}" stroke-width="3" stroke-dasharray="9 7"`);
      else s += `<circle cx="${x}" cy="${y}" r="${p * 0.045}" fill="${PALE}"/>`;
    }
  const dot = (a, r) => `<circle cx="${a.c[0]}" cy="${-a.c[1]}" r="${r}" fill="${a.trigger ? MID : '#fff'}" stroke="${a.trigger ? INK : MID}" stroke-width="${a.trigger ? 4 : 2.4}"/>`;
  for (const a of d.anchors.people) s += dot(a, p * 0.15);
  for (const a of d.anchors.cats) s += dot(a, p * 0.085);
  const V = R + p * 0.1;
  return `<svg class="key" viewBox="${-V} ${-V} ${2 * V} ${2 * V}">${s}</svg>`;
}

const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#fff;color:${INK};font-family:"Noto Sans SC","Source Han Sans SC","PingFang SC","WenQuanYi Zen Hei",sans-serif;padding:56px 60px 44px;width:1200px;box-sizing:border-box}
  .mono{font-family:"JetBrains Mono","DejaVu Sans Mono",ui-monospace,monospace}
  section{border-top:1px solid ${INK};padding:12px 0 30px}
  .rule{display:grid;grid-template-columns:repeat(3,1fr);column-gap:22px;align-items:start;margin-bottom:10px}
  .rule .no{font-size:10.5px;letter-spacing:.16em;color:#777}
  .rule h2{font-size:17px;line-height:1.4;font-weight:600;margin:5px 0 0}
  .rule dl{margin:0;font-size:11.5px;line-height:1.65;color:#444}
  .rule dt{font-size:10px;letter-spacing:.16em;color:#999}
  .rule dd{margin:1px 0 0}
  .row{display:grid;grid-template-columns:repeat(3,1fr);column-gap:22px}
  figure{margin:0;position:relative}
  figure img{display:block;width:100%;height:auto}
  .key{position:absolute;left:0;top:0;width:62px;height:62px;background:#fff;padding:0 6px 6px 0}
  figcaption{border-top:1px solid ${PALE};margin-top:6px;padding-top:7px;font-size:11.5px;line-height:1.65;color:#333}
  figcaption b{display:block;font-weight:600;font-size:11px;letter-spacing:.14em;color:${INK};margin-bottom:2px}
  figcaption b i{font-style:normal;color:#999;margin-right:8px;font-weight:400}
  footer{border-top:1px solid ${INK};padding-top:12px;display:flex;gap:26px;font-size:10.5px;color:#555;align-items:center;flex-wrap:wrap}
  footer span{display:inline-flex;align-items:center;gap:7px}
  .sw{display:inline-block;width:15px;height:11px;box-sizing:border-box}
</style>
${rows.map((r) => `<section><div class="rule"><div><div class="no mono">${r.no}</div><h2>${r.title}</h2></div><dl><dt class="mono">理解</dt><dd>${r.judge}</dd></dl>${r.count ? `<dl><dt class="mono">实跑 30 分钟</dt><dd>${r.count}</dd></dl>` : '<span></span>'}</div>
<div class="row">${r.panels.map((p, i) => `<figure><img src="${uri(p.img)}">${keyplan(side(p.img))}<figcaption><b><i class="mono">${String(i + 1).padStart(2, '0')}</i>${p.stage}</b>${p.cap}</figcaption></figure>`).join('')}</div></section>`).join('')}
<footer><span><i class="sw" style="background:${MID};border:1.5px solid ${INK}"></i>触发的人或猫</span><span><i class="sw" style="background:${TONE};border:1.5px solid ${INK}"></i>被调动的单元（让路时是收回的带）</span><span><i class="sw" style="border:1px solid ${MID}"></i>其余落着的单元</span><span><i class="sw" style="border-top:1.5px dashed ${INK};height:0"></i>视线</span><span>地面一格 0.83 m。单元平时收在天花板下，画面只取到 2.4 m 高</span></footer>`;
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: Number(width) / 1200 });
await pg.setContent(html);
await pg.waitForTimeout(300);
writeFileSync(resolve(out), await (await pg.$('body')).screenshot());
await br.close();
console.log(out);
