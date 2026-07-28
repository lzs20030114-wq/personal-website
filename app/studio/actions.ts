'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_MS,
  STUDIO_COOKIE,
  passwordMatches,
  sessionCookieOptions,
  signSession,
  studioSecret,
} from '../../src/lib/studio/auth';

export type LoginState = { error?: string } | null;

/** 登录：密码对上就发一个 30 天有效的签名 cookie。密码错就慢 400ms 再答——聊胜于无的减速带。 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get('password') ?? '');
  const secret = studioSecret();
  if (secret === undefined) return { error: '服务端未配置 STUDIO_PASSWORD' };
  if (!passwordMatches(password)) {
    await new Promise((r) => setTimeout(r, 400));
    return { error: '密码不对' };
  }
  const expires = Date.now() + SESSION_MS;
  const jar = await cookies();
  jar.set(STUDIO_COOKIE, signSession(secret, expires), sessionCookieOptions(expires));
  redirect('/studio');
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(STUDIO_COOKIE);
  redirect('/studio');
}
