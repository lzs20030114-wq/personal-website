'use client';

import { useEffect } from 'react';
import { coverRect, flipCss, flipTransform, type Rect } from '../../src/lib/site/flip';

/**
 * 页面转场进入段（MAPPING §6.1 / §9）。主页 goPT 把预览块交接过来 → router.push →
 * 本层接力，把它**变位缩放到本页的 hero 主图位**。
 *
 * 落地段有两条路：
 * ① **变位缩放（有 hero 落点，/work/[slug]）**——出场克隆（body 上、跨路由存活的 [data-pt-morph]）
 *    与本页 hero 同时沿同一条几何路径飞向 hero 的版式位（几何见 src/lib/site/flip.ts），
 *    途中交叉淡出：静止的克隆快照退，活的 hero 进。看上去就是主页那张预览图自己落到了主图位。
 *    起点**一律取克隆此刻的视觉框**，所以 goPT 那边是把它钉在卡片原位（直飞，用户拍板
 *    2026-07-27「不要中间放大一下再缩小过去」）还是先放大铺满，本层不必知道——
 *    上一段的末帧永远就是这一段的首帧，接缝为零。
 * ② **着陆平面（无 hero 落点，/archive 等）**——旧行为原样保留：不透明平面盖场、内容 blur 揭入、
 *    平面 clip 收回后移除。
 *
 * 强兜底（防白屏，这是跨路由动画唯一的硬风险）：
 * - 无转场标记（直接访问/普通导航）→ 立即清除 goPT 残留，什么都不播；
 * - 任何情况超时强制收尾（hero 内联样式一并复原）；组件卸载也强制 finish。
 * 转场标记 = sessionStorage('om-pt') 存 Date.now()，读后即删；超 3s 视为过期忽略。
 */
const MORPH_MS = 660; // 飞行：起点帧 → hero 位（直飞路程比原来的满屏帧短，760 → 660）
const CROSSFADE = 0.55; // 克隆淡出到此进度已经交给活件（越小越早交，越大越粘）
const REVEAL_MS = 560; // 周边内容揭入
const REVEAL_DELAY = 140;
const VEIL_OUT = 420; // 直飞时盖住换页的遮罩淡出（生长路上它被克隆盖着，淡不淡无所谓）
const VEIL_DELAY = 60;

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

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

    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanups: Array<() => void> = [];
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanups.forEach((fn) => fn());
      clearTmp();
      document.querySelectorAll('[data-pt-morph]').forEach((el) => el.remove());
    };

    const hero = document.querySelector<HTMLElement>('[data-pt-target]');
    const content = document.querySelector<HTMLElement>('[data-pt-content]');
    const heroRect = hero ? rectOf(hero) : null;

    // ── ① 变位缩放：克隆与 hero 一起飞到 hero 版式位 ─────────────────────────────
    if (hero && heroRect && heroRect.width > 10 && heroRect.height > 10) {
      const morph = document.querySelector<HTMLElement>('[data-pt-morph]');
      // 起点 = 克隆此刻的视觉框（第一段的末帧）；没有克隆（兜底路径）就自己按视口算一帧
      const start = morph
        ? rectOf(morph)
        : coverRect(heroRect, window.innerWidth, window.innerHeight);

      // 遮罩残留的处置分两种：生长那条路它被满屏的克隆盖着，撤不撤都一样；直飞那条路
      // 它正**全不透明地盖着整页**，得淡出把案例页交出来。同时要压到 hero 之下——
      // 遮罩夹在 hero 与克隆之间的话，活件被蒙一层灰、克隆在其上不受影响，
      // 交叉淡出就成了「亮的淡成暗的」。
      document.querySelectorAll<HTMLElement>('[data-pt-tmp]').forEach((el) => {
        if (el === morph) return;
        el.style.zIndex = '100';
        el.animate(
          [{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }],
          { duration: VEIL_OUT, delay: VEIL_DELAY, easing: EASE, fill: 'forwards' },
        ).onfinish = () => el.remove();
      });

      // hero：从满屏帧缩回自己的版式位。z-index 只为压住 nav / 正文（都不带 z-index），
      // 克隆在 body 上 z=200，仍在 hero 之上——交叉淡出要的就是这个顺序。
      const prev = hero.getAttribute('style') ?? '';
      hero.style.position = 'relative';
      hero.style.zIndex = '150';
      hero.style.transformOrigin = '50% 50%';
      hero.style.willChange = 'transform';
      cleanups.push(() => {
        if (prev) hero.setAttribute('style', prev);
        else hero.removeAttribute('style');
      });
      const heroAnim = hero.animate(
        [{ transform: flipCss(flipTransform(heroRect, start)) }, { transform: 'none' }],
        { duration: MORPH_MS, easing: EASE },
      );
      // 收尾必须连动画一起收：只复原内联样式而放任动画跑完，hero 会在失去 z-index 之后
      // 继续放大着压在正文底下（慢机器上硬兜底先到，实测可见）。
      cleanups.push(() => heroAnim.cancel());
      // 没有克隆（兜底路径）时由 hero 自己收尾——否则收尾只能等硬兜底超时
      if (!document.querySelector('[data-pt-morph]')) heroAnim.onfinish = finish;

      if (morph) {
        // 克隆带着 transform，量不回版式盒——goPT 把原盒写在 dataset 里
        let base: Rect | null = null;
        try {
          base = JSON.parse(morph.dataset.ptRect ?? 'null') as Rect | null;
        } catch {
          base = null;
        }
        // 摘掉 data-pt-tmp：主页那边 push 后 700ms 的兜底淡出只认这个属性，别让它抢走
        morph.removeAttribute('data-pt-tmp');
        const from = getComputedStyle(morph).transform;
        const to = base ? flipCss(flipTransform(base, heroRect)) : from;
        morph.animate(
          [
            { transform: from, opacity: 1, offset: 0 },
            { opacity: 0, offset: CROSSFADE },
            { transform: to, opacity: 0, offset: 1 },
          ],
          { duration: MORPH_MS, easing: EASE, fill: 'forwards' },
        ).onfinish = finish;
      }

      // 周边内容（不含 hero 的那些块）揭入；hero 所在块不碰——给它加 filter 会另起层叠上下文，
      // 把 hero 压回 nav 之下。
      Array.from(content?.children ?? []).forEach((kid) => {
        if (kid.contains(hero)) return;
        (kid as HTMLElement).animate(
          [
            { opacity: 0, filter: 'blur(10px)' },
            { opacity: 1, filter: 'blur(0px)' },
          ],
          { duration: REVEAL_MS, delay: REVEAL_DELAY, easing: EASE, fill: 'backwards' },
        );
      });

      timer = setTimeout(finish, MORPH_MS + 900); // 硬兜底
      return finish;
    }

    // ── ② 着陆平面（无 hero 落点）：旧行为原样 ─────────────────────────────────
    const veil = document.createElement('div');
    veil.className = 'pt-veil';
    veil.setAttribute('data-pt-tmp', '1');
    if (bg) veil.style.background = bg;
    document.body.appendChild(veil);
    document.querySelectorAll('[data-pt-tmp], [data-pt-morph]').forEach((el) => {
      if (el !== veil) el.remove();
    });

    content?.animate(
      [
        { filter: 'blur(14px)', transform: 'scale(1.03)' },
        { filter: 'blur(0px)', transform: 'scale(1)' },
      ],
      { duration: 700, delay: 80, easing: EASE, fill: 'backwards' },
    );

    veil.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 520,
      delay: 120,
      easing: EASE,
      fill: 'forwards',
    }).onfinish = finish;

    timer = setTimeout(finish, 2000); // 硬兜底：无论如何 2s 必清
    return finish; // 卸载即清
  }, []);

  return null;
}
