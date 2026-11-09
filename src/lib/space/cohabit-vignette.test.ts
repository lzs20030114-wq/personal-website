import { describe, expect, it } from 'vitest';
import { COHABIT, bandAngle, furnRect } from './cohabit';
import { FRAMES, TrajectoryBaker, UNITS_PER_M, UNIT_DUAL_DEFS, UNIT_DUAL_OPTS, UNIT_TIERS, liftTrajectory, rigFor } from './cohabit-solid';
import { SOLID } from './skin-solid';
import { planLayout } from './unit-activation';
import { RING } from './skin-ring';
import { GIVE, RAMP_RISE, STEP_RISE, TOPS, catRingAngle, ringSpot, UPPER_ABOVE, VIGNETTES, VignetteSim, catAt, keysAt, pathAt, unitRamp, vignetteLayout, vignetteScript } from './cohabit-vignette';

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

  it('脚本里会落下的台都不压在家具上', () => {
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
    // 猫身下的带不收：猫坐的那台，离猫方位 60° 以内的带一条都没收
    const cat = sim.cats[0];
    const on = sim.supportOf(cat)[0];
    for (let j = 0; j < BANDS; j++) {
      const d = catRingAngle(cat.walker.heading) - bandAngle(j);
      if (Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < Math.PI / 3) expect(sim.bandOpen[on.i * BANDS + j]).toBe(0);
    }
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

describe('cohabit-vignette · 第二批（续坡 / 站桌下给猫一层 / 先低后高）', () => {
  it('续坡：每台最低那条带不抬，前两台的高边接上后一台的台面（齐平到 1 cm）', () => {
    const s = vignetteScript('ramp');
    const used = s.units.filter((u): u is NonNullable<typeof u> => !!u);
    expect(used).toHaveLength(3);
    const [a, b, c] = [...used].sort((x, y) => x.top - y.top);
    for (const u of [a, b]) expect(Math.min(...u.form!.lift!)).toBe(0);
    expect(a.top + Math.max(...a.form!.lift!)).toBeCloseTo(b.top, 2);
    expect(b.top + Math.max(...b.form!.lift!)).toBeCloseTo(c.top, 2);
    expect(c.top).toBe(TOPS.stand);
    expect(Math.max(...a.form!.lift!)).toBeCloseTo(RAMP_RISE, 2);
  });

  it('先低后高：朝 +x 的半圈抬 STEP_RISE、另一半不抬，高的那半与旁边那台同高', () => {
    const s = vignetteScript('step');
    const a = s.units.find((u) => u?.form?.lift)!;
    const lift = a.form!.lift!;
    for (let j = 0; j < BANDS; j++) expect(lift[j]).toBe(Math.cos(bandAngle(j)) > 0 ? STEP_RISE : 0);
    expect(a.top + STEP_RISE).toBeCloseTo(TOPS.stand, 9);
  });

  it('站桌下给猫一层：整圈两层，上台台面 = 站着用的 1.05 m，下台离地 0.47 m、钉住端在地面以上', () => {
    const s = vignetteScript('counter');
    const t = s.units.find((u) => u?.form?.bands)!;
    expect([...t.form!.bands!].every((b) => b === 1)).toBe(true);
    expect(t.top + UPPER_ABOVE).toBeCloseTo(TOPS.stand, 9);
    expect(t.top - 0.225).toBeGreaterThan(0.2); // 下台到钉住端约 0.225 m（cohabit-solid 两层台实测）
  });

  it('猫沿一台的一圈挪位时不穿过立杆（ringSpot 之间的弦离台心比芯远）', () => {
    const l = vignetteLayout(2);
    const u = { x: 0, y: 0 };
    const a = ringSpot(u, (150 * Math.PI) / 180);
    const b = ringSpot(u, (60 * Math.PI) / 180);
    const mid = Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2);
    expect(mid).toBeGreaterThan(l.mastR + 0.02);
  });

  it('liftTrajectory：结构以上整体上移、钉住端不动、收在天花下的帧不抬', () => {
    const traj = new TrajectoryBaker(UNIT_TIERS[2]).preview();
    // preview 只有两帧，造一条够长的假轨迹走一遍各段
    const n = traj.n;
    const counts = FRAMES;
    const total = counts.form + counts.retract + counts.hoist + (counts.bridge ?? 0) + (counts.door ?? 0);
    const fake = { ...traj, frames: Array.from({ length: total }, () => Float64Array.from(traj.frames[0])), formActive: 10, retractActive: 10 };
    const d = 5;
    const up = liftTrajectory(fake, d);
    const formed = counts.form - 1;
    const tail = fake.mid + fake.midHalf;
    expect(up.frames[formed][n + 0] - fake.frames[formed][n + 0]).toBeCloseTo(d, 12);
    expect(up.frames[formed][n + tail - 1] - fake.frames[formed][n + tail - 1]).toBeCloseTo(d, 12);
    expect(up.frames[formed][2 * n - 1]).toBe(fake.frames[formed][2 * n - 1]);
    expect(up.frames[counts.form + counts.retract]).toBe(fake.frames[counts.form + counts.retract]); // 收起态
    expect(up.platformTopY).toBe(fake.platformTopY);
    expect(liftTrajectory(fake, 0)).toBe(fake);
  });
});

describe('cohabit-vignette · 人和猫不撞', () => {
  it('地上的猫离房间里的人至少 0.35 m（身体半径 0.22 加猫身）', () => {
    for (const v of VIGNETTES) {
      const sim = new VignetteSim(v.key);
      for (let t = 0; t < sim.script.duration; t += 0.1) {
        sim.step(0.1);
        for (const p of sim.people)
          for (const c of sim.cats) {
            if (sim.supportOf(c).length || (c.h ?? 0) > 0.3) continue;
            if (Math.abs(p.walker.x) > sim.layout.roomM / 2 + 0.1) continue;
            expect(Math.hypot(p.walker.x - c.walker.x, p.walker.y - c.walker.y), `${v.key} @ ${sim.t.toFixed(1)}`).toBeGreaterThan(0.35);
          }
      }
    }
  });
});
