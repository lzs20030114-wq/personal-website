import { beforeAll, describe, expect, it } from 'vitest';
import { ARRAY_CENTER, ARRAY_FREE, ARRAY_LEAD } from './skin-array';
import { SKIN_UNITS } from './skin-data';
import { GRAD_LEVELS, buildGradientOrder, buildRingGradient } from './skin-ring-gradient';
import { RING } from './skin-ring';
import { SKIN, createSkinUnit, type SkinBond } from './skin-unit';

/**
 * 守门：Lab.09 环上渐变（蘑菇挑台 ↔ 阶梯方箱，一圈一个来回）。
 * 卡三件事——① 编制闭合（一圈是周期的，首尾必须接得上）；
 * ② 端点仍是站上原谱、纪律未破；③ 逐级微变没有断层，且平台仍然是平的。
 * 第三条是最要紧的：时间表一改就可能出 Lab.08 当初被否的那种台阶。
 */

const LV = buildRingGradient();
const ORDER = buildGradientOrder(RING.COUNT);
const bondsOf = (d: (typeof LV)[number]): readonly SkinBond[] =>
  (d.spec[1] as readonly ['f', number, readonly SkinBond[]])[2];
const panelOf = (d: (typeof LV)[number]): readonly (readonly [number, number])[] | undefined => {
  const seg = d.spec[1];
  return seg.length === 4 ? (seg[3] as readonly (readonly [number, number])[]) : undefined;
};

/** 跑完一轮（11 级，约 6s）——多个用例共用 */
let RUN: ReturnType<typeof runAll> | null = null;
const M = 160;
function runAll() {
  return LV.map((d) => {
    const s = createSkinUnit(d.spec, d.opts);
    for (let k = 0; k < SKIN.STEPS; k++) s.advance();
    const pts: [number, number][] = [];
    for (let i = ARRAY_LEAD; i < ARRAY_LEAD + ARRAY_FREE; i++)
      pts.push([s.px[i] * 100, -s.py[i] * 100]);
    // 等弧长重采样，形态之间才可比
    const L = [0];
    for (let i = 1; i < pts.length; i++)
      L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = L[L.length - 1];
    const samp: [number, number][] = [];
    let j = 0;
    for (let m = 0; m < M; m++) {
      const t = (m / (M - 1)) * total;
      while (j < L.length - 2 && L[j + 1] < t) j++;
      const f = (t - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
      samp.push([
        pts[j][0] + f * (pts[j + 1][0] - pts[j][0]),
        pts[j][1] + f * (pts[j + 1][1] - pts[j][1]),
      ]);
    }
    // 嘴心（最外键对中点）距下缘
    const bonds = bondsOf(d);
    let widest = bonds[0];
    for (const b of bonds) if (b[1] - b[0] > widest[1] - widest[0]) widest = b;
    const foot = s.py[s.n - 1];
    const mouth =
      ((s.py[ARRAY_LEAD + widest[0]] + s.py[ARRAY_LEAD + widest[1]]) / 2 - foot) * 100;
    return { sim: s, samp, mouth };
  });
}
const run = (): ReturnType<typeof runAll> => RUN!;
const dist = (a: [number, number][], b: [number, number][]): number => {
  let s = 0;
  for (let i = 0; i < M; i++) s += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
  return s / M;
};

describe('skin-ring-gradient 环上渐变', () => {
  // 十一条引擎各跑满 1500 步，约 10s——一次算好给下面三个用例共用
  beforeAll(() => {
    RUN = runAll();
  }, 60_000);

  it('编制闭合：20 位回文，相邻恒差一级，首尾（19↔0）也接得上', () => {
    expect(ORDER.length).toBe(RING.COUNT);
    expect(Math.max(...ORDER)).toBe(GRAD_LEVELS - 1);
    expect(Math.min(...ORDER)).toBe(0);
    // 一圈是周期的：**含首尾这一对**在内，每对邻居都只差一级
    for (let i = 0; i < ORDER.length; i++) {
      const j = (i + 1) % ORDER.length;
      expect(Math.abs(ORDER[i] - ORDER[j]), `位置 ${i}↔${j}`).toBe(1);
    }
    // 两个折返点各出现一次，其余每级两次（回文）
    const count = (l: number): number => ORDER.filter((v) => v === l).length;
    expect(count(0)).toBe(1);
    expect(count(GRAD_LEVELS - 1)).toBe(1);
    for (let l = 1; l < GRAD_LEVELS - 1; l++) expect(count(l), `级 ${l}`).toBe(2);
  });

  it('端点逐字取站上原谱：跨度集/键长/面板只整体平移', () => {
    for (const [l, key] of [[0, 'bulb'], [GRAD_LEVELS - 1, 'stepped']] as const) {
      const src = SKIN_UNITS.find((d) => d.key === key)!.spec[1];
      expect(src[0]).toBe('f');
      if (src[0] !== 'f') return;
      const a = src[2];
      const b = bondsOf(LV[l]);
      expect(b.length).toBe(a.length);
      const shift = b[0][0] - a[0][0];
      a.forEach(([i, j, rb], k) => {
        expect(b[k][0]).toBe(i + shift);
        expect(b[k][1]).toBe(j + shift);
        expect(b[k][2]).toBe(rb);
      });
    }
  });

  it('逐级纪律：键长单调、方化强度单调、两个离散跳变各只发生一次', () => {
    const rb = LV.map((d) => bondsOf(d)[0][2]);
    for (let l = 1; l < GRAD_LEVELS; l++) expect(rb[l], `级 ${l}`).toBeGreaterThan(rb[l - 1]);
    const sq = LV.map((d) => {
      const v = d.opts.boxSquare;
      return v === true ? 1 : typeof v === 'number' ? v : 0;
    });
    for (let l = 1; l < GRAD_LEVELS; l++) expect(sq[l], `级 ${l}`).toBeGreaterThanOrEqual(sq[l - 1]);
    expect(sq[0]).toBe(0);
    expect(sq[GRAD_LEVELS - 1]).toBe(1);
    // 端面找平：一旦给了就不撤，只跳一次
    const hasPanel = LV.map((d) => !!panelOf(d));
    expect(hasPanel.filter((v, i) => v && !hasPanel[i - 1]).length).toBe(1);
    // 梯挡数：单调不减，只跳一次
    const nb = LV.map((d) => bondsOf(d).length);
    let jumps = 0;
    for (let l = 1; l < GRAD_LEVELS; l++) {
      expect(nb[l], `级 ${l}`).toBeGreaterThanOrEqual(nb[l - 1]);
      if (nb[l] > nb[l - 1]) jumps++;
    }
    expect(jumps).toBe(1);
  });

  it('每级两端各留 ≥4 节缓冲，扇形正居中（对位构造的前提）', () => {
    for (const d of LV) {
      const bonds = bondsOf(d);
      let lo = Number.POSITIVE_INFINITY;
      let hi = -1;
      for (const [i, j] of bonds) {
        lo = Math.min(lo, i);
        hi = Math.max(hi, j);
      }
      expect(lo).toBeGreaterThanOrEqual(4);
      expect(ARRAY_FREE - 1 - hi).toBeGreaterThanOrEqual(4);
      expect((lo + hi) / 2).toBeCloseTo(ARRAY_CENTER, 12);
    }
  });

  it('逐级微变没有断层：相邻形态距离 0.5–2.5px，最大/最小 ≤3.2×', () => {
    const rows = run();
    const gaps = rows.slice(1).map((r, i) => dist(rows[i].samp, r.samp));
    for (const g of gaps) {
      expect(g).toBeGreaterThan(0.5); // 太小 = 这一格白给
      expect(g).toBeLessThan(2.5); // 太大 = 断层（Lab.08 当初被否的那种）
    }
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThanOrEqual(3.2);
    // 首尾接缝 = 级 0↔1 那一步，与其余同量级 ⇒ 一圈闭合
    expect(gaps[0]).toBeLessThan(Math.max(...gaps));
  });

  it('平台仍然是平的：11 级的嘴心逐位齐平（对位构造在渐变下照样成立）', () => {
    const m = run().map((r) => r.mouth);
    expect(Math.max(...m) - Math.min(...m)).toBeLessThan(1.2);
  });

  it('每级都真的锁定成形，无 NaN', () => {
    for (const r of run()) {
      expect(r.sim.locked.length).toBeGreaterThan(6);
      for (let i = 0; i < r.sim.n; i++) {
        expect(Number.isFinite(r.sim.px[i])).toBe(true);
        expect(Number.isFinite(r.sim.py[i])).toBe(true);
      }
    }
  });
});
