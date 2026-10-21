// 案例页「对照结果」那张图的数据（FIG.06）：Lab 2-14 最终配置——「走 · 站 · 坐」规则 · 只收挡路的带 · 访客有身体、结伴 ·
// 猫按 Mertens & Turner 1988 标定且能下地（上台几率随人数中等升高）。三个场景 × 两种引导 × 三档空间 × N 种子，记十二个读数；
// 置换检验与效应量照 guide-study.mjs。用法：node scripts/cohabit/case-compare.mjs [seconds=300] [seeds=32] src/lib/space/cohabit-compare.data.json
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cohenD, mean, permP, sd } from './stats.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [seconds = 300, seeds = 32] = process.argv.slice(2, 4).map(Number);
const out = process.argv[4];
const SCENES = [{ people: 3, cats: 1 }, { people: 6, cats: 2 }, { people: 12, cats: 3 }];
const GUIDES = [{ key: 'meet', guide: { target: 'meet' } }, { key: 'sidew', guide: { target: 'side', whole: true } }];
const SPACES = ['live', 'fixed', 'empty'];
const METRICS = {
  warmthS: (r) => r.ledger.seconds.warmth, warmthN: (r) => r.ledger.counts.warmth,
  touchS: (r) => r.ledger.seconds.touch, touchN: (r) => r.ledger.counts.touch,
  gazeN: (r) => r.ledger.counts.gaze, passN: (r) => r.ledger.counts.pass,
  settled: (r) => r.catSettled, detour: (r) => r.detour, floor: (r) => r.catFloorShare,
  arrivals: (r) => r.catArrivals, seated: (r) => r.seatedTime, formed: (r) => r.formed,
};
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const patch = { ...m.COHABIT.CAT_MT, ...m.COHABIT.CAT_LEVELS.mid };
  const scenes = [];
  for (const sc of SCENES) {
    const guides = [];
    for (const g of GUIDES) {
      const t0 = Date.now();
      const runs = {};
      for (const space of SPACES) {
        runs[space] = [];
        for (let s = 1; s <= seeds; s++)
          runs[space].push(m.runCohabit({ trigger: 'posture', space, seed: 100 + s, seconds, people: sc.people, cats: sc.cats, faces: true, guide: g.guide, cat: patch, social: true, catFloor: true }));
      }
      const metrics = {};
      for (const [k, f] of Object.entries(METRICS)) {
        const v = Object.fromEntries(SPACES.map((sp) => [sp, runs[sp].map(f)]));
        metrics[k] = {
          v,
          mean: Object.fromEntries(SPACES.map((sp) => [sp, mean(v[sp])])),
          sd: Object.fromEntries(SPACES.map((sp) => [sp, sd(v[sp])])),
          vsFixed: { p: permP(v.fixed, v.live), d: cohenD(v.fixed, v.live) },
          vsEmpty: { p: permP(v.empty, v.live), d: cohenD(v.empty, v.live) },
        };
      }
      guides.push({ key: g.key, guide: g.guide, metrics });
      const f = (k, sp) => `${metrics[k].mean[sp].toFixed(0)}`;
      console.log(`${sc.people}人${sc.cats}猫 · ${g.key} · ${((Date.now() - t0) / 1000).toFixed(0)}s | 共温s ${f('warmthS','live')}/${f('warmthS','fixed')}/${f('warmthS','empty')} p ${metrics.warmthS.vsFixed.p.toFixed(3)}/${metrics.warmthS.vsEmpty.p.toFixed(3)} | 共触s ${f('touchS','live')}/${f('touchS','fixed')}/${f('touchS','empty')} | 安稳 ${f('settled','live')}/${f('settled','fixed')}/${f('settled','empty')} | 绕行 ${f('detour','live')}/${f('detour','fixed')}/${f('detour','empty')}`);
    }
    scenes.push({ ...sc, guides });
  }
  // 原始全量（十二个读数、未取整）另存 .raw.json；out 本身是站上组件读的那份：四个读数、一位小数，体积才进得了客户端包
  writeFileSync(out.replace(/\.json$/, '.raw.json'), JSON.stringify({ seconds, seeds, scenes }));
  const KEEP = ['warmthS', 'touchS', 'settled', 'detour'];
  const r1 = (x) => Math.round(x * 10) / 10;
  const byKey = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));
  const trimmed = {
    seconds, seeds,
    scenes: scenes.map((sc) => ({
      people: sc.people, cats: sc.cats,
      guides: sc.guides.map((g) => ({
        key: g.key,
        metrics: Object.fromEntries(KEEP.map((k) => {
          const mm = g.metrics[k];
          return [k, { mean: byKey(mm.mean, r1), sd: byKey(mm.sd, r1), v: byKey(mm.v, (a) => a.map(r1)),
            vsFixed: { p: Math.round(mm.vsFixed.p * 1e4) / 1e4, d: Math.round(mm.vsFixed.d * 100) / 100 },
            vsEmpty: { p: Math.round(mm.vsEmpty.p * 1e4) / 1e4, d: Math.round(mm.vsEmpty.d * 100) / 100 } }];
        })),
      })),
    })),
  };
  writeFileSync(out, `${JSON.stringify(trimmed)}\n`);
  console.log('→', out, '（原始全量在同名 .raw.json）');
} finally {
  await server.close();
}
