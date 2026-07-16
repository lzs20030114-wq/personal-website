import type { LinkageDef } from './types';
import { LinkageSolver } from './solver';
import {
  ARCH_APEX,
  ARCH_CENTER,
  ARCH_CRANK_RADIUS,
  ARCH_DEF,
  ARCH_PIN,
  ARCH_TRIS,
  ARCH_TRI_SIGNS,
} from './arch-data';

export {
  ARCH_APEX,
  ARCH_CENTER,
  ARCH_CRANK_RADIUS,
  ARCH_FEET,
  ARCH_PIN,
  ARCH_TRIS,
} from './arch-data';

/**
 * 轮回机器伏丘壳体 S4 环——真机机构的求解器实例（内核零修改，SPEC §1.2 范围锁死内）。
 *
 * 与规范四杆实例（presets.ts）的关系：同一内核、同一驱动模式（曲柄位置驱动 + warm start），
 * 只是 LinkageDef 换成从 求解器结构演示.3dm 提取的真机几何：
 *   14 块角化三角板（刚性三角 = 3 杆，同「耦合三角板」原理）
 *   + 曲柄滑块驱动链（轮心锚点 → 曲柄销 → 中央杆 → 拱顶）
 *   + 竖直导轨 / 四脚水平槽（超长杆近似直线，见 arch-data.ts 头注）。
 * 盘点原理对照：F=1（导轨消掉裸拱的侧摆自由度）；曲柄销过轮顶/轮底 = 伸展/折叠死点，
 * 对应求解器的雅可比降秩区（SPEC §3.4「变软」，文档化不特判）——真机拿它当自锁限位。
 */
export function makeArchDef(): LinkageDef {
  return {
    nodes: ARCH_DEF.nodes.map((n) => ({ ...n })),
    bars: ARCH_DEF.bars.map((b) => ({ ...b })),
  };
}

/** 图纸姿态的曲柄角：销在轮顶正上方（SVG y 向下 → −π/2）。 */
export const ARCH_THETA0 = -Math.PI / 2;

/** 驱动配置（controller 直接可用；ω 取比四杆慢的呼吸节奏）。 */
export const ARCH_DRIVER = {
  anchor: ARCH_CENTER,
  tip: ARCH_PIN,
  radius: ARCH_CRANK_RADIUS,
  omega: 0.8,
} as const;

/**
 * 剪式链比四杆环长（约 9 级传播直径），GS 每遍只把约束信息推进一格（SPEC §3.2），
 * 同等刚性感需要更高的遍数预算。实测回填（2026-07-10，arch.test/debug）：
 * 48 遍 @ 720 步/圈瞬态峰值 2.08px、96 遍 1.99px——峰值受死点慢模态支配而非预算，
 * 加遍数不值；48/64 已让全程视觉刚性（<2.1px @ 700px 画幅）。
 * 成本量级：91 杆 × 64 遍 × 60fps ≈ 35 万投影/秒，无压力（SPEC §3.5 同款估算）。
 */
export const ARCH_SPIN_SWEEPS = 48;
export const ARCH_DRAG_SWEEPS = 64;

function cross(ux: number, uy: number, vx: number, vy: number): number {
  return ux * vy - uy * vx;
}

/** 14 块板的朝向符号（SPEC §2.3 板朝向不变量的推广）。 */
export function archTriSigns(s: LinkageSolver): number[] {
  return ARCH_TRIS.map(([i, j, k]) => {
    const a = s.nodes[i];
    const b = s.nodes[j];
    const c = s.nodes[k];
    return Math.sign(cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y));
  });
}

/**
 * 初始化（SPEC §2.3 同程序）：图纸姿态本身就是精确装配，settle 只吃掉提取舍入的
 * 微小残差；随后断言全部 14 块板仍在图纸解支上——把「几何提取对了」变成测试。
 */
export function createArch(): LinkageSolver {
  const s = new LinkageSolver(makeArchDef());
  s.setFixed(ARCH_PIN, true);
  s.iterate(240);
  s.setFixed(ARCH_PIN, false);
  const signs = archTriSigns(s);
  for (let t = 0; t < signs.length; t++) {
    if (signs[t] !== ARCH_TRI_SIGNS[t]) {
      throw new Error(`拱环初始化落入错误解支：板 ${t} 朝向翻转——检查 arch-data 提取`);
    }
  }
  return s;
}

/** 拱顶高度（mm，真机口径）：viewBox y 反变换。题栏读数用。 */
export function apexHeightMM(s: LinkageSolver): number {
  return (430 - s.nodes[ARCH_APEX].y) / 1.9;
}

/**
 * 脚槽两端止程（2026-07-16 止程模拟实验 → 2026-07-17 转正入台架，用户拍板）。
 *
 * 真机脚（销）在有限长水平直槽内开合（盘点 §6.1「脚在水平直槽内开合」）。超长杆
 * 只近似了槽的「直线」，丢了槽的「端点」——少了它，四脚存在零刚度自由滑移模态
 * （曲柄只锁拱顶高度），帧时序不同的设备几秒内漂进不同构型（实测：两脚并拢 +
 * 整环压扁，残差仍 ≈0——是合法解不是算错，形态由设备帧历史决定）。
 * 止程是不等式约束，SPEC §1.2 范围外，按 2026-07-16 事故定案落在内核之外，
 * 由台架与投影交错调用。
 *
 * 槽端数值 = 本模型自己的运动学行程（外端 = 全开位 = 图纸装配位；内端 = 理想
 * 准静态整圈实测极值：1440 步 × 96 遍交错钳制，峰值残差 0.381px，左右镜像对称
 * 到 0.01px）。真机槽长/内端止程按实测标定（07-16 定案），标定后替换此表即可。
 */
export const ARCH_FOOT_SLOTS: ReadonlyArray<{ node: number; lo: number; hi: number }> = [
  { node: 16, lo: 48.6182, hi: 145.42 },
  { node: 18, lo: 68.99, hi: 246.61 },
  { node: 19, lo: 554.58, hi: 651.3818 },
  { node: 21, lo: 453.39, hi: 631.01 },
];

/** 与投影交错调用：越出槽端的脚钳回端点（两端均止）。 */
export function clampFootStops(s: LinkageSolver): void {
  for (const { node, lo, hi } of ARCH_FOOT_SLOTS) {
    const n = s.nodes[node];
    if (n.x < lo) s.setNode(node, lo, n.y);
    else if (n.x > hi) s.setNode(node, hi, n.y);
  }
}

/**
 * 台架每个仿真子步后的止程松弛：钳制与投影交错（8×6 遍），把钳制引入的
 * 残差摊回全环再收口。实测（3 圈自旋）：峰值残差 60fps 1.04px / 120fps 0.48px。
 */
export function archStopPass(s: LinkageSolver): void {
  for (let k = 0; k < 8; k++) {
    clampFootStops(s);
    s.iterate(6);
  }
  clampFootStops(s);
}

/**
 * 固定仿真步长（秒）。自旋轨迹的分岔源是「每帧 Δθ = ω·dt 随设备帧率变化」——
 * 台架用累加器按 ARCH_STEP_DT 定步推进（渲染帧率只影响采样，不影响轨迹），
 * 任何设备走同一条逐步相同的轨迹，配合槽端止程实现跨设备形态一致。
 */
export const ARCH_STEP_DT = 1 / 120;
