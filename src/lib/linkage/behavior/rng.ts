/**
 * 行为引擎的种子随机数（轮回机器_行为引擎spec.md §2）。
 *
 * 算法是 mulberry32，与 src/lib/space/unit-activation.ts 的 seededRng **逐位相同**（守门测试卡）。
 * 不同之处只在状态的放法：那几份旧副本把状态藏在闭包里，这里是一个裸的 uint32 字段——
 * 引擎状态要整块序列化（跨路由交接、快照、将来与固件逐行对照），闭包做不到。
 * 仓库里另三份副本（unit-activation / crowd-plan / case-reincarnation）本轮不动，
 * 免得给已定版的台架添回归；以后要去重，换成这一份即可。
 */

export interface Rng {
  /** 当前状态（uint32） */
  s: number;
}

export function makeRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

/** [0, 1) 均匀 */
export function rand(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** [lo, hi) 均匀 */
export function uniform(r: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * rand(r);
}

export function chance(r: Rng, p: number): boolean {
  return rand(r) < p;
}

export function pick<T>(r: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rand(r) * items.length))];
}

/**
 * 由主种子派生一条独立子流。生命时间表单独用一条：交互引起的抽样再多，
 * 也挪不动任何一世的死亡时点（spec §5.1）。
 */
export function deriveSeed(seed: number, salt: number): number {
  const r = makeRng(Math.imul((seed >>> 0) ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b) >>> 0);
  return Math.floor(rand(r) * 4294967296) >>> 0;
}
