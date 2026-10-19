// 交互机制参数表（轮回机器_交互机制参数表.md）里按人格算出的派生值：用站上模块现算，表与代码对不上时以这里的输出为准。
//
//   node scripts/behavior/param-derive.mjs
//
// 输出：每种人格的 k_v / k、三档速度、偏航限速、抓握那一笔回应的记账时长、⑬ 变强的时间常数、回应 / 自发幅度、
// 惊跳凝住与凑之前等多久；躲的姿态与躲开的门槛；台架碰臂常量；几个硬上限。
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { createServer } = await import(pathToFileURL(join(REPO, 'node_modules/vite/dist/node/index.js')).href);
const server = await createServer({ root: REPO, configFile: false, server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const { PERSONAS } = await server.ssrLoadModule('/src/lib/linkage/behavior/persona.ts');
const V = await server.ssrLoadModule('/src/lib/linkage/behavior/vocab2.ts');
const H = await server.ssrLoadModule('/src/lib/linkage/behavior/vocab2-hand.ts');
const E = await server.ssrLoadModule('/src/lib/linkage/behavior/engine.ts');
const MB = await server.ssrLoadModule('/src/lib/linkage/machine-behavior.ts');
const P = await server.ssrLoadModule('/src/lib/linkage/behavior/programs.ts');
const f = (x, d = 3) => (Number.isFinite(x) ? +x.toFixed(d) : x);
const DEG = 180 / Math.PI;
const tiers = ['fast', 'normal', 'slow'];
for (const P of ['A', 'B', 'C', 'D']) {
  const p = PERSONAS[P];
  const kvs = [p.speed[0], p.speed[1]].map((v) => v / E.ENGINE.speedRef);
  const ks = kvs.map(Math.sqrt);
  const row = { P, kv: kvs.map((x) => f(x)), k: ks.map((x) => f(x)) };
  for (const t of tiers) row[t] = ks.map((k) => f(V.tierSpeed(t, k)));
  row.onsetTau = f(E.SOCIAL.onBase + E.SOCIAL.onLatency * ((p.latency[0] + p.latency[1]) / 2));
  row.respD = f((V.V2.respD0 + V.V2.respD1 * Math.min(1, ((p.gain[0] + p.gain[1]) / 2) / 0.5)));
  row.spontE = f(V.V2.spontE0 + V.V2.spontE1 * Math.min(1, Math.max(0, (((p.breathAmp[0] + p.breathAmp[1]) / 2) - 0.2) / 0.7)));
  row.yawRate = ks.map((k) => f(E.MOTION.yawRate * k));
  row.durResp = ks.map((k) => f(E.MOTION.response / k));
  // 惊跳的凝住 = 0.3 s + τ（封顶 3 s）；手停住多久才凑 = τ（τ 取表的区间两端）
  row.startleFreeze = [p.latency[0], p.latency[1]].map((t) => f(Math.min(V.V2.freezeCap, V.V2.freeze + t)));
  row.stillBeforeApproach = [p.latency[0], p.latency[1]].map((t) => f(t));
  console.log(JSON.stringify(row));
}
// 躲（2026-10-19 整合后不随怕的程度变）
const pose = H.avoidPose(Math.PI / 2);
console.log('avoidPose D', f(V.dOf(pose)), 'bend', f(pose.bend), 'dir°', f(pose.dir * DEG, 1), 'side°', f(H.HC.avoidSide * DEG, 1),
  'dodge: gap<', H.HC.dodgeR0, 'mm or dist<', H.DIST.near, 'mm, v≥', H.HC.vStill, 'tighter', H.HC.dodgeD, 'hold', H.HC.dodgeHold, 'lose s', E.HAND.loseAfter);
console.log('contact', JSON.stringify(MB.HAND_MM), JSON.stringify(MB.HAND_PX), JSON.stringify(MB.HAND_UI), JSON.stringify(MB.TRACK));
console.log('gainAt L,0.3', f(H.gainAt(357.5, 0.3)), 'gainAt 0.5L,0.3', f(H.gainAt(178.75, 0.3)));
console.log('POSE_BEND_MAX', P.POSE_BEND_MAX, 'D_SPAN', P.D_SPAN, 'D_DEEP_SPAN', P.D_DEEP_SPAN, 'DIST', JSON.stringify(H.DIST));
for (const d of [320, 450, 600, 900, 1200, 1500]) console.log('dist', d, 'nearness', f(H.nearness(d)));
console.log('CRANK', JSON.stringify(MB.CRANK));
await server.close();
