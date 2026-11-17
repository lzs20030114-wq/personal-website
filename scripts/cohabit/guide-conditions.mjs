/**
 * 「把猫引向人」这条规则的条件各占多少时间（2026-11-17，项目二_输入到输出的规则.md §17）。
 *
 * 2-15 的配置实跑。每一步对每位坐着的人归一类：
 *   没有落得下的终点 · 没有能来的猫（再分：都被别人引着 / 刚退开 / 正要跳上别的台）· 有猫但找不到路 · 正在引 · 猫已经到了终点
 * 另外按「一次坐下」数：这一回坐着有没有等到猫走到座位前方那台、等了多久；被引的猫当时在做什么；
 * 几位坐着的人同时没有猫可引时，猫归了谁。
 *
 * 用法：node scripts/cohabit/guide-conditions.mjs [秒数=1800] [种子=11,12,13,14,15,16,17,18]
 */
import { createServer } from 'vite';

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const C = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
const S = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
const T = Number(process.argv[2] ?? 1800);
const seeds = (process.argv[3] ?? '11,12,13,14,15,16,17,18').split(',').map(Number);

const sec = { seated: 0, noTarget: 0, noCatGuided: 0, noCatLatency: 0, noCatClimb: 0, noCatOther: 0, noPath: 0, guiding: 0, arrived: 0 };
const catDoing = {}; // 被引着（还没到）的猫此刻的状态 → 秒
const catWhere = { unit: 0, floor: 0 };
const toward = { same: 0, other: 0 }; // 被引的猫正在靠近的是引它的那个人，还是别人
const sits = []; // 每一回坐下：{ len, firstGuide, arrive }
const pathLen = {};
let seatsNoTargetEver = 0;
let seatsTotal = 0;

for (const seed of seeds) {
  const sim = new C.CohabitSim({ trigger: 'posture', grid: C.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed, opening: false, auto: true, faces: true, social: true, catFloor: true, cat: { ...C.COHABIT.CAT_MT, ...C.COHABIT.CAT_LEVELS.mid }, guide: C.COHABIT.GUIDE, pace: C.PACE_DEMO });
  const half = sim.layout.fieldM / 2;
  C.partySizes(S.SCENE.people).forEach((sz, i, a) => {
    const ang = (i / a.length) * 2 * Math.PI + 0.3;
    sim.addParty(Math.cos(ang) * half * 0.6, Math.sin(ang) * half * 0.6, sz);
  });
  C.scatterCats(sim, S.SCENE.cats, seed);
  if (seed === seeds[0]) {
    // 空房间里（没人坐着）每个座位自己有没有落得下的终点：座位前方 1.0–1.5 m 的候选一台都没有的座位数
    seatsTotal = sim.seats.length;
    seatsNoTargetEver = sim.seats.filter((s) => s.meets.length === 0).length;
  }
  const open = new Map(); // 访客 id → 这一回坐下的记录
  const dt = 1 / 30;
  for (let t = 0; t < T; t += dt) {
    sim.step(dt);
    const guideOf = new Map(sim.guides.filter((g) => g.kind === 'sit').map((g) => [g.person, g]));
    const guidedCats = new Set(sim.guides.map((g) => g.cat));
    for (const p of sim.people) {
      if (!p.seated || p.seat === null) {
        const e = open.get(p.id);
        if (e) {
          sits.push(e);
          open.delete(p.id);
        }
        continue;
      }
      let e = open.get(p.id);
      if (!e) {
        e = { len: 0, firstGuide: null, arrive: null };
        open.set(p.id, e);
      }
      e.len += dt;
      sec.seated += dt;
      const target = sim.guideTarget(sim.seats[p.seat], 'meet');
      if (target < 0) {
        sec.noTarget += dt;
        continue;
      }
      const there = sim.cats.some((c) => c.unit && c.unit.i === target && !c.transfer);
      if (there) {
        sec.arrived += dt;
        if (e.arrive === null) e.arrive = e.len;
        continue;
      }
      const g = guideOf.get(p.id);
      if (g) {
        sec.guiding += dt;
        if (e.firstGuide === null) e.firstGuide = e.len;
        const c = sim.cats.find((k) => k.id === g.cat);
        catDoing[c.state] = (catDoing[c.state] ?? 0) + dt;
        if (c.state === 'approach') toward[c.approaching === p.id ? 'same' : 'other'] += dt;
        catWhere[c.unit ? 'unit' : 'floor'] += dt;
        continue;
      }
      // 没在引：是没有能来的猫，还是有猫找不到路
      const cand = sim.cats.filter((c) => !guidedCats.has(c.id));
      const free = cand.filter((c) => c.latency <= 0 && c.mode !== 'held' && (c.unit || !c.climb));
      if (free.length) sec.noPath += dt;
      else if (!cand.length) sec.noCatGuided += dt;
      else if (cand.some((c) => c.latency > 0)) sec.noCatLatency += dt;
      else if (cand.some((c) => !c.unit && c.climb)) sec.noCatClimb += dt;
      else sec.noCatOther += dt;
    }
    for (const g of sim.guides) if (g.kind === 'sit' && t % 1 < dt) pathLen[g.path.length] = (pathLen[g.path.length] ?? 0) + 1;
  }
  for (const e of open.values()) sits.push(e);
}

const pct = (v) => `${((100 * v) / sec.seated).toFixed(1)}%`;
const med = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
console.log(`配置：2-15 标准场景 · ${S.SCENE.people} 人 ${S.SCENE.cats} 猫 · ${T} s × ${seeds.length} 个种子`);
console.log(`座位 ${seatsTotal} 个，其中座位前方 1.0–1.5 m 一台候选都没有的 ${seatsNoTargetEver} 个`);
console.log(`\n一、人坐着的时间里（共 ${Math.round(sec.seated)} 人·秒），引猫这条规则在哪一步`);
console.log(`  没有落得下的终点          ${pct(sec.noTarget)}`);
console.log(`  没有能来的猫              ${pct(sec.noCatGuided + sec.noCatLatency + sec.noCatClimb + sec.noCatOther)}`);
console.log(`    其中 猫都被别人引着     ${pct(sec.noCatGuided)}`);
console.log(`         剩下的猫刚退开     ${pct(sec.noCatLatency)}`);
console.log(`         剩下的猫正要跳上别的台 ${pct(sec.noCatClimb)}`);
console.log(`         其他               ${pct(sec.noCatOther)}`);
console.log(`  有能来的猫但找不到路      ${pct(sec.noPath)}`);
console.log(`  正在引（路上）            ${pct(sec.guiding)}`);
console.log(`  猫已经在座位前方那台      ${pct(sec.arrived)}`);
const gTot = Object.values(catDoing).reduce((a, b) => a + b, 0);
console.log(`\n二、正在被引的猫此刻在做什么（共 ${Math.round(gTot)} 秒）`);
for (const [k, v] of Object.entries(catDoing).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(10)} ${((100 * v) / gTot).toFixed(1)}%`);
console.log(`  在台上 ${((100 * catWhere.unit) / gTot).toFixed(1)}% · 在地面 ${((100 * catWhere.floor) / gTot).toFixed(1)}%`);
console.log(`  其中正在靠近：引它的那个人 ${((100 * toward.same) / gTot).toFixed(1)}% · 别的人 ${((100 * toward.other) / gTot).toFixed(1)}%`);
const done = sits.filter((e) => e.len > 30);
const got = done.filter((e) => e.arrive !== null);
const guided = done.filter((e) => e.firstGuide !== null);
console.log(`\n三、按一回坐下数（坐满 30 s 以上的 ${done.length} 回，中位坐 ${Math.round(med(done.map((e) => e.len)))} s）`);
console.log(`  这一回里空间为他引过猫      ${guided.length} 回（${((100 * guided.length) / done.length).toFixed(0)}%），坐下到开始引的中位 ${med(guided.map((e) => e.firstGuide)).toFixed(1)} s`);
console.log(`  这一回里有猫到了座位前方那台 ${got.length} 回（${((100 * got.length) / done.length).toFixed(0)}%），坐下到猫到的中位 ${Math.round(med(got.map((e) => e.arrive)))} s`);
console.log(`\n四、引猫的路有几台（每秒采一次）`, JSON.stringify(pathLen));
await server.close();
