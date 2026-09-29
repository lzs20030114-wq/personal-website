'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './LabControlLabel.module.css';
import { useBenchLang, useLabText } from './LabLanguage';

/** Shared control help. Portals keep the note clear of clipped canvases and control panels. */
export function LabControlLabel({ children, help, lang: explicitLang }: {
  children: ReactNode;
  help: string | readonly [string, string];
  lang?: 'zh' | 'en';
}) {
  const lang = useBenchLang(explicitLang);
  const tx = useLabText(lang);
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const text = typeof help === 'string' ? tx(help) : help[lang === 'zh' ? 0 : 1];
  const cancelHide = () => { if (timer.current) clearTimeout(timer.current); };
  const show = () => { cancelHide(); setOpen(true); };
  const hideSoon = () => {
    cancelHide();
    timer.current = setTimeout(() => {
      if (document.activeElement !== anchor.current) setOpen(false);
    }, 120);
  };

  useLayoutEffect(() => {
    if (!open || !anchor.current || !tooltip.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tooltip.current.getBoundingClientRect();
    setPosition({
      left: Math.max(12, Math.min(a.left, window.innerWidth - t.width - 12)),
      top: a.top >= t.height + 20 ? a.top - t.height - 8 : Math.min(a.bottom + 8, window.innerHeight - t.height - 12),
    });
  }, [open, text]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
    };
    const outside = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node) && !tooltip.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', escape, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [open]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return <>
    <span ref={anchor} className={`k ${styles.label}`} tabIndex={0} aria-describedby={open ? id : undefined}
      onPointerEnter={show} onPointerLeave={hideSoon} onFocus={show} onBlur={() => setOpen(false)}
      onClick={show}>
      {children}
    </span>
    {open && createPortal(<span ref={tooltip} id={id} role="tooltip" className={styles.tooltip}
      style={position} onPointerEnter={cancelHide} onPointerLeave={hideSoon}>{text}</span>, document.body)}
  </>;
}
