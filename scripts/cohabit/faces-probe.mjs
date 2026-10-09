// 探针（让路只收挡路的带，2026-10-07）：三个场景看机制对不对——
//  ① 人站在中心交叉点：四邻单元照落（不再整个单元被闸住）、只有朝人的那几条带收回；
//  ② 人沿两台落下单元之间的过道走：门提前开、人等多久、过得去不；
//  ③ 猫坐在单元中心：那台一条带都不收，邻台照收。
import { createServer } from 'vite';
const server = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { CohabitSim, COHABIT, edgeOpen } = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const B = COHABIT.FACES.BANDS;
  const openOf = (sim, u) => { let n = 0; for (let j = 0; j < B; j++) if (sim.bandOpen[u * B + j] >= 0.5) n++; return n; };
  const feed = (sim, units, dt) => { for (const u of units) sim.field.imprint(sim.layout.units[u].x, sim.layout.units[u].y, sim.layout.platR, dt); };

  // ① 中心交叉点
  {
    const sim = new CohabitSim({ seed: 1, opening: false, auto: false, faces: true, fade: null, threshold: 1 });
    const p = sim.addPerson(0, 0); p.mode = 'manual';
    for (let i = 0; i < 300; i++) { feed(sim, [5, 6, 9, 10], 1 / 30); sim.step(1 / 30); }
    const deg = [5, 6, 9, 10].map((u) => sim.act.degree[u].toFixed(2));
    console.log(`① 人在中心交叉点 · 四邻程度 ${deg.join(' ')} · 各收回带数 ${[5, 6, 9, 10].map((u) => openOf(sim, u)).join(' ')} · R5 钉住 ${sim.heldR5.reduce((a, b) => a + b, 0)} · 墙 ${sim.wall.reduce((a, b) => a + b, 0)}`);
    const whole = new CohabitSim({ seed: 1, opening: false, auto: false, faces: false, fade: null, threshold: 1 });
    const q = whole.addPerson(0, 0); q.mode = 'manual';
    for (let i = 0; i < 300; i++) { feed(whole, [5, 6, 9, 10], 1 / 30); whole.step(1 / 30); }
    console.log(`   整个单元让路对照 · 四邻程度 ${[5, 6, 9, 10].map((u) => whole.act.degree[u].toFixed(2)).join(' ')} · 闸住 ${whole.blocked.reduce((a, b) => a + b, 0)}`);
  }
  // ② 过道
  {
    const sim = new CohabitSim({ seed: 2, opening: false, auto: false, faces: true, fade: null, threshold: 1 });
    const l = sim.layout; const g = sim.graph;
    for (let i = 0; i < 120; i++) { feed(sim, [5, 9], 1 / 30); sim.step(1 / 30); }
    const k = g.edges.findIndex((e) => (e.sideA === 5 && e.sideB === 9) || (e.sideA === 9 && e.sideB === 5));
    console.log(`② 两台落下（程度 ${sim.act.degree[5].toFixed(2)} / ${sim.act.degree[9].toFixed(2)}）· 那条边此刻 ${edgeOpen(l, g, k, sim.wall, sim.bandWall) ? '能过' : '堵'} · 按「开得了的」算 ${edgeOpen(l, g, k, sim.wall, sim.bandHard) ? '能过' : '堵'}`);
    const a = g.nodes[g.edges[k].a], b = g.nodes[g.edges[k].b];
    const p = sim.addPerson(a.x, a.y); p.mode = 'manual';
    p.walker.pushTarget({ x: b.x, y: b.y });
    let t = 0, waited = 0, passed = -1;
    for (let i = 0; i < 30 * 20; i++) {
      feed(sim, [5, 9], 1 / 30);
      const x0 = p.walker.x;
      sim.step(1 / 30); t += 1 / 30;
      if (p.walker.state === 'walk' && Math.abs(p.walker.x - x0) < 1e-9) waited += 1 / 30;
      if (passed < 0 && p.walker.state !== 'walk') passed = t;
    }
    console.log(`   人从 (${a.x.toFixed(2)},${a.y.toFixed(2)}) 走到 (${b.x.toFixed(2)},${b.y.toFixed(2)})：${passed > 0 ? `${passed.toFixed(1)} s 走完（直走 ${(Math.hypot(b.x - a.x, b.y - a.y) / 0.7).toFixed(1)} s）· 门口等了 ${waited.toFixed(1)} s` : '20 s 没走完'} · 5/9 收回带数 ${openOf(sim, 5)} / ${openOf(sim, 9)}`);
  }
  // ③ 猫
  {
    const sim = new CohabitSim({ seed: 3, opening: false, auto: false, faces: true, fade: null, threshold: 1 });
    const cat = sim.addCat(sim.layout.units[5]); cat.mode = 'manual';
    const u5 = sim.layout.units[5], u9 = sim.layout.units[9];
    const p = sim.addPerson((u5.x + u9.x) / 2 - 0.3, (u5.y + u9.y) / 2); p.mode = 'manual';
    for (let i = 0; i < 300; i++) { feed(sim, [5, 9], 1 / 30); sim.step(1 / 30); }
    console.log(`③ 猫坐在 5 的中心、人站在 5/9 之间 · 5 收回 ${openOf(sim, 5)} 条（护住 ${sim.bandHold.slice(5 * B, 6 * B).reduce((a, b) => a + b, 0)}）· 9 收回 ${openOf(sim, 9)} 条 · 开不了的墙带 ${sim.bandHard.reduce((a, b) => a + b, 0)}`);
    // 猫挪到台边朝人：只护那几条
    cat.walker.place(u5.x + (p.walker.x - u5.x) / Math.hypot(p.walker.x - u5.x, p.walker.y - u5.y) * (sim.layout.platR - COHABIT.CAT.bodyR), u5.y + (p.walker.y - u5.y) / Math.hypot(p.walker.x - u5.x, p.walker.y - u5.y) * (sim.layout.platR - COHABIT.CAT.bodyR));
    for (let i = 0; i < 120; i++) { feed(sim, [5, 9], 1 / 30); sim.step(1 / 30); }
    console.log(`   猫到台边朝人 · 5 护住 ${sim.bandHold.slice(5 * B, 6 * B).reduce((a, b) => a + b, 0)} 条 · 收回 ${openOf(sim, 5)} 条`);
  }
} finally { await server.close(); }
