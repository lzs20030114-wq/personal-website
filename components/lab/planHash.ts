/**
 * 折进编制按钮的差分要能用 URL 直达（2026-09-03 收纳：合并进来的编制没有自己的主页卡片
 * 与锚点，`/lab#lab10-split` 这类哈希补上这一路）。
 * 挂载时读一次：`#lab{no}-{plan}` 匹配到已登记的编制键才生效，并把台架滚进视野
 * （浏览器对不存在的 id 不会自己滚）。不匹配 = 返回 null、什么都不做。
 */
export function planFromHash<K extends string>(no: string, keys: readonly K[]): K | null {
  if (typeof window === 'undefined') return null;
  const m = new RegExp(`^#lab${no}-([a-z]+)$`).exec(window.location.hash);
  if (!m) return null;
  const k = keys.find((key) => key === m[1]);
  if (!k) return null;
  window.requestAnimationFrame(() => document.getElementById(`lab${no}`)?.scrollIntoView());
  return k;
}
