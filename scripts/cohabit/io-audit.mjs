/**
 * 输入到输出的规则是不是全的（2026-11-17，项目二_输入到输出的规则.md §17）。
 *
 * 用 2-15 的配置（6 人 4 猫、20 座、会动的单元、引导开）实跑，每一步对每台单元核对：
 *   - 这一步它在往下落（程度在涨）⇒ 文档 §8.2 列的六个理由里至少有一个成立；一个都不成立记成「说不清的落下」；
 *   - 有理由却没在落（程度没到 1 也没涨）⇒ 被三道检查里的哪一道拦了，或是猫刚决定、那 1 s 预备还没开始算；都不是记成「说不清的没落」；
 *   - 人的痕迹场、猫的痕迹场整场是不是都是 0（现行规则不读痕迹）。
 * 另外数每个理由各触发几次落下，以及 2-15 的抽签给同一个理由落下的台各成了什么形。
 *
 * 用法：node scripts/cohabit/io-audit.mjs [秒数=600] [种子,逗号分隔=11,12,13,14]
 */
import { createServer } from 'vite';

const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const C = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
const S = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
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
const drops = Object.fromEntries(REASONS.map((r) => [r, 0]));
const forms = {}; // 理由 → { flat, half, full }
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
  const serial = new Int32Array(n);
  const dt = 1 / 30;
  for (let t = 0; t < T; t += dt) {
    sim.step(dt);
    total.steps++;
    // 这一步每台各有哪些理由（只读仿真对外的状态，照文档 §8.2 的写法重算，不读 stepSpace 里面的量）
    const why = Array.from({ length: n }, () => new Set());
    for (let u = 0; u < n; u++) if (sim.tableBy[u] >= 0) why[u].add('table');
    for (const g of sim.guides) {
      if (g.kind === 'stand') {
        why[g.path[1]].add('offer');
        continue;
      }
      const cat = sim.cats.find((c) => c.id === g.cat);
      const first = cat.unit ? 1 : 0;
      const last = g.path.length - 1;
      const to = sim.guide.whole ? last : first;
      for (let k = first; k <= to && k <= last; k++) why[g.path[k]].add(k === last ? 'meet' : 'step');
    }
    for (const c of sim.cats) {
      if (c.climb) why[c.climb.unit.i].add('climb');
      if (!c.unit) continue;
      for (const u of sim.supportOf(c)) why[u.i].add('foot');
      if (c.pending) why[c.pending.i].add('go');
    }
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
      // 一次落下的开头：按理由记数，并照 2-15 台架的写法抽一次形
      if (prev[u] <= 1e-4 && d > 1e-4) {
        const r = REASONS.find((k) => why[u].has(k));
        if (!r) dropsNoReason++;
        else {
          drops[r]++;
          const plan = S.unitFormPlan({
            seed,
            unit: u,
            serial: serial[u]++,
            layout: sim.layout,
            at: sim.layout.units[u],
            seated: seated.map((p) => sim.seats[p.seat]),
            rects: sim.furn.rects,
            tableUnit: sim.tableBy[u] >= 0 || sim.seats.some((st) => st.table === u),
            count: BANDS,
          });
          (forms[r] ??= { flat: 0, half: 0, full: 0 })[plan.form]++;
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
console.log(`  猫刚决定、预备的 1 s 还没开始算 ${total.prepWait}`);
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
console.log(`\n五、每个理由各触发几次落下（${seeds.length} 个种子合计 / 平均每场），以及 2-15 的抽签给它们成了什么形`);
for (const r of REASONS) {
  const f = forms[r] ?? { flat: 0, half: 0, full: 0 };
  console.log(`  ${NAME[r].padEnd(12, '　')} ${String(drops[r]).padStart(4)} / ${(drops[r] / seeds.length).toFixed(1).padStart(5)}    平台 ${f.flat} · 半圈有顶的两层 ${f.half} · 整圈两层 ${f.full}`);
}
await server.close();
