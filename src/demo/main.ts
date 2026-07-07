import { CRANK, N, THETA0, createCrankRocker } from '../lib/linkage/presets';
import { LinkageController } from '../lib/linkage/controller';

// M1/M2 验收页（SPEC §8.0）：vanilla TS，无 React。
// 状态机与全部交互规则在 LinkageController（可测），本文件只做 DOM 接线与渲染。

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('fig') as unknown as SVGSVGElement;

const solver = createCrankRocker();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const controller = new LinkageController(solver, {
  driver: { anchor: N.A, tip: N.B, radius: CRANK.r, omega: 0.9 },
  theta0: THETA0,
  reducedMotion,
});

// —— 建元素（一次），rAF 里只改属性
function el<K extends keyof SVGElementTagNameMap>(tag: K, cls: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  e.setAttribute('class', cls);
  svg.appendChild(e);
  return e;
}

const barEls = solver.bars.map(() => el('line', 'bar'));
const jointEls = solver.nodes.map((n) => {
  const c = el('circle', n.fixed ? 'joint-fixed' : 'joint-free');
  c.setAttribute('r', n.fixed ? '6' : '7');
  return c;
});
const hud = el('text', 'hud');
hud.setAttribute('x', '16');
hud.setAttribute('y', '504');

function render(): void {
  solver.bars.forEach((b, i) => {
    const e = barEls[i];
    e.setAttribute('x1', String(solver.nodes[b.a].x));
    e.setAttribute('y1', String(solver.nodes[b.a].y));
    e.setAttribute('x2', String(solver.nodes[b.b].x));
    e.setAttribute('y2', String(solver.nodes[b.b].y));
  });
  solver.nodes.forEach((n, i) => {
    jointEls[i].setAttribute('cx', String(n.x));
    jointEls[i].setAttribute('cy', String(n.y));
  });
  const B = solver.nodes[N.B];
  const deg = ((Math.atan2(B.y - CRANK.cy, B.x - CRANK.cx) * 180) / Math.PI + 360) % 360;
  hud.textContent = `FIG. 01   θ = ${deg.toFixed(1)}°   maxError = ${solver.maxError().toFixed(3)} px   [${controller.mode}]`;
}

// —— 指针接线（SPEC §4.3）：client → viewBox 必须走 CTM 逆变换（坑 9）
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
svg.addEventListener('pointercancel', (ev) => controller.pointerUp(ev.pointerId)); // 来电/系统手势与松手同路

// —— rAF 主循环（dt clamp 在 controller.frame 内部）
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

// 验收/调试探针（仅 dev 构建）
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__linkage = {
    solver,
    controller,
    N,
    get mode() {
      return controller.mode;
    },
  };
}
