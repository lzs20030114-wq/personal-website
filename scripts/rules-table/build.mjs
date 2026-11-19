/**
 * 项目二 · 规则页（2026-11-18 起，11-19 改成直接从文档正文生成）。
 * 读 项目二_输入到输出的规则.md 里「# 第一类」到「# 附录」之间的正文，
 * 生成一页单个 HTML（无外部依赖）：人的规则、猫的规则、单元怎么感知理解干预。
 * 页面上的字和文档是同一份，改规则只改文档。
 * 用法：node scripts/rules-table/build.mjs <out.html>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) {
  console.error('用法：node scripts/rules-table/build.mjs <out.html>');
  process.exit(1);
}

const doc = readFileSync(join(here, '../../项目二_输入到输出的规则.md'), 'utf8');
const start = doc.indexOf('\n# 第一类');
const end = doc.indexOf('\n# 附录');
if (start < 0 || end < 0 || end < start) throw new Error('文档里找不到「# 第一类」到「# 附录」这一段');
const body = doc.slice(start, end).replace(/\n---\s*$/, '');
if (/[；]|——/.test(body)) throw new Error('正文里有分号或破折号');

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
// 表格一格里的「<br>」= 一条规则一行
const cell = (s) => {
  const parts = s.split('<br>');
  return parts.length > 1 ? parts.map((x) => `<span class="ln">${inline(x.trim())}</span>`).join('') : inline(s);
};
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

const html = [];
const toc = [];
let part = 0;
const lines = body.split('\n');
for (let i = 0; i < lines.length; ) {
  const line = lines[i];
  if (!line.trim()) { i++; continue; }
  if (line.startsWith('# ')) {
    part++;
    const t = line.slice(2).trim();
    html.push(`${part > 1 ? '</section>' : ''}<section class="part" id="p${part}"><h2 class="part-h">${inline(t)}</h2>`);
    i++;
    continue;
  }
  if (line.startsWith('## ')) {
    const t = line.slice(3).trim();
    const n = t.match(/^(\d+)\./)?.[1] ?? '';
    const id = 's' + (n || toc.length + 1);
    toc.push({ id, t: t.replace(/^\d+\.\s*/, ''), n });
    html.push(`<h3 id="${id}">${inline(t)}</h3>`);
    i++;
    continue;
  }
  if (line.startsWith('|')) {
    const rows = [];
    while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]));
    const [head, , ...data] = rows;
    const lead = head[0] === '';
    const cls = `cols${head.length}${lead ? ' lead' : ''}`;
    const th = head.map((h) => `<th>${inline(h)}</th>`).join('');
    const tr = data
      .map(
        (r) =>
          '<tr>' +
          r.map((c, k) => `<td${head[k] ? ` data-label="${esc(head[k])}"` : ''}${k === 0 ? ' class="first"' : ''}>${cell(c)}</td>`).join('') +
          '</tr>',
      )
      .join('');
    html.push(`<div class="tablewrap"><table class="${cls}"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`);
    continue;
  }
  if (line.startsWith('- ')) {
    const items = [];
    while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
    html.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
    continue;
  }
  const para = [];
  while (i < lines.length && lines[i].trim() && !/^(#|\||- )/.test(lines[i])) para.push(lines[i++].trim());
  html.push(`<p>${inline(para.join(''))}</p>`);
}
html.push('</section>');

const page = `<title>Letting Agent 规则表</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* 布局：标题 + 一行章节目录（吸顶），下面按文档正文排：人、猫两张属性表，单元的感知 → 理解 → 干预表与配套几节。手机上表格叠成卡片。 */
:root {
  --bg: oklch(0.975 0.006 290);
  --panel: oklch(0.995 0.003 290);
  --ink: oklch(0.24 0.025 280);
  --mute: oklch(0.5 0.025 285);
  --line: oklch(0.88 0.012 288);
  --band: oklch(0.945 0.014 290);
  --accent: oklch(0.5 0.1 285);
  --font: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: oklch(0.2 0.02 280); --panel: oklch(0.235 0.022 280); --ink: oklch(0.93 0.012 290); --mute: oklch(0.7 0.025 288);
    --line: oklch(0.34 0.025 282); --band: oklch(0.275 0.03 282); --accent: oklch(0.8 0.085 293);
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: oklch(0.2 0.02 280); --panel: oklch(0.235 0.022 280); --ink: oklch(0.93 0.012 290); --mute: oklch(0.7 0.025 288);
  --line: oklch(0.34 0.025 282); --band: oklch(0.275 0.03 282); --accent: oklch(0.8 0.085 293);
  color-scheme: dark;
}
* { box-sizing: border-box; }
html { scroll-padding-top: 64px; }
body { background: var(--bg); color: var(--ink); font-family: var(--font); font-size: 15px; line-height: 1.65; }
.wrap { max-width: 1240px; margin: 0 auto; padding-block: 28px 72px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header h1 { font-size: 26px; line-height: 1.25; margin: 0 0 6px; font-weight: 700; letter-spacing: 0.01em; text-wrap: balance; }
header p { margin: 0; color: var(--mute); max-width: 70ch; }
nav { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); margin-top: 18px; padding-block: 10px; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 6px; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
nav a { font-size: 13px; line-height: 1.3; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); text-decoration: none; }
nav a b { font-weight: 400; color: var(--mute); margin-right: 4px; font-variant-numeric: tabular-nums; }
nav a:hover { border-color: var(--accent); }
nav a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.part { margin-top: 36px; }
.part-h { font-size: 13px; letter-spacing: 0.06em; color: var(--accent); font-weight: 700; margin: 0 0 4px; padding-bottom: 6px; border-bottom: 2px solid var(--accent); }
h3 { font-size: 19px; line-height: 1.35; margin: 26px 0 8px; font-weight: 700; }
p, ul { max-width: 78ch; margin: 8px 0; }
ul { padding-left: 1.2em; }
li { margin: 3px 0; }
code { font-family: var(--mono); font-size: 0.86em; background: var(--band); padding: 1px 5px; border-radius: 3px; overflow-wrap: anywhere; }
strong { font-weight: 650; }
.tablewrap { overflow-x: auto; margin: 12px 0 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; }
table { border-collapse: collapse; width: 100%; }
table.cols6 { min-width: 980px; }
table.cols5 { min-width: 760px; }
thead th { text-align: left; font-size: 12.5px; font-weight: 600; color: var(--mute); padding: 10px 12px 7px; border-bottom: 1px solid var(--line); background: var(--band); vertical-align: bottom; }
tbody td { vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.ln { display: block; }
.ln + .ln { margin-top: 5px; }
tbody tr:last-child td { border-bottom: 0; }
table.lead td.first { font-weight: 650; white-space: nowrap; }
table.lead.cols6 td.first { font-size: 17px; color: var(--accent); }
table.cols3.lead td:last-child, table.cols2 td:last-child { color: var(--mute); font-size: 14px; }
table.cols3.lead td:nth-child(2) { width: 68%; }
table.cols6 td:nth-child(2) { width: 17%; }
table.cols6 td:nth-child(3) { width: 21%; }
table.cols6 td:nth-child(4) { width: 27%; }
table.cols6 td:nth-child(6) { color: var(--mute); font-size: 14px; width: 11%; }
table.cols4 td:last-child, table.cols5 td:last-child { color: var(--mute); font-size: 14px; }
@media (max-width: 760px) {
  header h1 { font-size: 22px; }
  nav { position: static; }
  .tablewrap { overflow: visible; background: none; border: 0; }
  table, thead, tbody, tr, td { display: block; min-width: 0 !important; width: auto !important; }
  thead { display: none; }
  tbody tr { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; margin: 8px 0; padding: 10px 12px; }
  tbody td { border: 0; padding: 0; margin-top: 6px; }
  tbody td.first { margin-top: 0; }
  td[data-label]::before { content: attr(data-label); display: block; font-size: 12px; color: var(--mute); }
  table.lead td.first { font-size: 16px; }
  table:not(.lead) td.first { font-weight: 650; }
  table:not(.lead) td.first::before { font-weight: 400; }
}
</style>

<div class="wrap">
  <header>
    <h1>Letting Agent 规则表</h1>
    <p>人和猫各自的规则，单元怎么感知、理解、干预它们。字和仓库里的「项目二_输入到输出的规则.md」正文是同一份。查证、建议补写、待定的事在那份文档的附录里。</p>
  </header>
  <nav aria-label="章节">${toc.map((x) => `<a href="#${x.id}"><b>${x.n}</b>${inline(x.t)}</a>`).join('')}</nav>
  ${html.join('\n')}
</div>
`;
writeFileSync(out, page);
console.log(`章节 ${toc.length} 个，表格 ${(page.match(/<table/g) || []).length} 张`);
