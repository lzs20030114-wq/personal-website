import { describe, expect, it } from 'vitest';
import { CAT_BEHAVIOURS, CatPlanSim } from './cat-plan';
import { PLAN, PlanSim, keepOut, nearestUnit } from './unit-activation';

const run = (s: CatPlanSim, seconds: number) => { for (let i = 0; i < seconds * 60; i++) s.step(1 / 60); };

describe('cat plan · activity on platforms', () => {
  it.each([4, 6, 8])('all behaviours travel on adjacent, fully activated supports on grid %i', grid => {
    for (const b of CAT_BEHAVIOURS) {
      const s = new CatPlanSim({ grid, behaviour: b.key });
      for (let i = 0; i < 60 * 60; i++) {
        s.step(1 / 60);
        expect(s.act.degree[s.currentUnit.i]).toBe(1);
        for (const u of s.supportUnits) expect(s.act.degree[u.i]).toBe(1);
        expect(s.blocked.some(Boolean)).toBe(false);
        const u = s.currentUnit;
        // Routes follow rows/columns of platform centres, never the aisle lines.
        expect(Math.min(Math.abs(s.walker.x - u.x), Math.abs(s.walker.y - u.y))).toBeLessThan(1e-8);
        if (s.supportUnits.length === 2) {
          const [a, b] = s.supportUnits;
          expect(Math.abs(a.row - b.row) + Math.abs(a.col - b.col)).toBeLessThanOrEqual(1);
        }
      }
      expect(s.walker.distance).toBeGreaterThan(0.5);
    }
  });

  it('prepares only the next landing and waits for it before departing', () => {
    const s = new CatPlanSim({ behaviour: 'pass', threshold: 3 });
    const start = s.currentUnit;
    s.step(1 / 60);
    const next = s.landingUnit!;
    expect(next.i).toBe(start.i + 1);
    expect(s.state).toBe('prepare');
    run(s, 1);
    expect([s.walker.x, s.walker.y]).toEqual([start.x, start.y]);
    expect(s.act.degree[next.i]).toBeGreaterThan(0);
    expect(s.act.degree[next.i]).toBeLessThan(1);
    for (const u of s.layout.units) if (u.i !== start.i && u.i !== next.i) expect(s.act.degree[u.i]).toBe(0);
    run(s, 2.1);
    expect(s.walker.x).toBeGreaterThan(start.x);
    expect(s.act.degree[next.i]).toBe(1);
  });

  it('replay reproduces free movement and readings', () => {
    const s = new CatPlanSim();
    run(s, 45);
    const before = { x: s.walker.x, y: s.walker.y, trace: Array.from(s.field.data), degree: Array.from(s.act.degree) };
    s.replay(); run(s, 45);
    expect({ x: s.walker.x, y: s.walker.y, trace: Array.from(s.field.data), degree: Array.from(s.act.degree) }).toEqual(before);
  });

  it('drag places the cat ON a unit, activates beneath it immediately, and preserves support while paused', () => {
    const s = new CatPlanSim({ behaviour: 'play' });
    const u = s.layout.units[10];
    s.hold(u.x + 0.05, u.y); s.release();
    expect([s.walker.x, s.walker.y]).toEqual([u.x, u.y]);
    expect(s.act.degree[u.i]).toBe(1);
    expect(s.behaviour).toBe('free'); expect(s.auto).toBe(false);
    s.clearTraces();
    expect(s.act.formed()).toEqual([u.i]);
    s.setThreshold(4);
    expect(s.act.degree[u.i]).toBe(1);
    run(s, 12);
    expect([s.walker.x, s.walker.y]).toEqual([u.x, u.y]);
    expect(s.act.formed()).toEqual([u.i]);
    expect(s.field.data[s.field.indexOf(u.x, u.y)]).toBeGreaterThan(0);
    for (const other of s.layout.units) if (other.i !== u.i) expect(s.act.degree[other.i]).toBe(0);
    s.setAuto(true); run(s, 40);
    expect(s.walker.distance).toBeGreaterThan(1);
  });

  it('clicks route to a platform centre with auto off; dragging outside clamps to an edge platform', () => {
    const s = new CatPlanSim();
    s.hold(100, -100); s.release();
    expect(s.currentUnit.i).toBe(7);
    const end = nearestUnit(s.layout, 0.8, 0.8);
    s.pointerTarget(end.x + 0.04, end.y + 0.03); run(s, 40);
    expect(s.auto).toBe(false); expect(s.walker.state).toBe('idle');
    expect([s.walker.x, s.walker.y]).toEqual([end.x, end.y]);
    expect(s.act.degree[end.i]).toBe(1);
  });

  it('clearing traces during a transfer retains both platforms', () => {
    const s = new CatPlanSim({ behaviour: 'pass' });
    run(s, 1.2);
    expect(s.supportUnits.length).toBe(2);
    s.clearTraces();
    for (const u of s.supportUnits) expect(s.act.degree[u.i]).toBe(1);
    run(s, 0.2);
    expect(s.act.degree[s.currentUnit.i]).toBe(1);
  });

  it('follow releases the previous unit; lock retains it; neither withdraws the occupied unit', () => {
    for (const mode of ['follow', 'ratchet'] as const) {
      const s = new CatPlanSim({ mode });
      const a = s.layout.units[10], b = s.layout.units[11];
      s.hold(a.x, a.y); s.release(); run(s, 8);
      s.pointerTarget(b.x, b.y); run(s, 15);
      expect(s.currentUnit.i).toBe(b.i);
      expect(s.act.degree[b.i]).toBe(1);
      expect(s.act.degree[a.i]).toBe(mode === 'follow' ? 0 : 1);
    }
  });

  it('the cat has no exclusion zone; human defaults still keep their clearance', () => {
    const h = new PlanSim({ clearance: 0.15 }), c = new CatPlanSim();
    expect(h.bodyR).toBe(PLAN.BODY_R);
    expect(h.keepOutM).toBe(keepOut(h.layout, 0.15));
    expect(c.keepOutM).toBe(0);
    expect(c.clearance).toBeNull();
    expect(c.lane).toBe(false);
  });
});
