/**
 * 页面之间的转场：选哪种形式、几何怎么算（纯函数，零 DOM——DOM 接线在
 * components/site/PageTransitions.tsx，动画曲线在 app/page-transitions.css）。MAPPING §48。
 *
 * 形式按「两页是什么关系」选（Material 动效的四类关系），每种动作都借自站内已有的页内动效，
 * 不另起一套语汇：
 *
 * | 形式 | 关系 | 站内出处 |
 * |---|---|---|
 * | open / close | 卡片 ↔ 它的详情页（容器变换） | Lab「放大」与 §9.2「底板从预览框铺开」 |
 * | rise / sink | 首页 ↔ 章节页（层级，纵向） | 首页自己的翻页：整张纸从下方升起、旧页退后变暗 |
 * | next / prev | 案例 → 下一案例（序列，横向） | 首页轮播「下一个项目」从右侧进来 |
 * | morph | 同一台台架换到另一页的位置 | 共享元素：画框飞到实验室里它自己那一格 |
 * | swap | 深色内页之间的平级跳转 | 顶栏不动、正文淡换（fade through） |
 */

export type RouteKind = 'home' | 'case' | 'lab' | 'log' | 'about';

export interface Loc {
  path: string;
  hash: string;
  kind: RouteKind;
  /** /work/<slug> */
  slug?: string;
  /** /lab#lab<no>[-<plan>] 里的台架编号 */
  labNo?: string;
}

export type Form = 'open' | 'close' | 'rise' | 'sink' | 'next' | 'prev' | 'morph' | 'swap';

/** 链接上声明的意图（`data-pt`）；没声明就按两页的关系推。 */
export type Intent = 'card' | 'frame' | 'next' | 'prev';

/**
 * 各形式的总时长（ms）。CSS 里一律用 `var(--pt-d)`，这里是唯一的数——调手感只改这一处。
 * 结构性动作（换一张纸、开合一个容器）与站内既有动作同一量级：首页翻页 1100、Lab 放大 760、
 * 卡片悬停底幕 750；平级淡换是高频动作，压到一半。
 */
export const PT_DURATION: Record<Form, number> = {
  open: 920,
  close: 900,
  rise: 900,
  sink: 820,
  next: 900,
  prev: 900,
  morph: 820,
  swap: 480,
};

/** 新页迟迟没提交（没预取到、网速慢）时放弃动画、照常换页的上限（ms）。 */
export const PT_COMMIT_TIMEOUT = 2500;

/**
 * 旧页迟迟截不下来时放弃动画的上限（ms）。浏览器要等下一帧才截旧画面、截完才开始换页；
 * 旧页正卡（一帧几百毫秒的重台架）时，读者点了却什么都不发生——宁可不演，也不能让换页等动画。
 */
export const PT_CAPTURE_TIMEOUT = 800;

const LAB_HASH = /^#lab([12]-\d+)(?:-[a-z][a-z0-9]*)?$/;

/**
 * 把站内地址读成路由类别。`hash` 应是已规整过的（旧台架编号由调用方先换成新号）。
 * 不是本站的页面路由（外链、/studio、/demo、/api、静态文件）一律返回 null——那些不做转场。
 */
export function parseLoc(pathname: string, hash = ''): Loc | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/') return { path, hash, kind: 'home' };
  if (path === '/lab') {
    const no = LAB_HASH.exec(hash)?.[1];
    return no ? { path, hash, kind: 'lab', labNo: no } : { path, hash, kind: 'lab' };
  }
  if (path === '/archive') return { path, hash, kind: 'log' };
  if (path === '/about') return { path, hash, kind: 'about' };
  const m = /^\/work\/([a-z0-9-]+)$/.exec(path);
  if (m) return { path, hash, kind: 'case', slug: m[1] };
  return null;
}

export interface FormContext {
  /** 链接声明的意图 */
  intent?: Intent;
  /** 出发页上能找到这个案例的卡片且在视野里（open 的前提） */
  hasCard?: boolean;
  /** 出发页上能找到这台台架的画框且在视野里（morph 的前提） */
  hasFrame?: boolean;
}

/**
 * 选形式。返回 null = 不做转场（同一页内的锚点跳转，或不认识的路由）。
 * 这里只按「出发时就知道的事」选；有两种要等新页到了才能定（目标卡片不在 → close 退成 sink；
 * 案例先后顺序 → next / prev），见 settleForm。
 */
export function chooseForm(from: Loc, to: Loc, ctx: FormContext = {}): Form | null {
  if (from.path === to.path) return null;
  const { intent, hasCard, hasFrame } = ctx;

  if (to.kind === 'case' && from.kind === 'home' && (intent === 'card' || intent === undefined) && hasCard) return 'open';
  if (to.kind === 'lab' && to.labNo && hasFrame && (intent === 'frame' || intent === undefined)) return 'morph';

  if (to.kind === 'home') return from.kind === 'case' && to.hash === '#work' ? 'close' : 'sink';
  if (from.kind === 'home') return 'rise';

  if (from.kind === 'case' && to.kind === 'case') return intent === 'prev' ? 'prev' : 'next';
  return 'swap';
}

export interface SettleContext {
  /** close：首页上找到了这个案例的卡片且在视野里 */
  hasTargetCard?: boolean;
  /** morph：新页上找到了目标画框且在视野里 */
  hasTargetFrame?: boolean;
  /** next / prev：两页的案例序号（读不到就保持原判断） */
  fromOrder?: number;
  toOrder?: number;
}

/** 新页提交之后定稿：目标不在就退成同关系的「没有容器」那一种。 */
export function settleForm(form: Form, from: Loc, ctx: SettleContext): Form {
  if (form === 'close' && !ctx.hasTargetCard) return 'sink';
  if (form === 'morph' && !ctx.hasTargetFrame) return from.kind === 'home' ? 'rise' : 'swap';
  if ((form === 'next' || form === 'prev') && ctx.fromOrder != null && ctx.toOrder != null && ctx.fromOrder !== ctx.toOrder) {
    return ctx.toOrder > ctx.fromOrder ? 'next' : 'prev';
  }
  return form;
}

/**
 * 两页用的是哪一条顶栏：案例页与 Lab 是「09 / 10」稿的同一条深色顶栏（DarkHeader），
 * 日志页与 about 还是旧的 SiteNav 那条，首页没有顶栏（自带 HUD）。
 */
function headerOf(kind: RouteKind): 'dark' | 'legacy' | null {
  if (kind === 'case' || kind === 'lab') return 'dark';
  if (kind === 'log' || kind === 'about') return 'legacy';
  return null;
}

/**
 * 顶栏原地不动：只在两页**确实是同一条顶栏**、且这一次是平级换页（淡换 / 横翻 / 原位）时。
 * 两条不一样的顶栏钉在一起，交叉淡化那一下会叠出两排字——不如随页面一起淡。
 * 升起 / 落下 / 开合里顶栏本来就该随那张纸走。
 */
export function keepsHeader(form: Form, from: Loc, to: Loc): boolean {
  const h = headerOf(from.kind);
  if (!h || h !== headerOf(to.kind)) return false;
  return form === 'swap' || form === 'next' || form === 'prev' || form === 'morph';
}

/** 转场期间垫在最底下的颜色：深色页之间是夜色，去浅色页是纸色，带「退后变暗」的是暗影。 */
export function backdropFor(form: Form, to: Loc): 'night' | 'paper' | 'shade' {
  if (form === 'swap' || form === 'morph') return to.kind === 'home' || to.kind === 'about' ? 'paper' : 'night';
  return 'shade';
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 容器（open 的底板 / close 的卡片）从版式盒铺满视口要的变换：先平移到盒的左上角，
 * 再按 transform-origin 0 0 分别缩放宽高。底板是一块平色，非等比缩放看不出来——
 * 这样整段只动 transform，交给合成器跑，新页挂载时主线程再忙也不掉帧。
 */
export function plateVars(r: Rect, vw: number, vh: number): Record<string, string> {
  const w = Math.max(r.width, 1);
  const h = Math.max(r.height, 1);
  const round = (n: number) => String(Math.round(n * 1000) / 1000);
  return {
    '--pt-x': `${round(r.left)}px`,
    '--pt-y': `${round(r.top)}px`,
    '--pt-sx': round(vw / w),
    '--pt-sy': round(vh / h),
  };
}

/** 盒是否落在视口里（至少露出 min 比例的面积）——画框 / 卡片不在视野里就不当共享元素。 */
export function inView(r: Rect, vw: number, vh: number, min = 0.35): boolean {
  if (r.width <= 0 || r.height <= 0) return false;
  const x = Math.max(0, Math.min(r.left + r.width, vw) - Math.max(r.left, 0));
  const y = Math.max(0, Math.min(r.top + r.height, vh) - Math.max(r.top, 0));
  return (x * y) / (r.width * r.height) >= min;
}

/**
 * 离开首页时把它此刻在哪一页写进地址（`/#work` 等），返回来落回原处——
 * 首页翻页不改地址，不记的话「返回」一律落在第一页。page = HomeScroll 的页号（3 = Lab/Log 区）。
 */
export function homeHashFor(page: number, zone: 'lab' | 'log' | undefined): string {
  if (page === 1) return '#work';
  if (page === 2) return '#about';
  if (page === 3) return zone === 'log' ? '#log' : '#lab';
  return '';
}
