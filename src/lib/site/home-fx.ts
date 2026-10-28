/**
 * 首页五屏的排版与动效细节（2026-10-27，4aC 视觉研究的落地，MAPPING §70）。
 * 不碰 DOM：FieldPage / ZonePage 与守门测试共用这一份。按 SITE_SPEC §1 克制条款，
 * 时长与手感常量集中登记在这里。
 */

export const FX = {
  /** 01 方块场：光标附近的方块转角、拉斜、略放大；按距离高斯衰减的半径（px） */
  TILT_R: 190,
  /** 正对指针时的最大转角 / 拉斜（度）与放大量 */
  TILT_ROT: 30,
  TILT_SKEW: 16,
  TILT_SCALE: 0.28,
  /** 系数低于这个值就当作不倾斜（远处的方块不写样式） */
  TILT_MIN: 0.06,
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
  const f = Math.exp(-(dx * dx + dy * dy) / (r * r));
  if (f < FX.TILT_MIN) return null;
  const side = dx < 0 ? -1 : 1;
  return { rot: side * f * FX.TILT_ROT, skew: -f * FX.TILT_SKEW, scale: 1 + f * FX.TILT_SCALE };
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

/** 从某个起点（平时的字宽字重）鼓向最宽最粗：f = 0 是起点、1 是 SWELL_WDTH / SWELL_WGHT 的上端（整数，同一个字的值不变就不必重写样式） */
export function swellFrom(base: Axes, f: number): Axes {
  return {
    wdth: Math.round(base.wdth + (FX.SWELL_WDTH[1] - base.wdth) * f),
    wght: Math.round(base.wght + (FX.SWELL_WGHT[1] - base.wght) * f),
  };
}

/** 01 字格：起点是平时的细窄（SWELL_WDTH / SWELL_WGHT 的下端） */
export function swellAxes(f: number): Axes {
  return swellFrom({ wdth: FX.SWELL_WDTH[0], wght: FX.SWELL_WGHT[0] }, f);
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
