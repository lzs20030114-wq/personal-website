// 单元形态与 2-15 的对应：照台架的配置跑 2-15，每台开始落下那一刻按 cohabit-design 定形（与现行的随机定形并排），
// 统计猫实际走过的每一步要跳多高（台到台按接缝两边的高度、地面到台按台朝猫那一侧的高度）。
// 用法：node scripts/cohabit-design/probe.mjs [秒数=600] [种子=11,12,13,14] [输出 json]
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const C = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
const S = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
const D = await server.ssrLoadModule('/src/lib/space/cohabit-design.ts');
const T = Number(process.argv[2] ?? 600);
const seeds = (process.argv[3] ?? '11,12,13,14').split(',').map(Number);
const out = process.argv[4];
const hist = () => ({ '≤0.05': 0, '0.05–0.3': 0, '0.3–0.6': 0, '0.6–0.9': 0, '>0.9': 0 });
const bin = (h, v) => { const a = Math.abs(v); h[a <= 0.05 ? '≤0.05' : a <= 0.3 ? '0.05–0.3' : a <= 0.6 ? '0.3–0.6' : a <= 0.9 ? '0.6–0.9' : '>0.9']++; };
const report = [];
for (const seed of seeds) {
  const sim = new C.CohabitSim({ trigger: 'posture', grid: C.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed, opening: false, auto: true, faces: true, social: true, catFloor: true, cat: { ...C.COHABIT.CAT_MT, ...C.COHABIT.CAT_LEVELS.mid }, guide: C.COHABIT.GUIDE, pace: C.PACE_DEMO });
  const half = sim.layout.fieldM / 2;
  C.partySizes(S.SCENE.people).forEach((sz, i, a) => { const ang = (i / a.length) * 2 * Math.PI + 0.3; sim.addParty(Math.cos(ang) * half * 0.6, Math.sin(ang) * half * 0.6, sz); });
  C.scatterCats(sim, S.SCENE.cats, seed);
  const n = sim.layout.units.length;
  const units = sim.layout.units;
  const tableUnits = new Set(sim.seats.map((s) => s.table).filter((t) => t >= 0));
  const formed = new Array(n).fill(null); // 新：cohabit-design
  const old = new Array(n).fill(null); // 现行：平台 1.05 / 桌子 / 随机两层 0.90
  const serial = new Int32Array(n);
  const roles = { table: 0, step: 0, meet: 0, offer: 0, rest: 0, retreat: 0 };
  let meetRoof = 0, oldMeetRoof = 0, clipped = 0;
  const jNew = { floorUp: hist(), unitToUnit: hist(), unitDown: hist() };
  const jOld = { floorUp: hist(), unitToUnit: hist(), unitDown: hist() };
  const where = sim.cats.map((c) => (c.unit ? c.unit.i : -1));
  const lastFloor = sim.cats.map((c) => ({ x: c.walker.x, y: c.walker.y }));
  const oldH = (u, th) => (old[u] ? old[u] : 1.05);
  const dt = 1 / 30;
  for (let t = 0; t < T; t += dt) {
    sim.step(dt);
    const seated = sim.people.filter((p) => p.seated && p.seat !== null).map((p) => sim.seats[p.seat]);
    for (let u = 0; u < n; u++) {
      if (sim.act.degree[u] <= 1e-4) { formed[u] = null; old[u] = null; continue; }
      if (formed[u]) continue;
      const d = D.designUnit(sim, u, formed);
      formed[u] = d; roles[d.role]++;
      if (d.role === 'meet' && d.form.bands) meetRoof++;
      if (d.role === 'step' && Math.abs(d.slope.to - d.slope.from) >= D.riseLimit(d.slope.inDir, d.slope.outDir) - 1e-9) clipped++;
      // 现行：桌子按家具，其余按 unitFormPlan 抽
      if (sim.tableBy[u] >= 0) old[u] = S.tableTopFor(sim.furn.rects[sim.tableBy[u]]);
      else {
        const plan = S.unitFormPlan({ seed, unit: u, serial: serial[u]++, layout: sim.layout, at: units[u], seated, rects: sim.furn.rects, tableUnit: tableUnits.has(u) || sim.seats.some((st) => st.table === u) });
        old[u] = plan.bands ? S.SHELTER.lowerTop : S.TABLE_TOP.stand;
        if (d.role === 'meet' && plan.bands) oldMeetRoof++;
      }
    }
    sim.cats.forEach((c, i) => {
      const now = c.unit ? c.unit.i : -1;
      const was = where[i];
      if (now === was) { if (now < 0) lastFloor[i] = { x: c.walker.x, y: c.walker.y }; return; }
      if (was < 0 && now >= 0) {
        const th = Math.atan2(lastFloor[i].y - units[now].y, lastFloor[i].x - units[now].x);
        const hN = formed[now] ? D.heightToward(formed[now], th) : 1.05;
        bin(jNew.floorUp, hN);
        if (process.env.WHY) console.log('floorUp', t.toFixed(1), 'cat', c.id, 'unit', now, 'role', formed[now]?.role, 'h', hN.toFixed(2), 'from', formed[now]?.slope?.from?.toFixed(2), 'to', formed[now]?.slope?.to?.toFixed(2), 'dirErr', formed[now]?.slope ? (((th - formed[now].slope.inDir) * 180 / Math.PI + 540) % 360 - 180).toFixed(0) : '-', 'guides', JSON.stringify(sim.guides.filter((g) => g.cat === c.id).map((g) => g.path)));
        bin(jOld.floorUp, oldH(now));
      } else if (was >= 0 && now >= 0) {
        const a = units[was], b = units[now];
        const ab = Math.atan2(b.y - a.y, b.x - a.x), ba = ab + Math.PI;
        const hA = formed[was] ? D.heightToward(formed[was], ab) : 1.05;
        const hB = formed[now] ? D.heightToward(formed[now], ba) : 1.05;
        bin(jNew.unitToUnit, hB - hA);
        bin(jOld.unitToUnit, oldH(now) - oldH(was));
      } else if (was >= 0 && now < 0) {
        const th = Math.atan2(c.walker.y - units[was].y, c.walker.x - units[was].x);
        bin(jNew.unitDown, formed[was] ? D.heightToward(formed[was], th) : 1.05);
        bin(jOld.unitDown, oldH(was));
      }
      where[i] = now;
      if (now < 0) lastFloor[i] = { x: c.walker.x, y: c.walker.y };
    });
  }
  const r = { seed, T, roles, meetRoof, oldMeetRoof, clipped, jNew, jOld };
  report.push(r);
  console.log(JSON.stringify(r));
}
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
await server.close();
