'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BLOCK_UI,
  DIM,
  INK,
  LIFE,
  LIVES,
  PERSONAS,
  lifeState,
  tx,
  type Lang,
} from '../../../src/lib/site/case-reincarnation';
import { useInView, useReducedMotion } from './hooks';

/**
 * 生命周期状态图（稿 life，N05）：一世 = 诞生 → 成长与互动 → 衰老 → 死亡 → 空白，
 * 播放头 8 秒走完一世（1 秒 ≈ 1 分钟），四世一轮；当前所处的段亮、其余压暗，下方四格标出第几世与对应人格。
 * 只在可见时跑 rAF；reduced-motion 下不动，所有段常亮。
 * 播放头位置直接写 style（逐帧），React 状态只在「换段 / 换世」时才更新。
 */
export function LifeCycle({ id = 'N05', lang = 'en' }: { id?: string; lang?: Lang }) {
  const ui = BLOCK_UI[lang];
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const inView = useInView(root);
  const [st, setSt] = useState({ life: -1, stage: -1 });
  const stRef = useRef(st);

  useEffect(() => {
    if (reduced || !inView) return;
    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = lifeState((now - t0) / 1000);
      if (head.current) head.current.style.left = `${(s.w * 100).toFixed(2)}%`;
      if (s.life !== stRef.current.life || s.stage !== stRef.current.stage) {
        stRef.current = { life: s.life, stage: s.stage };
        setSt(stRef.current);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduced, inView]);

  const live = !reduced && st.stage >= 0;
  return (
    <figure className="cs-panel" ref={root}>
      <div className="cs-panel__row">
        <span className="cs-id">
          {id} · {ui.lifeTitle}
        </span>
        <span className="cs-dim">{ui.lifeScale}</span>
      </div>
      <div className="cs-life__bar">
        {LIFE.map((s, i) => (
          <div
            className="cs-life__seg"
            key={i}
            style={{
              flexGrow: s.g,
              background: s.bg,
              color: s.fg ?? INK,
              opacity: !live || st.stage === i ? 1 : 0.45,
            }}
          >
            <b>{tx(s.n, lang)}</b>
            <span>{s.dur}</span>
          </div>
        ))}
        {!reduced && <span className="cs-life__head" ref={head} aria-hidden />}
      </div>
      <div className="cs-life__lives">
        {LIVES.map((l, i) => {
          const on = live && st.life === i;
          return (
            <div key={i} style={{ borderTopColor: on ? PERSONAS[i].ink : 'oklch(0.95 0.032 120 / .14)' }}>
              <span>{tx(l, lang)}</span>
              <span style={{ color: on ? INK : DIM }}>
                {PERSONAS[i].k} · {tx(PERSONAS[i].name, lang)}
              </span>
            </div>
          );
        })}
      </div>
      <figcaption className="cs-note">{ui.lifeNote}</figcaption>
    </figure>
  );
}
