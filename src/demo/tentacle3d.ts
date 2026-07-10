import {
  GUIDE3,
  SPINE3,
  TENTACLE3D,
  applyContraction3,
  createTentacle3,
} from '../lib/linkage/tentacle3d-data';

// 立体触手台架（立体求解器 spec v0.1 / 3D-M2，交互 v2——用户实测反馈迭代）：
// - 拖拽 = 轨道相机（首次拖拽后自动旋转永久停止）；滚轮/双指捏合 = 缩放
// - 三滑块 = GH contraction1/2/3；「联动」= 双腱同值同步收缩（弯向夹角平分方向）
// - 放松 = 目标归零、动力学自然回摆；归位 = 硬复位到笔直静止（重建实例、零速度）
// 渲染 = SVG 正交投影 + 画家排序 + 深度明暗（WebGL 红线不碰）。

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('fig') as unknown as SVGSVGElement;
const sliders = [0, 1, 2].map((k) => document.getElementById(`tendon-${k}`) as HTMLInputElement);
const relaxBtn = document.getElementById('relax') as HTMLButtonElement;
const homeBtn = document.getElementById('home') as HTMLButtonElement;
const viewHomeBtn = document.getElementById('view-home') as HTMLButtonElement;
const linkBtns = ['none', '01', '12', '02'].map(
  (id) => document.getElementById(`link-${id}`) as HTMLButtonElement,
);

let sim = createTentacle3();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const N = TENTACLE3D.segments;

// —— 轨道相机（正交投影 + 缩放）
const CX = 350;
const CY = 250;
const SCALE = 1.25;
const YAW0 = 0.6;
const PITCH0 = -0.28;
const PIVOT = { x: 0, y: 150, z: 0 };
let yaw = YAW0;
let pitch = PITCH0;
let zoom = 1;
let autoRotate = !reducedMotion; // 首次拖拽后永久停止——视角主权归用户

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
  const s = SCALE * zoom;
  return { x: CX + qx * s, y: CY + qy * s, depth };
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

const mountEl = el('path', 'ground');
const spineEls = Array.from({ length: N }, () => el('line', 'spine'));
const discEls = Array.from({ length: N + 1 }, () => el('polygon', 'disc'));
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
  const solver = sim.solver;
  layers.length = 0;
  const spine = Array.from({ length: N + 1 }, (_, i) => project(solver.nodes[SPINE3(i)]));
  const guides = [0, 1, 2].map((k) =>
    Array.from({ length: N + 1 }, (_, i) => project(solver.nodes[GUIDE3(k, i)])),
  );
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
  layers.sort((a, b) => a.depth - b.depth);
  const dMin = layers[0].depth;
  const dMax = layers[layers.length - 1].depth || dMin + 1;
  for (const l of layers) {
    const t = (l.depth - dMin) / (dMax - dMin || 1);
    l.e.setAttribute('opacity', String(0.35 + 0.65 * t));
    svg.appendChild(l.e);
  }
  svg.appendChild(hud);
  const c = sliders.map((s) => `${s.value}%`).join(' / ');
  hud.textContent = `T1/T2/T3 ${c}   err ${solver.maxError().toFixed(2)} px   yaw ${((yaw * 180) / Math.PI).toFixed(0)}°  ×${zoom.toFixed(2)}`;
}

// —— 收缩控制：临界阻尼二阶跟踪（零速起步、无过冲，用户拍板）
const MUSCLE_OMEGA = 5;
const target = [0, 0, 0];
const actual = [0, 0, 0];
const vel = [0, 0, 0];
/** 联动组：null 或 [a, b]——组内任一滑块变动，双腱同值同步 */
let linkPair: [number, number] | null = null;

function setTarget(k: number, v: number): void {
  target[k] = v;
  sliders[k].value = String(Math.round(v * 100));
  if (linkPair && (k === linkPair[0] || k === linkPair[1])) {
    const other = k === linkPair[0] ? linkPair[1] : linkPair[0];
    target[other] = v;
    sliders[other].value = String(Math.round(v * 100));
  }
}
sliders.forEach((s, k) =>
  s.addEventListener('input', () => setTarget(k, Number(s.value) / 100)),
);

const PAIRS: ([number, number] | null)[] = [null, [0, 1], [1, 2], [0, 2]];
linkBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => {
    linkPair = PAIRS[i];
    linkBtns.forEach((b, j) => b.classList.toggle('active', j === i));
    // 选中即对齐：组内两腱立即同步到较大目标值，弯向夹角平分方向
    if (linkPair) setTarget(linkPair[0], Math.max(target[linkPair[0]], target[linkPair[1]]));
  });
});

relaxBtn.addEventListener('click', () => {
  for (let k = 0; k < 3; k++) setTarget(k, 0);
});

/** 归位：硬复位——重建实例（笔直、零速度），肌肉状态全清（用户拍板：不看回摆） */
homeBtn.addEventListener('click', () => {
  sim = createTentacle3();
  for (let k = 0; k < 3; k++) {
    target[k] = 0;
    actual[k] = 0;
    vel[k] = 0;
    sliders[k].value = '0';
  }
});

viewHomeBtn.addEventListener('click', () => {
  yaw = YAW0;
  pitch = PITCH0;
  zoom = 1;
});

function easeMuscles(dt: number): void {
  for (let k = 0; k < 3; k++) {
    if (target[k] === actual[k] && vel[k] === 0) continue;
    const acc = (target[k] - actual[k]) * MUSCLE_OMEGA * MUSCLE_OMEGA - 2 * MUSCLE_OMEGA * vel[k];
    vel[k] += acc * dt;
    actual[k] += vel[k] * dt;
    if (Math.abs(target[k] - actual[k]) < 1e-4 && Math.abs(vel[k]) < 1e-3) {
      actual[k] = target[k];
      vel[k] = 0;
    }
    applyContraction3(sim.solver, sim.tendons[k], actual[k]);
  }
}

// —— 视角操控：单指/单键拖 = 轨道；双指捏合 = 缩放；滚轮 = 缩放
const pointers = new Map<number, { x: number; y: number }>();
let pinch0 = 0;
let zoom0 = 1;

svg.addEventListener('pointerdown', (ev) => {
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  autoRotate = false; // 用户接管视角
  try {
    svg.setPointerCapture(ev.pointerId);
  } catch {
    /* 合成事件无活跃 pointerId */
  }
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    zoom0 = zoom;
  }
});
svg.addEventListener('pointermove', (ev) => {
  const p = pointers.get(ev.pointerId);
  if (!p) return;
  if (pointers.size === 1) {
    yaw += (ev.clientX - p.x) * 0.008;
    pitch = Math.max(-1.5, Math.min(1.5, pitch - (ev.clientY - p.y) * 0.006));
  }
  p.x = ev.clientX;
  p.y = ev.clientY;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    zoom = Math.max(0.5, Math.min(3, (zoom0 * d) / pinch0));
  }
});
const endPointer = (ev: PointerEvent): void => {
  pointers.delete(ev.pointerId);
};
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault();
    zoom = Math.max(0.5, Math.min(3, zoom * Math.exp(-ev.deltaY * 0.0012)));
  },
  { passive: false },
);

// —— rAF 主循环（物理 dt clamp 在 solver3d.step 内部）
let last = performance.now();
function frameLoop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (autoRotate && pointers.size === 0) yaw += 0.15 * dt;
  easeMuscles(dt);
  sim.solver.step(dt, TENTACLE3D.sweeps);
  render();
  requestAnimationFrame(frameLoop);
}
render();
requestAnimationFrame(frameLoop);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__linkage = {
    get solver() {
      return sim.solver;
    },
    get tendons() {
      return sim.tendons;
    },
  };
}
