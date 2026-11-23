import { describe, expect, it } from 'vitest';
import { COHABIT, bandAngle, furnRect } from './cohabit';
import { DESIGN, SOURCES, heightToward, riseLimit, type Source } from './cohabit-design';
import { FRAMES, TrajectoryBaker, UNITS_PER_M, UNIT_DUAL_DEFS, UNIT_DUAL_OPTS, UNIT_TIERS, liftTrajectory, rigFor } from './cohabit-solid';
import { SOLID } from './skin-solid';
import { planLayout } from './unit-activation';
import { RING } from './skin-ring';
import { GIVE, TOPS, catRingAngle, ringSpot, UPPER_ABOVE, STILL_SCENES, VIGNETTES, VignetteSim, catAt, keysAt, pathAt, unitRamp, vignetteLayout, vignetteScript } from './cohabit-vignette';
import { RING_SIDE, TABLE_TOP } from './cohabit-solid';

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

  it('六个小样都能从头放到尾：程度在 [0, 1]、人坐着时在座位上、猫脚下的台已经成形', () => {
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
    const t = s.units.findIndex((u) => u?.design.role === 'table');
    expect(s.units[t]!.design.top).toBe(TOPS.tea);
    const T = l.units[t];
    const gap = T.y - l.platR - sofa.y1;
    expect(gap).toBeGreaterThanOrEqual(COHABIT.TABLE.SOFA_GAP[0]);
    expect(gap).toBeLessThanOrEqual(COHABIT.TABLE.SOFA_GAP[1]);
    const bands = s.units[t]!.design.form.bands!;
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

  it('引路：除了桌子，任何时刻落着（或在落）的单元不超过猫脚下、下一步与正在收回的那一台；下一步在猫走上前一台之后才落', () => {
    const sim = new VignetteSim('guide');
    const table = sim.script.units.findIndex((u) => u?.design.role === 'table');
    for (let t = 0; t < sim.script.duration; t += 0.1) {
      sim.step(0.1);
      const down = [...sim.act.degree].filter((d, i) => d > 0 && i !== table).length;
      expect(down).toBeLessThanOrEqual(3);
    }
    // 2-14 一次只落一步：第二步开始落的时刻，猫已经在第一步上
    const s = vignetteScript('guide');
    const steps = s.units.map((u, i) => ({ u, i })).filter((x) => x.u?.design.role === 'step');
    const start2 = steps[1].u!.deg[0][0];
    const on = catAt(s.cats[0], start2).on;
    expect(on).toContain(steps[0].i);
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

describe('cohabit-vignette · 每台的形由对应函数给（2026-11-16）', () => {
  it('每个小样的每一台都带对应函数给的形、一个标签、至少一样用到的研究；标签在一个小样里不重复', () => {
    for (const v of VIGNETTES) {
      const sim = new VignetteSim(v.key);
      const tags = sim.tags();
      expect(tags.length).toBeGreaterThan(0);
      expect(new Set(tags.map((t) => t.tag)).size).toBe(tags.length);
      for (const t of tags) {
        expect(t.design.uses.length, `${v.key} ${t.tag}`).toBeGreaterThan(0);
        expect(sim.formOf(t.u)).toBe(t.design.form);
        expect(sim.topOf(t.u)).toBe(t.design.top);
      }
    }
  });

  it('六个小样合起来用上了之前研究里除方形环三档以外的每一样（方形环三档每台都用）', () => {
    const used = new Set<Source>();
    for (const v of VIGNETTES) for (const t of new VignetteSim(v.key).tags()) t.design.uses.forEach((u) => used.add(u));
    for (const k of Object.keys(SOURCES) as Source[]) if (k !== 'square') expect(used.has(k), k).toBe(true);
  });

  it('坐下引猫：桌子按 2-14 的规则落在椅子前面（餐桌高），座位前方那台离座位 1.0–1.5 m', () => {
    const s = vignetteScript('guide');
    const l = vignetteLayout(3);
    const seat = new VignetteSim('guide').seats[0];
    const byRole = (r: string) => s.units.map((u, i) => ({ u, i })).filter((x) => x.u?.design.role === r);
    const [table] = byRole('table');
    expect(table.u!.design.top).toBe(TABLE_TOP.chair);
    expect(table.i).toBe(5); // (1, 2)：椅子正前方那台
    const [meet] = byRole('meet');
    const d = Math.hypot(l.units[meet.i].x - seat.x, l.units[meet.i].y - seat.y);
    expect(d).toBeGreaterThanOrEqual(1.0); // 座位前方那台：离座位 1.0–1.5 m（规则总表 1.2）
    expect(d).toBeLessThanOrEqual(1.5);
    expect(meet.u!.design.top).toBe(TOPS.lower);
    expect(meet.u!.design.form.bands!.reduce((a, b) => a + b, 0)).toBe(BANDS / 2);
  });

  it('坐下引猫：第一步低的那一端 0.42 m，每道接缝两边一样高，最后接上座位前方那台的下层；每台高差都在它能抬的范围里', () => {
    const s = vignetteScript('guide');
    const l = vignetteLayout(3);
    const path = s.units.map((u, i) => ({ u: u!, i })).filter((x) => x.u && (x.u.design.role === 'step' || x.u.design.role === 'meet'));
    // 按路的先后（落下的时刻）排
    path.sort((a, b) => a.u.deg[0][0] - b.u.deg[0][0]);
    expect(path).toHaveLength(3);
    const first = path[0].u.design;
    expect(first.slope!.from).toBeCloseTo(DESIGN.LOW, 12);
    expect(first.come).toBe(0);
    for (let k = 1; k < path.length; k++) {
      const a = l.units[path[k - 1].i];
      const b = l.units[path[k].i];
      const hA = heightToward(path[k - 1].u.design, Math.atan2(b.y - a.y, b.x - a.x));
      const hB = heightToward(path[k].u.design, Math.atan2(a.y - b.y, a.x - b.x));
      expect(Math.abs(hA - hB)).toBeLessThan(1e-9);
    }
    for (const { u } of path.slice(0, -1)) {
      const sl = u.design.slope!;
      expect(Math.abs(sl.to - sl.from)).toBeLessThanOrEqual(riseLimit(sl.inDir, sl.outDir) + 1e-9);
    }
  });

  it('猫在台上的高度就是它所在那一处的台面（斜台、一半高一半低都按位置取）', () => {
    for (const v of VIGNETTES) {
      const s = vignetteScript(v.key);
      const l = vignetteLayout(s.n);
      for (const beats of s.cats)
        for (const b of beats) {
          if (b.on.length !== 1 || b.h === undefined) continue;
          const u = l.units[b.on[0]];
          const d = s.units[b.on[0]]!.design;
          const r = Math.hypot(b.x - u.x, b.y - u.y);
          if (r < l.mastR + 0.02 || d.open !== null) continue; // 在芯心（按朝向摆）或两层（下层平）的不量
          const th = Math.atan2(b.y - u.y, b.x - u.x) - RING_SIDE;
          expect(b.h, `${v.key} @ ${b.t}`).toBeCloseTo(heightToward(d, th), 9);
        }
    }
  });

  it('先低后高：朝邻台的半圈抬一台能抬的高差、另一半不抬，高的那半与邻台齐平', () => {
    const s = vignetteScript('step');
    const a = s.units.find((u) => u?.design.role === 'stair')!.design;
    const b = s.units.find((u) => u?.design.role === 'flush')!.design;
    const lift = a.form.lift!;
    const rise = a.stair!.high - a.stair!.low;
    expect(rise).toBeLessThanOrEqual(DESIGN.RISE + 0.01 + 1e-12);
    for (let j = 0; j < BANDS; j++) expect(lift[j]).toBeCloseTo(Math.cos(bandAngle(j)) > 0 ? rise : 0, 12);
    expect(b.top).toBeCloseTo(a.stair!.high, 12);
    expect(a.stair!.high).toBeCloseTo(TOPS.stand, 9);
  });

  it('站桌下给猫一层：整圈两层，上层台面 = 站着用的 1.05 m，下层离地 0.47 m、钉住端在地面以上；邻台与上层齐平', () => {
    const s = vignetteScript('counter');
    const t = s.units.find((u) => u?.design.role === 'counter')!.design;
    expect([...t.form.bands!].every((b) => b === 1)).toBe(true);
    expect(t.top + UPPER_ABOVE).toBeCloseTo(TOPS.stand, 9);
    expect(t.top - 0.225).toBeGreaterThan(0.2); // 下台到钉住端约 0.225 m（cohabit-solid 两层台实测）
    expect(s.units.find((u) => u?.design.role === 'flush')!.design.top).toBeCloseTo(TOPS.stand, 9);
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
  it('当桌子用的单元先落好，人才坐下 / 走到台前（2026-11-10）', () => {
    // 茶几：访客坐下那一刻，茶几那台已经成形到底
    const tea = vignetteScript('tea');
    const table = tea.units.find((u) => u?.design.role === 'table')!;
    const sitAt = tea.people[0].sit![0];
    expect(keysAt(table.deg, sitAt)).toBe(1);
    expect(keysAt(table.deg, sitAt - 3)).toBeLessThan(1); // 也没早到人还没进门就落好
    // 站桌：访客停在台前那一刻（路线里第一个停住的点），面前两台都已成形
    const counter = vignetteScript('counter');
    const path = counter.people[0].path;
    const stopAt = path.find((p, k) => k > 1 && Math.hypot(p[1] - path[k - 1][1], p[2] - path[k - 1][2]) > 0.5)![0];
    for (const u of counter.units) if (u) expect(keysAt(u.deg, stopAt)).toBe(1);
    // 坐下引猫：访客坐下那一刻，桌子那台已经成形到底
    const guide = vignetteScript('guide');
    const gt = guide.units.find((u) => u?.design.role === 'table')!;
    expect(keysAt(gt.deg, guide.people[0].sit![0])).toBe(1);
  });
});

describe('cohabit-vignette · 只用于出静帧的场景（2026-11-23）', () => {
  it('不在 Lab 2-16 的列表里，键只含小写字母与数字（哈希认得）', () => {
    for (const v of STILL_SCENES) {
      expect(VIGNETTES.map((x): string => x.key)).not.toContain(v.key);
      expect(v.key).toMatch(/^[a-z][a-z0-9]*$/);
      expect(vignetteScript(v.key).n).toBe(v.n);
    }
  });

  it('stillguide：桌子与猫的第一步都在坐下那一刻才开始落，猫等着的时候坐着', () => {
    const s = vignetteScript('stillguide');
    const sit = s.people[0].sit![0];
    const down = s.units.filter((u) => u && keysAt(u.deg, sit + 1) > 0);
    expect(down.length).toBe(2);
    for (const u of s.units) if (u) expect(keysAt(u.deg, sit - 0.01)).toBe(0);
    expect(catAt(s.cats[0], sit).state).toBe('sit');
    // 其余与 guide 同一条路、同一组形
    const g = vignetteScript('guide');
    expect(s.units.map((u) => u?.design.role ?? null)).toEqual(g.units.map((u) => u?.design.role ?? null));
  });
});
