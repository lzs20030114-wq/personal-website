/**
 * 页面转场的公共状态（MAPPING §48）。单独成文件、不带 React：落地页里有几处动作要
 * 「等转场演完再做」，它们只需要这两个小函数，不该把整个编排层（PageTransitions.tsx）拖进来。
 *
 * 转场进行期间 `<html data-pt="…">` 一直挂着（形式名）；演完由编排层摘掉并广播 PT_DONE_EVENT。
 */

export const PT_DONE_EVENT = 'pt:done';

/**
 * 离开首页 Lab / Log 区时记下的滚动位置（sessionStorage）：编排层写、HomeScroll 落位时取用一次。
 * 值 = { top, at }；太旧的不用（只为「按返回落回原处」，不是长期偏好）。
 */
export const HOME_ZONE_KEY = 'pt-home-zone';

/** 此刻是否正处在一次页面转场里（包括新页已挂载、动画还没演完的那一段）。 */
export function pageTransitionActive(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-pt');
}

/**
 * 转场进行中就等它演完再跑 cb（兜底 maxWait 毫秒必跑），否则立即跑。返回取消函数。
 * 用途：落地后的页内滚动 / 高亮——在转场途中滚，读者看见的是一张纸一边升起一边自己卷动。
 */
export function afterPageTransition(cb: () => void, maxWait = 2000): () => void {
  if (!pageTransitionActive()) {
    cb();
    return () => {};
  }
  let settled = false;
  const run = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener(PT_DONE_EVENT, run);
    clearTimeout(timer);
    cb();
  };
  window.addEventListener(PT_DONE_EVENT, run);
  const timer = setTimeout(run, maxWait);
  return () => {
    settled = true;
    window.removeEventListener(PT_DONE_EVENT, run);
    clearTimeout(timer);
  };
}
