import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';
import { getLogEntries } from '../../src/lib/site/log';
import { withAnchors } from '../../src/lib/site/log-facets';
import { serializeEntries, type LogEntry } from '../../src/lib/site/log-schema';
import { validateEntries } from '../../src/lib/studio/publish';
import { StudioEditor } from './StudioEditor';
import { EntryForm } from './EntryForm';

// 只替换 React 调度和外部副作用；运行编辑器真实的新建、选中和修改回调。
const host = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0 }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useRef: (current: unknown) => ({ current }),
  useMemo: (fn: () => unknown) => fn(),
  useState: (initial: unknown) => {
    const slot = host.cursor++;
    if (!(slot in host.states)) host.states[slot] = typeof initial === 'function' ? initial() : initial;
    return [host.states[slot], (next: unknown) => {
      host.states[slot] = typeof next === 'function' ? next(host.states[slot]) : next;
    }];
  },
}));
vi.mock('../../app/studio/actions', () => ({ logoutAction: vi.fn() }));
vi.mock('./EntryForm', () => ({ EntryForm: () => null }));

type Props = { children?: ReactNode; [key: string]: unknown };
function elements(node: ReactNode): { type: unknown; props: Props }[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Props>(child)
    ? [child, ...elements(child.props.children)] : []);
}
const initialEntries = getLogEntries();
function render() {
  host.cursor = 0;
  return elements(StudioEditor({ initialEntries, baseSha: null, source: 'local', target: 'test', existingImages: [] }));
}

beforeEach(() => { host.states = []; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('Studio 新建日志的既有链接保护', () => {
  it.each(['2026-07-10', '2026-12-01'])('新增 %s 的条目后，发布排序保留全部旧锚点', (date) => {
    vi.setSystemTime(new Date(2026, 8, 29, 12));
    const button = render().find((n) => n.type === 'button' && String(n.props.children).includes('新建条目'))!;
    (button.props.onClick as () => void)();
    const form = render().find((n) => n.type === EntryForm)!;
    expect((form.props.entry as LogEntry).lead.en).toBe(''); // 新条目仍自动选中
    const added: LogEntry = {
      ...initialEntries[0], date,
      lead: { en: 'Added an anchor regression fixture.', zh: '添加日志链接回归用例。' },
    };
    (form.props.onChange as (entry: LogEntry) => void)(added);
    const entries = (host.states[0] as { entry: LogEntry }[]).map((item) => item.entry);
    expect(validateEntries(entries).ok).toBe(true);
    // 与发布使用同一个序列化入口，再按公开页面的方式生成锚点。
    const published = JSON.parse(serializeEntries(entries)) as LogEntry[];
    const after = new Map(withAnchors(published).map(({ anchor, entry }) => [anchor, entry]));
    for (const { entry, anchor } of withAnchors(initialEntries)) expect(after.get(anchor)).toEqual(entry);
    const sameDay = published.filter((entry) => entry.date === date);
    expect(sameDay[sameDay.length - 1]).toEqual(added);
    if (date === '2026-12-01') expect(published[0]).toEqual(added); // 新日期仍排在最前
  });
});
