import { describe, expect, it } from 'vitest';
import { CROWD, CrowdSim, makeRng } from './crowd-plan';
import { PLAN, dwellInput, nearestUnit, planLayout } from './unit-activation';

/**
 * Lab.15 几个人在场——守门。机制全部引用 unit-activation（那边守门已卡），这里只卡新增的：
 * 放人 / 撤人 / 上限、拖着走照样记痕迹、自走不出房间且同种子逐位可复现、
 * 两个人站在一起比一个人早一倍成形（重叠处每秒记两份）。
 */

describe('crowd-plan · 人', () => {
  it('开场两个人；放到上限就放不进去；撤掉最后一个', () => {
    const s = new CrowdSim();
    expect(s.people).toHaveLength(2);
    for (let k = 0; k < 10; k++) s.add(0, 0);
    expect(s.people).toHaveLength(CROWD.MAX_PEOPLE);
    expect(s.add(0, 0)).toBeNull();
    s.removeLast();
    expect(s.people).toHaveLength(CROWD.MAX_PEOPLE - 1);
    s.clearPeople();
    expect(s.people).toHaveLength(0);
  });

  it('放的位置钳在房间里', () => {
    const s = new CrowdSim({ opening: false });
    const p = s.add(99, -99)!;
    const h = s.layout.roomM / 2;
    expect(Math.abs(p.walker.x)).toBeLessThan(h);
    expect(Math.abs(p.walker.y)).toBeLessThan(h);
  });
});

describe('crowd-plan · 拖', () => {
  it('按住拖着走：位置直接跟指针，走过的地面照样记痕迹，松手后不再动', () => {
    const s = new CrowdSim({ opening: false, auto: false });
    const p = s.add(-2, 0)!;
    s.hold(p.id, -2, 0);
    for (let k = 0; k <= 40; k++) {
      s.drag(p.id, -2 + k * 0.1, 0);
      s.step(0.05);
    }
    expect(p.walker.x).toBeCloseTo(2, 6);
    expect(p.mode).toBe('held');
    expect(p.walker.distance).toBeCloseTo(4, 6);
    // 沿途都记上了
    expect(s.field.data[s.field.indexOf(-1, 0)]).toBeGreaterThan(0);
    expect(s.field.data[s.field.indexOf(1, 0)]).toBeGreaterThan(0);
    expect(s.field.data[s.field.indexOf(0, 2.5)]).toBe(0);
    s.release(p.id);
    expect(p.mode).toBe('manual');
    const x = p.walker.x;
    for (let k = 0; k < 40; k++) s.step(0.05);
    expect(p.walker.x).toBe(x);
  });

  it('命中：离指针 0.35 m 内最近的那个人', () => {
    const s = new CrowdSim({ opening: false, auto: false });
    const a = s.add(0, 0)!;
    const b = s.add(1.5, 0)!;
    expect(s.personAt(0.2, 0.1)?.id).toBe(a.id);
    expect(s.personAt(1.4, 0)?.id).toBe(b.id);
    expect(s.personAt(0.75, 0)).toBeNull();
  });
});

describe('crowd-plan · 自走', () => {
  it('两分钟里一直在房间里、走过路、也站过；同种子逐位可复现', () => {
    const run = () => {
      const s = new CrowdSim({ seed: 7 });
      let walked = 0;
      let stood = 0;
      const h = s.layout.roomM / 2;
      for (let k = 0; k < 2400; k++) {
        s.step(0.05);
        for (const p of s.people) {
          expect(Math.abs(p.walker.x)).toBeLessThan(h);
          expect(Math.abs(p.walker.y)).toBeLessThan(h);
          if (p.walker.state === 'walk') walked++;
          else stood++;
        }
      }
      return { walked, stood, xs: s.people.map((p) => p.walker.x), total: s.field.total() };
    };
    const a = run();
    const b = run();
    expect(a.walked).toBeGreaterThan(200);
    expect(a.stood).toBeGreaterThan(200);
    expect(a.xs).toEqual(b.xs);
    expect(a.total).toBe(b.total);
    const c = new CrowdSim({ seed: 8 });
    for (let k = 0; k < 2400; k++) c.step(0.05);
    expect(c.people.map((p) => p.walker.x)).not.toEqual(a.xs);
  });

  it('自走目标落在场地外扩 0.4 m 的方框里，站定时长在 2–30 s', () => {
    const rng = makeRng(3);
    const vals = Array.from({ length: 1000 }, () => rng());
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...vals)).toBeLessThan(1);
    const s = new CrowdSim({ seed: 11 });
    const half = s.layout.fieldM / 2 + CROWD.WANDER_MARGIN;
    for (let k = 0; k < 6000; k++) {
      s.step(0.05);
      for (const p of s.people) {
        expect(Math.abs(p.walker.x)).toBeLessThanOrEqual(half + 1e-6);
        expect(Math.abs(p.walker.y)).toBeLessThanOrEqual(half + 1e-6);
      }
    }
  });

  it('关自走：人停在原地；开回去：接着走', () => {
    const s = new CrowdSim({ seed: 5 });
    for (let k = 0; k < 100; k++) s.step(0.05);
    s.setAuto(false);
    const xs = s.people.map((p) => p.walker.x);
    for (let k = 0; k < 200; k++) s.step(0.05);
    expect(s.people.map((p) => p.walker.x)).toEqual(xs);
    s.setAuto(true);
    for (let k = 0; k < 600; k++) s.step(0.05);
    expect(s.people.map((p) => p.walker.x)).not.toEqual(xs);
  });
});

describe('crowd-plan · 几个人一起改变空间', () => {
  it('两个人站在同一处，脚下的单元比一个人时早一倍成形（重叠处每秒记两份）', () => {
    const timeToForm = (n: number) => {
      const s = new CrowdSim({ opening: false, auto: false });
      const u = nearestUnit(s.layout, 0, 0);
      for (let k = 0; k < n; k++) s.add(u.x, u.y);
      let t = 0;
      while (s.act.degree[u.i] < 1 && t < 120) {
        s.step(0.05);
        t += 0.05;
      }
      return t;
    };
    const one = timeToForm(1);
    const two = timeToForm(2);
    expect(one).toBeGreaterThan(15);
    expect(one).toBeLessThan(20);
    expect(two).toBeLessThan(one * 0.6);
    expect(two).toBeGreaterThan(one * 0.4);
  });

  it('一个人站着的读数与 Lab.14 的解析式一致；痕迹清了、人还在', () => {
    const s = new CrowdSim({ opening: false, auto: false });
    const u = nearestUnit(s.layout, 0, 0);
    s.add(u.x, u.y);
    for (let k = 0; k < 400; k++) s.step(0.05);
    expect(s.act.input[u.i]).toBeCloseTo(dwellInput(20), 0);
    s.clearTraces();
    expect(s.act.maxInput()).toBe(0);
    expect(s.people).toHaveLength(1);
    expect(s.t).toBe(0);
  });

  it('两个人隔着一段距离站着，各自长出各自的一群，中间不连', () => {
    const s = new CrowdSim({ opening: false, auto: false, grid: 8 });
    const L = planLayout(8);
    const a = nearestUnit(L, -1.5, 0);
    const b = nearestUnit(L, 1.5, 0);
    s.add(a.x, a.y);
    s.add(b.x, b.y);
    for (let k = 0; k < 500; k++) s.step(0.05);
    expect(s.act.degree[a.i]).toBe(1);
    expect(s.act.degree[b.i]).toBe(1);
    // 8×8 原点上没有单元，最近的在 (0.30, 0.30)，它的格子边缘离人 0.96 m ⇒ 只被影响圈擦到一角
    const mid = nearestUnit(L, 0, 0);
    expect(s.act.degree[mid.i]).toBeLessThan(0.35);
    expect(s.counts()).toEqual({ people: 2, walking: 0, standing: 2, held: 0 });
    expect(PLAN.REACH.def).toBeLessThan(1.5 - L.pitchM / 2); // 两圈不相交的前提
  });
});
