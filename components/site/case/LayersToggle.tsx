'use client';

import { useState } from 'react';
import { BLOCK_UI, LAYERS, tx, type Lang } from '../../../src/lib/site/case-reincarnation';

/**
 * 行为的五层（稿 layers）：每层一条上线 + 编号 + 名 + 一句话。
 * 「让它死去」把五条线同时收掉、整体压暗——设计里死亡就是五层同时停止；「重新醒来」再展开。
 */
export function LayersToggle({ lang = 'en' }: { lang?: Lang }) {
  const ui = BLOCK_UI[lang];
  const [off, setOff] = useState(false);
  return (
    <div className="cs-layers">
      <div className="cs-layers__grid">
        {LAYERS.map((l, i) => (
          <div className="cs-layer" key={i} style={{ opacity: off ? 0.4 : 1 }}>
            <span className="cs-layer__line">
              <i style={{ transform: `scaleX(${off ? 0 : 1})` }} />
            </span>
            <span className="cs-layer__n">{String(i + 1).padStart(2, '0')}</span>
            <span className="cs-layer__name">{tx(l.name, lang)}</span>
            <span className="cs-layer__x">{tx(l.x, lang)}</span>
          </div>
        ))}
      </div>
      <div className="cs-layers__act">
        <button type="button" className="cs-ghostbtn" aria-pressed={off} onClick={() => setOff(!off)}>
          {off ? ui.layersOn : ui.layersOff}
        </button>
        <span className="cs-note">{ui.layersNote}</span>
      </div>
    </div>
  );
}
