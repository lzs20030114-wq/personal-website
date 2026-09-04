'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PATHS, PLAN, PlanSim, READINGS, type PathKey, type Reading } from '../../src/lib/space/unit-activation';
import { H, W, canvasToRoom, drawPlan, readPalette, type Palette } from './planDraw';
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
 * SVG 逐格改属性不划算；画法与 Lab.15 共用（planDraw.ts），配色从容器的 CSS 变量取。
 * 定步推进：仿真按时间倍速走、行走子步 ≤ 0.05 s（模块内部），慢设备表现为放慢而非轨迹漂移。
 * 预设走完、离场后再看 AFTER_EXIT_S 秒（痕迹在退、成形不退——这一段就是滞回本身）自动重播；
 * 自由模式不自动重播。
 */
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
    floor: (v: number) => `地面最深 ${v.toFixed(1)} s`,
    state: { outside: '离场', walk: '走', dwell: '站', idle: '站', held: '拖' },
    t: (s: number) => `t ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`,
    foot: (reach: number, thr: number, half: number, reading: string) =>
      `影响半径 ${reach.toFixed(2)} m · 阈值 ${thr.toFixed(0)} s · 半衰期 ${half.toFixed(0)} s · ${reading}读 · 绿盘 = 当前读数（会退）· 紫环 = 成形进度（不回退）`,
    hint: '按住那个人可以拖着走，松手就站在原地（预设的路线随之作废，点「重播」重来）。自由模式：点地面，人走过去；停着就是驻留；「离场」从最近的门出去。规则三个数（衰减 2%/s · 阈值 15 s）来自作者 2026-07-20 的原型；影响半径是行为的量，做成旋钮。',
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
    floor: (v: number) => `deepest floor trace ${v.toFixed(1)} s`,
    state: { outside: 'left', walk: 'walking', dwell: 'standing', idle: 'standing', held: 'held' },
    t: (s: number) => `t ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`,
    foot: (reach: number, thr: number, half: number, reading: string) =>
      `reach ${reach.toFixed(2)} m · threshold ${thr.toFixed(0)} s · half-life ${half.toFixed(0)} s · ${reading} · green disc = live reading (recedes) · purple ring = formed (never undone)`,
    hint: 'Hold the person to drag them; on release they stand where you left them (the preset route is dropped — “replay” restarts it). Free mode: click the floor and the person walks there; standing still is dwelling; “leave” exits by the nearest door. Decay 2 %/s and threshold 15 s are the author’s 2026-07-20 prototype; reach is a behavioural quantity, so it is a knob.',
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

/** 一个人的场景：人在场才画，走过的路接到人身上 */
function sceneOf(sim: PlanSim, showTrace: boolean) {
  const w = sim.walker;
  return {
    layout: sim.layout,
    field: sim.field,
    catchment: sim.catchment,
    act: sim.act,
    people: w.present ? [{ x: w.x, y: w.y, heading: w.heading, reach: sim.reach }] : [],
    trail: sim.trail,
    trailEnd: w.present ? { x: w.x, y: w.y } : null,
    showTrace,
  };
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
  const [hud, setHud] = useState({ formed: 0, half: 0, max: 0, floor: 0, t: 0, state: 'walk' as 'outside' | 'walk' | 'dwell' | 'idle' | 'held', total: PLAN.GRID_DEF * PLAN.GRID_DEF });
  const [cursor, setCursor] = useState<'default' | 'crosshair' | 'grab' | 'grabbing'>('default');

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
        drawPlan(ctx, sceneOf(sim, traceRef.current), palRef.current);
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
    if (simRef.current) drawPlan(ctx, sceneOf(simRef.current, traceRef.current), palRef.current);
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
      if (ctx) drawPlan(ctx, sceneOf(sim, traceRef.current), pal);
      const s = sim.act;
      const state = sim.held ? 'held' : sim.walker.state;
      const key = `${Math.floor(sim.t)}|${s.formed().length}|${s.countAtLeast(0.5)}|${state}`;
      if (key !== lastHud.current) {
        lastHud.current = key;
        setHud({
          formed: s.formed().length,
          half: s.countAtLeast(0.5),
          max: s.maxInput(),
          floor: sim.field.max(),
          t: sim.t,
          state,
          total: sim.layout.units.length,
        });
      }
    },
    [],
    active,
  );

  // 指针：按住人 = 拖（任何模式；用户 2026-09-04「应该有一个用户可以拖动这个人移动的交互」）；
  // 自由模式下按空地 = 走过去。悬停在人身上光标变抓手，按住变握拳。
  const hitPerson = (sim: PlanSim, x: number, y: number) =>
    sim.walker.present && Math.hypot(sim.walker.x - x, sim.walker.y - y) <= PLAN.BODY_R * 1.6;
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const { x, y } = canvasToRoom(canvas, e.clientX, e.clientY, sim.layout.roomM);
    if (hitPerson(sim, x, y)) {
      sim.hold(x, y);
      canvas.setPointerCapture(e.pointerId);
      setCursor('grabbing');
      return;
    }
    if (sim.path === 'free') sim.pointerTarget(x, y);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const { x, y } = canvasToRoom(canvas, e.clientX, e.clientY, sim.layout.roomM);
    if (sim.held) {
      sim.drag(x, y);
      return;
    }
    const next = hitPerson(sim, x, y) ? 'grab' : sim.path === 'free' ? 'crosshair' : 'default';
    if (next !== cursor) setCursor(next);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas || !sim.held) return;
    sim.release();
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    setCursor('grab');
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
          style={{ cursor, touchAction: 'none', aspectRatio: `${W}/${H}` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div className="lab-hud tl">
          <div style={{ color: 'var(--accent)' }}>Lab.14 / Project II</div>
          <div>{t.title}</div>
          <div className="dim">{t.sub}</div>
        </div>
        <div className="lab-hud br">
          <div className="num">{t.formed(hud.formed, hud.total)}</div>
          <div className="dim">
            {t.t(hud.t)} · {t.half(hud.half)} · {t.read(hud.max)} · {t.floor(hud.floor)} · {t.state[hud.state]}
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
