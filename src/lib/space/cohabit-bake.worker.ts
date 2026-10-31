/**
 * Lab 2-15 的轨迹在后台线程里烘（2026-10-30 按用途定形）：两个结构的六条轨迹（三档 × 两块都成 / 只成下台）一条 338 节、
 * 全程 3000 步另加让路回程，合起来二三十秒的计算，放在主线程上会把整页拖慢（性能排查见 MAPPING §77），所以挪到这里。
 * 收到一份活（引擎定义 + 帧数 + 每条的烘焙选项）就一条一条烘，每烘完一条回传一条，最后回 done。
 * 主线程那头起不来这个线程时退回空闲时间里烘（CohabitSpaceBench）。
 */
import { TrajectoryBaker, type BakeJob, type BakeReply } from './cohabit-solid';

interface WorkerScope {
  onmessage: ((ev: MessageEvent<BakeJob>) => void) | null;
  postMessage: (msg: BakeReply, transfer?: Transferable[]) => void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (ev) => {
  const job = ev.data;
  try {
    job.defs.forEach((def, i) => {
      const traj = new TrajectoryBaker(def, job.frames, job.opts[i]).runAll();
      scope.postMessage({ kind: 'track', i, traj }, traj.frames.map((f) => f.buffer as ArrayBuffer));
    });
    scope.postMessage({ kind: 'done' });
  } catch (error) {
    scope.postMessage({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
