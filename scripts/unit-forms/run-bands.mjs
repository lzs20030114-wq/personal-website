// 一台单元的形态研究：跑一批带子（atlas.mjs 分给几个进程并行）。
//   node scripts/unit-forms/run-bands.mjs <jobs.json> <out.json>
// jobs = [{ key, prog, F, G }]；每条带按 unit-forms 的 bandSpec / bandOpts 排谱，跑完整个收缩协议，读出每块台的剖面。
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const [jobsFile, outFile] = process.argv.slice(2);
const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
const s = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const F = await s.ssrLoadModule('/src/lib/space/unit-forms.ts');
const U = await s.ssrLoadModule('/src/lib/space/skin-unit.ts');
await s.close();
const out = {};
const r2 = (v) => Math.round(v * 100) / 100;
for (const job of jobs) {
  const spec = F.bandSpec(job.prog, { F: job.F, G: job.G });
  const u = U.createSkinUnit(spec, F.bandOpts(job.prog));
  for (let i = 0; i < U.SKIN.STEPS; i++) u.advance();
  const b = F.readBand(spec, u.px, u.py, u.n, u.locked.length);
  out[job.key] = { ...b, structs: b.structs.map((st) => ({ pts: st.pts.map(([x, y]) => [r2(x), r2(y)]), reach: r2(st.reach), top: r2(st.top), bot: r2(st.bot) })) };
}
writeFileSync(outFile, JSON.stringify(out));
