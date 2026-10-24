/**
 * 02 Work 横向切换的纯逻辑（稿「18 Home · Work Carousel」，MAPPING §59）。
 * 不碰 DOM：组件 `WorkPage` 与守门测试共用这一份。手感常量取稿内 Tweak 的默认值。
 */

export const WC = {
  /** 当前屏占舞台宽度的比例 = 1 − PEEK，剩下那截露出下一屏的第一张卡 */
  PEEK: 0.15,
  /** 卡与卡、屏与屏之间的空隙（px） */
  GAP: 28,
  /** 悬停留白区时整排往反方向探出去的距离（px）；要绕回第一组时只探 35% */
  LEAN: 44,
  /** 闲置时整排探一下的距离（px） */
  NUDGE_X: 26,
  /** 靠近当前屏边缘时整排最多探出去多少（px） */
  PROX_X: 16,
  /** 「靠近边缘」的感应宽度：当前屏宽的 18%，最多 180px */
  PROX_FRAC: 0.18,
  PROX_MAX: 180,
  /** 非当前屏卡片的不透明度 */
  REST_OP: 0.42,
  /** 一张卡比前一张晚出发多少（ms），最多错开 6 张 */
  STAGGER_MS: 55,
  STAGGER_MAX: 6,
  /** 卡片滑过去的时长（ms） */
  MOVE_MS: 1000,
  /** 「正在切换」持续多久：这段时间里不出续接暗示与光标标签 */
  MOVING_MS: 1450,
  /** 新屏卡顶色条在滑动开始后多久长出来（ms） */
  BAR_DELAY_MS: 460,
  /** 闲置探一下：进页后多久第一次、之后的间隔、动作保持多久、最多几次 */
  NUDGE_FIRST_MS: 2100,
  NUDGE_AFTER_GO_MS: 8000,
  NUDGE_AFTER_MS: 6500,
  NUDGE_RETRY_MS: 4000,
  NUDGE_HOLD_MS: 760,
  NUDGE_MAX: 4,
} as const;

export type Side = 'l' | 'r';

export interface NavStep {
  /** 目标屏 */
  t: number;
  /** 是否越过首尾绕回 */
  wrap: boolean;
  d: number;
}

/** 从第 cur 屏往 d 方向走一步落在哪；只有一屏时没有可走的。loop 时首尾相接。 */
export function carouselNav(cur: number, d: number, count: number, loop = true): NavStep | null {
  if (count < 2) return null;
  let t = cur + d;
  let wrap = false;
  if (t < 0 || t >= count) {
    if (!loop) return null;
    t = ((t % count) + count) % count;
    wrap = true;
  }
  return { t, wrap, d };
}

/**
 * 切换时第 p 屏第 c 张卡排第几个出发：按滑动方向从前往后数，
 * 往右切（cur > from）从左往右，往左切从右往左；夹在 0–STAGGER_MAX 之间。
 */
export function cascadeOrder(p: number, c: number, from: number, cur: number, per: number): number {
  const ord = cur > from ? (p - from) * per + c : (from - p) * per + (per - 1 - c);
  return Math.max(0, Math.min(WC.STAGGER_MAX, ord));
}

/** 指针在舞台里的横坐标 x（px）离当前屏两侧边缘多近：0–1，按 0.1 取整，0 就是不在感应带里。 */
export function proximity(x: number, wp: number): { side: Side | null; t: number } {
  const px = Math.min(WC.PROX_MAX, wp * WC.PROX_FRAC);
  let side: Side | null = null;
  let t = 0;
  if (x > wp - px) {
    side = 'r';
    t = (x - (wp - px)) / px;
  } else if (x < px) {
    side = 'l';
    t = (px - x) / px;
  }
  t = Math.round(Math.max(0, Math.min(1, t)) * 10) / 10;
  return t ? { side, t } : { side: null, t: 0 };
}

/**
 * 暗示的来源与强度（优先级：悬停留白区 > 闲置探一下 > 靠近边缘）。
 * 返回整排的横向偏移（往暗示的反方向探，让出那一侧）与被暗示那张卡的不透明度。
 */
export function hintOf(
  src: 'zone' | 'nudge' | 'prox',
  side: Side,
  wrap: boolean,
  proxT = 0,
): { x: number; op: number } {
  const sg = side === 'r' ? -1 : 1;
  if (src === 'zone') return { x: sg * (wrap ? Math.round(WC.LEAN * 0.35) : WC.LEAN), op: 0.9 };
  if (src === 'nudge') return { x: wrap ? 0 : sg * WC.NUDGE_X, op: 0.72 };
  if (wrap) return { x: 0, op: 0 };
  return { x: sg * Math.round(WC.PROX_X * proxT), op: 0.42 + 0.4 * proxT };
}

/** 闲置该往哪边探：有不绕回的下一屏就往右，否则有不绕回的上一屏就往左。 */
export function nudgeSide(cur: number, count: number, loop = true): Side | null {
  const r = carouselNav(cur, 1, count, loop);
  const l = carouselNav(cur, -1, count, loop);
  return r && !r.wrap ? 'r' : l && !l.wrap ? 'l' : null;
}

/** 分屏的组右上角那行「4–6 of 12」 */
export function rangeLabel(pi: number, shown: number, total: number, per: number): string {
  return `${pi * per + 1}–${pi * per + shown} of ${total}`;
}
