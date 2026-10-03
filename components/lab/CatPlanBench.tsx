'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { CAT, CAT_BEHAVIOURS, CatPlanSim, type CatBehaviour } from '../../src/lib/space/cat-plan';
import { PLAN, RESPONSES, type ResponseMode } from '../../src/lib/space/unit-activation';
import { useBenchLang } from './LabLanguage';
import { LabControlLabel } from './LabControlLabel';
import { canvasToRoom, drawPlan, H, W, readPalette, type Palette } from './planDraw';
import { planFromHash } from './planHash';
import { useBenchLoop } from './useBenchLoop';

export function CatPlanNotes() {
  const lang = useBenchLang();
  return <div className="walk-notes">
    <h3>{lang === 'zh' ? '操作说明' : 'How to use'}</h3>
    <p>{lang === 'zh' ? '猫沿单元移动。通行逐个经过相邻单元，停留观察维持脚下平台，玩耍在两个单元之间往返；自由模式串联三类行为。点击单元指定落点，拖动猫会吸附到最近单元。手动操作后停止自走，勾选自走继续。' : 'The cat moves across units: passing visits neighbours, pausing holds a platform, and play shuttles between two units. Free mode combines them. Click a unit to choose a landing; dragging snaps the cat onto the nearest unit. Manual input stops wandering; turn Wander on to resume.'}</p>
    <h3>{lang === 'zh' ? '从行为到激发' : 'From movement to activation'}</h3>
    <p>{lang === 'zh' ? '脚下单元保持展开，下一落点提前激活，完全展开后猫才移过去。实线圈标出支撑单元，虚线圈标出下一落点，编号对应下方读数；紫环显示展开程度。使用痕迹留在经过的平台上，跟随模式离开后收回，锁定模式保留。清空痕迹仍保留当前支撑。' : 'The occupied unit stays open. The next landing activates before the cat moves. Solid outlines mark support; a dashed outline marks the next landing. Numbers match the readout, and purple rings show activation. Visits leave traces on platform surfaces. Follow withdraws after departure; Lock retains activation. Clearing traces preserves current support.'}</p>
    <h3>{lang === 'zh' ? '依据与边界' : 'Evidence and limits'}</h3>
    <p>{lang === 'zh' ? '沿用项目二猫行为资料中的停留与空间使用问题，并参考游戏中的搜寻、追逐、扑捉序列。速度、停留和展开时长均为演示设定，尚未用观察数据校准。初始放置和手动拖动直接提供脚下平台。单元间转移用俯视路径表达，尚未模拟跳跃高度、可达性、承重或三维结构。' : 'This study follows the project’s research on cats’ pauses and use of space, with short pursuit sequences for play. Speeds, pauses and formation times are demonstration settings, not calibrated observations. Starting and manual placements supply a platform directly. Transfers are shown in plan; jump height, reachability, loads and 3D structures are not simulated.'}</p>
    <p><a href="https://journals.sagepub.com/doi/full/10.1177/1098612x13477537" target="_blank" rel="noreferrer">{lang === 'zh' ? '猫的环境需求指南 · 2013 ↗' : 'Feline environmental needs · 2013 ↗'}</a><br /><a href="https://www.mdpi.com/2076-2615/15/22/3233" target="_blank" rel="noreferrer">{lang === 'zh' ? '猫咖行为观察 · 2025 ↗' : 'Cat café observations · 2025 ↗'}</a></p>
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
  const sim = useRef<CatPlanSim | null>(null);
  const palette = useRef<Palette | null>(null);
  const pointer = useRef<number | null>(null);
  const [grid, setGrid] = useState<number>(8);
  const [behaviour, setBehaviour] = useState<CatBehaviour>('free');
  const [running, setRunning] = useState(true);
  const [auto, setAuto] = useState(true);
  const [trace, setTrace] = useState(true);
  const [time, setTime] = useState(1);
  const [threshold, setThreshold] = useState<number>(CAT.prepare);
  const [pace, setPace] = useState(1);
  const [fade, setFade] = useState(6);
  const [mode, setMode] = useState<ResponseMode>('follow');
  const settings = useRef({ running, trace, time });
  settings.current = { running, trace, time };
  const [hud, setHud] = useState({ t: 0, formed: 0, half: 0, floor: 0, current: '—', landing: null as number | null, progress: 0, state: 'rest' as CatPlanSim['state'] });
  const lastHud = useRef('');

  const paint = () => {
    const s = sim.current, ctx = canvas.current?.getContext('2d'), pal = palette.current;
    if (!s || !ctx || !pal) return;
    drawPlan(ctx, { layout: s.layout, field: s.field, catchment: s.catchment, act: s.act,
      people: [{ kind: 'cat', bodyR: s.bodyR, x: s.walker.x, y: s.walker.y, heading: s.walker.heading,
        gaze: s.walker.gaze, reach: s.reach, keepOut: s.keepOutM, held: s.held }],
      showTrace: settings.current.trace, supportIds: s.supportUnits.map(u => u.i), landingId: s.landingUnit?.i, trail: s.trail, trailEnd: s.walker, toy: s.toy }, pal);
    const next = { t: s.t, formed: s.act.formed().length, half: s.act.countAtLeast(0.5), floor: s.field.max(),
      current: s.supportUnits.map(u => u.i + 1).join(' + '), landing: s.state === 'prepare' && s.landingUnit ? s.landingUnit.i + 1 : null,
      progress: s.landingUnit ? Math.round(s.act.degree[s.landingUnit.i] * 100) : 0, state: s.state };
    const key = `${Math.floor(s.t * 5)}:${next.formed}:${next.half}:${next.current}:${next.landing}:${next.progress}:${next.state}:${next.floor.toFixed(1)}`;
    if (lastHud.current !== key) { lastHud.current = key; setHud(next); }
  };

  useEffect(() => {
    sim.current = new CatPlanSim({ grid, behaviour, threshold, fade, mode });
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
    const preset = planFromHash('2-12', CAT_BEHAVIOURS.map(b => b.key));
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
    sim.current?.release(); pointer.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    paint();
  };
  const stateLabels = { prepare: label('等待落点展开', 'Preparing landing'), held: label('拖动', 'Held'), walk: label('通行', 'Walking'), watch: label('观察目标', 'Watching'), chase: label('追逐', 'Chasing'), rest: label('停留', 'Pausing') };
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
      <div className="lab-hud tl"><div style={{ color: 'var(--accent)' }}>{label('实验 2-12 / 项目二', 'Lab 2-12 / Project II')}</div><div>{label('一只猫在场', 'A cat in the room')}</div><div className="dim">{label('脚下支撑 → 落点展开 → 单元间移动', 'Support → prepare landing → move between units')}</div></div>
      <div className="lab-hud br"><div className="num">{label('成形', 'Formed')} {hud.formed} / {grid * grid}</div><div className="dim" data-cat-status>{stateLabels[hud.state]} · {Math.floor(hud.t)} s · {label('支撑单元', 'Support')} {hud.current}{hud.landing !== null && <> → {hud.landing} ({hud.progress}%)</>}</div></div>
      <div className="lab-hud bl dim">{label('实线 = 支撑单元 · 虚线 = 下一落点 · 紫环 = 激活', 'Solid = support · dashed = next landing · purple = activation')}<br />{label('使用痕迹', 'Use trace')} {hud.floor.toFixed(1)} s · {label('猫停留时脚下单元保持展开', 'Occupied units stay open')}</div>
    </div>
    {controls && <div className="lab-ctl lab-ctl--tiered">
      <div className="lab-ctl__row lab-ctl__solve">
        <div className="grp walk-behaviour"><LabControlLabel lang={lang} help={['选择在单元上发生的行为；自由自动交替。切换会清空历史并保留起点支撑。', 'Choose a sequence on the units; Free alternates. Switching resets history and supplies the starting platform.']}>{label('行为', 'Behaviour')}</LabControlLabel><span className="seg">{CAT_BEHAVIOURS.map(b => <button key={b.key} type="button" className={behaviour === b.key ? 'active' : undefined} aria-pressed={behaviour === b.key} onClick={() => replay(b.key)}>{b[lang]}</button>)}</span></div>
        <div className="grp"><LabControlLabel lang={lang} help={['同一房间内改变单元密度，会重新开始演示。', 'Change unit density in the same room; restarts the study.']}>{label('格数', 'Grid')}</LabControlLabel><span className="seg">{PLAN.GRIDS.map(n => <button type="button" key={n} className={grid === n ? 'active' : undefined} onClick={() => setGrid(n)}>{n}×{n}</button>)}</span></div>
        <div className="grp"><LabControlLabel lang={lang} help={['跟随在猫离开后收回；锁定保留已激活的单元。脚下支撑始终保留。', 'Follow withdraws after departure; Lock retains activation. Occupied units stay open.']}>{label('响应', 'Response')}</LabControlLabel><span className="seg">{RESPONSES.map(r => <button type="button" key={r.key} className={mode === r.key ? 'active' : undefined} onClick={() => { setMode(r.key); sim.current?.setMode(r.key); }}>{r[lang]}</button>)}</span></div>
        {slider('落点预备', 'Prepare', threshold, 0.5, 4, 0.25, ' s', v => { setThreshold(v); sim.current?.setThreshold(v); }, ['下一落点逐渐展开，完全展开后猫才出发。', 'The next landing opens gradually; the cat waits until it is fully formed.'])}
        {slider('步速', 'Pace', pace, 0.5, 2, 0.1, '×', v => { setPace(v); if (sim.current) sim.current.pace = v; }, ['调整猫在相邻单元之间移动的速度。', 'Scale movement speed between adjacent units.'])}
        {slider('散掉', 'Fade', fade, 2, 30, 1, ' s', v => { setFade(v); sim.current?.setFade(v); }, ['猫离开单元后，使用痕迹退去的时间。', 'Time for a full use trace to fade after the cat leaves a unit.'])}
      </div>
      <div className="lab-ctl__row walk-playback">
        <div className="grp"><label><input type="checkbox" checked={running} onChange={e => setRunning(e.target.checked)} />{label('运转', 'Run')}</label><label><input type="checkbox" checked={auto} onChange={e => { setAuto(e.target.checked); sim.current?.setAuto(e.target.checked); paint(); }} />{label('自走', 'Wander')}</label><label><input type="checkbox" checked={trace} onChange={e => { settings.current.trace = e.target.checked; setTrace(e.target.checked); paint(); }} />{label('痕迹', 'Trace')}</label></div>
        <div className="grp"><button type="button" onClick={() => replay(behaviour)}>{label('重播', 'Replay')}</button><button type="button" onClick={() => { sim.current?.clearTraces(); paint(); }}>{label('清空痕迹', 'Clear traces')}</button></div>
        <div className="grp"><span>{label('时间', 'Time')}</span><span className="seg">{[1, 3, 8].map(v => <button type="button" key={v} className={time === v ? 'active' : undefined} onClick={() => setTime(v)}>×{v}</button>)}</span></div>
      </div>
    </div>}
  </div>;
}
