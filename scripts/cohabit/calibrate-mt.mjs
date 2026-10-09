// 猫的停留代价按 Mertens & Turner 1988 标定（单人单猫：19 只猫各见 12 位陌生人，人坐着；被动 = 看书不理猫，主动 = 互动）。
// 场景复现：空房间（猫在地面自由走）· 一位陌生访客坐在椅子上 · 一只猫从 1.5 m 外开始 · 每场 600 s。
// 读：猫离人 > 1 m / 猫停着且 < 0.5 m（接触）/ > 2 m 的时间占比，首次接触的时刻。
// 参照（工作日志原稿 2026-07-28）：被动 > 1 m 78% · 接触 2% · > 2 m 约 40%；主动 > 1 m 34% · 接触 33%。
// 用法：node scripts/cohabit/calibrate-mt.mjs <passive|active|both> '<网格 JSON>' [seeds=6] [out.jsonl]
//   网格 = { 参数名: [取值…] }，参数名取 COHABIT.CAT 的键（tolerate / tolerateAttended / latency / approachP / approachMid / passiveP / passiveD）
import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [cond = 'both', gridArg = '{}', seedsArg = '6', out] = process.argv.slice(2);
const grid = JSON.parse(gridArg);
const seeds = Number(seedsArg);
const keys = Object.keys(grid);
const combos = keys.reduce((acc, k) => acc.flatMap((c) => grid[k].map((v) => ({ ...c, [k]: v }))), [{}]);
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const run = (c, which) => {
    let far = 0, near = 0, far2 = 0, T = 0, first = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const sim = new m.CohabitSim({ trigger: 'posture', space: 'empty', seed, opening: false, cat: c });
      const s = sim.seats[2];
      const p = sim.addPerson(s.x, s.y);
      p.mode = 'manual';
      p.ignores = which === 'passive';
      const cat = sim.addCat({ x: 0, y: 1.5 });
      const dt = 1 / 30;
      let f = 600;
      for (let t = 0; t < 600; t += dt) {
        sim.step(dt);
        const d = Math.hypot(p.walker.x - cat.walker.x, p.walker.y - cat.walker.y);
        if (d > 1) far += dt;
        if (d > 2) far2 += dt;
        // 接触 = 猫停着、离人 < 0.5 m（走过身边不算——M&T 的「接触」是身体接触，不是擦肩）
        if (d < 0.5 && cat.walker.state !== 'walk') {
          near += dt;
          if (f === 600) f = t;
        }
        T += dt;
      }
      first += f;
    }
    return { far: (far / T) * 100, near: (near / T) * 100, far2: (far2 / T) * 100, first: first / seeds };
  };
  for (const c of combos) {
    const r = {};
    if (cond !== 'active') r.passive = run(c, 'passive');
    if (cond !== 'passive') r.active = run(c, 'active');
    const line = JSON.stringify({ c, ...r });
    console.log(line);
    if (out) appendFileSync(out, line + '\n');
  }
} finally {
  await server.close();
}
