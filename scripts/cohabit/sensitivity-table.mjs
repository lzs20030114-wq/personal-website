// 敏感性分析汇总：node scripts/cohabit/sensitivity-table.mjs base.json label=file.json ...
// 各文件是 guide-merge.mjs 的输出（至少有 guided、off 两档）。对每一档打印引导开减关的差值（共温、共温 + 共触、共触），
// 与基准（base）并排：差值、相对引导关的比例、95% 自助区间、置换检验 p、dz、引导开更高的种子数。
import fs from 'node:fs';
import { mean, pairedCI, pairedDz, permPairedP } from './stats.mjs';

const [baseFile, ...rest] = process.argv.slice(2);
const runs = [['基准', baseFile], ...rest.map((a) => a.split('='))];
const f = (x, d = 0) => (x >= 0 ? '+' : '') + x.toFixed(d);
const metric = {
  warmth: (r, a) => r.arms.warmthS[a],
  warmthTouch: (r, a) => r.arms.warmthS[a].map((x, i) => x + r.arms.touchS[a][i]),
  touch: (r, a) => r.arms.touchS[a],
};
const out = [];
for (const [label, file] of runs) {
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  const row = { label };
  for (const [k, get] of Object.entries(metric)) {
    const on = get(r, 'guided');
    const off = get(r, 'off');
    const d = mean(on) - mean(off);
    row[k] = { on: mean(on), off: mean(off), d, rel: d / mean(off), ci: pairedCI(off, on), p: permPairedP(off, on), dz: pairedDz(off, on), wins: on.filter((x, i) => x > off[i]).length, n: on.length };
  }
  out.push(row);
}
const p = (x) => (x < 0.001 ? '< .001' : x.toFixed(3).replace(/^0/, ''));
for (const k of Object.keys(metric)) {
  console.log(`\n${k}`);
  console.log('| 档 | 引导开 | 引导关 | 开 − 关 | 95% 区间 | p | dz | 赢 |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const row of out) {
    const m = row[k];
    console.log(`| ${row.label} | ${m.on.toFixed(0)} | ${m.off.toFixed(0)} | ${f(m.d)}（${f(100 * m.rel)}%） | [${m.ci[0].toFixed(0)}, ${m.ci[1].toFixed(0)}] | ${p(m.p)} | ${m.dz.toFixed(2)} | ${m.wins}/${m.n} |`);
  }
}
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out));
