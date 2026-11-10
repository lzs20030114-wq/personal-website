// 用 Gemini 改案例页正文的文字段落，结果写成草稿，不碰原文件。用法见同目录 README.md。
//
//   npm run copy:gemini -- models
//   npm run copy:gemini -- list    <slug> <zh|en>
//   npm run copy:gemini -- rewrite <slug> <zh|en> [--section 0,3] [--headings] [--note "…"] [--dry-run]
//   npm run copy:gemini -- apply   <slug> <zh|en> [--run <时间戳>]
//
// 配置（.env.local，已被 gitignore）：GEMINI_API_KEY、GEMINI_MODEL，需要代理时加 HTTPS_PROXY。
// key 只放在请求头里，不进 URL，也不写进任何落盘文件。

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkHoles, lint, mask, parseMdx, rebuild, selectSegments, skipReason, unmask } from './segments.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const DRAFTS = join(ROOT, '.local', 'copy-drafts');
const LANGS = { zh: { file: 'index.zh.mdx', name: '中文' }, en: { file: 'index.mdx', name: '英文' } };

const USAGE = `用法：
  npm run copy:gemini -- models                      列出这个 key 能用的模型
  npm run copy:gemini -- list    <slug> <zh|en>      列出各节编号与可改的段数
  npm run copy:gemini -- rewrite <slug> <zh|en> [选项]
      --section 0,3     只改这几节（编号见 list；0 = 第一个小标题之前的开篇）
      --headings        小标题也改（默认不改）
      --note "…"        这次的额外要求，附在规则后面
      --dry-run         只生成请求内容，不调用 API（不需要 key）
  npm run copy:gemini -- apply   <slug> <zh|en> [--run <时间戳>]   用草稿覆盖原文件

slug：reincarnation-machine（项目一）· project-ii（项目二）`;

// ---------- 入口 ----------

const ENV_FILE = join(ROOT, '.env.local');
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

// GEMINI_API_BASE 只用于离线测试（指向本地假服务）
const API = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');

// Node 的 fetch 默认不走代理；设了 HTTPS_PROXY 就带上 NODE_USE_ENV_PROXY=1 重启一次自己（Node ≥ 24）
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(r.status ?? 1);
}

let flags = {};
try {
  const parsedArgs = parseArgs(process.argv.slice(2));
  flags = parsedArgs.flags;
  const [cmd, slug, lang] = parsedArgs.pos;
  if (cmd === 'models') await cmdModels();
  else if (cmd === 'list') cmdList(slug, lang);
  else if (cmd === 'rewrite') await cmdRewrite(slug, lang);
  else if (cmd === 'apply') cmdApply(slug, lang);
  else {
    console.log(USAGE);
    if (cmd) process.exitCode = 1;
  }
} catch (e) {
  console.error(`\n出错：${e.message}`);
  process.exit(1);
}

// ---------- 命令 ----------

async function cmdModels() {
  const key = needKey();
  const r = await request(`${API}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
  const models = (r.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .sort((a, b) => a.name.localeCompare(b.name));
  console.log('可用于改写的模型（填进 .env.local 的 GEMINI_MODEL，不要带 models/ 前缀）：\n');
  for (const m of models) {
    const id = m.name.replace(/^models\//, '');
    console.log(`  ${id.padEnd(40)} 输入 ${fmt(m.inputTokenLimit)} / 输出 ${fmt(m.outputTokenLimit)}  ${m.displayName ?? ''}`);
  }
  console.log('\n价格与免费额度的数据条款以 Google 官方页面为准。');
}

function cmdList(slug, lang) {
  const { file } = source(slug, lang);
  const parsed = parseMdx(readFileSync(file, 'utf8'));
  console.log(`${rel(file)}\n`);
  console.log('  节号  可改段  字数   小节');
  for (const s of parsed.sections) {
    const blocks = parsed.blocks.filter((b) => b.type === 'text' && b.section === s.index);
    const ok = blocks.filter((b) => skipReason(b, parsed.sections) === null);
    const chars = ok.reduce((n, b) => n + b.text.length, 0);
    const why = [...new Set(blocks.map((b) => skipReason(b, parsed.sections)).filter((r) => r && !r.startsWith('标题')))];
    console.log(`  ${String(s.index).padStart(4)}  ${String(ok.length).padStart(6)}  ${String(chars).padStart(5)}   ${s.title}${why.length ? `   （跳过：${why.join('、')}）` : ''}`);
  }
}

async function cmdRewrite(slug, lang) {
  const { file } = source(slug, lang);
  const src = readFileSync(file, 'utf8');
  const parsed = parseMdx(src);
  const sections = flags.section ? parseSectionList(String(flags.section), parsed.sections.length) : null;
  const segs = selectSegments(parsed, { headings: Boolean(flags.headings), sections });
  if (segs.length === 0) throw new Error('所选范围里没有可改的段落。先用 list 看节号。');

  const items = segs.map((b) => ({ b, ...mask(b.text) }));
  const payload = items.map(({ b, masked }) => ({
    id: b.id,
    kind: b.kind === 'heading' ? `h${b.level}` : b.kind,
    section: parsed.sections[b.section].title,
    text: masked,
  }));

  const model = (process.env.GEMINI_MODEL ?? '').replace(/^models\//, '').trim();
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(lang, flags.note) }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload, null, 1) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { id: { type: 'STRING' }, text: { type: 'STRING' } },
          required: ['id', 'text'],
        },
      },
    },
  };

  // 本地时间做目录名；同一秒跑两次就加后缀，不覆盖上一次
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  let stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  for (let k = 2; existsSync(join(DRAFTS, `${slug}-${lang}`, stamp)); k++) stamp = stamp.replace(/(-\d+)?$/, `-${k}`);
  const dir = join(DRAFTS, `${slug}-${lang}`, stamp);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, 'request.json'), { model, sourceFile: rel(file), body });

  const chars = payload.reduce((n, p) => n + p.text.length, 0);
  console.log(`${rel(file)}：发出 ${segs.length} 段，约 ${chars} 字（${sections ? `第 ${[...sections].join('、')} 节` : '全文'}）`);

  const meta = { slug, lang, source: rel(file), baseHash: sha(src), model, stamp, sections: sections ? [...sections] : 'all', headings: Boolean(flags.headings), note: flags.note ?? null, dryRun: Boolean(flags['dry-run']) };

  if (flags['dry-run']) {
    writeJson(join(dir, 'meta.json'), meta);
    console.log(`\n只生成了请求，没有调用 API：${rel(join(dir, 'request.json'))}`);
    return;
  }

  const key = needKey();
  if (!model) throw new Error('.env.local 里没有 GEMINI_MODEL。先运行 `npm run copy:gemini -- models` 选一个。');

  console.log(`调用 ${model} …（思考型模型可能要一两分钟）`);
  const t0 = Date.now();
  const res = await request(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  writeJson(join(dir, 'response.json'), res);
  const out = parseAnswer(res);

  // 逐段核对、还原
  const byId = new Map(out.map((o) => [o.id, o.text]));
  const rewrites = new Map();
  const rows = [];
  for (const { b, masked, tokens } of items) {
    const got = byId.get(b.id);
    const row = { b, before: b.text, after: b.text, notes: [], status: 'same' };
    rows.push(row);
    if (typeof got !== 'string') {
      row.status = 'kept';
      row.notes.push('模型没有返回这一段，保留原文');
      continue;
    }
    const holes = checkHoles(got, tokens);
    if (holes.length) {
      row.status = 'kept';
      row.notes.push(...holes, '占位符对不上，保留原文');
      continue;
    }
    const restored = unmask(got, tokens).trim();
    row.notes.push(...lint(b.text, restored, lang));
    const flat = restored.replace(/\s*\r?\n\s*/g, lang === 'zh' ? '' : ' ');
    if (flat === b.text) continue;
    row.after = flat;
    row.status = 'changed';
    rewrites.set(b.id, flat);
  }
  const unknown = out.filter((o) => !items.some((it) => it.b.id === o.id)).length;

  const draft = rebuild(parsed, rewrites);
  assertSameStructure(src, draft);
  const draftFile = join(dir, basename(file));
  writeFileSync(draftFile, draft);

  const count = (s) => rows.filter((r) => r.status === s).length;
  const flagged = rows.filter((r) => r.notes.length).length;
  const usage = res.usageMetadata ?? {};
  Object.assign(meta, {
    seconds: Math.round((Date.now() - t0) / 1000),
    counts: { sent: rows.length, changed: count('changed'), same: count('same'), kept: count('kept'), flagged, unknown },
    usage,
  });
  writeJson(join(dir, 'meta.json'), meta);
  writeJson(join(DRAFTS, `${slug}-${lang}`, 'latest.json'), { stamp });
  writeFileSync(join(dir, 'report.md'), report(meta, rows, parsed));

  console.log(`\n完成（${meta.seconds} 秒）：改了 ${count('changed')} 段 · 没改 ${count('same')} 段 · 退回原文 ${count('kept')} 段 · 有提醒 ${flagged} 段`);
  if (usage.promptTokenCount) {
    console.log(`用量：输入 ${usage.promptTokenCount} · 输出 ${usage.candidatesTokenCount ?? 0}${usage.thoughtsTokenCount ? ` · 思考 ${usage.thoughtsTokenCount}` : ''} token`);
  }
  console.log(`\n草稿：${rel(draftFile)}`);
  console.log(`逐段对照：${rel(join(dir, 'report.md'))}`);
  console.log(`\n看差异：\n  git diff --no-index --word-diff=color${lang === 'zh' ? ' --word-diff-regex=.' : ''} ${rel(file)} ${rel(draftFile)}`);
  console.log(`\n满意了再覆盖原文件：\n  npm run copy:gemini -- apply ${slug} ${lang}`);
}

function cmdApply(slug, lang) {
  const { file } = source(slug, lang);
  const base = join(DRAFTS, `${slug}-${lang}`);
  const stamp = flags.run ? String(flags.run) : readJson(join(base, 'latest.json'), '还没有草稿，先运行 rewrite。').stamp;
  const dir = join(base, stamp);
  const meta = readJson(join(dir, 'meta.json'), `找不到草稿 ${rel(dir)}`);
  if (meta.dryRun) throw new Error('这一次是 --dry-run，没有草稿可用。');
  const draftFile = join(dir, basename(file));
  if (!existsSync(draftFile)) throw new Error(`找不到草稿文件 ${rel(draftFile)}`);
  if (sha(readFileSync(file, 'utf8')) !== meta.baseHash) {
    throw new Error(`${rel(file)} 在生成草稿之后被改过，不覆盖（以免冲掉新的修改）。重新运行 rewrite 生成新草稿。`);
  }
  copyFileSync(draftFile, file);
  console.log(`已用 ${stamp} 的草稿覆盖 ${rel(file)}。`);
  console.log('\n接下来跑一遍守门（中英两侧小节数、插槽顺序）：\n  npx vitest run src/lib/site/content.test.ts src/lib/site/case-headings.test.ts');
  console.log(`\n不满意就撤回：\n  git restore ${rel(file)}`);
}

// ---------- 提示词 ----------

function systemPrompt(lang, note) {
  const rules = readFileSync(join(HERE, 'rules.md'), 'utf8');
  const format = `## 输入与输出格式

输入是一个 JSON 数组，按页面顺序排列，每项是页面上的一段${LANGS[lang].name}文字：
- id：段编号，原样返回。
- kind：para = 段落，item = 列表项，quote = 引用，h2 / h3 = 小标题。
- section：所在小节，只作上下文。
- text：要改的文字。

要求：
1. 返回一个 JSON 数组，每个输入的 id 恰好对应一项 {"id", "text"}，顺序不变。不合并、不拆分、不增删段落。
2. text 里形如 ⟦0⟧ ⟦1⟧ 的占位符代表链接、术语或组件，必须原样保留在句中合适的位置，每个恰好出现一次，不翻译、不改写、不拆开。
3. 改写后仍用${LANGS[lang].name}。每段写成一段连续的文字，不要换行。
4. 小标题保持名词短语，不改成问句。列表项只改这一项自己的文字，不加列表符号。
5. 一段无需修改时原样返回。全页统一用词，前后段落的说法要一致。`;
  const extra = note ? `\n\n## 本次额外要求\n\n${note}` : '';
  return `${rules.trim()}\n\n${format}${extra}`;
}

function parseAnswer(res) {
  const cand = res.candidates?.[0];
  if (!cand) {
    const why = res.promptFeedback?.blockReason;
    throw new Error(`模型没有返回内容${why ? `（被拦截：${why}）` : ''}。原始响应已存为 response.json。`);
  }
  if (cand.finishReason === 'MAX_TOKENS') {
    throw new Error('输出被截断（达到输出上限）。用 --section 分几次改。');
  }
  const text = (cand.content?.parts ?? [])
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let arr;
  try {
    arr = JSON.parse(text);
  } catch {
    throw new Error(`返回的不是合法 JSON（finishReason = ${cand.finishReason}）。原始响应已存为 response.json。`);
  }
  if (!Array.isArray(arr)) throw new Error('返回的 JSON 不是数组。');
  return arr.filter((o) => o && typeof o.id === 'string' && typeof o.text === 'string');
}

function report(meta, rows, parsed) {
  const lines = [
    `# ${meta.source} · ${meta.stamp}`,
    '',
    `模型 ${meta.model} · 范围 ${Array.isArray(meta.sections) ? `第 ${meta.sections.join('、')} 节` : '全文'}${meta.headings ? ' · 含小标题' : ''}${meta.note ? ` · 额外要求：${meta.note}` : ''}`,
    '',
    `改了 ${meta.counts.changed} 段 · 没改 ${meta.counts.same} 段 · 退回原文 ${meta.counts.kept} 段 · 有提醒 ${meta.counts.flagged} 段`,
    '',
    '有提醒的段排在前面。「退回原文」= 链接 / 术语占位符对不上，草稿里用的是原文。',
    '',
  ];
  const order = [...rows].sort((a, b) => (b.notes.length > 0) - (a.notes.length > 0));
  for (const r of order) {
    if (r.status === 'same' && r.notes.length === 0) continue;
    const tag = { changed: '改了', kept: '退回原文', same: '没改' }[r.status];
    lines.push(`## ${parsed.sections[r.b.section].title} · ${r.b.id} · ${tag}`, '');
    for (const n of r.notes) lines.push(`- ⚠ ${n}`);
    if (r.notes.length) lines.push('');
    lines.push('原文：', '', `> ${r.before}`, '');
    if (r.status === 'changed') lines.push('改后：', '', `> ${r.after}`, '');
  }
  return lines.join('\n');
}

// ---------- 小工具 ----------

function source(slug, lang) {
  if (!slug || !lang) throw new Error(`缺少参数。\n\n${USAGE}`);
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`slug 不合法：${slug}`);
  if (!LANGS[lang]) throw new Error('语言只能是 zh 或 en。');
  const file = join(ROOT, 'content', 'work', slug, LANGS[lang].file);
  if (!existsSync(file)) throw new Error(`找不到 ${rel(file)}`);
  return { file };
}

function needKey() {
  const key = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!key) throw new Error('.env.local 里没有 GEMINI_API_KEY。见 scripts/copy-gemini/README.md。');
  return key;
}

async function request(url, init) {
  const waits = [10, 30, 60];
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(url, { ...init, signal: AbortSignal.timeout(600_000) });
    } catch (e) {
      if (attempt < waits.length) {
        console.log(`  网络出错（${e.cause?.code ?? e.name}），${waits[attempt]} 秒后重试…`);
        await sleep(waits[attempt]);
        continue;
      }
      throw new Error(`连不上 Google API（${e.cause?.code ?? e.message}）。在国内需要代理：在 .env.local 里加 HTTPS_PROXY=http://127.0.0.1:<端口>。`);
    }
    if (r.ok) return r.json();
    const text = await r.text();
    if ([429, 500, 502, 503, 504].includes(r.status) && attempt < waits.length) {
      console.log(`  Google 返回 ${r.status}，${waits[attempt]} 秒后重试…`);
      await sleep(waits[attempt]);
      continue;
    }
    let msg = text;
    try {
      msg = JSON.parse(text).error?.message ?? text;
    } catch {}
    throw new Error(`Google 返回 ${r.status}：${String(msg).slice(0, 600)}`);
  }
}

/** 运行期再核一遍：除文字段外的结构行（组件、标题、表格、注释）前后完全相同。 */
function assertSameStructure(a, b) {
  const pick = (s) =>
    s.split(/\r?\n/).filter((l) => /^\s*(<|\{\/\*|\||#{1,6}\s|---)/.test(l) && !/^#{1,6}\s/.test(l));
  const h = (s) => s.split(/\r?\n/).filter((l) => /^#{1,6}\s/.test(l)).length;
  if (JSON.stringify(pick(a)) !== JSON.stringify(pick(b)) || h(a) !== h(b)) {
    throw new Error('内部错误：草稿的结构行与原文不一致，已中止（没有写草稿）。');
  }
}

function parseSectionList(s, n) {
  const set = new Set(
    s.split(/[,，\s]+/).filter(Boolean).map((x) => {
      const k = Number(x);
      if (!Number.isInteger(k) || k < 0 || k >= n) throw new Error(`节号 ${x} 不存在（0–${n - 1}，见 list）。`);
      return k;
    }),
  );
  return set;
}

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (['section', 'note', 'run'].includes(name)) {
        if (next === undefined) throw new Error(`--${name} 后面要跟一个值`);
        flags[name] = next;
        i++;
      } else flags[name] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

// 函数声明会提升：入口在文件上方就调用它们，不能写成 const 箭头函数
function sha(s) {
  return createHash('sha256').update(s).digest('hex');
}
function rel(p) {
  return relative(ROOT, p).replace(/\\/g, '/');
}
function fmt(n) {
  return n ? n.toLocaleString('en-US') : '?';
}
function sleep(s) {
  return new Promise((r) => setTimeout(r, s * 1000));
}
function writeJson(p, v) {
  writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
}
function readJson(p, msg) {
  if (!existsSync(p)) throw new Error(msg);
  return JSON.parse(readFileSync(p, 'utf8'));
}
