// 空间形态研究的线稿（项目二_空间形态研究.md）：一台单元在剖面上能停在哪 + 二十二种排法的平面、剖面与读数。
// 尺寸与读数全部来自 src/lib/space/space-forms.ts 与 space-forms-atlas.ts（与以后上台架同一份实现）。
//   node scripts/space-forms/atlas.mjs [输出目录]   （默认 项目二_空间形态研究/）
// 出 SVG；有 playwright 时另出同名 PNG。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const OUT = process.argv[2] ?? '项目二_空间形态研究';
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const S = await server.ssrLoadModule('/src/lib/space/space-forms.ts');
const A = await server.ssrLoadModule('/src/lib/space/space-forms-atlas.ts');
await server.close();

const { SF, BANDS } = S;
const UNIT_X0 = 112;
const N = 8;
const f2 = (v) => v.toFixed(2);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FONT = `font-family="'Noto Sans CJK SC','PingFang SC','Source Han Sans SC',sans-serif"`;

// 高度带的灰度：越高越深；碰头那一带用警示色；低顶只描边
const BAND_FILL = { low: '#dedbd3', table: '#c4c0b6', waist: '#a6a197', shelf: '#827d73', head: '#c0392b', canopy: '#ffffff', high: '#ffffff' };
const fillOf = (h) => BAND_FILL[S.bandOf(h)];

/** 按字数折行（中文按一字一宽） */
function wrap(text, max) {
  const out = [];
  let line = '';
  for (const ch of text) {
    line += ch;
    if (line.length >= max && /[，、；。）]/.test(ch)) { out.push(line); line = ''; }
    else if (line.length >= max + 6) { out.push(line); line = ''; }
  }
  if (line) out.push(line);
  return out;
}

// ── 平面
function plan(field, read, x0, y0, cell, cut) {
  const n = field.n;
  const walk = field.cells.map((u) => !S.blocksWalk(u));
  // 从门走得到的格子（与 readSpace 同一判法：四邻 + 门）
  const reach = new Uint8Array(n * n);
  const q = S.doorCells(n).filter((i) => walk[i]);
  q.forEach((i) => (reach[i] = 1));
  while (q.length) {
    const j = q.pop(), r = Math.floor(j / n), c = j % n;
    for (const [dc, dr] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const k = rr * n + cc;
      if (walk[k] && !reach[k]) { reach[k] = 1; q.push(k); }
    }
  }
  const s = cell / SF.PITCH;
  const half = SF.PLAT_HALF * s;
  let g = `<g>`;
  g += `<rect x="${x0}" y="${y0}" width="${n * cell}" height="${n * cell}" fill="#fbfaf7" stroke="#333" stroke-width="1.6"/>`;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const i = r * n + c, u = field.cells[i];
      const cx = x0 + (c + 0.5) * cell, cy = y0 + (r + 0.5) * cell;
      if (walk[i] && !reach[i]) g += `<rect x="${cx - cell / 2}" y="${cy - cell / 2}" width="${cell}" height="${cell}" fill="url(#pocket)"/>`;
      if (u.kind === 'plat') {
        const cov = S.covers(u) || u.top >= 2.7;
        if (cov) {
          g += `<rect x="${cx - half}" y="${cy - half}" width="${2 * half}" height="${2 * half}" fill="url(#hatch)" stroke="#555" stroke-width="0.9" stroke-dasharray="${u.top >= 2.7 ? '1.5 2' : '4 2'}"/>`;
        } else if (u.rise) {
          const id = `g${['r', 'd', 'l', 'u'][u.dir ?? 0]}`;
          g += `<rect x="${cx - half}" y="${cy - half}" width="${2 * half}" height="${2 * half}" fill="url(#${id})" stroke="#555" stroke-width="0.5"/>`;
          const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][u.dir ?? 0];
          g += `<line x1="${cx - dx * half * 0.6}" y1="${cy - dy * half * 0.6}" x2="${cx + dx * half * 0.6}" y2="${cy + dy * half * 0.6}" stroke="#222" stroke-width="0.9" marker-end="url(#arr)"/>`;
        } else {
          g += `<rect x="${cx - half}" y="${cy - half}" width="${2 * half}" height="${2 * half}" fill="${fillOf(u.top)}" stroke="#555" stroke-width="0.5"/>`;
        }
        g += `<text x="${cx}" y="${cy + 3}" font-size="6.5" text-anchor="middle" fill="${u.top < 1.2 || u.top >= 2.07 ? '#222' : '#fff'}" ${FONT}>${f2(u.top)}${u.rise ? '+' : ''}</text>`;
      } else if (u.kind === 'dual') {
        g += `<rect x="${cx - half}" y="${cy - half}" width="${2 * half}" height="${2 * half}" fill="${fillOf(u.lower)}" stroke="#555" stroke-width="0.5"/>`;
        const ins = half * 0.72;
        if (u.roof === undefined) g += `<rect x="${cx - ins}" y="${cy - ins}" width="${2 * ins}" height="${2 * ins}" fill="none" stroke="#222" stroke-width="1"/>`;
        else {
          // 有顶的半圈：背向 roof 那一半
          const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][u.roof];
          const bx = dx ? (dx > 0 ? cx - ins : cx) : cx - ins, by = dy ? (dy > 0 ? cy - ins : cy) : cy - ins;
          const bw = dx ? ins : 2 * ins, bh = dy ? ins : 2 * ins;
          g += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="#5f5a51" stroke="#222" stroke-width="0.8"/>`;
        }
        g += `<text x="${cx}" y="${cy + 3}" font-size="6.2" text-anchor="middle" fill="#fff" ${FONT}>${f2(u.lower)}</text>`;
      } else if (u.kind === 'column') {
        g += `<circle cx="${cx}" cy="${cy}" r="${SF.TUBE_R * s}" fill="#4a463f"/>`;
      }
    }
  // 门
  for (const i of S.doorCells(n)) {
    const r = Math.floor(i / n), c = i % n;
    const x = c === 0 ? x0 : x0 + n * cell;
    g += `<line x1="${x}" y1="${y0 + r * cell + 3}" x2="${x}" y2="${y0 + (r + 1) * cell - 3}" stroke="#fbfaf7" stroke-width="3"/>`;
  }
  // 剖切线
  if (cut.along === 'row') {
    const y = y0 + (cut.at + 0.5) * cell;
    g += `<line x1="${x0 - 6}" y1="${y}" x2="${x0 + n * cell + 6}" y2="${y}" stroke="#c0392b" stroke-width="0.9" stroke-dasharray="5 3"/>`;
  } else {
    const x = x0 + (cut.at + 0.5) * cell;
    g += `<line x1="${x}" y1="${y0 - 6}" x2="${x}" y2="${y0 + n * cell + 6}" stroke="#c0392b" stroke-width="0.9" stroke-dasharray="5 3"/>`;
  }
  return g + `</g>`;
}

// ── 剖面（沿一行或一列，房间整宽）
function section(field, cut, x0, yFloor, ppm, opts = {}) {
  const n = field.n;
  const cells = [];
  for (let k = 0; k < n; k++) cells.push(cut.along === 'row' ? field.cells[cut.at * n + k] : field.cells[k * n + cut.at]);
  // 切的方向：沿行 = +x（dir 0 / 2 在切面里）；沿列 = +y（dir 1 / 3 在切面里）
  const along = cut.along === 'row' ? [0, 2] : [1, 3];
  const X = (m) => x0 + m * ppm;
  const Y = (m) => yFloor - m * ppm;
  const W = opts.width ?? n * SF.PITCH, H = SF.ROOM_H;
  let g = `<g>`;
  g += `<rect x="${X(0)}" y="${Y(H)}" width="${W * ppm}" height="${H * ppm}" fill="#fbfaf7" stroke="none"/>`;
  g += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(W)}" y2="${Y(0)}" stroke="#222" stroke-width="1.8"/>`;
  g += `<line x1="${X(0)}" y1="${Y(H)}" x2="${X(W)}" y2="${Y(H)}" stroke="#222" stroke-width="1.4"/>`;
  g += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(0)}" y2="${Y(H)}" stroke="#222" stroke-width="1.2"/>`;
  g += `<line x1="${X(W)}" y1="${Y(0)}" x2="${X(W)}" y2="${Y(H)}" stroke="#222" stroke-width="1.2"/>`;
  g += `<line x1="${X(0)}" y1="${Y(SF.HEAD_CLEAR)}" x2="${X(W)}" y2="${Y(SF.HEAD_CLEAR)}" stroke="#999" stroke-width="0.6" stroke-dasharray="3 3"/>`;
  g += `<text x="${X(W) + 3}" y="${Y(SF.HEAD_CLEAR) + 3}" font-size="7" fill="#888" ${FONT}>2.0</text>`;
  const core = (cx, from, to) => `<rect x="${X(cx - SF.TUBE_R)}" y="${Y(to)}" width="${2 * SF.TUBE_R * ppm}" height="${Math.max(0, (to - from) * ppm)}" fill="#d7d3ca" stroke="#8a857b" stroke-width="0.4"/>`;
  const hanger = (cx, from) => `<line x1="${X(cx)}" y1="${Y(from)}" x2="${X(cx)}" y2="${Y(H)}" stroke="#8a857b" stroke-width="0.9"/>`;
  const plate = (x1, h1, x2, h2) => `<polygon points="${X(x1)},${Y(h1)} ${X(x2)},${Y(h2)} ${X(x2)},${Y(h2 - SF.PLATE)} ${X(x1)},${Y(h1 - SF.PLATE)}" fill="${fillOf(Math.min(h1, h2))}" stroke="#333" stroke-width="0.7"/>`;
  let personAt = -1;
  cells.forEach((u, k) => {
    const cx = (k + 0.5) * SF.PITCH;
    const a = cx - SF.PLAT_HALF, b = cx + SF.PLAT_HALF;
    if (u.kind === 'stow') {
      g += core(cx, H - SF.CEIL_GAP - 0.2, H - SF.CEIL_GAP);
      if (personAt < 0 && S.standable(u)) personAt = k;
    } else if (u.kind === 'column') {
      g += core(cx, 0, SF.TUBE_LEN) + hanger(cx, SF.TUBE_LEN);
    } else if (u.kind === 'plat') {
      const pin = u.top - SF.PIN_BELOW;
      g += core(cx, pin, pin + SF.SPAN_PLAT) + hanger(cx, pin + SF.SPAN_PLAT);
      const rise = u.rise ?? 0;
      let h1 = u.top, h2 = u.top;
      if (rise && along.includes(u.dir ?? 0)) {
        const up = (u.dir ?? 0) === along[0];
        h1 = up ? u.top : u.top + rise;
        h2 = up ? u.top + rise : u.top;
      } else if (rise) { h1 = h2 = u.top + rise / 2; }
      g += plate(a, h1, b, h2);
      if (S.covers(u) && personAt < 0) personAt = k;
      g += `<text x="${X(cx)}" y="${Y(Math.max(h1, h2)) - 3}" font-size="6.5" text-anchor="middle" fill="#333" ${FONT}>${f2(Math.max(h1, h2))}</text>`;
    } else if (u.kind === 'dual') {
      const pin = u.lower - SF.PIN_BELOW, up = u.lower + SF.UPPER_ABOVE;
      g += core(cx, pin, pin + SF.SPAN_DUAL) + hanger(cx, pin + SF.SPAN_DUAL);
      g += plate(a, u.lower, b, u.lower);
      if (u.roof === undefined) g += plate(a, up, b, up);
      else if (along.includes(u.roof)) {
        // 上台只在背向 roof 的那一半
        const back = u.roof === along[0] ? [a, cx] : [cx, b];
        g += plate(back[0], up, back[1], up);
      } else g += plate(a, up, b, up);
      g += `<text x="${X(cx)}" y="${Y(up) - 3}" font-size="6.5" text-anchor="middle" fill="#333" ${FONT}>${f2(up)}</text>`;
    }
  });
  // 比例人（1.70 m）站在剖面上第一格能站的地方
  if (personAt >= 0 && opts.person !== false) {
    const px = (personAt + 0.5) * SF.PITCH;
    g += `<g stroke="#222" stroke-width="1.1" fill="none"><circle cx="${X(px)}" cy="${Y(1.6)}" r="${0.1 * ppm}" fill="#fbfaf7"/>`;
    g += `<line x1="${X(px)}" y1="${Y(1.5)}" x2="${X(px)}" y2="${Y(0.85)}"/><line x1="${X(px)}" y1="${Y(0.85)}" x2="${X(px - 0.12)}" y2="${Y(0)}"/><line x1="${X(px)}" y1="${Y(0.85)}" x2="${X(px + 0.12)}" y2="${Y(0)}"/>`;
    g += `<line x1="${X(px)}" y1="${Y(1.38)}" x2="${X(px - 0.17)}" y2="${Y(0.92)}"/><line x1="${X(px)}" y1="${Y(1.38)}" x2="${X(px + 0.17)}" y2="${Y(0.92)}"/></g>`;
  }
  return g + `</g>`;
}

function readingLines(r) {
  const pk = r.pockets.length ? `，围住 ${r.pockets.join('+')} 格` : '';
  return [
    `人：地面 ${r.floorCells} 格（${r.floorM2.toFixed(1)} m²），从门走得到 ${r.reachCells} 格${pk}`,
    `走廊格 ${r.corridorCells} · 台围出的边 ${r.unitEdgeM.toFixed(1)} m（外沿的 ${(r.enclosure * 100).toFixed(0)}%）· 头顶低顶 ${r.coveredCells} 格`,
    `台面：${r.levels} 层 · 最大一片 ${r.largestSurfaceUnits} 台（${r.largestSurfaceM2.toFixed(1)} m²）· 猫不大跳到 ${f2(r.catReachHop)} m · 一跳到 ${f2(r.catReachJump)} m${r.headHits ? ` · 碰头 ${r.headHits}` : ''}`,
  ];
}

const DEFS = `<defs>
<pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#b9b4aa" stroke-width="1"/></pattern>
<pattern id="pocket" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="6" height="6" fill="#f6e7cf"/><line x1="0" y1="0" x2="0" y2="6" stroke="#e2b77a" stroke-width="1.2"/></pattern>
${[['gr', 1, 0], ['gd', 0, 1], ['gl', -1, 0], ['gu', 0, -1]].map(([id, dx, dy]) => `<linearGradient id="${id}" x1="${dx < 0 ? 1 : 0}" y1="${dy < 0 ? 1 : 0}" x2="${dx > 0 ? 1 : 0}" y2="${dy > 0 ? 1 : 0}"><stop offset="0" stop-color="#e4e1da"/><stop offset="1" stop-color="#77726a"/></linearGradient>`).join('')}
<marker id="arr" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#222"/></marker>
</defs>`;

// ── 图 0：一台单元在剖面上能停在哪
function sheetUnit() {
  const W = 1230, H = 520, ppm = 90, yF = 450, x0 = UNIT_X0;
  let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  g += `<text x="24" y="34" font-size="18" font-weight="600" ${FONT}>一台单元在剖面上能停在哪</text>`;
  g += `<text x="24" y="56" font-size="11.5" fill="#555" ${FONT}>房高 ${f2(SF.ROOM_H)} m · 台面 ${f2(S.PLAT_TOP_MIN)}–${f2(S.PLAT_TOP_MAX)} m 之间都能停（钉住端贴地到上夹环贴天花）· 台厚 ${(SF.PLATE * 100).toFixed(1)} cm · 方台边长 ${f2(2 * SF.PLAT_HALF)} m · 竖向尺寸 2026-11-16 用站上引擎实测</text>`;
  const X = (m) => x0 + m * ppm, Y = (m) => yF - m * ppm;
  BANDS.forEach((b, i) => {
    const lo = Math.max(0, b.lo), hi = Math.min(SF.ROOM_H, b.hi);
    g += `<rect x="${x0 - 84}" y="${Y(hi)}" width="78" height="${(hi - lo) * ppm}" fill="${b.key === 'head' ? '#f5d3cf' : i % 2 ? '#f1efe9' : '#e8e5dd'}"/>`;
    g += `<text x="${x0 - 45}" y="${(Y(hi) + Y(lo)) / 2 + 4}" font-size="10" text-anchor="middle" ${FONT}>${b.zh}</text>`;
    if (b.lo > 0) g += `<text x="${x0 - 88}" y="${Y(b.lo) + 3}" font-size="8" text-anchor="end" fill="#888" ${FONT}>${f2(b.lo)}</text>`;
  });
  const items = [
    ['收起', S.STOW], ['0.42 茶几', S.plat(0.42)], ['0.74 桌', S.plat(0.74)], ['1.05 齐腰', S.plat(1.05)], ['1.47 高架', S.plat(1.47)],
    ['斜坡 +0.39', S.plat(0.69, 0.39, 0)], ['上下两块', S.dual(0.9)], ['有顶的半圈', S.dual(0.9, 0)], ['低顶 2.25', S.plat(2.25)], ['高顶 3.30', S.plat(3.3)], ['布筒（柱）', S.COLUMN], ['碰头 2.10', S.plat(2.1)],
  ];
  const field = { n: items.length, cells: items.map((it) => it[1]) };
  const width = (items.length + 0.9) * SF.PITCH;
  g += section(field, { along: 'row', at: 0 }, x0, yF, ppm, { person: false, width });
  items.forEach(([label], k) => {
    g += `<text x="${X((k + 0.5) * SF.PITCH)}" y="${yF + 20}" font-size="10.5" text-anchor="middle" ${FONT}>${label}</text>`;
  });
  const px = (items.length + 0.45) * SF.PITCH;
  g += `<g stroke="#222" stroke-width="1.3" fill="none"><circle cx="${X(px)}" cy="${Y(1.6)}" r="${0.1 * ppm}" fill="#fff"/><line x1="${X(px)}" y1="${Y(1.5)}" x2="${X(px)}" y2="${Y(0.85)}"/><line x1="${X(px)}" y1="${Y(0.85)}" x2="${X(px - 0.12)}" y2="${Y(0)}"/><line x1="${X(px)}" y1="${Y(0.85)}" x2="${X(px + 0.12)}" y2="${Y(0)}"/><line x1="${X(px)}" y1="${Y(1.38)}" x2="${X(px - 0.17)}" y2="${Y(0.92)}"/><line x1="${X(px)}" y1="${Y(1.38)}" x2="${X(px + 0.17)}" y2="${Y(0.92)}"/></g>`;
  g += `<text x="${X(px)}" y="${yF + 20}" font-size="10.5" text-anchor="middle" ${FONT}>人 1.70</text>`;
  g += `<text x="24" y="${H - 18}" font-size="10.5" fill="#666" ${FONT}>灰柱 = 芯与台面下那截布，细线 = 吊杆，虚线 = 2.0 m 净高。斜坡是逐带配平偏移（纯平移，一台之内最多 0.39 m）。布筒是单元不成形、布全部放下（2.64 m）。最右那台台底已过 2.0、台心下夹环还在 2.0 以下，算碰头，画出来作对照。</text>`;
  return g + `</svg>`;
}

// ── 图 1、2：排法
function sheetTypes(types, startIdx, title) {
  const PW = 590, PH = 332, cols = 2;
  const rows = Math.ceil(types.length / cols);
  const W = cols * PW + 40, H = rows * PH + 90;
  let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  g += `<text x="24" y="34" font-size="18" font-weight="600" ${FONT}>${title}</text>`;
  g += `<text x="24" y="56" font-size="11" fill="#555" ${FONT}>8×8 一间（6.64 m 见方，2-15 那间房）· 平面里格中数字 = 台面高（m，带「+」的是斜坡低端）· 斜线 = 低顶 · 橙色斜纹 = 从门走不到的地面 · 黑点 = 布筒 · 红虚线 = 剖切处</text>`;
  types.forEach((t, k) => {
    const ox = 20 + (k % cols) * PW, oy = 76 + Math.floor(k / cols) * PH;
    const field = t.build();
    const r = S.readSpace(field);
    g += `<rect x="${ox}" y="${oy}" width="${PW - 12}" height="${PH - 12}" fill="none" stroke="#ddd"/>`;
    g += `<text x="${ox + 12}" y="${oy + 22}" font-size="14" font-weight="600" ${FONT}>${String(startIdx + k).padStart(2, '0')} ${esc(t.zh)}</text>`;
    g += `<text x="${ox + PW - 26}" y="${oy + 22}" font-size="11" text-anchor="end" fill="#888" ${FONT}>${esc(t.group)}</text>`;
    wrap(t.how, 44).slice(0, 2).forEach((line, i) => (g += `<text x="${ox + 12}" y="${oy + 40 + i * 14}" font-size="10.5" fill="#444" ${FONT}>${esc(line)}</text>`));
    g += plan(field, r, ox + 16, oy + 86, 19, t.cut);
    g += section(field, t.cut, ox + 196, oy + 262, 52);
    readingLines(r).forEach((line, i) => (g += `<text x="${ox + 12}" y="${oy + 280 + i * 13}" font-size="9.6" fill="#333" ${FONT}>${esc(line)}</text>`));
  });
  return g + `</svg>`;
}

const sheets = [
  ['space-unit', sheetUnit()],
  ['space-types-1', sheetTypes(A.SPACE_TYPES.slice(0, 12), 1, '空间形态 · 面 · 地形 · 边界 · 围合（一）')],
  ['space-types-2', sheetTypes(A.SPACE_TYPES.slice(12), 13, '空间形态 · 围合（二）· 覆盖 · 腔与上下层 · 复合')],
];
for (const [name, svg] of sheets) writeFileSync(join(OUT, `${name}.svg`), svg);

// 读数表（文档里那张表照这个抄）
console.log('| # | 排法 | 地面 / 走得到 / 围住 | 走廊格 | 台围出的边 m（占外沿） | 低顶格 | 台面层数 | 最大一片台 | 猫不大跳 / 一跳 m |');
A.SPACE_TYPES.forEach((t, k) => {
  const r = S.readSpace(t.build());
  if (r.invalid.length || r.headHits) console.log(`!! ${t.key}: 不合法 ${r.invalid} 碰头 ${r.headHits}`);
  console.log(`| ${String(k + 1).padStart(2, '0')} | ${t.zh} | ${r.floorCells} / ${r.reachCells} / ${r.pockets.length ? r.pockets.join('+') : '—'} | ${r.corridorCells} | ${r.unitEdgeM.toFixed(1)}（${(r.enclosure * 100).toFixed(0)}%） | ${r.coveredCells} | ${r.levels} | ${r.largestSurfaceUnits} | ${f2(r.catReachHop)} / ${f2(r.catReachJump)} |`);
});

try {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 2 });
  for (const [name, svg] of sheets) {
    const w = Number(/width="(\d+)"/.exec(svg)[1]), h = Number(/height="(\d+)"/.exec(svg)[1]);
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    await p.screenshot({ path: join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: w, height: h } });
  }
  await b.close();
  console.log(`PNG → ${OUT}`);
} catch (e) {
  console.log('（没有 playwright，只出 SVG）', e.message);
}
