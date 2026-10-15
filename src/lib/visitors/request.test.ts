import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptsVisit, parseVisitorFilters, publicVisitPath, readVisitBody, referrerOrigin, visitRecord } from './request';

afterEach(() => vi.unstubAllEnvs());
const request = (headers: Record<string, string> = {}) => new Request('https://portfolio.test/api/visits', {
  method: 'POST', headers: { origin: 'https://portfolio.test', 'content-type': 'application/json', ...headers },
});

describe('访客采集信任边界', () => {
  it('只接受已发布路由，去除查询/hash，拒绝后台、资源、草稿和外链', () => {
    expect(publicVisitPath('/work/example?token=secret#part', ['example'])).toBe('/work/example');
    expect(publicVisitPath('/archive/', [])).toBe('/archive');
    expect(publicVisitPath('/demo/', [])).toBe('/demo/index.html');
    expect(publicVisitPath('/demo', [])).toBe('/demo/index.html');
    for (const path of ['/studio', '/api/studio/visitors', '/work/draft', '//evil.test', '/log/pic.webp', '/archive\\secret']) {
      expect(publicVisitPath(path, ['example'])).toBeNull();
    }
  });
  it('来源仅保留域名，不记录密码、搜索词或路径', () => {
    expect(referrerOrigin('https://search.test/private?q=secret#fragment')).toBe('https://search.test');
    expect(referrerOrigin('https://name:password@search.test')).toBeNull();
    expect(referrerOrigin('javascript:alert(1)')).toBeNull();
  });
  it('拒绝跨站、预取、机器人和退出统计请求', () => {
    expect(acceptsVisit(request())).toBe(true);
    expect(acceptsVisit(new Request('http://localhost:3012/api/visits', { method: 'POST',
      headers: { host: '127.0.0.1:3012', origin: 'http://127.0.0.1:3012', 'content-type': 'application/json' },
    }))).toBe(true);
    const blocked: Record<string, string>[] = [{ origin: 'https://elsewhere.test' }, { 'sec-fetch-site': 'cross-site' },
      { dnt: '1' }, { 'sec-gpc': '1' }, { purpose: 'prefetch' }, { 'next-router-prefetch': '1' },
      { 'user-agent': 'Googlebot' }, { 'content-type': 'text/plain' }];
    for (const headers of blocked) {
      expect(acceptsVisit(request(headers))).toBe(false);
    }
  });
  it('本地忽略伪造IP/地域；Vercel只取平台IP，时间由服务端产生', () => {
    const payload = { id: 'd0caa861-801e-467d-98d4-0a4099cfecf4', path: '/', referrer: null };
    const headers = new Headers({ 'x-forwarded-for': '1.1.1.1', 'x-vercel-forwarded-for': '2001:db8::1',
      'x-vercel-ip-city': '%E5%8C%97%E4%BA%AC', 'x-vercel-ip-country': 'CN' });
    vi.stubEnv('VERCEL', '');
    expect(visitRecord(payload, '/', headers)).toMatchObject({ ip: null, city: null, country: null });
    vi.stubEnv('VERCEL', '1');
    expect(visitRecord(payload, '/', headers)).toMatchObject({ ip: '2001:db8::1', city: '北京', country: 'CN' });
    headers.set('x-vercel-forwarded-for', 'garbage, 1.1.1.1');
    expect(visitRecord(payload, '/', headers).ip).toBeNull();
    headers.set('x-vercel-ip-city', '%invalid');
    expect(visitRecord(payload, '/', headers).city).toBeNull();
  });
  it('拒绝不存在的日期、倒置范围及无界分页，支持IPv6', () => {
    for (const query of ['from=2026-02-30', 'from=2026-10-12&to=2026-10-01', 'page=-1', 'page=1e3', 'page=999999999', 'ip=unknown', 'path=/a?secret']) {
      expect(parseVisitorFilters(new URLSearchParams(query))).toBeNull();
    }
    expect(parseVisitorFilters(new URLSearchParams('ip=2001%3Adb8%3A%3A1&page=2'))).toMatchObject({ ip: '2001:db8::1', page: 2 });
  });
  it('没有Content-Length也限制实际读取体积', async () => {
    await expect(readVisitBody(new Request('https://portfolio.test/api/visits', { method: 'POST', body: 'x'.repeat(4097) }))).rejects.toThrow('Body too large');
  });
});
