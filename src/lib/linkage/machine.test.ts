import { describe, expect, it } from 'vitest';
import { MACHINE_DRIVE, MACHINE_GROUPS, MACHINE_TRIS } from './machine-shape';
import {
  MACHINE_OMEGA,
  MACHINE_SWEEP,
  MACHINE_THETA0,
  MACHINE_THETA_MAX,
  MACHINE_THETA_MIN,
  apexHeight,
  clampTheta,
  createMachine,
  machineFrame,
  machineFrames,
  machineMaxError,
  groupRing,
  partKind,
  reciprocate,
  rodLengthDrift,
  runMachine,
  stepMachine,
  strokeOf,
  thetaAtStroke,
  visibleGroups,
} from './machine';
import { SHELL_RINGS, SHELL_STEP_DT } from './shell3d';

// 单位 = mm（环局部）。世界系 x = 站位 + 出平面 w，y = u，z = v。

const STEP = (Math.PI * 2) / 720; // 0.5°/步——与 shell3d 标定扫掠同量级

describe('整机装配（图纸姿态）', () => {
  it('五环就位、无 roll、θ₀ = 上死点', () => {
    const m = createMachine();
    expect(m.rings).toHaveLength(5);
    expect(m.theta).toBe(MACHINE_THETA0);
    expect(MACHINE_THETA0).toBeCloseTo(Math.PI / 2, 12);
    expect(m.rings.map((r) => r.data.rollDeg)).toEqual([0, 0, 0, 0, 0]);
  });

  it('形体表与环表对得上（站位/曲柄半径 逐环一致）', () => {
    expect(MACHINE_DRIVE).toHaveLength(5);
    MACHINE_DRIVE.forEach((d, i) => {
      expect(d.ring).toBe(SHELL_RINGS[i].name);
      expect(d.station).toBe(SHELL_RINGS[i].station);
      expect(d.crankR).toBeCloseTo(SHELL_RINGS[i].crankR, 3);
    });
  });

  it('每块板、每根杆、每个轮都有形体，且组名指得到真实索引', () => {
    const m = createMachine();
    const plates = MACHINE_GROUPS.filter((g) => g.name[0] === 'p');
    // 66 = 14+14+10+14+14，与五环三角板总数相等
    expect(plates).toHaveLength(SHELL_RINGS.reduce((n, d) => n + d.tris.length, 0));
    for (const g of MACHINE_GROUPS) {
      const kind = g.name[0];
      if (!'pxwr'.includes(kind)) continue;
      const ri = Number(g.name[1]);
      expect(ri).toBeGreaterThanOrEqual(0);
      expect(ri).toBeLessThan(5);
      const ring = m.rings[ri];
      if (kind === 'p') expect(ring.data.tris[Number(g.name.split('_')[1])]).toBeDefined();
      if (kind === 'x') expect(ring.solver.nodes[Number(g.name.split('_')[1])]).toBeDefined();
    }
    expect(MACHINE_GROUPS.filter((g) => g.name[0] === 'w')).toHaveLength(5);
    expect(MACHINE_GROUPS.filter((g) => g.name[0] === 'r')).toHaveLength(5);
    expect(MACHINE_TRIS).toBe(MACHINE_GROUPS.reduce((n, g) => n + g.tris, 0));
  });
});

describe('传动链（一根轴 → 五个曲柄）', () => {
  it('图纸姿态 = 全开：各环拱顶恰在 apex0', () => {
    const m = createMachine();
    MACHINE_DRIVE.forEach((d, i) => {
      expect(apexHeight(m, i)).toBeCloseTo(d.apex0, 2);
    });
  });

  it('180° 半程走完整个行程 = 2·曲柄半径（≤0.05mm），上端 = 图纸姿态', () => {
    // 中间轴只在 180° 内往复（用户 2026-07-29 指出真机如此），两端恰是曲柄滑块
    // 的上下死点，所以半程正好是全行程 2R——一步不多一步不少。
    // spec §3.3：不变量是**行程长度**，不是端点绝对值——图纸的连杆接在导轨
    // 滑块点、shell3d 的杆接在拱顶销，两者差 0.859mm，各自自洽。
    const m = createMachine();
    const lo = MACHINE_DRIVE.map((_, i) => apexHeight(m, i));
    const hi = [...lo];
    for (let k = 0; k < 360; k++) {
      stepMachine(m, STEP);
      MACHINE_DRIVE.forEach((_, i) => {
        const y = apexHeight(m, i);
        if (y < lo[i]) lo[i] = y;
        if (y > hi[i]) hi[i] = y;
      });
    }
    expect(m.theta).toBeCloseTo(MACHINE_THETA_MAX, 9);
    MACHINE_DRIVE.forEach((d, i) => {
      expect(hi[i] - lo[i]).toBeCloseTo(2 * d.crankR, 1);
      expect(hi[i]).toBeCloseTo(d.apex0, 1);
    });
  });

  it('连杆长度全程不漂（曲柄销↔拱顶 ≤0.05mm），残差受控——往复一整轮', () => {
    const m = createMachine();
    let worstDrift = 0;
    let worstErr = 0;
    let dir: 1 | -1 = 1;
    // 开 → 合 → 开，含两次端点折返
    for (let k = 0; k < 740; k++) {
      dir = runMachine(m, dir, STEP);
      worstDrift = Math.max(worstDrift, rodLengthDrift(m));
      worstErr = Math.max(worstErr, machineMaxError(m));
    }
    expect(worstDrift).toBeLessThan(0.05);
    expect(worstErr).toBeLessThan(1.2);
  });

  it('五环同相：任意时刻 θ 只有一个，各环由自身半径决定行程', () => {
    const m = createMachine();
    for (let k = 0; k < 90; k++) stepMachine(m, STEP);
    expect(m.theta).toBeCloseTo(MACHINE_THETA0 + 90 * STEP, 12);
    // 半径大的环下沉多——同一 θ 下降幅之比 ≈ 半径之比
    const drop = MACHINE_DRIVE.map((d, i) => d.apex0 - apexHeight(m, i));
    const ratio = drop.map((v, i) => v / MACHINE_DRIVE[i].crankR);
    for (const x of ratio) expect(x).toBeCloseTo(ratio[0], 1);
  });
});

describe('位姿（网格绑定）', () => {
  it('板标架：局部原点落在该板首销上，且标架正交单位', () => {
    const m = createMachine();
    for (let k = 0; k < 37; k++) stepMachine(m, STEP);
    for (const g of MACHINE_GROUPS.filter((x) => x.name[0] === 'p')) {
      const ri = Number(g.name[1]);
      const tri = m.rings[ri].data.tris[Number(g.name.split('_')[1])];
      const A = m.rings[ri].solver.nodes[tri[0]];
      const f = machineFrame(g, m);
      expect(f.o.y).toBeCloseTo(A.x, 9);
      expect(f.o.z).toBeCloseTo(A.y, 9);
      // 列向量单位且两两正交
      const cols = [
        [f.ux, f.uy, f.uz],
        [f.ex, f.ey, f.ez],
        [f.fx, f.fy, f.fz],
      ];
      for (const c of cols) expect(Math.hypot(c[0], c[1], c[2])).toBeCloseTo(1, 9);
      for (let a = 0; a < 3; a++) {
        for (let b = a + 1; b < 3; b++) {
          const dot = cols[a][0] * cols[b][0] + cols[a][1] * cols[b][1] + cols[a][2] * cols[b][2];
          expect(dot).toBeCloseTo(0, 9);
        }
      }
    }
  });

  it('板标架第一列 = 首销指向次销的单位向量（世界 y-z 面内）', () => {
    const m = createMachine();
    for (let k = 0; k < 200; k++) stepMachine(m, STEP);
    const g = MACHINE_GROUPS.find((x) => x.name.startsWith('p3_')) as (typeof MACHINE_GROUPS)[number];
    const ri = Number(g.name[1]);
    const tri = m.rings[ri].data.tris[Number(g.name.split('_')[1])];
    const A = m.rings[ri].solver.nodes[tri[0]];
    const B = m.rings[ri].solver.nodes[tri[1]];
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    const f = machineFrame(g, m);
    expect(f.ux).toBe(0);
    expect(f.uy).toBeCloseTo((B.x - A.x) / L, 9);
    expect(f.uz).toBeCloseTo((B.y - A.y) / L, 9);
  });

  it('配件只平移不转（标架恒等，原点跟销）', () => {
    const m = createMachine();
    for (let k = 0; k < 55; k++) stepMachine(m, STEP);
    const aux = MACHINE_GROUPS.filter((g) => g.name[0] === 'x');
    expect(aux.length).toBeGreaterThan(0);
    for (const g of aux) {
      const ri = Number(g.name[1]);
      const n = m.rings[ri].solver.nodes[Number(g.name.split('_')[1])];
      const f = machineFrame(g, m);
      expect(f.o.y).toBeCloseTo(n.x, 9);
      expect(f.o.z).toBeCloseTo(n.y, 9);
      expect([f.ux, f.uy, f.uz]).toEqual([0, 1, 0]);
      expect([f.ex, f.ey, f.ez]).toEqual([0, 0, 1]);
    }
  });

  it('单杆轮绕轮心转 θ−θ₀（原点恒在站位上，与环无关）', () => {
    const m = createMachine();
    const dth = 137 * STEP;
    for (let k = 0; k < 137; k++) stepMachine(m, STEP);
    for (const g of MACHINE_GROUPS.filter((x) => x.name[0] === 'w')) {
      const ri = Number(g.name[1]);
      const f = machineFrame(g, m);
      expect(f.o).toEqual({ x: m.rings[ri].data.station, y: 0, z: 0 });
      expect(f.uy).toBeCloseTo(Math.cos(dth), 9);
      expect(f.uz).toBeCloseTo(Math.sin(dth), 9);
    }
  });

  it('静件恒等不动（机架、中间轴、触手）', () => {
    const m = createMachine();
    const before = machineFrames(m).filter((f) => !'pxwr'.includes(f.name[0]));
    // shaft 与 frame 分开成组：控制面板的「传动」开关要能连中间轴一起切
    expect(before.map((f) => f.name).sort()).toEqual(['frame', 'shaft', 'tentacle']);
    for (let k = 0; k < 40; k++) stepMachine(m, STEP);
    for (const { frame } of machineFrames(m).filter((f) => !'pxwr'.includes(f.name[0]))) {
      expect(frame.o).toEqual({ x: 0, y: 0, z: 0 });
      expect([frame.ux, frame.ey, frame.fz]).toEqual([1, 1, 1]);
    }
  });

  it('每组都拿得到位姿，数量与形体表一致', () => {
    const m = createMachine();
    expect(machineFrames(m)).toHaveLength(MACHINE_GROUPS.length);
  });
});

describe('180° 往复（中间轴不整周转，用户 2026-07-29 指出）', () => {
  it('区间两端 = 曲柄滑块上下死点：θ₀ 全开、θ₀+π 全折叠', () => {
    expect(MACHINE_SWEEP).toBeCloseTo(Math.PI, 12);
    expect(MACHINE_THETA_MIN).toBe(MACHINE_THETA0);
    expect(MACHINE_THETA_MAX).toBeCloseTo(MACHINE_THETA0 + Math.PI, 12);
    const m = createMachine();
    const open = MACHINE_DRIVE.map((_, i) => apexHeight(m, i));
    for (let k = 0; k < 360; k++) stepMachine(m, STEP);
    MACHINE_DRIVE.forEach((d, i) => {
      // 全折叠位 = 全开位 − 2R
      expect(apexHeight(m, i)).toBeCloseTo(open[i] - 2 * d.crankR, 1);
    });
  });

  it('撞到端点折返而不是钳住不动', () => {
    // 从上端往外走一步 → 方向翻转、角度折回区间内
    const a = reciprocate(MACHINE_THETA_MAX - 0.01, 1, 0.03);
    expect(a.dir).toBe(-1);
    expect(a.theta).toBeLessThan(MACHINE_THETA_MAX);
    expect(a.theta).toBeCloseTo(MACHINE_THETA_MAX - 0.02, 9);
    // 下端同理
    const b = reciprocate(MACHINE_THETA_MIN + 0.01, -1, 0.03);
    expect(b.dir).toBe(1);
    expect(b.theta).toBeCloseTo(MACHINE_THETA_MIN + 0.02, 9);
    // 区间内不改方向
    const c = reciprocate(MACHINE_THETA0 + 1, 1, 0.05);
    expect(c.dir).toBe(1);
    expect(c.theta).toBeCloseTo(MACHINE_THETA0 + 1.05, 9);
  });

  it('θ 永不越界，且往复一整轮后回到起点附近', () => {
    const m = createMachine();
    let dir: 1 | -1 = 1;
    const steps = Math.round((2 * MACHINE_SWEEP) / STEP);
    for (let k = 0; k < steps; k++) {
      dir = runMachine(m, dir, STEP);
      expect(m.theta).toBeGreaterThanOrEqual(MACHINE_THETA_MIN - 1e-9);
      expect(m.theta).toBeLessThanOrEqual(MACHINE_THETA_MAX + 1e-9);
    }
    expect(m.theta).toBeCloseTo(MACHINE_THETA_MIN, 6);
    // 不断言此刻的方向符号：恰好落在端点时是否触发反射取决于末位误差，
    // 两个取值都合法，断它等于在测浮点噪声。要紧的是**不卡死**——
    // 再走几步必须重新离开端点。
    const before = m.theta;
    for (let k = 0; k < 20; k++) dir = runMachine(m, dir, STEP);
    expect(Math.abs(m.theta - before)).toBeGreaterThan(10 * STEP);
  });

  it('行程参数 u：0 = 全开、1 = 全折叠，与 θ 一一对应', () => {
    expect(strokeOf(MACHINE_THETA_MIN)).toBeCloseTo(0, 12);
    expect(strokeOf(MACHINE_THETA_MAX)).toBeCloseTo(1, 12);
    expect(thetaAtStroke(0)).toBe(MACHINE_THETA_MIN);
    expect(thetaAtStroke(1)).toBeCloseTo(MACHINE_THETA_MAX, 12);
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      expect(strokeOf(thetaAtStroke(u))).toBeCloseTo(u, 12);
    }
    // 越界一律钳住（滑杆不会送进区间外的值，但接口不该被越界值带飞）
    expect(strokeOf(MACHINE_THETA_MAX + 5)).toBe(1);
    expect(strokeOf(MACHINE_THETA_MIN - 5)).toBe(0);
    expect(clampTheta(MACHINE_THETA_MAX + 5)).toBe(MACHINE_THETA_MAX);
  });

  it('默认转速给出接近呼吸的节律（半程 3–5 秒）', () => {
    const halfStrokeSec = MACHINE_SWEEP / MACHINE_OMEGA;
    expect(halfStrokeSec).toBeGreaterThan(3);
    expect(halfStrokeSec).toBeLessThan(5);
  });
});

describe('部件分类（控制面板用）', () => {
  it('四档各自认领，且不重不漏——每组恰好归一档', () => {
    const seen = new Map<string, number>();
    for (const g of MACHINE_GROUPS) {
      const k = partKind(g.name);
      expect(['rings', 'drive', 'frame', 'tentacle']).toContain(k);
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect([...seen.values()].reduce((a, b) => a + b, 0)).toBe(MACHINE_GROUPS.length);
    // 环身 = 66 板 + 3 配件；传动 = 5 轮 + 5 杆 + 中间轴
    expect(seen.get('rings')).toBe(69);
    expect(seen.get('drive')).toBe(11);
    expect(seen.get('frame')).toBe(1);
    expect(seen.get('tentacle')).toBe(1);
  });

  it('中间轴归「传动」而不是「机架」（否则传动开关切不动它）', () => {
    expect(MACHINE_GROUPS.some((g) => g.name === 'shaft')).toBe(true);
    expect(partKind('shaft')).toBe('drive');
    expect(partKind('frame')).toBe('frame');
  });

  it('环归属：动件报 0..4，静件报 null', () => {
    expect(groupRing('p3_7')).toBe(3);
    expect(groupRing('x0_13')).toBe(0);
    expect(groupRing('w4')).toBe(4);
    expect(groupRing('r2')).toBe(2);
    expect(groupRing('frame')).toBeNull();
    expect(groupRing('shaft')).toBeNull();
    expect(groupRing('tentacle')).toBeNull();
    for (const g of MACHINE_GROUPS) {
      const ri = groupRing(g.name);
      if (ri !== null) expect(ri).toBeLessThan(5);
    }
  });

  it('全开时即全部组；关掉一档就少掉那一档的全部', () => {
    const all = { rings: true, drive: true, frame: true, tentacle: true } as const;
    expect(visibleGroups(all, null)).toHaveLength(MACHINE_GROUPS.length);
    const noTent = visibleGroups({ ...all, tentacle: false }, null);
    expect(noTent.some((g) => g.name === 'tentacle')).toBe(false);
    expect(noTent).toHaveLength(MACHINE_GROUPS.length - 1);
    expect(visibleGroups({ rings: false, drive: false, frame: false, tentacle: false }, null)).toHaveLength(0);
  });

  it('单环隔离只筛环件，机架/轴/触手不跟着消失', () => {
    const all = { rings: true, drive: true, frame: true, tentacle: true } as const;
    const only2 = visibleGroups(all, 2);
    for (const g of only2) {
      const ri = groupRing(g.name);
      if (ri !== null) expect(ri).toBe(2);
    }
    // 静件仍在（否则「只看 S3」会连驱动它的轴一起切掉）
    expect(only2.some((g) => g.name === 'frame')).toBe(true);
    expect(only2.some((g) => g.name === 'shaft')).toBe(true);
    expect(only2.some((g) => g.name === 'tentacle')).toBe(true);
    // 五环各自隔离之和 = 全部环件
    const perRing = [0, 1, 2, 3, 4].reduce(
      (n, i) => n + visibleGroups({ ...all, drive: false, frame: false, tentacle: false }, i).length,
      0,
    );
    expect(perRing).toBe(visibleGroups({ ...all, drive: false, frame: false, tentacle: false }, null).length);
  });
});

describe('定步一致性', () => {
  it('同样步数不论怎么分批，末态逐位相同（跨设备一致的前提）', () => {
    const a = createMachine();
    for (let k = 0; k < 120; k++) stepMachine(a, STEP);
    const b = createMachine();
    for (let k = 0; k < 40; k++) stepMachine(b, STEP);
    for (let k = 0; k < 80; k++) stepMachine(b, STEP);
    expect(b.theta).toBe(a.theta);
    a.rings.forEach((r, i) => {
      r.solver.nodes.forEach((n, j) => {
        expect(b.rings[i].solver.nodes[j].x).toBe(n.x);
        expect(b.rings[i].solver.nodes[j].y).toBe(n.y);
      });
    });
  });

  it('沿用 shell3d 的 1/120 定步（不另立步长）', () => {
    expect(SHELL_STEP_DT).toBe(1 / 120);
  });
});
