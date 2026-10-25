'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { HARDWARE_CHANNELS, type HardwareId, type HardwareSnapshot } from '../../src/lib/linkage/actuator-hardware';
import { TENDON_TAKEUP_MM } from '../../src/lib/linkage/actuator-readout';
import { SMALLARM_STARTLE } from '../../src/lib/linkage/machine-smallarm';
import {
  DEBUG_CHANNELS, arduinoPreview, clampActuatorCommand, commandValue,
  type ActuatorCommand, type ActuatorMode,
} from '../../src/lib/linkage/actuator-debug';
import './actuator-lab.css';

export interface ActuatorLabProps {
  snapshot: HardwareSnapshot | null;
  command: ActuatorCommand | null;
  mode: ActuatorMode;
  selected: HardwareId | null;
  onMode: (mode: ActuatorMode) => void;
  onChange: (command: ActuatorCommand) => void;
  onSelect: (id: HardwareId | null) => void;
  lang: 'zh' | 'en';
  motion?: string | null;
  running: boolean;
}

const COPY = {
  zh: {
    title: '执行器调试', behavior: '行为联动', manual: '逐轴手动', model: '↑ 查看整机',
    intro: '同一台模型，拆开看九路输出。七路机构标号与整机对应；声光在下方作示意。',
    autoNote: '数值随行为引擎变化。切到手动后，可独立调节每一路。',
    manualNote: '行为时钟已冻结；手动调节共用模型。返回行为联动，恢复进入手动前的状态。',
    simulated: '仿真', target: '目标', delta: '相邻采样 Δ', following: '跟随中', reached: '已到目标',
    paused: '已暂停', waiting: '等待样本', source: '仿真 · 真机未连接', select: '在整机中标记', clear: '取消标记',
    on: '发声', hz: '音高', level: '强度', code: 'Arduino 格式预览与标定',
    codeNote: '这是 C++ 风格的仿真需求预览，不是固件；没有串口连接或硬件下发。电机、脉宽、步数及引脚须先按实装硬件标定。',
    noCode: '模型产生首个样本后显示预览。', needed: '待标定',
    breath: '0% 全开 · 100% 折叠', sound: '开关、音高、强度分别控制；强度不是 dB。',
    light: '亮度示意 · WS2812B 数字协议', sample: '样本时间',
  },
  en: {
    title: 'Actuator workbench', behavior: 'Follow behaviour', manual: 'Manual axes', model: '↑ View machine',
    intro: 'One model, nine outputs. Seven mechanism labels match the machine; sound and light are illustrated below.',
    autoNote: 'Values follow the behaviour engine. Switch to manual to adjust each channel independently.',
    manualNote: 'Behaviour time is frozen. Manual controls use the same model; returning restores its state from before manual control.',
    simulated: 'Simulated', target: 'Target', delta: 'Sample-to-sample Δ', following: 'Following', reached: 'At target',
    paused: 'Paused', waiting: 'Awaiting sample', source: 'Simulation · no hardware connected', select: 'Locate on machine', clear: 'Clear selection',
    on: 'Voice on', hz: 'Pitch', level: 'Level', code: 'Arduino-style preview & calibration',
    codeNote: 'A C++-style preview of simulation requirements, not firmware. No serial connection or hardware commands are sent. Calibrate motors, pulses, steps and pins for the installed hardware first.',
    noCode: 'The preview appears after the model produces its first sample.', needed: 'Needs calibration',
    breath: '0% open · 100% folded', sound: 'On/off, pitch and level are separate; level is not dB.',
    light: 'Brightness illustration · WS2812B data protocol', sample: 'Sample time',
  },
} as const;

const FEELER_MAX_DEG = Number((SMALLARM_STARTLE.max * 180 / Math.PI).toFixed(6));
const LIMITS: Record<HardwareId, { min: number; max: number; step: number; unit: string }> = {
  tendon0: { min: 0, max: TENDON_TAKEUP_MM, step: 0.1, unit: 'mm' },
  tendon1: { min: 0, max: TENDON_TAKEUP_MM, step: 0.1, unit: 'mm' },
  tendon2: { min: 0, max: TENDON_TAKEUP_MM, step: 0.1, unit: 'mm' },
  servo0: { min: -FEELER_MAX_DEG, max: FEELER_MAX_DEG, step: 1, unit: '°' },
  servo1: { min: -FEELER_MAX_DEG, max: FEELER_MAX_DEG, step: 1, unit: '°' },
  breath: { min: 0, max: 100, step: 0.1, unit: '%' },
  yaw: { min: -180, max: 180, step: 1, unit: '°' },
  sound: { min: 0, max: 100, step: 1, unit: '%' },
  light: { min: 0, max: 100, step: 1, unit: '%' },
};

const displayValue = (q: { value: number; unit: string }): number => q.unit === 'fraction' ? q.value * 100 : q.value;
const fixed = (n: number): string => (Math.abs(n) < 0.05 ? 0 : n).toFixed(1);
const signed = (n: number): string => `${n > 0.049 ? '+' : ''}${fixed(n)}`;
const bounded = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Keep every other axis intact; the parent owns the sole command state. */
function changeAxis(command: ActuatorCommand, id: HardwareId, value: number): ActuatorCommand {
  const next = { ...command, tendonsMm: [...command.tendonsMm], feelersDeg: [...command.feelersDeg] } as ActuatorCommand;
  if (id === 'tendon0' || id === 'tendon1' || id === 'tendon2') next.tendonsMm[Number(id.slice(-1))] = value;
  else if (id === 'servo0' || id === 'servo1') next.feelersDeg[Number(id.slice(-1))] = value;
  else if (id === 'breath') next.breathStroke = value / 100;
  else if (id === 'yaw') next.yawDeg = value;
  else if (id === 'sound') next.soundLevel = value / 100;
  else next.lightLevel = value / 100;
  return clampActuatorCommand(next);
}

function AxisGraphic({ id, value, target, voiceOn }: { id: HardwareId; value: number; target: number; voiceOn: boolean }) {
  const l = LIMITS[id];
  const pct = bounded((value - l.min) / (l.max - l.min), 0, 1);
  const goal = bounded((target - l.min) / (l.max - l.min), 0, 1);
  if (id === 'servo0' || id === 'servo1') {
    const ray = (a: number) => ({ x: 36 + Math.sin(a * Math.PI / 180) * 30, y: 39 - Math.cos(a * Math.PI / 180) * 30 });
    const p = ray(value); const g = ray(target);
    return <svg className="actuator-lab__graphic" viewBox="0 0 76 44" aria-hidden="true">
      <path className="actuator-lab__guide" d="M7 31 A30 30 0 0 1 65 31 L36 39 Z" />
      <line className="actuator-lab__goal" x1="36" y1="39" x2={g.x} y2={g.y} />
      <line className="actuator-lab__ink" x1="36" y1="39" x2={p.x} y2={p.y} /><circle className="actuator-lab__fill" cx={p.x} cy={p.y} r="2" />
    </svg>;
  }
  if (id === 'yaw') return <svg className="actuator-lab__graphic" viewBox="0 0 76 44" aria-hidden="true">
    <circle className="actuator-lab__guide" cx="38" cy="22" r="18" />
    <path className="actuator-lab__guide" d="M38 1V7M38 37V43M17 22H23M53 22H59" />
    <path className="actuator-lab__goal" d="M38 22V4" transform={`rotate(${-target} 38 22)`} />
    <path className="actuator-lab__ink" d="M38 37V7L34 13M38 7L42 13" transform={`rotate(${-value} 38 22)`} />
  </svg>;
  if (id === 'light') return <svg className="actuator-lab__graphic" viewBox="0 0 76 44" aria-hidden="true">
    {Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return <circle key={i} className="actuator-lab__fill" cx={(38 + Math.sin(a) * 17).toFixed(3)} cy={(22 - Math.cos(a) * 17).toFixed(3)} r="2.6" opacity={0.12 + 0.88 * pct} />; })}
    <circle className="actuator-lab__guide" cx="38" cy="22" r="11" />
  </svg>;
  if (id === 'sound') return <svg className="actuator-lab__graphic" viewBox="0 0 76 44" aria-hidden="true">
    {[0.3, 0.65, 0.95, 0.5, 1, 0.75, 0.4].map((h, i) => <line key={i} className="actuator-lab__ink" x1={14 + i * 8} x2={14 + i * 8} y1={22 - h * (voiceOn ? pct : 0) * 18} y2={22 + h * (voiceOn ? pct : 0) * 18} />)}
    <path className="actuator-lab__guide" d="M7 22H69" />
  </svg>;
  return <svg className="actuator-lab__graphic" viewBox="0 0 76 44" aria-hidden="true">
    <rect className="actuator-lab__guide" x="7" y="16" width="62" height="12" />
    <rect className="actuator-lab__fill" x="8" y="17" width={60 * pct} height="10" opacity="0.7" />
    <path className="actuator-lab__guide" d="M7 11V14M38 11V14M69 11V14" />
    <line className="actuator-lab__goal" x1={8 + 60 * goal} x2={8 + 60 * goal} y1="12" y2="32" />
  </svg>;
}

export function ActuatorLab({ snapshot, command, mode, selected, onMode, onChange, onSelect, lang, motion, running }: ActuatorLabProps) {
  const L = COPY[lang];
  const outputRunning = mode === 'manual' || running;
  const previous = useRef<{ snapshot: HardwareSnapshot; mode: ActuatorMode } | null>(null);
  const [deltas, setDeltas] = useState<Partial<Record<HardwareId, number>>>({});
  useEffect(() => {
    const prior = previous.current;
    const diff: Partial<Record<HardwareId, number>> = {};
    const sampleMode = snapshot && 'controlMode' in snapshot ? snapshot.controlMode ?? 'behavior' : 'behavior';
    if (snapshot && sampleMode !== mode) {
      previous.current = null;
      setDeltas(diff);
      return;
    }
    if (snapshot && prior && prior.mode === mode && prior.snapshot.seed === snapshot.seed && snapshot.timeS > prior.snapshot.timeS) {
      for (const row of snapshot.rows) {
        const old = prior.snapshot.rows.find((item) => item.id === row.id);
        if (old) diff[row.id] = displayValue(row.simulated) - displayValue(old.simulated);
      }
    }
    previous.current = snapshot ? { snapshot, mode } : null;
    setDeltas(diff);
  }, [snapshot, mode]);

  const enabled = mode === 'manual' && command !== null && snapshot !== null;
  const update = (id: HardwareId, value: number) => {
    if (enabled && command && Number.isFinite(value)) onChange(changeAxis(command, id, value));
  };

  return <section className="actuator-lab" id="lab1-6a" data-lab-supplement aria-labelledby="actuator-lab-title">
    <div className="actuator-lab__head">
      <div><span className="actuator-lab__eyebrow">LAB 1-6A</span><h3 id="actuator-lab-title">{L.title}</h3></div>
      <a className="actuator-lab__back" href="#lab1-6">{L.model}</a>
    </div>
    <p className="actuator-lab__intro">{L.intro}</p>
    <div className="actuator-lab__toolbar">
      <div className="actuator-lab__modes" role="group" aria-label={L.title}>
        <button type="button" aria-pressed={mode === 'behavior'} onClick={() => onMode('behavior')}>{L.behavior}</button>
        <button type="button" aria-pressed={mode === 'manual'} disabled={!snapshot} onClick={() => onMode('manual')}>{L.manual}</button>
      </div>
      <span className="actuator-lab__status">{!snapshot ? L.waiting : mode === 'manual' ? L.manual : !running ? L.paused : motion || L.behavior}</span>
    </div>
    <p className="actuator-lab__note">{mode === 'manual' ? L.manualNote : L.autoNote}</p>
    <div className="actuator-lab__grid">
      {DEBUG_CHANNELS.map((debug) => {
        const { id } = debug;
        const channel = HARDWARE_CHANNELS.find((item) => item.id === id)!;
        const row = snapshot?.rows.find((item) => item.id === id);
        const l = LIMITS[id];
        const value = row ? displayValue(row.simulated) : null;
        const target = mode === 'manual' && command ? id === 'sound' && !command.soundOn ? 0 : commandValue(command, id) : row ? displayValue(row.target) : null;
        const control = mode === 'manual' && command ? commandValue(command, id) : target ?? 0;
        const delta = deltas[id];
        const settled = value !== null && target !== null && Math.abs(value - target) <= (l.unit === 'mm' ? 0.1 : 0.3);
        const short = debug.short;
        const on = mode === 'manual' && command ? command.soundOn : row?.extra?.on ?? false;
        const hz = mode === 'manual' && command ? command.soundHz : row?.extra?.frequencyHz ?? 0;
        const selectedHere = selected === id;
        return <article className="actuator-lab__card" key={id} data-channel={id} data-selected={selectedHere || undefined} style={{ '--axis': debug.color } as CSSProperties}>
          <button className="actuator-lab__select" type="button" aria-pressed={selectedHere} onClick={() => onSelect(selectedHere ? null : id)} title={`${selectedHere ? L.clear : L.select}: ${channel.label[lang]}`}>
            <span className="actuator-lab__code">{short}</span><span>{channel.label[lang]}</span><span className="actuator-lab__marker" aria-hidden="true">{selectedHere ? '●' : '○'}</span>
          </button>
          <div className="actuator-lab__reading">
            <AxisGraphic id={id} value={value ?? 0} target={target ?? 0} voiceOn={on} />
            <div className="actuator-lab__numbers"><span>{L.simulated}</span><strong>{value === null ? '—' : fixed(value)}<small>{l.unit}</small></strong><span>{L.target} {target === null ? '—' : `${fixed(target)}${l.unit}`}</span></div>
          </div>
          <div className="actuator-lab__delta"><span>{L.delta} {delta === undefined ? '—' : `${signed(delta)}${l.unit}`}</span><span>{!snapshot ? L.waiting : !outputRunning ? L.paused : settled ? L.reached : L.following}</span></div>
          <div className="actuator-lab__control">
            <input type="range" min={l.min} max={l.max} step={l.step} value={bounded(control, l.min, l.max)} disabled={!enabled} aria-label={`${channel.label[lang]} ${L.target}`} onChange={(event) => update(id, Number(event.target.value))} />
            <input type="number" min={l.min} max={l.max} step={l.step} value={Number(fixed(control))} disabled={!enabled} aria-label={`${channel.label[lang]} ${L.target} ${l.unit}`} onChange={(event) => { if (event.target.value !== '') update(id, Number(event.target.value)); }} />
            <span>{l.unit}</span>
          </div>
          {id === 'sound' && <div className="actuator-lab__sound">
            <label><input type="checkbox" checked={on} disabled={!enabled} onChange={(event) => { if (enabled && command) onChange(clampActuatorCommand({ ...command, soundOn: event.target.checked })); }} />{L.on}</label>
            <label>{L.hz}<input type="number" min="0" max="2000" step="10" value={Math.round(hz)} disabled={!enabled} aria-label={`${L.hz} Hz`} onChange={(event) => { if (enabled && command && event.target.value !== '' && Number.isFinite(Number(event.target.value))) onChange(clampActuatorCommand({ ...command, soundHz: Number(event.target.value) })); }} /><span>Hz</span></label>
          </div>}
          {id === 'breath' && <p className="actuator-lab__hint">{L.breath}</p>}
          {id === 'light' && <p className="actuator-lab__hint">{L.light}</p>}
          {(id === 'light' || id === 'sound') && <p className="actuator-lab__hint">{lang === 'zh' ? '声光仅作面板示意，实体安装位未定。' : 'Panel illustration only; physical mounting is unspecified.'}</p>}
        </article>;
      })}
    </div>
    <div className="actuator-lab__foot"><span>{L.source}</span><span>{L.sample} {snapshot ? `${snapshot.timeS.toFixed(2)} s` : '—'}</span></div>
    <details className="actuator-lab__details">
      <summary>{L.code}</summary>
      <p>{L.codeNote}</p>
      <pre tabIndex={0} aria-label={L.code}><code>{command ? arduinoPreview(command, mode) : L.noCode}</code></pre>
      <div className="actuator-lab__calibration">{HARDWARE_CHANNELS.map((channel) => <div key={channel.id}><strong>{channel.label[lang]}</strong><p>{channel.hardware[lang]}</p><p>{L.needed}：{channel.calibration[lang]}</p></div>)}</div>
    </details>
  </section>;
}
