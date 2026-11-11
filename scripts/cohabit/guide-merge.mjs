// 合并 guide-effect.mjs 分段并行跑出的结果（各段 SEED0 不同）：node scripts/cohabit/guide-merge.mjs out.json shard0.json shard1.json ...
// 打印与 guide-effect 同样的差值（引导开 − 引导关、桌子自己引来多少 = off − offNT），另加「赢几个种子」。
import fs from 'node:fs';
import { mean, pairedCI, pairedDz, permPairedP, stars } from './stats.mjs';

const [out, ...files] = process.argv.slice(2);
const shards = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))).sort((a, b) => a.seed0 - b.seed0);
const arms = Object.keys(shards[0].arms.warmthS);
const head = shards[0];
const res = { seconds: head.seconds, seeds: shards.reduce((a, s) => a + s.seeds, 0), people: head.people, cats: head.cats, catPatch: head.catPatch, pacePatch: head.pacePatch, optsPatch: head.optsPatch, arms: {}, diffs: {} };
console.log(`${head.people} 人 ${head.cats} 猫 · ${head.seconds} s · ${res.seeds} 种子 · 选项 ${JSON.stringify(head.optsPatch ?? {})}`);
for (const k of Object.keys(head.arms)) {
  res.arms[k] = {};
  for (const a of arms) res.arms[k][a] = shards.flatMap((s) => s.arms[k][a].v);
  const v = res.arms[k];
  const row = arms.map((a) => `${a} ${mean(v[a]).toFixed(1)}`).join(' · ');
  const d = (on, base = 'off') => {
    if (!v[on] || !v[base]) return '';
    const b = v[base];
    const diff = mean(v[on]) - mean(b);
    const p = permPairedP(b, v[on]);
    const ci = pairedCI(b, v[on]);
    const wins = v[on].filter((x, i) => x > b[i]).length;
    res.diffs[`${k}:${on}-${base}`] = { diff, rel: mean(b) ? diff / mean(b) : null, p, dz: pairedDz(b, v[on]), ci, wins };
    return `\n    ${on}−${base} ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}（${mean(b) ? ((100 * diff) / mean(b)).toFixed(0) : '—'}%，95% [${ci[0].toFixed(1)}, ${ci[1].toFixed(1)}]，p ${p.toFixed(4)} ${stars(p)}，dz ${pairedDz(b, v[on]).toFixed(2)}，赢 ${wins}/${b.length}）`;
  };
  console.log(`${k.padEnd(14)} ${row}${d('guided')}${d('sidew')}${d('off', 'offNT')}`);
}
fs.writeFileSync(out, JSON.stringify(res));
