'use client';

import { useSyncExternalStore } from 'react';

/**
 * 「当前选的是哪套人格」——人格示意台（N06）和衰老曲线（N17）共用同一个选择：
 * 稿里它们读的是同一个 state（在示意台里点 B，衰老曲线也跟着换成 B 的死法）。
 * 两个构件在 MDX 里是相隔很远的两个独立组件，没有共同的 React 父级可以放 state，
 * 所以用一个最小的外部 store（useSyncExternalStore）。SSR 恒为 0（A）。
 */
let current = 0;
const listeners = new Set<() => void>();

export function setPersona(i: number): void {
  if (i === current) return;
  current = i;
  listeners.forEach((l) => l());
}

export function usePersona(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => 0,
  );
}
