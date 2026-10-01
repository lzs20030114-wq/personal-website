'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  AGEING_END,
  AGEING_MARKS,
  BLOCK_UI,
  PERSONAS,
  ageTrace,
  deathLabel,
  tx,
  type Lang,
} from '../../../src/lib/site/case-reincarnation';
import { fitCanvas, useInView, useReducedMotion } from './hooks';
import { setPersona, usePersona } from './personaStore';

/**
 * 衰老曲线（稿 ageing，N17）：向下滚动，曲线从左往右「老」下去——进度由画布在视口里的位置决定
 * （滚进来画一点、整块露全时画满），之后四个标注依次浮出：呼吸变浅 → 回应变慢 → 节律变得不规则 →
 * 最后一次呼吸 → 45 秒静止。四个按钮切换四套人格的死法（与 N06 共用选择）。
 * **只画趋势**：数值待作者提供（图注写明），曲线是带种子的合成趋势，不是数据。
 * reduced-motion：直接画满，不随滚动。
 */
export function AgeingCurve({ id = 'N17', lang = 'en' }: { id?: string; lang?: Lang }) {
  const ui = BLOCK_UI[lang];
  const pzi = usePersona();
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const inView = useInView(root);
  const traces = useMemo(() => [0, 1, 2, 3].map(ageTrace), []);
  const live = useRef({ pzi });
  live.current = { pzi };

  useEffect(() => {
    const canvas = cv.current;
    const pl = plate.current;
    if (!canvas || !pl || !inView) return;
    let p = reduced ? 1 : 0;
    let lastDrawn = -1;
    let lastK = -1;
    let lastW = -1;
    let raf = 0;
    let lt = performance.now();

    const draw = () => {
      const k = live.current.pzi;
      const f = fitCanvas(canvas);
      if (!f) return;
      const { ctx, w, h } = f;
      const tr = traces[k];
      const ink = PERSONAS[k].ink;
      const L0 = 24;
      const R0 = w - 24;
      const y0 = h - 48;
      const yT = 44;
      const X = (x: number) => L0 + x * (R0 - L0);
      const Y = (v: number) => y0 - v * (y0 - yT);
      ctx.strokeStyle = 'rgba(235,240,220,.1)';
      ctx.beginPath();
      ctx.moveTo(L0, y0);
      ctx.lineTo(R0, y0);
      ctx.stroke();
      const n = Math.floor(p * (tr.length - 1));
      if (n > 1) {
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const x = X(i / (tr.length - 1));
          const yy = Y(tr[i]);
          if (i) ctx.lineTo(x, yy);
          else ctx.moveTo(x, yy);
        }
        const g = ctx.createLinearGradient(L0, 0, R0, 0);
        g.addColorStop(0, ink);
        g.addColorStop(0.6, ink);
        g.addColorStop(0.77, 'rgba(235,240,220,.5)');
        g.addColorStop(1, 'rgba(235,240,220,.25)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(X(n / (tr.length - 1)), Y(tr[n]), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p > AGEING_END) {
        ctx.fillStyle = 'rgba(235,240,220,.05)';
        ctx.fillRect(X(AGEING_END), yT - 20, X(Math.min(p, 1)) - X(AGEING_END), y0 - yT + 20);
      }
      pl.querySelectorAll<HTMLElement>('[data-agmark]').forEach((el) => {
        el.style.opacity = p >= Number(el.dataset.agmark) ? '1' : '0';
      });
      lastDrawn = p;
      lastK = k;
      lastW = w;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - lt) / 1000);
      lt = now;
      if (!reduced) {
        const r = pl.getBoundingClientRect();
        const target = Math.max(0, Math.min(1, (innerHeight * 0.92 - r.top) / (innerHeight * 0.62)));
        p += (target - p) * Math.min(1, dt * 4);
      }
      if (Math.abs(p - lastDrawn) > 1e-4 || lastK !== live.current.pzi || lastW !== pl.clientWidth) draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, traces]);

  const death = deathLabel(pzi);
  return (
    <figure className="cs-ageing" ref={root}>
      <div className="cs-pz__head">
        <span className="cs-pz__kick">
          <span>
            {id} · {ui.agKicker}
          </span>
          <span>{tx(death, lang)}</span>
        </span>
        <span className="cs-seg cs-seg--mono" role="group" aria-label={ui.pzPick}>
          {PERSONAS.map((x, i) => (
            <button key={x.k} type="button" aria-pressed={i === pzi} onClick={() => setPersona(i)}>
              {x.k}
            </button>
          ))}
        </span>
      </div>
      <div className="cs-plate cs-plate--ag" ref={plate}>
        <canvas ref={cv} aria-hidden />
        {AGEING_MARKS.map((m, i) => (
          <span key={i} className="cs-ageing__mark" data-agmark={m.at} style={{ left: `${(m.at * 100).toFixed(1)}%` }}>
            <span>{tx(m.label, lang)}</span>
          </span>
        ))}
        <div className="cs-ageing__axis">
          <span>{ui.agLeft}</span>
          <span>{ui.agRight}</span>
        </div>
      </div>
      <figcaption className="cs-note cs-pz__note">{ui.agNote}</figcaption>
    </figure>
  );
}
