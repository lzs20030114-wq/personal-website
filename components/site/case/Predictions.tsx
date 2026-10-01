'use client';

import { useState } from 'react';
import { AM, BLOCK_UI, LIVES, PREDICTIONS, tx, type Lang } from '../../../src/lib/site/case-reincarnation';

/**
 * 四次死亡的预测（稿 predict）：2026-04-03 写下、尚无数据。标签页 = 第一世…第四世，
 * 四根横条是困扰程度（0–100）的预测区间，点条或点标签都能切；选中那世下面展开行为 / 主观报告 / 生理三列预测。
 * 「> 第一世」这根是虚线空心条——只有方向（高于死亡 1）、没有数值区间。
 */
export function Predictions({ lang = 'en' }: { lang?: Lang }) {
  const ui = BLOCK_UI[lang];
  const [i, setI] = useState(0);
  const cur = PREDICTIONS[i];
  const cols = [cur.b, cur.r, cur.p];
  return (
    <figure className="cs-pred">
      <div className="cs-pred__head">
        <span className="cs-pred__kick">
          <span>{ui.prKicker}</span>
          <span>{ui.prTitle}</span>
        </span>
        <span className="cs-seg" role="tablist">
          {LIVES.map((l, k) => (
            <button key={k} type="button" role="tab" aria-selected={k === i} onClick={() => setI(k)}>
              {tx(l, lang)}
            </button>
          ))}
        </span>
      </div>
      <div className="cs-pred__bars">
        {PREDICTIONS.map((p, k) => {
          const on = k === i;
          return (
            <button key={k} type="button" className="cs-pred__bar" style={{ opacity: on ? 1 : 0.55 }} onClick={() => setI(k)}>
              <span>{tx(LIVES[k], lang)}</span>
              <span className="cs-pred__track">
                <i
                  style={{
                    left: `${p.lo}%`,
                    width: `${p.hi - p.lo}%`,
                    background: p.dash ? 'transparent' : on ? AM : 'oklch(0.83 0.12 85 / .35)',
                    borderStyle: p.dash ? 'dashed' : 'solid',
                  }}
                />
              </span>
              <span>{typeof p.v === 'string' ? p.v : tx(p.v, lang)}</span>
            </button>
          );
        })}
        <span className="cs-pred__axis">
          <span />
          <span>
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </span>
          <span>{ui.prAxis}</span>
        </span>
      </div>
      <div className="cs-pred__cols">
        {cols.map((c, k) => (
          <div key={k}>
            <span>{ui.prCols[k]}</span>
            <span>{tx(c, lang)}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
