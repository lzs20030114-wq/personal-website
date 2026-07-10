import type { DynamicsConfig, LinkageDef } from './types';
import { LinkageSolver } from './solver';

/**
 * 触手实例（轮回机器_触手spec v0.2 拍板：B+C）。
 * 表达：刚性脊柱链（stiffness=1，不可伸长）+ 跨节点软弯曲杆（i↔i+2，
 * rest=2×段长 = 直立记忆，刚度由根到梢递减——根部撑得住自重，梢部甩得开）
 * + 门控 Verlet 动力学（重力向下 + 阻尼，用户拍板 2026-07-10）。
 * 内核之外零新概念：弯曲约束仍是距离约束（SPEC §3.1 同一条公式）。
 */
export const TENTACLE = {
  /** 基座锚点（悬挂点） */
  base: { x: 350, y: 110 },
  /** 段数与段长：14 段 × 20px ≈ 280px 臂长 */
  segments: 14,
  segLen: 20,
  /** 弯曲刚度（per-sweep 乘子，随遍数复合——types.ts Bar.stiffness 注）：根 → 梢 */
  bendRoot: 0.03,
  bendTip: 0.003,
  /** 动力学：重力 px/s²（y 向下），每子步速度保留系数 */
  dynamics: { gravity: { x: 0, y: 900 }, damping: 0.998 } satisfies DynamicsConfig,
  /** 台架迭代预算：链图直径 ≈ 段数，遍数须够根到梢传播一趟 */
  sweeps: 28,
} as const;

/** 初始构型 = 竖直悬垂（重力方向的静息态），一睁眼就在平衡位附近。 */
export function makeTentacleDef(): LinkageDef {
  const { base, segments, segLen, bendRoot, bendTip } = TENTACLE;
  const nodes = Array.from({ length: segments + 1 }, (_, i) => ({
    x: base.x,
    y: base.y + i * segLen,
    fixed: i === 0,
  }));
  const bars: LinkageDef['bars'] = [];
  for (let i = 0; i < segments; i++) bars.push({ a: i, b: i + 1, rest: segLen }); // 脊柱：刚性
  for (let i = 0; i + 2 <= segments; i++) {
    const t = i / (segments - 2); // 0=根 → 1=梢
    bars.push({ a: i, b: i + 2, rest: 2 * segLen, stiffness: bendRoot + (bendTip - bendRoot) * t });
  }
  return { nodes, bars };
}

export function createTentacle(): LinkageSolver {
  return new LinkageSolver(makeTentacleDef(), { dynamics: TENTACLE.dynamics });
}
