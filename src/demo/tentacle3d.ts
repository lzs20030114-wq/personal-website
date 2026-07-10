import {
  GUIDE3,
  SPINE3,
  TENTACLE3D,
  applyContraction3,
  createTentacle3,
} from '../lib/linkage/tentacle3d-data';

// 立体触手台架（立体求解器 spec v0.1 / 3D-M2）：vanilla TS，无 React。
// 拖拽 = 轨道相机（yaw/pitch），不动模型（用户设想拍板）；三滑块 = GH contraction1/2/3。
// 渲染 = SVG 正交投影 + 画家算法逐元素深度排序 + 深度明暗（WebGL 红线不碰）。

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('fig') as unknown as SVGSVGElement;
const sliders = [0, 1, 2].map((k) => document.getElementById(`tendon-${k}`) as HTMLInputElement);
const relaxBtn = document.getElementById('relax') as HTMLButtonElement;

const { solver, tendons } = createTentacle3();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const N = TENTACLE3D.segments;

// —— 轨道相机（正交投影）。pivot = 臂中段，屏幕中心对齐
const CX = 350;
const CY = 250;
const SCALE = 1.25;
const PIVOT = { x: 0, y: 150, z: 0 };
let yaw = 0.6;
let pitch = -0.28;
const AUTO_YAW = reducedMotion ? 0 : 0.15; // rad/s，拖拽时暂停

interface P2 {
  x: number;
  y: number;
  depth: number;
}
function project(p: { x: number; y: number; z: number }): P2 {
  const x = p.x - PIVOT.x;
  const y = p.y - PIVOT.y;
  const z = p.z - PIVOT.z;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const qx = x * cy + z * sy;
  const qz = -x * sy + z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const qy = y * cp - qz * sp;
  const depth = y * sp + qz * cp;
  return { x: CX + qx * SCALE, y: CY + qy * SCALE, depth };
}

// —— 建元素（一次）。排序时按深度重排 DOM 顺序（远 → 近）
function el<K extends keyof SVGElementTagNameMap>(tag: K, cls = ''): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  if (cls) e.setAttribute('class', cls);
  svg.appendChild(e);
  return e;
}

interface Layer {
  e: SVGElement;
  depth: number;
}
const layers: Layer[] = [];

// 悬挂座（世界原点 = 基座；随视角投影的十字标记）
const mountEl = el('path', 'ground');
// 脊柱段 ×14
const spineEls = Array.from({ length: N }, () => el('line', 'spine'));
// 椎盘三角 ×15
const discEls = Array.from({ length: N + 1 }, () => el('polygon', 'disc'));
// 肌腱段 3×14（按肌腱染色）
const tendonEls = [0, 1, 2].map((k) =>
  Array.from({ length: N }, () => el('line', `tendon tendon-${k}`)),
);
const hud = el('text', 'hud');
hud.setAttribute('x', '16');
hud.setAttribute('y', '504');

const setLine = (e: SVGElement, a: P2, b: P2): number => {
  e.setAttribute('x1', String(a.x));
  e.setAttribute('y1', String(a.y));
  e.setAttribute('x2', String(b.x));
  e.setAttribute('y2', String(b.y));
  return (a.depth + b.depth) / 2;
};

function render(): void {
  layers.length = 0;
  const spine = Array.from({ length: N + 1 }, (_, i) => project(solver.nodes[SPINE3(i)]));
  const guides = [0, 1, 2].map((k) =>
    Array.from({ length: N + 1 }, (_, i) => project(solver.nodes[GUIDE3(k, i)])),
  );
  // 基座十字
  const o = project({ x: 0, y: 0, z: 0 });
  const ax = project({ x: TENTACLE3D.discR + 10, y: 0, z: 0 });
  const az = project({ x: 0, y: 0, z: TENTACLE3D.discR + 10 });
  mountEl.setAttribute(
    'd',
    `M${2 * o.x - ax.x} ${2 * o.y - ax.y}L${ax.x} ${ax.y}M${2 * o.x - az.x} ${2 * o.y - az.y}L${az.x} ${az.y}`,
  );
  for (let i = 0; i < N; i++) {
    layers.push({ e: spineEls[i], depth: setLine(spineEls[i], spine[i], spine[i + 1]) });
    for (let k = 0; k < 3; k++) {
      layers.push({
        e: tendonEls[k][i],
        depth: setLine(tendonEls[k][i], guides[k][i], guides[k][i + 1]),
      });
    }
  }
  for (let i = 0; i <= N; i++) {
    const g = [guides[0][i], guides[1][i], guides[2][i]];
    discEls[i].setAttribute('points', g.map((p) => `${p.x},${p.y}`).join(' '));
    layers.push({ e: discEls[i], depth: (g[0].depth + g[1].depth + g[2].depth) / 3 });
  }
  // 画家算法：远 → 近重排 + 深度明暗
  layers.sort((a, b) => a.depth - b.depth);
  const dMin = layers[0].depth;
  const dMax = layers[layers.length - 1].depth || dMin + 1;
  for (const l of layers) {
    const t = (l.depth - dMin) / (dMax - dMin || 1);
    l.e.setAttribute('opacity', String(0.35 + 0.65 * t));
    svg.appendChild(l.e); // 重新 append = 移到最上层
  }
  svg.appendChild(hud);
  const c = sliders.map((s) => `${s.value}%`).join(' / ');
  hud.textContent = `T1/T2/T3 ${c}   err ${solver.maxError().toFixed(2)} px   yaw ${((yaw * 180) / Math.PI).toFixed(0)}°`;
}

// —— 收缩控制
function applySliders(): void {
  sliders.forEach((s, k) => applyContraction3(solver, tendons[k], Number(s.value) / 100));
}
sliders.forEach((s) => s.addEventListener('input', applySliders));
relaxBtn.addEventListener('click', () => {
  sliders.forEach((s) => (s.value = '0'));
  applySliders();
});

// —— 视角拖拽（不动模型）。pointer capture + pointercancel 同路（SPEC §4.3 惯例）
let orbiting = -1;
let lastPX = 0;
let lastPY = 0;
svg.addEventListener('pointerdown', (ev) => {
  if (orbiting >= 0) return;
  orbiting = ev.pointerId;
  lastPX = ev.clientX;
  lastPY = ev.clientY;
  try {
    svg.setPointerCapture(ev.pointerId);
  } catch {
    /* 合成事件无活跃 pointerId */
  }
});
svg.addEventListener('pointermove', (ev) => {
  if (ev.pointerId !== orbiting) return;
  yaw += (ev.clientX - lastPX) * 0.008;
  pitch = Math.max(-1.2, Math.min(1.2, pitch - (ev.clientY - lastPY) * 0.006));
  lastPX = ev.clientX;
  lastPY = ev.clientY;
});
const endOrbit = (ev: PointerEvent): void => {
  if (ev.pointerId === orbiting) orbiting = -1;
};
svg.addEventListener('pointerup', endOrbit);
svg.addEventListener('pointercancel', endOrbit);

// —— rAF 主循环（物理 dt clamp 在 solver3d.step 内部）
let last = performance.now();
function frameLoop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (orbiting < 0) yaw += AUTO_YAW * dt;
  solver.step(dt, TENTACLE3D.sweeps);
  render();
  requestAnimationFrame(frameLoop);
}
render();
requestAnimationFrame(frameLoop);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__linkage = { solver, tendons };
}
