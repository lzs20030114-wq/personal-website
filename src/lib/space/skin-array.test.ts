import { describe, expect, it } from 'vitest';
import { buildTransitionArray } from './skin-array';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import { createSkinUnit } from './skin-unit';

/**
 * 守门：Lab.08 阵列过渡的键谱序列（v2 = 用户 2026-08-20 线稿拍板的定版系列）。
 * 最可能的事故：① 端点被「顺手插值」得不再是站上原谱（那台方箱是用户逐轮拍板
 * 磨出来的，端点必须逐字用它）；② 中间级跳变过大（「微小形变」名存实亡）——
 * 首版正是栽在这里：方化在末格二值切换，断层 = 其他步的 7 倍；③ 取整后缓冲
 * 吃穿（交接件「键谱两端 ≥4 节缓冲」纪律）。
 */
describe('skin-array 阵列过渡', () => {
  const arr = buildTransitionArray();
  const sqOf = (u: (typeof arr)[number]): number =>
    typeof u.opts.boxSquare === 'number' ? u.opts.boxSquare : u.opts.boxSquare === true ? 1 : 0;

  it('12 条带，t 单调 0→1，端点 = 站上原谱（对象同一 + 选项深等）', () => {
    expect(arr.length).toBe(12);
    for (let i = 1; i < arr.length; i++) expect(arr[i].t).toBeGreaterThan(arr[i - 1].t);
    const bulb = SKIN_UNITS.find((d) => d.key === 'bulb')!;
    const stepped = SKIN_UNITS.find((d) => d.key === 'stepped')!;
    expect(arr[0].spec).toBe(bulb.spec);
    expect(arr[0].opts).toEqual(skinSiteOpts(bulb));
    expect(arr[11].spec).toBe(stepped.spec);
    expect(arr[11].opts).toEqual(skinSiteOpts(stepped));
    expect(arr[11].opts.boxSquare).toBe(true);
  });

  it('每级纪律：等长键、缓冲 ≥4 节、rb 严格递增、梯挡数不减', () => {
    let prevRb = -1;
    let prevCount = 0;
    for (const u of arr) {
      const f = u.spec[1];
      expect(f[0]).toBe('f');
      const bonds = f[2]!;
      const rbSet = new Set(bonds.map((b) => b[2]));
      expect(rbSet.size, `t=${u.t}`).toBe(1); // 等长键纪律
      const rb = bonds[0][2];
      const minI = Math.min(...bonds.map((b) => b[0]));
      const maxJ = Math.max(...bonds.map((b) => b[1]));
      expect(minI, `t=${u.t}`).toBeGreaterThanOrEqual(4);
      expect(f[1] - 1 - maxJ, `t=${u.t}`).toBeGreaterThanOrEqual(4);
      expect(rb).toBeGreaterThan(prevRb);
      expect(bonds.length).toBeGreaterThanOrEqual(prevCount);
      prevRb = rb;
      prevCount = bonds.length;
    }
  });

  it('相邻微小形变：rb 步长 ≤0.021、梯挡至多 +1、段落表逐项至多 ±1', () => {
    for (let i = 1; i < arr.length; i++) {
      const a = arr[i - 1];
      const b = arr[i];
      const rbA = a.spec[1][2]![0][2];
      const rbB = b.spec[1][2]![0][2];
      expect(rbB - rbA, `${i}`).toBeLessThanOrEqual(0.021);
      expect(b.spec[1][2]!.length - a.spec[1][2]!.length, `${i}`).toBeLessThanOrEqual(1);
      expect(Math.abs((b.spec[0][1] as number) - (a.spec[0][1] as number)), `${i}`).toBeLessThanOrEqual(1);
      expect(Math.abs((b.spec[1][1] as number) - (a.spec[1][1] as number)), `${i}`).toBeLessThanOrEqual(1);
    }
  });

  it('方化渐入纪律：sq 单调不减、步长 ≤0.15、中间级 <1（禁止回到二值切换）；' +
     'panel 半跨单调不减至 ±8；lead 单调不增', () => {
    let prevSq = 0;
    let prevPw = 0;
    let prevLead = Infinity;
    for (let i = 0; i < arr.length; i++) {
      const u = arr[i];
      const sq = sqOf(u);
      expect(sq, `sq i=${i}`).toBeGreaterThanOrEqual(prevSq);
      expect(sq - prevSq, `sq 步长 i=${i}`).toBeLessThanOrEqual(0.1501);
      if (i > 0 && i < arr.length - 1) expect(sq, `中间级 i=${i}`).toBeLessThan(1);
      prevSq = sq;
      const f = u.spec[1];
      const panel = f.length === 4 ? f[3][0] : null;
      const pw = panel ? (panel[1] - panel[0]) / 2 : 0;
      expect(pw, `panel 半跨 i=${i}`).toBeGreaterThanOrEqual(prevPw);
      prevPw = pw;
      const lead = u.spec[0][1];
      expect(lead, `lead i=${i}`).toBeLessThanOrEqual(prevLead);
      prevLead = lead;
    }
    expect(sqOf(arr[11])).toBe(1); // 端点全量
    expect(prevPw).toBe(8); // 末端 panel = 最内键跨（端面投影的启用前提）
  });

  it('中间级物理冒烟（i=3/6/9 跑到 step 1000）：键谱全员锁定、贴轴不穿芯', () => {
    for (const i of [3, 6, 9]) {
      const u = arr[i];
      const sim = createSkinUnit(u.spec, u.opts);
      for (let s = 0; s < 1000; s++) sim.advance();
      expect(sim.locked.length, `i=${i}`).toBe(sim.chains.flat().length);
      for (let k = 0; k < sim.n; k++) expect(sim.px[k]).toBeGreaterThanOrEqual(0);
    }
  });
});
