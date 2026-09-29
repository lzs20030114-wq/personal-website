'use client';

import { useBenchLang, useLabText } from './LabLanguage';

import { LabControlLabel } from './LabControlLabel';

import { useEffect, useMemo, useRef, useState } from 'react';
import { OrbitCamera } from '../../src/lib/linkage/camera3d';
import { FlatRenderer, bakeIndexed } from '../../src/lib/linkage/gl3d';
import { ringPlateVerts } from '../../src/lib/space/skin-solid';
import { buildLayerGeometry, layerAngles, layerBaseline, layerColumns, layerCovers, layerExample,
  layerHeight, layerRadius, layerJoinSpans, layersJoin, layerStats, LAYERS, LAYER_EXAMPLES, LAYER_OUTLINES, LAYER_JOINS, LAYER_MORPHS,
  type LayerMaterial, type LayerShape, type LayerStudy } from '../../src/lib/space/skin-layers';
import { useBenchLoop } from './useBenchLoop';
import { attachLabCamera } from './labCameraInput';
import { planFromHash } from './planHash';
import { SkinLayersForming } from './SkinLayersForming';
import { LAYER_COLORS as COLORS } from '../../src/lib/space/skin-layers-surface';

const VIEWS = [{ key: 'axon', label: '轴测' }, { key: 'front', label: '正' }, { key: 'side', label: '侧' }, { key: 'top', label: '顶' }] as const;
type View = (typeof VIEWS)[number]['key'];
function orientation(view: View): number[] {
  const pitch = view === 'top' ? -Math.PI / 2 : view === 'axon' ? -0.5 : 0;
  const yaw = view === 'side' ? -Math.PI / 2 : view === 'axon' ? -0.65 : 0;
  const c = Math.cos(pitch), s = Math.sin(pitch), u = Math.cos(yaw), v = Math.sin(yaw);
  return [u, 0, v, s * v, c, -s * u, -c * v, s, c * u];
}

function StudyDrawings({ study, cut }: { study: LayerStudy; cut: number }) {
  const lang = useBenchLang();
  const tx = useLabText(lang);
  const aa = layerAngles(study);
  const polar = (r: number, a: number) => [r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180)];
  // SSR 与浏览器的三角函数末位可能不同；图纸坐标统一到 0.001，避免水合属性漂移。
  const wedge = (a: number, b: number, surface: number) => 'M' + [polar(LAYERS.inner, a), polar(layerRadius(study, surface, a), a), polar(layerRadius(study, surface, b), b), polar(LAYERS.inner, b)].map(p => p.map(v => v.toFixed(3)).join(',')).join('L') + 'Z';
  const rim = (surface: number) => 'M' + aa.map(a => polar(layerRadius(study, surface, a), a).map(v => v.toFixed(3)).join(',')).join('L') + 'Z';
  return <div className="layer-drawings">
    {(['upper', 'lower'] as const).map(key => <svg key={key} viewBox="-135 -155 270 290" role="img" aria-label={`${tx(key === 'upper' ? '上层' : '下层')} · ${tx('俯视轮廓')}`}>
      <text x="-120" y="-133">{key === 'upper' ? tx('上层') : tx('下层')} {tx("· 俯视")}</text>
      <path d={rim(key === 'upper' ? 0 : 2)} className="layer-guide" /><circle r={LAYERS.inner} className="layer-guide" />
      {([key, 'join'] as const).map(material => <path key={material} fill={COLORS[material].svg} fillOpacity="0.6" d={aa.slice(0, -1).map((a, i) => {
        const mid = (a + aa[i + 1]) / 2;
        return layerCovers(study[key], mid) && (layersJoin(study, mid) ? 'join' : key) === material ? wedge(a, aa[i + 1], key === 'upper' ? 0 : 2) : '';
      }).join('')} />)}
      <line x1={-124} x2={124} transform={`rotate(${cut})`} className="layer-cut" />
      <text x="103" y="-7">0°</text>
    </svg>)}
    <svg viewBox="-135 -155 270 290" role="img" aria-label={`${tx('剖面')} ${cut}°`}>
      <text x="-120" y="-133">{tx("剖面 ·")} {cut}°</text>
      <rect x={-LAYERS.inner} y="-120" width={2 * LAYERS.inner} height="240" className="layer-guide" />
      {([1, -1] as const).flatMap(sign => {
        const a = cut + (sign < 0 ? 180 : 0);
        return layerColumns(study, a).map((col, i) => {
          const outer = Array.from({ length: col.bottom - col.top + 1 }, (_, j) => col.top + j).map(h => [layerRadius(study, h, a), h]);
          const pts = [[LAYERS.inner, col.top], ...outer, [LAYERS.inner, col.bottom]]
            .map(([r, h]) => `${(sign * r).toFixed(3)},${layerHeight(study, h, r, a).toFixed(3)}`).join(' ');
          return <polygon key={`${sign}:${i}`} points={pts} fill={COLORS[col.material].svg} fillOpacity="0.25" stroke={COLORS[col.material].svg} strokeWidth="1.5" />;
        });
      })}
    </svg>
  </div>;
}

function Slider({ label, help, value, min = 0, max, step = 1, unit = '°', change }: { label: string; help: string; value: number; min?: number; max: number; step?: number; unit?: string; change: (v: number) => void }) {
  const lang = useBenchLang();
  const tx = useLabText(lang);
  return <label className="layer-slider"><LabControlLabel help={help}>{tx(label)} <output>{Number(value.toFixed(1))}{unit}</output></LabControlLabel>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e => change(Number(e.target.value))} />
  </label>;
}

/** 目标几何与真实截面分开查看；切换保留已有几何设置与播放进度。 */
export function SkinLayersBench({ active = true, controls = true, onLight = false }: { active?: boolean; controls?: boolean; onLight?: boolean }) {
  const lang = useBenchLang();
  const tx = useLabText(lang);
  const [stage, setStage] = useState<'target' | 'forming'>('target');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (planFromHash('2-6', ['forming', 'formed'])) { setStage('forming'); setLoaded(true); }
  }, []);
  if (!controls) return <SkinLayersTarget active={active} controls={false} onLight={onLight} />;
  return <div className="layer-lab">
    <div className="lab-ctl layer-mode"><div className="grp"><LabControlLabel help={["目标形态查看组合；条带成形查看截面与锁定键。", "View the target assembly or inspect forming sections and bonds."]}>{tx("查看")}</LabControlLabel><span className="seg">
      <button type="button" aria-pressed={stage === 'target'} className={stage === 'target' ? 'active' : undefined} onClick={() => setStage('target')}>{tx("目标形态")}</button>
      <button type="button" aria-pressed={stage === 'forming'} className={stage === 'forming' ? 'active' : undefined} onClick={() => { setLoaded(true); setStage('forming'); }}>{tx("条带成形")}</button>
    </span></div></div>
    <SkinLayersTarget active={active} controls onLight={onLight} forming={stage === 'forming'} loaded={loaded} />
  </div>;
}

/** 目标台架不建立 SkinUnit，不显示虚构的锁定/成形数。 */
function SkinLayersTarget({ active, controls, onLight, forming = false, loaded = false }: { active: boolean; controls: boolean; onLight: boolean; forming?: boolean; loaded?: boolean }) {
  const lang = useBenchLang();
  const tx = useLabText(lang);
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
    if (planFromHash('2-6', ['formed'])) { setStudy(layerExample('study')); setExample('study'); }
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
    const detachCamera = attachLabCamera(canvas, { wheel: delta => { cam.wheel(delta); draw(); }, home: () => api.current?.home() });
    const context = (e: Event) => e.preventDefault();
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    canvas.addEventListener('contextmenu', context);
    draw();
    return () => {
      api.current = null;
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('lostpointercapture', up);
      detachCamera(); canvas.removeEventListener('contextmenu', context);
    };
  }, []);
  useBenchLoop(canvasRef, () => api.current?.draw(), [], active && !forming);
  const layer = study[selected];
  const edit = (v: Partial<LayerShape>) => { setExample('custom'); setStudy(s => ({ ...s, [selected]: { ...s[selected], ...v } })); };
  const join = (v: Partial<LayerStudy>) => { setExample('custom'); setStudy(s => ({ ...s, ...v })); };
  const stats = layerStats(study);
  return <div className={`lab-wrap layer-study${onLight ? ' on-light' : ''}`} data-forming={forming || undefined}>
    {loaded && <div className="layer-forming-slot" hidden={!forming}><SkinLayersForming active={active && forming} onLight={onLight} study={study} /></div>}
    <div className="layer-target-slot" hidden={forming}><div className="lab-fig">
      <div className="layer-map"><canvas ref={canvasRef} width="1400" height="880" aria-label={tx("单元内的多层台：可旋转的目标几何，绿色上层、紫色下层、金色连接区域")} /></div>
      <div className="lab-hud tl"><div style={{ color: 'var(--accent-2)' }}>{tx("Lab 2-6 / Project II")}</div><div>{tx("单元内的多层台")}</div><div className="dim">{tx("目标形态 · 几何原型")}</div></div>
      <div className="lab-hud bl dim">{tx(error || '拖拽旋转')}</div>
      <div className="lab-hud br"><div>{study.joinMode === 'opposed' ? tx('对向连接') : tx('连接')} {Math.round(stats.joined)}°</div><div className="dim">{tx("上层绿 · 下层紫 · 连接金")}</div></div>
    </div></div>
    {controls && <>
      <div className="layer-parameters">
      <div className="layer-diagrams">
        <StudyDrawings study={study} cut={cut} />
        <div className="lab-ctl layer-cut-control">
        <Slider label={tx("目标剖面方向")} help="旋转剖切平面，查看不同方向的上下层关系。" value={cut} max={175} step={5} change={setCut} />
        </div>
      </div>
      <div className="lab-ctl lab-ctl--tiered layer-config">
        <div className="lab-ctl__row lab-ctl__solve layer-examples"><div className="grp"><LabControlLabel help={["载入一组上下层轮廓、倾角和连接设置，保留圆方选择。", "Load outlines, tilts and joins while keeping the ring shape."]}>{tx("示例")}</LabControlLabel><select aria-label={tx("示例")} value={example} onChange={e => { const key = e.target.value; setStudy(s => ({ ...layerExample(key), morph: s.morph })); setExample(key); }}>
          <option value="custom" disabled>{lang === 'zh' ? '自定义' : 'Custom'}</option>
          {LAYER_EXAMPLES.map(p => <option key={p.key} value={p.key}>{tx(p.label)}</option>)}
        </select></div></div>
        <div className="layer-settings">
        <div className="lab-ctl__row lab-ctl__solve layer-edit">
          <div className="grp layer-morph"><LabControlLabel help={["上下层一起由圆变方，最大外伸尺寸不变；保留缺口、倾斜、连接与成形进度。", "Morph both layers from round to square at the same maximum radius, keeping gaps, tilts, joins and forming progress."]}>{tx("环形轮廓")}</LabControlLabel><select aria-label={tx("环形轮廓")} value={study.morph} onChange={e => { const morph = Number(e.target.value); setStudy(s => ({ ...s, morph })); }}>{LAYER_MORPHS.map((p, i) => <option key={p.key} value={i}>{tx(p.label)}</option>)}</select></div>
          <div className="grp"><LabControlLabel help={["选择下方参数要修改的层。", "Select the layer to edit."]}>{tx("编辑")}</LabControlLabel><span className="seg">{(['upper', 'lower'] as const).map(k => <button type="button" key={k} className={selected === k ? 'active' : undefined} aria-pressed={selected === k} onClick={() => setSelected(k)}>{k === 'upper' ? tx('上层') : tx('下层')}</button>)}</span></div>
          <div className="grp layer-outline"><LabControlLabel help={["选择该层保留的圆周范围与缺口。", "Choose the sectors and gaps in this layer."]}>{tx("完整度")}</LabControlLabel><span className="seg layer-seg">{LAYER_OUTLINES.map(p => <button type="button" key={p.key} className={layer.outline === p.key ? 'active' : undefined} aria-pressed={layer.outline === p.key} onClick={() => edit({ outline: p.key })}>{tx(p.label)}</button>)}</span></div>
          <div className="layer-sliders">
            <Slider label={tx("平台半径")} help={lang === 'zh' ? '从中轴到本层最远外缘的距离，方环量到角部。上下层独立；轮廓与尺寸为装配预览，不重算截面。' : 'Maximum distance from the axis to the rim, measured to a corner for a square. Each layer is independent; shape and size preview the assembly without re-solving sections.'} value={layer.radius} min={LAYERS.minRadius} max={LAYERS.maxRadius} step={0.1} unit="" change={radius => edit({ radius })} />
            <Slider label={`${tx(selected === 'upper' ? '上层' : '下层')} · ${tx('倾角')}`} help="该层相对水平面的倾斜角度，仅用于装配预览。" value={layer.tilt} max={LAYERS.maxTilt} change={tilt => edit({ tilt })} />
            <Slider label={tx("下坡方向")} help="改变该层向哪一侧倾斜。" value={layer.direction} max={355} step={5} change={direction => edit({ direction })} />
            <Slider label={tx("轮廓方位")} help="旋转该层轮廓，调整缺口朝向。" value={layer.rotation} max={355} step={5} change={rotation => edit({ rotation })} />
          </div>
        </div>
        <div className="lab-ctl__row lab-ctl__solve layer-join" role="group" aria-label={tx("局部厚台连接")}>
          <div className="grp"><LabControlLabel help={["在上下层共同覆盖处连接外缘，形成局部厚台。", "Join outer edges where both layers overlap to form a thick shelf."]}>{tx("局部厚台")}</LabControlLabel><span className="seg">{LAYER_JOINS.map(mode => <button type="button" key={mode.key} className={study.joinMode === mode.key ? 'active' : undefined} aria-pressed={study.joinMode === mode.key} onClick={() => join({ joinMode: mode.key, joinSweep: Math.min(study.joinSweep, mode.key === 'opposed' ? 180 : 360) })}>{tx(mode.label)}</button>)}</span></div>
          <div className="layer-sliders layer-join-sliders">
            <Slider label={tx("单区范围")} help="每个连接扇区的角度；只连接上下层重叠处。" value={study.joinSweep} max={study.joinMode === 'opposed' ? 180 : 360} step={5} change={joinSweep => join({ joinSweep })} />
            <Slider label={tx("起点方位")} help="旋转连接扇区；对向双区一起转动。" value={study.joinStart} max={355} step={5} change={joinStart => join({ joinStart })} />
          </div>
          <span className="layer-note" role="status">{study.joinMode === 'opposed' && <>{tx("起点")} {layerJoinSpans(study).map(span => `${span.start}°`).join(' / ')} · </>}{study.joinSweep > 0 && stats.joined === 0 ? tx('所选扇区没有上下重叠，未形成连接。') : (lang === 'zh' ? `实际连接合计 ${Math.round(stats.joined)}°` : `${Math.round(stats.joined)}° joined`)}</span>
        </div>
        </div>
        {!forming && <div className="lab-ctl__row layer-view"><div className="grp"><LabControlLabel help={["切换轴测、正面、侧面或顶视图，不改变模型。", "Switch camera views without changing the model."]}>{tx("视角")}</LabControlLabel><span className="seg">{VIEWS.map(v => <button type="button" key={v.key} className={view === v.key ? 'active' : undefined} onClick={() => { setView(v.key); api.current?.view(v.key); }}>{tx(v.label)}</button>)}</span><button type="button" onClick={() => { api.current?.home(); setView('axon'); }}>{tx("归位")}</button></div></div>}
      </div>
      <p className="layer-footnote">{tx("上方图纸为目标轮廓与目标剖面；两种查看方式共用这组参数。")}</p>
      </div>
    </>}
  </div>;
}
