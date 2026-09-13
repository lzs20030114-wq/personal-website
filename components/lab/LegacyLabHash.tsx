'use client';

import { useEffect } from 'react';
import { normalizedLabHash } from './planHash';

/**
 * 旧编号锚点兼容（2026-09-13 编号改按项目）：`/lab#lab10` 这类已发出去的链接，
 * 换成新哈希并滚到对应台架。带编制的旧哈希由各台 planFromHash 自己认，这里只负责滚动与改写地址栏。
 */
export function LegacyLabHash() {
  useEffect(() => {
    const { hash } = window.location;
    const next = normalizedLabHash(hash);
    if (next === hash) return;
    window.history.replaceState(null, '', next);
    const id = next.replace(/^#/, '').replace(/^(lab\d-\d+)-[a-z]+$/, '$1');
    window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, []);
  return null;
}
