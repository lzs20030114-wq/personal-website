// 项目二 · 一台单元的成形过程：三张小样（2026-11-26，作者「外面那个布条落下来，然后挤压，挤出成型，形成平台。这个过程给它可视化出来」
// →「可以这样画，风格参照之前定下来的黑白为主、带色彩点缀，先出一些小样」）。
//   A  成形过程叠在一张剖面里：同一条带十个时刻叠画（由浅到深），几个节点走过的路画成细点线
//   B  一条带摊平，和它折成的台：左边 168 节按最后去哪儿分段、十颗键画成连两节的弧；右边是同一比例的成形剖面
//   D  五个时刻挂在同一条天花线下：横轴 = 过程，纵轴 = 离地高度，上下夹环的高度连成线
// 画的是 Lab 2-15 那台方台的角档（挑出最远的那四条带）。带子的形、键扣上的时刻、芯长全部现跑站上同一份引擎
// （createSkinUnit + advance + renderSmooth，键谱 = cohabit-solid 的 UNIT_TIERS[2]），换成米的那条链与台架相同（rigFor）。
// 落下那一段（收在天花下 → 直带子）引擎没算，是台架的几何演示值（HOIST / unitTopY / unitFootY），图里用虚线。
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
  `<text x="${f1(x)}" y="${f1(y)}" font-size="${o.size ?? 13}" fill="${o.fill ?? INK}" ${o.anchor ? `text-anchor="${o.anchor}"` : ''} ${o.bold ? 'font-weight="700"' : ''} ${FONT}>${esc(s)}</text>`;
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
    T((x1 + x2) / 2, y + (o.below ? 16 : -7), label, { size: o.size ?? 12, fill: o.fill ?? c, anchor: 'middle' })
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

// ───────────────────────────────────────────────────────────── 画法件
/** 一帧剖面在画面里的点：cx = 芯轴的屏幕 x，yOf = 离地高度 → 屏幕 y，side = ±1（右 / 左半） */
function pts(f, cx, K, yOf, side = 1, originY = rig.y) {
  const out = [];
  for (let i = 0; i < n; i++) out.push([cx + side * (ST_R + PX(f.x[i])) * K, yOf(heightAt(f.y[i], originY))]);
  return out;
}
/** 成形态按分段上色 */
function styledBand(p, scaleW = 1) {
  let g = '';
  for (const s of SEGS) {
    const st = SEG_STYLE[s.key];
    g += P(p.slice(s.a, s.b + 1), { stroke: st.stroke, w: st.w * scaleW, dash: st.dash, cap: s.key === 'slack' ? 'round' : 'butt' });
  }
  return g;
}
function keysOf(p, w = 1.6) {
  return bonds.map((b) => L(p[b.i][0], p[b.i][1], p[b.j][0], p[b.j][1], { stroke: KEY, w, cap: 'round' })).join('');
}

// ───────────────────────────────────────────────────────────── A 成形过程叠在一张剖面里
function panelA() {
  const K = 560;
  const W = 900, H = 1040;
  const ax = 200; // 芯轴
  const hTop = heightAt(film[0].top) + 0.1;
  const y0 = 150;
  const yOf = (h) => y0 + (hTop - h) * K;
  let g = '';
  g += T(40, 46, 'A　成形过程叠在一张剖面里', { size: 22, bold: true });
  g += T(40, 72, '一条带（方台的角档，沿对角线剖开的右半边），四个时刻叠在一张图里，由浅到深。细点线 = 布上 a b c d 四个点走过的路。', { size: 12.5, fill: MUTE });
  g += T(40, 91, '带子的形是引擎现跑的。下夹环钉着不动，上夹环随芯缩短往下走：a、d 贴着芯往下滑，b、c 被挤到外面去。', { size: 12.5, fill: MUTE });

  const S3 = 330;
  const moments = [
    { s: -1, c: '#cdc6b8', w: 1.3 },
    { s: S3, c: '#a8a195', w: 1.4 },
    { s: LOCK - 4, c: '#7d776c', w: 1.5 },
  ];
  const yTop0 = yOf(heightAt(film[0].top)), yTop1 = yOf(heightAt(fin.top)), yFoot = yOf(heightAt(fin.y[n - 1]));
  const chh = PX(CLAMP_N * SKIN.SEG) * K;
  const cw = ST_R * K + 5;
  // 芯轴与芯
  g += L(ax, y0 - 26, ax, yFoot + 46, { stroke: MUTE, w: 0.8, dash: '10 3 2 3' });
  g += `<rect x="${ax - 7}" y="${f1(yTop0)}" width="14" height="${f1(yTop1 - yTop0)}" fill="none" stroke="${HAIR}" stroke-width="1" stroke-dasharray="3 3"/>`;
  g += `<rect x="${ax - 7}" y="${f1(yTop1)}" width="14" height="${f1(yFoot - yTop1)}" fill="${SOFT}" stroke="${INK}" stroke-width="1"/>`;
  // 四个时刻
  const frameOf = (s) => (s < 0 ? hang : film[s]);
  for (const m of moments) {
    g += P(pts(frameOf(m.s), ax, K, yOf), { stroke: m.c, w: m.w });
    const yt = yOf(heightAt(frameOf(m.s).top));
    g += `<rect x="${ax - 12}" y="${f1(yt - 2)}" width="${f1(cw + 12)}" height="${f1(chh)}" fill="none" stroke="${m.c}" stroke-width="1.1"/>`;
  }
  // 四个点走过的路
  const marks = [[iOuter, 'a'], [panel[0], 'b'], [panel[1], 'c'], [jOuter, 'd']];
  for (const [i] of marks) {
    const path = [[ax + (ST_R + PX(hang.x[i])) * K, yOf(heightAt(hang.y[i]))]];
    for (let s = S0; s <= END; s += 3) path.push([ax + (ST_R + PX(film[s].x[i])) * K, yOf(heightAt(film[s].y[i]))]);
    g += P(path, { stroke: INK, w: 0.9, dash: '1 3.4' });
  }
  const pf = pts(fin, ax, K, yOf);
  g += keysOf(pf, 2);
  g += P(pf, { stroke: INK, w: 2.6 });
  for (const m of [...moments, { s: END }]) {
    const p = pts(frameOf(m.s), ax, K, yOf);
    const last = m.s === END;
    for (const [i, ch] of marks) {
      g += `<circle cx="${f1(p[i][0])}" cy="${f1(p[i][1])}" r="${last ? 3.4 : 2.6}" fill="${last ? INK : PAPER}" stroke="${last ? INK : m.c}" stroke-width="1.2"/>`;
      if (m.s < 0) g += T(p[i][0] + (i === iOuter || i === jOuter ? 12 : -12), p[i][1] + 4, ch, { size: 12.5, fill: MUTE, bold: true, anchor: i === iOuter || i === jOuter ? 'start' : 'end' });
      if (last) g += T(p[i][0] + (i === iOuter || i === jOuter ? -13 : 12), p[i][1] + (i === iOuter || i === panel[0] ? -8 : 17), ch, { size: 13.5, bold: true, anchor: 'middle' });
    }
  }
  // 夹环（成形后）
  g += `<rect x="${ax - 12}" y="${f1(yTop1 - 2)}" width="${f1(cw + 12)}" height="${f1(chh)}" fill="${INK}"/>`;
  g += `<rect x="${ax - 12}" y="${f1(yFoot - chh + 2)}" width="${f1(cw + 12)}" height="${f1(chh)}" fill="${INK}"/>`;
  for (let k = 0; k < 6; k++) g += L(ax - 12 + k * 14, yFoot + 4, ax - 20 + k * 14, yFoot + 14, { stroke: INK, w: 1 });
  g += T(ax + cw + 8, yFoot + 14, '下夹环不动', { size: 12 });
  // 左侧尺寸
  g += dimV(ax - 58, yTop0, yTop1, `上夹环下降 ${f2(read.topDrop)} m`, { stroke: INK, fill: INK });
  g += dimV(ax - 96, yTop0, yFoot, `落到工位时两个夹环相距 ${f2(read.hang0)} m`);
  g += dimV(ax - 58, yTop1, yFoot, `成形后 ${f2(read.hang1)} m`, { stroke: INK, fill: INK });
  g += T(ax + 4, y0 - 34, '芯轴', { size: 11.5, fill: MUTE });
  // 右侧说明
  const far = (s) => { const p = pts(frameOf(s), ax, K, yOf); let b = p[0]; for (const q of p) if (q[0] > b[0]) b = q; return b; };
  const notes = [
    { a: far(-1), no: '②', t: '落到工位：布垂着，中段鼓出一点', d: [`布长 ${f2(read.band)} m。带键的那段布比它底下的芯长 5%，`, '所以还没开始缩，中段就鼓着'] },
    { a: far(S3), no: '③', t: '芯缩短，布长不变', d: ['多出来的布没处去，只能往外鼓', '上夹环每降一点，鼓出来的就多一点'] },
    { a: far(LOCK - 4), no: '④', t: '上下两层够得着了：键扣上', d: [`十颗键在同一步扣上（芯缩到原长的 ${Math.round((read.rLock / SKIN.R0) * 100)}%）`, `每颗键把上下两层定在 ${f1(read.thick * 100)} cm 远`, '鼓出来的那一团被拉成平的台'] },
    { a: [pf[panel[0]][0] + 6, (pf[panel[0]][1] + pf[panel[1]][1]) / 2], no: '⑤', t: '平台', d: [`挑出 ${f2(read.reach)} m，台面离地 ${f2(read.top)} m`, '芯再缩一段，台跟着落到位'] },
  ];
  const nx = 590;
  const nys = [yTop0 + 110, yTop0 + 250, yTop0 + 385, yFoot - 60];
  notes.forEach((nt, k) => {
    const ny = nys[k];
    g += P([[nt.a[0] + 5, nt.a[1]], [nx - 34, ny - 5], [nx - 10, ny - 5]], { stroke: MUTE, w: 0.8 });
    g += T(nx, ny, `${nt.no} ${nt.t}`, { size: 14, bold: true });
    nt.d.forEach((d, i) => (g += T(nx, ny + 19 + i * 17, d, { size: 12, fill: MUTE })));
  });
  // 图例
  const ly = H - 46;
  g += L(40, ly, 70, ly, { stroke: KEY, w: 2 }) + T(78, ly + 4, '键（扣上后）', { size: 12 });
  g += L(190, ly, 220, ly, { stroke: INK, w: 0.9, dash: '1 3.4' }) + T(228, ly + 4, '布上一个点走过的路', { size: 12 });
  g += `<rect x="392" y="${ly - 6}" width="22" height="12" fill="${INK}"/>` + T(422, ly + 4, '夹环（空框 = 前几个时刻的位置）', { size: 12 });
  g += T(40, H - 18, '落下那一段（从天花下到工位）引擎没有算，这张不画，见 D。夹环与芯的样子是建模假设。', { size: 11.5, fill: MUTE });
  return { W, H, svg: sheet(W, H, g) };
}

// ───────────────────────────────────────────────────────────── B 一条带摊平，和它折成的台
function panelB() {
  const K = 560;
  const W = 1180, H = 1060;
  const rx = 300; // 摊平的带
  const ax = 760; // 折好的剖面：芯轴
  const segM = PX(SKIN.SEG);
  const footH = heightAt(fin.y[n - 1]);
  const yBase = 930;
  const yOf = (h) => yBase - (h - footH) * K;
  const yFlat = (i) => yBase - (n - 1 - i) * segM * K;
  let g = '';
  g += T(40, 46, 'B　一条带摊平，和它折成的台', { size: 22, bold: true });
  g += T(40, 72, `左：一条带 ${n} 节摊平（一节 ${f1(segM * 100)} cm），按成形后去了哪儿分段。橙色的弧 = 一颗键，连着要扣在一起的两节。右：同一比例的成形剖面。`, { size: 12.5, fill: MUTE });
  g += T(40, 91, '两边底端对齐（下夹环不动）。键谱就是这十道弧：哪两节扣在一起、扣多远，布就折成什么形。', { size: 12.5, fill: MUTE });

  // 摊平的带
  const flat = Array.from({ length: n }, (_, i) => [rx, yFlat(i)]);
  g += styledBand(flat, 1.5);
  // 弧
  bonds.forEach((b) => {
    const r = ((b.j - b.i) / 2) * segM * K;
    g += `<path d="M${rx + 7} ${f1(yFlat(b.i))}A${f1(r)} ${f1(r)} 0 0 1 ${rx + 7} ${f1(yFlat(b.j))}" fill="none" stroke="${KEY}" stroke-width="1.3"/>`;
  });
  const mid = (iOuter + jOuter) / 2;
  const rMax = ((jOuter - iOuter) / 2) * segM * K;
  g += L(rx + 7, yFlat(mid), rx + 7 + rMax, yFlat(mid), { stroke: KEY, w: 0.9, dash: '3 3' });
  g += P([[rx + 7 + rMax, yFlat(mid)], [rx + 7 + rMax + 24, yFlat(mid)]], { stroke: KEY, w: 0.9 });
  g += T(rx + 7 + rMax + 30, yFlat(mid) - 4, `最大的一颗键跨 ${jOuter - iOuter} 节`, { size: 12.5, fill: KEY });
  g += T(rx + 7 + rMax + 30, yFlat(mid) + 14, `半跨 ${(jOuter - iOuter) / 2} 节 = ${f2(read.halfSpan)} m`, { size: 12.5, fill: KEY });
  // 分段标注（左）
  for (const s of SEGS) {
    const ya = yFlat(s.a), yb = yFlat(s.b);
    const bx = rx - 22;
    g += P([[bx + 6, ya + 1.5], [bx, ya + 1.5], [bx, yb - 1.5], [bx + 6, yb - 1.5]], { stroke: MUTE, w: 0.8, cap: 'butt' });
    const cnt = s.b - s.a + (s.key === 'clampB' ? 1 : 0);
    g += T(bx - 8, (ya + yb) / 2 + 4, `${s.label}　${cnt} 节`, { size: 12.5, anchor: 'end', fill: s.key === 'top' || s.key === 'bottom' ? GREEN : INK, bold: s.key === 'top' || s.key === 'bottom' || s.key === 'end' });
  }
  // 四个记号点
  const marks = [[iOuter, 'a'], [panel[0], 'b'], [panel[1], 'c'], [jOuter, 'd']];
  const dot = (x, y, ch, dx, dy) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="3" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>` + T(x + dx, y + dy, ch, { size: 12.5, bold: true, anchor: 'middle' });
  for (const [i, ch] of marks) g += dot(rx, yFlat(i), ch, -11, 4);
  g += dimV(rx - 232, yFlat(0), yFlat(n - 1), `一条带 ${f2(read.band)} m`, { stroke: INK, fill: INK });

  // 折好的剖面
  const pf = pts(fin, ax, K, yOf);
  const yTop1 = yOf(heightAt(fin.top));
  const yTop0 = yFlat(0);
  g += L(ax, yTop0 - 20, ax, yBase + 46, { stroke: MUTE, w: 0.8, dash: '10 3 2 3' });
  g += `<rect x="${ax - 7}" y="${f1(yTop1)}" width="14" height="${f1(yBase - yTop1)}" fill="${SOFT}" stroke="${INK}" stroke-width="1"/>`;
  g += `<rect x="${ax - 7}" y="${f1(yTop0)}" width="14" height="${f1(yTop1 - yTop0)}" fill="none" stroke="${HAIR}" stroke-width="1" stroke-dasharray="3 3"/>`;
  // 落到工位时的直带子（淡）
  g += P(pts(hang, ax, K, yOf), { stroke: HAIR, w: 1.2, dash: '4 3' });
  g += keysOf(pf, 2.2);
  g += styledBand(pf, 1);
  const ch = PX(CLAMP_N * SKIN.SEG) * K;
  const cw = ST_R * K + 5;
  g += `<rect x="${ax - 12}" y="${f1(yTop1 - 2)}" width="${f1(cw + 12)}" height="${f1(ch)}" fill="${INK}"/>`;
  g += `<rect x="${ax - 12}" y="${f1(yBase - ch + 2)}" width="${f1(cw + 12)}" height="${f1(ch)}" fill="${INK}"/>`;
  for (let k = 0; k < 6; k++) g += L(ax - 12 + k * 14, yBase + 4, ax - 20 + k * 14, yBase + 14, { stroke: INK, w: 1 });
  for (const [i, c] of marks) g += dot(pf[i][0], pf[i][1], c, i === iOuter || i === jOuter ? -14 : 13, i === iOuter || i === panel[0] ? -6 : 16);
  // 标注
  const xTip = Math.max(...pf.map((q) => q[0]));
  const x0 = ax + ST_R * K;
  const yTopFace = pf[Math.round((iOuter + panel[0]) / 2)][1];
  const yBotFace = pf[Math.round((panel[1] + jOuter) / 2)][1];
  g += dimH(x0, xTip, yTopFace - 38, `挑出 ${f2(read.reach)} m`, { stroke: INK, fill: INK });
  g += T((x0 + xTip) / 2, yTopFace - 12, '台面', { size: 13, fill: GREEN, bold: true, anchor: 'middle' });
  g += T((x0 + xTip) / 2, yBotFace + 22, '台底', { size: 13, fill: GREEN, bold: true, anchor: 'middle' });
  g += T(xTip + 12, (yTopFace + yBotFace) / 2 - 3, '端面', { size: 13, bold: true });
  g += T(xTip + 12, (yTopFace + yBotFace) / 2 + 14, `厚 ${f1(read.thick * 100)} cm`, { size: 12, fill: MUTE });
  const kb = bonds[Math.floor(bonds.length / 2)];
  g += P([[pf[kb.i][0], (pf[kb.i][1] + pf[kb.j][1]) / 2], [pf[kb.i][0] + 16, yBotFace + 58], [pf[kb.i][0] + 30, yBotFace + 58]], { stroke: KEY, w: 0.8 });
  g += T(pf[kb.i][0] + 36, yBotFace + 62, `键：十颗，每颗 ${f1(PX(kb.rb) * 100)} cm 长`, { size: 12.5, fill: KEY });
  g += T(pf[kb.i][0] + 36, yBotFace + 80, '撑在上下两层布之间', { size: 12.5, fill: KEY });
  g += dimV(ax - 52, yTop0, yTop1, `上夹环下降 ${f2(read.topDrop)} m`, { stroke: INK, fill: INK });
  g += T(ax + ST_R * K + 14, yTop0 + 16, '落到工位时垂着的样子', { size: 11.5, fill: MUTE });
  g += T(ax - 14, yBase + 34, '下夹环不动', { size: 12, anchor: 'end' });
  // 账
  const bx = 40, by = H - 62;
  g += T(bx, by, `布的账：带键的那一段布长 ${f2(read.freeCloth)} m，全程不变。它底下的芯从 ${f2(read.free0)} m 缩到 ${f2(read.free1)} m，多出 ${f2(read.freeCloth - read.free1)} m 的布，折成台面 + 端面 + 台底（a → d 共 ${jOuter - iOuter} 节 = ${f2(PX((jOuter - iOuter) * SKIN.SEG))} m）。`, { size: 12.5 });
  g += T(bx, by + 20, `所以最大那颗键跨多少节，台就挑出多远：${tiers.map((t) => `${t.name}档跨 ${t.span} 节 → ${f2(t.half)} m`).join('，')}。同一台里二十条带分三档，俯视凑成方形。`, { size: 12.5 });
  g += T(bx, by + 44, '夹环夹几节、键做成撑杆，是建模假设。', { size: 11.5, fill: MUTE });
  return { W, H, svg: sheet(W, H, g) };
}

// ───────────────────────────────────────────────────────────── D 五个时刻挂在同一条天花线下
function panelD() {
  const K = 150;
  const W = 1560, H = 1000;
  const yCeil = 190;
  const yOf = (h) => yCeil + (CEIL - h) * K;
  const yFloor = yOf(0);
  const xDrop0 = 210, xDrop1 = 480; // 落下段：程度 0 → 1
  const perStep = 0.78;
  const xStep = (s) => xDrop1 + s * perStep;
  const xEnd = xStep(END);
  const xRight = xEnd + 270;
  let g = '';
  g += T(40, 46, 'D　五个时刻挂在同一条天花线下', { size: 22, bold: true });
  g += T(40, 72, '横轴 = 过程，纵轴 = 离地高度（米）。同一台单元沿对角线剖开，在五个时刻各画一次，上下夹环的高度连成两条线。', { size: 12.5, fill: MUTE });
  g += T(40, 91, '读法：先整个落下来（两条线一起往下），再只有上夹环往下走（下夹环那条线变平），布被挤出去成台。', { size: 12.5, fill: MUTE });

  // 落下段的几何（台架的演示值）
  const footDev = -film[0].y[n - 1] * 100; // 钉住端在装置坐标系里的高度（向下为正）
  const dropTop = (d) => mOf(grid.ROOM.FLOOR_Y - unitTopY(rig, d));
  const dropFoot = (d) => mOf(grid.ROOM.FLOOR_Y - unitFootY(rig, footDev, d));
  const xDrop = (d) => xDrop0 + (xDrop1 - xDrop0) * d;

  // 底：两段的底色与分界
  g += `<rect x="${xDrop0 - 70}" y="${yCeil}" width="${xDrop1 - xDrop0 + 70}" height="${yFloor - yCeil}" fill="${SOFT}" opacity="0.45"/>`;
  g += L(xDrop1, yCeil, xDrop1, yFloor, { stroke: HAIR, w: 1 });
  // 天花与地面
  g += L(xDrop0 - 70, yCeil, xRight, yCeil, { stroke: INK, w: 2 });
  for (let x = xDrop0 - 70; x < xRight; x += 12) g += L(x, yCeil, x + 7, yCeil - 8, { stroke: INK, w: 0.7 });
  g += L(xDrop0 - 70, yFloor, xRight, yFloor, { stroke: INK, w: 2 });
  g += T(xDrop0 - 78, yCeil + 4, `天花 ${f2(CEIL)}`, { size: 12, anchor: 'end' });
  g += T(xDrop0 - 78, yFloor + 4, '地面 0', { size: 12, anchor: 'end' });
  // 高度参照
  for (const [h, label] of [[TABLE_TOP.stand, `站着用的桌高 ${f2(TABLE_TOP.stand)}`], [1.7, '人 1.70']]) {
    g += L(xDrop0 - 70, yOf(h), xRight, yOf(h), { stroke: HAIR, w: 0.9, dash: '5 4' });
    g += T(xDrop0 - 78, yOf(h) + 4, label, { size: 11.5, fill: MUTE, anchor: 'end' });
  }
  // 台面那条绿带（键扣上之后才有）
  const hTopFace = read.top, hBotFace = read.top - read.thick;
  g += `<rect x="${f1(xStep(LOCK))}" y="${f1(yOf(hTopFace))}" width="${f1(xRight - xStep(LOCK))}" height="${f1((hTopFace - hBotFace) * K)}" fill="${GREEN}" opacity="0.28"/>`;
  // 两条夹环线
  const topLine = [], footLine = [];
  for (let s = 0; s <= END; s += 5) { topLine.push([xStep(s), yOf(heightAt(film[s].top))]); footLine.push([xStep(s), yOf(heightAt(film[s].y[n - 1]))]); }
  topLine.push([xRight, topLine[topLine.length - 1][1]]); footLine.push([xRight, footLine[footLine.length - 1][1]]);
  g += P([[xDrop0 - 70, yOf(dropTop(0))], [xDrop(0), yOf(dropTop(0))], [xDrop(1), yOf(dropTop(1))]], { stroke: INK, w: 1.3, dash: '6 4' });
  g += P([[xDrop0 - 70, yOf(dropFoot(0))], [xDrop(0), yOf(dropFoot(0))], [xDrop(1), yOf(dropFoot(1))]], { stroke: INK, w: 1.3, dash: '6 4' });
  g += P(topLine, { stroke: INK, w: 1.3 });
  g += P(footLine, { stroke: INK, w: 1.3 });
  g += T(xRight + 8, topLine[topLine.length - 1][1] + 4, '上夹环', { size: 12.5, bold: true });
  g += T(xRight + 8, footLine[footLine.length - 1][1] + 4, '下夹环', { size: 12.5, bold: true });
  g += T(xRight + 8, yOf(hTopFace) + 2, '台面', { size: 12.5, bold: true, fill: GREEN });
  // 键扣上的那一刻
  g += L(xStep(LOCK), yCeil, xStep(LOCK), yFloor + 96, { stroke: KEY, w: 1.2, dash: '4 3' });

  // 一台单元在某一刻的剖面（两边对称）
  function unitAt(cx, f, originY, o = {}) {
    let u = '';
    const yT = yOf(heightAt(f.top, originY)), yF = yOf(heightAt(f.y[n - 1], originY));
    const hw = ST_R * K;
    u += `<rect x="${f1(cx - 4.5)}" y="${yCeil}" width="9" height="${f1(yT - yCeil)}" fill="${PAPER}" stroke="${INK}" stroke-width="0.9"/>`; // 吊杆
    u += L(cx, yT, cx, yF, { stroke: INK, w: 1.6 }); // 芯
    for (const side of [1, -1]) {
      const p = pts(f, cx, K, yOf, side, originY);
      if (o.keys) u += keysOf(p, 1.3);
      u += P(p, { stroke: INK, w: 1.5 });
    }
    u += `<rect x="${f1(cx - hw - 2)}" y="${f1(yT - 1)}" width="${f1(2 * hw + 4)}" height="5" fill="${INK}"/>`;
    u += `<rect x="${f1(cx - hw - 2)}" y="${f1(yF - 4)}" width="${f1(2 * hw + 4)}" height="5" fill="${INK}"/>`;
    return u;
  }
  // ① 收在天花下：一团压紧的布（演示值），画成两个夹环之间的几道褶
  {
    const cx = xDrop(0);
    const yT = yOf(dropTop(0)), yF = yOf(dropFoot(0));
    const hw = ST_R * K;
    g += `<rect x="${f1(cx - hw)}" y="${f1(yT)}" width="${f1(2 * hw)}" height="${f1(yF - yT)}" fill="${PAPER}" stroke="${INK}" stroke-width="1.2" stroke-dasharray="4 2.5"/>`;
    for (let k = 1; k < 6; k++) g += L(cx - hw, yT + ((yF - yT) * k) / 6, cx + hw, yT + ((yF - yT) * k) / 6, { stroke: INK, w: 0.7 });
    g += `<rect x="${f1(cx - hw - 2)}" y="${f1(yT - 1)}" width="${f1(2 * hw + 4)}" height="5" fill="${INK}"/>`;
    g += `<rect x="${f1(cx - hw - 2)}" y="${f1(yF - 4)}" width="${f1(2 * hw + 4)}" height="5" fill="${INK}"/>`;
  }
  // 落到一半（淡）
  {
    const d = 0.5, cx = xDrop(d);
    const yT = yOf(dropTop(d)), yF = yOf(dropFoot(d));
    const hw = ST_R * K;
    g += `<rect x="${f1(cx - 4.5)}" y="${yCeil}" width="9" height="${f1(yT - yCeil)}" fill="none" stroke="${MUTE}" stroke-width="0.8" stroke-dasharray="3 3"/>`;
    g += `<rect x="${f1(cx - hw)}" y="${f1(yT)}" width="${f1(2 * hw)}" height="${f1(yF - yT)}" fill="none" stroke="${MUTE}" stroke-width="0.9" stroke-dasharray="3 3"/>`;
  }
  const S3 = 330;
  g += unitAt(xStep(0), hang, rig.y);
  g += unitAt(xStep(S3), film[S3], rig.y);
  g += unitAt(xStep(LOCK + 4), film[LOCK + 4], rig.y, { keys: true });
  g += unitAt(xStep(END), fin, rig.y, { keys: true });
  // 人（比例参照）
  {
    const px = xRight - 60, yh = yOf(1.7), s = K;
    const head = 0.115 * s;
    g += `<circle cx="${px}" cy="${f1(yh + head)}" r="${f1(head)}" fill="none" stroke="${MUTE}" stroke-width="1.2"/>`;
    g += P([[px, yh + 2 * head], [px, yOf(0.86)]], { stroke: MUTE, w: 1.2 });
    g += P([[px - 0.2 * s, yOf(1.02)], [px - 0.17 * s, yOf(1.42)], [px + 0.17 * s, yOf(1.42)], [px + 0.2 * s, yOf(1.02)]], { stroke: MUTE, w: 1.2 });
    g += P([[px - 0.1 * s, yFloor], [px, yOf(0.86)], [px + 0.1 * s, yFloor]], { stroke: MUTE, w: 1.2 });
  }
  // 上方：五个时刻的名字
  const caps = [
    [xDrop(0), '①', '收在天花下', '布压成一团'],
    [xStep(0), '②', '落到工位', '布垂着，中段略鼓'],
    [xStep(S3), '③', '芯缩短', '布往外鼓'],
    [xStep(LOCK + 4), '④', '键扣上', '十颗同一步'],
    [xStep(END), '⑤', '平台', `挑出 ${f2(read.reach)} m`],
  ];
  for (const [x, no, t, d] of caps) {
    g += T(x, yCeil - 44, `${no} ${t}`, { size: 14, bold: true, anchor: 'middle' });
    g += T(x, yCeil - 26, d, { size: 12, fill: no === '④' ? KEY : MUTE, anchor: 'middle' });
  }
  // 两段的说明（画在地面线上方）
  g += T((xDrop0 - 70 + xDrop1) / 2, yFloor - 14, '落下：吊杆与芯一起放长', { size: 12.5, anchor: 'middle' });
  g += T((xDrop1 + xStep(LOCK)) / 2, yFloor - 14, '成形：吊杆继续放长，芯缩短同样的量', { size: 12.5, anchor: 'middle' });
  g += T((xDrop0 - 70 + xDrop1) / 2, yFloor - 34, '（引擎没算，台架的几何演示值，虚线）', { size: 11.5, fill: MUTE, anchor: 'middle' });
  g += T((xDrop1 + xStep(LOCK)) / 2, yFloor - 34, `（引擎现跑，横轴按步数，${END} 步）`, { size: 11.5, fill: MUTE, anchor: 'middle' });
  // 夹环相距
  g += dimV(xStep(0) + 96, yOf(heightAt(film[0].top)), yOf(heightAt(film[0].y[n - 1])), `${f2(read.hang0)} m`, { side: 1 });
  g += dimV(xStep(END) + 100, yOf(heightAt(fin.top)), yOf(heightAt(fin.y[n - 1])), `${f2(read.hang1)} m`, { side: 1 });

  // 下方：挑出多远
  const sy0 = yFloor + 96, sh = 64;
  const rMax = read.reach;
  g += L(xDrop0 - 70, sy0, xRight, sy0, { stroke: INK, w: 1 });
  g += T(xDrop0 - 78, sy0 + 4, '挑出 0', { size: 12, anchor: 'end' });
  g += T(xDrop0 - 78, sy0 - sh + 4, `${f2(rMax)} m`, { size: 12, anchor: 'end' });
  g += L(xDrop0 - 70, sy0 - sh, xRight, sy0 - sh, { stroke: HAIR, w: 0.9, dash: '5 4' });
  const curve = [[xStep(0), sy0 - (PX(reach(hang)) / rMax) * sh]];
  for (let s = S0; s <= END; s += 3) curve.push([xStep(s), sy0 - (PX(reach(film[s])) / rMax) * sh]);
  curve.push([xRight, sy0 - sh]);
  g += P(curve, { stroke: INK, w: 1.6 });
  g += T(xStep(LOCK) + 8, sy0 + 18, `键扣上：第 ${LOCK} 步`, { size: 12, fill: KEY });
  g += T(xDrop0 - 70, sy0 + 44, `挑出在键扣上之前就长到了 ${Math.round((reach(film[LOCK - 1]) / reach(fin)) * 100)}%：布是被芯挤出去的，键管的是把鼓出来的那一团定成平的台。`, { size: 12.5 });
  g += T(xDrop0 - 70, sy0 + 68, '吊杆、夹环、芯的样子是建模假设；落下的快慢是演示值；键在这一档是同一步全扣上的（引擎实测）。', { size: 11.5, fill: MUTE });
  return { W, H: sy0 + 96, svg: null, body: g };
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
