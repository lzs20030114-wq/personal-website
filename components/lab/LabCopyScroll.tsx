'use client';

import { useEffect } from 'react';

/**
 * /lab 左栏（正文 + 规格表）在框内滚时的「下面还有」提示（用户 2026-09-01
 * 「左边那么长一条 也设计一个框内的滚动吧」）。
 *
 * **为什么要 JS**：滚动条本身不能当唯一提示——macOS 与 headless Chromium 用的都是
 * overlay 滚动条，静置时根本不画（本轮截图实测就看不见），读者会以为规格表只有两行。
 * 渐隐又必须条件化：内容没超出时挂一层渐隐，会把规格表最后一行的发丝线糊掉。
 * 纯 CSS 做不到这个条件（sticky 在内容短时照样贴底，scroll() 时间线兼容性还不稳），
 * 所以这里用一个只加属性、不改结构的最小客户端组件，样式仍全在 globals.css。
 *
 * 只在**还能往下滚**时挂 `data-more`：滚到底自动摘掉，窄屏单列下 overflow 是 visible、
 * scrollHeight == clientHeight，天然不挂。
 */
export function LabCopyScroll() {
  useEffect(() => {
    const boxes = Array.from(document.querySelectorAll<HTMLElement>('.lab-copy__inner'));
    if (!boxes.length) return;
    const sync = (el: HTMLElement): void => {
      const more = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
      el.parentElement?.toggleAttribute('data-more', more);
    };
    const onScroll = (e: Event): void => sync(e.currentTarget as HTMLElement);
    const ro = new ResizeObserver(() => boxes.forEach(sync));
    for (const el of boxes) {
      sync(el);
      el.addEventListener('scroll', onScroll, { passive: true });
      ro.observe(el);
    }
    return () => {
      ro.disconnect();
      for (const el of boxes) el.removeEventListener('scroll', onScroll);
    };
  }, []);
  return null;
}
