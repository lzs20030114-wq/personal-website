/**
 * 受限 Markdown——只为 work log 正文服务（2026-07-28 用户拍板「小标题 / 列表 / 代码块」）。
 *
 * 纯函数，输出**数据**而不是 HTML 字符串：渲染在 components/site/LogBody.tsx 里用 React
 * 元素拼，所以不存在 `dangerouslySetInnerHTML`，也就不存在从编辑器注入脚本的路径。
 * 这是选择自己写一个小解析器而不是引 markdown 库的主要原因（另一个：零新依赖）。
 *
 * 支持：
 *   `### 小标题`（1–3 个 # 都当三级，4 个及以上当四级——页面上 h1/h2 已被标题与月份占了）
 *   `- 项` / `1. 项`（列表，一行一项）
 *   ```` ``` ```` 围栏代码块（内容逐字保留）
 *   行内 `**加粗**`、`` `代码` ``、`[文字](链接)`
 * 不支持（有意）：任意 HTML、图片语法、表格语法——图与表走 blocks 字段，有自己的编辑器与校验。
 *
 * 兼容性：段落内的换行原样留在文本里（`.log-entry__body` 用 `white-space: pre-line` 呈现），
 * 池内既有 47 条正文不含任何 Markdown 记号，解析后与从前逐字相同。
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; v: string }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string; href: string };

export type MdBlock =
  | { t: 'p'; spans: Inline[] }
  | { t: 'h'; level: 3 | 4; spans: Inline[] }
  | { t: 'list'; ordered: boolean; items: Inline[][] }
  | { t: 'pre'; code: string };

/** 只放行这几种链接：站内绝对路径、锚点、http(s)、mailto。其余（含 javascript:）当普通文字。 */
const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

const INLINE = /`([^`]+)`|\*\*([^*]+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/**
 * 相邻的纯文本合并成一段：降级回原文的情况（不安全链接）会把一句话切成碎片，
 * 合并后既少几个 DOM 节点，也让「这段其实没有任何记号」在结果里一眼看得出来。
 */
function coalesce(spans: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (span.t === 'text' && last?.t === 'text') out[out.length - 1] = { t: 'text', v: last.v + span.v };
    else out.push(span);
  }
  return out;
}

export function parseInline(text: string): Inline[] {
  const spans: Inline[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index;
    if (start > at) spans.push({ t: 'text', v: text.slice(at, start) });
    if (m[1] !== undefined) spans.push({ t: 'code', v: m[1] });
    else if (m[2] !== undefined) spans.push({ t: 'strong', v: m[2] });
    else if (m[3] !== undefined && m[4] !== undefined) {
      // 不安全的链接不是「报错」而是降级成原文：作者看得见自己写了什么，站上也不会有活链接
      if (SAFE_HREF.test(m[4])) spans.push({ t: 'link', v: m[3], href: m[4] });
      else spans.push({ t: 'text', v: m[0] });
    }
    at = start + m[0].length;
  }
  if (at < text.length) spans.push({ t: 'text', v: text.slice(at) });
  return coalesce(spans);
}

const HEADING = /^(#{1,6})\s+(.+)$/;
const BULLET = /^\s*[-*+]\s+(.+)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.+)$/;

export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length === 0) return;
    const text = para.join('\n').trim();
    para = [];
    if (text) blocks.push({ t: 'p', spans: parseInline(text) });
  };
  const flushList = () => {
    if (list === null) return;
    blocks.push({ t: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };
  const flush = () => {
    flushPara();
    flushList();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // 围栏代码块：收到闭合围栏或文本结束为止，内容一律逐字（里面的 # 与 - 不当记号）
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push({ t: 'pre', code: code.join('\n') });
      continue;
    }

    if (line.trim() === '') {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({
        t: 'h',
        level: heading[1].length <= 3 ? 3 : 4,
        spans: parseInline(heading[2].trim()),
      });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = numbered !== null;
      // 列表类型切换（- 之后紧跟 1.）当两个列表，不混成一个
      if (list !== null && list.ordered !== ordered) flushList();
      if (list === null) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    flushList();
    para.push(line);
  }
  flush();
  return blocks;
}

/** 正文是否用到了任何 Markdown 记号——编辑器用它决定要不要提示「已识别为富文本」。 */
export function looksLikeMarkdown(src: string): boolean {
  const blocks = parseMarkdown(src);
  return (
    blocks.length > 1 ||
    blocks.some((b) => b.t !== 'p' || b.spans.some((s) => s.t !== 'text'))
  );
}
