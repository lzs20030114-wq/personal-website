import { describe, expect, it } from 'vitest';
import { MACHINE_DRIVE, MACHINE_GROUPS, MACHINE_TRIS } from './machine-shape';
import {
  MACHINE_DIR,
  MACHINE_OMEGA,
  MACHINE_SWEEP,
  MACHINE_THETA0,
  MACHINE_THETA_MAX,
  MACHINE_THETA_MIN,
  apexHeight,
  clampTheta,
  createMachine,
  isFolding,
  machineFrame,
  machineFrames,
  machineMaxError,
  groupRing,
  partKind,
  phaseDeg,
  reciprocate,
  rodLengthDrift,
  runMachine,
  stepMachine,
  strokeOf,
  thetaAtStroke,
  visibleGroups,
  isSmallArmGroup,
} from './machine';
import { SHELL_RINGS, SHELL_STEP_DT } from './shell3d';

// 单位 = mm（环局部）。世界系 x = 站位 + 出平面 w，y = u，z = v。

const STEP = (Math.PI * 2) / 720; // 0.5°/步——与 shell3d 标定扫掠同量级
/** 沿设计摆向的一步（MACHINE_DIR = 摆向，用户 2026-07-29 指定经另一侧） */
const DSTEP = MACHINE_DIR * STEP;

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
      stepMachine(m, DSTEP);
      MACHINE_DRIVE.forEach((_, i) => {
        const y = apexHeight(m, i);
        if (y < lo[i]) lo[i] = y;
        if (y > hi[i]) hi[i] = y;
      });
    }
    expect(strokeOf(m.theta)).toBeCloseTo(1, 6); // 走满半程 = 折叠位
    MACHINE_DRIVE.forEach((d, i) => {
      expect(hi[i] - lo[i]).toBeCloseTo(2 * d.crankR, 1);
      expect(hi[i]).toBeCloseTo(d.apex0, 1);
    });
  });

  it('连杆长度全程不漂（曲柄销↔拱顶 ≤0.05mm），残差受控——往复一整轮', () => {
    const m = createMachine();
    let worstDrift = 0;
    let worstErr = 0;
    let dir: 1 | -1 = MACHINE_DIR;
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
    for (let k = 0; k < 90; k++) stepMachine(m, DSTEP);
    expect(m.theta).toBeCloseTo(MACHINE_THETA0 + 90 * DSTEP, 12);
    // 半径大的环下沉多——同一 θ 下降幅之比 ≈ 半径之比
    const drop = MACHINE_DRIVE.map((d, i) => d.apex0 - apexHeight(m, i));
    const ratio = drop.map((v, i) => v / MACHINE_DRIVE[i].crankR);
    for (const x of ratio) expect(x).toBeCloseTo(ratio[0], 1);
  });
});

describe('位姿（网格绑定）', () => {
  it('板标架：局部原点落在该板首销上，且标架正交单位', () => {
    const m = createMachine();
    for (let k = 0; k < 37; k++) stepMachine(m, DSTEP);
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
    for (let k = 0; k < 200; k++) stepMachine(m, DSTEP);
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
    for (let k = 0; k < 55; k++) stepMachine(m, DSTEP);
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
    const dth = 137 * DSTEP;
    for (let k = 0; k < 137; k++) stepMachine(m, DSTEP);
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
    // sa_* 不在此列：小触手 2026-07-30 起是活件，位姿由 machine-smallarm 逐帧解
    const before = machineFrames(m).filter(
      (f) => !'pxwr'.includes(f.name[0]) && !isSmallArmGroup(f.name),
    );
    // shaft 与 frame 分开成组：控制面板的「传动」开关要能连中间轴一起切
    expect(before.map((f) => f.name).sort()).toEqual(['frame', 'shaft']);
    for (let k = 0; k < 40; k++) stepMachine(m, DSTEP);
    for (const { frame } of machineFrames(m).filter(
      (f) => !'pxwr'.includes(f.name[0]) && !isSmallArmGroup(f.name),
    )) {
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
  it('区间跨度恰 180°，一端是伸展死点（θ₀）另一端是折叠死点', () => {
    expect(MACHINE_SWEEP).toBeCloseTo(Math.PI, 12);
    expect(MACHINE_THETA_MAX - MACHINE_THETA_MIN).toBeCloseTo(Math.PI, 12);
    // θ₀（伸展位）必是区间的某一端，不在中间
    const atEnd =
      Math.abs(MACHINE_THETA0 - MACHINE_THETA_MIN) < 1e-12 ||
      Math.abs(MACHINE_THETA0 - MACHINE_THETA_MAX) < 1e-12;
    expect(atEnd).toBe(true);
  });

  it('撞到端点折返而不是钳住不动', () => {
    // 从区间上端往外走一步 → 方向翻转、角度折回区间内
    const a = reciprocate(MACHINE_THETA_MAX - 0.01, 1, 0.03);
    expect(a.dir).toBe(-1);
    expect(a.theta).toBeLessThan(MACHINE_THETA_MAX);
    expect(a.theta).toBeCloseTo(MACHINE_THETA_MAX - 0.02, 9);
    // 下端同理
    const b = reciprocate(MACHINE_THETA_MIN + 0.01, -1, 0.03);
    expect(b.dir).toBe(1);
    expect(b.theta).toBeCloseTo(MACHINE_THETA_MIN + 0.02, 9);
    // 区间内不改方向（取区间中点，与摆向无关）
    const mid = (MACHINE_THETA_MIN + MACHINE_THETA_MAX) / 2;
    const c = reciprocate(mid, 1, 0.05);
    expect(c.dir).toBe(1);
    expect(c.theta).toBeCloseTo(mid + 0.05, 9);
  });

  it('θ 永不越界，且往复一整轮后回到起点附近', () => {
    const m = createMachine();
    let dir: 1 | -1 = MACHINE_DIR;
    const steps = Math.round((2 * MACHINE_SWEEP) / STEP);
    for (let k = 0; k < steps; k++) {
      dir = runMachine(m, dir, STEP);
      expect(m.theta).toBeGreaterThanOrEqual(MACHINE_THETA_MIN - 1e-9);
      expect(m.theta).toBeLessThanOrEqual(MACHINE_THETA_MAX + 1e-9);
    }
    expect(strokeOf(m.theta)).toBeCloseTo(0, 5); // 回到伸展位
    // 不断言此刻的方向符号：恰好落在端点时是否触发反射取决于末位误差，
    // 两个取值都合法，断它等于在测浮点噪声。要紧的是**不卡死**——
    // 再走几步必须重新离开端点。
    const before = m.theta;
    for (let k = 0; k < 20; k++) dir = runMachine(m, dir, STEP);
    expect(Math.abs(m.theta - before)).toBeGreaterThan(10 * STEP);
  });

  it('行程参数 u：0 = 伸展、1 = 折叠，与 θ 一一对应（与摆向无关）', () => {
    // 断言按**语义**写，不按 MIN/MAX 写——那两个边界谁是伸展端取决于摆向，
    // 拿它们当基准的话，翻一次摆向测试就得跟着翻一次（首版即此错）。
    expect(strokeOf(MACHINE_THETA0)).toBeCloseTo(0, 12);
    expect(thetaAtStroke(0)).toBe(MACHINE_THETA0);
    expect(strokeOf(thetaAtStroke(1))).toBeCloseTo(1, 12);
    expect(phaseDeg(MACHINE_THETA0)).toBeCloseTo(0, 12);
    expect(phaseDeg(thetaAtStroke(1))).toBeCloseTo(180, 12);
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      expect(strokeOf(thetaAtStroke(u))).toBeCloseTo(u, 12);
    }
    // 折叠端就是区间里离 θ₀ 远的那一头
    const folded = thetaAtStroke(1);
    expect(Math.min(folded, MACHINE_THETA0)).toBeCloseTo(MACHINE_THETA_MIN, 12);
    expect(Math.max(folded, MACHINE_THETA0)).toBeCloseTo(MACHINE_THETA_MAX, 12);
    // 越界一律钳住（滑杆不会送进区间外的值，但接口不该被越界值带飞）
    expect(strokeOf(MACHINE_THETA_MAX + 5)).toBeLessThanOrEqual(1);
    expect(strokeOf(MACHINE_THETA_MIN - 5)).toBeLessThanOrEqual(1);
    expect(clampTheta(MACHINE_THETA_MAX + 5)).toBe(MACHINE_THETA_MAX);
    expect(clampTheta(MACHINE_THETA_MIN - 5)).toBe(MACHINE_THETA_MIN);
  });

  it('摆向：从伸展位起经用户指定的一侧（MACHINE_DIR），且折叠端 = 拱顶降 2R', () => {
    expect(Math.abs(MACHINE_DIR)).toBe(1);
    // 沿设计摆向走满半程即折叠位
    const m = createMachine();
    const open = MACHINE_DRIVE.map((_, i) => apexHeight(m, i));
    for (let k = 0; k < 360; k++) stepMachine(m, DSTEP);
    MACHINE_DRIVE.forEach((d, i) => {
      expect(apexHeight(m, i)).toBeCloseTo(open[i] - 2 * d.crankR, 1);
    });
    // 方向语义：沿摆向走 = 正在折叠
    expect(isFolding(MACHINE_DIR)).toBe(true);
    expect(isFolding(MACHINE_DIR === 1 ? -1 : 1)).toBe(false);
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
    // 环身 = 66 板 + 2 配件（S1 两件脚配件；815 换源删掉了 729 时期的 S3 拱顶配件）；
    // 传动 = 5 轮 + 5 杆 + 中间轴
    expect(seen.get('rings')).toBe(68);
    expect(seen.get('drive')).toBe(11);
    expect(seen.get('frame')).toBe(1);
    // 小触手 = 四个关节化组；大触手是活件，不烘进 machine-mesh.bin
    expect(seen.get('tentacle')).toBe(4);
  });

  it('中间轴归「传动」而不是「机架」（否则传动开关切不动它）', () => {
    expect(MACHINE_GROUPS.some((g) => g.name === 'shaft')).toBe(true);
    expect(partKind('shaft')).toBe('drive');
    expect(partKind('frame')).toBe('frame');
  });

  it('大触手不在形体表里——它是活件，由 tentacle3d 实时驱动', () => {
    expect(MACHINE_GROUPS.some((g) => g.name === 'tentacle')).toBe(false);
    // 小触手 2026-07-30 起也是活件：四组网格在表里（同一个 bin），但位姿另解
    for (const n of ['sa_mount', 'sa_seg1', 'sa_soft', 'sa_seg2']) {
      expect(MACHINE_GROUPS.some((g) => g.name === n)).toBe(true);
      expect(partKind(n)).toBe('tentacle');
      expect(isSmallArmGroup(n)).toBe(true);
    }
    // 软杆带蒙皮混合带，其余三组不带
    expect(MACHINE_GROUPS.find((g) => g.name === 'sa_soft')?.blend).toHaveLength(2);
    expect(MACHINE_GROUPS.find((g) => g.name === 'sa_seg1')?.blend).toBeUndefined();
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
    // sa_* 恒不在静姿清单里（位姿由 machine-smallarm 另解、台架另画）
    expect(visibleGroups(all, null)).toHaveLength(MACHINE_GROUPS.length - 4);
    const noTent = visibleGroups({ ...all, tentacle: false }, null);
    expect(noTent.some((g) => isSmallArmGroup(g.name))).toBe(false);
    // 触手档在 MACHINE_GROUPS 里只有 sa_*，且它们本就不走静姿路径，
    // 故关不关触手对这张清单没有额外影响
    expect(noTent).toHaveLength(MACHINE_GROUPS.length - 4);
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
    expect(only2.some((g) => g.name === 'shaft')).toBe(true);
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
