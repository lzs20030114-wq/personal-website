"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { LAB_INDEX, labAccent, labAnchor } from "../../src/lib/site/lab-index";

/**
 * /lab 左栏目录（2026-09-17，用户手绘立项：「左边加一列目录，可以直接概览整体，
 * 想看什么也可以直接点击跳转」+「要高级、要有动效」）。
 *
 * 数据只有一份 = src/lib/site/lab-index.ts（页面题头也从它取），这里只管画与动：
 * - **滚动读位**：以视口 30% 高度处为读线，最后一个顶边越过读线的台架 = 当前台架
 *   （sections 很高，读线判定比 IntersectionObserver 的「可见比例」稳，不会在两台之间抖）。
 *   rAF 节流，一帧只量一次。
 * - **滑动标记**：左侧 2px 竖标随当前项滑动（transform + height 过渡，颜色随内核绿/紫），
 *   不是逐项各自亮灭——目录像一台仪表在读页面。
 * - **进度线**：右缘双线里靠内那条按页面滚动进度从上往下长（scaleY，零布局）。
 * - **点击平滑跳转**：scrollIntoView smooth + pushState 写哈希（与 `#lab1-1` 锚点同一套，
 *   分享地址不变）；reduced-motion 下交给浏览器原生跳转。
 * - **入场**：各行按序 stagger 淡入（CSS 动画，`--i` 定延时；reduced-motion 停）。
 * 窄屏（<1280）由 CSS 收成一条可换行的芯片带，标记与进度线不画（见 globals.css .lab-index）。
 */
const READ_LINE = 0.3;

interface Row {
  no: string;
  title: string;
  color: string;
}

export function LabIndex() {
  const rows = useMemo<Row[]>(
    () =>
      LAB_INDEX.flatMap((g) =>
        g.segments.flatMap((s) =>
          s.benches.map((b) => ({
            no: b.no,
            title: b.title,
            color: labAccent(b.kernel),
          })),
        ),
      ),
    [],
  );
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [active, setActive] = useState<string>(rows[0]?.no ?? "");
  const [marker, setMarker] = useState<{ y: number; h: number } | null>(null);
  const [progress, setProgress] = useState(0);

  // 滚动读位 + 进度（rAF 节流）
  useEffect(() => {
    let raf = 0;
    const measure = (): void => {
      raf = 0;
      const line = window.innerHeight * READ_LINE;
      let cur = rows[0]?.no ?? "";
      for (const r of rows) {
        const el = document.getElementById(labAnchor(r.no));
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) cur = r.no;
        else break;
      }
      setActive(cur);
      const doc = document.documentElement;
      const span = doc.scrollHeight - window.innerHeight;
      setProgress(
        span > 0 ? Math.min(1, Math.max(0, window.scrollY / span)) : 0,
      );
    };
    const schedule = (): void => {
      if (!raf) raf = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // 台架懒挂载会改页面高度（WebGL 画布尺寸落定要一帧），高度一变就重读
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [rows]);

  // 标记跟到当前项（量 offsetTop，列表是 offsetParent）
  useEffect(() => {
    const el = itemRefs.current.get(active);
    const list = listRef.current;
    if (!el || !list) return;
    const place = (): void =>
      setMarker({ y: el.offsetTop, h: el.offsetHeight });
    place();
    const ro = new ResizeObserver(place);
    ro.observe(list);
    return () => ro.disconnect();
  }, [active]);

  const onJump = (e: MouseEvent<HTMLAnchorElement>, no: string): void => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = document.getElementById(labAnchor(no));
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.pushState(null, "", `#${labAnchor(no)}`);
  };

  const activeRow = rows.find((r) => r.no === active) ?? rows[0];
  const activeIdx = Math.max(
    0,
    rows.findIndex((r) => r.no === active),
  );
  let i = 0;

  return (
    <nav
      className="lab-index"
      aria-label="Lab index"
      style={
        { "--idx-color": activeRow?.color ?? "var(--accent)" } as CSSProperties
      }
    >
      <div className="lab-index__head">
        <span className="lab-index__kicker">Index</span>
        <span className="lab-index__count" aria-live="polite">
          <span className="lab-index__count-cur">
            {String(activeIdx + 1).padStart(2, "0")}
          </span>
          <span className="lab-index__count-sep">/</span>
          {String(rows.length).padStart(2, "0")}
        </span>
      </div>
      <div className="lab-index__list" ref={listRef}>
        <span
          className="lab-index__marker"
          aria-hidden
          style={
            marker
              ? {
                  transform: `translateY(${marker.y}px)`,
                  height: marker.h,
                  opacity: 1,
                }
              : { opacity: 0 }
          }
        />
        {LAB_INDEX.map((g) => (
          <div className="lab-index__group" key={g.key}>
            <p
              className="lab-index__project"
              style={{ "--i": i++ } as CSSProperties}
            >
              <span>{g.label.split(" — ")[0]}</span>
              <span className="lab-index__project-sub">
                {g.label.split(" — ")[1]}
              </span>
            </p>
            {g.segments.map((s, si) => (
              <div className="lab-index__segment" key={s.n || `${g.key}-${si}`}>
                {s.n ? (
                  <p
                    className="lab-index__scale"
                    style={{ "--i": i++ } as CSSProperties}
                  >
                    <span className="lab-index__scale-n">{s.n}</span>
                    {s.label}
                  </p>
                ) : null}
                {s.benches.map((b) => {
                  const on = b.no === active;
                  return (
                    <a
                      key={b.no}
                      href={`#${labAnchor(b.no)}`}
                      className="lab-index__item"
                      aria-current={on ? "true" : undefined}
                      data-on={on ? "" : undefined}
                      style={
                        {
                          "--i": i++,
                          "--dot": labAccent(b.kernel),
                        } as CSSProperties
                      }
                      ref={(el) => {
                        if (el) itemRefs.current.set(b.no, el);
                        else itemRefs.current.delete(b.no);
                      }}
                      onClick={(e) => onJump(e, b.no)}
                    >
                      <span className="lab-index__no">{b.no}</span>
                      <span className="lab-index__title">{b.title}</span>
                      <span className="lab-index__dot" aria-hidden />
                    </a>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="lab-index__foot" aria-hidden>
        <span className="lab-index__foot-dot" data-pulse />
        <span>All live</span>
      </div>
      <span className="lab-index__rule" aria-hidden>
        <span
          className="lab-index__progress"
          style={{ transform: `scaleY(${progress})` }}
        />
      </span>
    </nav>
  );
}
