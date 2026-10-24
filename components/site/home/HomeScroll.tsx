'use client';

// 主页「07 Home · Scroll Zone」（design-ref/home-scroll-zone，MAPPING §42）。
// 01 Field → 02 Work → 03 About 按页翻（卡片叠放），03 向上收起露出 04 Lab + 05 Log 自由滚动。
// 结构：标记与状态在 React，页引擎（wheel / 键盘 / touch 分页、WAAPI 编排、IntersectionObserver 显现）
// 照稿 js/home.js 原样移植为 effect 内的命令式层——引擎常量一个数没改。
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './home.css';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { HomeCard, HomeField, HomeLabGroup, HomeLogData } from '../../../src/lib/site/home-model';
import { FieldPage } from './FieldPage';
import { AboutPage, WorkPage } from './WorkAboutPages';
import { ZonePage } from './ZonePage';
import { HOME_ZONE_KEY, pageTransitionActive } from '../pageTransitionState';

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
const PAGES = ['Field', 'Work', 'About', 'Lab', 'Log + Contact'];
const NAV: [string, number][] = [['Work', 1], ['About', 2], ['Lab', 3], ['Log', 4]];
/** 引擎只在桌面且允许动效时接管；窄屏 / reduced-motion 回落常规文档流（MAPPING §6，CSS 里同一条件） */
const FLOW_QUERY = '(max-width: 1023px), (prefers-reduced-motion: reduce)';
/** 离开 Lab / Log 区时记下的滚动位置多久内还算数（只为「按返回落回原处」） */
const ZONE_MEMORY_MS = 30 * 60 * 1000;

/** 取一次「离开时 Lab / Log 区滚到哪了」（页面转场写的，MAPPING §48）；取过即删，太旧不用。 */
function takeZoneMemory(): number | null {
  try {
    const raw = sessionStorage.getItem(HOME_ZONE_KEY);
    sessionStorage.removeItem(HOME_ZONE_KEY);
    const v = raw ? (JSON.parse(raw) as { top?: number; at?: number }) : null;
    return v && typeof v.top === 'number' && Date.now() - (v.at ?? 0) < ZONE_MEMORY_MS ? v.top : null;
  } catch {
    return null;
  }
}

export interface HomeScrollProps {
  cards: HomeCard[];
  groups: HomeLabGroup[];
  log: HomeLogData;
  field: HomeField;
}

export function HomeScroll({ cards, groups, log, field }: HomeScrollProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const secRefs = [useRef<HTMLElement>(null), useRef<HTMLElement>(null), useRef<HTMLElement>(null), useRef<HTMLElement>(null)];

  const [page, setPage] = useState(0);
  const [flowMode, setFlowMode] = useState(false);
  const [zone, setZone] = useState<'lab' | 'log'>('lab');
  const [zScrolled, setZScrolled] = useState(false);
  const [ck, setCk] = useState<number | null>(null);
  const [lh, setLh] = useState<number | null>(null);
  const [sel, setSel] = useState<(string | null)[]>(() => groups.map(() => null));
  const [ready, setReady] = useState(false);

  const api = useRef<{ goIdx: (i: number) => void; toTop: () => void }>({
    goIdx: () => {},
    toTop: () => {},
  });

  const onPick = useCallback((gi: number, no: string) => {
    setSel((s) => (s[gi] === no ? s : s.map((v, i) => (i === gi ? no : v))));
  }, []);

  /* ───────── 命令式引擎（稿 js/home.js 的移植） ─────────
     layout effect 而不是 effect：深链（/#work 等）的落位要在首帧之前做完——
     否则首帧先画出第一页再跳走；页面转场（MAPPING §48）也要在截新画面之前看到落好的那一页
     （转场等新页时浏览器暂停渲染，passive effect 什么时候跑不归它管）。 */
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const sections = secRefs.map((r) => r.current!);
    const zoneEl = sections[3];
    const flowMq = window.matchMedia(FLOW_QUERY);
    const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionOn = () => !reducedMq.matches;
    const $$ = <T extends Element = HTMLElement>(s: string, el: ParentNode = root) => Array.from(el.querySelectorAll<T>(s));
    const flow = () => flowMq.matches;
    // 经页面转场回到首页（从案例页 / Lab 返回）：底下这一页「一直在那儿」，不重播入场编排
    const arriving = pageTransitionActive();
    const arrivingZone = arriving && (window.location.hash === '#lab' || window.location.hash === '#log');

    const st = { page: 0, from: 0 };
    let topSince = 0;
    let lastTop = 0;
    let keepZone = false;
    let rvT: ReturnType<typeof setTimeout> | undefined;
    let io: IntersectionObserver | null = null;
    let revealsDisabled = flow() || arrivingZone;
    let flowZoneTop = 0;
    let flowRaf = 0;
    const pending = new Set<HTMLElement>();

    /* choreo */
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
    const $ = (s: string, el: ParentNode = root) => el.querySelector<HTMLElement>(s);

    /* 03 之后的自由滚区：条目随滚动显现 */
    const reveal = (el: HTMLElement, k: number) => {
      io?.unobserve(el);
      pending.delete(el);
      el.style.opacity = '';
      if (!motionOn() || flow() || revealsDisabled) return;
      if (el.hasAttribute('data-cad')) {
        $$('[data-tk] > span', el).forEach((t) => {
          t.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], {
            duration: 520,
            delay: 200 + (+(t.parentElement!.dataset.f ?? 0) || 0) * 1100,
            easing: EO,
            fill: 'backwards',
          }).id = 'rv';
        });
      }
      el.animate(KF.up, { duration: 760, delay: k * 45, easing: EO, fill: 'backwards' }).id = 'rv';
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
      if (io || !motionOn() || flow() || revealsDisabled) return;
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
    if (motionOn() && !flow() && !arrivingZone) $$('[data-rv]', zoneEl).forEach((el) => (el.style.opacity = '0'));

    /* 页位置（instant = 深链直落：不走 1.1s 的翻页过渡） */
    const applyPages = (instant = false) => {
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
        sec.style.transition = !instant && (i === pg || i === st.from) ? `transform 1.1s ${EIO}, visibility 1.1s` : 'none';
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
    /** 深链直落：不走翻页转场（窄屏文档流里就是滚到那一节） */
    const jump = (p: number, where?: 'lab' | 'log') => {
      st.page = p;
      st.from = p;
      applyPages(true);
      setPage(p);
      if (flow()) {
        (where === 'log' ? logRef.current : sections[p])?.scrollIntoView({ behavior: 'auto', block: 'start' });
        return;
      }
      if (p === 3) {
        const back = takeZoneMemory();
        zoneEl.scrollTop = back ?? (where === 'log' ? (logRef.current?.offsetTop ?? 0) + 30 : 0);
        startReveal();
      }
      if (!arriving) choreo(p, 120);
    };
    api.current.goIdx = goIdx;
    api.current.toTop = () => go(0);

    const onZoneScroll = () => {
      if (flow()) return;
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

    // 文档流没有 go() 的翻页状态；读实际滚动位置更新导航与返回锚点。
    // 台架是否运行仍由各自的 IO 判定，不能拿这条读线代替可见性。
    const syncFlowPosition = () => {
      if (!flow()) return;
      const vh = window.innerHeight;
      let current = 0;
      sections.forEach((sec, i) => {
        if (sec.getBoundingClientRect().top <= vh * 0.3) current = i;
      });
      if (current !== st.page) {
        st.from = st.page;
        st.page = current;
        setPage(current);
      }
      flowZoneTop = Math.max(0, -zoneEl.getBoundingClientRect().top);
      setZone(logRef.current && logRef.current.getBoundingClientRect().top < vh * 0.55 ? 'log' : 'lab');
      setZScrolled(flowZoneTop > 24);
      $$('[data-group]', zoneEl).forEach((g) => {
        const p = Math.max(0, Math.min(1, (150 - g.getBoundingClientRect().top) / Math.max(1, g.offsetHeight - 150)));
        const bar = g.querySelector<HTMLElement>('[data-gprog]');
        if (bar) bar.style.transform = `scaleX(${p})`;
      });
    };
    const onDocumentScroll = () => {
      if (!flow() || flowRaf) return;
      flowRaf = requestAnimationFrame(() => {
        flowRaf = 0;
        syncFlowPosition();
      });
    };
    window.addEventListener('scroll', onDocumentScroll, { passive: true });
    window.addEventListener('resize', onDocumentScroll);

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
      if (flow() || e.defaultPrevented) return;
      const k = e.key;
      const tgt = e.target as Element | null;
      if (tgt?.closest?.('input, textarea, select, [contenteditable], [role="tab"], [role="slider"]')) return;
      if (k === ' ' && tgt?.closest?.('a[href], button, summary, [role="button"]')) return;
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
    const onFlowChange = () => {
      setFlowMode(flow());
      applyPages(true);
      if (flow()) {
        // 桌面尚未显现的条目在文档流必须立即可见；已经展示过的内容不再重播。
        clearTimeout(rvT);
        io?.disconnect();
        io = null;
        pending.clear();
        revealsDisabled = true;
        $$('[data-rv]', zoneEl).forEach((el) => (el.style.opacity = ''));
        root.getAnimations({ subtree: true }).forEach((a) => {
          if (a.id === 'ch' || a.id === 'rv') a.cancel();
        });
        const top = sections[st.page].getBoundingClientRect().top + window.scrollY + (st.page === 3 ? lastTop : 0);
        window.scrollTo({ top, behavior: 'instant' });
        syncFlowPosition();
      } else {
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (st.page === 3) zoneEl.scrollTop = flowZoneTop;
        onZoneScroll();
      }
    };
    flowMq.addEventListener('change', onFlowChange);

    /* 启动 */
    setFlowMode(flow());
    applyPages();
    setReady(true);
    const hash = window.location.hash;
    if (hash === '#work') jump(1);
    else if (hash === '#about') jump(2);
    else if (hash === '#lab') jump(3, 'lab');
    else if (hash === '#log') jump(3, 'log');
    else if (!arriving) choreo(0, 120);
    syncFlowPosition();

    return () => {
      clearTimeout(rvT);
      cancelAnimationFrame(flowRaf);
      io?.disconnect();
      zoneEl.removeEventListener('scroll', onZoneScroll);
      root.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onDocumentScroll);
      window.removeEventListener('resize', onDocumentScroll);
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchend', onTouchEnd);
      root.removeEventListener('scroll', onRootScroll);
      cards$.forEach((c, i) => {
        c.removeEventListener('mouseenter', enters[i]);
        c.removeEventListener('focus', enters[i]);
      });
      cardsEl.removeEventListener('mouseleave', workOut);
      cardsEl.removeEventListener('focusout', onFocusOut);
      flowMq.removeEventListener('change', onFlowChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = page < 3 ? page : zone === 'log' ? 4 : 3;

  return (
    // data-hs-page / data-hs-zone：页面转场离开首页时据此把地址写成 /#work 等，按返回落回原处（MAPPING §48）
    <div className={`hs-root${ready ? ' hs-ready' : ''}`} ref={rootRef} data-hs-root data-hs-page={page} data-hs-zone={zone}>
      <section className="hs-page hs-page--hook" data-page="0" aria-label="01 Field" ref={secRefs[0]}>
        <FieldPage field={field} active={!flowMode && page === 0} onWork={() => api.current.goIdx(1)} onAbout={() => api.current.goIdx(2)} />
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
          active={flowMode || page === 3}
          sel={sel}
          onPick={onPick}
          ck={ck}
          setCk={setCk}
          lh={lh}
          setLh={setLh}
          onTop={() => api.current.toTop()}
        />
      </section>

      <div className={`hs-hud${!flowMode && (page === 2 || page === 0) ? ' hs-on-dark' : ''}`}>
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
