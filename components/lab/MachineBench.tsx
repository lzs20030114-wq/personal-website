'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed, bakeRuledPoints, bakeSkinned, type CellFrame } from '../../src/lib/linkage/gl3d';
import { CriticallyDamped } from '../../src/lib/linkage/motion';
import { armFrame, armPolyline, idleContraction } from '../../src/lib/linkage/machine-arm';
import {
  MESH_GROUPS as ARM_MESH_GROUPS,
  STATIONS as ARM_STATIONS,
  CHAINS as ARM_CHAINS,
} from '../../src/lib/linkage/tentacle3d-shape';
import {
  GUIDE3,
  ROOTB3,
  SPINE3,
  TENTACLE3D,
  applyContraction3,
  createTentacle3,
  tendonVisual3,
} from '../../src/lib/linkage/tentacle3d-data';
import { bandTriIndex, bandVerts, bandsFarToNear, resample } from '../../src/lib/linkage/skin';
import type { Vec3 } from '../../src/lib/linkage/solver3d';
import {
  MACHINE_GROUPS,
  MACHINE_MESH_URL,
  MACHINE_DIR,
  MACHINE_OMEGA,
  MACHINE_SWEEP,
  type MachinePartKind,
  apexHeight,
  clampTheta,
  createMachine,
  isFolding,
  machineFrame,
  machineMaxError,
  phaseDeg,
  runMachine,
  stepMachine,
  thetaAtStroke,
  visibleGroups,
} from '../../src/lib/linkage/machine';
import { SHELL_STEP_DT, ringOuterProfile, ringPoint } from '../../src/lib/linkage/shell3d';
import {
  SMALLARM,
  SMALLARM_IDLE,
  createSmallArm,
  driveSmallArm,
  idleSwing,
  smallArmPose,
  stepSmallArm,
} from '../../src/lib/linkage/machine-smallarm';
import { SMALLARM_PLACEMENTS } from '../../src/lib/linkage/machine-shape';
import { stashBench, takeBench } from './handoff';
import { setSnapshot } from './snapshot';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.05 整机台架（spec = 轮回机器_整机spec.md，用户 2026-07-29 拍板「整机传动 + 真实实体」）。
 *
 * 与 Lab.04 的分工：Lab.04 看单个壳体五环怎么折叠（线稿 + 可调遮罩织纹）；
 * 这里看**整台机器怎么被一台电机驱动**——一根中间轴带五个不同半径的曲柄（同相），
 * 五根不同长度的连杆推五个环的拱顶，全机只有一个自由度。
 *
 * 形体是真机实体（729新参考.3dm 装配位逐面取网格）：66 块角化板各自绑自己的三角、
 * 3 件配件跟销、5 个单杆轮随 θ 转、5 根驱动杆由两点定位姿；机架烘死为静件。
 * 分组与绑定见 machine-shape.ts，位姿计算在 machine.ts（可单测，与渲染无关）。
 *
 * **小触手也是活件**（2026-07-30 用户给出机构说明后由静件转正）：底座固定、
 * SG90 驱动大节绕圆形轴心甩动、软性中间件连被动小块——受迫大摆 + 柔性被动小摆，
 * 2D 内核解算（machine-smallarm.ts），软杆用双骨蒙皮渲染。
 *
 * **大触手是活件**：查明它就是 Lab.03 那条三肌腱触手（椎节沿臂位置与 STATIONS 逐位
 * 吻合），故整套复用 tentacle3d 的解算与网格，本台架只把它摆到机器上
 * （machine-arm 的刚体变换，落位参数由 gen_machine.py 实测生成）。
 *
 * 运动学一行没新写——五环销坐标与 shell3d-data 逐位相同，直接复用其解算与止程标定。
 *
 * 规格表须写明的局限（spec §7）：转速非真机节律（减速比无出处）、小触手波形是
 * 展示编排非真机节律、脚槽止程是仿真标定值非真机实测。
 */

const VIEWS = [
  { key: 'axon', label: '轴测' },
  { key: 'front', label: '正' },
  { key: 'left', label: '左' },
  { key: 'right', label: '右' },
  { key: 'top', label: '顶' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

// 族系配色与 Lab.04 同一套（S1 绿 → S5 紫），保证两台之间环的身份读得通
const COLS: [number, number, number][] = [
  [0.55, 0.78, 0.52],
  [0.7, 0.84, 0.64],
  [0.88, 0.9, 0.84],
  [0.8, 0.76, 0.92],
  [0.7, 0.62, 0.94],
];
/** 实体件的明暗端色：比 Lab.04 的遮罩亮得多——那是要透光的纱，这是要看清的零件。 */
const shade = (c: [number, number, number]): { dark: [number, number, number]; lite: [number, number, number] } => ({
  dark: [c[0] * 0.16, c[1] * 0.16, c[2] * 0.16],
  lite: [c[0] * 0.86, c[1] * 0.86, c[2] * 0.86],
});
/** 机架：中性钢色，压暗让五环的彩色浮出来 */
const FRAME_SHADE = { dark: [0.1, 0.11, 0.12], lite: [0.5, 0.53, 0.56] } as const;
/** 触手：静件且不参与运动，再压一档，避免抢主体 */
const TENT_SHADE = { dark: [0.09, 0.09, 0.1], lite: [0.38, 0.38, 0.42] } as const;

// 蒙皮：与 Lab.04 同参（RingsBench 头注有完整由来）。默认不透明度 0.67 是
// 用户 2026-07-29 拍板的值（初版 0.22 求「看清里面的传动链」，用户要「调高一点」）——
// 这台同时是项目 01 的主图，主图要先读出**这是一台什么形态的机器**，
// 传动链交给控制面板的蒙皮滑块（拉到 0 即可看穿）。
const SKIN_SAMPLES = 41;
const SKIN_U = 58;
const SKIN_V = 11;
const SKIN_DOT_R = 1.75;
const SKIN_DEFAULT = 0.67;
const SKIN_OPAQUE_AT = 0.985;
const dotAlpha = (a: number): number => Math.min(0.72, a * 1.8);
const SKIN_IDX = bandTriIndex(SKIN_SAMPLES);
/** 带 ri 的遮罩面明暗端色：取两环色中值压暗（同 Lab.04 的 bandShade） */
const bandShade = (ri: number): { dark: [number, number, number]; lite: [number, number, number] } => {
  const m = COLS[ri].map((c, k) => (c + COLS[ri + 1][k]) / 2) as [number, number, number];
  return {
    dark: [m[0] * 0.13, m[1] * 0.13, m[2] * 0.13],
    lite: [m[0] * 0.62, m[1] * 0.62, m[2] * 0.62],
  };
};

/** 大触手网格：与 Lab.03 同一份载荷（同一条触手，浏览器会命中缓存） */
const ARM_MESH_URL = '/mesh/tentacle3d-mesh.bin';
/** 三腱线色：与 Lab.03 同族（绿 / 紫 / 中灰） */
const TENDON_C: [number, number, number][] = [
  [0.62, 0.82, 0.58],
  [0.76, 0.7, 0.92],
  [0.72, 0.74, 0.7],
];
const ARM_SHADE = { dark: [0.1, 0.11, 0.11], lite: [0.52, 0.54, 0.5] } as const;

const CHASE_OMEGA = 2.5;
const VIEW_ANIM_S = 0.35;

/**
 * 跨路由交接的状态包（handoff.ts）。存的是**机构此刻的位形**，不是组件实例——
 * 五环各自的节点坐标 + 曲柄角，触手的节点坐标 + 三腱收缩率 + 待机时钟。
 * 位形直接摆上去，比「设个 θ 让它自己解过去」可靠：同一个 θ 有不止一个合法解
 * （07-17 S3 坍缩就是这么来的），重解未必回到原来那支。
 */
interface MachineHandoff {
  theta: number;
  ringTheta: number[];
  ringPts: Float32Array[];
  armPts: Float32Array;
  armClock: number;
  armManual: boolean;
  tendons: [number, number, number];
  running: boolean;
  dir: 1 | -1;
  omega: number;
  /** 小触手：每条的 2D 节点位形 + 驱动角 + 共用时钟（2026-07-30 活化后加入） */
  saPts: Float32Array[];
  saTheta: number[];
  saClock: number;
}
const HANDOFF_KEY = 'machine';

type M3 = number[];
type Quat = [number, number, number, number];
const mul3 = (a: M3, b: M3): M3 => {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
};
const rotX3 = (t: number): M3 => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const rotY3 = (t: number): M3 => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const rotZ3 = (t: number): M3 => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
const VIEW_FRONT = rotX3(Math.PI / 2);
const PRESET_VIEWS: Record<ViewKey, M3> = {
  axon: mul3(rotZ3(-1.053336), mul3(rotX3(0.735843), rotY3(0.867459))),
  front: VIEW_FRONT,
  left: mul3(VIEW_FRONT, rotZ3(-Math.PI / 2)),
  right: mul3(VIEW_FRONT, rotZ3(Math.PI / 2)),
  top: rotZ3(0),
};

// 四元数 slerp（照搬 RingsBench：矩阵直插会走非刚体路径）
function m2q(m: readonly number[]): Quat {
  const tr = m[0] + m[4] + m[8];
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    return [s / 4, (m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s];
  }
  if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    return [(m[7] - m[5]) / s, s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s];
  }
  if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    return [(m[2] - m[6]) / s, (m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s];
  }
  const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
  return [(m[3] - m[1]) / s, (m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4];
}
function q2m(q: Quat): M3 {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}
function slerpQ(a: Quat, b: Quat, t: number): Quat {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (dot < 0) {
    bb = [-b[0], -b[1], -b[2], -b[3]];
    dot = -dot;
  }
  let w0: number;
  let w1: number;
  if (dot > 0.9995) {
    w0 = 1 - t;
    w1 = t;
  } else {
    const th = Math.acos(Math.min(1, dot));
    const s = Math.sin(th);
    w0 = Math.sin((1 - t) * th) / s;
    w1 = Math.sin(t * th) / s;
  }
  const q: Quat = [
    w0 * a[0] + w1 * bb[0],
    w0 * a[1] + w1 * bb[1],
    w0 * a[2] + w1 * bb[2],
    w0 * a[3] + w1 * bb[3],
  ];
  const n = Math.hypot(...q) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** 组名 → 明暗端色（环件取族系色，静件取中性） */
function groupShade(name: string): { dark: [number, number, number]; lite: [number, number, number] } {
  if ('pxwr'.includes(name[0])) {
    const ri = Number(name[1]);
    if (Number.isInteger(ri) && ri >= 0 && ri < COLS.length) return shade(COLS[ri]);
  }
  if (name === 'tentacle') return { dark: [...TENT_SHADE.dark], lite: [...TENT_SHADE.lite] };
  return { dark: [...FRAME_SHADE.dark], lite: [...FRAME_SHADE.lite] };
}

/** 转速滑块范围（rad/s）。默认沿用 shell3d 的 0.8——**不是真机节律**，
 *  减速比图上没标（spec §7 第一条局限）。给滑块正是为了让用户自己找手感值。 */
const OMEGA_MIN = 0.1;
const OMEGA_MAX = 2.4;

/** 相位滑块上限 = 往复行程 180°（不是 360——中间轴不整周转） */
const PHASE_MAX = Math.round((MACHINE_SWEEP * 180) / Math.PI);

const PARTS: ReadonlyArray<MachinePartKind> = ['rings', 'drive', 'frame', 'tentacle'];
/** 环选择器：null = 全部 */
const RING_KEYS = [null, 0, 1, 2, 3, 4] as const;

const COPY = {
  zh: {
    run: '运转',
    persp: '透视',
    speed: '转速',
    speedAria: '转速（非真机节律，减速比无出处）',
    phase: '相位',
    parts: '部件',
    skin: '蒙皮',
    skinAria: '蒙皮遮罩透明度：0 全透明，1 不透明',
    partNames: { rings: '环身', drive: '传动', frame: '机架', tentacle: '触手' },
    arm: '肌腱',
    sarm: '小触手',
    sarmAmp: '摆幅',
    sarmFreq: '频率',
    sarmAmpAria: '小触手摆幅（度）',
    sarmFreqAria: '小触手摆动频率（Hz）',
    armAria: ['肌腱 1 收缩', '肌腱 2 收缩', '肌腱 3 收缩'],
    armHome: '交还待机',
    ring: '单环',
    ringAll: '全部',
    view: '视角',
    views: { axon: '轴测', front: '正', left: '左', right: '右', top: '顶' },
    title: '整机传动',
    sub: '一轴五曲柄 · 同相 · 180° 往复张合',
    hint: '视角由下方按钮切换',
    drive: { spin: '自转', slider: '滑杆' },
    // 方向指示用盘点 §6 的既有口径：φ=0 伸展死点 / φ=180 折叠死点
    going: { fold: '折叠 ↓', open: '伸展 ↑' },
    aria: '轮回机器整机台架；曲柄角与肌腱驱动，视角按钮切换',
    loading: '载入实体…',
  },
  en: {
    run: 'Run',
    persp: 'Perspective',
    speed: 'Speed',
    speedAria: 'Speed (not the hardware cadence — gear ratio unknown)',
    phase: 'Phase',
    parts: 'Parts',
    skin: 'Skin',
    skinAria: 'Skin opacity: 0 clear, 1 solid',
    partNames: { rings: 'Rings', drive: 'Drive', frame: 'Frame', tentacle: 'Arms' },
    arm: 'Tendons',
    sarm: 'Small arms',
    sarmAmp: 'swing',
    sarmFreq: 'rate',
    sarmAmpAria: 'Small-arm swing amplitude (degrees)',
    sarmFreqAria: 'Small-arm swing frequency (Hz)',
    armAria: ['Tendon 1 contraction', 'Tendon 2 contraction', 'Tendon 3 contraction'],
    armHome: 'Idle',
    ring: 'Ring',
    ringAll: 'All',
    view: 'View',
    views: { axon: 'Axon', front: 'Front', left: 'Left', right: 'Right', top: 'Top' },
    title: 'Full transmission',
    sub: 'One shaft, five cranks · in phase · 180° reciprocating',
    hint: 'View set by the buttons below',
    drive: { spin: 'spin', slider: 'slider' },
    going: { fold: 'folding ↓', open: 'extending ↑' },
    aria: 'Reincarnation machine full-assembly bench; crank and tendon driven, view set by buttons',
    loading: 'loading solids…',
  },
} as const;

export function MachineBench({
  spin = true,
  active = true,
  controls = true,
  onLight = false,
  sideControls = false,
  ptTarget = false,
  lang = 'zh',
}: {
  spin?: boolean;
  active?: boolean;
  controls?: boolean;
  onLight?: boolean;
  sideControls?: boolean;
  ptTarget?: boolean;
  lang?: 'zh' | 'en';
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<{
    step: (dt: number) => void;
    setPhase: (deg: number) => void;
    setRun: (on: boolean) => void;
    setOmega: (w: number) => void;
    setPersp: (on: boolean) => void;
    setSkin: (a: number) => void;
    setShow: (s: Record<MachinePartKind, boolean>) => void;
    setIsolate: (ri: number | null) => void;
    setTendon: (k: number, v: number) => void;
    armHome: () => void;
    setSaSwing: (ampDeg: number, freqHz: number) => void;
    viewTo: (k: ViewKey) => void;
  } | null>(null);
  const [run, setRun] = useState(spin);
  const [persp, setPersp] = useState(false);
  const [skin, setSkin] = useState(SKIN_DEFAULT);
  const [omega, setOmega] = useState(MACHINE_OMEGA);
  const [view, setView] = useState<ViewKey>('axon');
  const [phase, setPhase] = useState(0);
  const [show, setShow] = useState<Record<MachinePartKind, boolean>>({
    rings: true,
    drive: true,
    frame: true,
    tentacle: true,
  });
  const [isolate, setIsolate] = useState<number | null>(null);
  const [tendons, setTendons] = useState<[number, number, number]>([0, 0, 0]);
  const [saAmp, setSaAmp] = useState(Math.round((SMALLARM_IDLE.amp * 180) / Math.PI));
  const [saFreq, setSaFreq] = useState<number>(SMALLARM_IDLE.freq);
  const [hud, setHud] = useState({ err: 0, apex: 0, ring: 2, folding: true, note: '' });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 交接状态**必须在这里取**，不能等下面用到时再取：createMachine() 里有五环的
    // 脚槽止程标定（每环扫 360 步 × 四档余量），开发模式下要跑好几秒。等它跑完再取，
    // 保质期早过了——第一版就是这么写的，实测取到时 age 已经 7.1s。
    const handed = takeBench<MachineHandoff>(HANDOFF_KEY);
    const machine = createMachine();

    // 开场机位：朝向与 Lab.04 同（两台并读时视角一致），但**框的是整台机器**。
    // 整机世界占位 x[−581,192] · z[−153,226]——大触手从 S1 端伸出约 400mm 且整条
    // 挂在底盘下方（图纸原位，非错位）。只框环身的话，触手会在画幅边缘露出一截，
    // 读成碎片；既然这台的题目是「还原真实形态」，就该把它整个收进来。
    // 代价是环身只占画幅约四成——枢轴向机器本体偏了一些作折中。
    //
    // pivot/scale 由**实测运动包络**定（用户 2026-07-29「往左上挪一点，确保任何时候
    // 都全部在画内」）：待机摆动会把触手梢甩出一大片，静止一帧量出来的框根本不够用，
    // 故先缩到不裁的比例、按 60s（覆盖摆动 15s 与舒卷 27s 两个周期）每 2s 采一帧取并集，
    // 再解出「让包络居中」的枢轴。旧值实测下缘只剩 6px、上缘空着 144px——整体偏下。
    // 现值：左右各 ~117px、上下各 ~73px 余量（画布 878×652 CSS px）。
    //
    // 两个坑：① **cx/cy 在 WebGL 台架上是死参数**——gl3d 只读 matrix/pivot/viewScale/pan，
    // 屏幕中心恒取画布中心（camera3d.project 那条 SVG 老路才用 cx/cy）。要挪画面就动
    // pivot（或 pan），改 cx/cy 毫无效果。② 量之前先把 .lab-hud 藏掉——φ / apex 读数
    // 逐帧变，会被当成「形体」算进包络（右下角因此恒被吃满）。
    // 两个数仍是手感常量，待用户真机拍板（spec M4）。
    const cam = new OrbitCamera({
      cx: 350,
      cy: 260,
      pivot: { x: -158.02, y: 39.22, z: -24.37 },
      scale: 0.75,
      roll0: -1.053336,
      pitch0: 0.735843,
      yaw0: 0.867459,
      // 缩放上下限留着但用不上——没有滚轮接线，zoom 恒为 1（视角只由按钮切换）
      zoomMin: 0.3,
      zoomMax: 3,
      autoYaw: 0,
    });

    // 大触手：**就是 Lab.03 那条**（椎节沿臂位置与 STATIONS 逐位吻合，生成期已闸门）。
    // 运动学整套复用 tentacle3d，本台架只把它摆到机器上（machine-arm 的刚体变换）。
    const N_ARM = TENTACLE3D.segments;
    let arm = createTentacle3();
    // 肌腱限速：与 Lab.03 同参（临界阻尼 5）——真机肌肉不会瞬间到位
    const muscles = [0, 1, 2].map(() => new CriticallyDamped(5));
    let armReady = false;
    // 待机摆动：运转中且用户没碰过肌腱滑块时，三腱按 120° 相位轮流轻收
    // （用户 2026-07-29：「不要让它直挺挺的伸着」）。一碰滑块就交出控制权，
    // 「松开」再交还回来。
    let armManual = false;
    let armClock = 0;
    // 小触手（两条，镜像）：舵机波形驱动大节，其余靠物理跟随。幅/频可被 /lab 滑块覆盖
    const smallArms = SMALLARM_PLACEMENTS.map(() => createSmallArm());
    let saClock = 0;
    let saAmpNow: number = SMALLARM_IDLE.amp;
    let saFreqNow: number = SMALLARM_IDLE.freq;
    const armJoints = ARM_MESH_GROUPS.filter((g) => g.blend).map((g) => ({
      name: g.name,
      gap: g.name === 'jr' ? -1 : Number(g.name.slice(1)),
    }));

    let renderer: FlatRenderer | null = null;
    try {
      renderer = new FlatRenderer(canvas);
    } catch (error) {
      setHud((h) => ({
        ...h,
        note: `3D preview unavailable · ${error instanceof Error ? error.message : 'WebGL 不可用'}`,
      }));
      return;
    }
    const R = renderer;

    // 实体载荷异步载入；未到之前画面是空的，HUD 出「载入实体…」
    let ready = false;
    let disposed = false;
    fetch(MACHINE_MESH_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`mesh 请求失败（HTTP ${res.status}）`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (disposed) return;
        const need = Math.max(
          ...MACHINE_GROUPS.flatMap((g) => [
            g.vOff + g.verts * 3 * Float32Array.BYTES_PER_ELEMENT,
            g.iOff +
              g.tris * 3 * (g.idx32 ? Uint32Array.BYTES_PER_ELEMENT : Uint16Array.BYTES_PER_ELEMENT),
          ]),
        );
        if (buf.byteLength < need) {
          throw new Error(`mesh 数据不完整（${buf.byteLength}/${need} bytes）`);
        }
        for (const g of MACHINE_GROUPS) {
          const verts = new Float32Array(buf, g.vOff, g.verts * 3);
          const idx = g.idx32
            ? new Uint32Array(buf, g.iOff, g.tris * 3)
            : new Uint16Array(buf, g.iOff, g.tris * 3);
          // 带 blend 的组（sa_soft 软杆）= 双骨蒙皮：跟着两端关节标架弯
          if (g.blend) R.addSkinnedMesh(g.name, bakeSkinned(verts, idx, g.blend[0], g.blend[1]));
          else R.addMesh(g.name, bakeIndexed(verts, idx));
        }
        ready = true;
        setHud((h) => ({ ...h, note: '' }));
      })
      .catch((error: unknown) => {
        if (disposed) return;
        const msg = error instanceof Error ? error.message : 'mesh 载入失败';
        setHud((h) => ({ ...h, note: msg }));
        canvas.setAttribute('aria-label', `3D preview incomplete: ${msg}`);
      });

    fetch(ARM_MESH_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`arm mesh 请求失败（HTTP ${res.status}）`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (disposed) return;
        for (const g of ARM_MESH_GROUPS) {
          const verts = new Float32Array(buf, g.vOff, g.verts * 3);
          const idx = g.idx32
            ? new Uint32Array(buf, g.iOff, g.tris * 3)
            : new Uint16Array(buf, g.iOff, g.tris * 3);
          // 组名加 a_ 前缀：整机组名里已经有 c/j/m 开头的可能，别撞车
          if (g.blend) R.addSkinnedMesh(`a_${g.name}`, bakeSkinned(verts, idx, g.blend[0], g.blend[1]));
          else R.addMesh(`a_${g.name}`, bakeIndexed(verts, idx));
        }
        armReady = true;
      })
      .catch((error: unknown) => {
        if (disposed) return;
        const msg = error instanceof Error ? error.message : 'arm mesh 载入失败';
        setHud((h) => (h.note ? h : { ...h, note: msg }));
      });

    let running = spin && !reduced;
    let dir: 1 | -1 = MACHINE_DIR;
    let omegaNow = MACHINE_OMEGA;
    let showNow: Record<MachinePartKind, boolean> = {
      rings: true,
      drive: true,
      frame: true,
      tentacle: true,
    };
    let isolateNow: number | null = null;
    let skinA = SKIN_DEFAULT;

    // 蒙皮：相邻环外侧支点之间的直纹带（锚点在装配位选定后固定跟销，同 Lab.04）
    const profiles = machine.rings.map((r) => ringOuterProfile(r.data));
    const profileWorld = (ri: number): Vec3[] =>
      profiles[ri].map((j) => {
        const n = machine.rings[ri].solver.nodes[j];
        return ringPoint(machine.rings[ri].data, n.x, n.y);
      });
    const skinMesh = (ri: number): Float32Array =>
      bakeIndexed(
        bandVerts(
          resample(profileWorld(ri), SKIN_SAMPLES),
          resample(profileWorld(ri + 1), SKIN_SAMPLES),
        ),
        SKIN_IDX,
      );
    const skinPoints = (ri: number): Float32Array =>
      bakeRuledPoints(
        resample(profileWorld(ri), SKIN_U),
        resample(profileWorld(ri + 1), SKIN_U),
        SKIN_V,
      );
    // 站元胞刚架：与 Lab.03 同一公式（前站→后站中央切线 + 导向点正交化）。
    // 算完在 sim 系，交给 armFrame 一次性搬到整机世界。
    const armCell = (i: number): CellFrame => {
      const nodes = arm.solver.nodes;
      const si = Math.max(0, i);
      const o = nodes[SPINE3(si)];
      const nA = si === 0 ? nodes[ROOTB3()] : nodes[SPINE3(si - 1)];
      const nB = nodes[SPINE3(Math.min(N_ARM, si + 1))];
      let ux = nB.x - nA.x;
      let uy = nB.y - nA.y;
      let uz = nB.z - nA.z;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
      const g = nodes[GUIDE3(0, si)];
      let ex = g.x - o.x;
      let ey = g.y - o.y;
      let ez = g.z - o.z;
      const dt = ex * ux + ey * uy + ez * uz;
      ex -= dt * ux; ey -= dt * uy; ez -= dt * uz;
      const el = Math.hypot(ex, ey, ez) || 1;
      ex /= el; ey /= el; ez /= el;
      return armFrame({
        o, ux, uy, uz, ex, ey, ez,
        fx: ey * uz - ez * uy,
        fy: ez * ux - ex * uz,
        fz: ex * uy - ey * ux,
      });
    };
    /** 基座 = 不动锚（静息刚架，不随节 0 摆动），同 Lab.03 */
    const ARM_MNT: CellFrame = (() => {
      const g = ARM_CHAINS[0][0];
      const o = ARM_STATIONS[0];
      let ex = g[0] - o[0];
      let ez = g[2] - o[2];
      const el = Math.hypot(ex, ez) || 1;
      ex /= el; ez /= el;
      return armFrame({
        o: { x: o[0], y: o[1], z: o[2] },
        ux: 0, uy: 1, uz: 0,
        ex, ey: 0, ez,
        fx: -ez, fy: 0, fz: ex,
      });
    })();
    const armRootDy = ARM_STATIONS[0][1] - arm.solver.nodes[ROOTB3()].y;
    const armRootFrame = (): CellFrame => {
      const b = arm.solver.nodes[ROOTB3()];
      return { ...ARM_MNT, o: armFrame({ ...ARM_MNT, o: b }).o };
    };

    const drawArm = (): void => {
      if (!armReady) return;
      for (let ci = 0; ci <= N_ARM; ci++) {
        R.drawMesh(`a_c${ci}`, armCell(ci), [...ARM_SHADE.dark], [...ARM_SHADE.lite]);
      }
      R.drawMesh('a_mnt', ARM_MNT, [...ARM_SHADE.dark], [...ARM_SHADE.lite]);
      for (const j of armJoints) {
        if (j.gap < 0) R.drawSkinned(`a_${j.name}`, armRootFrame(), armCell(0), armRootDy);
        else {
          const dy = ARM_STATIONS[j.gap + 1][1] - ARM_STATIONS[j.gap][1];
          R.drawSkinned(`a_${j.name}`, armCell(j.gap), armCell(j.gap + 1), dy);
        }
      }
      // 三根肌腱走线——不画的话「牵拉」看不见是谁在拉
      for (let k = 0; k < 3; k++) {
        const pts = armPolyline(tendonVisual3(arm.solver, k));
        const segs = [];
        for (let i = 1; i < pts.length; i++) segs.push({ a: pts[i - 1], b: pts[i] });
        R.drawLines(segs, TENDON_C[k], 0.004);
      }
    };

    // 小触手：mount 静件随位姿、大节/小块刚体、软杆双骨蒙皮（与大触手同一渲染语言）
    const drawSmallArms = (): void => {
      if (!ready) return; // 网格与整机同一个 bin，ready 一起到
      for (let pi = 0; pi < smallArms.length; pi++) {
        const pose = smallArmPose(smallArms[pi], pi);
        R.drawMesh('sa_mount', pose.mount, [...FRAME_SHADE.dark], [...FRAME_SHADE.lite]);
        R.drawMesh('sa_seg1', pose.seg1, [...ARM_SHADE.dark], [...ARM_SHADE.lite]);
        R.drawSkinned('sa_soft', pose.soft[0], pose.soft[1], pose.soft[2]);
        R.drawMesh('sa_seg2', pose.seg2, [...ARM_SHADE.dark], [...ARM_SHADE.lite]);
      }
    };

    /** 带序从远到近（半透明面之间没有 z 排序）。深度取两环轮心中点。 */
    const bandOrder = (): number[] => {
      const mtx = cam.matrix;
      const pv = cam.pivotPoint;
      return bandsFarToNear(machine.rings.length - 1, (ri) => {
        const a = ringPoint(machine.rings[ri].data, 0, 0);
        const b = ringPoint(machine.rings[ri + 1].data, 0, 0);
        return (
          mtx[6] * ((a.x + b.x) / 2 - pv.x) +
          mtx[7] * ((a.y + b.y) / 2 - pv.y) +
          mtx[8] * ((a.z + b.z) / 2 - pv.z)
        );
      });
    };
    // ── 跨路由状态交接（handoff.ts 头注有由来）──────────────────────────────────
    // 主页预览位与案例页主图位是同一台台架，换页时前者卸载后者新挂。不交接的话
    // 新实例从 θ₀ 起步、触手笔直、待机摆动重新缓入 6.5s——转场接得再准，落地也是「倒带」。
    const capture = (): MachineHandoff => {
      const armN = arm.solver.nodes;
      const armPts = new Float32Array(armN.length * 3);
      for (let i = 0; i < armN.length; i++) {
        armPts[i * 3] = armN[i].x;
        armPts[i * 3 + 1] = armN[i].y;
        armPts[i * 3 + 2] = armN[i].z;
      }
      const saPts = smallArms.map((sa) => {
        const n = sa.solver.nodes;
        const a = new Float32Array(n.length * 2);
        for (let i = 0; i < n.length; i++) {
          a[i * 2] = n[i].x;
          a[i * 2 + 1] = n[i].y;
        }
        return a;
      });
      return {
        theta: machine.theta,
        saPts,
        saTheta: smallArms.map((sa) => sa.theta),
        saClock,
        ringTheta: machine.rings.map((r) => r.theta),
        ringPts: machine.rings.map((r) => {
          const n = r.solver.nodes;
          const a = new Float32Array(n.length * 2);
          for (let i = 0; i < n.length; i++) {
            a[i * 2] = n[i].x;
            a[i * 2 + 1] = n[i].y;
          }
          return a;
        }),
        armPts,
        armClock,
        armManual,
        tendons: [muscles[0].value, muscles[1].value, muscles[2].value],
        running,
        dir,
        omega: omegaNow,
      };
    };

    const restore = (s: MachineHandoff): boolean => {
      // 形状不符（改了图纸 / 换了触手）一律整份作废：宁可从头开始，也不要摆出个残缺位形
      if (
        s.ringPts.length !== machine.rings.length ||
        machine.rings.some((r, ri) => s.ringPts[ri].length !== r.solver.nodes.length * 2) ||
        s.armPts.length !== arm.solver.nodes.length * 3 ||
        s.saPts.length !== smallArms.length ||
        smallArms.some((sa, k) => s.saPts[k].length !== sa.solver.nodes.length * 2)
      ) {
        return false;
      }
      // 五环是拟静力学（只有 iterate，没有 Verlet 历史），位形直接摆上即可，
      // 且**必须**直接摆——只设 θ 让它自己从 θ₀ 的位形跳过去，会撞上 07-17 那个
      // 折叠分支问题（同一个 θ 有不止一个合法解）。
      machine.theta = s.theta;
      machine.rings.forEach((r, ri) => {
        r.theta = s.ringTheta[ri];
        const a = s.ringPts[ri];
        for (let i = 0; i < r.solver.nodes.length; i++) r.solver.setNode(i, a[i * 2], a[i * 2 + 1]);
      });

      // 触手是动力学件：先把肌腱原长恢复到当时的收缩率，再摆位形。
      for (let k = 0; k < 3; k++) {
        muscles[k].jumpTo(s.tendons[k]);
        applyContraction3(arm.solver, arm.tendons[k], s.tendons[k]);
      }
      const putArm = (): void => {
        for (let i = 0; i < arm.solver.nodes.length; i++) {
          arm.solver.setNode(i, s.armPts[i * 3], s.armPts[i * 3 + 1], s.armPts[i * 3 + 2]);
        }
      };
      // **两次 setNode 夹一个空步**：`setNode` 只改位置，不动 Verlet 的上一步位置 px。
      // 只摆位置的话，第一个子步会算出 v =（目标位 − 笔直位）× damping 的巨大速度，
      // 把臂甩飞（damping 0.992，甩出去要很久才停）。而 px 是在每个子步**开头**从 x
      // 拷过来的，所以「摆好 → 走恰好一个子步 → 再摆一遍」之后 px 与 x 都停在目标位，
      // 速度干净为零。dt 取 1/120 = 恰好一个子步（fixed-step 的浮点护栏保证不多不少）。
      putArm();
      arm.solver.step(1 / 120, TENTACLE3D.sweeps);
      putArm();

      // 小触手同法（2D 动力学件）：两次摆位夹一个空步，把 Verlet 的 px 一起钉住
      smallArms.forEach((sa, k) => {
        sa.theta = s.saTheta[k];
        const putSa = (): void => {
          const a = s.saPts[k];
          for (let i = 0; i < sa.solver.nodes.length; i++) sa.solver.setNode(i, a[i * 2], a[i * 2 + 1]);
        };
        putSa();
        sa.solver.step(1 / 120, SMALLARM.sweeps);
        putSa();
      });
      saClock = s.saClock;

      armClock = s.armClock;
      armManual = s.armManual;
      running = s.running;
      dir = s.dir;
      omegaNow = s.omega;
      setRun(s.running);
      setOmega(s.omega);
      setTendons([s.tendons[0], s.tendons[1], s.tendons[2]]);
      setPhase(Number(phaseDeg(machine.theta).toFixed(1)));
      return true;
    };

    if (handed) restore(handed);

    let targetTheta = machine.theta;
    let viewAnim: { q0: Quat; q1: Quat; t: number } | null = null;
    // φ 读数 = 相对伸展位的行程角，恒 0–180（与盘点 §6 同口径：0 伸展 / 180 折叠）。
    // 用 phaseDeg 而不是 (θ−θ₀)：摆向为负时那个差值是负的，读数会变成 −0…−180。
    const phiDeg = (): number => phaseDeg(machine.theta);

    const substep = (): void => {
      if (running) {
        // 往复：撞到 180° 的任一端就折返。端点是曲柄滑块的死点，
        // 输出速度本来就归零，故匀速反转看着不会一顿。
        dir = runMachine(machine, dir, omegaNow * SHELL_STEP_DT);
        targetTheta = machine.theta;
        return;
      }
      // 滑杆态：追目标角。区间不绕圈，故直接取差值、不做 wrap
      const diff = clampTheta(targetTheta) - machine.theta;
      const max = CHASE_OMEGA * SHELL_STEP_DT;
      const dTheta = Math.max(-max, Math.min(max, diff));
      if (dTheta === 0) return;
      stepMachine(machine, dTheta);
    };

    const render = (): void => {
      R.beginFrame(cam);
      if (!ready) return;
      // 全实体、全部写深度——遮挡交给 z-buffer（这台没有半透明层，
      // 故不需要 Lab.04 那套「从远到近自己排序」）
      // 不透明档：遮罩面走实体路径——先画、写深度，遮挡由 z-buffer 精确给出
      const skinOn = showNow.rings && skinA > 0.005;
      if (skinOn && skinA >= SKIN_OPAQUE_AT) {
        for (const ri of bandOrder()) {
          const bs = bandShade(ri);
          R.drawDynamicMesh(skinMesh(ri), bs.dark, bs.lite);
        }
      }
      for (const g of visibleGroups(showNow, isolateNow)) {
        const s = groupShade(g.name);
        R.drawMesh(g.name, machineFrame(g, machine), s.dark, s.lite);
      }
      if (showNow.tentacle) {
        drawArm();
        drawSmallArms();
      }
      // 半透明层最后画：与已成像的实体混合，且**深度只测不写**；
      // 带之间没有 z 排序，只能靠从远到近的下单顺序（Lab.04 07-29 定案）。
      if (skinOn && skinA < SKIN_OPAQUE_AT) {
        const da = dotAlpha(skinA);
        for (const ri of bandOrder()) {
          const bs = bandShade(ri);
          R.drawDynamicMesh(skinMesh(ri), bs.dark, bs.lite, skinA);
          R.drawPointCloud(skinPoints(ri), COLS[ri], COLS[ri + 1], SKIN_DOT_R, da);
        }
      }
    };

    let acc = 0;
    const step = (dt: number): void => {
      if (viewAnim) {
        viewAnim.t = Math.min(1, viewAnim.t + dt / VIEW_ANIM_S);
        const e = viewAnim.t < 0.5 ? 2 * viewAnim.t ** 2 : 1 - (-2 * viewAnim.t + 2) ** 2 / 2;
        cam.setOrientation(q2m(slerpQ(viewAnim.q0, viewAnim.q1, e)));
        if (viewAnim.t >= 1) viewAnim = null;
      } else {
        cam.tick(dt);
      }
      acc = Math.min(acc + dt, SHELL_STEP_DT * 8);
      while (acc >= SHELL_STEP_DT) {
        substep();
        acc -= SHELL_STEP_DT;
      }
      // 大触手：与整机同帧推进（自己的 3D 内核，与五环解算互不相干）
      if (running && !armManual) {
        armClock += dt;
        const next: [number, number, number] = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          const c = idleContraction(armClock, k);
          muscles[k].target = c;
          next[k] = c;
        }
        // 滑块跟着走（看得出此刻是谁在拉）；按整数百分比比较，避免逐帧空转重渲染
        setTendons((prev) =>
          prev.every((v, k) => Math.round(v * 100) === Math.round(next[k] * 100)) ? prev : next,
        );
      }
      muscles.forEach((m, k) => {
        if (m.update(dt)) applyContraction3(arm.solver, arm.tendons[k], m.value);
      });
      arm.solver.step(dt, TENTACLE3D.sweeps);
      // 小触手：运转中按波形甩，停下时保持最后角度（物理继续松弛到静止）
      if (running) saClock += dt;
      smallArms.forEach((sa, k) => {
        if (running) driveSmallArm(sa, idleSwing(saClock, k, saAmpNow, saFreqNow));
        stepSmallArm(sa, dt);
      });
      render();
      // 读数跟着「单环」走：隔离哪一环就报哪一环的拱顶，全部时报中间那环（S3）
      const ri = isolateNow ?? 2;
      setHud((h) =>
        h.note
          ? h
          : {
              err: machineMaxError(machine),
              apex: apexHeight(machine, ri),
              ring: ri,
              folding: isFolding(dir),
              note: '',
            },
      );
      if (running) setPhase(Number(phiDeg().toFixed(1)));
    };

    apiRef.current = {
      step,
      setPhase: (deg) => {
        running = false;
        targetTheta = thetaAtStroke(deg / PHASE_MAX);
      },
      setRun: (on) => {
        running = on;
      },
      setOmega: (w) => {
        omegaNow = w;
      },
      setShow: (s) => {
        showNow = s;
        if (!running) render();
      },
      setIsolate: (ri) => {
        isolateNow = ri;
        if (!running) render();
      },
      setSkin: (a) => {
        skinA = a;
        if (!running) render();
      },
      setTendon: (k, v) => {
        armManual = true; // 用户接管：待机摆动让位
        muscles[k].target = v;
      },
      armHome: () => {
        armManual = false; // 交还给待机摆动
        armClock = 0;
        arm = createTentacle3();
        muscles.forEach((m) => m.jumpTo(0));
      },
      setSaSwing: (ampDeg, freqHz) => {
        saAmpNow = (ampDeg * Math.PI) / 180;
        saFreqNow = freqHz;
      },
      setPersp: (on) => R.setPerspective(on ? 900 : 0),
      viewTo: (k) => {
        const target = PRESET_VIEWS[k];
        if (reduced) {
          viewAnim = null;
          cam.setOrientation(target);
          return;
        }
        viewAnim = { q0: m2q(cam.matrix), q1: m2q(target), t: 0 };
      },
    };

    // 机位**只由下面的固定视角按钮控制**（用户拍板 2026-07-29：取消拖拽视角移动）。
    // 故这里不挂任何指针/滚轮监听——连带的好处是滚轮不再被画布吞掉，
    // 鼠标停在这台上也能正常滚页（/lab 五台台架叠起来时这点很实在）。
    // 与 Lab.01–04 的差异是有意的，不是漏了：那几台仍可拖拽。

    // 转场克隆用的画面快照（canvas 的像素不随 cloneNode 复制，见 snapshot.ts）。
    // **状态交接也在这里留**——它跑在点击那一刻，与快照像素是同一个瞬间；
    // 若改在卸载时留，中间还隔着底板铺开的 380ms，落地的活件会比飞过来的快照
    // 超前那么一截，交叉淡出就成了「跳一下」。这里留，则第一帧与快照严丝合缝。
    setSnapshot(canvas, () => {
      render();
      stashBench(HANDOFF_KEY, capture());
      return canvas.toDataURL('image/png');
    });

    render();
    return () => {
      disposed = true;
      apiRef.current = null;
      setSnapshot(canvas, null);
    };
  }, [spin]);

  useBenchLoop(canvasRef, (dt) => apiRef.current?.step(dt), [spin], active);

  const goView = useCallback((k: ViewKey) => {
    setView(k);
    apiRef.current?.viewTo(k);
  }, []);

  const L = COPY[lang];

  return (
    <div
      className={`lab-wrap${onLight ? ' on-light' : ''}${
        sideControls && controls ? ' lab-wrap--side' : ''
      }`}
    >
      <div className="lab-fig" {...(ptTarget ? { 'data-pt-target': '' } : {})}>
        <canvas ref={canvasRef} width={1400} height={1040} aria-label={L.aria} />
        <div className="lab-hud tl">
          <div style={{ color: 'var(--p300)' }}>Lab.05 / Fig. 14</div>
          <div>{L.title}</div>
          <div className="dim">{L.sub}</div>
        </div>
        <div className="lab-hud br">
          <div className="num">φ {phase.toFixed(1)}°</div>
          <div className="dim">
            {hud.note
              ? hud.note
              : `apex(S${hud.ring + 1}) ${hud.apex.toFixed(1)} mm · err ${hud.err.toFixed(2)} · ${
                  run ? (hud.folding ? L.going.fold : L.going.open) : L.drive.slider
                }`}
          </div>
        </div>
        {sideControls && controls ? null : <div className="lab-hud bl dim">{L.hint}</div>}
      </div>
      {controls ? (
        <div className="lab-ctl">
          {/* 驱动 —— 运转 / 转速 / 透视。转速滑块是这台专有的：
              转速本就是待拍板的手感常量，与其我替你定一个数，不如给你滑块自己找。 */}
          <div className="grp grp--half">
            <label>
              <input
                type="checkbox"
                checked={run}
                onChange={(e) => {
                  setRun(e.target.checked);
                  apiRef.current?.setRun(e.target.checked);
                }}
              />
              {L.run}
            </label>
            <label>
              <input
                type="checkbox"
                checked={persp}
                onChange={(e) => {
                  setPersp(e.target.checked);
                  apiRef.current?.setPersp(e.target.checked);
                }}
              />
              {L.persp}
            </label>
          </div>
          <div className="grp grp--half">
            <span className="k">
              {L.speed}
              {sideControls ? <b className="v">{omega.toFixed(2)}</b> : null}
            </span>
            <input
              type="range"
              min={OMEGA_MIN}
              max={OMEGA_MAX}
              step={0.05}
              value={omega}
              aria-label={L.speedAria}
              style={sideControls ? { width: '100%' } : { width: 84 }}
              onChange={(e) => {
                const v = Number(e.target.value);
                setOmega(v);
                apiRef.current?.setOmega(v);
              }}
            />
          </div>
          <div className="grp grp--half">
            <span className="k">
              {L.phase}
              {sideControls ? <b className="v">{phase.toFixed(1)}°</b> : null}
            </span>
            <input
              type="range"
              min={0}
              max={PHASE_MAX}
              step={0.5}
              value={phase}
              style={sideControls ? { width: '100%' } : { width: 132 }}
              onChange={(e) => {
                const v = Number(e.target.value);
                setRun(false);
                setPhase(v);
                apiRef.current?.setPhase(v);
              }}
            />
          </div>
          {/* 蒙皮遮罩 —— 与 Lab.04 同一套直纹带，默认 0.67（用户 2026-07-29 拍板）：
              这台同时是项目 01 主图，主图先要读出形态。滑到 0 = 看穿到传动链，滑到 1 = 实体壳。
              环身关掉时蒙皮一并不画（皮附在环上，环没了皮也就无所附） */}
          <div className="grp grp--half">
            <span className="k">
              {L.skin}
              {sideControls ? <b className="v">{Math.round(skin * 100)}%</b> : null}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={skin}
              aria-label={L.skinAria}
              style={sideControls ? { width: '100%' } : { width: 96 }}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSkin(v);
                apiRef.current?.setSkin(v);
              }}
            />
          </div>
          {/* 部件显隐 —— 整机独有：这台是一堆零件的装配，「看哪些」本身就是操作。
              关掉机架能看清传动链怎么走，关掉环身能单看一轴五曲柄。 */}
          <div className="grp grp--parts">
            <span className="k">{L.parts}</span>
            {PARTS.map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={show[p]}
                  onChange={(e) => {
                    const next = { ...show, [p]: e.target.checked };
                    setShow(next);
                    apiRef.current?.setShow(next);
                  }}
                />
                {L.partNames[p]}
              </label>
            ))}
          </div>
          {/* 大触手三肌腱 —— 与 Lab.03 同一条触手、同一套解算，只是摆到了机器上。
              滑块 = 各腱收缩率；限速用临界阻尼（真机肌肉不会瞬间到位）。
              待机时（运转中且没碰滑块）三腱按 120° 相位轮流轻收，合成一个缓慢
              回转的弯向 + 更慢的整体舒卷——不让它直挺挺伸着（用户 2026-07-29）。
              一碰滑块就交出控制权，「交还待机」把它交回去。 */}
          <div className="grp grp--tendons">
            <span className="k">{L.arm}</span>
            {[0, 1, 2].map((k) => (
              <input
                key={k}
                type="range"
                min={0}
                max={100}
                value={Math.round(tendons[k] * 100)}
                aria-label={L.armAria[k]}
                style={{ width: sideControls ? '100%' : 62 }}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100;
                  setTendons((t) => {
                    const n = [...t] as [number, number, number];
                    n[k] = v;
                    return n;
                  });
                  apiRef.current?.setTendon(k, v);
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                setTendons([0, 0, 0]);
                apiRef.current?.armHome();
              }}
            >
              {L.armHome}
            </button>
          </div>
          {/* 小触手 —— 摆幅/频率（用户 2026-07-30 机构说明后活化；波形是展示编排，
              幅频是待拍板的手感常量，给滑块自己找）。**只在横排面板出**：
              案例页侧栏的高度预算在 §13.2 已经顶满，加一组就会重新被裁；
              案例页语境用默认值即可，要调去 /lab（同一台仪器）。 */}
          {sideControls ? null : (
            <div className="grp">
              <span className="k">{L.sarm}</span>
              <span className="k">{L.sarmAmp}</span>
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={saAmp}
                aria-label={L.sarmAmpAria}
                style={{ width: 84 }}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSaAmp(v);
                  apiRef.current?.setSaSwing(v, saFreq);
                }}
              />
              <span className="k">{L.sarmFreq}</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={saFreq}
                aria-label={L.sarmFreqAria}
                style={{ width: 84 }}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSaFreq(v);
                  apiRef.current?.setSaSwing(saAmp, v);
                }}
              />
            </div>
          )}
          {/* 单环隔离 —— 五个环同相但行程各异，单独看一个才比得出半径差。
              只筛环件：机架/轴/触手仍按各自开关，否则「只看 S3」会连驱动它的轴一起切掉。 */}
          <div className="grp grp--seg">
            <span className="k">{L.ring}</span>
            <span className="seg">
              {RING_KEYS.map((k) => (
                <button
                  key={k === null ? 'all' : k}
                  type="button"
                  className={k === isolate ? 'active' : undefined}
                  onClick={() => {
                    setIsolate(k);
                    apiRef.current?.setIsolate(k);
                  }}
                >
                  {k === null ? L.ringAll : `S${k + 1}`}
                </button>
              ))}
            </span>
          </div>
          <div className="grp grp--seg">
            <span className="k">{L.view}</span>
            <span className="seg">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className={v.key === view ? 'active' : undefined}
                  onClick={() => goView(v.key)}
                >
                  {L.views[v.key]}
                </button>
              ))}
            </span>
          </div>
          {sideControls ? <p className="lab-ctl__hint">{L.hint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
