'use client';

import { useEffect, useRef, useState } from 'react';
import { SKIN_UNITS } from '../../src/lib/space/skin-data';
import { SKIN, createSkinUnit, renderSmooth, type SkinUnit } from '../../src/lib/space/skin-unit';
import { useBenchLoop } from './useBenchLoop';

/**
 * Lab.06 · 项目二第一台：收缩张紧外皮单元（skin_sim_v7_final.py 的目录图，活体版）。
 * 内核 = src/lib/space/skin-unit（v7 的 1:1 移植，物理已在 Python 侧收口）；
 * 本文件只做 DOM 接线与暗色渲染——四个键谱并排，同一收缩协议同时推进。
 *
 * 推进是定步的：协议以 step 为时钟（r、外压衰减、拉链纪律解除全按 step 索引），
 * 按 RATE steps/s 折算真实时间、每帧封顶 MAX_STEPS_PER_FRAME——慢设备上表现为
 * 放慢而非轨迹漂移（与 Lab.02/04 的定步纪律同一取向）。跑完整个协议后静置片刻
 * 自动重播；这不是循环机构——每次重播都是一次全新的收缩（键锁定不可逆，
 * 想看滞回证据即在于此：收缩完成后形态被锁死，不随外压撤除回弹）。
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const RATE = 110; // 协议步/秒（收缩段 900 步 ≈ 8.2s）——展示节奏，不是物理量
const MAX_STEPS_PER_FRAME = 3;
const REPLAY_HOLD_S = 3.2; // 终态静置再重播
const GHOST_STEPS = [500, 1000]; // 目录图的两帧残影（len//3、2len//3 的 step 等价）
// 每单元的世界窗口与比例（照 v7 目录图 xlim/ylim）
const S = 100;
const WX0 = -0.6;
const WX1 = 1.2;
const WY1 = 0.22;
const WY0 = -3.4;
const UNIT_W = (WX1 - WX0) * S; // 180
const UNIT_H = (WY1 - WY0) * S; // 362
const GAP = 8;
const M = 10;
const VB_W = M * 2 + UNIT_W * 4 + GAP * 3; // 764
const VB_H = 8 + UNIT_H + 30; // 400

interface UnitView {
  sim: SkinUnit;
  coreEl: SVGLineElement;
  stripeEls: SVGPolylineElement[];
  bondEls: SVGLineElement[];
  ghostEls: SVGPathElement[];
  ghostDone: boolean[];
  x0: number;
}

export function SkinBench({
  active = true,
  onLight = false,
  controls = true,
}: {
  active?: boolean;
  onLight?: boolean;
  controls?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stateRef = useRef<{
    step: (dt: number) => void;
    replay: () => void;
    redraw: () => void;
  } | null>(null);
  const runningRef = useRef(true);
  const speedRef = useRef(1);
  const bondsRef = useRef(true);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [bonds, setBonds] = useState(true);
  const [hud, setHud] = useState<{ r: number; step: number; locked: number; phase: string }>({
    r: SKIN.R0,
    step: 0,
    locked: 0,
    phase: '收缩中',
  });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // reduced-motion：不自动播（点「运转」是显式意愿，仍可看）
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      runningRef.current = false;
      setRunning(false);
    }

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      cls = '',
      parent: SVGElement = svg,
    ): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG_NS, tag);
      if (cls) e.setAttribute('class', cls);
      parent.appendChild(e);
      return e;
    };
    const attrs = (e: SVGElement, map: Record<string, string | number>): void => {
      for (const [k, v] of Object.entries(map)) e.setAttribute(k, String(v));
    };

    // 点阵衬底（与其他台架同款）
    const defs = el('defs');
    const pattern = el('pattern', '', defs);
    attrs(pattern, { id: 'lab6-dots', width: 28, height: 28, patternUnits: 'userSpaceOnUse' });
    attrs(el('circle', 'grid-dot', pattern), { cx: 1.5, cy: 1.5, r: 1.1 });
    attrs(el('rect'), { x: 0, y: 0, width: VB_W, height: VB_H, fill: 'url(#lab6-dots)' });

    const units: UnitView[] = SKIN_UNITS.map((def, u) => {
      const x0 = M + u * (UNIT_W + GAP);
      const g = el('g');
      const sim = createSkinUnit(def.spec);
      const sx = (wx: number): number => x0 + (wx - WX0) * S;
      const sy = (wy: number): number => 8 + (WY1 - wy) * S;
      // 天花线（皮从这里垂下）
      attrs(el('line', 'skin-ceil', g), { x1: sx(-0.55), y1: sy(0), x2: sx(1.15), y2: sy(0) });
      // 残影（收缩中途的两帧历史，目录图同款）——先建空 path，路过快照点时填
      const ghostEls = GHOST_STEPS.map(() => el('path', 'skin-ghost', g));
      // 芯（收缩源，单自由度 ℓ）
      const coreEl = el('line', 'skin-core', g);
      // 锁定键（键谱全员预建，锁定才显示）
      const bondEls = sim.chains.flat().map(() => {
        const e = el('line', 'skin-bond', g);
        e.style.display = 'none';
        return e;
      });
      // 皮：条纹交替的折线段（STRIPE=8 节一段）
      const stripeEls: SVGPolylineElement[] = [];
      for (let s0 = 0, k = 0; s0 < sim.n - 1; s0 += SKIN.STRIPE, k++) {
        stripeEls.push(el('polyline', k % 2 === 0 ? 'skin-a' : 'skin-b', g));
      }
      // 题名（中 · 英，照 v7 目录）
      const label = el('text', 'label', g);
      label.textContent = `${def.zh} · ${def.en}`;
      attrs(label, { x: x0 + UNIT_W / 2, y: VB_H - 10, 'text-anchor': 'middle' });
      return { sim, coreEl, stripeEls, bondEls, ghostEls, ghostDone: GHOST_STEPS.map(() => false), x0 };
    });

    const drawUnit = (v: UnitView): void => {
      const { sim, x0 } = v;
      const sx = (wx: number): number => x0 + (wx - WX0) * S;
      const sy = (wy: number): number => 8 + (WY1 - wy) * S;
      attrs(v.coreEl, { x1: sx(0), y1: sy(0), x2: sx(0), y2: sy(-sim.coreLen) });
      const p = renderSmooth(sim.px, sim.py); // 渲染平滑只用于绘图，物理数据不做美化
      for (let s0 = 0, k = 0; s0 < sim.n - 1; s0 += SKIN.STRIPE, k++) {
        const s1 = Math.min(s0 + SKIN.STRIPE, sim.n - 1);
        let pts = '';
        for (let i = s0; i <= s1; i++) pts += `${sx(p.x[i]).toFixed(2)},${sy(p.y[i]).toFixed(2)} `;
        v.stripeEls[k].setAttribute('points', pts);
      }
      const showBonds = bondsRef.current;
      for (let b = 0; b < sim.locked.length; b++) {
        const [i, j] = sim.locked[b];
        const e = v.bondEls[b];
        e.style.display = showBonds ? '' : 'none';
        attrs(e, { x1: sx(p.x[i]), y1: sy(p.y[i]), x2: sx(p.x[j]), y2: sy(p.y[j]) });
      }
      for (let b = sim.locked.length; b < v.bondEls.length; b++) v.bondEls[b].style.display = 'none';
      // 路过残影快照点：把当前皮形整条留成一笔淡线
      for (let gI = 0; gI < GHOST_STEPS.length; gI++) {
        if (!v.ghostDone[gI] && sim.step >= GHOST_STEPS[gI]) {
          let d = '';
          for (let i = 0; i < sim.n; i++)
            d += `${i === 0 ? 'M' : 'L'}${sx(p.x[i]).toFixed(2)} ${sy(p.y[i]).toFixed(2)}`;
          v.ghostEls[gI].setAttribute('d', d);
          v.ghostDone[gI] = true;
        }
      }
    };

    let acc = 0;
    let holdT = 0;
    const replay = (): void => {
      units.forEach((v, u) => {
        v.sim = createSkinUnit(SKIN_UNITS[u].spec);
        v.ghostDone = GHOST_STEPS.map(() => false);
        v.ghostEls.forEach((e) => e.setAttribute('d', ''));
      });
      acc = 0;
      holdT = 0;
      units.forEach(drawUnit);
    };

    let lastHud = '';
    const step = (dt: number): void => {
      const lead = units[0].sim;
      if (runningRef.current && !lead.done) {
        acc += dt * RATE * speedRef.current;
        let n = Math.floor(acc);
        if (n > MAX_STEPS_PER_FRAME) {
          n = MAX_STEPS_PER_FRAME;
          acc = 0; // 追不上就放慢（定步：轨迹不变，只是慢），不留追赶债
        } else {
          acc -= n;
        }
        for (let k = 0; k < n; k++) for (const v of units) v.sim.advance();
        if (n > 0) units.forEach(drawUnit);
      } else if (runningRef.current && lead.done) {
        holdT += dt;
        if (holdT >= REPLAY_HOLD_S) replay();
      }
      const locked = units.reduce((s, v) => s + v.sim.locked.length, 0);
      const phase = lead.done ? '锁定 · 即将重播' : lead.step < 900 ? '收缩中' : '张紧 · 排泡';
      const key = `${lead.step}|${locked}|${phase}`;
      if (key !== lastHud) {
        lastHud = key;
        setHud({ r: lead.r, step: lead.step, locked, phase });
      }
    };

    units.forEach(drawUnit);
    stateRef.current = { step, replay, redraw: () => units.forEach(drawUnit) };
    return () => {
      stateRef.current = null;
    };
  }, []);

  useBenchLoop(svgRef, (dt) => stateRef.current?.step(dt), [], active);

  return (
    <div className={`lab-wrap${onLight ? ' on-light' : ''}`}>
      <div className="lab-fig">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          role="img"
          aria-label="收缩张紧外皮单元：四个键谱在同一收缩协议下分别成形为袋、蘑菇挑台、直挑台、阶梯挑台"
          style={{ cursor: 'default', touchAction: 'auto' }}
        />
        <div className="lab-hud tl">
          <div style={{ color: 'var(--accent)' }}>Lab.06 / Project II</div>
          <div>收缩张紧外皮单元</div>
          <div className="dim">软皮 · 键生成刚度 · 四键谱同一收缩协议</div>
        </div>
        <div className="lab-hud br">
          <div className="num">r {hud.r.toFixed(2)}</div>
          <div className="dim">
            step {hud.step}/{SKIN.STEPS} · 键 {hud.locked} · {hud.phase}
          </div>
        </div>
        <div className="lab-hud bl dim">芯收缩 → 皮富余 → 键扣合 · 键锁定永久（滞回）</div>
      </div>
      {controls ? (
        <div className="lab-ctl">
          <div className="grp">
            <label>
              <input
                type="checkbox"
                checked={running}
                onChange={(e) => {
                  runningRef.current = e.target.checked;
                  setRunning(e.target.checked);
                }}
              />
              运转
            </label>
            <label>
              <input
                type="checkbox"
                checked={bonds}
                onChange={(e) => {
                  bondsRef.current = e.target.checked;
                  setBonds(e.target.checked);
                  stateRef.current?.redraw(); // 暂停态也立即生效（平时由逐帧重绘接手）
                }}
              />
              键线
            </label>
          </div>
          <div className="grp">
            <button
              type="button"
              onClick={() => {
                stateRef.current?.replay();
                runningRef.current = true;
                setRunning(true);
              }}
            >
              重播
            </button>
          </div>
          <div className="grp">
            <span className="k">速度</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={speed}
              aria-label="播放速度（协议步/秒的倍率，不是物理量）"
              style={{ width: 96 }}
              onChange={(e) => {
                const v = Number(e.target.value);
                speedRef.current = v;
                setSpeed(v);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
