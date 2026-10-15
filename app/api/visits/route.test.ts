import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STUDIO_COOKIE, signSession, studioSecret } from '../../../src/lib/studio/auth';
import { POST } from './route';
const store = vi.hoisted(() => ({ recordVisit: vi.fn(), visitorStorageMode: vi.fn() }));
vi.mock('../../../src/lib/visitors/store', async (original) => ({
  ...await original<typeof import('../../../src/lib/visitors/store')>(), ...store,
}));
vi.mock('../../../src/lib/site/content', () => ({ getRoutableWork: () => [{ slug: 'example' }] }));
beforeEach(() => {
  vi.stubEnv('STUDIO_PASSWORD', 'test-only-password-not-production'); vi.stubEnv('STUDIO_SECRET', '');
  vi.stubEnv('VERCEL', '');
  store.recordVisit.mockReset().mockResolvedValue(undefined); store.visitorStorageMode.mockReturnValue('local');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function req(path = '/', headers: Record<string, string> = {}) {
  return new Request('https://portfolio.test/api/visits', {
    method: 'POST', headers: { origin: 'https://portfolio.test', 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ id: 'd0caa861-801e-467d-98d4-0a4099cfecf4', path }),
  });
}
describe('访客写入接口', () => {
  it('公开页面落库；后台路径、跨站请求和作者本人不落库', async () => {
    expect((await POST(req('/work/example?private=secret'))).status).toBe(204);
    expect(store.recordVisit).toHaveBeenCalledWith(expect.objectContaining({ path: '/work/example', ip: null }));
    store.recordVisit.mockClear();
    expect((await POST(req('/studio'))).status).toBe(400);
    await POST(req('/', { origin: 'https://elsewhere.test' }));
    await POST(req('/', { cookie: `${STUDIO_COOKIE}=${signSession(studioSecret()!, Date.now() + 60000)}` }));
    expect(store.recordVisit).not.toHaveBeenCalled();
  });
  it('preview不污染生产库，未启用时不写，故障不给前台泄露内部消息', async () => {
    vi.stubEnv('VERCEL', '1'); vi.stubEnv('VERCEL_ENV', 'preview');
    await POST(req()); expect(store.recordVisit).not.toHaveBeenCalled();
    vi.stubEnv('VERCEL_ENV', 'production'); store.visitorStorageMode.mockReturnValue('disabled');
    await POST(req()); expect(store.recordVisit).not.toHaveBeenCalled();
    store.visitorStorageMode.mockReturnValue('supabase'); store.recordVisit.mockRejectedValue(new Error('secret'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failed = await POST(req()); expect(failed.status).toBe(503); expect(await failed.text()).toBe('');
  });
});
