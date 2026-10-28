/**
 * 首页五屏的排版与动效细节（2026-10-27，4aC 视觉研究的落地，MAPPING §70）。
 * 不碰 DOM：FieldPage / ZonePage 与守门测试共用这一份。按 SITE_SPEC §1 克制条款，
 * 时长与手感常量集中登记在这里。
 */

export const FX = {
  /** 01 方块场：光标附近的方块转角、拉斜、同时缩小；按距离高斯衰减的半径（px） */
  TILT_R: 190,
  /** 正对指针时的最大转角 / 拉斜（度）与缩小量。
   * 2026-10-28（MAPPING §75）放大 0.28 改成缩小 0.35：放大时转过去的方块互相压在一起；
   * 缩小后方块转 30°、拉斜 16° 仍落在自己那一格里（方块边长约格子的 0.78，转斜后外框 ×1.65，再 ×0.65 ≈ 0.84 格） */
  TILT_ROT: 30,
  TILT_SKEW: 16,
  TILT_SHRINK: 0.35,
  /** 系数低于这个值就当作不倾斜（远处的方块不写样式） */
  TILT_MIN: 0.06,
  /** 倾斜系数分多少档（2026-10-28 性能排查）：指针每动一帧，半径 320px 内约 70 个方块都要改 transform、各自重开一段 .7s 过渡；
   * 取档以后远处变化慢的方块多数帧落在同一档、不用重写。转角一档 1.25°，有 .7s 过渡抹平，看不出台阶 */
  TILT_LEVELS: 24,
  /** 01 字格（2026-10-27，画布 H6b，MAPPING §71）：鼠标附近的字变宽变粗；横向影响几格宽、纵向几格高——沿着这一行鼓起来 */
  SWELL_REACH_X: 2.4,
  SWELL_REACH_Y: 0.9,
  /** 字宽轴 wdth 与字重：平时细窄（与后几屏的大标题同一端），鼓到最宽最粗（与关键词同一端） */
  SWELL_WDTH: [64, 125] as const,
  SWELL_WGHT: [230, 760] as const,
  /** 影响低于这个值当作不鼓（写回平时的样子） */
  SWELL_MIN: 0.04,
  /** 变宽快、收回慢：鼠标扫过后留一点拖尾 */
  SWELL_IN_MS: 240,
  SWELL_OUT_MS: 1400,
  /** 03 About 宣言（2026-10-28，MAPPING §74）：同一种鼓起，起点是宣言自己的两档——细窄的字与宽粗的名词（与 .hs-h2--say / .hs-w 同值） */
  SAY_PLAIN: { wdth: 76, wght: 300 },
  SAY_WIDE: { wdth: 125, wght: 640 },
  /** 宣言鼓到的最宽最粗（§75）：字重到字体上限 900——两个名词本来就最宽，只能靠变粗回应，鼓到 760 几乎看不出来 */
  SAY_PEAK: { wdth: 125, wght: 900 },
  /** 宣言的「一格」按字号折算：横向半个字号约一个字宽，纵向一个行高（.hs-h2--say 的 line-height） */
  SAY_CELL_W: 0.5,
  SAY_CELL_H: 0.88,
  /** 04 Lab：楔形两条边追上新选中行的时间常数（ms），约 3τ ≈ 200ms 到位，与 hover 反馈同档 */
  WEDGE_TAU_MS: 70,
  /** 楔形落在预览框左边上的那一点，离框的上下边至少留多少（px） */
  WEDGE_INSET: 22,
  /** 选中行离开预览框上下多远（px）就不再画楔形（长列表里往下滚，选中行早已滚出去时） */
  WEDGE_REACH: 96,
} as const;

export interface Tilt {
  rot: number;
  skew: number;
  scale: number;
}

/**
 * 方块中心相对指针偏 (dx, dy) 时的倾斜量；太远返回 null。
 * 转向按方块在指针左侧还是右侧取反，读起来像被指针往两边推开（参考：正定私募基金那张随位置变形的格子）。
 */
export function tiltAt(dx: number, dy: number, r: number = FX.TILT_R): Tilt | null {
  const raw = Math.exp(-(dx * dx + dy * dy) / (r * r));
  if (raw < FX.TILT_MIN) return null;
  const f = Math.round(raw * FX.TILT_LEVELS) / FX.TILT_LEVELS;
  const side = dx < 0 ? -1 : 1;
  return { rot: side * f * FX.TILT_ROT, skew: -f * FX.TILT_SKEW, scale: 1 - f * FX.TILT_SHRINK };
}

/** 倾斜量写成 transform（null = 空串，即不倾斜）；保留一位小数，指针微动时同一格的字符串不变就不必重写样式 */
export function tiltCss(t: Tilt | null): string {
  return t ? `rotate(${t.rot.toFixed(1)}deg) skewX(${t.skew.toFixed(1)}deg) scale(${t.scale.toFixed(2)})` : '';
}

/** 字格离指针 (dx, dy) 格时被鼓起的程度（0–1）；横向按 SWELL_REACH_X、纵向按 SWELL_REACH_Y 高斯衰减 */
export function swellAt(dxCells: number, dyCells: number): number {
  const f = Math.exp(-(dxCells * dxCells) / (2 * FX.SWELL_REACH_X ** 2) - (dyCells * dyCells) / (2 * FX.SWELL_REACH_Y ** 2));
  return f < FX.SWELL_MIN ? 0 : f;
}

export interface Axes {
  wdth: number;
  wght: number;
}

const SWELL_PEAK: Axes = { wdth: FX.SWELL_WDTH[1], wght: FX.SWELL_WGHT[1] };

/** 从某个起点（平时的字宽字重）鼓向 peak：f = 0 是起点、1 是 peak（默认 SWELL_WDTH / SWELL_WGHT 的上端；整数，同一个字的值不变就不必重写样式） */
export function swellFrom(base: Axes, f: number, peak: Axes = SWELL_PEAK): Axes {
  return {
    wdth: Math.round(base.wdth + (peak.wdth - base.wdth) * f),
    wght: Math.round(base.wght + (peak.wght - base.wght) * f),
  };
}

/** 01 字格：起点是平时的细窄（SWELL_WDTH / SWELL_WGHT 的下端） */
export function swellAxes(f: number): Axes {
  return swellFrom({ wdth: FX.SWELL_WDTH[0], wght: FX.SWELL_WGHT[0] }, f);
}

/*
 * 鼓起的过渡由脚本按帧推进，不交给 CSS transition（2026-10-28 性能排查）：
 * font-variation-settings 的 CSS 过渡每一帧都插出一组新的字宽字重，浏览器每帧为每个在动的字新建一份字体实例、
 * 重排整张格子——首屏扫一下鼠标主线程就占满。这里用同一条缓动、同样的时长推进鼓起程度 f，
 * 走的途中只取 SWELL_LEVELS 档（同一档的字体实例浏览器缓存着，档没变就不写样式）；
 * 停下来时落在确切的目标上，静止的样子与原先 CSS 过渡走完时逐位相同。
 */

/** 鼓起程度分多少档（0–1 之间）；字宽 64→125 一档约 1.3，肉眼看不出台阶 */
export const SWELL_LEVELS = 48;

/** 程度取到最近的一档 */
export function swellLevel(f: number): number {
  return Math.round(Math.min(1, Math.max(0, f)) * SWELL_LEVELS) / SWELL_LEVELS;
}

/** CSS cubic-bezier(x1, y1, x2, y2) 的缓动函数（与浏览器同一种求法：先按 x 反解参数 t，再取 y） */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    // 牛顿法不收敛时二分
    let lo = 0;
    let hi = 1;
    t = x;
    while (hi - lo > 1e-6) {
      if (sx(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

/** 鼓起与收回用的缓动（原 CSS 过渡的 cubic-bezier(.2,.7,.1,1)） */
export const swellEase = cubicBezier(0.2, 0.7, 0.1, 1);

/** 一个字的鼓起过渡：从 from 走到 to，t0 起、走 dur 毫秒 */
export interface SwellTween {
  from: number;
  to: number;
  t0: number;
  dur: number;
}

export const swellRest = (): SwellTween => ({ from: 0, to: 0, t0: 0, dur: 0 });

/** 此刻该写的鼓起程度：走完了就是确切的目标，途中取档 */
export function swellSample(tw: SwellTween, now: number): number {
  return swellTweenDone(tw, now) ? tw.to : swellLevel(swellTweenAt(tw, now));
}

/** 此刻的鼓起程度（未取档） */
export function swellTweenAt(tw: SwellTween, now: number): number {
  if (tw.dur <= 0 || now >= tw.t0 + tw.dur) return tw.to;
  if (now <= tw.t0) return tw.from;
  return tw.from + (tw.to - tw.from) * swellEase((now - tw.t0) / tw.dur);
}

/** 过渡走完没有 */
export const swellTweenDone = (tw: SwellTween, now: number): boolean => tw.dur <= 0 || now >= tw.t0 + tw.dur;

/**
 * 换目标：与 CSS 过渡改值时一样，从此刻的程度起跳、走满一段时长——变宽用 SWELL_IN_MS、收回用 SWELL_OUT_MS。
 * 新目标与旧目标落在同一档时不重开（指针微动不把过渡反复归零），只把终点挪到确切的新目标；
 * instant（减弱动态效果）直接到位。
 */
export function swellRetarget(tw: SwellTween, target: number, now: number, instant = false): SwellTween {
  const to = Math.min(1, Math.max(0, target));
  if (to === tw.to) return tw;
  if (instant) return { from: to, to, t0: now, dur: 0 };
  if (swellLevel(to) === swellLevel(tw.to)) return { ...tw, to };
  const from = swellTweenAt(tw, now);
  return { from, to, t0: now, dur: to > from ? FX.SWELL_IN_MS : FX.SWELL_OUT_MS };
}

export interface Span {
  top: number;
  bottom: number;
}

export interface Wedge {
  /** 行侧的上下两端 */
  top: number;
  bottom: number;
  /** 框侧落点（框左边上的纵坐标） */
  tip: number;
  /** 行离框太远时不画 */
  visible: boolean;
}

/** 选中行到预览框的楔形：行侧两端 = 行的上下边，框侧落点 = 行中线夹进框的上下边以内（参考：矶崎新之谜的编号节点 + 引线）。 */
export function wedgeTarget(row: Span, plate: Span): Wedge {
  const mid = (row.top + row.bottom) / 2;
  const lo = plate.top + FX.WEDGE_INSET;
  const hi = Math.max(lo, plate.bottom - FX.WEDGE_INSET);
  const tip = Math.min(Math.max(mid, lo), hi);
  const visible = row.bottom > plate.top - FX.WEDGE_REACH && row.top < plate.bottom + FX.WEDGE_REACH;
  return { top: row.top, bottom: row.bottom, tip, visible };
}

/** 指数逼近：过了 dt 毫秒，从 cur 往 target 走；tau ≤ 0 直接到位（减少动态效果时用） */
export function approach(cur: number, target: number, dt: number, tau: number): number {
  if (tau <= 0 || !Number.isFinite(cur)) return target;
  return target + (cur - target) * Math.exp(-dt / tau);
}

/** 日志日期「2026-10-24」拆成大字「10·24」与小字年份（05 Log 最新几条：大日期、小信息） */
export function splitDate(iso: string): { md: string; year: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? { md: `${m[2]}·${m[3]}`, year: m[1] } : { md: iso, year: '' };
}
