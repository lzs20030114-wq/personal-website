import { describe, expect, it } from 'vitest';
import {
  Activation,
  PATHS,
  PLAN,
  PlanSim,
  TraceField,
  aisleLines,
  blockedUnits,
  buildCatchment,
  dwellInput,
  dwellSpot,
  GAZE,
  keepOut,
  wrapAngle,
  nearestCrossing,
  nearestUnit,
  RESPONSES,
  planLayout,
  runScenario,
  unitInputs,
  unitsUnderBody,
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

  it('驻留点 = 离 Lab.12 单元 (1,1) 中心最近的过道交叉点（2026-09-05 改走过道：单元中心是根杆子）', () => {
    for (const L of [L4, planLayout(6), L8]) {
      const s = dwellSpot(L);
      expect(aisleLines(L).x.some((x) => Math.abs(x - s.x) < 1e-9)).toBe(true);
      expect(aisleLines(L).y.some((y) => Math.abs(y - s.y) < 1e-9)).toBe(true);
      expect(Math.hypot(s.x + L4.pitchM / 2, s.y + L4.pitchM / 2)).toBeLessThan(L.pitchM);
      expect(unitsUnderBody(L, s.x, s.y)).toHaveLength(0);
    }
  });

  it('斜穿与绕圈都贴过道走：路点全在过道线上，任何一步不穿杆子（三种密度）', () => {
    for (const L of [L4, planLayout(6), L8]) {
      const a = aisleLines(L);
      const on = (v: number, lines: number[]) => lines.some((x) => Math.abs(x - v) < 1e-6);
      for (const key of ['diagonal', 'loop'] as const) {
        const route = PATHS.find((p) => p.key === key)!.route(L);
        const inner = route.slice(1, -1); // 两端是门
        expect(inner.length).toBeGreaterThan(2);
        for (const w of inner) expect(on(w.x, a.x) || on(w.y, a.y)).toBe(true);
        // 相邻路点只沿 x 或只沿 y 走（阶梯 / 方框），且在过道线上
        for (let k = 1; k < inner.length; k++) {
          const dx = Math.abs(inner[k].x - inner[k - 1].x);
          const dy = Math.abs(inner[k].y - inner[k - 1].y);
          expect(dx < 1e-6 || dy < 1e-6).toBe(true);
          if (dx < 1e-6) expect(on(inner[k].x, a.x)).toBe(true);
          else expect(on(inner[k].y, a.y)).toBe(true);
        }
      }
    }
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

describe('unit-activation · 封顶 + 线性褪去（台架的演示口径）', () => {
  it('封顶：站着涨到 cap 就不再涨；人不在的格子每秒退 cap/秒数，到点退光', () => {
    const f = new TraceField(L8.roomM, PLAN.CELL, 2);
    for (let k = 0; k < 100; k++) f.imprint(0, 0, 0.6, 0.05); // 站 5 s
    expect(f.max()).toBeCloseTo(2, 6); // 封在 2，没涨到 5
    f.relax(0, 6); // 人还在场的那一步：覆盖过的格子不退（这一步只清标记）
    expect(f.max()).toBeCloseTo(2, 6);
    // 人走了：6 s 退光，中途线性
    f.relax(3, 6);
    expect(f.max()).toBeCloseTo(1, 6);
    f.relax(3, 6);
    expect(f.max()).toBe(0);
  });

  it('人站着的格子当步不退：先 imprint 再 relax，脚下照涨、周围在退', () => {
    const f = new TraceField(L8.roomM, PLAN.CELL, 2);
    f.imprint(0, 0, 0.6, 1);
    f.relax(1, 6);
    const here = f.data[f.indexOf(0, 0)];
    expect(here).toBeCloseTo(1, 6); // 覆盖过 ⇒ 不退
    f.imprint(3, 0, 0.6, 1); // 人挪走了
    f.relax(1, 6);
    expect(f.data[f.indexOf(0, 0)]).toBeCloseTo(1 - 2 / 6, 6); // 原地开始退
    expect(f.data[f.indexOf(3, 0)]).toBeCloseTo(1, 6);
  });

  it('演示默认：站定 ≈2 s 一群单元下来，人走后 ≈6 s 收光（用户 2026-09-04 拍板的两个数）', () => {
    const sim = new PlanSim({ path: 'free', threshold: PLAN.DEMO.threshold, fade: PLAN.DEMO.fade, mode: 'follow' });
    const u = nearestUnit(sim.layout, 0, 0);
    sim.hold(u.x, u.y); // 把人按在一个单元正下方站着（体检用，不走预设）
    let tOn = 0;
    for (let k = 0; k < 200; k++) {
      sim.step(0.05);
      tOn += 0.05;
      if (sim.act.degree[u.i] >= 1 - 1e-9) break;
    }
    expect(tOn).toBeGreaterThan(1.5);
    expect(tOn).toBeLessThan(3.5); // 2 s 上下（机构的 rise 上限磨掉一点点）
    expect(sim.act.formed().length).toBeGreaterThanOrEqual(5); // 一群，不是一个
    sim.release();
    sim.leave();
    for (let k = 0; k < 200; k++) sim.step(0.05); // 人走出门
    const t0 = sim.t;
    let tOff = 0;
    for (let k = 0; k < 600; k++) {
      sim.step(0.05);
      if (sim.act.countAtLeast(0.02) === 0) {
        tOff = sim.t - t0;
        break;
      }
    }
    expect(tOff).toBeGreaterThan(0);
    expect(tOff).toBeLessThan(9); // 六秒上下退光（人走出门那一路上还在撒痕迹，故留一点余量）
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
    const u = nearestUnit(L8, -L4.pitchM / 2, -L4.pitchM / 2);
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

describe('unit-activation · 响应两档', () => {
  it('两档登记齐全，默认是锁定（= 原型行为）', () => {
    expect(RESPONSES.map((r) => r.key)).toEqual(['follow', 'ratchet']);
    expect(new Activation(1).mode).toBe('ratchet');
    expect(PLAN.DEMO.threshold).toBeLessThan(PLAN.THRESHOLD); // 台架的演示值更快
    expect(PLAN.RESPONSE.rise).toBeGreaterThan(PLAN.RESPONSE.fall); // 收得快、放得慢
  });

  it('跟随档：读数退，程度跟着退；退的速度有上限（绞盘收放需要时间）', () => {
    const a = new Activation(1, 10, 'follow');
    a.update(Float64Array.from([12]), 5); // 读数超阈值 ⇒ 涨满
    expect(a.degree[0]).toBe(1);
    a.update(Float64Array.from([0]), 0.5); // 读数归零，半秒只退 fall×0.5
    expect(a.degree[0]).toBeCloseTo(1 - PLAN.RESPONSE.fall * 0.5, 9);
    for (let k = 0; k < 40; k++) a.update(Float64Array.from([0]), 0.1);
    expect(a.degree[0]).toBe(0); // 几秒后收回去
    expect(a.formed()).toEqual([]);
  });

  it('跟随档：涨也有上限——读数一步到满，程度也要花 1/rise 秒才下来', () => {
    const a = new Activation(1, 10, 'follow');
    a.update(Float64Array.from([50]), 0.25);
    expect(a.degree[0]).toBeCloseTo(PLAN.RESPONSE.rise * 0.25, 9);
    expect(a.degree[0]).toBeLessThan(1);
  });

  it('跟随档跑一遍：人走了单元收回去，锁定档同一遍留着——这是同一套痕迹的两种读法', () => {
    const opts = { path: 'dwell' as const, threshold: PLAN.DEMO.threshold, fade: PLAN.DEMO.fade };
    /** 跑完整条驻留路线，记下过程中的成形峰值与人离场 30 s 后的剩余 */
    const run = (mode: 'follow' | 'ratchet') => {
      const sim = new PlanSim({ ...opts, mode });
      let peak = 0;
      while (sim.exitedAt === null && sim.t < 200) {
        sim.step(0.05);
        peak = Math.max(peak, sim.act.formed().length);
      }
      sim.step(30);
      return { peak, after: sim.act.formed().length, live: sim.act.countAtLeast(0.02) };
    };
    const follow = run('follow');
    expect(follow.peak).toBeGreaterThanOrEqual(4); // 站着时下来一群（站在交叉点：围着他的四个）
    expect(follow.after).toBe(0); // 人走了收回去
    expect(follow.live).toBe(0);
    const lock = run('ratchet');
    expect(lock.peak).toBeGreaterThanOrEqual(4);
    expect(lock.after).toBe(lock.peak); // 锁定档留着
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
      // 一块地面在圈里待的时间 ≈ 2×1.0 m ÷ 1.2 m/s ≈ 1.7 s；斜穿沿过道走阶梯，每个拐角走进又走出，约两倍
      expect(peak).toBeLessThan(3.5);
      expect(sim.act.formed()).toEqual([]);
      const slow = runScenario({ path, speed: PLAN.SPEED.min }, 0);
      expect(slow.act.maxInput()).toBeLessThan(PLAN.THRESHOLD); // 斜穿的阶梯拐角多，慢走能攒到六成，仍不成形
      expect(slow.act.formed()).toEqual([]);
    }
  });

  it('驻留 20 s：站在过道交叉点，围着他的四个单元成形、外圈半成——一群围着人长出来；离场后痕迹退、成形不退', () => {
    const sim = runScenario({ path: 'dwell' }, 0);
    const c = dwellSpot(L8);
    const ring = L8.units.filter((u) => Math.hypot(u.x - c.x, u.y - c.y) < L8.pitchM).map((u) => u.i).sort((a, b) => a - b);
    expect(ring).toHaveLength(4);
    expect(sim.act.formed()).toEqual(ring);
    const outer = L8.units.filter((u) => {
      const d = Math.hypot(u.x - c.x, u.y - c.y);
      return d > L8.pitchM && d < 1.7 * L8.pitchM;
    });
    expect(outer).toHaveLength(8);
    for (const u of outer) {
      expect(sim.act.degree[u.i]).toBeGreaterThan(0.3);
      expect(sim.act.degree[u.i]).toBeLessThan(1);
    }
    expect(sim.summary().half).toBeGreaterThanOrEqual(8);
    expect(sim.summary().half).toBeLessThanOrEqual(13);
    // 围着他的单元读数 ≈ 解析式（站 20 s，连续版 16.45）+ 走进走出的一点
    for (const u of ring) {
      expect(sim.act.input[u]).toBeGreaterThan(dwellInput(PLAN.DWELL_S) * 0.9);
      expect(sim.act.input[u]).toBeLessThan(dwellInput(PLAN.DWELL_S) + 3);
    }
    // 离场再看 60 s：读数掉到阈值以下，程度仍是 1
    sim.step(60);
    for (const u of ring) expect(sim.act.input[u]).toBeLessThan(PLAN.THRESHOLD / 2);
    expect(sim.act.formed()).toEqual(ring);
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
    const formed = sim.act.formed();
    expect(formed.length).toBeGreaterThanOrEqual(8);
    // 带子从起点交叉点旁边一直铺到终点交叉点旁边（阶梯沿过道走，角上那台不一定整格盖到）
    const route = PATHS.find((p) => p.key === 'diagonal')!.route(L8);
    const a = route[1];
    const b = route[route.length - 2];
    expect(formed.some((i) => Math.hypot(L8.units[i].x - a.x, L8.units[i].y - a.y) < L8.pitchM)).toBe(true);
    expect(formed.some((i) => Math.hypot(L8.units[i].x - b.x, L8.units[i].y - b.y) < L8.pitchM)).toBe(true);
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

describe('unit-activation · 人有朝向、有身体（2026-09-05：视野 / 让位 D / 走廊，默认全关）', () => {
  const D8 = keepOut(L8, PLAN.CLEARANCE.def);
  /** 站到过道交叉点 DWELL_S 秒（不是单元中心——那里是根杆子） */
  function standAtCrossing(opts: ConstructorParameters<typeof PlanSim>[0], leave = false): PlanSim {
    const sim = new PlanSim({ path: 'free', grid: 8, ...opts });
    const c = nearestCrossing(sim.layout, -sim.layout.pitch4 / 2, -sim.layout.pitch4 / 2);
    sim.walker.setRoute([{ x: sim.layout.doors[0].x, y: 0 }, { x: c.x, y: c.y, dwell: PLAN.DWELL_S }, { x: sim.layout.doors[1].x, y: 0, exit: true }]);
    if (leave) while (sim.exitedAt === null && sim.t < 200) sim.step(0.05);
    else {
      while (sim.walker.state !== 'dwell' && sim.t < 60) sim.step(0.05);
      for (let k = 0; k < PLAN.DWELL_S / 0.05 - 1; k++) sim.step(0.05);
    }
    return sim;
  }

  it('三个选项默认全关 ⇒ 与旧路径逐位相同（守门与旧线稿的结论不动）', () => {
    for (const path of ['dwell', 'pace'] as const) {
      const a = runScenario({ path, grid: 8 }, 0).summary();
      const b = runScenario({ path, grid: 8, fov: Math.PI * 2, clearance: null, lane: false }, 0).summary();
      expect(b.degree).toEqual(a.degree);
      expect(b.input).toEqual(a.input);
    }
    const f1 = new TraceField(3);
    const f2 = new TraceField(3);
    f1.imprint(0.3, -0.2, 1.0, 0.7);
    f2.imprintShaped(0.3, -0.2, 1.0, 0.7, 1.1, Math.PI * 2, 0, 0);
    expect(Array.from(f2.data)).toEqual(Array.from(f1.data));
  });

  it('让位距离 D = 平台半径 + 身体 + 让位：8×8 ≈ 0.62、4×4 ≈ 0.89——单元越大人得离它越远', () => {
    expect(D8).toBeCloseTo(L8.platR + PLAN.BODY_R + PLAN.CLEARANCE.def, 12);
    expect(D8).toBeGreaterThan(0.6);
    expect(D8).toBeLessThan(0.65);
    expect(keepOut(L4, PLAN.CLEARANCE.def)).toBeGreaterThan(0.85);
    expect(keepOut(L4, PLAN.CLEARANCE.def)).toBeGreaterThan(D8);
  });

  it('视野 180°：痕迹只落在朝向前方的半圆，身后一格不记；记到的格子约为全圆的一半', () => {
    const full = new TraceField(4);
    const half = new TraceField(4);
    full.imprint(0, 0, 1.0, 1);
    half.imprintShaped(0, 0, 1.0, 1, 0, Math.PI, 0, 0); // 朝 +x
    const count = (f: TraceField) => Array.from(f.data).filter((v) => v > 0).length;
    expect(count(half)).toBeGreaterThan(count(full) * 0.47);
    expect(count(half)).toBeLessThan(count(full) * 0.55);
    for (let i = 0; i < half.data.length; i++) {
      const [x] = half.cellCenter(i);
      if (x < -half.cell) expect(half.data[i]).toBe(0);
    }
    // 人所在的那一格恒收
    expect(half.data[half.indexOf(0, 0)]).toBe(1);
  });

  it('让位：站着时 D 以内的地面不记（走进来时记过的只退不涨）；芯在 D 以内的四个单元闸住、程度恒 0；人走了闸松开', () => {
    const sim = new PlanSim({ path: 'free', grid: 8, fov: Math.PI, clearance: PLAN.CLEARANCE.def, reach: 1.6 });
    const c = nearestCrossing(sim.layout, -sim.layout.pitch4 / 2, -sim.layout.pitch4 / 2);
    sim.walker.setRoute([{ x: sim.layout.doors[0].x, y: 0 }, { x: c.x, y: c.y, dwell: PLAN.DWELL_S }, { x: sim.layout.doors[1].x, y: 0, exit: true }]);
    while (sim.walker.state !== 'dwell' && sim.t < 60) sim.step(0.05);
    const before = Float32Array.from(sim.field.data);
    const degBefore = Float64Array.from(sim.act.degree);
    for (let k = 0; k < PLAN.DWELL_S / 0.05 - 1; k++) sim.step(0.05);
    const w = sim.walker;
    expect(w.state).toBe('dwell');
    let inside = 0;
    for (let i = 0; i < sim.field.data.length; i++) {
      const [x, y] = sim.field.cellCenter(i);
      if (Math.hypot(x - w.x, y - w.y) < D8 - sim.field.cell) {
        expect(sim.field.data[i]).toBeLessThanOrEqual(before[i] + 1e-6); // 站这 20 s 一秒没记
        inside++;
      }
    }
    expect(inside).toBeGreaterThan(50);
    const gated = Array.from(sim.blocked).map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    expect(gated).toHaveLength(4);
    for (const u of gated) {
      expect(Math.hypot(sim.layout.units[u].x - w.x, sim.layout.units[u].y - w.y)).toBeLessThan(D8);
      // 锁定档：闸只挡涨——走进来那几步前方已升起的一点点（棘轮）留着，站这 20 s 一点不涨
      expect(sim.act.degree[u]).toBeLessThanOrEqual(degBefore[u] + 1e-9);
      expect(sim.act.degree[u]).toBeLessThan(0.1);
    }
    // 前方长出一道弧：成形的都在朝向前方、都在 D 之外
    const formed = sim.act.formed();
    expect(formed.length).toBeGreaterThanOrEqual(3);
    for (const u of formed) {
      const dx = sim.layout.units[u].x - w.x;
      const dy = sim.layout.units[u].y - w.y;
      expect(dx * Math.cos(w.heading) + dy * Math.sin(w.heading)).toBeGreaterThan(0);
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(D8);
    }
    const gone = standAtCrossing({ fov: Math.PI, clearance: PLAN.CLEARANCE.def, reach: 1.6 }, true);
    expect(Array.from(gone.blocked).every((v) => v === 0)).toBe(true);
  });

  it('让位 + 跟随档：已经下来的平台，人走到它跟前就收回去（闸把目标当 0）', () => {
    const sim = new PlanSim({ path: 'free', grid: 8, reach: 1.6, fov: Math.PI, clearance: PLAN.CLEARANCE.def, threshold: PLAN.DEMO.threshold, fade: PLAN.DEMO.fade, mode: 'follow' });
    const L = sim.layout;
    const c = nearestCrossing(L, 0, 0);
    sim.walker.place(c.x - 2.0, c.y);
    sim.walker.heading = 0;
    for (let k = 0; k < 6 / 0.05; k++) sim.step(0.05);
    // 正前方 ~1 m 处的单元已经下来了
    const ahead = L.units.filter((u) => Math.abs(u.y - c.y) < L.pitchM * 0.6 && u.x > c.x - 1.4 && u.x < c.x - 0.6);
    expect(ahead.length).toBeGreaterThan(0);
    const u0 = ahead[0].i;
    expect(sim.act.degree[u0]).toBeGreaterThan(0.9);
    // 人走到它跟前（芯到人 < D）
    sim.walker.place(L.units[u0].x - D8 * 0.5, L.units[u0].y);
    sim.walker.heading = 0;
    for (let k = 0; k < 3 / 0.05; k++) sim.step(0.05);
    expect(sim.blocked[u0]).toBe(1);
    expect(sim.act.degree[u0]).toBe(0);
  });

  it('走廊：沿中线穿行时正前方 |侧向| < D 的一条道不落痕迹，两侧照记；不开走廊时道上有痕迹', () => {
    const lane = runScenario({ path: 'through', grid: 8, reach: 1.6, fov: Math.PI, clearance: PLAN.CLEARANCE.def, lane: true }, 0);
    const noLane = runScenario({ path: 'through', grid: 8, reach: 1.6, fov: Math.PI, clearance: PLAN.CLEARANCE.def, lane: false }, 0);
    let onLane = 0;
    let beside = 0;
    let onLaneNo = 0;
    for (let i = 0; i < lane.field.data.length; i++) {
      const [x, y] = lane.field.cellCenter(i);
      if (Math.abs(x) > lane.layout.fieldM / 2 - 0.3) continue; // 两端门口不算
      if (Math.abs(y) < D8 - lane.field.cell) {
        expect(lane.field.data[i]).toBe(0);
        onLane++;
        if (noLane.field.data[i] > 0) onLaneNo++;
      } else if (Math.abs(y) > D8 + 0.1 && Math.abs(y) < 1.2 && lane.field.data[i] > 0) beside++;
    }
    expect(onLane).toBeGreaterThan(100);
    expect(onLaneNo).toBeGreaterThan(onLane * 0.8); // 不开走廊：这条道本来是记的（人过去之后身后补记不到——视野开着——但来路上记到）
    expect(beside).toBeGreaterThan(100);
  });

  it('闸是按人算的：几个人各自闸自己 D 以内的单元；不在场的人不算', () => {
    const c = nearestCrossing(L8, 0, 0);
    const a = { x: c.x, y: c.y, present: true };
    const far = { x: c.x + 3 * L8.pitchM, y: c.y, present: true };
    const gone = { x: c.x + 1.5 * L8.pitchM, y: c.y, present: false };
    expect(Array.from(blockedUnits(L8, [a], PLAN.CLEARANCE.def)).filter(Boolean)).toHaveLength(4);
    expect(Array.from(blockedUnits(L8, [a, far], PLAN.CLEARANCE.def)).filter(Boolean)).toHaveLength(8);
    expect(Array.from(blockedUnits(L8, [a, gone], PLAN.CLEARANCE.def)).filter(Boolean)).toHaveLength(4);
    expect(Array.from(blockedUnits(L8, [a], null)).filter(Boolean)).toHaveLength(0);
  });

  it('体检：单元中心身体里有一根杆子（09-05 之前的驻留点）；过道交叉点身体里没有', () => {
    for (const L of [L4, planLayout(6), L8]) {
      const u = nearestUnit(L, -L.pitch4 / 2, -L.pitch4 / 2);
      expect(unitsUnderBody(L, u.x, u.y)).toHaveLength(1);
      const c = nearestCrossing(L, -L.pitch4 / 2, -L.pitch4 / 2);
      expect(aisleLines(L).x.some((x) => Math.abs(x - c.x) < 1e-9)).toBe(true);
      expect(aisleLines(L).y.some((y) => Math.abs(y - c.y) < 1e-9)).toBe(true);
      expect(unitsUnderBody(L, c.x, c.y)).toHaveLength(0);
    }
  });
});

describe('unit-activation · 视线 ≠ 朝向（2026-09-05 第二轮：站着时转头，默认关）', () => {
  const opts = { path: 'dwell' as const, grid: 8, fov: Math.PI, clearance: PLAN.CLEARANCE.def, lane: true, reach: 1.6 };

  it('默认关 ⇒ 视线恒 = 朝向，与不带 look 的一遍逐位相同', () => {
    const a = runScenario(opts, 0);
    const b = runScenario({ ...opts, look: false }, 0);
    expect(Array.from(b.act.input)).toEqual(Array.from(a.act.input));
    const sim = new PlanSim(opts);
    for (let k = 0; k < 600; k++) {
      sim.step(0.05);
      if (sim.walker.present) expect(Math.abs(wrapAngle(sim.walker.gaze - sim.walker.heading))).toBeLessThan(1e-9);
    }
  });

  it('开着：走着时看向前方；站着时视线离开朝向、两边都看过、不超过 ±SPAN、转头不超速', () => {
    const sim = new PlanSim({ ...opts, look: true });
    let prev = sim.walker.gaze;
    let minOff = 0;
    let maxOff = 0;
    while (sim.walker.state !== 'dwell' && sim.t < 60) {
      sim.step(0.05);
      // 走着：视线与朝向之差只会在转弯那一瞬出现，且以 TURN 速率收回
      expect(Math.abs(wrapAngle(sim.walker.gaze - prev))).toBeLessThanOrEqual(GAZE.TURN * 0.05 + 1e-9);
      prev = sim.walker.gaze;
    }
    for (let k = 0; k < PLAN.DWELL_S / 0.05 - 1; k++) {
      sim.step(0.05);
      const off = wrapAngle(sim.walker.gaze - sim.walker.heading);
      expect(Math.abs(off)).toBeLessThanOrEqual(GAZE.SPAN + 1e-9);
      expect(Math.abs(wrapAngle(sim.walker.gaze - prev))).toBeLessThanOrEqual(GAZE.TURN * 0.05 + 1e-9);
      prev = sim.walker.gaze;
      minOff = Math.min(minOff, off);
      maxOff = Math.max(maxOff, off);
    }
    expect(minOff).toBeLessThan(-0.5);
    expect(maxOff).toBeGreaterThan(0.5);
  });

  it('久站的弧散开：转头后痕迹落到了钉死朝向时半圆之外的地面上；同种子逐位复现、换种子不同', () => {
    const fixed = runScenario(opts, 0);
    const look = runScenario({ ...opts, look: true }, 0);
    const c = dwellSpot(L8);
    // 站着时的身体朝向 = 进门走向（门 → 站点）
    const h0 = Math.atan2(c.y - 0, c.x - L8.doors[0].x);
    // 身侧偏后（离朝向 100°–140°、离人 0.7–1.5 m）：钉死朝向那一遍的半圆到 90° 为止，这片地只有走进来时
    // 留的一两秒；转头那一遍（视线最远偏到 ±110°，扇面边缘到 200°）有站着看过去攒下的好几秒
    let behindFixed = 0;
    let behindLook = 0;
    for (let i = 0; i < fixed.field.data.length; i++) {
      const [x, y] = fixed.field.cellCenter(i);
      const fwd = (x - c.x) * Math.cos(h0) + (y - c.y) * Math.sin(h0);
      const lat = -(x - c.x) * Math.sin(h0) + (y - c.y) * Math.cos(h0);
      const d = Math.hypot(fwd, lat);
      const ang = (Math.abs(Math.atan2(lat, fwd)) * 180) / Math.PI;
      if (d > 0.7 && d < 1.5 && ang > 100 && ang < 140) {
        if (fixed.field.data[i] > 3) behindFixed++;
        if (look.field.data[i] > 3) behindLook++;
      }
    }
    expect(behindFixed).toBe(0);
    expect(behindLook).toBeGreaterThan(20);
    const again = runScenario({ ...opts, look: true }, 0);
    expect(Array.from(again.act.input)).toEqual(Array.from(look.act.input));
    const other = runScenario({ ...opts, look: true, seed: 7 }, 0);
    expect(Array.from(other.act.input)).not.toEqual(Array.from(look.act.input));
  });

  it('重播逐位复现：reset 后同一条转头序列', () => {
    const sim = new PlanSim({ ...opts, look: true });
    const run = () => {
      const g: number[] = [];
      for (let k = 0; k < 800; k++) {
        sim.step(0.05);
        g.push(sim.walker.gaze);
      }
      return g;
    };
    const a = run();
    sim.reset();
    const b = run();
    expect(b).toEqual(a);
  });
});

describe('unit-activation · 成形占比（2026-09-05 用户「触发单元的边界定得有点严格，这一圈里只有两个」）', () => {
  const demo = { path: 'dwell' as const, grid: 8, ...PLAN.ATTENTION, threshold: PLAN.DEMO.threshold, fade: PLAN.DEMO.fade, mode: 'follow' as const };
  /** 站着转头 20 s 里成形数的平均值 */
  const avgFormed = (fill: number) => {
    const sim = new PlanSim({ ...demo, fill });
    while (sim.walker.state !== 'dwell' && sim.t < 60) sim.step(0.05);
    let sum = 0;
    let n = 0;
    for (let k = 0; k < PLAN.DWELL_S / 0.05; k++) {
      sim.step(0.05);
      sum += sim.act.formed().length;
      n++;
    }
    return sum / n;
  };

  it('默认 1 = 旧口径逐位；程度 = 读数 / (阈值 × 占比)', () => {
    const a = runScenario({ path: 'dwell', grid: 8 }, 0);
    const b = runScenario({ path: 'dwell', grid: 8, fill: 1 }, 0);
    expect(Array.from(b.act.degree)).toEqual(Array.from(a.act.degree));
    const act = new Activation(2, 10, 'ratchet', 0.5);
    act.update(Float64Array.from([5, 2.5]));
    expect(act.degree[0]).toBeCloseTo(1, 12);
    expect(act.degree[1]).toBeCloseTo(0.5, 12);
  });

  it('占比一半：脚下一半地面读满就成形——扇面边上盖住一半的单元也下来；演示口径下站着的成形数从 ~2 涨到 ~6', () => {
    // 一半的格子读满、一半为零 ⇒ 均值 = 阈值/2 ⇒ 占比 0.5 刚好成形、占比 1 只到一半
    const L = planLayout(8);
    const f = new TraceField(L.roomM, PLAN.CELL, 2);
    const c = buildCatchment(L, f, 'nearest');
    const u = L.units[27];
    const cells = c.cellsOf[u.i];
    for (let k = 0; k < Math.floor(cells.length / 2); k++) f.data[cells[k]] = 2; // 恰好一半的格子读满
    const half = new Activation(L.units.length, 2, 'ratchet', 0.5);
    const full = new Activation(L.units.length, 2, 'ratchet', 1);
    half.update(unitInputs(f, c));
    full.update(unitInputs(f, c));
    expect(half.degree[u.i]).toBeGreaterThan(0.95);
    expect(full.degree[u.i]).toBeLessThan(0.55);
    const strict = avgFormed(1);
    const loose = avgFormed(PLAN.FILL.def);
    expect(strict).toBeLessThan(3.5);
    expect(loose).toBeGreaterThan(5);
    expect(loose).toBeLessThan(8);
  });
});
