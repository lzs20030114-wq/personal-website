// 线稿图谱：人有朝向、有身体（Lab.14/15 的下一轮，2026-09-05 用户三问：视线只有约 180°、激发眼前的会
// 影响行进、身体有体积——现在会触发打到人的单元，要留出空间）。
// 把三件机制（视野扇形 / 让位距离 D：闸 + 洞 / 走动时的走廊）逐项加上去，画成只有线的图给用户拍板。
//
// 纪律（用户 2026-08-20 立）：先线稿、确认后再上台架。几何与模型**整套查站上模块**
// （src/lib/space/unit-activation.ts 的可选项 fov / clearance / lane），不另写一份。每格结果是真跑的。
// 用法： npx vite-node scripts/unit-activation/attention.mjs <outDir>
//   产出 shape.svg（人的形状：四种落痕形）· dwell.svg（驻留 20 s：机制 × 影响半径）· walk.svg（走动：三种行为 × 机制）
//   · body.svg（站在杆子里：现状驻留点与三种密度下的 D）以及同名 .html 包裹
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PATHS, PLAN, PlanSim, TraceField, aisleLines, dwellSpot, keepOut, nearestCrossing, nearestUnit, planLayout, runScenario, unitsUnderBody,
} from '../../src/lib/space/unit-activation.ts';

const OUT = process.argv[2] ?? 'attention-out';
mkdirSync(OUT, { recursive: true });
const L8 = planLayout(8);
const ROOM_M = L8.roomM;
const CLEAR = PLAN.CLEARANCE.def;

// ── SVG 小工具（与 atlas.mjs 同款）───────────────────────────────────────────
const INK = '#1a1c1a';
const MUTE = '#8a8f8a';
const HAIR = '#c9cdc9';
const GREEN = '#2f8f5b';
const PURPLE = '#6b4fbb';
const RED = '#b5473a';
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const txt = (x, y, t, o = {}) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size ?? 11}" fill="${o.fill ?? INK}" text-anchor="${o.anchor ?? 'start'}" font-weight="${o.weight ?? 400}" ${o.italic ? 'font-style="italic"' : ''}>${esc(t)}</text>`;
const line = (x1, y1, x2, y2, o = {}) =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} stroke-linecap="round" ${o.opacity !== undefined ? `opacity="${o.opacity}"` : ''}/>`;
const circle = (cx, cy, r, o = {}) =>
  `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(0, r).toFixed(2)}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} ${o.opacity !== undefined ? `opacity="${o.opacity}"` : ''}/>`;
const poly = (pts, o = {}) =>
  `<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" stroke-linejoin="round" stroke-linecap="round" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} ${o.opacity !== undefined ? `opacity="${o.opacity}"` : ''}/>`;
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? 'none'}" stroke-width="${o.w ?? 1}" ${o.opacity !== undefined ? `opacity="${o.opacity}"` : ''}/>`;
const dimH = (x1, x2, y, label, o = {}) =>
  [
    line(x1, y, x2, y, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    line(x1, y - 4, x1, y + 4, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    line(x2, y - 4, x2, y + 4, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    txt((x1 + x2) / 2, y - 4, label, { size: 10, fill: o.stroke ?? MUTE, anchor: 'middle' }),
  ].join('');
const doc = (W, H, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,'PingFang SC','Noto Sans CJK SC',sans-serif">\n<rect width="${W}" height="${H}" fill="#fbfbf9"/>\n${body}\n</svg>`;

// ── 平面画法（与 atlas.mjs 同款，加了「闸住的单元」）─────────────────────────
function room(L, ox, oy, sc, o = {}) {
  const h = (L.roomM / 2) * sc;
  const dw = (PLAN.DOOR_W / 2) * sc;
  const out = [];
  out.push(line(ox - h, oy - h, ox + h, oy - h, { stroke: INK, w: 1.2 }));
  out.push(line(ox - h, oy + h, ox + h, oy + h, { stroke: INK, w: 1.2 }));
  out.push(line(ox - h, oy - h, ox - h, oy - dw, { stroke: INK, w: 1.2 }));
  out.push(line(ox - h, oy + dw, ox - h, oy + h, { stroke: INK, w: 1.2 }));
  out.push(line(ox + h, oy - h, ox + h, oy - dw, { stroke: INK, w: 1.2 }));
  out.push(line(ox + h, oy + dw, ox + h, oy + h, { stroke: INK, w: 1.2 }));
  if (o.aisles) {
    const a = aisleLines(L);
    const fh = (L.fieldM / 2 + 0.15) * sc;
    for (const x of a.x) out.push(line(ox + x * sc, oy - fh, ox + x * sc, oy + fh, { stroke: HAIR, w: 0.6, dash: '2 3' }));
    for (const y of a.y) out.push(line(ox - fh, oy + y * sc, ox + fh, oy + y * sc, { stroke: HAIR, w: 0.6, dash: '2 3' }));
  }
  return out.join('');
}
function heat(field, ox, oy, sc, scale = 12) {
  const out = [];
  const cs = field.cell * sc;
  for (let idx = 0; idx < field.data.length; idx++) {
    const v = field.data[idx];
    if (v <= 1e-3) continue;
    const [x, y] = field.cellCenter(idx);
    const a = Math.min(0.8, 1 - Math.exp(-v / scale));
    out.push(rect(ox + x * sc - cs / 2, oy + y * sc - cs / 2, cs, cs, { fill: GREEN, opacity: Math.max(0.06, a) }));
  }
  return out.join('');
}
function units(sim, ox, oy, sc) {
  const out = [];
  const L = sim.layout;
  for (const u of L.units) {
    const cx = ox + u.x * sc;
    const cy = oy + u.y * sc;
    const gated = sim.blocked[u.i] === 1;
    out.push(circle(cx, cy, L.platR * sc, { stroke: gated ? RED : HAIR, w: gated ? 0.9 : 0.7, dash: gated ? '2 2' : undefined }));
    const d = sim.act.degree[u.i];
    if (d > 1e-6) {
      const r = (L.mastR + d * (L.platR - L.mastR)) * sc;
      out.push(circle(cx, cy, r, { fill: PURPLE, stroke: PURPLE, w: d >= 1 - 1e-9 ? 1.4 : 0.6, opacity: 0.2 + 0.55 * d }));
    }
    out.push(circle(cx, cy, Math.max(1.2, L.mastR * sc), { fill: INK, stroke: 'none' }));
    if (gated) {
      const k = Math.max(2.2, L.mastR * sc * 1.2);
      out.push(line(cx - k, cy - k, cx + k, cy + k, { stroke: RED, w: 0.9 }));
      out.push(line(cx - k, cy + k, cx + k, cy - k, { stroke: RED, w: 0.9 }));
    }
  }
  return out.join('');
}
/** 人：身体 + 朝向 + 影响圈（视野半圆时画成扇形弧）+ 让位距离 D（红虚线） */
function person(sim, ox, oy, sc) {
  const w = sim.walker;
  if (!w.present) return '';
  const cx = ox + w.x * sc;
  const cy = oy + w.y * sc;
  const r = PLAN.BODY_R * sc;
  const out = [];
  const R = sim.reach * sc;
  if (sim.fov >= Math.PI * 2 - 1e-9) out.push(circle(cx, cy, R, { stroke: GREEN, w: 0.8, dash: '3 3' }));
  else {
    const a0 = w.heading - sim.fov / 2;
    const a1 = w.heading + sim.fov / 2;
    const pts = [[cx, cy]];
    for (let k = 0; k <= 24; k++) {
      const a = a0 + ((a1 - a0) * k) / 24;
      pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    pts.push([cx, cy]);
    out.push(poly(pts, { stroke: GREEN, w: 0.8, dash: '3 3' }));
  }
  if (sim.keepOutM > 0) out.push(circle(cx, cy, sim.keepOutM * sc, { stroke: RED, w: 0.7, dash: '2 2' }));
  out.push(circle(cx, cy, r, { fill: '#fbfbf9', stroke: INK, w: 1.2 }));
  out.push(line(cx, cy, cx + Math.cos(w.heading) * r, cy + Math.sin(w.heading) * r, { stroke: INK, w: 1.2 }));
  return out.join('');
}
function trail(sim, ox, oy, sc) {
  const pts = [];
  for (let k = 0; k < sim.trail.length; k += 2) pts.push([ox + sim.trail[k] * sc, oy + sim.trail[k + 1] * sc]);
  return pts.length > 1 ? poly(pts, { stroke: INK, w: 0.6, opacity: 0.5 }) : '';
}
const label = (sim) => {
  const s = sim.summary();
  const g = Array.from(sim.blocked).filter(Boolean).length;
  return { text: `成形 ${s.formed.length} · 半成以上 ${s.half} · 最高读数 ${s.maxInput.toFixed(1)} s${g ? ` · 闸住 ${g}` : ''}`, hot: s.formed.length > 0 || s.half > 0 };
};

/** 机制逐项加的四档 */
const LEVELS = [
  { key: 'old', name: '现状：全圆', note: '身周一圈都记', opts: {} },
  { key: 'fov', name: '＋视野 180°', note: '只记朝向前方的半圆', opts: { fov: Math.PI } },
  { key: 'clear', name: '＋让位 D', note: 'D 以内不记；芯在 D 以内的单元闸住', opts: { fov: Math.PI, clearance: CLEAR } },
  { key: 'lane', name: '＋走动走廊', note: '走着时正前方一条道也不记', opts: { fov: Math.PI, clearance: CLEAR, lane: true } },
];

/** 驻留在过道交叉点（不是单元中心——那里是根杆子）：站到 DWELL_S 末、人还在场 */
function dwellAtCrossing(opts, moment = 'standing') {
  const sim = new PlanSim({ path: 'free', ...opts });
  const L = sim.layout;
  const c = nearestCrossing(L, -L.pitch4 / 2, -L.pitch4 / 2);
  sim.walker.setRoute([{ x: L.doors[0].x, y: 0 }, { x: c.x, y: c.y, dwell: PLAN.DWELL_S }, { x: L.doors[1].x, y: 0, exit: true }]);
  if (moment === 'standing') {
    while (sim.walker.state !== 'dwell' && sim.t < 60) sim.step(0.05);
    for (let k = 0; k < PLAN.DWELL_S / 0.05 - 1; k++) sim.step(0.05);
  } else {
    while (sim.exitedAt === null && sim.t < 200) sim.step(0.05);
  }
  return sim;
}

// ── 图一：人的形状——四种落痕形，按真尺画在 8×8 的单元之间 ──────────────────────
{
  const W = 1360;
  const H = 640;
  const out = [];
  const D8 = keepOut(L8, CLEAR);
  out.push(txt(28, 34, '人有朝向、有身体 · 痕迹落在哪：四档机制逐项加上去（8×8，真尺）', { size: 16, weight: 700 }));
  out.push(txt(28, 54, `绿格 = 人站/走 1 秒在地面上记下的存在 · 红虚线圈 = 让位距离 D = 平台半径 ${L8.platR.toFixed(2)} + 身体 ${PLAN.BODY_R} + 让位 ${CLEAR} = ${D8.toFixed(2)} m · 红 × = 闸住的单元（芯在 D 以内，平台下来会打到人）`, { size: 11, fill: MUTE }));
  const sc = 120;
  const y0 = 330;
  LEVELS.forEach((lv, k) => {
    const ox = 190 + k * 320;
    const sim = new PlanSim({ path: 'free', grid: 8, ...lv.opts, reach: 1.3 });
    const L = sim.layout;
    const c = nearestCrossing(L, -L.pitch4 / 2, -L.pitch4 / 2);
    // 走廊那档画「走着」：让人真的走一小步（朝 +x），其余画「站着」
    sim.walker.setRoute([{ x: c.x - (lv.key === 'lane' ? 0.06 : 0), y: c.y }, { x: c.x + 3, y: c.y }]);
    if (lv.key === 'lane') sim.step(0.05); // 走了一子步：朝向 +x，处于走动态
    else {
      sim.walker.heading = 0;
      sim.walker.state = 'idle';
      sim.walker.x = c.x;
      sim.walker.y = c.y;
    }
    sim.field.clear();
    // 只记这一秒（不衰减）：直接调落痕，读出形状
    const hole = sim.keepOutM;
    const moving = lv.key === 'lane';
    sim.field.imprintShaped(sim.walker.x, sim.walker.y, sim.reach, 1, sim.walker.heading, sim.fov, hole, sim.lane && moving ? hole : 0);
    sim.act.update(new Float64Array(L.units.length), Infinity, null);
    // 闸：按当前位置现算
    if (sim.clearance !== null) {
      const lim = keepOut(L, sim.clearance);
      for (const u of L.units) sim.blocked[u.i] = Math.hypot(u.x - sim.walker.x, u.y - sim.walker.y) < lim ? 1 : 0;
    }
    out.push(txt(ox, 92, lv.name, { size: 13, weight: 700, anchor: 'middle' }));
    out.push(txt(ox, 108, lv.note, { size: 10.5, fill: MUTE, anchor: 'middle' }));
    // 视窗：以人为中心 ±1.45 m
    const half = 1.45 * sc;
    const px = ox;
    const py = y0;
    const cx0 = sim.walker.x;
    const cy0 = sim.walker.y;
    out.push(`<clipPath id="clip${k}"><rect x="${(px - half).toFixed(1)}" y="${(py - half).toFixed(1)}" width="${(2 * half).toFixed(1)}" height="${(2 * half).toFixed(1)}"/></clipPath>`);
    out.push(`<g clip-path="url(#clip${k})">`);
    const oxw = px - cx0 * sc;
    const oyw = py - cy0 * sc;
    const a = aisleLines(L);
    for (const x of a.x) out.push(line(oxw + x * sc, py - half, oxw + x * sc, py + half, { stroke: HAIR, w: 0.6, dash: '2 3' }));
    for (const y of a.y) out.push(line(px - half, oyw + y * sc, px + half, oyw + y * sc, { stroke: HAIR, w: 0.6, dash: '2 3' }));
    out.push(heat(sim.field, oxw, oyw, sc, 0.9));
    out.push(units(sim, oxw, oyw, sc));
    out.push(person(sim, oxw, oyw, sc));
    out.push('</g>');
    out.push(rect(px - half, py - half, 2 * half, 2 * half, { stroke: HAIR, w: 0.8 }));
    const cells = Array.from(sim.field.data).filter((v) => v > 0).length;
    const g = Array.from(sim.blocked).filter(Boolean).length;
    out.push(txt(ox, y0 + half + 18, `记到 ${cells} 块地面（${(cells * PLAN.CELL * PLAN.CELL).toFixed(2)} m²）${g ? ` · 闸住 ${g} 个单元` : ''}`, { size: 10.5, anchor: 'middle', fill: g ? RED : INK }));
    if (k === 0) out.push(dimH(px - PLAN.BODY_R * sc, px + PLAN.BODY_R * sc, py - half + 16, `身体 ⌀ ${(2 * PLAN.BODY_R).toFixed(2)}`));
    if (k === 2) out.push(dimH(px, px + D8 * sc, py - half + 16, `D ${D8.toFixed(2)} m`, { stroke: RED }));
    if (k === 3) out.push(dimH(px - D8 * sc, px + D8 * sc, py - half + 16, `走廊宽 2D = ${(2 * D8).toFixed(2)} m`, { stroke: RED }));
  });
  out.push(txt(28, 545, `这一图影响半径取 1.3 m（不是现行默认 1.0）：让位一开，D 以内的地面不再记，1.0 m 的圈只剩 0.62–1.0 那道窄环，一个单元的脚下地面盖不满——见图二。`, { size: 10.5 }));
  out.push(txt(28, 565, `视野半圆的朝向 = 最近一次走的方向（站着时沿用）；作者行为层另有「视线方向」变量，这里先让视线 = 朝向。走动的判据 = 这一子步位置动了（预设按步速走、拖着按指针给，同一判据）。`, { size: 10.5, fill: MUTE }));
  out.push(txt(28, 585, `闸与洞用的是同一个 D：闸挡的是「平台会打到人的单元」，洞挡的是「那些单元脚下的地面」——洞不按单元格切（地面是无关单元的），所以 D 圈边上会有格子归了被闸的单元、也有格子归了没被闸的单元。`, { size: 10.5, fill: MUTE }));
  out.push(txt(28, 605, `已成形的单元是障碍物；人绕不绕它走是作者行为层的规则，这里的行走不避让（局限）。`, { size: 10.5, fill: MUTE }));
  writeFileSync(join(OUT, 'shape.svg'), doc(W, H, out.join('\n')));
}

// ── 图二：驻留 20 s——机制 × 影响半径（8×8，站在过道交叉点，人还站着那一刻）───────
{
  const REACHES = [1.0, 1.3, 1.6];
  const sc = 30;
  const cell = ROOM_M * sc + 34;
  const left = 150;
  const top = 120;
  const W = left + LEVELS.length * cell + 20;
  const H = top + REACHES.length * (cell + 22) + 70;
  const out = [];
  out.push(txt(28, 34, `驻留 ${PLAN.DWELL_S} s · 机制逐项加 × 影响半径：站着的那一刻，前面长出什么（8×8，阈值 ${PLAN.THRESHOLD} s，锁定档）`, { size: 16, weight: 700 }));
  out.push(txt(28, 54, '人站在过道交叉点（现行预设站在单元中心——那里是根杆子，见图四），朝向 = 进门时的走向。绿 = 地面存在·秒 · 紫 = 激活程度 · 红 × = 此刻闸住的单元', { size: 11, fill: MUTE }));
  out.push(txt(28, 72, `让位一开，影响半径 1.0 m 只剩 D（${keepOut(L8, CLEAR).toFixed(2)}）到 1.0 那道窄环，一个单元也盖不满；1.3 m 起前方长出一道弧，1.6 m 弧更宽。视野与让位一起 = 「一道朝前的弧，弧到身体隔一肘加半个平台」。`, { size: 11, fill: MUTE }));
  out.push(txt(28, 90, '影响半径在这一轮是「看到多远」不是「存在多远」——Hall 社交距离近相 1.2–2.1 m；建议这一档量程放到 2.0，默认 1.5（待拍板）。', { size: 11, fill: MUTE }));
  LEVELS.forEach((lv, k) => out.push(txt(left + k * cell + cell / 2 - 17, top - 12, lv.name, { size: 12, weight: 700, anchor: 'middle' })));
  REACHES.forEach((rm, r) => {
    const oy = top + r * (cell + 22) + cell / 2;
    out.push(txt(28, oy - 4, `影响半径 ${rm.toFixed(1)} m`, { size: 12, weight: 700 }));
    LEVELS.forEach((lv, k) => {
      const ox = left + k * cell + cell / 2 - 17;
      const sim = dwellAtCrossing({ grid: 8, reach: rm, ...lv.opts }, 'standing');
      out.push(room(sim.layout, ox, oy, sc, { aisles: true }));
      out.push(heat(sim.field, ox, oy, sc));
      out.push(trail(sim, ox, oy, sc));
      out.push(units(sim, ox, oy, sc));
      out.push(person(sim, ox, oy, sc));
      const lb = label(sim);
      out.push(txt(ox, oy + (ROOM_M / 2) * sc + 14, lb.text, { size: 9.5, fill: lb.hot ? PURPLE : MUTE, anchor: 'middle', weight: lb.hot ? 700 : 400 }));
    });
  });
  out.push(txt(28, H - 26, '锁定档下人走后闸松开：被闸的单元脚下若还有 D 圈外的痕迹，会在人离开后长起来（「身后合拢」）；跟随档下痕迹几秒就退光、不会。哪种对是作者的问题，两档都留。', { size: 10.5, fill: MUTE }));
  writeFileSync(join(OUT, 'dwell.svg'), doc(W, H, out.join('\n')));
}

// ── 图三：走动——三种行为 × 机制（8×8，影响半径 1.6），走完那一刻 ─────────────────
{
  const rows = ['through', 'pace', 'loop'].map((k) => PATHS.find((p) => p.key === k));
  const REACH = 1.6;
  const sc = 30;
  const cell = ROOM_M * sc + 34;
  const left = 150;
  const top = 110;
  const W = left + LEVELS.length * cell + 20;
  const H = top + rows.length * (cell + 22) + 60;
  const out = [];
  out.push(txt(28, 34, `走动 · 三种行为 × 机制逐项加：走廊留不留（8×8，影响半径 ${REACH} m，阈值 ${PLAN.THRESHOLD} s，锁定档）`, { size: 16, weight: 700 }));
  out.push(txt(28, 54, '每格 = 人离场那一刻。视野一开，痕迹只落在前方、身后不再补记，折返/绕圈的读数掉一半；走廊一开，路的正中一条 2D 宽的道不落痕迹，结构只长在路两侧。', { size: 11, fill: MUTE }));
  out.push(txt(28, 72, '走过留痕本来就攒不到阈值（Lab.14 线稿的结论），这里看的是**形**：绿的落在哪、道留没留出来。', { size: 11, fill: MUTE }));
  LEVELS.forEach((lv, k) => out.push(txt(left + k * cell + cell / 2 - 17, top - 12, lv.name, { size: 12, weight: 700, anchor: 'middle' })));
  rows.forEach((p, r) => {
    const oy = top + r * (cell + 22) + cell / 2;
    out.push(txt(28, oy - 4, `${p.zh} · ${p.en}`, { size: 12, weight: 700 }));
    out.push(txt(28, oy + 12, `在场 ${runScenario({ path: p.key, grid: 8 }, 0).summary().presentTime.toFixed(0)} s`, { size: 9.5, fill: MUTE }));
    LEVELS.forEach((lv, k) => {
      const ox = left + k * cell + cell / 2 - 17;
      const sim = runScenario({ path: p.key, grid: 8, reach: REACH, ...lv.opts }, 0);
      out.push(room(sim.layout, ox, oy, sc, { aisles: true }));
      out.push(heat(sim.field, ox, oy, sc));
      out.push(trail(sim, ox, oy, sc));
      out.push(units(sim, ox, oy, sc));
      const lb = label(sim);
      out.push(txt(ox, oy + (ROOM_M / 2) * sc + 14, lb.text, { size: 9.5, fill: lb.hot ? PURPLE : MUTE, anchor: 'middle', weight: lb.hot ? 700 : 400 }));
    });
  });
  out.push(txt(28, H - 26, '斜穿预设从单元中心到单元中心、穿过杆子——与驻留点同一个问题（图四）；走廊机制只管痕迹落哪，不管路线绕不绕杆子。', { size: 10.5, fill: MUTE }));
  writeFileSync(join(OUT, 'walk.svg'), doc(W, H, out.join('\n')));
}

// ── 图四：站在杆子里——现行驻留点与三种密度下的让位距离 D ───────────────────────
{
  const W = 1360;
  const H = 520;
  const out = [];
  out.push(txt(28, 34, '身体有体积 · 原驻留点站在单元中心（那里是根杆子，09-05 已改走过道）；让位距离 D 随单元大小变，影响半径必须大于 D 才有地面可招', { size: 16, weight: 700 }));
  out.push(txt(28, 54, '左三格：原预设的驻留点（灰人）与现行站位（过道交叉点，黑人），三种密度按真尺。右表：D 与影响半径的关系。', { size: 11, fill: MUTE }));
  const sc = 110;
  const y = 250;
  PLAN.GRIDS.forEach((n, k) => {
    const L = planLayout(n);
    const ox = 170 + k * 300;
    const u = nearestUnit(L, -L.pitch4 / 2, -L.pitch4 / 2); // 09-05 之前的驻留点
    const c = dwellSpot(L);
    const D = keepOut(L, CLEAR);
    // 视窗以两点中点为中心
    const mx = (u.x + c.x) / 2;
    const my = (u.y + c.y) / 2;
    const half = Math.max(1.0, Math.abs(u.x - c.x) / 2 + 0.9) * sc;
    out.push(`<clipPath id="bclip${k}"><rect x="${(ox - half).toFixed(1)}" y="${(y - half).toFixed(1)}" width="${(2 * half).toFixed(1)}" height="${(2 * half).toFixed(1)}"/></clipPath>`);
    out.push(`<g clip-path="url(#bclip${k})">`);
    const oxw = ox - mx * sc;
    const oyw = y - my * sc;
    const a = aisleLines(L);
    for (const x of a.x) out.push(line(oxw + x * sc, y - half, oxw + x * sc, y + half, { stroke: HAIR, w: 0.6, dash: '2 3' }));
    for (const yy of a.y) out.push(line(ox - half, oyw + yy * sc, ox + half, oyw + yy * sc, { stroke: HAIR, w: 0.6, dash: '2 3' }));
    for (const v of L.units) {
      out.push(circle(oxw + v.x * sc, oyw + v.y * sc, L.platR * sc, { stroke: HAIR, w: 0.7 }));
      out.push(circle(oxw + v.x * sc, oyw + v.y * sc, L.mastR * sc, { fill: INK, stroke: 'none' }));
    }
    // 灰人：现行驻留点
    out.push(circle(oxw + u.x * sc, oyw + u.y * sc, PLAN.BODY_R * sc, { stroke: MUTE, w: 1.2, dash: '3 2' }));
    out.push(txt(oxw + u.x * sc, oyw + u.y * sc + PLAN.BODY_R * sc + 12, `原驻留点：单元中心`, { size: 9.5, fill: MUTE, anchor: 'middle' }));
    out.push(txt(oxw + u.x * sc, oyw + u.y * sc + PLAN.BODY_R * sc + 24, `（杆子在身体里）`, { size: 9.5, fill: MUTE, anchor: 'middle' }));
    out.push(txt(oxw + c.x * sc, oyw + c.y * sc - D * sc - 5, `现行：过道交叉点`, { size: 9.5, fill: INK, anchor: 'middle' }));
    // 黑人：过道交叉点 + D
    out.push(circle(oxw + c.x * sc, oyw + c.y * sc, D * sc, { stroke: RED, w: 0.8, dash: '2 2' }));
    out.push(circle(oxw + c.x * sc, oyw + c.y * sc, PLAN.BODY_R * sc, { fill: '#fbfbf9', stroke: INK, w: 1.2 }));
    out.push(line(oxw + c.x * sc, oyw + c.y * sc, oxw + c.x * sc + PLAN.BODY_R * sc, oyw + c.y * sc, { stroke: INK, w: 1.2 }));
    out.push('</g>');
    out.push(rect(ox - half, y - half, 2 * half, 2 * half, { stroke: HAIR, w: 0.8 }));
    out.push(txt(ox, 90, `${n}×${n} · 格距 ${L.pitchM.toFixed(2)} m · 平台 ⌀ ${(2 * L.platR).toFixed(2)}`, { size: 12, weight: 700, anchor: 'middle' }));
    out.push(txt(ox, y + half + 18, `D = ${L.platR.toFixed(2)} + ${PLAN.BODY_R} + ${CLEAR} = ${D.toFixed(2)} m · 站在交叉点时闸住 4 个`, { size: 10.5, anchor: 'middle', fill: RED }));
    out.push(txt(ox, y + half + 34, `原驻留点身体里有 ${unitsUnderBody(L, u.x, u.y).length} 根杆子 · 交叉点 ${unitsUnderBody(L, c.x, c.y).length} 根`, { size: 10.5, anchor: 'middle', fill: MUTE }));
  });
  // 右：D vs 影响半径小表
  const tx = 1080;
  out.push(txt(tx, 100, '影响半径 − D = 能招结构的那道环有多宽', { size: 11, weight: 700 }));
  const rows = [['', '4×4', '6×6', '8×8']];
  for (const rm of [1.0, 1.3, 1.6, 2.0]) rows.push([`半径 ${rm.toFixed(1)}`, ...PLAN.GRIDS.map((n) => (rm - keepOut(planLayout(n), CLEAR)).toFixed(2))]);
  rows.forEach((r, i) => {
    r.forEach((cell, j) => {
      const v = j > 0 && i > 0 ? Number(cell) : null;
      out.push(txt(tx + j * 62, 124 + i * 20, j > 0 && i > 0 ? (v <= 0 ? '—' : `${cell} m`) : cell, { size: 10.5, fill: v !== null && v < 0.4 ? MUTE : INK, weight: i === 0 || j === 0 ? 700 : 400 }));
    });
  });
  out.push(txt(tx, 240, '— = 半径不到 D，什么也招不到', { size: 10, fill: MUTE }));
  out.push(txt(tx, 256, '窄于 0.4 m 的环盖不满一个 8×8 的格', { size: 10, fill: MUTE }));
  out.push(txt(tx, 272, '（格边 0.6）——灰字', { size: 10, fill: MUTE }));
  out.push(txt(28, 440, '建议：① 驻留预设改站过道交叉点（斜穿预设同理改走过道）；② 让位默认 0.15 m（一肘）做成 0–0.4 的滑块；③ 影响半径量程 0.22–1.2 → 0.22–2.0，这一档默认 1.5；', { size: 10.5 }));
  out.push(txt(28, 460, '④ 视野默认 180°、可调 60°–360°（360° = 现状）；⑤ 走廊随让位一起开。四个数全部待拍板；台架接线在拍板后做，Lab.14 与 Lab.15 一起。', { size: 10.5 }));
  out.push(txt(28, 490, '没做的：视线 ≠ 朝向（转头看）、行走绕开已成形的单元、猫——都是作者行为层的规则。', { size: 10.5, fill: MUTE }));
  writeFileSync(join(OUT, 'body.svg'), doc(W, H, out.join('\n')));
}

for (const f of ['shape', 'dwell', 'walk', 'body']) {
  const svg = readFileSync(join(OUT, `${f}.svg`), 'utf8');
  writeFileSync(join(OUT, `${f}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fbfbf9}svg{display:block}</style></head><body>${svg}</body></html>`);
}
console.log(`wrote ${OUT}/shape.svg dwell.svg walk.svg body.svg (+ .html wrappers)`);
