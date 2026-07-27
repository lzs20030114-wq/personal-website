import { HomeScreens } from '../components/site/HomeScreens';
import { getSelectedWork } from '../src/lib/site/content';
import { getLogEntries } from '../src/lib/site/log';

/**
 * 主页 = Home-Screens 整屏分幕（design-ref/Home-Screens.dc.html，MAPPING §6）。
 * 服务端只取内容池数据，交互全部在 HomeScreens 客户端组件；
 * 本页不在 (site) 路由组内——无顶部导航，页脚长在 S2 幕。
 */
export default function Home() {
  const works = getSelectedWork().map((w) => ({
    title: w.title,
    slug: w.slug,
    date: w.date,
    published: w.status === 'published',
  }));
  // S2 幕的 Log 预览 = 池里最新三条（英文面）——不再硬编码，与 /archive 同源。
  // 只取 lead：改写成说明性文案后每条 lead 已是完整一句「做了什么」，正文太长塞不进预览行。
  const logs = getLogEntries()
    .slice(0, 3)
    .map((e) => ({ date: e.date, text: e.lead.en }));
  return <HomeScreens works={works} logs={logs} />;
}
