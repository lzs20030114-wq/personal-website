import { describe, expect, it } from 'vitest';
import { BRIDGE_BASE, FRAMES, FURN_ERGO, HOIST, STEADY, TABLE_TOP, rigYForTop, tableTopFor, bandCursors, bandPaths, membraneJoins, resetBandCursors, stepBandCursor, TrajectoryBaker, UNITS_PER_M, UNIT_BAND, UNIT_ORDER, UNIT_TIERS, UnitBaker, bakeBand, bakeMembrane, bakeUnit, bakeUnitSkin, bandFrame, bandTopology, catPlacement, figureYaw, furnitureBoxes, hoistProfile, platesMesh, platformBand, platformSide, postsMesh, rigFor, roomMesh, seatSpecOf, unitDrop, unitFootY, unitTopY } from './cohabit-solid';
import { planLayout } from './unit-activation';
import { FIGURE, RIG_ANCHOR_Y, ROOM, ringOuter } from './skin-grid';
import { RING } from './skin-ring';
import { SOLID } from './skin-solid';
import { SQUARE, SQUARE_PEAK, SQUARE_REACH, buildSquareUnits, squareHalfSide, squareRadiusAt } from './skin-square';
import { CAT_COATS, catMesh, figureMesh, styleKey as styleKeyOf, type HumanStyle } from './figure';
import { OUTFITS } from '../../../components/lab/figurePalette';
import { partBox } from './mesh-shell';
import { COHABIT, CohabitSim, SQUARE_SCALE, bandAngle, squarePlanLayout, type FurnRect } from './cohabit';

/**
 * 守门：Lab 2-15 立体演示的几何胶水。它不解新物理，错法是尺度错、帧取错、外形错——都不报错，只看着「差不多」。
 * 2026-10-25 起单元是方形的（Lab 2-7 方形环平档的面 / 边 / 角三档），trajs[0] = 面档，帧结构的守门拿它做。
 */
const trajs = new UnitBaker().runAll();
const traj = trajs[0];
const layout8 = planLayout(8);

describe('带子轨迹关键帧', () => {
  it('正向 + 回程 + 升降帧数齐全，每帧 2n 个数', () => {
    expect(traj.frames).toHaveLength(FRAMES.form + FRAMES.retract + FRAMES.hoist + FRAMES.bridge);
    for (const f of traj.frames) expect(f.length).toBe(2 * traj.n);
  });

  it('钉住端在正向与回程里全程不动（注册在底端），平台顶面在钉住端之上', () => {
    const n = traj.n;
    for (const f of traj.frames.slice(0, FRAMES.form + FRAMES.retract)) expect(-f[2 * n - 1] * 100).toBeCloseTo(traj.footY, 3);
    expect(traj.platformTopY).toBeLessThan(traj.footY);
    expect(traj.platformTopY).toBeGreaterThan(0);
  });

  it('三档（面 / 边 / 角）：同一条带长、钉住端一样高、平台面一样高，挑出与 Lab 2-7 方形环的深度表一致', () => {
    expect(trajs).toHaveLength(3);
    expect(UNIT_TIERS.map((d) => d.en)).toEqual(['face', 'edge', 'corner']);
    for (const [t, tr] of trajs.entries()) {
      expect(tr.n).toBe(traj.n);
      expect(tr.footY).toBeCloseTo(traj.footY, 6); // 注册在底端，三档初始摆位相同（角档的段落分法不同，末位舍入差 1e-13）
      expect(Math.abs(tr.platformTopY - traj.platformTopY)).toBeLessThan(1); // 方形环的对位构造：平台面一样高（px）
      expect(Math.abs(tr.reach - (SQUARE.RADIUS + SQUARE_REACH[t]))).toBeLessThan(0.3);
    }
    // 二十条带：面 8 / 边 8 / 角 4，角档正对 45°
    expect(UNIT_ORDER.filter((t) => t === 0)).toHaveLength(8);
    expect(UNIT_ORDER.filter((t) => t === 1)).toHaveLength(8);
    expect(UNIT_ORDER.filter((t) => t === 2)).toHaveLength(4);
    for (let j = 0; j < UNIT_ORDER.length; j++) if (UNIT_ORDER[j] === 2) expect(Math.abs(Math.sin(2 * bandAngle(j)))).toBeCloseTo(1, 9);
  });

  it('用的是方形环立项时那条 202 节的带：形状与现行 305 节那条逐点相同（尾端对齐），只少上半截贴芯的素管', () => {
    expect(traj.n).toBe(UNIT_BAND);
    const long = new TrajectoryBaker(buildSquareUnits()[0]).runAll();
    expect(long.n).toBe(SQUARE.BAND);
    const a = traj.frames[STEADY.formed];
    const b = long.frames[STEADY.formed];
    const na = traj.n;
    const nb = long.n;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < na; i++) {
      dx = Math.max(dx, Math.abs(a[na - 1 - i] - b[nb - 1 - i]));
      dy = Math.max(dy, Math.abs(a[2 * na - 1 - i] - a[2 * na - 1] - (b[2 * nb - 1 - i] - b[2 * nb - 1])));
    }
    expect(dx * 100).toBeLessThan(0.01); // px
    expect(dy * 100).toBeLessThan(1);
    expect(Math.abs(long.reach - traj.reach)).toBeLessThan(0.01);
  }, 30_000);

  it('俯视是方的：二十个平台外缘点都落在同一个正方形的边上（偏差 < 1 px）', () => {
    const a = squareHalfSide(SQUARE_REACH);
    for (let j = 0; j < UNIT_ORDER.length; j++) {
      const th = bandAngle(j);
      expect(Math.abs(trajs[UNIT_ORDER[j]].reach - squareRadiusAt(th, a))).toBeLessThan(1);
    }
    // 整台网格的包围盒 X、Z 一样大（方形，不是长方）
    const topo = bandTopology(traj.n);
    const v = bakeUnit(trajs, STEADY.formed, topo).a;
    let mx = 0, mz = 0;
    for (let k = 0; k < v.length; k += 6) {
      mx = Math.max(mx, Math.abs(v[k]));
      mz = Math.max(mz, Math.abs(v[k + 2]));
    }
    expect(Math.abs(mx - mz) / mx).toBeLessThan(0.02);
  });

  it('带与带之间的膜：整台二十块，每块的两条边正好贴着带 j 的后剖口与带 j+1 的前剖口（方台俯视读得出是一张台面）', () => {
    const n = traj.n;
    const skin = bakeUnitSkin(trajs, STEADY.formed);
    expect(skin.length).toBe(SQUARE.COUNT * (n - 1) * 2 * 3 * 6);
    expect(bakeMembrane(trajs[0], STEADY.formed, trajs[1], STEADY.formed).length).toBe((n - 1) * 2 * 3 * 6);
    // 俯视：膜的顶点离芯最远的那一圈与带子外缘一样远（角上到 √2 倍的内切圆），中间的弦把缝糊上
    const verts: { x: number; z: number }[] = [];
    for (let k = 0; k < skin.length; k += 6) verts.push({ x: skin[k], z: skin[k + 2] });
    const maxR = Math.max(...verts.map((v) => Math.hypot(v.x, v.z)));
    expect(Math.abs(maxR - trajs[2].reach)).toBeLessThan(SQUARE.DEPTH);
    let mx = 0, mz = 0;
    for (const v of verts) {
      mx = Math.max(mx, Math.abs(v.x));
      mz = Math.max(mz, Math.abs(v.z));
    }
    expect(Math.abs(mx - squareHalfSide(SQUARE_REACH))).toBeLessThan(SQUARE.DEPTH);
    expect(Math.abs(mz - squareHalfSide(SQUARE_REACH))).toBeLessThan(SQUARE.DEPTH);
  });

  it('三档轨迹烘一次就留着：同一页面里再 new 一台直接拿到（换路由 / 重挂不重烘）', () => {
    const again = new UnitBaker();
    expect(again.done).toBe(true);
    expect(again.trajectories).toBe(trajs);
    expect(again.progress).toBe(1);
  });

  it('回程第 0 帧 = 正向末帧（同一刻），回程末帧回到直带子附近', () => {
    const n = traj.n;
    const formed = traj.frames[FRAMES.form - 1];
    const retract0 = traj.frames[FRAMES.form];
    for (let i = 0; i < 2 * n; i++) expect(retract0[i]).toBe(formed[i]);
    const last = traj.frames[STEADY.straight];
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
    expect(STEADY.stowed).toBe(traj.frames.length - FRAMES.hoist - FRAMES.bridge);
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

  // 2026-10-27 台架上「运动不对劲、单元破裂」：按程度直接换算帧号有三处跳（进成形段、反向、正向后段干等），改走两条路 + 游标
  it('正向后段逐位相同（formActive 之后不再动）；过渡帧是直垂到正向第 1 帧的逐点插值', () => {
    const n = traj.n;
    expect(traj.formActive).toBeGreaterThan(FRAMES.form * 0.3);
    expect(traj.formActive).toBeLessThan(FRAMES.form - 1);
    const after = traj.frames[traj.formActive + 1];
    const formed = traj.frames[STEADY.formed];
    for (let i = 0; i < 2 * n; i++) expect(after[i]).toBeCloseTo(formed[i], 5);
    const straight = traj.frames[STEADY.straight];
    const entry = traj.frames[1];
    for (let j = 0; j < FRAMES.bridge; j++) {
      const f = traj.frames[BRIDGE_BASE + j];
      const t = (j + 1) / (FRAMES.bridge + 1);
      for (let i = 0; i < 2 * n; i += 17) expect(f[i]).toBeCloseTo(straight[i] + (entry[i] - straight[i]) * t, 9);
    }
  });

  it('游标取帧：静止态与升降段与 bandFrame 逐位相同；一路涨上去每步都小，中途退回不跳轨，程度小幅来回不翻向', () => {
    const paths = bandPaths(traj);
    const D = HOIST.dropAt;
    const n = traj.n;
    const step = (a: number, b: number): number => {
      let d = 0;
      for (let i = 0; i < 2 * n; i++) d = Math.max(d, Math.abs(traj.frames[a][i] - traj.frames[b][i]));
      return d * 100; // 引擎 px
    };
    const c = bandCursors(1);
    for (const f of [0, 0.1, D * 0.7, D, 1]) expect(stepBandCursor(c, 0, f, paths)).toBe(bandFrame(f, true, FRAMES, traj.retractActive));
    // 从直垂一路涨到成形：帧在正向路上单调前进，相邻两次之间形状差小于旧取帧进成形段那一下（直垂 → 正向第 1 帧）
    resetBandCursors(c);
    const jumpOld = step(STEADY.straight, 1);
    let prev = stepBandCursor(c, 0, D, paths);
    let maxStep = 0;
    for (let f = D; f <= 1.0001; f += 0.002) {
      const k = stepBandCursor(c, 0, Math.min(1, f), paths);
      maxStep = Math.max(maxStep, step(prev, k));
      prev = k;
    }
    expect(prev).toBe(STEADY.formed);
    expect(maxStep).toBeLessThan(jumpOld * 0.6);
    // 涨到一半退回来：反向那一下的跳变不超过另一条路上最近那格的差，远小于旧取帧「正向第 i 帧 → 回程第 (1−g) 帧」
    resetBandCursors(c);
    stepBandCursor(c, 0, D, paths);
    let k = 0;
    for (let f = D; f <= D + (1 - D) * 0.45; f += 0.002) k = stepBandCursor(c, 0, f, paths);
    const gTurn = 0.45;
    const fTurn = D + (1 - D) * gTurn;
    let worst = 0;
    let kPrev = k;
    for (let f = fTurn; f >= D; f -= 0.002) {
      const kk = stepBandCursor(c, 0, f, paths);
      worst = Math.max(worst, step(kPrev, kk));
      kPrev = kk;
    }
    const oldSwitch = step(bandFrame(fTurn, true, FRAMES, traj.retractActive), bandFrame(fTurn - 0.002, false, FRAMES, traj.retractActive));
    expect(worst).toBeLessThan(Math.max(oldSwitch * 0.6, jumpOld * 0.6));
    expect(kPrev).toBe(STEADY.straight);
    // 小幅来回（±0.004，小于迟滞）：不翻向，帧不退
    resetBandCursors(c);
    stepBandCursor(c, 0, D, paths);
    let kk = 0;
    for (let f = D; f <= D + 0.3; f += 0.004) kk = stepBandCursor(c, 0, f, paths);
    for (let r = 0; r < 20; r++) {
      const k2 = stepBandCursor(c, 0, D + 0.3 - (r % 2) * 0.004, paths);
      expect(c.mode[0]).toBe(1);
      expect(step(k2, kk)).toBeLessThan(1e-9 + step(kk, kk + 1));
    }
  });

  it('膜：两条带都在升降段或都在成形段才连；开门的带收成一小截、旁边还成形着，那里不拉膜', () => {
    expect(membraneJoins(STEADY.formed, STEADY.formed)).toBe(true);
    expect(membraneJoins(STEADY.formed, STEADY.straight)).toBe(true);
    expect(membraneJoins(STEADY.stowed, STEADY.stowed + 3)).toBe(true);
    expect(membraneJoins(STEADY.stowed, STEADY.formed)).toBe(false);
    expect(membraneJoins(STEADY.stowed + 5, BRIDGE_BASE + 2)).toBe(false);
    expect(membraneJoins(BRIDGE_BASE, STEADY.formed)).toBe(true);
  });

  it('预览（烘完之前）给的钉住端高度与烘完的一致，两帧：初始摆位与它的收起态', () => {
    const b = new UnitBaker();
    const pre = b.preview();
    expect(pre.frames).toHaveLength(2);
    expect(pre.footY).toBeCloseTo(traj.footY, 6);
    expect(rigFor(layout8, pre).y).toBeCloseTo(rigFor(layout8, traj).y, 6);
    const n = pre.n;
    const stowed = hoistProfile(pre.frames[0], n, HOIST.stowed);
    for (let i = 0; i < 2 * n; i++) expect(pre.frames[1][i]).toBe(stowed[i]);
  });

  it('整台网格 = 二十条带（各取自己那一档）的网格拼起来', () => {
    const topo = bandTopology(traj.n);
    const one = bakeBand(traj, STEADY.formed, topo);
    const unit = bakeUnit(trajs, STEADY.formed, topo);
    expect(unit.a.length).toBe(one.a.length * SQUARE.COUNT);
    expect(unit.b.length).toBe(one.b.length * SQUARE.COUNT);
  });
});

describe('摆放与尺度', () => {
  const rig = rigFor(layout8, traj);

  it('方台的尺寸：峰值半边长 = 平面模型的平台半径（圆台的峰值包络成了方形的内切圆），终态边长约 0.5 m，邻台不相碰', () => {
    expect(SQUARE_SCALE).toBeCloseTo(ringOuter(RING.RADIUS_DEF) / squareHalfSide(SQUARE_PEAK), 12);
    const aPeak = (squareHalfSide(SQUARE_PEAK) * rig.s) / UNITS_PER_M;
    expect(aPeak).toBeCloseTo(layout8.platR, 9);
    const side = platformSide(rig);
    expect(side).toBeGreaterThan(0.45);
    expect(side).toBeLessThan(0.55);
    // 峰值时：面对面（格距方向）与角对角（对角方向）都还留着缝
    const facePeak = ((SQUARE.RADIUS + SQUARE_PEAK[0]) * Math.cos(Math.PI / 20) * rig.s) / UNITS_PER_M;
    const cornerPeak = ((SQUARE.RADIUS + SQUARE_PEAK[2]) * rig.s) / UNITS_PER_M;
    expect(2 * facePeak).toBeLessThan(layout8.pitchM);
    expect(2 * cornerPeak).toBeLessThan(layout8.pitchM * Math.SQRT2);
  });

  it('平面模型的方台（squarePlanLayout）与立体画的是同一个方形：每条带全落的长度 = 立体那条带的峰值挑出', () => {
    const sq = squarePlanLayout(layout8);
    expect(sq.platR).toBe(layout8.platR); // 内切圆 = 原来的平台圆，猫的落脚与台边照旧
    expect(sq.bandReach).toHaveLength(COHABIT.FACES.BANDS);
    for (let j = 0; j < UNIT_ORDER.length; j++) expect(sq.bandReach![j]).toBeCloseTo(((SQUARE.RADIUS + SQUARE_PEAK[UNIT_ORDER[j]]) * rig.s) / UNITS_PER_M, 9);
    expect(sq.reachMax).toBeCloseTo(Math.max(...sq.bandReach!), 12);
    expect(sq.reachMax! / layout8.platR).toBeCloseTo(Math.SQRT2, 2); // 角比内切圆远 √2 倍
  });

  it('钉住端停在离地 1.08 m（RIG_ANCHOR_Y），平台面在它之上不到 0.4 m', () => {
    expect(rig.y + rig.s * traj.footY).toBeCloseTo(RIG_ANCHOR_Y, 6);
    expect(rig.platformY).toBeLessThan(RIG_ANCHOR_Y);
    const aboveM = (RIG_ANCHOR_Y - rig.platformY) / UNITS_PER_M;
    expect(aboveM).toBeGreaterThan(0.05);
    expect(aboveM).toBeLessThan(0.4);
    expect((ROOM.FLOOR_Y - RIG_ANCHOR_Y) / UNITS_PER_M).toBeCloseTo(1.08, 1);
  });

  it('收起位：装置原点贴着天花方板下面，升降程度 0 → 1 从收起位插值到工位；收起的布束底在人头顶以上一大截', () => {
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

  it('立杆、天花方板、房间都是闭合网格；立杆下端按单元给（不传 = 全在工位，收起时只剩天花下一小截）', () => {
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
    expect(stowedFoot / UNITS_PER_M).toBeLessThan(0.3); // 收起时布束只在天花下不到 30 cm
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

  const band = platformBand(rig, trajs);
  const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

  it('猫能待的那一圈：内 = 芯外缘、外 = 二十个外缘点围成的多边形的内切圆（方形的四个角不算），猫身中线放在正中', () => {
    const core = (SQUARE.RADIUS * rig.s) / UNITS_PER_M;
    expect(band.rIn).toBeGreaterThan(core);
    expect(band.rIn).toBeLessThan(core + 0.01);
    expect(band.rOut).toBeLessThan(platformSide(rig) / 2 + 0.01); // 不出方形的边
    expect(band.rOut - band.rIn).toBeGreaterThan(0.14); // 与圆台时一样宽（16 cm 左右）——猫只能顺着这一圈待
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

  it.each(CAT_COATS)('台上的猫不穿杆、不悬空（Lab 2-15 方台的实际宽度；%s）：各种状态 × 八个朝向 × 芯心 / 台边，猫（含花纹、爪子）离芯轴都在芯外缘以外，贴台面的部分都在内切圆以内', (coat) => {
    const u = { x: 0, y: 0 };
    const clear = band.rIn + 0.005;
    const check = (pl: ReturnType<typeof catPlacement>, cores: { x: number; y: number }[], label: string): void => {
      const m = catMesh({ x: pl.x * UNITS_PER_M, z: pl.y * UNITS_PER_M, footY: 0, unit: UNITS_PER_M, yaw: figureYaw(pl.heading), pose: pl.pose, tail: pl.tail, bend: pl.bend, headYaw: pl.headTurn, coat });
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

describe('单元铺满整间房（cover: room，2026-10-27 作者「单元兼作桌子要再大、8×8 扩到全覆盖、数量不变」）', () => {
  const room = squarePlanLayout(planLayout(8, undefined, 'room'));
  const field = squarePlanLayout(layout8);
  const rig = rigFor(room, traj);
  const rigField = rigFor(field, traj);

  it('台子随格距放大约 1.37 倍（终态边长 0.62–0.75 m）；默认台面落在站着用的高度 1.05 m', () => {
    expect(rig.s / rigField.s).toBeCloseTo(room.pitchM / field.pitchM, 12);
    const side = platformSide(rig);
    expect(side / platformSide(rigField)).toBeCloseTo(room.pitchM / field.pitchM, 9);
    expect(side).toBeGreaterThan(0.62);
    expect(side).toBeLessThan(0.75);
    expect((ROOM.FLOOR_Y - rig.platformY) / UNITS_PER_M).toBeCloseTo(TABLE_TOP.stand, 9);
    expect(rig.y).toBeCloseTo(rigYForTop(rig, traj, TABLE_TOP.stand), 9);
  });

  it('当桌子的几个高度：最低那档（沙发前茶几）吊带下端不戳地，餐桌比餐椅座面高 0.27–0.30', () => {
    const hang = (rig.s * (traj.footY - traj.platformTopY)) / UNITS_PER_M; // 台面到吊带最下端
    for (const top of Object.values(TABLE_TOP)) {
      const foot = top - hang;
      expect(foot, `台面 ${top}`).toBeGreaterThan(0);
      const y = rigYForTop(rig, traj, top);
      expect(unitFootY(rig, traj.footY, 1, y)).toBeLessThan(ROOM.FLOOR_Y);
    }
    expect(TABLE_TOP.sofaFront - hang).toBeLessThan(0.02); // 已经是能落到的最低
    expect(TABLE_TOP.chair - FURN_ERGO.chair.seatH).toBeGreaterThanOrEqual(0.27);
    expect(TABLE_TOP.chair - FURN_ERGO.chair.seatH).toBeLessThanOrEqual(0.3);
  });

  it('当谁的桌子落多高：餐椅 → 餐桌，沙发 → 茶几；餐桌台底比座面高不到 0.18（腿进不去，所以台边按规则落在膝盖前）', () => {
    const sim = new CohabitSim({ trigger: 'posture', grid: COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed: 1 });
    const rects = sim.furn!.rects;
    expect(tableTopFor(rects.find((r) => r.kind === 'chair')!)).toBe(TABLE_TOP.chair);
    expect(tableTopFor(rects.find((r) => r.kind === 'sofa')!)).toBe(TABLE_TOP.sofaFront);
    // 台面厚 = 方台成形的箱高（Lab 2-7 方形环平档 SQUARE.H，剖面 px；剖面坐标 = px / 100）按装置比例换成米
    const thick = (rig.s * (SQUARE.H / 100) * SOLID.SCALE) / UNITS_PER_M;
    expect(thick).toBeGreaterThan(0.13);
    expect(thick).toBeLessThan(0.17);
    expect(TABLE_TOP.chair - thick - FURN_ERGO.chair.seatH).toBeLessThan(0.18);
  });

  it('64 台铺满四边：最外一圈的台面离墙不到半个格距，峰值时邻台面对面、角对角都还留缝，台子不出房间', () => {
    expect(rig.cells).toHaveLength(64);
    const half = (room.roomM / 2) * UNITS_PER_M;
    const facePeak = (SQUARE.RADIUS + SQUARE_PEAK[0]) * Math.cos(Math.PI / 20) * rig.s;
    const cornerPeak = (SQUARE.RADIUS + SQUARE_PEAK[2]) * rig.s;
    const maxX = Math.max(...rig.cells.map((c) => c.x));
    expect(half - (maxX + facePeak)).toBeGreaterThan(0);
    expect(half - (maxX + facePeak)).toBeLessThan((room.pitchM / 2) * UNITS_PER_M);
    expect(2 * facePeak).toBeLessThan(room.pitchM * UNITS_PER_M);
    expect(2 * cornerPeak).toBeLessThan(room.pitchM * Math.SQRT2 * UNITS_PER_M);
    // 场地布局四周各空着约 0.95 m，铺满后只剩台缝
    const maxXField = Math.max(...rigField.cells.map((c) => c.x));
    expect(half - (maxXField + facePeak * (rigField.s / rig.s))).toBeGreaterThan(0.9 * UNITS_PER_M);
  });

  it('收起的布束仍只在天花下一小截', () => {
    const stowedFoot = unitFootY(rig, traj.footY, 0);
    expect(stowedFoot / UNITS_PER_M).toBeLessThan(0.4);
    expect(rig.y).toBeGreaterThan(rig.stowY);
  });

  it('铺满时的标准布置：每个座位坐直与前倾都不插进家具，座位点在前缘后', () => {
    const sim = new CohabitSim({ trigger: 'posture', grid: COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed: 1 });
    const furn = sim.furn!;
    const boxes = furnitureBoxes(furn.rects);
    expect(sim.seats).toHaveLength(10);
    for (const seat of sim.seats) {
      const sp = seatSpecOf(furn.rects[seat.furn], seat);
      expect(sp.front).toBeGreaterThan(0.34);
      expect(sp.back).toBeGreaterThan(0.1);
      for (const b of boxes) expect(b.cy - b.hy).toBeGreaterThan(0);
    }
  });
});

describe('人体工学那套家具（2026-10-27）', () => {
  const sim = new CohabitSim({ trigger: 'posture', grid: COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed: 1 });
  const rects = sim.furn!.rects;
  it('座面高 / 座深 / 扶手之间 / 靠背高落在资料给的范围里', () => {
    const sofa = rects.find((r) => r.kind === 'sofa')!;
    const chair = rects.find((r) => r.kind === 'chair')!;
    expect(sofa.ergo && chair.ergo).toBe(true);
    const E = FURN_ERGO;
    expect(E.sofa.seatH).toBeGreaterThanOrEqual(0.37); // QB/T 1952.1 座前高 0.37–0.48
    expect(E.sofa.seatH).toBeLessThanOrEqual(0.48);
    const sofaD = sofa.y1 - sofa.y0;
    expect(sofaD - E.sofa.backT).toBeGreaterThanOrEqual(0.48); // 座深 0.48–0.60
    expect(sofaD - E.sofa.backT).toBeLessThanOrEqual(0.6);
    expect(sofa.x1 - sofa.x0 - 2 * E.sofa.armW).toBeGreaterThanOrEqual(0.96); // 双人座前宽 ≥ 0.96
    expect(E.chair.seatH).toBeGreaterThanOrEqual(0.43); // 餐椅 0.43–0.46
    expect(E.chair.seatH).toBeLessThanOrEqual(0.46);
    expect(chair.y1 - chair.y0 - E.chair.backT).toBeLessThan(0.5);
  });
  it('沙发五块、椅子六块（四腿 + 座板 + 靠背），都在家具占位里、离地不穿地', () => {
    for (const r of rects) {
      const bs = furnitureBoxes([r]);
      expect(bs).toHaveLength(r.kind === 'sofa' ? 5 : 6);
      for (const b of bs) {
        expect((b.cx - b.hx) / UNITS_PER_M).toBeGreaterThanOrEqual(r.x0 - 1e-9);
        expect((b.cx + b.hx) / UNITS_PER_M).toBeLessThanOrEqual(r.x1 + 1e-9);
        expect((b.cz - b.hz) / UNITS_PER_M).toBeGreaterThanOrEqual(r.y0 - 1e-9);
        expect((b.cz + b.hz) / UNITS_PER_M).toBeLessThanOrEqual(r.y1 + 1e-9);
        expect(b.cy + b.hy).toBeLessThanOrEqual(ROOM.FLOOR_Y + 1e-9);
      }
    }
  });
});

describe('坐着的人与家具', () => {
  it.each([
    ['场地布局（旧尺寸，2-14）', 'field'],
    ['铺满整间房（人体工学尺寸，2-15）', 'room'],
  ] as const)('%s：标准布置的每个座位、坐直与前倾、台架那十二套穿着：小人（含裙摆、外套下摆、卫衣帽子、长发、帽子）不插进任何一块家具，臀贴座面，脚踩地', (_, cover) => {
    const sim = new CohabitSim({ trigger: 'posture', grid: COHABIT.SEATS.GRID, space: 'live', seed: 1, cover, ...(cover === 'room' ? { unit: 'square' as const } : {}) });
    const furn = sim.furn;
    expect(furn).not.toBeNull();
    if (!furn) return;
    const boxes = furnitureBoxes(furn.rects);
    const tol = 1e-3;
    expect(sim.seats.length).toBeGreaterThanOrEqual(10);
    for (const seat of sim.seats) {
      const s = seatSpecOf(furn.rects[seat.furn], seat);
      expect(s.front).toBeGreaterThan(cover === 'room' ? 0.34 : 0.45); // 座位点在前缘后 0.35–0.5 m（餐椅座深 0.42）
      expect(s.back).toBeGreaterThan(0.1);
      for (const lean of [false, true])
        for (const style of OUTFITS.map((o): HumanStyle => o.style)) {
          const m = figureMesh({
            style,
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
              if (inside) expect.fail(`座位 ${seat.i}${lean ? ' 前倾' : ''} 插进家具（${styleKeyOf(style)}）`);
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
