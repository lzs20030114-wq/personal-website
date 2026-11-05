// 茶几 + 猫台（perch，形态方案 §14）的对照：同 case-compare 的配置与种子，只多跑「会动 + 猫台」一档，
// 与 case-compare 的原始全量（.raw.json：会动 / 钉死 / 空房间）比。用法：
//   node scripts/cohabit/perch-study.mjs <case-compare 的 .raw.json> [seconds=300] [seeds=32] [out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { cohenD, mean, permP } from './stats.mjs';
const [rawPath, seconds = 300, seeds = 32, out] = [process.argv[2], ...process.argv.slice(3, 5).map(Number), process.argv[5]];
const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
const KEYS = { warmthS: (r) => r.ledger.seconds.warmth, touchS: (r) => r.ledger.seconds.touch, settled: (r) => r.catSettled, detour: (r) => r.detour, arrivals: (r) => r.catArrivals, seated: (r) => r.seatedTime };
const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'error', appType: 'custom' });
const res = [];
try {
  const m = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const patch = { ...m.COHABIT.CAT_MT, ...m.COHABIT.CAT_LEVELS.mid };
  for (const sc of raw.scenes.filter((s) => s.people >= 6)) {
    const base = sc.guides.find((g) => g.key === 'meet').metrics;
    const runs = [];
    for (let s = 1; s <= seeds; s++) runs.push(m.runCohabit({ trigger: 'posture', ...m.CASE_ROOM, perch: true, space: 'live', seed: 100 + s, seconds, people: sc.people, cats: sc.cats, faces: true, guide: { target: 'meet' }, cat: patch, social: true, catFloor: true }));
    const row = { people: sc.people, cats: sc.cats, metrics: {} };
    for (const [k, f] of Object.entries(KEYS)) {
      const v = runs.map(f);
      const b = base[k].v;
      row.metrics[k] = { perch: mean(v), live: mean(b.live), fixed: mean(b.fixed), empty: mean(b.empty),
        vsLive: { p: permP(b.live, v), d: cohenD(b.live, v) }, vsFixed: { p: permP(b.fixed, v), d: cohenD(b.fixed, v) }, vsEmpty: { p: permP(b.empty, v), d: cohenD(b.empty, v) } };
      const r = row.metrics[k];
      console.log(`${sc.people}人${sc.cats}猫 ${k}: 猫台 ${r.perch.toFixed(1)} · 会动 ${r.live.toFixed(1)} · 钉死 ${r.fixed.toFixed(1)} · 空房 ${r.empty.toFixed(1)} | 对会动 p ${r.vsLive.p.toFixed(3)} d ${r.vsLive.d.toFixed(2)} · 对钉死 p ${r.vsFixed.p.toFixed(3)} d ${r.vsFixed.d.toFixed(2)} · 对空房 p ${r.vsEmpty.p.toFixed(3)} d ${r.vsEmpty.d.toFixed(2)}`);
    }
    res.push(row);
  }
  if (out) writeFileSync(out, JSON.stringify({ seconds, seeds, scenes: res }, null, 1));
} finally {
  await server.close();
}
