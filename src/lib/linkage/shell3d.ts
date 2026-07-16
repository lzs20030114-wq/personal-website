import { LinkageSolver } from './solver';
import type { Vec3 } from './solver3d';
import { SHELL_RINGS, type ShellRingData } from './shell3d-data';

export { SHELL_RINGS, type ShellRingData } from './shell3d-data';

/**
 * 伏丘壳体五环立体编排（2026-07-17 用户立项拍板：85mm 等距站位 / 同相呼吸 /
 * roll 按盘点 §7）。架构 = 五个 2D 环实例（内核零修改，S4 拱环同款）+ 每环一个
 * 刚体位姿把环平面嵌进 3D + 复用 camera3d/gl3d 装备渲染。
 *
 * 世界系：X = 体轴（站位方向），Z = 上，Y = 横向。环平面 = 横截面（x = station），
 * roll = 环面内旋转（绕体轴——环平面不变、环在自己平面里侧倾，脊线横向斜漂）。
 *
 * 脚槽止程与定步积分照搬 S4 拱环 2026-07-17 定案（轮回机器_拱环求解器.md）：
 * 四脚零刚度滑移模态必须用槽端钳制锁死，否则形态随设备帧历史分岔；
 * 槽外端 = 全开位（图纸装配位），内端 = 各环模型自身运动学行程（初始化时
 * 确定性实测一次——240 步 × 48 遍交错钳制，任何设备结果一致）。
 */

/** 固定仿真步长（秒）：渲染帧率只影响采样，任何设备走同一条轨迹。
 * 取 1/120（Δθ = 0.38°/步）：S1 实测在 ≤0.5°/步收拢正常、1.5°/步会在全开
 * 死点出口被踢进压平分支——步距是分支选择的敏感参数，必须留裕量。 */
export const SHELL_STEP_DT = 1 / 120;
/** 同相呼吸角速度 rad/s（手感参数，待用户调） */
export const SHELL_OMEGA = 0.8;
/** 图纸姿态曲柄角：销在轮顶 (0, R)，y 向上 → +π/2 = 全开。 */
export const SHELL_THETA0 = Math.PI / 2;

const SPIN_SWEEPS = 48;

export interface FootSlot {
  node: number;
  lo: number;
  hi: number;
}

export interface ShellRing {
  data: ShellRingData;
  solver: LinkageSolver;
  slots: ReadonlyArray<FootSlot>;
  theta: number;
}

function ringTriSigns(s: LinkageSolver, d: ShellRingData): number[] {
  return d.tris.map(([i, j, k]) => {
    const a = s.nodes[i];
    const b = s.nodes[j];
    const c = s.nodes[k];
    return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  });
}

function makeSolver(d: ShellRingData): LinkageSolver {
  const s = new LinkageSolver({
    nodes: d.def.nodes.map((n) => ({ ...n })),
    bars: d.def.bars.map((b) => ({ ...b })),
  });
  s.setFixed(d.pin, true);
  s.iterate(240);
  s.setFixed(d.pin, false);
  const signs = ringTriSigns(s, d);
  for (let t = 0; t < signs.length; t++) {
    if (signs[t] !== d.signs[t]) {
      throw new Error(`${d.name} 初始化落入错误解支：板 ${t} 翻面——检查 shell3d-data 提取`);
    }
  }
  return s;
}

/** 越出槽端的脚钳回端点（两端均止；与投影交错调用）。 */
export function clampRingFeet(s: LinkageSolver, slots: ReadonlyArray<FootSlot>): void {
  for (const { node, lo, hi } of slots) {
    const n = s.nodes[node];
    if (n.x < lo) s.setNode(node, lo, n.y);
    else if (n.x > hi) s.setNode(node, hi, n.y);
  }
}

/** 每个仿真子步后的止程松弛（S4 定案同参：8×6 遍钳制-投影交错 + 收口钳）。 */
export function ringStopPass(s: LinkageSolver, slots: ReadonlyArray<FootSlot>): void {
  for (let k = 0; k < 8; k++) {
    clampRingFeet(s, slots);
    s.iterate(6);
  }
  clampRingFeet(s, slots);
}

/**
 * 实测该环的槽端（确定性程序，任何设备同结果）。外端 = 全开位（图纸装配位，
 * 左脚 lo / 右脚 hi）。内端 = 曲柄**细步半圈**（全开 → 折叠死点，0.5°/步，
 * 外止程逐遍交错）扫掠的四脚最内到达位。步距是关键：S1 实测 0.5°/步全程
 * 健康收拢（残差 ≤0.5mm、双向一致），1.5°/步会在全开死点出口被踢进压平
 * 分支（apex 降、脚外挤），量出零长槽、运行时硬顶 6.7mm。
 * 校验：扫到折叠端 apex 必须到达 apex₀ − 2R*，否则抛错拒绝上台。
 */
function measureSlots(d: ShellRingData): FootSlot[] {
  const s = makeSolver(d);
  const c = s.nodes[d.center];
  const clampOuter = () => {
    for (const f of d.feet) {
      const x0 = d.def.nodes[f].x;
      const n = s.nodes[f];
      if (x0 < 0 ? n.x < x0 : n.x > x0) s.setNode(f, x0, n.y);
    }
  };
  const innerReach = new Map<number, number>(d.feet.map((f) => [f, d.def.nodes[f].x]));
  for (let k = 1; k <= 360; k++) {
    const th = SHELL_THETA0 + (k * Math.PI) / 360;
    s.setFixed(d.pin, true);
    s.setNode(d.pin, c.x + d.crankR * Math.cos(th), c.y + d.crankR * Math.sin(th));
    for (let m = 0; m < SPIN_SWEEPS; m++) {
      s.iterate(1);
      clampOuter();
    }
    s.setFixed(d.pin, false);
    for (const f of d.feet) {
      const x = s.nodes[f].x;
      const cur = innerReach.get(f) as number;
      // 最内到达位：左脚取最大 x，右脚取最小 x
      if (d.def.nodes[f].x < 0 ? x > cur : x < cur) innerReach.set(f, x);
    }
  }
  const apexTarget = d.def.nodes[d.apex].y - 2 * d.crankR + 1;
  if (s.nodes[d.apex].y > apexTarget) {
    throw new Error(`${d.name} 槽端实测未到折叠端（apex 未达 apex₀−2R*）——检查提取数据`);
  }
  return d.feet.map((f) => {
    const x0 = d.def.nodes[f].x;
    const xin = innerReach.get(f) as number;
    return x0 < 0 ? { node: f, lo: x0, hi: xin } : { node: f, lo: xin, hi: x0 };
  });
}

const slotCache = new Map<string, FootSlot[]>();

/** 五环装配（槽端实测结果按环名缓存——每进程一次）。 */
export function createShell(): ShellRing[] {
  return SHELL_RINGS.map((d) => {
    let slots = slotCache.get(d.name);
    if (!slots) {
      slots = measureSlots(d);
      slotCache.set(d.name, slots);
    }
    return { data: d, solver: makeSolver(d), slots, theta: SHELL_THETA0 };
  });
}

/** 单环推进一个子步：曲柄位置驱动 + 投影 + 止程松弛（同相呼吸时五环同 dθ）。 */
export function stepRing(r: ShellRing, dTheta: number): void {
  r.theta += dTheta;
  const s = r.solver;
  const d = r.data;
  const c = s.nodes[d.center];
  s.setFixed(d.pin, true);
  s.setNode(d.pin, c.x + d.crankR * Math.cos(r.theta), c.y + d.crankR * Math.sin(r.theta));
  s.iterate(SPIN_SWEEPS);
  s.setFixed(d.pin, false);
  ringStopPass(s, r.slots);
}

/** 环局部 (x, y) → 世界（站位平移 + 环面内 roll）。 */
export function ringPoint(d: ShellRingData, x: number, y: number): Vec3 {
  const rho = (d.rollDeg * Math.PI) / 180;
  const c = Math.cos(rho);
  const s = Math.sin(rho);
  return { x: d.station, y: x * c - y * s, z: x * s + y * c };
}

/** 全环最大残差（HUD 读数）。 */
export function shellMaxError(rings: ReadonlyArray<ShellRing>): number {
  return Math.max(...rings.map((r) => r.solver.maxError()));
}
