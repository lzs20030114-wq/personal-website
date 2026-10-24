import { HomeScroll } from '../components/site/home/HomeScroll';
import { getAllWork, getRoutableWork } from '../src/lib/site/content';
import { getLogEntries } from '../src/lib/site/log';
import { getOtherWorks } from '../src/lib/site/other-works';
import { buildCards, buildHomeField, buildHomeLog, buildLabGroups, buildWorkGroups } from '../src/lib/site/home-model';

/**
 * 主页 = 「07 Home · Scroll Zone」（design-ref/home-scroll-zone，MAPPING §42）。
 * 服务端只读内容池 / 台架目录 / 日志池并派生成可序列化 props，交互全部在 HomeScroll 客户端组件；
 * 本页不在 (site) 路由组内——无 SiteNav / SiteFooter，稿自带 HUD 与页脚。
 */
export default function Home() {
  const cards = buildCards(
    getAllWork().map((w) => ({
      slug: w.slug,
      title: w.title,
      date: w.date,
      summary: w.summary,
      role: w.role,
      published: w.status === 'published',
    })),
  );
  const entries = getLogEntries();
  const other = getOtherWorks();
  const work = buildWorkGroups(cards, other, entries);
  const groups = buildLabGroups(cards);
  const log = buildHomeLog(entries);
  // 所有公开作品、台架与日志自动入池；无专属图标的新内容使用语义回退，不依赖截图目录。
  const field = buildHomeField(
    cards,
    getRoutableWork().map((w) => ({
      slug: w.slug,
      title: w.title,
      date: w.date,
      summary: w.summary,
      role: w.role,
      published: w.status === 'published',
      selected: w.selected,
      cover: w.cover,
    })),
    entries,
    other,
  );
  return <HomeScroll work={work} groups={groups} log={log} field={field} />;
}
