import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';
import { StageRotator } from './StageRotator';

// 单独验证真实交互回调的暂停/恢复资格，不模拟台架帧循环或 CSS 转场。
const host = vi.hoisted(() => ({ states: [] as unknown[], effects: [] as (() => void | (() => void))[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useRef: (current: unknown) => ({ current }),
  useCallback: (fn: unknown) => fn,
  useEffect: (effect: () => void | (() => void)) => { host.effects.push(effect); },
  useState: (initial: unknown) => {
    const slot = host.states.push(initial) - 1;
    return [initial, (next: unknown) => {
      host.states[slot] = typeof next === 'function' ? next(host.states[slot]) : next;
    }];
  },
}));
vi.mock('./FourBarBench', () => ({ FourBarBench: () => null }));
vi.mock('./ArchBench', () => ({ ArchBench: () => null }));
vi.mock('./TentacleBench', () => ({ TentacleBench: () => null }));
vi.mock('./RingsBench', () => ({ RingsBench: () => null }));

type Props = { children?: ReactNode; [key: string]: unknown };
function elements(node: ReactNode): { type: unknown; props: Props }[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Props>(child)
    ? [child, ...elements(child.props.children)] : []);
}
const media = { matches: false };
function mount() {
  const nodes = elements(StageRotator());
  host.effects[0](); // 初始化系统偏好；自动轮播 effect 不参与本组交互恢复测试
  return {
    hold: nodes.find((n) => n.props.onPointerDown)!.props.onPointerDown as () => void,
    choose: (index: number) => (nodes.filter((n) => n.type === 'button')[index].props.onClick as () => void)(),
  };
}
beforeEach(() => {
  host.states = []; host.effects = []; media.matches = false;
  vi.useFakeTimers();
  vi.stubGlobal('window', { matchMedia: () => media });
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { fn(); return 0; });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('StageRotator 交互后恢复', () => {
  it('普通模式仍在最后一次交互 15 秒后恢复', () => {
    const stage = mount();
    stage.hold(); vi.advanceTimersByTime(10000);
    stage.hold(); vi.advanceTimersByTime(14999);
    expect(host.states[2]).toBe(false);
    vi.advanceTimersByTime(1);
    expect(host.states[2]).toBe(true);
  });
  it('减少动效时手动选择仍可用，交互后不会恢复轮播', () => {
    media.matches = true;
    const stage = mount();
    stage.choose(2);
    expect(host.states[0]).toEqual({ cur: 2, prev: 0 });
    vi.advanceTimersByTime(30000);
    expect(host.states[2]).toBe(false);
  });
  it('暂停等待期间启用减少动效，旧计时器不能恢复轮播', () => {
    const stage = mount();
    stage.hold(); vi.advanceTimersByTime(10000);
    media.matches = true;
    vi.advanceTimersByTime(5000);
    expect(host.states[2]).toBe(false);
  });
});
