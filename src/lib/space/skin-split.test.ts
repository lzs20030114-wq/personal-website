import { beforeAll, describe, expect, it } from 'vitest';
import {
  SPLIT_BUF,
  SPLIT_DEPTH,
  SPLIT_LOBE,
  SPLIT_T,
  SPLIT_TAIL,
  SPLIT_TOTAL,
  splitLead,
  buildSplitLevels,
  silhouette,
  splitSeamW,
  splitSilhouetteDelta,
  splitSink,
} from './skin-split';
import { SKIN, createSkinUnit, type SkinBond, type SkinPanel } from './skin-unit';

/**
 * 守门：捏分过渡十级（单箱 → 两台，用户 2026-08-27 立项、2026-08-29 逐级定案）。
 *
 * 卡的是这一族「为什么成立」的三层：
 * ① **硬机制的触发条件**——面板端点必须是某根键的端点，否则端面硬投影**静默
 *    失效**、形态回到软平衡的圆团（§16 硬机制审计的第一推论，本族的命门）；
 * ② **对位构造**——尾段与缓冲全员同值 ⇒ 底边全程齐平，顶边按缝宽张开；
 * ③ **形**——剪影Δ 是唯一有效分数（尖/深/缝/锁四项全对而形全错，本项目已发生
 *    四次），另加相邻级距离无断层（过渡系列的命门，Lab.08 当初就栽在这）。
 */

const LV = buildSplitLevels();

const segOf = (d: (typeof LV)[number]) =>
  d.spec[1] as readonly ['f', number, readonly SkinBond[], readonly SkinPanel[], readonly (readonly SkinBond[])[]];
const bondsOf = (d: (typeof LV)[number]): readonly SkinBond[] => segOf(d)[2];
const panelsOf = (d: (typeof LV)[number]): readonly SkinPanel[] => segOf(d)[3] ?? [];
const extraOf = (d: (typeof LV)[number]): readonly (readonly SkinBond[])[] => segOf(d)[4] ?? [];
/** 该级全部键（主链 + 附加链），用来验面板端点 */
const allBonds = (d: (typeof LV)[number]): SkinBond[] => [...bondsOf(d), ...extraOf(d).flat()];

/** 十级各跑满 1500 步，约 14s——一次算好给下面几个用例共用 */
interface Row {
  lv: (typeof LV)[number];
  locked: number;
  total: number;
  /** 自由段终态剖面（以缝心为 y 原点，世界 px） */
  prof: [number, number][];
  silD: number;
  /** 结构（离轴部分）的上/下缘离带子下缘的高度 */
  botAbove: number;
  topAbove: number;
  tipX: number;
  seam: number;
  finite: boolean;
  /** 拉链走完（全部键锁上）的步 —— 十级要对齐，否则一排里一半成形一半还是直带子 */
  doneStep: number;
  /** 成形期自交的最大环（夹住的节数）：≤6 节 = 织物褶皱；几十节 = 肉眼可见的死结 */
  knotSpan: number;
  /** 检查点剖面（全程连续性判据用） */
  frames: [number, number][][];
}
let RUN: Row[] = [];
/** 全程检查点（成形前 / 成形中 / 锁定后 / 终态附近） */
const FRAMES = [300, 500, 700, 900, 1200];
/** 自交的最大环：夹住的节数 */
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
function runAll(): Row[] {
  return LV.map((lv) => {
    const s = createSkinUnit(lv.spec, lv.opts);
    const tot0 = s.chains.reduce((a, c) => a + c.length, 0);
    const frames: [number, number][][] = [];
    let doneStep = 0;
    let knot = 0;
    const snap = (): [number, number][] => {
      const cy0 = -s.py[lv.marks.center] * 100;
      const o: [number, number][] = [];
      for (let i = lv.lead; i < lv.lead + lv.free; i++) o.push([s.px[i] * 100, -s.py[i] * 100 - cy0]);
      return o;
    };
    for (let k = 0; k < SKIN.STEPS; k++) {
      s.advance();
      if (!doneStep && s.locked.length === tot0) doneStep = k + 1;
      if (FRAMES.includes(k + 1)) frames.push(snap());
      // 打结是瞬态：密采样才抓得住（稀采样漏过一次，差点当成没有）
      if ((k + 1) % 50 === 0 && k + 1 <= 1000) knot = Math.max(knot, knotSpan(snap()));
    }
    const px = (i: number) => s.px[i] * 100;
    const py = (i: number) => -s.py[i] * 100;
    const foot = py(s.n - 1);
    const cy = py(lv.marks.center);
    const prof: [number, number][] = [];
    let bot = -Infinity;
    let top = Infinity;
    let finite = true;
    for (let i = lv.lead; i < lv.lead + lv.free; i++) {
      prof.push([px(i), py(i) - cy]);
      if (!Number.isFinite(px(i)) || !Number.isFinite(py(i))) finite = false;
      if (px(i) > 5) {
        bot = Math.max(bot, py(i));
        top = Math.min(top, py(i));
      }
    }
    let total = 0;
    for (const ch of s.chains) total += ch.length;
    return {
      lv,
      locked: s.locked.length,
      total,
      prof,
      silD: splitSilhouetteDelta(prof, lv.t),
      botAbove: foot - bot,
      topAbove: foot - top,
      tipX: px(lv.marks.center),
      seam: Math.abs(py(lv.marks.mouthB) - py(lv.marks.mouthA)),
      finite,
      doneStep,
      knotSpan: knot,
      frames,
    };
  });
}

describe('skin-split 捏分过渡', () => {
  beforeAll(() => {
    RUN = runAll();
  }, 120_000);

  it('对位构造：三段之和恒定、尾段与缓冲全员同值（底边齐平的全部条件）', () => {
    expect(LV.length).toBe(SPLIT_T.length);
    for (const d of LV) {
      expect(d.spec.map((s) => s[0])).toEqual(['g', 'f', 'g']);
      expect(d.spec[0][1]).toBe(d.lead);
      expect(d.spec[1][1]).toBe(d.free);
      expect(d.spec[2][1], `L${d.i} 尾段`).toBe(SPLIT_TAIL);
      // 带总长全员同值 = 并拢排布下十片落位对齐的前提（台架按末节点对位）
      expect(d.lead).toBe(splitLead(d.free));
      expect(d.lead + d.free + SPLIT_TAIL).toBe(SPLIT_TOTAL);
      // 两端缓冲恒 SPLIT_BUF：交接件纪律的下限，也是「下缓冲全员同值」的那一项
      let lo = d.free;
      let hi = 0;
      for (const [i, j] of allBonds(d)) {
        lo = Math.min(lo, i);
        hi = Math.max(hi, j);
      }
      expect(lo, `L${d.i} 上缓冲`).toBe(SPLIT_BUF);
      expect(d.free - 1 - hi, `L${d.i} 下缓冲`).toBe(SPLIT_BUF);
      // 结构居中在自由段上（缝心 = 正中）
      expect(d.marks.center - d.lead).toBe((d.free - 1) / 2);
    }
  });

  it('硬机制的触发条件：每块面板的两个端点都是一根键的端点（否则端面硬投影静默失效）', () => {
    for (const d of LV) {
      const key = new Set(allBonds(d).map(([i, j]) => `${i}-${j}`));
      const panels = panelsOf(d);
      expect(panels.length, `L${d.i} 面板数`).toBe(d.i === 0 ? 1 : 3);
      for (const [a, b] of panels) expect(key.has(`${a}-${b}`), `L${d.i} 面板 ${a}-${b} 无对应键`).toBe(true);
    }
  });

  it('键谱纪律：外箱等长键 + 缝链键长嘴→底不增 + 面角键 = 台高', () => {
    for (const d of LV) {
      // 外箱梯：等长键（方形来自「等长约束下富余被拉平」——目录纪律）
      const rb = bondsOf(d).map((b) => b[2]);
      for (const v of rb) expect(v, `L${d.i} 外箱键长`).toBeCloseTo(rb[0], 12);
      // 扇形一步不缺：跨度等差（步长 2 节 = fan 的密度），拉链顺序由 buildUnit 重排
      const span = bondsOf(d).map(([i, j]) => j - i);
      for (let k = 1; k < span.length; k++) expect(span[k] - span[k - 1], `L${d.i} 外箱跨度`).toBe(4);
      if (d.i === 0) continue;
      const [crack, faceUp, faceDn] = extraOf(d);
      // 缝链：嘴键最宽、底键最窄，中间等长壁键
      const cs = crack.map((b) => b[2]);
      for (let k = 1; k < cs.length; k++) expect(cs[k], `L${d.i} 缝链键长`).toBeLessThanOrEqual(cs[k - 1] + 1e-12);
      expect(cs[0] * 100, `L${d.i} 缝嘴`).toBeCloseTo(splitSeamW(d.t), 9);
      // 面角同侧键：rest = 台高（一根键激活垂直化 + 面板锁定 + 端面硬投影）
      for (const ch of [faceUp, faceDn]) {
        expect(ch.length).toBe(1);
        expect(ch[0][2] * 100, `L${d.i} 面角键`).toBeCloseTo(SPLIT_LOBE, 9);
      }
    }
  });

  it('boxSquare 作用域：整形只给外箱链，缝链至多只吃找平（嘴角贴轴会把缝角拉回轴）', () => {
    for (const d of LV) {
      if (d.i === 0) {
        expect(d.opts.sqChains).toBeUndefined(); // 单箱只有一条链，全套即可
        continue;
      }
      expect(d.opts.sqChains, `L${d.i}`).toEqual([0]);
      if (d.opts.levelChains) expect(d.opts.levelChains, `L${d.i}`).toEqual([1]);
    }
  });

  it('皮-芯键：只钉缝底（+ 斜坡壁），半径自底向嘴不减且不越出台深', () => {
    for (const d of LV) {
      if (d.i === 0) {
        expect(d.opts.coreTether).toBeUndefined();
        continue;
      }
      const tie = d.opts.coreTether!;
      expect(tie.length).toBeGreaterThan(0);
      const rTip = (SPLIT_DEPTH - splitSink(d.t)) / 100;
      for (const [node, r] of tie) {
        expect(r, `L${d.i} 限位半径`).toBeGreaterThanOrEqual(rTip - 1e-12);
        expect(r, `L${d.i} 限位不得越出台深`).toBeLessThanOrEqual(SPLIT_DEPTH / 100 + 1e-12);
        // 离缝心越远、限位越松（斜坡朝嘴张开）
        const k = Math.abs(node - d.marks.center);
        const same = tie.filter(([n]) => Math.abs(n - d.marks.center) === k);
        for (const [, r2] of same) expect(r2).toBeCloseTo(r, 12);
      }
      expect(tie.some(([n]) => n === d.marks.center)).toBe(true);
    }
  });

  it('十级都真的锁定成形，无 NaN', () => {
    for (const r of RUN) {
      expect(r.locked, `L${r.lv.i} 全锁`).toBe(r.total);
      expect(r.finite, `L${r.lv.i} 有限`).toBe(true);
    }
  });

  it('形对得上目标线：逐级剪影Δ 在阈值内（唯一有效的形状分数）', () => {
    // 阈值 = 定案实测（0.33 / 0.48 / 0.88 / 0.88 / 1.29 / 2.93 / 3.25 / 4.77 / 5.54 / 4.38）
    // 各留 ~1px 余量。深缝级偏大是引擎本性（±2px 织物波纹 + 嘴角圆化），不是缺陷。
    const CAP = [1.4, 1.5, 1.9, 1.9, 2.3, 4.0, 4.3, 5.8, 6.6, 5.4];
    RUN.forEach((r) => {
      expect(r.silD, `L${r.lv.i} 剪影Δ`).toBeLessThan(CAP[r.lv.i]);
      // 裂口尖落在目标退距上（这一族的主特征）——实测七级精确命中，
      // L4/L5/L6 各差 0.5/1.9/0.0px（缝料配平的残余，形上读不出来）
      expect(Math.abs(r.tipX - (SPLIT_DEPTH - splitSink(r.lv.t))), `L${r.lv.i} 尖`).toBeLessThan(2.5);
    });
  });

  it('读得出是「两台逐级拉开」：缝宽单调张开，底边全程齐平、顶边随缝抬升', () => {
    // 缝宽（两缝角间距）单调增——L0 无缝，从 L1 起算
    const seam = RUN.slice(1).map((r) => r.seam);
    for (let i = 1; i < seam.length; i++) expect(seam[i], `级 ${i + 1} 缝宽`).toBeGreaterThan(seam[i - 1]);
    expect(seam[seam.length - 1]).toBeCloseTo(28, -0.5); // 终态缝 = 定版 28
    // 对位：底边（下台的下缘）离带子下缘全员齐平——尾段与缓冲同值的直接后果
    const bot = RUN.map((r) => r.botAbove);
    // 实测 6.4px——尾段与缓冲同值把「结构底边离下缘」钉死，残差是各级折叠体
    // 自身的下垂差（形态量，不是放置误差）
    expect(Math.max(...bot) - Math.min(...bot), '底边散布').toBeLessThan(8);
    // 顶边（上台的上缘）逐级抬升，总抬升 ≈ 终态缝宽（= 上台被推开的距离）
    const top = RUN.map((r) => r.topAbove);
    for (let i = 1; i < top.length; i++) expect(top[i], `级 ${i} 顶边`).toBeGreaterThan(top[i - 1] - 0.5);
    expect(top[top.length - 1] - top[0]).toBeGreaterThan(20);
  });


  it('收缩全程都是连续渐变：成形时刻十级对齐（用户 2026-08-29「过程里也要平滑」）', () => {
    // 每级的拉链是「一瞬间全锁」，而这一瞬本来发生在各自不同的 r 上（实测 571→726 步）
    // ⇒ 一排里总有一段已成形、一段还是直带子，那道边界扫过整排就是断层。
    // 逐级 warp 把这一瞬搬到同一个 u（见 skin-split 的 LOCK_U/SYNC_U 推导）。
    const steps = RUN.map((r) => r.doneStep);
    for (const st of steps) expect(st).toBeGreaterThan(0); // 每级都真的走完拉链
    expect(Math.max(...steps) - Math.min(...steps), '成形时刻散布（步）').toBeLessThanOrEqual(30);
  });

  it('成形期不打结：自交只剩织物褶皱（几十节的死结是看得见的事故）', () => {
    // 判据要看**环的规模**不是个数：2–3 节 = 褶皱，绘图平滑就盖住了；
    // 35/42 节 = L4/L5 早先那种肉眼可见的死结（缝底料被裁太狠拽出来的）。
    for (const r of RUN) expect(r.knotSpan, `L${r.lv.i} 最大环（节）`).toBeLessThanOrEqual(6);
  });

  it('全程相邻连续：每个检查点上相邻级的形态距离都在一条带里', () => {
    const HALF = 45;
    const d = (a: Float64Array, b: Float64Array): number => {
      let s = 0;
      for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
      return s / a.length;
    };
    RUN[0].frames.forEach((_, f) => {
      const sil = RUN.map((r) => silhouette(r.frames[f], -HALF, HALF));
      const gaps = sil.slice(1).map((s, i) => d(sil[i], s));
      // 成形前形态尚未定形，带子宽一点；锁定后（第 3 个检查点起）收紧到 4px
      const cap = f < 2 ? 14 : 4;
      for (let i = 0; i < gaps.length; i++)
        expect(gaps[i], `检查点 ${f} 的 L${i}↔L${i + 1}`).toBeLessThan(cap);
    });
  });

  it('过渡没有断层：相邻级形态距离在带内，最大/最小 ≤2×', () => {
    const HALF = 40;
    const sil = RUN.map((r) => silhouette(r.prof, -HALF, HALF));
    const d = (a: Float64Array, b: Float64Array): number => {
      let s = 0;
      for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
      return s / a.length;
    };
    const gaps = sil.slice(1).map((s, i) => d(sil[i], s));
    for (const g of gaps) {
      expect(g, '这一级白给').toBeGreaterThan(1);
      expect(g, '断层').toBeLessThan(5);
    }
    // 实测 2.42–3.42（比值 1.42×）——比 Lab.08 定版（2.6×）与环上渐变（3.7×）都匀
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThanOrEqual(2);
  });
});
