import {
  GUIDE3,
  SPINE3,
  TENTACLE3D,
  applyContraction3,
  createTentacle3,
} from '../lib/linkage/tentacle3d-data';
import { CELL_PARTS, MOUNT_PARTS, RADII, type HullPart } from '../lib/linkage/tentacle3d-shape';
import { OrbitCamera, type Projected } from '../lib/linkage/camera3d';
import { CriticallyDamped } from '../lib/linkage/motion';

// 立体触手台架（立体求解器 spec v5，渲染 v3——不透明哑光零件渲染）：
// 形体单元 = 逐零件凸包（无洞、水密），不透明填充 + 逐零件画家排序 + 背面剔除
// ——半透明三角汤的「破碎感」由此消除（用户实测否决，2026-07-10）。
// 交互不变：trackball 相机 / 三肌腱滑块 + 联动 / 放松 / 归位 / 视角归位。

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

const cam = new OrbitCamera({
  cx: 350,
  cy: 250,
  pivot: { x: 0, y: 179, z: 0 }, // 干净版臂长 ≈358mm（7 站），枢轴取中段
  scale: 1.1,
  yaw0: 0.6,
  pitch0: -0.28,
  autoYaw: reducedMotion ? 0 : 0.15,
});

// 视空间光源与哑光灰阶（纸-墨系）
const LX = -0.42;
const LY = -0.52;
const LZ = 0.74;
const RAMP = [
  '#4e4e48', '#5d5d56', '#6c6c64', '#7b7b73', '#8b8b82', '#9a9a91',
  '#a9a9a0', '#b8b8af', '#c7c7be', '#d6d6cd', '#e4e4dc', '#f2f2ea',
];

function el<K extends keyof SVGElementTagNameMap>(tag: K, cls = ''): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  if (cls) e.setAttribute('class', cls);
  svg.appendChild(e);
  return e;
}

const ringEl = el('path', 'ground');
const spineEls = Array.from({ length: N }, () => el('line', 'spine'));
const tendonEls = [0, 1, 2].map((k) =>
  Array.from({ length: N }, () => el('line', `tendon tendon-${k}`)),
);
// 零件 path：胞 × 零件 + 基座零件
const partEls: SVGPathElement[][] = CELL_PARTS.map((parts) => parts.map(() => el('path', 'part')));
const mountEls: SVGPathElement[] = MOUNT_PARTS.map(() => el('path', 'part'));
const hud = el('text', 'hud');
hud.setAttribute('x', '16');
hud.setAttribute('y', '504');

interface Frame {
  o: { x: number; y: number; z: number };
  ux: number; uy: number; uz: number;
  ex: number; ey: number; ez: number;
  fx: number; fy: number; fz: number;
}

function cellFrame(i: number): Frame {
  const nodes = sim.solver.nodes;
  const si = Math.max(0, i); // i = −1 表示基座（挂站 0 刚架）
  const o = nodes[SPINE3(si)];
  const nA = nodes[SPINE3(Math.max(0, si - 1))];
  const nB = nodes[SPINE3(Math.min(N, si + 1))];
  let ux = nB.x - nA.x;
  let uy = nB.y - nA.y;
  let uz = nB.z - nA.z;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const g = nodes[GUIDE3(0, si)];
  let ex = g.x - o.x;
  let ey = g.y - o.y;
  let ez = g.z - o.z;
  const dot = ex * ux + ey * uy + ez * uz;
  ex -= dot * ux;
  ey -= dot * uy;
  ez -= dot * uz;
  const el2 = Math.hypot(ex, ey, ez) || 1;
  ex /= el2;
  ey /= el2;
  ez /= el2;
  // 坐标映射为奇置换 → 反手性叉积
  const fx = ey * uz - ez * uy;
  const fy = ez * ux - ex * uz;
  const fz = ex * uy - ey * ux;
  return { o, ux, uy, uz, ex, ey, ez, fx, fy, fz };
}

function projLocal(fr: Frame, ax: number, u: number, w: number): Projected {
  return cam.project({
    x: fr.o.x + (ax * fr.ux + u * fr.ex + w * fr.fx),
    y: fr.o.y + (ax * fr.uy + u * fr.ey + w * fr.fy),
    z: fr.o.z + (ax * fr.uz + u * fr.ez + w * fr.fz),
  });
}

interface Item {
  e: SVGElement;
  depth: number;
}
const items: Item[] = [];
const scratch: Projected[] = [];

/** 零件：凸包投影 → 背面剔除 → 可见面拼 path + 面积加权 lambert 定灰阶。 */
function renderPart(part: HullPart, fr: Frame, e: SVGPathElement): void {
  const nv = part.v.length;
  let depthSum = 0;
  for (let i = 0; i < nv; i++) {
    const p = projLocal(fr, part.v[i][0], part.v[i][1], part.v[i][2]);
    scratch[i] = p;
    depthSum += p.depth;
  }
  let d = '';
  let areaSum = 0;
  let lambSum = 0;
  for (const t of part.t) {
    const p0 = scratch[t[0]];
    const p1 = scratch[t[1]];
    const p2 = scratch[t[2]];
    const ax = p1.x - p0.x, ay = p1.y - p0.y, az = p1.depth - p0.depth;
    const bx = p2.x - p0.x, by = p2.y - p0.y, bz = p2.depth - p0.depth;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    if (nz <= 0) continue; // 背面剔除（凸包外向定向）
    const nl = Math.hypot(nx, ny, nz) || 1;
    const area = nl / 2;
    lambSum += area * Math.abs((nx * LX + ny * LY + nz * LZ) / nl);
    areaSum += area;
    d += `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}L${p1.x.toFixed(1)} ${p1.y.toFixed(1)}L${p2.x.toFixed(1)} ${p2.y.toFixed(1)}Z`;
  }
  if (!d) {
    e.setAttribute('d', 'M0 0');
    return;
  }
  const lam = areaSum ? lambSum / areaSum : 0.5;
  e.setAttribute('d', d);
  e.setAttribute('fill', RAMP[Math.min(RAMP.length - 1, Math.round((0.12 + 0.88 * lam) * (RAMP.length - 1)))]);
  items.push({ e, depth: depthSum / nv });
}

function render(): void {
  const nodes = sim.solver.nodes;
  items.length = 0;
  // 基座参考环（恒在底层）
  const R = RADII[0] + 14;
  let rd = '';
  for (let a = 0; a <= 24; a++) {
    const p = cam.project({ x: R * Math.cos((a * Math.PI) / 12), y: 0, z: R * Math.sin((a * Math.PI) / 12) });
    rd += `${a === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  ringEl.setAttribute('d', rd);
  // 线元素：脊柱 + 肌腱
  for (let i = 0; i < N; i++) {
    const a = cam.project(nodes[SPINE3(i)]);
    const b = cam.project(nodes[SPINE3(i + 1)]);
    spineEls[i].setAttribute('x1', String(a.x));
    spineEls[i].setAttribute('y1', String(a.y));
    spineEls[i].setAttribute('x2', String(b.x));
    spineEls[i].setAttribute('y2', String(b.y));
    items.push({ e: spineEls[i], depth: (a.depth + b.depth) / 2 });
    for (let k = 0; k < 3; k++) {
      const ga = cam.project(nodes[GUIDE3(k, i)]);
      const gb = cam.project(nodes[GUIDE3(k, i + 1)]);
      const e = tendonEls[k][i];
      e.setAttribute('x1', String(ga.x));
      e.setAttribute('y1', String(ga.y));
      e.setAttribute('x2', String(gb.x));
      e.setAttribute('y2', String(gb.y));
      items.push({ e, depth: (ga.depth + gb.depth) / 2 });
    }
  }
  // 零件：7 胞 + 基座（基座挂站 0 刚架）
  for (let ci = 0; ci <= N; ci++) {
    const fr = cellFrame(ci);
    const parts = CELL_PARTS[ci];
    for (let j = 0; j < parts.length; j++) renderPart(parts[j], fr, partEls[ci][j]);
  }
  const mfr = cellFrame(-1);
  for (let j = 0; j < MOUNT_PARTS.length; j++) renderPart(MOUNT_PARTS[j], mfr, mountEls[j]);
  // 画家排序（远 → 近）
  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) svg.appendChild(it.e);
  svg.appendChild(hud);
  const c = sliders.map((s) => `${s.value}%`).join(' / ');
  hud.textContent = `T1/T2/T3 ${c}   err ${sim.solver.maxError().toFixed(2)} px   ×${cam.zoom.toFixed(2)}`;
}

// —— 肌肉：临界阻尼缓动 ×3 + 联动组
const muscles = [0, 1, 2].map(() => new CriticallyDamped(5));
let linkPair: [number, number] | null = null;

function setTarget(k: number, v: number): void {
  muscles[k].target = v;
  sliders[k].value = String(Math.round(v * 100));
  if (linkPair && (k === linkPair[0] || k === linkPair[1])) {
    const other = k === linkPair[0] ? linkPair[1] : linkPair[0];
    muscles[other].target = v;
    sliders[other].value = String(Math.round(v * 100));
  }
}
sliders.forEach((s, k) => s.addEventListener('input', () => setTarget(k, Number(s.value) / 100)));

const PAIRS: ([number, number] | null)[] = [null, [0, 1], [1, 2], [0, 2]];
linkBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => {
    linkPair = PAIRS[i];
    linkBtns.forEach((b, j) => b.classList.toggle('active', j === i));
    if (linkPair) {
      setTarget(linkPair[0], Math.max(muscles[linkPair[0]].target, muscles[linkPair[1]].target));
    }
  });
});

relaxBtn.addEventListener('click', () => {
  for (let k = 0; k < 3; k++) setTarget(k, 0);
});

/** 归位：硬复位——重建实例（笔直、零速度），肌肉状态全清。 */
homeBtn.addEventListener('click', () => {
  sim = createTentacle3();
  muscles.forEach((m, k) => {
    m.jumpTo(0);
    sliders[k].value = '0';
  });
});

viewHomeBtn.addEventListener('click', () => cam.reset());

// —— 视角接线：事件 → 相机（逻辑全在 OrbitCamera，可测）
svg.addEventListener('pointerdown', (ev) => {
  cam.pointerDown(ev.pointerId, ev.clientX, ev.clientY);
  try {
    svg.setPointerCapture(ev.pointerId);
  } catch {
    /* 合成事件无活跃 pointerId */
  }
});
svg.addEventListener('pointermove', (ev) => cam.pointerMove(ev.pointerId, ev.clientX, ev.clientY));
svg.addEventListener('pointerup', (ev) => cam.pointerUp(ev.pointerId));
svg.addEventListener('pointercancel', (ev) => cam.pointerUp(ev.pointerId));
svg.addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault();
    cam.wheel(ev.deltaY);
  },
  { passive: false },
);

// —— rAF 主循环（物理 dt clamp 在 solver3d.step 内部）
let last = performance.now();
function frameLoop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  cam.tick(dt);
  muscles.forEach((m, k) => {
    if (m.update(dt)) applyContraction3(sim.solver, sim.tendons[k], m.value);
  });
  sim.solver.step(dt, TENTACLE3D.sweeps);
  render();
  requestAnimationFrame(frameLoop);
}
render();
requestAnimationFrame(frameLoop);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__linkage = {
    cam,
    get solver() {
      return sim.solver;
    },
    get tendons() {
      return sim.tendons;
    },
  };
}
