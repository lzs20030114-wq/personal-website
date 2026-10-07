// 生成「没有手时逐位相同」的基准（src/lib/linkage/behavior/engine.golden.json）。
//
//   node scripts/behavior/engine-golden.mjs <引擎所在仓库根目录> > src/lib/linkage/behavior/engine.golden.json
//
// 引擎根目录传**改动前**的那一份（例如把 git show <rev>:src/lib/linkage/{behavior/*.ts,fixed-step.ts,motion.ts}
// 导到一个临时目录）；用例与哈希取当前仓库的 golden.ts。2026-10-07 的基准取自 d06bc0a（Lab 1-6 加手之前）。
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const engineRoot = resolve(process.argv[2] ?? here);
const mk = (root) =>
  createServer({ root, configFile: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
const sHere = await mk(here);
const sEng = engineRoot === here ? sHere : await mk(engineRoot);
try {
  const G = await sHere.ssrLoadModule('/src/lib/linkage/behavior/golden.ts');
  const E = await sEng.ssrLoadModule('/src/lib/linkage/behavior/engine.ts');
  const cases = G.GOLDEN_CASES.map((c) => {
    const d = G.goldenDigest(E.runSession, c);
    return { seed: c.seed, lifeRate: c.lifeRate, log: d.log, frames: d.frames };
  });
  process.stdout.write(`${JSON.stringify({ source: process.argv[3] ?? 'd06bc0a', cases }, null, 2)}\n`);
} finally {
  await sHere.close();
  if (sEng !== sHere) await sEng.close();
}
