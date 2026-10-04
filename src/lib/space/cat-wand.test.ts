import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAT } from './cat-plan';
import { CatWandSim, WAND_PLAY } from './cat-wand';

const run = (s: CatWandSim, seconds: number) => { for (let i = 0; i < seconds * 60; i++) s.step(1 / 60); };

describe('wand-toy play · parked for the human+cat lab', () => {
  it('is not mounted on any page or bench (Lab 2-12 is the cat alone)', () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f)) files.push(p); } };
    for (const d of ['app', 'components']) walk(d);
    expect(files.length).toBeGreaterThan(10);
    expect(files.filter(f => /from\s+['"][^'"]*cat-wand['"]/.test(readFileSync(f, 'utf8')))).toEqual([]);
  });

  it.each([4, 6, 8])('play stays on fully opened platforms and jumps only to the eight neighbours on grid %i', grid => {
    const s = new CatWandSim({ grid, behaviour: 'play' });
    for (let i = 0; i < 60 * 60; i++) {
      s.step(1 / 60);
      for (const u of s.supportUnits) expect(s.act.degree[u.i]).toBe(1);
      const u = s.currentUnit;
      if (s.supportUnits.length === 2) {
        const [a, b] = s.supportUnits;
        expect(Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col))).toBe(1);
      } else {
        // Standing in play: anywhere on the platform, body mostly over it.
        expect(Math.hypot(s.walker.x - u.x, s.walker.y - u.y)).toBeLessThanOrEqual(s.layout.platR - CAT.bodyR * 0.5 + 1e-9);
      }
    }
    expect(s.walker.distance).toBeGreaterThan(0.5);
  });

  it('a cat pawing its toy fixates nothing', () => {
    const s = new CatWandSim({ behaviour: 'play' });
    let pawed = false;
    for (let i = 0; i < 60 * 30; i++) {
      s.step(1 / 60);
      if (s.state === 'capture') { pawed = true; expect(s.gazeUnit).toBeNull(); }
    }
    expect(pawed).toBe(true);
  });

  it.each([4, 6, 8])('play follows the toy across the field instead of looping a fixed route on grid %i', grid => {
    const s = new CatWandSim({ grid, behaviour: 'play' });
    const moves: number[] = [];
    let prev = s.currentUnit.i;
    const phases = new Set<string>();
    for (let i = 0; i < 60 * 120; i++) {
      s.step(1 / 60);
      phases.add(s.phase);
      if (s.currentUnit.i !== prev) { prev = s.currentUnit.i; moves.push(prev); }
      if (s.state === 'capture') {
        expect(Math.hypot(s.toy!.x - s.walker.x, s.toy!.y - s.walker.y)).toBeLessThanOrEqual(WAND_PLAY.pawReach);
      }
    }
    for (const ph of ['watch', 'stalk', 'chase', 'capture']) expect(phases.has(ph)).toBe(true);
    expect(s.catches).toBeGreaterThanOrEqual(4);
    expect(s.visited.size).toBeGreaterThanOrEqual(Math.min(7, grid * grid));
    const used = [...s.visited].map(i => s.layout.units[i]);
    expect(new Set(used.map(u => u.row)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(used.map(u => u.col)).size).toBeGreaterThanOrEqual(3);
    // Not a short cycle: some step differs from the one 2, 3 and 4 moves earlier.
    for (const period of [2, 3, 4]) expect(moves.some((m, k) => k >= period && m !== moves[k - period])).toBe(true);
  });

  it('play responds to the toy the viewer holds: the cat stalks a still toy and catches it', () => {
    const s = new CatWandSim({ behaviour: 'play' });
    run(s, 0.2);
    const far = s.layout.units[0];
    expect(s.holdToy(far.x, far.y)).toBe(true);
    const d0 = Math.hypot(far.x - s.walker.x, far.y - s.walker.y);
    let caught = false, stalked = false;
    for (let i = 0; i < 60 * 30 && !caught; i++) {
      s.dragToy(far.x, far.y);
      s.step(1 / 60);
      if (s.phase === 'stalk') stalked = true;
      if (s.state === 'capture') caught = true;
    }
    expect(stalked).toBe(true);
    expect(caught).toBe(true);
    expect(Math.hypot(far.x - s.walker.x, far.y - s.walker.y)).toBeLessThan(d0 / 3);
  });

  it('interest drains with play and catches; the cat quits, lies down, and a new toy renews play', () => {
    const s = new CatWandSim({ behaviour: 'play' });
    let last = s.interest, quitAt = -1;
    for (let i = 0; i < 60 * 90 && quitAt < 0; i++) {
      s.step(1 / 60);
      expect(s.interest).toBeLessThanOrEqual(last + 1e-12);
      last = s.interest;
      if (s.phase === 'sit' && s.toyMode === 'dropped') quitAt = s.t;
    }
    expect(quitAt).toBeGreaterThan(15);
    expect(s.interest).toBeLessThanOrEqual(WAND_PLAY.stop);
    run(s, WAND_PLAY.quitSit + 0.5);
    expect(s.phase).toBe('lie');
    expect(s.gazeUnit).toBeNull();
    const kind = s.toyKind;
    run(s, WAND_PLAY.swapAfter - WAND_PLAY.quitSit);
    // Hall et al. 2002: a contrasting toy renews play after habituation.
    expect(s.toyKind).toBe(kind + 1);
    expect(s.interest).toBeGreaterThan(0.9);
    run(s, 2);
    expect(['watch', 'stalk', 'chase', 'capture']).toContain(s.phase);
    // The viewer's "new toy" does the same at once.
    s.interest = 0.3; s.newToy();
    expect(s.interest).toBe(1); expect(s.toyKind).toBe(kind + 2);
  });

  it('a cat with little interest left only watches a moving toy', () => {
    const s = new CatWandSim({ behaviour: 'play' });
    run(s, 0.5);
    let watched = 0;
    for (let i = 0; i < 60 * 40; i++) {
      s.interest = (WAND_PLAY.stop + WAND_PLAY.vigorous) / 2;
      s.step(1 / 60);
      // Standing (not mid-jump) while the toy travels: it watches, never chases.
      if (s.toyMoving && s.supportUnits.length === 1 && s.state !== 'capture') {
        expect(s.phase).toBe('watch');
        watched++;
      }
    }
    expect(watched).toBeGreaterThan(10);
  });

  it('a toy twitching in place reads as still: the reading does not flicker', () => {
    const s = new CatWandSim({ behaviour: 'play' });
    let flips = 0, last = s.toyMoving;
    for (let i = 0; i < 60 * 30; i++) {
      s.step(1 / 60);
      if (s.toyMode === 'twitch' && s.toyMoving !== last) flips++;
      last = s.toyMoving;
    }
    expect(flips).toBeLessThanOrEqual(6);
  });

  it('free mode cycles pass, rest and play; replays are identical', () => {
    const s = new CatWandSim({ behaviour: 'free' });
    const episodes: string[] = [];
    for (let i = 0; i < 120 * 60; i++) {
      if (episodes[episodes.length - 1] !== s.episode) episodes.push(s.episode);
      s.step(1 / 60);
    }
    expect(episodes.slice(0, 3)).toEqual(['pass', 'rest', 'play']);
    const before = { x: s.walker.x, y: s.walker.y, degree: Array.from(s.act.degree) };
    s.replay(); run(s, 120);
    expect({ x: s.walker.x, y: s.walker.y, degree: Array.from(s.act.degree) }).toEqual(before);
  });
});
