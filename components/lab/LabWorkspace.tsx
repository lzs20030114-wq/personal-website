'use client';

import { useBenchLang, useLabText } from './LabLanguage';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LabActivity } from './LabActivity';
import { LabHelp, type LabHelpApi, type LabHelpEntry } from './LabHelp';
import { CAMERA_COMMAND, type CameraCommand } from './labCameraInput';
import { LAB_BENCHES, LAB_INDEX, labAccent } from '../../src/lib/site/lab-index';
import { BlockRail, BlockView } from '../site/LogBody';
import type { Bilingual, LogBlock } from '../../src/lib/site/log-schema';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
/** 说明栏默认只列前 4 条规格，其余点「全部 N 项规格」展开（09 Lab Page 稿的 specRows 默认值）。 */
const SPEC_ROWS = 4;
const cap = (s: string, lang: string) => (lang === 'zh' || !s ? s : s[0].toUpperCase() + s.slice(1));
const NOOP_CURSOR = { show: (_verb: string) => {}, move: (_x: number, _y: number) => {}, hide: () => {} };
const Workspace = createContext({ expanded: null as string | null, expand: (_id: string | null) => {}, detailWidth: 296, resizeDetails: (_width: number) => {}, cursor: NOOP_CURSOR });
/** 目录读位（LabIndex 量出来）→ 工作区顶部的「1-1 / 2-12」读数与收起后的刻度竖条。 */
const NavActive = createContext((_no: string) => {});
export const useLabNavActive = () => useContext(NavActive);
const LAST_NO = LAB_BENCHES[LAB_BENCHES.length - 1].no;

/** Small outlined controls follow the site's existing inline-SVG convention. */
function WorkspaceIcon({ name }: { name: 'index' | 'reset' | 'collapse' | 'expand' | 'restore' | 'details' }) {
  const paths = {
    index: 'M2 2.5h12v11H2z M6 2.5v11 M8.5 6h3 M8.5 9h3',
    reset: 'M3 6a5 5 0 1 1 0 4 M3 2v4h4',
    collapse: 'M10 3 5 8l5 5',
    expand: 'M9 2h5v5 M14 2 9 7 M7 14H2V9 M2 14l5-5',
    restore: 'M14 7H9V2 M9 7l5-5 M2 9h5v5 M7 9l-5 5',
    details: 'M2 2.5h12v11H2z M10 2.5v11',
  };
  return <svg className="lab-ui-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}

function Splitter({ label, value, min, max, change, reverse = false, controls }: {
  label: string; value: number; min: number; max: number; change: (value: number) => void; reverse?: boolean; controls: string;
}) {
  const lang = useBenchLang();
  const tx = useLabText(lang);
  const drag = useRef<{ id: number; x: number; value: number } | null>(null);
  return <div className="lab-splitter" role="separator" tabIndex={0} aria-label={label} aria-orientation="vertical"
    aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} aria-valuetext={`${value} ${tx("pixels")}`} aria-controls={controls}
    title={`${label} · ${tx("拖动或方向键调节")}`}
    onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: e.pointerId, x: e.clientX, value }; }}
    onPointerMove={e => { const d = drag.current; if (d?.id === e.pointerId) change(clamp(Math.round(d.value + (e.clientX - d.x) * (reverse ? -1 : 1)), min, max)); }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      change(e.key === 'Home' ? min : e.key === 'End' ? max : clamp(value + (e.key === 'ArrowRight' ? 16 : -16) * (reverse ? -1 : 1), min, max));
    }}><span aria-hidden /></div>;
}

export function LabWorkspace({ index, children }: { index: ReactNode; children: ReactNode }) {
  const lang = useBenchLang();
  const tx = useLabText(lang);
  const [navOpen, setNavOpen] = useState(true);
  const [navWidth, setNavWidth] = useState(208);
  const [detailWidth, setDetailWidth] = useState(296);
  const [expanded, expand] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<string>(LAB_BENCHES[0].no);
  const cursorEl = useRef<HTMLDivElement>(null);
  const cursorVerb = useRef<HTMLSpanElement>(null);
  const cursor = useRef({
    show: (verb: string) => { const el = cursorEl.current; if (!el) return; if (cursorVerb.current && cursorVerb.current.textContent !== verb) cursorVerb.current.textContent = verb; el.style.opacity = '1'; },
    move: (x: number, y: number) => { const el = cursorEl.current; if (el) el.style.transform = `translate(${x}px,${y}px)`; },
    hide: () => { const el = cursorEl.current; if (el) el.style.opacity = '0'; },
  }).current;
  const directoryButton = useRef<HTMLButtonElement>(null);
  const customWidths = navWidth !== 208 || detailWidth !== 296;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('lab-layout-v1') || 'null');
      if (saved) {
        if (Number.isFinite(saved.nav)) setNavWidth(clamp(saved.nav, 176, 280));
        if (Number.isFinite(saved.details)) setDetailWidth(clamp(saved.details, 260, 400));
      }
    } catch { /* Private browsing still has a usable layout. */ }
    if (window.innerWidth < 1100) setNavOpen(false);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem('lab-layout-v1', JSON.stringify({ nav: navWidth, details: detailWidth })); } catch { /* Optional preference. */ }
  }, [navWidth, detailWidth, ready]);
  return <Workspace.Provider value={{ expanded, expand, detailWidth, resizeDetails: setDetailWidth, cursor }}><NavActive.Provider value={setActive}>
    <div className="lab-workspace" data-nav-open={navOpen || undefined} style={{ '--lab-nav-width': `${navWidth}px`, '--lab-detail-width': `${detailWidth}px` } as CSSProperties}>
      <div className="lab-workspace-grid">
        <aside className="lab-sidebar" aria-label={tx("实验目录")}>
          <div className="lab-sidebar-sticky">
            <div className="lab-directory-head">
              <button ref={directoryButton} type="button" className="lab-directory-toggle" title={tx(navOpen ? '收起目录' : '展开目录')} aria-label={tx(navOpen ? '收起目录' : '展开目录')} aria-expanded={navOpen} aria-controls="lab-directory" onClick={() => setNavOpen(!navOpen)}>
                <span className="lab-directory-icon" aria-hidden>{navOpen ? '‹' : '›'}</span>
                <span className="lab-directory-label">{tx(navOpen ? 'Index · collapse' : 'Index · expand')}</span>
              </button>
              <span className="lab-directory-count" aria-hidden>{active} / {LAST_NO}</span>
            </div>
            <div id="lab-directory" hidden={!navOpen} onClick={e => {
              const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
              if (window.innerWidth < 1100 && link && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                setNavOpen(false);
                directoryButton.current?.focus({ preventScroll: true });
                // Collapsing the mobile directory changes the target's document position.
                requestAnimationFrame(() => document.getElementById(link.hash.slice(1))?.scrollIntoView({
                  behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start',
                }));
              }
            }}>
              {index}
              {customWidths && <button type="button" className="lab-layout-reset" title={tx("恢复目录与说明的默认宽度")} aria-label={tx("恢复默认宽度")} onClick={() => {
                setNavWidth(208); setDetailWidth(296);
                directoryButton.current?.focus({ preventScroll: true });
              }}><WorkspaceIcon name="reset" />{tx("Reset widths")}</button>}
            </div>
            {!navOpen && <nav className="lab-rail" aria-label={tx("实验目录")}>
              {LAB_INDEX.flatMap((g, gi) => g.segments.flatMap(sg => sg.benches.map((b, bi) => ({ b, gi, first: bi === 0 })))).map(({ b }, i, all) => {
                const on = b.no === active;
                const newProject = i > 0 && LAB_INDEX.findIndex(g => g.segments.some(sg => sg.benches.includes(b))) !== LAB_INDEX.findIndex(g => g.segments.some(sg => sg.benches.includes(all[i - 1].b)));
                return <a key={b.no} href={`#lab${b.no}`} className="lab-rail__tick" data-new-project={newProject || undefined} data-on={on || undefined} aria-current={on ? 'true' : undefined} title={`${tx('Lab')} ${b.no} · ${tx(b.title)}`} aria-label={`${tx('Lab')} ${b.no} · ${tx(b.title)}`} style={{ '--tick': labAccent(b.kernel) } as CSSProperties}><span aria-hidden /></a>;
              })}
            </nav>}
          </div>
        </aside>
        <div className="lab-nav-divider" hidden={!navOpen}><Splitter label={tx("目录宽度")} value={navWidth} min={176} max={280} change={setNavWidth} controls="lab-directory" /></div>
        <div className="lab-main">{children}</div>
      </div>
      <div ref={cursorEl} className="lab-cursor" aria-hidden><span className="lab-cursor__ring"><span /></span><span ref={cursorVerb} className="lab-cursor__verb" /></div>
    </div>
  </NavActive.Provider></Workspace.Provider>;
}

function visibleCamera(root: HTMLElement | null) {
  return Array.from(root?.querySelectorAll<HTMLCanvasElement>('canvas[data-lab-camera]') ?? []).find(canvas => canvas.getBoundingClientRect().width > 0 && !canvas.closest('[hidden]'));
}

/**
 * 台架的附件（2026-10-18 起 Lab 1-6 挂了交互机制表）：与日志条目同一套——说明栏里列卡片，
 * 点一张就在面板正文下面占满整幅展开（表要宽度才读得动，说明栏只有 260–400 px）。
 * 卡片编号、规格与展开视图都是 LogBody 导出的那两个组件，两处不会各画一套。
 */
export type LabAttachments = { title: Bilingual; blocks: LogBlock[] };

export function LabPanel({ no, title, description, lede, specs, accent, kind, verb, children, notes, attachments }: {
  no: string; title: string; description: string; lede: string; specs: [string, string][]; accent: string; kind: string; verb: string; children: ReactNode; notes?: ReactNode; attachments?: LabAttachments;
}) {
  const lang = useBenchLang();
  const tx = useLabText(lang);
  const workspace = useContext(Workspace);
  const expanded = workspace.expanded === no;
  const [details, setDetails] = useState(true);
  const [hasCamera, setHasCamera] = useState(false);
  const [panelWidth, setPanelWidth] = useState(1124);
  const [figureHeight, setFigureHeight] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const [placeholder, setPlaceholder] = useState(0);
  const [allSpecs, setAllSpecs] = useState(false);
  const [attachAt, setAttachAt] = useState<number | null>(null);
  // 控件说明（LabHelp）：面板里的控件名登记到这里，说明栏「控件」一节按它们在页面上的先后列出
  const [helps, setHelps] = useState<ReadonlyMap<string, LabHelpEntry>>(() => new Map());
  const [helpOn, setHelpOn] = useState<{ id: string; open: boolean } | null>(null);
  const detailsScroll = useRef<HTMLDivElement>(null);
  const helpApi = useMemo<LabHelpApi>(() => ({
    set(id, entry) {
      setHelps(prev => {
        if (!entry && !prev.has(id)) return prev;
        const next = new Map(prev);
        if (entry) next.set(id, entry); else next.delete(id);
        return next;
      });
    },
    // 点开的那一条钉住：点开会展开说明栏、版面一动指针就「离开」了控件名，不能因此把高亮清掉；指向另一个控件名才换
    focus(id, how = 'point') {
      if (!id) { setHelpOn(prev => (prev?.open ? prev : null)); return; }
      if (how === 'open') { setHelpOn({ id, open: true }); setDetails(true); return; }
      setHelpOn(prev => (prev?.open && prev.id === id ? prev : { id, open: false }));
    },
    entryId: id => `lab-help-${no}-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`,
  }), [no]);
  const helpList = useMemo(() => [...helps].sort(([, a], [, b]) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)), [helps]);
  // 点亮的那一条若不在说明栏视野里，只滚说明栏自己（不动页面）；点开时说明栏可能在下方（窄屏），才滚页面
  useEffect(() => {
    if (!helpOn || !details) return;
    const row = document.getElementById(helpApi.entryId(helpOn.id));
    const box = detailsScroll.current;
    if (!row || !box) return;
    const smooth = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const r = row.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.top < b.top) box.scrollBy({ top: r.top - b.top - 8, behavior: smooth });
    else if (r.bottom > b.bottom) box.scrollBy({ top: r.bottom - b.bottom + 8, behavior: smooth });
    if (helpOn.open) {
      const v = row.getBoundingClientRect();
      if (v.top < 0 || v.bottom > window.innerHeight) row.scrollIntoView({ block: 'center', behavior: smooth });
    }
  }, [helpOn, details, helpApi]);
  const attachRail = useRef<HTMLDivElement>(null);
  const attachView = useRef<HTMLDivElement>(null);
  const [solving, setSolving] = useState(false);
  const solveBar = useRef<HTMLSpanElement>(null);
  const solveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const close = useCallback(() => workspace.expand(null), [workspace.expand]);
  // 稿的放大 / 恢复：从面板自己的框沿 clip-path 铺满屏，恢复时收回到占位框（reduced-motion 直接切）。
  const fromRect = useRef<DOMRect | null>(null);
  const closing = useRef(false);
  const requestClose = useCallback(() => {
    const node = root.current, a = anchor.current;
    if (!node || !a || closing.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { close(); return; }
    closing.current = true;
    const r = a.getBoundingClientRect();
    const anim = node.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: `inset(${Math.max(0, r.top)}px ${window.innerWidth - r.right}px ${Math.max(0, window.innerHeight - r.bottom)}px ${r.left}px)` }], { duration: 560, easing: 'cubic-bezier(.76,0,.24,1)', fill: 'forwards' });
    anim.onfinish = () => { closing.current = false; close(); requestAnimationFrame(() => anim.cancel()); };
  }, [close]);
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;
  // Keep 620px for the stage and the 32px gutter from the spacing system.
  const maxDetails = clamp(Math.floor(panelWidth - 652), 260, 400);
  const appliedDetailWidth = Math.min(workspace.detailWidth, maxDetails);
  useEffect(() => {
    if (window.innerWidth < 1100 && !['2-6', '2-10', '2-11', '2-12', '2-13'].includes(no)) setDetails(false);
    const node = stage.current;
    if (!node) return;
    const update = () => setHasCamera(!!visibleCamera(node));
    update();
    const mo = new MutationObserver(update);
    mo.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-lab-camera', 'hidden', 'style'] });
    const ro = new ResizeObserver(entries => {
      setPanelWidth(entries[0].contentRect.width);
      update();
    });
    if (root.current) ro.observe(root.current);
    return () => { mo.disconnect(); ro.disconnect(); };
  }, [no]);
  // Layout effect + one synchronous first measurement: the figure is sized before the first paint,
  // and before a page transition captures the lab (MAPPING §48 — during that capture the browser
  // runs neither rAF nor ResizeObserver, so a rAF-only first measurement would land after the
  // frame has already flown to the CSS-default size). Later changes still go through rAF.
  useLayoutEffect(() => {
    const node = stage.current;
    const heading = root.current?.querySelector('.lab-panel-heading');
    if (!node || !heading) return;
    let raf = 0;
    const compute = () => {
      const figure = Array.from(node.querySelectorAll<HTMLElement>('.lab-fig')).find(el => el.getBoundingClientRect().height > 0 && !el.closest('[hidden]'));
      if (!figure) return;
      const toolsHeight = root.current?.querySelector('.lab-view-tools')?.getBoundingClientRect().height ?? 42;
      // Side-control benches: controls sit beside the drawing. Budget the whole workbench,
      // not the drawing after subtracting a stack of controls; other benches keep their sizing.
      if (['2-6', '2-10', '2-11', '2-12', '2-13', '2-14'].includes(no) && window.innerWidth >= 1100) {
        setFigureHeight(Math.max(380, Math.floor(window.innerHeight - heading.getBoundingClientRect().height - toolsHeight - (expanded ? 32 : no === '2-12' ? 128 : 48))));
        return;
      }
      const controlsHeight = node.getBoundingClientRect().height - figure.getBoundingClientRect().height;
      // Reserve visible controls first. Complex multi-view benches can still scroll inside the expanded panel.
      setFigureHeight(clamp(Math.floor(window.innerHeight - heading.getBoundingClientRect().height - controlsHeight - toolsHeight - (expanded ? 32 : 100)), 240, 720));
    };
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(node); ro.observe(heading);
    window.addEventListener('resize', measure);
    compute();
    return () => { ro.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
  }, [expanded, no]);
  // 控件一动：顶线扫一下 + 状态读「求解中…」（稿的 solve 反馈；不接真实求解进度）
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    let scan: Animation | undefined;
    const flash = (e: Event) => {
      if (!(e.target instanceof Element) || !e.target.closest('.lab-ctl, .lab-ctl__row')) return;
      clearTimeout(solveTimer.current);
      setSolving(true);
      solveTimer.current = setTimeout(() => setSolving(false), 900);
      scan?.cancel();
      scan = undefined;
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        scan = solveBar.current?.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)', offset: 0.7 }, { transform: 'scaleX(1)', opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.2,.7,.1,1)' });
      }
    };
    node.addEventListener('click', flash);
    node.addEventListener('input', flash);
    return () => { node.removeEventListener('click', flash); node.removeEventListener('input', flash); clearTimeout(solveTimer.current); scan?.cancel(); };
  }, []);
  useEffect(() => {
    if (!expanded || !root.current) return;
    const node = root.current;
    const sourceTop = anchor.current?.getBoundingClientRect().top ?? 0;
    const scrollY = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Inert siblings along the ancestor chain, never the subtree containing this same instance.
    const inerted: { el: HTMLElement; was: boolean }[] = [];
    let branch: HTMLElement = node;
    while (branch.parentElement && branch !== document.body) {
      for (const el of Array.from(branch.parentElement.children)) {
        if (el !== branch && el instanceof HTMLElement && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) { inerted.push({ el, was: el.inert }); el.inert = true; }
      }
      branch = branch.parentElement;
    }
    expandButton.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const items = Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(el => el.getClientRects().length && !el.closest('[hidden], [inert]'));
      const first = items[0], last = items[items.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || !node.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !node.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    let navigated = false;
    const navigate = () => { navigated = true; close(); };
    document.addEventListener('keydown', key);
    window.addEventListener('popstate', navigate);
    window.addEventListener('hashchange', navigate);
    return () => {
      document.removeEventListener('keydown', key);
      window.removeEventListener('popstate', navigate);
      window.removeEventListener('hashchange', navigate);
      for (const { el, was } of inerted) el.inert = was;
      document.body.style.overflow = previousOverflow;
      if (navigated) return;
      requestAnimationFrame(() => {
        if (!anchor.current?.isConnected) return;
        const delta = anchor.current.getBoundingClientRect().top - sourceTop;
        window.scrollTo({ top: scrollY + delta, behavior: 'instant' });
        expandButton.current?.focus({ preventScroll: true });
      });
    };
  }, [expanded, close]);
  const toggleExpand = () => {
    if (expanded) requestClose();
    else { fromRect.current = root.current?.getBoundingClientRect() ?? null; setPlaceholder(root.current?.getBoundingClientRect().height ?? 0); workspace.expand(no); }
  };
  useEffect(() => {
    const node = root.current, r = fromRect.current;
    if (!expanded || !node || !r || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = node.animate([{ clipPath: `inset(${r.top}px ${window.innerWidth - r.right}px ${window.innerHeight - r.bottom}px ${r.left}px)` }, { clipPath: 'inset(0 0 0 0)' }], { duration: 760, easing: 'cubic-bezier(.76,0,.24,1)' });
    return () => a.cancel();
  }, [expanded]);
  const cameraCommand = (command: CameraCommand) => visibleCamera(stage.current)?.dispatchEvent(new CustomEvent(CAMERA_COMMAND, { detail: command }));
  return <div ref={anchor} className="lab-panel-anchor" id={`lab${no}`} style={expanded ? { height: placeholder } : undefined}>
    <LabActivity.Provider value={!workspace.expanded || expanded}>
    <LabHelp.Provider value={helpApi}>
      <section ref={root} className="lab-panel" data-lab-panel={no} data-expanded={expanded || undefined} data-details={details || undefined}
        role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-labelledby={`lab-title-${no}`}
        style={{ '--lab-tone': accent, '--lab-detail-width': `${appliedDetailWidth}px`, ...(figureHeight === null ? {} : { '--lab-figure-height': `${figureHeight}px` }) } as CSSProperties}
        onPointerDownCapture={e => {
          if (!expanded && e.pointerType === 'touch' && e.target instanceof Element && e.target.closest('.lab-fig')) e.stopPropagation();
        }}>
        <header className="lab-panel-heading">
          <div className="lab-panel-number"><span className="lab-panel-no" style={{ color: 'var(--lab-tone)' }}>{tx("LAB")} {no}</span><span className="lab-panel-dash" aria-hidden /><span className="lab-panel-kind">{tx(kind)}</span></div>
          <div className="lab-panel-title"><h2 id={`lab-title-${no}`}>{tx(title)}</h2><p>{tx(description)}</p></div>
          <div className="lab-panel-actions">
            <button type="button" className="lab-notes-toggle" aria-pressed={details} aria-controls={`lab-details-${no}`} onClick={() => setDetails(!details)}><span className="lab-check" data-on={details || undefined} aria-hidden />{tx("Notes")}</button>
            {attachments && <button type="button" className="lab-attach-toggle" aria-controls={`lab-details-${no}`} onClick={() => { setDetails(true); requestAnimationFrame(() => attachRail.current?.scrollIntoView({ block: 'nearest' })); }}>{lang === 'zh' ? '附件' : 'Attachments'}<span className="lab-attach-n">{attachments.blocks.length}</span></button>}
            <button ref={expandButton} type="button" className="lab-expand" aria-label={`${tx(expanded ? '恢复' : '放大')} ${tx('Lab')} ${no}`} onClick={toggleExpand}>{expanded ? tx('Restore ↙') : tx('Expand ↗')}</button>
          </div>
        </header>
        <div className="lab-panel-body">
          <div className="lab-stage-column">
            <span className="lab-solve-bar" ref={solveBar} aria-hidden />
            <div className="lab-stage" ref={stage}
              onPointerMove={e => {
                if (e.pointerType !== 'mouse' || expanded) return;
                if (e.target instanceof Element && e.target.closest('.lab-fig')) { workspace.cursor.show(tx(verb)); workspace.cursor.move(e.clientX, e.clientY); }
                else workspace.cursor.hide();
              }}
              onPointerLeave={() => workspace.cursor.hide()}>{children}</div>
            <div className="lab-view-tools">
              <p><span className="lab-hint-dot" aria-hidden />{expanded ? (hasCamera ? tx('Wheel zooms the model · drag to orbit · Esc restores') : cap(tx(verb), lang) + tx(' · Esc restores')) : no === '1-5' ? tx('Fixed view · switch it with the buttons') : cap(tx(verb), lang) + tx(' · wheel scrolls the page')}</p>
              <span className="lab-status" data-solving={solving || undefined}><i aria-hidden />{solving ? tx('solving…') : tx('live')}</span>
              {hasCamera && <div className="lab-zoom-controls" role="group" aria-label={`${tx('Lab')} ${no} ${tx('相机控制')}`}>
                <button type="button" aria-label={tx("缩小模型")} onClick={() => cameraCommand('out')}>−</button>
                <button type="button" aria-label={tx("放大模型")} onClick={() => cameraCommand('in')}>+</button>
                <button type="button" onClick={() => cameraCommand('home')}>{tx("归位")}</button>
              </div>}
            </div>
          </div>
          <div className="lab-detail-divider" hidden={!details}><Splitter label={`${tx('Lab')} ${no} ${tx('说明宽度')}`} value={appliedDetailWidth} min={260} max={maxDetails} change={workspace.resizeDetails} reverse controls={`lab-details-${no}`} /></div>
          <aside className="lab-details" id={`lab-details-${no}`} hidden={!details} aria-label={`${tx('Lab')} ${no} ${tx('说明与规格')}`}>
            <div className="lab-details-head"><span>{tx("About this study")}</span></div>
            <div ref={detailsScroll} className="lab-details-scroll" tabIndex={0}>
              {notes && <div>{notes}</div>}
              <p className="lab-description">{tx(lede)}</p>
              <h3 className="lab-sr-only">{tx("Specifications")}</h3>
              <dl>{(allSpecs ? specs : specs.slice(0, SPEC_ROWS)).map(([key, value]) => <div key={key}><dt>{tx(key)}</dt><dd>{tx(value)}</dd></div>)}</dl>
              {specs.length > SPEC_ROWS && <button type="button" className="lab-specs-more" aria-expanded={allSpecs} onClick={() => setAllSpecs(!allSpecs)}>{allSpecs ? tx('Fewer specs ↑') : (lang === 'zh' ? `全部 ${specs.length} 项规格 ↓` : `All ${specs.length} specs ↓`)}</button>}
              {helpList.length > 0 && <section className="lab-controls-help">
                <h3>{lang === 'zh' ? '控件' : 'Controls'}<span>{lang === 'zh' ? '指向控件名，对应的一条会点亮' : 'Point at a control name to highlight it here'}</span></h3>
                <dl>{helpList.map(([id, e]) => <div key={id} id={helpApi.entryId(id)} data-active={helpOn?.id === id || undefined}><dt>{cap(e.name, lang)}</dt><dd>{e.text}</dd></div>)}</dl>
              </section>}
              {attachments && <div ref={attachRail} className="lab-attachments">
                <BlockRail blocks={attachments.blocks} lang={lang} title={attachments.title[lang]} openAt={attachAt} viewId={`lab-attach-${no}`}
                  onToggle={i => {
                    setAttachAt(attachAt === i ? null : i);
                    requestAnimationFrame(() => attachView.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
                  }} />
              </div>}
            </div>
          </aside>
        </div>
        {attachments && <div className="lab-attach-view">
          <BlockView id={`lab-attach-${no}`} viewRef={attachView} blocks={attachments.blocks} lang={lang} openAt={attachAt} onClose={() => setAttachAt(null)} />
        </div>}
      </section>
    </LabHelp.Provider>
    </LabActivity.Provider>
  </div>;
}
