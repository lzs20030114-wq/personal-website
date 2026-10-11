import { cookies } from 'next/headers';
import { LoginForm } from '../../../components/studio/LoginForm';
import { VisitorDashboard } from '../../../components/studio/VisitorDashboard';
import {
  STUDIO_COOKIE,
  studioConfigured,
  studioSecret,
  verifySession,
} from '../../../src/lib/studio/auth';
import './visitors.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '访客记录 · Studio',
  robots: { index: false, follow: false },
};

export default async function VisitorPage() {
  if (!studioConfigured()) {
    return (
      <div className="studio-notice">
        <h1>访客后台还没启用</h1>
        <p>
          在服务端配置 <code>STUDIO_PASSWORD</code> 后即可登录；与工作日志后台共用密码。
          建议使用随机 24 位以上的密码。
        </p>
        <p>
          线上记录还需要连接数据库，配置步骤见仓库中的 <code>docs/visitor-analytics.md</code>。
        </p>
      </div>
    );
  }

  const jar = await cookies();
  if (!verifySession(studioSecret(), jar.get(STUDIO_COOKIE)?.value, Date.now())) {
    return <LoginForm returnTo="/studio/visitors" />;
  }

  // 筛选按 UTC+8 的自然日，服务端给出首帧范围，避免浏览器时区或跨午夜造成水合差异。
  const today = Date.now() + 8 * 60 * 60 * 1000;
  return (
    <VisitorDashboard
      initialRange={{
        from: new Date(today - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        to: new Date(today).toISOString().slice(0, 10),
      }}
    />
  );
}
