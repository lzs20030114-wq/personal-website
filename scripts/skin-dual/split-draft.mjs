// 探索线稿：捏分式过渡（用户 2026-08-27 草图三连拍板方向）——
// 单个加高方箱 → 面中央凹谷逐级变浅退回轴 → 两个方箱。定稿 = 三箱构造。
//
// 版本史（四版试错，机理全入档——引擎的形来自**拉链的形成序**，不来自终态约束集）：
// v1 双向 rb 插值（两套键谱叠开）：硬约束不能叠加两套不相容的形，中段绞成一团；
// v2 母箱+双塔（两端配对梯 + 键桁架）：桁架键要锁上才起作用，拉链按跨度放行、
//    宽键晚锁一卡全卡；sq=0 大捕获被 PRESS 吹成气球（75–105px）；
// v4 全嵌套单链（母箱居中扇 + 塔扇 + 嘴角锚键 + 壁弦键）：终态约束齐了照样是袋/球
//    ——形状在宽键锁完的前 200 步就定了，晚锁的整形键救不回来。
//    另一条基本面：**大嘴浅箱只存在于 boxSquare 之下**（目录 sq=0 形态嘴全 ≤40px，
//    76px 嘴无嘴角约束必然吹弧）；而 boxSquare 的 flatten/嘴角贴轴假设「一条链=一个箱」，
//    复合链用不了 ⇒ 悬空半深谷（单腔捏成双腔、谷底不触轴）在冻结的键谱词汇内做不出，
//    要做需要交接件暂缓的「皮-芯键」（tunnel 机制）——是否解禁由用户定。
//
// 定稿 v3 = 三箱：每条链都是引擎被证明的区制（嘴在轴上的正规扇形 + boxSquare）：
//   [方箱 A | 发丝缝 | 窄嘴深箱 M | 发丝缝 | 方箱 B]
// 凹谷 = M（嘴 4px 恒在轴上，深度 = 壁长，随级 35→10px 后塌平为 0 = 终态）；
// A/B 全程是目录方箱一字不动。代价（与草图的已知偏离）：箱间有两道切到轴的
// 发丝 V 缝——多链构造里每个腔的嘴必须回轴，这是词汇边界不是调参问题。
//
// 级表按实测深度曲线标定（扫 dv 0..18 逐一）：可控区间 dv 0–11（35.2→10.3px），
// dv≥12 塌平为 0（小折叠临界），dv≥14 后箱深还会 37→41 跳档 ⇒ 系列止于 dv12；
// dv9 非单调（23.4 > dv8 的 21.4）跳过。
//
// 用法：npx vite-node scripts/skin-dual/split-draft.mjs <out.svg>
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { SKIN_SITE_BASE } from '../../src/lib/space/skin-data.ts';

const OUT = process.argv[2] ?? 'split-draft.svg';

const LEAD = 24;
const TOTAL = 182;
/** 发丝缝：箱与箱之间 1 节贴合 + 两侧各 1 节缓冲。缓冲 1 << 交接件纪律的 4——
 *  有意为之：缝要窄到读作「裂开的痕」；这里嘴角本来就要贴在锚上，
 *  「保护折叠自由」的诉求不存在（BUF=2 时 dv0 数值发散，1 反而全锁干净）。 */
const BUF = 1;
const SEP = 1;

const fanSpec = (c, kFrom, kTo, kStep, rb) => {
  const out = [];
  for (let k = kFrom; k <= kTo; k += kStep) out.push([c - k, c + k, rb]);
  return out;
};

/** dvN ∈ 0..12：M 的壁 = 18−dvN 节。dvN=12 起 M 塌平 = 终态双方箱 */
function levelSpec(dvN) {
  const w = 18 - dvN;
  const fA = 4 + 53 + BUF;
  const cM = BUF + w + 1;
  const fM = BUF + (2 * w + 3) + BUF;
  const fB = BUF + 53 + 4;
  const segs = [
    ['g', LEAD],
    ['f', fA, fanSpec(30, 8, 26, 2, 0.32), [[22, 38]]],
    ['g', SEP],
    // 窄嘴深箱：面 3 节（嘴 4px = 等长键 rb 0.04），梯 k = 1..1+w 步 2
    ['f', fM, fanSpec(cM, 1, Math.max(1, 1 + w), 2, 0.04), [[cM - 1, cM + 1]]],
    ['g', SEP],
    ['f', fB, fanSpec(BUF + 26, 8, 26, 2, 0.32), [[BUF + 18, BUF + 34]]],
  ];
  const used = segs.reduce((a, s) => a + s[1], 0);
  segs.push(['g', TOTAL - used]);
  return segs;
}

/** L0：真·加高单箱（一条链）。嘴高对齐三箱总高 ~80px：face 40 节 → rb 0.80；
 *  自由段要给嘴留足轴向槽位（85 节槽只有 50px、嘴塞不下会被压皱），
 *  余量以下方无键松弛收尾（压平，L0 先例） */
const tallSpec = () => [
  ['g', LEAD],
  ['f', 137, fanSpec(42, 20, 38, 2, 0.8), [[22, 62]]],
  ['g', TOTAL - LEAD - 137],
];

const runToEnd = (spec) => {
  const s = createSkinUnit(spec, { ...SKIN_SITE_BASE, boxSquare: true });
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return s;
};

// 级表（标定，见文件头）
const SCHED = [0, 2, 5, 7, 8, 10, 11, 12];
const runs = [{ label: '单箱', dvN: null, sim: runToEnd(tallSpec()) }];
for (const dvN of SCHED) runs.push({ label: `dv ${dvN}`, dvN, sim: runToEnd(levelSpec(dvN)) });

// ── 剪影 + 读数 ────────────────────────────────────────────────────────────
const SIL_DY = 2;
const silhouette = (sim) => {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < sim.n; i++) {
    const y = -sim.py[i] * 100;
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const sil = new Float64Array(Math.ceil((y1 - y0) / SIL_DY) + 1);
  for (let i = 0; i < sim.n; i++) {
    const bkt = Math.round((-sim.py[i] * 100 - y0) / SIL_DY);
    const x = sim.px[i] * 100;
    if (x > sil[bkt]) sil[bkt] = x;
  }
  return sil;
};
const silDist = (A, B) => {
  const n = Math.max(A.length, B.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs((A[i] ?? 0) - (B[i] ?? 0));
  return s / n;
};

const sils = runs.map((r) => silhouette(r.sim));
console.log(`捏分过渡（三箱定稿） · ${runs.length} 级`);
runs.forEach((r, i) => {
  const locked = r.sim.locked.length;
  let total = 0;
  for (const ch of r.sim.chains) total += ch.length;
  let out = 0;
  for (let k = 0; k < r.sim.n; k++) out = Math.max(out, r.sim.px[k] * 100);
  let mOut = 0;
  if (r.dvN !== null && r.sim.chains.length >= 2) {
    const chM = r.sim.chains[1];
    let lo = r.sim.n;
    let hi = 0;
    for (const [a, b2] of chM) {
      lo = Math.min(lo, a);
      hi = Math.max(hi, b2);
    }
    for (let k2 = lo; k2 <= hi; k2++) mOut = Math.max(mOut, r.sim.px[k2] * 100);
  }
  console.log(
    `  ${r.label.padEnd(6)} 锁 ${String(locked).padStart(2)}/${total} 离轴 ${out.toFixed(1).padStart(5)} 谷台深 ${mOut.toFixed(1).padStart(5)}` +
      (i ? `  ← 剪影Δ ${silDist(sils[i - 1], sils[i]).toFixed(2)}` : ''),
  );
});
const gaps = sils.slice(1).map((s, i) => silDist(sils[i], s));
console.log(`相邻剪影距离 ${Math.min(...gaps).toFixed(2)}–${Math.max(...gaps).toFixed(2)}`);

// ── SVG ────────────────────────────────────────────────────────────────────
const smooth = (pts, w = 3, passes = 1) => {
  let cur = pts;
  for (let p = 0; p < passes; p++)
    cur = cur.map((_, i) => {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (let k = -w; k <= w; k++) {
        const j = Math.min(cur.length - 1, Math.max(0, i + k));
        sx += cur[j][0];
        sy += cur[j][1];
        n++;
      }
      return [sx / n, sy / n];
    });
  return cur;
};
// 各级带长不同（fLen 随级变）而锚在脚上 ⇒ 结构位置逐列漂移；
// 陈列图按 A 箱上缘（捕获上角 = 节点 LEAD+4）对齐各列
const refY = runs.map((r) => -r.sim.py[LEAD + 4] * 100);
const draws = runs.map((r, ri) => {
  const dy = refY[0] - refY[ri];
  const pts = [];
  for (let i = 0; i < r.sim.n; i++) pts.push([r.sim.px[i] * 100, -r.sim.py[i] * 100 + dy]);
  return smooth(pts, 3, 1);
});
const all = draws.flat();
const bb = all.reduce(
  (a, [x, y]) => ({ x0: Math.min(a.x0, x), x1: Math.max(a.x1, x), y0: Math.min(a.y0, y), y1: Math.max(a.y1, y) }),
  { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 },
);
const CW = 240;
const CH = 640;
const PAD = 30;
const SC = Math.min((CW - 60) / Math.max(bb.x1 - bb.x0, 1), (CH - 30) / Math.max(bb.y1 - bb.y0, 1));
const W = PAD * 2 + runs.length * CW;
const H2 = PAD * 2 + CH + 40;
const path = (pts, ox, oy) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC).toFixed(2)},${(oy + (y - bb.y0) * SC).toFixed(2)}`).join('');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H2}" viewBox="0 0 ${W} ${H2}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${H2}" fill="#f6f4ef"/>
<text x="${PAD}" y="${PAD - 8}" font-size="15" font-weight="700" fill="#1b1b1a">线稿 · 捏分过渡（三箱定稿） · 真引擎终态（整条带）</text>`;
runs.forEach((r, i) => {
  const ox = PAD + i * CW + 40;
  const oy = PAD + 34;
  svg += `<text x="${ox - 32}" y="${PAD + 12}" font-size="13" font-weight="600" fill="#3a3a38">${r.label}</text>`;
  svg += `<line x1="${ox}" y1="${oy - 6}" x2="${ox}" y2="${(oy + (bb.y1 - bb.y0) * SC + 6).toFixed(1)}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
  const dy = refY[0] - refY[i];
  for (const [a, b2] of r.sim.locked) {
    svg += `<line x1="${(ox + r.sim.px[a] * 100 * SC).toFixed(1)}" y1="${(oy + (-r.sim.py[a] * 100 + dy - bb.y0) * SC).toFixed(1)}" x2="${(ox + r.sim.px[b2] * 100 * SC).toFixed(1)}" y2="${(oy + (-r.sim.py[b2] * 100 + dy - bb.y0) * SC).toFixed(1)}" stroke="#D85A30" stroke-width="0.7" opacity="0.6"/>`;
  }
  svg += `<path d="${path(draws[i], ox, oy)}" fill="none" stroke="#1c3a2c" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
});
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`→ ${OUT}`);
