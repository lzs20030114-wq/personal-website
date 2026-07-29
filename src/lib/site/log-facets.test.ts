import { describe, expect, it } from 'vitest';
import { getLogEntries } from './log';
import {
  aspectFacets,
  aspectOf,
  bucketOf,
  buildHeatmap,
  heatLevel,
  monthFacets,
  monthChip,
  monthLabel,
  OTHER_ASPECT,
  PROJECT_GROUPS,
  projectFacets,
  projectGroupOf,
  projectOf,
} from './log-facets';

/**
 * 三级筛选 + 热力图的守门测试。守的是三件 UI 上不容易一眼看出、坏了却很难查的事：
 * ① 每一级都覆盖全池（各视图之和 = 总览，没有条目掉在下钻路径之外）；
 * ② 排序完全确定（顺序一旦依赖 Map 插入以外的东西，SSR 首帧与 hydration 就会打架）；
 * ③ 热力图的日历算术（周对齐、值域边界、分级）。
 */
const ENTRIES = getLogEntries();

describe('三级筛选', () => {
  it('项目：覆盖全池、条数守恒、顺序恒为 PROJECT_GROUPS 的登记顺序', () => {
    const facets = projectFacets(ENTRIES);
    expect(facets.length).toBeGreaterThan(1); // 只剩一个项目就没有筛选的意义
    expect(facets.reduce((n, f) => n + f.count, 0)).toBe(ENTRIES.length);
    for (const f of facets) {
      expect(ENTRIES.filter((e) => projectOf(e) === f.key).length, `项目 ${f.key}`).toBe(f.count);
    }
    // 项目的先后是作者定的（作品集编号），不随条数抖动
    const registered = PROJECT_GROUPS.map((g) => g.key).filter((k) =>
      facets.some((f) => f.key === k),
    );
    expect(facets.map((f) => f.key)).toEqual(registered);
  });

  it('每个 outline 标签都登记在某个项目组里，且不重复登记', () => {
    // 没登记的标签会让那批条目从所有一级视图里消失，只在总览态出现——
    // 页面上看不出漏在哪，只能在这里挡。
    const buckets = new Set(ENTRIES.map((e) => bucketOf(e)!));
    for (const b of buckets) {
      const owners = PROJECT_GROUPS.filter((g) => g.buckets.includes(b));
      expect(owners.length, `标签 ${b} 必须恰好归属一个项目组`).toBe(1);
    }
    for (const e of ENTRIES) expect(projectOf(e), `${e.date} 无项目归属`).not.toBeNull();
  });

  it('每条条目都能标出所属项目（左栏标记用 short，中英都得有）', () => {
    // 2026-07-29：条目左栏要标「属于哪个项目」。缺 short 的项目组会让那批条目
    // 只剩日期和标签，页面上看不出漏的是哪一组。
    for (const g of PROJECT_GROUPS) {
      expect(g.short.en.length, `${g.key} 缺英文短名`).toBeGreaterThan(0);
      expect(g.short.zh.length, `${g.key} 缺中文短名`).toBeGreaterThan(0);
    }
    for (const e of ENTRIES) {
      const g = projectGroupOf(e);
      expect(g, `${e.date} 取不到项目组`).not.toBeNull();
      expect(g!.key).toBe(projectOf(e));
    }
  });

  it('方面：覆盖全池（没打主题标签的条目落 Other，不掉出下钻路径）', () => {
    const facets = aspectFacets(ENTRIES);
    expect(facets.reduce((n, f) => n + f.count, 0)).toBe(ENTRIES.length);
    for (const f of facets) {
      expect(ENTRIES.filter((e) => aspectOf(e) === f.key).length, `方面 ${f.key}`).toBe(f.count);
    }
    const other = facets.find((f) => f.key === OTHER_ASPECT);
    if (other) expect(facets[facets.length - 1].key, 'Other 必须恒在最后').toBe(OTHER_ASPECT);
  });

  it('月份：覆盖全池、时间倒序（与条目列表同序）', () => {
    const facets = monthFacets(ENTRIES);
    expect(facets.reduce((n, f) => n + f.count, 0)).toBe(ENTRIES.length);
    const keys = facets.map((f) => f.key);
    expect(keys).toEqual([...keys].sort().reverse());
    expect(new Set(keys).size, '月份不得重复').toBe(keys.length);
  });

  it('三级交叉筛选：任意组合的结果都是全池的子集，且计数自洽', () => {
    for (const p of projectFacets(ENTRIES)) {
      const inProject = ENTRIES.filter((e) => projectOf(e) === p.key);
      // 项目内的方面/月份计数之和 = 该项目的条数（下钻不丢条目）
      expect(aspectFacets(inProject).reduce((n, f) => n + f.count, 0)).toBe(p.count);
      expect(monthFacets(inProject).reduce((n, f) => n + f.count, 0)).toBe(p.count);
    }
  });

  it('月份标签中英两份都在，且不依赖 Intl / 本地时区', () => {
    expect(monthLabel('2026-07')).toEqual({ en: 'July 2026', zh: '2026 年 7 月' });
    expect(monthLabel('2026-01').en).toBe('January 2026');
    for (const f of monthFacets(ENTRIES)) {
      expect(f.label.en.length).toBeGreaterThan(0);
      expect(f.label.zh.length).toBeGreaterThan(0);
    }
  });

  it('月份滚轴用的紧凑写法：每项都有，且比全称短（轨道里越短看见越多）', () => {
    expect(monthChip('2026-07')).toEqual({ en: 'Jul 2026', zh: '2026.07' });
    expect(monthChip('2025-12')).toEqual({ en: 'Dec 2025', zh: '2025.12' });
    for (const f of monthFacets(ENTRIES)) {
      expect(f.short, `${f.key} 缺紧凑写法`).toBeDefined();
      expect(f.short!.en.length).toBeLessThanOrEqual(f.label.en.length);
      expect(f.short!.zh.length).toBeLessThanOrEqual(f.label.zh.length);
    }
    // 只有月份用滚轴，另外两级不该带 short（带了说明谁被顺手改了形状）
    for (const f of [...projectFacets(ENTRIES), ...aspectFacets(ENTRIES)]) {
      expect(f.short).toBeUndefined();
    }
  });
});

describe('热力图', () => {
  const heat = buildHeatmap(ENTRIES);

  it('每列恒 7 格，且首列从周日起、末列到周六止', () => {
    for (const week of heat.weeks) expect(week.length).toBe(7);
    const days = heat.weeks.flat().filter((d) => d !== null);
    const first = days[0]!;
    const last = days[days.length - 1]!;
    // 值域两端就是池内首末条的日期（不铺满一年）
    const dates = ENTRIES.map((e) => e.date).sort();
    expect(first.date).toBe(dates[0]);
    expect(last.date).toBe(dates[dates.length - 1]);
    // 补位格只出现在首末两端：中间不得有空洞
    const flat = heat.weeks.flat();
    const firstReal = flat.findIndex((d) => d !== null);
    const lastReal = flat.length - 1 - [...flat].reverse().findIndex((d) => d !== null);
    expect(flat.slice(firstReal, lastReal + 1).every((d) => d !== null)).toBe(true);
  });

  it('格子上的条数之和 = 全池条数', () => {
    const total = heat.weeks.flat().reduce((n, d) => n + (d?.count ?? 0), 0);
    expect(total).toBe(ENTRIES.length);
    expect(heat.max).toBeGreaterThan(0);
  });

  it('每天的计数与条目一致，且日期与格子所在行（星期）对得上', () => {
    for (const day of heat.weeks.flat()) {
      if (day === null) continue;
      expect(ENTRIES.filter((e) => e.date === day.date).length).toBe(day.count);
    }
    for (const week of heat.weeks) {
      week.forEach((day, row) => {
        if (day === null) return;
        const [y, m, d] = day.date.split('-').map(Number);
        expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay(), `${day.date} 落错行`).toBe(row);
      });
    }
  });

  it('月份列标不重复、按周下标递增、不落在最后一列（会被截断）', () => {
    const idx = heat.months.map((m) => m.index);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(new Set(idx).size).toBe(idx.length);
    if (heat.months.length > 1) {
      expect(idx[idx.length - 1]).toBeLessThan(heat.weeks.length - 1);
    }
  });

  it('分级：0 条 = 0 级，最忙的一天 = 4 级，其余落在 1–4', () => {
    expect(heatLevel(0, heat.max)).toBe(0);
    expect(heatLevel(heat.max, heat.max)).toBe(4);
    for (let n = 1; n <= heat.max; n += 1) {
      const l = heatLevel(n, heat.max);
      expect(l).toBeGreaterThanOrEqual(1);
      expect(l).toBeLessThanOrEqual(4);
    }
  });

  it('空池不炸（内容池清空时页面不该崩）', () => {
    expect(buildHeatmap([])).toEqual({ weeks: [], months: [], max: 0 });
  });

  it('筛选只改深浅、不缩网格：值域另给时格数不变、计数只算筛后的', () => {
    const machine = ENTRIES.filter((e) => bucketOf(e) === 'Machine');
    const sub = buildHeatmap(machine, ENTRIES);
    expect(sub.weeks.length, '网格宽度必须与全池一致').toBe(heat.weeks.length);
    expect(sub.weeks.flat().reduce((n, d) => n + (d?.count ?? 0), 0)).toBe(machine.length);
    // 一条都不剩时网格照旧，只是全灭
    const none = buildHeatmap([], ENTRIES);
    expect(none.weeks.length).toBe(heat.weeks.length);
    expect(none.max).toBe(0);
  });
});
