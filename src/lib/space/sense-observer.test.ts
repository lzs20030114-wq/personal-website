import { describe, expect, it } from 'vitest';
import { COHABIT, CohabitSim, PACE_STUDY, populateCohabit, scatterCats } from './cohabit';
import { SenseObserver } from './sense-observer';

/** Lab 2-17 那一场的配置（标准房间 · 6 人 4 猫 · 研究那一套访客节奏） */
function scene(seed: number): CohabitSim {
  const sim = new CohabitSim({ trigger: 'posture', grid: COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed, opening: false, auto: true, faces: true, social: true, catFloor: true, cat: { ...COHABIT.CAT_MT, ...COHABIT.CAT_LEVELS.mid }, goal: true, guide: { target: 'meet' }, pace: PACE_STUDY });
  populateCohabit(sim, 6, 0);
  scatterCats(sim, 4, seed);
  return sim;
}

describe('SenseObserver：从读数解回来', () => {
  it('四个上角：站着的人大半关键点解得出立体位置，解出来差几厘米；读到的在做什么大多对', () => {
    const sim = scene(101);
    const obs = new SenseObserver(sim.layout.roomM, 'corners4', 1, 'rgb');
    const errs: number[] = [];
    let right = 0;
    let known = 0;
    for (let t = 0; t < 30; t += 1 / 20) {
      sim.step(1 / 20);
      obs.update(sim, 1 / 20);
      if (t < 10) continue;
      for (const b of obs.bodies) {
        b.fix.forEach((f, k) => {
          if (f === 'tri') errs.push(Math.hypot(b.est[k].x - b.truth[k].x, b.est[k].y - b.truth[k].y, b.est[k].z - b.truth[k].z));
        });
        if (b.readOk !== null) {
          known++;
          if (b.readOk) right++;
        }
      }
    }
    errs.sort((a, b) => a - b);
    expect(errs.length).toBeGreaterThan(1000);
    expect(errs[Math.floor(errs.length / 2)]).toBeLessThan(0.06);
    expect(right / known).toBeGreaterThan(0.7);
  });

  it('深度相机：一台看见的点也定得住（比普通摄像头解出的点多）', () => {
    const count = (kind: 'rgb' | 'depth') => {
      const sim = scene(102);
      const obs = new SenseObserver(sim.layout.roomM, 'adjacent2', 1, kind);
      let n = 0;
      for (let t = 0; t < 15; t += 1 / 20) {
        sim.step(1 / 20);
        obs.update(sim, 1 / 20);
        if (t > 5) for (const b of obs.bodies) n += b.fix.filter((f) => f === 'tri' || f === 'depth').length;
      }
      return n;
    };
    expect(count('depth')).toBeGreaterThan(count('rgb'));
  });

  it('方案 B：四段都直接量到时位置差十来厘米；有一段隔着身体时差得多', () => {
    const sim = scene(103);
    const obs = new SenseObserver(sim.layout.roomM, 'corners4', 1, 'rgb');
    const clean: number[] = [];
    const blocked: number[] = [];
    for (let t = 0; t < 30; t += 1 / 20) {
      sim.step(1 / 20);
      obs.update(sim, 1 / 20);
      if (t < 5) continue;
      for (const b of obs.bodies) {
        const e = Math.hypot(b.tagEst.x - b.tag.x, b.tagEst.y - b.tag.y);
        (b.los.every(Boolean) ? clean : blocked).push(e);
      }
    }
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    expect(clean.length).toBeGreaterThan(50);
    expect(med(clean)).toBeLessThan(0.15);
    expect(med(blocked)).toBeGreaterThan(med(clean));
  });
});
