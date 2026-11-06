/**
 * 对外页面上要不要露出「待补」类东西（2026-11-06，用户「有什么过时的、落后的、矛盾的都改」）。
 *
 * 案例页里的 <Todo>（作者待办）、没有素材的 <FigSlot> / <VideoSlot> 占位框、<ProcessAside> 的 pend 句，
 * 本来是给作者看的编辑稿痕迹，生产构建（线上）一律不渲染；`npm run dev` 本地照常显示，作者补稿时仍看得到。
 * 想在线上临时放出来：构建时设 NEXT_PUBLIC_SHOW_PENDING=1。
 * MDX 源文件一字不动，content.test.ts 卡的插槽编号与顺序照旧。
 */
export const SHOW_PENDING =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SHOW_PENDING === '1';
