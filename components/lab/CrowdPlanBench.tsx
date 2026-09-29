'use client';

import { useBenchLang, useLabText } from './LabLanguage';

import { LabControlLabel } from './LabControlLabel';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CROWD, CrowdSim } from '../../src/lib/space/crowd-plan';
import { PLAN, READINGS, RESPONSES, keepOut, type Reading, type ResponseMode } from '../../src/lib/space/unit-activation';
import { H, W, canvasToRoom, drawPlan, readPalette, type Palette } from './planDraw';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.15 · 几个人在场（用户 2026-09-04 立项「做一个 lab 模拟：人是可动的，也可以放多人，直接演示这些单元的变化」）。
 *
 * Lab.14 是一个人按预设走一遍看结果；这台是现场：点地面放人（最多 8 个），按住一个人拖着走，
 * 开「自走」让他们自己漫步（随机目标 + 随机站 2–30 s，**演示装置不是行为规则**），地面实时记痕迹、
 * 单元实时长出来。机制一个数不改（unit-activation 同一份），新增的只有多个人与人怎么动（crowd-plan.ts）。
 * 画法与 Lab.14 共用 planDraw.ts。
 * 人有朝向、有身体（2026-09-05）：视野 / 让位 D / 走廊三件与 Lab.14 同一套选项（unit-activation），闸按每个在场的人
 * 各算取并集；这里只多两组旋钮与画法。
 */
const TIME_SCALES = [1, 3, 8] as const;
/** 默认 ×1：这台演示的是人怎么在房间里慢慢待着，按真实节奏看（Lab.14 仍 ×3——那台是走一遍看结果） */
const TIME_DEF = 1;
/** 「散掉」滑块（s）：人不在的地方几秒把痕迹退光（线性褪去，见 PLAN.DEMO） */
const FADE = { min: 2, max: 60 } as const;
const MAX_SIM_DT = 0.05 * 8 * 1.01;
/** 视野滑块（度）：60°–360°，360 = 全圆（旧口径） */
const FOV_DEG = { min: 60, max: 360, def: Math.round((PLAN.ATTENTION.fov * 180) / Math.PI) } as const;

const COPY = {
  zh: {
    aria: '房间平面中的人物与单元；结构按地面痕迹成形，响应可选跟随或锁定',
    title: '几个人在场',
    sub: '平面 · 放人 · 拖 · 自走 → 单元实时成形',
    formed: (n: number, total: number) => `成形 ${n} / ${total}`,
    line: (c: { people: number; walking: number; standing: number; held: number }, half: number, t: number, floor: number) =>
      `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · ${c.people} 人（走 ${c.walking} · 站 ${c.standing}${c.held ? ` · 拖 ${c.held}` : ''}）· 半成以上 ${half} · 地面最深 ${floor.toFixed(1)} s`,
    foot: (reach: number, thr: number, fade: number, reading: string, mode: ResponseMode, fovDeg: number, D: number | null, fill: number) =>
      `影响半径 ${reach.toFixed(2)} m · 视野 ${fovDeg.toFixed(0)}° · ${D === null ? '不让位' : `让位 D ${D.toFixed(2)} m`} · 阈值 ${thr.toFixed(0)} s × 占比 ${(fill * 100).toFixed(0)}% · 散掉 ${fade.toFixed(0)} s · ${reading}读 · 绿盘 = 当前读数 · 紫环 = ${mode === 'follow' ? '结构位置（人走了收回去）' : '成形（键锁死，不回退）'} · 点地面放人 · 按住拖`,
    gated: (n: number) => `闸住 ${n}`,
    attention: `痕迹只记录在视野内。平台会避开身体与前方通道，粉色 × 表示该单元被阻挡。「占比」越低，视野边缘的单元越容易成形。`,
    hint: `点空地添加人物，按住拖动，最多 ${CROWD.MAX_PEOPLE} 人。「自走」让人物随机走动、停留。跟随模式在人走后收回结构；锁定模式保留成形。清空人数只移除人物；清空痕迹重置地面记录和成形。`,
    grid: '格数',
    reading: '读法',
    reach: '影响半径',
    fov: '视野',
    clearance: '让位',
    look: '转头',
    fill: '占比',
    threshold: '阈值',
    half_: '散掉',
    response: '响应',
    people: '人物',
    legend: (mode: ResponseMode) => `绿盘 = 当前读数 · 紫环 = ${mode === 'follow' ? '结构位置（人走了收回去）' : '成形（键锁死，不回退）'}`,
    run: '运转',
    auto: '自走',
    trace: '痕迹',
    add: '+ 人',
    remove: '− 人',
    clearPeople: '清空人数',
    clear: '清空痕迹',
    speed: '步速',
    time: '时间',
  },
  en: {
    aria: 'People and units in a room plan; floor traces activate units, with follow or lock response',
    title: 'A few people',
    sub: 'Plan · place · drag · wander → units form live',
    formed: (n: number, total: number) => `formed ${n} / ${total}`,
    line: (c: { people: number; walking: number; standing: number; held: number }, half: number, t: number, floor: number) =>
      `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · ${c.people} people (${c.walking} walking · ${c.standing} standing${c.held ? ` · ${c.held} held` : ''}) · ${half} at half or more · deepest floor trace ${floor.toFixed(1)} s`,
    foot: (reach: number, thr: number, fade: number, reading: string, mode: ResponseMode, fovDeg: number, D: number | null, fill: number) =>
      `reach ${reach.toFixed(2)} m · field of view ${fovDeg.toFixed(0)}° · ${D === null ? 'no clearance' : `clearance D ${D.toFixed(2)} m`} · threshold ${thr.toFixed(0)} s × floor share ${(fill * 100).toFixed(0)}% · fade ${fade.toFixed(0)} s · ${reading} · green disc = live reading · purple ring = ${mode === 'follow' ? 'where the structure is — it withdraws once they leave' : 'formed; bonds locked, never undone'} · click to place · hold to drag`,
    gated: (n: number) => `${n} held back`,
    attention: `Traces stay within the field of view. Units keep clear of bodies and the path ahead; a rose × marks a blocked unit. Lower floor share makes units at the edge of the view easier to form.`,
    hint: `Click empty floor to add up to ${CROWD.MAX_PEOPLE} people; hold to drag. Wander makes them walk and pause at random. Follow withdraws structures as people leave; lock keeps them formed. Clear people removes people only; clear traces resets floor readings and formed units.`,
    grid: 'grid',
    reading: 'reading',
    reach: 'reach',
    fov: 'view',
    clearance: 'clearance',
    look: 'look around',
    fill: 'floor share',
    threshold: 'threshold',
    half_: 'fade',
    response: 'response',
    people: 'People',
    legend: (mode: ResponseMode) => `Green disc = live reading · purple ring = ${mode === 'follow' ? 'structure position; withdraws once they leave' : 'formed; bonds locked, never undone'}`,
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
    people: sim.people.map((p) => ({
      x: p.walker.x,
      y: p.walker.y,
      heading: p.walker.heading,
      reach: sim.reach,
      held: p.mode === 'held',
      fov: sim.fov,
      keepOut: sim.keepOutM,
      lane: sim.lane && p.moving,
      gaze: p.walker.gaze,
    })),
    showTrace,
    blocked: sim.clearance === null ? null : sim.blocked,
  };
}

/** Reuse the bench's original instructions in the always-visible explanation column. */
export function CrowdPlanNotes({ lang: explicitLang }: { lang?: 'zh' | 'en' }) {
  const lang = useBenchLang(explicitLang);
  const tx = useLabText(lang);
  const t = COPY[lang];
  return <div className="walk-notes">
    <h3>{lang === 'zh' ? tx('操作说明') : tx('How to use')}</h3>
    <p>{t.hint}</p>
    <h3>{lang === 'zh' ? tx('行为与成形') : tx('Behaviour and forming')}</h3>
    <p>{t.attention}</p>
  </div>;
}

export function CrowdPlanBench({
  active = true,
  onLight = false,
  controls = true,
  lang: explicitLang,
  workspace = false,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
  lang?: 'zh' | 'en';
  workspace?: boolean;
}) {
  const lang = useBenchLang(explicitLang);
  const tx = useLabText(lang);
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
  const [reach, setReach] = useState<number>(PLAN.ATTENTION.reach);
  const [fovDeg, setFovDeg] = useState<number>(FOV_DEG.def);
  const [clearOn, setClearOn] = useState(true);
  const [clearance, setClearance] = useState<number>(PLAN.ATTENTION.clearance);
  const [look, setLook] = useState<boolean>(PLAN.ATTENTION.look);
  const [fill, setFill] = useState<number>(PLAN.FILL.def);
  const [threshold, setThreshold] = useState<number>(PLAN.DEMO.threshold);
  const [fade, setFade] = useState<number>(PLAN.DEMO.fade);
  const [mode, setMode] = useState<ResponseMode>('follow');
  const [speed, setSpeed] = useState<number>(CROWD.SPEED_DEF);
  const [cursor, setCursor] = useState<'crosshair' | 'grab' | 'grabbing'>('crosshair');
  const fov = (fovDeg * Math.PI) / 180;
  const clearanceOpt = clearOn ? clearance : null;
  const [hud, setHud] = useState({
    formed: 0,
    half: 0,
    floor: 0,
    gated: 0,
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
    const sim = new CrowdSim({ grid, reading, reach, threshold, fade, speed, auto, mode, fov, clearance: clearanceOpt, lane: clearanceOpt !== null, look, fill });
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
    simRef.current?.setFade(fade);
  }, [fade]);
  useEffect(() => {
    simRef.current?.setSpeed(speed);
  }, [speed]);
  useEffect(() => {
    simRef.current?.setAuto(auto);
  }, [auto]);
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
  useEffect(() => {
    simRef.current?.setFill(fill);
  }, [fill]);

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
      let gated = 0;
      if (sim.clearance !== null) for (let i = 0; i < sim.blocked.length; i++) gated += sim.blocked[i];
      const key = `${Math.floor(sim.t)}|${formed}|${half}|${counts.people}|${counts.walking}|${counts.held}|${gated}`;
      if (key !== lastHud.current) {
        lastHud.current = key;
        setHud({ formed, half, floor: sim.field.max(), gated, t: sim.t, total: sim.layout.units.length, counts });
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
  const D = clearanceOpt === null ? null : keepOut(simRef.current?.layout ?? new CrowdSim({ grid, opening: false }).layout, clearanceOpt);

  const peopleControls = <div className={`grp${workspace ? ' walk-behaviour crowd-people' : ''}`}>
    {workspace && <LabControlLabel help={["添加、移除或清空人物；清空痕迹会重置地面记录和成形状态。", "Add or remove people. Clear traces resets floor readings and formed units."]} lang={lang}>{t.people}</LabControlLabel>}
    <span className={workspace ? 'seg' : undefined} style={workspace ? undefined : { display: 'contents' }}>
      <button type="button" onClick={() => {
        const sim = simRef.current;
        if (!sim) return;
        const half = sim.layout.fieldM / 2;
        sim.add((Math.random() * 2 - 1) * half, (Math.random() * 2 - 1) * half);
        paint();
      }}>{t.add}</button>
      <button type="button" onClick={() => { simRef.current?.removeLast(); paint(); }}>{t.remove}</button>
      <button type="button"
        title={tx(lang === 'zh' ? '移除全部人物，保留已有痕迹' : 'Remove all people and keep the existing traces')}
        onClick={() => { simRef.current?.clearPeople(); paint(); }}>{t.clearPeople}</button>
      <button type="button" onClick={() => { simRef.current?.clearTraces(); paint(); }}>{t.clear}</button>
    </span>
  </div>;

  return (
    <div ref={wrapRef} className={`lab-wrap${onLight ? ' on-light' : ''}${workspace ? ' walk-workbench' : ''}`}>
      <div className="lab-fig">
        <div className="walk-map" style={workspace ? undefined : { display: 'contents' }}>
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
        </div>
        <div className="lab-hud tl">
          <div style={{ color: 'var(--accent)' }}>{tx("Lab 2-11 / Project II")}</div>
          <div>{tx(t.title)}</div>
          <div className="dim">{t.sub}</div>
        </div>
        <div className="lab-hud br">
          <div className="num">{t.formed(hud.formed, hud.total)}</div>
          <div className="dim">
            {t.line(hud.counts, hud.half, hud.t, hud.floor)}
            {clearanceOpt !== null ? ` · ${t.gated(hud.gated)}` : ''}
          </div>
        </div>
        <div className="lab-hud bl dim">
          {workspace ? t.legend(mode) : t.foot(reach, threshold, fade, lang === 'zh' ? readingLabel.zh : readingLabel.en, mode, fovDeg, D, fill)}
        </div>
      </div>
      {controls ? (
        <div className="lab-ctl lab-ctl--tiered">
          <div className="lab-ctl__row lab-ctl__solve">
            {workspace && peopleControls}
            <div className="grp">
              <LabControlLabel help={["选择每行、每列的单元数。格数越多，单元越小。", "Choose rows and columns. More cells make smaller units."]} lang={lang}>{t.grid}</LabControlLabel>
              <span className="seg">
                {PLAN.GRIDS.map((n) => (
                  <button key={n} type="button" className={n === grid ? 'active' : undefined} onClick={() => setGrid(n)}>
                    {n}×{n}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <LabControlLabel help={["按格：读取单元所在分区；脚下：只读取平台覆盖的地面。", "By cell reads the assigned floor region; footprint reads only the platform area."]} lang={lang}>{t.reading}</LabControlLabel>
              <span className="seg">
                {READINGS.map((r) => (
                  <button key={r.key} type="button" className={r.key === reading ? 'active' : undefined} onClick={() => setReading(r.key)}>
                    {lang === 'zh' ? r.zh : r.en}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <LabControlLabel help={["跟随：痕迹减弱后收回；锁定：保留已成形的结构。", "Follow withdraws as traces fade. Lock keeps formed structures."]} lang={lang}>{t.response}</LabControlLabel>
              <span className="seg">
                {RESPONSES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className={r.key === mode ? 'active' : undefined}
                    title={
                      tx(r.key === 'follow'
                        ? lang === 'zh'
                          ? '结构追着读数涨落，人走了收回去'
                          : 'the structure tracks the reading and withdraws once people leave'
                        : lang === 'zh'
                          ? '键锁死、不回退——项目立论的滞回'
                          : 'bonds lock and never release — the hysteresis the project argues for')
                    }
                    onClick={() => setMode(r.key)}
                  >
                    {lang === 'zh' ? r.zh : r.en}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <LabControlLabel help={["每个人能在地面留下痕迹的最远距离。", "The furthest distance at which each person can leave a floor trace."]} lang={lang}>
                {t.reach} {reach.toFixed(2)} {tx("m")}
              </LabControlLabel>
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
            <div className="grp walk-fov">
              <LabControlLabel help={["留下痕迹的视野角度；360°覆盖四周。", "The angle that leaves a floor trace; 360° covers all directions."]} lang={lang}>
                {t.fov} {fovDeg.toFixed(0)}°
              </LabControlLabel>
              <input
                type="range"
                min={FOV_DEG.min}
                max={FOV_DEG.max}
                step={10}
                value={fovDeg}
                aria-label={t.fov}
                title={tx(lang === 'zh' ? '痕迹只落在朝向前方这个角度里；360° = 全圆（旧口径）' : 'the trace lands only within this angle ahead; 360° = full circle (the old reading)')}
                style={{ width: 84 }}
                onChange={(e) => setFovDeg(Number(e.target.value))}
              />
              <label>
                <input
                  type="checkbox"
                  checked={look}
                  title={tx(lang === 'zh' ? '站着时头会转：视线离开朝向，扇面跟着视线走；走着时看向前方' : 'the head turns while standing: the gaze leaves the facing and the wedge follows it; while walking they look ahead')}
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
                  title={tx(lang === 'zh' ? '平台离身体至少留这么远才许下来；走廊随之开' : 'a platform must keep this far from the body before it may come down; the lane follows')}
                  onChange={(e) => setClearOn(e.target.checked)}
                />
                {t.clearance} {clearance.toFixed(2)} {tx("m")}
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
              <LabControlLabel help={["地面读数达到“阈值 × 占比”时，单元开始成形。", "A unit forms when its mean floor trace reaches threshold × floor share."]} lang={lang}>
                {t.threshold} {threshold.toFixed(0)} {tx("s")}
              </LabControlLabel>
              <input type="range" min={1} max={40} step={1} value={threshold} aria-label={t.threshold} style={{ width: 84 }} onChange={(e) => setThreshold(Number(e.target.value))} />
            </div>
            <div className="grp">
              <LabControlLabel help={["降低占比可让视野边缘的单元更容易成形。", "Lower the required floor share to form units at the edge of the view."]} lang={lang}>
                {t.fill} {(fill * 100).toFixed(0)}%
              </LabControlLabel>
              <input
                type="range"
                min={PLAN.FILL.min}
                max={PLAN.FILL.max}
                step={0.05}
                value={fill}
                aria-label={t.fill}
                title={tx(lang === 'zh' ? '脚下有多大比例的地面被看够了就下来；100% = 整片都要（旧口径）' : 'how much of the floor a unit owns must have been looked at long enough before it comes down; 100% = all of it (the old reading)')}
                style={{ width: 72 }}
                onChange={(e) => setFill(Number(e.target.value))}
              />
            </div>
            <div className="grp">
              <LabControlLabel help={["停止留下痕迹后，地面读数衰减至零所需的时间。", "Time for a full floor trace to fade to zero after people leave."]} lang={lang}>
                {t.half_} {fade.toFixed(0)} {tx("s")}
              </LabControlLabel>
              <input type="range" min={FADE.min} max={FADE.max} step={1} value={fade} aria-label={t.half_} style={{ width: 84 }} onChange={(e) => setFade(Number(e.target.value))} />
            </div>
          </div>
          <div className="lab-ctl__row walk-playback">
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
            {!workspace && peopleControls}
            <div className="grp">
              <LabControlLabel help={["人物在房间内行走的速度。", "How fast people walk through the room."]} lang={lang}>
                {t.speed} {speed.toFixed(1)} {tx("m/s")}
              </LabControlLabel>
              <input type="range" min={PLAN.SPEED.min} max={PLAN.SPEED.max} step={0.1} value={speed} aria-label={t.speed} style={{ width: 84 }} onChange={(e) => setSpeed(Number(e.target.value))} />
            </div>
            <div className="grp">
              <LabControlLabel help={["仿真播放倍速；×3 表示一秒播放三秒的过程。", "Simulation playback rate; ×3 runs three simulated seconds per second."]} lang={lang}>{t.time}</LabControlLabel>
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
            {!workspace && <><p className="lab-ctl__hint">{t.attention}</p><p className="lab-ctl__hint">{t.hint}</p></>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
