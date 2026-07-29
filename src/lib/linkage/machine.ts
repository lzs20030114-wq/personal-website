import type { CellFrame } from './gl3d';
import { MACHINE_DRIVE, MACHINE_GROUPS, type MachineGroup } from './machine-shape';
import { SHELL_THETA0, createShell, stepRing, type ShellRing } from './shell3d';

export { MACHINE_GROUPS, MACHINE_MESH_URL, MACHINE_TRIS, MACHINE_DRIVE } from './machine-shape';

/**
 * 轮回机器整机（Lab.05）——真机装配的求解器实例。spec = 轮回机器_整机spec.md。
 *
 * 架构：**不新建运动学**。五环的销坐标与 shell3d-data 逐位相同（新旧图纸比对
 * 全部差值 ≤0.001mm，是生成时的四舍五入位数差），故环的解算、脚槽止程标定、
 * 定步积分一律复用 shell3d，本模块只做两件事：
 *   ① 把「一台电机 → 中间轴 → 五曲柄（同相、半径各异）」表达成五环同 dθ 推进；
 *   ② 给每组实体网格算出当前刚性位姿（CellFrame），供 gl3d 直接绘制。
 *
 * 传动链不进求解器（spec §3.2）：曲柄销与拱顶都已由环的解算定死，连杆只是
 * 把这两点连起来的可见形体，再拿它当约束是重复建模。杆长只作校验读数。
 *
 * 世界系同 shell3d：x = 体轴（站位），y = 环局部 u，z = 环局部 v（向上）。
 * 零件的出平面位置 w 加在 x 上——真机的板有厚度、分两层错开，这个偏移必须留着，
 * 否则同环的两层板会重叠打架。
 */

/** 图纸姿态曲柄角（上死点 = 全开），与 shell3d 同。 */
export const MACHINE_THETA0 = SHELL_THETA0;

/**
 * **中间轴不整周转，只在 180° 内往复**（用户 2026-07-29 指出：真机驱动如此）。
 * 于是机器做的是张合，不是循环转动——θ 在 [θ₀, θ₀+π] 之间来回扫。
 *
 * 两端恰好是曲柄滑块的两个死点：θ₀ = 上死点 = 全开（图纸姿态），
 * θ₀+π = 下死点 = 全折叠。所以 180° 正好走完整个行程 2R，一步不多一步不少。
 *
 * 这也解释了为什么端点换向不会看着一顿：死点处 d(拱顶)/dθ = 0，
 * 曲柄匀速反转时输出速度本来就是从 0 平滑折回的，**不需要额外缓动**。
 */
export const MACHINE_SWEEP = Math.PI;

/**
 * 摆向：从伸展位（θ₀，曲柄销正上方）起，销朝**哪一侧**扫过这 180°。
 * −1 = 经 +u 一侧（用户 2026-07-29「转反了，应该是另一侧」；首版取 +1，摆错了边）。
 *
 * 两个摆向的拱顶轨迹**完全相同**（关于死点对称），差别只在曲柄与连杆从哪边走。
 * 所以这是纯外观量——改它不动运动学，也不影响任何行程结论。
 */
export const MACHINE_DIR: 1 | -1 = -1;

export const MACHINE_THETA_MIN = Math.min(MACHINE_THETA0, MACHINE_THETA0 + MACHINE_DIR * MACHINE_SWEEP);
export const MACHINE_THETA_MAX = Math.max(MACHINE_THETA0, MACHINE_THETA0 + MACHINE_DIR * MACHINE_SWEEP);

/**
 * 默认角速度 rad/s。半程 π 用时 = π/ω ≈ 3.9s，一次完整张合（开→合→开）≈ 7.9s，
 * 与人的呼吸节律同量级——THESIS_NOTES 的「生命感」要的就是这个，不是机械循环感。
 * 与 shell3d 的 SHELL_OMEGA 取同值，两台并读时节奏一致。
 * **非真机节律**：减速比图上未标，这是展示取值（spec §7 第一条局限）。
 */
export const MACHINE_OMEGA = 0.8;

/** θ 钳进往复区间。 */
export function clampTheta(theta: number): number {
  return Math.min(MACHINE_THETA_MAX, Math.max(MACHINE_THETA_MIN, theta));
}

/**
 * 往复推进一步：走到端点就折返。纯函数、可单测。
 * 反射而非钳制——钳制会让机器停在端点直到方向被人改，反射才是「来回转」。
 */
export function reciprocate(
  theta: number,
  dir: 1 | -1,
  step: number,
): { theta: number; dir: 1 | -1 } {
  let t = theta + dir * step;
  let d = dir;
  // 步长大于半程时要连续反射几次才落回区间（定步下不会发生，留作护栏）
  for (let guard = 0; guard < 8; guard++) {
    if (t > MACHINE_THETA_MAX) {
      t = 2 * MACHINE_THETA_MAX - t;
      d = -1;
    } else if (t < MACHINE_THETA_MIN) {
      t = 2 * MACHINE_THETA_MIN - t;
      d = 1;
    } else break;
  }
  return { theta: clampTheta(t), dir: d };
}

/**
 * 行程参数 u ∈ [0,1]：**0 = 伸展（全开，图纸姿态）、1 = 折叠**。
 * 与盘点 §6「φ=0°/180° 为伸展 / 折叠死点」同口径——φ = u × 180°。
 */
export function strokeOf(theta: number): number {
  return Math.abs(clampTheta(theta) - MACHINE_THETA0) / MACHINE_SWEEP;
}
export function thetaAtStroke(u: number): number {
  return MACHINE_THETA0 + MACHINE_DIR * Math.min(1, Math.max(0, u)) * MACHINE_SWEEP;
}
/** φ 读数（度，0–180）：伸展位为 0。 */
export function phaseDeg(theta: number): number {
  return strokeOf(theta) * 180;
}
/** 正在往哪儿去：true = 正在折叠（u 增大），false = 正在伸展。 */
export function isFolding(dir: 1 | -1): boolean {
  return dir === MACHINE_DIR;
}

export interface Machine {
  rings: ShellRing[];
  /** 中间轴转角（五环同相，故整机只有这一个自由度）。 */
  theta: number;
}

export function createMachine(): Machine {
  const rings = createShell();
  for (const r of rings) {
    // 本模块的位姿计算假定环面竖直、无 roll（CLAUDE.md v0.2 定案）。
    // 若哪天 roll 复活，frame 的列向量要一起改——这里先炸掉而不是画歪。
    if (r.data.rollDeg !== 0) {
      throw new Error(`${r.data.name} rollDeg=${r.data.rollDeg}——整机位姿未支持 roll`);
    }
  }
  if (rings.length !== MACHINE_DRIVE.length) {
    throw new Error(`环数 ${rings.length} 与形体表 ${MACHINE_DRIVE.length} 不符`);
  }
  return { rings, theta: MACHINE_THETA0 };
}

/** 推进一个定步：一根轴带动五个曲柄 ⇒ 五环同 dθ。 */
export function stepMachine(m: Machine, dTheta: number): void {
  m.theta += dTheta;
  for (const r of m.rings) stepRing(r, dTheta);
}

/** 往复驱动一步：按当前方向走，撞到 180° 的任一端就折返。 */
export function runMachine(m: Machine, dir: 1 | -1, step: number): 1 | -1 {
  const next = reciprocate(m.theta, dir, step);
  stepMachine(m, next.theta - m.theta);
  return next.dir;
}

/** 全机最大约束残差（HUD 读数）。 */
export function machineMaxError(m: Machine): number {
  return Math.max(...m.rings.map((r) => r.solver.maxError()));
}

/**
 * 连杆长度校验：曲柄销 ↔ 拱顶的实时距离应恒等于图纸姿态的静息长。
 * 环是刚性链，这个值理应不动；它一旦漂，说明解算跑偏了——比看残差更直观。
 */
export function rodLengthDrift(m: Machine): number {
  let worst = 0;
  for (const r of m.rings) {
    const d = r.data;
    const p = r.solver.nodes[d.pin];
    const a = r.solver.nodes[d.apex];
    const rest = d.def.nodes[d.apex].y - d.def.nodes[d.pin].y;
    worst = Math.max(worst, Math.abs(Math.hypot(a.x - p.x, a.y - p.y) - rest));
  }
  return worst;
}

// ------------------------------------------------------------------ 位姿

/**
 * 组名 → 当前刚性位姿。命名规则见 machine-shape.ts 头注：
 *   p{ri}_{tri}  板：由该板三销中的前两枚定标架
 *   x{ri}_{node} 配件：跟销平移，不转
 *   w{ri}        单杆轮：绕轮心转 θ−θ₀
 *   r{ri}        驱动杆：曲柄销 → 拱顶 定标架
 *   其他          静件：已烘到世界系，恒等
 *
 * CellFrame 的三列 = 局部基向量的像（gl3d 按列主序上传）：
 * world = [û ê f̂]·local + o。
 */
export function machineFrame(g: MachineGroup, m: Machine): CellFrame {
  const kind = g.name[0];
  if (kind !== 'p' && kind !== 'x' && kind !== 'w' && kind !== 'r') return IDENTITY;

  const ri = Number(g.name[1]);
  const ring = m.rings[ri];
  if (!ring) return IDENTITY;
  const st = ring.data.station;
  const s = ring.solver;

  if (kind === 'w') {
    // 单杆轮：绕轮心（环局部原点）转 θ−θ₀
    const dth = m.theta - MACHINE_THETA0;
    const c = Math.cos(dth);
    const sn = Math.sin(dth);
    // 局部 (u, v, w) → 世界 (st + w, u·c − v·s, u·s + v·c)
    return {
      o: { x: st, y: 0, z: 0 },
      ux: 0, uy: c, uz: sn,
      ex: 0, ey: -sn, ez: c,
      fx: 1, fy: 0, fz: 0,
    };
  }

  if (kind === 'x') {
    const j = Number(g.name.split('_')[1]);
    const n = s.nodes[j];
    // 局部 (du, dv, w) → 世界 (st + w, n.x + du, n.y + dv)
    return {
      o: { x: st, y: n.x, z: n.y },
      ux: 0, uy: 1, uz: 0,
      ex: 0, ey: 0, ez: 1,
      fx: 1, fy: 0, fz: 0,
    };
  }

  // p / r：两点定平面标架（与 gen_machine.py 的 frame_local 逆运算一致）
  let ia: number;
  let ib: number;
  if (kind === 'p') {
    const k = Number(g.name.split('_')[1]);
    const tri = ring.data.tris[k];
    ia = tri[0];
    ib = tri[1];
  } else {
    ia = ring.data.pin;
    ib = ring.data.apex;
  }
  const A = s.nodes[ia];
  const B = s.nodes[ib];
  let dx = B.x - A.x;
  let dy = B.y - A.y;
  const L = Math.hypot(dx, dy) || 1;
  dx /= L;
  dy /= L;
  // ex = 单位(B−A)，ey = ex 逆时针 90°
  // 局部 (a, b, w) → 世界 (st + w, A.x + a·ex.u + b·ey.u, A.y + a·ex.v + b·ey.v)
  return {
    o: { x: st, y: A.x, z: A.y },
    ux: 0, uy: dx, uz: dy,
    ex: 0, ey: -dy, ez: dx,
    fx: 1, fy: 0, fz: 0,
  };
}

const IDENTITY: CellFrame = {
  o: { x: 0, y: 0, z: 0 },
  ux: 1, uy: 0, uz: 0,
  ex: 0, ey: 1, ez: 0,
  fx: 0, fy: 0, fz: 1,
};

/** 全部组的当前位姿（渲染层逐组 drawMesh 用）。 */
export function machineFrames(m: Machine): Array<{ name: string; frame: CellFrame }> {
  return MACHINE_GROUPS.map((g) => ({ name: g.name, frame: machineFrame(g, m) }));
}

/** 某环拱顶的当前高度（环局部 v）——行程断言与 HUD 用。 */
export function apexHeight(m: Machine, ri: number): number {
  const r = m.rings[ri];
  return r.solver.nodes[r.data.apex].y;
}

// -------------------------------------------------------------- 部件分类

/**
 * 台架控制面板的部件分档。整机是一堆零件的装配，「看哪些」本身就是一种操作——
 * 这是 Lab.05 独有的需求（单机构台架没有这个问题），故分类逻辑落在这里、可单测，
 * 组件只管接线。
 *
 * - rings    环身：角化板 + 脚/拱顶配件
 * - drive    传动：中间轴与电机 + 五个单杆轮 + 五根驱动杆
 * - frame    机架：滑轨架 + 底盘
 * - tentacle 触手：三条（静态形体，不参与运动）
 */
export type MachinePartKind = 'rings' | 'drive' | 'frame' | 'tentacle';

export function partKind(name: string): MachinePartKind {
  const k = name[0];
  if (k === 'p' || k === 'x') return 'rings';
  if (k === 'w' || k === 'r') return 'drive';
  if (name === 'shaft') return 'drive';
  // armsmall = 两条小触手（静态摆件）。大触手不在这张表里——它是 Lab.03 那条
  // 三肌腱触手，由 tentacle3d 实时驱动、单独绘制，同样受「触手」开关管。
  if (name === 'armsmall') return 'tentacle';
  return 'frame';
}

/** 组属于哪个环（0..4）；静件返回 null。 */
export function groupRing(name: string): number | null {
  if (!'pxwr'.includes(name[0])) return null;
  const ri = Number(name[1]);
  return Number.isInteger(ri) && ri >= 0 && ri < 5 ? ri : null;
}

/**
 * 当前该画哪些组：部件开关 + 单环隔离的交集。
 * 隔离只作用于带环归属的组——机架/轴/触手是否可见由各自开关决定，
 * 不跟着某个环一起消失（否则「只看 S3」会连轴一起切掉，读不出它被谁驱动）。
 */
export function visibleGroups(
  show: Readonly<Record<MachinePartKind, boolean>>,
  isolate: number | null,
): typeof MACHINE_GROUPS {
  return MACHINE_GROUPS.filter((g) => {
    if (!show[partKind(g.name)]) return false;
    const ri = groupRing(g.name);
    if (isolate === null || ri === null) return true;
    return ri === isolate;
  });
}
