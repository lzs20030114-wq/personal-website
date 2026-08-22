'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed, bakeRuledPoints } from '../../src/lib/linkage/gl3d';
import type { Vec3 } from '../../src/lib/linkage/solver3d';
import {
  SHELL_OMEGA,
  SHELL_STEP_DT,
  SHELL_THETA0,
  createShell,
  ringOuterProfile,
  ringPoint,
  shellMaxError,
  stepRing,
} from '../../src/lib/linkage/shell3d';
import { setSnapshot } from './snapshot';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.04 五环立体台架（Lab-Modernist 稿暗色版，逐项对稿）。
 * 几何/装备与 src/demo/shell3d.ts 同源：五个 2D 环实例定步推进（同相呼吸，1/120 定步——
 * 跨设备一致）+ 刚体位姿嵌入 3D + 织物蒙皮（相邻环外侧支点等弧长重采样成直纹带）+
 * 视角预设四元数 slerp。
 * 视觉按稿：族系配色 S1 绿 → S3 中性 → S5 紫（线色承载环身份）、
 * 关节点径随环递增、销点绿、轮毂点取环色。
 *
 * 蒙皮 2026-07-29 改**可调遮罩 + 点阵织纹**（用户两轮拍板：先是实心织物「死灰一片」，
 * 继而「别纯波点，加个滑块能调遮罩透明度」）。同一张直纹带出两层，共用一个 0–1 滑块：
 *   ① 遮罩面——三角面，α = 滑块值，色取该带两环色的中值（族系配色，不再是烟灰）；
 *   ② 点阵织纹——格心点云，点色沿带宽从 A 环色渐到 B 环色，α 随滑块但更快到顶
 *      （见 dotAlpha：滑块刚离 0 就有织纹，故低透明度下读作纱、不是空）。
 * 滑块三端：0 = 全透明（两层都不画）· 中段 = 半透明（能看穿到内部机构）·
 * 1 = 不透明（回到实体壳，点阵成为其表面织纹）。
 *
 * 半透明两条硬约束：**深度只测不写**（否则近乎透明的面照样挡住后面的东西），
 * 因此绘制序必须是「实体线稿先画 → 遮罩与点阵最后画」，且四条带要**按视深从远到近**
 * 自己排序（半透明面之间没有 z 排序）。α=1 时切回实体路径（写深度、先画），
 * 由 z-buffer 给出精确遮挡。
 * 装备为加法式扩展（drawPointCloud + bakeRuledPoints + drawDynamicMesh 的可选 alpha）。
 */
// 遮罩面：沿环外廓重采样列数（三角面用；比点阵稀，够平滑即可）
const SKIN_SAMPLES = 41;
// 点阵网格：沿环外廓 SKIN_U 列 × 跨带 SKIN_V 行（四条带共 ~2.5k 点/帧）
const SKIN_U = 58;
const SKIN_V = 11;
// 点径（世界 mm，随缩放同步变大 ⇒ 密度观感恒定）
const SKIN_DOT_R = 1.75;
/** 遮罩滑块默认位（0=全透明，1=不透明）——半透明纱是常态展示位 */
const SKIN_DEFAULT = 0.35;
/** 视作不透明的阈值：到此切实体路径（写深度、z-buffer 精确遮挡） */
const SKIN_OPAQUE_AT = 0.985;
/** 点阵不透明度 = min(上限, 滑块 × 增益)：滑块刚离 0 织纹就到位 */
const dotAlpha = (a: number): number => Math.min(0.72, a * 1.8);
const HUB_R = 4;
const CHASE_OMEGA = 2.5;
const VIEW_ANIM_S = 0.35;
// 族系配色（稿内字面值）：S1 绿 → S3 中性 → S5 紫
const COLS: [number, number, number][] = [
  [0.55, 0.78, 0.52],
  [0.7, 0.84, 0.64],
  [0.88, 0.9, 0.84],
  [0.8, 0.76, 0.92],
  [0.7, 0.62, 0.94],
];
const C_DIM: [number, number, number] = [0.44, 0.47, 0.5];
const C_GRN: [number, number, number] = [0.62, 0.82, 0.58];
/** 带 ri 的遮罩面明暗端色：取两环色中值再压到稿内烟灰的明度区间——
 *  亮度照旧（不透明时仍是一层沉下去的壳），但带上族系色相，不再是一片死灰。 */
const bandShade = (ri: number): { dark: [number, number, number]; lite: [number, number, number] } => {
  const m = COLS[ri].map((c, k) => (c + COLS[ri + 1][k]) / 2) as [number, number, number];
  return {
    dark: [m[0] * 0.13, m[1] * 0.13, m[2] * 0.13],
    lite: [m[0] * 0.62, m[1] * 0.62, m[2] * 0.62],
  };
};

const VIEWS = [
  { key: 'axon', label: '轴测' },
  { key: 'front', label: '正' },
  { key: 'left', label: '左' },
  { key: 'right', label: '右' },
  { key: 'top', label: '顶' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

type M3 = number[];
type Quat = [number, number, number, number]; // w,x,y,z
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

// 四元数 slerp（照搬 src/demo/shell3d.ts：矩阵直插会走非刚体路径）
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

const wrapAngle = (a: number): number => ((a + Math.PI) % (2 * Math.PI)) - Math.PI;

/** 直纹带的三角索引（A 侧 0..n-1、B 侧 n..2n-1，逐格两片） */
const SKIN_IDX = (() => {
  const idx: number[] = [];
  for (let k = 0; k < SKIN_SAMPLES - 1; k++) {
    const a = k;
    const b = SKIN_SAMPLES + k;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return new Uint16Array(idx);
})();

/** 折线按弧长等距重采样到 n 点（照搬 src/demo/shell3d.ts） */
function resample(pts: Vec3[], n: number): Vec3[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(
      cum[i - 1] +
        Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z),
    );
  }
  const total = cum[cum.length - 1] || 1;
  const out: Vec3[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * total;
    while (seg < pts.length - 2 && cum[seg + 1] < t) seg++;
    const span = cum[seg + 1] - cum[seg] || 1;
    const u = Math.min(1, Math.max(0, (t - cum[seg]) / span));
    out.push({
      x: pts[seg].x + (pts[seg + 1].x - pts[seg].x) * u,
      y: pts[seg].y + (pts[seg + 1].y - pts[seg].y) * u,
      z: pts[seg].z + (pts[seg + 1].z - pts[seg].z) * u,
    });
  }
  return out;
}

/**
 * 界面词表（用户拍板 2026-07-28：案例页主图的控制条要英文）。
 * `/lab` 仍按稿走中文（§7.7 对稿结论：题名/控件用中文），案例页主图传 lang="en"——
 * 那一页从标题到 role/tools 全英文，控件夹一列中文会读成两种语言的拼贴。
 */
const COPY = {
  zh: {
    display: '显示',
    breathe: '呼吸',
    persp: '透视',
    skin: '遮罩',
    skinAria: '遮罩透明度：0 全透明，1 不透明',
    phase: '相位',
    view: '视角',
    reset: '归位',
    views: { axon: '轴测', front: '正', left: '左', right: '右', top: '顶' },
    title: 'S1–S5 伏丘壳体',
    sub: '85 mm 等距 · 同相呼吸 · 槽端逐环标定 [0/2/4/8]',
    hint: '拖拽旋转 · 右键平移 · 滚轮缩放',
    drive: { spin: '自转', slider: '滑杆' },
    aria: '五环立体编排台架；拖拽旋转，呼吸/相位驱动',
  },
  en: {
    display: 'Display',
    breathe: 'Breathe',
    persp: 'Perspective',
    skin: 'Skin',
    skinAria: 'Skin opacity: 0 clear, 1 solid',
    phase: 'Phase',
    view: 'View',
    reset: 'Reset',
    views: { axon: 'Axon', front: 'Front', left: 'Left', right: 'Right', top: 'Top' },
    title: 'S1–S5 shell family',
    sub: '85 mm pitch · in-phase breathing · slot ladder [0/2/4/8]',
    hint: 'Drag to orbit · right-drag to pan · scroll to zoom',
    drive: { spin: 'spin', slider: 'slider' },
    aria: 'Five-ring shell bench; drag to orbit, breathing/phase driven',
  },
} as const;

export function RingsBench({
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
  /** false = 纯展示（主页舞台/项目预览用）：不出控制条 */
  controls?: boolean;
  /** true = 置于浅色页（主页舞台）：自带深底与深色 token */
  onLight?: boolean;
  /**
   * true = 控制条竖排在画面**右侧**（案例页主图用，用户拍板 2026-07-28）。
   * 控制条在下面会把整件变高，而案例页主图的高度是首屏预算里的硬约束——
   * 放右边则只变宽不变高。/lab 页不用（那里没有首屏约束，横排读着更顺）。
   */
  sideControls?: boolean;
  /**
   * true = 把转场落点 data-pt-target 打在**画面盒**（.lab-fig）而不是外层。
   * 侧栏控制条会把外层撑宽近 200px，落点若还框着外层，主页飞过来的那张画面快照
   * 会被拉到整件宽度、交接那一帧明显一跳。落点必须只框画面本身。
   */
  ptTarget?: boolean;
  /** 界面语言：'zh' = 稿的中文（/lab）；'en' = 英文（案例页主图，用户拍板 2026-07-28） */
  lang?: 'zh' | 'en';
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<{
    step: (dt: number) => void;
    setPhase: (deg: number) => void;
    setBreathe: (on: boolean) => void;
    setSkin: (alpha: number) => void;
    setPersp: (on: boolean) => void;
    viewTo: (k: ViewKey) => void;
    viewHome: () => void;
  } | null>(null);
  const [breathe, setBreathe] = useState(spin);
  const [skin, setSkin] = useState(SKIN_DEFAULT);
  const [persp, setPersp] = useState(false);
  const [view, setView] = useState<ViewKey>('axon');
  const [phase, setPhase] = useState(0);
  const [hud, setHud] = useState({ apex: 0, err: 0, note: '' });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rings = createShell();

    // 开场轴测机位（用户拍板 2026-07-17，截图圈定）；空闲自转关闭，动视角靠拖拽
    const cam = new OrbitCamera({
      cx: 350,
      cy: 280,
      pivot: { x: 0, y: 0, z: 85 },
      scale: 1.35,
      roll0: -1.053336,
      pitch0: 0.735843,
      yaw0: 0.867459,
      zoomMin: 0.5,
      zoomMax: 3,
      autoYaw: 0,
      // 转盘模式（用户 2026-08-20 拍板）：图纸系 Z 朝上。上面的轴测三元组
      // 本就是无侧倾机位（残余 roll ≈0.0016，数值量级），吸附后观感不变
      mode: 'turntable',
      upAxis: 'z',
    });

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

    // 静态装饰：曲柄轮圆（32 段）+ 每脚槽线
    const decorSegs: { a: Vec3; b: Vec3 }[] = [];
    for (const r of rings) {
      const d = r.data;
      const N = 32;
      for (let i = 0; i < N; i++) {
        const a0 = (i * 2 * Math.PI) / N;
        const a1 = ((i + 1) * 2 * Math.PI) / N;
        decorSegs.push({
          a: ringPoint(d, d.crankR * Math.cos(a0), d.crankR * Math.sin(a0)),
          b: ringPoint(d, d.crankR * Math.cos(a1), d.crankR * Math.sin(a1)),
        });
      }
      for (const s of r.slots) {
        decorSegs.push({ a: ringPoint(d, s.lo, 0), b: ringPoint(d, s.hi, 0) });
      }
    }

    // 蒙皮：各环外侧支点（装配位选定后固定跟销），随环呼吸
    const profiles = rings.map((r) => ringOuterProfile(r.data));
    const profileWorld = (ri: number): Vec3[] =>
      profiles[ri].map((j) => {
        const n = rings[ri].solver.nodes[j];
        return ringPoint(rings[ri].data, n.x, n.y);
      });
    const skinPoints = (ri: number): Float32Array =>
      bakeRuledPoints(
        resample(profileWorld(ri), SKIN_U),
        resample(profileWorld(ri + 1), SKIN_U),
        SKIN_V,
      );
    const skinMesh = (ri: number): Float32Array => {
      const A = resample(profileWorld(ri), SKIN_SAMPLES);
      const B = resample(profileWorld(ri + 1), SKIN_SAMPLES);
      const verts = new Float32Array(SKIN_SAMPLES * 2 * 3);
      let k = 0;
      for (const p of [...A, ...B]) {
        verts[k++] = p.x;
        verts[k++] = p.y;
        verts[k++] = p.z;
      }
      return bakeIndexed(verts, SKIN_IDX);
    };
    /** 带序按视深从远到近（半透明面之间没有 z 排序，得自己排）。
     *  深度取两环轮毂中点：q.z = 视矩阵第三行·(p−pivot)，越大越近。 */
    const bandsFarToNear = (): number[] => {
      const m = cam.matrix;
      const pv = cam.pivotPoint;
      const depth = (ri: number): number => {
        const a = ringPoint(rings[ri].data, 0, 0);
        const b = ringPoint(rings[ri + 1].data, 0, 0);
        const x = (a.x + b.x) / 2 - pv.x;
        const y = (a.y + b.y) / 2 - pv.y;
        const z = (a.z + b.z) / 2 - pv.z;
        return m[6] * x + m[7] * y + m[8] * z;
      };
      return [...Array(rings.length - 1).keys()].sort((p, q) => depth(p) - depth(q));
    };

    let theta = SHELL_THETA0;
    let targetTheta = theta;
    let breathing = spin && !reduced;
    let skinA = SKIN_DEFAULT;
    let viewAnim: { q0: Quat; q1: Quat; t: number } | null = null;
    const phiDeg = (): number => (((theta - SHELL_THETA0) * 180) / Math.PI + 360000) % 360;

    const substep = (): void => {
      let dTheta: number;
      if (breathing) {
        dTheta = SHELL_OMEGA * SHELL_STEP_DT;
        targetTheta = theta + dTheta;
      } else {
        const diff = wrapAngle(targetTheta - theta);
        const max = CHASE_OMEGA * SHELL_STEP_DT;
        dTheta = Math.max(-max, Math.min(max, diff));
        if (dTheta === 0) return;
      }
      theta += dTheta;
      for (const r of rings) stepRing(r, dTheta);
    };

    const render = (): void => {
      R.beginFrame(cam);
      // 不透明档：遮罩面走实体路径——先画、写深度，遮挡由 z-buffer 精确给出
      if (skinA >= SKIN_OPAQUE_AT) {
        for (let ri = 0; ri < rings.length - 1; ri++) {
          const s = bandShade(ri);
          R.drawDynamicMesh(skinMesh(ri), s.dark, s.lite);
        }
      }
      R.drawLines(decorSegs, C_DIM, 0.002);
      rings.forEach((r, ri) => {
        const d = r.data;
        const col = COLS[ri];
        const segs: { a: Vec3; b: Vec3 }[] = [];
        for (const [ja, jb, jc] of d.tris) {
          const a = r.solver.nodes[ja];
          const b = r.solver.nodes[jb];
          const c = r.solver.nodes[jc];
          const aw = ringPoint(d, a.x, a.y);
          const bw = ringPoint(d, b.x, b.y);
          const cw = ringPoint(d, c.x, c.y);
          segs.push({ a: aw, b: bw }, { a: bw, b: cw }, { a: cw, b: aw });
        }
        const pin = r.solver.nodes[d.pin];
        const apex = r.solver.nodes[d.apex];
        segs.push({ a: ringPoint(d, 0, 0), b: ringPoint(d, pin.x, pin.y) });
        segs.push({ a: ringPoint(d, pin.x, pin.y), b: ringPoint(d, apex.x, apex.y) });
        R.drawLines(segs, col);
        const jointPts: Vec3[] = [];
        for (let j = 0; j <= d.pin; j++) {
          const n = r.solver.nodes[j];
          jointPts.push(ringPoint(d, n.x, n.y));
        }
        R.drawDots(jointPts, 2.0 + ri * 0.22, col);
        R.drawDots([ringPoint(d, pin.x, pin.y)], 3.4, C_GRN, 0.007);
        R.drawDots([ringPoint(d, 0, 0)], HUB_R, col, 0.007);
      });
      // 半透明层最后画：要与已成像的线稿混合，且不写深度（近乎透明的面不该挡东西）。
      // 带序从远到近——半透明面之间没有 z 排序，只能靠下单顺序。
      const da = dotAlpha(skinA);
      if (skinA > 0.005) {
        for (const ri of bandsFarToNear()) {
          if (skinA < SKIN_OPAQUE_AT) {
            const s = bandShade(ri);
            R.drawDynamicMesh(skinMesh(ri), s.dark, s.lite, skinA);
          }
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
      render();
      const apexS2 = rings[1].solver.nodes[rings[1].data.apex].y;
      setHud({ apex: apexS2, err: shellMaxError(rings), note: '' });
      if (breathing) setPhase(Number(phiDeg().toFixed(1)));
    };

    apiRef.current = {
      step,
      setPhase: (deg) => {
        breathing = false;
        targetTheta = SHELL_THETA0 + (deg * Math.PI) / 180;
      },
      setBreathe: (on) => {
        breathing = on;
      },
      setSkin: (a) => {
        skinA = a;
      },
      setPersp: (on) => R.setPerspective(on ? 700 : 0),
      viewTo: (k) => {
        const target = PRESET_VIEWS[k];
        if (reduced) {
          viewAnim = null;
          cam.setOrientation(target);
          return;
        }
        viewAnim = { q0: m2q(cam.matrix), q1: m2q(target), t: 0 };
      },
      viewHome: () => {
        viewAnim = null;
        cam.reset();
      },
    };

    const onCtx = (ev: Event): void => ev.preventDefault();
    const onDown = (ev: PointerEvent): void => {
      viewAnim = null; // 拖拽打断视角切换动画
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

    // 转场克隆用的画面快照：重绘一帧后立刻读回（同任务内绘制缓冲仍在，见 snapshot.ts）
    setSnapshot(canvas, () => {
      render();
      return canvas.toDataURL('image/png');
    });

    render();
    return () => {
      apiRef.current = null;
      setSnapshot(canvas, null);
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
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
        <canvas
          ref={canvasRef}
          width={1400}
          height={1040}
          aria-label={L.aria}
        />
        <div className="lab-hud tl">
          <div style={{ color: 'var(--p300)' }}>Lab.04 / Fig. 13</div>
          <div>{L.title}</div>
          <div className="dim">{L.sub}</div>
        </div>
        <div className="lab-hud br">
          <div className="num">φ {phase.toFixed(1)}°</div>
          <div className="dim">
            {hud.note
              ? hud.note
              : `apex(S2) ${hud.apex.toFixed(1)} mm · err ${hud.err.toFixed(2)} · ${breathe ? L.drive.spin : L.drive.slider}`}
          </div>
        </div>
        {sideControls && controls ? null : <div className="lab-hud bl dim">{L.hint}</div>}
      </div>
      {controls ? (
        <div className="lab-ctl">
          <div className="grp">
            {sideControls ? <span className="k">{L.display}</span> : null}
            <label>
              <input
                type="checkbox"
                checked={breathe}
                onChange={(e) => {
                  setBreathe(e.target.checked);
                  apiRef.current?.setBreathe(e.target.checked);
                }}
              />
              {L.breathe}
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
          {/* 遮罩滑块（2026-07-29 用户拍板）：0 全透明 → 半透明 → 1 不透明。
              取代原来的「蒙皮」复选框——开关的两端就是这条滑轨的两端，
              两者并存会出现「蒙皮开着但透明度 0」这种自相矛盾的状态。 */}
          <div className="grp">
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
          <div className="grp">
            <span className="k">
              {L.phase}
              {sideControls ? <b className="v">{phase.toFixed(1)}°</b> : null}
            </span>
            <input
              type="range"
              min={0}
              max={360}
              step={0.5}
              value={phase}
              // 侧栏里滑杆占满一列（横排时是稿里的定值 132）
              style={sideControls ? { width: '100%' } : { width: 132 }}
              onChange={(e) => {
                const v = Number(e.target.value);
                setBreathe(false);
                setPhase(v);
                apiRef.current?.setPhase(v);
              }}
            />
          </div>
          <div className="grp">
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
              {sideControls ? (
                <button type="button" className="alt" onClick={() => apiRef.current?.viewHome()}>
                  {L.reset}
                </button>
              ) : null}
            </span>
            {sideControls ? null : (
              <button type="button" onClick={() => apiRef.current?.viewHome()}>
                {L.reset}
              </button>
            )}
          </div>
          {sideControls ? <p className="lab-ctl__hint">{L.hint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
