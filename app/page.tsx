import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HomeScroll } from '../components/site/home/HomeScroll';
import { getAllWork, getRoutableWork } from '../src/lib/site/content';
import { getLogEntries } from '../src/lib/site/log';
import { buildCards, buildHomeField, buildHomeLog, buildLabGroups } from '../src/lib/site/home-model';

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
  const entries = getLogEntries();
  const log = buildHomeLog(entries);
  // 首屏方块场：作品 / 台架 / 日志全部现取；台架截图看目录里实际有哪些（新台架没截图就显示编号）
  const shots = new Set(readdirSync(join(process.cwd(), 'public', 'home', 'field')).map((f) => `/home/field/${f}`));
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
    shots,
  );
  return <HomeScroll cards={cards} groups={groups} log={log} field={field} />;
}
