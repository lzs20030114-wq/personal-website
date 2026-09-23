import { createSkinUnit } from '../../src/lib/space/skin-unit';
import type { SkinTerminalInput, SkinTerminalResult } from '../../src/lib/space/skin-terminal';

interface WorkerRequest {
  id: number;
  inputs: SkinTerminalInput[];
}

interface WorkerResponse {
  id: number;
  result?: SkinTerminalResult;
  error?: string;
}

type WorkerPort = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

const port = globalThis as unknown as WorkerPort;

/**
 * 单核手机上 Worker 与页面仍然争同一个 CPU。连续跑完整个协议虽不堵 JS 主线程，
 * 仍会让合成与输入抢不到时间；因此每小片求解后主动让出 4ms。画面没有中间态，
 * 多等一点只影响“计算中”的时长，不影响跳过语义。
 */
async function solveCooperatively(inputs: SkinTerminalInput[]): Promise<SkinTerminalResult> {
  const units = inputs.map(({ spec, opts }) => createSkinUnit(spec, opts));
  let tick = 0;
  while (units.some((unit) => !unit.done)) {
    const until = performance.now() + 6;
    do {
      tick++;
      for (let i = 0; i < units.length; i++)
        if (tick > (inputs[i].delay ?? 0)) units[i].advance();
    } while (units.some((unit) => !unit.done) && performance.now() < until);
    if (units.some((unit) => !unit.done))
      await new Promise<void>((resolve) => setTimeout(resolve, 4));
  }
  return { tick, states: units.map((unit) => unit.terminalState()) };
}

let queue = Promise.resolve();
port.onmessage = ({ data }) => {
  // 多台同时点「跳过」时串行求解；并行任务会在手机上把所有核一起吃满，页面反而卡。
  queue = queue.then(async () => {
  try {
    const result = await solveCooperatively(data.inputs);
    const transfer = result.states.flatMap((state) => [state.px.buffer, state.py.buffer]);
    port.postMessage({ id: data.id, result }, transfer);
  } catch (error) {
    port.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) });
  }
  });
};

export {};
