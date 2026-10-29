/**
 * Lab 2-15 形态词汇的线稿与量数（项目二_2-15单元形态方案.md 的图与数从这里出）。
 * 剖面是真引擎终态：平台 = 方形环平档三档（202 节，2-15 现行）；捏分 = 方形环捏分一次循环十档（338 节，2-7 现有）。
 * 按 2-15 的缩放（cohabit-solid 的 rigFor：铺满整间房的 8×8 × SQUARE_SCALE）换成米；座位与家具取 2-15 标准布置的真实坐标。
 *   node scripts/cohabit/form-draft.mjs <outDir>
 * 输出：outDir/form-draft.svg（有 playwright 时另出 form-draft.png）+ 控制台量数表。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

const OUT = process.argv[2] ?? 'form-draft-out';
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { middlewareMode: true }, logLevel: 'silent', appType: 'custom' });
let D, S;
try {
  const U = await server.ssrLoadModule('/src/lib/space/skin-unit.ts');
  const sq = await server.ssrLoadModule('/src/lib/space/skin-square.ts');
  const sqs = await server.ssrLoadModule('/src/lib/space/skin-square-split.ts');
  const ring = await server.ssrLoadModule('/src/lib/space/skin-ring.ts');
  const ua = await server.ssrLoadModule('/src/lib/space/unit-activation.ts');
  const co = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const cs = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
  const grid = await server.ssrLoadModule('/src/lib/space/skin-grid.ts');

  const layout = co.squarePlanLayout(ua.planLayout(co.COHABIT.SEATS.GRID, ring.RING.RADIUS_DEF, 'room'));
  const s = ((grid.RIG_SCALE * layout.pitchM) / layout.pitch4) * co.SQUARE_SCALE; // 与 rigFor 同式
  const mpp = s / cs.UNITS_PER_M; // 米 / 引擎 px（px = 引擎坐标 × 100）
  const coreR = sq.SQUARE.RADIUS * mpp;

  /** 跑完正向协议；pts = [离挂带线的横向 m, 离钉住端的高度 m]；peak = 全程最大挑出（每 10 步采） */
  function solve(def) {
    const u = U.createSkinUnit(def.spec, def.opts);
    let peak = 0;
    for (let k = 0; k < U.SKIN.STEPS; k++) {
      u.advance();
      if (k % 10 === 0) for (let i = 0; i < u.n; i++) peak = Math.max(peak, u.px[i] * 100);
    }
    const foot = u.py[u.n - 1];
    const pts = [];
    for (let i = 0; i < u.n; i++) pts.push([+(u.px[i] * 100 * mpp).toFixed(4), +(Math.abs((u.py[i] - foot) * 100) * mpp).toFixed(4)]);
    const body = pts.filter((q) => q[0] > 0.025).map((q) => q[1]);
    return {
      pts, keys: u.locked.map(([i, j]) => [i, j]), seam: def.seam ?? null,
      reach: Math.max(...pts.map((q) => q[0])), peak: peak * mpp,
      lo: Math.min(...body), hi: Math.max(...body), bandTop: Math.abs((u.py[0] - foot) * 100) * mpp,
    };
  }
  const flat = sq.buildSquareUnits(undefined, cs.UNIT_BAND).map(solve);
  const split = sqs.buildSquareSplitUnits().map(solve);
  const pct = (m) => `${m.toFixed(3)} m`;
  console.log(`2-15 缩放 s = ${s.toFixed(4)} · 1 引擎 px = ${(mpp * 1000).toFixed(2)} mm · 格距 ${layout.pitchM.toFixed(3)} m · 挂带离立杆中心 ${pct(coreR)}`);
  console.log('\n平台（202 节）：档 · 外缘（离立杆中心，终态 / 全程峰值）· 台面离钉住端');
  ['面', '边', '角'].forEach((n, i) => console.log(`  ${n}  ${pct(coreR + flat[i].reach)} / ${pct(coreR + flat[i].peak)} · ${pct(flat[i].lo)}–${pct(flat[i].hi)}`));
  console.log('\n捏分（338 节）：档 · 外缘（终态 / 峰值）· 结构离钉住端 · 设计缝宽');
  split.forEach((p, j) => console.log(`  j${j}  ${pct(coreR + p.reach)} / ${pct(coreR + p.peak)} · ${pct(p.lo)}–${pct(p.hi)} · ${(sqs.SQSPLIT.W_END * (9 - j) / 9 * mpp).toFixed(3)} m`));
  console.log(`\n相邻两台（同一行、面对面）最大外伸相加：捏分 j0 + 平台面档 = 终态 ${pct(2 * coreR + split[0].reach + flat[0].reach)} · 峰值 ${pct(2 * coreR + split[0].peak + flat[0].peak)}（格距 ${pct(layout.pitchM)}）`);

  // 同一条 338 节的布：平台三档放进捏分那副七段谱（sqSplitWrap），配平偏移取三档都容得下的 80
  console.log('\n平台放进 338 节七段谱（sqSplitWrap），三档同一偏移：台面离钉住端 · 外缘 · 锁定键');
  for (const shift of [0, 80]) {
    const row = sq.buildSquareUnits(undefined, cs.UNIT_BAND).map((d) => {
      const seg = d.spec.find((g) => g[0] === 'f' && g[2] && g[2].length);
      const { spec } = sqs.sqSplitWrap(seg, sqs.SQSPLIT.F_TOT, d.en, shift);
      const p = solve({ spec, opts: d.opts });
      return `${d.en} ${pct(p.lo)}–${pct(p.hi)} · ${pct(coreR + p.reach)} · ${p.keys.length}`;
    });
    console.log(`  偏移 ${shift}：${row.join(' | ')}`);
  }

  // 2-15 标准布置：左上那张沙发、它的座位与「座位前方那台」「茶几」
  const sim = new co.CohabitSim({ grid: co.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', trigger: 'posture', seed: 1 });
  const seats = sim.seats;
  console.log('\n标准布置 · 左上沙发的两个座位：座位点 · 座位前方那台（距离）· 茶几');
  for (const st of seats.slice(0, 2)) {
    const m = layout.units[st.meet], t = layout.units[st.table];
    console.log(`  (${st.x.toFixed(2)}, ${st.y.toFixed(2)}) · (${m.x.toFixed(2)}, ${m.y.toFixed(2)}) ${Math.hypot(m.x - st.x, m.y - st.y).toFixed(2)} m · (${t.x.toFixed(2)}, ${t.y.toFixed(2)})`);
  }
  // 每个座位能放捏分的格子：不压家具（平面上留 3 cm）、不出房间、不是谁的茶几；开口取最对着座位的那条边，
  // 腔心 = 中心往开口方向 0.25 m，离座位点 1.0–1.5 m（座位前方那台同一个口径：猫在 1 m 外不付停留代价，又在共温带里）
  const nookHalf = sqs.SQSPLIT && (coreR + split[0].peak);
  const tables = new Set(seats.map((st) => st.table));
  console.log(`\n每个座位能放捏分的格子（捏分半边取峰值 ${pct(nookHalf)}）：`);
  for (const st of seats) {
    const ok = [];
    for (const u of layout.units) {
      if (tables.has(u.i)) continue;
      if (sim.furn.rects.some((r) => u.x + nookHalf > r.x0 - 0.03 && u.x - nookHalf < r.x1 + 0.03 && u.y + nookHalf > r.y0 - 0.03 && u.y - nookHalf < r.y1 + 0.03)) continue;
      if (Math.abs(u.x) + nookHalf > layout.roomM / 2 || Math.abs(u.y) + nookHalf > layout.roomM / 2) continue;
      const dx = st.x - u.x, dy = st.y - u.y;
      const ax = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      const d = Math.hypot(st.x - (u.x + ax[0] * 0.25), st.y - (u.y + ax[1] * 0.25));
      if (d >= 1.0 && d <= 1.5) ok.push(`(${u.x.toFixed(2)}, ${u.y.toFixed(2)}) 开口朝 (${ax.join(', ')}) 腔距 ${d.toFixed(2)} m`);
    }
    console.log(`  ${sim.furn.rects[st.furn].kind} (${st.x.toFixed(2)}, ${st.y.toFixed(2)})：${ok.join(' | ') || '没有'}`);
  }
  D = { coreR, flat, split, order: sqs.buildSquareSplitOrder(), lowerTop: split[0].lo + sqs.SQSPLIT.LOBE * mpp, wEnd: sqs.SQSPLIT.W_END * mpp };
  S = { units: layout.units.map((u) => [u.x, u.y]), rects: sim.furn.rects, seats };
} finally {
  await server.close();
}

// ── 绘图（纯字符串拼 SVG）──
function drawSheet(D, S) {
const CORE = D.coreR;
const FLAT = D.flat[0], FLAT_E = D.flat[1], FLAT_C = D.flat[2];
const SPLIT = D.split; // j0 … j9
const ORDER = D.order; // 带 → 捏分引擎 j（buildSquareSplitOrder）
const reachOf = (p) => Math.max(...p.pts.map((q) => q[0]));
const INK = '#2b2a27', MUTE = '#8a877f', FAINT = '#cfcabe', KEY = '#d9782d', CAT = '#56684a', PERSON = '#7d6f86', PAPER = '#f6f3ec', NEW = '#2f7486', SOFA = '#e6dfd2';
const font = `font-family="Noto Sans CJK SC, sans-serif"`;
const W = 1560, H = 1110;
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`, `<rect width="${W}" height="${H}" fill="${PAPER}"/>`];
const f1 = (v) => v.toFixed(1);
const txt = (x, y, s, size = 12, fill = INK, anchor = 'start', weight = 400) => svg.push(`<text x="${f1(x)}" y="${f1(y)}" ${font} font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${s}</text>`);
const line = (x1, y1, x2, y2, stroke = INK, w = 1, dash = '') => svg.push(`<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`);
const rect = (x, y, w, h, fill = 'none', stroke = INK, sw = 1, op = 1) => svg.push(`<rect x="${f1(Math.min(x, x + w))}" y="${f1(Math.min(y, y + h))}" width="${f1(Math.abs(w))}" height="${f1(Math.abs(h))}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${op}"/>`);
const poly = (pts, stroke = INK, w = 1.4, fill = 'none', closed = false, extra = '') => svg.push(`<${closed ? 'polygon' : 'polyline'} points="${pts.map((p) => p.map(f1).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" ${extra}/>`);
const arrow = (pts, color) => {
  poly(pts, color, 1.3, 'none', false, 'stroke-dasharray="5 3"');
  const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  poly([[b[0] - 8 * Math.cos(ang - 0.4), b[1] - 8 * Math.sin(ang - 0.4)], b, [b[0] - 8 * Math.cos(ang + 0.4), b[1] - 8 * Math.sin(ang + 0.4)]], color, 1.3);
};
// 立面视图：u = 水平（米），h = 离地（米）
const view = (ox, oy, k) => ({ X: (u) => ox + u * k, Y: (h) => oy - h * k, k });
function band(v, prof, cx, foot, side, color = INK) {
  const P = prof.pts.map(([x, y]) => [v.X(cx + side * (CORE + x)), v.Y(foot + y)]);
  poly(P, color, 1.5);
  for (const [i, j] of prof.keys) {
    if (prof.seam != null && (i - prof.seam) * (j - prof.seam) < 0) continue;
    line(P[i][0], P[i][1], P[j][0], P[j][1], KEY, 0.8);
  }
}
const topOf = (p) => Math.max(...p.pts.filter((q) => q[0] > 0.02).map((q) => q[1]));
function flatAt(v, cx, top, dashed = false) {
  const foot = top - topOf(FLAT);
  if (dashed) { // 剖切线之外：只画外轮廓
    const r = CORE + reachOf(FLAT);
    rect(v.X(cx - r), v.Y(top), 2 * r * v.k, 0.148 * v.k, 'none', MUTE, 1, 0.9);
    svg.push(`<line x1="${f1(v.X(cx))}" y1="${f1(v.Y(top - 0.15))}" x2="${f1(v.X(cx))}" y2="${f1(v.Y(foot))}" stroke="${MUTE}" stroke-dasharray="3 3"/>`);
    return foot;
  }
  band(v, FLAT, cx, foot, 1); band(v, FLAT, cx, foot, -1);
  line(v.X(cx), v.Y(foot), v.X(cx), v.Y(foot + 1.0), MUTE, 1, '5 3');
  return foot;
}
const LOWER_TOP = D.lowerTop; // 捏分 j0 下板顶离钉住端（实测）
function splitAt(v, cx, lowerTop, openSide) {
  const foot = lowerTop - LOWER_TOP;
  band(v, SPLIT[0], cx, foot, openSide, NEW); band(v, SPLIT[9], cx, foot, -openSide, NEW);
  line(v.X(cx), v.Y(foot), v.X(cx), v.Y(foot + 1.15), MUTE, 1, '5 3');
  return foot;
}
function floor(v, u0, u1) {
  line(v.X(u0), v.Y(0), v.X(u1), v.Y(0), INK, 1.2);
  for (let u = u0 + 0.05; u < u1; u += 0.1) line(v.X(u), v.Y(0), v.X(u - 0.05), v.Y(-0.05), FAINT, 0.8);
}
function ruler(v, u, top) {
  line(v.X(u), v.Y(0), v.X(u), v.Y(top), MUTE, 0.8);
  for (let h = 0; h <= top + 1e-9; h += 0.5) { line(v.X(u) - 4, v.Y(h), v.X(u), v.Y(h), MUTE, 0.8); txt(v.X(u) - 7, v.Y(h) + 4, h.toFixed(1), 10, MUTE, 'end'); }
}
const tag = (v, u, h, s, color = MUTE, dir = 1) => { line(v.X(u), v.Y(h), v.X(u + dir * 0.1), v.Y(h), color, 0.8, '2 2'); txt(v.X(u + dir * 0.12), v.Y(h) + 4, s, 11, color, dir > 0 ? 'start' : 'end'); };
// 方块猫（侧视）
function cat(v, u, h, pose, dir = 1) {
  const g = (bx, by, bw, bh) => { const x0 = dir > 0 ? u + bx : u - bx - bw; rect(v.X(x0), v.Y(h + by + bh), bw * v.k, bh * v.k, CAT, 'none', 0); };
  if (pose === 'lie') { g(-0.17, 0, 0.32, 0.1); g(0.12, 0.03, 0.09, 0.085); g(0.13, 0.115, 0.022, 0.03); g(0.185, 0.115, 0.022, 0.03); g(-0.26, 0, 0.1, 0.03); }
  else { g(-0.08, 0, 0.16, 0.19); g(0.0, 0.17, 0.1, 0.085); g(0.01, 0.255, 0.022, 0.032); g(0.07, 0.255, 0.022, 0.032); g(-0.15, 0, 0.08, 0.03); }
}
// 沙发 + 坐着的人（侧视）：front = 沙发前缘的水平位置，dir = 人面朝的方向
function sofa(v, front, dir, op = 1) {
  const R = (a, b, h0, h1, fill, stroke = 'none') => rect(v.X(front + dir * a), v.Y(h1), dir * (b - a) * v.k, (h1 - h0) * v.k, fill, stroke, stroke === 'none' ? 0 : 1, op);
  R(-0.8, 0, 0, 0.43, SOFA, MUTE); R(-0.8, -0.6, 0, 0.85, SOFA, MUTE);
  R(-0.55, -0.02, 0.43, 0.57, PERSON); R(-0.06, 0.06, 0.06, 0.45, PERSON); R(-0.06, 0.14, 0, 0.06, PERSON);
  R(-0.6, -0.36, 0.55, 1.05, PERSON); R(-0.58, -0.37, 1.07, 1.29, PERSON); R(-0.42, -0.12, 0.62, 0.7, PERSON);
}

// ── 标题 ──
txt(36, 42, 'Lab 2-15 的方形单元还能成什么（建议稿线稿 · 2026-10-29）', 20, INK, 'start', 600);
txt(36, 66, '剖面是真引擎终态：平台 = 方形环平档面档（202 节，2-15 现行）；捏分 = 方形环捏分一次循环开口侧 j0 + 背侧 j9（338 节，2-7 现有）。按 2-15 的缩放换成米：1 引擎 px = 4.08 mm。', 12, MUTE);
txt(36, 84, '橙线 = 锁定键（上下两片台之间的键不画，与台架同口径）；竖虚线 = 立杆。人、猫、沙发只作比例参考。蓝色 = 建议加入的；黑色 = 2-15 现在已有的。', 12, MUTE);

// ── A 行 ──
const kA = 150, yA = 400;
txt(36, 118, 'A　单个单元（剖面穿过立杆）', 14, INK, 'start', 600);
// A1
{ const v = view(170, yA, kA); txt(60, 146, 'A1　平台 · 站立高度（现行）', 13, INK, 'start', 600);
  floor(v, -0.65, 0.65); ruler(v, -0.68, 1.5); flatAt(v, 0, 1.05); cat(v, 0.2, 1.05, 'lie', 1); tag(v, 0.38, 1.05, '1.05');
  txt(60, yA + 28, '台面 1.05 m · 台厚 0.15 m · 方台边长 0.69 m', 11, MUTE); txt(60, yA + 44, '猫待的台，以及不当桌子的台，都在这个高度', 11, MUTE); }
// A2
{ const v = view(420, yA, kA); txt(330, 146, 'A2　平台 · 茶几（现行）', 13, INK, 'start', 600);
  floor(v, -0.55, 0.65); flatAt(v, 0, 0.49); tag(v, 0.38, 0.49, '0.49');
  txt(330, yA + 28, '人坐下才落；台面下吊着 0.48 m 的带子，', 11, MUTE); txt(330, yA + 44, '0.49 是 202 节布能落到的最低', 11, MUTE); }
// A3
{ const v = view(720, yA, kA); txt(600, 146, 'A3　捏分 · 剖面沿开口方向（建议）', 13, NEW, 'start', 600);
  floor(v, -0.65, 0.8); const foot = splitAt(v, 0, 0.40, 1);
  cat(v, 0.3, 0.40, 'lie', -1); cat(v, -0.2, foot + topOf(SPLIT[9]), 'sit', 1);
  tag(v, 0.5, 0.40, '0.40', NEW); tag(v, 0.5, 0.81, '0.81', NEW); tag(v, 0.5, 0.874, '0.87', NEW);
  line(v.X(0.44), v.Y(0.40), v.X(0.44), v.Y(0.81), NEW, 0.8); txt(v.X(0.42), v.Y(0.6), '腔高 0.41', 11, NEW, 'end');
  txt(v.X(-0.64), v.Y(0.30), '背侧：两片合成', 10, NEW); txt(v.X(-0.64), v.Y(0.30) + 13, '一块（0.13 厚）', 10, NEW);
  txt(600, yA + 28, '开口侧上下两片台夹一个腔，背侧合成整块。', 11, NEW); txt(600, yA + 44, '下板顶 0.40 与沙发座面差不多高；顶板 0.87 也能趴。', 11, NEW); }
// A4：捏分俯视，一圈带子的挑出与腔高
{ const cx = 1060, cy = 270, k = 150; txt(900, 146, 'A4　捏分 · 俯视：开口那半圈有腔（建议）', 13, NEW, 'start', 600);
  const tips = [], fan = [];
  for (let b = 0; b < 20; b++) {
    const a = Math.PI / 20 + (b / 20) * 2 * Math.PI; // squareAngle，0° 朝右，开口（极点）在 90°（画面朝下）
    const j = ORDER[b]; const r = CORE + reachOf(SPLIT[j]);
    tips.push([cx + r * Math.cos(a) * k, cy + r * Math.sin(a) * k]);
    const gap = D.wEnd * (9 - j) / 9;
    const ri = CORE * k, ro = r * k;
    const a0 = a - Math.PI / 20 + 0.03, a1 = a + Math.PI / 20 - 0.03;
    if (gap >= 0.22) svg.push(`<path d="M${f1(cx + ri * Math.cos(a0))},${f1(cy + ri * Math.sin(a0))} L${f1(cx + ro * Math.cos(a0))},${f1(cy + ro * Math.sin(a0))} L${f1(cx + ro * Math.cos(a1))},${f1(cy + ro * Math.sin(a1))} L${f1(cx + ri * Math.cos(a1))},${f1(cy + ri * Math.sin(a1))} Z" fill="${NEW}" fill-opacity="${0.08 + 0.3 * gap / 0.41}"/>`);
    if (b % 2 === 0 || j === 0) { const rr = r * k + 16; if ([4, 2, 0, 7, 9].includes(b) || b === 13) txt(cx + rr * Math.cos(a), cy + rr * Math.sin(a) + 4, `${(gap * 100).toFixed(0)}`, 10, gap > 0 ? NEW : MUTE, 'middle'); }
  }
  poly(tips, NEW, 1.4, 'none', true);
  svg.push(`<circle cx="${cx}" cy="${cy}" r="${f1(CORE * k)}" fill="none" stroke="${MUTE}" stroke-dasharray="3 3"/>`);
  svg.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="${MUTE}"/>`);
  txt(cx, cy + 0.82 * k, '↓ 开口', 11, NEW, 'middle');
  txt(1180, 200, '数字 = 腔口高（cm）', 10, MUTE); txt(1180, 215, '深色 = 腔口 ≥ 22 cm（够猫背高）', 10, MUTE);
  txt(1180, 230, '外缘：面 0.46 · 角 0.65 m（半边）', 10, MUTE); txt(1180, 245, '方台：面 0.35 · 角 0.49 m', 10, MUTE);
  txt(900, yA + 28, '腔口从开口中线往两侧逐带收：41 → 36 → 32 → 27 → 23 cm，', 11, NEW); txt(900, yA + 44, '大约前半圈（±80°）够猫进出，后半圈合拢。', 11, NEW); }
// A5：台阶
{ const v = view(1330, yA, 92); txt(1300, 146, 'A5　台阶（只改规则）', 13, INK, 'start', 600);
  floor(v, -0.4, 2.15); const us = [[0, 0.49], [0.83, 0.74], [1.66, 1.05]];
  for (const [u, t] of us) flatAt(v, u, t);
  cat(v, 0.15, 0.49, 'sit', 1); cat(v, 1.8, 1.05, 'lie', -1);
  arrow([[v.X(0.1), v.Y(0.82)], [v.X(0.8), v.Y(0.98)], [v.X(1.5), v.Y(1.25)]], CAT);
  txt(1300, yA + 28, '0.49 → 0.74 → 1.05，相邻三格，', 11, MUTE); txt(1300, yA + 44, '每级 ≤ 0.31 m；高度机制已有', 11, MUTE); }

// ── B 行：一张沙发旁边 ──
const yB0 = 500;
txt(36, yB0, 'B　一张沙发旁边（建议）：左 = 平面，右 = 沿 S–S 的剖面。位置取 2-15 标准布置的真实坐标（左上那张沙发、它的茶几、它的两台「座位前方那台」）', 14, INK, 'start', 600);
const sofaR = S.rects[0];
const kP = 150, px0 = 70 + 2.65 * kP, py0 = 550 + 3.05 * kP; // 看 x∈[-2.65,0.55] y∈[-3.05,-0.5]
const P = (x, y) => [px0 + x * kP, py0 + y * kP];
// 过道交叉点（灰点）= 格心之间的点；单元中心 = 小圆点
for (const [ux, uy] of S.units) {
  for (const [dx, dy] of [[0.415, 0.415]]) { const nx = ux + dx, ny = uy + dy; if (nx < -2.6 || nx > 0.5 || ny < -3.0 || ny > -0.5) continue; const [x, y] = P(nx, ny); svg.push(`<rect x="${f1(x - 2)}" y="${f1(y - 2)}" width="4" height="4" fill="${FAINT}"/>`); }
}
for (const r of S.rects) { if (r.x0 < -2.7 || r.x1 > 0.6 || r.y0 < -3.1 || r.y1 > -0.5) continue; rect(P(r.x0, 0)[0], P(0, r.y0)[1], (r.x1 - r.x0) * kP, (r.y1 - r.y0) * kP, SOFA, MUTE, 1); if (r.kind === 'chair') txt(P(r.x0, 0)[0] + 4, P(0, r.y1)[1] - 5, '餐椅', 10, MUTE); }
txt(P(sofaR.x0, 0)[0] + 6, P(0, sofaR.y1)[1] - 6, '沙发（座面 0.43 · 扶手 0.62）', 10, MUTE);
for (const s of S.seats.slice(0, 2)) { const [x, y] = P(s.x, s.y); rect(x - 0.14 * kP, y - 0.12 * kP, 0.28 * kP, 0.24 * kP, PERSON, 'none', 0); }
const sqP = (ux, uy, a, color, w = 1.3, dash = '') => { const [x, y] = P(ux - a, uy - a); svg.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(2 * a * kP)}" height="${f1(2 * a * kP)}" fill="none" stroke="${color}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`); };
const TBL = [-1.245, -1.245], NOOK = [-2.075, -1.245], MEET = [-0.415, -2.075], MEET2 = [-2.075, -2.075];
sqP(...TBL, 0.351, INK, 1.2, '6 3'); sqP(...MEET, 0.351, INK); sqP(...MEET2, 0.351, INK);
sqP(...NOOK, 0.464, NEW, 1.6);
{ const [x, y] = P(NOOK[0] - 0.42, NOOK[1] - 0.464); svg.push(`<rect x="${f1(x)}" y="${f1(y + 2)}" width="${f1(0.84 * kP)}" height="${f1(0.32 * kP)}" fill="${NEW}" fill-opacity="0.16"/>`); line(x, y - 3, x + 0.84 * kP, y - 3, NEW, 2.6); }
for (const u of [TBL, NOOK, MEET, MEET2]) { const [x, y] = P(...u); svg.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="2.5" fill="${MUTE}"/>`); }
const callout = (u, dx, dy, lines, c = INK) => { const [x, y] = P(...u); const tx = x + dx * kP, ty = y + dy * kP; line(x, y, tx - 4, ty - 4, FAINT, 0.8); lines.forEach((s, i) => txt(tx, ty + i * 14, s, 11, i ? MUTE : c, 'start', i ? 400 : 600)); };
callout(TBL, 0.45, 0.5, ['茶几 0.49（虚线 = 有人坐下才落）', '两座共用；现行规则'], INK);
callout(MEET2, -0.42, -1.08, ['座位前方那台 · 1.05', '属于画面右边那个座位（离它 1.17 m）', '现行规则把猫引到这里'], INK);
callout(MEET, 0.55, -0.55, ['座位前方那台 · 1.05', '属于画面左边那个座位；压在扶手上方'], INK);
callout(NOOK, 0.12, 0.62, ['捏分（建议）· 下板 0.40 · 顶 0.87', '开口朝沙发；腔离两个座位 1.06 / 1.44 m', '（共温带 0.5–1.5）'], NEW);
// 猫的路线：座位前方那台（1.05）→ 捏分顶（0.87）→ 跳下到开口的下板 → 腔里
{ const a = P(MEET2[0] - 0.12, MEET2[1]), b = P(NOOK[0] - 0.18, NOOK[1] + 0.12), c = P(NOOK[0] - 0.22, NOOK[1] - 0.3);
  arrow([a, [a[0] - 26, (a[1] + b[1]) / 2], b], CAT); arrow([b, [b[0] - 18, (b[1] + c[1]) / 2], c], CAT); }
// 视线：右座 → 腔
{ const s = S.seats[1]; const a = P(s.x, s.y), b = P(NOOK[0] + 0.12, NOOK[1] - 0.3); line(a[0], a[1], b[0], b[1], PERSON, 1.1, '4 3'); }
// S–S
{ const a = P(-2.075, -3.0), b = P(-2.075, -0.55); line(a[0], a[1], b[0], b[1], INK, 0.8, '12 3 2 3'); txt(a[0] + 6, a[1] + 12, 'S', 12, INK, 'start', 600); txt(b[0] + 6, b[1], 'S', 12, INK, 'start', 600); }
// 图例
{ const lx = 70, ly = 1010; txt(lx, ly, '图例：', 11, MUTE); line(lx + 40, ly - 4, lx + 70, ly - 4, CAT, 1.3, '5 3'); txt(lx + 76, ly, '猫的路线：1.05 的台 → 捏分顶板 0.87 → 绕到开口 → 腔里 0.40', 11, CAT);
  line(lx + 40, ly + 14, lx + 70, ly + 14, PERSON, 1.1, '4 3'); txt(lx + 76, ly + 18, '坐着的人看过去', 11, PERSON);
  svg.push(`<rect x="${lx + 52}" y="${ly + 28}" width="4" height="4" fill="${FAINT}"/>`); txt(lx + 76, ly + 36, '过道交叉点（人只在这些点之间走）', 11, MUTE);
  txt(lx, ly + 58, '尺寸：方台半边 0.35 · 捏分半边 0.46（角 0.65）· 格距 0.83 m。捏分与茶几同行相邻：终态台缝 1.5 cm，成形途中两台最大外伸相加正好 0.83 m，', 10, MUTE);
  txt(lx, ly + 72, '所以两台要么不同时在动，要么错开高度。每张沙发只有茶几外侧这一格放得下捏分：茶几另一侧那格压着餐椅，两台「座位前方那台」压在扶手上方，捏分的下板（0.34–0.40 m）会撞上。', 10, MUTE); }

// 剖面 S–S：水平 = 平面 y，从 +x 往 −x 看（左 = 沙发后、右 = 房间中间）
{ const k = 205; const ox = 860 + 3.05 * k; const v = view(ox, 900, k);
  txt(860, 548, 'S–S 剖面 · 从墙那侧往房间里看 · 实线是剖到的两台，沙发和人在剖切线后，画成淡色', 12, INK, 'start', 600);
  floor(v, -3.05, -0.45); ruler(v, -3.08, 1.5);
  sofa(v, sofaR.y1, 1, 0.38);
  flatAt(v, MEET2[1], 1.05); tag(v, MEET2[1] + 0.37, 1.05, '1.05');
  splitAt(v, NOOK[1], 0.40, -1); tag(v, NOOK[1] - 0.5, 0.874, '0.87', NEW, -1); tag(v, NOOK[1] + 0.5, 0.62, '背侧整块', NEW); tag(v, NOOK[1] - 0.5, 0.40, '0.40', NEW, -1); tag(v, NOOK[1] - 0.5, 0.81, '0.81', NEW, -1);
  cat(v, NOOK[1] - 0.3, 0.40, 'lie', -1); cat(v, MEET2[1] + 0.14, 1.05, 'sit', 1);
  line(v.X(-2.36), v.Y(1.18), v.X(NOOK[1] - 0.36), v.Y(0.48), PERSON, 1.1, '4 3');
  txt(v.X(-3.0), v.Y(-0.28), '坐着的人正对腔口，看得见里面的猫；从房间中间（右边）走过来的人先看到背侧那块。', 11, PERSON); txt(v.X(-3.0), v.Y(-0.28) + 15, '茶几与捏分同在一行（plan y = −1.25），在剖切线后 0.83 m，此处不画。', 10, MUTE);
  txt(v.X(NOOK[1]), v.Y(-0.13) + 4, '捏分（剖到）', 11, NEW, 'middle'); txt(v.X(MEET2[1]), v.Y(-0.13) + 4, '座位前方那台（剖到）', 11, MUTE, 'middle');
}
  svg.push('</svg>');
  return svg.join('\n');
}

const svgText = drawSheet(D, S);
writeFileSync(join(OUT, 'form-draft.svg'), svgText);
try {
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1560, height: 1110 }, deviceScaleFactor: 1.5 });
  await p.setContent(svgText);
  await p.screenshot({ path: join(OUT, 'form-draft.png'), clip: { x: 0, y: 0, width: 1560, height: 1110 } });
  await b.close();
} catch (e) {
  console.log('（没装 playwright，只出 SVG；要 PNG 用浏览器打开 SVG 截图）');
}
console.log(`\n→ ${join(OUT, 'form-draft.svg')}`);
