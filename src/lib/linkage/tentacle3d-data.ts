import type { Dynamics3Config, Linkage3Def, Vec3 } from './solver3d';
import { LinkageSolver3D } from './solver3d';
import { BALLS, CHAINS, PLATES, STATIONS, TIES } from './tentacle3d-shape';

/**
 * 立体肌腱触手 v5——干净版真实结构（用户提供 11.3dm，2026-07-10）。
 * 几何提取自 tentacle3d-shape.ts：基座舵机总成 + 7 方盒椎节（节距 72→47、
 * 孔半径 10.3→4.9 收锥，三腱方位 30°/150°/270°）+ 节间盘轴联接 + 梢端盖。
 * 脊柱节点 = 真机站心，导点 = 真机孔位，全部杆长 = 真实初始距离（构造器缺省）。
 * 肌腱 v2（2026-07-10）：一根完整缆线 + 穿环滑索约束（只约束路径总长，
 * 张力自动分配、松弛零力单边），替代 GH 的逐段等比收缩妥协。
 * 肌腱 v3——真实走线（用户剖面图 2026-07-11）：v2 的「一站一孔直穿」也是
 * GH 妥协；真实设计是缆线**每节经两端板腱孔、节内下潜穿主体几何中心**
 * （中央导件），节间贴端板孔跨缝。滑动产生的推力：每个过孔处缆线折角的
 * 张力合力压在件上（|F| = 2λsin(折角/2)，指向内凹侧）；三接触点/节把缆
 * 按在结构上，深卷时不抄近道（弓弦效应），力臂不衰减——推力更有效率。
 */
export const TENTACLE3D = {
  /** 段数 = 站数 − 1 */
  segments: STATIONS.length - 1,
  /** 背骨弯曲刚度（per-sweep 乘子）：根 → 梢 */
  bendRoot: 0.03,
  bendTip: 0.003,
  /** 抽线行程上限 mm（c=1 时缆目标长 = 自然长 − pullMax）。诚实走线下缩短
   *  全部来自跨缝段：dL/dθ ≈ r̄ ≈ 7.5mm/rad·关节；~200° 总卷曲 ≈ 26mm，
   *  取 32 留少量饱和余量（c=1 顶到拮抗绷紧 = 物理卷曲上限）——待手感拍板 */
  pullMax: 32,
  /** 装配松弛 mm：静息时每腱留的余量（真机装配必有）。弯向某腱时拮抗腱
   *  路径变长 ≈ 0.5·r·θ——零松弛会把弯曲锁死在原地（v3 实测 err≈8 全是
   *  拮抗缆被硬拉长）；12mm ≈ 容许 ~150° 总卷曲后拮抗才开始绷紧（物理上限） */
  slack: 12,
  /** fascia 抗扭斜杆刚度（无它则扭转累积、单腱收缩卷成螺旋——用户实测）。
   *  v3 升到 1.0：诚实走线下深卷会滑进螺旋能量谷（实测梢端扭 50°、横漂
   *  −154），刚性斜杆 = 真机盘轴联接抗扭刚度的等效；实测不吃弯曲力
   *  （c=1 沿向 53→176）、横漂 −154→−43 */
  fasciaK: 1.0,
  /** 重力取消（用户拍板：被驱动机构非悬垂物）；动量+阻尼保留 */
  dynamics: { gravity: { x: 0, y: 0, z: 0 }, damping: 0.992 } satisfies Dynamics3Config,
  sweeps: 36,
} as const;

const N_NODES = STATIONS.length;
const N_TENDONS = CHAINS.length;
/** 节点索引：脊柱 0..6；导点 (k, i) = N_NODES·(k+1) + i；端板腱孔见 PLATE3 */
export const SPINE3 = (i: number): number => i;
export const GUIDE3 = (k: number, i: number): number => N_NODES * (k + 1) + i;
/** 端板腱孔 (k, i, end)：节 i 的近端（end=0）/远端（end=1）板上腱 k 的孔 */
export const PLATE3 = (k: number, i: number, end: 0 | 1): number =>
  N_NODES * (1 + N_TENDONS) + (k * N_NODES + i) * 2 + end;
/** 梢节绑线柱（腱 k 的缆线终点锚，用户圈定 2026-07-11——肌腱不穿梢节中间） */
export const TIE3 = (k: number): number => N_NODES * (1 + N_TENDONS) + N_TENDONS * N_NODES * 2 + k;
export const TIP3 = TENTACLE3D.segments;

/** 腱孔方位 = 导盘孔位方位 + 60°（用户纠偏 2026-07-11：肌腱穿的是端板上
 *  另一族孔 90°/210°/330°，不是导盘的 30°/150°/270°——后者留作结构导点）。 */
const ROT60 = (dx: number, dz: number): [number, number] => [
  dx * 0.5 - dz * Math.sin(Math.PI / 3),
  dx * Math.sin(Math.PI / 3) + dz * 0.5,
];

/** 三腱在基座盘面 (x,z) 的单位方向（测试与 UI 用）——腱孔真实方位 */
export const TENDON_DIRS: ReadonlyArray<readonly [number, number]> = CHAINS.map((c) => {
  const dx = c[0][0] - STATIONS[0][0];
  const dz = c[0][2] - STATIONS[0][2];
  const r = Math.hypot(dx, dz) || 1;
  const [rx, rz] = ROT60(dx / r, dz / r);
  return [rx, rz] as const;
});

export interface Tendon3Index {
  /** solver3d 缆线下标 */
  cable: number;
  /** 自然路径总长（抽线行程的基准） */
  rest0: number;
}

/** 肌腱的**视觉**路径（真实走线：近端板孔 → **绕过中央球体背面** → 远端板孔
 *  → 跨缝，用户剖面图修订 2026-07-11——不是到几何中心折返，是越过轴线贴球体
 *  远侧表面包绕）。绕点 = 站心沿本腱方位反向推 球半径+缆余隙，由活体节点
 *  实时计算（随节刚体运动）。约束路径仍只走端板孔（绕点刚挂本节 → 对刚体
 *  净扳矩为零，力学等价——见 makeTentacle3Model 注释）。 */
export function tendonVisual3(solver: LinkageSolver3D, k: number): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < N_NODES - 1; i++) {
    const s = solver.nodes[SPINE3(i)];
    const p1 = solver.nodes[PLATE3(k, i, 0)];
    const p2 = solver.nodes[PLATE3(k, i, 1)];
    // 本腱孔径向方向 ≈ 两板孔中点 − 站心（轴向分量近抵消）；绕点在其反向
    const dx = (p1.x + p2.x) / 2 - s.x;
    const dy = (p1.y + p2.y) / 2 - s.y;
    const dz = (p1.z + p2.z) / 2 - s.z;
    const L = Math.hypot(dx, dy, dz) || 1;
    const r = BALLS[i] + 1; // 球面 + 缆余隙
    pts.push(p1);
    pts.push({ x: s.x - (dx / L) * r, y: s.y - (dy / L) * r, z: s.z - (dz / L) * r });
    pts.push(p2);
  }
  // 梢节：进近端板孔 → 绑线柱终点（不穿中间、无绕行）
  pts.push(solver.nodes[PLATE3(k, N_NODES - 1, 0)]);
  pts.push(solver.nodes[TIE3(k)]);
  return pts;
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
  // 端板腱孔（肌腱 v3）：导盘孔半径 + 方位再转 60°（腱孔族），平移到两端板
  // 沿臂位置；基座节整体锚定
  for (let k = 0; k < N_TENDONS; k++) {
    for (let i = 0; i < N_NODES; i++) {
      const [sx, sy, sz] = STATIONS[i];
      const [hx, , hz] = CHAINS[k][i];
      const [rx, rz] = ROT60(hx - sx, hz - sz);
      for (const end of [0, 1] as const) {
        nodes.push({ x: sx + rx, y: sy + PLATES[i][end], z: sz + rz, fixed: i === 0 });
      }
    }
  }
  // 梢节绑线柱（真机实测质心）：腱 k 的缆线终点
  for (let k = 0; k < N_TENDONS; k++) {
    const [x, y, z] = TIES[k];
    nodes.push({ x, y, z });
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
  // 端板腱孔刚性挂装：本节脊柱 + **前后双邻站**（对称——单侧拴结的前倾偏置
  // 在深弯下耦合出系统性螺旋，同 v5 对称锥教训）+ 三导点（腱孔转 60° 后
  // guide(k)/guide(k+1) 恰在其两侧 ±60° 对称夹持，guide(k+2) 在 180° 对面）
  for (let k = 0; k < N_TENDONS; k++) {
    for (let i = 0; i < N_NODES; i++) {
      for (const end of [0, 1] as const) {
        const p = PLATE3(k, i, end);
        bars.push({ a: p, b: SPINE3(i) });
        if (i < N_NODES - 1) bars.push({ a: p, b: SPINE3(i + 1) });
        if (i > 0) bars.push({ a: p, b: SPINE3(i - 1) });
        bars.push({ a: p, b: GUIDE3(k, i) });
        bars.push({ a: p, b: GUIDE3((k + 1) % N_TENDONS, i) });
        bars.push({ a: p, b: GUIDE3((k + 2) % N_TENDONS, i) });
      }
    }
  }
  // 绑线柱刚性挂装（同端板模式：双邻站对称 + 三导点定方位）
  for (let k = 0; k < N_TENDONS; k++) {
    const t = TIE3(k);
    bars.push({ a: t, b: SPINE3(segments) });
    bars.push({ a: t, b: SPINE3(segments - 1) });
    for (let j = 0; j < N_TENDONS; j++) bars.push({ a: t, b: GUIDE3(j, segments) });
  }
  // 肌腱 = 穿环滑缆（v3 真实走线）：锚在梢节远端板孔、节间贴端板孔跨缝。
  // **约束路径只走端板孔**：节内穿心 V 腿两端同挂一节（长度恒定），对刚体节
  // 的净扳矩为零（内部走线不改变外部合力）——力学上与真实 V 走线严格等价；
  // 若把 V 腿放进约束路径，其大折角节点会吃掉 PBD 梯度预算、肌力耗散在
  // 「挤压刚性模态→被杆弹回」上（v3 首版实测卷曲锁死 45°）。穿心 V 形由
  // 渲染层按 TENDON_VISUAL3 原样画出。静息 rest = 自然长 + slack（装配余量）。
  const cables: Linkage3Def['cables'] = [];
  const tendons: Tendon3Index[] = [];
  for (let k = 0; k < N_TENDONS; k++) {
    const path: number[] = [];
    // 节 0..5 穿两端板孔；梢节只进近端板孔、终点绑在自己的柱上（不穿中间）
    for (let i = 0; i < N_NODES - 1; i++) {
      path.push(PLATE3(k, i, 0), PLATE3(k, i, 1));
    }
    path.push(PLATE3(k, N_NODES - 1, 0), TIE3(k));
    let rest0 = 0;
    for (let s = 0; s + 1 < path.length; s++) {
      const a = nodes[path[s]];
      const b = nodes[path[s + 1]];
      rest0 += dist([a.x, a.y, a.z], [b.x, b.y, b.z]);
    }
    tendons.push({ cable: k, rest0 });
    // maxStep 6mm ≈ 舵机力矩上限：深抽饱和（目标超出几何可达）时张力有界
    cables.push({ nodes: path, rest: rest0 + TENTACLE3D.slack, maxStep: 6 });
  }
  return { def: { nodes, bars, cables }, tendons };
}

/** 抽线（真机制）：c∈[0,1] → 缆线目标总长从「自然长 + slack」（静息余量）
 *  线性抽到「自然长 − pullMax」（满行程）。c 小段先吃掉自己的余量（真机的
 *  空行程），随后开始施力。 */
export function applyContraction3(solver: LinkageSolver3D, tendon: Tendon3Index, c: number): void {
  const { pullMax, slack } = TENTACLE3D;
  const cc = Math.min(1, Math.max(0, c));
  solver.setCableRest(tendon.cable, tendon.rest0 + slack - cc * (pullMax + slack));
}

export function createTentacle3(): { solver: LinkageSolver3D; tendons: Tendon3Index[] } {
  const { def, tendons } = makeTentacle3Model();
  return { solver: new LinkageSolver3D(def, { dynamics: TENTACLE3D.dynamics }), tendons };
}
