/**
 * 页面转场的 FLIP 几何（纯函数，零 DOM——DOM 接线在 components/site/PageEnter.tsx 与
 * HomeScreens.tsx 的 goPT）。
 *
 * 转场分两段，两段共用这里的两个函数：
 * ① 主页：卡片预览块（媒体块 / 活台架）从原位放大到铺满视口 → `coverRect`；
 * ② 案例页：铺满视口的那一帧，缩放位移到 hero 主图位 → `flipTransform`。
 * 两段之所以能接得上，是因为**两个元素走同一条几何路径**：出场克隆与落地 hero 各自
 * 用 flipTransform 算出「起点盒 → 终点盒」的 translate+scale，起终点盒一致 ⇒ 全程重合，
 * 交叉淡出时看不出换了元素。
 *
 * 约定：变换写作 `translate(tx,ty) scale(s)`，transform-origin 恒为 50% 50%
 * （先按中心缩放再平移，等价于中心对齐——换个原点这里的公式就不成立了）。
 */

export type Rect = { left: number; top: number; width: number; height: number };

export type Flip = { tx: number; ty: number; scale: number };

const centerX = (r: Rect): number => r.left + r.width / 2;
const centerY = (r: Rect): number => r.top + r.height / 2;

/**
 * 盒 `r` 按 cover 放大到铺满 vw×vh 视口后的视觉矩形（等比、居中、pad 为溢出余量）。
 * 等比不是洁癖：非等比会把画面拉变形，而这一帧要和另一个元素严丝合缝地接上。
 */
export function coverRect(r: Rect, vw: number, vh: number, pad = 1.02): Rect {
  const s = Math.max(vw / Math.max(r.width, 1), vh / Math.max(r.height, 1)) * pad;
  const width = r.width * s;
  const height = r.height * s;
  return { left: (vw - width) / 2, top: (vh - height) / 2, width, height };
}

/**
 * 把版式盒 `from` 变换到视觉盒 `to` 所需的 translate+scale。
 * 缩放按**宽度**取（等比），高度差由两盒宽高比不同引起，交给各自的 overflow 裁切——
 * 按面积或非等比缩放会在飞行途中把内容拉变形。
 */
export function flipTransform(from: Rect, to: Rect): Flip {
  return {
    tx: centerX(to) - centerX(from),
    ty: centerY(to) - centerY(from),
    scale: to.width / Math.max(from.width, 1),
  };
}

/** Flip → CSS transform 字符串（顺序固定，见文件头约定）。 */
export function flipCss(f: Flip): string {
  return `translate(${f.tx}px,${f.ty}px) scale(${f.scale})`;
}
