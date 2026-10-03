'use client';

import { useEffect, useRef } from 'react';

const EO = 'cubic-bezier(.2,.7,.1,1)';

/**
 * 滚动显现（稿 data-rv）：首屏元素与正文里每一块在进入视口时从下方 22px 淡入，
 * 同一批进来的按 70ms 错峰。无渲染输出，只是个挂在页面里的副作用组件。
 *
 * 设计取舍：
 * - 隐藏发生在**水合之后**（SSR 与无 JS 时内容完整可见）；
 * - 等两帧再动手：语言偏好在挂载后才恢复，`Pick` 会把已水合的 EN 树换成 ZH 树，立即隐藏的话
 *   会隐藏到马上被丢掉的那一棵；
 * - 只在首次挂载时隐藏 + 观察——之后切语言换进来的新节点本来就是可见的，不再重播；
 * - reduced-motion 完全不碰；转场进行中（有 [data-pt-morph] 克隆）也不碰，免得和 PageEnter 抢 hero。
 */
export function CaseReveal() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      done.current = true;
      return;
    }
    let io: IntersectionObserver | null = null;
    let raf2 = 0;
    const cleanups: Array<() => void> = [];
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        done.current = true;
        if (document.querySelector('[data-pt-morph]') || typeof IntersectionObserver === 'undefined') return;
        const els = Array.from(document.querySelectorAll<HTMLElement>('.cs [data-rv], .cs-body > *, .cs-tail > *'));
        els.forEach((el) => {
          el.style.opacity = '0';
        });
        const pending = new Set<HTMLElement>(els);
        // 快速甩动 / 目录一跳多屏时，元素可能整个从未与视口相交过（IO 只在相交状态翻转时通知），
        // 留在身后就成了一片透明——滚动时顺手把已经在视口上方的还原，不播动画
        let raf = 0;
        const sweep = () => {
          raf = 0;
          pending.forEach((el) => {
            if (el.getBoundingClientRect().bottom < 0) {
              el.style.opacity = '';
              pending.delete(el);
              io?.unobserve(el);
            }
          });
        };
        const onScroll = () => {
          if (!raf) raf = requestAnimationFrame(sweep);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        cleanups.push(() => {
          window.removeEventListener('scroll', onScroll);
          if (raf) cancelAnimationFrame(raf);
        });
        let k = 0;
        let kt = 0;
        io = new IntersectionObserver(
          (entries) => {
            const now = performance.now();
            if (now - kt > 200) k = 0;
            kt = now;
            entries.forEach((en) => {
              const el = en.target as HTMLElement;
              if (!en.isIntersecting) return;
              pending.delete(el);
              io?.unobserve(el);
              el.style.opacity = '';
              el.animate(
                [
                  { opacity: 0, transform: 'translateY(22px)' },
                  { opacity: 1, transform: 'none' },
                ],
                { duration: 820, delay: k++ * 70, easing: EO, fill: 'backwards' },
              );
            });
          },
          { rootMargin: '0px 0px -6% 0px' },
        );
        els.forEach((el) => io?.observe(el));
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      io?.disconnect();
      cleanups.forEach((fn) => fn());
      // 卸载时把被隐藏却没来得及显现的元素还原，别把页面留成半透明
      document.querySelectorAll<HTMLElement>('.cs [data-rv], .cs-body > *, .cs-tail > *').forEach((el) => {
        if (el.style.opacity === '0') el.style.opacity = '';
      });
    };
  }, []);
  return null;
}
