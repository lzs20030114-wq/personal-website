// 线稿：单元组合（Lab 2-11 · 用户 2026-09-20 纠偏后的读法「同一种平台一圈起伏、几个单元首尾相接、接缝处接高接低」
// + 三张图形 ① 坡降 ② 升台 ③ 合腔 + 方单元版本）。
//
// 纪律：先线稿、看图、拍板，再上 3D。几何**整套查站上模块**（src/lib/space/unit-combo.ts：预设 / 相位 / 高度段 /
// 缝口朝向 / 站位 / 接缝读数），不另写一份——追加图形进 COMBO_PLANS 后跑一遍本脚本就是它的线稿。
// 剖面是真引擎终态（每族：起伏形态一条 + 捏分缝口 j0 / 整块 j9 各一条），起伏 = 形状纯平移。
// 用法： npx vite-node scripts/unit-combo/wave-draft.mjs <outDir> [round|square，默认两族都画]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { RING } from '../../src/lib/space/skin-ring.ts';
import { FIGURE, MM_PER_UNIT, RIG_ANCHOR_Y, RIG_SCALE, ROOM } from '../../src/lib/space/skin-grid.ts';
import { buildSplitRingUnits, SPLIT_RING_TIERS } from '../../src/lib/space/skin-split-ring.ts';
import { buildSquareUnits } from '../../src/lib/space/skin-square.ts';
import { SQSPLIT_TIERS, buildSquareSplitUnits } from '../../src/lib/space/skin-square-split.ts';
import {
  COMBO_DEFAULT_FORM, COMBO_FLOOR_M, COMBO_PLANS, comboFamily, comboForms, comboJoints, comboMetrics,
  comboPositions, comboReading, deckAt, splitOrder, unitDeck, unitHalf, unitLeads,
} from '../../src/lib/space/unit-combo.ts';

const OUT = process.argv[2] ?? 'wave-out';
const ONLY = process.argv[3];
mkdirSync(OUT, { recursive: true });
const R = RING.RADIUS_DEF;
const N = RING.COUNT;
const FORM = COMBO_DEFAULT_FORM;
const M = (px2d) => (px2d * RIG_SCALE * MM_PER_UNIT) / 1000;
const fmtM = (px2d) => `${M(px2d).toFixed(2)} m`;
const fmtCm = (px2d) => `${(M(px2d) * 100).toFixed(0)} cm`;

// ── 真引擎剖面 ──────────────────────────────────────────────────────────────────────
function profileOf(def) {
  const s = createSkinUnit(def.spec, def.opts);
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  const foot = s.py[s.n - 1];
  const pts = [];
  for (let i = 0; i < s.n; i++) pts.push([s.px[i] * 100, (s.py[i] - foot) * 100]);
  return pts;
}
const PROF = {};
function profiles(fam) {
  if (PROF[fam]) return PROF[fam];
  if (fam === 'round') {
    const rs = buildSplitRingUnits();
    PROF[fam] = {
      wave: profileOf(comboForms()[FORM]),
      splitFace: profileOf(rs[SPLIT_RING_TIERS.findIndex((t) => t.pair === 0)]),
      splitBack: profileOf(rs[SPLIT_RING_TIERS.findIndex((t) => t.pair === 9)]),
    };
  } else {
    const ss = buildSquareSplitUnits();
    PROF[fam] = {
      wave: profileOf(buildSquareUnits()[0]),
      splitFace: profileOf(ss[SQSPLIT_TIERS.findIndex((t) => t.pair === 0 && t.cls === 0)]),
      splitBack: profileOf(ss[SQSPLIT_TIERS.findIndex((t) => t.pair === 9 && t.cls === 0)]),
    };
  }
  return PROF[fam];
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
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size ?? 11}" fill="${o.fill ?? INK}" text-anchor="${o.anchor ?? 'start'}" font-weight="${o.weight ?? 400}">${esc(t)}</text>`;
const line = (x1, y1, x2, y2, o = {}) =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} stroke-linecap="round"/>`;
const circle = (cx, cy, r, o = {}) =>
  `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(0, r).toFixed(1)}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''}/>`;
const rect = (x, y, w, h, o = {}) =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''}/>`;
const poly = (pts, o = {}) =>
  `<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" stroke-linejoin="round" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''}/>`;
const dimV = (x, y1, y2, label, o = {}) =>
  [
    line(x, y1, x, y2, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    line(x - 4, y1, x + 4, y1, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    line(x - 4, y2, x + 4, y2, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    txt(x + 6, (y1 + y2) / 2 + 4, label, { size: 10, fill: o.stroke ?? MUTE }),
  ].join('');
const doc = (W, H, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,'PingFang SC','Noto Sans CJK SC',sans-serif">\n<rect width="${W}" height="${H}" fill="#fbfbf9"/>\n${body}\n</svg>`;

// ── 立面（相机在 +z）：立杆 + 左右两条真剖面 + 走面外缘绕一圈的高度带；捏分单元 = 缝口侧 j0、整块侧 j9 ──
function unitElevation(fam, u, cx0, oy, sc) {
  const P = profiles(fam);
  const F = comboFamily(fam);
  const half = unitHalf(fam, u, FORM);
  const W = (x) => cx0 + x * RIG_SCALE * sc;
  const Y = (h) => oy + (RIG_ANCHOR_Y - h * RIG_SCALE) * sc;
  const out = [line(cx0, oy, cx0, Y(0), { stroke: MUTE, w: 1.2 })];
  const rimR = half - R; // 外缘到芯带的距离（2D px）
  if (u.kind === 'wave') {
    const ul = unitLeads(u, fam);
    const shift = (i) => 2 * (F.centerLead - ul[i]);
    out.push(poly(P.wave.map(([x, h]) => [W(R + x), Y(h + shift(0))]), { stroke: INK, w: 1 }));
    out.push(poly(P.wave.map(([x, h]) => [W(-(R + x)), Y(h + shift(N / 2))]), { stroke: INK, w: 1 }));
    const rim = (from, to) => {
      const pts = [];
      for (let k = from; k <= to; k++) {
        const i = k % N;
        const a = F.angleOffset + (i / N) * Math.PI * 2;
        const d = deckAt(fam, FORM, ul[i]);
        pts.push([W((R + rimR) * Math.cos(a)), Y(d === null ? 0 : d)]);
      }
      return pts;
    };
    out.push(poly(rim(0, N / 2), { stroke: GREEN, w: 1.6 }));
    out.push(poly(rim(N / 2, N), { stroke: GREEN, w: 1.6, dash: '4 3' }));
  } else {
    const order = splitOrder(fam, u.face);
    const pairAt = (i) => (fam === 'round' ? SPLIT_RING_TIERS[order[i]].pair : SQSPLIT_TIERS[order[i]].pair);
    const side = (i, sign) => {
      const p = pairAt(i);
      const prof = p === 0 ? P.splitFace : p === 9 ? P.splitBack : null;
      if (prof) out.push(poly(prof.map(([x, h]) => [W(sign * (R + x)), Y(h)]), { stroke: PURPLE, w: 1 }));
    };
    side(0, 1);
    side(N / 2, -1);
    // 下板顶 / 上板底沿圈：缝口侧两条、整块侧一条（中间级不标）
    for (let i = 0; i < N; i++) {
      const p = pairAt(i);
      const a = F.angleOffset + (i / N) * Math.PI * 2;
      const x = W((R + rimR) * Math.cos(a));
      if (p === 0) {
        out.push(circle(x, Y(F.shelf.deck), 1.3, { fill: PURPLE, stroke: 'none' }));
        out.push(circle(x, Y(F.shelf.roof), 1.3, { fill: PURPLE, stroke: 'none' }));
      } else if (p === 9) out.push(circle(x, Y(F.shelf.block), 1.3, { fill: MUTE, stroke: 'none' }));
    }
  }
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
/** 平面（俯视，+z 向下）：圆环画圆、方环画方；起伏标峰 / 谷，捏分标缝口 */
function unitPlan(fam, u, cx, cy, sc) {
  const half = unitHalf(fam, u, FORM) * RIG_SCALE * sc;
  const col = u.kind === 'split' ? PURPLE : GREEN;
  const out = [circle(cx, cy, R * RIG_SCALE * sc, { stroke: MUTE, w: 0.8 })];
  if (fam === 'square') out.push(rect(cx - half, cy - half, 2 * half, 2 * half, { stroke: col, w: 1.2, fill: `${col}14` }));
  else out.push(circle(cx, cy, half, { stroke: col, w: 1.2, fill: `${col}14` }));
  const F = comboFamily(fam);
  const mark = (i, tag, c) => {
    const a = F.angleOffset + (i / N) * Math.PI * 2;
    const rr = half * 0.62;
    out.push(txt(cx + rr * Math.cos(a), cy + rr * Math.sin(a) + 4, tag, { size: 10, fill: c, weight: 700, anchor: 'middle' }));
  };
  if (u.kind === 'wave') {
    if (u.lo !== u.hi) {
      mark(u.crest, '峰', PURPLE);
      mark((u.crest + 10) % N, '谷', ORANGE);
    } else out.push(txt(cx, cy + 4, '平', { size: 10, fill: GREEN, weight: 700, anchor: 'middle' }));
  } else {
    mark(u.face, '缝口', PURPLE);
    mark((u.face + 10) % N, '整块', MUTE);
  }
  return out.join('');
}

function draw(fam) {
  const F = comboFamily(fam);
  const W = 1640;
  const rowH = 470;
  const H = 140 + rowH * COMBO_PLANS.length + 40;
  const g = [];
  const famZh = fam === 'round' ? '圆环' : '方环';
  g.push(txt(40, 44, `单元组合 · ${famZh}版 —— 三张图形 ① 坡降 ② 升台 ③ 合腔 + 五种接法（站上 Lab 2-11 的预设，真引擎剖面）`, { size: 20, weight: 700 }));
  g.push(txt(40, 66, `起伏量程 lead ${F.HIGH}–${F.LOW} = ${fmtM(2 * (F.LOW - F.HIGH))}（形状逐点不变只平移）。绿线 = 起伏单元走面外缘绕一圈的高度（实线近半圈、虚线远半圈）；紫线 = 捏分单元缝口侧（两片台）与整块侧的真剖面，紫点 = 缝口侧下板顶 / 上板底。相切摆放，装置 ×0.5、下缘离地 ${COMBO_FLOOR_M.toFixed(2)} m。`, { size: 11, fill: MUTE }));
  g.push(txt(40, 84, '每个起伏单元两个旋钮：相位（峰朝哪条带）· 高度段（用量程的哪一段）；捏分单元一个：缝口朝哪条带。接缝 = A 朝向 B 的带对 B 朝向 A 的带。', { size: 11, fill: MUTE }));
  const sc = 0.8;
  COMBO_PLANS.forEach((P, r) => {
    const oy = 130 + r * rowH;
    const m = comboMetrics(P, fam, FORM, R, 'touch');
    g.push(txt(40, oy - 6, `${P.label} · ${P.en} —— ${comboReading(P, fam, FORM, R, 'touch')}`, { size: 13, weight: 700 }));
    const ex = 60;
    const ew = 900;
    g.push(line(ex, oy + 16, ex + ew, oy + 16, { stroke: HAIR }));
    g.push(line(ex, oy + 16 + ROOM.FLOOR_Y * sc, ex + ew, oy + 16 + ROOM.FLOOR_Y * sc, { stroke: INK }));
    const pos = comboPositions(P, fam, FORM, R, 'touch');
    const cx0 = ex + ew / 2 - 80;
    const Y = (h) => oy + 16 + (RIG_ANCHOR_Y - h * RIG_SCALE) * sc;
    P.units.forEach((u, i) => {
      const cx = cx0 + pos[i] * RIG_SCALE * sc;
      g.push(unitElevation(fam, u, cx, oy + 16, sc));
      g.push(txt(cx, Y(-14) + 12, String.fromCharCode(65 + i), { size: 11, weight: 700, fill: MUTE, anchor: 'middle' }));
    });
    comboJoints(P, fam, FORM).forEach((j, k) => {
      const xj = cx0 + (pos[j.a] + unitHalf(fam, P.units[j.a], FORM)) * RIG_SCALE * sc;
      if (j.cavity) {
        g.push(txt(xj + 6, Y(F.shelf.roof) - 6, `腔接通 · 净空 ${fmtM(F.shelf.roof - F.shelf.deck)}`, { size: 9.5, fill: PURPLE, weight: 600 }));
        return;
      }
      if (j.deckA === null || j.deckB === null) return;
      const step = Math.abs(j.step);
      if (step > 1) g.push(dimV(xj + 14, Y(Math.max(j.deckA, j.deckB)), Y(Math.min(j.deckA, j.deckB)), `落差 ${fmtCm(step)}`, { stroke: RED }));
      else {
        const dy = k % 2 ? 16 : -8;
        g.push(line(xj, Y(j.deckA), xj, Y(j.deckA) + dy - (dy > 0 ? 10 : -2), { stroke: GREEN, w: 0.6 }));
        g.push(txt(xj + 6, Y(j.deckA) + dy, `接缝齐平 · 离地 ${(COMBO_FLOOR_M + M(j.deckA)).toFixed(2)} m`, { size: 9.5, fill: GREEN, weight: 600 }));
      }
    });
    const L = P.units.length - 1;
    const dl = unitDeck(fam, P.units[0], N / 2, FORM);
    const dr = unitDeck(fam, P.units[L], 0, FORM);
    if (dl !== null) g.push(txt(cx0 + (pos[0] - unitHalf(fam, P.units[0], FORM)) * RIG_SCALE * sc - 6, Y(dl) + 4, `${(COMBO_FLOOR_M + M(dl)).toFixed(2)} m`, { size: 9.5, fill: MUTE, anchor: 'end' }));
    if (dr !== null) g.push(txt(cx0 + (pos[L] + unitHalf(fam, P.units[L], FORM)) * RIG_SCALE * sc + 6, Y(dr) + 4, `${(COMBO_FLOOR_M + M(dr)).toFixed(2)} m`, { size: 9.5, fill: MUTE }));
    g.push(figureElevation(ex + ew - 40, oy + 16, sc));
    const px0 = 1040;
    g.push(txt(px0, oy + 16, '平面（俯视）· 峰 / 谷 / 缝口朝向', { size: 10, fill: MUTE }));
    const psc = 0.5;
    P.units.forEach((u, i) => g.push(unitPlan(fam, u, px0 + 90 + (pos[i] - pos[0]) * RIG_SCALE * psc, oy + 120, psc, u)));
    let ty = oy + 230;
    g.push(txt(px0, ty, `单元：${P.units.map((u) => (u.kind === 'wave' ? (u.lo === u.hi ? `平 ${Math.round(u.lo * 100)}%` : `起伏 峰在带 ${u.crest} · ${Math.round(u.lo * 100)}→${Math.round(u.hi * 100)}%`) : `捏分 缝口朝带 ${u.face}`)).join(' / ')}`, { size: 10.5 }));
    ty += 15;
    g.push(txt(px0, ty, `总长 ${m.lengthM.toFixed(2)} m · 接缝 ${m.joints} 条，齐平 ${m.levelJoints} 条${m.cavityJoints ? `，腔接通 ${m.cavityJoints} 条` : ''}`, { size: 10.5, fill: MUTE }));
  });
  writeFileSync(join(OUT, `combo-${fam}.svg`), doc(W, H, g.join('\n')));
  console.log('written', fam, COMBO_PLANS.map((p) => `${p.key}: ${comboReading(p, fam, FORM, R, 'touch')}`).join(' | '));
}
for (const fam of ONLY ? [ONLY] : ['round', 'square']) draw(fam);
