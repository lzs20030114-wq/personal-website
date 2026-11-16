// 单元形态与 2-15 的对应 · 线稿：照台架的配置跑 2-15，挑几次「坐下 → 引猫」，把那一次里先后落下的台（路上的每一步、
// 座位前方那台、桌子）画成平面与沿路展开的剖面。形全部由 src/lib/space/cohabit-design.ts 现算，画法只做投影。
//   node scripts/cohabit-design/draft.mjs [输出目录=项目二_形态与组合的连接] [种子=12,14] [秒数=900]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
const OUT = process.argv[2] ?? '项目二_形态与组合的连接';
const seeds = (process.argv[3] ?? '12,14').split(',').map(Number);
const T = Number(process.argv[4] ?? 900);
mkdirSync(OUT, { recursive: true });
const server = await createServer({ root: process.cwd(), server: { middlewareMode: true, hmr: false }, logLevel: 'silent', appType: 'custom' });
const C = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
const S = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
const D = await server.ssrLoadModule('/src/lib/space/cohabit-design.ts');
const { DUAL_GAP_M } = { DUAL_GAP_M: 0.58 - 0.065 }; // 上下两块：上层台面比下层高 0.58（cohabit-vignette UPPER_ABOVE），台厚 6.5 cm

// ── 跑 2-15，收集「坐下 → 引猫」的一次次 ──────────────────────────────────────────────
const episodes = [];
for (const seed of seeds) {
  const sim = new C.CohabitSim({ trigger: 'posture', grid: C.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed, opening: false, auto: true, faces: true, social: true, catFloor: true, cat: { ...C.COHABIT.CAT_MT, ...C.COHABIT.CAT_LEVELS.mid }, guide: C.COHABIT.GUIDE, pace: C.PACE_DEMO });
  const half = sim.layout.fieldM / 2;
  C.partySizes(S.SCENE.people).forEach((sz, i, a) => { const ang = (i / a.length) * 2 * Math.PI + 0.3; sim.addParty(Math.cos(ang) * half * 0.6, Math.sin(ang) * half * 0.6, sz); });
  C.scatterCats(sim, S.SCENE.cats, seed);
  const n = sim.layout.units.length;
  const formed = new Array(n).fill(null);
  const open = new Map(); // 'p:c' → 这一次
  const dt = 1 / 30;
  for (let t = 0; t < T; t += dt) {
    sim.step(dt);
    for (let u = 0; u < n; u++) {
      if (sim.act.degree[u] <= 1e-4) { formed[u] = null; continue; }
      if (formed[u]) continue;
      const r = D.roleOf(sim, u);
      formed[u] = D.designUnit(sim, u, formed);
      if ((r.role === 'step' || r.role === 'meet') && r.guide) {
        const key = `${r.guide.person}:${r.guide.cat}`;
        let ep = open.get(key);
        if (!ep) {
          const cat = sim.cats.find((c) => c.id === r.guide.cat);
          const person = sim.people.find((p) => p.id === r.guide.person);
          const seat = sim.seats[person.seat];
          ep = { seed, t0: t, key, seatIdx: person.seat, seat: { x: seat.x, y: seat.y, face: seat.face, table: seat.table }, catStart: cat.unit ? { unit: cat.unit.i } : { x: cat.walker.x, y: cat.walker.y }, steps: [], last: t };
          if (cat.unit && formed[cat.unit.i]) ep.steps.push({ u: cat.unit.i, t: t, d: formed[cat.unit.i], start: true });
          if (seat.table >= 0 && formed[seat.table]) ep.table = { u: seat.table, d: formed[seat.table] };
          open.set(key, ep);
        }
        if (ep.done) continue;
        if (!ep.steps.some((s) => s.u === u)) ep.steps.push({ u, t, d: formed[u] });
        if (r.role === 'meet') {
          ep.done = true;
          // 路是一步一步重算的（猫走到哪就从哪算），所以按落下的先后排：就是猫走过的那一串
        }
        ep.last = t;
      }
    }
    // 某个座位的桌子后落下的，也记进那一次
    for (const ep of open.values()) if (!ep.table && ep.seat.table >= 0 && formed[ep.seat.table]) ep.table = { u: ep.seat.table, d: formed[ep.seat.table] };
    for (const [key, ep] of open) {
      const g = sim.guides.find((k) => `${k.person}:${k.cat}` === key);
      if (g) ep.last = t;
      else if (t - ep.last > 8 || (ep.done && t - ep.last > 2)) { open.delete(key); if (ep.done) episodes.push(ep); }
    }
  }
  var layout = sim.layout, rects = sim.furn.rects, seats = sim.seats;
}
await server.close();
console.log('一次次（走到了座位前方那台的）', episodes.length);

// ── 挑三次：地面起步（房间中间）、台上起步拐弯、最长 ───────────────────────────────────
const lenOf = (ep) => ep.steps.length;
const floorOpen = episodes.filter((e) => !('unit' in e.catStart) && e.steps[0]?.d.role === 'step' && Math.abs(e.steps[0].d.slope.from - D.DESIGN.LOW) < 1e-6).sort((a, b) => lenOf(b) - lenOf(a));
const turned = (e) => e.steps.some((s) => s.d.slope && Math.abs(Math.cos(s.d.slope.outDir - s.d.slope.inDir)) < 0.5);
const fromUnit = episodes.filter((e) => 'unit' in e.catStart && turned(e)).sort((a, b) => lenOf(b) - lenOf(a));
const longest = [...episodes].sort((a, b) => lenOf(b) - lenOf(a));
const picks = [];
for (const list of [floorOpen, fromUnit, longest]) { const e = list.find((x) => !picks.includes(x)); if (e) picks.push(e); }
console.log('挑中', picks.map((e) => `seed ${e.seed} t ${e.t0.toFixed(0)} 台 ${e.steps.length} 起步 ${'unit' in e.catStart ? '台上' : '地面'}`).join(' · '));

// ── 画 ───────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const f2 = (v) => v.toFixed(2);
const INK = '#1d2321', MUTE = '#7d8784', LINE = '#c7cdca', G = '#2f7d5a', P = '#7a5aa8', FILL = '#e8eeeb';
const PR = layout.platR;
function plan(ep, x0, y0, W) {
  const pts = [...ep.steps.map((s) => layout.units[s.u]), ep.seat];
  if (ep.table) pts.push(layout.units[ep.table.u]);
  if (!('unit' in ep.catStart)) pts.push(ep.catStart);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 2 * PR + 0.6;
  const k = W / span;
  const X = (x) => x0 + W / 2 + (x - cx) * k, Y = (y) => y0 + W / 2 + (y - cy) * k;
  const cid = `c${x0}_${y0}`;
  let s = `<clipPath id="${cid}"><rect x="${x0}" y="${y0}" width="${W}" height="${W}"/></clipPath><rect x="${x0}" y="${y0}" width="${W}" height="${W}" fill="none" stroke="${LINE}"/><g clip-path="url(#${cid})">`;
  // 格子与家具
  for (const u of layout.units) if (Math.abs(u.x - cx) < span / 2 && Math.abs(u.y - cy) < span / 2) s += `<rect x="${X(u.x - PR)}" y="${Y(u.y - PR)}" width="${2 * PR * k}" height="${2 * PR * k}" fill="none" stroke="${LINE}" stroke-dasharray="3 3"/>`;
  for (const r of rects) if (r.cx > cx - span / 2 - 1 && r.cx < cx + span / 2 + 1 && r.cy > cy - span / 2 - 1 && r.cy < cy + span / 2 + 1) {
    if (r.tilted) { const [fx, fy] = r.face, tx = -fy, ty = fx; const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [r.cx + a * r.hu * tx + b * r.hv * fx, r.cy + a * r.hu * ty + b * r.hv * fy]); s += `<polygon points="${c.map(([a, b]) => `${X(a)},${Y(b)}`).join(' ')}" fill="#f3efe6" stroke="${MUTE}"/>`; }
    else s += `<rect x="${X(r.x0)}" y="${Y(r.y0)}" width="${(r.x1 - r.x0) * k}" height="${(r.y1 - r.y0) * k}" fill="#f3efe6" stroke="${MUTE}"/>`;
  }
  // 桌子
  if (ep.table) { const u = layout.units[ep.table.u]; s += `<rect x="${X(u.x - PR)}" y="${Y(u.y - PR)}" width="${2 * PR * k}" height="${2 * PR * k}" fill="#f5f5f2" stroke="${INK}"/><text x="${X(u.x)}" y="${Y(u.y) + 4}" font-size="11" text-anchor="middle" fill="${INK}">桌子 ${f2(ep.table.d.top)}</text>`; }
  // 路上的台
  ep.steps.forEach((st, i) => {
    const u = layout.units[st.u], d = st.d;
    s += `<rect x="${X(u.x - PR)}" y="${Y(u.y - PR)}" width="${2 * PR * k}" height="${2 * PR * k}" fill="${FILL}" stroke="${G}"/>`;
    if (d.open !== null && !Number.isNaN(d.open)) {
      // 上层盖背向座位的那半圈：画一个半边阴影
      const a = d.open, nx = Math.cos(a), ny = Math.sin(a), tx = -ny, ty = nx;
      const q = [[0, -1], [-1, -1], [-1, 1], [0, 1]].map(([b, c]) => [u.x + (b * nx + c * tx) * PR, u.y + (b * ny + c * ty) * PR]);
      s += `<polygon points="${q.map(([a1, b1]) => `${X(a1)},${Y(b1)}`).join(' ')}" fill="${P}" fill-opacity="0.22" stroke="${P}"/>`;
      s += `<text x="${X(u.x)}" y="${Y(u.y) + 4}" font-size="11" text-anchor="middle" fill="${INK}">下层 ${f2(d.top)}</text>`;
    } else if (d.slope) {
      const a = d.slope, ix = u.x + Math.cos(a.inDir) * PR * 0.72, iy = u.y + Math.sin(a.inDir) * PR * 0.72, ox = u.x + Math.cos(a.outDir) * PR * 0.72, oy = u.y + Math.sin(a.outDir) * PR * 0.72;
      s += `<path d="M${X(ix)},${Y(iy)} Q${X(u.x)},${Y(u.y)} ${X(ox)},${Y(oy)}" fill="none" stroke="${G}" stroke-width="1.6" marker-end="url(#ar)"/>`;
      s += `<text x="${X(u.x)}" y="${Y(u.y) + 4}" font-size="10" text-anchor="middle" fill="${INK}" paint-order="stroke" stroke="#fff" stroke-width="3">${f2(a.from)}→${f2(a.to)}</text>`;
    } else s += `<text x="${X(u.x)}" y="${Y(u.y) + 4}" font-size="11" text-anchor="middle" fill="${INK}">${f2(d.top)}</text>`;
    s += `<text x="${X(u.x - PR) + 4}" y="${Y(u.y - PR) + 12}" font-size="10" fill="${MUTE}">${st.start ? '猫' : i}</text>`;
  });
  // 座位与猫起步
  s += `<circle cx="${X(ep.seat.x)}" cy="${Y(ep.seat.y)}" r="7" fill="${INK}"/><text x="${X(ep.seat.x)}" y="${Y(ep.seat.y) + 20}" font-size="11" text-anchor="middle" fill="${INK}">坐着的人</text>`;
  if (!('unit' in ep.catStart)) s += `<circle cx="${X(ep.catStart.x)}" cy="${Y(ep.catStart.y)}" r="5" fill="none" stroke="${INK}"/><text x="${X(ep.catStart.x)}" y="${Y(ep.catStart.y) - 8}" font-size="10" text-anchor="middle" fill="${INK}">猫（地面）</text>`;
  return s + '</g>';
}
function section(ep, x0, y0, W, H) {
  // 沿路展开：每台占一个格距，进来那侧 → 台心 → 出去那侧
  const units = ep.steps.map((s) => layout.units[s.u]);
  const p = layout.pitchM;
  const total = units.length * p + 0.6;
  const k = Math.min(W / total, H / 1.7);
  const X = (d) => x0 + 20 + d * k, Y = (h) => y0 + H - 18 - h * k;
  let s = `<line x1="${x0}" y1="${Y(0)}" x2="${x0 + W}" y2="${Y(0)}" stroke="${INK}"/>`;
  for (const [h, lab] of [[1.17, '坐着的人眼高 1.17'], [1.57, '站着的人眼高 1.57']]) s += `<line x1="${x0}" y1="${Y(h)}" x2="${x0 + W}" y2="${Y(h)}" stroke="${LINE}" stroke-dasharray="4 4"/><text x="${x0 + W - 4}" y="${Y(h) - 3}" font-size="10" text-anchor="end" fill="${MUTE}">${lab}</text>`;
  const half = PR;
  ep.steps.forEach((st, i) => {
    const d = st.d, c = 0.3 + i * p + p / 2;
    const prev = i > 0 ? units[i - 1] : null, next = units[i + 1] ?? null, u = units[i];
    const thIn = prev ? Math.atan2(prev.y - u.y, prev.x - u.x) : d.slope ? d.slope.inDir : 0;
    const thOut = next ? Math.atan2(next.y - u.y, next.x - u.x) : thIn + Math.PI;
    const hIn = D.heightToward(d, thIn), hOut = D.heightToward(d, thOut);
    const T = 0.065;
    s += `<polygon points="${X(c - half)},${Y(hIn)} ${X(c + half)},${Y(hOut)} ${X(c + half)},${Y(hOut - T)} ${X(c - half)},${Y(hIn - T)}" fill="${d.role === 'meet' ? '#efe9f6' : FILL}" stroke="${d.role === 'meet' ? P : G}"/>`;
    if (d.open !== null) {
      const up = d.top + 0.58; // 上层台面比下层台面高 0.58（cohabit-vignette UPPER_ABOVE，2-15 的 0.90 / 1.48）
      // 两层：上层只盖背后那半圈（剖面上画在远离座位那一侧的一半）
      s += `<rect x="${X(c - half)}" y="${Y(up)}" width="${half * k}" height="${T * k}" fill="#efe9f6" stroke="${P}"/><line x1="${X(c)}" y1="${Y(d.top)}" x2="${X(c)}" y2="${Y(up - T)}" stroke="${MUTE}" stroke-width="0.8"/>`;
      s += `<text x="${X(c)}" y="${Y(up) - 4}" font-size="10" text-anchor="middle" fill="${P}">上层顶 ${f2(up)}</text>`;
    }
    s += `<line x1="${X(c)}" y1="${Y(Math.max(hIn, hOut) + 0.03)}" x2="${X(c)}" y2="${Y(1.9)}" stroke="${LINE}"/>`; // 吊杆
    s += `<text x="${X(c)}" y="${Y(Math.min(hIn, hOut) - T) + 13}" font-size="10" text-anchor="middle" fill="${INK}">${st.start ? '猫在这台' : d.role === 'meet' ? '座位前方' : `第 ${i} 步`}</text>`;
    if (i === 0 && !st.start) { s += `<line x1="${X(c - half - 0.12)}" y1="${Y(0)}" x2="${X(c - half)}" y2="${Y(hIn)}" stroke="${INK}" stroke-dasharray="2 3"/><text x="${X(c - half - 0.12)}" y="${Y(hIn / 2)}" font-size="10" text-anchor="end" fill="${INK}">跳 ${f2(hIn)}</text>`; }
    if (i > 0 && Math.abs(d.jump) > 0.02) s += `<text x="${X(c - half)}" y="${Y(hIn) - 6}" font-size="10" text-anchor="middle" fill="#a34">${d.come === 0 ? `从地面跳 ${f2(d.jump)}` : `接缝差 ${f2(d.jump)}`}</text>`;
  });
  return s;
}
const W = 1180, rowH = 360;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${80 + picks.length * rowH}" font-family="PingFang SC, Noto Sans CJK SC, sans-serif"><defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="${G}"/></marker></defs><rect width="100%" height="100%" fill="#fff"/>`;
svg += `<text x="24" y="34" font-size="20" fill="${INK}">坐下 → 引猫：一次里先后落下的台（2-15 现跑，形由 cohabit-design 现算）</text><text x="24" y="58" font-size="12" fill="${MUTE}">左 = 平面（虚线格 = 2-15 的方台位置，米色 = 家具，紫色半边 = 上层盖住的那半圈），右 = 沿路展开的剖面（高度 m）。每台一个格距 ${f2(layout.pitchM)} m，台缝 0.13 m 未画</text>`;
picks.forEach((ep, r) => {
  const y = 80 + r * rowH;
  svg += `<text x="24" y="${y + 16}" font-size="13" fill="${INK}">${r + 1}. 种子 ${ep.seed} · 第 ${ep.t0.toFixed(0)} 秒起 · ${ep.steps.length} 台 · 猫从${'unit' in ep.catStart ? '台上' : '地面'}出发</text>`;
  svg += plan(ep, 24, y + 26, 330);
  svg += section(ep, 380, y + 26, W - 410, 320);
});
svg += '</svg>';
writeFileSync(join(OUT, 'guide-episodes.svg'), svg);
writeFileSync(join(OUT, 'episodes.json'), JSON.stringify(picks.map((e) => ({ seed: e.seed, t0: e.t0, steps: e.steps.map((s) => ({ u: s.u, role: s.d.role, floor: D.floorFor(layout, layout.units[s.u], rects), top: s.d.top, slope: s.d.slope, open: s.d.open, come: s.d.come, jump: s.d.jump })) })), (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 1));
// ── 第二张：整间房每台最低能落多低（压着家具的哪一块）────────────────────────────────
{
  const RW = 620, k = (RW - 60) / layout.roomM, ox = 30, oy = 90;
  const X = (x) => ox + (x + layout.roomM / 2) * k, Y = (y) => oy + (y + layout.roomM / 2) * k;
  const tone = (f) => (f <= D.DESIGN.LOW + 1e-6 ? '#ffffff' : f < 0.6 ? '#eef3f0' : f < 0.8 ? '#d9e6df' : '#bcd3c7');
  let r = `<svg xmlns="http://www.w3.org/2000/svg" width="${RW + 360}" height="${RW + 110}" font-family="PingFang SC, Noto Sans CJK SC, sans-serif"><rect width="100%" height="100%" fill="#fff"/>`;
  r += `<text x="24" y="34" font-size="20" fill="${INK}">2-15 那间房：每台最低能落多低（m）</text><text x="24" y="58" font-size="12" fill="${MUTE}">台的方形下面压着家具的哪一块（坐垫 0.43 / 扶手 0.62 / 沙发背 0.80 / 椅背 0.85），落到那一块以上 + 台厚 6.5 cm + 留 2 cm；不压 = 0.42</text>`;
  const counts = {};
  for (const u of layout.units) {
    const f = D.floorFor(layout, u, rects);
    counts[f.toFixed(2)] = (counts[f.toFixed(2)] ?? 0) + 1;
    r += `<rect x="${X(u.x - PR)}" y="${Y(u.y - PR)}" width="${2 * PR * k}" height="${2 * PR * k}" fill="${tone(f)}" stroke="${LINE}"/><text x="${X(u.x)}" y="${Y(u.y) + 4}" font-size="11" text-anchor="middle" fill="${INK}">${f2(f)}</text>`;
  }
  for (const q of rects) {
    if (q.tilted) { const [fx, fy] = q.face, tx = -fy, ty = fx; const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [q.cx + a * q.hu * tx + b * q.hv * fx, q.cy + a * q.hu * ty + b * q.hv * fy]); r += `<polygon points="${c.map(([a, b]) => `${X(a)},${Y(b)}`).join(' ')}" fill="#f3efe6" fill-opacity="0.55" stroke="${MUTE}"/>`; }
    else r += `<rect x="${X(q.x0)}" y="${Y(q.y0)}" width="${(q.x1 - q.x0) * k}" height="${(q.y1 - q.y0) * k}" fill="#f3efe6" fill-opacity="0.55" stroke="${MUTE}"/>`;
    // 靠背那条边加粗
    const [fx, fy] = q.face, bx = q.cx - fx * (q.tilted ? q.hv : (Math.abs(fy) > Math.abs(fx) ? (q.y1 - q.y0) : (q.x1 - q.x0)) / 2), by = q.cy - fy * (q.tilted ? q.hv : (Math.abs(fy) > Math.abs(fx) ? (q.y1 - q.y0) : (q.x1 - q.x0)) / 2);
    r += `<circle cx="${X(bx)}" cy="${Y(by)}" r="2.5" fill="${MUTE}"/>`;
  }
  const keys = Object.keys(counts).sort();
  keys.forEach((key, i) => { r += `<rect x="${RW + 30}" y="${110 + i * 26}" width="18" height="18" fill="${tone(Number(key))}" stroke="${LINE}"/><text x="${RW + 56}" y="${124 + i * 26}" font-size="13" fill="${INK}">${key} m · ${counts[key]} 台</text>`; });
  r += `<text x="${RW + 30}" y="${130 + keys.length * 26}" font-size="12" fill="${MUTE}">小圆点 = 家具靠背那条边</text></svg>`;
  writeFileSync(join(OUT, 'room-floor.svg'), r);
}

try {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  try {
    const h = Number(/height="(\d+)"/.exec(svg)[1]);
    const p = await b.newPage({ deviceScaleFactor: 2, viewport: { width: W, height: h } });
    await p.goto('file://' + join(process.cwd(), OUT, 'guide-episodes.svg'));
    await p.screenshot({ path: join(OUT, 'guide-episodes.png'), clip: { x: 0, y: 0, width: W, height: h } });
    const rs = readFileSync(join(OUT, 'room-floor.svg'), 'utf8');
    const rw = Number(/width="(\d+)"/.exec(rs)[1]), rh = Number(/height="(\d+)"/.exec(rs)[1]);
    const q = await b.newPage({ deviceScaleFactor: 2, viewport: { width: rw, height: rh } });
    await q.goto('file://' + join(process.cwd(), OUT, 'room-floor.svg'));
    await q.screenshot({ path: join(OUT, 'room-floor.png'), clip: { x: 0, y: 0, width: rw, height: rh } });
  } finally { await b.close(); }
} catch (e) { console.log('（没有 playwright，只出 SVG）', e.message); }
