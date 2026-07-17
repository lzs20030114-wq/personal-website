import { OrbitCamera } from '../lib/linkage/camera3d';
import { FlatRenderer } from '../lib/linkage/gl3d';
import type { Vec3 } from '../lib/linkage/solver3d';
import {
  SHELL_OMEGA,
  SHELL_STEP_DT,
  SHELL_THETA0,
  createShell,
  ringPoint,
  shellMaxError,
  stepRing,
} from '../lib/linkage/shell3d';

// 轮回机器伏丘壳体 五环立体台架（2026-07-17 用户立项：85mm 等距 / 同相呼吸 /
// roll 按盘点 §7）。与 tentacle3d 同构：装备（camera3d/gl3d）零修改，本文件只做
// 板件棱柱烘焙、每帧刚架计算、DOM 接线。仿真 = 五个 2D 环实例定步推进（shell3d.ts）。

const canvas = document.getElementById('fig') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const spinBox = document.getElementById('spin') as HTMLInputElement;
const phaseSlider = document.getElementById('phase') as HTMLInputElement;
const viewHome = document.getElementById('view-home') as HTMLButtonElement;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reducedMotion) spinBox.checked = false;

const rings = createShell();

// —— 相机：枢轴取壳体中腰；初始 3/4 机位，Z 上
// 初始机位 = 轴测图（用户拍板 2026-07-17，截图圈定）：绕世界竖轴转 −40° +
// 俯角 ~29°——S1 近左下、S5 远右上、俯视可见环面。相机欧拉序是 Rz·Rx·Ry，
// 与「转台+俯角」不同构，故数值分解成等价 (roll0, pitch0, yaw0)：
// M = Rx(−0.5)·Rx(π/2)·Rz(−0.7) = Rz(−1.053336)·Rx(0.735843)·Ry(0.867459)。
// 空闲自转关闭——开场定格，动视角全靠拖拽；「视角归位」回到此机位。
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
});

const renderer = new FlatRenderer(canvas);

// —— 板件 = 三角形线条 + 关节 = 圆形点（用户拍板 2026-07-17，对齐 2D 台架纸墨风）。
// 关节销 = 生成器里 0..pin-1 的原始销关节（支撑节点/远锚点不画，同 2D 台架约定）。
const JOINT_R = 2.4;
const HUB_R = 4;

function plateSegs(): { a: Vec3; b: Vec3 }[] {
  const segs: { a: Vec3; b: Vec3 }[] = [];
  for (const r of rings) {
    const d = r.data;
    for (const [ja, jb, jc] of d.tris) {
      const a = r.solver.nodes[ja];
      const b = r.solver.nodes[jb];
      const c = r.solver.nodes[jc];
      const aw = ringPoint(d, a.x, a.y);
      const bw = ringPoint(d, b.x, b.y);
      const cw = ringPoint(d, c.x, c.y);
      segs.push({ a: aw, b: bw }, { a: bw, b: cw }, { a: cw, b: aw });
    }
  }
  return segs;
}

function jointDots(): Vec3[] {
  const pts: Vec3[] = [];
  for (const r of rings) {
    const d = r.data;
    for (let j = 0; j <= d.pin; j++) {
      const n = r.solver.nodes[j];
      pts.push(ringPoint(d, n.x, n.y));
    }
  }
  return pts;
}

// —— 静态装饰线（每帧重发但内容不变的部分预先算好）：轮圈、脚槽
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

function drivelineSegs(): { a: Vec3; b: Vec3 }[] {
  const segs: { a: Vec3; b: Vec3 }[] = [];
  for (const r of rings) {
    const d = r.data;
    const pin = r.solver.nodes[d.pin];
    const apex = r.solver.nodes[d.apex];
    segs.push({ a: ringPoint(d, 0, 0), b: ringPoint(d, pin.x, pin.y) });
    segs.push({ a: ringPoint(d, pin.x, pin.y), b: ringPoint(d, apex.x, apex.y) });
  }
  return segs;
}

// —— 固定视角预设（用户拍板 2026-07-17：CAD 式方位切换，按钮组在控制条第二排）。
// 基准：正视 = rotX(π/2)（屏 x=体轴X、上=Z、深=Y）；其余 = 正视右乘绕世界竖轴
// Rz（转台语义）；顶视 = 单位阵；轴测 = 开场机位。切换用四元数球面插值 0.35s
//（smoothstep 缓动，reduced-motion 直切），拖拽随时打断。
type M3 = number[];
const mul3 = (a: M3, b: M3): M3 => {
  const r = new Array(9) as M3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
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
const PRESET_VIEWS: Record<string, M3> = {
  axon: mul3(rotZ3(-1.053336), mul3(rotX3(0.735843), rotY3(0.867459))),
  front: VIEW_FRONT,
  back: mul3(VIEW_FRONT, rotZ3(Math.PI)),
  left: mul3(VIEW_FRONT, rotZ3(-Math.PI / 2)),
  right: mul3(VIEW_FRONT, rotZ3(Math.PI / 2)),
  top: [1, 0, 0, 0, 1, 0, 0, 0, 1],
};

type Quat = [number, number, number, number]; // w,x,y,z
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

let viewAnim: { q0: Quat; q1: Quat; t: number } | null = null;
function viewTo(name: string): void {
  const target = PRESET_VIEWS[name];
  if (!target) return;
  if (reducedMotion) {
    viewAnim = null;
    cam.setOrientation(target);
    return;
  }
  viewAnim = { q0: m2q(cam.matrix), q1: m2q(target), t: 0 };
}

// —— 定步仿真：spin = 匀速呼吸；滑块 = 限速追踪目标相位。五环共用同一 θ（同相拍板）。
let theta = SHELL_THETA0;
let targetTheta = theta;
const CHASE_OMEGA = 2.5;

function wrapAngle(a: number): number {
  return ((a + Math.PI) % (2 * Math.PI)) - Math.PI;
}

function substep(): void {
  let dTheta: number;
  if (spinBox.checked) {
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
}

function phiDeg(): number {
  return (((theta - SHELL_THETA0) * 180) / Math.PI + 360000) % 360;
}

function render(): void {
  renderer.beginFrame(cam);
  renderer.drawLines(plateSegs(), [0.12, 0.12, 0.11]);
  renderer.drawLines(drivelineSegs(), [0.12, 0.12, 0.11]);
  renderer.drawLines(decorSegs, [0.8, 0.8, 0.76], 0.002);
  renderer.drawDots(jointDots(), JOINT_R, [0.12, 0.12, 0.11]);
  renderer.drawDots(
    rings.map((r) => ringPoint(r.data, 0, 0)),
    HUB_R,
    [0.12, 0.12, 0.11],
  );
  const apexS2 = rings[1].solver.nodes[rings[1].data.apex].y;
  hud.textContent =
    `FIG. 13   S1–S5 shell (85mm pitch, in-phase)   φ = ${phiDeg().toFixed(1)}°` +
    `   apex(S2) = ${apexS2.toFixed(1)} mm   maxError = ${shellMaxError(rings).toFixed(2)} mm` +
    `   [${spinBox.checked ? 'spin' : 'slider'}]`;
  if (spinBox.checked) phaseSlider.value = phiDeg().toFixed(1);
}

phaseSlider.addEventListener('input', () => {
  spinBox.checked = false;
  targetTheta = SHELL_THETA0 + (Number(phaseSlider.value) * Math.PI) / 180;
});
viewHome.addEventListener('click', () => {
  viewAnim = null;
  cam.reset();
});
document.querySelectorAll<HTMLButtonElement>('#views button').forEach((btn) => {
  btn.addEventListener('click', () => viewTo(btn.dataset.view as string));
});

// —— 视角接线（tentacle3d 同款）：拖拽旋转、右键平移、滚轮/双指缩放
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('pointerdown', (ev) => {
  viewAnim = null; // 拖拽打断视角切换动画
  canvas.setPointerCapture(ev.pointerId);
  cam.pointerDown(ev.pointerId, ev.clientX, ev.clientY, ev.button === 2);
});
canvas.addEventListener('pointermove', (ev) => cam.pointerMove(ev.pointerId, ev.clientX, ev.clientY));
canvas.addEventListener('pointerup', (ev) => cam.pointerUp(ev.pointerId));
canvas.addEventListener('pointercancel', (ev) => cam.pointerUp(ev.pointerId));
canvas.addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault();
    cam.wheel(ev.deltaY);
  },
  { passive: false },
);

// —— rAF 主循环：定步累加器（长卡顿丢时间不追帧），渲染帧率只影响采样
let last = performance.now();
let acc = 0;
function frameLoop(now: number): void {
  const dtReal = Math.min((now - last) / 1000, 0.25);
  last = now;
  acc = Math.min(acc + dtReal, 0.25);
  while (acc >= SHELL_STEP_DT) {
    substep();
    acc -= SHELL_STEP_DT;
  }
  if (viewAnim) {
    viewAnim.t += dtReal / 0.35;
    const t = Math.min(1, viewAnim.t);
    const e = t * t * (3 - 2 * t);
    cam.setOrientation(q2m(slerpQ(viewAnim.q0, viewAnim.q1, e)));
    if (t >= 1) viewAnim = null;
  }
  cam.tick(dtReal);
  render();
  requestAnimationFrame(frameLoop);
}
render();
requestAnimationFrame(frameLoop);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__shell = {
    rings,
    cam,
    presets: PRESET_VIEWS,
    viewTo,
    get viewAnim() { return viewAnim; },
    get theta() { return theta; },
  };
}
