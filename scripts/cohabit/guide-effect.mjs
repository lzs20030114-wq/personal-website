// 引导开 / 关的差值（作者 2026-11-08：「我们不看绝对值，看差值」）：标准场景（6 人 4 猫，cohabit-solid 的 SCENE）、
// Lab 2-14 自由演示 = Lab 2-15 那一套配置（方台铺满整间房、桌子、20 座标准布置、访客节奏 PACE_DEMO）。
// 每个种子跑一组，组内各档同一个种子、同一份起始布置（人按 populateCohabit 的圈、猫按 scatterCats 散放）：
//   guided = 会动的单元 · 引导开（座位前方 · 每次一步，台架默认）  sidew = 会动 · 引导开（座位旁边 · 整条路一次落）
//   off    = 会动的单元 · 引导关（goal: false：单元只给桌子、猫脚下与它自己要去的那一台）
//   fixed / empty = 钉死档 / 空房间，作参照
// 检验：引导开 − 引导关按种子配对，符号翻转置换检验 20000 次，效应量 dz，差值 95% 自助区间。
// 用法：node scripts/cohabit/guide-effect.mjs [seconds=600] [seeds=32] [people=6] [cats=4] [json|-] [catPatch JSON] [pacePatch JSON]
//   catPatch：覆盖猫的常量做敏感性，例 '{"upBias":1.5}'（接在 CAT_MT + CAT_LEVELS.mid 之后）
//   pacePatch：覆盖访客节奏（接在 PACE_DEMO 之后），例 '{"sit":{"min":300,"max":900}}'
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { mean, pairedCI, pairedDz, permPairedP, sd, stars } from './stats.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const [seconds = 600, seeds = 32, people = 6, cats = 4] = args.slice(0, 4).map(Number);
const jsonOut = args[4] && args[4] !== '-' ? args[4] : undefined;
const catPatch = args[5] && args[5] !== '-' ? JSON.parse(args[5]) : {};
const pacePatch = args[6] ? JSON.parse(args[6]) : {};
const ARMS = [
  { key: 'guided', zh: '会动 · 引导开（座位前方）', space: 'live', goal: true, guide: { target: 'meet' } },
  { key: 'sidew', zh: '会动 · 引导开（座位旁边 · 整条路）', space: 'live', goal: true, guide: { target: 'side', whole: true } },
  { key: 'off', zh: '会动 · 引导关', space: 'live', goal: false, guide: { target: 'meet' } },
  { key: 'fixed', zh: '钉死', space: 'fixed', goal: true, guide: { target: 'meet' } },
  { key: 'empty', zh: '空房间', space: 'empty', goal: true, guide: { target: 'meet' } },
];
const METRICS = {
  warmthS: { zh: '共温 s', f: (r) => r.ledger.seconds.warmth },
  touchS: { zh: '共触 s', f: (r) => r.ledger.seconds.touch },
  gazeN: { zh: '共视 次', f: (r) => r.ledger.counts.gaze },
  arrivals: { zh: '猫到座位前方那台 次', f: (r) => r.catArrivals },
  onTop: { zh: '猫在台上 %', f: (r) => 100 * (1 - r.catFloorShare) },
  far: { zh: '猫离人 > 1 m %', f: (r) => 100 * r.catFarShare },
  seated: { zh: '坐着 %', f: (r) => (100 * r.seatedTime) / (r.people * r.t) },
};
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const cat = { ...m.COHABIT.CAT_MT, ...m.COHABIT.CAT_LEVELS.mid, ...catPatch };
  const runs = Object.fromEntries(ARMS.map((a) => [a.key, []]));
  const t0 = Date.now();
  for (let s = 1; s <= seeds; s++) {
    const seed = 100 + s;
    for (const a of ARMS) {
      const sim = new m.CohabitSim({ trigger: 'posture', grid: m.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: a.space, seed, opening: false, auto: true, faces: true, social: true, catFloor: true, cat, goal: a.goal, guide: a.guide, pace: { ...m.PACE_DEMO, ...pacePatch } });
      m.populateCohabit(sim, people, 0);
      m.scatterCats(sim, cats, seed);
      const dt = 1 / 30;
      for (let t = 0; t < seconds - 1e-9; t += dt) sim.step(dt);
      runs[a.key].push(sim.summary());
    }
  }
  const out = { seconds, seeds, people, cats, catPatch, pacePatch, arms: {}, diffs: {} };
  console.log(`${people} 人 ${cats} 猫 · ${seconds} s · ${seeds} 种子 · 猫 ${JSON.stringify(catPatch)} · 节奏 ${JSON.stringify(pacePatch)} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const [k, M] of Object.entries(METRICS)) {
    const v = Object.fromEntries(ARMS.map((a) => [a.key, runs[a.key].map(M.f)]));
    out.arms[k] = Object.fromEntries(ARMS.map((a) => [a.key, { mean: mean(v[a.key]), sd: sd(v[a.key]), v: v[a.key] }]));
    const row = ARMS.map((a) => `${a.key} ${mean(v[a.key]).toFixed(1)}`).join(' · ');
    const diff = (on) => {
      const p = permPairedP(v.off, v[on]);
      const ci = pairedCI(v.off, v[on]);
      const d = mean(v[on]) - mean(v.off);
      out.diffs[`${k}:${on}-off`] = { diff: d, rel: mean(v.off) ? d / mean(v.off) : null, p, dz: pairedDz(v.off, v[on]), ci };
      return `${on}−off ${d >= 0 ? '+' : ''}${d.toFixed(1)}（${mean(v.off) ? ((100 * d) / mean(v.off)).toFixed(0) : '—'}%，95% [${ci[0].toFixed(1)}, ${ci[1].toFixed(1)}]，p ${p.toFixed(4)} ${stars(p)}，dz ${pairedDz(v.off, v[on]).toFixed(2)}）`;
    };
    console.log(`${M.zh.padEnd(12)} ${row}\n    ${diff('guided')}\n    ${diff('sidew')}`);
  }
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out));
} finally {
  await server.close();
}
