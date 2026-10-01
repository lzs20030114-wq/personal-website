import { HomeScroll } from '../components/site/home/HomeScroll';
import { getAllWork } from '../src/lib/site/content';
import { getLogEntries } from '../src/lib/site/log';
import { buildCards, buildHomeLog, buildLabGroups } from '../src/lib/site/home-model';

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
  const groups = buildLabGroups(cards);
  const log = buildHomeLog(getLogEntries());
  return <HomeScroll cards={cards} groups={groups} log={log} />;
}
