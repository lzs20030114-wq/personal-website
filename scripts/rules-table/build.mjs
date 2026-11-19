/**
 * 项目二 · 规则页（2026-11-18 起，11-19 改成直接从文档正文生成，同日按站上 /lab 深色外壳重做版式）。
 * 读 项目二_输入到输出的规则.md 里「# 第一类」到「# 附录」之间的正文，
 * 生成一页单个 HTML：人的规则、猫的规则、单元怎么感知理解干预。
 * 页面上的字和文档是同一份，改规则只改文档。版式按表头认表：
 *   [空 | 规则 | 数从哪来] → 属性表（一行一条，「条件：结果」拆成两栏，数的来源成标签）
 *   [空 | 做法 | 数]       → 动作表（同上，右栏是数）
 *   含「感知 · 理解 · 干预」 → 关系卡（三段从左到右，理解一栏首句是判定）
 *   [关系 | 现行处理]      → 读不到的关系
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

// ---------- 行内 ----------
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// 带单位的数：等宽、表格数字
const NUM = /([±≥≤]\s?)?\d+(?:\.\d+)?(?:\s?[–-]\s?\d+(?:\.\d+)?)?\s?(?:m\/s|min|cm|mm|m|s|%|°|px)(?![A-Za-z\d])/g;
const inline = (s) =>
  esc(s)
    .split(/(`[^`]+`)/)
    .map((part) =>
      part.startsWith('`')
        ? `<code>${part.slice(1, -1)}</code>`
        : part.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(NUM, (m) => `<span class="n">${m}</span>`),
    )
    .join('');
const lines = (cell) => cell.split('<br>').map((x) => x.trim()).filter(Boolean);
// 「条件：结果」：冒号出现得早、前面没有句号，才当条件
const splitCond = (line) => {
  const i = line.indexOf('：');
  if (i > 0 && i <= 26 && !line.slice(0, i).includes('。')) return [line.slice(0, i), line.slice(i + 1)];
  return [null, line];
};
const ruleLine = (line) => {
  const [c, r] = splitCond(line);
  return c
    ? `<div class="rl"><span class="if">${inline(c)}</span><span class="then">${inline(r)}</span></div>`
    : `<div class="rl rl--plain"><span class="then">${inline(r)}</span></div>`;
};
const actLine = (line) => {
  const [c, r] = splitCond(line);
  return `<p class="al">${c ? `<b>${inline(c)}</b>` : ''}${inline(r)}</p>`;
};

// ---------- 解析 ----------
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const parts = [];
let part = null;
let sec = null;
const src = body.split('\n');
for (let i = 0; i < src.length; ) {
  const line = src[i];
  if (!line.trim()) { i++; continue; }
  if (line.startsWith('# ')) {
    part = { title: line.slice(2).trim(), intro: [], sections: [] };
    parts.push(part);
    sec = null;
    i++;
    continue;
  }
  if (line.startsWith('## ')) {
    const t = line.slice(3).trim();
    sec = { num: t.match(/^(\d+)\./)?.[1] ?? '', title: t.replace(/^\d+\.\s*/, ''), blocks: [] };
    part.sections.push(sec);
    i++;
    continue;
  }
  const into = sec ? sec.blocks : part.intro;
  if (line.startsWith('|')) {
    const rows = [];
    while (i < src.length && src[i].startsWith('|')) rows.push(cells(src[i++]));
    const [head, , ...data] = rows;
    into.push({ type: 'table', head, rows: data });
    continue;
  }
  if (line.startsWith('- ')) {
    const items = [];
    while (i < src.length && src[i].startsWith('- ')) items.push(src[i++].slice(2));
    into.push({ type: 'ul', items });
    continue;
  }
  const para = [];
  while (i < src.length && src[i].trim() && !/^(#|\||- )/.test(src[i])) para.push(src[i++].trim());
  into.push({ type: 'p', text: para.join('') });
}

// ---------- 渲染 ----------
const DEF = /^\*\*([^*]+)\*\*([^：]{0,12})：(.*)$/;
const srcChips = (cell) => {
  if (!cell || cell === '—') return '<span class="none">—</span>';
  // 按「·」分开，括号里的「·」不算（出处里一串作者）
  const items = [];
  let depth = 0;
  let cur = '';
  for (const ch of cell) {
    if (ch === '（') depth++;
    if (ch === '）') depth--;
    if (ch === '·' && depth === 0) { items.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  items.push(cur.trim());
  return items
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^([^（]+)(（.*）)?$/);
      const kind = (m ? m[1] : s).trim();
      const note = m && m[2] ? m[2].slice(1, -1) : '';
      const demo = kind.startsWith('演示值');
      return `<span class="src${demo ? ' src--demo' : ''}"><b>${esc(kind)}</b>${note ? `<i>${esc(note)}</i>` : ''}</span>`;
    })
    .join('');
};
const valLines = (cell) =>
  cell === '—'
    ? '<span class="none">—</span>'
    : cell
        .split('。')
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => `<span class="v">${inline(x)}</span>`)
        .join('');

function attrTable(t, mode) {
  return `<div class="attrs">${t.rows
    .map(
      ([k, rules, third]) => `<div class="attr">
  <div class="attr-k">${inline(k)}</div>
  <div class="attr-rules">${lines(rules).map(ruleLine).join('')}</div>
  <div class="attr-${mode}">${mode === 'src' ? srcChips(third) : valLines(third)}</div>
</div>`,
    )
    .join('')}</div>`;
}

function flowTable(t) {
  const col = (name) => t.head.indexOf(name);
  const iSee = col('感知');
  const iMean = col('理解');
  const iAct = col('干预');
  const iEff = col('对人和猫的作用');
  const iRun = t.head.findIndex((h) => h.startsWith('实跑'));
  const marked = t.head[0] === '';
  return `<div class="flows${marked ? '' : ' flows--plain'}">${t.rows
    .map((r) => {
      const mean = r[iMean];
      const cut = mean.indexOf('。');
      const verdict = cut > 0 ? mean.slice(0, cut) : mean;
      const rest = cut > 0 ? mean.slice(cut + 1).trim() : '';
      const run = iRun >= 0 ? r[iRun] : '—';
      const eff = iEff >= 0 ? r[iEff] : '';
      return `<article class="flow">
  ${marked ? `<div class="flow-mark" aria-hidden="true">${esc(r[0])}</div>` : ''}
  <div class="stages">
    <section class="st st--see"><h4>感知</h4><p>${inline(r[iSee])}</p></section>
    <section class="st st--mean"><h4>理解</h4><p class="verdict">${inline(verdict)}</p>${rest ? `<p class="sub">${inline(rest)}</p>` : ''}</section>
    <section class="st st--act"><h4>干预</h4>${lines(r[iAct]).map(actLine).join('')}</section>
  </div>
  ${eff || run !== '—' ? `<footer class="flow-foot">${eff ? `<p><span class="k">对人和猫的作用</span>${inline(eff)}</p>` : '<p></p>'}${run !== '—' ? `<p class="run"><span class="k">实跑 30 分钟</span>${esc(run).replace(/\d+(?:\.\d+)?/g, (m) => `<b>${m}</b>`)}</p>` : ''}</footer>` : ''}
</article>`;
    })
    .join('')}</div>`;
}

function gapTable(t) {
  return `<div class="gaps">${t.rows
    .map(([rel, how]) => `<div class="gap"><p class="gap-rel">${inline(rel)}</p><p class="gap-how">${inline(how)}</p></div>`)
    .join('')}</div>`;
}

function plainTable(t) {
  return `<div class="tablewrap"><table><thead><tr>${t.head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${t.rows
    .map((r) => `<tr>${r.map((c) => `<td>${lines(c).map(inline).join('<br>')}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

const dlRow = (text) => {
  const m = text.match(DEF);
  const term = m[1] + m[2];
  const rTerm = /^R\d$/.test(m[1]);
  return `<div class="dl-row"><dt class="${rTerm ? 'mono' : ''}">${inline(term)}</dt><dd>${inline(m[3])}</dd></div>`;
};

function renderBlocks(blocks) {
  const html = [];
  let seenTable = false;
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k];
    if (b.type === 'table') {
      seenTable = true;
      const h = b.head;
      if (h[0] === '' && h[1] === '规则') html.push(attrTable(b, 'src'));
      else if (h[0] === '' && h[1] === '做法') html.push(attrTable(b, 'val'));
      else if (h.includes('感知') && h.includes('理解') && h.includes('干预')) html.push(flowTable(b));
      else if (h[0] === '关系') html.push(gapTable(b));
      else html.push(plainTable(b));
      continue;
    }
    if (b.type === 'ul') {
      if (b.items.every((x) => DEF.test(x))) html.push(`<dl class="dl">${b.items.map(dlRow).join('')}</dl>`);
      else html.push(`<ul class="ul">${b.items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
      continue;
    }
    // 段落
    if (b.text.startsWith('**未建模**')) {
      const i = b.text.indexOf('：');
      const items = b.text.slice(i + 1).replace(/。$/, '').split(' · ');
      html.push(`<div class="todo"><p class="todo-k">未建模 <span>调研中有</span></p><ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul></div>`);
      continue;
    }
    if (DEF.test(b.text)) {
      const run = [b.text];
      while (k + 1 < blocks.length && blocks[k + 1].type === 'p' && DEF.test(blocks[k + 1].text) && !blocks[k + 1].text.startsWith('**未建模**')) run.push(blocks[++k].text);
      html.push(`<dl class="dl dl--in">${run.map(dlRow).join('')}</dl>`);
      continue;
    }
    html.push(`<p class="${seenTable ? 'fn' : 'lede'}">${inline(b.text)}</p>`);
  }
  return html.join('\n');
}

// 目录里每节右边的数：这一节主表有几行
const countOf = (s) => s.blocks.find((b) => b.type === 'table')?.rows.length ?? s.blocks.find((b) => b.type === 'ul')?.items.length ?? 0;
const unitOf = { 1: '项', 2: '项', 3: '条', 4: '种', 5: '条', 6: '项', 7: '种' };

const nav = parts
  .map(
    (p) => `<div class="nav-group"><p class="nav-part">${esc(p.title.split(' · ')[0])}</p>${p.sections
      .map((s) => `<a href="#s${s.num}" data-s="s${s.num}"><span class="nav-n">${s.num}</span><span class="nav-t">${inline(s.title)}</span><span class="nav-c">${countOf(s)} ${unitOf[s.num] ?? ''}</span></a>`)
      .join('')}</div>`,
  )
  .join('');

const main = parts
  .map((p, pi) => {
    const [label, ...rest] = p.title.split(' · ');
    return `<div class="part" id="p${pi + 1}">
  <header class="part-h"><p class="part-label">${esc(label)}</p><h2>${inline(rest.join(' · '))}</h2>${renderBlocks(p.intro)}</header>
  ${p.sections
    .map(
      (s) => `<section class="sec" id="s${s.num}">
    <header class="sec-h"><span class="sec-n">${s.num}</span><h3>${inline(s.title)}</h3></header>
    ${renderBlocks(s.blocks)}
  </section>`,
    )
    .join('\n')}
</div>`;
  })
  .join('\n');

const today = new Date().toISOString().slice(0, 10);

const page = `<title>Letting Agent 规则表</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,300..800&family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;700&display=swap">
<style>
/* 版式：照站上 /lab 的深色外壳。左边一列吸顶目录（两类、七节，带每节条数），右边正文。
   人、猫两张属性表一行一条，左边条件、右边结果，最右是数从哪来。
   第 4、5 节每种关系一张卡，感知 → 理解 → 干预从左到右，理解一栏首句是判定。
   颜色：夜色底、奶白字，项目二的紫只用在编号与判定上，琥珀只标「读不到 / 未建模」。 */
:root {
  --bg: oklch(0.19 0.032 228);       /* 夜色 */
  --panel: oklch(0.235 0.026 220);   /* 浮起一档 */
  --panel-2: oklch(0.27 0.024 214);
  --ink: oklch(0.95 0.032 120);      /* 奶白 G100 */
  --soft: oklch(0.82 0.03 160);
  --mute: oklch(0.68 0.028 175);
  --line: oklch(0.95 0.032 120 / 0.11);
  --line-2: oklch(0.95 0.032 120 / 0.22);
  --accent: oklch(0.83 0.075 294);   /* 项目二 P300 */
  --accent-bg: oklch(0.83 0.075 294 / 0.1);
  --amber: oklch(0.83 0.12 85);      /* 读不到 / 未建模 */
  --amber-bg: oklch(0.83 0.12 85 / 0.08);
  --display: 'Archivo', 'Helvetica Neue', Arial, sans-serif;
  --sans: 'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', system-ui, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --bg: oklch(0.965 0.01 115); --panel: oklch(0.99 0.005 115); --panel-2: oklch(0.94 0.012 118);
    --ink: oklch(0.235 0.025 215); --soft: oklch(0.36 0.025 205); --mute: oklch(0.5 0.022 200);
    --line: oklch(0.235 0.025 215 / 0.12); --line-2: oklch(0.235 0.025 215 / 0.24);
    --accent: oklch(0.42 0.09 282); --accent-bg: oklch(0.42 0.09 282 / 0.07);
    --amber: oklch(0.52 0.11 70); --amber-bg: oklch(0.7 0.12 80 / 0.12);
    color-scheme: light;
  }
}
:root[data-theme="light"] {
  --bg: oklch(0.965 0.01 115); --panel: oklch(0.99 0.005 115); --panel-2: oklch(0.94 0.012 118);
  --ink: oklch(0.235 0.025 215); --soft: oklch(0.36 0.025 205); --mute: oklch(0.5 0.022 200);
  --line: oklch(0.235 0.025 215 / 0.12); --line-2: oklch(0.235 0.025 215 / 0.24);
  --accent: oklch(0.42 0.09 282); --accent-bg: oklch(0.42 0.09 282 / 0.07);
  --amber: oklch(0.52 0.11 70); --amber-bg: oklch(0.7 0.12 80 / 0.12);
  color-scheme: light;
}
* { box-sizing: border-box; }
html { scroll-padding-top: 24px; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
body { background: var(--bg); color: var(--ink); font-family: var(--sans); font-size: 15px; line-height: 1.7; -webkit-font-smoothing: antialiased; }
.wrap { max-width: 1280px; margin: 0 auto; padding-block: 40px 96px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
p { margin: 0; }
code { font-family: var(--mono); font-size: 0.82em; color: var(--soft); background: var(--panel-2); padding: 1px 5px; border-radius: 2px; overflow-wrap: anywhere; }
strong { font-weight: 600; color: var(--ink); }
.n { font-family: var(--mono); font-size: 0.88em; font-variant-numeric: tabular-nums; white-space: nowrap; letter-spacing: -0.01em; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 2px; }

/* 题头 */
.top { display: grid; gap: 14px; padding-bottom: 28px; border-bottom: 1px solid var(--line-2); }
.eyebrow { font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.08em; color: var(--mute); text-transform: uppercase; }
.eyebrow b { color: var(--accent); font-weight: 500; }
h1 { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 18px; line-height: 1.02; }
.h1-en { font-family: var(--display); font-stretch: 68%; font-weight: 300; font-size: clamp(44px, 7vw, 84px); letter-spacing: -0.01em; }
.h1-zh { font-family: var(--sans); font-weight: 700; font-size: clamp(28px, 4vw, 44px); }
.top-lede { max-width: 62ch; color: var(--soft); font-size: 16px; }
.legend { display: flex; flex-wrap: wrap; gap: 8px 22px; font-size: 12.5px; color: var(--mute); }
.legend span { display: inline-flex; align-items: center; gap: 8px; }
.legend .src { margin: 0; }

/* 两栏：目录 + 正文 */
.layout { display: grid; grid-template-columns: 228px minmax(0, 1fr); gap: 56px; margin-top: 32px; align-items: start; }
nav { position: sticky; top: calc(env(safe-area-inset-top, 0px) + 24px); display: grid; gap: 22px; }
.nav-part { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; color: var(--mute); margin-bottom: 6px; }
.nav-group { display: grid; }
nav a { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; align-items: baseline; padding: 6px 0 6px 10px; color: var(--soft); text-decoration: none; font-size: 13.5px; line-height: 1.4; border-left: 2px solid var(--line); transition: color 160ms, border-color 160ms; }
nav a:hover { color: var(--ink); border-left-color: var(--line-2); }
nav a.on { color: var(--ink); border-left-color: var(--accent); }
.nav-n { font-family: var(--mono); font-size: 12px; color: var(--mute); }
nav a.on .nav-n { color: var(--accent); }
.nav-c { font-family: var(--mono); font-size: 11px; color: var(--mute); font-variant-numeric: tabular-nums; white-space: nowrap; }
main { min-width: 0; display: grid; gap: 72px; }

/* 两类 */
.part { display: grid; gap: 56px; }
.part-h { display: grid; gap: 8px; }
.part-label { font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; color: var(--accent); }
.part-h h2 { margin: 0; font-size: clamp(24px, 3vw, 32px); font-weight: 700; line-height: 1.25; text-wrap: balance; }
.part-h .lede { color: var(--soft); max-width: 62ch; }

/* 节 */
.sec { display: grid; gap: 18px; scroll-margin-top: 24px; }
.sec-h { display: flex; align-items: baseline; gap: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--line-2); }
.sec-n { font-family: var(--display); font-stretch: 68%; font-weight: 300; font-size: 44px; line-height: 0.9; color: var(--accent); font-variant-numeric: tabular-nums; }
.sec-h h3 { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.3; text-wrap: balance; }
.lede { color: var(--soft); max-width: 66ch; }
.fn { color: var(--mute); font-size: 13px; max-width: 72ch; }

/* 属性表：一行一条 */
.attrs { display: grid; border-top: 1px solid var(--line); }
.attr { display: grid; grid-template-columns: 7.5em minmax(0, 1fr) 13.5em; gap: 0 24px; padding: 14px 0 16px; border-bottom: 1px solid var(--line); }
.attr-k { font-weight: 700; font-size: 15px; line-height: 1.6; }
.attr-rules { display: grid; gap: 6px; min-width: 0; }
.rl { display: grid; grid-template-columns: minmax(0, 12em) minmax(0, 1fr); gap: 0 16px; font-size: 14.5px; line-height: 1.6; }
.rl--plain .then { grid-column: 1 / -1; }
.rl .if { color: var(--mute); font-size: 13.5px; }
.rl .if strong { color: var(--soft); }
.attr-src, .attr-val { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 6px; }
.attr-val { flex-direction: column; gap: 4px; }
.attr-val .v { font-size: 13px; color: var(--soft); line-height: 1.5; }
.src { display: inline-flex; flex-direction: column; gap: 1px; padding: 4px 8px 5px; border: 1px solid var(--line-2); border-radius: 3px; font-size: 12px; line-height: 1.35; max-width: 100%; }
.src b { font-weight: 500; color: var(--soft); }
.src i { font-style: normal; color: var(--mute); font-size: 11px; }
.src--demo { border-style: dashed; }
.none { color: var(--mute); }

/* 未建模 */
.todo { display: grid; grid-template-columns: 7.5em minmax(0, 1fr); gap: 0 24px; padding: 14px 16px; background: var(--amber-bg); border-radius: 3px; }
.todo-k { font-weight: 700; color: var(--amber); font-size: 14px; line-height: 1.6; }
.todo-k span { display: block; font-weight: 400; font-size: 12px; color: var(--mute); }
.todo ul { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px 8px; align-content: flex-start; }
.todo li { font-size: 13.5px; color: var(--soft); padding: 2px 10px; border: 1px dashed color-mix(in oklch, var(--amber) 55%, transparent); border-radius: 999px; }

/* 定义列 */
.dl { margin: 0; display: grid; border-top: 1px solid var(--line); }
.dl-row { display: grid; grid-template-columns: 9em minmax(0, 1fr); gap: 0 24px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.dl dt { font-weight: 700; font-size: 14.5px; }
.dl dt.mono { font-family: var(--mono); font-weight: 600; color: var(--accent); }
.dl dd { margin: 0; color: var(--soft); font-size: 14.5px; max-width: 70ch; }
.dl--in { border-top: 0; }
.dl--in .dl-row { border-bottom: 0; padding: 4px 0; }
.ul { margin: 0; padding-left: 1.2em; color: var(--soft); }

/* 关系卡：感知 → 理解 → 干预 */
.flows { display: grid; gap: 12px; }
.flow { display: grid; grid-template-columns: 56px minmax(0, 1fr); background: var(--panel); border: 1px solid var(--line); border-radius: 4px; overflow: hidden; }
.flows--plain .flow { grid-template-columns: minmax(0, 1fr); }
.flow-mark { grid-row: 1 / span 2; display: flex; justify-content: center; padding-top: 18px; font-size: 26px; line-height: 1; color: var(--accent); border-right: 1px solid var(--line); background: var(--accent-bg); }
.stages { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1.45fr); }
.st { position: relative; padding: 16px 20px 18px; display: grid; align-content: start; gap: 6px; min-width: 0; }
.st + .st { border-left: 1px solid var(--line); }
.st + .st::before { content: ""; position: absolute; left: -6px; top: 22px; width: 10px; height: 10px; background: var(--panel); border-top: 1px solid var(--line-2); border-right: 1px solid var(--line-2); transform: rotate(45deg); }
.st h4 { margin: 0 0 2px; font-family: var(--mono); font-size: 11px; font-weight: 500; letter-spacing: 0.08em; color: var(--mute); }
.st p { font-size: 14px; line-height: 1.6; }
.st--see p { color: var(--soft); }
.st .verdict { font-weight: 700; font-size: 16px; color: var(--accent); line-height: 1.45; }
.st--mean .sub { color: var(--soft); }
.al { color: var(--ink); }
.al b { font-weight: 600; color: var(--soft); }
.al b::after { content: "："; }
.flow-foot { grid-column: 2; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 24px; padding: 10px 20px; border-top: 1px solid var(--line); background: var(--panel-2); font-size: 13px; color: var(--soft); }
.flows--plain .flow-foot { grid-column: 1; }
.flow-foot .k { font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; color: var(--mute); margin-right: 10px; }
.flow-foot .run { font-variant-numeric: tabular-nums; }
.flow-foot .run b { font-family: var(--mono); font-weight: 600; color: var(--ink); font-size: 14px; }

/* 读不到的关系 */
.gaps { display: grid; border-top: 1px solid var(--line); }
.gap { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 32px; padding: 12px 0 12px 22px; border-bottom: 1px solid var(--line); position: relative; }
.gap::before { content: ""; position: absolute; left: 2px; top: 20px; width: 8px; height: 8px; border: 1.5px solid var(--amber); border-radius: 50%; }
.gap-rel { font-size: 14.5px; }
.gap-how { color: var(--soft); font-size: 14px; }

.tablewrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 3px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid var(--line); }
th { font-family: var(--mono); font-size: 11px; font-weight: 500; color: var(--mute); }

.foot { margin-top: 80px; padding-top: 18px; border-top: 1px solid var(--line-2); display: flex; flex-wrap: wrap; gap: 6px 24px; font-size: 12.5px; color: var(--mute); }
.foot code { font-size: 11.5px; }

@media (max-width: 1080px) {
  .layout { grid-template-columns: minmax(0, 1fr); gap: 32px; }
  nav { position: static; display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin; }
  .nav-group { display: flex; gap: 6px; align-items: center; flex: none; }
  .nav-part { margin: 0 4px 0 0; white-space: nowrap; }
  nav a { grid-template-columns: auto auto; border: 1px solid var(--line-2); border-radius: 999px; padding: 4px 12px; white-space: nowrap; }
  nav a.on { border-color: var(--accent); }
  .nav-c { display: none; }
  .attr { grid-template-columns: 7em minmax(0, 1fr); }
  .attr-src, .attr-val { grid-column: 2; margin-top: 10px; }
  .attr-val { flex-direction: row; flex-wrap: wrap; gap: 4px 14px; }
}
@media (max-width: 760px) {
  .wrap { padding-block: 24px 64px; }
  main { gap: 56px; }
  .attr { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .attr-src, .attr-val { grid-column: 1; margin-top: 4px; }
  .rl { grid-template-columns: minmax(0, 1fr); }
  .rl .if { font-size: 12.5px; }
  .todo { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .dl-row { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .flow { grid-template-columns: minmax(0, 1fr); }
  .flow-mark { grid-row: auto; justify-content: flex-start; padding: 12px 16px; border-right: 0; border-bottom: 1px solid var(--line); font-size: 22px; }
  .stages { grid-template-columns: minmax(0, 1fr); }
  .st { padding: 14px 16px 16px; }
  .st + .st { border-left: 0; border-top: 1px solid var(--line); }
  .st + .st::before { left: 22px; top: -6px; transform: rotate(135deg); }
  .flow-foot { grid-column: 1; padding: 10px 16px; }
  .gap { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .sec-n { font-size: 36px; }
}
@media (prefers-reduced-motion: reduce) { nav a { transition: none; } }
</style>

<div class="wrap">
  <header class="top">
    <p class="eyebrow"><b>Project II</b> · 规则 · 现行「走 · 站 · 坐」</p>
    <h1><span class="h1-en">Letting Agent</span><span class="h1-zh">规则表</span></h1>
    <p class="top-lede">人和猫各自按什么规则动，单元读到什么、判定成什么、怎样动。每条写成条件和结果。</p>
    <div class="legend" aria-label="读法">
      <span>属性表左栏是条件，右栏是结果</span>
      <span><span class="src"><b>资料</b></span>有出处</span>
      <span><span class="src src--demo"><b>演示值</b></span>没有数据，先给一个能跑的数</span>
    </div>
  </header>
  <div class="layout">
    <nav aria-label="章节">${nav}</nav>
    <main>
${main}
    </main>
  </div>
  <footer class="foot">
    <span>字与仓库 <code>项目二_输入到输出的规则.md</code> 正文第 1–7 节是同一份</span>
    <span>查证、建议补写、待定的事在那份文档的附录</span>
    <span>生成于 ${today}</span>
  </footer>
</div>
<script>
// 目录读位：正文里哪一节过了视口上三分之一，目录里那一项亮起
(() => {
  const links = [...document.querySelectorAll('nav a[data-s]')];
  const secs = links.map((a) => document.getElementById(a.dataset.s)).filter(Boolean);
  const mark = () => {
    const y = innerHeight * 0.32;
    let cur = secs[0];
    for (const s of secs) if (s.getBoundingClientRect().top <= y) cur = s;
    for (const a of links) a.classList.toggle('on', a.dataset.s === cur.id);
  };
  let raf = 0;
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; mark(); }); }, { passive: true });
  addEventListener('resize', mark);
  mark();
})();
</script>
`;
writeFileSync(out, page);
const n = parts.reduce((a, p) => a + p.sections.length, 0);
console.log(`两类，章节 ${n} 个，写出 ${out}`);
