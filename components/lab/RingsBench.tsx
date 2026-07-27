'use client';

import { useEffect, useRef, useState } from 'react';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer } from '../../src/lib/linkage/gl3d';
import type { Vec3 } from '../../src/lib/linkage/solver3d';
import {
  SHELL_OMEGA,
  SHELL_STEP_DT,
  SHELL_THETA0,
  createShell,
  ringPoint,
  shellMaxError,
  stepRing,
} from '../../src/lib/linkage/shell3d';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.04 五环立体台架（暗色 HUD 版）。几何/装备与 src/demo/shell3d.ts 同源：
 * 五个 2D 环实例定步推进（同相呼吸，1/120 定步——跨设备一致）+ 刚体位姿嵌入 3D。
 * 装备（camera3d/gl3d）零改；本文件只做刚架计算与 DOM 接线。
 * 未搬运：织物蒙皮与视角预设（台架 /demo/shell3d.html 仍有），站内取结构主体。
 */
const JOINT_R = 2.4;
const HUB_R = 4;
// 暗底线色（台架为纸墨深色，此处反相为浅色）
const C_INK: [number, number, number] = [0.9, 0.92, 0.88];
const C_DECOR: [number, number, number] = [0.42, 0.45, 0.48];
const CHASE_OMEGA = 2.5;

const wrapAngle = (a: number): number => ((a + Math.PI) % (2 * Math.PI)) - Math.PI;

export function RingsBench({ spin = true }: { spin?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<{
    step: (dt: number) => void;
    setPhase: (deg: number) => void;
    setBreathe: (on: boolean) => void;
    viewHome: () => void;
  } | null>(null);
  const [breathe, setBreathe] = useState(spin);
  const [phase, setPhase] = useState(0);
  const [hud, setHud] = useState({ apex: 0, err: 0, note: '' });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rings = createShell();

    // 开场轴测机位（用户拍板 2026-07-17，截图圈定）；空闲自转关闭，动视角靠拖拽
    const cam = new OrbitCamera({
      cx: 350,
      cy: 280,
      pivot: { x: 0, y: 0, z: 85 },
      scale: 1.35,
      roll0: -1.053336,
      pitch0: 0.735843,
      yaw0: 0.867459,
      zoomMin: 0.5,
      zoomMax: 3,
      autoYaw: 0,
    });

    let renderer: FlatRenderer | null = null;
    try {
      renderer = new FlatRenderer(canvas);
    } catch (error) {
      setHud((h) => ({
        ...h,
        note: `3D preview unavailable · ${error instanceof Error ? error.message : 'WebGL 不可用'}`,
      }));
      return;
    }

    // 静态装饰：曲柄轮圆（32 段）+ 每脚槽线
    const decorSegs: { a: Vec3; b: Vec3 }[] = [];
    for (const r of rings) {
      const d = r.data;
      const N = 32;
      for (let i = 0; i < N; i++) {
        const a0 = (i * 2 * Math.PI) / N;
        const a1 = ((i + 1) * 2 * Math.PI) / N;
        decorSegs.push({
          a: ringPoint(d, d.crankR * Math.cos(a0), d.crankR * Math.sin(a0)),
          b: ringPoint(d, d.crankR * Math.cos(a1), d.crankR * Math.sin(a1)),
        });
      }
      for (const s of r.slots) {
        decorSegs.push({ a: ringPoint(d, s.lo, 0), b: ringPoint(d, s.hi, 0) });
      }
    }

    const plateSegs = (): { a: Vec3; b: Vec3 }[] => {
      const segs: { a: Vec3; b: Vec3 }[] = [];
      for (const r of rings) {
        const d = r.data;
        for (const [ja, jb, jc] of d.tris) {
          const a = r.solver.nodes[ja];
          const b = r.solver.nodes[jb];
          const c = r.solver.nodes[jc];
          const aw = ringPoint(d, a.x, a.y);
          const bw = ringPoint(d, b.x, b.y);
          const cw = ringPoint(d, c.x, c.y);
          segs.push({ a: aw, b: bw }, { a: bw, b: cw }, { a: cw, b: aw });
        }
      }
      return segs;
    };
    const drivelineSegs = (): { a: Vec3; b: Vec3 }[] => {
      const segs: { a: Vec3; b: Vec3 }[] = [];
      for (const r of rings) {
        const d = r.data;
        const pin = r.solver.nodes[d.pin];
        const apex = r.solver.nodes[d.apex];
        segs.push({ a: ringPoint(d, 0, 0), b: ringPoint(d, pin.x, pin.y) });
        segs.push({ a: ringPoint(d, pin.x, pin.y), b: ringPoint(d, apex.x, apex.y) });
      }
      return segs;
    };
    const jointDots = (): Vec3[] => {
      const pts: Vec3[] = [];
      for (const r of rings) {
        const d = r.data;
        for (let j = 0; j <= d.pin; j++) {
          const n = r.solver.nodes[j];
          pts.push(ringPoint(d, n.x, n.y));
        }
      }
      return pts;
    };

    let theta = SHELL_THETA0;
    let targetTheta = theta;
    let breathing = spin && !reduced;
    const phiDeg = (): number => (((theta - SHELL_THETA0) * 180) / Math.PI + 360000) % 360;

    const substep = (): void => {
      let dTheta: number;
      if (breathing) {
        dTheta = SHELL_OMEGA * SHELL_STEP_DT;
        targetTheta = theta + dTheta;
      } else {
        const diff = wrapAngle(targetTheta - theta);
        const max = CHASE_OMEGA * SHELL_STEP_DT;
        dTheta = Math.max(-max, Math.min(max, diff));
        if (dTheta === 0) return;
      }
      theta += dTheta;
      for (const r of rings) stepRing(r, dTheta);
    };

    const active = renderer;
    const render = (): void => {
      active.beginFrame(cam);
      active.drawLines(plateSegs(), C_INK);
      active.drawLines(drivelineSegs(), C_INK);
      active.drawLines(decorSegs, C_DECOR, 0.002);
      active.drawDots(jointDots(), JOINT_R, C_INK);
      active.drawDots(
        rings.map((r) => ringPoint(r.data, 0, 0)),
        HUB_R,
        C_INK,
      );
    };

    let acc = 0;
    const step = (dt: number): void => {
      cam.tick(dt);
      acc = Math.min(acc + dt, SHELL_STEP_DT * 8);
      while (acc >= SHELL_STEP_DT) {
        substep();
        acc -= SHELL_STEP_DT;
      }
      render();
      const apexS2 = rings[1].solver.nodes[rings[1].data.apex].y;
      setHud({ apex: apexS2, err: shellMaxError(rings), note: '' });
      if (breathing) setPhase(Number(phiDeg().toFixed(1)));
    };

    apiRef.current = {
      step,
      setPhase: (deg) => {
        breathing = false;
        targetTheta = SHELL_THETA0 + (deg * Math.PI) / 180;
      },
      setBreathe: (on) => {
        breathing = on;
      },
      viewHome: () => cam.reset(),
    };

    const onCtx = (ev: Event): void => ev.preventDefault();
    const onDown = (ev: PointerEvent): void => {
      cam.pointerDown(ev.pointerId, ev.clientX, ev.clientY, ev.button === 2);
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        /* 合成事件无活跃 pointerId */
      }
    };
    const onMove = (ev: PointerEvent): void => cam.pointerMove(ev.pointerId, ev.clientX, ev.clientY);
    const onUp = (ev: PointerEvent): void => cam.pointerUp(ev.pointerId);
    const onWheel = (ev: WheelEvent): void => {
      ev.preventDefault();
      cam.wheel(ev.deltaY);
    };
    canvas.addEventListener('contextmenu', onCtx);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    render();
    return () => {
      apiRef.current = null;
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [spin]);

  useBenchLoop(canvasRef, (dt) => apiRef.current?.step(dt), [spin]);

  return (
    <div>
      <div className="lab-fig" style={{ aspectRatio: '700/520' }}>
        <canvas ref={canvasRef} width={1400} height={1040} aria-label="五环立体台架；拖拽旋转视角、滑块调相位" />
        <div className="lab-hud tl">
          <div className="k">Lab.04 / Fig. 13</div>
          <div>S1–S5 shell · in-phase</div>
          <div className="sub">85 mm 等距 · 逐环止程标定 · 定步 1/120</div>
        </div>
        <div className="lab-hud br">
          <div className="num">φ {phase.toFixed(1)}°</div>
          <div className="sub">
            {hud.note
              ? hud.note
              : `apex(S2) ${hud.apex.toFixed(1)} mm · err ${hud.err.toFixed(2)} mm`}
          </div>
        </div>
        <div className="lab-hud bl">拖拽 = 轨道相机 · 右键平移 · 滚轮缩放</div>
      </div>
      <div className="lab-ctl">
        <label>
          <input
            type="checkbox"
            checked={breathe}
            onChange={(e) => {
              setBreathe(e.target.checked);
              apiRef.current?.setBreathe(e.target.checked);
            }}
          />
          呼吸
        </label>
        <label>
          相位
          <input
            type="range"
            min={0}
            max={360}
            step={0.1}
            value={phase}
            onChange={(e) => {
              const v = Number(e.target.value);
              setBreathe(false);
              setPhase(v);
              apiRef.current?.setPhase(v);
            }}
          />
        </label>
        <button type="button" className="lab-btn" onClick={() => apiRef.current?.viewHome()}>
          视角归位
        </button>
      </div>
    </div>
  );
}
