import {
  ARCH_APEX,
  ARCH_CENTER,
  ARCH_CRANK_RADIUS,
  ARCH_DRAG_SWEEPS,
  ARCH_DRIVER,
  ARCH_FEET,
  ARCH_PIN,
  ARCH_SPIN_SWEEPS,
  ARCH_THETA0,
  ARCH_TRIS,
  apexHeightMM,
  createArch,
} from '../lib/linkage/arch';
import { LinkageController } from '../lib/linkage/controller';

// 轮回机器伏丘壳体 S4 环台架（真机机构的求解器实例，几何提取自 求解器结构演示.3dm）。
// 与 main.ts（四杆台架）同构：状态机/交互规则全在 LinkageController，本文件只做
// DOM 接线与渲染。渲染只画物理件（板面/驱动链/关节）；导轨模拟长杆与支撑节点不画。

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('fig') as unknown as SVGSVGElement;

const solver = createArch();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const controller = new LinkageController(solver, {
  driver: ARCH_DRIVER,
  theta0: ARCH_THETA0,
  reducedMotion,
  spinSweeps: ARCH_SPIN_SWEEPS,
  dragSweeps: ARCH_DRAG_SWEEPS,
});

/** 可抓手柄：拱顶（呼吸）、四脚（滑槽）、曲柄销（手动盘轮）。中段销不设手柄——
 * 扁板对法向按压敏感（arch-data 头注），把拖拽入口留在机构自由度的方向上。 */
const HANDLES = new Set<number>([ARCH_APEX, ...ARCH_FEET, ARCH_PIN]);

function el<K extends keyof SVGElementTagNameMap>(tag: K, cls: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  e.setAttribute('class', cls);
  svg.appendChild(e);
  return e;
}

// —— 静态装饰（画一次）：地槽线、竖直导轨、曲柄轮圆
const c = solver.nodes[ARCH_CENTER];
const wheel = el('circle', 'decor');
wheel.setAttribute('cx', String(c.x));
wheel.setAttribute('cy', String(c.y));
wheel.setAttribute('r', String(ARCH_CRANK_RADIUS));
const rail = el('line', 'decor');
rail.setAttribute('x1', String(c.x));
rail.setAttribute('y1', '196');
rail.setAttribute('x2', String(c.x));
rail.setAttribute('y2', '316');
const slotL = el('line', 'slot');
const slotR = el('line', 'slot');
// 槽线 = 四脚实际行程的对称包络（2026-07-16 实测，运行时节奏 60fps × ω=0.8 spin：
// 首圈瞬态左 [15.3,69.0]/右 [631.0,685.3]，第 2 圈起稳态轨道左 [20.3,35.7]/右 [666.8,682.5]，
// 残差 0.08px）。图纸姿态内脚 x=68.99/631.01 恰在槽内端。注意：拖拽可把脚推出槽线——
// 模型无止程（不等式）约束，spec §1.2 范围外；槽线只对齐自转行为。
slotL.setAttribute('x1', '14');
slotL.setAttribute('y1', '430');
slotL.setAttribute('x2', '69');
slotL.setAttribute('y2', '430');
slotR.setAttribute('x1', '631');
slotR.setAttribute('y1', '430');
slotR.setAttribute('x2', '686');
slotR.setAttribute('y2', '430');

// —— 动态元素：板面多边形、驱动链两杆、关节
const plateEls = ARCH_TRIS.map(() => el('polygon', 'plate'));
const crankEl = el('line', 'bar');
const rodEl = el('line', 'bar');
const pinDots = [...Array(23).keys()].map(() => {
  const d = el('circle', 'joint-pin');
  d.setAttribute('r', '3');
  return d;
});
const centerDot = el('circle', 'joint-fixed');
centerDot.setAttribute('r', '6');
centerDot.setAttribute('cx', String(c.x));
centerDot.setAttribute('cy', String(c.y));
const handleEls = [...HANDLES].map((i) => {
  const h = el('circle', 'joint-handle');
  h.setAttribute('r', '7');
  h.dataset.node = String(i);
  return h;
});
const hud = el('text', 'hud');
hud.setAttribute('x', '16');
hud.setAttribute('y', '504');

function render(): void {
  ARCH_TRIS.forEach((t, i) => {
    plateEls[i].setAttribute(
      'points',
      t.map((j) => `${solver.nodes[j].x},${solver.nodes[j].y}`).join(' '),
    );
  });
  const pin = solver.nodes[ARCH_PIN];
  const apex = solver.nodes[ARCH_APEX];
  crankEl.setAttribute('x1', String(c.x));
  crankEl.setAttribute('y1', String(c.y));
  crankEl.setAttribute('x2', String(pin.x));
  crankEl.setAttribute('y2', String(pin.y));
  rodEl.setAttribute('x1', String(pin.x));
  rodEl.setAttribute('y1', String(pin.y));
  rodEl.setAttribute('x2', String(apex.x));
  rodEl.setAttribute('y2', String(apex.y));
  for (let i = 0; i < 23; i++) {
    pinDots[i].setAttribute('cx', String(solver.nodes[i].x));
    pinDots[i].setAttribute('cy', String(solver.nodes[i].y));
  }
  handleEls.forEach((h) => {
    const n = solver.nodes[Number(h.dataset.node)];
    h.setAttribute('cx', String(n.x));
    h.setAttribute('cy', String(n.y));
  });
  const phi = ((Math.atan2(pin.y - c.y, pin.x - c.x) * 180) / Math.PI + 450) % 360;
  hud.textContent = `FIG. 12   S4 ring (M3×1.000)   φ = ${phi.toFixed(1)}°   apex = ${apexHeightMM(solver).toFixed(1)} mm   maxError = ${solver.maxError().toFixed(2)} px   [${controller.mode}]`;
}

// —— 指针接线（SPEC §4.3）：CTM 逆变换 + 手柄过滤
function toViewBox(ev: PointerEvent): { x: number; y: number } {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

/** controller 的命中测试取全体自由节点最近者；台架层先自查最近手柄，
 * 非手柄命中一律不进入拖拽（中段销不可抓，见 HANDLES 注释）。 */
function nearestHandleWithin(x: number, y: number, r: number): boolean {
  let best = Infinity;
  let bestIsHandle = false;
  solver.nodes.forEach((n, i) => {
    if (n.fixed) return;
    const d = Math.hypot(n.x - x, n.y - y);
    if (d < best) {
      best = d;
      bestIsHandle = HANDLES.has(i);
    }
  });
  return best <= r && bestIsHandle;
}

svg.addEventListener('pointerdown', (ev) => {
  const p = toViewBox(ev);
  if (!nearestHandleWithin(p.x, p.y, 24)) return;
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
  (window as unknown as Record<string, unknown>).__arch = {
    solver,
    controller,
    get mode() {
      return controller.mode;
    },
  };
}
