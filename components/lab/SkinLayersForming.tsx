'use client';

import { buildLayerProfiles } from '../../src/lib/space/skin-layers-forming';
import { SkinSolidBench, type SolidLayout } from './SkinSolidBench';

const UNITS = buildLayerProfiles();
const LAYOUTS: readonly SolidLayout[] = [
  { key: 'whole', label: '完整带', gapX: 210, gapZ: 0, pivot: { x: 145, y: 331, z: 0 }, camScale: .64, home: 'front' },
  { key: 'detail', label: '台部特写', gapX: 210, gapZ: 0, pivot: { x: 145, y: 493, z: 0 }, camScale: 1.75, home: 'front' },
];

/** 同一条收缩协议下，两类环向区域的截面先并列核对；尚不连成整环。 */
export function SkinLayersForming({ active, onLight }: { active: boolean; onLight: boolean }) {
  return <div className="layer-forming">
    <SkinSolidBench active={active} onLight={onLight} units={UNITS} raw layouts={LAYOUTS}
      ceiling="span" depth={9} thick={1.5} rail="fixed" rate={110}
      hud={{ kicker: 'Lab 2-6 / 成形验证', title: '双层区 / 厚台区',
        sub: '左：双层截面 · 右：恒高厚台截面',
        hint: '原始求解节点 · 拖拽旋转 · 滚轮缩放',
        aria: '真实皮肤成形：左侧双层台截面，右侧等高厚台截面，可重播、暂停和查看终态' }} />
    <p className="layer-footnote">两条带展示同一单元中两种区域的截面。共用收缩量与带长，总高均为 132；左侧保留约 100 的层间空间，右侧连成直边。暂未连接成完整圆环；倾斜、缺口和扇区交界仍待成形验证。</p>
  </div>;
}
