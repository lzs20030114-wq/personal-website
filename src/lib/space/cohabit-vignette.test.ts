import { describe, expect, it } from 'vitest';
import { COHABIT, bandAngle, furnRect } from './cohabit';
import { FRAMES, TrajectoryBaker, UNITS_PER_M, UNIT_DUAL_DEFS, UNIT_DUAL_OPTS, UNIT_TIERS, rigFor } from './cohabit-solid';
import { SOLID } from './skin-solid';
import { planLayout } from './unit-activation';
import { RING } from './skin-ring';
import { GIVE, TOPS, UPPER_ABOVE, VIGNETTES, VignetteSim, catAt, keysAt, pathAt, unitRamp, vignetteLayout, vignetteScript } from './cohabit-vignette';

const BANDS = COHABIT.FACES.BANDS;

describe('cohabit-vignette · 2×2 / 3×3 小样', () => {
  it('场地与 2-15 同一个格距、同一种平台，房间 = n 个格距见方', () => {
    const room = planLayout(COHABIT.SEATS.GRID, RING.RADIUS_DEF, 'room');
    for (const n of [2, 3]) {
      const l = vignetteLayout(n);
      expect(l.pitchM).toBe(room.pitchM);
      expect(l.platR).toBe(room.platR);
      expect(l.mastR).toBe(room.mastR);
      expect(l.roomM).toBeCloseTo(n * room.pitchM, 12);
      expect(l.units).toHaveLength(n * n);
      expect(l.bandReach).toHaveLength(BANDS);
      // 装置的缩放只看格距：与 2-15 逐位相同
      expect(rigFor(l, { footY: 0, platformTopY: 0 }).s).toBe(rigFor(room, { footY: 0, platformTopY: 0 }).s);
      // 格心居中、最外一圈离墙半个格距
      const xs = l.units.map((u) => u.x);
      expect(Math.max(...xs) + room.pitchM / 2).toBeCloseTo(l.roomM / 2, 12);
    }
  });

  it('脚本的小工具：插值、路线朝向、程度 0 → 1 → 0', () => {
    expect(keysAt([[0, 0], [2, 1]], 1)).toBe(0.5);
    expect(keysAt([[0, 0], [2, 1]], 5)).toBe(1);
    const p = pathAt([[0, 0, 0], [2, 2, 0], [4, 2, 0], [6, 2, 2]], 3);
    expect(p).toMatchObject({ x: 2, y: 0, moving: false });
    expect(p.heading).toBe(0); // 停着沿用上一段
    expect(pathAt([[0, 0, 0], [2, 2, 0], [4, 2, 0], [6, 2, 2]], 5).heading).toBeCloseTo(Math.PI / 2, 12);
    const r = unitRamp(10, 30);
    expect(keysAt(r, 10)).toBe(0);
    expect(keysAt(r, 13)).toBe(COHABIT.WALL_AT);
    expect(keysAt(r, 18)).toBe(1);
    expect(keysAt(r, 30)).toBe(1);
    expect(keysAt(r, 40)).toBe(0);
  });

  it('四个小样都能从头放到尾：程度在 [0, 1]、人坐着时在座位上、猫脚下的台已经成形', () => {
    for (const v of VIGNETTES) {
      const sim = new VignetteSim(v.key);
      const s = sim.script;
      expect(sim.layout.n).toBe(v.n);
      expect(s.beats[0].t).toBe(0);
      for (let t = 0; t < s.duration; t += 0.1) {
        sim.step(0.1);
        for (const d of sim.act.degree) expect(d >= 0 && d <= 1).toBe(true);
        for (const p of sim.people) {
          if (!p.seated || p.seat === null) continue;
          expect(sim.seats[p.seat]).toBeDefined();
        }
        sim.cats.forEach((c) => {
          const on = sim.supportOf(c);
          // 台上的猫：脚下的台都成形了（跨台时两台都成形）
          for (const u of on) expect(sim.act.degree[u.i]).toBeGreaterThanOrEqual(1 - 1e-9);
        });
      }
      expect(sim.loops).toBeGreaterThanOrEqual(0);
    }
  });

  it('坐着的人头顶上没有落着的单元（落下的台不压人），家具上方的台不落', () => {
    for (const v of VIGNETTES) {
      const sim = new VignetteSim(v.key);
      const rects = sim.furn?.rects ?? [];
      sim.script.units.forEach((u, i) => {
        if (!u) return;
        const c = sim.layout.units[i];
        const half = sim.layout.platR; // 方台半边长 = 内切圆半径
        for (const r of rects) {
          const overlap = c.x + half > r.x0 && c.x - half < r.x1 && c.y + half > r.y0 && c.y - half < r.y1;
          expect(overlap, `${v.key} 第 ${i} 台压在家具上`).toBe(false);
        }
      });
    }
  });

  it('茶几那台：台边离沙发前缘 0.30–0.46 m（与 2-14 的桌子规则同一个范围），朝沙发那半圈只成下台', () => {
    const s = vignetteScript('tea');
    const sofa = furnRect(s.furniture[0]);
    const l = vignetteLayout(3);
    const t = s.units.findIndex((u) => u?.top === TOPS.tea);
    const T = l.units[t];
    const gap = T.y - l.platR - sofa.y1;
    expect(gap).toBeGreaterThanOrEqual(COHABIT.TABLE.SOFA_GAP[0]);
    expect(gap).toBeLessThanOrEqual(COHABIT.TABLE.SOFA_GAP[1]);
    const bands = s.units[t]!.form!.bands!;
    for (let j = 0; j < BANDS; j++) {
      const towardSofa = Math.sin(bandAngle(j)) < 0; // 沙发在 −y
      expect(bands[j]).toBe(towardSofa ? 0 : 1);
    }
  });

  it('让路：人站在中间的交叉点上，四台各收回朝着他的那几条带，其余不动；人走后全部落回', () => {
    const sim = new VignetteSim('giveway');
    // 走到交叉点并站稳（收回 2 s）
    for (let t = 0; t < 11; t += 0.05) sim.step(0.05);
    const at = sim.people[0].walker;
    expect(Math.hypot(at.x, at.y)).toBeLessThan(1e-9);
    let open = 0;
    for (const u of sim.layout.units)
      for (let j = 0; j < BANDS; j++) {
        const o = sim.bandOpen[u.i * BANDS + j];
        const a = bandAngle(j);
        const facing = Math.cos(a) * -u.x + Math.sin(a) * -u.y > 0; // 这条带朝着房间中心
        if (o > 0.5) {
          open++;
          expect(facing).toBe(true);
        }
      }
    expect(open).toBeGreaterThanOrEqual(4);
    expect(open).toBeLessThan(BANDS * 4 / 2);
    // 片尾：人早走了，带全落回
    for (let t = 11; t < sim.script.duration - 0.2; t += 0.05) sim.step(0.05);
    expect(Math.max(...sim.bandOpen)).toBe(0);
    expect(GIVE.ahead).toBeGreaterThan(0);
  });

  it('引路：任何时刻落着（或在落）的单元不超过猫脚下与下一步，再加上正在收回的那一台', () => {
    const sim = new VignetteSim('guide');
    for (let t = 0; t < sim.script.duration; t += 0.1) {
      sim.step(0.1);
      const down = [...sim.act.degree].filter((d) => d > 0).length;
      expect(down).toBeLessThanOrEqual(3);
    }
  });

  it('猫的一段：跨台时位置插值，跳上跳下时高度插值', () => {
    const beats = vignetteScript('cavity').cats[0];
    const jump = beats.findIndex((b) => b.h === TOPS.lower);
    const a = beats[jump - 1];
    const b = beats[jump];
    const mid = catAt(beats, (a.t + b.t) / 2);
    expect(mid.h).toBeCloseTo(TOPS.lower / 2, 9);
  });

  it(
    'UPPER_ABOVE 与烘好的两层轨迹对得上（上台台面比下台台面高多少，±1 cm）',
    () => {
      // 角档两块都成（UNIT_DUAL_DEFS[2]）
      const traj = new TrajectoryBaker(UNIT_DUAL_DEFS[2], FRAMES, UNIT_DUAL_OPTS[2]).runAll();
      const l = vignetteLayout(3);
      const rig = rigFor(l, new TrajectoryBaker(UNIT_TIERS[0]).preview());
      const f = traj.frames[FRAMES.form - 1];
      const n = traj.n;
      const lo = (traj.upperMid ?? 0) - (traj.upperHalf ?? 0);
      const hi = (traj.upperMid ?? 0) + (traj.upperHalf ?? 0);
      let reach = 0;
      for (let i = lo; i <= hi; i++) reach = Math.max(reach, f[i]);
      let top = Infinity;
      for (let i = lo; i <= hi; i++) if (f[i] > reach * 0.5) top = Math.min(top, -f[n + i] * SOLID.SCALE);
      const above = (rig.s * (traj.platformTopY - top)) / UNITS_PER_M;
      expect(Math.abs(above - UPPER_ABOVE)).toBeLessThan(0.01);
    },
    120_000,
  );
});
