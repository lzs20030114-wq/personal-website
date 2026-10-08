/**
 * 事件日志（轮回机器_行为引擎spec.md §7）。
 *
 * 引擎读的事件流与写下的日志是同一条（盘点 §8：「行为引擎和实验日志读的是同一条事件流」）：
 * 传感事件原样记一条，引擎据此做出的响应、惊吓、自发动作、抓握迁移、生命阶段也各记一条。
 * 格式 JSON Lines，一行一条；首行是会话头（种子、人格顺序、步频），回放与固件对照都靠它。
 *
 * 同种子 + 同事件序列 ⇒ 日志逐字相同（守门测试第一条）。数值只在序列化时取整，
 * 引擎内部全程保留原精度。
 */

import type { Outcome } from './events';
import type { Phase } from './life';
import type { PersonaKey } from './persona';

export type LogValue = string | number | boolean | null;

export interface LogRecord {
  /** 本会话内递增编号；响应用 to 指回刺激的 id */
  id: number;
  /** 仿真秒（从第一世诞生起算） */
  t: number;
  /** 第几世（1 起） */
  life: number;
  persona: PersonaKey;
  phase: Phase;
  /** sensor = 传感事件 · engine = 引擎自己产生的 · operator = 台架操作（改生命钟倍率、跳段），不是被试的刺激 */
  src: 'sensor' | 'engine' | 'operator';
  /** 传感事件类别（九类之一）、引擎事件名或操作名（RATE / SKIP） */
  ev: string;
  /** 刺激强度（仅传感事件） */
  I?: number;
  /** 去向（仅传感事件） */
  out?: Outcome;
  /** 载荷 */
  p?: Record<string, LogValue>;
}

export const LOG_SCHEMA = 'reincarnation-machine/behavior-log';
export const LOG_VERSION = 1;

export interface LogHeader {
  schema: typeof LOG_SCHEMA;
  v: number;
  seed: number;
  order: readonly PersonaKey[];
  hz: number;
  /** 开场时的生命钟倍率；只在 ≠ 1 时出现（实验口径的会话头与 M1 逐字相同） */
  lifeRate?: number;
  /** 动作词汇：只在研究原型（2）时出现——它的随机数抽法与程序都不同，按会话头回放必须知道（现行会话头逐字不变） */
  vocab?: 2;
}

/** 取整到 d 位小数（去掉 -0，免得同一个量序列化出两种写法） */
const round = (n: number, d: number): number => {
  const k = 10 ** d;
  const v = Math.round(n * k) / k;
  return v === 0 ? 0 : v;
};

function roundValue(v: LogValue): LogValue {
  return typeof v === 'number' ? (Number.isFinite(v) ? round(v, 4) : null) : v;
}

/** 一条记录 → 一行 JSON。键顺序固定（JSON 对象按插入序输出），数值取整 */
export function formatRecord(r: LogRecord): string {
  const o: Record<string, unknown> = {
    id: r.id,
    t: round(r.t, 3),
    life: r.life,
    persona: r.persona,
    phase: r.phase,
    src: r.src,
    ev: r.ev,
  };
  if (r.I !== undefined) o.I = round(r.I, 3);
  if (r.out !== undefined) o.out = r.out;
  if (r.p !== undefined) {
    const p: Record<string, LogValue> = {};
    for (const [k, v] of Object.entries(r.p)) p[k] = roundValue(v);
    o.p = p;
  }
  return JSON.stringify(o);
}

export function sessionHeader(seed: number, order: readonly PersonaKey[], hz: number, lifeRate = 1, vocab: 1 | 2 = 1): LogHeader {
  const h: LogHeader = { schema: LOG_SCHEMA, v: LOG_VERSION, seed, order: [...order], hz };
  if (lifeRate !== 1) h.lifeRate = lifeRate;
  if (vocab === 2) h.vocab = 2;
  return h;
}

export function toJsonl(records: readonly LogRecord[], header?: LogHeader): string {
  const lines = records.map(formatRecord);
  if (header) lines.unshift(JSON.stringify(header));
  return lines.join('\n') + '\n';
}

/** 读回 JSONL（跳过会话头）。只做最小形状检查——日志是引擎写的，不是外来输入 */
export function parseJsonl(text: string): { header: LogHeader | null; records: LogRecord[] } {
  let header: LogHeader | null = null;
  const records: LogRecord[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const o = JSON.parse(line) as Record<string, unknown>;
    if (o.schema === LOG_SCHEMA) {
      header = o as unknown as LogHeader;
      continue;
    }
    if (typeof o.id !== 'number' || typeof o.t !== 'number' || typeof o.ev !== 'string') {
      throw new Error(`不是行为日志记录：${line.slice(0, 80)}`);
    }
    records.push(o as unknown as LogRecord);
  }
  return { header, records };
}
