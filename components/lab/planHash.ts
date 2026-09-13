/**
 * 折进编制按钮的差分要能用 URL 直达（2026-09-03 收纳：合并进来的编制没有自己的主页卡片
 * 与锚点，`/lab#lab2-5-split` 这类哈希补上这一路）。
 * 挂载时读一次：`#lab{no}-{plan}` 匹配到已登记的编制键才生效，并把台架滚进视野
 * （浏览器对不存在的 id 不会自己滚）。不匹配 = 返回 null、什么都不做。
 *
 * 2026-09-13 编号改按项目（用户拍板「lab1-1 = 项目 1 第一个」）：Lab.01–05 → 1-1…1-5，
 * Lab.06–15 → 2-1…2-10。旧哈希（`#lab10`、`#lab10-split`）已经发出去过，照样认。
 */

/** 旧两位编号 → 新「项目-序号」；不是旧号返回 null */
export function legacyLabNo(nn: string): string | null {
  if (!/^\d\d$/.test(nn)) return null;
  const n = Number(nn);
  if (n < 1 || n > 15) return null;
  return n <= 5 ? `1-${n}` : `2-${n - 5}`;
}

/** 当前哈希，旧号换成新号（`#lab10-split` → `#lab2-5-split`）；非 lab 哈希原样返回 */
export function normalizedLabHash(hash: string): string {
  const m = /^#lab(\d\d)(-[a-z]+)?$/.exec(hash);
  const no = m && legacyLabNo(m[1]);
  return no ? `#lab${no}${m[2] ?? ''}` : hash;
}

export function planFromHash<K extends string>(no: string, keys: readonly K[]): K | null {
  if (typeof window === 'undefined') return null;
  const hash = normalizedLabHash(window.location.hash);
  const m = new RegExp(`^#lab${no}-([a-z]+)$`).exec(hash);
  if (!m) return null;
  const k = keys.find((key) => key === m[1]);
  if (!k) return null;
  window.requestAnimationFrame(() => document.getElementById(`lab${no}`)?.scrollIntoView());
  return k;
}
