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
      // 一次回调可能带**多条**记录（同一目标在两次回调之间先出后入——快速甩滚、视口临时改尺寸），
      // 只读第一条会把「出→入」读成「出」：loop 停下、再没有人来 start，台架就此冻住
      // （2026-09-20 Lab 2-11 CDP 复现：records "01" ⇒ STEP 钉死）。以**最后一条**为准
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (entry.isIntersecting && !document.hidden) start();
          else stop();
        },
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
