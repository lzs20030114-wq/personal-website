// 引导方式研究（Lab 2-14 · 座位三态）：几套「猫的标定 × 引导方式」各跑三档空间（会动 / 钉死 / 空房间），
// 多种子取样，用置换检验看「会动的单元」在共温、共触上比两个基准高得显不显著。
// 用法：node scripts/cohabit/guide-study.mjs [seconds=300] [seeds=32] [people=3] [cats=1] [json|-] [configs=all]
//   configs = 逗号分隔的方案名（见 CONFIGS），省略 = 全部
// 读数（每场）：共温次数 / 秒数、共触次数 / 秒数（四类事件的正文口径，见 cohabit.ts 记账）。
// 检验：双侧置换检验 20000 次（不假设正态），效应量 Cohen's d；*** p<.001 · ** <.01 · * <.05。
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { cohenD, mean, permP, sd, stars } from './stats.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const [seconds = 300, seeds = 32, people = 3, cats = 1] = args.slice(0, 4).map(Number);
const jsonOut = args[4] && args[4] !== '-' ? args[4] : undefined;
const only = args[5] ? args[5].split(',') : null;

/** 方案：cat = 覆盖 COHABIT.CAT 的常量（猫的标定），guide = 引导方式 */
const CONFIGS = [
  { name: 'demo-meet', zh: '演示值 · 会面台', cat: {}, guide: { target: 'meet' } },
  { name: 'mt-meet', zh: 'M&T 标定 · 会面台', cat: 'MT', guide: { target: 'meet' } },
  { name: 'mt-side', zh: 'M&T 标定 · 身边台', cat: 'MT', guide: { target: 'side' } },
  { name: 'mt-meetThenSide', zh: 'M&T 标定 · 先会面台再身边台', cat: 'MT', guide: { target: 'meetThenSide' } },
];
const SPACES = ['live', 'fixed', 'empty'];
const METRICS = [
  { key: 'warmthS', zh: '共温秒数', f: (r) => r.ledger.seconds.warmth },
  { key: 'warmthN', zh: '共温次数', f: (r) => r.ledger.counts.warmth },
  { key: 'touchS', zh: '共触秒数', f: (r) => r.ledger.seconds.touch },
  { key: 'touchN', zh: '共触次数', f: (r) => r.ledger.counts.touch },
];

const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const MT = m.COHABIT.CAT_MT ?? null;
  const out = [];
  for (const c of CONFIGS) {
    if (only && !only.includes(c.name)) continue;
    const patch = c.cat === 'MT' ? MT : c.cat;
    if (patch === null) throw new Error('COHABIT.CAT_MT 未定义');
    const runs = {};
    for (const space of SPACES) {
      runs[space] = [];
      for (let s = 1; s <= seeds; s++)
        runs[space].push(m.runCohabit({ trigger: 'posture', space, seed: 100 + s, seconds, people, cats, faces: true, guide: c.guide, cat: patch }));
    }
    const row = { name: c.name, zh: c.zh, cat: patch, guide: c.guide, metrics: {} };
    for (const M of METRICS) {
      const v = Object.fromEntries(SPACES.map((sp) => [sp, runs[sp].map(M.f)]));
      row.metrics[M.key] = {
        v,
        mean: Object.fromEntries(SPACES.map((sp) => [sp, mean(v[sp])])),
        sd: Object.fromEntries(SPACES.map((sp) => [sp, sd(v[sp])])),
        vsFixed: { p: permP(v.fixed, v.live), d: cohenD(v.fixed, v.live) },
        vsEmpty: { p: permP(v.empty, v.live), d: cohenD(v.empty, v.live) },
      };
    }
    out.push(row);
    console.log(`\n### ${c.zh}（${c.name}）· ${seconds} s · ${seeds} 种子 · ${people} 人 ${cats} 猫`);
    console.log('| 读数 | 会动 | 钉死 | 空房间 | 会动 vs 钉死 | 会动 vs 空房间 |');
    console.log('|---|---|---|---|---|---|');
    for (const M of METRICS) {
      const r = row.metrics[M.key];
      const f = (sp) => `${r.mean[sp].toFixed(1)} ± ${r.sd[sp].toFixed(1)}`;
      const t = (x) => `d ${x.d.toFixed(2)} · p ${x.p < 0.001 ? '<.001' : x.p.toFixed(3)} ${stars(x.p)}`;
      console.log(`| ${M.zh} | ${f('live')} | ${f('fixed')} | ${f('empty')} | ${t(r.vsFixed)} | ${t(r.vsEmpty)} |`);
    }
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ seconds, seeds, people, cats, configs: out }, null, 1));
} finally {
  await server.close();
}
