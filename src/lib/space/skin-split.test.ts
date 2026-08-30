import { beforeAll, describe, expect, it } from 'vitest';
import {
  SPLIT_BUF,
  SPLIT_DEPTH,
  SPLIT_LOBE,
  SPLIT_T,
  SPLIT_TAIL,
  SPLIT_TOTAL,
  SPLIT_FREE_TOTAL,
  SPLIT_LEAD_A,
  SPLIT_LEAD_B,
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
  d.spec[3] as readonly ['f', number, readonly SkinBond[], readonly SkinPanel[], readonly (readonly SkinBond[])[]];
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
  /** 逐检查点：缝心离带子下缘的高度（px）——居中对齐的全程判据 */
  centerAbove: number[];
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
    const centerAbove: number[] = [];
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
      if (FRAMES.includes(k + 1)) {
        frames.push(snap());
        centerAbove.push((s.py[lv.marks.center] - s.py[s.n - 1]) * 100);
      }
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
      centerAbove,
    };
  });
}

describe('skin-split 捏分过渡', () => {
  beforeAll(() => {
    RUN = runAll();
  }, 120_000);

  it('对位构造 v4：七段谱、半垫对称配平（缝心全程逐级恒等的构造保证）', () => {
    expect(LV.length).toBe(SPLIT_T.length);
    for (const d of LV) {
      // 七段谱：[杆帽 | 半垫 | 隔离 | 结构 | 隔离 | 半垫 | 尾段]——配平垫劈成
      // 相等两半放结构两侧 ⇒ 缝心 = 两贴合锚中点 = 138 + 114r px，与级别无关
      expect(d.spec.map((s) => s[0])).toEqual(['g', 'f', 'g', 'f', 'g', 'f', 'g']);
      expect(d.spec[0][1]).toBe(SPLIT_LEAD_A);
      expect(d.spec[2][1], `L${d.i} 上隔离`).toBe(SPLIT_LEAD_B);
      expect(d.spec[4][1], `L${d.i} 下隔离`).toBe(SPLIT_LEAD_B);
      expect(SPLIT_LEAD_B, '隔离下限 = 全局约束最大跨距').toBeGreaterThanOrEqual(16);
      expect(d.spec[6][1], `L${d.i} 尾段`).toBe(SPLIT_TAIL);
      // 两半垫精确相等（free 恒奇 ⇒ 107−free 恒偶，零取整误差）
      expect(d.spec[1][1], `L${d.i} 半垫`).toBe(d.spec[5][1]);
      // 带缘齐平的充要条件照旧：贴合总量与自由总量都全员同值
      expect(d.spec[1][1] + d.spec[5][1] + d.free, `L${d.i} 自由总量`).toBe(SPLIT_FREE_TOTAL);
      expect(
        SPLIT_LEAD_A + d.spec[1][1] + SPLIT_LEAD_B + d.free + SPLIT_LEAD_B + d.spec[5][1] + SPLIT_TAIL,
      ).toBe(SPLIT_TOTAL);
      // 配平垫无键（纯富余材料，rootHug+均匀排布收拾在杆上）
      expect((d.spec[1] as readonly ['f', number, readonly SkinBond[]])[2].length).toBe(0);
      expect((d.spec[5] as readonly ['f', number, readonly SkinBond[]])[2].length).toBe(0);
      // 结构自由段两端缓冲恒 SPLIT_BUF（逐级定案的动力学环境，一字不动）
      let lo = d.free;
      let hi = 0;
      for (const [i, j] of allBonds(d)) {
        lo = Math.min(lo, i);
        hi = Math.max(hi, j);
      }
      expect(lo, `L${d.i} 上缓冲`).toBe(SPLIT_BUF);
      expect(d.free - 1 - hi, `L${d.i} 下缓冲`).toBe(SPLIT_BUF);
      // 结构居中在自己的自由段上
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
    // 阈值 = B v3 定稿实测（0.29 / 0.46 / 0.98 / 0.87 / 1.56 / 2.00 / 2.87 / 3.42 /
    // 3.72 / 1.42），各留 ~1px 余量。缝壁排整齐后全面比 08-29 定案更贴目标线
    // （旧 0.29–5.54，深缝级偏大的主因就是壁纹——目标线的缝壁本来是直的）。
    const CAP = [1.3, 1.5, 2.0, 1.9, 2.6, 3.0, 3.9, 4.4, 4.7, 2.4];
    RUN.forEach((r) => {
      expect(r.silD, `L${r.lv.i} 剪影Δ`).toBeLessThan(CAP[r.lv.i]);
      // 裂口尖落在目标退距上（这一族的主特征）——实测七级精确命中，
      // L4/L5/L6 各差 0.5/1.9/0.0px（缝料配平的残余，形上读不出来）
      expect(Math.abs(r.tipX - (SPLIT_DEPTH - splitSink(r.lv.t))), `L${r.lv.i} 尖`).toBeLessThan(2.5);
    });
  });

  it('读得出是「两台对称拉开」：缝宽单调张开，缝心全程居中（v4 居中对齐）', () => {
    // 缝宽（两缝角间距）单调增——L0 无缝，从 L1 起算
    const seam = RUN.slice(1).map((r) => r.seam);
    for (let i = 1; i < seam.length; i++) expect(seam[i], `级 ${i + 1} 缝宽`).toBeGreaterThan(seam[i - 1]);
    expect(seam[seam.length - 1]).toBeCloseTo(28, -0.5); // 终态缝 = 定版 28
    // **居中对齐是全程量**（§15.11 教训）：缝心离下缘在每个检查点上跨级散布
    // 有界。构造保证 = 缝心恒在两贴合锚中点（138+114r）；残差是折叠体在自身
    // 松弛区间里的重力落位差（形态量），实测早期 1.7 / 成形波峰 5.5 / 终态 3.3px
    // ——对比 v3 底边齐平口径下缝心系统性差 ~14px（= 缝宽/2）。
    RUN[0].centerAbove.forEach((_, f) => {
      const cs = RUN.map((r) => r.centerAbove[f]);
      expect(Math.max(...cs) - Math.min(...cs), `检查点 ${f} 缝心散布`).toBeLessThan(6.5);
    });
    // 对称张开：顶边逐级抬升、底边逐级下降（两台被对称推开，各 ~缝/2）
    const top = RUN.map((r) => r.topAbove);
    const bot = RUN.map((r) => r.botAbove);
    for (let i = 1; i < top.length; i++) expect(top[i], `级 ${i} 顶边`).toBeGreaterThan(top[i - 1] - 1.2);
    for (let i = 1; i < bot.length; i++) expect(bot[i], `级 ${i} 底边`).toBeLessThan(bot[i - 1] + 1.2);
    expect(top[top.length - 1] - top[0]).toBeGreaterThan(10);
    expect(bot[0] - bot[bot.length - 1]).toBeGreaterThan(10);
  });


  it('成形收尾有序，且芯长全程逐级相等（顶端齐平的构造保证）', () => {
    // B v3 逐挡生长（zipUp）下各级从 ~240 步起持续长箱，这里卡的是**收尾**：
    // ① L9（裂到轴，最难折）最后合拢、窗口有界、近乎单调——整排是一次
    //    连贯的动作，不是乱序乱响；② r 全员同步 + 三段构造全员同值 ⇒ 芯长
    //    处处相等（构造性质，第一条守门已卡三段；这里卡因果链的另一端：
    //    完成步都在同一协议段内，且每级都真的走完）。
    const steps = RUN.map((r) => r.doneStep);
    for (const st of steps) expect(st).toBeGreaterThan(0); // 每级都真的走完拉链
    expect(Math.max(...steps), '最晚完成').toBe(steps[9]); // 裂到轴的 L9 收尾
    expect(Math.max(...steps) - Math.min(...steps), '级联窗口（步）').toBeLessThanOrEqual(170);
    // 近乎单调：允许小逆序（自然时刻 L1/L2、L7/L8 各差 ~20 步），大逆序 = 乱响
    for (let i = 1; i < steps.length; i++)
      expect(steps[i], `L${i - 1}→L${i} 级联序`).toBeGreaterThan(steps[i - 1] - 40);
  });

  it('成形过程设计（B v3）：四件套配置齐全且同侧/区段正确', () => {
    for (const d of LV) {
      // 逐挡长出 + 近程门（全员，含 L0 单箱）
      expect(d.opts.zipUp, `L${d.i} zipUp`).toEqual([0]);
      expect(d.opts.attNear, `L${d.i} attNear`).toBe(1.5);
      expect(d.opts.attNearChains, `L${d.i} attNearChains`).toEqual([0]);
      if (d.i === 0) {
        expect(d.opts.coreTetherRel).toBeUndefined();
        expect(d.opts.alignRuns).toBeUndefined();
        continue;
      }
      // 折痕**同侧规则**：缝壁贴同侧缝角、缝心贴双角（跨侧耦合会把 L5 拖塌）
      const c = d.marks.center;
      for (const [i, ref, off] of d.opts.coreTetherRel ?? []) {
        expect(off, `L${d.i} 折痕偏移`).toBe(0);
        if (i < c) expect(ref, `L${d.i} 节点 ${i} 折痕参考`).toBe(d.marks.mouthA);
        else if (i > c) expect(ref).toBe(d.marks.mouthB);
        else expect([d.marks.mouthA, d.marks.mouthB]).toContain(ref);
      }
      // 缝壁排整齐：两条 run 的外锚 = 缝角、内锚对称于缝心（锯齿的治法）
      const runs = d.opts.alignRuns ?? [];
      expect(runs.length, `L${d.i} alignRuns`).toBe(2);
      expect(runs[0][0]).toBe(d.marks.mouthA);
      expect(runs[1][1]).toBe(d.marks.mouthB);
      expect(runs[0][1] - c, `L${d.i} 缝底角对称`).toBe(-(runs[1][0] - c));
    }
  });

  it('成形期不打结：自交只剩织物褶皱（几十节的死结是看得见的事故）', () => {
    // 判据要看**环的规模**不是个数：35/42 节 = L4/L5 早先那种肉眼可见的死结。
    // B v3（缝壁排整齐）后密采样全程为 0——褶皱环也随锯齿一起消失，收紧到 2。
    for (const r of RUN) expect(r.knotSpan, `L${r.lv.i} 最大环（节）`).toBeLessThanOrEqual(2);
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
      // B v3 逐挡生长下整排全程都比旧动态连贯（实测各检查点最大 5.40 / 4.54 /
      // 3.55 / 4.11 / 4.11，旧同步全锁的峰值是 13.6）——上限各留一点余量
      const cap = f < 2 ? 7 : 5.2;
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
