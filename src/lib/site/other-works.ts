import fs from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import { OtherWorksSchema, type OtherWorks } from './other-works-schema';

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
