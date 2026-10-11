import { isIP } from 'node:net';
import { z } from 'zod';
import type { VisitorRecord, VisitorFilters } from './types';

const publicPages = new Set(['/', '/about', '/archive', '/lab', '/privacy',
  '/demo/index.html', '/demo/arch.html', '/demo/tentacle.html', '/demo/tentacle3d.html', '/demo/shell3d.html']);

/** Paths only: never persist search parameters, fragments, credentials, or arbitrary URLs. */
export function publicVisitPath(input: string, slugs: readonly string[]): string | null {
  if (input.length > 256 || !input.startsWith('/') || input.startsWith('//') || /[\\\x00-\x20]/.test(input)) return null;
  const normalized = input.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  const path = normalized === '/demo' ? '/demo/index.html' : normalized;
  return publicPages.has(path) || slugs.some((slug) => path === `/work/${slug}`) ? path : null;
}

export function referrerOrigin(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}

export const VisitPayload = z.object({
  id: z.uuid(), path: z.string().max(256), referrer: z.string().max(2048).nullable().optional(),
}).strict();

export function acceptsVisit(req: Request): boolean {
  // Next dev may expose localhost in req.url while the browser uses 127.0.0.1.
  // Host is the actual browser-facing authority; do not trust arbitrary forwarded-host.
  const url = new URL(req.url);
  const host = req.headers.get('host') ?? url.host;
  const protocol = process.env.VERCEL === '1' ? req.headers.get('x-forwarded-proto') ?? url.protocol.slice(0, -1) : url.protocol.slice(0, -1);
  if (!['http', 'https'].includes(protocol) || req.headers.get('origin') !== `${protocol}://${host}`) return false;
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  if (req.headers.get('dnt') === '1' || req.headers.get('sec-gpc') === '1') return false;
  if (req.headers.get('purpose') === 'prefetch' || req.headers.has('next-router-prefetch')) return false;
  if (/bot|crawler|spider|headless|preview|lighthouse/i.test(req.headers.get('user-agent') ?? '')) return false;
  return req.headers.get('content-type')?.split(';')[0].trim() === 'application/json';
}

function geo(headers: Headers, name: string): string | null {
  const value = headers.get(name);
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    return decoded && decoded.length <= 120 && !/[\x00-\x1f\x7f]/.test(decoded) ? decoded : null;
  } catch { return null; }
}

/** Only Vercel's overwritten edge headers are trusted; local/proxy values are unknown. */
export function visitRecord(payload: z.infer<typeof VisitPayload>, path: string, headers: Headers): VisitorRecord {
  const trusted = process.env.VERCEL === '1';
  const candidate = trusted ? headers.get('x-vercel-forwarded-for')?.trim() : null;
  return {
    id: payload.id, visitedAt: new Date().toISOString(), path,
    ip: candidate && isIP(candidate) ? candidate : null,
    country: trusted ? geo(headers, 'x-vercel-ip-country') : null,
    region: trusted ? geo(headers, 'x-vercel-ip-country-region') : null,
    city: trusted ? geo(headers, 'x-vercel-ip-city') : null,
    referrer: referrerOrigin(payload.referrer),
  };
}

export function studioToken(headers: Headers, name: string): string | undefined {
  const value = headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!value) return undefined;
  try { return decodeURIComponent(value.slice(name.length + 1)); } catch { return undefined; }
}

function validDay(value: string): boolean {
  return value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
}

export function parseVisitorFilters(params: URLSearchParams): VisitorFilters | null {
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const ip = (params.get('ip') ?? '').trim();
  const path = (params.get('path') ?? '').trim();
  const rawPage = params.get('page') ?? '1';
  const page = Number(rawPage);
  if (!validDay(from) || !validDay(to) || (from && to && from > to) ||
    (ip && !isIP(ip)) || path.length > 256 || (path && (!path.startsWith('/') || /[?#\\\x00-\x20]/.test(path))) ||
    !/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page < 1 || page > 100000) return null;
  return { from, to, ip, path, page };
}

/** Bound even chunked requests before JSON parsing. */
export async function readVisitBody(req: Request): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('Empty body');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
