'use client';

/**
 * 台架画面快照登记处（供页面转场的克隆用）。
 *
 * 为什么需要：转场靠 `cloneNode(true)` 复制预览块，而 **canvas 的像素不随 cloneNode 复制**——
 * 克隆出来的是一张空画布。3D 台架（五环 / 触手）在主页预览位就是 canvas，点卡片那一刻
 * 机构会凭空消失、只剩一个深色方块放大（2026-07-27 落地前的实况）。
 *
 * 为什么不直接 toDataURL：WebGL 上下文没开 preserveDrawingBuffer（开了全站每帧都要多留一份
 * 缓冲，代价加在常态渲染上），合成之后读回来是空的。所以由台架自己登记一个 `重绘 + 立即读回`
 * 的闭包——在同一个任务里读，绘制缓冲还在，且**只在点击转场时才跑一帧**，常态零开销。
 *
 * 装备（gl3d/camera3d）零改：登记是台架层的事。
 */

type SnapFn = () => string | null;

const KEY = '__labSnapshot';

type Snapshottable = HTMLCanvasElement & { [KEY]?: SnapFn };

/** 台架挂载时登记；卸载传 null 注销。 */
export function setSnapshot(canvas: HTMLCanvasElement | null, fn: SnapFn | null): void {
  if (!canvas) return;
  if (fn) (canvas as Snapshottable)[KEY] = fn;
  else delete (canvas as Snapshottable)[KEY];
}

/** 取快照 data URL；没登记、或读回失败（跨域污染 / 上下文丢失）一律返回 null，调用方自行降级。 */
export function snapshotCanvas(canvas: HTMLCanvasElement): string | null {
  try {
    return (canvas as Snapshottable)[KEY]?.() ?? null;
  } catch {
    return null;
  }
}
