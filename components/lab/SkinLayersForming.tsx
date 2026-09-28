'use client';

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
    <SkinSolidBench active={active} onLight={onLight} units={UNITS} raw layouts={LAYOUTS} surface={surface}
      ceiling="span" depth={9} thick={1.5} rail="fixed" rate={110}
      extraControls={<div className="grp"><label><input type="checkbox" checked={pose} onChange={e => setPose(e.target.checked)} />倾斜装配</label></div>}
      hud={{ kicker: 'Lab 2-6 / 成形验证', title: '单元内的多层台',
        sub: `${count} 条窄带 · 每条带独立成形 · 带间留缝`,
        hint: '原始求解节点 · 拖拽旋转 · 滚轮缩放',
        aria: '多层台条带成形：独立窄带围成整个单元，可查看各带截面、带间空隙与锁定键线，支持缺口与对向厚台' }} />
    <p className="layer-footnote">与 Lab 2-5 相同的窄带、条纹和键线；每条带随真实截面成形，条带之间留空。倾斜仍为可关闭的装配预览，尚未模拟环向受力及倾斜成形机制。截面对照从左至右为双层、厚台、仅上层、仅下层；键数为这四类截面的合计。</p>
  </div>;
}
