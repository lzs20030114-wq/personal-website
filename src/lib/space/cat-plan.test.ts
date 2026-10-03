import { describe, expect, it } from 'vitest';
import { CAT, CAT_BEHAVIOURS, CatPlanSim } from './cat-plan';
import { PLAN, PlanSim, keepOut } from './unit-activation';

const run = (s: CatPlanSim, seconds: number) => { for (let i = 0; i < seconds * 60; i++) s.step(1 / 60); };

describe('cat plan', () => {
  it.each([4, 6, 8])('all behaviours move, activate and stay clear of cores on grid %i', grid => {
    for (const b of CAT_BEHAVIOURS) {
      const s = new CatPlanSim({ grid, behaviour: b.key });
      let peak = 0;
      for (let i = 0; i < 60 * 60; i++) {
        s.step(1 / 60);
        peak = Math.max(peak, ...s.act.degree);
        expect(Math.abs(s.walker.x)).toBeLessThan(s.layout.roomM / 2);
        expect(Math.abs(s.walker.y)).toBeLessThan(s.layout.roomM / 2);
        if (i % 30 === 0) for (const u of s.layout.units) expect(Math.hypot(u.x - s.walker.x, u.y - s.walker.y)).toBeGreaterThanOrEqual(s.layout.mastR + CAT.bodyR - 1e-6);
      }
      expect(s.walker.distance).toBeGreaterThan(0.5);
      expect(peak).toBeGreaterThan(0.4);
    }
  });

  it('replay reproduces free movement and readings', () => {
    const s = new CatPlanSim();
    run(s, 45);
    const before = { x: s.walker.x, y: s.walker.y, trace: Array.from(s.field.data), degree: Array.from(s.act.degree) };
    s.replay(); run(s, 45);
    expect({ x: s.walker.x, y: s.walker.y, trace: Array.from(s.field.data), degree: Array.from(s.act.degree) }).toEqual(before);
  });

  it('drag interrupts presets, deposits traces and waits for an explicit restart', () => {
    const s = new CatPlanSim({ behaviour: 'play' });
    s.hold(0, 0); s.drag(0.8, 0); s.release();
    const x = s.walker.x, y = s.walker.y;
    run(s, 8);
    expect(s.behaviour).toBe('free'); expect(s.auto).toBe(false);
    expect([s.walker.x, s.walker.y]).toEqual([x, y]);
    expect(s.field.max()).toBeGreaterThan(1);
    expect(s.act.countAtLeast(0.5)).toBeGreaterThan(0);
    s.setAuto(true); run(s, 40);
    expect(s.walker.distance).toBeGreaterThan(1);
  });

  it('click targets travel with auto off, and drag cannot place the cat in a core', () => {
    const s = new CatPlanSim();
    const u = s.layout.units[10]; s.hold(u.x, u.y);
    expect(Math.hypot(s.walker.x - u.x, s.walker.y - u.y)).toBeCloseTo(s.layout.mastR + CAT.bodyR);
    s.release(); s.pointerTarget(1.5, 1.5); run(s, 20);
    expect(s.auto).toBe(false); expect(s.walker.state).toBe('idle');
    expect(s.walker.x).toBeGreaterThan(1); expect(s.walker.y).toBeGreaterThan(1);
  });

  it('follow fades after the cat leaves, lock retains activation', () => {
    for (const mode of ['follow', 'ratchet'] as const) {
      const s = new CatPlanSim({ mode }); s.hold(0, 0); s.release(); run(s, 10);
      const peak = Math.max(...s.act.degree); expect(peak).toBeGreaterThan(0.5);
      s.walker.setRoute([]); run(s, 12);
      expect(s.field.max()).toBe(0);
      expect(Math.max(...s.act.degree)).toBe(mode === 'follow' ? 0 : peak);
    }
  });

  it('body clearance is species specific while human defaults remain unchanged', () => {
    const h = new PlanSim({ clearance: 0.15 }), c = new CatPlanSim();
    expect(h.bodyR).toBe(PLAN.BODY_R);
    expect(h.keepOutM).toBe(keepOut(h.layout, 0.15));
    expect(c.keepOutM).toBeCloseTo(c.layout.platR + CAT.bodyR + CAT.clearance);
    c.hold(0, 0); c.release(); run(c, 5);
    for (const u of c.layout.units) if (c.blocked[u.i]) expect(c.act.degree[u.i]).toBe(0);
  });
});
