// 从 JOINT 落盘的候选集里挑三档（换目标函数不必重跑引擎）。
// 判据三条一起看：**外缘偏差**（方形准不准）· **剪影Δ**（形对不对）· **全程对位散布**
// （一圈平不平——2026-09-01 加深缝那轮的教训：只按前两条挑会挑到折叠体沿轴浮起来的那个）。
import { readFileSync } from 'node:fs';
import { SQUARE } from '../../src/lib/space/skin-square.ts';
const cand = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const R = SQUARE.RADIUS, TH = (n) => (Math.PI / SQUARE.COUNT) * n;
const cosT = [Math.cos(TH(1)), Math.cos(TH(3)), Math.cos(TH(5))], names = ['面', '边', '角'];
const DEV = Number(process.env.DEV ?? 1.5), SIL = Number(process.env.SIL ?? 4);
const spreadOf = (rows) => Math.max(...rows[0].align.map((_, i) => {
  const v = rows.map((r) => r.align[i]);
  return Math.max(...v) - Math.min(...v);
}));
let best = null;
for (let a = 60; a <= 100; a += 0.1) {
  const near = cosT.map((cs, i) => {
    const want = a / cs - R;
    return cand[i].filter((c) => Math.abs(c.reach - want) <= DEV && c.silD <= SIL);
  });
  if (near.some((n) => !n.length)) continue;
  for (const x of near[0]) for (const y of near[1]) for (const z of near[2]) {
    const rows = [x, y, z];
    const sp = spreadOf(rows);
    const dev = Math.max(...rows.map((r, i) => Math.abs(r.reach - (a / cosT[i] - R))));
    const sil = Math.max(...rows.map((r) => r.silD));
    const score = sp + 2 * dev + sil;
    if (!best || score < best.score) best = { a, rows, sp, dev, sil, score };
  }
}
if (!best) { console.log(`没有同时满足 偏差≤${DEV} · Δ≤${SIL} 的组合`); process.exit(1); }
const { a, rows, sp, dev, sil } = best;
console.log(`⇒ 半边长 ${a.toFixed(1)} · **边长 ${(2 * a).toFixed(0)}px** · 外缘偏差 ≤${dev.toFixed(2)}px · Δ ≤${sil.toFixed(2)} · 全程对位散布 ${sp.toFixed(1)}px`);
rows.forEach((p, i) => console.log(` ${names[i]} ${p.k !== undefined ? 'k' + p.k : 'boxD' + p.boxD + '/D' + p.D.toFixed(1)}: 挑出 ${p.reach.toFixed(2)}（偏 ${(p.reach - (a / cosT[i] - R)).toFixed(2)}） 箱高 ${p.boxH.toFixed(2)} 顶平 ${p.topFlat.toFixed(2)} 底平 ${p.botFlat.toFixed(2)} 结 ${p.knot} Δ ${p.silD.toFixed(2)} 缝底x ${p.seamMin.toFixed(2)} 对位 ${p.align.map((v) => v.toFixed(0)).join('/')}`));
