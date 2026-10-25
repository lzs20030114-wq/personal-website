import { getRoutableWork } from '../../../src/lib/site/content';
import { getOtherWorkPages } from '../../../src/lib/site/other-works';
import { STUDIO_COOKIE, studioConfigured, studioSecret, verifySession } from '../../../src/lib/studio/auth';
import { recordVisit, visitorStorageMode, VisitorRateLimitError } from '../../../src/lib/visitors/store';
import { acceptsVisit, publicVisitPath, readVisitBody, studioToken, visitRecord, VisitPayload } from '../../../src/lib/visitors/request';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function empty(status = 204) {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  // Preview deployments never write to the production visitor database.
  if (process.env.VERCEL && process.env.VERCEL_ENV !== 'production') return empty();
  if (!studioConfigured() || visitorStorageMode() === 'disabled' || !acceptsVisit(req)) return empty();
  if (verifySession(studioSecret(), studioToken(req.headers, STUDIO_COOKIE), Date.now())) return empty();
  let payload;
  try { payload = VisitPayload.safeParse(await readVisitBody(req)); } catch { return empty(400); }
  if (!payload.success) return empty(400);
  const path = publicVisitPath(payload.data.path, [
    ...getRoutableWork().map((work) => work.slug),
    ...getOtherWorkPages().map((p) => p.work.slug),
  ]);
  if (!path) return empty(400);
  try {
    await recordVisit(visitRecord(payload.data, path, req.headers));
  } catch (error) {
    if (error instanceof VisitorRateLimitError) return empty(429);
    // Never log request bodies, raw IPs, database credentials, or provider error payloads.
    console.warn('Visitor storage write failed');
    return empty(503);
  }
  return empty();
}
