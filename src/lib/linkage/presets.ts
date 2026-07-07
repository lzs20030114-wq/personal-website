import type { LinkageDef } from './types';
import { LinkageSolver } from './solver';

/** SPEC §2.2 节点索引约定。 */
export const N = { A: 0, B: 1, C: 2, D: 3, P: 4 } as const;

/** 曲柄圆：圆心 A、半径 |AB|。 */
export const CRANK = { cx: 250, cy: 380, r: 66 } as const;

/** 曲柄起始角（SPEC §2.3），可调。 */
export const THETA0 = -Math.PI / 3;

/** SPEC §2.2 规范实例：Grashof 曲柄摇杆 + 耦合三角板。C、P 是种子坐标（§2.3）。 */
export function makeCrankRockerDef(theta0: number = THETA0): LinkageDef {
  return {
    nodes: [
      { x: 250, y: 380, fixed: true }, // A
      {
        x: CRANK.cx + CRANK.r * Math.cos(theta0),
        y: CRANK.cy + CRANK.r * Math.sin(theta0),
      }, // B
      { x: 430, y: 260 }, // C 种子：机架线上方（y < 380）
      { x: 470, y: 380, fixed: true }, // D
      { x: 360, y: 225 }, // P 种子：BC 上方、远离机架一侧
    ],
    bars: [
      { a: N.A, b: N.B, rest: 66 }, // 曲柄
      { a: N.B, b: N.C, rest: 178 }, // 连杆
      { a: N.C, b: N.D, rest: 127 }, // 摇杆
      { a: N.B, b: N.P, rest: 132 }, // 三角板
      { a: N.C, b: N.P, rest: 100 }, // 三角板
    ],
  };
}

function cross(ux: number, uy: number, vx: number, vy: number): number {
  return ux * vy - uy * vx;
}

/** 环支符号 sign(cross(B−C, D−C))。本几何下全程非零（SPEC §2.3 共线不可达论证）。 */
export function loopSign(s: LinkageSolver): number {
  const B = s.nodes[N.B];
  const C = s.nodes[N.C];
  const D = s.nodes[N.D];
  return Math.sign(cross(B.x - C.x, B.y - C.y, D.x - C.x, D.y - C.y));
}

/** 板朝向符号 sign(cross(C−B, P−B))。三根杆锁死三角板，连续运动中永远恒定。 */
export function plateSign(s: LinkageSolver): number {
  const B = s.nodes[N.B];
  const C = s.nodes[N.C];
  const P = s.nodes[N.P];
  return Math.sign(cross(C.x - B.x, C.y - B.y, P.x - B.x, P.y - B.y));
}

/** §2.3 期望解支：C 在机架上方、P 在 BC 外侧。SVG y 向下坐标系中两个符号均为 −1。 */
export const EXPECTED_LOOP_SIGN = -1;
export const EXPECTED_PLATE_SIGN = -1;

/** SPEC §2.3 初始化程序（第 7 步：分支断言，把「种子选对了」变成测试）。 */
export function createCrankRocker(theta0: number = THETA0): LinkageSolver {
  const s = new LinkageSolver(makeCrankRockerDef(theta0));
  s.setFixed(N.B, true); // 曲柄端点临时锚定
  s.iterate(240);
  s.setFixed(N.B, false);
  if (loopSign(s) !== EXPECTED_LOOP_SIGN || plateSign(s) !== EXPECTED_PLATE_SIGN) {
    throw new Error('初始化收敛到了错误解支——检查种子坐标（SPEC §2.3）');
  }
  return s;
}
