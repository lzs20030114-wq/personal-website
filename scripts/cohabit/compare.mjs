// 对照（待办第 6 条）：空房间 / 单元钉死 / 会动的单元，多种子取均值并标散布。
// 用法：node scripts/cohabit/compare.mjs [seconds=300] [seeds=8] [people=3] [cats=1] [grid=4] [faces=1]
//   faces = 1 按带让路（2026-10-07 起台架默认）· 0 整台让位（首版口径）
// 读数：四类事件次数与秒数 · 猫在 1 m 外占比（参照 M&T 0.78）· 猫安稳停留秒数 · 访客绕行米数 · R5 钉住次数不计（瞬时量）。
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [seconds = 300, seeds = 8, people = 3, cats = 1, grid = 4, facesArg = 1] = process.argv.slice(2).map(Number);
const faces = facesArg !== 0;
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const { runCohabit, SPACE_MODES } = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const rows = [];
  for (const m of SPACE_MODES) {
    const runs = [];
    for (let s = 1; s <= seeds; s++) runs.push(runCohabit({ space: m.key, seed: 100 + s, seconds, people, cats, grid, faces }));
    const pick = (f) => {
      const v = runs.map(f);
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
      return { mean, sd };
    };
    rows.push({
      space: m.key,
      zh: m.zh,
      gaze: pick((r) => r.ledger.counts.gaze),
      warmth: pick((r) => r.ledger.counts.warmth),
      warmthS: pick((r) => r.ledger.seconds.warmth),
      touch: pick((r) => r.ledger.counts.touch),
      pass: pick((r) => r.ledger.counts.pass),
      far: pick((r) => r.catFarShare),
      settled: pick((r) => r.catSettled),
      detour: pick((r) => r.detour),
      formed: pick((r) => r.formed),
    });
  }
  const f = (x, d = 1) => `${x.mean.toFixed(d)} ± ${x.sd.toFixed(d)}`;
  console.log(`对照 · ${seconds} s · ${seeds} 种子 · ${people} 人 ${cats} 猫 · ${grid}×${grid} · 让路 ${faces ? '按带' : '整台'}`);
  console.log('| 空间 | 共视 | 共温（次 · 秒） | 共触 | 交接 | 猫在 1 m 外 | 猫安稳停留 s | 访客绕行 m | 终态成形 |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of rows)
    console.log(`| ${r.zh} | ${f(r.gaze)} | ${f(r.warmth)} · ${f(r.warmthS, 0)} | ${f(r.touch)} | ${f(r.pass)} | ${f({ mean: r.far.mean * 100, sd: r.far.sd * 100 }, 0)}% | ${f(r.settled, 0)} | ${f(r.detour)} | ${f(r.formed)} |`);
} finally {
  await server.close();
}
