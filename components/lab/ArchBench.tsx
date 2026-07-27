'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ARCH_APEX,
  ARCH_CENTER,
  ARCH_CRANK_RADIUS,
  ARCH_DRAG_SWEEPS,
  ARCH_DRIVER,
  ARCH_FEET,
  ARCH_FOOT_SLOTS,
  ARCH_PIN,
  ARCH_SPIN_SWEEPS,
  ARCH_STEP_DT,
  ARCH_THETA0,
  ARCH_TRIS,
  apexHeightMM,
  archStopPass,
  createArch,
} from '../../src/lib/linkage/arch';
import { LinkageController } from '../../src/lib/linkage/controller';
import type { Point } from '../../src/lib/linkage/types';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.02 S4 拱环台架（暗色 HUD 版）。画法照搬 src/demo/arch.ts：
 * 只画物理件（板面/驱动链/关节），导轨长杆与支撑节点不画；定步积分 + archStopPass
 * 与投影交错（止程转正，2026-07-17）——跨设备同一轨迹。内核封盘零改。
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const HANDLES = [ARCH_APEX, ...ARCH_FEET, ARCH_PIN];

export function ArchBench({ grid = true, active = true }: { grid?: boolean; active?: boolean }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stateRef = useRef<{ ctl: LinkageController; step: (dt: number) => void } | null>(null);
  const [hud, setHud] = useState({ phi: 0, apex: 0, err: 0, mode: 'idle' });

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

    const solver = createArch();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctl = new LinkageController(solver, {
      driver: ARCH_DRIVER,
      theta0: ARCH_THETA0,
      reducedMotion: reduced,
      spinSweeps: ARCH_SPIN_SWEEPS,
      dragSweeps: ARCH_DRAG_SWEEPS,
    });

    if (grid) {
      const defs = el('defs');
      const pattern = el('pattern', '', defs);
      attrs(pattern, { id: 'lab2-dots', width: 28, height: 28, patternUnits: 'userSpaceOnUse' });
      attrs(el('circle', 'grid-dot', pattern), { cx: 1.5, cy: 1.5, r: 1.1 });
      attrs(el('rect'), { x: 0, y: 0, width: 700, height: 520, fill: 'url(#lab2-dots)' });
    }

    // 静态装饰：曲柄轮圆、竖直导轨、四条脚槽线（= 设计活动范围，止程转正后为确定量）
    const c = solver.nodes[ARCH_CENTER];
    attrs(el('circle', 'decor'), { cx: c.x, cy: c.y, r: ARCH_CRANK_RADIUS });
    attrs(el('line', 'decor'), { x1: c.x, y1: 196, x2: c.x, y2: 316 });
    for (const { lo, hi } of ARCH_FOOT_SLOTS) {
      attrs(el('line', 'slot'), { x1: lo, y1: 430, x2: hi, y2: 430 });
    }

    // 动态件：板面 / 驱动两杆 / 销点 / 手柄
    const plateEls = ARCH_TRIS.map(() => el('polygon', 'plate'));
    const crankEl = el('line', 'bar');
    const rodEl = el('line', 'bar');
    const pinDots = [...Array(23).keys()].map(() => {
      const d = el('circle', 'joint-pin');
      d.setAttribute('r', '3');
      return d;
    });
    const centerDot = el('circle', 'joint-fixed');
    attrs(centerDot, { r: 6, cx: c.x, cy: c.y });
    const handleEls = HANDLES.map((i) => {
      const h = el('circle', i === ARCH_APEX ? 'joint-tip' : 'joint-handle');
      h.setAttribute('r', '7');
      h.dataset.node = String(i);
      return h;
    });

    const render = (): void => {
      ARCH_TRIS.forEach((t, i) => {
        plateEls[i].setAttribute(
          'points',
          t.map((j) => `${solver.nodes[j].x},${solver.nodes[j].y}`).join(' '),
        );
      });
      const pin = solver.nodes[ARCH_PIN];
      const apex = solver.nodes[ARCH_APEX];
      attrs(crankEl, { x1: c.x, y1: c.y, x2: pin.x, y2: pin.y });
      attrs(rodEl, { x1: pin.x, y1: pin.y, x2: apex.x, y2: apex.y });
      for (let i = 0; i < 23; i++) {
        attrs(pinDots[i], { cx: solver.nodes[i].x, cy: solver.nodes[i].y });
      }
      handleEls.forEach((h) => {
        const n = solver.nodes[Number(h.dataset.node)];
        attrs(h, { cx: n.x, cy: n.y });
      });
    };

    // 定步积分：累加器按 ARCH_STEP_DT 推进，每子步后跑 archStopPass
    let acc = 0;
    const step = (dt: number): void => {
      acc = Math.min(acc + dt, ARCH_STEP_DT * 8);
      while (acc >= ARCH_STEP_DT) {
        ctl.frame(ARCH_STEP_DT);
        archStopPass(solver);
        acc -= ARCH_STEP_DT;
      }
      render();
      const pin = solver.nodes[ARCH_PIN];
      const phi = ((Math.atan2(pin.y - c.y, pin.x - c.x) * 180) / Math.PI + 450) % 360;
      setHud({ phi, apex: apexHeightMM(solver), err: solver.maxError(), mode: ctl.mode });
    };

    render();
    stateRef.current = { ctl, step };
    return () => {
      stateRef.current = null;
    };
  }, [grid]);

  useBenchLoop(svgRef, (dt) => stateRef.current?.step(dt), [grid], active);

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
        aria-label="S4 拱环台架；拖拱顶、四脚或曲柄销驱动"
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
        <div style={{ color: 'var(--accent)' }}>Lab.02 / Fig. 12</div>
        <div>S4 环 · M3×1.000</div>
        <div className="dim">同一 2D 内核 · 14 板 · 槽端止程 · 定步 1/120</div>
      </div>
      <div className="lab-hud br">
        <div className="num">φ {hud.phi.toFixed(1)}°</div>
        <div className="dim">
          apex {hud.apex.toFixed(1)} mm · err {hud.err.toFixed(2)} · {hud.mode}
        </div>
      </div>
      <div className="lab-hud bl dim">拖拱顶 · 四脚 · 曲柄销</div>
      </div>
    </div>
  );
}
