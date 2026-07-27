'use client';

import { useEffect, useRef, useState } from 'react';
import {
  GUIDE3,
  ROOTB3,
  SPINE3,
  TENTACLE3D,
  applyContraction3,
  createTentacle3,
  tendonVisual3,
} from '../../src/lib/linkage/tentacle3d-data';
import { CHAINS, MESH_GROUPS, STATIONS } from '../../src/lib/linkage/tentacle3d-shape';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed, bakeSkinned, type CellFrame } from '../../src/lib/linkage/gl3d';
import { CriticallyDamped } from '../../src/lib/linkage/motion';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.03 立体触手台架（暗色 HUD 版）。几何/装备与 src/demo/tentacle3d.ts 同源：
 * 真实扫描网格（10.7 万三角，public/mesh/tentacle3d-mesh.bin，prebuild 复制）+
 * 零依赖裸 WebGL z-buffer 精确遮挡 + trackball 相机。
 * ★ 设计稿因无法导入 .bin 而用程序化方盒替代；本站用真实形态（用户拍板 2026-07-27）。
 * 内核（solver3d）与装备（gl3d/camera3d）零改——加新机构 = 新实例 + 台架，不改装备。
 */
const MESH_URL = '/mesh/tentacle3d-mesh.bin';
// 暗底线色：脊柱冷灰，三腱 绿 / 紫 / 中灰（与站内暗色语言同族）
const SPINE_C: [number, number, number] = [0.44, 0.47, 0.5];
const TENDON_C: [number, number, number][] = [
  [0.62, 0.82, 0.58],
  [0.76, 0.7, 0.92],
  [0.72, 0.74, 0.7],
];
const PAIRS: ([number, number] | null)[] = [null, [0, 1], [1, 2], [0, 2]];
const LINK_LABELS = ['none', '1+2', '2+3', '1+3'];

export function TentacleBench({
  spin = true,
  active = true,
  controls = true,
}: {
  spin?: boolean;
  active?: boolean;
  /** false = 纯展示（主页舞台用）：不出控制条 */
  controls?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<{
    step: (dt: number) => void;
    setTarget: (k: number, v: number) => void;
    home: () => void;
    viewHome: () => void;
    cam: OrbitCamera;
  } | null>(null);
  const [tendons, setTendons] = useState<[number, number, number]>([0, 0, 0]);
  const [link, setLink] = useState(0);
  const linkRef = useRef(0);
  const [hud, setHud] = useState({ err: 0, zoom: 1, note: '' });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const N = TENTACLE3D.segments;
    let sim = createTentacle3();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const cam = new OrbitCamera({
      cx: 380,
      cy: 250,
      pivot: { x: 0, y: 179, z: 0 },
      scale: 1.1,
      yaw0: 0,
      pitch0: 0,
      roll0: -Math.PI / 2, // 正侧视：基座在左、臂指右（用户拍板 2026-07-10）
      autoYaw: reduced || !spin ? 0 : 0.15,
    });

    let renderError: string | null = null;
    let renderer: FlatRenderer | null = null;
    try {
      renderer = new FlatRenderer(canvas);
    } catch (error) {
      renderError = error instanceof Error ? error.message : 'WebGL 初始化失败';
      setHud((h) => ({ ...h, note: `3D preview unavailable · ${renderError}` }));
    }

    const joints = MESH_GROUPS.filter((g) => g.blend).map((g) => ({
      name: g.name,
      gap: g.name === 'jr' ? -1 : Number(g.name.slice(1)),
    }));

    // 真实网格异步载入（"直接导入模型"，用户拍板）
    const active = renderer;
    let disposed = false;
    if (active) {
      fetch(MESH_URL)
        .then((r) => {
          if (!r.ok) throw new Error(`3D mesh 请求失败（HTTP ${r.status}）`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          if (disposed) return;
          const need = Math.max(
            ...MESH_GROUPS.flatMap((g) => [
              g.vOff + g.verts * 3 * Float32Array.BYTES_PER_ELEMENT,
              g.iOff +
                g.tris *
                  3 *
                  (g.idx32 ? Uint32Array.BYTES_PER_ELEMENT : Uint16Array.BYTES_PER_ELEMENT),
            ]),
          );
          if (buf.byteLength < need) {
            throw new Error(`3D mesh 数据不完整（${buf.byteLength}/${need} bytes）`);
          }
          for (const g of MESH_GROUPS) {
            const verts = new Float32Array(buf, g.vOff, g.verts * 3);
            const idx = g.idx32
              ? new Uint32Array(buf, g.iOff, g.tris * 3)
              : new Uint16Array(buf, g.iOff, g.tris * 3);
            if (g.blend) active.addSkinnedMesh(g.name, bakeSkinned(verts, idx, g.blend[0], g.blend[1]));
            else active.addMesh(g.name, bakeIndexed(verts, idx));
          }
        })
        .catch((error: unknown) => {
          renderError = error instanceof Error ? error.message : '3D mesh 载入失败';
          setHud((h) => ({ ...h, note: `mesh incomplete · ${renderError}` }));
        });
    }

    // —— 站元胞刚架（与台架同一公式：前站→后站中央切线 + 导向点正交化，反手性叉积）
    const cellFrame = (i: number): CellFrame => {
      const nodes = sim.solver.nodes;
      const si = Math.max(0, i);
      const o = nodes[SPINE3(si)];
      const nA = si === 0 ? nodes[ROOTB3()] : nodes[SPINE3(si - 1)];
      const nB = nodes[SPINE3(Math.min(N, si + 1))];
      let ux = nB.x - nA.x;
      let uy = nB.y - nA.y;
      let uz = nB.z - nA.z;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul;
      uy /= ul;
      uz /= ul;
      const g = nodes[GUIDE3(0, si)];
      let ex = g.x - o.x;
      let ey = g.y - o.y;
      let ez = g.z - o.z;
      const dot = ex * ux + ey * uy + ez * uz;
      ex -= dot * ux;
      ey -= dot * uy;
      ez -= dot * uz;
      const el2 = Math.hypot(ex, ey, ez) || 1;
      ex /= el2;
      ey /= el2;
      ez /= el2;
      return {
        o,
        ux,
        uy,
        uz,
        ex,
        ey,
        ez,
        fx: ey * uz - ez * uy,
        fy: ez * ux - ex * uz,
        fz: ex * uy - ey * ux,
      };
    };

    // 基座 = 真正的不动锚（常量静息刚架，不随节 0 摆动）
    const MNT_FRAME: CellFrame = (() => {
      const g = CHAINS[0][0];
      const o = STATIONS[0];
      let ex = g[0] - o[0];
      let ez = g[2] - o[2];
      const el = Math.hypot(ex, ez) || 1;
      ex /= el;
      ez /= el;
      return {
        o: { x: o[0], y: o[1], z: o[2] },
        ux: 0,
        uy: 1,
        uz: 0,
        ex,
        ey: 0,
        ez,
        fx: -ez,
        fy: 0,
        fz: ex,
      };
    })();
    const rootB = sim.solver.nodes[ROOTB3()];
    const ROOT_FRAME: CellFrame = { ...MNT_FRAME, o: { x: rootB.x, y: rootB.y, z: rootB.z } };
    const ROOT_DY = STATIONS[0][1] - ROOT_FRAME.o.y;

    const render = (): void => {
      if (!renderer) return;
      const nodes = sim.solver.nodes;
      renderer.beginFrame(cam);
      for (let ci = 0; ci <= N; ci++) renderer.drawMesh(`c${ci}`, cellFrame(ci));
      renderer.drawMesh('mnt', MNT_FRAME);
      for (const j of joints) {
        if (j.gap < 0) renderer.drawSkinned(j.name, ROOT_FRAME, cellFrame(0), ROOT_DY);
        else {
          const dy = STATIONS[j.gap + 1][1] - STATIONS[j.gap][1];
          renderer.drawSkinned(j.name, cellFrame(j.gap), cellFrame(j.gap + 1), dy);
        }
      }
      const spineSegs = [];
      for (let i = 0; i < N; i++) spineSegs.push({ a: nodes[SPINE3(i)], b: nodes[SPINE3(i + 1)] });
      renderer.drawLines(spineSegs, SPINE_C);
      for (let k = 0; k < 3; k++) {
        const pts = tendonVisual3(sim.solver, k);
        const segs = [];
        for (let i = 0; i + 1 < pts.length; i++) segs.push({ a: pts[i], b: pts[i + 1] });
        renderer.drawLines(segs, TENDON_C[k]);
      }
    };

    const muscles = [0, 1, 2].map(() => new CriticallyDamped(5));
    const setTarget = (k: number, v: number): void => {
      muscles[k].target = v;
      const pair = PAIRS[linkRef.current];
      setTendons((prev) => {
        const next: [number, number, number] = [...prev] as [number, number, number];
        next[k] = v;
        if (pair && (k === pair[0] || k === pair[1])) {
          const other = k === pair[0] ? pair[1] : pair[0];
          muscles[other].target = v;
          next[other] = v;
        }
        return next;
      });
    };

    const step = (dt: number): void => {
      if (!renderer) return;
      cam.tick(dt);
      muscles.forEach((m, k) => {
        if (m.update(dt)) applyContraction3(sim.solver, sim.tendons[k], m.value);
      });
      sim.solver.step(dt, TENTACLE3D.sweeps);
      render();
      setHud((h) => ({ ...h, err: sim.solver.maxError(), zoom: cam.zoom }));
    };

    apiRef.current = {
      step,
      setTarget,
      home: () => {
        sim = createTentacle3();
        muscles.forEach((m) => m.jumpTo(0));
        setTendons([0, 0, 0]);
      },
      viewHome: () => cam.reset(),
      cam,
    };

    // 视角接线（逻辑全在 OrbitCamera）：左键 trackball / 右键平移 / 滚轮缩放
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
      disposed = true;
      apiRef.current = null;
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [spin]);

  useBenchLoop(canvasRef, (dt) => apiRef.current?.step(dt), [spin], active);

  return (
    <div>
      <div className="lab-fig" style={{ aspectRatio: '700/520' }}>
        <canvas ref={canvasRef} width={1400} height={1040} aria-label="立体触手台架；拖拽旋转视角、滑块收缩肌腱" />
        <div className="lab-hud tl">
          <div className="k">Lab.03</div>
          <div>Tendon tentacle · 3D</div>
          <div className="sub">真实扫描网格 · 7 椎节 · WebGL z-buffer</div>
        </div>
        <div className="lab-hud br">
          <div className="num">
            T {tendons.map((v) => `${Math.round(v * 100)}`).join('/')}
          </div>
          <div className="sub">
            {hud.note
              ? hud.note
              : `err ${hud.err.toFixed(2)} px · ×${hud.zoom.toFixed(2)}`}
          </div>
        </div>
        <div className="lab-hud bl">拖拽 = 轨道相机 · 右键平移 · 滚轮缩放</div>
      </div>
      {controls ? (
      <div className="lab-ctl">
          {[0, 1, 2].map((k) => (
            <label key={k}>
              T{k + 1}
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(tendons[k] * 100)}
                onChange={(e) => apiRef.current?.setTarget(k, Number(e.target.value) / 100)}
              />
            </label>
          ))}
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            联动
            {LINK_LABELS.map((lbl, i) => (
              <button
                key={lbl}
                type="button"
                className="lab-btn"
                style={i === link ? { borderColor: 'var(--g400)', color: 'var(--g400)' } : undefined}
                onClick={() => {
                  setLink(i);
                  linkRef.current = i;
                  const pair = PAIRS[i];
                  if (pair) apiRef.current?.setTarget(pair[0], tendons[pair[0]]);
                }}
              >
                {lbl}
              </button>
            ))}
          </span>
          <button
            type="button"
            className="lab-btn"
            onClick={() => [0, 1, 2].forEach((k) => apiRef.current?.setTarget(k, 0))}
          >
            放松
          </button>
          <button type="button" className="lab-btn" onClick={() => apiRef.current?.home()}>
            归位
          </button>
          <button type="button" className="lab-btn" onClick={() => apiRef.current?.viewHome()}>
            视角归位
          </button>
        </div>
  
      ) : null}
    </div>
  );
}
