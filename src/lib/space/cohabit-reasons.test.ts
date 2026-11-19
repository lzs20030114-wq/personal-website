import { describe, expect, it } from 'vitest';
import { COHABIT, CohabitSim, PACE_DEMO, partySizes, scatterCats } from './cohabit';
import { bandRequesters, ruleReadout, unitReasons } from './cohabit-reasons';

/** 2-15 的配置（与 scripts/cohabit/io-audit.mjs 同一份）：6 人 4 猫、20 座、会动的单元、引导开 */
function standardScene(seed: number): CohabitSim {
  const sim = new CohabitSim({
    trigger: 'posture',
    grid: COHABIT.SEATS.GRID,
    unit: 'square',
    cover: 'room',
    space: 'live',
    seed,
    opening: false,
    auto: true,
    faces: true,
    social: true,
    catFloor: true,
    cat: { ...COHABIT.CAT_MT, ...COHABIT.CAT_LEVELS.mid },
    guide: COHABIT.GUIDE,
    pace: PACE_DEMO,
  });
  const half = sim.layout.fieldM / 2;
  partySizes(6).forEach((sz, i, a) => {
    const ang = (i / a.length) * 2 * Math.PI + 0.3;
    sim.addParty(Math.cos(ang) * half * 0.6, Math.sin(ang) * half * 0.6, sz);
  });
  scatterCats(sim, 4, seed);
  return sim;
}

describe('cohabit-reasons · 单元为什么落、为了谁', () => {
  it('每一步里往下落的单元都归得到一个理由，桌子与引猫的理由带着引起它的人', { timeout: 30_000 }, () => {
    const sim = standardScene(11);
    const n = sim.layout.units.length;
    const prev = Float64Array.from(sim.act.degree);
    let rising = 0;
    let sawTable = false;
    let sawGuide = false;
    for (let k = 0; k < 30 * 150; k++) {
      sim.step(1 / 30);
      const why = unitReasons(sim);
      for (let u = 0; u < n; u++) {
        if (sim.act.degree[u] > prev[u] + 1e-9) {
          rising++;
          expect(why[u].length, `t=${sim.t.toFixed(2)} 单元 ${u} 在落却没有理由`).toBeGreaterThan(0);
        }
        for (const r of why[u]) {
          if (r.kind === 'table') {
            sawTable = true;
            const p = sim.people.find((q) => q.id === r.person)!;
            expect(p.seated && p.seat !== null && sim.seats[p.seat].table === u).toBe(true);
          }
          if (r.kind === 'step' || r.kind === 'meet') {
            sawGuide = true;
            expect(sim.people.find((q) => q.id === r.person)!.seated).toBe(true);
          }
        }
        prev[u] = sim.act.degree[u];
      }
    }
    expect(rising).toBeGreaterThan(50);
    expect(sawTable && sawGuide).toBe(true);
  });

  it('读数：坐着引猫一条对一条、猫要换地方对得上猫、桌子对得上 tableBy、收开的带都有请求人', { timeout: 30_000 }, () => {
    const sim = standardScene(12);
    const seen = new Set<string>();
    for (let k = 0; k < 30 * 150; k++) {
      sim.step(1 / 30);
      const hits = ruleReadout(sim);
      for (const h of hits) seen.add(h.row);
      const sit = sim.guides.filter((g) => g.kind === 'sit').length;
      expect(hits.filter((h) => h.row === 'seatFar' || h.row === 'met').length).toBe(sit);
      expect(hits.filter((h) => h.row === 'stand').length).toBe(sim.guides.length - sit);
      expect(hits.filter((h) => h.row === 'catMove').length).toBe(sim.cats.filter((c) => c.pending || c.climb).length);
      const tables = hits.filter((h) => h.row === 'table').map((h) => h.units[0]).sort((a, b) => a - b);
      const want = [...new Set(sim.people.filter((p) => p.seated && p.seat !== null && sim.seats[p.seat].table >= 0 && sim.tableBy[sim.seats[p.seat].table] >= 0).map((p) => sim.seats[p.seat!].table))].sort((a, b) => a - b);
      expect(tables).toEqual(want);
      for (const h of hits) if (h.row === 'pass') expect(sim.people.find((p) => p.id === h.people[0])!.walker.state).toBe('walk');
      // 每条正在收开的带（有请求、没被猫护住）都找得到请求它的人
      for (let i = 0; i < sim.bandWant.length; i += 7) {
        if (!sim.bandWant[i] || sim.bandHold[i]) continue;
        expect(bandRequesters(sim, (i / COHABIT.FACES.BANDS) | 0, i % COHABIT.FACES.BANDS).length).toBeGreaterThan(0);
      }
    }
    for (const row of ['pass', 'seatFar', 'catMove', 'table', 'foot']) expect(seen.has(row), row).toBe(true);
  });

  it('空间不是会动的那一档时没有读数', () => {
    const sim = standardScene(13);
    sim.setSpace('empty');
    sim.step(1 / 30);
    expect(ruleReadout(sim)).toEqual([]);
  });
});
