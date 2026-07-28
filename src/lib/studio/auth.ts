import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * /studio 的门禁：单人站，一个密码 + 一个 HMAC 签名的 httpOnly cookie（2026-07-28 拍板）。
 * 零依赖、零第三方服务；密码与签名密钥都只存在于 Vercel 的环境变量里，不进仓库。
 *
 * 关于强度的诚实说明：
 *   · cookie 是**签名**的，不是加密的——里面只有一个到期时间戳，没有任何秘密可泄。
 *   · 会话不可撤销（无服务端 session 表）。要立刻踢掉所有会话，就改 STUDIO_SECRET
 *     （或改密码——密钥缺省时由密码派生），之前发出的 cookie 立即全部失效。
 *   · 没有防暴力破解的持久计数器（serverless 无常驻内存）。所以密码要长：随机 24 位以上。
 */

export const STUDIO_COOKIE = 'studio_session';
/** 会话有效期 30 天：作者本人的私人后台，天天要求重登只会导致把密码写在便签上。 */
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export function studioPassword(): string | undefined {
  const raw = process.env.STUDIO_PASSWORD;
  return raw && raw.length > 0 ? raw : undefined;
}

/**
 * 签名密钥：优先 STUDIO_SECRET；没配就从密码派生（少配一个变量，代价是改密码即登出所有会话）。
 * 派生要经过 hash——不要把密码本身当 HMAC key 到处传。
 */
export function studioSecret(): string | undefined {
  const explicit = process.env.STUDIO_SECRET;
  if (explicit && explicit.length > 0) return explicit;
  const pw = studioPassword();
  return pw === undefined ? undefined : createHash('sha256').update(`studio:${pw}`).digest('hex');
}

/** 门禁是否已配置好（没配就别把编辑器渲染出来——那等于开门）。 */
export function studioConfigured(): boolean {
  return studioPassword() !== undefined;
}

function mac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** 定长比较：两边先各自 sha256，避免长度差异本身变成信息。 */
function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function passwordMatches(input: string, expected = studioPassword()): boolean {
  if (expected === undefined || input.length === 0) return false;
  return constantTimeEqual(input, expected);
}

/** cookie 值 = `到期毫秒.签名`。 */
export function signSession(secret: string, expiresAt: number): string {
  const exp = String(Math.floor(expiresAt));
  return `${exp}.${mac(secret, exp)}`;
}

export function verifySession(
  secret: string | undefined,
  token: string | undefined | null,
  now: number,
): boolean {
  if (!secret || !token) return false;
  const cut = token.lastIndexOf('.');
  if (cut <= 0) return false;
  const exp = token.slice(0, cut);
  const sig = token.slice(cut + 1);
  if (!/^\d+$/.test(exp)) return false;
  if (!constantTimeEqual(sig, mac(secret, exp))) return false;
  return Number(exp) > now;
}

/** 给 cookies().set 用的选项（生产环境走 https，所以 secure）。 */
export function sessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  };
}
