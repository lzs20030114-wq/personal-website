'use client';

import { useEffect, useRef } from 'react';
import { pageTransitionActive } from '../pageTransitionState';

const EO = 'cubic-bezier(.2,.7,.1,1)';

/** 目录栏点击跳章时发出的事件（CaseIndex → CaseReveal），detail = 目标滚动位置（页面坐标）。 */
export const CASE_JUMP_EVENT = 'cs-reveal-jump';
/** 跳章后多长时间内按「跳转模式」显现（覆盖平滑滚动的整段时长再留余量）。 */
const JUMP_WINDOW_MS = 2500;
/** 平时滚动：每批最多错峰到第几级（原先不封顶，长距离平滑滚动会一路累加到几十级）。 */
const STAGGER_CAP = 4;
const STAGGER_STEP = 70;
const REVEAL_MS = 820;
/** 跳转模式：落地那一批短淡入、错峰最多三级。 */
const JUMP_STAGGER_CAP = 3;
const JUMP_STAGGER_STEP = 50;
const JUMP_REVEAL_MS = 480;

/**
 * 滚动显现（稿 data-rv）：首屏元素与正文里每一块在进入视口时从下方 22px 淡入，
 * 同一批进来的按 70ms 错峰。无渲染输出，只是个挂在页面里的副作用组件。
 *
 * 设计取舍：
 * - 隐藏发生在**水合之后**（SSR 与无 JS 时内容完整可见）；
 * - 等两帧再动手：语言偏好在挂载后才恢复，`Pick` 会把已水合的 EN 树换成 ZH 树，立即隐藏的话
 *   会隐藏到马上被丢掉的那一棵；
 * - 只在首次挂载时隐藏 + 观察——之后切语言换进来的新节点本来就是可见的，不再重播；
 * - reduced-motion 完全不碰。
 * - 经页面转场进来（MAPPING §48）：首屏已经随转场整张进来了，不再把它藏起来重演一遍——
 *   否则滑进来的是一张空纸、内容晚半拍才浮出来（实测「下一个案例」那一翻最明显）。
 *   首屏以下照旧滚到才显现。
 * - 目录跳章（2026-10-23，用户「点击左侧目录跳转后面的小节加载的时间太慢」）：平滑滚动途中每一块
 *   路过视口都会触发一次显现回调，错峰计数原先只在两次回调隔 200ms 以上才归零，长跳一路累加
 *   （实测 12 级 = 840ms 延迟再叠 820ms 淡入，目标节三四秒才全部显现）。现在：错峰每批封顶；
 *   目录点击发 `cs-reveal-jump`，会被跳过的块直接恢复可见、不起动画，落地那一批短淡入、错峰最多
 *   三级，滚动停稳后再兜底补一次（IO 回调在重页面上会晚到）。
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
        if (typeof IntersectionObserver === 'undefined') return;
        const vh = window.innerHeight;
        const arriving = pageTransitionActive();
        const els = Array.from(
          document.querySelectorAll<HTMLElement>('.cs [data-rv], .cs-body > *, .cs-tail > *'),
        ).filter((el) => !arriving || el.getBoundingClientRect().top >= vh);
        els.forEach((el) => {
          el.style.opacity = '0';
        });
        const pending = new Set<HTMLElement>(els);
        let jumpUntil = 0;
        const jumping = () => performance.now() < jumpUntil;
        // 错峰计数：平时滚动按 200ms 窗口归零并封顶；跳转模式每批归零
        let k = 0;
        let kt = 0;
        let jk = 0;

        /** 不播动画直接恢复（跳过去的、已经在身后的）。 */
        const show = (el: HTMLElement) => {
          pending.delete(el);
          io?.unobserve(el);
          el.style.opacity = '';
        };
        /** 一批同时进入视口的块：按在视口里的高低排，上面的先出。 */
        const revealBatch = (batch: HTMLElement[], jump: boolean) => {
          const step = jump ? JUMP_STAGGER_STEP : STAGGER_STEP;
          const cap = jump ? JUMP_STAGGER_CAP : STAGGER_CAP;
          const dur = jump ? JUMP_REVEAL_MS : REVEAL_MS;
          batch
            .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
            .forEach((el) => {
              show(el);
              if (!jump && performance.now() - kt > 200) k = 0;
              kt = performance.now();
              const level = jump ? Math.min(jk++, cap) : Math.min(k++, cap);
              el.animate(
                [
                  { opacity: 0, transform: 'translateY(22px)' },
                  { opacity: 1, transform: 'none' },
                ],
                { duration: dur, delay: level * step, easing: EO, fill: 'backwards' },
              );
            });
        };
        const inView = (el: HTMLElement) => {
          const r = el.getBoundingClientRect();
          return r.bottom > 0 && r.top < window.innerHeight;
        };

        // 快速甩动 / 目录一跳多屏时，元素可能整个从未与视口相交过（IO 只在相交状态翻转时通知），
        // 留在身后就成了一片透明——滚动时顺手把已经在视口上方的还原，不播动画
        let raf = 0;
        const sweep = () => {
          raf = 0;
          pending.forEach((el) => {
            if (el.getBoundingClientRect().bottom < 0) show(el);
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

        // 目录跳章：把会被跳过的块（落地后在视口上方的）直接恢复，落地那一批走短淡入；
        // 滚动停稳后兜底——IO 回调在重页面上可能晚到，别让读者对着一片空白等
        let settleTimer: ReturnType<typeof setTimeout> | undefined;
        const settle = () => {
          if (!jumping()) return;
          const batch: HTMLElement[] = [];
          pending.forEach((el) => {
            if (inView(el)) batch.push(el);
          });
          if (batch.length) {
            jk = 0;
            revealBatch(batch, true);
          }
        };
        const onJump = (ev: Event) => {
          const top = (ev as CustomEvent<{ top: number }>).detail?.top;
          if (typeof top !== 'number') return;
          jumpUntil = performance.now() + JUMP_WINDOW_MS;
          jk = 0;
          const y = window.scrollY;
          pending.forEach((el) => {
            // 落地后会在视口上方的：不动画，直接可见
            if (el.getBoundingClientRect().bottom + y <= top) show(el);
          });
          clearTimeout(settleTimer);
          settleTimer = setTimeout(settle, 900);
        };
        const onScrollEnd = () => {
          if (jumping()) settle();
        };
        window.addEventListener(CASE_JUMP_EVENT, onJump);
        window.addEventListener('scrollend', onScrollEnd);
        cleanups.push(() => {
          window.removeEventListener(CASE_JUMP_EVENT, onJump);
          window.removeEventListener('scrollend', onScrollEnd);
          clearTimeout(settleTimer);
        });

        io = new IntersectionObserver(
          (entries) => {
            const jump = jumping();
            const batch: HTMLElement[] = [];
            entries.forEach((en) => {
              const el = en.target as HTMLElement;
              if (!en.isIntersecting || !pending.has(el)) return;
              // 回调送到时已经滚过去了（长距离平滑滚动途中）：直接可见，不排进错峰
              if (!inView(el)) show(el);
              else batch.push(el);
            });
            if (jump) jk = 0;
            if (batch.length) revealBatch(batch, jump);
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
