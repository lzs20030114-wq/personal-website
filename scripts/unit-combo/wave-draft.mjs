// 线稿：起伏平台首尾相接（Lab 2-11 第二读法，用户 2026-09-20 纠偏「假如我们就用平台，然后选择做一圈起伏……
// 是不是有存在前后两个单元可以实现首尾相接一高一低的」）。
//
// 单元 = Lab 2-5 的圆筒环（直挑台）+ 一圈起伏编制：同一张键谱、每个方位一个 lead（2 px/节），
// 平台沿圆周从谷升到峰再回来。两个单元挨着放时，接缝落在 A 的方位 0 与 B 的方位 π 上，
// 接缝处两家各自是什么高度，由各自的**相位**（峰朝哪边）与**高度级**（lead 用量程的哪一段）定。
// 本图只有线：剖面是真引擎终态（直挑台跑一遍），起伏 = 形状纯平移（skin-ring 起伏编制守门过的那条）。
// 用法： npx vite-node scripts/unit-combo/wave-draft.mjs <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createSkinUnit, SKIN } from '../../src/lib/space/skin-unit.ts';
import { RING, RING_LEAD, RING_WAVE, buildRingUnits, palindromeOrder } from '../../src/lib/space/skin-ring.ts';
import { FIGURE, MM_PER_UNIT, RIG_ANCHOR_Y, RIG_SCALE, ROOM } from '../../src/lib/space/skin-grid.ts';
import { COMBO_FORMS } from '../../src/lib/space/unit-combo.ts';

const OUT = process.argv[2] ?? 'wave-out';
mkdirSync(OUT, { recursive: true });
const R = RING.RADIUS_DEF;
const N = RING.COUNT;
const M = (px2d) => (px2d * RIG_SCALE * MM_PER_UNIT) / 1000;
const fmtM = (px2d) => `${M(px2d).toFixed(2)} m`;
const fmtCm = (px2d) => `${(M(px2d) * 100).toFixed(0)} cm`;
const FLOOR_M = M((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / RIG_SCALE); // 下缘离地 1.08 m

// ── 真引擎：直挑台跑到底（一条；起伏各级 = 同一形状沿带平移）──────────────────────────
const LEDGE = buildRingUnits()[2];
const sim = createSkinUnit(LEDGE.spec, LEDGE.opts);
for (let k = 0; k < SKIN.STEPS; k++) sim.advance();
const foot = sim.py[sim.n - 1];
const PROFILE = [];
for (let i = 0; i < sim.n; i++) PROFILE.push([sim.px[i] * 100, (sim.py[i] - foot) * 100]);
const F = COMBO_FORMS[2]; // 直挑台的实测量：deck 77.2 / reach 101.0
/** lead → 走面离下缘的高度（2D px）：lead 每少一节，形状沿带上移 2 px */
const deckAt = (lead) => F.deck + 2 * (RING_LEAD - lead);

/** 11 级 lead：在 [low, high] 之间按余弦（与 skin-ring.waveLeads 同一条公式，只是量程可给） */
function leads(low = RING_WAVE.LOW, high = RING_WAVE.HIGH) {
  const L = RING_WAVE.LEVELS;
  return Array.from({ length: L }, (_, l) => Math.round(low - (low - high) * ((1 - Math.cos((Math.PI * l) / (L - 1))) / 2)));
}
/** 一个单元：每个方位的 lead。offset 10 = 峰在方位 0（右），0 = 谷在方位 0 */
function unitLeads(offset, low, high) {
  const lv = leads(low, high);
  return palindromeOrder(N, RING_WAVE.LEVELS, offset).map((l) => lv[l]);
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
const poly = (pts, o = {}) =>
  `<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="${o.fill ?? 'none'}" stroke="${o.stroke ?? INK}" stroke-width="${o.w ?? 1}" stroke-linejoin="round" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''} ${o.opacity !== undefined ? `opacity="${o.opacity}"` : ''}/>`;
const dimV = (x, y1, y2, label, o = {}) =>
  [
    line(x, y1, x, y2, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    line(x - 4, y1, x + 4, y1, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    line(x - 4, y2, x + 4, y2, { stroke: o.stroke ?? MUTE, w: 0.8 }),
    txt(x + 6, (y1 + y2) / 2 + 4, label, { size: 10, fill: o.stroke ?? MUTE }),
  ].join('');
const doc = (W, H, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif,system-ui,'PingFang SC','Noto Sans CJK SC',sans-serif">\n<rect width="${W}" height="${H}" fill="#fbfbf9"/>\n${body}\n</svg>`;

// ── 立面：一个起伏环 = 立杆 + 左右两条真剖面（各按自己方位的 lead 平移）+ 平台外缘沿圆周的高度带 ──
function waveElevation(cx0, oy, sc, ul, o = {}) {
  const W = (x) => cx0 + x * RIG_SCALE * sc;
  const Y = (h) => oy + (RIG_ANCHOR_Y - h * RIG_SCALE) * sc;
  const out = [];
  out.push(line(cx0, oy, cx0, Y(0), { stroke: MUTE, w: 1.2 }));
  const shift = (i) => 2 * (RING_LEAD - ul[i]);
  // 右带（方位 0，i=0）与左带（方位 π，i=10）的真剖面
  out.push(poly(PROFILE.map(([x, h]) => [W(R + x), Y(h + shift(0))]), { stroke: o.stroke ?? INK, w: 1 }));
  out.push(poly(PROFILE.map(([x, h]) => [W(-(R + x)), Y(h + shift(N / 2))]), { stroke: o.stroke ?? INK, w: 1 }));
  // 平台外缘绕一圈的高度带：前半圈实线、后半圈虚线（相机在 +z）
  const rim = (from, to) => {
    const pts = [];
    for (let k = from; k <= to; k++) {
      const i = ((k % N) + N) % N;
      const a = (i / N) * Math.PI * 2;
      pts.push([W((R + F.reach) * Math.cos(a)), Y(deckAt(ul[i]))]);
    }
    return pts;
  };
  out.push(poly(rim(0, N / 2), { stroke: GREEN, w: 1.6, dash: '4 3' })); // 方位 0→π 经 +z? 见下
  out.push(poly(rim(N / 2, N), { stroke: GREEN, w: 1.6 }));
  return out.join('');
}
// 注：方位角按 skin-ring.ringAngle（0 = +X，正向绕世界 Y）；绕 Y 正向从 +X 转向 −Z，故 0→π 那半圈在 −z（远，虚线），
// π→2π 那半圈在 +z（近，实线）。
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
/** 平面：芯圆 + 外缘圆 + 峰/谷标记 */
function wavePlan(cx, cy, sc, ul) {
  const out = [circle(cx, cy, R * RIG_SCALE * sc, { stroke: MUTE, w: 0.8 }), circle(cx, cy, (R + F.reach) * RIG_SCALE * sc, { stroke: GREEN, w: 1.2, fill: `${GREEN}14` })];
  let hi = 0;
  let lo = 0;
  ul.forEach((l, i) => {
    if (l < ul[hi]) hi = i;
    if (l > ul[lo]) lo = i;
  });
  for (const [i, tag, col] of [[hi, '峰', PURPLE], [lo, '谷', ORANGE]]) {
    const a = (i / N) * Math.PI * 2;
    const rr = (R + F.reach * 0.6) * RIG_SCALE * sc;
    out.push(txt(cx + rr * Math.cos(a), cy - rr * Math.sin(a) + 4, tag, { size: 10, fill: col, weight: 700, anchor: 'middle' }));
  }
  return out.join('');
}

// ── 五种接法 ─────────────────────────────────────────────────────────────────
const pitch = 2 * (R + F.peakReach); // 相切
const FULL = [RING_WAVE.LOW, RING_WAVE.HIGH];
const MID = Math.round((RING_WAVE.LOW + RING_WAVE.HIGH) / 2); // 36
const THIRD1 = Math.round(RING_WAVE.LOW - (RING_WAVE.LOW - RING_WAVE.HIGH) / 3); // 43
const THIRD2 = Math.round(RING_WAVE.LOW - (2 * (RING_WAVE.LOW - RING_WAVE.HIGH)) / 3); // 29
const ROWS = [
  {
    title: '① 同相：两个一样的起伏环挨着放 —— 接缝一高一低，是一个台阶',
    units: [unitLeads(10, ...FULL), unitLeads(10, ...FULL)],
    note: ['A 的峰（右）对着 B 的谷（左）：接缝落差 = 整个量程 0.35 m。什么都不用改，Lab 2-5 那个环摆两个就是。', '读作：走上 A 爬到顶、跨到 B 又从底再爬一次 —— 锯齿。'],
  },
  {
    title: '② 首尾接平：A 用量程下半段、B 用上半段 —— 接缝齐平，两个单元合起来爬完 0.35 m',
    units: [unitLeads(10, RING_WAVE.LOW, MID), unitLeads(10, MID, RING_WAVE.HIGH)],
    note: ['A 的峰 = B 的谷 = 同一个 lead（36），接缝零落差。代价：每个单元的起伏只剩一半（0.17 m）。', '这是「续坡」：量程 0.35 m 是带子 202 节给的硬上限，几个单元分着用；要爬更高只能加长带子。'],
  },
  {
    title: '②′ 三个单元续坡：量程分三份，每个 0.12 m',
    units: [unitLeads(10, RING_WAVE.LOW, THIRD1), unitLeads(10, THIRD1, THIRD2), unitLeads(10, THIRD2, RING_WAVE.HIGH)],
    note: ['三个接缝全齐平，总爬升仍是 0.35 m —— 单元越多每段越缓。', '台阶感消失、读作一条缓坡。'],
  },
  {
    title: '③ 谷对谷：两头高、中间低 —— 一个被两侧高台围住的凹处',
    units: [unitLeads(0, ...FULL), unitLeads(10, ...FULL)],
    note: ['A 的谷（右）对 B 的谷（左）：接缝齐平且是最低点，两边各升 0.35 m。', '读作：一个凹槽 / 窝——草图 ③ 那两个 C 形开口相对，我猜是这个。'],
  },
  {
    title: '④ 峰对峰：中间高、两头低 —— 一道拱',
    units: [unitLeads(10, ...FULL), unitLeads(0, ...FULL)],
    note: ['A 的峰（右）对 B 的峰（左）：接缝齐平且是最高点，两边各降 0.35 m。', '读作：一道拱 / 桥。'],
  },
];

{
  const W = 1640;
  const rowH = 470;
  const H = 140 + rowH * ROWS.length + 40;
  const g = [];
  g.push(txt(40, 44, '起伏平台首尾相接 —— 同一种平台（直挑台）+ 一圈起伏，两三个单元挨着放，接缝处接高接低', { size: 20, weight: 700 }));
  g.push(txt(40, 66, `单元 = Lab 2-5 圆筒环 · 直挑台 · 一圈起伏（lead ${RING_WAVE.HIGH}–${RING_WAVE.LOW} = 量程 ${fmtM(2 * (RING_WAVE.LOW - RING_WAVE.HIGH))}，形状逐点不变只平移）。绿线 = 平台外缘绕一圈的高度（实线近半圈、虚线远半圈）；黑线 = 接缝那一侧与外侧两条带的真剖面。相切摆放，装置 ×0.5、下缘离地 ${FLOOR_M.toFixed(2)} m。`, { size: 11, fill: MUTE }));
  g.push(txt(40, 84, `每个单元两个旋钮：相位（峰朝哪边）· 高度级（用量程的哪一段）。接缝 = A 的方位 0 对 B 的方位 π，两家在那里各是什么高度，就是「接高接低」。`, { size: 11, fill: MUTE }));
  const sc = 0.8;
  ROWS.forEach((row, r) => {
    const oy = 130 + r * rowH;
    g.push(txt(40, oy - 6, row.title, { size: 13, weight: 700 }));
    const ex = 60;
    const ew = 900;
    g.push(line(ex, oy + 16, ex + ew, oy + 16, { stroke: HAIR }));
    g.push(line(ex, oy + 16 + ROOM.FLOOR_Y * sc, ex + ew, oy + 16 + ROOM.FLOOR_Y * sc, { stroke: INK }));
    const n = row.units.length;
    const cx0 = ex + ew / 2 - 80 - ((n - 1) * pitch * RIG_SCALE * sc) / 2;
    const Y = (h) => oy + 16 + (RIG_ANCHOR_Y - h * RIG_SCALE) * sc;
    row.units.forEach((ul, i) => {
      const cx = cx0 + i * pitch * RIG_SCALE * sc;
      g.push(waveElevation(cx, oy + 16, sc, ul));
      g.push(txt(cx, Y(-14) + 12, String.fromCharCode(65 + i), { size: 11, weight: 700, fill: MUTE, anchor: 'middle' }));
      // 接缝读数
      if (i < n - 1) {
        const hA = deckAt(ul[0]);
        const hB = deckAt(row.units[i + 1][N / 2]);
        const xj = cx + (R + F.reach) * RIG_SCALE * sc;
        const step = Math.abs(hA - hB);
        if (step > 1) g.push(dimV(xj + 14, Y(Math.max(hA, hB)), Y(Math.min(hA, hB)), `落差 ${fmtCm(step)}`, { stroke: RED }));
        else {
          // 标签上下错开，免得三个接缝的字叠在坡上
          const dy = i % 2 ? 16 : -8;
          g.push(line(xj, Y(hA), xj, Y(hA) + dy - (dy > 0 ? 10 : -2), { stroke: GREEN, w: 0.6 }));
          g.push(txt(xj + 6, Y(hA) + dy, `接缝齐平 · 离地 ${(FLOOR_M + M(hA)).toFixed(2)} m`, { size: 9.5, fill: GREEN, weight: 600 }));
        }
      }
    });
    // 两端高度
    const first = row.units[0];
    const last = row.units[n - 1];
    const xl = cx0 - (R + F.reach) * RIG_SCALE * sc;
    const xr = cx0 + (n - 1) * pitch * RIG_SCALE * sc + (R + F.reach) * RIG_SCALE * sc;
    g.push(txt(xl - 6, Y(deckAt(first[N / 2])) + 4, `${(FLOOR_M + M(deckAt(first[N / 2]))).toFixed(2)} m`, { size: 9.5, fill: MUTE, anchor: 'end' }));
    g.push(txt(xr + 6, Y(deckAt(last[0])) + 4, `${(FLOOR_M + M(deckAt(last[0]))).toFixed(2)} m`, { size: 9.5, fill: MUTE }));
    g.push(figureElevation(ex + ew - 40, oy + 16, sc));
    // 平面
    const px0 = 1040;
    g.push(txt(px0, oy + 16, '平面 · 峰 / 谷朝向', { size: 10, fill: MUTE }));
    row.units.forEach((ul, i) => g.push(wavePlan(px0 + 70 + i * pitch * RIG_SCALE * 0.55, oy + 120, 0.55, ul)));
    // 说明
    let ty = oy + 230;
    const wrap = (s, w) => { const o = []; for (let k = 0; k < s.length; k += w) o.push(s.slice(k, k + w)); return o; };
    for (const [j, t] of row.note.entries()) for (const l of wrap(t, 44)) { g.push(txt(px0, ty, l, { size: 10.5, fill: j ? MUTE : INK })); ty += 15; }
  });
  writeFileSync(join(OUT, 'wave-joins.svg'), doc(W, H, g.join('\n')));
}
console.log('written', OUT, 'deck LOW', deckAt(RING_WAVE.LOW).toFixed(1), 'deck HIGH', deckAt(RING_WAVE.HIGH).toFixed(1), 'range', fmtM(2 * (RING_WAVE.LOW - RING_WAVE.HIGH)));
