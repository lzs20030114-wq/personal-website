'use client';

/**
 * 台架出场登记处（页面转场用，MAPPING §48）。
 *
 * 这里原先（2026-07-27 起）登记的是「重绘一帧 + 立即读回 PNG」的快照闭包：那时转场靠
 * `cloneNode(true)` 复制预览块，而 canvas 像素不随 cloneNode 复制。现在页面转场改用浏览器
 * 原生的 View Transitions——画面由浏览器自己截（WebGL 画布也截得到，preserveDrawingBuffer
 * 关着也行，已在 Chromium 实测），PNG 那一半随之退役，三台的读回闭包一并删掉。
 *
 * 留下来的是**状态交接**这一半：画框飞到另一页之前，让源画框里的台架把此刻的位形留给
 * 落地后的同一台（handoff.ts）——否则新实例从初始位起步，落地那一下机器「倒带」。
 * 交接只在点击转场那一刻跑一次，常态零开销。
 */

type StashFn = () => void;

const KEY = '__labStash';

type Stashable = HTMLCanvasElement & { [KEY]?: StashFn };

/** 台架挂载时登记「把此刻的状态留下」；卸载传 null 注销。 */
export function setStash(canvas: HTMLCanvasElement | null, fn: StashFn | null): void {
  if (!canvas) return;
  if (fn) (canvas as Stashable)[KEY] = fn;
  else delete (canvas as Stashable)[KEY];
}

/** 让 root 里所有登记过的台架留下状态；返回留了几台。出错一律吞掉——交接失败只是落地从头跑。 */
export function stashWithin(root: ParentNode): number {
  let n = 0;
  root.querySelectorAll('canvas').forEach((canvas) => {
    const fn = (canvas as Stashable)[KEY];
    if (!fn) return;
    try {
      fn();
      n += 1;
    } catch {
      /* 交接是锦上添花，不能挡住换页 */
    }
  });
  return n;
}
