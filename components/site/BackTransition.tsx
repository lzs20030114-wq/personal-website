'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 返回转场（稿 Case-Modernist 的 goBack）：案例页点 brand / Work 回主页时，
 * 内容整体 blur + 微缩，深色平面淡入盖场，盖满后再换页——去程有转场、回程硬切会显得page
 * 只有一半做完（MAPPING §6.2 把它列为「未做」，此处补上）。
 *
 * 与稿的差异（SPA 适配，稿是 MPA）：
 * - 稿靠 `location.href` 换文档 + sessionStorage('om-pt') 交接给主页的 <head> 内联脚本去揭开；
 *   本站是 SPA，平面不会随文档销毁，**由本组件自己淡出并移除**，因此不写 om-pt——
 *   写了反而会让下一次进深色页的 PageEnter 误判成「刚从主页转场过来」。
 * - 卸载时**不撤销**收尾定时器：push 之后本组件即卸载，撤了平面就永远留在屏幕上。
 *   平面自带 pointer-events:none + data-pt-tmp（任何 PageEnter 挂载都会清残留）+ 自身兜底移除。
 */
const IN_MS = 480; // 稿：平面淡入 / 内容 blur 的时长
const HOLD_MS = 60; // 盖满到换页之间的停顿（稿是 40ms + 文档跳转）
const OUT_DELAY = 140; // 换页后给新页面一帧落位再撤平面
const OUT_MS = 420;

const PLANE =
  'linear-gradient(160deg,oklch(0.27 0.052 200) 0%,oklch(0.24 0.048 232) 55%,oklch(0.26 0.052 282) 100%)';

export function BackTransition() {
  const router = useRouter();

  useEffect(() => {
    const EASE = 'cubic-bezier(0.2,0.7,0.2,1)';
    let running = false;

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href') ?? '';
      // 只接管「回主页」这一类链接（brand 与 Work 锚点）；其余链接原样走
      if (href !== '/' && !href.startsWith('/#')) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (running) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 捕获阶段接管：next/link 自己带点击处理，冒泡阶段再 preventDefault 已经晚了
      //（实测跳转照常发生、转场根本没播）。stopPropagation 让这一次点击不再走 Link。
      e.preventDefault();
      e.stopPropagation();
      running = true;

      const veil = document.createElement('div');
      veil.setAttribute('data-pt-tmp', '1');
      veil.style.cssText = `position:fixed;inset:0;z-index:200;pointer-events:none;opacity:0;background:${PLANE}`;
      document.body.appendChild(veil);

      const root = document.querySelector<HTMLElement>('[data-pt-content]');
      root?.animate(
        [
          { filter: 'blur(0px)', transform: 'scale(1)' },
          { filter: 'blur(10px)', transform: 'scale(0.985)' },
        ],
        { duration: IN_MS, easing: EASE, fill: 'forwards' },
      );

      const drop = () => {
        veil.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: OUT_MS,
          easing: EASE,
          fill: 'forwards',
        }).onfinish = () => veil.remove();
        // 硬兜底：动画没跑（后台标签页等）也要保证平面消失
        setTimeout(() => veil.remove(), OUT_MS + 600);
      };

      veil.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: IN_MS,
        easing: EASE,
        fill: 'forwards',
      }).onfinish = () => {
        setTimeout(() => {
          router.push(href);
          setTimeout(drop, OUT_DELAY);
        }, HOLD_MS);
      };
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [router]);

  return null;
}
