// 一台单元的形态研究：线稿与读数（项目二_单元形态研究.md）。
//   node scripts/unit-forms/atlas.mjs [输出目录]   （默认 项目二_单元形态研究/）
// 每一种形的二十条带都按自己的谱现跑引擎（缓存在 node_modules/.cache/unit-forms/，四个进程并行），
// 读数由 src/lib/space/unit-forms.ts 的 readUnit 算，画法只做投影与上色。出 SVG；有 playwright 时另出同名 PNG。
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? '项目二_单元形态研究';
mkdirSync(OUT, { recursive: true });
const CACHE_DIR = 'node_modules/.cache/unit-forms';
const CACHE = join(CACHE_DIR, 'bands.json');
mkdirSync(CACHE_DIR, { recursive: true });

const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const F = await server.ssrLoadModule('/src/lib/space/unit-forms.ts');
const A = await server.ssrLoadModule('/src/lib/space/unit-forms-atlas.ts');
await server.close();
const { UF } = F;
const M = UF.MPP;

// ── 收集要跑的带 ─────────────────────────────────────────────────────────────────
const m1 = A.MATRIX_OUTLINE_HEIGHT, m2 = A.MATRIX_SECTION_SELECT;
const matrix1 = m1.rows.map((r) => m1.cols.map((c) => m1.form(r, c)));
const matrix2 = m2.rows.map((r) => m2.cols.map((c) => m2.form(r, c)));
const lib = libraryForms();
const allForms = [...A.UNIT_FORMS, ...matrix1.flat(), ...matrix2.flat(), ...lib.map((l) => l.form)];
const jobKey = (prog, L) => JSON.stringify({ prog, F: L.F, G: L.G });
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const want = new Map();
for (const f of allForms) {
  const L = F.unitLayout(f);
  if (L.errors.length) throw new Error(`${f.key}: ${L.errors.join('；')}`);
  for (const b of f.bands) if (b) { const k = jobKey(b, L); if (!cache[k]) want.set(k, { key: k, prog: b, F: L.F, G: L.G }); }
}
if (want.size) {
  const jobs = [...want.values()];
  const P = 4;
  console.log(`跑 ${jobs.length} 条带（${P} 个进程）…`);
  const parts = Array.from({ length: P }, (_, i) => jobs.filter((_, j) => j % P === i));
  await Promise.all(parts.map((part, i) => new Promise((res, rej) => {
    const jf = join(CACHE_DIR, `jobs-${i}.json`), of = join(CACHE_DIR, `out-${i}.json`);
    writeFileSync(jf, JSON.stringify(part));
    const ch = spawn(process.execPath, [join(HERE, 'run-bands.mjs'), jf, of], { stdio: 'inherit' });
    ch.on('exit', (code) => (code === 0 ? (Object.assign(cache, JSON.parse(readFileSync(of, 'utf8'))), res()) : rej(new Error(`进程 ${i} 退出 ${code}`))));
  })));
  writeFileSync(CACHE, JSON.stringify(cache));
}
const shapesOf = (f) => { const L = F.unitLayout(f); return { L, shapes: f.bands.map((b) => (b ? cache[jobKey(b, L)] : null)) }; };

// ── 投影与上色 ───────────────────────────────────────────────────────────────────
const FONT = `font-family="'Noto Sans CJK SC','PingFang SC','Source Han Sans SC',sans-serif"`;
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f2 = (v) => v.toFixed(2);
const { az, el } = A.UF_VIEW;
const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
const HALF_W = 3.9; // 带宽一半（px）
const LIGHT = norm([-0.35, 0.85, 0.4]);
function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }
/** 世界点（engine px：X、Z 水平，Y 向上）→ [屏 x, 屏 y（向下）, 深度（朝观者为正）] */
function proj([X, Y, Z]) {
  const x1 = X * ca - Z * sa, z1 = X * sa + Z * ca;
  return [x1, -(Y * ce - z1 * se), z1 * ce + Y * se];
}
function world(rho, y, th, t) { return [rho * Math.cos(th) - t * Math.sin(th), y, rho * Math.sin(th) + t * Math.cos(th)]; }
function shade(base, n) {
  const k = 0.5 + 0.5 * Math.abs(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  return `rgb(${base.map((c) => Math.round(c * k)).join(',')})`;
}
function quadNormal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
}
const BAND = [196, 188, 172], SKIN = [232, 228, 220], CORE = [178, 174, 166];
const RS = 30; // 每块台沿布等分几个点

/** 一台单元的轴测：返回多边形（屏坐标未缩放）与包围盒 */
function axoPolys(form, shapes) {
  const polys = [];
  const n = UF.COUNT;
  const rs = shapes.map((s) => (s ? s.structs.map((st) => F.resample(st.pts, RS)) : null));
  let yTop = 0;
  shapes.forEach((s) => s && s.structs.forEach((st) => (yTop = Math.max(yTop, st.top))));
  // 芯：一圈细竖条（按八个面画，遮挡靠画家排序）
  const coreR = UF.R0 - 2, y0 = 0, y1 = yTop + 40;
  for (let a = 0; a < 8; a++) {
    const t0 = (a / 8) * 2 * Math.PI, t1 = ((a + 1) / 8) * 2 * Math.PI;
    const P = [world(coreR, y0, t0, 0), world(coreR, y0, t1, 0), world(coreR, y1, t1, 0), world(coreR, y1, t0, 0)];
    polys.push({ w: P, fill: CORE, stroke: false });
  }
  for (let j = 0; j < n; j++) {
    const th = F.bandAngle(j);
    const pj = rs[j];
    if (!pj) continue;
    pj.forEach((pts) => {
      for (let i = 0; i < RS - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const P = [world(UF.R0 + a[0], a[1], th, -HALF_W), world(UF.R0 + b[0], b[1], th, -HALF_W), world(UF.R0 + b[0], b[1], th, HALF_W), world(UF.R0 + a[0], a[1], th, HALF_W)];
        polys.push({ w: P, fill: BAND, stroke: true });
      }
    });
    const joins = F.skinJoins(form, j);
    const pk = rs[(j + 1) % n];
    const th2 = F.bandAngle((j + 1) % n);
    joins.forEach((on, q) => {
      if (!on || !pk) return;
      const A = pj[q], B = pk[q];
      for (let i = 0; i < RS - 1; i++) {
        const P = [world(UF.R0 + A[i][0], A[i][1], th, HALF_W), world(UF.R0 + A[i + 1][0], A[i + 1][1], th, HALF_W), world(UF.R0 + B[i + 1][0], B[i + 1][1], th2, -HALF_W), world(UF.R0 + B[i][0], B[i][1], th2, -HALF_W)];
        polys.push({ w: P, fill: SKIN, stroke: false });
      }
    });
  }
  return polys.map((p) => {
    const s = p.w.map(proj);
    return { ...p, s, d: s.reduce((a, q) => a + q[2], 0) / s.length, n: quadNormal(p.w[0], p.w[1], p.w[2]) };
  });
}
function bounds(polys) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p.s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, x1, y0, y1 };
}
function drawAxo(polys, cx, cy, sc, anchor) {
  const sorted = [...polys].sort((a, b) => a.d - b.d);
  let g = '';
  for (const p of sorted) {
    const pts = p.s.map(([x, y]) => `${(cx + (x - anchor[0]) * sc).toFixed(1)},${(cy + (y - anchor[1]) * sc).toFixed(1)}`).join(' ');
    const fill = shade(p.fill, p.n);
    g += `<polygon points="${pts}" fill="${fill}" stroke="${p.stroke ? 'rgba(60,56,50,0.55)' : fill}" stroke-width="${p.stroke ? 0.35 : 0.4}"/>`;
  }
  return g;
}

/** 平面：每一层台的外缘连线（拉膜时带与带之间是直的，连成多边形；不拉膜画成一根根辐条）+ 芯 */
function drawPlan(form, shapes, cx, cy, sc) {
  const n = UF.COUNT;
  const levels = Math.max(...shapes.map((s) => (s ? s.structs.length : 0)), 0);
  const fills = ['#cfcac0', '#b3ada2', '#978f83', '#7b7366'];
  const P = (rr, a) => `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy - rr * Math.sin(a)).toFixed(1)}`;
  let g = '';
  for (let q = 0; q < levels; q++) {
    if (form.skin === false) {
      for (let j = 0; j < n; j++) {
        const st = shapes[j]?.structs[q];
        if (!st) continue;
        const th = F.bandAngle(j), w = (Math.PI / n) * 0.35, r = (UF.R0 + st.reach) * sc;
        g += `<polygon points="${P(UF.R0 * sc, th - w)} ${P(r, th - w)} ${P(r, th + w)} ${P(UF.R0 * sc, th + w)}" fill="${fills[q]}"/>`;
      }
      continue;
    }
    // 一层一个多边形：有这块台的带取外缘，没有的退到芯；连续两条都没有的那段不画（缺口）
    const pts = [];
    for (let j = 0; j < n; j++) {
      const st = shapes[j]?.structs[q];
      pts.push([st ? (UF.R0 + st.reach) * sc : UF.R0 * sc, F.bandAngle(j), !!st]);
    }
    const tri = [];
    for (let j = 0; j < n; j++) {
      const a = pts[j], b = pts[(j + 1) % n];
      if (!a[2] && !b[2]) continue;
      tri.push(`<polygon points="${P(0, a[1])} ${P(a[0], a[1])} ${P(b[0], b[1])}" fill="${fills[q]}" stroke="${fills[q]}" stroke-width="0.4" fill-opacity="${q ? 0.85 : 1}"/>`);
    }
    g += tri.join('');
  }
  g += `<circle cx="${cx}" cy="${cy}" r="${(UF.R0 * sc).toFixed(1)}" fill="#8f8a81"/>`;
  const fr = A.FRONT;
  g += `<line x1="${cx}" y1="${cy}" x2="${(cx + 20 * Math.cos(fr)).toFixed(1)}" y2="${(cy - 20 * Math.sin(fr)).toFixed(1)}" stroke="#c0392b" stroke-width="0.8" stroke-dasharray="2 2"/>`;
  return g;
}

/** 展开立面：横轴 = 二十条带，纵轴 = 离钉住端，每块台画成一段 */
function drawStrip(shapes, x0, y0, w, h, yMax) {
  const n = UF.COUNT;
  let g = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#faf9f6" stroke="#ddd" stroke-width="0.5"/>`;
  const sy = h / yMax;
  for (let j = 0; j < n; j++) {
    const s = shapes[j];
    const x = x0 + (j + 0.5) * (w / n);
    if (!s) { g += `<line x1="${x}" y1="${y0 + h - 2}" x2="${x}" y2="${y0 + h}" stroke="#bbb" stroke-width="2"/>`; continue; }
    for (const st of s.structs) g += `<rect x="${(x - w / n / 2 + 0.6).toFixed(1)}" y="${(y0 + h - st.top * sy).toFixed(1)}" width="${(w / n - 1.2).toFixed(1)}" height="${Math.max(1, (st.top - st.bot) * sy).toFixed(1)}" fill="#6f685d"/>`;
  }
  return g;
}

function readingLines(f, shapes, L) {
  const r = F.readUnit(f, shapes, L);
  const stow = r.stowed ? ` · 收着 ${r.stowed} 条` : '';
  return {
    r,
    lines: [
      `外缘离芯轴 ${f2(r.rMin)}–${f2(r.rMax)} m · 围出 ${f2(r.area)} m²${stow}`,
      `台面 ${r.levels} 层 · 离钉住端 ${f2(r.topMin)}–${f2(r.topMax)} m · 相邻台面高差 ≤ ${f2(r.stepMax)} m（坡 ${r.slopeMax.toFixed(0)}°）`,
      `相邻剖面形差 ≤ ${f2(r.shapeDiff)} m · 膜 ${r.skinJoins} 道${r.skinStrained ? `（${r.skinStrained} 道形差 > 0.10 m）` : ''} · 转 ${r.rotOrder} 次重合${r.mirror ? ' · 镜像' : ''}`,
      `布铺出 ${r.band} 节 · 芯长 ${f2(r.coreM)} m · 键 ${r.locked}/${r.bonds} · 打结 ${r.knot}`,
    ],
  };
}

const DEFS = '';
const svgOpen = (w, h) => { const W = Math.ceil(w), H = Math.ceil(h); return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${DEFS}`; };
const readings = [];

// ── 图 0：一条带上能放什么（词汇） ────────────────────────────────────────────────
function libraryForms() {
  const P = (k, h = 16) => ({ kind: 'plate', k, h });
  // 词汇页每格只画一条带，但按整台二十条同一种排（袋不允许有收着的带），只跑一次
  const items = [
    ['6.6 cm 台 k14', { secs: [P(14)], gaps: [5] }],
    ['6.6 cm 台 k29', { secs: [P(29)], gaps: [5] }],
    ['6.6 cm 台 k46', { secs: [P(46)], gaps: [5] }],
    ['6.6 cm 台 k62', { secs: [P(62)], gaps: [5] }],
    ['15 cm 台 k46', { secs: [P(46, 36)], gaps: [5] }],
    ['23 cm 台 k62', { secs: [P(62, 56)], gaps: [5] }],
    ['蘑菇挑台', { secs: [{ kind: 'cat', key: 'bulb' }], gaps: [5] }],
    ['直挑台', { secs: [{ kind: 'cat', key: 'ledge' }], gaps: [5] }],
    ['阶梯挑台', { secs: [{ kind: 'cat', key: 'stepped' }], gaps: [5] }],
    ['袋（收到 0.66）', { secs: [{ kind: 'cat', key: 'pocket' }], gaps: [5] }],
    ['两块 k34', { secs: [P(34), P(34)], gaps: [5, 40] }],
    ['三块 k22', { secs: [P(22), P(22), P(22)], gaps: [5, 29, 29] }],
    ['四块 k16', { secs: [P(16), P(16), P(16), P(16)], gaps: [5, 29, 29, 29] }],
    ['上小下大 36/26/16', { secs: [P(36), P(26), P(16)], gaps: [5, 29, 29] }],
    ['台抬高 0.8 m', { secs: [P(29)], gaps: [5 + Math.round(0.8 / (UF.GLUE_PX * M))] }],
  ];
  return items.map(([label, prog]) => ({ label, prog, form: { key: 'lib', zh: '', group: '', how: '', bands: Array(UF.COUNT).fill(prog) } }));
}
function sheetLibrary() {
  const per = 8, colW = 182, pxPerM = 170;
  const s = pxPerM * M; // 引擎 px → 屏 px
  const rows = Math.ceil(lib.length / per);
  // 每一排按最高那格定高：台面 + 芯露出的一截 + 下面三行字
  const rowTop = [];
  let yAcc = 80;
  for (let r = 0; r < rows; r++) {
    const tall = Math.max(...lib.slice(r * per, (r + 1) * per).map((it) => Math.max(...shapesOf(it.form).shapes[0].structs.map((st) => st.top))));
    const h = tall * s + 40;
    rowTop.push(yAcc + h);
    yAcc += h + 80;
  }
  const W = per * colW + 48, H = yAcc;
  let g = svgOpen(W, H);
  g += `<text x="24" y="34" font-size="18" font-weight="600" ${FONT}>一条带上能放什么（剖面，站上引擎实测）</text>`;
  g += `<text x="24" y="56" font-size="11.5" fill="#555" ${FONT}>2-15 那台单元的布（预裁 338 节）· 灰竖线 = 芯，横线 = 钉住端 · 每一格都是这条带收缩到底的形 · 1 m = ${pxPerM} 屏 px</text>`;
  lib.forEach((it, i) => {
    const { shapes } = shapesOf(it.form);
    const sh = shapes[0];
    const x0 = 24 + (i % per) * colW + 14, base = rowTop[Math.floor(i / per)];
    const top = Math.max(...sh.structs.map((st) => st.top)), reach = Math.max(...sh.structs.map((st) => st.reach));
    g += `<line x1="${x0}" y1="${base}" x2="${x0}" y2="${base - Math.min(1.45 * pxPerM, top * s + 30)}" stroke="#a9a49b" stroke-width="2.4"/>`;
    g += `<line x1="${x0 - 6}" y1="${base}" x2="${x0 + colW - 24}" y2="${base}" stroke="#333" stroke-width="0.8"/>`;
    for (const st of sh.structs) {
      const d = st.pts.map(([x, y], q) => `${q ? 'L' : 'M'}${(x0 + x * s).toFixed(1)},${(base - y * s).toFixed(1)}`).join(' ');
      g += `<path d="${d}" fill="none" stroke="#3b372f" stroke-width="1.4" stroke-linejoin="round"/>`;
    }
    g += `<text x="${x0 - 8}" y="${base + 20}" font-size="11" font-weight="600" ${FONT}>${esc(it.label)}</text>`;
    g += `<text x="${x0 - 8}" y="${base + 36}" font-size="9.5" fill="#555" ${FONT}>挑出 ${f2(reach * M)} m · 台面 ${f2(top * M)} m</text>`;
    g += `<text x="${x0 - 8}" y="${base + 50}" font-size="9.5" fill="#555" ${FONT}>键 ${sh.locked}/${sh.bonds} · 打结 ${sh.knot}</text>`;
    readings.push({ group: '词汇', zh: it.label, reach: reach * M, top: top * M, locked: `${sh.locked}/${sh.bonds}`, knot: sh.knot });
  });
  return g + '</svg>';
}

// ── 目录页 ────────────────────────────────────────────────────────────────────
function sheetCatalogue(title, forms, startIdx) {
  const cols = 3, PW = 470, PH = 430;
  const rows = Math.ceil(forms.length / cols);
  const W = cols * PW + 40, H = rows * PH + 80;
  const prepared = forms.map((f) => { const { L, shapes } = shapesOf(f); return { f, L, shapes, polys: axoPolys(f, shapes) }; });
  // 一张图统一比例：所有形的包围盒取最大
  let bw = 0, bh = 0, yMax = 0;
  for (const p of prepared) {
    const b = bounds(p.polys);
    bw = Math.max(bw, b.x1 - b.x0); bh = Math.max(bh, b.y1 - b.y0);
    p.shapes.forEach((s) => s && s.structs.forEach((st) => (yMax = Math.max(yMax, st.top + 10))));
  }
  const sc = Math.min(290 / bw, 250 / bh);
  let g = svgOpen(W, H);
  g += `<text x="24" y="34" font-size="18" font-weight="600" ${FONT}>${esc(title)}</text>`;
  g += `<text x="24" y="56" font-size="11" fill="#555" ${FONT}>每格：轴测（二十条带的剖面都是引擎现跑，浅色 = 带间的膜）· 右上 平面（红虚线 = 朝前那一侧）· 右中 展开立面（二十条带由左到右，深色块 = 台）· 下 读数 · 同一张图比例相同</text>`;
  prepared.forEach((p, i) => {
    const ox = 20 + (i % cols) * PW, oy = 72 + Math.floor(i / cols) * PH;
    g += `<rect x="${ox}" y="${oy}" width="${PW - 12}" height="${PH - 12}" fill="none" stroke="#e2e0db"/>`;
    g += `<text x="${ox + 12}" y="${oy + 22}" font-size="14" font-weight="600" ${FONT}>${String(startIdx + i).padStart(2, '0')} ${esc(p.f.zh)}</text>`;
    g += `<text x="${ox + PW - 26}" y="${oy + 22}" font-size="11" text-anchor="end" fill="#888" ${FONT}>${esc(p.f.group)}</text>`;
    if (p.f.how) g += `<text x="${ox + 12}" y="${oy + 40}" font-size="10" fill="#555" ${FONT}>${esc(p.f.how.slice(0, 44))}</text>`;
    const b = bounds(p.polys);
    const anchor = [(b.x0 + b.x1) / 2, b.y1];
    g += drawAxo(p.polys, ox + 150, oy + 320, sc, anchor);
    g += drawPlan(p.f, p.shapes, ox + PW - 82, oy + 112, 0.42);
    g += drawStrip(p.shapes, ox + PW - 152, oy + 192, 128, 92, yMax);
    const { r, lines } = readingLines(p.f, p.shapes, p.L);
    lines.forEach((ln, q) => (g += `<text x="${ox + 12}" y="${oy + 346 + q * 15}" font-size="9.4" fill="#333" ${FONT}>${esc(ln)}</text>`));
    readings.push({ group: p.f.group, key: p.f.key, zh: p.f.zh, ...r });
  });
  return g + '</svg>';
}

// ── 组合格 ────────────────────────────────────────────────────────────────────
function sheetMatrix(title, note, grid, rowLabels, colLabels) {
  const CW = 250, CH = 230, LW = 110, TH = 96;
  const W = LW + colLabels.length * CW + 30, H = TH + rowLabels.length * CH + 20;
  const prepared = grid.map((row) => row.map((f) => { const { L, shapes } = shapesOf(f); return { f, L, shapes, polys: axoPolys(f, shapes) }; }));
  let bw = 0, bh = 0;
  prepared.flat().forEach((p) => { const b = bounds(p.polys); bw = Math.max(bw, b.x1 - b.x0); bh = Math.max(bh, b.y1 - b.y0); });
  const sc = Math.min((CW - 30) / bw, (CH - 58) / bh);
  let g = svgOpen(W, H);
  g += `<text x="24" y="34" font-size="18" font-weight="600" ${FONT}>${esc(title)}</text>`;
  g += `<text x="24" y="56" font-size="11" fill="#555" ${FONT}>${esc(note)}</text>`;
  colLabels.forEach((c, j) => (g += `<text x="${LW + j * CW + CW / 2}" y="${TH - 12}" font-size="13" text-anchor="middle" font-weight="600" ${FONT}>${esc(c)}</text>`));
  prepared.forEach((row, i) => {
    g += `<text x="20" y="${TH + i * CH + CH / 2}" font-size="13" font-weight="600" ${FONT}>${esc(rowLabels[i])}</text>`;
    row.forEach((p, j) => {
      const ox = LW + j * CW, oy = TH + i * CH;
      g += `<rect x="${ox + 4}" y="${oy + 4}" width="${CW - 8}" height="${CH - 8}" fill="none" stroke="#eceae5"/>`;
      const b = bounds(p.polys);
      g += drawAxo(p.polys, ox + CW / 2, oy + CH - 40, sc, [(b.x0 + b.x1) / 2, b.y1]);
      const r = F.readUnit(p.f, p.shapes, p.L);
      g += `<text x="${ox + 12}" y="${oy + CH - 22}" font-size="9" fill="#444" ${FONT}>${f2(r.rMin)}–${f2(r.rMax)} m · ${r.levels} 层 · 高差 ≤ ${f2(r.stepMax)} m</text>`;
      g += `<text x="${ox + 12}" y="${oy + CH - 10}" font-size="9" fill="#444" ${FONT}>形差 ≤ ${f2(r.shapeDiff)} m${r.skinStrained ? ` · ${r.skinStrained} 道膜拉开` : ''} · 转 ${r.rotOrder} 次</text>`;
      readings.push({ group: '组合格', key: p.f.key, zh: p.f.zh, ...r });
    });
  });
  return g + '</svg>';
}

const byGroup = (g) => A.UNIT_FORMS.filter((f) => f.group === g);
let idx = 1;
const sheets = [['unit-vocab', sheetLibrary()]];
for (const [name, title, groups] of [
  ['unit-outline', '一台单元 · 平面轮廓（一层 6.6 cm 台，每条带深浅不同）', ['轮廓']],
  ['unit-gap-height', '一台单元 · 缺口与台面高低', ['缺口', '高低']],
  ['unit-section', '一台单元 · 剖面（厚台、目录形、几块台叠起来）', ['剖面']],
  ['unit-mix', '一台单元 · 组合', ['组合']],
]) {
  const forms = groups.flatMap(byGroup);
  sheets.push([name, sheetCatalogue(title, forms, idx)]);
  idx += forms.length;
}
sheets.push(['unit-matrix-outline-height', sheetMatrix('组合格 · 平面轮廓 × 台面高低', '一层 6.6 cm 台；行 = 每条带多深（轮廓），列 = 每条带的台沿芯停多高；25 格都是引擎现跑', matrix1, m1.rows.map((r) => A.OUTLINE[r].zh), m1.cols.map((c) => A.HEIGHT[c].zh))]);
sheets.push(['unit-matrix-section-select', sheetMatrix('组合格 · 剖面 × 哪几条带成形', '半径约 0.45 m；行 = 一条带上放什么，列 = 二十条带里哪几条成形（「隔一条」不拉膜）', matrix2, m2.rows.map((r) => A.SECTION[r].zh), m2.cols.map((c) => A.SELECT[c].zh))]);
for (const [name, svg] of sheets) writeFileSync(join(OUT, `${name}.svg`), svg);
writeFileSync(join(OUT, 'readings.json'), JSON.stringify(readings, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 1));

// 目录读数表（文档照抄）
console.log('| # | 组 | 形 | 外缘 m | 面积 m² | 台面层 | 台面离钉住端 m | 相邻高差 m | 形差 m | 膜拉开 | 对称 | 布 节 | 键 | 结 |');
readings.filter((r) => r.key && r.group !== '组合格').forEach((r, i) =>
  console.log(`| ${String(i + 1).padStart(2, '0')} | ${r.group} | ${r.zh} | ${f2(r.rMin)}–${f2(r.rMax)} | ${f2(r.area)} | ${r.levels} | ${f2(r.topMin)}–${f2(r.topMax)} | ${f2(r.stepMax)} | ${f2(r.shapeDiff)} | ${r.skinStrained}/${r.skinJoins} | ${r.rotOrder}${r.mirror ? '·镜' : ''} | ${r.band} | ${r.locked}/${r.bonds} | ${r.knot} |`));

try {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  try {
  for (const [name] of sheets) {
    // 每张图一个新页面、从文件载入（大 SVG 用 setContent 偶尔卡住），截图给超时
    const svg = readFileSync(join(OUT, `${name}.svg`), 'utf8');
    const w = Number(/width="(\d+)"/.exec(svg)[1]), h = Number(/height="(\d+)"/.exec(svg)[1]);
    const p = await b.newPage({ deviceScaleFactor: 2, viewport: { width: w, height: h } });
    await p.goto('file://' + join(process.cwd(), OUT, `${name}.svg`), { timeout: 60_000 });
    await p.screenshot({ path: join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: w, height: h }, timeout: 120_000 });
    await p.close();
  }
  } finally {
    await b.close();
  }
  console.log(`PNG → ${OUT}`);
} catch (e) {
  console.log('（没有 playwright，只出 SVG）', e.message);
}
