import type { Dynamics3Config, Linkage3Def } from './solver3d';
import { LinkageSolver3D } from './solver3d';

/**
 * 立体肌腱触手（轮回机器_立体求解器spec v0.1）。
 * 机制同触手 spec v0.5（提取自 触手模拟1.ghx），升维后三条肌腱按 120° 方位分布
 * ——即 GH 原模型的 contraction1/2/3 全部可用，不再有「出平面」的第三条。
 * 世界坐标：y 向下为正（与 2D 约定一致），触手自基座悬垂沿 +y。
 */
export const TENTACLE3D = {
  segments: 14,
  segLen: 20,
  discR: 16,
  /** 三肌腱方位角（x-z 平面，弧度）：0°、120°、240° */
  azimuths: [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3],
  bendRoot: 0.03,
  bendTip: 0.003,
  tendonK: 0.12,
  tendonMult: [3.3, 1, 1, 1.2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3],
  contractionFloor: 0.4,
  /** fascia 抗扭斜杆刚度（3D-M3 修正：无它则扭转沿臂累积，单腱收缩卷成螺旋——用户实测） */
  fasciaK: 0.1,
  /** 重力取消（用户拍板 2026-07-10：触手是被驱动机构，非悬垂物）；动量+阻尼保留 */
  dynamics: { gravity: { x: 0, y: 0, z: 0 }, damping: 0.992 } satisfies Dynamics3Config,
  sweeps: 30,
} as const;

const N_NODES = TENTACLE3D.segments + 1;
const N_TENDONS = TENTACLE3D.azimuths.length;
/** 节点索引：脊柱 0..14；导点 (k, i) = N_NODES·(k+1) + i（k = 肌腱号 0..2） */
export const SPINE3 = (i: number): number => i;
export const GUIDE3 = (k: number, i: number): number => N_NODES * (k + 1) + i;
export const TIP3 = TENTACLE3D.segments;

export interface Tendon3Index {
  bars: number[];
  rests: number[];
}

export interface Tentacle3Model {
  def: Linkage3Def;
  tendons: Tendon3Index[];
}

/** 初始构型 = 竖直悬垂（沿 +y），椎盘水平（导点在 x-z 平面按方位角展开）。 */
export function makeTentacle3Model(): Tentacle3Model {
  const { segments, segLen, discR, azimuths, bendRoot, bendTip, tendonK, tendonMult } = TENTACLE3D;
  const nodes: Linkage3Def['nodes'] = [];
  // 脊柱（基座在原点）
  for (let i = 0; i < N_NODES; i++) nodes.push({ x: 0, y: i * segLen, z: 0, fixed: i === 0 });
  // 导点（基座椎盘整体锚定 = 夹持 + 扭转参考）
  for (const a of azimuths) {
    for (let i = 0; i < N_NODES; i++) {
      nodes.push({
        x: discR * Math.cos(a),
        y: i * segLen,
        z: discR * Math.sin(a),
        fixed: i === 0,
      });
    }
  }

  const bars: Linkage3Def['bars'] = [];
  // 脊柱（刚性）
  for (let i = 0; i < segments; i++) bars.push({ a: SPINE3(i), b: SPINE3(i + 1), rest: segLen });
  // 背骨 Rod：跨节点软杆，直立记忆，根粗梢细
  for (let i = 0; i + 2 <= segments; i++) {
    const t = i / (segments - 2);
    bars.push({
      a: SPINE3(i),
      b: SPINE3(i + 2),
      rest: 2 * segLen,
      stiffness: bendRoot + (bendTip - bendRoot) * t,
    });
  }
  // 椎盘刚性化：导点 ↔ 本节脊柱 + 参考邻节（末节用前一节）+ 三导点弦（等边三角）。
  // 起始导点逐节轮换（i%3）——对消 GS 顺序偏差（平面版实测教训）。
  const hyp = Math.hypot(discR, segLen);
  const chord = discR * Math.sqrt(3);
  for (let i = 0; i < N_NODES; i++) {
    const ref = i < segments ? i + 1 : i - 1;
    for (let j = 0; j < N_TENDONS; j++) {
      const k = (i + j) % N_TENDONS;
      bars.push({ a: GUIDE3(k, i), b: SPINE3(i), rest: discR });
      bars.push({ a: GUIDE3(k, i), b: SPINE3(ref), rest: hyp });
      bars.push({ a: GUIDE3(k, i), b: GUIDE3((k + 1) % N_TENDONS, i), rest: chord });
    }
  }
  // fascia 抗扭斜杆（双手性交叉，每隙 6 根软杆）：扭转使全部斜杆同向变长/变短
  // → 强抗扭；弯曲使其差动变化 → 弱且近各向同性的阻力。不加则扭转自由度
  // 无约束，收缩的弯矩方向逐节旋转、单腱收缩卷成螺旋（用户实测，3D-M3）。
  const diag = Math.hypot(chord, segLen);
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < N_TENDONS; j++) {
      const k = (i + j) % N_TENDONS;
      bars.push({
        a: GUIDE3(k, i),
        b: GUIDE3((k + 1) % N_TENDONS, i + 1),
        rest: diag,
        stiffness: TENTACLE3D.fasciaK,
      });
      bars.push({
        a: GUIDE3(k, i),
        b: GUIDE3((k + 2) % N_TENDONS, i + 1),
        rest: diag,
        stiffness: TENTACLE3D.fasciaK,
      });
    }
  }
  // 肌腱：相邻椎盘同名导点间的软杆链，顺序逐段轮换
  const tendons: Tendon3Index[] = azimuths.map(() => ({ bars: [], rests: [] }));
  for (let i = 0; i < segments; i++) {
    const k = Math.min(1, tendonK * tendonMult[i]);
    for (let j = 0; j < N_TENDONS; j++) {
      const t = (i + j) % N_TENDONS;
      tendons[t].bars.push(bars.length);
      tendons[t].rests.push(segLen);
      bars.push({ a: GUIDE3(t, i), b: GUIDE3(t, i + 1), rest: segLen, stiffness: k });
    }
  }
  return { def: { nodes, bars }, tendons };
}

/** 肌腱收缩（公式同平面版 = GH GhPython）：rest = orig × (1 − 0.6c)，c∈[0,1]。 */
export function applyContraction3(solver: LinkageSolver3D, tendon: Tendon3Index, c: number): void {
  const span = 1 - TENTACLE3D.contractionFloor;
  const scale = 1 - span * Math.min(1, Math.max(0, c));
  for (let j = 0; j < tendon.bars.length; j++) {
    solver.setRest(tendon.bars[j], tendon.rests[j] * scale);
  }
}

export function createTentacle3(): { solver: LinkageSolver3D; tendons: Tendon3Index[] } {
  const { def, tendons } = makeTentacle3Model();
  return { solver: new LinkageSolver3D(def, { dynamics: TENTACLE3D.dynamics }), tendons };
}
