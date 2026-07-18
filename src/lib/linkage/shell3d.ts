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
 * 实测该环的槽端（确定性程序，任何设备同结果）：曲柄**细步半圈**（全开 →
 * 折叠死点，0.5°/步）扫掠 + 外止程逐遍交错，槽端 = 每脚实际往返包络
 * （外端 = 最外到达位，内端 = 最内到达位）。外止程余量**逐环自动标定**：
 * 从 0 起阶梯试 [0,2,4,8]mm，第一个扫掠健康（峰值残差 < 1.2mm 且 apex 到达
 * 折叠端 apex₀ − 2R*）的余量胜出；全阶梯不健康则抛错拒绝上台。
 *
 * 三个来之不易的教训（都以「一动就塌」现形，2026-07-17）：
 * ① 步距决定分支——S1 在 1.5°/步会于全开死点出口被踢进压平分支，
 *   0.5°/步全程健康（残差 ≤0.5mm、双向一致）。
 * ② 外止程钉死图纸位会堵死 S3——其折叠路径在全开附近需先向外冒 ~2mm
 *   再收拢（用户观察「开局对、随即坍缩」破的案；内向行程 15.6→34.3mm、
 *   残差 1.58→0.77 对比）。
 * ③ 外止程一律放宽又会放跑 S5——宽松 8mm 让它漂进压平分支（运行时 3.7mm）。
 *   松紧是环的个性，只能按健康度逐环标定。
 */
const MARGIN_LADDER = [0, 2, 4, 8];
const SWEEP_ERR_LIMIT = 1.2;

function sweepEnvelope(
  d: ShellRingData,
  margin: number,
): { slots: FootSlot[]; peakErr: number; folded: boolean } {
  const s = makeSolver(d);
  const c = s.nodes[d.center];
  const clampOuter = () => {
    for (const f of d.feet) {
      const x0 = d.def.nodes[f].x;
      const lim = x0 < 0 ? x0 - margin : x0 + margin;
      const n = s.nodes[f];
      if (x0 < 0 ? n.x < lim : n.x > lim) s.setNode(f, lim, n.y);
    }
  };
  const lo = new Map<number, number>(d.feet.map((f) => [f, d.def.nodes[f].x]));
  const hi = new Map<number, number>(d.feet.map((f) => [f, d.def.nodes[f].x]));
  let peakErr = 0;
  for (let k = 1; k <= 360; k++) {
    const th = SHELL_THETA0 + (k * Math.PI) / 360;
    s.setFixed(d.pin, true);
    s.setNode(d.pin, c.x + d.crankR * Math.cos(th), c.y + d.crankR * Math.sin(th));
    for (let m = 0; m < SPIN_SWEEPS; m++) {
      s.iterate(1);
      clampOuter();
    }
    s.setFixed(d.pin, false);
    peakErr = Math.max(peakErr, s.maxError());
    for (const f of d.feet) {
      const x = s.nodes[f].x;
      if (x < (lo.get(f) as number)) lo.set(f, x);
      if (x > (hi.get(f) as number)) hi.set(f, x);
    }
  }
  const apexTarget = d.def.nodes[d.apex].y - 2 * d.crankR + 1;
  return {
    slots: d.feet.map((f) => ({ node: f, lo: lo.get(f) as number, hi: hi.get(f) as number })),
    peakErr,
    folded: s.nodes[d.apex].y <= apexTarget,
  };
}

function measureSlots(d: ShellRingData): FootSlot[] {
  for (const margin of MARGIN_LADDER) {
    const r = sweepEnvelope(d, margin);
    if (r.folded && r.peakErr < SWEEP_ERR_LIMIT) return r.slots;
  }
  throw new Error(`${d.name} 槽端标定失败：余量阶梯 ${MARGIN_LADDER} 内无健康折叠——检查提取数据`);
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

/**
 * 环的外侧支点序列（蒙皮锚固点，盘点 §6.1「锚固在每环外侧支点的固定件上」）：
 * 按装配位极角扫描（绕轮心，左外脚 π → 右外脚 0），每个角窗（±0.15 rad）只留
 * 半径最大的销——外弧销胜出，内弧/交叉销被滤除。脚的 y 钳到 ≥0 再取角
 * （±0 号位差会把外脚甩到 −π/−0 打乱次序）。锚点选在装配位、此后固定跟销——
 * 蒙皮物理上缝死在这些件上，不随姿态换锚。
 */
export function ringOuterProfile(d: ShellRingData): number[] {
  const ang = (i: number) => Math.atan2(Math.max(d.def.nodes[i].y, 0), d.def.nodes[i].x);
  const rad = (i: number) => Math.hypot(d.def.nodes[i].x, d.def.nodes[i].y);
  const ids = [...Array(d.pin).keys()];
  const DW = 0.15;
  const keep = ids.filter(
    (i) => !ids.some((j) => j !== i && Math.abs(ang(j) - ang(i)) < DW && rad(j) > rad(i)),
  );
  return keep.sort((a, b) => ang(b) - ang(a));
}
