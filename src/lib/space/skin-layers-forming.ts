/** Lab 2-6：水平双层区 / 恒高厚台区的两个真实截面。环向交界尚未验证。 */
import { sqSplitStructure, sqSplitWrap, type SqSplitTier } from './skin-square-split';
import { SPLIT_RING_TIERS } from './skin-split-ring';

/** 两区共用一个收缩协议与总带长；不是将旧 j9（高 32）拉伸到 132。 */
export const LAYER_FORMING = { height: 132, gap: 100, reach: 83.2, r1: 0.44, freeTotal: 305, band: 350 } as const;
export type LayerProfileKind = 'double' | 'solid';

export function buildLayerProfile(kind: LayerProfileKind) {
  const tier: SqSplitTier = kind === 'double'
    ? { ...SPLIT_RING_TIERS[0], boxD: 80 }
    : { ...SPLIT_RING_TIERS[9], k: 72 };
  const structure = sqSplitStructure(tier, LAYER_FORMING.gap, { height: LAYER_FORMING.height, r1: LAYER_FORMING.r1 });
  const { spec, base } = sqSplitWrap(structure.seg, LAYER_FORMING.freeTotal, `layers-${kind}`);
  const r = structure.rel;
  return {
    spec, opts: structure.optsAt(base),
    // 成形审查使用原始节点，不以绘图平滑隐藏折痕或瞬态。
    smooth: [1, 0] as const,
    ...(kind === 'double' ? { seam: base + r.center } : {}),
    lead: base, free: structure.seg[1],
    marks: {
      center: base + r.center, mouthA: base + r.mouthA, mouthB: base + r.mouthB,
      faceA: base + r.faceA, faceB: base + r.faceB, outA: base + r.outA, outB: base + r.outB,
    },
  };
}

export const buildLayerProfiles = () => (['double', 'solid'] as const).map(buildLayerProfile);
