import { CRANK, N, THETA0, createCrankRocker } from '../lib/linkage/presets';

// M1 验收页（SPEC §8.0）：vanilla TS，无 React。
// 状态机（SPEC §4.2）：spin ⇄ drag；release 手感是 Session 4，此处直接接回 spin。

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('fig') as unknown as SVGSVGElement;

const solver = createCrankRocker();

const OMEGA = 0.9; // 自转角速度 rad/s
const HIT_RADIUS = 24; // 命中热区（viewBox px）：视觉圆圈可以小，热区必须大（SPEC §4.3）
const DT_MAX = 0.05; // SPEC §3.5 dt clamp（坑 3）：只作用于运动学层

type Mode = 'spin' | 'drag' | 'idle';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let mode: Mode = reducedMotion ? 'idle' : 'spin';
let theta = THETA0;

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
  hud.textContent = `FIG. 01   θ = ${deg.toFixed(1)}°   maxError = ${solver.maxError().toFixed(3)} px   [${mode}]`;
}

// —— 指针（SPEC §4.3）：client → viewBox 必须走 CTM 逆变换（坑 9）
function toViewBox(ev: PointerEvent): { x: number; y: number } {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

svg.addEventListener('pointerdown', (ev) => {
  const p = toViewBox(ev);
  let best = -1;
  let bestD = HIT_RADIUS;
  solver.nodes.forEach((n, i) => {
    if (n.fixed) return;
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best < 0) return;
  try {
    svg.setPointerCapture(ev.pointerId);
  } catch {
    /* 合成事件（测试）没有活跃 pointerId */
  }
  solver.beginDrag(best);
  solver.dragTo(p.x, p.y);
  mode = 'drag';
});

svg.addEventListener('pointermove', (ev) => {
  if (mode !== 'drag') return;
  const p = toViewBox(ev);
  solver.dragTo(p.x, p.y);
});

function endDrag(): void {
  if (mode !== 'drag') return;
  solver.endDrag();
  // B 恒在曲柄圆上（AB 刚性 + A 锚定），θ 总有定义——从当前姿态接回自转
  const B = solver.nodes[N.B];
  theta = Math.atan2(B.y - CRANK.cy, B.x - CRANK.cx);
  mode = reducedMotion ? 'idle' : 'spin';
}
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag); // 来电/系统手势打断与松手同路

// —— rAF 主循环（拟静力学：dt 只进运动学层，SPEC §3.5）
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, DT_MAX);
  last = now;
  if (mode === 'spin') {
    theta += OMEGA * dt;
    solver.setFixed(N.B, true);
    solver.setNode(N.B, CRANK.cx + CRANK.r * Math.cos(theta), CRANK.cy + CRANK.r * Math.sin(theta));
    solver.iterate(24);
    solver.setFixed(N.B, false);
  } else if (mode === 'drag') {
    solver.iterate(36);
  }
  render();
  requestAnimationFrame(frame);
}
render();
requestAnimationFrame(frame);

// 验收/调试探针（仅 dev 构建）
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__linkage = {
    solver,
    N,
    get mode() {
      return mode;
    },
  };
}
