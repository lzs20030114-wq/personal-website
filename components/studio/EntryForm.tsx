'use client';

import { useState } from 'react';
import type { LogEntry, LogImageBlock, LogLang, LogTag } from '../../src/lib/site/log-schema';
import type { TagOption } from '../../src/lib/studio/vocab';
import { LogBody } from '../site/LogBody';
import { BlocksEditor } from './BlocksEditor';
import { BiField } from './fields';

/**
 * 一条日志的表单 + 实时预览。
 *
 * 标签这一栏是下拉而不是自由输入，因为守门规则（src/lib/site/log-guards）要求：
 * 项目标签必须是 PROJECT_GROUPS 登记过的（否则条目会从所有筛选视图里消失），
 * 同一英文标签只能有一个中文译名。下拉选出来的必然合规；方面允许新增，但要中英一起填。
 *
 * 预览用的是站上那个 LogBody 组件本身——预览与线上必须是同一段代码画的。
 */

const MD_HINT = '支持：### 小标题 · - 列表 · 1. 编号 · **加粗** · `代码` · [文字](链接) · ``` 代码块';

function tagsWith(outline: LogTag | null, neutral: LogTag | null): LogTag[] {
  // 顺序固定 outline → neutral：与池内既有条目一致，避免整文件 diff 抖动
  return [outline, neutral].filter((t): t is LogTag => t !== null);
}

export function EntryForm({
  entry,
  onChange,
  onDelete,
  buckets,
  aspects,
  onPickImage,
  resolve,
}: {
  entry: LogEntry;
  onChange: (next: LogEntry) => void;
  onDelete: () => void;
  buckets: (TagOption & { project: string })[];
  aspects: TagOption[];
  onPickImage: (file: File) => Promise<LogImageBlock>;
  resolve: (src: string) => string;
}) {
  const [lang, setLang] = useState<LogLang>('zh');
  const outline = entry.tags.find((t) => t.variant === 'outline') ?? null;
  const neutral = entry.tags.find((t) => t.variant === 'neutral') ?? null;
  const knownAspect = neutral !== null && aspects.some((a) => a.en === neutral.label.en);
  const [customAspect, setCustomAspect] = useState(neutral !== null && !knownAspect);

  const setOutline = (en: string) => {
    const opt = buckets.find((b) => b.en === en);
    onChange({
      ...entry,
      tags: tagsWith(
        opt ? { label: { en: opt.en, zh: opt.zh }, variant: 'outline' } : null,
        neutral,
      ),
    });
  };

  const setNeutral = (next: LogTag | null) => {
    onChange({ ...entry, tags: tagsWith(outline, next) });
  };

  return (
    <div className="studio-form">
      <div className="studio-row studio-row--wrap">
        <label className="studio-field studio-field--inline">
          <span className="studio-field__label">日期</span>
          <input
            type="date"
            value={entry.date}
            onChange={(e) => onChange({ ...entry, date: e.target.value })}
          />
        </label>

        <label className="studio-field studio-field--inline">
          <span className="studio-field__label">项目</span>
          <select value={outline?.label.en ?? ''} onChange={(e) => setOutline(e.target.value)}>
            <option value="">（未选）</option>
            {buckets.map((b) => (
              <option key={b.en} value={b.en}>
                {b.en} {b.zh} · {b.project}
              </option>
            ))}
          </select>
        </label>

        <label className="studio-field studio-field--inline">
          <span className="studio-field__label">方面</span>
          <select
            value={customAspect ? '__custom' : (neutral?.label.en ?? '')}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__custom') {
                setCustomAspect(true);
                setNeutral({ label: { en: '', zh: '' }, variant: 'neutral' });
              } else if (v === '') {
                setCustomAspect(false);
                setNeutral(null);
              } else {
                setCustomAspect(false);
                const opt = aspects.find((a) => a.en === v);
                if (opt) setNeutral({ label: { en: opt.en, zh: opt.zh }, variant: 'neutral' });
              }
            }}
          >
            <option value="">（无）</option>
            {aspects.map((a) => (
              <option key={a.en} value={a.en}>
                {a.en} {a.zh}
              </option>
            ))}
            <option value="__custom">＋ 新方面…</option>
          </select>
        </label>
      </div>

      {customAspect && neutral !== null && (
        <BiField
          label="新方面标签"
          value={neutral.label}
          hint="中英都要填；同一英文名在全站只能有一个中文译名"
          onChange={(label) => setNeutral({ label, variant: 'neutral' })}
        />
      )}

      <BiField
        label="引句（收起时显示的一句概括）"
        value={entry.lead}
        rows={2}
        onChange={(lead) => onChange({ ...entry, lead })}
      />
      <BiField
        label="正文（展开后的详情）"
        value={entry.body}
        rows={10}
        hint={MD_HINT}
        onChange={(body) => onChange({ ...entry, body })}
      />

      <BlocksEditor
        blocks={entry.blocks ?? []}
        onChange={(blocks) => onChange({ ...entry, blocks: blocks.length > 0 ? blocks : undefined })}
        onPickImage={onPickImage}
        resolve={resolve}
      />

      <section className="studio-preview pg-dark">
        <header className="studio-preview__bar">
          <h3>预览</h3>
          <div className="studio-row">
            {(['en', 'zh'] as const).map((l) => (
              <button
                key={l}
                type="button"
                className="studio-mini"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
              >
                {l === 'en' ? 'EN' : '中文'}
              </button>
            ))}
          </div>
        </header>
        <div className="studio-preview__body">
          <div className="log-entry__meta">
            <span className="log-entry__date">{entry.date.slice(5)}</span>
            <span className="log-entry__tags">
              {entry.tags.map((t) => (
                <span key={t.label.en} className={`tag tag-${t.variant}`}>
                  {t.label[lang]}
                </span>
              ))}
            </span>
          </div>
          <p className="log-entry__lead">{entry.lead[lang] || '（引句还空着）'}</p>
          <LogBody body={entry.body[lang]} blocks={entry.blocks} lang={lang} resolve={resolve} />
        </div>
      </section>

      <footer className="studio-form__foot">
        <button
          type="button"
          className="studio-mini studio-mini--danger"
          onClick={() => {
            if (confirm(`删除 ${entry.date} 这条？发布之后才会真的从站上消失。`)) onDelete();
          }}
        >
          删除这条日志
        </button>
      </footer>
    </div>
  );
}
