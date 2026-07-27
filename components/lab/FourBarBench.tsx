'use client';

import { useEffect, useRef, useState } from 'react';
import { LinkageController } from '../../src/lib/linkage/controller';
import { CRANK, N, THETA0, createCrankRocker } from '../../src/lib/linkage/presets';
import { buildTracePath } from '../../src/lib/linkage/trace';
import type { Point } from '../../src/lib/linkage/types';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.01 四杆台架（Lab-Modernist 稿的暗色 HUD 版）。
 * 渲染画法照搬 src/demo/main.ts（图层顺序、接地符号、尺寸标注同款），
 * 内核 = src/lib/linkage（封盘，零改）；本文件只做 DOM 接线与暗色渲染。
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const LABELS = ['A', 'B', 'C', 'D', 'P'] as const;

export function FourBarBench({ grid = true, spin = true, active = true }: { grid?: boolean; spin?: boolean; active?: boolean }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stateRef = useRef<{
    solver: ReturnType<typeof createCrankRocker>;
    ctl: LinkageController;
    render: () => void;
    step: (dt: number) => void;
  } | null>(null);
  const [hud, setHud] = useState({ theta: 0, omega: 0, err: 0, mode: 'idle' });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      cls = '',
      parent: SVGElement = svg,
    ): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG_NS, tag);
      if (cls) e.setAttribute('class', cls);
      parent.appendChild(e);
      return e;
    };
    const attrs = (e: SVGElement, map: Record<string, string | number>): void => {
      for (const [k, v] of Object.entries(map)) e.setAttribute(k, String(v));
    };

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const solver = createCrankRocker();
    const ctl = new LinkageController(solver, {
      driver: { anchor: N.A, tip: N.B, radius: CRANK.r, omega: 0.9 },
      theta0: THETA0,
      reducedMotion: reduced || !spin,
    });

    // ① 点阵衬底（pattern 静态）
    if (grid) {
      const defs = el('defs');
      const pattern = el('pattern', '', defs);
      attrs(pattern, { id: 'lab1-dots', width: 28, height: 28, patternUnits: 'userSpaceOnUse' });
      attrs(el('circle', 'grid-dot', pattern), { cx: 1.5, cy: 1.5, r: 1.1 });
      attrs(el('rect'), { x: 0, y: 0, width: 700, height: 520, fill: 'url(#lab1-dots)' });
    }
    // ② 耦合曲线
    const tracePts: Point[] = [];
    const traceEl = el('path', 'trace');
    // ③ 机架中心线 + 曲柄圆 + 接地符号
    const A0 = solver.nodes[N.A];
    const D0 = solver.nodes[N.D];
    attrs(el('line', 'frame-line'), { x1: A0.x, y1: A0.y, x2: D0.x, y2: D0.y });
    attrs(el('circle', 'decor'), { cx: CRANK.cx, cy: CRANK.cy, r: CRANK.r });
    const ground = (x: number, y: number): void => {
      const hatch = [-8, -2, 4, 10].map((k) => `M${x + k} ${y + 16}l-5 6`).join('');
      attrs(el('path', 'ground'), {
        d: `M${x} ${y}L${x - 10} ${y + 16}L${x + 10} ${y + 16}Z${hatch}`,
      });
    };
    ground(A0.x, A0.y);
    ground(D0.x, D0.y);
    // ④ 杆 → 板 → 关节 → 标注
    const barEls = solver.bars.map(() => el('line', 'bar'));
    const plateEl = el('polygon', 'plate');
    const jointEls = solver.nodes.map((n, i) => {
      const c = el('circle', n.fixed ? 'joint-fixed' : i === N.P ? 'joint-tip' : 'joint-free');
      c.setAttribute('r', n.fixed ? '6' : '7');
      return c;
    });
    const labelEls = LABELS.map((t) => {
      const e = el('text', 'label');
      e.textContent = t;
      return e;
    });
    const dimEls = solver.bars.map((b) => {
      const e = el('text', 'dim');
      e.textContent = String(Math.round(b.rest));
      return e;
    });

    const render = (): void => {
      solver.bars.forEach((b, i) => {
        const pa = solver.nodes[b.a];
        const pb = solver.nodes[b.b];
        attrs(barEls[i], { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
        const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
        attrs(dimEls[i], {
          x: (pa.x + pb.x) / 2 + (-(pb.y - pa.y) / len) * 9,
          y: (pa.y + pb.y) / 2 + ((pb.x - pa.x) / len) * 9,
        });
      });
      const B = solver.nodes[N.B];
      const C = solver.nodes[N.C];
      const P = solver.nodes[N.P];
      plateEl.setAttribute('points', `${B.x},${B.y} ${C.x},${C.y} ${P.x},${P.y}`);
      solver.nodes.forEach((n, i) => {
        attrs(jointEls[i], { cx: n.x, cy: n.y });
        attrs(labelEls[i], { x: n.x + (n.fixed ? -4 : 10), y: n.y + (n.fixed ? 34 : -10) });
      });
    };

    const step = (dt: number): void => {
      ctl.frame(dt);
      const p = solver.nodes[N.P];
      const last = tracePts[tracePts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.75) {
        tracePts.push({ x: p.x, y: p.y });
        if (tracePts.length > 600) tracePts.shift();
        traceEl.setAttribute('d', buildTracePath(tracePts));
      }
      render();
      const B = solver.nodes[N.B];
      const deg = ((Math.atan2(B.y - CRANK.cy, B.x - CRANK.cx) * 180) / Math.PI + 360) % 360;
      setHud({ theta: deg, omega: ctl.omegaNow, err: solver.maxError(), mode: ctl.mode });
    };

    render();
    stateRef.current = { solver, ctl, render, step };
    return () => {
      stateRef.current = null;
    };
  }, [grid, spin]);

  useBenchLoop(svgRef, (dt) => stateRef.current?.step(dt), [grid, spin], active);

  const toVB = (ev: React.PointerEvent<SVGSVGElement>): Point | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  return (
    <div className="lab-wrap">
      <div className="lab-fig">
      <svg
        ref={svgRef}
        viewBox="0 0 700 520"
        role="img"
        aria-label="Grashof 曲柄摇杆台架；拖任意自由节点驱动"
        onPointerDown={(ev) => {
          const p = toVB(ev);
          if (p && stateRef.current?.ctl.pointerDown(ev.pointerId, p.x, p.y)) {
            try {
              ev.currentTarget.setPointerCapture(ev.pointerId);
            } catch {
              /* 合成事件无活跃 pointerId */
            }
          }
        }}
        onPointerMove={(ev) => {
          const p = toVB(ev);
          if (p) stateRef.current?.ctl.pointerMove(ev.pointerId, p.x, p.y);
        }}
        onPointerUp={(ev) => stateRef.current?.ctl.pointerUp(ev.pointerId)}
        onPointerCancel={(ev) => stateRef.current?.ctl.pointerUp(ev.pointerId)}
      />
      <div className="lab-hud tl">
        <div style={{ color: 'var(--accent)' }}>Lab.01 / Fig. 01</div>
        <div>Grashof 曲柄摇杆</div>
        <div className="dim">2D PBD · Gauss–Seidel · L 66·178·127 · 板 132·100</div>
      </div>
      <div className="lab-hud br">
        <div className="num">θ {hud.theta.toFixed(1)}°</div>
        <div className="dim">
          ω {hud.omega.toFixed(2)} · err {hud.err.toFixed(3)} · {hud.mode}
        </div>
      </div>
      <div className="lab-hud bl dim">拖任意自由节点 · 松手继承角速度</div>
      </div>
    </div>
  );
}
