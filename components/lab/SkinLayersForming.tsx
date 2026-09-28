'use client';

import { useMemo, useState } from 'react';
import { buildLayerProfiles } from '../../src/lib/space/skin-layers-forming';
import { buildLayerSurface } from '../../src/lib/space/skin-layers-surface';
import type { LayerStudy } from '../../src/lib/space/skin-layers';
import { SkinSolidBench, type SolidLayout, type SolidSurface } from './SkinSolidBench';

const UNITS = buildLayerProfiles();
const LAYOUTS: readonly SolidLayout[] = [
  { key: 'detail', label: '台部特写', gapX: 210, gapZ: 0, pivot: { x: 0, y: 490, z: 0 }, camScale: 1.55, home: 'axon' },
  { key: 'whole', label: '完整带', gapX: 210, gapZ: 0, pivot: { x: 0, y: 345, z: 0 }, camScale: .65, home: 'axon' },
  { key: 'profiles', label: '截面对照', gapX: 155, gapZ: 0, pivot: { x: 270, y: 493, z: 0 }, camScale: .95, home: 'front' },
];

/** 完整表面与截面对照共用四条引擎；改变装配参数不重播、不重建终态。 */
export function SkinLayersForming({ active, onLight, study }: { active: boolean; onLight: boolean; study: LayerStudy }) {
  const [pose, setPose] = useState(true);
  const surface = useMemo<SolidSurface>(() => {
    let key = '', first: Float64Array | undefined, result: ReturnType<typeof buildLayerSurface>;
    return (frames, layout) => {
      if (layout === 'profiles') return null;
      const next = `${layout}:${frames.map(f => f.step).join(',')}`;
      if (next !== key || first !== frames[0].px) {
        result = buildLayerSurface(study, frames, pose, layout === 'whole'); key = next; first = frames[0].px;
      }
      return result;
    };
  }, [study, pose]);
  return <div className="layer-forming">
    <SkinSolidBench active={active} onLight={onLight} units={UNITS} raw layouts={LAYOUTS} surface={surface}
      ceiling="span" depth={9} thick={1.5} rail="fixed" rate={110}
      extraControls={<div className="grp"><label><input type="checkbox" checked={pose} onChange={e => setPose(e.target.checked)} />表面倾斜装配</label></div>}
      hud={{ kicker: 'Lab 2-6 / 成形验证', title: '单元内的多层台',
        sub: '截面求解 · 表面装配',
        hint: '原始求解节点 · 拖拽旋转 · 滚轮缩放',
        aria: '多层台完整形体成形：实际截面沿圆周组成表面，支持缺口、局部厚台和对向连接，可重播和暂停' }} />
    <p className="layer-footnote">表面随真实截面逐帧成形；缺口处收口，厚台区上下贯通。倾斜目前是空间装配，可取消勾选对照水平结果；尚未模拟环向受力及倾斜成形机制。截面对照从左至右为双层、厚台、仅上层、仅下层；键数为这四类截面的合计。</p>
  </div>;
}
