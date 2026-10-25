import fs from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import { OtherWorksSchema, type OtherGroup, type OtherWork, type OtherWorks } from './other-works-schema';

// 其他作品内容池：读文件 + zod 校验，构建期 fail-fast（与 log.ts 同一套做法）。
export const OTHER_WORKS_FILE = path.join(process.cwd(), 'content', 'other', 'works.json');

export const getOtherWorks = cache((): OtherWorks => {
  const raw = JSON.parse(fs.readFileSync(OTHER_WORKS_FILE, 'utf8'));
  const parsed = OtherWorksSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`content/other/works.json 校验失败：${parsed.error.message}`);
  }
  return parsed.data;
});

/** 有详情页的一件其他作品，连同它所在的组。 */
export interface OtherWorkPage {
  work: OtherWork & { slug: string; page: NonNullable<OtherWork['page']> };
  group: OtherGroup;
}

/**
 * 有详情页的其他作品，按首页 Work 页的顺序（组的登记顺序，组内按作品顺序）。
 * 详情页挂在 /work/<slug>，与主项目同一条路由（MAPPING §60）。
 */
export const getOtherWorkPages = cache((): OtherWorkPage[] => {
  const { groups, works } = getOtherWorks();
  return groups.flatMap((group) =>
    works
      .filter((w) => w.group === group.key && w.page && w.slug)
      .map((w) => ({ work: w as OtherWorkPage['work'], group })),
  );
});

export function getOtherWorkPage(slug: string): OtherWorkPage | undefined {
  return getOtherWorkPages().find((p) => p.work.slug === slug);
}
