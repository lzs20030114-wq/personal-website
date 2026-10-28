import { describe, expect, it } from 'vitest';
import {
  FX,
  SWELL_LEVELS,
  approach,
  cubicBezier,
  splitDate,
  swellAt,
  swellAxes,
  swellEase,
  swellFrom,
  swellLevel,
  swellRest,
  swellRetarget,
  swellSample,
  swellTweenAt,
  swellTweenDone,
  tiltAt,
  tiltCss,
  wedgeTarget,
} from './home-fx';

describe('方块场倾斜', () => {
  it('正对指针最大，越远越小，远到一定距离就不写样式', () => {
    const near = tiltAt(0, 0)!;
    const mid = tiltAt(FX.TILT_R * 0.8, 0)!;
    expect(near.rot).toBeCloseTo(FX.TILT_ROT);
    expect(Math.abs(mid.rot)).toBeLessThan(Math.abs(near.rot));
    expect(tiltAt(FX.TILT_R * 2.5, 0)).toBeNull();
    expect(tiltCss(null)).toBe('');
  });
  it('指针左右两侧的方块往相反方向转，拉斜与缩小不分左右', () => {
    const l = tiltAt(-60, 10)!;
    const r = tiltAt(60, 10)!;
    expect(l.rot).toBeCloseTo(-r.rot);
    expect(l.skew).toBeCloseTo(r.skew);
    expect(l.scale).toBeCloseTo(r.scale);
  });
  it('转斜的方块同时缩小，越近越小；转过去以后仍落在自己那一格里，不压到邻格（§75）', () => {
    const near = tiltAt(0, 0)!;
    const mid = tiltAt(FX.TILT_R * 0.6, 0)!;
    expect(near.scale).toBeLessThan(mid.scale);
    expect(mid.scale).toBeLessThan(1);
    // 方块边长约 0.78 格（.hs-fx__tile 的内缩），转 rot、拉斜 skew 后的外框宽 = 边长 ×(cos + sin + tan)
    for (const t of [near, mid, tiltAt(48, 0)!, tiltAt(48, 48)!]) {
      const r = (Math.abs(t.rot) * Math.PI) / 180;
      const k = (Math.abs(t.skew) * Math.PI) / 180;
      expect(0.78 * (Math.cos(r) + Math.sin(r) + Math.tan(k)) * t.scale).toBeLessThan(1);
    }
  });
  it('指针微动时同一格的样式字符串不变（不必重写）', () => {
    expect(tiltCss(tiltAt(150, 40))).toBe(tiltCss(tiltAt(150.2, 40.1)));
  });
});

describe('Lab 楔形', () => {
  const plate = { top: 200, bottom: 600 };
  it('落点夹在预览框上下边以内', () => {
    expect(wedgeTarget({ top: 100, bottom: 160 }, plate).tip).toBe(200 + FX.WEDGE_INSET);
    expect(wedgeTarget({ top: 700, bottom: 760 }, plate).tip).toBe(600 - FX.WEDGE_INSET);
    expect(wedgeTarget({ top: 300, bottom: 360 }, plate).tip).toBe(330);
  });
  it('选中行离框太远就不画', () => {
    expect(wedgeTarget({ top: 300, bottom: 360 }, plate).visible).toBe(true);
    expect(wedgeTarget({ top: 0, bottom: 200 - FX.WEDGE_REACH - 1 }, plate).visible).toBe(false);
    expect(wedgeTarget({ top: 600 + FX.WEDGE_REACH + 1, bottom: 900 }, plate).visible).toBe(false);
  });
  it('逼近：一个 τ 走掉约 63%，τ ≤ 0 直接到位', () => {
    expect(approach(0, 100, FX.WEDGE_TAU_MS, FX.WEDGE_TAU_MS)).toBeCloseTo(100 * (1 - Math.exp(-1)));
    expect(approach(0, 100, 16, 0)).toBe(100);
    expect(approach(Number.NaN, 42, 16, 70)).toBe(42);
  });
});

describe('日志日期', () => {
  it('拆成「月·日」与年份，格式不对就原样返回', () => {
    expect(splitDate('2026-10-24')).toEqual({ md: '10·24', year: '2026' });
    expect(splitDate('soon')).toEqual({ md: 'soon', year: '' });
  });
});

describe('方块场倾斜取档（2026-10-28 性能排查）', () => {
  it('倾斜量只有有限几档：指针微动时远处的方块多半写同一个 transform，不必重开过渡', () => {
    const seen = new Set<string>();
    for (let d = 0; d < FX.TILT_R * 2; d += 0.5) seen.add(tiltCss(tiltAt(d, 0)));
    expect(seen.size).toBeLessThanOrEqual(FX.TILT_LEVELS + 2);
    // 相邻两帧指针挪 2px，远处（离指针 1.2 个半径）的方块落在同一档
    expect(tiltCss(tiltAt(FX.TILT_R * 1.2, 0))).toBe(tiltCss(tiltAt(FX.TILT_R * 1.2 + 2, 0)));
  });
});

describe('首屏字格鼓起', () => {
  it('指针正上方最鼓，横向比纵向传得远，远处为 0', () => {
    expect(swellAt(0, 0)).toBe(1);
    expect(swellAt(1, 0)).toBeGreaterThan(swellAt(0, 1));
    expect(swellAt(10, 0)).toBe(0);
    expect(swellAt(0, 4)).toBe(0);
  });
  it('平时是细窄那一端，最鼓是宽粗那一端；同一程度给出同一组整数', () => {
    expect(swellAxes(0)).toEqual({ wdth: FX.SWELL_WDTH[0], wght: FX.SWELL_WGHT[0] });
    expect(swellAxes(1)).toEqual({ wdth: FX.SWELL_WDTH[1], wght: FX.SWELL_WGHT[1] });
    const a = swellAxes(0.5);
    expect(Number.isInteger(a.wdth) && Number.isInteger(a.wght)).toBe(true);
  });
  it('About 宣言：细窄的字与宽粗的名词各从自己平时的样子起跳，鼓到同一个最宽最粗；名词只变粗不再变宽', () => {
    const P = FX.SAY_PEAK;
    expect(swellFrom(FX.SAY_PLAIN, 0, P)).toEqual(FX.SAY_PLAIN);
    expect(swellFrom(FX.SAY_WIDE, 0, P)).toEqual(FX.SAY_WIDE);
    expect(swellFrom(FX.SAY_PLAIN, 1, P)).toEqual(P);
    expect(swellFrom(FX.SAY_WIDE, 1, P)).toEqual(P);
    expect(swellFrom(FX.SAY_WIDE, 0.5, P).wdth).toBe(FX.SAY_WIDE.wdth);
    expect(swellFrom(FX.SAY_PLAIN, 0.5, P).wdth).toBeGreaterThan(FX.SAY_PLAIN.wdth);
    // 名词鼓起来要看得出：字重至少加 200（§75：原来只到 760，加 120，几乎看不出）
    expect(P.wght - FX.SAY_WIDE.wght).toBeGreaterThanOrEqual(200);
  });
  it('不传 peak 时与首屏字格同一个终点（首屏逐位不变）', () => {
    expect(swellFrom({ wdth: FX.SWELL_WDTH[0], wght: FX.SWELL_WGHT[0] }, 1)).toEqual({ wdth: FX.SWELL_WDTH[1], wght: FX.SWELL_WGHT[1] });
  });
});

describe('鼓起过渡由脚本推进（2026-10-28 性能排查）', () => {
  it('缓动与原 CSS 的 cubic-bezier(.2,.7,.1,1) 同一条：两端钉死、单调、前段快', () => {
    expect(swellEase(0)).toBe(0);
    expect(swellEase(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const y = swellEase(i / 100);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
    expect(swellEase(0.25)).toBeGreaterThan(0.5);
    // linear 的贝塞尔就是恒等
    const lin = cubicBezier(0, 0, 1, 1);
    for (const x of [0.1, 0.37, 0.8]) expect(lin(x)).toBeCloseTo(x, 5);
    // 与浏览器 ease（.25,.1,.25,1）在 x = .5 的已知值对得上
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });
  it('只取有限几档：同一档写同一组字宽字重，浏览器的字体实例可以复用', () => {
    const seen = new Set<string>();
    for (let i = 0; i <= 1000; i++) {
      const a = swellAxes(swellLevel(i / 1000));
      seen.add(`${a.wdth}/${a.wght}`);
    }
    expect(seen.size).toBeLessThanOrEqual(SWELL_LEVELS + 1);
    expect(swellLevel(-1)).toBe(0);
    expect(swellLevel(2)).toBe(1);
  });
  it('变宽走 SWELL_IN_MS、收回走 SWELL_OUT_MS，从此刻的程度起跳', () => {
    let tw = swellRetarget(swellRest(), 1, 1000);
    expect(tw.dur).toBe(FX.SWELL_IN_MS);
    expect(swellTweenAt(tw, 1000)).toBe(0);
    expect(swellTweenAt(tw, 1000 + FX.SWELL_IN_MS)).toBe(1);
    const mid = swellTweenAt(tw, 1100);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    tw = swellRetarget(tw, 0, 1100);
    expect(tw.dur).toBe(FX.SWELL_OUT_MS);
    expect(tw.from).toBeCloseTo(mid);
    expect(swellTweenDone(tw, 1100 + FX.SWELL_OUT_MS)).toBe(true);
    expect(swellTweenAt(tw, 1100 + FX.SWELL_OUT_MS)).toBe(0);
  });
  it('目标仍在同一档时不重开过渡，只把终点挪到确切目标；减弱动态效果直接到位', () => {
    const tw = swellRetarget(swellRest(), 0.5, 0);
    const near = 0.5 + 0.2 / SWELL_LEVELS;
    const moved = swellRetarget(tw, near, 50);
    expect(moved.t0).toBe(tw.t0);
    expect(moved.dur).toBe(tw.dur);
    expect(moved.to).toBe(near);
    const now = swellRetarget(swellRest(), 0.7, 0, true);
    expect(swellTweenDone(now, 0)).toBe(true);
    expect(swellSample(now, 0)).toBe(0.7);
  });
  it('走的途中取档、停下来落在确切目标上（静止的样子与原 CSS 过渡走完时相同）', () => {
    const tw = swellRetarget(swellRest(), 0.613, 0);
    const mid = swellSample(tw, FX.SWELL_IN_MS / 2);
    expect(mid * SWELL_LEVELS).toBeCloseTo(Math.round(mid * SWELL_LEVELS), 9);
    expect(swellSample(tw, FX.SWELL_IN_MS)).toBe(0.613);
    expect(swellAxes(swellSample(tw, FX.SWELL_IN_MS))).toEqual(swellAxes(0.613));
  });
});
