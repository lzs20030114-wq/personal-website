// 线稿工具：把一串键谱的**真引擎终态剖面**画成只有线的形态系列。
//
// 纪律（用户 2026-08-20 立）：先设计只有线的形态系列、确认后再上 3D。
// 用法： npx vite-node scripts/skin-ring/draft.mjs <out.svg> [模式]
//   模式 catalog（默认）= 目录四形态并排 + 叠合对照
//        bulb-ledge = 蘑菇↔直挑台的粗排系列（探路用；实测这一对差 1.86px，已否）
//        ring-gradient = 定版：Lab.09 环上渐变（蘑菇↔方箱，20 位回文 = 11 级）
//        ring-square = 方形环线稿：三档挑出把俯视外轮廓凑成正方形（角带 = 现行方箱原谱）
import { writeFileSync } from 'node:fs';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import {
  RING, RING_BAND_NODES, RING_CENTER, RING_GROW, RING_LEAD,
  buildRingUnits, growSeg,
} from '../../src/lib/space/skin-ring.ts';
import { ARRAY_CENTER, ARRAY_FREE, ARRAY_LEAD, ARRAY_TAIL, placeOnBand } from '../../src/lib/space/skin-array.ts';
import { SKIN_SITE_BASE, SKIN_UNITS, skinSiteOpts } from '../../src/lib/space/skin-data.ts';
import { buildGradientOrder, buildRingGradient } from '../../src/lib/space/skin-ring-gradient.ts';

const OUT = process.argv[2] ?? 'draft.svg';
const MODE = process.argv[3] ?? 'catalog';
const M = 160; // 等弧长重采样点数

const runToEnd = (spec, opts) => {
  const s = createSkinUnit(spec, opts);
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return s;
};
/** 自由段终态剖面（世界 px，x = 离轴、y = 向下） */
const rawProfile = (sim) => {
  const pts = [];
  for (let i = ARRAY_LEAD; i < ARRAY_LEAD + ARRAY_FREE; i++)
    pts.push([sim.px[i] * 100, -sim.py[i] * 100]);
  return pts;
};
const resample = (pts) => {
  const L = [0];
  for (let i = 1; i < pts.length; i++)
    L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = L[L.length - 1];
  const out = [];
  let j = 0;
  for (let m = 0; m < M; m++) {
    const s = (m / (M - 1)) * total;
    while (j < L.length - 2 && L[j + 1] < s) j++;
    const f = (s - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
    out.push([pts[j][0] + f * (pts[j + 1][0] - pts[j][0]), pts[j][1] + f * (pts[j + 1][1] - pts[j][1])]);
  }
  return out;
};
const dist = (A, B) => {
  let s = 0;
  for (let i = 0; i < M; i++) s += Math.hypot(A[i][0] - B[i][0], A[i][1] - B[i][1]);
  return s / M;
};
/** 画图平滑（照台架的 renderSmooth 口径，只为线稿好看，不改物理） */
const smooth = (pts, w = 3, passes = 1) => {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const next = cur.map((_, i) => {
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
    cur = next;
  }
  return cur;
};

const band = (freeSeg) => [['g', ARRAY_LEAD], freeSeg, ['g', ARRAY_TAIL]];
const DEFS = buildRingUnits();
const byKey = Object.fromEntries(DEFS.map((d) => [d.key, d]));

/** 端点 A→B 的渐变系列：内侧键对按 rb 连续收紧（不是二值加键） */
function bulbLedgeSeries(levels) {
  // 蘑菇 = fan(30, 8..24, rb .10)；直挑台 = fan(30, 4..24, rb .09)
  // 差别只有内侧两对（k=4、6）。二值加键 = 一步跳完 = 断层（Lab.08 的教训），
  // 故内侧两对全程都在，rest 长度从「蘑菇终态下它们本来的间距」连续收到 .09。
  const OPEN = { 4: 0.182, 6: 0.24 }; // 蘑菇终态实测间距（px/100）
  const out = [];
  for (let l = 0; l < levels; l++) {
    const t = l / (levels - 1);
    const rbOuter = 0.1 + (0.09 - 0.1) * t;
    const bonds = [];
    for (const k of [4, 6]) {
      // 内侧两对错峰收紧：k=6 走前 70%，k=4 走后 70%（同时收会把尖端一次夹死）
      const tk = k === 6 ? Math.min(1, t / 0.7) : Math.max(0, (t - 0.3) / 0.7);
      bonds.push([ARRAY_CENTER - k, ARRAY_CENTER + k, OPEN[k] + (0.09 - OPEN[k]) * tk]);
    }
    for (let k = 8; k < 26; k += 2) bonds.push([ARRAY_CENTER - k, ARRAY_CENTER + k, rbOuter]);
    bonds.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
    out.push({ label: `t=${t.toFixed(2)}`, spec: band(['f', ARRAY_FREE, bonds]), opts: { ...SKIN_SITE_BASE }, smooth: [5, 2] });
  }
  return out;
}

function seriesFor(mode) {
  if (mode.startsWith('ring-gradient')) {
    // ring-gradient 或 ring-gradient:<panel格>:<梯挡格>（比稿用）
    const [, pw, kj] = mode.split(':');
    return buildRingGradient(pw ? Number(pw) : undefined, kj ? Number(kj) : undefined).map((d) => ({
      label: d.zh, spec: d.spec, opts: d.opts, smooth: d.smooth,
    }));
  }
  if (mode === 'catalog')
    return DEFS.map((d) => ({ label: `${d.zh} · ${d.en}`, spec: d.spec, opts: d.opts, smooth: d.smooth }));
  if (mode === 'bulb-ledge') return bulbLedgeSeries(11);
  throw new Error(`未知模式 ${mode}`);
}

// ── ring-square：方形环线稿（用户 2026-08-30「先用最简单的 Lab.09 的最初形态来做」）──
//
// 筒芯保持圆的，靠每条带挑出多远把**俯视外轮廓**凑到一个正方形上。
// 相位转半格（9°）让 4 条带正好落在 4 个角上 ⇒ 20 个平台外缘点全部落在方形边上；
// 环间膜俯视是弦线、同一条边上两点之间的弦就是边本身 ⇒ 终态外轮廓精确是方形。
// 20 位 ÷ D4 对称 = 只有 3 档挑出（面 8 条 / 边 8 条 / 角 4 条），解 3 条摆 20 处。
//
// 级族 = 等比缩放（growSeg 的 g 分档，形态同一张方箱谱、键根数不变）。
// 方形只能「往里做」：角档 = 现行方箱原谱（g = RING_GROW，即 Lab.09 整环同形那条），
// 其余两档往小缩——反过来把面档钉在现行大小去把角做大，挑出要 116px+，
// 202 节的带子装不下（总长钉死是 2026-08-25 的拍板）。
// 半径也钉死在默认值：挑出目标是「方形极径 − 站位半径」的绝对量，R 一变三档全要重标。
if (MODE === 'ring-square') {
  ringSquare();
  process.exit(0);
}

function ringSquare() {
  const P = 30; // 画布边距（别用全局 PAD——它声明在本函数被调用之后，TDZ）
  const stepped = SKIN_UNITS.find((d) => d.key === 'stepped');
  const R = RING.RADIUS_DEF;
  const N = RING.COUNT;
  const PHASE = Math.PI / N; // 半格 = 9°：角带落在 45°/135°/225°/315°
  const BUF = 4; // 键谱两端缓冲的纪律下限
  const ISO = 16; // 垫与结构之间的隔离贴合（Lab.12 配平垫先例：约束最大跨距，结构动力学不受垫扰）
  const TAIL2 = 15; // 尾段照环族惯例

  // 贴身自由段：该 g 下 2(kMax+BUF)+1 的最小奇数长度（扇心居整数节点、缓冲压到纪律下限）
  const tautFs = (grown) => {
    let kMax = 0;
    for (const [i, j] of grown[2]) kMax = Math.max(kMax, Math.round((j - i) / 2));
    return 2 * (kMax + BUF) + 1;
  };
  const F_TOT = tautFs(growSeg(stepped.spec[1], RING_GROW)); // 角档贴身长 = 配平基准（奇数）
  const LEAD2 = RING_BAND_NODES - 2 * ISO - F_TOT - TAIL2;

  // 一档 = 同一张方箱谱缩到 g，放进 **配平垫七段谱**（Lab.12 v4 先例）：
  //   [贴合 | 垫 p | 隔离 16 | 结构 fs | 隔离 16 | 垫 p | 尾]，垫+结构 = F_TOT 恒定。
  // 两条弯路都实测过，记在这里：
  // - 三档共用 f=129：面档多出 ~40px 缓冲料，折叠体在松弛区间里被压沉，
  //   嘴心比角档低 61.7px（对位构造「嘴心与键长无关」的隐含前提是缓冲基本吃满跨度）；
  // - 贴身自由段 + lead 配平：常数项补得掉、**斜率补不掉**——coreY 里自由段按 SEG·r
  //   收缩而贴合段不收，fs 不同 ⇒ 嘴心随 r 的斜率不同，全程散布 14.6px（这正是
  //   skin-array 坚持「全员同 f」的原因）。
  // 配平垫把两头都钉死：嘴心高（离下缘）= SEG·(iso+tail) + SEG·r·(p+(fs+1)/2)，
  // 垫+结构恒定 ⇒ 常数项与斜率都与档位无关——对齐是构造给的，在每一个 r 上成立。
  // 垫是无键自由段（rootHug 把它贴在轴上，读作竖带的一部分）；fs 与 F_TOT 都取奇数
  // ⇒ 垫恒为偶数，上下各半精确整数。leadComp = 整数位残差补偿（纯平移），备而少用。
  const levelFor = (g, leadComp = 0) => {
    const grown = growSeg(stepped.spec[1], g);
    const fs = tautFs(grown);
    const c = (fs - 1) / 2;
    const seg = placeOnBand(grown, fs, c);
    const p = (F_TOT - fs) / 2;
    const lead = LEAD2 + leadComp;
    const tail = TAIL2 - leadComp;
    const spec =
      p > 0
        ? [['g', lead], ['f', p, []], ['g', ISO], seg, ['g', ISO], ['f', p, []], ['g', tail]]
        : [['g', lead + ISO], seg, ['g', ISO + tail]];
    const off = lead + p + ISO; // 结构段起点（剖面与嘴的绝对下标从这里偏）
    return { g, seg, fs, c, p, lead, tail, off, spec };
  };

  // 全程检查点（§8.8 教训：动画件的对齐要按整个时间轴验，不能只验终态）
  const CHK_R = [0.87, 0.66, 0.44];
  const chkSteps = CHK_R.map((r) => Math.round((900 * (SKIN.R0 - r)) / (SKIN.R0 - SKIN.R1)));
  const cache = new Map();
  const runLevel = (lv) => {
    const sig = JSON.stringify(lv.spec);
    if (cache.has(sig)) return cache.get(sig);
    const sim = createSkinUnit(lv.spec, skinSiteOpts(stepped));
    const bonds = lv.seg[2];
    let w = bonds[0];
    for (const b of bonds) if (b[1] - b[0] > w[1] - w[0]) w = b;
    const mi = lv.off + w[0];
    const mj = lv.off + w[1];
    const mouthAt = () => -((sim.py[mi] + sim.py[mj]) / 2) * 100;
    const chk = [];
    for (let k = 0; k < SKIN.STEPS; k++) {
      sim.advance();
      if (chkSteps.includes(k)) chk.push(mouthAt());
    }
    let out = 0;
    for (let k = 0; k < sim.n; k++) out = Math.max(out, sim.px[k] * 100);
    const raw = [];
    for (let i = lv.off; i < lv.off + lv.fs; i++) raw.push([sim.px[i] * 100, -sim.py[i] * 100]);
    const res = {
      ...lv, sig, out, raw,
      locked: sim.locked.length,
      mouthY: mouthAt(),
      chk,
      mouthPx: bonds[0][2] * 100,
    };
    cache.set(sig, res);
    return res;
  };

  // 角档 = 现行方箱形态（g = RING_GROW，谱逐位同 Lab.09 整环同形那张；lead/tail 是
  // 位置量不属形态）；方形大小由它反推（sq(θ) = 方形边界的极径）
  const corner = runLevel(levelFor(RING_GROW));
  const a = (R + corner.out) / Math.SQRT2;
  const sq = (th) => a / Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th)));
  const T = { mid: sq((Math.PI * 27) / 180) - R, face: sq((Math.PI * 9) / 180) - R };

  // 标定：g 扫 1.05–1.80（谱经取整会重复，按签名去重），掉键的档直接不要
  const sweep = [];
  const seen = new Set();
  for (let gi = 105; gi <= 180; gi += 1) {
    const r = runLevel(levelFor(gi / 100));
    if (!seen.has(r.sig)) {
      seen.add(r.sig);
      sweep.push(r);
    }
  }
  const pick = (target) => {
    let best = null;
    for (const r of sweep) {
      if (r.locked !== corner.locked) continue;
      if (!best || Math.abs(r.out - target) < Math.abs(best.out - target)) best = r;
    }
    return best;
  };

  // lead 整数位补偿：以角档为基准，把该档全程（三检查点 + 终态）的嘴心平均偏移
  // 用 lead 收掉（1 节 = 2px；lead/tail 对调、总长不变 = 纯平移）
  const allY = (r) => [...r.chk, r.mouthY];
  const compensate = (r0) => {
    const ref = allY(corner);
    const d = allY(r0).reduce((s, y, i) => s + (y - ref[i]), 0) / (CHK_R.length + 1);
    const comp = -Math.round(d / 2);
    return comp === 0 ? r0 : runLevel(levelFor(r0.g, comp));
  };
  const face = compensate(pick(T.face));
  const mid = compensate(pick(T.mid));
  const LV = [
    { name: '面', r: face, target: T.face, count: 8 },
    { name: '边', r: mid, target: T.mid, count: 8 },
    { name: '角', r: corner, target: corner.out, count: 4 },
  ];

  console.log(`ring-square · 方形环三档标定（R=${R} 钉死 · 相位 +9° · 角带 = 现行方箱形态 g=${RING_GROW}）`);
  console.log(`  方形半边长 a = ${a.toFixed(1)}px（边长 ${(2 * a).toFixed(1)}px，外接现行环的外缘）`);
  for (const l of LV)
    console.log(
      `  ${l.name}档 ×${l.count}  g=${l.r.g.toFixed(2)}  谱 [${l.r.lead}|垫${l.r.p}|${ISO}|结构${l.r.fs}|${ISO}|垫${l.r.p}|${l.r.tail}]  挑出 目标 ${l.target.toFixed(1)} / 实测 ${l.r.out.toFixed(1)}` +
        `（偏差 ${(l.r.out - l.target >= 0 ? '+' : '')}${(l.r.out - l.target).toFixed(1)}）  锁定键 ${l.r.locked}  嘴 ${l.r.mouthPx.toFixed(0)}px`,
    );
  for (const l of LV) {
    if (l.r.tail < 11) console.log(`  ⚠ ${l.name}档 tail=${l.r.tail} < 11（尾段太短会拽变形）`);
    if (l.r.lead < 20) console.log(`  ⚠ ${l.name}档 lead=${l.r.lead} < 20（贴合段别让光）`);
  }
  const spreadAt = (i) => {
    const ys = LV.map((l) => allY(l.r)[i]);
    return Math.max(...ys) - Math.min(...ys);
  };
  const spreads = [...CHK_R, SKIN.R1].map((_, i) => spreadAt(i));
  console.log(
    `  三档嘴心散布（全程 r≈${[...CHK_R, SKIN.R1].join('/')}）：${spreads.map((s) => s.toFixed(1)).join(' / ')}px`,
  );
  console.log(`  扫掠 g→挑出（! = 掉键，不取）：${sweep.map((r) => `${r.g.toFixed(2)}→${r.out.toFixed(0)}${r.locked !== corner.locked ? '!' : ''}`).join('  ')}`);

  // 20 位：档位、外缘点、对目标方形的偏差
  const pts = Array.from({ length: N }, (_, i) => {
    const th = PHASE + (i / N) * Math.PI * 2;
    const t = sq(th) - R;
    let lvl = 0;
    for (let l = 1; l < LV.length; l++) if (Math.abs(LV[l].target - t) < Math.abs(LV[lvl].target - t)) lvl = l;
    const rr = R + LV[lvl].r.out;
    return { th, lvl, x: Math.cos(th) * rr, y: Math.sin(th) * rr, dev: rr - sq(th) };
  });
  const maxDev = Math.max(...pts.map((p) => Math.abs(p.dev)));
  console.log(`  20 个外缘点对目标方形的最大偏差 ${maxDev.toFixed(1)}px`);

  // ── SVG：上 = 俯视轮廓，下 = 三档剖面并排 + 叠合 ─────────────────────────
  const HUE = [150, 215, 285]; // 面→角：绿 → 蓝 → 紫
  const col = (l) => `hsl(${HUE[l]} 42% 38%)`;
  const PV = 560; // 俯视画布边长
  const SC2 = (PV - 70) / (2 * (a + 12));
  const cx = P + 60 + PV / 2;
  const cy = P + 52 + PV / 2;
  const X = (x) => (cx + x * SC2).toFixed(1);
  const Y = (y) => (cy + y * SC2).toFixed(1);

  const draws = LV.map((l) => smooth(l.r.raw, 3, 1));
  const allp = draws.flat();
  const b2 = allp.reduce(
    (acc, [x, y]) => ({ x0: Math.min(acc.x0, x), x1: Math.max(acc.x1, x), y0: Math.min(acc.y0, y), y1: Math.max(acc.y1, y) }),
    { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 },
  );
  const SC3 = Math.min(150 / Math.max(1, b2.x1 - b2.x0), 220 / Math.max(1, b2.y1 - b2.y0));
  const oyP = P + 52 + PV + 64;
  const drawH = (b2.y1 - b2.y0) * SC3;
  const lbY = oyP + drawH + 30; // 标签贴着剖面放（画布高度按内容收，不留死空间）
  // 公共 y 基准（对齐验证图的硬要求——逐帧按 yMin 归零会把要验的东西归掉）
  const prof = (ptsIn, ox) =>
    ptsIn.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC3).toFixed(2)},${(oyP + (y - b2.y0) * SC3).toFixed(2)}`).join('');

  const W2 = Math.max(P * 2 + PV + 120, P * 2 + 4 * 230);
  const H2 = Math.ceil(lbY + 14 + 30);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W2}" height="${H2}" fill="#f6f4ef"/>
<text x="${P}" y="${P}" font-size="15" font-weight="700" fill="#1b1b1a">线稿 · ring-square · 方形环（Lab.09 方箱 · 等比缩放三档 · 真引擎终态）</text>
<text x="${P}" y="${P + 20}" font-size="11.5" fill="#3a3a38">R=${R} 钉死 · 相位 +9°（角上有带）· 边长 ${(2 * a).toFixed(0)}px · 外缘点最大偏差 ${maxDev.toFixed(1)}px · 嘴心散布全程 ${Math.max(...spreads).toFixed(1)}px</text>
<text x="${P}" y="${P + 40}" font-size="12" font-weight="700" fill="#1b1b1a">俯视：橙虚线 = 目标方形 · 紫虚线 = 环间膜的弦线 · 灰实圆 = 筒芯（不变）· 灰点圆 = 现行圆环外缘（对照）</text>`;

  // 目标方形 + 芯圆 + 现行圆环外缘（对照：从这个圆变成那个方）
  s += `<rect x="${X(-a)}" y="${Y(-a)}" width="${(2 * a * SC2).toFixed(1)}" height="${(2 * a * SC2).toFixed(1)}" fill="none" stroke="#a05a2c" stroke-width="1.6" stroke-dasharray="7 5"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${(R * SC2).toFixed(1)}" fill="none" stroke="#8f8a7d" stroke-width="1.2"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${((R + corner.out) * SC2).toFixed(1)}" fill="none" stroke="#8f8a7d" stroke-width="1" stroke-dasharray="2 4"/>`;
  // 膜弦线（外缘点连成的 20 边形——同边的弦落在方形边上）
  s += `<polygon points="${pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}" fill="none" stroke="#5a4a8a" stroke-width="1.1" stroke-dasharray="3 3"/>`;
  // 二十条带（径向条：从芯到各自的挑出）
  for (const p of pts) {
    const c = Math.cos(p.th);
    const sn = Math.sin(p.th);
    const w = RING.DEPTH / 2;
    const E = R + LV[p.lvl].r.out;
    const q = (u, v) => `${X(u * c - v * sn)},${Y(u * sn + v * c)}`;
    s += `<polygon points="${q(R, -w)} ${q(E, -w)} ${q(E, w)} ${q(R, w)}" fill="hsl(${HUE[p.lvl]} 40% 42% / 0.5)" stroke="${col(p.lvl)}" stroke-width="1"/>`;
  }
  // 图例
  LV.forEach((l, i) => {
    const ly = P + 76 + i * 20;
    s += `<rect x="${P}" y="${ly - 10}" width="12" height="12" fill="hsl(${HUE[i]} 40% 42% / 0.5)" stroke="${col(i)}"/>`;
    s += `<text x="${P + 18}" y="${ly}" font-size="11" fill="#3a3a38">${l.name} ×${l.count} · g ${l.r.g.toFixed(2)} · 挑出 ${l.r.out.toFixed(1)}</text>`;
  });

  // 三档剖面并排 + 叠合（公共 y 基准：上下缘与嘴心的相对关系直接可读）
  s += `<text x="${P}" y="${oyP - 34}" font-size="12" font-weight="700" fill="#1b1b1a">三档侧面剖面（自由段终态 · 公共 y 基准同比例）——厚度跟着 g 走：角厚面薄，这是等比族的代价</text>`;
  LV.forEach((l, i) => {
    const ox = P + i * 230 + 40;
    s += `<line x1="${ox}" y1="${oyP - 8}" x2="${ox}" y2="${oyP + (b2.y1 - b2.y0) * SC3 + 8}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
    s += `<path d="${prof(draws[i], ox)}" fill="none" stroke="${col(i)}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
    s += `<text x="${ox - 26}" y="${lbY}" font-size="11" font-weight="700" fill="#3a3a38">${l.name}档 g=${l.r.g.toFixed(2)} · 结构 ${l.r.fs} + 垫 ${2 * l.r.p}（配平）</text>`;
    s += `<text x="${ox - 26}" y="${lbY + 14}" font-size="10.5" fill="#3a3a38">挑出 ${l.r.out.toFixed(1)}（目标 ${l.target.toFixed(1)}）· 键 ${l.r.locked} · 嘴 ${l.r.mouthPx.toFixed(0)}px</text>`;
  });
  const ox4 = P + 3 * 230 + 40;
  s += `<line x1="${ox4}" y1="${oyP - 8}" x2="${ox4}" y2="${oyP + (b2.y1 - b2.y0) * SC3 + 8}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
  LV.forEach((_, i) => {
    s += `<path d="${prof(draws[i], ox4)}" fill="none" stroke="${col(i)}" stroke-width="1.3" opacity="0.9" stroke-linejoin="round"/>`;
  });
  s += `<text x="${ox4 - 26}" y="${lbY}" font-size="11" font-weight="700" fill="#3a3a38">叠合 · 嘴心散布全程 ${Math.max(...spreads).toFixed(1)}px</text>`;
  s += '</svg>';
  writeFileSync(OUT, s);
  console.log(`→ ${OUT}`);
}

const series = seriesFor(MODE);
const runs = series.map((u) => {
  const sim = runToEnd(u.spec, u.opts);
  const raw = rawProfile(sim);
  return { ...u, sim, raw, samp: resample(raw), draw: smooth(raw, u.smooth[0], u.smooth[1]) };
});

// 相邻形态距离
const gaps = runs.slice(1).map((r, i) => dist(runs[i].samp, r.samp));
console.log(`模式 ${MODE} · ${runs.length} 级`);
runs.forEach((r, i) => {
  let out = 0;
  for (let k = 0; k < r.sim.n; k++) out = Math.max(out, r.sim.px[k] * 100);
  console.log(`  ${String(i).padStart(2)} ${r.label.padEnd(22)} 离轴 ${out.toFixed(1).padStart(5)}  键 ${String(r.sim.locked.length).padStart(2)}` +
    (i ? `  ← 与上一级距离 ${gaps[i - 1].toFixed(2)}` : ''));
});
if (gaps.length)
  console.log(`相邻距离 ${Math.min(...gaps).toFixed(2)}–${Math.max(...gaps).toFixed(2)}（最大/最小 ${(Math.max(...gaps) / Math.min(...gaps)).toFixed(1)}×）`);
if (MODE.startsWith('ring-gradient')) {
  const order = buildGradientOrder();
  console.log(`环上 20 位 → 级：${order.join(' ')}`);
  const seam = order.map((l, i) => {
    const j = order[(i + 1) % order.length];
    return Math.abs(l - j) === 1 ? gaps[Math.min(l, j)] : NaN;
  });
  console.log(`接缝（19↔0）距离 ${seam[order.length - 1].toFixed(2)}，与其余步同量级 = 闭合成立`);
}

// ── SVG：并排 + 叠合（按全系列公共包围盒等比铺满，形态之间才可比） ──────────
const all = runs.flatMap((r) => r.draw);
const bb = all.reduce(
  (a, [x, y]) => ({ x0: Math.min(a.x0, x), x1: Math.max(a.x1, x), y0: Math.min(a.y0, y), y1: Math.max(a.y1, y) }),
  { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 },
);
const BW = bb.x1 - bb.x0;
const BH = bb.y1 - bb.y0;
const CW = 240;
const CH = 460;
const PAD = 30;
const SC = Math.min((CW - 40) / Math.max(BW, 1), (CH - 20) / Math.max(BH, 1));
const cols = runs.length;
const W = PAD * 2 + cols * CW;
const H = PAD * 2 + CH + 54 + CH + 40;
/** 世界 (x=离轴, y=向下) → 画布；轴（x=0）画成虚线 */
const path = (pts, ox, oy) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * SC).toFixed(2)},${(oy + (y - bb.y0) * SC).toFixed(2)}`).join('');
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,sans-serif">
<rect width="${W}" height="${H}" fill="#f6f4ef"/>
<text x="${PAD}" y="${PAD - 10}" font-size="15" font-weight="700" fill="#1b1b1a">线稿 · ${MODE} · 真引擎终态剖面（自由段，${runs.length} 级）</text>`;
runs.forEach((r, i) => {
  const ox = PAD + i * CW + 30;
  const oy = PAD + 16;
  svg += `<line x1="${ox}" y1="${oy - 6}" x2="${ox}" y2="${oy + BH * SC + 6}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
  svg += `<path d="${path(r.draw, ox, oy)}" fill="none" stroke="#1c3a2c" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
  svg += `<text x="${ox - 24}" y="${oy + CH - 26}" font-size="11" fill="#3a3a38">${r.label}</text>`;
  if (i) svg += `<text x="${ox - 24}" y="${oy + CH - 11}" font-size="11" font-weight="700" fill="#a05a2c">Δ ${gaps[i - 1].toFixed(2)}</text>`;
});
const oy2 = PAD + 16 + CH + 46;
svg += `<text x="${PAD}" y="${oy2 - 14}" font-size="13" font-weight="700" fill="#1b1b1a">全部叠合在同一条轴上（绿 → 紫 = 一级到末级）</text>`;
runs.forEach((r, i) => {
  const hue = 150 + (i / Math.max(1, runs.length - 1)) * 140;
  svg += `<path d="${path(r.draw, PAD + 120, oy2)}" fill="none" stroke="hsl(${hue} 48% 36%)" stroke-width="1.3" opacity="0.9" stroke-linejoin="round"/>`;
});
svg += `<line x1="${PAD + 120}" y1="${oy2 - 6}" x2="${PAD + 120}" y2="${oy2 + BH * SC + 6}" stroke="#cdc7b9" stroke-width="1" stroke-dasharray="4 4"/>`;
svg += '</svg>';
writeFileSync(OUT, svg);
console.log(`→ ${OUT}`);
