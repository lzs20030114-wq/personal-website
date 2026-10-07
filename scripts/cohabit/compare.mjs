// 对照（待办第 6 条）：空房间 / 单元钉死 / 会动的单元，多种子取均值并标散布。
// 用法：node scripts/cohabit/compare.mjs [seconds=300] [seeds=8] [people=3] [cats=1] [grid=4] [faces=1] [json|-] [rule=trace]
//   faces = 1 按带让路（2026-10-07 起台架默认）· 0 整台让位（首版口径）
//   json = 可选输出路径：逐种子原始读数写成 JSON，给对照图 compare-chart.mjs 用（图与表同一次跑）；「-」= 不写
//   rule = trace 痕迹（旧口径）· posture 座位三态（2026-10-07 作者拍板，家具只在 8×8 下摆 ⇒ 配 grid=8）
// 读数：四类事件次数与秒数 · 猫在 1 m 外占比（参照 M&T 0.78）· 猫安稳停留秒数 · 访客绕行米数 · R5 钉住次数不计（瞬时量）。
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const [seconds = 300, seeds = 8, people = 3, cats = 1, grid = 4, facesArg = 1] = args.slice(0, 6).map(Number);
const jsonOut = args[6] && args[6] !== '-' ? args[6] : undefined;
const trigger = args[7] ?? 'trace';
const faces = facesArg !== 0;
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const { runCohabit, SPACE_MODES } = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const rows = [];
  for (const m of SPACE_MODES) {
    const runs = [];
    for (let s = 1; s <= seeds; s++) runs.push(runCohabit({ space: m.key, seed: 100 + s, seconds, people, cats, grid, faces, trigger }));
    const pick = (f) => {
      const v = runs.map(f);
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
      return { mean, sd, v };
    };
    rows.push({
      space: m.key,
      zh: m.zh,
      en: m.en,
      gaze: pick((r) => r.ledger.counts.gaze),
      warmth: pick((r) => r.ledger.counts.warmth),
      warmthS: pick((r) => r.ledger.seconds.warmth),
      touch: pick((r) => r.ledger.counts.touch),
      pass: pick((r) => r.ledger.counts.pass),
      far: pick((r) => r.catFarShare),
      settled: pick((r) => r.catSettled),
      detour: pick((r) => r.detour),
      formed: pick((r) => r.formed),
      seatedTime: pick((r) => r.seatedTime),
      catArrivals: pick((r) => r.catArrivals),
    });
  }
  const f = (x, d = 1) => `${x.mean.toFixed(d)} ± ${x.sd.toFixed(d)}`;
  const posture = trigger === 'posture';
  console.log(`对照 · ${seconds} s · ${seeds} 种子 · ${people} 人 ${cats} 猫 · ${grid}×${grid} · 让路 ${faces ? '按带' : '整台'} · 规则 ${posture ? '座位三态' : '痕迹'}`);
  console.log(`| 空间 | 共视 | 共温（次 · 秒） | 共触 | 交接 | 猫在 1 m 外 | 猫安稳停留 s | 访客绕行 m | 终态成形 |${posture ? ' 坐着 人·s | 猫到会面台 |' : ''}`);
  console.log(`|---|---|---|---|---|---|---|---|---|${posture ? '---|---|' : ''}`);
  for (const r of rows)
    console.log(`| ${r.zh} | ${f(r.gaze)} | ${f(r.warmth)} · ${f(r.warmthS, 0)} | ${f(r.touch)} | ${f(r.pass)} | ${f({ mean: r.far.mean * 100, sd: r.far.sd * 100 }, 0)}% | ${f(r.settled, 0)} | ${f(r.detour)} | ${f(r.formed)} |${posture ? ` ${f(r.seatedTime, 0)} | ${f(r.catArrivals)} |` : ''}`);
  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ seconds, seeds: Array.from({ length: seeds }, (_, i) => 101 + i), people, cats, grid, faces, trigger, rows }, null, 1));
    console.log(`逐种子读数 → ${jsonOut}`);
  }
} finally {
  await server.close();
}
