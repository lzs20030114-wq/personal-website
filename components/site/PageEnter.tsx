'use client';

import { useEffect } from 'react';

/**
 * 页面转场进入段（MAPPING §6.1）。主页 goPT 媒体块生长满屏 → router.push 后本层接力：
 * 挂一层不透明着陆平面（盖住 goPT 残留与新页面首帧）→ 内容 blur 揭入 →
 * 平面 clipPath 从满屏收回到 hero（data-pt-target）位置后移除。
 *
 * 强兜底（防白屏，这是跨路由动画唯一的硬风险）：
 * - 无转场标记（直接访问/普通导航）→ 立即清除 goPT 残留，不揭开；
 * - 任何情况 2s 超时强制移除平面；组件卸载也强制 finish。
 * 转场标记 = sessionStorage('om-pt') 存 Date.now()，读后即删；超 3s 视为过期忽略。
 */
export function PageEnter() {
  useEffect(() => {
    const EASE = 'cubic-bezier(0.2,0.7,0.2,1)';
    const clearTmp = () =>
      document.querySelectorAll('[data-pt-tmp]').forEach((el) => el.remove());
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let ts = 0;
    let bg = '';
    try {
      ts = Number(sessionStorage.getItem('om-pt') || 0);
      bg = sessionStorage.getItem('om-pt-bg') || '';
      sessionStorage.removeItem('om-pt');
      sessionStorage.removeItem('om-pt-bg');
    } catch {
      /* sessionStorage 不可用：走无转场分支 */
    }
    const fresh = ts > 0 && Date.now() - ts < 3000;

    // 非转场进入（直接访问 / 普通 SPA 切换）：清掉任何 goPT 残留，不播放揭开。
    if (!fresh || reduced) {
      clearTmp();
      return;
    }

    // 着陆平面：先盖住一切（含 goPT 残留与新页面首帧），再清残留（此刻被盖，无感）。
    const veil = document.createElement('div');
    veil.className = 'pt-veil';
    veil.setAttribute('data-pt-tmp', '1');
    if (bg) veil.style.background = bg;
    document.body.appendChild(veil);
    document.querySelectorAll('[data-pt-tmp]').forEach((el) => {
      if (el !== veil) el.remove();
    });

    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      veil.remove();
    };

    // 内容 blur 揭入（data-pt-content）
    const content = document.querySelector<HTMLElement>('[data-pt-content]');
    content?.animate(
      [
        { filter: 'blur(14px)', transform: 'scale(1.03)' },
        { filter: 'blur(0px)', transform: 'scale(1)' },
      ],
      { duration: 700, delay: 80, easing: EASE, fill: 'backwards' },
    );

    // settle：平面从满屏 clip 收回到 hero 位置；无 hero 则直接淡出
    const settle = () => {
      const hero = document.querySelector<HTMLElement>('[data-pt-target]');
      const r = hero?.getBoundingClientRect();
      if (!r || r.width < 10 || r.height < 10) {
        veil.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 520,
          easing: EASE,
          fill: 'forwards',
        }).onfinish = finish;
        return;
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const clip = `inset(${Math.max(r.top, 0)}px ${Math.max(vw - r.right, 0)}px ${Math.max(
        vh - r.bottom,
        0,
      )}px ${Math.max(r.left, 0)}px)`;
      veil.animate(
        [{ clipPath: 'inset(0px 0px 0px 0px)' }, { clipPath: clip }],
        { duration: 680, delay: 120, easing: EASE, fill: 'forwards' },
      ).onfinish = finish;
    };
    requestAnimationFrame(() => requestAnimationFrame(settle));

    timer = setTimeout(finish, 2000); // 硬兜底：无论如何 2s 必清
    return finish; // 卸载即清
  }, []);

  return null;
}
