// 呼吸探针（2026-10-20，作者「呼吸本来就是生物的固有生理信号，不会根据性格产生差异，倒是会因为互动产生的情绪变化
// 造成呼吸的急促」）。问的是：四种人格平时的呼吸差多少、人来了 / 被碰过之后呼吸变了多少。
//
//   node scripts/behavior/breath-probe.mjs [N=8]
//
// 引擎取站上模块（vite ssrLoadModule）。成长段、生命钟 ×1、自发与转向照常。三个场景（每种人格 × N 个种子）：
//   R  没有人：settle 10 s 后量 60 s
//   N  人从远到近（0 / 3 / 6 s 远 · 中 · 近，方位 0），近处停 40 s；量到近处后的 10–40 s。不碰
//   S  没有人：连着三下（戳 0.6 · 3 s 后拍 0.3 · 6 s 后再戳 0.6），量第一下后 8–23 s（「被碰过之后」）与 30–50 s（「缓过来」）
// 量（窗内）：bpm = 每分钟几口气（相位回绕次数，按窗长折算）；T = 一口气实际走多长（相邻两次回绕之间，s）；
//   amp = 每口气呼吸行程的峰峰值（行程分数）；arousal = 唤醒度均值
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const N = Number(process.argv[2] ?? 8);
const HZ = 60;

const { createServer } = await import(pathToFileURL(join(REPO, 'node_modules/vite/dist/node/index.js')).href);
const server = await createServer({
  root: REPO,
  configFile: false,
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
const { BehaviorEngine } = await server.ssrLoadModule('/src/lib/linkage/behavior/engine.ts');
const { PERSONA_KEYS, PERSONAS } = await server.ssrLoadModule('/src/lib/linkage/behavior/persona.ts');

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
};

/** 跑一场，按窗返回指标。windows = [{ name, from, to }]（相对 t0 的秒），inputs = [{ at, i }] */
function trial(P, seed, inputs, windows, span) {
  const order = [P, ...PERSONA_KEYS.filter((k) => k !== P)];
  const e = new BehaviorEngine({ seed, order, loop: false, lifeRate: 1 });
  e.skip();
  e.tick();
  e.drain();
  const t0 = e.time + 10;
  const tEnd = t0 + span;
  const ins = inputs.map((x) => ({ t: t0 + x.at, i: x.i })).sort((a, b) => a.t - b.t);
  let ii = 0;
  let prevPhi = e.state.phi;
  // 每口气：开始时刻、窗内 s 的最小 / 最大
  let cur = null;
  const breaths = [];
  const ar = windows.map(() => []);
  while (e.time < tEnd) {
    while (ii < ins.length && ins[ii].t <= e.time + 1e-9) e.push(ins[ii++].i);
    e.tick();
    e.drain();
    const st = e.state;
    const s = e.targets().breath.s;
    const rel = e.time - t0;
    windows.forEach((w, k) => {
      if (rel >= w.from && rel < w.to) ar[k].push(st.arousal);
    });
    if (st.phi < prevPhi - 0.5) {
      if (cur) breaths.push({ a: cur.a, b: e.time - t0, lo: cur.lo, hi: cur.hi });
      cur = { a: e.time - t0, lo: s, hi: s };
    } else if (cur) {
      cur.lo = Math.min(cur.lo, s);
      cur.hi = Math.max(cur.hi, s);
    }
    prevPhi = st.phi;
  }
  return windows.map((w, k) => {
    // 整口气都落在窗内的才算周期与幅度；口气数按窗内回绕次数
    const inW = breaths.filter((b) => b.a >= w.from && b.b <= w.to);
    const wraps = breaths.filter((b) => b.b >= w.from && b.b < w.to).length;
    return {
      bpm: (wraps * 60) / (w.to - w.from),
      T: mean(inW.map((b) => b.b - b.a)),
      amp: mean(inW.map((b) => b.hi - b.lo)),
      arousal: mean(ar[k]),
    };
  });
}

const SCEN = {
  R: { span: 60, inputs: [], windows: [{ name: '没有人', from: 0, to: 60 }] },
  N: {
    span: 46,
    inputs: [
      { at: 0, i: { kind: 'PRESENCE', band: 'far', bearing: 0 } },
      { at: 3, i: { kind: 'PRESENCE', band: 'mid', bearing: 0 } },
      { at: 6, i: { kind: 'PRESENCE', band: 'near', bearing: 0 } },
    ],
    windows: [{ name: '人在近处', from: 16, to: 46 }],
  },
  S: {
    span: 50,
    inputs: [
      { at: 0, i: { kind: 'SHELL_STROKE', half: 'L', touch: 'poke' } },
      { at: 3, i: { kind: 'SHELL_STROKE', half: 'L', touch: 'pat' } },
      { at: 6, i: { kind: 'SHELL_STROKE', half: 'L', touch: 'poke' } },
    ],
    windows: [
      { name: '被碰过之后', from: 8, to: 23 },
      { name: '缓过来', from: 30, to: 50 },
    ],
  },
};

const rows = [];
for (const [sc, cfg] of Object.entries(SCEN)) {
  cfg.windows.forEach((w, k) => {
    for (const P of PERSONA_KEYS) {
      const rs = [];
      for (let seed = 1; seed <= N; seed++) rs.push(trial(P, seed * 7919 + 13, cfg.inputs, cfg.windows, cfg.span)[k]);
      const f = (m, d = 2) => `${mean(rs.map((r) => r[m])).toFixed(d)} ± ${sd(rs.map((r) => r[m])).toFixed(d)}`;
      rows.push(`| ${sc} ${w.name} | ${P} ${PERSONAS[P].zh} | ${f('bpm', 1)} | ${f('T')} | ${f('amp')} | ${f('arousal')} |`);
    }
  });
}
console.log(`呼吸探针（N = ${N}）\n`);
console.log('| 场景 | 人格 | 每分钟几口气 | 一口气多长（s） | 每口气的行程 | 唤醒度 |');
console.log('|---|---|---|---|---|---|');
console.log(rows.join('\n'));
await server.close();
