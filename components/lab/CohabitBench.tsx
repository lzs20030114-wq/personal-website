'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useBenchLang, useLabText } from './LabLanguage';
import { LabControlLabel } from './LabControlLabel';
import { COHABIT, CohabitSim, FACE_MODES, SPACE_MODES, type Cat, type FaceMode, type SpaceMode } from '../../src/lib/space/cohabit';
import { PLAN, RESPONSES, type ResponseMode } from '../../src/lib/space/unit-activation';
import type { CatPose } from '../../src/lib/space/cat-rules';
import { H, W, canvasToRoom, drawPlan, readPalette, type Palette, type PlanPerson } from './planDraw';
import { planFromHash } from './planHash';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab 2-14 · 人猫同台（2026-10-06 开工，待办第一步 1–3 + 第二步 4–5）。
 * 2-11 的访客与 2-12 的住户猫放进同一间房、同一片单元：两种代价（墙 / 停留）· R1–R5 · 四类相遇事件记账
 * · 空间的目的「促成相遇」。模型 = src/lib/space/cohabit.ts；画法复用 planDraw（墙 / R5 / 事件线三层是本轮加的）。
 * 三档「空间」给对照（会动 / 钉死 / 空房间），HUD 实时读四类事件数与猫在 1 m 外的时间占比（参照 M&T 0.78）。
 * 让路两档（2026-10-07 作者「人穿过只收相对的两个面」）：按带 = 挡人的带各自收回到芯上（默认）；整台 = 2-11 的让位闸。
 */
const TIME_SCALES = [1, 3, 8] as const;
const TIME_DEF = 1;
const MAX_SIM_DT = 0.05 * 8 * 1.01;

const COPY = {
  zh: {
    aria: '人与猫在同一间房的平面：访客在地面走，猫住在单元上，单元按两边的痕迹落下收回，右下读四类相遇事件',
    title: '人猫同台',
    sub: '平面 · 访客 + 住户猫 · 两种代价 · 四类事件',
    formed: (n: number, total: number) => `成形 ${n} / ${total}`,
    events: (c: Record<string, number>, s: Record<string, number>) =>
      `共视 ${c.gaze}（${s.gaze.toFixed(0)} s）· 共温 ${c.warmth}（${s.warmth.toFixed(0)} s）· 共触 ${c.touch} · 交接 ${c.pass}`,
    line: (t: number, people: number, cats: number, far: number, held: number, detour: number, bands: number | null) =>
      `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · ${people} 人 · ${cats} 猫 · 猫在 1 m 外 ${(far * 100).toFixed(0)}%（参照 78%）· 绕行 ${detour.toFixed(1)} m${bands !== null ? ` · 让路 ${bands} 条带` : ''}${held ? ` · R5 钉住 ${held}` : ''}`,
    legend: '实墨圈 = 对人是墙 · 紫环 = 成形（缺口 = 收回的带）· 芯上短横 = R5 钉住 · 连线：绿虚 共视 / 紫 共温 / 粉 共触 / 墨 交接',
    hint: `点空地放访客，按住拖；猫可拖到任一单元。「自走」让访客漫步（一半几率去看猫）、猫按坐 / 卧 / 换格的节奏活动。最多 ${COHABIT.MAX_PEOPLE} 人 ${COHABIT.MAX_CATS} 猫。`,
    rules: '通行代价：落下的单元对人是墙、对猫不是。停留代价：访客被别人贴到 1.35 m 以内就走；猫被访客贴到 1 m 以内撑过几秒就退到更远的格，之后一阵不再靠人；有人站着盯着它，它有三分之一几率靠到台边。空间只写单元：猫脚下钉住，猫四邻里人的痕迹最高的一格补满，落下会困住人的不落。让路按带：一个单元二十条带，挡在人身边或人路上的那几条各自收回到杆上（布回到顶上），其余照落；猫身下的带不收；人走到门口门正好开，走过去再落回。',
    space: '空间',
    grid: '格数',
    response: '响应',
    goal: '促成相遇',
    look: '转头',
    faces: '让路',
    clearance: '让位',
    threshold: '阈值',
    fade: '散掉',
    people: '人物',
    run: '运转',
    auto: '自走',
    trace: '痕迹',
    addP: '+ 人',
    removeP: '− 人',
    addC: '+ 猫',
    removeC: '− 猫',
    clear: '清空痕迹',
    reset: '清零计数',
    speed: '步速',
    time: '时间',
  },
  en: {
    aria: 'People and cats in one room plan: visitors walk the floor, cats live on the units, units follow both traces, the four encounter events are counted at the bottom right',
    title: 'People and cats together',
    sub: 'Plan · visitors + resident cats · two costs · four events',
    formed: (n: number, total: number) => `formed ${n} / ${total}`,
    events: (c: Record<string, number>, s: Record<string, number>) =>
      `co-gaze ${c.gaze} (${s.gaze.toFixed(0)} s) · co-warmth ${c.warmth} (${s.warmth.toFixed(0)} s) · contact ${c.touch} · crossing ${c.pass}`,
    line: (t: number, people: number, cats: number, far: number, held: number, detour: number, bands: number | null) =>
      `t ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} · ${people} people · ${cats} cats · cat beyond 1 m ${(far * 100).toFixed(0)}% (reference 78%) · detour ${detour.toFixed(1)} m${bands !== null ? ` · ${bands} bands giving way` : ''}${held ? ` · R5 held ${held}` : ''}`,
    legend: 'Solid ink ring = wall for people · purple ring = formed (notch = retracted band) · bar on the mast = held by R5 · links: green dashed co-gaze / purple co-warmth / rose contact / ink crossing',
    hint: `Click empty floor to add a visitor and hold to drag; a cat can be dragged onto any unit. Wander lets visitors roam (half the time towards a cat) and cats sit, lie and move between units. Up to ${COHABIT.MAX_PEOPLE} people and ${COHABIT.MAX_CATS} cats.`,
    rules: 'Passage cost: a formed unit is a wall for people, not for cats. Staying cost: a visitor leaves when another comes within 1.35 m; a cat tolerates a visitor within 1 m for a few seconds, then retreats to a farther unit and keeps away for a while; when someone stands watching it, it approaches the platform edge one time in three. The space only writes units: the cat’s own unit stays formed, the neighbour with the strongest people trace is filled, and a unit that would trap someone is held back. Giving way by band: a unit has twenty bands; the few beside a person or on their route retract to the post (the cloth goes back up) while the rest come down; bands under a cat never retract; the door is open by the time the person reaches it and closes behind them.',
    space: 'space',
    grid: 'grid',
    response: 'response',
    goal: 'promote encounters',
    look: 'look around',
    faces: 'giving way',
    clearance: 'clearance',
    threshold: 'threshold',
    fade: 'fade',
    people: 'Bodies',
    run: 'run',
    auto: 'wander',
    trace: 'trace',
    addP: '+ person',
    removeP: '− person',
    addC: '+ cat',
    removeC: '− cat',
    clear: 'clear trace',
    reset: 'reset counts',
    speed: 'pace',
    time: 'time',
  },
} as const;

function poseOf(c: Cat): CatPose {
  if (c.mode === 'held') return 'stand';
  if (c.walker.state === 'walk') return 'walk';
  if (c.state === 'lie') return 'lie';
  if (c.state === 'approach') return 'crouch';
  return 'sit';
}

function sceneOf(sim: CohabitSim, showTrace: boolean) {
  const people: PlanPerson[] = sim.people.map((p) => ({
    x: p.walker.x,
    y: p.walker.y,
    heading: p.walker.heading,
    gaze: p.walker.gaze,
    reach: sim.reach,
    held: p.mode === 'held',
    fov: sim.fov,
    // 按带：画的是身体 + 让位那一小圈（带离它就收）；整台：画让位距离 D（芯到人）
    keepOut: sim.faces ? sim.marginM : sim.keepOutM,
    lane: !sim.faces && sim.lane && p.moving,
  }));
  for (const c of sim.cats)
    people.push({
      kind: 'cat',
      pose: poseOf(c),
      motionTime: c.phaseTime,
      bodyR: COHABIT.CAT.bodyR,
      x: c.walker.x,
      y: c.walker.y,
      heading: c.walker.heading,
      gaze: c.walker.gaze,
      reach: 0,
      held: c.mode === 'held',
    });
  const supportIds = sim.cats.flatMap((c) => sim.supportOf(c).map((u) => u.i));
  const landing = sim.cats.find((c) => c.pending)?.pending?.i ?? null;
  return {
    layout: sim.layout,
    field: sim.field,
    catchment: sim.catchment,
    act: sim.act,
    people,
    showTrace,
    blocked: sim.clearance === null || sim.faces ? null : sim.blocked,
    bands: sim.faces && sim.space === 'live' ? { open: sim.bandOpen, hold: sim.bandHold, count: COHABIT.FACES.BANDS } : null,
    supportIds: sim.space === 'empty' ? undefined : supportIds,
    landingId: sim.space === 'empty' ? null : landing,
    walls: sim.space === 'empty' ? null : sim.wall,
    heldR5: sim.space === 'live' ? sim.heldR5 : null,
    links: sim.links,
    hideUnits: sim.space === 'empty',
  };
}

export function CohabitNotes({ lang: explicitLang }: { lang?: 'zh' | 'en' }) {
  const lang = useBenchLang(explicitLang);
  const tx = useLabText(lang);
  const t = COPY[lang];
  return (
    <div className="walk-notes">
      <h3>{lang === 'zh' ? tx('操作说明') : tx('How to use')}</h3>
      <p>{t.hint}</p>
      <h3>{lang === 'zh' ? '规则' : 'Rules'}</h3>
      <p>{t.rules}</p>
      <h3>{lang === 'zh' ? '读数' : 'Readings'}</h3>
      <p>
        {lang === 'zh'
          ? '四类事件按正文的定义记：共视 = 互相看着对方满 1 秒，共温 = 在对方 0.5–1.5 m 带内站满 2 秒，共触 = 距离小于 0.5 m，交接 = 走着穿过对方 1.5 m 的身体域。空事件要「招引」，人的行为里还没有，不记。「猫在 1 m 外」的占比只当参照：Mertens 与 Turner 1988 量到人不理猫时是 78%，这里不拿它拟合。'
          : 'The four events follow the text: co-gaze = looking at each other for 1 s, co-warmth = standing in the other’s 0.5–1.5 m band for 2 s, contact = closer than 0.5 m, crossing = walking through the other’s 1.5 m body domain. The empty event needs an invitation gesture, which people do not have yet, so it is not counted. The share of time the cat spends beyond 1 m is a reference only: Mertens and Turner (1988) measured 78% when people ignored the cat; nothing here is fitted to it.'}
      </p>
    </div>
  );
}

export function CohabitBench({
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
  const simRef = useRef<CohabitSim | null>(null);
  const palRef = useRef<Palette | null>(null);
  const runningRef = useRef(true);
  const timeRef = useRef<number>(TIME_DEF);
  const traceRef = useRef(true);
  const heldRef = useRef<{ kind: 'person' | 'cat'; id: number } | null>(null);
  const [running, setRunning] = useState(true);
  const [auto, setAuto] = useState(true);
  const [showTrace, setShowTrace] = useState(true);
  const [timeScale, setTimeScale] = useState<number>(TIME_DEF);
  const [grid, setGrid] = useState<number>(COHABIT.GRID_DEF);
  const [space, setSpace] = useState<SpaceMode>('live');
  const [mode, setMode] = useState<ResponseMode>('follow');
  const [goal, setGoal] = useState(true);
  const [faceMode, setFaceMode] = useState<FaceMode>('bands');
  const [look, setLook] = useState<boolean>(PLAN.ATTENTION.look);
  const [clearOn, setClearOn] = useState(true);
  const [clearance, setClearance] = useState<number>(PLAN.ATTENTION.clearance);
  const clearanceOpt = clearOn ? clearance : null;
  const [threshold, setThreshold] = useState<number>(PLAN.DEMO.threshold);
  const [fade, setFade] = useState<number>(PLAN.DEMO.fade);
  const [speed, setSpeed] = useState<number>(COHABIT.VISITOR.speed);
  const [cursor, setCursor] = useState<'crosshair' | 'grab' | 'grabbing'>('crosshair');
  const [hud, setHud] = useState(() => ({
    formed: 0,
    total: COHABIT.GRID_DEF * COHABIT.GRID_DEF,
    t: 0,
    people: 1,
    cats: 1,
    far: 1,
    held: 0,
    detour: 0,
    bands: 0 as number | null,
    counts: { gaze: 0, warmth: 0, touch: 0, pass: 0 } as Record<string, number>,
    seconds: { gaze: 0, warmth: 0, touch: 0, pass: 0 } as Record<string, number>,
  }));

  const paint = () => {
    const canvas = canvasRef.current;
    const sim = simRef.current;
    const pal = palRef.current;
    if (!canvas || !sim || !pal) return;
    const ctx = canvas.getContext('2d');
    if (ctx) drawPlan(ctx, sceneOf(sim, traceRef.current), pal);
  };

  // 建仿真（换格数才重建；换「空间」档走 setSpace，人与猫留在原地）
  useEffect(() => {
    const sim = new CohabitSim({ grid, space, mode, goal, look, threshold, fade, auto, clearance: clearanceOpt, lane: clearanceOpt !== null, faces: faceMode === 'bands' });
    sim.setSpeed(speed);
    simRef.current = sim;
    heldRef.current = null;
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);
  useEffect(() => {
    simRef.current?.setSpace(space);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space]);
  useEffect(() => {
    simRef.current?.setMode(mode);
  }, [mode]);
  useEffect(() => {
    if (simRef.current) simRef.current.goal = goal;
  }, [goal]);
  useEffect(() => {
    simRef.current?.setFaces(faceMode === 'bands');
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faceMode]);
  useEffect(() => {
    simRef.current?.setLook(look);
  }, [look]);
  useEffect(() => {
    simRef.current?.setClearance(clearanceOpt);
  }, [clearanceOpt]);
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
    const preset = planFromHash('2-14', SPACE_MODES.map((m) => m.key));
    if (preset) setSpace(preset);
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
      const s = sim.summary();
      const key = `${Math.floor(s.t)}|${s.formed}|${s.people}|${s.cats}|${s.ledger.counts.gaze}|${s.ledger.counts.warmth}|${s.ledger.counts.touch}|${s.ledger.counts.pass}|${s.heldR5}|${sim.faces ? s.bandsOpen : '-'}`;
      if (key !== lastHud.current) {
        lastHud.current = key;
        setHud({
          formed: s.formed,
          total: sim.layout.units.length,
          t: s.t,
          people: s.people,
          cats: s.cats,
          far: s.catFarShare,
          held: s.heldR5,
          detour: s.detour,
          bands: sim.faces && sim.space === 'live' ? s.bandsOpen : null,
          counts: { ...s.ledger.counts },
          seconds: { ...s.ledger.seconds },
        });
      }
    },
    [],
    active,
  );

  // 指针：按住人或猫 = 拖；按空地 = 放访客
  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const { x, y } = canvasToRoom(canvas, e.clientX, e.clientY, sim.layout.roomM);
    const hit = sim.bodyAt(x, y);
    if (hit) {
      heldRef.current = hit;
      sim.hold(hit.kind, hit.id, x, y);
      canvas.setPointerCapture(e.pointerId);
      setCursor('grabbing');
    } else {
      const h = sim.layout.roomM / 2;
      if (Math.abs(x) <= h && Math.abs(y) <= h) sim.addPerson(x, y);
    }
    paint();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    if (!sim || !canvas) return;
    const { x, y } = canvasToRoom(canvas, e.clientX, e.clientY, sim.layout.roomM);
    const held = heldRef.current;
    if (held) {
      sim.drag(held.kind, held.id, x, y);
      if (!runningRef.current) paint();
      return;
    }
    const next = sim.bodyAt(x, y) ? 'grab' : 'crosshair';
    if (next !== cursor) setCursor(next);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current;
    const canvas = canvasRef.current;
    const held = heldRef.current;
    if (!sim || !canvas || !held) return;
    sim.release(held.kind, held.id);
    heldRef.current = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    setCursor('grab');
    paint();
  };

  const bodyControls = (
    <div className={`grp${workspace ? ' walk-behaviour crowd-people' : ''}`}>
      {workspace && (
        <LabControlLabel help={['添加、移除访客或猫；清空痕迹不撤掉猫脚下的支撑；清零计数只清四类事件与占比。', 'Add or remove visitors and cats. Clearing traces keeps the cats’ support; reset counts only clears the events and shares.']} lang={lang}>
          {t.people}
        </LabControlLabel>
      )}
      <span className={workspace ? 'seg' : undefined} style={workspace ? undefined : { display: 'contents' }}>
        <button
          type="button"
          onClick={() => {
            const sim = simRef.current;
            if (!sim) return;
            const half = sim.layout.fieldM / 2;
            sim.addPerson((Math.random() * 2 - 1) * half, (Math.random() * 2 - 1) * half);
            paint();
          }}
        >
          {t.addP}
        </button>
        <button type="button" onClick={() => { simRef.current?.removeLastPerson(); paint(); }}>{t.removeP}</button>
        <button
          type="button"
          onClick={() => {
            const sim = simRef.current;
            if (!sim) return;
            const u = sim.layout.units[Math.floor(Math.random() * sim.layout.units.length)];
            sim.addCat(u);
            paint();
          }}
        >
          {t.addC}
        </button>
        <button type="button" onClick={() => { simRef.current?.removeLastCat(); paint(); }}>{t.removeC}</button>
        <button type="button" onClick={() => { simRef.current?.clearTraces(); paint(); }}>{t.clear}</button>
        <button type="button" onClick={() => { simRef.current?.resetLedger(); paint(); }}>{t.reset}</button>
      </span>
    </div>
  );

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
          <div style={{ color: 'var(--accent)' }}>{tx('Lab 2-14 / Project II')}</div>
          <div>{tx(t.title)}</div>
          <div className="dim">{t.sub}</div>
        </div>
        <div className="lab-hud br">
          <div className="num">{t.formed(hud.formed, hud.total)}</div>
          <div className="dim" data-cohabit-events>
            {t.events(hud.counts, hud.seconds)}
            <br />
            {t.line(hud.t, hud.people, hud.cats, hud.far, hud.held, hud.detour, hud.bands)}
          </div>
        </div>
        <div className="lab-hud bl dim">{t.legend}</div>
      </div>
      {controls ? (
        <div className="lab-ctl lab-ctl--tiered">
          <div className="lab-ctl__row lab-ctl__solve">
            <div className="grp walk-behaviour">
              <LabControlLabel help={['会动：单元按两边的痕迹落下收回；钉死：偶数行永远落着，不响应；空房间：没有单元，猫在地面走。三档给对照用。', 'Live: units follow both traces. Fixed: even rows stay formed and never respond. Empty: no units, the cat walks the floor. The three settings are for comparison.']} lang={lang}>
                {t.space}
              </LabControlLabel>
              <span className="seg">
                {SPACE_MODES.map((m) => (
                  <button key={m.key} type="button" className={m.key === space ? 'active' : undefined} onClick={() => setSpace(m.key)}>
                    {lang === 'zh' ? m.zh : m.en}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <LabControlLabel help={['按带：一个单元二十条带，挡在人身边或人路上的那几条各自收回到杆上，其余照落、猫身下的不收，门在人走到之前开好；整台：平台会打到人的单元整台不落（2-11 的让位闸）。', 'By band: a unit has twenty bands; the few beside a person or on their route retract to the post while the rest come down, bands under a cat never retract, the door opens before the person arrives. Whole unit: a unit whose platform would hit someone holds back entirely (the Lab 2-11 clearance gate).']} lang={lang}>
                {t.faces}
              </LabControlLabel>
              <span className="seg">
                {FACE_MODES.map((m) => (
                  <button key={m.key} type="button" className={m.key === faceMode ? 'active' : undefined} onClick={() => setFaceMode(m.key)}>
                    {lang === 'zh' ? m.zh : m.en}
                  </button>
                ))}
              </span>
            </div>
            {workspace && bodyControls}
            <div className="grp">
              <LabControlLabel help={['4×4 是 Lab 2-8 那间房的真实单元尺寸；6×6、8×8 是等比缩小的单元。', '4×4 is the real unit size of the Lab 2-8 room; 6×6 and 8×8 are scaled-down units.']} lang={lang}>
                {t.grid}
              </LabControlLabel>
              <span className="seg">
                {PLAN.GRIDS.map((n) => (
                  <button key={n} type="button" className={n === grid ? 'active' : undefined} onClick={() => setGrid(n)}>
                    {n}×{n}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <LabControlLabel help={['跟随：痕迹褪去后收回；锁定：保留已成形的。猫脚下的单元两档都钉住。', 'Follow withdraws as traces fade; lock keeps formed units. The cat’s own unit is pinned in both.']} lang={lang}>
                {t.response}
              </LabControlLabel>
              <span className="seg">
                {RESPONSES.map((r) => (
                  <button key={r.key} type="button" className={r.key === mode ? 'active' : undefined} onClick={() => setMode(r.key)}>
                    {lang === 'zh' ? r.zh : r.en}
                  </button>
                ))}
              </span>
            </div>
            <div className="grp">
              <label>
                <input type="checkbox" checked={goal} title={tx(lang === 'zh' ? '空间的目的：猫四邻里人的痕迹最高的一格由空间补满，把猫能走的路铺向人多的地方；关 = 单元只跟痕迹' : 'the space’s purpose: the cat’s neighbour with the strongest people trace is filled, laying a route towards people; off = units only follow traces')} onChange={(e) => setGoal(e.target.checked)} />
                {t.goal}
              </label>
              <label>
                <input type="checkbox" checked={look} onChange={(e) => setLook(e.target.checked)} />
                {t.look}
              </label>
            </div>
            <div className="grp">
              <label>
                <input
                  type="checkbox"
                  checked={clearOn}
                  title={tx(lang === 'zh' ? '布离身体至少留这么远。按带：离身体不到「身体 + 让位」的带收回；整台：平台外缘离身体不到这么远的单元整台不落（4×4 下站在交叉点的人离四邻单元中心 0.87 m，0.15 m 会把四台都闸住）' : 'how far the cloth keeps from a body. By band: bands closer than body + clearance retract; whole unit: a unit whose platform edge would come closer holds back entirely (at 4×4 a person at a crossing is 0.87 m from the four neighbours, so 0.15 m holds all four back)')}
                  onChange={(e) => setClearOn(e.target.checked)}
                />
                {t.clearance} {clearance.toFixed(2)} {tx('m')}
              </label>
              <input type="range" min={PLAN.CLEARANCE.min} max={PLAN.CLEARANCE.max} step={0.01} value={clearance} disabled={!clearOn} aria-label={t.clearance} style={{ width: 72 }} onChange={(e) => setClearance(Number(e.target.value))} />
            </div>
            <div className="grp">
              <LabControlLabel help={['地面读数达到阈值时单元成形；猫的落点预备用同一个数。', 'A unit forms when its floor reading reaches the threshold; the cat’s landing uses the same number.']} lang={lang}>
                {t.threshold} {threshold.toFixed(0)} {tx('s')}
              </LabControlLabel>
              <input type="range" min={1} max={40} step={1} value={threshold} aria-label={t.threshold} style={{ width: 84 }} onChange={(e) => setThreshold(Number(e.target.value))} />
            </div>
            <div className="grp">
              <LabControlLabel help={['人与猫离开后，痕迹退光所需的时间。', 'Time for a full trace to fade after people and cats leave.']} lang={lang}>
                {t.fade} {fade.toFixed(0)} {tx('s')}
              </LabControlLabel>
              <input type="range" min={2} max={60} step={1} value={fade} aria-label={t.fade} style={{ width: 84 }} onChange={(e) => setFade(Number(e.target.value))} />
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
            {!workspace && bodyControls}
            <div className="grp">
              <LabControlLabel help={['访客在房间内行走的速度。', 'How fast visitors walk through the room.']} lang={lang}>
                {t.speed} {speed.toFixed(1)} {tx('m/s')}
              </LabControlLabel>
              <input type="range" min={PLAN.SPEED.min} max={PLAN.SPEED.max} step={0.1} value={speed} aria-label={t.speed} style={{ width: 84 }} onChange={(e) => setSpeed(Number(e.target.value))} />
            </div>
            <div className="grp">
              <LabControlLabel help={['仿真播放倍速。', 'Simulation playback rate.']} lang={lang}>
                {t.time}
              </LabControlLabel>
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
            {!workspace && (
              <>
                <p className="lab-ctl__hint">{t.rules}</p>
                <p className="lab-ctl__hint">{t.hint}</p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
