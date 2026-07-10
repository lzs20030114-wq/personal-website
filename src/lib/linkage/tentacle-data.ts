import type { DynamicsConfig, LinkageDef } from './types';
import { LinkageSolver } from './solver';

/**
 * 肌腱驱动触手（轮回机器_触手spec v0.5，机制提取自 触手模拟1.ghx）。
 *
 * 真机机制（Kangaroo2，16 刚体椎节 + 3 肌腱 × 14 段 Spring + Rod 背骨 + BouncySolver）
 * 的平面映射（用户拍板 2026-07-10：先平面模拟，立体求解器另行立项）：
 * - 椎节 = 脊柱节点上的垂直横杆（左右导点，刚性三角化——拱环 K4 先例）；
 * - 肌腱 = 穿过相邻椎板导点的软杆链（GH 原模型就是双边 Spring，非单边绳索），
 *   平面内取左右对拉两条（三条 120° 分布中第三条出平面）；
 * - 收缩 = 运行时按 GH 公式缩放肌腱段 rest：target = orig × (1 − 0.6c)，
 *   c∈[0,1]（对应 GH 滑块 10→4，收缩底限 40% 原长）；
 * - 背骨 Rod = 跨节点软弯曲杆（直立记忆，根粗梢细）；
 * - BouncySolver 的动量 = 门控 Verlet（SPEC §3.6）。碰撞不做（§1.2 锁死）。
 */
export const TENTACLE = {
  /** 基座悬挂点 */
  base: { x: 350, y: 96 },
  /** 脊柱段数（GH：肌腱 14 段）；节点数 = segments + 1 */
  segments: 14,
  segLen: 20,
  /** 椎板半宽（导点到脊柱的距离 = 肌腱力臂） */
  discR: 16,
  /** 背骨弯曲刚度（per-sweep 乘子）：根 → 梢 */
  bendRoot: 0.03,
  bendTip: 0.003,
  /** 肌腱基础刚度（Kangaroo Spring 有限强度的对应物） */
  tendonK: 0.12,
  /** 逐段强度倍率（GH str_multipliers：首段 3.3、第 4 段 1.2、末段 3） */
  tendonMult: [3.3, 1, 1, 1.2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3],
  /** 收缩底限：c=1 时 rest = 0.4 × 原长（GH 滑块 4/10） */
  contractionFloor: 0.4,
  dynamics: { gravity: { x: 0, y: 900 }, damping: 0.998 } satisfies DynamicsConfig,
  sweeps: 30,
} as const;

const N_NODES = TENTACLE.segments + 1;
/** 节点索引：脊柱 0..14，左导点 15..29，右导点 30..44 */
export const SPINE = (i: number): number => i;
export const LEFT = (i: number): number => N_NODES + i;
export const RIGHT = (i: number): number => 2 * N_NODES + i;
export const TIP = TENTACLE.segments;

export interface TendonIndex {
  /** 肌腱段的 bar 下标与自然原长（收缩公式的 orig） */
  bars: number[];
  rests: number[];
}

export interface TentacleModel {
  def: LinkageDef;
  left: TendonIndex;
  right: TendonIndex;
}

/** 初始构型 = 竖直悬垂、椎板水平。 */
export function makeTentacleModel(): TentacleModel {
  const { base, segments, segLen, discR, bendRoot, bendTip, tendonK, tendonMult } = TENTACLE;
  const nodes: LinkageDef['nodes'] = [];
  // 脊柱
  for (let i = 0; i < N_NODES; i++) nodes.push({ x: base.x, y: base.y + i * segLen, fixed: i === 0 });
  // 左/右导点（基座椎板与脊柱根同锚 = 夹持基座）
  for (let i = 0; i < N_NODES; i++) nodes.push({ x: base.x - discR, y: base.y + i * segLen, fixed: i === 0 });
  for (let i = 0; i < N_NODES; i++) nodes.push({ x: base.x + discR, y: base.y + i * segLen, fixed: i === 0 });

  const bars: LinkageDef['bars'] = [];
  // 脊柱（刚性，不可伸长）
  for (let i = 0; i < segments; i++) bars.push({ a: SPINE(i), b: SPINE(i + 1), rest: segLen });
  // 背骨 Rod：跨节点软杆，直立记忆，根粗梢细
  for (let i = 0; i + 2 <= segments; i++) {
    const t = i / (segments - 2);
    bars.push({ a: SPINE(i), b: SPINE(i + 2), rest: 2 * segLen, stiffness: bendRoot + (bendTip - bendRoot) * t });
  }
  // 椎板刚性三角化：导点 ↔ 本节脊柱点 + 参考邻点（末节用前一节），加左右横杆。
  // 左右插入顺序逐节交替——GS 就地更新有顺序偏差，软约束下恒定顺序会累积成
  // 可见的侧倾（实测 ~33px），交替后对消。
  const hyp = Math.hypot(discR, segLen);
  for (let i = 0; i < N_NODES; i++) {
    const ref = i < segments ? i + 1 : i - 1;
    const pair = i % 2 === 0 ? [LEFT(i), RIGHT(i)] : [RIGHT(i), LEFT(i)];
    for (const G of pair) {
      bars.push({ a: G, b: SPINE(i), rest: discR });
      bars.push({ a: G, b: SPINE(ref), rest: hyp });
    }
    bars.push({ a: LEFT(i), b: RIGHT(i), rest: 2 * discR });
  }
  // 肌腱：相邻椎板导点间的软杆链（记录下标与自然原长，收缩驱动用）。
  // 同样逐段交替左右顺序。
  const left: TendonIndex = { bars: [], rests: [] };
  const right: TendonIndex = { bars: [], rests: [] };
  const pushTendon = (t: TendonIndex, a: number, b: number, k: number): void => {
    t.bars.push(bars.length);
    t.rests.push(segLen);
    bars.push({ a, b, rest: segLen, stiffness: k });
  };
  for (let i = 0; i < segments; i++) {
    const k = Math.min(1, tendonK * tendonMult[i]);
    if (i % 2 === 0) {
      pushTendon(left, LEFT(i), LEFT(i + 1), k);
      pushTendon(right, RIGHT(i), RIGHT(i + 1), k);
    } else {
      pushTendon(right, RIGHT(i), RIGHT(i + 1), k);
      pushTendon(left, LEFT(i), LEFT(i + 1), k);
    }
  }
  return { def: { nodes, bars }, left, right };
}

/**
 * 肌腱收缩（GH GhPython 公式的平面版）：c∈[0,1]，
 * rest = orig × (1 − (1 − contractionFloor)·c)。c=0 放松原长，c=1 收到 40%。
 */
export function applyContraction(solver: LinkageSolver, tendon: TendonIndex, c: number): void {
  const span = 1 - TENTACLE.contractionFloor;
  const scale = 1 - span * Math.min(1, Math.max(0, c));
  for (let j = 0; j < tendon.bars.length; j++) {
    solver.setRest(tendon.bars[j], tendon.rests[j] * scale);
  }
}

export function createTentacle(): { solver: LinkageSolver; left: TendonIndex; right: TendonIndex } {
  const { def, left, right } = makeTentacleModel();
  return { solver: new LinkageSolver(def, { dynamics: TENTACLE.dynamics }), left, right };
}
