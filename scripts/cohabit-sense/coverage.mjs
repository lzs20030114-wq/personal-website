// 项目二 · 摄像头布置的覆盖率（2026-11-18，作者问「房间上边两个角各架一台摄像头交叉，能不能算出人和猫的立体位置」）。
// 跑标准场景（6 人 4 猫 · 方台铺满整间房 · 20 座 · 引导开 · 空间读真值），每 2 s 取一刻，按 cohabit-sense 的遮挡模型
// （落下的单元：芯外那截布 + 吊杆 + 台面；家具；人的身体）数每个人、每只猫此刻被几台摄像头看见：
//   人：上半身（头或胸）被 ≥1 / ≥2 台看见；脸被 ≥1 台看见（摄像头在头朝向 ±60° 以内）——站着 / 走着与坐着分开数
//   猫：地上的猫身体或头被 ≥1 / ≥2 台看见（走到家具占的位置上 = 在家具顶面上）；台上的猫被 ≥1 台看见
// 另出一张平面图：一种布置下房间里每一点（猫的高度 0.15 m 被 ≥1 台、站着的人胸口 1.3 m 被 ≥2 台）有多少时间看得见。
//
// 用法：node scripts/cohabit-sense/coverage.mjs <outDir> [seconds=900] [seeds=3]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [OUT = join(root, '项目二_感知层'), SECS = '900', SEEDS = '3'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const FONT = `font-family="'Noto Sans CJK SC','PingFang SC','Source Han Sans SC',sans-serif"`;

const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const S = await server.ssrLoadModule('/src/lib/space/cohabit-sense.ts');
  const solid = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
  const make = (seed) => {
    const sim = new m.CohabitSim({ trigger: 'posture', grid: m.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed, opening: false, auto: true, faces: true, social: true, catFloor: true, cat: { ...m.COHABIT.CAT_MT, ...m.COHABIT.CAT_LEVELS.mid }, goal: true, guide: { target: 'meet' }, pace: m.PACE_DEMO });
    m.populateCohabit(sim, 6, 0);
    m.scatterCats(sim, 4, seed);
    return sim;
  };
  const roomM = make(1).layout.roomM;
  const layouts = S.CAM_LAYOUTS.map((L) => ({ ...L, cams: S.cameraLayout(L.key, roomM) }));
  const z = () => ({ n: 0, a1: 0, a2: 0, face: 0 });
  const acc = Object.fromEntries(layouts.map((L) => [L.key, { stand: z(), seat: z(), floorCat: z(), topCat: z() }]));
  let deployed = 0;
  let moments = 0;
  const catTop = (sim, c) => {
    const f = sim.tableBy[c.unit.i];
    const rects = sim.furn?.rects ?? [];
    return f >= 0 && rects[f] ? solid.tableTopFor(rects[f]) : solid.TABLE_TOP.stand;
  };
  const catPoint = (sim, c) => {
    const w = c.walker;
    if (!c.unit) return { x: w.x, y: w.y };
    const r = sim.layout.mastR + S.SENSE_BODY.catR;
    if (Math.hypot(w.x - c.unit.x, w.y - c.unit.y) >= r) return { x: w.x, y: w.y };
    return { x: c.unit.x + Math.cos(w.heading) * r, y: c.unit.y + Math.sin(w.heading) * r };
  };
  const furnBoxes = S.furnitureScene(make(1));
  // 平面图用的那一场：每 30 s 留一份场景
  const snaps = [];
  for (let s = 1; s <= Number(SEEDS); s++) {
    const sim = make(100 + s);
    const dt = 1 / 30;
    let next = 30; // 开场 30 s 人还没散开，不取
    for (let t = 0; t < Number(SECS) - 1e-9; t += dt) {
      sim.step(dt);
      if (sim.t < next) continue;
      next += 2;
      moments++;
      const scene = S.sceneOf(sim);
      deployed += sim.act.degree.filter((d) => d > 1e-3).length;
      if (s === 1 && Math.round(sim.t) % 15 === 0) snaps.push({ scene, units: sim.layout.units.map((u) => ({ x: u.x, y: u.y, d: sim.act.degree[u.i] })) });
      for (const L of layouts) {
        const a = acc[L.key];
        for (const p of sim.people) {
          const w = p.walker;
          if (!w.present) continue;
          const v = S.personView(scene, L.cams, w.x, w.y, p.seated, w.gaze, p.id);
          const b = p.seated ? a.seat : a.stand;
          b.n++;
          if (v.upper >= 1) b.a1++;
          if (v.upper >= 2) b.a2++;
          if (v.face >= 1) b.face++;
        }
        for (const c of sim.cats) {
          if (!c.walker.present || c.transfer) continue;
          const pt = catPoint(sim, c);
          const n = S.catView(scene, L.cams, pt.x, pt.y, c.unit ? catTop(sim, c) : S.floorSurface(furnBoxes, pt.x, pt.y));
          const b = c.unit ? a.topCat : a.floorCat;
          b.n++;
          if (n >= 1) b.a1++;
          if (n >= 2) b.a2++;
        }
      }
    }
    console.error(`seed ${100 + s} done`);
  }
  const pct = (k, n) => (n ? ((100 * k) / n).toFixed(0) : '—');
  console.log(`\n${SEEDS} 个种子 · 每场 ${SECS} s · 每 2 s 一刻（共 ${moments} 刻）· 平均落着的单元 ${(deployed / moments).toFixed(1)} 台`);
  console.log('| 布置 | 站着 / 走着的人：上半身 ≥1 台 · ≥2 台 · 脸 | 坐着的人：上半身 ≥1 · 脸 | 地上的猫 ≥1 · ≥2 | 台上的猫 ≥1 |');
  console.log('|---|---|---|---|---|');
  const table = {};
  for (const L of layouts) {
    const a = acc[L.key];
    table[L.key] = a;
    console.log(`| ${L.zh}（${L.cams.length} 台） | ${pct(a.stand.a1, a.stand.n)}% · ${pct(a.stand.a2, a.stand.n)}% · ${pct(a.stand.face, a.stand.n)}% | ${pct(a.seat.a1, a.seat.n)}% · ${pct(a.seat.face, a.seat.n)}% | ${pct(a.floorCat.a1, a.floorCat.n)}% · ${pct(a.floorCat.a2, a.floorCat.n)}% | ${pct(a.topCat.a1, a.topCat.n)}% |`);
  }
  writeFileSync(join(OUT, 'coverage.json'), JSON.stringify({ seconds: Number(SECS), seeds: Number(SEEDS), moments, table }, null, 1));

  // ── 平面图 ──
  const sim0 = make(101);
  const furn = S.furnitureScene(sim0);
  const STEP = 0.1;
  const half = roomM / 2;
  const N = Math.round(roomM / STEP);
  const show = ['adjacent2', 'diagonal2', 'corners4'];
  const PW = 300;
  const sc = PW / roomM;
  const ROWS = [
    { zh: '地上的猫（0.15 m）被 ≥1 台看见', z: 0.15, need: 1 },
    { zh: '站着的人的胸口（1.3 m）被 ≥2 台看见', z: 1.3, need: 2 },
  ];
  const W = 40 + show.length * (PW + 30);
  const H = 110 + ROWS.length * (PW + 80) + 60;
  let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fbfaf7"/>`;
  g += `<text x="24" y="34" font-size="18" font-weight="600" ${FONT}>摄像头装在哪：房间里每一点有多少时间看得见</text>`;
  g += `<text x="24" y="56" font-size="11.5" fill="#555" ${FONT}>2-15 那间房（${roomM.toFixed(2)} m 见方，高 3.74 m）· 标准场景 6 人 4 猫跑 ${SECS} s，每 30 s 取一刻（${snaps.length} 刻）· 摄像头装在 3.4 m（收起的单元下沿 3.53 m 以下），100° × 70°，对准房间中心</text>`;
  g += `<text x="24" y="74" font-size="11.5" fill="#555" ${FONT}>挡视线的：落下的单元（芯外那截布 ⌀0.16 m、吊杆、6.5 cm 台面）、家具、人。颜色越深 = 越多时间看得见；斜线 = 家具；小方框 = 64 台单元的平台位置</text>`;
  const blocked = (scene, cam, x, y, zz) => !S.camSees(scene, cam, x, y, zz);
  const inFurn = (x, y) => furn.some((b) => {
    const dx = x - b.cx;
    const dy = y - b.cy;
    const lx = b.c * dx - b.s * dy;
    const ly = b.s * dx + b.c * dy;
    return Math.abs(lx) <= b.hx && Math.abs(ly) <= b.hy && b.z1 > 0.3;
  });
  const color = (f) => {
    // 0 → #efe9dd，1 → #1d5c4f
    const a = [239, 233, 221];
    const b = [29, 92, 79];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',')})`;
  };
  const summary = {};
  ROWS.forEach((row, ri) => {
    show.forEach((key, ci) => {
      const L = layouts.find((x) => x.key === key);
      const ox = 24 + ci * (PW + 30);
      const oy = 126 + ri * (PW + 80);
      if (ci === 0) g += `<text x="${ox}" y="${oy - 30}" font-size="13.5" font-weight="600" ${FONT}>${row.zh}</text>`;
      g += `<text x="${ox}" y="${oy - 9}" font-size="12" fill="#333" ${FONT}>${L.zh}（${L.cams.length} 台）</text>`;
      let sum = 0;
      let cnt = 0;
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          const x = -half + (i + 0.5) * STEP;
          const y = -half + (j + 0.5) * STEP;
          let f;
          if (inFurn(x, y)) f = -1;
          else {
            let k = 0;
            for (const sn of snaps) {
              let n = 0;
              for (const cam of L.cams) if (!blocked(sn.scene, cam, x, y, row.z)) n++;
              if (n >= row.need) k++;
            }
            f = k / snaps.length;
            sum += f;
            cnt++;
          }
          const px = ox + (x + half - STEP / 2) * sc;
          const py = oy + (y + half - STEP / 2) * sc;
          g += f < 0 ? `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${(STEP * sc + 0.3).toFixed(1)}" height="${(STEP * sc + 0.3).toFixed(1)}" fill="url(#hatch)"/>` : `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${(STEP * sc + 0.3).toFixed(1)}" height="${(STEP * sc + 0.3).toFixed(1)}" fill="${color(f)}"/>`;
        }
      summary[`${key}:${row.z}`] = sum / cnt;
      // 平台位置
      for (const u of sim0.layout.units) {
        const r = sim0.layout.platR;
        g += `<rect x="${(ox + (u.x - r + half) * sc).toFixed(1)}" y="${(oy + (u.y - r + half) * sc).toFixed(1)}" width="${(2 * r * sc).toFixed(1)}" height="${(2 * r * sc).toFixed(1)}" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="0.6"/>`;
      }
      g += `<rect x="${ox}" y="${oy}" width="${PW}" height="${PW}" fill="none" stroke="#222" stroke-width="1"/>`;
      for (const cam of L.cams) {
        const cx = ox + (cam.x + half) * sc;
        const cy = oy + (cam.y + half) * sc;
        for (const s of [-1, 1]) {
          const a = cam.yaw + (s * cam.hfov) / 2;
          g += `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + Math.cos(a) * 40).toFixed(1)}" y2="${(cy + Math.sin(a) * 40).toFixed(1)}" stroke="#b5452f" stroke-width="1" stroke-dasharray="3 2"/>`;
        }
        g += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5" fill="#b5452f"/>`;
      }
      g += `<text x="${ox + PW}" y="${oy + PW + 16}" font-size="11" text-anchor="end" fill="#333" ${FONT}>平均 ${(100 * (sum / cnt)).toFixed(0)}% 的时间看得见</text>`;
    });
  });
  // 图例
  const ly = H - 34;
  g += `<defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#d9d3c6"/><line x1="0" y1="0" x2="0" y2="5" stroke="#9a9286" stroke-width="1.2"/></pattern></defs>`;
  for (let k = 0; k <= 10; k++) g += `<rect x="${24 + k * 22}" y="${ly}" width="22" height="12" fill="${color(k / 10)}"/>`;
  g += `<text x="24" y="${ly + 26}" font-size="10.5" fill="#555" ${FONT}>从不看得见</text><text x="${24 + 11 * 22}" y="${ly + 26}" font-size="10.5" text-anchor="end" fill="#555" ${FONT}>一直看得见</text>`;
  g += `<circle cx="${24 + 11 * 22 + 30}" cy="${ly + 6}" r="5" fill="#b5452f"/><text x="${24 + 11 * 22 + 40}" y="${ly + 10}" font-size="10.5" fill="#555" ${FONT}>摄像头与它的水平视场</text>`;
  g += `</svg>`;
  writeFileSync(join(OUT, 'camera-coverage.svg'), g);
  console.log('\n平面图平均看得见的时间：', Object.entries(summary).map(([k, v]) => `${k} ${(100 * v).toFixed(0)}%`).join(' · '));
  try {
    const require = createRequire(import.meta.url);
    const { chromium } = require('playwright');
    const b = await chromium.launch();
    const p = await b.newPage({ deviceScaleFactor: 2 });
    await p.setViewportSize({ width: W, height: H });
    await p.setContent(`<html><body style="margin:0">${g}</body></html>`);
    await p.screenshot({ path: join(OUT, 'camera-coverage.png'), clip: { x: 0, y: 0, width: W, height: H } });
    await b.close();
    console.log(`PNG → ${OUT}`);
  } catch (e) {
    console.log('（没有 playwright，只出 SVG）', e.message);
  }
} finally {
  await server.close();
}
