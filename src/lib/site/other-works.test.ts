import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getAllWork, getRoutableWork } from './content';
import sharp from 'sharp';
import { buildCards, buildWorkGroups, otherWorkHref } from './home-model';
import { getLogEntries } from './log';
import { PROJECT_GROUPS } from './log-facets';
import { getOtherWorkPages, getOtherWorks } from './other-works';
import { OtherWorksSchema, WORK_INTRO_MAX } from './other-works-schema';

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
  return !!m && [...getRoutableWork().map((w) => w.slug), ...getOtherWorkPages().map((x) => x.work.slug)].includes(m[1]);
};

/** 一件作品详情页里的全部图（按小节摊平） */
const figs = (w: ReturnType<typeof getOtherWorks>['works'][number]) =>
  (w.page?.sections ?? []).flatMap((s) => s.figures ?? []);

const ok = {
  groups: [{ key: 'a', title: 'A' }],
  works: [{ title: 'X', group: 'a', year: '2024', context: 'Course', href: '/archive' }],
};

describe('其他作品内容池（content/other/works.json）', () => {
  it('文件过 schema，图都在 public 里，链接都落得到', () => {
    const data = getOtherWorks();
    data.works.forEach((w) => {
      if (w.image) expect(existsSync(join(process.cwd(), 'public', w.image.src)), w.image.src).toBe(true);
      if (w.card) expect(existsSync(join(process.cwd(), 'public', w.card.src)), w.card.src).toBe(true);
      figs(w).forEach((f) => expect(existsSync(join(process.cwd(), 'public', f.src)), f.src).toBe(true));
      if (w.href) expect(reachable(w.href), `${w.title} → ${w.href}`).toBe(true);
      expect(reachable(otherWorkHref(w, getLogEntries())), w.title).toBe(true);
      if (w.log) expect(PROJECT_GROUPS.map((g) => g.key), `${w.title} 的 log`).toContain(w.log);
    });
  });

  it('标在内容池里的宽高与图片文件实际像素一致（详情页按它排比例框）', async () => {
    const imgs = getOtherWorks().works.flatMap((w) => [
      ...(w.image && w.image.src.startsWith('/other/') ? [w.image] : []),
      ...(w.card ? [w.card] : []),
      ...figs(w),
    ]);
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      const meta = await sharp(join(process.cwd(), 'public', img.src)).metadata();
      expect([meta.width, meta.height], img.src).toEqual([img.width, img.height]);
    }
  });

  it('详情页：地址不和主项目撞，组都有中文名，封面不在正文重复，小节标题不重复，正文都注明出处', () => {
    const pages = getOtherWorkPages();
    expect(pages.length).toBeGreaterThan(0);
    const mainSlugs = getAllWork().map((w) => w.slug);
    pages.forEach(({ work, group }) => {
      expect(mainSlugs, `${work.slug} 与主项目撞了`).not.toContain(work.slug);
      expect(group.zh, `${group.key} 缺中文组名`).toBeTruthy();
      expect(figs(work).map((f) => f.src), `${work.slug} 封面在正文里又出现一次`).not.toContain(work.image!.src);
      const heads = work.page.sections.map((s) => s.heading.en);
      expect(new Set(heads).size, `${work.slug} 小节标题重复`).toBe(heads.length);
      work.page.sections.flatMap((s) => s.texts ?? []).forEach((t) => {
        expect(t.en.length, `${work.slug} 中英段数`).toBe(t.zh.length);
        expect(t.source.en && t.source.zh, `${work.slug} 缺出处`).toBeTruthy();
      });
    });
  });

  it('正文段的中英段数不一致、小节既没字又没图，都构建失败', () => {
    const text = { original: 'zh', en: ['a'], zh: ['甲'], source: { en: 's', zh: '源' } };
    const sec = (s: object) => ({ heading: { en: 'H', zh: '题' }, ...s });
    const page = (sections: object[]) => ({
      ...ok,
      works: [{ ...ok.works[0], slug: 'x', image: { src: '/other/a.webp', width: 1, height: 1 }, page: { sections } }],
    });
    const parse = (sections: object[]) => OtherWorksSchema.safeParse(page(sections)).success;
    expect(parse([sec({ texts: [text] })])).toBe(true);
    expect(parse([sec({ texts: [{ ...text, zh: ['甲', '乙'] }] })])).toBe(false);
    expect(parse([sec({})])).toBe(false);
    expect(parse([])).toBe(false);
  });

  it('没有详情页又没有 href、有详情页却没有 slug 或封面，都构建失败', () => {
    const page = {
      sections: [{ heading: { en: 'H', zh: '题' }, figures: [{ src: '/other/a.webp', width: 1, height: 1, caption: { en: 'a', zh: 'a' } }] }],
    };
    const img = { src: '/other/a.webp', width: 1, height: 1 };
    const { href: _drop, ...noHref } = ok.works[0];
    const bad = (w: object) => OtherWorksSchema.safeParse({ ...ok, works: [w] }).success;
    expect(bad(noHref)).toBe(false);
    expect(bad({ ...noHref, slug: 'x', image: img, page })).toBe(true);
    expect(bad({ ...noHref, image: img, page })).toBe(false);
    expect(bad({ ...noHref, slug: 'x', page })).toBe(false);
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

  it('年份可以不填（绘画页，作者 2026-10-30「先不写年份」）：卡片那一行留空，不出 undefined', () => {
    const { year: _drop, ...noYear } = ok.works[0];
    const parsed = OtherWorksSchema.safeParse({ ...ok, works: [noYear] });
    expect(parsed.success).toBe(true);
    const groups = buildWorkGroups(cards(), parsed.data!, []);
    expect(groups[1].tiles[0].status).toBe('');
  });

  it('画作的两项排法（绘画页 2026-10-30）：节可以等高成行，封面可以整张放进框里；别的写法不收', () => {
    const fig = { src: '/other/a.webp', width: 10, height: 10, caption: { en: 'a', zh: 'a' } };
    const page = (layout: string, fit: string) => ({
      ...ok,
      works: [{ ...ok.works[0], slug: 'x', image: { src: '/other/a.webp', width: 10, height: 10, fit }, page: { sections: [{ heading: { en: 'h', zh: 'h' }, layout, figures: [fig] }] } }],
    });
    expect(OtherWorksSchema.safeParse(page('rows', 'contain')).success).toBe(true);
    expect(OtherWorksSchema.safeParse(page('grid', 'contain')).success).toBe(false);
    expect(OtherWorksSchema.safeParse(page('rows', 'fill')).success).toBe(false);
    // 绘画页本身：六节全是等高成行、封面不裁
    const drawing = getOtherWorkPages().find((p) => p.work.slug === 'drawing-and-painting')!;
    expect(drawing.work.image?.fit).toBe('contain');
    expect(drawing.work.page.sections.every((s) => s.layout === 'rows')).toBe(true);
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

  it('每张卡都有悬停介绍、都有封面（项目三除外），封面文件都在 public 里（MAPPING §76）', () => {
    const tiles = buildWorkGroups(cards(), getOtherWorks(), getLogEntries()).flatMap((g) => g.tiles);
    tiles.forEach((t) => {
      expect(t.thesis, t.title).toBeTruthy();
      expect(t.thesis!.length, t.title).toBeLessThanOrEqual(WORK_INTRO_MAX);
      // 介绍不拿占位串、不和标题下那一行重复
      expect(t.thesis, t.title).not.toMatch(/author to write|待盘点|placeholder/i);
      expect(t.thesis, t.title).not.toBe(t.role);
      if (t.caseSlug === 'project-iii') expect(t.img).toBeNull();
      else expect(existsSync(join(process.cwd(), 'public', t.img!)), `${t.title} → ${t.img}`).toBe(true);
    });
  });

  it('登记了日志组的作品链到那一组最新一条，没有记录时退回 href', () => {
    const w = getOtherWorks().works.find((x) => x.log)!;
    const entries = getLogEntries();
    const tile = buildWorkGroups(cards(), getOtherWorks(), entries).flatMap((g) => g.tiles).find((t) => t.title === w.title)!;
    expect(tile.href).toMatch(/^\/archive#log-/);
    expect(buildWorkGroups(cards(), getOtherWorks(), []).flatMap((g) => g.tiles).find((t) => t.title === w.title)!.href).toBe(w.href);
  });

  it('有详情页的其他作品链到 /work/<slug>，卡片走展开转场', () => {
    const groups = buildWorkGroups(cards(), getOtherWorks(), getLogEntries());
    getOtherWorkPages().forEach(({ work }) => {
      const tile = groups.flatMap((g) => g.tiles).find((t) => t.title === work.title)!;
      expect(tile.href).toBe(`/work/${work.slug}`);
      expect(tile.ptSlug).toBe(work.slug);
      expect(tile.caseSlug).toBeNull();
    });
    expect(groups[0].tiles.map((t) => t.ptSlug)).toEqual(groups[0].tiles.map((t) => t.caseSlug));
  });

  it('没有详情页的其他作品卡不走转场，题头编号跟着组号走', () => {
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
      expect(t.ptSlug).toBeNull();
      expect(t.thesis).toBeNull();
    });
  });
});
