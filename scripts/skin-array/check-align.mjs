// Lab.08 阵列过渡 · 对位核查（不是标定——对位是构造出来的，见 skin-array.ts 文件头）
//
// 构造：三段等长（全员同 lead/f/tail）+ 扇形正居中（上下缓冲等长 ⇒ φ=1/2）
//   ⇒ 嘴心(r) = 2·lead + (f−1)·r  ——与键长/形态/梯挡数无关，逐位恒等。
// 折叠成形前严格为零；成形后剩下的是**形态自身的材料不对称**（上下缓冲拉伸
// 不等，把嘴心从自由段几何中点拽开），不是放置误差，节点整数位（2px/节）抹不平。
//
// 改了形状（RB / PW / SQ / 端点原谱）之后跑一遍，看残留有没有超出守门的 1.2px：
//   npx vite-node scripts/skin-array/check-align.mjs
// 打印逐单元的嘴心、自由段几何中点（= 账本身，应当几乎不散）与二者之差 δ。
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { buildTransitionArray } from '../../src/lib/space/skin-array.ts';

const CPS = [150, 450, 750, SKIN.STEPS - 1];
const arr = buildTransitionArray();
const sims = arr.map((u) => createSkinUnit(u.spec, u.opts));
const mouth = (sim) => {
  const [i, j] = sim.chains[0][0];
  return (-(sim.py[i] + sim.py[j]) / 2) * 100;
};
const rows = new Map();
for (let s = 0; s < SKIN.STEPS; s++) {
  for (const sim of sims) sim.advance();
  if (CPS.includes(s)) rows.set(s, sims.map(mouth));
}

console.log('step   散布    逐条嘴心');
let worst = 0;
for (const s of CPS) {
  const v = rows.get(s);
  const spread = Math.max(...v) - Math.min(...v);
  worst = Math.max(worst, spread);
  console.log(`${String(s).padStart(4)}  ${spread.toFixed(3).padStart(6)}   ` + v.map((x) => x.toFixed(1).padStart(6)).join(''));
}
console.log(`\n全程最大散布 ${worst.toFixed(3)}px（守门阈值：早期 ≤0.05 / 成形后 ≤1.2）`);

const lead = arr[0].spec[0][1];
const f = arr[0].spec[1][1];
console.log('\ni   嘴心    自由段几何中点    δ = 嘴心 − 中点（形态自身的不对称）');
sims.forEach((sim, i) => {
  const y = (k) => -sim.py[k] * 100;
  const mid = (y(lead) + y(lead + f - 1)) / 2;
  console.log(`${String(i).padStart(2)} ${mouth(sim).toFixed(2).padStart(7)} ${mid.toFixed(2).padStart(14)} ${(mouth(sim) - mid).toFixed(2).padStart(14)}`);
});
