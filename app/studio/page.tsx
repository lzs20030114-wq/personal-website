import { cookies } from 'next/headers';
import { LogEntriesSchema } from '../../src/lib/site/log-schema';
import { STUDIO_COOKIE, studioConfigured, studioSecret, verifySession } from '../../src/lib/studio/auth';
import { describeTarget, loadPool } from '../../src/lib/studio/repo';
import { LoginForm } from '../../components/studio/LoginForm';
import { StudioEditor } from '../../components/studio/StudioEditor';

/**
 * /studio —— work log 的写作后台（用户拍板 2026-07-28）。
 * 不是站点的一部分：不在 (site) 路由组里（无顶导/页脚）、noindex、必须登录。
 *
 * 载入的内容池取自**将要被写回去的那个分支**（repo.loadPool），不是当前部署烤进去的副本——
 * 否则刚发布完、部署还没转完时再打开编辑器，会拿旧版覆盖掉刚发布的改动。
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Studio',
  robots: { index: false, follow: false },
};

export default async function StudioPage() {
  if (!studioConfigured()) return <SetupNotice />;

  const jar = await cookies();
  const authed = verifySession(studioSecret(), jar.get(STUDIO_COOKIE)?.value, Date.now());
  if (!authed) return <LoginForm />;

  let pool;
  try {
    pool = await loadPool();
  } catch (err) {
    return (
      <Notice title="读不到内容池">
        <p>{err instanceof Error ? err.message : String(err)}</p>
        <p>目标：{describeTarget()}</p>
      </Notice>
    );
  }

  const parsed = LogEntriesSchema.safeParse(pool.entries);
  if (!parsed.success) {
    return (
      <Notice title="内容池当前版本本身不合法">
        <p>
          编辑器不会打开——否则一发布就把问题原样写回去。先手工修 content/log/entries.json：
        </p>
        <pre>{parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')}</pre>
      </Notice>
    );
  }

  return (
    <StudioEditor
      initialEntries={parsed.data}
      baseSha={pool.sha}
      source={pool.source}
      target={describeTarget()}
      existingImages={pool.images}
    />
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="studio-notice">
      <h1>{title}</h1>
      {children}
    </div>
  );
}

/** 环境变量还没配时给的是操作说明，不是一句「未配置」。 */
function SetupNotice() {
  return (
    <Notice title="Studio 还没启用">
      <p>需要在 Vercel 项目的 Environment Variables 里配置：</p>
      <ul>
        <li>
          <code>STUDIO_PASSWORD</code> —— 进这个页面的密码。随机 24 位以上（没有持久的失败次数
          限制，短密码会被穷举）。
        </li>
        <li>
          <code>STUDIO_GITHUB_TOKEN</code> —— fine-grained personal access token，只给
          personal-website 这一个仓库的 <code>Contents: Read and write</code> 权限。发布时用它打
          commit。
        </li>
        <li>
          <code>STUDIO_BRANCH</code>（可选，默认 <code>master</code>）、
          <code>STUDIO_REPO</code>（可选，默认取 Vercel 注入的仓库名）、
          <code>STUDIO_SECRET</code>（可选，会话签名密钥；不配就从密码派生，改密码即登出所有会话）。
        </li>
      </ul>
      <p>
        本地开发不用配 token：没有 <code>STUDIO_GITHUB_TOKEN</code> 时，发布会直接写本地
        content/log/entries.json 与 public/log/，之后自己 commit。
      </p>
    </Notice>
  );
}
