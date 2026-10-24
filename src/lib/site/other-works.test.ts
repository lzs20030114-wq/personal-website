import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAllWork, getRoutableWork } from './content';
import { buildCards, buildWorkGroups } from './home-model';
import { getLogEntries } from './log';
import { PROJECT_GROUPS } from './log-facets';
import { getOtherWorks } from './other-works';
import { OtherWorksSchema } from './other-works-schema';

const cards = () =>
  buildCards(
    getAllWork().map((w) => ({
      slug: w.slug,
      title: w.title,
      date: w.date,
      summary: w.summary,
      role: w.role,
      published: w.status === 'published',
    })),
  );

/** 站内能落到的去处：静态路由 + 有自己路由的作品 */
const reachable = (href: string) => {
  if (/^https:\/\//.test(href)) return true;
  const p = href.split('#')[0].split('?')[0];
  if (['/', '/archive', '/lab', '/about'].includes(p)) return true;
  const m = /^\/work\/([a-z0-9-]+)$/.exec(p);
  return !!m && getRoutableWork().some((w) => w.slug === m[1]);
};

const ok = {
  groups: [{ key: 'a', title: 'A' }],
  works: [{ title: 'X', group: 'a', year: '2024', context: 'Course', href: '/archive' }],
};

describe('其他作品内容池（content/other/works.json）', () => {
  it('文件过 schema，图都在 public 里，链接都落得到', () => {
    const data = getOtherWorks();
    data.works.forEach((w) => {
      if (w.image) expect(existsSync(join(process.cwd(), 'public', w.image.src)), w.image.src).toBe(true);
      expect(reachable(w.href), `${w.title} → ${w.href}`).toBe(true);
      if (w.log) expect(PROJECT_GROUPS.map((g) => g.key), `${w.title} 的 log`).toContain(w.log);
    });
  });

  it('组 key 重复、作品挂在没登记的组、空组，三种都构建失败', () => {
    expect(OtherWorksSchema.safeParse(ok).success).toBe(true);
    expect(OtherWorksSchema.safeParse({ ...ok, groups: [...ok.groups, { key: 'a', title: 'B' }] }).success).toBe(false);
    expect(OtherWorksSchema.safeParse({ ...ok, works: [{ ...ok.works[0], group: 'b' }] }).success).toBe(false);
    expect(OtherWorksSchema.safeParse({ ...ok, groups: [...ok.groups, { key: 'b', title: 'B' }] }).success).toBe(false);
  });

  it('图片只许站内 /other /log /home，年份格式固定', () => {
    const img = (src: string) => ({ ...ok, works: [{ ...ok.works[0], image: { src, width: 10, height: 10 } }] });
    expect(OtherWorksSchema.safeParse(img('/other/a.webp')).success).toBe(true);
    expect(OtherWorksSchema.safeParse(img('https://example.com/a.webp')).success).toBe(false);
    expect(OtherWorksSchema.safeParse(img('/demo/a.webp')).success).toBe(false);
    const yr = (year: string) => OtherWorksSchema.safeParse({ ...ok, works: [{ ...ok.works[0], year }] }).success;
    expect([yr('2024'), yr('2019–23'), yr('2019–2023')]).toEqual([true, true, true]);
    expect([yr('24'), yr('2019-23'), yr('about 2020')]).toEqual([false, false, false]);
  });
});

describe('Work 页分组（buildWorkGroups）', () => {
  it('第一组是三个主项目，其后按内容池顺序，一件不丢', () => {
    const other = getOtherWorks();
    const groups = buildWorkGroups(cards(), other, getLogEntries());
    expect(groups[0].key).toBe('selected');
    expect(groups[0].tiles.map((t) => t.caseSlug)).toEqual(['reincarnation-machine', 'project-ii', 'project-iii']);
    expect(groups.slice(1).map((g) => g.key)).toEqual(other.groups.map((g) => g.key));
    expect(groups.slice(1).reduce((s, g) => s + g.tiles.length, 0)).toBe(other.works.length);
    expect(groups.map((g) => g.n)).toEqual(groups.map((_, i) => String(i + 1).padStart(2, '0')));
  });

  it('登记了日志组的作品链到那一组最新一条，没有记录时退回 href', () => {
    const w = getOtherWorks().works.find((x) => x.log)!;
    const entries = getLogEntries();
    const tile = buildWorkGroups(cards(), getOtherWorks(), entries).flatMap((g) => g.tiles).find((t) => t.title === w.title)!;
    expect(tile.href).toMatch(/^\/archive#log-/);
    expect(buildWorkGroups(cards(), getOtherWorks(), []).flatMap((g) => g.tiles).find((t) => t.title === w.title)!.href).toBe(w.href);
  });

  it('其他作品卡没有案例页转场，题头编号跟着组号走', () => {
    const groups = buildWorkGroups(cards(), {
      groups: [{ key: 'env', title: 'Environment design' }],
      works: [
        { title: 'Thesis', group: 'env', year: '2024', context: 'Thesis · Undergraduate', href: '/archive' },
        { title: 'Studio', group: 'env', year: '2023', context: 'Course', href: '/archive' },
      ],
    }, []);
    const env = groups[1];
    expect(env.tiles.map((t) => t.kick)).toEqual(['02.1 · Thesis', '02.2 · Course']);
    env.tiles.forEach((t) => {
      expect(t.caseSlug).toBeNull();
      expect(t.thesis).toBeNull();
    });
  });
});
