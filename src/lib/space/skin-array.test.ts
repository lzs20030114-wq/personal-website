import { describe, expect, it } from 'vitest';
import { ARRAY_CENTER, ARRAY_FREE, ARRAY_TOTAL, buildTransitionArray } from './skin-array';
import { SKIN_UNITS, skinSiteOpts } from './skin-data';
import { SKIN, createSkinUnit } from './skin-unit';

/**
 * 守门：Lab.08 阵列过渡的键谱序列（v2 = 用户 2026-08-20 线稿拍板的定版系列）。
 * 最可能的事故：① 端点被「顺手插值」得不再是站上原谱（那台方箱是用户逐轮拍板
 * 磨出来的，端点必须逐字用它）；② 中间级跳变过大（「微小形变」名存实亡）——
 * 首版正是栽在这里：方化在末格二值切换，断层 = 其他步的 7 倍；③ 取整后缓冲
 * 吃穿（交接件「键谱两端 ≥4 节缓冲」纪律）；④ 对位构造被破坏（三段等长 +
 * 扇形正居中是「嘴心恒等」的全部前提，动了其中任何一个都会散开）。
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
    // 位置与缓冲长度不属形态（用户 2026-08-20 拍板）
    const sameShape = (
      got: (typeof arr)[number]['spec'][1],
      want: (typeof arr)[number]['spec'][1],
    ): void => {
      const a = got[2]!;
      const b = want[2]!;
      const d = ARRAY_CENTER - (b[0][0] + b[0][1]) / 2; // 搬到自由段正中
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
    sameShape(arr[0].spec[1], bulb.spec[1]);
    sameShape(arr[11].spec[1], stepped.spec[1]);
    expect(arr[0].opts).toEqual(skinSiteOpts(bulb));
    expect(arr[11].opts).toEqual(skinSiteOpts(stepped));
    expect(arr[11].opts.boxSquare).toBe(true);
    // 尾段配平：总长恒定 ⇒ 帘子下缘齐（此前差 5 节 = 10px 参差）
    for (const u of arr) expect(u.spec.reduce((a, x) => a + x[1], 0)).toBe(ARRAY_TOTAL);
  });

  it('对位构造：三段等长（全员同 lead/f/tail）+ 扇形正居中（上下缓冲等长）' +
     '——「嘴心 = 2·lead + (f−1)·r 恒等」的全部前提，动一个就散', () => {
    const lead = arr[0].spec[0][1];
    const tail = arr[0].spec[2][1];
    for (const u of arr) {
      expect(u.spec[0][1]).toBe(lead);
      expect(u.spec[1][1]).toBe(ARRAY_FREE);
      expect(u.spec[2][1]).toBe(tail);
      const bonds = u.spec[1][2]!;
      const outer = bonds[0];
      // 扇形正居中 ⇒ φ = bT/(bT+bB) = 1/2 ⇒ 嘴心与键长 M 无关
      expect((outer[0] + outer[1]) / 2, `t=${u.t}`).toBe(ARRAY_CENTER);
      expect(outer[0], `上缓冲 t=${u.t}`).toBe(ARRAY_FREE - 1 - outer[1]);
    }
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

  it('相邻微小形变：rb 步长 ≤0.021、梯挡至多 +1', () => {
    for (let i = 1; i < arr.length; i++) {
      const a = arr[i - 1];
      const b = arr[i];
      const rbA = a.spec[1][2]![0][2];
      const rbB = b.spec[1][2]![0][2];
      expect(rbB - rbA, `${i}`).toBeLessThanOrEqual(0.021);
      expect(b.spec[1][2]!.length - a.spec[1][2]!.length, `${i}`).toBeLessThanOrEqual(1);
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
     '键谱全锁、贴轴不穿芯、顶端钉在天花。' +
     '基准取嘴心是用户 2026-08-20 拍板（嘴的开口 = 键长 rb，理想终态直接定义的量；' +
     '体心与嘴心相差各形态自身的下垂量 Δ，二者不可能同时对齐）。' +
     '对位是构造出来的不是标定出来的（见 skin-array.ts 文件头）：收缩早期严格为零，' +
     '终态残留 ≈0.9px 是形态自身的材料不对称，不是放置误差。' +
     '**必须卡全程不能只卡终态**——首版即此病，早期 4.78px / 终态 1.01px，' +
     '而台架大部分时间在收缩过程中',
     { timeout: 60000 }, () => {
    const CPS = [150, 450, 750, SKIN.STEPS - 1];
    const sims = arr.map((u) => createSkinUnit(u.spec, u.opts));
    // 收缩的注册端 = 底端（用户 2026-08-22 拍板）：末节点从头到尾不动
    const feet = sims.map((sim) => sim.py[sim.n - 1]);
    const mouth = (sim: (typeof sims)[number]): number => {
      const [i, j] = sim.chains[0][0]; // 最外键对 = 嘴
      return (-(sim.py[i] + sim.py[j]) / 2) * 100;
    };
    for (let s = 0; s < SKIN.STEPS; s++) {
      for (const sim of sims) sim.advance();
      if (!CPS.includes(s)) continue;
      const ms = sims.map(mouth);
      const spread = Math.max(...ms) - Math.min(...ms);
      // 折叠成形前（前两个检查点）构造保证严格恒等；成形后只剩形态自身的不对称
      expect(spread, `step ${s}`).toBeLessThanOrEqual(s <= 450 ? 0.05 : 1.2);
    }
    sims.forEach((sim, i) => {
      expect(sim.locked.length).toBe(sim.chains.flat().length);
      // 底端钉住不动（注册端反转后的新不变量），顶端反过来随收缩下降
      expect(sim.py[sim.n - 1]).toBe(feet[i]);
      expect(sim.coreTop, `顶端应随收缩下降 i=${i}`).toBeLessThan(-0.1);
      for (let k = 0; k < sim.n; k++) expect(sim.px[k]).toBeGreaterThanOrEqual(0);
    });
    // 12 条带下缘逐条重合（总长配平 + 底端注册 ⇒「对齐点在最下面的点」）
    expect(Math.max(...feet) - Math.min(...feet)).toBe(0);
  });
});
