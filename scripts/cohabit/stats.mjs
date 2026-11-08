// 对照用的统计小工具（零依赖）：均值 / 标准差 / Cohen's d / 双侧置换检验 p 值（带种子，逐位可复现）。
// 置换检验不假设正态：把两组读数混在一起随机重分 N 次，看「均值差至少这么大」出现的比例。

export function mean(v) {
  return v.reduce((a, b) => a + b, 0) / v.length;
}
export function sd(v) {
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1));
}
/** Cohen's d（合并标准差）：b 比 a 高多少个标准差 */
export function cohenD(a, b) {
  const s = Math.sqrt(((a.length - 1) * sd(a) ** 2 + (b.length - 1) * sd(b) ** 2) / Math.max(1, a.length + b.length - 2));
  return s > 0 ? (mean(b) - mean(a)) / s : 0;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 双侧置换检验：H0 = 两组同分布；返回 p（含观测本身，下限 1/(N+1)） */
export function permP(a, b, n = 20000, seed = 20261007) {
  const obs = Math.abs(mean(b) - mean(a));
  const all = [...a, ...b];
  const r = rng(seed);
  let hit = 0;
  for (let k = 0; k < n; k++) {
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    let sa = 0;
    for (let i = 0; i < a.length; i++) sa += all[i];
    let sb = 0;
    for (let i = a.length; i < all.length; i++) sb += all[i];
    if (Math.abs(sb / b.length - sa / a.length) >= obs - 1e-12) hit++;
  }
  return (hit + 1) / (n + 1);
}
/** 星号：p < .001 *** · < .01 ** · < .05 * · 其余 n.s. */
export function stars(p) {
  return p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'n.s.';
}
/**
 * 配对的双侧置换检验（符号翻转）：同一个种子下 a、b 两组各一场，H0 = 差值关于 0 对称；返回 p（下限 1/(N+1)）。
 * 引导开 / 关在同一个种子、同一份起始布置上比，差值只来自引导本身，比把两组混在一起重分灵敏得多。
 */
export function permPairedP(a, b, n = 20000, seed = 20261108) {
  const d = b.map((x, i) => x - a[i]);
  const obs = Math.abs(mean(d));
  const r = rng(seed);
  let hit = 0;
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (const x of d) s += r() < 0.5 ? -x : x;
    if (Math.abs(s / d.length) >= obs - 1e-12) hit++;
  }
  return (hit + 1) / (n + 1);
}
/** 配对效应量 dz = 差值均值 / 差值标准差 */
export function pairedDz(a, b) {
  const d = b.map((x, i) => x - a[i]);
  const s = sd(d);
  return s > 0 ? mean(d) / s : 0;
}
/** 差值均值的 95% 自助法区间（带种子，逐位可复现） */
export function pairedCI(a, b, n = 10000, seed = 20261109) {
  const d = b.map((x, i) => x - a[i]);
  const r = rng(seed);
  const ms = [];
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (let i = 0; i < d.length; i++) s += d[Math.floor(r() * d.length)];
    ms.push(s / d.length);
  }
  ms.sort((x, y) => x - y);
  return [ms[Math.floor(0.025 * n)], ms[Math.floor(0.975 * n)]];
}
