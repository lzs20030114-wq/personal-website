// Lab 2-15 效果图的图纸风：标注层（2026-11-09）。
//
//   node scripts/unit-blender/cafe-board.mjs <cafe.json> <底图.png> <输出.png> [标注 full|light|none]
//
// 底图 = cafe_style.py 出的图，旁边要有同名 .cam.json（机位的投影矩阵）。这里只加「信息」，不加装饰：
//   · 落下来的每一台：它在给谁用、台面多高（茶几 / 餐桌 / 两层的下台与上台，数是仿真给的）；
//   · 坐着的人 → 给他当桌子的那一台：实线；人 → 正看着的那只猫：虚线（都是仿真里的关系，不是画的）；
//   · 一米比例尺（按机位真投影）、图例、题条。
// 文字只用平白的描述（CLAUDE.md「不自己造词」）。字：数字用站上的 JetBrains Mono，中文用文泉驿正黑。

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

// playwright 不在本仓库依赖里（容器全局装的那份），ESM 的 import 找不到全局包，走 require
const { chromium } = createRequire(import.meta.url)('playwright');

const [, , DATA, BASE, OUT, MODE_ARG] = process.argv;
const D = JSON.parse(readFileSync(DATA, 'utf8'));
const CAM = JSON.parse(readFileSync(BASE.replace(/\.png$/, '.cam.json'), 'utf8'));
// 取舍：人眼高度的透视只画关系线（看氛围），数据标签留给轴测与平面（看信息）
const MODE = MODE_ARG ?? (CAM.ortho ? 'full' : 'light');
const { w: W, h: H, M } = CAM;

const INK = '#0F2125', P700 = '#46467D', P500 = '#786FB5', N500 = '#76807B', N600 = '#5E6966', PAPER = '#F3F4ED';

/** 世界（Blender 系、米）→ 像素 */
function px([x, y, z]) {
  const v = [x, y, z, 1];
  const r = M.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2] + row[3] * v[3]);
  const ndc = [r[0] / r[3], r[1] / r[3]];
  return [((ndc[0] + 1) / 2) * W, (1 - (ndc[1] + 1) / 2) * H, r[3]];
}
const inView = ([x, y, w]) => w > 0 && x > -40 && x < W + 40 && y > -40 && y < H + 40;
const k = W / 1600;
const f = (v) => v.toFixed(2);

// ---------------------------------------------------------------- 锚点
const units = D.units.filter((u) => u.drop > 0.99);
const USE = { 'table:sofa': '茶几', 'table:chair': '餐桌', 'cat:half': '两层 · 给猫' };
const SHELTER_TOP = 1.48; // 两层的上台台面（项目二_人猫同台lab §14.24：两块之间 0.52 m，上台顶 1.48 m）
const headOf = (P) => P.joints.neck.map((v, i) => (i === 2 ? v + 0.1 : v));
const chestOf = (P) => P.joints.neck.map((v, i) => (i === 2 ? v - 0.22 : v));
function catHead(C) {
  const vs = C.blocks.filter((b) => b.on === 'head').flatMap((b) => b.verts);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < vs.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], vs[i + a]); hi[a] = Math.max(hi[a], vs[i + a]); }
  return lo.map((v, a) => (v + hi[a]) / 2);
}

const svg = [];
const put = (s) => svg.push(s);
const half = D.meta.roomM / 2;
const HALO = `paint-order="stroke" stroke="${PAPER}" stroke-width="${3.2 * k}" stroke-linejoin="round"`;
const textW = (s, size) => [...s].reduce((a, c) => a + (c.charCodeAt(0) > 255 ? size : size * 0.6), 0);

// 收在天花板下的单元：从上往下看的图里不画整台，只在地面上标它落下来会占的那一格（0.69 m 见方，8×8 铺满）
const CELL = 0.345;
if (CAM.ortho && !CAM.name.startsWith('S1')) {
  for (const u of D.units) {
    if (u.drop > 0.99) continue;
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => px([u.x + a * CELL, u.y + b * CELL, 0.002]));
    if (!q.every(inView)) continue;
    put(`<polygon points="${q.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="none" stroke="#A197D9" stroke-width="${0.7 * k}" stroke-dasharray="${3 * k} ${3 * k}"/>`);
  }
}

// ---------------------------------------------------------------- 剖切面涂实（图纸的老规矩：被切到的东西涂黑）
// 墙的开洞照 cafe_scene.build_room：−Y 墙三扇窗；−X 墙一扇门两扇窗；+X 墙一扇门；+Y 实墙。窗台 0.45 / 窗顶 3.25 m，门 0–2.35 m
const WALL_T = 0.2, CEIL = D.meta.ceiling, WALL_TOP = CEIL + 0.12;
const WALLS = [
  { axis: 'x', at: -half - WALL_T / 2, open: [[-2.95, -1.05], [-0.95, 0.95], [1.05, 2.95]] },
  { axis: 'y', at: -half - WALL_T / 2, open: [[-2.9, -1.0], [-0.55, 0.55], [1.0, 2.9]] },
  { axis: 'y', at: half + WALL_T / 2, open: [[-0.55, 0.55]] },
  { axis: 'x', at: half + WALL_T / 2, open: [] },
];
const L = half + WALL_T;
function wallRect(w, a, b, z) {
  const t = WALL_T / 2;
  const pts = w.axis === 'x'
    ? [[a, w.at - t], [b, w.at - t], [b, w.at + t], [a, w.at + t]]
    : [[w.at - t, a], [w.at + t, a], [w.at + t, b], [w.at - t, b]];
  return pts.map(([x, y]) => px([x, y, z]));
}
const poly = (q, fill) => `<polygon points="${q.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="${fill}"/>`;
const isPlan = CAM.name.startsWith('P1');
const isSection = CAM.name.startsWith('S1');
// 剖面里剖切线前面的人、猫不画（cafe_style.section_prep 同一条规矩），标注也跟着不标
const shown = (y, slack) => !isSection || y >= CAM.sectionY - slack;
if (isPlan) {
  // 剖切高度 1.9 m：墙涂实、开洞留白；门窗在这个高度都是开着的
  for (const w of WALLS) {
    let s0 = -L;
    for (const [a, b] of [...w.open].sort((p, q) => p[0] - q[0])) {
      if (a > s0) put(poly(wallRect(w, s0, a, 1.9), INK));
      s0 = b;
    }
    if (s0 < L) put(poly(wallRect(w, s0, L, 1.9), INK));
  }
  // 落下来的单元：1.9 m 处切到的是台面以上那截布筒（里面是芯与吊杆），涂成实心圆
  for (const u of units) {
    const c = px([u.x, u.y, 1.9]);
    const e = px([u.x + D.meta.stationR + 0.02, u.y, 1.9]);
    const r = Math.hypot(e[0] - c[0], e[1] - c[1]);
    put(`<circle cx="${f(c[0])}" cy="${f(c[1])}" r="${f(r)}" fill="${P700}" stroke="${PAPER}" stroke-width="${1.2 * k}"/>`);
  }
} else if (isSection) {
  // 剖面：地、天花、两端被切到的墙涂实；−X 墙在剖切线处正好是一扇窗（y 1.0–2.9，窗台 0.45、窗顶 3.25），窗洞留白
  const SY = CAM.sectionY;
  const rect = (x0, x1, z0, z1) => poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => px([x, SY, z])), INK);
  put(rect(-L, L, -0.12, 0));
  put(rect(-L, L, CEIL, CEIL + 0.14));
  put(rect(-L, -half, -0.12, 0.45));
  put(rect(-L, -half, 3.25, WALL_TOP));
  put(rect(half, L, -0.12, WALL_TOP));
  // 切到的单元：外皮与剖切面的交线，粗紫线
  for (const u of units) {
    if (Math.abs(u.y - SY) > 0.05) continue;
    for (const key of ['cover', 'gore']) {
      const V = u[key], I = u[key + 'Idx'];
      const segs = [];
      for (let t = 0; t < I.length; t += 3) {
        const pts = [];
        for (let e = 0; e < 3; e++) {
          const a = I[t + e] * 3, b = I[t + ((e + 1) % 3)] * 3;
          const da = V[a + 1] - SY, db = V[b + 1] - SY;
          if ((da < 0) !== (db < 0)) {
            const r = da / (da - db);
            pts.push([V[a] + (V[b] - V[a]) * r, SY, V[a + 2] + (V[b + 2] - V[a + 2]) * r]);
          }
        }
        if (pts.length === 2) segs.push(pts);
      }
      for (const [p0, p1] of segs) {
        const a = px(p0), b = px(p1);
        put(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${P700}" stroke-width="${2.6 * k}" stroke-linecap="round"/>`);
      }
    }
  }
  // 标高：切到的几台的台面高度 + 天花，虚线拉到右边墙外，三角 + 数字 + 平白的名字；每台的用途写在地面线下
  const cutUnits = units.filter((u) => Math.abs(u.y - SY) <= 0.05);
  const lv = new Map();
  const addLv = (z, name, x) => { const o = lv.get(z.toFixed(2)) ?? { z, names: new Set(), x }; o.names.add(name); o.x = Math.min(o.x, x); lv.set(z.toFixed(2), o); };
  for (const u of cutUnits) {
    if (u.role === 'cat:half') { addLv(u.table, '两层的下台', u.x); addLv(SHELTER_TOP, '两层的上台', u.x); }
    else addLv(u.table, USE[u.role] + '台面', u.x);
  }
  addLv(CEIL, '天花板', -half);
  for (const o of lv.values()) {
    const a = px([o.x - 0.2, SY, o.z]), b = px([L + 0.25, SY, o.z]);
    put(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${P500}" stroke-width="${0.7 * k}" stroke-dasharray="${5 * k} ${4 * k}"/>`);
    const tx = b[0] + 6 * k, ty = b[1];
    put(`<path d="M${f(tx)},${f(ty)} l${f(5 * k)},${f(-8 * k)} l${f(-10 * k)},0 z" fill="none" stroke="${INK}" stroke-width="${0.9 * k}"/>`);
    put(`<text x="${f(tx + 10 * k)}" y="${f(ty + 4 * k)}" font-size="${f(12 * k)}" fill="${INK}" ${HALO}>${o.z.toFixed(2)} m  <tspan fill="${N600}">${[...o.names].join(' · ')}</tspan></text>`);
  }
  for (const u of cutUnits) {
    const a = px([u.x, SY, -0.32]);
    put(`<text x="${f(a[0])}" y="${f(a[1])}" text-anchor="middle" font-size="${f(12.5 * k)}" fill="${P700}" font-weight="600" ${HALO}>${USE[u.role] ?? '台'}</text>`);
  }
} else if (CAM.ortho) {
  // 轴测剖切：远处两面墙的顶（被切开的那一刀）涂实
  for (const w of WALLS.slice(0, 2)) put(poly(wallRect(w, -L, L, WALL_TOP), INK));
}

// 标注：竞赛图纸的老办法——字排在两侧的栏里，引线拉回到物体上，不压在画面中间
const items = [];
if (MODE !== 'none') {
  // 关系线（先画，压在标签下面）
  for (const P of D.people) {
    if (!shown(P.y, 0.15)) continue;
    if (P.seated && P.seatTable !== null) {
      const u = D.units.find((v) => v.i === P.seatTable);
      if (u && u.drop > 0.99) {
        const a = px(chestOf(P)), b = px([u.x, u.y, u.table]);
        if (inView(a) && inView(b)) {
          put(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${P500}" stroke-width="${1.4 * k}"/>`);
          put(`<circle cx="${f(a[0])}" cy="${f(a[1])}" r="${2.6 * k}" fill="${P500}"/>`);
        }
      }
    }
    if (P.watchCat >= 0 && shown(D.cats[P.watchCat].y, 0.4)) {
      const a = px(headOf(P)), b = px(catHead(D.cats[P.watchCat]));
      if (inView(a) && inView(b)) put(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${INK}" stroke-width="${1 * k}" stroke-dasharray="${4 * k} ${3.5 * k}" opacity="0.8"/>`);
    }
  }
  if (MODE === 'full' && !isSection) {
    for (const u of units) {
      if (!shown(u.y, 0.35)) continue;
      const a = px([u.x, u.y, u.table]);
      if (!inView(a)) continue;
      const lines = u.role === 'cat:half'
        ? [USE[u.role], `下台 ${u.table.toFixed(2)} m · 上台 ${SHELTER_TOP.toFixed(2)} m`]
        : [USE[u.role] ?? '台', `台面 ${u.table.toFixed(2)} m${u.doors ? ' · 有带子让路' : ''}`];
      items.push({ a, lines, color: P700 });
    }
    for (const C of D.cats) {
      if (!shown(C.y, 0.4)) continue;
      const a = px(catHead(C));
      if (inView(a)) items.push({ a, lines: [C.coatName.replace(/（.*）/, '')], color: INK });
    }
  }
}
{
  const size = 12.5 * k, gap = 8 * k, top = 70 * k, bottom = H - 140 * k, margin = 28 * k;
  for (const side of ['L', 'R']) {
    const col = items.filter((it) => (side === 'L') === (it.a[0] < W / 2)).sort((p, q) => p.a[1] - q.a[1]);
    let y = top;
    for (const it of col) {
      it.w = Math.max(...it.lines.map((l) => textW(l, size))) + 8 * k;
      it.h = it.lines.length * size * 1.3 + 4 * k;
      it.y = Math.max(y, it.a[1] - it.h / 2);
      y = it.y + it.h + gap;
    }
    // 底下放不下就整栏往上推
    let over = y - gap - bottom;
    for (let i = col.length - 1; i >= 0 && over > 0; i--) {
      const it = col[i];
      it.y -= over;
      const prev = col[i - 1];
      over = prev ? prev.y + prev.h + gap - it.y : 0;
    }
    const colW = Math.max(0, ...col.map((it) => it.w));
    for (const it of col) {
      const x0 = side === 'L' ? margin : W - margin - colW;
      const edge = side === 'L' ? x0 + colW : x0;
      const elbow = edge + (side === 'L' ? 18 * k : -18 * k);
      const my = it.y + it.h / 2;
      put(`<polyline points="${f(it.a[0])},${f(it.a[1])} ${f(elbow)},${f(my)} ${f(edge)},${f(my)}" fill="none" stroke="${it.color}" stroke-width="${0.8 * k}" opacity="0.9"/>`);
      put(`<circle cx="${f(it.a[0])}" cy="${f(it.a[1])}" r="${2.6 * k}" fill="${it.color}"/>`);
      const tx = side === 'L' ? edge - 4 * k : edge + 4 * k;
      const anchor = side === 'L' ? 'end' : 'start';
      put(`<rect x="${f(side === 'L' ? edge - it.w : edge)}" y="${f(it.y)}" width="${f(it.w)}" height="${f(it.h)}" fill="${PAPER}" opacity="0.9"/>`);
      it.lines.forEach((l, i) => {
        put(`<text x="${f(tx)}" y="${f(it.y + (i + 1) * size * 1.3 - size * 0.3)}" text-anchor="${anchor}" font-size="${f(size)}" fill="${i ? N600 : it.color}" ${i ? '' : 'font-weight="600"'} ${HALO}>${l}</text>`);
      });
    }
  }
}

// ---------------------------------------------------------------- 比例尺：从画面最左那个地面角起，沿通向镜头的那条边量 2 m，往房间外让 0.35 m（真投影）
let ruler = '';
if (isSection || isPlan) {
  // 剖面：地面线下 0.55 m，右墙内皮往左量 2 m；平面：下边墙外 0.6 m、右半边
  const pts = [0, 1, 2].map((m) => (isSection ? px([half - 2 + m, CAM.sectionY, -0.55]) : px([0.4 + m, -half - 0.62, 0])));
  ruler = pts.map((p) => `<line x1="${f(p[0])}" y1="${f(p[1] - 5 * k)}" x2="${f(p[0])}" y2="${f(p[1] + 5 * k)}" stroke="${INK}" stroke-width="${1.1 * k}"/>`).join('');
  ruler += `<polyline points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="${1.1 * k}"/>`;
  ruler += ['0', '1', '2 m'].map((t, i) => `<text x="${f(pts[i][0])}" y="${f(pts[i][1] + 18 * k)}" text-anchor="middle" font-size="${f(11 * k)}" fill="${INK}" ${HALO}>${t}</text>`).join('');
} else if (CAM.ortho) {
  const C = [[-half, -half], [half, -half], [half, half], [-half, half]];
  const sp = C.map(([x, y]) => px([x, y, 0]));
  const li = sp.reduce((b, p, i) => (p[0] < sp[b][0] ? i : b), 0); // 画面最左的角
  const ni = [(li + 1) % 4, (li + 3) % 4].sort((a, b) => sp[b][1] - sp[a][1])[0]; // 往画面下方走的那条边
  const o = C[li], e = C[ni];
  const dir = [(e[0] - o[0]) / D.meta.roomM, (e[1] - o[1]) / D.meta.roomM];
  const out = o[0] === e[0] ? [Math.sign(o[0]), 0] : [0, Math.sign(o[1])];
  const at = (m) => px([o[0] + dir[0] * (m + 0.5) + out[0] * 0.35, o[1] + dir[1] * (m + 0.5) + out[1] * 0.35, 0]);
  const pts = [0, 1, 2].map(at);
  ruler = pts.map((p) => `<line x1="${f(p[0])}" y1="${f(p[1] - 5 * k)}" x2="${f(p[0])}" y2="${f(p[1] + 5 * k)}" stroke="${INK}" stroke-width="${1.1 * k}"/>`).join('');
  ruler += `<polyline points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="${1.1 * k}"/>`;
  ruler += ['0', '1', '2 m'].map((t, i) => `<text x="${f(pts[i][0] - 10 * k)}" y="${f(pts[i][1] + 16 * k)}" text-anchor="middle" font-size="${f(11 * k)}" fill="${INK}" ${HALO}>${t}</text>`).join('');
}

// ---------------------------------------------------------------- 图例 + 题条
const legend = MODE === 'none' ? '' : `
  <rect x="${f(14 * k)}" y="${f(H - 124 * k)}" width="${f(isPlan || isSection ? 690 * k : 400 * k)}" height="${f(isPlan || isSection ? 116 * k : 96 * k)}" fill="${PAPER}" opacity="0.9"/>
  <g transform="translate(${f(28 * k)},${f(H - 112 * k)})" font-size="${f(11.5 * k)}" fill="${N600}">
    <line x1="0" y1="${f(6 * k)}" x2="${f(26 * k)}" y2="${f(6 * k)}" stroke="${P500}" stroke-width="${1.2 * k}"/><text x="${f(34 * k)}" y="${f(10 * k)}">坐着的人 — 给他当桌子的那一台</text>
    <line x1="0" y1="${f(26 * k)}" x2="${f(26 * k)}" y2="${f(26 * k)}" stroke="${INK}" stroke-width="${0.9 * k}" stroke-dasharray="${4 * k} ${3.5 * k}"/><text x="${f(34 * k)}" y="${f(30 * k)}">人 — 正看着的那只猫</text>
    <rect x="0" y="${f(40 * k)}" width="${f(26 * k)}" height="${f(10 * k)}" fill="#E1D8FC" stroke="${P700}" stroke-width="${0.9 * k}"/><text x="${f(34 * k)}" y="${f(50 * k)}">落下来的单元（项目二的紫）</text>
    <rect x="0" y="${f(60 * k)}" width="${f(26 * k)}" height="${f(10 * k)}" fill="none" stroke="#A197D9" stroke-width="${0.7 * k}" stroke-dasharray="${3 * k} ${3 * k}"/><text x="${f(34 * k)}" y="${f(70 * k)}">${CAM.ortho && !isSection ? '收在天花板下的单元：只标它落下来会占的那一格' : '收在天花板下的单元'}</text>${isPlan ? `<text x="0" y="${f(92 * k)}" fill="${INK}">剖切高度 1.9 m：涂实的是切到的墙与布筒；这个高度以上（收着的单元、天花）不画</text>` : ''}${isSection ? `<text x="0" y="${f(92 * k)}" fill="${INK}">剖切线 y = ${CAM.sectionY} m：涂实 / 粗紫线是切到的；后面是看过去的立面，收在天花板下的单元也在里面</text>` : ''}
  </g>`;
const title = `
  <rect x="${f(W - 560 * k)}" y="${f(H - 66 * k)}" width="${f(546 * k)}" height="${f(52 * k)}" fill="${PAPER}" opacity="0.9"/>
  <g transform="translate(${f(W - 28 * k)},${f(H - 42 * k)})" text-anchor="end">
    <text font-size="${f(15 * k)}" fill="${INK}" font-weight="600">Letting Agent · Lab 2-15</text>
    <text y="${f(20 * k)}" font-size="${f(11.5 * k)}" fill="${N600}">${D.scene.people} 人 ${D.scene.cats} 猫 · 第 ${Math.round(D.scene.t)} 秒 · 8×8 个单元铺满房间（${D.meta.roomM.toFixed(2)} m 见方）</text>
  </g>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'JBM'; src: url('${pathToFileURL(resolve('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'))}'); }
  @font-face { font-family: 'JBM'; font-weight: 600; src: url('${pathToFileURL(resolve('node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2'))}'); }
  html,body { margin:0; padding:0; background:${PAPER}; }
  .wrap { position:relative; width:${W}px; height:${H}px; }
  img, svg { position:absolute; inset:0; width:${W}px; height:${H}px; }
  svg text { font-family: 'JBM', 'WenQuanYi Zen Hei', sans-serif; }
</style></head><body><div class="wrap">
  <img src="${pathToFileURL(resolve(BASE))}">
  <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${svg.join('')}${ruler}${legend}${title}</svg>
</div></body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'board-'));
const file = join(dir, 'b.html');
writeFileSync(file, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(file).href);
await page.waitForTimeout(300);
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();
console.log('BOARD', OUT, dirname(OUT));
