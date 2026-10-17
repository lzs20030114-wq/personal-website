// 交互机制参数表 §12 审核用：每个常量块的每个键有没有被读到（定义块之外；测试 / 脚本里的引用单独计）。
//
//   node scripts/behavior/param-audit.mjs
//
// 注意：按 `块名.键名` 字面找，像 INTENSITY[e.touch] 这种按名字动态取的会被报成「没人读」，要人工核。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const roots = ['src', 'components', 'app', 'scripts'];
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    const s = statSync(p);
    if (s.isDirectory()) { if (n !== 'node_modules') walk(p); }
    else if (/\.(ts|tsx|mjs|js)$/.test(n)) files.push(p);
  }
};
for (const r of roots) walk(join(REPO, r));
const text = Object.fromEntries(files.map((f) => [f, readFileSync(f, 'utf8')]));
const objs = [
  ['ENGINE', 'src/lib/linkage/behavior/engine.ts'],
  ['MOTION', 'src/lib/linkage/behavior/engine.ts'],
  ['HAND', 'src/lib/linkage/behavior/engine.ts'],
  ['SOCIAL', 'src/lib/linkage/behavior/engine.ts'],
  ['HC', 'src/lib/linkage/behavior/vocab2-hand.ts'],
  ['V2', 'src/lib/linkage/behavior/vocab2.ts'],
  ['GRASP', 'src/lib/linkage/behavior/grasp.ts'],
  ['LIFE', 'src/lib/linkage/behavior/life.ts'],
  ['INTENSITY', 'src/lib/linkage/behavior/events.ts'],
  ['HAND_UI', 'src/lib/linkage/machine-behavior.ts'],
  ['HAND_MM', 'src/lib/linkage/machine-behavior.ts'],
  ['OBS', 'src/lib/linkage/behavior/engine.ts'],
];
for (const [name, def] of objs) {
  const src = text[join(REPO, def)];
  const start = src.search(new RegExp(`export const ${name}\\s*=\\s*\\{`));
  if (start < 0) { console.log('no def', name); continue; }
  // 找到匹配的右括号
  let i = src.indexOf('{', start), depth = 0, end = i;
  for (; end < src.length; end++) { if (src[end] === '{') depth++; else if (src[end] === '}') { depth--; if (depth === 0) break; } }
  const block = src.slice(i, end);
  const keys = [...block.matchAll(/^\s{2}([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm)].map((m) => m[1]);
  const unused = [], testOnly = [];
  for (const k of keys) {
    const re = new RegExp(`\\b${name}\\.${k}\\b`);
    let prod = 0, test = 0;
    for (const [f, t] of Object.entries(text)) {
      const body = f === join(REPO, def) ? t.slice(0, start) + t.slice(end) : t;
      if (re.test(body)) { if (/\.test\.|scripts\//.test(f)) test++; else prod++; }
    }
    if (!prod && !test) unused.push(k); else if (!prod) testOnly.push(k);
  }
  console.log(`${name}: ${keys.length} 键 · 没人读 ${unused.length}${unused.length ? ' [' + unused.join(', ') + ']' : ''} · 只在测试/脚本 ${testOnly.length}${testOnly.length ? ' [' + testOnly.join(', ') + ']' : ''}`);
}
