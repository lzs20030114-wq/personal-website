/** Same collector for Next routes and the five standalone Vite demonstration pages. */
export interface VisitPayload {
  id: string;
  path: string;
  referrer: string | null;
}

interface VisitClientEnvironment {
  referrer: string;
  visible: () => boolean;
  optedOut: () => boolean;
  createId: () => string;
  send: (visit: VisitPayload) => void | Promise<unknown>;
}

/** Keep document referrers at origin granularity; never transmit search terms or fragments. */
export function visitReferrerOrigin(referrer: string): string | null {
  try {
    const url = new URL(referrer);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** The server applies the authoritative route allowlist again. */
export function visitPath(value: string): string | null {
  const path = value.split(/[?#]/, 1)[0];
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  if (/^\/(?:studio|api|_next|privacy)(?:\/|$)/i.test(path)) return null;
  if (path.includes('.')) {
    return /^\/demo\/(?:index|arch|tentacle|tentacle3d|shell3d)\.html$/.test(path) ? path : null;
  }
  return path;
}

/**
 * State lasts only for this document. Consecutive identical paths collapse React StrictMode
 * effect replays and hash changes, while A → B → A remains three visits. No visitor ID,
 * cookies, storage, polling or retry queue are created.
 */
export class VisitClient {
  private observedPath: string | null = null;
  private pending: Omit<VisitPayload, 'id'> | null = null;

  constructor(private readonly environment: VisitClientEnvironment) {}

  visit(value: string): void {
    try {
      const path = value.split(/[?#]/, 1)[0];
      if (path === this.observedPath) return;
      const previous = this.observedPath;
      this.observedPath = path;
      this.pending = null;
      const publicPath = visitPath(path);
      if (!publicPath || this.environment.optedOut()) return;
      this.pending = {
        path: publicPath,
        referrer: previous === null
          ? visitReferrerOrigin(this.environment.referrer)
          : null,
      };
      this.activate();
    } catch {
      // Analytics must never change the site's navigation or rendering behavior.
    }
  }

  activate(): void {
    try {
      if (!this.pending || !this.environment.visible()) return;
      const pending = this.pending;
      this.pending = null;
      if (this.environment.optedOut()) return;
      const result = this.environment.send({ ...pending, id: this.environment.createId() });
      if (result) void Promise.resolve(result).catch(() => {});
    } catch {
      // Missing crypto, content blockers and offline requests are intentionally silent.
    }
  }

  /** A browser back/forward-cache restoration is a fresh visit, unlike tab activation. */
  restore(path: string): void {
    this.observedPath = null;
    this.visit(path);
  }
}

let browserClient: VisitClient | null = null;

export function trackPageVisit(path: string): void {
  try {
    if (typeof window === 'undefined') return;
    if (!browserClient) {
      const privacyNavigator = navigator as Navigator & { globalPrivacyControl?: boolean };
      const visibilityDocument = document as Document & { prerendering?: boolean };
      browserClient = new VisitClient({
        referrer: document.referrer,
        visible: () => document.visibilityState === 'visible' && !visibilityDocument.prerendering,
        optedOut: () => navigator.doNotTrack === '1' || privacyNavigator.globalPrivacyControl === true,
        createId: () => crypto.randomUUID(),
        send: (visit) => fetch('/api/visits', {
          method: 'POST',
          mode: 'same-origin',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(visit),
          keepalive: true,
          cache: 'no-store',
          referrerPolicy: 'same-origin',
        }),
      });
      document.addEventListener('visibilitychange', () => browserClient?.activate());
      document.addEventListener('prerenderingchange', () => browserClient?.activate());
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) browserClient?.restore(location.pathname);
      });
    }
    browserClient.visit(path);
  } catch {
    // Even access to browser APIs can fail in restricted environments.
  }
}

// Replaced with a boolean by Vite. Neither environment variable names nor secrets enter its bundle.
declare const __VISITOR_TRACKING_ENABLED__: boolean;

export function startStaticVisitTracking(): void {
  if (typeof __VISITOR_TRACKING_ENABLED__ !== 'undefined' && __VISITOR_TRACKING_ENABLED__) {
    trackPageVisit(location.pathname);
  }
}
