import type { Dynamics3Config, Linkage3Def } from './solver3d';
import { LinkageSolver3D } from './solver3d';
import { CHAINS, STATIONS } from './tentacle3d-shape';

/**
 * 立体肌腱触手 v5——干净版真实结构（用户提供 11.3dm，2026-07-10）。
 * 几何提取自 tentacle3d-shape.ts：基座舵机总成 + 7 方盒椎节（节距 72→47、
 * 孔半径 10.3→4.9 收锥，三腱方位 30°/150°/270°）+ 节间盘轴联接 + 梢端盖。
 * 脊柱节点 = 真机站心，导点 = 真机孔位，全部杆长 = 真实初始距离（构造器缺省）。
 * 肌腱 v2——真机制复活（用户还原设计意图 2026-07-10）：GH 的逐段等比收缩
 * 是 Kangaroo 无滑索约束时的妥协；实物是**一根完整缆线**锚在梢节、穿过沿途
 * 导孔、从根部抽线。本版用穿环滑索约束（solver3d cables）：只约束路径总长，
 * 张力自动分配、弯曲发生在阻力最小处、松弛时零作用力（单边）。
 */
export const TENTACLE3D = {
  /** 段数 = 站数 − 1 */
  segments: STATIONS.length - 1,
  /** 背骨弯曲刚度（per-sweep 乘子）：根 → 梢 */
  bendRoot: 0.03,
  bendTip: 0.003,
  /** 抽线行程上限 mm（c=1 时从根部抽入的缆长）。全周卷曲所需 ≈ 2π·r̄ ≈ 47，
   *  取 55 留出深卷余量——待用户手感拍板 */
  pullMax: 55,
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
  /** solver3d 缆线下标 */
  cable: number;
  /** 自然路径总长（抽线行程的基准） */
  rest0: number;
}

export interface Tentacle3Model {
  def: Linkage3Def;
  tendons: Tendon3Index[];
}

const dist = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

/** 初始构型 = 真机静息几何（全部约束天然满足）。 */
export function makeTentacle3Model(): Tentacle3Model {
  const { segments, bendRoot, bendTip, fasciaK } = TENTACLE3D;
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
  // 肌腱 = 穿环滑缆（真机制）：锚在梢节导孔（末节点）、穿沿途导孔、根部导孔
  // 已随基座锚定——抽线 = setCableRest(rest0 − 行程)
  const cables: Linkage3Def['cables'] = [];
  const tendons: Tendon3Index[] = [];
  for (let k = 0; k < N_TENDONS; k++) {
    let rest0 = 0;
    for (let i = 0; i < segments; i++) rest0 += dist(CHAINS[k][i], CHAINS[k][i + 1]);
    tendons.push({ cable: k, rest0 });
    cables.push({ nodes: Array.from({ length: N_NODES }, (_, i) => GUIDE3(k, i)) });
  }
  return { def: { nodes, bars, cables }, tendons };
}

/** 抽线（真机制）：c∈[0,1] → 缆线目标总长 = 自然长 − c·pullMax。 */
export function applyContraction3(solver: LinkageSolver3D, tendon: Tendon3Index, c: number): void {
  const pull = TENTACLE3D.pullMax * Math.min(1, Math.max(0, c));
  solver.setCableRest(tendon.cable, tendon.rest0 - pull);
}

export function createTentacle3(): { solver: LinkageSolver3D; tendons: Tendon3Index[] } {
  const { def, tendons } = makeTentacle3Model();
  return { solver: new LinkageSolver3D(def, { dynamics: TENTACLE3D.dynamics }), tendons };
}
