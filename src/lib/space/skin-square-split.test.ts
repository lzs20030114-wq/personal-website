import { describe, expect, it } from 'vitest';
import {
  SQSPLIT,
  SQSPLIT_PAIR_CLASS,
  SQSPLIT_REACH,
  SQSPLIT_SCHEDULE,
  SQSPLIT_T,
  SQSPLIT_TIERS,
  buildSquareSplitOrder,
  buildSquareSplitUnits,
  sqSplitBuild,
  sqSplitDCap,
  sqSplitHalfSide,
  sqSplitLadder,
  sqSplitMCap,
  sqSplitPairOf,
  sqSplitRim,
  sqSplitTarget,
} from './skin-square-split';
import {
  SQUARE, SQUARE_RUNGS, SQUARE_PEAK, SQUARE_DEPTH, SQUARE_KHI,
  squareAngle, squareBuffer, squareCellPitch, squareClassOf, squareFreeTotal, squarePw,
} from './skin-square';
import { silhouette } from './skin-split';
import { SKIN, createSkinUnit, type SkinBond } from './skin-unit';

/**
 * 守门：方形环 · 捏分编制 **一次循环**（Lab.14 第三种编制，2026-09-02 从四次循环改过来）。
 * 引擎零涉及——用的全是既有选项。这里卡的是这一编制的四条命根子：
 *  ① **一圈一个来回**（用户的原话：一条边上是双平台，绕到对面变成整块）——编制闭合、
 *     从双平台边到整块边单调、关于极点轴镜像；
 *  ② **箱高一圈恒定**（族定义。口径照 skin-square.test.ts：排除端面、x∈[0.35,0.85]·挑出）；
 *  ③ **双平台那条边真的裂成两台**（缝切到轴，不是「一个深槽」）；
 *  ④ **外缘点仍落在方形边上**（方形是靠挑出做出来的，缝不许把它带偏）。
 * 外加三条如实记录的账：平台比平档高、外缘偏差比四次循环那版大、成形中段的对位散布。
 */

const F_TOT = SQSPLIT.F_TOT;
const LEAD = SQSPLIT.LEAD;
const TAIL = SQUARE.BAND - 2 * SQUARE.ISO - F_TOT - LEAD;
/** 缝心离带子下缘（构造式）：2(尾+ISO) + r·(F−1)，与档位无关 */
const mouthY = (f: number, tail: number, r = 0.3): number => 2 * (tail + SQUARE.ISO) + r * (f - 1);
const BUILDS = SQSPLIT_TIERS.map((t) => sqSplitBuild(t));
const ORDER = buildSquareSplitOrder();
const COS = [Math.cos(squareAngle(0)), Math.cos(squareAngle(1)), Math.cos(squareAngle(2))];

interface Row {
  key: string;
  reach: number;
  boxH: number;
  topFlat: number;
  botFlat: number;
  topMean: number;
  locked: number;
  keys: number;
  knot: number;
  /** 缝区最小 x（0 = 裂到轴） */
  seamMinX: number;
  /** 缝角鼓出端面多少（>0 = 缝角比台面外缘还靠外 ⇒ 「挑出」量的是缝角，方形就建错了特征） */
  vert: number;
  /** 两片台之间的净空（沿挑出方向的最小值） */
  gap: number;
  /** 缝心离带子下缘，逐检查点 */
  align: number[];
  peak: number;
  /** 剪影Δ（终态 vs 目标线） */
  silD: number;
}
const CK = [400, 550, 650, 750, 1000, 1500];

/** 自交的最大环（夹住的节数）：≤6 = 织物褶皱；几十节 = 看得见的死结 */
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
    const align: number[] = [];
    let knot = 0;
    let peak = 0;
    for (let k = 0; k < SKIN.STEPS; k++) {
      sim.advance();
      if (CK.includes(k + 1)) align.push((sim.py[b.marks.center] - sim.py[sim.n - 1]) * 100);
      // 打结是瞬态，稀采样漏过一次（§16.3）——每 10 步一采
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
    // 箱高 / 水平度：**照 Lab.14 守门的口径**——排除端面，只取 x ∈ [0.35, 0.85]·挑出；
    // 捏分剖面有四个水平面而不是两个，故只采**外包络**那两段（嘴↔面角）。
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
      for (const xq of [5, 15, 25, 35]) {
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
    // 剪影Δ（§16.3：唯一的形态判据）——终态 vs 目标线，以箱的中线为 y 原点
    const cy = (mean(top) + mean(bot)) / 2;
    const profile: [number, number][] = [];
    for (let i = b.lead; i < b.lead + b.free; i++) profile.push([px(i), py(i) - cy]);
    const half = SQSPLIT.H / 2 + 4;
    const A = silhouette(profile, -half, half);
    const B = silhouette(sqSplitTarget(tier.t, tier.t > 0 ? tier.D! : reach), -half, half);
    let sum = 0;
    for (let i = 0; i < A.length; i++) sum += Math.abs(A[i] - B[i]);
    return {
      key: tier.en, reach, boxH: mean(bot) - mean(top), topFlat: rng(top), botFlat: rng(bot),
      topMean: mean(top), locked: sim.locked.length, keys, knot, seamMinX, gap, align, peak, vert, silD: sum / A.length,
    };
  });
}
const run = (): Row[] => (RUN ??= runAll());

describe('方形环 · 捏分一次循环（编制）', () => {
  it('二十位 = 一个来回：从双平台那条边单调降到整块那条边，再单调升回来，闭合', () => {
    expect(ORDER).toHaveLength(SQUARE.COUNT);
    const lv = ORDER.map((ti) => SQSPLIT_TIERS[ti].level);
    // 绕一圈只允许一次「降→升」的折返（相邻同级不算折返）
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
    // 两个极点：双平台边上两条 L9、整块边上两条 L0
    expect(lv.filter((l) => l === 9)).toHaveLength(2);
    expect(lv.filter((l) => l === 0)).toHaveLength(2);
    // 关于极点轴镜像：同一对的两个位置同级同类
    for (let i = 0; i < SQUARE.COUNT; i++) {
      const j = sqSplitPairOf(i);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThanOrEqual(9);
      expect(lv[i]).toBe(SQSPLIT_SCHEDULE[j]);
      expect(squareClassOf(i)).toBe(SQSPLIT_PAIR_CLASS[j]);
    }
    // 每对恰好两个位置
    const per = new Array(10).fill(0);
    for (let i = 0; i < SQUARE.COUNT; i++) per[sqSplitPairOf(i)]++;
    expect(per).toEqual(new Array(10).fill(2));
  });

  it('时间表：从 9 到 0 单调；跳级只在 L2（三类都做不出）与角位（角类到 L6 封顶）', () => {
    expect(SQSPLIT_SCHEDULE).toHaveLength(10);
    expect(SQSPLIT_SCHEDULE[0]).toBe(9);
    expect(SQSPLIT_SCHEDULE[9]).toBe(0);
    for (let j = 1; j < 10; j++) expect(SQSPLIT_SCHEDULE[j]).toBeLessThanOrEqual(SQSPLIT_SCHEDULE[j - 1]);
    // L2（t=.254）在挑出 > 47 的位置上做不出来（本轮三类候选全零）⇒ 时间表里没有它
    expect(SQSPLIT_SCHEDULE).not.toContain(2);
    // 角类挑出 ≈87：L7/L8 的材料上限够不着（候选零个）⇒ 角位最深只到 L6
    for (const t of SQSPLIT_TIERS) if (t.cls === 2) expect(t.level, `${t.en}`).toBeLessThanOrEqual(6);
    // 相邻两对之间最多跳一级（跳过的只能是 L2 或角位那一格），其余逐级
    for (let j = 1; j < 10; j++) expect(SQSPLIT_SCHEDULE[j - 1] - SQSPLIT_SCHEDULE[j]).toBeLessThanOrEqual(2);
    expect(SQSPLIT_T).toHaveLength(10);
    for (const t of SQSPLIT_TIERS) expect(t.t).toBe(SQSPLIT_T[t.level]);
  });

  it('引擎表 = 时间表里出现过的 (方位类, 级) 一一登记，无多无少；每条至少摆两处', () => {
    const used = new Set(ORDER);
    expect(used.size).toBe(SQSPLIT_TIERS.length);
    const counts = SQSPLIT_TIERS.map((_, ti) => ORDER.filter((x) => x === ti).length);
    for (const c of counts) expect(c).toBeGreaterThanOrEqual(2);
    expect(counts.reduce((s, c) => s + c, 0)).toBe(SQUARE.COUNT);
    // 同一方位类的引擎按方形的 1/cos 比值挑出（同类相同）——这是一次循环的全部约束
    for (const [ti, t] of SQSPLIT_TIERS.entries()) {
      const want = sqSplitHalfSide() / COS[t.cls] - SQUARE.RADIUS;
      expect(Math.abs(SQSPLIT_REACH[ti] - want), `${t.en} 挑出 ${SQSPLIT_REACH[ti]} vs 目标 ${want.toFixed(1)}`).toBeLessThan(2.5);
    }
  });

  it('七段谱：全员共用自己那份配平基准；平台比平档高 ≈20px（如实钉住）', () => {
    for (const b of BUILDS) {
      expect(b.spec.reduce((s, q) => s + q[1], 0)).toBe(SQUARE.BAND);
      expect(b.free % 2).toBe(1); // 自由段恒奇 ⇒ 垫劈两半是精确整数
      const pad = F_TOT - b.free;
      expect(pad % 2).toBe(0);
      expect(pad).toBeGreaterThanOrEqual(0);
      expect(b.lead).toBe(LEAD + pad / 2 + SQUARE.ISO);
      expect(b.marks.center).toBe(b.lead + (b.free - 1) / 2);
    }
    // 全员同 lead（对位构造的常数项）
    expect(new Set(BUILDS.map((b) => b.lead - (F_TOT - b.free) / 2)).size).toBe(1);
    expect(LEAD).toBe(SQUARE.LEAD_MIN);
    expect(TAIL).toBeGreaterThanOrEqual(SQUARE.TAIL_MIN);
    // 缝心离下缘 = 2(尾+ISO) + r(F−1)：F_TOT 259 比平档的 133 多出的那一截全在 r 项上
    const drop = mouthY(F_TOT, TAIL) - mouthY(squareFreeTotal(), SQUARE.TAIL);
    expect(drop, '比平档高多少').toBeGreaterThan(17);
    expect(drop, '比平档高多少').toBeLessThan(23);
  });

  it('缓冲富余在 [E_MIN, E_MAX] 内；单箱档不浅于 E_MAX 给的下限', () => {
    for (const [i, b] of BUILDS.entries()) {
      const slack = 4 * ((b.free - 1) / 2 - (b.marks.outB - b.marks.center)) - (0.6 * (b.free - 1) - SQSPLIT.H);
      expect(slack, `${SQSPLIT_TIERS[i].en} 缓冲富余`).toBeLessThanOrEqual(SQUARE.E_MAX);
      expect(slack, `${SQSPLIT_TIERS[i].en} 缓冲富余`).toBeGreaterThanOrEqual(SQUARE.E_MIN);
    }
    const kFloor = Math.ceil((SQSPLIT.H + SQUARE.G_MIN) / 1.2) - 9;
    expect(() => squareBuffer(kFloor - 1, SQSPLIT.H)).toThrow();
    expect(() => squareBuffer(kFloor, SQSPLIT.H)).not.toThrow();
    for (const t of SQSPLIT_TIERS) if (t.t === 0) expect(t.k!, `${t.en} 不许浅于这条下限`).toBeGreaterThanOrEqual(kFloor);
    // 平档全表不受这条纪律影响
    for (let k = SQUARE_DEPTH.KLO; k <= SQUARE_KHI; k++) expect(() => squareBuffer(k)).not.toThrow();
  });

  it('梯挡：外箱链恒 10 根、等长键 = 箱高、最内钉在端面板端点（端面硬投影的触发条件）', () => {
    for (let i = 0; i < BUILDS.length; i++) {
      const seg = BUILDS[i].spec.find((q) => q[0] === 'f' && (q[2] as SkinBond[] | undefined)?.length) as
        | ['f', number, SkinBond[], ...unknown[]]
        | undefined;
      expect(seg, SQSPLIT_TIERS[i].en).toBeTruthy();
      const bonds = seg![2];
      expect(bonds).toHaveLength(SQUARE_RUNGS);
      expect(new Set(bonds.map((b) => b[2])).size).toBe(1);
      expect(bonds[0][2]).toBeCloseTo(SQSPLIT.H / 100, 9);
      const c = BUILDS[i].marks.center;
      const inner = Math.min(...bonds.map((b) => (b[1] - b[0]) / 2));
      expect(c - inner).toBe(SQSPLIT_TIERS[i].t > 0 ? BUILDS[i].marks.faceA : c - squarePw(SQSPLIT.H));
    }
  });

  it('成形设计四件套齐全，单箱档也吃同一套；缝区折痕守同侧规则', () => {
    for (let i = 0; i < BUILDS.length; i++) {
      const o = BUILDS[i].opts;
      expect(o.zipUp, SQSPLIT_TIERS[i].en).toEqual([0]);
      expect(o.attNear).toBe(SQSPLIT.ATT_NEAR);
      expect(o.attNearChains).toEqual([0]);
      expect(o.boxSquare).toBe(true);
      if (SQSPLIT_TIERS[i].t > 0) {
        expect(o.sqChains).toEqual([0]);
        expect(o.coreTether?.length).toBeGreaterThan(0);
        expect(o.coreTetherRel?.length).toBeGreaterThan(0);
        expect(o.alignRuns).toHaveLength(2);
        const c = BUILDS[i].marks.center;
        for (const [node, ref] of o.coreTetherRel!)
          if (node !== c) expect(ref).toBe(node < c ? BUILDS[i].marks.mouthA : BUILDS[i].marks.mouthB);
      }
    }
  });

  it('绘图平滑窗口与全站一致且为奇数（偶数窗会把归一化撞出放大，§15.15）', () => {
    for (const u of buildSquareSplitUnits()) {
      expect(u.smooth[0] % 2).toBe(1);
      expect(u.smooth).toEqual([3, 1]);
    }
  });

  it('材料账：满裂的设计深度上限与箱高无关；面类满裂档在预算之内', () => {
    expect(sqSplitDCap()).toBeCloseTo(sqSplitMCap() - SQSPLIT.H / 4, 9);
    const face9 = SQSPLIT_TIERS.findIndex((t) => t.cls === 0 && t.level === 9);
    expect(face9).toBeGreaterThanOrEqual(0);
    expect(BUILDS[face9].free).toBeLessThanOrEqual(F_TOT);
    expect(SQSPLIT_TIERS[face9].D!).toBeLessThan(sqSplitDCap() + 8); // 实测比设计值鼓一截
  });

  it('梯挡表：根数恒定、单调、首尾正确', () => {
    const ks = sqSplitLadder(10, 40);
    expect(ks).toHaveLength(SQUARE_RUNGS);
    expect(ks[0]).toBe(10);
    expect(ks[ks.length - 1]).toBe(40);
    for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeGreaterThan(ks[i - 1]);
  });

  it('外缘点落在方形边上；阵列格距（按平档定）仍够用', () => {
    const side = 2 * sqSplitHalfSide();
    expect(side).toBeGreaterThan(150);
    expect(side).toBeLessThan(175);
    // 一次循环的方形比平档（169）略小：角类只有 L6 的材料上限够得着 ⇒ 角档挑出被 L6 封顶
    const pitch = squareCellPitch();
    const tight = SQUARE.RADIUS + Math.min(...SQSPLIT_REACH);
    const corner = SQUARE.RADIUS + Math.max(...SQSPLIT_REACH);
    expect(pitch - 2 * tight, '边对边净空').toBeGreaterThan(6);
    expect(pitch * Math.SQRT2 - 2 * corner, '对角净空').toBeGreaterThan(6);
    // 深度旋钮很粗（角档 k 一格 ≈2px、缝档 boxD 一格 2px），三类要同时对上一个方形，
    // 外缘偏差比四次循环那版（0.91）大——按实测钉住
    for (const p of sqSplitRim()) expect(Math.abs(p.dev)).toBeLessThan(2.5);
  });
});

describe('方形环 · 捏分一次循环（真跑）', () => {
  it('九条各自成形：键全锁、挑出对得上冻结的表、打结 ≤6、缝角不鼓出端面、剪影Δ <6', { timeout: 300_000 }, () => {
    for (const [i, r] of run().entries()) {
      expect(r.locked, r.key).toBe(r.keys);
      expect(Math.abs(r.reach - SQSPLIT_REACH[i]), `${r.key} 挑出 ${r.reach.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.knot, `${r.key} 打结`).toBeLessThanOrEqual(6);
      expect(r.vert, `${r.key} 缝角鼓出端面`).toBeLessThan(1.5);
      expect(r.silD, `${r.key} 剪影Δ`).toBeLessThan(6);
    }
  });

  it('箱高一圈恒定、顶底面是平的 —— 族定义不破', { timeout: 300_000 }, () => {
    for (const r of run()) {
      expect(Math.abs(r.boxH - SQSPLIT.H), `${r.key} 箱高 ${r.boxH.toFixed(2)}`).toBeLessThan(1.5);
      expect(r.topFlat, `${r.key} 顶面水平度`).toBeLessThan(1.5);
      expect(r.botFlat, `${r.key} 底面水平度`).toBeLessThan(1.5);
    }
    const hs = run().map((r) => r.boxH);
    expect(Math.max(...hs) - Math.min(...hs), '箱高散布').toBeLessThan(1.0);
    // 十条引擎各自的重力落位差（实测 2.8px）：换候选压不动（终态缝心散布 4.0–4.7 之间摆），
    // 按实测钉住——平档自己 0.0、四次循环那版 1.9
    const tops = run().map((r) => r.topMean);
    expect(Math.max(...tops) - Math.min(...tops), '顶面位置散布').toBeLessThan(4);
  });

  it('双平台那条边真的裂成两台；半开档不切到轴；整块那条边无缝', { timeout: 300_000 }, () => {
    const rows = run();
    for (const [i, t] of SQSPLIT_TIERS.entries()) {
      if (t.level === 9) {
        expect(rows[i].seamMinX, `${t.en} 缝区最小 x（0 = 裂到轴）`).toBeLessThan(0.5);
        expect(rows[i].gap, `${t.en} 两片台净空`).toBeGreaterThan(6);
      } else if (t.t > 0 && t.t < 0.8) {
        expect(rows[i].seamMinX, `${t.en} 缝深`).toBeGreaterThan(5);
      }
      if (t.level === 0) expect(t.t).toBe(0);
    }
  });

  it('阵列格距与取景不用重排：全程峰值不超过平档最紧值', { timeout: 300_000 }, () => {
    const pk = Math.max(...run().map((r) => r.peak));
    expect(pk, '全程峰值挑出').toBeLessThan(SQUARE.RADIUS + SQUARE_PEAK[SQUARE_PEAK.length - 1]);
  });

  it('【如实带着】全程对位：终态齐平，成形中段不齐——按实测钉住', { timeout: 300_000 }, () => {
    const rows = run();
    const spread = CK.map((_, i) => Math.max(...rows.map((r) => r.align[i])) - Math.min(...rows.map((r) => r.align[i])));
    // 终态 4.5px（平档 0.1、四次循环那版 2.2）：十条引擎各自的重力落位差，候选池里
    // 任何组合都在 4.0–4.7 之间——不是配置问题，是级别多了。按实测钉住。
    expect(spread[CK.length - 1], '终态').toBeLessThan(6);
    expect(spread[4], 'step 1000').toBeLessThan(6);
    // 成形中段（step 400/550）峰值 18.8px：裂开那一端的边 L8 成形最慢（那一档的缝心
    // 在 step 400 比别人低 19px）。守门钉住：谁把它改差了这条会红，改好了也该来改这条。
    expect(Math.max(...spread), '全程峰值散布').toBeLessThan(25);
    expect(Math.max(...spread), '全程峰值散布（钉住，别悄悄变差）').toBeGreaterThan(10);
  });
});
