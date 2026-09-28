'use client';

import { useEffect } from 'react';
import { normalizedLabHash } from './planHash';

/**
 * 旧编号锚点兼容（2026-09-13 编号改按项目）：`/lab#lab10` 这类已发出去的链接，
 * 换成新哈希并滚到对应台架。带编制的旧哈希由各台 planFromHash 自己认，这里只负责滚动与改写地址栏。
 */
export function LegacyLabHash() {
  useEffect(() => {
    const { hash } = window.location;
    const next = normalizedLabHash(hash);
    if (next !== hash) window.history.replaceState(null, '', next);
    const id = /^#(lab[12]-\d+)(?:-[a-z]+)?$/.exec(next)?.[1];
    if (!id) return;
    // Responsive controls and bounded canvas heights settle after hydration. Keep a direct
    // link on its bench during that initial layout, but never fight the reader's first input.
    let timer = 0;
    let stopped = false;
    const place = () => {
      window.clearTimeout(timer);
      if (!stopped) timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'instant' }), 100);
    };
    const observer = new ResizeObserver(place);
    const events = ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const;
    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      observer.disconnect();
      events.forEach(event => window.removeEventListener(event, stop, true));
    };
    observer.observe(document.body);
    events.forEach(event => window.addEventListener(event, stop, { once: true, passive: true, capture: true }));
    place();
    const deadline = window.setTimeout(stop, 1500);
    return () => {
      stop();
      window.clearTimeout(deadline);
      events.forEach(event => window.removeEventListener(event, stop, true));
    };
  }, []);
  return null;
}
