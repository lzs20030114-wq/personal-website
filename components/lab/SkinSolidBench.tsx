'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed } from '../../src/lib/linkage/gl3d';
import type { Vec3 } from '../../src/lib/linkage/solver3d';
import { SKIN_UNITS, skinSiteOpts } from '../../src/lib/space/skin-data';
import { SOLID, boxVerts, buildSolidTopology, fillSolidVerts } from '../../src/lib/space/skin-solid';
import { SKIN, createSkinUnit, renderSmooth, type SkinUnit } from '../../src/lib/space/skin-unit';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.07 · 项目二第二台：皮肤单元立体带（用户 2026-08-19 立项「也是这四个，
 * 给这个外表皮一些厚度（立体的），加入立体的视角，复用之前用过的」）。
 *
 * 物理与 Lab.06 同一套：四台 2D 剖面引擎（skinSiteOpts 全套站方修正）同步收缩；
 * 本台只做立体呈现——剖面挤出成带（v7 是 2D 剖面模拟，单元在交接件里通篇叫
 * 「带子」）+ 织物真实厚度 + 前后剖口切面；几何烘焙 = src/lib/space/skin-solid
 * （拓扑定死、顶点逐帧填），渲染/相机全部复用既有装备（gl3d FlatRenderer +
 * camera3d OrbitCamera + 视角预设四元数 slerp——RingsBench 同款），装备零改。
 * 定步推进 / 帧间 EMA / 自动重播与 Lab.06 同一套纪律。
 */
const RATE = 110; // 协议步/秒（与 Lab.06 同）
const MAX_STEPS_PER_FRAME = 3;
const REPLAY_HOLD_S = 3.2;
const VIEW_ANIM_S = 0.35;
/** 四单元沿 X 排布的间距与画面枢轴（世界单位 = 2D px 尺度） */
const UNIT_GAP_X = 175;
const PIVOT = { x: 290, y: 168, z: 0 };
const CAM_SCALE = 0.98;
// 条纹双色（2D 目录的 GREEN/PALE 立体化）：A=族系绿、B=灰纱
const DARK_A: [number, number, number] = [0.075, 0.16, 0.12];
const LITE_A: [number, number, number] = [0.42, 0.76, 0.58];
const DARK_B: [number, number, number] = [0.11, 0.12, 0.12];
const LITE_B: [number, number, number] = [0.62, 0.66, 0.63];
const RAIL_DARK: [number, number, number] = [0.08, 0.09, 0.1];
const RAIL_LITE: [number, number, number] = [0.4, 0.43, 0.46];
const C_BOND: [number, number, number] = [0.88, 0.42, 0.24];

type M3 = number[];
type Quat = [number, number, number, number];
const mul3 = (a: M3, b: M3): M3 => {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
};
const rotX3 = (t: number): M3 => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const rotY3 = (t: number): M3 => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const rotZ3 = (t: number): M3 => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

const VIEWS = [
  { key: 'axon', label: '轴测' },
  { key: 'front', label: '正' },
  { key: 'side', label: '侧' },
  { key: 'top', label: '顶' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];
/** 本台世界系：X 右、Y 向下（与屏幕同向）、Z 出屏 ⇒ 正视 = 恒等 */
const AXON_PITCH = -0.34;
const AXON_YAW = -0.62;
const PRESET_VIEWS: Record<ViewKey, M3> = {
  axon: mul3(rotX3(AXON_PITCH), rotY3(AXON_YAW)),
  front: rotZ3(0),
  side: rotY3(-Math.PI / 2 + 0.12),
  top: mul3(rotX3(-Math.PI / 2 + 0.1), rotY3(0)),
};

// 四元数 slerp（RingsBench 同款：矩阵直插会走非刚体路径）
function m2q(m: readonly number[]): Quat {
  const tr = m[0] + m[4] + m[8];
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    return [s / 4, (m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s];
  }
  if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    return [(m[7] - m[5]) / s, s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s];
  }
  if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    return [(m[2] - m[6]) / s, (m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s];
  }
  const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
  return [(m[3] - m[1]) / s, (m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4];
}
function q2m(q: Quat): M3 {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}
function slerpQ(a: Quat, b: Quat, t: number): Quat {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (dot < 0) {
    bb = [-b[0], -b[1], -b[2], -b[3]];
    dot = -dot;
  }
  if (dot > 0.9995) {
    const r: Quat = [
      a[0] + (bb[0] - a[0]) * t,
      a[1] + (bb[1] - a[1]) * t,
      a[2] + (bb[2] - a[2]) * t,
      a[3] + (bb[3] - a[3]) * t,
    ];
    const L = Math.hypot(...r) || 1;
    return [r[0] / L, r[1] / L, r[2] / L, r[3] / L];
  }
  const th = Math.acos(dot);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [
    wa * a[0] + wb * bb[0],
    wa * a[1] + wb * bb[1],
    wa * a[2] + wb * bb[2],
    wa * a[3] + wb * bb[3],
  ];
}

interface SolidUnit {
  sim: SkinUnit;
  offX: number;
  smoothW: number;
  smoothP: number;
  emaX: Float64Array | null;
  emaY: Float64Array | null;
  topo: ReturnType<typeof buildSolidTopology>;
  verts: Float32Array;
}

export function SkinSolidBench({
  active = true,
  onLight = false,
  controls = true,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<{
    step: (dt: number) => void;
    replay: () => void;
    setPersp: (on: boolean) => void;
    viewTo: (k: ViewKey) => void;
    viewHome: () => void;
  } | null>(null);
  const runningRef = useRef(true);
  const speedRef = useRef(1);
  const bondsRef = useRef(true);
  const [running, setRunning] = useState(true);
  const [bonds, setBonds] = useState(true);
  const [persp, setPersp] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<ViewKey>('axon');
  const [hud, setHud] = useState<{ r: number; step: number; locked: number; phase: string; note: string }>({
    r: SKIN.R0,
    step: 0,
    locked: 0,
    phase: '收缩中',
    note: '',
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      runningRef.current = false;
      setRunning(false);
    }

    const cam = new OrbitCamera({
      cx: 350,
      cy: 260,
      pivot: PIVOT,
      scale: CAM_SCALE,
      pitch0: AXON_PITCH,
      yaw0: AXON_YAW,
      zoomMin: 0.5,
      zoomMax: 3,
      autoYaw: 0,
    });

    let renderer: FlatRenderer | null = null;
    try {
      renderer = new FlatRenderer(canvas, 700, 520, 1200);
    } catch (error) {
      setHud((h) => ({
        ...h,
        note: `3D preview unavailable · ${error instanceof Error ? error.message : 'WebGL 不可用'}`,
      }));
      return;
    }
    const R = renderer;

    const units: SolidUnit[] = SKIN_UNITS.map((def, u) => {
      const sim = createSkinUnit(def.spec, skinSiteOpts(def));
      const [smoothW, smoothP] = def.smooth ?? [3, 1];
      return {
        sim,
        offX: u * UNIT_GAP_X,
        smoothW,
        smoothP,
        emaX: null,
        emaY: null,
        topo: buildSolidTopology(sim.n, SKIN.STRIPE),
        verts: new Float32Array(4 * sim.n * 3),
      };
    });

    // 天花板条（静件，随构造一次烘焙上传）
    for (const v of units) {
      const ceil = boxVerts(v.offX + 30, -3, 0, 88, 3, SOLID.DEPTH / 2 + 16);
      R.addMesh(`ceil${v.offX}`, bakeIndexed(ceil.verts, ceil.idx));
    }
    const IDENT = {
      ux: 1, uy: 0, uz: 0,
      ex: 0, ey: 1, ez: 0,
      fx: 0, fy: 0, fz: 1,
      o: { x: 0, y: 0, z: 0 },
    };

    let viewAnim: { q0: Quat; q1: Quat; t: number } | null = null;

    const render = (): void => {
      R.beginFrame(cam);
      for (const v of units) {
        const { sim } = v;
        if (!v.emaX || !v.emaY) {
          v.emaX = Float64Array.from(sim.px);
          v.emaY = Float64Array.from(sim.py);
        }
        const p = renderSmooth(v.emaX, v.emaY, v.smoothW, v.smoothP);
        fillSolidVerts(p.x, p.y, sim.n, v.offX, SOLID.DEPTH, SOLID.THICK, SOLID.SCALE, v.verts);
        R.drawDynamicMesh(bakeIndexed(v.verts, v.topo.idxA), DARK_A, LITE_A);
        R.drawDynamicMesh(bakeIndexed(v.verts, v.topo.idxB), DARK_B, LITE_B);
        // 芯轨（长度随收缩变，逐帧小盒）
        const railLen = sim.coreLen * SOLID.SCALE;
        const rail = boxVerts(v.offX - 3.4, railLen / 2, 0, 2.4, railLen / 2, 6);
        R.drawDynamicMesh(bakeIndexed(rail.verts, rail.idx), RAIL_DARK, RAIL_LITE);
        R.drawMesh(`ceil${v.offX}`, IDENT, RAIL_DARK, RAIL_LITE);
        if (bondsRef.current && sim.locked.length) {
          const hz = SOLID.DEPTH / 2;
          const segs: { a: Vec3; b: Vec3 }[] = [];
          for (const [i, j] of sim.locked) {
            for (const z of [hz, -hz]) {
              segs.push({
                a: { x: v.offX + p.x[i] * SOLID.SCALE, y: -p.y[i] * SOLID.SCALE, z },
                b: { x: v.offX + p.x[j] * SOLID.SCALE, y: -p.y[j] * SOLID.SCALE, z },
              });
            }
          }
          R.drawLines(segs, C_BOND, 0.004);
        }
      }
    };

    let acc = 0;
    let holdT = 0;
    let lastHud = '';
    const replay = (): void => {
      units.forEach((v, u) => {
        v.sim = createSkinUnit(SKIN_UNITS[u].spec, skinSiteOpts(SKIN_UNITS[u]));
        v.emaX = null;
        v.emaY = null;
      });
      acc = 0;
      holdT = 0;
    };

    const step = (dt: number): void => {
      if (viewAnim) {
        viewAnim.t = Math.min(1, viewAnim.t + dt / VIEW_ANIM_S);
        const e = viewAnim.t < 0.5 ? 2 * viewAnim.t ** 2 : 1 - (-2 * viewAnim.t + 2) ** 2 / 2;
        cam.setOrientation(q2m(slerpQ(viewAnim.q0, viewAnim.q1, e)));
        if (viewAnim.t >= 1) viewAnim = null;
      } else {
        cam.tick(dt);
      }
      const lead = units[0].sim;
      let n = 0;
      if (runningRef.current && !lead.done) {
        acc += dt * RATE * speedRef.current;
        n = Math.floor(acc);
        if (n > MAX_STEPS_PER_FRAME) {
          n = MAX_STEPS_PER_FRAME;
          acc = 0; // 追不上就放慢（定步：轨迹不变），不留追赶债
        } else {
          acc -= n;
        }
        for (let k = 0; k < n; k++) for (const v of units) v.sim.advance();
      } else if (runningRef.current && lead.done) {
        holdT += dt;
        if (holdT >= REPLAY_HOLD_S) replay();
      }
      // 帧间 EMA（Lab.06 同款纪律：物理不动，只平滑画面时间轴）
      if (n > 0) {
        const a = 1 - Math.pow(0.45, n / 20);
        for (const v of units) {
          if (!v.emaX || !v.emaY) continue;
          for (let i = 0; i < v.sim.n; i++) {
            v.emaX[i] += a * (v.sim.px[i] - v.emaX[i]);
            v.emaY[i] += a * (v.sim.py[i] - v.emaY[i]);
          }
        }
      }
      render();
      const locked = units.reduce((s, v) => s + v.sim.locked.length, 0);
      const phase = lead.done ? '锁定 · 即将重播' : lead.step < 900 ? '收缩中' : '张紧 · 排泡';
      const key = `${lead.step}|${locked}|${phase}`;
      if (key !== lastHud) {
        lastHud = key;
        setHud((h) => ({ ...h, r: units[units.length - 1].sim.r, step: lead.step, locked, phase }));
      }
    };

    apiRef.current = {
      step,
      replay: () => {
        replay();
        render();
      },
      setPersp: (on) => R.setPerspective(on ? 900 : 0),
      viewTo: (k) => {
        const target = PRESET_VIEWS[k];
        if (reduced) {
          viewAnim = null;
          cam.setOrientation(target);
          render();
          return;
        }
        viewAnim = { q0: m2q(cam.matrix), q1: m2q(target), t: 0 };
      },
      viewHome: () => {
        viewAnim = null;
        cam.reset();
        render();
      },
    };

    const onCtx = (ev: Event): void => ev.preventDefault();
    const onDown = (ev: PointerEvent): void => {
      viewAnim = null;
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
  }, []);

  useBenchLoop(canvasRef, (dt) => apiRef.current?.step(dt), [], active);

  const goView = useCallback((k: ViewKey) => {
    setView(k);
    apiRef.current?.viewTo(k);
  }, []);

  return (
    <div className={`lab-wrap${onLight ? ' on-light' : ''}`}>
      <div className="lab-fig">
        <canvas
          ref={canvasRef}
          width={1400}
          height={1040}
          aria-label="皮肤单元立体带：四个键谱的剖面挤出成有厚度的织物带，可拖拽旋转"
        />
        <div className="lab-hud tl">
          <div style={{ color: 'var(--accent-2)' }}>Lab.07 / Project II</div>
          <div>皮肤单元 · 立体带</div>
          <div className="dim">剖面挤出 · 织物厚度 {SOLID.THICK}px · 同一收缩协议</div>
        </div>
        <div className="lab-hud br">
          <div className="num">r {hud.r.toFixed(2)}</div>
          <div className="dim">
            step {hud.step}/{SKIN.STEPS} · 键 {hud.locked} · {hud.phase}
          </div>
        </div>
        <div className="lab-hud bl dim">
          {hud.note || '拖拽旋转 · 右键平移 · 滚轮缩放'}
        </div>
      </div>
      {controls ? (
        <div className="lab-ctl">
          <div className="grp">
            <label>
              <input
                type="checkbox"
                checked={running}
                onChange={(e) => {
                  runningRef.current = e.target.checked;
                  setRunning(e.target.checked);
                }}
              />
              运转
            </label>
            <label>
              <input
                type="checkbox"
                checked={bonds}
                onChange={(e) => {
                  bondsRef.current = e.target.checked;
                  setBonds(e.target.checked);
                }}
              />
              键线
            </label>
            <label>
              <input
                type="checkbox"
                checked={persp}
                onChange={(e) => {
                  setPersp(e.target.checked);
                  apiRef.current?.setPersp(e.target.checked);
                }}
              />
              透视
            </label>
          </div>
          <div className="grp">
            <button type="button" onClick={() => {
              apiRef.current?.replay();
              runningRef.current = true;
              setRunning(true);
            }}>
              重播
            </button>
          </div>
          <div className="grp">
            <span className="k">速度</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={speed}
              aria-label="播放速度（协议步/秒的倍率，不是物理量）"
              style={{ width: 96 }}
              onChange={(e) => {
                const v = Number(e.target.value);
                speedRef.current = v;
                setSpeed(v);
              }}
            />
          </div>
          <div className="grp">
            <span className="k">视角</span>
            <span className="seg">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className={v.key === view ? 'active' : undefined}
                  onClick={() => goView(v.key)}
                >
                  {v.label}
                </button>
              ))}
            </span>
            <button type="button" onClick={() => apiRef.current?.viewHome()}>
              归位
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
