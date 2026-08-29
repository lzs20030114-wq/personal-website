// 逐级独立设计（用户 2026-08-27：「针对过程里的每一个结构单独做结构，
// 只是参考前后，不要从前后改出来」）——每级一份自己的谱与选项，单独磨到干净。
//
// 定案架构「刻缝方箱」v3（v1 截断扇 = 圆团块；v2 无键缝料 = 深缝级外翻/气球；
// 机理：平面方正只存在于硬整形之下，缝料的去向必须在成形期就有约束）：
//   一条自由段 = [buf | 上壁 | 上半面 | 缝上壁 | 缝底 | 缝下壁 | 下半面 | 下壁 | buf]
// - **外箱梯**（链 0）：完整等长键扇 rest=H=2·台高+缝嘴，boxSquare 全套但经
//   sqChains:[0] 只作用于它——嘴角贴轴 / 找平 / flattenToLine 都碰不到缝区。
// - **缝链**（附加链，谱第 5 元素）：嘴键 wm + 等长壁键 + 底键 wt，自己拉链
//   （嘴→底）；经 levelChains:[1] 只吃「底面找平 + 端角重申」两件（补 v7 只
//   找平上层的不对称——下缝壁锯齿即此；端角重申让缝宽逐级精确命中）。
// - **面角同侧键**（两条单键链）：面角↔缝角 rest=台高——垂直化把两角拉到同一 x
//   （面竖直的硬锚），且面板端点成为锁定键 ⇒ 既有端面硬投影自动激活。
// - **coreTether 单侧限位**：缝底钉 rTip；ramp 时缝壁给沿目标斜壁的单侧上限
//   （成形期封死外翻——单试斜坡或单试键框架都失败，组合才成立）。
// - 三面板：两个半面 + 缝底。
// 逐级 TUNE：ramp / wallStep（壁键密度，0=只留嘴底键）/ boxD（设计深度按充气量
// 回标）/ a / wallN（缝料按「富余把底往里顶」裁——限位单侧拦不住过深）/ lvl。
// 浅缝级（L1-L3,L5）斜坡+稀键；深缝级（L4,L6-L9）斜坡+壁键；L9 = 缝裂到轴
// （dv=40、缝底钉在 x=0），与 L8 同族连续——五段谱 levelDual 实测 Δ17 弃用，留作对照。
//
// 用法：npx vite-node scripts/skin-dual/levels.mjs <out.svg> [level] [snap|sweep]
//   snap = 单级成形过程六帧；sweep = 单级配方扫描（COMBOS 环境变量注入 JSON 组合表），
//   均按剪影Δ（引擎终态 vs 目标线的平均横向差）为唯一有效分数。
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';

const OUT = process.argv[2] ?? 'levels.svg';
const ONLY = process.argv[3] !== undefined ? Number(process.argv[3]) : null;
const SNAP = process.argv[4] === 'snap'; // 单级快照模式：画成形过程六帧，不画目标线
const SWEEP = process.argv[4] === 'sweep'; // 单级配方扫描：按剪影Δ挑最优

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

/** L0：单箱（一条链 + 方箱整形——已验证干净；设计深度同样按充气量回标） */
function levelSingle(boxD = 36) {
  const kf = Math.round((2 * LOBE) / 4); // 面 = 总高 24px ⇒ 半跨 6
  const kmax = kf + boxD / 2;
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
  const M = f + (tune.boxD ?? D) / 2; // boxD：设计深度（按实测充气量逐级回标）
  const H = 2 * LOBE + w; // 外箱高 = 两台 + 缝嘴
  const fLen = BUF + 2 * M + 1 + BUF;
  const c = BUF + M;
  // 缝链（附加链）：嘴键 wm + **等长壁键**（放弃 ≤2 节的锥度，换「等键长分段直化」
  // 自动激活 ⇒ 两壁都被拉直）+ 底键 wt。跨度降序 = 嘴→底拉链，缝从嘴往底有序合拢。
  const wv = (w + wt) / 2;
  const wallStep = tune.wallStep ?? 2; // 壁键密度（0 = 只留嘴键+底键）
  const crack = [[c - m, c + m, w / 100]];
  if (wallStep > 0)
    for (let k = m - wallStep; k > a + 1; k -= wallStep) crack.push([c - k, c + k, wv / 100]);
  crack.push([c - a, c + a, wt / 100]);
  // 面角↔缝角同侧键（rest=台高，各自成单键链）：垂直化把两角拉到同一 x =
  // 面竖直的硬锚；面板端点从此是锁定键 ⇒ 既有的端面硬投影自动激活（零新引擎代码）。
  // 缝底同理（底键 + 底面板）。
  const faceUp = [[c - f, c - m, LOBE / 100]];
  const faceDn = [[c + m, c + f, LOBE / 100]];
  const segs = [
    ['g', LEAD],
    [
      'f',
      fLen,
      fan(c, f, M, H / 100),
      [[c - f, c - m], [c + m, c + f], [c - a, c + a]],
      [crack, faceUp, faceDn],
    ],
    ['g', TOTAL - LEAD - fLen],
  ];
  const c0 = LEAD + c;
  // 单侧限位：缝底钉 rTip；tune.ramp 时整个缝区给沿目标斜壁的单侧上限
  // （v3 单试斜坡失败——但当时嘴键/底键/面角锚全都不存在；框架+斜坡是新组合）
  const tether = [];
  for (let i = -a; i <= a; i++) tether.push([c0 + i, rTip]);
  if (tune.ramp)
    for (let i = a + 1; i <= m; i++) {
      const r = rTip + ((i - a) * (D / 100 - rTip)) / wallN;
      tether.push([c0 + i, r], [c0 - i, r]);
    }
  return {
    segs,
    opts: { coreWall: true, rootHug: 1, anchorEnd: true, boxSquare: true, sqChains: [0], ...(tune.lvl ? { levelChains: [1] } : {}), coreTether: tether },
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
// 每级最优（sweep 按剪影Δ挑出）：浅缝级 斜坡+稀键，深缝级 斜坡+壁键；
// wallN/a 按「缝料富余把底往里顶」逐级裁（限位单侧，拦不住过深——材料要配平）
const TUNE = [
  null,
  { ramp: true, wallStep: 0, boxD: 36 }, // Δ0.48
  { ramp: true, wallStep: 0, boxD: 36 }, // Δ0.88
  { ramp: true, wallStep: 0, boxD: 36, wallN: 5 }, // Δ0.88
  { ramp: true, wallStep: 2, boxD: 36, wallN: 8, a: 2 }, // Δ1.29
  { ramp: true, wallStep: 0, boxD: 36, a: 2, wallN: 11 }, // Δ2.93
  { ramp: true, wallStep: 2, boxD: 36, a: 3, wallN: 12 }, // Δ3.25
  { ramp: true, wallStep: 2, boxD: 36, a: 4, wallN: 14 }, // Δ4.77
  { ramp: true, wallStep: 2, boxD: 32, wallN: 15, lvl: true }, // Δ5.54
  { ramp: true, wallStep: 2, boxD: 36, wallN: 18, lvl: true }, // Δ4.38（刻缝方箱到轴，弃五段谱构造）
];
function levelSpec(li) {
  const t = LEVEL_T[li];
  if (li === 0) return levelSingle();
  // L9 也走刻缝方箱（dv=40 缝底钉在轴上）：与 L8 同族连续，实测 Δ6.84，
  // 五段谱 levelDual 反而 Δ17（缝区过高 + 折料），保留其代码仅作对照。
  return levelMid(t, TUNE[li] ?? {});
}

const SNAP_AT = [250, 450, 600, 750, 900, 1500];
const runToEnd = (segs, opts, snaps = null) => {
  const s = createSkinUnit(segs, opts);
  for (let k = 0; k < SKIN.STEPS; k++) {
    s.advance();
    if (snaps && SNAP_AT.includes(k + 1))
      snaps.push({ step: k + 1, px: Float64Array.from(s.px), py: Float64Array.from(s.py), locked: s.locked.length });
  }
  return s;
};

/** 目标线（以缝心为原点；SVG 叠底与剪影Δ共用同一份） */
const target = (t) => {
  const w = wOf(t), dv = dvOf(t), wt = w * tipOf(t), H = 2 * LOBE + w, y0 = -H / 2;
  const p = [[0, y0], [D, y0]];
  if (w > 0.5) p.push([D, -w / 2], [D - dv, -wt / 2], [D - dv, wt / 2], [D, w / 2]);
  p.push([D, -y0], [0, -y0]);
  return p;
};

// ── 剪影Δ：引擎终态 vs 目标线，同一 y 网格上的平均横向差（按线段光栅化，
//    不按顶点打点——line-draft 的教训）。这是唯一与「看起来像不像」相关的分数：
//    尖/深/缝/锁定数四项全对时形仍可能全错（本项目第四次「量对了、形错了」）。
const SIL_DY = 0.5;
function rasterSil(pts, yLo, yHi) {
  const n = Math.ceil((yHi - yLo) / SIL_DY) + 1;
  const sil = new Float64Array(n);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [xA, yA] = pts[i];
    const [xB, yB] = pts[i + 1];
    const b0 = Math.round((Math.min(yA, yB) - yLo) / SIL_DY);
    const b1 = Math.round((Math.max(yA, yB) - yLo) / SIL_DY);
    for (let b = Math.max(0, b0); b <= Math.min(n - 1, b1); b++) {
      const y = yLo + b * SIL_DY;
      const fr = Math.abs(yB - yA) < 1e-9 ? 0 : (y - yA) / (yB - yA);
      const x = xA + (xB - xA) * Math.min(1, Math.max(0, fr));
      if (x > sil[b]) sil[b] = x;
    }
  }
  return sil;
}

function measure(li, spec, sim) {
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
  // 剪影Δ（引擎轮廓以缝心节点为 y 原点，目标线本就以缝心为原点）
  const cy = py(spec.marks.c);
  const prof = [];
  for (let i = LEAD; i < LEAD + spec.marks.fLen; i++) prof.push([px(i), py(i) - cy]);
  const half = (2 * LOBE + wOf(t)) / 2 + 4;
  const silE = rasterSil(prof, -half, half);
  const silT = rasterSil(target(t), -half, half);
  let sum = 0;
  for (let b = 0; b < silE.length; b++) sum += Math.abs(silE[b] - silT[b]);
  const silD = sum / silE.length;
  return { li, t, spec, sim, depth, tipX, height: y1 - y0, mouth, silD, locked: sim.locked.length, total };
}

if (SWEEP && ONLY !== null && ONLY >= 1 && ONLY <= 9) {
  // 单级配方扫描：ramp × 壁键密度 × 设计深度，按剪影Δ排序（COMBOS 环境变量可注入）
  let combos = [];
  for (const ramp of [true, false])
    for (const wallStep of [0, 2, 4])
      for (const boxD of [40, 36]) combos.push({ ramp, wallStep, boxD });
  if (process.env.COMBOS) combos = JSON.parse(process.env.COMBOS);
  const rows = combos.map((tu) => {
    const spec = levelMid(LEVEL_T[ONLY], tu);
    const m = measure(ONLY, spec, runToEnd(spec.segs, spec.opts));
    return { tu, m };
  });
  rows.sort((x, y) => x.m.silD - y.m.silD);
  for (const { tu, m } of rows)
    console.log(
      `L${ONLY} Δ ${m.silD.toFixed(2).padStart(6)}  尖 ${m.tipX.toFixed(1).padStart(5)} 深 ${m.depth.toFixed(1)} ` +
        `缝 ${m.mouth.toFixed(1)} 高 ${m.height.toFixed(1)} 锁 ${m.locked}/${m.total}  ${JSON.stringify(tu)}`,
    );
  process.exit(0);
}

const list = ONLY !== null ? [ONLY] : LEVEL_T.map((_, i) => i);
const runs = list.map((li) => {
  const spec = levelSpec(li);
  const snaps = SNAP ? [] : null;
  const sim = runToEnd(spec.segs, spec.opts, snaps);
  if (snaps) spec.snaps = snaps;
  return measure(li, spec, sim);
});

for (const r of runs)
  console.log(
    `L${r.li} t=${r.t.toFixed(3)} 目标[尖 ${(D - dvOf(r.t)).toFixed(1)} 深 ${D} 缝 ${wOf(r.t).toFixed(1)} 高 ${(2 * LOBE + wOf(r.t)).toFixed(1)}]  ` +
      `实测[尖 ${r.tipX.toFixed(1)} 深 ${r.depth.toFixed(1)} 缝 ${r.mouth.toFixed(1)} 高 ${r.height.toFixed(1)}]  ` +
      `剪影Δ ${r.silD.toFixed(2)}  锁 ${r.locked}/${r.total}`,
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
  svg += `<path d="${path(smoothPts(pts, r.spec.marks.kind === 'mid' ? 1 : 3), ox, OY, cy)}" fill="none" stroke="#1c3a2c" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
});
svg += '</svg>';
if (SNAP && runs[0]?.spec.snaps) {
  // 快照模式：六帧成形过程（原始折线不平滑；蓝点=缝底节点、橙点=缝角）
  const r = runs[0];
  const SW = 280;
  const SSC = 2.2;
  const sh = 320 * SSC * 0.5;
  const W2 = PAD * 2 + SNAP_AT.length * SW;
  const H2 = 760;
  let s2 = `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W2}" height="${H2}" fill="#f6f4ef"/>
<text x="${PAD}" y="24" font-size="15" font-weight="700" fill="#1b1b1a">L${r.li} 成形过程（步数 / 锁定数）</text>`;
  r.spec.snaps.forEach((sn, i) => {
    const ox = PAD + i * SW + 20;
    const oy = 48;
    const pts = [];
    for (let k = 0; k < r.spec.marks.fLen; k++)
      pts.push([sn.px[LEAD + k] * 100, -sn.py[LEAD + k] * 100]);
    let yMin = Infinity;
    for (const [, y] of pts) yMin = Math.min(yMin, y);
    s2 += `<text x="${ox}" y="${oy - 6}" font-size="12" font-weight="600" fill="#3a3a38">step ${sn.step} · 锁 ${sn.locked}</text>`;
    s2 += `<line x1="${ox}" y1="${oy}" x2="${ox}" y2="${oy + 660}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
    s2 += `<path d="${pts.map(([x, y], k) => `${k ? 'L' : 'M'}${(ox + x * SSC).toFixed(1)},${(oy + (y - yMin) * SSC).toFixed(1)}`).join('')}" fill="none" stroke="#1c3a2c" stroke-width="1.1" stroke-linejoin="round"/>`;
    if (r.spec.marks.kind === 'mid') {
      const dot = (idx, col) => {
        const x = ox + sn.px[idx] * 100 * SSC;
        const y = oy + (-sn.py[idx] * 100 - yMin) * SSC;
        s2 += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${col}"/>`;
      };
      dot(r.spec.marks.c, '#2255bb');
      dot(r.spec.marks.mouthA, '#D85A30');
      dot(r.spec.marks.mouthB, '#D85A30');
    }
  });
  s2 += '</svg>';
  writeFileSync(OUT.replace(/\.svg$/, '-snap.svg'), s2);
  console.log(`→ ${OUT.replace(/\.svg$/, '-snap.svg')}（快照）`);
}
writeFileSync(OUT, svg);
console.log(`→ ${OUT}`);
