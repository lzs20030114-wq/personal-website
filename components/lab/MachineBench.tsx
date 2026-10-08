'use client';

import { useBenchLang, useLabText } from './LabLanguage';

import { LabControlLabel } from './LabControlLabel';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed, bakeRuledPoints, bakeSkinned, type CellFrame } from '../../src/lib/linkage/gl3d';
import { CriticallyDamped } from '../../src/lib/linkage/motion';
import { armFrame, armPoint, armPolyline, idleContraction } from '../../src/lib/linkage/machine-arm';
import { type ActuatorTargets, BehaviorEngine, type EngineState, HAND, type HandMode } from '../../src/lib/linkage/behavior/engine';
import { describeRecord, personaName, phaseName } from '../../src/lib/linkage/behavior/describe';
import { type PresenceBand, type SensorInput, bandOf } from '../../src/lib/linkage/behavior/events';
import type { Phase } from '../../src/lib/linkage/behavior/life';
import { type LogHeader, type LogRecord, toJsonl } from '../../src/lib/linkage/behavior/log';
import { PERSONA_KEYS, type PersonaKey } from '../../src/lib/linkage/behavior/persona';
import {
  ARM_GEOM,
  FACING,
  HAND_UI,
  type ViewParams,
  contactIdle,
  contactRadiusMm,
  contactStep,
  cssToLogical,
  feelerAngle,
  feelerSide,
  followBreath,
  handReading,
  handSendDue,
  halfTowardPerson,
  hitBand,
  pointerTrack,
  polylineDist,
  shellHalf,
  sweepFraming,
  tendonContractions,
  trackMark,
  trackMove,
  trackSpeed,
  trackTrim,
  yawFrame,
  yawPoint,
} from '../../src/lib/linkage/machine-behavior';
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
  SMALLARM_STARTLE,
  clampSwing,
  createSmallArm,
  driveSmallArm,
  idleSwing,
  saChainWorld,
  smallArmPose,
  startleSwing,
  stepSmallArm,
} from '../../src/lib/linkage/machine-smallarm';
import { SMALLARM_PLACEMENTS } from '../../src/lib/linkage/machine-shape';
import { stashBench, takeBench } from './handoff';
import { setStash } from './snapshot';
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
 *
 * **两种驱动源**（行为引擎 M2，2026-10-07；spec = 轮回机器_行为引擎spec.md §6）：
 * 「编排」= 上面这些按时间走的展示动画（Lab 1-5、主页预览、案例页主图）；「行为引擎」=
 * 机器按人格与生命阶段对刺激作出反应——呼吸给曲柄、臂给三腱、触须给舵机、朝向给整机
 * 绕竖轴转（占位）。引擎是零 DOM 的纯模块（src/lib/linkage/behavior/），换算在
 * machine-behavior.ts；这里只接线。
 *
 * 驱动源在挂载时定死、台架上不能切（用户 2026-10-07「行为引擎单独拆一个 lab 作为 1-6」）：
 * `behavior` 不传 = 编排，与 M2 之前逐位相同；传 = Lab 1-6，从第一帧起就是行为引擎。
 * 两种的交接状态各用一个键（HANDOFF_KEY），主页预览 / 案例主图交给 1-5 的位形不会被 1-6 取走。
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

/** 编排档机位（实测运动包络定的值，见 OrbitCamera 构造处的长注） */
const CHOREO_PIVOT = { x: -158.02, y: 39.22, z: -24.37 };
const CHOREO_SCALE = 0.75;

// ── 行为引擎档（M2，Lab 1-6）的手感常量 ────────────────────────────────────
/**
 * 生命时钟档：只压缩一世各段的时长，呼吸与动作仍按真实秒（spec §5.5）。×1 = 实验口径，一世约
 * 9 分钟；×5 约 1 分 45 秒；×10 约 50 秒；×20 约 25 秒。面板上是一根四档滑条（用户 2026-10-07
 * 第六批：「加个条，1 倍速 5 倍 10 倍速 20 倍速都有就行了」）；此前的 ×60 档随之撤掉。引擎
 * 本身接受任意正倍率，只是台架不再给这一档。
 */
const LIFE_RATES = [1, 5, 10, 20] as const;
/** 默认 ×10：一世约 50 秒，访客等得到一次死亡与轮回 */
const LIFE_RATE_DEFAULT = 10;
/** 倍率 → 滑条档位（最近的一档）。交接来的状态若不在档上，接手时按它改到这一档 */
const lifeRateStop = (r: number): number => {
  let best = 0;
  LIFE_RATES.forEach((v, i) => {
    if (Math.abs(v - r) < Math.abs(LIFE_RATES[best] - r)) best = i;
  });
  return best;
};
const BANDS: readonly PresenceBand[] = ['gone', 'far', 'mid', 'near'];
/** 日志缓冲上限（条）：一场四世约 500 条，这个数够跑十几个小时；超了丢最早的 */
const LOG_CAP = 60000;
/** 按住壳多久算「按住」（秒）、拖多远算「抚摸」（CSS px） */
const HOLD_AFTER = 0.5;
const STROKE_PX = 10;
/** 缠到几成时手指被卡住、张力开关触发（抓握演示：按住大触手 = 手指在臂里） */
const CATCH_AT = 0.6;
// 指针 = 手的台架手感常量（HAND_UI / HAND_MM）与碰臂判定（contactStep）在 machine-behavior.ts：
// 台架、vitest 闭环与 scripts/behavior/hand-probe.mjs 共用一份（2026-10-08 搬过去，数值未改）

const BAND_RANK: Record<PresenceBand, number> = { gone: 0, far: 1, mid: 2, near: 3 };
/** 手的距离 → 在场档，带滞回：离开当前档要越过边界 bandHys 才算 */
function handBandOf(distMm: number, cur: PresenceBand | null): PresenceBand {
  const raw = bandOf(distMm / 1000);
  if (cur === null || cur === 'gone' || raw === cur) return raw;
  const h = HAND_UI.bandHys / 1000;
  const m = distMm / 1000;
  if (cur === 'near' && m < 0.6 + h) return 'near';
  if (cur === 'far' && m > 1.5 - h) return 'far';
  if (cur === 'mid' && m > 0.6 - h && m < 1.5 + h) return 'mid';
  return raw;
}

/** 从某种人格开始，其余按 A→B→C→D 循环（台架的「首世」档） */
function rotateOrder(first: PersonaKey): PersonaKey[] {
  const i = PERSONA_KEYS.indexOf(first);
  return [...PERSONA_KEYS.slice(i), ...PERSONA_KEYS.slice(0, i)];
}

/** 行为档 HUD 的读数（约每 0.2 秒刷新一次；文字在渲染时按语言现拼） */
interface BehaviorHud {
  life: number;
  persona: PersonaKey;
  phase: Phase;
  /** 本段剩余（真实秒，已按生命时钟折算） */
  remain: number;
  rate: number;
  arousal: number;
  soundOn: boolean;
  soundF: number;
  light: number;
  yaw: number;
  bearing: number | null;
  band: PresenceBand;
  recent: LogRecord[];
  /** 手（指针）：机器看没看见、怎么对待它；没有手 = null */
  hand: { seen: boolean; mode: HandMode | null; bearing: number; dist: number; touch: boolean; held: boolean } | null;
  /** 此刻视角的水平朝向（世界 x̂ 在屏幕右方向上的分量 m0、m1）：罗盘按它转，左右与画面一致 */
  view: [number, number];
  /** 研究原型（动作词汇 v2）正在执行的程序 · 段；现行词汇或没有程序 = null */
  motion: string | null;
}

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
  /** 行为档（Lab 1-6）：引擎整块状态 + 当时的朝向与首世。编排档不带这一支 */
  behavior?: { engine: EngineState; yaw: number; first: PersonaKey };
}
/**
 * 交接键按驱动源分：编排 = 主页 Hook 舞台 / 案例主图 / Lab 1-5 之间传；行为引擎 = 主页实验目录里
 * 1-6 的预览与 Lab 1-6 之间传。两台同在 /lab 上，共用一个键的话两台都会取到同一份
 * （handoff.ts 的宽限期允许重复取回），1-6 就会接上案例主图那份编排位形。
 */
const HANDOFF_KEY = { choreo: 'machine', engine: 'machine-behavior' } as const;

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
    hint: '视角由下方按钮切换 · 点一下小触手试试',
    drive: { spin: '自转', slider: '滑杆' },
    // 方向指示用盘点 §6 的既有口径：φ=0 伸展死点 / φ=180 折叠死点
    going: { fold: '折叠 ↓', open: '伸展 ↑' },
    aria: '轮回机器整机台架；曲柄角与肌腱驱动，视角按钮切换',
    loading: '载入实体…',
    beh: {
      clock: '生命时钟',
      clockHelp: [
        '只压缩一世各段的时长（诞生 → 成长 → 衰老 → 死亡 → 空白），呼吸与动作仍按真实速度。×1 是实验口径，一世约 9 分钟；×5 约 1 分 45 秒；×10 约 50 秒；×20 约 25 秒。',
        'Compresses only the life stages (birth → growth → ageing → dying → blank); breathing and gestures stay real-time. ×1 is the experiment timing, about 9 minutes per life; ×5 about 1 min 45 s; ×10 about 50 seconds; ×20 about 25 seconds.',
      ] as [string, string],
      first: '首世',
      firstHelp: [
        '从哪种人格开始，其余按 A → B → C → D 循环。换了就重开一场。',
        'Which persona comes first; the rest follow A → B → C → D in turn. Changing it starts a new session.',
      ] as [string, string],
      restart: '重来',
      motion: '动作',
      motionHelp: [
        '大触手与全身的动作词汇。现行 = 已上线的读法；新 = 2026-10-08 的研究原型（惊跳是 0.1 s 的反射、回应按刺激分动词、自发动作变小变慢、人格差在恢复的结构里），待作者拍板。换了就重开一场。',
        'The motion vocabulary of the big arm and the body. Current = the live reading; New = the 2026-10-08 research prototype (startle as a 0.1 s reflex, one response verb per stimulus, smaller and slower spontaneous gestures, personas differ in how they recover), pending the author’s decision. Changing it starts a new session.',
      ] as [string, string],
      motionOld: '现行',
      motionNew: '新 · 研究',
      skip: '下一段',
      presence: '在场',
      presenceHelp: [
        '有没有人、离多远（真机用超声测距）。方位 0° 是机身初始朝向，左为正。',
        'Whether someone is there and how close (ultrasonic on the machine). Bearing 0° is the machine’s initial facing; left is positive.',
      ] as [string, string],
      bands: { gone: '无人', far: '远', mid: '中', near: '近' },
      bearing: '方位',
      bearingAria: '人相对机身初始朝向的方位（度，左为正）',
      touch: '触碰',
      touchHelp: [
        '碰离人近的那一半壳。也可以直接点画面：点壳 = 轻拍，拖动 = 抚摸，按住不放 = 按住；点小触手、按住大触手也行。',
        'Touches the half of the shell nearer the person. Or use the canvas: click the shell to pat, drag to stroke, press and hold to hold; click a small arm or press the large arm.',
      ] as [string, string],
      touches: { pat: '轻拍', stroke: '抚摸', poke: '戳', hold: '按住' },
      env: '环境',
      envHelp: ['拿起机器、敲桌面、拍手或说话。', 'Lift the machine, knock, clap or talk.'] as [string, string],
      envs: { lift: '拿起', knock: '敲', clap: '拍手', talk: '说话' },
      grasp: '抓握',
      graspHelp: [
        '指针碰到大触手（或按住它）= 手碰到臂。它若迎上来就会缠住手（缠到六成、手还在 = 张力开关触发）；把指针拉开 = 抽手。勾选「留物件」，抽手后臂里留着东西。',
        'Touch the large arm with the pointer (or press it) to put a hand on it. If it responds, it wraps the hand (the tension switch closes once it is 60% wrapped and the hand is still there); pull the pointer away to withdraw. With “Leave object”, something stays in the arm after you withdraw.',
      ] as [string, string],
      leave: '留物件',
      log: '日志',
      logHelp: [
        '下载本场的事件日志（JSON Lines）：传感事件、引擎的回应与生命事件同一条流。',
        'Download this session’s event log (JSON Lines): sensor events, responses and life events in one stream.',
      ] as [string, string],
      export: '导出',
      title: '行为引擎',
      lifeN: (n: number) => `第 ${n} 世`,
      remain: (s: number) => `剩 ${s} 秒`,
      rateAt: (r: number) => `生命时钟 ×${r}`,
      arousal: '唤醒',
      sound: '声',
      light: '灯',
      caveat: '节律非真机 · 偏航为占位',
      hint: '移动指针 = 人的手 · 点小触手、按住大触手或点壳体与它互动 · 视角由下方按钮切换',
      compass: '俯视（按此刻视角转好，左右与画面一致）：箭头 = 机身朝向，短刻度 = 初始朝向，扇形 = 视野，圆点 = 人 / 手（空心 = 还没看见）',
      hand: '手',
      handHelp: [
        '指针就是人的手。机器先要看见它（在视野里、过一个反应时间），再按性格迎过去、背过身或看别处；臂碰到手会缠上来，把指针拉开 = 抽手，它可能追。关掉就只认点击。',
        'The pointer is a person’s hand. The machine has to see it first (in view, after its reaction time), then, by persona, reaches toward it, turns away or looks elsewhere; when the arm touches the hand it wraps, and if you pull the pointer away it may chase. Off = clicks only.',
      ] as [string, string],
      handFollow: '指针 = 手',
      handModes: { unseen: '没看见', toward: '迎过去', away: '背过身', look: '看别处' },
      handLine: (m: string, touch: boolean, held: boolean) => `手 · ${m}${held ? ' · 握住' : touch ? ' · 碰着' : ''}`,
      aria: '轮回机器整机台架（行为引擎驱动）；点触手或壳体注入刺激，视角按钮切换',
    },
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
    hint: 'View set by the buttons below · try clicking a small arm',
    drive: { spin: 'spin', slider: 'slider' },
    going: { fold: 'folding ↓', open: 'extending ↑' },
    aria: 'Reincarnation machine full-assembly bench; crank and tendon driven, view set by buttons',
    loading: 'loading solids…',
    beh: {
      clock: 'Life clock',
      clockHelp: [
        '只压缩一世各段的时长（诞生 → 成长 → 衰老 → 死亡 → 空白），呼吸与动作仍按真实速度。×1 是实验口径，一世约 9 分钟；×5 约 1 分 45 秒；×10 约 50 秒；×20 约 25 秒。',
        'Compresses only the life stages (birth → growth → ageing → dying → blank); breathing and gestures stay real-time. ×1 is the experiment timing, about 9 minutes per life; ×5 about 1 min 45 s; ×10 about 50 seconds; ×20 about 25 seconds.',
      ] as [string, string],
      first: 'First life',
      firstHelp: [
        '从哪种人格开始，其余按 A → B → C → D 循环。换了就重开一场。',
        'Which persona comes first; the rest follow A → B → C → D in turn. Changing it starts a new session.',
      ] as [string, string],
      restart: 'Restart',
      motion: 'Motion',
      motionHelp: [
        '大触手与全身的动作词汇。现行 = 已上线的读法；新 = 2026-10-08 的研究原型（惊跳是 0.1 s 的反射、回应按刺激分动词、自发动作变小变慢、人格差在恢复的结构里），待作者拍板。换了就重开一场。',
        'The motion vocabulary of the big arm and the body. Current = the live reading; New = the 2026-10-08 research prototype (startle as a 0.1 s reflex, one response verb per stimulus, smaller and slower spontaneous gestures, personas differ in how they recover), pending the author’s decision. Changing it starts a new session.',
      ] as [string, string],
      motionOld: 'Current',
      motionNew: 'New · research',
      skip: 'Next stage',
      presence: 'Presence',
      presenceHelp: [
        '有没有人、离多远（真机用超声测距）。方位 0° 是机身初始朝向，左为正。',
        'Whether someone is there and how close (ultrasonic on the machine). Bearing 0° is the machine’s initial facing; left is positive.',
      ] as [string, string],
      bands: { gone: 'Away', far: 'Far', mid: 'Mid', near: 'Near' },
      bearing: 'Bearing',
      bearingAria: 'Bearing of the person from the machine’s initial facing (degrees, left positive)',
      touch: 'Touch',
      touchHelp: [
        '碰离人近的那一半壳。也可以直接点画面：点壳 = 轻拍，拖动 = 抚摸，按住不放 = 按住；点小触手、按住大触手也行。',
        'Touches the half of the shell nearer the person. Or use the canvas: click the shell to pat, drag to stroke, press and hold to hold; click a small arm or press the large arm.',
      ] as [string, string],
      touches: { pat: 'Pat', stroke: 'Stroke', poke: 'Poke', hold: 'Hold' },
      env: 'Surroundings',
      envHelp: ['拿起机器、敲桌面、拍手或说话。', 'Lift the machine, knock, clap or talk.'] as [string, string],
      envs: { lift: 'Lift', knock: 'Knock', clap: 'Clap', talk: 'Talk' },
      grasp: 'Grasp',
      graspHelp: [
        '指针碰到大触手（或按住它）= 手碰到臂。它若迎上来就会缠住手（缠到六成、手还在 = 张力开关触发）；把指针拉开 = 抽手。勾选「留物件」，抽手后臂里留着东西。',
        'Touch the large arm with the pointer (or press it) to put a hand on it. If it responds, it wraps the hand (the tension switch closes once it is 60% wrapped and the hand is still there); pull the pointer away to withdraw. With “Leave object”, something stays in the arm after you withdraw.',
      ] as [string, string],
      leave: 'Leave object',
      log: 'Log',
      logHelp: [
        '下载本场的事件日志（JSON Lines）：传感事件、引擎的回应与生命事件同一条流。',
        'Download this session’s event log (JSON Lines): sensor events, responses and life events in one stream.',
      ] as [string, string],
      export: 'Export',
      title: 'Behaviour engine',
      lifeN: (n: number) => `Life ${n}`,
      remain: (s: number) => `${s} s left`,
      rateAt: (r: number) => `life clock ×${r}`,
      arousal: 'Arousal',
      sound: 'Sound',
      light: 'Light',
      caveat: 'Rhythms not hardware-verified · yaw is a placeholder',
      hint: 'Move the pointer as a hand · click a small arm, press the large arm or the shell · views by the buttons below',
      compass: 'Top view, turned to match the current view: arrow = machine facing, tick = initial facing, wedge = field of view, dot = person / hand (hollow = not seen yet)',
      hand: 'Hand',
      handHelp: [
        '指针就是人的手。机器先要看见它（在视野里、过一个反应时间），再按性格迎过去、背过身或看别处；臂碰到手会缠上来，把指针拉开 = 抽手，它可能追。关掉就只认点击。',
        'The pointer is a person’s hand. The machine has to see it first (in view, after its reaction time), then, by persona, reaches toward it, turns away or looks elsewhere; when the arm touches the hand it wraps, and if you pull the pointer away it may chase. Off = clicks only.',
      ] as [string, string],
      handFollow: 'Pointer = hand',
      handModes: { unseen: 'not seen', toward: 'reaching toward', away: 'turned away', look: 'looking elsewhere' },
      handLine: (m: string, touch: boolean, held: boolean) => `hand · ${m}${held ? ' · held' : touch ? ' · touching' : ''}`,
      aria: 'Reincarnation machine bench driven by the behaviour engine; touch the arms or shell to add stimuli, views by buttons',
    },
  },
} as const;

export function MachineBench({
  spin = true,
  active = true,
  controls = true,
  onLight = false,
  sideControls = false,
  behavior = false,
  lang: explicitLang,
}: {
  spin?: boolean;
  active?: boolean;
  controls?: boolean;
  onLight?: boolean;
  sideControls?: boolean;
  /** 由行为引擎驱动（Lab 1-6）。不传 = 编排驱动（Lab 1-5、主页 Hook 舞台、案例页主图），与 M2 之前逐位相同 */
  behavior?: boolean;
  lang?: 'zh' | 'en';
}) {
  const lang = useBenchLang(explicitLang);
  const tx = useLabText(lang);
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
    // —— 行为档（Lab 1-6）
    setLifeRate: (r: number) => void;
    restart: (first: PersonaKey) => void;
    setVocab: (v: 1 | 2) => void;
    skip: () => void;
    presence: (band: PresenceBand, bearing: number) => void;
    touch: (t: 'pat' | 'stroke' | 'poke') => void;
    inject: (e: SensorInput) => void;
    setLeaveObject: (on: boolean) => void;
    setHandFollow: (on: boolean) => void;
    exportLog: () => { text: string; seed: number } | null;
  } | null>(null);
  /** 指针 = 手的标记圈（逐帧直接改样式，不走 React 状态） */
  const handRef = useRef<HTMLDivElement | null>(null);
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
  // —— 行为档（Lab 1-6）的面板状态；behavior 不开时这些都不出现在界面上
  const [lifeRate, setLifeRate] = useState<number>(LIFE_RATE_DEFAULT);
  const [firstK, setFirstK] = useState<PersonaKey>('A');
  const [vocab, setVocab] = useState<1 | 2>(1);
  const [band, setBand] = useState<PresenceBand>('gone');
  const [bearingDeg, setBearingDeg] = useState(0);
  const [lifted, setLifted] = useState(false);
  const [holding, setHolding] = useState(false);
  const [leaveObj, setLeaveObj] = useState(false);
  const [handFollow, setHandFollow] = useState(true);
  const [bhud, setBhud] = useState<BehaviorHud | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 交接状态**必须在这里取**，不能等下面用到时再取：createMachine() 里有五环的
    // 脚槽止程标定（每环扫 360 步 × 四档余量），开发模式下要跑好几秒。等它跑完再取，
    // 保质期早过了——第一版就是这么写的，实测取到时 age 已经 7.1s。
    const handoffKey = HANDOFF_KEY[behavior ? 'engine' : 'choreo'];
    const handed = takeBench<MachineHandoff>(handoffKey);
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
    //
    // 行为档（Lab 1-6）另有取景：机身会绕竖轴转，按「绕电机轴的扫掠圆柱」逐视角装框
    // （machine-behavior.ts 的 sweepFraming），开场就是轴测那一档。
    const frame0 = behavior ? sweepFraming(PRESET_VIEWS.axon) : { pivot: CHOREO_PIVOT, scale: CHOREO_SCALE };
    const cam = new OrbitCamera({
      cx: 350,
      cy: 260,
      pivot: { ...frame0.pivot },
      scale: frame0.scale,
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
    // 受惊状态（点击触发）：t = 距点击秒数（Infinity = 无），dir = 甩开方向
    const saStartle = SMALLARM_PLACEMENTS.map(() => ({ t: Infinity, dir: 1 as 1 | -1 }));
    // 每条的待机基角（暂停时驱动覆盖要有个基准，不能凭空归零）
    const saBase = SMALLARM_PLACEMENTS.map(() => 0);
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
    let perspNow = false;

    // ── 行为档（Lab 1-6）────────────────────────────────────────────────────────
    // 引擎只在 behavior 开时才建；编排档下这些变量全不动，渲染与 M2 之前逐位相同
    // （偏航恒 0 时 yawFrame / yawPoint 原样返回同一个对象）。
    let engine: BehaviorEngine | null = null;
    let logHeader: LogHeader | null = null;
    const logBuf: LogRecord[] = [];
    let hudDirty = false;
    let hudClock = 0;
    let firstNow: PersonaKey = 'A';
    /** 动作词汇（现行 1 / 研究原型 2）：换了重开一场；交接来的引擎带着它自己的词汇，面板跟着它 */
    let vocabNow: 1 | 2 = 1;
    let rateNow: number = LIFE_RATE_DEFAULT;
    // 台架记着的「传感事实」：重开一场时原样再告诉新引擎（人还站在那里，机器还被拿着）
    let presenceNow: { band: PresenceBand; bearing: number } = { band: 'gone', bearing: 0 };
    let liftedNow = false;
    let holdNow = false;
    let leaveObjNow = false;
    // 指针手势：按住大触手（手指在臂里，contact.held）、壳上的拍 / 摸 / 按住
    let tensionOn = false;
    let shellGesture: {
      id: number;
      half: 'L' | 'R';
      x0: number;
      y0: number;
      t0: number;
      stroked: boolean;
      held: boolean;
    } | null = null;
    // 指针 = 手（2026-10-07）：只在 /lab 的完整面板里认（主页预览、案例页侧栏不把指针当手）。
    // 指针位置（画布 CSS px）；触屏只有手指按在空白处时才有手
    const handCapable = behavior && controls && !sideControls;
    let handFollowNow = handCapable;
    // 存视口坐标（clientX/Y），每帧按此刻的画布位置换算——页面滚动时指针不动、画布在动
    let pointer: { cx: number; cy: number; touch: boolean; id: number } | null = null;
    /** 相机刚变过（换视角 / 透视）：等指针再动一下才重新判接触（不让臂在不动的指针下扫过去就算碰到） */
    let camMoved = false;
    /** 最近一次报给引擎的 HAND 读数（节流用）；null = 引擎眼里没有手 */
    let handSent: {
      bearing: number;
      dist: number;
      face: number;
      aimDir: number;
      aimBend: number;
      aimDist: number;
      at: number;
    } | null = null;
    /** 画布位置（每帧 / 每个指针事件只读一次 getBoundingClientRect） */
    let rectCache: DOMRect | null = null;
    const rectNow = (): DOMRect => rectCache ?? (rectCache = canvas.getBoundingClientRect());
    /** 由手推出来的在场档；null = 在场由面板管 */
    let handBand: PresenceBand | null = null;
    /** 指针轨迹：最近 0.3 s 的位置（判速度）与最后一次真的挪动（判「是谁动的」） */
    const track = pointerTrack();
    /** 手推出来的在场档：候选档与它出现的时刻（驻留够了才报） */
    let bandCand: PresenceBand | null = null;
    let bandCandAt = 0;
    /**
     * 碰臂的状态（machine-behavior.ts 的 contactStep）：悬停碰着没有、谁碰的谁、锚点、进圈 / 待够 dwell 的时刻，
     * 以及按住大触手（held）与按下的位置。每帧换成 contactStep 的输出；几处重置就地改字段
     */
    let contact = contactIdle();
    /** 上一个读得准的弯向（手几乎在臂轴上时沿用） */
    let lastAimDir = 0;
    /** 最近一次报给引擎的电极电平（悬停碰到 ∪ 按住） */
    let electrodeSent = false;
    // 偏航（整机绕竖轴，占位）：行为档 = 引擎给的值；编排档恒 0
    let yawNow = 0;
    const yf = (f: CellFrame): CellFrame => yawFrame(f, yawNow);
    const yp = (p: Vec3): Vec3 => yawPoint(p, yawNow);
    // 取景：行为档按「绕电机轴的扫掠圆柱」逐视角取景；编排档机位不随视角变（实测包络定的那一个）
    let framing: { p0: Vec3; s0: number; p1: Vec3; s1: number; t: number } | null = null;

    /** 行为档换视角时跟着换取景：扫掠圆柱装进新视角。动画与视角切换同长同缓动 */
    const frameTo = (k: ViewKey): void => {
      const to = sweepFraming(PRESET_VIEWS[k]);
      if (reduced) {
        cam.retarget({ ...to.pivot }, to.scale);
        framing = null;
        return;
      }
      framing = { p0: { ...cam.pivotPoint }, s0: cam.viewScale / cam.zoom, p1: { ...to.pivot }, s1: to.scale, t: 0 };
    };

    /** 新开一场：种子每场随机（非确定是论点的一部分），会话头里记着，导出的日志照样可复现 */
    const startEngine = (): void => {
      const seed = (Math.random() * 0x100000000) >>> 0;
      // 台架开着肌腱轴深卷（tendonContractions 的 deep），迎手链 v2 的深卷门要知道这一点（每轮 ≤ 4 s、冷却 45 s）
      const eng = new BehaviorEngine({ seed, order: rotateOrder(firstNow), loop: true, lifeRate: rateNow, vocab: vocabNow, deepOk: vocabNow === 2 });
      engine = eng;
      logHeader = eng.header();
      logBuf.length = 0;
      logBuf.push(...eng.drain());
      contact.held = false;
      tensionOn = false;
      shellGesture = null;
      contact.touching = false;
      contact.nearSince = -1;
      electrodeSent = false;
      handSent = null;
      handBand = null;
      bandCand = null;
      // 传感事实接着成立：人还站在那里、机器还被拿着、壳还被按着
      if (presenceNow.band !== 'gone') eng.push({ kind: 'PRESENCE', band: presenceNow.band, bearing: presenceNow.bearing });
      if (liftedNow) eng.push({ kind: 'LIFT', lifted: true });
      if (holdNow) eng.push({ kind: 'SHELL_HOLD', half: 'both', on: true });
      hudDirty = true;
    };

    /** 接过交接来的引擎状态（纯数据）；版本不符就当没有，重开一场 */
    const adoptEngine = (state: EngineState): boolean => {
      try {
        const eng = BehaviorEngine.restore(state);
        engine = eng;
        vocabNow = eng.vocab();
        setVocab(vocabNow);
        logHeader = eng.header();
        logBuf.length = 0;
        // 倍率落到滑条的某一档（本来就在档上时 setLifeRate 直接返回，不记操作日志）
        rateNow = LIFE_RATES[lifeRateStop(eng.status().lifeRate)];
        eng.setLifeRate(rateNow);
        // 引擎眼里还有手 / 电极：标成「已报过」，下一帧 syncHand 按此刻的指针对一遍（不在画布上就报离开）
        const eh = eng.state.hand;
        handSent = eh?.present
          ? { bearing: eh.bearing, dist: eh.dist, face: eh.face, aimDir: eh.aimDir, aimBend: eh.aimBend, aimDist: eh.aimDist, at: 0 }
          : null;
        handBand = null;
        electrodeSent = eng.state.electrode;
        contact.touching = false;
        hudDirty = true;
        return true;
      } catch {
        return false;
      }
    };

    /**
     * 电极电平 = 悬停碰到 ∪ 按住，变了才报。手离开臂时张力也随之消失——除非勾了「留物件」
     * （臂里还卡着东西）；cancel = 指针被系统取消，不留东西。
     */
    const syncContact = (cancel = false): void => {
      const eng = engine;
      const on = contact.touching || contact.held;
      if (on === electrodeSent) return;
      electrodeSent = on;
      // 臂伸过来碰到不动的手：by 'arm'（按轻抚算）；按住、或手伸过去碰：照旧
      eng?.push(on && contact.touching && !contact.held && contact.by === 'arm' ? { kind: 'ARM_TOUCH', on, by: 'arm' } : { kind: 'ARM_TOUCH', on });
      if (!on && tensionOn && (cancel || !leaveObjNow)) {
        tensionOn = false;
        eng?.push({ kind: 'RESISTANCE', on: false });
      }
    };

    /** 松开手上的一切（指针抬起 / 取消时）。cancel = 不是「点了一下」：不补轻拍 */
    const releaseGestures = (id?: number, cancel = false): void => {
      const eng = engine;
      if (contact.held) {
        contact.held = false;
        syncContact(cancel);
      }
      const g = shellGesture;
      if (g && (id === undefined || id === g.id)) {
        if (g.held) eng?.push({ kind: 'SHELL_HOLD', half: g.half, on: false });
        else if (!g.stroked && !cancel) eng?.push({ kind: 'SHELL_STROKE', half: g.half, touch: 'pat' });
        shellGesture = null;
      }
    };

    /**
     * 手离开（指针出了画布 / 手指抬起 / 关掉「指针 = 手」）：HAND off，悬停的接触松开，
     * 在场交还给面板的设定。
     */
    const handGone = (): void => {
      const eng = engine;
      contact.touching = false;
      contact.nearSince = -1;
      contact.enteredAt = -1;
      syncContact();
      if (handSent) {
        handSent = null;
        eng?.push({ kind: 'HAND', on: false });
      }
      bandCand = null;
      if (handBand !== null) {
        // 在场交还给面板：生效档 = 面板档与手档里近的那个，交还时只会变远（不会被当成「走近」）；
        // 面板还有人就把面板的方位一并补回去
        handBand = null;
        const pn = presenceNow;
        eng?.push(pn.band === 'gone' ? { kind: 'PRESENCE', band: 'gone' } : { kind: 'PRESENCE', band: pn.band, bearing: pn.bearing });
      }
    };

    // 蒙皮：相邻环外侧支点之间的直纹带（锚点在装配位选定后固定跟销，同 Lab.04）
    const profiles = machine.rings.map((r) => ringOuterProfile(r.data));
    const profileWorld = (ri: number): Vec3[] =>
      profiles[ri].map((j) => {
        const n = machine.rings[ri].solver.nodes[j];
        return ringPoint(machine.rings[ri].data, n.x, n.y);
      });
    /** 画面里的轮廓（带偏航）。编排档偏航恒 0，yp 原样返回同一个点 */
    const profileView = (ri: number): Vec3[] => profileWorld(ri).map(yp);
    const skinMesh = (ri: number): Float32Array =>
      bakeIndexed(
        bandVerts(
          resample(profileView(ri), SKIN_SAMPLES),
          resample(profileView(ri + 1), SKIN_SAMPLES),
        ),
        SKIN_IDX,
      );
    const skinPoints = (ri: number): Float32Array =>
      bakeRuledPoints(
        resample(profileView(ri), SKIN_U),
        resample(profileView(ri + 1), SKIN_U),
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
        R.drawMesh(`a_c${ci}`, yf(armCell(ci)), [...ARM_SHADE.dark], [...ARM_SHADE.lite]);
      }
      R.drawMesh('a_mnt', yf(ARM_MNT), [...ARM_SHADE.dark], [...ARM_SHADE.lite]);
      for (const j of armJoints) {
        if (j.gap < 0) R.drawSkinned(`a_${j.name}`, yf(armRootFrame()), yf(armCell(0)), armRootDy);
        else {
          const dy = ARM_STATIONS[j.gap + 1][1] - ARM_STATIONS[j.gap][1];
          R.drawSkinned(`a_${j.name}`, yf(armCell(j.gap)), yf(armCell(j.gap + 1)), dy);
        }
      }
      // 三根肌腱走线——不画的话「牵拉」看不见是谁在拉
      for (let k = 0; k < 3; k++) {
        const pts = armPolyline(tendonVisual3(arm.solver, k)).map(yp);
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
        R.drawMesh('sa_mount', yf(pose.mount), [...FRAME_SHADE.dark], [...FRAME_SHADE.lite]);
        R.drawMesh('sa_seg1', yf(pose.seg1), [...ARM_SHADE.dark], [...ARM_SHADE.lite]);
        R.drawSkinned('sa_soft', yf(pose.soft[0]), yf(pose.soft[1]), pose.soft[2]);
        R.drawMesh('sa_seg2', yf(pose.seg2), [...ARM_SHADE.dark], [...ARM_SHADE.lite]);
      }
    };

    /** 带序从远到近（半透明面之间没有 z 排序）。深度取两环轮心中点。 */
    const bandOrder = (): number[] => {
      const mtx = cam.matrix;
      const pv = cam.pivotPoint;
      return bandsFarToNear(machine.rings.length - 1, (ri) => {
        const a = yp(ringPoint(machine.rings[ri].data, 0, 0));
        const b = yp(ringPoint(machine.rings[ri + 1].data, 0, 0));
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
        // 行为档才带这一支（编排档的交接包与 M2 之前同形）
        ...(behavior && engine
          ? { behavior: { engine: engine.snapshot(), yaw: yawNow, first: firstNow } }
          : {}),
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
        saBase[k] = s.saTheta[k];
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
      // 行为档的交接：引擎整块状态接着跑（只有行为档台架才接；键已按驱动源分开，这里再守一道）
      if (s.behavior && behavior && adoptEngine(s.behavior.engine)) {
        firstNow = s.behavior.first;
        yawNow = s.behavior.yaw;
        setFirstK(s.behavior.first);
        setLifeRate(rateNow);
      }
      return true;
    };

    if (handed) restore(handed);
    // 行为档：没接到交接（或版本不符）就从诞生开一场
    if (behavior && !engine) startEngine();

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
        R.drawMesh(g.name, yf(machineFrame(g, machine)), s.dark, s.lite);
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

    /**
     * 行为档的一帧：引擎按真实时间定步推进 → 取执行器指令 → 换成曲柄 / 三腱 / 偏航目标。
     * 小触手的舵机角在 step() 里与解算一起给（同编排档的位置）。返回此刻的指令，没有引擎返回 null。
     */
    const stepEngine = (dt: number): ActuatorTargets | null => {
      const eng = engine;
      if (!eng) return null;
      // 壳上按着不动够久 = 「按住」（与引擎时钟无关，暂停时照样认手势）
      const g = shellGesture;
      if (g && !g.stroked && !g.held && performance.now() / 1000 - g.t0 >= HOLD_AFTER) {
        g.held = true;
        eng.push({ kind: 'SHELL_HOLD', half: g.half, on: true });
      }
      syncHand();
      if (running) eng.advance(dt, 8);
      const recs = eng.drain();
      if (recs.length) {
        for (const r of recs) {
          logBuf.push(r);
          // HAND 是逐帧的传感读数，不催 HUD 重画（看见 / 丢失有自己的记录）
          if (r.ev !== 'HAND') hudDirty = true;
        }
        if (logBuf.length > LOG_CAP) logBuf.splice(0, logBuf.length - LOG_CAP);
      }
      const tg = eng.targets();
      // 呼吸 → 曲柄：限速追，每子步 ≤1°（machine-behavior.ts 的 §6.2 实测）
      followBreath(machine, tg.breath.s, dt);
      // 臂：抽象指令 → 三腱目标，之后照旧走肌肉的临界阻尼限速
      // 台架开着肌腱轴深卷（研究原型的惊跳会用到；现行词汇不给 deep，这一项对它不起作用）
      const c = tendonContractions(tg.arm, { deep: true });
      for (let k = 0; k < 3; k++) muscles[k].target = c[k];
      yawNow = tg.yaw;
      // 抓握演示的张力开关：手在臂上（悬停碰着或按着）、缠到六成 → 卡住；臂一松（惊跳 / 死亡 / 放弃）→ 东西掉出来
      const gr = eng.state.grasp;
      // 迎手链 v2 的缠写 catchT（贴上做完、臂停稳的那一刻）：手指在那一刻之后才算被卡住；现行照旧缠到六成
      const caught = gr.catchT !== undefined ? eng.time >= gr.catchT : (eng.time - gr.t0) / gr.dur >= CATCH_AT;
      if (electrodeSent && !tensionOn && gr.phase === 'WRAP' && caught) {
        tensionOn = true;
        eng.push({ kind: 'RESISTANCE', on: true });
      } else if (tensionOn && (gr.phase === 'RELEASE' || gr.phase === 'IDLE')) {
        tensionOn = false;
        eng.push({ kind: 'RESISTANCE', on: false });
      }
      hudClock += dt;
      if (hudDirty || hudClock >= 0.2) {
        hudDirty = false;
        hudClock = 0;
        const st = eng.status();
        const mo = eng.motion();
        setBhud({
          motion: mo ? `${mo.name} · ${mo.phase}` : null,
          life: st.life,
          persona: st.persona,
          phase: st.phase,
          remain: Math.max(0, (st.phaseLen - st.phaseElapsed) / st.lifeRate),
          rate: st.lifeRate,
          arousal: st.arousal,
          soundOn: tg.sound.on,
          soundF: tg.sound.f,
          light: tg.light.level,
          yaw: tg.yaw,
          bearing: eng.state.bearing,
          band: st.band,
          // HAND 是逐帧的传感读数，不进「最近事件」（看见 / 丢失有自己的记录）。从尾巴往回找，不扫整个缓冲
          recent: (() => {
            const out: LogRecord[] = [];
            for (let i = logBuf.length - 1; i >= 0 && out.length < 4; i--) if (logBuf[i].ev !== 'HAND') out.unshift(logBuf[i]);
            return out;
          })(),
          hand: eng.state.hand
            ? {
                seen: eng.state.hand.seen,
                mode: eng.state.hand.mode,
                bearing: eng.state.hand.bearing,
                dist: eng.state.hand.dist,
                touch: electrodeSent,
                held: tensionOn && electrodeSent,
              }
            : null,
          view: [cam.matrix[0], cam.matrix[1]],
        });
      }
      return tg;
    };

    const step = (dt: number): void => {
      rectCache = null;
      if (viewAnim) {
        viewAnim.t = Math.min(1, viewAnim.t + dt / VIEW_ANIM_S);
        const e = viewAnim.t < 0.5 ? 2 * viewAnim.t ** 2 : 1 - (-2 * viewAnim.t + 2) ** 2 / 2;
        cam.setOrientation(q2m(slerpQ(viewAnim.q0, viewAnim.q1, e)));
        if (viewAnim.t >= 1) viewAnim = null;
      } else {
        cam.tick(dt);
      }
      // 行为档换视角时的取景过渡（编排档从不触发；收尾一帧把机位逐位落回去）
      if (framing) {
        const f = framing;
        f.t = Math.min(1, f.t + dt / VIEW_ANIM_S);
        if (f.t >= 1) {
          cam.retarget({ ...f.p1 }, f.s1);
          framing = null;
        } else {
          const e = f.t < 0.5 ? 2 * f.t ** 2 : 1 - (-2 * f.t + 2) ** 2 / 2;
          cam.retarget(
            { x: f.p0.x + (f.p1.x - f.p0.x) * e, y: f.p0.y + (f.p1.y - f.p0.y) * e, z: f.p0.z + (f.p1.z - f.p0.z) * e },
            f.s0 + (f.s1 - f.s0) * e,
          );
        }
      }
      const tg = behavior ? stepEngine(dt) : null;
      if (!tg) {
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
      }
      muscles.forEach((m, k) => {
        if (m.update(dt)) applyContraction3(arm.solver, arm.tendons[k], m.value);
      });
      arm.solver.step(dt, TENTACLE3D.sweeps);
      if (tg) {
        // 行为档：触须 = 引擎给的基角 + 反射（波形仍是 startleSwing）。死了就没有反射
        smallArms.forEach((sa, k) => {
          driveSmallArm(sa, feelerAngle(tg.feelers[k]));
          stepSmallArm(sa, dt);
        });
      } else {
        // 小触手：运转中按波形甩，停下时保持最后角度（物理继续松弛到静止）。
        // 受惊（点击）叠加在待机之上，且**暂停时也生效**——戳它就该有反应，
        // 波形过了寿命就停止覆盖，暂停态回到「保持不动」。
        if (running) saClock += dt;
        smallArms.forEach((sa, k) => {
          if (running) saBase[k] = idleSwing(saClock, k, saAmpNow, saFreqNow);
          const st = saStartle[k];
          if (Number.isFinite(st.t)) {
            st.t += dt;
            if (st.t >= SMALLARM_STARTLE.duration) st.t = Infinity;
          }
          const startled = Number.isFinite(st.t);
          if (running || startled) {
            driveSmallArm(sa, clampSwing(saBase[k] + (startled ? startleSwing(st.t, st.dir) : 0)));
          }
          stepSmallArm(sa, dt);
        });
      }
      render();
      if (behavior) drawHand();
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
      setPersp: (on) => {
        perspNow = on;
        camMoved = true;
        R.setPerspective(on ? 900 : 0);
      },
      viewTo: (k) => {
        // 行为档逐视角取景（扫掠圆柱）；编排档机位不随视角变，与 M2 之前同
        if (behavior) {
          frameTo(k);
          camMoved = true;
        }
        const target = PRESET_VIEWS[k];
        if (reduced) {
          viewAnim = null;
          cam.setOrientation(target);
          return;
        }
        viewAnim = { q0: m2q(cam.matrix), q1: m2q(target), t: 0 };
      },
      // —— 行为档（Lab 1-6）
      setLifeRate: (r) => {
        rateNow = r;
        engine?.setLifeRate(r);
      },
      restart: (first) => {
        firstNow = first;
        if (engine) startEngine();
      },
      setVocab: (v) => {
        vocabNow = v;
        if (engine) startEngine();
      },
      skip: () => engine?.skip(),
      presence: (b, bearing) => {
        presenceNow = { band: b, bearing };
        // 指针正当着手：生效档 = 面板档与手档里近的那个（与 syncHand 同一条规矩）
        const eff = handBand !== null && BAND_RANK[handBand] > BAND_RANK[b] ? handBand : b;
        engine?.push(eff === 'gone' ? { kind: 'PRESENCE', band: eff } : { kind: 'PRESENCE', band: eff, bearing });
      },
      touch: (t) => {
        const eng = engine;
        if (!eng) return;
        eng.push({ kind: 'SHELL_STROKE', half: halfTowardPerson(eng.state.bearing, eng.state.yaw.x), touch: t });
      },
      inject: (e) => {
        if (e.kind === 'LIFT') liftedNow = e.lifted;
        if (e.kind === 'SHELL_HOLD') holdNow = e.on;
        engine?.push(e);
      },
      setLeaveObject: (on) => {
        leaveObjNow = on;
        if (!on && tensionOn && !electrodeSent) {
          tensionOn = false;
          engine?.push({ kind: 'RESISTANCE', on: false });
        }
      },
      setHandFollow: (on) => {
        handFollowNow = on && handCapable;
        if (!handFollowNow) {
          pointer = null;
          handGone();
        }
      },
      exportLog: () => (engine && logHeader ? { text: toJsonl(logBuf, logHeader), seed: logHeader.seed } : null),
    };

    // 机位**只由下面的固定视角按钮控制**（用户拍板 2026-07-29：取消拖拽视角移动）。
    // 不挂旋转/平移/滚轮监听——滚轮不被画布吞掉，鼠标停在这台上能正常滚页。
    // 与 Lab.01–04 的差异是有意的，不是漏了：那几台仍可拖拽。
    //
    // 例外（用户 2026-07-30：「鼠标点击它，它会给一个比较大的反应，比如甩开我」）：
    // 挂一个 **pointerdown 命中小触手 → 受惊甩开**，外加 pointermove 换光标做提示。
    // 这两个监听都不动相机、不 preventDefault，滚页不受影响。

    // 世界点 → 画布 CSS 像素（照抄 gl3d 顶点着色器的投影式：视变换 → 透视 w →
    // 逻辑 700×520 → CSS）。**cx/cy 不参与**——WebGL 屏幕中心恒为画布中心（§12.3 的坑）。
    const cssPoint = (w: Vec3): { x: number; y: number } => {
      const m = cam.matrix;
      const pv = cam.pivotPoint;
      const dx = w.x - pv.x;
      const dy = w.y - pv.y;
      const dz = w.z - pv.z;
      const qx = m[0] * dx + m[1] * dy + m[2] * dz;
      const qy = m[3] * dx + m[4] * dy + m[5] * dz;
      const qz = m[6] * dx + m[7] * dy + m[8] * dz;
      const pw = perspNow ? 1 - qz / 900 : 1;
      const xl = (qx * cam.viewScale) / pw + cam.pan.x;
      const yl = (qy * cam.viewScale) / pw + cam.pan.y;
      const r = rectNow();
      return { x: r.width / 2 + xl * (r.width / 700), y: r.height / 2 + yl * (r.height / 520) };
    };

    /** 点到线段距离（CSS px 域） */
    const segDist = (
      p: { x: number; y: number },
      a: { x: number; y: number },
      b: { x: number; y: number },
    ): number => {
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const L2 = vx * vx + vy * vy || 1;
      const u = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2));
      return Math.hypot(p.x - (a.x + u * vx), p.y - (a.y + u * vy));
    };

    /** 命中哪条小触手（阈值 CSS px）；没中返回 null */
    const hitSmallArm = (px: number, py: number, radius: number): number | null => {
      if (!showNow.tentacle) return null;
      let best = radius;
      let hit: number | null = null;
      for (let k = 0; k < smallArms.length; k++) {
        const pts = saChainWorld(smallArms[k], k).map(yp).map(cssPoint);
        for (let i = 1; i < pts.length; i++) {
          const d = segDist({ x: px, y: py }, pts[i - 1], pts[i]);
          if (d < best) {
            best = d;
            hit = k;
          }
        }
      }
      return hit;
    };

    /**
     * 点击落在小触手 k 摆平面的哪一侧：把世界 h 轴投到屏幕，取点击相对轴心的分量符号。
     * 视线恰好沿 h 轴时投影退化（分量 ≈0）→ 返回 0，由调用方兜底。
     */
    const clickSide = (k: number, px: number, py: number): number => {
      const p = SMALLARM_PLACEMENTS[k];
      const o = cssPoint(yp({ x: p.o[0], y: p.o[1], z: p.o[2] }));
      const hTip = cssPoint(yp({ x: p.o[0] + p.h[0] * 10, y: p.o[1] + p.h[1] * 10, z: p.o[2] + p.h[2] * 10 }));
      const hs = { x: hTip.x - o.x, y: hTip.y - o.y };
      const hLen = Math.hypot(hs.x, hs.y);
      return hLen > 1 ? Math.sign(((px - o.x) * hs.x + (py - o.y) * hs.y) / hLen) : 0;
    };

    /** 行为档：指针离大触手脊线多远（画面上，CSS px；触手藏着 / 还没载入 = ∞）。按住它 = 手指碰到臂 */
    const armDist = (px: number, py: number): number => {
      if (!showNow.tentacle || !armReady) return Infinity;
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= N_ARM; i++) pts.push(cssPoint(yp(armPoint(arm.solver.nodes[SPINE3(i)]))));
      return polylineDist({ x: px, y: py }, pts);
    };

    /** 此刻的视图参数（与 gl3d 同一投影；反投影指针用） */
    const viewParams = (): ViewParams => ({
      m: cam.matrix,
      pivot: cam.pivotPoint,
      scale: cam.viewScale,
      pan: cam.pan,
      persp: perspNow ? 900 : 0,
    });

    /**
     * 每帧：指针 → 手（machine-behavior.ts 的 handReading），报给引擎；判悬停接触。
     * 机器在转、臂在动，指针不动读数也会变，所以逐帧算、按阈值节流着报。
     */
    const syncHand = (): void => {
      const eng = engine;
      if (!eng) return;
      const p0 = pointer;
      if (!p0 || !handFollowNow) {
        handGone();
        return;
      }
      const r = rectNow();
      if (r.width < 1 || r.height < 1) return;
      const px = p0.cx - r.left;
      const py = p0.cy - r.top;
      // 页面滚动把画布从不动的指针下挪走了（pointerleave 不一定来）：手离开
      const captured = contact.held || shellGesture !== null || p0.touch;
      if (!captured && (px < 0 || py < 0 || px > r.width || py > r.height)) {
        pointer = null;
        handGone();
        return;
      }
      // 换视角 / 取景的过渡里相机在动：读数先停着，过完再算
      if (viewAnim || framing) return;
      const read = handReading(viewParams(), cssToLogical(px, py, r.width, r.height), yawNow, handSent?.bearing);
      if (read.side >= HAND_UI.sideMin || !handSent) lastAimDir = read.aimDir;
      const now = performance.now() / 1000;
      trackTrim(track, now);
      // 臂梢那一处画面上一毫米几个 CSS px（碰臂阈值与迎手链 v2 的读数都按它换算）
      const tipW = yawPoint(ARM_GEOM.tip, yawNow);
      const qz = viewDepthOf(tipW);
      const pxPerMm = (cam.viewScale * (r.width / 700)) / (perspNow ? 1 - qz / 900 : 1);
      const v2 = eng.vocab() === 2;
      // ① 手的读数（先于在场：同一帧里引擎先知道手、再收到「走近」）。发不发的规矩在 handSendDue（v2 下指针还在挪也发）
      if (handSendDue(read, handSent, lastAimDir, now, { v2, lastMoveAt: track.lastMoveAt })) {
        // 日志里不要 17 位小数：角度 / 弯曲到千分之一、距离到毫米（引擎吃的就是日志里那个数，回放逐位一致）
        const r3 = (x: number): number => Math.round(x * 1000) / 1000;
        const send = {
          bearing: r3(read.bearing),
          dist: Math.round(read.dist),
          face: r3(read.face),
          aimDir: r3(lastAimDir),
          aimBend: r3(read.aimBend),
          aimDist: Math.round(read.aimDist),
        };
        handSent = { ...send, at: now };
        // 迎手链 v2 还要三样（现行不带，日志一字不变）：此刻的有效碰到半径 mm（引擎按它留停距）、指针已静止多久、指针速度 mm/s
        const extra = v2
          ? {
              touch: Math.round(contactRadiusMm(pxPerMm, p0.touch)),
              still: Math.min(9.9, Math.round((now - track.lastMoveAt) * 10) / 10),
              v: Math.round(trackSpeed(track, now, px, py) / pxPerMm),
            }
          : {};
        eng.push({ kind: 'HAND', on: true, ...send, ...extra });
      }
      // 暂停时只报手的读数（收件箱里连着的 HAND 只留一条）；在场与碰臂的跳变不报——否则继续时一步里涌进一串
      if (!running) return;
      // ② 在场档：手的距离带滞回、驻留够了才换；生效档 = 面板档与手档里近的那个，变了才报（不带方位：
      //    机器要先看见手才知道人在哪）
      const hb = handBandOf(read.dist, handBand);
      if (hb !== handBand) {
        if (bandCand !== hb) {
          bandCand = hb;
          bandCandAt = now;
        }
        if (handBand === null || now - bandCandAt >= HAND_UI.bandDwell) {
          const pb = presenceNow.band;
          const before = handBand === null ? pb : BAND_RANK[handBand] >= BAND_RANK[pb] ? handBand : pb;
          const after = BAND_RANK[hb] >= BAND_RANK[pb] ? hb : pb;
          handBand = hb;
          bandCand = null;
          if (after !== before) eng.push({ kind: 'PRESENCE', band: after });
        }
      } else bandCand = null;
      // ③ 碰臂。阈值按毫米给、换成此刻画面上的像素（画布多宽、哪个视角，碰到的实际距离都一样）。
      //    相机刚动过、触手藏着 / 还没载入：接触状态先冻住。判定本身在 machine-behavior.ts 的 contactStep
      //    （按住拖开 = 抽手；待够 dwell、不是飞快划过才算碰到；by 分谁碰谁；缠 / 握着时手没挪开锚点就一直算碰着）
      if (camMoved || !showNow.tentacle || !armReady) {
        syncContact();
        return;
      }
      // 迎手链 v2：缠 / 握着时慢慢挪手 = 被牵着走，锚点跟着指针（不判松开）
      contact = contactStep(contact, {
        now,
        x: px,
        y: py,
        d: armDist(px, py),
        pxPerMm,
        finger: p0.touch,
        speed: trackSpeed(track, now, px, py),
        lastMoveAt: track.lastMoveAt,
        grasp: eng.state.grasp.phase,
      }, { traction: v2 }).next;
      syncContact();
    };

    /** 世界点的视深（朝相机为正；与 cssPoint 同一投影） */
    const viewDepthOf = (w: Vec3): number => {
      const m = cam.matrix;
      const pv = cam.pivotPoint;
      return m[6] * (w.x - pv.x) + m[7] * (w.y - pv.y) + m[8] * (w.z - pv.z);
    };

    /** 手的标记圈：跟着指针，样子 = 机器此刻怎么对待这只手（触屏画在手指上方，不被指尖盖住） */
    const drawHand = (): void => {
      const el = handRef.current;
      if (!el) return;
      const p = pointer;
      if (!p || !handFollowNow) {
        if (el.dataset.on) delete el.dataset.on;
        return;
      }
      const r = rectNow();
      const x = p.cx - r.left;
      const y = p.cy - r.top - (p.touch ? 44 : 0);
      if (x < -20 || y < -20 || x > r.width + 20 || y > r.height + 20) {
        if (el.dataset.on) delete el.dataset.on;
        return;
      }
      el.dataset.on = '1';
      // 圈的定位块是 .lab-fig，画布在 /lab 上比它窄、居中：加上画布在它里面的偏移
      const ox = x + canvas.offsetLeft;
      const oy = y + canvas.offsetTop;
      // 迎手链 v2 握着手时：圈随挤压一紧一松（±12%）——网页的手没有身体，「被握着」靠标记读出来
      const sq = tensionOn && electrodeSent ? engine?.handSqueeze() ?? null : null;
      const sc = sq === null ? '' : ` scale(${(1 - 0.12 * (2 * sq - 1)).toFixed(3)})`;
      el.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px)${sc}`;
      const h = engine?.state.hand;
      const mode = h && h.seen && h.mode ? h.mode : 'unseen';
      if (el.dataset.mode !== mode) el.dataset.mode = mode;
      const touch = electrodeSent ? '1' : '';
      if ((el.dataset.touch ?? '') !== touch) el.dataset.touch = touch;
      // 握住 = 张力在、手还碰着（勾了「留物件」抽手以后，臂里握的是物件，不是这只手）
      const held = tensionOn && electrodeSent ? '1' : '';
      if ((el.dataset.held ?? '') !== held) el.dataset.held = held;
    };

    /** 行为档：壳 = 相邻两环外侧轮廓之间的直纹带（蒙皮透明度多少都算）。命中返回机身哪一半 */
    const shellHit = (px: number, py: number): 'L' | 'R' | null => {
      if (!showNow.rings || !ready) return null;
      for (let ri = 0; ri + 1 < machine.rings.length; ri++) {
        const A = resample(profileWorld(ri), SKIN_SAMPLES);
        const B = resample(profileWorld(ri + 1), SKIN_SAMPLES);
        const i = hitBand({ x: px, y: py }, A.map((q) => cssPoint(yp(q))), B.map((q) => cssPoint(yp(q))));
        // 左右半按机身局部（未转）的位置判：机身转了，壳的左半还是它自己的左半
        if (i >= 0) return shellHalf({ x: (A[i].x + B[i].x) / 2, y: (A[i].y + B[i].y) / 2 });
      }
      return null;
    };

    /** 行为档的按下：小触手 → 碰触须（立即）；大触手 → 手碰臂（按着不放）；壳 → 开始一个手势 */
    const behaviorPointerDown = (e: PointerEvent, px: number, py: number): void => {
      const eng = engine;
      if (!eng) return;
      const k = hitSmallArm(px, py, 30);
      if (k !== null) {
        eng.push({ kind: 'FEELER_TOUCH', feeler: k === 0 ? 0 : 1, side: feelerSide(clickSide(k, px, py)) });
        return;
      }
      if (armDist(px, py) <= 22) {
        contact.held = true;
        contact.pressAt = { x: px, y: py };
        canvas.setPointerCapture?.(e.pointerId);
        syncContact();
        return;
      }
      const half = shellHit(px, py);
      if (half) {
        shellGesture = { id: e.pointerId, half, x0: px, y0: py, t0: performance.now() / 1000, stroked: false, held: false };
        canvas.setPointerCapture?.(e.pointerId);
        return;
      }
      if (pointer?.touch && pointer.id === e.pointerId) canvas.setPointerCapture?.(e.pointerId);
    };

    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0) return;
      rectCache = null;
      const r = rectNow();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      if (behavior) {
        // 触屏：主手指一按下就是手在那里（按在臂上 / 壳上也是；抬起 = 手离开）。只认第一根手指
        if (e.pointerType === 'touch' && e.isPrimary && handFollowNow && !pointer) {
          pointer = { cx: e.clientX, cy: e.clientY, touch: true, id: e.pointerId };
          camMoved = false;
          // 手指落下就是手在动（不会被当成臂伸过来碰到它）
          trackMark(track, performance.now() / 1000, px, py);
        }
        behaviorPointerDown(e, px, py);
        return;
      }
      const k = hitSmallArm(px, py, 30);
      if (k === null) return;
      // 甩开方向 = 点击落在摆平面哪一侧的**反面**（侧别见 clickSide）。
      // 视线恰好沿 h 轴时投影退化——退到「远离当前倾角」兜底。
      const side = clickSide(k, px, py);
      const st = saStartle[k];
      st.dir = (side !== 0 ? -side : -Math.sign(smallArms[k].theta) || -1) as 1 | -1;
      st.t = 0;
    };
    const onPointerMove = (e: PointerEvent): void => {
      rectCache = null;
      const r = rectNow();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      if (behavior) {
        const g = shellGesture;
        if (g && e.pointerId === g.id && !g.stroked && !g.held && Math.hypot(px - g.x0, py - g.y0) > STROKE_PX) {
          g.stroked = true;
          engine?.push({ kind: 'SHELL_STROKE', half: g.half, touch: 'stroke' });
        }
        // 指针 = 手：鼠标 / 笔悬停就是手；触屏只跟着按下去的那根主手指走
        if (handFollowNow && (e.pointerType !== 'touch' || (pointer && pointer.id === e.pointerId))) {
          pointer = { cx: e.clientX, cy: e.clientY, touch: e.pointerType === 'touch', id: e.pointerId };
          camMoved = false;
          trackMove(track, performance.now() / 1000, px, py);
        }
        canvas.style.cursor =
          contact.held || shellGesture
            ? 'grabbing'
            : hitSmallArm(px, py, 30) !== null || armDist(px, py) <= 22 || shellHit(px, py)
              ? 'pointer'
              : '';
        return;
      }
      canvas.style.cursor = hitSmallArm(px, py, 30) !== null ? 'pointer' : '';
    };
    const onPointerUp = (e: PointerEvent): void => {
      if (!behavior) return;
      releaseGestures(e.pointerId);
      // 抬起手指 = 手离开；鼠标抬起后若已出了画布（按着拖出去的），手也离开
      if (pointer && pointer.id === e.pointerId && (pointer.touch || !inside(e))) pointer = null;
    };
    const onPointerCancel = (e: PointerEvent): void => {
      if (!behavior) return;
      releaseGestures(e.pointerId, true);
      if (pointer && pointer.id === e.pointerId) pointer = null;
    };
    /** 指针此刻在不在画布里（按着拖出去时 pointerleave 不来，要在抬起时自己判） */
    const inside = (e: PointerEvent): boolean => {
      const r = canvas.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    };
    const onPointerLeave = (e: PointerEvent): void => {
      // 按着（指针被捕获）时离开画布不算手离开，抬起时再判
      if (!behavior || contact.held || shellGesture) return;
      if (pointer && pointer.id === e.pointerId && !pointer.touch) pointer = null;
    };
    // 切走窗口 / 标签页：手离开（回来时指针一动就又是手）
    const dropHand = (): void => {
      pointer = null;
    };
    const onVisibility = (): void => {
      if (document.hidden) dropHand();
    };
    if (behavior) {
      window.addEventListener('blur', dropHand);
      document.addEventListener('visibilitychange', onVisibility);
    }
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('pointerleave', onPointerLeave);

    // 状态交接（见 snapshot.ts / handoff.ts）：页面转场把这个画框飞到另一页之前调一次，
    // 跑在点击那一刻——与浏览器截下的旧画面是同一个瞬间；若改在卸载时留，中间还隔着
    // 一段转场，落地的活件会比飞过来的画面超前一截，交叉淡出就成了「跳一下」。
    setStash(canvas, () => stashBench(handoffKey, capture()));

    render();
    return () => {
      disposed = true;
      apiRef.current = null;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('blur', dropHand);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.style.cursor = '';
      setStash(canvas, null);
    };
  }, [spin, behavior]);

  useBenchLoop(canvasRef, (dt) => apiRef.current?.step(dt), [spin], active);

  const goView = useCallback((k: ViewKey) => {
    setView(k);
    apiRef.current?.viewTo(k);
  }, []);

  const downloadLog = useCallback(() => {
    const out = apiRef.current?.exportLog();
    if (!out) return;
    const url = URL.createObjectURL(new Blob([out.text], { type: 'application/x-ndjson' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `reincarnation-machine-behavior-${out.seed}.jsonl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const L = COPY[lang];
  const B = L.beh;
  // 行为档（Lab 1-6）：HUD 读引擎；控制条分两层（第一层 = 刺激与生命时钟）。不传 behavior 的三处
  // （Lab 1-5、主页 Hook 舞台、案例页主图）逐位不变
  const engineOn = behavior;
  const behaviorUi = behavior && !sideControls;
  const lightBar = (v: number): string => {
    const n = Math.round(Math.min(1, Math.max(0, v)) * 5);
    return '▮'.repeat(n) + '▯'.repeat(5 - n);
  };

  const groups = (
    <>
      {/* 驱动 —— 运转 / 转速 / 透视。转速滑块是这台专有的：
          转速本就是待拍板的手感常量，与其我替你定一个数，不如给你滑块自己找。
          行为档里「运转」= 暂停 / 继续引擎；转速、相位、肌腱、小触手交给引擎，不出。 */}
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
      {engineOn ? null : (
        <div className="grp grp--half">
          <LabControlLabel help={["调整演示速度，不改变结构参数。", "Change playback speed without changing the structure."]} lang={lang}>
            {L.speed}
            {sideControls ? <b className="v">{omega.toFixed(2)}</b> : null}
          </LabControlLabel>
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
      )}
      {engineOn ? null : (
        <div className="grp grp--half">
          <LabControlLabel help={["暂停自动运转，手动查看运动周期中的位置。", "Pause automatic motion and choose a position in the cycle."]} lang={lang}>
            {tx(L.phase)}
            {sideControls ? <b className="v">{phase.toFixed(1)}°</b> : null}
          </LabControlLabel>
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
      )}
      {/* 蒙皮遮罩 —— 与 Lab.04 同一套直纹带，默认 0.67（用户 2026-07-29 拍板）：
          这台同时是项目 01 主图，主图先要读出形态。滑到 0 = 看穿到传动链，滑到 1 = 实体壳。
          环身关掉时蒙皮一并不画（皮附在环上，环没了皮也就无所附） */}
      <div className="grp grp--half">
        <LabControlLabel help={["调整蒙皮的不透明度；调低可看清内部结构。", "Adjust skin opacity to inspect the structure inside."]} lang={lang}>
          {L.skin}
          {sideControls ? <b className="v">{Math.round(skin * 100)}%</b> : null}
        </LabControlLabel>
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
        <LabControlLabel help={["显示或隐藏部件，查看传动链和装配关系。", "Show or hide parts to inspect the transmission and assembly."]} lang={lang}>{L.parts}</LabControlLabel>
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
      {engineOn ? null : (
        <div className="grp grp--tendons">
          <LabControlLabel help={["分别调整三条肌腱的收缩量，改变大触手弯向。", "Adjust three tendon contractions to bend the large arm."]} lang={lang}>{L.arm}</LabControlLabel>
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
      )}
      {/* 小触手 —— 摆幅/频率（用户 2026-07-30 机构说明后活化；波形是展示编排，
          幅频是待拍板的手感常量，给滑块自己找）。**只在横排面板出**：
          案例页侧栏的高度预算在 §13.2 已经顶满，加一组就会重新被裁；
          案例页语境用默认值即可，要调去 /lab（同一台仪器）。 */}
      {sideControls || engineOn ? null : (
        <div className="grp">
          <LabControlLabel help={["调节小触手的演示摆动。", "Adjust the small arms’ display motion."]} lang={lang}>{L.sarm}</LabControlLabel>
          <LabControlLabel help={["小触手左右摆动的角度范围。", "The angular range of the small arms’ swing."]} lang={lang}>{L.sarmAmp}</LabControlLabel>
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
          <LabControlLabel help={["小触手摆动的频率。", "The frequency of the small arms’ swing."]} lang={lang}>{L.sarmFreq}</LabControlLabel>
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
        <LabControlLabel help={["单独查看某一环；其余部件仍按显隐设置显示。", "Isolate one ring; other parts follow their visibility settings."]} lang={lang}>{L.ring}</LabControlLabel>
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
        <LabControlLabel help={["切换轴测、正面、侧面或顶视图，不改变模型。", "Switch camera views without changing the model."]} lang={lang}>{L.view}</LabControlLabel>
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
    </>
  );

  // 行为档的第一层（「解什么」）：生命时钟 / 人格 / 刺激注入 / 日志
  const behaviorGroups = behaviorUi ? (
    <>
      {/* 生命时钟 —— 四档滑条（10-07 第六批），档位刻度写在滑条下面，当前档点亮 */}
      <div className="grp grp--clock">
        <LabControlLabel help={B.clockHelp} lang={lang}>{B.clock}</LabControlLabel>
        <span className="lab-clock">
          <input
            type="range"
            min={0}
            max={LIFE_RATES.length - 1}
            step={1}
            value={lifeRateStop(lifeRate)}
            aria-label={B.clock}
            aria-valuetext={`×${lifeRate}`}
            onChange={(e) => {
              const r = LIFE_RATES[Number(e.target.value)];
              setLifeRate(r);
              apiRef.current?.setLifeRate(r);
            }}
          />
          <span className="lab-clock__ticks" aria-hidden="true">
            {LIFE_RATES.map((r, i) => (
              <span
                key={r}
                data-on={r === lifeRate ? '' : undefined}
                style={{ left: `calc(var(--lab-clock-thumb) / 2 + (100% - var(--lab-clock-thumb)) * ${i / (LIFE_RATES.length - 1)})` }}
              >
                ×{r}
              </span>
            ))}
          </span>
        </span>
      </div>
      <div className="grp grp--seg">
        <LabControlLabel help={B.firstHelp} lang={lang}>{B.first}</LabControlLabel>
        <span className="seg">
          {PERSONA_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              title={personaName(k, lang)}
              className={k === firstK ? 'active' : undefined}
              onClick={() => {
                setFirstK(k);
                apiRef.current?.restart(k);
              }}
            >
              {k}
            </button>
          ))}
        </span>
        <button type="button" onClick={() => apiRef.current?.restart(firstK)}>
          {B.restart}
        </button>
        <button type="button" onClick={() => apiRef.current?.skip()}>
          {B.skip}
        </button>
      </div>
      <div className="grp grp--seg">
        <LabControlLabel help={B.motionHelp} lang={lang}>{B.motion}</LabControlLabel>
        <span className="seg">
          {([1, 2] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={v === vocab ? 'active' : undefined}
              onClick={() => {
                setVocab(v);
                apiRef.current?.setVocab(v);
              }}
            >
              {v === 1 ? B.motionOld : B.motionNew}
            </button>
          ))}
        </span>
      </div>
      <div className="grp grp--seg">
        <LabControlLabel help={B.presenceHelp} lang={lang}>{B.presence}</LabControlLabel>
        <span className="seg">
          {BANDS.map((b) => (
            <button
              key={b}
              type="button"
              className={b === band ? 'active' : undefined}
              onClick={() => {
                setBand(b);
                apiRef.current?.presence(b, (bearingDeg * Math.PI) / 180);
              }}
            >
              {B.bands[b]}
            </button>
          ))}
        </span>
        <span className="k">{B.bearing}</span>
        <input
          type="range"
          min={-180}
          max={180}
          step={5}
          value={bearingDeg}
          disabled={band === 'gone'}
          aria-label={B.bearingAria}
          style={{ width: 96 }}
          onChange={(e) => {
            const v = Number(e.target.value);
            setBearingDeg(v);
            apiRef.current?.presence(band, (v * Math.PI) / 180);
          }}
        />
        <span className="k">{bearingDeg > 0 ? '+' : ''}{bearingDeg}°</span>
      </div>
      <div className="grp">
        <LabControlLabel help={B.touchHelp} lang={lang}>{B.touch}</LabControlLabel>
        {(['pat', 'stroke', 'poke'] as const).map((t) => (
          <button key={t} type="button" onClick={() => apiRef.current?.touch(t)}>
            {B.touches[t]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={holding}
          className={holding ? 'active' : undefined}
          onClick={() => {
            const on = !holding;
            setHolding(on);
            apiRef.current?.inject({ kind: 'SHELL_HOLD', half: 'both', on });
          }}
        >
          {B.touches.hold}
        </button>
      </div>
      <div className="grp">
        <LabControlLabel help={B.envHelp} lang={lang}>{B.env}</LabControlLabel>
        <button
          type="button"
          aria-pressed={lifted}
          className={lifted ? 'active' : undefined}
          onClick={() => {
            const on = !lifted;
            setLifted(on);
            apiRef.current?.inject({ kind: 'LIFT', lifted: on });
          }}
        >
          {B.envs.lift}
        </button>
        <button type="button" onClick={() => apiRef.current?.inject({ kind: 'KNOCK', intensity: 0.6 })}>
          {B.envs.knock}
        </button>
        <button type="button" onClick={() => apiRef.current?.inject({ kind: 'SOUND', level: 0.8 })}>
          {B.envs.clap}
        </button>
        <button type="button" onClick={() => apiRef.current?.inject({ kind: 'SOUND', level: 0.3 })}>
          {B.envs.talk}
        </button>
      </div>
      <div className="grp">
        <LabControlLabel help={B.handHelp} lang={lang}>{B.hand}</LabControlLabel>
        <label>
          <input
            type="checkbox"
            checked={handFollow}
            onChange={(e) => {
              setHandFollow(e.target.checked);
              apiRef.current?.setHandFollow(e.target.checked);
            }}
          />
          {B.handFollow}
        </label>
      </div>
      <div className="grp">
        <LabControlLabel help={B.graspHelp} lang={lang}>{B.grasp}</LabControlLabel>
        <label>
          <input
            type="checkbox"
            checked={leaveObj}
            onChange={(e) => {
              setLeaveObj(e.target.checked);
              apiRef.current?.setLeaveObject(e.target.checked);
            }}
          />
          {B.leave}
        </label>
      </div>
      <div className="grp">
        <LabControlLabel help={B.logHelp} lang={lang}>{B.log}</LabControlLabel>
        <button type="button" onClick={downloadLog}>
          {B.export}
        </button>
      </div>
    </>
  ) : null;

  return (
    <div
      className={`lab-wrap${onLight ? ' on-light' : ''}${
        sideControls && controls ? ' lab-wrap--side' : ''
      }`}
    >
      <div className="lab-fig">
        <canvas ref={canvasRef} width={1400} height={1040} aria-label={engineOn ? B.aria : L.aria} />
        {behaviorUi ? <div ref={handRef} className="lab-hand" aria-hidden="true" /> : null}
        <div className="lab-hud tl">
          {/* 只写台架编号：这台同时是项目 01 案例页的主图，而该页图号 2026-09-13 起是 N01–N20，
              再印一个 Fig. 14 会被读成本页的某张图（ArchBench / RingsBench 同此处理）。 */}
          <div style={{ color: 'var(--p300)' }}>{tx(behavior ? 'Lab 1-6' : 'Lab 1-5')}</div>
          <div>{engineOn ? B.title : tx(L.title)}</div>
          {engineOn ? (
            bhud ? (
              <>
                <div className="dim">
                  {B.lifeN(bhud.life)} · {personaName(bhud.persona, lang)} {bhud.persona} · {phaseName(bhud.phase, lang)}
                </div>
                <div className="dim">
                  {B.remain(Math.ceil(bhud.remain))} · {B.rateAt(bhud.rate)}
                </div>
                {bhud.hand ? (
                  <div className="dim">
                    {B.handLine(
                      B.handModes[bhud.hand.seen && bhud.hand.mode ? bhud.hand.mode : 'unseen'],
                      bhud.hand.touch,
                      bhud.hand.held,
                    )}
                  </div>
                ) : null}
              </>
            ) : (
              // 引擎还没走第一帧（服务端渲染 / 台架还在屏外）：读数就是一场的起点
              <div className="dim">
                {B.lifeN(1)} · {personaName(firstK, lang)} {firstK} · {phaseName('BIRTH', lang)}
              </div>
            )
          ) : (
            <div className="dim">{L.sub}</div>
          )}
        </div>
        {engineOn && bhud ? (
          // 俯视罗盘，按此刻视角转好（屏幕右 = 画面右、下 = 朝相机），左右与画面一致；箭头 = 机身朝向（偏航，占位）；
          // 扇形 = 视野；圆点 = 人（近 / 中 / 远三圈）；有手时只画手（实心 = 看见，空心 = 还没看见）
          (() => {
            const phi0 = Math.atan2(bhud.view[1], bhud.view[0]);
            const at = (bearing: number, R: number): [number, number] => {
              const a = FACING + bearing - phi0;
              return [Math.cos(a) * R, Math.sin(a) * R];
            };
            const [fx, fy] = at(bhud.yaw, 21);
            const [ux, uy] = at(0, 27);
            const [ux2, uy2] = at(0, 23);
            return (
              <svg
                className="lab-hud"
                // 尺寸必须写在 style 里：.lab-fig svg 规则给台架的 SVG 画布设了 width:100%，属性压不过它
                style={{ top: 14, right: 18, width: 62, height: 62 }}
                width={62}
                height={62}
                viewBox="-31 -31 62 62"
                role="img"
                aria-label={B.compass}
              >
                {bhud.hand ? (
                  <path
                    d={(() => {
                      const [ax, ay] = at(bhud.yaw - HAND.fov, 27);
                      const [bx, by] = at(bhud.yaw + HAND.fov, 27);
                      return `M0 0 L${ax.toFixed(2)} ${ay.toFixed(2)} A27 27 0 1 1 ${bx.toFixed(2)} ${by.toFixed(2)} Z`;
                    })()}
                    fill="currentColor"
                    fillOpacity={0.07}
                  />
                ) : null}
                <circle r={27} fill="none" stroke="currentColor" strokeOpacity={0.3} />
                <circle r={18} fill="none" stroke="currentColor" strokeOpacity={0.14} />
                {/* 刻度 = 机身初始朝向 */}
                <line x1={ux} y1={uy} x2={ux2} y2={uy2} stroke="currentColor" strokeOpacity={0.5} />
                <line x1={0} y1={0} x2={fx} y2={fy} stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
                {bhud.hand ? (
                  (() => {
                    // 手：离电机轴 0.6 m（臂梢那一圈）画在内圈，再往外按距离铺到 3 m 贴外圈
                    const hd = bhud.hand.dist;
                    const hr = hd <= 600 ? 6 + (hd / 600) * 12 : 18 + (Math.min(hd, 3000) - 600) * (9 / 2400);
                    const [hx, hy] = at(bhud.hand.bearing, hr);
                    return (
                      <circle
                        cx={hx}
                        cy={hy}
                        r={3}
                        fill={bhud.hand.seen ? 'var(--g300)' : 'none'}
                        stroke="var(--g300)"
                        strokeWidth={1.2}
                      />
                    );
                  })()
                ) : bhud.band !== 'gone' && bhud.bearing !== null ? (
                  (() => {
                    const [px, py] = at(bhud.bearing, bhud.band === 'near' ? 11 : bhud.band === 'mid' ? 18 : 25);
                    return <circle cx={px} cy={py} r={3.6} fill="var(--p300)" />;
                  })()
                ) : null}
              </svg>
            );
          })()
        ) : null}
        <div className="lab-hud br">
          <div className="num">{tx("φ")} {phase.toFixed(1)}°</div>
          {engineOn ? (
            <>
              {hud.note ? (
                <div className="dim">{tx('3D preview unavailable')}</div>
              ) : bhud ? (
                <div className="dim">
                  {B.arousal} {bhud.arousal.toFixed(2)} · {B.sound} {bhud.soundOn ? `● ${Math.round(bhud.soundF)} Hz` : '○'} · {B.light}{' '}
                  {lightBar(bhud.light)}
                </div>
              ) : null}
              {bhud?.motion ? (
                <div className="dim">
                  {B.motion} {bhud.motion}
                </div>
              ) : null}
              <div className="dim">{B.caveat}</div>
            </>
          ) : (
            <div className="dim">
              {hud.note
                ? tx('3D preview unavailable')
                : `${tx('apex')}(S${hud.ring + 1}) ${hud.apex.toFixed(1)} mm · ${tx('err')} ${hud.err.toFixed(2)} · ${
                    run ? (hud.folding ? L.going.fold : L.going.open) : L.drive.slider
                  }`}
            </div>
          )}
        </div>
        {sideControls && controls ? null : engineOn ? (
          <div className="lab-hud bl dim">
            {bhud && bhud.recent.length
              ? bhud.recent.map((r) => (
                  <div key={r.id}>
                    {r.t.toFixed(1)} s · {describeRecord(r, lang)}
                  </div>
                ))
              : B.hint}
          </div>
        ) : (
          <div className="lab-hud bl dim">{L.hint}</div>
        )}
      </div>
      {controls ? (
        behaviorUi ? (
          <div className="lab-ctl lab-ctl--tiered">
            <div className="lab-ctl__row lab-ctl__solve">{behaviorGroups}</div>
            <div className="lab-ctl__row">{groups}</div>
          </div>
        ) : (
          <div className="lab-ctl">{groups}</div>
        )
      ) : null}
    </div>
  );
}
