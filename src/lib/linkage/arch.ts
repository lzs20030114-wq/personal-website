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
