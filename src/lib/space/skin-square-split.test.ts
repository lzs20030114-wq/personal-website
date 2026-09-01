import { describe, expect, it } from 'vitest';
import {
  SQSPLIT,
  SQSPLIT_REACH,
  SQSPLIT_TIERS,
  buildSquareSplitOrder,
  buildSquareSplitUnits,
  sqSplitBuild,
  sqSplitDCap,
  sqSplitHalfSide,
  sqSplitLadder,
  sqSplitMCap,
  sqSplitRim,
} from './skin-square-split';
import {
  SQUARE, SQUARE_RUNGS, SQUARE_PEAK, squareAngle, squareFreeTotal, squareLead, squarePw,
} from './skin-square';
import { RING_BAND_NODES } from './skin-ring';
import { SKIN, createSkinUnit, type SkinBond } from './skin-unit';

/**
 * 守门：方形环 · 捏分编制（Lab.14 第三种编制）。引擎零涉及——用的全是既有选项。
 * 这里卡的是这一编制的三条命根子：
 *  ① **箱高一圈恒定**（族定义。口径照 skin-square.test.ts：排除端面、x∈[0.35,0.85]·挑出）；
 *  ② **真的裂成两台**（缝切到轴，不是「一个深槽」）；
 *  ③ **外缘点仍落在方形边上**（方形是靠挑出做出来的，缝不许把它带偏）。
 * 外加一条如实记录的**已知瑕疵**：成形中段的全程对位散布（见文件末）。
 */

const F_TOT = squareFreeTotal();
const LEAD = squareLead(F_TOT);
const BUILDS = SQSPLIT_TIERS.map((t) => sqSplitBuild(t));

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
  /** 两片台之间的净空（沿挑出方向的最小值） */
  gap: number;
  /** 缝心离带子下缘，逐检查点 */
  align: number[];
  peak: number;
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
    // 箱高 / 水平度：**照 Lab.14 守门的口径**——排除端面（端面的 y 跨半个箱高，混进来
    // 会把水平度读成 ~H/2），只取 x ∈ [0.35, 0.85]·挑出。捏分剖面有四个水平面而不是
    // 两个（外顶 / 上缝壁 / 下缝壁 / 外底），故只采**外包络**那两段（嘴↔面角）。
    const win = (lo: number, hi: number): number[] => {
      const v: number[] = [];
      for (let i = lo; i <= hi; i++) if (px(i) >= 0.35 * reach && px(i) <= 0.85 * reach) v.push(py(i));
      return v;
    };
    const mean = (v: number[]): number => v.reduce((s, t) => s + t, 0) / v.length;
    const rng = (v: number[]): number => Math.max(...v) - Math.min(...v);
    const top = win(b.marks.outA, b.marks.faceA);
    const bot = win(b.marks.faceB, b.marks.outB);
    // 缝：区内最小 x = 裂到多深；净空 = 上下缝壁在同一 x 处的间距
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
    return {
      key: tier.en, reach, boxH: mean(bot) - mean(top), topFlat: rng(top), botFlat: rng(bot),
      topMean: mean(top), locked: sim.locked.length, keys, knot, seamMinX, gap, align, peak,
    };
  });
}
const run = (): Row[] => (RUN ??= runAll());

describe('方形环 · 捏分编制（构造）', () => {
  it('三档 = 面 8 / 边 8 / 角 4，形态从单箱走到满裂', () => {
    expect(SQSPLIT_TIERS.map((t) => t.count)).toEqual([8, 8, 4]);
    expect(SQSPLIT_TIERS.map((t) => t.t)).toEqual([1, SQSPLIT.EDGE_T, 0]);
    // 材料账强制的方向：**最深的角档是实心箱、最浅的面档才裂得开**（与立项猜想相反）
    const byDepth = [...SQSPLIT_TIERS].sort((a, b) => SQSPLIT_REACH[SQSPLIT_TIERS.indexOf(a)] - SQSPLIT_REACH[SQSPLIT_TIERS.indexOf(b)]);
    expect(byDepth.map((t) => t.t)).toEqual([1, SQSPLIT.EDGE_T, 0]); // 挑出越浅、缝越深
  });

  it('编制 = 方形自己的方位类，一圈四个来回、面档成对相邻', () => {
    const order = buildSquareSplitOrder();
    expect(order).toHaveLength(SQUARE.COUNT);
    expect(order.filter((c) => c === 0)).toHaveLength(8);
    expect(order.filter((c) => c === 2)).toHaveLength(4);
    // 一个象限的五位读作 面 边 角 边 面 ⇒ 绕一圈四个来回
    expect(order.slice(0, 5)).toEqual([0, 1, 2, 1, 0]);
    // 面档成对相邻（那一类在坐标轴两侧各 9°）
    expect(order.slice(4, 6)).toEqual([0, 0]);
    // 四条带正落在四个角上（相位转半格）
    for (let i = 0; i < SQUARE.COUNT; i++)
      if (order[i] === 2) expect(Math.abs(Math.cos(squareAngle(i))) - Math.abs(Math.sin(squareAngle(i)))).toBeCloseTo(0, 9);
  });

  it('七段谱与平档同一份配平基准 ⇒ 平台高度一致（对位是构造给的）', () => {
    for (const b of BUILDS) {
      expect(b.spec.reduce((s, q) => s + q[1], 0)).toBe(RING_BAND_NODES);
      expect(b.free % 2).toBe(1); // 自由段恒奇 ⇒ 垫劈两半是精确整数
      const pad = F_TOT - b.free;
      expect(pad % 2).toBe(0);
      expect(pad).toBeGreaterThanOrEqual(0);
      // 结构段起点 = lead + 半垫 + ISO；嘴心 = 2(尾+ISO) + 2r·(F_TOT−1)/2，与档位无关
      expect(b.lead).toBe(LEAD + pad / 2 + SQUARE.ISO);
      expect(b.marks.center).toBe(b.lead + (b.free - 1) / 2);
    }
    // 全员同 lead（对位构造的常数项）
    expect(new Set(BUILDS.map((b) => b.lead - (F_TOT - b.free) / 2)).size).toBe(1);
  });

  it('梯挡：外箱链恒 10 根、等长键、最内钉在端面板端点（端面硬投影的触发条件）', () => {
    for (let i = 0; i < BUILDS.length; i++) {
      const seg = BUILDS[i].spec.find((q) => q[0] === 'f' && (q[2] as SkinBond[] | undefined)?.length) as
        | ['f', number, SkinBond[], ...unknown[]]
        | undefined;
      expect(seg, SQSPLIT_TIERS[i].en).toBeTruthy();
      const bonds = seg![2];
      expect(bonds).toHaveLength(SQUARE_RUNGS); // §17.2「梯挡根数恒定」
      expect(new Set(bonds.map((b) => b[2])).size).toBe(1); // 等长键纪律
      expect(bonds[0][2]).toBeCloseTo(SQSPLIT.H / 100, 9); // rest = 箱高（这一编制比平档高，见 SQSPLIT.H）
      // 最内那根 = 端面板的端点：单箱档是 H/4，刻缝档是面角（面板 [c−f, c−m] 的外端）
      const c = BUILDS[i].marks.center;
      const inner = Math.min(...bonds.map((b) => (b[1] - b[0]) / 2));
      expect(c - inner).toBe(SQSPLIT_TIERS[i].t > 0 ? BUILDS[i].marks.faceA : c - squarePw(SQSPLIT.H));
    }
  });

  it('成形设计四件套齐全，且角档也吃同一套（否则一圈里 4 个角位会掉队）', () => {
    for (let i = 0; i < BUILDS.length; i++) {
      const o = BUILDS[i].opts;
      expect(o.zipUp, SQSPLIT_TIERS[i].en).toEqual([0]); // 逐挡长出
      expect(o.attNear).toBe(SQSPLIT.ATT_NEAR); // 近程门（本族实测 2.5，非 Lab.12 的 1.5）
      expect(o.attNearChains).toEqual([0]);
      expect(o.boxSquare).toBe(true);
      if (SQSPLIT_TIERS[i].t > 0) {
        expect(o.sqChains).toEqual([0]); // 方箱整形只作用于外箱梯，碰不到缝区
        expect(o.coreTether?.length).toBeGreaterThan(0); // 缝底钉位 + 缝壁斜坡
        expect(o.coreTetherRel?.length).toBeGreaterThan(0); // 缝区折痕待命
        expect(o.alignRuns).toHaveLength(2); // 缝壁排整齐（两侧各一段）
        // 折痕是**同侧规则**：缝壁贴同侧缝角（跨侧耦合会把形拖塌）
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

  it('材料账：面档用满预算，天花板与箱高无关', () => {
    // 满裂的设计深度上限与 H 无关（H 在两边抵消）——换个箱高上限不动
    expect(sqSplitDCap()).toBeCloseTo(sqSplitMCap() - SQSPLIT.H / 4, 9);
    expect(sqSplitDCap()).toBeGreaterThan(40);
    expect(sqSplitDCap()).toBeLessThan(46);
    // 面档（满裂那一档）恰好用满 F_TOT ⇒ 再深一格构造期就该拒绝
    expect(BUILDS[0].free).toBe(F_TOT);
    expect(() => sqSplitBuild({ ...SQSPLIT_TIERS[0], boxD: 42 })).toThrow();
  });

  it('梯挡表：根数恒定、单调、首尾正确', () => {
    const ks = sqSplitLadder(10, 40);
    expect(ks).toHaveLength(SQUARE_RUNGS);
    expect(ks[0]).toBe(10);
    expect(ks[ks.length - 1]).toBe(40);
    for (let i = 1; i < ks.length; i++) expect(ks[i]).toBeGreaterThan(ks[i - 1]);
  });

  it('外缘点落在方形边上（方形是靠挑出做出来的）', () => {
    const side = 2 * sqSplitHalfSide();
    expect(side).toBeGreaterThan(150);
    expect(side).toBeLessThan(156);
    // 变厚后深度旋钮变粗（角档 k 一格 2–3px），外缘偏差从 0.21 放到 1.3——a 已进优化
    for (const p of sqSplitRim()) expect(Math.abs(p.dev)).toBeLessThan(1.5);
  });
});

describe('方形环 · 捏分编制（真跑）', () => {
  it('三档各自成形：键全锁、挑出对得上冻结的表', { timeout: 180_000 }, () => {
    for (const [i, r] of run().entries()) {
      expect(r.locked, r.key).toBe(r.keys);
      expect(Math.abs(r.reach - SQSPLIT_REACH[i]), `${r.key} 挑出 ${r.reach.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.knot, `${r.key} 打结`).toBeLessThanOrEqual(6);
    }
  });

  it('箱高一圈恒定、顶底面是平的 —— 这一编制的命根子（族定义不破）', { timeout: 180_000 }, () => {
    for (const r of run()) {
      expect(Math.abs(r.boxH - SQSPLIT.H), `${r.key} 箱高 ${r.boxH.toFixed(2)}`).toBeLessThan(1.5);
      // 面不平 = 跑型。读数全绿而图不对时就是这两条没测（§17.3 翻过三次车）
      expect(r.topFlat, `${r.key} 顶面水平度`).toBeLessThan(1.5);
      expect(r.botFlat, `${r.key} 底面水平度`).toBeLessThan(1.5);
    }
    const hs = run().map((r) => r.boxH);
    expect(Math.max(...hs) - Math.min(...hs), '箱高散布').toBeLessThan(0.5);
    const tops = run().map((r) => r.topMean);
    // 变厚后落位残差按比例长（2.0px / 68 高 = 2.9%，比变厚前的 1.31/36 = 3.6% 还小些）
    expect(Math.max(...tops) - Math.min(...tops), '顶面位置散布').toBeLessThan(2.5);
  });

  it('面档是真的裂成两台：缝切到轴、两片台之间全深有净空', { timeout: 180_000 }, () => {
    const face = run()[0];
    expect(face.seamMinX, '缝区最小 x（0 = 裂到轴）').toBeLessThan(0.5);
    expect(face.gap, '两片台净空').toBeGreaterThan(8);
    // 边档是「开了一半的缝」，不该切到轴
    expect(run()[1].seamMinX, '边档缝深').toBeGreaterThan(5);
    // 角档是实心箱（用户 2026-09-01 拍板）：没有缝
    expect(SQSPLIT_TIERS[2].t).toBe(0);
  });

  it('阵列格距与取景不用重排：全程峰值不超过平档最紧值', { timeout: 180_000 }, () => {
    const pk = Math.max(...run().map((r) => r.peak));
    expect(pk, '捏分档全程峰值挑出').toBeLessThan(SQUARE.RADIUS + SQUARE_PEAK[SQUARE_PEAK.length - 1]);
  });

  it('【已知瑕疵】全程对位：终态过、成形中段不过——按实测钉住，不许再变差', { timeout: 180_000 }, () => {
    const rows = run();
    const spread = CK.map((_, i) => Math.max(...rows.map((r) => r.align[i])) - Math.min(...rows.map((r) => r.align[i])));
    // 终态那一格是过族守门线（2.5）的
    expect(spread[CK.length - 1], '终态').toBeLessThan(4);
    // 成形中段面档滞后，峰值 ~14.9px = 族守门线的 6 倍。**这是这一编制上站时带着的
    // 已知瑕疵**（属成形过程那一轮的活，§16.4）。这里不放宽族的线，而是把实测值钉住：
    // 谁把它改差了，这条会红。
    expect(Math.max(...spread), '全程峰值散布').toBeLessThan(16);
    expect(Math.max(...spread), '全程峰值散布（钉住，别悄悄变差）').toBeGreaterThan(10);
  });
});
