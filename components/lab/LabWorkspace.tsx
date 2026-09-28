'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { LabActivity } from './LabActivity';
import { CAMERA_COMMAND, type CameraCommand } from './labCameraInput';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const Workspace = createContext({ expanded: null as string | null, expand: (_id: string | null) => {}, detailWidth: 296, resizeDetails: (_width: number) => {} });

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
  const drag = useRef<{ id: number; x: number; value: number } | null>(null);
  return <div className="lab-splitter" role="separator" tabIndex={0} aria-label={label} aria-orientation="vertical"
    aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} aria-valuetext={`${value} pixels`} aria-controls={controls}
    title={`${label} · 拖动或方向键调节`}
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
  const [navOpen, setNavOpen] = useState(true);
  const [navWidth, setNavWidth] = useState(208);
  const [detailWidth, setDetailWidth] = useState(296);
  const [expanded, expand] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
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
  return <Workspace.Provider value={{ expanded, expand, detailWidth, resizeDetails: setDetailWidth }}>
    <div className="lab-workspace" data-nav-open={navOpen || undefined} style={{ '--lab-nav-width': `${navWidth}px`, '--lab-detail-width': `${detailWidth}px` } as CSSProperties}>
      <div className="lab-workspace-grid">
        <aside className="lab-sidebar" aria-label="实验目录">
          <div className="lab-sidebar-sticky">
            <button ref={directoryButton} type="button" className="lab-directory-toggle" title={navOpen ? '收起目录' : '展开目录'} aria-label={navOpen ? '收起目录' : '展开目录'} aria-expanded={navOpen} aria-controls="lab-directory" onClick={() => setNavOpen(!navOpen)}>
              <span className="lab-directory-label">Index</span><WorkspaceIcon name={navOpen ? 'collapse' : 'index'} />
            </button>
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
              {customWidths && <button type="button" className="lab-layout-reset" title="恢复目录与说明的默认宽度" aria-label="恢复默认宽度" onClick={() => {
                setNavWidth(208); setDetailWidth(296);
                directoryButton.current?.focus({ preventScroll: true });
              }}><WorkspaceIcon name="reset" />Reset widths</button>}
            </div>
          </div>
        </aside>
        <div className="lab-nav-divider" hidden={!navOpen}><Splitter label="目录宽度" value={navWidth} min={176} max={280} change={setNavWidth} controls="lab-directory" /></div>
        <div className="lab-main">{children}</div>
      </div>
    </div>
  </Workspace.Provider>;
}

function visibleCamera(root: HTMLElement | null) {
  return Array.from(root?.querySelectorAll<HTMLCanvasElement>('canvas[data-lab-camera]') ?? []).find(canvas => canvas.getBoundingClientRect().width > 0 && !canvas.closest('[hidden]'));
}

export function LabPanel({ no, title, description, lede, specs, accent, children }: {
  no: string; title: string; description: string; lede: string; specs: [string, string][]; accent: string; children: ReactNode;
}) {
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
  const close = useCallback(() => workspace.expand(null), [workspace.expand]);
  // Keep 620px for the stage and the 32px gutter from the spacing system.
  const maxDetails = clamp(Math.floor(panelWidth - 652), 260, 400);
  const appliedDetailWidth = Math.min(workspace.detailWidth, maxDetails);
  useEffect(() => {
    if (window.innerWidth < 1100) setDetails(false);
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
  }, []);
  useEffect(() => {
    const node = stage.current;
    const heading = root.current?.querySelector('.lab-panel-heading');
    if (!node || !heading) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const figure = Array.from(node.querySelectorAll<HTMLElement>('.lab-fig')).find(el => el.getBoundingClientRect().height > 0 && !el.closest('[hidden]'));
        if (!figure) return;
        const controlsHeight = node.getBoundingClientRect().height - figure.getBoundingClientRect().height;
        const toolsHeight = root.current?.querySelector('.lab-view-tools')?.getBoundingClientRect().height ?? 42;
        // Reserve visible controls first. Complex multi-view benches can still scroll inside the expanded panel.
        setFigureHeight(clamp(Math.floor(window.innerHeight - heading.getBoundingClientRect().height - controlsHeight - toolsHeight - (expanded ? 32 : 100)), 240, 720));
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(node); ro.observe(heading);
    window.addEventListener('resize', measure);
    measure();
    return () => { ro.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
  }, [expanded]);
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
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
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
    if (expanded) close();
    else { setPlaceholder(root.current?.getBoundingClientRect().height ?? 0); workspace.expand(no); }
  };
  const cameraCommand = (command: CameraCommand) => visibleCamera(stage.current)?.dispatchEvent(new CustomEvent(CAMERA_COMMAND, { detail: command }));
  return <div ref={anchor} className="lab-panel-anchor" id={`lab${no}`} style={expanded ? { height: placeholder } : undefined}>
    <LabActivity.Provider value={!workspace.expanded || expanded}>
      <section ref={root} className="lab-panel" data-lab-panel={no} data-expanded={expanded || undefined} data-details={details || undefined}
        role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-labelledby={`lab-title-${no}`}
        style={{ '--lab-tone': accent, '--lab-detail-width': `${appliedDetailWidth}px`, ...(figureHeight === null ? {} : { '--lab-figure-height': `${figureHeight}px` }) } as CSSProperties}
        onPointerDownCapture={e => {
          if (!expanded && e.pointerType === 'touch' && e.target instanceof Element && e.target.closest('.lab-fig')) e.stopPropagation();
        }}>
        <header className="lab-panel-heading">
          <div className="lab-panel-number"><span className="lab-live-dot" />LAB {no}</div>
          <div className="lab-panel-title"><h2 id={`lab-title-${no}`}>{title}</h2><p>{description}</p></div>
          <div className="lab-panel-actions">
            <button type="button" aria-expanded={details} aria-controls={`lab-details-${no}`} onClick={() => setDetails(!details)} data-on={details || undefined}><WorkspaceIcon name="details" />Details <span lang="zh">说明</span></button>
            <button ref={expandButton} type="button" className="lab-expand" aria-label={`${expanded ? '恢复' : '放大'} Lab ${no}`} onClick={toggleExpand}><WorkspaceIcon name={expanded ? 'restore' : 'expand'} />{expanded ? 'Restore' : 'Expand'} <span lang="zh">{expanded ? '恢复' : '放大'}</span></button>
          </div>
        </header>
        <div className="lab-panel-body">
          <div className="lab-stage-column">
            <div className="lab-stage" ref={stage}>{children}</div>
            <div className="lab-view-tools">
              <p>{expanded ? (hasCamera ? '滚轮缩放 · 拖动查看' : '直接操作实验') : '滚轮浏览页面'}<span className="lab-touch-note"> · 放大后可触摸拖动</span></p>
              {hasCamera && <div className="lab-zoom-controls" role="group" aria-label={`Lab ${no} 相机控制`}>
                <button type="button" aria-label="缩小模型" onClick={() => cameraCommand('out')}>−</button>
                <button type="button" aria-label="放大模型" onClick={() => cameraCommand('in')}>+</button>
                <button type="button" onClick={() => cameraCommand('home')}>归位</button>
              </div>}
            </div>
          </div>
          <div className="lab-detail-divider" hidden={!details}><Splitter label={`Lab ${no} 说明宽度`} value={appliedDetailWidth} min={260} max={maxDetails} change={workspace.resizeDetails} reverse controls={`lab-details-${no}`} /></div>
          <aside className="lab-details" id={`lab-details-${no}`} hidden={!details} aria-label={`Lab ${no} 说明与规格`}>
            <div className="lab-details-head"><span>ABOUT THIS STUDY</span><div className="lab-detail-size">
              <button type="button" aria-label="缩窄说明" disabled={appliedDetailWidth <= 260} onClick={() => workspace.resizeDetails(clamp(appliedDetailWidth - 24, 260, maxDetails))}>−</button>
              <button type="button" aria-label="加宽说明" disabled={appliedDetailWidth >= maxDetails} onClick={() => workspace.resizeDetails(clamp(appliedDetailWidth + 24, 260, maxDetails))}>+</button>
            </div></div>
            <div className="lab-details-scroll" tabIndex={0}><p className="lab-description">{lede}</p>
              <h3>Specifications</h3><dl>{specs.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
            </div>
          </aside>
        </div>
      </section>
    </LabActivity.Provider>
  </div>;
}
