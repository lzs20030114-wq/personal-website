// 项目一案例页 N07「五环参数族」的数据：五个环在中间轴 0°（全开）与 180°（折叠）时的销位，
// 取站上的解算（shell3d.ts，Lab 1-4 / 1-5 与交接图册 RM-HO-08 同一份），不另写一份。
//   node scripts/case-figures/ring-family.mjs   → src/lib/site/ring-family.data.json
// 只存三角板用到的节点（环局部 mm，y 向上，地线 y = 0），保留一位小数。
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
  const SUB = 4; // 每度 4 子步（0.25°/步，远低于 1°/步健康线；同 scripts/handover/ring-phases.mjs）
  const snap = () => rings.map((r) => r.solver.nodes.map((n) => [n.x, n.y]));
  const open = snap();
  for (let deg = 0; deg < 180; deg++)
    for (let k = 0; k < SUB; k++) rings.forEach((r) => sh.stepRing(r, (mc.MACHINE_DIR * (Math.PI / 180)) / SUB));
  const fold = snap();
  const r1 = (v) => Math.round(v * 10) / 10;
  const out = rings.map((r, i) => {
    const d = r.data;
    const used = [...new Set(d.tris.flat())].sort((a, b) => a - b);
    const idx = new Map(used.map((n, k) => [n, k]));
    const pick = (ph) => used.map((n) => [r1(ph[i][n][0]), r1(ph[i][n][1])]);
    // 内侧脚 = 右半边离中轴最近的那只（交接图册 foot_travel 同一取法）；行程 = 槽两端之差
    const right = d.feet.filter((f) => open[i][f][0] > 0);
    const inner = right.reduce((a, b) => (open[i][a][0] < open[i][b][0] ? a : b));
    const slot = r.slots.find((s) => s.node === inner);
    const [ring, base] = d.name.split('_');
    return {
      ring,
      base: base.replace('x', ' × '),
      tris: d.tris.map((t) => t.map((n) => idx.get(n))),
      apex: [r1(open[i][d.apex][1]), r1(fold[i][d.apex][1])],
      innerTravel: r1(slot.hi - slot.lo),
      open: pick(open),
      fold: pick(fold),
      err: r1(r.solver.maxError() * 1000) / 1000,
    };
  });
  writeFileSync(resolve(root, 'src/lib/site/ring-family.data.json'), JSON.stringify(out) + '\n');
  console.log(out.map((o) => `${o.ring} ${o.base} apex ${o.apex.join(' → ')} inner ${o.innerTravel} err ${o.err}`).join('\n'));
} finally {
  await server.close();
}
