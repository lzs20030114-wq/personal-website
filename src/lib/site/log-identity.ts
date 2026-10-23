import type { LogEntry } from './log-schema';

export type IdentifiedLogEntry = LogEntry & { id: string };

/**
 * 新日志的身份与日期编辑、排序和删除无关。保留已有 URL 的形状，后半段不再是当日名次。
 * 使用 52 位随机数并避开旧的短序号；与当前池及恢复基线去重，删除旧条目不会复用它的地址。
 * getRandomValues 在非安全上下文也可用，既适用于本地 Studio，也适用于服务端兼容旧客户端。
 */
export function createLogEntryId(date: string, usedIds: Iterable<string> = []): string {
  const used = new Set(usedIds);
  for (let attempt = 0; attempt < 32; attempt++) {
    const words = globalThis.crypto.getRandomValues(new Uint32Array(2));
    const serial = 1_000_000_000 + (words[0] & 0xfffff) * 0x100000000 + words[1];
    const id = `log-${date}-${serial}`;
    if (!used.has(id)) return id;
  }
  throw new Error('无法为新日志生成唯一身份，请重试；现有草稿未改动。');
}

/**
 * 只用于读取当前线上基线或迁移完整旧池：把当时的公开 URL 固定下来。
 * 旧草稿可能已删除、改日期或插入条目，必须走 restoreLogEntryIds，不能按它的当前位置迁移。
 */
export function ensureLogEntryIds(entries: readonly LogEntry[]): IdentifiedLogEntry[] {
  const used = new Set(entries.flatMap((entry) => entry.id ? [entry.id] : []));
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    let serial = (seen.get(entry.date) ?? 0) + 1;
    seen.set(entry.date, serial);
    if (entry.id) return entry as IdentifiedLogEntry;
    while (used.has(`log-${entry.date}-${serial}`)) serial++;
    const id = `log-${entry.date}-${serial}`;
    used.add(id);
    seen.set(entry.date, serial);
    return { ...entry, id };
  });
}

const sameText = (a: LogEntry['lead'], b: LogEntry['lead']) =>
  a.en === b.en && a.zh === b.zh && Boolean(a.en.trim() || a.zh.trim());

/**
 * 兼容无 id 的本地草稿/旧客户端：只以唯一的既有内容认回身份，不按新日期或数组下标猜。
 * 引句或正文任一双语字段完整未改，就能认回改日期、改标签或改另一字段的旧条目。
 * 无对应内容且所有旧身份都已认回时才视为新增；否则可能是完全改写的旧条目，拒绝猜测。
 * 对应多条或重复认领同一条也拒绝恢复，由调用方保留草稿。
 * 已带 id 的新格式条目原样保留（已发布条目的身份不因另一次内容修改而重算）。
 */
export function restoreLogEntryIds(
  entries: readonly LogEntry[],
  baseline: readonly LogEntry[],
): IdentifiedLogEntry[] {
  const reference = ensureLogEntryIds(baseline);
  const used = new Set(reference.map((entry) => entry.id));
  const claimed = new Set<string>();
  for (const entry of entries) {
    if (!entry.id) continue;
    if (claimed.has(entry.id)) throw new Error(`草稿中的日志身份 ${entry.id} 重复；草稿已保留，请核对后再恢复。`);
    claimed.add(entry.id);
    used.add(entry.id);
  }
  const matched = entries.map((entry): IdentifiedLogEntry | null => {
    if (entry.id) return entry as IdentifiedLogEntry;
    const unchanged = reference.filter((prior) => prior.date === entry.date && sameText(prior.lead, entry.lead) && sameText(prior.body, entry.body));
    const candidates = unchanged.length ? unchanged : reference.filter((prior) => sameText(prior.lead, entry.lead) || sameText(prior.body, entry.body));
    if (candidates.length > 1 || (candidates.length === 1 && claimed.has(candidates[0].id))) {
      throw new Error(`${entry.date} 的旧草稿无法唯一对应已有日志；草稿已保留，请核对引句和正文后再恢复。`);
    }
    if (!candidates.length) return null;
    const id = candidates[0].id;
    claimed.add(id);
    used.add(id);
    return { ...entry, id };
  });
  if (matched.some((entry) => entry === null) && reference.some((entry) => !claimed.has(entry.id))) {
    throw new Error('旧草稿里有无法对应的条目，且部分旧日志不在原位置或已被改写；无法区分新增、删除与重写。草稿已保留，请先核对这些条目再恢复。');
  }
  return matched.map((entry, i) => {
    if (entry) return entry;
    const id = createLogEntryId(entries[i].date, used);
    used.add(id);
    return { ...entries[i], id };
  });
}
