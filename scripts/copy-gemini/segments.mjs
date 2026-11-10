// 案例页正文（MDX）拆段：哪些行原样保留、哪些文字段可以交给模型改写，改完怎么原样拼回去。
// 纯函数，零依赖，不碰网络与文件。run.mjs 用它，segments.test.mjs 守门。
//
// 设计要点：
//   - 结构靠「构造」保证：重建时只替换文字段那几行，其余行逐字节照抄（含 CRLF / LF 原样）。
//     所以 h2 数、图插槽编号与顺序天然不变——content.test.ts 仍是最后一道关。
//   - 原样保留：frontmatter、{/* */} 注释、组件标签行（含多行属性）、表格、代码块、空行。
//   - 文字段：普通段落、列表项、引用；标题只在调用方明确要改时才发出去。
//   - 段内要保护的片段（链接 / 日志锚点、行内代码、行内标签、{表达式}、**加粗术语**）
//     换成 ⟦n⟧ 占位符再发，回来按编号还原；占位符对不上的段落退回原文。

/** 这些容器里面的文字不改：Todo = 作者的待补清单（只在本地显示）；ResearchQuestion = 研究问题本身。 */
export const SKIP_CONTAINERS = ['Todo', 'ResearchQuestion'];

/** 整节跳过的 h2（参考文献是条目格式，不是散文）。按标题全文匹配。 */
export const SKIP_SECTIONS = [/^(References|参考文献)$/];

/** 第 0 节 = 第一个 h2 之前的开篇（Lead / Accent / 开篇段）。 */
export const OPENING_TITLE = '(开篇)';

/**
 * 把 MDX 拆成块。每块要么是 raw（原样保留的若干行），要么是 text（一段可改写的文字）。
 * text 块：{ type, kind: 'para'|'item'|'quote'|'heading', level?, prefix, text, lines, section, containers }
 */
export function parseMdx(src) {
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const lines = src.split(eol);
  const blocks = [];
  const sections = [{ index: 0, title: OPENING_TITLE }];
  const stack = []; // 当前所在的容器组件名
  let i = 0;

  const raw = (from, to) => blocks.push({ type: 'raw', lines: lines.slice(from, to) });
  const text = (b, from, to) =>
    blocks.push({
      type: 'text',
      ...b,
      lines: lines.slice(from, to),
      section: sections.length - 1,
      containers: [...stack],
    });

  // frontmatter：只认文件第一行的 ---
  if (lines[0] === '---') {
    let j = 1;
    while (j < lines.length && lines[j] !== '---') j++;
    raw(0, Math.min(j + 1, lines.length));
    i = j + 1;
  }

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    // 空行
    if (t === '') {
      raw(i, i + 1);
      i++;
      continue;
    }

    // MDX 注释 {/* … */}，可跨行
    if (t.startsWith('{/*')) {
      let j = i;
      while (j < lines.length && !lines[j].includes('*/}')) j++;
      raw(i, Math.min(j + 1, lines.length));
      i = j + 1;
      continue;
    }

    // 围栏代码块
    if (t.startsWith('```') || t.startsWith('~~~')) {
      const fence = t.slice(0, 3);
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith(fence)) j++;
      raw(i, Math.min(j + 1, lines.length));
      i = j + 1;
      continue;
    }

    // 表格（连续的 | 行）
    if (t.startsWith('|')) {
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|')) j++;
      raw(i, j);
      i = j;
      continue;
    }

    // 闭合标签 </Tag>
    const close = /^<\/([A-Za-z][\w.]*)\s*>$/.exec(t);
    if (close) {
      if (stack[stack.length - 1] === close[1]) stack.pop();
      raw(i, i + 1);
      i++;
      continue;
    }

    // 组件开标签（可能多行属性、可能自闭合）
    if (/^<[A-Za-z]/.test(t)) {
      const name = /^<([A-Za-z][\w.]*)/.exec(t)[1];
      const end = scanTagEnd(lines, i, line.indexOf('<'));
      const endLine = end ? end.line : lines.length - 1;
      raw(i, endLine + 1);
      if (end && !end.selfClosing) {
        // 开标签之后同一行还有东西（如 <b>x</b> 一整行）就不当容器
        const rest = lines[endLine].slice(end.col + 1).trim();
        if (rest === '') stack.push(name);
      }
      i = endLine + 1;
      continue;
    }

    // 标题
    const h = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (h) {
      const level = h[1].length;
      if (level === 2) sections.push({ index: sections.length, title: h[2] });
      text({ kind: 'heading', level, prefix: line.slice(0, line.indexOf(h[2])), text: h[2] }, i, i + 1);
      i++;
      continue;
    }

    // 列表项（续行 = 缩进且不是新列表项的非空行）
    const item = /^(\s*(?:[-*+]|\d+\.)\s+)(.*)$/.exec(line);
    if (item) {
      let j = i + 1;
      const parts = [item[2]];
      while (j < lines.length && /^\s+\S/.test(lines[j]) && !/^\s*(?:[-*+]|\d+\.)\s+/.test(lines[j])) {
        parts.push(lines[j].trim());
        j++;
      }
      text({ kind: 'item', prefix: item[1], text: parts.join(' ') }, i, j);
      i = j;
      continue;
    }

    // 引用
    const quote = /^(\s*>\s?)(.*)$/.exec(line);
    if (quote) {
      text({ kind: 'quote', prefix: quote[1], text: quote[2] }, i, i + 1);
      i++;
      continue;
    }

    // 普通段落：连续的非空行，直到遇到别的结构
    let j = i + 1;
    while (j < lines.length && lines[j].trim() !== '' && !startsConstruct(lines[j])) j++;
    text({ kind: 'para', prefix: '', text: lines.slice(i, j).map((l) => l.trim()).join(' ') }, i, j);
    i = j;
  }

  blocks.forEach((b, n) => {
    if (b.type === 'text') b.id = `s${n}`;
  });
  return { eol, blocks, sections };
}

function startsConstruct(line) {
  const t = line.trim();
  return (
    t.startsWith('{/*') ||
    t.startsWith('```') ||
    t.startsWith('|') ||
    t.startsWith('<') ||
    /^#{1,6}\s/.test(t) ||
    /^(?:[-*+]|\d+\.)\s+/.test(t) ||
    t.startsWith('>')
  );
}

/** 从 (line, col) 处的 '<' 开始，找到开标签结束的 '>'（引号与 {} 里的 '>' 不算）。 */
function scanTagEnd(lines, line, col) {
  let quote = null;
  let brace = 0;
  for (let l = line; l < lines.length; l++) {
    const s = lines[l];
    for (let c = l === line ? col + 1 : 0; c < s.length; c++) {
      const ch = s[c];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '{') brace++;
      else if (ch === '}') brace = Math.max(0, brace - 1);
      else if (ch === '>' && brace === 0) return { line: l, col: c, selfClosing: s[c - 1] === '/' };
    }
  }
  return null;
}

/** 这一段为什么不发出去；返回 null = 可以改。 */
export function skipReason(block, sections, { headings = false } = {}) {
  if (block.type !== 'text') return 'raw';
  const box = block.containers.find((c) => SKIP_CONTAINERS.includes(c));
  if (box) return `在 <${box}> 里`;
  const title = sections[block.section]?.title ?? '';
  if (SKIP_SECTIONS.some((re) => re.test(title))) return `「${title}」整节不改`;
  if (block.kind === 'heading' && !headings) return '标题（加 --headings 才改）';
  if (block.text.trim() === '') return '空';
  return null;
}

/** 选出要发给模型的段。sections = 要改的节号集合（省略 = 全部）。 */
export function selectSegments(parsed, { headings = false, sections = null } = {}) {
  return parsed.blocks.filter(
    (b) =>
      b.type === 'text' &&
      skipReason(b, parsed.sections, { headings }) === null &&
      (sections === null || sections.has(b.section)),
  );
}

/** 用改好的文字（Map: id → text）重建全文。没有改的段逐字节照抄原行。 */
export function rebuild(parsed, rewrites = new Map()) {
  const out = [];
  for (const b of parsed.blocks) {
    if (b.type === 'text' && rewrites.has(b.id)) out.push(b.prefix + rewrites.get(b.id));
    else out.push(...b.lines);
  }
  return out.join(parsed.eol);
}

// ---------- 段内保护 ----------

const PROTECT = /\[[^\]\n]*\]\([^)\n]*\)|`[^`\n]*`|<[^>\n]+>|\{[^}\n]*\}|\*\*[^*\n]+?\*\*/g;
const HOLE = /⟦(\d+)⟧/g;

/** 把要保护的片段换成 ⟦0⟧ ⟦1⟧ …，返回 { masked, tokens }。 */
export function mask(text) {
  const tokens = [];
  const masked = text.replace(PROTECT, (m) => {
    tokens.push(m);
    return `⟦${tokens.length - 1}⟧`;
  });
  return { masked, tokens };
}

/** 检查模型返回的占位符：每个恰好一次、不多不少。返回问题列表（空 = 没问题）。 */
export function checkHoles(output, tokens) {
  const seen = new Map();
  for (const m of output.matchAll(HOLE)) seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  const problems = [];
  tokens.forEach((tok, n) => {
    const c = seen.get(String(n)) ?? 0;
    if (c !== 1) problems.push(`占位符 ⟦${n}⟧（${tok}）出现 ${c} 次`);
  });
  for (const k of seen.keys()) if (Number(k) >= tokens.length) problems.push(`多出占位符 ⟦${k}⟧`);
  return problems;
}

export function unmask(output, tokens) {
  return output.replace(HOLE, (m, n) => tokens[Number(n)] ?? m);
}

/** 段落里的数字（保护片段先去掉），排序后用于前后比对。 */
export function numbersOf(text) {
  const plain = text.replace(PROTECT, ' ').replace(HOLE, ' ');
  return (plain.match(/\d+(?:[.,:]\d+)*/g) ?? []).sort();
}

/** 改后文字的提醒：数字变了、仍含写作规则里不要的东西。只提醒，不拦。 */
export function lint(before, after, lang) {
  const notes = [];
  const a = numbersOf(before).join(' ');
  const b = numbersOf(after).join(' ');
  if (a !== b) notes.push(`数字有变化：原 [${a}] → 新 [${b}]`);
  const plain = after.replace(PROTECT, ' ');
  if (lang === 'zh') {
    if (/[；;]/.test(plain)) notes.push('含分号');
    if (/——/.test(plain)) notes.push('含破折号');
    if (/不是[^。！？]{0,30}而是/.test(plain)) notes.push('含「不是…而是」');
    if (/[我你]/.test(plain) && !/[我你]/.test(before.replace(PROTECT, ' '))) notes.push('新出现了「我 / 你」');
  } else {
    if (/;/.test(plain)) notes.push('contains a semicolon');
    if (/—/.test(plain)) notes.push('contains an em dash');
    if (/\bnot\b[^.]{0,40}\bbut\b/i.test(plain)) notes.push('contains "not … but"');
  }
  if (/\n/.test(after)) notes.push('段内有换行（已合成一行）');
  return notes;
}
