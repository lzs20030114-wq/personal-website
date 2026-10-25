import { describe, expect, it } from 'vitest';
import { FRAMES, HOIST, STEADY, TrajectoryBaker, UNITS_PER_M, bakeBand, bakeRing, bandFrame, bandTopology, catPlacement, figureYaw, furnitureBoxes, hoistProfile, platesMesh, postsMesh, rigFor, ringBand, roomMesh, seatSpecOf, unitDrop, unitFootY, unitTopY } from './cohabit-solid';
import { planLayout } from './unit-activation';
import { FIGURE, PEAK_REACH, RIG_ANCHOR_Y, ROOM, ringOuter } from './skin-grid';
import { RING } from './skin-ring';
import { catMesh, figureMesh } from './figure';
import { partBox } from './mesh-shell';
import { COHABIT, CohabitSim, type FurnRect } from './cohabit';

/**
 * 守门：Lab 2-15 立体演示的几何胶水。它不解新物理，错法是尺度错、帧取错——都不报错，只看着「差不多」。
 */
const traj = new TrajectoryBaker().runAll();
const layout8 = planLayout(8);

describe('带子轨迹关键帧', () => {
  it('正向 + 回程 + 升降帧数齐全，每帧 2n 个数', () => {
    expect(traj.frames).toHaveLength(FRAMES.form + FRAMES.retract + FRAMES.hoist);
    for (const f of traj.frames) expect(f.length).toBe(2 * traj.n);
  });

  it('钉住端在正向与回程里全程不动（注册在底端），平台顶面在钉住端之上、挑出在环族的量级', () => {
    const n = traj.n;
    for (const f of traj.frames.slice(0, FRAMES.form + FRAMES.retract)) expect(-f[2 * n - 1] * 100).toBeCloseTo(traj.footY, 3);
    expect(traj.platformTopY).toBeLessThan(traj.footY);
    expect(traj.platformTopY).toBeGreaterThan(0);
    // 成形后挑出 ≈ 芯半径 + 环族峰值挑出（PEAK_REACH 是全程峰值，终态略小）
    expect(traj.reach).toBeGreaterThan(RING.RADIUS_DEF + PEAK_REACH * 0.8);
    expect(traj.reach).toBeLessThan(RING.RADIUS_DEF + PEAK_REACH + 2);
  });

  it('回程第 0 帧 = 正向末帧（同一刻），回程末帧回到直带子附近', () => {
    const n = traj.n;
    const formed = traj.frames[FRAMES.form - 1];
    const retract0 = traj.frames[FRAMES.form];
    for (let i = 0; i < 2 * n; i++) expect(retract0[i]).toBe(formed[i]);
    const last = traj.frames[traj.frames.length - 1];
    let maxX = 0;
    for (let i = 0; i < n; i++) maxX = Math.max(maxX, last[i]);
    expect(maxX * 100).toBeLessThan(40); // 松键回直后只剩 r = R0 的自然松弛（实测 ≈ 30 px）
    expect(maxX * 100).toBeLessThan(traj.reach - RING.RADIUS_DEF); // 比成形态小得多
    // 回程 900 步回到 R0 + 600 步静置：静置段逐位相同，retractActive 指向最后一帧还在动的
    expect(traj.retractActive).toBeGreaterThan(FRAMES.retract * 0.4);
    expect(traj.retractActive).toBeLessThan(FRAMES.retract - 1);
    const tail = traj.frames[FRAMES.form + traj.retractActive + 1];
    for (let i = 0; i < 2 * n; i++) expect(tail[i]).toBeCloseTo(last[i], 5); // 静置段只剩 1e-8 量级的抖动
  });

  it('升降帧：由直带子压向顶端——顶端不动、挑出不变、钉住端从收起位单调降到工位，末帧 = 直带子', () => {
    const n = traj.n;
    const straight = traj.frames[STEADY.straight];
    const stowed = traj.frames[STEADY.stowed];
    expect(STEADY.stowed).toBe(FRAMES.form + FRAMES.retract);
    const topOf = (f: Float64Array): number => Math.max(...Array.from(f.subarray(n, 2 * n)));
    const top = topOf(straight);
    // 收起态：吊长只剩 HOIST.stowed 倍，顶端节点不动，横向逐位相同
    expect(top - stowed[2 * n - 1]).toBeCloseTo((top - straight[2 * n - 1]) * HOIST.stowed, 9);
    expect(topOf(stowed)).toBeCloseTo(top, 12);
    for (let i = 0; i < n; i++) expect(stowed[i]).toBe(straight[i]);
    let prevFoot = -Infinity;
    for (let j = 0; j < FRAMES.hoist; j++) {
      const f = traj.frames[STEADY.stowed + j];
      const foot = -f[2 * n - 1] * 100;
      expect(foot).toBeLessThanOrEqual(traj.footY + 1e-6);
      expect(foot).toBeGreaterThan(prevFoot);
      expect(topOf(f)).toBeCloseTo(top, 12);
      prevFoot = foot;
    }
    const last = traj.frames[STEADY.stowed + FRAMES.hoist - 1];
    for (let i = 0; i < 2 * n; i++) expect(last[i]).toBeCloseTo(straight[i], 12);
    // 纯几何：k = 1 逐位等于原帧
    const same = hoistProfile(straight, n, 1);
    for (let i = 0; i < 2 * n; i++) expect(same[i]).toBeCloseTo(straight[i], 12);
  });

  it('取帧：三个静止态钉死、升降段只查升降帧、成形段涨查正向（跳过初始摆位那一帧）退查回程的会动段，且各自单调', () => {
    const D = HOIST.dropAt;
    expect(bandFrame(0, true)).toBe(STEADY.stowed);
    expect(bandFrame(0, false)).toBe(STEADY.stowed);
    expect(STEADY.stowed).toBe(traj.frames.length - FRAMES.hoist);
    expect(bandFrame(D, true)).toBe(STEADY.straight);
    expect(bandFrame(D, false)).toBe(STEADY.straight);
    expect(bandFrame(1, true)).toBe(STEADY.formed);
    expect(bandFrame(1, false)).toBe(STEADY.formed);
    // 升降段：不分涨退，从收起态单调走到直带子
    for (const rising of [true, false]) {
      let prev = -1;
      for (let f = 0.001; f < D; f += 0.005) {
        const k = bandFrame(f, rising, FRAMES, traj.retractActive);
        expect(k === STEADY.straight || (k >= STEADY.stowed && k < STEADY.stowed + FRAMES.hoist)).toBe(true);
        const ord = k === STEADY.straight ? STEADY.stowed + FRAMES.hoist : k;
        expect(ord).toBeGreaterThanOrEqual(prev);
        prev = ord;
      }
    }
    let prev = -1;
    for (let f = D + 0.001; f < 1; f += 0.005) {
      const k = bandFrame(f, true);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeGreaterThanOrEqual(prev);
      expect(k).toBeLessThan(FRAMES.form);
      prev = k;
    }
    prev = Infinity;
    for (let f = D + 0.001; f < 1; f += 0.005) {
      const k = bandFrame(f, false, FRAMES, traj.retractActive);
      expect(k).toBeLessThanOrEqual(prev);
      expect(k).toBeGreaterThanOrEqual(FRAMES.form);
      expect(k).toBeLessThanOrEqual(FRAMES.form + traj.retractActive);
      prev = k;
    }
    // 成形段退到底与直带子是同一个形（回程会动段的末帧之后逐位相同）
    const kEnd = bandFrame(D + 0.0005, false, FRAMES, traj.retractActive);
    const a = traj.frames[kEnd];
    const b = traj.frames[STEADY.straight];
    for (let i = 0; i < 2 * traj.n; i++) expect(a[i]).toBeCloseTo(b[i], 5);
  });

  it('预览（烘完之前）给的钉住端高度与烘完的一致，两帧：初始摆位与它的收起态', () => {
    const b = new TrajectoryBaker();
    const pre = b.preview();
    expect(pre.frames).toHaveLength(2);
    expect(pre.footY).toBeCloseTo(traj.footY, 6);
    expect(rigFor(layout8, pre).y).toBeCloseTo(rigFor(layout8, traj).y, 6);
    const n = pre.n;
    const stowed = hoistProfile(pre.frames[0], n, HOIST.stowed);
    for (let i = 0; i < 2 * n; i++) expect(pre.frames[1][i]).toBe(stowed[i]);
  });

  it('整环网格 = 二十条带的网格拼起来', () => {
    const topo = bandTopology(traj.n);
    const one = bakeBand(traj, STEADY.formed, topo);
    const ring = bakeRing(traj, STEADY.formed, topo);
    expect(ring.a.length).toBe(one.a.length * RING.COUNT);
    expect(ring.b.length).toBe(one.b.length * RING.COUNT);
  });
});

describe('摆放与尺度', () => {
  const rig = rigFor(layout8, traj);

  it('8×8 的装置按格距等比缩：平面模型的平台半径 = 全程峰值包络（ringOuter）按同一比例缩', () => {
    // 平面模型拿峰值包络定格距与墙（成形过程中鼓到最大的那一刻），终态的平台比它小一圈（≈ 0.86）
    const peakD = (2 * ringOuter(RING.RADIUS_DEF) * rig.s) / UNITS_PER_M;
    expect(peakD / (2 * layout8.platR)).toBeGreaterThan(0.98);
    expect(peakD / (2 * layout8.platR)).toBeLessThan(1.02);
    const d3 = (2 * traj.reach * rig.s) / UNITS_PER_M;
    expect(d3 / (2 * layout8.platR)).toBeGreaterThan(0.8);
    expect(d3 / (2 * layout8.platR)).toBeLessThan(1);
  });

  it('钉住端停在离地 1.08 m（RIG_ANCHOR_Y），平台面在它之上不到 0.3 m', () => {
    expect(rig.y + rig.s * traj.footY).toBeCloseTo(RIG_ANCHOR_Y, 6);
    expect(rig.platformY).toBeLessThan(RIG_ANCHOR_Y);
    const aboveM = (RIG_ANCHOR_Y - rig.platformY) / UNITS_PER_M;
    expect(aboveM).toBeGreaterThan(0.05);
    expect(aboveM).toBeLessThan(0.3);
    expect((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / UNITS_PER_M).toBeCloseTo(1.08, 1);
  });

  it('收起位：装置原点贴着圆环板下面，升降程度 0 → 1 从收起位插值到工位；收起的布束底在人头顶以上一大截', () => {
    expect(rig.stowY).toBe(HOIST.ceilGap);
    expect(unitTopY(rig, 0)).toBe(rig.stowY);
    expect(unitTopY(rig, 1)).toBeCloseTo(rig.y, 12);
    expect(unitDrop(0)).toBe(0);
    expect(unitDrop(HOIST.dropAt / 2)).toBeCloseTo(0.5, 12);
    expect(unitDrop(HOIST.dropAt)).toBe(1);
    expect(unitDrop(1)).toBe(1);
    const n = traj.n;
    const stowedFoot = unitTopY(rig, 0) + rig.s * -traj.frames[STEADY.stowed][2 * n - 1] * 100;
    expect((ROOM.FLOOR_Y - stowedFoot) / UNITS_PER_M).toBeGreaterThan(3.3); // 房高 3.74 m，收起的布束只占顶上十几厘米
    expect(unitTopY(rig, 1) + rig.s * traj.footY).toBeCloseTo(RIG_ANCHOR_Y, 6);
    // 钉住端（布束底 = 立杆下端）：到工位 = RIG_ANCHOR_Y，收起时与收起帧的脚只差顶端节点那零点几个单位，随升降单调
    expect(unitFootY(rig, traj.footY, 1)).toBeCloseTo(RIG_ANCHOR_Y, 6);
    expect(Math.abs(unitFootY(rig, traj.footY, 0) - stowedFoot)).toBeLessThan(0.5);
    let prevFoot = -Infinity;
    for (let d = 0; d <= 1; d += 0.1) {
      const y = unitFootY(rig, traj.footY, d);
      expect(y).toBeGreaterThan(prevFoot);
      prevFoot = y;
    }
  });

  it('64 个格子落在房间内净范围里，plan y → 世界 Z', () => {
    expect(rig.cells).toHaveLength(64);
    const half = (layout8.roomM / 2) * UNITS_PER_M;
    for (const c of rig.cells) {
      expect(Math.abs(c.x)).toBeLessThan(half);
      expect(Math.abs(c.z)).toBeLessThan(half);
    }
    expect(rig.cells[1].x - rig.cells[0].x).toBeCloseTo(layout8.pitchM * UNITS_PER_M, 6);
    expect(rig.cells[8].z - rig.cells[0].z).toBeCloseTo(layout8.pitchM * UNITS_PER_M, 6);
  });

  it('立杆、圆环板、房间都是闭合网格；立杆下端按单元给（不传 = 全在工位，收起时只剩天花下一小截）', () => {
    for (const m of [postsMesh(rig, layout8), platesMesh(rig), roomMesh(layout8.roomM)]) {
      expect(m.verts.length % 3).toBe(0);
      expect(m.idx.length % 3).toBe(0);
      for (const i of m.idx) expect(i).toBeLessThan(m.verts.length / 3);
    }
    const lowest = (m: { verts: Float32Array }): number => {
      let y = -Infinity;
      for (let k = 1; k < m.verts.length; k += 3) y = Math.max(y, m.verts[k]);
      return y;
    };
    expect(lowest(postsMesh(rig, layout8))).toBeCloseTo(RIG_ANCHOR_Y, 4);
    const stowedFoot = unitFootY(rig, traj.footY, 0);
    expect(lowest(postsMesh(rig, layout8, new Float32Array(64).fill(stowedFoot)))).toBeCloseTo(stowedFoot, 4);
    expect(stowedFoot).toBeLessThan(RIG_ANCHOR_Y * 0.1);
  });

  it('家具：每件一块座面一块靠背，座面离地 0.45 m，靠背在人背后那条边上', () => {
    const sofa: FurnRect = { kind: 'sofa', cx: 1, cy: -2, x0: 0.3, x1: 1.7, y0: -2.4, y1: -1.6, face: [0, 1] };
    const boxes = furnitureBoxes([sofa]);
    expect(boxes).toHaveLength(2);
    const [seat, back] = boxes;
    expect((ROOM.FLOOR_Y - (seat.cy - seat.hy)) / UNITS_PER_M).toBeCloseTo(0.45, 6);
    expect(back.cz / UNITS_PER_M).toBeLessThan(sofa.cy); // face +y ⇒ 靠背在 −y 侧
    expect(back.cz / UNITS_PER_M).toBeGreaterThan(sofa.y0 - 1e-9);
    expect((ROOM.FLOOR_Y - (back.cy - back.hy)) / UNITS_PER_M).toBeCloseTo(0.85, 6);
  });

  const band = ringBand(rig, layout8, traj);
  const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

  it('环形平台的可用宽度：内 = 芯外缘、外 = 成形平台外缘，猫身中线放在正中', () => {
    expect(band.rIn).toBeGreaterThan(layout8.mastR);
    expect(band.rIn).toBeLessThan(layout8.mastR + 0.01);
    expect(band.rOut - band.rIn).toBeGreaterThan(0.14); // 8×8 下环只有 16 cm 宽——猫只能顺着环待
    expect(band.rOut - band.rIn).toBeLessThan(0.18);
    expect(band.R).toBeCloseTo((band.rIn + band.rOut) / 2, 12);
  });

  it('猫的摆放：台上顺着环坐（身子切向、中线在环正中、头转回去看它要看的方向），卧变蜷，跨台贴着芯的一侧走，地面照平面位置', () => {
    const u = { x: 0, y: 0 };
    const a = catPlacement({ x: 0, y: 0, heading: Math.PI / 2, state: 'sit' }, [u], true, false, layout8, band);
    expect(a).toMatchObject({ onPlatform: true, pose: 'sit', lift: 0 });
    expect(a.bend).toBeCloseTo(band.R, 12);
    expect(Math.hypot(a.x, a.y)).toBeCloseTo(band.R, 9);
    expect(Math.cos(a.heading) * a.x + Math.sin(a.heading) * a.y).toBeCloseTo(0, 9); // 朝向与半径垂直 = 顺着环
    expect(wrap(a.heading + a.headTurn - Math.PI / 2)).toBeCloseTo(0, 9); // 头回到平面模型的朝向
    expect(catPlacement({ x: 0, y: 0, heading: 0, state: 'lie' }, [u], true, false, layout8, band).pose).toBe('curl');
    // 台边（靠近访客）：摆在朝访客那一侧往回绕 55° 的地方，头转过去看访客，转头不过 90°
    const e = catPlacement({ x: 0.1, y: 0, heading: 0, state: 'approach' }, [u], true, false, layout8, band);
    expect(Math.atan2(e.y, e.x)).toBeCloseTo((-55 * Math.PI) / 180, 9);
    expect(wrap(e.heading + e.headTurn)).toBeCloseTo(0, 9);
    expect(Math.abs(e.headTurn)).toBeLessThan(Math.PI / 2);
    // 跨台：整程离两根芯的轴都是 R，中途略抬起
    const B = { x: layout8.pitchM, y: 0 };
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const m = catPlacement({ x: B.x * t, y: 0, heading: 0, state: 'walk' }, [u, B], true, true, layout8, band);
      expect(m).toMatchObject({ pose: 'walk', bend: 0, onPlatform: true });
      expect(Math.abs(m.y)).toBeCloseTo(band.R, 9);
      expect(m.lift).toBeGreaterThanOrEqual(0);
    }
    // 没成形（落到位的直筒还没有台面）/ 地面：照平面模型的位置与朝向，直的
    expect(catPlacement({ x: 0.3, y: 0.2, heading: 1, state: 'sit' }, [u], false, false, layout8, band)).toMatchObject({ x: 0.3, y: 0.2, heading: 1, onPlatform: false, bend: 0, pose: 'sit' });
    expect(catPlacement({ x: 0.3, y: 0.2, heading: 1, state: 'walk' }, [], false, true, layout8, band).pose).toBe('walk');
  });

  it('台上的猫不穿杆、不悬空（Lab 2-15 的实际环宽）：各种状态 × 八个朝向 × 芯心 / 台边，猫离芯轴都在芯外缘以外，贴台面的部分都在平台环内', () => {
    const u = { x: 0, y: 0 };
    const clear = band.rIn + 0.005;
    const check = (pl: ReturnType<typeof catPlacement>, cores: { x: number; y: number }[], label: string): void => {
      const m = catMesh({ x: pl.x * UNITS_PER_M, z: pl.y * UNITS_PER_M, footY: 0, unit: UNITS_PER_M, yaw: figureYaw(pl.heading), pose: pl.pose, tail: pl.tail, bend: pl.bend, headYaw: pl.headTurn });
      for (let k = 0; k < m.verts.length; k += 3) {
        const x = m.verts[k] / UNITS_PER_M, z = m.verts[k + 2] / UNITS_PER_M, y = -m.verts[k + 1] / UNITS_PER_M;
        for (const c of cores) expect(Math.hypot(x - c.x, z - c.y), `${label} 穿杆`).toBeGreaterThan(clear);
        if (cores.length === 1 && y < 0.002) expect(Math.hypot(x - u.x, z - u.y), `${label} 着地的部分出了平台`).toBeLessThan(band.rOut);
      }
    };
    for (const state of ['sit', 'lie', 'wait', 'approach', 'walk'])
      for (let k = 0; k < 8; k++) {
        const h = (k / 8) * 2 * Math.PI;
        for (const at of [{ x: 0, y: 0 }, { x: 0.1 * Math.cos(h + 0.7), y: 0.1 * Math.sin(h + 0.7) }]) {
          const pl = catPlacement({ ...at, heading: h, state }, [u], true, state === 'walk', layout8, band);
          check(pl, [u], `${state} h${k}`);
        }
      }
    const B = { x: 0, y: layout8.pitchM };
    for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) check(catPlacement({ x: 0, y: B.y * t, heading: Math.PI / 2, state: 'walk' }, [u, B], true, true, layout8, band), [u, B], `跨台 ${t}`);
  });
});

describe('坐着的人与家具', () => {
  it('标准布置的每个座位、坐直与前倾：小人不插进任何一块座面板或靠背，臀贴座面，脚踩地', () => {
    const sim = new CohabitSim({ trigger: 'posture', grid: COHABIT.SEATS.GRID, space: 'live', seed: 1 });
    const furn = sim.furn;
    expect(furn).not.toBeNull();
    if (!furn) return;
    const boxes = furnitureBoxes(furn.rects);
    const tol = 1e-3;
    expect(sim.seats.length).toBeGreaterThanOrEqual(10);
    for (const seat of sim.seats) {
      const s = seatSpecOf(furn.rects[seat.furn], seat);
      expect(s.front).toBeGreaterThan(0.45); // 座位点在前缘后 0.5 m 上下
      expect(s.back).toBeGreaterThan(0.1);
      for (const lean of [false, true]) {
        const m = figureMesh({
          x: seat.x * UNITS_PER_M,
          z: seat.y * UNITS_PER_M,
          footY: ROOM.FLOOR_Y,
          height: FIGURE.HEIGHT,
          yaw: figureYaw(Math.atan2(seat.face[1], seat.face[0])),
          pose: 'sit',
          lean,
          seat: { top: s.top * UNITS_PER_M, front: s.front * UNITS_PER_M, back: s.back * UNITS_PER_M, thick: s.thick * UNITS_PER_M, backTop: s.backTop * UNITS_PER_M },
        });
        for (let k = 0; k < m.verts.length; k += 3) {
          const [x, y, z] = [m.verts[k], m.verts[k + 1], m.verts[k + 2]];
          for (const b of boxes) {
            const inside = Math.abs(x - b.cx) < b.hx - tol && Math.abs(y - b.cy) < b.hy - tol && Math.abs(z - b.cz) < b.hz - tol;
            expect(inside, `座位 ${seat.i}${lean ? ' 前倾' : ''} 插进家具`).toBe(false);
          }
        }
        const b = partBox(m);
        expect(b.y1).toBeCloseTo(ROOM.FLOOR_Y, 4); // 脚在地上
        expect((ROOM.FLOOR_Y - b.y0) / UNITS_PER_M).toBeGreaterThan(1.2); // 坐着的头顶 1.2–1.4 m
        expect((ROOM.FLOOR_Y - b.y0) / UNITS_PER_M).toBeLessThan(1.4);
      }
    }
  });
});
