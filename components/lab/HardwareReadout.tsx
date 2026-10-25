'use client';

import {
  HARDWARE_CHANNELS,
  type HardwareSnapshot,
} from '../../src/lib/linkage/actuator-hardware';

const COPY = {
  zh: {
    simulated: '仿真', target: '目标', feedback: '真机回读', electrical: '电气输出',
    pending: '待标定', details: '硬件与换算', missing: '还缺',
    download: '导出显示样本 JSON', sample: '采样动作时间',
    note: '9 个逻辑输出：7 个运动轴、声音与灯。真实电机数量仍需核对。',
    exportNote: '暂停时保留最近采样。导出的是仿真需求，未生成可下发的硬件指令。',
    voice: '发声', on: '开', off: '关', voiceFraction: '基础呼吸发声窗口',
    rate: '仿真角速度', crank: '曲柄',
    breath: '0% 全开 · 100% 折叠；曲柄角不能直接当作齿条位移。',
    basis: { 'model-only': '模型设定', 'historical-plan': '档案方案 · 待核实装机', unselected: '硬件未定' },
  },
  en: {
    simulated: 'Simulated', target: 'Target', feedback: 'Hardware feedback', electrical: 'Electrical output',
    pending: 'Uncalibrated', details: 'Hardware & conversion', missing: 'Still needed',
    download: 'Export displayed sample · JSON', sample: 'Sample action time',
    note: '9 logical outputs: 7 motion axes, sound and light. Physical motor count remains unconfirmed.',
    exportNote: 'Pausing retains the latest sample. Simulation requirements only; no executable hardware commands.',
    voice: 'Voice', on: 'on', off: 'off', voiceFraction: 'Base breath voice window',
    rate: 'Simulated angular speed', crank: 'Crank',
    breath: '0% open · 100% folded. Crank angle is not rack displacement.',
    basis: { 'model-only': 'Model setting', 'historical-plan': 'Recorded plan · installation unverified', unselected: 'Hardware undecided' },
  },
} as const;

function valueText(q?: { value: number; unit: string }): string {
  if (!q) return '—';
  if (q.unit === 'fraction') return `${(q.value * 100).toFixed(1)}%`;
  return `${q.value.toFixed(1)} ${q.unit}`;
}

export function HardwareReadout({ snapshot, lang }: { snapshot: HardwareSnapshot | null; lang: 'zh' | 'en' }) {
  const L = COPY[lang];
  const download = () => {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify({ ...snapshot, mapping: HARDWARE_CHANNELS }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lab-1-6-hardware-${snapshot.seed}-${snapshot.timeS.toFixed(2)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="mb-hardware">
      <p className="mb-out__note">{L.note}</p>
      <p className="mb-out__note">{L.sample}: {snapshot ? `${snapshot.timeS.toFixed(2)} s` : '—'}</p>
      {HARDWARE_CHANNELS.map((channel) => {
        const row = snapshot?.rows.find((item) => item.id === channel.id);
        return (
          <section className="mb-hardware__channel" key={channel.id} aria-label={channel.label[lang]}>
            <h4>{channel.label[lang]} <code>{channel.id}</code></h4>
            <dl className="mb-hardware__values">
              <div><dt>{L.simulated}</dt><dd>{valueText(row?.simulated)}</dd></div>
              <div><dt>{L.target}</dt><dd>{valueText(row?.target)}</dd></div>
              <div><dt>{L.feedback}</dt><dd>—</dd></div>
              <div><dt>{L.electrical}</dt><dd>{L.pending}</dd></div>
            </dl>
            {channel.id === 'breath' && <p className="mb-out__note">{L.breath}</p>}
            {row?.extra?.velocityDegS !== undefined && <p className="mb-out__note">
              {row.extra.crankDeg !== undefined && <>{L.crank} {row.extra.crankDeg.toFixed(1)}° · </>}
              {L.rate} {row.extra.velocityDegS.toFixed(1)}°/s
            </p>}
            {row?.extra?.frequencyHz !== undefined && (
              <p className="mb-out__note">
                {L.voice} {row.extra.on ? L.on : L.off} · {row.extra.frequencyHz.toFixed(0)} Hz<br />
                {L.voiceFraction} {((row.extra.cycleVoiceFraction ?? 0) * 100).toFixed(1)}%
              </p>
            )}
            <details className="mb-hardware__details">
              <summary>{L.details}</summary>
              <p className="mb-hardware__basis">{L.basis[channel.basis]}</p>
              <p>{channel.hardware[lang]}</p>
              <p>{channel.formula[lang]}</p>
              <p><strong>{L.missing}: </strong>{channel.calibration[lang]}</p>
            </details>
          </section>
        );
      })}
      <button className="mb-hardware__download" type="button" onClick={download} disabled={!snapshot}>{L.download}</button>
      <p className="mb-out__note">{L.exportNote}</p>
    </div>
  );
}
