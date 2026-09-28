/** Lab 2-6：双层、厚台、仅上层、仅下层的真实截面。 */
import { sqSplitStructure, sqSplitWrap, type SqSplitTier } from './skin-square-split';
import { SPLIT_RING_TIERS } from './skin-split-ring';

/** 两区共用一个收缩协议与总带长；不是将旧 j9（高 32）拉伸到 132。 */
export const LAYER_FORMING = { height: 132, gap: 100, reach: 83.2, r1: 0.44, freeTotal: 305, band: 350 } as const;
export type LayerProfileKind = 'double' | 'solid' | 'upper' | 'lower';
export const LAYER_PROFILE_KINDS = ['double', 'solid', 'upper', 'lower'] as const;

export function buildLayerProfile(kind: LayerProfileKind) {
  const single = kind === 'upper' || kind === 'lower';
  const tier: SqSplitTier = kind === 'double'
    ? { ...SPLIT_RING_TIERS[0], boxD: 80 }
    : { ...SPLIT_RING_TIERS[9], k: single ? 43 : 72 };
  const structure = sqSplitStructure(tier, single ? 0 : LAYER_FORMING.gap, { height: single ? 16 : LAYER_FORMING.height, r1: LAYER_FORMING.r1 });
  // ±66 节配平垫给出 ±58.08 的物理站位；不在显示时平移截面对齐。
  const { spec, base } = sqSplitWrap(structure.seg, LAYER_FORMING.freeTotal, `layers-${kind}`, kind === 'upper' ? -66 : kind === 'lower' ? 66 : 0);
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

export const buildLayerProfiles = () => LAYER_PROFILE_KINDS.map(buildLayerProfile);
