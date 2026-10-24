import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { FIELD_GLYPHS, fieldGlyphSvg } from '../../src/lib/site/field-glyphs.ts';
import { FIELD_KINDS, FIELD_PROJECTS, fieldColors } from '../../src/lib/site/field-visuals.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
const destination = resolve(root, 'public/home/icons');
const review = resolve(root, 'design-ref/home-field-icons');
await mkdir(destination, { recursive: true });
await mkdir(review, { recursive: true });
for (const key of Object.keys(FIELD_GLYPHS)) {
  await writeFile(resolve(destination, `${key}.svg`), fieldGlyphSvg(key) + '\n');
}

// The review uses the same model and content readers as app/page.tsx.
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
let field;
try {
  const { buildCards, buildHomeField } = await server.ssrLoadModule('/src/lib/site/home-model.ts');
  const { getAllWork } = await server.ssrLoadModule('/src/lib/site/content.ts');
  const { getLogEntries } = await server.ssrLoadModule('/src/lib/site/log.ts');
  const cards = buildCards(getAllWork().map(w => ({ ...w, published: w.status === 'published' })));
  field = buildHomeField(cards, getLogEntries());
} finally {
  await server.close();
}
await writeFile(resolve(review, 'manifest.json'), JSON.stringify(field.pool, null, 2) + '\n');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const projectNames = { 'project-i': '项目 I · 轮回机器', 'project-ii': '项目 II · 跨物种空间', 'project-iii': '项目 III · 睡眠研究', 'other-work': '其他工作 · 智能床', 'this-site': '本站', about: '个人介绍' };
const kindNames = { project: '主项目', lab: '实验', log: '工作日志', other: '其他工作', about: '个人介绍' };
const tiles = field.pool.map(item => {
  const { ink, surface } = fieldColors(item.project, item.kind);
  const key = item.img.split('/').pop().replace('.svg', '');
  const svg = fieldGlyphSvg(key).replace('color="#fff"', `color="${ink}"`);
  return `<article class="tile" data-kind="${item.kind}" data-project="${item.project}" style="--ink:${ink};--surface:${surface}"><div class="art"><span class="kind">${kindNames[item.kind]}</span>${svg}<span class="mini">${svg}</span></div><div class="copy"><small>${esc(item.no)} · ${esc(projectNames[item.project])}</small><h2>${esc(item.title)}</h2><p>${esc(item.cap)}</p></div></article>`;
}).join('\n');
const options = (items, labels) => Object.keys(items).map(k => `<option value="${k}">${labels[k]}</option>`).join('');
const swatches = Object.entries(FIELD_PROJECTS).map(([key, p]) => `<span style="--ink:${p.ink};--surface:${p.surface}"><i></i>${projectNames[key]}</span>`).join('');
const glyphs = Object.keys(FIELD_GLYPHS).map(key => `<div>${fieldGlyphSvg(key).replace('color="#fff"', 'color="#bed5ae"')}<small>${key}</small></div>`).join('');
await writeFile(resolve(review, 'preview.html'), `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Field Icons · 全内容图标</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0b171d;color:#e3e6ce;font:14px/1.6 system-ui,sans-serif}main{max-width:1400px;margin:auto;padding:56px 40px}header{border-top:1px solid #43504b;padding-top:24px}h1{font-size:38px;letter-spacing:-1.4px;margin:12px 0}header p{color:#a7b2a8;max-width:820px}small,.eyebrow,.kind{font:11px/1.5 ui-monospace,monospace}label{color:#b9c4b7;font-size:12px}select,input{font:inherit;background:#16232a;color:#e3e6ce;border:1px solid #43504b;border-radius:2px;padding:8px 10px}nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:24px 0}#count{margin-left:auto}.swatches{display:flex;gap:22px;flex-wrap:wrap;margin:24px 0}.swatches span{display:flex;align-items:center;gap:8px;color:var(--ink);font-size:12px}.swatches i{width:16px;height:16px;background:var(--surface);border:1px solid var(--ink)}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(205px,1fr));gap:12px}.tile{border:1px solid #304039;overflow:hidden;border-radius:2px}.tile[hidden]{display:none}.art{height:150px;background:var(--surface);position:relative;display:grid;place-items:center}.art>svg{width:76px;height:76px}.kind{position:absolute;top:12px;left:14px;color:var(--ink);opacity:.8}.mini{position:absolute;bottom:12px;right:12px;width:32px;height:32px;border:1px solid #ffffff16}.mini svg{width:100%;height:100%}.copy{padding:16px}.copy small{color:var(--ink)}h2{font-size:14px;line-height:1.5;margin:8px 0;color:#e3e6ce;font-weight:500}.copy p{color:#8e9d95;font-size:11px;margin:0;line-height:1.5}.tile[data-kind=log] .art{background:color-mix(in srgb,var(--surface) 60%,#08141c)}.tile[data-kind=lab] .art{background:color-mix(in srgb,var(--surface) 82%,#08141c)}.masters{margin-top:60px;border-top:1px solid #43504b;padding-top:24px}.masters-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px}.masters-grid div{text-align:center;padding:16px 4px;background:#14251f}.masters svg{display:block;width:48px;height:48px;margin:0 auto 10px}.masters small{color:#93a78f}footer{margin-top:32px;color:#8e9d95;font-size:12px}@media(max-width:600px){main{padding:24px 16px}h1{font-size:28px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.art{height:125px}.copy{padding:12px}#count{margin:0}}
</style><main><header><div class="eyebrow">ZISHUO LI / FIELD ICONS / 2026.10.24</div><h1>同一套图标，覆盖全部内容。</h1><p>48 × 48 网格、统一线宽、平面符号。项目决定色系；主项目、实验和日志通过亮度与角标区分。同主题日志复用语义图标，每条记录仍保留自己的标题和入口。右下角展示 32 px 小尺寸。</p></header><div class="swatches">${swatches}</div><nav><label>项目 <select id="project"><option value="all">全部</option>${options(FIELD_PROJECTS,projectNames)}</select></label><label>类型 <select id="kind"><option value="all">全部</option>${options(FIELD_KINDS,kindNames)}</select></label><input id="search" type="search" placeholder="按标题或编号查找" aria-label="按标题或编号查找"><small id="count"></small></nav><section class="grid">${tiles}</section><section class="masters"><h2>${Object.keys(FIELD_GLYPHS).length} 个图标母版 · 48 px</h2><div class="masters-grid">${glyphs}</div></section><footer>本页由首页实际内容池生成，共 ${field.pool.length} 个入口；尚未发布的项目 III 保留筹备状态。图标是内容索引，不作为实物或研究结果的证明。</footer></main><script>
const project=document.querySelector('#project'),kind=document.querySelector('#kind'),search=document.querySelector('#search'),tiles=[...document.querySelectorAll('.tile')];
function filter(){let n=0;for(const t of tiles){t.hidden=!((project.value==='all'||t.dataset.project===project.value)&&(kind.value==='all'||t.dataset.kind===kind.value)&&t.textContent.toLowerCase().includes(search.value.toLowerCase()));if(!t.hidden)n++}document.querySelector('#count').textContent=n+' / '+tiles.length+' 个入口'}
for(const el of [project,kind,search])el.addEventListener('input',filter);filter();
</script></html>`);
console.log(`Generated ${Object.keys(FIELD_GLYPHS).length} SVG masters and ${field.pool.length} content previews.`);
