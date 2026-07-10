import {
  GUIDE3,
  SPINE3,
  TENTACLE3D,
  applyContraction3,
  createTentacle3,
} from '../lib/linkage/tentacle3d-data';
import { CELL_OUTLINES, CELL_TRIS, MOUNT_OUTLINE, MOUNT_TRIS, RADII } from '../lib/linkage/tentacle3d-shape';
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
  pivot: { x: 0, y: 179, z: 0 }, // 干净版臂长 ≈358mm（7 站），枢轴取中段
  scale: 1.1,
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
// 着色档（半透明平面着色，用户拍板 2026-07-10）：明暗 6 档 × (5 胞 + 基座)
const BANDS = 6;
const SHADE_COLORS = ['#3c3c38', '#5c5c55', '#7d7d75', '#a0a097', '#c4c4bb', '#e6e6de'];
const shadeEls = new Map<string, SVGPathElement[]>();
for (let i = 0; i <= N; i++) {
  const arr: SVGPathElement[] = [];
  for (let b = 0; b < BANDS; b++) {
    const e = el('path', 'shade');
    e.setAttribute('fill', SHADE_COLORS[b]);
    arr.push(e);
  }
  shadeEls.set(`v${i}`, arr);
}
{
  const arr: SVGPathElement[] = [];
  for (let b = 0; b < BANDS; b++) {
    const e = el('path', 'shade');
    e.setAttribute('fill', SHADE_COLORS[b]);
    arr.push(e);
  }
  shadeEls.set('mnt', arr);
}
for (let i = 0; i <= N; i++) elems.set(`v${i}`, el('path', 'disc'));
elems.set('mnt', el('path', 'mount'));
// 视空间光源（正交投影下 depth 越大越近）
const LX = -0.42, LY = -0.52, LZ = 0.74;
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
  // 椎节元胞线框：深度锚在站心（路径本体在 render 里按局部刚架变换生成）
  for (let i = 0; i <= N; i++) out.push({ key: `v${i}`, points: [nodes[SPINE3(i)]] });
  out.push({ key: 'mnt', points: [nodes[SPINE3(0)]] }); // 基座总成挂站 0（锚定）
  return out;
}

/**
 * 椎节局部刚架 → 世界 → 投影路径。局部系 = 提取时的 [沿臂 ax, 腱1 方向 u, 副法向 w]；
 * 运行时刚架由求解器节点重建：û = 邻站切向，ê1 = 腱1 导点方向（去轴向分量），
 * ê2 = ê1 × û（坐标映射为奇置换，故用反手性叉积）。缩放 = 该站相对代表件的比例。
 */
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
  const fx = ey * uz - ez * uy;
  const fy = ez * ux - ex * uz;
  const fz = ex * uy - ey * ux;
  return { o, ux, uy, uz, ex, ey, ez, fx, fy, fz };
}

function projLocal(fr: Frame, ax: number, u: number, w: number): ReturnType<typeof cam.project> {
  return cam.project({
    x: fr.o.x + (ax * fr.ux + u * fr.ex + w * fr.fx),
    y: fr.o.y + (ax * fr.uy + u * fr.ey + w * fr.fy),
    z: fr.o.z + (ax * fr.uz + u * fr.ez + w * fr.fz),
  });
}

function discPath(i: number, fr: Frame): string {
  const outline = i < 0 ? MOUNT_OUTLINE : CELL_OUTLINES[i];
  let d = '';
  for (const poly of outline) {
    for (let j = 0; j < poly.length; j++) {
      const [ax, u, w] = poly[j];
      const p = projLocal(fr, ax, u, w);
      d += `${j === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }
  }
  return d;
}

/** 半透明平面着色：三角面投影 → 视空间法向 |n·L| 分档合并（双面着色免翻面陷阱）。 */
function shadeBands(i: number, fr: Frame): string[] {
  const tris = i < 0 ? MOUNT_TRIS : CELL_TRIS[i];
  const bands = new Array<string>(BANDS).fill('');
  for (const t of tris) {
    const p0 = projLocal(fr, t[0][0], t[0][1], t[0][2]);
    const p1 = projLocal(fr, t[1][0], t[1][1], t[1][2]);
    const p2 = projLocal(fr, t[2][0], t[2][1], t[2][2]);
    const ax = p1.x - p0.x, ay = p1.y - p0.y, az = p1.depth - p0.depth;
    const bx = p2.x - p0.x, by = p2.y - p0.y, bz = p2.depth - p0.depth;
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const lam = Math.abs((nx * LX + ny * LY + nz * LZ) / nl);
    const b = Math.min(BANDS - 1, Math.floor((0.15 + 0.85 * lam) * BANDS));
    bands[b] += `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)}L${p1.x.toFixed(1)} ${p1.y.toFixed(1)}L${p2.x.toFixed(1)} ${p2.y.toFixed(1)}Z`;
  }
  return bands;
}

function render(): void {
  // 基座参考环 + 方位刻度（不参与深度排序，恒在底层）——旋转的视觉锚点：
  // 轴对称机构绕竖轴转动时机构本身几乎不变样，没有参考环会读作「转不动」
  const R = RADII[0] + 14; // 根部真机孔半径外扩一圈
  let d = '';
  for (let a = 0; a <= 24; a++) {
    const p = cam.project({ x: R * Math.cos((a * Math.PI) / 12), y: 0, z: R * Math.sin((a * Math.PI) / 12) });
    d += `${a === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  const t0 = cam.project({ x: R, y: 0, z: 0 });
  const t1 = cam.project({ x: R + 10, y: 0, z: 0 });
  mountEl.setAttribute('d', `${d}M${t0.x.toFixed(1)} ${t0.y.toFixed(1)}L${t1.x.toFixed(1)} ${t1.y.toFixed(1)}`);
  for (const item of projectScene(cam, drawables())) {
    const e = elems.get(item.key);
    if (!e) continue;
    if (item.key === 'mnt' || item.key[0] === 'v') {
      const ci = item.key === 'mnt' ? -1 : Number(item.key.slice(1));
      const fr = cellFrame(ci);
      const bands = shadeBands(ci, fr);
      const bandEls = shadeEls.get(item.key);
      if (bandEls) {
        for (let b = 0; b < BANDS; b++) {
          bandEls[b].setAttribute('d', bands[b] || 'M0 0');
          bandEls[b].setAttribute('opacity', String(item.opacity));
          svg.appendChild(bandEls[b]);
        }
      }
      e.setAttribute('d', discPath(ci, fr));
    } else {
      e.setAttribute('x1', String(item.pts[0].x));
      e.setAttribute('y1', String(item.pts[0].y));
      e.setAttribute('x2', String(item.pts[1].x));
      e.setAttribute('y2', String(item.pts[1].y));
    }
    e.setAttribute('opacity', String(item.opacity));
    svg.appendChild(e); // 远 → 近重排
  }
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
