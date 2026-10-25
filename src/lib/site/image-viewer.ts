/**
 * 页内看图器的几何（纯函数，零 DOM）：适配、缩放、平移、翻页。
 *
 * 状态 = { s, x, y }：s 是相对图片原始像素的缩放倍数，(x, y) 是图片中心相对舞台中心的偏移（CSS px）。
 * 舞台 = 看图器里放图的那块区域（去掉上下两条栏）。
 */

export type ViewState = { s: number; x: number; y: number };
export type Box = { w: number; h: number };

/** 手感常量 */
export const IV = {
  /** 适配时图与舞台边缘留的空 */
  PAD: 24,
  /** 最大放大 = max(适配, 原始像素) × 这个数 */
  MAX_NATIVE: 2,
  /** 双击放大到适配的几倍（至少到原始像素） */
  DOUBLE: 2.5,
  /** 滚轮：每 1px deltaY 的缩放指数 */
  WHEEL: 0.0016,
  /** 按钮与键盘一步的倍数 */
  STEP: 1.4,
  /** 适配状态下横向拖过这么多 px 算翻页 */
  SWIPE: 56,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 适配舞台的缩放；小图不放大（最多原始像素）。 */
export function fitScale(img: Box, stage: Box, pad: number = IV.PAD): number {
  const s = Math.min((stage.w - pad * 2) / img.w, (stage.h - pad * 2) / img.h);
  return clamp(s, 0.01, 1);
}

export function maxScale(fit: number): number {
  return Math.max(fit, 1) * IV.MAX_NATIVE;
}

/** 缩放夹在 [适配, 最大]；图比舞台小的方向居中，比舞台大的方向边缘不进舞台。 */
export function clampView(v: ViewState, img: Box, stage: Box, fit: number): ViewState {
  const s = clamp(v.s, fit, maxScale(fit));
  const limX = Math.max(0, (img.w * s - stage.w) / 2);
  const limY = Math.max(0, (img.h * s - stage.h) / 2);
  return { s, x: clamp(v.x, -limX, limX), y: clamp(v.y, -limY, limY) };
}

/** 以舞台上一点 (px, py，相对舞台中心) 为不动点缩放 factor 倍。 */
export function zoomAt(v: ViewState, factor: number, px: number, py: number, img: Box, stage: Box, fit: number): ViewState {
  const s = clamp(v.s * factor, fit, maxScale(fit));
  const k = s / v.s;
  return clampView({ s, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, img, stage, fit);
}

/** 双击：放大着就回适配，适配着就以那一点放大。 */
export function toggleZoom(v: ViewState, px: number, py: number, img: Box, stage: Box, fit: number): ViewState {
  if (isZoomed(v, fit)) return { s: fit, x: 0, y: 0 };
  const target = Math.min(maxScale(fit), Math.max(1, fit * IV.DOUBLE));
  return zoomAt(v, target / v.s, px, py, img, stage, fit);
}

export function isZoomed(v: ViewState, fit: number): boolean {
  return v.s > fit * 1.01;
}

/** 滚轮一格的缩放倍数（向上滚 = deltaY < 0 = 放大） */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-clamp(deltaY, -240, 240) * IV.WHEEL);
}

/** 适配状态下的横向拖动：够远且以横向为主才翻页，向左拖 = 下一张。 */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < IV.SWIPE || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

export function wrapIndex(i: number, n: number): number {
  return ((i % n) + n) % n;
}

/** 读数：相对适配的百分比（适配 = 100%）。 */
export function zoomPercent(v: ViewState, fit: number): number {
  return Math.round((v.s / fit) * 100);
}
