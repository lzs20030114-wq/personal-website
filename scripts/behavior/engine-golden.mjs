// 生成「逐位相同」的基准（src/lib/linkage/behavior/engine.golden.json）。
//
//   node scripts/behavior/engine-golden.mjs <引擎所在仓库根目录> [来源标记] [组别] > src/lib/linkage/behavior/engine.golden.json
//
// 引擎根目录传**改动前**的那一份（例如 git worktree add 一份旧版本）；用例与哈希取当前仓库的 golden.ts。
// 组别（逗号分隔，默认全部）：base = 没有手；hand = 加写死的手脚本。
// 沿革见 engine.golden.test.ts 头注（2026-10-17 删掉现行动作后只剩这两组）。
// 只重生成某一组时，另一组从现有的 engine.golden.json 原样带过来（来源标记不变）。
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const engineRoot = resolve(process.argv[2] ?? here);
const source = process.argv[3] ?? 'unknown';
const groups = (process.argv[4] ?? 'base,hand').split(',');
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
    hand: groups.includes('hand') ? { source, cases: digest(G.GOLDEN_HAND_CASES, 'hand') } : prev.hand,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
} finally {
  await sHere.close();
  if (sEng !== sHere) await sEng.close();
}
