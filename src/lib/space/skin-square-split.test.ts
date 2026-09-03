import { describe, expect, it } from 'vitest';
import {
  SQSPLIT,
  SQSPLIT_BAND,
  SQSPLIT_FLOOR,
  SQSPLIT_GAP_MAX,
  SQSPLIT_PAIR_CLASS,
  SQSPLIT_REACH,
  SQSPLIT_SCHEDULE,
  SQSPLIT_T,
  SQSPLIT_TIERS,
  buildSquareSplitOrder,
  buildSquareSplitUnits,
  sqSplitBuild,
  sqSplitCellPitch,
  sqSplitGapLower,
  sqSplitH,
  sqSplitHalfSide,
  sqSplitLadder,
  sqSplitPairOf,
  sqSplitRim,
  sqSplitSeamW,
  sqSplitStructure,
  sqSplitTarget,
} from './skin-square-split';
import { SQUARE, SQUARE_RUNGS, squareAngle, squareCellGap, squareClassOf, squarePw } from './skin-square';
import { silhouette } from './skin-split';
import { SKIN, createSkinUnit, type SkinBond } from './skin-unit';

/**
 * 守门：方形环 · 捏分编制 **一次循环 · 变高**（2026-09-02 两轮拍板：一次循环 → 拉高）。
 * 引擎零涉及——用的全是既有选项。卡的是这一编制的四条命根子：
 *  ① **一圈一个来回**——编制闭合、从双平台边到整块边单调、关于极点轴镜像；
 *  ② **台高钉死、缝张开**——每级总高 = 2·台高 + w(t)，两片台各 16，双平台那条边裂到轴、
 *     两台之间的净空 ≈ 缝宽；
 *  ③ **下板齐平、上板升起**（不对称配平垫的构造性质）；
 *  ④ **外缘点仍落在方形边上**。
 * 外加一条成形纪律：顶/底面排整齐（高箱成形期顶面翻折的对策）。
 */

const F_TOT = SQSPLIT.F_TOT;
const BUILDS = SQSPLIT_TIERS.map((t) => sqSplitBuild(t));
const ORDER = buildSquareSplitOrder();
const COS = [Math.cos(squareAngle(0)), Math.cos(squareAngle(1)), Math.cos(squareAngle(2))];

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
  /** 下板底面离下缘，逐检查点 */
  floor: number[];
  /** 顶板顶面离下缘（终态） */
  top: number;
  peak: number;
  silD: number;
}
const CK = [400, 550, 650, 750, 1000, 1500];

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
  return SQSPLIT_TIERS.map((tier, ti) => {
    const b = BUILDS[ti];
    const sim = createSkinUnit(b.spec, b.opts);
    const floor: number[] = [];
    let knot = 0;
    let peak = 0;
    for (let k = 0; k < SKIN.STEPS; k++) {
      sim.advance();
      if (CK.includes(k + 1)) floor.push((sim.py[b.marks.outB] - sim.py[sim.n - 1]) * 100);
      if (k % 10 === 0) {
        const seg: [number, number][] = [];
        for (let i = b.lead; i < b.lead + b.free; i++) {
          seg.push([sim.px[i], sim.py[i]]);
          peak = Math.max(peak, sim.px[i] * 100);
        }
        knot = Math.max(knot, knotSpan(seg));
      }
    }
    const px = (i: number): number => sim.px[i] * 100;
    const py = (i: number): number => -sim.py[i] * 100;
    let reach = 0;
    for (let i = b.lead; i < b.lead + b.free; i++) reach = Math.max(reach, px(i));
    peak = Math.max(peak, reach);
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
    const vert = tier.t > 0
      ? Math.max(px(b.marks.mouthA) - px(b.marks.faceA), px(b.marks.mouthB) - px(b.marks.faceB))
      : 0;
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
      locked: sim.locked.length, keys, knot, seamMinX, gap, floor, peak, vert, silD: sum / A.length,
      top: (sim.py[b.marks.outA] - sim.py[sim.n - 1]) * 100,
    };
  });
}
const run = (): Row[] => (RUN ??= runAll());

describe('方形环 · 捏分一次循环 · 变高（编制）', () => {
  it('二十位 = 一个来回：从双平台那条边单调降到整块那条边，再单调升回来，闭合', () => {
    expect(ORDER).toHaveLength(SQUARE.COUNT);
    const lv = ORDER.map((ti) => SQSPLIT_TIERS[ti].level);
    let flips = 0;
    let last = 0;
    for (let i = 0; i < SQUARE.COUNT; i++) {
      const d = Math.sign(lv[(i + 1) % SQUARE.COUNT] - lv[i]);
      if (d !== 0) {
        if (last !== 0 && d !== last) flips++;
        last = d;
      }
    }
    expect(flips, '折返次数（首尾相接算一圈）').toBe(2);
    // 双平台那条边连同两侧的边共四条全裂（用户的原话是「一条边上是双平台」）；整块那边两条实心
    expect(lv.filter((l) => l === 9)).toHaveLength(4);
    expect(lv.filter((l) => l === 0)).toHaveLength(2);
    for (let i = 0; i < SQUARE.COUNT; i++) {
      const j = sqSplitPairOf(i);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThanOrEqual(9);
      expect(lv[i]).toBe(SQSPLIT_SCHEDULE[j]);
      expect(squareClassOf(i)).toBe(SQSPLIT_PAIR_CLASS[j]);
    }
    const per = new Array(10).fill(0);
    for (let i = 0; i < SQUARE.COUNT; i++) per[sqSplitPairOf(i)]++;
    expect(per).toEqual(new Array(10).fill(2));
  });

  it('时间表：从 9 到 0 单调；只跳过 L2（三类都做不出），其余逐级', () => {
    expect(SQSPLIT_SCHEDULE).toHaveLength(10);
    expect(SQSPLIT_SCHEDULE[0]).toBe(9);
    expect(SQSPLIT_SCHEDULE[9]).toBe(0);
    for (let j = 1; j < 10; j++) expect(SQSPLIT_SCHEDULE[j]).toBeLessThanOrEqual(SQSPLIT_SCHEDULE[j - 1]);
    expect(SQSPLIT_SCHEDULE).not.toContain(2);
    for (let j = 1; j < 10; j++) expect(SQSPLIT_SCHEDULE[j - 1] - SQSPLIT_SCHEDULE[j]).toBeLessThanOrEqual(2);
    expect(SQSPLIT_T).toHaveLength(10);
    for (const t of SQSPLIT_TIERS) expect(t.t).toBe(SQSPLIT_T[t.level]);
  });

  it('引擎表 = 时间表里出现过的 (方位类, 级) 一一登记；同类挑出按方形的 1/cos 对上', () => {
    const used = new Set(ORDER);
    expect(used.size).toBe(SQSPLIT_TIERS.length);
    const counts = SQSPLIT_TIERS.map((_, ti) => ORDER.filter((x) => x === ti).length);
    for (const c of counts) expect(c).toBeGreaterThanOrEqual(2);
    expect(counts.reduce((s, c) => s + c, 0)).toBe(SQUARE.COUNT);
    for (const [ti, t] of SQSPLIT_TIERS.entries()) {
      const want = sqSplitHalfSide() / COS[t.cls] - SQUARE.RADIUS;
      expect(Math.abs(SQSPLIT_REACH[ti] - want), `${t.en} 挑出 ${SQSPLIT_REACH[ti]} vs 目标 ${want.toFixed(1)}`).toBeLessThan(2.5);
    }
  });

  it('变高：每级总高 = 2·台高 + w(t)，整块那一级 = 32，双平台那一级 = 132', () => {
    expect(sqSplitH(0)).toBe(2 * SQSPLIT.LOBE);
    expect(sqSplitH(1)).toBeCloseTo(2 * SQSPLIT.LOBE + SQSPLIT.W_END, 9);
    for (const [i, t] of SQSPLIT_TIERS.entries()) expect(BUILDS[i].h).toBeCloseTo(2 * SQSPLIT.LOBE + sqSplitSeamW(t.t), 9);
    // 缝宽单调：从整块边到双平台边一路张开
    const ws = SQSPLIT_SCHEDULE.map((l) => sqSplitSeamW(SQSPLIT_T[l]));
    for (let j = 1; j < 10; j++) expect(ws[j]).toBeLessThanOrEqual(ws[j - 1]);
  });

  it('八段谱：不对称配平垫——下垫补齐各级的下侧间隙（下板齐平），带长 = SQSPLIT_BAND', () => {
    for (const [i, b] of BUILDS.entries()) {
      expect(b.spec.reduce((s, q) => s + q[1], 0)).toBe(SQSPLIT_BAND);
      expect(b.free % 2).toBe(1);
      // 结构段之前：lead + 顶垫 + ISO；之后：ISO + 下垫 + tail
      const before = b.lead;
      const after = SQSPLIT_BAND - b.lead - b.free;
      const st = sqSplitStructure(SQSPLIT_TIERS[i]);
      const padB = after - SQUARE.ISO - SQSPLIT.TAIL;
      // 下侧间隙 + 0.6·下垫 = 全员同一个数（构造式的下板底面 − 2(tail+ISO)）
      expect(Math.abs(sqSplitGapLower(st) + 0.6 * padB - SQSPLIT_GAP_MAX), `${SQSPLIT_TIERS[i].en} 下垫配平`).toBeLessThan(0.31);
      expect(padB).toBeGreaterThanOrEqual(0);
      expect(before - SQSPLIT.LEAD - SQUARE.ISO, `${SQSPLIT_TIERS[i].en} 顶垫`).toBeGreaterThanOrEqual(0);
      expect(b.marks.center).toBe(b.lead + (b.free - 1) / 2);
    }
    // 下板底面（构造式）≈ 平档平台的底面（缝心 101.6 − 18）：切编制时下板不跳
    expect(SQSPLIT_FLOOR).toBeGreaterThan(80);
    expect(SQSPLIT_FLOOR).toBeLessThan(92);
    expect(SQSPLIT.LEAD).toBe(SQUARE.LEAD_MIN);
    expect(SQSPLIT.TAIL).toBeGreaterThanOrEqual(SQUARE.TAIL_MIN);
    // 预算贴着用：最长那条（结构 + 下垫）离 F_TOT 不超过 8 节
    const need = Math.max(...BUILDS.map((b) => b.free + (SQSPLIT_BAND - b.lead - b.free - SQUARE.ISO - SQSPLIT.TAIL)));
    expect(F_TOT - need).toBeGreaterThanOrEqual(0);
    expect(F_TOT - need).toBeLessThan(8);
  });

  it('缓冲富余在 [E_MIN, E_MAX] 内（按各级自己的总高算）', () => {
    for (const [i, b] of BUILDS.entries()) {
      const slack = 4 * ((b.free - 1) / 2 - (b.marks.outB - b.marks.center)) - (0.6 * (b.free - 1) - b.h);
      expect(slack, `${SQSPLIT_TIERS[i].en} 缓冲富余`).toBeLessThanOrEqual(SQUARE.E_MAX);
      expect(slack, `${SQSPLIT_TIERS[i].en} 缓冲富余`).toBeGreaterThanOrEqual(SQUARE.E_MIN);
    }
  });

  it('梯挡：外箱链恒 10 根、等长键 = 该级总高、最内钉在端面板端点', () => {
    for (let i = 0; i < BUILDS.length; i++) {
      const seg = BUILDS[i].spec.find((q) => q[0] === 'f' && (q[2] as SkinBond[] | undefined)?.length) as
        | ['f', number, SkinBond[], ...unknown[]]
        | undefined;
      expect(seg, SQSPLIT_TIERS[i].en).toBeTruthy();
      const bonds = seg![2];
      expect(bonds).toHaveLength(SQUARE_RUNGS);
      expect(new Set(bonds.map((b) => b[2])).size).toBe(1);
      expect(bonds[0][2]).toBeCloseTo(BUILDS[i].h / 100, 9);
      const c = BUILDS[i].marks.center;
      const inner = Math.min(...bonds.map((b) => (b[1] - b[0]) / 2));
      expect(c - inner).toBe(SQSPLIT_TIERS[i].t > 0 ? BUILDS[i].marks.faceA : c - squarePw(BUILDS[i].h));
    }
    // 整块那一级端面板半跨 = 8 精确（台高 16 ⇒ 32/4），等长键纪律不打折
    expect(squarePw(sqSplitH(0))).toBe(8);
  });

  it('成形设计：四件套 + 顶/底面排整齐（高箱成形期顶面翻折的对策）', () => {
    for (let i = 0; i < BUILDS.length; i++) {
      const o = BUILDS[i].opts;
      expect(o.zipUp, SQSPLIT_TIERS[i].en).toEqual([0]);
      expect(o.attNear).toBe(SQSPLIT.ATT_NEAR);
      expect(o.boxSquare).toBe(true);
      if (SQSPLIT_TIERS[i].t > 0) {
        const m = BUILDS[i].marks;
        expect(o.sqChains).toEqual([0]);
        expect(o.coreTether?.length).toBeGreaterThan(0);
        expect(o.coreTetherRel?.length).toBeGreaterThan(0);
        // 缝壁两段 + 顶面 [轴嘴, 面角] + 底面 [面角, 轴嘴]
        expect(o.alignRuns).toHaveLength(4);
        expect(o.alignRuns).toContainEqual([m.outA, m.faceA]);
        expect(o.alignRuns).toContainEqual([m.faceB, m.outB]);
        for (const [node, ref] of o.coreTetherRel!)
          if (node !== m.center) expect(ref).toBe(node < m.center ? m.mouthA : m.mouthB);
        // 面角同侧键 = 台高
        const seg = BUILDS[i].spec.find((q) => q[0] === 'f' && (q[4] as unknown[] | undefined)?.length) as
          | ['f', number, SkinBond[], unknown, SkinBond[][]]
          | undefined;
        expect(seg![4][1][0][2]).toBeCloseTo(SQSPLIT.LOBE / 100, 9);
      }
    }
  });

  it('绘图平滑窗口与全站一致且为奇数', () => {
    for (const u of buildSquareSplitUnits()) {
      expect(u.smooth[0] % 2).toBe(1);
      expect(u.smooth).toEqual([3, 1]);
    }
  });

  it('梯挡表：根数恒定、单调、首尾正确', () => {
    const ks = sqSplitLadder(10, 40);
    expect(ks).toHaveLength(SQUARE_RUNGS);
    expect(ks[0]).toBe(10);
    expect(ks[ks.length - 1]).toBe(40);
    for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeGreaterThan(ks[i - 1]);
  });

  it('外缘点落在方形边上；这一编制的阵列用自己的格距', () => {
    const side = 2 * sqSplitHalfSide();
    expect(side).toBeGreaterThan(215);
    expect(side).toBeLessThan(250);
    for (const p of sqSplitRim()) expect(Math.abs(p.dev)).toBeLessThan(2.5);
    // 平档的格距（207）装不下 ⇒ 自己的：2 × 最紧外缘 + 与平档同一份缝
    const pitch = sqSplitCellPitch(squareCellGap());
    const tight = SQUARE.RADIUS + Math.max(...SQSPLIT_TIERS.map((t, i) => (t.cls === 0 ? SQSPLIT_REACH[i] : 0)));
    expect(pitch - 2 * tight).toBeCloseTo(squareCellGap(), 9);
    const corner = SQUARE.RADIUS + Math.max(...SQSPLIT_REACH);
    expect(pitch * Math.SQRT2 - 2 * corner, '对角净空').toBeGreaterThan(6);
  });
});

describe('方形环 · 捏分一次循环 · 变高（真跑）', () => {
  it('十条各自成形：键全锁、挑出对得上表、打结 ≤6、缝角不鼓出端面、剪影Δ <6', { timeout: 400_000 }, () => {
    for (const [i, r] of run().entries()) {
      expect(r.locked, r.key).toBe(r.keys);
      expect(Math.abs(r.reach - SQSPLIT_REACH[i]), `${r.key} 挑出 ${r.reach.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.knot, `${r.key} 打结`).toBeLessThanOrEqual(6);
      expect(r.vert, `${r.key} 缝角鼓出端面`).toBeLessThan(1.5);
      expect(r.silD, `${r.key} 剪影Δ`).toBeLessThan(6);
    }
  });

  it('每级总高 = 自己的 2·台高 + 缝，顶底面是平的', { timeout: 400_000 }, () => {
    for (const r of run()) {
      expect(Math.abs(r.boxH - r.h), `${r.key} 总高 ${r.boxH.toFixed(2)} vs ${r.h.toFixed(1)}`).toBeLessThan(1.5);
      expect(r.topFlat, `${r.key} 顶面水平度`).toBeLessThan(1.5);
      expect(r.botFlat, `${r.key} 底面水平度`).toBeLessThan(1.5);
    }
  });

  it('双平台那条边真的裂到轴、两台之间净空 ≈ 缝宽；整块那边无缝', { timeout: 400_000 }, () => {
    const rows = run();
    for (const [i, t] of SQSPLIT_TIERS.entries()) {
      if (t.level === 9) {
        expect(rows[i].seamMinX, `${t.en} 缝区最小 x（0 = 裂到轴）`).toBeLessThan(0.5);
        expect(rows[i].gap, `${t.en} 两台净空`).toBeGreaterThan(0.8 * SQSPLIT.W_END);
      } else if (t.t > 0 && t.t < 0.8) {
        expect(rows[i].seamMinX, `${t.en} 缝深`).toBeGreaterThan(5);
      }
      if (t.level === 0) expect(t.t).toBe(0);
    }
  });

  it('下板齐平、上板升起：下板底面全员同高（构造给的），顶板随缝抬升 ≈ 缝宽', { timeout: 400_000 }, () => {
    const rows = run();
    const spread = CK.map((_, i) => Math.max(...rows.map((r) => r.floor[i])) - Math.min(...rows.map((r) => r.floor[i])));
    // 终态 1.7px（构造给的）。成形中段不齐（实测峰值 ≈50px）：各级下侧间隙 = (2r·(M+b) − H)/2
    // 随 r 各自缩、深箱缩得多，到终态才并回来——与缝心齐平那版「成形中段的对位散布」同一性质，
    // 按实测钉住、不放宽终态那条。
    expect(spread[CK.length - 1], '终态下板散布').toBeLessThan(6);
    expect(Math.max(...spread), '全程下板散布').toBeLessThan(60);
    const split = rows.find((r) => r.key === 'face L9')!;
    const solid = rows.find((r) => r.key === 'face L0')!;
    expect(split.top - solid.top, '顶板抬升').toBeGreaterThan(0.8 * SQSPLIT.W_END);
  });
});
