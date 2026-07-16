import { OrbitCamera } from '../lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed, type CellFrame } from '../lib/linkage/gl3d';
import type { Vec3 } from '../lib/linkage/solver3d';
import {
  SHELL_OMEGA,
  SHELL_STEP_DT,
  SHELL_THETA0,
  createShell,
  ringPoint,
  shellMaxError,
  stepRing,
  type ShellRing,
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
// 初始机位 = 平视正视图（用户拍板 2026-07-17「开始的视角要平」）：
// 俯仰 π/2 把 Z 立成屏幕上方、视线水平，yaw 0 = 体轴横向排开的侧立面（丘轮廓）。
// 空闲自转关闭——开场即定格，动视角全靠拖拽；「视角归位」回到此机位。
const cam = new OrbitCamera({
  cx: 350,
  cy: 280,
  pivot: { x: 0, y: 0, z: 85 },
  scale: 1.35,
  pitch0: Math.PI / 2,
  yaw0: 0,
  zoomMin: 0.5,
  zoomMax: 3,
  autoYaw: 0,
});

const renderer = new FlatRenderer(canvas);

// —— 板件棱柱烘焙（每板一次）：局部系 = 装配姿态下 (û=AB, ê=⊥, f=环法向)。
// 剪式交叉板同面叠置会 z-fighting——按板朝向符号错层 ±2.5mm（真机双层板语义）。
const PLATE_T = 3;
const LAYER_OFF = 2.5;
const PRISM_IDX = new Uint16Array([
  0, 1, 2, 3, 5, 4,
  0, 1, 4, 0, 4, 3,
  1, 2, 5, 1, 5, 4,
  2, 0, 3, 2, 3, 5,
]);

interface PlateRef {
  id: string;
  a: number;
  b: number;
}
const plates: PlateRef[][] = rings.map((r, ri) => {
  const d = r.data;
  return d.tris.map((js, ti) => {
    const [ja, jb, jc] = js;
    const A = d.def.nodes[ja];
    const B = d.def.nodes[jb];
    const C = d.def.nodes[jc];
    const ux = B.x - A.x;
    const uy = B.y - A.y;
    const len = Math.hypot(ux, uy);
    const u = { x: ux / len, y: uy / len };
    const e = { x: -u.y, y: u.x };
    const c2 = {
      x: (C.x - A.x) * u.x + (C.y - A.y) * u.y,
      y: (C.x - A.x) * e.x + (C.y - A.y) * e.y,
    };
    const off = d.signs[ti] * LAYER_OFF;
    const z0 = off - PLATE_T / 2;
    const z1 = off + PLATE_T / 2;
    const verts = new Float32Array([
      0, 0, z1, len, 0, z1, c2.x, c2.y, z1,
      0, 0, z0, len, 0, z0, c2.x, c2.y, z0,
    ]);
    const id = `p${ri}-${ti}`;
    renderer.addMesh(id, bakeIndexed(verts, PRISM_IDX));
    return { id, a: ja, b: jb };
  });
});

/** 板刚架：o = A 世界位，û = AB 方向，f = 环法向（体轴 X̂，roll 不变量），ê = f×û。 */
function plateFrame(r: ShellRing, p: PlateRef): CellFrame {
  const d = r.data;
  const A = r.solver.nodes[p.a];
  const B = r.solver.nodes[p.b];
  const aw = ringPoint(d, A.x, A.y);
  const bw = ringPoint(d, B.x, B.y);
  const dx = bw.y - aw.y;
  const dz = bw.z - aw.z;
  const l = Math.hypot(dx, dz) || 1;
  const uy = dx / l;
  const uz = dz / l;
  // û=(0,uy,uz)，f=(1,0,0)，ê=f×û=(0,−uz,uy)
  return { o: aw, ux: 0, uy, uz, ex: 0, ey: -uz, ez: uy, fx: 1, fy: 0, fz: 0 };
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
  rings.forEach((r, ri) => {
    for (const p of plates[ri]) renderer.drawMesh(p.id, plateFrame(r, p));
  });
  renderer.drawLines(drivelineSegs(), [0.12, 0.12, 0.11]);
  renderer.drawLines(decorSegs, [0.8, 0.8, 0.76], 0.002);
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
viewHome.addEventListener('click', () => cam.reset());

// —— 视角接线（tentacle3d 同款）：拖拽旋转、右键平移、滚轮/双指缩放
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('pointerdown', (ev) => {
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
  cam.tick(dtReal);
  render();
  requestAnimationFrame(frameLoop);
}
render();
requestAnimationFrame(frameLoop);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__shell = { rings, cam, get theta() { return theta; } };
}
