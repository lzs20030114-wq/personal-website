import { describe, expect, it } from 'vitest';
import { CAT_BEHAVIOURS, CatPlanSim } from './cat-plan';
import { PLAN, PlanSim, keepOut, nearestUnit, type PlanUnit } from './unit-activation';

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
      if (b.key === 'rest') expect(s.walker.distance).toBe(0);
      else expect(s.walker.distance).toBeGreaterThan(0.5);
    }
  });

  it('the route is planned from the start, yet a landing opens only once the cat fixates it', () => {
    const s = new CatPlanSim({ behaviour: 'pass' });
    const start = s.currentUnit, n = s.layout.n;
    const north = s.layout.units[start.i - n], south = s.layout.units[start.i + n], east = s.layout.units[start.i + 1];
    run(s, 0.4);
    // First glance: the north neighbour part-opens; the chosen landing is still shut.
    expect(s.phase).toBe('scan'); expect(s.gazeUnit?.i).toBe(north.i);
    expect(s.act.degree[north.i]).toBeGreaterThan(0.3); expect(s.act.degree[north.i]).toBeLessThan(0.6);
    expect(s.act.degree[east.i]).toBe(0);
    run(s, 0.5);
    expect(s.gazeUnit?.i).toBe(south.i); expect(s.act.degree[east.i]).toBe(0);
    run(s, 0.5);
    // Fixating the landing: it opens with fixation time while the cat waits on its platform.
    expect(s.state).toBe('prepare'); expect(s.gazeUnit?.i).toBe(east.i);
    expect([s.walker.x, s.walker.y]).toEqual([start.x, start.y]);
    expect(s.act.degree[east.i]).toBeGreaterThan(0); expect(s.act.degree[east.i]).toBeLessThan(1);
    run(s, 1);
    expect(s.walker.x).toBeGreaterThan(start.x); expect(s.act.degree[east.i]).toBe(1);
    // Glanced options that were not taken retract.
    run(s, 3);
    expect(s.act.degree[north.i]).toBe(0); expect(s.act.degree[south.i]).toBe(0);
  });

  it('activation reads gaze and use traces only, never the planned route', () => {
    const s = new CatPlanSim({ behaviour: 'pass' });
    run(s, 1.4);
    expect(s.state).toBe('prepare');
    const inputs = () => Array.from((s as unknown as { activationInputs(): Float64Array }).activationInputs());
    const before = inputs();
    const plan = s as unknown as { pending: PlanUnit | null; actions: unknown[] };
    plan.pending = s.layout.units[0]; plan.actions = [];
    expect(inputs()).toEqual(before);
  });

  it('looks ahead while crossing a row, so units open in front and the cat seldom stops', () => {
    const s = new CatPlanSim({ behaviour: 'pass' });
    run(s, 2.5);
    let waiting = 0, walking = 0;
    for (let i = 0; i < 60 * 8; i++) {
      s.step(1 / 60);
      if (s.state === 'prepare') waiting++; else if (s.walker.state === 'walk') walking++;
      for (const u of s.supportUnits) expect(s.act.degree[u.i]).toBe(1);
    }
    expect(waiting).toBeLessThan(walking * 0.25);
  });

  it('a landing around a corner is seen only after the cat stops and turns', () => {
    const s = new CatPlanSim();
    const at = (r: number, c: number) => s.layout.units[r * s.layout.n + c];
    const a = at(2, 1), mid = at(2, 2), end = at(2, 3), corner = at(3, 3);
    s.hold(a.x, a.y); s.release(); run(s, 1);
    s.pointerTarget(corner.x, corner.y);
    let cornerBeforeStop = 0, endOnArrival = -1, stoppedAtEnd = false;
    for (let i = 0; i < 60 * 15; i++) {
      s.step(1 / 60);
      const idle = s.walker.state !== 'walk';
      if (endOnArrival < 0 && idle && s.currentUnit.i === mid.i) endOnArrival = s.act.degree[end.i];
      if (idle && s.currentUnit.i === end.i) stoppedAtEnd = true;
      if (!stoppedAtEnd) cornerBeforeStop = Math.max(cornerBeforeStop, s.act.degree[corner.i]);
    }
    expect(endOnArrival).toBeGreaterThan(0.3);
    expect(cornerBeforeStop).toBe(0);
    expect(s.currentUnit.i).toBe(corner.i); expect(s.act.degree[corner.i]).toBe(1);
  });

  it('gaze-to-open and stay-to-fill are separate knobs', () => {
    for (const gazeOpen of [1, 2]) {
      const s = new CatPlanSim({ gazeOpen, threshold: 4 });
      const a = s.layout.units[10], b = s.layout.units[11];
      s.hold(a.x, a.y); s.release(); run(s, 1);
      s.pointerTarget(b.x, b.y);
      const t0 = s.t;
      let departed = -1;
      for (let i = 0; i < 60 * 5 && departed < 0; i++) { s.step(1 / 60); if (s.walker.state === 'walk') departed = s.t - t0; }
      expect(departed).toBeGreaterThan(gazeOpen - 0.05); expect(departed).toBeLessThan(gazeOpen + 0.2);
    }
    const s = new CatPlanSim({ gazeOpen: 1, threshold: 4 });
    s.setThreshold(8); expect(s.gazeOpen).toBe(1);
    s.setGazeOpen(2); expect(s.act.threshold).toBe(8);
  });

  it('a platform used longer retracts later than one only crossed', () => {
    const s = new CatPlanSim({ threshold: 4 });
    const a = s.layout.units[10], b = s.layout.units[11], c = s.layout.units[12];
    s.hold(a.x, a.y); s.release(); run(s, 10);
    s.pointerTarget(c.x, c.y);
    const used = new Set<number>(), left: Record<number, number> = {}, gone: Record<number, number> = {};
    for (let i = 0; i < 60 * 20; i++) {
      s.step(1 / 60);
      const support = new Set(s.supportUnits.map(u => u.i));
      for (const u of [a, b]) {
        if (support.has(u.i)) used.add(u.i);
        else if (used.has(u.i) && left[u.i] === undefined) left[u.i] = s.t;
        if (left[u.i] !== undefined && gone[u.i] === undefined && s.act.degree[u.i] === 0) gone[u.i] = s.t;
      }
    }
    expect(gone[a.i] - left[a.i]).toBeGreaterThan(5);
    expect(gone[b.i] - left[b.i]).toBeLessThan(gone[a.i] - left[a.i] - 1);
  });

  it('a resting cat and a cat pawing its toy fixate nothing', () => {
    const rest = new CatPlanSim({ behaviour: 'rest' });
    const play = new CatPlanSim({ behaviour: 'play' });
    let pawed = false;
    for (let i = 0; i < 60 * 30; i++) {
      rest.step(1 / 60); play.step(1 / 60);
      expect(rest.gazeUnit).toBeNull();
      if (play.state === 'capture') { pawed = true; expect(play.gazeUnit).toBeNull(); }
    }
    expect(pawed).toBe(true);
    expect(rest.act.formed()).toEqual([rest.currentUnit.i]);
  });

  it('watching the toy opens the play landing before the cat sets off', () => {
    const s = new CatPlanSim({ behaviour: 'play' });
    let last = s.phase;
    for (let i = 0; i < 60 * 5; i++) {
      s.step(1 / 60);
      if (last === 'watch' && s.phase === 'stalk') {
        expect(s.state).toBe('stalk');
        expect(s.act.degree[s.landingUnit!.i]).toBe(1);
        return;
      }
      last = s.phase;
    }
    throw new Error('watch → stalk not reached');
  });

  it('replay reproduces free movement and readings', () => {
    const s = new CatPlanSim();
    run(s, 45);
    const before = { x: s.walker.x, y: s.walker.y, trace: Array.from(s.field.data), degree: Array.from(s.act.degree) };
    s.replay(); run(s, 45);
    expect({ x: s.walker.x, y: s.walker.y, trace: Array.from(s.field.data), degree: Array.from(s.act.degree) }).toEqual(before);
  });

  it.each([4, 6, 8])('distinguishes a full row, one resting platform, and a local play area on grid %i', grid => {
    const pass = new CatPlanSim({ grid, behaviour: 'pass' });
    const rest = new CatPlanSim({ grid, behaviour: 'rest' });
    const play = new CatPlanSim({ grid, behaviour: 'play' });
    const poses = new Set<string>(), phases = new Set<string>();
    let toyMoved = false, previousToy = play.toy && { ...play.toy };
    for (let i = 0; i < 60 * 60; i++) {
      for (const s of [pass, rest, play]) s.step(1 / 60);
      poses.add(rest.pose); phases.add(play.state);
      if (previousToy && play.toy && Math.hypot(play.toy.x - previousToy.x, play.toy.y - previousToy.y) > 0.001) toyMoved = true;
      previousToy = play.toy && { ...play.toy };
      if (play.state === 'capture') expect(Math.hypot(play.toy!.x - play.walker.x, play.toy!.y - play.walker.y)).toBeLessThan(play.layout.platR);
    }
    expect(pass.visited.size).toBe(grid);
    expect(new Set([...pass.visited].map(i => pass.layout.units[i].row)).size).toBe(1);
    expect(rest.visited.size).toBe(1); expect(rest.act.formed()).toEqual([rest.currentUnit.i]);
    expect(poses).toEqual(new Set(['sit', 'lie']));
    expect(play.visited.size).toBe(4);
    expect(new Set([...play.visited].map(i => play.layout.units[i].row)).size).toBe(2);
    for (const phase of ['watch', 'stalk', 'chase', 'capture']) expect(phases.has(phase)).toBe(true);
    expect(toyMoved).toBe(true);
  });

  it('free mode reaches all episodes without unsupported random choice weights', () => {
    const s = new CatPlanSim();
    const episodes: string[] = [];
    for (let i = 0; i < 90 * 60; i++) {
      if (episodes[episodes.length - 1] !== s.episode) episodes.push(s.episode);
      s.step(1 / 60);
    }
    expect(episodes.slice(0, 4)).toEqual(['pass', 'rest', 'play', 'pass']);
  });

  it('drag places the cat ON a unit, activates beneath it immediately, and preserves support while paused', () => {
    const s = new CatPlanSim({ behaviour: 'play' });
    const u = s.layout.units[10];
    s.hold(u.x + 0.05, u.y); s.release();
    expect([s.walker.x, s.walker.y]).toEqual([u.x, u.y]);
    expect(s.act.degree[u.i]).toBe(1);
    expect(s.behaviour).toBe('free'); expect(s.auto).toBe(false);
    expect(s.episode).toBe('rest'); expect(s.phase).toBe('sit');
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
    expect(s.pose).toBe('sit');
    expect([s.walker.x, s.walker.y]).toEqual([end.x, end.y]);
    expect(s.act.degree[end.i]).toBe(1);
  });

  it('clearing traces during a transfer retains both platforms', () => {
    const s = new CatPlanSim({ behaviour: 'pass' });
    for (let i = 0; i < 60 * 5 && s.supportUnits.length < 2; i++) s.step(1 / 60);
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
