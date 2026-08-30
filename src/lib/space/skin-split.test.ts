import { beforeAll, describe, expect, it } from 'vitest';
import {
  SPLIT_BUF,
  SPLIT_CLAMP,
  SPLIT_DEPTH,
  SPLIT_GAP,
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
  /** 外箱链各挡锁定的步号（成形顺滑守门：节拍真的把「同一步全锁」摊开了） */
  boxLockSteps: number[];
  /** 结构段每步最大位移的全程峰值（px；掐掉开局落位瞬态） */
  peakMove: number;
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
    // 外箱键按跨度甄别：箱扇最小跨 = 缝嘴跨 + 2·FACE_N（L0 无缝，全部键都是箱键）
    const boxMin = lv.i === 0 ? 0 : lv.marks.mouthB - lv.marks.mouthA + 12;
    const boxLockSteps: number[] = [];
    let prevLocked = 0;
    let peakMove = 0;
    const px0 = new Float64Array(s.n);
    const py0 = new Float64Array(s.n);
    const snap = (): [number, number][] => {
      const cy0 = -s.py[lv.marks.center] * 100;
      const o: [number, number][] = [];
      for (let i = lv.lead; i < lv.lead + lv.free; i++) o.push([s.px[i] * 100, -s.py[i] * 100 - cy0]);
      return o;
    };
    for (let k = 0; k < SKIN.STEPS; k++) {
      px0.set(s.px);
      py0.set(s.py);
      s.advance();
      if (k >= 30) {
        for (let i = lv.lead; i < lv.lead + lv.free; i++) {
          const d = Math.hypot(s.px[i] - px0[i], s.py[i] - py0[i]) * 100;
          if (d > peakMove) peakMove = d;
        }
      }
      for (let b = prevLocked; b < s.locked.length; b++)
        if (s.locked[b][1] - s.locked[b][0] >= boxMin) boxLockSteps.push(k + 1);
      prevLocked = s.locked.length;
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
      boxLockSteps,
      peakMove,
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
      // 五段谱：[杆帽贴合 | 配平垫 | 隔离贴合 | 结构自由段 | 尾段]
      expect(d.spec.map((s) => s[0])).toEqual(['g', 'f', 'g', 'f', 'g']);
      expect(d.spec[0][1]).toBe(SPLIT_LEAD_A);
      expect(d.spec[2][1], `L${d.i} 隔离贴合`).toBe(SPLIT_LEAD_B);
      expect(SPLIT_LEAD_B, '隔离下限 = 全局约束最大跨距').toBeGreaterThanOrEqual(16);
      expect(d.spec[4][1], `L${d.i} 尾段`).toBe(SPLIT_TAIL);
      // 「任何时刻整片齐平」的充要条件：贴合总量与自由材料总量都全员同值
      // ⇒ 芯长(r) = 贴合·2 + 自由·2r 在每个 r 上逐级相等
      expect(d.spec[1][1] + d.free, `L${d.i} 自由总量`).toBe(SPLIT_FREE_TOTAL);
      expect(SPLIT_LEAD_A + d.spec[1][1] + SPLIT_LEAD_B + d.free + SPLIT_TAIL).toBe(SPLIT_TOTAL);
      // 配平垫无键（纯富余材料，rootHug+均匀排布收拾在杆上）
      expect((d.spec[1] as readonly ['f', number, readonly SkinBond[]])[2].length).toBe(0);
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


  it('成形 = 从左到右的有序级联，且芯长全程逐级相等（顶端齐平的构造保证）', () => {
    // 自然时序（不 warp——warp 会让十级各走各的 r(t)，芯长中途就不齐，顶端出
    // ~37px 的瞬态阶梯；取舍实测见 skin-split 的成形时序注释）。卡两件事：
    // ① 级联有序：L9（裂到轴，最难折）最后完成，窗口有界——动作是一道传播的
    //    裂开，不是乱序乱响；② r 全员同步 + 三段构造全员同值 ⇒ 芯长处处相等
    //    （构造性质，第一条守门已卡三段；这里再卡因果链的另一端：完成步都在
    //    同一协议段内，且每级都真的走完）。
    const steps = RUN.map((r) => r.doneStep);
    for (const st of steps) expect(st).toBeGreaterThan(0); // 每级都真的走完拉链
    expect(Math.max(...steps), '最晚完成').toBe(steps[9]); // 裂到轴的 L9 收尾
    expect(Math.max(...steps) - Math.min(...steps), '级联窗口（步）').toBeLessThanOrEqual(170);
    // 近乎单调：允许小逆序（自然时刻 L1/L2、L7/L8 各差 ~20 步），大逆序 = 乱响
    for (let i = 1; i < steps.length; i++)
      expect(steps[i], `L${i - 1}→L${i} 级联序`).toBeGreaterThan(steps[i - 1] - 40);
  });

  it('成形顺滑（2026-08-30 返工）：外箱拉链逐挡推进 + 每步位移有界', () => {
    // 病根 = 外箱十颗键同一步全锁（吸引护栏早备好全链、闸一开 55 迭代放行 55 颗），
    // 全部整形机制以锁定为开关 ⇒ 成形压缩在 4 步里、峰值 34.5px/步 = 基线 114 倍。
    // 修法 = 节拍（lockGap 只圈外箱链——缝链预锁不能碰，L8 实测绞死）+ 限速
    // （stepClamp 兜屈曲翻越与单键顿挫；裸用会让缝料输掉与箱体合拢的竞速，必须
    // 在节拍把合拢摊开之后才安全）。终态 Δ/锁定集合逐位复原（上面几条守门即证）。
    for (const r of RUN) {
      const bs = r.boxLockSteps;
      expect(bs.length, `L${r.lv.i} 外箱键数`).toBeGreaterThanOrEqual(9);
      for (let i = 1; i < bs.length; i++)
        expect(bs[i] - bs[i - 1], `L${r.lv.i} 外箱第 ${i} 挡间隔`).toBeGreaterThanOrEqual(SPLIT_GAP);
      expect(bs[bs.length - 1], `L${r.lv.i} 末挡`).toBeLessThan(950); // 拉链在纪律解除前走完
      expect(r.peakMove, `L${r.lv.i} 过程峰值 px/步`).toBeLessThanOrEqual(SPLIT_CLAMP * 100 + 1e-6);
    }
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
      // 节拍化拉链（SPLIT_GAP）下，成形是一道跨 ~590–940 步的传播波：波峰期
      // （检查点 700）相邻级差 = 拉链相位差 + 各自形态目标差，实测最大 15.1
      // ——与旧「同步全锁」动态的全程峰值 13.6 同量级，不是断层；波过后
      // （900）收到 5.3，终态（1200）3.2。上限按各段实测留一点余量。
      const cap = f < 3 ? 17 : f === 3 ? 6.5 : 4.5;
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
