'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed, type MeshPlace } from '../../src/lib/linkage/gl3d';
import type { Vec3 } from '../../src/lib/linkage/solver3d';
import { SKIN_UNITS, skinSiteOpts } from '../../src/lib/space/skin-data';
import {
  SOLID,
  boxVerts,
  buildSolidTopology,
  fillSolidVerts,
  placePoint,
  railSpan,
  ringPlateVerts,
  rotateVertsY,
  type RingPlace,
} from '../../src/lib/space/skin-solid';
import {
  SKIN,
  createSkinUnit,
  renderSmooth,
  type SkinSpec,
  type SkinUnit,
  type SkinUnitOpts,
} from '../../src/lib/space/skin-unit';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.07 · 项目二第二台：皮肤单元立体带（用户 2026-08-19 立项「也是这四个，
 * 给这个外表皮一些厚度（立体的），加入立体的视角，复用之前用过的」）。
 *
 * 物理与 Lab.06 同一套：四台 2D 剖面引擎（skinSiteOpts 全套站方修正）同步收缩；
 * 本台只做立体呈现——剖面挤出成带（v7 是 2D 剖面模拟，单元在交接件里通篇叫
 * 「带子」）+ 织物真实厚度 + 前后剖口切面；几何烘焙 = src/lib/space/skin-solid
 * （拓扑定死、顶点逐帧填），渲染/相机全部复用既有装备（gl3d FlatRenderer +
 * camera3d OrbitCamera + 视角预设四元数 slerp——RingsBench 同款），装备零改。
 * 定步推进 / 帧间 EMA / 自动重播与 Lab.06 同一套纪律。
 *
 * 2026-08-23（Lab.09 圆筒）起本组件同时是**环列**台架：引擎与摆放分开——
 * units = 有几种键谱就解几条，order = 摆在哪些位置（一条引擎可摆多处）；
 * ring = true 时实例绕世界 Y 排一圈、半径由滑块给。ring 关时落笔式子退化成
 * 原来的直排路径，Lab.07/08 逐位不变。
 */
const RATE = 110; // 协议步/秒（与 Lab.06 同）
const MAX_STEPS_PER_FRAME = 3;
const REPLAY_HOLD_S = 3.2;
const VIEW_ANIM_S = 0.35;
/** 四单元沿 X 排布的间距与画面枢轴（世界单位 = 2D px 尺度） */
const UNIT_GAP_X = 175;
// 机位（2026-08-22 注册端反转后**不用改**：装置占位的并集仍是 [0, 初始芯长]——
// 以前是顶端钉死、下缘往上缩，现在是下缘钉死、顶端往下走，空出来的那块从底部
// 换到了顶部，取景范围一模一样。按终态去重新居中会把起始态顶出画外，实测即此）
const PIVOT = { x: 290, y: 168, z: 0 };
const CAM_SCALE = 0.98;
// 条纹双色（2D 目录的 GREEN/PALE 立体化）：A=族系绿、B=灰纱
const DARK_A: [number, number, number] = [0.075, 0.16, 0.12];
const LITE_A: [number, number, number] = [0.42, 0.76, 0.58];
const DARK_B: [number, number, number] = [0.11, 0.12, 0.12];
const LITE_B: [number, number, number] = [0.62, 0.66, 0.63];
/** 环列天花圆环板（相对站位半径的内/外让量 + 板厚），用户 2026-08-23「天花改成圆环板」 */
// inner/outer 收窄到刚够罩住带子的顶端：再宽一点在顶视里会盖掉环形平台的内圈
// （首版 14/16 盖掉约三成，CDP 顶视图即此）
const CEIL_RING = { inner: 12, outer: 11, y: -3, halfT: 3, segs: 72 } as const;
const RAIL_DARK: [number, number, number] = [0.08, 0.09, 0.1];
const RAIL_LITE: [number, number, number] = [0.4, 0.43, 0.46];
const C_BOND: [number, number, number] = [0.88, 0.42, 0.24];
// 布景（Lab.10 房间 + 比例小人，2026-08-25）：房间压得比芯轨还暗——它是背景不是展品；
// 小人略亮且偏暖，在灰调的房间里一眼认得出是人
const ROOM_DARK: [number, number, number] = [0.05, 0.06, 0.065];
const ROOM_LITE: [number, number, number] = [0.24, 0.27, 0.29];
const FIG_DARK: [number, number, number] = [0.12, 0.115, 0.105];
const FIG_LITE: [number, number, number] = [0.62, 0.6, 0.56];

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

const VIEWS = [
  { key: 'axon', label: '轴测' },
  { key: 'front', label: '正' },
  { key: 'side', label: '侧' },
  { key: 'top', label: '顶' },
] as const;
export type ViewKey = (typeof VIEWS)[number]['key'];
/** 本台世界系：X 右、Y 向下（与屏幕同向）、Z 出屏 ⇒ 正视 = 恒等 */
const AXON_PITCH = -0.34;
const AXON_YAW = -0.62;
const makePresets = (pitch: number, yaw: number): Record<ViewKey, M3> => ({
  axon: mul3(rotX3(pitch), rotY3(yaw)),
  front: rotZ3(0),
  side: rotY3(-Math.PI / 2 + 0.12),
  // 顶视是高角度斜俯视，不是纯俯视——单元吊在天花下，垂直往下看只剩天花板条
  // （首版即此错，CDP 截图整幅灰板）
  top: mul3(rotX3(-Math.PI / 2 + 0.52), rotY3(-0.35)),
});

// 四元数 slerp（RingsBench 同款：矩阵直插会走非刚体路径）
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
  if (dot > 0.9995) {
    const r: Quat = [
      a[0] + (bb[0] - a[0]) * t,
      a[1] + (bb[1] - a[1]) * t,
      a[2] + (bb[2] - a[2]) * t,
      a[3] + (bb[3] - a[3]) * t,
    ];
    const L = Math.hypot(...r) || 1;
    return [r[0] / L, r[1] / L, r[2] / L, r[3] / L];
  }
  const th = Math.acos(dot);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [
    wa * a[0] + wb * bb[0],
    wa * a[1] + wb * bb[1],
    wa * a[2] + wb * bb[2],
    wa * a[3] + wb * bb[3],
  ];
}

/**
 * 一条独立引擎。EMA 与绘图平滑按**引擎**算一次，它的全部实例共用结果——
 * Lab.09 圆筒圈上只有四种键谱、却要摆二十处，解四次就够（引擎无随机，
 * 同谱同初值的解算逐位相同）。Lab.07/08 是一条引擎一处实例，行为不变。
 */
interface SolidSim {
  sim: SkinUnit;
  smoothW: number;
  smoothP: number;
  emaX: Float64Array | null;
  emaY: Float64Array | null;
  topo: ReturnType<typeof buildSolidTopology>;
  /** 落位纵移（常量）：单元长度不同时把各自的下缘对到同一条线 */
  offY: number;
  /** 本帧平滑后的剖面（render 内填，实例共用，不逐实例重算） */
  sx: Float64Array | null;
  sy: Float64Array | null;
}

/** 场上的一份摆放（引擎下标 + 站位） */
interface SolidInst {
  simIdx: number;
  offX: number;
  offZ: number;
  /** 环列的方位角（ring 关时不用） */
  angle: number;
  /** 环阵列：这条带属于哪一份环编制（ringPlans 下标）；非阵列恒 0 */
  plan: number;
  ceilKey: string;
  verts: Float32Array;
}

/**
 * 环阵列的一格（Lab.10）：站位 + 用哪一份环编制。
 * 阵列下**几何只烘一份**——同一条引擎、同一半径，320 处的差别全在 (方位角, 平移) 里，
 * 故顶点上传一次、逐处只换模型变换各画一遍（gl3d 的 MeshPlace）。
 */
export interface SolidCell {
  x: number;
  z: number;
  plan: number;
}

/** 场景单元（units prop 用）：spec + 引擎选项 + 绘图平滑 */
export interface SolidUnitDef {
  spec: SkinSpec;
  opts: SkinUnitOpts;
  smooth: readonly [number, number];
}

/**
 * 排布（layouts prop 用）：单元沿 X 分列（gapX）或沿 Z 密排并拢（gapZ）+
 * 该排布下的机位。传 ≥2 个即出「排列」切换；**切换只改渲染偏移与机位，
 * 不重建引擎**（收缩进行到哪就在哪继续——并拢/分列看的是同一次收缩）。
 * 只支持 ceiling='span'（per-unit 天花板条按挂载时 offX 烘死，不随排布走）。
 */
export interface SolidLayout {
  key: string;
  label: string;
  gapX: number;
  /** 沿深度的单元间距（并拢用；建议略大于 depth，贴平会让相邻剖口共面 z-fight） */
  gapZ: number;
  pivot: { x: number; y: number; z: number };
  camScale: number;
  /** 该排布的默认机位（2026-08-20 用户「还是不齐」→ 查明是视角的深度错位）：
   *  并拢排布把 12 片沿深度叠着，相机只要有俯仰，远片就在屏幕上纵向偏移
   *  （12 条**完全相同**的形状在轴测机位下照样呈阶梯——实验实证）。
   *  俯仰角 = 0 的机位（正/侧）深度分量对屏幕 y 的系数恰为 0 ⇒ 一排恒水平。
   *  省略 = 'axon'（分列排布 gapZ=0、无深度展开，任何机位都不错位） */
  home?: ViewKey;
}
// 对位注记（2026-08-20 二轮纠偏）：曾在这里做过「渲染纵移居中」（center/frame
// 旗标），被用户否——顶端接天花的部分会跟着错位。对位的正解在键谱层：lead
// （贴合段节数）就是形状在带上的位置，见 skin-array.ts「lead = 形状在带上的位置」。

interface SolidHud {
  kicker: string;
  title: string;
  sub: string;
  hint: string;
  aria: string;
}

const DEFAULT_HUD: SolidHud = {
  kicker: 'Lab.07 / Project II',
  title: '皮肤单元 · 立体带',
  sub: `剖面挤出 · 织物厚度 ${SOLID.THICK}px · 同一收缩协议`,
  hint: '拖拽旋转 · 右键平移 · 滚轮缩放',
  aria: '皮肤单元立体带：四个键谱的剖面挤出成有厚度的织物带，可拖拽旋转',
};

export function SkinSolidBench({
  active = true,
  onLight = false,
  controls = true,
  units,
  gapX = UNIT_GAP_X,
  gapZ = 0,
  depth = SOLID.DEPTH,
  pivot = PIVOT,
  camScale = CAM_SCALE,
  ceiling = 'per-unit',
  rate = RATE,
  hud: hudCopy = DEFAULT_HUD,
  layouts,
  order,
  ring = false,
  cells,
  ringPlans,
  rig,
  scene,
  camScaleFor,
  radius,
  thick = SOLID.THICK,
  axon,
  rail = 'core',
  unitsKey,
  extraControls,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
  /** 场景单元（默认 = Lab.06 那四台 × skinSiteOpts）；Lab.08 阵列传自己的序列 */
  units?: readonly SolidUnitDef[];
  gapX?: number;
  /** 沿深度的间距（网格排布的行距；单排布时默认 0 = 一列，行为与加它之前相同） */
  gapZ?: number;
  /** 带深（「单元很窄」= 传小值） */
  depth?: number;
  pivot?: { x: number; y: number; z: number };
  camScale?: number;
  /** 天花：per-unit = 每单元一条板（Lab.07）；span = 一整条通长板（密排阵列用——
   *  per-unit 板在小间距下会大面积共面重叠 → z-fight）；
   *  ring = 圆环板（Lab.09 环列 / Lab.10 环阵列——阵列下每格一块，随半径滑块重烘） */
  ceiling?: 'per-unit' | 'span' | 'ring';
  rate?: number;
  hud?: SolidHud;
  /** 多排布（≥2 出「排列」切换，首项为默认）；省略 = 单排布（gapX/pivot/camScale） */
  layouts?: readonly SolidLayout[];
  /** 摆放编制：每项是 units 的下标（同一条引擎可摆多处）。省略 = 一条一处 */
  order?: readonly number[];
  /** 环列（Lab.09 圆筒）：实例绕世界 Y 排一圈而不是排一列，半径由 radius 给 */
  ring?: boolean;
  /**
   * 环阵列（Lab.10）：把整个环复制到若干格站位上。给的是**半径的函数**——
   * 格距由环的外缘定，而外缘随半径滑块动（用户 2026-08-25 拍板「格距跟着滑块走」）。
   * 省略 = 单个环（Lab.09），绘制路径逐位不变。
   */
  cells?: (radius: number) => readonly SolidCell[];
  /** 环阵列的编制表：每份是「环上第 i 条带用哪一条引擎」；省略 = 只有一份（= order） */
  ringPlans?: readonly (readonly number[])[];
  /**
   * 装置整体缩放（Lab.10：用户 2026-08-25「整体缩小至 0.5」）。
   * `scale` = 摆放期的均匀缩放（几何一个数不重算，只是摆的时候缩）；
   * `y` = 缩完的整体下移量，用来把装置的下缘留在原来那个高度。
   * 省略 = 1 / 0（Lab.07–09 逐位不变）。**芯轨不吃这个缩放的竖向部分**——它是房间的
   * 立杆，上端恒在天花，装置挂在它的下半截。
   */
  rig?: { scale: number; y: number };
  /**
   * 布景（Lab.10 的房间 + 人体比例参考）：给半径返回一组静件三角网格。
   * 随半径重建（格距变了房间也得变），台架按半径缓存、不逐帧重算。
   * 省略 = 不画布景（Lab.07–09 的绘制路径逐位不变）。
   */
  scene?: (radius: number) => readonly { verts: Float32Array; idx: Uint32Array; kind: 'room' | 'figure' }[];
  /**
   * 取景：给半径与当前视角算 camScale。两件事都要它——阵列随半径变大时相机得跟着退，
   * 而**四个视角所需的取景差得很远**（轴测被宽度卡、顶视被整片地面的高度卡）。
   * 省略 = camScale 不随半径与视角动（Lab.07–09 的行为）。
   */
  camScaleFor?: (radius: number, view: ViewKey) => number;
  /** 半径滑块（只在 ring 下有意义）——用户 2026-08-23 拍板「半径做滑块现场调」 */
  radius?: { min: number; max: number; def: number };
  /** 织物厚度（窄带上 5 太厚，会读成方棍） */
  thick?: number;
  /** 轴测机位（省略 = 本文件的默认三元组） */
  axon?: { pitch: number; yaw: number };
  /** 芯轨的读法（见 skin-solid.railSpan）：core = 跟着芯收缩；fixed = 天花到钉住点的固定立杆 */
  rail?: 'core' | 'fixed';
  /** units/order 的版本号：变了就整场重建引擎（Lab.09 换形态即此），不重挂 WebGL 上下文 */
  unitsKey?: string;
  /** 台架自己的控件（塞进控制条最前面）——Lab.09 的形态选择 */
  extraControls?: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<{
    step: (dt: number) => void;
    replay: () => void;
    setPersp: (on: boolean) => void;
    setRadius: (r: number) => void;
    setUnits: (
      u: readonly SolidUnitDef[],
      o?: readonly number[],
      plans?: readonly (readonly number[])[],
    ) => void;
    viewTo: (k: ViewKey) => void;
    viewHome: () => void;
    setLayout: (li: number) => void;
  } | null>(null);
  const runningRef = useRef(true);
  const speedRef = useRef(1);
  const bondsRef = useRef(true);
  const radiusRef = useRef(radius?.def ?? 0);
  // 主 effect 是 []-deps ⇒ 直接闭包会永远拿挂载那一刻的函数 prop。换编制时 cells 会变
  // （每格用哪一份编制随之变），拿旧的会让除第一份以外的编制一格都摆不出去。
  const cellsRef = useRef(cells);
  const camScaleRef = useRef(camScaleFor);
  const sceneRef = useRef(scene);
  useEffect(() => {
    cellsRef.current = cells;
    camScaleRef.current = camScaleFor;
    sceneRef.current = scene;
  });
  // 推进速率随编制变（渐变要解十一条引擎，得放慢）——主 effect 只建一次，故走 ref
  const rateRef = useRef(rate);
  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);
  const [radiusV, setRadiusV] = useState(radius?.def ?? 0);
  const [running, setRunning] = useState(true);
  const [bonds, setBonds] = useState(true);
  const [persp, setPersp] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<ViewKey>(layouts?.[0]?.home ?? 'axon');
  const [layout, setLayout] = useState(0);
  const [hud, setHud] = useState<{ r: number; step: number; locked: number; phase: string; note: string }>({
    r: SKIN.R0,
    step: 0,
    locked: 0,
    phase: '收缩中',
    note: '',
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const axonPitch = axon?.pitch ?? AXON_PITCH;
    const axonYaw = axon?.yaw ?? AXON_YAW;
    const presets = makePresets(axonPitch, axonYaw);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      runningRef.current = false;
      setRunning(false);
    }

    // 单排布 = 一条「默认排布」——多排布与否走同一条路径
    const layoutList: readonly SolidLayout[] =
      layouts && layouts.length
        ? layouts
        : [{ key: 'default', label: '', gapX, gapZ, pivot, camScale }];
    let layoutIdx = 0;

    /** 当前视角（逐视角取景要用；预设切换与归位都要同步它） */
    let viewKey: ViewKey = layoutList[0].home ?? 'axon';
    const scaleOf = (k: ViewKey = viewKey): number => {
      const f = camScaleRef.current;
      return f ? f(radiusRef.current, k) : layoutList[layoutIdx].camScale;
    };

    const cam = new OrbitCamera({
      cx: 350,
      cy: 260,
      pivot: layoutList[0].pivot,
      scale: camScaleFor ? camScaleFor(radiusRef.current, viewKey) : layoutList[0].camScale, // 挂载帧：ref 尚未同步，用 prop
      pitch0: axonPitch,
      yaw0: axonYaw,
      zoomMin: 0.5,
      zoomMax: 3,
      autoYaw: 0,
      // 转盘模式（用户 2026-08-20 拍板「模仿 Rhino，怎么拖都是正的」）：
      // 本台世界 Y 沿屏幕竖直 ⇒ upAxis 默认 'y'
      mode: 'turntable',
    });

    let renderer: FlatRenderer | null = null;
    try {
      renderer = new FlatRenderer(canvas, 700, 520, 1200);
    } catch (error) {
      setHud((h) => ({
        ...h,
        note: `3D preview unavailable · ${error instanceof Error ? error.message : 'WebGL 不可用'}`,
      }));
      return;
    }
    const R = renderer;

    /**
     * 一份实例在某个排布下的站位。两种：环列（全在方位角里，行列偏移必须清零；
     * 环阵列的格子偏移走 cells，不进这里）/ 一列（Lab.07/08 的原路径）。
     */
    const placeAt = (u: number, L: SolidLayout, n: number): { offX: number; offZ: number } => {
      if (ring) return { offX: 0, offZ: 0 };
      // Z 取 ((n−1)/2 − u)：单元 0 在 +Z（轴测机位的近端）——分列的「左」= 并拢的「近」
      return { offX: u * L.gapX, offZ: ((n - 1) / 2 - u) * L.gapZ };
    };

    let defs: readonly SolidUnitDef[] =
      units ?? SKIN_UNITS.map((d) => ({ spec: d.spec, opts: skinSiteOpts(d), smooth: d.smooth ?? [3, 1] }));
    /** 摆放编制：省略 = 一条引擎一处实例（Lab.07/08 的行为） */
    let plan: readonly number[] = order ?? defs.map((_, u) => u);
    /** 环阵列的编制表（每份 = 一整个环的带→引擎映射）；非阵列只有一份 */
    let planList: readonly (readonly number[])[] = ringPlans ?? [plan];
    let sims: SolidSim[] = [];
    let insts: SolidInst[] = [];
    const makeSims = (): SolidSim[] => defs.map((def) => {
      const sim = createSkinUnit(def.spec, def.opts);
      const [smoothW, smoothP] = def.smooth;
      return {
        sim,
        smoothW,
        smoothP,
        emaX: null,
        emaY: null,
        topo: buildSolidTopology(sim.n, SKIN.STRIPE),
        offY: 0, // 全部建好后统一解（见下方 footAlign）
        sx: null,
        sy: null,
      };
    });
    const makeInsts = (): SolidInst[] => {
      // 环阵列（Lab.10）：实例 = 每份环编制 × 环上每条带；格子偏移不进实例，
      // 由 placesOf 现算成摆放表——同一条带在十六格里是同一份顶点
      if (cells) {
        const out: SolidInst[] = [];
        planList.forEach((bandPlan, v) => {
          bandPlan.forEach((simIdx, u) => {
            out.push({
              simIdx,
              offX: 0,
              offZ: 0,
              angle: (u / bandPlan.length) * Math.PI * 2,
              plan: v,
              ceilKey: `ceil-p${v}-u${u}`,
              verts: new Float32Array(4 * sims[simIdx].sim.n * 3),
            });
          });
        });
        return out;
      }
      return plan.map((simIdx, u) => ({
        simIdx,
        ...placeAt(u, layoutList[0], plan.length),
        angle: (u / plan.length) * Math.PI * 2,
        plan: 0,
        ceilKey: `ceil-u${u}`,
        verts: new Float32Array(4 * sims[simIdx].sim.n * 3),
      }));
    };
    /** 环上站位（ring 关时恒 null ⇒ fillSolidVerts 走与加它之前逐位相同的直排路径）。
     *  **环阵列下恒 null**：那条路径把方位角烘进顶点，而阵列要的是「同一份顶点摆多处」，
     *  转到 GPU 的 uModelR 上去（Lab.09 单环仍走 CPU 那条，逐位不回归） */
    const placeOf = (inst: SolidInst): RingPlace | null =>
      ring && !cells ? { radius: radiusRef.current, angle: inst.angle } : null;

    // 环阵列的格子表（随半径滑块重算：格距 = 2·外缘 + 缝，见 skin-grid）
    let cellList: readonly SolidCell[] = cells ? cellsRef.current!(radiusRef.current) : [];
    const rigS = rig?.scale ?? 1;
    const rigY = rig?.y ?? 0;
    /** 某份编制的全部摆放（方位角 + 缩放 + 格子平移）；非阵列 = undefined ⇒ 原来的单处绘制 */
    const placesOf = (inst: SolidInst): readonly MeshPlace[] | undefined => {
      if (!cells) return undefined;
      const out: MeshPlace[] = [];
      for (const c of cellList)
        if (c.plan === inst.plan) out.push({ yaw: inst.angle, x: c.x, y: rigY, z: c.z, s: rigS });
      return out;
    };
    /** 同一批站位，但**不缩放**（芯轨那种已经按世界尺寸建好的件用） */
    const placesWorldOf = (inst: SolidInst): readonly MeshPlace[] | undefined => {
      if (!cells) return undefined;
      const out: MeshPlace[] = [];
      for (const c of cellList)
        if (c.plan === inst.plan) out.push({ yaw: inst.angle, x: c.x, y: 0, z: c.z });
      return out;
    };
    /** 天花圆环板的摆放：每格一块，与编制无关 */
    const cellPlaces = (): readonly MeshPlace[] | undefined =>
      cells ? cellList.map((c) => ({ yaw: 0, x: c.x, y: 0, z: c.z })) : undefined;
    /** 布景（房间 + 比例小人）：静件，按半径缓存重烘 */
    let setR = Number.NaN;
    let setMeshes: { data: Float32Array; kind: 'room' | 'figure' }[] = [];
    const bakeScene = (): void => {
      const f = sceneRef.current;
      if (!f) return;
      setMeshes = f(radiusRef.current).map((m) => ({
        data: bakeIndexed(m.verts, m.idx),
        kind: m.kind,
      }));
      setR = radiusRef.current;
    };

    /** 半径变了：格距跟着走（用户 2026-08-25 拍板），相机也得跟着退 */
    const reflow = (): void => {
      if (sceneRef.current && setR !== radiusRef.current) bakeScene();
      if (!cells) return;
      cellList = cellsRef.current!(radiusRef.current);
      if (camScaleRef.current) cam.retarget(layoutList[layoutIdx].pivot, scaleOf());
    };

    // 下缘对位（用户 2026-08-22「对齐点都在最下面的点」）：注册端换到底端后，
    // 每台的末节点各自钉在自己的初始位；长度不同的单元（Lab.07 的四台）要把短的
    // 整体下移，四条下缘才落在同一条线上。纯常量落位，天花板条与芯轨一起跟着移。
    // Lab.08 的十二条带总长本来就配平相同 ⇒ 全为 0，逐位不变。
    const footAlign = (): void => {
      const feet = sims.map((v) => v.sim.py[v.sim.n - 1]);
      const deepest = Math.min(...feet);
      sims.forEach((v, u) => {
        v.offY = (feet[u] - deepest) * SOLID.SCALE; // 世界 Y 向下为正 ⇒ 短的加正值下移
      });
    };
    /** 建/重建整场（换键谱走这条，不重挂 WebGL 上下文） */
    const seed = (): void => {
      sims = makeSims();
      insts = makeInsts();
      footAlign();
    };
    seed();

    /** 排布只改渲染偏移与机位——引擎不重建，收缩接着跑 */
    const applyLayout = (li: number): void => {
      layoutIdx = li;
      const L = layoutList[li];
      insts.forEach((v, u) => {
        const q = placeAt(u, L, insts.length);
        v.offX = q.offX;
        v.offZ = q.offZ;
      });
      cam.retarget(L.pivot, camScaleRef.current ? scaleOf() : L.camScale);
    };

    // 天花板条（静件，随构造一次烘焙上传）。span = 一整条通长板——
    // 密排阵列下 per-unit 板会大面积共面重叠（z-fight）；每排布各烘一条
    // （X/Z 范围随排布变），绘制时取当前排布那条
    /** 天花（静件）：三种非环列的读法各烘一次；环列的圆环板随半径动态重烘 */
    const bakeCeil = (): void => {
      if (ceiling === 'per-unit') {
        for (const v of insts) {
          const ceil = boxVerts(v.offX + 30, -3, 0, 88, 3, depth / 2 + 16);
          R.addMesh(v.ceilKey, bakeIndexed(ceil.verts, ceil.idx));
        }
        return;
      }
      if (ceiling !== 'span') return;
      // 按该排布下**实例的实际站位**算包围盒——一列时与旧算式逐位相同
      // （min offX=0 / max=(n−1)gapX、offZ 对称），网格排布也照样罩得住
      layoutList.forEach((L, li) => {
        const n = insts.length;
        const qs = Array.from({ length: n }, (_, u) => placeAt(u, L, n));
        const z0 = Math.min(...qs.map((q) => q.offZ)) - depth / 2 - 16;
        const z1 = Math.max(...qs.map((q) => q.offZ)) + depth / 2 + 16;
        const x0 = Math.min(...qs.map((q) => q.offX)) - 45;
        const x1 = Math.max(...qs.map((q) => q.offX)) + 75;
        const ceil = boxVerts((x0 + x1) / 2, -3, (z0 + z1) / 2, (x1 - x0) / 2, 3, (z1 - z0) / 2);
        R.addMesh(`ceil-span-${li}`, bakeIndexed(ceil.verts, ceil.idx));
      });
    };
    bakeCeil();
    // 环列天花是圆环板：半径可现场调 ⇒ 不能烘死，按半径缓存重烘（一次 72×4 顶点）
    bakeScene();
    let ceilRingR = Number.NaN;
    let ceilRingData: Float32Array | null = null;
    const ceilRing = (): Float32Array => {
      const rad = radiusRef.current;
      if (!ceilRingData || ceilRingR !== rad) {
        const pl = ringPlateVerts(
          Math.max(2, (rad - CEIL_RING.inner) * rigS),
          (rad + CEIL_RING.outer) * rigS,
          CEIL_RING.y,
          CEIL_RING.halfT,
          CEIL_RING.segs,
        );
        ceilRingData = bakeIndexed(pl.verts, pl.idx);
        ceilRingR = rad;
      }
      return ceilRingData;
    };
    const IDENT = {
      ux: 1, uy: 0, uz: 0,
      ex: 0, ey: 1, ez: 0,
      fx: 0, fy: 0, fz: 1,
      o: { x: 0, y: 0, z: 0 },
    };

    let viewAnim: { q0: Quat; q1: Quat; t: number; from: ViewKey; to: ViewKey } | null = null;
    if (layoutList[0].home) cam.setOrientation(presets[layoutList[0].home]);

    const render = (): void => {
      R.beginFrame(cam);
      // 布景先画：不透明、写深度，装置的遮挡关系交给 z-buffer
      for (const m of setMeshes)
        R.drawDynamicMesh(
          m.data,
          m.kind === 'figure' ? FIG_DARK : ROOM_DARK,
          m.kind === 'figure' ? FIG_LITE : ROOM_LITE,
        );
      if (ceiling === 'span') R.drawMesh(`ceil-span-${layoutIdx}`, IDENT, RAIL_DARK, RAIL_LITE);
      // 环列 = 一块圆环板；环阵列 = 同一块板摆到每一格（板与编制无关）
      else if (ceiling === 'ring')
        R.drawDynamicMesh(ceilRing(), RAIL_DARK, RAIL_LITE, undefined, cellPlaces());
      // 绘图平滑按引擎算一次，它的全部实例共用（圆筒 4 条引擎摆 20 处）
      for (const s of sims) {
        if (!s.emaX || !s.emaY) {
          s.emaX = Float64Array.from(s.sim.px);
          s.emaY = Float64Array.from(s.sim.py);
        }
        const p = renderSmooth(s.emaX, s.emaY, s.smoothW, s.smoothP);
        s.sx = p.x;
        s.sy = p.y;
      }
      for (const inst of insts) {
        const v = sims[inst.simIdx];
        const { sim } = v;
        const px = v.sx as Float64Array;
        const py = v.sy as Float64Array;
        const rp = placeOf(inst);
        // 环阵列：本地系里把带子摆在半径处（方位角与格子平移交给 GPU 的模型变换）；
        // 单环与直排仍是老式子——rp 非空时半径已在 rp 里，offX 恒 0
        const localX = cells ? radiusRef.current : inst.offX;
        const places = placesOf(inst);
        const placesW = placesWorldOf(inst);
        fillSolidVerts(px, py, sim.n, localX, depth, thick, SOLID.SCALE, inst.verts, inst.offZ, v.offY, rp);
        R.drawDynamicMesh(bakeIndexed(inst.verts, v.topo.idxA), DARK_A, LITE_A, undefined, places);
        R.drawDynamicMesh(bakeIndexed(inst.verts, v.topo.idxB), DARK_B, LITE_B, undefined, places);
        // 芯轨（逐帧小盒）。core = 跟着芯收缩（下端钉住、上端随收缩下降）；
        // fixed = 天花到钉住点的固定立杆，收缩时是外皮沿着它往下聚（见 railSpan）
        const rs = railSpan(
          rail,
          { coreTop: sim.coreTop, coreLen: sim.coreLen, footY: sim.py[sim.n - 1] },
          v.offY,
          CEIL_RING.y,
        );
        const rad0 = (rp ? rp.radius : 0) + localX;
        // 芯轨按**世界尺寸**直接建（截面随装置缩，竖向不缩）：装置缩小后立杆仍从天花
        // 落到钉住点，装置挂在它的下半截 —— 空出来的那段就是「挂得更低」本身。
        // rig 缺省时 (scale 1, y 0) 这两行退化成原式子，Lab.07–09 逐位不变
        const railTop = rail === 'fixed' ? rs.top : rs.top * rigS + rigY;
        const railBot = rs.bottom * rigS + rigY;
        const railBox = boxVerts(
          (rad0 - 3.4) * rigS,
          (railTop + railBot) / 2,
          inst.offZ * rigS,
          2.4 * rigS,
          (railBot - railTop) / 2,
          Math.min(6, depth / 4) * rigS,
        );
        rotateVertsY(railBox.verts, rp); // 环上：轴对齐盒先按 (径向,切向) 建，再绕 Y 转到位
        R.drawDynamicMesh(bakeIndexed(railBox.verts, railBox.idx), RAIL_DARK, RAIL_LITE, undefined, placesW);
        // 天花板条 = 房间的天花板，**固定不动**（用户 2026-08-22 纠偏）：收缩注册在
        // 底端后带子的顶端离开它往下沉，那条缝就是「往下收」本身
        if (ceiling === 'per-unit') R.drawMesh(inst.ceilKey, IDENT, RAIL_DARK, RAIL_LITE);
        if (bondsRef.current && sim.locked.length) {
          const hz = depth / 2;
          const segs: { a: Vec3; b: Vec3 }[] = [];
          for (const [i, j] of sim.locked) {
            for (const t of [inst.offZ + hz, inst.offZ - hz]) {
              segs.push({
                a: placePoint(rad0 + px[i] * SOLID.SCALE, v.offY - py[i] * SOLID.SCALE, t, rp),
                b: placePoint(rad0 + px[j] * SOLID.SCALE, v.offY - py[j] * SOLID.SCALE, t, rp),
              });
            }
          }
          R.drawLines(segs, C_BOND, 0.004, places);
        }
      }
    };

    let acc = 0;
    let holdT = 0;
    let lastHud = '';
    const replay = (): void => {
      sims.forEach((v, u) => {
        v.sim = createSkinUnit(defs[u].spec, defs[u].opts);
        v.emaX = null;
        v.emaY = null;
      });
      acc = 0;
      holdT = 0;
    };

    const step = (dt: number): void => {
      if (viewAnim) {
        viewAnim.t = Math.min(1, viewAnim.t + dt / VIEW_ANIM_S);
        const e = viewAnim.t < 0.5 ? 2 * viewAnim.t ** 2 : 1 - (-2 * viewAnim.t + 2) ** 2 / 2;
        cam.setOrientation(q2m(slerpQ(viewAnim.q0, viewAnim.q1, e)));
        // 取景与姿态一起走：逐视角取景下两档 scale 差得多，硬切会「先跳一下再转」。
        // 两端**逐帧现算**——过渡途中拉半径滑块时，算死的值会把新取景覆盖回去
        // （慢设备上过渡要跑几秒，这个窗口很容易撞上）
        if (camScaleRef.current && viewAnim.from !== viewAnim.to) {
          const s0 = scaleOf(viewAnim.from);
          const s1 = scaleOf(viewAnim.to);
          cam.retarget(layoutList[layoutIdx].pivot, s0 + (s1 - s0) * e);
        }
        if (viewAnim.t >= 1) viewAnim = null;
      } else {
        cam.tick(dt);
      }
      const lead = sims[0].sim;
      let n = 0;
      if (runningRef.current && !lead.done) {
        acc += dt * rateRef.current * speedRef.current;
        n = Math.floor(acc);
        if (n > MAX_STEPS_PER_FRAME) {
          n = MAX_STEPS_PER_FRAME;
          acc = 0; // 追不上就放慢（定步：轨迹不变），不留追赶债
        } else {
          acc -= n;
        }
        for (let k = 0; k < n; k++) for (const v of sims) v.sim.advance();
      } else if (runningRef.current && lead.done) {
        holdT += dt;
        if (holdT >= REPLAY_HOLD_S) replay();
      }
      // 帧间 EMA（Lab.06 同款纪律：物理不动，只平滑画面时间轴）
      if (n > 0) {
        const a = 1 - Math.pow(0.45, n / 20);
        for (const v of sims) {
          if (!v.emaX || !v.emaY) continue;
          for (let i = 0; i < v.sim.n; i++) {
            v.emaX[i] += a * (v.sim.px[i] - v.emaX[i]);
            v.emaY[i] += a * (v.sim.py[i] - v.emaY[i]);
          }
        }
      }
      render();
      // 报的是**场上**的锁定键数（实例数 × 各自引擎），不是引擎数；
      // 环阵列下一条带摆在若干格里，每一份都要数进去
      const planCells = (pi: number): number =>
        cells ? cellList.reduce((a, c) => a + (c.plan === pi ? 1 : 0), 0) : 1;
      const locked = insts.reduce(
        (acc, i) => acc + sims[i.simIdx].sim.locked.length * planCells(i.plan),
        0,
      );
      const phase = lead.done ? '锁定 · 即将重播' : lead.step < 900 ? '收缩中' : '张紧 · 排泡';
      const key = `${lead.step}|${locked}|${phase}`;
      if (key !== lastHud) {
        lastHud = key;
        setHud((h) => ({ ...h, r: sims[sims.length - 1].sim.r, step: lead.step, locked, phase }));
      }
    };

    apiRef.current = {
      step,
      replay: () => {
        replay();
        render();
      },
      setPersp: (on) => R.setPerspective(on ? 900 : 0),
      setRadius: (rad) => {
        radiusRef.current = rad;
        reflow(); // 阵列：格距 = 2·外缘 + 缝，随半径重算；相机跟着退
        render();
      },
      // 换键谱 = 整场重建引擎（Lab.09 换形态）。不重挂组件：重挂会丢一个 WebGL
      // 上下文再要一个，一页九台的场合是实打实的风险
      setUnits: (nextUnits, nextOrder, nextPlans) => {
        defs = nextUnits;
        plan = nextOrder ?? nextUnits.map((_, u) => u);
        planList = nextPlans ?? [plan];
        seed();
        reflow();
        bakeCeil();
        applyLayout(layoutIdx);
        acc = 0;
        holdT = 0;
        lastHud = '';
        render();
      },
      viewTo: (k) => {
        const target = presets[k];
        const from = viewKey;
        viewKey = k;
        if (reduced) {
          viewAnim = null;
          cam.setOrientation(target);
          if (camScaleRef.current) cam.retarget(layoutList[layoutIdx].pivot, scaleOf());
          render();
          return;
        }
        viewAnim = { q0: m2q(cam.matrix), q1: m2q(target), t: 0, from, to: k };
      },
      viewHome: () => {
        viewAnim = null;
        cam.reset();
        // reset 回的是挂载时的姿态（= 轴测）与那档 scale；半径与视角都可能变过，得再对一次
        viewKey = layoutList[layoutIdx].home ?? 'axon';
        if (camScaleRef.current) cam.retarget(layoutList[layoutIdx].pivot, scaleOf());
        render();
      },
      setLayout: (li) => {
        const home = layoutList[li].home;
        if (home) viewKey = home;
        applyLayout(li);
        if (home) {
          viewAnim = null;
          cam.setOrientation(presets[home]);
        }
        render();
      },
    };

    const onCtx = (ev: Event): void => ev.preventDefault();
    const onDown = (ev: PointerEvent): void => {
      viewAnim = null;
      cam.pointerDown(ev.pointerId, ev.clientX, ev.clientY, ev.button === 2);
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        /* 合成事件无活跃 pointerId */
      }
    };
    const onMove = (ev: PointerEvent): void => cam.pointerMove(ev.pointerId, ev.clientX, ev.clientY);
    const onUp = (ev: PointerEvent): void => cam.pointerUp(ev.pointerId);
    const onWheel = (ev: WheelEvent): void => {
      ev.preventDefault();
      cam.wheel(ev.deltaY);
    };
    canvas.addEventListener('contextmenu', onCtx);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    render();
    return () => {
      apiRef.current = null;
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  // units/order 换了就重建整场（首次由主 effect 建，这里跳过）
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true;
      return;
    }
    if (units) apiRef.current?.setUnits(units, order, ringPlans);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitsKey]);

  useBenchLoop(canvasRef, (dt) => apiRef.current?.step(dt), [], active);

  const goView = useCallback((k: ViewKey) => {
    setView(k);
    apiRef.current?.viewTo(k);
  }, []);

  const goLayout = useCallback((li: number) => {
    setLayout(li);
    apiRef.current?.setLayout(li);
    const home = layouts?.[li]?.home;
    if (home) setView(home);
  }, [layouts]);

  return (
    <div className={`lab-wrap${onLight ? ' on-light' : ''}`}>
      <div className="lab-fig">
        <canvas
          ref={canvasRef}
          width={1400}
          height={1040}
          aria-label={hudCopy.aria}
        />
        <div className="lab-hud tl">
          <div style={{ color: 'var(--accent-2)' }}>{hudCopy.kicker}</div>
          <div>{hudCopy.title}</div>
          <div className="dim">{hudCopy.sub}</div>
        </div>
        <div className="lab-hud br">
          <div className="num">r {hud.r.toFixed(2)}</div>
          <div className="dim">
            step {hud.step}/{SKIN.STEPS} · 键 {hud.locked} · {hud.phase}
          </div>
        </div>
        <div className="lab-hud bl dim">
          {hud.note || hudCopy.hint}
        </div>
      </div>
      {controls ? (
        <div className="lab-ctl">
          {extraControls}
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
              运转
            </label>
            <label>
              <input
                type="checkbox"
                checked={bonds}
                onChange={(e) => {
                  bondsRef.current = e.target.checked;
                  setBonds(e.target.checked);
                }}
              />
              键线
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
              透视
            </label>
          </div>
          <div className="grp">
            <button type="button" onClick={() => {
              apiRef.current?.replay();
              runningRef.current = true;
              setRunning(true);
            }}>
              重播
            </button>
          </div>
          <div className="grp">
            <span className="k">速度</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={speed}
              aria-label="播放速度（协议步/秒的倍率，不是物理量）"
              style={{ width: 96 }}
              onChange={(e) => {
                const v = Number(e.target.value);
                speedRef.current = v;
                setSpeed(v);
              }}
            />
          </div>
          {radius ? (
            <div className="grp">
              <span className="k">半径</span>
              <input
                type="range"
                min={radius.min}
                max={radius.max}
                step={1}
                value={radiusV}
                aria-label="圆筒半径（世界单位；越大缝越宽）"
                style={{ width: 96 }}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setRadiusV(v);
                  apiRef.current?.setRadius(v);
                }}
              />
              <b style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{radiusV}</b>
            </div>
          ) : null}
          {layouts && layouts.length > 1 ? (
            <div className="grp">
              <span className="k">排列</span>
              <span className="seg">
                {layouts.map((L, li) => (
                  <button
                    key={L.key}
                    type="button"
                    className={li === layout ? 'active' : undefined}
                    onClick={() => goLayout(li)}
                  >
                    {L.label}
                  </button>
                ))}
              </span>
            </div>
          ) : null}
          <div className="grp">
            <span className="k">视角</span>
            <span className="seg">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className={v.key === view ? 'active' : undefined}
                  onClick={() => goView(v.key)}
                >
                  {v.label}
                </button>
              ))}
            </span>
            <button type="button" onClick={() => apiRef.current?.viewHome()}>
              归位
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
