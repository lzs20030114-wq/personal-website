import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import {
  SITE_LOADER,
  SITE_LOADER_ATTR,
  SITE_LOADER_ID,
  SITE_LOADER_STEPS,
  SITE_LOADER_THEME_ATTR,
  exitPlan,
  loaderSkips,
  loaderTheme,
  siteLoaderScript,
} from './site-loader';

/**
 * 在一个假的浏览器里跑载入页的内联控制器：时钟、定时器、rAF、字体都由测试推进。
 * 返回推进时钟的手柄与看得见的状态（<html> 属性、读数、进度、回调）。
 */
function harness(opts: { path?: string; lang?: string; noFonts?: boolean; loading?: boolean } = {}) {
  let now = 1_000_000;
  const timers: { at: number; fn: () => void }[] = [];
  const attrs: Record<string, string> = {};
  const style: Record<string, string> = {};
  const elAttrs: Record<string, string> = {};
  const bar = { style: { transform: '' } };
  const step = { textContent: '' };
  const el = {
    style: { display: '' },
    setAttribute: (k: string, v: string) => (elAttrs[k] = v),
    querySelector: (s: string) => (s === '[data-sl-bar]' ? bar : s === '[data-sl-step]' ? step : null),
  };
  let resolveFonts: () => void = () => {};
  const fontsReady = new Promise<void>((r) => (resolveFonts = r));
  const listeners: Record<string, (() => void)[]> = {};
  const doc = {
    readyState: opts.loading === false ? 'interactive' : 'loading',
    documentElement: {
      setAttribute: (k: string, v: string) => (attrs[k] = v),
      removeAttribute: (k: string) => delete attrs[k],
      getAttribute: (k: string) => (k === 'style' ? (Object.keys(style).length ? 'x' : null) : (attrs[k] ?? null)),
      style: {
        setProperty: (k: string, v: string) => (style[k] = v),
        removeProperty: (k: string) => delete style[k],
      },
    },
    getElementById: (id: string) => (id === SITE_LOADER_ID ? el : null),
    addEventListener: (ev: string, fn: () => void) => (listeners[ev] ??= []).push(fn),
    fonts: opts.noFonts ? undefined : { load: () => fontsReady },
  };
  const win = {
    requestAnimationFrame: (fn: () => void) => timers.push({ at: now, fn }),
    addEventListener: () => {},
  } as Record<string, unknown>;
  const sandbox = {
    document: doc,
    window: win,
    location: { pathname: opts.path ?? '/' },
    localStorage: { getItem: (k: string) => (k === 'site-lang' ? (opts.lang ?? null) : null) },
    Date: { now: () => now },
    setTimeout: (fn: () => void, ms: number) => timers.push({ at: now + (ms || 0), fn }),
  };
  vm.runInNewContext(siteLoaderScript(), sandbox);
  const sl = win.__sl as { done: boolean; need: (k: string) => void; ready: (k: string) => void; then: (cb: () => void) => void };

  /** 时钟推进到 t（相对脚本开始），按时刻依次触发定时器；字体 promise 的回调靠 flush 落地 */
  const advance = async (t: number) => {
    const target = 1_000_000 + t;
    for (;;) {
      await Promise.resolve();
      await Promise.resolve();
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift();
      now = Math.max(now, next.at);
      next.fn();
    }
    now = target;
    await Promise.resolve();
    await Promise.resolve();
  };
  const dcl = () => (listeners.DOMContentLoaded ?? []).forEach((f) => f());
  return { sl, attrs, style, el, elAttrs, bar, step, advance, dcl, resolveFonts };
}

describe('首次载入页的退场时机（MAPPING §87）', () => {
  it('读数还没看清就就绪：立即快速淡出；看清了：补足最短停留', () => {
    const { APPEAR_MS, SHOWN_GRACE_MS, MIN_SHOWN_MS } = SITE_LOADER;
    expect(exitPlan(100)).toEqual({ wait: 0, fade: SITE_LOADER.QUICK_FADE_MS });
    expect(exitPlan(APPEAR_MS + SHOWN_GRACE_MS - 1)).toEqual({ wait: 0, fade: SITE_LOADER.QUICK_FADE_MS });
    const t = APPEAR_MS + SHOWN_GRACE_MS + 10;
    expect(exitPlan(t)).toEqual({ wait: APPEAR_MS + MIN_SHOWN_MS - t, fade: SITE_LOADER.FADE_MS });
    expect(exitPlan(5000)).toEqual({ wait: 0, fade: SITE_LOADER.FADE_MS });
  });

  it('底色跟着将要出现的页面：首页与隐私页是纸，其余是夜色；编辑后台不出载入页', () => {
    expect(loaderTheme('/')).toBe('paper');
    expect(loaderTheme('/privacy')).toBe('paper');
    expect(loaderTheme('/work/reincarnation-machine')).toBe('night');
    expect(loaderTheme('/lab')).toBe('night');
    expect(loaderSkips('/studio')).toBe(true);
    expect(loaderSkips('/lab')).toBe(false);
  });
});

describe('首次载入页的内联控制器', () => {
  it('一开始就盖上，底色按路径；读数从「载入页面」开始', () => {
    const h = harness({ path: '/lab' });
    expect(h.attrs[SITE_LOADER_ATTR]).toBe('on');
    expect(h.attrs[SITE_LOADER_THEME_ATTR]).toBe('night');
    expect(h.step.textContent).toBe(SITE_LOADER_STEPS.en.page);
    expect(harness({ path: '/' }).attrs[SITE_LOADER_THEME_ATTR]).toBe('paper');
  });

  it('编辑后台：不盖、直接算退场完成', () => {
    const h = harness({ path: '/studio' });
    expect(h.attrs[SITE_LOADER_ATTR]).toBeUndefined();
    expect(h.sl.done).toBe(true);
    expect(h.el.style.display).toBe('none');
  });

  it('内页（没登记要等的事）：页面解析完就退，不为字体盖住能读的正文；读数没露面时快速淡出，淡完把自己藏起来', async () => {
    const h = harness({ path: '/work/x' });
    let entered = 0;
    h.sl.then(() => entered++);
    expect(h.step.textContent).toBe(SITE_LOADER_STEPS.en.page);
    await h.advance(50);
    expect(h.sl.done).toBe(false);
    h.dcl(); // 字体始终没到
    await h.advance(120);
    expect(h.sl.done).toBe(true);
    expect(h.bar.style.transform).toBe('scaleX(1)'); // 内页只有「页面」一步
    expect(h.attrs[SITE_LOADER_ATTR]).toBe('out');
    expect(entered).toBe(1);
    expect(h.style['--sl-fade']).toBe(`${SITE_LOADER.QUICK_FADE_MS}ms`);
    await h.advance(120 + SITE_LOADER.QUICK_FADE_MS + 50);
    expect(h.attrs[SITE_LOADER_ATTR]).toBeUndefined();
    expect(h.el.style.display).toBe('none');
    expect(h.style['--sl-fade']).toBeUndefined();
  });

  it('首页：登记的事没做完就一直等，字体先到也不退；做完再退，进度走满', async () => {
    const h = harness({ path: '/' });
    h.sl.need('home');
    h.dcl();
    h.resolveFonts();
    await h.advance(2000);
    expect(h.sl.done).toBe(false);
    expect(h.step.textContent).toBe(SITE_LOADER_STEPS.en.script);
    expect(h.bar.style.transform).toBe(`scaleX(${2 / 3})`);
    h.sl.ready('home');
    expect(h.sl.done).toBe(true);
    expect(h.bar.style.transform).toBe('scaleX(1)');
    expect(h.step.textContent).toBe(SITE_LOADER_STEPS.en.done);
    // 早已过了最短停留：立刻开始淡出
    await h.advance(2001);
    expect(h.attrs[SITE_LOADER_ATTR]).toBe('out');
    expect(h.style['--sl-fade']).toBe(`${SITE_LOADER.FADE_MS}ms`);
  });

  it('读数看清了才就绪：补足最短停留再淡出，不一闪而过', async () => {
    const { APPEAR_MS, SHOWN_GRACE_MS, MIN_SHOWN_MS } = SITE_LOADER;
    const at = APPEAR_MS + SHOWN_GRACE_MS + 30;
    const h = harness({ path: '/' });
    h.sl.need('home');
    h.dcl();
    h.resolveFonts();
    await h.advance(at);
    h.sl.ready('home');
    await h.advance(at + 1);
    expect(h.attrs[SITE_LOADER_ATTR]).toBe('on');
    await h.advance(APPEAR_MS + MIN_SHOWN_MS + 1);
    expect(h.attrs[SITE_LOADER_ATTR]).toBe('out');
    expect(h.style['--sl-fade']).toBe(`${SITE_LOADER.FADE_MS}ms`);
  });

  it('读数刚开始淡入就就绪：不为「别闪」多等，直接快速淡出', async () => {
    const at = SITE_LOADER.APPEAR_MS + SITE_LOADER.SHOWN_GRACE_MS - 20;
    const h = harness({ path: '/' });
    h.sl.need('home');
    h.dcl();
    h.resolveFonts();
    await h.advance(at);
    h.sl.ready('home');
    await h.advance(at + 1);
    expect(h.attrs[SITE_LOADER_ATTR]).toBe('out');
    expect(h.style['--sl-fade']).toBe(`${SITE_LOADER.QUICK_FADE_MS}ms`);
  });

  it('DOMContentLoaded 之后才登记的事不算（只认页面里内联登记的）', async () => {
    const h = harness({ path: '/' });
    h.dcl();
    h.sl.need('late');
    h.resolveFonts();
    await h.advance(100);
    expect(h.sl.done).toBe(true);
  });

  it('首页：脚本接管了、字体迟迟不到：最多等到上限就退，字体随后再换上', async () => {
    const h = harness({ path: '/' });
    h.sl.need('home');
    h.dcl();
    h.sl.ready('home');
    await h.advance(SITE_LOADER.FONT_CAP_MS - 50);
    expect(h.sl.done).toBe(false);
    await h.advance(SITE_LOADER.FONT_CAP_MS + 50);
    expect(h.sl.done).toBe(true);
  });

  it('什么都没回来（脚本挂了）：到总上限照样退', async () => {
    const h = harness({ path: '/' });
    h.sl.need('home');
    h.dcl();
    h.resolveFonts();
    await h.advance(SITE_LOADER.HARD_CAP_MS - 10);
    expect(h.sl.done).toBe(false);
    await h.advance(SITE_LOADER.HARD_CAP_MS + 10);
    expect(h.sl.done).toBe(true);
  });

  it('没有 document.fonts 的浏览器：首页也不等字体', async () => {
    const h = harness({ path: '/', noFonts: true });
    h.sl.need('home');
    h.dcl();
    h.sl.ready('home');
    await h.advance(10);
    expect(h.sl.done).toBe(true);
  });

  it('退场之后再来的 then 立即执行', async () => {
    const h = harness({ path: '/work/x', loading: false });
    h.resolveFonts();
    await h.advance(10);
    let ran = false;
    h.sl.then(() => (ran = true));
    expect(ran).toBe(true);
  });

  it('偏好中文：读数用中文', () => {
    const h = harness({ path: '/lab', lang: 'zh' });
    expect(h.step.textContent).toBe(SITE_LOADER_STEPS.zh.page);
    expect(h.elAttrs.lang).toBe('zh');
  });

  it('控制器本身只用 ES5：它在打包脚本之前、也在旧浏览器上跑', () => {
    expect(siteLoaderScript()).not.toMatch(/=>|\blet\b|\bconst\b|`|\?\.|\?\?/);
  });
});
