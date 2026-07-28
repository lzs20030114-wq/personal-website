import { afterEach, describe, expect, it } from 'vitest';
import {
  passwordMatches,
  signSession,
  studioConfigured,
  studioSecret,
  verifySession,
} from './auth';

/** 门禁只有两件事要守住：签名不可伪造、过期即失效。 */
describe('studio 门禁', () => {
  const SECRET = 'test-secret-please-ignore';
  const NOW = 1_800_000_000_000;

  afterEach(() => {
    delete process.env.STUDIO_PASSWORD;
    delete process.env.STUDIO_SECRET;
  });

  it('签发的会话能验过', () => {
    const token = signSession(SECRET, NOW + 1000);
    expect(verifySession(SECRET, token, NOW)).toBe(true);
  });

  it('过期即失效', () => {
    const token = signSession(SECRET, NOW - 1);
    expect(verifySession(SECRET, token, NOW)).toBe(false);
  });

  it('改到期时间而不重签 = 验不过（签名覆盖到期时间）', () => {
    const token = signSession(SECRET, NOW - 1000);
    const forged = `${NOW + 999_999}.${token.split('.')[1]}`;
    expect(verifySession(SECRET, forged, NOW)).toBe(false);
  });

  it('换密钥 / 缺 token / 形状不对，一律不放行', () => {
    const token = signSession(SECRET, NOW + 1000);
    expect(verifySession('another-secret', token, NOW)).toBe(false);
    expect(verifySession(SECRET, undefined, NOW)).toBe(false);
    expect(verifySession(SECRET, '', NOW)).toBe(false);
    expect(verifySession(SECRET, 'no-dot', NOW)).toBe(false);
    expect(verifySession(SECRET, 'abc.def', NOW)).toBe(false);
    expect(verifySession(undefined, token, NOW)).toBe(false);
  });

  it('密码比较：空密码与未配置一律不通过', () => {
    expect(passwordMatches('', 'x')).toBe(false);
    expect(passwordMatches('x', undefined)).toBe(false);
    expect(passwordMatches('x', 'x')).toBe(true);
    expect(passwordMatches('x ', 'x')).toBe(false);
  });

  it('未配 STUDIO_PASSWORD 时视为未启用（页面会显示配置说明而不是编辑器）', () => {
    expect(studioConfigured()).toBe(false);
    expect(studioSecret()).toBeUndefined();
    process.env.STUDIO_PASSWORD = 'a-long-enough-password';
    expect(studioConfigured()).toBe(true);
    // 没配 STUDIO_SECRET 时由密码派生，且不等于密码本身
    expect(studioSecret()).toBeTypeOf('string');
    expect(studioSecret()).not.toBe('a-long-enough-password');
  });
});
