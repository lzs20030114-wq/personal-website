import { describe, expect, it } from 'vitest';
import {
  DUAL_FREE,
  DUAL_LEAD,
  DUAL_MID,
  DUAL_MID_MIN,
  DUAL_TAIL,
  buildDualBand,
  buildDualControl,
} from './skin-dual';
import { SKIN, createSkinUnit, type SkinBond, type SkinSeg } from './skin-unit';

/**
 * 守门：双结构带（用户 2026-08-26 草图立项「条可以出现两个结构的」）。
 * 引擎零改——SkinSpec 本就是分段列表，这里卡的是构造本身的三句话：
 * ① 五段谱纪律（每个结构自己的缓冲 ≥4、中间贴合段 ≥ 解耦下限）；
 * ② 单元级选项（r₁ / boxSquare）冲突的搭配拒收，不悄悄用一边的值；
 * ③ 解耦——另一个结构在不在，这个结构的锁定键集合与形态逐位不变。
 */

const runToEnd = (spec: Parameters<typeof createSkinUnit>[0], opts: Parameters<typeof createSkinUnit>[1]) => {
  const s = createSkinUnit(spec, opts);
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return s;
};

/** 跑一轮收缩（双直挑台 + 两条对照 + 双阶梯方箱）——多个用例共用，别重复跑 */
let RUN: ReturnType<typeof runAll> | null = null;
function runAll() {
  const dualDef = buildDualBand('ledge');
  const ctrlB = buildDualControl('ledge', 'ledge', 'B'); // 拿掉下结构 ⇒ 上结构的对照
  const ctrlA = buildDualControl('ledge', 'ledge', 'A'); // 拿掉上结构 ⇒ 下结构的对照
  const steppedDef = buildDualBand('stepped');
  return {
    dualDef,
    dual: runToEnd(dualDef.spec, dualDef.opts),
    ctrlB: runToEnd(ctrlB.spec, ctrlB.opts),
    ctrlA: runToEnd(ctrlA.spec, ctrlA.opts),
    steppedDef,
    stepped: runToEnd(steppedDef.spec, steppedDef.opts),
  };
}
const run = (): ReturnType<typeof runAll> => (RUN ??= runAll());

/** 段内键谱的两端缓冲节数（交接件纪律 ≥4） */
function buffers(seg: SkinSeg): [number, number] {
  const bonds = seg[2] as readonly SkinBond[];
  let lo = seg[1];
  let hi = 0;
  for (const [i, j] of bonds) {
    lo = Math.min(lo, i);
    hi = Math.max(hi, j);
  }
  return [lo, seg[1] - 1 - hi];
}

describe('skin-dual 双结构带', () => {
  it('五段谱纪律：g/f/g/f/g，缓冲 ≥4，中间贴合段 ≥ 解耦下限', () => {
    expect(DUAL_MID).toBeGreaterThanOrEqual(DUAL_MID_MIN);
    for (const key of ['pocket', 'bulb', 'ledge', 'stepped']) {
      const d = buildDualBand(key);
      expect(d.spec.map((s) => s[0])).toEqual(['g', 'f', 'g', 'f', 'g']);
      expect(d.spec[1][1]).toBe(DUAL_FREE);
      expect(d.spec[3][1]).toBe(DUAL_FREE);
      const total = d.spec.reduce((a, s) => a + s[1], 0);
      expect(total).toBe(DUAL_LEAD + DUAL_MID + DUAL_TAIL + 2 * DUAL_FREE);
      for (const i of [1, 3] as const) {
        const [top, bot] = buffers(d.spec[i] as SkinSeg);
        expect(top).toBeGreaterThanOrEqual(4);
        expect(bot).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('单元级选项冲突的搭配拒收（单收缩自由度；boxSquare 作用于全部链）', () => {
    expect(() => buildDualBand('pocket', 'ledge')).toThrow(/收缩自由度/); // r₁ 0.66 vs 0.30
    expect(() => buildDualBand('bulb', 'stepped')).toThrow(/boxSquare/);
    expect(() => buildDualBand('bulb', 'ledge')).not.toThrow(); // 同 r₁、同无方箱 = 合法混排
  });

  it('两条链各自锁定齐全，锁定数 = 单结构的两倍', () => {
    const { dual, stepped } = run();
    expect(dual.chains.length).toBe(2);
    expect(dual.locked.length).toBe(22); // 直挑台单结构 11
    expect(stepped.locked.length).toBe(20); // 阶梯方箱单结构 10
    for (const sim of [dual, stepped]) {
      const lockedSet = new Set(sim.locked.map(([a, b]) => a * 1024 + b));
      for (const ch of sim.chains)
        for (const [i, j] of ch) expect(lockedSet.has(i * 1024 + j)).toBe(true);
    }
  });

  it('解耦：拿掉另一个结构，这个结构的锁定键集合不变、形态偏差 ≤0.25px', () => {
    const { dual, ctrlB, ctrlA } = run();
    // 锁定键集合逐位相同（按链比对：dual 链 0 vs ctrlB 唯一链、dual 链 1 vs ctrlA 唯一链）
    const keyOf = (b: readonly [number, number, number]) => `${b[0]}-${b[1]}`;
    const dualLocked = new Set(dual.locked.map(keyOf));
    expect(ctrlB.chains.length).toBe(1);
    expect(ctrlA.chains.length).toBe(1);
    for (const ctrl of [ctrlB, ctrlA])
      for (const b of ctrl.locked) expect(dualLocked.has(keyOf(b))).toBe(true);
    expect(dual.locked.length).toBe(ctrlB.locked.length + ctrlA.locked.length);
    // 形态逐节点比对（世界 px；实测 0.090 / 0.006）
    const segDev = (ctrl: typeof dual, from: number, to: number) => {
      let d = 0;
      for (let i = from; i < to; i++)
        d = Math.max(d, Math.hypot(dual.px[i] - ctrl.px[i], dual.py[i] - ctrl.py[i]) * 100);
      return d;
    };
    const a0 = DUAL_LEAD;
    const b0 = DUAL_LEAD + DUAL_FREE + DUAL_MID;
    expect(segDev(ctrlB, a0, a0 + DUAL_FREE)).toBeLessThanOrEqual(0.25);
    expect(segDev(ctrlA, b0, b0 + DUAL_FREE)).toBeLessThanOrEqual(0.25);
  });

  it('读得出是两个结构：两个折叠体离轴且上下分离，中间贴合段钉在芯上', () => {
    const { dual } = run();
    const body = (from: number, to: number) => {
      let out = 0;
      let top = Infinity;
      let bot = -Infinity;
      for (let i = from; i < to; i++) {
        const x = dual.px[i] * 100;
        if (x < 5) continue; // 只看离轴的折叠体，贴轴缓冲不算
        out = Math.max(out, x);
        const y = -dual.py[i] * 100; // 向下为正
        top = Math.min(top, y);
        bot = Math.max(bot, y);
      }
      return { out, top, bot };
    };
    const A = body(DUAL_LEAD, DUAL_LEAD + DUAL_FREE);
    const B = body(DUAL_LEAD + DUAL_FREE + DUAL_MID, DUAL_LEAD + DUAL_FREE + DUAL_MID + DUAL_FREE);
    expect(A.out).toBeGreaterThan(30);
    expect(B.out).toBeGreaterThan(30);
    expect(A.bot).toBeLessThan(B.top); // 上结构整体在下结构之上，不搭接
    // 中间贴合段整段钉在芯上（解耦的物理来源）
    for (let i = DUAL_LEAD + DUAL_FREE; i < DUAL_LEAD + DUAL_FREE + DUAL_MID; i++)
      expect(Math.abs(dual.px[i])).toBeLessThan(1e-12);
  });
});
