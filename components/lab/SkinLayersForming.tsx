'use client';

import { useBenchLang, useLabText } from './LabLanguage';

import { useMemo, useState } from 'react';
import { buildLayerProfiles } from '../../src/lib/space/skin-layers-forming';
import { buildLayerBands, layerBandPlan } from '../../src/lib/space/skin-layers-bands';
import type { LayerStudy } from '../../src/lib/space/skin-layers';
import { SkinSolidBench, type SolidLayout, type SolidSurface } from './SkinSolidBench';

const UNITS = buildLayerProfiles();
const LAYOUTS: readonly SolidLayout[] = [
  { key: 'whole', label: '整圈条带', gapX: 210, gapZ: 0, pivot: { x: 0, y: 345, z: 0 }, camScale: .65, home: 'axon' },
  { key: 'detail', label: '台部特写', gapX: 210, gapZ: 0, pivot: { x: 0, y: 490, z: 0 }, camScale: 1.55, home: 'axon' },
  { key: 'profiles', label: '截面对照', gapX: 155, gapZ: 0, pivot: { x: 270, y: 493, z: 0 }, camScale: .95, home: 'front' },
];

/** 一圈独立窄带与截面对照共用四条引擎；改变装配参数不重播。 */
export function SkinLayersForming({ active, onLight, study }: { active: boolean; onLight: boolean; study: LayerStudy }) {
  const lang = useBenchLang();
  const tx = useLabText(lang);
  const [pose, setPose] = useState(true);
  const surface = useMemo<SolidSurface>(() => {
    let key = '', first: Float64Array | undefined, result: ReturnType<typeof buildLayerBands>;
    return (frames, layout) => {
      if (layout === 'profiles') return null;
      const next = `${layout}:${frames.map(f => f.step).join(',')}`;
      if (next !== key || first !== frames[0].px) {
        result = buildLayerBands(study, frames, pose, layout === 'whole'); key = next; first = frames[0].px;
      }
      return result;
    };
  }, [study, pose]);
  const count = useMemo(() => layerBandPlan(study).filter(b => b.kind).length, [study]);
  return <div className="layer-forming">
    <SkinSolidBench lang={lang} active={active} onLight={onLight} units={UNITS} raw layouts={LAYOUTS} surface={surface} workspace
      ceiling="span" depth={9} thick={1.5} rail="fixed" rate={110} skin={{ def: 0.35 }}
      extraControls={<div className="grp"><label><input type="checkbox" checked={pose} onChange={e => setPose(e.target.checked)} />{tx("倾斜装配")}</label></div>}
      hud={lang === 'en' ? { kicker: 'Lab 2-6 / Forming study', title: 'Layers within one unit',
        sub: `${count} bands · shape, size, joins and tilt: assembly preview`,
        hint: 'Section solve + assembly preview · drag to orbit',
        aria: 'Independent bands form a layered unit; inspect sections, gaps and locked bonds',
      } : { kicker: 'Lab 2-6 / 成形验证', title: '单元内的多层台',
        sub: `${count} 条窄带 · 圆方、尺寸、连接与倾斜：装配预览`,
        hint: '截面求解 + 装配预览 · 拖拽旋转',
        aria: '多层台条带成形：独立窄带围成整个单元，可查看各带截面、带间空隙与锁定键线，支持缺口与对向厚台' }} />
    <p className="layer-footnote">{lang === 'zh' ? '蒙皮包住带间空隙与暴露侧面。圆方、尺寸、连接深度与倾斜为装配预览；截面对照保留原解，未模拟环向受力。' : 'Skin covers gaps between bands and exposed ends. Shape, size, join depth and tilt preview the assembly; Sections keeps the original solve. No circumferential forces are simulated.'}</p>
  </div>;
}
