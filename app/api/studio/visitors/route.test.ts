import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signSession, studioSecret, STUDIO_COOKIE } from '../../../../src/lib/studio/auth';
import { GET } from './route';
const store = vi.hoisted(() => ({ queryVisits: vi.fn(), visitorStorageMode: vi.fn() }));
vi.mock('../../../../src/lib/visitors/store', () => store);
beforeEach(() => {
  vi.stubEnv('STUDIO_PASSWORD', 'test-only-password-not-production');
  vi.stubEnv('STUDIO_SECRET', '');
  store.queryVisits.mockReset(); store.visitorStorageMode.mockReturnValue('local');
});
afterEach(() => vi.unstubAllEnvs());
const req = (token?: string, query = '') => new Request(`https://portfolio.test/api/studio/visitors${query}`, {
  headers: token ? { cookie: `${STUDIO_COOKIE}=${token}` } : {},
});

describe('私有访客查询', () => {
  it('匿名、伪造和过期cookie都在读库前拒绝，响应禁止缓存', async () => {
    for (const token of [undefined, 'fake', signSession(studioSecret()!, Date.now() - 1)]) {
      const response = await GET(req(token));
      expect(response.status).toBe(401);
      expect(response.headers.get('cache-control')).toContain('no-store');
    }
    expect(store.queryVisits).not.toHaveBeenCalled();
  });
  it('已登录可查询，配置缺失与故障不冒充零访问', async () => {
    const token = signSession(studioSecret()!, Date.now() + 60000);
    const data = { records: [], total: 0, uniqueIps: 0, page: 1, pageSize: 50 };
    store.queryVisits.mockResolvedValue(data);
    expect(await (await GET(req(token))).json()).toEqual({ mode: 'local', data });
    store.visitorStorageMode.mockReturnValue('disabled');
    expect(await (await GET(req(token))).json()).toEqual({ mode: 'disabled' });
    store.visitorStorageMode.mockReturnValue('supabase');
    store.queryVisits.mockRejectedValue(new Error('database secret must not leak'));
    const failed = await GET(req(token));
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('secret must not leak');
  });
});
