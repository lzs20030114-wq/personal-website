import { describe, expect, it } from 'vitest';
import { getAllWork, getRoutableWork } from './content';
import { LAB_BENCHES } from './lab-index';
import { getLogEntries } from './log';
import { projectOf, withAnchors } from './log-facets';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildCards, buildHomeField, buildHomeLog, buildLabGroups } from './home-model';

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

  const works = () =>
    getRoutableWork().map((w) => ({
      slug: w.slug,
      title: w.title,
      date: w.date,
      summary: w.summary,
      role: w.role,
      published: w.status === 'published',
      selected: w.selected,
      cover: w.cover,
    }));
  const shots = () => new Set(readdirSync(join(process.cwd(), 'public', 'home', 'field')).map((f) => `/home/field/${f}`));

  it('首屏方块场：每件都是站上真实的项目 / 台架 / 日志，图都在 public 里、链接都指向真实去处', () => {
    const entries = getLogEntries();
    const cs = cards();
    const f = buildHomeField(cs, works(), entries, shots());
    const by = (k: string) => f.pool.filter((p) => p.kind === k);
    expect(by('project').map((p) => p.href)).toEqual(
      expect.arrayContaining(getRoutableWork().map((w) => `/work/${w.slug}`)),
    );
    expect(by('bench').map((p) => p.code)).toEqual(LAB_BENCHES.map((b) => b.no));
    expect(by('log').length).toBe(entries.length);
    const slugs = getAllWork().map((w) => w.slug);
    const anchors = new Set(withAnchors(entries).map((a) => a.anchor));
    f.pool.forEach((p) => {
      if (p.img) expect(existsSync(join(process.cwd(), 'public', p.img)), p.img).toBe(true);
      if (p.href.startsWith('/work/')) expect(slugs).toContain(p.href.slice('/work/'.length));
      else if (p.href.startsWith('/archive#')) expect(anchors.has(p.href.slice('/archive#'.length))).toBe(true);
      else expect(p.href).toMatch(/^\/lab#lab\d-\d+$/);
      // 不许把占位字当内容上首屏
      expect(`${p.title} ${p.text} ${p.cap}`).not.toMatch(/author to write|to be written|待盘点|\[/);
    });
    expect(f.benches).toBe(LAB_BENCHES.length);
    expect(f.entries).toBe(entries.length);
    expect(f.projects).toBe(cs.filter((c) => !c.wip).length);
  });

  it('首屏方块场是自动的：新作品、没截图的新台架、新日志都不用登记就出现', () => {
    const entries = getLogEntries();
    const extra = { slug: 'new-work', title: 'New work', date: '2026-11', summary: 'A new piece.', role: ['Design'], published: true, selected: false };
    const fresh = { ...entries[0], date: '2099-01-01', lead: { en: 'A brand new entry.', zh: '一条新日志。' }, blocks: undefined };
    // 一张截图都没有：台架照样全部在，只是退成编号方块，不报错
    const f = buildHomeField(cards(), [...works(), extra], [fresh, ...entries], new Set());
    expect(f.pool.find((p) => p.href === '/work/new-work')?.title).toBe('New work');
    expect(f.pool.filter((p) => p.kind === 'bench').every((p) => p.img === null && p.code)).toBe(true);
    expect(f.pool.find((p) => p.title === 'A brand new entry.')?.code).toBe('01·01');
  });
});
