/**
 * 规则读数原型（2026-11-19，项目二_规则可视化方案.md）：不是站上页面。
 * 跑的是 2-15 同一份平面仿真（6 人 4 猫、20 座、会动的单元、引导开），画面用站上 Lab 2-14 同一份画法（planDraw），
 * 在它上面加两样：单元旁的编号 + 连到起因的细线，旁边一块「感知 → 理解 → 干预」读数。
 * 理由全部来自 src/lib/space/cohabit-reasons.ts（核对脚本 io-audit 用的同一份）。
 * 同日第二版：版式照规则表（scripts/rules-table）那套；读数每行加最近 90 s 的走势条，画面上方加四个总数，
 * 点单元的说明改成卡片。
 * 打包：node scripts/rules-viz/build.mjs <out.html>
 */
import { COHABIT, CohabitSim, PACE_DEMO, partySizes, scatterCats, tableClass, type Cat, type Visitor } from '../../src/lib/space/cohabit';
import type { CatPose } from '../../src/lib/space/cat-rules';
import { ruleReadout, unitReasons, type RuleHit, type RuleRow } from '../../src/lib/space/cohabit-reasons';
import { H, W, drawPlan, frame, readPalette, type Palette, type PlanPerson } from '../../components/lab/planDraw';

// ── 行：规则文档第 4、5、7 节（措辞取自 项目二_输入到输出的规则.md） ─────────────────────────────

/** rel = 第 4 节的人猫关系 · base = 第 5 节桌子与猫脚下 · check = 第 5 节三道检查 · gap = 第 7 节读不到的关系 */
type Kind = 'rel' | 'base' | 'check' | 'gap';

interface RowDef {
  row: RuleRow;
  mark: string;
  part: 4 | 5 | 7;
  kind: Kind;
  /** 理解一栏的判定（第 7 节是那条读不到的关系本身） */
  verdict: string;
  see: string;
  act: string;
}

const ROWS: RowDef[] = [
  { row: 'pass', mark: '①', part: 4, kind: 'rel', verdict: '路过', see: '人在行走，路线经过单元', act: '不落台，收开挡路的带' },
  { row: 'stand', mark: '②', part: 4, kind: 'rel', verdict: '站立注视', see: '人站着注视台上一只静止的猫，满 3 s', act: '猫相邻、离人更近的一台落下，每次站定一次' },
  { row: 'seatFar', mark: '③', part: 4, kind: 'rel', verdict: '落座，猫未到座位前方那台', see: '人坐着，可引导的猫不在座位前方那台', act: '只落猫的下一步，逐台引到座位前方那台' },
  { row: 'met', mark: '④', part: 4, kind: 'rel', verdict: '相遇', see: '人坐着，引导中的猫已在座位前方那台', act: '不再落新台，该台保持落下' },
  { row: 'catMove', mark: '⑤', part: 4, kind: 'rel', verdict: '猫的位置变更', see: '猫有了新的目标台，不读这次移动相对人是远离还是接近', act: '目标台约 0.7 s 落满' },
  { row: 'table', mark: '桌', part: 5, kind: 'base', verdict: '需要桌子', see: '人坐到座位上', act: '桌子台落到桌高' },
  { row: 'foot', mark: '脚', part: 5, kind: 'base', verdict: '台被猫占用', see: '猫在一台上', act: '保持落下，猫离开后收回' },
  { row: 'overHead', mark: '×', part: 5, kind: 'check', verdict: '与人的身体冲突', see: '要落的台会伸到坐着的人头顶上方', act: '不落，已落的收回' },
  { row: 'press', mark: '×', part: 5, kind: 'check', verdict: '与人的身体冲突', see: '猫的目标台没落过一半，台角会碰到站着的人', act: '暂不落，猫等待' },
  { row: 'r5', mark: '×', part: 5, kind: 'check', verdict: '会困住人', see: '一台落成墙，会使原本有路的人无路到门', act: '停在墙线以下' },
  { row: 'gapApproachOther', mark: '?', part: 7, kind: 'gap', verdict: '引导中的猫正在向别人移动', see: '不在输入里', act: '继续引导' },
  { row: 'gapWatchedOther', mark: '?', part: 7, kind: 'gap', verdict: '引导中的猫正被别人注视', see: '不在输入里', act: '继续递台' },
];
const ROW_OF = new Map(ROWS.map((r) => [r.row, r]));
const PART_TITLE: Record<number, [string, string]> = {
  4: ['第 4 节', '感知 → 理解 → 干预'],
  5: ['第 5 节', '与人猫关系无关的规则'],
  7: ['第 7 节', '单元读不到的关系'],
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
const stat = {
  rules: $<HTMLElement>('#stRules'),
  units: $<HTMLElement>('#stUnits'),
  seat: $<HTMLElement>('#stSeat'),
  guide: $<HTMLElement>('#stGuide'),
};

// 平面图的房间是正方形，700 × 520 的画布左右各空一大块；只取中间 CW 宽，房间就占满画框
const CW = 560;
const OFF = (W - CW) / 2;
const dpr = Math.min(2, window.devicePixelRatio || 1);
canvas.width = Math.round(CW * dpr);
canvas.height = Math.round(H * dpr);
const ctx = canvas.getContext('2d')!;

interface Pal extends Palette {
  amber: string;
  panel: string;
}
function readPal(): Pal {
  const cs = getComputedStyle(wrap);
  return { ...readPalette(wrap), amber: cs.getPropertyValue('--amber').trim() || '#e2b65c', panel: cs.getPropertyValue('--panel').trim() || '#1e2a30' };
}
let pal = readPal();
/** ①–⑤ 在圆里画成数字，别的照原字 */
const markText = (m: string) => (/[①-⑤]/.test(m) ? String('①②③④⑤'.indexOf(m) + 1) : m);
const kindInk = (k: Kind, p: Pal) => (k === 'check' ? p.warn : k === 'gap' ? p.amber : k === 'rel' ? p.accent2 : p.ink);

let seed = 11;
let sim = newSim(seed);
let speed = 4;
let running = true;
let hover: RuleRow | null = null;
let pinned: RuleRow | null = null;
const focusRow = () => hover ?? pinned;
let picked: number | null = null;
let hits: RuleHit[] = [];
const totals = new Map<RuleRow, number>();
let liveKeys = new Set<string>();

// 走势：每过一秒仿真时间记一次此刻各行成立几条，留最近 90 s
const HIST = 90;
const hist = new Map<RuleRow, number[]>();
let lastSec = 0;
function resetHist() {
  for (const r of ROWS) hist.set(r.row, []);
  lastSec = Math.floor(sim.t);
}
resetHist();

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
  if (h.row === 'pass') return `${ps[0]} · 收开 ${h.bands?.length ?? 0} 条带`;
  if (h.row === 'seatFar') {
    const g = sim.guides.find((q) => q.kind === 'sit' && q.person === h.people[0]);
    const c = sim.cats.find((q) => q.id === h.cats[0]);
    const left = g ? g.path.length - (c && c.unit ? 1 : 0) : 0;
    return `${ps[0]} → ${cs[0]} · 还差 ${left} 台`;
  }
  if (h.row === 'met') return `${ps[0]} · ${cs[0]}`;
  if (h.row === 'stand') return `${ps[0]} 注视 ${cs[0]}`;
  if (h.row === 'gapApproachOther') return `${cs[0]} 由 ${ps[0]} 引导 · 向 ${ps[1]} 移动`;
  if (h.row === 'gapWatchedOther') return `${cs[0]} 由 ${ps[0]} 引导 · ${ps[1]} 注视`;
  const named = [ps.join('、'), cs.join('、')].filter(Boolean).join(' · ');
  return named || `${h.units.length} 台`;
}

// ── 读数面板：一次建好，之后只改类、数与走势 ─────────────────────────────────────

interface RowEl {
  el: HTMLElement;
  now: HTMLElement;
  total: HTMLElement;
  who: HTMLElement;
  spark: HTMLCanvasElement;
}
const rowEls = new Map<RuleRow, RowEl>();
const partEls = new Map<number, HTMLElement>();
const SPW = 96;
const SPH = 22;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function buildRows() {
  let part = 0;
  for (const r of ROWS) {
    if (r.part !== part) {
      part = r.part;
      const h = el('div', 'part');
      const [n, t] = PART_TITLE[part];
      h.append(el('span', 'part-n', n), el('span', 'part-t', t), el('span', 'part-c', ''));
      rowsEl.appendChild(h);
      partEls.set(part, h.querySelector('.part-c')!);
    }
    const b = el('button', `row k-${r.kind}`);
    b.type = 'button';
    b.dataset.row = r.row;
    b.setAttribute('aria-pressed', 'false');
    const mark = el('span', 'mark', markText(r.mark));
    mark.setAttribute('aria-hidden', 'true');
    const body = el('span', 'body');
    body.append(el('span', 'verdict', r.verdict));
    const flow = el('span', 'flow');
    if (r.kind === 'gap') flow.append(el('span', 'k', '单元'), el('span', 'v', r.see), el('span', 'k', '现行处理'), el('span', 'v', r.act));
    else flow.append(el('span', 'k', '感知'), el('span', 'v', r.see), el('span', 'k', '干预'), el('span', 'v', r.act));
    const whoEl = el('span', 'who');
    body.append(flow, whoEl);
    const meter = el('span', 'meter');
    const spark = el('canvas', 'spark');
    spark.width = SPW * dpr;
    spark.height = SPH * dpr;
    spark.setAttribute('aria-hidden', 'true');
    const nums = el('span', 'nums');
    const now = el('b', 'now', '0');
    const total = el('small', 'tot', '累计 0');
    nums.append(now, total);
    meter.append(spark, nums);
    b.append(mark, body, meter);
    b.addEventListener('mouseenter', () => (hover = r.row));
    b.addEventListener('mouseleave', () => (hover = null));
    b.addEventListener('focus', () => (hover = r.row));
    b.addEventListener('blur', () => (hover = null));
    b.addEventListener('click', () => {
      pinned = pinned === r.row ? null : r.row;
      for (const [k, x] of rowEls) x.el.setAttribute('aria-pressed', String(k === pinned));
    });
    rowsEl.appendChild(b);
    rowEls.set(r.row, { el: b, now, total, who: whoEl, spark });
  }
}
buildRows();

function keyOf(h: RuleHit): string {
  return `${h.row}|${h.people.join(',')}|${h.cats.join(',')}|${h.row === 'seatFar' || h.row === 'pass' ? '' : h.units.join(',')}`;
}

/** 每次仿真推进后调：累计次数按「新出现的一条」记，走势按仿真秒记 */
function account() {
  const keys = new Set<string>();
  const count = new Map<RuleRow, number>();
  for (const h of hits) {
    const k = keyOf(h);
    keys.add(k);
    if (!liveKeys.has(k)) totals.set(h.row, (totals.get(h.row) ?? 0) + 1);
    count.set(h.row, (count.get(h.row) ?? 0) + 1);
  }
  liveKeys = keys;
  const sec = Math.floor(sim.t);
  for (let s = lastSec; s < sec; s++)
    for (const r of ROWS) {
      const a = hist.get(r.row)!;
      a.push(count.get(r.row) ?? 0);
      if (a.length > HIST) a.shift();
    }
  lastSec = sec;
}

function drawSpark(c: HTMLCanvasElement, data: number[], kind: Kind, on: boolean) {
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, SPW, SPH);
  g.globalAlpha = 0.35;
  g.fillStyle = pal.muted;
  g.fillRect(0, SPH - 1, SPW, 1);
  const max = Math.max(2, ...data);
  const bw = SPW / HIST;
  g.fillStyle = kindInk(kind, pal);
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!v) continue;
    const h = Math.max(2, (v / max) * (SPH - 3));
    const x = SPW - (data.length - i) * bw;
    g.globalAlpha = on && i === data.length - 1 ? 1 : 0.55;
    g.fillRect(x, SPH - 1 - h, Math.max(1, bw - 0.4), h);
  }
}

function updatePanel() {
  const byRow = new Map<RuleRow, RuleHit[]>();
  for (const h of hits) {
    if (!byRow.has(h.row)) byRow.set(h.row, []);
    byRow.get(h.row)!.push(h);
  }
  const f = focusRow();
  const partOn = new Map<number, number>();
  for (const r of ROWS) {
    const e = rowEls.get(r.row)!;
    const list = byRow.get(r.row) ?? [];
    const on = list.length > 0;
    if (on) partOn.set(r.part, (partOn.get(r.part) ?? 0) + 1);
    e.el.classList.toggle('on', on);
    e.el.classList.toggle('focus', f === r.row);
    e.now.textContent = String(list.length);
    e.total.textContent = `累计 ${totals.get(r.row) ?? 0}`;
    const shown = r.row === 'foot' ? [] : list.slice(0, 3);
    e.who.replaceChildren(...shown.map((h) => el('span', 'chip', who(h))));
    if (r.row !== 'foot' && list.length > shown.length) e.who.append(el('span', 'more', `另 ${list.length - shown.length} 条`));
    drawSpark(e.spark, hist.get(r.row)!, r.kind, on);
  }
  for (const [p, c] of partEls) {
    const n = ROWS.filter((r) => r.part === p).length;
    c.textContent = `${partOn.get(p) ?? 0} / ${n} 成立`;
  }
  const t = Math.floor(sim.t);
  clockEl.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  // 四个总数
  let ruleOn = 0;
  for (const r of ROWS) if (byRow.has(r.row)) ruleOn++;
  let down = 0;
  for (let u = 0; u < sim.layout.units.length; u++) if (sim.act.degree[u] > 0.01) down++;
  stat.rules.textContent = `${ruleOn}`;
  stat.units.textContent = `${down}`;
  stat.seat.textContent = `${sim.people.filter((p) => p.seated).length}/${sim.people.length}`;
  stat.guide.textContent = `${sim.guides.filter((g) => g.kind === 'sit').length}`;
  if (picked !== null) renderDetail(picked);
}

// ── 点一台单元：它此刻为什么落、被什么拦着 ─────────────────────────────────────

const REASON_NAME: Record<string, [string, string]> = {
  table: ['桌', '桌子'],
  step: ['③', '引猫：路上的一步'],
  meet: ['④', '引猫：座位前方那台'],
  offer: ['②', '站立注视：给一步'],
  foot: ['脚', '猫在这台上'],
  go: ['⑤', '猫的目标台'],
  climb: ['⑤', '猫要跳上的台'],
};

function renderDetail(u: number | null) {
  if (u === null) {
    detailEl.replaceChildren(el('p', 'hint', '点画面里任何一台单元，这里写出它此刻为什么落、被什么拦着。'));
    return;
  }
  const why = unitReasons(sim)[u];
  const deg = sim.act.degree[u];
  const state = deg >= 1 - 1e-9 ? '落满' : deg > 1e-6 ? `落到 ${Math.round(deg * 100)}%` : '收着';
  const head = el('div', 'd-head');
  head.append(el('b', 'd-title', `第 ${u + 1} 台`), el('span', `pill ${deg >= 1 - 1e-9 ? 'pill--on' : deg > 1e-6 ? 'pill--mid' : ''}`, state));
  const list = el('ul', 'd-list');
  for (const r of why) {
    const [m, name] = REASON_NAME[r.kind];
    const li = el('li');
    const who = [r.person !== undefined ? personLabel.get(r.person) : '', r.cat !== undefined ? catLabel.get(r.cat) : ''].filter(Boolean).join(' · ');
    li.append(el('span', 'd-mark', markText(m)), el('span', 'd-name', name), el('span', 'd-who', who));
    list.append(li);
  }
  for (const h of hits) {
    if ((h.row === 'overHead' || h.row === 'press' || h.row === 'r5') && h.units.includes(u)) {
      const li = el('li', 'd-block');
      li.append(el('span', 'd-mark', '×'), el('span', 'd-name', ROW_OF.get(h.row)!.see), el('span', 'd-who', ROW_OF.get(h.row)!.act));
      list.append(li);
    }
  }
  if (!list.childElementCount) list.append(el('li', 'd-none', '没有落下的理由'));
  detailEl.replaceChildren(head, list);
}

// ── 画布上的标注：单元旁的编号 + 细线连到起因（人或猫）；悬停一行时只亮那一行 ─────────

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
  const f = focusRow();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const drawn = new Set<string>();
  for (const h of hits) {
    const def = ROW_OF.get(h.row)!;
    if (h.row === 'foot' || def.part === 7) continue;
    const hot = f === h.row;
    ctx.globalAlpha = f !== null && !hot ? 0.1 : 1;
    const ink = kindInk(def.kind, pal);
    const from = h.row === 'catMove' ? catPos.get(h.cats[0]) : h.people.length ? posOf.get(h.people[0]) : undefined;
    const targets = h.row === 'seatFar' ? [h.units[0]] : h.units;
    for (const u of targets) {
      const U = L.units[u];
      const bx = X(U.x) - r * 0.62;
      const by = Y(U.y) - r * 0.62;
      if (from && def.kind !== 'check') {
        ctx.strokeStyle = ink;
        ctx.lineWidth = hot ? 1.6 : 1;
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
      const rad = hot ? 10.5 : 9;
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(bx, by, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = pal.paper;
      ctx.stroke();
      ctx.fillStyle = pal.paper;
      ctx.font = '700 11px "JetBrains Mono", "Noto Sans SC", ui-monospace, monospace';
      ctx.fillText(markText(def.mark), bx, by + 0.5);
    }
  }
  // 聚焦一行：把牵涉的人和猫圈出来
  if (f) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = kindInk(ROW_OF.get(f)!.kind, pal);
    ctx.lineWidth = 2;
    for (const h of hits) {
      if (h.row !== f) continue;
      for (const id of h.people) {
        const p = posOf.get(id);
        if (p) {
          ctx.beginPath();
          ctx.arc(X(p.x), Y(p.y), 14, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      for (const id of h.cats) {
        const p = catPos.get(id);
        if (p) {
          ctx.beginPath();
          ctx.arc(X(p.x), Y(p.y), 12, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }
  // 人和猫的名字（读数面板里用的就是这些名字），描一圈底色防压线
  ctx.globalAlpha = 1;
  ctx.font = '600 10.5px "JetBrains Mono", ui-monospace, monospace';
  ctx.lineJoin = 'round';
  const tag = (s: string, x: number, y: number, fill: string) => {
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = pal.paper;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
  };
  for (const p of sim.people) {
    const q = posOf.get(p.id)!;
    tag(personLabel.get(p.id)!.replace('访客 ', ''), X(q.x) + 12, Y(q.y) - 12, pal.ink);
  }
  for (const c of sim.cats) tag(catLabel.get(c.id)!.replace('猫 ', ''), X(c.walker.x) + 11, Y(c.walker.y) - 11, pal.accent2);
  // 点选的那台
  if (picked !== null) {
    const U = L.units[picked];
    ctx.strokeStyle = pal.ink;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(X(U.x), Y(U.y), r + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function paint() {
  ctx.setTransform(dpr, 0, 0, dpr, -OFF * dpr, 0);
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
    if (n) {
      hits = ruleReadout(sim);
      account();
    }
  }
  paint();
  if (now - panelAt > 120) {
    updatePanel();
    panelAt = now;
  }
  requestAnimationFrame(frameLoop);
}

// ── 控件 ──────────────────────────────────────────────────────────────────────────

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
function warm() {
  // 开场先跑 90 秒仿真时间，让人坐下、猫开始被引，第一眼就有东西可看；走势从这 90 s 里补齐
  for (let k = 0; k < 90 * 30; k++) {
    sim.step(DT);
    if (k % 15 === 0) {
      hits = ruleReadout(sim);
      account();
    }
  }
  hits = ruleReadout(sim);
  account();
}
$<HTMLButtonElement>('#restart').addEventListener('click', () => {
  seed += 1;
  sim = newSim(seed);
  relabel();
  totals.clear();
  liveKeys = new Set();
  hits = [];
  picked = null;
  resetHist();
  warm();
  renderDetail(null);
  updatePanel();
});
canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const cx = ((ev.clientX - rect.left) / rect.width) * CW + OFF;
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
  renderDetail(picked);
});
const repal = () => (pal = readPal());
window.addEventListener('resize', repal);
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', repal);
new MutationObserver(repal).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

warm();
renderDetail(null);
updatePanel();
requestAnimationFrame(frameLoop);
