import { describe, expect, it } from 'vitest';
import { RING, ringGap } from './skin-ring';
import { silhouette } from './skin-split';
import { SQSPLIT, SQSPLIT_PAIR_T, SQSPLIT_PAIRS, sqSplitBuild, sqSplitH, sqSplitTarget } from './skin-square-split';
import { SQUARE } from './skin-square';
import {
  SPLIT_RING_BAND,
  SPLIT_RING_COUNT,
  SPLIT_RING_PHASE,
  SPLIT_RING_REACH,
  SPLIT_RING_TARGET,
  SPLIT_RING_TIERS,
  buildSplitRingOrder,
  buildSplitRingUnits,
} from './skin-split-ring';
import { SKIN, createSkinUnit } from './skin-unit';

/**
 * 守门：圆筒环 · 捏分（一次循环 · 变高 · 居中 · 一圈等挑出；2026-09-03 用户「圆形的捏分中间的空间还没做」）。
 * 卡四件：① 编制闭合且精确（镜像不取整）；② 十条全在面类深度、挑出落在同一目标 ±1（俯视是圆）；
 * ③ 变高 + 等步 + 居中与方形捏分同一构造（台高 16、缝 0→100、缝心一圈恒定）；④ 真跑十条各自成形。
 */
const BUILDS = SPLIT_RING_TIERS.map((t) => sqSplitBuild(t));
const CK = [400, 550, 650, 750, 1000, 1500];

interface Row {
  key: string;
  h: number;
  reach: number;
  boxH: number;
  topFlat: number;
  botFlat: number;
  locked: number;
  keys: number;
  knot: number;
  seamMinX: number;
  vert: number;
  gap: number;
  align: number[];
  top: number;
  floor: number;
  silD: number;
}
function knotSpan(p: readonly (readonly [number, number])[]): number {
  const hit = (a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): boolean => {
    const s1x = b[0] - a[0], s1y = b[1] - a[1], s2x = d[0] - c[0], s2y = d[1] - c[1];
    const den = -s2x * s1y + s1x * s2y;
    if (Math.abs(den) < 1e-12) return false;
    const s = (-s1y * (a[0] - c[0]) + s1x * (a[1] - c[1])) / den;
    const t = (s2x * (a[1] - c[1]) - s2y * (a[0] - c[0])) / den;
    return s > 0 && s < 1 && t > 0 && t < 1;
  };
  let span = 0;
  for (let i = 0; i + 1 < p.length; i++)
    for (let j = i + 2; j + 1 < p.length; j++) if (hit(p[i], p[i + 1], p[j], p[j + 1])) span = Math.max(span, j - i);
  return span;
}
let RUN: Row[] | null = null;
function runAll(): Row[] {
  return SPLIT_RING_TIERS.map((tier, ti) => {
    const b = BUILDS[ti];
    const sim = createSkinUnit(b.spec, b.opts);
    const align: number[] = [];
    let knot = 0;
    for (let k = 0; k < SKIN.STEPS; k++) {
      sim.advance();
      if (CK.includes(k + 1)) align.push((sim.py[b.marks.center] - sim.py[sim.n - 1]) * 100);
      if (k % 10 === 0) {
        const seg: [number, number][] = [];
        for (let i = b.lead; i < b.lead + b.free; i++) seg.push([sim.px[i], sim.py[i]]);
        knot = Math.max(knot, knotSpan(seg));
      }
    }
    const px = (i: number): number => sim.px[i] * 100;
    const py = (i: number): number => -sim.py[i] * 100;
    let reach = 0;
    for (let i = b.lead; i < b.lead + b.free; i++) reach = Math.max(reach, px(i));
    const win = (lo: number, hi: number): number[] => {
      const v: number[] = [];
      for (let i = lo; i <= hi; i++) if (px(i) >= 0.35 * reach && px(i) <= 0.85 * reach) v.push(py(i));
      return v;
    };
    const mean = (v: number[]): number => v.reduce((s, t) => s + t, 0) / v.length;
    const rng = (v: number[]): number => Math.max(...v) - Math.min(...v);
    const top = win(b.marks.outA, b.marks.faceA);
    const bot = win(b.marks.faceB, b.marks.outB);
    let seamMinX = Infinity;
    for (let i = b.marks.mouthA; i <= b.marks.mouthB; i++) seamMinX = Math.min(seamMinX, px(i));
    let gap = Infinity;
    if (tier.t > 0)
      for (const xq of [5, 15, 25, 35, 50]) {
        const pick = (lo: number, hi: number): number => {
          let best = 0;
          let bd = Infinity;
          for (let i = lo; i <= hi; i++) if (Math.abs(px(i) - xq) < bd) { bd = Math.abs(px(i) - xq); best = py(i); }
          return best;
        };
        if (xq < reach) gap = Math.min(gap, Math.abs(pick(b.marks.center, b.marks.mouthB) - pick(b.marks.mouthA, b.marks.center)));
      }
    let keys = 0;
    for (const ch of sim.chains) keys += ch.length;
    const vert = tier.t > 0 ? Math.max(px(b.marks.mouthA) - px(b.marks.faceA), px(b.marks.mouthB) - px(b.marks.faceB)) : 0;
    const cy = (mean(top) + mean(bot)) / 2;
    const profile: [number, number][] = [];
    for (let i = b.lead; i < b.lead + b.free; i++) profile.push([px(i), py(i) - cy]);
    const half = b.h / 2 + 4;
    const A = silhouette(profile, -half, half);
    const B = silhouette(sqSplitTarget(tier.t, tier.t > 0 ? tier.D! : reach, SQSPLIT.W_END, b.h), -half, half);
    let sum = 0;
    for (let i = 0; i < A.length; i++) sum += Math.abs(A[i] - B[i]);
    return {
      key: tier.en, h: b.h, reach, boxH: mean(bot) - mean(top), topFlat: rng(top), botFlat: rng(bot),
      locked: sim.locked.length, keys, knot, seamMinX, gap, align, vert, silD: sum / A.length,
      top: (sim.py[b.marks.outA] - sim.py[sim.n - 1]) * 100,
      floor: (sim.py[b.marks.outB] - sim.py[sim.n - 1]) * 100,
    };
  });
}
const run = (): Row[] => (RUN ??= runAll());

describe('圆筒环 · 捏分（一次循环 · 变高 · 居中 · 一圈等挑出）', () => {
  const order = buildSplitRingOrder();

  it('编制闭合：二十位、每对恰好两处、相邻位恒差 ≤1（含首尾相接）、两个折返点', () => {
    expect(SPLIT_RING_COUNT).toBe(20);
    expect(order).toHaveLength(SPLIT_RING_COUNT);
    const tally = new Map<number, number>();
    for (const l of order) tally.set(l, (tally.get(l) ?? 0) + 1);
    expect([...tally.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: SQSPLIT_PAIRS }, (_, j) => j));
    for (const [l, n] of tally) expect(n, `对 ${l} 出现次数`).toBe(2);
    for (let i = 0; i < order.length; i++) {
      const d = Math.abs(order[(i + 1) % order.length] - order[i]);
      expect(d, `位 ${i}→${(i + 1) % order.length}`).toBeLessThanOrEqual(1);
    }
    for (const end of [0, SQSPLIT_PAIRS - 1]) {
      const at = order.flatMap((l, i) => (l === end ? [i] : []));
      expect(at).toHaveLength(2);
      const g = Math.abs(at[0] - at[1]);
      expect(g === 1 || g === SPLIT_RING_COUNT - 1, `端点 ${end} 的两处应相邻`).toBe(true);
    }
    const zero = buildSplitRingOrder(SQSPLIT_PAIRS, SPLIT_RING_COUNT, 0);
    expect([...order].sort((a, b) => a - b)).toEqual([...zero].sort((a, b) => a - b));
    expect(order[(SPLIT_RING_COUNT - SPLIT_RING_PHASE) % SPLIT_RING_COUNT]).toBe(zero[0]);
  });

  it('十条引擎全在面类、时间表 = 方形捏分同一张（总高等步 132 → 32）', () => {
    expect(SPLIT_RING_TIERS).toHaveLength(SQSPLIT_PAIRS);
    expect(SPLIT_RING_TIERS.map((t) => t.pair)).toEqual(Array.from({ length: SQSPLIT_PAIRS }, (_, j) => j));
    for (const t of SPLIT_RING_TIERS) {
      expect(t.cls).toBe(0);
      expect(t.t).toBe(SQSPLIT_PAIR_T[t.pair]);
    }
    const hs = SPLIT_RING_TIERS.map((t) => sqSplitH(t.t));
    expect(hs[0]).toBeCloseTo(2 * SQSPLIT.LOBE + SQSPLIT.W_END, 9);
    expect(hs[SQSPLIT_PAIRS - 1]).toBe(2 * SQSPLIT.LOBE);
    const step = SQSPLIT.W_END / (SQSPLIT_PAIRS - 1);
    for (let j = 1; j < SQSPLIT_PAIRS; j++) expect(hs[j - 1] - hs[j], `第 ${j} 对总高步距`).toBeCloseTo(step, 6);
  });

  it('带长与对位构造 = 方形捏分同一份（对称配平垫 ⇒ 缝心一圈恒定），单元表形状正确', () => {
    for (const [i, b] of BUILDS.entries()) {
      expect(b.spec.reduce((s, q) => s + q[1], 0), SPLIT_RING_TIERS[i].en).toBe(SPLIT_RING_BAND);
      expect(b.free % 2).toBe(1);
      const pad = SQSPLIT.F_TOT - b.free;
      expect(pad % 2).toBe(0);
      expect(pad).toBeGreaterThanOrEqual(0);
      expect(b.lead).toBe(SQSPLIT.LEAD + pad / 2 + SQUARE.ISO);
      expect(SPLIT_RING_BAND - b.lead - b.free - SQUARE.ISO - SQSPLIT.TAIL).toBe(pad / 2);
    }
    const units = buildSplitRingUnits();
    expect(units).toHaveLength(SQSPLIT_PAIRS);
    for (const [i, u] of units.entries()) {
      expect(u.key).toBe(`ringsplit-j${i}`);
      expect(u.smooth).toEqual([3, 1]);
      expect(u.spec).toEqual(BUILDS[i].spec);
    }
    expect(SPLIT_RING_REACH).toHaveLength(SQSPLIT_PAIRS);
    for (const [i, r] of SPLIT_RING_REACH.entries())
      expect(Math.abs(r - SPLIT_RING_TARGET), `${SPLIT_RING_TIERS[i].en} 表内挑出 ${r} vs 目标 ${SPLIT_RING_TARGET}`).toBeLessThan(1.05);
  });

  it('环几何：量程内二十条窄带不互穿', () => {
    for (const r of [RING.RADIUS_MIN, RING.RADIUS_DEF, RING.RADIUS_MAX])
      expect(ringGap(r, SPLIT_RING_COUNT, RING.DEPTH), `半径 ${r} 净缝`).toBeGreaterThan(0);
  });
});

describe('圆筒环 · 捏分（真跑）', () => {
  it('十条各自成形：键全锁、挑出对得上表且一圈等挑出、打结 ≤6、缝角不鼓出端面、剪影Δ <6', { timeout: 400_000 }, () => {
    for (const [i, r] of run().entries()) {
      expect(r.locked, r.key).toBe(r.keys);
      expect(Math.abs(r.reach - SPLIT_RING_REACH[i]), `${r.key} 挑出 ${r.reach.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.knot, `${r.key} 打结`).toBeLessThanOrEqual(6);
      expect(r.vert, `${r.key} 缝角鼓出端面`).toBeLessThan(1.5);
      expect(r.silD, `${r.key} 剪影Δ`).toBeLessThan(6);
    }
    const reaches = run().map((r) => r.reach);
    expect(Math.max(...reaches) - Math.min(...reaches), '一圈挑出散布（俯视是圆）').toBeLessThan(2.1);
  });

  it('变高：每对总高 = 2·台高 + 缝，顶底面是平的', { timeout: 400_000 }, () => {
    for (const r of run()) {
      expect(Math.abs(r.boxH - r.h), `${r.key} 总高 ${r.boxH.toFixed(2)} vs ${r.h.toFixed(1)}`).toBeLessThan(1.5);
      expect(r.topFlat, `${r.key} 顶面水平度`).toBeLessThan(1.5);
      expect(r.botFlat, `${r.key} 底面水平度`).toBeLessThan(1.5);
    }
  });

  it('双平台那一对真的裂到轴、两台之间净空 ≈ 缝宽（中间的空间）；中段有缝', { timeout: 400_000 }, () => {
    const rows = run();
    for (const [i, t] of SPLIT_RING_TIERS.entries()) {
      if (t.t === 1) {
        expect(rows[i].seamMinX, `${t.en} 缝区最小 x（0 = 裂到轴）`).toBeLessThan(0.5);
        expect(rows[i].gap, `${t.en} 两台净空`).toBeGreaterThan(0.8 * SQSPLIT.W_END);
      } else if (t.t > 0.15 && t.t < 0.8) {
        expect(rows[i].seamMinX, `${t.en} 缝深`).toBeGreaterThan(5);
      }
    }
  });

  it('居中：缝心一圈恒定，上板升、下板降各一半，逐对平顺', { timeout: 400_000 }, () => {
    const rows = run();
    const spread = CK.map((_, i) => Math.max(...rows.map((r) => r.align[i])) - Math.min(...rows.map((r) => r.align[i])));
    expect(spread[CK.length - 1], '终态缝心散布').toBeLessThan(6);
    expect(Math.max(...spread), '全程缝心散布').toBeLessThan(40);
    const tops = rows.map((r) => r.top);
    const floors = rows.map((r) => r.floor);
    for (let j = 1; j < SQSPLIT_PAIRS; j++) {
      expect(tops[j - 1] - tops[j], `第 ${j} 对顶板步距`).toBeGreaterThan(0);
      expect(tops[j - 1] - tops[j], `第 ${j} 对顶板步距`).toBeLessThan(12);
      expect(floors[j] - floors[j - 1], `第 ${j} 对下板步距`).toBeGreaterThan(0);
      expect(floors[j] - floors[j - 1], `第 ${j} 对下板步距`).toBeLessThan(12);
    }
    expect(tops[0] - tops[SQSPLIT_PAIRS - 1], '顶板总抬升').toBeGreaterThan(0.4 * SQSPLIT.W_END);
    expect(floors[SQSPLIT_PAIRS - 1] - floors[0], '下板总下降').toBeGreaterThan(0.4 * SQSPLIT.W_END);
  });
});
