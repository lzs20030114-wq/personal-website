'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBenchLang, useLabText } from './LabLanguage';
import { LabControlLabel } from './LabControlLabel';
import { attachLabCamera } from './labCameraInput';
import { LabViewDock } from './LabCtl';
import { planFromHash } from './planHash';
import { useBenchLoop } from './useBenchLoop';
import { DARK_A, DARK_B, FIG_DARK, FIG_LITE, LITE_A, LITE_B, RAIL_DARK, RAIL_LITE, ROOM_DARK, ROOM_LITE } from './SkinSolidBench';
import { FlatRenderer, bakeIndexed, type MeshPlace } from '../../src/lib/linkage/gl3d';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import type { Vec3 } from '../../src/lib/linkage/solver3d';
import { COHABIT, CohabitSim, SPACE_MODES, bandAngle, partySizes, type EventKind, type SpaceMode } from '../../src/lib/space/cohabit';
import { FIGURE, RING_GRID_AXON, ROOM, ringGridViewMatrix, type RingGridView } from '../../src/lib/space/skin-grid';
import { catVerts, figureVerts, type CatPose } from '../../src/lib/space/figure';
import {
  COHABIT_PIVOT,
  FRAMES,
  SCENE,
  STEADY,
  TrajectoryBaker,
  UNITS_PER_M,
  bakeBand,
  bakeRing,
  bandFrame,
  bandTopology,
  boxesMesh,
  catSpot,
  cohabitCamScale,
  figureYaw,
  furnitureBoxes,
  platesMesh,
  postsMesh,
  rigFor,
  roomMesh,
  unitDrop,
  unitFootY,
  unitTopY,
  type BandTrajectory,
  type Rig,
} from '../../src/lib/space/cohabit-solid';

/**
 * Lab 2-15 · 人猫同台的立体演示（2026-10-21 立项）。
 *
 * **不解新物理**：驱动它的是 Lab 2-14 那套仿真（`CohabitSim`，与案例页对照图同一份配置——
 * 「走 · 站 · 坐」规则 · 8×8 · 只收挡路的带 · 访客有身体结伴 · 猫能下地 · 猫按 Mertens & Turner 1988 标定），
 * 画的是 Lab 2-8 那间房里的 64 个单元：每个单元 = Lab 2-8 那只圆筒环按格距等比缩小；带子的形状取自
 * 一条引擎预烘的关键帧（正向协议 + 松键回程），每条带按「所在单元的成形程度 × 这条带收回了几成」取帧
 * （src/lib/space/cohabit-solid.ts 头注有这笔账）。人与猫是体块比例参考（figure.ts），站 / 坐 / 走 / 卧四档姿态。
 *
 * **两段触发（2026-10-23 作者纠偏）**：非触发的单元收在天花下（整束布贴着圆环板缩成一团），触发才沿立杆
 * 落到工位、再压缩成形——程度 < `HOIST.dropAt` 是升降段（整束布的高度与长度一起插值），之上是成形段。
 * 挡路的带各自收回时也按同一条路往上收（顶端收放按带，正文「夹持位置随程序变」那条假设）。立杆也随单元伸缩：
 * 下端跟着布束底走，收起时只剩天花下一小截（作者「中间这根棍子也得缩上去」）；圆环板仍是天花上的静件。
 *
 * 画法上两件为了帧率：静止态（收起 / 直带子 / 成形）的单元整环烘成一份静态网格、按单元摆（gl3d.drawMeshAt），
 * 只有正在升降、成形、收回、开门的带子才逐条摆；房间、立杆、圆环板、家具都是烘一次的静件。
 * 环间织物膜（Lab 2-8 的蒙皮）这台没画——相邻带的帧不同，膜要逐对现算，先不做。
 *
 * 案例页主图与主页预览用同一台（`controls={false}`）：没有控制条，拖拽旋转照常。
 */
const VIEWS = [
  { key: 'axon', label: '轴测' },
  { key: 'front', label: '正' },
  { key: 'side', label: '侧' },
  { key: 'top', label: '顶' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

const FURN_DARK: [number, number, number] = [0.16, 0.15, 0.13];
const FURN_LITE: [number, number, number] = [0.52, 0.48, 0.42];
const CAT_DARK: [number, number, number] = [0.2, 0.17, 0.14];
const CAT_LITE: [number, number, number] = [0.86, 0.78, 0.62];
/** 事件连线（与平面台架同一套配色：绿 共视 / 紫 共温 / 莲粉 共触 / 墨 交接） */
const LINK_COLOR: Record<EventKind, [number, number, number]> = {
  gaze: [0.42, 0.76, 0.58],
  warmth: [0.62, 0.5, 0.86],
  touch: [0.9, 0.5, 0.6],
  pass: [0.75, 0.78, 0.76],
};
/** 仿真单帧封顶（与 Lab 2-14 台架同）：切后台回来不炸 */
const MAX_SIM_DT = 0.05;
/** 烘轨迹时每帧给的主线程预算（ms） */
const BAKE_BUDGET_MS = 12;
const BANDS = COHABIT.FACES.BANDS;

const COPY = {
  zh: {
    title: '人猫同台 · 立体',
    sub: (platD: number, roomH: number) => `8×8 · 平台 ⌀${platD.toFixed(2)} m · 房高 ${roomH.toFixed(2)} m · ${SCENE.people} 位访客 · ${SCENE.cats} 只猫`,
    hint: '拖拽旋转 · 单元平时收在天花下，按实验 2-14 的规则落下成形、收回、给人让路 · 控制在实验室',
    hintCtl: '拖拽旋转 · 空间三档对照 · 单元平时收在天花下，按实验 2-14 的规则落下成形、收回，挡路的带各自收回 · 带子形状取自一条引擎的关键帧',
    baking: (p: number) => `算带子轨迹 ${Math.round(p * 100)}%`,
    line: (t: number, formed: number, total: number, c: Record<EventKind, number>) =>
      `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · 成形 ${formed} / ${total} · 共视 ${c.gaze} · 共温 ${c.warmth} · 共触 ${c.touch} · 交接 ${c.pass}`,
    aria: '一间房里 8×8 个收缩张紧外皮单元平时收在天花下，六位访客在地上走、站、坐，两只猫在平台上；单元按人猫同台的规则落下成形、收回，挡路的带各自收回',
    space: '空间',
    run: '运转',
    reset: '重来',
    view: '视角',
  },
  en: {
    title: 'People and cats together, in 3D',
    sub: (platD: number, roomH: number) => `8×8 · platform ⌀${platD.toFixed(2)} m · room ${roomH.toFixed(2)} m high · ${SCENE.people} visitors · ${SCENE.cats} cats`,
    hint: 'Drag to orbit · units rest stowed at the ceiling, then descend, form, retract and give way under the Lab 2-14 rules · controls in the lab',
    hintCtl: 'Drag to orbit · three spaces to compare · units rest stowed at the ceiling, then descend and form under the Lab 2-14 rules, bands in the way retract on their own · band shapes come from one engine run',
    baking: (p: number) => `baking band trajectory ${Math.round(p * 100)}%`,
    line: (t: number, formed: number, total: number, c: Record<EventKind, number>) =>
      `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · formed ${formed} / ${total} · co-gaze ${c.gaze} · co-warmth ${c.warmth} · contact ${c.touch} · crossing ${c.pass}`,
    aria: 'A room with an 8×8 field of contracting-skin units stowed at the ceiling; six visitors walk, stand and sit on the floor, two cats live on the platforms; units descend, form and retract under the cohabitation rules and bands in the way retract on their own',
    space: 'space',
    run: 'run',
    reset: 'restart',
    view: 'view',
  },
} as const;

/** 与案例页对照图同一份配置（scripts/cohabit/case-compare.mjs）；放人放猫照 runCohabit 的摆法 */
function makeSim(space: SpaceMode, seed: number): CohabitSim {
  const sim = new CohabitSim({
    trigger: 'posture',
    grid: COHABIT.SEATS.GRID,
    space,
    seed,
    opening: false,
    auto: true,
    faces: true,
    social: true,
    catFloor: true,
    cat: { ...COHABIT.CAT_MT, ...COHABIT.CAT_LEVELS.mid },
    guide: COHABIT.GUIDE,
  });
  const half = sim.layout.fieldM / 2;
  const sizes = partySizes(SCENE.people);
  sizes.forEach((sz, i) => {
    const a = (i / sizes.length) * 2 * Math.PI + 0.3;
    sim.addParty(Math.cos(a) * half * 0.6, Math.sin(a) * half * 0.6, sz);
  });
  for (let i = 0; i < SCENE.cats; i++) sim.addCat(sim.layout.units[(i * 5) % sim.layout.units.length]);
  return sim;
}

function catPoseOf(state: string): CatPose {
  if (state === 'lie') return 'lie';
  if (state === 'sit' || state === 'wait' || state === 'held') return 'sit';
  return 'walk';
}

interface Api {
  step: (dt: number) => void;
  redraw: () => void;
  setSpace: (m: SpaceMode) => void;
  restart: () => void;
  viewTo: (k: ViewKey) => void;
  viewHome: () => void;
}

export function CohabitSpaceBench({
  active = true,
  onLight = false,
  controls = true,
  workspace = false,
  lang: explicitLang,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
  workspace?: boolean;
  /** HUD 语言——案例页有中英切换，主图只能有一份，故由外层壳读语言再传进来 */
  lang?: 'zh' | 'en';
}) {
  const lang = useBenchLang(explicitLang);
  const tx = useLabText(lang);
  const t = COPY[lang];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<Api | null>(null);
  const runningRef = useRef(true);
  const [running, setRunning] = useState(true);
  const [space, setSpace] = useState<SpaceMode>('live');
  const [view, setView] = useState<ViewKey>('axon');
  const [hud, setHud] = useState<{ t: number; formed: number; total: number; counts: Record<EventKind, number>; bake: number; note: string; platD: number; roomH: number }>({
    t: 0,
    formed: 0,
    total: COHABIT.SEATS.GRID * COHABIT.SEATS.GRID,
    counts: { gaze: 0, warmth: 0, touch: 0, pass: 0 },
    bake: 0,
    note: '',
    platD: 0,
    roomH: (ROOM.FLOOR_Y / UNITS_PER_M),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      runningRef.current = false;
      setRunning(false);
    }
    const preset = planFromHash('2-15', SPACE_MODES.map((m) => m.key)) as SpaceMode | null;
    let spaceKey: SpaceMode = preset ?? 'live';
    if (preset) setSpace(preset);
    let seed = SCENE.seed;
    let sim = makeSim(spaceKey, seed);
    const layout = sim.layout;
    const roomM = layout.roomM;
    setHud((h) => ({ ...h, platD: layout.platR * 2, total: layout.units.length }));

    let viewKey: ViewKey = 'axon';
    const cam = new OrbitCamera({
      cx: 350,
      cy: 260,
      pivot: COHABIT_PIVOT,
      scale: cohabitCamScale(roomM, 'axon'),
      pitch0: RING_GRID_AXON.pitch,
      yaw0: RING_GRID_AXON.yaw,
      zoomMin: 0.5,
      zoomMax: 3,
      autoYaw: 0,
      mode: 'turntable',
    });

    let renderer: FlatRenderer | null = null;
    try {
      renderer = new FlatRenderer(canvas, 700, 520, 1200);
    } catch (error) {
      setHud((h) => ({ ...h, note: `3D preview unavailable · ${error instanceof Error ? error.message : 'WebGL 不可用'}` }));
      return;
    }
    const R = renderer;
    const IDENT = { ux: 1, uy: 0, uz: 0, ex: 0, ey: 1, ez: 0, fx: 0, fy: 0, fz: 1, o: { x: 0, y: 0, z: 0 } };

    // ── 静件：房间、家具（随仿真重建）────────────────────────────────────────
    const room = roomMesh(roomM);
    R.addMesh('room', bakeIndexed(room.verts, room.idx));
    const bakeFurniture = (): void => {
      const f = sim.furn ? boxesMesh(furnitureBoxes(sim.furn.rects)) : null;
      R.addMesh('furniture', f ? bakeIndexed(f.verts, f.idx) : new Float32Array(0));
    };
    bakeFurniture();

    // ── 带子轨迹：分片烘，烘完才开始跑仿真（否则头一秒里成形的单元没有形可画）────
    // 烘完之前用预览（引擎初始摆位压成的收起态）先把立杆、圆环板、收着的单元画出来，画面不空等
    const baker = new TrajectoryBaker();
    const topo = bandTopology(baker.n);
    let traj: BandTrajectory | null = null;
    const pre = baker.preview();
    let rig: Rig = rigFor(layout, pre);
    {
      const idle = bakeRing(pre, 1, topo); // 预览的第 1 帧 = 收起态
      R.addMesh('ring-stowed-a', idle.a);
      R.addMesh('ring-stowed-b', idle.b);
      const plates = platesMesh(rig);
      R.addMesh('plates', bakeIndexed(plates.verts, plates.idx));
    }
    // 立杆随单元伸缩（作者「中间这根棍子也得缩上去」）：下端跟着布束底走，哪一帧变了哪一帧重烘，静止时不重传
    const postBottoms = new Float32Array(layout.units.length).fill(-1);
    const postNext = new Float32Array(layout.units.length);
    const syncPosts = (): void => {
      let dirty = false;
      for (let u = 0; u < postNext.length && !dirty; u++) if (Math.abs(postNext[u] - postBottoms[u]) > 1e-3) dirty = true;
      if (!dirty) return;
      postBottoms.set(postNext);
      const posts = postsMesh(rig, layout, postBottoms);
      R.addMesh('posts', bakeIndexed(posts.verts, posts.idx));
    };
    const bandMeshDone = new Set<number>();
    const ensureBand = (frame: number): void => {
      if (!traj || bandMeshDone.has(frame)) return;
      const m = bakeBand(traj, frame, topo);
      R.addMesh(`band-${frame}-a`, m.a);
      R.addMesh(`band-${frame}-b`, m.b);
      bandMeshDone.add(frame);
    };
    const onBaked = (): void => {
      traj = baker.trajectory as BandTrajectory;
      rig = rigFor(layout, traj);
      // 三个静止态各烘一份整环：收起（换成 r = R0 自然松弛形压成的，与预览差十几 px，肉眼几乎看不出）/ 直带子 / 成形
      const stowed = bakeRing(traj, STEADY.stowed, topo);
      const straight = bakeRing(traj, STEADY.straight, topo);
      const formed = bakeRing(traj, STEADY.formed, topo);
      R.addMesh('ring-stowed-a', stowed.a);
      R.addMesh('ring-stowed-b', stowed.b);
      R.addMesh('ring-straight-a', straight.a);
      R.addMesh('ring-straight-b', straight.b);
      R.addMesh('ring-formed-a', formed.a);
      R.addMesh('ring-formed-b', formed.b);
    };

    // 每条带的上一帧「成形 × (1 − 收回)」与方向（涨查正向轨迹、退查回程）
    const fPrev = new Float32Array(layout.units.length * BANDS);
    const rising = new Uint8Array(layout.units.length * BANDS).fill(1);
    const frameOf = new Int32Array(layout.units.length * BANDS);

    const render = (): void => {
      R.beginFrame(cam);
      R.drawMesh('room', IDENT, ROOM_DARK, ROOM_LITE);
      R.drawMesh('furniture', IDENT, FURN_DARK, FURN_LITE);
      if (sim.space !== 'empty') {
        R.drawMesh('plates', IDENT, RAIL_DARK, RAIL_LITE);
        const stowedPlaces: MeshPlace[] = [];
        const straightPlaces: MeshPlace[] = [];
        const formedPlaces: MeshPlace[] = [];
        const perFrame = new Map<number, MeshPlace[]>();
        const at = (c: { x: number; z: number }, yaw: number, y: number): MeshPlace => ({ yaw, x: c.x, y, z: c.z, s: rig.s });
        for (let u = 0; u < layout.units.length; u++) {
          const c = rig.cells[u];
          // 轨迹还没烘完：仿真没开跑，全场都收在天花下
          if (!traj) {
            stowedPlaces.push(at(c, 0, rig.stowY));
            postNext[u] = unitFootY(rig, pre.footY, 0);
            continue;
          }
          const deg = sim.act.degree[u];
          // 整束布的高度跟单元的升降程度走；带子各自的长度跟自己的 f 走（开门的带往上收）；立杆下端跟布束底
          const drop = unitDrop(deg);
          const top = unitTopY(rig, drop);
          postNext[u] = unitFootY(rig, traj.footY, drop);
          let allStowed = true;
          let allStraight = true;
          let allFormed = true;
          for (let j = 0; j < BANDS; j++) {
            const i = u * BANDS + j;
            const f = Math.max(0, Math.min(1, deg * (1 - sim.bandOpen[i])));
            if (f > fPrev[i] + 1e-6) rising[i] = 1;
            else if (f < fPrev[i] - 1e-6) rising[i] = 0;
            fPrev[i] = f;
            const k = bandFrame(f, rising[i] === 1, FRAMES, traj.retractActive);
            frameOf[i] = k;
            if (k !== STEADY.stowed) allStowed = false;
            if (k !== STEADY.straight) allStraight = false;
            if (k !== STEADY.formed) allFormed = false;
          }
          if (allStowed) stowedPlaces.push(at(c, 0, top));
          else if (allStraight) straightPlaces.push(at(c, 0, top));
          else if (allFormed) formedPlaces.push(at(c, 0, top));
          else
            for (let j = 0; j < BANDS; j++) {
              const k = frameOf[u * BANDS + j];
              let list = perFrame.get(k);
              if (!list) perFrame.set(k, (list = []));
              list.push(at(c, bandAngle(j), top));
            }
        }
        syncPosts();
        R.drawMesh('posts', IDENT, RAIL_DARK, RAIL_LITE);
        R.drawMeshAt('ring-stowed-a', stowedPlaces, DARK_A, LITE_A);
        R.drawMeshAt('ring-stowed-b', stowedPlaces, DARK_B, LITE_B);
        R.drawMeshAt('ring-straight-a', straightPlaces, DARK_A, LITE_A);
        R.drawMeshAt('ring-straight-b', straightPlaces, DARK_B, LITE_B);
        R.drawMeshAt('ring-formed-a', formedPlaces, DARK_A, LITE_A);
        R.drawMeshAt('ring-formed-b', formedPlaces, DARK_B, LITE_B);
        for (const [k, places] of perFrame) {
          ensureBand(k);
          R.drawMeshAt(`band-${k}-a`, places, DARK_A, LITE_A);
          R.drawMeshAt(`band-${k}-b`, places, DARK_B, LITE_B);
        }
      }
      // 人：走 / 站 = 站姿（迈步的那副），坐 = 坐姿、朝座位的朝向
      for (const p of sim.people) {
        const seat = p.seated && p.seat !== null ? sim.seats[p.seat] : null;
        const heading = seat ? Math.atan2(seat.face[1], seat.face[0]) : p.walker.heading;
        const fig = figureVerts({
          x: p.walker.x * UNITS_PER_M,
          z: p.walker.y * UNITS_PER_M,
          footY: ROOM.FLOOR_Y,
          height: FIGURE.HEIGHT,
          yaw: figureYaw(heading),
          pose: seat ? 'sit' : 'stand',
        });
        R.drawDynamicMesh(bakeIndexed(fig.verts, fig.idx), FIG_DARK, FIG_LITE);
      }
      // 猫：在台上的落在平台面上（离芯心太近的挪到平台中带），下地的在地面
      for (const c of sim.cats) {
        const support = sim.supportOf(c);
        let unit = support[0] ?? null;
        if (support.length > 1) unit = support.reduce((b, u) => (Math.hypot(u.x - c.walker.x, u.y - c.walker.y) < Math.hypot(b.x - c.walker.x, b.y - c.walker.y) ? u : b), support[0]);
        const spot = catSpot(c.walker, sim.space === 'empty' ? null : unit, layout);
        // 成形段才有台面（落到位的直筒还没有平台）：程度到顶才把猫画在平台面上
        const onPlatform = !!unit && spot.onPlatform && traj !== null && sim.act.degree[unit.i] >= 1 - 1e-3;
        const cat = catVerts({
          x: spot.x * UNITS_PER_M,
          z: spot.y * UNITS_PER_M,
          footY: onPlatform ? rig.platformY : ROOM.FLOOR_Y,
          unit: UNITS_PER_M,
          yaw: figureYaw(c.walker.heading),
          pose: catPoseOf(c.state),
        });
        R.drawDynamicMesh(bakeIndexed(cat.verts, cat.idx), CAT_DARK, CAT_LITE);
      }
      // 四类事件的连线（胸口高度），颜色照平面台架
      if (sim.links.length) {
        const byKind = new Map<EventKind, { a: Vec3; b: Vec3 }[]>();
        const y = ROOM.FLOOR_Y - 0.9 * UNITS_PER_M;
        for (const l of sim.links) {
          let segs = byKind.get(l.kind);
          if (!segs) byKind.set(l.kind, (segs = []));
          segs.push({ a: { x: l.x1 * UNITS_PER_M, y, z: l.y1 * UNITS_PER_M }, b: { x: l.x2 * UNITS_PER_M, y, z: l.y2 * UNITS_PER_M } });
        }
        for (const [kind, segs] of byKind) R.drawLines(segs, LINK_COLOR[kind], 0.004);
      }
    };

    let lastHud = '';
    const pushHud = (): void => {
      const s = sim.summary();
      const key = `${Math.floor(s.t)}|${s.formed}|${s.ledger.counts.gaze}|${s.ledger.counts.warmth}|${s.ledger.counts.touch}|${s.ledger.counts.pass}|${traj ? 1 : Math.round(baker.progress * 20)}`;
      if (key === lastHud) return;
      lastHud = key;
      setHud((h) => ({ ...h, t: s.t, formed: s.formed, counts: { ...s.ledger.counts }, bake: traj ? 1 : baker.progress }));
    };

    // 烘轨迹走自己的时间片（宏任务链），不挂在渲染循环上：慢设备或一页多台时帧来得稀，
    // 按帧给预算会把一秒半的活拖成半分钟（无头软件 GL 实测 40 s 才 13%）
    let bakeTimer: ReturnType<typeof setTimeout> | null = null;
    const bakeTick = (): void => {
      bakeTimer = null;
      if (baker.work(BAKE_BUDGET_MS)) {
        onBaked();
        render();
        pushHud();
      } else bakeTimer = setTimeout(bakeTick, 0);
    };
    bakeTimer = setTimeout(bakeTick, 0);

    const step = (dt: number): void => {
      if (traj && runningRef.current) sim.step(Math.min(MAX_SIM_DT, dt));
      cam.tick(dt);
      render();
      pushHud();
    };

    const rebuild = (): void => {
      sim = makeSim(spaceKey, seed);
      bakeFurniture();
      fPrev.fill(0);
      rising.fill(1);
      lastHud = '';
      render();
      pushHud();
    };

    apiRef.current = {
      step,
      redraw: render,
      setSpace: (m) => {
        spaceKey = m;
        rebuild();
      },
      restart: () => {
        seed += 1;
        rebuild();
      },
      viewTo: (k) => {
        viewKey = k;
        cam.setOrientation(ringGridViewMatrix(k as RingGridView));
        cam.retarget(COHABIT_PIVOT, cohabitCamScale(roomM, k as RingGridView));
        render();
      },
      viewHome: () => {
        cam.reset();
        viewKey = 'axon';
        cam.retarget(COHABIT_PIVOT, cohabitCamScale(roomM, viewKey));
        render();
      },
    };

    const onCtx = (ev: Event): void => ev.preventDefault();
    const onDown = (ev: PointerEvent): void => {
      cam.pointerDown(ev.pointerId, ev.clientX, ev.clientY, ev.button === 2);
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        /* 合成事件无活跃 pointerId */
      }
    };
    const onMove = (ev: PointerEvent): void => cam.pointerMove(ev.pointerId, ev.clientX, ev.clientY);
    const onUp = (ev: PointerEvent): void => cam.pointerUp(ev.pointerId);
    const detachCamera = attachLabCamera(canvas, { wheel: (delta) => cam.wheel(delta), home: () => { setView('axon'); apiRef.current?.viewHome(); } });
    canvas.addEventListener('contextmenu', onCtx);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    render();
    pushHud();
    return () => {
      apiRef.current = null;
      if (bakeTimer !== null) clearTimeout(bakeTimer);
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      detachCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBenchLoop(canvasRef, (dt) => apiRef.current?.step(dt), [], active);

  // 空间三档：换档 = 重建仿真（同一种子），首次由主 effect 建
  const spaceRef = useRef<SpaceMode | null>(null);
  useEffect(() => {
    if (spaceRef.current === null) {
      spaceRef.current = space;
      return;
    }
    if (spaceRef.current === space) return;
    spaceRef.current = space;
    apiRef.current?.setSpace(space);
  }, [space]);

  const goView = useCallback((k: ViewKey) => {
    setView(k);
    apiRef.current?.viewTo(k);
  }, []);

  const canvas = <canvas ref={canvasRef} width={1400} height={1040} aria-label={t.aria} />;
  const kicker = tx('Lab 2-15 / Project II');
  return (
    <div className={`lab-wrap${onLight ? ' on-light' : ''}${workspace && controls ? ' solid-workbench' : ''}`}>
      <div className="lab-fig">
        {workspace && controls ? <div className="solid-map">{canvas}</div> : canvas}
        <div className="lab-hud tl">
          <div style={{ color: 'var(--accent-2)' }}>{kicker}</div>
          <div>{t.title}</div>
          <div className="dim">{t.sub(hud.platD, hud.roomH)}</div>
        </div>
        <div className="lab-hud br">
          <div className="dim">{hud.bake < 1 ? t.baking(hud.bake) : t.line(hud.t, hud.formed, hud.total, hud.counts)}</div>
        </div>
        <div className="lab-hud bl dim">{hud.note ? tx('3D preview unavailable') : controls ? t.hintCtl : t.hint}</div>
      </div>
      {controls ? (
        <div className="lab-ctl lab-ctl--tiered">
          <div className="lab-ctl__row lab-ctl__solve">
            <div className="grp">
              <LabControlLabel help={['三档对照：会动的单元 / 单元钉死（偶数行落着）/ 空房间。', 'Three spaces to compare: live units, units fixed (even rows formed), an empty room.']}>{t.space}</LabControlLabel>
              <span className="seg">
                {SPACE_MODES.map((m) => (
                  <button key={m.key} type="button" className={m.key === space ? 'active' : undefined} onClick={() => setSpace(m.key)}>
                    {lang === 'zh' ? m.zh : m.en}
                  </button>
                ))}
              </span>
            </div>
          </div>
          <div className="lab-ctl__row">
            <div className="grp">
              <label>
                <input
                  type="checkbox"
                  checked={running}
                  onChange={(e) => {
                    runningRef.current = e.target.checked;
                    setRunning(e.target.checked);
                  }}
                />
                {t.run}
              </label>
              <button type="button" onClick={() => { apiRef.current?.restart(); runningRef.current = true; setRunning(true); }}>
                {t.reset}
              </button>
            </div>
            {/* 视角搬到底栏（LabCtl）；底栏「归位」= 这里原来那颗 */}
            <LabViewDock>
              <LabControlLabel help={['切换轴测、正面、侧面或顶视图，不改变模型。', 'Switch camera views without changing the model.']}>{t.view}</LabControlLabel>
              <span className="seg">
                {VIEWS.map((v) => (
                  <button key={v.key} type="button" className={v.key === view ? 'active' : undefined} onClick={() => goView(v.key)}>
                    {tx(v.label)}
                  </button>
                ))}
              </span>
            </LabViewDock>
          </div>
        </div>
      ) : null}
    </div>
  );
}
