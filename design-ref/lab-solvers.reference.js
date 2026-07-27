/* lab-solvers.js — four solver benches, faithful ports of src/demo/{main,arch,tentacle3d,shell3d}.ts
   from lzs20030114-wq/personal-website. All kinematics/state machines run on lab-kernel.js
   (the real solver kernel, incl. the gl3d WebGL flat-shaded renderer); this file is DOM wiring
   + the site's dark HUD rendering only. The scanned 106k-tri mesh (.bin) is not importable, so
   Lab.03 renders the vertebrae as procedural boxes (the real machine's 方盒椎节) in the same
   cell frames the repo bench uses. Attributes: spin ("false" = idle start), grid ("false" = no dots). */
(() => {
  if (customElements.get('lab-fourbar')) return;
  const INK = 'var(--color-text, oklch(0.95 0.032 120))';
  const BG = 'var(--color-bg, oklch(0.25 0.05 225))';
  const GRN = 'var(--color-accent, oklch(0.71 0.098 145))';
  const PUR = 'var(--color-accent-2, oklch(0.83 0.075 294))';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const mix = (p) => `color-mix(in srgb, ${INK} ${p}%, transparent)`;
  // gl line colors (dark theme)
  const C_INK = [0.90, 0.92, 0.88];
  const C_DIM = [0.44, 0.47, 0.50];
  const C_MID = [0.62, 0.64, 0.60];
  const C_GRN = [0.62, 0.82, 0.58];
  const C_PUR = [0.76, 0.70, 0.92];
  let kernelWait = null;
  const ensureKernel = () => {
    if (window.LabKernel) return Promise.resolve();
    if (!kernelWait) kernelWait = new Promise((res) => {
      if (!document.querySelector('script[src*="lab-kernel"]')) {
        const s = document.createElement('script');
        s.src = 'lab-kernel.js';
        document.head.appendChild(s);
      }
      const t = setInterval(() => { if (window.LabKernel) { clearInterval(t); res(); } }, 25);
    });
    return kernelWait;
  };
  const CSS = `
:host{display:block}
.wrap{position:relative;font-family:inherit;color:${INK}}
.fig{position:relative}
svg,canvas{display:block;width:100%;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}
canvas{aspect-ratio:700/520;position:relative}
svg:active,canvas:active{cursor:grabbing}
.dots{position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(${mix(100)} 1.1px, transparent 1.3px);background-size:28px 28px;transition:opacity 150ms}
.hud{position:absolute;pointer-events:none;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;font-size:11px;line-height:1.75}
.tl{top:16px;left:20px}
.br{right:20px;bottom:14px;text-align:right;font-variant-numeric:tabular-nums}
.bl{left:20px;bottom:14px;max-width:44%}
.cc{left:0;right:0;top:46%;text-align:center;letter-spacing:0.16em;color:${mix(60)}}
.dim{opacity:0.55;font-weight:600}
.num{font-size:15px;font-weight:800;letter-spacing:0.04em}
.ctl{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;row-gap:9px;padding:11px 10px 12px;border-top:1px solid ${mix(18)};font-size:10px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:${INK}}
.grp{display:flex;gap:10px;align-items:center;padding:0 16px;border-left:1px solid ${mix(14)}}
.grp:first-child{border-left:none}
.ctl label{display:flex;gap:7px;align-items:center;cursor:pointer;white-space:nowrap}
.ctl .k{opacity:0.5;font-weight:600;white-space:nowrap;flex-shrink:0}
.ctl button{font:inherit;font-weight:700;color:${INK};background:none;border:1px solid ${mix(32)};padding:5px 13px;cursor:pointer;letter-spacing:0.09em;text-transform:uppercase;white-space:nowrap;transition:background 120ms,color 120ms,border-color 120ms}
.ctl button:hover{border-color:${GRN};color:${GRN};background:color-mix(in srgb, ${GRN} 10%, transparent)}
.ctl button:active{background:color-mix(in srgb, ${GRN} 22%, transparent)}
.ctl button.active{background:${GRN};color:${BG};border-color:${GRN}}
.ctl button:focus-visible,.ctl input:focus-visible{outline:2px solid ${GRN};outline-offset:2px}
.ctl .seg{display:flex}
.ctl .seg button{border-right-width:0}
.ctl .seg button:last-child{border-right-width:1px}
.ctl input[type=range]{appearance:none;-webkit-appearance:none;width:110px;height:20px;background:transparent;cursor:pointer;margin:0}
.ctl input[type=range]::-webkit-slider-runnable-track{height:2px;background:${mix(28)}}
.ctl input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:11px;height:11px;margin-top:-4.5px;background:var(--th,${GRN});border-radius:0;border:none}
.ctl input[type=range]::-moz-range-track{height:2px;background:${mix(28)}}
.ctl input[type=range]::-moz-range-thumb{width:11px;height:11px;background:var(--th,${GRN});border-radius:0;border:none}
.ctl input[type=checkbox]{appearance:none;-webkit-appearance:none;width:11px;height:11px;border:1px solid ${mix(45)};background:transparent;cursor:pointer;margin:0;transition:background 120ms}
.ctl input[type=checkbox]:checked{background:${GRN};border-color:${GRN}}
@container labfig (max-width: 620px){.bl{display:none}}
`;
  const dotgrid = (on) => `<defs><pattern id="dgp" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" fill="${INK}"></circle></pattern></defs><rect id="dotgrid" width="100%" height="100%" fill="url(#dgp)" opacity="${on ? 0.11 : 0}"></rect>`;

  class LabBench extends HTMLElement {
    static observedAttributes = ['spin', 'grid'];
    constructor() { super(); this.attachShadow({ mode: 'open' }); this.visible = true; this.raf = 0; }
    attributeChangedCallback(n) {
      if (!this.built || !this.svg) return;
      if (n === 'grid') {
        const g = this.shadowRoot.getElementById('dotgrid');
        const v = this.getAttribute('grid') === 'false' ? '0' : '0.11';
        if (g) { if (g instanceof SVGElement) g.setAttribute('opacity', v); else g.style.opacity = v; }
      }
      if (n === 'spin' && this.onSpin) this.onSpin(this.spinOn());
    }
    spinOn() { return this.getAttribute('spin') !== 'false' && !this.reduced; }
    connectedCallback() {
      if (this.built) { this.maybeRun(); return; }
      this.built = true;
      ensureKernel().then(() => {
        this.K = window.LabKernel;
        this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.gridOn = this.getAttribute('grid') !== 'false';
        this.shadowRoot.innerHTML = `<style>:host{container-type:inline-size;container-name:labfig}${CSS}</style>` + this.markup();
        this.svg = this.shadowRoot.querySelector('svg,canvas');
        this.$ = (id) => this.shadowRoot.getElementById(id);
        this.el = (tag, parent) => { const e = document.createElementNS(SVG_NS, tag); (parent || this.svg).appendChild(e); return e; };
        this.setup();
        this.io = new IntersectionObserver((entries) => { this.visible = entries[entries.length - 1].isIntersecting; this.maybeRun(); }, { rootMargin: '120px' });
        this.io.observe(this);
        this.maybeRun();
      });
    }
    disconnectedCallback() { this.stopLoop(); }
    maybeRun() { if (this.visible && this.svg) this.startLoop(); else this.stopLoop(); }
    startLoop() {
      if (this.raf) return;
      this.last = performance.now();
      const loop = (now) => {
        this.raf = this.visible ? requestAnimationFrame(loop) : 0;
        const dt = Math.min((now - this.last) / 1000, 0.25);
        this.last = now;
        this.frame(dt);
      };
      this.raf = requestAnimationFrame(loop);
    }
    stopLoop() { cancelAnimationFrame(this.raf); this.raf = 0; }
    toVB(ev) {
      const m = this.svg.getScreenCTM();
      if (!m) return { x: 0, y: 0 };
      const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
      return { x: p.x, y: p.y };
    }
    capture(ev) { try { this.svg.setPointerCapture(ev.pointerId); } catch (_) { /* synthetic */ } }
    camWire(cam, onDown) {
      this.svg.addEventListener('contextmenu', (ev) => ev.preventDefault());
      this.svg.addEventListener('pointerdown', (ev) => {
        if (onDown) onDown();
        this.capture(ev);
        cam.pointerDown(ev.pointerId, ev.clientX, ev.clientY, ev.button === 2);
      });
      this.svg.addEventListener('pointermove', (ev) => cam.pointerMove(ev.pointerId, ev.clientX, ev.clientY));
      this.svg.addEventListener('pointerup', (ev) => cam.pointerUp(ev.pointerId));
      this.svg.addEventListener('pointercancel', (ev) => cam.pointerUp(ev.pointerId));
      this.svg.addEventListener('wheel', (ev) => { ev.preventDefault(); cam.wheel(ev.deltaY); }, { passive: false });
    }
    glInit() {
      try {
        this.renderer = new this.K.gl3d.FlatRenderer(this.svg);
        this.renderer.setColors([0.13, 0.15, 0.18], [0.90, 0.92, 0.88]);
        return true;
      } catch (e) {
        this.renderer = null;
        this.renderErr = e && e.message ? e.message : 'WebGL 不可用';
        return false;
      }
    }
    markup() { return ''; } setup() {} frame() {}
  }

  const attrs = (e, map) => { for (const k in map) e.setAttribute(k, String(map[k])); };

  /* ============ Lab.01 — four-bar (port of src/demo/main.ts) ============ */
  class LabFourbar extends LabBench {
    markup() {
      return `<div class="wrap">
<svg viewBox="0 0 700 520" role="img" aria-label="Grashof 曲柄摇杆台架；拖任意自由节点驱动">
${dotgrid(this.gridOn)}
<path id="trace" style="fill:none;stroke:${GRN};stroke-width:2;opacity:0.95"></path>
<line id="frameL" style="stroke:${mix(30)};stroke-width:1.4"></line>
<circle id="crankC" style="fill:none;stroke:${mix(25)};stroke-width:1;stroke-dasharray:4 5"></circle>
<g id="grounds" style="fill:none;stroke:${mix(55)};stroke-width:1.2"></g>
<g id="bars" style="stroke:${INK};stroke-width:3;stroke-linecap:square"></g>
<polygon id="plate" style="fill:color-mix(in srgb, ${GRN} 10%, transparent);stroke:${mix(32)};stroke-width:1.2"></polygon>
<g id="joints"></g>
<g id="labels" style="font-size:11px;font-weight:700;letter-spacing:0.06em;fill:${mix(70)}"></g>
<g id="dims" style="font-size:9.5px;font-weight:600;fill:${mix(42)};font-variant-numeric:tabular-nums"></g>
</svg>
<div class="hud tl"><div style="color:${GRN}">Lab.01 / Fig. 01</div><div>Grashof 曲柄摇杆</div><div class="dim">2D PBD · Gauss–Seidel · L 66·178·127 · 板 132·100</div></div>
<div class="hud br"><div class="num" id="rth">θ 0.0°</div><div class="dim" id="rsub">ω 0.00 · err 0.000 · spin</div></div>
<div class="hud bl dim">拖任意自由节点 · 松手继承角速度</div>
</div>`;
    }
    setup() {
      const K = this.K;
      const { N, CRANK, THETA0, createCrankRocker } = K.presets;
      this.N = N; this.CRANK = CRANK;
      this.solver = createCrankRocker();
      this.ctl = new K.LinkageController(this.solver, {
        driver: { anchor: N.A, tip: N.B, radius: CRANK.r, omega: 0.9 },
        theta0: THETA0,
        reducedMotion: !this.spinOn(),
      });
      attrs(this.$('crankC'), { cx: CRANK.cx, cy: CRANK.cy, r: CRANK.r });
      const A0 = this.solver.nodes[N.A]; const D0 = this.solver.nodes[N.D];
      attrs(this.$('frameL'), { x1: A0.x, y1: A0.y, x2: D0.x, y2: D0.y });
      const gnd = (x, y) => {
        const hatch = [-8, -2, 4, 10].map((k) => `M${x + k} ${y + 16}l-5 6`).join('');
        const p = this.el('path', this.$('grounds'));
        p.setAttribute('d', `M${x} ${y}L${x - 10} ${y + 16}L${x + 10} ${y + 16}Z${hatch}`);
      };
      gnd(A0.x, A0.y); gnd(D0.x, D0.y);
      this.barEls = this.solver.bars.map(() => this.el('line', this.$('bars')));
      this.jointEls = this.solver.nodes.map((n, i) => {
        const c = this.el('circle', this.$('joints'));
        if (n.fixed) attrs(c, { r: 6, fill: INK });
        else attrs(c, { r: 7, fill: i === N.P ? GRN : BG, stroke: i === N.P ? BG : INK, 'stroke-width': 2.2 });
        return c;
      });
      this.labelEls = ['A', 'B', 'C', 'D', 'P'].map((t) => {
        const e = this.el('text', this.$('labels')); e.textContent = t; return e;
      });
      this.dimEls = this.solver.bars.map((b) => {
        const e = this.el('text', this.$('dims')); e.textContent = String(Math.round(b.rest)); return e;
      });
      this.tracePts = [];
      this.svg.addEventListener('pointerdown', (ev) => {
        const p = this.toVB(ev);
        if (this.ctl.pointerDown(ev.pointerId, p.x, p.y)) this.capture(ev);
      });
      this.svg.addEventListener('pointermove', (ev) => { const p = this.toVB(ev); this.ctl.pointerMove(ev.pointerId, p.x, p.y); });
      this.svg.addEventListener('pointerup', (ev) => this.ctl.pointerUp(ev.pointerId));
      this.svg.addEventListener('pointercancel', (ev) => this.ctl.pointerUp(ev.pointerId));
      this.render();
    }
    onSpin(on) { this.ctl._mode = on && this.ctl.driver ? 'spin' : 'idle'; }
    pushTrace() {
      const p = this.solver.nodes[this.N.P];
      const last = this.tracePts[this.tracePts.length - 1];
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 0.75) return;
      this.tracePts.push({ x: p.x, y: p.y });
      if (this.tracePts.length > 600) this.tracePts.shift();
      this.$('trace').setAttribute('d', this.K.buildTracePath(this.tracePts));
    }
    render() {
      const s = this.solver; const N = this.N;
      s.bars.forEach((b, i) => {
        const pa = s.nodes[b.a]; const pb = s.nodes[b.b];
        attrs(this.barEls[i], { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
        const mx = (pa.x + pb.x) / 2; const my = (pa.y + pb.y) / 2;
        const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
        attrs(this.dimEls[i], { x: mx + (-(pb.y - pa.y) / len) * 9, y: my + ((pb.x - pa.x) / len) * 9 });
      });
      const B = s.nodes[N.B]; const C = s.nodes[N.C]; const P = s.nodes[N.P];
      this.$('plate').setAttribute('points', `${B.x},${B.y} ${C.x},${C.y} ${P.x},${P.y}`);
      s.nodes.forEach((n, i) => {
        attrs(this.jointEls[i], { cx: n.x, cy: n.y });
        attrs(this.labelEls[i], { x: n.x + (n.fixed ? -4 : 10), y: n.y + (n.fixed ? 34 : -10) });
      });
      const deg = ((Math.atan2(B.y - this.CRANK.cy, B.x - this.CRANK.cx) * 180) / Math.PI + 360) % 360;
      this.$('rth').textContent = `θ ${deg.toFixed(1)}°`;
      this.$('rsub').textContent = `ω ${this.ctl.omegaNow.toFixed(2)} · err ${s.maxError().toFixed(3)} · ${this.ctl.mode}`;
    }
    frame(dt) { this.ctl.frame(dt); this.pushTrace(); this.render(); }
  }

  /* ============ Lab.02 — S4 arch ring (port of src/demo/arch.ts) ============ */
  class LabArch extends LabBench {
    markup() {
      return `<div class="wrap">
<svg viewBox="0 0 700 520" role="img" aria-label="S4 环求解器台架；拖拽拱顶、四脚或曲柄销">
${dotgrid(this.gridOn)}
<g id="decor" style="fill:none;stroke:${mix(25)};stroke-width:1.2"></g>
<g id="slots" style="stroke:${mix(22)};stroke-width:7;stroke-linecap:round;fill:none"></g>
<g id="stops" style="stroke:${mix(45)};stroke-width:2.4;fill:none"></g>
<g id="plates" style="fill:color-mix(in srgb, ${GRN} 8%, transparent);stroke:${INK};stroke-width:1.4;stroke-linejoin:round"></g>
<g id="drive" style="stroke:${INK};stroke-width:2.6;stroke-linecap:round;fill:none"></g>
<g id="pins" style="fill:${INK}"></g>
<g id="handles" style="fill:${BG};stroke:${GRN};stroke-width:2.2;cursor:grab"></g>
</svg>
<div class="hud tl"><div style="color:${GRN}">Lab.02 / Fig. 12</div><div>S4 环 · 拱环求解器</div><div class="dim">14 角化板 · 23 销 · 内核零修改 · 定步 1/120 s</div></div>
<div class="hud br"><div class="num" id="rphi">φ 0.0°</div><div class="dim" id="rsub">apex 0.0 mm · err 0.00 · spin</div></div>
<div class="hud bl dim">拖拽把手：拱顶 / 四脚 / 曲柄销 · 脚槽双端止程</div>
</div>`;
    }
    setup() {
      const K = this.K; const A = K.arch;
      this.A = A;
      this.solver = A.createArch();
      this.ctl = new K.LinkageController(this.solver, {
        driver: A.ARCH_DRIVER,
        theta0: A.ARCH_THETA0,
        reducedMotion: !this.spinOn(),
        spinSweeps: A.ARCH_SPIN_SWEEPS,
        dragSweeps: A.ARCH_DRAG_SWEEPS,
      });
      this.HANDLES = new Set([A.ARCH_APEX, ...A.ARCH_FEET, A.ARCH_PIN]);
      const c = this.solver.nodes[A.ARCH_CENTER];
      this.c = c;
      const wheel = this.el('circle', this.$('decor'));
      attrs(wheel, { cx: c.x, cy: c.y, r: A.ARCH_CRANK_RADIUS, 'stroke-dasharray': '4 5' });
      const rail = this.el('line', this.$('decor'));
      attrs(rail, { x1: c.x, y1: 196, x2: c.x, y2: 316, 'stroke-dasharray': '2 5' });
      for (const { lo, hi } of A.ARCH_FOOT_SLOTS) {
        attrs(this.el('line', this.$('slots')), { x1: lo, y1: 430, x2: hi, y2: 430 });
        attrs(this.el('line', this.$('stops')), { x1: lo, y1: 423, x2: lo, y2: 437 });
        attrs(this.el('line', this.$('stops')), { x1: hi, y1: 423, x2: hi, y2: 437 });
      }
      this.plateEls = A.ARCH_TRIS.map(() => this.el('polygon', this.$('plates')));
      this.crankEl = this.el('line', this.$('drive'));
      this.rodEl = this.el('line', this.$('drive'));
      this.pinDots = [...Array(23).keys()].map(() => { const d = this.el('circle', this.$('pins')); d.setAttribute('r', '3'); return d; });
      const cd = this.el('circle', this.$('pins'));
      attrs(cd, { r: 6, cx: c.x, cy: c.y });
      this.handleEls = [...this.HANDLES].map((i) => {
        const h = this.el('circle', this.$('handles'));
        h.setAttribute('r', '7');
        h.dataset.node = String(i);
        return h;
      });
      this.acc = 0;
      const nearestHandleWithin = (x, y, r) => {
        let best = Infinity; let bestIsHandle = false;
        this.solver.nodes.forEach((n, i) => {
          if (n.fixed) return;
          const d = Math.hypot(n.x - x, n.y - y);
          if (d < best) { best = d; bestIsHandle = this.HANDLES.has(i); }
        });
        return best <= r && bestIsHandle;
      };
      this.svg.addEventListener('pointerdown', (ev) => {
        const p = this.toVB(ev);
        if (!nearestHandleWithin(p.x, p.y, 24)) return;
        if (this.ctl.pointerDown(ev.pointerId, p.x, p.y)) this.capture(ev);
      });
      this.svg.addEventListener('pointermove', (ev) => { const p = this.toVB(ev); this.ctl.pointerMove(ev.pointerId, p.x, p.y); });
      this.svg.addEventListener('pointerup', (ev) => this.ctl.pointerUp(ev.pointerId));
      this.svg.addEventListener('pointercancel', (ev) => this.ctl.pointerUp(ev.pointerId));
      this.render();
    }
    onSpin(on) { this.ctl._mode = on ? 'spin' : 'idle'; }
    render() {
      const s = this.solver; const A = this.A; const c = this.c;
      A.ARCH_TRIS.forEach((t, i) => {
        this.plateEls[i].setAttribute('points', t.map((j) => `${s.nodes[j].x},${s.nodes[j].y}`).join(' '));
      });
      const pin = s.nodes[A.ARCH_PIN]; const apex = s.nodes[A.ARCH_APEX];
      attrs(this.crankEl, { x1: c.x, y1: c.y, x2: pin.x, y2: pin.y });
      attrs(this.rodEl, { x1: pin.x, y1: pin.y, x2: apex.x, y2: apex.y });
      for (let i = 0; i < 23; i++) attrs(this.pinDots[i], { cx: s.nodes[i].x, cy: s.nodes[i].y });
      this.handleEls.forEach((h) => {
        const n = s.nodes[Number(h.dataset.node)];
        attrs(h, { cx: n.x, cy: n.y });
      });
      const phi = ((Math.atan2(pin.y - c.y, pin.x - c.x) * 180) / Math.PI + 450) % 360;
      this.$('rphi').textContent = `φ ${phi.toFixed(1)}°`;
      this.$('rsub').textContent = `apex ${A.apexHeightMM(s).toFixed(1)} mm · err ${s.maxError().toFixed(2)} · ${this.ctl.mode}`;
    }
    frame(dt) {
      this.acc = Math.min(this.acc + dt, 0.25);
      while (this.acc >= this.A.ARCH_STEP_DT) {
        this.ctl.frame(this.A.ARCH_STEP_DT);
        this.A.archStopPass(this.solver);
        this.acc -= this.A.ARCH_STEP_DT;
      }
      this.render();
    }
  }

  /* ============ Lab.03 — 3D tendon tentacle (port of src/demo/tentacle3d.ts, WebGL) ============ */
  class LabTentacle extends LabBench {
    markup() {
      return `<div class="wrap"><div class="fig">
<div class="dots" id="dotgrid" style="opacity:${this.gridOn ? 0.11 : 0}"></div>
<canvas width="1400" height="1040" role="img" aria-label="立体肌腱触手台架；拖拽旋转，滑块收缩肌腱"></canvas>
<div class="hud tl"><div style="color:${PUR}">Lab.03</div><div>立体肌腱触手</div><div class="dim">7 方盒椎节 · 3 腱 @120° · 穿环滑索 · maxStep 6 mm</div></div>
<div class="hud br"><div class="num" id="rt">T 0 / 0 / 0 %</div><div class="dim" id="rsub">err 0.00 · ×1.00</div></div>
<div class="hud bl dim">拖拽旋转 · 右键平移 · 滚轮/双指缩放</div>
</div>
<div class="ctl">
  <div class="grp"><span class="k">肌腱</span>
    <label>1 <input id="t0" type="range" min="0" max="100" value="0" style="--th:${GRN}"></label>
    <label>2 <input id="t1" type="range" min="0" max="100" value="0" style="--th:${mix(80)}"></label>
    <label>3 <input id="t2" type="range" min="0" max="100" value="0" style="--th:${PUR}"></label>
  </div>
  <div class="grp"><span class="k">联动</span><span class="seg"><button id="lk0" class="active">无</button><button id="lk1">1+2</button><button id="lk2">2+3</button><button id="lk3">1+3</button></span></div>
  <div class="grp"><button id="relax">放松</button><button id="home">归位</button><button id="vhome">视角归位</button></div>
</div>
</div>`;
    }
    setup() {
      const K = this.K; const T = K.tent3;
      this.T = T;
      this.sim = T.createTentacle3();
      this.cam = new K.OrbitCamera({
        cx: 380, cy: 250,
        pivot: { x: 0, y: 179, z: 0 },
        scale: 1.1, yaw0: 0, pitch0: 0, roll0: -Math.PI / 2,
        autoYaw: this.spinOn() ? 0.15 : 0,
      });
      this.muscles = [0, 1, 2].map(() => new K.CriticallyDamped(5));
      this.linkPair = null;
      this.sliders = [this.$('t0'), this.$('t1'), this.$('t2')];
      if (this.glInit()) {
        // real extents: PLATES = per-cell axial span (from tentacle3d-shape), RADII+3.5 = half cross-section
        const PLATES = [[-27.31, 27.3], [-25.07, 25.05], [-22.97, 22.99], [-21.07, 21.04], [-19.25, 19.32], [-17.66, 17.65], [-13.65, 13.7]];
        // procedural box vertebrae in the bench's cell frames (real machine = square boxes)
        const box = (x0, x1, h) => {
          const v = new Float32Array([x0, -h, -h, x1, -h, -h, x1, h, -h, x0, h, -h, x0, -h, h, x1, -h, h, x1, h, h, x0, h, h]);
          const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]);
          return K.gl3d.bakeIndexed(v, idx);
        };
        for (let i = 0; i <= T.TENTACLE3D.segments; i++) {
          this.renderer.addMesh('c' + i, box(PLATES[i][0], PLATES[i][1], T.RADII[i] + 3.5));
        }
        this.renderer.addMesh('mnt', box(-58, -16, 17));
        // mount frame (constant, from repo bench)
        const g = T.CHAINS[0][0]; const o = T.STATIONS[0];
        let ex = g[0] - o[0]; let ez = g[2] - o[2];
        const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el;
        this.MNT = { o: { x: o[0], y: o[1], z: o[2] }, ux: 0, uy: 1, uz: 0, ex, ey: 0, ez, fx: -ez, fy: 0, fz: ex };
      }
      const setTarget = (k, v) => {
        this.muscles[k].target = v;
        this.sliders[k].value = String(Math.round(v * 100));
        if (this.linkPair && (k === this.linkPair[0] || k === this.linkPair[1])) {
          const other = k === this.linkPair[0] ? this.linkPair[1] : this.linkPair[0];
          this.muscles[other].target = v;
          this.sliders[other].value = String(Math.round(v * 100));
        }
      };
      this.sliders.forEach((s, k) => s.addEventListener('input', () => setTarget(k, Number(s.value) / 100)));
      const PAIRS = [null, [0, 1], [1, 2], [0, 2]];
      const lkBtns = [this.$('lk0'), this.$('lk1'), this.$('lk2'), this.$('lk3')];
      lkBtns.forEach((btn, i) => btn.addEventListener('click', () => {
        this.linkPair = PAIRS[i];
        lkBtns.forEach((b, j) => b.classList.toggle('active', j === i));
        if (this.linkPair) setTarget(this.linkPair[0], Math.max(this.muscles[this.linkPair[0]].target, this.muscles[this.linkPair[1]].target));
      }));
      this.$('relax').addEventListener('click', () => { for (let k = 0; k < 3; k++) setTarget(k, 0); });
      this.$('home').addEventListener('click', () => {
        this.sim = T.createTentacle3();
        this.muscles.forEach((m, k) => { m.jumpTo(0); this.sliders[k].value = '0'; });
      });
      this.$('vhome').addEventListener('click', () => this.cam.reset());
      this.camWire(this.cam);
      this.render();
    }
    onSpin(on) { this.cam.o.autoYaw = on ? 0.15 : 0; }
    cellFrame(i) {
      const T = this.T; const nodes = this.sim.solver.nodes; const N = T.TENTACLE3D.segments;
      const si = Math.max(0, i);
      const o = nodes[T.SPINE3(si)];
      const nA = si === 0 ? nodes[T.ROOTB3()] : nodes[T.SPINE3(si - 1)];
      const nB = nodes[T.SPINE3(Math.min(N, si + 1))];
      let ux = nB.x - nA.x; let uy = nB.y - nA.y; let uz = nB.z - nA.z;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
      const g = nodes[T.GUIDE3(0, si)];
      let ex = g.x - o.x; let ey = g.y - o.y; let ez = g.z - o.z;
      const dot = ex * ux + ey * uy + ez * uz;
      ex -= dot * ux; ey -= dot * uy; ez -= dot * uz;
      const el2 = Math.hypot(ex, ey, ez) || 1;
      ex /= el2; ey /= el2; ez /= el2;
      const fx = ey * uz - ez * uy;
      const fy = ez * ux - ex * uz;
      const fz = ex * uy - ey * ux;
      return { o, ux, uy, uz, ex, ey, ez, fx, fy, fz };
    }
    render() {
      const T = this.T; const s = this.sim.solver; const nodes = s.nodes; const N = T.TENTACLE3D.segments;
      if (!this.renderer) {
        this.$('rsub').textContent = this.renderErr || 'WebGL 不可用';
        return;
      }
      const R = this.renderer;
      R.beginFrame(this.cam);
      for (let i = 0; i <= N; i++) R.drawMesh('c' + i, this.cellFrame(i));
      R.drawMesh('mnt', this.MNT);
      const spineSegs = [];
      for (let i = 0; i < N; i++) spineSegs.push({ a: nodes[T.SPINE3(i)], b: nodes[T.SPINE3(i + 1)] });
      R.drawLines(spineSegs, C_MID);
      const TC = [C_GRN, C_INK, C_PUR];
      for (let k = 0; k < 3; k++) {
        const pts = T.tendonVisual3(s, k);
        const segs = [];
        for (let i = 0; i + 1 < pts.length; i++) segs.push({ a: pts[i], b: pts[i + 1] });
        R.drawLines(segs, TC[k]);
        R.drawDots([nodes[T.SERVO3(k)]], 3, TC[k]);
      }
      R.drawDots([nodes[T.SPINE3(N)]], 4.5, C_PUR);
      const c = this.sliders.map((sl) => sl.value).join(' / ');
      this.$('rt').textContent = `T ${c} %`;
      this.$('rsub').textContent = `err ${s.maxError().toFixed(2)} · ×${this.cam.zoom.toFixed(2)}`;
    }
    frame(dt) {
      this.cam.tick(dt);
      this.muscles.forEach((m, k) => {
        if (m.update(dt)) this.T.applyContraction3(this.sim.solver, this.sim.tendons[k], m.value);
      });
      this.sim.solver.step(dt, this.T.TENTACLE3D.sweeps);
      this.render();
    }
  }

  /* ============ Lab.04 — S1–S5 shell (port of src/demo/shell3d.ts, WebGL) ============ */
  class LabRings extends LabBench {
    markup() {
      return `<div class="wrap"><div class="fig">
<div class="dots" id="dotgrid" style="opacity:${this.gridOn ? 0.11 : 0}"></div>
<canvas width="1400" height="1040" role="img" aria-label="五环立体编排台架；拖拽旋转，呼吸/相位驱动"></canvas>
<div class="hud tl"><div style="color:${PUR}">Lab.04 / Fig. 13</div><div>S1–S5 伏丘壳体</div><div class="dim">85 mm 等距 · 同相呼吸 · 槽端逐环标定 [0/2/4/8]</div></div>
<div class="hud br"><div class="num" id="rphi">φ —</div><div class="dim" id="rsub">标定中…</div></div>
<div class="hud bl dim">拖拽旋转 · 右键平移 · 滚轮缩放</div>
<div class="hud cc" id="calib">Calibrating slot stops…</div>
</div>
<div class="ctl">
  <div class="grp"><label><input id="spinB" type="checkbox"> 呼吸</label><label><input id="perspB" type="checkbox"> 透视</label><label><input id="skinB" type="checkbox" checked> 蒙皮</label></div>
  <div class="grp"><span class="k">相位</span><input id="phase" type="range" min="0" max="360" value="0" step="0.5" style="width:132px"></div>
  <div class="grp"><span class="k">视角</span><span class="seg"><button data-view="axon" class="active">轴测</button><button data-view="front">正</button><button data-view="left">左</button><button data-view="right">右</button><button data-view="top">顶</button></span><button id="vhome">归位</button></div>
</div>
</div>`;
    }
    setup() {
      const K = this.K; const S = K.shell;
      this.S = S;
      this.cam = new K.OrbitCamera({
        cx: 350, cy: 280,
        pivot: { x: 0, y: 0, z: 85 },
        scale: 1.35,
        roll0: -1.053336, pitch0: 0.735843, yaw0: 0.867459,
        zoomMin: 0.5, zoomMax: 3, autoYaw: 0,
      });
      this.glInit();
      this.rings = null;
      this.theta = S.SHELL_THETA0;
      this.targetTheta = this.theta;
      this.acc = 0;
      this.viewAnim = null;
      this.spinB = this.$('spinB');
      this.phaseS = this.$('phase');
      this.spinB.checked = this.spinOn();
      this.$('perspB').addEventListener('change', () => { if (this.renderer) this.renderer.setPerspective(this.$('perspB').checked ? 700 : 0); });
      this.skinB = this.$('skinB');
      const mul3 = (a, b) => {
        const r = new Array(9);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
        return r;
      };
      const rotX3 = (t) => { const c = Math.cos(t); const s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; };
      const rotY3 = (t) => { const c = Math.cos(t); const s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
      const rotZ3 = (t) => { const c = Math.cos(t); const s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
      const VIEW_FRONT = rotX3(Math.PI / 2);
      this.PRESET_VIEWS = {
        axon: mul3(rotZ3(-1.053336), mul3(rotX3(0.735843), rotY3(0.867459))),
        front: VIEW_FRONT,
        back: mul3(VIEW_FRONT, rotZ3(Math.PI)),
        left: mul3(VIEW_FRONT, rotZ3(-Math.PI / 2)),
        right: mul3(VIEW_FRONT, rotZ3(Math.PI / 2)),
        top: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      };
      this.m2q = (m) => {
        const tr = m[0] + m[4] + m[8];
        if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return [s / 4, (m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s]; }
        if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; return [(m[7] - m[5]) / s, s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s]; }
        if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; return [(m[2] - m[6]) / s, (m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s]; }
        const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
        return [(m[3] - m[1]) / s, (m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4];
      };
      this.q2m = (q) => {
        const [w, x, y, z] = q;
        return [
          1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
          2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
          2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
        ];
      };
      this.slerpQ = (a, b, t) => {
        let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
        let bb = b;
        if (dot < 0) { bb = [-b[0], -b[1], -b[2], -b[3]]; dot = -dot; }
        let w0; let w1;
        if (dot > 0.9995) { w0 = 1 - t; w1 = t; }
        else {
          const th = Math.acos(Math.min(1, dot));
          const s = Math.sin(th);
          w0 = Math.sin((1 - t) * th) / s;
          w1 = Math.sin(t * th) / s;
        }
        const q = [w0 * a[0] + w1 * bb[0], w0 * a[1] + w1 * bb[1], w0 * a[2] + w1 * bb[2], w0 * a[3] + w1 * bb[3]];
        const n = Math.hypot(...q) || 1;
        return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
      };
      const viewTo = (name) => {
        const target = this.PRESET_VIEWS[name];
        if (!target) return;
        if (this.reduced) { this.viewAnim = null; this.cam.setOrientation(target); return; }
        this.viewAnim = { q0: this.m2q(this.cam.matrix), q1: this.m2q(target), t: 0 };
      };
      const viewBtns = [...this.shadowRoot.querySelectorAll('.seg button[data-view]')];
      viewBtns.forEach((btn) => btn.addEventListener('click', () => {
        viewBtns.forEach((b) => b.classList.toggle('active', b === btn));
        viewTo(btn.dataset.view);
      }));
      this.$('vhome').addEventListener('click', () => { this.viewAnim = null; this.cam.reset(); });
      this.phaseS.addEventListener('input', () => {
        this.spinB.checked = false;
        this.targetTheta = this.S.SHELL_THETA0 + (Number(this.phaseS.value) * Math.PI) / 180;
      });
      this.camWire(this.cam, () => { this.viewAnim = null; });
      // per-ring slot calibration, chunked so the page stays responsive
      const pending = [...S.SHELL_RINGS];
      const done = [];
      const calibNext = () => {
        if (!pending.length) {
          this.rings = done;
          this.profiles = this.rings.map((r) => S.ringOuterProfile(r.data));
          this.decorSegs = [];
          for (const r of this.rings) {
            const d = r.data;
            const NN = 32;
            for (let i = 0; i < NN; i++) {
              const a0 = (i * 2 * Math.PI) / NN;
              const a1 = ((i + 1) * 2 * Math.PI) / NN;
              this.decorSegs.push({ a: S.ringPoint(d, d.crankR * Math.cos(a0), d.crankR * Math.sin(a0)), b: S.ringPoint(d, d.crankR * Math.cos(a1), d.crankR * Math.sin(a1)) });
            }
            for (const sl of r.slots) {
              this.decorSegs.push({ a: S.ringPoint(d, sl.lo, 0), b: S.ringPoint(d, sl.hi, 0) });
            }
          }
          // ground traces: body axis through the hubs + a base line under each ring
          this.decorSegs.push({ a: { x: -215, y: 0, z: 0 }, b: { x: 215, y: 0, z: 0 } });
          for (const r of this.rings) {
            this.decorSegs.push({ a: { x: r.data.station, y: -195, z: 0 }, b: { x: r.data.station, y: 195, z: 0 } });
          }
          this.$('calib').style.display = 'none';
          return;
        }
        const d = pending.shift();
        this.$('calib').textContent = `标定 ${d.name.split('_')[0]} 槽端…`;
        setTimeout(() => { done.push(S.createShellRing(d)); calibNext(); }, 16);
      };
      calibNext();
      // fabric skin (port of demo skinMesh): resample outer profiles, ruled strip between rings
      this.SKIN_SAMPLES = 25;
      const idx = [];
      for (let k = 0; k < this.SKIN_SAMPLES - 1; k++) {
        const a = k; const b = this.SKIN_SAMPLES + k;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      this.SKIN_IDX = new Uint16Array(idx);
    }
    onSpin(on) { if (this.spinB) this.spinB.checked = on; }
    profileWorld(ri) {
      const S = this.S; const r = this.rings[ri];
      return this.profiles[ri].map((j) => {
        const n = r.solver.nodes[j];
        return S.ringPoint(r.data, n.x, n.y);
      });
    }
    resample(pts, n) {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
      }
      const total = cum[cum.length - 1] || 1;
      const out = [];
      let seg = 0;
      for (let k = 0; k < n; k++) {
        const t = (k / (n - 1)) * total;
        while (seg < pts.length - 2 && cum[seg + 1] < t) seg++;
        const span = cum[seg + 1] - cum[seg] || 1;
        const u = Math.min(1, Math.max(0, (t - cum[seg]) / span));
        out.push({
          x: pts[seg].x + (pts[seg + 1].x - pts[seg].x) * u,
          y: pts[seg].y + (pts[seg + 1].y - pts[seg].y) * u,
          z: pts[seg].z + (pts[seg + 1].z - pts[seg].z) * u,
        });
      }
      return out;
    }
    skinMesh(ri) {
      const A = this.resample(this.profileWorld(ri), this.SKIN_SAMPLES);
      const B = this.resample(this.profileWorld(ri + 1), this.SKIN_SAMPLES);
      const verts = new Float32Array(this.SKIN_SAMPLES * 2 * 3);
      let k = 0;
      for (const p of A) { verts[k++] = p.x; verts[k++] = p.y; verts[k++] = p.z; }
      for (const p of B) { verts[k++] = p.x; verts[k++] = p.y; verts[k++] = p.z; }
      return this.K.gl3d.bakeIndexed(verts, this.SKIN_IDX);
    }
    substep() {
      const S = this.S;
      let dTheta;
      if (this.spinB.checked) {
        dTheta = S.SHELL_OMEGA * S.SHELL_STEP_DT;
        this.targetTheta = this.theta + dTheta;
      } else {
        const diff = ((this.targetTheta - this.theta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        const max = 2.5 * S.SHELL_STEP_DT;
        dTheta = Math.max(-max, Math.min(max, diff));
        if (dTheta === 0) return;
      }
      this.theta += dTheta;
      for (const r of this.rings) S.stepRing(r, dTheta);
    }
    phiDeg() { return (((this.theta - this.S.SHELL_THETA0) * 180) / Math.PI + 360000) % 360; }
    render() {
      if (!this.rings) return;
      if (!this.renderer) { this.$('rsub').textContent = this.renderErr || 'WebGL 不可用'; return; }
      const S = this.S; const R = this.renderer;
      // family palette: S1 green → S3 neutral → S5 purple (line color carries ring identity)
      const COLS = [[0.55, 0.78, 0.52], [0.70, 0.84, 0.64], [0.88, 0.90, 0.84], [0.80, 0.76, 0.92], [0.70, 0.62, 0.94]];
      R.beginFrame(this.cam);
      if (this.skinB.checked) {
        // smoky fabric: darker shading so the colored linework pops through
        for (let ri = 0; ri < this.rings.length - 1; ri++) R.drawDynamicMesh(this.skinMesh(ri), [0.08, 0.10, 0.13], [0.52, 0.56, 0.60]);
      }
      R.drawLines(this.decorSegs, C_DIM, 0.002);
      this.rings.forEach((r, ri) => {
        const d = r.data; const col = COLS[ri];
        const segs = [];
        for (const [ja, jb, jc] of d.tris) {
          const a = r.solver.nodes[ja]; const b = r.solver.nodes[jb]; const c = r.solver.nodes[jc];
          const aw = S.ringPoint(d, a.x, a.y); const bw = S.ringPoint(d, b.x, b.y); const cw = S.ringPoint(d, c.x, c.y);
          segs.push({ a: aw, b: bw }, { a: bw, b: cw }, { a: cw, b: aw });
        }
        const pin = r.solver.nodes[d.pin];
        const apex = r.solver.nodes[d.apex];
        segs.push({ a: S.ringPoint(d, 0, 0), b: S.ringPoint(d, pin.x, pin.y) });
        segs.push({ a: S.ringPoint(d, pin.x, pin.y), b: S.ringPoint(d, apex.x, apex.y) });
        R.drawLines(segs, col);
        const jointPts = [];
        for (let j = 0; j <= d.pin; j++) {
          const n = r.solver.nodes[j];
          jointPts.push(S.ringPoint(d, n.x, n.y));
        }
        R.drawDots(jointPts, 2.0 + ri * 0.22, col);
        R.drawDots([S.ringPoint(d, pin.x, pin.y)], 3.4, C_GRN, 0.007);
        R.drawDots([S.ringPoint(d, 0, 0)], 4, col, 0.007);
      });
      const apexS2 = this.rings[1].solver.nodes[this.rings[1].data.apex].y;
      this.$('rphi').textContent = `φ ${this.phiDeg().toFixed(1)}°`;
      this.$('rsub').textContent = `apex(S2) ${apexS2.toFixed(1)} mm · err ${S.shellMaxError(this.rings).toFixed(2)} · ${this.spinB.checked ? 'spin' : 'slider'}`;
      if (this.spinB.checked) this.phaseS.value = this.phiDeg().toFixed(1);
    }
    frame(dt) {
      if (!this.rings) return;
      this.acc = Math.min(this.acc + dt, 0.25);
      while (this.acc >= this.S.SHELL_STEP_DT) {
        this.substep();
        this.acc -= this.S.SHELL_STEP_DT;
      }
      if (this.viewAnim) {
        this.viewAnim.t += dt / 0.35;
        const t = Math.min(1, this.viewAnim.t);
        const e = t * t * (3 - 2 * t);
        this.cam.setOrientation(this.q2m(this.slerpQ(this.viewAnim.q0, this.viewAnim.q1, e)));
        if (t >= 1) this.viewAnim = null;
      }
      this.cam.tick(dt);
      this.render();
    }
  }

  customElements.define('lab-fourbar', LabFourbar);
  customElements.define('lab-arch', LabArch);
  customElements.define('lab-tentacle', LabTentacle);
  customElements.define('lab-rings', LabRings);
})();
