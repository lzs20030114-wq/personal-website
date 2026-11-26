// 项目二 · 一台单元的成形过程：三张图（2026-11-26 立项；第二版按作者看小样后的意见改）。
//   B  配对 → 靠拢 → 扣上：一条带摊平（十道弧 = 哪两点配成一对），中间两步两端靠拢，最后扣成台。只讲原理，不画实际构造
//   D  六个时刻挂在同一条天花线下：收在天花下 → 降下来 → 展开成筒 → 芯缩短 → 上下两层靠拢 → 键扣上成平台
//   A  成形叠在一张剖面里：八个时刻由浅到深，a b c d 四个点走过的路
//   E  从左到右十个时刻（作者说的「像胶卷一样」是比喻，只取「时间从左往右排」）：上排是从上往下看的平面（二十条带、
//      面 / 边 / 角三档，外轮廓由圆变方），下排是同一刻沿对角线的剖面，上下同一比例、左右对位。
//      只用正投影、平涂，不画带明暗的立体（出图原则，CLAUDE.md，用户 2026-11-26）
// 画的是 Lab 2-15 那台方台的角档。**起止的尺寸是引擎与台架的实测**（现跑 createSkinUnit + advance，键谱 = cohabit-solid 的
// UNIT_TIERS[2]，换成米的那条链与台架相同）：夹环相距、上夹环下降多少、挑出、台厚、台面高度、每颗键在台上的位置、收起时多长。
// **中间的形是示意**（作者 11-26「现实里布在扣上的时候会起各种褶皱，给它美化一下，变成比较平滑的过程」）：按布长不变画的一族
// 光滑曲线（见 idealFrame），引擎里的褶皱、键在芯缩到一半时就同一步扣上这两件事不画，图注里写明。
// **第三版**（作者 11-26「减少图面上的说明性文字，增加图像本身的说明性，靠符号、图形、像漫画一样的解释替代语言」）：
// 副题、脚注、成句的说明全部拿掉，换成一套符号（空心框 = 会动的一端、实心框加斜线 = 不动的一端、空心点加虚线 = 一对还没扣、
// 实心点加实线 = 扣上、两道短横 = 等长、淡虚框加箭头 = 从哪儿动到哪儿、圆圈 = 放大看一对点）。图上只留步名、构件名与尺寸数字。
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
 * 面 / 边 / 角三档各有自己的挑出（R1t）与键的位置，口宽与瓣底的高度三档相同，三档同时成台。
 */
function idealOf(R1t, seats, phi = Math.PI / 4) {
  const Lt = 2 * R1t + H_KEY;
  const corner = Math.abs(phi - Math.PI / 4) < 1e-9;
  return (s) => {
    const D = lerp(read.hang0, read.hang1, s);
    const m = Math.max(H_KEY, D - S_STRAIGHT); // 口宽：三档相同
    const g = clamp01((M0 - m) / (M0 - H_KEY));
    const p = 2 * Math.pow(20, g * g);
    let Le = L_LOBE;
    if (!corner) {
      // 键还远的时候，每条带多出来的布一样多（带长、夹环相距都相同），鼓得一样大，俯视是个圆；越靠近扣上，各档的键把多余的布
      // 留在芯上，外轮廓由圆经圆角方变成方（|x|^k + |y|^k = a^k，k 由 2 往上走），最后落到各档实测的挑出。
      const w = clamp01((g - 0.25) / 0.6), wS = w * w * (3 - 2 * w);
      const k = 2 * Math.pow(15, wS);
      const rho = (a) => Math.pow(Math.pow(Math.abs(Math.cos(a)), k) + Math.pow(Math.abs(Math.sin(a)), k), -1 / k);
      const Rsup = ((ST_R + lobe(m, p, L_LOBE).R) * rho(phi)) / rho(Math.PI / 4) - ST_R;
      const target = lerp(Rsup, lobe(m, p, Lt).R, clamp01((g - 0.8) / 0.2));
      let lo = m + 1e-4, hi = L_LOBE;
      for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (lobe(m, p, mid).R < target) lo = mid; else hi = mid; }
      Le = (lo + hi) / 2;
    }
    const yd = read.foot + LOW_FRAC * (D - m);
    const ym = yd + m / 2;
    const lb = lobe(m, p, Le);
    const R1e = (Le - H_KEY) / 2;
    const abs = ([x, y]) => [x, ym + y];
    const topH = read.foot + D;
    return {
      s, D, m, R: lb.R, R1: R1e, topH, footH: read.foot, locked: m <= H_KEY + 1e-9,
      line: [[0, topH], [0, yd + m], ...lb.pts.map(abs), [0, yd], [0, read.foot]],
      a: abs(lb.at(0)), b: abs(lb.at(R1e)), c: abs(lb.at(lb.total - R1e)), d: abs(lb.at(lb.total)),
      seats: seats.map((sg) => [abs(lb.at((sg * R1e) / R1t)), abs(lb.at(lb.total - (sg * R1e) / R1t))]),
      at: (sg) => abs(lb.at(sg)), total: lb.total,
    };
  };
}
const idealFrame = idealOf(R1, SEAT);
/** 面 / 边两档成形后的挑出与键位（各现跑一遍引擎到同一步） */
function tierFinal(t) {
  if (t === TIER) return { reach: R1, seats: SEAT };
  const d = UNIT_TIERS[t];
  const u = createSkinUnit(d.spec, d.opts);
  for (let k = 0; k < END; k++) u.advance();
  const sm = renderSmooth(u.px, u.py, d.smooth[0], d.smooth[1]);
  const R = PX(Math.max(...sm.x));
  return { reach: R, seats: buildUnit(d.spec).chains.flat().map(([i]) => Math.max(0.012, Math.min(R, PX(sm.x[i])))).sort((a, b) => a - b) };
}
/** 三档离最近那条边的法线多少度：面 9°、边 27°、角 45°（二十条带每 18° 一条，四条正对四个角） */
const TIER_PHI = [9, 27, 45].map((d) => (d * Math.PI) / 180);
const TIER_IDEAL = [0, 1, 2].map((t) => { const f = tierFinal(t); return idealOf(f.reach, f.seats, TIER_PHI[t]); });
/** 一瓣按布上的位置切成 台面 · 端面 · 台底 三段（各自的折线） */
function lobeParts(fr, N = 60) {
  const seg = (s0, s1) => Array.from({ length: N + 1 }, (_, k) => fr.at(lerp(s0, s1, k / N)));
  return { top: seg(0, fr.R1), end: seg(fr.R1, fr.total - fr.R1), bottom: seg(fr.total - fr.R1, fr.total) };
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

// ───────────────────────────────────────────────────────────── 符号
/** 一对点：locked = 实心点 + 实线（扣上），否则空心点 + 虚线（还没扣）。横放，x 起点、w 间距 */
function keyIcon(x, y, w, locked, o = {}) {
  const v = o.vertical;
  const x2 = v ? x : x + w, y2 = v ? y + w : y;
  return (
    (locked ? L(x, y, x2, y2, { stroke: KEY, w: o.w ?? 2.6, cap: 'round' }) : L(x, y, x2, y2, { stroke: KEY, w: 1, dash: '3 3' })) +
    dotAt(x, y, { r: o.r ?? 3.2, stroke: KEY, fill: locked ? KEY : PAPER }) + dotAt(x2, y2, { r: o.r ?? 3.2, stroke: KEY, fill: locked ? KEY : PAPER })
  );
}
/** 扣上那一下：几道放射的小短线 */
const spark = (x, y, r = 10, angles = [-1.0, -0.35, 0.3]) =>
  angles.map((a) => L(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, x + Math.cos(a) * r, y + Math.sin(a) * r, { stroke: KEY, w: 1.3, cap: 'round' })).join('');
/** 等长记号：线上两道短横 */
const cong = (x, y, vertical = false) =>
  [-2.5, 2.5].map((d) => (vertical ? L(x - 5, y + d, x + 5, y + d, { stroke: INK, w: 1.2 }) : L(x + d, y - 5, x + d, y + 5, { stroke: INK, w: 1.2 }))).join('');
/** 放长 ←→ / 缩短 →← */
const growIcon = (x, y, len, col) => arrow(x, y, x - len / 2, y, { stroke: col, w: 1.2, head: 5 }) + arrow(x, y, x + len / 2, y, { stroke: col, w: 1.2, head: 5 });
const shrinkIcon = (x, y, len, col) => arrow(x - len / 2, y, x - 2.5, y, { stroke: col, w: 1.2, head: 5 }) + arrow(x + len / 2, y, x + 2.5, y, { stroke: col, w: 1.2, head: 5 });
/** 不动：框下的几道斜线 */
const hatch = (x, y, w, k = 4) => Array.from({ length: k }, (_, i) => L(x + (i * w) / (k - 1), y, x + (i * w) / (k - 1) - 7, y + 9, { stroke: INK, w: 1 })).join('');
const tag = (W, H) => T(W - 30, H - 18, '示意 · 尺寸为引擎实测', { size: 10.5, fill: MUTE, anchor: 'end' });
const head = (letter, title) => T(40, 46, `${letter}　${title}`, { size: 22, bold: true });

// ───────────────────────────────────────────────────────────── B 键怎么把布折成台（原理）
function panelB() {
  const K = 500;
  const W = 1500, H = 960;
  const F = R1;
  const LOW = S_STRAIGHT * LOW_FRAC, UP = S_STRAIGHT - LOW;
  const yBase = 850;
  /** 直线版：口宽 m 的一道折（台面 / 台底是两条直线，端面竖着） */
  const fold = (m) => {
    const R = Math.sqrt(Math.max(0, F * F - ((m - H_KEY) / 2) ** 2));
    const yd = LOW, ya = LOW + m, ym = LOW + m / 2;
    const a = [0, ya], b = [R, ym + H_KEY / 2], c = [R, ym - H_KEY / 2], d = [0, yd];
    const seats = SEAT.map((sg) => { const t = Math.min(1, sg / F); return [[lerp(a[0], b[0], t), lerp(a[1], b[1], t)], [lerp(d[0], c[0], t), lerp(d[1], c[1], t)]]; });
    return { m, R, a, b, c, d, top: ya + UP, seats };
  };
  const stages = [
    { x: 150, f: fold(L_LOBE), no: '①', t: '配对' },
    { x: 560, f: fold(L_LOBE * 0.66), no: '②', t: '挤出' },
    { x: 880, f: fold(L_LOBE * 0.34), no: '③', t: '靠拢' },
    { x: 1200, f: fold(H_KEY), no: '④', t: '扣上' },
  ];
  const X = (st, x) => st.x + x * K;
  const Y = (y) => yBase - y * K;
  let g = head('B', '键怎么把布折成台');

  // 跨四步的连线：上端、a、b、c、d 各自去了哪儿
  const link = (pick, o = {}) => P(stages.map((st) => { const q = pick(st.f); return [X(st, q[0]), Y(q[1])]; }), { stroke: o.stroke ?? HAIR, w: o.w ?? 1, dash: o.dash ?? '2 4' });
  g += link((f) => [0, f.top]) + link((f) => f.a) + link((f) => f.b) + link((f) => f.c) + link((f) => f.d);
  g += link(() => [0, 0], { dash: '0' });

  const PICK = 5; // 放大看哪一对
  stages.forEach((st, k) => {
    const f = st.f;
    const px = (q) => [X(st, q[0]), Y(q[1])];
    // 芯：一根随步骤变短的灰条；上一步的长度留一截虚框
    if (k > 0) g += `<rect x="${st.x - 16}" y="${f1(Y(stages[k - 1].f.top))}" width="8" height="${f1((stages[k - 1].f.top - f.top) * K)}" fill="none" stroke="${HAIR}" stroke-width="0.9" stroke-dasharray="3 3"/>`;
    g += `<rect x="${st.x - 16}" y="${f1(Y(f.top))}" width="8" height="${f1(f.top * K)}" fill="${SOFT}" stroke="${INK}" stroke-width="0.9"/>`;
    // 布
    g += P([px([0, f.top]), px(f.a)], { stroke: MUTE, w: 2 });
    g += P([px(f.d), px([0, 0])], { stroke: MUTE, w: 2 });
    // 键：① 弧，②③ 还没扣上的虚线，④ 扣上的实线
    f.seats.forEach(([u, v]) => {
      const [x1, y1] = px(u), [x2, y2] = px(v);
      if (k === 0) { const r = (y2 - y1) / 2; g += `<path d="M${f1(x1 + 5)} ${f1(y1)}A${f1(r)} ${f1(r)} 0 0 1 ${f1(x2 + 5)} ${f1(y2)}" fill="none" stroke="${KEY}" stroke-width="1.2"/>`; }
      else if (k < 3) g += L(x1, y1, x2, y2, { stroke: KEY, w: 1, dash: '3 3' });
      else g += L(x1, y1, x2, y2, { stroke: KEY, w: 2.4, cap: 'round' });
    });
    g += P([px(f.a), px(f.b)], { stroke: GREEN, w: 4, cap: 'butt' });
    g += P([px(f.c), px(f.d)], { stroke: GREEN_L, w: 4, cap: 'butt' });
    g += P([px(f.b), px(f.c)], { stroke: INK, w: 4, cap: 'butt' });
    f.seats.forEach(([u, v]) => { g += dotAt(...px(u), { r: 2.2, stroke: KEY, w: 1.1, fill: k === 3 ? KEY : PAPER }) + dotAt(...px(v), { r: 2.2, stroke: KEY, w: 1.1, fill: k === 3 ? KEY : PAPER }); });
    // 两头：上端会动（空心框 + 箭头），下端不动（实心框 + 斜线）
    if (k > 0) {
      const yPrev = Y(stages[k - 1].f.top);
      g += `<rect x="${st.x - 20}" y="${f1(yPrev - 5)}" width="26" height="10" fill="none" stroke="${MUTE}" stroke-width="1" stroke-dasharray="3 3"/>`;
      g += arrow(st.x + 20, yPrev, st.x + 20, Y(f.top) - 2, { stroke: INK, w: 1.3, head: 7 });
    }
    g += `<rect x="${st.x - 20}" y="${f1(Y(f.top) - 5)}" width="26" height="10" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>`;
    g += `<rect x="${st.x - 20}" y="${f1(Y(0) - 5)}" width="26" height="10" fill="${INK}"/>` + hatch(st.x - 16, Y(0) + 7, 22);
    // 往外挤的箭头
    if (k === 1 || k === 2) g += arrow(px(f.b)[0] + 10, Y((f.b[1] + f.c[1]) / 2), px(f.b)[0] + 38, Y((f.b[1] + f.c[1]) / 2), { stroke: INK, w: 1.3, head: 7 });
    // a b c d
    const lab = (q, ch, dx, dy) => T(px(q)[0] + dx, px(q)[1] + dy, ch, { size: 13, bold: true, anchor: 'middle', halo: true });
    if (k === 0) g += lab(f.a, 'a', -30, 4) + lab(f.b, 'b', -30, 2) + lab(f.c, 'c', -30, 8) + lab(f.d, 'd', -30, 4);
    if (k === 3) g += lab(f.a, 'a', -30, 2) + lab(f.b, 'b', 13, -4) + lab(f.c, 'c', 13, 13) + lab(f.d, 'd', -30, 8);
    // 步名
    g += T(st.x - 20, 112, `${st.no} ${st.t}`, { size: 16, bold: true });
    // 放大看一对点
    if (k >= 1) {
      const [u, v] = f.seats[PICK];
      const [sx, sy1] = px(u), [, sy2] = px(v);
      const r = 46, bx = st.x + 150, by = Y(f.a[1]) - 96 - (k === 1 ? 40 : 0);
      const gap = [0, 58, 40, 24][k];
      g += L(sx, sy1, sx, sy2, { stroke: KEY, w: k === 3 ? 3.4 : 1.8, dash: k === 3 ? undefined : '3 3' });
      g += `<circle cx="${f1(sx)}" cy="${f1(sy1)}" r="7" fill="none" stroke="${INK}" stroke-width="0.9"/>` + `<circle cx="${f1(sx)}" cy="${f1(sy2)}" r="7" fill="none" stroke="${INK}" stroke-width="0.9"/>`;
      g += L(sx + 3, sy1 - 7, bx - 14, by + r - 3, { stroke: INK, w: 0.8 });
      g += `<circle cx="${bx}" cy="${f1(by)}" r="${r}" fill="${PAPER}" stroke="${INK}" stroke-width="1.1"/>`;
      g += L(bx - 34, by - gap / 2, bx + 34, by - gap / 2, { stroke: GREEN, w: 4 }) + L(bx - 34, by + gap / 2, bx + 34, by + gap / 2, { stroke: GREEN_L, w: 4 });
      g += keyIcon(bx, by - gap / 2, gap, k === 3, { vertical: true, r: 4, w: 3.4 });
      if (k < 3) g += arrow(bx - 20, by - gap / 2 + 6, bx - 20, by - 3, { stroke: INK, w: 1.1, head: 5 }) + arrow(bx - 20, by + gap / 2 - 6, bx - 20, by + 3, { stroke: INK, w: 1.1, head: 5 });
      else g += spark(bx + 9, by, 20, [-0.7, 0, 0.7]);
    }
  });
  // ①：最大一对的半跨 —— ④：挑出。两处打同一个等长记号
  {
    const st = stages[0], f = st.f;
    const ymid = Y((f.a[1] + f.d[1]) / 2);
    const r = ((f.seats[0][0][1] - f.seats[0][1][1]) / 2) * K;
    g += L(st.x + 5, ymid, st.x + 5 + r, ymid, { stroke: INK, w: 1.4 }) + L(st.x + 5 + r, ymid - 5, st.x + 5 + r, ymid + 5, { stroke: INK, w: 1.4 });
    g += `<rect x="${f1(st.x + 5 + r / 2 - 8)}" y="${f1(ymid - 7)}" width="16" height="14" fill="${PAPER}"/>` + cong(st.x + 5 + r / 2, ymid);
    const s4 = stages[3], f4 = s4.f;
    const x1 = X(s4, f4.a[0]), x2 = X(s4, f4.b[0]), yy = Y(f4.d[1]) + 26;
    g += L(x1, yy, x2, yy, { stroke: INK, w: 1.4 }) + L(x1, yy - 5, x1, yy + 5, { stroke: INK, w: 1.4 }) + L(x2, yy - 5, x2, yy + 5, { stroke: INK, w: 1.4 });
    g += `<rect x="${f1((x1 + x2) / 2 - 8)}" y="${f1(yy - 7)}" width="16" height="14" fill="${PAPER}"/>` + cong((x1 + x2) / 2, yy);
    g += T((x1 + x2) / 2, yy + 22, `${f2(read.reach)} m`, { size: 12.5, anchor: 'middle' });
    g += T(x2 + 24, Y((f4.b[1] + f4.c[1]) / 2) + 5, `${f1(H_KEY * 100)} cm`, { size: 12.5 });
    // 上端一共下降多少
    g += T(s4.x + 30, (Y(stages[0].f.top) + Y(f4.top)) / 2, '', {});
  }
  // 图例：只用符号
  {
    const y = H - 44;
    let x = 40;
    const item = (draw, w, label) => { g += draw(x, y); g += T(x + w + 8, y + 4, label, { size: 12 }); x += w + 8 + label.length * 13 + 34; };
    item((x0, y0) => `<path d="M${x0} ${y0 + 6}A14 14 0 0 1 ${x0 + 28} ${y0 + 6}" fill="none" stroke="${KEY}" stroke-width="1.2"/>` + dotAt(x0, y0 + 6, { r: 3, stroke: KEY }) + dotAt(x0 + 28, y0 + 6, { r: 3, stroke: KEY }), 28, '配成一对');
    item((x0, y0) => keyIcon(x0, y0, 28, false), 28, '还没扣');
    item((x0, y0) => keyIcon(x0, y0, 28, true), 28, '扣上');
    item((x0, y0) => `<rect x="${x0}" y="${y0 - 5}" width="26" height="10" fill="${PAPER}" stroke="${INK}" stroke-width="1.4"/>`, 26, '会动的一端');
    item((x0, y0) => `<rect x="${x0}" y="${y0 - 5}" width="26" height="10" fill="${INK}"/>` + hatch(x0 + 4, y0 + 7, 22), 26, '不动的一端');
    item((x0, y0) => `<rect x="${x0 + 9}" y="${y0 - 9}" width="8" height="18" fill="${SOFT}" stroke="${INK}" stroke-width="0.9"/>`, 26, '芯');
    item((x0, y0) => L(x0, y0, x0 + 9, y0, { stroke: GREEN, w: 4 }) + L(x0 + 9, y0, x0 + 18, y0, { stroke: INK, w: 4 }) + L(x0 + 18, y0, x0 + 27, y0, { stroke: GREEN_L, w: 4 }), 27, '台面 · 端面 · 台底');
    item((x0, y0) => L(x0, y0, x0 + 26, y0, { stroke: INK, w: 1.4 }) + cong(x0 + 13, y0), 26, '等长');
  }
  g += tag(W, H);
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

// ───────────────────────────────────────────────────────────── A 一条带从筒到台（叠画）
function panelA() {
  const K = 560;
  const W = 820, H = 1020;
  const ax = 230;
  const hTop = read.foot + read.hang0 + 0.1;
  const y0 = 110;
  const yOf = (h) => y0 + (hTop - h) * K;
  const toXY = ([x, y]) => [ax + (ST_R + x) * K, yOf(y)];
  let g = head('A', '一条带从筒到台');

  const ss = [0, 0.16, 0.32, 0.48, 0.64, 0.8, 0.92, 1];
  const frames = ss.map(idealFrame);
  const f0 = frames[0], fN = frames[frames.length - 1];
  const yTop0 = yOf(f0.topH), yTop1 = yOf(fN.topH), yFoot = yOf(read.foot);
  const cw = ST_R * K;
  const shade = (k) => { const t = k / (frames.length - 1), c = Math.round(212 - t * 110); return `rgb(${c},${c - 4},${c - 12})`; };
  // 芯轴与芯
  g += L(ax, y0 - 20, ax, yFoot + 40, { stroke: MUTE, w: 0.8, dash: '10 3 2 3' });
  g += `<rect x="${ax - 6}" y="${f1(yTop0)}" width="12" height="${f1(yTop1 - yTop0)}" fill="none" stroke="${HAIR}" stroke-width="1" stroke-dasharray="3 3"/>`;
  g += `<rect x="${ax - 6}" y="${f1(yTop1)}" width="12" height="${f1(yFoot - yTop1)}" fill="${SOFT}" stroke="${INK}" stroke-width="1"/>`;
  // b、c 走过的路（带箭头）；a 沿着芯往下
  for (const key of ['b', 'c']) {
    const path = [];
    for (let k = 0; k <= 80; k++) path.push(toXY(idealFrame(k / 80)[key]));
    g += P(path.slice(0, -3), { stroke: INK, w: 0.9, dash: '1 3.4' });
    const e = path[path.length - 4], q = path[path.length - 9];
    g += arrow(q[0], q[1], e[0], e[1], { stroke: INK, w: 1, head: 6 });
  }
  // 八个时刻
  frames.forEach((fr, k) => {
    if (k === frames.length - 1) return;
    const col = shade(k), t = k / (frames.length - 1);
    g += bandOf(fr, toXY, { stroke: col, w: 1.2 + t * 0.5, keys: k === frames.length - 2 ? 'open' : 'none' });
    g += `<rect x="${ax - 12}" y="${f1(yOf(fr.topH) - 3)}" width="${f1(cw + 16)}" height="7" fill="${PAPER}" stroke="${col}" stroke-width="1.2"/>`;
    for (const key of ['a', 'b', 'c']) g += dotAt(...toXY(fr[key]), { r: 2.3, stroke: col });
  });
  // 成形后：分段上色
  const parts = lobeParts(fN);
  g += fN.seats.map(([u, v]) => L(...toXY(u), ...toXY(v), { stroke: KEY, w: 2, cap: 'round' })).join('');
  g += P([toXY([0, fN.topH]), toXY(fN.a)], { stroke: INK, w: 2.2 }) + P([toXY(fN.d), toXY([0, read.foot])], { stroke: INK, w: 2.2 });
  g += P(parts.top.map(toXY), { stroke: GREEN, w: 3.4, cap: 'butt' }) + P(parts.bottom.map(toXY), { stroke: GREEN_L, w: 3.4, cap: 'butt' }) + P(parts.end.map(toXY), { stroke: INK, w: 3.4, cap: 'butt' });
  for (const [key, dx, dy] of [['a', -14, -6], ['b', 13, -6], ['c', 13, 16], ['d', -14, 16]]) {
    g += dotAt(...toXY(fN[key]), { r: 3.2, fill: INK });
    g += T(toXY(fN[key])[0] + dx, toXY(fN[key])[1] + dy, key, { size: 13.5, bold: true, anchor: 'middle', halo: true });
  }
  for (const key of ['a', 'b', 'c']) g += T(toXY(f0[key])[0] + 14, toXY(f0[key])[1] + 4, key, { size: 12.5, fill: MUTE, bold: true });
  g += spark(toXY(fN.b)[0] + 8, (toXY(fN.b)[1] + toXY(fN.c)[1]) / 2, 20, [-0.7, 0, 0.7]);
  // 两个夹环：上面的会动（空心 → 实心），下面的不动
  g += `<rect x="${ax - 12}" y="${f1(yTop1 - 3)}" width="${f1(cw + 16)}" height="7" fill="${INK}"/>`;
  g += `<rect x="${ax - 12}" y="${f1(yFoot - 4)}" width="${f1(cw + 16)}" height="7" fill="${INK}"/>` + hatch(ax - 6, yFoot + 6, cw + 4, 6);
  g += T(ax + cw + 14, yTop0 + 4, '上夹环', { size: 12.5, fill: MUTE });
  g += T(ax + cw + 14, yFoot + 5, '下夹环', { size: 12.5 });
  g += T(ax + 6, y0 - 26, '芯', { size: 12.5, fill: MUTE });
  // 尺寸：只留数字
  g += arrow(ax - 38, yTop0, ax - 38, yTop1 - 3, { stroke: INK, w: 1.4, head: 8 });
  g += `<text transform="translate(${ax - 46} ${f1((yTop0 + yTop1) / 2)}) rotate(-90)" font-size="13" fill="${INK}" text-anchor="middle" ${FONT}>${f2(read.topDrop)} m</text>`;
  g += dimV(ax - 96, yTop0, yFoot, `${f2(read.hang0)} m`);
  g += dimV(ax - 38, yTop1 + 6, yFoot, `${f2(read.hang1)} m`, { stroke: INK, fill: INK });
  const xa = toXY(fN.a)[0], xb = toXY(fN.b)[0], yd = toXY(fN.d)[1];
  g += dimH(xa, xb, yd + 30, `${f2(read.reach)} m`, { stroke: INK, fill: INK, below: true });
  g += T(xb + 34, (toXY(fN.b)[1] + toXY(fN.c)[1]) / 2 + 4, `${f1(H_KEY * 100)} cm`, { size: 12.5 });
  // 图例：先后（由浅到深）与一对点的两种状态
  {
    const y = H - 44;
    frames.forEach((_, k) => (g += L(40 + k * 9, y - 8, 40 + k * 9, y + 8, { stroke: k === frames.length - 1 ? INK : shade(k), w: 2 })));
    g += arrow(40, y + 17, 40 + 7 * 9, y + 17, { stroke: MUTE, w: 1, head: 5 });
    g += T(124, y + 4, '先 → 后', { size: 12 });
    g += keyIcon(220, y, 28, false) + T(258, y + 4, '还没扣', { size: 12 });
    g += keyIcon(338, y, 28, true) + T(376, y + 4, '扣上', { size: 12 });
    g += L(440, y, 470, y, { stroke: INK, w: 0.9, dash: '1 3.4' }) + T(478, y + 4, '布上一点走过的路', { size: 12 });
  }
  g += tag(W, H);
  return { W, H, svg: sheet(W, H, g) };
}

// ───────────────────────────────────────────────────────────── D 从天花下到平台（六个时刻）
function panelD() {
  const K = 150;
  const xL = 150, dx = 212;
  const xs = Array.from({ length: 6 }, (_, i) => xL + 100 + i * dx);
  const xR = xs[5] + 150;
  const W = xR + 110;
  const yCeil = 150;
  const yOf = (h) => yCeil + (CEIL - h) * K;
  const yFloor = yOf(0);
  const footDev = -film[0].y[n - 1] * 100;
  const dropTop = (d) => mOf(grid.ROOM.FLOOR_Y - unitTopY(rig, d));
  const dropFoot = (d) => mOf(grid.ROOM.FLOOR_Y - unitFootY(rig, footDev, d));
  const D_MID = 0.55, S4 = 0.42, S5 = 0.8;
  const fr3 = idealFrame(0), fr4 = idealFrame(S4), fr5 = idealFrame(S5), fr6 = idealFrame(1);
  const M = [
    { top: dropTop(0), foot: dropFoot(0), no: '①', t: '收着' },
    { top: dropTop(D_MID), foot: dropFoot(D_MID), no: '②', t: '降下' },
    { top: fr3.topH, foot: read.foot, no: '③', t: '成筒' },
    { top: fr4.topH, foot: read.foot, no: '④', t: '芯缩短' },
    { top: fr5.topH, foot: read.foot, no: '⑤', t: '靠拢' },
    { top: fr6.topH, foot: read.foot, no: '⑥', t: '扣上' },
  ];
  let g = head('D', '从天花下到平台');

  // 天花、地面、台面高度
  g += L(xL, yCeil, xR, yCeil, { stroke: INK, w: 2 });
  for (let x = xL; x < xR; x += 12) g += L(x, yCeil, x + 7, yCeil - 8, { stroke: INK, w: 0.7 });
  g += L(xL, yFloor, xR, yFloor, { stroke: INK, w: 2 });
  g += T(xL - 10, yCeil + 4, `${f2(CEIL)} m`, { size: 12, anchor: 'end' });
  g += T(xL - 10, yFloor + 4, '0', { size: 12, anchor: 'end' });
  g += L(xL, yOf(read.top), xR, yOf(read.top), { stroke: GREEN, w: 0.9, dash: '5 4' });
  g += T(xL - 10, yOf(read.top) + 4, `${f2(read.top)} m`, { size: 12, anchor: 'end', fill: GREEN });
  // 两条夹环线
  g += P(M.map((m, i) => [xs[i], yOf(m.top)]).concat([[xR, yOf(M[5].top)]]), { stroke: HAIR, w: 1 });
  g += P(M.map((m, i) => [xs[i], yOf(m.foot)]).concat([[xR, yOf(M[5].foot)]]), { stroke: HAIR, w: 1 });
  g += T(xR + 8, yOf(M[5].top) + 4, '上夹环', { size: 12.5 });
  g += T(xR + 8, yOf(M[5].foot) + 4, '下夹环', { size: 12.5 });

  const hw = ST_R * K;
  M.forEach((m, i) => {
    const cx = xs[i], yT = yOf(m.top), yF = yOf(m.foot);
    // 上一刻两个夹环在哪儿（淡虚框）→ 这一刻（箭头）；不动的那个打斜线
    if (i > 0) {
      const pT = yOf(M[i - 1].top), pF = yOf(M[i - 1].foot);
      g += `<rect x="${f1(cx - hw - 3)}" y="${f1(pT - 2)}" width="${f1(2 * hw + 6)}" height="5" fill="none" stroke="${MUTE}" stroke-width="0.9" stroke-dasharray="3 2.5"/>`;
      const ext = hw + (i <= 1 ? pleats(m.top, m.foot, 6)[1][0] : [0, 0, fr3.R, fr4.R, 0, 0][i]) * K;
      g += arrow(cx + (i <= 3 ? ext : hw) + 14, pT, cx + (i <= 3 ? ext : hw) + 14, yT - 1, { stroke: INK, w: 1.3, head: 7 });
      if (Math.abs(pF - yF) > 2) {
        g += `<rect x="${f1(cx - hw - 3)}" y="${f1(pF - 3)}" width="${f1(2 * hw + 6)}" height="5" fill="none" stroke="${MUTE}" stroke-width="0.9" stroke-dasharray="3 2.5"/>`;
        g += arrow(cx - ext - 14, pF, cx - ext - 14, yF - 1, { stroke: INK, w: 1.3, head: 7 });
      } else g += hatch(cx - hw + 2, yF + 4, 2 * hw - 2, 5);
    }
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
        if (i === 3 || i === 4) { const yt = yOf(fr.at(fr.total / 2)[1]), xe = cx + side * ((ST_R + fr.R) * K + 6); g += arrow(xe, yt, xe + side * 20, yt, { stroke: INK, w: 1.3, head: 7 }); }
        if (i === 5) g += spark(cx + side * ((ST_R + fr.R) * K + 5), yOf(fr.at(fr.total / 2)[1]), 16, side > 0 ? [-0.7, 0, 0.7] : [Math.PI - 0.7, Math.PI, Math.PI + 0.7]);
      }
    }
    g += `<rect x="${f1(cx - hw - 3)}" y="${f1(yT - 2)}" width="${f1(2 * hw + 6)}" height="5" fill="${INK}"/>`;
    g += `<rect x="${f1(cx - hw - 3)}" y="${f1(yF - 3)}" width="${f1(2 * hw + 6)}" height="5" fill="${INK}"/>`;
    g += T(cx, yCeil - 28, `${m.no} ${m.t}`, { size: 15, bold: true, anchor: 'middle' });
  });
  // 尺寸：只留数字
  g += T(xs[0] - 44, yOf((M[0].top + M[0].foot) / 2) + 4, `${f2(M[0].top - M[0].foot)} m`, { size: 12, fill: MUTE, anchor: 'end' });
  g += dimV(xs[2] - 84, yOf(M[2].top), yOf(M[2].foot), `${f2(read.hang0)} m`);
  g += dimV(xs[5] + 134, yOf(M[5].top), yOf(M[5].foot), `${f2(read.hang1)} m`, { side: 1 });
  g += dimH(xs[5] + hw, xs[5] + (ST_R + fr6.R) * K, yOf(read.top) - 14, `${f2(read.reach)} m`);

  // 下方：谁在动（只用符号）
  const ry = yFloor + 40, rh = 26, gap = 8;
  const xi = (v) => { const i = Math.floor(v), f = v - i; return i >= 5 ? xs[5] : lerp(xs[i], xs[i + 1], f); };
  const rows = [
    { name: '吊杆', sample: (x, y) => `<rect x="${x - 4}" y="${y - 10}" width="8" height="20" fill="${PAPER}" stroke="${INK}" stroke-width="0.9"/>`, bars: [[0, 5, 'grow']] },
    { name: '芯', sample: (x, y) => L(x, y - 10, x, y + 10, { stroke: INK, w: 2.2 }), bars: [[0, 2, 'grow'], [2, 5, 'shrink']] },
    { name: '键', sample: (x, y) => keyIcon(x, y - 7, 14, true, { vertical: true, r: 2.6, w: 2 }), bars: [[0, 4.72, 'open'], [4.72, 5, 'locked']] },
  ];
  rows.forEach((r, k) => {
    const y = ry + k * (rh + gap), yc = y + rh / 2;
    g += r.sample(xL + 22, yc) + T(xL - 10, yc + 4, r.name, { size: 12.5, anchor: 'end', bold: true });
    for (const [a, b, kind] of r.bars) {
      const x1 = xi(a) + (a > 0 ? 3 : -30), x2 = xi(b) + (b >= 5 ? 30 : -3), xc = (x1 + x2) / 2;
      const solid = kind === 'shrink' || kind === 'locked', col = kind === 'locked' ? KEY : kind === 'open' ? MUTE : INK;
      g += `<rect x="${f1(x1)}" y="${y}" width="${f1(x2 - x1)}" height="${rh}" fill="${solid ? col : PAPER}" stroke="${col}" stroke-width="1" ${kind === 'open' ? 'stroke-dasharray="4 3"' : ''}/>`;
      if (kind === 'grow') for (const xx of a === 0 && b === 5 ? [xi(1), xi(2.5), xi(4)] : [xc]) g += growIcon(xx, yc, 44, INK);
      if (kind === 'shrink') for (const xx of [xi(3), xi(4)]) g += shrinkIcon(xx, yc, 44, PAPER);
      if (kind === 'open') for (const xx of [xi(1), xi(2.5), xi(4)]) g += keyIcon(xx - 12, yc, 24, false, { r: 2.8 });
      if (kind === 'locked') g += L(xc - 11, yc, xc + 11, yc, { stroke: PAPER, w: 2.4, cap: 'round' }) + dotAt(xc - 11, yc, { r: 3, stroke: PAPER, fill: PAPER }) + dotAt(xc + 11, yc, { r: 3, stroke: PAPER, fill: PAPER });
    }
  });
  for (const x of xs) g += L(x, yFloor, x, ry - 4, { stroke: HAIR, w: 0.8, dash: '2 4' });
  // 图例
  {
    const y = ry + 3 * (rh + gap) + 26;
    g += growIcon(xL + 22, y, 40, INK) + T(xL + 50, y + 4, '放长', { size: 12 });
    g += shrinkIcon(xL + 132, y, 40, INK) + T(xL + 160, y + 4, '缩短', { size: 12 });
    g += keyIcon(xL + 220, y, 26, false) + T(xL + 256, y + 4, '还没扣', { size: 12 });
    g += keyIcon(xL + 326, y, 26, true) + T(xL + 362, y + 4, '扣上', { size: 12 });
    g += `<rect x="${xL + 420}" y="${y - 3}" width="30" height="5" fill="none" stroke="${MUTE}" stroke-width="0.9" stroke-dasharray="3 2.5"/>` + arrow(xL + 458, y - 8, xL + 458, y + 8, { stroke: INK, w: 1.3, head: 6 }) + T(xL + 470, y + 4, '从上一刻的位置动到这里', { size: 12 });
    g += `<rect x="${xL + 660}" y="${y - 3}" width="30" height="5" fill="${INK}"/>` + hatch(xL + 664, y + 4, 24, 4) + T(xL + 700, y + 4, '不动', { size: 12 });
  }
  const H = ry + 3 * (rh + gap) + 60;
  g += tag(W, H);
  return { W, H, svg: null, body: g };
}

// ───────────────────────────────────────────────────────────── E 从左到右十个时刻（上排平面，下排同一刻的剖面）
// 只用正投影：上排是从上往下看的平面（二十条带、键的位置、外轮廓由圆变方），下排是沿对角线的剖面，上下同一比例、左右对位。
// 平面转了 45°，让四个角正对左右上下——剖面切的就是左右那条对角线，所以上下两排的外缘落在同一根竖线上。
function panelE() {
  const N = 10;
  const cellW = 200, x0 = 130;
  const W = x0 + N * cellW + 40;
  const K = 180;
  const COUNT = sq.SQUARE.COUNT, ORDER = sq.buildSquareOrder(COUNT);
  const HWID = mOf(sq.SQUARE.DEPTH * rig.s) / 2;
  const footDev = -film[0].y[n - 1] * 100;
  const dropTop = (d) => mOf(grid.ROOM.FLOOR_Y - unitTopY(rig, d));
  const dropFoot = (d) => mOf(grid.ROOM.FLOOR_Y - unitFootY(rig, footDev, d));
  /** 十个时刻：前三个落下（程度 d），后七个成形（进度 s） */
  const FR = [{ d: 0 }, { d: 0.4 }, { d: 0.75 }, { s: 0 }, { s: 0.2 }, { s: 0.4 }, { s: 0.6 }, { s: 0.8 }, { s: 0.93 }, { s: 1 }];
  const GROUPS = [['①', '收着', 0, 0], ['②', '降下', 1, 2], ['③', '成筒', 3, 3], ['④', '芯缩短', 4, 6], ['⑤', '靠拢', 7, 8], ['⑥', '扣上', 9, 9]];
  const stateOf = (f) => {
    if (f.d != null) {
      const top = dropTop(f.d), foot = dropFoot(f.d), pl = pleats(top, foot, 6);
      return { top, foot, pl, reach: [pl[1][0], pl[1][0], pl[1][0]], locked: false };
    }
    const frs = TIER_IDEAL.map((mk) => mk(f.s));
    return { top: frs[0].topH, foot: read.foot, frs, reach: frs.map((fr) => fr.R), locked: frs[2].locked };
  };
  const TURN = Math.PI / 4; // 平面转 45°：角朝左右上下
  const CLOTH_FILL = '#efebe2', TOP_FILL = '#cfe6da';
  let g = head('E', '从左到右：一台单元成形');
  const rMax = (ST_R + R1) * K;
  const yPlan = 100 + rMax + 8; // 平面那排的圆心
  const yBase = Math.round(yPlan + rMax + 70 + read.hang0 * K); // 剖面那排：下夹环落在这条线上
  g += L(x0 - 10, yBase + 3, x0 + N * cellW + 10, yBase + 3, { stroke: HAIR, w: 1 });
  g += T(x0 - 22, yPlan + 4, '平面', { size: 12.5, anchor: 'end', fill: MUTE });
  g += T(x0 - 22, yBase - 60, '剖面', { size: 12.5, anchor: 'end', fill: MUTE });
  FR.forEach((f, i) => {
    const cx = x0 + i * cellW + cellW / 2;
    const st = stateOf(f);
    const fill = st.locked ? TOP_FILL : CLOTH_FILL;
    // ── 平面
    const pt = (r, th, t = 0) => [cx + (r * Math.cos(th - TURN) - t * Math.sin(th - TURN)) * K, yPlan + (r * Math.sin(th - TURN) + t * Math.cos(th - TURN)) * K];
    const rOf = (j) => ST_R + st.reach[ORDER[j]];
    // 带子的端头顺着外轮廓斜切：两个角的半径按相邻两条带之间的连线取，外轮廓才是一条顺的线
    const dTh = (2 * Math.PI) / COUNT;
    const tipOf = (j) => { const r = rOf(j), dl = HWID / r, rp = lerp(r, rOf((j + 1) % COUNT), dl / dTh), rm = lerp(r, rOf((j + COUNT - 1) % COUNT), dl / dTh), th = sq.squareAngle(j, COUNT); return [pt(rm, th, -HWID), pt(r, th), pt(rp, th, HWID)]; };
    const rim = [];
    for (let j = 0; j < COUNT; j++) rim.push(...tipOf(j));
    g += P(rim, { close: true, fill, stroke: INK, w: 1.4 }); // 外轮廓：布盖住的范围
    for (let j = 0; j < COUNT; j++) { // 二十条带：从芯到外缘的窄条
      const th = sq.squareAngle(j, COUNT);
      g += P([pt(ST_R, th, -HWID), ...tipOf(j), pt(ST_R, th, HWID)], { close: true, fill: PAPER, stroke: INK, w: 0.5 });
      if (st.frs && f.s >= 0.6) for (const [u] of st.frs[ORDER[j]].seats) { const q = pt(ST_R + u[0], th); g += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="1.5" fill="${st.locked ? KEY : PAPER}" stroke="${KEY}" stroke-width="0.7"/>`; }
    }
    if (f.d != null) g += `<circle cx="${f1(cx)}" cy="${yPlan}" r="${f1((ST_R + st.reach[0] / 2) * K)}" fill="none" stroke="${INK}" stroke-width="0.5" stroke-dasharray="2 2.5"/>`; // 褶：中间一道折线
    g += `<circle cx="${f1(cx)}" cy="${yPlan}" r="${f1(ST_R * K)}" fill="${PAPER}" stroke="${INK}" stroke-width="1.6"/>`; // 夹环
    g += `<circle cx="${f1(cx)}" cy="${yPlan}" r="${f1(0.026 * K)}" fill="${INK}"/>`; // 吊杆
    g += L(cx - rMax - 8, yPlan, cx + rMax + 8, yPlan, { stroke: MUTE, w: 0.6, dash: '8 3 2 3' }); // 剖切线
    // ── 上下对位：外缘与芯轴
    const ext = (ST_R + st.reach[2]) * K;
    const yOf = (h) => yBase - (h - st.foot) * K;
    for (const side of [1, -1]) g += L(cx + side * ext, yPlan, cx + side * ext, yBase - 2, { stroke: HAIR, w: 0.8, dash: '2 4' });
    // ── 剖面
    const hw = ST_R * K;
    g += L(cx, yOf(st.top), cx, yBase, { stroke: INK, w: 2 });
    for (const side of [1, -1]) {
      const toXY = ([x, y]) => [cx + side * (ST_R + x) * K, yOf(y)];
      if (f.d != null) g += P(st.pl.map(toXY), { stroke: INK, w: 1.3 });
      else {
        const fr = st.frs[2];
        if (fr.locked) { const pr = lobeParts(fr, 30); g += `<path d="${[...pr.top, ...pr.end, ...pr.bottom].map((q, j) => `${j ? 'L' : 'M'}${f1(toXY(q)[0])} ${f1(toXY(q)[1])}`).join('')}Z" fill="${TOP_FILL}"/>`; }
        g += bandOf(fr, toXY, { w: 1.5, keys: fr.locked ? 'locked' : f.s >= 0.6 ? 'open' : 'none', keyW: 1.5 });
        if (fr.locked) g += spark(cx + side * ((ST_R + fr.R) * K + 5), yOf(fr.at(fr.total / 2)[1]), 14, side > 0 ? [-0.7, 0, 0.7] : [Math.PI - 0.7, Math.PI, Math.PI + 0.7]);
      }
    }
    g += `<rect x="${f1(cx - hw - 3)}" y="${f1(yOf(st.top) - 2)}" width="${f1(2 * hw + 6)}" height="5" fill="${INK}"/>`;
    g += `<rect x="${f1(cx - hw - 3)}" y="${f1(yBase - 3)}" width="${f1(2 * hw + 6)}" height="5" fill="${INK}"/>`;
    if (f.s != null) g += hatch(cx - hw + 2, yBase + 5, 2 * hw - 2, 5);
  });
  // 步名：一个括号管几个时刻
  const yG = yBase + 44;
  for (const [no, name, a, b] of GROUPS) {
    const x1 = x0 + a * cellW + 14, x2 = x0 + (b + 1) * cellW - 14;
    g += P([[x1, yG - 6], [x1, yG], [x2, yG], [x2, yG - 6]], { stroke: INK, w: 1.1, cap: 'butt' });
    g += T((x1 + x2) / 2, yG + 23, `${no} ${name}`, { size: 14.5, bold: true, anchor: 'middle' });
  }
  const H = Math.ceil(yG + 78);
  {
    const y = H - 24;
    g += keyIcon(40, y, 26, false) + T(76, y + 4, '还没扣', { size: 12 }) + keyIcon(146, y, 26, true) + T(182, y + 4, '扣上', { size: 12 });
    g += L(240, y, 280, y, { stroke: MUTE, w: 0.6, dash: '8 3 2 3' }) + T(288, y + 4, '剖面切在这条线上', { size: 12 });
    g += L(430, y - 8, 430, y + 8, { stroke: HAIR, w: 0.8, dash: '2 4' }) + T(440, y + 4, '上下对位', { size: 12 });
  }
  g += tag(W, H);
  return { W, H, svg: sheet(W, H, g) };
}

const A = panelA();
const B = panelB();
const D0 = panelD();
const D = { W: D0.W, H: D0.H, svg: sheet(D0.W, D0.H, D0.body) };
const E = panelE();
const files = [['forming-a-strobe', A], ['forming-b-unrolled', B], ['forming-d-timeline', D], ['forming-e-sequence', E]];
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
