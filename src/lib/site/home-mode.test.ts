import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { HOME_BOOT_GRACE_MS, HOME_BOOT_SCRIPT, HOME_FLOW_QUERY, HOME_HOLD_ATTR, HOME_LIVE_ATTR, HOME_LOADER_KEY, HOME_MODE_ATTR } from './home-mode';

/** 在一个假的浏览器全局里跑首页内联启动脚本，返回 <html data-hs> 的值和 load 之后的那次检查 */
function boot(opts: { narrow?: boolean; oldSyntax?: boolean; noMatchMedia?: boolean; ready?: boolean; live?: boolean; loader?: boolean }) {
  const attrs: Record<string, string> = {};
  let onLoad: (() => void) | null = null;
  let timer: { fn: () => void; ms: number } | null = null;
  const root = {
    className: opts.ready ? 'hs-root hs-ready' : 'hs-root',
    hasAttribute: (k: string) => k === HOME_LIVE_ATTR && !!opts.live,
  };
  // 载入页控制器（src/lib/site/site-loader.ts）的替身：记下登记与报告
  const loader = { needs: [] as string[], readies: [] as string[] };
  const sandbox: Record<string, unknown> = {
    document: {
      documentElement: {
        setAttribute: (k: string, v: string) => (attrs[k] = v),
        removeAttribute: (k: string) => delete attrs[k],
      },
      querySelector: (s: string) => (s === '.hs-root' ? root : null),
    },
    setTimeout: (fn: () => void, ms: number) => (timer = { fn, ms }),
  };
  sandbox.window = {
    matchMedia: opts.noMatchMedia ? undefined : (q: string) => ({ matches: q === HOME_FLOW_QUERY && !!opts.narrow }),
    addEventListener: (ev: string, fn: () => void) => ev === 'load' && (onLoad = fn),
    __sl: opts.loader === false ? undefined : { need: (k: string) => loader.needs.push(k), ready: (k: string) => loader.readies.push(k) },
  };
  if (opts.oldSyntax) {
    // 旧 Safari：读不懂类静态块，new Function 直接抛语法错
    sandbox.Function = function (src: string) {
      if (src.includes('static{')) throw new SyntaxError('Unexpected token "{"');
      return () => {};
    };
  }
  vm.runInNewContext(HOME_BOOT_SCRIPT, sandbox);
  const first = attrs[HOME_MODE_ATTR];
  const heldAtStart = HOME_HOLD_ATTR in attrs;
  (onLoad as (() => void) | null)?.();
  const t = timer as { fn: () => void; ms: number } | null;
  t?.fn();
  return {
    first,
    afterLoad: attrs[HOME_MODE_ATTR],
    waited: t?.ms ?? null,
    heldAtStart,
    heldAfterLoad: HOME_HOLD_ATTR in attrs,
    loader,
  };
}

describe('首页启动脚本（MAPPING §67）', () => {
  it('桌面宽度、语法读得懂：整屏翻页；打包脚本接管了就不退回', () => {
    expect(boot({ ready: true })).toMatchObject({ first: 'paged', afterLoad: 'paged', waited: HOME_BOOT_GRACE_MS });
  });

  it('打包脚本接管了但首屏还在等载入页退场（只有 data-hs-live、还没有 .hs-ready）：也不退回', () => {
    const r = boot({ live: true });
    expect(r.afterLoad).toBe('paged');
    expect(r.loader.readies).toEqual([]);
  });

  it('语法读得懂：后几屏的图先不拉，向载入页登记首页（MAPPING §87）', () => {
    const r = boot({ ready: true });
    expect(r.heldAtStart).toBe(true);
    expect(r.loader.needs).toEqual([HOME_LOADER_KEY]);
    // 打包脚本接管时由 HomeScroll 摘掉 / 报告；这里替身没有摘，检查不会替它做
    expect(r.heldAfterLoad).toBe(true);
  });

  it('没有载入页控制器（例如被拦截）：照样能跑', () => {
    expect(boot({ ready: true, loader: false }).first).toBe('paged');
  });

  it('窄窗口：一开始就是文档流', () => {
    expect(boot({ narrow: true, ready: true }).first).toBe('flow');
  });

  it('旧 Safari 读不懂打包语法：一开始就是文档流，不等脚本、不扣图、不向载入页登记', () => {
    const r = boot({ oldSyntax: true });
    expect(r).toMatchObject({ first: 'flow', afterLoad: 'flow', waited: null, heldAtStart: false });
    expect(r.loader.needs).toEqual([]);
  });

  it('没有 matchMedia：文档流', () => {
    expect(boot({ noMatchMedia: true }).first).toBe('flow');
  });

  it('语法读得懂但打包脚本没接管（加载失败 / 运行出错）：load 之后宽限一段时间退回文档流，图放行、载入页退场', () => {
    const r = boot({ ready: false });
    expect(r.first).toBe('paged');
    expect(r.afterLoad).toBe('flow');
    expect(r.waited).toBe(HOME_BOOT_GRACE_MS);
    expect(r.heldAfterLoad).toBe(false);
    expect(r.loader.readies).toEqual([HOME_LOADER_KEY]);
  });

  it('脚本本身只用 ES5：不含箭头函数、let / const、模板字符串', () => {
    // 探测用的新语法只放在交给 new Function 的字符串里
    const outside = HOME_BOOT_SCRIPT.replace(/new Function\('[^']*'\)/, '');
    expect(outside).not.toMatch(/=>|\blet\b|\bconst\b|`|\?\.|\?\?/);
  });
});
