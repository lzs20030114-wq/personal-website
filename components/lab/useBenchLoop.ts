'use client';

import { useEffect, type RefObject } from 'react';

/**
 * 台架公共 rAF 循环：IntersectionObserver 停启（离屏不烧 CPU）+ 页面隐藏暂停 +
 * enabled 门控（舞台轮播里非当前片、或被 visibility 藏起来的台架——IO 只看几何、
 * 看不见 visibility，必须显式关掉，否则后台空烧）。
 * 与 src/demo/* 台架同样的驱动方式；dt 传秒，首帧 dt 由调用方自行钳制。
 */
export function useBenchLoop(
  ref: RefObject<Element | null>,
  step: (dt: number) => void,
  deps: unknown[] = [],
  enabled = true,
): void {
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    let raf = 0;
    let running = false;
    let last = performance.now();

    const tick = (now: number): void => {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.05); // 切后台回来不炸：单帧封顶 50ms
      last = now;
      step(dt);
      raf = requestAnimationFrame(tick);
    };
    const start = (): void => {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = (): void => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const onVis = (): void => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);

    let io: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        ([entry]) => (entry.isIntersecting && !document.hidden ? start() : stop()),
        { rootMargin: '120px' },
      );
      io.observe(node);
    } else {
      start();
    }
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      io?.disconnect();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);
}
