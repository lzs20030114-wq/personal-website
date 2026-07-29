// 一条 log 的附件（图 / 表）派生逻辑：纯函数，不碰 fs、不碰 DOM。
// 站上条目行（components/site/LogList）、正文右栏（components/site/LogBody）与
// Studio 预览三处共用——「这条有几张图几张表」必须只有一份算法，否则收起态的角标
// 与展开后真正列出来的东西会对不上。
import type { Bilingual, LogBlock } from './log-schema';

/** 附件在条目内的稳定引用：index 用于开合状态，ordinal 是同类里的第几张（给编号用）。 */
export type BlockRef = {
  index: number;
  kind: 'image' | 'table';
  ordinal: number;
  /** 'Fig. 01' / '图 01'（表：'Tab. 01' / '表 01'）——卡片与展开视图共用同一个编号。 */
  label: Bilingual;
  caption?: Bilingual;
  /** 语言中立的规格：图 = 像素尺寸，表 = 列 × 行。 */
  meta: string;
};

export type BlockCounts = { images: number; tables: number; total: number };

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 编号按**类**各自数（图 01、图 02、表 01…），不是按数组下标——
 * 一条日志里加一张图不该把后面所有表的编号推一位。
 */
export function blockRefs(blocks: readonly LogBlock[] = []): BlockRef[] {
  let images = 0;
  let tables = 0;
  return blocks.map((b, index) => {
    if (b.kind === 'image') {
      images += 1;
      return {
        index,
        kind: 'image' as const,
        ordinal: images,
        label: { en: `Fig. ${pad2(images)}`, zh: `图 ${pad2(images)}` },
        caption: b.caption,
        meta: `${b.width} × ${b.height}`,
      };
    }
    tables += 1;
    return {
      index,
      kind: 'table' as const,
      ordinal: tables,
      label: { en: `Tab. ${pad2(tables)}`, zh: `表 ${pad2(tables)}` },
      caption: b.caption,
      // 列 × 行（行数不含表头——表头不是数据）
      meta: `${b.head.length} × ${b.rows.length}`,
    };
  });
}

export function blockCounts(blocks: readonly LogBlock[] = []): BlockCounts {
  const images = blocks.filter((b) => b.kind === 'image').length;
  return { images, tables: blocks.length - images, total: blocks.length };
}

/**
 * 收起态角标的读法（也是它的 aria-label）：'2 figures · 3 tables' / '2 图 · 3 表'。
 * 英文要单复数——角标旁边就写着数字，写错一眼就看得见。
 */
export function countsLabel(counts: BlockCounts): Bilingual {
  const parts: Bilingual[] = [];
  if (counts.images > 0) {
    parts.push({
      en: `${counts.images} ${counts.images === 1 ? 'figure' : 'figures'}`,
      zh: `${counts.images} 图`,
    });
  }
  if (counts.tables > 0) {
    parts.push({
      en: `${counts.tables} ${counts.tables === 1 ? 'table' : 'tables'}`,
      zh: `${counts.tables} 表`,
    });
  }
  return {
    en: parts.map((p) => p.en).join(' · '),
    zh: parts.map((p) => p.zh).join(' · '),
  };
}
