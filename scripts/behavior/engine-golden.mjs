// 生成「逐位相同」的基准（src/lib/linkage/behavior/engine.golden.json）。
//
//   node scripts/behavior/engine-golden.mjs <引擎所在仓库根目录> [来源标记] [组别] > src/lib/linkage/behavior/engine.golden.json
//
// 引擎根目录传**改动前**的那一份（例如把 git show <rev>:src/lib/linkage/{behavior/*.ts,fixed-step.ts,motion.ts}
// 导到一个临时目录）；用例与哈希取当前仓库的 golden.ts。组别（逗号分隔，默认全部）：
//   base = 现行、没有手（2026-10-07 的基准取自 d06bc0a，Lab 1-6 加手之前）；
//   v2   = 同一组用例、动作词汇 v2、没有手（2026-10-08 迎手链 v2 动工前，取自 74615e1）；
//   hand = 现行、写死的手脚本（同上，取自 74615e1）。
// 只重生成某几组时，其余组从现有的 engine.golden.json 原样带过来（来源标记不变）。
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const engineRoot = resolve(process.argv[2] ?? here);
const source = process.argv[3] ?? 'unknown';
const groups = (process.argv[4] ?? 'base,v2,hand').split(',');
const prev = JSON.parse(readFileSync(resolve(here, 'src/lib/linkage/behavior/engine.golden.json'), 'utf8'));
const mk = (root) =>
  createServer({ root, configFile: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
const sHere = await mk(here);
const sEng = engineRoot === here ? sHere : await mk(engineRoot);
try {
  const G = await sHere.ssrLoadModule('/src/lib/linkage/behavior/golden.ts');
  const E = await sEng.ssrLoadModule('/src/lib/linkage/behavior/engine.ts');
  const digest = (list, mode) =>
    list.map((c) => {
      const d = G.goldenDigest(E.runSession, c, mode);
      return { seed: c.seed, lifeRate: c.lifeRate, log: d.log, frames: d.frames };
    });
  const out = {
    source: groups.includes('base') ? source : prev.source,
    cases: groups.includes('base') ? digest(G.GOLDEN_CASES, 'base') : prev.cases,
    v2: groups.includes('v2') ? { source, cases: digest(G.GOLDEN_CASES, 'v2') } : prev.v2,
    hand: groups.includes('hand') ? { source, cases: digest(G.GOLDEN_HAND_CASES, 'hand') } : prev.hand,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
} finally {
  await sHere.close();
  if (sEng !== sHere) await sEng.close();
}
