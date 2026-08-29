// 引擎实现：定版目标线形（两台分离，台高 12 / 台深 40 / 缝 28 / 10 级）。
//
// ## 走不通的两条（2026-08-27 实测，留档免得再试）
// ① **贴合锚键**（键的一端落在贴合段 ⇒ 皮→轴的单向锚，属既有键型）：
//    锚键跨度夹在包络扇形中间会把拉链卡死（8/14）；调成恒为最大跨度后尖钉住了，
//    但箱体不再成形——2·dv 的富余要向内折而 PRESS 恒向外推，整条散开
//    （高 100+ / 深 56，目标 52 / 40）。**缺的不是一个锚，是整套向内的体制。**
// ② **三箱**（台|发丝缝|裂口箱|发丝缝|台）：物理健康、全级锁定，但每条链的嘴
//    都必须回轴（boxSquare 的 mouth-hug），读作三片鳍 + 两道到轴的缝，不是目标。
//
// ## 定稿：皮-芯键（用户 2026-08-27 解禁）
//
// 一条链、一个包络箱，裂口尖用 `coreTether` 直接钉在半深处 —— 那正是引擎唯一
// 缺的那件事（给材料一个「离轴多远」的约束）。纪律：**只钉尖那一个点**，
// 箱体、裂口壁、嘴宽全部仍由键谱与物理长出来。
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
const TOTAL = 260;
const BUF = 4;

function levelSpec(t) {
  const w = wOf(t);
  const dv = dvOf(t);
  const wt = w * tipOf(t);
  const H = 2 * LOBE + w;
  // 端面材料按裂口的**四段**分账（首版把尖宽 wt 算进了台的立面 ⇒ 台高随 wt 涨到 26px）：
  //   [台A立面 LOBE] [壁 wallLen] [尖 wt] [壁 wallLen] [台B立面 LOBE]
  // 壁长按**斜边**算（嘴角在外缘、尖角在半深）⇒ 弧 = 弦 ⇒ 壁必然绷直
  //（v7 面板注释「端面弧长 = 键长 → 必然拉直」的同一条原理，用在裂口壁上）
  const wallLen = Math.hypot(dv, (w - wt) / 2);
  const tipHalf = Math.max(1, Math.round(wt / 4)); // 尖的半宽（节）
  const wallN = Math.round(wallLen / 2); // 壁（节）
  const faceN = Math.round(LOBE / 2); // 台的外立面：6 节 = 12px
  const mouthN = tipHalf + wallN; // 从尖心到嘴角的材料（节）
  const kf = dv >= 4 ? mouthN + faceN : Math.round(H / 4);
  const kmax = kf + Math.round(D / 2); // 深 40px
  const c = BUF + kmax;
  const fLen = BUF + (2 * kmax + 1) + BUF;
  const bonds = [];
  for (let k = kf; k <= kmax; k += 2) bonds.push([c - k, c + k, H / 100]); // 包络：等长键箱体
  // **不放裂口嘴键**：boxSquare 的顶/底面压平取「跨度最小的键」当端点，
  // 裂口嘴键正好是最小的 ⇒ 会把台的立面和顶面拉成一条斜线（实测深 51 vs 40）。
  // 去掉后最小跨度回到端面梯档，压平只作用在顶/底面上；缝宽交给限位模具与材料。
  const panels =
    dv >= 4
      ? [[c - kf, c - kf + faceN], [c + kf - faceN, c + kf]] // 台的两个外立面
      : [[c - kf, c + kf]]; // 无裂口时整块端面（少了它纯箱体也会鼓：实测深 52 vs 40）
  const segs = [['g', LEAD], ['f', fLen, bonds, panels], ['g', TOTAL - LEAD - fLen]];
  // 皮-芯键（单侧限位）**斜坡**：从嘴角的 D 线性降到尖的 D−dv，尖那段取平。
  // 材料被 PRESS 压到斜坡上 ⇒ 裂口壁成直壁、缝底成平底；材料可沿限位滑动 ⇒ 不打结。
  // 铺平（整段都限到 D−dv）试过并否决：那把裂口壁也压到轴上，整形直接塌
  //（实测 t=1 全形归零）。台的立面、嘴宽、整体高度仍由键谱与物理决定。
  const tether = [];
  if (dv >= 4) {
    for (let i = c - tipHalf; i <= c + tipHalf; i++) tether.push([LEAD + i, (D - dv) / 100]);
    // 壁不再给斜坡限位：**逐节点的斜坡等于强迫材料的落位**，材料一旦沿限位滑动
    // 几节就会被自己的天花板顶到错的地方，中段整条打旋（实测 t=0.40–0.74 全乱）。
    // 只给尖一段平限位 ⇒ 模具最小，壁由材料与压平自己长出来。
  }
  return { segs, tether: tether.length ? tether : undefined, c, kf, kmax, fLen, w, dv, H, mouthN };
}

const runToEnd = (spec) => {
  const s = createSkinUnit(spec.segs, {
    ...SKIN_SITE_BASE,
    boxSquare: true,
    ...(spec.tether ? { coreTether: spec.tether } : {}),
  });
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return s;
};

const runs = LEVEL_T.map((t) => {
  const spec = levelSpec(t);
  const sim = runToEnd(spec);
  const o = LEAD;
  const px = (i) => sim.px[o + i] * 100;
  const py = (i) => -sim.py[o + i] * 100;
  let depth = 0, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < spec.fLen; i++) {
    depth = Math.max(depth, px(i));
    if (px(i) > 4) { y0 = Math.min(y0, py(i)); y1 = Math.max(y1, py(i)); }
  }
  // 台高 = 从形体上缘到裂口嘴上角的纵距
  const mouthTopY = py(spec.c - spec.mouthN);
  const mouthBotY = py(spec.c + spec.mouthN);
  let total = 0;
  for (const ch of sim.chains) total += ch.length;
  return {
    t, spec, sim,
    tip: px(spec.c), depth, H: y1 - y0,
    seam: spec.dv >= 4 ? mouthBotY - mouthTopY : 0,
    lobe: spec.dv >= 4 ? mouthTopY - y0 : (y1 - y0) / 2,
    locked: sim.locked.length, total,
  };
});

console.log('皮-芯键构造 · 一条链 + 只钉裂口尖');
for (const r of runs)
  console.log(
    `t=${r.t.toFixed(3)} 目标[尖 ${(D - dvOf(r.t)).toFixed(1)} 深 ${D} 高 ${(2 * LOBE + wOf(r.t)).toFixed(1)} 缝 ${wOf(r.t).toFixed(1)} 台 ${LOBE}]  ` +
      `实测[尖 ${r.tip.toFixed(1)} 深 ${r.depth.toFixed(1)} 高 ${r.H.toFixed(1)} 缝 ${r.seam.toFixed(1)} 台 ${r.lobe.toFixed(1)}]  锁 ${r.locked}/${r.total}`,
  );

// ── SVG：实测（实线）叠目标（虚线，按裂口中线对齐） ────────────────────────
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
const CW = 168, SC = 2.4, PAD = 36, HALF = 62;
const OY = PAD + 36 + HALF * SC;
const W = PAD * 2 + runs.length * CW;
const HGT = Math.ceil(OY + HALF * SC + 30);
const path = (pts, ox, oy, cy = 0) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC).toFixed(2)},${(oy + (y - cy) * SC).toFixed(2)}`).join('');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HGT}" viewBox="0 0 ${W} ${HGT}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${HGT}" fill="#f6f4ef"/>
<text x="${PAD}" y="${PAD - 12}" font-size="16" font-weight="700" fill="#1b1b1a">皮-芯键构造 · 真引擎终态（实线）叠目标线形（虚线）</text>`;
runs.forEach((r, i) => {
  const ox = PAD + i * CW + 24;
  const o = LEAD;
  const pts = [];
  for (let k = 0; k < r.spec.fLen; k++) pts.push([r.sim.px[o + k] * 100, -r.sim.py[o + k] * 100]);
  const cy = -r.sim.py[o + r.spec.c] * 100;
  svg += `<text x="${ox - 16}" y="${PAD + 12}" font-size="12" font-weight="600" fill="#3a3a38">t=${r.t.toFixed(2)}</text>`;
  svg += `<line x1="${ox}" y1="${OY - HALF * SC}" x2="${ox}" y2="${OY + HALF * SC}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
  svg += `<path d="${path(target(r.t), ox, OY)}" fill="none" stroke="#a05a2c" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.9"/>`;
  svg += `<path d="${path(smooth(pts), ox, OY, cy)}" fill="none" stroke="#1c3a2c" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
});
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`→ ${OUT}`);
