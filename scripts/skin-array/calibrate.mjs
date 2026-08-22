// Lab.08 阵列过渡 · 位置标定（放置规律的落地工具）
//
// 规律（推导见 src/lib/space/skin-array.ts 文件头）：
//   嘴心(r) = [2·lead + M·(1/2 − φ)] + [2f·φ]·r    φ = bT/(bT+bB)、M = 100·rb
//   ⇒ **斜率由 f·φ 定（旋钮 dFan：扇形在自由段内的位置）、截距由 lead 定（2px/节）**
// 必须在**全程**对齐而不是只对终态：台架 19 秒里绝大部分时间在收缩过程中
// （r 0.95→0.30），只对终态标的话早期会散开（首版实测早期 4.78px）。
// 本脚本在四个检查点上网格实跑，取整数最优（最小化全程最大散布）。
//
// 用法：npx vite-node scripts/skin-array/calibrate.mjs
//   把打印的 dFan / dLead 叠加到 skin-array.ts 现行的 DFAN / LEAD 上（是增量不是绝对值），
//   TAIL 随之配平使 lead + f + tail 恒为 ARRAY_TOTAL。
import { createSkinUnit, SKIN } from '/home/user/personal-website/src/lib/space/skin-unit.ts';
import { buildTransitionArray } from '/home/user/personal-website/src/lib/space/skin-array.ts';
const CPS = [150, 450, 750, 1499];
function variant(spec, dFan) {
  const [g0, f, g1] = spec;
  const bonds = f[2].map(([i, j, rb]) => [i + dFan, j + dFan, rb]);
  const seg = f.length === 4
    ? ['f', f[1], bonds, f[3].map(([a, b]) => [a + dFan, b + dFan])]
    : ['f', f[1], bonds];
  return [g0, seg, g1];
}
function track(spec, opts) {
  const sim = createSkinUnit(spec, opts);
  const out = [];
  for (let s = 0; s <= 1499; s++) {
    sim.advance();
    if (CPS.includes(s)) {
      const [i, j] = sim.chains[0][0];
      out.push((-(sim.py[i] + sim.py[j]) / 2) * 100);
    }
  }
  return { v: out, ok: sim.locked.length === sim.chains.flat().length };
}
const arr = buildTransitionArray();
const grid = arr.map((u, i) => {
  const f = u.spec[1], bonds = f[2];
  const cc = (bonds[0][0] + bonds[0][1]) / 2;
  const kMax = Math.max(...bonds.map((b) => b[1] - cc));
  const bT = cc - kMax, bB = f[1] - 1 - (cc + kMax);
  const row = [];
  for (let d = -4; d <= 4; d++) {
    if (bT + d < 4 || bB - d < 4) continue;
    const r = track(variant(u.spec, d), u.opts);
    if (r.ok) row.push({ d, v: r.v });
  }
  console.log(`${String(i).padStart(2)} bT/bB=${bT}/${bB} ` + row.map((r) => `${String(r.d).padStart(2)}:[${r.v.map((x) => x.toFixed(0)).join(',')}]`).join(' '));
  return row;
});
// 以每个单元的每个选项作为参考轨迹，其余单元取最贴近的（含 lead 的 ±2px 整体平移）
let best = null;
for (let ri = 0; ri < 12; ri++) for (const ref of grid[ri]) {
  const pick = grid.map((row) => {
    let b = null;
    for (const o of row) for (let L = -3; L <= 3; L++) {
      const dev = Math.max(...o.v.map((x, k) => Math.abs(x + 2 * L - ref.v[k])));
      if (!b || dev < b.dev) b = { d: o.d, L, v: o.v.map((x) => x + 2 * L), dev };
    }
    return b;
  });
  const worst = Math.max(...CPS.map((_, k) => {
    const col = pick.map((p) => p.v[k]);
    return Math.max(...col) - Math.min(...col);
  }));
  if (!best || worst < best.worst) best = { worst, pick, refUnit: ri, refD: ref.d };
}
console.log(`\n全程最大散布 ${best.worst.toFixed(2)}px（现行：早期 4.78 / 终态 1.01）`);
console.log('dFan :', JSON.stringify(best.pick.map((p) => p.d)));
console.log('dLead:', JSON.stringify(best.pick.map((p) => p.L)));
CPS.forEach((s, k) => {
  const col = best.pick.map((p) => p.v[k]);
  console.log(`  step ${String(s).padStart(4)} 散布 ${(Math.max(...col) - Math.min(...col)).toFixed(2)}  ` + col.map((x) => x.toFixed(0).padStart(4)).join(''));
});
