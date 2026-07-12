import {
  GUIDE3,
  SPINE3,
  TENTACLE3D,
  applyContraction3,
  createTentacle3,
  tendonVisual3,
} from '../lib/linkage/tentacle3d-data';
import { CHAINS, MESH_GROUPS, RADII, STATIONS } from '../lib/linkage/tentacle3d-shape';
import { OrbitCamera } from '../lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed, bakeSkinned, type CellFrame } from '../lib/linkage/gl3d';
import meshUrl from './assets/tentacle3d-mesh.bin?url';
import { CriticallyDamped } from '../lib/linkage/motion';

// 立体触手台架（立体求解器 spec，渲染 v5——WebGL 解锁，用户拍板 2026-07-10）：
// 零依赖裸 WebGL + z-buffer = 物理精确逐像素遮挡（SVG 画家算法对互穿零件
// 无正确顺序，历经四版后到顶——教训全档在 spec §1.6）。哑光纸墨风格不变；
// 肌腱线参与深度测试，被零件正确遮挡。
// 交互不变：trackball 相机 / 三肌腱滑块 + 联动 / 放松 / 归位 / 视角归位。

const canvas = document.getElementById('fig') as HTMLCanvasElement;
const hudEl = document.getElementById('hud') as HTMLDivElement;
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
  cx: 380, // 横躺后基座总成偏左，右移补中
  cy: 250,
  pivot: { x: 0, y: 179, z: 0 }, // 干净版臂长 ≈358mm（7 站），枢轴取中段
  scale: 1.1,
  yaw0: 0,
  pitch0: 0,
  roll0: -Math.PI / 2, // 默认机位 = 正侧视（用户拍板 2026-07-10）：基座在左、臂指右、无斜倾
  autoYaw: reducedMotion ? 0 : 0.15,
});

const renderer = new FlatRenderer(canvas);
// TPU 连接件（j 组）：与方盒榫卯插接、双骨蒙皮（用户纠偏 2026-07-11）。
// 注意：**刚性节不做蒙皮**（v7.4 曾给节 0 挂根蒙皮带被用户否决——刚性
// 材质不能弯；节 0 是纯刚体绕盘旋转，根界面开合是真实铰链行为）
const joints = MESH_GROUPS.filter((g) => g.blend).map((g) => ({
  name: g.name,
  gap: g.name === 'jr' ? -1 : Number(g.name.slice(1)),
}));
// 完整渲染网格（10.7 万三角）从二进制资产异步载入——「直接导入模型」（用户拍板）
fetch(meshUrl)
  .then((r) => r.arrayBuffer())
  .then((buf) => {
    for (const g of MESH_GROUPS) {
      const verts = new Float32Array(buf, g.vOff, g.verts * 3);
      const idx = g.idx32
        ? new Uint32Array(buf, g.iOff, g.tris * 3)
        : new Uint16Array(buf, g.iOff, g.tris * 3);
      if (g.blend) renderer.addSkinnedMesh(g.name, bakeSkinned(verts, idx, g.blend[0], g.blend[1]));
      else renderer.addMesh(g.name, bakeIndexed(verts, idx));
    }
  });

// 线色（纸墨系）：脊柱 / 三腱 / 参考环
const SPINE_C: [number, number, number] = [0.54, 0.54, 0.51];
const TENDON_C: [number, number, number][] = [
  [0.14, 0.34, 0.65],
  [0.69, 0.41, 0.18],
  [0.29, 0.48, 0.32],
];
const RING_C: [number, number, number] = [0.75, 0.75, 0.7];

function cellFrame(i: number): CellFrame {
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

// 基座 = 真正的不动锚（用户纠偏 2026-07-11：根部节 0 是活动关节）——
// 用常量静息刚架绘制，不随节 0 摆动
const MNT_FRAME: CellFrame = (() => {
  const g = CHAINS[0][0];
  const o = STATIONS[0];
  let ex = g[0] - o[0];
  const ey = 0;
  let ez = g[2] - o[2];
  const el = Math.hypot(ex, ez) || 1;
  ex /= el;
  ez /= el;
  // û = +y（静息臂向）；ê2 = 反手性叉积（同 cellFrame 公式代入 u=(0,1,0)）
  return {
    o: { x: o[0], y: o[1], z: o[2] },
    ux: 0, uy: 1, uz: 0,
    ex, ey, ez,
    fx: -ez, fy: 0, fz: ex,
  };
})();

function render(): void {
  const nodes = sim.solver.nodes;
  renderer.beginFrame(cam);
  // 体：7 胞（活动）+ 基座（常量静息刚架，锚定不动）
  for (let ci = 0; ci <= N; ci++) renderer.drawMesh(`c${ci}`, cellFrame(ci));
  renderer.drawMesh('mnt', MNT_FRAME);
  // TPU 连接件：双骨蒙皮（插接段随盒刚动，裸露段吸收弯曲）；
  // 根轴 jr：基座固定刚架 ↔ 节 0（静息同原点，dy = 0）
  for (const j of joints) {
    if (j.gap < 0) {
      renderer.drawSkinned(j.name, MNT_FRAME, cellFrame(0), 0);
    } else {
      const dy = STATIONS[j.gap + 1][1] - STATIONS[j.gap][1];
      renderer.drawSkinned(j.name, cellFrame(j.gap), cellFrame(j.gap + 1), dy);
    }
  }
  // 参考环（站 0 平面）
  const R = RADII[0] + 14;
  const ring: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number } }[] = [];
  for (let a = 0; a < 24; a++) {
    const t0 = (a * Math.PI) / 12;
    const t1 = ((a + 1) * Math.PI) / 12;
    ring.push({
      a: { x: R * Math.cos(t0), y: 0, z: R * Math.sin(t0) },
      b: { x: R * Math.cos(t1), y: 0, z: R * Math.sin(t1) },
    });
  }
  renderer.drawLines(ring, RING_C, 0);
  // 脊柱与肌腱（参与深度测试——穿过零件的段被正确遮挡）
  const spineSegs = [];
  for (let i = 0; i < N; i++) spineSegs.push({ a: nodes[SPINE3(i)], b: nodes[SPINE3(i + 1)] });
  renderer.drawLines(spineSegs, SPINE_C);
  // 肌腱线 = 真实走线（v3：端板孔 → 绕中央球体背面 → 端板孔 → 跨缝）
  for (let k = 0; k < 3; k++) {
    const pts = tendonVisual3(sim.solver, k);
    const segs = [];
    for (let i = 0; i + 1 < pts.length; i++) segs.push({ a: pts[i], b: pts[i + 1] });
    renderer.drawLines(segs, TENDON_C[k]);
  }
  const c = sliders.map((s) => `${s.value}%`).join(' / ');
  hudEl.textContent = `T1/T2/T3 ${c}   err ${sim.solver.maxError().toFixed(2)} px   ×${cam.zoom.toFixed(2)}`;
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

// —— 视角接线：事件 → 相机（逻辑全在 OrbitCamera，可测）；右键 = 平移
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('pointerdown', (ev) => {
  cam.pointerDown(ev.pointerId, ev.clientX, ev.clientY, ev.button === 2);
  try {
    canvas.setPointerCapture(ev.pointerId);
  } catch {
    /* 合成事件无活跃 pointerId */
  }
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
