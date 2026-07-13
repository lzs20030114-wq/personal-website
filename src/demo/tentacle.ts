import {
  LEFT,
  RIGHT,
  SPINE,
  TENTACLE,
  TIP,
  applyContraction,
  createTentacle,
} from '../lib/linkage/tentacle-data';
import { LinkageController } from '../lib/linkage/controller';

// 肌腱驱动触手台架（触手 spec v0.5，机制提取自 触手模拟1.ghx）：vanilla TS，无 React。
// 左右滑块 = GH 的 contraction 滑块（差动收缩控弯曲）；拖拽 = GH 的 Grab。

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('fig') as unknown as SVGSVGElement;
const sliderL = document.getElementById('tendon-l') as HTMLInputElement;
const sliderR = document.getElementById('tendon-r') as HTMLInputElement;
const relaxBtn = document.getElementById('relax') as HTMLButtonElement;

const { solver, left, right } = createTentacle();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const controller = new LinkageController(solver, {
  dragSweeps: TENTACLE.sweeps,
  spinSweeps: TENTACLE.sweeps,
  hitRadius: 26,
  reducedMotion,
});

function el<K extends keyof SVGElementTagNameMap>(tag: K, cls = ''): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  if (cls) e.setAttribute('class', cls);
  svg.appendChild(e);
  return e;
}

// 悬挂座（基座椎板整块锚定 = 夹持）
const b = TENTACLE.base;
const mount = el('path', 'ground');
mount.setAttribute(
  'd',
  `M${b.x - TENTACLE.discR - 10} ${b.y}h${2 * TENTACLE.discR + 20}` +
    [-24, -14, -4, 6, 16, 26].map((k) => `M${b.x + k} ${b.y}l-6 -8`).join(''),
);

// 图层：脊柱（浅）→ 肌腱（蓝，左右各一条折线）→ 椎板（深横杆）→ 末端手柄
const spineEl = el('polyline', 'spine');
const tendonL = el('polyline', 'tendon');
const tendonR = el('polyline', 'tendon');
const discEls = Array.from({ length: TENTACLE.segments + 1 }, () => el('line', 'disc'));
const tipHandle = el('circle', 'joint-handle');
tipHandle.setAttribute('r', '7');

const hud = el('text', 'hud');
hud.setAttribute('x', '16');
hud.setAttribute('y', '504');

const pts = (idx: (i: number) => number): string =>
  Array.from({ length: TENTACLE.segments + 1 }, (_, i) => {
    const n = solver.nodes[idx(i)];
    return `${n.x},${n.y}`;
  }).join(' ');

function render(): void {
  spineEl.setAttribute('points', pts(SPINE));
  tendonL.setAttribute('points', pts(LEFT));
  tendonR.setAttribute('points', pts(RIGHT));
  for (let i = 0; i <= TENTACLE.segments; i++) {
    const L = solver.nodes[LEFT(i)];
    const R = solver.nodes[RIGHT(i)];
    discEls[i].setAttribute('x1', String(L.x));
    discEls[i].setAttribute('y1', String(L.y));
    discEls[i].setAttribute('x2', String(R.x));
    discEls[i].setAttribute('y2', String(R.y));
  }
  const tip = solver.nodes[SPINE(TIP)];
  tipHandle.setAttribute('cx', String(tip.x));
  tipHandle.setAttribute('cy', String(tip.y));
  hud.textContent = `TENDON L ${Number(sliderL.value)}%  R ${Number(sliderR.value)}%   err ${solver
    .maxError()
    .toFixed(2)} px   [${controller.mode}]`;
}

// —— 收缩控制（GH contraction 滑块的对应物）
function applySliders(): void {
  controller.activateDynamics();
  applyContraction(solver, left, Number(sliderL.value) / 100);
  applyContraction(solver, right, Number(sliderR.value) / 100);
}
sliderL.addEventListener('input', applySliders);
sliderR.addEventListener('input', applySliders);
relaxBtn.addEventListener('click', () => {
  sliderL.value = '0';
  sliderR.value = '0';
  applySliders();
});

// —— 指针接线（SPEC §4.3）
function toViewBox(ev: PointerEvent): { x: number; y: number } {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

svg.addEventListener('pointerdown', (ev) => {
  const p = toViewBox(ev);
  if (controller.pointerDown(ev.pointerId, p.x, p.y)) {
    try {
      svg.setPointerCapture(ev.pointerId);
    } catch {
      /* 合成事件（测试）没有活跃 pointerId */
    }
  }
});
svg.addEventListener('pointermove', (ev) => {
  const p = toViewBox(ev);
  controller.pointerMove(ev.pointerId, p.x, p.y);
});
svg.addEventListener('pointerup', (ev) => controller.pointerUp(ev.pointerId));
svg.addEventListener('pointercancel', (ev) => controller.pointerUp(ev.pointerId));

// —— rAF 主循环（dt clamp 在 controller/solver 内部）
let last = performance.now();
function frameLoop(now: number): void {
  const dt = (now - last) / 1000;
  last = now;
  controller.frame(dt);
  render();
  requestAnimationFrame(frameLoop);
}
render();
requestAnimationFrame(frameLoop);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__linkage = { solver, controller, left, right };
}
