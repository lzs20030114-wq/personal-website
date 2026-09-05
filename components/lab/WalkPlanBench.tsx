'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PATHS, PLAN, PlanSim, READINGS, RESPONSES, keepOut, type PathKey, type Reading, type ResponseMode } from '../../src/lib/space/unit-activation';
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
 *
 * 人有朝向、有身体（2026-09-05 用户三问后拍板「按你的做」）：视野扇形（默认 180°）· 让位距离 D（平台半径 +
 * 身体 + 让位一肘；D 以内不落痕迹、芯在 D 以内的单元闸住）· 走廊（走着时正前方一条 2D 宽的道不落痕迹，随让位开）。
 * 三件全在模型里（unit-activation 的可选项），这里只多两组旋钮与画法：注意力区域随人转、闸住的单元画莲粉 ×。
 * 影响半径这一档默认 1.5（含义变成「看到多远」）；视野拉到 360°、让位关掉就是 09-04 的旧口径。
 */
/** 时间倍速三档：仿真秒 / 真实秒 */
const TIME_SCALES = [1, 3, 8] as const;
const TIME_DEF = 3;
/** 「散掉」滑块（s）：人不在的地方几秒把痕迹退光（线性褪去，见 PLAN.DEMO） */
const FADE = { min: 2, max: 60 } as const;
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
    foot: (reach: number, thr: number, fade: number, reading: string, mode: ResponseMode, fovDeg: number, D: number | null) =>
      `影响半径 ${reach.toFixed(2)} m · 视野 ${fovDeg.toFixed(0)}° · ${D === null ? '不让位' : `让位 D ${D.toFixed(2)} m`} · 阈值 ${thr.toFixed(0)} s · 散掉 ${fade.toFixed(0)} s · ${reading}读 · 绿盘 = 当前读数 · 紫环 = ${mode === 'follow' ? '结构位置（跟着读数涨落，人走了收回去）' : '成形（键锁死，不回退）'}`,
    gated: (n: number) => `闸住 ${n}`,
    attention: `人有朝向、有身体：痕迹只落在视野扇形里（默认 180°，身后的不记）；让位距离 D = 平台半径 + 身体 + 让位（默认一肘 0.15 m）——D 以内的地面不记，芯在 D 以内的单元闸住（莲粉 ×：平台下来会打到人，跟随档退回去、锁定档不升）；走着时正前方一条 2D 宽的道也不记，结构只长在路两侧。视线与朝向分开：朝向是身体（走的方向，走廊沿它开），视线是头（扇面沿它转）——站着时每隔几秒看向别处（身体前方 ±110° 以内），久站的那道弧就跟着视线散开；走着时看向前方。视野拉到 360°、让位关掉、转头关掉 = 09-04 的旧口径。`,
    hint: `「响应」两档：跟随 = 结构追着读数涨落，人走了收回去（演示默认）；锁定 = 键锁死不回退，那是项目立论的滞回。按住那个人可以拖着走，松手就站在原地（预设的路线随之作废，点「重播」重来）。自由模式：点地面，人走过去；停着就是驻留；「离场」从最近的门出去。台架跑的是演示值：站 ${PLAN.DEMO.threshold} s 就触发，人走后 ${PLAN.DEMO.fade} s 散光。作者 2026-07-20 原型的三个数（落格 +1 · 每拍衰减 2% · 超过 15 就固化）= 阈值滑块拉到 15，那套要等几十秒才看得出变化。影响半径是行为的量，做成旋钮。`,
    grid: '格数',
    path: '行为',
    reading: '读法',
    reach: '影响半径',
    fov: '视野',
    clearance: '让位',
    look: '转头',
    threshold: '阈值',
    half_: '散掉',
    response: '响应',
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
    foot: (reach: number, thr: number, fade: number, reading: string, mode: ResponseMode, fovDeg: number, D: number | null) =>
      `reach ${reach.toFixed(2)} m · field of view ${fovDeg.toFixed(0)}° · ${D === null ? 'no clearance' : `clearance D ${D.toFixed(2)} m`} · threshold ${thr.toFixed(0)} s · fade ${fade.toFixed(0)} s · ${reading} · green disc = live reading · purple ring = ${mode === 'follow' ? 'where the structure is — it follows the reading and withdraws once they leave' : 'formed; bonds locked, never undone'}`,
    gated: (n: number) => `${n} held back`,
    attention: `The person faces somewhere and has a body: the trace lands only inside the field of view (180° by default — nothing behind); the clearance distance D = platform radius + body + clearance (an elbow, 0.15 m, by default) — the floor within D records nothing and units whose mast is within D are held back (rose ×: a platform there would hit the person; it withdraws in follow mode, cannot rise in lock mode); while walking, a lane 2D wide straight ahead records nothing either, so structure grows along the sides of the path. Gaze and facing are separate: facing is the body (the direction walked; the lane follows it), gaze is the head (the wedge follows it) — standing, they glance elsewhere every few seconds within ±110° of the body, so a long stand spreads the arc where they looked; walking, they look ahead. Field of view at 360° with clearance and looking around off is the 09-04 reading.`,
    hint: `“Response” has two settings: follow — the structure tracks the reading and withdraws once people leave (the demo default); lock — bonds stay locked and nothing withdraws, which is the hysteresis the project argues for. Hold the person to drag them; on release they stand where you left them (the preset route is dropped — “replay” restarts it). Free mode: click the floor and the person walks there; standing still is dwelling; “leave” exits by the nearest door. The bench runs on demo numbers: ${PLAN.DEMO.threshold} s of standing forms a unit, ${PLAN.DEMO.fade} s after they leave it is gone. The author’s 2026-07-20 prototype (+1 on the cell stepped on, 2 % decay a tick, past 15 it solidifies) is the threshold slider at 15 — legible, but tens of seconds to read. Reach is a behavioural quantity, so it is a knob.`,
    grid: 'grid',
    path: 'behaviour',
    reading: 'reading',
    reach: 'reach',
    fov: 'view',
    clearance: 'clearance',
    look: 'look around',
    threshold: 'threshold',
    half_: 'fade',
    response: 'response',
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
    people: w.present ? [{ x: w.x, y: w.y, heading: w.heading, reach: sim.reach, fov: sim.fov, keepOut: sim.keepOutM, lane: sim.lane && sim.moving, gaze: w.gaze }] : [],
    trail: sim.trail,
    trailEnd: w.present ? { x: w.x, y: w.y } : null,
    showTrace,
    blocked: sim.clearance === null ? null : sim.blocked,
  };
}

const PATH_KEYS = PATHS.map((p) => p.key);
const DEFAULT_PATH: PathKey = 'dwell';
/** 视野滑块（度）：60°–360°，360 = 全圆（旧口径） */
const FOV_DEG = { min: 60, max: 360, def: Math.round((PLAN.ATTENTION.fov * 180) / Math.PI) } as const;

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
  const [reach, setReach] = useState<number>(PLAN.ATTENTION.reach);
  const [fovDeg, setFovDeg] = useState<number>(FOV_DEG.def);
  const [clearOn, setClearOn] = useState(true);
  const [clearance, setClearance] = useState<number>(PLAN.ATTENTION.clearance);
  const [look, setLook] = useState<boolean>(PLAN.ATTENTION.look);
  const [threshold, setThreshold] = useState<number>(PLAN.DEMO.threshold);
  const [fade, setFade] = useState<number>(PLAN.DEMO.fade);
  const [mode, setMode] = useState<ResponseMode>('follow');
  const [speed, setSpeed] = useState<number>(PLAN.SPEED.def);
  const [hud, setHud] = useState({ formed: 0, half: 0, max: 0, floor: 0, t: 0, gated: 0, state: 'walk' as 'outside' | 'walk' | 'dwell' | 'idle' | 'held', total: PLAN.GRID_DEF * PLAN.GRID_DEF });
  const fov = (fovDeg * Math.PI) / 180;
  const clearanceOpt = clearOn ? clearance : null;
  const [cursor, setCursor] = useState<'default' | 'crosshair' | 'grab' | 'grabbing'>('default');

  // `/lab#lab14-<path>` 直达某种行为
  useEffect(() => {
    const k = planFromHash('14', PATH_KEYS);
    if (k) setPath(k);
  }, []);

  // 建仿真（换格数才重建——单元数变了，痕迹场与读法表要重算；其余旋钮就地改）
  useEffect(() => {
    // 走廊随让位一起开（用户拍板 ⑤）
    const sim = new PlanSim({ grid, path, reading, reach, threshold, fade, speed, mode, fov, clearance: clearanceOpt, lane: clearanceOpt !== null, look });
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
    simRef.current?.setFade(fade);
  }, [fade]);
  useEffect(() => {
    simRef.current?.setSpeed(speed);
  }, [speed]);
  useEffect(() => {
    simRef.current?.setMode(mode);
  }, [mode]);
  useEffect(() => {
    simRef.current?.setFov(fov);
  }, [fov]);
  useEffect(() => {
    simRef.current?.setClearance(clearanceOpt);
    simRef.current?.setLane(clearanceOpt !== null);
  }, [clearanceOpt]);
  useEffect(() => {
    simRef.current?.setLook(look);
  }, [look]);

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
      let gated = 0;
      if (sim.clearance !== null) for (let i = 0; i < sim.blocked.length; i++) gated += sim.blocked[i];
      const key = `${Math.floor(sim.t)}|${s.formed().length}|${s.countAtLeast(0.5)}|${state}|${gated}`;
      if (key !== lastHud.current) {
        lastHud.current = key;
        setHud({
          formed: s.formed().length,
          half: s.countAtLeast(0.5),
          max: s.maxInput(),
          floor: sim.field.max(),
          t: sim.t,
          gated,
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
  const D = clearanceOpt === null ? null : keepOut(simRef.current?.layout ?? new PlanSim({ grid }).layout, clearanceOpt);

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
            {t.t(hud.t)} · {t.half(hud.half)} · {t.read(hud.max)} · {t.floor(hud.floor)}
            {clearanceOpt !== null ? ` · ${t.gated(hud.gated)}` : ''} · {t.state[hud.state]}
          </div>
        </div>
        <div className="lab-hud bl dim">
          {t.foot(reach, threshold, fade, lang === 'zh' ? readingLabel.zh : readingLabel.en, mode, fovDeg, D)}
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
              <span className="k">{t.response}</span>
              <span className="seg">
                {RESPONSES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className={r.key === mode ? 'active' : undefined}
                    title={
                      r.key === 'follow'
                        ? lang === 'zh'
                          ? '结构追着读数涨落，人走了收回去'
                          : 'the structure tracks the reading and withdraws once people leave'
                        : lang === 'zh'
                          ? '键锁死、不回退——项目立论的滞回'
                          : 'bonds lock and never release — the hysteresis the project argues for'
                    }
                    onClick={() => setMode(r.key)}
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
                {t.fov} {fovDeg.toFixed(0)}°
              </span>
              <input
                type="range"
                min={FOV_DEG.min}
                max={FOV_DEG.max}
                step={10}
                value={fovDeg}
                aria-label={t.fov}
                title={lang === 'zh' ? '痕迹只落在朝向前方这个角度里；360° = 全圆（旧口径）' : 'the trace lands only within this angle ahead; 360° = full circle (the old reading)'}
                style={{ width: 84 }}
                onChange={(e) => setFovDeg(Number(e.target.value))}
              />
              <label>
                <input
                  type="checkbox"
                  checked={look}
                  title={lang === 'zh' ? '站着时头会转：视线离开朝向，扇面跟着视线走；走着时看向前方' : 'the head turns while standing: the gaze leaves the facing and the wedge follows it; while walking they look ahead'}
                  onChange={(e) => setLook(e.target.checked)}
                />
                {t.look}
              </label>
            </div>
            <div className="grp">
              <label>
                <input
                  type="checkbox"
                  checked={clearOn}
                  title={lang === 'zh' ? '平台离身体至少留这么远才许下来；走廊随之开' : 'a platform must keep this far from the body before it may come down; the lane follows'}
                  onChange={(e) => setClearOn(e.target.checked)}
                />
                {t.clearance} {clearance.toFixed(2)} m
              </label>
              <input
                type="range"
                min={PLAN.CLEARANCE.min}
                max={PLAN.CLEARANCE.max}
                step={0.05}
                value={clearance}
                disabled={!clearOn}
                aria-label={t.clearance}
                style={{ width: 72 }}
                onChange={(e) => setClearance(Number(e.target.value))}
              />
            </div>
            <div className="grp">
              <span className="k">
                {t.threshold} {threshold.toFixed(0)} s
              </span>
              <input
                type="range"
                min={1}
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
                {t.half_} {fade.toFixed(0)} s
              </span>
              <input
                type="range"
                min={FADE.min}
                max={FADE.max}
                step={1}
                value={fade}
                aria-label={t.half_}
                style={{ width: 84 }}
                onChange={(e) => setFade(Number(e.target.value))}
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
            <p className="lab-ctl__hint">{t.attention}</p>
            <p className="lab-ctl__hint">{t.hint}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
