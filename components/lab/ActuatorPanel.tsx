'use client';

import { memo, useState } from 'react';
import { HardwareReadout } from './HardwareReadout';
import type { HardwareSnapshot } from '../../src/lib/linkage/actuator-hardware';

import {
  READOUT_CHANNELS,
  READOUT_GROUPS,
  type ReadoutChannel,
  type ReadoutGroup,
  type ReadoutKey,
  TENDON_TAKEUP_MM,
} from '../../src/lib/linkage/actuator-readout';

/**
 * Lab 1-6 的实时输出面板（2026-10-19 用户立项）：台架此刻交给每个执行器的量 + 最近 10 秒的走势。
 * 数据与换算在 src/lib/linkage/actuator-readout.ts；这里只画。只在 /lab 的 Lab 1-6（完整面板）出现，
 * 主页预览与案例页主图不出。
 *
 * 画法：一行一个通道 = 名字 · 走势（各自的量程，跨零的画零线）· 此刻的值。实线 = 仿真跟随值；
 * 走势右端外侧的短横 = 引擎此刻要的目标（只有肌腱、曲柄、转台有：它们是限速追的，看得出追没追上）。
 */

export interface ActuatorSnapshot {
  /** 同一仿真帧的硬件映射；没有真实遥测。 */
  hardware?: HardwareSnapshot;
  values: Record<ReadoutKey, number>;
  targets: Partial<Record<ReadoutKey, number>>;
  series: Record<ReadoutKey, number[]>;
  /** 走势一共能存几个点（不满时从右往左长） */
  capacity: number;
  /** 正在发声（音高不发声时变暗） */
  voicing: boolean;
}

const COPY = {
  zh: {
    title: '实时输出',
    window: '最近 10 秒',
    aria: '执行器实时输出：三根肌腱收线、两个舵机角、中间轴、转台、声音、灯',
    groups: {
      arm: '大触手 · 肌腱收线',
      servo: '小触手 · 舵机角',
      crank: '中间轴 · 呼吸',
      yaw: '机身转台 · 占位',
      sound: '声音 · 灯',
    } as Record<ReadoutGroup, string>,
    keys: {
      tendon0: '腱 1',
      tendon1: '腱 2',
      tendon2: '腱 3',
      servo0: '左',
      servo1: '右',
      crank: '角度',
      crankRate: '转速',
      yaw: '朝向',
      yawRate: '转速',
      voice: '音量',
      pitch: '音高',
      light: '灯光',
    } as Record<ReadoutKey, string>,
    note: '实线 = 仿真跟随值；短横 = 引擎目标',
    source: '仿真数据 · 真机未连接',
    waveform: '走势', hardware: '硬件对应',
    tips: {
      arm: `模型收线需求，0–${TENDON_TAKEUP_MM} mm；模型预留 12 mm 松弛，尚非真机标定`,
      servo: '两个 SG90 的仿真驱动角，模型以 ±75° 封顶；0 = 模型中位',
      crank: '曲柄角 0 = 伸展死点、180 = 折叠死点；呼吸节律非真机',
      yaw: '机身朝向，0 = 初始朝向、左为正；±180° 是仿真范围，档案传动比 45:1，实装与限位待标定',
      sound: '音量 = 此刻发不发声 × 精力，音高不发声时变暗；灯的亮度随呼吸张开变亮',
    } as Record<ReadoutGroup, string>,
  },
  en: {
    title: 'Live output',
    window: 'last 10 s',
    aria: 'Live actuator output: three tendon take-ups, two servo angles, middle shaft, turntable, sound and light',
    groups: {
      arm: 'Large arm · tendon take-up',
      servo: 'Small arms · servo angle',
      crank: 'Middle shaft · breath',
      yaw: 'Turntable · placeholder',
      sound: 'Sound · light',
    } as Record<ReadoutGroup, string>,
    keys: {
      tendon0: 'T1',
      tendon1: 'T2',
      tendon2: 'T3',
      servo0: 'Left',
      servo1: 'Right',
      crank: 'Angle',
      crankRate: 'Speed',
      yaw: 'Facing',
      yawRate: 'Speed',
      voice: 'Level',
      pitch: 'Pitch',
      light: 'Light',
    } as Record<ReadoutKey, string>,
    note: 'Line = simulated follow; tick = engine target',
    source: 'Simulation · hardware disconnected',
    waveform: 'Traces', hardware: 'Hardware map',
    tips: {
      arm: `Model cable take-up, 0–${TENDON_TAKEUP_MM} mm; 12 mm model slack, not hardware-calibrated`,
      servo: 'Simulated SG90 drive angles, capped at ±75° in the model; 0 = model centre',
      crank: 'Crank angle 0 = open dead centre, 180 = folded dead centre; rhythms not hardware-verified',
      yaw: 'Body facing, 0 = initial facing, left positive; ±180° is the simulation range, with a recorded 45:1 ratio; calibrate installation and limits',
      sound: 'Level = voicing or not × energy, pitch dims when silent; the light brightens as the breath opens',
    } as Record<ReadoutGroup, string>,
  },
} as const;

const W = 92;
const H = 14;
const TICK = 6;

function yOf(c: ReadoutChannel, v: number): number {
  const u = (v - c.min) / (c.max - c.min);
  return H - 1 - Math.min(1, Math.max(0, u)) * (H - 2);
}

function fmt(c: ReadoutChannel, v: number): string {
  const s = v.toFixed(c.digits);
  // −0.0 读成 0.0；跨零的通道带正号，左右 / 正反一眼看得出
  const clean = Number(s) === 0 ? (0).toFixed(c.digits) : s;
  return c.centered && Number(clean) > 0 ? `+${clean}` : clean;
}

function Spark({ c, data, cap, target }: { c: ReadoutChannel; data: number[]; cap: number; target?: number }) {
  const n = data.length;
  const dx = W / Math.max(1, cap - 1);
  const x0 = W - (n - 1) * dx;
  const pts = data.map((v, i) => `${(x0 + i * dx).toFixed(1)},${yOf(c, v).toFixed(1)}`).join(' ');
  const last = n ? yOf(c, data[n - 1]) : null;
  return (
    <svg className="mb-out__spark" width={W + TICK} height={H} viewBox={`0 0 ${W + TICK} ${H}`} aria-hidden="true">
      <line className="mb-out__frame" x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} />
      {c.centered ? <line className="mb-out__zero" x1={0} y1={yOf(c, 0)} x2={W} y2={yOf(c, 0)} /> : null}
      {n > 1 ? <polyline className="mb-out__line" points={pts} /> : null}
      {last !== null ? <circle className="mb-out__dot" cx={W} cy={last} r={1.8} /> : null}
      {target !== undefined ? (
        <line className="mb-out__target" x1={W + 2} y1={yOf(c, target)} x2={W + TICK} y2={yOf(c, target)} />
      ) : null}
    </svg>
  );
}

export const ActuatorPanel = memo(function ActuatorPanel({ snap, lang }: { snap: ActuatorSnapshot | null; lang: 'zh' | 'en' }) {
  const L = COPY[lang];
  const [mode, setMode] = useState<'traces' | 'hardware'>('traces');
  return (
    <aside className="mb-out" aria-label={L.aria}>
      <div className="mb-out__in">
        <div className="mb-out__head">
          <span>{L.title}</span>
          <span className="mb-out__window">{mode === 'traces' ? L.window : (lang === 'zh' ? '最新采样' : 'latest sample')}</span>
        </div>
        <p className="mb-out__source">{L.source}</p>
        <div className="mb-out__modes" role="group" aria-label={lang === 'zh' ? '输出视图' : 'Output view'}>
          <button type="button" aria-pressed={mode === 'traces'} onClick={() => setMode('traces')}>{L.waveform}</button>
          <button type="button" aria-pressed={mode === 'hardware'} onClick={() => setMode('hardware')}>{L.hardware}</button>
        </div>
        {mode === 'hardware' ? <HardwareReadout snapshot={snap?.hardware ?? null} lang={lang} /> : <>{READOUT_GROUPS.map((g) => (
          <div key={g} className="mb-out__group" role="group" aria-label={L.groups[g]} title={L.tips[g]}>
            <div className="mb-out__gname">{L.groups[g]}</div>
            {READOUT_CHANNELS.filter((c) => c.group === g).map((c) => {
              const v = snap?.values[c.key];
              const off = c.key === 'pitch' && snap !== null && !snap.voicing;
              return (
                <div key={c.key} className={`mb-out__row${off ? ' is-off' : ''}`}>
                  <span className="mb-out__k">{L.keys[c.key]}</span>
                  <Spark c={c} data={snap?.series[c.key] ?? []} cap={snap?.capacity ?? 2} target={snap?.targets[c.key]} />
                  <span className="mb-out__v">
                    {v === undefined ? '—' : fmt(c, v)}
                    <small>{c.unit}</small>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        <p className="mb-out__note">{L.note}</p></>}
      </div>
    </aside>
  );
});
