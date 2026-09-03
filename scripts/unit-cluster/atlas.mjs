// 线稿图谱：单元关系（Lab.13）——把「一个单元是什么」「几个单元之间有哪些关系维度」
// 「2 / 3 / 4 / 9 个单元在五种关系下长什么样」画成只有线的图，给用户拍板。
//
// 纪律（用户 2026-08-20 立）：先线稿、确认后再上 3D。几何**整套查站上模块**
// （src/lib/space/unit-cluster.ts），不另写一份——间距 / 高差 / 可行性一处改两处同步。
// 剖面是**真引擎终态**（四种形态各跑一遍 1500 步），不是示意。
// 用法： npx vite-node scripts/unit-cluster/atlas.mjs <outDir>
//   产出 unit.svg（单元定义）· dims.svg（关系维度）· matrix.svg（N × 关系）
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { RING, RING_LEAD, RING_TAIL, buildRingUnits } from '../../src/lib/space/skin-ring.ts';
import {
  FIGURE, MM_PER_UNIT, PEAK_REACH, RIG_ANCHOR_Y, RIG_SCALE, ROOM, ringCellPitch,
} from '../../src/lib/space/skin-grid.ts';
import {
  CLUSTER_LEAD, CLUSTER_PLANS, CLUSTER_RELATIONS, LEVEL_RANGE_PX, OVERLAP_CLEAR, UNIT_FORMS,
  clusterCells, clusterLeads, clusterLevelCount, clusterLevels, clusterMetrics, clusterPitch,
  clusterPositions, overlapFeasible,
} from '../../src/lib/space/unit-cluster.ts';

const OUT = process.argv[2] ?? 'atlas-out';
mkdirSync(OUT, { recursive: true });
const R = RING.RADIUS_DEF;
const M = (px2d) => (px2d * RIG_SCALE * MM_PER_UNIT) / 1000; // 2D px → 米
const fmtM = (px2d) => `${M(px2d).toFixed(2)} m`; // 入参一律 2D px

// ── 真引擎：四种形态跑到底，沿途每 150 步留一份剖面快照（时序那一行用） ──────────────
const DEFS = buildRingUnits();
const SNAP_AT = [150, 300, 450, 600, 750, 900];
const runs = DEFS.map((d) => {
  const s = createSkinUnit(d.spec, d.opts);
  const snaps = [];
  for (let k = 0; k < SKIN.STEPS; k++) {
    s.advance();
    if (SNAP_AT.includes(k + 1)) snaps.push({ step: k + 1, px: Float64Array.from(s.px), py: Float64Array.from(s.py) });
  }
  return { key: d.key, sim: s, snaps, px: Float64Array.from(s.px), py: Float64Array.from(s.py) };
});
const byKey = Object.fromEntries(runs.map((r) => [r.key, r]));

/** 剖面 → 世界坐标折线（离下缘的高度 hFoot，2D px；x 离轴，2D px）。leadShift = 该级 lead 与基准差的节数 */
function profile2d(run, which = 'final') {
  const src = which === 'final' ? run : run.snaps[which];
  const foot = src.py[src.py.length - 1];
  const pts = [];
  for (let i = 0; i < src.px.length; i++) pts.push([src.px[i] * 100, (src.py[i] - foot) * 100]);
  return pts;
}

// ── SVG 小工具 ─────────────────────────────────────────────────────────────────
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
  `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(0, r).toFixed(1)}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} ${o.opacity !== undefined ? `opacity="${o.opacity}"` : ''}/>`;
const poly = (pts, o = {}) =>
  `<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" stroke-linejoin="round" ${o.opacity !== undefined ? `opacity="${o.opacity}"` : ''}/>`;
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? 'none'}" stroke-width="${o.w ?? 1}" ${o.rx ? `rx="${o.rx}"` : ''}/>`;
/** 尺寸线（水平） */
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

// ── 立面画法：一个单元 = 立杆 + 左右两条真剖面（镜像）+ 平台面标线 ─────────────────────
// 世界系：天花 y=0、地面 y=473、下缘钉在 RIG_ANCHOR_Y；装置 ×RIG_SCALE。屏幕 = 世界 × sc + 原点。
function unitElevation(g, cx0, oy, sc, run, lead, o = {}) {
  const dl = lead - RING_LEAD; // 该级比基准多几节贴合 ⇒ 折叠体沿带**下移** 2px/节（世界 y 向下为正）
  // 注册端反转（08-22）：末节点钉在下缘，lead 变了整条带的形状只是沿带平移 ⇒ 离下缘的高度 −2·dl
  const pts = profile2d(run, o.snap ?? 'final');
  const W = (x) => cx0 + x * RIG_SCALE * sc;
  const Y = (h) => oy + (RIG_ANCHOR_Y - h * RIG_SCALE) * sc;
  const out = [];
  const col = o.stroke ?? INK;
  const wLine = o.w ?? 1;
  // 立杆：天花到下缘
  out.push(line(cx0, oy, cx0, Y(0), { stroke: MUTE, w: 1.2, dash: o.railDash }));
  // 左右两条带（离轴 x 加在 R 上）
  const left = pts.map(([x, h]) => [W(-(R + x)), Y(h - 2 * dl)]);
  const right = pts.map(([x, h]) => [W(R + x), Y(h - 2 * dl)]);
  out.push(poly(left, { stroke: col, w: wLine, opacity: o.opacity }));
  out.push(poly(right, { stroke: col, w: wLine, opacity: o.opacity }));
  // 平台面（嘴心）标线
  if (o.mouth) {
    const f = UNIT_FORMS.find((u) => u.key === run.key);
    const hy = Y(f.mouth - 2 * dl);
    out.push(line(W(-(R + f.reach)), hy, W(R + f.reach), hy, { stroke: o.stroke ?? GREEN, w: 0.8, dash: '3 3' }));
  }
  return out.join('');
}
/** 比例小人（立面，1.70 m，站在地面） */
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
/** 房间剖面：天花线 + 地面线 */
function roomElevation(x0, x1, oy, sc) {
  return [
    line(x0, oy, x1, oy, { stroke: HAIR, w: 1 }),
    line(x0, oy + ROOM.FLOOR_Y * sc, x1, oy + ROOM.FLOOR_Y * sc, { stroke: INK, w: 1 }),
  ].join('');
}
/** 平面画法：一个单元 = 芯圆 + 二十条带的短刻 + 平台外缘（按级着色） */
const LEVEL_COL = ['#2f8f5b', '#3f6fd8', '#6b4fbb', '#c04a86'];
function unitPlan(cx, cy, sc, f, level = 0, o = {}) {
  const out = [];
  const col = o.stroke ?? LEVEL_COL[level % LEVEL_COL.length];
  out.push(circle(cx, cy, R * RIG_SCALE * sc, { stroke: MUTE, w: 0.8 }));
  for (let i = 0; i < RING.COUNT; i++) {
    const a = (i / RING.COUNT) * Math.PI * 2;
    const r0 = (R - 1.5) * RIG_SCALE * sc;
    const r1 = (R + 1.5) * RIG_SCALE * sc;
    out.push(line(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a), cx + r1 * Math.cos(a), cy + r1 * Math.sin(a), { stroke: MUTE, w: 1.2 }));
  }
  out.push(circle(cx, cy, (R + f.reach) * RIG_SCALE * sc, { stroke: col, w: o.w ?? 1.4, fill: o.fill ?? `${col}14` }));
  if (o.peak && f.peakReach > f.reach + 0.05)
    out.push(circle(cx, cy, (R + f.peakReach) * RIG_SCALE * sc, { stroke: col, w: 0.6, dash: '2 3' }));
  return out.join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 图 1 · 一个单元是什么
// ═══════════════════════════════════════════════════════════════════════════════
{
  const W = 1640;
  const H = 820;
  const g = [];
  g.push(txt(40, 44, '图 1 · 单元 —— 一个环形压缩表皮平台', { size: 20, weight: 700 }));
  g.push(txt(40, 66, `= Lab.10 的圆筒环：${RING.COUNT} 条 202 节窄带绕一根立杆排一圈（站位半径 R=${R}），同一张键谱、同一收缩协议；收缩后连成一圈环形平台。装置按 0.5 摆进房间，下缘钉在离地 ${fmtM((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / RIG_SCALE)}。`, { size: 11, fill: MUTE }));

  // 平面（左）
  const scP = 1.05;
  const px = 230;
  const py = 330;
  const f = UNIT_FORMS[3];
  g.push(txt(px, 120, '平面 · 阶梯挑台方箱', { size: 12, weight: 600, anchor: 'middle' }));
  g.push(unitPlan(px, py, scP, f, 0, { peak: true }));
  g.push(circle(px, py, (R + UNIT_FORMS[2].reach) * RIG_SCALE * scP, { stroke: MUTE, w: 0.6, dash: '2 4' }));
  g.push(dimH(px - R * RIG_SCALE * scP, px + R * RIG_SCALE * scP, py + (R + f.reach) * RIG_SCALE * scP + 26, `芯 ⌀${fmtM(2 * R)}`));
  g.push(dimH(px - (R + f.reach) * RIG_SCALE * scP, px + (R + f.reach) * RIG_SCALE * scP, py + (R + f.reach) * RIG_SCALE * scP + 52, `平台 ⌀${fmtM(2 * (R + f.reach))}（方箱终态挑出 ${f.reach.toFixed(1)} px）`));
  g.push(txt(px, py - (R + UNIT_FORMS[2].reach) * RIG_SCALE * scP - 18, `虚线 = 直挑台的外缘 ⌀${fmtM(2 * (R + UNIT_FORMS[2].reach))}（四种里最远，Lab.12 的格距按它算）`, { size: 9.5, fill: MUTE, anchor: 'middle' }));

  // 立面（中）
  const scE = 0.62;
  const ex = 560;
  const ey = 110;
  g.push(txt(ex + 150, 120 - 20, '立面 · 终态（天花 → 地面）', { size: 12, weight: 600, anchor: 'middle' }));
  g.push(roomElevation(ex - 40, ex + 400, ey, scE));
  g.push(unitElevation(g, ex + 120, ey, scE, byKey.stepped, RING_LEAD, { mouth: true }));
  // 起始态（直带）淡线
  g.push(unitElevation(g, ex + 120, ey, scE, byKey.stepped, RING_LEAD, { snap: 0, stroke: HAIR, w: 0.8 }));
  g.push(figureElevation(ex + 360, ey, scE));
  const Yw = (h) => ey + (RIG_ANCHOR_Y - h * RIG_SCALE) * scE;
  g.push(dimV(ex - 22, Yw(0), ey + ROOM.FLOOR_Y * scE, `下缘离地 ${fmtM((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / RIG_SCALE)}`));
  g.push(dimV(ex + 235, Yw(f.mouth), ey + ROOM.FLOOR_Y * scE, `平台面离地 ${fmtM((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / RIG_SCALE + f.mouth)}`));
  g.push(dimV(ex + 262, Yw(f.mouth + LEVEL_RANGE_PX), Yw(f.mouth), `高度旋钮量程 ${fmtM(LEVEL_RANGE_PX)}`, { stroke: PURPLE }));
  g.push(txt(ex + 120, ey + ROOM.FLOOR_Y * scE + 14, `房高 ${fmtM(ROOM.FLOOR_Y / RIG_SCALE)} · 淡线 = 收缩前的直带`, { size: 9.5, fill: MUTE, anchor: 'middle' }));

  // 旋钮表（右）
  const tx = 1000;
  let ty = 120;
  g.push(txt(tx, ty, '一个单元的四个旋钮（都已定版，本 lab 一个数不改、只在单元之间拉开差别）', { size: 12, weight: 600 }));
  ty += 22;
  const knobs = [
    ['形态', '目录四键谱：袋 / 蘑菇挑台 / 直挑台 / 阶梯挑台方箱（默认方箱，顶面找平过）'],
    ['半径', `站位半径滑块 ${RING.RADIUS_MIN}–${RING.RADIUS_MAX}（默认 ${R}）；圆周随半径长，带间缝随之开合`],
    ['高度', `lead = 形状在带上的位置（2 px/节）；验过「形状不变」的量程 ${CLUSTER_LEAD.HIGH}–${CLUSTER_LEAD.LOW} 节 ⇒ 可抬高 ${fmtM(LEVEL_RANGE_PX)}`],
    ['蒙皮', '环间织物膜 0–1（Lab.10/12 默认 0.35）'],
  ];
  for (const [k, v] of knobs) {
    g.push(txt(tx, ty, k, { size: 11, weight: 600, fill: PURPLE }));
    g.push(txt(tx + 44, ty, v, { size: 10.5 }));
    ty += 18;
  }
  ty += 16;
  g.push(txt(tx, ty, '四种形态的实测量（2D px → 米）', { size: 12, weight: 600 }));
  ty += 18;
  const head = ['形态', '终态挑出 px · m', '全程峰值 px', '平台面高 px · m', '折叠体高 px', '成形期峰值 px · m'];
  const cols = [0, 76, 196, 290, 410, 500];
  head.forEach((h, i) => g.push(txt(tx + cols[i], ty, h, { size: 9.5, fill: MUTE })));
  ty += 6;
  g.push(line(tx, ty, tx + 610, ty, { stroke: HAIR }));
  const names = { pocket: '袋', bulb: '蘑菇挑台', ledge: '直挑台', stepped: '阶梯方箱' };
  for (const u of UNIT_FORMS) {
    ty += 16;
    const row = [names[u.key], `${u.reach.toFixed(1)} · ${fmtM(u.reach)}`, `${u.peakReach.toFixed(1)}`, `${u.mouth.toFixed(1)} · ${fmtM(u.mouth)}`, `${u.body.toFixed(1)}`, `${u.bodyPeak.toFixed(1)} · ${fmtM(u.bodyPeak)}`];
    row.forEach((c, i) => g.push(txt(tx + cols[i], ty, c, { size: 10 })));
  }
  ty += 24;
  g.push(txt(tx, ty, '「全程峰值」是间距要按的数（成形期不许撞上）；「成形期峰值」是交叠时高差要装下的数。', { size: 9.5, fill: MUTE }));
  ty += 14;
  g.push(txt(tx, ty, '这一族的挑出峰值 = 终态（没有回缩），折叠体却会在成形期鼓得比终态高（方箱 77 vs 68）。', { size: 9.5, fill: MUTE }));

  // 底部：距离四态的定义
  const by = 600;
  g.push(txt(40, by, '距离是量出来的，不是分的（两个单元芯心距 d，平台外缘 ρ = R + 挑出峰值）', { size: 12, weight: 600 }));
  const defs = [
    [`离  d ≥ 2ρ + 缝`, 'Lab.12 那种独立，格距 = ringCellPitch', GREEN],
    [`切  d = 2ρ`, '两圈平台边贴边，读成一整片', GREEN],
    [`叠  2R + 挑出 < d < 2ρ`, '平台在平面上盖过去——只有不同高时成立（一个从另一个底下穿过）', PURPLE],
    [`嵌  d ≤ 2R + 挑出`, '平台伸进邻居的芯带——引擎没有碰撞，做不了（范围外）', RED],
  ];
  defs.forEach(([a, b, c], i) => {
    g.push(txt(40, by + 22 + i * 18, a, { size: 11, weight: 600, fill: c }));
    g.push(txt(250, by + 22 + i * 18, b, { size: 10.5 }));
  });
  writeFileSync(join(OUT, 'unit.svg'), doc(W, H, g.join('\n')));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 图 2 · 关系维度：每行一个维度，用「一对」示范
// ═══════════════════════════════════════════════════════════════════════════════
{
  const W = 1440;
  const rowH = 290;
  const rows = [];
  const scE = 0.36; // 立面比例
  const scP = 0.36;
  const f = UNIT_FORMS[3];
  const cellW = 300;
  const x0 = 200;

  /** 一对的平面 + 立面（世界 x 沿屏幕 x）：d = 芯心距（2D px），leads = 两个单元的 lead，forms = 两个形态 idx */
  function pairCell(cx, cy, d, leads, forms, o = {}) {
    const out = [];
    const halfW = (d / 2) * RIG_SCALE;
    // 平面
    const py = cy + 44;
    [-1, 1].forEach((s, i) => {
      const fi = UNIT_FORMS[forms[i]];
      const lvl = leads[i] === RING_LEAD ? 0 : 1;
      out.push(unitPlan(cx + s * halfW * scP, py, scP, fi, lvl, { stroke: o.cross ? RED : undefined }));
    });
    // 立面（立杆从这里往下画到下缘；天花不画）
    const oy = cy + 78;
    out.push(line(cx - 130, oy + ROOM.FLOOR_Y * scE, cx + 130, oy + ROOM.FLOOR_Y * scE, { stroke: INK, w: 0.8 }));
    [-1, 1].forEach((s, i) => {
      out.push(unitElevation(out, cx + s * halfW * scE, oy, scE, runs[forms[i]], leads[i], { mouth: true, stroke: o.cross ? RED : undefined, railDash: '2 3' }));
    });
    return out.join('');
  }

  // 行 1 · 距离四态
  {
    const cy = 60;
    rows.push(txt(40, cy + 20, '距离', { size: 14, weight: 700 }));
    rows.push(txt(40, cy + 40, '离 / 切 / 叠 / 嵌', { size: 10.5, fill: MUTE }));
    const items = [
      ['离 · 分离', ringCellPitch(R), [RING_LEAD, RING_LEAD], `d = ${fmtM(ringCellPitch(R))}，Lab.12 的格距`, {}],
      ['切 · 相切', 2 * (R + f.peakReach), [RING_LEAD, RING_LEAD], `d = 2ρ = ${fmtM(2 * (R + f.peakReach))}，边贴边`, {}],
      ['叠 · 交叠（须错层）', 2 * R + f.peakReach + OVERLAP_CLEAR.XY, [RING_LEAD, CLUSTER_LEAD.HIGH], `d = ${fmtM(2 * R + f.peakReach + OVERLAP_CLEAR.XY)}，盖过去 ${fmtM(f.reach - OVERLAP_CLEAR.XY)}，高差 ${fmtM(LEVEL_RANGE_PX)}`, {}],
      ['嵌 ✗ 范围外', 2 * R + f.peakReach - 30, [RING_LEAD, CLUSTER_LEAD.HIGH], `平台伸进邻居芯带 ${fmtM(30)}：要碰撞，引擎没有`, { cross: true }],
    ];
    items.forEach(([name, d, leads, note, o], i) => {
      const cx = x0 + i * cellW + cellW / 2;
      rows.push(txt(cx, cy, name, { size: 11.5, weight: 600, anchor: 'middle', fill: o.cross ? RED : INK }));
      rows.push(pairCell(cx, cy, d, leads, [3, 3], o));
      rows.push(txt(cx, cy + rowH - 26, note, { size: 9.5, fill: MUTE, anchor: 'middle' }));
    });
  }
  // 行 2 · 高度
  {
    const cy = 60 + rowH;
    rows.push(txt(40, cy + 20, '高度', { size: 14, weight: 700 }));
    rows.push(txt(40, cy + 40, '齐平 / 错层（lead 旋钮）', { size: 10.5, fill: MUTE }));
    const items = [
      ['齐平', 2 * (R + f.peakReach), [RING_LEAD, RING_LEAD], '同一个 lead，平台面同高'],
      ['错层 · 一级', 2 * (R + f.peakReach), [RING_LEAD, CLUSTER_LEAD.HIGH], `高差 ${fmtM(LEVEL_RANGE_PX)}（量程用满，2 级）`],
      ['错层 · 半级', 2 * (R + f.peakReach), [RING_LEAD, clusterLeads(3)[1]], `高差 ${fmtM(LEVEL_RANGE_PX / 2)}（3 级里的一步 ≈ 一级台阶）`],
      ['形状不变', 2 * (R + f.peakReach), [RING_LEAD, CLUSTER_LEAD.HIGH], '起伏编制实测：lead 只平移形状，剖面逐点相同'],
    ];
    items.forEach(([name, d, leads, note], i) => {
      const cx = x0 + i * cellW + cellW / 2;
      rows.push(txt(cx, cy, name, { size: 11.5, weight: 600, anchor: 'middle' }));
      rows.push(pairCell(cx, cy, d, leads, [3, 3]));
      rows.push(txt(cx, cy + rowH - 26, note, { size: 9.5, fill: MUTE, anchor: 'middle' }));
    });
  }
  // 行 3 · 形态 + 尺寸
  {
    const cy = 60 + rowH * 2;
    rows.push(txt(40, cy + 20, '形态 · 尺寸', { size: 14, weight: 700 }));
    rows.push(txt(40, cy + 40, '同形 / 异形 · 等径 / 异径', { size: 10.5, fill: MUTE }));
    const items = [
      ['同形 · 方箱 + 方箱', 2 * (R + f.peakReach), [RING_LEAD, RING_LEAD], [3, 3], '现成（Lab.12 每行一种的机制）'],
      ['异形 · 直挑台 + 方箱', R + UNIT_FORMS[2].peakReach + R + f.peakReach, [RING_LEAD, RING_LEAD], [2, 3], '现成；相切距按各自挑出算'],
      ['异形 · 袋 + 方箱', R + UNIT_FORMS[0].peakReach + R + f.peakReach, [RING_LEAD, RING_LEAD], [0, 3], '袋的平台天然高 0.18 m、浅 0.07 m'],
    ];
    items.forEach(([name, d, leads, forms, note], i) => {
      const cx = x0 + i * cellW + cellW / 2;
      rows.push(txt(cx, cy, name, { size: 11.5, weight: 600, anchor: 'middle' }));
      rows.push(pairCell(cx, cy, d, leads, forms));
      rows.push(txt(cx, cy + rowH - 26, note, { size: 9.5, fill: MUTE, anchor: 'middle' }));
    });
    // 异径：只画平面（要台架扩展）
    const cx = x0 + 3 * cellW + cellW / 2;
    rows.push(txt(cx, cy, '异径 · R30 + R60（要台架扩展）', { size: 11.5, weight: 600, anchor: 'middle', fill: PURPLE }));
    const R2 = 60;
    const d = R + f.peakReach + R2 + f.peakReach;
    const py = cy + 110;
    rows.push(unitPlan(cx - (d / 2) * RIG_SCALE * scP, py, scP, f, 0));
    // 大半径的单元：芯圆与平台外缘按 R2 重画
    {
      const ux = cx + (d / 2) * RIG_SCALE * scP;
      rows.push(circle(ux, py, R2 * RIG_SCALE * scP, { stroke: MUTE, w: 0.8 }));
      for (let i = 0; i < RING.COUNT; i++) {
        const a = (i / RING.COUNT) * Math.PI * 2;
        const r0 = (R2 - 1.5) * RIG_SCALE * scP;
        const r1 = (R2 + 1.5) * RIG_SCALE * scP;
        rows.push(line(ux + r0 * Math.cos(a), py + r0 * Math.sin(a), ux + r1 * Math.cos(a), py + r1 * Math.sin(a), { stroke: MUTE, w: 1.2 }));
      }
      rows.push(circle(ux, py, (R2 + f.reach) * RIG_SCALE * scP, { stroke: PURPLE, w: 1.4, fill: `${PURPLE}14` }));
    }
    rows.push(txt(cx, cy + rowH - 40, '挑出不随半径变（键谱定的），大环 = 更大的洞、同宽的平台', { size: 9.5, fill: MUTE, anchor: 'middle' }));
    rows.push(txt(cx, cy + rowH - 26, '半径烘进顶点：多半径 = 多份几何，台架现在一个滑块管全场', { size: 9.5, fill: MUTE, anchor: 'middle' }));
  }
  // 行 4 · 时序 + 连接
  {
    const cy = 60 + rowH * 3;
    rows.push(txt(40, cy + 20, '时序 · 连接', { size: 14, weight: 700 }));
    rows.push(txt(40, cy + 40, '同步 / 错相 · 平台之间的膜', { size: 10.5, fill: MUTE }));
    // 时序：一对相切，B 比 A 晚 300 步——用真引擎快照画 4 个时刻
    const d = 2 * (R + f.peakReach);
    const times = [1, 3, 5, 'final'];
    times.forEach((tA, i) => {
      const cx = x0 + i * 230 + 115;
      const tB = tA === 'final' ? 3 : Math.max(0, tA - 2);
      const labelA = tA === 'final' ? '900+' : SNAP_AT[tA];
      const labelB = SNAP_AT[tB];
      rows.push(txt(cx, cy, i === 0 ? '错相（要台架扩展）· A 先 B 后' : `A step ${labelA} · B step ${labelB}`, { size: 11, weight: i === 0 ? 600 : 400, anchor: 'middle', fill: i === 0 ? PURPLE : INK }));
      const oy = cy + 78;
      rows.push(line(cx - 110, oy + ROOM.FLOOR_Y * scE, cx + 110, oy + ROOM.FLOOR_Y * scE, { stroke: INK, w: 0.8 }));
      rows.push(unitElevation(rows, cx - (d / 2) * RIG_SCALE * scE, oy, scE, byKey.stepped, RING_LEAD, { snap: tA, railDash: '2 3' }));
      rows.push(unitElevation(rows, cx + (d / 2) * RIG_SCALE * scE, oy, scE, byKey.stepped, RING_LEAD, { snap: tB, railDash: '2 3', stroke: PURPLE }));
    });
    rows.push(txt(x0 + 460, cy + rowH - 26, '现在整场一个时钟；每单元一个起步延迟就能做「一个接一个塌下去」的传播——是台架加法式扩展，不是引擎改动', { size: 9.5, fill: MUTE, anchor: 'middle' }));
    // 连接
    const cx = x0 + 4 * 230 + 115;
    rows.push(txt(cx, cy, '连接（要新几何）', { size: 11.5, weight: 600, anchor: 'middle', fill: PURPLE }));
    const py = cy + 110;
    const hw = (d / 2) * RIG_SCALE * scP;
    rows.push(unitPlan(cx - hw, py, scP, f, 0));
    rows.push(unitPlan(cx + hw, py, scP, f, 0));
    const rr = (R + f.reach) * RIG_SCALE * scP;
    rows.push(rect(cx - 6, py - rr * 0.55, 12, rr * 1.1, { fill: `${ORANGE}55`, stroke: ORANGE, w: 0.8 }));
    rows.push(txt(cx, cy + rowH - 40, '相切处两圈平台之间那道缝用膜糊上', { size: 9.5, fill: MUTE, anchor: 'middle' }));
    rows.push(txt(cx, cy + rowH - 26, '现有膜只在环内相邻两带之间（membranePanel）', { size: 9.5, fill: MUTE, anchor: 'middle' }));
  }
  const H = 60 + rowH * 4 + 30;
  const g = [txt(40, 34, '图 2 · 几个单元之间的关系维度（用一对示范；绿 = 基准高度，蓝 = 抬高一级；紫字 = 要台架或几何扩展；红 = 范围外）', { size: 16, weight: 700 })];
  writeFileSync(join(OUT, 'dims.svg'), doc(W, H, g.concat(rows).join('\n')));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 图 3 · N × 关系矩阵：行 = 2 / 3 / 4 / 9，列 = 五种关系；每格平面 + 正立面
// ═══════════════════════════════════════════════════════════════════════════════
{
  const colW = 255;
  const rowH = 300;
  const x0 = 120;
  const y0 = 90;
  const g = [];
  g.push(txt(40, 34, '图 3 · 2 / 3 / 4 / 9 个单元 × 五种关系（默认形态阶梯方箱；每格上 = 平面，下 = 正立面；着色 = 高度级）', { size: 16, weight: 700 }));
  g.push(txt(40, 54, `间距全部由关系推出：分离 = Lab.12 格距 · 相切 = 平台边贴边 · 交叠 = 平台外缘顶到邻居芯带（同高的对角对仍只许贴边）。高差用 lead 量程 ${fmtM(LEVEL_RANGE_PX)} 等分。`, { size: 10.5, fill: MUTE }));
  CLUSTER_RELATIONS.forEach((rel, c) => {
    g.push(txt(x0 + c * colW + colW / 2, y0 - 12, rel.label, { size: 12, weight: 600, anchor: 'middle' }));
  });
  const FI = 3;
  CLUSTER_PLANS.forEach((plan, r) => {
    const cy = y0 + r * rowH;
    g.push(txt(40, cy + 20, plan.label, { size: 13, weight: 700 }));
    g.push(txt(40, cy + 38, `${plan.n} 个单元`, { size: 10.5, fill: MUTE }));
    CLUSTER_RELATIONS.forEach((rel, c) => {
      const cx = x0 + c * colW + colW / 2;
      let fi = FI;
      let note = '';
      if (rel.key === 'overlap' && !overlapFeasible(plan.key, fi)) {
        // 方箱装不下就换直挑台画，并标出来
        fi = 2;
        note = '方箱装不下（三级高差 44 < 77+6）→ 以直挑台画';
      }
      const cells = clusterCells(plan.key, rel.key, fi, R);
      const lv = clusterLevels(plan.key, rel.key);
      const leads = clusterLeads(clusterLevelCount(plan.key, rel.key));
      const met = clusterMetrics(plan.key, rel.key, fi, R);
      const f = UNIT_FORMS[fi];
      // 比例：让最大的簇（九宫分离）装进格子
      const scP = plan.n === 9 ? 0.135 : plan.n === 4 ? 0.2 : 0.24;
      const pcy = cy + 96;
      // 平面：先画低的再画高的（高的盖在上面）
      const order = cells.map((_, i) => i).sort((a, b) => lv[a] - lv[b]);
      for (const i of order) g.push(unitPlan(cx + cells[i].x * scP, pcy + cells[i].z * scP, scP, f, lv[i]));
      // 正立面：沿 z 由远到近画，远的淡
      const scE = 0.2;
      const oy = cy + 232 - ROOM.FLOOR_Y * scE; // 地面线落在 cy+232，读数在它下面
      const eOrder = cells.map((_, i) => i).sort((a, b) => cells[a].z - cells[b].z);
      const zs = cells.map((cc) => cc.z);
      const zMin = Math.min(...zs);
      const zMax = Math.max(...zs);
      g.push(line(cx - 118, oy + ROOM.FLOOR_Y * scE, cx + 118, oy + ROOM.FLOOR_Y * scE, { stroke: INK, w: 0.8 }));
      for (const i of eOrder) {
        const t = zMax > zMin ? (cells[i].z - zMin) / (zMax - zMin) : 1;
        g.push(unitElevation(g, cx + cells[i].x * scE, oy, scE, runs[fi], leads[lv[i]], { stroke: LEVEL_COL[lv[i] % LEVEL_COL.length], opacity: 0.35 + 0.65 * t, railDash: '2 3', w: 0.9 }));
      }
      // 读数
      const lines = [
        `芯心距 ${fmtM(clusterPitch(plan.key, rel.key, fi, R))} · 平台 ⌀${met.platformM.toFixed(2)} m`,
        met.levels > 1 ? `${met.levels} 级 · 每级高差 ≥ ${met.stepM.toFixed(2)} m` : '齐平',
        met.overlapM > 1e-6 ? `平台盖过去 ${met.overlapM.toFixed(2)} m` : met.overlapM < -1e-6 ? `空地 ${(-met.overlapM).toFixed(2)} m` : '边贴边',
      ];
      lines.forEach((s, k) => g.push(txt(cx, cy + 248 + k * 13, s, { size: 9.5, fill: MUTE, anchor: 'middle' })));
      if (note) g.push(txt(cx, cy + 248 + 3 * 13, note, { size: 9, fill: RED, anchor: 'middle' }));
    });
  });
  // 交叠可行性矩阵附注
  const fy = y0 + 4 * rowH + 8;
  g.push(txt(40, fy, '交叠可行性（高差 ≥ 折叠体成形期跨度 + 6）：', { size: 11, weight: 600 }));
  const names = { pocket: '袋', bulb: '蘑菇', ledge: '直挑台', stepped: '方箱' };
  CLUSTER_PLANS.forEach((plan, i) => {
    const s = UNIT_FORMS.map((u, k) => `${names[u.key]} ${overlapFeasible(plan.key, k) ? '✓' : '✗'}`).join('  ');
    g.push(txt(300 + i * 250, fy, `${plan.zh}：${s}`, { size: 10.5 }));
  });
  const H = fy + 40;
  writeFileSync(join(OUT, 'matrix.svg'), doc(x0 + 5 * colW + 20, H, g.join('\n')));
}
console.log(`→ ${OUT}/unit.svg dims.svg matrix.svg`);
