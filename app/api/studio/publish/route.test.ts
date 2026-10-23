import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { signSession, STUDIO_COOKIE } from '../../../../src/lib/studio/auth';
import { loadPool, publishFiles } from '../../../../src/lib/studio/repo';
import { getLogEntries } from '../../../../src/lib/site/log';
import type { LogEntry } from '../../../../src/lib/site/log-schema';
import { LOG_JSON_PATH } from '../../../../src/lib/studio/publish';
import { POST } from './route';

const session = vi.hoisted(() => ({ token: '' }));
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (name: string) => name === STUDIO_COOKIE && session.token ? { value: session.token } : undefined,
}) }));
vi.mock('../../../../src/lib/studio/repo', async (original) => ({
  ...await original<typeof import('../../../../src/lib/studio/repo')>(),
  loadPool: vi.fn(), publishFiles: vi.fn(),
}));
const baseline = getLogEntries().slice(0, 2);
const withoutId = ({ id: _id, ...entry }: LogEntry): LogEntry => entry;
const request = (body: unknown) => new Request('https://example.test/api/studio/publish', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STUDIO_PASSWORD', 'test-only-password');
  vi.stubEnv('STUDIO_SECRET', 'test-only-secret');
  session.token = signSession('test-only-secret', Date.now() + 60000);
  vi.mocked(loadPool).mockResolvedValue({ entries: baseline, sha: 'sha-current', source: 'github', images: [] });
  vi.mocked(publishFiles).mockResolvedValue({ mode: 'github', url: null, files: 1, entriesSha: 'sha-published' });
});
afterEach(() => vi.unstubAllEnvs());

describe('Studio 发布接口', () => {
  it('未登录不能读取或写入内容池', async () => {
    session.token = '';
    const response = await POST(request({ entries: baseline, baseSha: 'sha-current' }));
    expect(response.status).toBe(401);
    expect(loadPool).not.toHaveBeenCalled();
    expect(publishFiles).not.toHaveBeenCalled();
  });

  it('旧客户端删除同日第一条并改日期时，保留剩余日志原 ID 和客户端并发基准', async () => {
    const entry = { ...withoutId(baseline[1]), date: '2026-10-09' };
    const response = await POST(request({ entries: [entry], baseSha: 'sha-client-loaded' }));
    expect(response.status).toBe(200);
    const [files, , baseSha] = vi.mocked(publishFiles).mock.calls[0];
    const saved = JSON.parse(files.find((file) => file.path === LOG_JSON_PATH)!.content) as LogEntry[];
    expect(saved[0].id).toBe(baseline[1].id);
    expect(saved[0].date).toBe('2026-10-09');
    expect(baseSha).toBe('sha-client-loaded');
  });

  it('旧草稿无法唯一认回身份时返回明确错误，不提交不猜序号', async () => {
    vi.mocked(loadPool).mockResolvedValue({ entries: [baseline[0], {
      ...baseline[0], id: baseline[1].id, lead: { en: 'Another lead.', zh: '另一条引句。' },
    }], sha: 'sha-current', source: 'github', images: [] });
    const entry = { ...withoutId(baseline[0]), lead: { en: 'Edited lead.', zh: '修改后的引句。' } };
    const response = await POST(request({ entries: [entry], baseSha: 'sha-current' }));
    expect(response.status).toBe(400);
    expect((await response.json()).errors.join()).toContain('无法唯一对应');
    expect(publishFiles).not.toHaveBeenCalled();
  });

  it('新上传图片不能覆盖服务端仓库名单中的同名文件', async () => {
    vi.mocked(loadPool).mockResolvedValue({ entries: baseline, sha: 'sha-current', source: 'github', images: ['existing.webp'] });
    const entry: LogEntry = { ...baseline[0], blocks: [{
      kind: 'image', src: '/log/existing.webp', alt: { en: 'Image', zh: '图片' }, width: 10, height: 10,
    }] };
    const response = await POST(request({ entries: [entry], baseSha: 'sha-current',
      images: [{ name: 'existing.webp', dataBase64: 'AAAA' }],
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).errors.join()).toContain('文件名已被占用');
    expect(publishFiles).not.toHaveBeenCalled();
  });

  it('合法 JSON 但非对象的请求返回 400', async () => {
    const response = await POST(request(null));
    expect(response.status).toBe(400);
    expect(publishFiles).not.toHaveBeenCalled();
  });
});
