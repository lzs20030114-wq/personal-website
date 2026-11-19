/**
 * 单元此刻为什么落、为了谁（2026-11-19，项目二_输入到输出的规则.md 第 4–5 节的读法写成一份代码）。
 *
 * 只读 CohabitSim 对外的状态，照文档第 4、5 节重算，不改仿真、不读 stepSpace 里面的量。
 * 用在两处，所以只有这一份：核对脚本 scripts/cohabit/io-audit.mjs（每一次落下都要归得到一个理由），
 * 以及把「感知 → 理解 → 干预」画到网页上的读数（规则可视化方案，项目二_规则可视化方案.md）。
 *
 * 两层：
 *   unitReasons(sim)  每台单元此刻有哪些理由（文档第 4、5 节那六个）以及是谁引起的；
 *   ruleReadout(sim)  按文档第 4 节五行 + 第 5 节 + 第 7 节，列出此刻成立的每一条，带着人、猫、单元。
 */
import { COHABIT, bandAngle, tableClass, type Cat, type CohabitSim, type Visitor } from './cohabit';

/** 坐在第 seat 个座位上的人用不用得上第 u 台当桌子：那台归了他这件家具，或归了桌高相同的另一件（与 CohabitSim.sameTable 同一判法） */
function usesTable(sim: CohabitSim, u: number, furn: number): boolean {
  const owner = sim.tableBy[u];
  if (owner < 0) return false;
  if (owner === furn) return true;
  const r = sim.furn?.rects;
  return !!r && !!r[owner] && !!r[furn] && tableClass(r[owner].kind) === tableClass(r[furn].kind);
}

/** 文档第 4、5 节让单元落下的六个理由（桌子 · 引猫路上的一步 · 座位前方那台 · 站着给一步 · 猫脚下 · 猫要去 / 要跳上的台） */
export type UnitReasonKind = 'table' | 'step' | 'meet' | 'offer' | 'foot' | 'go' | 'climb';

export interface UnitReason {
  kind: UnitReasonKind;
  /** 引起它的人（桌子 = 坐着用它的人之一，引猫 = 坐着的人，站着给一步 = 站着的人） */
  person?: number;
  /** 牵涉的猫 */
  cat?: number;
}

/** 每台单元此刻的理由（下标 = 单元编号；没有理由 = 空数组） */
export function unitReasons(sim: CohabitSim): UnitReason[][] {
  const n = sim.layout.units.length;
  const out: UnitReason[][] = Array.from({ length: n }, () => []);
  for (const p of sim.people) {
    if (!p.seated || p.seat === null) continue;
    const s = sim.seats[p.seat];
    if (s.table >= 0 && usesTable(sim, s.table, s.furn)) out[s.table].push({ kind: 'table', person: p.id });
  }
  for (const g of sim.guides) {
    if (g.kind === 'stand') {
      out[g.path[1]].push({ kind: 'offer', person: g.person, cat: g.cat });
      continue;
    }
    const cat = sim.cats.find((c) => c.id === g.cat);
    const first = cat && cat.unit ? 1 : 0;
    const last = g.path.length - 1;
    const to = sim.guide.whole ? last : first;
    for (let k = first; k <= to && k <= last; k++) out[g.path[k]].push({ kind: k === last ? 'meet' : 'step', person: g.person, cat: g.cat });
  }
  for (const c of sim.cats) {
    if (c.climb) out[c.climb.unit.i].push({ kind: 'climb', cat: c.id });
    if (!c.unit) continue;
    for (const u of sim.supportOf(c)) out[u.i].push({ kind: 'foot', cat: c.id });
    if (c.pending) out[c.pending.i].push({ kind: 'go', cat: c.id });
  }
  return out;
}

/** 点到线段的距离（与 cohabit.ts 的 segDist 同式） */
function segD(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const L = dx * dx + dy * dy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 第 u 台第 j 条带全落时的径向段（与 CohabitSim 的 fullBandSegments 同式） */
export function bandSegment(sim: CohabitSim, u: number, j: number): [number, number, number, number] {
  const l = sim.layout;
  const U = l.units[u];
  const a = bandAngle(j);
  const cx = Math.cos(a);
  const cy = Math.sin(a);
  const R = l.bandReach ? l.bandReach[j] : l.platR;
  return [U.x + cx * l.mastR, U.y + cy * l.mastR, U.x + cx * R, U.y + cy * R];
}

/** 走着的人前方那段路线（照 requestBands：步速 × 收带时长 + 余量，截在路点折线上），返回折线点 */
function corridor(p: Visitor): { x: number; y: number }[] {
  const w = p.walker;
  const pts = [{ x: w.x, y: w.y }];
  let left = w.speed / COHABIT.FACES.open + COHABIT.FACES.ahead;
  let px = w.x;
  let py = w.y;
  for (const wp of w.route) {
    const d = Math.hypot(wp.x - px, wp.y - py);
    if (d <= left) {
      pts.push({ x: wp.x, y: wp.y });
      left -= d;
      px = wp.x;
      py = wp.y;
    } else {
      pts.push({ x: px + ((wp.x - px) * left) / d, y: py + ((wp.y - py) * left) / d });
      break;
    }
  }
  return pts;
}

/**
 * 这条带此刻是谁请求收开的（第 4 节第 ① 行）：身边 0.37 m 以内的人（走着、站着、坐着都算），
 * 或走着的人前方约 1.9 m 的路线经过它的外缘。返回请求它的人（可能不止一个）。
 */
export function bandRequesters(sim: CohabitSim, u: number, j: number): Visitor[] {
  const [ax, ay, bx, by] = bandSegment(sim, u, j);
  const margin = sim.marginM;
  const out: Visitor[] = [];
  for (const p of sim.people) {
    const w = p.walker;
    if (!w.present) continue;
    if (segD(w.x, w.y, ax, ay, bx, by) < margin) {
      out.push(p);
      continue;
    }
    if (w.state !== 'walk' || p.mode === 'held') continue;
    const pts = corridor(p);
    for (let k = 1; k < pts.length; k++)
      if (segD(bx, by, pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y) < margin) {
        out.push(p);
        break;
      }
  }
  return out;
}

/** 文档第 4 节五行、第 5 节、第 7 节里此刻成立的一条 */
export type RuleRow =
  /** 第 4 节：① 路过 · ② 站立注视 · ③ 落座、猫未到座位前方那台 · ④ 相遇 · ⑤ 猫的位置变更 */
  | 'pass' | 'stand' | 'seatFar' | 'met' | 'catMove'
  /** 第 5 节：桌子 · 猫脚下 · 盖着坐着的人头顶 · 台角会顶到站着的人 · R5 */
  | 'table' | 'foot' | 'overHead' | 'press' | 'r5'
  /** 第 7 节：单元读不出的——被引的猫正在靠近别人 · 被引的猫正被别人看着 */
  | 'gapApproachOther' | 'gapWatchedOther';

export interface RuleHit {
  row: RuleRow;
  /** 牵涉的人（访客 id） */
  people: number[];
  /** 牵涉的猫（猫 id） */
  cats: number[];
  /** 牵涉的单元（下标）：落下的那台、终点、被拦的那台 */
  units: number[];
  /** ① 收开的带：「单元 × 20 + 带」 */
  bands?: number[];
}

/**
 * 此刻成立的每一条，按文档第 4、5、7 节的顺序。一个人或一只猫可能同时出现在几条里
 * （例：坐着的人引猫 ③，他面前的桌子也在第 5 节里）。
 */
export function ruleReadout(sim: CohabitSim): RuleHit[] {
  const hits: RuleHit[] = [];
  if (sim.space !== 'live') return hits;
  const BANDS = COHABIT.FACES.BANDS;
  const n = sim.layout.units.length;
  const catById = new Map<number, Cat>(sim.cats.map((c) => [c.id, c]));

  // ① 人走过：只收挡路的带。按请求它的人归，同一个人一条
  if (sim.faces) {
    const byPerson = new Map<number, number[]>();
    for (let i = 0; i < sim.bandWant.length; i++) {
      if (!sim.bandWant[i] || sim.bandHold[i] || sim.bandOpen[i] <= 0) continue;
      const u = (i / BANDS) | 0;
      for (const p of bandRequesters(sim, u, i % BANDS)) {
        if (!byPerson.has(p.id)) byPerson.set(p.id, []);
        byPerson.get(p.id)!.push(i);
      }
    }
    for (const [pid, bands] of byPerson) {
      const p = sim.people.find((q) => q.id === pid)!;
      if (p.walker.state !== 'walk') continue; // 第 ① 行讲的是走过的人；站着、坐着的人身边收带记在注里
      hits.push({ row: 'pass', people: [pid], cats: [], units: [...new Set(bands.map((b) => (b / BANDS) | 0))], bands });
    }
  }

  // ② ③ ④：从空间此刻铺的路读
  for (const g of sim.guides) {
    const c = catById.get(g.cat);
    if (!c) continue;
    if (g.kind === 'stand') {
      hits.push({ row: 'stand', people: [g.person], cats: [g.cat], units: [g.path[1]] });
      continue;
    }
    const end = g.path[g.path.length - 1];
    const arrived = !!c.unit && c.unit.i === end && !c.transfer;
    if (arrived) hits.push({ row: 'met', people: [g.person], cats: [g.cat], units: [end] });
    else {
      const first = c.unit ? 1 : 0;
      hits.push({ row: 'seatFar', people: [g.person], cats: [g.cat], units: [g.path[Math.min(first, g.path.length - 1)], end] });
    }
  }

  // ⑤ 猫要换地方
  for (const c of sim.cats) {
    const to = c.pending ?? (c.climb ? c.climb.unit : null);
    if (to) hits.push({ row: 'catMove', people: [], cats: [c.id], units: [to.i] });
  }

  // 第 5 节：桌子（按家具归，一张桌子一条）
  const tableUsers = new Map<number, number[]>();
  for (const p of sim.people) {
    if (!p.seated || p.seat === null) continue;
    const { table: t, furn } = sim.seats[p.seat];
    if (t < 0 || !usesTable(sim, t, furn)) continue;
    if (!tableUsers.has(t)) tableUsers.set(t, []);
    tableUsers.get(t)!.push(p.id);
  }
  for (const [u, people] of tableUsers) hits.push({ row: 'table', people, cats: [], units: [u] });
  for (const c of sim.cats) if (c.unit) hits.push({ row: 'foot', people: [], cats: [c.id], units: sim.supportOf(c).map((u) => u.i) });

  // 第 5 节三道检查：有理由却被拦
  const why = unitReasons(sim);
  const seated = sim.people.filter((p) => p.seated && p.walker.present);
  const standing = sim.people.filter((p) => !p.seated && p.walker.present);
  for (let u = 0; u < n; u++) {
    if (!why[u].length || sim.act.degree[u] >= 1 - 1e-9) continue;
    const U = sim.layout.units[u];
    const head = seated.filter((p) => sim.overHead(U, p.walker.x, p.walker.y));
    if (head.length) {
      hits.push({ row: 'overHead', people: head.map((p) => p.id), cats: why[u].flatMap((r) => (r.cat === undefined ? [] : [r.cat])), units: [u] });
      continue;
    }
    if (sim.heldR5[u]) {
      hits.push({ row: 'r5', people: [], cats: [], units: [u] });
      continue;
    }
    if (sim.blocked[u]) {
      const press = standing.filter((p) => sim.overHead(U, p.walker.x, p.walker.y));
      hits.push({ row: 'press', people: press.map((p) => p.id), cats: why[u].flatMap((r) => (r.cat === undefined ? [] : [r.cat])), units: [u] });
    }
  }

  // 第 7 节：被引的猫此刻在做单元读不出的事
  for (const g of sim.guides) {
    if (g.kind !== 'sit') continue;
    const c = catById.get(g.cat);
    if (!c || (c.unit && c.unit.i === g.path[g.path.length - 1])) continue;
    if (c.state === 'approach' && c.approaching !== null && c.approaching !== g.person)
      hits.push({ row: 'gapApproachOther', people: [g.person, c.approaching], cats: [c.id], units: [] });
    const a = c.latency > 0 ? null : sim.attendingOf(c);
    if (a && a.id !== g.person) hits.push({ row: 'gapWatchedOther', people: [g.person, a.id], cats: [c.id], units: [] });
  }
  return hits;
}
