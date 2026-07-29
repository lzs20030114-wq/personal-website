import { describe, expect, it } from 'vitest';
import { MACHINE_DRIVE, MACHINE_GROUPS, MACHINE_TRIS } from './machine-shape';
import {
  MACHINE_THETA0,
  apexHeight,
  createMachine,
  machineFrame,
  machineFrames,
  machineMaxError,
  rodLengthDrift,
  stepMachine,
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

  it('整周行程 = 2·曲柄半径（≤0.05mm），上端 = 图纸姿态', () => {
    // spec §3.3：不变量是**行程长度**，不是端点绝对值——图纸的连杆接在导轨
    // 滑块点、shell3d 的杆接在拱顶销，两者差 0.859mm，各自自洽。
    const m = createMachine();
    const lo = MACHINE_DRIVE.map((_, i) => apexHeight(m, i));
    const hi = [...lo];
    for (let k = 0; k < 720; k++) {
      stepMachine(m, STEP);
      MACHINE_DRIVE.forEach((_, i) => {
        const y = apexHeight(m, i);
        if (y < lo[i]) lo[i] = y;
        if (y > hi[i]) hi[i] = y;
      });
    }
    MACHINE_DRIVE.forEach((d, i) => {
      expect(hi[i] - lo[i]).toBeCloseTo(2 * d.crankR, 1);
      expect(hi[i]).toBeCloseTo(d.apex0, 1);
    });
  });

  it('连杆长度全程不漂（曲柄销↔拱顶 ≤0.05mm），残差受控', () => {
    const m = createMachine();
    let worstDrift = 0;
    let worstErr = 0;
    for (let k = 0; k < 720; k++) {
      stepMachine(m, STEP);
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

  it('静件恒等不动（机架、触手）', () => {
    const m = createMachine();
    const before = machineFrames(m).filter((f) => !'pxwr'.includes(f.name[0]));
    expect(before.map((f) => f.name).sort()).toEqual(['frame', 'tentacle']);
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
