'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BLOCK_UI,
  DIM,
  INK,
  PERSONAS,
  PERSONA_ROWS,
  PERSONA_WINDOW,
  PAPER,
  PersonaSim,
  strengthWord,
  tx,
  type Lang,
  type Persona,
} from '../../../src/lib/site/case-reincarnation';
import { fitCanvas, useInView, useReducedMotion } from './hooks';
import { setPersona, usePersona } from './personaStore';

/** 画一帧示意台（稿 drawPersona 的原样移植）：呼吸曲线 + 触摸标记 + 延迟线 + 右侧一圈呼吸的圆。 */
function drawPersona(cv: HTMLCanvasElement, s: PersonaSim, P: Persona, lang: Lang): void {
  const f = fitCanvas(cv);
  if (!f) return;
  const { ctx, w, h } = f;
  const L0 = 24;
  const R0 = w - 132;
  const y0 = h - 58;
  const yT = 54;
  const Y = (v: number) => y0 - Math.min(1.35, v) * (y0 - yT);
  const X = (t: number) => L0 + ((t - (s.t - PERSONA_WINDOW)) / PERSONA_WINDOW) * (R0 - L0);
  ctx.font = "10px 'JetBrains Mono', monospace";
  (
    [
      [0, '0'],
      [0.5, '50%'],
      [1, '100%'],
    ] as const
  ).forEach(([v, lb]) => {
    ctx.strokeStyle = 'rgba(235,240,220,.08)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(L0, Y(v));
    ctx.lineTo(R0, Y(v));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(220,230,210,.35)';
    ctx.fillText(lb, R0 + 6, Y(v) + 3);
  });
  s.pulses.forEach((p) => {
    const xt = X(p.touch);
    const xa = X(p.at);
    if (xt > L0) {
      ctx.strokeStyle = 'rgba(200,180,255,.55)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(xt, yT - 6);
      ctx.lineTo(xt, y0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(210,195,255,.85)';
      ctx.fillText(lang === 'zh' ? '触' : 'touch', xt + 4, yT - 2);
    }
    if (xa > L0 && xa > xt + 2) {
      ctx.strokeStyle = 'rgba(210,195,255,.5)';
      ctx.beginPath();
      ctx.moveTo(Math.max(L0, xt), yT + 8);
      ctx.lineTo(xa, yT + 8);
      ctx.stroke();
      ctx.fillStyle = 'rgba(210,195,255,.7)';
      ctx.fillText(`${(p.at - p.touch).toFixed(2)}s`, Math.max(L0, xt) + 4, yT + 20);
    }
  });
  if (s.hist.length > 1) {
    ctx.beginPath();
    s.hist.forEach(([t, v], i) => {
      const x = X(t);
      const yy = Y(v);
      if (i) ctx.lineTo(x, yy);
      else ctx.moveTo(x, yy);
    });
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    const last = s.hist[s.hist.length - 1];
    ctx.lineTo(X(last[0]), y0);
    ctx.lineTo(X(s.hist[0][0]), y0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, yT, 0, y0);
    g.addColorStop(0, 'rgba(180,220,170,.16)');
    g.addColorStop(1, 'rgba(180,220,170,0)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.arc(X(last[0]), Y(last[1]), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const cx = w - 62;
  const cy = (yT + y0) / 2;
  const rad = 16 + Math.min(1.35, s.y || 0) * 26;
  ctx.strokeStyle = 'rgba(235,240,220,.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 16 + 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = P.ink;
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = P.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
}

/**
 * 人格示意台（稿 persona，N06）：同一次触摸，四种回应。
 * 上半是画布——呼吸曲线随选中的人格变周期 / 幅度，「轻触它」按延迟 + 强度给一个回应脉冲；
 * 下半是十二行参数表，选中的那列高亮，表头也可以点来换人格。
 * **示意台，非实测**：呼吸周期与幅度取自表；延迟与强度是按表里的定性描述映射成的示意值
 * （稿的 kicker 与图注都写明了）。
 * 选哪套人格与衰老曲线共用（personaStore）。画布只在可见时逐帧跑；reduced-motion 下不动。
 */
export function PersonaBench({ id = 'N06', lang = 'en' }: { id?: string; lang?: Lang }) {
  const ui = BLOCK_UI[lang];
  const zh = lang === 'zh';
  const pzi = usePersona();
  const P = PERSONAS[pzi];
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const inView = useInView(root);
  const sim = useRef<PersonaSim | null>(null);
  if (!sim.current) sim.current = new PersonaSim();
  const [last, setLast] = useState<{ lat: number; str: number } | null>(null);

  // 逐帧循环里要读最新的人格 / 语言，但不该因它们变化而重建循环
  const live = useRef({ P, lang });
  live.current = { P, lang };

  useEffect(() => {
    const canvas = cv.current;
    const s = sim.current;
    if (!canvas || !s || !inView) return;
    const draw = () => drawPersona(canvas, s, live.current.P, live.current.lang);
    if (reduced) {
      s.step(0, live.current.P);
      draw();
      const on = () => draw();
      window.addEventListener('resize', on);
      return () => window.removeEventListener('resize', on);
    }
    let raf = 0;
    let lt = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - lt) / 1000);
      lt = now;
      s.step(dt, live.current.P);
      draw();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, pzi, lang]);

  const read =
    P.k === 'D'
      ? ui.pzRead(ui.randomPeriod, ui.randomDepth)
      : ui.pzRead(`${P.period}${ui.secUnit}`, `${Math.round(P.depth * 100)}%`);
  const resp = last ? ui.pzResp(last.lat.toFixed(2), strengthWord(last.str, lang)) : ui.pzIdle;

  return (
    <figure className="cs-pz" ref={root}>
      <div className="cs-pz__head">
        <span className="cs-pz__kick">
          <span>
            {id} · {ui.pzKicker}
          </span>
          <span>{ui.pzTitle}</span>
        </span>
        <span className="cs-seg" role="group" aria-label={ui.pzPick}>
          {PERSONAS.map((p, i) => {
            const on = i === pzi;
            return (
              <button key={p.k} type="button" aria-pressed={on} onClick={() => setPersona(i)}>
                <span style={{ color: on ? PAPER : p.ink }}>{p.k}</span>
                {tx(p.name, lang)}
              </button>
            );
          })}
        </span>
      </div>
      <div className="cs-plate cs-plate--pz">
        <span className="cs-plate__line" style={{ background: P.ink }} />
        <canvas ref={cv} aria-hidden />
        <div className="cs-plate__top">
          <span style={{ color: P.ink }}>
            {P.k} · {tx(P.name, lang)}
          </span>
          <span style={{ color: 'oklch(0.9 0.058 124)' }}>{read}</span>
        </div>
        <div className="cs-plate__bot">
          <span>{resp}</span>
          <button
            type="button"
            className="cs-touch"
            onClick={() => setLast(sim.current ? sim.current.touch(P) : null)}
          >
            <i style={{ background: P.ink }} />
            {ui.touch}
          </button>
        </div>
      </div>
      <figcaption className="cs-note cs-pz__note">{ui.pzNote}</figcaption>
      <div className="cs-table-wrap">
        <div className="cs-table" role="table">
          <div className="cs-table__row cs-table__row--h" role="row">
            <span role="columnheader">{ui.param}</span>
            {PERSONAS.map((p, i) => {
              const on = i === pzi;
              return (
                <button
                  key={p.k}
                  type="button"
                  role="columnheader"
                  className="cs-table__colh"
                  onClick={() => setPersona(i)}
                  style={{ background: on ? 'oklch(0.95 0.032 120 / .07)' : 'transparent', color: on ? INK : DIM }}
                >
                  <i style={{ color: p.ink }}>{p.k}</i>
                  {tx(p.name, lang)}
                </button>
              );
            })}
          </div>
          {PERSONA_ROWS.map((r, ri) => (
            <div className="cs-table__row" role="row" key={ri}>
              <span role="rowheader">{tx(r.k, lang)}</span>
              {r.cells[zh ? 'zh' : 'en'].map((x, i) => {
                const on = i === pzi;
                return (
                  <span
                    role="cell"
                    key={i}
                    style={{
                      background: on ? 'oklch(0.95 0.032 120 / .07)' : 'transparent',
                      color: on ? INK : DIM,
                      fontWeight: on ? 500 : 400,
                    }}
                  >
                    {x}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}
