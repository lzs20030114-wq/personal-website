import { describe, expect, it } from 'vitest';
import { ARRAY_DFAN, ARRAY_TOTAL, buildTransitionArray } from './skin-array';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import { SKIN, createSkinUnit } from './skin-unit';

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

  it('12 条带，t 单调 0→1，端点形态 = 站上原谱（只允许整体平移）· 各带总长一致', () => {
    expect(arr.length).toBe(12);
    for (let i = 1; i < arr.length; i++) expect(arr[i].t).toBeGreaterThan(arr[i - 1].t);
    const bulb = SKIN_UNITS.find((d) => d.key === 'bulb')!;
    const stepped = SKIN_UNITS.find((d) => d.key === 'stepped')!;
    // 端点形态 = 原谱逐字（跨度集 / 键长 / 面板跨度全等），只允许整体平移——
    // 位置不属形态（用户 2026-08-20 拍板）
    const sameShape = (got: typeof arr[number]['spec'][1], want: typeof arr[number]['spec'][1], d: number): void => {
      expect(got[1]).toBe(want[1]); // 自由段长度不变
      const a = got[2]!;
      const b = want[2]!;
      expect(a.length).toBe(b.length);
      a.forEach((bd, k) => {
        expect(bd[0]).toBe(b[k][0] + d); // 整体平移 d 节
        expect(bd[1]).toBe(b[k][1] + d);
        expect(bd[2]).toBe(b[k][2]); // 键长逐位不动
      });
      expect(got.length).toBe(want.length); // 面板有无一致
      if (got.length === 4 && want.length === 4) {
        expect(got[3][0][0]).toBe(want[3][0][0] + d);
        expect(got[3][0][1]).toBe(want[3][0][1] + d);
      }
    };
    sameShape(arr[0].spec[1], bulb.spec[1], ARRAY_DFAN[0]);
    sameShape(arr[11].spec[1], stepped.spec[1], ARRAY_DFAN[11]);
    expect(arr[0].opts).toEqual(skinSiteOpts(bulb));
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
      // lead 不在此列：它是**位置**量（放置规律的粗旋钮），不影响形态
      expect(Math.abs((b.spec[1][1] as number) - (a.spec[1][1] as number)), `${i}`).toBeLessThanOrEqual(1);
    }
  });

  it('方化渐入纪律：sq 单调不减、步长 ≤0.15、中间级 <1（禁止回到二值切换）；' +
     'panel 半跨单调不减至 ±8', () => {
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
    }
    expect(sqOf(arr[11])).toBe(1); // 端点全量
    expect(prevPw).toBe(8); // 末端 panel = 最内键跨（端面投影的启用前提）
  });

  it('全员物理冒烟 + 嘴心**全程**对齐（12 台同步推进，四个检查点各测一次）：' +
     '键谱全锁、贴轴不穿芯、顶端钉在天花、嘴心散布 ≤2px。' +
     '基准取嘴心是用户 2026-08-20 拍板（嘴的开口 = 键长 rb，理想终态直接定义的量；' +
     '体心与嘴心相差各形态自身的下垂量 Δ，二者不可能同时对齐）。' +
     '**必须卡全程不能只卡终态**：嘴心随收缩比 r 走一次式（斜率 2f·φ），' +
     '只对终态标定的话早期会散开——首版即此病，早期 4.78px / 终态 1.01px，' +
     '而台架大部分时间在收缩过程中。改形状后超差 = 按 scripts/skin-array/calibrate.mjs 重标',
     { timeout: 60000 }, () => {
    const CPS = [150, 450, 750, SKIN.STEPS - 1];
    const sims = arr.map((u) => createSkinUnit(u.spec, u.opts));
    const mouth = (sim: (typeof sims)[number]): number => {
      const [i, j] = sim.chains[0][0]; // 最外键对 = 嘴
      return (-(sim.py[i] + sim.py[j]) / 2) * 100;
    };
    for (let s = 0; s < SKIN.STEPS; s++) {
      for (const sim of sims) sim.advance();
      if (!CPS.includes(s)) continue;
      const ms = sims.map(mouth);
      expect(Math.max(...ms) - Math.min(...ms), `step ${s}`).toBeLessThanOrEqual(2);
    }
    for (const sim of sims) {
      expect(sim.locked.length).toBe(sim.chains.flat().length);
      expect(Math.abs(sim.py[0])).toBe(0); // 顶端贴天花（钉轴给的是 −0，宽容符号）
      for (let k = 0; k < sim.n; k++) expect(sim.px[k]).toBeGreaterThanOrEqual(0);
    }
  });
});
