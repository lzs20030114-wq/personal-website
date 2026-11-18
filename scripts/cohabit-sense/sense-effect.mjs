// 项目二 · 感知层下引导开 / 关的差值（2026-11-18，作者「摄像头 + 称重 / 座位压力，与胸牌 / 项圈，两个方案都做」）。
// 标准场景与 scripts/cohabit/guide-effect.mjs 同一套（6 人 4 猫 · 方台铺满整间房 · 20 座 · PACE_DEMO · 一场 1800 s），
// 每个种子按同一份起始布置跑下面几档读法 × 引导开 / 关：
//   truth   空间读真值（此前所有研究的口径）
//   observe 只读看得见的：位置朝向按真值，读不到的意图换成看得见的量（cohabit-sense SENSE.proxy）
//   camera  方案 A：四个上角的摄像头 + 单元称重 + 座位压力
//   tag     方案 B：胸牌 / 项圈的 UWB 定位与胸牌朝向 + 单元称重 + 座位压力
//   tagHead 方案 B 的敏感性：人看猫时只转头不转身（胸牌朝向与视线之间加一个 σ 30° 慢慢变的偏差）
// 读数：共温 / 共触（按真值记账）· 坐着的共温 · 猫到座位前方那台的次数 · 猫在台上的比例；代价：带碰到人的人·秒、门口等的人·秒；
// 读数质量（camera / tag）：位置误差、丢失比例、「看着哪只猫」对上 / 误报 / 漏报、「猫要上这台」对上 / 误报 / 漏报。
//
// 用法：
//   node scripts/cohabit-sense/sense-effect.mjs run [seconds=1800] [seeds=32] <out.json>     （环境变量 SEED0：种子从 SEED0+1 起，默认 100）
//   node scripts/cohabit-sense/sense-effect.mjs merge <out.json> <part1.json> <part2.json> …   （合并分段，打印对照表）
//   环境变量 LEVELS：只跑这几档（逗号分隔）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mean, pairedCI, pairedDz, permPairedP, sd, stars } from '../cohabit/stats.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [mode = 'run', ...rest] = process.argv.slice(2);

const ALL_LEVELS = [
  { key: 'truth', zh: '读真值' },
  { key: 'observe', zh: '只读看得见的', scheme: 'observe' },
  { key: 'camera', zh: '方案 A · 摄像头', scheme: 'camera' },
  { key: 'tag', zh: '方案 B · 胸牌 / 项圈', scheme: 'tag' },
  { key: 'tagHead', zh: '方案 B · 人只转头', scheme: 'tag', opts: { tagTurnSd: (30 * Math.PI) / 180 } },
];
const LEVELS = process.env.LEVELS ? ALL_LEVELS.filter((l) => process.env.LEVELS.split(',').includes(l.key)) : ALL_LEVELS;
const GUIDES = [
  { key: 'on', goal: true },
  { key: 'off', goal: false },
];
const METRICS = {
  warmthS: { zh: '共温 s', f: (r) => r.s.ledger.seconds.warmth },
  touchS: { zh: '共触 s', f: (r) => r.s.ledger.seconds.touch },
  seatedWarmthS: { zh: '坐着的共温 s', f: (r) => r.s.seatedWarmth },
  arrivals: { zh: '猫到座位前方那台 次', f: (r) => r.s.catArrivals },
  onTop: { zh: '猫在台上 %', f: (r) => 100 * (1 - r.s.catFloorShare) },
  contactS: { zh: '带碰到人 人·s', f: (r) => r.contactS },
  waitS: { zh: '门口等 人·s', f: (r) => r.waitS },
};

async function runMode() {
  const [seconds = 1800, seeds = 32] = rest.slice(0, 2).map(Number);
  const out = rest[2];
  const seed0 = Number(process.env.SEED0 ?? 100);
  const { createServer } = await import('vite');
  const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
  try {
    const m = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
    const S = await server.ssrLoadModule('/src/lib/space/cohabit-sense.ts');
    const P = await server.ssrLoadModule('/src/lib/space/unit-activation.ts');
    const cat = { ...m.COHABIT.CAT_MT, ...m.COHABIT.CAT_LEVELS.mid };
    const res = { seconds, seed0, seeds: [], levels: LEVELS.map((l) => l.key), runs: {} };
    for (const l of LEVELS) for (const g of GUIDES) res.runs[`${l.key}:${g.key}`] = [];
    const t0 = Date.now();
    for (let k = 1; k <= seeds; k++) {
      const seed = seed0 + k;
      res.seeds.push(seed);
      for (const l of LEVELS)
        for (const g of GUIDES) {
          const sense = l.scheme ? S.makeSense(l.scheme, { seed: seed * 7 + 1, ...(l.opts ?? {}) }) : null;
          const sim = new m.CohabitSim({ trigger: 'posture', grid: m.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed, opening: false, auto: true, faces: true, social: true, catFloor: true, cat, goal: g.goal, guide: { target: 'meet' }, pace: m.PACE_DEMO, ...(sense ? { sense } : {}) });
          m.populateCohabit(sim, 6, 0);
          m.scatterCats(sim, 4, seed);
          const dt = 1 / 30;
          let contactS = 0;
          let waitS = 0;
          for (let t = 0; t < seconds - 1e-9; t += dt) {
            sim.step(dt);
            for (const p of sim.people) {
              const w = p.walker;
              if (!w.present) continue;
              if (p.waitFor > 0) waitS += dt;
              if (!p.seated && sim.bandTouch(w.x, w.y, P.PLAN.BODY_R - 0.02)) contactS += dt;
            }
          }
          res.runs[`${l.key}:${g.key}`].push({ s: sim.summary(), contactS, waitS, st: sense ? sense.stats : null });
        }
      console.error(`seed ${seed} done · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    writeFileSync(out, JSON.stringify(res));
  } finally {
    await server.close();
  }
}

function mergeMode() {
  const [out, ...parts] = rest;
  const all = parts.map((p) => JSON.parse(readFileSync(p, 'utf8')));
  const levels = all[0].levels;
  const runs = {};
  const seeds = [];
  for (const a of all) {
    seeds.push(...a.seeds);
    for (const [k, v] of Object.entries(a.runs)) (runs[k] ??= []).push(...v);
  }
  const res = { seconds: all[0].seconds, seeds, levels, table: {}, diffs: {}, vsTruth: {}, quality: {} };
  const L = ALL_LEVELS.filter((l) => levels.includes(l.key));
  console.log(`6 人 4 猫 · ${res.seconds} s · ${seeds.length} 种子`);
  for (const [mk, M] of Object.entries(METRICS)) {
    const vals = {};
    for (const l of L) for (const g of GUIDES) vals[`${l.key}:${g.key}`] = runs[`${l.key}:${g.key}`].map(M.f);
    res.table[mk] = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { mean: mean(v), sd: sd(v) }]));
    console.log(`\n${M.zh}`);
    for (const l of L) {
      const on = vals[`${l.key}:on`];
      const off = vals[`${l.key}:off`];
      const d = mean(on) - mean(off);
      const p = permPairedP(off, on);
      const dz = pairedDz(off, on);
      const ci = pairedCI(off, on);
      res.diffs[`${mk}:${l.key}`] = { on: mean(on), off: mean(off), diff: d, rel: mean(off) ? d / mean(off) : null, p, dz, ci };
      let line = `  ${l.zh.padEnd(12)} 开 ${mean(on).toFixed(1)} · 关 ${mean(off).toFixed(1)} · 开−关 ${d >= 0 ? '+' : ''}${d.toFixed(1)}`;
      if (mean(off)) line += `（${((100 * d) / mean(off)).toFixed(0)}%）`;
      line += ` · 95% [${ci[0].toFixed(1)}, ${ci[1].toFixed(1)}] · p ${p.toFixed(4)} ${stars(p)} · dz ${dz.toFixed(2)}`;
      if (l.key !== 'truth' && levels.includes('truth')) {
        const t = vals['truth:on'];
        const dd = mean(on) - mean(t);
        const pp = permPairedP(t, on);
        res.vsTruth[`${mk}:${l.key}`] = { diff: dd, rel: mean(t) ? dd / mean(t) : null, p: pp };
        line += ` · 引导开比读真值 ${dd >= 0 ? '+' : ''}${dd.toFixed(1)}（p ${pp.toFixed(3)}）`;
      }
      console.log(line);
    }
  }
  console.log('\n读数质量（引导开那一档，均值）');
  for (const l of L) {
    const st = runs[`${l.key}:on`].map((r) => r.st).filter(Boolean);
    if (!st.length) continue;
    const avg = (f) => mean(st.map(f));
    const q = {
      personRmse: avg((s) => s.personRmse),
      catRmse: avg((s) => s.catRmse),
      personLost: avg((s) => s.personLost),
      floorCatLost: avg((s) => s.floorCatLost),
      topCatLost: avg((s) => s.topCatLost),
      watchRecall: avg((s) => (s.watchHit + s.watchMiss > 0 ? s.watchHit / (s.watchHit + s.watchMiss) : NaN)),
      watchPrecision: avg((s) => (s.watchHit + s.watchFalse > 0 ? s.watchHit / (s.watchHit + s.watchFalse) : NaN)),
      climbRecall: avg((s) => (s.climbHit + s.climbMiss > 0 ? s.climbHit / (s.climbHit + s.climbMiss) : NaN)),
      climbPrecision: avg((s) => (s.climbHit + s.climbFalse > 0 ? s.climbHit / (s.climbHit + s.climbFalse) : NaN)),
    };
    res.quality[l.key] = q;
    const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
    console.log(
      `  ${l.zh.padEnd(12)} 人位置 ${f(q.personRmse * 100, 1)} cm · 猫 ${f(q.catRmse * 100, 1)} cm · 丢失 人 ${f(q.personLost * 100, 1)}% / 地上的猫 ${f(q.floorCatLost * 100, 1)}% / 台上的猫 ${f(q.topCatLost * 100, 1)}%` +
        ` · 看着哪只猫 查全 ${f(q.watchRecall * 100, 0)}% 查准 ${f(q.watchPrecision * 100, 0)}% · 猫要上这台 查全 ${f(q.climbRecall * 100, 0)}% 查准 ${f(q.climbPrecision * 100, 0)}%`,
    );
  }
  writeFileSync(out, JSON.stringify(res, null, 1));
}

if (mode === 'run') await runMode();
else if (mode === 'merge') mergeMode();
else throw new Error(`未知的用法 ${mode}`);
