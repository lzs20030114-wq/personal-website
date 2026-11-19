/**
 * 规则读数原型（2026-11-19，项目二_规则可视化方案.md）：不是站上页面。
 * 跑的是 2-15 同一份平面仿真（6 人 4 猫、20 座、会动的单元、引导开），画面用站上 Lab 2-14 同一份画法（planDraw），
 * 在它上面加两样：单元旁的编号 + 连到起因的细线，旁边一块「感知 → 理解 → 干预」读数。
 * 理由全部来自 src/lib/space/cohabit-reasons.ts（核对脚本 io-audit 用的同一份）。
 * 打包：node scripts/rules-viz/build.mjs <out.html>
 */
import { COHABIT, CohabitSim, PACE_DEMO, partySizes, scatterCats, tableClass, type Cat, type Visitor } from '../../src/lib/space/cohabit';
import type { CatPose } from '../../src/lib/space/cat-rules';
import { ruleReadout, unitReasons, type RuleHit, type RuleRow } from '../../src/lib/space/cohabit-reasons';
import { H, W, drawPlan, frame, readPalette, type Palette, type PlanPerson } from '../../components/lab/planDraw';

// ── 行：文档第 4、5、7 节（措辞取自 项目二_输入到输出的规则.md） ─────────────────────────────

interface RowDef {
  row: RuleRow;
  mark: string;
  part: 4 | 5 | 7;
  see: string;
  mean: string;
  act: string;
}

const ROWS: RowDef[] = [
  { row: 'pass', mark: '①', part: 4, see: '人在走，经过猫或单元旁边', mean: '路过，不算一次相遇', act: '不落台，只把挡路的几条带收开' },
  { row: 'stand', mark: '②', part: 4, see: '人站住，看着台上的一只猫满 3 秒', mean: '对这只猫有兴趣，想看近一点', act: '猫旁边离人更近的一台落下，只给一次' },
  { row: 'seatFar', mark: '③', part: 4, see: '人坐下了，能来的猫还在远处', mean: '要待一阵，愿意和猫相处，猫还远', act: '只落猫的下一步，一步一步引到人面前那台' },
  { row: 'met', mark: '④', part: 4, see: '人坐着，猫已经在他面前那台', mean: '相遇成了，两边都待得住', act: '不再落新台，这台留着' },
  { row: 'catMove', mark: '⑤', part: 4, see: '猫要换地方', mean: '猫自己要走，不分躲还是靠近', act: '它要去的那台约 0.7 秒落满' },
  { row: 'table', mark: '桌', part: 5, see: '人坐到座位上', mean: '要一张桌子', act: '面前那台落到桌子高度' },
  { row: 'foot', mark: '脚', part: 5, see: '猫在一台上', mean: '这台有猫用着', act: '一直落着，猫走开才收' },
  { row: 'overHead', mark: '×', part: 5, see: '要落的台会伸到坐着的人头顶', mean: '会压到人', act: '不落，落着的收回' },
  { row: 'press', mark: '×', part: 5, see: '猫要去的台，台角会顶到站着的人', mean: '会碰到人', act: '先不落，猫等' },
  { row: 'r5', mark: '×', part: 5, see: '一台落成墙，会让人没路到门', mean: '会把人困住', act: '停在墙线以下' },
  { row: 'gapApproachOther', mark: '?', part: 7, see: '被引的猫正在靠近别的人', mean: '单元读不出', act: '照样往坐着的人面前引' },
  { row: 'gapWatchedOther', mark: '?', part: 7, see: '被引的猫正被别的人看着，不会挪', mean: '单元读不出', act: '照样递台' },
];
const ROW_OF = new Map(ROWS.map((r) => [r.row, r]));
const PART_TITLE: Record<number, string> = {
  4: '第 4 节 · 单元看到的人猫关系',
  5: '第 5 节 · 不看关系也要做的',
  7: '第 7 节 · 单元读不出、照样在做的',
};

// ── 仿真 ──────────────────────────────────────────────────────────────────────────

function newSim(seed: number): CohabitSim {
  const sim = new CohabitSim({
    trigger: 'posture',
    grid: COHABIT.SEATS.GRID,
    unit: 'square',
    cover: 'room',
    space: 'live',
    seed,
    opening: false,
    auto: true,
    faces: true,
    social: true,
    catFloor: true,
    cat: { ...COHABIT.CAT_MT, ...COHABIT.CAT_LEVELS.mid },
    guide: COHABIT.GUIDE,
    pace: PACE_DEMO,
  });
  const half = sim.layout.fieldM / 2;
  partySizes(6).forEach((sz, i, a) => {
    const ang = (i / a.length) * 2 * Math.PI + 0.3;
    sim.addParty(Math.cos(ang) * half * 0.6, Math.sin(ang) * half * 0.6, sz);
  });
  scatterCats(sim, 4, seed);
  return sim;
}

function poseOf(c: Cat): CatPose {
  if (c.mode === 'held') return 'stand';
  if (c.walker.state === 'walk') return 'walk';
  if (c.state === 'lie') return 'lie';
  if (c.state === 'approach') return 'crouch';
  return 'sit';
}

function postureOf(p: Visitor): 'walk' | 'stand' | 'sit' {
  if (p.seated) return 'sit';
  return p.walker.state === 'walk' && p.moving ? 'walk' : 'stand';
}

/** 与 Lab 2-14 的 sceneOf 同一种组装（原型只取「走 · 站 · 坐」· 会动这一档） */
function sceneOf(sim: CohabitSim) {
  const people: PlanPerson[] = sim.people.map((p) => ({
    ...sim.drawPos(p),
    heading: p.walker.heading,
    gaze: p.walker.gaze,
    reach: 0,
    held: false,
    fov: sim.fov,
    keepOut: p.seated ? 0 : sim.marginM,
    lane: false,
    posture: postureOf(p),
    party: p.party,
  }));
  for (const c of sim.cats)
    people.push({ kind: 'cat', pose: poseOf(c), motionTime: c.phaseTime, bodyR: COHABIT.CAT.bodyR, x: c.walker.x, y: c.walker.y, heading: c.walker.heading, gaze: c.walker.gaze, reach: 0, held: false, onFloor: !c.unit });
  return {
    layout: sim.layout,
    field: sim.field,
    catchment: sim.catchment,
    act: sim.act,
    people,
    showTrace: false,
    blocked: null,
    bands: { open: sim.bandOpen, hold: sim.bandHold, count: COHABIT.FACES.BANDS },
    supportIds: sim.cats.flatMap((c) => sim.supportOf(c).map((u) => u.i)),
    landingId: sim.cats.find((c) => c.pending)?.pending?.i ?? null,
    walls: sim.wall,
    heldR5: sim.heldR5,
    links: sim.links,
    hideUnits: false,
    furniture: sim.furn
      ? { rects: sim.furn.rects, seats: sim.seats.map((q) => ({ x: q.x, y: q.y, meet: sim.guideTarget(q, 'meet'), taken: sim.people.some((v) => v.seat === q.i) })), selected: -1 }
      : null,
    tables: sim.furn
      ? Array.from(sim.tableBy, (f, unit) => (f >= 0 ? { unit, top: tableClass(sim.furn!.rects[f].kind) === 'dining' ? 0.74 : 0.42 } : null)).filter((x): x is { unit: number; top: number } => x !== null)
      : undefined,
    guides: sim.guides.map((g) => {
      const cat = sim.cats.find((c) => c.id === g.cat);
      const pts = g.path.map((i) => ({ x: sim.layout.units[i].x, y: sim.layout.units[i].y }));
      if (cat) pts[0] = { x: cat.walker.x, y: cat.walker.y };
      return { kind: g.kind, pts };
    }),
  };
}

// ── 页面 ──────────────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const canvas = $<HTMLCanvasElement>('#plan');
const wrap = $<HTMLDivElement>('#planWrap');
const rowsEl = $<HTMLDivElement>('#rows');
const detailEl = $<HTMLDivElement>('#detail');
const clockEl = $<HTMLSpanElement>('#clock');
const playBtn = $<HTMLButtonElement>('#play');

const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = Math.round(W * dpr);
canvas.height = Math.round(H * dpr);
const ctx = canvas.getContext('2d')!;
ctx.scale(dpr, dpr);
let pal: Palette = readPalette(wrap);

let seed = 11;
let sim = newSim(seed);
let speed = 4;
let running = true;
let hover: RuleRow | null = null;
let picked: number | null = null;
let hits: RuleHit[] = [];
const totals = new Map<RuleRow, number>();
let liveKeys = new Set<string>();

const personLabel = new Map<number, string>();
const catLabel = new Map<number, string>();
function relabel() {
  personLabel.clear();
  catLabel.clear();
  sim.people.forEach((p, i) => personLabel.set(p.id, `访客 ${i + 1}`));
  sim.cats.forEach((c, i) => catLabel.set(c.id, `猫 ${String.fromCharCode(65 + i)}`));
}
relabel();

function who(h: RuleHit): string {
  const ps = h.people.map((id) => personLabel.get(id) ?? `访客 ?`);
  const cs = h.cats.map((id) => catLabel.get(id) ?? `猫 ?`);
  // 单元编号画面上看不到，所以只写人、猫和台数，要看是哪一台就点画面
  if (h.row === 'pass') return `${ps[0]} · 收开 ${h.bands?.length ?? 0} 条带（${h.units.length} 台）`;
  if (h.row === 'seatFar') {
    const g = sim.guides.find((q) => q.kind === 'sit' && q.person === h.people[0]);
    const c = sim.cats.find((q) => q.id === h.cats[0]);
    const left = g ? g.path.length - (c && c.unit ? 1 : 0) : 0;
    return `${ps[0]} 引${cs[0]} · 还差 ${left} 台`;
  }
  if (h.row === 'stand') return `${ps[0]} 看着${cs[0]}`;
  if (h.row === 'gapApproachOther') return `${cs[0]} 被${ps[0]}引着，正走向${ps[1]}`;
  if (h.row === 'gapWatchedOther') return `${cs[0]} 被${ps[0]}引着，${ps[1]}正看着它`;
  const named = [ps.join('、'), cs.join('、')].filter(Boolean).join(' · ');
  return named || `${h.units.length} 台`;
}

// 读数面板：一次建好，之后只改类与文字
const rowEls = new Map<RuleRow, { el: HTMLElement; now: HTMLElement; total: HTMLElement; list: HTMLElement }>();
function buildRows() {
  let part = 0;
  for (const r of ROWS) {
    if (r.part !== part) {
      part = r.part;
      const h = document.createElement('div');
      h.className = 'part';
      h.textContent = PART_TITLE[part];
      rowsEl.appendChild(h);
    }
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `row part${r.part}`;
    el.dataset.row = r.row;
    el.innerHTML = `
      <span class="mark">${r.mark}</span>
      <span class="cell see"><i>感知</i>${r.see}</span>
      <span class="cell mean"><i>理解</i>${r.mean}</span>
      <span class="cell act"><i>干预</i>${r.act}</span>
      <span class="count"><b class="now">0</b><small class="total">累计 0</small></span>
      <span class="list"></span>`;
    el.addEventListener('mouseenter', () => (hover = r.row));
    el.addEventListener('mouseleave', () => (hover = null));
    el.addEventListener('focus', () => (hover = r.row));
    el.addEventListener('blur', () => (hover = null));
    el.addEventListener('click', () => (hover = hover === r.row ? null : r.row));
    rowsEl.appendChild(el);
    rowEls.set(r.row, { el, now: el.querySelector('.now')!, total: el.querySelector('.total')!, list: el.querySelector('.list')! });
  }
}
buildRows();

function keyOf(h: RuleHit): string {
  return `${h.row}|${h.people.join(',')}|${h.cats.join(',')}|${h.row === 'seatFar' || h.row === 'pass' ? '' : h.units.join(',')}`;
}

function updatePanel() {
  const keys = new Set<string>();
  const byRow = new Map<RuleRow, RuleHit[]>();
  for (const h of hits) {
    const k = keyOf(h);
    keys.add(k);
    if (!liveKeys.has(k)) totals.set(h.row, (totals.get(h.row) ?? 0) + 1);
    if (!byRow.has(h.row)) byRow.set(h.row, []);
    byRow.get(h.row)!.push(h);
  }
  liveKeys = keys;
  for (const r of ROWS) {
    const e = rowEls.get(r.row)!;
    const list = byRow.get(r.row) ?? [];
    e.el.classList.toggle('on', list.length > 0);
    e.el.classList.toggle('hover', hover === r.row);
    e.now.textContent = String(list.length);
    e.total.textContent = `累计 ${totals.get(r.row) ?? 0}`;
    const shown = r.row === 'foot' ? [] : list.slice(0, 3);
    e.list.textContent = shown.map(who).join('　/　') + (list.length > shown.length && shown.length ? `　…另 ${list.length - shown.length} 条` : '');
  }
  const t = Math.floor(sim.t);
  clockEl.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  if (picked !== null) detailEl.textContent = unitDetail(picked);
}

function unitDetail(u: number): string {
  const why = unitReasons(sim)[u];
  const name: Record<string, string> = { table: '桌子', step: '引猫：路上的一步', meet: '引猫：人面前那台', offer: '站着给一步', foot: '猫脚下', go: '猫要去的台', climb: '猫要跳上的台' };
  const deg = sim.act.degree[u];
  const state = deg >= 1 - 1e-9 ? '落满' : deg > 1e-6 ? `落到 ${Math.round(deg * 100)}%` : '收着';
  const blocks = hits.filter((h) => (h.row === 'overHead' || h.row === 'press' || h.row === 'r5') && h.units.includes(u)).map((h) => ROW_OF.get(h.row)!.see);
  const reasons = why.map((r) => `${name[r.kind]}${r.person !== undefined ? `（${personLabel.get(r.person)}）` : ''}${r.cat !== undefined ? `（${catLabel.get(r.cat)}）` : ''}`);
  return `第 ${u + 1} 台 · ${state} · ${reasons.length ? `理由：${reasons.join('，')}` : '没有落下的理由'}${blocks.length ? ` · 被拦：${blocks.join('，')}` : ''}`;
}

// 画布上的标注：单元旁的编号 + 细线连到起因（人或猫）；悬停一行时只亮那一行
function drawOverlay() {
  const L = sim.layout;
  const { sc, ox, oy } = frame(L.roomM);
  const X = (x: number) => ox + x * sc;
  const Y = (y: number) => oy + y * sc;
  const posOf = new Map<number, { x: number; y: number }>();
  for (const p of sim.people) posOf.set(p.id, sim.drawPos(p));
  const catPos = new Map<number, { x: number; y: number }>();
  for (const c of sim.cats) catPos.set(c.id, { x: c.walker.x, y: c.walker.y });
  const r = L.platR * sc;
  ctx.save();
  ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const drawn = new Set<string>();
  for (const h of hits) {
    const def = ROW_OF.get(h.row)!;
    if (h.row === 'foot' || def.part === 7) continue;
    const dim = hover !== null && hover !== h.row;
    const hot = hover === h.row;
    ctx.globalAlpha = dim ? 0.12 : 1;
    const check = def.part === 5 && h.row !== 'table';
    const ink = check ? pal.warn : hot ? pal.accent2 : pal.ink;
    const from = h.row === 'catMove' ? catPos.get(h.cats[0]) : h.people.length ? posOf.get(h.people[0]) : undefined;
    const targets = h.row === 'seatFar' ? [h.units[0]] : h.units;
    for (const u of targets) {
      const U = L.units[u];
      const bx = X(U.x) - r * 0.62;
      const by = Y(U.y) - r * 0.62;
      if (from && !check) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = hot ? 1.4 : 0.9;
        ctx.setLineDash(h.row === 'pass' ? [2, 3] : []);
        ctx.beginPath();
        ctx.moveTo(X(from.x), Y(from.y));
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const k = `${u}|${def.mark}`;
      if (drawn.has(k)) continue;
      drawn.add(k);
      ctx.fillStyle = pal.paper;
      ctx.beginPath();
      ctx.arc(bx, by, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.fillText(def.mark, bx, by + 0.5);
    }
  }
  // 悬停一行：把牵涉的人和猫圈出来
  if (hover) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal.accent2;
    ctx.lineWidth = 2;
    for (const h of hits) {
      if (h.row !== hover) continue;
      for (const id of h.people) {
        const p = posOf.get(id);
        if (p) {
          ctx.beginPath();
          ctx.arc(X(p.x), Y(p.y), 13, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      for (const id of h.cats) {
        const p = catPos.get(id);
        if (p) {
          ctx.beginPath();
          ctx.arc(X(p.x), Y(p.y), 11, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }
  // 人和猫的名字（读数面板里用的就是这些名字）
  ctx.globalAlpha = 0.85;
  ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = pal.ink;
  for (const p of sim.people) {
    const q = posOf.get(p.id)!;
    ctx.fillText(String(personLabel.get(p.id)!.replace('访客 ', '')), X(q.x) + 12, Y(q.y) - 12);
  }
  ctx.fillStyle = pal.accent2;
  for (const c of sim.cats) ctx.fillText(catLabel.get(c.id)!.replace('猫 ', ''), X(c.walker.x) + 11, Y(c.walker.y) - 11);
  // 点选的那台
  if (picked !== null) {
    const U = L.units[picked];
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal.accent2;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(X(U.x), Y(U.y), r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function paint() {
  drawPlan(ctx, sceneOf(sim) as Parameters<typeof drawPlan>[1], pal);
  drawOverlay();
}

let last = performance.now();
let acc = 0;
let panelAt = 0;
const DT = 1 / 30;
function frameLoop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running) {
    acc += dt * speed;
    let n = 0;
    while (acc >= DT && n < 40) {
      sim.step(DT);
      acc -= DT;
      n++;
    }
    if (n) hits = ruleReadout(sim);
  }
  paint();
  if (now - panelAt > 120) {
    updatePanel();
    panelAt = now;
  }
  requestAnimationFrame(frameLoop);
}

// 控件
playBtn.addEventListener('click', () => {
  running = !running;
  playBtn.textContent = running ? '暂停' : '运转';
  playBtn.setAttribute('aria-pressed', String(!running));
});
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) =>
  b.addEventListener('click', () => {
    speed = Number(b.dataset.speed);
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  }),
);
$<HTMLButtonElement>('#restart').addEventListener('click', () => {
  seed += 1;
  sim = newSim(seed);
  relabel();
  totals.clear();
  liveKeys = new Set();
  hits = [];
  picked = null;
  detailEl.textContent = '点画面里任何一台单元，这里写出它此刻为什么落、被什么拦着。';
});
canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const cx = ((ev.clientX - rect.left) / rect.width) * W;
  const cy = ((ev.clientY - rect.top) / rect.height) * H;
  const { sc, ox, oy } = frame(sim.layout.roomM);
  const x = (cx - ox) / sc;
  const y = (cy - oy) / sc;
  let best = -1;
  let bd = Infinity;
  for (const u of sim.layout.units) {
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bd) {
      bd = d;
      best = u.i;
    }
  }
  picked = bd < sim.layout.platR * 1.2 ? best : null;
  detailEl.textContent = picked === null ? '点画面里任何一台单元，这里写出它此刻为什么落、被什么拦着。' : unitDetail(picked);
});
window.addEventListener('resize', () => (pal = readPalette(wrap)));

// 开场先跑 90 秒仿真时间，让人坐下、猫开始被引，第一眼就有东西可看
for (let k = 0; k < 90 * 30; k++) sim.step(DT);
hits = ruleReadout(sim);
updatePanel();
requestAnimationFrame(frameLoop);
