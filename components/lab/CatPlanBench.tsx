'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { CAT, CAT_BEHAVIOURS, CatPlanSim, type CatBehaviour } from '../../src/lib/space/cat-plan';
import { CAT_DEMO, CAT_EXPLORE, CAT_RULES, CAT_SEQUENCES, CAT_SOURCES, type CatEpisode, type CatPhase } from '../../src/lib/space/cat-rules';
import { PLAN, RESPONSES, type ResponseMode } from '../../src/lib/space/unit-activation';
import { useBenchLang } from './LabLanguage';
import { LabControlLabel } from './LabControlLabel';
import { canvasToRoom, drawCat, drawPlan, H, W, readPalette, type Palette } from './planDraw';
import { planFromHash } from './planHash';
import { useBenchLoop } from './useBenchLoop';

export function CatPlanNotes() {
  const lang = useBenchLang();
  return <div className="walk-notes">
    <h3>{lang === 'zh' ? '操作说明' : 'How to use'}</h3>
    <p>{lang === 'zh' ? '通行出发前先扫视周围可去的台，再沿一排单元移动；停留直接从台面坐姿开始，再伏卧；探索时猫自己在场地里走：到一台先停下查看（新到的台看得久），再朝几个方向扫一眼，然后往房间里最少去过的那片走一小段。自由模式按通行→停留→探索轮换。点击单元指定落点，拖动猫吸附到最近单元；手动操作后勾选自走可继续。' : 'Pass first scans the neighbouring units, then crosses a row. Rest begins seated, then lies down on the same unit. In Explore the cat moves on its own: on each platform it stops to investigate (longer on a new one), glances in a few directions, then walks a short way toward the least-visited part of the room. Free cycles through pass → rest → explore. Click a landing or drag the cat onto a unit; enable Wander after manual input to resume.'}</p>
    <h3>{lang === 'zh' ? '从行为到激发' : 'From movement to activation'}</h3>
    <p>{lang === 'zh' ? '单元只读猫留下的两种痕迹，不读猫接下来要去哪。脚下单元保持展开；猫注视的单元按注视时长逐渐展开，完全展开后猫才移过去。走动时猫看着前方下一台，所以前面的台边走边开；需要转弯的落点要停下转头后才看得到。出发前扫视过、但没去的台只开到一半，随后收回；探索时每一段出发前都这样扫一眼，所以总能看到几台「可能去」的半开着。停得越久，平台上的使用痕迹越满，离开后收得越晚。' : 'The units read only two traces the cat leaves, never where it plans to go. The occupied unit stays open; the unit the cat fixates opens with fixation time, and the cat moves once it is fully open. While crossing, the cat looks at the next unit ahead, so units open in front of it; a landing around a corner is seen only after the cat stops and turns. Units glanced at before a move but not taken half-open, then retract; exploring, the cat glances like this before every stretch, so a few possible landings are always half open. Longer stays fill a platform’s use trace, so it retracts later.'}</p>
    <p>{lang === 'zh' ? '实线圈 = 支撑单元；虚线 = 视线与注视中的单元，编号对应下方读数；紫环 = 展开程度。跟随模式离开后收回，锁定模式保留。清空痕迹仍保留当前支撑。' : 'Solid outlines mark support; the dashed line and outline mark the line of sight and the fixated unit, numbered as in the readout; purple rings show activation. Follow withdraws after departure; Lock retains activation. Clearing traces preserves current support.'}</p>
    <h3>{lang === 'zh' ? '逐条动作依据' : 'Action references'}</h3>
    <p>{lang === 'zh' ? '回查项目二 7 月 28 日历史条文及原研究报告：猫咖研究区分活动类别，并引用 Stanton 行为谱；原报告引用 Ellis 环境需求指南。以下取动作定义，不沿用旧稿未经验证的距离概率。' : 'Traced from the project’s July 28 research: the café study separates activity categories and cites Stanton’s ethogram; the earlier report cites Ellis’s guidelines. We use action definitions, excluding the old unverified distance probabilities.'}</p>
    <ul>{Object.entries(CAT_RULES).map(([key, r]) => <li key={key}>{r[lang]} · <a href={CAT_SOURCES[r.source].url} target="_blank" rel="noreferrer">{r.term} ↗</a></li>)}</ul>
    <p>{lang === 'zh' ? `探索的规则：猫记得在每台待过多久（这份记忆随时间淡去，${CAT_EXPLORE.forgetHalfLife} s 减半），这是猫自己的记忆，单元不读它。每到一台，它挑房间里周围最少去过的那片地方，朝那里最多走 ${CAT_EXPLORE.boutHops} 台再停；一样陌生时先去远的，所以会穿过房间，而不是贴着已走过的边缘绕圈。没有玩具，也没有人。来源只支持「探索」是一类单独的行为（猫咖观察 §3.2）；怎么挑方向、走多远、停多久都是演示设定。` : `Explore rules: the cat remembers how long it has spent on each platform (a memory that halves every ${CAT_EXPLORE.forgetHalfLife} s); this is the cat's own memory, and the units never read it. On each platform it picks the part of the room it has visited least and walks up to ${CAT_EXPLORE.boutHops} platforms toward it before stopping; between equally unfamiliar areas it takes the farther one, so it crosses the room rather than circling along the edge of what it has seen. There is no toy and no person. The source supports exploration only as a category of its own (café study §3.2); how it picks a direction, how far it goes and how long it stops are demo settings.`}</p>
    <p><a href={CAT_SOURCES.cafe.url} target="_blank" rel="noreferrer">{lang === 'zh' ? '猫咖观察 · §2.3.3 方法与 §3.2 分类 ↗' : 'Café study · §2.3.3 methods / §3.2 categories ↗'}</a></p>
    <h3>{lang === 'zh' ? '演示取舍，不是实测值' : 'Demonstration choices'}</h3>
    <p>{lang === 'zh' ? `通行横排与自由轮换是展示编排。探索：新到的台查看 ${CAT_EXPLORE.newSeconds} s、去过的 ${CAT_EXPLORE.knownSeconds} s，每段出发前扫 ${CAT_EXPLORE.options} 个方向、每个 ${CAT_DEMO.glanceSeconds} s，每段最多 ${CAT_EXPLORE.boutHops} 台，比较的范围约 ${CAT_EXPLORE.areaSigma} 格，自由模式里一轮探索 ${CAT_EXPLORE.bouts} 段。默认行走速度 0.55 m/s；坐姿 3 s、伏卧 18 s、到达停顿 2 s。姿态和步态是示意画法。均未用实地观察校准，不据此推断全天时间分配。` : `The straight pass and the Free cycle are staged. Explore: ${CAT_EXPLORE.newSeconds} s investigating a new platform and ${CAT_EXPLORE.knownSeconds} s a known one, ${CAT_EXPLORE.options} directions glanced at for ${CAT_DEMO.glanceSeconds} s each before every stretch, stretches of up to ${CAT_EXPLORE.boutHops} platforms, areas compared over about ${CAT_EXPLORE.areaSigma} pitches, ${CAT_EXPLORE.bouts} stretches per explore episode in Free. Default walking speed 0.55 m/s; sitting 3 s, lying 18 s, arrival 2 s. Postures and gait are schematic. None are calibrated measurements or daily time budgets.`}</p>
    <p>{lang === 'zh' ? '原先的玩耍（逗猫棒）已从这一台撤下：逗猫棒总得有人拿，而这一台只有猫。它留到下一个人和猫同时在场的实验里。' : 'The earlier wand-toy play has been taken out of this study: a wand needs someone holding it, and this study has only the cat. It is kept for the next study, where a person and the cat are both present.'}</p>
    <p>{lang === 'zh' ? '脚下支撑与「落点展开后才转移」来自作者的单元规则；落点由注视展开为作者 2026-10-04 拍板。注视展开 1 s、停留记满 4 s、视线只够到一次转移内的台（1.5 格）、扫视每台 0.5 s 均为演示设定。使用痕迹与跟随/锁定复用前两台 Lab。拖放即时展开是交互约定。仅俯视表达转移，尚未模拟跳跃高度、可达性、承重或三维结构。' : 'Support and “transfer only onto a fully open landing” follow the author’s unit rule; opening landings by gaze was decided by the author on 2026-10-04. Gaze-to-open 1 s, stay-to-fill 4 s, sight reaching units within one transfer (1.5 pitches) and 0.5 s glances are demo settings. Traces and Follow/Lock reuse the earlier Labs. Drag placement opens a platform immediately. Transfers are shown in plan without jump height, reachability, loads or 3D structures.'}</p>
  </div>;
}

export function CatPlanBench({ active = true, onLight = false, controls = true, workspace = false, lang: explicitLang }: {
  active?: boolean; onLight?: boolean; controls?: boolean; workspace?: boolean; lang?: 'zh' | 'en';
}) {
  const lang = useBenchLang(explicitLang);
  const zh = lang === 'zh';
  const label = (cn: string, en: string) => zh ? cn : en;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const poseCanvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<CatPlanSim | null>(null);
  const palette = useRef<Palette | null>(null);
  const pointer = useRef<number | null>(null);
  /** Drawn heading eases toward the model's, so turns read as turns (drawing only). */
  const shown = useRef<{ heading: number; at: number } | null>(null);
  const [grid, setGrid] = useState<number>(8);
  const [behaviour, setBehaviour] = useState<CatBehaviour>('free');
  const [running, setRunning] = useState(true);
  const [auto, setAuto] = useState(true);
  const [trace, setTrace] = useState(true);
  const [time, setTime] = useState(1);
  const [useFull, setUseFull] = useState<number>(CAT.useFull);
  const [gazeOpen, setGazeOpen] = useState<number>(CAT.gazeOpen);
  const [pace, setPace] = useState(1);
  const [fade, setFade] = useState(6);
  const [mode, setMode] = useState<ResponseMode>('follow');
  const settings = useRef({ running, trace, time });
  settings.current = { running, trace, time };
  const [hud, setHud] = useState({ t: 0, formed: 0, half: 0, floor: 0, current: '—', gaze: null as number | null, progress: 0, state: 'sit' as CatPlanSim['state'], phase: 'sit' as CatPhase, episode: 'pass' as CatEpisode, visited: 1, distance: 0 });
  const lastHud = useRef('');

  const paint = () => {
    const s = sim.current, ctx = canvas.current?.getContext('2d'), pal = palette.current;
    if (!s || !ctx || !pal) return;
    const now = performance.now(), prev = shown.current;
    let heading = s.walker.heading;
    if (prev) {
      const k = 1 - Math.exp(-Math.min(0.1, (now - prev.at) / 1000) * 14), d = Math.atan2(Math.sin(heading - prev.heading), Math.cos(heading - prev.heading));
      heading = prev.heading + d * k;
    }
    shown.current = { heading, at: now };
    drawPlan(ctx, { layout: s.layout, field: s.field, catchment: s.catchment, act: s.act,
      people: [{ kind: 'cat', pose: s.pose, motionTime: s.phaseTime, bodyR: s.bodyR, x: s.walker.x, y: s.walker.y, heading,
        gaze: heading + (s.walker.gaze - s.walker.heading), reach: s.reach, keepOut: s.keepOutM, held: s.held }],
      showTrace: settings.current.trace, supportIds: s.supportUnits.map(u => u.i), landingId: s.gazeUnit?.i,
      gazeLine: s.gazeUnit ? [s.walker.x, s.walker.y, s.gazeUnit.x, s.gazeUnit.y] : null, trail: s.trail, trailEnd: s.walker }, pal);
    const detail = poseCanvas.current?.getContext('2d');
    if (detail) {
      detail.clearRect(0, 0, 168, 110);
      drawCat(detail, { kind: 'cat', pose: s.pose, motionTime: s.phaseTime, x: 0, y: 0, heading: 0,
        gaze: s.walker.gaze - s.walker.heading, reach: 0, held: s.held }, 98, 52, 28, pal);
    }
    const next = { t: s.t, formed: s.act.formed().length, half: s.act.countAtLeast(0.5), floor: s.field.max(),
      current: s.supportUnits.map(u => u.i + 1).join(' + '), gaze: s.gazeUnit ? s.gazeUnit.i + 1 : null,
      progress: s.gazeUnit ? Math.round(s.act.degree[s.gazeUnit.i] * 100) : 0, state: s.state, phase: s.phase, episode: s.episode, visited: s.visited.size, distance: s.walker.distance };
    const key = `${Math.floor(s.t * 5)}:${next.formed}:${next.half}:${next.current}:${next.gaze}:${next.progress}:${next.state}:${next.floor.toFixed(1)}`;
    if (lastHud.current !== key) { lastHud.current = key; setHud(next); }
  };

  useEffect(() => {
    sim.current = new CatPlanSim({ grid, behaviour, threshold: useFull, gazeOpen, fade, mode });
    sim.current.pace = pace;
    sim.current.setAuto(auto);
    pointer.current = null;
    paint();
    // Grid is the only control that changes the platform layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !wrap.current) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    c.getContext('2d')?.scale(dpr, dpr);
    palette.current = readPalette(wrap.current);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setRunning(false);
    // `#lab2-12-play` was briefly published before play was parked; it now opens Explore.
    const found = planFromHash('2-12', [...CAT_BEHAVIOURS.map(b => b.key), 'play' as const]);
    const preset = found === 'play' ? 'explore' : found;
    if (preset) { sim.current?.replay(preset); setBehaviour(preset); }
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useBenchLoop(canvas, dt => {
    if (settings.current.running) sim.current?.step(dt * settings.current.time);
    paint();
  }, [], active);

  const replay = (b: CatBehaviour) => { sim.current?.replay(b); setBehaviour(b); setAuto(true); paint(); };
  const manual = () => { setBehaviour('free'); setAuto(false); };
  const position = (e: PointerEvent<HTMLCanvasElement>) => canvasToRoom(e.currentTarget, e.clientX, e.clientY, sim.current!.layout.roomM);
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    const s = sim.current;
    if (!s || e.button !== 0) return;
    const p = position(e), limit = s.layout.roomM / 2;
    if (Math.abs(p.x) > limit || Math.abs(p.y) > limit) return;
    e.preventDefault(); e.currentTarget.focus();
    // Generous pointer target around the small cat, including its tail.
    if (Math.hypot(p.x - s.walker.x, p.y - s.walker.y) < 0.4) {
      pointer.current = e.pointerId; s.hold(p.x, p.y); e.currentTarget.setPointerCapture(e.pointerId);
    } else s.pointerTarget(p.x, p.y);
    manual(); paint();
  };
  const up = (e: PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== e.pointerId) return;
    sim.current?.release();
    pointer.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    paint();
  };
  const stateLabel = hud.state === 'prepare' ? label('注视落点', 'Eyeing the landing') : hud.state === 'held' ? label('拖动', 'Held') : CAT_RULES[hud.state][lang];
  const rule = CAT_RULES[hud.phase], source = CAT_SOURCES[rule.source];
  const slider = (cn: string, en: string, value: number, min: number, max: number, step: number, unit: string, update: (v: number) => void, help: [string, string]) =>
    <div className="grp"><LabControlLabel lang={lang} help={help}>{label(cn, en)} {Number(value.toFixed(2))}{unit}</LabControlLabel><input type="range" aria-label={label(cn, en)} min={min} max={max} step={step} value={value} onChange={e => { update(Number(e.target.value)); paint(); }} /></div>;

  return <div ref={wrap} className={`lab-wrap${onLight ? ' on-light' : ''}${workspace ? ' walk-workbench' : ''}`}>
    <div className="lab-fig">
      <div className="walk-map" style={workspace ? undefined : { display: 'contents' }}>
        <canvas ref={canvas} role="img" tabIndex={controls ? 0 : -1}
          aria-label={label('猫在单元上的活动；拖动猫到单元，点击或方向键选择落点', 'Cat on the units; drag onto a unit, click or use arrow keys to choose a landing')}
          style={{ aspectRatio: `${W}/${H}`, touchAction: 'none', cursor: 'grab' }}
          onPointerDown={down} onPointerMove={e => { if (pointer.current === e.pointerId && sim.current) { const p = position(e); sim.current.drag(p.x, p.y); paint(); } }}
          onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}
          onKeyDown={e => {
            const s = sim.current;
            if (!s || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
            e.preventDefault();
            s.pointerTarget(s.walker.x + (e.key === 'ArrowRight' ? s.layout.pitchM : e.key === 'ArrowLeft' ? -s.layout.pitchM : 0), s.walker.y + (e.key === 'ArrowDown' ? s.layout.pitchM : e.key === 'ArrowUp' ? -s.layout.pitchM : 0));
            manual(); paint();
          }} />
      </div>
      <div className="lab-hud tl"><div style={{ color: 'var(--accent)' }}>{label('实验 2-12 / 项目二', 'Lab 2-12 / Project II')}</div><div>{label('一只猫在场', 'A cat in the room')}</div><div className="dim">{hud.episode === 'pass' ? label('先扫视，再沿一排经过 · 前方随视线展开', 'Scan, then cross a row · units open ahead of the gaze') : hud.episode === 'rest' ? label('同一台面坐下、伏卧 · 持续支撑', 'Sit and lie on one platform · sustained support') : label('停下查看，扫几个方向，往最少去过的那片走 · 扫到的台先半开', 'Investigates, glances around, heads for the least-visited area · glanced units half-open')}</div></div>
      <div className="lab-hud br"><div className="num">{label('成形', 'Formed')} {hud.formed} / {grid * grid}</div><div className="dim" data-cat-status>{stateLabel} · {Math.floor(hud.t)} s · {label('支撑单元', 'Support')} {hud.current}{hud.gaze !== null && <> · {label('注视', 'Gaze')} → {hud.gaze} ({hud.progress}%)</>}</div></div>
      <div className="lab-hud bl dim">{label('实线 = 支撑 · 虚线 = 视线与注视中的单元 · 紫环 = 激活', 'Solid = support · dashed = line of sight and fixated unit · purple = activation')}<br /><span data-cat-metrics>{label('累计经过', 'Visited')} {hud.visited} {label('台', 'units')} · {hud.distance.toFixed(1)} m</span> · {label('使用痕迹', 'Use trace')} {hud.floor.toFixed(1)} s</div>
    </div>
    {controls && <div className="lab-ctl lab-ctl--tiered">
      <div className="cat-evidence" data-cat-evidence>
        <div className="cat-pose"><canvas ref={poseCanvas} width={168} height={110} role="img" aria-label={label('猫的动作放大示意', 'Cat posture detail')} /><span>{label('动作放大示意', 'Posture detail')}</span></div>
        <div className="cat-phases">{CAT_SEQUENCES[hud.episode].map(p => <span key={p} data-current={p === hud.phase || undefined}>{CAT_RULES[p][lang]}</span>)}</div>
        <div>{hud.state === 'prepare' || hud.state === 'held' ? label('平台规则 · 作者 2026-10-04：脚下支撑；落点由注视展开，完全展开后再转移。', 'Platform rule · author, 2026-10-04: support below; the landing opens from gaze and the cat moves once it is fully open.') : <>{label('动作依据', 'Action source')} · <a href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a> · {rule.term}</>}</div>
        <div className="dim">{label('时长、速度、路线、扫视、探索的选向与自由轮换为演示设定；单元只读注视与使用痕迹。', 'Timing, speed, routes, scanning, how exploring picks a direction and Free sequencing are demo settings; units read only gaze and use traces.')}</div>
      </div>
      <div className="lab-ctl__row lab-ctl__solve">
        <div className="grp walk-behaviour"><LabControlLabel lang={lang} help={['选择在单元上发生的行为；自由自动交替。切换会清空历史并保留起点支撑。', 'Choose a sequence on the units; Free alternates. Switching resets history and supplies the starting platform.']}>{label('行为', 'Behaviour')}</LabControlLabel><span className="seg">{CAT_BEHAVIOURS.map(b => <button key={b.key} type="button" className={behaviour === b.key ? 'active' : undefined} aria-pressed={behaviour === b.key} onClick={() => replay(b.key)}>{b[lang]}</button>)}</span></div>
        <div className="grp"><LabControlLabel lang={lang} help={['同一房间内改变单元密度，会重新开始演示。', 'Change unit density in the same room; restarts the study.']}>{label('格数', 'Grid')}</LabControlLabel><span className="seg">{PLAN.GRIDS.map(n => <button type="button" key={n} className={grid === n ? 'active' : undefined} onClick={() => setGrid(n)}>{n}×{n}</button>)}</span></div>
        <div className="grp"><LabControlLabel lang={lang} help={['跟随在猫离开后收回；锁定保留已激活的单元。脚下支撑始终保留。', 'Follow withdraws after departure; Lock retains activation. Occupied units stay open.']}>{label('响应', 'Response')}</LabControlLabel><span className="seg">{RESPONSES.map(r => <button type="button" key={r.key} className={mode === r.key ? 'active' : undefined} onClick={() => { setMode(r.key); sim.current?.setMode(r.key); }}>{r[lang]}</button>)}</span></div>
        {slider('注视展开', 'Gaze to open', gazeOpen, 0.5, 4, 0.25, ' s', v => { setGazeOpen(v); sim.current?.setGazeOpen(v); }, ['猫注视一个单元这么久，它就完全展开；猫只在落点完全展开后转移。', 'Fixating a unit this long opens it fully; the cat transfers only onto a fully open landing.'])}
        {slider('停留记满', 'Stay to fill', useFull, 1, 12, 0.5, ' s', v => { setUseFull(v); sim.current?.setThreshold(v); }, ['在一台上停留这么久，使用痕迹记满。停得短的台离开后收得更快。', 'Staying this long fills a platform’s use trace. Briefly used platforms retract sooner after the cat leaves.'])}
        {slider('步速', 'Pace', pace, 0.5, 2, 0.1, '×', v => { setPace(v); if (sim.current) sim.current.pace = v; }, ['调整猫在相邻单元之间移动的速度。', 'Scale movement speed between adjacent units.'])}
        {slider('散掉', 'Fade', fade, 2, 30, 1, ' s', v => { setFade(v); sim.current?.setFade(v); }, ['注视与使用痕迹从满到退光的时间。', 'Time for a full gaze or use trace to fade once the cat looks away or leaves.'])}
      </div>
      <div className="lab-ctl__row walk-playback">
        <div className="grp"><label><input type="checkbox" checked={running} onChange={e => setRunning(e.target.checked)} />{label('运转', 'Run')}</label><label><input type="checkbox" checked={auto} onChange={e => { setAuto(e.target.checked); sim.current?.setAuto(e.target.checked); paint(); }} />{label('自走', 'Wander')}</label><label><input type="checkbox" checked={trace} onChange={e => { settings.current.trace = e.target.checked; setTrace(e.target.checked); paint(); }} />{label('痕迹', 'Trace')}</label></div>
        <div className="grp"><button type="button" onClick={() => replay(behaviour)}>{label('重播', 'Replay')}</button><button type="button" onClick={() => { sim.current?.clearTraces(); paint(); }}>{label('清空痕迹', 'Clear traces')}</button></div>
        <div className="grp"><span>{label('时间', 'Time')}</span><span className="seg">{[1, 3, 8].map(v => <button type="button" key={v} className={time === v ? 'active' : undefined} onClick={() => setTime(v)}>×{v}</button>)}</span></div>
      </div>
    </div>}
  </div>;
}
