// 决定性瞬间的线稿 · 第三步：按叙事顺序把各条规则排成一张白底的图版。
//
//   node scripts/moments/sheet.mjs <plate.json> <线稿目录> <out.png> [宽 2400]
//
// plate.json：{ title, lede, matrix: { head: [..], rows: [[..]..], foot }, sections: [{ name, note, rows: [row..] }] }
//   row = { no, title, judge?, count?, needs?: ['01'..], cols?: 3, src?, panels: [{ img, stage, cap }] }
// 版式（2026-11-23 作者「学术一点、像竞赛图版、清新一些」；11-24「要有叙事逻辑，哪一行是哪一行的前提要讲清」）：
//   版头 = 一句目的 + 一张总表（人的状态 × 单元做什么，格里写行号）；
//   正文分章，每章一句说明；每行上面一条写规则（行号 · 理解 · 实跑次数 · 前提是哪几行），下面几格线稿不加框，
//   每格左上角一张平面小图（数据取 line.py 写的同名 .json），格下一行说明。
// 字都在画面外面，作品集里可以按版式另排。
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const [plateFile, dir, out, width = '2400'] = process.argv.slice(2);
const plate = JSON.parse(readFileSync(plateFile, 'utf8'));
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

const cell = (t) => String(t).replace(/(\d\d)(?= )/g, '<i class="mono">$1</i>');
const row = (r) => {
  const cols = r.cols ?? 3;
  const meta = [
    r.judge ? `<dl><dt class="mono">理解</dt><dd>${r.judge}</dd></dl>` : '',
    r.count ? `<dl><dt class="mono">实跑 30 分钟</dt><dd>${r.count}</dd></dl>` : '',
    r.needs?.length ? `<dl><dt class="mono">前提</dt><dd class="mono">${r.needs.join(' · ')}</dd></dl>` : '',
    r.src ? `<dl><dt class="mono">出处</dt><dd>${r.src}</dd></dl>` : '',
  ].join('');
  return `<article><div class="rule"><div><div class="no mono">${r.no}</div><h3>${r.title}</h3></div><div class="meta">${meta}</div></div>
<div class="row" style="--n:${cols}">${r.panels.map((p, i) => `<figure><img src="${uri(p.img)}">${keyplan(side(p.img))}<figcaption><b><i class="mono">${i + 1}</i>${p.stage}</b>${p.cap}</figcaption></figure>`).join('')}</div></article>`;
};

const m = plate.matrix;
const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#fff;color:${INK};font-family:"Noto Sans SC","Source Han Sans SC","PingFang SC","WenQuanYi Zen Hei",sans-serif;padding:56px 60px 44px;width:1200px;box-sizing:border-box}
  .mono{font-family:"JetBrains Mono","DejaVu Sans Mono",ui-monospace,monospace;font-style:normal}
  header{display:grid;grid-template-columns:1fr 2fr;column-gap:22px;padding-bottom:30px}
  h1{font-size:25px;line-height:1.3;font-weight:600;margin:0 0 12px}
  .lede{font-size:12px;line-height:1.75;color:#444;margin:0}
  table{border-collapse:collapse;width:100%;font-size:11.5px;line-height:1.6}
  th{font-weight:400;font-size:10px;letter-spacing:.14em;color:#999;text-align:left;padding:0 12px 6px 0;border-bottom:1px solid ${INK}}
  td{padding:7px 12px 7px 0;border-bottom:1px solid ${PALE};vertical-align:top;color:#333}
  td:first-child{font-weight:600;color:${INK};white-space:nowrap}
  td i,.foot i{color:#777;margin-right:5px;font-size:10.5px}
  .foot{font-size:11px;color:#555;margin-top:8px}
  section>h2{display:flex;align-items:baseline;gap:18px;font-size:13px;font-weight:600;letter-spacing:.12em;margin:0;padding:9px 0 9px;border-top:2.5px solid ${INK}}
  section>h2 span{font-weight:400;letter-spacing:0;font-size:11.5px;color:#555}
  article{border-top:1px solid ${INK};padding:12px 0 28px}
  .rule{display:grid;grid-template-columns:1fr 2fr;column-gap:22px;align-items:start;margin-bottom:10px}
  .rule .no{font-size:10.5px;letter-spacing:.16em;color:#777}
  .rule h3{font-size:17px;line-height:1.4;font-weight:600;margin:5px 0 0}
  .meta{display:grid;grid-template-columns:5fr 4fr 2fr;column-gap:22px}
  .rule dl{margin:0;font-size:11.5px;line-height:1.65;color:#444}
  .rule dt{font-size:10px;letter-spacing:.16em;color:#999}
  .rule dd{margin:1px 0 0}
  .row{display:grid;grid-template-columns:repeat(var(--n),1fr);column-gap:22px}
  figure{margin:0;position:relative}
  figure img{display:block;width:100%;height:auto}
  .key{position:absolute;left:0;top:0;width:62px;height:62px;background:#fff;padding:0 6px 6px 0}
  figcaption{border-top:1px solid ${PALE};margin-top:6px;padding-top:7px;font-size:11.5px;line-height:1.65;color:#333}
  figcaption b{display:block;font-weight:600;font-size:11px;letter-spacing:.14em;color:${INK};margin-bottom:2px}
  figcaption b i{color:#999;margin-right:8px;font-weight:400}
  footer{border-top:1px solid ${INK};padding-top:12px;display:flex;gap:26px;font-size:10.5px;color:#555;align-items:center;flex-wrap:wrap}
  footer span{display:inline-flex;align-items:center;gap:7px}
  .sw{display:inline-block;width:15px;height:11px;box-sizing:border-box}
</style>
<header><div><h1>${plate.title}</h1><p class="lede">${plate.lede}</p></div>
<div><table><tr>${m.head.map((h) => `<th>${h}</th>`).join('')}</tr>${m.rows.map((r) => `<tr>${r.map((c) => `<td>${cell(c)}</td>`).join('')}</tr>`).join('')}</table><div class="foot">${cell(m.foot)}</div></div></header>
${plate.sections.map((s) => `<section><h2>${s.name}<span>${s.note}</span></h2>${s.rows.map(row).join('')}</section>`).join('')}
<footer><span><i class="sw" style="background:${MID};border:1.5px solid ${INK}"></i>触发的人或猫</span><span><i class="sw" style="background:${TONE};border:1.5px solid ${INK}"></i>被调动的单元（让路时是收回的带）</span><span><i class="sw" style="border:1px solid ${MID}"></i>其余落着的单元</span><span><i class="sw" style="border-top:1.5px dashed ${INK};height:0"></i>视线</span><span><i class="sw" style="border:1.5px dashed ${INK}"></i>本来要落、没有落的台</span><span>地面一格 0.83 m。01 行画到天花板，其余各行只取到 2.4 m 高</span></footer>`;
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: Number(width) / 1200 });
await pg.setContent(html);
await pg.waitForTimeout(300);
writeFileSync(resolve(out), await (await pg.$('body')).screenshot());
await br.close();
console.log(out);
