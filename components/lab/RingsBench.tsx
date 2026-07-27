'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed } from '../../src/lib/linkage/gl3d';
import type { Vec3 } from '../../src/lib/linkage/solver3d';
import {
  SHELL_OMEGA,
  SHELL_STEP_DT,
  SHELL_THETA0,
  createShell,
  ringOuterProfile,
  ringPoint,
  shellMaxError,
  stepRing,
} from '../../src/lib/linkage/shell3d';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.04 五环立体台架（Lab-Modernist 稿暗色版，逐项对稿）。
 * 几何/装备与 src/demo/shell3d.ts 同源：五个 2D 环实例定步推进（同相呼吸，1/120 定步——
 * 跨设备一致）+ 刚体位姿嵌入 3D + 织物蒙皮（相邻环外侧支点等弧长重采样成直纹带）+
 * 视角预设四元数 slerp。
 * 视觉按稿：族系配色 S1 绿 → S3 中性 → S5 紫（线色承载环身份）、烟灰蒙皮压暗让线稿透出、
 * 关节点径随环递增、销点绿、轮毂点取环色。
 * 装备零改（gl3d 只加了 drawDynamicMesh 的可选明暗端色，加法式扩展、不传即旧行为）。
 */
const SKIN_SAMPLES = 25;
const HUB_R = 4;
const CHASE_OMEGA = 2.5;
const VIEW_ANIM_S = 0.35;
// 族系配色（稿内字面值）：S1 绿 → S3 中性 → S5 紫
const COLS: [number, number, number][] = [
  [0.55, 0.78, 0.52],
  [0.7, 0.84, 0.64],
  [0.88, 0.9, 0.84],
  [0.8, 0.76, 0.92],
  [0.7, 0.62, 0.94],
];
const C_DIM: [number, number, number] = [0.44, 0.47, 0.5];
const C_GRN: [number, number, number] = [0.62, 0.82, 0.58];
// 烟灰织物：压暗蒙皮，彩色线稿才透得出来（稿内字面值）
const SKIN_DARK: [number, number, number] = [0.08, 0.1, 0.13];
const SKIN_LITE: [number, number, number] = [0.52, 0.56, 0.6];

const VIEWS = [
  { key: 'axon', label: '轴测' },
  { key: 'front', label: '正' },
  { key: 'left', label: '左' },
  { key: 'right', label: '右' },
  { key: 'top', label: '顶' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

type M3 = number[];
type Quat = [number, number, number, number]; // w,x,y,z
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
const VIEW_FRONT = rotX3(Math.PI / 2);
const PRESET_VIEWS: Record<ViewKey, M3> = {
  axon: mul3(rotZ3(-1.053336), mul3(rotX3(0.735843), rotY3(0.867459))),
  front: VIEW_FRONT,
  left: mul3(VIEW_FRONT, rotZ3(-Math.PI / 2)),
  right: mul3(VIEW_FRONT, rotZ3(Math.PI / 2)),
  top: rotZ3(0),
};

// 四元数 slerp（照搬 src/demo/shell3d.ts：矩阵直插会走非刚体路径）
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
  let w0: number;
  let w1: number;
  if (dot > 0.9995) {
    w0 = 1 - t;
    w1 = t;
  } else {
    const th = Math.acos(Math.min(1, dot));
    const s = Math.sin(th);
    w0 = Math.sin((1 - t) * th) / s;
    w1 = Math.sin(t * th) / s;
  }
  const q: Quat = [
    w0 * a[0] + w1 * bb[0],
    w0 * a[1] + w1 * bb[1],
    w0 * a[2] + w1 * bb[2],
    w0 * a[3] + w1 * bb[3],
  ];
  const n = Math.hypot(...q) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

const wrapAngle = (a: number): number => ((a + Math.PI) % (2 * Math.PI)) - Math.PI;

const SKIN_IDX = (() => {
  const idx: number[] = [];
  for (let k = 0; k < SKIN_SAMPLES - 1; k++) {
    const a = k;
    const b = SKIN_SAMPLES + k;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return new Uint16Array(idx);
})();

/** 折线按弧长等距重采样到 n 点（照搬 src/demo/shell3d.ts） */
function resample(pts: Vec3[], n: number): Vec3[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(
      cum[i - 1] +
        Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z),
    );
  }
  const total = cum[cum.length - 1] || 1;
  const out: Vec3[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * total;
    while (seg < pts.length - 2 && cum[seg + 1] < t) seg++;
    const span = cum[seg + 1] - cum[seg] || 1;
    const u = Math.min(1, Math.max(0, (t - cum[seg]) / span));
    out.push({
      x: pts[seg].x + (pts[seg + 1].x - pts[seg].x) * u,
      y: pts[seg].y + (pts[seg + 1].y - pts[seg].y) * u,
      z: pts[seg].z + (pts[seg + 1].z - pts[seg].z) * u,
    });
  }
  return out;
}

export function RingsBench({
  spin = true,
  active = true,
  controls = true,
  onLight = false,
}: {
  spin?: boolean;
  active?: boolean;
  /** false = 纯展示（主页舞台/项目预览用）：不出控制条 */
  controls?: boolean;
  /** true = 置于浅色页（主页舞台）：自带深底与深色 token */
  onLight?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<{
    step: (dt: number) => void;
    setPhase: (deg: number) => void;
    setBreathe: (on: boolean) => void;
    setSkin: (on: boolean) => void;
    setPersp: (on: boolean) => void;
    viewTo: (k: ViewKey) => void;
    viewHome: () => void;
  } | null>(null);
  const [breathe, setBreathe] = useState(spin);
  const [skin, setSkin] = useState(true);
  const [persp, setPersp] = useState(false);
  const [view, setView] = useState<ViewKey>('axon');
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
    const R = renderer;

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

    // 蒙皮：各环外侧支点（装配位选定后固定跟销），随环呼吸
    const profiles = rings.map((r) => ringOuterProfile(r.data));
    const profileWorld = (ri: number): Vec3[] =>
      profiles[ri].map((j) => {
        const n = rings[ri].solver.nodes[j];
        return ringPoint(rings[ri].data, n.x, n.y);
      });
    const skinMesh = (ri: number): Float32Array => {
      const A = resample(profileWorld(ri), SKIN_SAMPLES);
      const B = resample(profileWorld(ri + 1), SKIN_SAMPLES);
      const verts = new Float32Array(SKIN_SAMPLES * 2 * 3);
      let k = 0;
      for (const p of A) {
        verts[k++] = p.x;
        verts[k++] = p.y;
        verts[k++] = p.z;
      }
      for (const p of B) {
        verts[k++] = p.x;
        verts[k++] = p.y;
        verts[k++] = p.z;
      }
      return bakeIndexed(verts, SKIN_IDX);
    };

    let theta = SHELL_THETA0;
    let targetTheta = theta;
    let breathing = spin && !reduced;
    let skinOn = true;
    let viewAnim: { q0: Quat; q1: Quat; t: number } | null = null;
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

    const render = (): void => {
      R.beginFrame(cam);
      // 烟灰织物先画（压暗），彩色线稿画其上
      if (skinOn) {
        for (let ri = 0; ri < rings.length - 1; ri++) {
          R.drawDynamicMesh(skinMesh(ri), SKIN_DARK, SKIN_LITE);
        }
      }
      R.drawLines(decorSegs, C_DIM, 0.002);
      rings.forEach((r, ri) => {
        const d = r.data;
        const col = COLS[ri];
        const segs: { a: Vec3; b: Vec3 }[] = [];
        for (const [ja, jb, jc] of d.tris) {
          const a = r.solver.nodes[ja];
          const b = r.solver.nodes[jb];
          const c = r.solver.nodes[jc];
          const aw = ringPoint(d, a.x, a.y);
          const bw = ringPoint(d, b.x, b.y);
          const cw = ringPoint(d, c.x, c.y);
          segs.push({ a: aw, b: bw }, { a: bw, b: cw }, { a: cw, b: aw });
        }
        const pin = r.solver.nodes[d.pin];
        const apex = r.solver.nodes[d.apex];
        segs.push({ a: ringPoint(d, 0, 0), b: ringPoint(d, pin.x, pin.y) });
        segs.push({ a: ringPoint(d, pin.x, pin.y), b: ringPoint(d, apex.x, apex.y) });
        R.drawLines(segs, col);
        const jointPts: Vec3[] = [];
        for (let j = 0; j <= d.pin; j++) {
          const n = r.solver.nodes[j];
          jointPts.push(ringPoint(d, n.x, n.y));
        }
        R.drawDots(jointPts, 2.0 + ri * 0.22, col);
        R.drawDots([ringPoint(d, pin.x, pin.y)], 3.4, C_GRN, 0.007);
        R.drawDots([ringPoint(d, 0, 0)], HUB_R, col, 0.007);
      });
    };

    let acc = 0;
    const step = (dt: number): void => {
      if (viewAnim) {
        viewAnim.t = Math.min(1, viewAnim.t + dt / VIEW_ANIM_S);
        const e = viewAnim.t < 0.5 ? 2 * viewAnim.t ** 2 : 1 - (-2 * viewAnim.t + 2) ** 2 / 2;
        cam.setOrientation(q2m(slerpQ(viewAnim.q0, viewAnim.q1, e)));
        if (viewAnim.t >= 1) viewAnim = null;
      } else {
        cam.tick(dt);
      }
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
      setSkin: (on) => {
        skinOn = on;
      },
      setPersp: (on) => R.setPerspective(on ? 700 : 0),
      viewTo: (k) => {
        const target = PRESET_VIEWS[k];
        if (reduced) {
          viewAnim = null;
          cam.setOrientation(target);
          return;
        }
        viewAnim = { q0: m2q(cam.matrix), q1: m2q(target), t: 0 };
      },
      viewHome: () => {
        viewAnim = null;
        cam.reset();
      },
    };

    const onCtx = (ev: Event): void => ev.preventDefault();
    const onDown = (ev: PointerEvent): void => {
      viewAnim = null; // 拖拽打断视角切换动画
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

  useBenchLoop(canvasRef, (dt) => apiRef.current?.step(dt), [spin], active);

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
          aria-label="五环立体编排台架；拖拽旋转，呼吸/相位驱动"
        />
        <div className="lab-hud tl">
          <div style={{ color: 'var(--p300)' }}>Lab.04 / Fig. 13</div>
          <div>S1–S5 伏丘壳体</div>
          <div className="dim">85 mm 等距 · 同相呼吸 · 槽端逐环标定 [0/2/4/8]</div>
        </div>
        <div className="lab-hud br">
          <div className="num">φ {phase.toFixed(1)}°</div>
          <div className="dim">
            {hud.note
              ? hud.note
              : `apex(S2) ${hud.apex.toFixed(1)} mm · err ${hud.err.toFixed(2)} · ${breathe ? 'spin' : 'slider'}`}
          </div>
        </div>
        <div className="lab-hud bl dim">拖拽旋转 · 右键平移 · 滚轮缩放</div>
      </div>
      {controls ? (
        <div className="lab-ctl">
          <div className="grp">
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
            <label>
              <input
                type="checkbox"
                checked={skin}
                onChange={(e) => {
                  setSkin(e.target.checked);
                  apiRef.current?.setSkin(e.target.checked);
                }}
              />
              蒙皮
            </label>
          </div>
          <div className="grp">
            <span className="k">相位</span>
            <input
              type="range"
              min={0}
              max={360}
              step={0.5}
              value={phase}
              style={{ width: 132 }}
              onChange={(e) => {
                const v = Number(e.target.value);
                setBreathe(false);
                setPhase(v);
                apiRef.current?.setPhase(v);
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
