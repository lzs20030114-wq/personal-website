import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearBenchStash, stashBench, takeBench } from './handoff';

/**
 * 跨路由状态交接的守门测试（handoff.ts）。
 *
 * 这里卡的两条都是实测踩出来的坑，而且都**不会让任何东西报错**——交接静默失效，
 * 表现只是「落地那一下机器倒带了」，跟没写过这功能一模一样：
 * ① 取状态取得太晚（台架构造里有几秒的止程标定），一取就已经过了保质期；
 * ② 严格模式下开发期挂两次，取走即清会让恢复落在被丢弃的第一个实例上。
 */
describe('台架状态交接', () => {
  beforeEach(() => {
    clearBenchStash();
    vi.useRealTimers();
  });

  it('存了就能取到，取的是同一份数据', () => {
    const data = { theta: 1.23 };
    stashBench('machine', data);
    expect(takeBench('machine')).toBe(data);
  });

  it('key 不符取不到，且不会把别人的那份吃掉', () => {
    stashBench('machine', { theta: 1 });
    expect(takeBench('rings')).toBeNull();
    expect(takeBench('machine')).not.toBeNull();
  });

  it('没存过取到 null', () => {
    expect(takeBench('machine')).toBeNull();
  });

  it('过了保质期取到 null（留了状态却没换成页，下次挂载不该套用陈的）', () => {
    vi.useFakeTimers();
    stashBench('machine', { theta: 1 });
    vi.advanceTimersByTime(9000);
    expect(takeBench('machine', 8000)).toBeNull();
  });

  it('宽限期内可重复取回同一份（严格模式二次挂载要靠这个）', () => {
    const data = { theta: 1 };
    stashBench('machine', data);
    expect(takeBench('machine')).toBe(data);
    expect(takeBench('machine')).toBe(data);
  });

  it('过了宽限期就取不到了（不让 /lab 上的同款台架捡起陈状态）', () => {
    vi.useFakeTimers();
    stashBench('machine', { theta: 1 });
    expect(takeBench('machine')).not.toBeNull();
    vi.advanceTimersByTime(2500);
    expect(takeBench('machine')).toBeNull();
  });

  it('新的一次点击覆盖旧状态，且清掉宽限期里的那份', () => {
    const a = { theta: 1 };
    const b = { theta: 2 };
    stashBench('machine', a);
    expect(takeBench('machine')).toBe(a);
    stashBench('machine', b);
    expect(takeBench('machine')).toBe(b);
  });
});
