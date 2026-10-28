'use client';

import { useBenchLang, useLabText } from './LabLanguage';

import { LabControlLabel } from './LabControlLabel';

import { useEffect, useRef, useState } from 'react';
import {
  ROOTB3,
  SPINE3,
  TENTACLE3D,
  applyContraction3,
  createTentacle3,
  tendonVisual3,
} from '../../src/lib/linkage/tentacle3d-data';
import { CHAINS, MESH_GROUPS, STATIONS } from '../../src/lib/linkage/tentacle3d-shape';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer, type CellFrame } from '../../src/lib/linkage/gl3d';
import { loadTentacleMeshes, tentacleCellFrame } from '../../src/lib/linkage/tentacle3d-render';
import { CriticallyDamped } from '../../src/lib/linkage/motion';
import { useBenchLoop } from './useBenchLoop';
import { attachLabCamera } from './labCameraInput';

/**
 * Lab.03 立体触手台架（暗色 HUD 版）。几何/装备与 src/demo/tentacle3d.ts 同源：
 * 真实扫描网格（10.7 万三角，public/mesh/tentacle3d-mesh.bin，prebuild 复制）+
 * 零依赖裸 WebGL z-buffer 精确遮挡 + trackball 相机。
 * ★ 设计稿因无法导入 .bin 而用程序化方盒替代；本站用真实形态（用户拍板 2026-07-27）。
 * 内核（solver3d）与装备（gl3d/camera3d）零改——加新机构 = 新实例 + 台架，不改装备。
 */
// 暗底线色：脊柱冷灰，三腱 绿 / 紫 / 中灰（与站内暗色语言同族）
const SPINE_C: [number, number, number] = [0.44, 0.47, 0.5];
const TENDON_C: [number, number, number][] = [
  [0.62, 0.82, 0.58],
  [0.76, 0.7, 0.92],
  [0.72, 0.74, 0.7],
];
const PAIRS: ([number, number] | null)[] = [null, [0, 1], [1, 2], [0, 2]];
const LINK_LABELS = ['无', '1+2', '2+3', '1+3'];
// 滑块拇指色 = 该腱线色（稿内：绿 / 中性 / 紫）
const TENDON_UI = ['var(--accent)', 'color-mix(in srgb, var(--ink) 80%, transparent)', 'var(--accent-2)'];

/**
 * HUD 双语（2026-09-13 加，案例页正文要嵌这台）：/lab 说中文（默认），
 * 案例页里的活件跟着页面的中英切换走。控制条只在 /lab 出现（案例页 controls={false}），
 * 故只有 HUD 读数两份。
 */
const COPY = {
  zh: {
    aria: '立体触手台架；拖拽旋转视角、滑块收缩肌腱',
    title: '立体肌腱触手',
    sub: '7 方盒椎节 · 3 腱 @120° · 真实扫描网格 10.7 万三角',
    foot: '拖拽旋转 · 右键平移',
  },
  en: {
    aria: 'Three-tendon tentacle bench; drag to orbit, use the sliders to contract each tendon',
    title: 'Three-tendon tentacle',
    sub: '7 box vertebrae · 3 tendons at 120° · scanned mesh, 107k triangles',
    foot: 'Drag to orbit · right-drag to pan · scroll to zoom',
  },
} as const;

export function TentacleBench({
  spin = true,
  active = true,
  controls = true,
  onLight = false,
  lang: explicitLang,
}: {
  spin?: boolean;
  active?: boolean;
  /** false = 纯展示（主页舞台用）：不出控制条 */
  controls?: boolean;
  /** 界面语言：'zh' = /lab；'en' = 英文案例页正文 */
  lang?: 'en' | 'zh';
  /** true = 置于浅色页（主页舞台）：自带深底与深色 token */
  onLight?: boolean;
}) {
  const lang = useBenchLang(explicitLang);
  const tx = useLabText(lang);
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
    // 慢转默认开（2026-10-26 用户拍板：Lab 默认勾选运转，不随「减弱动态效果」关掉，MAPPING §68）

    const cam = new OrbitCamera({
      cx: 380,
      cy: 250,
      pivot: { x: 0, y: 179, z: 0 },
      scale: 1.1,
      yaw0: 0,
      pitch0: 0,
      roll0: -Math.PI / 2, // 正侧视：基座在左、臂指右（用户拍板 2026-07-10）
      autoYaw: spin ? 0.15 : 0,
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
      // 主页预览层据此等网格真正载入再交叉淡化（ZonePage PreviewLayer）
      canvas.dataset.benchLoading = 'mesh';
      loadTentacleMeshes()
        .then((meshes) => {
          if (disposed) return;
          for (const mesh of meshes) {
            if (mesh.skinned) active.addSkinnedMesh(mesh.name, mesh.data);
            else active.addMesh(mesh.name, mesh.data);
          }
          delete canvas.dataset.benchLoading;
        })
        .catch((error: unknown) => {
          delete canvas.dataset.benchLoading;
          if (disposed) return;
          renderError = error instanceof Error ? error.message : '3D mesh 载入失败';
          setHud((h) => ({ ...h, note: `mesh incomplete · ${renderError}` }));
        });
    }

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
      const cells = Array.from({ length: N + 1 }, (_, i) => tentacleCellFrame(nodes, i));
      for (let ci = 0; ci <= N; ci++) renderer.drawMesh(`c${ci}`, cells[ci]);
      renderer.drawMesh('mnt', MNT_FRAME);
      for (const j of joints) {
        if (j.gap < 0) renderer.drawSkinned(j.name, ROOT_FRAME, cells[0], ROOT_DY);
        else {
          const dy = STATIONS[j.gap + 1][1] - STATIONS[j.gap][1];
          renderer.drawSkinned(j.name, cells[j.gap], cells[j.gap + 1], dy);
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
      const err = sim.solver.maxError();
      const zoom = cam.zoom;
      setHud((h) => h.err.toFixed(2) === err.toFixed(2) && h.zoom.toFixed(2) === zoom.toFixed(2)
        ? h : { ...h, err, zoom });
    };

    apiRef.current = {
      step,
      setTarget,
      // 重置：硬复位——重建实例（笔直、零速度）、肌肉清零、视角回开场机位。
      // 联动档在按钮那边一起清（它是 React 状态，不在这个闭包里）
      home: () => {
        sim = createTentacle3();
        muscles.forEach((m) => m.jumpTo(0));
        setTendons([0, 0, 0]);
        cam.reset();
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
    const detachCamera = attachLabCamera(canvas, { wheel: delta => cam.wheel(delta), home: () => apiRef.current?.viewHome() });
    canvas.addEventListener('contextmenu', onCtx);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    render();
    return () => {
      disposed = true;
      apiRef.current = null;
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      detachCamera();
    };
  }, [spin]);

  useBenchLoop(canvasRef, (dt) => apiRef.current?.step(dt), [spin], active);

  return (
    <div className={`lab-wrap${onLight ? ' on-light' : ''}`}>
      <div className="lab-fig">
        <canvas ref={canvasRef} width={1400} height={1040} aria-label={COPY[lang].aria} />
        <div className="lab-hud tl">
          <div style={{ color: 'var(--accent-2)' }}>{tx("Lab 1-3")}</div>
          <div>{tx(COPY[lang].title)}</div>
          <div className="dim">{COPY[lang].sub}</div>
        </div>
        <div className="lab-hud br">
          <div className="num">{tx("T")} {tendons.map((v) => Math.round(v * 100)).join(' / ')} %</div>
          <div className="dim">
            {hud.note ? tx('3D preview unavailable') : `${tx('err')} ${hud.err.toFixed(2)} px · ×${hud.zoom.toFixed(2)}`}
          </div>
        </div>
        <div className="lab-hud bl dim">{COPY[lang].foot}</div>
      </div>
      {controls ? (
        <div className="lab-ctl">
          <div className="grp">
            <LabControlLabel help={["分别调整三条肌腱的收缩量，改变触手弯向。", "Adjust three tendon contractions to bend the arm."]} lang={lang}>{tx("肌腱")}</LabControlLabel>
            {[0, 1, 2].map((k) => (
              <label key={k}>
                {k + 1}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(tendons[k] * 100)}
                  style={{ accentColor: TENDON_UI[k] }}
                  onChange={(e) => apiRef.current?.setTarget(k, Number(e.target.value) / 100)}
                />
              </label>
            ))}
          </div>
          <div className="grp">
            <LabControlLabel help={["让选定的两条肌腱一起收缩。", "Contract the selected pair of tendons together."]} lang={lang}>{tx("联动")}</LabControlLabel>
            <span className="seg">
              {LINK_LABELS.map((lbl, i) => (
                <button
                  key={tx(lbl)}
                  type="button"
                  className={i === link ? 'active' : undefined}
                  onClick={() => {
                    setLink(i);
                    linkRef.current = i;
                    const pair = PAIRS[i];
                    if (pair) apiRef.current?.setTarget(pair[0], tendons[pair[0]]);
                  }}
                >
                  {tx(lbl)}
                </button>
              ))}
            </span>
          </div>
          <div className="grp">
            <button
              type="button"
              onClick={() => [0, 1, 2].forEach((k) => apiRef.current?.setTarget(k, 0))}
            >
              {tx("放松")}
            </button>
            {/* 「重置」= 整台复位：重建触手（笔直、零速度）、肌腱与联动清零、机位回开场。
                原写「归位」（与底栏相机「归位」同名、英文还被译成 Reset view），10-25 改「重来」，
                10-28 与其余连杆台架统一叫「重置」；相机归位只在底栏一处 */}
            <button
              type="button"
              onClick={() => {
                setLink(0);
                linkRef.current = 0;
                apiRef.current?.home();
              }}
            >
              {tx("重置")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
