import { cookies } from 'next/headers';
import {
  STUDIO_COOKIE,
  studioConfigured,
  studioSecret,
  verifySession,
} from '../../../../src/lib/studio/auth';
import {
  buildCommitFiles,
  commitMessage,
  LOG_JSON_PATH,
  type PendingImage,
} from '../../../../src/lib/studio/publish';
import { loadPool, publishFiles, StudioRepoError } from '../../../../src/lib/studio/repo';

/**
 * 发布接口：整池条目 + 待传图片 → 一个 commit。
 *
 * 用 route handler 而不是 server action，因为图片是 base64 走请求体的——
 * server action 默认 1MB 上限，一张手机截图就能顶穿。
 *
 * 三道闸门按顺序：登录 → 与构建期同一套校验（buildCommitFiles）→ 并发检查（publishFiles）。
 */
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!studioConfigured()) return json({ ok: false, errors: ['服务端未配置 STUDIO_PASSWORD'] }, 503);

  const jar = await cookies();
  if (!verifySession(studioSecret(), jar.get(STUDIO_COOKIE)?.value, Date.now())) {
    return json({ ok: false, errors: ['未登录或会话已过期，刷新页面重新登录'] }, 401);
  }

  let payload: { entries?: unknown; baseSha?: unknown; images?: unknown };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return json({ ok: false, errors: ['请求体不是合法 JSON'] }, 400);
  }

  const images: PendingImage[] = Array.isArray(payload.images)
    ? payload.images.flatMap((raw) => {
        const img = raw as { name?: unknown; dataBase64?: unknown };
        return typeof img?.name === 'string' && typeof img?.dataBase64 === 'string'
          ? [{ name: img.name, dataBase64: img.dataBase64 }]
          : [];
      })
    : [];

  // public/log/ 下已有哪些图，由服务端自己去看——客户端说「这张已经在仓库里了」不能算数，
  // 否则条目可以引用一个根本不存在的文件，站上就是个裂图而构建不会失败。
  let existingImages: string[] = [];
  try {
    existingImages = (await loadPool()).images;
  } catch (err) {
    return json(
      { ok: false, errors: [`读不到仓库当前状态：${err instanceof Error ? err.message : err}`] },
      502,
    );
  }

  const prepared = buildCommitFiles({ entries: payload.entries, images, existingImages });
  if (!prepared.ok) return json({ ok: false, errors: prepared.errors }, 400);

  const imageCount = prepared.files.filter((f) => f.path !== LOG_JSON_PATH).length;
  try {
    const res = await publishFiles(
      prepared.files,
      commitMessage(prepared.entries, imageCount),
      typeof payload.baseSha === 'string' ? payload.baseSha : null,
    );
    return json({
      ok: true,
      mode: res.mode,
      url: res.url,
      entriesSha: res.entriesSha,
      entries: prepared.entries.length,
      images: imageCount,
      unusedImages: prepared.unusedImages,
    });
  } catch (err) {
    if (err instanceof StudioRepoError) {
      return json({ ok: false, errors: [err.message] }, err.conflict ? 409 : 502);
    }
    return json({ ok: false, errors: [err instanceof Error ? err.message : String(err)] }, 500);
  }
}
