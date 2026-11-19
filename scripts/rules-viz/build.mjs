/**
 * 规则读数原型打包（2026-11-19，项目二_规则可视化方案.md）：把 proto.ts 连同站上的仿真与画法打成一段脚本，
 * 塞进 page.html，写成一个自包含的 HTML（发成 claude.ai artifact 看）。不进站上构建。
 * 用法：node scripts/rules-viz/build.mjs <out.html>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) {
  console.error('用法：node scripts/rules-viz/build.mjs <out.html>');
  process.exit(1);
}
const res = await build({
  configFile: false,
  logLevel: 'warn',
  root: join(here, '../..'),
  build: {
    write: false,
    minify: true,
    lib: { entry: join(here, 'proto.ts'), formats: ['iife'], name: 'RulesViz', fileName: () => 'proto.js' },
  },
});
const outputs = (Array.isArray(res) ? res : [res]).flatMap((r) => r.output);
const js = outputs.find((o) => o.type === 'chunk').code;
const page = readFileSync(join(here, 'page.html'), 'utf8').replace('/*__JS__*/', () => js.replace(/<\/script/gi, '<\\/script'));
writeFileSync(out, page);
console.log(`写出 ${out}：脚本 ${(js.length / 1024).toFixed(0)} KB，整页 ${(page.length / 1024).toFixed(0)} KB`);
