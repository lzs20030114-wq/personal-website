'use client';

// 主页「07 Home · Scroll Zone」（design-ref/home-scroll-zone，MAPPING §42）。
// 01 Hook → 02 Work → 03 About 按页翻（卡片叠放），03 向上收起露出 04 Lab + 05 Log 自由滚动。
// 结构：标记与状态在 React，页引擎（wheel / 键盘 / touch 分页、WAAPI 编排、IntersectionObserver 显现）
// 照稿 js/home.js 原样移植为 effect 内的命令式层——引擎常量一个数没改。
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './home.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HomeCard, HomeLabGroup, HomeLogData } from '../../../src/lib/site/home-model';
import { HookPage, buildSlides, type HookCtl } from './HookPage';
import { AboutPage, WorkPage } from './WorkAboutPages';
import { ZonePage } from './ZonePage';

const ROTATE_S = 7;
const HOLD_MS = 15000;
const EO = 'cubic-bezier(.2,.7,.1,1)';
const EIO = 'cubic-bezier(.76,0,.24,1)';
const KF: Record<string, Keyframe[]> = {
  up: [{ opacity: 0, transform: 'translateY(26px)' }, { opacity: 1, transform: 'none' }],
  rise: [{ transform: 'translateY(108%)' }, { transform: 'none' }],
  line: [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
  wipe: [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
  fade: [{ opacity: 0 }, { opacity: 1 }],
};
const DUR: Record<string, number> = { up: 820, rise: 1000, line: 1100, wipe: 1150, fade: 700 };
const PAGES = ['Hook', 'Work', 'About', 'Lab', 'Log + Contact'];
const NAV: [string, number][] = [['Work', 1], ['About', 2], ['Lab', 3], ['Log', 4]];
/** 引擎只在桌面且允许动效时接管；窄屏 / reduced-motion 回落常规文档流（MAPPING §6，CSS 里同一条件） */
const FLOW_QUERY = '(max-width: 1023px), (prefers-reduced-motion: reduce)';

export interface HomeScrollProps {
  cards: HomeCard[];
  groups: HomeLabGroup[];
  log: HomeLogData;
}

export function HomeScroll({ cards, groups, log }: HomeScrollProps) {
  const slides = useRef(buildSlides(cards)).current;
  const rootRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const secRefs = [useRef<HTMLElement>(null), useRef<HTMLElement>(null), useRef<HTMLElement>(null), useRef<HTMLElement>(null)];

  const [page, setPage] = useState(0);
  const [hk, setHkState] = useState(0);
  const [paused, setPaused] = useState(false);
  const [zone, setZone] = useState<'lab' | 'log'>('lab');
  const [zScrolled, setZScrolled] = useState(false);
  const [ck, setCk] = useState<number | null>(null);
  const [lh, setLh] = useState<number | null>(null);
  const [sel, setSel] = useState<(string | null)[]>(() => groups.map(() => null));
  const [mounted, setMounted] = useState<boolean[]>(() => slides.map((_, i) => i === 0));
  const [ready, setReady] = useState(false);

  const ctl = useRef<HookCtl>({ hoverStage: false, lastInteract: -1e9, elapsed: 0 });
  const api = useRef<{ goIdx: (i: number) => void; toTop: () => void; setHk: (i: number) => void; hkIn: () => void }>({
    goIdx: () => {},
    toTop: () => {},
    setHk: () => {},
    hkIn: () => {},
  });
  const hkRef = useRef(0);
  hkRef.current = hk;

  const onPick = useCallback((gi: number, no: string) => {
    setSel((s) => (s[gi] === no ? s : s.map((v, i) => (i === gi ? no : v))));
  }, []);

  // 第二张轮播片（Lab 2-11 画布）稍后预挂载：切过去时已建好，不在淡入当口才加载
  useEffect(() => {
    const t = setTimeout(() => setMounted((m) => m.map(() => true)), 1200);
    return () => clearTimeout(t);
  }, []);

  /* ───────── 命令式引擎（稿 js/home.js 的移植） ───────── */
  useEffect(() => {
    const root = rootRef.current!;
    const sections = secRefs.map((r) => r.current!);
    const zoneEl = sections[3];
    const flowMq = window.matchMedia(FLOW_QUERY);
    const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionOn = () => !reducedMq.matches;
    const $$ = <T extends Element = HTMLElement>(s: string, el: ParentNode = root) => Array.from(el.querySelectorAll<T>(s));
    const flow = () => flowMq.matches;

    const st = { page: 0, from: 0 };
    let topSince = 0;
    let lastTop = 0;
    let keepZone = false;
    let rvT: ReturnType<typeof setTimeout> | undefined;
    let io: IntersectionObserver | null = null;
    const pending = new Set<HTMLElement>();

    /* choreo / hkIn */
    const choreo = (i: number, base: number) => {
      if (!motionOn() || flow()) return;
      $$('[data-a]', sections[i]).forEach((el) => {
        const t = el.dataset.a!;
        el.getAnimations().forEach((a) => a.id === 'ch' && a.cancel());
        const a = el.animate(KF[t], {
          duration: DUR[t],
          delay: base + (+(el.dataset.d ?? 0) || 0),
          easing: t === 'line' ? EIO : EO,
          fill: 'backwards',
        });
        a.id = 'ch';
      });
    };
    const hkIn = () => {
      if (!motionOn() || flow()) return;
      $$('[data-w]').forEach((w, k) =>
        w.animate([{ transform: 'translateY(105%)' }, { transform: 'none' }], { duration: 760, delay: k * 28, easing: EO, fill: 'backwards' }),
      );
      $('[data-hk-hint]')?.animate(KF.fade, { duration: 600, delay: 320, easing: EO, fill: 'backwards' });
      $(`[data-slide="${hkRef.current}"]`)?.animate(
        [{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0)' }],
        { duration: 1100, easing: EIO },
      );
    };
    const $ = (s: string, el: ParentNode = root) => el.querySelector<HTMLElement>(s);

    /* 03 之后的自由滚区：条目随滚动显现 */
    const reveal = (el: HTMLElement, k: number) => {
      io?.unobserve(el);
      pending.delete(el);
      el.style.opacity = '';
      if (el.hasAttribute('data-cad')) {
        $$('[data-tk] > span', el).forEach((t) =>
          t.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], {
            duration: 520,
            delay: 200 + (+(t.parentElement!.dataset.f ?? 0) || 0) * 1100,
            easing: EO,
            fill: 'backwards',
          }),
        );
      }
      el.animate(KF.up, { duration: 760, delay: k * 45, easing: EO, fill: 'backwards' });
    };
    // 观察器忽略视口底部 8%，滚到最末时落在那里的东西不会自己显现——补一遍。
    const revealTail = () => {
      if (!io || !pending.size) return;
      const vh = zoneEl.getBoundingClientRect().bottom;
      let k = 0;
      pending.forEach((el) => {
        if (el.getBoundingClientRect().top < vh) reveal(el, k++);
      });
    };
    const startReveal = () => {
      if (io || !motionOn() || flow()) return;
      io = new IntersectionObserver(
        (ents) => {
          let k = 0;
          ents.forEach((en) => en.isIntersecting && reveal(en.target as HTMLElement, k++));
        },
        { root: zoneEl, rootMargin: '0px 0px -8% 0px' },
      );
      $$('[data-rv]', zoneEl).forEach((el) => {
        pending.add(el);
        io!.observe(el);
      });
      if (zoneEl.scrollTop + zoneEl.clientHeight >= zoneEl.scrollHeight - 2) requestAnimationFrame(revealTail);
    };
    if (motionOn() && !flow()) $$('[data-rv]', zoneEl).forEach((el) => (el.style.opacity = '0'));

    /* 页位置 */
    const applyPages = () => {
      const pg = st.page;
      sections.forEach((sec, i) => {
        if (flow()) {
          sec.style.transition = 'none';
          sec.style.transform = '';
          sec.style.visibility = '';
          sec.inert = false;
          const sh = sec.querySelector<HTMLElement>('.hs-shade');
          if (sh) sh.style.opacity = '0';
          return;
        }
        let t: string;
        let v = 'visible';
        let hh = 0;
        if (i < 3) {
          const retract = i === 2 && pg === 3;
          t = i === pg ? 'translateY(0)' : i > pg ? 'translateY(100%)' : retract ? 'translateY(-100%)' : 'translateY(-24%)';
          hh = i < pg && !retract ? 0.55 : 0;
          if (i < 2 && pg >= 2) v = 'hidden';
          const sh = sec.querySelector<HTMLElement>('.hs-shade');
          if (sh) sh.style.opacity = String(hh);
        } else {
          t = pg === 3 ? 'translateY(0)' : 'translateY(7%)';
          v = pg >= 2 ? 'visible' : 'hidden';
        }
        sec.style.transition = i === pg || i === st.from ? `transform 1.1s ${EIO}, visibility 1.1s` : 'none';
        sec.style.transform = t;
        sec.style.visibility = v;
        sec.inert = i !== pg;
      });
    };

    /* 导航 */
    const clearCards = () => {
      $$('[data-card]').forEach((c) => c.classList.remove('hs-is-on'));
      $('[data-cards]')?.classList.remove('hs-has-on');
    };
    const go = (p: number) => {
      p = Math.max(0, Math.min(3, p));
      if (flow()) {
        sections[p].scrollIntoView({ behavior: motionOn() ? 'smooth' : 'auto', block: 'start' });
        return;
      }
      if (p === st.page) return;
      if (p === 3) {
        if (!keepZone) zoneEl.scrollTop = 0;
        topSince = 0;
      }
      keepZone = false;
      st.from = st.page;
      st.page = p;
      clearCards();
      applyPages();
      setPage(p);
      choreo(p, 480);
      if (p === 3) {
        clearTimeout(rvT);
        rvT = setTimeout(startReveal, 560);
      }
    };
    const goZone = (where: 'lab' | 'log' | 'end') => {
      const log = logRef.current;
      if (flow()) {
        (where === 'log' ? log : sections[3])?.scrollIntoView({ behavior: motionOn() ? 'smooth' : 'auto', block: 'start' });
        return;
      }
      const top = where === 'log' ? (log?.offsetTop ?? 0) + 30 : where === 'end' ? zoneEl.scrollHeight : 0;
      if (st.page === 3) zoneEl.scrollTo({ top, behavior: motionOn() ? 'smooth' : 'auto' });
      else {
        zoneEl.scrollTop = top;
        keepZone = true;
        go(3);
      }
    };
    const goIdx = (i: number) => (i < 3 ? go(i) : goZone(i === 3 ? 'lab' : 'log'));
    /** 深链直落：不走翻页转场 */
    const jump = (p: number, where?: 'lab' | 'log') => {
      st.page = p;
      st.from = p;
      applyPages();
      setPage(p);
      if (p === 3) {
        zoneEl.scrollTop = where === 'log' ? (logRef.current?.offsetTop ?? 0) + 30 : 0;
        startReveal();
      }
      choreo(p, 120);
    };
    api.current.goIdx = goIdx;
    api.current.toTop = () => go(0);

    const onZoneScroll = () => {
      const top = zoneEl.scrollTop;
      const vh = zoneEl.clientHeight;
      if (top <= 0 && lastTop > 0) topSince = performance.now();
      lastTop = top;
      const log = logRef.current;
      const z = log && top + vh * 0.55 > log.offsetTop ? 'log' : 'lab';
      setZone(z);
      setZScrolled(top > 24);
      $$('[data-group]', zoneEl).forEach((g) => {
        const p = Math.max(0, Math.min(1, (top + 150 - g.offsetTop) / Math.max(1, g.offsetHeight - 150)));
        const bar = g.querySelector<HTMLElement>('[data-gprog]');
        if (bar) bar.style.transform = `scaleX(${p})`;
      });
      if (top + vh >= zoneEl.scrollHeight - 2) revealTail();
    };
    zoneEl.addEventListener('scroll', onZoneScroll, { passive: true });

    let lockAt = 0;
    let lastW = 0;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      if (flow()) return;
      const now = performance.now();
      const gap = now - lastW;
      lastW = now;
      if (st.page === 3) {
        if (lockAt && now - lockAt < 1000) {
          e.preventDefault();
          return;
        }
        if (e.deltaY >= 0 || zoneEl.scrollTop > 0) {
          acc = 0;
          return;
        }
        e.preventDefault();
        if (gap < 220 && now - topSince < 1200) return;
        acc += e.deltaY;
        if (acc < -36) {
          acc = 0;
          lockAt = now;
          go(2);
        }
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
      if (Math.abs(acc) > 36) {
        go(st.page + (acc > 0 ? 1 : -1));
        acc = 0;
        lockAt = now;
      }
    };
    root.addEventListener('wheel', onWheel, { passive: false });

    const onKey = (e: KeyboardEvent) => {
      if (flow()) return;
      const k = e.key;
      const tgt = e.target as Element | null;
      if (tgt?.closest?.('input, textarea, select, [contenteditable]')) return;
      if (st.page === 3) {
        const vh = zoneEl.clientHeight;
        const map: Record<string, number> = { ArrowDown: 120, ArrowUp: -120, PageDown: vh * 0.85, PageUp: -vh * 0.85, ' ': vh * 0.85 };
        if (k in map) {
          e.preventDefault();
          if (map[k] < 0 && zoneEl.scrollTop <= 0) go(2);
          else zoneEl.scrollBy({ top: map[k], behavior: motionOn() ? 'smooth' : 'auto' });
        } else if (k === 'Home') go(0);
        else if (k === 'End') {
          e.preventDefault();
          goZone('end');
        }
        return;
      }
      if (['ArrowDown', 'PageDown', ' '].includes(k)) {
        e.preventDefault();
        go(st.page + 1);
      } else if (['ArrowUp', 'PageUp'].includes(k)) {
        e.preventDefault();
        go(st.page - 1);
      } else if (k === 'Home') go(0);
      else if (k === 'End') goZone('end');
    };
    window.addEventListener('keydown', onKey);

    let ty: number | null = null;
    let tTop = 0;
    const onTouchStart = (e: TouchEvent) => {
      ty = e.touches[0].clientY;
      tTop = zoneEl.scrollTop;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (ty == null || flow()) return;
      const dy = ty - e.changedTouches[0].clientY;
      ty = null;
      if (st.page === 3) {
        if (dy < -50 && tTop <= 0) go(2);
        return;
      }
      if (Math.abs(dy) > 50) go(st.page + (dy > 0 ? 1 : -1));
    };
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchend', onTouchEnd, { passive: true });

    // 页面只靠 transform 定位；焦点 / scrollIntoView 不许把被裁剪的根滚走
    const onRootScroll = () => {
      if (!flow() && (root.scrollTop || root.scrollLeft)) root.scrollTo(0, 0);
    };
    root.addEventListener('scroll', onRootScroll);

    /* 01 Hook：轮播计时 */
    const bars = $$('[data-bar]');
    const kbs = $$('[data-kb]');
    let last = performance.now();
    let pausedNow = false;
    let raf = 0;
    const tick = (t: number) => {
      const dt = Math.min(100, t - last);
      last = t;
      const c = ctl.current;
      const dur = ROTATE_S * 1000;
      const isPaused = st.page !== 0 || c.hoverStage || t - c.lastInteract < HOLD_MS;
      if (!isPaused) c.elapsed += dt;
      if (isPaused !== pausedNow) {
        pausedNow = isPaused;
        setPaused(isPaused && st.page === 0);
      }
      const p = Math.min(1, c.elapsed / dur);
      bars.forEach((b, i) => (b.style.transform = `scaleX(${i === hkRef.current ? p : 0})`));
      if (motionOn() && kbs[hkRef.current]) kbs[hkRef.current].style.transform = `scale(${1 + 0.045 * p})`;
      if (c.elapsed >= dur) {
        c.elapsed = 0;
        api.current.setHk((hkRef.current + 1) % slides.length);
      }
      raf = requestAnimationFrame(tick);
    };
    api.current.setHk = (n: number) => {
      if (n === hkRef.current) return;
      const kb = $(`[data-kb="${n}"]`);
      if (kb) kb.style.transform = 'scale(1)';
      hkRef.current = n;
      setHkState(n);
    };
    raf = requestAnimationFrame(tick);

    /* 02 Work：卡片悬停（标题上移到顶、正文自下浮起，其余卡退到 42%） */
    const cardsEl = $('[data-cards]')!;
    const cards$ = $$('[data-card]');
    const enters = cards$.map((card) => {
      const enter = () => {
        const t = card.querySelector<HTMLElement>('[data-wt]')!;
        const op = t.offsetParent as HTMLElement;
        const top = t.offsetTop + op.offsetTop;
        card.style.setProperty('--ty', `${20 - top}px`);
        card.style.setProperty('--th-top', `${20 + t.offsetHeight + 14}px`);
        cards$.forEach((c) => c.classList.toggle('hs-is-on', c === card));
        cardsEl.classList.add('hs-has-on');
      };
      card.addEventListener('mouseenter', enter);
      card.addEventListener('focus', enter);
      return enter;
    });
    const workOut = () => clearCards();
    const onFocusOut = (e: FocusEvent) => {
      if (!cardsEl.contains(e.relatedTarget as Node)) workOut();
    };
    cardsEl.addEventListener('mouseleave', workOut);
    cardsEl.addEventListener('focusout', onFocusOut);

    /* 窄屏 / 偏好切换时重排 */
    flowMq.addEventListener('change', applyPages);

    /* 启动 */
    applyPages();
    setReady(true);
    const hash = window.location.hash;
    if (hash === '#work') jump(1);
    else if (hash === '#about') jump(2);
    else if (hash === '#lab') jump(3, 'lab');
    else if (hash === '#log') jump(3, 'log');
    else choreo(0, 120);
    const bootT = setTimeout(() => !flow() && (st.page === 0 ? hkIn() : undefined), 500);
    api.current.hkIn = hkIn;

    return () => {
      clearTimeout(rvT);
      clearTimeout(bootT);
      cancelAnimationFrame(raf);
      io?.disconnect();
      zoneEl.removeEventListener('scroll', onZoneScroll);
      root.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchend', onTouchEnd);
      root.removeEventListener('scroll', onRootScroll);
      cards$.forEach((c, i) => {
        c.removeEventListener('mouseenter', enters[i]);
        c.removeEventListener('focus', enters[i]);
      });
      cardsEl.removeEventListener('mouseleave', workOut);
      cardsEl.removeEventListener('focusout', onFocusOut);
      flowMq.removeEventListener('change', applyPages);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 轮播换片：词逐个升起 + 提示淡入 + 新片从右向左揭开（稿 hkIn）
  const firstHk = useRef(true);
  useEffect(() => {
    if (firstHk.current) {
      firstHk.current = false;
      return;
    }
    api.current.hkIn();
  }, [hk]);

  const act = page < 3 ? page : zone === 'log' ? 4 : 3;
  const held = paused && page === 0;
  const onTab = (i: number) => {
    ctl.current.elapsed = 0;
    ctl.current.lastInteract = performance.now();
    api.current.setHk(i);
  };

  return (
    <div className={`hs-root${ready ? ' hs-ready' : ''}`} ref={rootRef} data-hs-root>
      <section className="hs-page hs-page--hook" data-page="0" aria-label="01 Hook" ref={secRefs[0]}>
        <HookPage slides={slides} hk={hk} held={held} active={page === 0} mounted={mounted} ctl={ctl} onTab={onTab} rotateS={ROTATE_S} />
      </section>
      <section
        className="hs-page hs-page--work"
        data-page="1"
        aria-label="02 Work"
        ref={secRefs[1]}
        style={{ transform: 'translateY(100%)' }}
      >
        <WorkPage cards={cards} />
      </section>
      <section
        className="hs-page hs-page--about"
        data-page="2"
        aria-label="03 About"
        ref={secRefs[2]}
        style={{ transform: 'translateY(100%)' }}
      >
        <AboutPage />
      </section>
      <section
        className="hs-page hs-page--zone"
        data-page="3"
        aria-label="04 Lab and 05 Log"
        ref={secRefs[3]}
        style={{ transform: 'translateY(7%)', visibility: 'hidden' }}
        data-zone
      >
        <ZonePage
          groups={groups}
          log={log}
          logRef={logRef}
          active={page === 3}
          sel={sel}
          onPick={onPick}
          ck={ck}
          setCk={setCk}
          lh={lh}
          setLh={setLh}
          onTop={() => api.current.toTop()}
        />
      </section>

      <div className={`hs-hud${page === 2 ? ' hs-on-dark' : ''}`}>
        <div className={`hs-hud__bg${page === 3 && zScrolled ? ' hs-is-on' : ''}`} />
        <div className="hs-hud__bar">
          <button type="button" className={`hs-hud__name${page !== 0 ? ' hs-is-on' : ''}`} onClick={() => api.current.toTop()}>
            Zishuo Li
          </button>
          <nav className="hs-hud__nav" aria-label="Sections">
            {NAV.map(([label, i]) => (
              <button
                key={label}
                type="button"
                className={`hs-nav-btn${act === i ? ' hs-is-on' : ''}`}
                aria-current={act === i ? 'true' : undefined}
                onClick={() => api.current.goIdx(i)}
              >
                {label}
                <span className="hs-nav-btn__ul" />
              </button>
            ))}
          </nav>
        </div>
        <div className="hs-rail">
          {PAGES.map((name, i) => (
            <button
              key={name}
              type="button"
              className={`hs-rail__btn${act === i ? ' hs-is-on' : ''}`}
              aria-label={name}
              aria-current={act === i ? 'true' : undefined}
              onClick={() => api.current.goIdx(i)}
            >
              <span className="hs-rail__n">{String(i + 1).padStart(2, '0')}</span>
              <span className="hs-rail__tick" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
