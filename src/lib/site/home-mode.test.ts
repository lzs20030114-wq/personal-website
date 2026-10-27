import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { HOME_BOOT_GRACE_MS, HOME_BOOT_SCRIPT, HOME_FLOW_QUERY, HOME_MODE_ATTR } from './home-mode';

/** 在一个假的浏览器全局里跑首页内联启动脚本，返回 <html data-hs> 的值和 load 之后的那次检查 */
function boot(opts: { narrow?: boolean; oldSyntax?: boolean; noMatchMedia?: boolean; ready?: boolean }) {
  const attrs: Record<string, string> = {};
  let onLoad: (() => void) | null = null;
  let timer: { fn: () => void; ms: number } | null = null;
  const root = { className: opts.ready ? 'hs-root hs-ready' : 'hs-root' };
  const sandbox: Record<string, unknown> = {
    document: {
      documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
      querySelector: (s: string) => (s === '.hs-root' ? root : null),
    },
    setTimeout: (fn: () => void, ms: number) => (timer = { fn, ms }),
  };
  sandbox.window = {
    matchMedia: opts.noMatchMedia ? undefined : (q: string) => ({ matches: q === HOME_FLOW_QUERY && !!opts.narrow }),
    addEventListener: (ev: string, fn: () => void) => ev === 'load' && (onLoad = fn),
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
  (onLoad as (() => void) | null)?.();
  const t = timer as { fn: () => void; ms: number } | null;
  t?.fn();
  return { first, afterLoad: attrs[HOME_MODE_ATTR], waited: t?.ms ?? null };
}

describe('首页启动脚本（MAPPING §67）', () => {
  it('桌面宽度、语法读得懂：整屏翻页；打包脚本接管了就不退回', () => {
    expect(boot({ ready: true })).toEqual({ first: 'paged', afterLoad: 'paged', waited: HOME_BOOT_GRACE_MS });
  });

  it('窄窗口：一开始就是文档流', () => {
    expect(boot({ narrow: true, ready: true }).first).toBe('flow');
  });

  it('旧 Safari 读不懂打包语法：一开始就是文档流，不等脚本', () => {
    expect(boot({ oldSyntax: true })).toEqual({ first: 'flow', afterLoad: 'flow', waited: null });
  });

  it('没有 matchMedia：文档流', () => {
    expect(boot({ noMatchMedia: true }).first).toBe('flow');
  });

  it('语法读得懂但打包脚本没接管（加载失败 / 运行出错）：load 之后宽限一段时间退回文档流', () => {
    const r = boot({ ready: false });
    expect(r.first).toBe('paged');
    expect(r.afterLoad).toBe('flow');
    expect(r.waited).toBe(HOME_BOOT_GRACE_MS);
  });

  it('脚本本身只用 ES5：不含箭头函数、let / const、模板字符串', () => {
    // 探测用的新语法只放在交给 new Function 的字符串里
    const outside = HOME_BOOT_SCRIPT.replace(/new Function\('[^']*'\)/, '');
    expect(outside).not.toMatch(/=>|\blet\b|\bconst\b|`|\?\.|\?\?/);
  });
});
