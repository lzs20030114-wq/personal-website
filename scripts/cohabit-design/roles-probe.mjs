import { createServer } from 'vite';
const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const C = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
const S = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
const T = Number(process.argv[2] ?? 600);
for (const seed of [11, 12, 13, 14]) {
  const sim = new C.CohabitSim({ trigger: 'posture', grid: C.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed, opening: false, auto: true, faces: true, social: true, catFloor: true, cat: { ...C.COHABIT.CAT_MT, ...C.COHABIT.CAT_LEVELS.mid }, guide: C.COHABIT.GUIDE, pace: C.PACE_DEMO });
  const half = sim.layout.fieldM / 2;
  C.partySizes(S.SCENE.people).forEach((sz, i, a) => { const ang = (i / a.length) * 2 * Math.PI + 0.3; sim.addParty(Math.cos(ang) * half * 0.6, Math.sin(ang) * half * 0.6, sz); });
  C.scatterCats(sim, S.SCENE.cats, seed);
  const n = sim.layout.units.length;
  const seen = new Map(); // key person-cat-path -> info
  const sec = { table: 0, step: 0, meet: 0, offer: 0, catRest: 0, open: 0 };
  let catFloorSec = 0, retreatSec = 0;
  const lens = [];
  const dt = 1 / 30;
  for (let t = 0; t < T; t += dt) {
    sim.step(dt);
    const role = new Array(n).fill(null);
    for (const g of sim.guides) {
      const key = `${g.kind}:${g.person}:${g.cat}:${g.path.join(',')}`;
      if (!seen.has(key)) { const c = sim.cats.find((k) => k.id === g.cat); seen.set(key, { kind: g.kind, len: g.path.length, floor: !c.unit }); }
      g.path.forEach((u, k) => { if (k === 0) return; role[u] = role[u] ?? (g.kind === 'stand' ? 'offer' : k === g.path.length - 1 ? 'meet' : 'step'); });
    }
    for (let u = 0; u < n; u++) {
      if (sim.act.degree[u] < 0.5) continue;
      if (sim.tableBy[u] >= 0) sec.table += dt; else if (role[u]) sec[role[u]] += dt; else if (sim.cats.some((c) => c.unit && c.unit.i === u)) sec.catRest += dt; else sec.open += dt;
    }
    for (const c of sim.cats) { if (!c.unit) catFloorSec += dt; if (c.state === 'retreat') retreatSec += dt; }
  }
  const sits = [...seen.values()].filter((x) => x.kind === 'sit');
  const hist = {}; for (const s of sits) hist[s.len] = (hist[s.len] ?? 0) + 1;
  console.log(`seed ${seed}`, 'sit路', sits.length, '从地面起', sits.filter((s) => s.floor).length, '路长分布', JSON.stringify(hist), 'stand', [...seen.values()].filter((x) => x.kind === 'stand').length,
    '台·秒', JSON.stringify(Object.fromEntries(Object.entries(sec).map(([k, v]) => [k, Math.round(v)]))), '猫在地面·秒', Math.round(catFloorSec), '退开·秒', Math.round(retreatSec));
}
await server.close();
