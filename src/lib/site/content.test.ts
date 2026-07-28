import { describe, expect, it } from 'vitest';
import { getAllWork } from './content';

/**
 * 作品内容池守门（2026-07-28，案例页加中英切换后新增）。
 *
 * 双语正文是两个文件（index.mdx / index.zh.mdx），最可能的事故不是写错字，而是
 * **两侧漂移**：一边加了张图另一边忘了加，读者切个语言图就少一张、编号还对不上。
 * 所以这里卡的是「两侧的结构必须一致」，措辞则各写各的（中英各自成文是既定纪律）。
 */

/** 抓正文里所有带编号的插槽（图 / 交互件 / 视频），按出现顺序。 */
function slotIds(body: string): string[] {
  return [...body.matchAll(/<(?:FigSlot|InteractiveSlot|VideoSlot)\b[^>]*?\bid="([^"]+)"/g)].map(
    (m) => m[1],
  );
}

/** h2 = 编号 section（CSS counter 按它排 01、02…），两侧数目必须一致。 */
function h2Count(body: string): number {
  return (body.match(/^## /gm) ?? []).length;
}

const published = getAllWork().filter((w) => w.status === 'published');

describe('work 内容池', () => {
  it('至少有一个 published 条目（否则下面的用例全空转）', () => {
    expect(published.length).toBeGreaterThan(0);
  });

  for (const entry of published) {
    describe(entry.slug, () => {
      it('有中文元数据与中文正文（案例页有中英切换，缺一侧 = 切过去半页空白）', () => {
        expect(entry.zh).toBeDefined();
        expect(entry.bodyZh?.trim()).toBeTruthy();
      });

      it('中英两侧的插槽编号与顺序完全一致', () => {
        expect(slotIds(entry.bodyZh ?? '')).toEqual(slotIds(entry.body));
      });

      it('中英两侧的编号 section 数目一致', () => {
        expect(h2Count(entry.bodyZh ?? '')).toBe(h2Count(entry.body));
      });

      it('summary 两侧都在 160 字以内（列表与 OG 共用这一句）', () => {
        expect(entry.summary.length).toBeLessThanOrEqual(160);
        expect(entry.zh!.summary.length).toBeLessThanOrEqual(160);
      });
    });
  }
});
