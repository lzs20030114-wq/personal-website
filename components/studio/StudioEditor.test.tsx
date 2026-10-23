import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';
import { getLogEntries } from '../../src/lib/site/log';
import { withAnchors } from '../../src/lib/site/log-facets';
import { serializeEntries, type LogEntry, type LogImageBlock } from '../../src/lib/site/log-schema';
import { imageFileName, validateEntries } from '../../src/lib/studio/publish';
import { StudioEditor } from './StudioEditor';
import { EntryForm } from './EntryForm';
import type { PreparedImage } from './image';

// 只替换 React 调度和外部副作用；运行编辑器真实的恢复、上传和发布回调。
// ref 与 effect 依赖跨渲染保留，挂载 effect 按声明顺序运行。
const host = vi.hoisted(() => ({
  states: [] as unknown[], cursor: 0,
  refs: [] as { current: unknown }[], refCursor: 0,
  effectDeps: [] as (readonly unknown[] | undefined)[], effectCursor: 0,
  effects: [] as (() => void)[],
}));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: (effect: () => void, deps?: readonly unknown[]) => {
    const slot = host.effectCursor++;
    const previous = host.effectDeps[slot];
    if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous[index]))) {
      host.effects.push(effect);
    }
    host.effectDeps[slot] = deps;
  },
  useRef: (current: unknown) => {
    const slot = host.refCursor++;
    return host.refs[slot] ??= { current };
  },
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
// 浏览器解码/压缩不属于这些回归；保留异步返回与真实命名函数，模拟图片内容互不相同。
vi.mock('./image', () => ({ prepareImage: async (file: File, date: string, taken: string[]): Promise<PreparedImage> => {
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
  return { name: imageFileName(date, file.name, 'webp', taken), base64,
    dataUrl: `data:image/webp;base64,${base64}`, width: 10, height: 10, bytes: file.size };
} }));

type Props = { children?: ReactNode; [key: string]: unknown };
type Element = { type: unknown; props: Props };
function elements(node: ReactNode): Element[] {
  return Children.toArray(node).flatMap((child) => isValidElement<Props>(child)
    ? [child, ...elements(child.props.children)] : []);
}
const initialEntries = getLogEntries();
const draftKey = 'studio-draft-v1';
function render() {
  host.cursor = 0;
  host.refCursor = 0;
  host.effectCursor = 0;
  host.effects = [];
  return elements(StudioEditor({ initialEntries, baseSha: 'sha-current', source: 'github', target: 'test', existingImages: [] }));
}
function flushEffects() {
  const effects = host.effects;
  host.effects = [];
  for (const effect of effects) effect();
}
function click(element: Element) { (element.props.onClick as () => void)(); }
function button(label: string, tree = render()) {
  return tree.find((node) => node.type === 'button' && node.props.children === label)!;
}
function selectedForm() {
  let tree = render();
  if (!tree.some((node) => node.type === EntryForm)) {
    click(tree.find((node) => node.type === 'button' && node.props.className === 'studio-list__item')!);
    tree = render();
  }
  return tree.find((node) => node.type === EntryForm)!;
}
function change(form: Element, entry: LogEntry) {
  (form.props.onChange as (entry: LogEntry) => void)(entry);
}
async function pick(form: Element, name: string, content: string): Promise<LogImageBlock> {
  return (form.props.onPickImage as (file: File) => Promise<LogImageBlock>)(new File([content], name));
}
function attach(form: Element, image: LogImageBlock) {
  const entry = form.props.entry as LogEntry;
  change(form, { ...entry, blocks: [...entry.blocks ?? [], { ...image, alt: { en: 'Uploaded image', zh: '上传图片' } }] });
}
function draftFixture() {
  return { baseSha: 'sha-old', savedAt: 1, images: [] as PreparedImage[],
    entries: initialEntries.map((entry, index) => index ? entry : {
      ...entry, lead: { en: 'An unpublished correction.', zh: '未发布的修改。' },
    }),
  };
}
function success() {
  return Response.json({ ok: true, mode: 'github', entriesSha: 'sha-after-publish' });
}
async function waitForPublish() {
  await vi.waitFor(() => expect(host.states[6]).toBe(false));
}
function resetHost() {
  host.states = []; host.refs = []; host.effectDeps = []; host.effects = [];
}

beforeEach(() => {
  resetHost();
  vi.useFakeTimers();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Studio 新建日志的既有链接保护', () => {
  it.each(['2026-07-10', '2026-12-01'])('新增 %s 的条目后，发布排序保留全部旧锚点', (date) => {
    vi.setSystemTime(new Date(2026, 8, 29, 12));
    click(render().find((node) => node.type === 'button' && String(node.props.children).includes('新建条目'))!);
    const form = selectedForm();
    expect((form.props.entry as LogEntry).lead.en).toBe('');
    const added: LogEntry = {
      ...form.props.entry as LogEntry, date,
      lead: { en: 'Added an anchor regression fixture.', zh: '添加日志链接回归用例。' },
      body: initialEntries[0].body, tags: initialEntries[0].tags,
    };
    change(form, added);
    const entries = (host.states[0] as { entry: LogEntry }[]).map((item) => item.entry);
    expect(validateEntries(entries).ok).toBe(true);
    const published = JSON.parse(serializeEntries(entries)) as LogEntry[];
    const after = new Map(withAnchors(published).map(({ anchor, entry }) => [anchor, entry]));
    for (const { entry, anchor } of withAnchors(initialEntries)) expect(after.get(anchor)).toEqual(entry);
    const sameDay = published.filter((entry) => entry.date === date);
    expect(sameDay[sameDay.length - 1]).toEqual(added);
    if (date === '2026-12-01') expect(published[0]).toEqual(added);
  });
});

describe('Studio 草稿恢复', () => {
  it('恢复选择前再次刷新仍保留原草稿，不被初始空闲状态删除', () => {
    const draft = draftFixture();
    localStorage.setItem(draftKey, JSON.stringify(draft));
    render(); flushEffects();
    expect(button('恢复草稿')).toBeDefined();
    expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual(draft);
    resetHost();
    render(); flushEffects();
    expect(button('恢复草稿')).toBeDefined();
    expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual(draft);
  });

  it('恢复旧稿后发布使用旧稿 SHA，服务器冲突时保留草稿', async () => {
    localStorage.setItem(draftKey, JSON.stringify(draftFixture()));
    render(); flushEffects();
    click(button('恢复草稿'));
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ ok: false, errors: ['内容池已改动'] }, { status: 409 }));
    vi.stubGlobal('fetch', fetch);
    click(button('发布'));
    await waitForPublish();
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).baseSha).toBe('sha-old');
    render(); flushEffects();
    const saved = JSON.parse(localStorage.getItem(draftKey)!);
    expect(saved.baseSha).toBe('sha-old');
    expect(saved.entries[0].lead.zh).toBe('未发布的修改。');
  });

  it('只有明确丢弃才删除未恢复的草稿', () => {
    localStorage.setItem(draftKey, JSON.stringify(draftFixture()));
    render(); flushEffects();
    click(button('丢弃草稿'));
    render(); flushEffects();
    expect(localStorage.getItem(draftKey)).toBeNull();
    expect(button('恢复草稿')).toBeUndefined();
  });

  it('旧草稿身份存在歧义时保留原稿和当前内容，不半途套用', () => {
    const { id: _id, ...legacy } = initialEntries[0];
    const draft = { ...draftFixture(), entries: [legacy, { ...legacy }] };
    localStorage.setItem(draftKey, JSON.stringify(draft));
    render(); flushEffects();
    click(button('恢复草稿'));
    render(); flushEffects();
    expect(button('恢复草稿')).toBeDefined();
    expect(JSON.parse(localStorage.getItem(draftKey)!)).toEqual(draft);
    expect((host.states[0] as { entry: LogEntry }[]).map((item) => item.entry)).toEqual(initialEntries);
    expect((host.states[7] as { ok: boolean }).ok).toBe(false);
  });
});

describe('Studio 图片与发布', () => {
  it('同批多选的中文文件名按完成顺序分配不同路径，保留每张图片', async () => {
    const form = selectedForm();
    // 同批回调持有同一渲染快照，模拟 BlocksEditor.handleFiles。
    const first = await pick(form, '图一.png', 'first');
    const second = await pick(form, '图二.png', 'second');
    expect(first.src).not.toBe(second.src);
    const pending = host.states[4] as Record<string, PreparedImage>;
    expect(Object.values(pending).map((image) => image.base64).sort()).toEqual([
      Buffer.from('first').toString('base64'), Buffer.from('second').toString('base64'),
    ].sort());
  });

  it('发布后再次上传同日中文名图片仍避免覆盖刚发布的路径', async () => {
    const form = selectedForm();
    const first = await pick(form, '图一.png', 'first');
    attach(form, first);
    vi.stubGlobal('fetch', vi.fn(async () => success()));
    click(button('发布'));
    await waitForPublish();
    expect(Object.keys(host.states[4] as object)).toHaveLength(0);
    const second = await pick(selectedForm(), '图二.png', 'second');
    expect(second.src).not.toBe(first.src);
  });

  it('批量上传尚未写入图块的图片，在发布期间被引用后仍保留', async () => {
    const form = selectedForm();
    const image = await pick(form, 'batch-first.png', 'batch-first');
    // 批量上传先登记 pending，整批处理完才更新 blocks；此时作者仍可发布其他文字修改。
    change(form, { ...form.props.entry as LogEntry, lead: { en: 'Edited before upload finished.', zh: '上传结束前修改。' } });
    let finish!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { finish = resolve; });
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockReturnValueOnce(response).mockImplementation(async () => success());
    vi.stubGlobal('fetch', fetch);
    click(button('发布'));
    expect(JSON.parse(String(fetch.mock.calls[0][1].body)).images).toEqual([]);
    attach(selectedForm(), image);
    finish(success());
    await waitForPublish();
    expect(Object.keys(host.states[4] as object)).toHaveLength(1);
    click(button('发布'));
    await waitForPublish();
    expect(JSON.parse(String(fetch.mock.calls[1][1].body)).images[0].name).toBe(image.src.slice('/log/'.length));
  });

  it('发布中的新文字和新图片留在草稿，下次发布一并发送', async () => {
    const form = selectedForm();
    const first = await pick(form, 'before.png', 'before');
    attach(form, first);
    let finish!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { finish = resolve; });
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockReturnValueOnce(response).mockImplementation(async () => success());
    vi.stubGlobal('fetch', fetch);
    click(button('发布'));
    const currentForm = selectedForm();
    const second = await pick(currentForm, 'after.png', 'after');
    const current = currentForm.props.entry as LogEntry;
    change(currentForm, { ...current, lead: { en: 'Edited during publication.', zh: '发布中继续修改。' },
      blocks: [...current.blocks ?? [], { ...second, alt: { en: 'Second image', zh: '第二张图' } }],
    });
    finish(success());
    await waitForPublish();
    render(); flushEffects();
    const saved = JSON.parse(localStorage.getItem(draftKey)!);
    expect(saved.baseSha).toBe('sha-after-publish');
    expect(saved.entries[0].lead.zh).toBe('发布中继续修改。');
    expect(saved.images).toHaveLength(1);
    expect(`/log/${saved.images[0].name}`).toBe(second.src);
    expect(JSON.parse(String(fetch.mock.calls[0][1].body)).images).toHaveLength(1);
    click(button('发布'));
    await waitForPublish();
    const next = JSON.parse(String(fetch.mock.calls[1][1].body));
    expect(next.baseSha).toBe('sha-after-publish');
    expect(next.images.map((image: { name: string }) => `/log/${image.name}`)).toEqual([second.src]);
    render(); flushEffects();
    expect(localStorage.getItem(draftKey)).toBeNull();
  });
});
