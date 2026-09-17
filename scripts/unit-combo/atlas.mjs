// 线稿图谱：单元组合（Lab 2-11）——「五种形态各自能当什么」「三种组合（通道 / 平台 / 密闭）合起来
// 读成什么」「任意两种相切会出什么」画成只有线的图，给用户拍板。
//
// 纪律（用户 2026-08-20 立）：先线稿、确认后再上 3D。几何**整套查站上模块**
// （src/lib/space/unit-combo.ts），不另写一份——间距 / 走面落差 / 净空一处改两处同步。
// 剖面是**真引擎终态**（五种形态各跑一遍 1500 步），不是示意。
// 用法： npx vite-node scripts/unit-combo/atlas.mjs <outDir>
//   产出 forms.svg（五种形态）· combos.svg（三种组合）· pairs.svg（两两相切矩阵）
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { RING } from '../../src/lib/space/skin-ring.ts';
import { FIGURE, MM_PER_UNIT, RIG_ANCHOR_Y, RIG_SCALE, ROOM } from '../../src/lib/space/skin-grid.ts';
import {
  COMBO_FORMS, COMBO_PLANS, COMBO_SPACINGS, DECK_LEVEL_TOL,
  comboBridges, comboFormDefs, comboMetrics, comboPositions, comboReading,
} from '../../src/lib/space/unit-combo.ts';

const OUT = process.argv[2] ?? 'combo-out';
mkdirSync(OUT, { recursive: true });
const R = RING.RADIUS_DEF;
const M = (px2d) => (px2d * RIG_SCALE * MM_PER_UNIT) / 1000; // 2D px → 米
const fmtM = (px2d) => `${M(px2d).toFixed(2)} m`;
const fmtCm = (px2d) => `${(M(px2d) * 100).toFixed(1)} cm`;

// ── 真引擎：五种形态跑到底 ────────────────────────────────────────────────────────────
const DEFS = comboFormDefs();
const runs = DEFS.map((d) => {
  const s = createSkinUnit(d.spec, d.opts);
  const start = { px: Float64Array.from(s.px), py: Float64Array.from(s.py) };
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return { key: d.key, n: s.n, start, px: Float64Array.from(s.px), py: Float64Array.from(s.py) };
});

/** 剖面 → [离轴 x, 离下缘高度 h]（2D px） */
function profile2d(run, which = 'final') {
  const src = which === 'start' ? run.start : run;
  const foot = src.py[src.py.length - 1];
  const pts = [];
  for (let i = 0; i < src.px.length; i++) pts.push([src.px[i] * 100, (src.py[i] - foot) * 100]);
  return pts;
}

// ── SVG 小工具 ─────────────────────────────────────────────────────────────────────
const INK = '#1a1c1a';
const MUTE = '#8a8f8a';
const HAIR = '#c9cdc9';
const GREEN = '#2f8f5b';
const PURPLE = '#6b4fbb';
const ORANGE = '#e0733d';
const RED = '#c8382b';
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const txt = (x, y, t, o = {}) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size ?? 11}" fill="${o.fill ?? INK}" text-anchor="${o.anchor ?? 'start'}" font-weight="${o.weight ?? 400}" ${o.italic ? 'font-style="italic"' : ''}>${esc(t)}</text>`;
const line = (x1, y1, x2, y2, o = {}) =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} stroke-linecap="round"/>`;
const circle = (cx, cy, r, o = {}) =>
  `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(0, r).toFixed(1)}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''}/>`;
const poly = (pts, o = {}) =>
  `<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" stroke-linejoin="round" ${o.opacity !== undefined ? `opacity="${o.opacity}"` : ''}/>`;
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? 'none'}" stroke-width="${o.w ?? 1}" ${o.rx ? `rx="${o.rx}"` : ''} ${o.opacity !== undefined ? `opacity="${o.opacity}"` : ''}/>`;
const dimH = (x1, x2, y, label, o = {}) =>
  [
    line(x1, y, x2, y, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    line(x1, y - 4, x1, y + 4, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    line(x2, y - 4, x2, y + 4, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    txt((x1 + x2) / 2, y - 4, label, { size: 10, fill: o.stroke ?? MUTE, anchor: 'middle' }),
  ].join('');
const dimV = (x, y1, y2, label, o = {}) =>
  [
    line(x, y1, x, y2, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    line(x - 4, y1, x + 4, y1, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    line(x - 4, y2, x + 4, y2, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    txt(x + 6, (y1 + y2) / 2 + 4, label, { size: 10, fill: o.stroke ?? MUTE }),
  ].join('');
const doc = (W, H, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,'PingFang SC','Noto Sans CJK SC',sans-serif">\n<rect width="${W}" height="${H}" fill="#fbfbf9"/>\n${body}\n</svg>`;

// ── 立面画法：一个单元 = 立杆 + 左右两条真剖面（镜像）；世界系天花 y=0、下缘钉在 RIG_ANCHOR_Y ──
function unitElevation(cx0, oy, sc, run, o = {}) {
  const pts = profile2d(run, o.snap ?? 'final');
  const W = (x) => cx0 + x * RIG_SCALE * sc;
  const Y = (h) => oy + (RIG_ANCHOR_Y - h * RIG_SCALE) * sc;
  const out = [];
  const col = o.stroke ?? INK;
  // 立杆：天花到下缘（Lab 2-8 起是房间的固定立杆）
  out.push(line(cx0, oy, cx0, Y(0), { stroke: MUTE, w: 1.2 }));
  const left = pts.map(([x, h]) => [W(-(R + x)), Y(h)]);
  const right = pts.map(([x, h]) => [W(R + x), Y(h)]);
  out.push(poly(left, { stroke: col, w: o.w ?? 1, opacity: o.opacity }));
  out.push(poly(right, { stroke: col, w: o.w ?? 1, opacity: o.opacity }));
  return out.join('');
}
function figureElevation(x, oy, sc) {
  const H = FIGURE.HEIGHT * sc;
  const y0 = oy + ROOM.FLOOR_Y * sc;
  const head = H * 0.13;
  return [
    circle(x, y0 - H + head / 2, head / 2, { stroke: MUTE, w: 1 }),
    line(x, y0 - H + head, x, y0 - H * 0.47, { stroke: MUTE, w: 1.2 }),
    line(x - H * 0.16, y0 - H * 0.72, x + H * 0.16, y0 - H * 0.72, { stroke: MUTE, w: 1 }),
    line(x, y0 - H * 0.47, x - H * 0.1, y0, { stroke: MUTE, w: 1.2 }),
    line(x, y0 - H * 0.47, x + H * 0.1, y0, { stroke: MUTE, w: 1.2 }),
    txt(x, y0 + 12, '1.70 m', { size: 9, fill: MUTE, anchor: 'middle' }),
  ].join('');
}
function roomElevation(x0, x1, oy, sc) {
  return [
    line(x0, oy, x1, oy, { stroke: HAIR, w: 1 }),
    line(x0, oy + ROOM.FLOOR_Y * sc, x1, oy + ROOM.FLOOR_Y * sc, { stroke: INK, w: 1 }),
  ].join('');
}
/** 一列单元的立面（站位查模块） */
function rowElevation(forms, spacing, ox, oy, sc, o = {}) {
  const xs = comboPositions(forms, R, spacing);
  const out = [];
  forms.forEach((f, i) => {
    const cx = ox + xs[i] * RIG_SCALE * sc;
    out.push(unitElevation(cx, oy, sc, runs[f], { stroke: o.stroke, w: o.w }));
    if (o.labels) out.push(txt(cx, oy + (RIG_ANCHOR_Y + 14) * sc + 10, COMBO_FORMS[f].zh, { size: 9.5, fill: MUTE, anchor: 'middle' }));
  });
  // 织物网：同族相邻对的缝上画一小段虚线（顶/底）
  if (o.webs) {
    for (const [i, j] of comboBridges(forms, spacing)) {
      const a = COMBO_FORMS[forms[i]];
      const b = COMBO_FORMS[forms[j]];
      const xa = ox + (xs[i] + R + a.reach) * RIG_SCALE * sc;
      const xb = ox + (xs[j] - R - b.reach) * RIG_SCALE * sc;
      const Y = (h) => oy + (RIG_ANCHOR_Y - h * RIG_SCALE) * sc;
      out.push(line(xa, Y(a.top), xb, Y(b.top), { stroke: ORANGE, w: 1.2 }));
      out.push(line(xa, Y(a.bot), xb, Y(b.bot), { stroke: ORANGE, w: 1.2 }));
    }
  }
  return out.join('');
}
/** 一列单元的平面：芯圆 + 外缘圆，捏分外缘画虚线（腔在里面） */
function rowPlan(forms, spacing, ox, oy, sc) {
  const xs = comboPositions(forms, R, spacing);
  const out = [];
  forms.forEach((f, i) => {
    const cx = ox + xs[i] * RIG_SCALE * sc;
    const F = COMBO_FORMS[f];
    const col = F.family === 'split' ? PURPLE : F.family === 'bag' ? ORANGE : GREEN;
    out.push(circle(cx, oy, R * RIG_SCALE * sc, { stroke: MUTE, w: 0.8 }));
    out.push(circle(cx, oy, (R + F.reach) * RIG_SCALE * sc, { stroke: col, w: 1.3, fill: `${col}14`, dash: F.family === 'split' ? '4 3' : undefined }));
  });
  return out.join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 图 1 · 五种形态：各自能当什么
// ═══════════════════════════════════════════════════════════════════════════════
{
  const W = 1640;
  const H = 700;
  const g = [];
  g.push(txt(40, 44, '图 1 · 形态词汇 —— 五种单元各自能当什么', { size: 20, weight: 700 }));
  g.push(txt(40, 66, `单元 = Lab 2-5 的圆筒环（${RING.COUNT} 条带绕一根立杆，站位半径 R=${R}，装置 ×0.5 摆进房间、下缘钉在离地 ${fmtM((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / RIG_SCALE)}）。目录四形态 + 捏分（Lab 2-5 捏分编制的 j0：两片台夹一道 100 px 的缝，带子 338 节）。全部真引擎终态。`, { size: 11, fill: MUTE }));
  const sc = 1.0;
  const oy = 96;
  const colW = 300;
  const x0 = 150;
  g.push(roomElevation(40, W - 40, oy, sc));
  const Y = (h) => oy + (RIG_ANCHOR_Y - h * RIG_SCALE) * sc;
  const roles = {
    pocket: ['挂袋', '走面：无 · 袋底离地 ' + fmtM((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / RIG_SCALE + 82.2), '在组合里：袋与袋并排成一串；与挑台相邻时它挂在走面上方'],
    bulb: ['薄挑台（卷边）', `走面离下缘 82.3 px（离地 ${fmtM((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / RIG_SCALE + 82.3)}）· 挑出 99.5`, '在组合里：走面'],
    ledge: ['薄挑台（直）', `走面 77.2 px（离地 ${fmtM((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / RIG_SCALE + 77.2)}）· 挑出 101.0（五种里最远）`, '在组合里：走面；与捏分下板顶只差 1.2 px（半厘米）'],
    stepped: ['厚台（方箱）', `走面 101.5 px（离地 ${fmtM((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / RIG_SCALE + 101.5)}）· 箱高 68 · 挑出 82.2`, '在组合里：比薄挑台高一级（9.6 cm）的走面——一个台阶'],
    split: ['走面 + 顶板', `下板顶 78.4 · 上板底 177.8 ⇒ 净空 ${fmtM(99.5)} · 挑出 83.1`, '在组合里：有顶的一格；两个相对 = 腔接通'],
  };
  COMBO_FORMS.forEach((F, i) => {
    const cx = x0 + i * colW;
    const run = runs[i];
    g.push(txt(cx, oy - 8, `${F.zh} · ${F.en}`, { size: 12, weight: 600, anchor: 'middle' }));
    g.push(unitElevation(cx, oy, sc, run, { snap: 'start', stroke: HAIR, w: 0.8 }));
    g.push(unitElevation(cx, oy, sc, run));
    // 走面 / 顶板标线
    if (F.deck !== null) {
      const xr = cx + (R + F.reach) * RIG_SCALE * sc;
      g.push(line(cx - (R + F.reach) * RIG_SCALE * sc, Y(F.deck), xr, Y(F.deck), { stroke: GREEN, w: 0.8, dash: '3 3' }));
      g.push(txt(xr + 4, Y(F.deck) + 3, `走面 ${F.deck.toFixed(1)}`, { size: 9, fill: GREEN }));
    }
    if (F.roof !== null) {
      const xr = cx + (R + F.reach) * RIG_SCALE * sc;
      g.push(line(cx - (R + F.reach) * RIG_SCALE * sc, Y(F.roof), xr, Y(F.roof), { stroke: PURPLE, w: 0.8, dash: '3 3' }));
      g.push(txt(xr + 4, Y(F.roof) + 3, `顶板底 ${F.roof.toFixed(1)}`, { size: 9, fill: PURPLE }));
      g.push(dimV(cx - (R + F.reach) * RIG_SCALE * sc - 14, Y(F.roof), Y(F.deck), `净空 ${fmtM(F.roof - F.deck)}`, { stroke: PURPLE }));
    }
    if (F.family === 'bag') {
      const xr = cx + (R + F.reach) * RIG_SCALE * sc;
      g.push(line(cx - (R + F.reach) * RIG_SCALE * sc, Y(F.bot), xr, Y(F.bot), { stroke: ORANGE, w: 0.8, dash: '3 3' }));
      g.push(txt(xr + 4, Y(F.bot) + 3, `袋底 ${F.bot.toFixed(1)}`, { size: 9, fill: ORANGE }));
    }
    g.push(dimH(cx, cx + (R + F.reach) * RIG_SCALE * sc, Y(-10) + 16, `R+${F.reach.toFixed(1)}`));
    const [role, l1, l2] = roles[F.key];
    const ty = oy + ROOM.FLOOR_Y * sc + 26;
    g.push(txt(cx, ty, role, { size: 11, weight: 600, anchor: 'middle', fill: F.family === 'split' ? PURPLE : F.family === 'bag' ? ORANGE : GREEN }));
    g.push(txt(cx, ty + 16, l1, { size: 9.5, fill: MUTE, anchor: 'middle' }));
    g.push(txt(cx, ty + 30, l2, { size: 9.5, fill: INK, anchor: 'middle' }));
  });
  g.push(figureElevation(x0 + 5 * colW - 60, oy, sc));
  g.push(txt(40, H - 44, '灰线 = 收缩前的直带（捏分那条带子长 338 节，挂得高；下缘一样钉在同一个高度）。绿虚线 = 走面（材料最高处）；紫虚线 = 顶板底面；橙虚线 = 袋底。', { size: 10, fill: MUTE }));
  g.push(txt(40, H - 26, `走面高差 ≤ ${fmtCm(DECK_LEVEL_TOL)} 读作同一片（脚感）；三种挑台的走面在 77–102 之间，捏分的下板顶 78.4——所以「走进有顶的一格」脚下几乎不变。`, { size: 10, fill: MUTE }));
  writeFileSync(join(OUT, 'forms.svg'), doc(W, H, g.join('\n')));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 图 2 · 三种组合：草图 ①②③ 的读法
// ═══════════════════════════════════════════════════════════════════════════════
{
  const W = 1640;
  const rowH = 500;
  const H = 120 + rowH * COMBO_PLANS.length + 40;
  const g = [];
  g.push(txt(40, 44, '图 2 · 三种组合 —— 草图 ① 通道 · ② 平台 · ③ 密闭（相切；真引擎终态）', { size: 20, weight: 700 }));
  g.push(txt(40, 66, '每种组合 = 几个槽位 + 每槽一个默认形态；台架上每个槽位的形态现场可换。间距逐对量出（芯心距 = 两边的 R + 挑出峰值），橙线 = 同族相邻对之间的织物网（顶面一层 + 底面一层）。', { size: 11, fill: MUTE }));
  const sc = 0.88;
  const notes = {
    passage: ['① 通道 · 直挑台 ×2 → 捏分 → 直挑台', '一条走道：三片薄挑台的走面连成一条线，走进捏分那一格头顶多出一片板（净空 0.39 m），脚下只差半厘米。捏分与挑台之间不搭网——走面本来就齐。', '备选读法：草图的四个剖面若是高度递减（错层），那是「高度」旋钮的事，这轮先做齐平；两排单元夹一条人走的走廊是另一种通道，本轮没做。'],
    platform: ['② 平台 · 直挑台 + 蘑菇挑台', '两片薄台在中间接上、缝用织物网糊成一片：一片 ⌀ 更大的平台，走面落差 2 cm。换成方箱 + 直挑台就多出一个 9.6 cm 的台阶——厚薄在这里读作高差。', '备选读法：三个一线或三角也是「共同构造」，这轮先按草图做两个。'],
    enclosure: ['③ 密闭 · 捏分 + 捏分', '两个 C 形开口相对：两片下板连成一片地、两片上板连成一片顶、两根立杆处是缝底 ⇒ 一个 0.66 m 深 × 0.39 m 高的腔，两端在缝口接通。', '边界：腔沿圆周是敞开的（缝口本来就是开的）——四面封闭要给缝口加膜，是新几何，本轮没做；草图那个外框读作房间的剖面。'],
  };
  COMBO_PLANS.forEach((P, r) => {
    const oy = 110 + r * rowH;
    const forms = P.slots;
    const spacing = 'touch';
    const m = comboMetrics(forms, R, spacing);
    const [t1, t2, t3] = notes[P.key];
    g.push(txt(40, oy - 4, t1, { size: 13, weight: 700 }));
    g.push(txt(40, oy + 14, '读作：' + comboReading(forms, R, spacing), { size: 11, weight: 600, fill: PURPLE }));
    // 立面（左）
    const ex = 60;
    const ew = 820;
    g.push(roomElevation(ex, ex + ew, oy + 24, sc));
    const cx0 = ex + ew / 2 - 60;
    g.push(rowElevation(forms, spacing, cx0, oy + 24, sc, { webs: true, labels: true }));
    g.push(figureElevation(ex + ew - 40, oy + 24, sc));
    // 尺寸：总长 + 逐对芯心距
    const xs = comboPositions(forms, R, spacing);
    const Yd = oy + 24 + (RIG_ANCHOR_Y + 40) * sc;
    const xl = cx0 + (xs[0] - R - COMBO_FORMS[forms[0]].peakReach) * RIG_SCALE * sc;
    const xr = cx0 + (xs[xs.length - 1] + R + COMBO_FORMS[forms[forms.length - 1]].peakReach) * RIG_SCALE * sc;
    g.push(dimH(xl, xr, Yd + 26, `总长 ${m.lengthM.toFixed(2)} m`));
    for (let i = 1; i < xs.length; i++)
      g.push(dimH(cx0 + xs[i - 1] * RIG_SCALE * sc, cx0 + xs[i] * RIG_SCALE * sc, Yd + 10, `${m.pitchesM[i - 1].toFixed(2)} m`));
    // 平面（中）
    const px0 = 1000;
    const py0 = oy + 150;
    g.push(txt(px0 - 40, oy + 40, '平面', { size: 10, fill: MUTE }));
    g.push(rowPlan(forms, spacing, px0 + 80, py0, 0.6));
    // 读法（右）
    const tx = 1250;
    const wrap = (s, n) => { const o = []; for (let i = 0; i < s.length; i += n) o.push(s.slice(i, i + n)); return o; };
    let ty = oy + 44;
    for (const l of wrap(t2, 30)) { g.push(txt(tx, ty, l, { size: 10.5 })); ty += 15; }
    ty += 6;
    for (const l of wrap(t3, 30)) { g.push(txt(tx, ty, l, { size: 9.5, fill: MUTE })); ty += 14; }
  });
  writeFileSync(join(OUT, 'combos.svg'), doc(W, H, g.join('\n')));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 图 3 · 两两相切矩阵：任意两种形态挨在一起会出什么
// ═══════════════════════════════════════════════════════════════════════════════
{
  const n = COMBO_FORMS.length;
  const cell = 300;
  const W = 140 + cell * n + 40;
  const H = 130 + cell * n + 60;
  const g = [];
  g.push(txt(40, 44, '图 3 · 两两相切 —— 任意两种形态挨在一起读成什么（上三角 15 对；真引擎终态）', { size: 20, weight: 700 }));
  g.push(txt(40, 66, '每格：左 = 行的形态、右 = 列的形态，相切摆放。绿 = 走面连续（落差 ≤ 3 cm）· 黄 = 走面有台阶 · 紫 = 有顶 / 腔接通 · 橙 = 挂袋。', { size: 11, fill: MUTE }));
  const sc = 0.72;
  const CROP = 90; // 立面只画世界 y ≥ CROP 的那段（天花那头空着，裁掉）
  for (let a = 0; a < n; a++) {
    g.push(txt(120, 130 + a * cell + cell / 2, COMBO_FORMS[a].zh, { size: 11, weight: 600, anchor: 'end' }));
    g.push(txt(140 + a * cell + cell / 2, 106, COMBO_FORMS[a].zh, { size: 11, weight: 600, anchor: 'middle' }));
    for (let b = a; b < n; b++) {
      const ox = 140 + b * cell;
      const oy = 130 + a * cell;
      g.push(rect(ox, oy, cell, cell, { stroke: HAIR }));
      const forms = [a, b];
      const m = comboMetrics(forms, R, 'touch');
      const FA = COMBO_FORMS[a];
      const FB = COMBO_FORMS[b];
      let col = MUTE;
      let tag = '';
      if (FA.deck !== null && FB.deck !== null) {
        const step = Math.abs(FA.deck - FB.deck);
        if (step <= DECK_LEVEL_TOL) { col = GREEN; tag = `走面连成一片 · 落差 ${fmtCm(step)}`; }
        else { col = '#b8860b'; tag = `走面有台阶 ${fmtCm(step)}`; }
        if (FA.family === 'split' || FB.family === 'split') tag += ' · 一格有顶';
        if (FA.family === 'split' && FB.family === 'split') { col = PURPLE; tag = `腔接通 · 深 ${m.cavitySpanM.toFixed(2)} m × 净空 ${m.cavityM.toFixed(2)} m`; }
      } else if (FA.family === 'bag' && FB.family === 'bag') { col = ORANGE; tag = '两个袋并成一串'; }
      else { col = ORANGE; tag = '袋挂在走面旁上方'; }
      const oyE = oy + 16 - CROP * sc;
      g.push(`<clipPath id="c${a}${b}"><rect x="${ox}" y="${oy + 12}" width="${cell}" height="${cell - 46}"/></clipPath><g clip-path="url(#c${a}${b})">`);
      g.push(rowElevation(forms, 'touch', ox + cell / 2, oyE, sc, { webs: true }));
      g.push('</g>');
      g.push(txt(ox + cell / 2, oy + cell - 24, tag, { size: 9.5, fill: col, anchor: 'middle', weight: 600 }));
      g.push(txt(ox + cell / 2, oy + cell - 10, `芯心距 ${m.pitchesM[0].toFixed(2)} m · 总长 ${m.lengthM.toFixed(2)} m`, { size: 9, fill: MUTE, anchor: 'middle' }));
    }
  }
  writeFileSync(join(OUT, 'pairs.svg'), doc(W, H, g.join('\n')));
}

console.log('written', OUT, COMBO_PLANS.map((p) => `${p.key}: ${comboReading(p.slots, R, 'touch')}`).join(' | '), COMBO_SPACINGS.length);
