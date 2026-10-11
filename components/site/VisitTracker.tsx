'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageVisit } from '../../src/lib/visitors/client';

/** Invisible root-layout observer; prefetching and hash-only changes never count as visits. */
export function VisitTracker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  useEffect(() => {
    if (enabled && pathname) trackPageVisit(pathname);
  }, [enabled, pathname]);
  return null;
}
