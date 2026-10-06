import type { Metadata } from 'next';
// MAPPING §2：自托管 Archivo（可变字重 100–900）——不引 Google Fonts @import。
import '@fontsource-variable/archivo';
import './globals.css';
import './page-transitions.css';
import { PageTransitions } from '../components/site/PageTransitions';

export const metadata: Metadata = {
  title: { default: 'Portfolio', template: '%s — Portfolio' },
  description: 'Selected work.',
};

// 导航/页脚在 (site) 路由组布局；主页（Home-Screens 整屏分幕）自带页脚、无顶部导航。
// 页面转场挂在根布局：首页不在 (site) 组里，只有这一层能同时看见所有页面之间的跳转（MAPPING §48）。
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PageTransitions />
        {children}
      </body>
    </html>
  );
}
