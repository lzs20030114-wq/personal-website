import { describe, expect, it } from 'vitest';
import {
  SQUARE,
  SQUARE_PHASE,
  SQUARE_PW,
  SQUARE_REACH,
  SQUARE_RUNGS,
  SQUARE_TIERS,
  buildSquareOrder,
  buildSquareUnits,
  squareAngle,
  squareBuffer,
  squareFree,
  squareFreeTotal,
  squareGap,
  squareHalfSide,
  squareLadder,
  squareRadiusAt,
  squareRimPoints,
  squareSlack,
  SQUARE_WAVE,
  buildSquareWave,
  squareLead,
  squareWaveLeads,
  squareWaveLevel,
  SQUARE_GRID,
  SQUARE_PEAK,
  squareCellGap,
  squareCellPitch,
  squareCornerRadius,
  squareGridCells,
  squareGridSpan,
  squareTightRadius,
  SQUARE_DEPTH,
  SQUARE_KHI,
  SQUARE_MORPH,
  squareClassOf,
  squareDepthK,
  squareMorphExp,
  squareMorphExtent,
  squareMorphReach,
  squareMorphRim,
  squareMorphTiers,
  squarePeakOf,
  squareReachOf,
  squareSpec,
} from './skin-square';
import { RING_BAND_NODES } from './skin-ring';
import { SKIN, createSkinUnit, type SkinBond, type SkinSpec } from './skin-unit';

/**
 * 守门：Lab.14 方形环。物理零涉及——引擎与 Lab.06 逐字同一份，这里卡的是
 * 「靠挑出的长度把俯视外轮廓做成方形」这件事本身，以及它踩过的三个坑：
 * 端面板端点必须是锁定梯挡、箱子必须住得下自由段、对齐不能靠旋钮（见 skin-square.ts 文件头）。
 */

const UNITS = buildSquareUnits();
const F_TOT = squareFreeTotal();

/** 谱里的三段读数：贴合 lead / 上下垫 / 结构段（含它的起始下标） */
function parts(spec: SkinSpec) {
  // 垫为 0 时谱退化成三段，首段是 lead + ISO 并在一起——读数要还原成同一口径
  const seven = spec.length > 3;
  const lead = (spec[0] as readonly ['g', number])[1] - (seven ? 0 : SQUARE.ISO);
  const padHi = seven ? (spec[1] as readonly ['f', number, readonly SkinBond[]])[1] : 0;
  const padLo = seven ? (spec[spec.length - 2] as readonly ['f', number, readonly SkinBond[]])[1] : 0;
  const segIdx = seven ? 3 : 1;
  const seg = spec[segIdx] as readonly ['f', number, readonly SkinBond[], readonly (readonly [number, number])[]];
  const off = spec.slice(0, segIdx).reduce((s, x) => s + x[1], 0);
  const total = spec.reduce((s, x) => s + x[1], 0);
  return { lead, padHi, padLo, seg, fs: seg[1], bonds: seg[2], panel: seg[3], off, total };
}

/** 跑完一轮收缩（三档，约 20s）——多个用例共用，别重复跑 */
let RUN: ReturnType<typeof runAll> | null = null;
/** 全程检查点：动画件的对齐要按整个时间轴验，不能只验终态（§8.8 的教训） */
const CHK_R = [0.87, 0.66, 0.44];
const CHK_STEPS = CHK_R.map((r) => Math.round((900 * (SKIN.R0 - r)) / (SKIN.R0 - SKIN.R1)));

function runAll(units: readonly { key: string; spec: SkinSpec; opts: Parameters<typeof createSkinUnit>[1] }[] = UNITS) {
  return units.map((d) => {
    const P = parts(d.spec);
    const sim = createSkinUnit(d.spec, d.opts);
    let widest = P.bonds[0];
    for (const b of P.bonds) if (b[1] - b[0] > widest[1] - widest[0]) widest = b;
    const mi = P.off + widest[0];
    const mj = P.off + widest[1];
    const mouthAt = () => -((sim.py[mi] + sim.py[mj]) / 2) * 100;
    const chk: number[] = [];
    for (let k = 0; k < SKIN.STEPS; k++) {
      sim.advance();
      if (CHK_STEPS.includes(k)) chk.push(mouthAt());
    }
    let out = 0;
    for (let k = 0; k < sim.n; k++) out = Math.max(out, sim.px[k] * 100);
    // 顶面 / 底面各自的位置与水平度。采样要**排除端面那一段**——端面的点 y 跨越
    // 半个箱高，混进来会把水平度读成 ~H/2（线稿阶段读出过 22px 的假跑型）
    const my = mouthAt();
    const top: number[] = [];
    const bot: number[] = [];
    for (let i = P.off; i < P.off + P.fs; i++) {
      const x = sim.px[i] * 100;
      const y = -sim.py[i] * 100;
      if (x >= 0.35 * out && x <= 0.85 * out) (y < my ? top : bot).push(y);
    }
    const mean = (v: number[]) => v.reduce((s, t) => s + t, 0) / v.length;
    const rng = (v: number[]) => Math.max(...v) - Math.min(...v);
    return {
      key: d.key,
      out,
      locked: sim.locked.length,
      keys: P.bonds.length,
      topY: mean(top),
      topFlat: rng(top),
      botFlat: rng(bot),
      boxH: mean(bot) - mean(top),
      mouth: [...chk, my],
    };
  });
}
const run = () => (RUN ??= runAll());

describe('方形环 · 构造（Lab.14）', () => {
  it('三档 = 面 8 / 边 8 / 角 4，深度递增，角档定方形', () => {
    expect(SQUARE_TIERS.map((t) => t.count)).toEqual([8, 8, 4]);
    expect(SQUARE_TIERS.reduce((s, t) => s + t.count, 0)).toBe(SQUARE.COUNT);
    const ks = SQUARE_TIERS.map((t) => t.k);
    expect(ks).toEqual([...ks].sort((a, b) => a - b)); // 面 < 边 < 角
    expect(SQUARE_REACH.length).toBe(SQUARE_TIERS.length);
  });

  it('带子总长钉死 202，三档 lead 相同且不让光，垫上下对称', () => {
    const P = UNITS.map((u) => parts(u.spec));
    for (const p of P) {
      expect(p.total).toBe(RING_BAND_NODES);
      expect(p.lead).toBe(P[0].lead); // lead 全员同 ⇒ 嘴心的常数项相同
      expect(p.lead).toBeGreaterThanOrEqual(SQUARE.LEAD_MIN);
      // 垫对称：不对称会把结构两侧的材料弄不平衡，形跟着不对称（坑③）
      expect(p.padHi).toBe(p.padLo);
      expect(2 * p.padHi + p.fs).toBe(F_TOT);
    }
  });

  it('对齐是构造给的：上垫 + (fs−1)/2 三档逐位相同 ⇒ 嘴心的斜率项相同', () => {
    const vals = UNITS.map((u) => {
      const p = parts(u.spec);
      return p.padHi + (p.fs - 1) / 2;
    });
    for (const v of vals) expect(v).toBeCloseTo((F_TOT - 1) / 2, 12);
    expect(new Set(vals).size).toBe(1);
  });

  it('梯挡：根数一圈恒定，最内钉在端面板端点、最外 = kMax', () => {
    for (const t of SQUARE_TIERS) {
      const ks = squareLadder(t.k);
      expect(ks.length, t.name).toBe(SQUARE_RUNGS); // 少一根 = 一圈里有带比邻居少梯挡（§13 的否决理由）
      expect(ks[0]).toBe(SQUARE_PW); // 坑①：端面硬投影要求「面板端点恰好是锁定键」
      expect(ks[ks.length - 1]).toBe(t.k);
      expect([...ks]).toEqual([...ks].sort((a, b) => a - b));
    }
  });

  it('等长键纪律精确成立：端面板跨度 × SEG = 嘴键长 = 箱高', () => {
    expect(SQUARE_PW).toBe(SQUARE.H / 4);
    for (const u of UNITS) {
      const p = parts(u.spec);
      const [a, b] = p.panel[0];
      expect(b - a).toBe(2 * SQUARE_PW);
      expect((b - a) * SKIN.SEG * 100).toBeCloseTo(SQUARE.H, 9);
      for (const bond of p.bonds) expect(bond[2] * 100).toBeCloseTo(SQUARE.H, 9); // 键长一律 = 箱高
    }
  });

  it('两条硬约束：箱子住得下自由段（坑②）+ 缓冲折得起来', () => {
    for (const t of SQUARE_TIERS) {
      const b = squareBuffer(t.k);
      expect(b, t.name).toBeGreaterThanOrEqual(SQUARE.BUF_MIN);
      // 间隙为负 = 箱子比它住的那段还高 ⇒ 下侧缓冲被拉直外翻、底部嘴角反向弯
      expect(squareGap(t.k, b), t.name).toBeGreaterThanOrEqual(SQUARE.G_MIN);
      expect(squareSlack(t.k, b), t.name).toBeGreaterThanOrEqual(SQUARE.E_MIN);
      expect(squareFree(t.k, b)).toBeLessThanOrEqual(F_TOT); // 垫补差 ⇒ 不能超过配平基准
    }
    // 三档余量彼此接近：悬殊会让浅档堆料、终态位置崩（实测 42 vs 13 那版即此）
    const sl = SQUARE_TIERS.map((t) => squareSlack(t.k, squareBuffer(t.k)));
    expect(Math.max(...sl) - Math.min(...sl)).toBeLessThan(8);
  });
});

describe('方形环 · 一圈的编制与外轮廓', () => {
  it('相位半格 ⇒ 四条带正落在四个角上', () => {
    expect(SQUARE_PHASE).toBeCloseTo(Math.PI / SQUARE.COUNT, 12);
    const deg = (i: number) => (squareAngle(i) * 180) / Math.PI;
    expect(deg(2)).toBeCloseTo(45, 9);
    expect(deg(7)).toBeCloseTo(135, 9);
    expect(deg(12)).toBeCloseTo(225, 9);
    expect(deg(17)).toBeCloseTo(315, 9);
  });

  it('二十位恰好排成 面 8 / 边 8 / 角 4，且角位取角档', () => {
    const order = buildSquareOrder();
    expect(order.length).toBe(SQUARE.COUNT);
    const cnt = [0, 0, 0];
    for (const t of order) cnt[t]++;
    expect(cnt).toEqual(SQUARE_TIERS.map((t) => t.count));
    for (const i of [2, 7, 12, 17]) expect(order[i], `位置 ${i}`).toBe(SQUARE_TIERS.length - 1);
  });

  it('二十个平台外缘点落在目标方形的边上（≤2px）', () => {
    const pts = squareRimPoints();
    const a = squareHalfSide();
    for (const p of pts) expect(Math.abs(p.dev)).toBeLessThanOrEqual(2);
    // 角点就是方形的角：|x| ≈ |z| ≈ a
    const corner = pts[2];
    expect(Math.abs(corner.x)).toBeCloseTo(a, 6);
    expect(Math.abs(corner.z)).toBeCloseTo(a, 6);
    // 弦线也在方形内侧（膜是直纹带，俯视即弦）——同边两点的中点不得越出边界
    for (let i = 0; i < pts.length; i++) {
      const q = pts[(i + 1) % pts.length];
      const mx = (pts[i].x + q.x) / 2;
      const mz = (pts[i].z + q.z) / 2;
      const th = Math.atan2(mz, mx);
      expect(Math.hypot(mx, mz)).toBeLessThanOrEqual(squareRadiusAt(th, a) + 2);
    }
  });
});

describe('方形环 · 真跑（三档终态）', () => {
  it('三档各自成形：键全锁、挑出对得上标定值', { timeout: 120_000 }, () => {
    for (const [i, r] of run().entries()) {
      expect(r.locked, r.key).toBe(r.keys);
      expect(r.keys).toBe(SQUARE_RUNGS);
      expect(Math.abs(r.out - SQUARE_REACH[i]), `${r.key} 挑出 ${r.out.toFixed(1)}`).toBeLessThan(2);
    }
  });

  it('箱高一圈恒定、顶底面是平的（这一族的卖点，也是跑型的判据）', { timeout: 120_000 }, () => {
    for (const r of run()) {
      expect(Math.abs(r.boxH - SQUARE.H), `${r.key} 箱高 ${r.boxH.toFixed(1)}`).toBeLessThan(1.5);
      // 面不平 = 跑型。读数全绿而图不对时，就是这两条没测（线稿阶段翻过三次车）
      expect(r.topFlat, `${r.key} 顶面水平度`).toBeLessThan(1.5);
      expect(r.botFlat, `${r.key} 底面水平度`).toBeLessThan(1.5);
    }
    const hs = run().map((r) => r.boxH);
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(0.5);
  });

  it('平台面全程齐平（构造给的，不是补出来的）', { timeout: 120_000 }, () => {
    const rows = run();
    const tops = rows.map((r) => r.topY);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(1.5); // 终态
    for (let i = 0; i < rows[0].mouth.length; i++) {
      const ys = rows.map((r) => r.mouth[i]);
      expect(Math.max(...ys) - Math.min(...ys), `检查点 ${i}`).toBeLessThan(2.5);
    }
  });
});

describe('方形环 · 一圈起伏（第二种编制）', () => {
  const WAVE = buildSquareWave();

  it('起伏只动 lead：档位分布与平档逐位相同（方形不受影响）', () => {
    const flat = buildSquareOrder();
    for (let i = 0; i < SQUARE.COUNT; i++) {
      const u = WAVE.units[WAVE.order[i]];
      // 引擎的 key 里带着档名 ⇒ 每位的深度档必须与平档那份一致
      expect(u.key.startsWith(`sq-${SQUARE_TIERS[flat[i]].en}-`), `位置 ${i}`).toBe(true);
    }
  });

  it('波的对称轴落在角位 ⇒ 组合数减半（11 条引擎，不是 19 条）', () => {
    expect(WAVE.units.length).toBeLessThanOrEqual(SQUARE_WAVE.LEVELS);
    // 相位对齐的硬证据：位置 2±d 同级（角位是轴）
    for (let d = 1; d <= 5; d++)
      expect(squareWaveLevel((2 + d) % SQUARE.COUNT)).toBe(squareWaveLevel((2 - d + SQUARE.COUNT) % SQUARE.COUNT));
  });

  it('幅度与两端都在实测安全区内（lead 6…32 剖面偏差 0.000px）', () => {
    const leads = squareWaveLeads();
    expect(leads.length).toBe(SQUARE_WAVE.LEVELS);
    expect(Math.max(...leads)).toBe(SQUARE_WAVE.LOW);
    expect(Math.min(...leads)).toBe(SQUARE_WAVE.HIGH);
    for (const l of leads) {
      expect(l).toBeGreaterThanOrEqual(SQUARE.LEAD_MIN);
      expect(RING_BAND_NODES - 2 * SQUARE.ISO - F_TOT - l).toBeGreaterThanOrEqual(SQUARE.TAIL_MIN);
    }
    // 余弦：单调升到波峰再单调降回（不是三角波的折角，也不能有抖动）
    const half = (SQUARE_WAVE.LEVELS - 1) / 2;
    for (let i = 1; i < leads.length; i++) expect(leads[i]).toBeLessThanOrEqual(leads[i - 1]);
    expect(half).toBeGreaterThan(0);
    // 中心 = 平档那个 lead ⇒ 切编制时平台的平均高度不跳
    expect((SQUARE_WAVE.LOW + SQUARE_WAVE.HIGH) / 2).toBe(squareLead());
  });

  it('筒的上下缘不动：每一级 lead + tail 恒定（带子总长钉死）', () => {
    for (const u of WAVE.units) {
      const p = parts(u.spec);
      expect(p.total).toBe(RING_BAND_NODES);
      expect(2 * p.padHi + p.fs).toBe(F_TOT); // 自由总量恒定 ⇒ 芯长逐点相同
    }
  });

  it('真跑：同一档的最低级与最高级，形状逐点相同、只是整体平移', { timeout: 120_000 }, () => {
    // 取角档（最紧的一档）的两端级
    const leads = squareWaveLeads();
    const lo = WAVE.units.find((u) => u.key === `sq-corner-w0`)!;
    const hi = WAVE.units.find((u) => u.key === `sq-corner-w${SQUARE_WAVE.LEVELS - 1}`)!;
    const shape = (u: (typeof WAVE.units)[number]) => {
      const P = parts(u.spec);
      const sim = createSkinUnit(u.spec, u.opts);
      for (let k = 0; k < SKIN.STEPS; k++) sim.advance();
      let w = P.bonds[0];
      for (const b of P.bonds) if (b[1] - b[0] > w[1] - w[0]) w = b;
      const my = -(sim.py[P.off + w[0]] + sim.py[P.off + w[1]]) / 2;
      const prof: [number, number][] = [];
      for (let i = P.off; i < P.off + P.fs; i++) prof.push([sim.px[i] * 100, (-sim.py[i] - my) * 100]);
      return { prof, mouth: my * 100, top: -sim.py[0] * 100, foot: -sim.py[sim.n - 1] * 100 };
    };
    const A = shape(lo);
    const B = shape(hi);
    let dev = 0;
    for (let i = 0; i < A.prof.length; i++)
      dev = Math.max(dev, Math.hypot(A.prof[i][0] - B.prof[i][0], A.prof[i][1] - B.prof[i][1]));
    expect(dev).toBeLessThan(0.05); // 形状一个数没变
    // 高度差 = lead 差 × 2px/节
    expect(A.mouth - B.mouth).toBeCloseTo((leads[0] - leads[leads.length - 1]) * 2, 1);
    // 筒的上下缘不动
    expect(A.top).toBeCloseTo(B.top, 6);
    expect(A.foot).toBeCloseTo(B.foot, 6);
  });
});

describe('方形环 · 4×4 阵列（第二组控件「排布」）', () => {
  it('峰值是全程量、且比终态大——格距按它定，不能按终态', () => {
    for (let i = 0; i < SQUARE_PEAK.length; i++) {
      expect(SQUARE_PEAK[i], SQUARE_TIERS[i].name).toBeGreaterThan(SQUARE_REACH[i]);
      expect(SQUARE_PEAK[i] - SQUARE_REACH[i]).toBeLessThan(5); // 鼓出的量级（1.5–2.5px）
    }
    // 面档在过程中鼓得比角档多 —— 这正是「边对边比角对角更紧」的原因
    expect(SQUARE_PEAK[0] - SQUARE_REACH[0]).toBeGreaterThan(SQUARE_PEAK[2] - SQUARE_REACH[2]);
  });

  it('格距按边对边定：它比对角约束更紧（同相位最省地方）', () => {
    const pitch = squareCellPitch();
    const edge = 2 * squareTightRadius(); // 边对边：两个方形的面档点相接
    const diag = (2 * squareCornerRadius()) / Math.SQRT2; // 对角相邻：pitch·√2 ≥ 2·角点半径
    expect(edge).toBeGreaterThan(diag); // 边对边更紧 —— 结论反了会把格距定小
    expect(pitch).toBeGreaterThan(edge); // 留了缝
    expect(squareCellGap()).toBeGreaterThan(10);
    // 角点半径不要多乘 √2（角档的带子本来就指向 45°，外缘点就是方形的角）
    expect(squareCornerRadius()).toBeCloseTo(SQUARE.RADIUS + SQUARE_PEAK[2], 9);
  });

  it('十六格居中、间距均匀，且任意两格的方形都不相碰', () => {
    const cells = squareGridCells();
    expect(cells.length).toBe(SQUARE_GRID.COLS * SQUARE_GRID.ROWS);
    // 居中：坐标和为零
    expect(cells.reduce((s, c) => s + c.x, 0)).toBeCloseTo(0, 9);
    expect(cells.reduce((s, c) => s + c.z, 0)).toBeCloseTo(0, 9);
    // 不相碰：任意两格中心距 ≥ 两个方形在该方向上的占用之和
    const a = squareCornerRadius() / Math.SQRT2; // 峰值半边长
    for (let i = 0; i < cells.length; i++)
      for (let j = i + 1; j < cells.length; j++) {
        const dx = Math.abs(cells[i].x - cells[j].x);
        const dz = Math.abs(cells[i].z - cells[j].z);
        // 两个同相位的正方形不相交 ⇔ 沿某一轴分离
        expect(Math.max(dx, dz), `格 ${i}/${j}`).toBeGreaterThan(2 * a);
      }
    // 占宽 = 格距 × (列数−1) + 两端角点
    expect(squareGridSpan()).toBeCloseTo(
      (SQUARE_GRID.COLS - 1) * squareCellPitch() + 2 * squareCornerRadius(),
      9,
    );
  });
});

/**
 * 圆 ↔ 方（第三组控件「轮廓」，2026-08-31）。这一档的新东西只有两件：
 * 一张 kMax→挑出 的实测深度表，和一条把目标轮廓从内切圆推到方形的超椭圆。
 * 键谱构造、对位构造、整形选项一个数没动，故这里卡的是**表与轮廓**本身，
 * 外加两条端点性质：末档必须逐位复现用户拍板过的那个方形，圆档三档必须相同。
 */
describe('方形环 · 深度表', () => {
  it('两列等长、单调递增，且峰值恒在终态之外', () => {
    expect(SQUARE_DEPTH.PEAK.length).toBe(SQUARE_DEPTH.REACH.length);
    expect(SQUARE_KHI).toBe(SQUARE_DEPTH.KLO + SQUARE_DEPTH.REACH.length - 1);
    for (let k = SQUARE_DEPTH.KLO + 1; k <= SQUARE_KHI; k++) {
      expect(squareReachOf(k), `k${k} 挑出`).toBeGreaterThan(squareReachOf(k - 1));
      expect(squarePeakOf(k), `k${k} 峰值`).toBeGreaterThan(squarePeakOf(k - 1));
    }
    for (let k = SQUARE_DEPTH.KLO; k <= SQUARE_KHI; k++) {
      expect(squarePeakOf(k), `k${k}`).toBeGreaterThan(squareReachOf(k));
      expect(squarePeakOf(k) - squareReachOf(k)).toBeLessThan(5); // 鼓出的量级
    }
    expect(() => squareReachOf(SQUARE_DEPTH.KLO - 1)).toThrow();
    expect(() => squareReachOf(SQUARE_KHI + 1)).toThrow();
  });

  it('档案三档 = 查表（数只有一份，改构造必须重标同一张表）', () => {
    expect(SQUARE_REACH).toEqual(SQUARE_TIERS.map((t) => squareReachOf(t.k)));
    expect(SQUARE_PEAK).toEqual(SQUARE_TIERS.map((t) => squarePeakOf(t.k)));
    expect([...SQUARE_REACH]).toEqual([56.0, 63.7, 89.2]); // 用户看图拍板过的那三档
    expect([...SQUARE_PEAK]).toEqual([58.5, 66.0, 90.7]);
  });

  it('表的上界由带长定：再深一档的贴身自由段就装不进配平基准了', () => {
    expect(squareFree(SQUARE_KHI)).toBeLessThanOrEqual(F_TOT);
    expect(squareFree(SQUARE_KHI + 1)).toBeGreaterThan(F_TOT);
    expect(() => squareSpec(SQUARE_KHI + 1)).toThrow();
  });

  it('反查取最近，并列时取小的（末档才复现得了档案值）', () => {
    for (let k = SQUARE_DEPTH.KLO; k <= SQUARE_KHI; k++) expect(squareDepthK(squareReachOf(k))).toBe(k);
    expect(squareDepthK(-999)).toBe(SQUARE_DEPTH.KLO);
    expect(squareDepthK(999)).toBe(SQUARE_KHI);
  });
});

describe('方形环 · 圆↔方五档', () => {
  it('位次改按方位类现算，与旧的几何反查对方形逐位一致', () => {
    const a = squareHalfSide();
    const old = Array.from({ length: SQUARE.COUNT }, (_, i) => {
      const want = squareRadiusAt(squareAngle(i), a) - SQUARE.RADIUS;
      let best = 0;
      for (let t = 1; t < SQUARE_REACH.length; t++)
        if (Math.abs(SQUARE_REACH[t] - want) < Math.abs(SQUARE_REACH[best] - want)) best = t;
      return best;
    });
    expect(buildSquareOrder()).toEqual(old);
    expect(Array.from({ length: SQUARE.COUNT }, (_, i) => squareClassOf(i))).toEqual(old);
  });

  it('端点：末档 = 用户拍板的那个方形，圆档三档相同（内切圆）', () => {
    const last = squareMorphTiers(SQUARE_MORPH.STEPS - 1);
    expect(last.map((t) => t.k)).toEqual(SQUARE_TIERS.map((t) => t.k));
    expect(last.map((t) => t.count)).toEqual(SQUARE_TIERS.map((t) => t.count));
    expect(squareMorphExp(SQUARE_MORPH.STEPS - 1)).toBe(Infinity);

    const first = squareMorphTiers(0);
    expect(squareMorphExp(0)).toBeCloseTo(2, 9); // n=2 = 圆
    expect(new Set(first.map((t) => t.k)).size).toBe(1);
    // 圆的半径 ≈ 方形的内切圆（半边长），差的是深度表的量化误差
    expect(SQUARE.RADIUS + squareMorphReach(0)[0]).toBeCloseTo(squareHalfSide(), 0);
  });

  it('逐级只往外长：角档单调递增且步子匀，面档几乎不动', () => {
    const ks = Array.from({ length: SQUARE_MORPH.STEPS }, (_, s) => squareMorphTiers(s).map((t) => t.k));
    for (let s = 1; s < ks.length; s++)
      for (let c = 0; c < 3; c++) expect(ks[s][c], `档${s} ${SQUARE_TIERS[c].name}`).toBeGreaterThanOrEqual(ks[s - 1][c]);
    const corner = ks.map((k) => k[2]);
    for (let s = 1; s < corner.length; s++) expect(corner[s]).toBeGreaterThan(corner[s - 1]);
    const d = corner.slice(1).map((k, i) => k - corner[i]);
    expect(Math.max(...d) - Math.min(...d), `角档步子 ${d.join('/')}`).toBeLessThanOrEqual(2);
    // 面档从头到尾只差一格 —— 固定的是内切圆，动的是角
    expect(ks[ks.length - 1][0] - ks[0][0]).toBeLessThanOrEqual(1);
  });

  it('每档外缘点都落在自己的轮廓线上（偏差 = 深度表的量化误差）', () => {
    for (let s = 0; s < SQUARE_MORPH.STEPS; s++) {
      const rim = squareMorphRim(s);
      expect(rim.length).toBe(SQUARE.COUNT);
      for (const q of rim) expect(Math.abs(q.dev), `档${s}`).toBeLessThan(1);
      // 四个角位仍在 45° 上（相位半格是这一族的前提，换档不能动它）
      for (const i of [2, 7, 12, 17]) {
        const th = squareAngle(i);
        expect(Math.abs(Math.abs(Math.cos(th)) - Math.abs(Math.sin(th)))).toBeLessThan(1e-9);
      }
    }
  });

  it('切档不改平台高度：五档共用同一个配平基准 ⇒ lead 恒定', () => {
    const leads = new Set<number>();
    for (let s = 0; s < SQUARE_MORPH.STEPS; s++)
      for (const t of squareMorphTiers(s)) {
        const P = parts(squareSpec(t.k, F_TOT));
        leads.add(P.lead);
        expect(P.padHi, `档${s} k${t.k} 垫上下对称`).toBe(P.padLo);
        expect(2 * P.padHi + P.fs, `档${s} k${t.k} 垫+结构`).toBe(F_TOT);
        expect(P.total).toBe(RING_BAND_NODES);
      }
    expect(leads.size, `lead 出现了 ${[...leads].join('/')}`).toBe(1);
  });

  it('阵列格距不随轮廓变也够用：每档在格子方向上的外伸都不超过方档', () => {
    for (let s = 0; s < SQUARE_MORPH.STEPS; s++)
      expect(squareMorphExtent(s), `档${s} 外伸`).toBeLessThanOrEqual(squareTightRadius());
    // 方档那个最紧值本身就是格距的依据
    expect(squareCellPitch()).toBeGreaterThan(2 * squareMorphExtent(SQUARE_MORPH.STEPS - 1));
  });
});

describe('方形环 · 真跑（圆档与中间档的新深度）', () => {
  it('表里没跑过的那两个 kMax 也成形：键全锁、挑出对表、箱高仍是 36', { timeout: 120_000 }, () => {
    const opts = UNITS[0].opts;
    const ks = [squareMorphTiers(0)[2].k, squareMorphTiers(2)[2].k]; // 圆档 34 / 中间档 43
    const rows = runAll(ks.map((k) => ({ key: `k${k}`, spec: squareSpec(k, F_TOT), opts })));
    rows.forEach((r, i) => {
      expect(r.locked, r.key).toBe(r.keys);
      expect(r.keys).toBe(SQUARE_RUNGS);
      expect(Math.abs(r.out - squareReachOf(ks[i])), `${r.key} 挑出 ${r.out.toFixed(1)}`).toBeLessThan(2);
      expect(Math.abs(r.boxH - SQUARE.H), `${r.key} 箱高 ${r.boxH.toFixed(1)}`).toBeLessThan(1.5);
      expect(r.topFlat, `${r.key} 顶面水平度`).toBeLessThan(1.5);
      expect(r.botFlat, `${r.key} 底面水平度`).toBeLessThan(1.5);
    });
    // 与方档三条一起看：平台高度与 kMax 无关（切轮廓档不跳）
    const tops = [...rows, ...run()].map((r) => r.topY);
    expect(Math.max(...tops) - Math.min(...tops), '五档共用构造下的平台面散布').toBeLessThan(1.5);
  });
});
