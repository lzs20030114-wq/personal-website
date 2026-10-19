// 交互机制参数表（轮回机器_交互机制参数表.md）里按人格算出的派生值：用站上模块现算，表与代码对不上时以这里的输出为准。
//
//   node scripts/behavior/param-derive.mjs
//
// 输出：每种人格的 k_v / k、速度档、偏航限速、抓握那一笔回应的记账时长、⑬ 变强的时间常数、回应 / 自发幅度、
// 迟钝度与按 τ 的等待；回避型在 N = 0 / 0.5 / 1 时躲的各项门槛；台架碰臂常量；几个硬上限。
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
const tiers = ['recover', 'strike', 'pursue', 'deliberate', 'spont', 'creep'];
const TAU_ITEMS = ['take', 'dwell', 'still', 'hover', 'hoverMin', 'feel', 'avoidFreeze', 'stall'];
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
  // 迟钝度与按 τ 的等待（τ 取表的区间两端；乱序随机两端分别列出）
  row.slow = [p.latency[0], p.latency[1]].map((t) => f(V.slowness(t)));
  for (const it of TAU_ITEMS) row[it] = [p.latency[0], p.latency[1]].map((t) => f(V.byTau(H.HC[it], t)));
  row.startleFreeze = [p.latency[0], p.latency[1]].map((t) => f(V.byTau(V.V2.freeze, t)));
  console.log(JSON.stringify(row));
}
// 回避型 N = 0 / 0.5 / 1 时的躲
for (const N of [0, 0.5, 1]) {
  const pose = H.avoidPose(1, Math.PI / 2, N);
  console.log('N', N, 'avoidPose close1 D', f(V.dOf(pose)), 'bend', f(pose.bend), 'dir°', f(pose.dir * DEG, 1),
    'side far°', f((H.HC.avoidSide + (H.HC.avoidSideMax - H.HC.avoidSide) * N * H.HC.avoidFarShare) * DEG, 1),
    'side near°', f(Math.min(H.HC.avoidSideMax, H.HC.avoidSide + (H.HC.avoidSideMax - H.HC.avoidSide) * N) * DEG, 1),
    'dodgeR', H.HC.dodgeR0 + H.HC.dodgeR1 * N, 'dodge v≥', N >= 0.2 ? H.HC.vStill : H.HC.vFast,
    'theta C', f(0.25 * (1 - E.SOCIAL.startleClose * N)), 'lose s', f(E.HAND.loseAfter * (1 + E.SOCIAL.loseClose * N)),
    'reshrink pose', f(H.HC.reshrinkPose - H.HC.reshrinkPoseN * N),
    'peek lean', f(0.3 * (1 - H.HC.peekLeanN * N)), 'shrink dur·k', f(1.2 - H.HC.shrinkFast * N));
}
// 躲开的份量 σ = max(N, 手速在 vSlow → vSwipe 之间的位置)
for (const [N, v] of [[0, 150], [0, 400], [0, 800], [0.5, 30], [1, 30]]) {
  const sz = Math.max(N, Math.min(1, Math.max(0, (v - H.HC.vSlow) / (H.HC.vSwipe - H.HC.vSlow))));
  console.log('dodge N', N, 'v', v, 'σ', f(sz), 'tighter', f(H.HC.dodgeD * (0.6 + 0.4 * sz)), 'hold', f(0.6 + 0.8 * sz), 'push', f(0.06 + 0.02 * sz));
}
console.log('contact', JSON.stringify(MB.HAND_MM), JSON.stringify(MB.HAND_PX), JSON.stringify(MB.HAND_UI), JSON.stringify(MB.TRACK));
console.log('gainAt L,0.3', f(H.gainAt(357.5, 0.3)), 'gainAt 0.5L,0.3', f(H.gainAt(178.75, 0.3)));
console.log('POSE_BEND_MAX', P.POSE_BEND_MAX, 'D_SPAN', P.D_SPAN, 'D_DEEP_SPAN', P.D_DEEP_SPAN, 'DIST', JSON.stringify(H.DIST));
for (const d of [320, 450, 600, 900, 1200, 1500]) console.log('dist', d, 'nearness', f(H.nearness(d)), 'bodyness', f(H.bodyness(d)));
console.log('CRANK', JSON.stringify(MB.CRANK));
await server.close();
