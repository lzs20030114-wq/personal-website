/**
 * 茶几 + 小一圈猫台（形态方案 §14，2026-11-05 作者「B · 上台选 ③ · 餐椅保留 · 先出线稿」）的线稿与量数。
 * 坐下时落的那台（沙发前的茶几位）落成一条带两个结构：下台整圈 = 0.5 m 茶几，上台只在背向座位的半圈、而且比下台小一圈。
 * 截面全是真引擎终态（cohabit-solid 的 dualUnitSpec，kUp = 上台的键），按 2-15 的缩放换成米；人、猫、沙发只作比例参考。
 *   node scripts/cohabit/coffee-draft.mjs <outDir>
 * 输出 outDir/form-coffee.svg（有 playwright 时另出 PNG）+ 控制台量数。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

const OUT = process.argv[2] ?? 'coffee-draft-out';
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });

function segHit(a, b, c, d) {
  const s1x = b[0] - a[0], s1y = b[1] - a[1], s2x = d[0] - c[0], s2y = d[1] - c[1];
  const den = -s2x * s1y + s1x * s2y;
  if (Math.abs(den) < 1e-12) return false;
  const q = (-s1y * (a[0] - c[0]) + s1x * (a[1] - c[1])) / den;
  const r = (s2x * (a[1] - c[1]) - s2y * (a[0] - c[0])) / den;
  return q > 0 && q < 1 && r > 0 && r < 1;
}
function maxLoop(px, py, i0, i1) {
  let m = 0;
  for (let i = i0; i < i1 - 1; i++) for (let j = i + 2; j < i1 - 1; j++)
    if (j - i > m && segHit([px[i], py[i]], [px[i + 1], py[i + 1]], [px[j], py[j]], [px[j + 1], py[j + 1]])) m = j - i;
  return m;
}

/** 茶几台面高（作者 11-05「茶几 0.5 m」）；茶几前缘离沙发前缘（家居通行 0.30–0.46 m，取中） */
const TABLE_TOP = 0.5, SOFA_GAP = 0.38;
/** 上台的几种大小：same = 与下台同一组键（现在 2-15 的两层台），其余 = 二十条带同一个 k（俯视近圆） */
const UP = [{ key: 'same', zh: '上台同大（现行）' }, { key: 28, zh: '上台 k28' }, { key: 24, zh: '上台 k24' }, { key: 20, zh: '上台 k20' }];

let M;
try {
  const U = await server.ssrLoadModule('/src/lib/space/skin-unit.ts');
  const sq = await server.ssrLoadModule('/src/lib/space/skin-square.ts');
  const ring = await server.ssrLoadModule('/src/lib/space/skin-ring.ts');
  const ua = await server.ssrLoadModule('/src/lib/space/unit-activation.ts');
  const co = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const cs = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
  const grid = await server.ssrLoadModule('/src/lib/space/skin-grid.ts');

  const layout = co.squarePlanLayout(ua.planLayout(co.COHABIT.SEATS.GRID, ring.RING.RADIUS_DEF, 'room'));
  const s = ((grid.RIG_SCALE * layout.pitchM) / layout.pitch4) * co.SQUARE_SCALE; // 与 rigFor 同式
  const mpp = s / cs.UNITS_PER_M;
  const mm = (px) => px * mpp;
  const coreR = sq.SQUARE.RADIUS * mpp;
  const opts = cs.UNIT_TIERS[0].opts;
  const f3 = (v) => v.toFixed(3);

  function dual(k, kUp, lift = 0) {
    const d = cs.dualUnitSpec(k, true, true, cs.DUAL.mid, kUp, lift);
    const u = U.createSkinUnit(d.spec, opts);
    let knot = 0;
    for (let i = 0; i < U.SKIN.STEPS; i++) { u.advance(); if (i % 10 === 0) knot = Math.max(knot, maxLoop(u.px, u.py, d.a0, d.a0 + d.fsUp), maxLoop(u.px, u.py, d.b0, d.b0 + d.fs)); }
    const foot = u.py[u.n - 1];
    const h = (i) => mm(Math.abs(u.py[i] - foot) * 100);
    const plate = (s0, n) => {
      const pts = []; let reach = 0;
      for (let i = s0; i < s0 + n; i++) { pts.push([mm(u.px[i] * 100), h(i)]); reach = Math.max(reach, mm(u.px[i] * 100)); }
      let top = 0, bot = 1e9;
      for (const [x, y] of pts) if (x > reach * 0.35 && x < reach * 0.9) { top = Math.max(top, y); bot = Math.min(bot, y); }
      const keys = u.locked.filter(([i, j]) => i >= s0 && j < s0 + n).map(([i, j]) => [i - s0, j - s0]);
      return { pts, keys, top, bot, reach };
    };
    const nk = (kk) => sq.squareLadder(kk, sq.squarePw(cs.UNIT_SHAPE.h)).length;
    const up = plate(d.a0, d.fsUp), lo = plate(d.b0, d.fs);
    return { up, lo, gap: up.bot - lo.top, lift, locked: u.locked.length, nKeys: nk(k) + nk(kUp), knot };
  }
  /** 上台比下台小时三档上台不自动同高：按档找 lift（整节）让两台之间与面档相同（面档 lift = 0） */
  function level(k, kUp, want) {
    const a = dual(k, kUp, 0);
    if (want === null || Math.abs(a.gap - want) < 0.003) return a;
    const b = dual(k, kUp, 10);
    const per = (b.gap - a.gap) / 10;
    let L = Math.max(0, Math.round((want - a.gap) / per)), best = null;
    for (const l of [L - 1, L, L + 1]) { if (l < 0) continue; try { const r = dual(k, kUp, l); if (!best || Math.abs(r.gap - want) < Math.abs(best.gap - want)) best = r; } catch (e) { /* lift 超界 */ } }
    return best ?? a;
  }

  console.log(`1 引擎 px = ${(mpp * 1000).toFixed(2)} mm · 挂带线离立杆中心 ${f3(coreR)} m · 茶几台面 ${TABLE_TOP} m`);
  const rows = UP.map((o) => {
    let want = null;
    const tiers = cs.UNIT_SHAPE.k.map((k, i) => {
      const kUp = o.key === 'same' ? k : Math.min(o.key, k);
      try { const r = level(k, kUp, i === 0 || o.key === 'same' ? null : want); if (i === 0) want = r.gap; return { k, kUp, ...r }; } catch (e) { return { k, kUp, err: e.message }; }
    });
    const t0 = tiers[0];
    const line = tiers.map((t) => t.err ? `k${t.k}/${t.kUp} 排不下（${t.err}）` : `k${t.k}/上${t.kUp}（lift ${t.lift}）：上台挑出 ${f3(t.up.reach)} · 下台挑出 ${f3(t.lo.reach)} · 键 ${t.locked}/${t.nKeys} · 结 ${t.knot} · 两台之间 ${f3(t.gap)} · 上台顶离钉住端 ${f3(t.up.top)} · 下台顶 ${f3(t.lo.top)}`).join('\n    ');
    console.log(`\n${o.zh}\n    ${line}`);
    return { ...o, tiers };
  });
  M = { coreR, rows, target: sq.SQUARE_REACH.map(mm), mpp };
} finally {
  await server.close();
}

// ════════════════════════ 绘图 ════════════════════════
const INK = '#2b2a27', MUTE = '#8a877f', FAINT = '#cfcabe', KEY = '#d9782d', CAT = '#56684a', PERSON = '#7d6f86', PAPER = '#f6f3ec', NEW = '#2f7486', SOFA = '#e6dfd2', LOWF = '#ddd6c8';
const font = `font-family="Noto Sans CJK SC, sans-serif"`;
const f1 = (v) => v.toFixed(1);
const m2 = (v) => v.toFixed(2);
function canvas(W, H) {
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`, `<rect width="${W}" height="${H}" fill="${PAPER}"/>`];
  return {
    svg,
    txt: (x, y, s, size = 12, fill = INK, anchor = 'start', weight = 400) => svg.push(`<text x="${f1(x)}" y="${f1(y)}" ${font} font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${s}</text>`),
    line: (x1, y1, x2, y2, stroke = INK, w = 1, dash = '') => svg.push(`<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`),
    rect: (x, y, w, h, fill = 'none', stroke = INK, sw = 1, op = 1) => svg.push(`<rect x="${f1(Math.min(x, x + w))}" y="${f1(Math.min(y, y + h))}" width="${f1(Math.abs(w))}" height="${f1(Math.abs(h))}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"/>`),
    poly: (pts, stroke = INK, w = 1.4, fill = 'none', closed = false, extra = '') => svg.push(`<${closed ? 'polygon' : 'polyline'} points="${pts.map((p) => p.map(f1).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" ${extra}/>`),
  };
}
const view = (ox, oy, k) => ({ X: (u) => ox + u * k, Y: (h) => oy - h * k, k });

const W = 2240, H = 1180;
const g = canvas(W, H);
const C = M.coreR;
g.txt(36, 42, '茶几 + 小一圈猫台：坐下时落的那台落成两层（线稿 · 2026-11-05）', 20, INK, 'start', 600);
g.txt(36, 66, `截面是真引擎终态（一条 338 节的布、两个结构，键与 2-15 现行平台同一组），按 2-15 的缩放换成米。整台按下台台面 = ${TABLE_TOP} m 落位（2-15 的升降已能做到）。`, 12, MUTE);
g.txt(36, 84, `下台整圈 = 人的茶几；上台只在背向座位的那半圈，下面是猫能钻的檐下、上面是猫能趴的台。沙发前缘到茶几前缘 ${SOFA_GAP} m。人、猫、沙发只作比例参考。蓝 = 上台，灰 = 下台，橙 = 锁定键。`, 12, MUTE);

// ── A 行：侧视（沿座位方向剖开，面档截面）
const kA = 205, H0 = 0, H1 = 1.45, oyA = 170 + H1 * kA;
g.txt(36, 116, 'A　侧视（剖面过立杆、沿座位朝向）', 14, INK, 'start', 600);
const section = (v, prof, cx, dh, side, color, w = 1.5) => {
  const P = prof.pts.map(([x, y]) => [v.X(cx + side * (C + x)), v.Y(dh + y)]);
  g.poly(P, color, w);
  for (const [i, j] of prof.keys) g.line(P[i][0], P[i][1], P[j][0], P[j][1], KEY, 0.7);
};
const catBlocks = (v, u, h, pose, dir = 1) => {
  const b = (bx, by, bw, bh) => { const x0 = dir > 0 ? u + bx : u - bx - bw; g.rect(v.X(x0), v.Y(h + by + bh), bw * v.k, bh * v.k, CAT, 'none', 0); };
  if (pose === 'lie') { b(-0.17, 0, 0.32, 0.1); b(0.12, 0.03, 0.09, 0.085); b(0.13, 0.115, 0.022, 0.03); b(0.185, 0.115, 0.022, 0.03); b(-0.26, 0, 0.1, 0.03); }
  else { b(-0.08, 0, 0.16, 0.19); b(0.0, 0.17, 0.1, 0.085); b(0.01, 0.255, 0.022, 0.032); b(0.07, 0.255, 0.022, 0.032); b(-0.15, 0, 0.08, 0.03); }
};
const sofa = (v, front) => {
  const R = (a, b, h0, h1, fill, stroke = 'none') => g.rect(v.X(front + a), v.Y(h1), (b - a) * v.k, (h1 - h0) * v.k, fill, stroke, stroke === 'none' ? 0 : 1);
  R(-0.6, 0, 0, 0.43, SOFA, MUTE); R(-0.6, -0.48, 0, 0.85, SOFA, MUTE);
  R(-0.45, -0.02, 0.43, 0.57, PERSON); R(-0.06, 0.06, 0.06, 0.45, PERSON); R(-0.06, 0.14, 0, 0.06, PERSON);
  R(-0.48, -0.26, 0.55, 1.05, PERSON); R(-0.46, -0.27, 1.07, 1.29, PERSON); R(-0.3, 0.0, 0.62, 0.7, PERSON);
};
const cols = M.rows.filter((r) => !r.tiers[0].err);
const colW = (W - 60) / cols.length;
cols.forEach((row, ci) => {
  const t = row.tiers[0];
  const x0 = 30 + ci * colW, v0 = view(x0 + 40 + 0.62 * kA, oyA, kA);
  const dh = TABLE_TOP - t.lo.top;
  const halfLo = C + t.lo.reach;
  const ucx = SOFA_GAP + halfLo; // 立杆离沙发前缘
  const v = view(v0.X(0), oyA, kA);
  g.txt(x0 + 6, 150, row.zh, 13, row.key === 'same' ? MUTE : NEW, 'start', 600);
  // 地面
  g.line(v.X(-0.62), v.Y(0), v.X(ucx + 0.42), v.Y(0), INK, 1.2);
  if (ci === 0) for (let hh = 0; hh <= 1.4001; hh += 0.1) { g.line(v.X(-0.62), v.Y(hh), v.X(-0.62) + 4, v.Y(hh), MUTE, 0.8); g.txt(v.X(-0.62) - 3, v.Y(hh) + 4, hh.toFixed(1), 10, MUTE, 'end'); }
  sofa(v, 0);
  // 立杆
  g.line(v.X(ucx), v.Y(H1), v.X(ucx), v.Y(dh + t.lo.bot - 0.03), MUTE, 1, '5 3');
  for (const sd of [-1, 1]) g.line(v.X(ucx + sd * C), v.Y(H1), v.X(ucx + sd * C), v.Y(dh + t.lo.bot), INK, 1.1);
  // 下台两侧、上台只在背后（远离沙发）一侧
  section(v, t.lo, ucx, dh, -1, INK);
  section(v, t.lo, ucx, dh, 1, INK);
  section(v, t.up, ucx, dh, 1, NEW);
  // 前半边那段上台布贴着立杆（不扣键）
  g.txt(v.X(ucx - C - 0.01), v.Y(dh + (t.up.top + t.up.bot) / 2) + 4, '布贴立杆', 9, MUTE, 'end');
  // 杯子（前半边，人那一侧）
  const cupU = ucx - C - t.lo.reach * 0.55;
  g.rect(v.X(cupU - 0.04), v.Y(TABLE_TOP + 0.1), 0.08 * kA, 0.1 * kA, '#ffffff', INK, 1);
  // 猫：檐下坐着（下台背后一侧）、上台趴着
  const upTop = dh + t.up.top, gap = t.up.bot - t.lo.top;
  catBlocks(v, ucx + C + Math.min(0.14, t.up.reach * 0.55), TABLE_TOP, gap > 0.3 ? 'sit' : 'lie', -1);
  { const cu = ucx + C + t.up.reach * 0.5; g.rect(v.X(cu - 0.1), v.Y(upTop + 0.12), 0.2 * kA, 0.12 * kA, CAT, 'none', 0); g.rect(v.X(cu - 0.05), v.Y(upTop + 0.2), 0.1 * kA, 0.08 * kA, CAT, 'none', 0); }
  // 标注
  const tag = (u, hh, s, color = MUTE) => { g.line(v.X(u), v.Y(hh), v.X(u) + 14, v.Y(hh), color, 0.8, '2 2'); g.txt(v.X(u) + 17, v.Y(hh) + 4, s, 10, color); };
  tag(ucx + C + t.lo.reach + 0.01, TABLE_TOP, `茶几 ${m2(TABLE_TOP)}`);
  tag(ucx + C + t.up.reach + 0.01, upTop, `上台 ${m2(upTop)}`, NEW);
  // 尺寸行
  const seatX = -0.25; // 坐着的人躯干中心离沙发前缘
  const dSeat = ucx + C + t.up.reach / 2 - seatX;
  const notes = [
    [`上台挑出 ${m2(t.up.reach)} m（下台 ${m2(t.lo.reach)}）`, NEW],
    [`檐下净空 ${m2(gap)} m · 上台顶 ${m2(upTop)} m`, INK],
    [`人（躯干）到上台中段 ${m2(dSeat)} m`, INK],
    [`键 ${t.locked}/${t.nKeys} · 成形途中最大自交环 ${t.knot} 节`, MUTE],
  ];
  notes.forEach(([s, c], j) => g.txt(x0 + 6, oyA + 26 + j * 16, s, 11, c));
});

// ── B 行：俯视
const yB = oyA + 112;
g.txt(36, yB, 'B　俯视（座位在左；方台按面 / 边 / 角三档挑出凑成方，上台二十条带同一个 k 时近圆）', 14, INK, 'start', 600);
const BAND_ANG = Array.from({ length: 20 }, (_, i) => Math.PI / 20 + (i / 20) * 2 * Math.PI);
const CLASS = BAND_ANG.map((a) => { const q = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); return Math.round(Math.min(q, Math.PI / 2 - q) / (Math.PI / 10) - 0.5); });
const kB = 240;
cols.forEach((row, ci) => {
  const x0 = 30 + ci * colW, cx = x0 + 40 + (0.6 + SOFA_GAP + 0.36) * kB, cy = yB + 40 + 0.48 * kB;
  const ri = C * kB;
  const sector = (a, rf, fill, stroke, op) => {
    const hh = Math.PI / 20 - 0.01, a0 = a - hh, a1 = a + hh, r0 = rf(a0), r1 = rf(a1);
    g.poly([[cx + ri * Math.cos(a0), cy + ri * Math.sin(a0)], [cx + r0 * kB * Math.cos(a0), cy + r0 * kB * Math.sin(a0)], [cx + r1 * kB * Math.cos(a1), cy + r1 * kB * Math.sin(a1)], [cx + ri * Math.cos(a1), cy + ri * Math.sin(a1)]], stroke, 0.7, fill, true, `fill-opacity="${op}"`);
  };
  const sqRim = (half) => (a) => half / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
  const loRim = sqRim(C + row.tiers[0].lo.reach);
  const upRim = row.key === 'same' ? sqRim(C + row.tiers[0].up.reach) : () => C + row.tiers[0].up.reach;
  // 下台：方台（面 / 边 / 角三档挑出凑成方）
  BAND_ANG.forEach((a) => sector(a, loRim, LOWF, MUTE, 1));
  // 上台：背向座位（座位在左 ⇒ 朝 −x 是座位方向，背后 = cos(a) > 0）
  BAND_ANG.forEach((a) => { if (Math.cos(a) > 0) sector(a, upRim, NEW, NEW, 0.45); });
  g.svg.push(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(ri)}" fill="${PAPER}" stroke="${MUTE}" stroke-width="0.8"/>`);
  // 沙发与人（座位在左）
  const halfLo = C + row.tiers[0].lo.reach;
  const sofaFront = cx - (halfLo + SOFA_GAP) * kB;
  g.rect(sofaFront - 0.6 * kB, cy - 0.35 * kB, 0.6 * kB, 0.7 * kB, SOFA, MUTE, 1);
  g.rect(sofaFront - 0.45 * kB, cy - 0.2 * kB, 0.42 * kB, 0.4 * kB, PERSON, 'none', 0, 0.85);
  g.txt(sofaFront - 0.3 * kB, cy + 4, '人', 11, '#fff', 'middle');
  // 杯子
  g.svg.push(`<circle cx="${f1(cx - (C + row.tiers[0].lo.reach * 0.55) * kB)}" cy="${f1(cy + 0.08 * kB)}" r="${f1(0.04 * kB)}" fill="#fff" stroke="${INK}" stroke-width="1"/>`);
  // 猫（上台上趴着，顶视 0.42 × 0.2）
  const tu = row.tiers[0].up.reach;
  { const rm = (C + tu / 2) * kB, sweep = 0.42 * kB / rm; const pts = []; for (let q = 0; q <= 16; q++) { const a = -sweep / 2 + (q / 16) * sweep; pts.push([cx + rm * Math.cos(a), cy + rm * Math.sin(a)]); }
    g.poly(pts, CAT, 0.2 * kB, 'none', false, 'stroke-linecap="round" stroke-opacity="0.85"'); }
  // 读数
  const upMax = Math.max(...row.tiers.filter((t) => !t.err).map((t) => C + t.up.reach));
  g.txt(x0 + 6, cy + 0.48 * kB + 22, `上台外缘离立杆 ${m2(upMax)} m（下台方的半边 ${m2(halfLo)} m）`, 11, row.key === 'same' ? MUTE : NEW);
  const ring = row.tiers[0].up.reach;
  g.txt(x0 + 6, cy + 0.48 * kB + 38, `上台是绕立杆的半圈，能用的宽度 = 挑出 ${m2(ring)} m（趴着的猫身宽约 0.20 m，蜷成一团约 0.35 m）`, 11, ring < 0.2 ? KEY : MUTE);
  g.txt(x0 + 6, cy + 0.48 * kB + 54, row.key === 'same' ? '与现行两层台相同：方的半圈，角上最宽' : ring < 0.2 ? '比猫身还窄，只能顺着趴，蜷不下' : '近圆的半圈，比方的少了四个角', 11, ring < 0.2 ? KEY : MUTE);
});

g.svg.push('</svg>');
const text = g.svg.join('\n');
writeFileSync(join(OUT, 'form-coffee.svg'), text);
try {
  const { chromium } = await import('playwright').catch(async () => (await import('node:module')).createRequire(import.meta.url)('playwright'));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5 });
  await p.setContent(text);
  await p.screenshot({ path: join(OUT, 'form-coffee.png'), clip: { x: 0, y: 0, width: W, height: H } });
  await b.close();
} catch (e) {
  console.log('（没装 playwright，只出 SVG）', e.message);
}
console.log(`\n→ ${join(OUT, 'form-coffee.svg')}`);
