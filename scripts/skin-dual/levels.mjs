// 逐级独立设计（用户 2026-08-27：「针对过程里的每一个结构单独做结构，
// 只是参考前后，不要从前后改出来」）——每级一份自己的谱与选项，单独磨到干净。
//
// 中间级构造 v2「刻缝方箱」（v1 截断扇 + 无方箱出来的是圆团块，形全错——
// 平面方正只存在于 boxSquare 区制里，故整个换架构，回到已证明的区制）：
//   一条自由段 = [buf | 上壁 D/2 | 上半面 | 缝上壁 | 缝底 | 缝下壁 | 下半面 | 下壁 | buf]
// - 外扇 = 完整方箱梯（等长键 rest=H=2·台高+缝嘴，f..M 一步不缺，boxSquare 全套：
//   嘴角贴轴 / 找平 / flattenToLine 都只碰上下外壁，**碰不到两面角之间的缝区**）。
// - 面板只盖两个**半面**（面角→缝角），缝材料不入面板 ⇒ 不被拉直烫平。
// - 缝 = **无键材料 + coreTether 天花**（缝底节点限位在 D−dv）：缝壁弧长按构造
//   恰等于「面→天花」的径向距离（斜边），绷紧 ⇒ 无从外翻；缝底被 PRESS 压在
//   天花上摊平。缝的形状不是描出来的，是「箱先合拢、缝料再沉底」长出来的。
// - **不给缝加键**：缝键会并进外扇同一条链（一段一链），台面找平会把面和缝
//   一起 y 均值压毁（引擎 431 行是核心 v7 行为，不是站方修正）。
// - rootHug 可以开：缝在链的围合区（最外键跨）之内，rootHug 只碰围合区外的缓冲。
//
// 用法：npx vite-node scripts/skin-dual/levels.mjs <out.svg> [level]（level 给了就只跑那一级）
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';

const OUT = process.argv[2] ?? 'levels.svg';
const ONLY = process.argv[3] !== undefined ? Number(process.argv[3]) : null;

// 定版目标（与 line-draft.mjs 同一套）
const LOBE = 12;
const D = 40;
const G1 = 28;
const wOf = (t) => G1 * Math.pow(t, 0.7);
const dvOf = (t) => D * Math.pow(t, 1.2);
const tipOf = (t) => 0.4 + 0.6 * t;
const LEVEL_T = [0, 0.108, 0.254, 0.397, 0.523, 0.638, 0.741, 0.834, 0.92, 1];

const LEAD = 24;
const TOTAL = 200;
const BUF = 4;

const fan = (c, kFrom, kTo, rb) => {
  const out = [];
  for (let k = kFrom; k <= kTo; k += 2) out.push([c - k, c + k, rb]);
  return out;
};

/** L0：单箱（一条链 + 方箱整形——已验证干净） */
function levelSingle() {
  const kf = Math.round((2 * LOBE) / 4); // 面 = 总高 24px ⇒ 半跨 6
  const kmax = kf + D / 2;
  const c = BUF + kmax;
  const fLen = BUF + 2 * kmax + 1 + BUF;
  return {
    segs: [
      ['g', LEAD],
      ['f', fLen, fan(c, kf, kmax, (2 * LOBE) / 100), [[c - kf, c + kf]]],
      ['g', TOTAL - LEAD - fLen],
    ],
    opts: { coreWall: true, rootHug: 1, anchorEnd: true, boxSquare: true },
    marks: { kind: 'single', top: LEAD + c - kmax, bot: LEAD + c + kmax, c: LEAD + c, fLen },
  };
}

/**
 * 中间级模板 v2「刻缝方箱」（每级的数字独立调，模板只是共享机械）：
 * 节点偏移（自缝心 c）：a = 缝底半宽 · m = a+wallN 缝角 · f = m+faceN 面角 · M = f+D/2 轴嘴
 */
function levelMid(t, tune = {}) {
  const w = wOf(t);
  const dv = tune.dv ?? dvOf(t);
  const wt = w * tipOf(t);
  const rTip = (tune.tipX ?? D - dv) / 100;
  const a = tune.a ?? Math.max(1, Math.round(wt / 4)); // 缝底半宽（节）
  const wallN = tune.wallN ?? Math.max(1, Math.round(Math.hypot(dv, (w - wt) / 2) / 2));
  const faceN = tune.faceN ?? Math.round(LOBE / 2); // 6
  const m = a + wallN;
  const f = m + faceN;
  const M = f + D / 2;
  const H = 2 * LOBE + w; // 外箱高 = 两台 + 缝嘴
  const fLen = BUF + 2 * M + 1 + BUF;
  const c = BUF + M;
  // 缝链（附加链）：渐变键长 嘴 wm → 底 wt 的小扇——缝有自己的拉链，
  // 在收缩早期自己有序预成形（形状来自形成序），箱再围着它合拢。
  const crack = [];
  for (let k = m; k > a + 1; k -= 2) crack.push([c - k, c + k, (wt + (w - wt) * ((k - a) / (m - a))) / 100]);
  const segs = [
    ['g', LEAD],
    ['f', fLen, fan(c, f, M, H / 100), [[c - f, c - m], [c + m, c + f]], [crack]],
    ['g', TOTAL - LEAD - fLen],
  ];
  const c0 = LEAD + c;
  // 单侧限位只钉缝底那几个节点（rTip）——锚住缝的朝向，其余交给键谱
  const tether = [];
  for (let i = -a; i <= a; i++) tether.push([c0 + i, rTip]);
  return {
    segs,
    opts: { coreWall: true, rootHug: 1, anchorEnd: true, boxSquare: true, sqChains: [0], coreTether: tether },
    marks: {
      kind: 'mid',
      top: LEAD + BUF,
      bot: LEAD + fLen - BUF,
      c: c0,
      mouthA: c0 - m,
      mouthB: c0 + m,
      fLen,
      H,
      w,
    },
  };
}

/** L9：双台（五段谱，中间真贴合——Lab.11 区制，已验证干净） */
function levelDual() {
  const kf = 3; // 面 12px ⇒ 半跨 3（面弧 4·kf = 12 = rb，弦=弧的目录纪律）
  const kmax = kf + D / 2;
  const fLen = BUF + 2 * kmax + 1 + BUF;
  const c = BUF + kmax;
  const midG = 12; // 贴合缝：24px 贴合 + 两端缓冲 ≈ 目标缝 28
  const plat = () => ['f', fLen, fan(c, kf, kmax, LOBE / 100), [[c - kf, c + kf]]];
  return {
    segs: [
      ['g', LEAD],
      plat(),
      ['g', midG],
      plat(),
      ['g', TOTAL - LEAD - 2 * fLen - midG],
    ],
    opts: { coreWall: true, rootHug: 1, anchorEnd: true, boxSquare: true },
    marks: {
      kind: 'dual',
      top: LEAD + BUF,
      bot: LEAD + fLen + midG + fLen - BUF,
      c: LEAD + fLen + Math.floor(midG / 2),
      fLen: 2 * fLen + midG,
      off: LEAD,
    },
  };
}

/** 每级自己的构造与调参（独立设计；TUNE 里的数字逐级磨） */
const TUNE = [null, {}, {}, {}, {}, {}, {}, {}, {}, null];
function levelSpec(li) {
  const t = LEVEL_T[li];
  if (li === 0) return levelSingle();
  if (li === 9) return levelDual();
  return levelMid(t, TUNE[li] ?? {});
}

const runToEnd = (segs, opts) => {
  const s = createSkinUnit(segs, opts);
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return s;
};

const list = ONLY !== null ? [ONLY] : LEVEL_T.map((_, i) => i);
const runs = list.map((li) => {
  const spec = levelSpec(li);
  const sim = runToEnd(spec.segs, spec.opts);
  const px = (i) => sim.px[i] * 100;
  const py = (i) => -sim.py[i] * 100;
  let depth = 0;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = LEAD; i < LEAD + spec.marks.fLen; i++) {
    depth = Math.max(depth, px(i));
    if (px(i) > 5) {
      y0 = Math.min(y0, py(i));
      y1 = Math.max(y1, py(i));
    }
  }
  const tipX = px(spec.marks.c);
  const mouth =
    spec.marks.mouthA !== undefined ? Math.abs(py(spec.marks.mouthB) - py(spec.marks.mouthA)) : NaN;
  let total = 0;
  for (const ch of sim.chains) total += ch.length;
  const t = LEVEL_T[li];
  return { li, t, spec, sim, depth, tipX, height: y1 - y0, mouth, locked: sim.locked.length, total };
});

for (const r of runs)
  console.log(
    `L${r.li} t=${r.t.toFixed(3)} 目标[尖 ${(D - dvOf(r.t)).toFixed(1)} 深 ${D} 缝 ${wOf(r.t).toFixed(1)} 高 ${(2 * LOBE + wOf(r.t)).toFixed(1)}]  ` +
      `实测[尖 ${r.tipX.toFixed(1)} 深 ${r.depth.toFixed(1)} 缝 ${r.mouth.toFixed(1)} 高 ${r.height.toFixed(1)}]  锁 ${r.locked}/${r.total}`,
  );

// ── SVG ────────────────────────────────────────────────────────────────────
const smoothPts = (pts, w = 3) =>
  pts.map((_, i) => {
    let sx = 0, sy = 0, n = 0;
    for (let k = -w; k <= w; k++) {
      const j = Math.min(pts.length - 1, Math.max(0, i + k));
      sx += pts[j][0]; sy += pts[j][1]; n++;
    }
    return [sx / n, sy / n];
  });
const target = (t) => {
  const w = wOf(t), dv = dvOf(t), wt = w * tipOf(t), H = 2 * LOBE + w, y0 = -H / 2;
  const p = [[0, y0], [D, y0]];
  if (w > 0.5) p.push([D, -w / 2], [D - dv, -wt / 2], [D - dv, wt / 2], [D, w / 2]);
  p.push([D, -y0], [0, -y0]);
  return p;
};
const big = ONLY !== null;
const CW = big ? 640 : 168, SC = big ? 7 : 2.4, PAD = 36, HALF = big ? 44 : 62;
const OY = PAD + 36 + HALF * SC;
const W = PAD * 2 + runs.length * CW;
const HGT = Math.ceil(OY + HALF * SC + 30);
const path = (pts, ox, oy, cy = 0) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC).toFixed(2)},${(oy + (y - cy) * SC).toFixed(2)}`).join('');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${HGT}" viewBox="0 0 ${W} ${HGT}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${HGT}" fill="#f6f4ef"/>
<text x="${PAD}" y="${PAD - 12}" font-size="16" font-weight="700" fill="#1b1b1a">逐级独立设计 · 真引擎终态（实线）叠目标（虚线）</text>`;
runs.forEach((r, i) => {
  const ox = PAD + i * CW + 24;
  const pts = [];
  const o = LEAD;
  for (let k = 0; k < r.spec.marks.fLen; k++) pts.push([r.sim.px[o + k] * 100, -r.sim.py[o + k] * 100]);
  const cy = -r.sim.py[r.spec.marks.c] * 100;
  svg += `<text x="${ox - 16}" y="${PAD + 12}" font-size="12" font-weight="600" fill="#3a3a38">L${r.li} · t=${r.t.toFixed(2)}</text>`;
  svg += `<line x1="${ox}" y1="${OY - HALF * SC}" x2="${ox}" y2="${OY + HALF * SC}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
  svg += `<path d="${path(target(r.t), ox, OY)}" fill="none" stroke="#a05a2c" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.9"/>`;
  svg += `<path d="${path(smoothPts(pts), ox, OY, cy)}" fill="none" stroke="#1c3a2c" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
});
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`→ ${OUT}`);
