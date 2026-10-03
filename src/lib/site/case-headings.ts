/**
 * 从 MDX 源里抽编号章节标题（`## ` 行）——案例页的目录栏用。
 *
 * 纯函数、不碰 DOM：服务端读到 entry.body / entry.bodyZh 后抽好两个语言的标题表，
 * 当 prop 递给客户端的目录组件（目录要在 SSR 首帧就画出来，不能等水合后再扫 DOM）。
 * 跳过围栏代码块与 MDX 注释里的 `##`；只认行首的 `## `（`###` 小标题不进目录——稿的目录就是 00–10 十一项）。
 */
export function extractChapterTitles(mdx: string): string[] {
  const out: string[] = [];
  let fenced = false;
  let inComment = false;
  for (const raw of mdx.split('\n')) {
    const line = raw.trimEnd();
    if (/^```/.test(line.trim())) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    // MDX 注释 {/* … */}，可能跨行
    if (inComment) {
      if (line.includes('*/}')) inComment = false;
      continue;
    }
    if (line.trim().startsWith('{/*') && !line.includes('*/}')) {
      inComment = true;
      continue;
    }
    const m = /^## (.+)$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/** 目录的第一项：编号 00，对应第一个 `##` 之前的开场（稿里叫「开场 / Opening」，没有自己的标题行）。 */
export const OPENING_TITLE = { zh: '开场', en: 'Opening' } as const;

/** 目录项编号：00、01、… */
export const chapterNo = (i: number): string => String(i).padStart(2, '0');
