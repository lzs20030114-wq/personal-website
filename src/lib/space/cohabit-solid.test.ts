import { describe, expect, it } from 'vitest';
import { FRAMES, STEADY, TrajectoryBaker, UNITS_PER_M, bakeBand, bakeRing, bandFrame, bandTopology, catSpot, furnitureBoxes, postsMesh, rigFor, roomMesh } from './cohabit-solid';
import { planLayout } from './unit-activation';
import { PEAK_REACH, RIG_ANCHOR_Y, ROOM, ringOuter } from './skin-grid';
import { RING } from './skin-ring';
import { catVerts, figureBox, figureVerts } from './figure';
import type { FurnRect } from './cohabit';

/**
 * 守门：Lab 2-15 立体演示的几何胶水。它不解新物理，错法是尺度错、帧取错——都不报错，只看着「差不多」。
 */
const traj = new TrajectoryBaker().runAll();
const layout8 = planLayout(8);

describe('带子轨迹关键帧', () => {
  it('正向 + 回程帧数齐全，每帧 2n 个数', () => {
    expect(traj.frames).toHaveLength(FRAMES.form + FRAMES.retract);
    for (const f of traj.frames) expect(f.length).toBe(2 * traj.n);
  });

  it('钉住端全程不动（注册在底端），平台顶面在钉住端之上、挑出在环族的量级', () => {
    const n = traj.n;
    for (const f of traj.frames) expect(-f[2 * n - 1] * 100).toBeCloseTo(traj.footY, 3);
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

  it('取帧：两端钉死、涨查正向（跳过初始摆位那一帧）、退查回程的会动段，且各自单调', () => {
    expect(bandFrame(0, true)).toBe(STEADY.straight);
    expect(bandFrame(0, false)).toBe(STEADY.straight);
    expect(STEADY.straight).toBe(traj.frames.length - 1);
    expect(bandFrame(1, true)).toBe(STEADY.formed);
    expect(bandFrame(1, false)).toBe(STEADY.formed);
    let prev = -1;
    for (let f = 0.001; f < 1; f += 0.01) {
      const k = bandFrame(f, true);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(k).toBeGreaterThanOrEqual(prev);
      expect(k).toBeLessThan(FRAMES.form);
      prev = k;
    }
    prev = Infinity;
    for (let f = 0.001; f < 1; f += 0.01) {
      const k = bandFrame(f, false, FRAMES, traj.retractActive);
      expect(k).toBeLessThanOrEqual(prev);
      expect(k).toBeGreaterThanOrEqual(FRAMES.form);
      expect(k).toBeLessThanOrEqual(FRAMES.form + traj.retractActive);
      prev = k;
    }
    // 退到底与「闲着」是同一个形（回程会动段的末帧之后逐位相同）
    const kEnd = bandFrame(0.0005, false, FRAMES, traj.retractActive);
    const a = traj.frames[kEnd];
    const b = traj.frames[STEADY.straight];
    for (let i = 0; i < 2 * traj.n; i++) expect(a[i]).toBeCloseTo(b[i], 5);
  });

  it('预览（烘完之前）给的钉住端高度与烘完的一致，只有一帧', () => {
    const b = new TrajectoryBaker();
    const pre = b.preview();
    expect(pre.frames).toHaveLength(1);
    expect(pre.footY).toBeCloseTo(traj.footY, 6);
    expect(rigFor(layout8, pre).y).toBeCloseTo(rigFor(layout8, traj).y, 6);
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

  it('立杆与圆环板、房间都是闭合网格', () => {
    for (const m of [postsMesh(rig, layout8), roomMesh(layout8.roomM)]) {
      expect(m.verts.length % 3).toBe(0);
      expect(m.idx.length % 3).toBe(0);
      for (const i of m.idx) expect(i).toBeLessThan(m.verts.length / 3);
    }
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

  it('猫在台上：坐在芯心的沿朝向挪到平台中带，走到台边的按实际位置、不出外缘，离台的在地面', () => {
    const u = { x: 0, y: 0 };
    const mid = (layout8.mastR + layout8.platR) / 2;
    const s = catSpot({ x: 0, y: 0, heading: Math.PI / 2 }, u, layout8);
    expect(s.onPlatform).toBe(true);
    expect(s.x).toBeCloseTo(0, 9);
    expect(s.y).toBeCloseTo(mid, 9);
    const edge = catSpot({ x: layout8.platR * 0.9, y: 0, heading: 0 }, u, layout8);
    expect(edge.onPlatform).toBe(true);
    expect(edge.x).toBeLessThanOrEqual(layout8.platR);
    expect(catSpot({ x: 2, y: 0, heading: 0 }, u, layout8).onPlatform).toBe(false);
    expect(catSpot({ x: 2, y: 0, heading: 0 }, null, layout8).onPlatform).toBe(false);
  });
});

describe('小人坐姿与猫', () => {
  it('坐姿：头顶比站着低 0.225 身高，脚仍在地上，闭合网格', () => {
    const base = { x: 0, z: 0, footY: 473, height: 215 } as const;
    const stand = figureBox(base);
    const sit = figureBox({ ...base, pose: 'sit' });
    expect(sit.y1).toBeCloseTo(473, 6);
    expect(stand.y0 - sit.y0).toBeCloseTo(-0.225 * 215, 3);
    const { verts, idx } = figureVerts({ ...base, pose: 'sit' });
    expect(idx.length / 36).toBe(verts.length / 24);
    for (const i of idx) expect(i).toBeLessThan(verts.length / 3);
  });

  it('猫：四种姿态都是闭合网格，站着肩高 ≈ 0.26–0.35 m，趴着不到 0.25 m', () => {
    for (const pose of ['stand', 'walk', 'sit', 'lie'] as const) {
      const { verts, idx } = catVerts({ x: 0, z: 0, footY: 473, unit: UNITS_PER_M, pose });
      expect(idx.length / 36).toBe(verts.length / 24);
      let top = Infinity;
      let bottom = -Infinity;
      for (let k = 1; k < verts.length; k += 3) {
        top = Math.min(top, verts[k]);
        bottom = Math.max(bottom, verts[k]);
      }
      expect(bottom).toBeCloseTo(473, 6);
      const hM = (473 - top) / UNITS_PER_M;
      if (pose === 'lie') expect(hM).toBeLessThan(0.25);
      else expect(hM).toBeGreaterThan(0.26);
      expect(hM).toBeLessThan(0.45);
    }
  });
});
