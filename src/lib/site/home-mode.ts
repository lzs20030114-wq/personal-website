/**
 * 首页版式只在一处决定（MAPPING §67）：整屏翻页（paged）还是上下排开的文档流（flow）。
 *
 * - 只按窗口宽度分：窄于 1024 走文档流。「减弱动态效果」不再换版式，只去掉动画——
 *   原来它也会切到文档流，Mac 上开了这个设置就看不到方块场、翻页和横向轮播，和 Windows 判若两站。
 * - 结果写在 `<html data-hs>` 上，CSS 只认这个属性：没写（脚本根本没跑）就是文档流，内容全部可见。
 * - 写属性的是首页 HTML 里的一段内联脚本（ES5，不经打包器），在画第一帧前就定好；
 *   Safari 低于 16.4 读不懂打包后的语法（Next 自带代码里有类静态块），整包脚本不执行，
 *   内联脚本先探一下这几样语法，读不懂就直接走文档流，不再停在一片黑底上。
 * - 打包脚本正常起跑后由 HomeScroll 接管同一个属性（窗口宽窄变化、客户端跳转回首页）。
 */

export const HOME_FLOW_QUERY = '(max-width: 1023px)';
export const HOME_REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
export const HOME_MODE_ATTR = 'data-hs';
export type HomeMode = 'paged' | 'flow';

/** 打包脚本跑完 `load` 之后多久还没接管（`.hs-ready`），就判定它挂了、退回文档流 */
export const HOME_BOOT_GRACE_MS = 3000;

/** 首页现在是哪种版式（只在浏览器里调用） */
export function homeMode(): HomeMode {
  return document.documentElement.getAttribute(HOME_MODE_ATTR) === 'paged' ? 'paged' : 'flow';
}

export function setHomeMode(mode: HomeMode): void {
  document.documentElement.setAttribute(HOME_MODE_ATTR, mode);
}

/** 窗口宽度要的版式 */
export function wantedHomeMode(): HomeMode {
  return window.matchMedia(HOME_FLOW_QUERY).matches ? 'flow' : 'paged';
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia(HOME_REDUCE_QUERY).matches;
}

/**
 * 内联启动脚本。探的语法 = 打包产物里实际出现、旧 Safari 会报语法错的那几样：
 * 类静态块（Safari 16.4）、可选链与 `??=`（13.1 / 14）。只解析不执行（`new Function`）。
 * 字符串里只许 ES5：它本身就要在旧浏览器上跑。
 */
export const HOME_BOOT_SCRIPT = `(function(){var d=document.documentElement,ok=true;try{new Function('class A{static{}};var o={};o?.a;o.b??=1;');}catch(e){ok=false;}var flow=!ok||!window.matchMedia||window.matchMedia(${JSON.stringify(
  HOME_FLOW_QUERY,
)}).matches;d.setAttribute(${JSON.stringify(HOME_MODE_ATTR)},flow?'flow':'paged');if(!ok)return;window.addEventListener('load',function(){setTimeout(function(){var r=document.querySelector('.hs-root');if(r&&!/(^|\\s)hs-ready(\\s|$)/.test(r.className))d.setAttribute(${JSON.stringify(
  HOME_MODE_ATTR,
)},'flow');},${HOME_BOOT_GRACE_MS});});})();`;
