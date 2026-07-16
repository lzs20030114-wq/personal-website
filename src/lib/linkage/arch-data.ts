// arch-data.ts —— 轮回机器伏丘壳体 S4 环（M3 × 1.000）运动学骨架，机器生成。
// 来源：模型求解器参考/求解器结构演示.3dm 图层「摊开骨架::S4_M3x1.000」（2026-07-10 提取，
// 生成脚本 scripts/model-extract/gen_arch.py）。坐标 = viewBox px：x = 350 + 1.9·x_mm，y = 430 − 1.9·y_mm。
// 结构：14 块角化三角板（刚性三角 = 3 杆）+ 23 销关节 + 曲柄(R*=28.1mm)→中央杆(≈L*)→拱顶，
// 顶部竖直导轨 + 四脚水平槽用「超长杆到远锚点」模拟（半径 1e6px 的圆弧局部逼近直线，
// 行程内偏差 < 0.01px——Watt 直线机构同理；求解器内核零修改，范围锁死内）。
// 手改无效——改 scripts/model-extract/gen_arch.py 重新生成（依赖 pip: rhino3dm；流程见该目录脚本头注）。

import type { LinkageDef } from './types';

export const ARCH_PIN = 23;
export const ARCH_CENTER = 24;
export const ARCH_APEX = 6;
export const ARCH_FEET = [16, 18, 19, 21] as const;
export const ARCH_CRANK_RADIUS = 53.3834;
export const GUIDE_REST = 1000000.0;
/** 支撑节点（渲染跳过；每板一个，K4 加固，见头注）。 */
export const ARCH_BRACES: ReadonlyArray<number> = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43];

/** 14 块角化三角板的关节索引（渲染板面 + 解支符号用）。 */
export const ARCH_TRIS: ReadonlyArray<readonly [number, number, number]> = [[0, 1, 2], [3, 4, 5], [6, 7, 3], [8, 9, 10], [11, 4, 1], [12, 10, 13], [14, 5, 2], [15, 13, 7], [16, 17, 12], [18, 9, 17], [19, 20, 0], [21, 14, 20], [6, 11, 22], [15, 22, 8]];

/** 初始（图纸姿态）各板朝向符号——解支不变量（SPEC §2.3 同思路）。 */
export const ARCH_TRI_SIGNS: ReadonlyArray<1 | -1> = [1, 1, -1, 1, 1, 1, 1, -1, 1, -1, -1, 1, 1, 1];

export const ARCH_DEF: LinkageDef = {
 nodes: [
  { x: 595.8619, y: 333.4306 },
  { x: 520.6618, y: 244.1401 },
  { x: 566.1345, y: 282.1553 },
  { x: 409.2705, y: 203.596 },
  { x: 465.0032, y: 223.7683 },
  { x: 510.4759, y: 261.7835 },
  { x: 350.0, y: 203.4896 },
  { x: 294.2673, y: 223.66 },
  { x: 189.5241, y: 261.7835 },
  { x: 88.5315, y: 320.3358 },
  { x: 133.8655, y: 282.1553 },
  { x: 405.7327, y: 223.66 },
  { x: 104.1381, y: 333.4306 },
  { x: 179.3382, y: 244.1401 },
  { x: 611.4685, y: 320.3358 },
  { x: 234.9968, y: 223.7683 },
  { x: 48.6182, y: 430.0 },
  { x: 58.8041, y: 371.6111 },
  { x: 68.99, y: 430.0 },
  { x: 651.3818, y: 430.0 },
  { x: 641.1959, y: 371.6111 },
  { x: 631.01, y: 430.0 },
  { x: 290.7295, y: 203.596 },
  { x: 350.0, y: 376.6166 },
  { x: 350.0, y: 430.0, fixed: true },
  { x: 1000350.0, y: 203.4896, fixed: true },
  { x: 48.6182, y: 1000430.0, fixed: true },
  { x: 68.99, y: 1000430.0, fixed: true },
  { x: 651.3818, y: 1000430.0, fixed: true },
  { x: 631.01, y: 1000430.0, fixed: true },
  { x: 523.8424, y: 317.7733 },
  { x: 437.4436, y: 271.7015 },
  { x: 359.503, y: 257.9584 },
  { x: 161.5984, y: 329.99 },
  { x: 455.3027, y: 278.2022 },
  { x: 176.1576, y: 317.7733 },
  { x: 538.4016, y: 329.99 },
  { x: 244.6973, y: 278.2022 },
  { x: 115.3902, y: 404.1442 },
  { x: 123.0629, y: 383.0623 },
  { x: 584.6098, y: 404.1442 },
  { x: 576.9371, y: 383.0623 },
  { x: 340.497, y: 257.9584 },
  { x: 262.5564, y: 271.7015 },
 ],
 bars: [
  { a: 0, b: 1, rest: 116.7384 }, // tri
  { a: 1, b: 2, rest: 59.2699 }, // tri
  { a: 2, b: 0, rest: 59.2695 }, // tri
  { a: 3, b: 4, rest: 59.271 }, // tri
  { a: 4, b: 5, rest: 59.2699 }, // tri
  { a: 5, b: 3, rest: 116.7404 }, // tri
  { a: 6, b: 7, rest: 59.2704 }, // tri
  { a: 7, b: 3, rest: 116.7403 }, // tri
  { a: 3, b: 6, rest: 59.2706 }, // tri
  { a: 8, b: 9, rest: 116.7385 }, // tri
  { a: 9, b: 10, rest: 59.2699 }, // tri
  { a: 10, b: 8, rest: 59.2696 }, // tri
  { a: 11, b: 4, rest: 59.2706 }, // tri
  { a: 4, b: 1, rest: 59.2696 }, // tri
  { a: 1, b: 11, rest: 116.7396 }, // tri
  { a: 12, b: 10, rest: 59.2695 }, // tri
  { a: 10, b: 13, rest: 59.2699 }, // tri
  { a: 13, b: 12, rest: 116.7384 }, // tri
  { a: 14, b: 5, rest: 116.7385 }, // tri
  { a: 5, b: 2, rest: 59.2696 }, // tri
  { a: 2, b: 14, rest: 59.2699 }, // tri
  { a: 15, b: 13, rest: 59.2696 }, // tri
  { a: 13, b: 7, rest: 116.7396 }, // tri
  { a: 7, b: 15, rest: 59.2706 }, // tri
  { a: 16, b: 17, rest: 59.2707 }, // tri
  { a: 17, b: 12, rest: 59.2699 }, // tri
  { a: 12, b: 16, rest: 111.3917 }, // tri
  { a: 18, b: 9, rest: 111.3917 }, // tri
  { a: 9, b: 17, rest: 59.2695 }, // tri
  { a: 17, b: 18, rest: 59.2707 }, // tri
  { a: 19, b: 20, rest: 59.2707 }, // tri
  { a: 20, b: 0, rest: 59.2699 }, // tri
  { a: 0, b: 19, rest: 111.3917 }, // tri
  { a: 21, b: 14, rest: 111.3917 }, // tri
  { a: 14, b: 20, rest: 59.2695 }, // tri
  { a: 20, b: 21, rest: 59.2707 }, // tri
  { a: 6, b: 11, rest: 59.2704 }, // tri
  { a: 11, b: 22, rest: 116.7403 }, // tri
  { a: 22, b: 6, rest: 59.2706 }, // tri
  { a: 15, b: 22, rest: 59.271 }, // tri
  { a: 22, b: 8, rest: 116.7404 }, // tri
  { a: 8, b: 15, rest: 59.2699 }, // tri
  { a: 30, b: 0, rest: 73.7018 }, // brace
  { a: 30, b: 1, rest: 73.7019 }, // brace
  { a: 30, b: 2, rest: 55.2925 }, // brace
  { a: 31, b: 5, rest: 73.7027 }, // brace
  { a: 31, b: 3, rest: 73.7027 }, // brace
  { a: 31, b: 4, rest: 55.2913 }, // brace
  { a: 32, b: 7, rest: 73.7026 }, // brace
  { a: 32, b: 3, rest: 73.7026 }, // brace
  { a: 32, b: 6, rest: 55.2916 }, // brace
  { a: 33, b: 8, rest: 73.7019 }, // brace
  { a: 33, b: 9, rest: 73.7019 }, // brace
  { a: 33, b: 10, rest: 55.2926 }, // brace
  { a: 34, b: 1, rest: 73.7024 }, // brace
  { a: 34, b: 11, rest: 73.7024 }, // brace
  { a: 34, b: 4, rest: 55.2915 }, // brace
  { a: 35, b: 13, rest: 73.7019 }, // brace
  { a: 35, b: 12, rest: 73.7018 }, // brace
  { a: 35, b: 10, rest: 55.2925 }, // brace
  { a: 36, b: 14, rest: 73.7019 }, // brace
  { a: 36, b: 5, rest: 73.7019 }, // brace
  { a: 36, b: 2, rest: 55.2926 }, // brace
  { a: 37, b: 13, rest: 73.7024 }, // brace
  { a: 37, b: 7, rest: 73.7024 }, // brace
  { a: 37, b: 15, rest: 55.2915 }, // brace
  { a: 38, b: 12, rest: 71.6032 }, // brace
  { a: 38, b: 16, rest: 71.6032 }, // brace
  { a: 38, b: 17, rest: 65.2717 }, // brace
  { a: 39, b: 18, rest: 71.6033 }, // brace
  { a: 39, b: 9, rest: 71.6033 }, // brace
  { a: 39, b: 17, rest: 65.2712 }, // brace
  { a: 40, b: 0, rest: 71.6032 }, // brace
  { a: 40, b: 19, rest: 71.6032 }, // brace
  { a: 40, b: 20, rest: 65.2717 }, // brace
  { a: 41, b: 21, rest: 71.6033 }, // brace
  { a: 41, b: 14, rest: 71.6033 }, // brace
  { a: 41, b: 20, rest: 65.2712 }, // brace
  { a: 42, b: 11, rest: 73.7026 }, // brace
  { a: 42, b: 22, rest: 73.7026 }, // brace
  { a: 42, b: 6, rest: 55.2916 }, // brace
  { a: 43, b: 22, rest: 73.7027 }, // brace
  { a: 43, b: 8, rest: 73.7027 }, // brace
  { a: 43, b: 15, rest: 55.2913 }, // brace
  { a: 24, b: 23, rest: 53.3834 }, // crank
  { a: 23, b: 6, rest: 173.127 }, // rod
  { a: 6, b: 25, rest: 1000000.0 }, // guide
  { a: 16, b: 26, rest: 1000000.0 }, // guide
  { a: 18, b: 27, rest: 1000000.0 }, // guide
  { a: 19, b: 28, rest: 1000000.0 }, // guide
  { a: 21, b: 29, rest: 1000000.0 }, // guide
 ],
};
