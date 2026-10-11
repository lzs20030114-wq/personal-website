import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { VisitorFilters, VisitorRecord, VisitorResult } from './types';

export const VISITOR_PAGE_SIZE = 50;
export const VISITOR_RETENTION_DAYS = 30;
const RETENTION_MS = VISITOR_RETENTION_DAYS * 86_400_000;
const MAX_PER_MINUTE = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class VisitorStorageError extends Error {}
export class VisitorRateLimitError extends VisitorStorageError {
  constructor() { super('访问记录过于频繁，请稍后重试'); }
}

export function visitorStorageMode(): 'supabase' | 'local' | 'disabled' {
  if (process.env.VISITOR_SUPABASE_URL && process.env.VISITOR_SUPABASE_SERVICE_ROLE_KEY) return 'supabase';
  if (process.env.VISITOR_LOCAL_ENABLED === '1' && !process.env.VERCEL) return 'local';
  return 'disabled';
}

function canonicalIp(value: string | null): string | null {
  if (value === null) return null;
  if (isIP(value) === 4) return value;
  if (isIP(value) === 6) return new URL(`http://[${value}]/`).hostname.slice(1, -1);
  throw new VisitorStorageError('IP 地址格式不正确');
}

function validPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && value.length <= 512
    && !/[\u0000-\u0020?#\\]/.test(value);
}

function validateRecord(record: VisitorRecord): VisitorRecord {
  if (!record || !UUID.test(record.id) || typeof record.path !== 'string' || !validPath(record.path)) {
    throw new VisitorStorageError('访问记录格式不正确');
  }
  for (const key of ['country', 'region', 'city', 'referrer'] as const) {
    const value = record[key];
    if (value !== null && (typeof value !== 'string' || value.length > (key === 'referrer' ? 512 : 128))) {
      throw new VisitorStorageError('访问来源字段格式不正确');
    }
  }
  if (typeof record.visitedAt !== 'string' || !Number.isFinite(Date.parse(record.visitedAt))) {
    throw new VisitorStorageError('访问时间格式不正确');
  }
  return { ...record, id: record.id.toLowerCase(), ip: canonicalIp(record.ip) };
}

/** 同一个本地进程内串行读写；热重载也复用队列，原子替换避免半截 JSON。 */
const localQueues = (globalThis as typeof globalThis & {
  __portfolioVisitorQueues?: Map<string, Promise<unknown>>;
}).__portfolioVisitorQueues ??= new Map<string, Promise<unknown>>();

function localFile(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), '.local', 'visitors.json');
}

async function withLocalStore<T>(operation: (records: VisitorRecord[], file: string) => Promise<T>): Promise<T> {
  const file = localFile();
  const previous = localQueues.get(file) ?? Promise.resolve();
  const pending = previous.catch(() => {}).then(async () => {
    let records: VisitorRecord[];
    try {
      const content: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!Array.isArray(content)) throw new Error('invalid shape');
      records = content.map((record: VisitorRecord) => validateRecord(record));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new VisitorStorageError('本地访问记录无法读取，请检查 .local/visitors.json');
      }
      records = [];
    }
    const fresh = records.filter((record) => Date.parse(record.visitedAt) >= Date.now() - RETENTION_MS);
    if (fresh.length !== records.length) await writeLocal(file, fresh);
    return operation(fresh, file);
  });
  localQueues.set(file, pending);
  try { return await pending; }
  finally { if (localQueues.get(file) === pending) localQueues.delete(file); }
}

async function writeLocal(file: string, records: VisitorRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(records), { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
}

async function rpc<T>(name: string, payload: object): Promise<T> {
  const rawUrl = process.env.VISITOR_SUPABASE_URL!;
  let origin: URL;
  try { origin = new URL(rawUrl); }
  catch { throw new VisitorStorageError('VISITOR_SUPABASE_URL 格式不正确'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash
      || (origin.pathname !== '/' && origin.pathname !== '')) {
    throw new VisitorStorageError('VISITOR_SUPABASE_URL 必须是 HTTPS 项目根地址');
  }
  const key = process.env.VISITOR_SUPABASE_SERVICE_ROLE_KEY!;
  let response: Response;
  try {
    response = await fetch(new URL(`/rest/v1/rpc/${name}`, origin), {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new VisitorStorageError('访客数据库连接失败');
  }
  // 不转发服务商响应正文，以免配置或 SQL 细节流向公开采集接口。
  if (!response.ok) throw new VisitorStorageError(`访客数据库请求失败（HTTP ${response.status}）`);
  try { return await response.json() as T; }
  catch { throw new VisitorStorageError('访客数据库返回了无法读取的数据'); }
}

export async function recordVisit(input: VisitorRecord): Promise<void> {
  const mode = visitorStorageMode();
  if (mode === 'disabled') return;
  const record = validateRecord(input);
  if (mode === 'supabase') {
    const accepted = await rpc<boolean>('portfolio_record_visit', {
      p_id: record.id, p_path: record.path, p_ip: record.ip, p_country: record.country,
      p_region: record.region, p_city: record.city, p_referrer: record.referrer,
    });
    if (accepted === false) throw new VisitorRateLimitError();
    if (accepted !== true) throw new VisitorStorageError('访客数据库返回了无效的写入结果');
    return;
  }
  await withLocalStore(async (records, file) => {
    if (records.some((existing) => existing.id === record.id)) return;
    const now = Date.now();
    if (records.filter((existing) => existing.ip === record.ip && Date.parse(existing.visitedAt) > now - 60_000).length >= MAX_PER_MINUTE) {
      throw new VisitorRateLimitError();
    }
    await writeLocal(file, [...records, { ...record, visitedAt: new Date(now).toISOString() }]);
  });
}

function dayBoundary(value: string, end: boolean): string | null {
  if (value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new VisitorStorageError('日期格式应为 YYYY-MM-DD');
  const utc = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) {
    throw new VisitorStorageError('日期不存在');
  }
  return new Date(utc - 8 * 3_600_000 + (end ? 86_400_000 : 0)).toISOString();
}

export async function queryVisits(filters: VisitorFilters): Promise<VisitorResult> {
  const mode = visitorStorageMode();
  if (mode === 'disabled') throw new VisitorStorageError('尚未配置访客数据库');
  const from = dayBoundary(filters.from, false);
  const to = dayBoundary(filters.to, true);
  if (from && to && from >= to) throw new VisitorStorageError('开始日期不能晚于结束日期');
  const ip = filters.ip ? canonicalIp(filters.ip) : null;
  if (filters.path && !validPath(filters.path)) throw new VisitorStorageError('页面路径格式不正确');
  if (!Number.isSafeInteger(filters.page) || filters.page < 1 || filters.page > 1_000_000) {
    throw new VisitorStorageError('页码不正确');
  }
  if (mode === 'supabase') {
    const result = await rpc<VisitorResult>('portfolio_query_visits', {
      p_from: from, p_to: to, p_ip: ip, p_path: filters.path || null, p_page: filters.page,
    });
    if (!result || !Array.isArray(result.records) || result.records.length > VISITOR_PAGE_SIZE
      || !Number.isSafeInteger(result.total) || result.total < 0
      || !Number.isSafeInteger(result.uniqueIps) || result.uniqueIps < 0 || result.uniqueIps > result.total
      || result.page !== filters.page || result.pageSize !== VISITOR_PAGE_SIZE) {
      throw new VisitorStorageError('访客数据库返回了无效的查询结果');
    }
    return { ...result, records: result.records.map(validateRecord) };
  }
  return withLocalStore(async (records) => {
    const matched = records.filter((record) => {
      const time = Date.parse(record.visitedAt);
      return (!from || time >= Date.parse(from)) && (!to || time < Date.parse(to))
        && (!ip || record.ip === ip) && (!filters.path || record.path === filters.path);
    }).sort((a, b) => Date.parse(b.visitedAt) - Date.parse(a.visitedAt) || b.id.localeCompare(a.id));
    return {
      records: matched.slice((filters.page - 1) * VISITOR_PAGE_SIZE, filters.page * VISITOR_PAGE_SIZE),
      total: matched.length,
      uniqueIps: new Set(matched.map((record) => record.ip).filter((value) => value !== null)).size,
      page: filters.page, pageSize: VISITOR_PAGE_SIZE,
    };
  });
}
