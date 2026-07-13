'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { LinkageController } from '../../src/lib/linkage/controller';
import { CRANK, N, THETA0, createCrankRocker } from '../../src/lib/linkage/presets';
import type { LinkageSolver } from '../../src/lib/linkage/solver';
import { buildTracePath } from '../../src/lib/linkage/trace';
import type { Point } from '../../src/lib/linkage/types';

interface Runtime {
  solver: LinkageSolver;
  controller: LinkageController;
}

function createRuntime(reducedMotion: boolean): Runtime {
  const solver = createCrankRocker();
  return {
    solver,
    controller: new LinkageController(solver, {
      driver: { anchor: N.A, tip: N.B, radius: CRANK.r, omega: 0.9 },
      theta0: THETA0,
      reducedMotion,
    }),
  };
}

/** SITE_SPEC §7：主页与 case study 共用的正式 React 封装；数学与状态机均不重写。 */
export function LinkageFigure({ className = '' }: { className?: string }) {
  const runtimeRef = useRef<Runtime | null>(null);
  if (!runtimeRef.current) runtimeRef.current = createRuntime(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const traceRef = useRef<Array<Point | null>>([]);
  const [, redraw] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    runtimeRef.current = createRuntime(reduced);
    traceRef.current = [];
    redraw((n) => n + 1);

    const svg = svgRef.current;
    if (!svg) return;
    let raf = 0;
    let running = false;
    let last = performance.now();

    const tick = (now: number): void => {
      if (!running) return;
      const runtime = runtimeRef.current as Runtime;
      runtime.controller.frame((now - last) / 1000);
      last = now;
      const p = runtime.solver.nodes[N.P];
      const trace = traceRef.current;
      const prev = trace[trace.length - 1];
      if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.25) {
        if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > 34) trace.push(null);
        trace.push({ x: p.x, y: p.y });
        if (trace.length > 600) trace.shift();
      }
      redraw((n) => n + 1);
      raf = requestAnimationFrame(tick);
    };
    const start = (): void => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = (): void => {
      running = false;
      cancelAnimationFrame(raf);
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), {
        rootMargin: '100px',
      });
      observer.observe(svg);
      return () => {
        observer.disconnect();
        stop();
      };
    }
    start();
    return stop;
  }, []);

  const toViewBox = (ev: ReactPointerEvent<SVGSVGElement>): Point | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };
  const pointerDown = (ev: ReactPointerEvent<SVGSVGElement>): void => {
    const p = toViewBox(ev);
    if (!p || !runtimeRef.current?.controller.pointerDown(ev.pointerId, p.x, p.y)) return;
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      // 合成事件没有活跃 pointerId；真实浏览器指针不走这里。
    }
  };
  const pointerMove = (ev: ReactPointerEvent<SVGSVGElement>): void => {
    const p = toViewBox(ev);
    if (p) runtimeRef.current?.controller.pointerMove(ev.pointerId, p.x, p.y);
  };
  const pointerUp = (ev: ReactPointerEvent<SVGSVGElement>): void => {
    runtimeRef.current?.controller.pointerUp(ev.pointerId);
  };

  const runtime = runtimeRef.current;
  const nodes = runtime.solver.nodes;
  const bars = runtime.solver.bars;
  const plate = [nodes[N.B], nodes[N.C], nodes[N.P]].map((p) => `${p.x},${p.y}`).join(' ');
  const trace = buildTracePath(traceRef.current);
  const ink = 'var(--ink)';
  const graphite = 'var(--graphite)';
  const blue = 'var(--trace-blue)';
  const hairline = 'var(--hairline)';

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 700 520"
      role="img"
      aria-label="Interactive four-bar linkage; drag any white joint"
      className={`block h-auto w-full ${className}`}
      style={{ touchAction: 'none' }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
    >
      <title>Interactive four-bar linkage</title>
      <path d={trace} style={{ fill: 'none', stroke: blue, strokeWidth: 1.4, opacity: 0.8 }} />
      <circle
        cx={CRANK.cx}
        cy={CRANK.cy}
        r={CRANK.r}
        style={{ fill: 'none', stroke: hairline, strokeWidth: 1, strokeDasharray: '4 5' }}
      />
      <line
        x1={nodes[N.A].x}
        y1={nodes[N.A].y}
        x2={nodes[N.D].x}
        y2={nodes[N.D].y}
        style={{ stroke: hairline, strokeWidth: 1, strokeDasharray: '10 4 2 4' }}
      />
      {bars.map((bar, i) => (
        <line
          key={i}
          x1={nodes[bar.a].x}
          y1={nodes[bar.a].y}
          x2={nodes[bar.b].x}
          y2={nodes[bar.b].y}
          style={{ stroke: ink, strokeWidth: 2.4, strokeLinecap: 'round' }}
        />
      ))}
      <polygon
        points={plate}
        style={{ fill: 'color-mix(in srgb, var(--trace-blue) 6%, transparent)', stroke: hairline, strokeWidth: 1.2 }}
      />
      {nodes.map((node, i) =>
        node.fixed ? (
          <g key={i}>
            <circle cx={node.x} cy={node.y} r={5} style={{ fill: ink }} />
            <path
              d={`M${node.x - 11} ${node.y + 13}h22M${node.x - 8} ${node.y + 13}l-5 7M${node.x} ${node.y + 13}l-5 7M${node.x + 8} ${node.y + 13}l-5 7`}
              style={{ fill: 'none', stroke: ink, strokeWidth: 1 }}
            />
          </g>
        ) : (
          <circle
            key={i}
            cx={node.x}
            cy={node.y}
            r={7}
            style={{ fill: 'var(--paper)', stroke: blue, strokeWidth: 2, cursor: 'grab' }}
          />
        ),
      )}
      {(['A', 'B', 'C', 'D', 'P'] as const).map((label, i) => (
        <text
          key={label}
          x={nodes[i].x + 10}
          y={nodes[i].y - 10}
          className="mono"
          style={{ fill: graphite, fontSize: 10 }}
        >
          {label}
        </text>
      ))}
      <g className="mono" style={{ fill: graphite, fontSize: 10 }}>
        <text x="24" y="34">PBD / GAUSS–SEIDEL</text>
        <text x="24" y="50">24–36 SWEEPS · ERR {runtime.solver.maxError().toFixed(3)} PX</text>
        <text x="510" y="488">FIG · θ {(runtime.controller.theta * 180 / Math.PI).toFixed(1)}°</text>
      </g>
    </svg>
  );
}
