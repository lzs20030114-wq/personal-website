import { HomeScreens } from '../components/site/HomeScreens';
import { getSelectedWork } from '../src/lib/site/content';

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
  return <HomeScreens works={works} />;
}
