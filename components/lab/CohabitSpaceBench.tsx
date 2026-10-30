'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useBenchLang, useLabText } from './LabLanguage';
import { LabControlLabel } from './LabControlLabel';
import { attachLabCamera } from './labCameraInput';
import { LabViewDock } from './LabCtl';
import { planFromHash } from './planHash';
import { useBenchLoop } from './useBenchLoop';
import { DARK_A, DARK_B, LITE_A, LITE_B, MEM_DARK, MEM_LITE, RAIL_DARK, RAIL_LITE, ROOM_DARK, ROOM_LITE } from './SkinSolidBench';
import { COATS, OUTFITS, catColor, coatOf, dealLooks, outfitOf, personColor } from './figurePalette';
import { FlatRenderer, bakeIndexed, type MeshPlace } from '../../src/lib/linkage/gl3d';
import { SOLID } from '../../src/lib/space/skin-solid';
import { MECH } from '../../src/lib/space/unit-mechanism';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import type { Vec3 } from '../../src/lib/linkage/solver3d';
import { COHABIT, CohabitSim, PACE_DEMO, SPACE_MODES, bandAngle, partySizes, type EventKind, type SpaceMode } from '../../src/lib/space/cohabit';
import { FIGURE, RING_GRID_AXON, ROOM, ringGridViewMatrix, type RingGridView } from '../../src/lib/space/skin-grid';
import { CAT, CAT_HEAD_YAW_MAX, clampHeadYaw, catRig, humanRig, strideOf, styleKey, type Rig as BodyRig, type Tone } from '../../src/lib/space/figure';
import {
  COHABIT_PIVOT,
  SCENE,
  STEADY,
  STOWED_STRIDE,
  TABLE_MOVE,
  TABLE_TOP,
  UNITS_PER_M,
  UNIT_ORDER,
  UnitBaker,
  bakeBand,
  bakeMembrane,
  bakeUnit,
  bakeUnitSkin,
  bandCursors,
  bandPaths,
  bandTopology,
  boxesMesh,
  catPlacement,
  cohabitCamScale,
  decimateTrajectory,
  figureYaw,
  furnitureBoxes,
  membraneJoins,
  shellJoins,
  pickUnitBands,
  bandTop,
  DOOR_EPS,
  bakeBandKeys,
  bakeHanger,
  bakeShellCover,
  bakeShellGore,
  bakeUnitKeys,
  bakeUnitMech,
  bakeUnitShell,
  SHELL_END_LOW,
  platesMesh,
  platformBand,
  platformSide,
  postsMesh,
  resetBandCursors,
  rigFor,
  rigYForTop,
  roomMesh,
  seatSpecOf,
  tableTopFor,
  unitDrop,
  unitFootY,
  unitTopY,
  type BandPaths,
  type BandTrajectory,
  type Rig,
} from '../../src/lib/space/cohabit-solid';

/**
 * Lab 2-15 · 人猫同台的立体演示（2026-10-21 立项）。
 *
 * **不解新物理**：驱动它的是 Lab 2-14 那套仿真（`CohabitSim`，与案例页对照图同一份配置——
 * 「走 · 站 · 坐」规则 · 8×8 · 只收挡路的带 · 访客有身体结伴 · 猫能下地 · 猫按 Mertens & Turner 1988 标定），
 * 画的是 Lab 2-8 那间房里的 64 个单元。**单元是方形的**（作者 2026-10-25：「圆形只做过程推演，方形才是拿来具体使用的」）：
 * 每台 = Lab 2-7 方形环平档的面 / 边 / 角三档，按格距等比缩小，再放大到「方形的内切圆 = 原来的圆台」；平面模型按方形
 * 每条带的长度判墙与开门（`unit: 'square'`）。带子的形状取自三条引擎预烘的关键帧（每档一条：正向协议 + 松键回程），
 * 每条带按所在单元的成形程度与这条带收回了几成取它那一档的帧（`pickUnitBands`，src/lib/space/cohabit-solid.ts 头注有这笔账）。
 * 人与猫是方块风的比例参考（figure.ts，配色 figurePalette.ts）：人有走 / 站 / 坐（按座面解出来、看猫时前倾）与转头、
 * 每人一件不同颜色的上衣，猫在台上顺着内切圆那一圈绕着立杆待。
 *
 * **两段触发（2026-10-23 作者纠偏）**：非触发的单元收在天花下（整束布贴着天花方板缩成一团），触发才沿立杆
 * 落到工位、再压缩成形——程度 < `HOIST.dropAt` 是升降段（整束布的高度与长度一起插值），之上是成形段。
 * 挡路的带各自收回（2026-10-30 起）：走引擎的收直回程、平贴在芯上，多出来的布卷进上夹环——一台单元的二十条带始终上接
 * 同一个夹环、下接同一个钉住端（此前借了整台升降的帧，收回的带压成一小团漂在半空）。立杆也随单元伸缩：
 * 下端跟着布束底走，收起时只剩天花下一小截（作者「中间这根棍子也得缩上去」）；天花方板仍是静件。
 *
 * 画法上两件为了帧率：静止态（收起 / 直带子 / 成形）的单元整台烘成一份静态网格、按单元摆（gl3d.drawMeshAt），
 * 只有正在升降、成形、收回、开门的带子才逐条摆；房间、立杆、天花方板、家具都是烘一次的静件。收在天花下的那一团
 * 用抽稀的轨迹（看不出细节，64 台全按满分辨率画要两百多万个三角形）。
 * 带与带之间的膜（2026-10-25 随方形单元补上，没有它方台俯视是一把放射状的窄带）：静止态整台烘一份；过渡中的单元逐对摆，
 * 两侧帧相同的取缓存、不同的现烘。半透明，在实体之后从远到近画。
 *
 * **蒙皮（2026-10-30，作者「蒙皮和这个绿色的布只是设计阶段的临时状态……设计一个真正的蒙皮在上面作为单元的外表面，可以开可以关」）**：
 * 一层连续、不透明的外皮把整台包住（cohabit-solid `SHELL`：每条带一片盖片 + 相邻两条带之间一片接缝片，两头塞进上下夹环），
 * 默认开。开着时：静止态的单元只画外皮（带子、键、带间的膜都在皮里面，不画）；有带子在让路的单元，门那里接缝片张开，
 * 带子与键照画，从门口看得见里面。关掉 = 回到结构视图（带子 + 键 + 半透明的膜）。
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

/**
 * 机构件的颜色（2026-10-30 网页模型细化，件与读法照 项目二_单元建模.md §2）：夹圈与吊杆 = 拉丝铝（浅），辐条、中心套、芯 = 深灰阳极，
 * 键座与撑杆外套 = 石墨，扣上的内杆 = 橙（与台架的键线同色同义）
 */
const ALU_DARK: [number, number, number] = [0.3, 0.32, 0.34];
const ALU_LITE: [number, number, number] = [0.8, 0.82, 0.84];
const MECH_DARK: [number, number, number] = [0.06, 0.065, 0.07];
const MECH_LITE: [number, number, number] = [0.3, 0.32, 0.34];
const PAD_DARK: [number, number, number] = [0.04, 0.045, 0.05];
const PAD_LITE: [number, number, number] = [0.2, 0.21, 0.23];
const ROD_DARK: [number, number, number] = [0.4, 0.16, 0.07];
const ROD_LITE: [number, number, number] = [0.95, 0.5, 0.28];
/**
 * 蒙皮的颜色（作者「要有高科技感，也不要特别抢眼」）：低饱和、略偏冷的钛灰（哑光金属）。试过四档（2026-10-30 截图对比）：
 * 石墨（暗）与房间混成一片、单元读不出形；珍珠白最抢眼；带青的深潭色把「颜色只表示项目」的界线弄混。取钛灰——比夹环的拉丝铝
 * 暗一档（夹环与吊杆读得出来），比房间亮得多（单元从暗背景里读得出形）。接缝片比盖片暗约一成，一圈二十道细缝读成分片的外壳，不另画线
 */
export const SHELL_DARK: [number, number, number] = [0.16, 0.175, 0.19];
export const SHELL_LITE: [number, number, number] = [0.66, 0.7, 0.73];
export const SEAM_DARK: [number, number, number] = [0.145, 0.158, 0.172];
export const SEAM_LITE: [number, number, number] = [0.6, 0.637, 0.665];
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
/** 时间倍速（2026-10-27 作者「立体模拟也加上时间倍数，比如 8 倍、10 倍、20 倍」）：每帧的仿真时长 = 实际帧长（封顶 MAX_SIM_DT）× 倍速，
 *  按 MAX_SIM_DT 一段一段推（×1 时就是原来那一次调用，逐位不变）。仿真每秒约 8 ms，×20 时每秒真实时间约 0.16 s 的 CPU */
const TIME_SCALES = [1, 8, 10, 20] as const;
const TIME_DEF = 1;
/** 烘轨迹时每帧给的主线程预算（ms） */
const BAKE_BUDGET_MS = 12;
/** 带与带之间那层膜的不透明度（Lab 2-5 / 2-8 的蒙皮滑块默认 0.35；方台要读得出是一张台面，取高一点，待作者真机看） */
const SKIN_ALPHA = 0.5;
const BANDS = COHABIT.FACES.BANDS;

const COPY = {
  zh: {
    title: '人猫同台 · 立体',
    sub: (side: number, roomH: number) => `8×8 · 方台边长 ${side.toFixed(2)} m · 房高 ${roomH.toFixed(2)} m · ${SCENE.people} 位访客 · ${SCENE.cats} 只猫`,
    hint: '拖拽旋转 · 单元平时收在天花下，按实验 2-14 的规则落下成形、收回、给人让路 · 控制在实验室',
    hintCtl: '拖拽旋转 · 空间三档对照 · 单元平时收在天花下，按实验 2-14 的规则落下成形、收回，挡路的带各自收回 · 蒙皮可关掉看里面的带子与键 · 带子形状取自三条引擎（每档一条）的关键帧 · 访客的穿着与猫的花色每一场随机、不重样',
    baking: (p: number) => `算带子轨迹 ${Math.round(p * 100)}%`,
    line: (t: number, formed: number, total: number, c: Record<EventKind, number>) =>
      `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · 成形 ${formed} / ${total} · 共视 ${c.gaze} · 共温 ${c.warmth} · 共触 ${c.touch} · 交接 ${c.pass}`,
    aria: '一间房里 8×8 个方形的收缩张紧外皮单元平时收在天花下，六位访客在地上走、站、坐，两只猫在方台上；单元按人猫同台的规则落下成形、收回，挡路的带各自收回',
    space: '空间',
    shell: '蒙皮',
    run: '运转',
    time: '时间',
    reset: '重来',
    view: '视角',
  },
  en: {
    title: 'People and cats together, in 3D',
    sub: (side: number, roomH: number) => `8×8 · square platform ${side.toFixed(2)} m · room ${roomH.toFixed(2)} m high · ${SCENE.people} visitors · ${SCENE.cats} cats`,
    hint: 'Drag to orbit · units rest stowed at the ceiling, then descend, form, retract and give way under the Lab 2-14 rules · controls in the lab',
    hintCtl: 'Drag to orbit · three spaces to compare · units rest stowed at the ceiling, then descend and form under the Lab 2-14 rules, bands in the way retract on their own · turn the skin off to see the bands and keys inside · band shapes come from three engine runs, one per depth · outfits and coats are dealt at random each run, no two alike',
    baking: (p: number) => `baking band trajectory ${Math.round(p * 100)}%`,
    line: (t: number, formed: number, total: number, c: Record<EventKind, number>) =>
      `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · formed ${formed} / ${total} · co-gaze ${c.gaze} · co-warmth ${c.warmth} · contact ${c.touch} · crossing ${c.pass}`,
    aria: 'A room with an 8×8 field of square contracting-skin units stowed at the ceiling; six visitors walk, stand and sit on the floor, two cats live on the square platforms; units descend, form and retract under the cohabitation rules and bands in the way retract on their own',
    space: 'space',
    shell: 'skin',
    run: 'run',
    time: 'time',
    reset: 'restart',
    view: 'view',
  },
} as const;

/**
 * 与案例页对照图同一份配置（scripts/cohabit/case-compare.mjs），多两条：单元是方形的（`unit: 'square'`）；
 * 64 台铺满整间房（`cover: 'room'`，2026-10-27，格距 0.60 → 0.83 m、台子随之放大，家具按新格子重排）。放人放猫照 runCohabit 的摆法
 */
function makeSim(space: SpaceMode, seed: number): CohabitSim {
  const sim = new CohabitSim({
    trigger: 'posture',
    grid: COHABIT.SEATS.GRID,
    unit: 'square',
    cover: 'room',
    space,
    seed,
    opening: false,
    auto: true,
    faces: true,
    social: true,
    catFloor: true,
    cat: { ...COHABIT.CAT_MT, ...COHABIT.CAT_LEVELS.mid },
    guide: COHABIT.GUIDE,
    pace: PACE_DEMO,
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
  const timeRef = useRef<number>(TIME_DEF);
  const [timeScale, setTimeScale] = useState<number>(TIME_DEF);
  const [space, setSpace] = useState<SpaceMode>('live');
  const shellRef = useRef(true);
  const [shell, setShell] = useState(true);
  const [view, setView] = useState<ViewKey>('axon');
  const [hud, setHud] = useState<{ t: number; formed: number; total: number; counts: Record<EventKind, number>; bake: number; note: string; side: number; roomH: number }>({
    t: 0,
    formed: 0,
    total: COHABIT.SEATS.GRID * COHABIT.SEATS.GRID,
    counts: { gaze: 0, warmth: 0, touch: 0, pass: 0 },
    bake: 0,
    note: '',
    side: 0,
    roomH: (ROOM.FLOOR_Y / UNITS_PER_M),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 默认运转（2026-10-26 用户拍板：Lab 默认勾选运转，不随「减弱动态效果」关掉，MAPPING §68）
    const preset = planFromHash('2-15', SPACE_MODES.map((m) => m.key)) as SpaceMode | null;
    let spaceKey: SpaceMode = preset ?? 'live';
    if (preset) setSpace(preset);
    let seed = SCENE.seed;
    let sim = makeSim(spaceKey, seed);
    const layout = sim.layout;
    const roomM = layout.roomM;

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

    // ── 带子轨迹：三档（面 / 边 / 角）分片烘，烘完才开始跑仿真（否则头一秒里成形的单元没有形可画）────
    // 烘完之前用预览（引擎初始摆位压成的收起态，三档相同）先把立杆、天花方板、收着的单元画出来，画面不空等
    const baker = new UnitBaker();
    const topo = bandTopology(baker.n);
    let trajs: BandTrajectory[] | null = null;
    let paths: BandPaths[] | null = null;
    const pre = baker.preview();
    let rig: Rig = rigFor(layout, pre);
    setHud((h) => ({ ...h, side: platformSide(rig), total: layout.units.length }));
    {
      const flat = UNIT_ORDER.map(() => 0);
      const preLow = decimateTrajectory(pre, STOWED_STRIDE);
      const idle = bakeUnit([preLow], 1, bandTopology(preLow.n), flat); // 预览的第 1 帧 = 收起态（抽稀）
      R.addMesh('ring-stowed-a', idle.a);
      R.addMesh('ring-stowed-b', idle.b);
      R.addMesh('skin-stowed', bakeUnitSkin([preLow], 1, flat));
      const preShell = bakeUnitShell([preLow], 1, flat, SHELL_END_LOW);
      R.addMesh('shell-stowed-c', preShell.cover);
      R.addMesh('shell-stowed-g', preShell.gore);
      const plates = platesMesh(rig);
      R.addMesh('plates', bakeIndexed(plates.verts, plates.idx));
    }
    // 立杆随单元伸缩（作者「中间这根棍子也得缩上去」）：下端跟着布束底走，哪一帧变了哪一帧重烘，静止时不重传
    const postBottoms = new Float32Array(layout.units.length).fill(-1);
    const postNext = new Float32Array(layout.units.length);
    // 每台此刻的台面高度（米，离地）：朝它要去的高度匀速走（TABLE_MOVE m/s）；收在天花下时直接换成目标，落下来就是对的高度
    const tableTop = new Float32Array(layout.units.length).fill(TABLE_TOP.stand);
    const tableWant = new Float32Array(layout.units.length);
    let tableT = 0;
    const syncPosts = (): void => {
      let dirty = false;
      for (let u = 0; u < postNext.length && !dirty; u++) if (Math.abs(postNext[u] - postBottoms[u]) > 1e-3) dirty = true;
      if (!dirty) return;
      postBottoms.set(postNext);
      const posts = postsMesh(rig, layout, postBottoms);
      R.addMesh('posts', bakeIndexed(posts.verts, posts.idx));
    };
    // 逐条摆的带子网格按（档, 帧）烘一次、留在显存里；让路的带按（档, 帧, 上夹环所在帧）烘——多出来的布卷进夹环那一截截掉
    const FRAME_KEY = 256;
    const bandMeshDone = new Set<number>();
    const ensureBand = (key: number): void => {
      if (!trajs || bandMeshDone.has(key)) return;
      const tier = Math.floor(key / FRAME_KEY) % FRAME_KEY;
      const frame = key % FRAME_KEY;
      const reel = Math.floor(key / (FRAME_KEY * FRAME_KEY)) - 1;
      const reelPy = reel >= 0 ? bandTop(trajs[0], reel) : undefined;
      const m = bakeBand(trajs[tier], frame, topo, reelPy);
      R.addMesh(`band-${key}-a`, m.a);
      R.addMesh(`band-${key}-b`, m.b);
      const k = bakeBandKeys(trajs[tier], frame, reelPy);
      R.addMesh(`band-${key}-k`, k.pad);
      R.addMesh(`band-${key}-r`, k.rod);
      R.addMesh(`band-${key}-s`, bakeShellCover(trajs[tier], frame, reelPy));
      bandMeshDone.add(key);
    };
    // 每台的上下夹环与芯只随「上夹环在哪一帧」变（pickUnitBands 给的那一帧），按帧烘一次留着
    const mechDone = new Set<number>();
    const ensureMech = (frame: number): void => {
      if (!trajs || mechDone.has(frame)) return;
      const m = bakeUnitMech(trajs[0], frame);
      R.addMesh(`mech-${frame}-alu`, m.alu);
      R.addMesh(`mech-${frame}-dark`, m.dark);
      mechDone.add(frame);
    };
    // 逐块摆的膜：两侧带子帧相同就按（档 A, 档 B, 帧）烘一次留着，帧不同的逐帧现算
    const skinDone = new Set<string>();
    const ensureSkin = (ta: number, tb: number, k: number): string => {
      const id = `skin-${ta}-${tb}-${k}`;
      if (trajs && !skinDone.has(id)) {
        R.addMesh(id, bakeMembrane(trajs[ta], k, trajs[tb], k));
        skinDone.add(id);
      }
      return id;
    };
    // 逐片摆的接缝片：两侧帧相同、都没被上夹环截时按（档 A, 档 B, 帧）烘一次留着，其余逐帧现算（与膜同一套）
    const goreDone = new Set<string>();
    const ensureGore = (ta: number, tb: number, k: number): string => {
      const id = `gore-${ta}-${tb}-${k}`;
      if (trajs && !goreDone.has(id)) {
        R.addMesh(id, bakeShellGore(trajs[ta], k, trajs[tb], k));
        goreDone.add(id);
      }
      return id;
    };
    const onBaked = (): void => {
      trajs = baker.trajectories as BandTrajectory[];
      paths = trajs.map((t) => bandPaths(t));
      rig = rigFor(layout, trajs[0]);
      // 三个静止态各烘一份整台：收起（换成 r = R0 自然松弛形压成的，与预览差十几 px，肉眼几乎看不出；抽稀）/ 直带子 / 成形
      const low = trajs.map((t) => decimateTrajectory(t, STOWED_STRIDE));
      const stowed = bakeUnit(low, STEADY.stowed, bandTopology(low[0].n));
      const straight = bakeUnit(trajs, STEADY.straight, topo);
      const formed = bakeUnit(trajs, STEADY.formed, topo);
      R.addMesh('ring-stowed-a', stowed.a);
      R.addMesh('ring-stowed-b', stowed.b);
      R.addMesh('ring-straight-a', straight.a);
      R.addMesh('ring-straight-b', straight.b);
      R.addMesh('ring-formed-a', formed.a);
      R.addMesh('ring-formed-b', formed.b);
      // 键（键座、撑杆外套、扣上的内杆）：直带子与成形态各一份整台；收起态是压成一团的布，不画
      for (const [id, frame] of [['straight', STEADY.straight], ['formed', STEADY.formed]] as const) {
        const k = bakeUnitKeys(trajs, frame);
        R.addMesh(`ring-${id}-k`, k.pad);
        R.addMesh(`ring-${id}-r`, k.rod);
      }
      R.addMesh('hanger', bakeHanger());
      // 三个静止态的膜各烘一份整台
      R.addMesh('skin-stowed', bakeUnitSkin(low, STEADY.stowed));
      R.addMesh('skin-straight', bakeUnitSkin(trajs, STEADY.straight));
      R.addMesh('skin-formed', bakeUnitSkin(trajs, STEADY.formed));
      // 三个静止态的蒙皮（盖片 / 接缝片）各烘一份整台；收起态用抽稀的那份
      for (const [id, src, frame, end] of [
        ['stowed', low, STEADY.stowed, SHELL_END_LOW],
        ['straight', trajs, STEADY.straight, undefined],
        ['formed', trajs, STEADY.formed, undefined],
      ] as const) {
        const sh = bakeUnitShell(src, frame, UNIT_ORDER, end);
        R.addMesh(`shell-${id}-c`, sh.cover);
        R.addMesh(`shell-${id}-g`, sh.gore);
      }
    };

    // ── 人与猫：按「姿态 + 步态相位格」各烘一份静态网格（每种颜色一件，身子与头分开），摆放走 drawMeshAt，每帧不重烘 ──
    // 穿着与花色：每一场（开场与每次「重来」）洗一副牌、按出场顺序发，同一场里人不撞衫、猫不重样（2026-10-28 作者「随机，不要重复就行」）
    const newLooks = (): { people: { deal: () => number; got: WeakMap<object, number> }; cats: { deal: () => number; got: WeakMap<object, number> } } => ({
      people: { deal: dealLooks(OUTFITS.length), got: new WeakMap() },
      cats: { deal: dealLooks(COATS.length), got: new WeakMap() },
    });
    let looks = newLooks();
    const lookOf = (who: object, pool: { deal: () => number; got: WeakMap<object, number> }): number => {
      let i = pool.got.get(who);
      if (i === undefined) pool.got.set(who, (i = pool.deal()));
      return i;
    };
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
    /** 同一份网格、同一套配色的一批摆放（人按穿着、猫按花色上色；paintKey 区分配色） */
    type Paint = (tone: Tone) => [[number, number, number], [number, number, number]];
    type Batch = { r: BodyRig; key: string; paint: Paint; body: MeshPlace[]; head: MeshPlace[] };
    /** 一副 Rig 摆一处：身子 yaw + 平移，头绕枢轴再转 headTurn（世界坐标） */
    const placeBoth = (batches: Map<string, Batch>, r: BodyRig, key: string, paintKey: string, paint: Paint, x: number, y: number, z: number, yaw: number, headTurn: number): void => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const id = `${key}#${paintKey}`;
      let b = batches.get(id);
      if (!b) batches.set(id, (b = { r, key, paint, body: [], head: [] }));
      b.body.push({ yaw, x, y, z });
      b.head.push({ yaw: yaw + r.headYaw + headTurn, x: r.pivot[0] * c - r.pivot[2] * s + x, y: r.pivot[1] + y, z: r.pivot[0] * s + r.pivot[2] * c + z });
    };
    const drawBatches = (batches: Map<string, Batch>): void => {
      for (const b of batches.values())
        for (const part of b.r.parts) {
          const [dark, lite] = b.paint(part.tone);
          R.drawMeshAt(`${b.key}:${part.on}:${part.tone}`, part.on === 'body' ? b.body : b.head, dark, lite);
        }
    };

    // 每条带在成形段两条路上走到哪一格（stepBandCursor：涨走正向路、退走回程路，反向时跳到另一条路上形状最近的格）
    const cursors = bandCursors(layout.units.length * BANDS);
    const frameOf = new Int32Array(layout.units.length * BANDS);

    // 膜的摆放（本帧收集、实体画完后再画）
    let skinStowed: MeshPlace[] = [];
    let skinStraight: MeshPlace[] = [];
    let skinFormed: MeshPlace[] = [];
    const skinPerKey = new Map<string, MeshPlace[]>();
    const skinLoose: { data: Float32Array; place: MeshPlace }[] = [];
    // 蒙皮的摆放（不透明，实体那一轮里画）
    const coverPerKey = new Map<number, MeshPlace[]>();
    const gorePerKey = new Map<string, MeshPlace[]>();
    const goreLoose: { data: Float32Array; place: MeshPlace }[] = [];
    const render = (): void => {
      const shellOn = shellRef.current;
      R.beginFrame(cam);
      skinStowed = [];
      skinStraight = [];
      skinFormed = [];
      R.drawMesh('room', IDENT, ROOM_DARK, ROOM_LITE);
      R.drawMesh('furniture', IDENT, FURN_DARK, FURN_LITE);
      if (sim.space !== 'empty') {
        R.drawMesh('plates', IDENT, RAIL_DARK, RAIL_LITE);
        const stowedPlaces: MeshPlace[] = [];
        const straightPlaces: MeshPlace[] = [];
        const formedPlaces: MeshPlace[] = [];
        const perFrame = new Map<number, MeshPlace[]>();
        const mechPlaces = new Map<number, MeshPlace[]>();
        const hangerPlaces: MeshPlace[] = [];
        skinPerKey.clear();
        skinLoose.length = 0;
        coverPerKey.clear();
        gorePerKey.clear();
        goreLoose.length = 0;
        const at = (c: { x: number; z: number }, yaw: number, y: number): MeshPlace => ({ yaw, x: c.x, y, z: c.z, s: rig.s });
        // 这一帧每台该落到哪个高度：平面模型此刻把它当谁的桌子（COHABIT.TABLE、sim.tableBy）就落到那件家具的桌子高度，其余落到站着用的高度
        tableWant.fill(TABLE_TOP.stand);
        if (sim.furn) for (let u = 0; u < layout.units.length; u++) if (sim.tableBy[u] >= 0) tableWant[u] = tableTopFor(sim.furn.rects[sim.tableBy[u]]);
        const dtT = Math.max(0, Math.min(0.1 * timeRef.current, sim.t - tableT));
        tableT = sim.t;
        for (let u = 0; u < layout.units.length; u++) {
          const c = rig.cells[u];
          // 轨迹还没烘完：仿真没开跑，全场都收在天花下
          if (!trajs) {
            stowedPlaces.push(at(c, 0, rig.stowY));
            postNext[u] = unitFootY(rig, pre.footY, 0);
            continue;
          }
          const deg = sim.act.degree[u];
          // 整束布的高度跟单元的升降程度走；让路的带走收直回程、按上夹环截（pickUnitBands）；立杆下端跟布束底
          const drop = unitDrop(deg);
          if (drop <= 1e-3) tableTop[u] = tableWant[u];
          else {
            const d = tableWant[u] - tableTop[u];
            tableTop[u] += Math.sign(d) * Math.min(Math.abs(d), TABLE_MOVE * dtT);
          }
          const workY = rigYForTop(rig, trajs[0], tableTop[u]);
          const top = unitTopY(rig, drop, workY);
          let allStowed = true;
          let allStraight = true;
          let allFormed = true;
          // 每条带取哪一帧、上夹环在哪（让路的带走引擎的收直回程，多出来的布卷进夹环；见 pickUnitBands）
          const reel = pickUnitBands(u, deg, sim.bandOpen, trajs, paths as BandPaths[], cursors, frameOf);
          const reelTop = bandTop(trajs[0], reel);
          // 机构：上夹环在带顶（reel 那一帧）、下夹环在钉住端、芯在两者之间（按帧缓存的一份）；吊杆从天花方板下沿（y 0）拉到上夹环法兰顶
          let mp = mechPlaces.get(reel);
          if (!mp) mechPlaces.set(reel, (mp = []));
          mp.push(at(c, 0, top));
          const flangeTop = top + rig.s * (-reelTop * SOLID.SCALE - MECH.TOP - MECH.FLANGE_H);
          if (flangeTop > 1e-3) hangerPlaces.push({ yaw: 0, x: c.x, y: 0, z: c.z, s: rig.s, sy: flangeTop / rig.s });
          for (let j = 0; j < BANDS; j++) {
            const k = frameOf[u * BANDS + j];
            if (k !== STEADY.stowed) allStowed = false;
            if (k !== STEADY.straight) allStraight = false;
            if (k !== STEADY.formed) allFormed = false;
          }
          if (allStowed) stowedPlaces.push(at(c, 0, top));
          else if (allStraight) straightPlaces.push(at(c, 0, top));
          else if (allFormed) formedPlaces.push(at(c, 0, top));
          else {
            // 蒙皮开着时，带子与键只在有门的单元里画（从门口看得见里面）；其余全包在皮里
            let door = false;
            for (let j = 0; j < BANDS && !door; j++) if (sim.bandOpen[u * BANDS + j] > DOOR_EPS) door = true;
            const bandsShow = !shellOn || door;
            for (let j = 0; j < BANDS; j++) {
              const fk = frameOf[u * BANDS + j];
              const clip = bandTop(trajs[UNIT_ORDER[j]], fk) > reelTop + 1e-9 ? reel + 1 : 0;
              const k = (clip * FRAME_KEY + UNIT_ORDER[j]) * FRAME_KEY + fk;
              if (bandsShow) {
                let list = perFrame.get(k);
                if (!list) perFrame.set(k, (list = []));
                list.push(at(c, bandAngle(j), top));
              }
              if (shellOn) {
                let list = coverPerKey.get(k);
                if (!list) coverPerKey.set(k, (list = []));
                list.push(at(c, bandAngle(j), top));
              }
              // 带 j 与带 j+1 之间：蒙皮开着画接缝片，关着画膜
              const j2 = (j + 1) % BANDS;
              const ka = frameOf[u * BANDS + j];
              const kb = frameOf[u * BANDS + j2];
              const doorA = sim.bandOpen[u * BANDS + j] > DOOR_EPS;
              const doorB = sim.bandOpen[u * BANDS + j2] > DOOR_EPS;
              if (shellOn) {
                // 接缝片只在门的边上张开（一侧让路、一侧没让）；两侧都在让路照连
                if (!shellJoins(ka, kb, undefined, doorA, doorB)) continue;
                const clipB = bandTop(trajs[UNIT_ORDER[j2]], kb) > reelTop + 1e-9;
                if (ka === kb && !clip && !clipB) {
                  const id = ensureGore(UNIT_ORDER[j], UNIT_ORDER[j2], ka);
                  let gl = gorePerKey.get(id);
                  if (!gl) gorePerKey.set(id, (gl = []));
                  gl.push(at(c, bandAngle(j), top));
                } else goreLoose.push({ data: bakeShellGore(trajs[UNIT_ORDER[j]], ka, trajs[UNIT_ORDER[j2]], kb, reelTop), place: at(c, bandAngle(j), top) });
                continue;
              }
              // 让路的带两侧不拉膜：那里是门（拉了就是一片从平贴的带斜扯到台缘的布）
              if (!membraneJoins(ka, kb, undefined, doorA, doorB)) continue;
              if (ka === kb) {
                const id = ensureSkin(UNIT_ORDER[j], UNIT_ORDER[j2], ka);
                let sl = skinPerKey.get(id);
                if (!sl) skinPerKey.set(id, (sl = []));
                sl.push(at(c, bandAngle(j), top));
              } else skinLoose.push({ data: bakeMembrane(trajs[UNIT_ORDER[j]], ka, trajs[UNIT_ORDER[j2]], kb), place: at(c, bandAngle(j), top) });
            }
          }
        }
        if (trajs) {
          R.drawMeshAt('hanger', hangerPlaces, ALU_DARK, ALU_LITE);
          for (const [frame, places] of mechPlaces) {
            ensureMech(frame);
            R.drawMeshAt(`mech-${frame}-alu`, places, ALU_DARK, ALU_LITE);
            R.drawMeshAt(`mech-${frame}-dark`, places, MECH_DARK, MECH_LITE);
          }
        } else {
          // 轨迹烘完之前（仿真没开跑）：沿用一根方杆的预览
          syncPosts();
          R.drawMesh('posts', IDENT, RAIL_DARK, RAIL_LITE);
        }
        if (shellOn) {
          // 静止态整台只画蒙皮（带子、键、膜都包在里面）
          for (const [id, places] of [['stowed', stowedPlaces], ['straight', straightPlaces], ['formed', formedPlaces]] as const) {
            R.drawMeshAt(`shell-${id}-c`, places, SHELL_DARK, SHELL_LITE);
            R.drawMeshAt(`shell-${id}-g`, places, SEAM_DARK, SEAM_LITE);
          }
        } else {
          R.drawMeshAt('ring-stowed-a', stowedPlaces, DARK_A, LITE_A);
          R.drawMeshAt('ring-stowed-b', stowedPlaces, DARK_B, LITE_B);
          R.drawMeshAt('ring-straight-a', straightPlaces, DARK_A, LITE_A);
          R.drawMeshAt('ring-straight-b', straightPlaces, DARK_B, LITE_B);
          R.drawMeshAt('ring-formed-a', formedPlaces, DARK_A, LITE_A);
          R.drawMeshAt('ring-formed-b', formedPlaces, DARK_B, LITE_B);
          R.drawMeshAt('ring-straight-k', straightPlaces, PAD_DARK, PAD_LITE);
          R.drawMeshAt('ring-formed-k', formedPlaces, PAD_DARK, PAD_LITE);
          R.drawMeshAt('ring-formed-r', formedPlaces, ROD_DARK, ROD_LITE);
          skinStowed = stowedPlaces;
          skinStraight = straightPlaces;
          skinFormed = formedPlaces;
        }
        for (const [k, places] of perFrame) {
          ensureBand(k);
          R.drawMeshAt(`band-${k}-a`, places, DARK_A, LITE_A);
          R.drawMeshAt(`band-${k}-b`, places, DARK_B, LITE_B);
          R.drawMeshAt(`band-${k}-k`, places, PAD_DARK, PAD_LITE);
          R.drawMeshAt(`band-${k}-r`, places, ROD_DARK, ROD_LITE);
        }
        for (const [k, places] of coverPerKey) {
          ensureBand(k);
          R.drawMeshAt(`band-${k}-s`, places, SHELL_DARK, SHELL_LITE);
        }
        for (const [id, places] of gorePerKey) R.drawMeshAt(id, places, SEAM_DARK, SEAM_LITE);
        for (const l of goreLoose) R.drawDynamicMesh(l.data, SEAM_DARK, SEAM_LITE, undefined, [l.place]);
      }
      // 人：走（步态按走过的路程推相位）/ 站 / 坐（按这张家具的座面解出来；看着猫时前倾）；头随视线转，夹在 ±75°
      const people = new Map<string, Batch>();
      for (const p of sim.people) {
        const variant = lookOf(p, looks.people);
        const style = outfitOf(variant).style;
        const sk = styleKey(style);
        const mo = track(p, p.walker.x, p.walker.y);
        const seat = p.seated && p.seat !== null ? sim.seats[p.seat] : null;
        const rect = seat && sim.furn ? sim.furn.rects[seat.furn] : null;
        let key = `p-stand|${sk}`;
        let r: BodyRig;
        let heading = p.walker.heading;
        let { x, y } = sim.drawPos(p);
        if (seat && rect) {
          const s = seatSpecOf(rect, seat);
          const lean = p.watching !== null && !p.ignores;
          key = `p-sit-${s.front.toFixed(3)}-${s.back.toFixed(3)}-${lean ? 1 : 0}|${sk}`;
          r = rigOf(key, () =>
            humanRig({
              height: FIGURE.HEIGHT,
              pose: 'sit',
              lean,
              style,
              seat: { top: s.top * UNITS_PER_M, front: s.front * UNITS_PER_M, back: s.back * UNITS_PER_M, thick: s.thick * UNITS_PER_M, backTop: s.backTop * UNITS_PER_M },
            }),
          );
          heading = Math.atan2(seat.face[1], seat.face[0]);
          x = seat.x;
          y = seat.y;
        } else if (mo.speed > MOVING.person) {
          const k = Math.floor(frac(mo.dist / STRIDE_M) * WALK_FRAMES.person) % WALK_FRAMES.person;
          key = `p-walk-${k}|${sk}`;
          r = rigOf(key, () => humanRig({ height: FIGURE.HEIGHT, pose: 'walk', phase: k / WALK_FRAMES.person, style }));
        } else r = rigOf(key, () => humanRig({ height: FIGURE.HEIGHT, pose: 'stand', style }));
        placeBoth(people, r, key, `v${variant}`, (tone) => personColor(tone, variant), x * UNITS_PER_M, ROOM.FLOOR_Y, y * UNITS_PER_M, figureYaw(heading), clampHeadYaw(p.walker.gaze - heading));
      }
      drawBatches(people);
      // 猫：台上的顺着方台内切圆那一圈坐 / 蜷 / 走（身子绕着立杆弯过去，不穿杆）、跨台时贴着芯的一侧跳过去；地面上的照平面位置。
      // 成形段才有台面（落到位的直筒还没有平台）：脚下的台程度到顶才把猫画在平台面上
      const band = trajs ? platformBand(rig, trajs) : null;
      const cats = new Map<string, Batch>();
      sim.cats.forEach((c) => {
        const look = coatOf(lookOf(c, looks.cats));
        const mo = track(c, c.walker.x, c.walker.y);
        const support = sim.space === 'empty' ? [] : sim.supportOf(c);
        const formed = band !== null && support.length > 0 && support.every((u) => sim.act.degree[u.i] >= 1 - 1e-3);
        const pl = catPlacement({ x: c.walker.x, y: c.walker.y, heading: c.walker.heading, state: c.state }, support, formed, mo.speed > MOVING.cat, layout, band ?? { R: 0 });
        const k = pl.pose === 'walk' ? Math.floor(frac(mo.dist / CAT.STRIDE) * WALK_FRAMES.cat) % WALK_FRAMES.cat : 0;
        const key = `c-${pl.pose}-${pl.tail}-${pl.bend.toFixed(3)}-${k}|${look.coat}`;
        const r = rigOf(key, () => catRig({ unit: UNITS_PER_M, pose: pl.pose, tail: pl.tail, bend: pl.bend, phase: k / WALK_FRAMES.cat, coat: look.coat }));
        // 台上的猫站在自己那台的台面上（各台高度不同）；跨台时取两台里高的那台
        const under = support.length ? Math.max(...support.map((u) => tableTop[u.i])) : TABLE_TOP.stand;
        const footY = pl.onPlatform ? ROOM.FLOOR_Y - under * UNITS_PER_M - pl.lift * UNITS_PER_M : ROOM.FLOOR_Y;
        placeBoth(cats, r, key, look.coat, (tone) => catColor(tone, look), pl.x * UNITS_PER_M, footY, pl.y * UNITS_PER_M, figureYaw(pl.heading), clampHeadYaw(pl.headTurn, CAT_HEAD_YAW_MAX));
      });
      drawBatches(cats);
      // 膜：半透明，实体（带子、立杆、人、猫、家具）都画完之后再画；整台的按视深从远到近
      if (sim.space !== 'empty' && trajs) {
        const M = cam.matrix;
        const far = (a: MeshPlace, b: MeshPlace): number => M[6] * a.x + M[8] * a.z - (M[6] * b.x + M[8] * b.z);
        R.drawMeshAt('skin-stowed', skinStowed.sort(far), MEM_DARK, MEM_LITE, SKIN_ALPHA);
        R.drawMeshAt('skin-straight', skinStraight.sort(far), MEM_DARK, MEM_LITE, SKIN_ALPHA);
        R.drawMeshAt('skin-formed', skinFormed.sort(far), MEM_DARK, MEM_LITE, SKIN_ALPHA);
        for (const [id, places] of skinPerKey) R.drawMeshAt(id, places, MEM_DARK, MEM_LITE, SKIN_ALPHA);
        for (const l of skinLoose) R.drawDynamicMesh(l.data, MEM_DARK, MEM_LITE, SKIN_ALPHA, [l.place]);
      } else if (sim.space !== 'empty' && !shellOn) R.drawMeshAt('skin-stowed', skinStowed, MEM_DARK, MEM_LITE, SKIN_ALPHA);
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
      const key = `${Math.floor(s.t)}|${s.formed}|${s.ledger.counts.gaze}|${s.ledger.counts.warmth}|${s.ledger.counts.touch}|${s.ledger.counts.pass}|${trajs ? 1 : Math.round(baker.progress * 20)}`;
      if (key === lastHud) return;
      lastHud = key;
      setHud((h) => ({ ...h, t: s.t, formed: s.formed, counts: { ...s.ledger.counts }, bake: trajs ? 1 : baker.progress }));
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
    // 离屏只用空闲时间烘（2026-10-28 性能排查）：/lab 上这台排在倒数第二，原先进页面就满速开烘，
    // 主线程白忙好几秒、拖慢最上面正在看的几台。离屏时只拿帧与帧之间剩下的空闲（requestIdleCallback；
    // Safari 没有它，退成每 50ms 烘 4ms），离视口一屏以内才换回满速。已烘过（同一标签页里别处烘的，结果按配置缓存）直接用。
    const ric = typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback.bind(window) : null;
    let idleId: number | null = null;
    let near = false;
    const idleTick = (deadline?: IdleDeadline): void => {
      idleId = null;
      bakeTimer = null;
      if (near || trajs) return;
      // 页面一直不空闲时 timeout 也会叫一次，此时剩余为 0——至少推 2ms，保证慢慢有进展
      if (baker.work(deadline ? Math.max(2, Math.min(BAKE_BUDGET_MS, deadline.timeRemaining())) : 4)) {
        onBaked();
        render();
        pushHud();
        return;
      }
      scheduleIdle();
    };
    const scheduleIdle = (): void => {
      if (ric) idleId = ric(idleTick, { timeout: 1000 });
      else bakeTimer = setTimeout(idleTick, 50);
    };
    let bakeIo: IntersectionObserver | null = null;
    const startBake = (): void => {
      near = true;
      bakeIo?.disconnect();
      bakeIo = null;
      if (idleId !== null) window.cancelIdleCallback(idleId);
      idleId = null;
      if (bakeTimer !== null) clearTimeout(bakeTimer);
      bakeTimer = trajs ? null : setTimeout(bakeTick, 0);
    };
    if (baker.done || typeof IntersectionObserver === 'undefined') startBake();
    else {
      bakeIo = new IntersectionObserver((ents) => ents[ents.length - 1].isIntersecting && startBake(), { rootMargin: '100% 0px' });
      bakeIo.observe(canvas);
      scheduleIdle();
    }

    const step = (dt: number): void => {
      if (trajs && runningRef.current) {
        let left = Math.min(MAX_SIM_DT, dt) * timeRef.current;
        while (left > 1e-9) {
          const h = Math.min(MAX_SIM_DT, left);
          sim.step(h);
          left -= h;
        }
      }
      cam.tick(dt);
      render();
      pushHud();
    };

    const rebuild = (): void => {
      sim = makeSim(spaceKey, seed);
      looks = newLooks();
      bakeFurniture();
      resetBandCursors(cursors);
      tableTop.fill(TABLE_TOP.stand);
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
      bakeIo?.disconnect();
      if (idleId !== null) window.cancelIdleCallback(idleId);
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
          <div className="dim">{t.sub(hud.side, hud.roomH)}</div>
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
              <label title={lang === 'zh' ? '单元的外表面；关掉可看里面的带子、键与带间的膜' : 'The units’ outer surface; turn it off to see the bands, keys and membranes inside'}>
                <input
                  type="checkbox"
                  checked={shell}
                  onChange={(e) => {
                    shellRef.current = e.target.checked;
                    setShell(e.target.checked);
                    apiRef.current?.redraw();
                  }}
                />
                {t.shell}
              </label>
            </div>
            <div className="grp">
              <LabControlLabel help={['仿真播放倍速。', 'Simulation playback rate.']}>{t.time}</LabControlLabel>
              <span className="seg">
                {TIME_SCALES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={k === timeScale ? 'active' : undefined}
                    onClick={() => {
                      timeRef.current = k;
                      setTimeScale(k);
                    }}
                  >
                    ×{k}
                  </button>
                ))}
              </span>
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
