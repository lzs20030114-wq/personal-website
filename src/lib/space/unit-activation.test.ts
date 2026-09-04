import { describe, expect, it } from 'vitest';
import {
  Activation,
  PATHS,
  PLAN,
  PlanSim,
  TraceField,
  aisleLines,
  buildCatchment,
  dwellInput,
  dwellSpot,
  planLayout,
  runScenario,
  unitInputs,
  w2m,
} from './unit-activation';
import { RING } from './skin-ring';
import { MM_PER_UNIT, PEAK_REACH, RIG_SCALE, ROOM, ringCellPitch, ringGridSpan, roomSpan } from './skin-grid';

/**
 * Lab.14 一个人走过——守门。
 * 三件机制（痕迹 / 衰减 / 阈值）来自作者 07-20 的原型；守门卡的是：4×4 与 Lab.12 逐位同源、
 * 别的 N 只是等比缩、痕迹是强度语义（圈里每块地各记满）、按格读法完整分片、棘轮不回退，
 * 以及五条行为在默认规则下的结论（穿行不激活 / 驻留长出一个十字形的一群 / 折返与绕圈只到半成 /
 * 4×4 读不出「群」）——结论一变就该有人知道。
 */

const L4 = planLayout(4);
const L8 = planLayout(8);
const idx = (l: { n: number }, row: number, col: number) => row * l.n + col;

describe('unit-activation · 平面布局', () => {
  it('4×4 与 Lab.12 逐位同源：格距、平台外缘、芯、场地、房间全由 skin-grid 换算成米', () => {
    const toM = (px: number) => (px * RIG_SCALE * MM_PER_UNIT) / 1000;
    expect(L4.pitchM).toBeCloseTo(toM(ringCellPitch(RING.RADIUS_DEF)), 9);
    expect(L4.platR).toBeCloseTo(toM(RING.RADIUS_DEF + PEAK_REACH), 9);
    expect(L4.mastR).toBeCloseTo(toM(RING.RADIUS_DEF), 9);
    expect(L4.fieldM).toBeCloseTo(w2m(ringGridSpan(RING.RADIUS_DEF)), 9);
    expect(L4.roomM).toBeCloseTo(w2m(roomSpan(RING.RADIUS_DEF)), 9);
    expect((L4.roomM - L4.fieldM) / 2).toBeCloseTo(w2m(ROOM.MARGIN), 9);
    expect(L4.units[5].x).toBeCloseTo(-L4.pitchM / 2, 12);
    expect(L4.units[5].y).toBeCloseTo(-L4.pitchM / 2, 12);
  });

  it('换 N 只是等比缩：场地与房间不变，平台/格距、芯/格距两个比例不变，N=8 的单元比一个人的肩宽略宽', () => {
    for (const n of PLAN.GRIDS) {
      const l = planLayout(n);
      expect(l.units).toHaveLength(n * n);
      expect(l.fieldM).toBeCloseTo(L4.fieldM, 12);
      expect(l.roomM).toBeCloseTo(L4.roomM, 12);
      expect(l.pitch4).toBeCloseTo(L4.pitchM, 12);
      expect(l.platR / l.pitchM).toBeCloseTo(L4.platR / L4.pitchM, 12);
      expect(l.mastR / l.pitchM).toBeCloseTo(L4.mastR / L4.pitchM, 12);
      // 两端各露半个平台 ⇒ 阵列占宽恰好铺满场地
      expect((n - 1) * l.pitchM + 2 * l.platR).toBeCloseTo(l.fieldM, 9);
      l.units.forEach((u, i) => {
        expect(u.i).toBe(i);
        expect(u.row).toBe(Math.floor(i / n));
        expect(u.col).toBe(i % n);
        expect(Math.abs(u.x) + l.platR).toBeLessThan(l.roomM / 2);
        expect(Math.abs(u.y) + l.platR).toBeLessThan(l.roomM / 2);
      });
      expect(l.pitchM).toBeGreaterThan(2 * l.platR); // 相邻平台留缝
    }
    expect(2 * L8.platR).toBeGreaterThan(2 * PLAN.BODY_R);
    expect(2 * L8.platR).toBeLessThan(0.6);
    expect(L8.pitchM).toBeGreaterThan(0.55);
    expect(L8.pitchM).toBeLessThan(0.65);
    expect(() => planLayout(1)).toThrow();
  });

  it('「按格」读法的边界是格线：N=4 三条、N=8 七条，都在过道正中', () => {
    expect(aisleLines(L4).x.map((v) => +(v / L4.pitchM).toFixed(9))).toEqual([-1, 0, 1]);
    const a8 = aisleLines(L8);
    expect(a8.x).toHaveLength(7);
    expect(a8.y.map((v) => +(v / L8.pitchM).toFixed(9))).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  it('驻留点 = 离 Lab.12 单元 (1,1) 中心最近的单元中心（站到单元正下方）', () => {
    expect(dwellSpot(L4).i).toBe(idx(L4, 1, 1));
    const s8 = dwellSpot(L8);
    expect(Math.hypot(s8.x + L4.pitchM / 2, s8.y + L4.pitchM / 2)).toBeLessThan(L8.pitchM);
  });
});

describe('unit-activation · 痕迹场（强度语义）', () => {
  it('圈里的每块地各记满 dt，圈外一格不记；最大值 = dt', () => {
    const f = new TraceField(L8.roomM);
    f.imprint(0.3, -0.2, 0.6, 0.05);
    expect(f.max()).toBeCloseTo(0.05, 6); // Float32 存储
    let inside = 0;
    for (let i = 0; i < f.data.length; i++) {
      const [x, y] = f.cellCenter(i);
      const d = Math.hypot(x - 0.3, y + 0.2);
      if (f.data[i] > 0) {
        inside++;
        expect(d).toBeLessThan(0.6 + f.cell);
      } else expect(d).toBeGreaterThan(0.6 - f.cell);
    }
    // 圆盘面积 / 格面积 ≈ π·0.6² / 0.01 ≈ 113
    expect(inside).toBeGreaterThan(95);
    expect(inside).toBeLessThan(130);
  });

  it('人在墙外一格都记不上', () => {
    const f = new TraceField(L8.roomM);
    f.imprint(L8.roomM, 0, 0.22, 1);
    expect(f.total()).toBe(0);
  });

  it('衰减 = 每秒 × (1−rate)，与时间步长无关', () => {
    const a = new TraceField(L8.roomM);
    const b = new TraceField(L8.roomM);
    a.imprint(0, 0, 0.6, 1);
    b.imprint(0, 0, 0.6, 1);
    a.decay(1, 0.02);
    for (let k = 0; k < 20; k++) b.decay(0.05, 0.02);
    expect(a.max()).toBeCloseTo(0.98, 5);
    expect(b.max()).toBeCloseTo(0.98, 5);
  });
});

describe('unit-activation · 读法', () => {
  it('按格：每格归且只归一个单元；读数是均值——整格都在圈里就读到整份', () => {
    const f = new TraceField(L8.roomM);
    const c = buildCatchment(L8, f, 'nearest');
    const counted = new Set<number>();
    let n = 0;
    for (const cells of c.cellsOf)
      for (const i of cells) {
        expect(counted.has(i)).toBe(false);
        counted.add(i);
        n++;
      }
    expect(n).toBe(f.cols * f.rows);
    const u = dwellSpot(L8);
    f.imprint(u.x, u.y, PLAN.REACH.def, 1);
    const s = unitInputs(f, c);
    expect(s[u.i]).toBeCloseTo(1, 6); // 半格对角 0.43 m < 1.0 m ⇒ 整格在圈里
    // 四个正邻居几乎整格在圈里（远角 1.03 m），四个斜邻居只到一半上下
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(s[idx(L8, u.row + dr, u.col + dc)]).toBeGreaterThan(0.9);
    for (const [dr, dc] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const v = s[idx(L8, u.row + dr, u.col + dc)];
      expect(v).toBeGreaterThan(0.3);
      expect(v).toBeLessThan(0.8);
    }
  });

  it('脚下：只读平台正下方，相邻单元互不读到同一块地，平台之间的缝是盲区', () => {
    const f = new TraceField(L8.roomM);
    const c = buildCatchment(L8, f, 'disk');
    const seen = new Set<number>();
    let dup = 0;
    let covered = 0;
    for (const cells of c.cellsOf)
      for (const i of cells) {
        seen.has(i) ? dup++ : seen.add(i);
        covered++;
      }
    expect(dup).toBe(0);
    expect(covered).toBeLessThan(f.cols * f.rows);
  });
});

describe('unit-activation · 激活棘轮', () => {
  it('程度 = min(1, 读数/阈值)，只升不降', () => {
    const a = new Activation(2, 10);
    a.update(Float64Array.from([4, 12]));
    expect(a.degree[0]).toBeCloseTo(0.4, 12);
    expect(a.degree[1]).toBe(1);
    a.update(Float64Array.from([1, 0]));
    expect(a.degree[0]).toBeCloseTo(0.4, 12);
    expect(a.degree[1]).toBe(1);
    expect(a.formed()).toEqual([1]);
    expect(a.partial()).toEqual([0]);
    expect(a.countAtLeast(0.5)).toBe(1);
    expect(a.input[0]).toBe(1);
  });
});

describe('unit-activation · 五种行为在默认规则下的结论（8×8，影响半径 1.0 m）', () => {
  it('每条预设都从左门进、右门出；离场后地面只衰减不再记', () => {
    for (const p of PATHS) {
      if (p.free) continue;
      const r = p.route(L8);
      expect(r[0]).toMatchObject({ x: L8.doors[0].x, y: 0 });
      expect(r[r.length - 1]).toMatchObject({ x: L8.doors[1].x, y: 0, exit: true });
      const sim = runScenario({ path: p.key }, 5);
      expect(sim.walker.present).toBe(false);
      expect(sim.exitedAt).not.toBeNull();
      const before = sim.field.total();
      sim.step(1);
      expect(sim.field.total()).toBeLessThan(before);
    }
  });

  it('穿行 / 斜穿：路过一块地面只有一秒上下，一个都不成形——慢慢走也不行', () => {
    for (const path of ['through', 'diagonal'] as const) {
      const sim = new PlanSim({ path });
      let peak = 0;
      while (sim.exitedAt === null) {
        sim.step(0.05);
        peak = Math.max(peak, sim.act.maxInput());
      }
      expect(peak).toBeGreaterThan(0.4);
      // 一块地面在圈里待的时间 ≈ 2×1.0 m ÷ 1.2 m/s ≈ 1.7 s；斜穿在角上转向、走进又走出，那个角约两倍
      expect(peak).toBeLessThan(2.5);
      expect(sim.act.formed()).toEqual([]);
      const slow = runScenario({ path, speed: PLAN.SPEED.min }, 0);
      expect(slow.act.maxInput()).toBeLessThan(PLAN.THRESHOLD / 2);
      expect(slow.act.formed()).toEqual([]);
    }
  });

  it('驻留 20 s：长出一个十字形的「一群」——脚下那个与四个正邻居成形、四个斜邻居半成；离场后痕迹退、成形不退', () => {
    const sim = runScenario({ path: 'dwell' }, 0);
    const u = dwellSpot(L8);
    const cross = [u.i, idx(L8, u.row - 1, u.col), idx(L8, u.row + 1, u.col), idx(L8, u.row, u.col - 1), idx(L8, u.row, u.col + 1)].sort((a, b) => a - b);
    expect(sim.act.formed()).toEqual(cross);
    for (const [dr, dc] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const d = sim.act.degree[idx(L8, u.row + dr, u.col + dc)];
      expect(d).toBeGreaterThan(0.3);
      expect(d).toBeLessThan(1);
    }
    expect(sim.summary().half).toBeGreaterThanOrEqual(8);
    expect(sim.summary().half).toBeLessThanOrEqual(13);
    // 中心读数 ≈ 解析式（站 20 s，连续版 16.45）+ 走进走出的一点
    expect(sim.act.input[u.i]).toBeGreaterThan(dwellInput(PLAN.DWELL_S) * 0.9);
    expect(sim.act.input[u.i]).toBeLessThan(dwellInput(PLAN.DWELL_S) + 3);
    // 离场再看 60 s：读数掉到阈值以下，程度仍是 1
    sim.step(60);
    expect(sim.act.input[u.i]).toBeLessThan(PLAN.THRESHOLD / 2);
    expect(sim.act.formed()).toEqual(cross);
  });

  it('4×4 读不出「群」：同一个人同一处站同样久，最多只点亮脚下那一个', () => {
    const sim = runScenario({ path: 'dwell', grid: 4 }, 0);
    expect(sim.act.formed().length).toBeLessThanOrEqual(1);
    expect(sim.summary().half).toBeLessThanOrEqual(1);
    const s6 = runScenario({ path: 'dwell', grid: 6 }, 0);
    const s8 = runScenario({ path: 'dwell', grid: 8 }, 0);
    // 越密，同一个行为点亮的单元越多、群的形状越读得出
    expect(s6.summary().half).toBeGreaterThan(sim.summary().half);
    expect(s8.summary().half).toBeGreaterThan(s6.summary().half);
  });

  it('折返 8 趟：中线两侧刻出一条走廊——读数在 1/4 到 1 阈值之间，半成一排、一个不成形', () => {
    const sim = runScenario({ path: 'pace' }, 0);
    const s = sim.summary();
    expect(s.formed).toEqual([]);
    expect(s.half).toBeGreaterThanOrEqual(6);
    expect(s.half).toBeLessThanOrEqual(16);
    expect(s.maxInput).toBeGreaterThan(PLAN.THRESHOLD / 4);
    expect(s.maxInput).toBeLessThan(PLAN.THRESHOLD);
    // 半成的都贴着中线（行 3、4）
    for (const u of L8.units) if (sim.act.degree[u.i] >= 0.5) expect([3, 4]).toContain(u.row);
  });

  it('绕圈 6 圈：反复经过、从不停留——读数攒不到阈值，半成的连成一圈', () => {
    const sim = runScenario({ path: 'loop' }, 0);
    const s = sim.summary();
    expect(s.formed).toEqual([]);
    expect(s.half).toBeGreaterThanOrEqual(8);
    expect(s.half).toBeLessThanOrEqual(28);
    expect(sim.walker.distance).toBeGreaterThan(PLAN.LOOP_LAPS * 4 * 2 * L8.pitch4 * 0.95);
    // 场地正中的四个单元没被走到
    for (const [r, c] of [[3, 3], [3, 4], [4, 3], [4, 4]]) expect(sim.act.degree[idx(L8, r, c)]).toBeLessThan(0.5);
  });

  it('影响半径是旋钮：缩到身体（0.22 m）驻留连脚下那格都填不满；放到 1.2 m 群更大', () => {
    const tight = runScenario({ path: 'dwell', reach: PLAN.REACH.min }, 0);
    expect(tight.act.formed()).toEqual([]);
    expect(tight.act.maxInput()).toBeLessThan(PLAN.THRESHOLD);
    const wide = runScenario({ path: 'dwell', reach: PLAN.REACH.max }, 0);
    expect(wide.act.formed().length).toBeGreaterThan(runScenario({ path: 'dwell' }, 0).act.formed().length);
    expect(wide.act.formed().length).toBeGreaterThanOrEqual(9); // 十字长成 3×3 的块
  });

  it('阈值是旋钮：压到 0.5 s，斜穿在身后留下一条成形的带子', () => {
    const sim = runScenario({ path: 'diagonal', threshold: 0.5 }, 0);
    expect(sim.act.formed().length).toBeGreaterThanOrEqual(8);
    expect(sim.act.formed()).toContain(0);
    expect(sim.act.formed()).toContain(L8.units.length - 1);
  });

  it('自由模式：点哪走哪，站着就是驻留；离场再点从左门重新进来', () => {
    const sim = new PlanSim({ path: 'free' });
    expect(sim.walker.present).toBe(true);
    const u = L8.units[idx(L8, 5, 5)];
    sim.pointerTarget(u.x, u.y);
    for (let k = 0; k < 600; k++) sim.step(0.05); // 30 s：走过去 ≈ 4 s，剩下站着
    expect(sim.walker.state).toBe('idle');
    expect(sim.act.formed()).toContain(u.i);
    sim.leave();
    for (let k = 0; k < 200; k++) sim.step(0.05);
    expect(sim.walker.present).toBe(false);
    sim.pointerTarget(0, 0);
    expect(sim.walker.present).toBe(true);
    expect(sim.walker.x).toBeCloseTo(L8.doors[0].x, 9);
  });

  it('拖：按住人拖着走，位置直接跟指针、沿途记痕迹；松手站在原地，预设的路线不再自己走', () => {
    const sim = new PlanSim({ path: 'through' });
    for (let k = 0; k < 20; k++) sim.step(0.05); // 走了 1 s
    sim.hold(sim.walker.x, sim.walker.y);
    expect(sim.held).toBe(true);
    for (let k = 0; k <= 40; k++) {
      sim.drag(-2 + k * 0.1, -1.5);
      sim.step(0.05);
    }
    expect(sim.walker.x).toBeCloseTo(2, 6);
    expect(sim.walker.y).toBeCloseTo(-1.5, 6);
    expect(sim.field.data[sim.field.indexOf(0, -1.5)]).toBeGreaterThan(0);
    sim.release();
    expect(sim.held).toBe(false);
    const x = sim.walker.x;
    for (let k = 0; k < 100; k++) sim.step(0.05);
    expect(sim.walker.x).toBe(x); // 站着不动，也不会走完穿行那条路出门
    expect(sim.walker.present).toBe(true);
    expect(sim.exitedAt).toBeNull();
    // 重播回到预设
    sim.reset();
    expect(sim.held).toBe(false);
    expect(sim.walker.state).toBe('walk');
  });

  it('同一预设跑两遍逐位相同（无随机）', () => {
    const a = runScenario({ path: 'loop' }, 3);
    const b = runScenario({ path: 'loop' }, 3);
    expect(Array.from(a.act.input)).toEqual(Array.from(b.act.input));
    expect(a.field.total()).toBe(b.field.total());
  });
});
