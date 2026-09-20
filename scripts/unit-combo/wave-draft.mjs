// 线稿：起伏平台首尾相接（Lab 2-11 · 用户 2026-09-20 纠偏后的读法「假如我们就用平台，然后选择做一圈起伏……
// 是不是有存在前后两个单元可以实现首尾相接一高一低的」，并确认「这个思路是对的」）。
//
// 纪律：先线稿、看图、拍板，再上 3D。几何**整套查站上模块**（src/lib/space/unit-combo.ts：预设 / 相位 / 高度段 /
// 站位 / 接缝读数），不另写一份——用户的图形追加进 COMBO_PLANS 后，跑一遍本脚本就是它的线稿。
// 剖面是真引擎终态（所选形态跑一遍），起伏 = 形状纯平移（skin-ring 起伏编制守门过的那条）。
// 用法： npx vite-node scripts/unit-combo/wave-draft.mjs <outDir> [形态下标，默认 2 = 直挑台]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { RING, RING_LEAD } from '../../src/lib/space/skin-ring.ts';
import { FIGURE, MM_PER_UNIT, RIG_ANCHOR_Y, RIG_SCALE, ROOM } from '../../src/lib/space/skin-grid.ts';
import { UNIT_FORMS } from '../../src/lib/space/unit-cluster.ts';
import {
  COMBO_FLOOR_M, COMBO_LEAD, COMBO_PLANS, COMBO_RANGE_PX,
  comboForms, comboJoints, comboMetrics, comboPositions, comboReading, deckAt, unitLeads,
} from '../../src/lib/space/unit-combo.ts';

const OUT = process.argv[2] ?? 'wave-out';
const FORM = Number(process.argv[3] ?? 2);
mkdirSync(OUT, { recursive: true });
const R = RING.RADIUS_DEF;
const N = RING.COUNT;
const M = (px2d) => (px2d * RIG_SCALE * MM_PER_UNIT) / 1000;
const fmtM = (px2d) => `${M(px2d).toFixed(2)} m`;
const fmtCm = (px2d) => `${(M(px2d) * 100).toFixed(0)} cm`;

// ── 真引擎：所选形态跑到底（一条；起伏各级 = 同一形状沿带平移）──────────────────────────
const DEF = comboForms()[FORM];
const sim = createSkinUnit(DEF.spec, DEF.opts);
for (let k = 0; k < SKIN.STEPS; k++) sim.advance();
const foot = sim.py[sim.n - 1];
const PROFILE = [];
for (let i = 0; i < sim.n; i++) PROFILE.push([sim.px[i] * 100, (sim.py[i] - foot) * 100]);
const REACH = UNIT_FORMS[FORM].reach;

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

// ── 立面（相机在 +z 看 −z）：一个起伏环 = 立杆 + 左右两条真剖面（各按自己方位的 lead 平移）+ 平台外缘绕一圈的高度带 ──
// 方位约定同 skin-solid.placePoint：带 i 在 (cos a, sin a)，a = i·18°；0→10 那半圈在 +z（近，实线），10→20 在 −z（远，虚线）
function waveElevation(cx0, oy, sc, ul) {
  const W = (x) => cx0 + x * RIG_SCALE * sc;
  const Y = (h) => oy + (RIG_ANCHOR_Y - h * RIG_SCALE) * sc;
  const out = [line(cx0, oy, cx0, Y(0), { stroke: MUTE, w: 1.2 })];
  const shift = (i) => 2 * (RING_LEAD - ul[i]);
  out.push(poly(PROFILE.map(([x, h]) => [W(R + x), Y(h + shift(0))]), { stroke: INK, w: 1 }));
  out.push(poly(PROFILE.map(([x, h]) => [W(-(R + x)), Y(h + shift(N / 2))]), { stroke: INK, w: 1 }));
  const rim = (from, to) => {
    const pts = [];
    for (let k = from; k <= to; k++) {
      const i = k % N;
      const a = (i / N) * Math.PI * 2;
      const d = deckAt(FORM, ul[i]);
      pts.push([W((R + REACH) * Math.cos(a)), Y(d === null ? 0 : d)]);
    }
    return pts;
  };
  out.push(poly(rim(0, N / 2), { stroke: GREEN, w: 1.6 }));
  out.push(poly(rim(N / 2, N), { stroke: GREEN, w: 1.6, dash: '4 3' }));
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
/** 平面（俯视，+z 向下）：芯圆 + 外缘圆 + 峰 / 谷 */
function wavePlan(cx, cy, sc, ul) {
  const out = [circle(cx, cy, R * RIG_SCALE * sc, { stroke: MUTE, w: 0.8 }), circle(cx, cy, (R + REACH) * RIG_SCALE * sc, { stroke: GREEN, w: 1.2, fill: `${GREEN}14` })];
  let hi = 0;
  let lo = 0;
  ul.forEach((l, i) => {
    if (l < ul[hi]) hi = i;
    if (l > ul[lo]) lo = i;
  });
  for (const [i, tag, col] of [[hi, '峰', PURPLE], [lo, '谷', ORANGE]]) {
    const a = (i / N) * Math.PI * 2;
    const rr = (R + REACH * 0.6) * RIG_SCALE * sc;
    out.push(txt(cx + rr * Math.cos(a), cy + rr * Math.sin(a) + 4, tag, { size: 10, fill: col, weight: 700, anchor: 'middle' }));
  }
  return out.join('');
}

{
  const W = 1640;
  const rowH = 470;
  const H = 140 + rowH * COMBO_PLANS.length + 40;
  const g = [];
  g.push(txt(40, 44, `起伏平台首尾相接 —— ${DEF.zh} + 一圈起伏，几个单元挨着放，接缝处接高接低（站上 Lab 2-11 的预设）`, { size: 20, weight: 700 }));
  g.push(txt(40, 66, `单元 = Lab 2-5 圆筒环 · 一圈起伏（lead ${COMBO_LEAD.HIGH}–${COMBO_LEAD.LOW} = 量程 ${fmtM(COMBO_RANGE_PX)}，形状逐点不变只平移）。绿线 = 平台外缘绕一圈的高度（实线近半圈、虚线远半圈）；黑线 = 接缝那一侧与外侧两条带的真剖面。相切摆放，装置 ×0.5、下缘离地 ${COMBO_FLOOR_M.toFixed(2)} m。`, { size: 11, fill: MUTE }));
  g.push(txt(40, 84, '每个单元两个旋钮：相位（峰朝哪条带）· 高度段（用量程的哪一段）。接缝 = A 朝向 B 的带对 B 朝向 A 的带，两家在那里各是什么高度，就是「接高接低」。', { size: 11, fill: MUTE }));
  const sc = 0.8;
  COMBO_PLANS.forEach((P, r) => {
    const oy = 130 + r * rowH;
    const m = comboMetrics(P, FORM, R, 'touch');
    g.push(txt(40, oy - 6, `${P.zh} · ${P.en} —— ${comboReading(P, FORM, R, 'touch')}`, { size: 13, weight: 700 }));
    const ex = 60;
    const ew = 900;
    g.push(line(ex, oy + 16, ex + ew, oy + 16, { stroke: HAIR }));
    g.push(line(ex, oy + 16 + ROOM.FLOOR_Y * sc, ex + ew, oy + 16 + ROOM.FLOOR_Y * sc, { stroke: INK }));
    const pos = comboPositions(P, FORM, R, 'touch');
    const cx0 = ex + ew / 2 - 80;
    const Y = (h) => oy + 16 + (RIG_ANCHOR_Y - h * RIG_SCALE) * sc;
    const leadsOf = P.units.map((u) => unitLeads(u));
    P.units.forEach((u, i) => {
      const cx = cx0 + pos[i].x * RIG_SCALE * sc;
      g.push(waveElevation(cx, oy + 16, sc, leadsOf[i]));
      g.push(txt(cx, Y(-14) + 12, String.fromCharCode(65 + i), { size: 11, weight: 700, fill: MUTE, anchor: 'middle' }));
    });
    comboJoints(P, FORM).forEach((j, k) => {
      if (j.deckA === null || j.deckB === null) return;
      const xj = cx0 + (pos[j.a].x + R + REACH) * RIG_SCALE * sc;
      const step = Math.abs(j.step);
      if (step > 1) g.push(dimV(xj + 14, Y(Math.max(j.deckA, j.deckB)), Y(Math.min(j.deckA, j.deckB)), `落差 ${fmtCm(step)}`, { stroke: RED }));
      else {
        const dy = k % 2 ? 16 : -8;
        g.push(line(xj, Y(j.deckA), xj, Y(j.deckA) + dy - (dy > 0 ? 10 : -2), { stroke: GREEN, w: 0.6 }));
        g.push(txt(xj + 6, Y(j.deckA) + dy, `接缝齐平 · 离地 ${(COMBO_FLOOR_M + M(j.deckA)).toFixed(2)} m`, { size: 9.5, fill: GREEN, weight: 600 }));
      }
    });
    if (m.lowM !== null) {
      g.push(txt(cx0 + (pos[0].x - R - REACH) * RIG_SCALE * sc - 6, Y(deckAt(FORM, leadsOf[0][N / 2])) + 4, `${(COMBO_FLOOR_M + M(deckAt(FORM, leadsOf[0][N / 2]))).toFixed(2)} m`, { size: 9.5, fill: MUTE, anchor: 'end' }));
      const L = P.units.length - 1;
      g.push(txt(cx0 + (pos[L].x + R + REACH) * RIG_SCALE * sc + 6, Y(deckAt(FORM, leadsOf[L][0])) + 4, `${(COMBO_FLOOR_M + M(deckAt(FORM, leadsOf[L][0]))).toFixed(2)} m`, { size: 9.5, fill: MUTE }));
    }
    g.push(figureElevation(ex + ew - 40, oy + 16, sc));
    const px0 = 1040;
    g.push(txt(px0, oy + 16, '平面 · 峰 / 谷朝向（俯视）', { size: 10, fill: MUTE }));
    P.units.forEach((u, i) => g.push(wavePlan(px0 + 70 + pos[i].x * RIG_SCALE * 0.55 + (pos[pos.length - 1].x * RIG_SCALE * 0.55) / 2, oy + 120 + pos[i].z * RIG_SCALE * 0.55, 0.55, leadsOf[i])));
    let ty = oy + 230;
    g.push(txt(px0, ty, `相位：${P.units.map((u) => `峰在带 ${u.crest}`).join(' / ')}`, { size: 10.5 }));
    ty += 15;
    g.push(txt(px0, ty, `高度段：${P.units.map((u) => `lead ${u.low}→${u.high}`).join(' / ')}`, { size: 10.5 }));
    ty += 15;
    g.push(txt(px0, ty, `芯心距 ${m.pitchM.toFixed(2)} m · 接缝 ${m.joints} 条，齐平 ${m.levelJoints} 条`, { size: 10.5, fill: MUTE }));
  });
  writeFileSync(join(OUT, 'wave-joins.svg'), doc(W, H, g.join('\n')));
}
console.log('written', OUT, DEF.zh, COMBO_PLANS.map((p) => `${p.key}: ${comboReading(p, FORM, R, 'touch')}`).join(' | '));
