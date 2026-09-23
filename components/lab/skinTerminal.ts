import type {
  SkinTerminalInput,
  SkinTerminalResult,
} from '../../src/lib/space/skin-terminal';

interface WorkerResponse {
  id: number;
  result?: SkinTerminalResult;
  error?: string;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (result: SkinTerminalResult) => void; reject: (error: Error) => void }
>();
const cache = new Map<string, Promise<SkinTerminalResult>>();
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

function objectId(value: object | undefined): number {
  if (!value) return 0;
  const hit = objectIds.get(value);
  if (hit) return hit;
  const id = nextObjectId++;
  objectIds.set(value, id);
  return id;
}

/**
 * 规格通常含几百个键对。用 JSON.stringify 做缓存键会在点击后的主线程把整份键谱
 * 再遍历一遍，重台架上这一步本身就能卡住输入；对象身份足够表达当前组件里的离散档。
 */
function cacheKey(inputs: readonly SkinTerminalInput[]): string {
  return inputs
    .map(({ spec, opts, delay }) => `${objectId(spec)}:${objectId(opts)}:${delay ?? 0}`)
    .join('|');
}

function workerForTerminal(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./skinTerminal.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
    const task = pending.get(data.id);
    if (!task) return;
    pending.delete(data.id);
    if (data.result) task.resolve(data.result);
    else task.reject(new Error(data.error ?? 'Skin terminal worker failed'));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Skin terminal worker failed');
    for (const task of pending.values()) task.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

/**
 * 同一规格只算一次。求解全在 Worker 中跑，主线程只在结果返回时提交一次终态，所以
 * 用户不会再看到快进过程，滚动与控制条也不会被 28ms 的逐帧计算堵住。
 */
export function requestSkinTerminal(
  inputs: readonly SkinTerminalInput[],
): Promise<SkinTerminalResult> {
  const key = cacheKey(inputs);
  const hit = cache.get(key);
  if (hit) return hit;

  const id = nextId++;
  const task = new Promise<SkinTerminalResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    workerForTerminal().postMessage({ id, inputs });
  });
  cache.set(key, task);
  task.catch(() => cache.delete(key));
  return task;
}
