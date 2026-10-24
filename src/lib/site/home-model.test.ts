import { describe, expect, it } from 'vitest';
import { getAllWork, getRoutableWork } from './content';
import { LAB_BENCHES, LAB_INDEX } from './lab-index';
import { getLogEntries } from './log';
import { projectOf, withAnchors } from './log-facets';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildCards, buildHomeField, buildHomeLog, buildLabGroups, type FieldWorkInput } from './home-model';

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

const works = (): FieldWorkInput[] => getRoutableWork().map((work) => ({
  ...work,
  published: work.status === 'published',
}));

describe('主页数据派生（home-model）', () => {
  it('三个项目卡指向内容池里真实存在的路由名单', () => {
    const slugs = getAllWork().map((w) => w.slug);
    const cs = cards();
    expect(cs.map((c) => c.slug)).toEqual(['reincarnation-machine', 'project-ii', 'project-iii']);
    cs.forEach((c) => expect(slugs).toContain(c.slug));
    // 未发稿的项目不上主图、不拿「待盘点」占位当简介
    const wip = cs.find((c) => c.slug === 'project-iii')!;
    expect(wip.wip).toBe(true);
    expect(wip.img).toBeNull();
    expect(wip.thesis).not.toMatch(/待盘点/);
  });

  it('Lab 分组 = lab-index 全部台架，一台不丢，项目三为空组', () => {
    const groups = buildLabGroups(cards());
    const nos = groups.flatMap((g) => g.segs.flatMap((s) => s.benches.map((b) => b.no)));
    expect(nos).toEqual(LAB_BENCHES.map((b) => b.no));
    expect(groups.map((g) => g.slug)).toEqual(['reincarnation-machine', 'project-ii', 'project-iii']);
    expect(groups[2].count).toBe(0);
    // 「Case study」链接指向的 slug 必须是真实路由
    const slugs = getAllWork().map((w) => w.slug);
    groups.forEach((g) => expect(slugs).toContain(g.slug));
    // 默认预览位必须是组内真实存在的台架
    for (const g of groups.filter((x) => x.cover)) {
      expect(g.segs.flatMap((s) => s.benches.map((b) => b.no))).toContain(g.cover);
    }
  });

  it('日志时间线：每条恰好落进一条泳道，计数之和 = 总条数，锚点与 /archive 一致', () => {
    const entries = getLogEntries();
    const log = buildHomeLog(entries);
    expect(log.lanes.reduce((a, l) => a + l.count, 0)).toBe(entries.length);
    expect(log.total).toBe(entries.length);
    const anchors = withAnchors(entries).map((x) => `/archive#${x.anchor}`);
    const hrefs = log.lanes.flatMap((l) => l.ticks.map((t) => t.href));
    expect([...hrefs].sort()).toEqual([...anchors].sort());
    log.lanes.forEach((l) => l.ticks.forEach((t) => expect(t.f).toBeGreaterThanOrEqual(0)));
    log.lanes.forEach((l) => l.ticks.forEach((t) => expect(t.f).toBeLessThan(1)));
  });

  it('最新三条 = 池里最新三条，i 与 ticks 一一对应', () => {
    const log = buildHomeLog(getLogEntries());
    expect(log.latest).toHaveLength(3);
    const tickIs = new Set(log.lanes.flatMap((l) => l.ticks.map((t) => t.i)));
    log.latest.forEach((l) => expect(tickIs.has(l.i)).toBe(true));
    expect(log.latest.map((l) => l.i)).toEqual([0, 1, 2]);
  });

  it('项目三开题单列，不归到智能床实习与建站泳道', () => {
    const entries = getLogEntries();
    const expected = withAnchors(entries)
      .filter(({ entry }) => projectOf(entry) === 'project-iii')
      .map(({ anchor }) => `/archive#${anchor}`);
    expect(expected.length).toBeGreaterThan(0);
    const log = buildHomeLog(entries);
    const research = log.lanes.find((lane) => lane.label === 'Sleep research');
    expect(research?.ticks.map((tick) => tick.href)).toEqual(expected);
    const other = log.lanes.find((lane) => lane.label === 'Smart Bed · site');
    expect(other?.ticks.some((tick) => expected.includes(tick.href))).toBe(false);
  });

  it('首屏方块场完整覆盖三个主项目、全部台架、全部日志和两个补充入口，不收非公开草稿', () => {
    const entries = getLogEntries();
    const cs = cards();
    const f = buildHomeField(cs, works(), entries);
    expect(f.pool).toHaveLength(works().length + LAB_BENCHES.length + entries.length + 2);
    expect(new Set(f.pool.map((item) => item.id)).size).toBe(f.pool.length);
    expect(f.pool.filter((item) => item.kind === 'project').map((item) => item.href))
      .toEqual(works().map((work) => `/work/${work.slug}`));
    expect(f.pool.filter((item) => item.kind === 'lab').map((item) => item.href))
      .toEqual(LAB_BENCHES.map((bench) => `/lab#lab${bench.no}`));
    expect(f.pool.filter((item) => item.kind === 'log').map((item) => item.href))
      .toEqual(withAnchors(entries).map(({ anchor }) => `/archive#${anchor}`));
    expect(f.pool.filter((item) => item.kind === 'other')).toHaveLength(1);
    expect(f.pool.filter((item) => item.kind === 'about')).toHaveLength(1);
    expect(f.pool.some((item) => item.href === '/work/project-iv')).toBe(false);
    expect(f.benches).toBe(LAB_BENCHES.length);
    expect(f.entries).toBe(entries.length);
    // 项目三可以进格子，但「已发稿项目数」不把筹备中的案例算作已发稿。
    expect(f.projects).toBe(cs.filter((card) => !card.wip).length);
  });

  it('首屏图标都有独立 SVG 文件，所有链接都是实际公开入口', () => {
    const entries = getLogEntries();
    const f = buildHomeField(cards(), works(), entries);
    const slugs = getRoutableWork().map((work) => work.slug);
    const anchors = new Set(withAnchors(entries).map((a) => a.anchor));
    const nos = new Set(LAB_BENCHES.map((b) => b.no));
    f.pool.forEach((item) => {
      expect(item.img).toMatch(/^\/home\/icons\/[a-z0-9-]+\.svg$/);
      expect(existsSync(join(process.cwd(), 'public', item.img)), item.img).toBe(true);
      if (item.href.startsWith('/lab#lab')) expect(nos.has(item.href.slice('/lab#lab'.length))).toBe(true);
      else if (item.href.startsWith('/work/')) expect(slugs).toContain(item.href.slice('/work/'.length));
      else if (item.href.startsWith('/archive#')) expect(anchors.has(item.href.slice('/archive#'.length))).toBe(true);
      else expect(['/archive', '/#about']).toContain(item.href);
    });
  });

  it('项目三明确筹备状态，About 去已有正文的首页幕，智能床保持独立研究入口', () => {
    const entries = getLogEntries();
    const f = buildHomeField(cards(), works(), entries);
    const preparation = f.pool.find((item) => item.href === '/work/project-iii')!;
    expect(preparation.kind).toBe('project');
    expect(preparation.project).toBe('project-iii');
    expect(preparation.title).toBe('Project III');
    expect(preparation.cap).toBe('In preparation');
    expect(preparation.cta).toBe('View progress ↗');
    expect([preparation.title, preparation.cap, preparation.cta].join(' ')).not.toMatch(/待盘点|placeholder|thesis|author to write/);
    const about = f.pool.find((item) => item.kind === 'about')!;
    expect(about.title).toBe('About Zishuo Li');
    expect(about.href).toBe('/#about');
    const smartBed = f.pool.find((item) => item.kind === 'other')!;
    expect(smartBed.project).toBe('other-work');
    expect(smartBed.title).toBe('Smart Bed');
    const latestOther = withAnchors(entries).find(({ entry }) => projectOf(entry) === 'other-work')!;
    expect(smartBed.href).toBe(`/archive#${latestOther.anchor}`);
    // 输入顺序不应把专题入口改到最早的那条研究记录。
    const reversed = buildHomeField(cards(), works(), [...entries].reverse());
    expect(reversed.pool.find((item) => item.kind === 'other')?.href).toBe(smartBed.href);
    const noOther = buildHomeField(cards(), works(), entries.filter((entry) => projectOf(entry) !== 'other-work'));
    expect(noOther.pool.find((item) => item.kind === 'other')?.href).toBe('/archive');
  });

  it('每条日志用原 lead 与稳定锚点，换配图或排序不会丢条目、串链接', () => {
    const entries = getLogEntries();
    const f = buildHomeField(cards(), works(), entries);
    const logs = f.pool.filter((item) => item.kind === 'log');
    withAnchors(entries).forEach(({ entry, anchor }, index) => {
      expect(logs[index].id).toBe(`log:${anchor}`);
      expect(logs[index].title).toBe(entry.lead.en);
      expect(logs[index].project).toBe(projectOf(entry));
      expect(logs[index].href).toBe(`/archive#${anchor}`);
    });
    const noImages = entries.map((entry) => ({ ...entry, blocks: undefined })).reverse();
    const changed = buildHomeField(cards(), works(), noImages).pool.filter((item) => item.kind === 'log');
    const byId = new Map(logs.map((item) => [item.id, item]));
    expect(changed).toHaveLength(logs.length);
    changed.forEach((item) => {
      expect(item.href).toBe(byId.get(item.id)?.href);
      expect(item.title).toBe(byId.get(item.id)?.title);
    });
  });

  it('新增公开作品和日志自动入池，无专属图标时仍有真实链接与 SVG', () => {
    const entries = getLogEntries();
    const baseline = buildHomeField(cards(), works(), entries);
    const extra: FieldWorkInput = {
      slug: 'new-work', title: 'New work', date: '2026-11', summary: 'A new piece.',
      role: ['Design'], published: true, selected: false,
    };
    const fresh = {
      ...entries[0], id: 'log-2099-01-01-1000000001', date: '2099-01-01',
      lead: { en: 'A brand new entry.', zh: '一条新日志。' }, blocks: undefined,
      tags: [
        { variant: 'outline' as const, label: { en: 'Site', zh: '建站' } },
        { variant: 'neutral' as const, label: { en: 'Research', zh: '调研' } },
      ],
    };
    // 新作品没有主页卡，新日志没有逐条图标映射，均不需要补首屏登记。
    const field = buildHomeField(cards(), [extra, ...works()], [fresh, ...entries]);
    expect(field.pool).toHaveLength(baseline.pool.length + 2);
    expect(field.pool.find((item) => item.href === '/work/new-work')).toMatchObject({
      id: 'project:new-work', kind: 'project', project: 'other-work',
      title: extra.title, cap: extra.summary, img: '/home/icons/archive.svg',
    });
    expect(field.pool.find((item) => item.href === `/archive#${fresh.id}`)).toMatchObject({
      id: `log:${fresh.id}`, kind: 'log', project: 'this-site',
      title: fresh.lead.en, img: '/home/icons/research.svg',
    });
    expect(field.projects).toBe(baseline.projects);
    expect(field.entries).toBe(entries.length + 1);
    const byId = new Map(field.pool.map((item) => [item.id, item]));
    baseline.pool.forEach((item) => expect(byId.get(item.id)).toEqual(item));
    const reachable = new Set(field.draws.flatMap((draw) => draw.groups.flat()));
    field.pool.forEach((item, index) => {
      expect(reachable.has(index)).toBe(true);
      expect(existsSync(join(process.cwd(), 'public', item.img)), item.img).toBe(true);
    });
  });

  it('新台架仅登记目录就入池，未画专属图标时回退实验符号', () => {
    const segments = LAB_INDEX[1].segments;
    const segment = segments[segments.length - 1];
    const bench = { ...segment.benches[0], no: '2-99', title: 'New experiment' };
    segment.benches.push(bench);
    try {
      const field = buildHomeField(cards(), works(), getLogEntries());
      const item = field.pool.find((candidate) => candidate.id === 'lab:2-99');
      expect(item).toMatchObject({
        kind: 'lab', project: 'project-ii', title: bench.title,
        href: '/lab#lab2-99', img: '/home/icons/experiment.svg',
      });
      expect(field.benches).toBe(LAB_BENCHES.length + 1);
      expect(existsSync(join(process.cwd(), 'public', item!.img))).toBe(true);
      expect(field.draws.flatMap((draw) => draw.groups.flat())).toContain(field.pool.indexOf(item!));
    } finally {
      segment.benches.pop();
    }
  });

  it('分层抽样覆盖完整候选池，每个索引都可到达', () => {
    const f = buildHomeField(cards(), works(), getLogEntries());
    const reachable = new Set<number>();
    f.draws.forEach((draw) => {
      expect(draw.weight).toBeGreaterThan(0);
      expect(draw.groups.length).toBeGreaterThan(0);
      draw.groups.forEach((group) => {
        expect(group.length).toBeGreaterThan(0);
        group.forEach((index) => {
          expect(Number.isInteger(index)).toBe(true);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(f.pool.length);
          reachable.add(index);
        });
      });
    });
    expect([...reachable].sort((a, b) => a - b)).toEqual(f.pool.map((_, index) => index));
  });
});
