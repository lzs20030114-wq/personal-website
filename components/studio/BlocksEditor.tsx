'use client';

import { useRef, useState } from 'react';
import type {
  LogBlock,
  LogCell,
  LogImageBlock,
  LogTableBlock,
} from '../../src/lib/site/log-schema';
import { BiField, OptionalBiField } from './fields';

/**
 * 图 / 表块编辑器（内容池 `blocks` 字段，MAPPING §8.5 预留、2026-07-28 落地）。
 * 块按数组顺序渲染在正文之后，可上移下移删除。
 *
 * 表格单元格有两种形态：**双语**（散文性内容）与**统一**（一个字符串，两种语言相同——
 * 数字、单位、零件代号）。默认统一：日志里的表大多是数字表，逼着把 `0.34 mm` 抄两遍
 * 只会制造抄错的机会。
 */

const EMPTY_CELL = '—';

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function CellEditor({ cell, onChange }: { cell: LogCell; onChange: (next: LogCell) => void }) {
  const bilingual = typeof cell !== 'string';
  return (
    <div className="studio-cell" data-bi={bilingual}>
      {bilingual ? (
        <>
          <input
            type="text"
            aria-label="英文"
            value={cell.en}
            onChange={(e) => onChange({ ...cell, en: e.target.value })}
          />
          <input
            type="text"
            aria-label="中文"
            value={cell.zh}
            onChange={(e) => onChange({ ...cell, zh: e.target.value })}
          />
        </>
      ) : (
        <input
          type="text"
          aria-label="两种语言相同"
          value={cell}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <button
        type="button"
        className="studio-cell__mode"
        title={bilingual ? '改为两种语言相同' : '改为分别填中英'}
        onClick={() =>
          onChange(bilingual ? cell.en || cell.zh || EMPTY_CELL : { en: cell, zh: cell })
        }
      >
        {bilingual ? '双语' : '统一'}
      </button>
    </div>
  );
}

function TableEditor({
  block,
  onChange,
}: {
  block: LogTableBlock;
  onChange: (next: LogTableBlock) => void;
}) {
  const cols = block.head.length;

  const setHead = (i: number, cell: LogCell) =>
    onChange({ ...block, head: block.head.map((c, ci) => (ci === i ? cell : c)) });
  const setCell = (ri: number, ci: number, cell: LogCell) =>
    onChange({
      ...block,
      rows: block.rows.map((row, r) => (r === ri ? row.map((c, i) => (i === ci ? cell : c)) : row)),
    });

  return (
    <div className="studio-table">
      <div className="studio-table__grid" style={{ ['--cols' as string]: cols }}>
        <div className="studio-table__row studio-table__row--head">
          {block.head.map((c, i) => (
            <div className="studio-table__col" key={i}>
              <CellEditor cell={c} onChange={(next) => setHead(i, next)} />
              <button
                type="button"
                className="studio-mini studio-mini--danger"
                disabled={cols <= 1}
                title="删除这一列"
                onClick={() =>
                  onChange({
                    ...block,
                    head: block.head.filter((_, ci) => ci !== i),
                    rows: block.rows.map((row) => row.filter((_, ci) => ci !== i)),
                  })
                }
              >
                删列
              </button>
            </div>
          ))}
        </div>
        {block.rows.map((row, ri) => (
          <div className="studio-table__row" key={ri}>
            {row.map((c, ci) => (
              <div className="studio-table__col" key={ci}>
                <CellEditor cell={c} onChange={(next) => setCell(ri, ci, next)} />
              </div>
            ))}
            <button
              type="button"
              className="studio-mini studio-mini--danger studio-table__rowdel"
              disabled={block.rows.length <= 1}
              title="删除这一行"
              onClick={() => onChange({ ...block, rows: block.rows.filter((_, r) => r !== ri) })}
            >
              删行
            </button>
          </div>
        ))}
      </div>
      <div className="studio-row">
        <button
          type="button"
          className="studio-mini"
          onClick={() =>
            onChange({
              ...block,
              head: [...block.head, EMPTY_CELL],
              rows: block.rows.map((row) => [...row, EMPTY_CELL]),
            })
          }
        >
          ＋ 加一列
        </button>
        <button
          type="button"
          className="studio-mini"
          onClick={() =>
            onChange({ ...block, rows: [...block.rows, Array.from({ length: cols }, () => EMPTY_CELL)] })
          }
        >
          ＋ 加一行
        </button>
      </div>
      <OptionalBiField
        label="表格说明"
        value={block.caption}
        onChange={(caption) => onChange({ ...block, caption })}
      />
    </div>
  );
}

function ImageEditor({
  block,
  onChange,
  resolve,
}: {
  block: LogImageBlock;
  onChange: (next: LogImageBlock) => void;
  resolve: (src: string) => string;
}) {
  return (
    <div className="studio-image">
      <div className="studio-image__preview">
        <img src={resolve(block.src)} alt="" />
        <span className="studio-image__meta">
          {block.src.replace('/log/', '')} · {block.width}×{block.height}
        </span>
      </div>
      <BiField
        label="替代文字"
        value={block.alt}
        hint="读屏与裂图时唯一的信息来源，必填"
        onChange={(alt) => onChange({ ...block, alt })}
      />
      <OptionalBiField
        label="图注"
        value={block.caption}
        onChange={(caption) => onChange({ ...block, caption })}
      />
    </div>
  );
}

export function BlocksEditor({
  blocks,
  onChange,
  onPickImage,
  resolve,
}: {
  blocks: LogBlock[];
  onChange: (next: LogBlock[]) => void;
  /** 选好文件后由上层压缩、登记待传图片，返回可直接插入的图片块 */
  onPickImage: (file: File) => Promise<LogImageBlock>;
  resolve: (src: string) => string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (files === null || files.length === 0) return;
    setBusy(true);
    setError(null);
    const added: LogBlock[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push(await onPickImage(file));
      } catch (err) {
        setError(`${file.name}：${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (added.length > 0) onChange([...blocks, ...added]);
    setBusy(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  const set = (i: number, next: LogBlock) => onChange(blocks.map((b, bi) => (bi === i ? next : b)));

  return (
    <section className="studio-blocks">
      <div className="studio-blocks__head">
        <h3>图与表</h3>
        <div className="studio-row">
          <button
            type="button"
            className="studio-mini"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? '处理中…' : '＋ 图片'}
          </button>
          <button
            type="button"
            className="studio-mini"
            onClick={() =>
              onChange([
                ...blocks,
                {
                  kind: 'table',
                  head: [EMPTY_CELL, EMPTY_CELL],
                  rows: [
                    [EMPTY_CELL, EMPTY_CELL],
                    [EMPTY_CELL, EMPTY_CELL],
                  ],
                },
              ])
            }
          >
            ＋ 表格
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
      </div>
      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
      {blocks.length === 0 ? (
        <p className="studio-empty">
          还没有图或表。图片会自动缩到长边 1600px 并转 WebP，随条目一起提交。
        </p>
      ) : (
        blocks.map((b, i) => (
          <article className="studio-block" key={i}>
            <header className="studio-block__bar">
              <span className="studio-block__kind">
                {i + 1}. {b.kind === 'image' ? '图片' : '表格'}
              </span>
              <div className="studio-row">
                <button
                  type="button"
                  className="studio-mini"
                  disabled={i === 0}
                  onClick={() => onChange(moveItem(blocks, i, i - 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="studio-mini"
                  disabled={i === blocks.length - 1}
                  onClick={() => onChange(moveItem(blocks, i, i + 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="studio-mini studio-mini--danger"
                  onClick={() => onChange(blocks.filter((_, bi) => bi !== i))}
                >
                  删除
                </button>
              </div>
            </header>
            {b.kind === 'image' ? (
              <ImageEditor block={b} onChange={(next) => set(i, next)} resolve={resolve} />
            ) : (
              <TableEditor block={b} onChange={(next) => set(i, next)} />
            )}
          </article>
        ))
      )}
    </section>
  );
}
