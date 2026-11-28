/**
 * 输入到输出的规则是不是全的（2026-11-17，项目二_输入到输出的规则.md 附录 H）。
 *
 * 用 2-15 的配置（6 人 4 猫、20 座、会动的单元、引导开）实跑，每一步对每台单元核对：
 *   - 这一步它在往下落（程度在涨）⇒ 文档第 4、5 节列的六个理由里至少有一个成立；一个都不成立记成「说不清的落下」；
 *   - 有理由却没在落（程度没到 1 也没涨）⇒ 被三道检查里的哪一道拦了，或是猫刚决定的那一步（请求从 0 起涨）；都不是记成「说不清的没落」；
 *   - 人的痕迹场、猫的痕迹场整场是不是都是 0（现行规则不读痕迹）。
 * 另外数每个理由各触发几次落下，以及 2-15 的抽签给同一个理由落下的台各成了什么形。
 * 11-19 加两项：正文第 4 节五行的前提逐条核对（② 站着给一步、③④ 坐着引猫在给着 / 引着的每一步前提都成立吗；
 * ① 每次带开始收开是谁请求的：走着的人、只有站着的人、只有坐着的人），以及单元与带落、收一次各要几秒（第 6 节的数）。
 *
 * 理由与带的请求人取自 src/lib/space/cohabit-reasons.ts（网页上的规则读数用同一份）。
 *
 * 用法：node scripts/cohabit/io-audit.mjs [秒数=600] [种子,逗号分隔=11,12,13,14]
 */
import { createServer } from 'vite';

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const C = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
const S = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
const R = await server.ssrLoadModule('/src/lib/space/cohabit-reasons.ts');
const T = Number(process.argv[2] ?? 600);
const seeds = (process.argv[3] ?? '11,12,13,14').split(',').map(Number);
const BANDS = C.COHABIT.FACES.BANDS;
const REASONS = ['table', 'step', 'meet', 'offer', 'foot', 'go', 'climb'];
const NAME = { table: '桌子', step: '引猫：路上的一步', meet: '引猫：座位前方那台', offer: '站着给一步', foot: '猫脚下', go: '猫要去的台', climb: '猫要跳上的台' };

/**
 * 「猫要去的台」在猫决定以后的 1 s 预备里按进度落（请求 = 等了多久 ÷ 预备时长）：猫刚决定的那一步请求是 0，
 * 这一步不涨是规则本身，不算被拦。只有这一个理由、且程度已经到了按进度该到的地方，才归到这里。
 */
function prepOnly(sim, u, why, d) {
  if (why.size !== 1 || !why.has('go')) return false;
  const c = sim.cats.find((q) => q.pending && q.pending.i === u);
  if (!c) return false;
  const want = Math.min(1, Math.min(1, c.waited / sim.cat.prepare) / sim.act.fill);
  return d >= want - 1e-6;
}

const total = { prepWait: 0, steps: 0, rising: 0, unexplainedRise: 0, wanted: 0, vetoHead: 0, vetoPress: 0, vetoR5: 0, unexplainedStall: 0, traceMax: 0, catTraceMax: 0, bandOpened: 0, bandOpenNoWant: 0 };
// 11-19 加：正文第 4 节五行的前提逐条核对（只读仿真对外的状态）
const rel = {
  standSteps: 0, standBad: 0, standBadWhy: {},
  sitSteps: 0, sitBad: 0, sitBadWhy: {},
  bandStarts: 0, bandByWalk: 0, bandByStill: 0, bandBySeated: 0, bandUnexplained: 0,
};
const rise = []; // 从收着到落满、中途没往回走：用了几秒
const fall = []; // 从落满到收回、中途没往上走：用了几秒
const bandOpenT = [];
const bandCloseT = [];
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : NaN);
const bad = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
const drops = Object.fromEntries(REASONS.map((r) => [r, 0]));
const forms = {}; // 理由 → { flat, half, tea }
let dropsNoReason = 0;
const stallBy = {};
const samples = [];

for (const seed of seeds) {
  const sim = new C.CohabitSim({ trigger: 'posture', grid: C.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed, opening: false, auto: true, faces: true, social: true, catFloor: true, cat: { ...C.COHABIT.CAT_MT, ...C.COHABIT.CAT_LEVELS.mid }, guide: C.COHABIT.GUIDE, pace: C.PACE_DEMO });
  const half = sim.layout.fieldM / 2;
  C.partySizes(S.SCENE.people).forEach((sz, i, a) => {
    const ang = (i / a.length) * 2 * Math.PI + 0.3;
    sim.addParty(Math.cos(ang) * half * 0.6, Math.sin(ang) * half * 0.6, sz);
  });
  C.scatterCats(sim, S.SCENE.cats, seed);
  const n = sim.layout.units.length;
  const prev = Float64Array.from(sim.act.degree);
  const prevOpen = Float32Array.from(sim.bandOpen);
  const dt = 1 / 30;
  // 落 / 收计时：-1 = 没在计
  const riseAt = new Float64Array(n).fill(-1);
  const fallAt = new Float64Array(n).fill(-1);
  const bandUpAt = new Float64Array(sim.bandOpen.length).fill(-1);
  const bandDownAt = new Float64Array(sim.bandOpen.length).fill(-1);
  const prevDeg = Float64Array.from(sim.act.degree);
  const STAND_S = C.COHABIT.SEATS.STAND_S;
  for (let t = 0; t < T; t += dt) {
    sim.step(dt);
    total.steps++;
    // ── 第 4 节五行的前提 ──
    for (const g of sim.guides) {
      const p = sim.people.find((q) => q.id === g.person);
      const c = sim.cats.find((q) => q.id === g.cat);
      if (g.kind === 'stand') {
        // ②：人站住（没坐、没在走）看着这只猫满 3 s；猫在台上；递的是猫相邻的台，比猫现在离人更近
        rel.standSteps++;
        const w = p.walker;
        const [from, to] = g.path;
        const U = sim.layout.units;
        const nb = sim.neighboursOf(U[from]).some((u) => u.i === to);
        const closer = Math.hypot(U[to].x - w.x, U[to].y - w.y) < Math.hypot(U[from].x - w.x, U[from].y - w.y);
        const why = p.seated ? '坐着' : w.state === 'walk' ? '在走' : p.watching !== c.id ? '没看着这只猫' : p.watchFor < STAND_S ? '没满 3 s' : !c.unit ? '猫不在台上' : !nb ? '不是相邻的台' : !closer ? '没更近' : c.latency > 0 ? '猫在退开后的 30 s 里' : null;
        if (why) { rel.standBad++; bad(rel.standBadWhy, why); }
      } else {
        // ③④：人坐着；猫不在退开后的 30 s 里；路的终点 = 这个座位此刻的「人面前那台」；路上没有落不下来的台
        rel.sitSteps++;
        const end = g.path[g.path.length - 1];
        const target = p.seated && p.seat !== null ? sim.guideTarget(sim.seats[p.seat], 'meet') : -2;
        const why = !p.seated ? '没坐着' : c.latency > 0 ? '猫在退开后的 30 s 里' : end !== target ? '终点不是人面前那台' : g.path.some((u) => sim.overSeated[u]) ? '路过坐着的人头顶' : c.climb ? '猫正要跳上别的台' : null;
        if (why) { rel.sitBad++; bad(rel.sitBadWhy, why); }
      }
    }
    // 带开始收开：是谁请求的（身边 0.37 m 以内，或走着的人前方的路线上）
    for (let i = 0; i < sim.bandOpen.length; i++) {
      if (!(prevOpen[i] <= 1e-9 && sim.bandOpen[i] > 1e-9)) continue;
      rel.bandStarts++;
      let walk = false, still = false, seated = false;
      for (const p of R.bandRequesters(sim, (i / BANDS) | 0, i % BANDS)) {
        if (p.seated) seated = true;
        else if (p.walker.state === 'walk' && p.mode !== 'held') walk = true;
        else still = true;
      }
      if (walk) rel.bandByWalk++;
      else if (still) rel.bandByStill++;
      else if (seated) rel.bandBySeated++;
      else rel.bandUnexplained++;
    }
    // 落 / 收用了几秒（只计中途没往回走的那一段）
    for (let u = 0; u < n; u++) {
      const d = sim.act.degree[u];
      const p0 = prevDeg[u];
      if (p0 <= 1e-9 && d > 1e-9) riseAt[u] = sim.t - dt;
      if (riseAt[u] >= 0 && d < p0 - 1e-12) riseAt[u] = -1;
      if (riseAt[u] >= 0 && d >= 1 - 1e-9) { rise.push(sim.t - riseAt[u]); riseAt[u] = -1; }
      if (p0 >= 1 - 1e-9 && d < 1 - 1e-9) fallAt[u] = sim.t - dt;
      if (fallAt[u] >= 0 && d > p0 + 1e-12) fallAt[u] = -1;
      if (fallAt[u] >= 0 && d <= 1e-9) { fall.push(sim.t - fallAt[u]); fallAt[u] = -1; }
      prevDeg[u] = d;
    }
    for (let i = 0; i < sim.bandOpen.length; i++) {
      const o = sim.bandOpen[i];
      const p0 = prevOpen[i];
      if (p0 <= 1e-9 && o > 1e-9) bandUpAt[i] = sim.t - dt;
      if (bandUpAt[i] >= 0 && o < p0 - 1e-12) bandUpAt[i] = -1;
      if (bandUpAt[i] >= 0 && o >= 1 - 1e-9) { bandOpenT.push(sim.t - bandUpAt[i]); bandUpAt[i] = -1; }
      if (p0 >= 1 - 1e-9 && o < 1 - 1e-9) bandDownAt[i] = sim.t - dt;
      if (bandDownAt[i] >= 0 && o > p0 + 1e-12) bandDownAt[i] = -1;
      if (bandDownAt[i] >= 0 && o <= 1e-9) { bandCloseT.push(sim.t - bandDownAt[i]); bandDownAt[i] = -1; }
    }
    // 这一步每台各有哪些理由（只读仿真对外的状态，照文档第 4、5 节的写法重算，不读 stepSpace 里面的量）
    const why = R.unitReasons(sim).map((rs) => new Set(rs.map((r) => r.kind)));
    const seated = sim.people.filter((p) => p.seated && p.seat !== null);
    const standing = sim.people.filter((p) => !p.seated && p.walker.present);
    for (let u = 0; u < n; u++) {
      const d = sim.act.degree[u];
      const rising = d > prev[u] + 1e-9;
      const has = why[u].size > 0;
      if (rising) {
        total.rising++;
        if (!has) total.unexplainedRise++;
      }
      if (has) {
        total.wanted++;
        if (!rising && d < 1 - 1e-9) {
          // 有理由却没落：哪一道检查拦的
          const U = sim.layout.units[u];
          if (seated.some((p) => sim.overHead(U, p.walker.x, p.walker.y))) total.vetoHead++;
          else if (sim.heldR5[u]) total.vetoR5++;
          else if (standing.some((p) => C.unitReaches(sim.layout, U, p.walker.x, p.walker.y, 0.22))) total.vetoPress++;
          else if (sim.blocked[u]) total.vetoPress++;
          else if (prepOnly(sim, u, why[u], d)) total.prepWait++;
          else {
            total.unexplainedStall++;
            const k = [...why[u]].sort().join('+');
            stallBy[k] = (stallBy[k] ?? 0) + 1;
            if (samples.length < 6) {
              const c = sim.cats.find((q) => q.pending && q.pending.i === u);
              samples.push({ seed, t: +sim.t.toFixed(2), u, why: k, d: +d.toFixed(3), prev: +prev[u].toFixed(3), waited: c ? +c.waited.toFixed(3) : null, catState: c ? c.state : null });
            }
          }
        }
      }
      // 一次落下的开头：按理由记数，并照 2-15 的写法定一次形
      if (prev[u] <= 1e-4 && d > 1e-4) {
        const r = REASONS.find((k) => why[u].has(k));
        if (!r) dropsNoReason++;
        else {
          drops[r]++;
          const plan = S.unitFormPlan({
            layout: sim.layout,
            at: sim.layout.units[u],
            seated: seated.map((p) => sim.seats[p.seat]),
            rects: sim.furn.rects,
            tableUnit: sim.tableBy[u] >= 0 || sim.seats.some((st) => st.table === u),
            count: BANDS,
          });
          (forms[r] ??= { flat: 0, half: 0, tea: 0 })[plan.form]++;
        }
      }
      prev[u] = d;
    }
    for (let i = 0; i < sim.bandOpen.length; i++) {
      if (sim.bandOpen[i] > prevOpen[i] + 1e-9) {
        total.bandOpened++;
        if (!sim.bandWant[i] || sim.bandHold[i]) total.bandOpenNoWant++;
      }
      prevOpen[i] = sim.bandOpen[i];
    }
    for (const v of sim.field.data) if (v > total.traceMax) total.traceMax = v;
    for (const v of sim.catField.data) if (v > total.catTraceMax) total.catTraceMax = v;
  }
}

console.log(`配置：2-15 标准场景 · ${S.SCENE.people} 人 ${S.SCENE.cats} 猫 · ${T} s × ${seeds.length} 个种子（${seeds.join(', ')}）· ${total.steps} 步`);
console.log('\n一、每一次落下都说得清吗');
console.log(`  单元在往下落的 台·步        ${total.rising}`);
console.log(`  其中六个理由一个都不成立    ${total.unexplainedRise}`);
console.log(`  落下的开头（从收着到开始落）${Object.values(drops).reduce((a, b) => a + b, 0) + dropsNoReason} 次，其中没有理由的 ${dropsNoReason} 次`);
console.log('\n二、有理由却没落，是哪道检查拦的');
console.log(`  有理由的 台·步              ${total.wanted}`);
console.log(`  盖着坐着的人头顶            ${total.vetoHead}`);
console.log(`  台角会顶到站着的人          ${total.vetoPress}`);
console.log(`  谁都不被困住（R5）          ${total.vetoR5}`);
console.log(`  猫刚决定的那一步（请求从 0 起涨） ${total.prepWait}`);
console.log(`  以上都不是却没落            ${total.unexplainedStall}`);
if (total.unexplainedStall) {
  console.log('    按理由分', JSON.stringify(stallBy));
  console.log('    例子', JSON.stringify(samples));
}
console.log('\n三、带');
console.log(`  带在收开的 带·步            ${total.bandOpened}`);
console.log(`  其中不是让路请求的          ${total.bandOpenNoWant}`);
console.log('\n四、痕迹');
console.log(`  人的痕迹场整场最大值        ${total.traceMax}`);
console.log(`  猫的痕迹场整场最大值        ${total.catTraceMax}`);
console.log(`\n五、每个理由各触发几次落下（${seeds.length} 个种子合计 / 平均每场），以及 2-15 给它们成了什么形`);
for (const r of REASONS) {
  const f = forms[r] ?? { flat: 0, half: 0, tea: 0 };
  console.log(`  ${NAME[r].padEnd(12, '　')} ${String(drops[r]).padStart(4)} / ${(drops[r] / seeds.length).toFixed(1).padStart(5)}    平台 ${f.flat} · 半圈有顶的两层 ${f.half} · 茶几兼猫台 ${f.tea}`);
}
console.log('\n六、正文第 4 节五行的前提（11-19 加）');
console.log(`  ② 站着给一步：在给着的 人·步 ${rel.standSteps}，前提不成立的 ${rel.standBad}`, rel.standBad ? JSON.stringify(rel.standBadWhy) : '');
console.log(`  ③④ 坐着引猫：在引着的 人·步 ${rel.sitSteps}，前提不成立的 ${rel.sitBad}`, rel.sitBad ? JSON.stringify(rel.sitBadWhy) : '');
console.log(`  ① 带开始收开 ${rel.bandStarts} 次：有走着的人请求 ${rel.bandByWalk} · 只有站着的人 ${rel.bandByStill} · 只有坐着的人 ${rel.bandBySeated} · 说不清 ${rel.bandUnexplained}`);
console.log('\n七、单元与带动一次要几秒（中途没往回走的那些，取中位）');
console.log(`  单元从收着到落满 ${median(rise).toFixed(2)} s（${rise.length} 次） · 从落满到收回 ${median(fall).toFixed(2)} s（${fall.length} 次）`);
console.log(`  带收开 ${median(bandOpenT).toFixed(2)} s（${bandOpenT.length} 次） · 带落回 ${median(bandCloseT).toFixed(2)} s（${bandCloseT.length} 次）`);
await server.close();
