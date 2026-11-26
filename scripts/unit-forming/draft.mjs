// 项目二 · 一台单元的成形过程：三张图（2026-11-26 立项；第二版按作者看小样后的意见改）。
//   B  配对 → 靠拢 → 扣上：一条带摊平（十道弧 = 哪两点配成一对），中间两步两端靠拢，最后扣成台。只讲原理，不画实际构造
//   D  六个时刻挂在同一条天花线下：收在天花下 → 降下来 → 展开成筒 → 芯缩短 → 上下两层靠拢 → 键扣上成平台
//   A  成形叠在一张剖面里：八个时刻由浅到深，a b c d 四个点走过的路
// 画的是 Lab 2-15 那台方台的角档。**起止的尺寸是引擎与台架的实测**（现跑 createSkinUnit + advance，键谱 = cohabit-solid 的
// UNIT_TIERS[2]，换成米的那条链与台架相同）：夹环相距、上夹环下降多少、挑出、台厚、台面高度、每颗键在台上的位置、收起时多长。
// **中间的形是示意**（作者 11-26「现实里布在扣上的时候会起各种褶皱，给它美化一下，变成比较平滑的过程」）：按布长不变画的一族
// 光滑曲线（见 idealFrame），引擎里的褶皱、键在芯缩到一半时就同一步扣上这两件事不画，图注里写明。
// 第一版（中间各步照引擎原样画）在 git 历史里：提交 3b032c7 的 draft.mjs。
//
// 用法：node scripts/unit-forming/draft.mjs [输出目录=项目二_成形过程]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = process.argv[2] ?? join(root, '项目二_成形过程');
mkdirSync(OUT, { recursive: true });

const FONT = `font-family="'Noto Sans CJK SC','PingFang SC','Source Han Sans SC','WenQuanYi Zen Hei',sans-serif"`;
const PAPER = '#fbfaf7';
const INK = '#222';
const MUTE = '#8a847a';
const HAIR = '#cfc8ba';
const SOFT = '#ebe6dc';
const GREEN = '#2f7d5b'; // 布里变成台面的那两段
const GREEN_L = '#9cc7b0';
const KEY = '#e06b3d'; // 键：与台架键线同色（SkinSolidBench C_BOND）
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f1 = (v) => v.toFixed(1);
const f2 = (v) => v.toFixed(2);
const T = (x, y, s, o = {}) =>
  `<text x="${f1(x)}" y="${f1(y)}" font-size="${o.size ?? 13}" fill="${o.fill ?? INK}" ${o.anchor ? `text-anchor="${o.anchor}"` : ''} ${o.bold ? 'font-weight="700"' : ''} ${o.halo ? `stroke="${PAPER}" stroke-width="5" stroke-linejoin="round" paint-order="stroke"` : ''} ${FONT}>${esc(s)}</text>`;
const L = (x1, y1, x2, y2, o = {}) =>
  `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} ${o.cap ? `stroke-linecap="${o.cap}"` : ''}/>`;
const P = (pts, o = {}) =>
  `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])}`).join('')}${o.close ? 'Z' : ''}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" stroke-linejoin="round" stroke-linecap="${o.cap ?? 'round'}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} ${o.op != null ? `opacity="${o.op}"` : ''}/>`;
/** 竖向尺寸线（两端短横 + 中间一行字） */
function dimV(x, y1, y2, label, o = {}) {
  const c = o.stroke ?? MUTE;
  const side = o.side ?? -1;
  return (
    L(x, y1, x, y2, { stroke: c, w: 0.9 }) + L(x - 4, y1, x + 4, y1, { stroke: c, w: 0.9 }) + L(x - 4, y2, x + 4, y2, { stroke: c, w: 0.9 }) +
    `<text transform="translate(${f1(x + side * 7)} ${f1((y1 + y2) / 2)}) rotate(-90)" font-size="${o.size ?? 12}" fill="${o.fill ?? c}" text-anchor="middle" ${FONT}>${esc(label)}</text>`
  );
}
function dimH(x1, x2, y, label, o = {}) {
  const c = o.stroke ?? MUTE;
  return (
    L(x1, y, x2, y, { stroke: c, w: 0.9 }) + L(x1, y - 4, x1, y + 4, { stroke: c, w: 0.9 }) + L(x2, y - 4, x2, y + 4, { stroke: c, w: 0.9 }) +
    T((x1 + x2) / 2, y + (o.below ? 16 : -7), label, { size: o.size ?? 12, fill: o.fill ?? c, anchor: 'middle', halo: true })
  );
}
const sheet = (W, H, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${PAPER}"/>${body}</svg>`;

// ───────────────────────────────────────────────────────────── 数据：现跑引擎
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
const solid = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
const skin = await server.ssrLoadModule('/src/lib/space/skin-unit.ts');
const act = await server.ssrLoadModule('/src/lib/space/unit-activation.ts');
const ring = await server.ssrLoadModule('/src/lib/space/skin-ring.ts');
const sq = await server.ssrLoadModule('/src/lib/space/skin-square.ts');
const grid = await server.ssrLoadModule('/src/lib/space/skin-grid.ts');
await server.close();

const { UNIT_TIERS, UNITS_PER_M, HOIST, TABLE_TOP, TrajectoryBaker, FRAMES, rigFor, unitTopY, unitFootY } = solid;
const { SKIN, createSkinUnit, renderSmooth, buildUnit } = skin;
const TIER = 2; // 角档
const def = UNIT_TIERS[TIER];

// 尺度（与 Lab 2-15、scripts/unit-blender/export.mjs 同一条链）
const layout = act.planLayout(8, ring.RING.RADIUS_DEF, 'room');
const faceTraj = new TrajectoryBaker(UNIT_TIERS[0], FRAMES).runAll();
const rig = rigFor(layout, faceTraj);
const mOf = (u) => u / UNITS_PER_M; // 世界单位 → 米
const PX = (e) => mOf(e * 100 * rig.s); // 引擎单位 → 米
const ST_R = mOf(sq.SQUARE.RADIUS * rig.s); // 带子站位半径（剖面 x = 0 离芯轴多远）
const CEIL = mOf(grid.ROOM.FLOOR_Y);
/** 引擎 py（向上为正）→ 离地高度（米），装置原点在 originY（世界 Y，向下为正） */
const heightAt = (py, originY = rig.y) => mOf(grid.ROOM.FLOOR_Y - (originY + rig.s * (-py * 100)));

// 一条带的正向录像：每一步的（绘图平滑后的）剖面、芯顶、收缩比、扣上的键
const unit = createSkinUnit(def.spec, def.opts);
const n = unit.n;
const [sw, sp] = def.smooth;
const film = [];
const snap = () => {
  const s = renderSmooth(unit.px, unit.py, sw, sp);
  film.push({ x: Float64Array.from(s.x), y: Float64Array.from(s.y), top: unit.coreTop, r: unit.r, locked: unit.locked.length });
};
snap();
const lockStep = new Map();
while (!unit.done) {
  const before = unit.locked.length;
  unit.advance();
  for (let k = before; k < unit.locked.length; k++) lockStep.set(`${unit.locked[k][0]}-${unit.locked[k][1]}`, unit.step);
  snap();
}
const bonds = buildUnit(def.spec).chains.flat().map(([i, j, rb]) => ({ i, j, rb }));
const panel = buildUnit(def.spec).panels[0];
const LOCK = Math.min(...lockStep.values());
const LOCK_LAST = Math.max(...lockStep.values());
/** 形状不再动的第一步（之后的帧与终态相同） */
let SETTLE = film.length - 1;
for (let s = film.length - 2; s >= 0; s--) {
  let d = 0;
  for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(film[s].x[i] - film[film.length - 1].x[i]), Math.abs(film[s].y[i] - film[film.length - 1].y[i]));
  if (d > 1e-4) break;
  SETTLE = s;
}
const END = Math.min(film.length - 1, Math.ceil(SETTLE / 50) * 50);
/** 录像从哪一步起用：引擎第 0 步是初始摆位（台架也跳过它），十来步后才是它自己的形 */
const S0 = 12;
/**
 * 「落到工位」的样子 = 台架上的直带子那一帧（STEADY.straight：回程末帧，r = R0、键全松开时布自己垂着的形）。
 * 正向协议一开跑，键就开始把上下两层往一起吸，头十来步布已经鼓成一团，所以这一刻不能取正向第 0 / 第 12 步。
 */
const cornerTraj = new TrajectoryBaker(def, FRAMES).runAll();
const sf = cornerTraj.frames[solid.STEADY.straight];
const hang = { x: sf.subarray(0, n), y: sf.subarray(n), top: Math.max(...sf.subarray(n)), r: SKIN.R0 };
const fin = film[END];

// 分段（节点序号）：谱 = [贴合 | 自由（带键）| 贴合]；键把自由段分成 上缓冲 · 台面 · 端面 · 台底 · 下缓冲
const CLAMP_N = 5; // 上下夹环各夹住端头几节（项目二_单元建模.md §2）
const gTop = def.spec[0][1];
const freeN = def.spec[1][1];
const iOuter = Math.min(...bonds.map((b) => b.i)); // 最大那颗键的上端 = 台面起点
const jOuter = Math.max(...bonds.map((b) => b.j));
const SEGS = [
  { a: 0, b: CLAMP_N, key: 'clampT', label: '夹在上夹环里' },
  { a: CLAMP_N, b: gTop, key: 'glue', label: '贴着芯' },
  { a: gTop, b: iOuter, key: 'slack', label: '缓冲' },
  { a: iOuter, b: panel[0], key: 'top', label: '台面' },
  { a: panel[0], b: panel[1], key: 'end', label: '端面' },
  { a: panel[1], b: jOuter, key: 'bottom', label: '台底' },
  { a: jOuter, b: gTop + freeN, key: 'slack', label: '缓冲' },
  { a: gTop + freeN, b: n - 1, key: 'clampB', label: '夹在下夹环里' },
];
const SEG_STYLE = {
  clampT: { stroke: INK, w: 5 },
  clampB: { stroke: INK, w: 5 },
  glue: { stroke: MUTE, w: 2.2 },
  slack: { stroke: INK, w: 1.4, dash: '1 3.2' },
  top: { stroke: GREEN, w: 3.4 },
  end: { stroke: INK, w: 3.4 },
  bottom: { stroke: GREEN_L, w: 3.4 },
};

// 读数
const reach = (f) => { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, f.x[i]); return m; };
const avgY = (f, a, b) => { let s = 0; for (let i = a; i <= b; i++) s += f.y[i]; return s / (b - a + 1); };
const read = {
  band: PX((n - 1) * SKIN.SEG),
  topDrop: PX(film[0].top - fin.top),
  hang0: heightAt(film[0].top) - heightAt(film[0].y[n - 1]),
  hang1: heightAt(fin.top) - heightAt(fin.y[n - 1]),
  reach: PX(reach(fin)),
  thick: PX(avgY(fin, iOuter + 6, panel[0] - 4) - avgY(fin, panel[1] + 4, jOuter - 6)),
  top: heightAt(avgY(fin, iOuter + 6, panel[0] - 4)),
  foot: heightAt(fin.y[n - 1]),
  maxSpan: jOuter - iOuter,
  halfSpan: PX(((jOuter - iOuter) / 2) * SKIN.SEG),
  rLock: film[LOCK].r,
  free0: PX((freeN - 1) * SKIN.SEG * SKIN.R0),
  free1: PX((freeN - 1) * SKIN.SEG * fin.r),
  freeCloth: PX((freeN - 1) * SKIN.SEG),
};
const tiers = UNIT_TIERS.map((d, t) => {
  const b = buildUnit(d.spec).chains.flat();
  const span = Math.max(...b.map(([i, j]) => j - i));
  return { name: ['面', '边', '角'][t], span, half: PX((span / 2) * SKIN.SEG) };
});
console.log('尺度 m/节', f2(PX(SKIN.SEG) * 100), 'cm · 站位半径', f2(ST_R), '· 天花', f2(CEIL));
console.log('锁定', LOCK, '–', LOCK_LAST, '步（r =', f2(read.rLock), '）· 停稳', SETTLE, '· 取到', END);
console.log(Object.entries(read).map(([k, v]) => `${k} ${typeof v === 'number' ? v.toFixed(3) : v}`).join(' · '));
console.log('三档最大跨', tiers.map((t) => `${t.name} ${t.span} 节 → 半跨 ${f2(t.half)} m`).join(' · '));

// ───────────────────────────────────────────────────────────── 示意用的光滑模型（起止钉在实测上）
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const H_KEY = read.thick; // 键长 = 台厚
const R1 = read.reach; // 成形后挑出
const L_LOBE = 2 * R1 + H_KEY; // 折成台面 + 端面 + 台底的那段布
const S_STRAIGHT = read.band - L_LOBE; // 其余贴着芯的布（上下两段）
const LOW_FRAC = (read.top - read.thick - read.foot) / (read.hang1 - H_KEY); // 台底以下那段占多少
const M0 = read.hang0 - S_STRAIGHT; // 落到工位时这段布两端相距多远
/** 每颗键在台面上离带子站位多远（成形后实测），由外（靠芯）到里（端面） */
const SEAT = bonds.map((b) => Math.max(0.012, Math.min(R1, PX(fin.x[b.i])))).sort((a, b) => a - b);

/** 口宽 m、形状指数 p、布长 L 的一瓣（|x/R|^p + |y/(m/2)|^p = 1 的右半）：解出 R，返回沿布等距可查的折线（y 相对瓣心） */
function lobe(m, p, L) {
  const half = (R) => {
    const N = 140, q = [];
    for (let k = 0; k <= N; k++) { const u = k / N; q.push([R * u, (m / 2) * Math.pow(1 - Math.pow(u, p), 1 / p)]); }
    for (let k = 0; k <= N; k++) { const v = 1 - k / N; q.push([R * Math.pow(1 - Math.pow(v, p), 1 / p), (m / 2) * v]); }
    q.sort((A, B) => A[0] - B[0] || B[1] - A[1]);
    return q;
  };
  const len = (q) => { let s = 0; for (let i = 1; i < q.length; i++) s += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); return s; };
  let lo = 0, hi = L;
  for (let it = 0; it < 50; it++) { const mid = (lo + hi) / 2; if (2 * len(half(mid)) < L) lo = mid; else hi = mid; }
  const R = (lo + hi) / 2;
  const top = half(R);
  const pts = [...top, ...top.slice(0, -1).reverse().map(([x, y]) => [x, -y])];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (sg) => {
    const t = Math.max(0, Math.min(total, sg));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < t) i++;
    const f = (t - cum[i - 1]) / Math.max(1e-12, cum[i] - cum[i - 1]);
    return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)];
  };
  return { R, pts, total, at };
}
/**
 * 成形进度 s（0 = 落到工位，1 = 平台）时的一条带，单位米：x = 离带子站位多远，y = 离地高度。
 * 两个夹环的距离在实测的起止之间线性走；贴着芯的两段布拉直（到最后被压短一点）；其余那段布长不变，口越收越窄、形由圆到方。
 */
function idealFrame(s) {
  const D = lerp(read.hang0, read.hang1, s);
  const m = Math.max(H_KEY, D - S_STRAIGHT);
  const squeeze = (D - m) / S_STRAIGHT;
  const yd = read.foot + S_STRAIGHT * LOW_FRAC * squeeze;
  const ym = yd + m / 2;
  const q = clamp01((M0 - m) / (M0 - H_KEY));
  const p = 2 * Math.pow(20, q * q);
  const lb = lobe(m, p, L_LOBE);
  const abs = ([x, y]) => [x, ym + y];
  const curve = lb.pts.map(abs);
  const topH = read.foot + D;
  return {
    s, D, m, R: lb.R, topH, footH: read.foot, locked: m <= H_KEY + 1e-9,
    line: [[0, topH], [0, yd + m], ...curve, [0, yd], [0, read.foot]],
    lobe: curve,
    a: abs(lb.at(0)), b: abs(lb.at(R1)), c: abs(lb.at(lb.total - R1)), d: abs(lb.at(lb.total)),
    seats: SEAT.map((sg) => [abs(lb.at(sg)), abs(lb.at(lb.total - sg))]),
    faces: { top: lb.pts.filter((_, i) => true) },
    at: (sg) => abs(lb.at(sg)), total: lb.total,
  };
}
/** 一瓣按布上的位置切成 台面 · 端面 · 台底 三段（各自的折线） */
function lobeParts(fr, N = 60) {
  const seg = (s0, s1) => Array.from({ length: N + 1 }, (_, k) => fr.at(lerp(s0, s1, k / N)));
  return { top: seg(0, R1), end: seg(R1, fr.total - R1), bottom: seg(fr.total - R1, fr.total) };
}
/** 收着 / 降到一半时的布：两个夹环之间折成几道只往外的褶，布长不变（示意） */
function pleats(topH, footH, folds = 6) {
  const D = topH - footH, k = 2 * folds, seg = read.band / k;
  const amp = Math.sqrt(Math.max(0, seg * seg - (D / k) * (D / k)));
  return Array.from({ length: k + 1 }, (_, i) => [i % 2 ? amp : 0, topH - (D * i) / k]);
}
console.log('示意模型：瓣长', f2(L_LOBE), '· 贴芯', f2(S_STRAIGHT), '· 起始口宽', f2(M0), '· 起始鼓出', f2(idealFrame(0).R), '· 终态挑出', f2(idealFrame(1).R), '· 扣上于 s =', f2((read.hang0 - S_STRAIGHT - H_KEY) / (read.hang0 - read.hang1)));

// ───────────────────────────────────────────────────────────── 画法件
const arrow = (x1, y1, x2, y2, o = {}) => {
  const c = o.stroke ?? MUTE, a = Math.atan2(y2 - y1, x2 - x1), hd = o.head ?? 6;
  return L(x1, y1, x2, y2, { stroke: c, w: o.w ?? 1 }) + P([[x2 - hd * Math.cos(a - 0.45), y2 - hd * Math.sin(a - 0.45)], [x2, y2], [x2 - hd * Math.cos(a + 0.45), y2 - hd * Math.sin(a + 0.45)]], { stroke: c, w: o.w ?? 1 });
};
const dotAt = (x, y, o = {}) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${o.r ?? 3}" fill="${o.fill ?? PAPER}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1.2}"/>`;

// ───────────────────────────────────────────────────────────── B 配对 → 靠拢 → 扣上（原理）
function panelB() {
  const K = 500;
  const W = 1500, H = 1030;
  const F = R1; // 台面这一段布长
  const LOW = S_STRAIGHT * LOW_FRAC, UP = S_STRAIGHT - LOW;
  const yBase = 880;
  /** 直线版：口宽 m 的一道折（台面 / 台底是两条直线，端面竖着） */
  const fold = (m) => {
    const R = Math.sqrt(Math.max(0, F * F - ((m - H_KEY) / 2) ** 2));
    const yd = LOW, ya = LOW + m, ym = LOW + m / 2;
    const a = [0, ya], b = [R, ym + H_KEY / 2], c = [R, ym - H_KEY / 2], d = [0, yd];
    const seats = SEAT.map((sg) => { const t = Math.min(1, sg / F); return [[lerp(a[0], b[0], t), lerp(a[1], b[1], t)], [lerp(d[0], c[0], t), lerp(d[1], c[1], t)]]; });
    return { m, R, a, b, c, d, top: ya + UP, seats };
  };
  const stages = [
    { x: 250, f: fold(L_LOBE), no: '①', t: '配对', d: '布上哪两点要扣在一起' },
    { x: 640, f: fold(L_LOBE * 0.66), no: '②', t: '两端靠拢', d: '中间的布没处去，往外折' },
    { x: 930, f: fold(L_LOBE * 0.34), no: '③', t: '每一对越来越近', d: '' },
    { x: 1220, f: fold(H_KEY), no: '④', t: '扣上', d: '每一对相距一个键长，定住' },
  ];
  const X = (st, x) => st.x + x * K;
  const Y = (y) => yBase - y * K;
  let g = '';
  g += T(40, 46, 'B　配对 → 靠拢 → 扣上', { size: 22, bold: true });
  g += T(40, 72, '一条带上的十对点（十颗键）怎么把一段平的布变成一块台。只讲原理：直线代表布，左边灰条代表芯，布的两头固定在芯的两端。', { size: 12.5, fill: MUTE });

  // 跨四步的连线：上端、a、b、c、d 各自去了哪儿
  const link = (pick, o = {}) => P(stages.map((st) => { const q = pick(st.f); return [X(st, q[0]), Y(q[1])]; }), { stroke: o.stroke ?? HAIR, w: o.w ?? 1, dash: o.dash ?? '2 4' });
  g += link((f) => [0, f.top]) + link((f) => f.a) + link((f) => f.b) + link((f) => f.c) + link((f) => f.d);
  g += link(() => [0, 0], { dash: '0' });

  stages.forEach((st, k) => {
    const f = st.f;
    const px = (q) => [X(st, q[0]), Y(q[1])];
    // 芯：一根随步骤变短的灰条
    g += `<rect x="${st.x - 16}" y="${f1(Y(f.top))}" width="8" height="${f1(f.top * K)}" fill="${SOFT}" stroke="${INK}" stroke-width="0.9"/>`;
    // 布
    g += P([px([0, f.top]), px(f.a)], { stroke: MUTE, w: 2 });
    g += P([px(f.d), px([0, 0])], { stroke: MUTE, w: 2 });
    // 键：① 弧，②③ 还没扣上的虚线，④ 扣上的实线
    f.seats.forEach(([u, v], i) => {
      const [x1, y1] = px(u), [x2, y2] = px(v);
      if (k === 0) { const r = (y2 - y1) / 2; g += `<path d="M${f1(x1 + 5)} ${f1(y1)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(x2 + 5)} ${f1(y2)}" fill="none" stroke="${KEY}" stroke-width="1.2"/>`; }
      else if (k < 3) g += L(x1, y1, x2, y2, { stroke: KEY, w: 1, dash: '3 3' });
      else g += L(x1, y1, x2, y2, { stroke: KEY, w: 2.4, cap: 'round' });
    });
    g += P([px(f.a), px(f.b)], { stroke: GREEN, w: 4, cap: 'butt' });
    g += P([px(f.c), px(f.d)], { stroke: GREEN_L, w: 4, cap: 'butt' });
    g += P([px(f.b), px(f.c)], { stroke: INK, w: 4, cap: 'butt' });
    f.seats.forEach(([u, v]) => { g += dotAt(...px(u), { r: 2.2, stroke: KEY, w: 1.1 }) + dotAt(...px(v), { r: 2.2, stroke: KEY, w: 1.1 }); });
    // 两头：上端会动（空心），下端不动（实心 + 斜线）
    g += `<rect x="${st.x - 20}" y="${f1(Y(f.top) - 5)}" width="26" height="10" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>`;
    g += `<rect x="${st.x - 20}" y="${f1(Y(0) - 5)}" width="26" height="10" fill="${INK}"/>`;
    for (let i = 0; i < 4; i++) g += L(st.x - 20 + i * 9, Y(0) + 7, st.x - 27 + i * 9, Y(0) + 16, { stroke: INK, w: 1 });
    // a b c d
    const lab = (q, ch, dx, dy) => T(px(q)[0] + dx, px(q)[1] + dy, ch, { size: 13, bold: true, anchor: 'middle', halo: true });
    if (k === 0) g += lab(f.a, 'a', -30, 4) + lab(f.b, 'b', -30, 2) + lab(f.c, 'c', -30, 8) + lab(f.d, 'd', -30, 4);
    else g += lab(f.a, 'a', -30, 4) + lab(f.b, 'b', 13, -4) + lab(f.c, 'c', 13, 13) + lab(f.d, 'd', -30, 4);
    // 步名
    g += T(st.x - 20, 126, `${st.no} ${st.t}`, { size: 15, bold: true });
    if (st.d) g += T(st.x - 20, 146, st.d, { size: 12, fill: MUTE });
    if (k > 0) g += arrow(st.x - 3, Y(f.top) - 34, st.x - 3, Y(f.top) - 12, { stroke: INK });
  });
  // ① 的分段名
  {
    const st = stages[0], f = st.f;
    const lx = st.x - 52;
    const seg = (y1, y2, name, o = {}) => {
      g += P([[lx + 6, Y(y1) + 2], [lx, Y(y1) + 2], [lx, Y(y2) - 2], [lx + 6, Y(y2) - 2]], { stroke: MUTE, w: 0.8, cap: 'butt' });
      g += T(lx - 8, (Y(y1) + Y(y2)) / 2 + 4, name, { size: 12.5, anchor: 'end', fill: o.fill ?? INK, bold: !!o.bold });
    };
    seg(f.top, f.a[1], '贴着芯');
    seg(f.a[1], f.b[1], '台面', { fill: GREEN, bold: true });
    seg(f.b[1], f.c[1], '端面', { bold: true });
    seg(f.c[1], f.d[1], '台底', { fill: GREEN, bold: true });
    seg(f.d[1], 0, '贴着芯');
    g += T(st.x + 16, Y(f.top) + 4, '上端：随芯缩短往下走', { size: 12, anchor: 'start', fill: MUTE });
    g += T(st.x - 40, Y(0) + 36, '下端：不动', { size: 12, fill: MUTE });
    // 最大那一对的半跨
    const r = (f.a[1] - f.d[1]) / 2 * K;
    const ymid = Y((f.a[1] + f.d[1]) / 2);
    g += dimH(st.x + 5, st.x + 5 + (SEAT.length ? (f.seats[0][0][1] - f.seats[0][1][1]) / 2 * K : r), ymid, '最大一对的半跨', { stroke: INK, fill: INK });
  }
  // ④ 的读法
  {
    const st = stages[3], f = st.f;
    const px = (q) => [X(st, q[0]), Y(q[1])];
    g += dimH(px(f.a)[0], px(f.b)[0], px(f.a)[1] - 30, '挑出 = 最大一对的半跨', { stroke: INK, fill: INK });
    g += T((px(f.a)[0] + px(f.b)[0]) / 2, px(f.d)[1] + 24, `十颗键，每颗 ${f1(H_KEY * 100)} cm`, { size: 12.5, fill: KEY, anchor: 'middle' });
    g += T(px(f.b)[0] + 14, px(f.b)[1] + 14, '台', { size: 14, bold: true, fill: GREEN });
  }
  // ②③ 之间的小提示
  g += T(stages[1].x + 110, Y(stages[1].f.a[1]) - 14, '虚线 = 这一对此刻相距多远', { size: 11.5, fill: KEY, halo: true });
  const by = H - 54;
  g += T(40, by, `这台方台的角档：最大一对隔 ${jOuter - iOuter} 节布，半跨 ${f2(read.halfSpan)} m，挑出 ${f2(read.reach)} m；上端一共下降 ${f2(read.topDrop)} m。换一组配对（哪两点、扣多长），同一条布折成另一个形。`, { size: 12.5 });
  g += T(40, by + 24, '示意：布画成直线，夹具、芯的构造都不画。挑出、键长、下降量是引擎实测。', { size: 11.5, fill: MUTE });
  return { W, H, svg: sheet(W, H, g) };
}

// ───────────────────────────────────────────────────────────── 一条带在某一刻（A、D 共用）
/** fr = idealFrame；toXY = 米 → 屏幕；o.keys: 'none' | 'open' | 'locked' */
function bandOf(fr, toXY, o = {}) {
  const w = o.w ?? 1.6, c = o.stroke ?? INK;
  let g = '';
  if (o.keys === 'open') g += fr.seats.map(([u, v]) => L(...toXY(u), ...toXY(v), { stroke: KEY, w: 0.9, dash: '2.5 2.5' })).join('');
  if (o.keys === 'locked') g += fr.seats.map(([u, v]) => L(...toXY(u), ...toXY(v), { stroke: KEY, w: o.keyW ?? 1.6, cap: 'round' })).join('');
  g += P(fr.line.map(toXY), { stroke: c, w });
  return g;
}

// ───────────────────────────────────────────────────────────── A 成形叠在一张剖面里
function panelA() {
  const K = 560;
  const W = 980, H = 1040;
  const ax = 210;
  const hTop = read.foot + read.hang0 + 0.1;
  const y0 = 150;
  const yOf = (h) => y0 + (hTop - h) * K;
  const toXY = ([x, y]) => [ax + (ST_R + x) * K, yOf(y)];
  let g = '';
  g += T(40, 46, 'A　成形叠在一张剖面里', { size: 22, bold: true });
  g += T(40, 72, '一条带（沿对角线剖开的右半边）从落到工位到成台，八个时刻叠画，由浅到深。点线 = 布上 a b c d 四个点走过的路。', { size: 12.5, fill: MUTE });

  const ss = [0, 0.16, 0.32, 0.48, 0.64, 0.8, 0.92, 1];
  const frames = ss.map(idealFrame);
  const f0 = frames[0], fN = frames[frames.length - 1];
  const yTop0 = yOf(f0.topH), yTop1 = yOf(fN.topH), yFoot = yOf(read.foot);
  const cw = ST_R * K;
  // 芯轴与芯
  g += L(ax, y0 - 26, ax, yFoot + 44, { stroke: MUTE, w: 0.8, dash: '10 3 2 3' });
  g += `<rect x="${ax - 6}" y="${f1(yTop0)}" width="12" height="${f1(yTop1 - yTop0)}" fill="none" stroke="${HAIR}" stroke-width="1" stroke-dasharray="3 3"/>`;
  g += `<rect x="${ax - 6}" y="${f1(yTop1)}" width="12" height="${f1(yFoot - yTop1)}" fill="${SOFT}" stroke="${INK}" stroke-width="1"/>`;
  // 四个点走过的路
  for (const key of ['a', 'b', 'c', 'd']) {
    const path = [];
    for (let k = 0; k <= 80; k++) path.push(toXY(idealFrame(k / 80)[key]));
    g += P(path, { stroke: INK, w: 0.9, dash: '1 3.4' });
  }
  // 八个时刻
  frames.forEach((fr, k) => {
    const last = k === frames.length - 1;
    const t = k / (frames.length - 1);
    const c = Math.round(212 - t * 110);
    const col = `rgb(${c},${c - 4},${c - 12})`;
    if (last) return;
    g += bandOf(fr, toXY, { stroke: col, w: 1.2 + t * 0.5, keys: k === frames.length - 2 ? 'open' : 'none' });
    g += L(ax - 12, yOf(fr.topH), ax + cw + 4, yOf(fr.topH), { stroke: col, w: 2.2 }); // 上夹环此刻的位置
    for (const key of ['a', 'b', 'c', 'd']) g += dotAt(...toXY(fr[key]), { r: 2.3, stroke: col });
  });
  // 成形后：分段上色
  const parts = lobeParts(fN);
  g += fN.seats.map(([u, v]) => L(...toXY(u), ...toXY(v), { stroke: KEY, w: 2, cap: 'round' })).join('');
  g += P([toXY([0, fN.topH]), toXY(fN.a)], { stroke: INK, w: 2.2 }) + P([toXY(fN.d), toXY([0, read.foot])], { stroke: INK, w: 2.2 });
  g += P(parts.top.map(toXY), { stroke: GREEN, w: 3.4, cap: 'butt' }) + P(parts.bottom.map(toXY), { stroke: GREEN_L, w: 3.4, cap: 'butt' }) + P(parts.end.map(toXY), { stroke: INK, w: 3.4, cap: 'butt' });
  for (const [key, dx, dy] of [['a', -14, -6], ['b', 13, -6], ['c', 13, 16], ['d', -14, 16]]) {
    g += dotAt(...toXY(fN[key]), { r: 3.2, fill: INK });
    g += T(toXY(fN[key])[0] + dx, toXY(fN[key])[1] + dy, key, { size: 13.5, bold: true, anchor: 'middle' });
  }
  for (const [key, dx] of [['a', 14], ['b', 14], ['c', 14]]) g += T(toXY(f0[key])[0] + dx, toXY(f0[key])[1] + 4, key, { size: 12.5, fill: MUTE, bold: true });
  // 夹环
  g += `<rect x="${ax - 12}" y="${f1(yTop1 - 3)}" width="${f1(cw + 16)}" height="7" fill="${INK}"/>`;
  g += `<rect x="${ax - 12}" y="${f1(yFoot - 4)}" width="${f1(cw + 16)}" height="7" fill="${INK}"/>`;
  for (let k = 0; k < 6; k++) g += L(ax - 12 + k * 14, yFoot + 6, ax - 20 + k * 14, yFoot + 16, { stroke: INK, w: 1 });
  g += T(ax + cw + 12, yFoot + 18, '下夹环不动', { size: 12 });
  g += T(ax + cw + 12, yTop0 + 4, '上夹环', { size: 12, fill: MUTE });
  g += arrow(ax - 34, yTop0 + 8, ax - 34, yTop1 - 10, { stroke: INK });
  g += `<text transform="translate(${ax - 42} ${f1((yTop0 + yTop1) / 2)}) rotate(-90)" font-size="12.5" fill="${INK}" text-anchor="middle" ${FONT}>上夹环下降 ${f2(read.topDrop)} m（芯缩短这么多）</text>`;
  g += dimV(ax - 86, yTop0, yFoot, `落到工位时 ${f2(read.hang0)} m`);
  g += dimV(ax - 34, yTop1, yFoot, `成形后 ${f2(read.hang1)} m`, { stroke: INK, fill: INK });
  g += T(ax + 4, y0 - 34, '芯轴', { size: 11.5, fill: MUTE });
  // 说明
  const nx = 660;
  const notes = [
    { a: toXY(frames[0].at(frames[0].total * 0.2)), y: yTop0 + 150, t: '落到工位', d: ['布垂着，中段略鼓'] },
    { a: toXY(frames[3].at(frames[3].total * 0.3)), y: yTop0 + 330, t: '芯缩短，布长不变', d: ['a 顺着芯往下滑，d 不动', '夹在中间的布被挤出去'] },
    { a: toXY(frames[6].b), y: yTop1 + 40, t: '上下两层靠拢', d: ['每一对点相距一个键长时', '键扣上（橙色）'] },
    { a: [toXY(fN.b)[0] + 4, (toXY(fN.b)[1] + toXY(fN.c)[1]) / 2], y: yFoot - 30, t: '平台', d: [`挑出 ${f2(read.reach)} m，厚 ${f1(H_KEY * 100)} cm`, `台面离地 ${f2(read.top)} m`] },
  ];
  for (const nt of notes) {
    g += P([[nt.a[0] + 6, nt.a[1]], [nx - 30, nt.y - 5], [nx - 10, nt.y - 5]], { stroke: MUTE, w: 0.8 });
    g += T(nx, nt.y, nt.t, { size: 14, bold: true });
    nt.d.forEach((d, i) => (g += T(nx, nt.y + 19 + i * 17, d, { size: 12, fill: MUTE })));
  }
  g += T(40, H - 20, '示意：起止的尺寸是引擎实测，中间各步按布长不变画成光滑的形（引擎里布会起褶，键在芯缩到一半时就同一步扣上，这里不画）。', { size: 11.5, fill: MUTE });
  return { W, H, svg: sheet(W, H, g) };
}

// ───────────────────────────────────────────────────────────── D 六个时刻挂在同一条天花线下
function panelD() {
  const K = 150;
  const xL = 200, dx = 212;
  const xs = Array.from({ length: 6 }, (_, i) => xL + 90 + i * dx);
  const xR = xs[5] + 130;
  const W = xR + 120;
  const yCeil = 200;
  const yOf = (h) => yCeil + (CEIL - h) * K;
  const yFloor = yOf(0);
  const footDev = -film[0].y[n - 1] * 100;
  const dropTop = (d) => mOf(grid.ROOM.FLOOR_Y - unitTopY(rig, d));
  const dropFoot = (d) => mOf(grid.ROOM.FLOOR_Y - unitFootY(rig, footDev, d));
  const D_MID = 0.55, S4 = 0.42, S5 = 0.8;
  const fr3 = idealFrame(0), fr4 = idealFrame(S4), fr5 = idealFrame(S5), fr6 = idealFrame(1);
  // 六个时刻：上下夹环的高度
  const M = [
    { top: dropTop(0), foot: dropFoot(0), no: '①', t: '收在天花下', d: '布折成一叠' },
    { top: dropTop(D_MID), foot: dropFoot(D_MID), no: '②', t: '降下来', d: '边降边展开' },
    { top: fr3.topH, foot: read.foot, no: '③', t: '展开成筒', d: '落到工位' },
    { top: fr4.topH, foot: read.foot, no: '④', t: '芯缩短', d: '布往外鼓' },
    { top: fr5.topH, foot: read.foot, no: '⑤', t: '上下两层靠拢', d: '每一对点快够着' },
    { top: fr6.topH, foot: read.foot, no: '⑥', t: '键扣上，成平台', d: `挑出 ${f2(read.reach)} m` },
  ];
  let g = '';
  g += T(40, 46, 'D　六个时刻挂在同一条天花线下', { size: 22, bold: true });
  g += T(40, 72, '同一台单元沿对角线剖开，从左到右六个时刻；纵向是真实高度（米）。两条横穿的线 = 上、下夹环的高度。', { size: 12.5, fill: MUTE });
  g += T(40, 91, '前三步两个夹环一起往下、越拉越开；后三步下夹环不动，只有上夹环往下走，布被挤出去成台。', { size: 12.5, fill: MUTE });

  // 天花、地面、台面高度
  g += L(xL, yCeil, xR, yCeil, { stroke: INK, w: 2 });
  for (let x = xL; x < xR; x += 12) g += L(x, yCeil, x + 7, yCeil - 8, { stroke: INK, w: 0.7 });
  g += L(xL, yFloor, xR, yFloor, { stroke: INK, w: 2 });
  g += T(xL - 10, yCeil + 4, `天花 ${f2(CEIL)}`, { size: 12, anchor: 'end' });
  g += T(xL - 10, yFloor + 4, '地面 0', { size: 12, anchor: 'end' });
  g += L(xL, yOf(read.top), xR, yOf(read.top), { stroke: HAIR, w: 0.9, dash: '5 4' });
  g += T(xL - 10, yOf(read.top) + 4, `台面 ${f2(read.top)}`, { size: 12, anchor: 'end', fill: GREEN });
  // 两条夹环线
  g += P(M.map((m, i) => [xs[i], yOf(m.top)]).concat([[xR, yOf(M[5].top)]]), { stroke: MUTE, w: 1 });
  g += P(M.map((m, i) => [xs[i], yOf(m.foot)]).concat([[xR, yOf(M[5].foot)]]), { stroke: MUTE, w: 1 });
  g += T(xR + 8, yOf(M[5].top) + 4, '上夹环', { size: 12.5, bold: true });
  g += T(xR + 8, yOf(M[5].foot) + 4, '下夹环', { size: 12.5, bold: true });

  // 每个时刻：吊杆（空心）· 芯（实线）· 两个夹环 · 布
  const hw = ST_R * K;
  M.forEach((m, i) => {
    const cx = xs[i], yT = yOf(m.top), yF = yOf(m.foot);
    g += `<rect x="${f1(cx - 4)}" y="${yCeil}" width="8" height="${f1(Math.max(0, yT - yCeil))}" fill="${PAPER}" stroke="${INK}" stroke-width="0.9"/>`;
    g += L(cx, yT, cx, yF, { stroke: INK, w: 2.2 });
    const draw = (line, o = {}) => { let u = ''; for (const side of [1, -1]) u += P(line.map(([x, y]) => [cx + side * (ST_R + x) * K, yOf(y)]), { stroke: INK, w: 1.5, ...o }); return u; };
    if (i === 0) g += draw(pleats(m.top, m.foot, 6), { w: 1.1 });
    else if (i === 1) g += draw(pleats(m.top, m.foot, 6), { w: 1.3 });
    else {
      const fr = [null, null, fr3, fr4, fr5, fr6][i];
      for (const side of [1, -1]) {
        const toXY = ([x, y]) => [cx + side * (ST_R + x) * K, yOf(y)];
        if (i === 5) {
          const pr = lobeParts(fr, 30);
          g += `<path d="${[...pr.top, ...pr.end, ...pr.bottom].map((q, j) => `${j ? 'L' : 'M'}${f1(toXY(q)[0])} ${f1(toXY(q)[1])}`).join('')}Z" fill="${GREEN}" opacity="0.22"/>`;
        }
        g += bandOf(fr, toXY, { w: 1.5, keys: i === 4 ? 'open' : i === 5 ? 'locked' : 'none', keyW: 1.3 });
      }
    }
    g += `<rect x="${f1(cx - hw - 3)}" y="${f1(yT - 2)}" width="${f1(2 * hw + 6)}" height="5" fill="${INK}"/>`;
    g += `<rect x="${f1(cx - hw - 3)}" y="${f1(yF - 3)}" width="${f1(2 * hw + 6)}" height="5" fill="${INK}"/>`;
    g += T(cx, yCeil - 50, `${m.no} ${m.t}`, { size: 14, bold: true, anchor: 'middle' });
    g += T(cx, yCeil - 31, m.d, { size: 12, fill: MUTE, anchor: 'middle' });
  });
  // 动作箭头
  const ar = (x, y1, y2) => arrow(x, y1, x, y2, { stroke: INK, w: 1.1 });
  g += ar(xs[1] + 46, yOf(M[1].top) + 6, yOf(M[1].top) + 44) + ar(xs[1] + 46, yOf(M[1].foot) - 30, yOf(M[1].foot) + 8);
  for (const i of [3, 4]) {
    g += ar(xs[i] + hw + 12, yOf(M[i].top) - 30, yOf(M[i].top) - 4);
    const fr = i === 3 ? fr4 : fr5;
    const yt = yOf(fr.at(fr.total / 2)[1]);
    for (const side of [1, -1]) g += arrow(xs[i] + side * ((ST_R + fr.R) * K + 6), yt, xs[i] + side * ((ST_R + fr.R) * K + 24), yt, { stroke: INK, w: 1.1 });
  }
  // 尺寸
  g += T(xs[0] - 42, yOf((M[0].top + M[0].foot) / 2) + 22, `收着时 ${f2(M[0].top - M[0].foot)} m 长`, { size: 11.5, fill: MUTE, anchor: 'end' });
  g += dimV(xs[2] - 58, yOf(M[2].top), yOf(M[2].foot), `夹环相距 ${f2(read.hang0)} m`);
  g += dimV(xs[5] + 92, yOf(M[5].top), yOf(M[5].foot), `${f2(read.hang1)} m`, { side: 1 });

  // 下方：谁在动
  const ry = yFloor + 44, rh = 24, gap = 8;
  const rows = [
    { name: '吊杆', bars: [[0, 5, '放长', INK]] },
    { name: '芯', bars: [[0, 2, '放长', INK], [2, 5, '缩短', INK, true]] },
    { name: '键', bars: [[0, 4.72, '松着', MUTE, false, true], [4.72, 5, '扣上', KEY, true]] },
  ];
  const xi = (v) => { const i = Math.floor(v), f = v - i; return i >= 5 ? xs[5] : lerp(xs[i], xs[i + 1], f); };
  rows.forEach((r, k) => {
    const y = ry + k * (rh + gap);
    g += T(xL - 10, y + rh / 2 + 4, r.name, { size: 12.5, anchor: 'end', bold: true });
    for (const [a, b, label, col, solid, dashed] of r.bars) {
      const x1 = xi(a) + (a > 0 ? 3 : -30), x2 = xi(b) + (b >= 5 ? 30 : -3);
      g += `<rect x="${f1(x1)}" y="${y}" width="${f1(x2 - x1)}" height="${rh}" fill="${solid ? col : PAPER}" stroke="${col}" stroke-width="1" ${dashed ? 'stroke-dasharray="4 3"' : ''}/>`;
      g += T((x1 + x2) / 2, y + rh / 2 + 4.5, label, { size: 12, anchor: 'middle', fill: solid ? PAPER : col });
    }
  });
  for (const x of xs) g += L(x, yFloor, x, ry + 3 * (rh + gap) - gap, { stroke: HAIR, w: 0.8, dash: '2 4' });
  const fy = ry + 3 * (rh + gap) + 22;
  g += T(xL - 60, fy, '吊杆一直在放长。前三步芯也放长，整台往下走、布被拉开；后三步芯缩短的量等于吊杆放长的量，所以下夹环停在原处。', { size: 12.5 });
  g += T(xL - 60, fy + 24, '示意：各时刻的高度、夹环相距、挑出取台架与引擎的实测；收着时的褶、中间各步的形按布长不变画成光滑的；吊杆、夹环、芯的样子是建模假设。', { size: 11.5, fill: MUTE });
  return { W, H: fy + 50, svg: null, body: g };
}

const A = panelA();
const B = panelB();
const D0 = panelD();
const D = { W: D0.W, H: D0.H, svg: sheet(D0.W, D0.H, D0.body) };
const files = [['forming-a-strobe', A], ['forming-b-unrolled', B], ['forming-d-timeline', D]];
for (const [name, p] of files) writeFileSync(join(OUT, `${name}.svg`), p.svg);
try {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  for (const [name, p] of files) {
    const pg = await b.newPage({ viewport: { width: p.W, height: p.H }, deviceScaleFactor: 2 });
    await pg.setContent(`<html><body style="margin:0">${p.svg}</body></html>`);
    await pg.screenshot({ path: join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: p.W, height: p.H } });
    await pg.close();
  }
  await b.close();
} catch (e) {
  console.log('（没有 playwright，只出 SVG）', e.message);
}
console.log('出图 →', OUT);
