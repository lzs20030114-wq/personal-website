// 交接文档用：五环在中间轴 0°…180° 各相位下的销位（环局部，mm）+ 脚的实际行程。
// 取站上的解算（shell3d.ts，Lab 1-4 / 1-5 同一份），不另写一份。
//   node scripts/handover/ring-phases.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
try {
  const sh = await server.ssrLoadModule('/src/lib/linkage/shell3d.ts');
  const mc = await server.ssrLoadModule('/src/lib/linkage/machine.ts');
  const rings = sh.createShell();
  const PH = [0, 30, 60, 90, 120, 150, 180];
  const SUB = 4; // 每度 4 子步（0.25°/步，远低于 1°/步健康线）
  const out = rings.map((r) => ({
    name: r.data.name, crankR: r.data.crankR, apex: r.data.apex, pin: r.data.pin, center: r.data.center,
    feet: r.data.feet, tris: r.data.def.tris ?? null, slots: r.slots, phases: {},
  }));
  let deg = 0;
  const snap = () => rings.forEach((r, i) => {
    out[i].phases[deg] = r.solver.nodes.map((n) => [+n.x.toFixed(3), +n.y.toFixed(3)]);
  });
  snap();
  for (const target of PH.slice(1)) {
    while (deg < target) {
      for (let k = 0; k < SUB; k++) rings.forEach((r) => sh.stepRing(r, mc.MACHINE_DIR * (Math.PI / 180) / SUB));
      deg++;
    }
    snap();
  }
  out.forEach((o, i) => { o.maxErr = rings[i].solver.maxError(); });
  writeFileSync(process.argv[2], JSON.stringify(out));
  console.log(out.map((o) => `${o.name} apex 0°=${o.phases[0][o.apex][1]} 180°=${o.phases[180][o.apex][1]} err=${o.maxErr.toFixed(3)}`).join('\n'));
} finally {
  await server.close();
}
