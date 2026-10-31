/**
 * Lab 2-15 的轨迹在后台线程里烘（2026-10-30 起两层那组；2026-10-31 轻量化起平台三档也在这里）：一条带全程三四千步引擎，
 * 九条合起来三十来秒的计算，放在主线程上会把整页拖慢（性能排查见 MAPPING §77），所以挪到这里。
 * 收到一份活（引擎定义 + 帧数 + 每条的烘焙选项）就整组烘完，途中隔一会儿报一次进度，最后整组回传。
 * 主线程那头起不来这个线程时退回空闲时间里烘（CohabitSpaceBench）。
 */
import { UnitBaker, type BakeJob, type BakeReply, type BandTrajectory } from './cohabit-solid';

interface WorkerScope {
  onmessage: ((ev: MessageEvent<BakeJob>) => void) | null;
  postMessage: (msg: BakeReply, transfer?: Transferable[]) => void;
}
const scope = self as unknown as WorkerScope;

/** 两次进度之间推进多久（ms） */
const SLICE_MS = 200;

scope.onmessage = (ev) => {
  const { id, defs, frames, opts } = ev.data;
  try {
    const baker = new UnitBaker(defs, frames, opts);
    while (!baker.work(SLICE_MS)) scope.postMessage({ id, kind: 'progress', p: baker.progress });
    const trajs = baker.trajectories as BandTrajectory[];
    // 停稳之后的关键帧共用同一个数组（TrajectoryBaker），转交时每块内存只能列一次
    const buffers = new Set<ArrayBuffer>();
    for (const t of trajs) for (const f of t.frames) buffers.add(f.buffer as ArrayBuffer);
    scope.postMessage({ id, kind: 'done', trajs }, [...buffers]);
  } catch (error) {
    scope.postMessage({ id, kind: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
