// 随机定形：每场 600 s 里给猫落的台各成什么、同时有几台两层（照台架的 makeSim 配置；按台架判「开始落下」的同一口径）
import { createServer } from 'vite';
const root = process.cwd();
const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const C = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
const S = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
const SCENE = S.SCENE;
const T = Number(process.argv[2] ?? 600);
const seeds = (process.argv[3] ?? '11,12,13,14').split(',').map(Number);
for (const seed of seeds) {
  const sim = new C.CohabitSim({ trigger: 'posture', grid: C.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed, opening: false, auto: true, faces: true, social: true, catFloor: true, cat: { ...C.COHABIT.CAT_MT, ...C.COHABIT.CAT_LEVELS.mid }, guide: C.COHABIT.GUIDE, pace: C.PACE_DEMO });
  const half = sim.layout.fieldM / 2;
  C.partySizes(SCENE.people).forEach((sz, i, a) => { const ang = (i / a.length) * 2 * Math.PI + 0.3; sim.addParty(Math.cos(ang) * half * 0.6, Math.sin(ang) * half * 0.6, sz); });
  for (let i = 0; i < SCENE.cats; i++) sim.addCat(sim.layout.units[(i * 5) % sim.layout.units.length]);
  const n = sim.layout.units.length;
  const tableUnits = new Set(sim.seats.map((s) => s.table).filter((t) => t >= 0));
  const set = new Uint8Array(n), serial = new Int32Array(n), form = new Array(n).fill('flat');
  const count = { flat: 0, half: 0, full: 0, table: 0, near: 0, tall: 0 };
  let peak = 0, roofSec = 0, catRoofSec = 0;
  const dt = 1 / 30;
  for (let t = 0; t < T; t += dt) {
    sim.step(dt);
    const seated = sim.people.filter((p) => p.seated && p.seat !== null).map((p) => sim.seats[p.seat]);
    let now = 0;
    for (let u = 0; u < n; u++) {
      const deg = sim.act.degree[u];
      if (deg <= 1e-4) { set[u] = 0; form[u] = 'flat'; continue; }
      if (!set[u]) {
        set[u] = 1;
        if (sim.tableBy[u] >= 0) { count.table++; serial[u]++; continue; }
        const plan = S.unitFormPlan({ seed, unit: u, serial: serial[u]++, layout: sim.layout, at: sim.layout.units[u], seated, rects: sim.furn.rects, tableUnit: tableUnits.has(u) });
        form[u] = plan.form; count[plan.form]++;
        if (S.shelterToward(sim.layout, sim.layout.units[u], seated, sim.furn.rects) !== null) count.near++;
        if (!S.shelterClear(sim.layout, sim.layout.units[u], sim.furn.rects)) count.tall++;
      }
      if (form[u] !== 'flat') now++;
    }
    peak = Math.max(peak, now); roofSec += now * dt;
    for (const c of sim.cats) { const sup = sim.supportOf(c); if (sup.length === 1 && form[sup[0].i] !== 'flat') catRoofSec += dt; }
  }
  console.log(`seed ${seed}`, JSON.stringify(count), 'peak两层', peak, '两层台·秒', roofSec.toFixed(0), '猫在两层台上 s', catRoofSec.toFixed(0), '桌子那台', [...tableUnits].length);
}
await server.close();
