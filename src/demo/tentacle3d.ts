import {
  GUIDE3,
  SPINE3,
  TENTACLE3D,
  applyContraction3,
  createTentacle3,
} from '../lib/linkage/tentacle3d-data';
import { OrbitCamera } from '../lib/linkage/camera3d';
import { projectScene, type Drawable3 } from '../lib/linkage/scene3d';
import { CriticallyDamped } from '../lib/linkage/motion';

// 立体触手台架（立体求解器 spec，交互 v2 / 架构 v3——空间机制复用化）：
// 相机、场景投影、肌肉缓动全部来自 lib 公共装备（camera3d / scene3d / motion），
// 本文件只剩：实例数据、滑块/联动/归位接线、SVG 元素贴附。
// 加新 3D 机构 = 新数据实例 + 新台架页（对标 2D 的拱环先例），不改装备。

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
  pivot: { x: 0, y: 150, z: 0 },
  scale: 1.25,
  yaw0: 0.6,
  pitch0: -0.28,
  autoYaw: reducedMotion ? 0 : 0.15,
});

// —— SVG 元素：按 drawable key 建一次，帧内只改属性与叠序
function el<K extends keyof SVGElementTagNameMap>(tag: K, cls = ''): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  if (cls) e.setAttribute('class', cls);
  svg.appendChild(e);
  return e;
}
const mountEl = el('path', 'ground');
const elems = new Map<string, SVGElement>();
for (let i = 0; i < N; i++) {
  elems.set(`sp${i}`, el('line', 'spine'));
  for (let k = 0; k < 3; k++) elems.set(`t${k}-${i}`, el('line', `tendon tendon-${k}`));
}
for (let i = 0; i <= N; i++) elems.set(`d${i}`, el('polygon', 'disc'));
const hud = el('text', 'hud');
hud.setAttribute('x', '16');
hud.setAttribute('y', '504');

function drawables(): Drawable3[] {
  const nodes = sim.solver.nodes;
  const out: Drawable3[] = [];
  for (let i = 0; i < N; i++) {
    out.push({ key: `sp${i}`, points: [nodes[SPINE3(i)], nodes[SPINE3(i + 1)]] });
    for (let k = 0; k < 3; k++) {
      out.push({ key: `t${k}-${i}`, points: [nodes[GUIDE3(k, i)], nodes[GUIDE3(k, i + 1)]] });
    }
  }
  for (let i = 0; i <= N; i++) {
    out.push({
      key: `d${i}`,
      points: [nodes[GUIDE3(0, i)], nodes[GUIDE3(1, i)], nodes[GUIDE3(2, i)]],
    });
  }
  return out;
}

function render(): void {
  // 基座十字（不参与深度排序，恒在底层）
  const o = cam.project({ x: 0, y: 0, z: 0 });
  const ax = cam.project({ x: TENTACLE3D.discR + 10, y: 0, z: 0 });
  const az = cam.project({ x: 0, y: 0, z: TENTACLE3D.discR + 10 });
  mountEl.setAttribute(
    'd',
    `M${2 * o.x - ax.x} ${2 * o.y - ax.y}L${ax.x} ${ax.y}M${2 * o.x - az.x} ${2 * o.y - az.y}L${az.x} ${az.y}`,
  );
  for (const item of projectScene(cam, drawables())) {
    const e = elems.get(item.key);
    if (!e) continue;
    if (item.pts.length === 2) {
      e.setAttribute('x1', String(item.pts[0].x));
      e.setAttribute('y1', String(item.pts[0].y));
      e.setAttribute('x2', String(item.pts[1].x));
      e.setAttribute('y2', String(item.pts[1].y));
    } else {
      e.setAttribute('points', item.pts.map((p) => `${p.x},${p.y}`).join(' '));
    }
    e.setAttribute('opacity', String(item.opacity));
    svg.appendChild(e); // 远 → 近重排
  }
  svg.appendChild(hud);
  const c = sliders.map((s) => `${s.value}%`).join(' / ');
  hud.textContent = `T1/T2/T3 ${c}   err ${sim.solver.maxError().toFixed(2)} px   yaw ${((cam.yaw * 180) / Math.PI).toFixed(0)}°  ×${cam.zoom.toFixed(2)}`;
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
    // 选中即对齐：组内双腱同步到较大目标值，弯向夹角平分方向
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
