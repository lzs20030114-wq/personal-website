import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryVisits, recordVisit, visitorStorageMode, VisitorRateLimitError } from './store';
import type { VisitorFilters, VisitorRecord } from './types';

const FILTERS: VisitorFilters = { from: '', to: '', ip: '', path: '', page: 1 };
const NOW = '2026-10-12T04:00:00.000Z';
let directory: string;
const makeRecord = (extra: Partial<VisitorRecord> = {}): VisitorRecord => ({
  id: randomUUID(), visitedAt: NOW, path: '/work/reincarnation-machine', ip: '203.0.113.10',
  country: 'SG', region: null, city: 'Singapore', referrer: 'https://example.org', ...extra,
});

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-visitors-test-'));
  vi.spyOn(process, 'cwd').mockReturnValue(directory);
  vi.stubEnv('VISITOR_SUPABASE_URL', '');
  vi.stubEnv('VISITOR_SUPABASE_SERVICE_ROLE_KEY', '');
  vi.stubEnv('VISITOR_LOCAL_ENABLED', '1');
  vi.stubEnv('VERCEL', '');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)
    || !path.basename(directory).startsWith('portfolio-visitors-test-')) throw new Error('Unexpected test directory');
  await fs.rm(directory, { recursive: true, force: true });
});

async function writeFixture(records: VisitorRecord[]) {
  await fs.mkdir(path.join(directory, '.local'), { recursive: true });
  await fs.writeFile(path.join(directory, '.local', 'visitors.json'), JSON.stringify(records));
}

describe('访客本地持久存储', () => {
  it('必须显式启用；Vercel 缺数据库时关闭，不回退到临时盘', async () => {
    vi.stubEnv('VISITOR_LOCAL_ENABLED', '');
    expect(visitorStorageMode()).toBe('disabled');
    await recordVisit(makeRecord());
    await expect(queryVisits(FILTERS)).rejects.toThrow('尚未配置');
    vi.stubEnv('VISITOR_LOCAL_ENABLED', '1');
    vi.stubEnv('VERCEL', '1');
    expect(visitorStorageMode()).toBe('disabled');
    await recordVisit(makeRecord());
    await expect(fs.access(path.join(directory, '.local'))).rejects.toThrow();
  });

  it('并发写入不丢数据，同一事件重试幂等，模块重载后仍从磁盘读取', async () => {
    const events = Array.from({ length: 20 }, () => makeRecord());
    await Promise.all([...events, events[0], events[1]].map(recordVisit));
    vi.resetModules();
    const reloaded = await import('./store');
    const result = await reloaded.queryVisits(FILTERS);
    expect(result.total).toBe(20);
    expect(new Set(result.records.map((record) => record.id))).toEqual(new Set(events.map((record) => record.id)));
    expect(result.uniqueIps).toBe(1);
    expect(JSON.parse(await fs.readFile(path.join(directory, '.local', 'visitors.json'), 'utf8'))).toHaveLength(20);
  });

  it('访问时间来自服务端，客户端传入过去或未来时间不能改变记录时间', async () => {
    await recordVisit(makeRecord({ visitedAt: '2040-01-01T00:00:00.000Z' }));
    expect((await queryVisits(FILTERS)).records[0].visitedAt).toBe(NOW);
  });

  it('UTC+8 日历日期包含零点与当天末尾，排除相邻两天', async () => {
    const times = ['2026-10-10T15:59:59.999Z', '2026-10-10T16:00:00.000Z', '2026-10-11T15:59:59.999Z', '2026-10-11T16:00:00.000Z'];
    await writeFixture(times.map((visitedAt) => makeRecord({ visitedAt })));
    const result = await queryVisits({ ...FILTERS, from: '2026-10-11', to: '2026-10-11' });
    expect(result.records.map((record) => record.visitedAt)).toEqual([times[2], times[1]]);
    expect(result.total).toBe(2);
  });

  it('组合 IP 与路径精确筛选，独立 IP 不把未知来源算成人', async () => {
    await writeFixture([
      makeRecord({ path: '/about', ip: '203.0.113.1' }),
      makeRecord({ path: '/about', ip: '203.0.113.10' }),
      makeRecord({ path: '/about', ip: null }),
      makeRecord({ path: '/archive', ip: '203.0.113.1' }),
    ]);
    expect(await queryVisits({ ...FILTERS, path: '/about', ip: '203.0.113.1' })).toMatchObject({ total: 1, uniqueIps: 1 });
    expect(await queryVisits({ ...FILTERS, path: '/about' })).toMatchObject({ total: 3, uniqueIps: 2 });
    expect(await queryVisits({ ...FILTERS, path: '/abo' })).toMatchObject({ total: 0, uniqueIps: 0 });
  });

  it('按时间与 UUID 稳定分页，每页 50 条，翻页不重复且总数保持全筛选集', async () => {
    const records = Array.from({ length: 117 }, (_, i) => makeRecord({
      id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`,
      visitedAt: i < 100 ? NOW : '2026-10-11T04:00:00.000Z',
      ip: i % 2 === 0 ? '203.0.113.1' : '203.0.113.2',
    }));
    await writeFixture(records);
    const pages = await Promise.all([1, 2, 3].map((page) => queryVisits({ ...FILTERS, page })));
    expect(pages.map((page) => page.records.length)).toEqual([50, 50, 17]);
    expect(pages.every((page) => page.total === 117 && page.uniqueIps === 2 && page.pageSize === 50)).toBe(true);
    const all = pages.flatMap((page) => page.records);
    expect(new Set(all.map((record) => record.id)).size).toBe(117);
    expect(all[0].id).toBe(records[99].id);
    expect(all[100].id).toBe(records[116].id);
  });

  it('30 天留存会真正删除磁盘里的过期记录，边界当天仍保留', async () => {
    const boundary = new Date(Date.parse(NOW) - 30 * 86_400_000).toISOString();
    await writeFixture([
      makeRecord({ visitedAt: new Date(Date.parse(boundary) - 1).toISOString() }),
      makeRecord({ visitedAt: boundary }), makeRecord(),
    ]);
    expect((await queryVisits(FILTERS)).total).toBe(2);
    const stored: VisitorRecord[] = JSON.parse(await fs.readFile(path.join(directory, '.local', 'visitors.json'), 'utf8'));
    expect(stored).toHaveLength(2);
    expect(stored.every((record) => Date.parse(record.visitedAt) >= Date.parse(boundary))).toBe(true);
  });

  it('每 IP 滚动一分钟最多 60 次；幂等重试免计数，其他 IP 独立计数', async () => {
    const records = Array.from({ length: 60 }, () => makeRecord());
    await writeFixture(records);
    await recordVisit(records[0]);
    await expect(recordVisit(makeRecord())).rejects.toBeInstanceOf(VisitorRateLimitError);
    await recordVisit(makeRecord({ ip: '203.0.113.11' }));
    vi.setSystemTime(new Date(Date.parse(NOW) + 60_000));
    await recordVisit(makeRecord());
    expect((await queryVisits(FILTERS)).total).toBe(62);
  });

  it('无效输入被拒绝，文件损坏不会被静默覆盖', async () => {
    await expect(recordVisit(makeRecord({ path: '//example.org' }))).rejects.toThrow('格式');
    await expect(queryVisits({ ...FILTERS, from: '2026-02-30' })).rejects.toThrow('日期不存在');
    await expect(queryVisits({ ...FILTERS, from: '2026-10-12', to: '2026-10-11' })).rejects.toThrow('开始日期');
    await expect(queryVisits({ ...FILTERS, ip: 'bad-ip' })).rejects.toThrow('IP');
    await expect(queryVisits({ ...FILTERS, page: 0 })).rejects.toThrow('页码');
    await fs.mkdir(path.join(directory, '.local'));
    await fs.writeFile(path.join(directory, '.local', 'visitors.json'), 'not json');
    await expect(recordVisit(makeRecord())).rejects.toThrow('无法读取');
    expect(await fs.readFile(path.join(directory, '.local', 'visitors.json'), 'utf8')).toBe('not json');
  });
});

describe('Supabase 服务端 RPC', () => {
  beforeEach(() => {
    vi.stubEnv('VISITOR_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VISITOR_SUPABASE_SERVICE_ROLE_KEY', 'test-server-only-key');
  });

  it('只发服务端字段且不发送客户端时间；写入未确认不得当作成功', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(true));
    vi.stubGlobal('fetch', request);
    const event = makeRecord();
    await recordVisit(event);
    const [url, init] = request.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/rest/v1/rpc/portfolio_record_visit');
    expect(JSON.parse(init.body as string)).toMatchObject({ p_id: event.id, p_ip: event.ip, p_path: event.path });
    expect(init.body).not.toContain('visitedAt');
    expect(init.cache).toBe('no-store');
    request.mockResolvedValue(Response.json(false));
    await expect(recordVisit(makeRecord())).rejects.toBeInstanceOf(VisitorRateLimitError);
    request.mockResolvedValue(Response.json(null));
    await expect(recordVisit(makeRecord())).rejects.toThrow('无效的写入');
  });

  it('查询将 UTC+8 日期转换成 UTC 半开区间并验证结果结构', async () => {
    const result = { records: [], total: 0, uniqueIps: 0, page: 2, pageSize: 50 };
    const request = vi.fn().mockResolvedValue(Response.json(result));
    vi.stubGlobal('fetch', request);
    expect(await queryVisits({ ...FILTERS, from: '2026-10-11', to: '2026-10-12', page: 2 })).toEqual(result);
    const body = JSON.parse(request.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ p_from: '2026-10-10T16:00:00.000Z', p_to: '2026-10-12T16:00:00.000Z', p_page: 2 });
    request.mockResolvedValue(Response.json({ ...result, uniqueIps: 10 }));
    await expect(queryVisits({ ...FILTERS, page: 2 })).rejects.toThrow('无效的查询');
  });

  it('HTTP 拒绝与连接错误不泄露供应商响应，绝不回退本地写入', async () => {
    const request = vi.fn().mockResolvedValue(new Response('private SQL and IP detail', { status: 403 }));
    vi.stubGlobal('fetch', request);
    await expect(recordVisit(makeRecord())).rejects.toThrow('HTTP 403');
    await expect(queryVisits(FILTERS)).rejects.not.toThrow('private SQL');
    request.mockRejectedValue(new Error('network secret detail'));
    await expect(recordVisit(makeRecord())).rejects.toThrow('访客数据库连接失败');
    await expect(fs.access(path.join(directory, '.local'))).rejects.toThrow();
  });
});
