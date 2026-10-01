(() => {
  'use strict';
  const D = window.HOME_DATA;
  const ROTATE_S = 7;
  const HOLD_MS = 15000;
  const EO = 'cubic-bezier(.2,.7,.1,1)', EIO = 'cubic-bezier(.76,0,.24,1)';
  const KF = {
    up: [{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'none' }],
    rise: [{ transform: 'translateY(108%)' }, { transform: 'none' }],
    line: [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
    wipe: [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
  };
  const DUR = { up: 820, rise: 1000, line: 1100, wipe: 1150, fade: 700 };
  const PAGES = ['Hook', 'Work', 'About', 'Lab', 'Log + Contact'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const root = document.querySelector('[data-root]');
  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionOn = () => !reduced;

  const sections = [0, 1, 2, 3].map(i => $(`[data-page="${i}"]`));
  const zone = sections[3];
  const hook = sections[0];

  const st = { page: 0, from: 0, hk: 0, paused: false, zone: 'lab', zScrolled: false, sel: D.GROUPS.map(() => null), ck: null, lh: null };

  /* ---------- render ---------- */

  $('[data-tabs]').innerHTML = D.SLIDES.map((s, i) => `
    <button type="button" class="tab" data-tab="${i}" style="--c-ink:${s.c.ink}">
      <span class="tab__label"><span class="tab__n">${s.n}</span><span class="tab__name">${esc(s.name)}</span></span>
      <span class="tab__track"><span class="tab__bar" data-bar="${i}"></span></span>
    </button>`).join('');
  $('[data-slides]').innerHTML = D.SLIDES.map((s, i) => `
    <div class="slide" data-slide="${i}"><div class="slide__img" data-kb="${i}" role="img" aria-label="${esc(s.fig)}" style="background-image:url('${s.img}')"></div></div>`).join('');

  const cardsEl = $('[data-cards]');
  cardsEl.insertAdjacentHTML('beforeend', D.WORKS.map((w, i) => `
    <a class="card" href="/work/${w.slug}" data-card="${i}" style="--c-ink:${w.c.ink};--c-hi:${w.c.hi}">
      <span class="card__kick" data-a="up" data-d="${160 + i * 90}"><span class="card__kick-n">${w.n} · ${esc(w.kicker)}</span><span class="card__status${w.img ? '' : ' card__status--wip'}">${w.img ? esc(w.year) : 'In progress'}</span></span>
      <span class="card__box" data-a="wipe" data-d="${200 + i * 90}">
        <span class="card__plate${w.img ? '' : ' card__plate--wip'}">${w.img
          ? `<span class="card__img" role="img" aria-label="${esc(w.title)}" style="background-image:url('${w.img}')"></span><span class="card__stamp">stand-in · bench still</span>`
          : `<span class="card__wip"><span class="card__wip-badge">In progress</span><span class="card__wip-note">case study to come</span></span>`}</span>
        <span class="card__veil"></span>
        <span class="card__bar"></span>
        <span class="card__head">
          <span class="card__title" data-wt>${esc(w.title)}<span class="card__ul"></span></span>
          <span class="card__role">${esc(w.role)}</span>
        </span>
        <span class="card__thesis">
          <span class="card__thesis-text">${esc(w.thesis)}</span>
          <span class="card__cta">${w.img ? 'Read the case study ↗' : 'Preview ↗'}</span>
        </span>
      </span>
    </a>`).join(''));

  $('[data-others]').innerHTML = D.OTHERS.map(o => `
    <a class="other" href="/work/${o.slug}">
      <span class="lbl">Other works</span>
      <span class="other__main"><span class="other__title">${esc(o.title)}</span><span class="other__line">${esc(o.line)}</span></span>
      <span class="lbl">${esc(o.year)}</span>
      <span class="other__arrow">↗</span>
    </a>`).join('');

  $('[data-facts]').innerHTML = D.FACTS.map((f, i) => `
    <div class="fact"><span class="fact__rule" data-a="line" data-d="${140 + i * 90}"></span><dt data-a="up" data-d="${220 + i * 90}">${esc(f.k)}</dt><dd data-a="up" data-d="${220 + i * 90}">${esc(f.v)}</dd></div>`).join('');

  const benchesOf = g => g.segs.flatMap(s => s.benches);
  $('[data-groups]').innerHTML = D.GROUPS.map((g, gi) => {
    const all = benchesOf(g);
    const bench = b => `
      <a class="bench" href="/lab#lab${b.no}" data-rv data-bench="${b.no}">
        <span class="bench__bar"></span>
        <span class="bench__no">${b.no}</span>
        <span class="bench__main"><span class="bench__title">${esc(b.title)}</span><span class="bench__desc">${esc(b.description)}</span></span>
        <span class="bench__meta">${esc(b.meta)}<span class="bench__open">open ↗</span></span>
      </a>`;
    return `
    <div class="group" data-group="${gi}" style="--c-ink:${g.c.ink}">
      <div class="group__head">
        <div class="group__row">
          <span class="group__n">${g.n}</span>
          <span class="group__titles"><span class="group__title">${esc(g.title)}</span><span class="lbl">${esc(g.sub)}</span></span>
          <span class="group__count${all.length ? '' : ' group__count--wip'}">${all.length ? `${all.length} benches` : 'In progress'}</span>
        </div>
        <span class="group__hair"></span>
        <span class="group__prog" data-gprog></span>
      </div>
      <div class="group__body">
        <div class="group__list">
          ${g.segs.map(s => `<div class="seg">${s.label ? `<p class="seg__label" data-rv>${s.n} · ${esc(s.label)}</p>` : ''}${s.benches.map(bench).join('')}</div>`).join('')}
          ${all.length ? '' : '<p class="group__empty" data-rv>No benches yet. They will be listed here, in build order, as the project takes shape.</p>'}
          <a class="group__case" href="/work/${g.slug}" data-rv>${g.cover ? 'Case study ↗' : 'Case study · to come'}</a>
        </div>
        <div class="pv">
          <div class="pv__plate${g.cover ? '' : ' pv__plate--empty'}" data-pv><span class="pv__bar"></span><div data-pv-fill></div></div>
          <div class="pv__cap"><span class="pv__title" data-pv-cap></span><span class="pv__desc" data-pv-desc></span></div>
        </div>
      </div>
    </div>`;
  }).join('');

  const { from: T0, to: T1, year: YEAR } = D.RANGE;
  const fr = md => { const [m, d] = md.split('-').map(Number); return (Date.UTC(YEAR, m - 1, d) - T0) / (T1 - T0); };
  const fmtMd = md => { const [m, d] = md.split('-').map(Number); return MON[m - 1] + ' ' + d; };
  const laneOf = en => D.LANES.findIndex(ln => ln.keys.includes(en.tag));
  $('[data-log-count]').textContent = `${D.ENTRIES.length} entries · Mar – Sep ${YEAR}`;
  $('[data-lanes]').innerHTML = D.LANES.map(ln => {
    const seen = {};
    const ticks = D.ENTRIES.filter(en => ln.keys.includes(en.tag)).map(en => {
      const off = seen[en.md] = (seen[en.md] ?? -1) + 1;
      return `<a class="tick" href="/archive#${YEAR}-${en.md}" data-tk="${en.i}" data-f="${fr(en.md)}" aria-label="${fmtMd(en.md)} · ${esc(ln.label)} · ${esc(en.sub)}" style="left:calc(${(fr(en.md) * 100).toFixed(3)}% + ${off * 4}px)"><span></span></a>`;
    });
    return `
    <div class="lane" style="--c-ink:${ln.ink}">
      <span class="lane__label"><span class="lane__sq"></span>${esc(ln.label)}<span class="lane__n">${ticks.length}</span></span>
      <span class="lane__track">${ticks.join('')}</span>
    </div>`;
  }).join('');
  $('[data-months]').insertAdjacentHTML('afterbegin', [2, 3, 4, 5, 6, 7, 8].map(m =>
    `<span class="cad__month" style="left:${(((Date.UTC(YEAR, m, 1) - T0) / (T1 - T0)) * 100).toFixed(3)}%">${MON[m]}</span>`).join(''));

  const tagHtml = l => `<span class="entry__tag">${esc(l.tag)}</span>`;
  const [feat, ...rest] = D.LOGS;
  $('[data-feat]').outerHTML = `
    <a class="feat" href="/archive#${feat.date}" data-rv data-lh="0" style="--c-ink:${feat.c.ink}">
      <span class="entry__meta"><span class="entry__badge">Latest</span><span>${feat.date}</span>${tagHtml(feat)}</span>
      <span class="feat__text">${esc(feat.text)}</span>
      <span class="feat__fig"><span class="feat__img" role="img" aria-label="${esc(feat.cap)}" style="background-image:url('${feat.img}')"></span></span>
      <span class="feat__foot"><span class="feat__cap">${esc(feat.cap)}</span><span class="entry__cta">Read entry ↗</span></span>
    </a>`;
  $('[data-rest]').innerHTML = rest.map((l, k) => `
    <a class="entry" href="/archive#${l.date}" data-rv data-lh="${k + 1}" style="--c-ink:${l.c.ink}">
      <span class="entry__meta"><span>${l.date}</span>${tagHtml(l)}</span>
      <span class="entry__row"><span class="entry__text">${esc(l.text)}</span>${l.img ? `<span class="entry__thumb" role="img" aria-label="${esc(l.text)}" style="background-image:url('${l.img}')"></span>` : ''}</span>
      <span class="entry__cta">Read entry ↗</span>
    </a>`).join('');

  const navEl = $('[data-nav]');
  navEl.innerHTML = [['Work', 1], ['About', 2], ['Lab', 3], ['Log', 4]].map(([label, i]) =>
    `<button type="button" class="nav-btn" data-go="${i}">${label}<span class="nav-btn__ul"></span></button>`).join('');
  $('[data-rail]').innerHTML = PAGES.map((name, i) =>
    `<button type="button" class="rail__btn" data-go="${i}" aria-label="${name}"><span class="rail__n">${String(i + 1).padStart(2, '0')}</span><span class="rail__tick"></span></button>`).join('');

  /* ---------- motion helpers ---------- */

  function choreo(i, base) {
    if (!motionOn()) return;
    $$('[data-a]', sections[i]).forEach(el => {
      const t = el.dataset.a;
      el.getAnimations().forEach(a => a.id === 'ch' && a.cancel());
      const a = el.animate(KF[t], { duration: DUR[t], delay: base + (+el.dataset.d || 0), easing: t === 'line' ? EIO : EO, fill: 'backwards' });
      a.id = 'ch';
    });
  }

  function hkIn() {
    if (!motionOn()) return;
    $$('[data-w]').forEach((w, k) => w.animate([{ transform: 'translateY(105%)' }, { transform: 'none' }], { duration: 760, delay: k * 28, easing: EO, fill: 'backwards' }));
    $('[data-hk-hint]').animate(KF.fade, { duration: 600, delay: 320, easing: EO, fill: 'backwards' });
    $(`[data-slide="${st.hk}"]`).animate([{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 1100, easing: EIO });
  }

  let io = null;
  const pending = new Set();
  function reveal(el, k) {
    io.unobserve(el); pending.delete(el); el.style.opacity = '';
    if (el.hasAttribute('data-cad')) $$('[data-tk] > span', el).forEach(t => t.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 520, delay: 200 + (+t.parentNode.dataset.f || 0) * 1100, easing: EO, fill: 'backwards' }));
    el.animate(KF.up, { duration: 760, delay: k * 45, easing: EO, fill: 'backwards' });
  }
  function startReveal() {
    if (io) return;
    if (!motionOn()) return;
    io = new IntersectionObserver(ents => {
      let k = 0;
      ents.forEach(en => { if (en.isIntersecting) reveal(en.target, k++); });
    }, { root: zone, rootMargin: '0px 0px -8% 0px' });
    $$('[data-rv]', zone).forEach(el => { pending.add(el); io.observe(el); });
    if (zone.scrollTop + zone.clientHeight >= zone.scrollHeight - 2) requestAnimationFrame(revealTail);
  }
  // The observer ignores the bottom 8% of the viewport, so whatever sits there at the very end of the scroll never reveals by itself.
  function revealTail() {
    if (!io || !pending.size) return;
    const vh = zone.getBoundingClientRect().bottom;
    let k = 0;
    pending.forEach(el => { if (el.getBoundingClientRect().top < vh) reveal(el, k++); });
  }
  if (motionOn()) $$('[data-rv]', zone).forEach(el => { el.style.opacity = '0'; });

  /* ---------- apply state ---------- */

  function applyPages() {
    const pg = st.page;
    sections.forEach((sec, i) => {
      let t, v = 'visible', hh = 0;
      if (i < 3) {
        const retract = i === 2 && pg === 3;
        t = i === pg ? 'translateY(0)' : i > pg ? 'translateY(100%)' : retract ? 'translateY(-100%)' : 'translateY(-24%)';
        hh = i < pg && !retract ? .55 : 0;
        if (i < 2 && pg >= 2) v = 'hidden';
        sec.querySelector('.shade').style.opacity = hh;
      } else {
        t = pg === 3 ? 'translateY(0)' : 'translateY(7%)';
        v = pg >= 2 ? 'visible' : 'hidden';
      }
      sec.style.transition = i === pg || i === st.from ? `transform 1.1s ${EIO}, visibility 1.1s` : 'none';
      sec.style.transform = t;
      sec.style.visibility = v;
      sec.inert = i !== pg;
    });
  }

  function applyHud() {
    const pg = st.page;
    const act = pg < 3 ? pg : st.zone === 'log' ? 4 : 3;
    $('.hud').classList.toggle('on-dark', pg === 2);
    $('[data-hud-bg]').classList.toggle('is-on', pg === 3 && st.zScrolled);
    $('[data-hud-name]').classList.toggle('is-on', pg !== 0);
    $$('[data-go]').forEach(b => {
      const on = +b.dataset.go === act;
      b.classList.toggle('is-on', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }

  function applyStatus() {
    const held = st.paused && st.page === 0;
    $('[data-status]').textContent = held ? 'Held while you look · resumes 15 s after you stop' : `Next project in ${ROTATE_S} s · hover the figure to hold`;
    $('[data-status-dot]').classList.toggle('is-held', held);
    $('[data-pause-tag]').textContent = held ? '❚❚ held' : '';
  }

  function applyHk() {
    const cs = D.SLIDES[st.hk];
    hook.style.setProperty('--cur-ink', cs.c.ink);
    hook.style.setProperty('--cur-hi', cs.c.hi);
    $$('[data-tab]').forEach(b => b.classList.toggle('is-on', +b.dataset.tab === st.hk));
    $$('[data-slide]').forEach(s => s.classList.toggle('is-on', +s.dataset.slide === st.hk));
    $('[data-hk-line]').innerHTML = cs.line.split(' ').map(w => `<span><span data-w>${esc(w)}</span></span>`).join('');
    $('[data-hint-text]').textContent = cs.hint;
    $('[data-fig]').textContent = `FIG. ${cs.n} — ${cs.fig}`;
    $('[data-note]').textContent = cs.note;
    $('[data-verb]').textContent = cs.verb;
  }

  function applyGroup(gi, animate) {
    const g = D.GROUPS[gi], el = $(`[data-group="${gi}"]`);
    const all = benchesOf(g);
    const pvB = all.find(b => b.no === st.sel[gi]) || all.find(b => b.no === g.cover) || null;
    $$('[data-bench]', el).forEach(b => b.classList.toggle('is-on', !!pvB && b.dataset.bench === pvB.no));
    const img = pvB && D.IMG[pvB.no];
    $('[data-pv-fill]', el).outerHTML = img
      ? `<div class="pv__img" data-pv-fill role="img" aria-label="${esc(pvB.title)}" style="background-image:url('${img}')"></div>`
      : `<div class="pv__ph" data-pv-fill>${pvB ? `live preview · Lab ${pvB.no}` : 'In progress'}</div>`;
    $('[data-pv-cap]', el).textContent = pvB ? `Lab ${pvB.no} · ${pvB.title}` : 'Project III';
    $('[data-pv-desc]', el).textContent = pvB ? pvB.meta : 'Benches to come';
    if (animate && motionOn()) $('[data-pv]', el).animate([{ opacity: .3, transform: 'scale(1.02)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: EO });
  }

  function applyLog() {
    const cad = $('[data-cad]');
    const hot = st.ck != null ? st.ck : st.lh != null ? D.LOGS[st.lh].entry : null;
    cad.classList.toggle('has-hot', hot != null);
    $$('[data-tk]', cad).forEach(t => t.classList.toggle('is-hot', +t.dataset.tk === hot));
    const tip = $('[data-tip]');
    const ce = st.ck != null ? D.ENTRIES[st.ck] : null;
    tip.classList.toggle('is-on', !!ce);
    if (ce) {
      const li = laneOf(ce);
      tip.textContent = `${fmtMd(ce.md)} · ${D.LANES[li].label} · ${ce.sub}`;
      tip.style.left = `calc(168px + (100% - 168px) * ${fr(ce.md)})`;
      tip.style.top = `${li * 28 - 2}px`;
    }
    $('.latest').classList.toggle('has-on', st.lh != null);
    $$('.entry[data-lh]').forEach(e => e.classList.toggle('is-on', +e.dataset.lh === st.lh));
  }

  /* ---------- navigation ---------- */

  let topSince = 0, lastTop = 0, keepZone = false, rvT = 0;
  function go(p) {
    p = Math.max(0, Math.min(3, p));
    if (p === st.page) return;
    if (p === 3) { if (!keepZone) zone.scrollTop = 0; topSince = 0; }
    keepZone = false;
    st.from = st.page; st.page = p;
    $$('[data-card]').forEach(c => c.classList.remove('is-on')); cardsEl.classList.remove('has-on');
    applyPages(); applyHud();
    choreo(p, 480);
    if (p === 3) { clearTimeout(rvT); rvT = setTimeout(startReveal, 560); }
  }
  function goZone(where) {
    const log = $('[data-log]');
    const top = where === 'log' ? log.offsetTop + 30 : where === 'end' ? zone.scrollHeight : 0;
    if (st.page === 3) zone.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
    else { zone.scrollTop = top; keepZone = true; go(3); }
  }
  const goIdx = i => (i < 3 ? go(i) : goZone(i === 3 ? 'lab' : 'log'));

  zone.addEventListener('scroll', () => {
    const top = zone.scrollTop, vh = zone.clientHeight;
    if (top <= 0 && lastTop > 0) topSince = performance.now();
    lastTop = top;
    const log = $('[data-log]');
    const z = top + vh * .55 > log.offsetTop ? 'log' : 'lab', zs = top > 24;
    if (z !== st.zone || zs !== st.zScrolled) { st.zone = z; st.zScrolled = zs; applyHud(); }
    $$('[data-group]', zone).forEach(g => {
      const p = Math.max(0, Math.min(1, (top + 150 - g.offsetTop) / Math.max(1, g.offsetHeight - 150)));
      g.querySelector('[data-gprog]').style.transform = `scaleX(${p})`;
    });
    if (top + vh >= zone.scrollHeight - 2) revealTail();
  }, { passive: true });

  let lockAt = 0, lastW = 0, acc = 0;
  root.addEventListener('wheel', e => {
    const now = performance.now(), gap = now - lastW; lastW = now;
    if (st.page === 3) {
      if (lockAt && now - lockAt < 1000) { e.preventDefault(); return; }
      if (e.deltaY >= 0 || zone.scrollTop > 0) { acc = 0; return; }
      e.preventDefault();
      if (gap < 220 && now - topSince < 1200) return;
      acc += e.deltaY;
      if (acc < -36) { acc = 0; lockAt = now; go(2); }
      return;
    }
    const sec = sections[st.page];
    if (sec.scrollHeight > sec.clientHeight + 2) {
      const down = e.deltaY > 0;
      if ((down && sec.scrollTop + sec.clientHeight < sec.scrollHeight - 2) || (!down && sec.scrollTop > 0)) return;
    }
    e.preventDefault();
    if (lockAt && (now - lockAt < 1000 || gap < 220)) return;
    lockAt = 0;
    acc += e.deltaY;
    if (Math.abs(acc) > 36) { go(st.page + (acc > 0 ? 1 : -1)); acc = 0; lockAt = now; }
  }, { passive: false });

  window.addEventListener('keydown', e => {
    const k = e.key;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (st.page === 3) {
      const vh = zone.clientHeight, map = { ArrowDown: 120, ArrowUp: -120, PageDown: vh * .85, PageUp: -vh * .85, ' ': vh * .85 };
      if (k in map) { e.preventDefault(); if (map[k] < 0 && zone.scrollTop <= 0) go(2); else zone.scrollBy({ top: map[k], behavior: reduced ? 'auto' : 'smooth' }); }
      else if (k === 'Home') go(0);
      else if (k === 'End') { e.preventDefault(); goZone('end'); }
      return;
    }
    if (['ArrowDown', 'PageDown', ' '].includes(k)) { e.preventDefault(); go(st.page + 1); }
    else if (['ArrowUp', 'PageUp'].includes(k)) { e.preventDefault(); go(st.page - 1); }
    else if (k === 'Home') go(0);
    else if (k === 'End') goZone('end');
  });

  let ty = null, tTop = 0;
  root.addEventListener('touchstart', e => { ty = e.touches[0].clientY; tTop = zone.scrollTop; }, { passive: true });
  root.addEventListener('touchend', e => {
    if (ty == null) return;
    const dy = ty - e.changedTouches[0].clientY; ty = null;
    if (st.page === 3) { if (dy < -50 && tTop <= 0) go(2); return; }
    if (Math.abs(dy) > 50) go(st.page + (dy > 0 ? 1 : -1));
  }, { passive: true });

  // Pages are positioned by transform only; focus/scroll-into-view must never scroll the clipped root.
  root.addEventListener('scroll', () => { if (root.scrollTop || root.scrollLeft) root.scrollTo(0, 0); });

  $$('[data-go]').forEach(b => b.addEventListener('click', () => goIdx(+b.dataset.go)));
  $$('[data-to-top]').forEach(b => b.addEventListener('click', () => go(0)));

  /* ---------- 01 hook: rotation + stage ---------- */

  let elapsed = 0, hoverStage = false, lastInteract = -1e9;
  function setHk(hk) {
    if (hk === st.hk) return;
    const kb = $(`[data-kb="${hk}"]`); if (kb) kb.style.transform = 'scale(1)';
    st.hk = hk; applyHk(); hkIn();
  }
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => { elapsed = 0; lastInteract = performance.now(); setHk(+b.dataset.tab); }));

  const stage = $('[data-stage]'), cursor = $('[data-cursor]');
  stage.addEventListener('mouseenter', () => { hoverStage = true; cursor.classList.add('is-on'); });
  stage.addEventListener('mouseleave', () => { hoverStage = false; cursor.classList.remove('is-on'); });
  stage.addEventListener('mousemove', e => { const r = stage.getBoundingClientRect(); cursor.style.transform = `translate(${e.clientX - r.left}px,${e.clientY - r.top}px)`; });
  stage.addEventListener('pointerdown', () => { lastInteract = performance.now(); });

  const bars = D.SLIDES.map((_, i) => $(`[data-bar="${i}"]`));
  const kbs = D.SLIDES.map((_, i) => $(`[data-kb="${i}"]`));
  let last = performance.now();
  const tick = t => {
    const dt = Math.min(100, t - last); last = t;
    const dur = ROTATE_S * 1000;
    const paused = st.page !== 0 || hoverStage || (t - lastInteract < HOLD_MS);
    if (!paused) elapsed += dt;
    if (paused !== st.paused) { st.paused = paused; applyStatus(); }
    const p = Math.min(1, elapsed / dur);
    bars.forEach((b, i) => { b.style.transform = `scaleX(${i === st.hk ? p : 0})`; });
    if (!reduced) kbs[st.hk].style.transform = `scale(${1 + 0.045 * p})`;
    if (elapsed >= dur) { elapsed = 0; setHk((st.hk + 1) % D.SLIDES.length); }
    requestAnimationFrame(tick);
  };

  /* ---------- 02 work cards ---------- */

  $$('[data-card]').forEach(card => {
    const enter = () => {
      const t = $('[data-wt]', card);
      const top = t.offsetTop + t.offsetParent.offsetTop;
      card.style.setProperty('--ty', `${20 - top}px`);
      card.style.setProperty('--th-top', `${20 + t.offsetHeight + 14}px`);
      $$('[data-card]').forEach(c => c.classList.toggle('is-on', c === card));
      cardsEl.classList.add('has-on');
    };
    card.addEventListener('mouseenter', enter);
    card.addEventListener('focus', enter);
  });
  const workOut = () => { $$('[data-card]').forEach(c => c.classList.remove('is-on')); cardsEl.classList.remove('has-on'); };
  cardsEl.addEventListener('mouseleave', workOut);
  cardsEl.addEventListener('focusout', e => { if (!cardsEl.contains(e.relatedTarget)) workOut(); });

  /* ---------- 04 lab benches ---------- */

  function pick(gi, no) {
    if (st.sel[gi] === no) return;
    st.sel[gi] = no; applyGroup(gi, true);
  }
  D.GROUPS.forEach((g, gi) => {
    applyGroup(gi, false);
    $$('[data-bench]', $(`[data-group="${gi}"]`)).forEach(b => {
      const no = b.dataset.bench;
      // Mouse/pen: hover previews. Touch: first tap previews, second tap opens.
      b.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') pick(gi, no); });
      b.addEventListener('focus', () => { if (b.matches(':focus-visible')) pick(gi, no); });
      let ptr = 'mouse';
      b.addEventListener('pointerdown', e => { ptr = e.pointerType; });
      b.addEventListener('click', e => { if (ptr === 'touch' && st.sel[gi] !== no) { e.preventDefault(); pick(gi, no); } ptr = 'mouse'; });
    });
  });

  /* ---------- 05 log ---------- */

  const cad = $('[data-cad]');
  $$('[data-tk]', cad).forEach(t => {
    t.addEventListener('mouseenter', () => { st.ck = +t.dataset.tk; applyLog(); });
    t.addEventListener('focus', () => { st.ck = +t.dataset.tk; applyLog(); });
    t.addEventListener('blur', () => { st.ck = null; applyLog(); });
  });
  cad.addEventListener('mouseleave', () => { st.ck = null; applyLog(); });
  $$('[data-lh]').forEach(e => {
    e.addEventListener('mouseenter', () => { st.lh = +e.dataset.lh; applyLog(); });
    e.addEventListener('mouseleave', () => { st.lh = null; applyLog(); });
  });

  /* ---------- boot ---------- */

  applyHk(); applyStatus(); applyPages(); applyHud(); applyLog();
  requestAnimationFrame(tick);
  choreo(0, 120);
  setTimeout(hkIn, 500);
})();
