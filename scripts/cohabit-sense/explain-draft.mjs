// 项目二 · 感知层的原理线稿（2026-11-19，作者「A、B 两个方案如何能够可视化的表现出来……方案 B 不用细化到具体设备，把原理说出来就行」）。
// 跑标准场景（6 人 4 猫 · 方台铺满 · 引导开），挑一刻：有人坐着、有人站着、猫在台上也在地上、有被挡住的视线。同一刻画三幅平面：
//   ① 两个方案共用的：座位压力（谁坐在哪个座位）、单元称重（哪台上有猫）
//   ② 方案 A：四个上角的摄像头。每个人 / 每只猫连到看得见它的摄像头（实线），被挡住的画到挡住它的地方（虚线 + ×）；
//      两台以上看见 = 小圈（三角定位）、一台 = 大一点的圈（落到已知的面上）、没有一台 = 问号
//   ③ 方案 B（只讲原理）：身上带一个标签，量到四个固定点的距离，几个圆交在一点就是位置；被人体挡住的那一段量得偏长（虚线圆），
//      交点就散开、圈变大；标签也知道身体朝哪（小箭头）
// 下面一排六张小图：空间每一步读的东西（座位压力 · 称重 · 位置与朝向 · 三条换掉意图的规则）。
// 遮挡几何、摄像头、误差档全部取 cohabit-sense.ts（与研究同一份）。
//
// 用法：node scripts/cohabit-sense/explain-draft.mjs [输出目录=项目二_感知层] [种子=101]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [OUT = join(root, '项目二_感知层'), SEED = '101'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const FONT = `font-family="'Noto Sans CJK SC','PingFang SC','Source Han Sans SC',sans-serif"`;
const INK = '#222';
const MUTE = '#8a847a';
const CAM = '#b5452f';
const SEEN = '#1d5c4f';
const CATC = '#c07a1e';
const PAPER = '#fbfaf7';
const UNIT = '#d9d2c3';
const TABLE = '#bfb5a0';
const FURN = '#ebe5d9';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** 按宽度折行：汉字算 1、拉丁字母与数字算 0.56 个字宽 */
function wrap(str, units) {
  const out = [];
  let line = '';
  let w = 0;
  for (const ch of str) {
    const cw = /[\u2E80-\uFFFF]/.test(ch) ? 1 : 0.56;
    if (w + cw > units && line) {
      out.push(line);
      line = '';
      w = 0;
    }
    line += ch;
    w += cw;
  }
  if (line) out.push(line);
  return out;
}

const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/src/lib/space/cohabit.ts');
  const S = await server.ssrLoadModule('/src/lib/space/cohabit-sense.ts');
  const solid = await server.ssrLoadModule('/src/lib/space/cohabit-solid.ts');
  const makeSim = () => {
    const sim = new m.CohabitSim({ trigger: 'posture', grid: m.COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed: Number(SEED), opening: false, auto: true, faces: true, social: true, catFloor: true, cat: { ...m.COHABIT.CAT_MT, ...m.COHABIT.CAT_LEVELS.mid }, goal: true, guide: { target: 'meet' }, pace: m.PACE_DEMO });
    m.populateCohabit(sim, 6, 0);
    m.scatterCats(sim, 4, Number(SEED));
    return sim;
  };
  const dt = 1 / 30;

  // 一刻的读数：每个目标对每台摄像头 seen / blocked / out；对每个固定点视距 / 非视距
  const readMoment = (sim) => {
    const L = sim.layout;
    const cams = S.cameraLayout('corners4', L.roomM);
    const furnBoxes = S.furnitureScene(sim);
    const scene = S.sceneOf(sim, furnBoxes);
    const hitAt = (cam, x, y, z, owner) => {
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 24; k++) {
        const t = (lo + hi) / 2;
        if (S.segBlocked(scene, cam.x, cam.y, cam.z, cam.x + (x - cam.x) * t, cam.y + (y - cam.y) * t, cam.z + (z - cam.z) * t, owner)) hi = t;
        else lo = t;
      }
      return { x: cam.x + (x - cam.x) * hi, y: cam.y + (y - cam.y) * hi };
    };
    const targets = [];
    for (const p of sim.people) {
      const w = p.walker;
      if (!w.present) continue;
      const pts = p.seated ? S.SENSE_BODY.seatPts : S.SENSE_BODY.standPts;
      const head = pts[pts.length - 1];
      const chest = pts[pts.length - 2];
      let feet = false;
      const rays = cams.map((cam) => {
        if (!S.inView(cam, w.x, w.y, chest) && !S.inView(cam, w.x, w.y, head)) return { kind: 'out' };
        if (S.camSees(scene, cam, w.x, w.y, head, p.id) || S.camSees(scene, cam, w.x, w.y, chest, p.id)) {
          if (!p.seated && S.camSees(scene, cam, w.x, w.y, pts[0], p.id)) feet = true;
          return { kind: 'seen' };
        }
        return { kind: 'blocked', hit: hitAt(cam, w.x, w.y, chest, p.id) };
      });
      const n = rays.filter((r) => r.kind === 'seen').length;
      const first = rays.findIndex((r) => r.kind === 'seen');
      let sd = 0;
      if (p.seated) sd = 0;
      else if (n >= 2) sd = S.SENSE.camera.multi;
      else if (n === 1 && feet) sd = S.SENSE.camera.ground;
      else if (n === 1) {
        const cam = cams[first];
        const dep = Math.atan2(cam.z - head, Math.hypot(w.x - cam.x, w.y - cam.y));
        sd = Math.min(S.SENSE.camera.maxSd, S.SENSE.camera.heightSd / Math.tan(dep));
      }
      // 方案 B：胸牌在身体前表面外一点，量到四个固定点
      const B = S.SENSE.tag;
      const bz = p.seated ? B.seatChest : B.chest;
      const bx = w.x + Math.cos(w.heading) * B.badgeOffset;
      const by = w.y + Math.sin(w.heading) * B.badgeOffset;
      const los = cams.map((a) => !S.segBlocked(scene, a.x, a.y, a.z, bx, by, bz, -1, true));
      targets.push({ kind: 'person', seated: p.seated, x: w.x, y: w.y, n, sd, rays, heading: w.heading, gaze: w.gaze, face: S.personView(scene, cams, w.x, w.y, p.seated, w.gaze, p.id).face, tag: { x: bx, y: by, z: bz, los } });
    }
    for (const c of sim.cats) {
      if (!c.walker.present) continue;
      const w = c.walker;
      let x = w.x;
      let y = w.y;
      if (c.unit) {
        const r = L.mastR + S.SENSE_BODY.catR;
        if (Math.hypot(x - c.unit.x, y - c.unit.y) < r) {
          x = c.unit.x + Math.cos(w.heading) * r;
          y = c.unit.y + Math.sin(w.heading) * r;
        }
      }
      let base = S.floorSurface(furnBoxes, x, y);
      if (c.unit) {
        const f = sim.tableBy[c.unit.i];
        const rr = sim.furn?.rects ?? [];
        base = f >= 0 && rr[f] ? solid.tableTopFor(rr[f]) : solid.TABLE_TOP.stand;
      }
      const z = base + S.SENSE_BODY.catPts[0];
      const rays = cams.map((cam) => {
        if (!S.inView(cam, x, y, z)) return { kind: 'out' };
        if (S.SENSE_BODY.catPts.some((h) => S.camSees(scene, cam, x, y, base + h))) return { kind: 'seen' };
        return { kind: 'blocked', hit: hitAt(cam, x, y, z, -1) };
      });
      const n = rays.filter((r) => r.kind === 'seen').length;
      const cz = base + S.SENSE.tag.collar;
      const los = cams.map((a) => !S.segBlocked(scene, a.x, a.y, a.z, x, y, cz, -1, true));
      targets.push({ kind: 'cat', onTop: !!c.unit, unit: c.unit, x, y, n, sd: n >= 2 ? S.SENSE.camera.multi : n === 1 ? S.SENSE.camera.ground : 0, rays, tag: { x, y, z: cz, los } });
    }
    return { cams, furnBoxes, targets };
  };

  // ── 挑一刻：有人坐、有人站、台上台下都有猫，被挡的视线、只有一台看见、谁也看不见各来一点 ──
  let best = null;
  {
    const sim = makeSim();
    for (let t = 0; t < 600; t += dt) {
      sim.step(dt);
      const s = Math.round(sim.t);
      if (sim.t < 30 || Math.abs(sim.t - s) > dt / 2 || s % 3) continue;
      const { targets } = readMoment(sim);
      const ppl = targets.filter((x) => x.kind === 'person');
      const cats = targets.filter((x) => x.kind === 'cat');
      const seated = ppl.filter((x) => x.seated).length;
      const standing = ppl.filter((x) => !x.seated).length;
      const top = cats.filter((x) => x.onTop).length;
      if (!seated || standing < 2 || !top || top === cats.length) continue;
      const blocked = targets.reduce((a, x) => a + x.rays.filter((r) => r.kind === 'blocked').length, 0);
      const one = targets.filter((x) => x.n === 1).length;
      const zero = targets.filter((x) => x.n === 0).length;
      const nlos = ppl.filter((x) => !x.seated && x.tag.los.filter(Boolean).length <= 2).length;
      const deployed = sim.layout.units.filter((u) => sim.act.degree[u.i] >= 0.5).length;
      const score = Math.min(blocked, 6) + 3 * Math.min(one, 2) + 4 * Math.min(zero, 1) + Math.min(seated, 3) + 2 * Math.min(standing, 3) + 2 * Math.min(nlos, 1) + Math.min(deployed, 10) * 0.3;
      if (!best || score > best.score) best = { score, t: s };
    }
  }
  if (!best) throw new Error('没有找到合适的一刻');
  const sim = makeSim();
  while (sim.t < best.t - 1e-6) sim.step(dt);
  const L = sim.layout;
  const { cams, furnBoxes, targets } = readMoment(sim);
  const roomM = L.roomM;
  const half = roomM / 2;

  // ── 画 ──
  const PW = 430;
  const sc = PW / roomM;
  const GAP = 44;
  const TOP = 118;
  const MINI_H = 196;
  const W = 32 + 3 * PW + 2 * GAP + 32;
  const H = TOP + PW + 150 + MINI_H + 70;
  let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${PAPER}"/>`;
  g += `<defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="${FURN}"/><line x1="0" y1="0" x2="0" y2="5" stroke="#c9c1b2" stroke-width="1"/></pattern>`;
  for (let k = 0; k < 3; k++) g += `<clipPath id="room${k}"><rect x="${32 + k * (PW + GAP)}" y="${TOP}" width="${PW}" height="${PW}"/></clipPath>`;
  g += `</defs>`;
  g += `<text x="32" y="40" font-size="20" font-weight="600" ${FONT}>空间怎么知道人和猫在哪：两个方案的原理</text>`;
  g += `<text x="32" y="64" font-size="12" fill="#555" ${FONT}>2-15 那间房（${roomM.toFixed(2)} m 见方，8 × 8 台单元）· 标准场景 6 人 4 猫 · 种子 ${SEED} 第 ${best.t} s 的同一刻画三遍。深色方块 = 落下来的单元（更深 = 当桌子），斜线 = 家具，实心圆 = 坐着的人，空心圆 = 站着的人，橙色 = 猫（实心在台上、空心在地上）</text>`;
  g += `<text x="32" y="84" font-size="12" fill="#555" ${FONT}>误差档、遮挡、摄像头位置都取研究用的同一份模型（cohabit-sense.ts），数是建模假设，没在真实房间里量过</text>`;

  const panelX = (k) => 32 + k * (PW + GAP);
  const X = (k, x) => panelX(k) + (x + half) * sc;
  const Y = (y) => TOP + (y + half) * sc;
  const base = (k) => {
    let s = `<rect x="${panelX(k)}" y="${TOP}" width="${PW}" height="${PW}" fill="#fff" stroke="${INK}" stroke-width="1"/>`;
    // 家具
    for (const b of furnBoxes) {
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
        const lx = u * b.hx;
        const ly = v * b.hy;
        return `${X(k, b.cx + lx * b.c + ly * b.s).toFixed(1)},${Y(b.cy - lx * b.s + ly * b.c).toFixed(1)}`;
      });
      s += `<polygon points="${pts.join(' ')}" fill="url(#hatch)" stroke="#b8b0a2" stroke-width="0.6"/>`;
    }
    // 单元
    for (const u of L.units) {
      const d = sim.act.degree[u.i];
      if (d >= 0.5) {
        const hh = L.mastR + (L.platR - L.mastR) * Math.min(1, (d - 0.5) / 0.5);
        const table = sim.tableBy[u.i] >= 0;
        s += `<rect x="${(X(k, u.x - hh)).toFixed(1)}" y="${Y(u.y - hh).toFixed(1)}" width="${(2 * hh * sc).toFixed(1)}" height="${(2 * hh * sc).toFixed(1)}" fill="${table ? TABLE : UNIT}" fill-opacity="0.85" stroke="#a69c88" stroke-width="0.6"/>`;
      } else if (d > 0.02) s += `<circle cx="${X(k, u.x).toFixed(1)}" cy="${Y(u.y).toFixed(1)}" r="${(L.mastR * sc).toFixed(1)}" fill="${UNIT}" stroke="#a69c88" stroke-width="0.6"/>`;
      else s += `<circle cx="${X(k, u.x).toFixed(1)}" cy="${Y(u.y).toFixed(1)}" r="1.4" fill="#cfc8ba"/>`;
    }
    return s;
  };
  const bodies = (k, opts = {}) => {
    let s = '';
    for (const t of targets) {
      const cx = X(k, t.x);
      const cy = Y(t.y);
      if (t.kind === 'person') {
        const r = 0.2 * sc;
        s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${t.seated ? INK : '#fff'}" stroke="${INK}" stroke-width="1.2" ${opts.ghost ? 'opacity="0.35"' : ''}/>`;
        if (!opts.noGaze) s += `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + Math.cos(t.gaze) * 0.36 * sc).toFixed(1)}" y2="${(cy + Math.sin(t.gaze) * 0.36 * sc).toFixed(1)}" stroke="${t.seated ? '#fff' : INK}" stroke-width="1.4" ${opts.ghost ? 'opacity="0.35"' : ''}/>`;
      } else {
        const r = 0.12 * sc;
        s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${t.onTop ? CATC : '#fff'}" stroke="${CATC}" stroke-width="1.6" ${opts.ghost ? 'opacity="0.35"' : ''}/>`;
      }
    }
    return s;
  };
  const caption = (k, title, lines) => {
    let s = `<text x="${panelX(k)}" y="${TOP - 14}" font-size="14" font-weight="600" ${FONT}>${esc(title)}</text>`;
    const rows = lines.flatMap((ln) => wrap(ln, PW / 11.4));
    rows.forEach((ln, i) => (s += `<text x="${panelX(k)}" y="${TOP + PW + 22 + i * 15.5}" font-size="11.2" fill="#444" ${FONT}>${esc(ln)}</text>`));
    return s;
  };

  // ① 共用：座位压力 + 称重
  {
    const k = 0;
    g += base(k) + bodies(k);
    for (const s of sim.seats) {
      const on = sim.people.some((p) => p.seated && p.seat === s.i);
      const sz = 0.16 * sc;
      g += `<rect x="${(X(k, s.x) - sz / 2).toFixed(1)}" y="${(Y(s.y) - sz / 2).toFixed(1)}" width="${sz.toFixed(1)}" height="${sz.toFixed(1)}" fill="${on ? SEEN : 'none'}" fill-opacity="${on ? 0.25 : 0}" stroke="${on ? SEEN : '#9b9384'}" stroke-width="${on ? 1.6 : 0.8}" stroke-dasharray="${on ? '' : '2 2'}"/>`;
    }
    for (const t of targets) {
      if (t.kind !== 'cat' || !t.onTop) continue;
      const u = t.unit;
      const hh = L.platR;
      g += `<rect x="${X(k, u.x - hh).toFixed(1)}" y="${Y(u.y - hh).toFixed(1)}" width="${(2 * hh * sc).toFixed(1)}" height="${(2 * hh * sc).toFixed(1)}" fill="none" stroke="${SEEN}" stroke-width="2"/>`;
      const right = X(k, u.x) + hh * sc + 52 < panelX(k) + PW;
      g += `<text x="${(right ? X(k, u.x) + hh * sc + 3 : X(k, u.x) - hh * sc - 3).toFixed(1)}" y="${(Y(u.y) - hh * sc + 9).toFixed(1)}" font-size="9.5" text-anchor="${right ? 'start' : 'end'}" fill="${SEEN}" ${FONT}>称重：有猫</text>`;
    }
    const seated = targets.filter((t) => t.kind === 'person' && t.seated).length;
    g += caption(k, '① 两个方案都有：座位压力 + 单元称重', [
      `方框 = 20 个座位，绿框 = 坐垫下的压力片说有人坐（此刻 ${seated} 位）。`,
      '绿边单元 = 吊杆上的称重说台上有猫，看不见也知道。',
      '「坐下」是落桌子和引猫的开关，最不能错的就是它。',
    ]);
  }

  // ② 方案 A
  {
    const k = 1;
    g += base(k);
    g += `<g clip-path="url(#room${k})">`;
    for (const cam of cams) {
      const cx = X(k, cam.x);
      const cy = Y(cam.y);
      for (const sgn of [-1, 1]) g += `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx + Math.cos(cam.yaw + (sgn * cam.hfov) / 2) * 46).toFixed(1)}" y2="${(cy + Math.sin(cam.yaw + (sgn * cam.hfov) / 2) * 46).toFixed(1)}" stroke="${CAM}" stroke-width="1" stroke-dasharray="3 2"/>`;
    }
    for (const t of targets) {
      if (t.kind === 'person' && t.seated) continue; // 坐着的人位置交给座位压力，不画视线
      t.rays.forEach((r, ci) => {
        const cam = cams[ci];
        if (r.kind === 'seen') g += `<line x1="${X(k, cam.x).toFixed(1)}" y1="${Y(cam.y).toFixed(1)}" x2="${X(k, t.x).toFixed(1)}" y2="${Y(t.y).toFixed(1)}" stroke="${SEEN}" stroke-opacity="0.45" stroke-width="1"/>`;
        else if (r.kind === 'blocked') {
          g += `<line x1="${X(k, cam.x).toFixed(1)}" y1="${Y(cam.y).toFixed(1)}" x2="${X(k, r.hit.x).toFixed(1)}" y2="${Y(r.hit.y).toFixed(1)}" stroke="${CAM}" stroke-opacity="0.6" stroke-width="1" stroke-dasharray="4 3"/>`;
          const hx = X(k, r.hit.x);
          const hy = Y(r.hit.y);
          g += `<path d="M${(hx - 3).toFixed(1)},${(hy - 3).toFixed(1)} L${(hx + 3).toFixed(1)},${(hy + 3).toFixed(1)} M${(hx - 3).toFixed(1)},${(hy + 3).toFixed(1)} L${(hx + 3).toFixed(1)},${(hy - 3).toFixed(1)}" stroke="${CAM}" stroke-width="1.3"/>`;
        }
      });
    }
    g += `</g>`;
    g += bodies(k);
    for (const t of targets) {
      const cx = X(k, t.x);
      const cy = Y(t.y);
      const rr = t.kind === 'person' ? 0.2 * sc : 0.12 * sc;
      if (t.kind === 'person' && t.seated) {
        g += `<text x="${(cx + rr + 2).toFixed(1)}" y="${(cy - rr).toFixed(1)}" font-size="9" fill="${MUTE}" ${FONT}>座位</text>`;
        continue;
      }
      if (t.n === 0) {
        g += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(0.32 * sc).toFixed(1)}" fill="none" stroke="${CAM}" stroke-width="1" stroke-dasharray="3 2"/>`;
        g += `<text x="${(cx + 0.32 * sc + 2).toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-size="12" font-weight="600" fill="${CAM}" ${FONT}>?</text>`;
      } else {
        g += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(rr + 3, t.sd * sc * 2).toFixed(1)}" fill="none" stroke="${SEEN}" stroke-width="1.1"/>`;
        g += `<text x="${(cx + rr + 4).toFixed(1)}" y="${(cy - rr - 1).toFixed(1)}" font-size="9.5" fill="${SEEN}" ${FONT}>${t.n}</text>`;
      }
    }
    for (const cam of cams) g += `<circle cx="${X(k, cam.x).toFixed(1)}" cy="${Y(cam.y).toFixed(1)}" r="6" fill="${CAM}"/>`;
    const ppl = targets.filter((t) => t.kind === 'person' && !t.seated);
    const cats = targets.filter((t) => t.kind === 'cat');
    g += caption(k, '② 方案 A：四个上角的摄像头', [
      '红点 = 摄像头（3.4 m 高，对着房间中心）。绿线 = 这台看得见它，红虚线 = 被单元、家具或人挡住，× 在挡住的地方。',
      '圈里的数 = 几台看见：两台以上三角定位（圈小），一台就落到它站的面上（地面、座面、台面），一台也没有 = 问号。',
      `此刻站着的 ${ppl.length} 人里 ${ppl.filter((t) => t.n >= 2).length} 人被两台以上看见，${cats.length} 只猫里 ${cats.filter((t) => t.n >= 1).length} 只至少一台看见。坐着的人位置交给座位压力。`,
    ]);
  }

  // ③ 方案 B（原理）
  {
    const k = 2;
    g += base(k) + bodies(k, { noGaze: true });
    const anchors = cams;
    // 挑两个讲原理：一个四个固定点都直视的站着的人，一个被自己 / 别人身体挡住一两个的
    const standing = targets.filter((t) => t.kind === 'person' && !t.seated);
    const clear = standing.find((t) => t.tag.los.every(Boolean)) ?? standing[0];
    const shaded = standing.find((t) => t !== clear && t.tag.los.some((v) => !v)) ?? targets.find((t) => t !== clear && !(t.kind === 'person' && t.seated) && t.tag.los.some((v) => !v));
    g += `<g clip-path="url(#room${k})">`;
    for (const t of [clear, shaded].filter(Boolean)) {
      anchors.forEach((a, ai) => {
        const d3 = Math.hypot(t.tag.x - a.x, t.tag.y - a.y, t.tag.z - a.z);
        const nl = !t.tag.los[ai];
        const meas = d3 + (nl ? 0.35 : 0);
        const rH = Math.sqrt(Math.max(0, meas * meas - (t.tag.z - a.z) ** 2));
        g += `<circle cx="${X(k, a.x).toFixed(1)}" cy="${Y(a.y).toFixed(1)}" r="${(rH * sc).toFixed(1)}" fill="none" stroke="${nl ? CAM : SEEN}" stroke-opacity="${nl ? 0.75 : 0.5}" stroke-width="1" ${nl ? 'stroke-dasharray="5 3"' : ''}/>`;
      });
    }
    g += `</g>`;
    for (const t of targets) {
      const cx = X(k, t.x);
      const cy = Y(t.y);
      const los = t.tag.los.filter(Boolean).length;
      const sd = t.kind === 'person' && t.seated ? 0 : los >= 3 ? S.SENSE.tag.los3 : los === 2 ? S.SENSE.tag.los2 : S.SENSE.tag.los1;
      if (sd > 0) g += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(sd * sc * 2).toFixed(1)}" fill="${SEEN}" fill-opacity="0.08" stroke="${SEEN}" stroke-width="1"/>`;
      if (t.kind === 'person') {
        const ex = cx + Math.cos(t.heading) * 0.42 * sc;
        const ey = cy + Math.sin(t.heading) * 0.42 * sc;
        const a = t.heading;
        g += `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${t.seated ? '#fff' : INK}" stroke-width="1.6"/>`;
        g += `<path d="M${ex.toFixed(1)},${ey.toFixed(1)} L${(ex - Math.cos(a - 0.5) * 6).toFixed(1)},${(ey - Math.sin(a - 0.5) * 6).toFixed(1)} L${(ex - Math.cos(a + 0.5) * 6).toFixed(1)},${(ey - Math.sin(a + 0.5) * 6).toFixed(1)} Z" fill="${t.seated ? '#fff' : INK}"/>`;
      }
    }
    for (const t of [clear, shaded].filter(Boolean)) g += `<circle cx="${X(k, t.x).toFixed(1)}" cy="${Y(t.y).toFixed(1)}" r="${(0.2 * sc + 5).toFixed(1)}" fill="none" stroke="${INK}" stroke-width="0.8" stroke-dasharray="2 2"/>`;
    for (const a of anchors) g += `<rect x="${(X(k, a.x) - 5).toFixed(1)}" y="${(Y(a.y) - 5).toFixed(1)}" width="10" height="10" fill="${INK}" transform="rotate(45 ${X(k, a.x).toFixed(1)} ${Y(a.y).toFixed(1)})"/>`;
    const nl = shaded ? shaded.tag.los.filter((v) => !v).length : 0;
    g += caption(k, '③ 方案 B（原理）：量到几个固定点的距离', [
      '菱形 = 装在四个上角的固定点。人和猫身上带一个小标签，标签量出到每个固定点有多远。',
      `以固定点为心、量到的距离为半径画圆，几个圆交在一点就是位置（虚线圈出的两个画了这些圆）。其中一个有 ${nl} 段被人的身体挡住、量长了（红虚线），交点散开，圈就大。`,
      '小箭头 = 标签读到的身体朝向。它说的是身体朝哪，不是头朝哪。',
    ]);
  }

  // ── 六张小图：空间每一步读什么 ──
  const MW = (W - 64 - 5 * 18) / 6;
  const my = TOP + PW + 150;
  g += `<text x="32" y="${my - 18}" font-size="14" font-weight="600" ${FONT}>空间每一步读的东西</text>`;
  const mini = (i, title, cap, draw) => {
    const x0 = 32 + i * (MW + 18);
    let s = `<rect x="${x0}" y="${my}" width="${MW}" height="${MINI_H - 58}" fill="#fff" stroke="#cfc8ba"/>`;
    s += draw(x0, my, MW, MINI_H - 58);
    s += `<text x="${x0}" y="${my + MINI_H - 40}" font-size="11.5" font-weight="600" ${FONT}>${esc(title)}</text>`;
    cap.forEach((ln, j) => (s += `<text x="${x0}" y="${my + MINI_H - 24 + j * 14}" font-size="10" fill="#555" ${FONT}>${esc(ln)}</text>`));
    return s;
  };
  const arrow = (x1, y1, x2, y2, col = INK, w = 1.4) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}"/><path d="M${x2},${y2} L${(x2 - Math.cos(a - 0.45) * 7).toFixed(1)},${(y2 - Math.sin(a - 0.45) * 7).toFixed(1)} L${(x2 - Math.cos(a + 0.45) * 7).toFixed(1)},${(y2 - Math.sin(a + 0.45) * 7).toFixed(1)} Z" fill="${col}"/>`;
  };
  const sq = (cx, cy, h, fill = UNIT, stroke = '#a69c88', dash = '') => `<rect x="${cx - h}" y="${cy - h}" width="${2 * h}" height="${2 * h}" fill="${fill}" stroke="${stroke}" stroke-width="1" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
  g += mini(0, '坐下 → 座位压力', ['谁坐在哪个座位，不会错。', '触发：落桌子、引猫、不盖头顶。'], (x, y, w, h) => {
    const cx = x + w / 2;
    const cy = y + h / 2 + 6;
    return `<rect x="${cx - 46}" y="${cy - 26}" width="92" height="52" fill="url(#hatch)" stroke="#b8b0a2"/><rect x="${cx - 46}" y="${cy - 26}" width="92" height="12" fill="#d8d0c0"/>` +
      `<rect x="${cx - 16}" y="${cy - 8}" width="32" height="26" fill="${SEEN}" fill-opacity="0.25" stroke="${SEEN}" stroke-width="1.6"/>` +
      `<circle cx="${cx}" cy="${cy + 4}" r="12" fill="${INK}"/>`;
  });
  g += mini(1, '猫在台上 → 单元称重', ['哪台上有猫；台下、两层台有顶的', '那半边看不见也知道。'], (x, y, w, h) => {
    const cx = x + w / 2;
    const cy = y + h / 2 + 14;
    return `<line x1="${cx}" y1="${y + 8}" x2="${cx}" y2="${cy - 14}" stroke="#777" stroke-width="2"/>` +
      `<rect x="${cx - 9}" y="${y + 20}" width="18" height="14" fill="#fff" stroke="${SEEN}" stroke-width="1.6"/><text x="${cx}" y="${y + 31}" font-size="8.5" text-anchor="middle" fill="${SEEN}" ${FONT}>kg</text>` +
      `<rect x="${cx - 52}" y="${cy - 14}" width="104" height="9" fill="${UNIT}" stroke="#a69c88"/>` +
      `<ellipse cx="${cx + 18}" cy="${cy - 22}" rx="13" ry="8" fill="${CATC}"/>` + arrow(cx + 40, y + 22, cx + 40, cy - 16, SEEN, 1.2);
  });
  g += mini(2, '位置与朝向', ['A：摄像头看见；B：量到固定点的距离。', '两者都给一个带误差的圈。'], (x, y, w, h) => {
    const cx = x + w / 2;
    const cy = y + h / 2;
    return `<circle cx="${cx}" cy="${cy}" r="30" fill="${SEEN}" fill-opacity="0.08" stroke="${SEEN}"/><circle cx="${cx}" cy="${cy}" r="12" fill="#fff" stroke="${INK}" stroke-width="1.4"/>` + arrow(cx, cy, cx + 30, cy - 14);
  });
  g += mini(3, '猫在一台正下方停住 1 s → 落下', ['代替「猫想跳上哪台」。', '误报：停在那儿歇着的猫也算。'], (x, y, w, h) => {
    const cx = x + w / 2;
    const cy = y + h / 2 + 6;
    const r = 15;
    return sq(cx, cy, 34, 'none', '#a69c88', '4 3') + `<circle cx="${cx}" cy="${cy}" r="3" fill="#a69c88"/>` +
      `<ellipse cx="${cx + 4}" cy="${cy + 2}" rx="11" ry="7" fill="#fff" stroke="${CATC}" stroke-width="1.6"/>` +
      `<circle cx="${cx + 44}" cy="${cy - 30}" r="${r}" fill="none" stroke="#ddd" stroke-width="3"/><path d="M${cx + 44},${cy - 30 - r} A${r},${r} 0 1 1 ${cx + 44 - r * Math.sin(1.1)},${cy - 30 - r * Math.cos(1.1)}" fill="none" stroke="${SEEN}" stroke-width="3"/><text x="${cx + 44}" y="${cy - 26}" font-size="9" text-anchor="middle" fill="${SEEN}" ${FONT}>1 s</text>`;
  });
  g += mini(4, '人刚停在一条没开的带前 → 让开', ['代替「人还没走的路线」；走着时', '沿速度往前看一段，路上的带先让开。'], (x, y, w, h) => {
    const cx = x + w / 2 - 14;
    const cy = y + h / 2;
    let s = sq(cx, cy, 30);
    for (let j = 0; j < 20; j++) {
      const a = (j / 20) * Math.PI * 2;
      const open = Math.abs(((a + Math.PI) % (2 * Math.PI)) - Math.PI) < 0.45;
      const R = 30 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      const r2 = open ? 8 : R;
      s += `<line x1="${cx + Math.cos(a) * 5}" y1="${cy + Math.sin(a) * 5}" x2="${(cx + Math.cos(a) * r2).toFixed(1)}" y2="${(cy + Math.sin(a) * r2).toFixed(1)}" stroke="${open ? SEEN : '#9b9384'}" stroke-width="${open ? 2 : 1}"/>`;
    }
    s += `<circle cx="${cx + 54}" cy="${cy}" r="10" fill="#fff" stroke="${INK}" stroke-width="1.4"/>` + arrow(cx + 44, cy, cx + 34, cy);
    return s;
  });
  g += mini(5, '猫刚从人身边走开 → 30 s 不引它', ['代替「猫的潜伏期」。', '看见的是：它离人近，又走远了。'], (x, y, w, h) => {
    const cx = x + w / 2 - 20;
    const cy = y + h / 2 + 4;
    return `<circle cx="${cx - 26}" cy="${cy}" r="11" fill="#fff" stroke="${INK}" stroke-width="1.4"/>` +
      `<ellipse cx="${cx - 2}" cy="${cy}" rx="9" ry="6" fill="#fff" stroke="${CATC}" stroke-dasharray="2 2"/>` + arrow(cx + 8, cy, cx + 38, cy, CATC) +
      `<ellipse cx="${cx + 48}" cy="${cy}" rx="10" ry="6.5" fill="${CATC}"/>` +
      `<circle cx="${cx + 70}" cy="${cy - 30}" r="13" fill="none" stroke="#999"/><line x1="${cx + 70}" y1="${cy - 30}" x2="${cx + 70}" y2="${cy - 39}" stroke="#999"/><line x1="${cx + 70}" y1="${cy - 30}" x2="${cx + 77}" y2="${cy - 30}" stroke="#999"/><text x="${cx + 70}" y="${cy - 8}" font-size="9" text-anchor="middle" fill="#777" ${FONT}>30 s</text>`;
  });
  g += `<text x="32" y="${H - 22}" font-size="11" fill="#666" ${FONT}>读不到、也不换的：台上的猫想去哪台。空间不再为它先落下，猫只能走已经落着的台（研究里猫走到座位前方那台的次数因此少了约四分之一）。</text>`;
  g += `</svg>`;
  writeFileSync(join(OUT, 'explain-a-b.svg'), g);
  console.log(`种子 ${SEED} · 第 ${best.t} s · ${targets.length} 个目标`);
  for (const t of targets) console.log(`  ${t.kind}${t.kind === 'person' ? (t.seated ? ' 坐' : ' 站') : t.onTop ? ' 台上' : ' 地上'} · 摄像头 ${t.n} 台 · 固定点直视 ${t.tag.los.filter(Boolean).length}`);
  try {
    const require = createRequire(import.meta.url);
    const { chromium } = require('playwright');
    const b = await chromium.launch();
    const p = await b.newPage({ deviceScaleFactor: 2 });
    await p.setViewportSize({ width: W, height: H });
    await p.setContent(`<html><body style="margin:0">${g}</body></html>`);
    await p.screenshot({ path: join(OUT, 'explain-a-b.png'), clip: { x: 0, y: 0, width: W, height: H } });
    await b.close();
    console.log(`PNG → ${OUT}`);
  } catch (e) {
    console.log('（没有 playwright，只出 SVG）', e.message);
  }
} finally {
  await server.close();
}
