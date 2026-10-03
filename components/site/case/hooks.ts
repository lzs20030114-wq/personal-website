'use client';

import { useEffect, useState, type RefObject } from 'react';

/** 用户是否要求减少动效。SSR 与首帧按「不减少」处理，挂载后读真值。 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * 元素是否在（或临近）视口内——逐帧跑的构件只在可见时跑 rAF，滚出去就停。
 * margin 给一点预热余量，滚进来的第一帧不是空的。
 */
export function useInView(ref: RefObject<Element | null>, margin = '160px'): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        // 一次回调可能带多条记录（同一目标先出后入）——只认最后一条（MAPPING §33 抓过这个坑）
        const last = entries[entries.length - 1];
        if (last) setSeen(last.isIntersecting);
      },
      { rootMargin: `${margin} 0px ${margin} 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return seen;
}

/** 按设备像素比对齐画布，返回 2D 上下文与 CSS 像素尺寸（稿 fit）。 */
export function fitCanvas(cv: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (w === 0 || h === 0) return null;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
