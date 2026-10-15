'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from '../../app/studio/actions';

export function LoginForm({ returnTo = '/studio' }: { returnTo?: '/studio' | '/studio/visitors' }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, null);

  return (
    <form className="studio-login" action={action}>
      <h1>Studio</h1>
      <p className="studio-login__hint">
        {returnTo === '/studio/visitors' ? '访客记录' : 'work log 编辑器'} · 仅作者本人
      </p>
      <input type="hidden" name="returnTo" value={returnTo} />
      <label htmlFor="studio-password">密码</label>
      <input
        id="studio-password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
      />
      {state?.error && (
        <p className="studio-login__error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? '验证中…' : '进入'}
      </button>
    </form>
  );
}
