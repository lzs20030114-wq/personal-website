import { describe, expect, it } from 'vitest';
import {
  DUAL_FREE,
  DUAL_LEAD,
  DUAL_MID,
  DUAL_MID_EXACT,
  DUAL_MID_MIN,
  DUAL_MID_OPTIONS,
  DUAL_TAIL,
  buildDualBand,
  buildDualControl,
  buildDualDisplay,
} from './skin-dual';
import { SKIN, buildUnit, createSkinUnit, type SkinBond, type SkinSeg, type SkinSpec } from './skin-unit';

/**
 * 守门：双结构带（用户 2026-08-26 草图立项「条可以出现两个结构的」）。
 * 引擎零改——SkinSpec 本就是分段列表，这里卡的是构造本身的三句话：
 * ① 五段谱纪律（每个结构自己的缓冲 ≥4、中间贴合段 ≥ 合法下限）；
 * ② 单元级选项（r₁ / boxSquare）冲突的搭配拒收，不悄悄用一边的值；
 * ③ 解耦——锁定键集合与单结构逐位一致（任何合法 mid），且 mid ≥ 29 时
 *    「把另一个结构拿掉」的对照带**逐位相同**（精确 0，见 skin-dual.ts 文件头推导）。
 */

const RUN_TIMEOUT = 60_000; // run() 六条带 × 1500 步，默认 5s 预算不够

const runToEnd = (d: { spec: Parameters<typeof createSkinUnit>[0]; opts: Parameters<typeof createSkinUnit>[1] }) => {
  const s = createSkinUnit(d.spec, d.opts);
  for (let k = 0; k < SKIN.STEPS; k++) s.advance();
  return s;
};

/** 跑一轮收缩（默认间距的双直挑台 + 两条对照 + 双阶梯方箱；逐位解耦档一对）——共用，别重复跑 */
let RUN: ReturnType<typeof runAll> | null = null;
function runAll() {
  const exact = { mid: DUAL_MID_EXACT };
  return {
    dual: runToEnd(buildDualBand('ledge')),
    ctrlB: runToEnd(buildDualControl('ledge', 'ledge', 'B')), // 拿掉下结构 ⇒ 上结构的对照
    ctrlA: runToEnd(buildDualControl('ledge', 'ledge', 'A')), // 拿掉上结构 ⇒ 下结构的对照
    stepped: runToEnd(buildDualBand('stepped')),
    dual29: runToEnd(buildDualBand('ledge', 'ledge', exact)),
    ctrl29: runToEnd(buildDualControl('ledge', 'ledge', 'B', exact)),
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
  it('五段谱纪律：g/f/g/f/g，缓冲 ≥4，中间贴合段 ≥ 合法下限', () => {
    expect(DUAL_MID).toBeGreaterThanOrEqual(DUAL_MID_MIN);
    for (const mid of DUAL_MID_OPTIONS) expect(mid).toBeGreaterThanOrEqual(DUAL_MID_MIN);
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

  it('台架序列：四种同形对（目录序）+ 一条混排，键各不相同', () => {
    const defs = buildDualDisplay();
    expect(defs.map((d) => d.key)).toEqual([
      'dual-pocket',
      'dual-bulb',
      'dual-ledge',
      'dual-stepped',
      'dual-bulb-ledge',
    ]);
    for (const d of defs) expect(d.spec.map((s) => s[0])).toEqual(['g', 'f', 'g', 'f', 'g']);
  });

  it(
    '两条链各自锁定齐全，锁定数 = 单结构的两倍',
    () => {
      const { dual, stepped } = run();
      expect(dual.chains.length).toBe(2);
      expect(dual.locked.length).toBe(22); // 直挑台单结构 11
      expect(stepped.locked.length).toBe(20); // 阶梯方箱单结构 10
      for (const sim of [dual, stepped]) {
        const lockedSet = new Set(sim.locked.map(([a, b]) => a * 1024 + b));
        for (const ch of sim.chains)
          for (const [i, j] of ch) expect(lockedSet.has(i * 1024 + j)).toBe(true);
      }
    },
    RUN_TIMEOUT,
  );

  it(
    '解耦（默认 mid=16）：锁定键集合不变；形态偏差折叠体 ≤0.6px / 全段 ≤1.2px',
    () => {
      const { dual, ctrlB, ctrlA } = run();
      // 锁定键集合逐位相同（dual 链 0 vs ctrlB 唯一链、dual 链 1 vs ctrlA 唯一链）
      const keyOf = (b: readonly [number, number, number]) => `${b[0]}-${b[1]}`;
      const dualLocked = new Set(dual.locked.map(keyOf));
      expect(ctrlB.chains.length).toBe(1);
      expect(ctrlA.chains.length).toBe(1);
      for (const ctrl of [ctrlB, ctrlA])
        for (const b of ctrl.locked) expect(dualLocked.has(keyOf(b))).toBe(true);
      expect(dual.locked.length).toBe(ctrlB.locked.length + ctrlA.locked.length);
      // 形态逐节点比对（世界 px；实测折叠体 0.40/0.24、贴轴缓冲 0.75/0.86）
      const segDev = (ctrl: typeof dual, from: number, to: number) => {
        let body = 0;
        let all = 0;
        for (let i = from; i < to; i++) {
          const d = Math.hypot(dual.px[i] - ctrl.px[i], dual.py[i] - ctrl.py[i]) * 100;
          all = Math.max(all, d);
          if (dual.px[i] * 100 > 5) body = Math.max(body, d);
        }
        return { body, all };
      };
      const a0 = DUAL_LEAD;
      const b0 = DUAL_LEAD + DUAL_FREE + DUAL_MID;
      for (const s of [segDev(ctrlB, a0, a0 + DUAL_FREE), segDev(ctrlA, b0, b0 + DUAL_FREE)]) {
        expect(s.body).toBeLessThanOrEqual(0.6);
        expect(s.all).toBeLessThanOrEqual(1.2);
      }
    },
    RUN_TIMEOUT,
  );

  it(
    'mid=29（逐位解耦下限）：对照带与双结构带精确逐位相同',
    () => {
      const { dual29, ctrl29 } = run();
      let dev = 0;
      for (let i = 0; i < DUAL_LEAD + DUAL_FREE; i++)
        dev = Math.max(
          dev,
          Math.abs(dual29.px[i] - ctrl29.px[i]),
          Math.abs(dual29.py[i] - ctrl29.py[i]),
        );
      expect(dev).toBe(0); // 不是「很小」，是逐位相同——迭代内传导 29 节的推导实证
    },
    RUN_TIMEOUT,
  );

  it(
    '读得出是两个结构：两个折叠体离轴且上下分离，中间贴合段钉在芯上',
    () => {
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
    },
    RUN_TIMEOUT,
  );
});

describe('coreTether 皮-芯键（tunnel 机制，用户 2026-08-27 解禁）', () => {
  const spec = [
    ['g', 24],
    ['f', 61, [[8, 52, 0.32]], [[22, 38]]],
    ['g', 24],
  ] as unknown as Parameters<typeof createSkinUnit>[0];
  const opts = { coreWall: true, rootHug: 1, anchorEnd: true, boxSquare: true } as const;
  const run = (o: Parameters<typeof createSkinUnit>[1]) => {
    const s = createSkinUnit(spec, o);
    for (let k = 0; k < SKIN.STEPS; k++) s.advance();
    return s;
  };

  it(
    '默认不启用：给 undefined / 空表与不传逐位相同（Python 对照路径零影响）',
    () => {
      const base = run(opts);
      for (const variant of [{ ...opts, coreTether: undefined }, { ...opts, coreTether: [] }]) {
        const s = run(variant);
        let dev = 0;
        for (let i = 0; i < base.n; i++)
          dev = Math.max(dev, Math.abs(base.px[i] - s.px[i]), Math.abs(base.py[i] - s.py[i]));
        expect(dev).toBe(0);
      }
    },
    120_000,
  );

  it('附加链（谱第 5 元素，2026-08-29 捏分过渡需要）：各成独立链、各自跨度降序；空表与省略同义', () => {
    const bonds: SkinBond[] = [[4, 40, 0.24]];
    const extra: SkinBond[] = [[16, 28, 0.12], [12, 32, 0.16]];
    const spec5: SkinSpec = [
      ['g', 8],
      ['f', 45, bonds, [[18, 26]], [extra]],
      ['g', 8],
    ];
    const b5 = buildUnit(spec5);
    expect(b5.chains.length).toBe(2); // 主链 + 附加链，不并链
    expect(b5.chains[0]).toEqual([[12, 48, 0.24]]);
    expect(b5.chains[1]).toEqual([
      [20, 40, 0.16], // 附加链内部同样跨度降序 = 拉链序
      [24, 36, 0.12],
    ]);
    expect(b5.panels).toEqual([[26, 34]]);
    // 空附加链表 = 与四元素谱完全同构（默认路径零影响的结构面）
    const spec4: SkinSpec = [
      ['g', 8],
      ['f', 45, bonds, [[18, 26]]],
      ['g', 8],
    ];
    const bEmpty = buildUnit([['g', 8], ['f', 45, bonds, [[18, 26]], []], ['g', 8]]);
    expect(bEmpty).toEqual(buildUnit(spec4));
  });

  it(
    'sqChains：省略 = 全部链吃 boxSquare（既有行为）；指定后未列入的链不吃嘴角贴轴',
    () => {
      // 单链单元上 sqChains:[0] 与省略必须逐位相同（作用域=全集时是同一码路）
      const base = run(opts);
      const scoped = run({ ...opts, sqChains: [0] });
      let dev = 0;
      for (let i = 0; i < base.n; i++)
        dev = Math.max(dev, Math.abs(base.px[i] - scoped.px[i]), Math.abs(base.py[i] - scoped.py[i]));
      expect(dev).toBe(0);
      // 排除链 0 后嘴角不再被钉在轴上（贴轴是 boxSquare 独有的硬钉）
      const excluded = run({ ...opts, sqChains: [] });
      const mouth = excluded.chains[0][0];
      expect(Math.abs(excluded.px[mouth[0]]) + Math.abs(excluded.px[mouth[1]])).toBeGreaterThan(1e-6);
    },
    240_000,
  );

  it(
    '单侧限位：被限的节点不越出给定半径，且它是限位（不是钉死）——其余材料仍自由',
    () => {
      const base = run(opts);
      let peak = 0;
      let peakAt = 0;
      for (let i = 24; i < 24 + 61; i++)
        if (base.px[i] > peak) {
          peak = base.px[i];
          peakAt = i;
        }
      const cap = peak * 0.6;
      const s = run({ ...opts, coreTether: [[peakAt, cap]] });
      expect(s.px[peakAt]).toBeLessThanOrEqual(cap + 1e-12); // 不得越出
      // 单侧：限位之外的材料没有被一并钉住（仍有比 cap 更远的节点）
      let far = 0;
      for (let i = 24; i < 24 + 61; i++) far = Math.max(far, s.px[i]);
      expect(far).toBeGreaterThan(cap);
    },
    120_000,
  );
});
