'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBenchLang, useLabText } from './LabLanguage';
import { LabControlLabel } from './LabControlLabel';
import { attachLabCamera } from './labCameraInput';
import { planFromHash } from './planHash';
import { useBenchLoop } from './useBenchLoop';
import { DARK_A, DARK_B, LITE_A, LITE_B, RAIL_DARK, RAIL_LITE, ROOM_DARK, ROOM_LITE } from './SkinSolidBench';
import { toneColor } from './figurePalette';
import { FlatRenderer, bakeIndexed, type MeshPlace } from '../../src/lib/linkage/gl3d';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import type { Vec3 } from '../../src/lib/linkage/solver3d';
import { COHABIT, CohabitSim, SPACE_MODES, bandAngle, partySizes, type EventKind, type SpaceMode } from '../../src/lib/space/cohabit';
import { FIGURE, RING_GRID_AXON, ROOM, ringGridViewMatrix, type RingGridView } from '../../src/lib/space/skin-grid';
import { CAT, CAT_HEAD_YAW_MAX, clampHeadYaw, catRig, humanRig, strideOf, type Rig as BodyRig } from '../../src/lib/space/figure';
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
  catPlacement,
  cohabitCamScale,
  figureYaw,
  furnitureBoxes,
  platesMesh,
  postsMesh,
  ringBand,
  rigFor,
  roomMesh,
  seatSpecOf,
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
 * （src/lib/space/cohabit-solid.ts 头注有这笔账）。人与猫是方块风的比例参考（figure.ts，配色 figurePalette.ts）：人有走 / 站 / 坐（按座面解出来、看猫时前倾）与转头、每人一件不同颜色的上衣，猫在台上顺着环绕着立杆待。
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
    home: '归位',
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
    home: 'home',
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

/** 步态相位分几格（每格一份静态网格，画面上看不出跳格） */
const WALK_FRAMES = { person: 24, cat: 16 } as const;
/** 速度过这条线算在走（m/s，按仿真时间平滑；低于它画站 / 坐） */
const MOVING = { person: 0.15, cat: 0.06 } as const;
/** 速度平滑的时间常数（s）：等让路时一停一走，不让小人在走 / 站之间闪 */
const SPEED_TAU = 0.25;

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

    // ── 人与猫：按「姿态 + 步态相位格」各烘一份静态网格（每种颜色一件，身子与头分开），摆放走 drawMeshAt，每帧不重烘 ──
    const rigs = new Map<string, BodyRig>();
    const rigOf = (key: string, make: () => BodyRig): BodyRig => {
      let r = rigs.get(key);
      if (!r) {
        r = make();
        rigs.set(key, r);
        // 方块零件按面着色（每个面一个明暗）
        for (const part of r.parts) R.addMesh(`${key}:${part.on}:${part.tone}`, bakeIndexed(part.mesh.verts, part.mesh.idx));
      }
      return r;
    };
    // 每个人 / 猫走过的路程与平滑后的速度（按仿真时间）：路程推步态相位，速度定走还是站
    const motion = new WeakMap<object, { x: number; y: number; t: number; dist: number; speed: number }>();
    const track = (who: object, x: number, y: number): { dist: number; speed: number } => {
      const m = motion.get(who);
      if (!m || sim.t < m.t) {
        const fresh = { x, y, t: sim.t, dist: 0, speed: 0 };
        motion.set(who, fresh);
        return fresh;
      }
      const dt = sim.t - m.t;
      if (dt > 0) {
        const d = Math.hypot(x - m.x, y - m.y);
        if (d < 1) {
          m.dist += d;
          const k = 1 - Math.exp(-dt / SPEED_TAU);
          m.speed += (d / dt - m.speed) * k;
        }
        m.x = x;
        m.y = y;
        m.t = sim.t;
      }
      return m;
    };
    const STRIDE_M = strideOf(FIGURE.HEIGHT) / UNITS_PER_M;
    const frac = (v: number): number => v - Math.floor(v);
    /** 同一份网格、同一套配色的一批摆放（人的上衣 / 头发按 variant = 访客编号换色） */
    type Batch = { r: BodyRig; key: string; variant: number; body: MeshPlace[]; head: MeshPlace[] };
    /** 一副 Rig 摆一处：身子 yaw + 平移，头绕枢轴再转 headTurn（世界坐标） */
    const placeBoth = (batches: Map<string, Batch>, r: BodyRig, key: string, variant: number, x: number, y: number, z: number, yaw: number, headTurn: number): void => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const id = `${key}#${variant}`;
      let b = batches.get(id);
      if (!b) batches.set(id, (b = { r, key, variant, body: [], head: [] }));
      b.body.push({ yaw, x, y, z });
      b.head.push({ yaw: yaw + r.headYaw + headTurn, x: r.pivot[0] * c - r.pivot[2] * s + x, y: r.pivot[1] + y, z: r.pivot[0] * s + r.pivot[2] * c + z });
    };
    const drawBatches = (batches: Map<string, Batch>): void => {
      for (const b of batches.values())
        for (const part of b.r.parts) {
          const [dark, lite] = toneColor(part.tone, b.variant);
          R.drawMeshAt(`${b.key}:${part.on}:${part.tone}`, part.on === 'body' ? b.body : b.head, dark, lite);
        }
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
      // 人：走（步态按走过的路程推相位）/ 站 / 坐（按这张家具的座面解出来；看着猫时前倾）；头随视线转，夹在 ±75°
      const people = new Map<string, Batch>();
      for (const p of sim.people) {
        const mo = track(p, p.walker.x, p.walker.y);
        const seat = p.seated && p.seat !== null ? sim.seats[p.seat] : null;
        const rect = seat && sim.furn ? sim.furn.rects[seat.furn] : null;
        let key = 'p-stand';
        let r: BodyRig;
        let heading = p.walker.heading;
        let x = p.walker.x;
        let y = p.walker.y;
        if (seat && rect) {
          const s = seatSpecOf(rect, seat);
          const lean = p.watching !== null && !p.ignores;
          key = `p-sit-${s.front.toFixed(3)}-${s.back.toFixed(3)}-${lean ? 1 : 0}`;
          r = rigOf(key, () =>
            humanRig({
              height: FIGURE.HEIGHT,
              pose: 'sit',
              lean,
              seat: { top: s.top * UNITS_PER_M, front: s.front * UNITS_PER_M, back: s.back * UNITS_PER_M, thick: s.thick * UNITS_PER_M, backTop: s.backTop * UNITS_PER_M },
            }),
          );
          heading = Math.atan2(seat.face[1], seat.face[0]);
          x = seat.x;
          y = seat.y;
        } else if (mo.speed > MOVING.person) {
          const k = Math.floor(frac(mo.dist / STRIDE_M) * WALK_FRAMES.person) % WALK_FRAMES.person;
          key = `p-walk-${k}`;
          r = rigOf(key, () => humanRig({ height: FIGURE.HEIGHT, pose: 'walk', phase: k / WALK_FRAMES.person }));
        } else r = rigOf(key, () => humanRig({ height: FIGURE.HEIGHT, pose: 'stand' }));
        placeBoth(people, r, key, p.id, x * UNITS_PER_M, ROOM.FLOOR_Y, y * UNITS_PER_M, figureYaw(heading), clampHeadYaw(p.walker.gaze - heading));
      }
      drawBatches(people);
      // 猫：台上的顺着环形平台坐 / 蜷 / 走（身子绕着立杆弯过去，不穿杆）、跨台时贴着芯的一侧跳过去；地面上的照平面位置。
      // 成形段才有台面（落到位的直筒还没有平台）：脚下的台程度到顶才把猫画在平台面上
      const band = traj ? ringBand(rig, layout, traj) : null;
      const cats = new Map<string, Batch>();
      for (const c of sim.cats) {
        const mo = track(c, c.walker.x, c.walker.y);
        const support = sim.space === 'empty' ? [] : sim.supportOf(c);
        const formed = band !== null && support.length > 0 && support.every((u) => sim.act.degree[u.i] >= 1 - 1e-3);
        const pl = catPlacement({ x: c.walker.x, y: c.walker.y, heading: c.walker.heading, state: c.state }, support, formed, mo.speed > MOVING.cat, layout, band ?? { R: 0 });
        const k = pl.pose === 'walk' ? Math.floor(frac(mo.dist / CAT.STRIDE) * WALK_FRAMES.cat) % WALK_FRAMES.cat : 0;
        const key = `c-${pl.pose}-${pl.tail}-${pl.bend.toFixed(3)}-${k}`;
        const r = rigOf(key, () => catRig({ unit: UNITS_PER_M, pose: pl.pose, tail: pl.tail, bend: pl.bend, phase: k / WALK_FRAMES.cat }));
        const footY = pl.onPlatform ? rig.platformY - pl.lift * UNITS_PER_M : ROOM.FLOOR_Y;
        placeBoth(cats, r, key, 0, pl.x * UNITS_PER_M, footY, pl.y * UNITS_PER_M, figureYaw(pl.heading), clampHeadYaw(pl.headTurn, CAT_HEAD_YAW_MAX));
      }
      drawBatches(cats);
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
    const detachCamera = attachLabCamera(canvas, { wheel: (delta) => cam.wheel(delta), home: () => apiRef.current?.viewHome() });
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
            <div className="grp">
              <LabControlLabel help={['切换轴测、正面、侧面或顶视图，不改变模型。', 'Switch camera views without changing the model.']}>{t.view}</LabControlLabel>
              <span className="seg">
                {VIEWS.map((v) => (
                  <button key={v.key} type="button" className={v.key === view ? 'active' : undefined} onClick={() => goView(v.key)}>
                    {tx(v.label)}
                  </button>
                ))}
              </span>
              <button type="button" onClick={() => { setView('axon'); apiRef.current?.viewHome(); }}>
                {t.home}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
