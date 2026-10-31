import { describe, expect, it } from 'vitest';
import { DUAL, DUAL_STOWED, SHELTER, UNIT_DUAL_DEFS, UNIT_DUAL_OPTS, dualUnitSpec, membraneIndexAt, shelterBands, shelterClear, shelterToward, unitFormPlan, UNIT_FORM_ODDS, BRIDGE_BASE, DOOR_BASE, DOOR_EPS, FRAMES, SHELL, bakeUnitShell, shellCoverVerts, shellGoreVerts, shellJoins, bandVertsAt, bakeBandKeys, bakeHanger, bakeUnitKeys, bakeUnitMech, FURN_ERGO, HOIST, STEADY, TABLE_TOP, bandTop, clipToReel, doorFrame, isDoorFrame, pickUnitBands, rigYForTop, tableTopFor, bandCursors, bandPaths, membraneIndex, membraneJoins, resetBandCursors, stepBandCursor, TrajectoryBaker, UNITS_PER_M, UNIT_BAND, UNIT_CUT, UNIT_ORDER, UNIT_SHAPE, UNIT_STORED, UNIT_TIERS, UnitBaker, bakeBand, bakeMembrane, bakeUnit, bakeUnitSkin, bandFrame, bandTopology, catPlacement, figureYaw, furnitureBoxes, hoistProfile, platesMesh, platformBand, platformSide, postsMesh, rigFor, roomMesh, seatSpecOf, unitDrop, unitFootY, unitTopY } from './cohabit-solid';
import type { BandTrajectory } from './cohabit-solid';
import { planLayout } from './unit-activation';
import { FIGURE, RIG_ANCHOR_Y, ROOM, ringOuter } from './skin-grid';
import { RING } from './skin-ring';
import { SOLID, offsetProfile } from './skin-solid';
import { CLAMP_SPAN, MECH, clampRadii } from './unit-mechanism';
import { SQUARE, SQUARE_PEAK, SQUARE_REACH, SQUARE_TIERS, buildSquareUnits, squareHalfSide, squareRadiusAt, squareStructureAt } from './skin-square';
import { CYCLE_BAND } from './skin-cycle';
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
    expect(traj.frames).toHaveLength(FRAMES.form + FRAMES.retract + FRAMES.hoist + FRAMES.bridge + FRAMES.door);
    for (const f of traj.frames) expect(f.length).toBe(2 * traj.n);
  });

  it('钉住端在正向与回程里全程不动（注册在底端），平台顶面在钉住端之上', () => {
    const n = traj.n;
    for (const f of traj.frames.slice(0, FRAMES.form + FRAMES.retract)) expect(-f[2 * n - 1] * 100).toBeCloseTo(traj.footY, 3);
    expect(traj.platformTopY).toBeLessThan(traj.footY);
    expect(traj.platformTopY).toBeGreaterThan(0);
  });

  it('三档（面 / 边 / 角）：同一条带长、钉住端一样高、平台面一样高，挑出与 Lab 2-7 方形环的方台一样大', () => {
    expect(trajs).toHaveLength(3);
    expect(UNIT_TIERS.map((d) => d.en)).toEqual(['face', 'edge', 'corner']);
    for (const [t, tr] of trajs.entries()) {
      expect(tr.n).toBe(traj.n);
      expect(tr.footY).toBeCloseTo(traj.footY, 6); // 注册在底端，三档初始摆位相同（角档的段落分法不同，末位舍入差 1e-13）
      // 平台面一样高（px）。结构贴底时靠尾段配平：尾段按整节给（一节 2 px），面档要补 7.5 节只能给 8，差半节 ≈ 1 px
      expect(Math.abs(tr.platformTopY - traj.platformTopY)).toBeLessThan(1.5);
      // 6.5 cm 的台面按方形重新标定了三档键（UNIT_SHAPE.k）：外缘点离理想正方形不到 1 px（原方台的边档也差 0.9）
      expect(Math.abs(tr.reach - squareRadiusAt(((9 + 18 * t) * Math.PI) / 180, squareHalfSide(SQUARE_REACH)))).toBeLessThan(1);
    }
    // 二十条带：面 8 / 边 8 / 角 4，角档正对 45°
    expect(UNIT_ORDER.filter((t) => t === 0)).toHaveLength(8);
    expect(UNIT_ORDER.filter((t) => t === 1)).toHaveLength(8);
    expect(UNIT_ORDER.filter((t) => t === 2)).toHaveLength(4);
    for (let j = 0; j < UNIT_ORDER.length; j++) if (UNIT_ORDER[j] === 2) expect(Math.abs(Math.sin(2 * bandAngle(j)))).toBeCloseTo(1, 9);
  });

  it('台面 6.5 cm · 结构贴底 · 布按最长的预裁 338 节：平台只铺出去用得到的那段；成形的形状与同一组键排成七段谱时逐点相同，台底下那截布短一大截', () => {
    expect(UNIT_CUT).toBe(CYCLE_BAND);
    expect(traj.n).toBe(UNIT_BAND);
    expect(UNIT_BAND).toBe(168);
    expect(UNIT_STORED).toBe(UNIT_CUT - UNIT_BAND);
    // 最上面那段贴合只留到下限：最短的那档（面档）lead = LEAD_MIN
    expect(Math.min(...UNIT_TIERS.map((d) => d.spec[0][1]))).toBe(SQUARE.LEAD_MIN);
    const tiers = SQUARE_TIERS.map((t, i) => ({ ...t, k: UNIT_SHAPE.k[i] }));
    const longDef = buildSquareUnits(tiers, 202, { h: UNIT_SHAPE.h, tail: UNIT_SHAPE.tail })[0]; // 同一组键，七段谱（垫上下各一半）
    const long = new TrajectoryBaker(longDef).runAll();
    expect(long.n).toBe(202);
    const a = traj.frames[STEADY.formed];
    const b = long.frames[STEADY.formed];
    const na = traj.n;
    const nb = long.n;
    const sa = squareStructureAt(UNIT_TIERS[0].spec)!;
    const sb = squareStructureAt(longDef.spec)!;
    expect(sa.fs).toBe(sb.fs);
    const c = (sa.fs - 1) / 2;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < sa.fs; i++) {
      dx = Math.max(dx, Math.abs(a[sa.start + i] - b[sb.start + i]));
      dy = Math.max(dy, Math.abs(a[na + sa.start + i] - a[na + sa.start + c] - (b[nb + sb.start + i] - b[nb + sb.start + c])));
    }
    expect(dx * 100).toBeLessThan(0.3); // px：结构段一节没动，形状与锁定照旧
    expect(dy * 100).toBeLessThan(0.3);
    expect(Math.abs(long.reach - traj.reach)).toBeLessThan(0.05);
    // 台底离钉住端（px）：七段谱 ≈ 71（隔离贴合 16 + 垫 + 尾都挂在结构底下），结构贴底 ≈ 40（只剩结构自己的下侧缓冲 + 短尾）
    const bottomAbove = (f: Float64Array, n: number, reach: number): number => {
      let bot = Infinity;
      for (let i = 0; i < n; i++) if (f[i] > reach * 0.5) bot = Math.min(bot, f[n + i]);
      return (bot - f[2 * n - 1]) * 100;
    };
    expect(bottomAbove(b, nb, Math.max(...b.subarray(0, nb)))).toBeGreaterThan(65);
    for (const tr of trajs) {
      const f = tr.frames[STEADY.formed];
      expect(bottomAbove(f, tr.n, Math.max(...f.subarray(0, tr.n)))).toBeLessThan(42);
    }
  }, 30_000);

  it('6.5 cm 的台面成形途中不鼓出原方台的峰值：平面模型按 SQUARE_PEAK 算碰人，照旧够用', () => {
    for (const [t, tr] of trajs.entries()) {
      let peak = 0;
      for (const f of tr.frames.slice(0, FRAMES.form)) for (let i = 0; i < tr.n; i++) peak = Math.max(peak, f[i] * 100);
      expect(peak, `档 ${t}`).toBeLessThanOrEqual(SQUARE_PEAK[t]);
    }
  });

  it('膜按结构中心对位：三档结构中心序号不同（结构贴底），台面附近膜的两边一样高；中心相同时就是按序号配对', () => {
    expect(new Set(trajs.map((t) => t.mid)).size).toBe(3);
    const n = traj.n;
    for (let i = 0; i < n; i += 7) expect(membraneIndex(i, n, 100, 100, 40)).toBe(i);
    for (const [ta, tb] of [[0, 2], [2, 0], [0, 1], [1, 2]] as const) {
      const A = trajs[ta], B = trajs[tb];
      const w = Math.min(A.midHalf, B.midHalf);
      // 端点钉住、单调
      expect(membraneIndex(0, n, A.mid, B.mid, w)).toBeCloseTo(0, 9);
      expect(membraneIndex(n - 1, n, A.mid, B.mid, w)).toBeCloseTo(n - 1, 9);
      for (let i = 1; i < n; i++) expect(membraneIndex(i, n, A.mid, B.mid, w)).toBeGreaterThan(membraneIndex(i - 1, n, A.mid, B.mid, w));
      // 成形后：两档结构中心两侧 30 节内（台面那一段）膜两边的高度差 < 3 px；按同一序号配对会差到半个箱高以上
      const fa = A.frames[STEADY.formed], fb = B.frames[STEADY.formed];
      let d = 0;
      for (let k = -30; k <= 30; k++) d = Math.max(d, Math.abs(fa[n + A.mid + k] - fb[n + B.mid + k]) * 100);
      // 6.5 cm 台面实测 2.6 px，其中 1.2 px 是三档台面本身的高差（尾段只能按整节给）；箱高 36 时 < 2
      expect(d).toBeLessThan(3);
    }
  });

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
    expect(STEADY.stowed).toBe(traj.frames.length - FRAMES.hoist - FRAMES.bridge - FRAMES.door);
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
    // 2026-10-30：让路的带两侧都不拉膜（那里是门）
    expect(membraneJoins(STEADY.formed, STEADY.formed, FRAMES, true, false)).toBe(false);
    expect(membraneJoins(DOOR_BASE + 3, STEADY.formed)).toBe(false);
  });

  describe('机构件与键（2026-10-30 网页模型细化：Blender 里的夹环、伸缩吊杆与芯、键座与撑杆搬进 Lab 2-15）', () => {
    it('每一帧记下哪几颗键扣着：成形态全扣、直带子全松、收起态（压成一团）不画键、让路收到底全松；键座都朝对面', () => {
      for (const t of trajs) {
        expect(t.locks).toHaveLength(t.frames.length);
        const nb = t.bonds.length / 2;
        expect(nb).toBe(10); // 方箱十档梯挡
        expect(t.sides).toHaveLength(t.bonds.length);
        expect([...(t.locks[STEADY.formed] as Uint8Array)].every((v) => v === 1)).toBe(true);
        expect([...(t.locks[STEADY.straight] as Uint8Array)].every((v) => v === 0)).toBe(true);
        expect(t.locks[STEADY.stowed]).toBeNull();
        expect([...(t.locks[doorFrame(t, 1)] as Uint8Array)].every((v) => v === 0)).toBe(true);
        // 键座朝对面：成形态里每颗键两端的键座朝着彼此（法向 × 侧 · 指向对方 > 0）
        const f = t.frames[STEADY.formed];
        for (let b = 0; b < t.bonds.length; b += 2) {
          const i = t.bonds[b], j = t.bonds[b + 1];
          const dx = f[j] - f[i], dy = -(f[t.n + j] - f[t.n + i]);
          const ti = [f[Math.min(t.n - 1, i + 1)] - f[i - 1], -(f[t.n + Math.min(t.n - 1, i + 1)] - f[t.n + i - 1])];
          expect(t.sides[b] * (-ti[1] * dx + ti[0] * dy)).toBeGreaterThan(0);
        }
      }
    });

    it('整台的键：成形态有扣着的内杆，直带子只有键座与外套，收起态与升降帧没有键', () => {
      const formed = bakeUnitKeys(trajs, STEADY.formed);
      const straight = bakeUnitKeys(trajs, STEADY.straight);
      expect(formed.rod.length).toBeGreaterThan(0);
      expect(formed.pad.length).toBeGreaterThan(0);
      expect(straight.rod.length).toBe(0);
      expect(straight.pad.length).toBeGreaterThan(formed.pad.length); // 没扣的多一截外套
      const stowed = bakeBandKeys(traj, STEADY.stowed);
      expect(stowed.pad.length + stowed.rod.length).toBe(0);
    });

    it('夹环跟着带子：上夹环的压圈在带顶上方、下夹环的端盖在钉住端下方，芯在两者之间；吊杆竖向归一化', () => {
      const n = traj.n;
      for (const k of [STEADY.formed, STEADY.straight, STEADY.stowed, doorFrame(traj, 1)]) {
        const m = bakeUnitMech(traj, k);
        let ya = Infinity, yb = -Infinity;
        for (let q = 1; q < m.dark.length; q += 6) {
          ya = Math.min(ya, m.dark[q]);
          yb = Math.max(yb, m.dark[q]);
        }
        const f = traj.frames[k];
        expect(ya).toBeLessThan(-f[n] * 100); // 带顶（y 向下 = −py × 100）之上
        expect(yb).toBeGreaterThan(-f[2 * n - 1] * 100); // 钉住端之下
        expect(m.alu.length).toBeGreaterThan(0);
      }
      const h = bakeHanger();
      let ya = Infinity, yb = -Infinity;
      for (let q = 1; q < h.length; q += 6) {
        ya = Math.min(ya, h[q]);
        yb = Math.max(yb, h[q]);
      }
      expect(ya).toBe(0);
      expect(yb).toBeCloseTo(1, 6);
    });
  });

  describe('让路的带（2026-10-30 修「收起来的条碎在上面、和下面成形的接不上」）', () => {
    const paths = trajs.map((t) => bandPaths(t));
    const n = traj.n;
    const B = UNIT_ORDER.length;
    const foot = (f: Float64Array): number => f[2 * n - 1];
    /** 一台单元走 steps 帧：每帧程度 deg、收回量 open(j)；返回最后一帧每条带（按上夹环截过）的剖面 */
    const run = (deg: (t: number) => number, open: (t: number, j: number) => number, steps: number) => {
      const cursors = bandCursors(B);
      const frameOf = new Int32Array(B);
      const o = new Float32Array(B);
      let reel = -1;
      for (let t = 0; t < steps; t++) {
        for (let j = 0; j < B; j++) o[j] = open(t, j);
        reel = pickUnitBands(0, deg(t), o, trajs, paths, cursors, frameOf);
      }
      const reelPy = bandTop(trajs[0], reel);
      const shapes = Array.from(frameOf, (k, j) => clipToReel(trajs[UNIT_ORDER[j]].frames[k], n, reelPy));
      return { frameOf, reel, reelPy, shapes, o };
    };

    it('让路段：从成形态 fork 出来的收直回程——第 0 帧 = 成形态，收到底平贴芯（三档挑出 < 0.5 px），钉住端不动，顶端只往上走', () => {
      for (const t of trajs) {
        expect(t.doorActive).toBeGreaterThan(FRAMES.door / 2);
        const f0 = t.frames[DOOR_BASE];
        const formed = t.frames[STEADY.formed];
        for (let i = 0; i < 2 * n; i++) expect(f0[i]).toBe(formed[i]);
        const end = t.frames[doorFrame(t, 1)];
        expect(Math.max(...end.subarray(0, n)) * 100).toBeLessThan(0.5);
        let prevTop = -Infinity;
        for (let k = 0; k <= t.doorActive; k++) {
          const f = t.frames[DOOR_BASE + k];
          expect(Math.abs(foot(f) - foot(formed))).toBeLessThan(1e-9);
          expect(bandTop(t, DOOR_BASE + k)).toBeGreaterThanOrEqual(prevTop - 1e-9);
          prevTop = bandTop(t, DOOR_BASE + k);
        }
        expect(isDoorFrame(DOOR_BASE)).toBe(true);
        expect(isDoorFrame(DOOR_BASE - 1)).toBe(false);
      }
      // 同一帧号三档顶端一样高（三档的贴合与自由节数总量相同）：上夹环只有一个高度
      for (let k = 0; k < traj.frames.length; k++) for (const t of trajs) expect(Math.abs(bandTop(t, k) - bandTop(traj, k))).toBeLessThan(1e-9);
    });

    it('成形到底的单元里，收回到底的带上接上夹环、下接钉住端，平贴在芯上；没收的带一帧不动', () => {
      const door = new Set([3, 4, 13, 14]); // 相对的两个面
      const { frameOf, reel, reelPy, shapes } = run(() => 1, (_t, j) => (door.has(j) ? 1 : 0), 4);
      expect(reel).toBe(STEADY.formed);
      const formed = traj.frames[STEADY.formed];
      for (let j = 0; j < B; j++) {
        const f = shapes[j];
        expect(Math.abs(foot(f) - foot(formed))).toBeLessThan(1e-9); // 下端还在钉住端
        expect(Math.abs(f[n] - reelPy)).toBeLessThan(0.02); // 上端在上夹环（收进去的那截压在夹环上方不到 2 px）
        let top = -Infinity;
        for (let i = 0; i < n; i++) top = Math.max(top, f[n + i]);
        expect(top).toBeLessThan(reelPy + 0.02);
        if (door.has(j)) {
          expect(isDoorFrame(frameOf[j])).toBe(true);
          expect(Math.max(...f.subarray(0, n)) * 100).toBeLessThan(1); // 平贴芯
        } else expect(frameOf[j]).toBe(STEADY.formed);
      }
    });

    it('任何时刻、任何收回量：一台单元的每条带都上接同一个上夹环、下接同一个钉住端（不再有漂在半空的一截）', () => {
      // 收回量随时间涨落（开门、关门、半开），程度也在升降段与成形段之间来回
      const deg = (t: number): number => Math.min(1, Math.max(0, t < 60 ? t / 40 : t < 140 ? 1 : 1 - (t - 140) / 60));
      const open = (t: number, j: number): number => (j % 5 === 2 ? Math.max(0, Math.sin((t + j) / 9)) : 0);
      for (const steps of [25, 50, 70, 90, 110, 130, 150, 170, 190]) {
        const { shapes, reelPy } = run(deg, open, steps);
        const f0 = foot(shapes[0]);
        for (let j = 0; j < B; j++) {
          const f = shapes[j];
          expect(Math.abs(foot(f) - f0), `第 ${steps} 帧带 ${j} 的下端`).toBeLessThan(1e-9);
          let top = -Infinity;
          for (let i = 0; i < n; i++) top = Math.max(top, f[n + i]);
          expect(top, `第 ${steps} 帧带 ${j} 的上端`).toBeLessThan(reelPy + 0.02);
          expect(top).toBeGreaterThan(reelPy - 1e-9);
        }
      }
    });

    it('升降段（程度 < dropAt）收回不起作用：整台一起走；成形到一半时收回的带只退到直带子，不进升降帧', () => {
      const D = HOIST.dropAt;
      const a = run(() => D * 0.6, (_t, j) => (j < 5 ? 1 : 0), 3);
      expect(new Set(a.frameOf).size).toBe(1);
      const b = run((t) => Math.min(0.8, D + t * 0.02), (_t, j) => (j < 5 ? 1 : 0), 40);
      for (let j = 0; j < 5; j++) {
        const k = b.frameOf[j];
        expect(k < STEADY.stowed || k >= BRIDGE_BASE).toBe(true); // 不是升降帧
        expect(isDoorFrame(k)).toBe(false);
      }
      expect(DOOR_EPS).toBeGreaterThan(0);
    });
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

describe('蒙皮（2026-10-30 作者「设计一个真正的蒙皮作为单元的外表面，可以开可以关」）', () => {
  const n = traj.n;
  const D = SQUARE.DEPTH;
  const off = SQUARE.THICK / 2 + SHELL.GAP;

  it('剖面朝外偏：贴芯的竖直段往离轴方向偏，台面往上偏（世界 Y 向下为正）', () => {
    const m = 9;
    const px = new Float64Array(m);
    const py = new Float64Array(m);
    for (let i = 0; i < m; i++) py[i] = -i * 0.02; // 一条贴芯往下走的带
    const o = offsetProfile(px, py, m, 30, 100, 2);
    for (let i = 0; i < m; i++) {
      expect(o[i]).toBeCloseTo(32, 9);
      expect(o[m + i]).toBeCloseTo(i * 2, 9);
    }
    const hx = new Float64Array(m);
    const hy = new Float64Array(m);
    for (let i = 0; i < m; i++) hx[i] = i * 0.02; // 一段往外走的台面
    const h = offsetProfile(hx, hy, m, 30, 100, 2);
    for (let i = 0; i < m; i++) {
      expect(h[i]).toBeCloseTo(30 + i * 2, 9);
      expect(h[m + i]).toBeCloseTo(-2, 9);
    }
  });

  it('皮包住带子、不穿进带子：三档、成形 / 直带子 / 收起三个静止态，带子两面的每个顶点离盖片都还隔着一段', () => {
    const topo = bandTopology(n);
    for (const t of trajs)
      for (const k of [STEADY.formed, STEADY.straight, STEADY.stowed]) {
        const c = shellCoverVerts(t, k);
        const m = c.verts.length / 6;
        const v = bandVertsAt(t, k, topo);
        let minD = Infinity;
        for (const side of [0, 2])
          for (let i = SHELL.END; i < n - SHELL.END; i++) {
            const px = v[(side * n + i) * 3];
            const py = v[(side * n + i) * 3 + 1];
            for (let q = 0; q < m - 1; q++) {
              const ax = c.verts[q * 3], ay = c.verts[q * 3 + 1];
              const vx = c.verts[(q + 1) * 3] - ax, vy = c.verts[(q + 1) * 3 + 1] - ay;
              const u = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
              minD = Math.min(minD, Math.hypot(px - ax - u * vx, py - ay - u * vy));
            }
          }
        // 6.5 cm 台面折得更紧，实测最小 0.04 装置单位（房间尺度约 0.2 mm）；箱高 36 时 > 0.08
        expect(minD).toBeGreaterThan(0.03);
      }
  });

  it('两头塞进夹环：贴芯处外皮在带面之外、夹圈内壁之内，端点落在上下夹圈的竖向范围里', () => {
    const r = clampRadii(SQUARE.RADIUS, SQUARE.THICK);
    for (const t of trajs) {
      const f = t.frames[STEADY.straight];
      const c = shellCoverVerts(t, STEADY.straight);
      const m = c.verts.length / 6;
      const y0 = -f[n] * SOLID.SCALE; // 带顶
      const y1 = -f[2 * n - 1] * SOLID.SCALE; // 钉住端
      for (const q of [0, m - 1]) {
        const x = c.verts[q * 3];
        expect(x).toBeGreaterThan(SQUARE.RADIUS + SQUARE.THICK / 2);
        expect(x).toBeLessThan(r.outerIn);
        expect(x).toBeCloseTo(SQUARE.RADIUS + off, 1);
      }
      expect(c.verts[1]).toBeGreaterThan(y0 - MECH.TOP);
      expect(c.verts[1]).toBeLessThan(y0 + CLAMP_SPAN + MECH.LIP);
      expect(c.verts[(m - 1) * 3 + 1]).toBeLessThan(y1 + MECH.TOP);
      expect(c.verts[(m - 1) * 3 + 1]).toBeGreaterThan(y1 - CLAMP_SPAN - MECH.LIP);
    }
  });

  it('接缝片只跨缝：A 边 = 本条带盖片的前剖口、B 边 = 下一条带盖片的后剖口（转过一个角节距），首尾相接一圈闭合', () => {
    const dT = (2 * Math.PI) / SQUARE.COUNT;
    for (const k of [STEADY.formed, STEADY.straight]) {
      const a = trajs[UNIT_ORDER[0]];
      const b = trajs[UNIT_ORDER[1]];
      const ca = shellCoverVerts(a, k);
      const cb = shellCoverVerts(b, k);
      const g = shellGoreVerts(a, k, b, k);
      const m = g.verts.length / 6;
      expect(ca.verts.length / 6).toBe(m);
      const c = Math.cos(dT), s = Math.sin(dT);
      for (let i = 0; i < m; i++) {
        // A 边 = 盖片 A 的前剖口（z = +D/2）
        expect(g.verts[i * 3 + 2]).toBeCloseTo(D / 2, 4);
        expect(g.verts[i * 3]).toBeCloseTo(ca.verts[i * 3], 4);
        expect(g.verts[i * 3 + 1]).toBeCloseTo(ca.verts[i * 3 + 1], 4);
        // 带 a、b 同一档时 B 边 = 盖片 b 的后剖口转过 dT
        if (UNIT_ORDER[0] === UNIT_ORDER[1]) {
          const bx = cb.verts[(m + i) * 3], bz = cb.verts[(m + i) * 3 + 2];
          expect(g.verts[(m + i) * 3]).toBeCloseTo(bx * c - bz * s, 3);
          expect(g.verts[(m + i) * 3 + 2]).toBeCloseTo(bx * s + bz * c, 3);
        }
        const angA = Math.atan2(g.verts[i * 3 + 2], g.verts[i * 3]);
        const angB = Math.atan2(g.verts[(m + i) * 3 + 2], g.verts[(m + i) * 3]);
        expect(angA).toBeGreaterThan(0);
        expect(angB).toBeLessThan(dT);
        expect(angB).toBeGreaterThan(angA);
      }
    }
    // 整台：二十片盖片 + 二十片接缝片，每片 (节数 − 2·END − 1) 个四边形
    const u = bakeUnitShell(trajs, STEADY.formed);
    const quads = n - 2 * SHELL.END - 1;
    expect(u.cover.length / 18).toBe(SQUARE.COUNT * quads * 2);
    expect(u.gore.length / 18).toBe(SQUARE.COUNT * quads * 2);
  });

  it('接缝片只在门的边上张开：一侧让路一侧没让 = 开；两侧都在让路或都没让 = 连；升降段与成形段之间不连', () => {
    const d = doorFrame(traj, 0.5);
    expect(shellJoins(STEADY.formed, STEADY.formed)).toBe(true);
    expect(shellJoins(STEADY.formed, d)).toBe(false);
    expect(shellJoins(STEADY.formed, STEADY.formed, FRAMES, true, false)).toBe(false);
    expect(shellJoins(d, d, FRAMES, true, true)).toBe(true);
    expect(shellJoins(STEADY.formed, STEADY.formed, FRAMES, true, true)).toBe(true);
    expect(shellJoins(STEADY.stowed, STEADY.formed)).toBe(false);
    expect(shellJoins(STEADY.stowed, STEADY.stowed)).toBe(true);
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

  it('当桌子的几个高度：茶几在资料的 0.40–0.45 之内、吊带下端离地还有一截，餐桌比餐椅座面高 0.27–0.30', () => {
    const hang = (rig.s * (traj.footY - traj.platformTopY)) / UNITS_PER_M; // 台面到吊带最下端
    for (const top of Object.values(TABLE_TOP)) {
      const foot = top - hang;
      expect(foot, `台面 ${top}`).toBeGreaterThan(0.1);
      const y = rigYForTop(rig, traj, top);
      expect(unitFootY(rig, traj.footY, 1, y)).toBeLessThan(ROOM.FLOOR_Y);
    }
    // 台面到吊带最下端：台厚 0.15 m · 七段谱时 0.48 m（茶几只能落到 0.49）；6.5 cm 台面 · 结构贴底后约 0.23 m
    expect(hang).toBeLessThan(0.25);
    expect(TABLE_TOP.sofaFront).toBeGreaterThanOrEqual(0.4);
    expect(TABLE_TOP.sofaFront).toBeLessThanOrEqual(0.45);
    expect(TABLE_TOP.sofaFront).toBeLessThanOrEqual(FURN_ERGO.sofa.seatH); // 与座面齐或略低
    expect(TABLE_TOP.chair - FURN_ERGO.chair.seatH).toBeGreaterThanOrEqual(0.27);
    expect(TABLE_TOP.chair - FURN_ERGO.chair.seatH).toBeLessThanOrEqual(0.3);
  });

  it('当谁的桌子落多高：餐椅 → 餐桌，沙发 → 茶几；台面 6.5 cm 厚，餐桌台底比座面高 0.22（腿伸得进）', () => {
    const sim = new CohabitSim({ trigger: 'posture', grid: COHABIT.SEATS.GRID, unit: 'square', cover: 'room', space: 'live', seed: 1 });
    const rects = sim.furn!.rects;
    expect(tableTopFor(rects.find((r) => r.kind === 'chair')!)).toBe(TABLE_TOP.chair);
    expect(tableTopFor(rects.find((r) => r.kind === 'sofa')!)).toBe(TABLE_TOP.sofaFront);
    // 台面厚 = 方台成形的箱高（UNIT_SHAPE.h，剖面 px；剖面坐标 = px / 100）按装置比例换成米
    const thick = (rig.s * (UNIT_SHAPE.h / 100) * SOLID.SCALE) / UNITS_PER_M;
    expect(thick).toBeGreaterThan(0.06);
    expect(thick).toBeLessThan(0.075);
    // 座面到桌底要 0.18–0.20（家具购买指南），坐姿大腿厚男性 P95 约 0.15（GB/T 10000）
    expect(TABLE_TOP.chair - thick - FURN_ERGO.chair.seatH).toBeGreaterThan(0.2);
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

describe('按用途定形：有顶的一台（2026-10-30，形态方案 §11）', () => {
  it('两个结构的谱：338 节全部铺出去、下台贴底（尾与平台同一个），两块之间贴合 ≥ 29、离两块结构各 ≥ 16；三档自由与贴合总量相同', () => {
    expect(DUAL.mid).toBeGreaterThanOrEqual(29);
    const totals = new Set<string>();
    UNIT_SHAPE.k.forEach((k, t) => {
      for (const [up, lo] of [[true, true], [false, true]] as const) {
        const d = dualUnitSpec(k, up, lo);
        expect(d.spec.reduce((a, s) => a + s[1], 0)).toBe(UNIT_CUT);
        expect(d.a0).toBeLessThan(d.b0);
        expect(d.spec[0][0]).toBe('g');
        expect(d.spec[0][1]).toBeGreaterThanOrEqual(SQUARE.LEAD_MIN);
        const keyed = d.spec.filter((s) => s[0] === 'f' && s[2] && s[2].length);
        expect(keyed).toHaveLength(up ? 2 : 1);
        // 下台贴底：下台之后只剩尾，尾与平台那一档同长
        const last = d.spec[d.spec.length - 1];
        expect(d.b0 + d.fs + last[1]).toBe(UNIT_CUT);
        expect(last).toEqual(UNIT_TIERS[t].spec[UNIT_TIERS[t].spec.length - 1]);
        // 两块之间：贴合总量 ≥ 29，离上台结尾、下台开头各至少一段 ISO 贴合
        let at = 0;
        let glued = 0;
        const between: [string, number][] = [];
        for (const s of d.spec) {
          if (at >= d.a0 + d.fs && at < d.b0) {
            between.push([s[0], s[1]]);
            if (s[0] === 'g') glued += s[1];
          }
          at += s[1];
        }
        expect(glued).toBeGreaterThanOrEqual(29);
        expect(between[0][0]).toBe('g');
        expect(between[0][1]).toBeGreaterThanOrEqual(SQUARE.ISO);
        expect(between[between.length - 1][0]).toBe('g');
        expect(between[between.length - 1][1]).toBeGreaterThanOrEqual(SQUARE.ISO);
        const free = d.spec.filter((s) => s[0] === 'f').reduce((a, s) => a + s[1], 0);
        totals.add(`${free}`);
      }
    });
    expect(totals.size).toBe(1); // 芯一样长 ⇒ 一台二十条带带顶同高，共用一个上夹环
    expect(UNIT_DUAL_DEFS).toHaveLength(6);
    expect(new Set(UNIT_DUAL_DEFS.map((d) => d.key)).size).toBe(6);
    expect(UNIT_DUAL_OPTS).toHaveLength(6);
  });

  it(
    '烘出来：下台离钉住端与平台一样高，上台三档同高、两块之间约 0.52 m；只成下台时下台形状逐点相同、上台那段贴着芯；收起那团与平台一样长；带顶同高',
    () => {
      // 面档与角档（差得最多的两档）各烘「两块都成」与「只成下台」
      const pick = [0, 2, 3, 5];
      const [face, corner, faceLo, cornerLo] = new UnitBaker(
        pick.map((i) => UNIT_DUAL_DEFS[i]),
        FRAMES,
        pick.map((i) => UNIT_DUAL_OPTS[i]),
      ).runAll();
      const flat = trajs;
      const rig = rigFor(squarePlanLayout(planLayout(COHABIT.SEATS.GRID, RING.RADIUS_DEF, 'room')), flat[0]);
      const m = (px: number): number => (px * SOLID.SCALE * rig.s) / UNITS_PER_M;
      const F = FRAMES.form - 1;
      const n = UNIT_CUT;
      for (const tr of [face, corner, faceLo, cornerLo]) expect(tr.n).toBe(n);
      // 下台台面离钉住端：与平台同一档逐档相同（±0.3 装置单位）
      expect(Math.abs(face.footY - face.platformTopY - (flat[0].footY - flat[0].platformTopY))).toBeLessThan(0.3);
      expect(Math.abs(corner.footY - corner.platformTopY - (flat[2].footY - flat[2].platformTopY))).toBeLessThan(0.3);
      // 上台：离芯超过一半挑出那几节的最高点（引擎 y 向上为正）
      const plateTop = (tr: BandTrajectory, k: number, up: boolean): number => {
        const d = dualUnitSpec(UNIT_SHAPE.k[k], true, true);
        const i0 = up ? d.a0 : d.b0;
        const f = tr.frames[F];
        let rx = 0;
        for (let i = i0; i < i0 + d.fs; i++) rx = Math.max(rx, f[i]);
        let top = -Infinity;
        let bot = Infinity;
        for (let i = i0; i < i0 + d.fs; i++)
          if (f[i] > 0.5 * rx) {
            top = Math.max(top, f[n + i]);
            bot = Math.min(bot, f[n + i]);
          }
        return up ? bot : top;
      };
      const upFace = plateTop(face, 0, true) - face.frames[F][2 * n - 1];
      const upCorner = plateTop(corner, 2, true) - corner.frames[F][2 * n - 1];
      expect(Math.abs(m(upFace - upCorner))).toBeLessThan(0.012); // 上台三档同高（面 / 角差最多的两档）
      const gap = m(plateTop(face, 0, true) - plateTop(face, 0, false));
      expect(gap).toBeGreaterThan(0.48);
      expect(gap).toBeLessThan(0.56);
      // 只成下台：下台那段与两块都成时逐点相同（两块之间隔着 ≥ 16 节贴合 + 垫 + ≥ 16 节贴合），上台那段贴着芯
      for (const [both, lo, k] of [[face, faceLo, 0], [corner, cornerLo, 2]] as const) {
        const d = dualUnitSpec(UNIT_SHAPE.k[k], true, true);
        const fb = both.frames[F];
        const fl = lo.frames[F];
        let dev = 0;
        let bare = 0;
        let full = 0;
        for (let i = d.b0; i < d.b0 + d.fs; i++) dev = Math.max(dev, Math.abs(fb[i] - fl[i]), Math.abs(fb[n + i] - fl[n + i]));
        for (let i = d.a0; i < d.a0 + d.fs; i++) {
          bare = Math.max(bare, fl[i]);
          full = Math.max(full, fb[i]);
        }
        expect(dev).toBeLessThan(1e-6);
        expect(bare).toBeLessThan(0.1 * full);
        // 键：两块都成全锁，只成下台锁下台那半
        expect(both.locks[F]!.every((v) => v === 1)).toBe(true);
        expect(lo.locks[F]!.every((v) => v === 1)).toBe(true);
        expect(lo.bonds.length * 2).toBe(both.bonds.length);
      }
      // 收起那团与平台一样长（按节数比例压紧，±3%）：落下那一刻不突然变长
      const len = (tr: BandTrajectory, k: number): number => {
        const f = tr.frames[k];
        let hi = -Infinity;
        let lo = Infinity;
        for (let i = 0; i < tr.n; i++) {
          hi = Math.max(hi, f[tr.n + i]);
          lo = Math.min(lo, f[tr.n + i]);
        }
        return hi - lo;
      };
      expect(DUAL_STOWED).toBeLessThan(HOIST.stowed);
      expect(Math.abs(len(face, STEADY.stowed) / len(flat[0], STEADY.stowed) - 1)).toBeLessThan(0.03);
      // 带顶：四条每一帧都同高（共用一个上夹环）
      let dTop = 0;
      for (let k = 0; k < face.frames.length; k++) for (const tr of [corner, faceLo, cornerLo]) dTop = Math.max(dTop, Math.abs(bandTop(tr, k) - bandTop(face, k)));
      expect(dTop).toBeLessThan(1e-9);
      // 膜按上下两块对位：两个结构的带记着上台中心
      expect(face.upperMid).toBeCloseTo(dualUnitSpec(UNIT_SHAPE.k[0], true, true).a0 + (dualUnitSpec(UNIT_SHAPE.k[0], true, true).fs - 1) / 2, 9);
      expect(face.mid).toBeCloseTo(dualUnitSpec(UNIT_SHAPE.k[0], true, true).b0 + (dualUnitSpec(UNIT_SHAPE.k[0], true, true).fs - 1) / 2, 9);
    },
    180_000,
  );

  it('膜的分段对位：一对中心时与 membraneIndex 相同；两对时上下两块各自逐节对齐、两头接到带顶带底', () => {
    const n = 338;
    for (const i of [0, 40, 100, 160, 200, 300, 337]) expect(membraneIndexAt(i, n, [[150, 170, 30]])).toBeCloseTo(membraneIndex(i, n, 150, 170, 30), 9);
    const pairs: [number, number, number][] = [
      [120, 104, 40],
      [284, 267, 40],
    ];
    for (const [ma, mb, w] of pairs) for (const d of [-w, -10, 0, 10, w]) expect(membraneIndexAt(ma + d, n, pairs)).toBeCloseTo(mb + d, 9);
    expect(membraneIndexAt(0, n, pairs)).toBe(0);
    expect(membraneIndexAt(n - 1, n, pairs)).toBe(n - 1);
    let prev = -1;
    for (let i = 0; i < n; i++) {
      const v = membraneIndexAt(i, n, pairs);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('有顶的那半圈：二十条带里背向座位的十条两块都成，朝座位的十条只成下台', () => {
    for (const toward of [0, 0.7, Math.PI / 2, -2.4]) {
      const b = shelterBands(toward);
      expect(b.reduce((a, v) => a + v, 0)).toBe(10);
      for (let j = 0; j < b.length; j++) expect(b[j] === 1).toBe(Math.cos(bandAngle(j) - toward) < 0);
    }
  });

  it('下台的高度：猫坐着眼睛与坐着的人齐平（站上比例模型），上台顶比站着的人的眼睛低', () => {
    expect(SHELTER.lowerTop).toBeCloseTo(1.17 - 0.27, 2);
    expect(SHELTER.lowerTop + 0.583).toBeLessThan(1.57);
  });

  it('落在哪：正坐着的人共温带（1.5 m）以内的那台，朝离得最近的那个人；远了、压在家具上方的不要', () => {
    const l = { platR: 0.35 };
    const u = { x: 0, y: 0 };
    expect(shelterToward(l, u, [], [])).toBeNull();
    expect(shelterToward(l, u, [{ x: 0, y: 1.6 }], [])).toBeNull(); // 共温带以外
    expect(shelterToward(l, u, [{ x: 0, y: 1.2 }], [])).toBeCloseTo(Math.PI / 2, 12);
    expect(shelterToward(l, u, [{ x: 0, y: 1.2 }, { x: -0.9, y: 0 }], [])).toBeCloseTo(Math.PI, 12); // 取近的
    const chair = { x0: 0.2, x1: 0.8, y0: -0.3, y1: 0.3, kind: 'chair' as const, ergo: true as const };
    expect(shelterToward(l, u, [{ x: 0, y: 1.2 }], [chair])).toBeNull(); // 压在椅子上方（椅背 0.85 m 高过下台底面）
    expect(shelterToward(l, u, [{ x: 0, y: 1.2 }], [{ ...chair, kind: 'sofa' as const }])).toBeCloseTo(Math.PI / 2, 12); // 沙发靠背 0.80 m 让得开
    // 2-15 的标准布置：座位旁边那几台里有能落成有顶的（不全被家具挡掉）
    const sim = new CohabitSim({ grid: COHABIT.SEATS.GRID, unit: 'square', cover: 'room', trigger: 'posture', seed: 1 });
    const seats = sim.seats.map((s) => ({ x: s.x, y: s.y }));
    const ok = sim.layout.units.filter((q) => sim.seats.every((s) => s.table !== q.i) && shelterToward(sim.layout, q, seats, sim.furn!.rects) !== null);
    expect(ok.length).toBeGreaterThan(8);
  });

  it('猫在有顶的一台上：坐进有顶那半边（离分界 25°），头转过去看座位；跨台给出走到几成', () => {
    const u = { x: 0, y: 0 };
    const band = { R: 0.2 };
    for (const toward of [0, 1.1, -2.5]) {
      const a = catPlacement({ x: 0, y: 0, heading: 0.3, state: 'sit' }, [u], true, false, layout8, band, toward);
      const at = Math.atan2(a.y, a.x);
      expect(Math.cos(at - toward)).toBeLessThan(0); // 在有顶那半边
      expect(Math.cos(at - toward)).toBeCloseTo(Math.cos(Math.PI / 2 + SHELTER.catIn), 9);
      const look = a.heading + a.headTurn;
      expect(Math.cos(look - toward)).toBeCloseTo(1, 9); // 头朝座位
      expect(Math.abs(a.headTurn)).toBeLessThan(Math.PI / 2);
    }
    const B = { x: layout8.pitchM, y: 0 };
    expect(catPlacement({ x: B.x * 0.25, y: 0, heading: 0, state: 'walk' }, [u, B], true, true, layout8, band).t).toBeCloseTo(0.25, 9);
  });
});

describe('给猫落的台随机成形（2026-10-30 第二轮）', () => {
  const l = { platR: 0.35 };
  const u = { x: 0, y: 0 };
  const chair = { x0: 0.2, x1: 0.8, y0: -0.3, y1: 0.3, kind: 'chair' as const, ergo: true as const };
  const base = { seed: 11, unit: 7, serial: 0, layout: l, at: u, seated: [] as { x: number; y: number }[], rects: [], tableUnit: false };

  it('当桌子的那台、压在椅背上方的那台永远是平台', () => {
    for (let s = 0; s < 200; s++) {
      expect(unitFormPlan({ ...base, serial: s, tableUnit: true }).form).toBe('flat');
      expect(unitFormPlan({ ...base, serial: s, rects: [chair] }).form).toBe('flat');
      expect(unitFormPlan({ ...base, serial: s, seated: [{ x: 0, y: 1.2 }], rects: [chair] }).form).toBe('flat');
    }
    expect(shelterClear(l, u, [chair])).toBe(false);
    expect(shelterClear(l, u, [{ ...chair, kind: 'sofa' as const }])).toBe(true);
  });

  it('同样的种子、第几台、第几次落下抽出同一种；不碰 Math.random（仿真的随机数流不动）', () => {
    const real = Math.random;
    Math.random = () => {
      throw new Error('不该用 Math.random');
    };
    try {
      for (let s = 0; s < 50; s++) {
        const a = unitFormPlan({ ...base, serial: s });
        const b = unitFormPlan({ ...base, serial: s });
        expect(a.form).toBe(b.form);
        expect(a.toward).toBe(b.toward);
      }
    } finally {
      Math.random = real;
    }
    const forms = new Set(Array.from({ length: 40 }, (_, s) => unitFormPlan({ ...base, serial: s }).form));
    expect(forms.size).toBe(3);
  });

  it('抽到各形的频率与 UNIT_FORM_ODDS 相符（共温带里 / 别处两套）', () => {
    for (const [near, odds] of [
      [true, UNIT_FORM_ODDS.near],
      [false, UNIT_FORM_ODDS.other],
    ] as const) {
      const n = 4000;
      const c = { flat: 0, half: 0, full: 0 };
      for (let i = 0; i < n; i++) c[unitFormPlan({ ...base, seed: 3 + (i % 7), unit: i % 64, serial: Math.floor(i / 64), seated: near ? [{ x: 0, y: 1.2 }] : [] }).form]++;
      expect(c.half / n).toBeCloseTo(odds.half, 1);
      expect(c.full / n).toBeCloseTo(odds.full, 1);
      expect(c.flat / n).toBeCloseTo(1 - odds.half - odds.full, 1);
    }
  });

  it('有顶的一台：共温带里朝那个人敞开；别处朝四条边之一、正好十条带对十条带；整圈两层二十条全是两块', () => {
    const dirs = new Set<number>();
    for (let s = 0; s < 400; s++) {
      const near = unitFormPlan({ ...base, serial: s, seated: [{ x: 0, y: 1.2 }] });
      if (near.form === 'half') expect(near.toward).toBeCloseTo(Math.PI / 2, 12);
      const p = unitFormPlan({ ...base, serial: s });
      if (p.form === 'half') {
        const k = (p.toward as number) / (Math.PI / 2);
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-12);
        dirs.add(Math.round(k));
        expect([...(p.bands as Uint8Array)].reduce((a, b) => a + b, 0)).toBe(10);
        for (let j = 0; j < SQUARE.COUNT; j++) expect(p.bands![j]).toBe(Math.cos(bandAngle(j) - (p.toward as number)) < 0 ? 1 : 0);
      } else if (p.form === 'full') {
        expect(p.toward).toBeNull();
        expect([...(p.bands as Uint8Array)].every((b) => b === 1)).toBe(true);
      } else expect(p.bands).toBeNull();
    }
    expect(dirs).toEqual(new Set([0, 1, 2, 3]));
  });

  it('2-15 标准布置：座位的桌子那台全被排除，其余给猫的台里两层放得下的不少于四十台', () => {
    const sim = new CohabitSim({ grid: COHABIT.SEATS.GRID, unit: 'square', cover: 'room', trigger: 'posture', seed: 1 });
    const tables = new Set(sim.seats.map((s) => s.table).filter((t) => t >= 0));
    expect(tables.size).toBeGreaterThan(0);
    for (const t of tables)
      for (let s = 0; s < 30; s++) expect(unitFormPlan({ ...base, unit: t, serial: s, layout: sim.layout, at: sim.layout.units[t], rects: sim.furn!.rects, tableUnit: true }).form).toBe('flat');
    const ok = sim.layout.units.filter((q) => !tables.has(q.i) && shelterClear(sim.layout, q, sim.furn!.rects));
    expect(ok.length).toBeGreaterThanOrEqual(40);
  });
});
