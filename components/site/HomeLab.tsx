'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { LAB_BENCHES, LAB_INDEX, labAccent, labAnchor } from '../../src/lib/site/lab-index';
import type { HomeLog } from './HomeScreens';
import { HomeLabPreview } from './HomeLabPreview';
import styles from './HomeLab.module.css';

const DEFAULTS = ['1-4', '2-12'];
const pad = (n: number) => String(n).padStart(2, '0');

/** S2 的展示层；项目/台架次序来自与 /lab 共用的目录，日志仍来自服务端内容池。 */
export function HomeLab({ logs }: { logs: HomeLog[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const [selected, setSelected] = useState(DEFAULTS[0]);
  const [visible, setVisible] = useState(false);
  const [visited, setVisited] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const last = useRef([...DEFAULTS]);
  const current = LAB_BENCHES.find(b => b.no === selected)!;
  const groupIndex = selected.startsWith('1-') ? 0 : 1;
  const group = LAB_INDEX[groupIndex];
  const segment = group.segments.find(s => s.benches.some(b => b.no === selected))!;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1];
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setVisited(true);
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(hoverTimer.current); };
  }, []);

  const choose = (no: string) => {
    clearTimeout(hoverTimer.current);
    last.current[no.startsWith('1-') ? 0 : 1] = no;
    setSelected(no);
  };
  const toggle = (i: number) => {
    clearTimeout(hoverTimer.current);
    setOpen(open === i ? null : i);
    if (open !== i) choose(last.current[i]);
  };
  const navigateList = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const links = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>('a[data-experiment]'));
    const i = links.indexOf(e.target as HTMLAnchorElement);
    if (i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1
      : (i + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
    links[next].focus();
  };

  return (
    <div className={styles.shell} ref={root}>
      <header className={styles.header} data-row>
        <div>
          <p className={styles.eyebrow}><span>S2 /</span> Experiments & working notes</p>
          <h2 className={styles.title}>The lab<span>.</span></h2>
        </div>
        <div className={styles.headerAside}>
          <span className={styles.total}>{pad(LAB_BENCHES.length)} <span>live experiments<br />across two projects</span></span>
          <a href="/lab" data-pt="fade" className={styles.textLink}>Explore the lab <span aria-hidden>↗</span></a>
        </div>
      </header>

      <div className={styles.explorer} data-row>
        <div className={styles.catalog}>
          <div className={styles.catalogTop}><span>Index / by project</span><span className={styles.legend}><i />2D <i />3D</span></div>
          {LAB_INDEX.map((g, i) => {
            const expanded = open === i;
            const benches = g.segments.flatMap(s => s.benches);
            const [project, title] = g.label.split(' — ');
            return (
              <div key={g.key} className={styles.group} data-open={expanded}>
                <h3>
                  <button type="button" className={styles.groupToggle} aria-expanded={expanded}
                    aria-controls={`home-${g.key}`} onClick={() => toggle(i)}>
                    <span className={styles.projectNumber}>{pad(i + 1)}</span>
                    <span><small>{project}</small><span className={styles.groupTitle}>{title}</span></span>
                    <span className={styles.groupCount}>{pad(benches.length)}</span>
                    <span className={styles.plus} aria-hidden />
                  </button>
                </h3>
                <div className={styles.drawer} data-open={expanded} inert={!expanded}
                  aria-hidden={!expanded} id={`home-${g.key}`}>
                  <div>
                    <div className={styles.items} data-columns={benches.length > 6 ? 'two' : 'one'}
                      onKeyDown={navigateList} onPointerLeave={() => clearTimeout(hoverTimer.current)}>
                      {benches.map(b => (
                        <div key={b.no} className={styles.itemWrap} data-selected={selected === b.no}>
                          <a href={`/lab#${labAnchor(b.no)}`} data-pt="fade"
                            data-experiment={b.no} className={styles.item}
                            style={{ '--item-accent': labAccent(b.kernel) } as CSSProperties}
                            aria-controls="home-lab-preview"
                            onFocus={() => choose(b.no)}
                            onPointerEnter={e => {
                              if (e.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
                              clearTimeout(hoverTimer.current);
                              hoverTimer.current = setTimeout(() => choose(b.no), 120);
                            }}>
                            <span className={styles.itemNo}>{b.no}</span>
                            <span className={styles.itemTitle}>{b.title}</span>
                            <span className={styles.itemArrow} aria-hidden>↗</span>
                          </a>
                          {selected === b.no && <div className={styles.mobileDetail}>
                            <p>{b.description}</p><a href={`/lab#${labAnchor(b.no)}`}>Open experiment ↗</a>
                          </div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div className={styles.catalogFoot}><span>Choose an experiment to open</span><span aria-hidden>↗</span></div>
        </div>

        <div className={styles.preview} id="home-lab-preview">
          <a className={styles.stage} href={`/lab#${labAnchor(selected)}`} data-pt="fade"
            aria-label={`Open Lab ${selected}: ${current.title}`}
            onPointerMove={e => {
              if (e.pointerType !== 'mouse') return;
              const r = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty('--pointer-x', `${e.clientX - r.left}px`);
              e.currentTarget.style.setProperty('--pointer-y', `${e.clientY - r.top}px`);
            }}>
            <span className={styles.stageTop}><span>Lab {selected}</span><span className={styles.live}><i />Live preview</span></span>
            <div className={styles.stageCanvas} key={selected} aria-hidden inert>
              {visited && <HomeLabPreview no={selected} active={visible} />}
            </div>
            <span className={styles.stageBottom}><span>{segment.label || 'Mechanisms'} / {current.kernel === '2d' ? '2D' : '3D'}</span><span>Open experiment <b aria-hidden>↗</b></span></span>
            <span className={styles.cursor} aria-hidden>↗</span>
          </a>
          <div className={styles.caption} key={`caption-${selected}`}>
            <div><p className={styles.captionKicker}>{group.label.split(' — ')[0]} <span>/ {current.meta}</span></p>
              <h3>{current.title}</h3></div>
            <p className={styles.description}>{current.description}</p>
          </div>
        </div>
      </div>

      <section className={styles.log} aria-labelledby="home-log-heading" data-row>
        <div className={styles.logHead}><h2 id="home-log-heading">Work log<span> / Latest</span></h2>
          <a href="/archive" data-pt="fade" className={styles.textLink}>All entries <span aria-hidden>↗</span></a></div>
        <div className={styles.logEntries}>
          {logs.map((entry, i) => <a key={`${entry.date}-${i}`} href={entry.href} className={styles.logEntry}>
            <span className={styles.logDate}><time dateTime={entry.date}>{entry.date}</time><span aria-hidden>↗</span></span>
            <p>{entry.text}</p>
          </a>)}
        </div>
      </section>
      <details className={styles.colophon}><summary>Colophon <span aria-hidden>+</span></summary>
        <p>[待作者供稿] 一句：这个站本身如何被构建</p></details>
    </div>
  );
}
