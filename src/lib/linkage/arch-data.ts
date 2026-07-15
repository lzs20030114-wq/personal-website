// arch-data.ts —— 轮回机器伏丘壳体 S4 环运动学骨架，机器生成。
// 来源：模型求解器参考/伸缩外壳1.3dm 的原始 S4 截面（objects 97..148，2026-07-16 复核，
// 生成脚本 scripts/model-extract/gen_arch.py）。坐标 = viewBox px：x = 350 + 3.643287·x_mm，y = 430 − 3.643287·y_mm。
// 结构：14 块角化三角板（刚性三角 = 3 杆）+ 23 销关节 + 曲柄(R*=12mm)→中央杆→拱顶，
// 四个脚点都参与水平滑动；每侧共用一条从完全展开外脚位向中心延伸的轨道。顶部竖直导轨 + 两条脚轨
// 用「超长杆到远锚点」模拟（半径 1e6px 的圆弧局部逼近直线，
// 行程内偏差 < 0.01px——Watt 直线机构同理；求解器内核零修改，范围锁死内）。
// 四脚位置、轨道和驱动链全部取自同一 S4 截面，不再混用「求解器结构演示.3dm」的展开态。
// 手改无效——改 scripts/model-extract/gen_arch.py 重新生成（依赖 pip: rhino3dm；流程见该目录脚本头注）。

import type { LinkageDef } from './types';

export const ARCH_PIN = 23;
export const ARCH_CENTER = 24;
export const ARCH_APEX = 12;
export const ARCH_FEET = [18, 20, 1, 3] as const;
export const ARCH_SLIDER_FEET = [18, 20, 1, 3] as const;
export const ARCH_SLOT_RANGES: ReadonlyArray<readonly [number, number]> = [[48.6164, 306.2806], [393.7194, 651.38]];
export const ARCH_SCALE = 3.643287;
export const ARCH_GROUND_Y = 430.0;
export const ARCH_CRANK_RADIUS = 43.7194;
export const GUIDE_REST = 1000000.0;
/** 支撑节点（渲染跳过；每板一个，K4 加固，见头注）。 */
export const ARCH_BRACES: ReadonlyArray<number> = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43];

/** 14 块角化三角板的关节索引（渲染板面 + 解支符号用）。 */
export const ARCH_TRIS: ReadonlyArray<readonly [number, number, number]> = [[0, 1, 2], [0, 3, 4], [2, 5, 7], [4, 5, 6], [6, 8, 9], [7, 9, 10], [8, 11, 12], [10, 12, 13], [11, 15, 16], [13, 14, 15], [14, 21, 22], [16, 19, 22], [17, 18, 19], [17, 20, 21]];

/** 初始（图纸姿态）各板朝向符号——解支不变量（SPEC §2.3 同思路）。 */
export const ARCH_TRI_SIGNS: ReadonlyArray<1 | -1> = [1, 1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, -1, -1];

export const ARCH_DEF: LinkageDef = {
 nodes: [
  { x: 591.7722, y: 367.1861 },
  { x: 651.38, y: 430.0 },
  { x: 514.2758, y: 328.5454 },
  { x: 532.1644, y: 430.0 },
  { x: 626.3032, y: 287.7697 },
  { x: 548.8069, y: 249.1327 },
  { x: 462.767, y: 239.3286 },
  { x: 554.0933, y: 162.6993 },
  { x: 429.4127, y: 75.3989 },
  { x: 468.0534, y: 152.8952 },
  { x: 388.6371, y: 187.4263 },
  { x: 311.3593, y: 187.4263 },
  { x: 350.0, y: 109.9263 },
  { x: 270.5873, y: 75.3989 },
  { x: 237.233, y: 239.3286 },
  { x: 231.9466, y: 152.8952 },
  { x: 145.9067, y: 162.6993 },
  { x: 108.2278, y: 367.1861 },
  { x: 48.6164, y: 430.0 },
  { x: 185.7242, y: 328.5454 },
  { x: 167.8357, y: 430.0 },
  { x: 73.6968, y: 287.7697 },
  { x: 151.1931, y: 249.1327 },
  { x: 350.0, y: 386.2806 },
  { x: 350.0, y: 430.0, fixed: true },
  { x: 1000350.0, y: 109.9263, fixed: true },
  { x: 48.6164, y: 1000430.0, fixed: true },
  { x: 167.8357, y: 1000430.0, fixed: true },
  { x: 651.38, y: 1000430.0, fixed: true },
  { x: 532.1644, y: 1000430.0, fixed: true },
  { x: 556.0604, y: 415.4459 },
  { x: 541.7088, y: 334.0479 },
  { x: 490.428, y: 235.117 },
  { x: 531.7545, y: 306.6961 },
  { x: 401.9934, y: 166.3359 },
  { x: 478.0165, y: 219.5685 },
  { x: 401.3618, y: 164.0546 },
  { x: 298.6359, y: 164.0541 },
  { x: 221.9816, y: 219.5685 },
  { x: 298.0066, y: 166.3359 },
  { x: 168.2455, y: 306.6961 },
  { x: 209.572, y: 235.117 },
  { x: 143.9374, y: 415.4462 },
  { x: 158.2913, y: 334.0479 },
 ],
 bars: [
  { a: 0, b: 1, rest: 86.5949 }, // tri
  { a: 1, b: 2, rest: 170.5597 }, // tri
  { a: 2, b: 0, rest: 86.5956 }, // tri
  { a: 0, b: 3, rest: 86.5949 }, // tri
  { a: 3, b: 4, rest: 170.5625 }, // tri
  { a: 4, b: 0, rest: 86.5988 }, // tri
  { a: 2, b: 5, rest: 86.5955 }, // tri
  { a: 5, b: 7, rest: 86.5949 }, // tri
  { a: 7, b: 2, rest: 170.559 }, // tri
  { a: 4, b: 5, rest: 86.5938 }, // tri
  { a: 5, b: 6, rest: 86.5967 }, // tri
  { a: 6, b: 4, rest: 170.5598 }, // tri
  { a: 6, b: 8, rest: 167.2885 }, // tri
  { a: 8, b: 9, rest: 86.5955 }, // tri
  { a: 9, b: 6, rest: 86.5949 }, // tri
  { a: 7, b: 9, rest: 86.5967 }, // tri
  { a: 9, b: 10, rest: 86.5988 }, // tri
  { a: 10, b: 7, rest: 167.2937 }, // tri
  { a: 8, b: 11, rest: 162.7475 }, // tri
  { a: 11, b: 12, rest: 86.5988 }, // tri
  { a: 12, b: 8, rest: 86.594 }, // tri
  { a: 10, b: 12, rest: 86.5972 }, // tri
  { a: 12, b: 13, rest: 86.594 }, // tri
  { a: 13, b: 10, rest: 162.7449 }, // tri
  { a: 11, b: 15, rest: 86.5955 }, // tri
  { a: 15, b: 16, rest: 86.5967 }, // tri
  { a: 16, b: 11, rest: 167.2901 }, // tri
  { a: 13, b: 14, rest: 167.2885 }, // tri
  { a: 14, b: 15, rest: 86.5949 }, // tri
  { a: 15, b: 13, rest: 86.5955 }, // tri
  { a: 14, b: 21, rest: 170.5598 }, // tri
  { a: 21, b: 22, rest: 86.5938 }, // tri
  { a: 22, b: 14, rest: 86.5967 }, // tri
  { a: 16, b: 19, rest: 170.559 }, // tri
  { a: 19, b: 22, rest: 86.5955 }, // tri
  { a: 22, b: 16, rest: 86.5949 }, // tri
  { a: 17, b: 18, rest: 86.5974 }, // tri
  { a: 18, b: 19, rest: 170.5626 }, // tri
  { a: 19, b: 17, rest: 86.5956 }, // tri
  { a: 17, b: 20, rest: 86.595 }, // tri
  { a: 20, b: 21, rest: 170.5626 }, // tri
  { a: 21, b: 17, rest: 86.5988 }, // tri
  { a: 30, b: 1, rest: 96.4243 }, // brace
  { a: 30, b: 2, rest: 96.4243 }, // brace
  { a: 30, b: 0, rest: 60.0362 }, // brace
  { a: 31, b: 3, rest: 96.4256 }, // brace
  { a: 31, b: 4, rest: 96.4255 }, // brace
  { a: 31, b: 0, rest: 60.0374 }, // brace
  { a: 32, b: 7, rest: 96.424 }, // brace
  { a: 32, b: 2, rest: 96.424 }, // brace
  { a: 32, b: 5, rest: 60.0378 }, // brace
  { a: 33, b: 6, rest: 96.4243 }, // brace
  { a: 33, b: 4, rest: 96.4244 }, // brace
  { a: 33, b: 5, rest: 60.0361 }, // brace
  { a: 34, b: 6, rest: 94.9809 }, // brace
  { a: 34, b: 8, rest: 94.9808 }, // brace
  { a: 34, b: 9, rest: 67.4135 }, // brace
  { a: 35, b: 10, rest: 94.9831 }, // brace
  { a: 35, b: 7, rest: 94.9831 }, // brace
  { a: 35, b: 9, rest: 67.4136 }, // brace
  { a: 36, b: 8, rest: 92.9876 }, // brace
  { a: 36, b: 11, rest: 92.9876 }, // brace
  { a: 36, b: 12, rest: 74.6184 }, // brace
  { a: 37, b: 13, rest: 92.9864 }, // brace
  { a: 37, b: 10, rest: 92.9864 }, // brace
  { a: 37, b: 12, rest: 74.6196 }, // brace
  { a: 38, b: 16, rest: 94.9816 }, // brace
  { a: 38, b: 11, rest: 94.9815 }, // brace
  { a: 38, b: 15, rest: 67.4139 }, // brace
  { a: 39, b: 13, rest: 94.9808 }, // brace
  { a: 39, b: 14, rest: 94.9809 }, // brace
  { a: 39, b: 15, rest: 67.4135 }, // brace
  { a: 40, b: 14, rest: 96.4243 }, // brace
  { a: 40, b: 21, rest: 96.4244 }, // brace
  { a: 40, b: 22, rest: 60.0361 }, // brace
  { a: 41, b: 16, rest: 96.424 }, // brace
  { a: 41, b: 19, rest: 96.424 }, // brace
  { a: 41, b: 22, rest: 60.0378 }, // brace
  { a: 42, b: 18, rest: 96.4257 }, // brace
  { a: 42, b: 19, rest: 96.4255 }, // brace
  { a: 42, b: 17, rest: 60.0351 }, // brace
  { a: 43, b: 20, rest: 96.4256 }, // brace
  { a: 43, b: 21, rest: 96.4256 }, // brace
  { a: 43, b: 17, rest: 60.0374 }, // brace
  { a: 24, b: 23, rest: 43.7194 }, // crank
  { a: 23, b: 12, rest: 276.3543 }, // rod
  { a: 12, b: 25, rest: 1000000.0 }, // guide
  { a: 18, b: 26, rest: 1000000.0 }, // guide
  { a: 20, b: 27, rest: 1000000.0 }, // guide
  { a: 1, b: 28, rest: 1000000.0 }, // guide
  { a: 3, b: 29, rest: 1000000.0 }, // guide
 ],
};
