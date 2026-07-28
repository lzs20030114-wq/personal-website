'use client';

import type { Bilingual } from '../../src/lib/site/log-schema';

/**
 * 双语字段：中英并排必填（2026-07-28 拍板）。两栏永远同时出现在眼前——
 * 这是「不许出现语言孤岛」这条规则在界面上的样子，而不是靠发布时报错来提醒。
 */
export function BiField({
  label,
  value,
  onChange,
  rows = 1,
  hint,
  placeholder,
}: {
  label: string;
  value: Bilingual;
  onChange: (next: Bilingual) => void;
  rows?: number;
  hint?: string;
  placeholder?: { en?: string; zh?: string };
}) {
  const missing = value.en.trim() === '' || value.zh.trim() === '';
  return (
    <div className="studio-field" data-missing={missing}>
      <div className="studio-field__head">
        <span className="studio-field__label">{label}</span>
        {hint && <span className="studio-field__hint">{hint}</span>}
      </div>
      <div className="studio-field__pair">
        {(['en', 'zh'] as const).map((lang) => (
          <label key={lang} className="studio-field__slot">
            <span className="studio-field__lang">{lang === 'en' ? 'EN' : '中文'}</span>
            {rows > 1 ? (
              <textarea
                rows={rows}
                value={value[lang]}
                placeholder={placeholder?.[lang]}
                onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
              />
            ) : (
              <input
                type="text"
                value={value[lang]}
                placeholder={placeholder?.[lang]}
                onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
              />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

/** 可选的双语字段（图注这类）：没有就不占位置，加上之后中英仍然都要填。 */
export function OptionalBiField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Bilingual | undefined;
  onChange: (next: Bilingual | undefined) => void;
}) {
  if (value === undefined) {
    return (
      <button type="button" className="studio-mini" onClick={() => onChange({ en: '', zh: '' })}>
        ＋ {label}
      </button>
    );
  }
  return (
    <div className="studio-optional">
      <BiField label={label} value={value} onChange={onChange} />
      <button type="button" className="studio-mini" onClick={() => onChange(undefined)}>
        移除{label}
      </button>
    </div>
  );
}
