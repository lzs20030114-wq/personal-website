// 交互机制参数表（轮回机器_交互机制参数表.md）里按人格算出的派生值：用站上模块现算，表与代码对不上时以这里的输出为准。
//
//   node scripts/behavior/param-derive.mjs
//
// 输出：每种人格的 k_v / k、新 · 研究的速度档、偏航限速、现行回应时长、⑬ 变强的时间常数、回应 / 自发幅度；
// 回避型在 N = 0 / 0.5 / 1 时躲的各项门槛；台架碰臂常量；几个硬上限。
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
const f = (x, d = 3) => (Number.isFinite(x) ? +x.toFixed(d) : x);
const DEG = 180 / Math.PI;
const tiers = ['recover', 'strike', 'pursue', 'urgent', 'deliberate', 'spont', 'creep'];
for (const P of ['A', 'B', 'C', 'D']) {
  const p = PERSONAS[P];
  const kvs = [p.speed[0], p.speed[1]].map((v) => v / E.ENGINE.speedRef);
  const ks = kvs.map(Math.sqrt);
  const row = { P, kv: kvs.map((x) => f(x)), k: ks.map((x) => f(x)) };
  for (const t of tiers) row[t] = ks.map((k) => f(V.tierSpeed(t, k, 1)));
  row.onsetTau = f(E.SOCIAL.onBase + E.SOCIAL.onLatency * ((p.latency[0] + p.latency[1]) / 2));
  row.respD = f((V.V2.respD0 + V.V2.respD1 * Math.min(1, ((p.gain[0] + p.gain[1]) / 2) / 0.5)));
  row.spontE = f(V.V2.spontE0 + V.V2.spontE1 * Math.min(1, Math.max(0, (((p.breathAmp[0] + p.breathAmp[1]) / 2) - 0.2) / 0.7)));
  row.yawRate = ks.map((k) => f(E.MOTION.yawRate * k));
  row.durResp = ks.map((k) => f(E.MOTION.response / k));
  console.log(JSON.stringify(row));
}
// 回避型 N = 0 / 0.5 / 1 时的躲
for (const N of [0, 0.5, 1]) {
  const pose = H.avoidPose(1, Math.PI / 2, N);
  console.log('N', N, 'avoidPose close1 D', f(V.dOf(pose)), 'bend', f(pose.bend), 'dir°', f(pose.dir * DEG, 1),
    'side°', f((H.HC.avoidSide + E.SOCIAL.avoidSideClose * N) * DEG, 1),
    'side+near°', f(Math.min(H.HC.avoidSideMax, H.HC.avoidSide + E.SOCIAL.avoidSideClose * N + H.HC.avoidNear * N) * DEG, 1),
    'dodgeR', H.HC.dodgeR0 + H.HC.dodgeR1 * N, 'cringeV', f(H.HC.cringeV * (1 - H.HC.cringeVN * N)), 'cringeR', H.HC.cringeR + H.HC.cringeRN * N,
    'theta C', f(0.25 * (1 - E.SOCIAL.startleClose * N)), 'lose s', f(E.HAND.loseAfter * (1 + E.SOCIAL.loseClose * N)),
    'reshrink dir°', f((H.HC.reshrinkDir - H.HC.reshrinkDirN * N) * DEG, 1), 'close', f(H.HC.reshrinkClose - H.HC.reshrinkCloseN * N), 'pose', f(0.06 - H.HC.reshrinkPoseN * N),
    'peek lean', f(0.3 * (1 - H.HC.peekLeanN * N)), 'dodge hold', f(0.6 + 0.8 * N), 'shrink dur·k', f(1.2 - H.HC.shrinkFast * N));
}
console.log('contact', JSON.stringify(MB.HAND_MM), JSON.stringify(MB.HAND_PX), JSON.stringify(MB.HAND_UI), JSON.stringify(MB.TRACK));
console.log('gainAt L,0.3', f(H.gainAt(357.5, 0.3)), 'gainAt 0.5L,0.3', f(H.gainAt(178.75, 0.3)));
console.log('ARM_BEND_MAX', E.ARM_BEND_MAX, 'D_SPAN', V.D_SPAN, 'D_DEEP_SPAN', V.D_DEEP_SPAN);
console.log('CRANK', JSON.stringify(MB.CRANK));
await server.close();
