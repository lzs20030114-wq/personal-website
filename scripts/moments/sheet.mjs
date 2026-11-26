// 决定性瞬间的线稿 · 第三步：按叙事顺序把各条规则排成一张白底的图版，并在线稿上画记号。
//
//   node scripts/moments/sheet.mjs <plate.json> <线稿目录> <out.png> [宽 2400] [带记号的单格出到哪个目录]
//
// plate.json：{ title, lede, map: { cols, icons, counts, bands, nodes: { 行号: [列, 带] }, edges: [[从, 到, 'under'?]] },
//               sections: [{ name, icon, note, rows: [row..] }] }
//   row = { no, short, title, judge?, count?, needs?: ['01'..], cols?: 3, thumb?: 1, plan?: 'big'（平面图放大，排在线稿下面）, panels: [{ img, geo, opt, stage, cap, notes }] }
//   geo / opt 是 line.py --plate 用的；notes 是这一层画在线稿上的记号（见 NOTE 一节）。
// 版式（2026-11-23 作者「学术一点、像竞赛图版、清新一些」；11-24「要有叙事逻辑」；
//       11-25「减少文字，多加图上的引导和图形说明，不读字也看得懂每组图的目的」）：
//   版头 = 一句目的 + 记号图例 + 一张关系图（人的状态 × 单元做什么，每个节点是那一行「干预」格的平面小图，箭头 = 前提）；
//   每行 = 行号与标题 + 几格线稿；每格左下角一张平面小图，格下一行短说明；格与格之间一个箭头表示先后。
//   平面上的关系为主的行（让路 · 台角 · 注视 · 头顶 · 引猫）平面图放大排在线稿下面，按真实尺寸画（见 keyplan）。
//   记号只有六种：▼ 落下 · ▲ 收回 · ✕ 不落 · 弧线 / 折线 = 移动（虚线 = 将要去、实线 = 已经走过）· 虚直线 = 视线 · 小钟 = 时长。
//   线稿上不写句子，只有数（0.74 m、3 s）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const [plateFile, dir, out, width = '2400', panelsOut] = process.argv.slice(2);
const plate = JSON.parse(readFileSync(plateFile, 'utf8'));
const uri = (f) => 'data:image/png;base64,' + readFileSync(join(dir, f)).toString('base64');
const side = (f) => JSON.parse(readFileSync(join(dir, f.replace(/\.png$/, '.json')), 'utf8'));
const INK = '#181818', MID = '#929292', PALE = '#c9c9c9', TONE = '#e5e5e5';
const BODY = 1080, GAP = 22;
const f1 = (v) => Math.round(v * 10) / 10;
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** 一格线稿的几何：世界点（z 朝上）怎么取、怎么投到图上 */
function geom(d) {
  const { n, pitch: p, cam } = d;
  const half = (n - 1) / 2;
  const P = (w) => {
    const v = [w[0] - cam.c[0], w[1] - cam.c[1], w[2] - cam.c[2]];
    return [dot3(v, cam.r) * cam.s + cam.W / 2 - cam.ox, -dot3(v, cam.u) * cam.s + cam.H / 2 - cam.oy];
  };
  const cellXY = (r, c) => [(c - half) * p, -(r - half) * p];
  const mid = (b) => [(b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2];
  const eye = () => { const b = d.people[0]; return [...mid(b), b.hi[2] - p * 0.12]; };
  const catTop = (i = 0) => { const b = d.cats[i]; return [...mid(b), b.hi[2] - p * 0.05]; };
  /** 点的写法：[行, 列, 离地几米] · 'p0' 人的脚下 / 'p0e' 眼 / 'p0c' 胸 · 'c0' 猫 / 'c0t' 顶 / 'c0b' 底 ·
   *  'u:行,列' 那台的台面中心 / 'u:行,列@行,列' 台面高度上的另一点 · 'gaze' 视线中点 */
  const W = (s) => {
    if (Array.isArray(s)) {
      const lim = d.room - p * 0.06; // 路线不画到房间外面
      const [x, y] = cellXY(s[0], s[1]);
      return [Math.max(-lim, Math.min(lim, x)), Math.max(-lim, Math.min(lim, y)), cam.floor + (s[2] ?? 0) * cam.m];
    }
    if (s === 'gaze') { const a = eye(), b = catTop(); return a.map((v, i) => (v + b[i]) / 2); }
    let m = /^p(\d)([a-z]?)$/.exec(s);
    if (m) {
      const b = d.people[+m[1]];
      const z = m[2] === 'e' ? b.hi[2] - p * 0.12 : m[2] === 'h' ? b.hi[2] : m[2] === 'c' ? b.lo[2] + 0.6 * (b.hi[2] - b.lo[2]) : b.lo[2];
      return [...mid(b), z];
    }
    m = /^c(\d)([a-z]?)$/.exec(s);
    if (m) {
      const b = d.cats[+m[1]];
      return [...mid(b), m[2] === 't' ? b.hi[2] - p * 0.05 : m[2] === 'b' ? b.lo[2] : (b.lo[2] + b.hi[2]) / 2];
    }
    m = /^u:(\d),(\d)(?:@([\d.]+),([\d.]+))?$/.exec(s);
    if (m) {
      const u = d.units[`${m[1]},${m[2]}`];
      const xy = m[3] ? cellXY(+m[3], +m[4]) : cellXY(+m[1], +m[2]);
      return [...xy, u ? u.plat + (m[3] ? 0.1 * cam.m : 0) : cam.floor + 1.05 * cam.m];
    }
    throw new Error('点的写法不认识：' + s);
  };
  /** 一台单元在图上的外框 */
  const ubox = (r, c) => {
    const u = d.units[`${r},${c}`];
    if (!u) return null;
    const q = [];
    for (const x of [u.lo[0], u.hi[0]]) for (const y of [u.lo[1], u.hi[1]]) for (const z of [u.lo[2], u.hi[2]]) q.push(P([x, y, z]));
    const xs = q.map((v) => v[0]), ys = q.map((v) => v[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.max(0, Math.min(...ys)), y1: Math.max(...ys), plat: P([...cellXY(r, c), u.plat])[1] };
  };
  return { P, W, ubox, cellXY, half, p, cam };
}

// —— NOTE：画在线稿上的记号 ——
// { k:'down' | 'up', u:[行,列], side?:'l', label? }   单元旁一支竖箭头：落下 / 收回
// { k:'spread', u:[行,列], label? }                    台面两侧一对向外的箭头：成形
// { k:'x', at }                                        ✕：不落
// { k:'clash', at }                                    小圈：台角会碰到人的那一点
// { k:'walk', pts:[点…], dash? }                       地面上的折线：人或猫的路线
// { k:'hop', a, b, dash?, lift? }                      弧线：猫从一台到另一台
// { k:'step', at, n }                                  带数字的小圈：引猫的第几步
// { k:'tag', at, label, clock?, dx?, dy? }             数：0.74 m、3 s
// { k:'dimh', u:[行,列], label }                       台面离地的高度
// { k:'dim', a, b, label }                              两点之间的距离
function overlay(d, notes, cssW) {
  const g = geom(d);
  const [iw, ih] = [d.cam.W - 0, Math.round(d.cam.H * (d.crop ? d.crop[3] - d.crop[1] : 1))];
  const k = iw / cssW; // 一个版面像素合多少图像素：记号的大小按版面定
  const sw = 1.15 * k;
  const line = (a, b, dash) => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${INK}" stroke-width="${f1(sw)}"${dash ? ` stroke-dasharray="${f1(4.5 * k)} ${f1(3.5 * k)}"` : ''}/>`;
  const head = (tip, from, s = 6.5) => {
    const L = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1;
    const ux = (tip[0] - from[0]) / L, uy = (tip[1] - from[1]) / L;
    const b = [tip[0] - ux * s * k, tip[1] - uy * s * k];
    const w = s * 0.42 * k;
    return `<polygon points="${f1(tip[0])},${f1(tip[1])} ${f1(b[0] - uy * w)},${f1(b[1] + ux * w)} ${f1(b[0] + uy * w)},${f1(b[1] - ux * w)}" fill="${INK}"/>`;
  };
  const text = (x, y, t, anchor = 'start') => `<text x="${f1(x)}" y="${f1(y)}" font-size="${f1(10 * k)}" text-anchor="${anchor}" class="mono" fill="${INK}" stroke="#fff" stroke-width="${f1(3.2 * k)}" paint-order="stroke" stroke-linejoin="round">${t}</text>`;
  const clock = (x, y) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(4.4 * k)}" fill="#fff" stroke="${INK}" stroke-width="${f1(sw)}"/><path d="M${f1(x)} ${f1(y - 2.8 * k)}V${f1(y)}H${f1(x + 2.2 * k)}" fill="none" stroke="${INK}" stroke-width="${f1(sw)}"/>`;
  let s = '';
  for (const nt of notes ?? []) {
    if (nt.k === 'down' || nt.k === 'up') {
      let x, cy, len;
      if (nt.at) {
        [x, cy] = g.P(g.W(nt.at)); len = 30 * k;
      } else {
        const b = g.ubox(nt.u[0], nt.u[1]);
        if (!b) continue;
        x = nt.side === 'l' ? b.x0 - 9 * k : b.x1 + 9 * k;
        len = Math.min(44 * k, Math.max(28 * k, (b.y1 - b.y0) * 0.45));
        cy = Math.max(b.y0 + len / 2, Math.min(b.y1 - len / 2, b.plat - len * 0.25));
      }
      x += (nt.dx ?? 0) * k; cy = Math.max(len / 2 + 6 * k, cy + (nt.dy ?? 0) * k);
      const top = [x, cy - len / 2], bot = [x, cy + len / 2];
      const [from, tip] = nt.k === 'down' ? [top, bot] : [bot, top];
      s += line(from, [tip[0], tip[1] + (nt.k === 'down' ? -4 : 4) * k]) + head(tip, from, 8);
      if (nt.label) s += text(x + (nt.side === 'l' ? -7 : 7) * k, cy + 3.5 * k, nt.label, nt.side === 'l' ? 'end' : 'start');
    } else if (nt.k === 'spread') {
      const b = g.ubox(nt.u[0], nt.u[1]);
      if (!b) continue;
      const y = b.plat - 13 * k;
      for (const [x, dx] of [[b.x0, -1], [b.x1, 1]]) {
        const a = [x - dx * 14 * k, y], t = [x + dx * 4 * k, y];
        s += line(a, [t[0] - dx * 4 * k, y]) + head(t, a, 8);
      }
      if (nt.label) s += text(b.x1 + 10 * k, y + 3.5 * k, nt.label);
    } else if (nt.k === 'x') {
      const c = g.P(g.W(nt.at)), r = 6.5 * k;
      const dd = `M${f1(c[0] - r)} ${f1(c[1] - r)}L${f1(c[0] + r)} ${f1(c[1] + r)}M${f1(c[0] + r)} ${f1(c[1] - r)}L${f1(c[0] - r)} ${f1(c[1] + r)}`;
      s += `<path d="${dd}" stroke="#fff" stroke-width="${f1(5 * k)}" fill="none" stroke-linecap="round"/><path d="${dd}" stroke="${INK}" stroke-width="${f1(1.9 * k)}" fill="none"/>`;
    } else if (nt.k === 'clash') {
      const c = g.P(g.W(nt.at));
      s += `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(7 * k)}" fill="none" stroke="#fff" stroke-width="${f1(4.4 * k)}"/><circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(7 * k)}" fill="none" stroke="${INK}" stroke-width="${f1(1.6 * k)}"/>`;
    } else if (nt.k === 'walk') {
      const q = nt.pts.map((p) => g.P(g.W(p)));
      for (let i = 0; i + 1 < q.length; i++) {
        const last = i + 2 === q.length;
        const L = Math.hypot(q[i + 1][0] - q[i][0], q[i + 1][1] - q[i][1]) || 1;
        const e = last ? [q[i + 1][0] - ((q[i + 1][0] - q[i][0]) / L) * 4 * k, q[i + 1][1] - ((q[i + 1][1] - q[i][1]) / L) * 4 * k] : q[i + 1];
        s += line(q[i], e, nt.dash);
        if (last) s += head(q[i + 1], q[i]);
      }
    } else if (nt.k === 'hop') {
      const a = g.P(g.W(nt.a)), b = g.P(g.W(nt.b));
      const c = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - (nt.lift ?? 26) * k];
      const L = Math.hypot(b[0] - c[0], b[1] - c[1]) || 1;
      const e = [b[0] - ((b[0] - c[0]) / L) * 4 * k, b[1] - ((b[1] - c[1]) / L) * 4 * k];
      s += `<path d="M${f1(a[0])} ${f1(a[1])}Q${f1(c[0])} ${f1(c[1])} ${f1(e[0])} ${f1(e[1])}" fill="none" stroke="${INK}" stroke-width="${f1(sw)}"${nt.dash ? ` stroke-dasharray="${f1(4.5 * k)} ${f1(3.5 * k)}"` : ''}/>` + head(b, c);
    } else if (nt.k === 'step' && !nt.planOnly) {
      const c = g.P(g.W(nt.at));
      s += `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(6.6 * k)}" fill="#fff" stroke="${INK}" stroke-width="${f1(sw)}"/><text x="${f1(c[0])}" y="${f1(c[1] + 3.4 * k)}" font-size="${f1(9.5 * k)}" text-anchor="middle" class="mono" fill="${INK}">${nt.n}</text>`;
    } else if (nt.k === 'tag') {
      const c = g.P(g.W(nt.at));
      const x = c[0] + (nt.dx ?? 0) * k, y = c[1] + (nt.dy ?? -9) * k;
      if (nt.clock) s += clock(x, y - 3.4 * k) + text(x + 8 * k, y, nt.label);
      else s += text(x, y, nt.label, 'middle');
    } else if (nt.k === 'dim') {
      const a = g.P(g.W(nt.a)), b = g.P(g.W(nt.b));
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, t = 3.5 * k;
      s += line(a, b) + line([a[0] - nx * t, a[1] - ny * t], [a[0] + nx * t, a[1] + ny * t]) + line([b[0] - nx * t, b[1] - ny * t], [b[0] + nx * t, b[1] + ny * t]);
      s += text(Math.max(a[0], b[0]) + (nt.dx ?? 9) * k, (a[1] + b[1]) / 2 + (nt.dy ?? 3.5) * k, nt.label);
    } else if (nt.k === 'dimh') {
      const b = g.ubox(nt.u[0], nt.u[1]);
      if (!b) continue;
      const x = b.x1 + 10 * k;
      const y0 = g.P([...g.cellXY(nt.u[0], nt.u[1]), g.cam.floor])[1], y1 = b.plat, t = 3.5 * k;
      s += line([x, y0], [x, y1]) + line([x - t, y0], [x + t, y0]) + line([x - t, y1], [x + t, y1]) + text(x + 7 * k, (y0 + y1) / 2 + 3.5 * k, nt.label);
    }
  }
  return `<svg class="ov" viewBox="0 0 ${iw} ${ih}">${s}</svg>`;
}

/** 平面图：行 0 在上。世界单位（一格 = pitch）。线稿上的记号在这里再画一遍（落下 ▼ · 收回 ▲ · 不落 ✕ · 路线 · 视线）。
 *  big = 放大时的版面像素（0 = 画在线稿角上的小图）。放大的平面图按真实尺寸画（11-26 作者：步数、让人、头顶重叠这些
 *  是平面上的关系，轴测里看不准，平面图要放大、多担信息）：台面 0.69 m、人的身体 ⌀0.44 m、落着的台填浅灰、
 *  没落的台与身体重叠的那一块涂黑、让路时收回的带画成台面的缺口，另有只画在平面上的记号：
 *  { k:'cand', cells:[[行,列]…] } 候选 / 将要落的台（点线框）· { k:'ring', at, r:[米…], label? } 以某点为心的距离圈 ·
 *  { k:'step', at:[行,列], n } 引猫的第几步（写在那一格的角上）· 右下角 1 m 比例尺 */
let planUid = 0;
function keyplan(d, notes, attrs = 'class="key"', big = 0, pose = 'stand') {
  const { n, pitch: p } = d;
  const g = geom(d);
  const m = d.cam.m;
  const R = (n / 2) * p + p * 0.14;
  const V = R + p * (big ? 0.16 : 0.08);
  const id = `kp${planUid++}`;
  const has = (list, r, c) => list.some((u) => u[0] === r && u[1] === c);
  const at = (r, c) => [(c - (n - 1) / 2) * p, (r - (n - 1) / 2) * p];
  const lim = R - p * 0.05;
  const xy = (spec) => { const w = g.W(spec); return [Math.max(-lim, Math.min(lim, w[0])), Math.max(-lim, Math.min(lim, -w[1]))]; };
  const u = big ? ((2 * V) / big) * 0.34 : p / 100; // 线宽单位：放大时按版面像素定（1u ≈ 0.34 px）
  const px = big ? (2 * V) / big : 0;               // 一个版面像素合多少世界单位
  const h = big ? 0.345 * m : p * 0.4;              // 台面半边长
  const bodyR = big ? 0.22 * m : p * 0.15, catR = big ? 0.1 * m : p * 0.085;
  const text = (x, y, t, anchor = 'start', sz = 8.5) => `<text x="${f1(x)}" y="${f1(y)}" font-size="${f1(sz * px)}" text-anchor="${anchor}" class="mono" fill="${INK}" stroke="#fff" stroke-width="${f1(2.6 * px)}" paint-order="stroke" stroke-linejoin="round">${t}</text>`;
  let defs = `<clipPath id="${id}r"><rect x="${-R}" y="${-R}" width="${2 * R}" height="${2 * R}"/></clipPath>`;
  let s = `<rect x="${-R}" y="${-R}" width="${2 * R}" height="${2 * R}" fill="#fff" stroke="${MID}" stroke-width="${2.2 * u}"/>`;
  for (const f of d.furn) s += `<rect x="${f[0]}" y="${-f[3]}" width="${f[2] - f[0]}" height="${f[3] - f[1]}" fill="none" stroke="${big ? MID : PALE}" stroke-width="${2.2 * u}"/>`;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const [x, y] = at(r, c);
      const box = (extra) => `<rect x="${x - h}" y="${y - h}" width="${2 * h}" height="${2 * h}" ${extra}/>`;
      if (has(d.marked, r, c) && !d.bands) s += box(`fill="${TONE}" stroke="${INK}" stroke-width="${4.5 * u}"`);
      else if (has(d.down, r, c)) s += box(`fill="${big ? '#ececec' : 'none'}" stroke="${MID}" stroke-width="${2.2 * u}"`);
      else if (has(d.ghosts, r, c)) s += box(`fill="none" stroke="${INK}" stroke-width="${2.8 * u}" stroke-dasharray="${9 * u} ${7 * u}"`);
      else s += `<circle cx="${x}" cy="${y}" r="${p * 0.04}" fill="${PALE}"/>`;
      // 让路时收回的带：台面上朝那几个方位的缺口
      const ang = (d.retracted?.[`${r},${c}`] ?? []).slice().sort((a, b) => a - b);
      if (ang.length) {
        defs += `<clipPath id="${id}u${r}${c}"><rect x="${x - h - 3 * u}" y="${y - h - 3 * u}" width="${2 * h + 6 * u}" height="${2 * h + 6 * u}"/></clipPath>`;
        const runs = [];
        for (const a of ang) (runs.length && a - runs[runs.length - 1][1] <= 20 ? (runs[runs.length - 1][1] = a) : runs.push([a, a]));
        if (runs.length > 1 && runs[0][0] + 360 - runs[runs.length - 1][1] <= 20) { runs[0][0] = runs.pop()[0] - 360; }
        for (const [a0, a1] of runs) {
          const pts = [[x, y]];
          for (let a = a0 - 9; a <= a1 + 9 + 1e-6; a += 6) pts.push([x + Math.cos((a * Math.PI) / 180) * p * 0.7, y + Math.sin((a * Math.PI) / 180) * p * 0.7]);
          // 缺口涂白，两条切边描黑
          s += `<g clip-path="url(#${id}u${r}${c})"><polygon points="${pts.map((q) => `${f1(q[0])},${f1(q[1])}`).join(' ')}" fill="#fff"/>` +
            (big ? [pts[1], pts[pts.length - 1]] : []).map((q) => `<line x1="${x}" y1="${y}" x2="${f1(q[0])}" y2="${f1(q[1])}" stroke="${INK}" stroke-width="${3.4 * u}"/>`).join('') + '</g>';
        }
      }
    }
  const ln = (a, b, dash, w = 3) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${INK}" stroke-width="${w * u}"${dash ? ` stroke-dasharray="${8 * u} ${6 * u}"` : ''}/>`;
  const hd = (tip, from, sz = 15) => {
    const L = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1;
    const ux = (tip[0] - from[0]) / L, uy = (tip[1] - from[1]) / L;
    const b = [tip[0] - ux * sz * u, tip[1] - uy * sz * u], w = sz * 0.45 * u;
    return `<polygon points="${tip[0]},${tip[1]} ${b[0] - uy * w},${b[1] + ux * w} ${b[0] + uy * w},${b[1] - ux * w}" fill="${INK}"/>`;
  };
  // 只画在平面上的：候选台、距离圈
  for (const nt of notes ?? []) {
    if (nt.k === 'cand') {
      for (const [r, c] of nt.cells) { const [x, y] = at(r, c); s += `<rect x="${x - h}" y="${y - h}" width="${2 * h}" height="${2 * h}" fill="none" stroke="${INK}" stroke-width="${2.2 * u}" stroke-dasharray="${2.5 * u} ${6 * u}" stroke-linecap="round"/>`; }
    } else if (nt.k === 'ring' && big) {
      const [x, y] = xy(nt.at);
      nt.r.forEach((rm) => { s += `<circle clip-path="url(#${id}r)" cx="${x}" cy="${y}" r="${rm * m}" fill="none" stroke="${INK}" stroke-width="${2.2 * u}" stroke-dasharray="${7 * u} ${6 * u}"/>`; });
    }
  }
  if (d.gaze && d.people.length && d.cats.length) s += ln(xy('p0'), xy('c0'), true, 2.4);
  for (const nt of notes ?? []) {
    if (nt.k === 'dim') {
      s += ln(xy(nt.a), xy(nt.b), false, 2.4);
    } else if (nt.k === 'walk' || nt.k === 'hop') {
      const q = (nt.k === 'hop' ? [nt.a, nt.b] : nt.pts).map(xy);
      for (let i = 0; i + 1 < q.length; i++) s += ln(q[i], q[i + 1], nt.dash);
      s += hd(q[q.length - 1], q[q.length - 2]);
    }
  }
  // 没落的台与人的身体重叠的那一块
  // 没落的台与人的身体重叠的那一块：斜线
  if (big && d.ghosts.length) {
    defs += `<pattern id="${id}h" patternUnits="userSpaceOnUse" width="${f1(3.4 * px)}" height="${f1(3.4 * px)}" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${f1(3.4 * px)}" stroke="${INK}" stroke-width="${f1(1.7 * px)}"/></pattern>`;
    d.ghosts.forEach(([r, c], gi) => {
      const [x, y] = at(r, c);
      defs += `<clipPath id="${id}g${gi}"><rect x="${x - h}" y="${y - h}" width="${2 * h}" height="${2 * h}"/></clipPath>`;
      for (const a of d.anchors.people) s += `<circle clip-path="url(#${id}g${gi})" cx="${a.c[0]}" cy="${-a.c[1]}" r="${bodyR}" fill="url(#${id}h)" stroke="${INK}" stroke-width="${3 * u}"/>`;
    });
  }
  // 人 = 小人图标（走 / 站 / 坐按这一章），猫 = 猫头；触发的涂黑、其余涂灰。放大的平面图另画一圈身体的真实占地（⌀0.44 m）
  const put = (kind, a, hgt) => {
    const box = kind === 'cat' ? 24 : 28, k = hgt / box;
    return `<g transform="translate(${f1(a.c[0] - 12 * k)} ${f1(-a.c[1] - (box / 2) * k)}) scale(${k.toFixed(4)})">${glyph(kind, a.trigger ? INK : DIM, true)}</g>`;
  };
  for (const a of d.anchors.people) {
    if (big) s += `<circle cx="${a.c[0]}" cy="${-a.c[1]}" r="${bodyR}" fill="none" stroke="${a.trigger ? INK : MID}" stroke-width="${2 * u}" stroke-dasharray="${2 * u} ${4.5 * u}" stroke-linecap="round"/>`;
    s += put(pose === 'walk' || pose === 'sit' ? pose : 'stand', a, p * (big ? 0.5 : 0.62));
  }
  for (const a of d.anchors.cats) s += put('cat', a, p * (big ? 0.3 : 0.4));
  for (const nt of notes ?? []) {
    if ((nt.k === 'down' || nt.k === 'up') && nt.u) {
      const [x, y] = at(nt.u[0], nt.u[1]);
      const t = p * (big ? 0.12 : 0.15), dy = nt.k === 'up' ? -1 : 1;
      s += `<polygon points="${x - t},${y - dy * t * 0.8} ${x + t},${y - dy * t * 0.8} ${x},${y + dy * t * 0.9}" fill="${INK}"/>`;
    } else if (nt.k === 'x') {
      let [x, y] = xy(nt.at), t = p * 0.17;
      // 放大的平面图里人正好在这台正下方：✕ 让到台的左上角，不压在小人上
      if (big && d.anchors.people.some((a) => Math.hypot(a.c[0] - x, -a.c[1] - y) < p * 0.3)) { x -= h * 0.6; y -= h * 0.6; t = p * 0.1; }
      const dd = `M${x - t} ${y - t}L${x + t} ${y + t}M${x + t} ${y - t}L${x - t} ${y + t}`;
      s += (big ? `<path d="${dd}" stroke="#fff" stroke-width="${11 * u}" fill="none" stroke-linecap="round"/>` : '') + `<path d="${dd}" stroke="${INK}" stroke-width="${4.5 * u}" fill="none"/>`;
    } else if (nt.k === 'clash' && !big) {
      const [x, y] = xy(nt.at);
      s += `<circle cx="${x}" cy="${y}" r="${p * 0.11}" fill="none" stroke="${INK}" stroke-width="${3.4 * u}"/>`;
    } else if (nt.k === 'step' && big) {
      const [x, y] = at(nt.at[0], nt.at[1]), q = h - 7.5 * px;
      s += `<circle cx="${f1(x - q)}" cy="${f1(y - q)}" r="${f1(5.6 * px)}" fill="#fff" stroke="${INK}" stroke-width="${2.6 * u}"/>` + `<text x="${f1(x - q)}" y="${f1(y - q + 2.9 * px)}" font-size="${f1(8 * px)}" text-anchor="middle" class="mono" fill="${INK}">${nt.n}</text>`;
    } else if (nt.k === 'ring' && big && nt.label) {
      const [x, y] = xy(nt.at), rr = nt.r[nt.r.length - 1] * m, a = ((nt.la ?? 215) * Math.PI) / 180;
      s += text(x + Math.cos(a) * rr + (nt.dx ?? 0) * px, y + Math.sin(a) * rr + (nt.dy ?? -4) * px, nt.label, nt.anchor ?? 'middle');
    } else if (nt.k === 'dim' && big && nt.label) {
      const a = xy(nt.a), b = xy(nt.b);
      s += text((a[0] + b[0]) / 2 + 5 * px, (a[1] + b[1]) / 2 - 4 * px, nt.label);
    } else if (nt.k === 'tag' && big && nt.plan !== false && nt.at !== 'gaze') {
      const [x, y] = xy(nt.at);
      s += text(x + 9 * px, y - 7 * px, nt.label);
    } else if (nt.k === 'tag' && big && nt.at === 'gaze') {
      const a = xy('p0'), b = xy('c0');
      s += text((a[0] + b[0]) / 2 + 6 * px, (a[1] + b[1]) / 2 + 10 * px, nt.label);
    }
  }
  let extra = 0;
  if (big) { // 比例尺：画在框外的右下角
    extra = 13 * px;
    const x1 = R, y1 = V + 8 * px;
    s += `<path d="M${f1(x1 - m)} ${f1(y1 - 3 * px)}V${f1(y1)}H${f1(x1)}V${f1(y1 - 3 * px)}" fill="none" stroke="${INK}" stroke-width="${2.6 * u}"/>` + text(x1 - m - 5 * px, y1 + 1 * px, '1 m', 'end', 7.5);
  }
  return `<svg ${attrs} viewBox="${-V} ${-V} ${2 * V} ${2 * V + extra}"><defs>${defs}</defs>${s}</svg>`;
}

/** 图标（11-26 作者：平面上的人用公共标识那种小人，猫用一个圆加两只三角耳朵；用图标代替成段的解释）。
 *  小人画在 24 × 28 的格子里、猫头在 24 × 24 的格子里，都是实心剪影；halo = 垫一圈白边，压在别的线上也分得开。 */
const DIM = '#b4b4b4';
function glyph(kind, fill = INK, halo = false) {
  const a = `fill="${fill}"` + (halo ? ` stroke="#fff" stroke-width="1.5" paint-order="stroke" stroke-linejoin="round"` : '');
  const chair = `fill="${DIM}"`;
  return {
    stand: `<circle cx="12" cy="4" r="3.4" ${a}/><path d="M8.6 8.6h6.8a2.4 2.4 0 0 1 2.4 2.4v6.6h-2v-5.4h-.7V27.4h-2.5v-8.6h-1.2v8.6H8.9V12.2h-.7v5.4h-2V11a2.4 2.4 0 0 1 2.4-2.4z" ${a}/>`,
    walk: `<circle cx="12.6" cy="4" r="3.4" ${a}/><path d="M9.4 8.6h5.6a2 2 0 0 1 1.9 1.3l2.6 6-1.8.9-2-4.2v4.6l3.6 9.6-2.5.9-3.6-8.6-3.3 8.8-2.5-.9 3-9.4v-5.2l-2.6 4.4-1.8-1 3.4-6.2a2 2 0 0 1 2-1z" ${a}/>`,
    sit: `<rect x="2.6" y="8" width="1.5" height="19.4" ${chair}/><rect x="2.6" y="19.6" width="11.4" height="1.5" ${chair}/><rect x="12.5" y="19.6" width="1.5" height="7.8" ${chair}/>` +
      `<circle cx="9.4" cy="4.4" r="3.3" ${a}/><path d="M7.4 8.8h4a2.2 2.2 0 0 1 2.2 2.2v4h4.6a2 2 0 0 1 2 2v10.4h-2.8v-8.6H8.6a2 2 0 0 1-2-2V11a2.2 2.2 0 0 1 .8-2.2z" ${a}/>`,
    cat: `<path d="M4.4 12.6 5.2 2.6 11 7.2a8 8 0 0 1 2 0L18.8 2.6l.8 10a7.9 7.9 0 1 1-15.2 0z" ${a}/>`,
    unit: `<g fill="none" stroke="${INK}" stroke-width="1.5"><path d="M12 0V13M3 2H21"/><rect x="4" y="13" width="16" height="4.5"/><path d="M2 27H22" stroke-dasharray="2 2"/></g>`,
  }[kind];
}
function icon(kind, sz = 26, fill = INK) {
  const hgt = kind === 'cat' ? 24 : 28;
  return `<svg width="${sz}" height="${f1((sz * hgt) / 24)}" viewBox="0 0 24 ${hgt}">${glyph(kind, fill)}</svg>`;
}

/** 版头的关系图：列 = 前提 + 人的三种状态，行 = 单元不妨碍人 / 单元落下的台；节点 = 那一行的平面小图；箭头 = 前提 */
function mapSvg(m, rows) {
  const Wd = 700, colX = [58, 226, 366, 506, 624], bandY = [96, 200], T = 58, HX = T / 2 + 4, HT = T / 2 + 19;
  const head = (i, x) => `<g transform="translate(${x - 44} 2)">${icon(m.icons[i], 22)}</g><text x="${x - 16}" y="20" font-size="12.5" font-weight="600" fill="${INK}">${m.cols[i]}</text>` +
    (m.counts[i] == null ? '' : `<g transform="translate(${x + 22} 9)">${m.counts[i] === 0 ? `<rect width="9" height="9" fill="none" stroke="${MID}" stroke-dasharray="2 2"/>` : Array.from({ length: m.counts[i] }, (_, j) => `<rect x="${j * 12}" width="9" height="9" fill="${TONE}" stroke="${INK}" stroke-width="1.2"/>`).join('')}</g>`);
  let s = `<line x1="0" y1="38" x2="${Wd}" y2="38" stroke="${INK}"/><line x1="128" y1="46" x2="128" y2="250" stroke="${PALE}"/>` +
    `<line x1="140" y1="146" x2="${Wd}" y2="146" stroke="${PALE}" stroke-dasharray="3 3"/>`;
  s += head(0, colX[0] + 14) + head(1, colX[1] + 8) + head(2, colX[2] + 8) + head(3, (colX[3] + colX[4]) / 2 + 8);
  m.bands.forEach((b, i) => { s += `<text x="140" y="${bandY[i] + 4}" font-size="10" fill="#888" letter-spacing="1.2">${b}</text>`; });
  const pos = {};
  for (const [no, [c, b]] of Object.entries(m.nodes)) pos[no] = [colX[c], bandY[b]];
  const tipOf = (tip, from) => {
    const L = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1, ux = (tip[0] - from[0]) / L, uy = (tip[1] - from[1]) / L;
    const bq = [tip[0] - ux * 7, tip[1] - uy * 7];
    return `<polygon points="${f1(tip[0])},${f1(tip[1])} ${f1(bq[0] - uy * 3)},${f1(bq[1] + ux * 3)} ${f1(bq[0] + uy * 3)},${f1(bq[1] - ux * 3)}" fill="${INK}"/>`;
  };
  const arrow = (a, b, under) => {
    const [ax, ay] = pos[a], [bx, by] = pos[b];
    if (under) { // 从下面绕过去
      const y = Math.max(ay, by) + T / 2 + 14;
      return `<path d="M${ax} ${ay + T / 2 + 4}V${y}H${bx}V${by + T / 2 + 9}" fill="none" stroke="${INK}" stroke-width="1.1"/>` + tipOf([bx, by + T / 2 + 4], [bx, y]);
    }
    const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
    // 节点的外框：小图四周留一点，上面多留出标签那一行
    const reach = (x, y) => Math.min(Math.abs(x) > 1e-6 ? HX / Math.abs(x) : 1e9, Math.abs(y) > 1e-6 ? (y < 0 ? HT : HX) / Math.abs(y) : 1e9);
    const s0 = reach(ux, uy), s1 = reach(-ux, -uy);
    const from = [ax + ux * s0, ay + uy * s0], tip = [bx - ux * s1, by - uy * s1];
    return `<path d="M${f1(from[0])} ${f1(from[1])}L${f1(tip[0] - ux * 4)} ${f1(tip[1] - uy * 4)}" fill="none" stroke="${INK}" stroke-width="1.1"/>` + tipOf(tip, from);
  };
  // 前提 → 其余各行：一支从左栏进到表里的箭头
  s += `<path d="M${colX[0] + T / 2 + 10} 146H134" fill="none" stroke="${INK}" stroke-width="1.1"/>` + tipOf([140, 146], [100, 146]);
  for (const e of m.edges) s += arrow(e[0], e[1], e[2] === 'under');
  for (const [no, [x, y]] of Object.entries(pos)) {
    const r = rows[no];
    const pn = r.panels[r.thumb ?? 1];
    s += keyplan(side(pn.img), pn.notes, `x="${x - T / 2}" y="${y - T / 2}" width="${T}" height="${T}"`, 0, r._pose);
    s += `<text x="${x - T / 2}" y="${y - T / 2 - 7}" font-size="10" fill="${INK}"><tspan class="mono" fill="#888">${no}</tspan> ${r.short}</text>`;
  }
  return `<svg class="map" viewBox="0 0 ${Wd} 252">${s}</svg>`;
}

/** 图例：一格一个图标，下面一两个字（11-26 作者：用图标代替开头成段的解释） */
const legend = () => {
  const sv = (inner, w = 26, hgt = 22) => `<svg width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" fill="none" stroke="${INK}" stroke-width="1.2">${inner}</svg>`;
  const pair = (fill) => `<span class="pair">${icon('stand', 15, fill)}${icon('cat', 12, fill)}</span>`;
  const items = [
    [pair(INK), '触发'],
    [pair(DIM), '在场'],
    [sv(`<rect x="5" y="3" width="16" height="16" fill="${TONE}" stroke-width="1.8"/>`), '被调动的台'],
    [sv(`<rect x="5" y="3" width="16" height="16" fill="#ececec" stroke="${MID}"/>`), '落着的台'],
    [sv(`<circle cx="13" cy="11" r="1.6" fill="${PALE}" stroke="none"/>`), '收着的台'],
    [sv(`<path d="M13 2V13"/><polygon points="13,20 9.6,12 16.4,12" fill="${INK}" stroke="none"/>`), '落下'],
    [sv(`<path d="M13 20V9"/><polygon points="13,2 9.6,10 16.4,10" fill="${INK}" stroke="none"/>`), '收回'],
    [sv(`<rect x="5" y="3" width="16" height="16" stroke-dasharray="3 2.4"/><path d="M9 7L17 15M17 7L9 15" stroke-width="1.7"/>`), '不落'],
    [sv(`<rect x="5" y="3" width="16" height="16" stroke-dasharray="1.2 2.8" stroke-linecap="round"/>`), '将要落'],
    [sv(`<defs><pattern id="lgh" patternUnits="userSpaceOnUse" width="3.4" height="3.4" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3.4" stroke="${INK}" stroke-width="1.6"/></pattern></defs><circle cx="13" cy="11" r="8" stroke="${MID}" stroke-dasharray="1.2 2.6" stroke-linecap="round"/><path d="M13 11V3A8 8 0 0 1 21 11Z" fill="url(#lgh)"/>`), '与身体重叠'],
    [sv(`<path d="M2 17Q11 -3 21 12" stroke-dasharray="3.5 2.6"/><polygon points="24,16 18,14 21.6,10" fill="${INK}" stroke="none"/>`), '将要去'],
    [sv(`<path d="M2 17Q11 -3 21 12"/><polygon points="24,16 18,14 21.6,10" fill="${INK}" stroke="none"/>`), '已走过'],
    [sv(`<path d="M1 11H25" stroke-dasharray="4 3"/>`), '视线'],
    [sv(`<circle cx="13" cy="11" r="6.4"/><path d="M13 6.6V11H16.6"/>`), '时长'],
    [sv(`<circle cx="13" cy="11" r="6.6"/><text x="13" y="14.6" font-size="10" text-anchor="middle" fill="${INK}" stroke="none" class="mono">1</text>`), '引猫第几步'],
  ];
  return `<div class="legend">${items.map(([g, t]) => `<span>${g}<em>${t}</em></span>`).join('')}</div>`;
};
/** 目的：坐着的人与台上的猫相距 1.0–1.5 m */
const goal = () => `<svg class="goal" viewBox="0 0 200 58" width="200" height="58"><g transform="translate(6 4) scale(1.75)">${glyph('sit')}</g>` +
  `<rect x="128" y="34" width="60" height="7" fill="${TONE}" stroke="${INK}" stroke-width="1.4"/><path d="M158 41V58" stroke="${INK}" stroke-width="1.2"/><g transform="translate(146 9) scale(1)">${glyph('cat')}</g>` +
  `<path d="M52 20H140M52 16V24M140 16V24" fill="none" stroke="${INK}" stroke-width="1.1"/><text x="96" y="14" font-size="10.5" text-anchor="middle" class="mono" fill="${INK}">1.0–1.5 m</text></svg>`;

const rowsByNo = {};
for (const s of plate.sections) for (const r of s.rows) { r._pose = s.icon; rowsByNo[r.no] = r; }

const row = (r) => {
  const cols = r.cols ?? 3;
  const cssW = (BODY - GAP * (cols - 1)) / cols;
  const meta = [
    r.judge ? `<span><i class="mono">理解</i>${r.judge}</span>` : '',
    r.count ? `<span><i class="mono">30 分钟</i>${r.count}</span>` : '',
    r.needs?.length ? `<span><i class="mono">前提</i><b class="mono">${r.needs.join(' · ')}</b></span>` : '',
  ].join('');
  const big = r.plan === 'big';
  const planPx = cols > 3 ? 146 : 190;
  return `<article><div class="rule"><span class="no mono">${r.no}</span><h3>${r.title}</h3><div class="meta">${meta}</div></div>
<div class="row${big ? ' big' : ''}" style="--n:${cols};--key:${cols > 3 ? 62 : 78}px;--plan:${planPx}px">${r.panels.map((p, i) => {
    const d = side(p.img);
    const idn = `${r.no}-${i + 1}`;
    const cap = `<figcaption><i class="mono">${i + 1}</i><b>${p.stage}</b><span>${p.cap}</span></figcaption>`;
    // 平面上的关系为主的行：线稿上不放小图，平面图放大排在线稿下面、说明在它右边
    if (big) return `<figure><div class="shot" data-id="${idn}"><img src="${uri(p.img)}">${overlay(d, p.notes, cssW)}</div><div class="under">${keyplan(d, p.notes, `class="plan" data-id="${idn}-plan"`, planPx, r._pose)}${cap}</div></figure>`;
    return `<figure><div class="shot" data-id="${idn}"><img src="${uri(p.img)}">${overlay(d, p.notes, cssW)}${keyplan(d, p.notes, 'class="key"', 0, r._pose)}</div>${cap}</figure>`;
  }).join('')}</div></article>`;
};

const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#fff;color:${INK};font-family:"Noto Sans SC","Source Han Sans SC","PingFang SC","WenQuanYi Zen Hei",sans-serif;padding:56px 60px 44px;width:1200px;box-sizing:border-box}
  .mono{font-family:"JetBrains Mono","DejaVu Sans Mono",ui-monospace,monospace;font-style:normal}
  header{display:grid;grid-template-columns:1fr 2fr;column-gap:22px;padding-bottom:26px;align-items:start}
  h1{font-size:25px;line-height:1.3;font-weight:600;margin:0 0 12px}
  .lede{font-size:12px;line-height:1.75;color:#444;margin:0 0 18px}
  .goal{display:block;margin:2px 0 16px}
  .legend{display:grid;grid-template-columns:repeat(5,1fr);gap:10px 4px;border-top:1px solid ${PALE};padding-top:12px}
  .legend>span{display:flex;flex-direction:column;align-items:center;gap:3px}
  .legend svg{display:block}
  .legend .pair{display:flex;align-items:flex-end;gap:3px;height:22px}
  .legend em{font-style:normal;font-size:9.5px;color:#444;white-space:nowrap}
  .sw{display:inline-block;width:15px;height:11px;box-sizing:border-box}
  .map{display:block;width:100%;height:auto;font-family:inherit}
  section>h2 svg{flex:none}
  section>h2{display:flex;align-items:center;gap:12px;font-size:13px;font-weight:600;letter-spacing:.12em;margin:0;padding:8px 0;border-top:2.5px solid ${INK}}
  section>h2 span{font-weight:400;letter-spacing:0;font-size:11.5px;color:#555;margin-left:6px}
  article{border-top:1px solid ${INK};padding:11px 0 26px}
  .rule{display:flex;align-items:baseline;gap:12px;margin-bottom:10px}
  .rule .no{font-size:11px;letter-spacing:.14em;color:#777}
  .rule h3{font-size:16px;line-height:1.4;font-weight:600;margin:0}
  .meta{margin-left:auto;display:flex;gap:26px;font-size:11px;color:#333}
  .meta i{font-size:9.5px;letter-spacing:.14em;color:#999;margin-right:8px}
  .meta b{font-weight:400}
  .row{display:grid;grid-template-columns:repeat(var(--n),1fr);column-gap:${GAP}px}
  figure{margin:0;position:relative}
  .shot{position:relative;background:#fff}
  .shot img{display:block;width:100%;height:auto}
  .ov{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
  .key{position:absolute;left:0;bottom:0;width:var(--key,78px);height:var(--key,78px);background:#fff;padding:6px 6px 0 0}
  .under{display:grid;grid-template-columns:var(--plan) 1fr;column-gap:14px;align-items:start;border-top:1px solid ${PALE};margin-top:6px;padding-top:9px}
  .plan{display:block;width:var(--plan);height:auto}
  .row.big figcaption{border:0;margin:0;padding:2px 0 0}
  .row.big figcaption b{display:inline-block;margin-bottom:5px}
  .row.big figcaption span{display:block}
  .row.big figure:not(:last-child)::after{top:32%}
  figure:not(:last-child)::after{content:"";position:absolute;right:-${GAP / 2 + 5}px;top:44%;width:10px;height:10px;border-top:1.2px solid ${MID};border-right:1.2px solid ${MID};transform:rotate(45deg) scale(.8)}
  figcaption{border-top:1px solid ${PALE};margin-top:6px;padding-top:7px;font-size:11.5px;line-height:1.6;color:#333}
  figcaption i{color:#999;margin-right:8px;font-size:11px}
  figcaption b{font-weight:600;letter-spacing:.12em;color:${INK};margin-right:12px;font-size:11px}
  footer{border-top:1px solid ${INK};padding-top:10px;font-size:10.5px;color:#666}
</style>
<header><div><h1>${plate.title}</h1>${goal()}${legend()}</div>
<div>${mapSvg(plate.map, rowsByNo)}</div></header>
${plate.sections.map((s) => `<section><h2>${icon(s.icon, 20)}${s.name}<span>${s.note}</span></h2>${s.rows.map(row).join('')}</section>`).join('')}
<footer>地面一格 0.83 m。01 行画到天花板，其余各行只取到 2.4 m 高。</footer>`;
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: Number(width) / 1200 });
await pg.setContent(html);
await pg.waitForTimeout(300);
writeFileSync(resolve(out), await (await pg.$('body')).screenshot());
if (panelsOut) {
  mkdirSync(panelsOut, { recursive: true });
  for (const el of await pg.$$('.shot, .plan')) writeFileSync(join(panelsOut, (await el.getAttribute('data-id')) + '.png'), await el.screenshot());
}
await br.close();
console.log(out);
