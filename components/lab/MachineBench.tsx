'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed } from '../../src/lib/linkage/gl3d';
import {
  MACHINE_GROUPS,
  MACHINE_MESH_URL,
  MACHINE_DIR,
  MACHINE_OMEGA,
  MACHINE_SWEEP,
  type MachinePartKind,
  apexHeight,
  clampTheta,
  createMachine,
  isFolding,
  machineFrame,
  machineMaxError,
  phaseDeg,
  runMachine,
  stepMachine,
  thetaAtStroke,
  visibleGroups,
} from '../../src/lib/linkage/machine';
import { SHELL_STEP_DT } from '../../src/lib/linkage/shell3d';
import { setSnapshot } from './snapshot';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.05 整机台架（spec = 轮回机器_整机spec.md，用户 2026-07-29 拍板「整机传动 + 真实实体」）。
 *
 * 与 Lab.04 的分工：Lab.04 看单个壳体五环怎么折叠（线稿 + 可调遮罩织纹）；
 * 这里看**整台机器怎么被一台电机驱动**——一根中间轴带五个不同半径的曲柄（同相），
 * 五根不同长度的连杆推五个环的拱顶，全机只有一个自由度。
 *
 * 形体是真机实体（729新参考.3dm 装配位逐面取网格，11.4 万三角）：66 块角化板各自绑
 * 自己的三角、3 件配件跟销、5 个单杆轮随 θ 转、5 根驱动杆由两点定位姿；机架与三条
 * 触手烘死为静件。分组与绑定见 machine-shape.ts，位姿计算在 machine.ts（可单测，
 * 与渲染无关）。
 *
 * 运动学一行没新写——五环销坐标与 shell3d-data 逐位相同，直接复用其解算与止程标定。
 *
 * 规格表须写明的三条局限（spec §7）：转速非真机节律（减速比无出处）、触手是静态
 * 形体不参与运动、脚槽止程是仿真标定值非真机实测。
 */

const VIEWS = [
  { key: 'axon', label: '轴测' },
  { key: 'front', label: '正' },
  { key: 'left', label: '左' },
  { key: 'right', label: '右' },
  { key: 'top', label: '顶' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

// 族系配色与 Lab.04 同一套（S1 绿 → S5 紫），保证两台之间环的身份读得通
const COLS: [number, number, number][] = [
  [0.55, 0.78, 0.52],
  [0.7, 0.84, 0.64],
  [0.88, 0.9, 0.84],
  [0.8, 0.76, 0.92],
  [0.7, 0.62, 0.94],
];
/** 实体件的明暗端色：比 Lab.04 的遮罩亮得多——那是要透光的纱，这是要看清的零件。 */
const shade = (c: [number, number, number]): { dark: [number, number, number]; lite: [number, number, number] } => ({
  dark: [c[0] * 0.16, c[1] * 0.16, c[2] * 0.16],
  lite: [c[0] * 0.86, c[1] * 0.86, c[2] * 0.86],
});
/** 机架：中性钢色，压暗让五环的彩色浮出来 */
const FRAME_SHADE = { dark: [0.1, 0.11, 0.12], lite: [0.5, 0.53, 0.56] } as const;
/** 触手：静件且不参与运动，再压一档，避免抢主体 */
const TENT_SHADE = { dark: [0.09, 0.09, 0.1], lite: [0.38, 0.38, 0.42] } as const;

const CHASE_OMEGA = 2.5;
const VIEW_ANIM_S = 0.35;

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
const VIEW_FRONT = rotX3(Math.PI / 2);
const PRESET_VIEWS: Record<ViewKey, M3> = {
  axon: mul3(rotZ3(-1.053336), mul3(rotX3(0.735843), rotY3(0.867459))),
  front: VIEW_FRONT,
  left: mul3(VIEW_FRONT, rotZ3(-Math.PI / 2)),
  right: mul3(VIEW_FRONT, rotZ3(Math.PI / 2)),
  top: rotZ3(0),
};

// 四元数 slerp（照搬 RingsBench：矩阵直插会走非刚体路径）
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

/** 组名 → 明暗端色（环件取族系色，静件取中性） */
function groupShade(name: string): { dark: [number, number, number]; lite: [number, number, number] } {
  if ('pxwr'.includes(name[0])) {
    const ri = Number(name[1]);
    if (Number.isInteger(ri) && ri >= 0 && ri < COLS.length) return shade(COLS[ri]);
  }
  if (name === 'tentacle') return { dark: [...TENT_SHADE.dark], lite: [...TENT_SHADE.lite] };
  return { dark: [...FRAME_SHADE.dark], lite: [...FRAME_SHADE.lite] };
}

/** 转速滑块范围（rad/s）。默认沿用 shell3d 的 0.8——**不是真机节律**，
 *  减速比图上没标（spec §7 第一条局限）。给滑块正是为了让用户自己找手感值。 */
const OMEGA_MIN = 0.1;
const OMEGA_MAX = 2.4;

/** 相位滑块上限 = 往复行程 180°（不是 360——中间轴不整周转） */
const PHASE_MAX = Math.round((MACHINE_SWEEP * 180) / Math.PI);

const PARTS: ReadonlyArray<MachinePartKind> = ['rings', 'drive', 'frame', 'tentacle'];
/** 环选择器：null = 全部 */
const RING_KEYS = [null, 0, 1, 2, 3, 4] as const;

const COPY = {
  zh: {
    run: '运转',
    persp: '透视',
    speed: '转速',
    speedAria: '转速（非真机节律，减速比无出处）',
    phase: '相位',
    parts: '部件',
    partNames: { rings: '环身', drive: '传动', frame: '机架', tentacle: '触手' },
    ring: '单环',
    ringAll: '全部',
    view: '视角',
    reset: '归位',
    views: { axon: '轴测', front: '正', left: '左', right: '右', top: '顶' },
    title: '整机传动',
    sub: '一轴五曲柄 · 同相 · 180° 往复张合',
    hint: '拖拽旋转 · 右键平移 · 滚轮缩放',
    drive: { spin: '自转', slider: '滑杆' },
    // 方向指示用盘点 §6 的既有口径：φ=0 伸展死点 / φ=180 折叠死点
    going: { fold: '折叠 ↓', open: '伸展 ↑' },
    aria: '轮回机器整机台架；拖拽旋转，曲柄角驱动',
    loading: '载入实体…',
  },
  en: {
    run: 'Run',
    persp: 'Perspective',
    speed: 'Speed',
    speedAria: 'Speed (not the hardware cadence — gear ratio unknown)',
    phase: 'Phase',
    parts: 'Parts',
    partNames: { rings: 'Rings', drive: 'Drive', frame: 'Frame', tentacle: 'Arms' },
    ring: 'Ring',
    ringAll: 'All',
    view: 'View',
    reset: 'Reset',
    views: { axon: 'Axon', front: 'Front', left: 'Left', right: 'Right', top: 'Top' },
    title: 'Full transmission',
    sub: 'One shaft, five cranks · in phase · 180° reciprocating',
    hint: 'Drag to orbit · right-drag to pan · scroll to zoom',
    drive: { spin: 'spin', slider: 'slider' },
    going: { fold: 'folding ↓', open: 'extending ↑' },
    aria: 'Reincarnation machine full-assembly bench; drag to orbit, crank-angle driven',
    loading: 'loading solids…',
  },
} as const;

export function MachineBench({
  spin = true,
  active = true,
  controls = true,
  onLight = false,
  sideControls = false,
  ptTarget = false,
  lang = 'zh',
}: {
  spin?: boolean;
  active?: boolean;
  controls?: boolean;
  onLight?: boolean;
  sideControls?: boolean;
  ptTarget?: boolean;
  lang?: 'zh' | 'en';
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<{
    step: (dt: number) => void;
    setPhase: (deg: number) => void;
    setRun: (on: boolean) => void;
    setOmega: (w: number) => void;
    setPersp: (on: boolean) => void;
    setShow: (s: Record<MachinePartKind, boolean>) => void;
    setIsolate: (ri: number | null) => void;
    viewTo: (k: ViewKey) => void;
    viewHome: () => void;
  } | null>(null);
  const [run, setRun] = useState(spin);
  const [persp, setPersp] = useState(false);
  const [omega, setOmega] = useState(MACHINE_OMEGA);
  const [view, setView] = useState<ViewKey>('axon');
  const [phase, setPhase] = useState(0);
  const [show, setShow] = useState<Record<MachinePartKind, boolean>>({
    rings: true,
    drive: true,
    frame: true,
    tentacle: true,
  });
  const [isolate, setIsolate] = useState<number | null>(null);
  const [hud, setHud] = useState({ err: 0, apex: 0, ring: 2, folding: true, note: '' });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const machine = createMachine();

    // 开场机位：朝向与 Lab.04 同（两台并读时视角一致），但**框的是整台机器**。
    // 整机世界占位 x[−581,192] · z[−153,226]——大触手从 S1 端伸出约 400mm 且整条
    // 挂在底盘下方（图纸原位，非错位）。只框环身的话，触手会在画幅边缘露出一截，
    // 读成碎片；既然这台的题目是「还原真实形态」，就该把它整个收进来。
    // 代价是环身只占画幅约四成——枢轴向机器本体偏了一些作折中。
    // 三个数都是手感常量，待用户真机拍板（spec M4）。
    const cam = new OrbitCamera({
      cx: 350,
      cy: 280,
      pivot: { x: -150, y: 0, z: 40 },
      scale: 0.78,
      roll0: -1.053336,
      pitch0: 0.735843,
      yaw0: 0.867459,
      zoomMin: 0.3,
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

    // 实体载荷异步载入；未到之前画面是空的，HUD 出「载入实体…」
    let ready = false;
    let disposed = false;
    fetch(MACHINE_MESH_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`mesh 请求失败（HTTP ${res.status}）`);
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (disposed) return;
        const need = Math.max(
          ...MACHINE_GROUPS.flatMap((g) => [
            g.vOff + g.verts * 3 * Float32Array.BYTES_PER_ELEMENT,
            g.iOff +
              g.tris * 3 * (g.idx32 ? Uint32Array.BYTES_PER_ELEMENT : Uint16Array.BYTES_PER_ELEMENT),
          ]),
        );
        if (buf.byteLength < need) {
          throw new Error(`mesh 数据不完整（${buf.byteLength}/${need} bytes）`);
        }
        for (const g of MACHINE_GROUPS) {
          const verts = new Float32Array(buf, g.vOff, g.verts * 3);
          const idx = g.idx32
            ? new Uint32Array(buf, g.iOff, g.tris * 3)
            : new Uint16Array(buf, g.iOff, g.tris * 3);
          R.addMesh(g.name, bakeIndexed(verts, idx));
        }
        ready = true;
        setHud((h) => ({ ...h, note: '' }));
      })
      .catch((error: unknown) => {
        if (disposed) return;
        const msg = error instanceof Error ? error.message : 'mesh 载入失败';
        setHud((h) => ({ ...h, note: msg }));
        canvas.setAttribute('aria-label', `3D preview incomplete: ${msg}`);
      });

    let running = spin && !reduced;
    let dir: 1 | -1 = MACHINE_DIR;
    let omegaNow = MACHINE_OMEGA;
    let showNow: Record<MachinePartKind, boolean> = {
      rings: true,
      drive: true,
      frame: true,
      tentacle: true,
    };
    let isolateNow: number | null = null;
    let targetTheta = machine.theta;
    let viewAnim: { q0: Quat; q1: Quat; t: number } | null = null;
    // φ 读数 = 相对伸展位的行程角，恒 0–180（与盘点 §6 同口径：0 伸展 / 180 折叠）。
    // 用 phaseDeg 而不是 (θ−θ₀)：摆向为负时那个差值是负的，读数会变成 −0…−180。
    const phiDeg = (): number => phaseDeg(machine.theta);

    const substep = (): void => {
      if (running) {
        // 往复：撞到 180° 的任一端就折返。端点是曲柄滑块的死点，
        // 输出速度本来就归零，故匀速反转看着不会一顿。
        dir = runMachine(machine, dir, omegaNow * SHELL_STEP_DT);
        targetTheta = machine.theta;
        return;
      }
      // 滑杆态：追目标角。区间不绕圈，故直接取差值、不做 wrap
      const diff = clampTheta(targetTheta) - machine.theta;
      const max = CHASE_OMEGA * SHELL_STEP_DT;
      const dTheta = Math.max(-max, Math.min(max, diff));
      if (dTheta === 0) return;
      stepMachine(machine, dTheta);
    };

    const render = (): void => {
      R.beginFrame(cam);
      if (!ready) return;
      // 全实体、全部写深度——遮挡交给 z-buffer（这台没有半透明层，
      // 故不需要 Lab.04 那套「从远到近自己排序」）
      for (const g of visibleGroups(showNow, isolateNow)) {
        const s = groupShade(g.name);
        R.drawMesh(g.name, machineFrame(g, machine), s.dark, s.lite);
      }
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
      // 读数跟着「单环」走：隔离哪一环就报哪一环的拱顶，全部时报中间那环（S3）
      const ri = isolateNow ?? 2;
      setHud((h) =>
        h.note
          ? h
          : {
              err: machineMaxError(machine),
              apex: apexHeight(machine, ri),
              ring: ri,
              folding: isFolding(dir),
              note: '',
            },
      );
      if (running) setPhase(Number(phiDeg().toFixed(1)));
    };

    apiRef.current = {
      step,
      setPhase: (deg) => {
        running = false;
        targetTheta = thetaAtStroke(deg / PHASE_MAX);
      },
      setRun: (on) => {
        running = on;
      },
      setOmega: (w) => {
        omegaNow = w;
      },
      setShow: (s) => {
        showNow = s;
        if (!running) render();
      },
      setIsolate: (ri) => {
        isolateNow = ri;
        if (!running) render();
      },
      setPersp: (on) => R.setPerspective(on ? 900 : 0),
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

    // 转场克隆用的画面快照（canvas 的像素不随 cloneNode 复制，见 snapshot.ts）
    setSnapshot(canvas, () => {
      render();
      return canvas.toDataURL('image/png');
    });

    render();
    return () => {
      disposed = true;
      apiRef.current = null;
      setSnapshot(canvas, null);
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

  const L = COPY[lang];

  return (
    <div
      className={`lab-wrap${onLight ? ' on-light' : ''}${
        sideControls && controls ? ' lab-wrap--side' : ''
      }`}
    >
      <div className="lab-fig" {...(ptTarget ? { 'data-pt-target': '' } : {})}>
        <canvas ref={canvasRef} width={1400} height={1040} aria-label={L.aria} />
        <div className="lab-hud tl">
          <div style={{ color: 'var(--p300)' }}>Lab.05 / Fig. 14</div>
          <div>{L.title}</div>
          <div className="dim">{L.sub}</div>
        </div>
        <div className="lab-hud br">
          <div className="num">φ {phase.toFixed(1)}°</div>
          <div className="dim">
            {hud.note
              ? hud.note
              : `apex(S${hud.ring + 1}) ${hud.apex.toFixed(1)} mm · err ${hud.err.toFixed(2)} · ${
                  run ? (hud.folding ? L.going.fold : L.going.open) : L.drive.slider
                }`}
          </div>
        </div>
        {sideControls && controls ? null : <div className="lab-hud bl dim">{L.hint}</div>}
      </div>
      {controls ? (
        <div className="lab-ctl">
          {/* 驱动 —— 运转 / 转速 / 透视。转速滑块是这台专有的：
              转速本就是待拍板的手感常量，与其我替你定一个数，不如给你滑块自己找。 */}
          <div className="grp">
            <label>
              <input
                type="checkbox"
                checked={run}
                onChange={(e) => {
                  setRun(e.target.checked);
                  apiRef.current?.setRun(e.target.checked);
                }}
              />
              {L.run}
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
              {L.persp}
            </label>
          </div>
          <div className="grp">
            <span className="k">
              {L.speed}
              {sideControls ? <b className="v">{omega.toFixed(2)}</b> : null}
            </span>
            <input
              type="range"
              min={OMEGA_MIN}
              max={OMEGA_MAX}
              step={0.05}
              value={omega}
              aria-label={L.speedAria}
              style={sideControls ? { width: '100%' } : { width: 84 }}
              onChange={(e) => {
                const v = Number(e.target.value);
                setOmega(v);
                apiRef.current?.setOmega(v);
              }}
            />
          </div>
          <div className="grp">
            <span className="k">
              {L.phase}
              {sideControls ? <b className="v">{phase.toFixed(1)}°</b> : null}
            </span>
            <input
              type="range"
              min={0}
              max={PHASE_MAX}
              step={0.5}
              value={phase}
              style={sideControls ? { width: '100%' } : { width: 132 }}
              onChange={(e) => {
                const v = Number(e.target.value);
                setRun(false);
                setPhase(v);
                apiRef.current?.setPhase(v);
              }}
            />
          </div>
          {/* 部件显隐 —— 整机独有：这台是一堆零件的装配，「看哪些」本身就是操作。
              关掉机架能看清传动链怎么走，关掉环身能单看一轴五曲柄。 */}
          <div className="grp">
            <span className="k">{L.parts}</span>
            {PARTS.map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={show[p]}
                  onChange={(e) => {
                    const next = { ...show, [p]: e.target.checked };
                    setShow(next);
                    apiRef.current?.setShow(next);
                  }}
                />
                {L.partNames[p]}
              </label>
            ))}
          </div>
          {/* 单环隔离 —— 五个环同相但行程各异，单独看一个才比得出半径差。
              只筛环件：机架/轴/触手仍按各自开关，否则「只看 S3」会连驱动它的轴一起切掉。 */}
          <div className="grp">
            <span className="k">{L.ring}</span>
            <span className="seg">
              {RING_KEYS.map((k) => (
                <button
                  key={k === null ? 'all' : k}
                  type="button"
                  className={k === isolate ? 'active' : undefined}
                  onClick={() => {
                    setIsolate(k);
                    apiRef.current?.setIsolate(k);
                  }}
                >
                  {k === null ? L.ringAll : `S${k + 1}`}
                </button>
              ))}
            </span>
          </div>
          <div className="grp">
            <span className="k">{L.view}</span>
            <span className="seg">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className={v.key === view ? 'active' : undefined}
                  onClick={() => goView(v.key)}
                >
                  {L.views[v.key]}
                </button>
              ))}
              {sideControls ? (
                <button type="button" className="alt" onClick={() => apiRef.current?.viewHome()}>
                  {L.reset}
                </button>
              ) : null}
            </span>
            {sideControls ? null : (
              <button type="button" onClick={() => apiRef.current?.viewHome()}>
                {L.reset}
              </button>
            )}
          </div>
          {sideControls ? <p className="lab-ctl__hint">{L.hint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
