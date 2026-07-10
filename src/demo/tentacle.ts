import { TENTACLE, createTentacle } from '../lib/linkage/tentacle-data';
import { LinkageController } from '../lib/linkage/controller';

// 触手台架（轮回机器_触手spec v0.2 B+C）：vanilla TS，无 React。
// 无曲柄 driver——动力学（重力+阻尼）本身就是「驱动」；交互规则仍走 LinkageController。

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('fig') as unknown as SVGSVGElement;

const solver = createTentacle();
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

// 悬挂座：横梁 + 剖面线（基座是机器的，不是触手的）
const b = TENTACLE.base;
const mount = el('path', 'ground');
mount.setAttribute(
  'd',
  `M${b.x - 26} ${b.y}h52` + [-22, -14, -6, 2, 10, 18].map((k) => `M${b.x + k} ${b.y}l-6 -8`).join(''),
);

// 脊柱段：由粗到细 taper（宽度是形态不是颜色，presentation attribute 合法）
const W_ROOT = 13;
const W_TIP = 3;
const segEls = Array.from({ length: TENTACLE.segments }, (_, i) => {
  const e = el('line', 'arm');
  e.setAttribute('stroke-width', String(W_ROOT + ((W_TIP - W_ROOT) * i) / (TENTACLE.segments - 1)));
  return e;
});

// 关节：基座实心墨点 + 末端可抓手柄（中间节点无视觉、有热区）
const baseDot = el('circle', 'joint-fixed');
baseDot.setAttribute('r', '5');
baseDot.setAttribute('cx', String(b.x));
baseDot.setAttribute('cy', String(b.y));
const tipHandle = el('circle', 'joint-handle');
tipHandle.setAttribute('r', '7');

const hud = el('text', 'hud');
hud.setAttribute('x', '16');
hud.setAttribute('y', '504');

const TIP = TENTACLE.segments;
function render(): void {
  solver.bars.forEach((bar, i) => {
    if (i >= TENTACLE.segments) return; // 弯曲杆不画——它们是刚度，不是形体
    const pa = solver.nodes[bar.a];
    const pb = solver.nodes[bar.b];
    segEls[i].setAttribute('x1', String(pa.x));
    segEls[i].setAttribute('y1', String(pa.y));
    segEls[i].setAttribute('x2', String(pb.x));
    segEls[i].setAttribute('y2', String(pb.y));
  });
  const tip = solver.nodes[TIP];
  tipHandle.setAttribute('cx', String(tip.x));
  tipHandle.setAttribute('cy', String(tip.y));
  hud.textContent = `TENTACLE ${TENTACLE.segments}×${TENTACLE.segLen}   g ${TENTACLE.dynamics.gravity.y}   damp ${TENTACLE.dynamics.damping}   err ${solver.maxError().toFixed(2)} px   [${controller.mode}]`;
}

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
  (window as unknown as Record<string, unknown>).__linkage = { solver, controller };
}
