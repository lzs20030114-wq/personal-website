import { describe, expect, it } from 'vitest';
import { ARRAY_TOTAL, buildTransitionArray } from './skin-array';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import { SKIN, createSkinUnit, renderSmooth } from './skin-unit';

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

  it('12 条带，t 单调 0→1，端点键谱段 = 站上原谱（对象同一）· 各带总长一致', () => {
    expect(arr.length).toBe(12);
    for (let i = 1; i < arr.length; i++) expect(arr[i].t).toBeGreaterThan(arr[i - 1].t);
    const bulb = SKIN_UNITS.find((d) => d.key === 'bulb')!;
    const stepped = SKIN_UNITS.find((d) => d.key === 'stepped')!;
    // 形态 = 键谱段，逐字原谱（对象同一）；lead（形状在带上的位置）与尾段长度
    // 是位置/配平量，按用户 2026-08-20 指令走对位表，不属形态
    expect(arr[0].spec[1]).toBe(bulb.spec[1]);
    expect(arr[0].opts).toEqual(skinSiteOpts(bulb));
    expect(arr[11].spec[1]).toBe(stepped.spec[1]);
    expect(arr[11].opts).toEqual(skinSiteOpts(stepped));
    expect(arr[11].opts.boxSquare).toBe(true);
    // 尾段配平：总长恒定 ⇒ 帘子下缘齐（此前差 5 节 = 10px 参差）
    for (const u of arr) expect(u.spec.reduce((a, x) => a + x[1], 0)).toBe(ARRAY_TOTAL);
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
     'panel 半跨单调不减至 ±8；lead 相邻至多差 1 节（对位表，不是任意跳）', () => {
    let prevSq = 0;
    let prevPw = 0;
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
      if (i > 0) expect(Math.abs(u.spec[0][1] - arr[i - 1].spec[0][1]), `lead i=${i}`).toBeLessThanOrEqual(1);
    }
    expect(sqOf(arr[11])).toBe(1); // 端点全量
    expect(prevPw).toBe(8); // 末端 panel = 最内键跨（端面投影的启用前提）
  });

  it('全员物理冒烟 + 居中对齐（12 台跑到终态）：键谱全锁、贴轴不穿芯、顶端钉在天花、' +
     '**凸出体**中线散布 ≤2px（用户 2026-08-20「保证上端对齐，改形状在线上的位置来居中」；' +
     '判据必须是离轴那团——贴轴的缓冲料藏在竖带里，算进去就对错了东西。' +
     '改任何形状后散布超差 = 需按 scratch 标定脚本重标 LEAD 表）', { timeout: 60000 }, () => {
    const centers: number[] = [];
    for (const u of arr) {
      const sim = createSkinUnit(u.spec, u.opts);
      for (let s = 0; s < SKIN.STEPS; s++) sim.advance();
      expect(sim.locked.length).toBe(sim.chains.flat().length);
      expect(Math.abs(sim.py[0])).toBe(0); // 顶端贴天花（钉轴给的是 −0，宽容符号）
      for (let k = 0; k < sim.n; k++) expect(sim.px[k]).toBeGreaterThanOrEqual(0);
      const p = renderSmooth(sim.px, sim.py, u.smooth[0], u.smooth[1]);
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = 0; k < sim.n; k++) {
        if (p.x[k] < 0.08) continue; // 离轴 8px 以上才算「看得见的形状」
        if (p.y[k] < lo) lo = p.y[k];
        if (p.y[k] > hi) hi = p.y[k];
      }
      centers.push((-(lo + hi) / 2) * 100);
    }
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(2);
  });
});
