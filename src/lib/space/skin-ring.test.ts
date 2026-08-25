import { describe, expect, it } from 'vitest';
import { ARRAY_LEAD, placeOnBand } from './skin-array';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import { SOLID } from './skin-solid';
import {
  RAIL_HALF,
  RAIL_INSET,
  RING,
  RING_BAND_NODES,
  RING_CENTER,
  RING_DEFAULT_FORM,
  RING_FREE,
  RING_GROW,
  RING_LEAD,
  RING_TAIL,
  buildRingOrder,
  growSeg,
  buildRingUnits,
  ringAngle,
  ringGap,
  ringPitch,
} from './skin-ring';
import { SKIN, createSkinUnit, type SkinBond } from './skin-unit';

/**
 * 守门：Lab.09 圆筒环列的编制（键谱层 + 环上几何）。物理零涉及——
 * 引擎与 Lab.06 逐字同一份，这里卡的是「一种键谱围成的筒读不读得出来」：
 * 一圈同一种（用户 2026-08-23 纠偏，混着摆的首版被否）、四种可互换而不跳台阶、
 * 形态未被搬动、半径下限不互穿。
 */

const DEFS = buildRingUnits();

/** 跑完一轮收缩（四条带，约 2s）——多个用例共用，别重复跑 */
let RUN: ReturnType<typeof runAll> | null = null;
function runAll() {
  const sims = DEFS.map((d) => createSkinUnit(d.spec, d.opts));
  for (const s of sims) for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return DEFS.map((d, i) => {
    const s = sims[i];
    const bonds = (d.spec[1] as readonly [string, number, readonly SkinBond[]])[2];
    let widest = bonds[0];
    for (const b of bonds) if (b[1] - b[0] > widest[1] - widest[0]) widest = b;
    const off = (d.spec[0] as readonly [string, number])[1];
    const foot = s.py[s.n - 1];
    let outX = 0;
    let minX = 0;
    for (let k = 0; k < s.n; k++) {
      outX = Math.max(outX, s.px[k]);
      minX = Math.min(minX, s.px[k]);
    }
    return {
      key: d.key,
      sim: s,
      /** 嘴心（最外键对中点）距下缘的高度，px */
      mouth: ((s.py[off + widest[0]] + s.py[off + widest[1]]) / 2 - foot) * SOLID.SCALE,
      /** 带顶距下缘 = 收缩后的筒高，px */
      top: (s.py[0] - foot) * SOLID.SCALE,
      /** 挑出的最大离轴距离，px */
      outX: outX * SOLID.SCALE,
      minX: minX * SOLID.SCALE,
    };
  });
}
const run = (): ReturnType<typeof runAll> => (RUN ??= runAll());

describe('skin-ring 圆筒环列', () => {
  it('编制：一圈 20 位全指同一条引擎（用户拍板：一个环只用一种形状）', () => {
    const order = buildRingOrder();
    expect(order.length).toBe(RING.COUNT);
    expect(new Set(order).size).toBe(1); // 混四种的首版被否：平台不连续
    expect(order.every((v) => v === 0)).toBe(true);
    // 四种键谱仍全部备着，是「选哪一种」的选项
    expect(DEFS.length).toBe(4);
    expect(DEFS[RING_DEFAULT_FORM].key).toBe('stepped'); // 默认方箱：顶面找平过
    // 方位角均分整圈
    expect(ringAngle(0)).toBe(0);
    expect(ringAngle(RING.COUNT)).toBeCloseTo(Math.PI * 2, 12);
  });

  it('四条带三段等长——嘴心对位构造的前提', () => {
    // **带子总长钉死**（用户 2026-08-25「不是要增长带子，就这个长度，增加折叠程度」）：
    // 要折得更深只能把贴合段匀给自由段，三段之和恒等于总长
    expect(RING_BAND_NODES).toBe(202);
    expect(RING_LEAD + RING_FREE + RING_TAIL).toBe(RING_BAND_NODES);
    expect(RING_LEAD).toBeGreaterThan(20); // 贴合段别让光
    expect(RING_TAIL).toBeGreaterThanOrEqual(11); // 尾段太短形状会被拽变形（tail=7 实测偏差 0.756）
    expect(RING_CENTER).toBe((RING_FREE - 1) / 2); // 扇心落在整数节点上
    for (const d of DEFS) {
      const total = d.spec.reduce((s, seg) => s + seg[1], 0);
      expect(total).toBe(RING_BAND_NODES);
      expect(d.spec.map((seg) => seg[0])).toEqual(['g', 'f', 'g']);
      expect(d.spec[1][1]).toBe(RING_FREE); // 四条同一副构造 ⇒ 对位构造成立
    }
  });

  it('形态没被改写：整副构造按 RING_GROW 等比放大，键的根数一根不变', () => {
    // 用户 2026-08-25「平台展开更多一些」：挑出长度由**材料量**定（收缩量实测无效），
    // 故环族用一副放大 1.5× 的构造。放大必须是**结构相似**——根数、相对比例、
    // 等长键纪律都不许变，否则就不是「同一个形态大了一圈」而是换了个形态。
    DEFS.forEach((d, i) => {
      const src = SKIN_UNITS[i].spec[1];
      const dst = d.spec[1];
      if (src[0] !== 'f' || dst[0] !== 'f') throw new Error('自由段位置变了');
      const a = src[2];
      const b = dst[2];
      expect(b.length, d.key).toBe(a.length); // 根数一根不变
      b.forEach(([i1, j1], k) => {
        // 每根键的半跨等比（整数取整），且全部同心
        expect((j1 - i1) / 2, d.key).toBe(Math.round(((a[k][1] - a[k][0]) / 2) * RING_GROW));
        expect((i1 + j1) / 2, d.key).toBeCloseTo(RING_CENTER, 12); // 扇形正居中
        // 嘴口同比；阶梯方箱例外——它的 rb 由端面板反算（等长键纪律，见 growSeg）
        if (src.length !== 4) expect(b[k][2], d.key).toBeCloseTo(a[k][2] * RING_GROW, 12);
      });
      const pa = src.length === 4 ? src[3] : undefined;
      const pb = dst.length === 4 ? dst[3] : undefined;
      expect(!!pb).toBe(!!pa);
      if (pa && pb) {
        pa.forEach(([x, y], k) => {
          const span = pb[k][1] - pb[k][0];
          expect(span).toBe(2 * Math.round(((y - x) / 2) * RING_GROW));
          // 等长键纪律：端面弧长 = 键长（阶梯方箱的「方」就是靠这个）
          expect(b[0][2]).toBeCloseTo(span * 0.02, 9);
        });
      }
    });
  });

  it('键谱两端各留 ≥4 节缓冲（交接件纪律），扇形正居中在自由段上', () => {
    for (const d of DEFS) {
      const bonds = (d.spec[1] as readonly [string, number, readonly SkinBond[]])[2];
      let lo = Number.POSITIVE_INFINITY;
      let hi = -1;
      for (const [i, j] of bonds) {
        lo = Math.min(lo, i);
        hi = Math.max(hi, j);
      }
      expect(lo).toBeGreaterThanOrEqual(4);
      expect(RING_FREE - 1 - hi).toBeGreaterThanOrEqual(4);
      // 正居中 ⇒ 上下缓冲等长 ⇒ 嘴心与键长无关（skin-array 文件头的构造）
      expect((lo + hi) / 2).toBeCloseTo(RING_CENTER, 12);
    }
  });

  it('真跑：四条带各自锁定成形、皮不穿芯、终态无 NaN', { timeout: 60_000 }, () => {
    for (const r of run()) {
      expect(r.sim.locked.length, r.key).toBeGreaterThan(0);
      expect(r.outX, r.key).toBeGreaterThan(20); // 确实挑出来了
      expect(r.minX, r.key).toBeGreaterThanOrEqual(-1e-9); // coreWall：不穿到轴的另一侧
      for (let i = 0; i < r.sim.n; i++) {
        expect(Number.isFinite(r.sim.px[i])).toBe(true);
        expect(Number.isFinite(r.sim.py[i])).toBe(true);
      }
    }
  });

  it('四种形态可互换：同一收缩终点的三种，嘴心与筒高逐位齐平（实测散布 0.08px）', () => {
    const m = run()
      .filter((r) => r.key !== 'pocket')
      .map((r) => r.mouth);
    expect(m.length).toBe(3);
    expect(Math.max(...m) - Math.min(...m)).toBeLessThan(0.5);
    // 上缘也齐：三条同 r₁ ⇒ 收缩后筒高逐位相同
    const t = run()
      .filter((r) => r.key !== 'pocket')
      .map((r) => r.top);
    expect(Math.max(...t) - Math.min(...t)).toBeLessThan(0.01);
  });

  it('换成袋那一环整体更高更浅：它的 ℓ 是另一个（系统语义，不是没对齐）', () => {
    const rows = run();
    const pocket = rows.find((r) => r.key === 'pocket')!;
    const flat = rows.find((r) => r.key === 'stepped')!;
    expect(pocket.sim.r).toBeCloseTo(0.66, 6);
    expect(flat.sim.r).toBeCloseTo(SKIN.R1, 6);
    expect(pocket.mouth - flat.mouth).toBeGreaterThan(15); // 嘴心高约 22px
    expect(pocket.top - flat.top).toBeGreaterThan(30); // 带顶高约 44px
  });

  it('挑台环挪到筒的下段：位置在离底 14–24%，且是纯平移（形态一个数没变）', () => {
    // 位置：三种同收缩终点的形态都落在下段（袋另有 ℓ，不参与）
    for (const r of run()) {
      if (r.key === 'pocket') continue;
      // 折叠体在筒的下段。2026-08-25 折叠加深后这个比例上移了一点——折叠体自己变大，
      // 嘴心跟着抬高，但**下缘离钉住点几乎没动**（+33~+50px / 筒高 221px）
      const frac = r.mouth / r.top;
      expect(frac, r.key).toBeGreaterThan(0.14);
      expect(frac, r.key).toBeLessThan(0.35);
    }
    // 纯平移：同一张键谱换 lead/tail 分配（总长不变）跑到底，剖面相对嘴心归一后逐点比对。
    // 这条同时卡住尾段别太短——实测 tail=7 时偏差 0.756，形状会被拽变形。
    const D = SKIN_UNITS.find((d) => d.key === 'stepped')!;
    const seg = placeOnBand(growSeg(D.spec[1]), RING_FREE, RING_CENTER);
    const shape = (lead: number): [number, number][] => {
      const tail = RING_LEAD + RING_TAIL - lead;
      const sim = createSkinUnit([['g', lead], seg, ['g', tail]], skinSiteOpts(D));
      for (let k = 0; k < SKIN.STEPS; k++) sim.advance();
      const bonds = (seg as readonly ['f', number, readonly SkinBond[]])[2];
      let widest = bonds[0];
      for (const b of bonds) if (b[1] - b[0] > widest[1] - widest[0]) widest = b;
      const mouth = -(sim.py[lead + widest[0]] + sim.py[lead + widest[1]]) / 2;
      const out: [number, number][] = [];
      for (let i = lead; i < lead + RING_FREE; i++)
        out.push([sim.px[i] * 100, (-sim.py[i] - mouth) * 100]);
      return out;
    };
    const a = shape(ARRAY_LEAD); // Lab.08 那副分配（环在腰上）
    const b = shape(RING_LEAD); // 现在这副（环在下段）
    let dev = 0;
    for (let i = 0; i < a.length; i++)
      dev = Math.max(dev, Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]));
    expect(dev).toBeLessThan(0.05);
  }, 30_000);

  it('半径下限卡在「相邻带刚好不互穿」上——芯轨那一圈也不穿', () => {
    expect(ringGap(RING.RADIUS_MIN)).toBeGreaterThan(0);
    expect(ringGap(RING.RADIUS_MIN - 2)).toBeLessThan(0); // 下限是紧的，不是随手取的
    expect(RING.RADIUS_DEF).toBeGreaterThanOrEqual(RING.RADIUS_MIN);
    expect(RING.RADIUS_DEF).toBeLessThanOrEqual(RING.RADIUS_MAX);
    // 芯轨比站位圆再靠内，那一圈的间隙才是最小的
    const railGap = ringPitch(RING.RADIUS_MIN - RAIL_INSET) - 2 * RAIL_HALF.t;
    expect(railGap).toBeGreaterThan(0);
  });

  it('缝随半径长：平台外缘的缝远宽于芯上的缝（用户 2026-08-23 拍板接受）', () => {
    const reach = Math.max(...run().map((r) => r.outX));
    const inner = ringGap(RING.RADIUS_DEF);
    const outer = ringGap(RING.RADIUS_DEF + reach);
    expect(outer).toBeGreaterThan(inner + 8);
    // 缝正比于半径：外缘节距 / 芯上节距 = 半径之比
    expect(ringPitch(RING.RADIUS_DEF + reach) / ringPitch(RING.RADIUS_DEF)).toBeCloseTo(
      (RING.RADIUS_DEF + reach) / RING.RADIUS_DEF,
      12,
    );
  });

  it('带深是 Lab.08 窄带的一半，厚度随之收窄（否则截面近正方形，读成方棍）', () => {
    expect(RING.DEPTH).toBeCloseTo(15.6 * 0.5, 12);
    expect(RING.THICK).toBeLessThan(SOLID.THICK);
    expect(RING.THICK).toBeLessThan(RING.DEPTH / 2);
  });
});
