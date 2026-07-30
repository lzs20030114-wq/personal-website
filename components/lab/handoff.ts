'use client';

/**
 * 台架运行状态的跨路由交接（用户 2026-07-29：「主页预览的图，点进详情页时工作状态要保留，
 * 不受影响地继续展示，而不是刷新了一下」）。
 *
 * 背景：主页预览位与案例页主图位是**同一台**台架（MAPPING §12.1），但 SPA 换页时
 * 前者卸载、后者从头挂载——新实例从 θ₀ 起步、触手笔直、待机摆动重新缓入 6.5s。
 * 转场把两端接得再准，落地那一下机器「倒带」了，看着就是刷新。
 *
 * 做法是**状态交接，不是保活**：不把 canvas 抬到路由树外（那要一套持久门户，
 * 牵动 SSR / 布局 / z-index，代价远超收益），而是让出场的实例把机构此刻的位形留下，
 * 入场的实例照着摆好再继续跑。交接的是「机器现在长什么样」，不是组件实例。
 *
 * 三条规则，每条都是踩出来的：
 * - **保质期**——留了状态却没换成页（用户按了返回、转场被打断），下次挂载不该套用一份陈的。
 *   取状态还必须在挂载流程**最前面**取：台架构造里有五环的止程标定（每环扫 360 步 ×
 *   四档余量），开发模式下要跑好几秒；第一版写在用到的地方才取，实测取到时 age 已 7.1s，
 *   刚好被保质期挡掉，表现为「交接代码明明在跑，却一次都没生效」。
 * - **取走后仍保留一小段宽限期**——React 严格模式下开发期每个组件挂两次（挂→卸→再挂），
 *   **留下的是第二个实例**。取走即彻底清掉的话，恢复恰好落在被丢弃的那一个上，
 *   线上没事、开发期永远看不到效果。宽限期内重复取回同一份即可（数据只读，恢复几次都一样）。
 * - **单槽**——同时只可能有一次转场在飞；多槽只会让「谁该吃哪一份」变得难说清。
 */

interface Slot {
  key: string;
  at: number;
  data: unknown;
}

/** 取走后仍可重复取回的宽限期（ms）：只为兜住严格模式的二次挂载，够短即可。 */
const GRACE_MS = 2000;

let slot: Slot | null = null;
let taken: (Slot & { takenAt: number }) | null = null;

/** 出场方留下状态。同 key 的旧状态直接覆盖——只有最后一次点击算数。 */
export function stashBench(key: string, data: unknown): void {
  slot = { key, at: Date.now(), data };
  taken = null;
}

/** 入场方取状态：key 不符、或已过保质期，一律返回 null（照常从头开始）。 */
export function takeBench<T>(key: string, maxAgeMs = 8000): T | null {
  const now = Date.now();
  if (slot && slot.key === key) {
    const fresh = now - slot.at <= maxAgeMs;
    taken = { ...slot, takenAt: now };
    slot = null;
    return fresh ? (taken.data as T) : null;
  }
  if (taken && taken.key === key && now - taken.takenAt <= GRACE_MS && now - taken.at <= maxAgeMs) {
    return taken.data as T;
  }
  return null;
}

/** 仅供测试：清空槽位。 */
export function clearBenchStash(): void {
  slot = null;
  taken = null;
}
