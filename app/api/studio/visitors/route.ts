import { STUDIO_COOKIE, studioConfigured, studioSecret, verifySession } from '../../../../src/lib/studio/auth';
import { queryVisits, visitorStorageMode } from '../../../../src/lib/visitors/store';
import { parseVisitorFilters, studioToken } from '../../../../src/lib/visitors/request';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' } });
}

export async function GET(req: Request) {
  if (!studioConfigured()) return json({ error: '尚未配置后台密码。' }, 503);
  if (!verifySession(studioSecret(), studioToken(req.headers, STUDIO_COOKIE), Date.now())) {
    return json({ error: '登录已过期，请重新登录。' }, 401);
  }
  const filters = parseVisitorFilters(new URL(req.url).searchParams);
  if (!filters) return json({ error: '请检查日期范围、完整 IP 地址和页面路径。' }, 400);
  const mode = visitorStorageMode();
  if (mode === 'disabled') return json({ mode });
  try { return json({ mode, data: await queryVisits(filters) }); }
  catch { return json({ mode, error: '暂时读不到访客记录，请稍后刷新或检查数据库连接。' }, 503); }
}
