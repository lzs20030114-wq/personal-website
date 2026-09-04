// 线稿图谱：一个人走过（Lab.14）——把「同一块场地上 4×4 / 6×6 / 8×8 的单元多小」「五种行为 × 三种密度，
// 走完各点亮了哪一群」「影响半径这个旋钮怎么改变群的大小」「驻留那一遍的五个时刻：痕迹在退、成形不退」
// 画成只有线的图，给用户拍板。
//
// 纪律（用户 2026-08-20 立）：先线稿、确认后再上台架。几何与模型**整套查站上模块**
// （src/lib/space/unit-activation.ts），不另写一份——尺寸 / 规则 / 预设一处改两处同步。
// 每个格子里的结果是**真跑出来的**（runScenario），不是示意。
// 用法： npx vite-node scripts/unit-activation/atlas.mjs <outDir>
//   产出 plan.svg（密度与单元大小）· matrix.svg（行为 × 密度）· reach.svg（影响半径）· hysteresis.svg（驻留五时刻）
//   以及同名 .html 包裹（headless Chromium 截图用：新模式的 window-size 含窗框，直接截 svg 会裁掉底部）
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PATHS, PLAN, PlanSim, aisleLines, dwellSpot, planLayout, runScenario,
} from '../../src/lib/space/unit-activation.ts';

const OUT = process.argv[2] ?? 'activation-out';
mkdirSync(OUT, { recursive: true });
const L4 = planLayout(4);
const ROOM_M = L4.roomM;

// ── SVG 小工具（与 unit-cluster/atlas.mjs 同款）─────────────────────────────
const INK = '#1a1c1a';
const MUTE = '#8a8f8a';
const HAIR = '#c9cdc9';
const GREEN = '#2f8f5b';
const PURPLE = '#6b4fbb';
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

// ── 平面画法 ─────────────────────────────────────────────────────────────────
/** 一间房：ox,oy = 房间中心在纸上的位置，sc = 像素/米 */
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
  out.push(line(ox - h, oy - dw, ox - h - dw * 0.9, oy - dw * 0.1, { stroke: MUTE, w: 0.8 }));
  out.push(line(ox + h, oy - dw, ox + h + dw * 0.9, oy - dw * 0.1, { stroke: MUTE, w: 0.8 }));
  if (o.aisles) {
    const a = aisleLines(L);
    const fh = (L.fieldM / 2 + 0.15) * sc;
    for (const x of a.x) out.push(line(ox + x * sc, oy - fh, ox + x * sc, oy + fh, { stroke: HAIR, w: 0.6, dash: '2 3' }));
    for (const y of a.y) out.push(line(ox - fh, oy + y * sc, ox + fh, oy + y * sc, { stroke: HAIR, w: 0.6, dash: '2 3' }));
  }
  return out.join('');
}

/** 痕迹场：有痕迹的格子按浓度画（绿；透明度按「几秒的存在」，阈值 15 s 处约七成） */
function heat(field, ox, oy, sc) {
  const out = [];
  const cs = field.cell * sc;
  for (let idx = 0; idx < field.data.length; idx++) {
    const v = field.data[idx];
    if (v <= 1e-3) continue;
    const [x, y] = field.cellCenter(idx);
    const a = Math.min(0.8, 1 - Math.exp(-v / 12));
    out.push(rect(ox + x * sc - cs / 2, oy + y * sc - cs / 2, cs, cs, { fill: GREEN, opacity: Math.max(0.06, a) }));
  }
  return out.join('');
}

/** 单元：芯 + 平台外缘（发丝线）+ 成形程度（紫，半径从芯长到外缘） */
function units(sim, ox, oy, sc) {
  const out = [];
  const L = sim.layout;
  for (const u of L.units) {
    const cx = ox + u.x * sc;
    const cy = oy + u.y * sc;
    out.push(circle(cx, cy, L.platR * sc, { stroke: HAIR, w: 0.7 }));
    const d = sim.act.degree[u.i];
    if (d > 1e-6) {
      const r = (L.mastR + d * (L.platR - L.mastR)) * sc;
      out.push(circle(cx, cy, r, { fill: PURPLE, stroke: PURPLE, w: d >= 1 - 1e-9 ? 1.4 : 0.6, opacity: 0.2 + 0.55 * d }));
    }
    out.push(circle(cx, cy, Math.max(1.2, L.mastR * sc), { fill: INK, stroke: 'none' }));
  }
  return out.join('');
}

/** 人：身体圆 + 朝向 + 影响圈；不在场就不画 */
function person(sim, ox, oy, sc) {
  const w = sim.walker;
  if (!w.present) return '';
  const cx = ox + w.x * sc;
  const cy = oy + w.y * sc;
  const r = PLAN.BODY_R * sc;
  return [
    circle(cx, cy, sim.reach * sc, { stroke: GREEN, w: 0.8, dash: '3 3' }),
    circle(cx, cy, r, { fill: '#fbfbf9', stroke: INK, w: 1.2 }),
    line(cx, cy, cx + Math.cos(w.heading) * r, cy + Math.sin(w.heading) * r, { stroke: INK, w: 1.2 }),
  ].join('');
}

/** 走过的路（细墨线） */
function trail(sim, ox, oy, sc) {
  const pts = [];
  for (let k = 0; k < sim.trail.length; k += 2) pts.push([ox + sim.trail[k] * sc, oy + sim.trail[k + 1] * sc]);
  return pts.length > 1 ? poly(pts, { stroke: INK, w: 0.6, opacity: 0.5 }) : '';
}

const label = (sim) => {
  const s = sim.summary();
  return { text: `成形 ${s.formed.length} · 半成以上 ${s.half} · 最高读数 ${s.maxInput.toFixed(1)} s`, hot: s.formed.length > 0 || s.half > 0 };
};

// ── 图一：三种密度的单元多大 + 一个人站着时影响圈盖住谁 ────────────────────────
{
  const W = 1360;
  const H = 560;
  const out = [];
  out.push(txt(28, 34, '一个人走过 · 同一块场地，三种密度：单元多小、一个人站着时谁读到他', { size: 16, weight: 700 }));
  out.push(txt(28, 54, `Lab.12 那间房（${ROOM_M.toFixed(2)} m 见方）与那块场地（${L4.fieldM.toFixed(2)} m 见方）钉死；格距 = 场地 ÷ (N − 1 + 0.84)，平台与芯按 Lab.12 的比例随格距缩（4×4 与 Lab.12 逐位相同）`, { size: 11, fill: MUTE }));

  // 左：三个尺寸的单元并排 + 人
  {
    const sc = 100;
    const y = 250;
    let x = 90;
    for (const n of PLAN.GRIDS) {
      const L = planLayout(n);
      out.push(txt(x, 100, `${n}×${n}`, { size: 12, weight: 700, anchor: 'middle' }));
      out.push(circle(x, y, L.platR * sc, { stroke: INK, w: 1 }));
      out.push(circle(x, y, L.platR * sc * 0.6, { stroke: PURPLE, w: 0.8, fill: PURPLE, opacity: 0.35 }));
      out.push(circle(x, y, L.mastR * sc, { fill: INK, stroke: 'none' }));
      out.push(dimH(x - L.platR * sc, x + L.platR * sc, y + L4.platR * sc + 22, `平台 ⌀ ${(2 * L.platR).toFixed(2)} m`));
      out.push(txt(x, y + L4.platR * sc + 42, `格距 ${L.pitchM.toFixed(2)} m · 芯 ⌀ ${(2 * L.mastR).toFixed(2)} m`, { size: 10, fill: MUTE, anchor: 'middle' }));
      out.push(txt(x, y + L4.platR * sc + 58, `${n * n} 个单元`, { size: 10, fill: MUTE, anchor: 'middle' }));
      x += 140;
    }
    const px = x + 50;
    out.push(txt(px, 100, '人', { size: 12, weight: 700, anchor: 'middle' }));
    out.push(circle(px, y, PLAN.REACH.def * sc, { stroke: GREEN, w: 1, dash: '4 3' }));
    out.push(circle(px, y, PLAN.BODY_R * sc, { fill: '#fbfbf9', stroke: INK, w: 1.2 }));
    out.push(line(px, y, px + PLAN.BODY_R * sc, y, { stroke: INK, w: 1.2 }));
    out.push(dimH(px - PLAN.BODY_R * sc, px + PLAN.BODY_R * sc, y + L4.platR * sc + 22, `身体 ⌀ ${(2 * PLAN.BODY_R).toFixed(2)} m`));
    out.push(txt(px, y + L4.platR * sc + 42, `影响半径 ${PLAN.REACH.def.toFixed(1)} m（可调 ${PLAN.REACH.min}–${PLAN.REACH.max}）`, { size: 10, fill: GREEN, anchor: 'middle' }));
    out.push(txt(px, y + L4.platR * sc + 58, '圈里的每块地面每秒各记 1 秒的存在', { size: 10, fill: GREEN, anchor: 'middle' }));
  }
  // 右：三张小平面，人刚站到驻留点，影响圈盖住谁
  {
    const sc = 30;
    const y0 = 300;
    PLAN.GRIDS.forEach((n, k) => {
      const ox = 820 + k * 215;
      const sim = new PlanSim({ path: 'dwell', grid: n });
      while (sim.walker.state !== 'dwell' && sim.t < 60) sim.step(0.05);
      const L = sim.layout;
      out.push(txt(ox, 100, `${n}×${n} · 人刚站定`, { size: 11, weight: 700, anchor: 'middle' }));
      out.push(room(L, ox, y0, sc, { aisles: true }));
      out.push(units(sim, ox, y0, sc));
      out.push(person(sim, ox, y0, sc));
      const u = dwellSpot(L);
      let full = 0;
      let touch = 0;
      for (const v of L.units) {
        const d = Math.hypot(v.x - u.x, v.y - u.y);
        const halfDiag = (L.pitchM / 2) * Math.SQRT2;
        if (d + halfDiag <= sim.reach) full++;
        else if (d - halfDiag < sim.reach) touch++;
      }
      out.push(txt(ox, y0 + (L.roomM / 2) * sc + 16, `影响圈整格盖住 ${full} 个 · 碰到 ${touch} 个`, { size: 10, fill: MUTE, anchor: 'middle' }));
    });
  }
  out.push(txt(28, 470, `规则（作者 07-20 原型的三个数，全部可调）：痕迹每秒衰减 ${PLAN.DECAY * 100}%（半衰期 ≈ 34 s）· 一个单元脚下地面平均记满 ${PLAN.THRESHOLD} s 即成形 · 成形不回退`, { size: 10.5 }));
  out.push(txt(28, 490, '读数取均值不取和 ⇒ 阈值不随单元大小变：整格都在圈里站 20 s 就成形，只有一半在圈里就只到一半——一群单元围着人一起长，边上的浅、中间的深。', { size: 10.5, fill: MUTE }));
  out.push(txt(28, 510, '「读法」：按格（整片地面按最近的芯归片，默认）/ 脚下（只读平台正下方，平台之间的缝是盲区）。', { size: 10.5, fill: MUTE }));
  out.push(txt(28, 530, '平面上的「小单元」只是等比缩；真做小的结构单元（带数 / 缩放 / 键谱）是另一轮。行为 → 形态的翻译规则由作者手写，这里止于「激活程度」。', { size: 10.5, fill: MUTE }));
  writeFileSync(join(OUT, 'plan.svg'), doc(W, H, out.join('\n')));
}

// ── 图二：五种行为 × 三种密度 ────────────────────────────────────────────────
{
  const presets = PATHS.filter((p) => !p.free);
  const sc = 30;
  const cell = ROOM_M * sc + 34;
  const left = 190;
  const top = 110;
  const W = left + PLAN.GRIDS.length * cell + 20;
  const H = top + presets.length * (cell + 22) + 30;
  const out = [];
  out.push(txt(28, 34, '一个人走过 · 五种行为 × 三种密度：走完，哪一群单元被激活', { size: 16, weight: 700 }));
  out.push(txt(28, 54, '每格 = 真跑到人离场那一刻。绿 = 地面上的存在·秒（越浓越久）· 细墨线 = 走过的路 · 紫圈 = 激活程度（长满 = 成形）', { size: 11, fill: MUTE }));
  out.push(txt(28, 72, `步速 ${PLAN.SPEED.def} m/s · 影响半径 ${PLAN.REACH.def} m · 衰减 ${PLAN.DECAY * 100}%/s · 阈值 ${PLAN.THRESHOLD} s · 按格读（默认规则，全部可调）`, { size: 11, fill: MUTE }));
  PLAN.GRIDS.forEach((n, k) => out.push(txt(left + k * cell + cell / 2 - 17, top - 12, `${n}×${n}`, { size: 12, weight: 700, anchor: 'middle' })));
  presets.forEach((p, r) => {
    const oy = top + r * (cell + 22) + cell / 2;
    out.push(txt(28, oy - 12, `${p.zh} · ${p.en}`, { size: 12, weight: 700 }));
    const note = p.zhNote;
    const cut = Math.ceil(note.length / 2);
    out.push(txt(28, oy + 6, note.slice(0, cut), { size: 9.5, fill: MUTE }));
    out.push(txt(28, oy + 20, note.slice(cut), { size: 9.5, fill: MUTE }));
    out.push(txt(28, oy + 36, `在场 ${runScenario({ path: p.key, grid: 8 }, 0).summary().presentTime.toFixed(0)} s`, { size: 9.5, fill: MUTE }));
    PLAN.GRIDS.forEach((n, k) => {
      const ox = left + k * cell + cell / 2 - 17;
      const sim = runScenario({ path: p.key, grid: n }, 0);
      out.push(room(sim.layout, ox, oy, sc, { aisles: true }));
      out.push(heat(sim.field, ox, oy, sc));
      out.push(trail(sim, ox, oy, sc));
      out.push(units(sim, ox, oy, sc));
      const lb = label(sim);
      out.push(txt(ox, oy + (ROOM_M / 2) * sc + 14, lb.text, { size: 9.5, fill: lb.hot ? PURPLE : MUTE, anchor: 'middle', weight: lb.hot ? 700 : 400 }));
    });
  });
  writeFileSync(join(OUT, 'matrix.svg'), doc(W, H, out.join('\n')));
}

// ── 图三：影响半径这个旋钮（8×8）───────────────────────────────────────────
{
  const REACHES = [0.22, 0.6, 1.0, 1.2];
  const rows = ['dwell', 'pace', 'loop'].map((k) => PATHS.find((p) => p.key === k));
  const sc = 30;
  const cell = ROOM_M * sc + 34;
  const left = 150;
  const top = 110;
  const W = left + REACHES.length * cell + 20;
  const H = top + rows.length * (cell + 22) + 30;
  const out = [];
  out.push(txt(28, 34, '一个人走过 · 影响半径是行为的量：8×8 下同一种行为，圈多大、群多大', { size: 16, weight: 700 }));
  out.push(txt(28, 54, '0.22 = 只有身体 · 0.6 = 一臂之内 · 1.0 = Hall 个人距离远相（默认）· 1.2 = 个人距离外沿。其余规则同图二。', { size: 11, fill: MUTE }));
  REACHES.forEach((rm, k) => out.push(txt(left + k * cell + cell / 2 - 17, top - 12, `影响半径 ${rm.toFixed(2)} m`, { size: 12, weight: 700, anchor: 'middle' })));
  rows.forEach((p, r) => {
    const oy = top + r * (cell + 22) + cell / 2;
    out.push(txt(28, oy - 4, `${p.zh} · ${p.en}`, { size: 12, weight: 700 }));
    out.push(txt(28, oy + 12, `在场 ${runScenario({ path: p.key, grid: 8 }, 0).summary().presentTime.toFixed(0)} s`, { size: 9.5, fill: MUTE }));
    REACHES.forEach((rm, k) => {
      const ox = left + k * cell + cell / 2 - 17;
      const sim = runScenario({ path: p.key, grid: 8, reach: rm }, 0);
      out.push(room(sim.layout, ox, oy, sc, { aisles: true }));
      out.push(heat(sim.field, ox, oy, sc));
      out.push(trail(sim, ox, oy, sc));
      out.push(units(sim, ox, oy, sc));
      const lb = label(sim);
      out.push(txt(ox, oy + (ROOM_M / 2) * sc + 14, lb.text, { size: 9.5, fill: lb.hot ? PURPLE : MUTE, anchor: 'middle', weight: lb.hot ? 700 : 400 }));
    });
  });
  writeFileSync(join(OUT, 'reach.svg'), doc(W, H, out.join('\n')));
}

// ── 图四：驻留那一遍的五个时刻——痕迹在退、成形不退（8×8）─────────────────────
{
  const sc = 34;
  const moments = [
    ['进门 · 走向站点', (sim) => { while (sim.walker.state === 'walk' && sim.t < 60) sim.step(0.05); sim.step(0.05); }],
    [`站了 ${PLAN.DWELL_S / 2} s`, (sim) => { for (let k = 0; k < (PLAN.DWELL_S / 2) / 0.05; k++) sim.step(0.05); }],
    ['离场那一刻', (sim) => { while (sim.exitedAt === null && sim.t < 120) sim.step(0.05); }],
    ['离场后 60 s', (sim) => { for (let k = 0; k < 60 / 0.05; k++) sim.step(0.05); }],
    ['离场后 180 s', (sim) => { for (let k = 0; k < 120 / 0.05; k++) sim.step(0.05); }],
  ];
  const cell = ROOM_M * sc + 30;
  const W = 40 + moments.length * cell;
  const H = 130 + cell + 60;
  const out = [];
  out.push(txt(28, 34, '一个人走过 · 驻留那一遍的五个时刻：痕迹在退，成形不退（8×8）', { size: 16, weight: 700 }));
  out.push(txt(28, 54, `走到一处站 ${PLAN.DWELL_S} s 再出门。人走后地面的绿逐渐消失，紫的一群留在原处——这就是滞回（键锁定永久）；行为层与空间层之间唯一的信息通道是痕迹。`, { size: 11, fill: MUTE }));
  const sim = new PlanSim({ path: 'dwell', grid: 8 });
  const u = dwellSpot(sim.layout);
  moments.forEach(([name, advance], k) => {
    advance(sim);
    const ox = 40 + k * cell + cell / 2 - 15;
    const oy = 130 + cell / 2;
    out.push(txt(ox, 100, name, { size: 12, weight: 700, anchor: 'middle' }));
    out.push(txt(ox, 116, `t = ${sim.t.toFixed(0)} s`, { size: 10, fill: MUTE, anchor: 'middle' }));
    out.push(room(sim.layout, ox, oy, sc, { aisles: true }));
    out.push(heat(sim.field, ox, oy, sc));
    out.push(trail(sim, ox, oy, sc));
    out.push(units(sim, ox, oy, sc));
    out.push(person(sim, ox, oy, sc));
    const s = sim.summary();
    out.push(txt(ox, oy + (ROOM_M / 2) * sc + 16, `脚下单元读数 ${sim.act.input[u.i].toFixed(1)} s · 成形 ${s.formed.length} · 半成以上 ${s.half}`, { size: 10, fill: s.formed.length ? PURPLE : INK, anchor: 'middle' }));
    out.push(txt(ox, oy + (ROOM_M / 2) * sc + 30, `地面最深 ${sim.field.max().toFixed(1)} s`, { size: 10, fill: GREEN, anchor: 'middle' }));
  });
  writeFileSync(join(OUT, 'hysteresis.svg'), doc(W, H, out.join('\n')));
}

for (const f of ['plan', 'matrix', 'reach', 'hysteresis']) {
  const svg = readFileSync(join(OUT, `${f}.svg`), 'utf8');
  writeFileSync(join(OUT, `${f}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fbfbf9}svg{display:block}</style></head><body>${svg}</body></html>`);
}
console.log(`wrote ${OUT}/plan.svg matrix.svg reach.svg hysteresis.svg (+ .html wrappers)`);
