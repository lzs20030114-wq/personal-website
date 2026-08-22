// Lab.08 阵列过渡 · 位置标定（放置规律的落地工具）
//
// 规律（推导见 src/lib/space/skin-array.ts 文件头）：终态时自由段的轴向账是封闭的
//   S = f·SEG·r          自由段轴向跨度
//   M = 100·rb           嘴（最外键对）占的高度 = 理想终态直接定义的量
//   嘴心 = 2·lead + (S−M)·bT/(bT+bB) + M/2
// 解析式给方向，整数节落格靠实跑：本脚本对每个单元网格实测「扇形在自由段内挪 d 节」
// 的嘴心响应（~1.9px/节），叠加 lead 的 2px/节（严格线性），取整数最优。
// 用法：npx vite-node scripts/skin-array/calibrate.mjs
//       把打印出的 dFan / dLead 回填 skin-array.ts 的 DFAN / LEAD（LEAD 为基准 55/56 加 dLead）。
// 注：dLead 限 ±1——贴合段以未收缩间距钉轴，各带的横向条纹靠它对齐，挪太多会乱相位。
import { createSkinUnit, SKIN } from '/home/user/personal-website/src/lib/space/skin-unit.ts';
import { buildTransitionArray } from '/home/user/personal-website/src/lib/space/skin-array.ts';

function variant(spec, dLead, dFan) {
  const [g0, f, g1] = spec;
  const bonds = f[2].map(([i, j, rb]) => [i + dFan, j + dFan, rb]);
  const seg = f.length === 4
    ? ['f', f[1], bonds, f[3].map(([a, b]) => [a + dFan, b + dFan])]
    : ['f', f[1], bonds];
  return [['g', g0[1] + dLead], seg, ['g', g1[1] - dLead]];
}
function mouthC(spec, opts) {
  const sim = createSkinUnit(spec, opts);
  for (let s = 0; s < SKIN.STEPS; s++) sim.advance();
  const ch = sim.chains[0][0];
  return {
    m: (-(sim.py[ch[0]] + sim.py[ch[1]]) / 2) * 100,
    ok: sim.locked.length === sim.chains.flat().length,
  };
}
const arr = buildTransitionArray();
const grid = arr.map((u, i) => {
  const f = u.spec[1], bonds = f[2];
  const cc = (bonds[0][0] + bonds[0][1]) / 2;
  const kMax = Math.max(...bonds.map((b) => b[1] - cc));
  const bT = cc - kMax, bB = f[1] - 1 - (cc + kMax);
  const row = [];
  for (let d = -3; d <= 3; d++) {
    if (bT + d < 4 || bB - d < 4) continue;
    const r = mouthC(variant(u.spec, 0, d), u.opts);
    if (r.ok) row.push({ d, m: r.m });
  }
  console.log(`${String(i).padStart(2)} ` + row.map((r) => `${String(r.d).padStart(2)}:${r.m.toFixed(1)}`).join(' '));
  return row;
});
let best = null;
for (let t = 1150; t <= 1400; t++) {
  const T = t / 10;
  const pick = grid.map((row) => {
    let b = null;
    for (const r of row) for (const L of [-1, 0, 1]) {
      const c = r.m + 2 * L, e = Math.abs(c - T);
      if (!b || e < b.e) b = { d: r.d, L, c, e };
    }
    return b;
  });
  const cs = pick.map((p) => p.c);
  const sp = Math.max(...cs) - Math.min(...cs);
  if (!best || sp < best.sp) best = { T, pick, sp };
}
console.log(`\n最优目标 ${best.T} · 嘴心散布 ${best.sp.toFixed(2)}px（现行 3.38）`);
console.log('dFan :', JSON.stringify(best.pick.map((p) => p.d)));
console.log('dLead:', JSON.stringify(best.pick.map((p) => p.L)));
console.log('嘴心 :', best.pick.map((p) => p.c.toFixed(2)).join(' '));

