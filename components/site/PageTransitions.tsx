'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { normalizedLabHash } from '../lab/planHash';
import { stashWithin } from '../lab/snapshot';
import {
  backdropFor,
  chooseForm,
  homeHashFor,
  inView,
  keepsHeader,
  parseLoc,
  plateVars,
  PT_CAPTURE_TIMEOUT,
  PT_COMMIT_TIMEOUT,
  PT_DURATION,
  settleForm,
  type Form,
  type Intent,
  type Loc,
  type Rect,
} from '../../src/lib/site/page-transition';
import { HOME_ZONE_KEY, PT_DONE_EVENT } from './pageTransitionState';

/**
 * 页面之间的转场（MAPPING §48）。挂在根布局里，全站只有一份。
 *
 * 用浏览器原生的 View Transitions（`document.startViewTransition`）：浏览器截下旧页、等新页就绪、
 * 再把两张画面交给 CSS 动画（app/page-transitions.css）。选形式的规则与几何是纯函数
 * （src/lib/site/page-transition.ts），这里只做 DOM 接线：
 *
 * 1. **接管站内链接**（捕获阶段，与原 BackTransition 同理：next/link 自带点击处理，冒泡阶段再拦已经晚了）；
 * 2. **接管浏览器前进 / 后退**：在 Next 之前收下 popstate、先截旧画面，再把同一个事件补发给 Next；
 * 3. **等新页就绪**：根布局里的 usePathname 在新页提交的同一次 commit 里变——那一刻新页的 DOM 已在，
 *    再等一个微任务（同一次 commit 里其余组件的 layout effect 与它们触发的同步重渲都已落地）就截新画面。
 *    **不能等 rAF**：转场的更新回调期间浏览器暂停渲染，rAF / ResizeObserver / IntersectionObserver 都不会回调
 *    （Chromium 141 实测），等它们只会等到超时。需要「新页先摆好」的页面因此把摆放放在 layout effect 里
 *    （首页深链落位、Lab 画框首量）。
 *
 * 不支持 View Transitions 的浏览器、或系统要求减少动态效果：什么都不接管，链接照常走。
 */

const BACKDROP = {
  night: 'oklch(0.19 0.032 228)',
  paper: 'oklch(0.965 0.01 115)',
  shade: 'oklch(0.12 0.025 235)',
} as const;

const VARS = ['--pt-d', '--pt-bg', '--pt-x', '--pt-y', '--pt-sx', '--pt-sy'];

/** 首页在窄屏 / 减少动态效果下回落成普通文档流——那时没有「第几页」可记（与 HomeScroll 同一条件）。 */
const HOME_FLOW = '(max-width: 1023px), (prefers-reduced-motion: reduce)';

interface Plan {
  form: Form;
  from: Loc;
  to: Loc;
  /** 截旧画面之前要命名的节点（共享元素） */
  names: Array<[HTMLElement, string]>;
  /** open：底板的版式盒（卡片的底幕），几何变量按它算 */
  plate?: HTMLElement;
  /** morph：新页上的落点 */
  landing?: () => HTMLElement | null;
  /** morph：让源画框里的台架把此刻的状态留给落地的同一台 */
  stashFrom?: HTMLElement;
  /** next / prev：出发页的案例序号 */
  fromOrder?: number;
  /** 前进 / 后退：落地页该回到的滚动位置（点链接换页时没有——那由 Next 滚到顶或锚点） */
  restoreY?: () => number;
  navigate: () => void;
}

/* ── 全站唯一一份的运行状态（根布局只挂一个 PageTransitions） ── */
let generation = 0;
let active: { gen: number; vt: ViewTransition } | null = null;
let waiter: { path: string; resolve: (ok: boolean) => void } | null = null;
/** 正在显示的那一页（popstate 触发时地址栏已经换成目的地，出发地只能靠自己记） */
let here: Loc | null = null;
/** 最近一次「案例页画框 → 实验室」：按返回时让画框原路飞回去 */
let lastMorph: { casePath: string; no: string } | null = null;
let lastPointer = 'mouse';
let replaying = false;

/*
 * 各历史条目的滚动位置。浏览器自带的滚动恢复在前进 / 后退时会**先**把目的地的位置套到
 * 还没换走的旧页上（Chromium：popstate 之后、下一帧之前），转场截下来的旧画面就成了
 * 「旧页跳到别处」的样子；那一刻也来不及取消它（在 popstate 里改 scrollRestoration 无效，实测）。
 * 所以被接管的那几次由这里自己管：截图前把旧页放回原位，新页提交后滚到它自己记下的位置。
 * 条目键 `__pt` 补在 Next 的 history.state 上（带着 __NA 原样 replace，Next 不当成路由变更）。
 */
const scrollMemo = new Map<string, number>();
let entryKey: string | null = null;
/** 被接管的前进 / 后退：新页提交后要滚到的位置。动画演不演都要兑现（跳过动画时也一样）。 */
let pendingRestore: { path: string; y: () => number } | null = null;

function tagEntry() {
  const st = window.history.state as Record<string, unknown> | null;
  if (st && typeof st.__pt === 'string') {
    entryKey = st.__pt;
    return;
  }
  if (!st?.__NA) {
    entryKey = null;
    return;
  }
  entryKey = Math.random().toString(36).slice(2, 10);
  window.history.replaceState({ ...st, __pt: entryKey }, '', window.location.href);
}

function rememberScroll() {
  if (entryKey) scrollMemo.set(entryKey, window.scrollY);
}

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

const visible = (el: Element | null | undefined, min?: number): el is HTMLElement =>
  !!el && inView(rectOf(el), window.innerWidth, window.innerHeight, min);

const locOfUrl = (url: URL): Loc | null =>
  url.origin === window.location.origin ? parseLoc(url.pathname, normalizedLabHash(url.hash)) : null;

const supported = () => typeof document.startViewTransition === 'function';
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 实验室里某台的画框（多视图的台架取第一个看得见的）。 */
function labFigure(no: string): HTMLElement | null {
  const panel = document.getElementById(`lab${no}`);
  if (!panel) return null;
  return (
    Array.from(panel.querySelectorAll<HTMLElement>('.lab-fig')).find(
      (el) => el.getBoundingClientRect().height > 0 && !el.closest('[hidden]'),
    ) ?? null
  );
}

/** 页面上展示着台架 no 的画框（主页实验预览 / 案例主图 / 正文活件），取第一个看得见的。 */
function shownFrame(no: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(`[data-pt-frame="${no}"]`)).find((el) => visible(el, 0.4)) ??
    null
  );
}

/** 链接所属的画框：链接长在画框里（案例主图），或与画框同在一个 data-pt-scope 里（正文活件、主页实验组）。 */
function linkFrame(a: Element, no: string): HTMLElement | null {
  const f =
    a.closest<HTMLElement>('[data-pt-frame]') ??
    a.closest('[data-pt-scope]')?.querySelector<HTMLElement>('[data-pt-frame]') ??
    null;
  return f && f.dataset.ptFrame === no ? f : null;
}

const caseOrder = (): number | undefined => {
  const n = Number(document.querySelector<HTMLElement>('[data-case-order]')?.dataset.caseOrder);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

function applyForm(form: Form, from: Loc, to: Loc) {
  const root = document.documentElement;
  root.dataset.pt = form;
  root.style.setProperty('--pt-d', `${PT_DURATION[form]}ms`);
  root.style.setProperty('--pt-bg', BACKDROP[backdropFor(form, to)]);
  root.toggleAttribute('data-pt-header', keepsHeader(form, from, to));
}

function setVars(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

function clearGlobal() {
  const root = document.documentElement;
  delete root.dataset.pt;
  root.removeAttribute('data-pt-header');
  VARS.forEach((v) => root.style.removeProperty(v));
  if (!root.getAttribute('style')) root.removeAttribute('style');
  window.dispatchEvent(new Event(PT_DONE_EVENT));
}

function waitForCommit(path: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      if (waiter?.resolve === done) waiter = null;
      resolve(false);
    }, ms);
    waiter = { path, resolve: done };
  });
}

/** 新页提交（根布局的 layout effect 里调）：记下现在在哪一页，并放行正在等它的转场。 */
function committed(pathname: string) {
  here = locOfUrl(new URL(window.location.href));
  tagEntry();
  // 前进 / 后退的滚动位置：等这次 commit 里其余组件的 layout effect（Lab 画框首量等）都落地再滚——
  // 一个微任务之后；它排在转场截新画面之前（那一步在 land，又隔了一个微任务）
  const restore = pendingRestore;
  if (restore && restore.path === pathname) {
    pendingRestore = null;
    queueMicrotask(() => window.scrollTo({ top: restore.y(), behavior: 'instant' }));
  }
  if (waiter && waiter.path === pathname) {
    const w = waiter;
    waiter = null;
    w.resolve(true);
  }
}

/**
 * 离开首页时把它此刻在第几页写进地址（`/#work` 等），按返回落回原处——首页翻页不改地址，
 * 不记的话「返回」一律落在第一页。Lab / Log 区另记滚动位置（HomeScroll 落位时取用一次）。
 * 用 Next 自己的 history.state 原样 replace：带着 __NA 的 state 它不会当成一次路由变更。
 */
function rememberHome() {
  const root = document.querySelector<HTMLElement>('[data-hs-root]');
  if (!root || window.matchMedia(HOME_FLOW).matches) return;
  const page = Number(root.dataset.hsPage ?? 0);
  const hash = homeHashFor(page, root.dataset.hsZone === 'log' ? 'log' : 'lab');
  if (page === 3) {
    const zone = root.querySelector<HTMLElement>('[data-zone]');
    try {
      sessionStorage.setItem(HOME_ZONE_KEY, JSON.stringify({ top: zone?.scrollTop ?? 0, at: Date.now() }));
    } catch {
      /* 无痕模式等：只是落不回原来的滚动位置 */
    }
  }
  if (window.location.hash !== hash) {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
    if (here) here = { ...here, hash };
  }
}

/** 新页就绪之后、截新画面之前：对齐落点、给落点命名、把只有新页才知道的事定下来。 */
function land(plan: Plan, name: (el: HTMLElement, n: string) => void) {
  const { from, to } = plan;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let form = plan.form;

  // 前进 / 后退的滚动位置已在 committed 里兑现；点链接落在实验室某一台时自己对齐锚点
  if (!plan.restoreY && to.kind === 'lab' && to.labNo) {
    // 落在实验室某一台：自己再对齐一次锚点。Next 提交时那次滚动发生在各台画框首量之前，
    // 首量把上方画框量高之后落点就偏了；对齐放在这里，截下来的就是读者最终看到的位置。
    document.getElementById(`lab${to.labNo}`)?.scrollIntoView({ behavior: 'instant' });
  }

  if (form === 'close') {
    const box = from.slug
      ? document.querySelector<HTMLElement>(`[data-pt-card="${from.slug}"] .hs-card__box`)
      : null;
    const ok = visible(box, 0.6);
    form = settleForm(form, from, { hasTargetCard: ok });
    if (ok) {
      setVars(plateVars(rectOf(box), vw, vh));
      name(box, 'pt-card');
    }
  } else if (form === 'morph') {
    const target = plan.landing?.() ?? null;
    const ok = visible(target, 0.4);
    form = settleForm(form, from, { hasTargetFrame: ok });
    if (ok) name(target, 'pt-frame');
  } else if (form === 'next' || form === 'prev') {
    form = settleForm(form, from, { fromOrder: plan.fromOrder, toOrder: caseOrder() });
  }

  if (form !== plan.form) applyForm(form, from, to);
  if (form === 'morph' && from.kind === 'case' && to.labNo) lastMorph = { casePath: from.path, no: to.labNo };
}

function run(plan: Plan) {
  // 上一次还没演完又点了别处：它的换页照样完成，只是不再演
  active?.vt.skipTransition();
  const gen = ++generation;
  const named: HTMLElement[] = [];
  const name = (el: HTMLElement, n: string) => {
    el.style.setProperty('view-transition-name', n);
    named.push(el);
  };
  const unname = () => named.forEach((el) => el.style.removeProperty('view-transition-name'));

  // 性能面板里看得见的三个时刻（真机排查「点下去多久才动」用）：pt:start → pt:commit → pt:ready
  performance.mark('pt:start');
  pendingRestore = plan.restoreY ? { path: plan.to.path, y: plan.restoreY } : null;
  applyForm(plan.form, plan.from, plan.to);
  for (const [el, n] of plan.names) name(el, n);
  if (plan.plate) setVars(plateVars(rectOf(plan.plate), window.innerWidth, window.innerHeight));
  if (plan.stashFrom) stashWithin(plan.stashFrom);

  let vt: ViewTransition | undefined;
  let started = false;
  const update = async () => {
    started = true;
    const commit = waitForCommit(plan.to.path, PT_COMMIT_TIMEOUT);
    plan.navigate();
    const ok = await commit;
    performance.mark('pt:commit');
    await Promise.resolve();
    if (gen !== generation) return;
    // 新页没按时到（没预取上、网速慢）：放弃动画，换页照常——不拿旧页当新页演一遍
    if (!ok) {
      vt?.skipTransition();
      return;
    }
    land(plan, name);
  };

  try {
    vt = document.startViewTransition(update);
  } catch {
    // 换页照常（pendingRestore 仍在，提交时照样回到原位）
    unname();
    clearGlobal();
    plan.navigate();
    return;
  }
  active = { gen, vt };
  // 旧页迟迟截不下来（页面正卡）：放弃动画——跳过后浏览器立刻调更新回调，换页照常、不再等那一帧
  const watchdog = setTimeout(() => {
    if (!started) vt?.skipTransition();
  }, PT_CAPTURE_TIMEOUT);
  // 截图失败（例如重名）时 ready 会 reject——转场跳过、换页照常，这里只是别让它报未处理
  vt.ready.then(() => performance.mark('pt:ready'), () => {});
  vt.finished
    .catch(() => {})
    .finally(() => {
      clearTimeout(watchdog);
      unname();
      if (active?.gen === gen) active = null;
      // 后一次已经接手：全局标记归后一次管，这里只收自己的命名
      if (gen === generation) clearGlobal();
    });
}

/**
 * open 的共享元素：卡片的底幕当底板（一块平色，铺满视口时非等比缩放看不出来），
 * 标题与正文另起两层叠在底板上、原地淡出——不跟着底板拉伸，字就不会被拉变形。
 * 悬停时底幕是盖满的深色；触屏没有悬停，底幕收着，底板的颜色由 CSS 给（夜色）。
 */
function openParts(card: HTMLElement): { plate?: HTMLElement; names: Plan['names'] } {
  const names: Plan['names'] = [];
  const veil = card.querySelector<HTMLElement>('.hs-card__veil');
  const head = card.querySelector<HTMLElement>('.hs-card__head');
  const thesis = card.querySelector<HTMLElement>('.hs-card__thesis');
  if (veil) names.push([veil, 'pt-plate']);
  if (head) names.push([head, 'pt-head']);
  if (thesis) names.push([thesis, 'pt-thesis']);
  return { plate: card.querySelector<HTMLElement>('.hs-card__box') ?? undefined, names };
}

/** 点了一个站内链接：出发前就能定的事（形式、共享元素）在这里定。 */
function planLink(a: HTMLAnchorElement, from: Loc, to: Loc, navigate: () => void): Plan | null {
  const intent = a.dataset.pt as Intent | undefined;
  const names: Plan['names'] = [];
  let plate: HTMLElement | undefined;
  let stashFrom: HTMLElement | undefined;
  let landing: Plan['landing'];

  const card = intent === 'card' && to.kind === 'case' && a.dataset.ptCard === to.slug ? a : null;
  const hasCard = visible(card?.querySelector('.hs-card__box'), 0.5);

  const frame = intent === 'frame' && to.kind === 'lab' && to.labNo ? linkFrame(a, to.labNo) : null;
  const hasFrame = visible(frame, 0.4);

  const form = chooseForm(from, to, { intent, hasCard, hasFrame });
  if (!form) return null;

  if (form === 'open' && card) {
    const parts = openParts(card);
    plate = parts.plate;
    names.push(...parts.names);
  }
  if (form === 'morph' && frame && to.labNo) {
    names.push([frame, 'pt-frame']);
    stashFrom = frame;
    const no = to.labNo;
    landing = () => labFigure(no);
  }
  return { form, from, to, names, plate, landing, stashFrom, fromOrder: caseOrder(), navigate };
}

/** 浏览器前进 / 后退：没有被点的元素，共享元素只能按页面上现成的找。 */
function planPop(from: Loc, to: Loc, navigate: () => void): Plan | null {
  // 案例页画框 → 实验室之后按返回：画框原路飞回去（落点仍在视野里才飞）
  if (from.kind === 'lab' && to.kind === 'case' && lastMorph && lastMorph.casePath === to.path) {
    const fig = labFigure(lastMorph.no);
    if (visible(fig, 0.4)) {
      const no = lastMorph.no;
      return {
        form: 'morph',
        from,
        to,
        names: [[fig, 'pt-frame']],
        stashFrom: fig,
        landing: () => shownFrame(no),
        navigate,
      };
    }
  }

  const card =
    from.kind === 'home' && to.kind === 'case' && to.slug
      ? document.querySelector<HTMLElement>(`[data-pt-card="${to.slug}"]`)
      : null;
  const hasCard = visible(card?.querySelector('.hs-card__box'), 0.5);
  const frame = to.kind === 'lab' && to.labNo ? shownFrame(to.labNo) : null;
  const hasFrame = !!frame;

  const form = chooseForm(from, to, { hasCard, hasFrame });
  if (!form) return null;
  if (form === 'open' && card) return { form, from, to, ...openParts(card), navigate };
  if (form === 'morph' && frame && to.labNo) {
    const no = to.labNo;
    return { form, from, to, names: [[frame, 'pt-frame']], stashFrom: frame, landing: () => labFigure(no), navigate };
  }
  return { form, from, to, names: [], fromOrder: caseOrder(), navigate };
}

export function PageTransitions() {
  const router = useRouter();
  const pathname = usePathname();
  const routerRef = useRef(router);
  routerRef.current = router;

  // 新页提交：与新页内容同一次 commit，此刻 DOM 已在
  useLayoutEffect(() => {
    committed(pathname);
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      lastPointer = e.pointerType;
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== '_self') || a.hasAttribute('download') || a.dataset.pt === 'none') return;
      if (!supported() || reduced()) return;
      // 主页实验目录：触屏第一下是「预览这一台」（ZonePage 自己处理），第二下才进实验室
      if (lastPointer === 'touch' && a.matches('.hs-bench:not(.hs-is-on)')) return;
      const url = new URL(a.href);
      const to = locOfUrl(url);
      const from = here;
      if (!to || !from) return;
      const target = `${url.pathname}${url.search}${url.hash}`;
      const plan = planLink(a, from, to, () => routerRef.current.push(target));
      if (!plan) return;
      // 捕获阶段接管：next/link 自己带点击处理，冒泡阶段再 preventDefault 已经晚了
      e.preventDefault();
      e.stopPropagation();
      rememberScroll();
      if (from.kind === 'home') rememberHome();
      run(plan);
    };

    const onPopState = (e: PopStateEvent) => {
      if (replaying) return;
      const from = here;
      const to = locOfUrl(new URL(window.location.href));
      if (!from || !to || from.path === to.path) return;
      if (!supported() || reduced()) return;
      // 系统手势已经演过一遍返回动画（iOS 侧滑）：不再叠一层
      if ((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) return;
      // 不是 Next 自己记的历史条目：它会整页刷新，不演
      const state = e.state as { __NA?: boolean } | null;
      if (!state?.__NA) return;
      const plan = planPop(from, to, () => {
        replaying = true;
        try {
          window.dispatchEvent(new PopStateEvent('popstate', { state: e.state }));
        } finally {
          replaying = false;
        }
      });
      if (!plan) return;
      // 先截旧画面再让 Next 换页：把这一次 popstate 收下，进了转场再原样补发给 Next
      e.stopImmediatePropagation();
      // 浏览器会在下一帧之前把目的地的滚动位置套到旧页上：在截图之前（rAF 在截图之前跑）放回去，
      // 顺手记下它套的值——目的地没在本页会话里记过位置时用它兜底
      const yOld = window.scrollY;
      if (entryKey) scrollMemo.set(entryKey, yOld);
      // 换页提交之前不再记：浏览器套位置时触发的那次 scroll 不能记到离开的这一页头上
      entryKey = null;
      const destKey = typeof (state as { __pt?: unknown }).__pt === 'string' ? (state as { __pt: string }).__pt : null;
      let restored = 0;
      requestAnimationFrame(() => {
        // 动画被跳过时新页可能已经提交了——那就不是旧页了，别把新页拽回旧页的位置
        if (here?.path !== from.path) return;
        restored = window.scrollY;
        if (restored !== yOld) window.scrollTo({ top: yOld, behavior: 'instant' });
      });
      plan.restoreY = () => (destKey && scrollMemo.has(destKey) ? scrollMemo.get(destKey)! : restored);
      run(plan);
    };

    const onHashChange = () => {
      here = locOfUrl(new URL(window.location.href));
      tagEntry();
    };

    // 滚动位置按条目记（rAF 节流）
    let scrollRaf = 0;
    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        rememberScroll();
      });
    };

    // 普通 <a>（正文里的日志引用等）没有 next/link 的悬停预取；指针移上去时补一次，点下去就不用等网络
    const prefetched = new Set<string>();
    const onPointerOver = (e: PointerEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!(a instanceof HTMLAnchorElement)) return;
      const url = new URL(a.href);
      const to = locOfUrl(url);
      if (!to || to.path === here?.path || prefetched.has(to.path)) return;
      prefetched.add(to.path);
      routerRef.current.prefetch(to.path);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerover', onPointerOver, { capture: true, passive: true });
    window.addEventListener('popstate', onPopState, true);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(scrollRaf);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerover', onPointerOver, true);
      window.removeEventListener('popstate', onPopState, true);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  return null;
}
