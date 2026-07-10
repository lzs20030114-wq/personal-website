import type { Dynamics3Config, Linkage3Def } from './solver3d';
import { LinkageSolver3D } from './solver3d';
import { CHAINS, STATIONS } from './tentacle3d-shape';

/**
 * 立体肌腱触手 v2——真实结构（用户拍板 2026-07-10「用真实的结构而不是线段的模拟」）。
 * 几何不再手编：脊柱节点 = 真机 15 站心，导点 = 真机肌腱孔位（tentacle3d-shape.ts，
 * 提取自 触手模拟1.3dm + ghx 引用 GUID），全部杆长 = 真实初始距离（构造器缺省）。
 * 真结构特征：大/小椎节交替咬合、半径与间距向梢部收锥、三腱方位 90°/332°/208°。
 * 驱动机制同 v1（= GH GhPython 原文）：收缩按比例缩放肌腱段 rest。
 */
export const TENTACLE3D = {
  /** 段数 = 站数 − 1 */
  segments: STATIONS.length - 1,
  /** 背骨弯曲刚度（per-sweep 乘子）：根 → 梢 */
  bendRoot: 0.03,
  bendTip: 0.003,
  tendonK: 0.12,
  tendonMult: [3.3, 1, 1, 1.2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3],
  contractionFloor: 0.4,
  /** fascia 抗扭斜杆刚度（无它则扭转累积、单腱收缩卷成螺旋——用户实测） */
  fasciaK: 0.1,
  /** 重力取消（用户拍板：被驱动机构非悬垂物）；动量+阻尼保留 */
  dynamics: { gravity: { x: 0, y: 0, z: 0 }, damping: 0.992 } satisfies Dynamics3Config,
  sweeps: 30,
} as const;

const N_NODES = STATIONS.length;
const N_TENDONS = CHAINS.length;
/** 节点索引：脊柱 0..14；导点 (k, i) = N_NODES·(k+1) + i */
export const SPINE3 = (i: number): number => i;
export const GUIDE3 = (k: number, i: number): number => N_NODES * (k + 1) + i;
export const TIP3 = TENTACLE3D.segments;

/** 三腱在基座盘面 (x,z) 的单位方向（测试与 UI 用） */
export const TENDON_DIRS: ReadonlyArray<readonly [number, number]> = CHAINS.map((c) => {
  const dx = c[0][0] - STATIONS[0][0];
  const dz = c[0][2] - STATIONS[0][2];
  const r = Math.hypot(dx, dz) || 1;
  return [dx / r, dz / r] as const;
});

export interface Tendon3Index {
  bars: number[];
  rests: number[];
}

export interface Tentacle3Model {
  def: Linkage3Def;
  tendons: Tendon3Index[];
}

const dist = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

/** 初始构型 = 真机静息几何（全部约束天然满足）。 */
export function makeTentacle3Model(): Tentacle3Model {
  const { segments, bendRoot, bendTip, tendonK, tendonMult, fasciaK } = TENTACLE3D;
  const nodes: Linkage3Def['nodes'] = [];
  // 脊柱 = 真实站心（基座站锚定）
  for (let i = 0; i < N_NODES; i++) {
    const [x, y, z] = STATIONS[i];
    nodes.push({ x, y, z, fixed: i === 0 });
  }
  // 导点 = 真实孔位（基座盘整体锚定 = 夹持 + 扭转参考）
  for (let k = 0; k < N_TENDONS; k++) {
    for (let i = 0; i < N_NODES; i++) {
      const [x, y, z] = CHAINS[k][i];
      nodes.push({ x, y, z, fixed: i === 0 });
    }
  }

  // 杆 rest 一律缺省 = 真实初始距离
  const bars: Linkage3Def['bars'] = [];
  // 脊柱（刚性）+ 背骨 Rod（跨节点软杆，直立记忆，根粗梢细）
  for (let i = 0; i < segments; i++) bars.push({ a: SPINE3(i), b: SPINE3(i + 1) });
  for (let i = 0; i + 2 <= segments; i++) {
    const t = i / (segments - 2);
    bars.push({ a: SPINE3(i), b: SPINE3(i + 2), stiffness: bendRoot + (bendTip - bendRoot) * t });
  }
  // 椎盘刚性化：导点 ↔ 本节脊柱 + 参考邻节 + 盘内弦；起始腱号逐节轮换（对消 GS 偏差）
  for (let i = 0; i < N_NODES; i++) {
    const ref = i < segments ? i + 1 : i - 1;
    for (let j = 0; j < N_TENDONS; j++) {
      const k = (i + j) % N_TENDONS;
      bars.push({ a: GUIDE3(k, i), b: SPINE3(i) });
      bars.push({ a: GUIDE3(k, i), b: SPINE3(ref) });
      bars.push({ a: GUIDE3(k, i), b: GUIDE3((k + 1) % N_TENDONS, i) });
    }
  }
  // fascia 抗扭斜杆（双手性交叉，每隙 6 根软杆）
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < N_TENDONS; j++) {
      const k = (i + j) % N_TENDONS;
      bars.push({ a: GUIDE3(k, i), b: GUIDE3((k + 1) % N_TENDONS, i + 1), stiffness: fasciaK });
      bars.push({ a: GUIDE3(k, i), b: GUIDE3((k + 2) % N_TENDONS, i + 1), stiffness: fasciaK });
    }
  }
  // 肌腱：相邻孔位间软杆链（真实原长入档，收缩驱动用），顺序逐段轮换
  const tendons: Tendon3Index[] = CHAINS.map(() => ({ bars: [], rests: [] }));
  for (let i = 0; i < segments; i++) {
    const k = Math.min(1, tendonK * tendonMult[i]);
    for (let j = 0; j < N_TENDONS; j++) {
      const t = (i + j) % N_TENDONS;
      tendons[t].bars.push(bars.length);
      tendons[t].rests.push(dist(CHAINS[t][i], CHAINS[t][i + 1]));
      bars.push({ a: GUIDE3(t, i), b: GUIDE3(t, i + 1), stiffness: k });
    }
  }
  return { def: { nodes, bars }, tendons };
}

/** 肌腱收缩（GH GhPython 公式）：rest = 真实原长 × (1 − 0.6c)，c∈[0,1]。 */
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
