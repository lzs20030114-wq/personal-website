// 读站上 CSS 里的自定义属性（--x），按作用域合并并展开 var() 链。
// 只给设计系统的 token 生成器用（scripts/design-system/tokens.mjs），不进站点打包。

/** 去注释后按顶层规则切块：@media 等嵌套块整体跳过，只收 `选择器 { 声明 }`。 */
function topLevelRules(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let depth = 0;
  let start = 0;
  let sel = '';
  let bodyStart = 0;
  let nested = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '{') {
      if (depth === 0) {
        sel = src.slice(start, i).trim();
        bodyStart = i + 1;
        nested = false;
      } else nested = true;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        if (!nested) out.push({ sel, body: src.slice(bodyStart, i) });
        start = i + 1;
      }
    } else if (c === ';' && depth === 0) start = i + 1;
  }
  return out;
}

/** 选择器恰好等于 selector 的全部顶层块里的 --x 声明（后出现的覆盖先出现的）。 */
export function readVars(css, selector) {
  const vars = {};
  for (const r of topLevelRules(css)) {
    if (r.sel !== selector) continue;
    for (const m of r.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) vars[m[1]] = m[2].trim();
  }
  return vars;
}

/** 把 value 里的 var(--x[, fallback]) 按 scope 展开到底；缺了又没有回退值就抛错。 */
export function resolveValue(value, scope, seen = []) {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf('var(', i);
    if (at < 0) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, at);
    let depth = 0;
    let end = at + 3;
    for (; end < value.length; end++) {
      if (value[end] === '(') depth++;
      else if (value[end] === ')' && --depth === 0) break;
    }
    const inner = value.slice(at + 4, end);
    const comma = inner.indexOf(',');
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma < 0 ? null : inner.slice(comma + 1).trim();
    if (seen.includes(name)) throw new Error(`var() 循环引用：${[...seen, name].join(' → ')}`);
    if (scope[name] != null) out += resolveValue(scope[name], scope, [...seen, name]);
    else if (fallback != null) out += resolveValue(fallback, scope, seen);
    else throw new Error(`${name} 在这个作用域里没有定义`);
    i = end + 1;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** scope 里 --name 的最终值。 */
export function resolveVar(name, scope) {
  if (scope[name] == null) throw new Error(`${name} 在这个作用域里没有定义`);
  return resolveValue(scope[name], scope, [name]);
}
