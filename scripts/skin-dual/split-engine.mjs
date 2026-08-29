// 引擎实现：把定版目标线形（两台分离，台高 12 / 台深 40 / 缝 28 / 10 级）做出来。
//
// ## 走不通的那条（锚键，2026-08-27 实测否决，留档免得再试）
//
// 想法：**键的一端挂在贴合段节点上 = 皮→轴的锚**（贴合节点每迭代被 pinGlued 钉回，
// 锁定键对两端对称施力 ⇒ 净效果是把皮上那点拉到「离轴上某定点距离 L」的圆上）。
// 这是既有键型、不需要解禁皮-芯新键型，本来该能把裂口尖钉在半深处。
// 实测两轮都不成立：
//   ① 锚键跨度夹在包络扇形中间 ⇒ 拉链卡死在它这里（只有「当前第一条未锁的」有资格锁），
//      它后面的键一条都锁不上（实测 8/14）；
//   ② 把锚埋深调到恒为最大跨度（先钉尖、再成形）后，尖是钉住了，但箱体不再成形——
//      2·dv 的富余材料要**向内**折，而 PRESS 恒向外推，整条散开（实测高 100+ / 深 56，
//      目标 52 / 40）。**这印证了之前的判定：悬空半深谷要的是向内的体制，不是一个锚。**
//
// ## 定稿：三箱（每条链都在引擎被证明的区制里）
//
//   [台 A | 发丝缝 | 裂口箱 M | 发丝缝 | 台 B]
// 台 A/B = 窄嘴深箱（嘴 12px = 定版台高、深 40px），全程一字不动；
// 裂口 = M 箱，深度 D−dv 随级 40 → 0；M 退平后它那段材料变成贴轴的松弛料 = 终态的缝。
// 与目标的**已知偏离**：M 的嘴也必须回到轴上（boxSquare 的 mouth-hug 对每条链都成立）
// ⇒ 箱与箱之间是两道切到轴的发丝缝，而不是目标那种悬在半深的裂口尖。
//
// 用法：npx vite-node scripts/skin-dual/split-engine.mjs <out.svg>
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { SKIN_SITE_BASE } from '../../src/lib/space/skin-data.ts';

const OUT = process.argv[2] ?? 'split-engine.svg';

// 定版目标（与 line-draft.mjs 同一套）
const LOBE = 12;
const D = 40;
const G1 = 28;
const wOf = (t) => G1 * Math.pow(t, 0.7);
const dvOf = (t) => D * Math.pow(t, 1.2);
const tipOf = (t) => 0.4 + 0.6 * t;
const LEVEL_T = [0, 0.108, 0.254, 0.397, 0.523, 0.638, 0.741, 0.834, 0.92, 1];

const LEAD = 24;
const BUF = 4;
const KF_P = 3; // 台的端面半跨：6 节 = 12px = 台高 ⇒ 等长键
const KMAX_P = KF_P + 20; // 深 40px
const F_P = BUF + (2 * KMAX_P + 1) + BUF;
const KMAX_M_MAX = 21;
const F_M = BUF + (2 * KMAX_M_MAX + 1) + BUF; // M 段长恒定：M 变浅时富余变成贴轴松弛料 = 缝
const C_M = Math.floor(F_M / 2);
const C_P = Math.floor(F_P / 2);
const TAIL = 24;
const TOTAL = LEAD + F_P + 1 + F_M + 1 + F_P + TAIL;

const fanSpec = (c, kFrom, kTo, rb) => {
  const out = [];
  for (let k = kFrom; k <= kTo; k += 2) out.push([c - k, c + k, rb]);
  return out;
};
const plat = () => ['f', F_P, fanSpec(C_P, KF_P, KMAX_P, LOBE / 100), [[C_P - KF_P, C_P + KF_P]]];

/** 某级：M 箱深 = D − dv（节 mM），退平后只剩松弛料 */
function levelSpec(t) {
  const mM = Math.max(0, Math.round((D - dvOf(t)) / 2));
  const kmaxM = 1 + mM;
  const mid =
    mM >= 2
      ? ['f', F_M, fanSpec(C_M, 1, kmaxM, 0.04), [[C_M - 1, C_M + 1]]]
      : ['f', F_M, []];
  return [['g', LEAD], plat(), ['g', 1], mid, ['g', 1], plat(), ['g', TAIL]];
}

const runToEnd = (segs) => {
  const s = createSkinUnit(segs, { ...SKIN_SITE_BASE, boxSquare: true });
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return s;
};

const A0 = LEAD;
const M0 = LEAD + F_P + 1;
const B0 = M0 + F_M + 1;
const runs = LEVEL_T.map((t) => {
  const sim = runToEnd(levelSpec(t));
  const px = (i) => sim.px[i] * 100;
  const py = (i) => -sim.py[i] * 100;
  const seg = (o, n) => {
    let out = 0, y0 = Infinity, y1 = -Infinity;
    for (let i = o; i < o + n; i++) {
      out = Math.max(out, px(i));
      if (px(i) > 4) { y0 = Math.min(y0, py(i)); y1 = Math.max(y1, py(i)); }
    }
    return { out, h: y1 - y0 };
  };
  const A = seg(A0, F_P), M = seg(M0, F_M), B = seg(B0, F_P);
  const gap = B.h > 0 && A.h > 0 ? seg(B0, F_P).h : 0;
  let total = 0;
  for (const ch of sim.chains) total += ch.length;
  // 缝 = A 的下缘到 B 的上缘（沿轴），M 退平后就是它
  let aBot = -Infinity, bTop = Infinity;
  for (let i = A0; i < A0 + F_P; i++) if (px(i) > 4) aBot = Math.max(aBot, py(i));
  for (let i = B0; i < B0 + F_P; i++) if (px(i) > 4) bTop = Math.min(bTop, py(i));
  return { t, sim, A, M, B, seam: bTop - aBot, locked: sim.locked.length, total, gap };
});

console.log(`三箱（定版比例）· 台嘴 ${2 * LOBE / 2}px 深 ${D}px · M 段恒 ${F_M} 节`);
for (const r of runs)
  console.log(
    `t=${r.t.toFixed(3)} 目标[M深 ${(D - dvOf(r.t)).toFixed(1)} 台高 ${LOBE} 缝 ${wOf(r.t).toFixed(1)}]  ` +
      `实测[台A深 ${r.A.out.toFixed(1)} 高 ${r.A.h.toFixed(1)} · M深 ${r.M.out.toFixed(1)} · A↔B ${r.seam.toFixed(1)}]  锁 ${r.locked}/${r.total}`,
  );

// ── SVG：实测（实线）叠目标（虚线，按缝心对齐） ────────────────────────────
const smooth = (pts, w = 3, passes = 1) => {
  let cur = pts;
  for (let p = 0; p < passes; p++)
    cur = cur.map((_, i) => {
      let sx = 0, sy = 0, n = 0;
      for (let k = -w; k <= w; k++) {
        const j = Math.min(cur.length - 1, Math.max(0, i + k));
        sx += cur[j][0]; sy += cur[j][1]; n++;
      }
      return [sx / n, sy / n];
    });
  return cur;
};
const target = (t) => {
  const w = wOf(t), dv = dvOf(t), wt = w * tipOf(t), H = 2 * LOBE + w, y0 = -H / 2;
  const p = [[0, y0], [D, y0]];
  if (w > 0.5) p.push([D, -w / 2], [D - dv, -wt / 2], [D - dv, wt / 2], [D, w / 2]);
  p.push([D, -y0], [0, -y0]);
  return p;
};
const CW = 168, SC = 2.2, PAD = 36, HALF = 112;
const OY = PAD + 36 + HALF * SC;
const W = PAD * 2 + runs.length * CW;
const HGT = Math.ceil(OY + HALF * SC + 30);
const path = (pts, ox, oy, cy = 0) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC).toFixed(2)},${(oy + (y - cy) * SC).toFixed(2)}`).join('');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HGT}" viewBox="0 0 ${W} ${HGT}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${HGT}" fill="#f6f4ef"/>
<text x="${PAD}" y="${PAD - 12}" font-size="16" font-weight="700" fill="#1b1b1a">三箱构造 · 真引擎终态（实线）叠目标线形（虚线）· 定版比例</text>`;
runs.forEach((r, i) => {
  const ox = PAD + i * CW + 24;
  const pts = [];
  for (let k = A0; k < B0 + F_P; k++) pts.push([r.sim.px[k] * 100, -r.sim.py[k] * 100]);
  const cy = -r.sim.py[M0 + C_M] * 100; // 以 M 中心（= 裂口中线）对齐
  svg += `<text x="${ox - 16}" y="${PAD + 12}" font-size="12" font-weight="600" fill="#3a3a38">t=${r.t.toFixed(2)}</text>`;
  svg += `<line x1="${ox}" y1="${OY - HALF * SC}" x2="${ox}" y2="${OY + HALF * SC}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
  svg += `<path d="${path(target(r.t), ox, OY)}" fill="none" stroke="#a05a2c" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.9"/>`;
  svg += `<path d="${path(smooth(pts), ox, OY, cy)}" fill="none" stroke="#1c3a2c" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
});
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`→ ${OUT}`);
