// 守门只卡结构，不卡数值：站上改了颜色，重跑生成器就同步，测试不该因此变红（npm run build 先跑测试，红了会挡住部署）。
// 会变红的只有「设计系统引用的变量被改名 / 删掉了」——那时改 tokens.mjs 里对应的一行 css(…) 即可。
import { describe, expect, it } from 'vitest';
import { readVars, resolveValue } from './css-vars.mjs';
import { RAMPS, SEMANTIC, buildTokens, loadScopes, readField } from './tokens.mjs';

describe('css-vars', () => {
  it('只收顶层块，@media 里的同名块不算；后写的覆盖先写的', () => {
    const css = `:root { --a: 1px; /* --b: x; */ }
      @media (min-width: 9px) { :root { --a: 9px; } }
      :root { --c: var(--a); }`;
    expect(readVars(css, ':root')).toEqual({ '--a': '1px', '--c': 'var(--a)' });
  });
  it('var() 链与嵌套回退都能展开，缺了又没回退就报错', () => {
    const scope = { '--a': 'var(--b)', '--b': 'oklch(0.5 0.1 120)' };
    expect(resolveValue('var(--a)', scope)).toBe('oklch(0.5 0.1 120)');
    expect(resolveValue('var(--x, var(--b))', scope)).toBe('oklch(0.5 0.1 120)');
    expect(() => resolveValue('var(--x)', scope)).toThrow(/--x/);
  });
});

describe('设计系统 token 生成器（scripts/design-system/tokens.mjs）', () => {
  const scopes = loadScopes();

  it('每个 css(…) 来源都在站上 CSS 里找得到', () => {
    const missing = [];
    for (const t of [...RAMPS, ...SEMANTIC]) {
      for (const side of ['light', 'dark']) {
        const s = t[side];
        if (s && typeof s === 'object' && s.css && scopes[s.scope][s.css] == null) missing.push(`${t.name} ${side}: ${s.css}（${s.scope}）`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('生成结果没有残留的 var()，别名都指向存在的 token', () => {
    const json = buildTokens(undefined, { date: '2000-01-01' });
    const names = new Set(json.color.tokens.map((t) => t.name));
    const bad = [];
    for (const t of json.color.tokens) {
      for (const v of typeof t.value === 'object' ? Object.values(t.value) : [t.value]) {
        if (v.includes('var(')) bad.push(`${t.name}: ${v}`);
        const alias = v.match(/^\{(.+)\}$/);
        if (alias && !names.has(alias[1])) bad.push(`${t.name} → {${alias[1]}} 不存在`);
      }
    }
    expect(bad).toEqual([]);
    expect(names.size).toBe(json.color.tokens.length);
  });

  it('首页 Field 的六组色都能从 field-visuals.ts 读到', () => {
    const field = readField();
    expect(field.map((f) => f.k)).toEqual(['i', 'ii', 'iii', 'bed', 'site', 'about']);
    for (const f of field) for (const c of [f.ink, f.surface, f.muted]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
