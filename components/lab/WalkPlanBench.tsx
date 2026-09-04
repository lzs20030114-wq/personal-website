'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  PATHS,
  PLAN,
  PlanSim,
  READINGS,
  aisleLines,
  type PathKey,
  type Reading,
} from '../../src/lib/space/unit-activation';
import { planFromHash } from './planHash';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.14 · 一个人走过（用户 2026-09-04 立项「先做平面，研究一个人在空间中运动时这些单元哪些被激活」，
 * 同轮纠偏「单元要更小、要多于 4×4 甚至 8×8、触发一群单元围着人形成空间、空间的变化跟着行为走」）。
 *
 * 平面台架：Lab.12 那间房与那块场地，N×N 个按比例缩小的单元；一个人按预设行为（穿行 / 斜穿 / 驻留 /
 * 绕圈 / 折返）或听指点（自由：点地面就走过去）在里面走动，地面记下存在·秒（影响半径以内的每块地面
 * 各记满），每个单元读自己那片地面的均值，读满阈值即成形——紫圈从芯长到平台外缘；成形不回退。
 * 模型全部在 src/lib/space/unit-activation.ts（线稿脚本与守门共用同一份），这里只做 DOM 接线与画。
 *
 * 画法：一张 2D canvas（逻辑 700×520，与 WebGL 台架同尺；DPR 缩放）——热力场几千格逐帧重画，
 * SVG 逐格改属性不划算；配色从容器的 CSS 变量取（深色 /lab、on-light 修饰符各自解析）。
 * 定步推进：仿真按时间倍速走、行走子步 ≤ 0.05 s（模块内部），慢设备表现为放慢而非轨迹漂移。
 * 预设走完、离场后再看 AFTER_EXIT_S 秒（痕迹在退、成形不退——这一段就是滞回本身）自动重播；
 * 自由模式不自动重播。
 */
const W = 700;
const H = 520;
const PAD_Y = 48;
/** 时间倍速三档：仿真秒 / 真实秒 */
const TIME_SCALES = [1, 3, 8] as const;
const TIME_DEF = 3;
/** 半衰期滑块（s）与衰减率互换 */
const HALF = { min: 10, max: 120 } as const;
const rateFromHalf = (t: number) => 1 - Math.pow(0.5, 1 / t);
const halfFromRate = (r: number) => Math.log(0.5) / Math.log(1 - r);
const MAX_SIM_DT = 0.05 * 8 * 1.01; // 单帧仿真时间封顶（时间倍速 8 × 50ms 帧）

const COPY = {
  zh: {
    aria: '一个人走过：一个人在房间平面里走动，地面留下存在的痕迹，读满阈值的单元成形；成形不回退',
    title: '一个人走过',
    sub: '平面 · 行为 → 地面痕迹 → 一群单元成形',
    formed: (n: number, total: number) => `成形 ${n} / ${total}`,
    half: (n: number) => `半成以上 ${n}`,
    read: (v: number) => `最高读数 ${v.toFixed(1)} s`,
    state: { outside: '离场', walk: '走', dwell: '站', idle: '站' },
    t: (s: number) => `t ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`,
    foot: (reach: number, thr: number, half: number, reading: string) =>
      `影响半径 ${reach.toFixed(2)} m · 阈值 ${thr.toFixed(0)} s · 半衰期 ${half.toFixed(0)} s · ${reading}读 · 绿 = 地面痕迹 · 紫 = 成形程度（不回退）`,
    hint: '自由模式：点地面，人走过去；停着就是驻留；「离场」从最近的门出去。规则三个数（衰减 2%/s · 阈值 15 s）来自作者 2026-07-20 的原型；影响半径是行为的量，做成旋钮。',
    grid: '格数',
    path: '行为',
    reading: '读法',
    reach: '影响半径',
    threshold: '阈值',
    half_: '半衰期',
    run: '运转',
    trace: '痕迹',
    replay: '重播',
    leave: '离场',
    speed: '步速',
    time: '时间',
  },
  en: {
    aria: 'A person walks through: presence marks the floor, units whose floor has been occupied long enough form — and do not unform.',
    title: 'A person walks through',
    sub: 'Plan · behaviour → floor trace → a group of units forms',
    formed: (n: number, total: number) => `formed ${n} / ${total}`,
    half: (n: number) => `${n} at half or more`,
    read: (v: number) => `peak reading ${v.toFixed(1)} s`,
    state: { outside: 'left', walk: 'walking', dwell: 'standing', idle: 'standing' },
    t: (s: number) => `t ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`,
    foot: (reach: number, thr: number, half: number, reading: string) =>
      `reach ${reach.toFixed(2)} m · threshold ${thr.toFixed(0)} s · half-life ${half.toFixed(0)} s · ${reading} · green = floor trace · purple = formed (never undone)`,
    hint: 'Free mode: click the floor and the person walks there; standing still is dwelling; “leave” exits by the nearest door. Decay 2 %/s and threshold 15 s are the author’s 2026-07-20 prototype; reach is a behavioural quantity, so it is a knob.',
    grid: 'grid',
    path: 'behaviour',
    reading: 'reading',
    reach: 'reach',
    threshold: 'threshold',
    half_: 'half-life',
    run: 'run',
    trace: 'trace',
    replay: 'replay',
    leave: 'leave',
    speed: 'pace',
    time: 'time',
  },
} as const;

interface Palette {
  ink: string;
  accent: string;
  accent2: string;
  muted: string;
  paper: string;
}

function readPalette(el: HTMLElement): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--ink', '#e9efe6'),
    accent: v('--accent', '#7fbf8f'),
    accent2: v('--accent-2', '#c9b8ee'),
    muted: v('--n500', '#8a9a90'),
    paper: v('--paper', '#1b2a33'),
  };
}

/** 房间在画布上的位置与比例：以 (W/2, H/2) 为中心，纵向留 PAD_Y */
function frame(roomM: number): { sc: number; ox: number; oy: number } {
  const sc = (H - 2 * PAD_Y) / roomM;
  return { sc, ox: W / 2, oy: H / 2 };
}

function draw(ctx: CanvasRenderingContext2D, sim: PlanSim, pal: Palette, showTrace: boolean): void {
  const L = sim.layout;
  const { sc, ox, oy } = frame(L.roomM);
  const X = (x: number) => ox + x * sc;
  const Y = (y: number) => oy + y * sc;
  ctx.clearRect(0, 0, W, H);

  // 地板：极淡的墨
  const h = (L.roomM / 2) * sc;
  ctx.globalAlpha = 0.045;
  ctx.fillStyle = pal.ink;
  ctx.fillRect(ox - h, oy - h, 2 * h, 2 * h);
  ctx.globalAlpha = 1;

  // 痕迹场：有痕迹的格子按浓度（存在·秒）画绿，阈值处约七成
  if (showTrace) {
    const f = sim.field;
    const cs = f.cell * sc;
    ctx.fillStyle = pal.accent;
    for (let idx = 0; idx < f.data.length; idx++) {
      const v = f.data[idx];
      if (v <= 1e-3) continue;
      const [x, y] = f.cellCenter(idx);
      ctx.globalAlpha = Math.max(0.05, Math.min(0.75, 1 - Math.exp(-v / 12)));
      ctx.fillRect(X(x) - cs / 2, Y(y) - cs / 2, cs + 0.5, cs + 0.5);
    }
    ctx.globalAlpha = 1;
  }

  // 按格读法的边界（格线）；脚下读法画平台圈本身就是边界
  if (sim.catchment.reading === 'nearest') {
    const a = aisleLines(L);
    const fh = (L.fieldM / 2 + 0.12) * sc;
    ctx.strokeStyle = pal.ink;
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 0.75;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    for (const x of a.x) {
      ctx.moveTo(X(x), oy - fh);
      ctx.lineTo(X(x), oy + fh);
    }
    for (const y of a.y) {
      ctx.moveTo(ox - fh, Y(y));
      ctx.lineTo(ox + fh, Y(y));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // 墙 + 门（左右墙正中留门）
  const dw = (PLAN.DOOR_W / 2) * sc;
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(ox - h, oy - h);
  ctx.lineTo(ox + h, oy - h);
  ctx.moveTo(ox - h, oy + h);
  ctx.lineTo(ox + h, oy + h);
  ctx.moveTo(ox - h, oy - h);
  ctx.lineTo(ox - h, oy - dw);
  ctx.moveTo(ox - h, oy + dw);
  ctx.lineTo(ox - h, oy + h);
  ctx.moveTo(ox + h, oy - h);
  ctx.lineTo(ox + h, oy - dw);
  ctx.moveTo(ox + h, oy + dw);
  ctx.lineTo(ox + h, oy + h);
  ctx.stroke();
  // 门扇
  ctx.lineWidth = 0.9;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(ox - h, oy - dw);
  ctx.lineTo(ox - h - dw * 0.9, oy - dw * 0.1);
  ctx.moveTo(ox + h, oy - dw);
  ctx.lineTo(ox + h + dw * 0.9, oy - dw * 0.1);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 单元：平台外缘（发丝线）· 成形程度（紫圈从芯长出）· 芯
  const platPx = L.platR * sc;
  const mastPx = Math.max(1.6, L.mastR * sc);
  for (const u of L.units) {
    const cx = X(u.x);
    const cy = Y(u.y);
    ctx.strokeStyle = pal.ink;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx, cy, platPx, 0, Math.PI * 2);
    ctx.stroke();
    const d = sim.act.degree[u.i];
    if (d > 1e-6) {
      const r = mastPx + d * (platPx - mastPx);
      ctx.fillStyle = pal.accent2;
      ctx.globalAlpha = 0.22 + 0.5 * d;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      if (d >= 1 - 1e-9) {
        ctx.strokeStyle = pal.accent2;
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
    // 当前读数（呼吸的那个量）：芯外一圈细弧，满圈 = 阈值
    const frac = Math.min(1, sim.act.input[u.i] / sim.act.threshold);
    if (frac > 0.02) {
      ctx.strokeStyle = pal.accent;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, mastPx + 2.2, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, mastPx, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 走过的路
  if (sim.trail.length > 2) {
    ctx.strokeStyle = pal.ink;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(X(sim.trail[0]), Y(sim.trail[1]));
    for (let k = 2; k < sim.trail.length; k += 2) ctx.lineTo(X(sim.trail[k]), Y(sim.trail[k + 1]));
    if (sim.walker.present) ctx.lineTo(X(sim.walker.x), Y(sim.walker.y));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // 人：影响圈（绿虚线）+ 身体 + 朝向
  const w = sim.walker;
  if (w.present) {
    const cx = X(w.x);
    const cy = Y(w.y);
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 0.9;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, sim.reach * sc, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const r = PLAN.BODY_R * sc;
    ctx.fillStyle = pal.paper;
    ctx.strokeStyle = pal.ink;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(w.heading) * r, cy + Math.sin(w.heading) * r);
    ctx.stroke();
  }

  // 比例尺 1 m（房间右上角内侧）
  const bx1 = ox + h - 0.3 * sc;
  const bx0 = bx1 - 1 * sc;
  const by = oy - h + 0.32 * sc;
  ctx.strokeStyle = pal.muted;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx0, by);
  ctx.lineTo(bx1, by);
  ctx.moveTo(bx0, by - 3);
  ctx.lineTo(bx0, by + 3);
  ctx.moveTo(bx1, by - 3);
  ctx.lineTo(bx1, by + 3);
  ctx.stroke();
  ctx.fillStyle = pal.muted;
  ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('1 m', (bx0 + bx1) / 2, by - 5);
  ctx.globalAlpha = 1;
}

const PATH_KEYS = PATHS.map((p) => p.key);
const DEFAULT_PATH: PathKey = 'dwell';

export function WalkPlanBench({
  active = true,
  onLight = false,
  controls = true,
  lang = 'zh',
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
  lang?: 'zh' | 'en';
}) {
  const t = COPY[lang];
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<PlanSim | null>(null);
  const palRef = useRef<Palette | null>(null);
  const runningRef = useRef(true);
  const timeRef = useRef<number>(TIME_DEF);
  const traceRef = useRef(true);
  const [running, setRunning] = useState(true);
  const [showTrace, setShowTrace] = useState(true);
  const [timeScale, setTimeScale] = useState<number>(TIME_DEF);
  const [grid, setGrid] = useState<number>(PLAN.GRID_DEF);
  const [path, setPath] = useState<PathKey>(DEFAULT_PATH);
  const [reading, setReading] = useState<Reading>('nearest');
  const [reach, setReach] = useState<number>(PLAN.REACH.def);
  const [threshold, setThreshold] = useState<number>(PLAN.THRESHOLD);
  const [halfLife, setHalfLife] = useState<number>(halfFromRate(PLAN.DECAY));
  const [speed, setSpeed] = useState<number>(PLAN.SPEED.def);
  const [hud, setHud] = useState({ formed: 0, half: 0, max: 0, t: 0, state: 'walk' as 'outside' | 'walk' | 'dwell' | 'idle', total: PLAN.GRID_DEF * PLAN.GRID_DEF });

  // `/lab#lab14-<path>` 直达某种行为
  useEffect(() => {
    const k = planFromHash('14', PATH_KEYS);
    if (k) setPath(k);
  }, []);

  // 建仿真（换格数才重建——单元数变了，痕迹场与读法表要重算；其余旋钮就地改）
  useEffect(() => {
    const sim = new PlanSim({ grid, path, reading, reach, threshold, decay: rateFromHalf(halfLife), speed });
    simRef.current = sim;
    if (canvasRef.current && palRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        ctx.scale(dpr, dpr);
        draw(ctx, sim, palRef.current, traceRef.current);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  // 其余旋钮就地改，不重建（痕迹与已成形的都留着）
  useEffect(() => {
    simRef.current?.setPath(path);
  }, [path]);
  useEffect(() => {
    simRef.current?.setReading(reading);
  }, [reading]);
  useEffect(() => {
    simRef.current?.setReach(reach);
  }, [reach]);
  useEffect(() => {
    simRef.current?.setThreshold(threshold);
  }, [threshold]);
  useEffect(() => {
    simRef.current?.setDecay(rateFromHalf(halfLife));
  }, [halfLife]);
  useEffect(() => {
    simRef.current?.setSpeed(speed);
  }, [speed]);

  // 画布 DPR 与配色（挂载一次；配色从容器 CSS 变量取）
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      runningRef.current = false;
      setRunning(false);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    palRef.current = readPalette(wrap);
    if (simRef.current) draw(ctx, simRef.current, palRef.current, traceRef.current);
  }, []);

  const lastHud = useRef('');
  useBenchLoop(
    canvasRef,
    (dt) => {
      const sim = simRef.current;
      const canvas = canvasRef.current;
      const pal = palRef.current;
      if (!sim || !canvas || !pal) return;
      if (runningRef.current) {
        const simDt = Math.min(MAX_SIM_DT, dt * timeRef.current);
        sim.step(simDt);
        // 预设走完、离场后看过一段衰减 ⇒ 重播（自由模式不重播）
        if (sim.done && sim.path !== 'free') sim.reset();
      }
      const ctx = canvas.getContext('2d');
      if (ctx) draw(ctx, sim, pal, traceRef.current);
      const s = sim.act;
      const key = `${Math.floor(sim.t)}|${s.formed().length}|${s.countAtLeast(0.5)}|${sim.walker.state}`;
      if (key !== lastHud.current) {
        lastHud.current = key;
        setHud({
          formed: s.formed().length,
          half: s.countAtLeast(0.5),
          max: s.maxInput(),
          t: sim.t,
          state: sim.walker.state,
          total: sim.layout.units.length,
        });
      }
    },
    [],
    active,
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas || sim.path !== 'free') return;
    const rect = canvas.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * W;
    const ly = ((e.clientY - rect.top) / rect.height) * H;
    const { sc, ox, oy } = frame(sim.layout.roomM);
    sim.pointerTarget((lx - ox) / sc, (ly - oy) / sc);
  };

  const readingLabel = READINGS.find((r) => r.key === reading)!;
  const free = path === 'free';

  return (
    <div ref={wrapRef} className={`lab-wrap${onLight ? ' on-light' : ''}`}>
      <div className="lab-fig">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t.aria}
          style={{ cursor: free ? 'crosshair' : 'default', touchAction: 'auto', aspectRatio: `${W}/${H}` }}
          onPointerDown={onPointerDown}
        />
        <div className="lab-hud tl">
          <div style={{ color: 'var(--accent)' }}>Lab.14 / Project II</div>
          <div>{t.title}</div>
          <div className="dim">{t.sub}</div>
        </div>
        <div className="lab-hud br">
          <div className="num">{t.formed(hud.formed, hud.total)}</div>
          <div className="dim">
            {t.t(hud.t)} · {t.half(hud.half)} · {t.read(hud.max)} · {t.state[hud.state]}
          </div>
        </div>
        <div className="lab-hud bl dim">
          {t.foot(reach, threshold, halfLife, lang === 'zh' ? readingLabel.zh : readingLabel.en)}
        </div>
      </div>
      {controls ? (
        <div className="lab-ctl lab-ctl--tiered">
          <div className="lab-ctl__row lab-ctl__solve">
            <div className="grp">
              <span className="k">{t.path}</span>
              <span className="seg">
                {PATHS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={p.key === path ? 'active' : undefined}
                    title={lang === 'zh' ? p.zhNote : p.enNote}
                    onClick={() => setPath(p.key)}
                  >
                    {lang === 'zh' ? p.zh : p.en}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <span className="k">{t.grid}</span>
              <span className="seg">
                {PLAN.GRIDS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={n === grid ? 'active' : undefined}
                    title={n === 4 ? (lang === 'zh' ? 'Lab.12 原样，对照用' : 'Lab.12 as is, for comparison') : undefined}
                    onClick={() => setGrid(n)}
                  >
                    {n}×{n}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <span className="k">{t.reading}</span>
              <span className="seg">
                {READINGS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className={r.key === reading ? 'active' : undefined}
                    onClick={() => setReading(r.key)}
                  >
                    {lang === 'zh' ? r.zh : r.en}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <span className="k">
                {t.reach} {reach.toFixed(2)} m
              </span>
              <input
                type="range"
                min={PLAN.REACH.min}
                max={PLAN.REACH.max}
                step={0.02}
                value={reach}
                aria-label={t.reach}
                style={{ width: 96 }}
                onChange={(e) => setReach(Number(e.target.value))}
              />
            </div>
            <div className="grp">
              <span className="k">
                {t.threshold} {threshold.toFixed(0)} s
              </span>
              <input
                type="range"
                min={2}
                max={40}
                step={1}
                value={threshold}
                aria-label={t.threshold}
                style={{ width: 84 }}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </div>
            <div className="grp">
              <span className="k">
                {t.half_} {halfLife.toFixed(0)} s
              </span>
              <input
                type="range"
                min={HALF.min}
                max={HALF.max}
                step={1}
                value={halfLife}
                aria-label={t.half_}
                style={{ width: 84 }}
                onChange={(e) => setHalfLife(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="lab-ctl__row">
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
                {t.run}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showTrace}
                  onChange={(e) => {
                    traceRef.current = e.target.checked;
                    setShowTrace(e.target.checked);
                  }}
                />
                {t.trace}
              </label>
            </div>
            <div className="grp">
              <button
                type="button"
                onClick={() => {
                  simRef.current?.reset();
                  runningRef.current = true;
                  setRunning(true);
                }}
              >
                {t.replay}
              </button>
              <button type="button" disabled={!free} onClick={() => simRef.current?.leave()}>
                {t.leave}
              </button>
            </div>
            <div className="grp">
              <span className="k">
                {t.speed} {speed.toFixed(1)} m/s
              </span>
              <input
                type="range"
                min={PLAN.SPEED.min}
                max={PLAN.SPEED.max}
                step={0.1}
                value={speed}
                aria-label={t.speed}
                style={{ width: 84 }}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
            </div>
            <div className="grp">
              <span className="k">{t.time}</span>
              <span className="seg">
                {TIME_SCALES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={s === timeScale ? 'active' : undefined}
                    onClick={() => {
                      timeRef.current = s;
                      setTimeScale(s);
                    }}
                  >
                    ×{s}
                  </button>
                ))}
              </span>
            </div>
            <p className="lab-ctl__hint">{t.hint}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
