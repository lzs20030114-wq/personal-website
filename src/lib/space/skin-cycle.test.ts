import { describe, expect, it } from 'vitest';
import {
  CYCLE_BAND,
  CYCLE_FREE,
  SkinCycleUnit,
  cycleShape,
  cycleShapes,
} from './skin-cycle';
import { buildRingUnits, RING_DEFAULT_FORM, RING_FREE, RING_LEAD } from './skin-ring';
import { buildSplitRingUnits } from './skin-split-ring';
import { SKIN, createSkinUnit, type SkinUnit } from './skin-unit';

/**
 * 守门：单元循环（总框架 §12.10 第 8 条，2026-10-06 作者四项拍板：0/1 触发 · 布条按最长预裁 ·
 * 先定形再落下 · 词汇表最小 = 平台 + 通道）。
 * 卡四件：① 两张谱在同一条 338 节带上、贴合总量与自由总量相同（收缩量才相同）；
 * ② 平台就是 Lab 2-5 那张阶梯方箱、通道就是 Lab 2-5 捏分裂到轴那档；
 * ③ 循环里每次成形与全新单元逐位相同、每次回到 idle 都是 0 键 + r=R0（布无记忆，探针 §26 的结论
 *    在 338 节带上照样成立）；④ 0/1 契约——过渡中不受理判断、非法转换抛错、换形先收回。
 * 一条 338 节带正向 / 回程各约 2–4 s，重活都给了显式预算，并复用已跑过的全新解。
 */
const shapes = cycleShapes();
const PLAT = cycleShape('platform', shapes);
const CHAN = cycleShape('channel', shapes);

const solve = (def: { spec: typeof PLAT.spec; opts: typeof PLAT.opts }) => {
  const s = createSkinUnit(def.spec, def.opts);
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return s;
};
const maxDiff = (a: SkinUnit, b: SkinUnit) => {
  let m = 0;
  for (let i = 0; i < a.n; i++) m = Math.max(m, Math.abs(a.px[i] - b.px[i]), Math.abs(a.py[i] - b.py[i]));
  return m;
};
const lockKey = (s: SkinUnit, off = 0) => s.locked.map(([i, j]) => `${i - off}-${j - off}`).sort().join(' ');
const noNaN = (s: SkinUnit) => {
  for (let i = 0; i < s.n; i++) if (Number.isNaN(s.px[i]) || Number.isNaN(s.py[i])) return false;
  return true;
};
/** 全新解只跑一次，几条用例共用 */
let freshPlat: SkinUnit | null = null;
let freshChan: SkinUnit | null = null;
const fresh = () => {
  freshPlat ??= solve(PLAT);
  freshChan ??= solve(CHAN);
  return { plat: freshPlat, chan: freshChan };
};

describe('单元循环 · 词汇表', () => {
  it('两张谱同在 338 节带上，贴合总量与自由总量相同（收缩量才一样）；结构段落在自由材料里', () => {
    const nodes = (spec: typeof PLAT.spec) => spec.reduce((a, s) => a + s[1], 0);
    const glue = (spec: typeof PLAT.spec) => {
      // 每个节点是贴合还是自由，逐节点比
      const out: number[] = [];
      for (const s of spec) for (let k = 0; k < s[1]; k++) out.push(s[0] === 'g' ? 1 : 0);
      return out;
    };
    expect(shapes.map((s) => s.key)).toEqual(['platform', 'channel']);
    for (const s of shapes) expect(nodes(s.spec)).toBe(CYCLE_BAND);
    expect(CYCLE_BAND).toBe(338);
    // 贴合的**总量**相同（8+16+16+5 = 45）、自由总量相同（293）⇒ 芯的收缩量相同；
    // 贴合段的位置不同（隔离段跟着垫走）——这是写进正文的假设（夹持位置可编程），不是守门要抹平的事
    const glued = (spec: typeof PLAT.spec) => glue(spec).filter((g) => g === 1).length;
    expect(glued(PLAT.spec)).toBe(glued(CHAN.spec));
    expect(glued(PLAT.spec)).toBe(CYCLE_BAND - CYCLE_FREE);
    expect(glue(PLAT.spec).filter((g) => g === 0)).toHaveLength(CYCLE_FREE);
    expect(glue(CHAN.spec).filter((g) => g === 0)).toHaveLength(CYCLE_FREE);
    expect(glue(PLAT.spec)).not.toEqual(glue(CHAN.spec));
    // 结构段落在自由材料里
    for (const s of shapes) {
      const g = glue(s.spec);
      for (let i = s.structure[0]; i < s.structure[1]; i++) expect(g[i]).toBe(0);
    }
    expect(PLAT.structure[1] - PLAT.structure[0]).toBe(RING_FREE);
  });

  it('通道 = Lab 2-5 捏分裂到轴那档（j0, t=1）逐字；平台的结构段 = 环族阶梯方箱逐字', () => {
    const j0 = buildSplitRingUnits()[0];
    expect(CHAN.spec).toEqual(j0.spec);
    expect(CHAN.opts).toEqual(j0.opts);
    expect(CHAN.seam).toBe(j0.seam);
    const stepped = buildRingUnits()[RING_DEFAULT_FORM];
    expect(stepped.key).toBe('stepped');
    expect(PLAT.spec[3]).toEqual(stepped.spec[1]);
    expect(PLAT.opts).toEqual(stepped.opts);
    expect(PLAT.seam).toBeUndefined();
  });

  it(
    '平台就是 Lab 2-5 那张平台：对自身中心逐点 ≤0.05 px、锁定集合相同；两张谱的顶端升降相同',
    () => {
      const { plat, chan } = fresh();
      const ring = solve(buildRingUnits()[RING_DEFAULT_FORM]);
      const off = PLAT.structure[0] - RING_LEAD;
      const c0 = RING_LEAD + (RING_FREE - 1) / 2;
      let m = 0;
      for (let i = RING_LEAD; i < RING_LEAD + RING_FREE; i++) {
        const dx = ring.px[i] - plat.px[i + off];
        const dy = ring.py[i] - ring.py[c0] - (plat.py[i + off] - plat.py[c0 + off]);
        m = Math.max(m, Math.abs(dx), Math.abs(dy));
      }
      expect(m * 100).toBeLessThan(0.05); // px
      expect(lockKey(plat, off)).toBe(lockKey(ring));
      expect(plat.locked.length).toBe(10);
      // 垫贴在芯上（自由材料「用多少取多少」，其余不鼓出来）
      for (let i = 0; i < plat.n; i++)
        if (plat.freeMask[i] && (i < PLAT.structure[0] || i >= PLAT.structure[1])) expect(Math.abs(plat.px[i])).toBeLessThan(1e-6);
      // 同一套贴合 + 同样的自由总量 ⇒ 顶端离钉住点一样高（带子顶端随收缩下降的量相同）
      const top = (s: SkinUnit) => s.py[0] - s.py[s.n - 1];
      expect(Math.abs(top(plat) - top(chan)) * 100).toBeLessThan(0.01);
      // 平台中心与通道缝心同一高度（居中构造），差在 px 级
      const yc = (s: SkinUnit, i: number) => (s.py[i] - s.py[s.n - 1]) * 100;
      expect(Math.abs(yc(plat, c0 + off) - yc(chan, CHAN.seam!))).toBeLessThan(2);
    },
    180_000,
  );
});

describe('单元循环 · 状态机', () => {
  it(
    'idle → 平台 → 回程 → idle → 通道 → 回程 → idle → 平台：每次成形 = 全新单元逐位相同，每次回到 idle 都是 0 键 / r=R0',
    () => {
      const { plat, chan } = fresh();
      const u = new SkinCycleUnit(shapes);
      expect(u.state).toBe('idle');
      expect(u.shape).toBeNull();
      expect(u.progress).toBe(0);

      // 判断 1：激活成平台
      expect(u.apply({ active: true, shape: 'platform' })).toBe(true);
      expect(u.state).toBe('forming');
      expect(u.shape).toBe('platform');
      u.run(300);
      expect(u.progress).toBeCloseTo(300 / SKIN.STEPS, 9);
      expect(u.apply({ active: false })).toBe(false); // 过渡中不受理
      expect(u.settle()).toBe('formed');
      expect(u.progress).toBe(1);
      expect(u.unit.locked.length).toBe(plat.locked.length);
      expect(lockKey(u.unit)).toBe(lockKey(plat));
      expect(maxDiff(u.unit, plat)).toBeLessThan(1e-9);

      // 判断 2：不激活 ⇒ 收回
      expect(u.apply({ active: true, shape: 'platform' })).toBe(false); // 同形继续激活 = 没事发生
      expect(u.apply({ active: false })).toBe(true);
      expect(u.state).toBe('retracting');
      u.run(200);
      expect(u.unit.retracting).toBe(true); // 引擎在第一步回程后才进回程态
      expect(u.apply({ active: true, shape: 'channel' })).toBe(false); // 过渡中不受理
      expect(u.settle()).toBe('idle');
      expect(u.shape).toBeNull();
      expect(u.cycles).toBe(1);
      expect(u.unit.locked).toHaveLength(0);
      expect(u.unit.r).toBe(SKIN.R0);
      expect(noNaN(u.unit)).toBe(true);

      // 判断 3：这次激活成通道（同一条布、不同的形）
      expect(u.apply({ active: true, shape: 'channel' })).toBe(true);
      expect(u.settle()).toBe('formed');
      expect(lockKey(u.unit)).toBe(lockKey(chan));
      expect(maxDiff(u.unit, chan)).toBeLessThan(1e-9);
      expect(u.shapeDef?.seam).toBe(CHAN.seam);

      // 判断 4：换形（通道 → 平台）= 先收回；回到 idle 才能落新形
      expect(u.apply({ active: true, shape: 'platform' })).toBe(true);
      expect(u.state).toBe('retracting');
      expect(u.settle()).toBe('idle');
      expect(u.unit.locked).toHaveLength(0); // 通道的预锁键（r=R0 就锁上的）也要在回程末全部解开
      expect(u.unit.r).toBe(SKIN.R0);
      expect(u.cycles).toBe(2);
      expect(u.apply({ active: true, shape: 'platform' })).toBe(true);
      expect(u.settle()).toBe('formed');
      expect(lockKey(u.unit)).toBe(lockKey(plat));
      expect(maxDiff(u.unit, plat)).toBeLessThan(1e-9);
    },
    300_000,
  );

  it(
    '成形中途收回：不出 NaN、回到 idle 0 键，再落下与全新单元逐位相同',
    () => {
      const { plat } = fresh();
      const u = new SkinCycleUnit(shapes);
      u.deploy('platform');
      u.run(700);
      expect(u.unit.locked.length).toBeGreaterThan(0); // 平台 step 575 左右已锁
      u.retract();
      expect(u.settle()).toBe('idle');
      expect(noNaN(u.unit)).toBe(true);
      expect(u.unit.locked).toHaveLength(0);
      expect(u.unit.r).toBe(SKIN.R0);
      u.deploy('platform');
      expect(u.settle()).toBe('formed');
      expect(lockKey(u.unit)).toBe(lockKey(plat));
      expect(maxDiff(u.unit, plat)).toBeLessThan(1e-9);
    },
    180_000,
  );

  it('非法转换抛错：idle 不能收回、非 idle 不能落下、词汇表外的形不认', () => {
    const u = new SkinCycleUnit(shapes);
    expect(() => u.retract()).toThrow();
    expect(() => u.deploy('ledge' as never)).toThrow();
    u.deploy('platform');
    expect(() => u.deploy('channel')).toThrow();
    expect(u.tick()).toBe('forming');
    expect(u.unit.step).toBe(1);
    u.retract(); // 成形中途收回允许（策略层决定用不用）
    expect(u.state).toBe('retracting');
    expect(() => u.deploy('channel')).toThrow();
    expect(u.tick()).toBe('retracting');
    expect(u.progress).toBeGreaterThan(0);
    // 词汇表必须同一条布：节数不同 / 自由总量不同的两张谱进同一个单元要被拒
    expect(() => new SkinCycleUnit([PLAT, { ...CHAN, spec: [['g', 10], PLAT.spec[3], ['g', 10]] }])).toThrow();
    expect(() => new SkinCycleUnit([PLAT, { ...CHAN, spec: [['g', 20], PLAT.spec[3], ['g', 338 - 20 - RING_FREE]] }])).toThrow();
    expect(() => new SkinCycleUnit([])).toThrow();
  });
});
