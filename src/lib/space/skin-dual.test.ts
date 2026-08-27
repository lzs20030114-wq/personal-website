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
  buildDualTransition,
} from './skin-dual';
import { SKIN, createSkinUnit, type SkinBond, type SkinSeg, type SkinUnit } from './skin-unit';

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

describe('skin-dual 过渡组（单方箱 → 双方箱）', () => {
  const T = buildDualTransition();

  it('构造：12 级、端点逐字、A 全程同一对象、顶端锚定、等长键', () => {
    expect(T.length).toBe(12);
    expect((T[0].spec[3] as SkinSeg)[2]).toEqual([]); // L0 = 真单结构（B 段无键）
    expect(T[T.length - 1].spec[3]).toEqual(buildDualBand('stepped').spec[3]); // 末级 = 双方箱正谱
    for (let i = 2; i < T.length; i++) expect(T[i].spec[1]).toBe(T[1].spec[1]); // A 引用同一
    expect(T[0].spec[1]).toEqual(T[1].spec[1]);
    // 五段布局全级恒定（收缩轨迹逐位同步的前提）
    const layout = T[0].spec.map((s) => [s[0], s[1]]);
    for (const d of T) expect(d.spec.map((s) => [s[0], s[1]])).toEqual(layout);
    // 顶端锚定 + 等长键 + 生长时间表
    const spans: number[] = [];
    let prevCount = 0;
    for (const d of T.slice(1)) {
      const bonds = (d.spec[3] as SkinSeg)[2] as readonly SkinBond[];
      expect(Math.min(...bonds.map((b) => b[0]))).toBe(4); // 最外键上角恒在节点 4
      for (const b of bonds) expect(b[2]).toBe(bonds[0][2]); // 等长键
      expect(bonds.length).toBeGreaterThanOrEqual(prevCount);
      prevCount = bonds.length;
      spans.push(Math.max(...bonds.map((b) => (b[1] - b[0]) / 2)));
    }
    expect(spans).toEqual([8, 10, 12, 14, 16, 18, 20, 22, 24, 25, 26]);
  });

  it(
    '物理：逐级锁定齐全、B 挑出单调爬升、嘴逐级小步下落、剪影相邻距离有界',
    () => {
      const segB0 = DUAL_LEAD + DUAL_FREE + DUAL_MID;
      const sims: SkinUnit[] = T.map((d) => {
        const s = createSkinUnit(d.spec, d.opts);
        for (let k = 0; k < SKIN.STEPS; k++) s.advance();
        return s;
      });
      // 剪影：沿带高逐格取最大离轴 x（评平滑必须用它——等弧长口径会把贴轴压紧的
      // 隐藏松弛的轴向重排计成大 Δ，而画面几乎没变；见 draft.mjs 同名实现）
      const DY = 2;
      const silhouette = (s: SkinUnit): Float64Array => {
        let y0 = Infinity;
        let y1 = -Infinity;
        for (let i = 0; i < s.n; i++) {
          const y = -s.py[i] * 100;
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
        const sil = new Float64Array(Math.ceil((y1 - y0) / DY) + 1);
        for (let i = 0; i < s.n; i++) {
          const b = Math.round((-s.py[i] * 100 - y0) / DY);
          const x = s.px[i] * 100;
          if (x > sil[b]) sil[b] = x;
        }
        return sil;
      };
      let prevOut = 0;
      let prevMouth: number | null = null;
      let prevSil: Float64Array | null = null;
      sims.forEach((s, li) => {
        // 锁定齐全（每级全部键都要锁上，B 的链一根不欠）
        let total = 0;
        for (const ch of s.chains) total += ch.length;
        expect(s.locked.length).toBe(total);
        // B 挑出单调爬升（结构的出生是材料捕获的连续爬升，不许回缩）
        let out = 0;
        for (let i = segB0; i < segB0 + DUAL_FREE; i++) out = Math.max(out, s.px[i] * 100);
        expect(out).toBeGreaterThanOrEqual(prevOut - 0.3);
        prevOut = out;
        // 嘴逐级小步移动（首版事故 = 欠定翻跳，单步 60px 量级；现全程 ≤13px/级）
        if (li >= 1) {
          const [a] = s.chains[1][0];
          const mouthY = -s.py[a] * 100;
          if (prevMouth !== null) expect(Math.abs(mouthY - prevMouth)).toBeLessThanOrEqual(13);
          prevMouth = mouthY;
        }
        // 剪影相邻距离 ≤4.5px（实测 0.05–3.76；断层判据）
        const sil = silhouette(s);
        if (prevSil) {
          const n = Math.max(sil.length, prevSil.length);
          let d = 0;
          for (let i = 0; i < n; i++) d += Math.abs((sil[i] ?? 0) - (prevSil[i] ?? 0));
          expect(d / n).toBeLessThanOrEqual(4.5);
        }
        prevSil = sil;
      });
    },
    240_000,
  );
});
