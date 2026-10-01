import { describe, expect, it } from 'vitest';
import { getAllWork } from './content';
import { LAB_BENCHES } from './lab-index';
import { getLogEntries } from './log';
import { withAnchors } from './log-facets';
import { buildCards, buildHomeLog, buildLabGroups } from './home-model';

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
});
