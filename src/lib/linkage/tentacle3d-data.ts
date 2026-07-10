import type { Dynamics3Config, Linkage3Def } from './solver3d';
import { LinkageSolver3D } from './solver3d';
import { CHAINS, STATIONS } from './tentacle3d-shape';

/**
 * 立体肌腱触手 v5——干净版真实结构（用户提供 11.3dm，2026-07-10）。
 * 几何提取自 tentacle3d-shape.ts：基座舵机总成 + 7 方盒椎节（节距 72→47、
 * 孔半径 10.3→4.9 收锥，三腱方位 30°/150°/270°）+ 节间盘轴联接 + 梢端盖。
 * 脊柱节点 = 真机站心，导点 = 真机孔位，全部杆长 = 真实初始距离（构造器缺省）。
 * 驱动机制不变（= GH GhPython 原文）：收缩按比例缩放肌腱段 rest。
 */
export const TENTACLE3D = {
  /** 段数 = 站数 − 1 */
  segments: STATIONS.length - 1,
  /** 背骨弯曲刚度（per-sweep 乘子）：根 → 梢 */
  bendRoot: 0.03,
  bendTip: 0.003,
  tendonK: 0.12,
  /** 逐段强度倍率（7 站 6 段，无 GH 参考侧写，取均匀） */
  tendonMult: [1, 1, 1, 1, 1, 1],
  contractionFloor: 0.4,
  /** fascia 抗扭斜杆刚度（无它则扭转累积、单腱收缩卷成螺旋——用户实测） */
  fasciaK: 0.2,
  /** 重力取消（用户拍板：被驱动机构非悬垂物）；动量+阻尼保留 */
  dynamics: { gravity: { x: 0, y: 0, z: 0 }, damping: 0.992 } satisfies Dynamics3Config,
  sweeps: 36,
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
  // 椎盘刚性化：导点 ↔ 本节脊柱 + **前后双邻站**（对称锥——单侧拴结的锥面前倾
  // 会在深弯曲下耦合出系统性扭矩，v5 实测修正）+ 盘内弦；起始腱号逐节轮换
  for (let i = 0; i < N_NODES; i++) {
    for (let j = 0; j < N_TENDONS; j++) {
      const k = (i + j) % N_TENDONS;
      bars.push({ a: GUIDE3(k, i), b: SPINE3(i) });
      if (i < segments) bars.push({ a: GUIDE3(k, i), b: SPINE3(i + 1) });
      if (i > 0) bars.push({ a: GUIDE3(k, i), b: SPINE3(i - 1) });
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
