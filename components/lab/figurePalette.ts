import type { Tone } from '../../src/lib/space/figure';

/**
 * 方块人与方块猫的配色（2026-10-25 作者「人也改成方块风，和猫统一风格」）：几何只给每块零件一个颜色类别（figure.ts 的 Tone），
 * 颜色在这里。每种颜色给一对 [背光, 迎光]——着色器按法向在两者之间插值（gl3d MESH_FS），背光取迎光的约三成。
 * 人的上衣与头发按 variant（访客编号）轮换，一眼分得出是谁；色相取站内那几种灰调的绿、蓝、土黄、豆沙，不跳出画面。
 */
type RGB = [number, number, number];
const pair = (lite: RGB, k = 0.3): [RGB, RGB] => [[lite[0] * k, lite[1] * k, lite[2] * k], lite];

const SHIRTS: RGB[] = [
  [0.56, 0.72, 0.6], // 灰绿
  [0.55, 0.66, 0.82], // 雾蓝
  [0.86, 0.56, 0.44], // 陶土
  [0.88, 0.76, 0.44], // 芥黄
  [0.7, 0.62, 0.84], // 淡紫
  [0.9, 0.88, 0.84], // 米白
];
const HAIRS: RGB[] = [
  [0.3, 0.22, 0.17], // 深棕
  [0.16, 0.14, 0.13], // 黑
  [0.55, 0.4, 0.27], // 栗色
];

const FIXED: Record<Exclude<Tone, 'shirt' | 'hair'>, [RGB, RGB]> = {
  skin: pair([0.96, 0.8, 0.66]),
  pants: pair([0.34, 0.4, 0.52]),
  shoe: pair([0.28, 0.26, 0.25]),
  fur: pair([0.98, 0.7, 0.4]),
  muzzle: pair([1, 0.94, 0.82], 0.36),
  eye: [[0.03, 0.03, 0.04], [0.1, 0.09, 0.1]],
  shine: [[0.8, 0.8, 0.8], [1, 1, 1]],
  nose: pair([0.96, 0.56, 0.6], 0.42),
  stripe: pair([0.8, 0.44, 0.17], 0.28),
};

/** 某类零件的颜色 [背光, 迎光]；variant 只对上衣与头发起作用 */
export function toneColor(tone: Tone, variant = 0): [RGB, RGB] {
  if (tone === 'shirt') return pair(SHIRTS[((variant % SHIRTS.length) + SHIRTS.length) % SHIRTS.length]);
  if (tone === 'hair') return pair(HAIRS[((variant % HAIRS.length) + HAIRS.length) % HAIRS.length], 0.4);
  return FIXED[tone];
}
