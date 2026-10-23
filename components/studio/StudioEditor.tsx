'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  serializeEntries,
  sortEntries,
  type LogEntry,
  type LogImageBlock,
} from '../../src/lib/site/log-schema';
import { imageFileName, LOG_IMAGE_URL, validateEntries } from '../../src/lib/studio/publish';
import { aspectOptions, bucketOptions } from '../../src/lib/studio/vocab';
import { createLogEntryId, ensureLogEntryIds, restoreLogEntryIds } from '../../src/lib/site/log-identity';
import { logoutAction } from '../../app/studio/actions';
import { EntryForm } from './EntryForm';
import { prepareImage, type PreparedImage } from './image';

/**
 * Studio 主界面：左边条目清单，右边表单 + 预览，顶栏一个「发布」。
 *
 * 三条设计决定值得写下来：
 *  ① **改多条 → 一次发布 = 一个 commit**。逐条发布会把 Vercel Hobby 的 100 次/天部署额度
 *     很快烧掉（CLAUDE.md 部署纪律记着 2026-07-10 那次事故），所以编辑器全程在本地攒改动。
 *  ② **发布前跑的是构建期同一套校验**（src/lib/studio/publish → log-schema + log-guards）。
 *     校验不过就根本不提交——不给「提交上去、线上构建 fail、站点停在旧版直到修好」留口子。
 *  ③ **草稿存 localStorage**。发布之前一切只在浏览器里，误关标签页不该等于白写一晚上。
 */

type Item = { id: string; entry: LogEntry };

const DRAFT_KEY = 'studio-draft-v1';

let seq = 0;
const nextId = () => `e${(seq += 1)}`;

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function blankEntry(usedIds: Iterable<string>): LogEntry {
  const date = today();
  return { id: createLogEntryId(date, usedIds), date, lead: { en: '', zh: '' }, body: { en: '', zh: '' }, tags: [] };
}

type Draft = {
  baseSha: string | null;
  savedAt: number;
  entries: LogEntry[];
  images: PreparedImage[];
};

export function StudioEditor({
  initialEntries,
  baseSha: initialSha,
  source,
  target,
  existingImages,
}: {
  initialEntries: LogEntry[];
  baseSha: string | null;
  source: 'github' | 'local';
  target: string;
  existingImages: string[];
}) {
  const initialPool = useMemo(() => ensureLogEntryIds(initialEntries), [initialEntries]);
  const [items, setItems] = useState<Item[]>(() =>
    initialPool.map((entry) => ({ id: nextId(), entry })),
  );
  const [baseline, setBaseline] = useState(() => serializeEntries(initialPool));
  const [baseSha, setBaseSha] = useState(initialSha);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, PreparedImage>>({});
  const [query, setQuery] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; url?: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftTooBig, setDraftTooBig] = useState(false);
  const restored = useRef(false);
  // 挂载时读草稿与自动保存属于同一轮 effect；ref 让后者立即知道尚待作者选择。
  const draftDecisionPending = useRef(false);
  // 文件名的占用跨渲染、同批异步上传和发布保留，不能只看那一帧的 pending。
  const reservedImageNames = useRef(new Set(existingImages));

  const entries = useMemo(() => items.map((i) => i.entry), [items]);
  const dirty = serializeEntries(entries) !== baseline;
  const check = useMemo(() => validateEntries(entries), [entries]);
  const buckets = useMemo(() => bucketOptions(initialEntries), [initialEntries]);
  const aspects = useMemo(() => aspectOptions(initialEntries), [initialEntries]);

  /* 草稿：挂载时读一次（不自动套用——直接覆盖会让人不知道自己看的是哪一版）。 */
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw === null) return;
      const parsed = JSON.parse(raw) as Draft;
      if (serializeEntries(parsed.entries) !== serializeEntries(initialPool)) {
        draftDecisionPending.current = true;
        setDraft(parsed);
      } else localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* 草稿读坏了不该让编辑器打不开 */
    }
  }, [initialPool]);

  /* 自动存草稿。图片是 base64，几张就能顶到 localStorage 的 5MB 配额上限——
     撞上了就退回「只存文字」，并在界面上说清楚图片没进草稿。 */
  useEffect(() => {
    if (draftDecisionPending.current) return;
    if (!dirty && Object.keys(pending).length === 0) {
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* 无所谓 */
      }
      return;
    }
    const images = Object.values(pending);
    const write = (payload: Draft) => localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    const base: Draft = { baseSha, savedAt: Date.now(), entries, images };
    try {
      write(base);
      setDraftTooBig(false);
    } catch {
      try {
        write({ ...base, images: [] });
        setDraftTooBig(images.length > 0);
      } catch {
        /* 连文字都存不下（隐私模式等）——放弃草稿功能，不影响编辑 */
      }
    }
  }, [entries, pending, dirty, baseSha, draft]);

  const current = items.find((i) => i.id === selected) ?? null;

  /** 尚未提交的图在 /log/ 下还取不到，预览换成本地 data URL。 */
  const resolve = (src: string) => pending[src.slice(LOG_IMAGE_URL.length)]?.dataUrl ?? src;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...items].sort((a, b) =>
      a.entry.date < b.entry.date ? 1 : a.entry.date > b.entry.date ? -1 : 0,
    );
    if (q === '') return sorted;
    return sorted.filter((i) =>
      [i.entry.date, i.entry.lead.en, i.entry.lead.zh, i.entry.body.en, i.entry.body.zh]
        .join('\n')
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  function update(id: string, entry: LogEntry) {
    setItems((prev) => prev.map((i) => (i.id === id ? { id, entry } : i)));
  }

  function addEntry() {
    const item = { id: nextId(), entry: blankEntry(entries.flatMap((entry) => entry.id ? [entry.id] : [])) };
    // 日期倒序由 shown / sortEntries 负责；同日新条目排在末尾，避免挤动既有日志锚点。
    setItems((prev) => [...prev, item]);
    setSelected(item.id);
    setResult(null);
  }

  async function pickImage(file: File, date: string): Promise<LogImageBlock> {
    const image = await prepareImage(file, date, [...reservedImageNames.current]);
    // 解码/压缩期间其他图可能已完成。完成后同步分配并占用名字，不能沿用旧快照。
    const ext = image.name.slice(image.name.lastIndexOf('.') + 1);
    const prepared = {
      ...image,
      name: imageFileName(date, file.name, ext, reservedImageNames.current),
    };
    reservedImageNames.current.add(prepared.name);
    setPending((prev) => ({ ...prev, [prepared.name]: prepared }));
    return {
      kind: 'image',
      src: `${LOG_IMAGE_URL}${prepared.name}`,
      alt: { en: '', zh: '' },
      width: prepared.width,
      height: prepared.height,
    };
  }

  async function publish() {
    setPublishing(true);
    setResult(null);
    try {
      // 只提交条目真正引用到的图（加了图块又删掉的不往仓库里留垃圾）
      const referenced = new Set(
        entries.flatMap((e) =>
          (e.blocks ?? [])
            .filter((b) => b.kind === 'image')
            .map((b) => (b as LogImageBlock).src.slice(LOG_IMAGE_URL.length)),
        ),
      );
      const images = Object.values(pending)
        .filter((img) => referenced.has(img.name))
        .map((img) => ({ name: img.name, dataBase64: img.base64 }));
      const submittedNames = new Set(images.map((image) => image.name));

      const res = await fetch('/api/studio/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: sortEntries(entries), baseSha, images }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        errors?: string[];
        mode?: string;
        url?: string | null;
        entriesSha?: string | null;
      };
      if (!res.ok || body.ok !== true) {
        setResult({ ok: false, message: (body.errors ?? ['发布失败']).join('\n') });
        return;
      }
      setBaseline(serializeEntries(entries));
      setBaseSha(body.entriesSha ?? null);
      // 只清理实际提交且未被替换的图片，保留后来新增或本次尚未引用的图。
      setPending((current) => Object.fromEntries(
        Object.entries(current).filter(([name, image]) => !submittedNames.has(name) || pending[name] !== image),
      ));
      // 草稿由上面的 effect 按最新 entries/pending 清理或续存，不能在这里删除新改动。
      setResult({
        ok: true,
        message:
          body.mode === 'local'
            ? '已写入本地 content/log/entries.json 与 public/log/（记得自己 commit）'
            : '已提交。Vercel 正在部署，约 1–2 分钟后 /archive 上就能看到。',
        url: body.url ?? undefined,
      });
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="studio-shell">
      <header className="studio-bar">
        <div className="studio-bar__left">
          <strong>Work log studio</strong>
          <span className="studio-bar__meta">
            {items.length} 条 · 发布到 {target}
            {source === 'local' && ' · 本地文件模式'}
          </span>
        </div>
        <div className="studio-row">
          <a className="studio-mini" href="/studio/visitors">
            访客记录
          </a>
          <a className="studio-mini" href="/archive" target="_blank" rel="noreferrer">
            看线上 ↗
          </a>
          <span className="studio-bar__state" data-dirty={dirty}>
            {dirty ? '有未发布的改动' : '与线上一致'}
          </span>
          <button
            type="button"
            className="studio-publish"
            disabled={publishing || !dirty || !check.ok}
            onClick={() => void publish()}
            title={check.ok ? '' : '有问题没解决，先修完再发布'}
          >
            {publishing ? '发布中…' : '发布'}
          </button>
          <form action={logoutAction}>
            <button type="submit" className="studio-mini">
              退出
            </button>
          </form>
        </div>
      </header>

      {draft !== null && (
        <div className="studio-banner">
          <span>
            检测到未发布的草稿（{new Date(draft.savedAt).toLocaleString('zh-CN')}，
            {draft.entries.length} 条{draft.images.length > 0 ? `、${draft.images.length} 张待传图` : ''}）。
          </span>
          <div className="studio-row">
            <button
              type="button"
              className="studio-mini"
              onClick={() => {
                let recovered: LogEntry[];
                try {
                  recovered = restoreLogEntryIds(draft.entries, initialPool);
                } catch (err) {
                  setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
                  return;
                }
                setItems(recovered.map((entry) => ({ id: nextId(), entry })));
                setPending(Object.fromEntries(draft.images.map((img) => [img.name, img])));
                setBaseSha(draft.baseSha);
                for (const image of draft.images) reservedImageNames.current.add(image.name);
                draftDecisionPending.current = false;
                setSelected(null);
                setDraft(null);
              }}
            >
              恢复草稿
            </button>
            <button
              type="button"
              className="studio-mini studio-mini--danger"
              onClick={() => {
                try {
                  localStorage.removeItem(DRAFT_KEY);
                } catch {
                  /* 无所谓 */
                }
                draftDecisionPending.current = false;
                setDraft(null);
              }}
            >
              丢弃草稿
            </button>
          </div>
        </div>
      )}

      {draftTooBig && (
        <div className="studio-banner studio-banner--warn">
          草稿里放不下图片（浏览器存储配额）：文字已保存，但待传的图片在关掉页面后会丢——
          先把这条发布掉更稳妥。
        </div>
      )}

      {result !== null && (
        <div className="studio-banner" data-ok={result.ok} role="status">
          <span style={{ whiteSpace: 'pre-line' }}>{result.message}</span>
          {result.url && (
            <a href={result.url} target="_blank" rel="noreferrer">
              查看 commit ↗
            </a>
          )}
        </div>
      )}

      {!check.ok && (
        <div className="studio-banner studio-banner--warn">
          <div>
            <strong>发布被拦住了</strong>
            <ul className="studio-errors">
              {check.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="studio-main">
        <aside className="studio-list">
          <div className="studio-list__head">
            <button type="button" className="studio-mini" onClick={addEntry}>
              ＋ 新建条目
            </button>
            <input
              type="search"
              placeholder="搜索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ol>
            {shown.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  className="studio-list__item"
                  aria-current={i.id === selected}
                  onClick={() => setSelected(i.id)}
                >
                  <span className="studio-list__date">{i.entry.date}</span>
                  <span className="studio-list__lead">
                    {i.entry.lead.zh || i.entry.lead.en || '（空条目）'}
                  </span>
                  <span className="studio-list__tags">
                    {i.entry.tags.map((t) => t.label.en).join(' · ')}
                    {(i.entry.blocks?.length ?? 0) > 0 && ` · ${i.entry.blocks!.length} 块`}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <main className="studio-pane">
          {current === null ? (
            <div className="studio-empty studio-empty--pane">
              <p>左边选一条来改，或者新建一条。</p>
              <p>
                改动都先攒在本地；点「发布」才会打一个 commit（一次发布 = 一次部署，别一条一条发）。
              </p>
            </div>
          ) : (
            <EntryForm
              key={current.id}
              entry={current.entry}
              onChange={(entry) => update(current.id, entry)}
              onDelete={() => {
                setItems((prev) => prev.filter((i) => i.id !== current.id));
                setSelected(null);
              }}
              buckets={buckets}
              aspects={aspects}
              onPickImage={(file) => pickImage(file, current.entry.date)}
              resolve={resolve}
            />
          )}
        </main>
      </div>
    </div>
  );
}
