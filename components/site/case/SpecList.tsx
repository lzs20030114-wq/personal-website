'use client';

import { useState } from 'react';
import { BLOCK_UI, SPECS, SPECS_VISIBLE, tx, type Lang } from '../../../src/lib/site/case-reincarnation';

/** 技术参数（稿 specs）：默认露出前 8 条，其余折叠；尚待确认的值用琥珀色。 */
export function SpecList({ lang = 'en' }: { lang?: Lang }) {
  const ui = BLOCK_UI[lang];
  const [all, setAll] = useState(false);
  const rows = all ? SPECS : SPECS.slice(0, SPECS_VISIBLE);
  return (
    <div className="cs-specs">
      <dl>
        {rows.map((s, i) => (
          <div key={i}>
            <dt>{tx(s.k, lang)}</dt>
            <dd data-pend={s.pending ? '' : undefined}>{tx(s.v, lang)}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="cs-more" aria-expanded={all} onClick={() => setAll(!all)}>
        {all ? ui.specsFew : ui.specsAll(SPECS.length)}
      </button>
    </div>
  );
}
