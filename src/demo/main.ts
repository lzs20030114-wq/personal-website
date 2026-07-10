import { CRANK, N, THETA0, createCrankRocker } from '../lib/linkage/presets';
import { LinkageController } from '../lib/linkage/controller';
import { buildTracePath } from '../lib/linkage/trace';
import type { Point } from '../lib/linkage/types';

// M3 验收页（SPEC §8.1）：vanilla TS，无 React。
// 状态机与全部交互规则在 LinkageController（可测），本文件只做 DOM 接线与渲染。
// 图层顺序（SPEC §4.4，底→顶）：网格衬底 → 耦合曲线 → 机架/接地 → 杆 → 三角板 → 关节 → 标注/题栏。

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
function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  cls = '',
  parent: SVGElement = svg,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  if (cls) e.setAttribute('class', cls);
  parent.appendChild(e);
  return e;
}

function attrs(e: SVGElement, map: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(map)) e.setAttribute(k, String(v));
}

// ① 点阵网格衬底（pattern 一次定义，静态）
const defs = el('defs');
const pattern = el('pattern', '', defs);
attrs(pattern, { id: 'dots', width: 28, height: 28, patternUnits: 'userSpaceOnUse' });
attrs(el('circle', 'grid-dot', pattern), { cx: 1.5, cy: 1.5, r: 1.1 });
attrs(el('rect', ''), { x: 0, y: 0, width: 700, height: 520, fill: 'url(#dots)' });

// ② 耦合曲线轨迹（ring buffer + 断笔，SPEC §5 条 2）
const TRACE_MAX = 600;
const tracePts: Point[] = [];
const traceEl = el('path', 'trace');

// ③ 机架中心线 + 接地符号（锚点静态，画一次）
const A0 = solver.nodes[N.A];
const D0 = solver.nodes[N.D];
attrs(el('line', 'frame-line'), { x1: A0.x, y1: A0.y, x2: D0.x, y2: D0.y });
// 曲柄圆导引线（工程图作图线）
attrs(el('circle', 'decor'), { cx: CRANK.cx, cy: CRANK.cy, r: CRANK.r });
// 接地符号：三角 + 剖面线（SPEC §4.4）
function groundSymbol(x: number, y: number): void {
  const hatch = [-8, -2, 4, 10]
    .map((k) => `M${x + k} ${y + 16}l-5 6`)
    .join('');
  attrs(el('path', 'ground'), { d: `M${x} ${y}L${x - 10} ${y + 16}L${x + 10} ${y + 16}Z${hatch}` });
}
groundSymbol(A0.x, A0.y);
groundSymbol(D0.x, D0.y);

// ④ 杆 → ⑤ 三角板（发丝线勾边）→ ⑥ 关节
const barEls = solver.bars.map(() => el('line', 'bar'));
const plateEl = el('polygon', 'plate');
const jointEls = solver.nodes.map((n) => {
  const c = el('circle', n.fixed ? 'joint-fixed' : 'joint-free');
  c.setAttribute('r', n.fixed ? '6' : '7');
  return c;
});

// ⑦ 标注：节点字母 + 杆长尺寸（数值取自 solver.bars——单一事实来源）
const NODE_LABELS = ['A', 'B', 'C', 'D', 'P'];
const nodeLabelEls = NODE_LABELS.map((t) => {
  const e = el('text', 'label');
  e.textContent = t;
  return e;
});
const dimEls = solver.bars.map((b) => {
  const e = el('text', 'dim');
  e.textContent = String(Math.round(b.rest));
  return e;
});

// ⑧ 题栏（SPEC §4.4：FIG. 01 / 求解参数 / 实时 θ 读数），右下角
const TB = { x: 452, y: 444, w: 236, h: 64 };
attrs(el('rect', 'tb-box'), { x: TB.x, y: TB.y, width: TB.w, height: TB.h });
attrs(el('line', 'tb-rule'), { x1: TB.x, y1: TB.y + 21, x2: TB.x + TB.w, y2: TB.y + 21 });
attrs(el('line', 'tb-rule'), { x1: TB.x, y1: TB.y + 42, x2: TB.x + TB.w, y2: TB.y + 42 });
function tbText(cls: string, y: number, content: string): SVGTextElement {
  const e = el('text', cls);
  attrs(e, { x: TB.x + 8, y });
  e.textContent = content;
  return e;
}
tbText('tb-title', TB.y + 15, 'FIG. 01 — GRASHOF 曲柄摇杆');
tbText('tb-sub', TB.y + 36, 'L 66·178·127  板 132·100  GS 24/36');
const tbLive = tbText('tb-live', TB.y + 57, '');

function render(): void {
  solver.bars.forEach((b, i) => {
    const pa = solver.nodes[b.a];
    const pb = solver.nodes[b.b];
    attrs(barEls[i], { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
    // 尺寸标注：杆中点沿法向外移 9px
    const mx = (pa.x + pb.x) / 2;
    const my = (pa.y + pb.y) / 2;
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
    attrs(dimEls[i], { x: mx + (-(pb.y - pa.y) / len) * 9, y: my + ((pb.x - pa.x) / len) * 9 });
  });
  const B = solver.nodes[N.B];
  const C = solver.nodes[N.C];
  const P = solver.nodes[N.P];
  plateEl.setAttribute('points', `${B.x},${B.y} ${C.x},${C.y} ${P.x},${P.y}`);
  solver.nodes.forEach((n, i) => {
    attrs(jointEls[i], { cx: n.x, cy: n.y });
    attrs(nodeLabelEls[i], { x: n.x + (n.fixed ? -4 : 10), y: n.y + (n.fixed ? 34 : -10) });
  });
  const deg = ((Math.atan2(B.y - CRANK.cy, B.x - CRANK.cx) * 180) / Math.PI + 360) % 360;
  tbLive.textContent = `θ ${deg.toFixed(1).padStart(5)}°  ω ${controller.omegaNow.toFixed(2)}  err ${solver.maxError().toFixed(3)}  ${controller.mode}`;
}

function pushTrace(): void {
  const p = solver.nodes[N.P];
  const last = tracePts[tracePts.length - 1];
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.75) return; // 静止帧去重
  tracePts.push({ x: p.x, y: p.y });
  if (tracePts.length > TRACE_MAX) tracePts.shift();
  traceEl.setAttribute('d', buildTracePath(tracePts));
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
  pushTrace();
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
