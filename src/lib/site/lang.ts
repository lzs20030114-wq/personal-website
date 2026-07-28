/**
 * 站内语言偏好（2026-07-28）——**不是 i18n 路由**。
 *
 * 全站只有两处内容自带中英两份：work log 条目、case study 正文。两处共用同一个
 * localStorage 键，因为对读者而言「我要看中文」是一个偏好而不是两个：在 log 页切了中文，
 * 点进案例页不该又变回英文。SSR 首帧恒为 EN（静态预渲染读不到偏好），挂载后再切。
 *
 * 纯常量与类型，不碰 DOM/fs——服务端与 'use client' 两边都能 import。
 */
export type SiteLang = 'en' | 'zh';

/** localStorage 键。旧键 'log-lang' 已弃用（换键的代价：老访客的选择丢一次）。 */
export const LANG_STORE_KEY = 'site-lang';

/** `<html lang>` / 区块 lang 属性用的 BCP-47 值——CJK 字体回退与断行都看它。 */
export function langAttr(lang: SiteLang): string {
  return lang === 'zh' ? 'zh-Hans' : 'en';
}

/** 读偏好；隐私模式下 localStorage 抛异常——记不住语言不该让整页挂掉。 */
export function readStoredLang(): SiteLang | null {
  try {
    const v = localStorage.getItem(LANG_STORE_KEY);
    return v === 'zh' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** 写偏好；同上，失败即忽略。 */
export function storeLang(lang: SiteLang): void {
  try {
    localStorage.setItem(LANG_STORE_KEY, lang);
  } catch {
    /* 忽略 */
  }
}
