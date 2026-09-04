'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CROWD, CrowdSim } from '../../src/lib/space/crowd-plan';
import { PLAN, READINGS, type Reading } from '../../src/lib/space/unit-activation';
import { H, W, canvasToRoom, drawPlan, readPalette, type Palette } from './planDraw';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.15 · 几个人在场（用户 2026-09-04 立项「做一个 lab 模拟：人是可动的，也可以放多人，直接演示这些单元的变化」）。
 *
 * Lab.14 是一个人按预设走一遍看结果；这台是现场：点地面放人（最多 8 个），按住一个人拖着走，
 * 开「自走」让他们自己漫步（随机目标 + 随机站 2–30 s，**演示装置不是行为规则**），地面实时记痕迹、
 * 单元实时长出来。机制一个数不改（unit-activation 同一份），新增的只有多个人与人怎么动（crowd-plan.ts）。
 * 画法与 Lab.14 共用 planDraw.ts。
 */
const TIME_SCALES = [1, 3, 8] as const;
/** 默认 ×1：这台演示的是人怎么在房间里慢慢待着，按真实节奏看（Lab.14 仍 ×3——那台是走一遍看结果） */
const TIME_DEF = 1;
const HALF = { min: 10, max: 120 } as const;
const rateFromHalf = (t: number) => 1 - Math.pow(0.5, 1 / t);
const halfFromRate = (r: number) => Math.log(0.5) / Math.log(1 - r);
const MAX_SIM_DT = 0.05 * 8 * 1.01;

const COPY = {
  zh: {
    aria: '几个人在场：房间平面里放几个人，拖着走或让他们自己漫步，地面实时记下存在，读满的单元成形且不回退',
    title: '几个人在场',
    sub: '平面 · 放人 · 拖 · 自走 → 单元实时成形',
    formed: (n: number, total: number) => `成形 ${n} / ${total}`,
    line: (c: { people: number; walking: number; standing: number; held: number }, half: number, t: number, floor: number) =>
      `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · ${c.people} 人（走 ${c.walking} · 站 ${c.standing}${c.held ? ` · 拖 ${c.held}` : ''}）· 半成以上 ${half} · 地面最深 ${floor.toFixed(1)} s`,
    foot: (reach: number, thr: number, half: number, reading: string) =>
      `影响半径 ${reach.toFixed(2)} m · 阈值 ${thr.toFixed(0)} s · 半衰期 ${half.toFixed(0)} s · ${reading}读 · 绿盘 = 当前读数（会退）· 紫环 = 成形（不回退）· 点地面放人 · 按住拖`,
    hint: `点空地放一个人（最多 ${CROWD.MAX_PEOPLE} 个）；悬停到人身上变抓手，按住就能拖着走，松手站在原地。「自走」= 演示用的慢走：每次只挪 ${CROWD.HOP.min}–${CROWD.HOP.max} m（偶尔远一次），到了站 ${CROWD.PAUSE.min}–${CROWD.PAUSE.max} s，步速 ${CROWD.SPEED_DEF} m/s——不是行为规则。几个人的影响圈重叠处每秒记几份——两个人站在一起，脚下的单元早一倍成形。`,
    grid: '格数',
    reading: '读法',
    reach: '影响半径',
    threshold: '阈值',
    half_: '半衰期',
    run: '运转',
    auto: '自走',
    trace: '痕迹',
    add: '+ 人',
    remove: '− 人',
    clearPeople: '清人',
    clear: '清痕迹',
    speed: '步速',
    time: '时间',
  },
  en: {
    aria: 'A few people: place people in the room plan, drag them or let them wander; the floor records presence live and units that read enough of it form and stay formed',
    title: 'A few people',
    sub: 'Plan · place · drag · wander → units form live',
    formed: (n: number, total: number) => `formed ${n} / ${total}`,
    line: (c: { people: number; walking: number; standing: number; held: number }, half: number, t: number, floor: number) =>
      `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · ${c.people} people (${c.walking} walking · ${c.standing} standing${c.held ? ` · ${c.held} held` : ''}) · ${half} at half or more · deepest floor trace ${floor.toFixed(1)} s`,
    foot: (reach: number, thr: number, half: number, reading: string) =>
      `reach ${reach.toFixed(2)} m · threshold ${thr.toFixed(0)} s · half-life ${half.toFixed(0)} s · ${reading} · green disc = live reading (recedes) · purple ring = formed (never undone) · click to place · hold to drag`,
    hint: `Click empty floor to place a person (up to ${CROWD.MAX_PEOPLE}); hover a person for the grab cursor, hold to drag, release to leave them standing. “Wander” is a demo device — a short hop of ${CROWD.HOP.min}–${CROWD.HOP.max} m (occasionally further), then a ${CROWD.PAUSE.min}–${CROWD.PAUSE.max} s stand, at ${CROWD.SPEED_DEF} m/s — not a behaviour rule. Where reaches overlap the floor counts every person, so two people standing together form the unit underfoot twice as fast.`,
    grid: 'grid',
    reading: 'reading',
    reach: 'reach',
    threshold: 'threshold',
    half_: 'half-life',
    run: 'run',
    auto: 'wander',
    trace: 'trace',
    add: '+ person',
    remove: '− person',
    clearPeople: 'clear people',
    clear: 'clear trace',
    speed: 'pace',
    time: 'time',
  },
} as const;

function sceneOf(sim: CrowdSim, showTrace: boolean) {
  return {
    layout: sim.layout,
    field: sim.field,
    catchment: sim.catchment,
    act: sim.act,
    people: sim.people.map((p) => ({ x: p.walker.x, y: p.walker.y, heading: p.walker.heading, reach: sim.reach, held: p.mode === 'held' })),
    showTrace,
  };
}

export function CrowdPlanBench({
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
  const simRef = useRef<CrowdSim | null>(null);
  const palRef = useRef<Palette | null>(null);
  const runningRef = useRef(true);
  const timeRef = useRef<number>(TIME_DEF);
  const traceRef = useRef(true);
  const heldRef = useRef<number | null>(null);
  const [running, setRunning] = useState(true);
  const [auto, setAuto] = useState(true);
  const [showTrace, setShowTrace] = useState(true);
  const [timeScale, setTimeScale] = useState<number>(TIME_DEF);
  const [grid, setGrid] = useState<number>(PLAN.GRID_DEF);
  const [reading, setReading] = useState<Reading>('nearest');
  const [reach, setReach] = useState<number>(PLAN.REACH.def);
  const [threshold, setThreshold] = useState<number>(PLAN.THRESHOLD);
  const [halfLife, setHalfLife] = useState<number>(halfFromRate(PLAN.DECAY));
  const [speed, setSpeed] = useState<number>(CROWD.SPEED_DEF);
  const [cursor, setCursor] = useState<'crosshair' | 'grab' | 'grabbing'>('crosshair');
  const [hud, setHud] = useState({
    formed: 0,
    half: 0,
    floor: 0,
    t: 0,
    total: PLAN.GRID_DEF * PLAN.GRID_DEF,
    counts: { people: CROWD.OPENING.length, walking: 0, standing: CROWD.OPENING.length, held: 0 },
  });

  const paint = () => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    const pal = palRef.current;
    if (!canvas || !sim || !pal) return;
    const ctx = canvas.getContext('2d');
    if (ctx) drawPlan(ctx, sceneOf(sim, traceRef.current), pal);
  };

  // 建仿真（换格数才重建：单元数变了，痕迹场与读法表要重算；人也重新放）
  useEffect(() => {
    const sim = new CrowdSim({ grid, reading, reach, threshold, decay: rateFromHalf(halfLife), speed, auto });
    simRef.current = sim;
    heldRef.current = null;
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);
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
  useEffect(() => {
    simRef.current?.setAuto(auto);
  }, [auto]);

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
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastHud = useRef('');
  useBenchLoop(
    canvasRef,
    (dt) => {
      const sim = simRef.current;
      if (!sim || !palRef.current) return;
      if (runningRef.current) sim.step(Math.min(MAX_SIM_DT, dt * timeRef.current));
      paint();
      const counts = sim.counts();
      const formed = sim.act.formed().length;
      const half = sim.act.countAtLeast(0.5);
      const key = `${Math.floor(sim.t)}|${formed}|${half}|${counts.people}|${counts.walking}|${counts.held}`;
      if (key !== lastHud.current) {
        lastHud.current = key;
        setHud({ formed, half, floor: sim.field.max(), t: sim.t, total: sim.layout.units.length, counts });
      }
    },
    [],
    active,
  );

  // 指针：按住人 = 拖；按空地 = 放人
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const { x, y } = canvasToRoom(canvas, e.clientX, e.clientY, sim.layout.roomM);
    const hit = sim.personAt(x, y);
    if (hit) {
      heldRef.current = hit.id;
      sim.hold(hit.id, x, y);
      canvas.setPointerCapture(e.pointerId);
      setCursor('grabbing');
    } else {
      const h = sim.layout.roomM / 2;
      if (Math.abs(x) <= h && Math.abs(y) <= h) sim.add(x, y);
    }
    paint();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const { x, y } = canvasToRoom(canvas, e.clientX, e.clientY, sim.layout.roomM);
    if (heldRef.current !== null) {
      sim.drag(heldRef.current, x, y);
      if (!runningRef.current) paint();
      return;
    }
    const next = sim.personAt(x, y) ? 'grab' : 'crosshair';
    if (next !== cursor) setCursor(next);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas || heldRef.current === null) return;
    sim.release(heldRef.current);
    heldRef.current = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    setCursor('grab');
    paint();
  };

  const readingLabel = READINGS.find((r) => r.key === reading)!;

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
          <div style={{ color: 'var(--accent)' }}>Lab.15 / Project II</div>
          <div>{t.title}</div>
          <div className="dim">{t.sub}</div>
        </div>
        <div className="lab-hud br">
          <div className="num">{t.formed(hud.formed, hud.total)}</div>
          <div className="dim">{t.line(hud.counts, hud.half, hud.t, hud.floor)}</div>
        </div>
        <div className="lab-hud bl dim">
          {t.foot(reach, threshold, halfLife, lang === 'zh' ? readingLabel.zh : readingLabel.en)}
        </div>
      </div>
      {controls ? (
        <div className="lab-ctl lab-ctl--tiered">
          <div className="lab-ctl__row lab-ctl__solve">
            <div className="grp">
              <span className="k">{t.grid}</span>
              <span className="seg">
                {PLAN.GRIDS.map((n) => (
                  <button key={n} type="button" className={n === grid ? 'active' : undefined} onClick={() => setGrid(n)}>
                    {n}×{n}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <span className="k">{t.reading}</span>
              <span className="seg">
                {READINGS.map((r) => (
                  <button key={r.key} type="button" className={r.key === reading ? 'active' : undefined} onClick={() => setReading(r.key)}>
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
              <input type="range" min={2} max={40} step={1} value={threshold} aria-label={t.threshold} style={{ width: 84 }} onChange={(e) => setThreshold(Number(e.target.value))} />
            </div>
            <div className="grp">
              <span className="k">
                {t.half_} {halfLife.toFixed(0)} s
              </span>
              <input type="range" min={HALF.min} max={HALF.max} step={1} value={halfLife} aria-label={t.half_} style={{ width: 84 }} onChange={(e) => setHalfLife(Number(e.target.value))} />
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
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                {t.auto}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showTrace}
                  onChange={(e) => {
                    traceRef.current = e.target.checked;
                    setShowTrace(e.target.checked);
                    paint();
                  }}
                />
                {t.trace}
              </label>
            </div>
            <div className="grp">
              <button
                type="button"
                onClick={() => {
                  const sim = simRef.current;
                  if (!sim) return;
                  const half = sim.layout.fieldM / 2;
                  sim.add((Math.random() * 2 - 1) * half, (Math.random() * 2 - 1) * half);
                  paint();
                }}
              >
                {t.add}
              </button>
              <button
                type="button"
                onClick={() => {
                  simRef.current?.removeLast();
                  paint();
                }}
              >
                {t.remove}
              </button>
              <button
                type="button"
                title={lang === 'zh' ? '撤掉全部人，看痕迹怎么退、成形怎么留' : 'remove everyone and watch the trace fade while the formed units stay'}
                onClick={() => {
                  simRef.current?.clearPeople();
                  paint();
                }}
              >
                {t.clearPeople}
              </button>
              <button
                type="button"
                onClick={() => {
                  simRef.current?.clearTraces();
                  paint();
                }}
              >
                {t.clear}
              </button>
            </div>
            <div className="grp">
              <span className="k">
                {t.speed} {speed.toFixed(1)} m/s
              </span>
              <input type="range" min={PLAN.SPEED.min} max={PLAN.SPEED.max} step={0.1} value={speed} aria-label={t.speed} style={{ width: 84 }} onChange={(e) => setSpeed(Number(e.target.value))} />
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
