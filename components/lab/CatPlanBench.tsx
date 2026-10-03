'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { CAT, CAT_BEHAVIOURS, CatPlanSim, type CatBehaviour } from '../../src/lib/space/cat-plan';
import { PLAN, READINGS, RESPONSES, type Reading, type ResponseMode } from '../../src/lib/space/unit-activation';
import { useBenchLang } from './LabLanguage';
import { LabControlLabel } from './LabControlLabel';
import { canvasToRoom, drawPlan, H, W, readPalette, type Palette } from './planDraw';
import { planFromHash } from './planHash';
import { useBenchLoop } from './useBenchLoop';

export function CatPlanNotes() {
  const lang = useBenchLang();
  return <div className="walk-notes">
    <h3>{lang === 'zh' ? '操作说明' : 'How to use'}</h3>
    <p>{lang === 'zh' ? '选通行、停留观察或玩耍，看同一套单元如何响应不同路径；自由模式自动切换这三类行为。点地面让猫走到附近过道，按住猫拖动。手动操作后停止自走，勾选自走继续。重播从起点开始。' : 'Choose pass through, pause or play to compare the resulting traces. Free mode alternates between these behaviours. Click the floor to walk to a nearby aisle; hold the cat to drag it. Manual input stops wandering; turn Wander on to resume. Replay returns to the start.'}</p>
    <h3>{lang === 'zh' ? '从行为到激发' : 'From movement to activation'}</h3>
    <p>{lang === 'zh' ? '淡绿圈是留下痕迹的活动范围，不代表猫的视野。停留会累积较深的痕迹，通行留下带状痕迹，玩耍反复经过同一区域。绿盘表示单元读数，紫环表示激活程度；粉色 × 表示身体让位。跟随会在痕迹消退后收回，锁定保留成形。' : 'The pale green area deposits a floor trace; it is not a model of feline vision. Pausing deepens a local trace, passing makes a strip, and play revisits a small area. Green discs show readings, purple rings show activation, and rose crosses mark body clearance. Follow withdraws as traces fade; Lock retains formed units.'}</p>
    <h3>{lang === 'zh' ? '依据与边界' : 'Evidence and limits'}</h3>
    <p>{lang === 'zh' ? '沿用项目二猫行为资料中的停留与空间使用问题，并参考游戏中的搜寻、追逐、扑捉序列。速度、停留时长和激发范围均为演示设定，尚未用观察数据校准。这里只研究一只猫的平面运动与激活，不模拟跳跃、人猫互动或三维结构。' : 'This study follows the project’s research on cats’ pauses and use of space, with short pursuit sequences for play. Speeds, pause lengths and activation reach are demonstration settings, not calibrated observations. One cat moves in plan; jumping, human–cat interaction and 3D structures are outside this study.'}</p>
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
  const [reach, setReach] = useState<number>(CAT.reach);
  const [threshold, setThreshold] = useState(2);
  const [fade, setFade] = useState(6);
  const [fill, setFill] = useState(0.5);
  const [reading, setReading] = useState<Reading>('nearest');
  const [mode, setMode] = useState<ResponseMode>('follow');
  const settings = useRef({ running, trace, time });
  settings.current = { running, trace, time };
  const [hud, setHud] = useState({ t: 0, formed: 0, half: 0, floor: 0, blocked: 0, state: 'rest' as CatPlanSim['state'] });
  const lastHud = useRef('');

  const paint = () => {
    const s = sim.current, ctx = canvas.current?.getContext('2d'), pal = palette.current;
    if (!s || !ctx || !pal) return;
    drawPlan(ctx, { layout: s.layout, field: s.field, catchment: s.catchment, act: s.act,
      people: [{ kind: 'cat', bodyR: s.bodyR, x: s.walker.x, y: s.walker.y, heading: s.walker.heading,
        gaze: s.walker.gaze, reach: s.reach, keepOut: s.keepOutM, held: s.held }],
      showTrace: settings.current.trace, blocked: s.blocked, trail: s.trail, trailEnd: s.walker, toy: s.toy }, pal);
    const next = { t: s.t, formed: s.act.formed().length, half: s.act.countAtLeast(0.5), floor: s.field.max(),
      blocked: s.blocked.reduce((a, b) => a + b, 0), state: s.state };
    const key = `${Math.floor(s.t * 5)}:${next.formed}:${next.half}:${next.blocked}:${next.state}:${next.floor.toFixed(1)}`;
    if (lastHud.current !== key) { lastHud.current = key; setHud(next); }
  };

  useEffect(() => {
    sim.current = new CatPlanSim({ grid, behaviour, reach, threshold, fade, fill, reading, mode });
    sim.current.setAuto(auto);
    pointer.current = null;
    paint();
    // Grid is the only control that changes the floor topology.
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
  const stateLabels = { held: label('拖动', 'Held'), walk: label('通行', 'Walking'), watch: label('观察目标', 'Watching'), chase: label('追逐', 'Chasing'), rest: label('停留', 'Pausing') };
  const slider = (cn: string, en: string, value: number, min: number, max: number, step: number, unit: string, update: (v: number) => void, help: [string, string]) =>
    <div className="grp"><LabControlLabel lang={lang} help={help}>{label(cn, en)} {Number(value.toFixed(2))}{unit}</LabControlLabel><input type="range" aria-label={label(cn, en)} min={min} max={max} step={step} value={value} onChange={e => { update(Number(e.target.value)); paint(); }} /></div>;

  return <div ref={wrap} className={`lab-wrap${onLight ? ' on-light' : ''}${workspace ? ' walk-workbench' : ''}`}>
    <div className="lab-fig">
      <div className="walk-map" style={workspace ? undefined : { display: 'contents' }}>
        <canvas ref={canvas} role="img" tabIndex={controls ? 0 : -1}
          aria-label={label('猫的活动平面；拖动猫或点地面，方向键指定附近目标', 'Cat activity plan; drag the cat or click the floor, arrow keys choose a nearby target')}
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
      <div className="lab-hud tl"><div style={{ color: 'var(--accent)' }}>{label('实验 2-12 / 项目二', 'Lab 2-12 / Project II')}</div><div>{label('一只猫在场', 'A cat in the room')}</div><div className="dim">{label('通行 · 停留 · 玩耍 → 单元激发', 'Pass · pause · play → unit activation')}</div></div>
      <div className="lab-hud br"><div className="num">{label('成形', 'Formed')} {hud.formed} / {grid * grid}</div><div className="dim" data-cat-status>{stateLabels[hud.state]} · {Math.floor(hud.t)} s · {label('半成以上', 'Half or more')} {hud.half} · {label('让位', 'Held back')} {hud.blocked}</div></div>
      <div className="lab-hud bl dim">{label('绿盘 = 读数 · 紫环 = 激活 · 粉色 × = 让位', 'Green = reading · purple = activation · rose × = clearance')}<br />{label('地面最深', 'Deepest trace')} {hud.floor.toFixed(1)} s · {label('圆圈是活动范围，不是视野', 'Circle = activity reach, not vision')}</div>
    </div>
    {controls && <div className="lab-ctl lab-ctl--tiered">
      <div className="lab-ctl__row lab-ctl__solve">
        <div className="grp walk-behaviour"><LabControlLabel lang={lang} help={['选择可重复的行为片段；自由会自动交替。切换会清空痕迹。', 'Choose a repeatable sequence; Free alternates automatically. Switching clears traces.']}>{label('行为', 'Behaviour')}</LabControlLabel><span className="seg">{CAT_BEHAVIOURS.map(b => <button key={b.key} type="button" className={behaviour === b.key ? 'active' : undefined} aria-pressed={behaviour === b.key} onClick={() => replay(b.key)}>{b[lang]}</button>)}</span></div>
        <div className="grp"><LabControlLabel lang={lang} help={['同一房间内改变单元密度，会重新开始演示。', 'Change unit density in the same room; restarts the study.']}>{label('格数', 'Grid')}</LabControlLabel><span className="seg">{PLAN.GRIDS.map(n => <button type="button" key={n} className={grid === n ? 'active' : undefined} onClick={() => setGrid(n)}>{n}×{n}</button>)}</span></div>
        <div className="grp"><LabControlLabel lang={lang} help={['按格读取分区均值；脚下只读取平台投影。', 'Read the mean trace across a cell or beneath the platform.']}>{label('读法', 'Reading')}</LabControlLabel><span className="seg">{READINGS.map(r => <button type="button" key={r.key} className={reading === r.key ? 'active' : undefined} onClick={() => { setReading(r.key); sim.current?.setReading(r.key); paint(); }}>{r[lang]}</button>)}</span></div>
        <div className="grp"><LabControlLabel lang={lang} help={['跟随随痕迹退去；锁定保留激活。', 'Follow fades with traces; Lock retains activation.']}>{label('响应', 'Response')}</LabControlLabel><span className="seg">{RESPONSES.map(r => <button type="button" key={r.key} className={mode === r.key ? 'active' : undefined} onClick={() => { setMode(r.key); sim.current?.setMode(r.key); }}>{r[lang]}</button>)}</span></div>
        {slider('活动半径', 'Reach', reach, 0.6, 2, 0.05, ' m', v => { setReach(v); sim.current?.setReach(v); }, ['猫周围留下痕迹的区域，属于设计参数。', 'Area around the cat that deposits trace; a design parameter.'])}
        {slider('阈值', 'Threshold', threshold, 1, 12, 1, ' s', v => { setThreshold(v); sim.current?.setThreshold(v); }, ['地面累积时长的标尺。', 'Time scale for accumulating a floor trace.'])}
        {slider('占比', 'Floor share', fill * 100, 25, 100, 5, '%', v => { setFill(v / 100); sim.current?.setFill(v / 100); }, ['读数达到阈值乘以占比时完全激活。', 'Full activation at threshold multiplied by floor share.'])}
        {slider('散掉', 'Fade', fade, 2, 30, 1, ' s', v => { setFade(v); sim.current?.setFade(v); }, ['猫离开后，满格痕迹退到零的时间。', 'Time for a full trace to fade after the cat leaves.'])}
      </div>
      <div className="lab-ctl__row walk-playback">
        <div className="grp"><label><input type="checkbox" checked={running} onChange={e => setRunning(e.target.checked)} />{label('运转', 'Run')}</label><label><input type="checkbox" checked={auto} onChange={e => { setAuto(e.target.checked); sim.current?.setAuto(e.target.checked); paint(); }} />{label('自走', 'Wander')}</label><label><input type="checkbox" checked={trace} onChange={e => { settings.current.trace = e.target.checked; setTrace(e.target.checked); paint(); }} />{label('痕迹', 'Trace')}</label></div>
        <div className="grp"><button type="button" onClick={() => replay(behaviour)}>{label('重播', 'Replay')}</button><button type="button" onClick={() => { sim.current?.clearTraces(); paint(); }}>{label('清空痕迹', 'Clear traces')}</button></div>
        <div className="grp"><span>{label('时间', 'Time')}</span><span className="seg">{[1, 3, 8].map(v => <button type="button" key={v} className={time === v ? 'active' : undefined} onClick={() => setTime(v)}>×{v}</button>)}</span></div>
      </div>
    </div>}
  </div>;
}
