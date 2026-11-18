/**
 * 项目二 · 规则表页面（2026-11-18，作者「这些就是全部吗？你做一个表格，我们先看看」）。
 * 读同目录的 rows.txt，生成一页可筛选的表格（单个 HTML，无外部依赖）。
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

const CATS = {
  A: { name: '第一类 · 人', short: '人' },
  B: { name: '第一类 · 猫', short: '猫' },
  F: { name: '两类共用 · 目的、总则、记账', short: '共用' },
  C: { name: '第二类 · 感知', short: '感知' },
  D: { name: '第二类 · 理解', short: '理解' },
  E: { name: '第二类 · 干预', short: '干预' },
  G: { name: '其他版本', short: '其他' },
};
const ORDER = ['A', 'B', 'F', 'C', 'D', 'E', 'G'];
const STATUS = {
  now: '现行',
  solid: '只在 2-15 立体层',
  vig: '只在小样',
  opt: '研究里可切',
  ctrl: '对照用',
  old: '早一版',
  text: '只在正文或调研里',
  none: '明确没有',
};

const rows = [];
for (const line of readFileSync(join(here, 'rows.txt'), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const f = line.split('|').map((s) => s.trim());
  if (f.length < 6) throw new Error(`列数不对：${line}`);
  const [id, group, name, body, src, status, note = ''] = f;
  const cat = id[0];
  if (!CATS[cat]) throw new Error(`编号的大类不认识：${id}`);
  if (!STATUS[status]) throw new Error(`状态不认识：${id} ${status}`);
  if (/[；]|——/.test(line)) throw new Error(`有分号或破折号：${id}`);
  rows.push({ id, cat, group, name, body, src: src === '—' ? '' : src, status, note });
}
const ids = new Set();
for (const r of rows) {
  if (ids.has(r.id)) throw new Error(`编号重复：${r.id}`);
  ids.add(r.id);
}
const count = (fn) => rows.filter(fn).length;

const html = `<title>Letting Agent 规则表</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* 布局：上面一段结论和筛选条（吸顶），下面一张按大类和分组分段的表；手机上每条规则叠成一张卡。 */
:root {
  --bg: oklch(0.975 0.006 290);
  --panel: oklch(0.995 0.003 290);
  --ink: oklch(0.24 0.025 280);
  --mute: oklch(0.5 0.025 285);
  --line: oklch(0.88 0.012 288);
  --band: oklch(0.945 0.014 290);
  --accent: oklch(0.5 0.1 285);
  --accent-soft: oklch(0.93 0.035 292);
  --warn: oklch(0.55 0.11 60);
  --warn-soft: oklch(0.95 0.04 80);
  --font: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: oklch(0.2 0.02 280); --panel: oklch(0.235 0.022 280); --ink: oklch(0.93 0.012 290); --mute: oklch(0.7 0.025 288);
    --line: oklch(0.34 0.025 282); --band: oklch(0.275 0.03 282); --accent: oklch(0.8 0.085 293); --accent-soft: oklch(0.33 0.06 285);
    --warn: oklch(0.82 0.1 80); --warn-soft: oklch(0.33 0.05 70); color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: oklch(0.2 0.02 280); --panel: oklch(0.235 0.022 280); --ink: oklch(0.93 0.012 290); --mute: oklch(0.7 0.025 288);
  --line: oklch(0.34 0.025 282); --band: oklch(0.275 0.03 282); --accent: oklch(0.8 0.085 293); --accent-soft: oklch(0.33 0.06 285);
  --warn: oklch(0.82 0.1 80); --warn-soft: oklch(0.33 0.05 70); color-scheme: dark;
}
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font-family: var(--font); font-size: 15px; line-height: 1.6; }
.wrap { max-width: 1280px; margin: 0 auto; padding-block: 28px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header h1 { font-size: 26px; line-height: 1.25; margin: 0 0 6px; font-weight: 700; letter-spacing: 0.01em; text-wrap: balance; }
header p { margin: 0; color: var(--mute); max-width: 68ch; }
.answer { margin-top: 20px; display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.answer section { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; min-width: 0; }
.answer h2 { font-size: 13px; margin: 0 0 6px; color: var(--accent); font-weight: 700; letter-spacing: 0.04em; }
.answer ul { margin: 0; padding-left: 1.1em; }
.answer li { margin: 2px 0; }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); padding-block: 12px 10px; margin-top: 22px; border-bottom: 1px solid var(--line); display: grid; gap: 8px; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bg); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.chips > span { font-size: 12px; color: var(--mute); margin-right: 4px; min-width: 2.5em; }
.chip { font: inherit; font-size: 13px; line-height: 1.3; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); cursor: pointer; }
.chip b { font-weight: 400; color: var(--mute); font-variant-numeric: tabular-nums; margin-left: 4px; }
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--bg); }
.chip[aria-pressed="true"] b { color: inherit; opacity: 0.8; }
.chip:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.tools input { font: inherit; font-size: 14px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--ink); width: min(280px, 100%); }
.tools output { color: var(--mute); font-size: 13px; font-variant-numeric: tabular-nums; }
.tablewrap { overflow-x: auto; margin-top: 4px; }
table { border-collapse: collapse; width: 100%; min-width: 880px; }
thead th { text-align: left; font-size: 12px; font-weight: 600; color: var(--mute); padding: 10px 10px 6px; border-bottom: 1px solid var(--line); white-space: nowrap; }
tbody td { vertical-align: top; padding: 9px 10px; border-bottom: 1px solid var(--line); }
td.id { font-family: var(--mono); font-size: 12px; color: var(--mute); white-space: nowrap; padding-top: 12px; }
td.name { font-weight: 600; width: 13%; }
td.body { width: 42%; }
td.src, td.note { color: var(--mute); font-size: 13.5px; width: 17%; }
td.st { white-space: nowrap; }
tr.cat td { background: var(--accent); color: var(--bg); font-weight: 700; font-size: 15px; padding: 9px 12px; border-bottom: 0; }
tr.cat td small { font-weight: 400; opacity: 0.85; margin-left: 8px; font-size: 13px; }
tr.grp td { background: var(--band); font-weight: 600; font-size: 13px; padding: 6px 12px; color: var(--ink); }
tr.grp td small { color: var(--mute); font-weight: 400; margin-left: 6px; }
.pill { display: inline-block; font-size: 12px; line-height: 1.3; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--line); color: var(--mute); }
.pill.now { background: var(--accent-soft); border-color: transparent; color: var(--ink); }
.pill.none { border-style: dashed; }
.pill.solid, .pill.vig, .pill.opt, .pill.ctrl { color: var(--ink); }
.pill.old, .pill.text { background: var(--warn-soft); border-color: transparent; color: var(--warn); }
tr.is-none td.name, tr.is-none td.body { color: var(--mute); }
.empty { padding: 28px 12px; color: var(--mute); }
@media (max-width: 760px) {
  body { font-size: 15px; }
  header h1 { font-size: 22px; }
  .bar { position: static; }
  .tablewrap { overflow: visible; }
  table, tbody, tr, td { display: block; min-width: 0; width: auto; }
  thead { display: none; }
  tbody tr.row { border: 1px solid var(--line); border-radius: 6px; background: var(--panel); margin: 8px 0; padding: 10px 12px; }
  tbody tr.row td { border: 0; padding: 0; width: auto; }
  tbody tr.row td.id { float: right; padding: 0; }
  tbody tr.row td.name { font-size: 15.5px; margin-bottom: 2px; }
  tbody tr.row td.src:not(:empty)::before { content: "数从哪来　"; color: var(--mute); font-size: 12px; }
  tbody tr.row td.note:not(:empty)::before { content: "备注　"; color: var(--mute); font-size: 12px; }
  tbody tr.row td.src, tbody tr.row td.note, tbody tr.row td.st { margin-top: 5px; }
  tr.cat td { border-radius: 6px; margin-top: 18px; }
  tr.grp td { border-radius: 4px; margin-top: 10px; }
}
</style>

<div class="wrap">
  <header>
    <h1>Letting Agent 规则表</h1>
    <p>人和猫这一类关系写过的规则都在这一张表里，共 ${rows.length} 条。按两类排：人和猫自身的规则，单元怎么感知、理解、干预。每条标了数从哪来、现在在哪一版里。</p>
  </header>

  <div class="answer">
    <section>
      <h2>是不是全部</h2>
      <ul>
        <li>现行那一套（2-14 自由演示、2-15、标准场景研究）是全的，共 ${count((r) => r.status === 'now')} 条。</li>
        <li>第二类实跑核对过：八个种子各 30 分钟，1,719 次落下每次都归得到六个理由之一。</li>
        <li>第一类没有同样的核对办法，是对着代码里人和猫的每个函数逐段读出来的。</li>
      </ul>
    </section>
    <section>
      <h2>不在现行里、项目里写过的</h2>
      <ul>
        <li>只在 2-15 立体层：${count((r) => r.status === 'solid')} 条。只在小样：${count((r) => r.status === 'vig')} 条。</li>
        <li>研究里可切或对照用：${count((r) => r.status === 'opt' || r.status === 'ctrl')} 条。</li>
        <li>早一版（痕迹、Lab 2-12）：${count((r) => r.status === 'old')} 条。</li>
        <li>只在正文或调研里：${count((r) => r.status === 'text')} 条。明确没有的：${count((r) => r.status === 'none')} 条。</li>
      </ul>
    </section>
    <section>
      <h2>这张表里没有的</h2>
      <ul>
        <li>行为条文 C1–C8、H3–H4 和矩阵九格的原稿。不在仓库里，只按案例页的描述对过。</li>
        <li>单元怎么成形（键谱、收缩、锁键）。那是结构引擎的规则，只列了一行指路。</li>
        <li>场地数据和实现上的约定（家具坐标、一步之内的先后、随机数）。</li>
        <li>人狗、人与野生动物两类关系。最后只做人和猫，这两类不再列。</li>
      </ul>
    </section>
  </div>

  <div class="bar">
    <div class="chips" id="cats"><span>类别</span></div>
    <div class="chips" id="sts"><span>状态</span></div>
    <div class="tools">
      <input id="q" type="search" placeholder="搜规则，比如 桌子、引猫、3 s" aria-label="搜规则">
      <output id="n"></output>
    </div>
  </div>

  <div class="tablewrap">
    <table>
      <thead><tr><th>编号</th><th>规则</th><th>具体怎么做</th><th>数从哪来</th><th>状态</th><th>备注</th></tr></thead>
      <tbody id="tb"></tbody>
    </table>
  </div>
</div>

<script>
const ROWS = ${JSON.stringify(rows)};
const CATS = ${JSON.stringify(CATS)};
const ORDER = ${JSON.stringify(ORDER)};
const STATUS = ${JSON.stringify(STATUS)};
const state = { cat: 'all', st: new Set(Object.keys(STATUS)), q: '' };
const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function chip(parent, key, label, n, pressed, on) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.id = parent.id + '-' + key;
  b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  b.innerHTML = esc(label) + '<b>' + n + '</b>';
  b.addEventListener('click', () => on(b));
  parent.appendChild(b);
  return b;
}
function buildChips() {
  const cats = $('cats');
  const all = chip(cats, 'all', '全部', ROWS.length, true, () => setCat('all'));
  for (const c of ORDER) chip(cats, c, CATS[c].name, ROWS.filter((r) => r.cat === c).length, false, () => setCat(c));
  const sts = $('sts');
  for (const s of Object.keys(STATUS))
    chip(sts, s, STATUS[s], ROWS.filter((r) => r.status === s).length, true, (b) => {
      if (state.st.has(s)) state.st.delete(s); else state.st.add(s);
      b.setAttribute('aria-pressed', state.st.has(s) ? 'true' : 'false');
      render();
    });
  chip(sts, 'only', '只看现行', '', false, (b) => {
    const only = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', only ? 'true' : 'false');
    state.st = new Set(only ? ['now'] : Object.keys(STATUS));
    for (const s of Object.keys(STATUS)) $('sts-' + s).setAttribute('aria-pressed', state.st.has(s) ? 'true' : 'false');
    render();
  });
}
function setCat(c) {
  state.cat = c;
  for (const k of ['all', ...ORDER]) $('cats-' + k).setAttribute('aria-pressed', k === c ? 'true' : 'false');
  render();
}
function render() {
  const q = state.q.trim().toLowerCase();
  const hit = ROWS.filter((r) => (state.cat === 'all' || r.cat === state.cat) && state.st.has(r.status) && (!q || (r.id + r.group + r.name + r.body + r.src + r.note).toLowerCase().includes(q)));
  const out = [];
  let cat = '', grp = '';
  for (const r of hit) {
    if (r.cat !== cat) {
      cat = r.cat; grp = '';
      out.push('<tr class="cat"><td colspan="6">' + esc(CATS[cat].name) + '<small>' + hit.filter((x) => x.cat === cat).length + ' 条</small></td></tr>');
    }
    if (r.group !== grp) {
      grp = r.group;
      out.push('<tr class="grp"><td colspan="6">' + esc(grp) + '<small>' + hit.filter((x) => x.cat === cat && x.group === grp).length + '</small></td></tr>');
    }
    out.push('<tr class="row' + (r.status === 'none' ? ' is-none' : '') + '"><td class="id">' + r.id + '</td><td class="name">' + esc(r.name) + '</td><td class="body">' + esc(r.body) + '</td><td class="src">' + esc(r.src) + '</td><td class="st"><span class="pill ' + r.status + '">' + STATUS[r.status] + '</span></td><td class="note">' + esc(r.note) + '</td></tr>');
  }
  $('tb').innerHTML = out.length ? out.join('') : '<tr><td class="empty" colspan="6">没有符合的规则。放宽筛选试试。</td></tr>';
  $('n').textContent = '显示 ' + hit.length + ' / ' + ROWS.length + ' 条';
}
buildChips();
$('q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
render();
</script>
`;
writeFileSync(out, html);
const by = (k) => Object.fromEntries(Object.keys(k === 'cat' ? CATS : STATUS).map((c) => [c, count((r) => r[k] === c)]));
console.log(`规则 ${rows.length} 条`, JSON.stringify(by('cat')), JSON.stringify(by('status')));
