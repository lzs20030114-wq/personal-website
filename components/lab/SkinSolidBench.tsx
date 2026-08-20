'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed } from '../../src/lib/linkage/gl3d';
import type { Vec3 } from '../../src/lib/linkage/solver3d';
import { SKIN_UNITS, skinSiteOpts } from '../../src/lib/space/skin-data';
import { SOLID, boxVerts, buildSolidTopology, fillSolidVerts } from '../../src/lib/space/skin-solid';
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
 */
const RATE = 110; // 协议步/秒（与 Lab.06 同）
const MAX_STEPS_PER_FRAME = 3;
const REPLAY_HOLD_S = 3.2;
const VIEW_ANIM_S = 0.35;
/** 四单元沿 X 排布的间距与画面枢轴（世界单位 = 2D px 尺度） */
const UNIT_GAP_X = 175;
const PIVOT = { x: 290, y: 168, z: 0 };
const CAM_SCALE = 0.98;
// 条纹双色（2D 目录的 GREEN/PALE 立体化）：A=族系绿、B=灰纱
const DARK_A: [number, number, number] = [0.075, 0.16, 0.12];
const LITE_A: [number, number, number] = [0.42, 0.76, 0.58];
const DARK_B: [number, number, number] = [0.11, 0.12, 0.12];
const LITE_B: [number, number, number] = [0.62, 0.66, 0.63];
const RAIL_DARK: [number, number, number] = [0.08, 0.09, 0.1];
const RAIL_LITE: [number, number, number] = [0.4, 0.43, 0.46];
const C_BOND: [number, number, number] = [0.88, 0.42, 0.24];

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
type ViewKey = (typeof VIEWS)[number]['key'];
/** 本台世界系：X 右、Y 向下（与屏幕同向）、Z 出屏 ⇒ 正视 = 恒等 */
const AXON_PITCH = -0.34;
const AXON_YAW = -0.62;
const PRESET_VIEWS: Record<ViewKey, M3> = {
  axon: mul3(rotX3(AXON_PITCH), rotY3(AXON_YAW)),
  front: rotZ3(0),
  side: rotY3(-Math.PI / 2 + 0.12),
  // 顶视是高角度斜俯视，不是纯俯视——单元吊在天花下，垂直往下看只剩天花板条
  // （首版即此错，CDP 截图整幅灰板）
  top: mul3(rotX3(-Math.PI / 2 + 0.52), rotY3(-0.35)),
};

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

interface SolidUnit {
  sim: SkinUnit;
  offX: number;
  offZ: number;
  /** 居中对齐的渲染纵移（center 排布逐帧算，其余排布恒 0） */
  offY: number;
  /** 自由段（非贴合）节点下标——居中对齐量折叠体的范围只看它们 */
  free: number[];
  ceilKey: string;
  smoothW: number;
  smoothP: number;
  emaX: Float64Array | null;
  emaY: Float64Array | null;
  topo: ReturnType<typeof buildSolidTopology>;
  verts: Float32Array;
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
  /** 居中对齐（2026-08-20 用户拍板）：逐单元渲染纵移，把折叠体（自由段）的
   *  中线对齐到全员均值——纯展示偏移，引擎与形态不动。lead 时间表定的是过渡
   *  平滑度，不负责对位；端点 lead 又是原谱锁死的，故对位只能在渲染层做 */
  center?: boolean;
  /** false = 本排布隐藏天花板条与芯轨（居中后带子各自纵移，板/轨对不上挂点，
   *  切片陈列读法里它们是噪声）。默认 true */
  frame?: boolean;
}

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
  depth = SOLID.DEPTH,
  pivot = PIVOT,
  camScale = CAM_SCALE,
  ceiling = 'per-unit',
  rate = RATE,
  hud: hudCopy = DEFAULT_HUD,
  layouts,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
  /** 场景单元（默认 = Lab.06 那四台 × skinSiteOpts）；Lab.08 阵列传自己的序列 */
  units?: readonly SolidUnitDef[];
  gapX?: number;
  /** 带深（「单元很窄」= 传小值） */
  depth?: number;
  pivot?: { x: number; y: number; z: number };
  camScale?: number;
  /** 天花：per-unit = 每单元一条板（Lab.07）；span = 一整条通长板（密排阵列用——
   *  per-unit 板在小间距下会大面积共面重叠 → z-fight） */
  ceiling?: 'per-unit' | 'span';
  rate?: number;
  hud?: SolidHud;
  /** 多排布（≥2 出「排列」切换，首项为默认）；省略 = 单排布（gapX/pivot/camScale） */
  layouts?: readonly SolidLayout[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<{
    step: (dt: number) => void;
    replay: () => void;
    setPersp: (on: boolean) => void;
    viewTo: (k: ViewKey) => void;
    viewHome: () => void;
    setLayout: (li: number) => void;
  } | null>(null);
  const runningRef = useRef(true);
  const speedRef = useRef(1);
  const bondsRef = useRef(true);
  const [running, setRunning] = useState(true);
  const [bonds, setBonds] = useState(true);
  const [persp, setPersp] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<ViewKey>('axon');
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
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      runningRef.current = false;
      setRunning(false);
    }

    // 单排布 = 一条「默认排布」——多排布与否走同一条路径
    const layoutList: readonly SolidLayout[] =
      layouts && layouts.length
        ? layouts
        : [{ key: 'default', label: '', gapX, gapZ: 0, pivot, camScale }];
    let layoutIdx = 0;

    const cam = new OrbitCamera({
      cx: 350,
      cy: 260,
      pivot: layoutList[0].pivot,
      scale: layoutList[0].camScale,
      pitch0: AXON_PITCH,
      yaw0: AXON_YAW,
      zoomMin: 0.5,
      zoomMax: 3,
      autoYaw: 0,
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

    const defs: readonly SolidUnitDef[] =
      units ?? SKIN_UNITS.map((d) => ({ spec: d.spec, opts: skinSiteOpts(d), smooth: d.smooth ?? [3, 1] }));
    const scene: SolidUnit[] = defs.map((def, u) => {
      const sim = createSkinUnit(def.spec, def.opts);
      const [smoothW, smoothP] = def.smooth;
      const gluedSet = new Set(sim.glued);
      const free: number[] = [];
      for (let i = 0; i < sim.n; i++) if (!gluedSet.has(i)) free.push(i);
      return {
        sim,
        // Z 取 ((n−1)/2 − u)：单元 0 在 +Z（轴测机位的近端）——分列的「左」= 并拢的「近」
        offX: u * layoutList[0].gapX,
        offZ: ((defs.length - 1) / 2 - u) * layoutList[0].gapZ,
        offY: 0,
        free,
        ceilKey: `ceil-u${u}`,
        smoothW,
        smoothP,
        emaX: null,
        emaY: null,
        topo: buildSolidTopology(sim.n, SKIN.STRIPE),
        verts: new Float32Array(4 * sim.n * 3),
      };
    });

    /** 排布只改渲染偏移与机位——引擎不重建，收缩接着跑 */
    const applyLayout = (li: number): void => {
      layoutIdx = li;
      const L = layoutList[li];
      scene.forEach((v, u) => {
        v.offX = u * L.gapX;
        v.offZ = ((scene.length - 1) / 2 - u) * L.gapZ;
      });
      cam.retarget(L.pivot, L.camScale);
    };

    // 天花板条（静件，随构造一次烘焙上传）。span = 一整条通长板——
    // 密排阵列下 per-unit 板会大面积共面重叠（z-fight）；每排布各烘一条
    // （X/Z 范围随排布变），绘制时取当前排布那条
    if (ceiling === 'span') {
      layoutList.forEach((L, li) => {
        const n = scene.length;
        const x1 = (n - 1) * L.gapX + 75;
        const zHalf = ((n - 1) * L.gapZ) / 2 + depth / 2 + 16;
        const ceil = boxVerts((-45 + x1) / 2, -3, 0, (x1 + 45) / 2, 3, zHalf);
        R.addMesh(`ceil-span-${li}`, bakeIndexed(ceil.verts, ceil.idx));
      });
    } else {
      for (const v of scene) {
        const ceil = boxVerts(v.offX + 30, -3, 0, 88, 3, depth / 2 + 16);
        R.addMesh(v.ceilKey, bakeIndexed(ceil.verts, ceil.idx));
      }
    }
    const IDENT = {
      ux: 1, uy: 0, uz: 0,
      ex: 0, ey: 1, ez: 0,
      fx: 0, fy: 0, fz: 1,
      o: { x: 0, y: 0, z: 0 },
    };

    let viewAnim: { q0: Quat; q1: Quat; t: number } | null = null;

    const render = (): void => {
      R.beginFrame(cam);
      const L = layoutList[layoutIdx];
      const frame = L.frame !== false;
      if (ceiling === 'span' && frame)
        R.drawMesh(`ceil-span-${layoutIdx}`, IDENT, RAIL_DARK, RAIL_LITE);
      // 第一遍：全员平滑剖面（居中对齐要先算齐才有公共中线）
      const ps = scene.map((v) => {
        if (!v.emaX || !v.emaY) {
          v.emaX = Float64Array.from(v.sim.px);
          v.emaY = Float64Array.from(v.sim.py);
        }
        return renderSmooth(v.emaX, v.emaY, v.smoothW, v.smoothP);
      });
      // 居中对齐（纯渲染纵移）：各单元折叠体（自由段）中线 → 全员均值。
      // 输入用的就是要画的平滑剖面 ⇒ 对齐即所见；随收缩整体升降照常发生
      if (L.center) {
        const mids = scene.map((v, u) => {
          let lo = Infinity;
          let hi = -Infinity;
          for (const i of v.free) {
            const y = ps[u].y[i];
            if (y < lo) lo = y;
            if (y > hi) hi = y;
          }
          return (-(lo + hi) / 2) * SOLID.SCALE;
        });
        const mean = mids.reduce((a, b) => a + b, 0) / mids.length;
        scene.forEach((v, u) => {
          v.offY = mean - mids[u];
        });
      } else {
        for (const v of scene) v.offY = 0;
      }
      scene.forEach((v, u) => {
        const { sim } = v;
        const p = ps[u];
        fillSolidVerts(
          p.x, p.y, sim.n, v.offX, depth, SOLID.THICK, SOLID.SCALE, v.verts, v.offZ, v.offY,
        );
        R.drawDynamicMesh(bakeIndexed(v.verts, v.topo.idxA), DARK_A, LITE_A);
        R.drawDynamicMesh(bakeIndexed(v.verts, v.topo.idxB), DARK_B, LITE_B);
        if (frame) {
          // 芯轨（长度随收缩变，逐帧小盒）
          const railLen = sim.coreLen * SOLID.SCALE;
          const rail = boxVerts(
            v.offX - 3.4, railLen / 2 + v.offY, v.offZ, 2.4, railLen / 2, Math.min(6, depth / 4),
          );
          R.drawDynamicMesh(bakeIndexed(rail.verts, rail.idx), RAIL_DARK, RAIL_LITE);
        }
        if (ceiling !== 'span' && frame) R.drawMesh(v.ceilKey, IDENT, RAIL_DARK, RAIL_LITE);
        if (bondsRef.current && sim.locked.length) {
          const hz = depth / 2;
          const segs: { a: Vec3; b: Vec3 }[] = [];
          for (const [i, j] of sim.locked) {
            for (const z of [v.offZ + hz, v.offZ - hz]) {
              segs.push({
                a: { x: v.offX + p.x[i] * SOLID.SCALE, y: v.offY - p.y[i] * SOLID.SCALE, z },
                b: { x: v.offX + p.x[j] * SOLID.SCALE, y: v.offY - p.y[j] * SOLID.SCALE, z },
              });
            }
          }
          R.drawLines(segs, C_BOND, 0.004);
        }
      });
    };

    let acc = 0;
    let holdT = 0;
    let lastHud = '';
    const replay = (): void => {
      scene.forEach((v, u) => {
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
        if (viewAnim.t >= 1) viewAnim = null;
      } else {
        cam.tick(dt);
      }
      const lead = scene[0].sim;
      let n = 0;
      if (runningRef.current && !lead.done) {
        acc += dt * rate * speedRef.current;
        n = Math.floor(acc);
        if (n > MAX_STEPS_PER_FRAME) {
          n = MAX_STEPS_PER_FRAME;
          acc = 0; // 追不上就放慢（定步：轨迹不变），不留追赶债
        } else {
          acc -= n;
        }
        for (let k = 0; k < n; k++) for (const v of scene) v.sim.advance();
      } else if (runningRef.current && lead.done) {
        holdT += dt;
        if (holdT >= REPLAY_HOLD_S) replay();
      }
      // 帧间 EMA（Lab.06 同款纪律：物理不动，只平滑画面时间轴）
      if (n > 0) {
        const a = 1 - Math.pow(0.45, n / 20);
        for (const v of scene) {
          if (!v.emaX || !v.emaY) continue;
          for (let i = 0; i < v.sim.n; i++) {
            v.emaX[i] += a * (v.sim.px[i] - v.emaX[i]);
            v.emaY[i] += a * (v.sim.py[i] - v.emaY[i]);
          }
        }
      }
      render();
      const locked = scene.reduce((s, v) => s + v.sim.locked.length, 0);
      const phase = lead.done ? '锁定 · 即将重播' : lead.step < 900 ? '收缩中' : '张紧 · 排泡';
      const key = `${lead.step}|${locked}|${phase}`;
      if (key !== lastHud) {
        lastHud = key;
        setHud((h) => ({ ...h, r: scene[scene.length - 1].sim.r, step: lead.step, locked, phase }));
      }
    };

    apiRef.current = {
      step,
      replay: () => {
        replay();
        render();
      },
      setPersp: (on) => R.setPerspective(on ? 900 : 0),
      viewTo: (k) => {
        const target = PRESET_VIEWS[k];
        if (reduced) {
          viewAnim = null;
          cam.setOrientation(target);
          render();
          return;
        }
        viewAnim = { q0: m2q(cam.matrix), q1: m2q(target), t: 0 };
      },
      viewHome: () => {
        viewAnim = null;
        cam.reset();
        render();
      },
      setLayout: (li) => {
        applyLayout(li);
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

  useBenchLoop(canvasRef, (dt) => apiRef.current?.step(dt), [], active);

  const goView = useCallback((k: ViewKey) => {
    setView(k);
    apiRef.current?.viewTo(k);
  }, []);

  const goLayout = useCallback((li: number) => {
    setLayout(li);
    apiRef.current?.setLayout(li);
  }, []);

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
