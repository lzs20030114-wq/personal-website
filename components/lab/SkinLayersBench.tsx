'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed } from '../../src/lib/linkage/gl3d';
import { ringPlateVerts } from '../../src/lib/space/skin-solid';
import { buildLayerGeometry, layerAngles, layerBaseline, layerColumns, layerCovers, layerExample,
  layerHeight, layerJoinSpans, layersJoin, layerStats, LAYERS, LAYER_EXAMPLES, LAYER_OUTLINES, LAYER_JOINS,
  type LayerMaterial, type LayerShape, type LayerStudy } from '../../src/lib/space/skin-layers';
import { useBenchLoop } from './useBenchLoop';
import { planFromHash } from './planHash';

const COLORS: Record<LayerMaterial, { dark: [number, number, number]; light: [number, number, number]; svg: string }> = {
  upper: { dark: [0.08, 0.18, 0.14], light: [0.48, 0.77, 0.61], svg: '#8bc5a1' },
  lower: { dark: [0.16, 0.13, 0.23], light: [0.69, 0.63, 0.84], svg: '#b5a8d5' },
  join: { dark: [0.23, 0.17, 0.1], light: [0.83, 0.70, 0.47], svg: '#d4b278' },
};
const VIEWS = [{ key: 'axon', label: '轴测' }, { key: 'front', label: '正' }, { key: 'side', label: '侧' }, { key: 'top', label: '顶' }] as const;
type View = (typeof VIEWS)[number]['key'];
function orientation(view: View): number[] {
  const pitch = view === 'top' ? -Math.PI / 2 : view === 'axon' ? -0.5 : 0;
  const yaw = view === 'side' ? -Math.PI / 2 : view === 'axon' ? -0.65 : 0;
  const c = Math.cos(pitch), s = Math.sin(pitch), u = Math.cos(yaw), v = Math.sin(yaw);
  return [u, 0, v, s * v, c, -s * u, -c * v, s, c * u];
}

function StudyDrawings({ study, cut }: { study: LayerStudy; cut: number }) {
  const aa = layerAngles(study);
  const polar = (r: number, a: number) => [r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180)];
  // SSR 与浏览器的三角函数末位可能不同；图纸坐标统一到 0.001，避免水合属性漂移。
  const wedge = (a: number, b: number) => 'M' + [polar(LAYERS.inner, a), polar(LAYERS.outer, a), polar(LAYERS.outer, b), polar(LAYERS.inner, b)].map(p => p.map(v => v.toFixed(3)).join(',')).join('L') + 'Z';
  return <div className="layer-drawings">
    {(['upper', 'lower'] as const).map(key => <svg key={key} viewBox="-135 -155 270 290" role="img" aria-label={`${key === 'upper' ? '上层' : '下层'}俯视轮廓`}>
      <text x="-120" y="-133">{key === 'upper' ? '上层' : '下层'} · 俯视</text>
      <circle r={LAYERS.outer} className="layer-guide" /><circle r={LAYERS.inner} className="layer-guide" />
      {([key, 'join'] as const).map(material => <path key={material} fill={COLORS[material].svg} fillOpacity="0.6" d={aa.slice(0, -1).map((a, i) => {
        const mid = (a + aa[i + 1]) / 2;
        return layerCovers(study[key], mid) && (layersJoin(study, mid) ? 'join' : key) === material ? wedge(a, aa[i + 1]) : '';
      }).join('')} />)}
      <line x1={-124} x2={124} transform={`rotate(${cut})`} className="layer-cut" />
      <text x="103" y="-7">0°</text>
    </svg>)}
    <svg viewBox="-135 -155 270 290" role="img" aria-label={`沿 ${cut} 度的剖面`}>
      <text x="-120" y="-133">剖面 · {cut}°</text>
      <rect x={-LAYERS.inner} y="-120" width={2 * LAYERS.inner} height="240" className="layer-guide" />
      {([1, -1] as const).flatMap(sign => {
        const a = cut + (sign < 0 ? 180 : 0);
        return layerColumns(study, a).map((col, i) => {
          const pts = [[LAYERS.inner, col.top], [LAYERS.outer, col.top], [LAYERS.outer, col.bottom], [LAYERS.inner, col.bottom]]
            .map(([r, h]) => `${(sign * r).toFixed(3)},${layerHeight(study, h, r, a).toFixed(3)}`).join(' ');
          return <polygon key={`${sign}:${i}`} points={pts} fill={COLORS[col.material].svg} fillOpacity="0.25" stroke={COLORS[col.material].svg} strokeWidth="1.5" />;
        });
      })}
    </svg>
  </div>;
}

function Slider({ label, value, min = 0, max, step = 1, change }: { label: string; value: number; min?: number; max: number; step?: number; change: (v: number) => void }) {
  return <label className="layer-slider"><span>{label} <output>{value}°</output></span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e => change(Number(e.target.value))} />
  </label>;
}

/** 独立目标台架复用公共相机、WebGL 和停启循环；不建立 SkinUnit，不显示虚构的锁定/成形数。 */
export function SkinLayersBench({ active = true, controls = true, onLight = false }: { active?: boolean; controls?: boolean; onLight?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [study, setStudy] = useState<LayerStudy>(layerBaseline);
  const [selected, setSelected] = useState<'upper' | 'lower'>('upper');
  const [example, setExample] = useState('baseline');
  const [view, setView] = useState<View>('axon');
  const [cut, setCut] = useState(45);
  const [error, setError] = useState('');
  const api = useRef<{ draw: () => void; view: (v: View) => void; home: () => void } | null>(null);
  const data = useMemo(() => {
    const g = buildLayerGeometry(study);
    return { lines: g.lines, meshes: (Object.keys(g.meshes) as LayerMaterial[]).map(key => ({ key, data: bakeIndexed(g.meshes[key].verts, g.meshes[key].idx) })) };
  }, [study]);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; api.current?.draw(); }, [data]);
  useEffect(() => {
    const p = planFromHash('2-6', LAYER_EXAMPLES.map(v => v.key));
    if (p) { setStudy(layerExample(p)); setExample(p); }
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: FlatRenderer;
    try { renderer = new FlatRenderer(canvas, 700, 440, 900); }
    catch { setError('3D 视图不可用；下方俯视和剖面仍可操作。'); return; }
    const cam = new OrbitCamera({ cx: 350, cy: 220, pivot: { x: 0, y: 0, z: 0 }, scale: 1.35, mode: 'turntable', autoYaw: 0, pitch0: -0.5, yaw0: -0.65 });
    const core = ringPlateVerts(LAYERS.inner - 1, LAYERS.inner, 0, 135, 72);
    const coreMesh = bakeIndexed(core.verts, core.idx);
    const draw = () => {
      renderer.beginFrame(cam);
      renderer.drawDynamicMesh(coreMesh, [0.065, 0.08, 0.085], [0.23, 0.28, 0.29]);
      for (const m of dataRef.current.meshes) renderer.drawDynamicMesh(m.data, COLORS[m.key].dark, COLORS[m.key].light);
      renderer.drawLines(dataRef.current.lines, [0.7, 0.77, 0.73], 0.001);
    };
    api.current = { draw, view: k => { cam.setOrientation(orientation(k)); draw(); }, home: () => { cam.reset(); draw(); } };
    const down = (e: PointerEvent) => { cam.pointerDown(e.pointerId, e.clientX, e.clientY, e.button === 2); canvas.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { cam.pointerMove(e.pointerId, e.clientX, e.clientY); draw(); };
    const up = (e: PointerEvent) => cam.pointerUp(e.pointerId);
    const wheel = (e: WheelEvent) => { e.preventDefault(); cam.wheel(e.deltaY); draw(); };
    const context = (e: Event) => e.preventDefault();
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('contextmenu', context);
    draw();
    return () => {
      api.current = null;
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('lostpointercapture', up);
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('contextmenu', context);
    };
  }, []);
  useBenchLoop(canvasRef, () => api.current?.draw(), [], active);
  const layer = study[selected];
  const edit = (v: Partial<LayerShape>) => { setExample('custom'); setStudy(s => ({ ...s, [selected]: { ...s[selected], ...v } })); };
  const join = (v: Partial<LayerStudy>) => { setExample('custom'); setStudy(s => ({ ...s, ...v })); };
  const stats = layerStats(study);
  return <div className={`lab-wrap layer-study${onLight ? ' on-light' : ''}`}>
    <div className="lab-fig">
      <canvas ref={canvasRef} width="1400" height="880" aria-label="单元内的多层台：可旋转的目标几何，绿色上层、紫色下层、金色连接区域" />
      <div className="lab-hud tl"><div style={{ color: 'var(--accent-2)' }}>Lab 2-6 / Project II</div><div>单元内的多层台</div><div className="dim">目标形态 · 几何原型</div></div>
      <div className="lab-hud bl dim">{error || '拖拽旋转 · 滚轮缩放'}</div>
      <div className="lab-hud br"><div>{study.joinMode === 'opposed' ? '对向连接' : '连接'} {Math.round(stats.joined)}°</div><div className="dim">上层绿 · 下层紫 · 连接金</div></div>
    </div>
    {controls && <>
      <StudyDrawings study={study} cut={cut} />
      <div className="lab-ctl lab-ctl--tiered">
        <div className="lab-ctl__row lab-ctl__solve"><div className="grp"><span className="k">示例</span><span className="seg layer-seg">{LAYER_EXAMPLES.map(p => <button type="button" key={p.key} className={example === p.key ? 'active' : undefined} aria-pressed={example === p.key} onClick={() => { setStudy(layerExample(p.key)); setExample(p.key); }}>{p.label}</button>)}</span></div></div>
        <div className="lab-ctl__row lab-ctl__solve layer-edit">
          <div className="grp"><span className="k">编辑</span><span className="seg">{(['upper', 'lower'] as const).map(k => <button type="button" key={k} className={selected === k ? 'active' : undefined} aria-pressed={selected === k} onClick={() => setSelected(k)}>{k === 'upper' ? '上层' : '下层'}</button>)}</span></div>
          <div className="grp layer-outline"><span className="k">完整度</span><span className="seg layer-seg">{LAYER_OUTLINES.map(p => <button type="button" key={p.key} className={layer.outline === p.key ? 'active' : undefined} aria-pressed={layer.outline === p.key} onClick={() => edit({ outline: p.key })}>{p.label}</button>)}</span></div>
          <div className="layer-sliders">
            <Slider label={`${selected === 'upper' ? '上层' : '下层'}倾角`} value={layer.tilt} max={LAYERS.maxTilt} change={tilt => edit({ tilt })} />
            <Slider label="下坡方向" value={layer.direction} max={355} step={5} change={direction => edit({ direction })} />
            <Slider label="轮廓方位" value={layer.rotation} max={355} step={5} change={rotation => edit({ rotation })} />
          </div>
        </div>
        <div className="lab-ctl__row lab-ctl__solve layer-join" role="group" aria-label="局部厚台连接">
          <div className="grp"><span className="k">局部厚台</span><span className="seg">{LAYER_JOINS.map(mode => <button type="button" key={mode.key} className={study.joinMode === mode.key ? 'active' : undefined} aria-pressed={study.joinMode === mode.key} onClick={() => join({ joinMode: mode.key, joinSweep: Math.min(study.joinSweep, mode.key === 'opposed' ? 180 : 360) })}>{mode.label}</button>)}</span></div>
          <div className="layer-sliders layer-join-sliders">
            <Slider label="单区范围" value={study.joinSweep} max={study.joinMode === 'opposed' ? 180 : 360} step={5} change={joinSweep => join({ joinSweep })} />
            <Slider label="起点方位" value={study.joinStart} max={355} step={5} change={joinStart => join({ joinStart })} />
          </div>
          <span className="layer-note" role="status">{study.joinMode === 'opposed' && <>起点 {layerJoinSpans(study).map(span => `${span.start}°`).join(' / ')} · 两区相隔 180°，一起转动<br /></>}{study.joinSweep > 0 && stats.joined === 0 ? '所选扇区没有上下重叠，未形成连接。' : `实际连接合计 ${Math.round(stats.joined)}° · 只连接上下层共同覆盖的部分`}</span>
        </div>
        <div className="lab-ctl__row"><div className="grp"><span className="k">视角</span><span className="seg">{VIEWS.map(v => <button type="button" key={v.key} className={view === v.key ? 'active' : undefined} onClick={() => { setView(v.key); api.current?.view(v.key); }}>{v.label}</button>)}</span><button type="button" onClick={() => { api.current?.home(); setView('axon'); }}>归位</button></div><Slider label="剖面方向" value={cut} max={175} step={5} change={setCut} /></div>
      </div>
      <p className="layer-footnote">俯视轮廓固定；两层可独立倾斜。此处用于讨论目标形态，尚未接入成形求解。</p>
    </>}
  </div>;
}
